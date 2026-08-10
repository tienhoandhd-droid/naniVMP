import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Download, Search, Save, Upload } from "lucide-react";
import { DEPTS } from "../../constants/vmp.ts";
import {
  fetchPermissionPreflight,
  importPermissionRows,
  savePermissionPerson,
  searchPermissionDirectory,
} from "./api.ts";
import { ACCESS_CLASSES, type AccessClass, type DirectoryPerson } from "./types.ts";
import {
  parsePermissionWorkbook,
  type ParsedPermissionRow,
  type PermissionWorkbookError,
} from "./permissionWorkbook.ts";

interface StaffDirectoryPanelProps {
  canEdit: boolean;
  validAreas?: readonly string[];
  onSelect: (person: DirectoryPerson | null) => void;
}

const emptyForm = {
  employeeCode: "",
  fullName: "",
  department: "",
  email: "",
  accessClass: "view_only" as AccessClass,
  scope: "",
  areas: "",
  emailSent: false,
};

function splitList(value: string): string[] {
  return [...new Set(value.split(/[;,]/).map((item) => item.trim()).filter(Boolean))];
}

function departmentLabel(id: string): string {
  return DEPTS.find((department) => department.id === id)?.short || id.toUpperCase();
}

export default function StaffDirectoryPanel({ canEdit, validAreas = [], onSelect }: StaffDirectoryPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryPerson[]>([]);
  const [selected, setSelected] = useState<DirectoryPerson | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [mode, setMode] = useState<"preview" | "enforced">("preview");
  const [blocking, setBlocking] = useState(0);
  const [warnings, setWarnings] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [importRows, setImportRows] = useState<ParsedPermissionRow[]>([]);
  const [importErrors, setImportErrors] = useState<PermissionWorkbookError[]>([]);
  const [importReason, setImportReason] = useState("");
  const [importing, setImporting] = useState(false);
  const requestSequence = useRef(0);

  useEffect(() => {
    fetchPermissionPreflight().then((preflight) => {
      setMode(preflight.mode);
      setBlocking(preflight.blocking_errors.length);
      setWarnings(preflight.warnings.length);
    }).catch(() => {
      // Quản lý bộ phận được xem danh bạ nhưng chỉ Admin được chạy tiền kiểm.
    });
  }, []);

  useEffect(() => {
    if (selected && query === selected.full_name) {
      setResults([]);
      return;
    }
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const sequence = ++requestSequence.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const people = await searchPermissionDirectory(query);
        if (sequence === requestSequence.current) setResults(people);
      } catch (error) {
        if (sequence === requestSequence.current) setMessage((error as Error).message);
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    }, query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [query, selected]);

  const choose = (person: DirectoryPerson) => {
    setSelected(person);
    setQuery(person.full_name);
    setResults([]);
    setForm({
      employeeCode: person.employee_code || "",
      fullName: person.full_name,
      department: person.department,
      email: person.email || "",
      accessClass: person.access_class || "view_only",
      scope: person.scope_departments.join(";"),
      areas: person.access_areas.join(";"),
      emailSent: person.email_sent_confirmed,
    });
    setMessage("");
    onSelect(person);
  };

  const save = async () => {
    if (!canEdit) return;
    setSaving(true);
    setMessage("");
    try {
      await savePermissionPerson(selected?.person_id || null, {
        employee_code: form.employeeCode.trim() || null,
        full_name: form.fullName.trim(),
        department: form.department,
        email: form.email.trim() || null,
        access_class: form.accessClass,
        scope_departments: splitList(form.scope),
        access_areas: splitList(form.areas),
        email_sent_confirmed: form.emailSent,
        is_active: true,
      }, `Cập nhật danh bạ nhân sự & quyền cho ${form.fullName.trim()}`);
      setMessage("Đã lưu hồ sơ danh bạ");
      const refreshed = await searchPermissionDirectory(form.fullName.trim());
      const saved = refreshed.find((person) => person.person_id === selected?.person_id) || refreshed[0];
      if (saved) choose(saved);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const setField = (key: keyof typeof form) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => setForm((current) => ({
    ...current,
    [key]: event.target instanceof HTMLInputElement && event.target.type === "checkbox"
      ? event.target.checked
      : event.target.value,
  }));

  const readWorkbook = async (file: File | undefined) => {
    setImportRows([]);
    setImportErrors([]);
    if (!file) return;
    try {
      const parsed = await parsePermissionWorkbook(file, { validAreas });
      setImportRows(parsed.rows);
      setImportErrors(parsed.errors);
      setMessage(parsed.errors.length
        ? `File có ${parsed.errors.length} lỗi; chưa gửi dòng nào lên hệ thống.`
        : `Đã kiểm tra ${parsed.rows.length} dòng hợp lệ. Chưa nhập vào hệ thống.`);
    } catch (error) {
      setMessage(`Không đọc được file: ${(error as Error).message}`);
    }
  };

  const importPreview = async () => {
    if (!importRows.length || importErrors.length || !importReason.trim()) return;
    setImporting(true);
    try {
      await importPermissionRows(importRows, importReason.trim());
      setMessage(`Đã nhập ${importRows.length} dòng danh bạ. Quyền vẫn ở chế độ preview.`);
      setImportRows([]);
      setImportErrors([]);
      setImportReason("");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="ip-panel" aria-labelledby="ip-directory-title">
      <div className={`ip-mode ${mode === "preview" ? "is-preview" : "is-enforced"}`} role="status">
        {mode === "preview" ? <AlertTriangle size={18} /> : <Check size={18} />}
        <div>
          <b>{mode === "preview" ? "DỰ THẢO — CHƯA ÁP DỤNG QUYỀN THẬT" : "ĐANG ÁP DỤNG QUYỀN THEO HẠNG MỤC"}</b>
          <span>{blocking} lỗi bắt buộc · {warnings} cảnh báo. Admin phải chủ động bật sau khi tiền kiểm đạt.</span>
        </div>
      </div>

      <h3 id="ip-directory-title">Danh bạ chuẩn</h3>
      <p className="ip-help">Tìm theo họ tên, email hoặc mã nhân viên. Chọn đúng một người để bộ phận, tài khoản và quyền tự điền.</p>

      <div className="ip-search">
        <Search size={17} aria-hidden="true" />
        <input
          className="pq-o"
          role="combobox"
          aria-label="Tìm tên hoặc tài khoản"
          aria-expanded={results.length > 0}
          aria-controls="ip-directory-results"
          placeholder="Nhập tên, email hoặc mã nhân viên…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(null);
            setForm({ ...emptyForm, fullName: event.target.value });
            onSelect(null);
          }}
        />
        {loading && <span className="ip-muted">Đang tìm…</span>}
        {results.length > 0 && (
          <div id="ip-directory-results" className="ip-results" role="listbox">
            {results.map((person) => (
              <button key={person.person_id} type="button" role="option" onClick={() => choose(person)}>
                <b>{person.full_name} · {departmentLabel(person.department)}</b>
                <span>{person.email || "chưa có email"} · {person.employee_code || "chưa có mã NV"}</span>
                {person.match_status === "ambiguous" && <em>Trùng tên — cần nối tay</em>}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="ip-badges" aria-label="Trạng thái tài khoản">
          <span className={`ip-badge is-${selected.account_status}`}>
            {selected.account_status === "linked" ? "Đã nối tài khoản"
              : selected.account_status === "inactive" ? "Tài khoản đã khóa" : "Chưa có tài khoản"}
          </span>
          {selected.match_status === "ambiguous" && <span className="ip-badge is-warning">Trùng tên — cần nối tay</span>}
          <span className="ip-badge">Khóa người: {selected.person_id}</span>
        </div>
      )}

      <div className="ip-form">
        <label>Họ và tên<input className="pq-o" aria-label="Họ và tên trong danh bạ" value={form.fullName} onChange={setField("fullName")} disabled={!canEdit} /></label>
        <label>Mã nhân viên<input className="pq-o" aria-label="Mã nhân viên trong danh bạ" value={form.employeeCode} onChange={setField("employeeCode")} disabled={!canEdit} placeholder="Có thể bổ sung sau" /></label>
        <label>Bộ phận
          <select className="pq-o" aria-label="Bộ phận trong danh bạ" value={form.department} onChange={setField("department")} disabled={!canEdit}>
            <option value="">— chọn bộ phận —</option>
            {DEPTS.map((department) => <option key={department.id} value={department.id}>{department.short} · {department.name}</option>)}
          </select>
        </label>
        <label>Email tài khoản<input className="pq-o" type="email" aria-label="Email trong danh bạ" value={form.email} onChange={setField("email")} disabled={!canEdit} /></label>
        <label>Phân loại
          <select className="pq-o" aria-label="Phân loại quyền" value={form.accessClass} onChange={setField("accessClass")} disabled={!canEdit}>
            {ACCESS_CLASSES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>Phạm vi bộ phận<input className="pq-o" aria-label="Phạm vi phân quyền" value={form.scope} onChange={setField("scope")} disabled={!canEdit} placeholder="QA;QC hoặc *" /></label>
        <label>Khu vực / line<input className="pq-o" aria-label="Khu vực phân quyền" value={form.areas} onChange={setField("areas")} disabled={!canEdit} placeholder="A1;A2 hoặc *" /></label>
        <label className="ip-check"><input type="checkbox" checked={form.emailSent} onChange={setField("emailSent")} disabled={!canEdit} /> Đã xác nhận gửi email tài khoản</label>
      </div>

      {canEdit && (
        <button type="button" className="pq-nut la-chinh" onClick={save}
          disabled={saving || !form.fullName.trim() || !form.department || !form.scope || !form.areas}>
          <Save size={15} /> {saving ? "Đang lưu…" : selected ? "Lưu hồ sơ" : "Thêm vào danh bạ"}
        </button>
      )}
      {message && <div className="ip-message" role="status">{message}</div>}

      <div className="ip-import">
        <div>
          <h4>Nhập danh bạ bằng Excel</h4>
          <p className="ip-help">Tải file 9 cột, điền rồi chọn lại tại đây. Web kiểm toàn bộ file trước; có một dòng lỗi thì không gọi RPC nhập.</p>
        </div>
        <div className="ip-import-actions">
          <a className="pq-nut" href={`${import.meta.env.BASE_URL}templates/phan-quyen-vmp.xlsx`} download>
            <Download size={15} /> Tải file Excel mẫu
          </a>
          {canEdit && (
            <label className="pq-nut">
              <Upload size={15} /> Chọn file đã điền
              <input type="file" accept=".xlsx" hidden onChange={(event) => void readWorkbook(event.target.files?.[0])} />
            </label>
          )}
        </div>
        {importErrors.length > 0 && (
          <div className="ip-import-errors" role="alert">
            <b>{importErrors.length} lỗi cần sửa:</b>
            <ul>{importErrors.slice(0, 12).map((error, index) => <li key={`${error.rowNumber}-${index}`}>Dòng {error.rowNumber}: {error.message}</li>)}</ul>
            {importErrors.length > 12 && <span>… và {importErrors.length - 12} lỗi khác.</span>}
          </div>
        )}
        {importRows.length > 0 && !importErrors.length && (
          <div className="ip-import-preview">
            <b>Xem trước {importRows.length} dòng hợp lệ — chưa nhập</b>
            {importRows.slice(0, 5).map((row) => (
              <span key={row.row_number}>Dòng {row.row_number}: {row.full_name} · {row.department.toUpperCase()} · {row.access_class}</span>
            ))}
            <input className="pq-o" aria-label="Lý do nhập danh bạ" placeholder="Lý do nhập file (bắt buộc)" value={importReason} onChange={(event) => setImportReason(event.target.value)} />
            <button type="button" className="pq-nut la-chinh" disabled={importing || !importReason.trim()} onClick={importPreview}>
              <Upload size={15} /> {importing ? "Đang nhập…" : `Nhập ${importRows.length} dòng ở chế độ preview`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

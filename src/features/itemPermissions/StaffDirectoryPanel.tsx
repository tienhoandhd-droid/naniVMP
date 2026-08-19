import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Download, FileSpreadsheet, Search, Save, Upload } from "lucide-react";
import { DEPTS } from "../../constants/vmp.ts";
import { xuatExcelAoa } from "../../lib/xuatExcel.ts";
import {
  fetchPermissionPreflight,
  fetchScopeCatalog,
  importPermissionRows,
  savePermissionPerson,
  searchPermissionDirectory,
} from "./api.ts";
import {
  ACCESS_CLASSES,
  NHAN_PHAN_LOAI_CU,
  findDirectoryPersonById,
  isDirectoryPersonComplete,
  isQaAccessClass,
  requiresHierarchyScope,
  type AccessClass,
  type DirectoryPerson,
} from "./types.ts";
import {
  parsePermissionWorkbook,
  type ParsedPermissionRow,
  type PermissionWorkbookError,
} from "./permissionWorkbook.ts";
import LinkedMultiSelect from "./LinkedMultiSelect.tsx";
import {
  filterScopeCatalog,
  pruneInvalidScope,
  type ScopeCatalog,
  type ScopeSelection,
} from "./scopeHierarchy.ts";

interface StaffDirectoryPanelProps {
  canEdit: boolean;
  validAreas?: readonly string[];
  onSelect: (person: DirectoryPerson | null) => void;
  revision?: number;
  refreshPersonId?: string | null;
}

const emptyForm = {
  employeeCode: "",
  fullName: "",
  department: "",
  email: "",
  accessClass: null as AccessClass | null,
  scope: { departments: [], factories: [], areas: [], lines: [] } as ScopeSelection,
  emailSent: false,
};

const emptyCatalog: ScopeCatalog = { departments: [], factories: [], areas: [], lines: [] };

function departmentLabel(id: string | null): string {
  if (!id) return "chưa có bộ phận";
  return DEPTS.find((department) => department.id === id)?.short || id.toUpperCase();
}

export async function reloadSelectedDirectoryPerson<T extends Pick<DirectoryPerson, "person_id" | "full_name">>(
  selected: T,
  search: (query: string) => Promise<T[]>,
): Promise<T | null> {
  const people = await search(selected.full_name);
  return findDirectoryPersonById(people, selected.person_id);
}

export async function reloadDirectoryMutationTarget<T extends Pick<DirectoryPerson, "person_id" | "full_name">>({
  targetPersonId,
  getCurrentSelectedPersonId,
  knownPeople,
  search,
}: {
  targetPersonId: string;
  getCurrentSelectedPersonId: () => string | null;
  knownPeople: ReadonlyMap<string, T>;
  search: (query: string) => Promise<T[]>;
}): Promise<{ person: T | null; shouldSelect: boolean }> {
  const target = knownPeople.get(targetPersonId);
  if (!target) return { person: null, shouldSelect: false };
  const person = await reloadSelectedDirectoryPerson(target, search);
  return {
    person,
    shouldSelect: person !== null && getCurrentSelectedPersonId() === targetPersonId,
  };
}

export async function completeDirectorySaveWhenCurrent<T extends Pick<DirectoryPerson, "person_id" | "full_name">>({
  targetPersonId,
  savedPersonId,
  submittedFullName,
  getCurrentSelectedPersonId,
  knownPeople,
  search,
  onSelect,
}: {
  targetPersonId: string | null;
  savedPersonId: string;
  submittedFullName: string;
  getCurrentSelectedPersonId: () => string | null;
  knownPeople: Map<string, T>;
  search: (query: string) => Promise<T[]>;
  onSelect: (person: T) => void;
}): Promise<{ outcome: "selected" | "stale" | "missing"; person: T | null }> {
  const people = await search(submittedFullName);
  const person = findDirectoryPersonById(people, savedPersonId);
  if (!person) return { outcome: "missing", person: null };
  knownPeople.set(person.person_id, person);
  if (getCurrentSelectedPersonId() !== targetPersonId) return { outcome: "stale", person };
  onSelect(person);
  return { outcome: "selected", person };
}

export default function StaffDirectoryPanel({
  canEdit,
  onSelect,
  revision = 0,
  refreshPersonId = null,
}: StaffDirectoryPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryPerson[]>([]);
  const [selected, setSelected] = useState<DirectoryPerson | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [savedForm, setSavedForm] = useState(emptyForm);
  const [catalog, setCatalog] = useState<ScopeCatalog>(emptyCatalog);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [catalogReload, setCatalogReload] = useState(0);
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
  const [exporting, setExporting] = useState(false);
  const requestSequence = useRef(0);
  const lastDirectoryRevision = useRef(revision);
  const knownPeople = useRef(new Map<string, DirectoryPerson>());
  const currentSelectedPersonId = useRef<string | null>(null);
  const catalogRef = useRef<ScopeCatalog>(emptyCatalog);
  const catalogLoaded = useRef(false);
  const catalogRequest = useRef<Promise<ScopeCatalog> | null>(null);
  currentSelectedPersonId.current = selected?.person_id ?? null;

  const loadScopeCatalog = async (): Promise<ScopeCatalog> => {
    if (catalogLoaded.current) return catalogRef.current;
    if (catalogRequest.current) return catalogRequest.current;
    setCatalogLoading(true);
    const request = fetchScopeCatalog().then((nextCatalog) => {
      catalogRef.current = nextCatalog;
      catalogLoaded.current = true;
      setCatalog(nextCatalog);
      setCatalogError("");
      return nextCatalog;
    }).catch((error) => {
      setCatalogError((error as Error).message);
      throw error;
    }).finally(() => {
      catalogRequest.current = null;
      setCatalogLoading(false);
    });
    catalogRequest.current = request;
    return request;
  };

  useEffect(() => {
    if (!requiresHierarchyScope(form.accessClass)) return;
    void loadScopeCatalog().catch(() => undefined);
  }, [catalogReload, form.accessClass]);

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
    /* Ô rỗng KHÔNG có nghĩa "chưa gõ gì thì đừng tìm" — server
       (rpc_item_permission_directory) đã sẵn nhánh trả về TOÀN BỘ người
       trong phạm vi được xem khi p_query rỗng (v_query = ''). Trước đây ô
       rỗng bị chặn ở đây cùng với ô 1 ký tự, nên mở màn Nhân sự lên là một
       ô tìm trống trơn và một biểu mẫu rỗng — không có gì gợi ý "đã có sẵn
       những ai". Chỉ còn chặn đúng 1 ký tự (quá ngắn, khớp lan man). */
    if (query.trim().length === 1) {
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
    knownPeople.current.set(person.person_id, person);
    setSelected(person);
    setQuery(person.full_name);
    setResults([]);
    const nextForm = {
      employeeCode: person.employee_code || "",
      fullName: person.full_name,
      department: person.department || "",
      email: person.email || "",
      accessClass: person.access_class,
      scope: isQaAccessClass(person.access_class)
        ? { departments: [], factories: [], areas: [], lines: [] }
        : {
          departments: person.scope_departments,
          factories: person.scope_factory_ids,
          areas: person.scope_area_ids,
          lines: person.scope_line_ids,
        },
      emailSent: person.email_sent_confirmed,
    };
    setForm(nextForm);
    setSavedForm(nextForm);
    setMessage("");
    onSelect(person);
  };

  useEffect(() => {
    if (revision === lastDirectoryRevision.current) return;
    lastDirectoryRevision.current = revision;
    if (!refreshPersonId) return;
    let active = true;
    reloadDirectoryMutationTarget({
      targetPersonId: refreshPersonId,
      getCurrentSelectedPersonId: () => currentSelectedPersonId.current,
      knownPeople: knownPeople.current,
      search: searchPermissionDirectory,
    }).then(({ person, shouldSelect }) => {
      if (!active) return;
      if (person) {
        knownPeople.current.set(person.person_id, person);
        if (shouldSelect) choose(person);
      } else if (currentSelectedPersonId.current === refreshPersonId) {
        setMessage(`Đã thay đổi liên kết nhưng chưa tìm thấy lại hồ sơ ${refreshPersonId}. Hãy tải lại danh bạ.`);
      }
    }).catch((error) => {
      if (active && currentSelectedPersonId.current === refreshPersonId) {
        setMessage(`Đã thay đổi liên kết nhưng chưa tải lại được: ${(error as Error).message}`);
      }
    });
    return () => { active = false; };
  }, [revision, refreshPersonId]);

  const save = async () => {
    if (!canEdit || !form.accessClass) return;
    const targetPersonId = selected?.person_id ?? null;
    const submittedFullName = form.fullName.trim();
    setSaving(true);
    setMessage("");
    try {
      const savedResult = await savePermissionPerson(targetPersonId, {
        employee_code: form.employeeCode.trim() || null,
        full_name: form.fullName.trim(),
        department: form.department,
        email: form.email.trim() || null,
        access_class: form.accessClass,
        scope_departments: form.scope.departments,
        scope_factory_ids: form.scope.factories,
        scope_area_ids: form.scope.areas,
        scope_line_ids: form.scope.lines,
        email_sent_confirmed: form.emailSent,
        is_active: true,
      }, `Cập nhật danh bạ nhân sự & quyền cho ${submittedFullName}`, selected?.version ?? null);
      let completion: { outcome: "selected" | "stale" | "missing"; person: DirectoryPerson | null };
      try {
        completion = await completeDirectorySaveWhenCurrent({
          targetPersonId,
          savedPersonId: savedResult.person_id,
          submittedFullName,
          getCurrentSelectedPersonId: () => currentSelectedPersonId.current,
          knownPeople: knownPeople.current,
          search: searchPermissionDirectory,
          onSelect: choose,
        });
      } catch (error) {
        if (currentSelectedPersonId.current === targetPersonId) {
          setMessage(`Đã lưu hồ sơ nhưng chưa tải lại được: ${(error as Error).message}`);
        }
        return;
      }
      if (completion.outcome === "missing" && currentSelectedPersonId.current === targetPersonId) {
        setMessage(`Đã lưu hồ sơ nhưng chưa tìm thấy bản mới ${savedResult.person_id}. Hãy tải lại danh bạ.`);
        return;
      }
      if (completion.outcome === "selected") setMessage("Đã lưu hồ sơ danh bạ");
    } catch (error) {
      if (currentSelectedPersonId.current === targetPersonId) setMessage((error as Error).message);
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

  const changeAccessClass = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const accessClass = event.target.value ? event.target.value as AccessClass : null;
    setForm((current) => {
      const hasScope = Object.values(current.scope).some((values) => values.length > 0);
      if (isQaAccessClass(accessClass) && hasScope && !window.confirm(
        "Đổi sang phân loại QA sẽ xóa bốn tầng phạm vi hiện có. Tiếp tục?",
      )) return current;
      return {
        ...current,
        accessClass,
        scope: isQaAccessClass(accessClass)
          ? { departments: [], factories: [], areas: [], lines: [] }
          : current.scope,
      };
    });
  };

  const changeScope = (scopeKey: keyof ScopeSelection, values: string[]) => {
    const candidate = { ...form.scope, [scopeKey]: values };
    const pruned = pruneInvalidScope(catalog, candidate);
    const removed: string[] = [];
    for (const [key, options] of [
      ["departments", catalog.departments], ["factories", catalog.factories],
      ["areas", catalog.areas], ["lines", catalog.lines],
    ] as const) {
      for (const id of candidate[key]) {
        if (!pruned[key].includes(id)) {
          const option = options.find((item) => item.id === id);
          removed.push(option ? `${option.code} · ${option.label}` : id);
        }
      }
    }
    if (removed.length && !window.confirm(
      `Thay đổi này sẽ bỏ ${removed.length} lựa chọn con không còn hợp lệ:\n${removed.join("\n")}`,
    )) return;
    setForm((current) => ({ ...current, scope: pruned }));
  };

  const filteredCatalog = filterScopeCatalog(catalog, form.scope);
  const isQa = isQaAccessClass(form.accessClass);
  const needsScope = requiresHierarchyScope(form.accessClass);
  const catalogReason = !needsScope ? "" : catalogLoading ? "Đang tải danh mục phạm vi…"
    : catalogError ? "Không tải được danh mục phạm vi. Hãy thử lại."
      : "";
  const editReason = canEdit ? "" : "Bạn không có quyền sửa hồ sơ này.";
  const scopeIsValid = !needsScope
    || JSON.stringify(pruneInvalidScope(catalog, form.scope)) === JSON.stringify(form.scope);
  const allScopeLevelsSelected = form.scope.departments.length > 0 && form.scope.factories.length > 0
    && form.scope.areas.length > 0 && form.scope.lines.length > 0;
  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  const readWorkbook = async (file: File | undefined) => {
    setImportRows([]);
    setImportErrors([]);
    if (!file) return;
    try {
      let parsed = await parsePermissionWorkbook(file, { scopeCatalog: catalogRef.current });
      const hasUnresolvedScope = parsed.errors.some((error) => error.message === "Mã phạm vi không tồn tại"
        || error.message === "Quan hệ phạm vi không hợp lệ");
      if (!catalogLoaded.current && hasUnresolvedScope) {
        parsed = await parsePermissionWorkbook(file, { scopeCatalog: await loadScopeCatalog() });
      }
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

  /* Xuất toàn bộ danh bạ trong phạm vi quyền của người đang xem — gọi
     searchPermissionDirectory("") (chuỗi rỗng không lọc theo tên/email/mã)
     chứ không lấy `results` đang hiện, vì ô tìm chỉ hiện kết quả khi đã gõ
     ít nhất 2 ký tự. RPC vẫn giới hạn theo person.is_active và theo bộ phận
     nếu người xem là Quản lý QA/quản lý xưởng — không phải "toàn hệ thống". */
  const exportDirectory = async () => {
    setExporting(true);
    setMessage("");
    try {
      const [people, scopeCatalog] = await Promise.all([
        searchPermissionDirectory(""),
        loadScopeCatalog(),
      ]);
      const factoryLabel = new Map(scopeCatalog.factories.map((item) => [item.id, `${item.code} · ${item.label}`]));
      const areaLabel = new Map(scopeCatalog.areas.map((item) => [item.id, `${item.code} · ${item.label}`]));
      const lineLabel = new Map(scopeCatalog.lines.map((item) => [item.id, `${item.code} · ${item.label}`]));
      const accessClassLabel = (value: AccessClass | null) =>
        ACCESS_CLASSES.find((item) => item.id === value)?.label || value || "";
      const accountStatusLabel = (person: DirectoryPerson) =>
        person.account_status === "linked" ? "Đã nối tài khoản"
          : person.account_status === "inactive" ? "Tài khoản đã khóa" : "Chưa có tài khoản";
      const header = [
        "Họ và tên", "Mã nhân viên", "Bộ phận", "Email", "Trạng thái tài khoản",
        "Phân loại quyền", "Phạm vi bộ phận", "Phạm vi xưởng", "Phạm vi khu vực",
        "Phạm vi line", "Đang làm việc",
      ];
      const rows = people.map((person) => [
        person.full_name,
        person.employee_code || "",
        departmentLabel(person.department),
        person.email || "",
        accountStatusLabel(person),
        accessClassLabel(person.access_class),
        person.scope_departments.map((id) => departmentLabel(id)).join(", "),
        person.scope_factory_ids.map((id) => factoryLabel.get(id) || id).join(", "),
        person.scope_area_ids.map((id) => areaLabel.get(id) || id).join(", "),
        person.scope_line_ids.map((id) => lineLabel.get(id) || id).join(", "),
        person.is_active ? "Có" : "Không",
      ]);
      await xuatExcelAoa(
        [{ ten: "Danh bạ", dong: [header, ...rows] }],
        `VMP_danh-ba-nhan-su_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      setMessage(`Đã xuất ${people.length} người trong phạm vi bạn được xem (chỉ người đang hoạt động).`);
    } catch (error) {
      setMessage(`Không xuất được danh bạ: ${(error as Error).message}`);
    } finally {
      setExporting(false);
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

      <h2 id="ip-directory-title">Danh bạ chuẩn</h2>
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
            const nextForm = { ...emptyForm, scope: { ...emptyForm.scope }, fullName: event.target.value };
            setForm(nextForm);
            setSavedForm(emptyForm);
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
                {/* Hồ sơ tự tạo khi có tài khoản mới (migration 20260819090000)
                    rỗng department/access_class/scope — đánh dấu ngay ở dòng
                    kết quả tìm kiếm, đừng bắt Admin bấm chọn từng người mới
                    biết ai đang thiếu. */}
                {!isDirectoryPersonComplete(person) && <em>Hồ sơ chưa đủ — cần bổ sung</em>}
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
          {isQaAccessClass(selected.access_class) && (
            <span className="ip-badge is-warning">{selected.user_id
              ? "Quyền phát sinh từ phân công hạng mục"
              : "Chưa nối tài khoản — có thể chuẩn bị phân công nhưng chưa cấp quyền"}</span>
          )}
          {!isDirectoryPersonComplete(selected) && (
            <span className="ip-badge is-warning">Hồ sơ chưa đủ — cần bổ sung bộ phận, phân loại, phạm vi và khu vực</span>
          )}
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
          <select className="pq-o" aria-label="Phân loại quyền" value={form.accessClass || ""} onChange={changeAccessClass} disabled={!canEdit}>
            <option value="">— chọn phân loại —</option>
            {ACCESS_CLASSES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            {/* Bản ghi cũ mang phân loại đã ngừng dùng vẫn phải hiện đúng giá
                trị của nó. Không có dòng này thì mở hồ sơ ra là ô nhảy về
                rỗng, và một cú bấm Lưu ghi đè mất phân loại đang có. */}
            {form.accessClass && !ACCESS_CLASSES.some((item) => item.id === form.accessClass) && (
              <option value={form.accessClass}>
                {NHAN_PHAN_LOAI_CU[form.accessClass] ?? form.accessClass}
              </option>
            )}
          </select>
        </label>
        {needsScope && <>
        <LinkedMultiSelect
          label="Phạm vi bộ phận"
          options={catalog.departments}
          selected={form.scope.departments}
          disabledReason={editReason || catalogReason || (!catalog.departments.length ? "Chưa có dữ liệu bộ phận trong danh mục." : "")}
          onChange={(values) => changeScope("departments", values)}
        />
        <LinkedMultiSelect
          label="Phạm vi xưởng"
          options={filteredCatalog.factories}
          selected={form.scope.factories}
          disabledReason={editReason || catalogReason
            || (!catalog.factories.length ? "Chưa có dữ liệu xưởng trong danh mục; vui lòng bổ sung danh mục xưởng trước."
              : !form.scope.departments.length ? "Chọn ít nhất một bộ phận trước."
                : !filteredCatalog.factories.length ? "Chưa có dữ liệu xưởng cho bộ phận đã chọn." : "")}
          onChange={(values) => changeScope("factories", values)}
        />
        <LinkedMultiSelect
          label="Phạm vi khu vực"
          options={filteredCatalog.areas}
          selected={form.scope.areas}
          disabledReason={editReason || catalogReason
            || (!form.scope.factories.length ? "Chọn ít nhất một xưởng trước."
              : !filteredCatalog.areas.length ? "Chưa có dữ liệu khu vực cho xưởng đã chọn." : "")}
          onChange={(values) => changeScope("areas", values)}
        />
        <LinkedMultiSelect
          label="Phạm vi line"
          options={filteredCatalog.lines}
          selected={form.scope.lines}
          disabledReason={editReason || catalogReason
            || (!form.scope.areas.length ? "Chọn ít nhất một khu vực trước."
              : !filteredCatalog.lines.length ? "Chưa có dữ liệu line cho khu vực đã chọn." : "")}
          onChange={(values) => changeScope("lines", values)}
        />
        </>}
        <label className="ip-check"><input type="checkbox" checked={form.emailSent} onChange={setField("emailSent")} disabled={!canEdit} /> Đã xác nhận gửi email tài khoản</label>
      </div>

      {canEdit && (
        <button type="button" className="pq-nut la-chinh" data-testid="save-permission-person" onClick={save}
          disabled={saving || !dirty || !form.fullName.trim() || !form.department || !form.accessClass
            || (isQa && form.department !== "qa")
            || (needsScope && (!allScopeLevelsSelected || !scopeIsValid))}>
          <Save size={15} /> {saving ? "Đang lưu…" : selected ? `Lưu hồ sơ${dirty ? " · chưa lưu" : ""}` : "Thêm vào danh bạ"}
        </button>
      )}
      {needsScope && catalogError && (
        <button type="button" className="pq-nut" onClick={() => setCatalogReload((value) => value + 1)}>
          Thử tải lại danh mục phạm vi
        </button>
      )}
      {message && <div className="ip-message" role="status">{message}</div>}

      <div className="ip-import">
        <div>
          <h3>Nhập / xuất danh bạ bằng Excel</h3>
          <p className="ip-help">Tải file 11 cột, điền mã cho đủ bốn tầng phạm vi rồi chọn lại tại đây. Web kiểm toàn bộ file trước; có một dòng lỗi thì không gọi RPC nhập. Nút xuất lấy toàn bộ người đang hoạt động trong phạm vi bạn được xem (không chỉ những dòng đang hiện trong ô tìm), không phải toàn hệ thống nếu bạn không phải Admin.</p>
        </div>
        <div className="ip-import-actions">
          <a className="pq-nut" href={`${import.meta.env.BASE_URL}templates/phan-quyen-vmp.xlsx`} download>
            <Download size={15} /> Tải file Excel mẫu
          </a>
          <button type="button" className="pq-nut" onClick={() => void exportDirectory()} disabled={exporting}>
            <FileSpreadsheet size={15} /> {exporting ? "Đang xuất…" : "Xuất danh bạ Excel"}
          </button>
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

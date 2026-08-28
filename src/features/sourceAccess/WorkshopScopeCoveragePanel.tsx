import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { btnPrimary, cardDefault, C, INP, TEXT } from "../../constants/theme.ts";
import { listSourceWorkshopScopeChoices, setSourceWorkshopScopeGrant } from "./api.ts";
import { normalizeWorkshopScopeDraft, type SourceWorkshopCoveragePerson, type SourceWorkshopScopeChoice, type SourceWorkshopScopeChoicesCursor, type WorkshopScopeGrant } from "./contracts.ts";
import { useSourceWorkshopCoverage } from "./useSourceWorkshopCoverage.ts";
import { applyOptimisticWorkshopScopeGrant } from "./workshopScopeModel.ts";

type ChoicesState =
  | { status: "loading"; rows: SourceWorkshopScopeChoice[]; nextCursor: SourceWorkshopScopeChoicesCursor | null; error: null }
  | { status: "ready"; rows: SourceWorkshopScopeChoice[]; nextCursor: SourceWorkshopScopeChoicesCursor | null; error: null }
  | { status: "error"; rows: SourceWorkshopScopeChoice[]; nextCursor: SourceWorkshopScopeChoicesCursor | null; error: string };

const EMPTY_CHOICES: ChoicesState = { status: "loading", rows: [], nextCursor: null, error: null };

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "vi"));
}

function mergeChoices(current: readonly SourceWorkshopScopeChoice[], next: readonly SourceWorkshopScopeChoice[]): SourceWorkshopScopeChoice[] {
  const byTuple = new Map(current.map((choice) => [`${choice.department}\u0000${choice.areaCode}\u0000${choice.line ?? ""}`, choice]));
  next.forEach((choice) => byTuple.set(`${choice.department}\u0000${choice.areaCode}\u0000${choice.line ?? ""}`, choice));
  return [...byTuple.values()];
}

function optimisticGrant({
  current, response, personId, department, areaCode, line, reason,
}: {
  current: WorkshopScopeGrant | null;
  response: { grantId: string; version: number; isActive: boolean };
  personId: string;
  department: string;
  areaCode: string;
  line: string | null;
  reason: string;
}): WorkshopScopeGrant {
  const now = new Date().toISOString();
  return {
    id: response.grantId, performerId: personId, department, departmentKey: department.toLocaleLowerCase("vi"),
    areaCode, areaKey: areaCode.toLocaleLowerCase("vi"), line, lineKey: line?.toLocaleLowerCase("vi") ?? null,
    validFrom: current?.validFrom ?? now, expiresAt: current?.expiresAt ?? null,
    isActive: response.isActive, version: response.version, createdAt: current?.createdAt ?? now,
    createdBy: current?.createdBy ?? null, updatedAt: now, updatedBy: null, changeReason: reason,
  };
}

/**
 * Narrow manager-only Source panel. Its parent supplies the area-less Source
 * count because only the server-paged Source shell can calculate it safely.
 */
export default function WorkshopScopeCoveragePanel({
  areaLessSourceCount = 0,
}: {
  areaLessSourceCount?: number;
}) {
  const { state, query, search, refresh, loadMore, setState } = useSourceWorkshopCoverage();
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [editingGrantId, setEditingGrantId] = useState<string | null>(null);
  const [department, setDepartment] = useState("");
  const [areaCode, setAreaCode] = useState("");
  const [line, setLine] = useState("");
  const [reason, setReason] = useState("");
  const [choices, setChoices] = useState<ChoicesState>(EMPTY_CHOICES);
  const [choicesRetry, setChoicesRetry] = useState(0);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const choicesRequest = useRef(0);
  const mutationRequest = useRef(0);

  const selectedPerson = state.rows.find((person) => person.personId === selectedPersonId) ?? null;
  const editingGrant = selectedPerson?.grants.find((grant) => grant.id === editingGrantId) ?? null;

  useEffect(() => {
    if (selectedPersonId || state.rows.length === 0) return;
    setSelectedPersonId(state.rows[0].personId);
  }, [selectedPersonId, state.rows]);

  const loadChoices = useCallback(async (append = false, cursor: SourceWorkshopScopeChoicesCursor | null = null) => {
    const request = ++choicesRequest.current;
    setChoices((previous) => ({ status: "loading", rows: append ? previous.rows : [], nextCursor: append ? previous.nextCursor : null, error: null }));
    const result = await listSourceWorkshopScopeChoices({
      department: department || null,
      areaCode: areaCode || null,
      cursor,
      limit: 50,
    });
    if (request !== choicesRequest.current) return;
    if (!result.ok) {
      setChoices((previous) => ({ status: "error", rows: previous.rows, nextCursor: previous.nextCursor, error: result.error }));
      return;
    }
    setChoices((previous) => ({
      status: "ready", rows: append ? mergeChoices(previous.rows, result.rows) : result.rows,
      nextCursor: result.nextCursor, error: null,
    }));
  }, [areaCode, department]);

  useEffect(() => { void loadChoices(); }, [loadChoices, choicesRetry]);

  const departments = useMemo(() => unique(choices.rows.map((choice) => choice.department)), [choices.rows]);
  const areas = useMemo(() => unique(choices.rows
    .filter((choice) => !department || choice.department === department)
    .map((choice) => choice.areaCode)), [choices.rows, department]);
  const lines = useMemo(() => unique(choices.rows
    .filter((choice) => choice.department === department && choice.areaCode === areaCode && choice.line !== null)
    .map((choice) => choice.line as string)), [choices.rows, department, areaCode]);

  const selectPerson = (person: SourceWorkshopCoveragePerson) => {
    setSelectedPersonId(person.personId);
    setEditingGrantId(null);
    setDepartment(""); setAreaCode(""); setLine(""); setMessage("");
  };

  const beginEdit = (grant: WorkshopScopeGrant) => {
    setEditingGrantId(grant.id);
    setDepartment(grant.department); setAreaCode(grant.areaCode); setLine(grant.line ?? "");
    setMessage("");
  };

  const save = async (isActive: boolean, direct?: {
    person: SourceWorkshopCoveragePerson;
    grant: WorkshopScopeGrant;
    draft: { department: string; areaCode: string; line: string; reason: string };
  }) => {
    const person = direct?.person ?? selectedPerson;
    if (!person) return;
    let draft;
    try {
      draft = normalizeWorkshopScopeDraft(direct?.draft ?? { department, areaCode, line, reason });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    const currentPersonId = person.personId;
    const currentGrant = direct?.grant ?? editingGrant;
    const request = ++mutationRequest.current;
    setSaving(true); setMessage("");
    try {
      const result = await setSourceWorkshopScopeGrant({
        grantId: currentGrant?.id ?? null, personId: currentPersonId, department: draft.department,
        areaCode: draft.areaCode, line: draft.line, isActive, reason: draft.reason,
        expectedVersion: currentGrant?.version ?? null,
      });
      if (request !== mutationRequest.current) return;
      if (!result.ok) {
        if (result.errorCode === "VERSION_CONFLICT") refresh();
        setMessage(result.error);
        return;
      }
      const grant = optimisticGrant({ current: currentGrant, response: result, personId: currentPersonId, ...draft });
      setState((previous) => ({
        ...previous,
        rows: applyOptimisticWorkshopScopeGrant(previous.rows, { personId: currentPersonId, grant }),
      }));
      setEditingGrantId(null); setReason("");
      setMessage(isActive ? "Đã lưu phạm vi xưởng; đang đồng bộ dữ liệu máy chủ." : "Đã thu hồi phạm vi; đang đồng bộ dữ liệu máy chủ.");
      refresh();
    } finally {
      if (request === mutationRequest.current) setSaving(false);
    }
  };

  const revoke = (grant: WorkshopScopeGrant) => {
    if (!selectedPerson) return;
    if (!reason.trim()) {
      setMessage("Nhập lý do thay đổi trước khi thu hồi phạm vi xưởng.");
      return;
    }
    if (!window.confirm(`Thu hồi phạm vi ${grant.department} / ${grant.areaCode}${grant.line ? ` / ${grant.line}` : " (toàn khu vực)"}?`)) return;
    void save(false, {
      person: selectedPerson,
      grant,
      draft: { department: grant.department, areaCode: grant.areaCode, line: grant.line ?? "", reason },
    });
  };

  return (
    <section style={{ ...cardDefault, padding: 20, fontFamily: TEXT }} aria-labelledby="workshop-scope-heading">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h2 id="workshop-scope-heading" style={{ margin: 0, color: C.plum }}>Phạm vi xưởng</h2>
          <p style={{ margin: "6px 0 0", color: C.plumSoft }}>Chỉ quản lý quyền xem Source; không thay đổi tài khoản, vai trò hay hồ sơ nhân sự.</p>
        </div>
        <button type="button" className="cw-nut cw-nut--phu" onClick={refresh}><RefreshCw size={14} /> Làm mới</button>
      </div>

      {areaLessSourceCount > 0 && (
        <p role="alert" style={{ marginTop: 14, color: C.raspText }}>
          Có {areaLessSourceCount} đối tượng Source chưa có khu vực; các đối tượng này không hiển thị cho người xưởng cho đến khi dữ liệu Source được bổ sung.
        </p>
      )}
      {message && <p role="alert" style={{ color: C.raspText }}>{message}</p>}

      <label htmlFor="workshop-coverage-search" className="cw-goi-y">Tìm nhân sự xưởng</label>
      <input id="workshop-coverage-search" type="search" value={query} onChange={(event) => search(event.target.value)} style={INP} placeholder="Nhập tên nhân sự…" />
      {state.status === "loading" && <p role="status" aria-live="polite">Đang tải nhân sự xưởng…</p>}
      {state.status === "error" && (
        <p role="alert">Không tải được danh sách: {state.error?.error} <button type="button" className="cw-nut cw-nut--phu" onClick={refresh}>Thử lại</button></p>
      )}
      {state.status === "ready" && state.rows.length === 0 && <p>Không có nhân sự xưởng đang hoạt động phù hợp.</p>}

      {state.rows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(300px, 2fr)", gap: 16, marginTop: 14 }}>
          <div aria-label="Danh sách nhân sự xưởng">
            {state.rows.map((person) => <button key={person.personId} type="button" onClick={() => selectPerson(person)}
              aria-pressed={person.personId === selectedPersonId} className="cw-nut cw-nut--phu" style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 8 }}>
              {person.fullName} <small>({person.roleName === "workshop_manager" ? "Quản lý xưởng" : "Nhân viên xưởng"}) · {person.grants.length} phạm vi</small>
            </button>)}
            {state.nextCursor && <button type="button" className="cw-nut cw-nut--phu" onClick={loadMore}>Tải thêm nhân sự</button>}
          </div>

          {selectedPerson && <div>
            <h3 style={{ marginTop: 0, color: C.plum }}>Phạm vi của {selectedPerson.fullName}</h3>
            {selectedPerson.grants.length === 0 && <p>Chưa có phạm vi nào.</p>}
            {selectedPerson.grants.map((grant) => <article key={grant.id} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, marginBottom: 8 }}>
              <strong>{grant.department} / {grant.areaCode} / {grant.line ?? "Toàn khu vực"}</strong>
              <div>{grant.isActive ? "Đang hiệu lực" : "Đã thu hồi"} · phiên bản {grant.version}</div>
              <small>Cập nhật {new Date(grant.updatedAt).toLocaleString("vi-VN")} · {grant.changeReason}</small>
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <button type="button" className="cw-nut cw-nut--phu" onClick={() => beginEdit(grant)}>Sửa</button>
                {grant.isActive && <button type="button" className="cw-nut cw-nut--phu" onClick={() => revoke(grant)} disabled={saving}>Thu hồi</button>}
              </div>
            </article>)}

            <form onSubmit={(event) => { event.preventDefault(); void save(true); }} aria-label="Thiết lập phạm vi xưởng">
              <h3>{editingGrant ? "Sửa phạm vi" : "Thêm phạm vi"}</h3>
              <label htmlFor="workshop-scope-department">Bộ phận Source</label>
              <select id="workshop-scope-department" value={department} onChange={(event) => { setDepartment(event.target.value); setAreaCode(""); setLine(""); }} style={INP} disabled={choices.status === "loading" || saving}>
                <option value="">— chọn bộ phận —</option>{departments.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <label htmlFor="workshop-scope-area">Khu vực Source</label>
              <select id="workshop-scope-area" value={areaCode} onChange={(event) => { setAreaCode(event.target.value); setLine(""); }} style={INP} disabled={!department || choices.status === "loading" || saving}>
                <option value="">— chọn khu vực —</option>{areas.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <label htmlFor="workshop-scope-line">Dây chuyền (không bắt buộc)</label>
              <select id="workshop-scope-line" value={line} onChange={(event) => setLine(event.target.value)} style={INP} disabled={!areaCode || choices.status === "loading" || saving}>
                <option value="">— để trống: toàn khu vực —</option>{lines.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <p>Để trống dây chuyền nghĩa là quyền xem toàn khu vực đã chọn.</p>
              {choices.status === "loading" && <p role="status">Đang tải lựa chọn từ Source…</p>}
              {choices.status === "error" && <p role="alert">Không tải được lựa chọn Source: {choices.error} <button type="button" className="cw-nut cw-nut--phu" onClick={() => setChoicesRetry((value) => value + 1)}>Thử lại</button></p>}
              {choices.status === "ready" && choices.nextCursor && <button type="button" className="cw-nut cw-nut--phu" onClick={() => void loadChoices(true, choices.nextCursor)}>Tải thêm lựa chọn Source</button>}
              <label htmlFor="workshop-scope-reason">Lý do thay đổi</label>
              <textarea id="workshop-scope-reason" value={reason} onChange={(event) => setReason(event.target.value)} required style={{ ...INP, minHeight: 76, paddingTop: 10 }} disabled={saving} />
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button type="submit" style={btnPrimary} disabled={saving || choices.status !== "ready"}>{saving ? "Đang lưu…" : editingGrant ? "Lưu thay đổi" : "Thêm phạm vi"}</button>
                {editingGrant && <button type="button" className="cw-nut cw-nut--phu" onClick={() => { setEditingGrantId(null); setDepartment(""); setAreaCode(""); setLine(""); }}>Hủy</button>}
              </div>
            </form>
          </div>}
        </div>
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import { fetchItemAssignments, setItemAssignment } from "./api.ts";
import {
  isDirectoryPersonComplete,
  isQaAccessClass,
  type DirectoryPerson,
  type ItemAssignment,
  type QaAssignmentRole,
} from "./types.ts";

function assignmentLabel(assignment: ItemAssignment): string {
  if (assignment.assignment_kind !== "qa") return "Xếp lịch thẩm định";
  return assignment.assignment_role === "primary" ? "QA phụ trách chính" : "QA phối hợp";
}

export async function dispatchAssignmentWhenCurrent({
  loadAssignments,
  confirmReplacement,
  isCurrent,
  dispatch,
}: {
  loadAssignments: () => Promise<Array<Pick<ItemAssignment, "assignment_kind" | "assignment_role" | "is_active" | "staff_name">>>;
  confirmReplacement: (existingPrimary: Pick<ItemAssignment, "staff_name">) => boolean;
  isCurrent: () => boolean;
  dispatch: (action: "assign" | "replace_primary") => Promise<unknown>;
}): Promise<boolean> {
  const itemAssignments = await loadAssignments();
  const existingPrimary = itemAssignments.find((assignment) => assignment.assignment_kind === "qa"
    && assignment.assignment_role === "primary" && assignment.is_active);
  let action: "assign" | "replace_primary" = "assign";
  if (existingPrimary) {
    if (!confirmReplacement(existingPrimary)) return false;
    action = "replace_primary";
  }
  if (!isCurrent()) return false;
  await dispatch(action);
  return true;
}

export async function settleAssignmentOperationWhenCurrent({
  mutate,
  isCurrent,
  onSuccess,
  onError,
  refresh,
}: {
  mutate: () => Promise<unknown>;
  isCurrent: () => boolean;
  onSuccess: () => void;
  onError: (error: unknown) => void;
  refresh: () => Promise<void>;
}): Promise<"success" | "error" | "stale"> {
  try {
    const result = await mutate();
    if (result === false || !isCurrent()) return "stale";
    onSuccess();
    if (!isCurrent()) return "stale";
    await refresh();
    return isCurrent() ? "success" : "stale";
  } catch (error) {
    if (!isCurrent()) return "stale";
    onError(error);
    return "error";
  }
}

export class AssignmentOperationState {
  #activeToken: number | null = null;
  #saving = false;

  begin(token: number) {
    this.#activeToken = token;
    this.#saving = true;
  }

  finish(token: number): boolean {
    if (this.#activeToken !== token) return false;
    this.#saving = false;
    return true;
  }

  get saving(): boolean {
    return this.#saving;
  }
}

export default function AssignmentPanel({ person, canEdit, fixedKind, qaOnly = false, onAssignmentsChanged }: {
  person: DirectoryPerson | null;
  canEdit: boolean;
  fixedKind?: "qa" | "equipment_department";
  qaOnly?: boolean;
  onAssignmentsChanged?: () => void;
}) {
  const [validationCode, setValidationCode] = useState("");
  const [kind, setKind] = useState<"qa" | "equipment_department">("qa");
  const [qaRole, setQaRole] = useState<QaAssignmentRole>("primary");
  const [reason, setReason] = useState("");
  const [assignments, setAssignments] = useState<ItemAssignment[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const requestSequence = useRef(0);
  const selectionSequence = useRef(0);
  const operationState = useRef(new AssignmentOperationState());
  const currentSelectedPersonId = useRef<string | null>(person?.person_id ?? null);
  currentSelectedPersonId.current = person?.person_id ?? null;
  const personComplete = person ? isDirectoryPersonComplete(person) : false;
  const personIsQa = person ? isQaAccessClass(person.access_class) : false;

  useEffect(() => {
    const sequence = ++requestSequence.current;
    selectionSequence.current += 1;
    setSaving(false);
    if (!person) { setAssignments([]); return; }
    if (!fixedKind) setKind(personIsQa ? "qa" : "equipment_department");
    fetchItemAssignments({ personId: person.person_id })
      .then((nextAssignments) => {
        if (sequence === requestSequence.current) setAssignments(nextAssignments);
      })
      .catch((error) => {
        if (sequence === requestSequence.current) setMessage((error as Error).message);
      });
  }, [fixedKind, person, personIsQa]);

  const refreshAssignments = async (selectedPerson: DirectoryPerson, isCurrent = () => true) => {
    if (!isCurrent()) return;
    const sequence = ++requestSequence.current;
    const nextAssignments = await fetchItemAssignments({ personId: selectedPerson.person_id });
    if (isCurrent() && sequence === requestSequence.current) setAssignments(nextAssignments);
  };

  const assign = async () => {
    if (!person || !isDirectoryPersonComplete(person)) return;
    const selectedPerson = person;
    const operationSequence = selectionSequence.current;
    const assignmentKind = fixedKind || (personIsQa ? "qa" : kind);
    const assignmentRole = assignmentKind === "qa" ? qaRole : null;
    const isCurrentSelection = () => operationSequence === selectionSequence.current
      && currentSelectedPersonId.current === selectedPerson.person_id;
    operationState.current.begin(operationSequence);
    setSaving(true);
    setMessage("");
    try {
      const outcome = await settleAssignmentOperationWhenCurrent({
        mutate: () => assignmentKind === "qa" && assignmentRole === "primary"
          ? dispatchAssignmentWhenCurrent({
          loadAssignments: () => fetchItemAssignments({ validationCode: validationCode.trim() }),
          confirmReplacement: (existingPrimary) => window.confirm(
            `Hạng mục này đang có QA phụ trách chính là ${existingPrimary.staff_name}. Đổi sang ${selectedPerson.full_name}?`,
          ),
          isCurrent: isCurrentSelection,
          dispatch: (action) => setItemAssignment({
            personId: selectedPerson.person_id,
            validationCode: validationCode.trim(),
            assignmentKind,
            assignmentRole,
            action,
            reason: reason.trim(),
          }),
          })
          : setItemAssignment({
            personId: selectedPerson.person_id,
            validationCode: validationCode.trim(),
            assignmentKind,
            assignmentRole,
            action: "assign",
            reason: reason.trim(),
          }),
        isCurrent: isCurrentSelection,
        onSuccess: () => {
          onAssignmentsChanged?.();
          setMessage(`Đã phân công hạng mục ${validationCode.trim()} cho ${selectedPerson.full_name}`);
        },
        onError: (error) => setMessage((error as Error).message),
        refresh: () => refreshAssignments(selectedPerson, isCurrentSelection),
      });
      if (outcome !== "success" || !isCurrentSelection()) return;
      setValidationCode("");
      setReason("");
    } finally {
      if (operationState.current.finish(operationSequence)) setSaving(false);
    }
  };

  const revoke = async (assignment: ItemAssignment) => {
    if (!assignment.person_id || !reason.trim()) return;
    const selectedPerson = person;
    const operationSequence = selectionSequence.current;
    const selectionRole = qaRole;
    const isCurrentSelection = () => operationSequence === selectionSequence.current
      && currentSelectedPersonId.current === selectedPerson?.person_id && qaRole === selectionRole;
    operationState.current.begin(operationSequence);
    setSaving(true);
    setMessage("");
    try {
      await settleAssignmentOperationWhenCurrent({
        mutate: () => setItemAssignment({
          personId: assignment.person_id!,
          validationCode: assignment.validation_code,
          assignmentKind: assignment.assignment_kind,
          assignmentRole: assignment.assignment_role,
          action: "revoke",
          reason: reason.trim(),
        }),
        isCurrent: isCurrentSelection,
        onSuccess: () => {
          onAssignmentsChanged?.();
          setMessage(`Đã thu hồi phân công ${assignment.validation_code}`);
        },
        onError: (error) => setMessage((error as Error).message),
        refresh: () => selectedPerson ? refreshAssignments(selectedPerson, isCurrentSelection) : Promise.resolve(),
      });
    } finally {
      if (operationState.current.finish(operationSequence)) setSaving(false);
    }
  };

  return (
    <section className="ip-panel" aria-labelledby="ip-assignment-title">
      <h3 id="ip-assignment-title">Phân công theo hạng mục</h3>
      <p className="ip-help">Chỉ chọn người từ danh bạ chuẩn; không có ô nhập tên tự do.</p>
      {person ? (
        <>
          <div className="ip-selected"><Link2 size={16} /> <b>{person.full_name}</b><span>{person.department?.toUpperCase() || "chưa có bộ phận"} · {person.person_id}</span></div>
          {!personComplete && (
            <div className="ip-message" role="status">Hồ sơ chưa đủ. Bổ sung bộ phận, phân loại, phạm vi và khu vực trước khi phân công.</div>
          )}
          <div className="ip-form is-compact">
            <label>Mã hạng mục<input className="pq-o" aria-label="Mã hạng mục cần phân công" value={validationCode} onChange={(event) => setValidationCode(event.target.value)} placeholder="Ví dụ: CCTB01/2026.01-OQ" /></label>
            {personIsQa ? (
              <label>Vai trò QA trong hạng mục
                <select className="pq-o" aria-label="Vai trò QA trong hạng mục" value={qaRole}
                  onChange={(event) => {
                    selectionSequence.current += 1;
                    setSaving(false);
                    setQaRole(event.target.value as QaAssignmentRole);
                  }}>
                  <option value="primary">QA phụ trách chính</option>
                  <option value="collaborator">QA phối hợp</option>
                </select>
              </label>
            ) : !fixedKind && !qaOnly && (
              <label>Vai trò phân công
                <select className="pq-o" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
                  <option value="qa">QA thực hiện các mốc hoàn thành</option>
                  <option value="equipment_department">Bộ phận quản lý thiết bị xếp lịch</option>
                </select>
              </label>
            )}
            <label>Lý do<input className="pq-o" aria-label="Lý do phân công" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          </div>
          {canEdit && (!qaOnly || personIsQa) && (
            <button type="button" className="pq-nut la-chinh" aria-label="Phân công người đã chọn"
              disabled={!personComplete || saving || !validationCode.trim() || !reason.trim()} onClick={assign}>
              <Link2 size={15} /> {saving ? "Đang phân công…" : "Phân công"}
            </button>
          )}
          <div className="ip-list">
            {assignments.map((assignment) => (
              <div key={assignment.assignment_id}>
                <b>{assignment.validation_code}</b>
                <span>{assignmentLabel(assignment)}</span>
                <span>{assignment.person_id ? `Khóa người: ${assignment.person_id}` : "Chưa xác định hồ sơ"}</span>
                <em>{assignment.grants_access ? "cấp quyền" : assignment.unresolved_reason || "chưa có quyền truy cập"}</em>
                {canEdit && (!qaOnly || assignment.assignment_kind === "qa") && (
                  <button type="button" className="pq-nut" disabled={saving || !reason.trim() || !assignment.person_id}
                    aria-label={`Thu hồi ${assignment.validation_code} ${assignmentLabel(assignment)}`}
                    onClick={() => void revoke(assignment)}>Thu hồi</button>
                )}
              </div>
            ))}
            {!assignments.length && <span className="ip-muted">Chưa có phân công hạng mục.</span>}
          </div>
        </>
      ) : <div className="ip-empty">Tìm và chọn một người ở danh bạ để phân công.</div>}
      {message && <div className="ip-message" role="status">{message}</div>}
    </section>
  );
}

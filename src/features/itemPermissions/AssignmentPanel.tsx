import { useEffect, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import { useXacNhan } from "../../hooks/useXacNhan.tsx";
import { fetchItemAssignments, ItemPermissionRpcError, setItemAssignment } from "./api.ts";
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
  loadAssignments: () => Promise<Array<Pick<ItemAssignment, "assignment_id" | "assignment_kind" | "assignment_role" | "is_active" | "staff_name">>>;
  /* C3 (31/08): nhận cả Promise — hộp xác nhận chuẩn (useXacNhan) là async,
     còn test unit vẫn truyền hàm sync trả boolean như cũ. */
  confirmReplacement: (existingPrimary: Pick<ItemAssignment, "staff_name">) => boolean | Promise<boolean>;
  isCurrent: () => boolean;
  dispatch: (action: "assign" | "replace_primary", expectedPrimaryAssignmentId: string | null) => Promise<unknown>;
}): Promise<boolean> {
  const itemAssignments = await loadAssignments();
  if (!isCurrent()) return false;
  const existingPrimary = itemAssignments.find((assignment) => assignment.assignment_kind === "qa"
    && assignment.assignment_role === "primary" && assignment.is_active);
  const expectedPrimaryAssignmentId = existingPrimary?.assignment_id ?? null;
  let action: "assign" | "replace_primary" = "assign";
  if (existingPrimary) {
    if (!(await confirmReplacement(existingPrimary))) return false;
    action = "replace_primary";
  }
  if (!isCurrent()) return false;
  await dispatch(action, expectedPrimaryAssignmentId);
  return true;
}

export async function settleAssignmentOperationWhenCurrent({
  mutate,
  isCurrent,
  onSuccess,
  onError,
  refresh,
  refreshOnError = () => false,
  refreshAfterError,
}: {
  mutate: () => Promise<unknown>;
  isCurrent: () => boolean;
  onSuccess: () => void;
  onError: (error: unknown) => void;
  refresh: () => Promise<void>;
  refreshOnError?: (error: unknown) => boolean;
  refreshAfterError?: (error: unknown) => Promise<void>;
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
    if (refreshOnError(error)) {
      try {
        await (refreshAfterError ? refreshAfterError(error) : refresh());
      } catch {
        // Giữ lỗi mutation gốc; refresh chỉ là best-effort để đồng bộ conflict.
      }
      if (!isCurrent()) return "stale";
    }
    onError(error);
    return "error";
  }
}

export class AssignmentOperationState {
  #activeToken: number | null = null;
  #nextToken = 0;
  #saving = false;

  begin(token?: number): number {
    const operationId = token ?? this.#nextToken + 1;
    this.#nextToken = Math.max(this.#nextToken, operationId);
    this.#activeToken = operationId;
    this.#saving = true;
    return operationId;
  }

  finish(token: number): boolean {
    if (this.#activeToken !== token) return false;
    this.#saving = false;
    return true;
  }

  get saving(): boolean {
    return this.#saving;
  }

  isActive(token: number): boolean {
    return this.#activeToken === token;
  }

  invalidateIntent(): boolean {
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
  const { xacNhan, hopXacNhan } = useXacNhan();
  const requestSequence = useRef(0);
  const selectionSequence = useRef(0);
  const intentSequence = useRef(0);
  const operationState = useRef(new AssignmentOperationState());
  const currentSelectedPersonId = useRef<string | null>(person?.person_id ?? null);
  currentSelectedPersonId.current = person?.person_id ?? null;
  const personComplete = person ? isDirectoryPersonComplete(person) : false;
  const personIsQa = person ? isQaAccessClass(person.access_class) : false;

  useEffect(() => {
    const sequence = ++requestSequence.current;
    selectionSequence.current += 1;
    intentSequence.current += 1;
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

  const refreshItemAssignments = async (itemCode: string, isCurrent = () => true) => {
    if (!isCurrent()) return;
    const sequence = ++requestSequence.current;
    const nextAssignments = await fetchItemAssignments({ validationCode: itemCode });
    if (isCurrent() && sequence === requestSequence.current) setAssignments(nextAssignments);
  };

  const assign = async () => {
    if (!person || !isDirectoryPersonComplete(person)) return;
    const selectedPerson = person;
    const selectionAtStart = selectionSequence.current;
    const intentAtStart = intentSequence.current;
    const assignmentKind = fixedKind || (personIsQa ? "qa" : kind);
    const assignmentRole = assignmentKind === "qa" ? qaRole : null;
    const intent = {
      personId: selectedPerson.person_id,
      fullName: selectedPerson.full_name,
      validationCode: validationCode.trim(),
      assignmentKind,
      assignmentRole,
      reason: reason.trim(),
    };
    const operationId = operationState.current.begin();
    const isCurrentSelection = () => operationState.current.isActive(operationId)
      && selectionAtStart === selectionSequence.current
      && intentAtStart === intentSequence.current
      && currentSelectedPersonId.current === intent.personId;
    setSaving(true);
    setMessage("");
    try {
      const outcome = await settleAssignmentOperationWhenCurrent({
        mutate: () => intent.assignmentKind === "qa" && intent.assignmentRole === "primary"
          ? dispatchAssignmentWhenCurrent({
          loadAssignments: () => fetchItemAssignments({ validationCode: intent.validationCode }),
          confirmReplacement: (existingPrimary) => xacNhan({
            title: "Thay QA phụ trách chính?",
            description: `Hạng mục này đang có QA phụ trách chính là ${existingPrimary.staff_name}. `
              + `Đổi sang ${intent.fullName} — người cũ chuyển thành không còn phụ trách chính.`,
            confirmLabel: "Thay người",
          }),
          isCurrent: isCurrentSelection,
          dispatch: (action, expectedPrimaryAssignmentId) => setItemAssignment({
            personId: intent.personId,
            validationCode: intent.validationCode,
            assignmentKind: intent.assignmentKind,
            assignmentRole: intent.assignmentRole,
            action,
            reason: intent.reason,
            expectedPrimaryAssignmentId,
          }),
          })
          : setItemAssignment({
            personId: intent.personId,
            validationCode: intent.validationCode,
            assignmentKind: intent.assignmentKind,
            assignmentRole: intent.assignmentRole,
            action: "assign",
            reason: intent.reason,
            expectedPrimaryAssignmentId: null,
          }),
        isCurrent: isCurrentSelection,
        onSuccess: () => {
          onAssignmentsChanged?.();
          setMessage(`Đã phân công hạng mục ${intent.validationCode} cho ${intent.fullName}`);
        },
        onError: (error) => setMessage((error as Error).message),
        refresh: () => refreshAssignments(selectedPerson, isCurrentSelection),
        refreshOnError: (error) => error instanceof ItemPermissionRpcError
          && error.code === "PRIMARY_CONFLICT",
        refreshAfterError: () => refreshItemAssignments(
          intent.validationCode, isCurrentSelection,
        ),
      });
      if (outcome !== "success" || !isCurrentSelection()) return;
      setValidationCode("");
      setReason("");
    } finally {
      if (operationState.current.finish(operationId)) setSaving(false);
    }
  };

  const revoke = async (assignment: ItemAssignment) => {
    if (!assignment.person_id || !reason.trim()) return;
    const selectedPerson = person;
    const selectionAtStart = selectionSequence.current;
    const intentAtStart = intentSequence.current;
    const intent = {
      personId: assignment.person_id,
      validationCode: assignment.validation_code,
      assignmentKind: assignment.assignment_kind,
      assignmentRole: assignment.assignment_role,
      reason: reason.trim(),
    };
    const operationId = operationState.current.begin();
    const isCurrentSelection = () => operationState.current.isActive(operationId)
      && selectionAtStart === selectionSequence.current
      && intentAtStart === intentSequence.current
      && currentSelectedPersonId.current === selectedPerson?.person_id;
    setSaving(true);
    setMessage("");
    try {
      await settleAssignmentOperationWhenCurrent({
        mutate: () => setItemAssignment({
          personId: intent.personId,
          validationCode: intent.validationCode,
          assignmentKind: intent.assignmentKind,
          assignmentRole: intent.assignmentRole,
          action: "revoke",
          reason: intent.reason,
          expectedPrimaryAssignmentId: null,
        }),
        isCurrent: isCurrentSelection,
        onSuccess: () => {
          onAssignmentsChanged?.();
          setMessage(`Đã thu hồi phân công ${intent.validationCode}`);
        },
        onError: (error) => setMessage((error as Error).message),
        refresh: () => selectedPerson ? refreshAssignments(selectedPerson, isCurrentSelection) : Promise.resolve(),
      });
    } finally {
      if (operationState.current.finish(operationId)) setSaving(false);
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
            <label>Mã hạng mục<input className="pq-o" aria-label="Mã hạng mục cần phân công" value={validationCode}
              disabled={saving} onChange={(event) => {
                intentSequence.current += 1;
                setValidationCode(event.target.value);
              }} placeholder="Ví dụ: CCTB01/2026.01-OQ" /></label>
            {personIsQa ? (
              <label>Vai trò QA trong hạng mục
                <select className="pq-o" aria-label="Vai trò QA trong hạng mục" value={qaRole} disabled={saving}
                  onChange={(event) => {
                    selectionSequence.current += 1;
                    intentSequence.current += 1;
                    operationState.current.invalidateIntent();
                    setQaRole(event.target.value as QaAssignmentRole);
                  }}>
                  <option value="primary">QA phụ trách chính</option>
                  <option value="collaborator">QA phối hợp</option>
                </select>
              </label>
            ) : !fixedKind && !qaOnly && (
              <label>Vai trò phân công
                <select className="pq-o" value={kind} disabled={saving} onChange={(event) => {
                  intentSequence.current += 1;
                  setKind(event.target.value as typeof kind);
                }}>
                  <option value="qa">QA thực hiện các mốc hoàn thành</option>
                  <option value="equipment_department">Bộ phận quản lý thiết bị xếp lịch</option>
                </select>
              </label>
            )}
            <label>Lý do<input className="pq-o" aria-label="Lý do phân công" value={reason} disabled={saving}
              onChange={(event) => {
                intentSequence.current += 1;
                setReason(event.target.value);
              }} /></label>
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
                <span>{assignment.staff_name}</span>
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
      {hopXacNhan}
    </section>
  );
}

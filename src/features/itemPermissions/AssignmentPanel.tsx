import { useEffect, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import { fetchItemAssignments, setItemAssignment } from "./api.ts";
import { isDirectoryPersonComplete, type DirectoryPerson, type ItemAssignment } from "./types.ts";

export default function AssignmentPanel({ person, canEdit, fixedKind }: {
  person: DirectoryPerson | null;
  canEdit: boolean;
  fixedKind?: "qa" | "equipment_department";
}) {
  const [validationCode, setValidationCode] = useState("");
  const [kind, setKind] = useState<"qa" | "equipment_department">("qa");
  const [reason, setReason] = useState("");
  const [assignments, setAssignments] = useState<ItemAssignment[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const requestSequence = useRef(0);
  const personComplete = person ? isDirectoryPersonComplete(person) : false;

  useEffect(() => {
    const sequence = ++requestSequence.current;
    if (!person) { setAssignments([]); return; }
    if (!fixedKind) setKind(person.access_class?.startsWith("qa_") ? "qa" : "equipment_department");
    fetchItemAssignments({ personId: person.person_id })
      .then((nextAssignments) => {
        if (sequence === requestSequence.current) setAssignments(nextAssignments);
      })
      .catch((error) => {
        if (sequence === requestSequence.current) setMessage((error as Error).message);
      });
  }, [fixedKind, person]);

  const assign = async () => {
    if (!person || !isDirectoryPersonComplete(person)) return;
    const selectedPerson = person;
    const selectionSequence = requestSequence.current;
    setSaving(true);
    setMessage("");
    try {
      await setItemAssignment({
        personId: selectedPerson.person_id,
        validationCode: validationCode.trim(),
        assignmentKind: fixedKind || kind,
        action: "assign",
        reason: reason.trim(),
      });
      if (selectionSequence !== requestSequence.current) return;
      setMessage(`Đã phân công hạng mục ${validationCode.trim()} cho ${selectedPerson.full_name}`);
      const sequence = ++requestSequence.current;
      const nextAssignments = await fetchItemAssignments({ personId: selectedPerson.person_id });
      if (sequence === requestSequence.current) setAssignments(nextAssignments);
      setValidationCode("");
      setReason("");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
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
            {!fixedKind && (
              <label>Vai trò phân công
                <select className="pq-o" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
                  <option value="qa">QA thực hiện các mốc hoàn thành</option>
                  <option value="equipment_department">Bộ phận quản lý thiết bị xếp lịch</option>
                </select>
              </label>
            )}
            <label>Lý do<input className="pq-o" aria-label="Lý do phân công" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          </div>
          {canEdit && (
            <button type="button" className="pq-nut la-chinh" aria-label="Phân công người đã chọn"
              disabled={!personComplete || saving || !validationCode.trim() || !reason.trim()} onClick={assign}>
              <Link2 size={15} /> {saving ? "Đang phân công…" : "Phân công"}
            </button>
          )}
          <div className="ip-list">
            {assignments.map((assignment) => (
              <div key={assignment.assignment_id}>
                <b>{assignment.validation_code}</b>
                <span>{assignment.assignment_kind === "qa" ? "QA cập nhật 4 mốc" : "Xếp lịch thẩm định"}</span>
                <em>{assignment.grants_access ? "cấp quyền" : assignment.unresolved_reason || "chưa cấp quyền"}</em>
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

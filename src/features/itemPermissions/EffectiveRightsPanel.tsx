import { useEffect, useRef, useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { fetchEffectiveRights } from "./api.ts";
import { isQaAccessClass, type DirectoryPerson, type EffectiveItemRight } from "./types.ts";

const fieldLabels: Record<string, string> = {
  actual_protocol_date: "Ngày hoàn thành đề cương",
  status_protocol: "Trạng thái đề cương",
  actual_validation_date: "Ngày hoàn thành thẩm định thực tế",
  status_validation: "Trạng thái thẩm định thực tế",
  actual_report_date: "Ngày hoàn thành báo cáo",
  status_report: "Trạng thái báo cáo",
  actual_vmp_date: "Ngày hoàn thành VMP",
  status_vmp: "Trạng thái VMP",
  scheduled_at: "Bộ phận quản lý thiết bị xếp lịch",
};

export async function loadEffectiveRightsWhenCurrent<T>({
  request,
  isCurrent,
  onSuccess,
  onError,
}: {
  request: () => Promise<T>;
  isCurrent: () => boolean;
  onSuccess: (result: T) => void;
  onError: (error: unknown) => void;
}): Promise<"success" | "error" | "stale"> {
  try {
    const result = await request();
    if (!isCurrent()) return "stale";
    onSuccess(result);
    return "success";
  } catch (error) {
    if (!isCurrent()) return "stale";
    onError(error);
    return "error";
  }
}

export default function EffectiveRightsPanel({ person, revision = 0 }: {
  person: DirectoryPerson | null;
  revision?: number;
}) {
  const [view, setView] = useState<"person" | "item">("person");
  const [validationCode, setValidationCode] = useState("");
  const [rows, setRows] = useState<EffectiveItemRight[]>([]);
  const [mode, setMode] = useState<"preview" | "enforced">("preview");
  const [message, setMessage] = useState("");
  const requestSequence = useRef(0);
  const targetKey = view === "person"
    ? `person:${person?.person_id || ""}:${revision}`
    : `item:${validationCode.trim()}:${revision}`;
  const currentTargetKey = useRef(targetKey);
  currentTargetKey.current = targetKey;

  const load = async () => {
    if (view === "person" && !person) return;
    if (view === "item" && !validationCode.trim()) return;
    const requestKey = targetKey;
    const sequence = ++requestSequence.current;
    const requestArgs = view === "person"
      ? { personId: person!.person_id }
      : { validationCode: validationCode.trim() };
    setRows([]);
    setMessage("");
    await loadEffectiveRightsWhenCurrent({
      request: () => fetchEffectiveRights(requestArgs),
      isCurrent: () => sequence === requestSequence.current && requestKey === currentTargetKey.current,
      onSuccess: (result) => {
        setRows(result.rights);
        setMode(result.mode);
      },
      onError: (error) => setMessage((error as Error).message),
    });
  };

  useEffect(() => {
    requestSequence.current += 1;
    setRows([]);
    setMessage("");
    if (view === "person" && person) void load();
  }, [person, revision, view]);

  return (
    <section className="ip-panel" aria-labelledby="ip-rights-title">
      <h3 id="ip-rights-title">Quyền hiệu lực theo từng đầu mục</h3>
      <div className="ip-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={view === "person"} onClick={() => setView("person")}>Theo nhân viên</button>
        <button type="button" role="tab" aria-selected={view === "item"} onClick={() => setView("item")}>Theo hạng mục</button>
      </div>
      {view === "item" && (
        <div className="ip-inline">
          <input className="pq-o" aria-label="Mã hạng mục xem quyền" value={validationCode} onChange={(event) => setValidationCode(event.target.value)} />
          <button type="button" className="pq-nut" onClick={load}>Xem quyền</button>
        </div>
      )}
      <p className="ip-help">Chế độ: <b>{mode === "preview" ? "Dự kiến, chưa áp dụng" : "Đang áp dụng"}</b>. Mỗi dòng nói rõ được xem vì sao và sửa chính xác cột nào.</p>
      <div className="ip-rights-list">
        {rows.map((right) => (
          <article key={`${right.person_id}-${right.validation_code}`}>
            <header><b>{right.full_name}</b><span>{right.validation_code}</span></header>
            <div className={right.can_view ? "is-allowed" : "is-denied"}>
              <Eye size={14} /> {right.can_view ? "Được xem" : "Không được xem"} — {right.view_reason}
            </div>
            <div><Pencil size={14} /> {right.editable_fields.length
              ? right.editable_fields.map((field) => fieldLabels[field] || field).join(" · ")
              : "Chỉ xem, không sửa cột timeline nào"}</div>
            {isQaAccessClass(person?.access_class ?? null) ? (
              <div>Phân công: {right.assignment_sources.length
                ? right.assignment_sources.join(" · ")
                : "chưa có phân công đang hoạt động"}</div>
            ) : (
              <div>Phạm vi: Bộ phận {right.scope_match ? "khớp" : "không khớp"}
                {right.factory_match !== undefined && ` · Xưởng ${right.factory_match ? "khớp" : "không khớp"}`}
                {` · Khu vực ${right.area_match ? "khớp" : "không khớp"}`}
                {right.line_match !== undefined && ` · Line ${right.line_match ? "khớp" : "không khớp"}`}
              </div>
            )}
          </article>
        ))}
        {!rows.length && <div className="ip-empty">Chưa có dòng quyền để hiển thị.</div>}
      </div>
      {message && <div className="ip-message" role="status">{message}</div>}
    </section>
  );
}

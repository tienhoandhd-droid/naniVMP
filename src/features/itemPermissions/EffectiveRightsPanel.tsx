import { useEffect, useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { fetchEffectiveRights } from "./api.ts";
import type { DirectoryPerson, EffectiveItemRight } from "./types.ts";

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

export default function EffectiveRightsPanel({ person }: { person: DirectoryPerson | null }) {
  const [view, setView] = useState<"person" | "item">("person");
  const [validationCode, setValidationCode] = useState("");
  const [rows, setRows] = useState<EffectiveItemRight[]>([]);
  const [mode, setMode] = useState<"preview" | "enforced">("preview");
  const [message, setMessage] = useState("");

  const load = async () => {
    if (view === "person" && !person) return;
    if (view === "item" && !validationCode.trim()) return;
    try {
      const result = await fetchEffectiveRights(view === "person"
        ? { personId: person!.person_id }
        : { validationCode: validationCode.trim() });
      setRows(result.rights);
      setMode(result.mode);
      setMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  useEffect(() => {
    if (view === "person" && person) void load();
  }, [person, view]);

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
            <div>Phạm vi: Bộ phận {right.scope_match ? "khớp" : "không khớp"}
              {right.factory_match !== undefined && ` · Xưởng ${right.factory_match ? "khớp" : "không khớp"}`}
              {` · Khu vực ${right.area_match ? "khớp" : "không khớp"}`}
              {right.line_match !== undefined && ` · Line ${right.line_match ? "khớp" : "không khớp"}`}
            </div>
          </article>
        ))}
        {!rows.length && <div className="ip-empty">Chưa có dòng quyền để hiển thị.</div>}
      </div>
      {message && <div className="ip-message" role="status">{message}</div>}
    </section>
  );
}

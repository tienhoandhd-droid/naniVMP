/* =====================================================================
 *  TimelineInspector — supporting pane ≥1600 của màn Timeline
 *  (đợt 2 áp nghiên cứu docs/nghien-cuu/2026-08-16-deep-research-lotus-swiss.md)
 *  ---------------------------------------------------------------------
 *  Ở màn rộng, bấm một hàng KHÔNG bật modal che dữ liệu nữa: chi tiết đổ
 *  sang pane bên phải (mẫu Material supporting pane, cùng khung
 *  .lp-supporting-layout với màn Hôm nay). Modal chỉ còn mở qua nút
 *  "Hồ sơ đầy đủ" — nó vẫn là nơi tra đủ mọi trường.
 *
 *  Chưa chọn gì thì pane là Vali hướng dẫn — supporting pane là vùng
 *  art-safe hợp lệ theo hiến pháp Atelier, không phải khoảng trắng chết.
 * ===================================================================== */
import { DEPTS } from "../../constants/vmp.ts";
import { fmtVN, phaseStates, parseD } from "../../utils/helpers.ts";
import { Pill } from "../../components/ui/Primitives.tsx";
import ValiIllustration from "../../components/brand/ValiIllustration.tsx";
import { issueLevel, laSapDenHan } from "./timelineSummaryModel.ts";
import type { Activity } from "../../types/domain.ts";

const NHAN_PHA: Record<string, string> = {
  over: "Trễ", done: "Xong", current: "Đang làm", future: "Sắp tới",
};

export default function TimelineInspector({ a, chuSoHuu, onDong, onHoSo }: {
  a: Activity | null;
  /** ownerOf(a) — luật gom chủ sở hữu nằm ở trang, pane chỉ hiển thị. */
  chuSoHuu: string;
  onDong: () => void;
  onHoSo: (a: Activity) => void;
}) {
  if (!a) {
    return (
      <aside className="tl-inspector" data-timeline-inspector aria-label="Chi tiết hạng mục đang chọn">
        <div className="tl-inspector__trong">
          <ValiIllustration mood="guide" size={110} />
          <p>
            Chọn một hạng mục trong bảng để xem mốc, người phụ trách và
            tình trạng tại đây — không cần mở cửa sổ che dữ liệu.
          </p>
        </div>
      </aside>
    );
  }

  const ps = phaseStates(a);
  const muc = issueLevel(a);
  const dp = DEPTS.find((d) => d.id === a.dept);
  const cacMoc: Array<{ ten: string; han: Date | null; tt: string }> = [
    { ten: "Đề cương", han: ps.m.protocol, tt: ps.p },
    { ten: "Thẩm định thực tế", han: ps.m.validation, tt: ps.v },
    { ten: "Báo cáo", han: ps.m.report, tt: ps.r },
    {
      ten: "Đích VMP", han: ps.m.target,
      tt: a.st === "done" ? "done"
        : muc === "over" ? "over"
        : laSapDenHan(a) ? "current" : "future",
    },
  ];

  return (
    <aside className="tl-inspector" data-timeline-inspector aria-label="Chi tiết hạng mục đang chọn">
      <div className="tl-inspector__dau">
        <span className="tl-inspector__ma tnum">{a.code}</span>
        <Pill s={a.st} small />
        <button type="button" className="tl-inspector__dong" onClick={onDong} aria-label="Bỏ chọn hạng mục">
          ×
        </button>
      </div>
      <p className="tl-inspector__ten">{a.name}</p>
      <p className="tl-inspector__phu">
        {chuSoHuu || "Chưa phân công"} · {dp?.name || a.dept || "Chưa có bộ phận"}
      </p>

      <ul className="tl-inspector__moc">
        {cacMoc.map((m) => (
          <li key={m.ten} className={`tl-inspector__hang tl-inspector__hang--${m.tt}`}>
            <span className="tl-inspector__moc-ten">{m.ten}</span>
            <span className="tl-inspector__moc-han tnum">{m.han ? fmtVN(m.han) : "—"}</span>
            <span className="tl-inspector__moc-tt">{NHAN_PHA[m.tt] || m.tt}</span>
          </li>
        ))}
      </ul>

      {parseD(a.target) === null && (
        <p className="tl-inspector__phu">Hạng mục chưa có ngày đích VMP.</p>
      )}

      <div className="tl-inspector__nut-cum">
        <button type="button" className="tl-inspector__nut" onClick={() => onHoSo(a)}>
          Hồ sơ đầy đủ
        </button>
      </div>
    </aside>
  );
}

import { useMemo } from "react";
import { AlertCircle, Clock, FileWarning } from "lucide-react";
import { C, TEXT, NUM } from "../../constants/theme.ts";
import { Card, PrincessCommentary, StatTile } from "../../components/ui/Primitives.tsx";
import { tally, docTally, runDataQualityChecks } from "../../utils/helpers.ts";
import type { AccessContext, ScreenId } from "../../lib/access.ts";
import type { Activity } from "../../types/domain.ts";
import { overviewTarget } from "../../lib/navigationTargets.ts";
import { bangkokCalendarDate, classifyVmpDeadline } from "../../lib/vmpDeadlineModel.ts";
import VongNam from "../../components/dashboard/VongNam.tsx";
import CompletionDashboard from "../../components/dashboard/CompletionDashboard.tsx";
import MaTranTienDo from "../../components/dashboard/MaTranTienDo.tsx";

export default function Overview({ acts, setView, access }: {
  acts: Activity[];
  setView?: (v: string) => void;
  access: Pick<AccessContext, "canView">;
}) {
  const now = new Date();
  const currentBangkokDate = bangkokCalendarDate(now);
  const currentBangkokYear = Number(currentBangkokDate.slice(0, 4));
  const { e, d, overdue, soon, gap, gapPts, mismatched } = useMemo(() => {
    const e = tally(acts), d = docTally(acts);
    const overdue = acts.filter((a) => classifyVmpDeadline(a, now, 30).kind === "overdue");
    const soon = acts.filter((a) => {
      const kind = classifyVmpDeadline(a, now, 30).kind;
      return kind === "today" || kind === "soon";
    });

    return {
      e, d, overdue, soon,
      gap: e.done - d.done, gapPts: e.rate - d.rate,
      mismatched: acts.filter((a) => a.mismatch),
    };
  }, [acts, now]);

  const destinations = useMemo(() => ({
    overdue: overviewTarget(access, "overdue"),
    soon: overviewTarget(access, "soon"),
    dataQuality: overviewTarget(access, "data-quality"),
  }), [access]);
  const di = (v: ScreenId | null) => (v && setView ? () => setView(v) : undefined);
  const soLoiDl = useMemo(() => runDataQualityChecks(acts).length, [acts]);

  return (
    <div className="vmp-bento vmp-stagger">
      {/* Ô lớn — trạng thái chung của cả kế hoạch */}
      <Card variant="strong" cls="b-hero" style={{ padding: "24px 26px" }}>
        {/* Vòng năm thay vương miện 3D. Vương miện mã hoá bốn tỉ lệ vào ĐỘ
            SÁNG viên ngọc — kênh mà mắt người đọc kém nhất; bằng chứng là
            phần đọc được thật vẫn phải nằm ở bảng chú giải bên cạnh nó.
            Vòng năm nói được thứ tổng quát hơn và đọc thẳng từ hình: cả 12
            tháng khép kín, khối lượng từng tháng, phần đã xong, và kim chỉ
            mình đang đứng ở đâu trong năm. */}
        <VongNam acts={acts} rate={e.rate} total={e.total}
          year={currentBangkokYear} bangkokToday={currentBangkokDate} ben={
          <div className="vmp-overview-progress" data-overview-total={e.total} style={{ minWidth: 0 }}>
            <div style={{ fontFamily: TEXT, fontSize: 20, fontWeight: 800,
                          color: C.plum, marginBottom: 3 }}>
              Tiến độ thẩm định {currentBangkokYear}
            </div>
            <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginBottom: 15 }}>
              {e.total} hạng mục trong kế hoạch năm
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {[
                { id: "completed", l: "Hoàn thành", v: e.done, c: C.mint, t: C.mintText },
                { id: "overdue", l: "Đã chuyển quá hạn", v: e.over, c: C.rasp, t: C.raspText },
                { id: "incomplete", l: "Chưa hoàn thành", v: e.todo, c: C.marigold, t: C.marigoldText },
              ].map((x) => (
                <div key={x.id} data-overview-metric={x.id} className="vmp-overview-progress__row" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 999,
                                 background: x.c, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700,
                                 flex: 1 }}>{x.l}</span>
                  <div style={{ width: 88, height: 6, borderRadius: 999,
                                background: C.surfaceSunk, overflow: "hidden" }}>
                    <div style={{ width: `${e.total ? (x.v / e.total) * 100 : 0}%`,
                                  height: "100%", background: x.c }} />
                  </div>
                  <span data-overview-value style={{ fontFamily: NUM, fontSize: 20, fontWeight: 800,
                                 color: x.t, minWidth: 34, textAlign: "right" }}>{x.v}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 15, paddingTop: 13, borderTop: `1px solid ${C.line}`,
                          fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>
              Hồ sơ hoàn thiện: <b style={{ color: C.plum }}>{d.rate}%</b> ({d.done}/{d.total})
              {gap > 0 && (
                <span style={{ color: C.marigoldText }}>
                  {" · lệch "}{gap} hạng mục ({gapPts} điểm%)
                </span>
              )}
            </div>
          </div>
        } />
      </Card>

      {/* CẨN THẬN: hai con số này KHÁC NHAU và trước đây cùng mang nhãn "Quá hạn"
          trên một màn hình — 162 vs 279 — nên không ai biết tin số nào.
          · e.over  = trạng thái hạng mục đang là "quá hạn"
          · overdue = hạng mục active chưa hoàn thành có deadline VMP đã trôi qua
            theo ngày Bangkok, kể cả khi trạng thái tổng chưa chuyển. */}
      {/* MỘT chỉ số quá hạn, không phải hai. Bản trước để "Quá hạn (trạng
          thái) 208" và "Có mốc đã quá hạn 268" cạnh nhau, người mới nhìn
          tưởng web tính sai. Nay lấy con số RỘNG hơn (theo mốc) làm chỉ số
          chính vì đó mới là thứ phải xử, và nói thẳng chênh lệch là gì. */}
      <StatTile cls="b-k1" icon={AlertCircle} label="Trễ đích VMP" value={overdue.length}
        metricId="vmp-overdue"
        tone={{ c: C.raspText, bg: C.raspSoft }} onClick={di(destinations.overdue)}
        sub={overdue.length
          ? `${e.over} đã đổi trạng thái · ${Math.max(0, overdue.length - e.over)} mốc đã trôi mà trạng thái chưa đổi`
          : "Không còn hạng mục nào trễ"} />

      <StatTile cls="b-k2" icon={Clock} label="Tới hạn đích VMP 30 ngày" value={soon.length}
        tone={{ c: C.marigoldText, bg: C.marigoldSoft }} onClick={di(destinations.soon)}
        sub={soon.length ? "Theo dõi để không rơi sang quá hạn" : "Tháng tới đang trống"} />

      {/* Ô thứ tư là CHẤT LƯỢNG DỮ LIỆU, không phải một chỉ số tiến độ nữa.
          Lý do: mọi con số còn lại trên trang đều chỉ đáng tin bằng đúng chất
          lượng của dữ liệu dưới nó. Đặt nó ngang hàng với ba chỉ số kia là
          nói rằng nó quan trọng ngang chúng — và đúng là như vậy. */}
      <StatTile cls="b-k4" icon={FileWarning} label="Vấn đề dữ liệu" value={soLoiDl}
        tone={soLoiDl > 0 ? { c: C.marigoldText, bg: C.marigoldSoft } : { c: C.mintText, bg: C.mintSoft }}
        onClick={di(destinations.dataQuality)}
        sub={soLoiDl
          ? `${soLoiDl} vấn đề được phát hiện · trong đó ${mismatched.length} lệch pha`
          : "Không phát hiện vấn đề nào"} />

      <div className="b-vali">
        <PrincessCommentary stats={{
          e, d, overdue: overdue.length, soon: soon.length, mismatched: mismatched.length,
        }} />
      </div>

      <section className="b-sau overview-analysis-studio" data-overview-analysis-studio
        aria-labelledby="overview-analysis-title">
        <header className="overview-analysis-studio__header">
          <span className="overview-analysis-studio__eyebrow">Phân tích chuyên sâu</span>
          <h2 id="overview-analysis-title">Dòng chảy, điểm nghẽn và cơ cấu</h2>
          <p>
            Đọc lần lượt từ giai đoạn đang hụt, nơi tập trung vấn đề đến nhóm đang dẫn hoặc tụt lại.
          </p>
        </header>
        <CompletionDashboard acts={acts} matrix={<MaTranTienDo acts={acts} />} />
      </section>
    </div>
  );
}

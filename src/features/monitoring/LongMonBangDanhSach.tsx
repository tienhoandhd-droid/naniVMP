/* =====================================================================
 *  LongMonBangDanhSach.tsx — chế độ xem BẢNG của màn Dòng thời gian
 *  ---------------------------------------------------------------------
 *  Cặp với bức tranh Long Môn (cặp nút "Ngư đồ | Bảng" ở TimelinePage).
 *  Trả lời thẳng câu hỏi "hạng mục nào sắp đến hạn?": sắp theo mức khẩn,
 *  lọc theo tình trạng, KHÔNG cắt danh sách, bấm dòng mở hồ sơ như bấm cá.
 *  Model thuần ở bangDanhSachModel.ts (có unit test riêng).
 * ===================================================================== */
import { memo, useMemo, useState } from "react";
import type { Activity } from "../../types/domain.ts";
import {
  buildBangDanhSach,
  NHAN_TINH_TRANG,
  type BangLoc,
  type BangTinhTrang,
} from "./bangDanhSachModel.ts";

const CAC_NUT_LOC: readonly BangLoc[] = [
  "all", "overdue", "today", "soon", "future", "missing", "done",
];

function LongMonBangDanhSach({ activities, now, soonDays, onOpen }: {
  activities: readonly Activity[];
  now: Date;
  soonDays: number;
  onOpen: (a: Activity) => void;
}) {
  const [loc, setLoc] = useState<BangLoc>("all");
  const ds = useMemo(
    () => buildBangDanhSach(activities, now, soonDays, loc),
    [activities, now, soonDays, loc],
  );
  const theoId = useMemo(() => {
    const m = new Map<string, Activity>();
    for (const a of activities) m.set(String(a.id), a);
    return m;
  }, [activities]);

  return (
    <section className="long-mon-bang" aria-label="Bảng hạn VMP — chế độ xem danh sách">
      <div className="long-mon-bang__loc" role="group" aria-label="Lọc theo tình trạng hạn">
        {CAC_NUT_LOC.map((k) => (
          <button key={k} type="button" data-bang-loc={k}
            aria-pressed={loc === k}
            onClick={() => setLoc(k)}>
            {k === "all" ? `Tất cả (${ds.total})` : `${NHAN_TINH_TRANG[k]} (${ds.counts[k as BangTinhTrang]})`}
          </button>
        ))}
      </div>
      {ds.rows.length === 0 ? (
        <p className="long-mon-bang__rong" role="status">
          Không có hạng mục nào ở tình trạng này trong phạm vi đang xem.
        </p>
      ) : (
        <div className="long-mon-bang__cuon" data-lp-scroll="ngang">
          <table>
            <thead>
              <tr>
                <th scope="col">Mã</th>
                <th scope="col">Tên hạng mục</th>
                <th scope="col">Phụ trách</th>
                <th scope="col">Hạn VMP</th>
                <th scope="col">Còn lại</th>
                <th scope="col">Tình trạng</th>
              </tr>
            </thead>
            <tbody>
              {ds.rows.map((r) => {
                const goc = theoId.get(r.id);
                return (
                  <tr key={r.id} data-bang-kind={r.kind}>
                    <td className="tnum">{r.code}</td>
                    <td>
                      {goc ? (
                        <button type="button" className="long-mon-bang__mo"
                          onClick={() => onOpen(goc)}>{r.name || r.code}</button>
                      ) : (r.name || r.code)}
                    </td>
                    <td>{r.owner || "—"}</td>
                    <td className="tnum">{r.deadline ?? "—"}</td>
                    <td className="tnum">
                      {r.daysRemaining === null ? "—"
                        : r.daysRemaining < 0 ? `trễ ${-r.daysRemaining} ngày`
                        : r.daysRemaining === 0 ? "hôm nay"
                        : `${r.daysRemaining} ngày`}
                    </td>
                    <td><span className="long-mon-bang__tag" data-bang-tag={r.kind}>{NHAN_TINH_TRANG[r.kind]}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default memo(LongMonBangDanhSach);

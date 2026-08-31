/* =====================================================================
 *  bangDanhSachModel.ts — model thuần cho chế độ xem BẢNG của màn
 *  Dòng thời gian (cặp nút "Ngư đồ | Bảng", 31/08/2026).
 *  ---------------------------------------------------------------------
 *  Vì sao tồn tại: sau khi workbench Gantt bị bỏ, màn chỉ còn bức tranh —
 *  câu hỏi "hạng mục nào sắp đến hạn?" phải trả lời bằng mắt. Danh sách
 *  trong LongMonRaceGuard chính là thứ người dùng cần nhưng bị giấu sau
 *  error boundary; model này nâng nó thành chế độ xem chính thức.
 *  Không React — node --test chạy thẳng.
 * ===================================================================== */
import type { Activity } from "../../types/domain.ts";
import {
  classifyVmpDeadline,
  type VmpDeadlineState,
} from "../../lib/vmpDeadlineModel.ts";

export type BangTinhTrang = VmpDeadlineState["kind"];
export type BangLoc = BangTinhTrang | "all";

export interface BangDong {
  id: string;
  code: string;
  name: string;
  owner: string;
  deadline: string | null;
  daysRemaining: number | null;
  kind: BangTinhTrang;
}

export interface BangDanhSach {
  rows: BangDong[];
  /** Đếm theo tình trạng TRƯỚC bộ lọc — để nút lọc hiện con số. */
  counts: Record<BangTinhTrang, number>;
  total: number;
}

/** Thứ tự nhóm khi sắp: việc phải xử trước, việc xong/thiếu hạn sau cùng. */
const THU_TU_NHOM: Record<BangTinhTrang, number> = {
  overdue: 0, today: 1, soon: 2, future: 3, missing: 4, done: 5,
};

export function buildBangDanhSach(
  activities: readonly Activity[],
  now: Date,
  soonDays: number,
  loc: BangLoc = "all",
): BangDanhSach {
  const counts: Record<BangTinhTrang, number> = {
    overdue: 0, today: 0, soon: 0, future: 0, missing: 0, done: 0,
  };
  const tatCa: BangDong[] = activities.map((a) => {
    const st = classifyVmpDeadline(a, now, soonDays);
    counts[st.kind] += 1;
    return {
      id: String(a.id),
      code: String(a.code ?? ""),
      name: String(a.name ?? a.objName ?? ""),
      owner: String(a.owner_name ?? a.owner ?? ""),
      deadline: st.date,
      daysRemaining: st.daysRemaining,
      kind: st.kind,
    };
  });
  const rows = tatCa
    .filter((r) => loc === "all" || r.kind === loc)
    .sort((x, y) =>
      THU_TU_NHOM[x.kind] - THU_TU_NHOM[y.kind]
      || String(x.deadline ?? "9999").localeCompare(String(y.deadline ?? "9999"))
      || x.code.localeCompare(y.code));
  return { rows, counts, total: activities.length };
}

export const NHAN_TINH_TRANG: Record<BangTinhTrang, string> = {
  overdue: "Quá hạn",
  today: "Đến hạn hôm nay",
  soon: "Sắp đến hạn",
  future: "Còn thời gian",
  missing: "Chưa có hạn",
  done: "Đã xong",
};

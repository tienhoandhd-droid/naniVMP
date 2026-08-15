/* =====================================================================
 *  navigationContract.ts — nơi DUY NHẤT quyết định "mở màn nào"
 *  ---------------------------------------------------------------------
 *  Trước đây có hai bản sao cùng làm việc này: `THU_TU_DU_PHONG` trong
 *  access.ts, và một danh sách alias rải trong App.tsx. Hai bản sao của
 *  cùng một luật thì sớm muộn cũng lệch nhau, mà đây lại là luật quyết
 *  định người dùng nhìn thấy gì — lệch ở đây nghĩa là có người vào được
 *  màn họ không có quyền, hoặc bị đá khỏi màn họ có quyền.
 *
 *  Hai hàm, hai việc tách bạch:
 *    · resolveViewIntent      — chuẩn hoá tên màn, KHÔNG xét quyền
 *    · resolveAuthorizedView  — xét quyền trên tên đã chuẩn hoá
 *
 *  Tách như vậy để không ai lỡ xét quyền trên chính chuỗi alias: cấp
 *  `risk` mà chặn `alerts` thì vẫn phải bị chặn, vì `risk` chỉ là tên
 *  gọi khác của `alerts`.
 * ===================================================================== */
import type { AccessContext, ScreenId } from "./access.ts";
import { laScreenId } from "./access.ts";

/** Thứ tự nhóm trên sidebar — spec §7.1: làm việc trước, giám sát sau. */
export const NAV_GROUP_ORDER = ["work", "monitor", "analysis", "admin"] as const;

/** Thứ tự rơi về khi màn được yêu cầu bị cấm.
 *
 *  `today` đứng đầu chứ không phải `overview`: đây là màn "việc của tôi
 *  hôm nay", an toàn nhất và có ích với mọi vai. Rơi về một màn tổng hợp
 *  toàn nhà máy khi người dùng chỉ có quyền hẹp là vừa vô ích vừa dễ
 *  khiến họ tưởng mình mất quyền. */
export const ORDERED_SCREEN_IDS: readonly ScreenId[] = [
  "today", "progress", "source",
  "overview", "timeline", "alerts",
  "workload", "reports", "rules",
  "people", "accounts", "phanquyen", "health", "audit", "admin",
];

/** Cách trình bày kèm theo, khi một alias mang thêm ý nghĩa. */
export type ViewPresentation = "grouped-object";

export interface ResolvedViewIntent {
  screenId: ScreenId;
  presentation?: ViewPresentation;
}

/**
 * Chuẩn hoá tên màn. KHÔNG xét quyền.
 *
 * `inventory` là tên cũ của "Cập nhật tiến độ nhóm theo đối tượng" — nó
 * mang theo cách trình bày, nên không được rút gọn thành `progress` trơn:
 * làm thế là im lặng đánh mất ý định của đường dẫn người dùng đã lưu.
 */
export function resolveViewIntent(input: unknown): ResolvedViewIntent | null {
  if (typeof input !== "string") return null;
  const v = input.trim();
  if (v === "inventory") return { screenId: "progress", presentation: "grouped-object" };
  if (v === "risk") return { screenId: "alerts" };
  if (laScreenId(v)) return { screenId: v };
  return null;
}

/**
 * Chuẩn hoá rồi mới xét quyền, và chỉ xét trên tên chuẩn.
 *
 * Không vào được thì rơi về màn đầu tiên trong `ORDERED_SCREEN_IDS` mà
 * người dùng có quyền. Không còn màn nào thì trả null để nơi gọi hiện
 * một trang giải thích, thay vì nhảy vòng giữa các màn đều bị cấm.
 */
export function resolveAuthorizedView(
  input: unknown,
  access: AccessContext,
): ResolvedViewIntent | null {
  const y = resolveViewIntent(input);
  if (y && access.canView(y.screenId)) return y;

  for (const id of ORDERED_SCREEN_IDS) {
    if (access.canView(id)) return { screenId: id };
  }
  return null;
}

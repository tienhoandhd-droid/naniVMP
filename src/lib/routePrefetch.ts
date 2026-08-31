import { nhapCoThuLai } from "./tailMan.ts";
import type { ScreenId } from "./access.ts";

export interface DesktopPrefetchContext {
  desktop: boolean;
  saveData: boolean;
}

/* Chỉ các màn desktop đã có ngân sách chunk riêng mới được nạp trước khi
 * người dùng chọn. Timeline, ExcelJS và bản đồ 3D cố ý không có trong bảng
 * này: hover menu không được biến thành tải một tính năng nặng không cần. */
const DESKTOP_ROUTE_IMPORTS: Partial<Record<ScreenId, () => Promise<unknown>>> = {
  reports: () => import("../components/dashboard/ReportsView.tsx"),
  alerts: () => import("../pages/AlertsPage.tsx"),
  progress: () => import("../pages/UpdatePage.tsx"),
  source: () => import("../pages/SourceCatalogPage.tsx"),
  workload: () => import("../pages/WorkloadPage.tsx"),
  rules: () => import("../pages/ActiveRulesPage.tsx"),
  phanquyen: () => import("../pages/PhanQuyenPage.tsx"),
};

export function canPrefetchDesktopRoute(
  screenId: ScreenId,
  context: DesktopPrefetchContext,
): boolean {
  return context.desktop && !context.saveData && screenId in DESKTOP_ROUTE_IMPORTS;
}

function currentContext(): DesktopPrefetchContext {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { desktop: false, saveData: false };
  }
  const connection = navigator as Navigator & { connection?: { saveData?: boolean } };
  return {
    desktop: window.matchMedia("(min-width: 761px)").matches,
    saveData: connection.connection?.saveData === true,
  };
}

/** Nạp trước đúng một chunk route sau intent desktop (hover/focus). */
export function prefetchDesktopRoute(screenId: ScreenId): void {
  const context = currentContext();
  if (!canPrefetchDesktopRoute(screenId, context)) return;
  const load = DESKTOP_ROUTE_IMPORTS[screenId];
  if (!load) return;
  void nhapCoThuLai(load)();
}

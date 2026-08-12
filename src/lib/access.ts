/* =====================================================================
 *  access.ts — Quyền MÀN HÌNH, đọc từ server
 *  ---------------------------------------------------------------------
 *  Phân biệt với `src/features/itemPermissions/`: bên đó lo quyền theo
 *  TỪNG HẠNG MỤC (ai sửa được cột nào của hạng mục nào). File này lo một
 *  câu hỏi khác và thô hơn: ai được MỞ màn hình nào. Hai lớp không thay
 *  thế nhau — mở được màn không có nghĩa là sửa được dòng trong đó.
 *
 *  Nguồn quyền là `rpc_my_ui_access()` của Supabase. File này chỉ đọc kết
 *  quả và trả lời ba câu tách bạch cho từng màn:
 *
 *      1. Có được thấy màn này không?      → canView(screenId)
 *      2. Được xem phạm vi dữ liệu nào?    → scope(screenId)
 *      3. Được làm hành động nào?          → can(screenId, action)
 *
 *  Ẩn menu KHÔNG phải là bảo mật. Biên chặn thật nằm ở RLS/RPC bên
 *  Supabase; phần này chỉ trình bày đúng những gì server đã quyết.
 *
 *  Không dùng React ở đây, để `node --test` chạy được mà không cần DOM.
 * ===================================================================== */
import type { AppUser } from "../types/domain.ts";

/* ---------------------------------------------------------------------
 *  Danh sách màn hình
 *  -------------------------------------------------------------------
 *  Phải phủ HẾT mọi hash mà App.tsx render, không chỉ những mục có trong
 *  NAV_ITEMS. Ba mục dưới đây không nằm trong menu nhưng vẫn vào được:
 *
 *    inventory — App.tsx render `view === "inventory"`; giữ có chủ ý để
 *                đường dẫn cũ người dùng đã lưu không chết.
 *    risk      — dùng chung màn với `alerts`, là hash hợp lệ đang lưu hành.
 *    phanquyen — màn Phân quyền hiện tại. Kế hoạch tách thành `people` và
 *                `accounts`, nhưng hai trang đó chưa tồn tại nên hash này
 *                vẫn là cửa vào thật, không phải cửa tương thích.
 *
 *  Bỏ sót một hash ở đây là để nó lọt qua mà không ai kiểm quyền.
 * ------------------------------------------------------------------- */
export const SCREEN_IDS = [
  "today",
  "overview",
  "timeline",
  "alerts",
  "risk",
  "progress",
  "inventory",
  "source",
  "workload",
  "reports",
  "rules",
  "people",
  "health",
  "audit",
  "accounts",
  "admin",
  "phanquyen",
] as const;

export type ScreenId = (typeof SCREEN_IDS)[number];

const SCREEN_ID_SET: ReadonlySet<string> = new Set(SCREEN_IDS);

export function laScreenId(v: unknown): v is ScreenId {
  return typeof v === "string" && SCREEN_ID_SET.has(v);
}

/** Thứ tự rơi về khi màn đang mở không được phép. `overview` đứng đầu vì
 *  đó cũng là màn mặc định của urlState. */
const THU_TU_DU_PHONG: readonly ScreenId[] = [
  "overview",
  "today",
  "timeline",
  "alerts",
  "progress",
  "source",
  "reports",
  "workload",
  "rules",
  "people",
  "health",
  "audit",
  "accounts",
  "admin",
];

/* ---------- Vai trò nghiệp vụ và phạm vi dữ liệu ---------- */

export const BUSINESS_ROLES = [
  "admin",
  "qa_manager",
  "qa_staff",
  "workshop_manager",
  "workshop_staff",
  "viewer",
] as const;
export type BusinessRole = (typeof BUSINESS_ROLES)[number];

export const DATA_SCOPES = ["all", "workshop", "assigned", "own", "none"] as const;
export type DataScope = (typeof DATA_SCOPES)[number];

/** `preview` = đang đối chiếu, KHÔNG khoá ai. `enforced` = quyền có hiệu lực.
 *  Cùng ý nghĩa với `ItemPermissionMode` của lớp quyền theo hạng mục, nhưng
 *  là cờ riêng (`screen_access_mode`) vì hai lớp bật/tắt độc lập. */
export type AccessMode = "preview" | "enforced";

export interface ScreenPermission {
  canView: boolean;
  dataScope: DataScope;
  actions: ReadonlySet<string>;
}

export interface AccessContext {
  mode: AccessMode;
  /** null khi server chưa giải được vai trò nghiệp vụ của tài khoản này. */
  businessRole: BusinessRole | null;
  /** Vì sao không giải được — để màn hình nói được câu có ích thay vì trắng. */
  unresolvedReason: string | null;
  screens: Readonly<Record<string, ScreenPermission>>;
  canView(screenId: string): boolean;
  can(screenId: string, action: string): boolean;
  scope(screenId: string): DataScope;
}

const TU_CHOI: ScreenPermission = {
  canView: false,
  dataScope: "none",
  actions: new Set<string>(),
};

/* ---------- Đọc payload ---------- */

function laObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function docMode(v: unknown): AccessMode {
  // Thiếu hoặc lạ thì coi như đang thực thi: chặt hơn là lỏng.
  return v === "preview" ? "preview" : "enforced";
}

function docBusinessRole(v: unknown): BusinessRole | null {
  return typeof v === "string" && (BUSINESS_ROLES as readonly string[]).includes(v)
    ? (v as BusinessRole)
    : null;
}

function docScope(v: unknown): DataScope {
  // Phạm vi lạ KHÔNG được hiểu thành "all". Một lỗi chính tả ở server mà
  // được đọc rộng ra là một vụ rò dữ liệu.
  return typeof v === "string" && (DATA_SCOPES as readonly string[]).includes(v)
    ? (v as DataScope)
    : "none";
}

function docActions(v: unknown): ReadonlySet<string> {
  if (!Array.isArray(v)) return new Set<string>();
  return new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0));
}

function docQuyenMotMan(v: unknown): ScreenPermission {
  if (!laObject(v)) return TU_CHOI;
  const canView = v.can_view === true;
  // Không thấy màn thì không có hành động nào — kể cả khi server lỡ gửi kèm.
  if (!canView) return TU_CHOI;
  return { canView: true, dataScope: docScope(v.data_scope), actions: docActions(v.actions) };
}

function dungContext(
  mode: AccessMode,
  businessRole: BusinessRole | null,
  unresolvedReason: string | null,
  screens: Record<string, ScreenPermission>,
): AccessContext {
  const lay = (screenId: string): ScreenPermission => screens[screenId] ?? TU_CHOI;
  return {
    mode,
    businessRole,
    unresolvedReason,
    screens,
    canView: (screenId) => lay(screenId).canView,
    scope: (screenId) => lay(screenId).dataScope,
    can: (screenId, action) => {
      const q = lay(screenId);
      return q.canView && q.actions.has(action);
    },
  };
}

/**
 * Đọc JSON của `rpc_my_ui_access()` thành ngữ cảnh quyền.
 *
 * Mặc định TỪ CHỐI ở mọi chỗ không đọc được: vai trò lạ, màn hình không
 * nằm trong danh sách đã duyệt, phạm vi lạ, payload hỏng. Hàm không bao
 * giờ ném lỗi — payload rác phải cho ra ngữ cảnh không quyền, chứ không
 * làm trắng cả ứng dụng.
 *
 * Ngoại lệ có chủ đích: ở chế độ `preview`, `business_role` có thể là null
 * mà `screens` vẫn có nội dung, vì server trả quyền theo đường cũ để đối
 * chiếu. Không được coi `business_role === null` là cớ để xoá sạch quyền.
 */
export function parseAccessContext(payload: unknown): AccessContext {
  if (!laObject(payload)) return dungContext("enforced", null, null, {});

  const screens: Record<string, ScreenPermission> = {};
  const raw = payload.screens;
  if (laObject(raw)) {
    for (const [screenId, quyen] of Object.entries(raw)) {
      // Màn hình không có trong danh sách đã duyệt thì bỏ qua, không tin.
      if (!laScreenId(screenId)) continue;
      screens[screenId] = docQuyenMotMan(quyen);
    }
  }

  const lyDo = payload.unresolved_reason;
  return dungContext(
    docMode(payload.mode),
    docBusinessRole(payload.business_role),
    typeof lyDo === "string" && lyDo.length > 0 ? lyDo : null,
    screens,
  );
}

/* ---------------------------------------------------------------------
 *  Đường lùi khi server chưa có rpc_my_ui_access
 *  -------------------------------------------------------------------
 *  Migration phân quyền màn hình đi sau bản web này. Trong lúc RPC chưa
 *  tồn tại, gọi nó sẽ lỗi — và nếu lúc đó coi là "không có quyền gì" thì
 *  mọi người mất sạch menu chỉ vì thứ tự triển khai.
 *
 *  Hàm dưới đây tái tạo ĐÚNG luật đang chạy trong Layout.tsx trước khi
 *  đổi, không phải một phiên bản gần đúng:
 *      isAdmin            = role === "admin"
 *      canOpenPermissions = isAdmin | role qa_manager | accessClass
 *                           qa_manager hoặc equipment_manager
 *      phanquyen ← canOpenPermissions;  health/audit/admin ← isAdmin
 *  Luôn đánh dấu `preview` để không chỗ nào nhầm đây là quyền thật.
 * ------------------------------------------------------------------- */

/** Ba màn quản trị đang gắn `adminOnly` trong NAV_ITEMS. `phanquyen` không
 *  nằm đây vì nó có luật riêng rộng hơn. */
const MAN_CHI_ADMIN: readonly ScreenId[] = ["health", "audit", "admin"];

/** Hai màn của kế hoạch tách Phân quyền. Chưa có route nên chưa mở cho ai. */
const MAN_CHUA_TON_TAI: readonly ScreenId[] = ["people", "accounts"];

const HANH_DONG_ADMIN = [
  "edit_catalog",
  "edit_operational_people",
  "generate_timeline",
  "edit_vertical_timeline",
  "record_actual_validation_date",
  "assign_workshop_staff",
  "view_workload",
  "view_rules",
  "manage_accounts",
  "manage_authorization_policy",
];

export function legacyAccessContext(user: AppUser | null | undefined): AccessContext {
  const laAdmin = user?.role === "admin";
  const moDuocPhanQuyen = laAdmin
    || user?.role === "qa_manager"
    || user?.accessClass === "qa_manager"
    || user?.accessClass === "equipment_manager";

  const screens: Record<string, ScreenPermission> = {};
  for (const id of SCREEN_IDS) {
    let thay: boolean;
    if (MAN_CHUA_TON_TAI.includes(id)) thay = false;
    else if (id === "phanquyen") thay = moDuocPhanQuyen;
    else if (MAN_CHI_ADMIN.includes(id)) thay = laAdmin;
    else thay = !!user;

    screens[id] = thay
      ? {
          canView: true,
          dataScope: "all",
          actions: new Set(laAdmin ? HANH_DONG_ADMIN : ["view"]),
        }
      : TU_CHOI;
  }
  return dungContext("preview", null, "legacy_fallback", screens);
}

/**
 * Ở chế độ `preview`: hiển thị theo quyền CŨ, nhưng giữ kết quả resolver
 * của server để đối chiếu.
 *
 * Vì sao không dùng thẳng `screens` server trả về, dù server ở preview cũng
 * cố dựng lại luật cũ: server chỉ biết những gì có trong database, còn luật
 * cũ đọc `user.accessClass` của phiên đang đăng nhập. Hai nguồn đó lệch
 * nhau ngay lúc này — bảy hồ sơ trên live có `access_class` NULL — nên tin
 * server ở preview là âm thầm đổi menu của người đang dùng.
 *
 * Preview phải nghĩa là KHÔNG đổi gì. `businessRole` và `unresolvedReason`
 * vẫn lấy từ server, vì đó chính là thứ cần đối chiếu trước khi bật enforce.
 */
export function hopNhatPreview(
  quyenCu: AccessContext,
  tuServer: AccessContext,
): AccessContext {
  return {
    ...quyenCu,
    mode: "preview",
    businessRole: tuServer.businessRole,
    unresolvedReason: tuServer.unresolvedReason,
  };
}

/* ---------- Chuyển hướng an toàn ---------- */

/**
 * Trả về màn nên hiển thị khi người dùng mở thẳng `requested`.
 *
 * - Được phép  → giữ nguyên `requested`.
 * - Không được → màn đầu tiên trong thứ tự dự phòng mà họ vào được.
 * - Không còn màn nào → null, để bên gọi hiện trang giải thích thay vì
 *   nhảy vòng quanh giữa các màn đều bị cấm.
 */
export function firstAllowedScreen(
  access: AccessContext,
  requested: string,
): ScreenId | null {
  if (laScreenId(requested) && access.canView(requested)) return requested;
  for (const id of THU_TU_DU_PHONG) {
    if (access.canView(id)) return id;
  }
  return null;
}

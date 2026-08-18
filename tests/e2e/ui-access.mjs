/* =====================================================================
 *  ui-access.mjs — payload mẫu của rpc_my_ui_access cho bộ kiểm E2E
 *  ---------------------------------------------------------------------
 *  Từ 2026-08-12 menu và điều hướng đọc quyền màn hình từ server, và server
 *  tra theo `auth.uid()` thật chứ không theo thứ trình duyệt tự khai. Nghĩa
 *  là một bộ kiểm không còn "đổi vai" được bằng cách sửa localStorage hay
 *  trả access_class khác từ vmp_performers — đó chính là điều đợt phân
 *  quyền màn hình muốn đạt.
 *
 *  Nên bộ kiểm phải giả lập ở đúng chỗ: chính RPC đó.
 *
 *  Hai lớp quyền độc lập, đừng lẫn:
 *    · lớp MÀN HÌNH  (file này)          → mở được màn nào
 *    · lớp HẠNG MỤC  (item_permissions)  → sửa được cột nào của hạng mục nào
 *  Bộ kiểm nào đang soi lớp hạng mục thì dùng `uiAccessAdmin` để vào được
 *  màn, rồi kiểm phần nó thật sự quan tâm.
 * ===================================================================== */

const MAN_HINH = [
  "today", "overview", "timeline", "alerts", "risk", "progress", "inventory",
  "source", "workload", "reports", "rules", "people", "health", "audit",
  "accounts", "admin", "phanquyen",
];

const HANH_DONG_ADMIN = [
  "edit_catalog", "edit_operational_people", "generate_timeline",
  "edit_vertical_timeline", "record_actual_validation_date",
  "assign_workshop_staff", "view_workload", "view_rules",
  "manage_accounts", "manage_authorization_policy",
];

/** Admin thấy đủ 17 màn, phạm vi toàn hệ thống. */
export const uiAccessAdmin = {
  ok: true,
  mode: "enforced",
  business_role: "admin",
  unresolved_reason: null,
  screens: Object.fromEntries(MAN_HINH.map((id) => [id, {
    can_view: true,
    data_scope: "all",
    actions: HANH_DONG_ADMIN,
  }])),
};

/**
 * Quản lý xưởng: 9 màn phạm vi xưởng, cộng `phanquyen` là cửa vào chức
 * năng phân công — `data_scope` của nó là 'none' vì màn đó không mang dữ
 * liệu, xem migration 20260812100000.
 */
export const uiAccessQuanLyXuong = {
  ok: true,
  mode: "enforced",
  business_role: "workshop_manager",
  unresolved_reason: null,
  screens: {
    today: xuong(["view"]),
    overview: xuong(["view"]),
    timeline: xuong(["view"]),
    alerts: xuong(["view"]),
    risk: xuong(["view"]),
    reports: xuong(["view"]),
    source: xuong(["view"]),
    progress: xuong(["assign_workshop_staff", "record_actual_validation_date"]),
    inventory: xuong(["assign_workshop_staff", "record_actual_validation_date"]),
    phanquyen: { can_view: true, data_scope: "none", actions: ["assign_workshop_staff"] },
  },
};

function xuong(actions) {
  return { can_view: true, data_scope: "workshop", actions };
}

/** Khớp mọi đường gọi tới rpc_my_ui_access, kể cả preflight OPTIONS. */
/** Quản lý QA: thấy mọi màn nghiệp vụ, sửa danh mục và hồ sơ nhân sự,
 *  nhưng KHÔNG có `accounts`/`admin` — theo đúng bảng quyền server
 *  (20260812090000_six_business_roles_and_screen_access.sql). */
export const uiAccessQuanLyQa = {
  ok: true,
  mode: "enforced",
  business_role: "qa_manager",
  unresolved_reason: null,
  screens: Object.fromEntries(MAN_HINH
    .filter((id) => id !== "accounts" && id !== "admin")
    .map((id) => [id, {
      can_view: true,
      data_scope: id === "phanquyen" ? "none" : "all",
      actions: id === "source" ? ["edit_catalog", "generate_timeline"]
        : id === "people" ? ["edit_operational_people"]
          : id === "progress" || id === "inventory" ? ["edit_vertical_timeline"]
            : id === "workload" ? ["view_workload"]
              : id === "rules" ? ["view_rules"]
                : ["view"],
    }])),
};

export const LA_UI_ACCESS = /\/rpc\/rpc_my_ui_access/;

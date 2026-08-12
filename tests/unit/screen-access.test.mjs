import test from "node:test";
import assert from "node:assert/strict";

import {
  parseAccessContext,
  legacyAccessContext,
  firstAllowedScreen,
  SCREEN_IDS,
} from "../../src/lib/access.ts";

/* Payload mẫu — đúng hình dạng rpc_my_ui_access() trả về. */

const managerPayload = {
  ok: true,
  mode: "enforced",
  business_role: "workshop_manager",
  unresolved_reason: null,
  screens: {
    overview: { can_view: true, data_scope: "workshop", actions: ["view"] },
    progress: {
      can_view: true,
      data_scope: "workshop",
      actions: ["record_actual_validation_date", "assign_workshop_staff"],
    },
    workload: { can_view: false, data_scope: "none", actions: [] },
  },
};

const staffPayload = {
  ok: true,
  mode: "enforced",
  business_role: "workshop_staff",
  unresolved_reason: null,
  screens: {
    overview: { can_view: true, data_scope: "workshop", actions: ["view"] },
    progress: {
      can_view: true,
      data_scope: "workshop",
      actions: ["record_actual_validation_date"],
    },
    workload: { can_view: false, data_scope: "none", actions: [] },
  },
};

const viewerPayload = {
  ok: true,
  mode: "enforced",
  business_role: "viewer",
  unresolved_reason: null,
  screens: {
    overview: { can_view: true, data_scope: "all", actions: ["view"] },
    timeline: { can_view: true, data_scope: "all", actions: ["view"] },
    progress: { can_view: false, data_scope: "none", actions: [] },
    admin: { can_view: false, data_scope: "none", actions: [] },
  },
};

test("Quản lý xưởng và Nhân viên xưởng thấy giống nhau, chỉ khác hành động", () => {
  const manager = parseAccessContext(managerPayload);
  const staff = parseAccessContext(staffPayload);

  assert.equal(manager.canView("overview"), true);
  assert.equal(staff.canView("overview"), true);
  assert.equal(manager.scope("overview"), "workshop");
  assert.equal(staff.scope("overview"), "workshop");

  assert.equal(manager.can("progress", "assign_workshop_staff"), true);
  assert.equal(staff.can("progress", "assign_workshop_staff"), false);
  assert.equal(staff.can("progress", "record_actual_validation_date"), true);
});

test("màn hình không có trong payload thì mặc định từ chối", () => {
  const staff = parseAccessContext(staffPayload);
  assert.equal(staff.canView("accounts"), false);
  assert.equal(staff.scope("accounts"), "none");
  assert.equal(staff.can("accounts", "manage_accounts"), false);
});

test("vai trò, phạm vi và màn hình lạ đều bị từ chối, không đoán rộng ra", () => {
  const ctx = parseAccessContext({
    ok: true,
    mode: "enforced",
    business_role: "giam_doc",
    screens: {
      overview: { can_view: true, data_scope: "toan_bo", actions: ["view"] },
      man_hinh_la: { can_view: true, data_scope: "all", actions: ["view"] },
    },
  });
  assert.equal(ctx.businessRole, null);
  assert.equal(ctx.scope("overview"), "none");
  assert.equal(ctx.canView("man_hinh_la"), false);
});

test("payload hỏng cho ra ngữ cảnh từ chối hết, không ném lỗi", () => {
  for (const rac of [null, undefined, 42, "chuoi", {}, { screens: "khong-phai-object" }]) {
    const ctx = parseAccessContext(rac);
    assert.equal(ctx.businessRole, null);
    assert.equal(SCREEN_IDS.every((id) => ctx.canView(id) === false), true);
  }
});

test("chế độ preview giữ nguyên screens dù chưa giải được vai trò", () => {
  const ctx = parseAccessContext({
    ok: true,
    mode: "preview",
    business_role: null,
    unresolved_reason: "missing_access_class",
    screens: {
      overview: { can_view: true, data_scope: "all", actions: ["view"] },
      progress: { can_view: true, data_scope: "all", actions: ["edit_vertical_timeline"] },
    },
  });
  assert.equal(ctx.mode, "preview");
  assert.equal(ctx.businessRole, null);
  assert.equal(ctx.unresolvedReason, "missing_access_class");
  // businessRole rỗng KHÔNG được dùng làm cớ để dọn sạch quyền.
  assert.equal(ctx.canView("overview"), true);
  assert.equal(ctx.canView("progress"), true);
});

test("chế độ enforced mà không giải được vai trò thì không thấy màn nào", () => {
  const ctx = parseAccessContext({
    ok: true,
    mode: "enforced",
    business_role: null,
    unresolved_reason: "no_person_link",
    screens: {},
  });
  assert.equal(ctx.mode, "enforced");
  assert.equal(ctx.unresolvedReason, "no_person_link");
  assert.equal(ctx.canView("overview"), false);
});

/* Đường lùi phải tái tạo ĐÚNG luật đang chạy trong Layout.tsx trước khi đổi,
   nếu không việc chuyển sang quyền do server cấp sẽ âm thầm đổi menu của
   người đang dùng. */

test("đường lùi giữ nguyên luật mở màn Phân quyền hiện hành", () => {
  const admin = legacyAccessContext({ name: "A", role: "admin", perm: "admin" });
  assert.equal(admin.canView("phanquyen"), true);
  assert.equal(admin.canView("admin"), true);
  assert.equal(admin.canView("audit"), true);
  assert.equal(admin.canView("health"), true);

  const qaManagerTheoRole = legacyAccessContext({ name: "B", role: "qa_manager", perm: "admin" });
  assert.equal(qaManagerTheoRole.canView("phanquyen"), true);
  assert.equal(qaManagerTheoRole.canView("admin"), false);
  assert.equal(qaManagerTheoRole.canView("audit"), false);

  const qaManagerTheoAccessClass = legacyAccessContext({
    name: "C", role: "department_user", perm: "edit", accessClass: "qa_manager",
  });
  assert.equal(qaManagerTheoAccessClass.canView("phanquyen"), true);

  const quanLyThietBi = legacyAccessContext({
    name: "D", role: "department_user", perm: "edit", accessClass: "equipment_manager",
  });
  assert.equal(quanLyThietBi.canView("phanquyen"), true);

  const nhanVien = legacyAccessContext({
    name: "E", role: "department_user", perm: "edit", accessClass: "qa_progress_editor",
  });
  assert.equal(nhanVien.canView("phanquyen"), false);
  assert.equal(nhanVien.canView("overview"), true);
  assert.equal(nhanVien.canView("progress"), true);
  assert.equal(nhanVien.canView("inventory"), true);
});

test("đường lùi không mở hai màn chưa có route", () => {
  const admin = legacyAccessContext({ name: "A", role: "admin", perm: "admin" });
  assert.equal(admin.canView("people"), false);
  assert.equal(admin.canView("accounts"), false);
});

test("đường lùi không bao giờ ở chế độ enforced", () => {
  for (const role of ["admin", "qa_manager", "department_user", "viewer"]) {
    assert.equal(legacyAccessContext({ name: "X", role, perm: "view" }).mode, "preview");
  }
  assert.equal(legacyAccessContext(null).canView("overview"), false);
});

test("mở thẳng hash không được phép thì chuyển về màn cho phép đầu tiên", () => {
  const viewer = parseAccessContext(viewerPayload);
  assert.equal(firstAllowedScreen(viewer, "admin"), "overview");
  assert.equal(firstAllowedScreen(viewer, "timeline"), "timeline");
});

test("không còn màn nào thì trả null thay vì nhảy vòng quanh", () => {
  const ctx = parseAccessContext({ ok: true, mode: "enforced", business_role: null, screens: {} });
  assert.equal(firstAllowedScreen(ctx, "overview"), null);
});

test("danh sách màn phủ cả ba route ngoài menu", () => {
  // inventory và risk vẫn được App.tsx render dù không có trong NAV_ITEMS;
  // phanquyen là cửa vào thật của màn Phân quyền hiện tại.
  for (const id of ["inventory", "risk", "phanquyen"]) {
    assert.ok(SCREEN_IDS.includes(id), `SCREEN_IDS phải có ${id}`);
  }
  assert.equal(SCREEN_IDS.length, 17);
  assert.equal(new Set(SCREEN_IDS).size, 17);
});

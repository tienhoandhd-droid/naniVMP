import test from "node:test";
import assert from "node:assert/strict";

import { resolveAuthorizedView } from "../../src/lib/navigationContract.ts";

import {
  parseAccessContext,
  legacyAccessContext,
  SCREEN_IDS,
  BUSINESS_ROLES,
  BUSINESS_ROLE_LABELS,
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
  /* Server CÓ cấp `health` và `audit` cho Quản lý QA
     (20260812090000_six_business_roles_and_screen_access.sql). Bản trước
     của đường lùi để riêng admin — lệch theo hướng nguy hiểm: ngày RPC
     hỏng, Quản lý QA mất hai màn họ vẫn dùng hằng ngày và tưởng web hỏng. */
  assert.equal(qaManagerTheoRole.canView("audit"), true);
  assert.equal(qaManagerTheoRole.canView("health"), true);

  /* Và cấp đúng những hành động server cấp — không hơn. Thiếu thì họ mất
     việc; thừa `manage_accounts` thì họ thấy nút mà RPC chắc chắn từ chối. */
  assert.equal(qaManagerTheoRole.can("source", "edit_catalog"), true);
  assert.equal(qaManagerTheoRole.can("source", "generate_timeline"), true);
  assert.equal(qaManagerTheoRole.can("people", "edit_operational_people"), true);
  assert.equal(qaManagerTheoRole.can("progress", "edit_vertical_timeline"), true);
  assert.equal(qaManagerTheoRole.can("accounts", "manage_accounts"), false);
  assert.equal(qaManagerTheoRole.can("accounts", "manage_authorization_policy"), false);

  /* Nhân viên QA và người thường vẫn chỉ xem — đường lùi không được nới
     tay cho mọi vai chỉ vì vừa nới cho một vai. */
  const nhanVienQa = legacyAccessContext({
    name: "F", role: "department_user", perm: "edit", accessClass: "qa_progress_editor",
  });
  assert.equal(nhanVienQa.can("source", "edit_catalog"), false);
  assert.equal(nhanVienQa.can("people", "edit_operational_people"), false);
  assert.equal(nhanVienQa.canView("audit"), false);

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

test("đường lùi không bao giờ ở chế độ enforced", () => {
  for (const role of ["admin", "qa_manager", "department_user", "viewer"]) {
    assert.equal(legacyAccessContext({ name: "X", role, perm: "view" }).mode, "preview");
  }
  assert.equal(legacyAccessContext(null).canView("overview"), false);
});

/* Việc "mở màn nào" nay do src/lib/navigationContract.ts quyết định — hai
   bài kiểm dưới đây gọi qua đó thay vì gọi bản sao cũ trong access.ts.
   Chi tiết đầy đủ nằm ở tests/unit/navigation-contract.test.mjs. */
test("mở thẳng hash không được phép thì chuyển về màn cho phép đầu tiên", () => {
  const viewer = parseAccessContext(viewerPayload);
  assert.equal(resolveAuthorizedView("admin", viewer)?.screenId, "overview");
  assert.equal(resolveAuthorizedView("timeline", viewer)?.screenId, "timeline");
});

test("không còn màn nào thì trả null thay vì nhảy vòng quanh", () => {
  const ctx = parseAccessContext({ ok: true, mode: "enforced", business_role: null, screens: {} });
  assert.equal(resolveAuthorizedView("overview", ctx), null);
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

/* Preview phải nghĩa là KHÔNG đổi gì. Server ở preview cũng cố dựng lại luật
   cũ, nhưng nó chỉ biết dữ liệu trong database, còn luật cũ đọc accessClass
   của phiên đang đăng nhập — hai nguồn đang lệch nhau trên live. */
test("preview giữ menu theo quyền cũ, chỉ lấy kết quả resolver để đối chiếu", async () => {
  const { hopNhatPreview } = await import("../../src/lib/access.ts");

  const quyenCu = legacyAccessContext({
    name: "Quản lý xưởng", role: "department_user", perm: "edit",
    accessClass: "equipment_manager",
  });
  // Server chưa thấy access_class nào nên nó giấu màn Phân quyền.
  const tuServer = parseAccessContext({
    ok: true, mode: "preview", business_role: null,
    unresolved_reason: "missing_access_class",
    screens: { phanquyen: { can_view: false, data_scope: "none", actions: [] } },
  });

  const ketQua = hopNhatPreview(quyenCu, tuServer);

  assert.equal(ketQua.mode, "preview");
  // Menu vẫn theo quyền cũ: người này đang thấy màn Phân quyền thì phải giữ.
  assert.equal(ketQua.canView("phanquyen"), true);
  // Nhưng kết quả đối chiếu của server vẫn giữ nguyên để admin xem trước.
  assert.equal(ketQua.businessRole, null);
  assert.equal(ketQua.unresolvedReason, "missing_access_class");
});

/* Hai màn tách ra từ Phân quyền. Đường lùi phải khớp luật đang chạy, nếu
   không việc tách màn sẽ âm thầm đổi ai vào được chỗ nào. */
test("đường lùi mở đúng người cho hai màn mới", () => {
  const admin = legacyAccessContext({ name: "A", role: "admin", perm: "admin" });
  assert.equal(admin.canView("people"), true);
  assert.equal(admin.canView("accounts"), true);

  // Quản lý QA: sửa dữ liệu nhân sự được, nhưng không đụng vòng đời tài khoản.
  for (const u of [
    { name: "B", role: "qa_manager", perm: "admin" },
    { name: "C", role: "department_user", perm: "edit", accessClass: "qa_manager" },
  ]) {
    const ctx = legacyAccessContext(u);
    assert.equal(ctx.canView("people"), true, `${u.name} phải xem được Nhân sự`);
    assert.equal(ctx.canView("accounts"), false, `${u.name} không được vào Tài khoản`);
  }

  // Quản lý xưởng dùng cửa cũ `phanquyen` để phân công thiết bị, không phải
  // màn Nhân sự.
  const xuong = legacyAccessContext({
    name: "D", role: "department_user", perm: "edit", accessClass: "equipment_manager",
  });
  assert.equal(xuong.canView("phanquyen"), true);
  assert.equal(xuong.canView("people"), false);
  assert.equal(xuong.canView("accounts"), false);
});

test("ở enforced, quyền hai màn mới lấy từ server chứ không đoán", () => {
  const qaManager = parseAccessContext({
    ok: true, mode: "enforced", business_role: "qa_manager", unresolved_reason: null,
    screens: {
      people: { can_view: true, data_scope: "all", actions: ["edit_operational_people"] },
      accounts: { can_view: false, data_scope: "none", actions: [] },
    },
  });
  assert.equal(qaManager.can("people", "edit_operational_people"), true);
  assert.equal(qaManager.can("accounts", "manage_accounts"), false);
  assert.equal(qaManager.canView("accounts"), false);
});

/* ---- Nhãn vai nghiệp vụ (dọn user?.perm, hậu Đợt B) ---- */
test("mọi vai nghiệp vụ đều có nhãn hiển thị tiếng Việt", () => {
  for (const vai of BUSINESS_ROLES) {
    assert.equal(typeof BUSINESS_ROLE_LABELS[vai], "string");
    assert.ok(BUSINESS_ROLE_LABELS[vai].length > 1, `thiếu nhãn cho ${vai}`);
  }
});

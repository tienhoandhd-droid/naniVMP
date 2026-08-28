import test from "node:test";
import assert from "node:assert/strict";

import { resolveAuthorizedView } from "../../src/lib/navigationContract.ts";
import {
  parseAccessContext,
  SCREEN_IDS,
  BUSINESS_ROLES,
  BUSINESS_ROLE_LABELS,
} from "../../src/lib/access.ts";
import { BUSINESS_ROLE_CATALOG } from "../../src/lib/businessRoles.ts";

const managerPayload = {
  ok: true, mode: "enforced", business_role: "workshop_manager", unresolved_reason: null,
  screens: {
    overview: { can_view: true, data_scope: "workshop", actions: ["view"] },
    progress: { can_view: true, data_scope: "workshop", actions: ["record_actual_validation_date", "assign_workshop_staff"] },
    workload: { can_view: false, data_scope: "none", actions: [] },
  },
};

const staffPayload = {
  ok: true, mode: "enforced", business_role: "workshop_staff", unresolved_reason: null,
  screens: {
    overview: { can_view: true, data_scope: "workshop", actions: ["view"] },
    progress: { can_view: true, data_scope: "workshop", actions: ["record_actual_validation_date"] },
    workload: { can_view: false, data_scope: "none", actions: [] },
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
    ok: true, mode: "enforced", business_role: "giam_doc",
    screens: {
      overview: { can_view: true, data_scope: "toan_bo", actions: ["view"] },
      man_hinh_la: { can_view: true, data_scope: "all", actions: ["view"] },
    },
  });
  assert.equal(ctx.businessRole, null);
  assert.equal(ctx.scope("overview"), "none");
  assert.equal(ctx.canView("man_hinh_la"), false);
});

test("hợp đồng frontend chỉ có đúng năm vai nghiệp vụ và Viewer cũ không cấp quyền", () => {
  assert.deepEqual(BUSINESS_ROLES, [
    "admin", "qa_manager", "qa_staff", "workshop_manager", "workshop_staff",
  ]);
  assert.equal("viewer" in BUSINESS_ROLE_LABELS, false);

  const legacyViewer = parseAccessContext({
    ok: true, mode: "enforced", business_role: "viewer",
    screens: { overview: { can_view: true, data_scope: "all", actions: ["view"] } },
  });
  assert.equal(legacyViewer.businessRole, null);
  assert.equal(legacyViewer.canView("overview"), false);
});

test("payload hỏng cho ra ngữ cảnh từ chối hết, không ném lỗi", () => {
  for (const rac of [null, undefined, 42, "chuoi", {}, { screens: "khong-phai-object" }]) {
    const ctx = parseAccessContext(rac);
    assert.equal(ctx.businessRole, null);
    assert.equal(SCREEN_IDS.every((id) => ctx.canView(id) === false), true);
  }
});

test("payload RPC không xác nhận ok tuyệt đối không cấp quyền", () => {
  const ctx = parseAccessContext({
    ok: false, mode: "enforced", business_role: "admin",
    screens: { overview: { can_view: true, data_scope: "all", actions: ["view"] } },
  });
  assert.equal(ctx.businessRole, null);
  assert.equal(ctx.canView("overview"), false);
});

test("payload RPC thiếu bản đồ screens cũng không phải quyền hợp lệ", () => {
  const ctx = parseAccessContext({ ok: true, mode: "enforced", business_role: "admin" });
  assert.equal(ctx.businessRole, null);
  assert.equal(ctx.canView("overview"), false);
});

test("preview chỉ cấp quyền khi server trả payload tường minh", () => {
  const ctx = parseAccessContext({
    ok: true, mode: "preview", business_role: "qa_manager", unresolved_reason: null,
    screens: { overview: { can_view: true, data_scope: "all", actions: ["view"] } },
  });
  assert.equal(ctx.mode, "preview");
  assert.equal(ctx.businessRole, "qa_manager");
  assert.equal(ctx.unresolvedReason, null);
  assert.equal(ctx.canView("overview"), true);
});

test("mọi mục Quản trị fail-closed với vai ngoài Admin kể cả payload preview cấp nhầm", () => {
  const screens = Object.fromEntries(
    ["accounts", "phanquyen", "health", "audit", "admin"].map((id) => [id, {
      can_view: true, data_scope: "all", actions: ["view", "manage_accounts"],
    }]),
  );
  const qa = parseAccessContext({
    ok: true, mode: "preview", business_role: "qa_manager", unresolved_reason: null, screens,
  });
  for (const id of Object.keys(screens)) {
    assert.equal(qa.canView(id), false, `${id} phải bị đóng với Quản lý QA`);
    assert.equal(qa.scope(id), "none");
    assert.equal(qa.can(id, "view"), false);
  }

  const admin = parseAccessContext({
    ok: true, mode: "preview", business_role: "admin", unresolved_reason: null, screens,
  });
  assert.equal(admin.canView("health"), true);
  assert.equal(admin.canView("phanquyen"), true);
});

test("chế độ enforced mà không giải được vai trò thì không thấy màn nào", () => {
  const ctx = parseAccessContext({
    ok: true, mode: "enforced", business_role: null, unresolved_reason: "no_person_link", screens: {},
  });
  assert.equal(ctx.mode, "enforced");
  assert.equal(ctx.unresolvedReason, "no_person_link");
  assert.equal(ctx.canView("overview"), false);
});

test("mở thẳng hash không được phép thì chuyển về màn cho phép đầu tiên", () => {
  const staff = parseAccessContext(staffPayload);
  assert.equal(resolveAuthorizedView("admin", staff)?.screenId, "progress");
  assert.equal(resolveAuthorizedView("progress", staff)?.screenId, "progress");
});

test("không còn màn nào thì trả null thay vì nhảy vòng quanh", () => {
  const ctx = parseAccessContext({ ok: true, mode: "enforced", business_role: null, screens: {} });
  assert.equal(resolveAuthorizedView("overview", ctx), null);
});

test("danh sách màn phủ các route ngoài menu còn được hỗ trợ", () => {
  for (const id of ["inventory", "risk", "phanquyen"]) {
    assert.ok(SCREEN_IDS.includes(id), `SCREEN_IDS phải có ${id}`);
  }
  assert.equal(SCREEN_IDS.includes("people"), false);
  assert.equal(SCREEN_IDS.length, 16);
  assert.equal(new Set(SCREEN_IDS).size, 16);
});

test("grant people lịch sử từ server bị frontend bỏ qua", () => {
  const qaManager = parseAccessContext({
    ok: true, mode: "enforced", business_role: "qa_manager", unresolved_reason: null,
    screens: {
      people: { can_view: true, data_scope: "all", actions: ["edit_operational_people"] },
      today: { can_view: true, data_scope: "all", actions: ["view"] },
      overview: { can_view: true, data_scope: "all", actions: ["view"] },
      accounts: { can_view: false, data_scope: "none", actions: [] },
    },
  });
  assert.equal(qaManager.canView("people"), false);
  assert.equal(qaManager.can("people", "edit_operational_people"), false);
  assert.equal(resolveAuthorizedView("people", qaManager)?.screenId, "today");
  assert.equal(qaManager.can("accounts", "manage_accounts"), false);
  assert.equal(qaManager.canView("accounts"), false);
});

test("URL people rơi về màn đầu tiên thực sự được cấp, không khóa cứng một đích", () => {
  const chiTongQuan = parseAccessContext({
    ok: true, mode: "enforced", business_role: "qa_staff", unresolved_reason: null,
    screens: { overview: { can_view: true, data_scope: "all", actions: ["view"] } },
  });
  assert.equal(resolveAuthorizedView("people", chiTongQuan)?.screenId, "overview");
});

test("mọi vai nghiệp vụ hiệu lực đều có nhãn hiển thị tiếng Việt", () => {
  for (const vai of BUSINESS_ROLES) {
    assert.equal(typeof BUSINESS_ROLE_LABELS[vai], "string");
    assert.ok(BUSINESS_ROLE_LABELS[vai].length > 1, `thiếu nhãn cho ${vai}`);
    assert.equal(BUSINESS_ROLE_LABELS[vai], BUSINESS_ROLE_CATALOG[vai].label);
  }
});

test("danh sách chọn vai của quản trị cũng chỉ xuất năm vai hiệu lực", async () => {
  const { VAI_NGHIEP_VU } = await import("../../src/lib/supabaseData.ts");
  assert.deepEqual(VAI_NGHIEP_VU.map((vai) => vai.id), BUSINESS_ROLES);
});

test("RPC quyền cũ không thể ghi đè zero access sau khi đổi danh tính", async () => {
  const { AccessRequestGate } = await import("../../src/hooks/useAccess.ts");
  const gate = new AccessRequestGate();
  const requestA = gate.begin("user-a|admin|");

  gate.ensureIdentity("user-b|department_user|workshop_staff");
  const requestB = gate.begin("user-b|department_user|workshop_staff");

  assert.equal(gate.zeroAccess().canView("overview"), false);
  assert.equal(gate.isCurrent(requestA), false, "thành công/lỗi muộn của A phải bị bỏ");
  assert.equal(gate.isCurrent(requestB), true, "chỉ request của B còn hiệu lực");
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  accountForAllowedEmail,
  managementWorkspaceFor,
} from "../../src/lib/managementVisibility.ts";

test("chỉ Admin vào khu vực quản trị", () => {
  assert.equal(managementWorkspaceFor({
    businessRole: "admin",
    can: (screen, action) => screen === "accounts"
      && ["manage_accounts", "manage_authorization_policy"].includes(action),
  }), "admin-management");
  assert.equal(managementWorkspaceFor({
    businessRole: "qa_manager",
    can: () => true,
  }), "denied", "cấp nhầm capability cũng không được mở quản trị cho Quản lý QA");
  assert.equal(managementWorkspaceFor({
    businessRole: "qa_staff",
    can: () => true,
  }), "denied");
  assert.equal(managementWorkspaceFor({
    businessRole: "workshop_manager",
    can: (screen, action) => screen === "phanquyen" && action === "assign_workshop_staff",
  }), "denied", "cấp nhầm capability cũng không được mở Quản trị cho Quản lý xưởng");
});

test("allowlist nhận tài khoản bằng email Auth dù email danh bạ khác", () => {
  const roles = [{
    user_id: "user-1",
    email: "account@example.test",
    business_role: "qa_staff",
    unresolved_reason: null,
  }];
  const people = [{
    user_id: "user-1",
    email: "performer@example.test",
    ten: "Người đã nối",
    co_tai_khoan: true,
  }];

  assert.deepEqual(accountForAllowedEmail(" ACCOUNT@example.test ", roles, people), {
    exists: true,
    name: "Người đã nối",
    userId: "user-1",
  });
  assert.deepEqual(accountForAllowedEmail("missing@example.test", roles, people), {
    exists: false,
    name: null,
    userId: null,
  });
});

test("migration khóa phanquyen với mọi vai ngoài Admin", async () => {
  const migration = await readFile(new URL(
    "../../supabase/migrations/20260828130000_admin_only_management_visibility.sql",
    import.meta.url,
  ), "utf8");

  assert.match(migration, /screen_id\s+in\s*\(\s*'phanquyen'\s*,\s*'health'\s*,\s*'audit'\s*,\s*'admin'\s*\)/i);
  assert.match(migration, /business_role\s*<>\s*'admin'/i);
  assert.match(migration, /can_view\s*=\s*false/i);
  assert.match(migration, /data_scope\s*=\s*'none'/i);
  assert.match(migration, /actions\s*=\s*'\{\}'::text\[\]/i);
  assert.match(migration, /business_role\s*=\s*'admin'[\s\S]*can_view/i);
  assert.match(migration, /rpc_business_roles__five_role_impl_20260824/i);
  assert.match(migration, /duoc_phep\s*\(\s*'admin_users'\s*,\s*'admin'\s*\)/i);
});

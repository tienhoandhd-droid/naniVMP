import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readRepositoryFile(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

test("quản trị vai chỉ còn ở Vai trò & phạm vi", async () => {
  const page = await readRepositoryFile("src/pages/PhanQuyenPage.tsx");
  const app = await readRepositoryFile("src/App.tsx");

  assert.match(page, /AccountAdministrationPanel/);
  assert.match(page, /canManageAccounts=\{duocQuanLyTaiKhoan\}/);
  assert.match(page, /AccountRoleEditor/);
  assert.doesNotMatch(app, /theoEmail/);
  assert.doesNotMatch(app, /window\.prompt\(/);
  assert.doesNotMatch(app, /setBusinessRole/);
  assert.doesNotMatch(app, /setUserActive/);
  assert.doesNotMatch(app, /aria-label=\{`Vai của/);
  assert.doesNotMatch(app, /Người dùng &amp; phân quyền/);
});

test("thao tác tài khoản chỉ mở bằng capability server", async () => {
  const page = await readRepositoryFile("src/pages/PhanQuyenPage.tsx");
  assert.match(page, /access\?\.can\("accounts", "manage_accounts"\)/);
  assert.match(page, /canEdit=\{duocQuanLyTaiKhoan\}/);
  assert.doesNotMatch(page, /window\.prompt\(/);
});

test("thay đổi chỉ ở frontend, không thêm SQL hoặc tab Nhân sự", async () => {
  const navigation = await readRepositoryFile("src/constants/vmp.ts");
  assert.doesNotMatch(navigation, /id:\s*["'](?:people|nhansu|nhan-su)["']/i);
});

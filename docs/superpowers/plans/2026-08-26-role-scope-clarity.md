# Role and Scope Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hợp nhất quản trị vai trò vào màn **Vai trò & phạm vi**, chỉ nối dữ liệu bằng ID, hiển thị checklist sẵn sàng và buộc đổi vai qua bản nháp → đối chiếu → lý do → lưu.

**Architecture:** Một catalog frontend là nguồn duy nhất cho năm vai. Một model thuần ghép ba nguồn RPC hiện có bằng `user_id/person_id`, tính readiness và cung cấp dữ liệu cho panel/editor mới; trang Quản trị bỏ bảng đổi vai trùng lặp sau khi chức năng đổi vai và bật/tắt tài khoản đã được chuyển sang màn **Vai trò & phạm vi**.

**Tech Stack:** React 19, TypeScript, Supabase RPC hiện có, Node test runner + `tsx`, Puppeteer E2E, Vite.

## Global Constraints

- Nền bắt buộc: `origin/main` tại `642e2b6103b682d3c82f776dbd688c453071de57`.
- Chỉ sửa frontend, unit/E2E và tài liệu; không tạo migration, SQL, Edge Function hoặc Auth workflow.
- Không ghi production và không dùng production credential trong test.
- Chỉ có đúng năm vai nghiệp vụ; không tái sinh Viewer.
- Email/tên chỉ để hiển thị/tìm kiếm, không chọn mutation target.
- Không diễn giải scope rỗng thành “toàn bộ”.
- Không `window.prompt`; mutation không tự retry.
- Tối đa ba fix wave; final Sol review phải đạt 0 Critical/0 Important.
- Không force-push; chỉ fast-forward `ui/role-scope-clarity:main` sau full gates.

Task 3 và Task 4 có thể được thực hiện đồng thời trong hai worktree cách ly được tạo từ HEAD sau Task 2 vì interface giữa chúng đã khóa ở kế hoạch này. Primary cherry-pick Task 3 trước, Task 4 sau, inspect cả hai diff rồi chạy lại focused regression trên cây đã ghép. Không cho hai implementer sửa cùng worktree.

---

### Task 1: Catalog năm vai dùng chung

**Files:**
- Create: `src/lib/businessRoles.ts`
- Modify: `src/lib/access.ts`
- Modify: `src/lib/supabaseData.ts`
- Modify: `src/features/itemPermissions/types.ts`
- Modify: `src/features/itemPermissions/ItemPermissionModeCard.tsx`
- Create: `tests/unit/business-roles.test.mjs`
- Modify: `tests/unit/screen-access.test.mjs`
- Modify: `tests/unit/item-permission-contracts.test.mjs`

**Interfaces:**
- Produces:

```ts
export const BUSINESS_ROLE_IDS = [
  "admin", "qa_manager", "qa_staff", "workshop_manager", "workshop_staff",
] as const;
export type BusinessRole = typeof BUSINESS_ROLE_IDS[number];
export type BusinessScopeMode = "role_policy" | "qa_assignment" | "hierarchy";
export interface BusinessRoleDefinition {
  id: BusinessRole;
  label: string;
  description: string;
  scopeMode: BusinessScopeMode;
}
export const BUSINESS_ROLE_CATALOG: Readonly<Record<BusinessRole, BusinessRoleDefinition>>;
export const BUSINESS_ROLE_LABELS: Readonly<Record<BusinessRole, string>>;
export function isBusinessRole(value: unknown): value is BusinessRole;
export function businessRoleLabel(value: BusinessRole | null): string;
```

- Compatibility: `access.ts` re-export `BUSINESS_ROLE_IDS as BUSINESS_ROLES`, `BusinessRole` và `BUSINESS_ROLE_LABELS`. `VAI_NGHIEP_VU` phải derive từ catalog.

- [ ] **Step 1: Viết test RED cho một nguồn từ vựng**

```js
test("catalog chỉ có đúng năm vai nghiệp vụ", async () => {
  const { BUSINESS_ROLE_IDS, BUSINESS_ROLE_CATALOG } = await import("../../src/lib/businessRoles.ts");
  assert.deepEqual(BUSINESS_ROLE_IDS, [
    "admin", "qa_manager", "qa_staff", "workshop_manager", "workshop_staff",
  ]);
  assert.equal(Object.values(BUSINESS_ROLE_CATALOG).some((role) => role.id === "viewer"), false);
  assert.equal(BUSINESS_ROLE_CATALOG.qa_staff.label, "Nhân viên QA");
  assert.equal(BUSINESS_ROLE_CATALOG.workshop_staff.scopeMode, "hierarchy");
});
```

- [ ] **Step 2: Chạy test để quan sát RED**

Run:

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/business-roles.test.mjs
```

Expected: FAIL vì `src/lib/businessRoles.ts` chưa tồn tại.

- [ ] **Step 3: Tạo catalog và thay các khai báo lặp**

```ts
export const BUSINESS_ROLE_CATALOG = {
  admin: { id: "admin", label: "Quản trị", description: "Toàn quyền theo chính sách hệ thống", scopeMode: "role_policy" },
  qa_manager: { id: "qa_manager", label: "Quản lý QA", description: "Theo chính sách của vai Quản lý QA", scopeMode: "role_policy" },
  qa_staff: { id: "qa_staff", label: "Nhân viên QA", description: "Theo phân công QA", scopeMode: "qa_assignment" },
  workshop_manager: { id: "workshop_manager", label: "Quản lý xưởng", description: "Theo phạm vi phân cấp canonical", scopeMode: "hierarchy" },
  workshop_staff: { id: "workshop_staff", label: "Nhân viên xưởng", description: "Theo phạm vi canonical và phân công", scopeMode: "hierarchy" },
} as const satisfies Readonly<Record<BusinessRole, BusinessRoleDefinition>>;
```

Xóa hướng dẫn chọn Viewer trong `types.ts`; legacy decoder vẫn nhận nhưng không cho chọn mới. `ItemPermissionModeCard` dùng nhãn chung, không giữ bảng nhãn thứ hai.

- [ ] **Step 4: Chạy focused GREEN và typecheck**

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test \
  tests/unit/business-roles.test.mjs \
  tests/unit/screen-access.test.mjs \
  tests/unit/item-permission-contracts.test.mjs
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run typecheck
```

Expected: tất cả pass, typecheck exit 0.

- [ ] **Step 5: Inspect và commit Task 1**

```bash
git diff --check
git add src/lib/businessRoles.ts src/lib/access.ts src/lib/supabaseData.ts \
  src/features/itemPermissions/types.ts \
  src/features/itemPermissions/ItemPermissionModeCard.tsx \
  tests/unit/business-roles.test.mjs tests/unit/screen-access.test.mjs \
  tests/unit/item-permission-contracts.test.mjs
git commit -m "refactor(roles): centralize five-role vocabulary"
```

---

### Task 2: Read-model chỉ nối bằng ID

**Files:**
- Create: `src/features/accountAdministration/accountAdministrationModel.ts`
- Create: `tests/unit/account-administration-model.test.mjs`

**Interfaces:**
- Consumes: `BusinessRole`, `BusinessScopeMode`, `NguoiQuyenRow`, `VaiNghiepVuRow`, `DirectoryPerson`.
- Produces:

```ts
export type ReadinessState = "ready" | "missing" | "not_applicable" | "unknown";
export type ReadinessKey = "account" | "person_link" | "business_role" | "department" | "scope" | "assignment";
export interface ReadinessItem {
  key: ReadinessKey;
  label: string;
  state: ReadinessState;
  detail: string;
  nextAction: string | null;
}
export interface AccountAdministrationSources {
  accounts: readonly NguoiQuyenRow[];
  roles: readonly VaiNghiepVuRow[];
  directory: readonly DirectoryPerson[];
}
export interface AccountAdministrationRow {
  key: string;
  userId: string | null;
  personId: string | null;
  name: string;
  email: string | null;
  accountDepartment: string | null;
  personDepartment: string | null;
  accountActive: boolean;
  businessRole: BusinessRole | null;
  unresolvedReason: string | null;
  scopeMode: BusinessScopeMode | null;
  scopeSummary: string;
  readiness: readonly ReadinessItem[];
  sourceAccount: NguoiQuyenRow;
  directoryPerson: DirectoryPerson | null;
}
export function buildAccountAdministrationRows(sources: AccountAdministrationSources): AccountAdministrationRow[];
export interface RoleChangePlan {
  userId: string;
  currentRole: BusinessRole | null;
  nextRole: BusinessRole;
  department: string | null;
  scopeMode: BusinessScopeMode;
  canSave: boolean;
  blocker: string | null;
}
export function planBusinessRoleChange(row: AccountAdministrationRow, nextRole: BusinessRole): RoleChangePlan;
```

- [ ] **Step 1: Viết fixture RED cho join ID và readiness**

```js
test("không ghép hai tài khoản trùng email bằng email", async () => {
  const rows = buildAccountAdministrationRows({
    accounts: [account({ user_id: "user-a", pid: "person-a", email: "same@vmp.test" })],
    roles: [role({ user_id: "user-b", email: "same@vmp.test", business_role: "qa_manager" })],
    directory: [person({ person_id: "person-a", user_id: "user-a" })],
  });
  assert.equal(rows[0].businessRole, null);
  assert.equal(rows[0].unresolvedReason, "role_source_missing");
});
```

Thêm fixture: inactive, chưa nối, unresolved, QA scope rỗng, workshop thiếu từng tầng, UUID mismatch và dòng không join vẫn hiện.

- [ ] **Step 2: Chạy test để quan sát RED**

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/account-administration-model.test.mjs
```

Expected: FAIL vì model chưa tồn tại.

- [ ] **Step 3: Implement model tối thiểu**

```ts
const rolesByUserId = new Map(sources.roles.map((role) => [role.user_id, role]));
const peopleByPersonId = new Map(sources.directory.map((person) => [person.person_id, person]));
return sources.accounts.map((account) => {
  const effectiveRole = account.user_id ? rolesByUserId.get(account.user_id) ?? null : null;
  const person = account.pid ? peopleByPersonId.get(account.pid) ?? null : null;
  // Không có fallback email/tên ở đây.
  return buildRow(account, effectiveRole, person);
});
```

Quy tắc assignment: admin/managers `not_applicable`; staff có `so_phan_cong > 0` là `ready`, bằng 0 là `missing`; role/source chưa đủ là `unknown`. Mỗi `missing` có một `nextAction` khác rỗng.

- [ ] **Step 4: Chạy GREEN và typecheck**

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/account-administration-model.test.mjs
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run typecheck
```

- [ ] **Step 5: Commit Task 2**

```bash
git diff --check
git add src/features/accountAdministration/accountAdministrationModel.ts \
  tests/unit/account-administration-model.test.mjs
git commit -m "feat(accounts): derive ID-based readiness"
```

---

### Task 3: Editor bản nháp, đối chiếu và lưu đúng một lần

**Files:**
- Create: `src/features/accountAdministration/AccountRoleEditor.tsx`
- Create: `tests/unit/account-role-editor.test.mjs`

**Interfaces:**
- Consumes: `AccountAdministrationRow`, `BusinessRole`, `setBusinessRole` signature.
- Produces:

```ts
export interface RoleDraft {
  targetUserId: string;
  originalRole: BusinessRole | null;
  nextRole: BusinessRole;
  department: string | null;
  reason: string;
}
export type RoleCommitOutcome =
  | { kind: "verified"; row: AccountAdministrationRow }
  | { kind: "stale" }
  | { kind: "rejected"; message: string }
  | { kind: "written_unverified"; message: string }
  | { kind: "mismatch"; actualRole: BusinessRole | null };
export async function commitRoleDraft(args: {
  draft: RoleDraft;
  mutate: (userId: string, role: BusinessRole, department: string | null, reason: string) => Promise<{ ok: boolean; error?: string }>;
  reload: (userId: string) => Promise<AccountAdministrationRow | null>;
  isCurrent: (userId: string) => boolean;
}): Promise<RoleCommitOutcome>;
export interface AccountRoleEditorProps {
  row: AccountAdministrationRow;
  canEdit: boolean;
  mutateRole: typeof setBusinessRole;
  reloadByUserId: (userId: string) => Promise<AccountAdministrationRow | null>;
  onVerified: (row: AccountAdministrationRow) => void;
}
```

- [ ] **Step 1: Viết RED cho orchestration và markup**

```js
test("lưu gọi mutation một lần với UUID rồi đối chiếu lại", async () => {
  const calls = [];
  const outcome = await commitRoleDraft({
    draft: { targetUserId: "user-a", originalRole: "qa_staff", nextRole: "qa_manager", department: "qa", reason: "Điều chuyển" },
    mutate: async (...args) => { calls.push(args); return { ok: true }; },
    reload: async () => row({ userId: "user-a", businessRole: "qa_manager" }),
    isCurrent: (id) => id === "user-a",
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["user-a", "qa_manager", "qa", "Điều chuyển"]);
  assert.equal(outcome.kind, "verified");
});
```

Thêm test rejected, reload exception, mismatch, A/B stale và SSR có “Đối chiếu thay đổi”, “Lý do”, “Hủy”, “Lưu thay đổi”.

- [ ] **Step 2: Chạy RED**

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/account-role-editor.test.mjs
```

- [ ] **Step 3: Implement editor tối thiểu**

Select chỉ cập nhật state. Save disabled khi plan bị chặn hoặc `reason.trim()` rỗng. `commitRoleDraft` gọi mutate đúng một lần; reload lỗi trả `written_unverified`, không gọi mutate lần hai. Hủy reset role/reason và không gọi mutation.

- [ ] **Step 4: Chạy GREEN và typecheck**

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/account-role-editor.test.mjs
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run typecheck
```

- [ ] **Step 5: Commit Task 3**

```bash
git add src/features/accountAdministration/AccountRoleEditor.tsx \
  tests/unit/account-role-editor.test.mjs
git commit -m "feat(accounts): review role changes before save"
```

---

### Task 4: Panel quản trị và phục hồi từng nguồn

**Files:**
- Create: `src/features/accountAdministration/AccountAdministrationPanel.tsx`
- Create: `tests/unit/account-administration-panel.test.mjs`

**Interfaces:**
- Consumes: Task 2 model, Task 3 editor, `fetchNguoiVaQuyen`, `fetchVaiNghiepVu`, `searchPermissionDirectory`, `setUserActive`.
- Produces:

```ts
export type AccountSourceName = "accounts" | "roles" | "directory";
export interface AccountAdministrationSnapshot {
  rows: AccountAdministrationRow[];
  errors: Partial<Record<AccountSourceName, string>>;
}
export interface AccountAdministrationLoaders {
  loadAccounts: () => Promise<NguoiVaQuyen>;
  loadRoles: () => Promise<VaiNghiepVuRow[]>;
  loadDirectory: () => Promise<DirectoryPerson[]>;
}
export async function loadAccountAdministrationSnapshot(loaders: AccountAdministrationLoaders): Promise<AccountAdministrationSnapshot>;
export interface AccountAdministrationPanelProps {
  canManageAccounts: boolean;
  loaders?: AccountAdministrationLoaders;
  mutateRole?: typeof setBusinessRole;
  mutateActive?: typeof setUserActive;
}
```

- [ ] **Step 1: Viết RED cho partial failure và quyền thao tác**

```js
test("roles lỗi vẫn giữ account rows và báo nguồn chưa xác minh", async () => {
  const snapshot = await loadAccountAdministrationSnapshot({
    loadAccounts: async () => ({ tongHangMuc: 0, nguoi: [account()] }),
    loadRoles: async () => { throw new Error("roles down"); },
    loadDirectory: async () => [person()],
  });
  assert.equal(snapshot.rows.length, 1);
  assert.equal(snapshot.errors.roles, "roles down");
});
```

Thêm test accounts failure, directory failure, retry read-only, sáu checklist labels, inactive/unknown badges, non-manager không có controls và activation dùng đúng `userId`.

- [ ] **Step 2: Chạy RED**

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/account-administration-panel.test.mjs
```

- [ ] **Step 3: Implement loader/panel**

Dùng `Promise.allSettled`; accounts lỗi tạo trạng thái lỗi chính, roles/directory lỗi giữ rows với readiness `unknown`. Retry chỉ gọi loader đọc. Chuyển nút bật/tắt tài khoản vào panel, target luôn `row.userId`. Bấm **Tắt** hoặc **Bật lại** chỉ mở bản nháp cục bộ gồm UUID đích, trạng thái hiện tại, trạng thái mới và ô lý do; **Hủy** không gọi RPC, còn **Xác nhận** gọi `setUserActive(userId, nextActive, reason.trim())` đúng một lần. Lỗi giữ bản nháp; thành công reload nguồn đọc theo ID và không retry mutation.

- [ ] **Step 4: Chạy GREEN và typecheck**

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/account-administration-panel.test.mjs
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run typecheck
```

- [ ] **Step 5: Commit Task 4**

```bash
git add src/features/accountAdministration/AccountAdministrationPanel.tsx \
  tests/unit/account-administration-panel.test.mjs
git commit -m "feat(accounts): add readiness administration panel"
```

---

### Task 5: Tích hợp tuần tự vào App và Vai trò & phạm vi

**Files:**
- Modify: `src/pages/PhanQuyenPage.tsx`
- Modify: `src/App.tsx`
- Create: `tests/unit/account-administration-integration.test.mjs`

**Interfaces:**
- Consumes: `AccountAdministrationPanel({ canManageAccounts })`.
- Preserves: `access.can("accounts", "manage_accounts")` là nguồn duy nhất mở thao tác; trang Quản trị vẫn có sức khỏe, cấu hình, workflow và khối lượng dữ liệu.

- [ ] **Step 1: Viết integration contract RED**

```js
test("quản trị vai chỉ còn ở Vai trò & phạm vi", async () => {
  const page = await readRepositoryFile("src/pages/PhanQuyenPage.tsx");
  const app = await readRepositoryFile("src/App.tsx");
  assert.match(page, /AccountAdministrationPanel/);
  assert.match(page, /canManageAccounts={duocQuanLyTaiKhoan}/);
  assert.doesNotMatch(app, /theoEmail/);
  assert.doesNotMatch(app, /window\.prompt\(/);
  assert.doesNotMatch(app, /setBusinessRole/);
  assert.doesNotMatch(app, /aria-label={`Vai của/);
});
```

Assert thêm: không có tab Nhân sự và diff không chứa migration/SQL.

- [ ] **Step 2: Chạy RED**

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/account-administration-integration.test.mjs
```

- [ ] **Step 3: Tích hợp tuần tự**

Trong `CurrentPermissionWorkspace`, dựng `AccountAdministrationPanel` với capability server. Sau khi panel đã giữ cả đổi vai và bật/tắt, xóa `vaiNv`, `theoEmail`, `doiVai`, `doiKichHoat` và bảng “Người dùng & phân quyền” khỏi `AdminView`. Không sửa RPC/migration.

- [ ] **Step 4: Chạy focused regression và typecheck**

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test \
  tests/unit/account-administration-integration.test.mjs \
  tests/unit/account-administration-model.test.mjs \
  tests/unit/account-role-editor.test.mjs \
  tests/unit/account-administration-panel.test.mjs
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run typecheck
```

- [ ] **Step 5: Commit Task 5**

```bash
git add src/App.tsx src/pages/PhanQuyenPage.tsx \
  tests/unit/account-administration-integration.test.mjs
git commit -m "feat(accounts): consolidate role administration"
```

---

### Task 6: E2E, review và phát hành

**Files:**
- Modify: `tests/e2e/quyen-admin.mjs`

**Interfaces:**
- Fixture IDs của `rpc_nguoi_va_quyen`, `rpc_business_roles` và directory phải khớp tường minh.
- Hai hàng cùng email nhưng khác UUID chứng minh target mutation lấy từ ID.

- [ ] **Step 1: Viết E2E RED**

E2E phải kiểm:

```js
await page.select('select[aria-label="Vai trò nghiệp vụ mới"]', "qa_manager");
assert.equal(roleMutationCalls.length, 0);
await page.type('textarea[aria-label="Lý do đổi vai"]', "Điều chuyển đã duyệt");
await page.click('button[aria-label="Lưu thay đổi vai trò"]');
assert.equal(roleMutationCalls.length, 1);
assert.equal(roleMutationCalls[0].p_user_id, "00000000-0000-4000-8000-0000000000a1");
```

Ngoài ra: checklist xuất hiện ở `#v=phanquyen`; `#v=admin` không còn role select; Hủy không gọi RPC; stale A/B không hiển thị kết quả A ở B; activation vẫn ở PhanQuyen và dùng đúng UUID; danh sách request thoát ra ngoài rỗng.

- [ ] **Step 2: Chạy E2E để quan sát RED**

Tạo `.env.local` ignored với đúng dữ liệu giả sau (không phải khóa thật):

```dotenv
VITE_SUPABASE_URL=https://gialap.supabase.co
VITE_SUPABASE_ANON=gia-lap-khong-phai-khoa-that
E2E_EMAIL=kiem-thu@vi-du.test
E2E_PASSWORD=mat-khau-dung
```

Sau đó chạy:

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  bash scripts/with-preview.sh -- npm run e2e:admin
```

Expected: FAIL tại expectation UI mới.

- [ ] **Step 3: Cập nhật fixture tối thiểu và chạy GREEN**

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  bash scripts/with-preview.sh -- npm run e2e:admin
```

Expected: exit 0, 0 hỏng, race pass.

- [ ] **Step 4: Commit E2E**

```bash
git add tests/e2e/quyen-admin.mjs
git commit -m "test(accounts): cover reviewed role changes"
```

- [ ] **Step 5: Review checkpoints**

1. Primary inspect toàn diff Task 1 và mọi consumer legacy.
2. Sol read-only review model ID/readiness, tìm fallback email/name.
3. Reviewer Terra độc lập review integration và accessibility.
4. Sol whole-diff review bắt buộc 0 Critical/0 Important.
5. Mỗi fix wave chỉ sửa finding cụ thể rồi scoped re-review; tối đa ba wave.

- [ ] **Step 6: Chạy full gates trên Node 24**

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run test:unit
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run typecheck
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run build
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  bash scripts/with-preview.sh -- npm run e2e:admin
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  bash scripts/with-preview.sh -- npm run e2e:gialap
git diff --check 642e2b6103b682d3c82f776dbd688c453071de57..HEAD
if git diff --name-only 642e2b6103b682d3c82f776dbd688c453071de57..HEAD | \
  rg '^(supabase/|scripts/.*\.sql$)'; then exit 1; fi
git status --short
```

Expected: unit/type/build/E2E exit 0; diff-check sạch; không SQL/migration; worktree sạch ngoài `.env.local` ignored. Xóa `.env.local` giả trước push.

- [ ] **Step 7: Xác nhận fast-forward và push theo ủy quyền hiện có**

```bash
git fetch origin
test "$(git rev-parse origin/main)" = "642e2b6103b682d3c82f776dbd688c453071de57"
git push origin ui/role-scope-clarity:main
```

Không force-push. Nếu `origin/main` đã đổi, dừng để rebase/đánh giá lại; không ghi đè.

- [ ] **Step 8: Theo dõi deploy đúng SHA**

```bash
SHA=$(git rev-parse HEAD)
gh run list --commit "$SHA" --limit 10
RUN_ID=$(gh run list --commit "$SHA" --limit 1 --json databaseId --jq '.[0].databaseId')
test -n "$RUN_ID"
gh run watch "$RUN_ID" --exit-status
```

Xác nhận deployment GitHub Pages có `sha=$SHA`, trạng thái success và URL live trả HTTP 200. Probe màn **Vai trò & phạm vi** chỉ đọc. Rollback nếu cần: revert các commit frontend và redeploy artifact trước; không có DB rollback.

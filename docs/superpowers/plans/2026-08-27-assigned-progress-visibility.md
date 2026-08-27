# Assigned Progress Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chỉ hiển thị hạng mục và trường tiến độ mà phiên hiện tại thực sự được phân công cập nhật, đồng thời cưỡng chế cùng allowlist ở writer mà không thay đổi Dữ liệu nguồn hoặc phạm vi xem của các màn khác.

**Architecture:** Database thêm một RPC theo lô trả tập quyền cập nhật của chính `auth.uid()` và một writer riêng cho `rpc_update_progress` luôn kiểm `vmp_allowed_timeline_fields()`. `item_permissions_mode` giữ nguyên `preview` vì mode đó ảnh hưởng nhiều màn; riêng màn Cập nhật tiến độ coi quyền 8/7/1 là enforced. Frontend lọc danh sách bằng tập quyền server, modal chỉ dựng field được phép và vẫn kiểm lại quyền khi mở/focus.

**Tech Stack:** PostgreSQL/Supabase security-definer RPC, React 18, TypeScript, Node test runner, Puppeteer E2E, GitHub Actions/GitHub Pages.

## Global Constraints

- Chỉ sửa luồng Cập nhật tiến độ; không sửa mã, dữ liệu, quyền hoặc RPC lưu của tab Dữ liệu nguồn.
- Luồng “QA phụ trách” hiện có tại Dữ liệu nguồn là đầu vào E2E, không phải file ownership của task triển khai.
- Database là nguồn quyền duy nhất; frontend không suy quyền từ tên vai trò, bộ phận hoặc nhãn người dùng.
- Admin/Quản lý QA thấy mọi hạng mục hoạt động; QA Staff và Workshop Staff chỉ thấy hạng mục có quyền ghi hiệu lực.
- QA Staff được đúng bảy field, không có `actual_validation_date`; QA Manager đúng tám field; Workshop Staff đúng một field `actual_validation_date`; Admin giữ allowlist resolver hiện tại.
- Hạng mục có `editable_fields=[]` không xuất hiện trong UpdatePage và không mở modal.
- Field bị cấm không tồn tại trong DOM và không thể lọt vào payload.
- `item_permissions_mode` production giữ `preview`; không bỏ qua 514 blocker của preflight toàn cục và không làm đổi dữ liệu các màn khác.
- Database/shared-state work chạy tuần tự dưới primary planner; subagent không tự sửa kiến trúc, migration, runner hoặc runbook.
- RED phải được ghi nhận trước GREEN; primary inspect mọi diff và chạy lại verification.
- Production chỉ nhận migration/release đã review; không chạy mutation test trên production.
- Một vòng review độc lập toàn diff bằng `gpt-5.6-sol`; sau một fix pass chỉ re-review đúng finding đã sửa, không mở chu kỳ review lại từ đầu nếu không có lỗi mới thực tế.

---

## File Structure

- Create `supabase/migrations/20260827130000_assigned_progress_visibility.sql`: batch-rights RPC, private enforced progress writer, wrapper swap, ACL/hash guards and idempotent postconditions.
- Create `tests/sql/assigned-progress-visibility.sql`: business/integration RED-GREEN fixtures for list visibility and writer 9/8/7/1 contracts.
- Create `tests/sql/assigned-progress-visibility-security.sql`: inactive session, ACL, spoofing, mixed-payload atomic denial and hidden-function security tests.
- Modify `scripts/run-qa-rights-account-alignment-db-tests.sh`: apply the forward migration on disposable clones and run new SQL suites/failure injection/idempotence.
- Create `scripts/check-assigned-progress-visibility.sql`: production read-only postflight.
- Create `src/features/progress/editableProgressRights.ts`: pure parser/index/filter/stage-visibility model.
- Create `tests/unit/editable-progress-rights.test.mjs`: unit contracts for filtering and field visibility.
- Modify `src/lib/supabaseData.ts`: typed batch-rights fetch and modal permission fetch that is enforced only for progress updates.
- Modify `src/types/database.ts`: exact generated-style signatures for the new RPC.
- Modify `src/pages/UpdatePage.tsx`: fail-closed rights loading, filtering, empty/error/retry and refresh/focus invalidation.
- Modify `src/components/dashboard/ProgressEditModal.tsx`: omit forbidden fields/stages/quick actions and remove preview banner from this writer path.
- Modify `src/components/dashboard/progressModalAccess.ts`: progress-specific enforced content state; remove the preview bypass from this surface.
- Modify `tests/unit/progress-modal-access-revocation.test.mjs`: revoke/refresh behavior under the dedicated progress contract.
- Modify `tests/e2e/quyen-cot-timeline.mjs`: field DOM and payload matrix for Admin/QA Manager/assigned QA/unassigned QA/Workshop Staff.
- Create `tests/e2e/phan-cong-cap-nhat-tien-do.mjs`: full Dữ liệu nguồn QA-owner → UpdatePage visibility → revoke/replace cross-screen flow.
- Modify `package.json`: add `e2e:progress-rights` and include it in `test:permissions`.
- Modify `.github/workflows/deploy.yml`: run the progress-rights E2E in the deployment gate.
- Modify `tests/unit/five-role-rpc-inventory.test.mjs`: register the new RPC as an additive reviewed explicit boundary, raise the literal source count from 65 to 66 and assert migration ACL/definition text.
- Create `docs/runbooks/2026-08-27-assigned-progress-visibility.md`: backup, apply, postflight, frontend deploy, persona probes and forward recovery.

---

### Task 1: Pure visibility model — RED/GREEN

**Files:**
- Create: `src/features/progress/editableProgressRights.ts`
- Create: `tests/unit/editable-progress-rights.test.mjs`

**Interfaces:**
- Produces: `EditableProgressRight`, `parseEditableProgressRights(payload)`, `indexEditableProgressRights(rows)`, `filterEditableProgressActivities(acts, index)`, `visibleProgressStageFields(editableFields)`.
- Consumes later: `UpdatePage.tsx`, `supabaseData.ts`, `ProgressEditModal.tsx`.

- [ ] **Step 1: Write the failing parser/filter tests**

```js
assert.deepEqual(
  filterEditableProgressActivities(
    [{ id: "A" }, { id: "B" }],
    indexEditableProgressRights([{ validationCode: "B", editableFields: ["status_report"], reason: "assigned" }]),
  ).map((row) => row.id),
  ["B"],
);
assert.throws(() => parseEditableProgressRights({ ok: true, rights: [{ validation_code: "A", editable_fields: ["scheduled_at", "unknown"] }] }));
```

- [ ] **Step 2: Write failing field/stage tests**

```js
assert.deepEqual(visibleProgressStageFields(QA_STAFF_TIMELINE_FIELDS).validation,
  ["status_validation"]);
assert.equal(visibleProgressStageFields(["actual_validation_date"]).report.length, 0);
```

- [ ] **Step 3: Run RED**

Run: `node --import tsx --test tests/unit/editable-progress-rights.test.mjs`
Expected: FAIL because the module/functions do not exist.

- [ ] **Step 4: Implement the minimal pure model**

```ts
export interface EditableProgressRight {
  validationCode: string;
  editableFields: readonly EditableTimelineField[];
  reason: string;
}

export function filterEditableProgressActivities<T extends { id: string }>(
  activities: readonly T[], rights: ReadonlyMap<string, EditableProgressRight>,
): T[] {
  return activities.filter((activity) => rights.has(activity.id));
}
```

Parser phải fail-closed với field lạ, code rỗng, hàng trùng khác allowlist hoặc payload `ok !== true`; stage model chỉ dùng constant field contract từ `src/features/itemPermissions/types.ts`.

- [ ] **Step 5: Run GREEN and regression**

Run: `node --import tsx --test tests/unit/editable-progress-rights.test.mjs tests/unit/item-permission-contracts.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/progress/editableProgressRights.ts tests/unit/editable-progress-rights.test.mjs
git commit -m "test(tiến độ): khóa mô hình hiển thị theo phân công"
```

---

### Task 2: Database enforced writer and batch rights — RED

**Files:**
- Create: `tests/sql/assigned-progress-visibility.sql`
- Create: `tests/sql/assigned-progress-visibility-security.sql`
- Modify: `scripts/run-qa-rights-account-alignment-db-tests.sh`

**Interfaces:**
- Expected RPC: `public.rpc_my_editable_progress_rights() returns jsonb` with `{ok:true, rights:[{validation_code,editable_fields,view_reason}]}`.
- Expected private writer: `public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer) returns jsonb`.
- Existing outward API remains `public.rpc_update_progress(text,jsonb,text,jsonb,integer)`.

- [ ] **Step 1: Add fixture personas and items**

Create active Admin, QA Manager, two QA Staff, Workshop Staff, one linked performer per non-admin, assigned/unassigned items and an existing source-object QA-owner cascade fixture. Use fixed `9901...` UUIDs only inside the disposable DB test transaction.

- [ ] **Step 2: Assert batch visibility contracts**

```sql
select pg_temp.assert_true(
  jsonb_array_length(public.rpc_my_editable_progress_rights()->'rights') = 1,
  'QA Staff batch must contain only the assigned item');
```

Assert Admin all active rows/current resolver fields, QA Manager all/eight, assigned QA one/seven, unassigned QA zero, Workshop assigned one/one and inactive session denial.

- [ ] **Step 3: Assert writer contracts while global mode stays preview**

Set `system_config.item_permissions_mode` to `preview`, then assert assigned QA can write `status_validation`, cannot write `actual_validation_date`, mixed allowed+forbidden payload writes nothing, Workshop can only write `actual_validation_date`, and unassigned QA writes nothing.

- [ ] **Step 4: Assert source-owner integration without changing source code**

Call the existing reviewed `rpc_save_catalog_object` as QA Manager to set `owner_person_id`; assert its existing assignment cascade creates an active QA assignment. Then switch JWT claims to that QA and assert the new batch RPC contains the generated item. Remove/replace owner through the same existing RPC and assert the batch result changes for old/new personas.

- [ ] **Step 5: Add security RED tests**

Assert caller cannot pass/spoof uid, anon/inactive gets no rights, new private writer has no non-owner EXECUTE, outward functions use fixed `search_path`, malicious mixed patches are atomic, and source/assignment tables cannot be directly mutated by authenticated users.

- [ ] **Step 6: Run RED on a disposable clone**

Run: `bash scripts/run-qa-rights-account-alignment-db-tests.sh`
Expected: FAIL at missing `rpc_my_editable_progress_rights()` or old preview writer accepting/rejecting by legacy department law. Confirm the failure is not fixture/schema setup.

- [ ] **Step 7: Commit RED tests**

```bash
git add tests/sql/assigned-progress-visibility.sql tests/sql/assigned-progress-visibility-security.sql scripts/run-qa-rights-account-alignment-db-tests.sh
git commit -m "test(db): tái hiện quyền cập nhật theo phân công"
```

---

### Task 3: Database migration — GREEN

**Files:**
- Create: `supabase/migrations/20260827130000_assigned_progress_visibility.sql`
- Modify: `scripts/run-qa-rights-account-alignment-db-tests.sh`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces the two exact functions from Task 2; public writer signature does not change.
- Consumes existing `vmp_item_rights(uuid,text)`, `vmp_allowed_timeline_fields(uuid,text)`, `vmp_is_active_session(uuid)` and hidden reviewed writer definition.

- [ ] **Step 1: Add fail-fast preconditions**

Assert reviewed hashes/owners/signatures for the public writer, hidden old writer, `vmp_item_rights`, `vmp_allowed_timeline_fields`, tables and enum fields. Assert production mode may be `preview`; do not require or change it.

- [ ] **Step 2: Create the batch-rights RPC**

Implement one stable security-definer JSON RPC that derives `v_uid := auth.uid()`, denies inactive sessions, evaluates active items through `vmp_item_rights(v_uid, validation_code)`, filters `cardinality(editable_fields) > 0`, orders by validation code and returns no user identifiers.

- [ ] **Step 3: Create the private assigned writer**

Copy the reviewed live writer into the new private function, replacing only the preview/enforced branch with unconditional `vmp_allowed_timeline_fields(auth.uid(), p_validation_code)` validation. Preserve optimistic versioning, ALCOA+ date/reason checks, audit fields, payload mapping and atomic update behavior exactly.

- [ ] **Step 4: Swap the outward wrapper**

Keep the five-argument public signature and active-session guard; delegate to `rpc_update_progress__assigned_impl_20260827`. Revoke all on the private function from `public`, `anon`, `authenticated`, `service_role`; grant public RPC only to `authenticated` and `service_role` using the existing outward allowlist contract.

- [ ] **Step 5: Add postconditions and idempotence**

Hash-pin new functions, verify owner/search path/volatility/ACL, verify old hidden writer remains private/unchanged, verify system config mode unchanged and ensure rerunning migration yields identical definitions and ACLs.

- [ ] **Step 6: Update generated-style TypeScript signature**

Add only `rpc_my_editable_progress_rights: { Args: never; Returns: Json }`; do not hand-edit unrelated generated entries.

- [ ] **Step 7: Run GREEN plus failure injection**

Run: `bash scripts/run-qa-rights-account-alignment-db-tests.sh`
Expected: PASS business, security, rollback-on-error, schema drift, hash drift and idempotence. Runner must verify an injected failure before wrapper swap leaves the old public writer/hash intact.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260827130000_assigned_progress_visibility.sql scripts/run-qa-rights-account-alignment-db-tests.sh src/types/database.ts
git commit -m "fix(quyền): cưỡng chế cập nhật theo phân công"
```

---

### Task 4: Frontend rights loader and UpdatePage filtering — RED/GREEN

**Files:**
- Modify: `src/lib/supabaseData.ts`
- Modify: `src/pages/UpdatePage.tsx`
- Test: `tests/unit/editable-progress-rights.test.mjs`

**Interfaces:**
- Adds `fetchMyEditableProgressRights(): Promise<EditableProgressRight[]>`.
- UpdatePage consumes the Task 1 index and never renders `acts` before rights state is ready.

- [ ] **Step 1: Add RED contracts for malformed/stale responses**

Test duplicate codes with mismatched fields, RPC `ok:false`, request A resolving after request B and rights refresh removing an item. Expected result is empty/fail-closed, never reuse prior rows.

- [ ] **Step 2: Run RED**

Run: `node --import tsx --test tests/unit/editable-progress-rights.test.mjs`
Expected: FAIL because API/state contract is absent.

- [ ] **Step 3: Implement API parsing**

Call only `rpc_my_editable_progress_rights`; parse through Task 1 model and throw a Vietnamese error on malformed/denied payload.

- [ ] **Step 4: Implement fail-closed UpdatePage state**

Use generation counters for overlapping requests; states are `loading|error|ready`. Filter before search, counts, focus/deep-link and modal selection. Reload on mount, window focus, visible tab and `onReload` completion. Show the approved empty message and a retry button; an error clears the previous map.

- [ ] **Step 5: Run GREEN/typecheck**

Run: `npm run test:unit && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabaseData.ts src/pages/UpdatePage.tsx tests/unit/editable-progress-rights.test.mjs
git commit -m "fix(tiến độ): chỉ liệt kê hạng mục được phân công"
```

---

### Task 5: Modal field omission and revocation — RED/GREEN

**Files:**
- Modify: `src/components/dashboard/ProgressEditModal.tsx`
- Modify: `src/components/dashboard/progressModalAccess.ts`
- Modify: `src/lib/supabaseData.ts`
- Modify: `tests/unit/progress-modal-access-revocation.test.mjs`

**Interfaces:**
- `fetchTimelineFieldPermission(code)` returns `{mode:"enforced", ...}` for the dedicated progress writer without calling global `item_permissions_mode()`.
- Modal consumes `visibleProgressStageFields()` from Task 1.

- [ ] **Step 1: Write RED access/DOM-source contracts**

Replace the preview-bypass assertion with dedicated progress enforcement assertions. Add source-contract checks that date/select/schedule controls are conditionally rendered, not merely `disabled`, and quick-done requires both allowed fields.

- [ ] **Step 2: Run RED**

Run: `node --import tsx --test tests/unit/progress-modal-access-revocation.test.mjs tests/unit/editable-progress-rights.test.mjs`
Expected: FAIL on preview content and unconditional field JSX.

- [ ] **Step 3: Implement minimal rendering changes**

Remove global mode fetch from this API, harden the progress permission result as enforced, conditionally render each field, omit empty stages, omit schedule unless returned (Admin), hide Save for zero fields and remove the preview banner from this modal.

- [ ] **Step 4: Preserve payload and revocation behavior**

Keep changed-only patch logic; on focus/refetch denial clear draft and render revoked state. A hidden field must never enter `doiRoi`, ALCOA validation or request body.

- [ ] **Step 5: Run GREEN/regression**

Run: `npm run test:unit && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/ProgressEditModal.tsx src/components/dashboard/progressModalAccess.ts src/lib/supabaseData.ts tests/unit/progress-modal-access-revocation.test.mjs
git commit -m "fix(tiến độ): ẩn trường ngoài quyền hiệu lực"
```

---

### Task 6: Browser E2E persona matrix and cross-screen assignment

**Files:**
- Modify: `tests/e2e/quyen-cot-timeline.mjs`
- Create: `tests/e2e/phan-cong-cap-nhat-tien-do.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Mock endpoint `rpc_my_editable_progress_rights` shares one mutable assignment state with existing mocked `rpc_save_catalog_object`.
- The E2E must traverse rendered UI; direct model calls do not count as acceptance evidence.

- [ ] **Step 1: Update field-matrix E2E to fail**

Assert forbidden labels/inputs are absent from DOM (not disabled), unassigned QA item absent from table, assigned QA has seven, QA Manager eight, Workshop Staff only actual validation and Admin retains schedule if returned by server.

- [ ] **Step 2: Write cross-screen E2E RED**

Flow: sign in as QA Manager → open Dữ liệu nguồn → edit an object → choose QA phụ trách → save → switch to that QA persona → open Cập nhật tiến độ → assigned item exists → open modal → actual validation date absent → update `status_validation` successfully. Then switch manager, replace/remove QA owner, switch old/new QA and verify disappear/appear after focus.

- [ ] **Step 3: Assert real browser request contracts**

Capture and assert `rpc_save_catalog_object` owner payload, batch-rights reload, per-item permission reload and `rpc_update_progress` changed-only payload. Abort any request escaping preview/mock origins.

- [ ] **Step 4: Run RED**

Run: `bash scripts/with-preview.sh -- node tests/e2e/phan-cong-cap-nhat-tien-do.mjs`
Expected: FAIL because UpdatePage does not fetch/filter batch rights and modal still renders forbidden fields.

- [ ] **Step 5: Complete mock state machine only**

Do not change application/source code in this task. Make the mock persist owner assignment changes and serve matching batch/per-item rights so the real UI flow exercises Tasks 4–5.

- [ ] **Step 6: Run GREEN and focused regressions**

Run:

```bash
bash scripts/with-preview.sh -- bash -c '
  node tests/e2e/quyen-cot-timeline.mjs &&
  node tests/e2e/phan-cong-cap-nhat-tien-do.mjs &&
  node tests/e2e/catalog-workspace.mjs &&
  node tests/e2e/thu-hoi-cache-phan-quyen.mjs
'
```

Expected: PASS with zero unexpected network requests.

- [ ] **Step 7: Add CI gate and commit**

Add `e2e:progress-rights` and invoke it inside the existing `e2e-mock` preview block.

```bash
git add tests/e2e/quyen-cot-timeline.mjs tests/e2e/phan-cong-cap-nhat-tien-do.mjs package.json .github/workflows/deploy.yml
git commit -m "test(e2e): kiểm phân công từ dữ liệu nguồn tới tiến độ"
```

---

### Task 7: Release artifacts, independent review and final verification

**Files:**
- Create: `scripts/check-assigned-progress-visibility.sql`
- Create: `docs/runbooks/2026-08-27-assigned-progress-visibility.md`
- Modify: `tests/unit/five-role-rpc-inventory.test.mjs`

**Interfaces:**
- Postflight outputs sanitized PASS markers for mode unchanged, writer hash, batch 9/8/7/1 personas, unassigned hidden, ACL and source code untouched.

- [ ] **Step 1: Write runbook and read-only checker**

Record exact SHA/migration hash, backup commands, connection-new postflight, schema-cache reload, frontend deploy order and forward recovery. Preflight records global blocker baseline but does not mutate or waive it.

- [ ] **Step 2: Register the additive browser RPC inventory**

Add `rpc_my_editable_progress_rights()` as `guarded_explicit` in a new additive map beside the catalog/deadline maps, assert it is created and granted only by `20260827130000_assigned_progress_visibility.sql`, and change the reviewed literal source count from 65 to 66. Do not edit the sealed 24/08 migration inventory.

- [ ] **Step 3: Run full local verification before review**

```bash
npm run typecheck
npm run test:unit
npm run build
bash scripts/run-qa-rights-account-alignment-db-tests.sh
bash scripts/with-preview.sh -- bash -c '
  node tests/e2e/quyen-cot-timeline.mjs &&
  node tests/e2e/phan-cong-cap-nhat-tien-do.mjs &&
  node tests/e2e/catalog-workspace.mjs
'
```

- [ ] **Step 4: Independent Sol review**

Reviewer checks authorization bypass, private function EXECUTE, search path, uid spoofing, mixed patch atomicity, stale rights/race, hidden-field payload, cross-screen assignment mock fidelity, production rollback and unchanged Source Data. Require 0 Critical / 0 Important.

- [ ] **Step 5: One bounded fix pass**

Primary verifies each finding, writes a failing regression test, applies the minimum fix and re-runs only affected tests plus the full final gate. Re-review only changed finding locations. If two fix passes fail, stop and reassess architecture instead of opening another review loop.

- [ ] **Step 6: Commit release artifacts**

```bash
git add scripts/check-assigned-progress-visibility.sql docs/runbooks/2026-08-27-assigned-progress-visibility.md tests/unit/five-role-rpc-inventory.test.mjs
git commit -m "docs(phát hành): hướng dẫn quyền cập nhật theo phân công"
```

- [ ] **Step 7: Production database deployment**

Create a new 0700 evidence directory, take `pg_dump`, run reviewed migration once, open a new connection for checker, reload PostgREST schema and run read-only persona probes. First failure stops the release; do not retry blindly.

- [ ] **Step 8: Push exact SHA and deploy Pages**

Fetch origin, confirm fast-forward, push feature/main only under the user's existing deployment authorization, dispatch quality workflow with exact SHA and wait for success. Verify Pages deployment SHA, page HTTP 200 and new JS asset HTTP 200.

- [ ] **Step 9: Final production postflight**

Confirm Tôn Nữ Thiện My still has no HT-02 in batch rights while unassigned, an assigned QA probe returns seven fields, QA Manager eight, Workshop assigned probe one when real data exists, writer rejects forbidden fields via read-only definition/contract evidence, `item_permissions_mode=preview`, Dữ liệu nguồn function hashes unchanged and worktree clean.

---

## Rollback and Recovery

- Migration fails before commit: transaction rollback preserves old wrapper and functions.
- Migration succeeds but frontend fails: backend is fail-closed; old UI may display extra fields but cannot write them. Deploy prior frontend while preparing forward recovery.
- Writer regression: apply the reviewed forward-recovery migration that restores the captured public wrapper target; do not edit functions ad hoc in production.
- Batch RPC regression: old screens are unaffected; UpdatePage fails closed. Restore previous frontend and apply forward recovery.
- Never change `item_permissions_mode`, source assignments, account roles or Source Data records as rollback shortcuts.

## Final Acceptance Evidence

- Fresh unit/typecheck/build outputs.
- Disposable-clone RED and GREEN logs, security/injection/idempotence PASS.
- Focused persona E2E and cross-screen Dữ liệu nguồn→Cập nhật tiến độ E2E PASS.
- Independent Sol review with 0 Critical / 0 Important.
- Production backup, migration log, new-connection postflight and sanitized persona probes.
- CI exact-SHA success, Pages exact-SHA deployment success, HTTP 200 page/asset and clean worktree.

# QA Rights and Account Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hiệu chỉnh Khoa thành Quản lý QA, Đạt thành Nhân viên xưởng thuộc Kiểm nghiệm, vô hiệu hóa hai Viewer thử nghiệm còn lại và giới hạn Nhân viên QA còn đúng bảy trường tiến độ trên hạng mục được phân công.

**Architecture:** Giữ kiến trúc năm vai, phân công canonical, `vmp_item_rights` và `rpc_update_progress` hiện có. Thêm một forward migration fail-closed để tách allowlist bảy trường của Nhân viên QA khỏi allowlist tám trường của Quản lý QA; thêm entrypoint bốn UUID riêng thay cho entrypoint cũ vô hiệu hóa bảy tài khoản; frontend tiếp tục chỉ trình bày `editable_fields` từ server.

**Tech Stack:** PostgreSQL 17/Supabase SQL, Bash, TypeScript 7, React 18, Node 22, Node test runner, Puppeteer E2E.

## Global Constraints

- Base là `origin/main@45d6c53075d17fa52effcab69eb25850bb28d060`; không hợp nhất local `main` cũ.
- Không sửa migration cũ; thay đổi database là forward-only.
- Không gọi `scripts/apply-five-role-hardening.sql`; entrypoint đó vô hiệu hóa bảy tài khoản ngoài phạm vi.
- Bốn tài khoản ghi được chọn bằng UUID truyền ngoài Git, không bằng tên/email.
- Nhân viên QA sửa đúng bảy trường, không có `actual_validation_date`, trên hạng mục có assignment QA hiệu lực.
- Quản lý QA sửa tám trường gồm `actual_validation_date` trên mọi hạng mục hoạt động, không cần assignment.
- Nhân viên xưởng chỉ sửa `actual_validation_date` trên hạng mục được giao; `qc` không tự cấp quyền rộng.
- Không hard-delete Auth user/audit/history. Modes giữ `screen=enforced`, `item=preview`.
- Không ghi production, push, merge hoặc deploy trong kế hoạch này.
- Lệnh Node dùng `npx --yes --package=node@22 -c '<command>'` vì Node hệ thống là 18.19.1.

---

## File Map

- `src/features/itemPermissions/types.ts`: hai allowlist QA bảy/tám trường.
- `tests/unit/item-permission-contracts.test.mjs`: contract frontend.
- `tests/e2e/quyen-cot-timeline.mjs`: khóa/mở trường theo persona.
- `tests/sql/qa-rights-account-alignment*.sql`: quyền dòng/trường, writer atomic và security.
- `scripts/run-qa-rights-account-alignment-db-tests.sh`: clone PostgreSQL 17, RED/GREEN và drift.
- `supabase/migrations/20260827100000_qa_rights_account_alignment.sql`: forward migration quyền.
- `scripts/apply-qa-rights-account-*.sql`: entrypoint và manifest bốn UUID.
- `scripts/check-qa-rights-account-alignment.sql`: postflight read-only.
- `tests/unit/qa-rights-release-contract.test.mjs`: khóa source contract của artifact phát hành.
- `docs/runbooks/2026-08-27-qa-rights-account-alignment.md`: preflight, backup, apply, postflight, rollback.

### Task 1: Khóa RED cho quyền bảy/tám trường

**Files:**
- Modify: `tests/unit/item-permission-contracts.test.mjs`
- Modify: `tests/e2e/quyen-cot-timeline.mjs`
- Create: `tests/sql/qa-rights-account-alignment.sql`
- Create: `scripts/run-qa-rights-account-alignment-db-tests.sh`

**Interfaces:**
- Consumes: `vmp_business_role`, `vmp_item_rights`, `vmp_my_item_rights`, `rpc_update_progress`, `vmp_item_assignments`.
- Produces: RED marker `QA_STAFF_ACTUAL_VALIDATION_DATE_MUST_BE_DENIED` và fixture cho Task 2.

- [ ] **Step 1: Viết unit RED**

```js
assert.deepEqual(QA_STAFF_TIMELINE_FIELDS, [
  "actual_protocol_date", "status_protocol", "status_validation",
  "actual_report_date", "status_report", "actual_vmp_date", "status_vmp",
]);
assert.deepEqual(QA_MANAGER_TIMELINE_FIELDS, [
  "actual_protocol_date", "status_protocol",
  "actual_validation_date", "status_validation",
  "actual_report_date", "status_report", "actual_vmp_date", "status_vmp",
]);
assert.equal(QA_STAFF_TIMELINE_FIELDS.includes("actual_validation_date"), false);
assert.deepEqual(EQUIPMENT_TIMELINE_FIELDS, ["actual_validation_date"]);
```

- [ ] **Step 2: Quan sát unit RED đúng nguyên nhân**

```bash
npx --yes --package=node@22 -c \
  'node --import tsx --test tests/unit/item-permission-contracts.test.mjs'
```

Expected: FAIL vì hai export QA mới chưa tồn tại; không chấp nhận lỗi import khác.

- [ ] **Step 3: Viết E2E RED**

Tách `QA_MANAGER_FIELDS` tám trường và `QA_STAFF_FIELDS` bảy trường. `qaManagerRight` dùng danh sách manager; `collaboratorQa` dùng staff. Assert persona Nhân viên QA thấy Ngày thẩm định thực tế bị khóa, vẫn sửa được Trạng thái thẩm định và request không chứa `actual_validation_date`.

- [ ] **Step 4: Viết SQL RED bằng authenticated non-owner**

Fixture có manager, QA staff được giao/chưa giao, workshop staff được giao và hai item. Assert manager mọi item/tám trường; assigned QA đúng bảy; unassigned QA zero; workshop đúng một trường. Writer dưới assigned QA phải từ chối patch chỉ `actual_validation_date` và patch trộn với `status_validation`; row, version và audit bất biến. Assertion đầu phát marker `QA_STAFF_ACTUAL_VALIDATION_DATE_MUST_BE_DENIED`.

- [ ] **Step 5: Tạo runner và quan sát SQL RED**

Runner tái dùng guard của `run-qa-manager-actual-date-db-tests.sh`: database tạm khớp `^vmp_qa_alignment_[0-9]+_[0-9]+$`, PostgreSQL 17, user postgres, fixture five-role và browser-function inventory đã duyệt. `--expect-red` chỉ thành công khi log có đúng marker.

```bash
SUPABASE_DB_URL="$SUPABASE_DB_URL" VMP_TEST_DB_URL="$VMP_TEST_DB_URL" \
  bash scripts/run-qa-rights-account-alignment-db-tests.sh --expect-red
```

Expected: `PASS RED QA staff actual validation date remains over-granted`.

- [ ] **Step 6: Commit RED**

```bash
git add tests/unit/item-permission-contracts.test.mjs tests/e2e/quyen-cot-timeline.mjs \
  tests/sql/qa-rights-account-alignment.sql scripts/run-qa-rights-account-alignment-db-tests.sh
git commit -m "test(quyền): khóa bảy trường của nhân viên QA"
```

### Task 2: Forward migration và frontend contract

**Files:**
- Modify: `src/features/itemPermissions/types.ts`
- Create: `supabase/migrations/20260827100000_qa_rights_account_alignment.sql`
- Create: `tests/sql/qa-rights-account-alignment-security.sql`
- Modify: `scripts/run-qa-rights-account-alignment-db-tests.sh`

**Interfaces:**
- Consumes: RED fixture Task 1 và exact metadata của `vmp_item_rights(uuid,text)`.
- Produces: hai constant frontend và cùng chữ ký `vmp_item_rights(uuid,text)` với allowlist theo business role.

- [ ] **Step 1: Thêm hai constant frontend**

```ts
export const QA_STAFF_TIMELINE_FIELDS = [
  "actual_protocol_date", "status_protocol", "status_validation",
  "actual_report_date", "status_report", "actual_vmp_date", "status_vmp",
] as const;
export const QA_MANAGER_TIMELINE_FIELDS = [
  "actual_protocol_date", "status_protocol",
  "actual_validation_date", "status_validation",
  "actual_report_date", "status_report", "actual_vmp_date", "status_vmp",
] as const;
```

`EditableTimelineField` lấy union từ manager; UI không suy quyền từ constants.

- [ ] **Step 2: Khóa precondition trước replacement**

Runner chụp `pg_get_functiondef`, owner, `prosecdef`, volatility, `proconfig` và ACL từ clone review. Migration chỉ chấp nhận exact contract đó, năm vai/85 matrix, `enforced/preview`, đúng schema assignment và writer signature. Inject drift definition/metadata/ACL/schema; migration phải abort trước replace và function hash giữ nguyên.

- [ ] **Step 3: Viết migration tối thiểu**

Giữ nguyên mọi nhánh/view reason/source/scope. Chỉ thay allowlist `qa_staff` thành:

```sql
array['actual_protocol_date','status_protocol','status_validation',
      'actual_report_date','status_report','actual_vmp_date','status_vmp']::text[]
```

`qa_manager` giữ tám trường. Dùng `CREATE OR REPLACE`, khôi phục exact owner/ACL/volatility/`SECURITY DEFINER`/`search_path`; postcondition gọi role thật và kiểm mode không đổi.

- [ ] **Step 4: Viết security suite**

Assert authenticated không EXECUTE raw rights, wrapper vẫn hoạt động, writer deny trước mutation/audit, payload trộn atomic, PUBLIC/anon không có grant mới, không overload, không đổi RLS.

- [ ] **Step 5: Chạy GREEN và commit**

```bash
SUPABASE_DB_URL="$SUPABASE_DB_URL" VMP_TEST_DB_URL="$VMP_TEST_DB_URL" \
  bash scripts/run-qa-rights-account-alignment-db-tests.sh
npx --yes --package=node@22 -c \
  'node --import tsx --test tests/unit/item-permission-contracts.test.mjs'
git add src/features/itemPermissions/types.ts \
  supabase/migrations/20260827100000_qa_rights_account_alignment.sql \
  tests/sql/qa-rights-account-alignment-security.sql \
  scripts/run-qa-rights-account-alignment-db-tests.sh
git commit -m "fix(quyền): tách trường tiến độ QA theo vai"
```

### Task 3: Entrypoint bốn tài khoản và đồng bộ phân công

**Files:**
- Create: `scripts/apply-qa-rights-account-alignment.sql`
- Create: `scripts/apply-qa-rights-account-manifest.sql`
- Create: `scripts/check-qa-rights-account-alignment.sql`
- Create: `tests/unit/qa-rights-release-contract.test.mjs`
- Modify: `tests/sql/qa-rights-account-alignment.sql`
- Modify: `scripts/run-qa-rights-account-alignment-db-tests.sh`

**Interfaces:**
- Consumes: psql `khoa_id`, `dat_id`, `viewer_ids` (hai UUID), Task 2 và `rpc_refresh_source_item_assignments()`.
- Produces: one-transaction entrypoint, audit bốn tài khoản và postflight read-only.

- [ ] **Step 1: Viết release-contract RED**

```js
assert.match(entrypoint, /20260824120000_five_role_permission_hardening\.sql/);
assert.match(entrypoint, /20260827100000_qa_rights_account_alignment\.sql/);
assert.doesNotMatch(entrypoint, /apply-five-role-account-manifest\.sql/);
assert.match(manifest, /ACCOUNT_MANIFEST_REQUIRES_FOUR_UNIQUE_UUIDS/);
assert.match(manifest, /rpc_refresh_source_item_assignments/);
assert.match(checker, /begin read only/i);
assert.match(checker, /rollback/i);
```

Expected RED: ba script chưa tồn tại.

- [ ] **Step 2: Viết exact-four precondition**

Khóa bốn UUID và assert trước update: Khoa active/`qa_staff`/QA/`qa_progress_editor`; Đạt active/login `viewer`/performer `qc`/access null; hai Viewer test active, không trùng; còn Admin active; modes `enforced/preview`. Không in UUID/email/tên. Sai một điều kiện abort trước ghi.

- [ ] **Step 3: Viết mutation/audit/assignment atomic**

Trong một transaction: Khoa profile `qa_manager`, performer `qa_manager`, QA; Đạt profile `department_user`, performer `workshop_staff`, `qc`; hai Viewer test `is_active=false`; audit old/new đúng bốn target. Dùng service-role claims cục bộ gọi đúng một lần `rpc_refresh_source_item_assignments()`. Kiểm owner/support hợp lệ được materialize, 180 item thiếu cả hai không tự gán, Đạt không nhận assignment QC rộng.

- [ ] **Step 4: Viết entrypoint và checker**

Entrypoint schema-first áp hardening 24/08 khi live còn 102 rows, các prerequisite 26/08, Task 2, rồi manifest bốn tài khoản; post-state hợp lệ là no-op có kiểm chứng, partial state bị từ chối. Checker `BEGIN READ ONLY`/`ROLLBACK` xác minh 85 rows/năm vai, Khoa manager, Đạt workshop staff, hai Viewer inactive, không Viewer active, quyền 7/8/1, assignment source, Admin, ACL và modes.

- [ ] **Step 5: Chạy failure injection và GREEN**

Kiểm manifest thiếu/trùng/sai state, schema drift, lỗi giữa Khoa/Đạt, lỗi assignment refresh và re-run. Mọi pre-commit failure giữ nguyên profile/performer/assignment/audit hashes; success clone qua checker trên connection mới.

- [ ] **Step 6: Commit artifact**

```bash
git add scripts/apply-qa-rights-account-alignment.sql \
  scripts/apply-qa-rights-account-manifest.sql scripts/check-qa-rights-account-alignment.sql \
  tests/unit/qa-rights-release-contract.test.mjs tests/sql/qa-rights-account-alignment.sql \
  scripts/run-qa-rights-account-alignment-db-tests.sh
git commit -m "feat(quyền): chuẩn bị hiệu chỉnh bốn tài khoản"
```

### Task 4: Runbook, independent review và final verification

**Files:**
- Create: `docs/runbooks/2026-08-27-qa-rights-account-alignment.md`
- Modify: `docs/superpowers/plans/2026-08-27-qa-rights-account-alignment.md` (checkbox/evidence only)

**Interfaces:**
- Consumes: Task 1–3 commits.
- Produces: handoff không bí mật và bằng chứng tươi; không production mutation.

- [ ] **Step 1: Viết runbook**

Ghi exact source SHA/migration hashes, nạp UUID từ file ngoài repo, preflight read-only, backup schema/state, apply-once, connection-new postflight, schema-cache reload, persona probes và rollback. Lệnh production chỉ được chạy sau phê duyệt riêng.

- [ ] **Step 2: Chạy focused và full regression**

```bash
SUPABASE_DB_URL="$SUPABASE_DB_URL" VMP_TEST_DB_URL="$VMP_TEST_DB_URL" \
  bash scripts/run-qa-rights-account-alignment-db-tests.sh
npx --yes --package=node@22 -c 'npm run typecheck'
npx --yes --package=node@22 -c 'npm run test:unit'
npx --yes --package=node@22 -c 'npm run build'
npx --yes --package=node@22 -c 'npm run drift'
bash scripts/with-preview.sh -- node tests/e2e/quyen-cot-timeline.mjs
git diff --check
```

Expected: 0 fail/exit 0 và worktree chỉ còn evidence plan trước commit cuối.

- [ ] **Step 3: Review độc lập `gpt-5.6-sol`**

Reviewer read-only kiểm spec coverage, pre/postcondition, owner/ACL/search_path, raw/wrapper boundary, writer atomicity, manifest bốn UUID, secret redaction, assignment idempotency, failure injection, rollback và false-green tests. Critical/Major phải sửa bằng TDD và review lại.

- [ ] **Step 4: Primary kiểm diff và chạy lại Step 2**

Primary đọc mọi diff/finding và chạy lại verification trên HEAD cuối; không dùng báo cáo subagent thay bằng chứng lệnh.

- [ ] **Step 5: Commit runbook/evidence**

```bash
git add docs/runbooks/2026-08-27-qa-rights-account-alignment.md \
  docs/superpowers/plans/2026-08-27-qa-rights-account-alignment.md
git commit -m "docs(quyền): bàn giao hiệu chỉnh tài khoản QA và QC"
```

Không push, merge, deploy hoặc chạy entrypoint production.

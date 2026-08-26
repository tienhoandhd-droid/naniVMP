# Catalog Timeline Progressed Deadline Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép Admin/Quản lý QA xác nhận đặc biệt để áp deadline tính từ dữ liệu nguồn lên hạng mục đã có tiến độ, giữ nguyên toàn bộ dữ liệu thực tế và trả lý do chính xác cho mọi trường hợp không thể thực hiện.

**Architecture:** Giữ nguyên RPC ba tham số hiện tại cho tương thích. Thêm hai public boundary có active-session guard: một RPC xem trước V2 bọc kết quả cũ và bổ sung candidate ghi đè; một RPC apply V2 khóa thay đổi/hạng mục, kiểm toàn bộ request, gọi đường áp cũ trong cùng transaction rồi chỉ cập nhật bốn deadline của các candidate đã xác nhận. Frontend dùng model thuần để quản lý selection/error, không tự suy đoán eligibility.

**Tech Stack:** PostgreSQL/Supabase RPC, five-role security boundary, React 18, TypeScript, Node test runner + `tsx`, Puppeteer E2E, Vite.

## Global Constraints

- Nền bắt buộc: `origin/main` tại `8a28c74c0593f633ef3edacde48fc60cddcd6a38`.
- Chỉ `admin` và `qa_manager` có thể xem/apply override.
- Không cấp quyền bảng mới cho browser; hidden implementation và helper nội bộ owner-only.
- Chỉ bốn deadline kế hoạch được đổi; ngày thực tế, trạng thái, người thực hiện, item state và identity phải giữ nguyên.
- Dữ liệu nguồn là nguồn tính deadline duy nhất; không cho nhập deadline tùy ý.
- Apply là một transaction và không tự retry mutation.
- Lỗi nghiệp vụ phải có `error_code`, `error` tiếng Việt, `missing`/`details` khi có; không rơi về thông báo chung nếu máy chủ đã nêu nguyên nhân.
- Mutation SQL chỉ chạy trên disposable clone/test database, không chạy trên production.
- Production migration, push/merge và deploy cần phê duyệt riêng sau khi review và full gate xanh.
- Tối đa ba fix wave; security/final review dùng `gpt-5.6-sol` và phải đạt 0 Critical/0 Important.

Database implementation là shared-state và phải làm tuần tự. Unit model/frontend có thể giao cho agent riêng theo file ownership sau khi Task 1 khóa hợp đồng; primary phải inspect mọi diff và chạy lại verification.

---

### Task 1: Model hợp đồng xem trước, lựa chọn và lỗi

**Files:**
- Create: `src/features/catalogWorkspace/catalogTimelineOverrideModel.ts`
- Create: `tests/unit/catalog-timeline-override-model.test.mjs`

**Interfaces:**

```ts
export interface ProgressEvidence {
  actual_protocol_date: string | null;
  actual_validation_date: string | null;
  actual_report_date: string | null;
  actual_vmp_date: string | null;
  status_protocol: string;
  status_validation: string;
  status_report: string;
  status_vmp: string;
}
export interface ProgressedDeadlineCandidate {
  validation_code: string;
  item_version: number;
  eligible: boolean;
  blocker_code: string | null;
  blocker_reason: string | null;
  missing: string[];
  progress: ProgressEvidence;
  deadline_protocol_cu: string | null;
  deadline_protocol_moi: string | null;
  deadline_validation_cu: string | null;
  deadline_validation_moi: string | null;
  deadline_report_cu: string | null;
  deadline_report_moi: string | null;
  deadline_vmp_cu: string | null;
  deadline_vmp_moi: string | null;
}
export interface DeadlineOverrideSelection {
  validation_code: string;
  expected_item_version: number;
}
export function candidateHasDeadlineChange(candidate: ProgressedDeadlineCandidate): boolean;
export function toggleDeadlineOverride(
  current: readonly DeadlineOverrideSelection[],
  candidate: ProgressedDeadlineCandidate,
): DeadlineOverrideSelection[];
export function canApplyCatalogImpact(input: {
  normalChangeCount: number;
  selected: readonly DeadlineOverrideSelection[];
  reason: string;
  confirmed: boolean;
}): { ok: true } | { ok: false; reason: string };
export function catalogApplyErrorMessage(result: unknown): string;
```

- [ ] **Step 1: Viết test RED bằng literal fixture**

Test phải chứng minh các lỗi sau bị bắt: candidate đủ dữ liệu và có delta được chọn bằng code+version; candidate thiếu `Tháng thẩm định đầu tiên` không được chọn; candidate không có delta không được chọn; reason rỗng và confirm false chặn apply; `VERSION_CONFLICT`, `MISSING_SOURCE_DATA`, `ITEM_STATE_CHANGED`, `INVALID_OVERRIDE_ITEM`, `FORBIDDEN`, `NETWORK` giữ nguyên chi tiết server.

```js
test("candidate hợp lệ chỉ gửi mã và item version đã xem", () => {
  assert.deepEqual(toggleDeadlineOverride([], candidate({
    validation_code: "CCTB01/2026.01-PQ", item_version: 7, eligible: true,
    deadline_vmp_cu: "2026-08-31", deadline_vmp_moi: "2026-09-30",
  })), [{ validation_code: "CCTB01/2026.01-PQ", expected_item_version: 7 }]);
});

test("lỗi thiếu dữ liệu nêu đúng trường thiếu", () => {
  assert.equal(catalogApplyErrorMessage({
    ok: false, error_code: "MISSING_SOURCE_DATA",
    error: "Không tính đủ deadline cho CCTB01/2026.01-PQ",
    missing: [{ validation_code: "CCTB01/2026.01-PQ", fields: ["Tháng thẩm định đầu tiên"] }],
  }), "Không tính đủ deadline cho CCTB01/2026.01-PQ — thiếu: Tháng thẩm định đầu tiên");
});
```

- [ ] **Step 2: Chạy RED**

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/catalog-timeline-override-model.test.mjs
```

Expected: FAIL vì model chưa tồn tại.

- [ ] **Step 3: Implement model tối thiểu**

Không chọn candidate khi `eligible !== true`, `missing.length > 0` hoặc bốn cặp deadline đều bằng nhau. `catalogApplyErrorMessage` ưu tiên `error`, sau đó nối `missing/details`; chỉ trả “Áp vào timeline thất bại” khi payload không có thông tin hợp lệ.

- [ ] **Step 4: Chạy GREEN và typecheck**

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/catalog-timeline-override-model.test.mjs
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run typecheck
```

Expected: pass, typecheck exit 0.

- [ ] **Step 5: Inspect và commit**

```bash
git diff --check
git add src/features/catalogWorkspace/catalogTimelineOverrideModel.ts \
  tests/unit/catalog-timeline-override-model.test.mjs
git commit -m "test(timeline): define progressed deadline override contract"
```

---

### Task 2: Migration xem trước V2 và apply nguyên tử

**Files:**
- Create: `supabase/migrations/20260826130000_catalog_progressed_deadline_override.sql`
- Create: `tests/sql/catalog-progressed-deadline-override.sql`
- Create: `scripts/run-catalog-progressed-deadline-db-tests.sh`

**Interfaces:**

```sql
public.rpc_preview_catalog_change_v2(p_change_id uuid) returns jsonb
public.rpc_apply_catalog_change_v2(
  p_change_id uuid,
  p_reason text,
  p_expected_timeline_revision integer,
  p_deadline_overrides jsonb,
  p_override_confirmed boolean
) returns jsonb
```

`p_deadline_overrides` là JSON array chính xác:

```json
[{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":7}]
```

- [ ] **Step 1: Viết SQL RED trước migration**

Fixture tạo một đối tượng và một hạng mục có `actual_validation_date = '2026-03-20'`, trạng thái `completed`, version 7 và deadline cũ. Assertions:

```sql
select pg_temp.assert_json_error(
  public.rpc_apply_catalog_change_v2(v_change_id, 'x', v_revision,
    '[{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":7}]', true),
  'MISSING_SOURCE_DATA');
```

Sau khi bổ sung dữ liệu nguồn, preview phải trả candidate với đủ bốn cặp deadline, evidence tiến độ và `eligible=true`. Apply phải đổi đúng bốn deadline nhưng giữ nguyên bốn actual dates, bốn statuses, owner, item state và identity. Thêm cases literal cho:

- `FORBIDDEN` với `qa_staff`;
- `REASON_REQUIRED`;
- `OVERRIDE_NOT_CONFIRMED`;
- `VERSION_CONFLICT`;
- `INVALID_OVERRIDE_ITEM`;
- `ITEM_STATE_CHANGED` khi version khác;
- `NO_ACTIONABLE_CHANGE`;
- một mã hợp lệ + một mã sai rollback toàn bộ;
- gọi lần hai trả `da_ap_truoc_do=true`, deadline/version không đổi lần nữa.

- [ ] **Step 2: Chạy SQL RED trên disposable clone**

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  bash scripts/run-catalog-progressed-deadline-db-tests.sh --expect-red
```

Expected: FAIL ở `undefined_function` cho RPC V2, không phải lỗi fixture.

- [ ] **Step 3: Viết migration với precondition fail-closed**

Migration phải abort trước DDL nếu thiếu wrapper/hidden implementation five-role, bảng/cột, helper tính deadline hoặc ACL dự kiến. Public V2 boundary tự kiểm:

```sql
if coalesce(auth.role(), '') not in ('', 'service_role')
   and not public.vmp_is_active_session(auth.uid()) then
  return public.vmp_session_denial();
end if;
if coalesce(auth.role(), '') <> 'service_role'
   and public.vmp_business_role(auth.uid()) not in ('admin','qa_manager') then
  return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
    'error', 'Chỉ Admin và Quản lý QA được cập nhật deadline của hạng mục đã có tiến độ');
end if;
```

Preview V2 gọi `rpc_preview_catalog_change(p_change_id)`, rồi với từng `giu_nguyen` đang hoạt động tính lại deadline qua `vmp_tinh_moc_thoi_gian`, trả evidence, `missing`, bốn cặp old/new, `item_version`, `eligible`, `blocker_code` và `blocker_reason`. Hạng mục thuộc luồng “Dừng” không bao giờ eligible để đổi deadline.

Apply V2 làm đúng thứ tự:

1. kiểm session/role/reason/confirm và shape JSON;
2. `FOR UPDATE` dòng change, source object và toàn bộ selected plan items theo thứ tự code;
3. xử lý applied/superseded/not-found;
4. so timeline revision và item version;
5. gọi preview V2 lại trong transaction;
6. từ chối toàn bộ request nếu có mã không eligible, thiếu dữ liệu, mất dòng hoặc không có delta;
7. gọi `rpc_apply_catalog_change(p_change_id, p_reason, p_expected_timeline_revision)` để áp nhóm thường trong cùng transaction;
8. cập nhật đúng bốn deadline bằng dữ liệu preview đã khóa;
9. nếu row count không đúng, raise `WRITE_MISMATCH` để rollback;
10. cập nhật `vmp_catalog_changes.apply_result` với `so_ghi_de_deadline`, `deadline_overrides` old/new và `da_ap_truoc_do=false`.

Revoke mặc định và chỉ grant EXECUTE hai RPC V2 cho `authenticated, service_role`. Helper nội bộ không có browser grant.

- [ ] **Step 4: Chạy SQL GREEN và five-role regression**

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  bash scripts/run-catalog-progressed-deadline-db-tests.sh
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  npm run test:db:five-role
```

Expected: mọi case PASS + ROLLBACK; five-role suite exit 0; không mutation production.

- [ ] **Step 5: Inspect ACL/diff và commit**

```bash
git diff --check
git add supabase/migrations/20260826130000_catalog_progressed_deadline_override.sql \
  tests/sql/catalog-progressed-deadline-override.sql \
  scripts/run-catalog-progressed-deadline-db-tests.sh
git commit -m "feat(timeline): allow audited progressed deadline override"
```

---

### Task 3: Nối API và giao diện xác nhận đặc biệt

**Files:**
- Modify: `src/lib/supabaseData.ts`
- Modify: `src/components/catalog/CatalogImpactPreview.tsx`
- Create: `tests/unit/catalog-impact-preview.test.mjs`

**Interfaces:**

```ts
export interface AnhHuongTimelineV2 extends AnhHuongTimeline {
  deadline_overrides?: ProgressedDeadlineCandidate[];
}
export async function previewCatalogChangeV2(changeId: string): Promise<AnhHuongTimelineV2>;
export async function applyCatalogChangeV2(input: {
  changeId: string;
  reason: string;
  expectedTimelineRevision: number | null;
  deadlineOverrides: readonly DeadlineOverrideSelection[];
  overrideConfirmed: boolean;
}): Promise<KetQuaApDung & { so_ghi_de_deadline?: number; da_ap_truoc_do?: boolean }>;
```

- [ ] **Step 1: Viết unit RED cho markup và payload**

Render static component/content thuần với candidate `CCTB01/2026.01-PQ`. Assert:

- hiện bốn deadline cũ → mới;
- hiện evidence cụ thể “actual_validation_date: 20/03/2026” hoặc trạng thái tương ứng;
- checkbox mặc định tắt;
- candidate thiếu trường hiện “Không thể áp — thiếu: …” và không có checkbox;
- chọn override + confirm + reason tạo payload đúng code/version;
- lỗi server giữ dialog mở và hiện câu chi tiết.

- [ ] **Step 2: Chạy RED**

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/catalog-impact-preview.test.mjs
```

Expected: FAIL vì component chưa có V2/selection.

- [ ] **Step 3: Implement API/UI tối thiểu**

Thay câu sai “sửa tay ở màn Cập nhật tiến độ” bằng hai trạng thái:

- eligible: “Có thể cập nhật riêng deadline kế hoạch; ngày thực tế và trạng thái giữ nguyên.”
- blocked: “Không thể cập nhật deadline” + exact `blocker_reason/missing`.

Không đóng dialog khi API trả `ok:false`. Disable close và submit trong lúc mutation đang chạy; gửi mutation đúng một lần. Khi không có normal change nhưng có selected override, nút vẫn bật sau reason+confirm.

- [ ] **Step 4: Chạy focused GREEN, unit và typecheck**

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test \
  tests/unit/catalog-timeline-override-model.test.mjs \
  tests/unit/catalog-impact-preview.test.mjs
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run test:unit
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run typecheck
```

Expected: 0 fail; existing skip only.

- [ ] **Step 5: Inspect và commit**

```bash
git diff --check
git add src/lib/supabaseData.ts src/components/catalog/CatalogImpactPreview.tsx \
  tests/unit/catalog-impact-preview.test.mjs
git commit -m "feat(catalog): confirm progressed deadline updates"
```

---

### Task 4: E2E giả lập cho luồng thành công và mọi blocker chính

**Files:**
- Modify: `tests/e2e/gia-lap-supabase.mjs`
- Modify: `tests/e2e/catalog-workspace.mjs`

- [ ] **Step 1: Thêm fixture V2 và viết E2E RED**

Mock đầy đủ payload thật của hai RPC V2. Luồng thành công:

1. mở Dữ liệu nguồn;
2. lưu thay đổi tạo `change_id`;
3. thấy `CCTB01/2026.01-PQ`, deadline cũ/mới và evidence;
4. chọn override, nhập lý do, xác nhận;
5. assert request có exact code/version và `p_override_confirmed=true`;
6. thấy toast thành công và dialog đóng.

Luồng lỗi chạy lần lượt `MISSING_SOURCE_DATA`, `VERSION_CONFLICT`, `ITEM_STATE_CHANGED`, `FORBIDDEN`: dialog giữ nguyên, đúng lý do/thiếu thông tin hiển thị, không có mutation lần hai.

- [ ] **Step 2: Chạy RED**

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node tests/e2e/catalog-workspace.mjs
```

Expected: FAIL ở selector/copy V2 chưa có hoặc request payload chưa đúng.

- [ ] **Step 3: Hoàn thiện fixture/selector tối thiểu và chạy GREEN**

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node tests/e2e/catalog-workspace.mjs
```

Expected: tất cả scenario pass, process exit 0.

- [ ] **Step 4: Commit**

```bash
git diff --check
git add tests/e2e/gia-lap-supabase.mjs tests/e2e/catalog-workspace.mjs
git commit -m "test(catalog): cover progressed deadline override E2E"
```

---

### Task 5: Review độc lập, full gate và bàn giao phát hành

**Files:**
- Create: `docs/runbooks/2026-08-26-catalog-progressed-deadline-override-deploy.md`

- [ ] **Step 1: Sol security review**

Reviewer `gpt-5.6-sol` kiểm toàn bộ diff theo Critical/Important, tập trung: privilege escalation, SECURITY DEFINER/search_path, hidden impl bypass, input JSON shape, stale item version, lost update, partial commit, idempotency, preservation actual/status và error information leakage.

Expected: 0 Critical / 0 Important trước full gate. Tối đa ba fix wave, mỗi wave có focused RED/GREEN.

- [ ] **Step 2: Chạy full verification bằng Node 24**

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run typecheck
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run test:unit
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  bash scripts/run-catalog-progressed-deadline-db-tests.sh
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run test:db:five-role
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run build
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run e2e:catalog
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run e2e:gialap
git diff --check
git status --short
```

Expected: 0 fail; DB PASS + ROLLBACK; build/E2E exit 0.

- [ ] **Step 3: Viết runbook forward-only**

Runbook ghi SHA-256 migration, exact commit, preflight read-only, backup/apply đúng một lần, postflight trên kết nối mới trước/sau schema cache reload, rollback logic bằng `FEATURE_DISABLED`, và xác nhận không có mutation test production. Không chạy các bước production trong task này.

- [ ] **Step 4: Final whole-diff Sol review và commit runbook**

```bash
git add docs/runbooks/2026-08-26-catalog-progressed-deadline-override-deploy.md
git commit -m "docs(timeline): add deadline override deploy runbook"
git status --short
```

Expected: worktree sạch; branch sẵn sàng để người dùng duyệt push/deploy riêng.

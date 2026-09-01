# Wave 3 — Source Import Server Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho người duyệt thấy phân loại và diff do server xác nhận cho từng dòng Excel Dữ liệu nguồn trước khi commit, kèm lý do, conflict recovery và biên nhận truy vết.

**Architecture:** Thêm một RPC read-only, owner-scoped và phân trang trên hai bảng staging hiện có. Frontend decode exact-key vào model thuần, sau đó component bảng chỉ render model đã xác minh; `CatalogExcelImport` tiếp tục điều phối stage/commit hiện có và không tải toàn bộ Source về browser.

**Tech Stack:** PostgreSQL/Supabase RPC, React 19, TypeScript, Vite, Node test runner, Puppeteer, Playwright axe, CSS Lotus.

## Global Constraints

- Server là nguồn sự thật cho `create/update/unchanged/error`; frontend không tự phân loại Source.
- Chỉ uploader active đọc được batch của chính mình; batch khác trả cùng bề mặt `BATCH_NOT_FOUND`.
- Không trả `input`, `expected_version`, `uploaded_by` hoặc extra key qua RPC preview.
- Không thay đổi định dạng Excel, giới hạn 5 MiB/2.000 dòng hoặc RPC commit hiện có.
- Migration, preflight, postflight và rollback chỉ được tạo/kiểm tra local; không apply production.
- Không push/deploy trong plan này.
- TDD bắt buộc; mỗi task kết thúc bằng commit local riêng.

---

### Task 1: Contract và model preview thuần

**Files:**
- Create: `src/features/catalogWorkspace/catalogImportPreviewContract.ts`
- Create: `src/features/catalogWorkspace/catalogImportPreviewModel.ts`
- Test: `tests/unit/catalog-import-preview-contract.test.mjs`
- Test: `tests/unit/catalog-import-preview-model.test.mjs`

**Interfaces:**
- Produces: `decodeCatalogImportPreview(value: unknown): CatalogImportPreviewResult`.
- Produces: `appendCatalogImportPreviewPage(state, page): CatalogImportPreviewState`.
- Produces: `filterCatalogImportRows(rows, { search, classification })`.
- Produces: `catalogImportCommitBlock(input): ActionBlock | null`.
- Produces types `CatalogImportPreviewBatch`, `CatalogImportPreviewRow`, `CatalogImportPreviewPage`, `CatalogImportPreviewError`.

- [ ] **Step 1: Viết test RED cho decoder exact-key**

```js
const payload = {
  ok: true,
  batch: {
    id: BATCH_ID, dataset: "source_objects", status: "validated", total: 2,
    counts: { created: 1, updated: 1, unchanged: 0, errors: 0 },
    created_at: "2026-09-01T01:00:00Z", committed_at: null,
  },
  rows: [
    { row_number: 2, business_key: "TB-001", object_kind: "equipment",
      classification: "create", current_snapshot: null,
      patch: { object_code: "TB-001", object_name: "Máy 1" }, errors: [], row_reason: null },
    { row_number: 3, business_key: "TB-002", object_kind: "equipment",
      classification: "update", current_snapshot: { object_name: "Cũ" },
      patch: { object_name: "Mới" }, errors: [], row_reason: "Điều chỉnh tên" },
  ],
  next_cursor: null,
};
assert.deepEqual(decodeCatalogImportPreview(payload).ok, true);
assert.throws(() => decodeCatalogImportPreview({ ...payload, uploaded_by: USER_ID }), /exact/i);
assert.throws(() => decodeCatalogImportPreview({ ...payload,
  batch: { ...payload.batch, counts: { ...payload.batch.counts, errors: 1 } } }), /total/i);
```

- [ ] **Step 2: Chạy test và xác nhận RED vì module chưa tồn tại**

Run: `node --import tsx --test tests/unit/catalog-import-preview-contract.test.mjs`

Expected: FAIL `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Cài decoder fail-closed**

```ts
export type CatalogImportClassification = "create" | "update" | "unchanged" | "error";

export type CatalogImportPreviewResult =
  | { ok: true; page: CatalogImportPreviewPage }
  | { ok: false; errorCode: CatalogImportPreviewErrorCode; error: string };

export function decodeCatalogImportPreview(value: unknown): CatalogImportPreviewResult {
  const root = exactRecord(value, "catalog import preview");
  if (root.ok === false) return decodePreviewError(root);
  return { ok: true, page: decodePreviewPage(root) };
}
```

Decoder kiểm UUID, ISO timestamp, integer không âm, thứ tự `row_number`, enum, exact keys và tổng counts bằng `total`.

- [ ] **Step 4: Viết test RED cho reducer/readiness**

```js
assert.deepEqual(
  appendCatalogImportPreviewPage(emptyPreviewState(BATCH_ID), firstPage).rows.map((row) => row.rowNumber),
  [2, 3],
);
assert.throws(() => appendCatalogImportPreviewPage(stateA, pageOfBatchB), /batch/i);
assert.equal(catalogImportCommitBlock({ busy: false, previewOk: true,
  status: "validated", errors: 0, reason: " " })?.focusId, "cw-import-batch-reason");
```

- [ ] **Step 5: Cài model thuần**

```ts
export function catalogImportCommitBlock(input: CommitReadinessInput): ActionBlock | null {
  return firstActionBlock([
    { blocked: input.busy, code: "request", message: "Đang ghi lô" },
    { blocked: !input.previewOk, code: "preview", message: "Chưa có kết quả đối chiếu server" },
    { blocked: input.status !== "validated", code: "status", message: "Batch chưa sẵn sàng" },
    { blocked: input.errors > 0, code: "rows", message: `Còn ${input.errors} dòng lỗi` },
    { blocked: !input.reason.trim(), code: "required", message: "Nhập lý do của cả lô", focusId: "cw-import-batch-reason" },
  ]);
}
```

- [ ] **Step 6: Chạy unit GREEN và typecheck mục tiêu**

Run: `node --import tsx --test tests/unit/catalog-import-preview-contract.test.mjs tests/unit/catalog-import-preview-model.test.mjs`

Run: `npm.cmd run typecheck`

- [ ] **Step 7: Commit**

```powershell
git add -- src/features/catalogWorkspace/catalogImportPreviewContract.ts src/features/catalogWorkspace/catalogImportPreviewModel.ts tests/unit/catalog-import-preview-contract.test.mjs tests/unit/catalog-import-preview-model.test.mjs
git commit -m "feat: them contract preview import source"
```

### Task 2: Migration RPC owner-scoped và release artifacts

**Files:**
- Create: `supabase/migrations/20260901090000_catalog_import_server_preview.sql`
- Create: `scripts/check-catalog-import-preview-preflight.sql`
- Create: `scripts/check-catalog-import-preview.sql`
- Create: `scripts/rollback-catalog-import-preview.sql`
- Create: `docs/runbooks/2026-09-01-catalog-import-server-preview.md`
- Test: `tests/unit/catalog-import-preview-sql-contract.test.mjs`
- Test: `tests/sql/catalog-import-preview-security.sql`

**Interfaces:**
- Produces: `public.rpc_catalog_import_preview(uuid,integer,integer) returns jsonb`.
- Consumes tables `vmp_catalog_import_batches`, `vmp_catalog_import_rows` and helper `vmp_is_active_session(uuid)`.

- [ ] **Step 1: Viết SQL contract test RED**

```js
assert.match(migration, /create\s+or\s+replace\s+function\s+public\.rpc_catalog_import_preview/i);
assert.match(migration, /batch\.uploaded_by\s*=\s*auth\.uid\(\)/i);
assert.match(migration, /row_number\s*>\s*p_cursor/i);
assert.doesNotMatch(stripComments(migration), /['"]uploaded_by['"]|['"]expected_version['"]|['"]input['"]/i);
for (const artifact of artifacts) assert.equal(countOwnedTransactions(artifact), 1);
```

- [ ] **Step 2: Chạy test và xác nhận RED vì artifacts chưa tồn tại**

Run: `node --test tests/unit/catalog-import-preview-sql-contract.test.mjs`

Expected: FAIL `ENOENT`.

- [ ] **Step 3: Cài migration với precondition và exact payload**

RPC phải:

```sql
if p_batch_id is null or p_cursor < 0 or p_limit < 1 or p_limit > 200 then
  return jsonb_build_object('ok',false,'error_code','INVALID_ARGUMENT','error','Tham số không hợp lệ');
end if;

if coalesce(auth.role(),'') <> 'service_role'
   and not public.vmp_is_active_session(auth.uid()) then
  return jsonb_build_object('ok',false,'error_code','SESSION_INACTIVE','error','Phiên không hoạt động');
end if;

select * into v_batch from public.vmp_catalog_import_batches batch
where batch.id=p_batch_id
  and (coalesce(auth.role(),'')='service_role' or batch.uploaded_by=auth.uid());
```

Allowlist JSON dùng mảng field Source cố định:

```sql
array['object_code','object_name','department','area_code','line','validate_flag',
      'frequency_months','first_month','year_ref','report_class','work_group',
      'workdays','complexity_score','quality_impact_score','note','is_active']
```

Chỉ trả `current_snapshot` và `patch` sau khi lọc khóa; mapping classification server về đúng `create/update/unchanged/error`.

- [ ] **Step 4: Cài ACL và comment**

```sql
revoke all on function public.rpc_catalog_import_preview(uuid,integer,integer) from public, anon;
grant execute on function public.rpc_catalog_import_preview(uuid,integer,integer) to authenticated, service_role;
```

- [ ] **Step 5: Viết preflight/postflight/rollback và runbook**

Preflight xác minh hai bảng/cột/helper/signature hiện có. Postflight dùng hai uploader fixture để chứng minh cô lập batch, payload exact-key và phân trang. Rollback chỉ drop RPC mới và khôi phục ACL không cần vì không thay RPC cũ. Mỗi script sở hữu một transaction và kết thúc bằng marker `PASS` sau `ROLLBACK`.

- [ ] **Step 6: Viết migration harness SQL**

`tests/sql/catalog-import-preview-security.sql` phải kiểm active uploader, other admin, inactive, workshop, anon, service role, limit 0/201, repeated cursor và không rò khóa cấm.

- [ ] **Step 7: Chạy contract GREEN**

Run: `node --test tests/unit/catalog-import-preview-sql-contract.test.mjs`

Nếu local không có PostgreSQL fixture, không giả lập kết quả harness; ghi rõ harness chờ CI/database test.

- [ ] **Step 8: Commit**

```powershell
git add -- supabase/migrations/20260901090000_catalog_import_server_preview.sql scripts/check-catalog-import-preview-preflight.sql scripts/check-catalog-import-preview.sql scripts/rollback-catalog-import-preview.sql docs/runbooks/2026-09-01-catalog-import-server-preview.md tests/unit/catalog-import-preview-sql-contract.test.mjs tests/sql/catalog-import-preview-security.sql
git commit -m "feat: them rpc preview import source"
```

### Task 3: API preview và page coordinator

**Files:**
- Modify: `src/features/catalogWorkspace/api.ts`
- Modify: `src/types/database.ts`
- Test: `tests/unit/catalog-import-preview-api.test.mjs`

**Interfaces:**
- Consumes: `decodeCatalogImportPreview` từ Task 1.
- Produces: `fetchCatalogImportPreview(input: { batchId: string; cursor?: number; limit?: number }): Promise<CatalogImportPreviewResult>`.

- [ ] **Step 1: Viết test RED cho API source contract**

Test source/API boundary phải chứng minh tên RPC và wire args chính xác:

```js
assert.match(apiSource, /rpc_catalog_import_preview/);
assert.match(apiSource, /p_batch_id:\s*input\.batchId/);
assert.match(apiSource, /p_cursor:\s*input\.cursor\s*\?\?\s*0/);
assert.match(apiSource, /decodeCatalogImportPreview\(data\)/);
```

- [ ] **Step 2: Chạy test RED**

Run: `node --import tsx --test tests/unit/catalog-import-preview-api.test.mjs`

- [ ] **Step 3: Cài API fail-closed**

```ts
export async function fetchCatalogImportPreview(input: {
  batchId: string; cursor?: number; limit?: number;
}): Promise<CatalogImportPreviewResult> {
  if (!supabase) return { ok: false, errorCode: "NOT_AVAILABLE", error: "Chưa cấu hình Supabase" };
  const { data, error } = await supabase.rpc("rpc_catalog_import_preview" as never, {
    p_batch_id: input.batchId, p_cursor: input.cursor ?? 0, p_limit: input.limit ?? 100,
  } as never);
  if (thieuHam(error, data)) return { ok: false, errorCode: "NOT_AVAILABLE", error: "Server chưa có RPC preview import" };
  if (error) return { ok: false, errorCode: "RPC_ERROR", error: error.message };
  return decodeCatalogImportPreview(data);
}
```

- [ ] **Step 4: Bổ sung signature generated database type**

Thêm `rpc_catalog_import_preview` với ba args và `Returns: Json`; không chỉnh các type table khác.

- [ ] **Step 5: Chạy test GREEN và typecheck**

Run: `node --import tsx --test tests/unit/catalog-import-preview-api.test.mjs tests/unit/catalog-import-preview-contract.test.mjs`

Run: `npm.cmd run typecheck`

- [ ] **Step 6: Commit**

```powershell
git add -- src/features/catalogWorkspace/api.ts src/types/database.ts tests/unit/catalog-import-preview-api.test.mjs
git commit -m "feat: noi api preview import source"
```

### Task 4: Bảng preview server và lý do ngoại lệ

**Files:**
- Create: `src/features/catalogWorkspace/CatalogImportPreviewTable.tsx`
- Modify: `src/styles/catalog-workspace.css`
- Test: `tests/unit/catalog-import-preview-table.test.mjs`

**Interfaces:**
- Consumes: `CatalogImportPreviewState`, `filterCatalogImportRows` và `setCatalogImportRowReason`.
- Produces component props:

```ts
interface CatalogImportPreviewTableProps {
  state: CatalogImportPreviewState;
  loadingMore: boolean;
  onLoadMore: () => void;
  onSaveRowReason: (rowNumber: number, reason: string) => Promise<{ ok: boolean; error?: string }>;
}
```

- [ ] **Step 1: Viết SSR contract test RED**

```js
assert.match(source, /data-cw-preview-table/);
assert.match(source, /aria-expanded/);
assert.match(source, /aria-controls/);
assert.match(source, /Đã tải/);
assert.match(source, /Lý do ngoại lệ/);
```

- [ ] **Step 2: Chạy test RED**

Run: `node --import tsx --test tests/unit/catalog-import-preview-table.test.mjs`

- [ ] **Step 3: Cài summary/filter/table/expansion**

Render bốn count server, search/filter chỉ trên rows đã tải, trạng thái `Đã tải X/Y dòng`, native button expansion và `Tải thêm`. Update chỉ render keys trong `patch`; create render patch toàn phần; error render error list; unchanged thu gọn.

- [ ] **Step 4: Cài editor lý do dòng giữ draft khi lỗi**

Mỗi row có draft riêng. Khi save thành công cập nhật row reason qua callback; khi lỗi giữ textarea, `role=alert` và nút `Thử lại`. Không auto-save khi blur.

- [ ] **Step 5: Cài CSS desktop/mobile**

Container bảng dùng `overflow-x:auto`; bảng `min-width:760px`; page không tràn. Diff dùng hai cột trước/sau, error và status dùng token Lotus, focus-visible rõ.

- [ ] **Step 6: Chạy test GREEN và drift**

Run: `node --import tsx --test tests/unit/catalog-import-preview-table.test.mjs`

Run: `npm.cmd run drift`

- [ ] **Step 7: Commit**

```powershell
git add -- src/features/catalogWorkspace/CatalogImportPreviewTable.tsx src/styles/catalog-workspace.css tests/unit/catalog-import-preview-table.test.mjs
git commit -m "feat: them bang preview import source"
```

### Task 5: Tích hợp stage → preview → commit → receipt

**Files:**
- Modify: `src/features/catalogWorkspace/CatalogExcelImport.tsx`
- Modify: `src/features/catalogWorkspace/CatalogWorkspaceShell.tsx`
- Modify: `src/styles/catalog-workspace.css`
- Test: `tests/unit/catalog-excel-import-flow.test.mjs`
- Test: `tests/e2e/catalog-workspace.mjs`

**Interfaces:**
- Consumes: API Task 3, table Task 4, action readiness Wave 2.
- Produces: retry preview, load-more, batch/row reason, conflict preservation, receipt and `onCommitted(pendingChangeIds)`.

- [ ] **Step 1: Viết unit RED cho flow source**

Test source contract xác nhận `source_objects` không còn được gắn `loai: "server"`, component gọi `fetchCatalogImportPreview`, giữ `lyDo` khi commit fail, và textarea có id `cw-import-batch-reason`.

- [ ] **Step 2: Viết E2E RED cho server preview**

Mở rộng mock `rpc_catalog_import_preview` bằng hai trang chứa create/update/unchanged/error. Assertion phải kiểm count server, A3, tải thêm không lặp, reason failure giữ draft, batch reason focus, conflict không retry và receipt success.

- [ ] **Step 3: Chạy RED**

Run: `node --import tsx --test tests/unit/catalog-excel-import-flow.test.mjs`

Run: `node tests/e2e/catalog-workspace.mjs`

- [ ] **Step 4: Tích hợp preview state**

Khi stage thành công, reset state theo batch ID và fetch trang đầu. `Thử lại` gọi preview cùng batch; `Tải thêm` dùng `nextCursor`; response của batch cũ bị bỏ qua bằng generation token.

- [ ] **Step 5: Tích hợp readiness không khóa im lặng**

Nút commit chỉ `disabled` khi `dangGhi`; khi click, `catalogImportCommitBlock` báo lỗi và focus `fieldId`. Preview lỗi, batch lỗi và row lỗi không gửi mutation.

- [ ] **Step 6: Tích hợp receipt**

Sau commit thành công, giữ metadata/counts server trong receipt, format thời gian bằng `formatBangkokDateTime`, rút gọn batch ID, có copy button và nút mở `tab=pending` khi `pendingChangeIds.length > 0`. Chỉ gọi `onCommitted` sau mutation success.

- [ ] **Step 7: Chạy unit/E2E GREEN**

Run: `node --import tsx --test tests/unit/catalog-excel-import-flow.test.mjs tests/unit/catalog-import-preview-model.test.mjs tests/unit/catalog-import-preview-table.test.mjs`

Run: `node tests/e2e/catalog-workspace.mjs`

- [ ] **Step 8: Commit**

```powershell
git add -- src/features/catalogWorkspace/CatalogExcelImport.tsx src/features/catalogWorkspace/CatalogWorkspaceShell.tsx src/styles/catalog-workspace.css tests/unit/catalog-excel-import-flow.test.mjs tests/e2e/catalog-workspace.mjs
git commit -m "feat: hoan thien preview import source"
```

### Task 6: Release gate local và bàn giao

**Files:**
- Modify: `docs/handoffs/2026-09-01-ban-giao-codex.md`
- Modify: `docs/superpowers/plans/2026-09-01-source-import-server-preview.md`

**Interfaces:**
- Produces: bằng chứng local reproducible; không push/deploy/migration.

- [ ] **Step 1: Chạy targeted unit và SQL contract**

Run:

```powershell
node --import tsx --test tests/unit/catalog-import-preview-contract.test.mjs tests/unit/catalog-import-preview-model.test.mjs tests/unit/catalog-import-preview-api.test.mjs tests/unit/catalog-import-preview-table.test.mjs tests/unit/catalog-excel-import-flow.test.mjs tests/unit/catalog-import-preview-sql-contract.test.mjs
```

- [ ] **Step 2: Chạy bộ unit Windows theo bàn giao**

Dùng danh sách loại trừ 8 spawn test trong handoff và `--test-concurrency=4`; báo đúng pass/skip/fail.

- [ ] **Step 3: Build và targeted E2E**

Run:

```powershell
npm.cmd run typecheck
$env:VITE_MANUAL_PLANNED_DEADLINES_ENABLED='true'; npm.cmd run build
node tests/e2e/catalog-workspace.mjs
node tests/e2e/source-qa-workshop-access.mjs
```

- [ ] **Step 4: Chạy UI gates**

Run:

```powershell
npm.cmd run drift
npm.cmd run budget
npx.cmd playwright test -c playwright.a11y.config.ts
```

- [ ] **Step 5: Quét an toàn và trạng thái Git**

Run secret scan chỉ in tên file, `git diff --check`, `git status --short`, và xác minh không có remote write.

- [ ] **Step 6: Cập nhật plan/handoff bằng commit thật**

Ghi commit mỗi task, gate, migration mới chưa apply và bước push một lần sau khi chủ dự án duyệt.

- [ ] **Step 7: Commit tài liệu bàn giao**

```powershell
git add -- docs/handoffs/2026-09-01-ban-giao-codex.md docs/superpowers/plans/2026-09-01-source-import-server-preview.md
git commit -m "docs: ban giao wave 3 preview import source"
```

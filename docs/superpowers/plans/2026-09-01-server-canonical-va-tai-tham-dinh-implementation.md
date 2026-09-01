# Server canonical và tái thẩm định Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa trạng thái, KPI, deadline và kỳ tái thẩm định về một nguồn sự thật phía server, loại bỏ suy diễn nghiệp vụ cạnh tranh ở client.

**Architecture:** Một hàm SQL thuần xác lập trạng thái canonical theo ngày Bangkok và một RPC dashboard versioned trả read model theo phạm vi. Tái thẩm định dùng proposal idempotent dựa trên ngày hoàn thành VMP thực tế; Admin/Quản lý QA xác nhận proposal trước khi tạo plan item.

**Tech Stack:** PostgreSQL 17, Supabase RPC/RLS, React 18, TypeScript, Node test runner, Playwright/Puppeteer E2E hiện có.

## Global Constraints

- Schema dump và staging restore phải đạt trước migration của kế hoạch này.
- Không suy đoán ngày hoàn thành từ deadline kế hoạch.
- Server timestamp dùng `(now() at time zone 'Asia/Bangkok')::date`.
- RPC fail-closed và lọc bằng biên quyền hạng mục hiện hành.
- Giữ nguyên năm giá trị `plan | todo | prog | done | over` để không phá UI.

---

### Task 1: Contract dashboard canonical version 1

**Files:**
- Create: `src/features/canonicalDashboard/contracts.ts`
- Test: `tests/unit/canonical-dashboard-contract.test.mjs`
- Modify: `src/lib/dashboardAuthorizationContracts.ts`

**Interfaces:**
- Consumes: JSON từ `rpc_get_vmp_dashboard_v2(p_year, p_include_missing)`.
- Produces: `decodeCanonicalDashboard(value): CanonicalDashboardPayload`.

```ts
export interface CanonicalActivityStatus {
  status: "plan" | "todo" | "prog" | "done" | "over";
  canonicalDeadline: string | null;
  daysLeft: number | null;
  statusAsOf: string;
}

export interface CanonicalDashboardPayload {
  contractVersion: 1;
  year: number;
  updatedAt: string;
  authorizationRevision: string;
  objects: VmpObject[];
  activities: Activity[];
  kpi: ServerKpi;
}
```

- [ ] **Step 1: Viết test decoder fail-closed**

Test bắt buộc đúng key cấp cao, `contract_version=1`, ISO date, năm integer và
mỗi activity có `st`, `canonical_deadline`, `status_as_of`; version 2 hoặc thiếu
field phải throw `CanonicalDashboardContractError`.

- [ ] **Step 2: Chạy test và xác nhận FAIL**

Run: `node --import tsx --test tests/unit/canonical-dashboard-contract.test.mjs`  
Expected: FAIL vì module chưa tồn tại.

- [ ] **Step 3: Cài decoder tối thiểu**

Decoder kiểm exact keys, map snake_case tại biên sang camelCase và giữ activity
UI với `st` lấy nguyên từ server. Không gọi `deriveActivityFields`.

- [ ] **Step 4: Chạy test và xác nhận PASS**

Run: `node --import tsx --test tests/unit/canonical-dashboard-contract.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit task**

```powershell
git add src/features/canonicalDashboard/contracts.ts src/lib/dashboardAuthorizationContracts.ts tests/unit/canonical-dashboard-contract.test.mjs
git commit -m "test: define canonical dashboard contract"
```

### Task 2: Hàm trạng thái canonical và RPC v2

**Files:**
- Create: `supabase/migrations/20260901110000_canonical_dashboard_read_model.sql`
- Create: `tests/sql/canonical-dashboard-status.sql`
- Create: `scripts/check-canonical-dashboard-preflight.sql`
- Create: `scripts/check-canonical-dashboard-postflight.sql`
- Create: `docs/runbooks/canonical-dashboard-read-model.md`

**Interfaces:**
- Produces: `vmp_canonical_item_status(vmp_plan_items,date) returns item_status`.
- Produces: `rpc_get_vmp_dashboard_v2(integer,boolean) returns jsonb`.

- [ ] **Step 1: Viết SQL test ma trận trạng thái**

Trong transaction rollback, tạo hạng mục cho các ca: completed → `done`;
in-progress → `prog`; chưa bắt đầu và deadline hôm qua → `over`; deadline hôm
nay/tương lai → `todo`; chưa có deadline → `plan`; hạng mục inactive không vào
read model. Ngày test truyền tường minh `date '2026-09-01'`.

- [ ] **Step 2: Chạy test trên staging trước migration**

Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f tests/sql/canonical-dashboard-status.sql`  
Expected: FAIL vì hàm chưa tồn tại.

- [ ] **Step 3: Viết migration fail-closed**

Hàm status là `stable`, không `security definer`, nhận ngày tường minh. RPC là
wrapper `security definer` có fixed `search_path`, kiểm session active, lấy dữ
liệu từ `vmp_visible_plan_items()`, trả:

```json
{
  "contract_version": 1,
  "year": 2026,
  "updated_at": "server timestamp",
  "authorization_revision": "revision",
  "objects": [],
  "activities": [],
  "kpi": {"validation":{},"documentation":{},"mismatch_count":0}
}
```

Mỗi activity nhận `st`, `canonical_deadline`, `days_left`, `status_as_of` từ
cùng hàm SQL; KPI aggregate trên chính tập dòng đó.

- [ ] **Step 4: Apply staging và chạy SQL tests**

Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f supabase/migrations/20260901110000_canonical_dashboard_read_model.sql`  
Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f tests/sql/canonical-dashboard-status.sql`  
Expected: `PASS CANONICAL DASHBOARD STATUS`.

- [ ] **Step 5: Chạy persona scope**

Admin nhận toàn scope; QA/xưởng chỉ nhận hạng mục `vmp_visible_plan_items()` cho
phép; inactive và unknown role nhận `FORBIDDEN`. KPI phải đúng tổng trên chính
payload, không phải tổng toàn nhà máy.

- [ ] **Step 6: Commit task**

```powershell
git add supabase/migrations/20260901110000_canonical_dashboard_read_model.sql tests/sql/canonical-dashboard-status.sql scripts/check-canonical-dashboard-preflight.sql scripts/check-canonical-dashboard-postflight.sql docs/runbooks/canonical-dashboard-read-model.md
git commit -m "feat: add canonical dashboard read model"
```

### Task 3: Chuyển dashboard chính sang contract server

**Files:**
- Modify: `src/lib/supabaseData.ts`
- Modify: `src/types/domain.ts`
- Modify: `src/hooks/index.ts`
- Test: `tests/unit/canonical-dashboard-adapter.test.mjs`
- Modify: `tests/e2e/doi-chieu-du-lieu.mjs`

**Interfaces:**
- Consumes: `decodeCanonicalDashboard` Task 1.
- Produces: `fetchVmpDataFromSupabase()` trả `VmpDataset` với `Activity.st` từ server.

- [ ] **Step 1: Viết failing adapter test**

Mock RPC trả activity có `_raw` dẫn đến client cũ suy `over` nhưng server trả
`st='todo'`; expected kết quả cuối vẫn là `todo`. Test cũng xác nhận RPC name là
`rpc_get_vmp_dashboard_v2`.

- [ ] **Step 2: Chạy test và xác nhận FAIL**

Run: `node --import tsx --test tests/unit/canonical-dashboard-adapter.test.mjs`  
Expected: FAIL vì code còn gọi v1 và `deriveActivityFields`.

- [ ] **Step 3: Thay adapter**

Trong `supabaseData.ts`, gọi v2, decode contract và bỏ import/call
`deriveActivityFields` khỏi đường Supabase. Giữ adapter n8n chỉ cho compatibility
offline; thêm `statusSource: 'server'` vào Activity để màn Health hiển thị nguồn.

- [ ] **Step 4: Chạy unit và E2E đối chiếu**

Run: `node --import tsx --test tests/unit/canonical-dashboard-adapter.test.mjs`  
Run: `npm run doichieu`  
Expected: PASS; số lệch client/server bằng 0 cho cùng năm/phạm vi.

- [ ] **Step 5: Commit task**

```powershell
git add src/lib/supabaseData.ts src/types/domain.ts src/hooks/index.ts tests/unit/canonical-dashboard-adapter.test.mjs tests/e2e/doi-chieu-du-lieu.mjs
git commit -m "refactor: consume server canonical dashboard"
```

### Task 4: Loại bỏ kết luận nghiệp vụ cạnh tranh ở các màn

**Files:**
- Modify: `src/lib/reportModel.ts`
- Modify: `src/features/progress/progressWorkspaceModel.ts`
- Modify: `src/features/today/todayModel.ts`
- Modify: `src/features/timeline/timelineSummaryModel.ts`
- Modify: `src/features/monitoring/monitoringMetrics.ts`
- Test: `tests/unit/server-status-consumers.test.mjs`

**Interfaces:**
- Consumes: `Activity.st`, canonical milestone fields và `statusSource='server'`.
- Produces: các bảng/chỉ số chỉ aggregate trạng thái server.

- [ ] **Step 1: Viết fixture bất đồng raw/server**

Một activity có raw deadline quá hạn nhưng `st='todo'`; mọi consumer phải dùng
`todo`, không gọi date parser để đổi thành `over`. Báo cáo hoàn thành vẫn đọc
phase status cụ thể khi chỉ số đó mô tả giai đoạn, nhưng không tự suy trạng thái
tổng.

- [ ] **Step 2: Chạy test và ghi rõ consumer còn lệch**

Run: `node --import tsx --test tests/unit/server-status-consumers.test.mjs`  
Expected: FAIL và liệt kê model còn tự suy.

- [ ] **Step 3: Refactor tối thiểu từng model**

Thay nhánh suy deadline/status bằng `Activity.st` hoặc field canonical. Không đổi
copy, bố cục hoặc bộ lọc ngoài việc ghi nguồn số liệu là server.

- [ ] **Step 4: Chạy unit suite**

Run: `npm run test:unit`  
Expected: PASS.

- [ ] **Step 5: Commit task**

```powershell
git add src/lib/reportModel.ts src/features/progress/progressWorkspaceModel.ts src/features/today/todayModel.ts src/features/timeline/timelineSummaryModel.ts src/features/monitoring/monitoringMetrics.ts tests/unit/server-status-consumers.test.mjs
git commit -m "refactor: make server status authoritative"
```

### Task 5: Schema proposal tái thẩm định

**Files:**
- Create: `supabase/migrations/20260901120000_revalidation_proposals.sql`
- Create: `tests/sql/revalidation-proposals.sql`
- Create: `docs/runbooks/revalidation-proposals.md`

**Interfaces:**
- Produces: table `vmp_revalidation_proposals`.
- Produces: `rpc_refresh_revalidation_proposals(p_as_of date) returns jsonb`.
- Produces: `rpc_confirm_revalidation_proposal(p_proposal_id uuid,p_reason text,p_expected_version integer) returns jsonb`.

```sql
-- Trạng thái proposal được kiểm bằng constraint.
status text not null check (status in ('pending','confirmed','dismissed','obsolete'))
```

- [ ] **Step 1: Viết SQL test chu kỳ**

Ca kiểm: hoàn thành 2024-02-29 + 12 tháng; chu kỳ 6/12/24 tháng; thiếu
`actual_vmp_date`; chạy refresh hai lần; hoàn thành trễ; proposal đã confirmed.
Expected không trùng khóa `(plan_item_id, due_date)` và thiếu actual date không
tạo proposal.

- [ ] **Step 2: Chạy test và xác nhận FAIL**

Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f tests/sql/revalidation-proposals.sql`  
Expected: FAIL vì table/RPC chưa tồn tại.

- [ ] **Step 3: Viết migration và RLS**

Refresh dùng `actual_vmp_date + make_interval(months => frequency_months)`;
upsert idempotent; item không còn active làm proposal pending thành obsolete.
Chỉ Admin/QA Manager refresh/confirm/dismiss; mọi vai chỉ SELECT proposal của
hạng mục họ được xem. Confirm gọi đường tạo plan item chuẩn trong cùng
transaction, ghi audit và version-lock proposal.

- [ ] **Step 4: Apply staging và chạy tests**

Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f supabase/migrations/20260901120000_revalidation_proposals.sql`  
Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f tests/sql/revalidation-proposals.sql`  
Expected: `PASS REVALIDATION PROPOSALS`.

- [ ] **Step 5: Commit task**

```powershell
git add supabase/migrations/20260901120000_revalidation_proposals.sql tests/sql/revalidation-proposals.sql docs/runbooks/revalidation-proposals.md
git commit -m "feat: add revalidation proposal workflow"
```

### Task 6: Bảng quản lý tái thẩm định

**Files:**
- Create: `src/features/revalidation/contracts.ts`
- Create: `src/features/revalidation/api.ts`
- Create: `src/features/revalidation/RevalidationProposalTable.tsx`
- Modify: `src/features/catalogWorkspace/CatalogWorkspaceShell.tsx`
- Modify: `src/index.css`
- Test: `tests/unit/revalidation-contract.test.mjs`
- Test: `tests/e2e/revalidation-proposals.mjs`

**Interfaces:**
- Consumes: hai RPC Task 5.
- Produces: bảng proposal với filter trạng thái/kỳ hạn và action confirm/dismiss.

- [ ] **Step 1: Viết contract/API tests**

Decoder bắt exact UUID/date/status/version. Mutation bắt reason trim tối thiểu 5
ký tự và expectedVersion integer; response conflict giữ `current_version` để UI
reload.

- [ ] **Step 2: Chạy tests và xác nhận FAIL**

Run: `node --import tsx --test tests/unit/revalidation-contract.test.mjs`  
Expected: FAIL vì module chưa tồn tại.

- [ ] **Step 3: Xây bảng desktop gọn**

Cột: Mã, đối tượng, hoàn thành gần nhất, chu kỳ, kỳ tiếp theo, trạng thái, hành
động. Nút confirm/dismiss chỉ hiện cho Admin/QA Manager; modal bắt lý do; pending
disable nút; conflict reload đúng dòng. Hướng dẫn nghiệp vụ nằm trong tooltip/
drawer, không thành đoạn văn dài trên màn.

- [ ] **Step 4: Chạy unit, E2E, a11y**

Run: `node --import tsx --test tests/unit/revalidation-contract.test.mjs`  
Run: `node tests/e2e/revalidation-proposals.mjs`  
Run: `npm run a11y`  
Expected: PASS.

- [ ] **Step 5: Commit task**

```powershell
git add src/features/revalidation src/features/catalogWorkspace/CatalogWorkspaceShell.tsx src/index.css tests/unit/revalidation-contract.test.mjs tests/e2e/revalidation-proposals.mjs
git commit -m "feat: add revalidation proposal table"
```

### Task 7: Gate gói canonical

**Files:**
- Modify: `docs/handoffs/2026-09-01-ban-giao-codex.md`
- Create: `docs/receipts/2026-09-01-canonical-revalidation.md`

- [ ] **Step 1: Chạy targeted gates**

Run: `npm run test:unit`  
Run: `npm run typecheck`  
Run: `npm run build`  
Run: `npm run doichieu`  
Run: `node tests/e2e/revalidation-proposals.mjs`  
Expected: tất cả PASS.

- [ ] **Step 2: Chạy staging postflight/persona**

Run hai SQL postflight trên connection mới; xác nhận KPI payload bằng aggregate,
unknown/inactive fail-closed và proposal không trùng sau hai lần refresh.

- [ ] **Step 3: Ghi receipt và commit**

```powershell
git add docs/receipts/2026-09-01-canonical-revalidation.md docs/handoffs/2026-09-01-ban-giao-codex.md
git commit -m "docs: seal canonical data gate"
```


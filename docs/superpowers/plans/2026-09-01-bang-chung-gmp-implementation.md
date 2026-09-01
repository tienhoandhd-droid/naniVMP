# Bằng chứng GMP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biến báo cáo, hồ sơ, chữ ký QA và lịch sử hạng mục thành bằng chứng có phiên bản, hash, quyền truy cập và audit truy vết được.

**Architecture:** Snapshot được server dựng từ read model canonical rồi khóa khi approved; file hồ sơ nằm trong private Storage còn DB giữ manifest/version/checksum. QA Manager ký một item version + evidence manifest hash; thay đổi trọng yếu tạo event invalidation, không sửa chữ ký cũ.

**Tech Stack:** PostgreSQL 17, Supabase RPC/RLS/Storage, Web Crypto SHA-256, React 18, TypeScript, ExcelJS, Node tests, E2E mock.

## Global Constraints

- Plan nền tảng và server canonical phải đạt trên staging trước migration này.
- Không tin KPI, hash manifest, actor hoặc timestamp do client gửi.
- QA Manager là vai duy nhất được ký/thu hồi phê duyệt QA.
- File không ghi đè; version mới supersede version cũ có lý do.
- Snapshot approved, approval event và audit event là bất biến.
- Không log nội dung hồ sơ, signed URL hoặc token.

---

### Task 1: Contract snapshot và export receipt

**Files:**
- Create: `src/features/reportSnapshots/contracts.ts`
- Create: `src/features/reportSnapshots/api.ts`
- Create: `src/features/reportSnapshots/reportSnapshotModel.ts`
- Test: `tests/unit/report-snapshot-model.test.mjs`

**Interfaces:**

```ts
export type ReportExportFormat = "xlsx" | "html" | "pdf";

export interface ReportSnapshotReceipt {
  snapshotId: string;
  contentHash: string;
  periodLabel: string;
  status: "draft" | "approved" | "archived";
  createdAt: string;
}

export async function createReportSnapshot(input: {
  reportPeriod: "monthly" | "quarterly" | "annual" | "custom";
  year: number;
  month?: number;
  quarter?: number;
  filters: Record<string, unknown>;
  templateVersion: string;
}): Promise<ReportSnapshotReceipt>;

export async function prepareReportExport(
  snapshotId: string,
  format: ReportExportFormat,
): Promise<{ receiptId: string; contentHash: string; snapshot: unknown }>;
```

- [ ] **Step 1: Viết decoder/model tests**

Test exact UUID, lowercase SHA-256 64 ký tự, enum/status/ISO timestamp, filter
allowlist và stable file name. Response thiếu hash hoặc format lạ phải throw,
không fallback sang export dữ liệu sống.

- [ ] **Step 2: Chạy test và xác nhận FAIL**

Run: `node --import tsx --test tests/unit/report-snapshot-model.test.mjs`  
Expected: FAIL vì feature chưa tồn tại.

- [ ] **Step 3: Cài contract/API/model tối thiểu**

API gọi `rpc_create_report_snapshot` và `rpc_prepare_report_export`; model dựng
tên file từ period label + 8 ký tự đầu content hash và không đọc state dashboard
sau khi receipt đã tạo.

- [ ] **Step 4: Chạy test và xác nhận PASS**

Run: `node --import tsx --test tests/unit/report-snapshot-model.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit task**

```powershell
git add src/features/reportSnapshots tests/unit/report-snapshot-model.test.mjs
git commit -m "test: define report snapshot contract"
```

### Task 2: Snapshot bất biến và audit EXPORT phía server

**Files:**
- Create: `supabase/migrations/20260901130000_gmp_report_snapshots.sql`
- Create: `tests/sql/gmp-report-snapshots.sql`
- Create: `tests/sql/gmp-report-snapshots-security.sql`
- Create: `docs/runbooks/gmp-report-snapshots.md`

**Interfaces:**
- Produces: `rpc_create_report_snapshot(text,integer,integer,integer,jsonb,text) returns jsonb`.
- Produces: `rpc_approve_report_snapshot(uuid,text,integer) returns jsonb`.
- Produces: `rpc_prepare_report_export(uuid,text) returns jsonb`.
- Produces: table `vmp_report_export_receipts`.

- [ ] **Step 1: Viết SQL behavior/security tests**

Ca bắt buộc: server bỏ qua KPI client vì RPC không nhận KPI; snapshot payload
khớp canonical RPC; cùng input/revision cho cùng hash; approved UPDATE/DELETE bị
chặn; prepare export tạo đúng một receipt/audit `EXPORT`; actor thấp bị
`FORBIDDEN`; direct DML vào snapshot/receipt/audit bị revoke.

- [ ] **Step 2: Chạy tests trước migration**

Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f tests/sql/gmp-report-snapshots.sql`  
Expected: FAIL vì RPC/receipt chưa tồn tại.

- [ ] **Step 3: Viết migration nguyên tử**

RPC create lấy canonical payload theo actor/year, áp filter allowlist, chuẩn hóa
JSON bằng `jsonb`, tính `encode(digest(payload::text,'sha256'),'hex')`, insert
snapshot draft. RPC approve dùng version-lock và chuyển `approved`; trigger chặn
mutation payload/hash/filter của approved/archived. Prepare export khóa row,
insert receipt và một audit có `snapshot_id`, `format`, `content_hash`,
`template_version`, `outcome='prepared'`.

- [ ] **Step 4: Apply staging và chạy SQL tests**

Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f supabase/migrations/20260901130000_gmp_report_snapshots.sql`  
Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f tests/sql/gmp-report-snapshots.sql`  
Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f tests/sql/gmp-report-snapshots-security.sql`  
Expected: hai marker PASS.

- [ ] **Step 5: Commit task**

```powershell
git add supabase/migrations/20260901130000_gmp_report_snapshots.sql tests/sql/gmp-report-snapshots.sql tests/sql/gmp-report-snapshots-security.sql docs/runbooks/gmp-report-snapshots.md
git commit -m "feat: add immutable report snapshots"
```

### Task 3: Giao diện bảng snapshot và xuất từ snapshot

**Files:**
- Create: `src/features/reportSnapshots/ReportSnapshotTable.tsx`
- Create: `src/features/reportSnapshots/ReportSnapshotActions.tsx`
- Modify: `src/components/dashboard/ReportsView.tsx`
- Modify: `src/index.css`
- Test: `tests/e2e/report-snapshot-export.mjs`

**Interfaces:**
- Consumes: API Task 1 và snapshot payload Task 2.
- Produces: bảng snapshot và ba export format chỉ từ snapshot.

- [ ] **Step 1: Viết E2E đỏ**

Kịch bản: tạo snapshot A, đổi fixture dashboard sống, xuất xlsx/html/pdf và xác
nhận cả ba vẫn có snapshot id/hash A; bấm lặp khi pending chỉ gọi RPC một lần;
actor không đủ quyền không thấy create/approve/export.

- [ ] **Step 2: Chạy E2E và xác nhận FAIL**

Run: `node tests/e2e/report-snapshot-export.mjs`  
Expected: FAIL vì bảng chưa tồn tại.

- [ ] **Step 3: Xây UI desktop gọn**

Trên Báo cáo, thêm toolbar `Chốt kỳ` và bảng cột Kỳ, Phạm vi, Hash, Trạng thái,
Người chốt, Thời điểm, Hành động. Chi tiết payload mở drawer. Ba exporter nhận
payload của `prepareReportExport`, không đọc `acts` hiện tại. Pending/error/toast
rõ và nút có accessible name.

- [ ] **Step 4: Chạy E2E/typecheck**

Run: `node tests/e2e/report-snapshot-export.mjs`  
Run: `npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit task**

```powershell
git add src/features/reportSnapshots src/components/dashboard/ReportsView.tsx src/index.css tests/e2e/report-snapshot-export.mjs
git commit -m "feat: export immutable report snapshots"
```

### Task 4: Contract hồ sơ, hash file và API

**Files:**
- Create: `src/features/gmpEvidence/contracts.ts`
- Create: `src/features/gmpEvidence/fileHash.ts`
- Create: `src/features/gmpEvidence/api.ts`
- Test: `tests/unit/gmp-evidence-contracts.test.mjs`

**Interfaces:**

```ts
export type GmpDocumentType = "protocol" | "raw_data" | "report" | "certificate" | "other";
export type GmpDocumentStatus = "reserved" | "active" | "superseded" | "void";

export interface ItemDocument {
  id: string;
  validationCode: string;
  documentCode: string;
  documentVersion: string;
  documentType: GmpDocumentType;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  status: GmpDocumentStatus;
  uploadedAt: string | null;
}

export async function sha256File(file: File): Promise<string>;
export async function reserveItemDocument(input: Omit<ItemDocument,"id"|"status"|"uploadedAt">): Promise<ItemDocument & { storagePath: string }>;
export async function finalizeItemDocument(documentId: string): Promise<ItemDocument>;
```

- [ ] **Step 1: Viết unit tests**

Hash fixture `abc` phải bằng SHA-256 chuẩn; decoder từ chối MIME ngoài
`application/pdf`, Office Open XML và ảnh được duyệt; size phải 1..25 MiB; mã/
version trim và không nhận path từ client.

- [ ] **Step 2: Chạy test và xác nhận FAIL**

Run: `node --import tsx --test tests/unit/gmp-evidence-contracts.test.mjs`  
Expected: FAIL vì module chưa tồn tại.

- [ ] **Step 3: Cài model/API**

Hash dùng `crypto.subtle.digest`; API reserve nhận metadata/hash, server trả path,
upload qua private bucket rồi finalize. Khi finalize lỗi, UI giữ document
`reserved` để operator retry/void; không tự coi upload thành công.

- [ ] **Step 4: Chạy test và xác nhận PASS**

Run: `node --import tsx --test tests/unit/gmp-evidence-contracts.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit task**

```powershell
git add src/features/gmpEvidence/contracts.ts src/features/gmpEvidence/fileHash.ts src/features/gmpEvidence/api.ts tests/unit/gmp-evidence-contracts.test.mjs
git commit -m "test: define gmp document contract"
```

### Task 5: Private Storage và metadata hồ sơ

**Files:**
- Create: `supabase/migrations/20260901140000_gmp_item_documents.sql`
- Create: `tests/sql/gmp-item-documents.sql`
- Create: `tests/sql/gmp-item-documents-security.sql`
- Create: `docs/runbooks/gmp-item-documents.md`

**Interfaces:**
- Produces: `vmp_item_documents` và private bucket `vmp-gmp-documents`.
- Produces RPC reserve/finalize/list/supersede/void.

- [ ] **Step 1: Viết SQL tests**

Ca bắt buộc: path server chọn không có email; reserved object chỉ uploader đúng
hạng mục được insert; finalize kiểm object/size/MIME; version mới không overwrite;
signed read/list chỉ trong scope; actor khác bị chặn; direct metadata DML bị
revoke; unknown MIME/size/hash sai bị từ chối.

- [ ] **Step 2: Chạy tests trước migration**

Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f tests/sql/gmp-item-documents.sql`  
Expected: FAIL.

- [ ] **Step 3: Viết migration/RLS**

Khóa unique `(plan_item_id,document_code,document_version)`. Storage path dạng
`<plan_item_uuid>/<document_uuid>/<safe_filename>`. Policy `storage.objects`
đối chiếu row reserved/active và `vmp_can_view_item`; không cho list bucket toàn
cục. Supersede/void bắt lý do, ghi audit và không xóa object.

- [ ] **Step 4: Apply staging và chạy tests**

Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f supabase/migrations/20260901140000_gmp_item_documents.sql`  
Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f tests/sql/gmp-item-documents.sql`  
Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f tests/sql/gmp-item-documents-security.sql`  
Expected: PASS.

- [ ] **Step 5: Commit task**

```powershell
git add supabase/migrations/20260901140000_gmp_item_documents.sql tests/sql/gmp-item-documents.sql tests/sql/gmp-item-documents-security.sql docs/runbooks/gmp-item-documents.md
git commit -m "feat: add private gmp document storage"
```

### Task 6: Panel hồ sơ trên chi tiết hạng mục

**Files:**
- Create: `src/features/gmpEvidence/ItemDocumentsPanel.tsx`
- Modify: `src/components/dashboard/ProgressEditModal.tsx`
- Modify: `src/index.css`
- Test: `tests/e2e/gmp-document-upload.mjs`

- [ ] **Step 1: Viết E2E đỏ**

Upload → hash → reserve → storage upload → finalize; hiển thị version/status;
download signed URL; supersede bắt reason; actor ngoài scope không xem/upload;
double click không tạo hai reservation.

- [ ] **Step 2: Chạy E2E và xác nhận FAIL**

Run: `node tests/e2e/gmp-document-upload.mjs`  
Expected: FAIL.

- [ ] **Step 3: Xây panel dạng bảng**

Cột Loại, Mã, Phiên bản, Tệp, Hash ngắn, Trạng thái, Người/giờ, Hành động. Form
upload nằm trong dialog, thông báo tiến độ hash/upload/finalize bằng live region;
không hiển thị hướng dẫn dài thường trực.

- [ ] **Step 4: Chạy E2E/a11y**

Run: `node tests/e2e/gmp-document-upload.mjs`  
Run: `npm run a11y`  
Expected: PASS.

- [ ] **Step 5: Commit task**

```powershell
git add src/features/gmpEvidence/ItemDocumentsPanel.tsx src/components/dashboard/ProgressEditModal.tsx src/index.css tests/e2e/gmp-document-upload.mjs
git commit -m "feat: add item document panel"
```

### Task 7: Approval event và invalidation

**Files:**
- Create: `supabase/migrations/20260901150000_gmp_qa_approval.sql`
- Create: `tests/sql/gmp-qa-approval.sql`
- Create: `tests/sql/gmp-qa-approval-security.sql`
- Create: `src/features/gmpEvidence/qaApprovalModel.ts`
- Create: `src/features/gmpEvidence/QaApprovalPanel.tsx`
- Test: `tests/unit/qa-approval-model.test.mjs`
- Test: `tests/e2e/gmp-evidence-approval.mjs`

**Interfaces:**
- Produces: `vmp_item_approval_events` append-only.
- Produces: `rpc_sign_item_qa_approval(text,integer,text,text)`.
- Produces: `rpc_revoke_item_qa_approval(uuid,text)` và state reader.

- [ ] **Step 1: Viết unit/SQL tests**

Manifest hash do server dựng từ item version + active document id/version/hash.
QA Manager ký thành valid; Admin/QA Staff/xưởng bị chặn; stale version conflict;
progress/date/document change tạo invalidated event; revoke bắt reason; event
không UPDATE/DELETE được.

- [ ] **Step 2: Chạy tests và xác nhận FAIL**

Run: `node --import tsx --test tests/unit/qa-approval-model.test.mjs`  
Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f tests/sql/gmp-qa-approval.sql`  
Expected: FAIL.

- [ ] **Step 3: Viết migration/model/UI**

RPC kiểm role `qa_manager`, active session, expected version và reason; server
timestamp/hash. Panel hiển thị status/version/hash ngắn/người/giờ, dialog xác
nhận ý nghĩa chữ ký và yêu cầu re-auth qua Supabase Auth trước RPC. Mutation
thành công refresh item, documents, approval và history cùng lúc.

- [ ] **Step 4: Apply staging và chạy gates**

Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f supabase/migrations/20260901150000_gmp_qa_approval.sql`  
Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f tests/sql/gmp-qa-approval.sql`  
Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f tests/sql/gmp-qa-approval-security.sql`  
Run: `node tests/e2e/gmp-evidence-approval.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit task**

```powershell
git add supabase/migrations/20260901150000_gmp_qa_approval.sql src/features/gmpEvidence/qaApprovalModel.ts src/features/gmpEvidence/QaApprovalPanel.tsx tests/sql/gmp-qa-approval.sql tests/sql/gmp-qa-approval-security.sql tests/unit/qa-approval-model.test.mjs tests/e2e/gmp-evidence-approval.mjs
git commit -m "feat: add qa approval evidence"
```

### Task 8: Lịch sử phân trang và chi tiết trước/sau

**Files:**
- Modify: `src/lib/supabaseData.ts`
- Create: `src/features/itemHistory/ItemHistoryPanel.tsx`
- Modify: `src/components/dashboard/ProgressEditModal.tsx`
- Create: `tests/sql/item-history-persona.sql`
- Test: `tests/unit/item-history-pagination.test.mjs`
- Modify: `tests/e2e/luong-gia-lap.mjs`

**Interfaces:**
- Extends: `fetchItemProgressHistory(validationCode,limit,offset)` giữ tương thích.
- Produces: `fetchItemHistoryDetail(eventId): { before: unknown; after: unknown }`.

- [ ] **Step 1: Viết pagination/persona tests**

Hai trang 50+20 không trùng, tổng 70; response cũ sau đổi item bị bỏ; detail chỉ
tải khi mở; assigned actor thấy đúng item; actor ngoài scope và inactive nhận
`FORBIDDEN`.

- [ ] **Step 2: Chạy tests và xác nhận phần còn thiếu**

Run: `node --import tsx --test tests/unit/item-history-pagination.test.mjs`  
Expected: FAIL vì chưa có `Tải thêm`/detail.

- [ ] **Step 3: Xây panel và mở rộng RPC qua migration approval**

Panel thay component inline cũ, có tổng, `Tải thêm`, entity badge progress/
document/approval và drawer diff trước/sau. RPC history union audit liên quan,
kiểm `vmp_can_view_item` trước khi đọc filter/event detail.

- [ ] **Step 4: Chạy unit/E2E/SQL**

Run: `node --import tsx --test tests/unit/item-history-pagination.test.mjs`  
Run: `node tests/e2e/luong-gia-lap.mjs`  
Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f tests/sql/item-history-persona.sql`  
Expected: PASS.

- [ ] **Step 5: Commit task**

```powershell
git add src/lib/supabaseData.ts src/features/itemHistory src/components/dashboard/ProgressEditModal.tsx tests/sql/item-history-persona.sql tests/unit/item-history-pagination.test.mjs tests/e2e/luong-gia-lap.mjs
git commit -m "feat: paginate item evidence history"
```

### Task 9: Gate bằng chứng GMP

**Files:**
- Modify: `src/pages/AuditLogPage.tsx`
- Create: `docs/receipts/2026-09-01-gmp-evidence.md`
- Modify: `docs/handoffs/2026-09-01-ban-giao-codex.md`

- [ ] **Step 1: Hiển thị audit mới**

Audit table có summary snapshot/document/approval/export, không render raw
signed URL hoặc nội dung hồ sơ.

- [ ] **Step 2: Chạy targeted gates**

Run: `npm run test:unit`  
Run: `npm run typecheck`  
Run: `npm run build`  
Run: `node tests/e2e/report-snapshot-export.mjs`  
Run: `node tests/e2e/gmp-document-upload.mjs`  
Run: `node tests/e2e/gmp-evidence-approval.mjs`  
Run: `npm run a11y`  
Expected: tất cả PASS.

- [ ] **Step 3: Ghi receipt và commit**

```powershell
git add src/pages/AuditLogPage.tsx docs/receipts/2026-09-01-gmp-evidence.md docs/handoffs/2026-09-01-ban-giao-codex.md
git commit -m "docs: seal gmp evidence gate"
```


# Workload Owner Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép Admin/Quản lý QA chuyển người phụ trách của một hạng mục từ màn Khối lượng trong khi Dữ liệu nguồn vẫn là gốc.

**Architecture:** Tách kiểm tra form và dựng payload thành model thuần để kiểm thử trực tiếp. Dialog dùng danh bạ đang hoạt động và RPC `setItemPerformerById`; Workload chỉ điều phối mở dialog và tải lại dữ liệu.

**Tech Stack:** React 18, TypeScript, Vite SSR test, Node test runner, Puppeteer mock Supabase.

## Global Constraints

- Chỉ `admin` và `qa_manager` thấy hành động chuyển người.
- Ghi bằng UUID qua `rpc_set_item_performer_by_id`; không ghi trực tiếp bảng hạng mục.
- Bắt buộc lý do; không cho chọn lại người hiện tại.
- Dùng `ViewportDialog`, phần tử form có label và phản hồi lỗi có `role="alert"`.
- Không migration, push hoặc deploy trong kế hoạch này.

---

### Task 1: Model quyền và payload chuyển người

**Files:**
- Create: `src/features/workload/workloadOwnerTransferModel.ts`
- Create: `tests/unit/workload-owner-transfer-model.test.mjs`

**Interfaces:**
- Produces: `canTransferWorkloadOwner(role)`, `prepareWorkloadOwnerTransfer(input)` và `WorkloadOwnerTransferInput`.

- [ ] **Step 1: Viết test đỏ cho ma trận quyền và validation**

```js
assert.equal(canTransferWorkloadOwner("admin"), true);
assert.equal(canTransferWorkloadOwner("qa_manager"), true);
assert.equal(canTransferWorkloadOwner("qa_staff"), false);
assert.deepEqual(prepareWorkloadOwnerTransfer({
  validationCode: " PQ-01 ", currentPersonId: "old", nextPersonId: "new",
  currentName: "QA cũ", nextName: "QA mới", reason: "  Điều phối   tải  ",
}), {
  ok: true,
  input: { validationCode: "PQ-01", personId: "new", reason: "Điều phối tải" },
  confirmation: "PQ-01: QA cũ → QA mới. Lý do: Điều phối tải",
});
```

- [ ] **Step 2: Chạy test và xác nhận đỏ vì module chưa tồn tại**

Run: `node --import tsx --test tests/unit/workload-owner-transfer-model.test.mjs`
Expected: FAIL với lỗi không tìm thấy `workloadOwnerTransferModel.ts`.

- [ ] **Step 3: Cài model tối thiểu**

```ts
export function canTransferWorkloadOwner(role: BusinessRole | null): boolean {
  return role === "admin" || role === "qa_manager";
}

export function prepareWorkloadOwnerTransfer(input: WorkloadOwnerTransferInput): PrepareResult {
  const validationCode = input.validationCode.trim();
  const reason = input.reason.trim().replace(/\s+/g, " ");
  if (!input.nextPersonId) return { ok: false, error: "Chọn người phụ trách mới." };
  if (input.nextPersonId === input.currentPersonId) return { ok: false, error: "Người được chọn đang là người phụ trách." };
  if (!reason) return { ok: false, error: "Nhập lý do chuyển phụ trách." };
  return {
    ok: true,
    input: { validationCode, personId: input.nextPersonId, reason },
    confirmation: `${validationCode}: ${input.currentName || "Chưa phân công"} → ${input.nextName}. Lý do: ${reason}`,
  };
}
```

- [ ] **Step 4: Chạy test model và xác nhận xanh**

Run: `node --import tsx --test tests/unit/workload-owner-transfer-model.test.mjs`
Expected: PASS toàn bộ trường hợp quyền, thiếu người, trùng người, thiếu lý do và payload hợp lệ.

- [ ] **Step 5: Commit lát model**

```powershell
git add src/features/workload/workloadOwnerTransferModel.ts tests/unit/workload-owner-transfer-model.test.mjs
git commit -m "feat: them model chuyen nguoi workload"
```

### Task 2: Dialog chuyển người truy cập được

**Files:**
- Create: `src/features/workload/WorkloadOwnerTransferDialog.tsx`
- Modify: `tests/unit/non-timeline-dialogs.test.mjs`

**Interfaces:**
- Consumes: `prepareWorkloadOwnerTransfer`, `usePerformers`, `setItemPerformerById`, `useToast`, `useXacNhan`.
- Produces: `WorkloadOwnerTransferDialog({ activity, onClose, onReload })`.

- [ ] **Step 1: Viết test SSR đỏ cho nhãn và trạng thái form**

```js
const html = renderToStaticMarkup(React.createElement(WorkloadOwnerTransferDialog, {
  activity, performers: [activePerformer], onClose() {}, onReload() {},
}));
assert.match(html, /Chuyển phụ trách/);
assert.match(html, /<label[^>]*for="workload-owner-next"/);
assert.match(html, /<label[^>]*for="workload-owner-reason"/);
assert.match(html, /data-workload-owner-submit/);
```

- [ ] **Step 2: Chạy test và xác nhận đỏ vì dialog chưa tồn tại**

Run: `node --import tsx --test tests/unit/non-timeline-dialogs.test.mjs`
Expected: FAIL tại import/export `WorkloadOwnerTransferDialog`.

- [ ] **Step 3: Cài dialog tối thiểu**

```tsx
<ViewportDialog open title="Chuyển phụ trách" dismissDisabled={saving} onRequestClose={() => !saving && onClose()} footer={footer}>
  <p>{activity.code} · hiện tại: <b>{activity.owner || "Chưa phân công"}</b></p>
  <label htmlFor="workload-owner-next">Người phụ trách mới</label>
  <select id="workload-owner-next" data-dialog-focus disabled={saving} value={nextPersonId} onChange={onSelect}>...</select>
  <label htmlFor="workload-owner-reason">Lý do</label>
  <textarea id="workload-owner-reason" disabled={saving} value={reason} onChange={onReason} />
  {error && <p role="alert">{error}</p>}
  {hopXacNhan}
</ViewportDialog>
```

Trong `submit`, gọi `prepareWorkloadOwnerTransfer`, hỏi xác nhận bằng `xacNhan`, sau đó gọi:

```ts
await setItemPerformerById(prepared.input.validationCode, prepared.input.personId, prepared.input.reason);
toast.thanhCong(`Đã chuyển ${prepared.input.validationCode} sang ${selected.fullName}.`);
onReload();
onClose();
```

- [ ] **Step 4: Chạy test dialog và model**

Run: `node --import tsx --test tests/unit/workload-owner-transfer-model.test.mjs tests/unit/non-timeline-dialogs.test.mjs`
Expected: PASS; markup có dialog dùng chung, label liên kết đúng và action rõ tên.

- [ ] **Step 5: Commit dialog**

```powershell
git add src/features/workload/WorkloadOwnerTransferDialog.tsx tests/unit/non-timeline-dialogs.test.mjs
git commit -m "feat: them hop chuyen nguoi workload"
```

### Task 3: Tích hợp Workload và chứng minh luồng quyền

**Files:**
- Modify: `src/pages/WorkloadPage.tsx`
- Modify: `src/App.tsx`
- Create: `tests/e2e/workload-owner-transfer.mjs`
- Modify: `docs/handoffs/2026-09-01-ban-giao-codex.md`

**Interfaces:**
- Consumes: `canTransferWorkloadOwner`, `WorkloadOwnerTransferDialog`, `businessRole`, `onReload`.
- Produces: nút `data-workload-owner-transfer` chỉ cho manager và luồng RPC từ màn Workload.

- [ ] **Step 1: Viết E2E đỏ cho Admin và QA staff**

```js
await admin.goto(`${APP_URL}#v=workload`);
await admin.click("[data-workload-detail-trigger]");
await admin.click("[data-workload-owner-transfer]");
await admin.select("#workload-owner-next", PERSON_NEW);
await admin.type("#workload-owner-reason", "Điều phối tải tháng 9");
await admin.click("[data-workload-owner-submit]");
await admin.click("[data-confirm-submit]");
assert.deepEqual(lastRpc("rpc_set_item_performer_by_id").body, {
  p_validation_code: CODE, p_person_id: PERSON_NEW, p_reason: "Điều phối tải tháng 9",
});
assert.equal(await staff.$("[data-workload-owner-transfer]"), null);
```

- [ ] **Step 2: Chạy E2E và xác nhận đỏ vì chưa có trigger**

Run: `node tests/e2e/workload-owner-transfer.mjs`
Expected: FAIL khi không tìm thấy `[data-workload-owner-transfer]`.

- [ ] **Step 3: Nối props và hành động vào Workload**

```tsx
<WorkloadView acts={filteredActs} businessRole={access.businessRole} onReload={reloadData} />
```

`WorkloadDetailModal` nhận `canTransfer` và `onTransfer`; mỗi dòng thêm button semantic. `WorkloadView` giữ `transferActivity`, đóng modal chi tiết trước khi mở dialog và render:

```tsx
{transferActivity && (
  <WorkloadOwnerTransferDialog activity={transferActivity} onClose={() => setTransferActivity(null)} onReload={onReload} />
)}
```

- [ ] **Step 4: Chạy gate mục tiêu**

Run: `node tests/e2e/workload-owner-transfer.mjs`
Expected: PASS cho payload Admin, reload sau thành công và không có action với QA staff.

Run: `node --import tsx --test tests/unit/workload-owner-transfer-model.test.mjs tests/unit/non-timeline-dialogs.test.mjs`
Expected: PASS.

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Cập nhật bàn giao và commit**

Ghi trạng thái local, test đã chạy, không migration mới và chưa push/deploy vào file bàn giao.

```powershell
git add src/pages/WorkloadPage.tsx src/App.tsx tests/e2e/workload-owner-transfer.mjs docs/handoffs/2026-09-01-ban-giao-codex.md
git commit -m "feat: chuyen nguoi phu trach tu workload"
```

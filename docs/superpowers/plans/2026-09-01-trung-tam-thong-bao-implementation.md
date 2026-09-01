# Trung tâm thông báo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cung cấp inbox trong ứng dụng có unread/read/deep link, sinh thông báo idempotent từ các sự kiện canonical và không làm lộ dữ liệu ngoài phạm vi.

**Architecture:** Mở rộng `vmp_notifications` từ hàng đợi email thành delivery record theo `recipient_user_id`, vẫn giữ channel/retry hiện có. Producer server tạo event key ổn định từ tái thẩm định, phê duyệt và báo cáo; UI đọc keyset pagination và chỉ điều hướng qua deep-link allowlist.

**Tech Stack:** PostgreSQL 17, Supabase RPC/RLS, React 18, TypeScript, Lucide, Node tests, E2E mock.

## Global Constraints

- Thông báo không phải nguồn sự thật; mỗi dòng phải dẫn về hạng mục/snapshot canonical.
- User chỉ đọc và đánh dấu thông báo của chính mình.
- Client không được tự chỉ định recipient, event key hoặc deep link khi sinh event.
- Producer chạy lặp không tạo trùng; lỗi gửi email không làm mất inbox.
- Không hiển thị nội dung hồ sơ GMP hoặc dữ liệu nhạy cảm trong preview.

---

### Task 1: Contract notification fail-closed

**Files:**
- Create: `src/features/notifications/contracts.ts`
- Create: `src/features/notifications/notificationModel.ts`
- Create: `src/features/notifications/api.ts`
- Test: `tests/unit/notification-model.test.mjs`

**Interfaces:**

```ts
export type AppNotificationType =
  | "revalidation_due_soon"
  | "revalidation_overdue"
  | "revalidation_needs_qa"
  | "qa_approval_required"
  | "qa_approval_invalidated"
  | "report_snapshot_approved";

export interface AppNotification {
  id: string;
  type: AppNotificationType;
  subject: string;
  bodyPreview: string;
  deepLink: string;
  createdAt: string;
  readAt: string | null;
  planItemId: string | null;
}

export interface NotificationPage {
  rows: AppNotification[];
  unreadCount: number;
  nextCursor: { createdAt: string; id: string } | null;
}

export async function fetchMyNotifications(input: {
  cursor?: NotificationPage["nextCursor"];
  limit?: number;
  unreadOnly?: boolean;
}): Promise<NotificationPage>;

export async function markNotificationRead(id: string, read: boolean): Promise<number>;
export async function markAllNotificationsRead(): Promise<number>;
```

- [ ] **Step 1: Viết unit tests**

Decoder exact keys/UUID/ISO/enum; limit 1..50; cursor gồm đủ date+id. Deep link
chỉ nhận `#v=progress&item=...`, `#v=reports&snapshot=...` và
`#v=catalog&revalidation=...`; URL tuyệt đối, `javascript:` và route lạ bị từ
chối. Preview tối đa 240 ký tự.

- [ ] **Step 2: Chạy test và xác nhận FAIL**

Run: `node --import tsx --test tests/unit/notification-model.test.mjs`  
Expected: FAIL vì module chưa tồn tại.

- [ ] **Step 3: Cài decoder/API/model**

API gọi `rpc_my_notifications`, `rpc_mark_notification_read`,
`rpc_mark_all_notifications_read`. Model nhóm theo Hôm nay/Cũ hơn, format giờ
Bangkok và trả navigation target đã allowlist, không gọi `window.location` trong
model.

- [ ] **Step 4: Chạy test và xác nhận PASS**

Run: `node --import tsx --test tests/unit/notification-model.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit task**

```powershell
git add src/features/notifications tests/unit/notification-model.test.mjs
git commit -m "test: define app notification contract"
```

### Task 2: Schema inbox và RLS theo user

**Files:**
- Create: `supabase/migrations/20260901160000_notification_inbox.sql`
- Create: `tests/sql/notification-inbox.sql`
- Create: `tests/sql/notification-inbox-security.sql`
- Create: `docs/runbooks/notification-inbox.md`

**Interfaces:**
- Extends: `vmp_notifications` với recipient/read/deep-link fields.
- Produces: `rpc_my_notifications(jsonb,integer,boolean) returns jsonb`.
- Produces: `rpc_mark_notification_read(uuid,boolean) returns jsonb`.
- Produces: `rpc_mark_all_notifications_read() returns jsonb`.

- [ ] **Step 1: Viết SQL behavior/security tests**

Hai user có notifications riêng; cursor không trùng; unread count đúng sau
mark/unmark/all; user A không đọc/đổi row B; inactive/unknown fail; direct
INSERT/UPDATE/DELETE bị revoke; deep link/type ngoài allowlist bị constraint.

- [ ] **Step 2: Chạy tests trước migration**

Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f tests/sql/notification-inbox.sql`  
Expected: FAIL.

- [ ] **Step 3: Viết migration tương thích hàng đợi cũ**

Thêm nullable `recipient_user_id`, `event_key`, `deep_link`, `payload`,
`delivered_at`, `read_at`, `dismissed_at`; giữ row email cũ hợp lệ. Unique partial
index `(recipient_user_id,event_key) where recipient_user_id is not null`. RPC
list chỉ row `auth.uid()`, order `created_at desc,id desc`, limit tối đa 50 và
trả unread count cùng transaction snapshot.

- [ ] **Step 4: Apply staging và chạy tests**

Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f supabase/migrations/20260901160000_notification_inbox.sql`  
Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f tests/sql/notification-inbox.sql`  
Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f tests/sql/notification-inbox-security.sql`  
Expected: PASS.

- [ ] **Step 5: Commit task**

```powershell
git add supabase/migrations/20260901160000_notification_inbox.sql tests/sql/notification-inbox.sql tests/sql/notification-inbox-security.sql docs/runbooks/notification-inbox.md
git commit -m "feat: add user notification inbox"
```

### Task 3: Producer idempotent từ sự kiện canonical

**Files:**
- Create: `supabase/migrations/20260901170000_notification_producers.sql`
- Create: `tests/sql/notification-producers.sql`
- Create: `tests/sql/notification-producers-security.sql`
- Create: `docs/runbooks/notification-producers.md`

**Interfaces:**
- Produces: `rpc_generate_vmp_notifications(p_as_of date) returns jsonb`.
- Consumes: revalidation proposals, approval events, report snapshots và account/person linkage hiện hành.

- [ ] **Step 1: Viết producer tests**

Ca bắt buộc: revalidation 90/30/7 ngày, overdue theo bucket 7 ngày, proposal cần
QA, approval invalidated và snapshot approved. Chạy hai lần cùng ngày không tạo
trùng; owner chưa liên kết account tạo data-quality issue, không đoán email;
recipient ngoài scope không nhận; inactive account không nhận.

- [ ] **Step 2: Chạy tests và xác nhận FAIL**

Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f tests/sql/notification-producers.sql`  
Expected: FAIL.

- [ ] **Step 3: Viết producer server-side**

Event key dạng `<type>:<subject_uuid>:<bucket>`; subject/body/deep link do server
dựng từ template cố định. QA-required gửi QA Manager active; item notification
gửi account liên kết owner/support đúng scope. Insert `on conflict do nothing`,
trả count created/unchanged/unresolved; chỉ Admin/QA Manager hoặc service path
hẹp được gọi.

- [ ] **Step 4: Apply staging và chạy tests**

Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f supabase/migrations/20260901170000_notification_producers.sql`  
Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f tests/sql/notification-producers.sql`  
Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f tests/sql/notification-producers-security.sql`  
Expected: PASS.

- [ ] **Step 5: Commit task**

```powershell
git add supabase/migrations/20260901170000_notification_producers.sql tests/sql/notification-producers.sql tests/sql/notification-producers-security.sql docs/runbooks/notification-producers.md
git commit -m "feat: add canonical notification producers"
```

### Task 4: Notification Center thật trên Topbar

**Files:**
- Create: `src/features/notifications/NotificationCenter.tsx`
- Create: `src/features/notifications/NotificationRow.tsx`
- Modify: `src/components/layout/Layout.tsx`
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Test: `tests/e2e/notification-center.mjs`
- Modify: `tests/e2e/cham-giao-dien.mjs`

**Interfaces:**
- Consumes: API/model Task 1.
- Produces: bell, badge, popover inbox và navigation callback.

- [ ] **Step 1: Viết E2E đỏ**

Bell có accessible name/count; mở bằng Enter; focus vào panel; 20 dòng đầu;
mark read giảm badge; mark all về 0; tải thêm dùng cursor; click deep link đóng
panel và mở đúng item; lỗi API có Retry; persona khác không thấy row.

- [ ] **Step 2: Chạy E2E và xác nhận FAIL**

Run: `node tests/e2e/notification-center.mjs`  
Expected: FAIL vì bell chưa tồn tại.

- [ ] **Step 3: Xây component desktop**

Topbar thêm button `Thông báo`, badge chỉ hiện khi >0. Panel rộng 380px, danh sách
gọn gồm icon/subject/preview/time/dot unread; action `Đánh dấu tất cả`; loading
skeleton, empty state `Không có việc mới`, error + Retry. Poll count theo
watermark/reconnect, không poll payload liên tục. Escape đóng và trả focus bell.

- [ ] **Step 4: Thay test nút chết cũ**

Trong `cham-giao-dien.mjs`, bỏ assertion cấm button title Thông báo; thay bằng
kiểm bell có handler, mở được panel và không có control disabled vô lý.

- [ ] **Step 5: Chạy E2E/a11y/typecheck**

Run: `node tests/e2e/notification-center.mjs`  
Run: `node tests/e2e/cham-giao-dien.mjs`  
Run: `npm run a11y`  
Run: `npm run typecheck`  
Expected: PASS.

- [ ] **Step 6: Commit task**

```powershell
git add src/features/notifications src/components/layout/Layout.tsx src/App.tsx src/index.css tests/e2e/notification-center.mjs tests/e2e/cham-giao-dien.mjs
git commit -m "feat: add notification center"
```

### Task 5: Lịch chạy và email delivery

**Files:**
- Create: `scripts/check-notification-scheduler.mjs`
- Create: `tests/ops/notification-scheduler-contract.test.mjs`
- Create: `docs/runbooks/notification-scheduler.md`

**Interfaces:**
- Consumes: n8n workflow đúng prefix dự án và RPC producer Task 3.
- Produces: daily job receipt và probes retry/idempotency.

- [ ] **Step 1: Viết scheduler contract mock**

Harness kiểm workflow chỉ gọi producer với `as_of` server/default, không gửi
recipient/deep link tùy ý; retry cùng run không nhân đôi event; email failure cập
nhật retry/error nhưng dashboard row vẫn tồn tại.

- [ ] **Step 2: Chạy mock test**

Run: `node --test tests/ops/notification-scheduler-contract.test.mjs`  
Expected: PASS sau khi harness được cài.

- [ ] **Step 3: Viết runbook remote**

Chỉ workflow tên bắt đầu `VMP`; chạy mỗi ngày sau 00:15 Bangkok; credential nằm
trong n8n store; JWT/service path theo runbook bảo mật. Trước activate chạy hai
lần staging cùng ngày và xác nhận created lần hai bằng 0.

- [ ] **Step 4: Kiểm staging scheduler**

Run: `node scripts/check-notification-scheduler.mjs --staging`  
Expected: valid JWT 2xx, invalid JWT 401/403, second run `created=0`.

- [ ] **Step 5: Commit task**

```powershell
git add scripts/check-notification-scheduler.mjs tests/ops/notification-scheduler-contract.test.mjs docs/runbooks/notification-scheduler.md
git commit -m "ops: define notification scheduler gate"
```

### Task 6: Gate thông báo

**Files:**
- Create: `docs/receipts/2026-09-01-notification-center.md`
- Modify: `docs/handoffs/2026-09-01-ban-giao-codex.md`

- [ ] **Step 1: Chạy targeted gates**

Run: `node --import tsx --test tests/unit/notification-model.test.mjs`  
Run: `node tests/e2e/notification-center.mjs`  
Run: `node tests/e2e/cham-giao-dien.mjs`  
Run: `npm run typecheck`  
Run: `npm run build`  
Run: `npm run a11y`  
Expected: tất cả PASS.

- [ ] **Step 2: Chạy staging persona/idempotency**

User A/B chỉ thấy row mình; inactive fail; producer hai lần không trùng; deep
link mở đúng hạng mục/snapshot; lỗi email không làm mất inbox.

- [ ] **Step 3: Ghi receipt và commit**

```powershell
git add docs/receipts/2026-09-01-notification-center.md docs/handoffs/2026-09-01-ban-giao-codex.md
git commit -m "docs: seal notification center gate"
```


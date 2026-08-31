# Wave 2 — Hành động tin cậy và desktop gọn đẹp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Làm mọi hành động chính bấm/lưu được hoặc giải thích chính xác vì sao chưa thể, đồng thời sửa Tổng quan theo người, deep-link tab, múi giờ Bangkok và tải 3D dư thừa.

**Architecture:** Giữ nguyên các API/RPC và capability server. Mỗi feature tự xác định lỗi trường và focus, còn trạng thái tab/thời gian dùng helper thuần có unit test để các màn dùng chung một hợp đồng.

**Tech Stack:** React 19, TypeScript, Vite, Node test runner, Puppeteer E2E, CSS token Lotus.

## Global Constraints

- Dữ liệu nguồn là gốc cho nhân sự, phạm vi và phân công.
- Không suy quyền ở client và không đổi ma trận quyền server.
- Không chạy migration production, không ghi dữ liệu thật và không push/deploy trong plan này.
- TDD bắt buộc: mỗi thay đổi hành vi phải có test RED trước code production.
- Chỉ chạy gate rộng khi thay đổi boundary dùng chung yêu cầu.

---

### Task 1: Hợp đồng nút lưu có thể giải thích

**Files:**
- Create: `src/components/ui/actionReadiness.ts`
- Test: `tests/unit/action-readiness.test.mjs`

**Interfaces:**
- Produces: `firstActionBlock(reasons): ActionBlock | null` và `actionDescriptionId(scope): string`.

- [ ] Viết unit test với literal cho thứ tự quyền → request → trường bắt buộc → không đổi.
- [ ] Chạy test và xác nhận RED vì module chưa tồn tại.
- [ ] Cài helper thuần, không chứa state React.
- [ ] Chạy test GREEN và typecheck mục tiêu.

### Task 2: Vai trò, trạng thái và liên kết tài khoản không còn nút im lặng

**Files:**
- Modify: `src/features/accountAdministration/AccountRoleEditor.tsx`
- Modify: `src/features/accountAdministration/AccountAdministrationPanel.tsx`
- Modify: `src/features/itemPermissions/AccountLinkPanel.tsx`
- Test: `tests/unit/account-role-editor.test.mjs`
- Test: `tests/unit/account-administration-panel.test.mjs`
- Test: `tests/unit/item-permission-contracts.test.mjs`
- Test: `tests/e2e/quyen-admin.mjs`

**Interfaces:**
- Consumes: `firstActionBlock` từ Task 1.
- Produces: submit validation focus, live status và draft-preserving error.

- [ ] Viết test RED: nút chính không disabled vì thiếu lý do/lựa chọn; có mô tả và lỗi liên kết trường.
- [ ] Sửa tối thiểu ba editor để validate khi click, focus lỗi đầu và giữ khóa request.
- [ ] Chạy unit mục tiêu GREEN.
- [ ] Chạy `node tests/e2e/quyen-admin.mjs` và xác nhận payload UUID vẫn đúng.

### Task 3: Phân công, phạm vi xưởng và deadline có phản hồi sửa được

**Files:**
- Modify: `src/features/itemPermissions/AssignmentPanel.tsx`
- Modify: `src/features/sourceAccess/WorkshopScopeCoveragePanel.tsx`
- Modify: `src/features/timeline/PlannedDeadlineDialog.tsx`
- Test: `tests/unit/item-permission-contracts.test.mjs`
- Test: `tests/unit/workshop-scope-panel.test.mjs`
- Test: `tests/unit/planned-deadline-dialog.test.mjs`
- Test: `tests/e2e/source-qa-workshop-access.mjs`
- Test: `tests/e2e/timeline-deadline-edit.mjs`

**Interfaces:**
- Consumes: helper readiness; giữ nguyên payload RPC hiện có.

- [ ] Viết test RED cho click submit thiếu dữ liệu và liên kết lỗi/focus.
- [ ] Cài validation theo feature, không nới quyền và không gửi request khi lỗi.
- [ ] Chạy unit GREEN.
- [ ] Chạy hai E2E mục tiêu và xác nhận success/error/draft đều đúng.

### Task 4: Tổng quan theo người khớp UI hiện hành

**Files:**
- Modify: `tests/e2e/today-personal-scope.mjs`
- Modify production only if the current hero exposes a wrong denominator.

**Interfaces:**
- Consumes: `overviewActs` canonical-person từ `src/App.tsx`.

- [ ] Đổi assertion từ tile đã bị thiết kế bỏ sang chỉ số hero hiện hành.
- [ ] Chạy test; nếu vẫn fail, trace `overviewActs` và sửa nguồn sai bằng TDD.
- [ ] Xác nhận QA Manager và Admin đều thấy `0/2`, không gọi aggregate RPC.

### Task 5: Tab quản trị đồng bộ hash và lịch sử trình duyệt

**Files:**
- Modify: `src/lib/urlState.ts`
- Modify: `src/components/ui/NhomTab.tsx`
- Test: `tests/unit/url-state.test.mjs`
- Test: `tests/unit/nhom-tab.test.mjs`
- Test: `tests/e2e/luong-gia-lap.mjs`

**Interfaces:**
- Produces: hash key `tab` hợp lệ theo màn đang mở; giá trị lạ rơi về mặc định.

- [ ] Viết unit RED cho đọc/ghi hash giữ nguyên các filter khác.
- [ ] Cài helper cập nhật một key hash và listener `hashchange`.
- [ ] Bổ sung Home/End cho tab keyboard.
- [ ] Chạy unit và E2E deep-link GREEN.

### Task 6: Formatter Bangkok dùng chung

**Files:**
- Create: `src/lib/formatBangkok.ts`
- Modify: các vị trí hiển thị timestamp được liệt kê bởi `rg 'toLocale(String|DateString)' src`.
- Test: `tests/unit/format-bangkok.test.mjs`

**Interfaces:**
- Produces: `formatBangkokDateTime`, `formatBangkokDate` dùng `Intl.DateTimeFormat` với `timeZone: "Asia/Bangkok"`.

- [ ] Viết unit RED bằng thời điểm sát ranh ngày UTC.
- [ ] Cài formatter và thay các timestamp, không thay số đếm `Intl.NumberFormat`.
- [ ] Chạy unit GREEN và typecheck.

### Task 7: Xóa runtime 3D đã bỏ

**Files:**
- Delete only after reference scan: `src/components/three/WorkloadSpace3D.tsx`, `WebGLContextGuard.tsx`, `NhanTruc.tsx`, `KhungVua.tsx`, `ThreeFallbackBoundary.tsx` và helper 3D không còn consumer.
- Modify: `package.json`, `package-lock.json`, test 3D cũ và comment runtime liên quan.
- Test: `tests/unit/desktop-performance-budget.test.mjs`
- Test: `tests/e2e/luong-gia-lap.mjs`

**Interfaces:**
- Produces: không còn `three`, `@react-three/*`, `@types/three` trong dependency/runtime.

- [ ] Chạy reference scan và test RED yêu cầu dependency 3D vắng mặt.
- [ ] Gỡ dependency bằng npm, xóa đúng file mã chết đã xác minh.
- [ ] Chạy typecheck, build, budget và E2E không-canvas GREEN.

### Task 8: Gate phát hành local

**Files:**
- Modify only tests/docs if evidence requires.

- [ ] Chạy unit mục tiêu và bộ unit Windows đúng hướng dẫn bàn giao.
- [ ] Build với `VITE_MANUAL_PLANNED_DEADLINES_ENABLED=true`.
- [ ] Chạy targeted E2E của Tasks 2–5, `npm.cmd run shell`, a11y và budget.
- [ ] Quét secret, `git diff --check`, báo file/lệnh/kết quả/rủi ro.
- [ ] Không push/deploy; chờ lệnh riêng của chủ dự án.

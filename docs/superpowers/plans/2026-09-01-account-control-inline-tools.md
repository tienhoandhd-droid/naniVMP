# Account Control Inline Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bỏ tab `Liên kết & quyền` và đưa các thao tác cần thiết vào Bảng kiểm soát.

**Architecture:** `CurrentPermissionWorkspace` giữ trạng thái công cụ đang mở. `AccountAdministrationPanel` phát callback từ nút chung `Liên kết tài khoản` và nút theo dòng `Xem quyền`; các panel nghiệp vụ hiện có được tái sử dụng trong cùng Card.

**Tech Stack:** React 19, TypeScript, Node test runner, Puppeteer.

## Global Constraints

- Dữ liệu nguồn là nguồn gốc phân công và phạm vi.
- Không thay đổi luật quyền hoặc RPC.
- Dùng button thật, `aria-expanded` và `aria-controls` cho vùng đóng/mở.

---

### Task 1: Khóa hợp đồng UI mới

**Files:**
- Modify: `tests/unit/account-administration-panel.test.mjs`
- Modify: `tests/unit/account-administration-integration.test.mjs`
- Modify: `tests/e2e/phan-quyen-control-tables.mjs`

- [x] Viết test yêu cầu hai thao tác xuất hiện trong bảng và tab cũ biến mất.
- [x] Chạy unit test và xác nhận thất bại vì UI chưa đổi.

### Task 2: Đưa công cụ vào Bảng kiểm soát

**Files:**
- Modify: `src/features/accountAdministration/AccountAdministrationPanel.tsx`
- Modify: `src/pages/PhanQuyenPage.tsx`
- Modify: `src/styles/catalog-workspace.css`

- [x] Thêm callback mở liên kết và xem quyền vào bảng.
- [x] Dùng một vùng nội dung chung để dựng lại các panel hiện có.
- [x] Xóa tab và panel `chi-tiet`.
- [x] Chạy lại unit test đến khi đạt.

### Task 3: Xác minh luồng người dùng

**Files:**
- Test: `tests/e2e/phan-quyen-control-tables.mjs`

- [x] Chạy E2E mục tiêu, typecheck và build.
- [x] Kiểm tra diff chỉ nằm trong phạm vi đã duyệt.

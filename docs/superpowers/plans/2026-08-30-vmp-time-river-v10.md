# VMP Time River V10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tạo bản thử Trường Hà V10 tối giản, dễ đọc sáu màu tiến độ VMP và không còn sen vô lý trong lòng sông.

**Architecture:** Giữ bản thử độc lập trong visual companion, không sửa production. Một ảnh nền lam–xám được tạo bằng công cụ vẽ; HTML V10 dùng SVG cá tối giản để đổi màu theo dữ liệu.

**Tech Stack:** HTML, CSS, JavaScript, SVG, built-in image generation, PowerShell verification.

## Global Constraints

- Không sửa mã production hoặc dữ liệu GMP.
- Không mở thêm tab Chrome; dùng lại tab visual companion hiện tại.
- Giữ 48 cá minh họa, sáu màu trạng thái và vị trí ngang theo ngày hạn VMP.
- Không đặt sen hoặc họa tiết trang trí trong lòng sông.
- Cá chỉ gồm thân giọt nước, đuôi cong và viền ngà; không vảy, không vây phụ, không hoạt ảnh đuôi.

---

### Task 1: Nền sông lam–xám

**Files:**
- Create: `.superpowers/brainstorm/94910-1788102465/content/mac-ngoc-river-neutral-v10.png`

**Interfaces:**
- Consumes: `.superpowers/brainstorm/94910-1788102465/content/mac-ngoc-river-level-v5.png`
- Produces: ảnh nền không sen dùng tại `/files/mac-ngoc-river-neutral-v10.png`

- [x] **Step 1:** Dùng built-in image generation chỉnh V5 sang lam–xám, giảm bão hòa nước và giữ nguyên góc nhìn.
- [x] **Step 2:** Kiểm tra ảnh không có sen, cá, người, chữ hoặc họa tiết mới.
- [x] **Step 3:** Sao chép ảnh được chọn vào visual companion bằng tên phiên bản V10.

### Task 2: Cá tối giản và bố cục V10

**Files:**
- Create: `.superpowers/brainstorm/94910-1788102465/content/vmp-truong-ha-minimal-fish-v10.html`

**Interfaces:**
- Consumes: `/files/mac-ngoc-river-neutral-v10.png`, dữ liệu minh họa `[offset, depth, progressState, isOverdue]`
- Produces: `fishSvg()` gồm đúng thân, đuôi, mắt; các lớp `.fish.state-0` đến `.fish.state-5`

- [x] **Step 1:** Tạo V10 từ V9 nhưng thay nền, tiêu đề và mô tả theo thiết kế đã duyệt.
- [x] **Step 2:** Thay SVG cá bằng thân giọt nước, đuôi cong, mắt nhỏ; xóa vảy, vây phụ và `tail-drift`.
- [x] **Step 3:** Dùng màu đặc và viền ngà 1.4 px để sáu trạng thái đọc rõ trên nền.
- [x] **Step 4:** Giữ quy tắc quá hạn ưu tiên đỏ son và bảng chi tiết vẫn chỉ ra giai đoạn đang kẹt.

### Task 3: Xác minh bản thử

**Files:**
- Test: `.superpowers/brainstorm/94910-1788102465/content/vmp-truong-ha-minimal-fish-v10.html`

**Interfaces:**
- Consumes: HTML và PNG V10
- Produces: bằng chứng cú pháp, yêu cầu thị giác, HTTP và trạng thái Chrome

- [x] **Step 1:** Dùng Node `new Function()` kiểm tra JavaScript trong HTML.
- [x] **Step 2:** Dùng PowerShell xác nhận sáu lớp màu, 48 dòng cá, không có `fish-fin`, không có `tail-drift`, có nền V10 và công thức vị trí deadline.
- [x] **Step 3:** Tạo WebRequestSession từ URL có khóa; xác nhận HTML và PNG trả HTTP 200.
- [x] **Step 4:** Xác nhận đúng tab Chrome V10 tồn tại và `Responding = true`.

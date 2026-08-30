# VMP Time River V11 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng bản thử Trường Hà V11 có dòng nước và cá cùng chuyển động trái sang phải, để cá biểu đạt hành trình VMP thay vì bơi ngang cắt qua sông.

**Architecture:** Tạo hai tài sản bằng built-in image generation: nền trường quyển ngang và tờ mẫu ba dáng cá. Nền được dùng trực tiếp; mẫu cá chỉ làm tham chiếu để dựng ba SVG có thể tô chính xác sáu màu trạng thái.

**Tech Stack:** HTML, CSS, JavaScript, SVG, built-in image generation, PowerShell, Node.js.

## Global Constraints

- Không sửa production hoặc dữ liệu GMP.
- Không mở thêm tab Chrome; dùng visual companion hiện tại.
- Giữ cửa sổ 01/07–30/09/2026, 48 cá minh họa và tọa độ ngang theo ngày hạn VMP.
- Dòng nước, dải sóng và toàn bộ cá cùng hướng trái sang phải.
- Nền không có cá, sen, người, thuyền, nhà, chữ hoặc điểm tụ phối cảnh ở giữa.
- Cá có ba dáng đuôi, cùng nhìn ngang; không dùng vảy dày hoặc chi tiết giải phẫu.
- Quá hạn VMP ưu tiên màu đỏ son; khi chọn vẫn hiển thị giai đoạn đang kẹt.

---

### Task 1: Tạo nền trường quyển ngang

**Files:**
- Create: `.superpowers/brainstorm/94910-1788102465/content/truong-ha-horizontal-river-v11.png`

**Interfaces:**
- Produces: ảnh nền được HTML dùng tại `/files/truong-ha-horizontal-river-v11.png`

- [x] **Step 1:** Dùng built-in image generation với prompt trường quyển siêu rộng, máy nhìn song song bờ, dòng nước trái sang phải, nước chiếm 75–80%, bờ xa ở 20–25% phía trên.
- [x] **Step 2:** Kiểm tra ảnh có dải nước ngang liên tục, không có điểm tụ giữa và không chứa đối tượng bị cấm.
- [x] **Step 3:** Sao chép output được chọn vào visual companion với tên `truong-ha-horizontal-river-v11.png`.

### Task 2: Tạo mẫu ba dáng cá chép

**Files:**
- Create: `.superpowers/brainstorm/94910-1788102465/content/carp-three-poses-v11.png`

**Interfaces:**
- Produces: tờ tham chiếu ba cá chép nhìn ngang, đuôi lên/cân bằng/xuống

- [x] **Step 1:** Dùng built-in image generation tạo ba cá chép xieyi cùng bơi trái sang phải trên nền giấy trắng.
- [x] **Step 2:** Kiểm tra mỗi cá có thân thuôn, đuôi chẻ mềm, một vây gợi nhẹ, một mắt; không có nền sông, chữ hoặc trang trí.
- [x] **Step 3:** Sao chép output được chọn vào visual companion với tên `carp-three-poses-v11.png`.

### Task 3: Dựng bản thử V11

**Files:**
- Create: `.superpowers/brainstorm/94910-1788102465/content/vmp-truong-ha-horizontal-scroll-v11.html`

**Interfaces:**
- Consumes: `/files/truong-ha-horizontal-river-v11.png`, dữ liệu `[offset, depth, progressState, isOverdue]`
- Produces: `fishSvg(pose)` với `pose` bằng `0 | 1 | 2`; lớp `.fish.state-0` đến `.fish.state-5`

- [x] **Step 1:** Tạo V11 từ V10, thay nền, tiêu đề và mô tả để giải thích cá bơi dọc dòng thời gian.
- [x] **Step 2:** Dựng ba SVG từ mẫu: cùng thân và đầu, ba đường đuôi khác nhau; giữ chi tiết ở mức thân, đuôi, một vây, mang và mắt.
- [x] **Step 3:** Xoay cá chếch 5–10 độ theo tầng nước nhưng không đổi hướng trái sang phải.
- [x] **Step 4:** Giữ sáu màu đặc, viền ngà, 48 dòng dữ liệu, quy tắc đỏ quá hạn và tọa độ deadline.
- [x] **Step 5:** Thêm các dải dòng chảy rất mờ song song để hướng nước đọc rõ mà không che cá.

### Task 4: Xác minh V11

**Files:**
- Test: `.superpowers/brainstorm/94910-1788102465/content/vmp-truong-ha-horizontal-scroll-v11.html`

**Interfaces:**
- Consumes: HTML và hai PNG V11
- Produces: bằng chứng tĩnh, cú pháp, HTTP và Chrome

- [x] **Step 1:** Dùng PowerShell xác nhận sáu màu, 48 cá, ba pose, nền V11, công thức deadline và không có cá quay trái.
- [x] **Step 2:** Dùng Node `new Function()` kiểm tra JavaScript trong HTML.
- [x] **Step 3:** Dùng WebRequestSession có khóa xác nhận HTML và hai PNG trả HTTP 200.
- [x] **Step 4:** Xác nhận tab Chrome có tiêu đề V11 và `Responding = true`.

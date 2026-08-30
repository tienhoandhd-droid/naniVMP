# VMP Time River V12 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Làm cá V11 tròn chibi, vẫn nhận dạng rõ là cá và có cảm giác đang bơi dưới nước mà không thay đổi dữ liệu hoặc hướng bơi.

**Architecture:** Chỉnh tờ mẫu cá bằng built-in image generation để khóa tỷ lệ chibi, sau đó dựng V12 bằng SVG dựa trên tỷ lệ đó. SVG hòa màu với nước, có lớp vân nước phủ phía trên và chuyển động đuôi nhẹ; toàn bộ luật VMP được giữ nguyên.

**Tech Stack:** HTML, CSS, JavaScript, SVG, built-in image generation, PowerShell, Node.js.

## Global Constraints

- Không sửa production hoặc dữ liệu GMP.
- Không mở thêm tab Chrome.
- Thân cá bầu gần hình hạt đậu, đầu liền thân; giữ ba dáng đuôi chẻ để nhận dạng rõ là cá.
- Không thêm vảy, hoa văn hoặc hoạt ảnh toàn thân gây rối; chỉ đuôi quẫy và SVG lướt rất nhẹ bên trong nút cá.
- Giữ sáu màu, 48 cá, hướng trái sang phải và tọa độ deadline.
- Bỏ bóng đổ tách cá khỏi nước; lớp vân nước phải nằm phía trên cá.

---

### Task 1: Mẫu cá chibi tròn

**Files:**
- Create: `.superpowers/brainstorm/94910-1788102465/content/carp-three-poses-chibi-v12.png`

**Interfaces:**
- Consumes: `carp-three-poses-v11.png`
- Produces: tờ mẫu ba cá chibi thân bầu, vẫn có đuôi chẻ, vây, mang và mắt

- [x] **Step 1:** Dùng built-in image generation chỉnh mẫu V11 thành cá chibi thân bầu.
- [x] **Step 2:** Kiểm tra ba cá vẫn cùng hướng, giữ ba dáng đuôi và các dấu hiệu nhận dạng cá.
- [x] **Step 3:** Sao chép output vào visual companion bằng tên V12.

### Task 2: SVG cá V12 và xác minh

**Files:**
- Create: `.superpowers/brainstorm/94910-1788102465/content/vmp-truong-ha-plump-carp-v12.html`

**Interfaces:**
- Consumes: HTML V11 và mẫu cá V12
- Produces: `fishSvg(pose)` thân chibi cùng lớp hòa nước và chuyển động bơi nhẹ

- [x] **Step 1:** Tạo V12 từ V11, tăng chiều cao cá nhưng giữ chiều rộng và vị trí deadline.
- [x] **Step 2:** Chỉnh đường thân, đuôi, vây, mang, mắt theo tỷ lệ chibi; thêm đúng một `fish-wash` rất nhẹ.
- [x] **Step 3:** Bỏ bóng đổ, thêm hòa màu và `water-veil` phía trên cá; đuôi quẫy chậm nhưng nút cá không dịch tọa độ.
- [x] **Step 4:** Xác nhận sáu màu, 48 cá, ba pose, hướng bơi, deadline và quy tắc quá hạn không đổi.
- [x] **Step 5:** Kiểm tra JavaScript, HTTP cho HTML/PNG và tab Chrome V12.

# VMP Six-Species Race V15 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện tranh Long Môn V15 bằng sáu loài cá có màu và silhouette khác nhau tương ứng sáu trạng thái VMP.

**Architecture:** ImageGen tạo một bảng sáu loài trên nền chroma-key để khóa hình dáng và màu trạng thái. Sau khi kiểm tra và loại nền, ImageGen dùng tranh nền V14 làm edit target và bảng cá làm reference để tạo một bức tranh đua hoàn chỉnh; showcase Visual Companion được cập nhật sang tài sản V15.

**Tech Stack:** Built-in ImageGen, PNG, `remove_chroma_key.py`, Pillow qua `uv run`, HTML/CSS, Visual Companion.

## Global Constraints

- Không sửa `src/`, dữ liệu hoặc quy tắc nghiệp vụ.
- Không mở thêm tab Chrome.
- Sáu loài phải khác silhouette khi thu nhỏ còn 44–56 px.
- Ánh xạ cố định: cá trê xám, cá lia thia lam, cá chép lục, cá thần tiên tím, cá rồng vàng, cá nóc đỏ.
- Tất cả cùng hướng sang phải, cùng chất liệu màu nước–khoáng sắc và cùng tỷ lệ thị giác.
- Không ghi đè tài sản V14; dùng tên phiên bản V15.

---

### Task 1: Tạo bảng sáu loài cá

**Files:**
- Create: `.superpowers/brainstorm/94910-1788102465/content/long-mon-six-species-chroma-v15.png`
- Create: `.superpowers/brainstorm/94910-1788102465/content/long-mon-six-species-v15.png`

**Interfaces:**
- Consumes: ánh xạ sáu trạng thái trong đặc tả.
- Produces: ảnh tham chiếu RGBA gồm đúng sáu loài.

- [ ] **Step 1: Gọi ImageGen với prompt sáu loài**

```text
Use case: stylized-concept
Asset type: six-species character reference sheet for small timeline markers
Primary request: exactly six clearly different freshwater fish racers swimming powerfully to the right
Subject: gray catfish with long whiskers and low body; indigo betta with flowing fins; jade-green chubby carp with forked tail; smoky-purple angelfish with tall triangular silhouette; ochre-gold arowana with long slender body and upturned mouth; vermilion-red pufferfish with round compact silhouette
Style/medium: unified East Asian mineral-pigment watercolor, refined, slightly playful, strong clean silhouettes
Composition/framing: two rows of three isolated fish, equal visual weight, generous space, no overlap, all heads right
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background
Constraints: exactly six fish; exactly six species; silhouettes readable at icon size; no text; no shadow; no watermark
Avoid: duplicate shapes, extra animals, top-down poses, sticker outlines, oversized eyes
```

- [ ] **Step 2: Kiểm tra trực quan bằng `view_image`**

Xác nhận đúng sáu cá, đúng hướng, hình dáng khác rõ và cùng phong cách. Nếu một loài bị trùng silhouette, lặp lại đúng một lần với yêu cầu sửa riêng loài đó.

- [ ] **Step 3: Sao chép và loại nền**

```powershell
Copy-Item -LiteralPath '<generated-image-path>' -Destination '.superpowers\brainstorm\94910-1788102465\content\long-mon-six-species-chroma-v15.png'
uv run --with pillow python 'C:\Users\ADMIN\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py' --input '.superpowers\brainstorm\94910-1788102465\content\long-mon-six-species-chroma-v15.png' --out '.superpowers\brainstorm\94910-1788102465\content\long-mon-six-species-v15.png' --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill
```

Expected: PNG RGBA, bốn góc alpha bằng `0`, có đúng sáu cụm pixel cá tách biệt.

### Task 2: Hoàn thiện tranh đua V15

**Files:**
- Create: `.superpowers/brainstorm/94910-1788102465/content/long-mon-vmp-final-race-v15.png`

**Interfaces:**
- Consumes: nền `long-mon-vmp-racecourse-v14.png` và bảng `long-mon-six-species-v15.png`.
- Produces: tranh ngang hoàn chỉnh, không chữ, thể hiện cuộc đua sáu trạng thái.

- [ ] **Step 1: Gọi ImageGen ở chế độ compositing**

```text
Use case: compositing
Input images: Image 1 is the base river painting and must retain its framing, rocks, light and palette; Image 2 is the exact six-species fish reference
Primary request: integrate one racer of each referenced species into Image 1 as a coherent six-fish race moving right against the current
Composition: stagger the six fish across foreground, midground and background; golden arowana leads near the luminous right third; red puffer trails visibly; keep the central school readable and preserve negative space
Invariants: retain all six species, their state colors, defining silhouettes and right-facing direction; match underwater lighting and mineral-watercolor texture
Motion: subtle wakes, compressed fins, sparse bubbles and disturbed current behind tails
Constraints: exactly six fish; no text; no labels; no gate; no extra animals; no watermark; no overlap that hides silhouettes
```

- [ ] **Step 2: Kiểm tra tranh bằng `view_image`**

Xác nhận đúng sáu loài, cá không nổi như sticker, thứ tự chiều sâu rõ, điểm sáng phải đóng vai trò đích và cảnh không bị quá tải.

- [ ] **Step 3: Lưu tài sản V15**

Run: `Copy-Item -LiteralPath '<generated-image-path>' -Destination '.superpowers\brainstorm\94910-1788102465\content\long-mon-vmp-final-race-v15.png'`

Expected: ảnh lớn hơn 500 KB, khổ ngang và không thay thế V14.

### Task 3: Cập nhật showcase và xác minh

**Files:**
- Create: `.superpowers/brainstorm/94910-1788102465/content/vmp-long-mon-final-v15.html`

**Interfaces:**
- Consumes: tranh hoàn chỉnh và bảng sáu loài V15.
- Produces: trang trình bày mới nhất trong đúng tab Chrome hiện có.

- [ ] **Step 1: Tạo showcase V15**

```html
<figure class="final-art"><img src="/files/long-mon-vmp-final-race-v15.png" alt="Cuộc đua Long Môn sáu loài cá" /></figure>
<section class="species-study"><img src="/files/long-mon-six-species-v15.png" alt="Sáu loài cá tương ứng sáu trạng thái VMP" /></section>
```

Trang phải có chú giải ánh xạ sáu trạng thái bên dưới tranh, không che lên tác phẩm.

- [ ] **Step 2: Kiểm tra ảnh, alpha và HTTP**

Xác nhận bảng cá là RGBA với góc trong suốt; tranh có tỷ lệ ngang; HTML và hai ảnh trả HTTP `200` bằng khóa phiên Visual Companion.

- [ ] **Step 3: Xác nhận Chrome**

Xác nhận tiêu đề cửa sổ là `Long Môn · Sáu loài tranh đua V15 - Google Chrome` và không khởi chạy thêm Chrome.

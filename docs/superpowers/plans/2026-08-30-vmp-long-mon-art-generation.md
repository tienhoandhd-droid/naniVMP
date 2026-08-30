# VMP Long Môn Art Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tạo tranh nền đường đua Long Môn và bộ ba tư thế cá chép đồng nhất bằng ImageGen, rồi trình bày chúng trong đúng tab Visual Companion hiện có.

**Architecture:** ImageGen tạo hai tài sản bitmap độc lập: một tranh nền ngang không chứa cá dữ liệu và một bảng ba tư thế cá trên nền chroma-key. Tài sản được lưu phiên bản hóa trong thư mục Visual Companion, bộ cá được loại nền cục bộ, sau đó một trang showcase HTML tự chứa sẽ phối hợp hai tài sản mà không sửa mã nguồn ứng dụng.

**Tech Stack:** Built-in ImageGen, PNG, công cụ `remove_chroma_key.py`, HTML/CSS, Visual Companion HTTP server.

## Global Constraints

- Không sửa `src/`, API, quyền truy cập, dữ liệu hoặc quy tắc nghiệp vụ.
- Không mở tab Chrome mới; tái sử dụng tab Visual Companion hiện có.
- Tranh nền không chứa chữ, logo, watermark hoặc cá dữ liệu.
- Bộ cá gồm đúng ba tư thế của cùng một cá chép tròn, hướng sang phải.
- Nền dùng xanh ngọc xám, lam khói, nâu mực và vàng khoáng nhạt; tránh xanh neon.
- Vùng trung tâm tranh nền phải đủ yên để đặt marker dữ liệu.
- Không ghi đè tài sản V13; mọi đầu ra dùng tên V14.

---

### Task 1: Tạo tranh nền đường đua Long Môn

**Files:**
- Create: `.superpowers/brainstorm/94910-1788102465/content/long-mon-vmp-racecourse-v14.png`

**Interfaces:**
- Consumes: prompt nền trong `docs/superpowers/specs/2026-08-30-vmp-long-mon-race-art-design.md`.
- Produces: ảnh PNG ngang dùng làm nền showcase.

- [ ] **Step 1: Gọi built-in ImageGen với prompt nền đã duyệt**

```text
Use case: stylized-concept
Asset type: wide website timeline background
Primary request: an elegant underwater koi racecourse suggesting a determined journey against time
Scene/backdrop: side-view underwater river corridor, powerful current flowing from right to left, a subtle luminous passage near the right third as the distant goal, asymmetrical dark rocks and sparse aquatic plants framing only the edges
Subject: flowing water and refined aquascape environment; no fish
Style/medium: painterly East Asian mineral-pigment and watercolor illustration, contemporary editorial polish, subtle natural pigment grain
Composition/framing: very wide cinematic composition, shallow S-curve guiding the eye from left to right, three depth layers, open quiet central band reserved for interactive data markers
Lighting/mood: soft angled underwater light, purposeful and energetic, sophisticated rather than aggressive
Color palette: muted jade-gray, smoky blue, warm ink brown, restrained pale mineral gold
Constraints: preserve generous negative space; no text; no labels; no logos; no watermark; no decorative gate; no symmetrical sports lanes
Avoid: neon blue, photorealistic aquarium photography, dense plants in the center, fantasy palace, surface-view camera, top-down view, existing fish
```

- [ ] **Step 2: Kiểm tra ảnh nền bằng `view_image`**

Xác nhận góc nhìn ngang, dòng chảy có hướng, trung tâm thoáng, không có cá/chữ và bảng màu không lấn sáu màu trạng thái. Nếu sai một bất biến, lặp lại một lần với đúng một thay đổi trong prompt.

- [ ] **Step 3: Sao chép ảnh được chọn vào thư mục Visual Companion**

Run: `Copy-Item -LiteralPath '<generated-image-path>' -Destination '.superpowers\brainstorm\94910-1788102465\content\long-mon-vmp-racecourse-v14.png'`

Expected: tệp đích tồn tại và có kích thước lớn hơn 100 KB.

### Task 2: Tạo bộ ba tư thế cá chép

**Files:**
- Create: `.superpowers/brainstorm/94910-1788102465/content/long-mon-koi-poses-chroma-v14.png`
- Create: `.superpowers/brainstorm/94910-1788102465/content/long-mon-koi-poses-v14.png`

**Interfaces:**
- Consumes: prompt bộ cá trong đặc tả đã duyệt.
- Produces: bảng ba tư thế cá có alpha để trình bày và làm nguồn tách sprite sau này.

- [ ] **Step 1: Gọi built-in ImageGen với prompt cá chroma-key**

```text
Use case: stylized-concept
Asset type: consistent character reference sheet for timeline markers
Primary request: exactly three matching poses of one chubby round koi carp actively swimming to the right against a strong current
Subject: recognizable carp anatomy, plump oval body, small head, forked tail, visible dorsal and pectoral fins, subtle barbels, small determined eye; pose 1 tail sweeps upward, pose 2 body straightens to accelerate, pose 3 tail sweeps downward
Style/medium: simplified painterly East Asian mineral-pigment illustration, clean readable silhouette, refined and slightly playful
Composition/framing: one horizontal row of exactly three isolated side-view fish, evenly spaced, same scale, all fully visible with generous padding; no overlap
Color palette: neutral pearl-gray body suitable for later six-state tinting, dark ink details, soft warm highlights
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for background removal
Constraints: one consistent character across all poses; flat uniform background; no shadows; no reflections; no text; no watermark; do not use #00ff00 on the fish
Avoid: top-down koi, emoji face, human limbs, armor, clothing, oversized eyes, sticker outline, multiple species, extra fish
```

- [ ] **Step 2: Kiểm tra bảng cá bằng `view_image`**

Xác nhận có đúng ba cá, cùng nhân vật, hướng sang phải, thân bầu và có ba nhịp đuôi khác nhau. Nếu sai số lượng hoặc hướng, lặp lại một lần chỉ để sửa lỗi đó.

- [ ] **Step 3: Sao chép nguồn chroma và loại nền**

Run:

```powershell
Copy-Item -LiteralPath '<generated-image-path>' -Destination '.superpowers\brainstorm\94910-1788102465\content\long-mon-koi-poses-chroma-v14.png'
python 'C:\Users\ADMIN\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py' --input '.superpowers\brainstorm\94910-1788102465\content\long-mon-koi-poses-chroma-v14.png' --out '.superpowers\brainstorm\94910-1788102465\content\long-mon-koi-poses-v14.png' --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill
```

Expected: ảnh đầu ra là PNG có alpha, bốn góc trong suốt và không còn viền xanh rõ.

### Task 3: Trình bày tài sản trong tab hiện có

**Files:**
- Create: `.superpowers/brainstorm/94910-1788102465/content/vmp-long-mon-race-art-v14.html`

**Interfaces:**
- Consumes: `long-mon-vmp-racecourse-v14.png` và `long-mon-koi-poses-v14.png`.
- Produces: trang showcase V14, tự động trở thành nội dung mới nhất của Visual Companion.

- [ ] **Step 1: Tạo trang showcase**

```html
<main>
  <header><p>VMP · Art direction V14</p><h1>Long Môn — cuộc đua ngược dòng</h1></header>
  <figure class="racecourse"><img src="/files/long-mon-vmp-racecourse-v14.png" alt="Đường đua thủy cảnh Long Môn" /></figure>
  <section class="koi-study"><img src="/files/long-mon-koi-poses-v14.png" alt="Ba tư thế cá chép bơi ngược dòng" /></section>
</main>
```

CSS giữ nền ngà trung tính, không phủ bộ lọc làm sai màu ảnh, trình bày tranh nền toàn chiều rộng và bảng cá ở khối riêng phía dưới.

- [ ] **Step 2: Kiểm tra tệp và HTTP**

Run:

```powershell
Get-Item '.superpowers\brainstorm\94910-1788102465\content\long-mon-vmp-racecourse-v14.png', '.superpowers\brainstorm\94910-1788102465\content\long-mon-koi-poses-v14.png', '.superpowers\brainstorm\94910-1788102465\content\vmp-long-mon-race-art-v14.html' | Select-Object Name,Length
Invoke-WebRequest -UseBasicParsing 'http://localhost:59591/files/vmp-long-mon-race-art-v14.html?key=<session-key>' | Select-Object StatusCode
```

Expected: cả ba tệp tồn tại, hai ảnh lớn hơn 100 KB và HTTP trả `200`.

- [ ] **Step 3: Xác nhận đúng tab Chrome**

Run: `Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like '*Long Môn*' } | Select-Object MainWindowTitle`

Expected: một cửa sổ có tiêu đề showcase V14; không khởi chạy thêm Chrome.

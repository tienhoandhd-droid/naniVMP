# VMP Thủy Phổ V13 Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng một bản thử độc lập của “Thủy phổ thời gian” để đánh giá trực quan trước khi sửa giao diện VMP chạy thật.

**Architecture:** Một tệp HTML tự chứa CSS, SVG cá và JavaScript dữ liệu giả lập được đặt trong thư mục Visual Companion hiện có. Logic ánh xạ deadline, sáu trạng thái và xếp luồng được giữ tách thành các hàm thuần ngay trong prototype để có thể kiểm tra bằng script tĩnh; không chạm `src/`, API hoặc dữ liệu thật.

**Tech Stack:** HTML5, CSS, SVG, JavaScript thuần, Node.js cho kiểm tra tĩnh, Visual Companion HTTP server hiện có.

## Global Constraints

- Chỉ tạo prototype trong `.superpowers/brainstorm/94910-1788102465/content` và tài liệu kế hoạch này.
- Không sửa `src/`, API, RPC, quyền truy cập hoặc cơ sở dữ liệu.
- Giữ đúng sáu trạng thái VMP và luật quá hạn ghi đè màu hiển thị.
- Cửa sổ chính hiển thị tháng 7, 8 và 9 năm 2026; ngày hiện tại minh họa là 30/08/2026.
- Không mở tab Chrome mới; dùng lại tab Visual Companion hiện có.

---

### Task 1: Khóa hợp đồng trực quan của prototype

**Files:**
- Create: `.superpowers/brainstorm/94910-1788102465/content/verify-vmp-thuy-pho-v13.mjs`
- Test: `.superpowers/brainstorm/94910-1788102465/content/verify-vmp-thuy-pho-v13.mjs`

**Interfaces:**
- Consumes: tệp `vmp-thuy-pho-thoi-gian-v13.html` ở cùng thư mục.
- Produces: mã thoát `0` và dòng `V13 contract PASS` khi prototype đủ hợp đồng.

- [ ] **Step 1: Viết kiểm tra tĩnh trước khi có HTML**

```js
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./vmp-thuy-pho-thoi-gian-v13.html', import.meta.url), 'utf8');
const required = [
  'Thủy phổ thời gian',
  'class="silk-flow"',
  'class="swim-lanes"',
  'id="fish-layer"',
  'id="selection-connector"',
  'function assignLane',
  'function selectFish',
  'prefers-reduced-motion',
];
for (const token of required) {
  if (!html.includes(token)) throw new Error(`Missing contract token: ${token}`);
}
const stateVariables = html.match(/--s[0-5]:/g) ?? [];
if (new Set(stateVariables).size !== 6) throw new Error('Expected exactly six state colors');
const rows = html.match(/\[\d+,[0-4],[0-4],[01]\]/g) ?? [];
if (rows.length < 40) throw new Error('Expected at least 40 illustrative devices');
if (/river-bg|water-veil|depth-labels|hoa sen|núi|bờ sông/.test(html)) {
  throw new Error('Literal river scenery leaked into V13');
}
console.log('V13 contract PASS');
```

- [ ] **Step 2: Chạy kiểm tra và xác nhận thất bại đúng nguyên nhân**

Run: `node .superpowers/brainstorm/94910-1788102465/content/verify-vmp-thuy-pho-v13.mjs`

Expected: FAIL với `ENOENT` vì `vmp-thuy-pho-thoi-gian-v13.html` chưa tồn tại.

### Task 2: Dựng bản đồ “Thủy phổ thời gian”

**Files:**
- Create: `.superpowers/brainstorm/94910-1788102465/content/vmp-thuy-pho-thoi-gian-v13.html`
- Test: `.superpowers/brainstorm/94910-1788102465/content/verify-vmp-thuy-pho-v13.mjs`

**Interfaces:**
- Consumes: dữ liệu giả lập dạng tuple `[dayOffset, preferredLane, progressState, isOverdue]`.
- Produces: `assignLane(offset, preferredLane, occupied)` để bố trí cá ổn định; `selectFish(button)` để cập nhật đường nối và thẻ chi tiết.

- [ ] **Step 1: Tạo cấu trúc HTML và nền lụa trừu tượng**

```html
<section class="timeline-shell">
  <header class="toolbar">...</header>
  <div class="time-canvas">
    <div class="silk-flow" aria-hidden="true">...</div>
    <div class="swim-lanes" aria-hidden="true">...</div>
    <div class="month-zones">...</div>
    <div id="fish-layer"></div>
    <svg id="selection-connector" aria-hidden="true"></svg>
  </div>
  <section class="device-detail" aria-live="polite">...</section>
</section>
```

CSS dùng nền ngà `#f3efe4`, xanh xám `#dce6df` và các dải Bézier mờ; không dùng ảnh phong cảnh. Sáu màu trạng thái là `#626b68`, `#4b7188`, `#397562`, `#746079`, `#9a793b`, `#aa4741`.

- [ ] **Step 2: Tạo cá chibi và ánh xạ dữ liệu**

```js
function assignLane(offset, preferredLane, occupied) {
  const order = [preferredLane, 0, 1, 2, 3, 4].filter((lane, index, all) => all.indexOf(lane) === index);
  const lane = order.find(candidate => !(occupied[candidate] ?? []).some(x => Math.abs(x - offset) < 4)) ?? preferredLane;
  (occupied[lane] ??= []).push(offset);
  return lane;
}

function xForOffset(offset) {
  return `${(offset / 91) * 95 + 2.5}%`;
}
```

Mỗi `FishMarker` dùng vị trí ngang từ `xForOffset`, vị trí dọc từ `assignLane`, màu thân từ trạng thái hiển thị và vòng gợn chỉ cho sắp hạn/quá hạn.

- [ ] **Step 3: Nối cá được chọn với thẻ chi tiết**

```js
function selectFish(target) {
  document.querySelectorAll('.fish').forEach(fish => fish.classList.toggle('selected', fish === target));
  updateDetail(target.dataset);
  drawConnector(target, document.querySelector('.device-detail'));
}
```

Đường nối phải là nét mảnh không bắt sự kiện chuột; khi resize, gọi lại `drawConnector` cho cá đang chọn.

- [ ] **Step 4: Chạy kiểm tra hợp đồng**

Run: `node .superpowers/brainstorm/94910-1788102465/content/verify-vmp-thuy-pho-v13.mjs`

Expected: PASS với `V13 contract PASS`.

### Task 3: Kiểm tra bản thử trong Visual Companion

**Files:**
- Modify khi cần: `.superpowers/brainstorm/94910-1788102465/content/vmp-thuy-pho-thoi-gian-v13.html`

**Interfaces:**
- Consumes: URL Visual Companion hiện có.
- Produces: bản thử V13 hiển thị trong đúng tab Chrome đã mở.

- [ ] **Step 1: Kiểm tra HTTP của bản mới**

Run: `Invoke-WebRequest -UseBasicParsing 'http://localhost:59591/files/vmp-thuy-pho-thoi-gian-v13.html' | Select-Object StatusCode`

Expected: `StatusCode` bằng `200`.

- [ ] **Step 2: Xác nhận Visual Companion chọn tệp mới nhất**

Run: `Get-ChildItem .superpowers/brainstorm/94910-1788102465/content -File | Sort-Object LastWriteTime | Select-Object -Last 1 Name`

Expected: `vmp-thuy-pho-thoi-gian-v13.html` là tệp nội dung mới nhất; nếu script kiểm tra mới hơn, cập nhật thời gian HTML bằng một chỉnh sửa không đổi nội dung qua `apply_patch`.

- [ ] **Step 3: Kiểm tra thủ công các tiêu chí**

Xác nhận trên tab hiện có: không còn phong cảnh trường hà; deadline vẫn đọc theo trục ngang; cá không chồng không kiểm soát; sáu màu phân biệt được; chọn cá cập nhật thẻ và đường nối; nền không tranh chấp thị giác với cá.

- [ ] **Step 4: Ghi kết quả bàn giao**

Báo chính xác tệp đã tạo, lệnh đã chạy, kết quả kiểm tra và những điểm còn cần người dùng đánh giá trước khi đưa vào `src/`.

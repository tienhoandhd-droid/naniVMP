# VMP Long Môn Mini School V16 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giảm kích thước cá và tạo đàn cá bất đối xứng, dễ nhận diện, không chồng lấn trong từng tuần.

**Architecture:** Giữ nguyên quy tắc một cá là một thiết bị, sáu loài là sáu trạng thái và giới hạn thời gian ba tháng. Atlas 3×2 mới giữ đúng tọa độ sprite hiện tại; model sinh vị trí, tỷ lệ và góc bơi ổn định từ định danh hạng mục, còn React chỉ truyền các giá trị đó sang CSS.

**Tech Stack:** React 18, TypeScript, CSS, Node test runner, Vite, image generation.

## Global Constraints

- Không thay đổi dữ liệu, quyền, API, deadline hoặc logic trạng thái VMP.
- Không dùng `Math.random()`; cùng đầu vào luôn cho cùng đội hình.
- Mọi cá phải nằm trong đúng vùng tuần và không va chạm theo bounding box.
- Giữ mục tiêu tương tác tối thiểu 44×44 px dù hình cá hiển thị nhỏ hơn.
- Không mở thêm tab Chrome; kiểm tra bằng tab local hiện có hoặc trình duyệt headless.

---

### Task 1: Atlas sáu loài V16

**Files:**
- Create: `public/art/monitoring/long-mon-six-species-v16.png`
- Modify: `src/features/monitoring/LongMonRace.tsx`
- Modify: `src/features/monitoring/long-mon-race.css`

**Interfaces:**
- Consumes: atlas V15 3×2 và nền trường đua V15.
- Produces: atlas V16 giữ thứ tự `catfish, betta, carp / angelfish, arowana, puffer`.

- [ ] **Step 1: Sinh atlas trên nền chroma phẳng**

Vẽ sáu cá thủy mặc đơn giản, cùng hướng dòng chảy nhưng khác góc và dáng; mỗi cá chỉ chiếm 55–65% ô, không chữ, không bong bóng, không bóng nền.

- [ ] **Step 2: Tách nền và xem lại ở kích thước thật**

Chạy helper `remove_chroma_key.py`, kiểm tra alpha và mở ảnh bằng công cụ xem ảnh.

- [ ] **Step 3: Nối atlas V16**

Đổi URL trong component và CSS sang `long-mon-six-species-v16.png`; không sửa thứ tự sprite.

### Task 2: Đàn cá nhỏ, bất đối xứng

**Files:**
- Modify: `tests/unit/long-mon-race.test.mjs`
- Modify: `src/features/monitoring/longMonRaceModel.ts`
- Modify: `src/features/monitoring/LongMonRace.tsx`
- Modify: `src/features/monitoring/long-mon-race.css`

**Interfaces:**
- Consumes: `LongMonRaceFish[]` đã có `weekKey` và deadline.
- Produces: collision box `62×54`, hình cá `54×42`, góc khoảng `±12°`, tỷ lệ cá riêng `0.88–1.04` nhân với tỷ lệ mật độ.

- [ ] **Step 1: Viết test đỏ**

Test đàn 12 cá có ít nhất bốn góc bơi sau khi làm tròn, có cả góc âm/dương, ít nhất bốn tỷ lệ hiển thị và không va chạm; SSR vẫn có hit target 44×44.

- [ ] **Step 2: Chạy test và xác nhận thất bại đúng lý do**

Run: `node --import tsx --test tests/unit/long-mon-race.test.mjs`

- [ ] **Step 3: Cài đặt tối thiểu**

Giảm collision box; mở biên độ đường sóng/góc bơi; sinh `renderScale` ổn định theo định danh. CSS thu hình sprite về `54×42` nhưng đặt button hit target tối thiểu `54×44`.

- [ ] **Step 4: Chạy test xanh**

Run: `node --import tsx --test tests/unit/long-mon-race.test.mjs tests/unit/monitoring-journey.test.mjs`

### Task 3: Gate giao diện

**Files:**
- Test: `tests/e2e/long-mon-race.mjs`

**Interfaces:**
- Consumes: local `http://127.0.0.1:5199/#v=timeline`.
- Produces: bằng chứng atlas tải được, cá không chồng lấn/cắt mép và ảnh chụp để xem bố cục.

- [ ] **Step 1: Chạy typecheck và build**

Run: `npm run typecheck` và `npm run build`.

- [ ] **Step 2: Chạy E2E mục tiêu**

Run: `node tests/e2e/long-mon-race.mjs` với `VMP_E2E_URL=http://127.0.0.1:5199/`.

- [ ] **Step 3: Kiểm tra diff hẹp**

Run: `git diff --check -- src/features/monitoring/longMonRaceModel.ts src/features/monitoring/LongMonRace.tsx src/features/monitoring/long-mon-race.css tests/unit/long-mon-race.test.mjs`.

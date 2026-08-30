# VMP Long Môn Organic School Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay lưới/cột cá Long Môn bằng các đàn cá bất đối xứng neo đúng deadline, ngắn hơn và có thẩm mỹ như một ngư đồ.

**Architecture:** Model thuần nhóm cá theo ngày, cấp điểm neo `xPct` bất biến và sinh formation offset ổn định cho tối đa ba cá mỗi hàng. Bộ đóng gói dùng bounding box của cả đàn để tái sử dụng dải nước; component chỉ chuyển các trường render thành CSS variables và E2E đối chiếu riêng mốc nghiệp vụ với vị trí trình bày.

**Tech Stack:** TypeScript, React 18, CSS, Node test runner + tsx, Puppeteer.

## Global Constraints

- Mỗi ngày khác nhau luôn có một điểm neo riêng; chỉ cá cùng ngày mới thuộc cùng đàn.
- `xPct` tiếp tục là deadline thật và không bị jitter.
- `renderOffsetXPx` không vượt `22px`, co lại theo khoảng cách ngày lân cận và không đảo thứ tự các điểm neo.
- Một hàng chứa tối đa ba cá; không ẩn, gộp hoặc thay đổi loài/màu/trạng thái.
- Không dùng `Math.random()`; cùng input phải tạo cùng đội hình.
- Không đổi API, RPC, quyền, database, filter, asset hoặc công thức deadline.

---

### Task 1: Formation model ổn định theo deadline

**Files:**
- Modify: `src/features/monitoring/longMonRaceModel.ts`
- Modify: `tests/unit/long-mon-race.test.mjs`

**Interfaces:**
- Consumes: danh sách `LongMonRaceFish` đã sort theo `deadline + code + id`.
- Produces thêm trên `LongMonRaceFish`:

```ts
renderOffsetXPx: number;
renderOffsetYPx: number;
renderScale: number;
renderRotateDeg: number;
schoolRow: number;
schoolSize: number;
```

- [ ] **Step 1: Viết test đỏ cho đàn cùng ngày**

Tạo sáu activity cùng `2026-08-31`; assert tất cả giữ cùng `xPct`, `schoolSize === 6`, `schoolRow` chỉ gồm `0, 1`, có ít nhất ba `renderOffsetXPx` khác nhau, `Math.abs(offset) <= 22`, và `laneCount <= 2` khi không có nhóm khác.

- [ ] **Step 2: Chạy test đỏ**

Run: `node --import tsx --test tests/unit/long-mon-race.test.mjs`

Expected: FAIL vì các trường formation chưa tồn tại và sáu cá vẫn chiếm sáu lane.

- [ ] **Step 3: Viết test đỏ cho ngày khác nhau và tính ổn định**

Tạo nhóm `01/09`, `02/09`, `15/09`; build hai lần và assert deep equality cho formation. Với hai ngày sát nhau, tổng độ mở về phía nhau nhỏ hơn khoảng cách hai anchor quy đổi ở canvas tối thiểu `820px`; nhóm ngày 15 dùng được fan lớn hơn nhóm 01/02.

- [ ] **Step 4: Cài formation thuần**

Nhóm bằng `Map<string, LongMonRaceFish[]>`. Mỗi hàng dùng pattern:

```ts
const X_PATTERN = {
  1: [0],
  2: [-0.55, 0.55],
  3: [0, -1, 1],
} as const;
const Y_DRIFT = [0, -9, 8, 6, -7, 2];
const SCALE = [1.02, .94, .9, .96, 1, .92];
const ROTATE = [-1.5, 1.2, -2.2, .8, -1, 1.8];
```

Giới hạn fan theo ngày lân cận: `Math.min(22, Math.max(2, nearestGapDays * 4 - 2))`. Không dùng khoảng cách tới nhóm không tồn tại ở một phía để co đàn vô ích.

- [ ] **Step 5: Đóng gói bounding box theo số hàng**

Mỗi group có `rowCount = Math.ceil(size / 3)`. Tìm `baseLane` là dãy `rowCount` lane liên tục mà `lastRightPct <= groupLeftPct`; dùng bán kính `(40 + fanPx) / 8.2` phần trăm cho canvas tối thiểu 820px. Gán `lane = baseLane + schoolRow` và cập nhật `laneCount` từ số dải đã dùng.

- [ ] **Step 6: Chạy unit xanh**

Run: `node --import tsx --test tests/unit/long-mon-race.test.mjs`

Expected: PASS; sáu cá cùng ngày dùng hai hàng.

### Task 2: Trình bày ngư đồ bất đối xứng

**Files:**
- Modify: `src/features/monitoring/LongMonRace.tsx`
- Modify: `src/features/monitoring/long-mon-race.css`
- Modify: `tests/unit/long-mon-race.test.mjs`

**Interfaces:**
- Consumes: sáu trường formation từ Task 1.
- Produces: CSS variables `--school-x`, `--school-y`, `--school-scale`, `--school-rotate` và `data-deadline`/`data-anchor-x` phục vụ truy vết.

- [ ] **Step 1: Thêm SSR contract test đỏ**

Assert HTML fish button có `data-deadline="2026-08-31"`, wrapper có `--school-x`, `--school-y`, `--school-scale`, `--school-rotate`; `aria-label` vẫn dùng deadline thật.

- [ ] **Step 2: Chạy test đỏ**

Run: `node --import tsx --test tests/unit/long-mon-race.test.mjs`

Expected: FAIL vì component chưa truyền formation fields.

- [ ] **Step 3: Nối formation vào component**

Đổi `FishStyle` và wrapper:

```tsx
const style = {
  "--long-mon-x": `${fish.xPct}%`,
  "--long-mon-y": `${74 + fish.lane * 48}px`,
  "--school-x": `${fish.renderOffsetXPx}px`,
  "--school-y": `${fish.renderOffsetYPx}px`,
  "--school-scale": fish.renderScale,
  "--school-rotate": `${fish.renderRotateDeg}deg`,
};
```

Giảm `canvasHeight` về `Math.max(350, 136 + laneCount * 48)`. Thêm `data-deadline` và `data-anchor-x` vào button; không thay callback mở hồ sơ.

- [ ] **Step 4: Chuyển transform sang đội hình đàn cá**

Wrapper giữ điểm neo bằng `left: clamp(...)`, sau đó dùng:

```css
transform: translate(calc(-50% + var(--school-x)), var(--school-y));
```

Button dùng `scale(var(--school-scale)) rotate(var(--school-rotate))`; hover/focus cộng nhấc nhẹ trên wrapper con, không ghi đè transform neo. Giữ reduced-motion bằng cách bỏ transition/hover lift, không xóa formation tĩnh.

- [ ] **Step 5: Chạy unit/typecheck**

Run:

```powershell
node --import tsx --test tests/unit/long-mon-race.test.mjs tests/unit/monitoring-journey.test.mjs
npm run typecheck
```

Expected: PASS.

### Task 3: E2E hình đàn và gate cuối

**Files:**
- Modify: `tests/e2e/long-mon-race.mjs`

**Interfaces:**
- Consumes: `data-deadline`, `data-anchor-x`, rendered rectangles.
- Produces: bằng chứng không còn cột thẳng, không cắt mép, mobile vẫn căn hôm nay.

- [ ] **Step 1: Đổi assertion trục thời gian**

Không yêu cầu `fishLeft` tăng tuyệt đối vì formation có jitter trình bày. Assert `data-anchor-x` tăng không giảm theo deadline và mọi cá cùng deadline có cùng anchor.

- [ ] **Step 2: Assert đội hình đàn cá**

Tìm deadline có ít nhất ba cá; assert tâm X render có ít nhất hai giá trị khác nhau và số tâm Y khác nhau không vượt `Math.ceil(count / 3) * 3`. Giữ kiểm tra cá không vượt canvas, assets tải được, click mở modal và target `44×44px`.

- [ ] **Step 3: Chạy build fallback và E2E**

Build bằng envDir tạm vì `.env` máy hiện tại bị ACL `EPERM`, với URL/anon giả chỉ trong process. Chạy static preview headless riêng, không mở tab Chrome:

```powershell
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:VMP_E2E_URL='http://127.0.0.1:<temporary-port>/'
node tests/e2e/long-mon-race.mjs
```

Expected: PASS desktop 1440, mobile 390, strict-network rỗng.

- [ ] **Step 4: Gate cuối**

Run:

```powershell
node --import tsx --test tests/unit/long-mon-race.test.mjs tests/unit/monitoring-journey.test.mjs
npm run typecheck
git diff --check -- src/features/monitoring tests/unit/long-mon-race.test.mjs tests/e2e/long-mon-race.mjs
```

Expected: PASS. Review hai screenshot và xác nhận đàn cá không thành hàng/cột đều, code vẫn đọc được, tranh không tăng chiều cao bất thường.

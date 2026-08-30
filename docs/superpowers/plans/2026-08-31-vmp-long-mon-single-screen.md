# Long Môn VMP Single-Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hiển thị toàn bộ đàn cá trong một mặt nước cố định vừa một màn hình, xếp thông minh cả tuần đông và dựng lại đội hình cân đối khi xem cá nhân.

**Architecture:** Giữ `longMonRaceModel.ts` là model thuần và chuyển từ lane tăng chiều cao sang bộ đóng gói hai chiều trong hệ tọa độ chuẩn 820×520. Model nhận `audience`, trả tọa độ phần trăm và một `densityScale` chung; React chỉ truyền phạm vi và CSS giữ chiều cao scene cố định. Thuật toán xếp tuần đông trước, kiểm tra va chạm toàn cục và dùng hash ID nên không phụ thuộc thứ tự input.

**Tech Stack:** React 19, TypeScript, CSS custom properties, Node test runner + `tsx`, Puppeteer Core, Vite 6.

## Global Constraints

- Không sửa RPC, RLS, Supabase, deadline hoặc ma trận quyền.
- Không dùng `Math.random`, animation, API mới hoặc dependency mới.
- Desktop từ 1024px: ba tháng và toàn bộ mặt nước nằm trong một lượt xem, không cuộn ngang hoặc dọc nội bộ.
- Mobile 390px: không cuộn dọc nội bộ; được kéo ngang trên canvas tối thiểu 880px.
- Không đổi tranh nền hoặc sprite cá đã duyệt; không gộp, giấu hoặc thay cá bằng số.
- Giữ vùng bấm mỗi cá tối thiểu 44×44px và thứ tự bàn phím theo deadline rồi mã.
- Cổng mật độ bắt buộc: 48 cá trong ba tháng, 12 cá cùng tuần và hai tuần đông liền kề không chồng lấn trong scene cố định.
- Chỉ chạy targeted unit/E2E Long Môn, typecheck và production build theo `AGENTS.md`.

## File map

- `src/features/monitoring/longMonRaceModel.ts`: phân loại trạng thái, vùng tháng/tuần và toàn bộ thuật toán bố cục thuần.
- `src/features/monitoring/LongMonRace.tsx`: truyền audience, ánh xạ kết quả model thành CSS variables và DOM truy cập được.
- `src/features/monitoring/long-mon-race.css`: kích thước scene cố định, overflow desktop/mobile và dáng cá.
- `tests/unit/long-mon-race.test.mjs`: hợp đồng model, va chạm, bố cục cá nhân và SSR component.
- `tests/e2e/long-mon-race.mjs`: hành vi thật desktop/mobile, chuyển phạm vi và mở deadline.

---

### Task 1: Bộ đóng gói hai chiều cho tuần đông trong scene cố định

**Files:**
- Modify: `src/features/monitoring/longMonRaceModel.ts`
- Modify: `tests/unit/long-mon-race.test.mjs`

**Interfaces:**
- Consumes: `Activity[]`, `Date`, `LongMonRaceLayoutOptions`.
- Produces:

```ts
export interface LongMonRaceLayoutOptions {
  audience?: "team" | "personal";
}

export interface LongMonRaceFish {
  activity: Activity;
  deadline: string;
  stage: LongMonRaceStage;
  weekKey: string;
  weekIndex: number;
  weekLabel: string;
  xPct: number;
  yPct: number;
  renderOffsetXPx: number;
  renderOffsetYPx: number;
  renderScale: number;
  renderRotateDeg: number;
  schoolRow: number;
  schoolSize: number;
}

export interface LongMonRaceModel {
  bands: LongMonMonthBand[];
  weeks: LongMonWeekBand[];
  fish: LongMonRaceFish[];
  densityScale: number;
  todayPct: number | null;
  missingDeadlineCount: number;
  stageCounts: Record<LongMonRaceStage, number>;
}

export function buildLongMonRaceModel(
  activities: readonly Activity[],
  now: Date,
  options?: LongMonRaceLayoutOptions,
): LongMonRaceModel;
```

- Loại bỏ `laneCount` khỏi điều khiển chiều cao; không cần xóa ngay trường `lane` nếu test legacy còn dùng nó, nhưng component mới không được dựa vào trường đó.

- [ ] **Step 1: Đổi helper va chạm của test sang tọa độ phần trăm trong scene 820×520**

```js
const SCENE_WIDTH = 820;
const SCENE_HEIGHT = 520;

function overlappingPairs(fish) {
  const boxes = fish.map((item) => {
    const width = LONG_MON_COLLISION_WIDTH_PX * item.renderScale;
    const height = LONG_MON_COLLISION_HEIGHT_PX * item.renderScale;
    const centerX = item.xPct / 100 * SCENE_WIDTH;
    const centerY = item.yPct / 100 * SCENE_HEIGHT;
    return {
      id: item.activity.id,
      left: centerX - width / 2,
      right: centerX + width / 2,
      top: centerY - height / 2,
      bottom: centerY + height / 2,
    };
  });
  const overlaps = [];
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left];
      const b = boxes[right];
      if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
        overlaps.push(`${a.id}/${b.id}`);
      }
    }
  }
  return overlaps;
}
```

- [ ] **Step 2: Viết test RED cho 12 cá cùng tuần, hai tuần đông và tính ổn định**

```js
test("mười hai cá cùng tuần tạo cụm hai chiều không chồng lấn", () => {
  const input = Array.from({ length: 12 }, (_, index) =>
    activity(`dense-${index}`, `2026-09-0${1 + index % 6}`));
  const model = buildLongMonRaceModel(input, NOW, { audience: "team" });

  assert.deepEqual(overlappingPairs(model.fish), []);
  assert.ok(new Set(model.fish.map((fish) => Math.round(fish.xPct * 10))).size >= 6);
  assert.ok(new Set(model.fish.map((fish) => Math.round(fish.yPct * 10))).size >= 6);
  assert.ok(model.fish.every((fish) => fish.yPct >= 0 && fish.yPct <= 100));
});

test("hai tuần đông liền kề dùng va chạm toàn cục và không phụ thuộc thứ tự input", () => {
  const input = [
    ...Array.from({ length: 8 }, (_, i) => activity(`left-${i}`, "2026-09-06")),
    ...Array.from({ length: 8 }, (_, i) => activity(`right-${i}`, "2026-09-07")),
  ];
  const first = buildLongMonRaceModel(input, NOW, { audience: "team" });
  const reversed = buildLongMonRaceModel([...input].reverse(), NOW, { audience: "team" });

  assert.deepEqual(overlappingPairs(first.fish), []);
  assert.deepEqual(
    first.fish.map(({ activity: { id }, xPct, yPct }) => ({ id, xPct, yPct })),
    reversed.fish.map(({ activity: { id }, xPct, yPct }) => ({ id, xPct, yPct })),
  );
});

test("bốn mươi tám cá giữ nguyên chiều cao scene và nằm trọn khung", () => {
  const input = Array.from({ length: 48 }, (_, index) => {
    const dayOffset = index % 84;
    const deadline = new Date(Date.UTC(2026, 6, 1 + dayOffset)).toISOString().slice(0, 10);
    return activity(`team-${index}`, deadline);
  });
  const model = buildLongMonRaceModel(input, NOW, { audience: "team" });

  assert.equal(model.fish.length, 48);
  assert.deepEqual(overlappingPairs(model.fish), []);
  assert.ok(model.fish.every((fish) => fish.xPct >= 0 && fish.xPct <= 100));
  assert.ok(model.fish.every((fish) => fish.yPct >= 0 && fish.yPct <= 100));
  assert.ok(model.densityScale >= .82 && model.densityScale <= 1);
});
```

- [ ] **Step 3: Chạy test và xác nhận RED đúng lý do**

Run:

```powershell
node --test --import tsx tests/unit/long-mon-race.test.mjs
```

Expected: FAIL vì model chưa có `yPct`, chưa nhận options và layout hiện tại tăng lane theo chiều dọc.

- [ ] **Step 4: Cài đặt model scene chuẩn và cấu trúc retry theo mật độ**

Trong `longMonRaceModel.ts`, thêm các hằng và kiểu:

```ts
const LONG_MON_SCENE_WIDTH_PX = 820;
const LONG_MON_SCENE_HEIGHT_PX = 520;
const TEAM_DENSITY_LEVELS = [1, .91, .82] as const;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

interface PlacementRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface PlacementResult {
  positions: Map<string, { xPx: number; yPx: number; rotateDeg: number }>;
  densityScale: number;
}
```

Tách các hàm thuần:

```ts
function rectAt(xPx: number, yPx: number, scale: number): PlacementRect;
function overlapsAny(rect: PlacementRect, placed: readonly PlacementRect[]): boolean;
function denseWeekCandidates(
  week: LongMonWeekBand,
  fish: LongMonRaceFish,
  scale: number,
): Array<{ xPx: number; yPx: number; rotateDeg: number }>;
function tryTeamPlacement(
  fish: readonly LongMonRaceFish[],
  weeks: readonly LongMonWeekBand[],
  scale: number,
): Map<string, { xPx: number; yPx: number; rotateDeg: number }> | null;
```

`denseWeekCandidates` sinh tối thiểu 160 điểm ứng viên. Với ứng viên `index`, dùng:

```ts
const theta = stableUnit(fish.activity, `${fish.weekKey}:theta`) * Math.PI * 2
  + index * GOLDEN_ANGLE;
const normalizedRadius = Math.sqrt((index + 1) / 160);
const xRadius = Math.max(54, week.widthPct / 100 * LONG_MON_SCENE_WIDTH_PX);
const yRadius = LONG_MON_SCENE_HEIGHT_PX * .43;
const xPx = weekCenterPx + Math.cos(theta) * xRadius * normalizedRadius;
const flowY = Math.sin(xPx / LONG_MON_SCENE_WIDTH_PX * Math.PI * 3.4) * 18;
const yPx = LONG_MON_SCENE_HEIGHT_PX / 2
  + Math.sin(theta) * yRadius * normalizedRadius
  + flowY;
```

Clamp tâm cá theo nửa collision box. Nhóm tuần theo `weekKey`, sắp nhóm theo `count desc` rồi `week.index asc`; trong nhóm sắp deadline và code. Thử ứng viên cho từng cá và kiểm tra với một mảng `placedRects` toàn cục. Sau khi đặt xong, trả fish theo deadline/code để giữ thứ tự focus.

`buildLongMonRaceModel` chạy `tryTeamPlacement` lần lượt với `1`, `.91`, `.82` và dùng kết quả đầu tiên đặt được toàn bộ cá. Chuyển `xPx/yPx` sang `xPct/yPct`; `renderScale` là `densityScale` nhân sai lệch ổn định giới hạn ±3%, nhưng collision dùng mức lớn nhất để vẫn an toàn.

- [ ] **Step 5: Chạy test GREEN và test scope liên quan**

Run:

```powershell
node --test --import tsx tests/unit/long-mon-race.test.mjs tests/unit/long-mon-race-scope.test.mjs
```

Expected: toàn bộ test PASS, đặc biệt không có cặp overlap trong fixture tuần đông.

- [ ] **Step 6: Commit task model nếu diff không lẫn thay đổi ngoài Long Môn**

```powershell
git add -- src/features/monitoring/longMonRaceModel.ts tests/unit/long-mon-race.test.mjs
git diff --cached --check
git commit -m "feat(monitoring): pack dense VMP weeks in fixed scene"
```

Nếu hai file chứa thay đổi người dùng ngoài phạm vi chưa thể tách an toàn, không commit; giữ diff và ghi rõ ở handoff.

---

### Task 2: Đội hình cá nhân và canvas cố định một màn hình

**Files:**
- Modify: `src/features/monitoring/longMonRaceModel.ts`
- Modify: `src/features/monitoring/LongMonRace.tsx`
- Modify: `src/features/monitoring/long-mon-race.css`
- Modify: `tests/unit/long-mon-race.test.mjs`

**Interfaces:**
- Consumes: `scopeControl.audience`, model API và `densityScale` từ Task 1.
- Produces: `personalPreferredY(index, count, activity): number`, DOM dùng `--long-mon-y` theo phần trăm và `.long-mon-race__canvas--fixed-scene`.

- [ ] **Step 1: Viết test RED cho đội hình cá nhân 1, 4 và 10 cá**

```js
test("cá nhân tự bố trí trung tâm, vòng cung và chữ S ổn định", () => {
  const one = buildLongMonRaceModel([activity("solo", "2026-09-05")], NOW, { audience: "personal" });
  assert.ok(one.fish[0].yPct >= 42 && one.fish[0].yPct <= 58);

  const fourInput = Array.from({ length: 4 }, (_, i) => activity(`arc-${i}`, `2026-09-0${i + 1}`));
  const four = buildLongMonRaceModel(fourInput, NOW, { audience: "personal" });
  assert.deepEqual(overlappingPairs(four.fish), []);
  assert.ok(Math.max(...four.fish.map((fish) => fish.yPct)) - Math.min(...four.fish.map((fish) => fish.yPct)) >= 18);

  const tenInput = Array.from({ length: 10 }, (_, i) => activity(`s-${i}`, `2026-09-${String(i + 1).padStart(2, "0")}`));
  const ten = buildLongMonRaceModel(tenInput, NOW, { audience: "personal" });
  const team = buildLongMonRaceModel(tenInput, NOW, { audience: "team" });
  assert.deepEqual(overlappingPairs(ten.fish), []);
  assert.notDeepEqual(
    ten.fish.map(({ xPct, yPct }) => ({ xPct, yPct })),
    team.fish.map(({ xPct, yPct }) => ({ xPct, yPct })),
  );
  assert.deepEqual(ten, buildLongMonRaceModel(tenInput, NOW, { audience: "personal" }));
});
```

- [ ] **Step 2: Viết component contract RED cho audience và fixed scene**

```js
assert.match(html, /long-mon-race__canvas long-mon-race__canvas--fixed-scene/);
assert.match(html, /--long-mon-y:[\d.]+%/);
assert.doesNotMatch(html, /style="[^"]*height:\s*\d+px/);

const source = await readFile(new URL("../../src/features/monitoring/LongMonRace.tsx", import.meta.url), "utf8");
assert.match(source, /buildLongMonRaceModel\([\s\S]*audience:\s*scopeControl\?\.audience\s*\?\?\s*"team"/);
assert.doesNotMatch(source, /laneCount\s*\*\s*78/);
```

- [ ] **Step 3: Chạy test và xác nhận RED**

Run:

```powershell
node --test --import tsx tests/unit/long-mon-race.test.mjs
```

Expected: FAIL vì model chưa có nhánh personal, component vẫn dùng `canvasHeight` từ `laneCount` và `--long-mon-y` còn là px.

- [ ] **Step 4: Cài đặt nhánh bố cục cá nhân trong model**

Thêm hàm ưu tiên cao độ:

```ts
function personalPreferredY(index: number, count: number, activity: Activity): number {
  if (count === 1) return LONG_MON_SCENE_HEIGHT_PX * .5;
  const progress = count === 1 ? .5 : index / (count - 1);
  if (count <= 4) {
    const centered = progress * 2 - 1;
    return LONG_MON_SCENE_HEIGHT_PX * (.46 + centered * centered * .16);
  }
  return LONG_MON_SCENE_HEIGHT_PX * (
    .5
    + Math.sin(progress * Math.PI * 2 - Math.PI / 2) * .25
    + (stableUnit(activity, "personal-row") - .5) * .04
  );
}
```

Tạo `tryPersonalPlacement` dùng cùng collision helper của Task 1 nhưng sắp ứng viên theo khoảng cách tới `personalPreferredY`. Với 1–12 cá, scale cơ sở nằm trong `1.02–1.08`; trên 12 cá gọi `tryTeamPlacement` ở mức `1` trước. X vẫn neo theo week center và dùng cụm tuần, không dồn các deadline xa nhau về cùng x.

- [ ] **Step 5: Chuyển component sang y phần trăm và truyền audience**

Trong `LongMonRace.tsx`:

```tsx
const model = buildLongMonRaceModel(activities, now, {
  audience: scopeControl?.audience ?? "team",
});

// bỏ canvasHeight = Math.max(...laneCount...)
<div className="long-mon-race__canvas long-mon-race__canvas--fixed-scene">

const style: FishStyle = {
  "--long-mon-x": `${fish.xPct}%`,
  "--long-mon-y": `${fish.yPct}%`,
  // giữ các biến render còn lại
};
```

Thêm `data-density-scale={model.densityScale}` trên canvas để E2E có thể truy vết mức đóng gói mà không đọc style nội bộ.

- [ ] **Step 6: Cố định chiều cao và overflow bằng CSS**

Trong `long-mon-race.css`:

```css
.long-mon-race__viewport {
  max-height: none;
  overflow-x: hidden;
  overflow-y: hidden;
}

.long-mon-race__canvas--fixed-scene {
  width: 100%;
  height: clamp(460px, 62dvh, 640px);
}

.long-mon-race__fish-position {
  top: clamp(42px, var(--long-mon-y), calc(100% - 70px));
}

@media (max-width: 720px) {
  .long-mon-race__viewport { overflow-x: auto; }
  .long-mon-race__canvas--fixed-scene {
    width: 880px;
    height: min(62dvh, 560px);
  }
}
```

Giữ `min-width: 880px` chỉ trong mobile query; desktop dùng `width: 100%` để ba tháng nằm trọn một màn hình.

- [ ] **Step 7: Chạy unit GREEN và typecheck**

Run:

```powershell
node --test --import tsx tests/unit/long-mon-race.test.mjs tests/unit/long-mon-race-scope.test.mjs
npx tsc --noEmit
```

Expected: toàn bộ test Long Môn hiện có và test mới PASS; TypeScript exit 0.

- [ ] **Step 8: Commit task UI nếu diff có thể tách an toàn**

```powershell
git add -- src/features/monitoring/longMonRaceModel.ts src/features/monitoring/LongMonRace.tsx src/features/monitoring/long-mon-race.css tests/unit/long-mon-race.test.mjs
git diff --cached --check
git commit -m "feat(monitoring): fit Long Mon race into one scene"
```

Nếu file đã chứa thay đổi người dùng không thể tách, không commit và ghi rõ ở handoff.

---

### Task 3: Cổng E2E một màn hình, chuyển cá nhân và build

**Files:**
- Modify: `tests/e2e/long-mon-race.mjs`
- Verify: `src/features/monitoring/longMonRaceModel.ts`
- Verify: `src/features/monitoring/LongMonRace.tsx`
- Verify: `src/features/monitoring/long-mon-race.css`

**Interfaces:**
- Consumes: `.long-mon-race__viewport`, `.long-mon-race__canvas--fixed-scene`, `[data-long-mon-fish]`, `[data-long-mon-audience]`, `data-density-scale`.
- Produces: E2E targeted chứng minh một scene, không overflow dọc, không overlap và personal reflow.

- [ ] **Step 1: Thêm assertion desktop và personal reflow vào E2E**

Trong phép `page.evaluate` desktop, thu thập:

```js
const race = document.querySelector(".long-mon-race").getBoundingClientRect();
const viewport = document.querySelector(".long-mon-race__viewport");
const canvas = document.querySelector(".long-mon-race__canvas").getBoundingClientRect();
return {
  // giữ evidence hiện có
  raceBottom: race.bottom,
  windowHeight: innerHeight,
  verticalOverflow: viewport.scrollHeight - viewport.clientHeight,
  canvasHeight: canvas.height,
  densityScale: document.querySelector(".long-mon-race__canvas")?.dataset.densityScale,
};
```

Assert:

```js
assert.ok(desktop.raceBottom <= desktop.windowHeight + 2);
assert.ok(desktop.verticalOverflow <= 1);
assert.ok(desktop.canvasHeight >= 460 && desktop.canvasHeight <= 640);
assert.ok(Number(desktop.densityScale) >= .82);
```

Trước khi bấm `Cá nhân`, lưu `data-long-mon-fish` và `getBoundingClientRect()` của các cá còn xuất hiện sau khi lọc. Sau khi chọn QA, assert chiều cao canvas không đổi, ít nhất một cá chung ID đổi `top` hoặc `left`, và danh sách mới vẫn không overlap.

- [ ] **Step 2: Thêm assertion mobile không overflow dọc nhưng có canvas ngang**

```js
assert.ok(mobile.viewportScrollHeight - mobile.viewportClientHeight <= 1);
assert.ok(mobile.canvasWidth >= 880);
assert.ok(mobile.viewportScrollWidth > mobile.viewportClientWidth);
assert.deepEqual(mobile.overlaps, []);
```

- [ ] **Step 3: Chạy E2E targeted trên build mới**

Run với server production tạm ở cổng riêng, không dùng hoặc tắt local của người dùng:

```powershell
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:VMP_E2E_URL='http://127.0.0.1:5202/'
node tests/e2e/long-mon-race.mjs
```

Expected: PASS vì hành vi đã đi qua vòng RED/GREEN ở unit và component contract trong Task 1–2; E2E là cổng tích hợp bổ sung. Nếu server chưa chạy, khởi động `python -m http.server 5202 --bind 127.0.0.1 --directory dist` trong tiến trình riêng có cửa sổ ẩn.

- [ ] **Step 4: Chạy toàn bộ cổng targeted và production build**

```powershell
node --test --import tsx tests/unit/long-mon-race.test.mjs tests/unit/long-mon-race-scope.test.mjs
npx tsc --noEmit
$vmpBuildEnvDir = Join-Path $env:TEMP 'vmp-long-mon-build-env'
$env:VMP_BUILD_ENV_DIR=$vmpBuildEnvDir
$env:VITE_SUPABASE_URL='https://build.invalid'
$env:VITE_SUPABASE_ANON='local-build-anon'
$env:VITE_SUPABASE_ANON_KEY='local-build-anon'
node --input-type=module -e 'import { build } from "vite"; await build({ envDir: process.env.VMP_BUILD_ENV_DIR })'
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:VMP_E2E_URL='http://127.0.0.1:5202/'
node tests/e2e/long-mon-race.mjs
git diff --check
```

Expected: unit PASS, typecheck exit 0, Vite build exit 0 và ba thông báo E2E Long Môn PASS. Chỉ ghi nhận warning font/Vite placeholder đã có; không mở vòng sửa lỗi ngoài Long Môn.

- [ ] **Step 5: Kiểm ảnh desktop/mobile và dọn server test**

Mở bằng công cụ đọc ảnh, không mở Chrome visible:

```text
%TEMP%\long-mon-race-1440.png
%TEMP%\long-mon-race-390.png
```

Xác nhận bằng mắt: không có hàng/cột thẳng, tuần đông tạo cụm hai chiều, cá nhân có khoảng thở và chú giải không bị cắt. Xác minh command line của PID server chứa `http.server 5202` trước khi dừng; không tác động cổng 5199.

- [ ] **Step 6: Commit E2E nếu file có thể tách an toàn**

```powershell
git add -- tests/e2e/long-mon-race.mjs
git diff --cached --check
git commit -m "test(monitoring): verify Long Mon single-screen layout"
```

Nếu file chứa thay đổi chưa commit thuộc cùng chuỗi Long Môn, có thể giữ cùng diff và báo cáo thay vì tạo commit ngoài yêu cầu.

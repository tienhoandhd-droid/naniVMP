# VMP Long Môn 60-Day Artistic Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển Ngư đồ Long Môn từ hai tháng lịch sang 60 ngày quanh Hôm nay, đồng thời tạo nhịp thị giác “ký ức → hiện tại → tương lai” bằng nền tranh mới và lớp CSS có thể kiểm soát.

**Architecture:** `longMonRaceModel.ts` tiếp tục là nguồn chân lý duy nhất cho cửa sổ thời gian, dải tuần/tháng và vị trí cá; trục được chia thành hai nửa có tổng trọng số bằng nhau để Hôm nay luôn ở 50%. `LongMonRace.tsx` chỉ render model và dùng một asset WebP mới không chứa cá/chữ; `long-mon-race.css` tạo miền quá khứ/tương lai, khe sáng Hôm nay và phân cấp thị giác. Không thay RPC, quyền, dữ liệu nguồn hoặc chế độ Bảng.

**Tech Stack:** TypeScript, React, CSS, WebP, built-in image generation, Node test runner + tsx, Puppeteer.

## Global Constraints

- Cửa sổ là `[Hôm nay - 30 ngày, Hôm nay + 30 ngày)` theo ngày Bangkok.
- Hôm nay ở đúng `50%`; 30 ngày đã qua và 30 ngày sắp tới có chiều rộng bằng nhau.
- Deadline, trạng thái, loài cá, phân công và quyền tiếp tục lấy từ nguồn hiện tại.
- Không thêm 3D, canvas, thư viện runtime hoặc khối nhiều chữ.
- Asset mới phải là WebP versioned; không ghi đè `long-mon-vmp-racecourse-v15.webp`.
- Desktop 1024px trở lên không cuộn ngang; mobile tự căn Hôm nay và được kéo ngang.
- `prefers-reduced-motion: reduce` phải giữ đủ nội dung ở trạng thái tĩnh.

## File map

- `src/features/monitoring/longMonRaceModel.ts`: tính cửa sổ 60 ngày, khóa Hôm nay ở 50%, trả hai miền thời gian.
- `src/features/monitoring/LongMonRace.tsx`: dùng nền mới, rút gọn đầu tranh, render miền thời gian và nhãn truy cập.
- `src/features/monitoring/long-mon-race.css`: lớp mỹ thuật quá khứ/Hôm nay/tương lai, responsive và reduced-motion.
- `public/art/monitoring/long-mon-vmp-racecourse-60-days-v17.webp`: nền tranh không cá, không chữ, không cổng; sinh bằng built-in image generation dựa trên V15.
- `tests/unit/long-mon-race.test.mjs`: hợp đồng model/component/CSS/asset.
- `tests/e2e/long-mon-race.mjs`: bằng chứng desktop/mobile và ảnh kiểm tra.

---

### Task 1: Model 60 ngày và trục hai nửa

**Files:**
- Modify: `tests/unit/long-mon-race.test.mjs`
- Modify: `src/features/monitoring/longMonRaceModel.ts`

**Interfaces:**
- Consumes: `bangkokCalendarDate(now)`, `vmpDeadlineDate(activity)` và `weightedWeekBands` hiện tại.
- Produces: `LongMonRaceModel.periods: LongMonPeriodBand[]`, `todayPct: 50`, các dải tuần/tháng và cá trong `[today - 30d, today + 30d)`.

- [ ] **Step 1: Viết test đỏ cho biên 60 ngày**

Thay các test hai tháng lịch bằng fixture quanh `NOW = 2026-08-31`:

```js
const model = buildLongMonRaceModel([
  activity("start", "2026-08-01"),
  activity("before", "2026-07-31"),
  activity("last", "2026-09-29"),
  activity("outside", "2026-09-30"),
], NOW);
assert.deepEqual(model.fish.map((fish) => fish.activity.id).sort(), ["last", "start"]);
assert.equal(model.todayPct, 50);
assert.deepEqual(model.periods.map(({ id, startPct, widthPct }) => ({ id, startPct, widthPct })), [
  { id: "past", startPct: 0, widthPct: 50 },
  { id: "future", startPct: 50, widthPct: 50 },
]);
```

- [ ] **Step 2: Chạy test đỏ**

Run: `node --import tsx --test tests/unit/long-mon-race.test.mjs`

Expected: FAIL vì model vẫn lấy đầu tháng hiện tại tới đầu tháng sau nữa và chưa có `periods`.

- [ ] **Step 3: Thêm kiểu miền thời gian và cửa sổ 60 ngày**

Thêm vào model:

```ts
export interface LongMonPeriodBand {
  id: "past" | "future";
  label: string;
  startPct: number;
  widthPct: number;
}

function rangeAround(now: Date) {
  const [year, month, day] = bangkokCalendarDate(now).split("-").map(Number);
  const today = Date.UTC(year, month - 1, day);
  return {
    start: today - 30 * DAY_MS,
    endExclusive: today + 30 * DAY_MS,
    today,
  };
}
```

Thêm `periods` vào `LongMonRaceModel` và kết quả:

```ts
periods: [
  { id: "past", label: "30 ngày đã qua", startPct: 0, widthPct: 50 },
  { id: "future", label: "30 ngày sắp tới", startPct: 50, widthPct: 50 },
],
todayPct: 50,
```

- [ ] **Step 4: Cân trọng số tuần riêng từng nửa**

Đổi `weightedWeekBands` nhận `start`, `today`, `endExclusive`; với mỗi tuần tính số mili-giây giao miền quá khứ và tương lai, nhân cùng `densityWeight`, rồi chuẩn hóa tổng phần quá khứ về 50 và tổng phần tương lai về 50. Tuần cắt qua Hôm nay giữ một band duy nhất nhưng `widthPct` bằng tổng hai phần đã chuẩn hóa; không được để mật độ cá đẩy Hôm nay lệch tâm.

```ts
const weighted = weeks.map((week) => ({
  week,
  pastRaw: overlapMs(week, start, today) * densityWeight(week, counts),
  futureRaw: overlapMs(week, today, endExclusive) * densityWeight(week, counts),
}));
const pastTotal = weighted.reduce((sum, item) => sum + item.pastRaw, 0);
const futureTotal = weighted.reduce((sum, item) => sum + item.futureRaw, 0);
let cursor = 0;
return weighted.map(({ week, pastRaw, futureRaw }) => {
  const widthPct = pastRaw / pastTotal * 50 + futureRaw / futureTotal * 50;
  const band = { ...week, startPct: cursor, widthPct };
  cursor += widthPct;
  return band;
});
```

Trong đó `overlapMs(week, sideStart, sideEnd)` dùng biên thực của tuần đã cắt theo cửa sổ; `densityWeight` giữ nguyên luật tuần trống `.58`, tuần có cá `1 + min(.8, log2(count + 1) * .16)`. Tổng `widthPct` phải bằng 100 trong sai số `.001`.

- [ ] **Step 5: Chạy unit xanh và commit**

Run:

```powershell
node --import tsx --test tests/unit/long-mon-race.test.mjs
git diff --check -- src/features/monitoring/longMonRaceModel.ts tests/unit/long-mon-race.test.mjs
```

Expected: PASS; Hôm nay bằng 50 ở cả fixture giao tháng và giao năm.

Commit:

```powershell
git add src/features/monitoring/longMonRaceModel.ts tests/unit/long-mon-race.test.mjs
git commit -m "feat(timeline): chuyen Long Mon sang cua so 60 ngay"
```

---

### Task 2: Nền tranh “Từ ký ức đến Long Môn”

**Files:**
- Reference: `public/art/monitoring/long-mon-vmp-racecourse-v15.webp`
- Create: `public/art/monitoring/long-mon-vmp-racecourse-60-days-v17.webp`
- Modify: `src/features/monitoring/LongMonRace.tsx`
- Test: `tests/unit/long-mon-race.test.mjs`

**Interfaces:**
- Consumes: nền V15 làm edit target; cổng Vũ Môn và sprite cá vẫn là asset độc lập.
- Produces: `LONG_MON_BACKGROUND_URL` trỏ asset V17, nền không cá/chữ/logo/watermark.

- [ ] **Step 1: Viết contract test đỏ cho asset mới**

```js
assert.equal(
  LONG_MON_BACKGROUND_URL,
  "/art/monitoring/long-mon-vmp-racecourse-60-days-v17.webp",
);
```

Test thêm source không tham chiếu nền V15 trong `BACKGROUND_URL`.

- [ ] **Step 2: Chạy test đỏ**

Run: `node --import tsx --test tests/unit/long-mon-race.test.mjs`

Expected: FAIL vì component vẫn dùng V15.

- [ ] **Step 3: Tạo nền bằng built-in image generation**

Edit target: `long-mon-vmp-racecourse-v15.webp`.

Prompt cuối:

```text
Use case: lighting-weather
Asset type: panoramic background for a VMP deadline timeline
Primary request: transform the existing empty underwater Long Môn racecourse into a poetic two-act journey from memory to possibility.
Composition/framing: preserve the same wide panoramic cave and open central water; left half visually deeper and calmer, right half progressively brighter and warmer; create a subtle vertical seam of light at the exact center; preserve generous empty water for UI fish and labels; keep the brightest destination near the right edge.
Style/medium: refined Vietnamese lacquer-and-silk-painting atmosphere blended with painterly underwater realism; elegant, restrained, premium enterprise visual.
Lighting/mood: left half muted deep jade with soft mist and settled sediment; center a narrow pearl-gold light veil; right half clear jade and warm gold rays leading forward.
Constraints: background only; no fish, no gate, no bridge, no people, no text, no numbers, no symbols, no logo, no watermark; do not add a second focal object; preserve edge rocks and central negative space; seamless enough for cover cropping.
Avoid: fantasy game UI, neon colors, heavy fog over the center, high-frequency texture behind labels, symmetrical split-screen look.
```

Inspect the output; accept only when the center and fish area remain uncluttered. Copy the selected generated output into the workspace, then encode to WebP without overwriting V15.

- [ ] **Step 4: Nối asset V17 và giữ kích thước ảnh ổn định**

Đổi:

```ts
const BACKGROUND_URL = `${ART_BASE}long-mon-vmp-racecourse-60-days-v17.webp`;
```

Giữ `width`/`height` khớp kích thước thật của asset để tránh CLS; tiếp tục preload cùng sprite/cổng.

- [ ] **Step 5: Kiểm asset và commit**

Run:

```powershell
Get-Item public/art/monitoring/long-mon-vmp-racecourse-60-days-v17.webp | Select-Object Name,Length
node --import tsx --test tests/unit/long-mon-race.test.mjs
git diff --check -- src/features/monitoring/LongMonRace.tsx tests/unit/long-mon-race.test.mjs
```

Expected: file tồn tại, trình duyệt đọc được, unit PASS.

Commit:

```powershell
git add public/art/monitoring/long-mon-vmp-racecourse-60-days-v17.webp src/features/monitoring/LongMonRace.tsx tests/unit/long-mon-race.test.mjs
git commit -m "feat(timeline): them nen Long Mon 60 ngay"
```

---

### Task 3: Bố cục nghệ thuật và nội dung cô đọng

**Files:**
- Modify: `src/features/monitoring/LongMonRace.tsx`
- Modify: `src/features/monitoring/long-mon-race.css`
- Modify: `tests/unit/long-mon-race.test.mjs`

**Interfaces:**
- Consumes: `model.periods`, `model.todayPct`, asset V17.
- Produces: hai miền có nhãn chữ, đầu tranh ngắn, khe sáng Hôm nay, chú giải nén gọn.

- [ ] **Step 1: Viết component/CSS test đỏ**

Assert HTML có:

```js
assert.match(html, /aria-label="Dòng thời gian VMP 60 ngày quanh Hôm nay"/);
assert.match(html, /data-long-mon-period="past"/);
assert.match(html, /30 ngày đã qua/);
assert.match(html, /data-long-mon-period="future"/);
assert.match(html, /30 ngày sắp tới/);
assert.match(html, /Bấm cá để xem hạn và hồ sơ/);
assert.doesNotMatch(html, /Dòng nước/);
```

Assert CSS có `.long-mon-race__period--past`, `.long-mon-race__period--future`, `.long-mon-race__today::before` và reduced-motion.

- [ ] **Step 2: Chạy test đỏ**

Run: `node --import tsx --test tests/unit/long-mon-race.test.mjs`

Expected: FAIL vì chưa render hai miền và header vẫn dài.

- [ ] **Step 3: Rút gọn header và render miền thời gian**

Trong `LongMonRace.tsx`:

```tsx
<span className="long-mon-race__eyebrow">60 ngày quanh Hôm nay</span>
<h2>Long Môn VMP</h2>
<p>Bấm cá để xem hạn và hồ sơ</p>
```

Bỏ `long-mon-race__flow`. Trong canvas, trước months/weeks:

```tsx
<div className="long-mon-race__periods" aria-hidden="true">
  {model.periods.map((period) => (
    <span key={period.id} data-long-mon-period={period.id}
      className={`long-mon-race__period long-mon-race__period--${period.id}`}
      style={{ left: `${period.startPct}%`, width: `${period.widthPct}%` }}>
      <strong>{period.label}</strong>
    </span>
  ))}
</div>
```

Cập nhật aria-label section/viewport/school và empty-state từ “hai tháng” sang “60 ngày”.

- [ ] **Step 4: Tạo lớp mỹ thuật bằng CSS**

- Quá khứ: overlay jade trầm, saturation thấp, nhãn nằm góc trái.
- Tương lai: overlay trong hơn, ánh vàng tăng về phải, nhãn nằm góc phải.
- Hôm nay: khe sáng pearl-gold rộng 18–28px bằng pseudo-element, vạch chính 1px và ấn nhãn ở tâm.
- Months/weeks giảm tương phản; z-index dưới cá, không chặn chuột.
- Footer desktop 6 cột nhưng giảm chiều cao item; header/canvas phải vẫn nằm trong viewport 1440×1000.
- Mobile giữ canvas `max(880px, sceneWidth)` và auto-center theo `.long-mon-race__today`.
- Reduced motion tắt drift/swim nhưng không ẩn overlay hoặc nhãn.

- [ ] **Step 5: Chạy unit, typecheck và commit**

Run:

```powershell
node --import tsx --test tests/unit/long-mon-race.test.mjs tests/unit/monitoring-journey.test.mjs
npm run typecheck
git diff --check -- src/features/monitoring tests/unit/long-mon-race.test.mjs
```

Expected: PASS.

Commit:

```powershell
git add src/features/monitoring/LongMonRace.tsx src/features/monitoring/long-mon-race.css tests/unit/long-mon-race.test.mjs
git commit -m "feat(timeline): ke chuyen 60 ngay bang Long Mon"
```

---

### Task 4: E2E desktop/mobile và gate phát hành local

**Files:**
- Modify: `tests/e2e/long-mon-race.mjs`

**Interfaces:**
- Consumes: model/component/CSS/asset hoàn thiện.
- Produces: ảnh desktop/mobile và bằng chứng chức năng không hồi quy.

- [ ] **Step 1: Đổi E2E sang hợp đồng 60 ngày**

Thay `expectedBangkokMonths` bằng helper trả biên `today - 30d` và `today + 30d`; trong `page.evaluate` lấy:

```js
const periods = [...document.querySelectorAll("[data-long-mon-period]")]
  .map((item) => ({ id: item.dataset.longMonPeriod, text: item.textContent?.trim() }));
const todayLeftPct = Number.parseFloat(document.querySelector(".long-mon-race__today")?.style.left ?? "NaN");
```

Assert hai miền đúng nhãn, `todayLeftPct === 50`, week count 9–10, asset V17 loaded, cá không chồng/cắt và không cuộn ngang desktop.

- [ ] **Step 2: Chạy targeted E2E trên preview 4175**

Run:

```powershell
$env:VMP_E2E_URL='http://127.0.0.1:4175/'
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests/e2e/long-mon-race.mjs
```

Expected: PASS desktop 1440×1000 và mobile 390×844; in đường dẫn hai screenshot.

- [ ] **Step 3: Xem ảnh và sửa đúng một vòng nếu cần**

Kiểm trực tiếp hai screenshot: Hôm nay ở tâm; trái/phải khác sắc độ nhưng liền cảnh; tên tháng/tuần đọc được; cá và mã không chìm; cổng không che cá cuối kỳ; header/footer không lấn mặt nước. Nếu có lỗi, chỉ chỉnh lớp CSS/asset liên quan rồi chạy lại unit + E2E.

- [ ] **Step 4: Gate cuối**

Run:

```powershell
node --import tsx --test tests/unit/long-mon-race.test.mjs tests/unit/monitoring-journey.test.mjs
npm run typecheck
npm run build
git diff --check
git status --short
```

Expected: tất cả PASS; chỉ còn các file trong kế hoạch nếu chưa commit.

- [ ] **Step 5: Commit E2E**

```powershell
git add tests/e2e/long-mon-race.mjs
git commit -m "test(timeline): khoa trai nghiem Long Mon 60 ngay"
```

Không push hoặc deploy trong kế hoạch này nếu chưa có yêu cầu riêng.

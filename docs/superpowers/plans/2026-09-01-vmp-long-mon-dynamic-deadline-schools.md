# VMP Long Môn Dynamic Deadline Schools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biến Ngư đồ 60 ngày thành bức tranh sống có đàn cá theo deadline chính xác, mọi cá luôn hiện và bấm riêng, Hôm nay ở giữa, đồng thời chịu được từ 1 đến 126 hồ sơ.

**Architecture:** `longMonRaceModel.ts` là nguồn chân lý thuần cho trục thời gian tuyến tính, vùng sở hữu deadline, đội hình và metadata chuyển động xác định. `LongMonRace.tsx` chỉ chuyển model thành DOM truy vết được; CSS chỉ chuyển động lớp thân cá bên trong nút đứng yên. Fixture mật độ dùng chung cho unit/E2E và không lọt vào bundle production.

**Tech Stack:** React 18, TypeScript 7, CSS thuần theo route, Node test runner qua `tsx`, Puppeteer E2E mock, Vite 6.

## Global Constraints

- Cửa sổ là `[Hôm nay - 30 ngày, Hôm nay + 30 ngày)`; Hôm nay luôn ở `50%`.
- Trục ngang tuyến tính; mật độ không được kéo giãn tuần/tháng.
- Mỗi hồ sơ hợp lệ là một nút cá riêng tối thiểu `44×44px`; không gom, ẩn hoặc phân trang cá.
- Cùng deadline dùng chung `deadlinePct`, nhưng có `renderXPct`/`renderYPct` riêng trong vùng sở hữu deadline.
- Không dùng `Math.random()`; cùng input cho cùng layout dù đảo thứ tự input.
- Va chạm phải tính thêm phong bì chuyển động ngang `4px`, dọc `5px`.
- Nút và focus ring đứng yên; chỉ lớp thân cá chuyển động; hover/focus dừng cá; reduced motion tắt animation.
- Không đổi nền V17, cổng Long Môn, sprite sáu loài, API, RPC, RLS, dữ liệu nguồn hoặc quyền.
- Không push, deploy hoặc tác động dịch vụ remote trong kế hoạch này.

---

### Task 1: Trục thời gian tuyến tính và hợp đồng đàn theo deadline

**Files:**
- Modify: `tests/unit/long-mon-race.test.mjs`
- Modify: `src/features/monitoring/longMonRaceModel.ts`

**Interfaces:**
- Produces: `LongMonSchoolFormation`, `LongMonMotionProfile`, và các trường `deadlinePct`, `renderXPct`, `renderYPct`, `ownerStartPct`, `ownerEndPct`, `schoolFormation`, `schoolIndex`, `schoolSize`, `motionProfile` trên `LongMonRaceFish`.
- Preserves: `buildLongMonRaceModel(activities, now, options): LongMonRaceModel` và cửa sổ 60 ngày hiện có.

- [x] **Step 1: Viết test RED cho thang thời gian tuyến tính**

Thay test “tuần trống thu hẹp” bằng hợp đồng không méo thời gian:

```js
test("trục 60 ngày tuyến tính giữ Hôm nay ở giữa dù mật độ lệch", () => {
  const model = buildLongMonRaceModel([
    activity("start", "2026-08-01"),
    ...Array.from({ length: 20 }, (_, index) => activity(`dense-${index}`, "2026-09-01")),
    activity("last", "2026-09-29"),
  ], NOW, { audience: "team" });

  assert.equal(model.todayPct, 50);
  assert.ok(Math.abs(model.weeks.reduce((sum, week) => sum + week.widthPct, 0) - 100) < .001);
  assert.ok(model.weeks.every((week) => week.widthPct <= 7 / 60 * 100 + .001));
  assert.equal(model.fish.find((fish) => fish.deadline === "2026-08-01").deadlinePct, 0);
  assert.equal(model.fish.find((fish) => fish.deadline === "2026-09-01").deadlinePct, 31 / 60 * 100);
});
```

- [x] **Step 2: Chạy unit mục tiêu để xác nhận RED**

Run: `node --import tsx --test --test-name-pattern "trục 60 ngày tuyến tính" tests/unit/long-mon-race.test.mjs`

Expected: FAIL vì `deadlinePct` chưa tồn tại và tuần còn bị `weightedWeekBands()` kéo giãn.

- [x] **Step 3: Viết test RED cho năm họ đội hình và vùng sở hữu deadline**

```js
test("đàn 1 5 12 24 40 cá chọn đúng họ và không rời vùng deadline", () => {
  const cases = [[1, "solo"], [5, "arc"], [12, "double-stream"], [24, "teardrop"], [40, "branches"]];
  for (const [count, formation] of cases) {
    const model = buildLongMonRaceModel(
      Array.from({ length: count }, (_, index) => activity(`${formation}-${index}`, "2026-09-05")),
      NOW,
      { audience: "team" },
    );
    assert.equal(model.fish.length, count);
    assert.ok(model.fish.every((fish) => fish.schoolFormation === formation));
    assert.equal(new Set(model.fish.map((fish) => fish.deadlinePct)).size, 1);
    assert.ok(model.fish.every((fish) => fish.renderXPct >= fish.ownerStartPct
      && fish.renderXPct <= fish.ownerEndPct));
    assert.deepEqual(overlappingPairsInModel(model), []);
  }
});
```

- [x] **Step 4: Chạy test đội hình để xác nhận RED**

Run: `node --import tsx --test --test-name-pattern "đàn 1 5 12 24 40" tests/unit/long-mon-race.test.mjs`

Expected: FAIL vì model hiện nhóm theo tuần và chưa có metadata deadline/formation.

- [x] **Step 5: Cài đặt model deadline-school tối thiểu**

Trong `longMonRaceModel.ts`:

```ts
export type LongMonSchoolFormation = "solo" | "arc" | "double-stream" | "teardrop" | "branches";
export type LongMonMotionProfile = "glide" | "rise" | "s-curve" | "stream-tilt" | "follow" | "tail-drift";

function percentInWindow(time: number, start: number, endExclusive: number): number {
  return clamp((time - start) / (endExclusive - start) * 100, 0, 100);
}

function formationOf(count: number): LongMonSchoolFormation {
  if (count === 1) return "solo";
  if (count <= 5) return "arc";
  if (count <= 12) return "double-stream";
  if (count <= 30) return "teardrop";
  return "branches";
}
```

- Bỏ `weightedWeekBands()` khỏi luồng build; dùng trực tiếp `weekBands()` và `percentInWindow()` cho tuần, tháng và `deadlinePct`.
- Nhóm theo `deadline`; tính biên sở hữu bằng trung điểm của các `deadlinePct` lân cận, giới hạn theo nửa chiều rộng collision ở hai mép.
- Sinh slot theo năm họ đội hình bằng công thức cung/chữ S/giọt nước/nhánh xác định; hash chỉ dùng chọn pha, dấu và lệch nhỏ.
- Đặt nhóm đông trước, kiểm tra collision toàn cục với rectangle đã cộng `4px` ngang và `5px` dọc; tăng `TEAM_HEIGHT_LEVELS`, giảm `TEAM_DENSITY_LEVELS`, sau cùng dùng lưới khẩn cấp trong đúng vùng sở hữu.
- Gán `renderXPct`/`renderYPct`; không dùng `xPct`/`yPct` làm tọa độ nghiệp vụ nữa.

- [x] **Step 6: Chạy toàn bộ unit Long Môn và sửa hồi quy trong đúng file mục tiêu**

Run: `node --import tsx --test tests/unit/long-mon-race.test.mjs`

Expected: PASS; các assertion cũ dùng `xPct`/`yPct` được đổi sang `renderXPct`/`renderYPct`, còn `data-anchor-x` ở Task 2 sẽ dùng `deadlinePct`.

- [x] **Step 7: Commit model**

```powershell
git add src/features/monitoring/longMonRaceModel.ts tests/unit/long-mon-race.test.mjs
git commit -m "feat(timeline): dan ca theo deadline chinh xac"
```

---

### Task 2: Thân cá linh động trên hit target đứng yên

**Files:**
- Modify: `tests/unit/long-mon-race.test.mjs`
- Modify: `src/features/monitoring/LongMonRace.tsx`
- Modify: `src/features/monitoring/long-mon-race.css`

**Interfaces:**
- Consumes: metadata model từ Task 1.
- Produces: DOM `data-anchor-x`, `data-render-x`, `data-owner-start`, `data-owner-end`, `data-school-formation`, `data-motion-profile`; CSS variables `--motion-x`, `--motion-y`, `--motion-rotate`, `--swim-delay`, `--swim-dur`.

- [x] **Step 1: Viết test RED cho DOM truy vết và lớp thân cá**

Thêm assertion SSR:

```js
assert.match(html, /data-anchor-x="[\d.]+"/);
assert.match(html, /data-render-x="[\d.]+"/);
assert.match(html, /data-school-formation="solo"/);
assert.match(html, /data-motion-profile="(?:glide|rise|s-curve|stream-tilt|follow|tail-drift)"/);
assert.match(html, /class="long-mon-race__fish-body"/);
```

Và assertion CSS/source:

```js
assert.match(css, /\.long-mon-race__fish:hover \.long-mon-race__fish-body[\s\S]*animation-play-state:\s*paused/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.long-mon-race__fish-body[\s\S]*animation:\s*none/);
```

- [x] **Step 2: Chạy test SSR/CSS để xác nhận RED**

Run: `node --import tsx --test --test-name-pattern "trường đua kể|sprite sáu loài" tests/unit/long-mon-race.test.mjs`

Expected: FAIL vì DOM chưa có lớp thân/meta mới và CSS chưa có sáu profile.

- [x] **Step 3: Cài đặt DOM đứng yên và sáu profile chuyển động**

Trong `LongMonRace.tsx`:

```tsx
<button
  data-anchor-x={fish.deadlinePct}
  data-render-x={fish.renderXPct}
  data-owner-start={fish.ownerStartPct}
  data-owner-end={fish.ownerEndPct}
  data-school-formation={fish.schoolFormation}
  data-motion-profile={fish.motionProfile}
>
  <span className="long-mon-race__fish-body">
    <span className="long-mon-race__wake" aria-hidden="true" />
    <span className="long-mon-race__sprite" style={spriteStyle(stage)} aria-hidden="true" />
    <span className="long-mon-race__code" aria-hidden="true">{code}</span>
  </span>
  <span className="long-mon-race__tooltip" aria-hidden="true">
    <strong>{code}</strong>
    <span>{name}</span>
    <em>{stage.label} · hạn {deadline}</em>
  </span>
</button>
```

- Đặt `.long-mon-race__fish-position` bằng `renderXPct`/`renderYPct`.
- Nút giữ `54×44px`, focus ring và tooltip đứng yên.
- `.long-mon-race__fish-body` nhận scale/rotate tĩnh và animation theo `data-motion-profile`.
- Sáu keyframe không vượt `4px`, `5px`, `3deg`; duration xác định trong `5.2–10.5s`; delay âm từ hash của deadline + ID.
- Hover/focus đặt `animation-play-state: paused`; reduced motion đặt `animation: none` và giữ transform tĩnh.

- [x] **Step 4: Chạy unit Long Môn**

Run: `node --import tsx --test tests/unit/long-mon-race.test.mjs`

Expected: PASS, không có warning SSR.

- [x] **Step 5: Commit UI chuyển động**

```powershell
git add src/features/monitoring/LongMonRace.tsx src/features/monitoring/long-mon-race.css tests/unit/long-mon-race.test.mjs
git commit -m "feat(timeline): lam dan ca boi linh dong"
```

---

### Task 3: Harness mô phỏng mật độ và E2E desktop/mobile

**Files:**
- Create: `tests/fixtures/long-mon-density-fixtures.mjs`
- Create: `tests/e2e/long-mon-density-gallery.mjs`
- Modify: `tests/unit/long-mon-race.test.mjs`
- Modify: `tests/e2e/long-mon-race.mjs`

**Interfaces:**
- Produces: `makeLongMonDensityActivities({ count, deadline, prefix })` và `LONG_MON_DENSITY_SCENARIOS` chỉ dành cho test.
- Consumes: `caiGiaLap(..., { suaKho })` để thay riêng activities trong RPC dashboard mock, không thêm cờ production.

- [x] **Step 1: Tạo fixture dùng chung và test RED cho 120/126 cá**

```js
export function makeLongMonDensityActivities({ count, deadline, prefix }) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    code: `${prefix.toUpperCase()}-${String(index + 1).padStart(3, "0")}`,
    name: `Hạng mục ${index + 1}`,
    target: deadline,
    canonicalDeadline: deadline,
    st: "todo",
    _raw: { dl_vmp: deadline, deadline_vmp: deadline },
  }));
}
```

`LONG_MON_DENSITY_SCENARIOS` gồm `1/5/12/24/40` cùng ngày, `18+18` hai ngày kế nhau, `120` rải 60 ngày có ba deadline trên 15 cá, và `126` tại ba deadline.

- [x] **Step 2: Chạy unit density để xác nhận RED**

Run: `node --import tsx --test --test-name-pattern "mô phỏng mật độ" tests/unit/long-mon-race.test.mjs`

Expected: FAIL cho tới khi fixture được nối với các assertion count, ownership, collision envelope, formation và tọa độ khác `(0, 0)`.

- [x] **Step 3: Hoàn thiện unit harness và giữ toàn bộ cảnh GREEN**

Mỗi scenario gọi model, assert số cá bằng input hợp lệ, không overlap, không vượt owner/canvas, deterministic khi đảo input. Cảnh `18+18` assert hai `deadlinePct` khác nhau và hai vùng ownership không trộn. Cảnh `120/126` assert không ném và `sceneHeightPx <= 2240`.

Run: `node --import tsx --test tests/unit/long-mon-race.test.mjs`

Expected: PASS.

- [x] **Step 4: Tạo E2E gallery cho toàn bộ cảnh mật độ**

Trong `tests/e2e/long-mon-density-gallery.mjs`, mở một page mới cho từng scenario, truyền `suaKho` vào `caiGiaLap`, rồi thay cả `rpc_get_vmp_dashboard.activities` và `rpc_get_vmp_dashboard_v2.activities` bằng fixture tương ứng. Clone cấu trúc activity gốc của từng RPC và chỉ thay `id`, `code`, `name`, `_raw.dl_vmp`, `target`, `canonical_deadline`, `canonicalDeadline`, `days_left` để vẫn qua đúng decoder production.

Mỗi cảnh `1/5/12/24/40`, `18+18`, `120`, `126` phải xuất số liệu JSON và ảnh desktop vào `tmpdir()/long-mon-density-gallery/`. Cảnh 40 cá mở thêm viewport mobile 390×844, xác nhận Hôm nay tự nằm trong viewport và chụp `40-fish-mobile.png`. Không ghi ảnh sinh tự động vào repo.

Mở rộng `tests/e2e/long-mon-race.mjs` để kiểm hit target, anchor/render và click modal trên dataset ngày hiện tại. Gallery kiểm tra cho từng cảnh:

```js
assert.equal(dense.fishCount, 40);
assert.equal(dense.uniqueAnchors, 1);
assert.ok(dense.uniqueRenderX > 1);
assert.deepEqual(dense.overlaps, []);
assert.deepEqual(dense.smallFish, []);
assert.equal(dense.todayVisibleOnMobile, true);
```

Với các cảnh khác, thay `40` bằng `scenario.expectedCount`; tất cả đều phải không overlap, không clipped và mọi nút đạt `44×44px`.

- [x] **Step 5: Build mock và chạy targeted E2E**

Run:

```powershell
$env:VITE_MANUAL_PLANNED_DEADLINES_ENABLED='true'
npm run build
```

Khởi động/reuse preview IPv4 đúng cổng local đang dùng, sau đó:

```powershell
$env:VMP_E2E_URL='http://127.0.0.1:4175/'
node tests/e2e/long-mon-race.mjs
node tests/e2e/long-mon-density-gallery.mjs
```

Expected: PASS; tám ảnh desktop, một ảnh mobile và số liệu model được in đường dẫn temp; không có request ngoài mock.

- [x] **Step 6: Commit harness**

```powershell
git add tests/fixtures/long-mon-density-fixtures.mjs tests/unit/long-mon-race.test.mjs tests/e2e/long-mon-race.mjs tests/e2e/long-mon-density-gallery.mjs
git commit -m "test(timeline): mo phong mat do dan ca Long Mon"
```

---

### Task 4: Gate phát hành local và cập nhật tiến độ

**Files:**
- Modify: `docs/superpowers/plans/2026-09-01-vmp-long-mon-dynamic-deadline-schools.md`

**Interfaces:**
- Consumes: toàn bộ thay đổi Tasks 1–3.
- Produces: bằng chứng gate local; không phát hành remote.

- [x] **Step 1: Chạy gate mục tiêu**

```powershell
node --import tsx --test tests/unit/long-mon-race.test.mjs
npm run typecheck
npm run build
npm run drift
npm run budget
```

Expected: tất cả exit `0`; chỉ ghi riêng warning build có sẵn nếu xuất hiện.

- [x] **Step 2: Chạy targeted E2E và a11y Timeline**

```powershell
$env:VMP_E2E_URL='http://127.0.0.1:4175/'
node tests/e2e/long-mon-race.mjs
npx playwright test -c playwright.a11y.config.ts --grep "timeline"
```

Expected: Long Môn desktop/mobile PASS; a11y Timeline PASS; nếu tên project không khớp grep thì chạy hai case có `root: ".timeline-page-shell .long-mon-race"` bằng tên test thực tế.

- [x] **Step 3: Đối chiếu git và đánh dấu bằng commit thật**

Chỉ đổi checkbox `[x]` khi commit tương ứng tồn tại trong `git log --oneline`; thêm mã commit ở cuối từng Task. Sau đó:

```powershell
git diff --check
git status --short --branch
```

- [x] **Step 4: Commit trạng thái kế hoạch**

```powershell
git add docs/superpowers/plans/2026-09-01-vmp-long-mon-dynamic-deadline-schools.md
git commit -m "docs: chot ket qua dan ca Long Mon"
```

- [x] **Step 5: Báo cáo bàn giao local**

Báo file thay đổi, commit local, lệnh đã chạy, kết quả từng gate, đường dẫn preview `http://127.0.0.1:4175`, và rủi ro còn lại. Không push/deploy cho tới khi người dùng yêu cầu rõ.

## Bằng chứng hoàn tất

- Task 1: `62329e9` — model deadline chính xác, trục tuyến tính và năm họ đội hình.
- Task 2: `3ebf761` — sáu nhịp bơi trên hit target đứng yên.
- Task 3: `726722f` — fixture, gallery mật độ, collision DOM và tinh chỉnh vùng neo deadline sau khi duyệt ảnh.
- Gate chốt: unit Long Môn `25/25`; targeted E2E Long Môn + gallery đạt; a11y Timeline `2/2`; typecheck, build, drift và budget exit `0`.
- Preview kiểm tra: `http://127.0.0.1:4175`.

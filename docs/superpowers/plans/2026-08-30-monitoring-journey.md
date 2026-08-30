# Monitoring Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biến ba màn Giám sát thành một hành trình thống nhất, phân biệt rõ ba định nghĩa nghiệp vụ, gộp chỉ số/bộ lọc/nút trùng và giữ 2D đầy đủ khi 3D không khả dụng.

**Architecture:** `App` tính một bộ ba chỉ số chữ ký từ đúng `filteredActs` chung và dựng một `MonitoringJourneyNav` duy nhất cho `overview`, `timeline`, `alerts`. Mỗi màn chỉ giữ metric và hành động thuộc câu hỏi riêng; CSS nghệ thuật được scope trong feature mới, còn Timeline/QRM tiếp tục dùng renderer, callback và fallback hiện có.

**Tech Stack:** React 18, TypeScript, Vite 6, Lucide React, React Three Fiber/Three.js hiện có, Node test runner + `tsx`, Puppeteer/Playwright + axe.

## Global Constraints

- Chỉ sửa `overview`, `timeline`, `alerts` và điểm tích hợp trực tiếp trong `App`; không redesign màn khác.
- Không đổi database, RPC, migration, quyền, công thức deadline/RPN hoặc filtered population hiện hành.
- Không thêm dependency, URL state hoặc localStorage mới; không viết lại `WorkloadSpace3D`/`RiskSpace3D`.
- Switcher luôn tính từ `filteredActs` chung và ghi `Theo phạm vi chung`; không tính lại theo `overviewActs` có thể đang scope theo một người.
- 2D là đường chức năng đầy đủ; 3D chỉ lazy-load sau thao tác người dùng và giữ fallback WebGL hiện có.
- Một thông tin chỉ có một chủ sở hữu thị giác: tiến độ hoàn thành ở Overview, quá hạn theo pha ở Timeline, rủi ro cao ở Alerts.
- Một vùng tác vụ chỉ có một CTA chính; tìm kiếm/xếp/xuất/3D/AI là hành động phụ.
- Control semantic, focus nhìn thấy, `aria-current`/`aria-pressed` đúng; hit target tối thiểu 44px trên mobile.
- Giữ nguyên thay đổi local; không dùng reset/checkout/restore, không commit và không push.
- Dùng `apply_patch`; mỗi task kết thúc bằng scoped diff checkpoint thay cho commit.
- Test browser đặt `window.__REACT_GRAB_DISABLED__ = true` trước khi tải document.

## File Map

- Create `src/features/monitoring/monitoringMetrics.ts`: một nguồn duy nhất cho ba chỉ số chữ ký.
- Create `src/features/monitoring/MonitoringJourneyNav.tsx`: điều hướng semantic, không chứa công thức.
- Create `src/features/monitoring/monitoring.css`: visual Botanical Intelligence, responsive và focus được scope.
- Modify `src/main.tsx`: import CSS feature đúng một lần.
- Modify `src/App.tsx`: tính metric chung, dựng switcher một lần, tinh gọn Overview.
- Modify `src/pages/TimelinePage.tsx`: dải metric riêng Timeline và một cổng mở bản đồ.
- Modify `src/pages/AlertsPage.tsx`: ba metric chính, disclosure công cụ phụ, copy nhóm/AI rõ ràng.
- Create `tests/unit/monitoring-journey.test.mjs`: công thức, copy và contract tránh trùng.
- Create `tests/e2e/monitoring-journey.mjs`: hành trình mục tiêu, mobile và strict-network.
- Modify `tests/a11y/a11y.spec.ts`: thêm đúng Alerts vào matrix axe.
- Modify `tests/visual/lotus.spec.ts`: thêm đúng Alerts vào snapshot matrix.

---

### Task 1: Metric contract — ba số, ba định nghĩa

**Files:**
- Create: `src/features/monitoring/monitoringMetrics.ts`
- Create: `tests/unit/monitoring-journey.test.mjs`

**Interfaces:**
- Consumes: `Activity`, `SOON_DAYS`, `vmpToday`, `classifyVmpDeadline`, `buildTimelineSummary`, `qrmRpn`, `qrmLevel`.
- Produces:

```ts
export type MonitoringScreenId = "overview" | "timeline" | "alerts";
export interface MonitoringSignatureMetrics {
  vmpOverdue: number;
  phaseOverdue: number;
  highRisk: number;
}
export const MONITORING_SCREEN_COPY: Record<MonitoringScreenId, {
  title: string; metricLabel: string; description: string;
}>;
export function buildMonitoringSignatureMetrics(
  acts: readonly Activity[], now?: Date,
): MonitoringSignatureMetrics;
```

- [ ] **Step 1: Viết unit test đỏ khóa sự khác nhau của ba công thức**

Tạo `tests/unit/monitoring-journey.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildMonitoringSignatureMetrics,
  MONITORING_SCREEN_COPY,
} from "../../src/features/monitoring/monitoringMetrics.ts";

import { vmpToday } from "../../src/constants/vmp.ts";

const now = vmpToday();
const dateAt = (offset) => {
  const date = new Date(now);
  date.setDate(date.getDate() + offset);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const base = { type: "PV", state: "active", crit: "Cao", score: 8 };
const acts = [
  { ...base, id: "vmp-over", code: "VMP-OVER", st: "over", dlVmp: dateAt(-1), target: dateAt(-1), _raw: {} },
  { ...base, id: "phase-over", code: "PHASE-OVER", st: "prog", dlVmp: dateAt(60), target: dateAt(3), _raw: {} },
  { ...base, id: "done", code: "DONE", st: "done", dlVmp: dateAt(-30), target: dateAt(-30), _raw: {} },
];

test("monitoring signatures keep three business meanings distinct", () => {
  const result = buildMonitoringSignatureMetrics(acts, now);
  assert.deepEqual(result, { vmpOverdue: 1, phaseOverdue: 2, highRisk: 2 });
});

test("monitoring labels do not collapse to Quá hạn", () => {
  assert.deepEqual(
    Object.values(MONITORING_SCREEN_COPY).map((item) => item.metricLabel),
    ["Trễ đích VMP", "Có pha bị trễ", "Rủi ro cao cần xem"],
  );
});
```

- [ ] **Step 2: Chạy test và xác nhận đỏ vì module chưa tồn tại**

Run: `node --import tsx --test tests/unit/monitoring-journey.test.mjs`

Expected: FAIL `ERR_MODULE_NOT_FOUND` cho `monitoringMetrics.ts`.

- [ ] **Step 3: Cài đặt helper bằng đúng model nghiệp vụ hiện có**

```ts
import { SOON_DAYS, vmpToday } from "../../constants/vmp.ts";
import { buildTimelineSummary } from "../timeline/timelineSummaryModel.ts";
import { classifyVmpDeadline } from "../../lib/vmpDeadlineModel.ts";
import type { Activity } from "../../types/domain.ts";
import { qrmLevel, qrmRpn } from "../../utils/helpers.ts";

export type MonitoringScreenId = "overview" | "timeline" | "alerts";
export interface MonitoringSignatureMetrics {
  vmpOverdue: number; phaseOverdue: number; highRisk: number;
}
export const MONITORING_SCREEN_COPY = {
  overview: { title: "Tổng quan VMP", metricLabel: "Trễ đích VMP", description: "Có chuyện gì?" },
  timeline: { title: "Dòng thời gian", metricLabel: "Có pha bị trễ", description: "Kẹt ở đâu, khi nào?" },
  alerts: { title: "Cảnh báo & ưu tiên", metricLabel: "Rủi ro cao cần xem", description: "Cần xử lý gì trước?" },
} as const;
export function buildMonitoringSignatureMetrics(
  acts: readonly Activity[], now: Date = vmpToday(),
): MonitoringSignatureMetrics {
  return {
    vmpOverdue: acts.filter((a) => classifyVmpDeadline(a, now, SOON_DAYS).kind === "overdue").length,
    phaseOverdue: buildTimelineSummary(acts, now).quaHan,
    highRisk: acts.filter((a) => qrmLevel(qrmRpn(a)) === "cao").length,
  };
}
```

Không thêm `state !== done` riêng: `qrmRpn` hiện đã trả 0 cho done/skipped.

- [ ] **Step 4: Chạy xanh và đối chiếu fixture với model phase**

`phase-over` có đích `T+3`; model hiện hành suy mốc thẩm định ở `T-4`, nên hạng mục này trễ pha nhưng chưa trễ đích VMP. `vmp-over` trễ cả đích lẫn phase. Không thay fixture thành trạng thái giả lập khác model.

Run: `node --import tsx --test tests/unit/monitoring-journey.test.mjs tests/unit/timeline-summary-model.test.mjs`

Expected: PASS.

- [ ] **Step 5: Scoped checkpoint**

Run: `git diff --check -- src/features/monitoring/monitoringMetrics.ts tests/unit/monitoring-journey.test.mjs`

Review: `git diff -- src/features/monitoring/monitoringMetrics.ts tests/unit/monitoring-journey.test.mjs`

---

### Task 2: Monitoring Journey Switcher dùng chung

**Files:**
- Create: `src/features/monitoring/MonitoringJourneyNav.tsx`
- Create: `src/features/monitoring/monitoring.css`
- Modify: `src/main.tsx:14-23`
- Modify: `src/App.tsx:1847-1866, 2188-2246`
- Test: `tests/unit/monitoring-journey.test.mjs`

**Interfaces:**
- Consumes: `MonitoringScreenId`, `MonitoringSignatureMetrics`, `MONITORING_SCREEN_COPY`.
- Produces:

```ts
export interface MonitoringJourneyNavProps {
  current: MonitoringScreenId;
  metrics: MonitoringSignatureMetrics;
  canView: (screen: MonitoringScreenId) => boolean;
  onNavigate: (screen: MonitoringScreenId) => void;
  scopeLabel?: string;
}
```

- [ ] **Step 1: Thêm test SSR đỏ cho semantic và quyền fail-closed**

```js
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MonitoringJourneyNav from "../../src/features/monitoring/MonitoringJourneyNav.tsx";

test("journey nav renders allowed screens and marks current screen", () => {
  const html = renderToStaticMarkup(React.createElement(MonitoringJourneyNav, {
    current: "timeline",
    metrics: { vmpOverdue: 3, phaseOverdue: 5, highRisk: 2 },
    canView: (screen) => screen !== "alerts",
    onNavigate: () => {}, scopeLabel: "Theo phạm vi chung",
  }));
  assert.match(html, /aria-label="Ba màn giám sát"/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /Có pha bị trễ/);
  assert.doesNotMatch(html, /Rủi ro cao cần xem/);
});
```

- [ ] **Step 2: Chạy đỏ**

Run: `node --import tsx --test tests/unit/monitoring-journey.test.mjs`

Expected: FAIL vì component chưa tồn tại.

- [ ] **Step 3: Tạo component trình bày, không chứa công thức**

Dùng `LayoutDashboard`, `GanttChartSquare`, `ShieldAlert` và map:

```ts
const ITEMS = [
  { id: "overview", metric: "vmpOverdue", Icon: LayoutDashboard },
  { id: "timeline", metric: "phaseOverdue", Icon: GanttChartSquare },
  { id: "alerts", metric: "highRisk", Icon: ShieldAlert },
] as const;
```

Render `<nav aria-label="Ba màn giám sát">`; lọc `ITEMS` bằng `canView`; mỗi native button có `aria-current={active ? "page" : undefined}` và gọi `onNavigate(id)`. Nội dung mỗi item theo thứ tự icon → title/description → value/metricLabel. Thêm một chuỗi tóm tắt visually-hidden `aria-live="polite"` để thông báo ba count sau khi bộ lọc chung đổi, không đặt live region quanh toàn bộ nav.

- [ ] **Step 4: Tạo CSS Botanical Intelligence scope riêng**

```css
.monitoring-journey { position: relative; isolation: isolate; }
.monitoring-journey__rail { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.monitoring-journey__item { min-height: 72px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; text-align: left; }
.monitoring-journey__item:focus-visible { outline: 3px solid var(--lp-focus); outline-offset: 3px; }
@media (max-width: 720px) {
  .monitoring-journey__rail { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; }
  .monitoring-journey__item { min-width: min(86vw, 330px); min-height: 72px; scroll-snap-align: start; }
}
@media (prefers-reduced-motion: reduce) { .monitoring-journey__item { transition: none; transform: none; } }
```

Thêm leaf/radial accent bằng đúng `--lp-surface`, `--lp-surface-2`, `--lp-plum`, `--lp-gold`, `--lp-line`, `--lp-focus` đang có trong `lotus-tokens.css`; không hard-code một palette thứ hai.

- [ ] **Step 5: Tích hợp đúng một switcher trong `App`**

Import CSS ở `main.tsx`. Trong `App`:

```ts
const monitoringMetrics = useMemo(
  () => buildMonitoringSignatureMetrics(filteredActs), [filteredActs],
);
const monitoringView = (["overview", "timeline", "alerts"] as const).find((id) => id === view);
```

Render một lần trước nội dung ba view:

```tsx
{monitoringView && <MonitoringJourneyNav
  current={monitoringView}
  metrics={monitoringMetrics}
  canView={(screen) => access.canView(screen)}
  onNavigate={setView}
  scopeLabel="Theo phạm vi chung"
/>}
```

Không đặt switcher trong từng page.

- [ ] **Step 6: Chạy unit/typecheck/checkpoint**

Run:

```powershell
node --import tsx --test tests/unit/monitoring-journey.test.mjs
npm run typecheck
git diff --check -- src/features/monitoring src/main.tsx src/App.tsx tests/unit/monitoring-journey.test.mjs
```

Expected: PASS.

---

### Task 3: Overview — hero trước, ba thẻ hỗ trợ

**Files:**
- Modify: `src/App.tsx:1024-1205`
- Modify: `src/features/monitoring/monitoring.css`
- Test: `tests/unit/monitoring-journey.test.mjs`

**Interfaces:**
- Consumes: `Overview`, `classifyVmpDeadline`, `runDataQualityChecks`, `overviewTarget` hiện có.
- Produces: `.b-hero`, `.b-k1`, `.b-k2`, `.b-k4`; loại bỏ `.b-k3`.

- [ ] **Step 1: Thêm static contract test đỏ**

```js
import { readFile } from "node:fs/promises";
test("overview owns completion without duplicate support KPI", async () => {
  const source = await readFile(new URL("../../src/App.tsx", import.meta.url), "utf8");
  assert.match(source, /label="Trễ đích VMP"/);
  assert.match(source, /label="Tới hạn đích VMP 30 ngày"/);
  assert.doesNotMatch(source, /cls="b-k3"[^>]*label="Hoàn thành VMP"/s);
});
```

- [ ] **Step 2: Chạy đỏ**

Run: `node --import tsx --test tests/unit/monitoring-journey.test.mjs`

Expected: FAIL do copy/card cũ.

- [ ] **Step 3: Xóa metric trùng và dữ liệu chỉ phục vụ nó**

- Bỏ `theoThang`, vòng `thang` và `StatTile cls="b-k3"`.
- Đổi `.b-k1` thành `Trễ đích VMP`.
- Đổi `.b-k2` thành `Tới hạn đích VMP 30 ngày`.
- Giữ vòng năm là nơi duy nhất hiển thị tỷ lệ hoàn thành lớn.

- [ ] **Step 4: Làm rõ thẻ chất lượng dữ liệu**

Giữ checker hiện hành, đổi sub:

```tsx
sub={soLoiDl
  ? `${soLoiDl} vấn đề được phát hiện · trong đó ${mismatched.length} lệch pha`
  : "Không phát hiện vấn đề nào"}
```

- [ ] **Step 5: Đổi grid để thứ tự nhìn trùng DOM**

Mobile: hero → k1 → k2 → k4 → Vali → việc gấp → xem sâu. Tablet: hero full, k1/k2, k4 full. Desktop: hero full trước, rồi ba thẻ `k1 k2 k4`. Dùng đúng grid-area hiện hữu (`sau` nếu CSS đang đặt tên đó), không tạo selector toàn cục ngoài Overview.

- [ ] **Step 6: Chạy test/typecheck/checkpoint**

Run:

```powershell
node --import tsx --test tests/unit/monitoring-journey.test.mjs tests/unit/ui-ux-baseline.test.mjs
npm run typecheck
git diff --check -- src/App.tsx src/features/monitoring/monitoring.css tests/unit/monitoring-journey.test.mjs
```

Expected: PASS; ba support tiles.

---

### Task 4: Timeline — dải metric gọn và một cổng 2D/3D

**Files:**
- Modify: `src/pages/TimelinePage.tsx:1718-1790`
- Modify: `src/features/monitoring/monitoring.css`
- Test: `tests/unit/monitoring-journey.test.mjs`

**Interfaces:**
- Consumes: `tomTat`, `setStatus`, `moHoSo`, `kham3D`, `doiKham3D`, `WorkloadSpace3D`, `onOpenWorkloadCell`.
- Produces: ba metric Timeline; outer disclosure `Mở bản đồ tải việc`; component bên trong sở hữu mode 2D/3D.

- [ ] **Step 1: Thêm static contract test đỏ**

```js
test("timeline has three task metrics and delegates 2D/3D mode", async () => {
  const source = await readFile(new URL("../../src/pages/TimelinePage.tsx", import.meta.url), "utf8");
  assert.match(source, /Mở bản đồ tải việc/);
  assert.doesNotMatch(source, /macDinh3D/);
  assert.doesNotMatch(source, /id: "hoan-thanh"/);
});
```

- [ ] **Step 2: Chạy đỏ**

Run: `node --import tsx --test tests/unit/monitoring-journey.test.mjs`

Expected: FAIL do còn bốn metric và ép 3D.

- [ ] **Step 3: Giữ đúng ba metric tác vụ**

Giữ `qua-han` nhưng đổi label `Có pha bị trễ`, `sap-den-han`, `dang-lam`; giữ nguyên callback `setStatus("over"|"soon"|"prog")`. Xóa item `hoan-thanh`; done vẫn còn trong filter/workbench.

- [ ] **Step 4: Gộp điều khiển bản đồ**

Outer button đọc `Mở bản đồ tải việc` / `Thu gọn bản đồ tải việc`. Render:

```tsx
<WorkloadSpace3D
  acts={timelineViewItems.workloadItems}
  nam={year}
  giamChuyenDong={giamChuyenDong}
  onOpenCell={onOpenWorkloadCell}
/>
```

Không truyền `macDinh3D`; heatmap 2D mở trước và chỉ component bên trong có `Xem bản đồ 3D`.

- [ ] **Step 5: Làm hierarchy gọn**

Scope `.timeline-page-shell > .lp-metric-grid` thành ba cột thấp ở desktop; mobile không dưới 44px. Narrative dùng botanical border và chỉ nút mã hồ sơ là CTA chính.

- [ ] **Step 6: Chạy test/typecheck/checkpoint**

Run:

```powershell
node --import tsx --test tests/unit/monitoring-journey.test.mjs tests/unit/timeline-summary-model.test.mjs
npm run typecheck
git diff --check -- src/pages/TimelinePage.tsx src/features/monitoring/monitoring.css tests/unit/monitoring-journey.test.mjs
```

Expected: PASS; không đổi renderer/population.

---

### Task 5: Alerts — ba ưu tiên chính, công cụ phụ đóng mặc định

**Files:**
- Modify: `src/pages/AlertsPage.tsx:14-28, 330-690`
- Modify: `src/features/monitoring/monitoring.css`
- Test: `tests/unit/monitoring-journey.test.mjs`

**Interfaces:**
- Consumes: `byKind`, bucket/filter state, `shown`, `exportCsv`, `aiConfigured`, QRM hiện có.
- Produces: `.alerts-priority-rail`, `details.alerts-tools`, requal compact, copy AI an toàn.

- [ ] **Step 1: Thêm static contract test đỏ**

```js
test("alerts keeps three primary priorities and hides setup internals", async () => {
  const source = await readFile(new URL("../../src/pages/AlertsPage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /KpiCard/);
  assert.doesNotMatch(source, /AI_SETUP_HINT/);
  assert.match(source, /Tìm kiếm & công cụ/);
  assert.match(source, /Gom theo đối tượng/);
  assert.match(source, /Theo từng hạng mục/);
});
```

- [ ] **Step 2: Chạy đỏ**

Run: `node --import tsx --test tests/unit/monitoring-journey.test.mjs`

Expected: FAIL do card emoji/filter/AI copy cũ.

- [ ] **Step 3: Thay bốn KpiCard bằng ba button semantic**

Bỏ import `KpiCard`; tạo:

```ts
const priorityCards = [
  { id: "over", Icon: AlertCircle, label: "Cần xử lý ngay", sub: "Hạng mục đã quá hạn" },
  { id: "soon", Icon: CalendarClock, label: "Theo dõi 30 ngày", sub: `Tới hạn trong ${SOON_DAYS} ngày` },
  { id: "risk", Icon: ShieldAlert, label: "Rủi ro cao cần QA xem", sub: "RPN ≥ 15 · chưa đóng" },
] as const;
```

Render native button với `aria-pressed={bucket === item.id}`, count `byKind[item.id].length`, icon vector; không emoji.

- [ ] **Step 4: Hạ requal thành hành động phụ có điều kiện**

Nếu `byKind.requal.length > 0`, render button compact `Tái thẩm định (N)` gọi `setBucket("requal")`; nếu bằng 0, render text `Chưa có lịch tái thẩm định sắp tới`, không card lớn.

- [ ] **Step 5: Tách lọc chính và công cụ phụ**

Giữ hàng chính: bộ phận, mức rủi ro, người, thời gian, nút xóa lọc và group:

```tsx
<div role="group" aria-label="Cách hiển thị cảnh báo">
  <button type="button" aria-pressed={gom} onClick={() => setGom(true)}>Gom theo đối tượng</button>
  <button type="button" aria-pressed={!gom} onClick={() => setGom(false)}>Theo từng hạng mục</button>
</div>
```

Đặt search/sort/export vào disclosure đóng mặc định:

```tsx
<details className="alerts-tools">
  <summary>Tìm kiếm &amp; công cụ</summary>
  <div className="alerts-tools__body">{/* input, sort select, export hiện có */}</div>
</details>
```

- [ ] **Step 6: Ẩn chi tiết cấu hình AI khỏi người dùng nghiệp vụ**

Bỏ `AI_SETUP_HINT` khỏi import và body/title. Dùng:

```ts
const AI_UNAVAILABLE = "Phân tích AI chưa được bật. Dữ liệu cảnh báo vẫn đầy đủ.";
```

Giữ button disabled khi chưa configured; không đổi `chayPhanTichAi`, mail modal hoặc network boundary.

- [ ] **Step 7: CSS Alerts responsive/accessibility**

Ba cột desktop, một cột/scroll snap mobile; button ≥64px; `summary` ≥44px và có focus ring. Giữ tab Danh sách/QRM và `QrmView` nguyên vẹn.

- [ ] **Step 8: Chạy test/typecheck/checkpoint**

Run:

```powershell
node --import tsx --test tests/unit/monitoring-journey.test.mjs
npm run typecheck
git diff --check -- src/pages/AlertsPage.tsx src/features/monitoring/monitoring.css tests/unit/monitoring-journey.test.mjs
```

Expected: PASS; không còn `KpiCard`/`AI_SETUP_HINT` trong Alerts.

---

### Task 6: Một E2E hành trình Giám sát và regression hẹp

**Files:**
- Create: `tests/e2e/monitoring-journey.mjs`
- Modify: `tests/a11y/a11y.spec.ts:55-61`
- Modify: `tests/visual/lotus.spec.ts:80-88`

**Interfaces:**
- Consumes: fake Supabase/browser harness từ `tests/e2e/ui-ux-baseline.mjs`, dev server `http://127.0.0.1:5199`.
- Produces: E2E switcher, hierarchy, controls không trùng, mobile và strict-network.

- [ ] **Step 1: Tạo harness mục tiêu**

Dùng cùng fake auth/Supabase factory; đặt `window.__REACT_GRAB_DISABLED__ = true`; seed Admin; chỉ cho phép local và fake Supabase đã khai báo; gom request ngoài phạm vi vào `chanNgoai`. Không gọi network thật.

- [ ] **Step 2: Assert desktop qua ba màn**

Tạo đúng hai helper Puppeteer sau rồi dùng các selector này:

```js
async function clickButtonByText(page, text) {
  const clicked = await page.$$eval("button", (buttons, expected) => {
    const button = buttons.find((item) => item.textContent?.includes(expected));
    button?.click();
    return Boolean(button);
  }, text);
  assert.equal(clicked, true, `missing button: ${text}`);
}

async function buttonsContaining(page, root, text) {
  return page.$$eval(`${root} button`, (buttons, expected) =>
    buttons.filter((item) => item.textContent?.includes(expected)).length, text);
}
```

Sau đó triển khai assertion desktop:

```js
await page.goto("http://127.0.0.1:5199/#v=overview");
await page.waitForSelector('[aria-label="Ba màn giám sát"]');
assert.equal(await page.$$eval('.monitoring-journey__item', (xs) => xs.length), 3);
assert.equal(await page.$$eval('.b-k3', (xs) => xs.length), 0);
assert.ok(await page.$eval('.b-hero', (el) => el.getBoundingClientRect().top)
  < await page.$eval('.b-k1', (el) => el.getBoundingClientRect().top));

await clickButtonByText(page, "Dòng thời gian");
assert.equal(await page.$$eval('.timeline-page-shell > .lp-metric-grid .lp-metric', (xs) => xs.length), 3);
assert.equal(await buttonsContaining(page, '[data-timeline-3d]', "Xem bản đồ 3D"), 0);
await clickButtonByText(page, "Mở bản đồ tải việc");
assert.equal(await buttonsContaining(page, '[data-timeline-3d]', "Xem bản đồ 3D"), 1);

await clickButtonByText(page, "Cảnh báo & ưu tiên");
assert.equal(await page.$$eval('.alerts-priority-rail > button', (xs) => xs.length), 3);
assert.equal(await page.$eval('details.alerts-tools', (el) => el.hasAttribute("open")), false);
assert.equal((await page.content()).includes("VITE_N8N"), false);
```

Tạo helper `clickButtonByText` và `buttonsContaining` trong file test; không dùng selector Playwright trong Puppeteer.

- [ ] **Step 3: Assert mobile 390px**

```js
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
assert.ok(overflow <= 1, `horizontal overflow: ${overflow}px`);
const smallTargets = await page.$$eval(
  '.monitoring-journey button, .alerts-priority-rail button, details.alerts-tools > summary',
  (els) => els.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width < 43.5 || r.height < 43.5;
  }).map((el) => el.textContent?.trim()),
);
assert.deepEqual(smallTargets, []);
assert.deepEqual(chanNgoai, []);
```

- [ ] **Step 4: Chạy E2E mục tiêu và lưu screenshot**

Run:

```powershell
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests/e2e/monitoring-journey.mjs
```

Lưu `monitoring-overview-1440.png`, `monitoring-timeline-1024.png`, `monitoring-alerts-390.png` vào artifact/temp hiện hành. Expected: PASS, `chanNgoai=[]`.

- [ ] **Step 5: Mở rộng đúng matrix a11y/visual**

Thêm vào a11y:

```ts
{ ten: "canh-bao", hash: "#v=alerts", dangNhap: true },
```

Thêm vào visual:

```ts
["alerts", "canh-bao"],
```

- [ ] **Step 6: Chạy đúng ba màn**

```powershell
npx playwright test -c playwright.a11y.config.ts --grep "axe · (tong-quan|timeline|canh-bao)"
npx playwright test -c playwright.visual.config.ts --grep "(tong-quan|timeline|canh-bao) · (light|dark)"
```

Expected: không critical/serious axe violation. Lần visual đầu tạo diff mong đợi do redesign; mở đúng sáu ảnh diff light/dark của ba màn để review, rồi cập nhật và xác minh lại bằng:

```powershell
npx playwright test -c playwright.visual.config.ts --grep "(tong-quan|timeline|canh-bao) · (light|dark)" --update-snapshots
npx playwright test -c playwright.visual.config.ts --grep "(tong-quan|timeline|canh-bao) · (light|dark)"
```

Không cập nhật snapshot ngoài ba màn và không chạy broad suite.

---

### Task 7: Gate cuối và bàn giao local

**Files:**
- Review only: toàn bộ file trong File Map.

**Interfaces:**
- Consumes: deliverable Task 1–6.
- Produces: bằng chứng build/typecheck/test và danh sách file sửa.

- [ ] **Step 1: Unit mục tiêu**

Run: `node --import tsx --test tests/unit/monitoring-journey.test.mjs tests/unit/timeline-summary-model.test.mjs tests/unit/ui-ux-baseline.test.mjs`

Expected: PASS.

- [ ] **Step 2: E2E hành trình**

Run: `$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'; node tests/e2e/monitoring-journey.mjs`

Expected: PASS, strict-network rỗng.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Build**

Run: `npm run build`

Nếu và chỉ nếu lỗi `EPERM`/ACL khi Vite đọc `.env`, chạy fallback cụ thể sau; giá trị chỉ dùng lúc bundle local và không ghi vào file:

```powershell
$vmpEnvDir = New-Item -ItemType Directory -Path (Join-Path $env:TEMP ("vmp-vite-env-" + [guid]::NewGuid()))
$env:VMP_BUILD_ENV_DIR = $vmpEnvDir.FullName
$env:VITE_SUPABASE_URL = 'https://build.invalid'
$env:VITE_SUPABASE_ANON = 'local-build-anon'
node -e "import('vite').then(({build}) => build({ envDir: process.env.VMP_BUILD_ENV_DIR }))"
```

Expected: exit 0. Ghi rõ build chuẩn bị chặn bởi ACL và fallback PASS; không sửa `.env` và không in cấu hình thật ra log.

- [ ] **Step 5: Xác nhận lint gate của repository**

Run: `npm pkg get scripts.lint`

Expected: không có `scripts.lint` trong `package.json`. Báo `lint: không có script cấu hình`; không tự thêm ESLint hoặc chạy formatter toàn repo trong đợt UI hẹp này.

- [ ] **Step 6: Diff gate**

```powershell
git diff --check
git status --short
git diff -- src/features/monitoring src/main.tsx src/App.tsx src/pages/TimelinePage.tsx src/pages/AlertsPage.tsx tests/unit/monitoring-journey.test.mjs tests/e2e/monitoring-journey.mjs tests/a11y/a11y.spec.ts tests/visual/lotus.spec.ts
```

Expected: không whitespace error; giữ nguyên dirty changes ngoài phạm vi.

- [ ] **Step 7: Kiểm duyệt trực quan local**

Xác nhận 390/1024/1440, light/dark: hero đúng thứ tự; Overview không lặp hoàn thành; Timeline không có hai nút cùng nghĩa mở 3D; Alerts chỉ ba ưu tiên chính và tools đóng mặc định; ba metric không dùng chung nhãn “Quá hạn”; không overflow/che chữ.

- [ ] **Step 8: Báo cáo bàn giao**

Báo file sửa và lý do; mục trùng đã gộp; quyền/công thức/boundary giữ nguyên; lệnh và kết quả thực tế; đường dẫn screenshot; lỗi pre-existing ngoài phạm vi nếu có. Không commit/push.

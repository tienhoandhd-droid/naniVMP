# Desktop UX Data-First Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khôi phục cổng chất lượng desktop và đưa dữ liệu/hành động đầu tiên của Việc hôm nay, Cập nhật tiến độ và Báo cáo vào fold đầu mà không đổi dữ liệu hay nghiệp vụ VMP.

**Architecture:** Thực hiện tuần tự theo hai lớp: guardrail phát hành dùng chung, sau đó ba lát UI độc lập theo màn. Mỗi lát chỉ nén bố cục desktop bằng CSS/component cục bộ, giữ nguyên model, quyền, callback và export hiện có; geometry E2E tại `1366×768` là acceptance contract.

**Tech Stack:** Node 24.18.0, React 18.3, TypeScript 7, Vite 6, Node test runner + `tsx`, Playwright 1.62, Puppeteer Core, axe-core/playwright, CSS Lotus Pearl hiện có.

## Global Constraints

- Chỉ desktop tại `1366×768`, `1440×900`, `1920×1080`; không thiết kế lại mobile và không thêm baseline mobile.
- Tạm thời tuyệt đối không sửa hoặc thêm test riêng cho `src/pages/TimelinePage.tsx`, `src/features/monitoring/LongMon*`, `src/features/monitoring/long-mon-race.css`, model Long Môn, `MonitoringJourneyNav.tsx` hay `monitoring.css`.
- Visual matrix có thể được hợp nhất contract, nhưng không update, seal hoặc commit baseline trong tranche này.
- Giữ Lotus Pearl, Vali và CPC1 HN; không thay logo, nhân vật, copy nghiệp vụ hay semantic colors.
- Không đổi schema, migration, RLS, RPC, Supabase, công thức nghiệp vụ, quyền cập nhật hoặc dữ liệu/file xuất báo cáo.
- Không thêm framework UI, chart library, runtime dependency hoặc dev dependency mới; không sửa `package-lock.json`.
- Node CI và kiểm chứng là `24.18.0`; timezone nghiệp vụ/visual là `Asia/Bangkok`.
- Chữ mang thông tin hoặc điều khiển tối thiểu `12px`; radius chỉ `10px`, `16–18px`, `24px`, và `999px` cho pill.
- Button/input/details/summary thật, label thật, focus visible; không dựa vào màu hoặc hover để truyền nghĩa.
- Không push, merge, deploy, dispatch workflow hoặc mutate production.
- Mỗi task đi RED → xác nhận fail đúng lý do → GREEN tối thiểu → focused regression → independent review → commit cục bộ.
- Preflight trước mỗi task: `git status --short`; sau đó `git diff --name-only HEAD -- <files của task>`. Dừng nếu có thay đổi không thuộc ownership đã khai báo.

## Architecture, dependencies, shared files/state

| Task | File triển khai được sở hữu | Phụ thuộc | Parallelism |
|---|---|---|---|
| 1 | `scripts/check-design-drift.mjs` | Không | Chạy đầu tiên |
| 2 | visual contract, runtime, workflows, package scripts | Task 1 để CI gọi drift đã test | Tuần tự; shared CI state |
| 3 | `TodayCommandCenter.tsx`, `today.css` | Task 2 | Tuần tự; không file chung với Task 4/5 |
| 4 | `UpdatePage.tsx`, `progress.css` | Checkpoint Task 3 | Tuần tự; không file chung với Task 3/5 |
| 5 | `ReportsView.tsx`, `reports.css` | Checkpoint Task 4 | Tuần tự; không file chung với Task 3/4 |

`package.json`, `.github/workflows/*`, `tests/visual/lotus.spec.ts` và `scripts/check-visual-runtime.mjs` chỉ Task 2 sửa. Task 3–5 không sửa shared shell/App/index CSS; CSS Báo cáo mới được import cục bộ từ `ReportsView.tsx`. Primary planner inspect mọi diff và chạy `git diff --name-only 6fdfe015..HEAD | rg 'TimelinePage|LongMon|long-mon|MonitoringJourney|monitoring\.css'`; expected không có output.

## Rollback

- Toàn bộ: tag local `backup/ui-desktop-before-refinement-20260831` tại `6fdfe015` hoặc bundle `/home/admin1/VMP/backups/naniVMP-ui-before-desktop-refinement-20260831.bundle` đã verify.
- Theo lát: revert commit Task 5 → 1 theo thứ tự ngược; không `git reset --hard` và không xóa worktree.
- Trước revert UI, xác nhận commit chỉ chứa file màn tương ứng và test của nó. Không kéo Timeline/Long Môn vào rollback.
- Nếu visual contract chuyển sang 45 nhưng baseline vẫn 39, ghi `visual/visual:contract` là release gate còn mở; không sửa PNG/seal bằng tay và không gọi branch release-ready.

## Review checkpoints

1. Sau Task 2: reviewer độc lập kiểm drift fixture, matrix count/tree contract, workflow DAG và việc build phụ thuộc axe; primary rerun targeted tests.
2. Sau Task 3: reviewer UI kiểm Vali/Lotus và fold Việc hôm nay ở ba desktop viewport; primary rerun Today geometry.
3. Sau Task 4: reviewer kiểm quyền/callback Cập nhật không đổi, chữ ≥12px và row đầu trong fold; primary rerun Progress geometry.
4. Sau Task 5: reviewer kiểm bốn control + ba export action không đổi, disclosure bàn phím và KPI đầu trong fold. Final Sol review toàn diff, rollback và chứng cứ không chạm Timeline/Long Môn.

---

### Task 1: Design-drift guardrail bắt chữ nhỏ và background trắng nhiều dòng

**Files:**
- Modify: `scripts/check-design-drift.mjs`
- Create: `tests/unit/design-drift.test.mjs`

**Interfaces:**
- CLI production vẫn là `node scripts/check-design-drift.mjs`.
- Test interface: `node scripts/check-design-drift.mjs --root <absolute-fixture-root>`.
- Exit `1` và liệt kê file/dòng/tổng lỗi khi vi phạm; exit `0` khi sạch.

- [ ] **Step 1: Viết RED chạy artifact thật**

```js
// tests/unit/design-drift.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = new URL("../..", import.meta.url);
const run = (fixture) => spawnSync(process.execPath,
  ["scripts/check-design-drift.mjs", "--root", fixture],
  { cwd: ROOT, encoding: "utf8" });

test("drift reports sub-12px text and multiline white background as two violations", (t) => {
  const fixture = path.join(tmpdir(), `vmp-drift-${process.pid}-${Date.now()}`);
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  mkdirSync(path.join(fixture, "src", "features", "probe"), { recursive: true });
  writeFileSync(path.join(fixture, "src", "features", "probe", "probe.css"),
    ".probe { font-size: 11px; }\n.panel {\n background:\n #fff;\n}\n");
  const result = run(fixture);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /2 vi phạm luật thiết kế/u);
  assert.match(result.stderr, /chữ 11px nhỏ hơn 12px/u);
  assert.match(result.stderr, /nền trắng literal/u);
});

test("drift accepts semantic background and 12px text", (t) => {
  const fixture = path.join(tmpdir(), `vmp-drift-clean-${process.pid}-${Date.now()}`);
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  mkdirSync(path.join(fixture, "src", "features", "probe"), { recursive: true });
  writeFileSync(path.join(fixture, "src", "features", "probe", "probe.css"),
    ".probe { font-size: 12px; background: var(--lp-surface); border-radius: 10px; }\n");
  const result = run(fixture);
  assert.equal(result.status, 0, result.stderr);
});
```

- [ ] **Step 2: Chạy RED**

Run: `node --import tsx --test tests/unit/design-drift.test.mjs`

Expected: FAIL vì CLI chưa nhận `--root` và nền trắng hiện bị quét theo từng dòng.

- [ ] **Step 3: GREEN tối thiểu**

Trong script, parse duy nhất zero args hoặc `--root` + absolute path; import `node:path`. Quét background trên toàn nội dung đã mask comment nhưng giữ newline, regex cho `background/background-color` theo sau whitespace/newline rồi `#fff/#ffffff/white/rgb(255...)`; tính line từ `source.slice(0, match.index).split("\n").length`. Giữ nguyên phạm vi migration, radius/emoji/hex rules.

- [ ] **Step 4: Verify và commit**

Run: `node --import tsx --test tests/unit/design-drift.test.mjs && npm run drift`

Expected: fixture `2 tests` PASS; repo scan không crash/không báo 0 file.

```bash
git add scripts/check-design-drift.mjs tests/unit/design-drift.test.mjs
git commit -m "test(ui): khóa guardrail drift desktop"
```

### Task 2: Một visual matrix contract và release gate drift/axe

**Files:**
- Create: `scripts/visual-matrix-contract.mjs`
- Modify: `tests/visual/lotus.spec.ts`
- Modify: `playwright.visual.config.ts`
- Modify: `scripts/check-visual-runtime.mjs`
- Modify: `tests/unit/visual-runtime-contract.test.mjs`
- Create: `tests/unit/release-workflow-contract.test.mjs`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/visual-baseline.yml`
- Modify: `package.json`

**Interfaces:**
- `VISUAL_SCREENS`, `VISUAL_THEMES`, `VISUAL_PROJECTS`, `VISUAL_BASELINE_COUNT` là một nguồn contract; current count `7 × 2 × 3 + login × 3 = 45`.
- `--count` in `45`; `--verify-output <log>` chỉ pass khi Playwright báo đúng 45.
- Không thêm/sửa case Timeline; chỉ thay danh sách hiện có bằng import contract.
- `production-build.needs` gồm `static-quality`, DB contract, E2E mock và `a11y`.

- [ ] **Step 1: RED matrix và workflow DAG**

Thêm test:

```js
test("visual matrix derives 45 Linux baselines", async () => {
  const c = await import("../../scripts/visual-matrix-contract.mjs");
  assert.equal(c.VISUAL_SCREENS.length, 7);
  assert.deepEqual(c.VISUAL_THEMES, ["light", "dark"]);
  assert.equal(c.VISUAL_PROJECTS.length, 3);
  assert.equal(c.VISUAL_BASELINE_COUNT, 45);
});
```

`tests/unit/release-workflow-contract.test.mjs` đọc job blocks và assert hành vi DAG:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const yml = await readFile(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8");
const block = (a, b) => yml.slice(yml.indexOf(`  ${a}:`), b ? yml.indexOf(`  ${b}:`) : yml.length);
test("release build is gated by drift and axe", () => {
  assert.match(block("static-quality", "source-access-db-contract"), /npm run drift/u);
  assert.match(block("a11y", "production-build"), /needs:\s*static-quality[\s\S]*npm run a11y/u);
  const build = block("production-build", "deploy");
  for (const need of ["static-quality", "source-access-db-contract", "e2e-mock", "a11y"])
    assert.match(build, new RegExp(`- ${need}`));
});
```

- [ ] **Step 2: Chạy RED**

Run: `node --import tsx --test tests/unit/visual-runtime-contract.test.mjs tests/unit/release-workflow-contract.test.mjs`

Expected: FAIL missing matrix module và missing `a11y`/`npm run drift` gate.

- [ ] **Step 3: GREEN contract/workflows**

Tạo contract với bảy route/name hiện hữu (`today`, `overview`, `source`, `progress`, `timeline`, `alerts`, `reports`), hai theme và ba project `1440×900`, `1366×768`, `1920×1080`. `lotus.spec.ts` chỉ import danh sách; không sửa callback, selector hoặc expectation Timeline. Runtime/seal/fixture test dùng derived count. Baseline workflow lấy `expected_count="$(npm run --silent visual:matrix:count)"` thay mọi literal 39.

Thêm scripts `visual:matrix:count` và `visual:matrix:verify`. Trong deploy: `npm run drift` sau unit; job `a11y` cài Chromium, tạo mock env như E2E, chạy `bash scripts/with-preview.sh -- npm run a11y`; build needs `a11y`.

- [ ] **Step 4: Verify và commit**

Run: `node --import tsx --test tests/unit/visual-runtime-contract.test.mjs tests/unit/release-workflow-contract.test.mjs tests/unit/a11y-runtime-contract.test.mjs`

Run: `npm run visual:matrix:count`

Expected: tests PASS; stdout `45`.

Run: `npm run visual:contract`

Expected: FAIL rõ `expected exactly 45 ... found 39`; lifecycle còn mở là chủ đích. Không update/seal baseline.

```bash
git add scripts/visual-matrix-contract.mjs tests/visual/lotus.spec.ts playwright.visual.config.ts scripts/check-visual-runtime.mjs tests/unit/visual-runtime-contract.test.mjs tests/unit/release-workflow-contract.test.mjs .github/workflows/deploy.yml .github/workflows/visual-baseline.yml package.json
git commit -m "ci(ui): hợp nhất visual matrix và axe gate"
```

### Task 3: Việc hôm nay data-first trong fold desktop, giữ nguyên Vali

**Files:**
- Modify: `src/features/today/TodayCommandCenter.tsx`
- Modify: `src/features/today/today.css`
- Modify: `tests/unit/today-command-center.test.mjs`
- Create: `tests/e2e/today-desktop-fold.mjs`

**Interfaces:**
- `TodayCommandCenterProps`, `TodayCommandCenterContentProps`, `onOpenProgress(progressLink(row))`, bốn queue và quyền CTA không đổi.
- Thêm `data-today-first-action` vào CTA `Làm trước tiên` và `data-today-first-row` vào row đầu của nhóm đầu tiên có dữ liệu; chỉ phục vụ observable geometry, không thêm state.
- Acceptance `1366×768`: không redesign; giảm riêng chiều cao hero khoảng `80–100px` để CTA ưu tiên và row dữ liệu đầu tiên cùng có phần nhìn thấy trong viewport. Trả thêm khoảng `100–140px` cho cột Hạng mục bằng cách co cột Mã/QA/CTA; không đổi `MetricGrid` shared hoặc cấu trúc bốn KPI.

- [ ] **Step 1: RED structure test**

Trong `tests/unit/today-command-center.test.mjs`, giữ fixtures thật và thêm:

```js
test("Today marks the first business action and first queue row without changing CTA rules", () => {
  const html = render(contentProps());
  assert.equal(count(html, /data-today-first-action="true"/g), 1);
  assert.equal(count(html, /data-today-first-row="true"/g), 1);
  assert.equal(count(html, /<button[^>]*>Cập nhật tiến độ<\/button>/g), 1);
  assert.match(html, /Công chúa Vali/);
});
```

Production mutations caught: marker missing/duplicated, CTA quyền bị biến thành button đại trà, hoặc Vali bị xóa.

- [ ] **Step 2: RED geometry E2E**

Tạo `tests/e2e/today-desktop-fold.mjs` từ harness `tests/e2e/today-qa-ledger.mjs`: mock `day`, strict external network, viewport `1366×768`, route `#v=today`, wait `.hn-nhom .hn-muc`. Đo:

```js
const evidence = await page.evaluate(() => {
  const hero = document.querySelector(".hn-hero")?.getBoundingClientRect();
  const vali = document.querySelector(".hn-vali")?.getBoundingClientRect();
  const action = document.querySelector("[data-today-first-action]")?.getBoundingClientRect();
  const row = document.querySelector("[data-today-first-row]")?.getBoundingClientRect();
  return { hero, vali, action, row,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});
assert.ok(evidence.hero.top < 360 && evidence.hero.height <= 305, JSON.stringify(evidence));
assert.ok(evidence.vali.width >= 72 && evidence.vali.height >= 92, JSON.stringify(evidence));
assert.ok(evidence.action.top < 768 && evidence.row.top < 768, JSON.stringify(evidence));
assert.ok(evidence.overflow <= 1, JSON.stringify(evidence));
```

- [ ] **Step 3: Chạy RED**

Run: `node --import tsx --test tests/unit/today-command-center.test.mjs`

Expected: FAIL missing data markers.

Run: `bash scripts/with-preview.sh -- node tests/e2e/today-desktop-fold.mjs`

Expected: FAIL vì hero hiện cao khoảng `385px` và row đầu chưa vào fold; target mới giảm tối thiểu khoảng `80px`, còn không quá `305px`.

- [ ] **Step 4: GREEN component/CSS tối thiểu**

Trong `TodayQueueSection`, nhận prop `markFirstRow`; gắn marker chỉ khi `index === 0`. Ở `TodayCommandCenterContent`, tính `firstVisibleSection = nhomHien.find(section => model.sections[section].length > 0)` và truyền boolean; CTA editable/non-editable đều nhận `data-today-first-action="true"` khi `dau` tồn tại.

Trong `today.css`, chỉ thêm `@media (min-width: 1180px)`: `.hn-lotus` gap 12; `.hn-hero` padding `8px 16px`, columns `72px minmax(0,1fr) minmax(300px,.95fr)`, Vali giữ nguyên artwork/state nhưng hiển thị `72×92`, quote `20px/1.2`, gap hero 10–12px. Không sửa `.hn-hero__so .lp-metric*`, không đổi `MetricGrid`, số/copy/callback KPI.

Trong cùng desktop media query, dành chiều ngang cho tên hạng mục bằng `.hn-muc__tom-tat { grid-template-columns: 96px minmax(0,1fr) minmax(180px,.72fr) 112px; gap: 0 10px; }` và `.hn-muc__mo--inline, .hn-muc__mo--desktop { grid-template-columns: 96px minmax(0,1fr); gap: 0 10px; }`; CTA padding `0 10px`. Đây là thay đổi P1 duy nhất ngoài hero: co Mã/QA/CTA để cột tên nhận thêm khoảng `100–140px`. Không sửa block `max-width:768px`, không ẩn Vali/CTA/KPI, không đổi colors hoặc dữ liệu hàng.

- [ ] **Step 5: Verify/review/commit**

Run: `node --import tsx --test tests/unit/today-command-center.test.mjs`

Run: `bash scripts/with-preview.sh -- node tests/e2e/today-desktop-fold.mjs`

Run: `bash scripts/with-preview.sh -- node tests/e2e/today-qa-ledger.mjs`

Run: `npm run drift && npm run typecheck`

Expected: PASS; QA column/detail/update modal vẫn đúng; Vali asset/state không đổi.

```bash
git add src/features/today/TodayCommandCenter.tsx src/features/today/today.css tests/unit/today-command-center.test.mjs tests/e2e/today-desktop-fold.mjs
git commit -m "feat(today): đưa hành động đầu vào fold desktop"
```

### Task 4: Cập nhật tiến độ gọn, table-first và chữ nghiệp vụ ≥12px

**Files:**
- Modify: `src/pages/UpdatePage.tsx`
- Modify: `src/features/progress/progress.css`
- Modify: `tests/unit/progress-filter-ui.test.mjs`
- Create: `tests/e2e/progress-desktop-fold.mjs`

**Interfaces:**
- Giữ `UpdateView` props, rights gate, deep link, `setEdit(a)`, quick filters và advanced filter state.
- Thêm `data-progress-first-row="true"` vào row render đầu của `lat`; không đổi sorting/filtering/pagination.
- Acceptance `1366×768`: `.pr-hero`, `.pr-loc`, `.pr-table thead` và first row nhìn thấy; advanced filters đóng mặc định; font header/badge/label computed `>=12px`.

- [ ] **Step 1: RED unit contract cho state mặc định**

Mở rộng `tests/unit/progress-filter-ui.test.mjs` bằng helper thuần đã có và literal expectations:

```js
test("progress desktop defaults keep only quick action filters visible", () => {
  assert.equal(countProgressAdvancedFilters({ status: "all", stage: "all", period: "all", showInactive: false, issues: [] }), 0);
  assert.equal(isDetailedProgressFix("all"), false);
});
```

Thêm vào test integration hiện hữu hoặc test SSR của `UpdateView` assertion duy nhất `data-progress-first-row`; nếu SSR không thể qua rights effect, marker được xác nhận bằng RED E2E ở Step 2, không mock quyền chỉ để nhìn thấy row.

- [ ] **Step 2: RED geometry E2E**

Tạo `tests/e2e/progress-desktop-fold.mjs` từ `tests/e2e/progress-compact-filters.mjs`; mock/session y hệt, viewport `1366×768`, route `#v=progress`, wait `.pr-bang .pr-row`. Assert:

```js
const e = await page.evaluate(() => {
  const rect = (s) => document.querySelector(s)?.getBoundingClientRect().toJSON();
  const sizes = [".pr-th", ".pr-loc__badge", ".pr-loc__truong > span"]
    .flatMap((s) => [...document.querySelectorAll(s)].map((n) => parseFloat(getComputedStyle(n).fontSize)));
  return { hero: rect(".pr-hero"), filter: rect(".pr-loc"), head: rect(".pr-table thead"),
    row: rect("[data-progress-first-row]"), sizes,
    advancedHidden: document.querySelector("#progress-advanced-filters")?.hasAttribute("hidden"),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});
assert.ok(e.hero.top < 360 && e.hero.height <= 190, JSON.stringify(e));
assert.ok(e.filter.top < 768 && e.head.top < 768 && e.row.top < 768, JSON.stringify(e));
assert.ok(e.advancedHidden && e.sizes.every((n) => n >= 12) && e.overflow <= 1, JSON.stringify(e));
```

- [ ] **Step 3: Chạy RED**

Run: `node --import tsx --test tests/unit/progress-filter-ui.test.mjs`

Expected: PASS cho characterization hiện có; đây là safety net trước CSS.

Run: `bash scripts/with-preview.sh -- node tests/e2e/progress-desktop-fold.mjs`

Expected: FAIL missing first-row marker, 11px labels/headers, hoặc row dưới fold.

- [ ] **Step 4: GREEN tối thiểu**

Trong `UpdatePage.tsx`, map `lat.map((a, index) => ...)` và gắn `data-progress-first-row={index === 0 ? "true" : undefined}` vào `<tr>`; giữ mọi data attributes/callback khác.

Trong `progress.css`, nâng `.pr-loc__badge`, `.pr-loc__truong > span`, legend và `.pr-th` từ 11 lên 12px. Chỉ dưới `@media (min-width:1180px)`: `.pr-trang` gap 12, `.pr-hero` padding 12–14 và columns Vali 92px/content, `.pr-hero .hn-vali` 92×116, quote 22px, filter padding/gap gọn, table header/row padding dọc 8–9px. Quick filters vẫn hiện; advanced panel vẫn hidden mặc định; không làm `.pr-nhanh` hover-only thành đường duy nhất cập nhật vì `.pr-nut-chinh` vẫn luôn có.

- [ ] **Step 5: Verify/review/commit**

Run: `node --import tsx --test tests/unit/progress-filter-ui.test.mjs tests/unit/progress-workspace-model.test.mjs tests/unit/progress-deep-link.test.mjs`

Run: `bash scripts/with-preview.sh -- node tests/e2e/progress-desktop-fold.mjs`

Run: `bash scripts/with-preview.sh -- node tests/e2e/progress-compact-filters.mjs`

Run: `npm run drift && npm run typecheck`

Expected: PASS; quick/advanced filters và rights/deep link không đổi.

```bash
git add src/pages/UpdatePage.tsx src/features/progress/progress.css tests/unit/progress-filter-ui.test.mjs tests/e2e/progress-desktop-fold.mjs
git commit -m "feat(progress): ưu tiên bảng dữ liệu trong fold desktop"
```

### Task 5: Báo cáo progressive disclosure, giữ bốn control và ba export action

**Files:**
- Modify: `src/components/dashboard/ReportsView.tsx`
- Create: `src/components/dashboard/reports.css`
- Create: `tests/unit/reports-view.test.mjs`
- Create: `tests/e2e/reports-desktop-fold.mjs`

**Interfaces:**
- `ReportsView({ acts })`, report model, `printPDF`, `exportExcel`, `downloadHtml`, file names/sheets và chart data không đổi.
- Command row vẫn có bốn control: Năm, Phạm vi, Khu vực, Mức trọng yếu; export group vẫn đúng PDF, Excel, HTML.
- Explanations chuyển vào native `<details className="vmp-report-method">` đóng mặc định, `<summary>Cách tính báo cáo</summary>`.
- First KPI wrapper có `data-report-first-kpi="true"` để geometry test quan sát.

- [ ] **Step 1: RED SSR behavior**

Tạo `tests/unit/reports-view.test.mjs` dùng `renderToStaticMarkup` và một `Activity` literal active có `dlVmp` trong năm hiện tại:

```js
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReportsView from "../../src/components/dashboard/ReportsView.tsx";

test("reports keeps four primary controls and three exports while counting copy is collapsed", () => {
  const html = renderToStaticMarkup(React.createElement(ReportsView, { acts: [{
    id: "R1", code: "R1", obj: "R1", name: "Máy R1", type: "PQ", state: "active",
    st: "prog", dlVmp: `${new Date().getFullYear()}-12-01`, target: `${new Date().getFullYear()}-12-01`, _raw: {},
  }] }));
  for (const label of ["Năm báo cáo", "Phạm vi (bộ phận)", "Khu vực", "Mức trọng yếu"])
    assert.match(html, new RegExp(label.replace(/[()]/g, "\\$&")));
  assert.match(html, /aria-label="Xuất báo cáo"/);
  for (const label of ["PDF", "Excel \(đủ 5 sheet\)", "HTML"]) assert.match(html, new RegExp(label));
  assert.match(html, /<details class="vmp-report-method">/);
  assert.match(html, /<summary>Cách tính báo cáo<\/summary>/);
  assert.doesNotMatch(html, /<details[^>]*open/);
  assert.equal((html.match(/data-report-first-kpi="true"/g) || []).length, 1);
});
```

- [ ] **Step 2: RED desktop geometry/keyboard**

Tạo `tests/e2e/reports-desktop-fold.mjs` dùng cùng mock/session harness; viewport `1366×768`, route `#v=reports`, wait `.vmp-report-command-bar` và `[data-report-first-kpi]`. Assert:

```js
const e = await page.evaluate(() => {
  const rect = (s) => document.querySelector(s)?.getBoundingClientRect().toJSON();
  const details = document.querySelector(".vmp-report-method");
  return { command: rect(".vmp-report-command-bar"), kpi: rect("[data-report-first-kpi]"),
    controls: document.querySelectorAll(".vmp-report-command-bar > :not(.vmp-report-export-actions)").length,
    exports: document.querySelectorAll(".vmp-report-export-actions button").length,
    open: details?.hasAttribute("open"), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});
assert.equal(e.controls, 4); assert.equal(e.exports, 3); assert.equal(e.open, false);
assert.ok(e.command.top < 560 && e.kpi.top < 768 && e.overflow <= 1, JSON.stringify(e));
await page.focus(".vmp-report-method summary");
await page.keyboard.press("Enter");
assert.equal(await page.$eval(".vmp-report-method", (n) => n.hasAttribute("open")), true);
```

- [ ] **Step 3: Chạy RED**

Run: `node --import tsx --test tests/unit/reports-view.test.mjs`

Expected: FAIL missing details/summary/KPI marker.

Run: `bash scripts/with-preview.sh -- node tests/e2e/reports-desktop-fold.mjs`

Expected: FAIL missing selector hoặc KPI dưới fold.

- [ ] **Step 4: GREEN tối thiểu**

Import `./reports.css` trong `ReportsView.tsx`. Giữ command bar markup/control callbacks. Bọc ba khối giải thích hiện có (`Đang xem...`, khác Tổng quan, kỳ quá khứ/tương lai) trong một `details` đóng mặc định; summary luôn hiện. Thêm `data-report-first-kpi="true"` vào grid chứa hai `StatTile` đầu tiên, không đổi props/tính số. Thay emoji ℹ️ trong copy ẩn bằng chữ thuần để drift sạch; không đổi ý nghĩa.

Trong `reports.css`: styles token-only cho details/summary/focus; `@media (min-width:1180px)` đặt command bar grid `repeat(4,minmax(130px,1fr)) auto`, gap 10–12, export group không wrap, Card đầu compact, method margin/padding gọn. Không sửa mobile media query hiện có và không đổi CSS bảng/chart phía sau.

- [ ] **Step 5: Verify exports, geometry, accessibility và commit**

Run: `node --import tsx --test tests/unit/reports-view.test.mjs tests/unit/xuat-excel.test.mjs`

Run: `bash scripts/with-preview.sh -- node tests/e2e/reports-desktop-fold.mjs`

Run: `bash scripts/with-preview.sh -- npm run a11y -- --grep "bao-cao"`

Run: `npm run drift && npm run typecheck && npm run build`

Expected: PASS; bốn control/ba export giữ nguyên; summary keyboard mở được; KPI đầu trong fold; axe không critical/serious.

```bash
git add src/components/dashboard/ReportsView.tsx src/components/dashboard/reports.css tests/unit/reports-view.test.mjs tests/e2e/reports-desktop-fold.mjs
git commit -m "feat(reports): đưa KPI vào fold bằng disclosure"
```

## Final verification and no-Timeline proof

Chạy mới trên Node `24.18.0`:

```bash
npm run typecheck
npm run test:unit
npm run drift
bash scripts/with-preview.sh -- npm run a11y
bash scripts/with-preview.sh -- node tests/e2e/today-desktop-fold.mjs
bash scripts/with-preview.sh -- node tests/e2e/progress-desktop-fold.mjs
bash scripts/with-preview.sh -- node tests/e2e/reports-desktop-fold.mjs
bash scripts/with-preview.sh -- node tests/e2e/today-qa-ledger.mjs
bash scripts/with-preview.sh -- node tests/e2e/progress-compact-filters.mjs
npm run build
git diff --name-only 6fdfe015..HEAD | rg 'TimelinePage|LongMon|long-mon|MonitoringJourney|monitoring\.css'
git status --short
```

Expected: mọi gate không-visual PASS; lệnh proof không có output. `npm run visual`/`npm run visual:contract` vẫn được báo release gate mở vì contract 45 chưa seal và scope cấm update baseline. Bàn giao branch/commit local, backup bundle, kết quả từng geometry/review; không push/merge/deploy.

# Desktop UX Data-First Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khôi phục cổng chất lượng desktop, nén chrome để dữ liệu chính xuất hiện trong fold đầu, và bổ sung action dock đọc được ngay cho Long Môn mà không đổi dữ liệu hay nghiệp vụ VMP.

**Architecture:** Thực hiện tuần tự theo ba ranh giới: guardrail phát hành, chrome desktop dùng chung, rồi Long Môn. Deadline action dock là model thuần dùng `classifyVmpDeadline()`/`vmpDeadlineDate()` làm nguồn canonical; React chỉ quản lý tab, tìm kiếm, trạng thái thu gọn và chuyển `Activity` vào callback mở modal hiện có.

**Tech Stack:** Node 24.18.0, React 18.3, TypeScript 7, Vite 6, Node test runner + `tsx`, Playwright 1.62, Puppeteer Core, axe-core/playwright, CSS Lotus Pearl hiện có.

## Global Constraints

- Chỉ desktop tại `1366×768`, `1440×900`, `1920×1080`; không thiết kế lại mobile và không thêm baseline mobile.
- Giữ Lotus Pearl, Vali, Long Môn và CPC1 HN; sidebar vẫn là điều hướng chính, không tạo điều hướng thứ hai.
- Không đổi schema, migration, RLS, RPC, Supabase, công thức nghiệp vụ hoặc dữ liệu/file xuất báo cáo.
- Không thêm framework UI, chart library, dependency runtime hoặc dependency dev mới.
- Node CI và kiểm chứng là `24.18.0`; timezone nghiệp vụ/visual là `Asia/Bangkok`.
- Chữ mang thông tin hoặc điều khiển tối thiểu `12px`; thang ưu tiên `12 / 14 / 16 / 24 / 32px`.
- Radius theo vai trò: `10px` control, `16–18px` card dữ liệu, `24px` khối nhận diện lớn, `999px` chỉ pill.
- Button/input thật, label thật, focus visible, thứ tự bàn phím theo thứ tự nhìn; không dựa vào màu hoặc hover để truyền nghĩa.
- Không thêm animation ngoài transition ngắn; mọi motion mới tôn trọng `prefers-reduced-motion`.
- Không push, merge, deploy hoặc mutate production. Snapshot Linux chỉ seal sau review ảnh thủ công; không tự chấp nhận diff.
- Không sửa `package-lock.json`; mọi thay đổi package script chỉ dùng công cụ đã cài.
- Mỗi task phải đi RED → xác nhận fail đúng lý do → GREEN tối thiểu → focused regression → review → commit cục bộ. Không bắt đầu task sau khi Critical/Important finding còn mở.
- Preflight trước mỗi task: `git status --short` phải chỉ có thay đổi đã biết; chạy `git diff --name-only HEAD -- <files của task>` và dừng nếu có file ownership ngoài kế hoạch.

## Architecture, dependencies, shared state, and sequencing

| Task | Sở hữu file triển khai | Phụ thuộc | Có thể giao song song |
|---|---|---|---|
| 1 | `scripts/check-design-drift.mjs` | Không | Không; gate nền |
| 2 | visual matrix/runtime/workflows/package scripts | Task 1 để workflow gọi drift đã test | Không; shared CI state |
| 3 | `Layout.tsx`, `MonitoringJourneyNav.tsx`, chrome CSS | Task 2 để có baseline/axe gate | Không; shared shell |
| 4 | model `longMonActionQueue.ts` mới | Chỉ deadline canonical hiện có | Có thể phân tích độc lập, nhưng merge tuần tự trước Task 5 |
| 5 | Long Môn component/CSS, Timeline integration tests, axe/visual artifacts | Task 4 API, Task 2 contract, Task 3 geometry | Không; tích hợp shared Timeline |

`package.json` chỉ Task 2 được sửa. `tests/visual/lotus.spec.ts`, `tests/a11y/a11y.spec.ts`, `.github/workflows/*` chỉ Task 2/5 sửa theo thứ tự ghi rõ; primary planner kiểm diff trước khi chuyển ownership. `src/features/monitoring/long-mon-race.css` chỉ Task 5 sửa. Không chạy hai implementer cùng lúc trên cùng worktree.

## Rollback and recovery

- Rollback toàn bộ: tag local `backup/ui-desktop-before-refinement-20260831` tại `6fdfe015` hoặc bundle đã verify `/home/admin1/VMP/backups/naniVMP-ui-before-desktop-refinement-20260831.bundle`.
- Rollback theo lát: revert commit của Task 5 → 1 theo thứ tự ngược; không reset hard và không xóa worktree.
- Nếu baseline review không được duyệt, giữ code/test trước baseline, không chạy `visual:baseline:seal`, không commit PNG/seal, và ghi gate visual là còn mở.
- Nếu geometry `1366×768` không đạt, revert riêng commit Task 3; model Task 4 không phụ thuộc CSS nên vẫn giữ được.
- Nếu dock làm `LongMonRace` lỗi render, `LongMonRaceGuard` hiện có vẫn phải dựng danh sách fallback và mở đúng `ActivityDetailModal`.

## Review checkpoints

1. Sau Task 2: reviewer độc lập kiểm drift fixture, visual count/tree contract, workflow DAG và việc `production-build` phụ thuộc axe; primary rerun targeted tests.
2. Sau Task 3: reviewer UI so ảnh thủ công 3 viewport × light/dark và kiểm CPC1 HN/Vali/Long Môn không mất; primary rerun geometry.
3. Sau Task 4: reviewer kiểm biên ngày Bangkok, canonical deadline và mutation cases; không review bằng snapshot.
4. Sau Task 5: Terra-or-stronger review model/UI; Sol final review shared shell, accessibility, rollback và toàn bộ diff. Primary rerun final gate mới, không dựa vào báo cáo reviewer.

---

### Task 1: Làm design-drift guardrail kiểm thử được và bắt literal nhiều dòng

**Files:**
- Modify: `scripts/check-design-drift.mjs`
- Create: `tests/unit/design-drift.test.mjs`

**Interfaces:**
- Consumes: CSS/TS/TSX dưới root repo; CLI mặc định vẫn là `node scripts/check-design-drift.mjs`.
- Produces: CLI test-only `--root <absolute-fixture-root>`; lỗi liệt kê đúng file/dòng, tổng số vi phạm, exit `1`; sạch exit `0`.

- [ ] **Step 1: Viết test RED chạy artifact thật trên fixture**

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

test("drift reports a sub-12px business label and multiline white background as two violations", (t) => {
  const fixture = path.join(tmpdir(), `vmp-drift-${process.pid}-${Date.now()}`);
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  mkdirSync(path.join(fixture, "src", "features", "probe"), { recursive: true });
  writeFileSync(path.join(fixture, "src", "features", "probe", "probe.css"), `
.probe { font-size: 11px; }
.panel {
  background:
    #fff;
}
`);
  const result = run(fixture);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /2 vi phạm luật thiết kế/u);
  assert.match(result.stderr, /chữ 11px nhỏ hơn 12px/u);
  assert.match(result.stderr, /nền trắng literal/u);
});

test("drift accepts semantic backgrounds and 12px text", (t) => {
  const fixture = path.join(tmpdir(), `vmp-drift-clean-${process.pid}-${Date.now()}`);
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  mkdirSync(path.join(fixture, "src", "features", "probe"), { recursive: true });
  writeFileSync(path.join(fixture, "src", "features", "probe", "probe.css"),
    ".probe { font-size: 12px; background: var(--lp-surface); border-radius: 10px; }\n");
  const result = run(fixture);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Không có trôi thiết kế\. ĐẠT\./u);
});
```

- [ ] **Step 2: Chạy RED và xác nhận đúng nguyên nhân**

Run: `node --import tsx --test tests/unit/design-drift.test.mjs`

Expected: FAIL vì CLI hiện chưa nhận `--root` và regex nền trắng đang quét từng dòng nên fixture nhiều dòng không tạo đúng hai lỗi.

- [ ] **Step 3: GREEN tối thiểu trong script**

Trong `scripts/check-design-drift.mjs`:

```js
const args = process.argv.slice(2);
if (args.length !== 0 && !(args.length === 2 && args[0] === "--root" && path.isAbsolute(args[1]))) {
  console.error("Usage: node scripts/check-design-drift.mjs [--root <absolute-path>]");
  process.exit(2);
}
const GOC = args.length === 2 ? args[1] : fileURLToPath(new URL("..", import.meta.url));
```

Thêm `import path from "node:path"`; thay luật nền trắng bằng phép quét toàn nội dung đã mask comment nhưng giữ newline, dùng regex global cho `background(?:-color)?\s*:\s*(?:\r?\n\s*)?(?:#fff(?:fff)?\b|white\b|rgba?\(\s*255...)`, rồi tính số dòng từ `noiDung.slice(0, match.index).split("\n").length`. Không thay phạm vi migration, miễn trừ hay wording các luật khác.

- [ ] **Step 4: Chạy GREEN và regression**

Run: `node --import tsx --test tests/unit/design-drift.test.mjs`

Expected: `2 tests` PASS.

Run: `npm run drift`

Expected: PASS trên cây hiện tại hoặc FAIL chỉ với danh sách vi phạm thật cần xử trong Task 3/5; không được crash hay báo quét `0 file`.

- [ ] **Step 5: Review và commit**

Mutation check: đổi fixture `12px` thành `11px` phải fail; đổi `var(--lp-surface)` thành literal trắng nhiều dòng phải fail.

```bash
git add scripts/check-design-drift.mjs tests/unit/design-drift.test.mjs
git commit -m "test(ui): khóa guardrail drift desktop"
```

### Task 2: Một visual matrix contract và release gate drift/axe trước build

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
- Produces `VISUAL_SCREENS`, `VISUAL_THEMES`, `VISUAL_PROJECTS`, `VISUAL_BASELINE_COUNT` từ `scripts/visual-matrix-contract.mjs`; hiện tại `7 × 2 × 3 + 1 × 3 = 45` PNG.
- `node scripts/visual-matrix-contract.mjs --count` in đúng `45`; `--verify-output <log>` xác nhận Playwright báo đúng 45 pass.
- Release DAG: `static-quality` chạy `drift`; job `a11y` chạy sau `static-quality`; `production-build.needs` gồm `static-quality`, DB contract, E2E mock và `a11y`.

- [ ] **Step 1: Viết RED cho count dùng chung và workflow DAG**

Thêm vào `tests/unit/visual-runtime-contract.test.mjs`:

```js
test("visual matrix derives 45 Linux baselines from screens, themes, and projects", async () => {
  const contract = await import("../../scripts/visual-matrix-contract.mjs");
  assert.equal(contract.VISUAL_SCREENS.length, 7);
  assert.deepEqual(contract.VISUAL_THEMES, ["light", "dark"]);
  assert.equal(contract.VISUAL_PROJECTS.length, 3);
  assert.equal(contract.VISUAL_BASELINE_COUNT, 45);
});
```

Tạo `tests/unit/release-workflow-contract.test.mjs` để đọc YAML theo job blocks, không khóa wording step:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8");
const block = (name, next) => workflow.slice(workflow.indexOf(`  ${name}:`),
  next ? workflow.indexOf(`  ${next}:`) : workflow.length);

test("release build is gated by drift and accessibility", () => {
  assert.match(block("static-quality", "source-access-db-contract"), /npm run drift/u);
  assert.match(block("a11y", "production-build"), /needs:\s*static-quality[\s\S]*npm run a11y/u);
  const build = block("production-build", "deploy");
  for (const need of ["static-quality", "source-access-db-contract", "e2e-mock", "a11y"]) {
    assert.match(build, new RegExp(`- ${need}`));
  }
});
```

- [ ] **Step 2: Chạy RED**

Run: `node --import tsx --test tests/unit/visual-runtime-contract.test.mjs tests/unit/release-workflow-contract.test.mjs`

Expected: FAIL `ERR_MODULE_NOT_FOUND` cho matrix contract và thiếu job `a11y`/`npm run drift`.

- [ ] **Step 3: GREEN matrix contract**

Tạo `scripts/visual-matrix-contract.mjs` với literal route/name đang có trong `lotus.spec.ts`, ba project `chromium`, `chromium-1366`, `chromium-1920`, hai theme và công thức:

```js
export const VISUAL_SCREENS = [
  ["today", "hom-nay"], ["overview", "tong-quan"], ["source", "danh-muc"],
  ["progress", "tien-do"], ["timeline", "timeline"], ["alerts", "canh-bao"],
  ["reports", "bao-cao"],
];
export const VISUAL_THEMES = ["light", "dark"];
export const VISUAL_PROJECTS = [
  { name: "chromium", viewport: { width: 1440, height: 900 } },
  { name: "chromium-1366", viewport: { width: 1366, height: 768 } },
  { name: "chromium-1920", viewport: { width: 1920, height: 1080 } },
];
export const VISUAL_BASELINE_COUNT =
  (VISUAL_SCREENS.length * VISUAL_THEMES.length + 1) * VISUAL_PROJECTS.length;
```

CLI chỉ chấp nhận `--count` và `--verify-output <path>`; verifier parse dòng `45 passed`, exit 1 nếu lệch. Import screen/theme trong `lotus.spec.ts`, project/viewport trong config, và count trong runtime verifier. Thay fixture `BASELINE_PATHS` trong unit test bằng phép sinh từ contract; seal prefix dùng `String(VISUAL_BASELINE_COUNT)`.

- [ ] **Step 4: GREEN workflow/package**

Thêm scripts:

```json
"visual:matrix:count": "node scripts/visual-matrix-contract.mjs --count",
"visual:matrix:verify": "node scripts/visual-matrix-contract.mjs --verify-output visual-output.log"
```

Trong `static-quality`, chạy `npm run drift` sau unit. Thêm job `a11y` cài Chromium, tạo `.env.local` giả lập như `e2e-mock`, rồi chạy `bash scripts/with-preview.sh -- npm run a11y`. Thêm `a11y` vào `production-build.needs`. Trong baseline workflow thay grep/count hard-code bằng `npm run visual:matrix:verify`, `expected_count="$(npm run --silent visual:matrix:count)"`, và kiểm `changed == expected_count + 1`, `png_count == expected_count`, tree count bằng `expected_count`.

- [ ] **Step 5: Chạy focused GREEN**

Run: `node --import tsx --test tests/unit/visual-runtime-contract.test.mjs tests/unit/release-workflow-contract.test.mjs tests/unit/a11y-runtime-contract.test.mjs`

Expected: PASS.

Run: `npm run visual:matrix:count`

Expected stdout: `45`.

Run: `npm run visual:contract`

Expected trước khi tạo 6 ảnh Cảnh báo còn thiếu: FAIL rõ `expected exactly 45 ... found 39`; đây là RED lifecycle hợp lệ, không được sửa seal/PNG bằng tay.

- [ ] **Step 6: Review và commit**

Reviewer xác nhận không còn literal `39` trong workflow/runtime/tests và config vẫn đúng ba desktop viewport.

```bash
git add scripts/visual-matrix-contract.mjs tests/visual/lotus.spec.ts playwright.visual.config.ts scripts/check-visual-runtime.mjs tests/unit/visual-runtime-contract.test.mjs tests/unit/release-workflow-contract.test.mjs .github/workflows/deploy.yml .github/workflows/visual-baseline.yml package.json
git commit -m "ci(ui): hợp nhất visual matrix và axe gate"
```

### Task 3: Nén desktop masthead, phạm vi và Monitoring Journey; khóa fold geometry

**Files:**
- Modify: `src/components/layout/Layout.tsx`
- Modify: `src/features/monitoring/MonitoringJourneyNav.tsx`
- Modify: `src/styles/lotus-shell.css`
- Modify: `src/features/monitoring/monitoring.css`
- Modify: `tests/unit/monitoring-journey.test.mjs`
- Create: `tests/e2e/desktop-data-first-geometry.mjs`

**Interfaces:**
- Monitoring nav vẫn nhận nguyên `MonitoringJourneyNavProps`; output desktop là một semantic tab rail icon + title + badge count, active có `aria-current="page"`.
- Geometry contract: tại `1366×768`, top của `.b-hero`, `.long-mon-race`, `.alerts-priority-rail` không quá `360px`; Today/Progress/Reports có data/CTA đầu tiên trong viewport.

- [ ] **Step 1: RED semantic markup**

Sửa test `journey nav renders...` thành các assertion hành vi:

```js
assert.match(html, /role="tablist"/);
assert.equal((html.match(/role="tab"/g) || []).length, 2);
assert.match(html, /aria-current="page"/);
assert.match(html, /aria-selected="true"/);
assert.match(html, />5<\/strong>/);
assert.doesNotMatch(html, /Đang xem/);
for (const item of Object.values(MONITORING_SCREEN_COPY)) {
  assert.doesNotMatch(html, new RegExp(item.description));
}
```

Production change bị bắt: quay lại card cao có description/current pill hoặc mất semantic active tab.

- [ ] **Step 2: RED geometry E2E**

Tạo `tests/e2e/desktop-data-first-geometry.mjs` dùng `puppeteer-core`, `caiGiaLap`, `nhetPhien`, `CHROME` theo `tests/e2e/monitoring-journey.mjs`; viewport cố định `1366×768`. Với từng route, đợi selector và đo literal:

```js
const cases = [
  ["overview", ".b-hero"],
  ["timeline", ".long-mon-race"],
  ["alerts", ".alerts-priority-rail"],
  ["today", ".hn-queue button, .hn-command button"],
  ["progress", ".pr-table thead, .pr-row"],
  ["reports", ".vmp-report-command-bar + *"],
];
for (const [view, selector] of cases) {
  await page.goto(`${APP_URL}#v=${view}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(selector, { visible: true, timeout: 15_000 });
  const box = await page.$eval(selector, (node) => node.getBoundingClientRect().toJSON());
  assert.ok(box.top <= (view === "overview" || view === "timeline" || view === "alerts" ? 360 : 768),
    `${view} starts below desktop fold: ${box.top}`);
  assert.ok(box.top < 768 && box.bottom > 0, `${view} first action/data is outside fold`);
}
```

Nếu selector thực tế của Today/Progress khác, chọn selector hiện hữu đầu tiên đại diện CTA/table row sau khi xem DOM; không nới điều kiện `top < 768`.

- [ ] **Step 3: Chạy RED**

Run: `node --import tsx --test tests/unit/monitoring-journey.test.mjs`

Expected: FAIL vì nav hiện chưa có tablist/tab và vẫn render description/“Đang xem”.

Run: `bash scripts/with-preview.sh -- node tests/e2e/desktop-data-first-geometry.mjs`

Expected: FAIL ít nhất một bề mặt monitoring bắt đầu dưới `360px` hoặc data/CTA dưới fold.

- [ ] **Step 4: GREEN tối thiểu desktop-only**

- Trong `MonitoringJourneyNav.tsx`, rail `role="tablist" aria-label="Ba màn giám sát"`; mỗi button `role="tab"`, `aria-selected={active}`, `aria-current`; bỏ description và pill “Đang xem”; giữ icon, title, metric number + metric label cho accessible name.
- Trong `Layout.tsx`, chuyển padding desktop inline sang CSS variables/class hoặc giá trị `14px var(--lp-shell-pad)`; giữ h1, wordmark, thời điểm sửa, theme/refresh/role.
- Trong `lotus-shell.css` và `monitoring.css`, chỉ dưới `@media (min-width: 1180px)`: masthead cao 40–44px, h1 dùng `32px/38px`, topbar không wrap, global filter/context gap 8–10px, journey một hàng cao không quá 56px, badge/pill tối thiểu 12px, item min-height 44px. Không sửa block mobile.
- Dùng token Lotus có sẵn; không thêm hex/radius ngoài thang. Không đổi copy CPC1 HN.

- [ ] **Step 5: GREEN + review visual**

Run: `node --import tsx --test tests/unit/monitoring-journey.test.mjs`

Run: `bash scripts/with-preview.sh -- node tests/e2e/desktop-data-first-geometry.mjs`

Run: `npm run drift`

Expected: tất cả PASS.

Chụp review thủ công (không update snapshot):

```bash
bash scripts/with-preview.sh -- npm run visual -- --project=chromium-1366 --grep "tong-quan|timeline|canh-bao"
```

Expected: test visual sẽ FAIL vì intentional diff; reviewer mở `test-results/**/actual.png`, xác nhận không mất Lotus Pearl/CPC1 HN, không overlap/focus clipping, rồi ghi nhận approval trước Task 5.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/Layout.tsx src/features/monitoring/MonitoringJourneyNav.tsx src/styles/lotus-shell.css src/features/monitoring/monitoring.css tests/unit/monitoring-journey.test.mjs tests/e2e/desktop-data-first-geometry.mjs
git commit -m "feat(ui): nén chrome giám sát desktop"
```

### Task 4: Model thuần cho Long Môn action queue theo deadline canonical Bangkok

**Files:**
- Create: `src/features/monitoring/longMonActionQueue.ts`
- Create: `tests/unit/long-mon-action-queue.test.mjs`

**Interfaces:**
- Consumes: `readonly Activity[]`, `now: Date`; `classifyVmpDeadline(activity, now, SOON_DAYS)`.
- Produces:

```ts
export type LongMonActionKind = "overdue" | "due-soon";
export interface LongMonActionItem {
  activity: Activity;
  code: string;
  name: string;
  qa: string;
  deadline: string;
  daysRemaining: number;
  kind: LongMonActionKind;
}
export interface LongMonActionQueue {
  overdue: LongMonActionItem[];
  dueSoon: LongMonActionItem[];
  counts: { overdue: number; dueSoon: number };
}
export function buildLongMonActionQueue(
  activities: readonly Activity[], now: Date,
): LongMonActionQueue;
```

- [ ] **Step 1: Viết RED table-driven từ literal độc lập**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildLongMonActionQueue } from "../../src/features/monitoring/longMonActionQueue.ts";

const NOW = new Date("2026-08-31T17:30:00Z"); // 01/09/2026 00:30 Bangkok
const activity = (code, dlVmp, extra = {}) => ({
  id: code, code, obj: code, name: `Tên ${code}`, type: "PQ", state: "active",
  st: "prog", dlVmp, owner_name: `QA ${code}`, _raw: {}, ...extra,
});

test("queue uses Bangkok date, excludes done/missing/future, and sorts urgency then code", () => {
  const queue = buildLongMonActionQueue([
    activity("B", "2026-08-30"), activity("A", "2026-08-30"),
    activity("TODAY", "2026-09-01"), activity("SOON", "2026-09-03"),
    activity("FUTURE", "2026-12-01"), activity("MISSING", null),
    activity("DONE", "2026-08-01", { st: "done" }),
  ], NOW);
  assert.deepEqual(queue.overdue.map((row) => [row.code, row.daysRemaining]), [["A", -2], ["B", -2]]);
  assert.deepEqual(queue.dueSoon.map((row) => [row.code, row.daysRemaining]), [["TODAY", 0], ["SOON", 2]]);
  assert.deepEqual(queue.counts, { overdue: 2, dueSoon: 2 });
});

test("queue uses canonical dlVmp and stable QA/name fallbacks", () => {
  const queue = buildLongMonActionQueue([activity("CANON", "2026-08-31", {
    target: "2027-01-01", name: "Máy đóng nang", owner_name: "Nguyễn QA",
  })], NOW);
  assert.deepEqual(queue.overdue[0], {
    activity: activity("CANON", "2026-08-31", { target: "2027-01-01", name: "Máy đóng nang", owner_name: "Nguyễn QA" }),
    code: "CANON", name: "Máy đóng nang", qa: "Nguyễn QA",
    deadline: "2026-08-31", daysRemaining: -1, kind: "overdue",
  });
});
```

- [ ] **Step 2: Chạy RED**

Run: `node --import tsx --test tests/unit/long-mon-action-queue.test.mjs`

Expected: FAIL `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: GREEN tối thiểu**

Dùng `classifyVmpDeadline`; map `overdue` vào `overdue`, `today|soon` vào `dueSoon`; bỏ `done|missing|future`. Tên: `name || objName || obj || "Hạng mục VMP"`; QA: `owner_name || owner || _raw.owner_name || "Chưa phân công QA"`; code: `code || id`. Sort overdue theo `daysRemaining` tăng dần rồi `localeCompare("vi")`; dueSoon tương tự.

- [ ] **Step 4: GREEN và mutation check**

Run: `node --import tsx --test tests/unit/long-mon-action-queue.test.mjs tests/unit/vmp-deadline-model.test.mjs`

Expected: PASS.

Mutation: thay `dlVmp` bằng `target`, đổi Bangkok sang UTC, hoặc đảo sort phải làm ít nhất một test fail.

- [ ] **Step 5: Commit**

```bash
git add src/features/monitoring/longMonActionQueue.ts tests/unit/long-mon-action-queue.test.mjs
git commit -m "feat(long-mon): tạo hàng đợi hành động canonical"
```

### Task 5: Tích hợp Long Môn action dock desktop, keyboard/a11y và seal visual sau duyệt

**Files:**
- Create: `src/features/monitoring/LongMonActionDock.tsx`
- Modify: `src/features/monitoring/LongMonRace.tsx`
- Modify: `src/features/monitoring/long-mon-race.css`
- Modify: `tests/unit/long-mon-race.test.mjs`
- Create: `tests/e2e/long-mon-action-dock.mjs`
- Modify: `tests/a11y/a11y.spec.ts`
- Modify: `tests/visual/baseline-contract.env` (chỉ workflow seal sau review)
- Modify: `tests/visual/baselines/chromium-linux/*.png` (workflow only)
- Modify: `tests/visual/baselines/chromium-1366-linux/*.png` (workflow only)
- Modify: `tests/visual/baselines/chromium-1920-linux/*.png` (workflow only)

**Interfaces:**
- `LongMonActionDockProps`: `{ queue: LongMonActionQueue; scopeLabel: string; emptyReason?: string | null; onOpen: (activity: Activity) => void }`.
- Dock mặc định mở tab `overdue` nếu có, nếu không `due-soon`; tối đa 8 dòng sau lọc; search mã/tên/QA không phân biệt hoa thường/dấu cách thừa.
- `LongMonRaceProps` không đổi ở call-site; component tự gọi `buildLongMonActionQueue(activities, now)` và chuyển cùng `onOpen` vào dock.

- [ ] **Step 1: RED SSR cho semantic dock và integration**

Thêm test vào `tests/unit/long-mon-race.test.mjs` với ba activity overdue/soon, render `LongMonRace`, rồi assert:

```js
assert.match(html, /aria-label="Việc cần xử lý trong Long Môn"/);
assert.match(html, /aria-controls="long-mon-action-panel"/);
assert.match(html, /aria-expanded="true"/);
assert.match(html, /role="tablist"/);
assert.match(html, /Quá hạn \(2\)/);
assert.match(html, /Sắp hạn \(1\)/);
assert.match(html, /aria-label="Tìm theo mã, tên hoặc QA"/);
assert.match(html, /data-long-mon-action-code=/);
```

- [ ] **Step 2: RED browser interaction/geometry**

Tạo `tests/e2e/long-mon-action-dock.mjs` theo harness `long-mon-race.mjs`, desktop `1366×768`; assert:

```js
await page.waitForSelector('.long-mon-action-dock[aria-label="Việc cần xử lý trong Long Môn"]');
assert.ok(await page.$$eval("[data-long-mon-action-code]", (rows) => rows.length > 0 && rows.length <= 8));
const code = await page.$eval("[data-long-mon-action-code]", (row) => row.dataset.longMonActionCode);
await page.type('input[aria-label="Tìm theo mã, tên hoặc QA"]', code);
assert.deepEqual(await page.$$eval("[data-long-mon-action-code]", (rows) => rows.map((r) => r.dataset.longMonActionCode)), [code]);
await page.focus('input[aria-label="Tìm theo mã, tên hoặc QA"]');
await page.keyboard.press("Tab");
await page.keyboard.press("Enter");
await page.waitForSelector('[role="dialog"][aria-modal="true"]');
assert.match(await page.$eval('[role="dialog"]', (n) => n.textContent), new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
```

Sau đóng modal, đo `.long-mon-race__today`, `.long-mon-race__gate`, `.long-mon-action-dock`; assert intersection area bằng 0, dock width `280..340`, informative computed font sizes trong dock/week/scope/code/legend đều `>=12` và document không tràn ngang.

- [ ] **Step 3: Chạy RED**

Run: `node --import tsx --test tests/unit/long-mon-race.test.mjs`

Run: `bash scripts/with-preview.sh -- node tests/e2e/long-mon-action-dock.mjs`

Expected: FAIL vì dock/selector chưa tồn tại.

- [ ] **Step 4: GREEN component tối thiểu**

`LongMonActionDock.tsx` dùng `useState` cho `collapsed`, `activeTab`, `query`; native buttons/input. Toggle có `aria-expanded`, `aria-controls`; tab buttons có `role="tab"`, `aria-selected`; panel `role="tabpanel"`. Normalize query bằng `trim().toLocaleLowerCase("vi")`; filter `code name qa`; `slice(0, 8)`. Mỗi row là button gọi `onOpen(item.activity)` và có nhãn chữ `Quá hạn`/`Sắp hạn`, ngày `dd/mm/yyyy`, `Trễ N ngày`/`Còn N ngày`/`Hôm nay`.

Trong `LongMonRace.tsx`, thêm wrapper `.long-mon-race__stage` chứa viewport và dock; queue tạo trước render. Dock nhận `scopeLabel={scopeControl?.scopeLabel ?? "Theo phạm vi hiện tại"}` và `emptyReason={scopeControl?.emptyMessage}`. Không đổi fish model, positioning hoặc callback modal.

- [ ] **Step 5: GREEN CSS desktop-only**

Trong `long-mon-race.css`, thay mọi informative `7/8/9/10/11px` ở week/scope/code/tooltip/legend/note bằng tối thiểu 12px. Giảm mốc tuần ở desktop bằng CSS/markup class (ẩn nhãn xen kẽ khi cần), không thu chữ. Tại `@media (min-width: 1180px)`, `.long-mon-race__stage` là grid `minmax(0, 1fr) clamp(280px, 23vw, 340px)`; dock nằm cột phải, không position overlay. Control min-height 44px, focus outline token, surface màu/token Long Môn hiện có. Ở dưới 1180px, không thiết kế lại mobile: dock theo normal flow dưới tranh và không tạo baseline mới.

- [ ] **Step 6: GREEN tests + axe scope**

Run: `node --import tsx --test tests/unit/long-mon-action-queue.test.mjs tests/unit/long-mon-race.test.mjs`

Run: `bash scripts/with-preview.sh -- node tests/e2e/long-mon-action-dock.mjs`

Run: `bash scripts/with-preview.sh -- node tests/e2e/desktop-data-first-geometry.mjs`

Expected: PASS.

Trong `tests/a11y/a11y.spec.ts`, giữ sáu màn hiện có và thêm chính xác `{ ten: "danh-muc", hash: "#v=source", dangNhap: true, root: "#vmp-main-content" }` và `{ ten: "tai-cong-viec", hash: "#v=work", dangNhap: true, root: "#vmp-main-content" }` vì Task 3 đổi shared shell; sau khi root hiện, đợi skeleton biến mất hoặc tối đa 3 giây trước axe. Run:

`bash scripts/with-preview.sh -- npm run a11y`

Expected: không critical/serious trên toàn matrix axe.

Run: `npm run drift && npm run typecheck && npm run build`

Expected: PASS, không warning/error mới.

- [ ] **Step 7: Visual review và seal có kiểm soát**

Local/CI trước seal:

`bash scripts/with-preview.sh -- npm run visual`

Expected: intentional diffs và 6 baseline Cảnh báo còn thiếu; không gọi hoàn tất.

Do phạm vi hiện tại cấm push, agent không dispatch workflow và không tự sửa PNG/seal. Sau khi chủ/reviewer duyệt ảnh actual 3 viewport × light/dark, bàn giao exact HEAD cùng hướng dẫn để chủ dự án tự push/dispatch `visual-baseline.yml`; workflow phải tạo đúng `45 PNG + baseline-contract.env`, seal tree, verify `45 passed`, rồi chủ dự án đưa bot commit trở lại branch. Primary chỉ fetch/inspect diff ảnh khi có ủy quyền mới.

- [ ] **Step 8: Final review, commit code và final verification**

Commit code trước baseline artifacts:

```bash
git add src/features/monitoring/LongMonActionDock.tsx src/features/monitoring/LongMonRace.tsx src/features/monitoring/long-mon-race.css tests/unit/long-mon-race.test.mjs tests/e2e/long-mon-action-dock.mjs tests/a11y/a11y.spec.ts
git commit -m "feat(long-mon): thêm action dock desktop dễ truy cập"
```

Trước bàn giao không-push, chạy mới trên Node 24.18.0:

```bash
npm run typecheck
npm run test:unit
npm run drift
bash scripts/with-preview.sh -- npm run a11y
bash scripts/with-preview.sh -- npm run visual
bash scripts/with-preview.sh -- node tests/e2e/desktop-data-first-geometry.mjs
bash scripts/with-preview.sh -- node tests/e2e/long-mon-action-dock.mjs
npm run build
git status --short
```

Expected: typecheck/unit/drift/axe/geometry/dock/build PASS. `npm run visual` và `npm run visual:contract` được ghi rõ là release gate còn mở vì 45 baseline chưa thể tạo/seal khi chưa được push; không gọi toàn bộ feature “release-ready”. Bàn giao gồm branch local, năm commit code, exact HEAD cần dispatch, backup bundle path, review approvals và kết quả gate. Không push/merge/deploy.

## Deliberate scope cut for this executable tranche

Progressive disclosure Báo cáo, giảm riêng hero Today/Progress, và xóa component Timeline legacy không render được giữ ngoài năm task này. Geometry Task 3 vẫn khóa fold của Today/Progress/Reports để phát hiện regression, nhưng không mở rộng sửa ba bề mặt nếu chúng đã đạt. Lý do: những thay đổi đó chạm shared/legacy files lớn và không cần cho deliverable guardrail + compact monitoring chrome + Long Môn dock có thể hoàn tất, review và rollback trong một phiên. Nếu geometry chứng minh một trong ba màn không đạt, tạo spec/plan tranche kế tiếp thay vì lén mở scope trong task này.

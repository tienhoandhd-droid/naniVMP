# VMP Desktop Experience System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nâng cấp Navigation, Toast, Usability, IA, Motion, Affordance và Performance cho web desktop VMP mà không sửa Dòng thời gian/Long Môn hoặc SEO.

**Architecture:** Giữ `navigationContract.ts`, access contract và Lotus Pearl hiện có. Thay đổi theo sáu lát cắt có thể hoàn tác độc lập: route settlement, toast recovery, readiness, CTA/affordance, motion, rồi performance budgets; shared hotspots được làm tuần tự và mỗi lát cắt có RED/GREEN riêng.

**Tech Stack:** React 18, TypeScript, Vite 6, Node test runner, Puppeteer/Chromium, CSS Lotus Pearl.

## Global Constraints

- Chỉ desktop; viewport chấp nhận chính là 1366×768, 1920×1080 là regression smoke.
- Không sửa `src/pages/TimelinePage.tsx`, `src/features/timeline/**`, `src/features/monitoring/LongMonRace.tsx`, `src/features/monitoring/long-mon-race.css`, các model/test/baseline/seal Dòng thời gian/Long Môn.
- Shared shell được phép đổi nhưng không được làm thay đổi inner Long Môn.
- Không làm SEO: không canonical, robots, sitemap hoặc metadata tìm kiếm.
- Không đổi database/schema/RPC/RLS, quyền nghiệp vụ, mutation semantics, brand Lotus Pearl/Vali/CPC1 HN.
- Không thêm runtime/framework dependency.
- Performance budgets: shell ≤275 kB gzip; route thường ≤100 kB gzip; Reports trước export ≤50 kB gzip; cảnh báo DOM >1.500; không long task >50 ms.
- Không push, merge hoặc deploy.
- Mỗi task bắt đầu bằng RED, kết thúc bằng focused GREEN, regression phù hợp, review riêng và commit có thể revert.

## File map và ownership

| Unit | Files | Responsibility |
|---|---|---|
| Route settlement | `src/hooks/useRouteSettlement.ts`, `src/App.tsx`, `src/components/layout/Layout.tsx` | scroll/focus/title sau route, active semantics |
| Toast recovery | `src/lib/toastQueue.ts`, `src/components/ui/ToastProvider.tsx`, toast CSS trong `src/index.css` | queue, persistent recovery action, timer cleanup, accessible controls |
| Readiness | `src/components/ui/StateBoundary.tsx`, `src/pages/ActiveRulesPage.tsx`, `src/pages/ServerChecksPage.tsx`, `src/pages/PhanQuyenPage.tsx` | loading/error/empty và retry gần lỗi |
| Route CTA | `src/features/today/TodayCommandCenter.tsx`, `src/pages/UpdatePage.tsx`, `src/components/dashboard/ReportsView.tsx` | action label nói đúng kết quả |
| Motion/affordance | `src/styles/lotus-tokens.css`, shared sections of `src/index.css`, `src/components/ui/Primitives.tsx`, `src/components/dashboard/CompletionDashboard.tsx`, `src/pages/WorkloadPage.tsx`, `src/pages/QrmPage.tsx`, shared desktop declaration in `Layout.tsx` | token, reduce-motion, no false lift, transform-only feedback |
| Performance | `src/lib/routePrefetch.ts`, `src/App.tsx`, `src/components/layout/Layout.tsx`, `vite.config.js`, `scripts/check-desktop-performance-budgets.mjs`, `scripts/do-hieu-nang.mjs`, `package.json` | lazy Reports, intent prefetch, manifest budgets, lab evidence |

`App.tsx`, `Layout.tsx`, `index.css` và `UpdatePage.tsx` là shared hotspots. Các commit triển khai chạy tuần tự theo Task 1 → 2 → 3 → 4 → 5 → 6; chỉ phân tích đọc-only và review độc lập được chạy song song. Cách này tránh hai worker cùng sửa index/git index trong shared worktree.

---

### Task 1: Route settlement và navigation orientation

**Files:**
- Create: `src/hooks/useRouteSettlement.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Layout.tsx`
- Create: `tests/unit/desktop-navigation-experience.test.mjs`
- Create: `tests/e2e/desktop-navigation-experience.mjs`

**Interfaces:**
- Produces: `useRouteSettlement(view: string, title: string): RefObject<HTMLElement | null>`.
- Preserves: route click uses `pushState`; filter change uses `replaceState`; permission fallback unchanged.

- [ ] **Step 1: Write the failing source-contract test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("desktop route settlement owns title, scroll and focus", () => {
  const hook = read("src/hooks/useRouteSettlement.ts");
  const app = read("src/App.tsx");
  assert.match(hook, /document\.title\s*=\s*`\$\{title\} — V\/Q team`/);
  assert.match(hook, /scrollTo\(\{ top: 0, left: 0 \}\)/);
  assert.match(hook, /focus\(\{ preventScroll: true \}\)/);
  assert.match(app, /useRouteSettlement\(view, title\)/);
});

test("desktop navigation exposes the active page", () => {
  const layout = read("src/components/layout/Layout.tsx");
  assert.match(layout, /aria-current=\{active \? "page" : undefined\}/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --import tsx --test tests/unit/desktop-navigation-experience.test.mjs`

Expected: FAIL because `useRouteSettlement.ts` and `aria-current` do not exist.

- [ ] **Step 3: Implement the route-settlement hook**

```ts
import { useEffect, useRef } from "react";

export function useRouteSettlement(view: string, title: string) {
  const ref = useRef<HTMLElement | null>(null);
  const previousView = useRef(view);

  useEffect(() => {
    const routeChanged = previousView.current !== view;
    previousView.current = view;
    document.title = `${title} — V/Q team`;
    const frame = requestAnimationFrame(() => {
      ref.current?.scrollTo({ top: 0, left: 0 });
      if (routeChanged) ref.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [title, view]);

  return ref;
}
```

Replace `useScrollTop([view])` in `App.tsx` with `useRouteSettlement(view, title)`. Move `title` above the hook so the value exists before use. Add `aria-current={active ? "page" : undefined}` only to rendered nav buttons; do not change `setView`, alias or access logic.

- [ ] **Step 4: Write the browser behavior test**

Use the existing `caiGiaLap`/`nhetPhien` setup. At 1366×768, open `#v=overview`, click `[data-view="alerts"]`, then assert:

```js
const state = await page.evaluate(() => ({
  hash: location.hash,
  activeView: document.querySelector('.vmp-sidebar [aria-current="page"]')?.getAttribute("data-view"),
  focusId: document.activeElement?.id,
  title: document.title,
}));
assert.deepEqual(state, {
  hash: "#v=alerts",
  activeView: "alerts",
  focusId: "vmp-main-content",
  title: "Cảnh báo — V/Q team",
});
```

Then focus a filter, change it without changing `view`, and assert focus remains on the filter. Call `page.goBack()` and assert `overview`, main focus and title settle through the same path.

- [ ] **Step 5: Run GREEN and regression**

Run:

```bash
node --import tsx --test tests/unit/desktop-navigation-experience.test.mjs
npm run typecheck
bash scripts/with-preview.sh -- node tests/e2e/desktop-navigation-experience.mjs
```

Expected: all pass; no Timeline selector or expectation added.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useRouteSettlement.ts src/App.tsx src/components/layout/Layout.tsx tests/unit/desktop-navigation-experience.test.mjs tests/e2e/desktop-navigation-experience.mjs
git commit -m "feat(nav): settle desktop routes with focus and title"
```

---

### Task 2: Toast recovery contract

**Files:**
- Modify: `src/lib/toastQueue.ts`
- Modify: `src/components/ui/ToastProvider.tsx`
- Modify: toast-only selectors in `src/index.css`
- Modify: `src/pages/UpdatePage.tsx`
- Create: `tests/unit/toast-recovery.test.mjs`

**Interfaces:**
- Produces: `ToastAction { id: string; nhan: string }` stored in the pure queue.
- Produces: `HanhDongToast { nhan: string; thucHien(): void }` at the provider boundary.
- Extends: `loi(noiDung, hanhDong?)` and `dangChay(...).hong(noiDung, hanhDong?)` without breaking existing callers.

- [ ] **Step 1: Write failing queue tests**

```js
test("toast lỗi có recovery action ở lại đến khi xử lý", () => {
  const action = { id: "a1", nhan: "Thử lại" };
  const toast = { id: "t1", loai: "loi", noiDung: "Lưu thất bại", hanhDong: action };
  assert.equal(thoiLuongToast(toast), 0);
  assert.deepEqual(themToast([], toast)[0].hanhDong, action);
});

test("success đủ thời gian đọc và lỗi thường vẫn có trần", () => {
  assert.equal(THOI_LUONG.thanhCong, 3500);
  assert.equal(THOI_LUONG.canhBao, 5000);
  assert.equal(THOI_LUONG.loi, 6000);
});
```

- [ ] **Step 2: Run RED**

Run: `node --import tsx --test tests/unit/toast-recovery.test.mjs`

Expected: FAIL because `ToastAction`, `thoiLuongToast` and 3500 ms success do not exist.

- [ ] **Step 3: Extend the pure queue minimally**

```ts
export interface ToastAction { id: string; nhan: string }
export interface Toast {
  id: string;
  loai: LoaiToast;
  noiDung: string;
  hanhDong?: ToastAction;
}

export const THOI_LUONG = { dang: 0, thanhCong: 3500, canhBao: 5000, loi: 6000 };

export function thoiLuongToast(toast: Toast): number {
  return toast.loai === "loi" && toast.hanhDong ? 0 : THOI_LUONG[toast.loai];
}
```

Allow `chotToast` to accept and preserve an optional `ToastAction` while keeping the existing in-place order.

- [ ] **Step 4: Extend provider rendering and cleanup**

Keep callbacks out of the queue. Register them in `useRef<Map<string, () => void>>`, render exactly one `.vmp-toast__hanh-dong` button, and on action: dismiss toast, cancel timer, delete handler, then invoke the callback. Delete handlers for capped/dismissed/unmounted to avoid stale callbacks. Use each toast’s own `role="alert"` or `role="status"`; remove the redundant container `aria-live`.

```tsx
{t.hanhDong && (
  <button type="button" className="vmp-toast__hanh-dong"
    onClick={() => chayHanhDong(t)}>{t.hanhDong.nhan}</button>
)}
```

Give close/action controls `min-width: 36px; min-height: 36px`; spinner remains static under reduced motion.

- [ ] **Step 5: Apply one real recovery path**

Extract the idempotent state mutation in `UpdatePage.tsx` into `doiTrangThai(id, newState, reason)`. On failure call:

```ts
toast.loi(`Không đổi được trạng thái ${id}. Dữ liệu chưa được lưu.`, {
  nhan: "Thử lại",
  thucHien: () => { void doiTrangThai(id, newState, reason); },
});
```

Keep the modal/input state intact. Do not alter RPC, payload or permission checks.

- [ ] **Step 6: Run GREEN and regression**

Run:

```bash
node --import tsx --test tests/unit/toast-queue.test.mjs tests/unit/toast-recovery.test.mjs
npm run typecheck
npm run build
```

Expected: queue cap/in-place settlement still pass and new persistent action passes.

- [ ] **Step 7: Commit**

```bash
git add src/lib/toastQueue.ts src/components/ui/ToastProvider.tsx src/index.css src/pages/UpdatePage.tsx tests/unit/toast-recovery.test.mjs
git commit -m "feat(toast): add recoverable desktop error actions"
```

---

### Task 3: Readiness and inline recovery

**Files:**
- Modify: `src/components/ui/StateBoundary.tsx`
- Modify: `src/pages/ActiveRulesPage.tsx`
- Modify: `src/pages/ServerChecksPage.tsx`
- Modify: `src/pages/PhanQuyenPage.tsx`
- Create: `tests/unit/desktop-readiness.test.mjs`

**Interfaces:**
- Consumes: existing `StateBoundaryProps` and `onRetry`.
- Produces: `aria-busy` on loading, retry action beside errors, no toast-only validation.

- [ ] **Step 1: Write failing readiness contracts**

```js
test("async desktop pages use StateBoundary recovery", () => {
  for (const file of ["ActiveRulesPage.tsx", "ServerChecksPage.tsx", "PhanQuyenPage.tsx"]) {
    assert.match(read(`src/pages/${file}`), /StateBoundary/);
  }
  const boundary = read("src/components/ui/StateBoundary.tsx");
  assert.match(boundary, /aria-busy=\{state === "loading" \? true : undefined\}/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --import tsx --test tests/unit/desktop-readiness.test.mjs`

Expected: FAIL for the three pages and unified busy contract.

- [ ] **Step 3: Normalize StateBoundary semantics**

Make the non-loading wrapper expose `aria-busy={state === "loading" ? true : undefined}` through one shared wrapper; keep `role="alert"` only for errors and `role="status"` for non-errors. Do not move focus on background refresh.

- [ ] **Step 4: Adopt the boundary in async routes**

- `ActiveRulesPage`: replace ad-hoc loading/error cards with `StateBoundary`; keep the detailed technical message as `description`, and `onRetry={() => { void load(); }}`.
- `ServerChecksPage`: when initial `loading && !kpi`, show a skeleton; when `err && !kpi`, show error + retry; keep stale KPI visible during background refresh.
- `PhanQuyenPage`: extract `taiVaiTaiKhoan`, set `loading` before retry, and render an inline error boundary with `Thử lại`; do not hide or disable unrelated permission controls.

- [ ] **Step 5: Run GREEN and route regression**

Run:

```bash
node --import tsx --test tests/unit/desktop-readiness.test.mjs tests/unit/lotus-components.test.mjs
npm run typecheck
npm run build
```

Expected: all pass; retry stays beside the failed data region.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/StateBoundary.tsx src/pages/ActiveRulesPage.tsx src/pages/ServerChecksPage.tsx src/pages/PhanQuyenPage.tsx tests/unit/desktop-readiness.test.mjs
git commit -m "feat(ux): standardize desktop readiness recovery"
```

---

### Task 4: CTA labels and permission-visible affordance

**Files:**
- Modify: `src/features/today/TodayCommandCenter.tsx`
- Modify: `src/pages/UpdatePage.tsx`
- Modify: `src/components/dashboard/ReportsView.tsx`
- Create: `tests/unit/desktop-cta-copy.test.mjs`

**Interfaces:**
- Preserves: callbacks, export format, RPC and permission conditions.
- Produces exact visible copy: `Cập nhật <mã>`, `Xem <mã>`, `In / lưu PDF`, `Tải Excel · 5 sheet`, `Tải HTML`.

- [ ] **Step 1: Write failing copy tests**

```js
test("priority and export CTA say the result", () => {
  const today = read("src/features/today/TodayCommandCenter.tsx");
  const progress = read("src/pages/UpdatePage.tsx");
  const reports = read("src/components/dashboard/ReportsView.tsx");
  assert.match(today, /Cập nhật \{dau\.validationCode\}/);
  assert.match(progress, /Cập nhật.*pr-ma/);
  assert.match(reports, /In \/ lưu PDF/);
  assert.match(reports, /Tải Excel · 5 sheet/);
  assert.match(reports, /Tải HTML/);
  assert.doesNotMatch(reports, /> PDF<|> HTML<|Excel \(đủ 5 sheet\)/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --import tsx --test tests/unit/desktop-cta-copy.test.mjs`

Expected: FAIL on current `Mở`, `PDF`, `Excel (đủ 5 sheet)`, `HTML`.

- [ ] **Step 3: Change copy only**

- Today hero editable CTA: `Cập nhật {dau.validationCode}`. Read-only priority remains non-button text because no view callback exists; do not fake a disabled action.
- Progress hero first priority: `Cập nhật <mã>` when writable, `Xem <mã>` only where the existing callback opens a read-only detail.
- Reports: exact three labels from the interface block; add accessible names only if visible copy does not include the object.

- [ ] **Step 4: Run GREEN and verify 1366 geometry**

Run:

```bash
node --import tsx --test tests/unit/desktop-cta-copy.test.mjs
npm run typecheck
bash scripts/with-preview.sh -- npm run a11y -- --project=chromium
```

At 1366×768, inspect Today, Progress and Reports: primary CTA remains inside fold and no export button wraps to two lines. Overview, Alerts and Source CTA must remain unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/features/today/TodayCommandCenter.tsx src/pages/UpdatePage.tsx src/components/dashboard/ReportsView.tsx tests/unit/desktop-cta-copy.test.mjs
git commit -m "fix(ux): make desktop CTA outcomes explicit"
```

---

### Task 5: Motion tokens and truthful affordance

**Files:**
- Modify: `src/styles/lotus-tokens.css`
- Modify: shared non-Timeline sections in `src/index.css`
- Modify: `src/components/layout/Layout.tsx`
- Modify: `src/components/ui/Primitives.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/dashboard/CompletionDashboard.tsx`
- Modify: `src/pages/WorkloadPage.tsx`
- Modify: `src/pages/QrmPage.tsx`
- Create: `tests/unit/desktop-motion-affordance.test.mjs`

**Interfaces:**
- Consumes: `--lp-motion-fast`, `--lp-motion-ui`, `--lp-mo-modal`, `--lp-ease`.
- Produces: lift only on `.vmp-lift` interactive elements; no persistent `will-change`; reduced motion reaches final state immediately.

- [ ] **Step 1: Write failing CSS/source tests**

```js
test("shared cards do not promise clickability", () => {
  const primitives = read("src/components/ui/Primitives.tsx");
  const css = read("src/index.css");
  assert.doesNotMatch(primitives, /card fade vmp-lift-3d/);
  assert.doesNotMatch(css, /\.card:hover/);
  assert.doesNotMatch(css, /will-change:\s*transform/);
});

test("shared motion uses Lotus tokens and reduce reaches final state", () => {
  const css = read("src/index.css");
  assert.doesNotMatch(css, /--mo-fast:|--mo-base:|--mo-slow:/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.vmp-view-enter[\s\S]*animation:\s*none/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --import tsx --test tests/unit/desktop-motion-affordance.test.mjs`

Expected: FAIL for global card lift, duplicate token family and persistent compositing hints.

- [ ] **Step 3: Remove false affordance**

- `Card` renders `card fade ${cls}`; it does not add `vmp-lift-3d`.
- Delete `.card:hover` and the unused `.vmp-lift-3d` block; remove persistent `will-change`.
- Remove `vmp-lift` from noninteractive rows in `App.tsx`, `CompletionDashboard.tsx` and `QrmPage.tsx`.
- Keep `.vmp-lift` on native buttons/links and the existing Alerts `role="button"` target.

- [ ] **Step 4: Consolidate motion**

Use Lotus tokens directly:

```css
.vmp-lift {
  transition: transform var(--lp-motion-ui) var(--lp-ease),
              box-shadow var(--lp-motion-ui) var(--lp-ease),
              border-color var(--lp-motion-fast) var(--lp-ease);
}
.vmp-view-enter { animation: vmpViewIn var(--lp-mo-modal) var(--lp-ease) both; }
@keyframes vmpViewIn { from { opacity: 0; } to { opacity: 1; } }
```

Remove the desktop sidebar width/padding transition. Convert Workload and Completion progress bars from width animation to `transform: scaleX(value)` with `transform-origin: left`. Do not touch `.tl-*`, Timeline or Long Môn selectors.

- [ ] **Step 5: Harden reduced motion**

Inside existing shared `prefers-reduced-motion: reduce`, add explicit final-state rules for `.vmp-view-enter`, `.vmp-stagger > *`, `.vmp-lift`, toast spinner and dialogs: `animation: none`, `transition: none`, `transform: none`. Focus/data callbacks must not listen to `transitionend`.

- [ ] **Step 6: Run GREEN and browser regression**

Run:

```bash
node --import tsx --test tests/unit/desktop-motion-affordance.test.mjs tests/unit/lotus-components.test.mjs
npm run typecheck
npm run build
bash scripts/with-preview.sh -- node tests/e2e/giam-chuyen-dong.mjs
```

Expected: all pass; static Card does not move on hover, interactive actions retain hover/focus feedback.

- [ ] **Step 7: Commit**

```bash
git add src/styles/lotus-tokens.css src/index.css src/components/layout/Layout.tsx src/components/ui/Primitives.tsx src/App.tsx src/components/dashboard/CompletionDashboard.tsx src/pages/WorkloadPage.tsx src/pages/QrmPage.tsx tests/unit/desktop-motion-affordance.test.mjs
git commit -m "refactor(motion): make desktop feedback purposeful"
```

---

### Task 6: Lazy Reports, intent prefetch and enforceable performance budgets

**Files:**
- Create: `src/lib/routePrefetch.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Layout.tsx`
- Modify: `vite.config.js`
- Create: `scripts/check-desktop-performance-budgets.mjs`
- Modify: `scripts/do-hieu-nang.mjs`
- Modify: `package.json`
- Create: `tests/unit/desktop-performance-budget.test.mjs`

**Interfaces:**
- Produces: `prefetchDesktopRoute(screenId: ScreenId): void`; no-op for Save-Data, non-desktop and excluded screens.
- Produces: `npm run perf:budget` reading `dist/.vite/manifest.json` and exiting non-zero on approved gzip budgets.

- [ ] **Step 1: Write failing prefetch and budget tests**

```js
test("prefetch excludes Timeline and heavy export/3D", async () => {
  const { PREFETCHABLE_SCREEN_IDS } = await import("../../src/lib/routePrefetch.ts");
  assert.equal(PREFETCHABLE_SCREEN_IDS.includes("timeline"), false);
  assert.equal(PREFETCHABLE_SCREEN_IDS.includes("reports"), true);
});

test("budget helper rejects an oversized route", async () => {
  const { assertWithinBudget } = await import("../../scripts/check-desktop-performance-budgets.mjs");
  assert.throws(() => assertWithinBudget("reports", 51 * 1024, 50 * 1024), /reports/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --import tsx --test tests/unit/desktop-performance-budget.test.mjs`

Expected: FAIL because the prefetch module and budget script do not exist.

- [ ] **Step 3: Lazy-load Reports and add guarded intent prefetch**

Replace the static Reports import with:

```ts
const ReportsView = lazy(nhapCoThuLai(() => import("./components/dashboard/ReportsView.tsx")));
```

In `routePrefetch.ts`, map only in-scope lazy screens to their existing module imports. Return without importing when `navigator.connection?.saveData === true`, `matchMedia("(min-width: 761px)").matches` is false, or screen is not allowlisted. Attach `onPointerEnter` and `onFocus` to desktop sidebar buttons; do not prefetch Timeline, ExcelJS or 3D modules.

- [ ] **Step 4: Emit and inspect the build manifest**

Set `build.manifest: true`. Implement pure helpers that recursively total the entry’s static JS imports + CSS with `gzipSync`, excluding `dynamicImports`. For route budgets, total only the selected dynamic entry and its static imports not already in shell.

Explicit route map:

```js
export const ROUTE_BUDGETS = {
  "src/components/dashboard/ReportsView.tsx": 50 * 1024,
  "src/pages/AlertsPage.tsx": 100 * 1024,
  "src/pages/UpdatePage.tsx": 100 * 1024,
  "src/pages/SourceCatalogPage.tsx": 100 * 1024,
  "src/pages/WorkloadPage.tsx": 100 * 1024,
  "src/pages/ActiveRulesPage.tsx": 100 * 1024,
  "src/pages/PhanQuyenPage.tsx": 100 * 1024,
};
```

Exclude Timeline/Long Môn explicitly. Export helpers without executing when imported by tests; execute only when `import.meta.url === pathToFileURL(process.argv[1]).href`.

- [ ] **Step 5: Update lab script without crossing the boundary**

Change `MAN` to in-scope screens only and viewport to 1366×768. Register a `PerformanceObserver` via `evaluateOnNewDocument` for long tasks; print max long task and fail only in the budget script/CI, not in ad-hoc report mode. Do not edit or measure `timeline`.

- [ ] **Step 6: Add package commands and run GREEN**

```json
"perf:budget": "npm run build && node scripts/check-desktop-performance-budgets.mjs",
"perf:desktop": "node scripts/do-hieu-nang.mjs"
```

Run:

```bash
node --import tsx --test tests/unit/desktop-performance-budget.test.mjs
npm run perf:budget
npm run typecheck
```

Expected: shell ≤275 kB gzip, Reports ≤50 kB, all listed normal routes ≤100 kB. If a real route exceeds its budget, inspect the manifest and split only the responsible in-scope module; do not raise the budget or move code into Timeline chunks.

- [ ] **Step 7: Commit**

```bash
git add src/lib/routePrefetch.ts src/App.tsx src/components/layout/Layout.tsx vite.config.js scripts/check-desktop-performance-budgets.mjs scripts/do-hieu-nang.mjs package.json tests/unit/desktop-performance-budget.test.mjs
git commit -m "perf(desktop): enforce route budgets and intent loading"
```

---

### Task 7: Integrated verification and independent review

**Files:**
- Modify only if a verified defect is found: files owned by the failing task.
- Do not update visual baselines/seals.

**Interfaces:**
- Consumes: commits from Tasks 1–6.
- Produces: fresh verification evidence and an independent reviewer report.

- [ ] **Step 1: Run the focused contract suite**

```bash
node --import tsx --test \
  tests/unit/desktop-navigation-experience.test.mjs \
  tests/unit/toast-queue.test.mjs \
  tests/unit/toast-recovery.test.mjs \
  tests/unit/desktop-readiness.test.mjs \
  tests/unit/desktop-cta-copy.test.mjs \
  tests/unit/desktop-motion-affordance.test.mjs \
  tests/unit/desktop-performance-budget.test.mjs
```

- [ ] **Step 2: Run production and regression gates**

```bash
npm run typecheck
npm run perf:budget
npm run test:unit
npm run visual:matrix:count
npm run a11y
bash scripts/with-preview.sh -- node tests/e2e/desktop-navigation-experience.mjs
bash scripts/with-preview.sh -- node tests/e2e/giam-chuyen-dong.mjs
```

Do not run `visual:capnhat`; baseline mismatch is evidence, not permission to rewrite the seal.

- [ ] **Step 3: Verify forbidden-scope integrity**

```bash
git diff 68890b7..HEAD -- \
  src/pages/TimelinePage.tsx src/features/timeline src/features/monitoring/LongMonRace.tsx \
  src/features/monitoring/long-mon-race.css src/features/monitoring/longMonRaceModel.ts \
  tests/visual tests/e2e/long-mon-race.mjs
```

Expected: empty. Also run `git diff --check 68890b7..HEAD`.

- [ ] **Step 4: Independent review**

Reviewer checks against the approved spec: permissions/history unchanged, no SEO, no Timeline/Long Môn diff, toast timers/callback cleanup, filter focus preservation, copy accuracy, reduced motion, manifest math and no hidden dependency addition. Reviewer must inspect diffs, not rely on task reports.

- [ ] **Step 5: Fix only evidence-backed findings and rerun affected gates**

Use the original task’s tests as RED, patch the smallest production surface, rerun focused tests plus typecheck/build, then request reviewer re-check.

- [ ] **Step 6: Record final verification commit only if documentation changed**

If no docs changed, do not create an empty commit. Do not push, merge or deploy.

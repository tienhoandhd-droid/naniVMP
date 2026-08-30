# Overview Executive Botanical Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tinh gọn thanh lọc và biến Tổng quan VMP thành bảng điều hành gồm Đồng hồ năm có hào quang sen, Báo cáo nhanh Vali bằng WebP và Báo cáo tổng hợp hai tab không lặp Việc hôm nay.

**Architecture:** Giữ nguyên toàn bộ nguồn dữ liệu/công thức trong `App` và các dashboard hiện có. Thêm một model thuần cho nội dung Báo cáo nhanh, nâng SVG `VongNam` bằng geometry đồng hồ code-native, còn bố cục/filter/report tab dùng native React controls và một stylesheet feature-scoped. Một E2E Overview duy nhất kiểm hành vi thật qua fake Supabase strict-network.

**Tech Stack:** React 18, TypeScript 7, Vite 6, SVG/CSS, Puppeteer, Playwright Axe/visual, Node test runner + `tsx`.

## Global Constraints

- Làm trực tiếp trong dirty checkout hiện tại; không reset/checkout/restore, không commit và không push.
- Chỉ sửa thanh `GlobalFilterBar` đầy đủ và màn Overview; bản `rutGon`, `GlobalFilterBarLegacy`, Today/Timeline/Alerts giữ nguyên.
- Không đổi công thức, `filteredActs`, URL state, quyền, RPC/database, deadline/QRM hoặc dependency.
- Bỏ hoàn toàn `Chép liên kết`, cụm `shown / total hạng mục`, card `Việc gấp nhất` và disclosure `Phân tích chi tiết`.
- Vali Báo cáo nhanh dùng `vali-guide.webp`, `vali-concern.webp`, `vali-celebrate.webp`; không đổi Vali ở màn khác.
- Đồng hồ là lớp dữ liệu; hào quang sen chỉ trang trí, `aria-hidden` và không mã hóa số liệu.
- Test browser đặt `window.__REACT_GRAB_DISABLED__ = true`; mọi request ngoài preview/fake Supabase phải rỗng.
- Mobile 390px không overflow; control chính tối thiểu 43.5px; focus-visible và reduced-motion giữ đúng.
- Chỉnh file ứng dụng/test bằng `apply_patch`; kết thúc mỗi task bằng scoped diff checkpoint thay cho commit.

## File Map

- Modify `src/App.tsx`: GlobalFilterBar, bỏ urgent card, render Báo cáo tổng hợp tabs.
- Modify `src/components/dashboard/VongNam.tsx`: clock geometry + decorative lotus halo; giữ model/calendar/table.
- Modify `src/components/ui/Primitives.tsx`: PrincessCommentary dùng quick-report model + WebP.
- Create `src/features/overview/overviewQuickReport.ts`: pure mood/headline/signals/recommendation model.
- Create `src/features/overview/overview-executive.css`: filter, Vali quick report, report tabs/wrapper.
- Modify `src/features/monitoring/monitoring.css`: bỏ grid-area `wide` khỏi Overview layouts.
- Modify `src/main.tsx`: import stylesheet feature một lần.
- Create `tests/unit/overview-quick-report.test.mjs`: unit model.
- Modify `tests/unit/vong-nam-calendar.test.mjs`: clock-month state contract.
- Create `tests/e2e/overview-executive-dashboard.mjs`: one targeted real-browser flow.
- Existing targeted gates: `tests/a11y/a11y.spec.ts`, `tests/visual/lotus.spec.ts` (không đổi matrix).

---

### Task 1: GlobalFilterBar — chỉ còn thao tác lọc

**Files:**
- Modify: `src/App.tsx:1384-1610`
- Create: `src/features/overview/overview-executive.css`
- Modify: `src/main.tsx`
- Create/Test: `tests/e2e/overview-executive-dashboard.mjs`

**Interfaces:**
- Consumes unchanged: `deptSel`, `areaSel`, `period`, `customFrom`, `customTo`, person props/setters.
- Produces DOM contract: `.vmp-global-filter`, trigger `#vmp-global-filter-trigger`, panel `#vmp-global-filter-panel`, `.vmp-global-filter__chips`, `[data-global-filter-reset]`.

- [ ] **Step 1: Create strict browser harness and failing default-state assertions**

Use `caiGiaLap(..., { mangNghiemNgat: true, previewOrigin: APP_URL })`, `nhetPhien`, disable React Grab before document, navigate `#v=overview`, then assert:

```js
const filter = await page.$eval('[aria-label="Phạm vi toàn hệ thống"]', (root) => ({
  text: root.textContent || "",
  panels: root.querySelectorAll("#vmp-global-filter-panel").length,
  expanded: root.querySelector("#vmp-global-filter-trigger")?.getAttribute("aria-expanded"),
}));
assert.doesNotMatch(filter.text, /Chép liên kết|\/\s*\d+\s*hạng mục/);
assert.equal(filter.panels, 0);
assert.equal(filter.expanded, "false");
```

- [ ] **Step 2: Run RED before production edits**

Run: `$env:VMP_E2E_URL='http://127.0.0.1:5199'; node tests/e2e/overview-executive-dashboard.mjs`  
Expected: FAIL because share/count still exist and trigger ids/panel contract do not.

- [ ] **Step 3: Remove share/count state and props without changing filter state**

In `GlobalFilterBar` remove `daChep`, `chepLien`, share button, result/tooltip block and no-longer-used `shown`, `total`, `soNgung` props/call-site arguments. Remove icon imports only if repository search proves no other usage.

- [ ] **Step 4: Replace inline shell with two-row semantic structure**

Keep `role="group" aria-label="Phạm vi toàn hệ thống"`; render:

```tsx
<div className="vmp-global-filter__primary">
  <span className="vmp-global-filter__scope"><Filter aria-hidden="true" />Toàn hệ thống</span>
  {/* existing authorized person select */}
  <button id="vmp-global-filter-trigger" ref={triggerRef} type="button"
    aria-haspopup="dialog" aria-expanded={open}
    aria-controls="vmp-global-filter-panel">Bộ lọc{soLoc ? ` (${soLoc})` : ""}</button>
</div>
{(deptSel.length || areaSel.length || (!todayMode && (customFrom || customTo))) ? (
  <div className="vmp-global-filter__chips">{/* current exact chips */}</div>
) : null}
```

Do not duplicate selected person as a chip.

- [ ] **Step 5: Rebuild filter panel with native groups and focus return**

Panel remains conditionally mounted, receives `id="vmp-global-filter-panel"`, `aria-labelledby="vmp-global-filter-trigger"`; wrap Date/Department/Area in `fieldset/legend`. Add `Escape` listener only while open:

```ts
if (event.key === "Escape") {
  setOpen(false);
  requestAnimationFrame(() => triggerRef.current?.focus());
}
```

Keep click-outside behavior. Add footer button `Xong` that closes and focuses trigger. `Xóa tất cả` appears only in chip row with `data-global-filter-reset` and calls existing `resetAll`.

- [ ] **Step 6: Add scoped responsive/focus CSS**

Implement `.vmp-global-filter*` in `overview-executive.css`: one primary row, conditional chip row, botanical surface/hairline, panel width `min(420px, calc(100vw - 32px))`, 44px mobile controls, no global pill override. Import after shared styles in `main.tsx`.

- [ ] **Step 7: Complete behavioral E2E filter assertions**

Open trigger, prove ids/ARIA, click one Department and one Area fixture option, verify exact chips and active count, remove one chip and prove only that facet clears, press Escape and assert trigger focused, reopen/reset and assert URL/filter controls clear. At 390px assert document overflow ≤1 and visible filter controls ≥43.5px.

- [ ] **Step 8: GREEN/checkpoint**

Run strict E2E, `npm run typecheck`, and:

```powershell
git diff --check -- src/App.tsx src/features/overview/overview-executive.css src/main.tsx tests/e2e/overview-executive-dashboard.mjs
```

---

### Task 2: VongNam — Đồng hồ năm với hào quang sen

**Files:**
- Modify: `src/components/dashboard/VongNam.tsx`
- Modify: `src/index.css:5797-5845`
- Modify/Test: `tests/unit/vong-nam-calendar.test.mjs`
- Extend/Test: `tests/e2e/overview-executive-dashboard.mjs`

**Interfaces:**
- Keep `dungVongNam(acts, nam, bangkokToday): OThangNam[]` and all `VongNam` props unchanged.
- Produce pure helper:

```ts
export interface DongHoThangNam extends OThangNam {
  tiLeXong: number;
  trangThai: "past" | "current" | "future";
}
export function dungDongHoNam(o: readonly OThangNam[]): DongHoThangNam[];
```

- [ ] **Step 1: Add failing unit tests for fixed 12-month clock semantics**

```js
test("annual clock keeps twelve fixed months and honest completion ratios", () => {
  const result = dungDongHoNam([
    { thang: 0, tong: 4, xong: 1, daQua: true, dangChay: false },
    { thang: 1, tong: 0, xong: 0, daQua: false, dangChay: true },
  ]);
  assert.equal(result.length, 12);
  assert.deepEqual(result.slice(0, 2).map(({ tiLeXong, trangThai }) => ({ tiLeXong, trangThai })), [
    { tiLeXong: 0.25, trangThai: "past" },
    { tiLeXong: 0, trangThai: "current" },
  ]);
});
```

- [ ] **Step 2: Run RED**

Run: `node --import tsx --test tests/unit/vong-nam-calendar.test.mjs`  
Expected: FAIL missing `dungDongHoNam`.

- [ ] **Step 3: Implement clock state helper**

Normalize by month index 0..11, clamp `xong/tong` to `[0,1]`, derive state from existing `daQua/dangChay`; do not re-read dates or statuses.

- [ ] **Step 4: Replace radial volume petals with a clock face**

Retain fixed month angles and `gocHomNay`. Draw code-native SVG layers in this order:

1. `<g aria-hidden="true" className="vmp-vongnam-sen">` with 12 identical low-opacity petal outlines rotated by 30°; no data props/colors.
2. Base circle and 60 ticks, every fifth tick major.
3. Twelve fixed 30° month tracks. Within each track draw green completed portion by `tiLeXong`; remaining portion uses existing past/current/future semantic color.
4. Month labels T1–T12 and visible counts from `x.tong`.
5. `Hôm nay` hand and dot.

Keep center HTML, dynamic aria narrative, legend and 12-month table unchanged.

- [ ] **Step 5: Adapt only VongNam CSS**

Add clock/petal classes and preserve current container-query layout. Decorative petals use `var(--lp-gold-hairline)`/token color, opacity ≤.28, `pointer-events:none`; mobile reduces or hides petals but never data arcs.

- [ ] **Step 6: Extend browser assertions**

Assert exactly 12 `[data-vongnam-month]`, 12 decorative `[data-vongnam-petal]` inside an `aria-hidden` group, one `[data-vongnam-today]`, dynamic SVG accessible name, and existing table button still reveals 12 rows.

- [ ] **Step 7: GREEN/checkpoint**

Run unit + targeted E2E + typecheck + scoped diff-check.

---

### Task 3: Báo cáo nhanh Vali — WebP, ngắn và tổng hợp

**Files:**
- Create: `src/features/overview/overviewQuickReport.ts`
- Create/Test: `tests/unit/overview-quick-report.test.mjs`
- Modify: `src/components/ui/Primitives.tsx:25-205`
- Modify: `src/features/overview/overview-executive.css`
- Extend/Test: `tests/e2e/overview-executive-dashboard.mjs`

**Interfaces:**
- Produce:

```ts
export type OverviewQuickMood = "guide" | "concern" | "celebrate";
export interface OverviewQuickReport {
  mood: OverviewQuickMood;
  headline: string;
  signals: Array<{ tone: "success" | "danger" | "warning" | "info"; text: string }>;
  recommendation: string;
}
export function buildOverviewQuickReport(input: {
  rate: number; todo: number; overdue: number; soon: number; mismatched: number;
}): OverviewQuickReport;
```

- [ ] **Step 1: Write failing priority/length unit tests**

Test concern prioritizes overdue, then soon, then mismatch; `signals.length <= 3`; clean/high-rate returns celebrate; all output is deterministic and has no time greeting.

- [ ] **Step 2: Run RED**

Run: `node --import tsx --test tests/unit/overview-quick-report.test.mjs`  
Expected: FAIL missing module.

- [ ] **Step 3: Implement minimal pure model**

Reuse the existing mood thresholds exactly (`overdue >= 3 || rate < 30`, clean + rate ≥70, else guide). Build candidates in business priority order and `.slice(0, 3)`. Headline is one synthesis sentence, recommendation one closing sentence.

- [ ] **Step 4: Replace commentary rendering with WebP assets**

Import the three non-chibi assets and model. Remove hour greeting and long inline remark builder. Render:

```tsx
<section className="overview-quick-report" aria-label="Báo cáo nhanh của Vali">
  <img src={MOOD_IMAGE[report.mood]} alt={`Công chúa Vali ${NHAN_MOOD[report.mood]}`} width="176" height="220" />
  <div>
    <p className="overview-quick-report__eyebrow">Báo cáo nhanh</p>
    <h2>{report.headline}</h2>
    <ul>{report.signals.map(/* max three */)}</ul>
    <p>{report.recommendation}</p>
  </div>
</section>
```

Do not alter `ValiIllustration` or other screen usages.

- [ ] **Step 5: Add responsive CSS and E2E assertions**

Desktop horizontal, mobile image ≤112px and text first in reading order if needed. E2E proves one WebP asset, exact label, signal count 1..3, no time greeting, and no horizontal overflow.

- [ ] **Step 6: GREEN/checkpoint**

Run quick-report unit + targeted E2E + typecheck + scoped diff-check.

---

### Task 4: Remove duplicated urgent work and expose Báo cáo tổng hợp tabs

**Files:**
- Modify: `src/App.tsx:1025-1232`
- Modify: `src/features/monitoring/monitoring.css`
- Modify: `src/features/overview/overview-executive.css`
- Extend/Test: `tests/e2e/overview-executive-dashboard.mjs`

**Interfaces:**
- Local tab type: `type OverviewReportTab = "flow" | "structure"`.
- DOM contract: `.overview-report`, `[role="tablist"][aria-label="Nội dung báo cáo tổng hợp"]`, tabs `#overview-report-tab-flow`/`-structure`, panel `#overview-report-panel`.

- [ ] **Step 1: Add failing browser assertions before production edits**

Assert body does not contain `Việc gấp nhất`; no `.b-wide`; one visible `Báo cáo tổng hợp`; no disclosure button text `Phân tích chi tiết`; default selected tab is `Dòng chảy tiến độ`, only `MaTranTienDo` root is present; clicking `Cơ cấu hoàn thành` switches `aria-selected` and mounts CompletionDashboard root.

- [ ] **Step 2: Run RED**

Expected: FAIL on current urgent card/disclosure/tab contract.

- [ ] **Step 3: Remove only duplicated urgent-work derivation and card**

Delete `vieCGap` `useMemo`, `.b-wide` JSX and imports used only there. Do not change `destinations.today` or the Today screen.

- [ ] **Step 4: Replace `sau` disclosure with semantic local tabs**

Rename state to `reportTab`; always render section/header/tablist. Native buttons set the local tab. Render exactly one child:

```tsx
<div id="overview-report-panel" role="tabpanel"
  aria-labelledby={`overview-report-tab-${reportTab}`}>
  {reportTab === "flow" ? <MaTranTienDo acts={acts} /> : <CompletionDashboard acts={acts} />}
</div>
```

- [ ] **Step 5: Update Overview grid and report CSS**

Remove `wide` from every `.vmp-bento` grid-template-area in `monitoring.css`; keep order hero → support cards → Vali → report. Style report header/tab as one editorial surface, mobile targets ≥44px, no duplicated card border around nested dashboards.

- [ ] **Step 6: GREEN/checkpoint**

Run targeted E2E, monitoring/unit baseline, typecheck and scoped diff-check.

---

### Task 5: Final focused accessibility, visual and build gates

**Files:**
- Review only: all files above.
- Local artifacts: Overview screenshots at 1440, 1024 and 390; Windows-only visual baselines if required.

**Interfaces:**
- Consumes completed Tasks 1–4.
- Produces local review evidence only; no commit/push.

- [ ] **Step 1: Run targeted unit bundle**

```powershell
node --import tsx --test tests/unit/overview-quick-report.test.mjs tests/unit/vong-nam-calendar.test.mjs tests/unit/ui-ux-baseline.test.mjs
```

- [ ] **Step 2: Run strict Overview E2E**

```powershell
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:VMP_E2E_URL='http://127.0.0.1:5199'
node tests/e2e/overview-executive-dashboard.mjs
```

Save exact screenshots under `%TEMP%`: `overview-executive-1440.png`, `overview-executive-1024.png`, `overview-executive-390.png`.

- [ ] **Step 3: Run Overview Axe only**

```powershell
$env:VMP_E2E_URL='http://127.0.0.1:5199'
npx playwright test -c playwright.a11y.config.ts --grep "axe · tong-quan"
```

- [ ] **Step 4: Run Overview visual only**

```powershell
npx playwright test -c playwright.visual.config.ts --grep "tong-quan · (light|dark)"
```

On Windows, update only ignored Win32 Overview snapshots if the intentional redesign has no text clipping/overlap; never modify tracked Linux baselines from this session. Rerun without update and require 6/6 pass.

- [ ] **Step 5: Typecheck/build/lint/diff gates**

```powershell
npm run typecheck
npm pkg get scripts.lint
npm run build
git diff --check
```

If standard build fails only with the known `.env` `EPERM`, run the approved Vite fallback with a unique temporary `envDir`, `VITE_SUPABASE_URL=https://build.invalid`, and `VITE_SUPABASE_ANON=local-build-anon`; require exit 0 and do not print/read real secrets.

- [ ] **Step 6: Visual inspection and handoff**

Inspect all three screenshots: filter one-line default; no count/share/urgent card; clock data legible and lotus subdued; Vali concise; report tabs visible/correct; no overflow/clipping. Report exact files, reasons, commands/results, screenshot paths, known `.env` ACL, and that existing dirty changes remain untouched.

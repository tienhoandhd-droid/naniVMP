# Compact Progress Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the crowded progress filter block with a compact primary toolbar and an accessible inline advanced-filter panel without changing filtering results.

**Architecture:** Keep all existing filter state and facet calculations in `UpdatePage.tsx`. Add a small pure UI-state helper for advanced-filter counting, then recompose `.pr-loc` into primary and advanced regions and update only progress-specific CSS.

**Tech Stack:** React 18, TypeScript, CSS, Node test runner, Puppeteer E2E, Vite.

## Global Constraints

- Preserve all existing filter semantics, permissions, KPI behavior, pagination, and result ordering.
- Keep `Cần xử lý` and `Quá hạn` visible as quick filters; do not duplicate them inside advanced filters.
- Advanced filters remain inline and keyboard accessible through native controls.
- Mobile controls have at least 44px touch height and must not create horizontal overflow at 390px.
- Do not commit during execution because the imported local worktree already contains unrelated uncommitted changes.

---

### Task 1: Advanced-filter UI state

**Files:**
- Create: `src/features/progress/progressFilterUi.ts`
- Create: `tests/unit/progress-filter-ui.test.mjs`

**Interfaces:**
- Produces: `isDetailedProgressFix(fix: string): boolean`.
- Produces: `countProgressAdvancedFilters(input: ProgressAdvancedFilterState): number`.

- [ ] **Step 1: Write the failing unit test**

Cover the literal cases: defaults return `0`; quick fixes `can_xu_ly` and `qua_han` return `0`; status + stage + period + stopped + a detailed fix return `5`; a detailed fix is recognized while quick fixes are not.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --import tsx --test tests/unit/progress-filter-ui.test.mjs`

Expected: failure because `progressFilterUi.ts` does not exist.

- [ ] **Step 3: Implement the pure helper**

Use this input shape:

```ts
export interface ProgressAdvancedFilterState {
  fix: string;
  status: string;
  stage: string;
  period: string;
  showStopped: boolean;
}
```

Count each non-default advanced dimension once. Count `fix` only when it is one of `done_no_date`, `no_deadline`, `no_owner`, or `mismatch`.

- [ ] **Step 4: Run the unit test and verify GREEN**

Run: `node --import tsx --test tests/unit/progress-filter-ui.test.mjs`

Expected: all cases pass.

### Task 2: Compact filter composition and responsive styling

**Files:**
- Modify: `src/pages/UpdatePage.tsx`
- Modify: `src/features/progress/progress.css`
- Create: `tests/e2e/progress-compact-filters.mjs`

**Interfaces:**
- Consumes: `countProgressAdvancedFilters` and `isDetailedProgressFix` from Task 1.
- Preserves: existing `q`, `fix`, `fst`, `stageF`, `period`, `hienNgung`, `clearFilters`, `stageCount`, `fixCount`, and `list` behavior.

- [ ] **Step 1: Write the failing E2E contract**

With the existing `day` Supabase fixture, assert:

```js
await page.waitForSelector('.pr-loc[aria-label="Lọc danh sách tiến độ"]');
assert primary toolbar has search, two quick-filter buttons, and `Bộ lọc`;
assert advanced panel is initially hidden;
click `Bộ lọc` and assert status, stage, period, and detailed issue controls are visible;
click `Cần xử lý` and assert `aria-pressed="true"`;
click `Xóa lọc` and assert quick filter resets;
assert document width does not overflow at 390px;
```

- [ ] **Step 2: Run E2E and verify RED**

Run with `CHROME_PATH` set to the installed Chrome:

`node tests/e2e/progress-compact-filters.mjs`

Expected: failure because the new toolbar structure and labels do not exist.

- [ ] **Step 3: Recompose the React filter block**

Add `moLocNangCao` state, compute `soLocNangCao`, and render:

- `.pr-loc__chinh`: search, quick-filter group, advanced toggle, result count, conditional clear button.
- `#progress-advanced-filters`: labeled native selects, stopped checkbox, and only the four detailed issue chips.
- `aria-expanded`, `aria-controls`, `aria-pressed`, `role="group"`, and visible labels.
- Auto-open the advanced panel when a detailed issue filter becomes active.
- Close the panel after `Xóa lọc` while resetting all existing filter state.

- [ ] **Step 4: Implement compact responsive CSS**

Replace the generic two-row rules with styles for `.pr-loc__chinh`, `.pr-loc__nhanh`, `.pr-loc__mo`, `.pr-loc__nang-cao`, `.pr-loc__truong`, and `.pr-loc__xoa`. Keep tokenized colors and existing focus-ring language. At `max-width: 768px`, make search full width and controls at least 44px tall; at 390px, allow wrapping without horizontal overflow.

- [ ] **Step 5: Run targeted tests and inspect screenshots**

Run:

- `node --import tsx --test tests/unit/progress-filter-ui.test.mjs tests/unit/progress-workspace-model.test.mjs`
- `npm run typecheck`
- `node tests/e2e/progress-compact-filters.mjs`

Capture the filter block at 1440px and 390px and visually confirm compact hierarchy, labels, wrapping, and selected states.

- [ ] **Step 6: Run final project gates**

Run `git diff --check`. Run the production Vite build with the temporary `envDir` workaround because Windows ACL blocks direct reads of `.env`. Record that no lint script exists in `package.json`.

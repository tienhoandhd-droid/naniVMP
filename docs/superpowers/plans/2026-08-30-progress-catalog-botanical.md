# Progress and Catalog Botanical Editorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove duplicated progress KPIs and rebuild the progress table and object-grouped Catalog presentation as a compact Botanical Editorial workflow while preserving the existing edit modal and data rules.

**Architecture:** Keep all filtering, permission, pagination, and update state in the existing page components. Recompose only rendered markup, add feature-scoped CSS for Catalog, and prove both grouping modes through one real-browser contract that exercises navigation, filters, accordions, and the existing edit dialog.

**Tech Stack:** React 18, TypeScript, CSS, Lucide icons, Puppeteer, Node test runner, Vite.

## Global Constraints

- Preserve `ProgressEditModal`, filter semantics, facet counts, pagination, permissions, optimistic locking, and ALCOA+ reason requirements.
- Remove `MetricGrid` only from `UpdatePage`; do not modify the shared component or Today screen.
- Remove only the selected Catalog note “Thêm đối tượng mới…”.
- Use existing Lotus tokens and CSS pseudo-elements; add no new bitmap assets or dependencies.
- Keep mobile touch targets at least 44px and prevent page-level horizontal overflow at 390px.
- Do not commit because the imported local worktree contains unrelated uncommitted changes.

---

### Task 1: Browser acceptance contract

**Files:**
- Create: `tests/e2e/progress-catalog-botanical.mjs`

**Interfaces:**
- Consumes: the existing `day` Supabase fixture and `#v=progress` route.
- Produces: a browser contract shared by the two implementation tasks.

- [ ] **Step 1: Write the failing progress-mode assertions**

Launch Chrome with `caiGiaLap` and `nhetPhien`, then assert:

```js
assert(!document.querySelector(".lp-metric-grid"));
assert.deepEqual(tableHeaders, ["Hạng mục", "Loại", "QA", "Mốc & hạn", "Trạng thái", "Cập nhật"]);
click the first enabled `Cập nhật` button;
assert a dialog opens for that exact row code;
```

- [ ] **Step 2: Write the failing object-mode assertions**

Switch to `Theo đối tượng`, then assert the removed note is absent, `.catalog-progress__primary` contains search and an advanced toggle, the advanced panel starts hidden and reveals exactly five selects, and the first object trigger links `aria-controls` to a real detail panel.

- [ ] **Step 3: Add responsive assertions**

At 390px, assert page overflow is at most one pixel and every visible primary filter button/input is at least 44px high. Support optional desktop/mobile screenshot paths through environment variables.

- [ ] **Step 4: Run E2E and verify RED**

Run: `node tests/e2e/progress-catalog-botanical.mjs` with `CHROME_PATH` set.

Expected: failure because the KPI strip and old eight-column table still exist.

### Task 2: Botanical progress table

**Files:**
- Modify: `src/pages/UpdatePage.tsx`
- Modify: `src/features/progress/progress.css`

**Interfaces:**
- Preserves: `q`, `fix`, `fst`, `stageF`, `period`, `hienNgung`, `lat`, `maQuaHan`, `ProgressEditModal` and existing action callbacks.
- Produces: six-column `.pr-table` rows with `data-progress-item` unchanged.

- [ ] **Step 1: Remove duplicated KPI presentation**

Delete the `MetricGrid` import, the four-item JSX block, and `soDangLam` if it becomes unused. Do not alter the model calculations used by Vali.

- [ ] **Step 2: Recompose each desktop row into six columns**

Render code/name together in `.pr-hangmuc`, keep type and QA separate, render stage/deadline together in `.pr-moc`, retain `Pill`, quick-complete and `Cập nhật` actions, and change empty-state `colSpan` from eight to six.

- [ ] **Step 3: Add Botanical table styling**

Make `.pr-th` sticky, add a subtle gold hairline and lotus-petal marker to overdue rows, strengthen code/name hierarchy, and keep action buttons clear without turning rows into clickable controls. Preserve `.pr-row--focus` and desktop/mobile exclusivity.

- [ ] **Step 4: Run the browser contract**

Expected: progress-mode assertions pass and execution advances to the still-failing Catalog assertions.

### Task 3: Botanical Catalog shell and accordion

**Files:**
- Modify: `src/pages/CatalogPage.tsx`
- Create: `src/features/catalog/catalog.css`
- Modify: `src/main.tsx`

**Interfaces:**
- Preserves: `q`, `cls`, `dept`, `status`, `year`, `tdinh`, `groups`, `lat`, `toggle`, `onMoDanhMuc`, and `ProgressEditModal`.
- Produces: `.catalog-progress`, `.catalog-progress__primary`, `#catalog-progress-advanced-filters`, and stable object detail ids.

- [ ] **Step 1: Remove the selected note and add compact filter state**

Delete the note block. Add `moLocCatalog`, an active advanced-filter count based on the five existing select states, `hasCatalogFilter`, and a clear function that resets existing defaults and closes the panel.

- [ ] **Step 2: Recompose the Catalog header and filters**

Keep the title and count, render a primary row with search, `Bộ lọc`, result count, and conditional `Xóa lọc`, then move the five labeled native selects into the hidden/visible advanced panel with `aria-expanded` and `aria-controls`.

- [ ] **Step 3: Add accessible object accordion structure**

Generate a stable id from each object code, add `aria-expanded`/`aria-controls` to the trigger, assign the id to the detail region, and add feature classes to the object header, summary badges, source-link strip, type groups, milestone table, and action buttons. Keep every existing value and callback.

- [ ] **Step 4: Implement feature-scoped Botanical CSS**

Import `src/features/catalog/catalog.css` from `main.tsx`. Use Lotus tokens for the compact card, petal pseudo-elements, accordion open state, milestone table, focus rings, mobile wrapping, 44px controls, and local table scrolling.

- [ ] **Step 5: Run E2E and inspect screenshots**

Run the full browser contract and inspect 1440px and 390px captures for hierarchy, whitespace, selected state, sticky headers, local scrolling, and lack of page overflow.

### Task 4: Final verification

**Files:**
- Test: `tests/e2e/progress-catalog-botanical.mjs`
- Test: existing targeted progress and Catalog-related unit tests.

- [ ] **Step 1: Run targeted automated gates**

Run:

- `node --import tsx --test tests/unit/progress-filter-ui.test.mjs tests/unit/progress-workspace-model.test.mjs`
- `npm run typecheck`
- `node tests/e2e/progress-catalog-botanical.mjs`
- `git diff --check`

- [ ] **Step 2: Run production build**

Use the established Vite programmatic build with a temporary `envDir`, because Windows ACL blocks direct reads of `.env`. Record that `package.json` has no lint script.

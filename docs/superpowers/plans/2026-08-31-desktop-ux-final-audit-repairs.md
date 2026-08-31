# Desktop UX Final Audit Repairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair all confirmed desktop UX/UI audit defects outside Timeline/Long Môn, preserve behavior, then verify, push `main`, and deploy.

**Architecture:** Extend the existing Lotus Pearl foundation instead of adding another UI layer: theme-safe semantic pairs, a global keyboard-focus fallback, semantic `CardTitle`, and the established `ViewportDialog`. Apply those contracts in bounded route groups. Mutation/data functions remain unchanged; only presentation, validation feedback, focus, and semantics move.

**Tech Stack:** React 18, TypeScript, Vite, CSS, Node test runner with `tsx`, Puppeteer/Playwright mocked browser suites.

## Global Constraints

- Desktop web only.
- Do not modify `src/pages/TimelinePage.tsx`, `src/features/timeline/**`, Long Môn components/styles/tests, or mobile-specific layout rules.
- Do not modify SEO, database schema, Supabase RPC/RLS, authorization policy, or business calculations.
- Preserve URLs, permissions, filter/report calculations, mutation payloads, retry behavior, and audit history.
- Use existing Lotus Pearl tokens/primitives; no dependency or second design system.
- Every production behavior change requires a failing test observed before implementation.
- Commit each task separately; task review and final review are mandatory.
- Push to `origin/main` only after fresh full verification; monitor GitHub Actions deployment to completion.

---

### Task 1: Foundation contrast, keyboard focus, headings, and targeted readability

**Files:**
- Create: `tests/e2e/desktop-ux-final-audit.mjs`
- Modify: `tests/unit/ui-ux-baseline.test.mjs`
- Modify: `src/styles/lotus-tokens.css`
- Modify: `src/styles/lotus-components.css`
- Modify: `src/styles/lotus-shell.css`
- Modify: `src/features/monitoring/monitoring.css`
- Modify: `src/features/analysis/analysis.css`
- Modify: `src/components/ui/Primitives.tsx`
- Modify: `src/pages/WorkloadPage.tsx`
- Modify: `src/components/dashboard/ReportsView.tsx`

**Interfaces:**
- Produces: semantic `--lp-on-gold`; global native-control `:focus-visible` fallback; `CardTitle` prop `level?: 2 | 3`; runtime audit script reusable in final verification.
- Consumes: existing `--lp-focus`, `--lp-on-plum`, mocked Supabase browser harness.

- [ ] **Step 1: Write failing render and runtime tests**

Add a real `CardTitle` static-render assertion to `ui-ux-baseline.test.mjs`:

```js
const html = renderToStaticMarkup(React.createElement(CardTitle, { level: 3 }, "Phạm vi"));
assert.match(html, /<h3[^>]*>Phạm vi<\/h3>/);
```

Create `desktop-ux-final-audit.mjs` using `puppeteer-core`, `CHROME`, `caiGiaLap`, and `nhetPhien`. At 1440×1000, assert observable computed behavior:

```js
assert.ok(contrast(activeMetric.color, activeMetric.backgroundColor) >= 4.5);
assert.ok(contrast(alertCta.color, alertCta.backgroundColor) >= 4.5);
assert.ok(contrast(permissionFlag.color, permissionFlag.backgroundColor) >= 4.5);
assert.ok(Number.parseFloat(masthead.fontSize) >= 12);
assert.ok(Number.parseFloat(journeyLabel.fontSize) >= 12);
assert.ok(reportLink.height >= 32 && workloadLink.height >= 32);
await control.focus();
assert.notEqual(await control.evaluate((el) => getComputedStyle(el).outlineStyle), "none");
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --import tsx --test tests/unit/ui-ux-baseline.test.mjs
bash scripts/with-preview.sh -- node tests/e2e/desktop-ux-final-audit.mjs --case foundation
```

Expected: heading-level assertion fails because `CardTitle` emits a `div`; runtime checks fail on the measured 1.06:1/3.73:1 pairs, absent focus ring, 10–11px repeated labels, and 16.8px links.

- [ ] **Step 3: Implement the minimum foundation change**

Implement `CardTitle({ level = 2 })` using a selected `h2`/`h3` element with the current visual styles. Add `--lp-on-gold` as a dark ink foreground in both theme maps. Use `--lp-on-plum` for active Monitoring Journey metrics, `--lp-on-gold` for gold CTA text, and a verified semantic success pair for enabled permission flags. Add a global native-control `:focus-visible` outline using `--lp-focus` with sufficient specificity/`!important` only to defeat legacy inline `outline:none`. Raise only the masthead subtitle and Monitoring Journey 10–11px labels to 12px. Give the two audited route links `display:inline-flex; align-items:center; min-height:32px` and focus-visible styling.

- [ ] **Step 4: Verify GREEN and regressions**

Run both Step 2 commands, then:

```bash
npm run typecheck
npm run drift
```

Expected: all exit 0; runtime computed styles meet acceptance thresholds.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/desktop-ux-final-audit.mjs tests/unit/ui-ux-baseline.test.mjs src/styles/lotus-tokens.css src/styles/lotus-components.css src/styles/lotus-shell.css src/features/monitoring/monitoring.css src/features/analysis/analysis.css src/components/ui/Primitives.tsx src/pages/WorkloadPage.tsx src/components/dashboard/ReportsView.tsx
git commit -m "fix(ux): restore desktop contrast and keyboard focus"
```

---

### Task 2: Catalog confirmation dialog and required-reason recovery

**Files:**
- Modify: `tests/unit/catalog-impact-preview.test.mjs`
- Create: `tests/unit/catalog-record-dialog-ux.test.mjs`
- Modify: `tests/e2e/catalog-workspace.mjs`
- Modify: `src/components/catalog/CatalogImpactPreview.tsx`
- Modify: `src/features/catalogWorkspace/CatalogRecordDialog.tsx`

**Interfaces:**
- Consumes: `ViewportDialog`, unchanged `createCatalogImpactApplyCoordinator`, `saveRecord`, and toast API.
- Produces: modal-safe catalog impact presentation and observable missing-reason validation state.

- [ ] **Step 1: Write failing dialog tests**

Extend the preview render test to require the shared structure and footer behavior:

```js
assert.match(html, /class="lp-dialog"/);
assert.match(html, /role="dialog"/);
assert.match(html, /aria-modal="true"/);
assert.doesNotMatch(html, /z-index:\s*70/i);
```

Extract a small pure model from `CatalogRecordDialog` through the wished-for interface and test it first:

```js
assert.deepEqual(requiredReasonState(true, ""), {
  invalid: true,
  message: "Hãy ghi lý do thay đổi để lưu vào nhật ký.",
});
assert.deepEqual(requiredReasonState(true, "  Điều chỉnh kế hoạch  "), { invalid: false, message: null });
```

Add a catalog E2E assertion that opens the impact preview while chat is open, verifies the shared modal is the top hit target at the dialog footer coordinates, and verifies Tab stays inside it.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --import tsx --test tests/unit/catalog-impact-preview.test.mjs tests/unit/catalog-record-dialog-ux.test.mjs
bash scripts/with-preview.sh -- node tests/e2e/catalog-workspace.mjs
```

Expected: missing shared dialog markup/model exports and overlay hit-test/focus assertions fail for the confirmed root causes.

- [ ] **Step 3: Implement dialog and validation behavior**

Wrap `CatalogImpactPreviewContent` in `ViewportDialog` with `maxWidth={880}`, move title/description to shared props and buttons to `footer`, preserve every preview section and coordinator lock, and reject close requests while applying. In `CatalogRecordDialog`, add `reasonError`/focus state, remove empty reason from the Save disabled expression, validate on Save, set `aria-required`, `aria-invalid`, `aria-describedby`, render inline `role="alert"`, and focus the reason input. Preserve payload and typed text on server failure; dialog error is the recovery source.

- [ ] **Step 4: Verify GREEN and regressions**

Run the Step 2 commands plus:

```bash
npm run typecheck
node --import tsx --test tests/unit/dialog-state.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add tests/unit/catalog-impact-preview.test.mjs tests/unit/catalog-record-dialog-ux.test.mjs tests/e2e/catalog-workspace.mjs src/components/catalog/CatalogImpactPreview.tsx src/features/catalogWorkspace/CatalogRecordDialog.tsx
git commit -m "fix(catalog): make confirmation and reason recovery accessible"
```

---

### Task 3: Migrate non-Timeline legacy modal callers

**Files:**
- Create: `tests/unit/non-timeline-dialogs.test.mjs`
- Modify: `src/pages/AlertsPage.tsx`
- Modify: `src/pages/WorkloadPage.tsx`
- Modify: `src/components/dashboard/MaTranTienDo.tsx`
- Modify: `src/components/dashboard/ProgressEditModal.tsx`
- Modify: `src/components/dashboard/ChiTietKyModal.tsx`
- Modify: `src/components/ai/AiMailModal.tsx`

**Interfaces:**
- Consumes: `ViewportDialogProps` and each flow's existing `onClose`/submit handlers.
- Produces: one accessible dialog behavior on every audited non-Timeline route. The legacy `Modal` remains only for the excluded Timeline caller.

- [ ] **Step 1: Write failing real-render contracts**

For exported modal components, render representative states and assert `lp-dialog`, labelled `role="dialog"`, and shared footer. For route-local modal bodies that cannot render independently, extract/export the modal component without changing behavior, then test it through real static rendering. The test must exercise rendered components rather than grep implementation text. Timeline exclusion is verified from the final Git diff.

- [ ] **Step 2: Verify RED**

```bash
node --import tsx --test tests/unit/non-timeline-dialogs.test.mjs
```

Expected: audited callers still emit/import legacy `Modal` and lack shared dialog markup.

- [ ] **Step 3: Migrate callers minimally**

Replace each audited `Modal` wrapper with `ViewportDialog open`. Map `title`, `icon`, `description`, `maxWidth`, `onRequestClose`, and action rows to `footer`; keep body form/table components and event handlers unchanged. Do not edit the legacy primitive or any Timeline file so Timeline behavior is byte-for-byte outside the diff.

- [ ] **Step 4: Verify GREEN**

```bash
node --import tsx --test tests/unit/non-timeline-dialogs.test.mjs tests/unit/dialog-state.test.mjs
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add tests/unit/non-timeline-dialogs.test.mjs src/pages/AlertsPage.tsx src/pages/WorkloadPage.tsx src/components/dashboard/MaTranTienDo.tsx src/components/dashboard/ProgressEditModal.tsx src/components/dashboard/ChiTietKyModal.tsx src/components/ai/AiMailModal.tsx
git commit -m "refactor(ux): unify desktop dialogs outside timeline"
```

---

### Task 4: Alerts interaction and Active Rules confirmation

**Files:**
- Create: `tests/unit/alerts-active-rules-ux.test.mjs`
- Modify: `tests/e2e/desktop-ux-final-audit.mjs`
- Modify: `src/pages/AlertsPage.tsx`
- Modify: `src/pages/ActiveRulesPage.tsx`

**Interfaces:**
- Consumes: existing alert `onOpen`, email destination, `ShellConfirmDialog`, toast or page status patterns, and unchanged `recalcCriticality(true)`.
- Produces: separate alert detail/mail controls, announced AI error, and in-app bulk recalculation confirmation/recovery.

- [ ] **Step 1: Write failing interaction tests**

Render/export an alert row and assert there is no `role="button"` ancestor around `mailto:`; require one native detail button and one separate mail link. Require AI error markup to use `role="alert"`. Model the Active Rules confirmation state with explicit open/confirm/cancel transitions and E2E-check that clicking “Chấm lại” opens a labelled app dialog instead of invoking `window.confirm`.

- [ ] **Step 2: Verify RED**

```bash
node --import tsx --test tests/unit/alerts-active-rules-ux.test.mjs
bash scripts/with-preview.sh -- node tests/e2e/desktop-ux-final-audit.mjs --case interactions
```

- [ ] **Step 3: Implement semantic interactions**

Turn each alert row into a non-interactive container with a native detail button covering the main content and a sibling `mailto:` anchor; preserve appearance, labels, and open handler. Add `role="alert"` to the asynchronous AI error. Replace `window.confirm`/`window.alert` in Active Rules with `ShellConfirmDialog` plus in-page/toast success and an inline actionable error; call `recalcCriticality(true)` exactly once only after confirmation.

- [ ] **Step 4: Verify GREEN**

Run Step 2 plus:

```bash
npm run typecheck
node --import tsx --test tests/unit/ui-ux-baseline.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add tests/unit/alerts-active-rules-ux.test.mjs tests/e2e/desktop-ux-final-audit.mjs src/pages/AlertsPage.tsx src/pages/ActiveRulesPage.tsx
git commit -m "fix(ux): separate alert actions and confirm bulk changes"
```

---

### Task 5: Table names, heading hierarchy, and final desktop regression

**Files:**
- Create: `tests/unit/desktop-table-semantics.test.mjs`
- Modify: `src/pages/CatalogPage.tsx`
- Modify: `src/components/dashboard/CompletionDashboard.tsx`
- Modify: `src/components/dashboard/VongNam.tsx`
- Modify: `src/components/dashboard/MaTranTienDo.tsx`
- Modify: `tests/e2e/desktop-ux-final-audit.mjs`

**Interfaces:**
- Consumes: `CardTitle level`, existing `lp-visually-hidden`, current table rows/cells.
- Produces: named audited tables and valid route section hierarchy without visual layout change.

- [ ] **Step 1: Write failing semantic render tests**

Render the four audited table components/states and assert each table has a non-empty `<caption>` plus `scope="col"` on column headers and `scope="row"` where the first cell labels a row. Extend the browser audit to collect headings per route and assert one `h1` plus discoverable `h2` section headings. The audit does not require artificial `h3` nesting where the current layout has no semantic subsection.

- [ ] **Step 2: Verify RED**

```bash
node --import tsx --test tests/unit/desktop-table-semantics.test.mjs
bash scripts/with-preview.sh -- node tests/e2e/desktop-ux-final-audit.mjs --case semantics
```

- [ ] **Step 3: Implement semantic names and levels**

Add concise visually hidden captions that identify each data set and add only the missing `scope` attributes. Keep the `CardTitle` default at `h2`; use the explicit `level` API only where an existing component already owns a real subsection boundary. Do not alter table columns, data, sorting, or Timeline files.

- [ ] **Step 4: Verify task GREEN**

```bash
node --import tsx --test tests/unit/desktop-table-semantics.test.mjs tests/unit/ui-ux-baseline.test.mjs
bash scripts/with-preview.sh -- node tests/e2e/desktop-ux-final-audit.mjs
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add tests/unit/desktop-table-semantics.test.mjs tests/e2e/desktop-ux-final-audit.mjs src/pages/CatalogPage.tsx src/components/dashboard/CompletionDashboard.tsx src/components/dashboard/VongNam.tsx src/components/dashboard/MaTranTienDo.tsx
git commit -m "fix(a11y): expose desktop information hierarchy"
```

---

### Task 6: Independent review, full verification, main push, and deploy

**Files:**
- Verify only; change files only through a reviewed fix round if findings or tests require it.

**Interfaces:**
- Consumes: complete Task 1–5 diff and SDD ledger.
- Produces: reviewed commit on `origin/main` and successful GitHub Pages workflow evidence.

- [ ] **Step 1: Run independent whole-branch review**

Create a review package from `fc801b3` to HEAD. Reviewer must verify every acceptance criterion, inspect deferred findings, and confirm no Timeline/Long Môn/mobile/SEO/database/auth/business-logic changes.

- [ ] **Step 2: Apply at most one reviewed final-fix wave**

If Critical/Important findings exist, dispatch one fixer with the complete list, require focused RED/GREEN evidence, then run one scoped re-review. Do not silently waive load-bearing findings.

- [ ] **Step 3: Run the fresh release verification chain**

```bash
export PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH
npm run typecheck
npm run test:unit
npm run drift
npm run build
bash scripts/with-preview.sh -- node tests/e2e/desktop-ux-final-audit.mjs
bash scripts/with-preview.sh -- node tests/e2e/desktop-navigation-experience.mjs
bash scripts/with-preview.sh -- node tests/e2e/catalog-workspace.mjs
npm run perf:budget
npm run a11y
```

Expected: every command exits 0 with no failed tests. Record exact counts, bundle/performance evidence, and inspect the complete output.

- [ ] **Step 4: Verify scope and clean state**

```bash
git diff --check fc801b3..HEAD
git diff --name-only fc801b3..HEAD | rg '(^src/pages/TimelinePage\.tsx$|^src/features/timeline/|long-mon|mobile)' && exit 1 || true
git status --short
```

Expected: no forbidden paths and clean worktree.

- [ ] **Step 5: Push the reviewed revision to main**

Fetch and confirm `origin/main` still matches the known ancestor or contains only reviewed commits; never force-push. Then:

```bash
git push origin HEAD:main
```

- [ ] **Step 6: Monitor deployment and verify revision**

Use `gh run list`/`gh run watch` for the `Quality and Deploy` run triggered by the pushed SHA. Require successful static quality, source contract, mock E2E, accessibility, production build, and GitHub Pages deployment jobs. Confirm `git ls-remote origin refs/heads/main` equals the pushed SHA.

## Rollback

If a task regresses behavior, add a normal follow-up commit reverting only that task's files; do not reset or rewrite history. If the release workflow fails, diagnose the failing gate, add a focused RED/GREEN fix commit, rerun the entire release verification chain, and push the new reviewed SHA.

## Execution choice

The user explicitly requested implementation and previously prioritized speed. Execute with subagent-driven development: one implementer at a time for shared-state safety, a separate reviewer after each task, and the strongest available model for final review.

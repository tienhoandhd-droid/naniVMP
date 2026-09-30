# Qualification trend UI Implementation Plan

> **For agentic workers:** primary implements shared files sequentially, following test-driven-development; use requesting-code-review for the bounded independent review before completion. The existing linked worktree is required and already verified.

**Goal:** improve all three system trend pages with one visible shared chart, point-specific limits and a clear saved-record comparison summary.

**Architecture:** keep the vanilla HTML/CSS/SVG workspace and existing backend/snapshot lifecycle. Add presentation state for three accessible chart modes; reuse exact saved evaluation through CPC1TrendLimits.annotate. Shared file edits remain with primary; reviewer has read-only ownership.

**Tech Stack:** existing vanilla JavaScript/CSS, SVG, Vite, node:test, existing headless Playwright harness. No package upgrades.

## Global Constraints

- Source `/home/admin1/VMP/MA-NGUON-HIEN-TAI`, linked worktree `feat/tham-dinh-thuc-te`, baseline 3506d29.
- No DB/Auth/formula/PDF/permission changes, production writes, push or deploy.
- Missing is not zero; preserve point/trial/occurrence/unit and monthly gaps. No averaging or inferred statistical stability.
- One chart visible at once; values and saved point-specific limits share the categorical chart. Three modes keep one set of filters.
- Exact comparison summary covers selected saved record and all filtered rows, including hidden chart points. Multi-run mode labels this scope explicitly.
- Preserve old untracked Sep23 plan, user server and private evidence. Do not open GUI.

### Task 1: headless RED behavior contracts

Files: create `tests/e2e/qualification-trend-workspace.mjs`; existing unit suites remain unchanged.

Backend fixtures use complete saved snapshots: air/nitrogen BM01 p05, steam BM03 result. Two points, trials, two closed months with a missing month, one open run excluded. Literal expected counts per selected record: 2 points, 3 numerical rows, 1 outside, 1 unknown. Delayed/error snapshot cases never claim a verdict.

- [x] Add headless routed test with file-backed responses, no production contact, snapshot fixtures and network-write assertion.
- [x] Assert system title, one visible SVG, limit marks on values chart, exact counts/scope, keyboard three-mode switching, retained filters, point hide/show in history and complete table, gap paths, empty/error/retry, responsive/themes and axe.
- [x] Run `node tests/e2e/qualification-trend-workspace.mjs`, record expected missing-UI RED in `.cpc1/trend-ui-20260930/red.log`.

Example behavior assertions:
```js
assert.equal(await page.locator('#trend-panel svg:visible').count(), 1);
assert.equal(await page.locator('#summary-outside').textContent(), '1');
await page.getByRole('tab', {name: 'Qua các đợt đã đóng'}).click();
await page.locator('#chart-legend input').first().uncheck();
assert.equal(await page.locator('#multi-trend-chart [data-point="P1"]').count(), 0);
```

### Task 2: shared UI implementation GREEN

Files: modify `public/tham-dinh-thuc-te/runs.html`, `runs.css`, `runs.js` only.

- [x] Replace long trend panel with filter card, scoped summary, mode tablist and three chart panels (one shown); native details for selected-record and monthly tables and source evidence. Keep all existing DOM IDs required by backend/current tests.
- [x] In runs.js add `setTrendView(view)` with roving focus and keyboard Home/End/arrows, preserve chosen view on render/filter changes. Dedicated h1/document title uses system; do not alter runs workflow.
- [x] Render counts from annotated rows only. During pending/error no outside count presented as zero; add selection context and assessment copy for empty/within/outside/unknown. Counts do not change when hiding points.
- [x] On values chart render limits as well as bars, mark outside with shape/color and readable title; exact values get keyboard focus labels. All hidden message differs from missing.
- [x] In multi-run rendering filter plotted series by hiddenPoints, retain full table, add series legend with point/trial/occurrence, represent gaps and show only dots when one month. Keep saved record summary explicitly scoped.
- [x] CSS uses existing tokens, light card hierarchy, clear selected tab/focus, visible labels and 44px targets; contain all scrolling within chart/table/legend at 320px. Point/trial line palette is readable in both themes.
- [x] Run new browser test and existing `qualification-run-workspace.mjs`; targeted units with `node --import tsx --test tests/unit/qualification-runs-ui.test.mjs tests/unit/qualification-trend-limits.test.mjs tests/unit/qualification-navigation.test.mjs`; record GREEN.

### Task 3: verification, independent review and handoff

- [x] Run `npm run typecheck`, `npm run build`, `npm run drift`, `npm run budget`. Browser test supports built public assets via `CPC1_TREND_PUBLIC_ROOT` and is rerun against dist to verify shipped static files.
- [x] Capture 1440px/light and dark, 390px and 320px screenshots privately; inspect screenshots, axe and zero JavaScript errors/write attempts. No broad regression/DB rehearsal needed.
- [x] Dispatch independent review on `gpt-5.6-sol` (available user-specified route; medium terra not available), read-only UI/test/spec/plan diff against baseline3506d29 and receipts. Reviewer checks numerical/provenance scope, a11y/responsive, hidden points and mode lifecycle. No redesign or unrelated audit.
- [x] Primary inspect every diff/finding, fix only valid scoped issues and rerun affected verification. Get scoped re-review if code changes after review.
- [x] Update root and specialized PROJECT-STATE, mark local complete/unpushed/undeployed. Commit only owned UI/test/design/plan files after fresh checks and clean independent review; exclude private evidence and unrelated untracked plan.

Rollback: revert this task's owned local commit or restore the three UI files to3506d29 after preserving unrelated files. No database rollback. Review checkpoints: RED before UI edits, GREEN before build/review, accepted review before local completion. Dependencies are sequential; only read-only reviewer delegation is allowed.

## Verification ledger — 30/09/2026

Primary implemented all shared files sequentially. Initial RED: dedicated page lacked system heading. Additional RED cases: denied dedicated route substituted another system; failed snapshot announced zero outside through legacy live region. All corrected with GREEN fixtures. Backend snapshot fixture was corrected to include its required system field; no evaluator change. Theme contrast checks now await CSS transitions before measuring settled colors. Existing run E2E opens the newly intentional history tab/details before asserting the same data contract.

Fresh source GREEN; exact private Vite build GREEN (5.19s), three owned source/dist asset hashes match. Budget uses an exact relocated copy of the unchanged repository budget script against private dist: 141.5KB entry CSS, 115.4KB critical gzip JS, 5.77MB total. User dist/server untouched. Built UI GREEN: three systems, all three modes, 30 axe cases, empty/pending/error/retry, history-only point, unavailable dedicated system, gaps/hidden/full tables, zero external requests/JS errors/network writes. Targeted 20 units, existing run workspace, typecheck and drift pass. Evidence `.cpc1/trend-ui-20260930/`; reviewer ACCEPTED after one scoped fix.

Independent review found that the legacy historical table omitted uncertain/non-numeric saved observations because it rendered chart series. Primary verified RED (two uncertain trial-2 rows missing), then rendered the table from all matching source rows, preserving raw/saved values, trial, actual record/version, and explicit saved/uncertain/missing state. Synthetic gap rows are distinctly labeled non-records; chart point/trial/occurrence and gap behavior remain unchanged. Added uncertain/provenance/all-hidden/null-source-text assertions. Final private rebuild and enhanced 30-case axe E2E, 20 primary units, existing run E2E, typecheck/drift/budget all GREEN. Scoped independent re-review ACCEPTED; reviewer independently reran built E2E and focused units with zero errors or writes.

Integration decision follows approved local UI scope: keep existing feature worktree, local commits only. No push/merge/deploy and no full-system regression expansion. Root/specialized state updated separately outside source Git.

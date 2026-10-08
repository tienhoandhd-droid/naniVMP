# Point charts and per-metric summary implementation plan

> Primary implements shared files sequentially using executing-plans. Independent reviewer follows requesting-code-review; no overlapping implementation delegation.

**Goal:** User approved grouped columns for particles/conductivity and dots for dewpoint/dryness, and requests two separate particle metrics with min/max + locations + passing/failing point counts per chart, within one saved run.

**Architecture:** Retain saved-snapshot annotate and prepare grouping. Extend prepare with optional system/snapshot/point context and add pure summary module/functions at the chart boundary. The same source rows feed chart and summary. Existing nitrogen behavior remains paired plots. Air/steam use one primary plot per metric; descriptive IQR information stays optional. No DB/Auth/evaluator/PDF changes or new runtime dependency.

**Tech stack:** Existing browser JavaScript/SVG/CSS; node:test and VM for pure contracts; existing Playwright E2E for UI.

## Constraints / decisions

- Linked worktree MA-NGUON-HIEN-TAI, branch feat/tham-dinh-thuc-te, baseline9fa56c4. Existing untracked23/09plan preserved. No new clone or dependency install.
- Air bm01 p05 and p5 remain independent form/metric/unit groups, titles ≥0,5µm and ≥5µm, separate saved limits. If one particle channel has no rows but its sibling exists in the canonical unit, display an empty separate channel, not borrowed values.
- Columns only air bm01 p05/p5 in hạt/m³ and steam bm02 conductivity in µS/cm. Other air/steam metrics use dots; nitrogen retains existing renderer behavior.
- Charts and extrema keep original finite values (prefer raw snapshot precision); null/uncertain excluded, zero included; exact raw text in summary/tooltips. Preserve all tied extrema with point ID/name and trial. Extrema do not include PQ limit values.
- Point counts are disjoint and counted once: known outside wins; otherwise all required saved observations within => pass; unknown/missing/uncertain/uncovered saved trial => unknown. Pending criteria => all unknown. Per-metric decisions, not composite form failure. Scope from saved run_scope when present, otherwise points represented in chosen group. Point filter narrows scope; hiding a point only hides marks, never improves summary.
- Labels for extrema prefer snapshot config locations; fall back to ID with missing-name text, never silently present a changed current name as a saved location.
- Missing metrics/points must not fabricate numbers or passes. No temporal lines.
- Palette restrained with readable values and trial labels/shapes. Bar baseline includes zero; no clipped values/limits. Horizontal internal scrolling for dense categories; no page overflow. Tooltip keyboard/touch/Escape preserved.

## Task 1 — pure summary and grouping contract

Files: public/tham-dinh-thuc-te/pq-charts.js; tests/unit/qualification-point-summary.test.mjs.

- [x] RED: test independent p05/p5 limits and summary (P1 p05 pass/p5 fail), tied min/max, zero/null/uncertain, pending, negative values, saved raw precision, missing trial in saved array, scoped point absent from trend, point filter, empty channel.
- [x] Command: `node --test tests/unit/qualification-point-summary.test.mjs` must fail new behavior, not syntax.
- [x] GREEN: implement `prepare(rows,{system,snapshot,point}={})`, `summarize(group,{snapshot,pending=false}={})`, and `chartKind(system,group)` returning bar/individual. `summary` has `{total,pass,fail,unknown,min,max}`; extrema `{value,rows}`. Read-only, no mutation or aggregation of means.
- [x] Regression: `node --test tests/unit/qualification-{point-summary,box-stats,pq-layout,trend-limits}.test.mjs`.

## Task 2 — chart rendering and summary UI

Files: pq-charts.js, runs.js, runs.html, runs.css, tests/e2e/qualification-trend-workspace.mjs.

- [x] Extend fixture to include both particle channels with different per-point outcomes. RED assert separate bar cards and one visible summary each, extrema location/trial, disjoint counts, selected record, hide point does not alter summary.
- [x] Renderer air/steam: one figure using kind selector; grouped bars at zero and all raw dots retained. Labels per observation in regular trial lanes, readable/scrollable; distinct trial symbols plus text. Do not change old nitrogen geometry/contracts.
- [x] Add visible accessible summary table under each air/steam chart: min+all locations, max+all locations, point pass/fail/unknown+IDs. Include scope/count semantics explicitly. Hide optional boxplot/stats for redesigned systems; existing raw table stays.
- [x] runs.js passes system/snapshot/point to prepare/render; default air/steam to all forms to expose both particle types, nitrogen keeps current default. Point filter includes saved scope; history stays secondary and unchanged.
- [x] Adjust E2E expectations only for intentional redesign; retain original snapshot/unknown/error/access/hide/raw/history checks. Add pending summary and missing-trial cases. Run `node tests/e2e/qualification-trend-workspace.mjs` headless; capture environment failure if still blocked, never claim UI PASS.

## Task 3 — review / validation / delivery

- [x] Primary targeted unit tests + typecheck + design drift; build to private `.cpc1/point-charts-20261008/dist` (do not replace running dist), budget on candidate.
- [x] Browser headless only. If launch unavailable, run exact application renderer in jsdom as supplemental evidence and render SVG inspection assets; record limitation, do not weaken browser checks.
- [x] Independent read-only reviewer of full diff, data/point classification and both particle isolation. Request gpt-5.6-sol (available suitable model; configured medium alias unavailable). Primary resolves findings, inspects every diff, reruns relevant tests.
- [x] Update root + specialized PROJECT-STATE with exact local/uncommitted or committed/push/deploy status, checks and limitations; deliver preview screenshots and source links. No production mutation/release in this task.

Rollback: restore only task-owned UI assets to9fa56c4; no database rollback needed. Preserve baseline artifact and unrelated files. Review checkpoint follows Task1 contracts and final diff; tasks2 shared files are sequential under primary.

## Delivery checkpoint

Local uncommitted implementation completed; no push/deploy. 37 scoped unit checks,13 source/built DOM scenarios,2 standalone preview systems, typecheck/build/drift/budget5.83MB PASS. Four static assets match source SHA256; latest pure/grouping changes were byte-copied into completed static-public build and built DOM/budget rerun. Reviewer no remaining important findings.

**Open validation:** real-browser E2E/layout/axe/mobile cannot run because Chromium launch is blocked (setsockopt EPERM). Tests were updated, not disabled; do not call release-ready or browser-verified. Local preview/images use synthetic data. User can inspect the actual renderer export under root output/playwright/point-charts-implemented-20261008.

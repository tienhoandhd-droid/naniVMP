# Results Summary Implementation Plan

**Goal:** Give managers a saved-results overview by area and metric for air, nitrogen and steam.
**Architecture:** Add isolated summary-model.js (pure snapshot aggregation) and summary.js (DOM/filter rendering), with small hooks in runs.js/html and VMP navigation. Existing read-only RPCs enforce authorization. No dependencies or DB changes.
**Tech Stack:** Existing static JS/CSS module embedded in React/TypeScript VMP shell.

## Constraints and shared state
Use MA-NGUON-HIEN-TAI linked worktree; preserve all pre-existing personal-presentation edits. Primary owns implementation sequentially. Review by separate gpt-5.6-terra worker after implementation; reviewer read-only ownership. Never deploy old base over newer November release. No push/deploy in this task until release candidate reconciliation is verified.

## Task 1: Snapshot aggregation
- [x] Add tests/unit/qualification-summary.test.mjs. RED: assert model exists, snapshot scopes include absent points, zero counts as value, missing steam trial cannot pass, p05/p5 independent, non-applicable endotoxin excluded, area extraction unambiguous, mixed status precedence, declared performer distinct from updater.
- [x] Run `node --test tests/unit/qualification-summary.test.mjs` and capture missing-model failure.
- [x] Implement `window.CPC1SummaryModel={buildRows,filterRows,summarize,areaFor}` in public/tham-dinh-thuc-te/summary-model.js. buildRows(run,item,snapshot) consumes exact-version saved evaluation/config/data; produces point/metric rows. summarize(rows) returns total,complete,pass,fail,missing,unknown,points and percent.
- [x] Rerun unit tests to GREEN.

## Task 2: UI and navigation
- [x] Add targeted headless fixture test tests/e2e/qualification-summary.mjs; RED missing Summary tab.
- [x] Add summary panel HTML, summary.css, summary.js. Bind `CPC1Summary.mount(host,{runs,loadSnapshot,onReload})` from runs.js after successful load. Lazy fetch selected run items, retain scoped loading/error states, guard late responses.
- [x] Add `view=summary` shell target and navigation entry; tests accept only known parameters. Preserve existing trend routes and run creation defaults. Link source form with run/record/form context.
- [x] GREEN fixture tests: three systems, C1/C2/unknown, indicator/state filters, open/closed, saved performer/time, empty/error/retry, stale reload, keyboard/mobile/dark, no writes/external requests.

## Task 3: Review, verification, delivery
- [x] Independent reviewer inspects exact feature files and tests, focusing denominator and partial failures. Fix findings and rerun targeted tests.
- [x] Run targeted summary + shell/runs/trend unit suites, existing run/trend E2E, typecheck, drift, build, budget. Inspect feature diff and verify original dirty files untouched.
- [x] Record fresh evidence and update root PROJECT-STATE plus specialized state with local/push/production/deploy status. Rollback is revert only feature file edits; no database rollback needed.

## Verification outcome

53 targeted units pass; source and built manager E2E pass including light/dark axe, mobile overflow, keyboard, stale selection/denial, scope restrictions, config/list/snapshot errors. Existing run and trend E2E pass. Typecheck, drift, build and budget pass (5.86 MB / 6 MB). Build reports unresolved font and existing split-import warnings; no claim of a warning-free build or production login. Independent gpt-5.6-terra review ACCEPTED after error-state/routing fixes. Screenshot checks wait for the existing theme transition to settle; no runtime theme workaround. Local deliverable only, no push, deployment or DB operations.

## Official release integration — 25/11/2026

User subsequently authorized committing main and using the official release. Ported onto official 08f7929 in existing latest linked worktree, preserving overview tab, journal navigation, open-run charts, trend levels and calibration changes. Previous local-only disposition above is historical. Added summary E2E to the existing workflow. Existing overview keyboard acceptance now checks fourth summary tab at End and ArrowLeft back to overview; other overview assertions retained. Candidate workflow dispatch will check the exact commit before fast-forward main push. No migration or database operations are part of this release.

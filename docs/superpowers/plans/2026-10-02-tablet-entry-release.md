# Tablet entry and web release implementation plan

> **For agentic workers:** Use subagent-driven-development for bounded implementation and independent review.

**Goal:** Deliver approved tablet entry and run-level calibration display, then publish cumulative chart/input upgrades to web.
**Architecture:** Existing gas/app adapters own data, permissions, calculation and save. Run-entry owns run/device context. Presentation-only workspace/CSS can reorganize controls without new persistence. No DB/API changes.
**Tech Stack:** Vanilla JS/CSS, Playwright fixture E2E, Node unit tests, Vite, GitHub Pages CI.

## Constraints and ownership
- Source is this existing worktree. Preserve unrelated untracked September23 plan.
- Preserve closed snapshots, dirty navigation, expiry warnings, formulas, PDF and authorization. No production data writes, migration or restart.
- Primary owns architecture, release workflow, Git/deploy, final validation and state docs. Implementation worker exclusively owns entry JS/HTML/CSS and tablet tests. Database and overlapping files remain sequential.
- Existing b371d21 Desktop package and live3506d29 are rollback references. Rollback release via reviewed revert and normal CI, never force push.

## Task1: Tablet and equipment entry (bounded worker)
Files: public/tham-dinh-thuc-te/{app.js,gas.js,run-entry.js,workspace.js,gas.html,steam.html}, entry-scoped CSS; tests/e2e/qualification-tablet-entry.mjs and directly affected fixture assertions.
- [x] Write fixture tests using qualification-run-workspace backend setup. Assert first numeric input is in initial viewport at768x1024 and1024x768; bound calibration has one viewable device summary, no repeated editable date; retain equipment status fields.
```js
assert(firstBox.y + firstBox.height < viewport.height);
assert.equal(await page.locator('input[data-run-calibration]').count(), 0);
```
Use real selectors for existing fields, exact payload due paths and values; test failures must describe actual missing behavior.
- [x] Run new test on existing code and record RED in private tablet evidence.
- [x] Implement compact run selector/context, collapsible device details and remove bound calibration input rendering while retaining original payload sync. Render unbound/legacy behavior safely; closed values unchanged.
- [x] Implement tablet layout and touch controls48px, point previous/next through existing button actions, save/evaluate toolbar in form. Keep warnings visible; secondary file/print controls reachable. Preserve input focus and reduced-height/zoom access.
- [x] Verify GREEN at768,820,1024,1180,390,1440; test point switching retains data, save error/retry/reload, calibration warnings and closed snapshots. Run related run-workspace/paste E2E. Inspect screenshots and horizontal overflow. No physical-tablet claim.

## Task2: Release preflight (primary, independent read-only during Task1)
- [x] Fetch origin, inspect main ancestry and workflow gates, prior release receipts. Identify cumulative intended diff without modifying worker files.
- [x] Add new targeted tablet/paste/trend E2E to appropriate CI job after tests stabilize; no weakened gates.

## Task3: Review and validation (primary plus separate reviewer)
- [x] Inspect every implementation diff and RED/GREEN receipts. Run targeted unit/E2E, typecheck, build, drift and asset budget on final artifact.
- [x] Separate reviewer checks calibration persistence, closed/read-only guards, point navigation/save and responsive accessibility. Fix findings sequentially with reproducing tests; rerun affected checks.
- [x] Commit only intended files plus approved spec/plan; exclude private evidence and unrelated plan.

## Task4: Authorized web publication (primary)
- [ ] Verify latest origin/main remains ancestor; push without force to main using normal protected CI/deploy workflow. If remote diverges, integrate reviewed changes then rerun relevant checks.
- [ ] Monitor all required jobs to completion. Download exact deployment artifact; compare live file hashes and run headless read-only/fixture checks against live assets, no business writes.
- [ ] Update root and qualification PROJECT-STATE with exact commit/run URL and local/pushed/deployed status. Report web link and concise delivered behavior, disclose any actual blocker.

Self-review: architecture and ownership explicit; RED/GREEN covers both requested behaviors; no migration; independent review and rollback defined. User approved implementation and web push on02/10/2026.

## Pre-release evidence

02/10: independent chart/paste review and tablet re-review ACCEPTED. Four review defects reproduced and fixed with RED/GREEN. Primary51unit PASS, source run/paste/tablet and built tablet/paste/trend PASS; typecheck, drift, build,5.82MB/6MB budget PASS. Evidence private `.cpc1/tablet-entry-20261002/`. Tablet simulations include6widths, nitrogen, CSS200% zoom and visual-only keyboard shrink; physical hardware not tested. No DB/API/formula/PDF changes.

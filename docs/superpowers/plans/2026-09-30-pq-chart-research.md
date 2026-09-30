# PQ chart research and redraw implementation plan

> **For agentic workers:** Execute sequentially under the primary planner; use executing-plans for checkpoints and a bounded independent review. Never overlap shared chart/CSS/E2E edits.

**Goal:** Produce a substantially redrawn local Individual + Boxplot workspace following the user's latest rejection.

**Architecture:** Preserve prepare(rows) and render(host, groups, options), all statistics and saved-verdict adapters. Add a pure deterministic swarm(yPixels, gap) layout in pq-charts.js; it returns X offsets in source order without moving Y or mutating inputs. The SVG renderer consumes these offsets, draws aligned full-width rows, criterion annotations, and safe DOM tooltips. CSS stays scoped to trend-panel. No added runtime dependency or DB/API mutation.

**Tech Stack:** Existing vanilla JS/SVG/CSS, node:test, established headless Playwright/axe fixture harness.

## Global constraints

- Actual source: MA-NGUON-HIEN-TAI existing Git worktree; baseline a28f376. Root old app and existing untracked release plan untouched.
- Exact existing snapshot/decimal/statistics/access/provenance behavior; 6 MB dist budget; no new network assets, dependencies or push/deploy.
- Primary owns pq-charts.js, runs.css, any narrow runs.html copy, unit and E2E files. Reviewer read-only, allowed to write only a private review receipt.
- Private evidence/artifact: /home/admin1/VMP/.cpc1/pq-redraw-20260930; rollback: pq-polish-20260930/dist. Task-owned 4173 only; server8882 untouched.

### Task 1: Demonstrate missing readable layout

- [x] Create tests/unit/qualification-pq-layout.test.mjs loading pq-charts.js in VM. Assert api.swarm([0,0,0,0,0,0,0,0],12) preserves 8 distinct observations, pairwise distance >=12, deterministic and input unchanged. Test varying Y uses Euclidean spacing and offsets remain in original order.
- [x] Update tests/e2e/qualification-trend-workspace.mjs desktop geometry: each figure shares left/right edges, second top > first bottom, both have matching guide X positions. Add nearby tooltip from focus/tap, raw value and Escape checks. Capture expected RED before app edits.
- [x] Extend fixture with many-points (17 locations, real-sized labels, 3 trials) and duplicates (8 equal measurements) variants. Check source counts, separate non-overlapping dots, unoccluded box bodies, full plotted scope and mobile internal-scroll hint, no page overflow. Keep original contracts and assertions, change only superseded visual intent.

### Task 2: Render the new composition

- [x] Implement swarm helper using circle intersections for candidate X offsets, sorting by pixel Y then original index, choosing closest valid candidate, returning offsets at original indices. Export via existing CPC1PQCharts object for pure tests.
- [x] Redraw pq-charts.js: integrated card, full-width row headings, always-visible common-rule caption; point-specific captions in footer; light known-common exclusion band and horizontal grids; raw values beside n>1 boxes, n1 point/median intact. Compute sufficient slot width from actual packed dot extent before SVG placement; preserve identical axes for both chart kinds.
- [x] Add safe tooltip DOM with value/unit, point/trial and separate saved PQ/IQR text. Pointer/focus/touch display; leave/blur/Escape dismiss; continue inspect(title). Remove tooltip when replacing cards and disconnect existing observers.
- [x] Replace the final scoped PQ block of runs.css with white analytical card, navy/blue plot ink, restrained red/amber signals, two vertically aligned full-width rows, legible axis/footer and responsive captions. Preserve theme/access/hidden controls.
- [x] Run pure units and targeted browser GREEN; inspect screenshots including 17 points, duplicates, singleton and segmented boundaries; fix only demonstrated issues.

### Task 3: Review and deliver exact local artifact

- [x] Run 3 existing targeted unit files + new layout file, typecheck, private Vite build, design drift and private artifact budget; run exact-artifact targeted E2E. Save outputs privately.
- [x] Request an independent gpt-5.6-sol review with baseline, spec/plan, file ownership, evidence and constraints. Reviewer verifies semantic guards, label/tooltip geometry, duplicate spacing and representative light/dark/mobile/17-location images. Fix material findings with RED/GREEN and rerun affected gates.
- [x] Primary inspect full diff and reviewer evidence, verify source/artifact hashes. Commit only owned source/test/docs, preserving old untracked plan.
- [x] Identify the existing 4173 PID/command; stop only that server, start loopback 4173 serving verified new artifact, verify HTTP hashes and commit hashes. Record receipt. Rollback by restarting existing baseline artifact if replacement verification fails.
- [x] Update root and specialized PROJECT-STATE local/not pushed/not deployed, research and test limits; open local via xdg-open under the user's existing authorization. Return link and concrete changes, leaving aesthetic acceptance to user.

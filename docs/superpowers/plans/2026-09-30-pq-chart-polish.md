# PQ Chart Polish Implementation Plan

> For agentic workers: primary owns shared implementation sequentially. Independent read-only reviewer owns no files. Existing linked worktree remains the isolated workspace.

Goal: improve the rejected chart presentation and update local4173 for user visual review.
Architecture: preserve box-stats, trend-limits and all saved-snapshot/data logic. Only pq-charts.js presentation, runs.css trend styles, runs.html placement, runs.js dedicated-page introductory copy and necessary browser layout contract change. Vanilla HTML/CSS/SVG; no new library.

## Constraints

Baseline2ad08cd. No DB/Auth/backend/evaluator/PDF/criteria changes. Same form/metric/unit and saved record/version grouping, finite exact values, n1/unknown/excluded semantics. Current preview .cpc1/pq-plots-20260930/dist stays until acceptance of independent review. User authorization to use recommended UI and open local persists; optional preference may steer visuals. Root unrelated untracked plan23/09 stays.

## Task1: behavioral layout RED and sequential presentation

- [x] Extend existing populated browser harness with geometry assertion: at1440 the two figures have matching top positions and Individual right edge is before Boxplot left edge. Assert a single-value point has a visible numeric label (no inference/recalculation). Run test RED against baseline and saveprivate log.
- [x] pq-charts.js: append figures inside .pq-plots grid, keep roles/IDs/inspection. Use bilingual concise headings, shorten inline sample note while preserving n/exclusion information and method in stats table. Add visible value label only for one-observation point, centered alternating jitter for repeated values, vertical guides and differentiated axis/PQ label. No changes to prepare/statistics/domain/limit decisions. Shared rule caption falls back to figureheading on narrow layouts; pointslot/box/jitter size adapts; morepoints getscrollhint. Measure and relocate colliding per-point rule text belowline. RED/GREEN for320 exact bound visibility, no3pointscroll, common andsegmented singleton boundary-label collision.
- [x] runs.css: replace prior PQ-specific last block with readable rules. Chart pair grid2cols; container <=800px stacks. Chart surface/border12px, legible marks/median, 13px axes, restrained theme variables. Retain all focus/contrast semantics. Avoid changing run entry/global theme.
- [x] runs.js: shorten dedicated-page introductory copy to one sentence; runs.css visually hide repeated filter title/live selected-group explanatory note while keeping labels/live semantics.
- [x] runs.html: move scoped assessment after main chart host; counts/filter/legend remain compact before charts. Render full sources/history as before.
- [x] Run existing three-system E2E incl18axe and source precision/grouping/limits/record-switch fixtures; inspect screenshots with collapsed data/point details at desktop/mobile. Run27targeted units to confirm math/API unaffected.

## Task2: independent review and verified local

- [x] Reviewer independent gpt-5.6-sol read-only: inspect actual screenshots + diff, ensure chart readability/pair balance and no semantic changes. Fix material issues and rerun scoped checks.
- [x] Typecheck/private build/budget; E2E on final artifact and source/dist hashes. Read outputs/exitcodes before claims. No full unrelated gates.
- [x] Commit only owned files; replace owned server4173 with verified private artifact .cpc1/pq-polish-20260930/dist, verify HTTP hashes and reopen authorized local. Update root/specialized PROJECT-STATE and private receipt with local/notpushed/notdeployed status.

Rollback: old privateartifact .cpc1/pq-plots-20260930/dist + revert new local UIcommit. No data rollback. Review checkpoint after RED; after screenshot inspection; before preview replacement. User still decides visual acceptance.

Execution: source27units and3system/18axe targeted browser PASS; final privateartifact browser PASS incl paired desktop geometry, full320/390PQ captions, no3pointscroll, precise sources and common/segmented equal-bound label noncollision. RED logs layout/contrast/common/segmented/mobile rule retained; independent pq_polish_review ACCEPTED after both label-edge fixes. Typecheck/build/drift/budget5.78MB PASS;5asset hashes source/dist/HTTP4173 match. Server2265 holds verified local4173; xdg-open issued under prior explicit user authorization. No push/deploy; user visual acceptance remains open.

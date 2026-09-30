# PQ Chart Polish Implementation Plan

> For agentic workers: primary owns shared implementation sequentially. Independent read-only reviewer owns no files. Existing linked worktree remains the isolated workspace.

Goal: improve the rejected chart presentation and update local4173 for user visual review.
Architecture: preserve box-stats, trend-limits and all saved-snapshot/data logic. Only pq-charts.js presentation, runs.css trend styles, runs.html placement and necessary browser layout contract change. Vanilla HTML/CSS/SVG; no new library.

## Constraints

Baseline2ad08cd. No DB/Auth/backend/evaluator/PDF/criteria changes. Same form/metric/unit and saved record/version grouping, finite exact values, n1/unknown/excluded semantics. Current preview .cpc1/pq-plots-20260930/dist stays until acceptance of independent review. User authorization to use recommended UI and open local persists; optional preference may steer visuals. Root unrelated untracked plan23/09 stays.

## Task1: behavioral layout RED and sequential presentation

- [ ] Extend existing populated browser harness with geometry assertion: at1440 the two figures have matching top positions and Individual right edge is before Boxplot left edge. Assert a single-value point has a visible numeric label (no inference/recalculation). Run test RED against baseline and saveprivate log.
- [ ] pq-charts.js: append figures inside .pq-plots grid, keep roles/IDs/inspection. Use bilingual concise headings, shorten inline sample note while preserving n/exclusion information and method in stats table. Add visible value label only for one-observation point, centered alternating jitter for repeated values, vertical guides and differentiated axis/PQ label. No changes to prepare/statistics/domain/limit decisions.
- [ ] runs.css: replace prior PQ-specific last block with readable rules. Chart pair grid2cols; container <=800px stacks. Chart surface/border12px, legible marks/median, 13px axes, restrained theme variables. Retain all focus/contrast semantics. Avoid changing run entry/global theme.
- [ ] runs.html: move scoped assessment after main chart host; counts/filter/legend remain compact before charts. Render full sources/history as before.
- [ ] Run existing three-system E2E incl18axe and source precision/grouping/limits/record-switch fixtures; inspect screenshots with collapsed data/point details at desktop/mobile. Run27targeted units to confirm math/API unaffected.

## Task2: independent review and verified local

- [ ] Reviewer independent gpt-5.6-sol read-only: inspect actual screenshots + diff, ensure chart readability/pair balance and no semantic changes. Fix material issues and rerun scoped checks.
- [ ] Typecheck/private build/budget; E2E on final artifact and source/dist hashes. Read outputs/exitcodes before claims. No full unrelated gates.
- [ ] Commit only owned files; replace owned server4173 with verified private artifact .cpc1/pq-polish-20260930/dist, verify HTTP hashes and reopen authorized local. Update root/specialized PROJECT-STATE and private receipt with local/notpushed/notdeployed status.

Rollback: old privateartifact .cpc1/pq-plots-20260930/dist + revert new local UIcommit. No data rollback. Review checkpoint after RED; after screenshot inspection; before preview replacement. User still decides visual acceptance.

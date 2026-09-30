# PQ Individual chart and Boxplot Implementation Plan

> For agentic workers: primary owns all shared UI/runtime files sequentially. One bounded independent statistics worker owns only the new statistics module and its unit test; final read-only reviewer is separate from implementers. Follow test-driven-development and requesting-code-review. Existing linked feature worktree is already isolated.

Goal: replace rejected trend UI with one Individual plot plus one Boxplot per form/metric/unit within one selected saved run snapshot, then update the local preview for user review.
Architecture: existing vanilla runs workspace orchestrates backend/snapshot/filter/lifecycle. New pure box-stats.js supplies descriptive statistics; new pq-charts.js mounts accessible fixed-height SVG chart pairs and tables. Existing trend-limits.js remains authoritative for saved per-point PQ comparison. No package/API/DB/evaluator changes.
Dependencies/shared state: pure statistics API first (independent of DOM/backend). Primary integration consumes it and owns runs.js/html/css and pq-charts.js; no overlapping implementations. Final reviewer read-only. Use available user-routed gpt-5.6-sol for statistics correctness and independent review (terra/luna requested routes unavailable).

## Global constraints

Baselinef4e3cf2, sourceMA-NGUON-HIEN-TAI, existing branchfeat/tham-dinh-thuc-te. Old untracked Sep23 plan stays. Live main3506d29 and server4173 baseline stay until new artifact passes. User's explicit two-chart design takes precedence over older three-mode design. No automatic push/deploy, database mutation, Auth changes or formula/PDF change.
Data grouping key=form+metric+unit within exactly one selected record/version. All forms/metrics supported through selectors. No average across points/trials, no merged versions/runs. Unknown PQ criterion does not prevent numeric saved data viewing or create a pass/fail. Uncertain/null excluded from charts but retained in source table. Outlier IQR is exploratory display only, distinct from saved PQ comparison.

## Task 1: pure descriptive statistics (delegated, independent)

Own/create only public/tham-dinh-thuc-te/box-stats.js and tests/unit/qualification-box-stats.test.mjs.
API: window.CPC1BoxStats.summarize(values) returns {n,q1,median,q3,iqr,lowerFence,upperFence,lowerWhisker,upperWhisker,outliers:[{index,value}],smallSample,method:'linear-type7-iqr1.5-v1'}. Input indices refer to original array; ignore non-number/non-finite inputs. No input mutation. Empty statistics fields null; n1 has equal quartiles/whiskers and no outlier; smallSample=n<4. Boundaries inclusive, IQR0 exact. No clamping or rounding prior to comparisons.
- [x] RED literal tests for [1,2,3,4,5,6,7,100]:q1=2.75,median4.5,q3=6.25,iqr3.5,fences−2.5/11.5,whiskers1/7,outlierindex7. Negative counterpart; duplicate observations; [5,5,5,5,50] IQR0; fence equality; invalid input; n0/1/2/3.
- [x] Implement minimum deterministic pure JS, safe interpolation, no DOM/backend.
- [x] GREEN unit test, report exact diff/RED/GREEN. Do not commit or mutate other files.

## Task 2: primary UI RED contracts

Own tests/e2e/qualification-trend-workspace.mjs; retain existing fixture/cloud interception setup but update acceptance to the new intentional design. Keep source-table provenance, full history, error/pending/retry/access tests.
- [x] RED assert two visible charts per metric card, Individual glyphs without bars, box n count, same Y domain, exact selected snapshot, no cross-run pooling; PQ versus statistical outlier distinct. Use literal point/trial sample sets incl8values with1outlier, single/zero/uncertain and n3.
- [x] Assert all metric/form modes isolate units/forms; missing criteria still plots numbers but not verdict. Point hide/reset/full tables; native history details retained.
- [x] Browser tests three systems, populated data, actual DOM/CSS/SVG, 320/390/1440, light/dark, keyboard/axe. No external/network writes.

## Task 3: primary sequential implementation

Own new pq-charts.js plus runs.js/html/css and necessary intentional navigation steps in tests/e2e/qualification-run-workspace.mjs.
- [x] Remove large summary panels/three-mode main; compact filter and inline scoped summary. Main #pq-metric-charts creates card pair for every selected group. All-forms/all-metrics options use [form,metric,unit] values, never mixed groups. Default first form/allmetrics. Reuse IDs for unchanged workflow and legacy history as secondary details.
- [x] Render Individual dots, full horizontal bound if uniform across plotted points with saved criteria; segmented bounds otherwise. Boxplot per sampling location, raw observations overlay, n labels, IQR outlier rings separate from PQ diamonds. Same scale in a pair, nice ticks, fixed-height viewport-dependent width, horizontal labels and contained many-point scroll. Resize redraws geometry only.
- [x] Pair group receives {key,form,metric,label,unit,points,rows: annotated rows}; plotted values finite precise action.plotValue when available else saved finite row.value; uncertain excluded. Summary PQ requires snapshot, descriptive outlier summary does not. Tables retain all rows and actual record/version; no zero defaults.
- [x] Accessible focus/touch values, plot roles/titles, non-color marker meanings, native data/statistics details, empty/hidden/one-sample labels. Text rendering only, safe parameter IDs.
- [x] GREEN math units + current trend limits/runs/navigation units + existing run-workspace + new targeted browser. Primary inspect delegated statistics diff and rerun its units.

## Task 4: final verification, review, local preview

- [x] Typecheck, private Vite build, drift, unchanged relocated budget script against private dist; browser rerun on exact artifact, hashes for five owned assets. No source dist overwrite or broad unrelated gates.
- [x] Inspect light/dark/mobile and representative8-sample Boxplot screenshots. Independent read-only gpt-5.6-sol reviewer checks math provenance/Q1 method, sparse samples, correct boundary distinction, source preservation, UI scope/resize/a11y and no database side effects. Fix scoped issues with RED/GREEN and re-review.
- [x] Commit owned files only. Update root/specialized PROJECT-STATE with local/notpushed/notdeployed and verification evidence. Update4173 to verified artifact (loopback server must keep running for user), verify HTTPasset hashes; reopen/reload requested local page if useful, no production action.

Rollback: restore exact prior4173 artifact .cpc1/trend-ui-20260930/dist; revert new owned UI/math commit, preserve unrelated files/worktree/commonGit. No data rollback. Review checkpoints RED before implementation; GREEN before independent review; ACCEPTED before local preview replacement. User decides visual acceptance on local, automated test success is not their approval.

Execution receipt: `.cpc1/pq-plots-20260930/`. Statistics RED/GREEN9; targeted units27; source and exact-build browser PASS3systems/18axe; record switch, raw precision, mixed units, uncertain/null, common/segmented limits and retry/access covered. Independent pq_final_review ACCEPTED after missing IQR-column RED/GREEN correction. Final5UI/stat assets source/dist/HTTP4173 hashes match. Local preview session53937 opened by explicit user authorization; no push/deploy/DB change. UI visual acceptance remains with user.

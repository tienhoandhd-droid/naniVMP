# Location-axis and limits chart — investigation pending business clarification

User corrects monthly x-axis: X should be sampling location; says Y is point position, and requests an additional chart to identify observations outside limits. Do not silently reinterpret Y as measured result or choose statistical limits.

Pending async questions:
1. Y measured numerical result (with unit) or actual physical location coordinate?
2. Bounds from protocol acceptance criteria, statistical control bounds, or both distinctly?

Read-only audit complete; no implementation changes or database calls/mutations in this clarification step. Current local multipoint chart remains intact. Existing independent review/tests/build from preceding task stay valid for that implementation, not the new request.

Grounded architecture if Y=result/acceptance selected:
- X categorical sampling point code/name; month/run becomes selection/grouping rather than x-axis. Y exact metric's unit. Preserve replicates and separate records; never average points without rule.
- Saved evaluation.source_context has versioned acceptance metadata. Gas source_context.config.forms[].locations[].limits per location: p05,p5,dewpoint,oil,microbial,purity. Steam source_context.criteria stores corresponding maxima/minima and source table/equations.
- history_list currently returns trend values and statuses but omits frozen evaluation/criteria. Existing owner-scoped backend.load(id) can read saved evaluation; chart must validate id and version against selected closed history. Do not substitute current config for past criteria. No schema change necessarily needed.
- Current history numeric values can be rounded; exact boundary identification must inspect raw_result/raw inputs and saved per-parameter states. Composite row fail is not evidence every metric failed. Invalid/uncertain/not-applicable values need distinct treatment, not automatic out-of-limit classification.
- Additional limits view would show actual per-point bound(s), source/units/direction, and distinguish below/above; undefined bounds remain explicitly unknown. No invented lower bound (e.g. superheat), no ±3σ by default.
- Statistical option needs an agreed method/reference baseline/subgroup and comparability check; do not pool heterogeneous locations or two execution months and call the result a validated control limit.

Next: receive answers, write bounded approved workflow/acceptance examples and implementation plan, add RED data/layout/limit boundary tests, implement UI only plus minimal read-only backend contract if necessary, independent review, headless populated data, build and local delivery. No push/deploy/import/production changes currently authorized by this chart correction. Keep unrelated release/LongMon artifacts unchanged.

## Implementation decision after user's confirmation
User explicitly confirms action limit = protocol acceptance limit. Given comparison to numerical limits, Y is interpreted as measurement value with unit; stated to user before implementation. X sampling point; one saved system record selected by month/run. No statistical thresholds. Existing local-first constraint remains.

Layout: system → saved run/month (latest available by default) → form → metric/unit → points. First chart grouped bars (one per replicate, no average) X=point, Y=result with zero baseline including negative values. Second chart scatter at same locations with per-point upper/lower action-limit segments and textual pass/outside/unknown summary/list. No invented lower bound. Legend point visibility only hides chart, full table remains. Wide categorical axes horizontally scroll; readable codes+full label legend; color plus shapes/text distinguish outside. One selected record keeps criterion revision unambiguous.

Architecture/files: primary owns new standalone public trend-limits.js helper (decimal comparison/annotation only), runs.js/html/css display and read-only snapshot fetch. Add backend.historySnapshot(recordId,version) calling existing owner-scoped cpc1_load with explicit p_version, verify returned id/version and never change entry current state. No SQL/production changes. Helper resolves bounds exclusively from saved evaluation.source_context, validates system/form/metric/unit/location. Use raw_result for derived results, original numeric input for direct measurements, recorded per-parameter states where available; composite row failure never marks every parameter outside. Rounded-only delta exactly on limit and composite failure is unknown, not guessed. Missing criteria/evaluation/revision/error is explicit unknown; no current-config fallback. Assessment is chart annotation, not modification of saved decision.

RED/GREEN: helper tests inclusive boundary/below/above, lower bound, negative dewpoint, point-specific limits, raw precision, invalid/uncertain/missing, composite failure, unit mismatch; backend exact revision and no current-state mutation. Browser populated synthetic outlier data both upper/lower, location axis/bars/limits, point toggles preserving table, saved-period filter, delayed/error snapshots never reuse prior criteria, all7widths/keyboard/axe. Replay existing private import data using snapshot mock transport, all metrics/counts and screenshots. Typecheck/build/budget and source/dist/HTTP hashes. Separate sol readonly reviewer for arithmetic/criteria/snapshot correctness after primary tests; primary inspect findings and rerun affected tests.

Rollback copy owned before-files/private snapshot and remove new helper/test only; no data rollback needed. Do not rerun imports/SQL, no push/deploy. Update feature10/state/localguide with superseding chart meaning, record test limits/UAT pending.

## Verification checkpoint
Implemented categorical grouped bars and separate action-limit scatter using exact saved snapshot. Historical month is a record selector; all points default. Positive bars have zero baseline; zero-only and negative datasets produce finite coordinates. Two layout diagrams replaced monthly X without rewriting data or formulas.

Primary evidence: 29 targeted unit tests including gas-oil exact server cross-multiplication decision where quotient rounds to boundary; 14 populated browser responsive checks / 4 axe scans; delayed previous-snapshot completion, rejected snapshot clears limits and retry, both upper/lower examples, point hiding preserves full table. Private replay across five actual imported snapshots: 28 metric combinations, maximum39points, 21 responsive checks / two axe light-dark scans, no page errors. Typecheck/build/budget pass. All tests headless; no Supabase calls or writes, no deploy. Independent sol review completed; one verification-gap finding addressed by tests. No acceptance QA/UAT claim.

Only chart annotations compare stored inputs/results and criterion metadata. Gas oil retains server single-criterion pass/fail because server compares cross-products exactly; finite precision quotient must not override it. Steam rounded delta at limit with composite fail remains explicitly unknown. No statistical limits, no invented lower threshold, no rewrite of source results.

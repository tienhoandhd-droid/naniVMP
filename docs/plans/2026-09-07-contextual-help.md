# Contextual help and actionable data tabs

User authorizes implementation and deployment. Preserve business dates and audit records; remove only decorative last-edited labels across views.

Architecture: retain current access context and server RPC authorization. Add a reusable accessible help dialog using ViewportDialog and a source guide for each of the eight authorized workspace regions. Help is read-only, never invokes writes or grants access. Explain saved source vs pending timeline changes, preview, reason, protected progress, conflicts and retry. Derive field instructions from existing definitions where possible. Primary integrates help and timestamp removal; independent worker owns new guide files only. Another worker verifies existing permission/write/import tests and reports concrete gaps; no concurrent DB mutations.

RED/GREEN: first update timestamp assertions to fail on remaining labels; guide worker adds content contracts before implementation. Browser checks open/close each help, keyboard focus return and mobile containment, plus existing source edit/import/apply flows and denied-role tests. Run targeted local DB source-access contract under primary if needed to establish server evidence. No production business-data test writes.

Review: independent reviewer checks final diff, guide semantics against source and RPCs, all permission failures, test results. Primary inspects every delegated diff and reruns affected verification.

Final gates: targeted units, catalog and source-access browser tests, typecheck/build/drift/budget, relevant CI, public deployment asset/health checks. Rollback is a revert of this UI/help commit; no schema or original-data changes planned. Remote parent may be API-equivalent: require parent tree equality and non-force ref compare-and-swap for release.

User steering: reduce pink/glare. Primary adjusts light canvas/sunken/surface to low-chroma ivory/sage and removes pink ambient wash, preserving semantic colors and dark theme. Verify actual contrast + axe and desktop/mobile screenshots.

User requests all interactive buttons verified after reporting unidentified failures. Expand browser gate to existing core mock flows, UX, navigation and permissions; ask for concrete failing buttons while continuing. Never equate clickability with successful persisted writes; document test boundaries. Fix demonstrated defects within scope with RED/GREEN.

Interaction findings and bounded fixes: AccountRoleEditor cancel only resets draft; primary adds required onCancel callback to close parent editor and browser regression for unchanged/dirty cancel, reopen and no mutation. Independent UI worker owns HealthPage, WorkloadPage, ReportsView and a shared CopyCodesButton with visible success, caught failure and selectable manual fallback; no auth or business writes. Worker may add its own clipboard contract test. Primary owns role editor tests, broad mock execution and integration. Preserve disabled-while-saving protections; do not create duplicate mutations. Review after changes, then final checks and authorized main deployment.

## Verification and limits

- Last-edited header test reproduced remaining label then passed removal across tabs.
- Context help: eight authorized regions, keyboard Escape/focus return, reader-only Objects, mobile containment; per-region capability notes tested independently.
- Catalog browser: 151 assertions passed (staging/commit, preview/apply, protected progress, conflicts, forbidden outcomes). Source QA/workshop browser passed; source owner assignment changes downstream progress controls correctly in cross-screen mock.
- Role Cancel reproduced original no-close failure; fix tested untouched/dirty draft, no mutation, reopen and subsequent UUID-targeted save. Admin suite 82 assertions passed.
- Clipboard: successful write and denied/missing API with selectable manual fallback; Reports, Health and Workload placements exercised. Source import receipt reuses the same safe control.
- Reports: actual Excel and HTML downloads; missing iframe/setup exception unlock and cleanup; successful print invocation/afterprint simulated (native OS print dialog is not automated).
- Full units: 841 passed, one existing skipped; axe: 20 passed. Typecheck/build/design drift/bundle budgets passed. Long Mon two modes, dense first viewport, mobile, keyboard, reduced motion passed.
- Legacy desktop foundation audit expects a removed account badge; use current shell/axe contracts. Readiness test updated to existing partial-role-source status semantics and passed. No application behavior was weakened to satisfy stale assertions.
- Local full DB runner refused before mutation: fixture now has 65 authenticated RPCs versus pinned 64. Guard retained. Sealed PostgreSQL evidence and unchanged server contracts remain checked; fresh DB runtime suite is not claimed. No schema, authorization policy or production business-data changes in this release.

# Charts and field performance implementation plan

**Goal:** Refine chart readability and aesthetics, collect real device performance and improve measured rendering.
**Architecture:** SVG/CSS charts use isolated semantic palette; official web-vitals module loaded separately. Bounded collector sends latest document metrics to authenticated RPC; admin lazy panel reads aggregates. Primary owns all DB and shared startup/package/CI files.
**Stack:** React18, TypeScript, Vite, Supabase/Postgres, Node tests and existing Puppeteer browser harness.

## Ownership and checkpoints
- [x] Chart worker (terra): src/components/dashboard/{CompletionDashboard,VongNam,MaTranTienDo,BieuDoKiemSoat}.tsx, src/features/overview/overview-analysis.css, new chart palette files, chart-specific tests. Preserve calculations/attributes and existing navigation/modal semantics. Inspect report charts for coherent palette; do not change export contracts. RED test verifies visible values/filter/drilldown before semantic UI changes; GREEN plus screenshots 1366x768 and390x844 light/dark.
- [x] Primary: src/lib/fieldPerformance*.ts, src/features/performance/*, main.tsx, AdminPage.tsx, package*.json, migration and SQL tests. Pure model RED validates allowlists/ranges/latest sample/dedup/batch limits and failures. Implement bounded web-vitals reporting and lazy admin readout.
- [x] Database sequential primary: read-only preflight function dependencies and permissions; rollback SQL tests on separate transaction covering anon/inactive/regular/admin, malicious payload/invalid values, idempotent metric update and aggregates. Deploy only reviewed additive migration; no business-data writes.
- [x] Browser evidence: existing mock backend + new RPC fixtures, real clicks produce INP, pending states and forbidden/error handling, reload/refresh aggregate panel, screenshot and cold Overview performance before/after. Verify no private data leaves in payload and bounded reporting.
- [x] Independent sol review of all diffs/privacy/security and regression evidence, primary inspects delegated diffs and reruns changed checks.
- [ ] Final: typecheck, targeted unit/E2E, build/budget, relevant a11y and CI; commit, publish exact tree to main nonforce, await deploy, verify public assets and health.

## Rollback
Frontend: revert release commit (nonforce). Backend: revoke telemetry RPC execution to stop ingestion; additive isolated table can remain until intentional retention cleanup. Never roll back or modify business records. Missing telemetry RPC disables collection without affecting the app.

## Design alternatives
Global brand recolor would disturb completed artwork; choose isolated chart tokens. Replacing all graphics with a new library adds load cost; choose existing native SVG/HTML. Local-only timings cannot measure other users; choose authenticated central aggregation with minimal allowlisted fields.

## Verification evidence (2026-09-07)
- Model RED: missing collector; subsequent stale pending metric regression RED and GREEN.
- Browser RED on baseline: missing telemetry and old 4-column chart flow. GREEN: real INP click, strict private payload, ready/empty/forbidden/unavailable, refresh, missing RPC stops.
- SQL RED missing ingestion; GREEN isolated PostgreSQL17 clone of existing auth schema, transaction rollback, raw privileges denied, active/inactive/admin/QA/worker role matrix, invalid data, latest metric/upsert and independent hour/day limits.
- Reviewer sol approved fixes for stale metrics, account/BFCache races, internal-ID disclosure and independent daily limit test.
- Full unit:855passed,1existing skip. A11y:20passed. Report XLSX/HTML/print regression passes. Typecheck/build/budget passed.
- Actual React render benchmark, synthetic6000records: field reads90000→45000; median63.14→38.28ms; all4stage count/rate pairs identical. These are lab results, not claims about field p75.
- Collection adds roughly4.3KB encodedJS, separatelyloadedafterstartup; coldToday readiness has no repeatable improvement/regression established.
- Additive production migration applied with matching SHA256 receipt outside repo; RLS, raw read denial, anon denial, authenticated ingestion, migration history and daily retention cron verified. No business records modified.

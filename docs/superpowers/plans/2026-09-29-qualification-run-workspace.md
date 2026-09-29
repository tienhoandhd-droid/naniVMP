# Qualification Run Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Complete bounded tasks with review; primary owns DB/shared state.

**Goal:** Ship mandatory run-based multi-day qualification entry, correction history, per-device expiry, nested system navigation, stronger sidebar and a consistent VMP masthead.

**Architecture:** Extend the existing run/record/revision model without changing evaluators or PDF templates. New metadata and server-derived change events wrap the existing private save primitive; React shell and static form adapters consume explicit RPC/backend contracts. Three ownership boundaries: primary DB/backend, shell worker React/navigation styles, form worker static UI.

**Tech Stack:** Existing React18/TypeScript/Vite6, plain browser JS qualification module, Supabase/PostgreSQL17, node:test and headless Playwright. No new dependencies.

## Global Constraints

- Source only MA-NGUON-HIEN-TAI linked worktree; base12a81a1. Preserve untracked Sep23 plan.
- User approved design and per-device expiry; push/deploy authorization persists. No further design or deployment permission questions.
- No evaluator/formula/criteria/units/PDF renderer/template changes. PQ HT12/HT13/HT14 OR HT15 unchanged. Closed runs immutable.
- Never rerun migrations20260929120000/20260929160000, imports/effort_days or restart. No production business test writes, no GUI. DB and shared files sequential under primary.
- Existing snapshots remain readable/printable without new metadata. Fresh backup/rehearsal/review before new migration cutover.
- Tests lead changes with recorded RED/GREEN; final critical review independent. Do not alter unrelated personnel worktree.

## Frozen cross-task interfaces

### Per-device calibration contract

New run definition extends existing `{title,mode,started_on,scope}` with `calibration`:
```js
{ 'air:bm01:expiry': {name:'Máy đếm tiểu phân',due_on:'2026-12-31'} }
```
Keys/requirements come from server RPC `cpc1_run_requirements(p_scope jsonb)` and are not guessed by client. Result array:
```js
[{key:'air:bm01:expiry',system:'air',form:'bm01',name:'Tiểu phân',kind:'calibration',label:'Hạn hiệu chuẩn',payload_path:['equipment','bm01','expiry']}]
```
For gas derive expiry fields from current form equipment_fields (oil label Hạn dùng => kind expiry). For steam BM03 use two entries `steam:bm03:balance_due` and `steam:bm03:thermometer_due`, payload paths equipment/balance_due and equipment/thermometer_due. Steam measurement forms without existing instrument fields use one explicit generic device requirement per form with key `steam:bm01:device` etc, empty payload_path (run metadata only). These names describe a device slot, not an invented instrument/SOP; user supplies actual name. Require exact required key set, nonblank name<=160 and valid ISO date. Shared device may be named consistently across form slots; no new device inventory module.

`cpc1_run_get/list` rows add `calibration` and `calibration_requirements`; `_run` from runConfig includes them. Existing runs default empty metadata and remain readable. Missing requirements block new measurement saves until completed. Metadata update via:
```js
backend.runRequirements(scope) // cpc1_run_requirements {p_scope:scope}
backend.updateRunCalibration(runId,version,calibration,reason,requestId)
// cpc1_run_calibration_update {p_run_id,p_expected_version,p_calibration,p_reason,p_request_id}
```
Updates require open run/all current run write authority, exact run version and idempotency. Changed existing device/date requires reason. Increment run version and retain run_events diff. Empty old metadata may be filled without correction reason. No silent conversion of expiry into calibration. Dates copied to known payload_path when initializing run records; form equipment date controls follow current selected run metadata. Generic metadata stays outside evaluator payload.

### Mandatory entry and history contract

Backend bindRun remains immutable for a page; selecting a different run navigates to a new URL. getConfig/getGasConfig without run remain readable solely to render selector/create controls; save/evaluate require a bound run. Unbound form does not enable data entry. URLs retain `run`, `record`, `form`.
```js
backend.save(data,{recordId,expectedVersion,reason})
// cpc1_run_save with p_run_id,p_data,p_record_id,p_expected_version,p_request_id,p_reason
backend.pointHistory(form,point)
// cpc1_point_history {p_record_id:boundRecord,p_form:form,p_point:point}
// [{version,created_at,actor_name,reason,changes:[{path:['forms','bm01','A1','value'],before:'1',after:'2'}]}]
```
Changes are server-computed; missing vs empty treated semantically for correction detection. New nonempty to different/empty requires p_reason trimmed1..1000. Metadata correction also requires reason. Check current expected version before diff. Atomically save revision + event; reject invalid reason before any write. Idempotent retry must bind reason in addition to payload/run/version. Existing five-argument run_save delegates to new six-argument implementation with null reason (cannot bypass correction), no ambiguous default overload. Public unbound cpc1_save rejects. Private bootstrap used only from run_create, no new public bypass. History endpoints recheck PQ rights and hide unrelated record/system/point. Can derive historic diffs for pre-feature revisions (label reason not recorded).

### Shell interfaces

Shell navigation routes continue safe qualificationTarget allowlist; add `runs.html?view=trend&system=steam|air|nitrogen` (steam allowed only for runs trend, not gas). `runs.html` is run list/create. Old index target canonicalizes to runs. Nested forms use existing targets `gas.html?system=air&form=bm01`, `steam.html?form=bm01`; selecting without run opens selector. Nested nav current matching uses parsed query identity rather than startsWith.

Shell worker creates `useQualificationAccess` using existing Supabase client (export already available), reads cpc1_context, checks actor/token ownership on response, invalidates on auth change/focus/reconnect, filters by can_view_current/can_view_archive. Errors hide links and show retry status, never grant rights. Frame remains authoritative. Do not put server role/PII in browser URLs.

## Task 1: Mandatory run, calibration and audited corrections (primary)

**Files:** new `supabase/migrations/20260929180000_qualification_run_workspace.sql`, `supabase/tests/qualification_run_workspace.sql`; modify `src/features/qualification/backend.js`; new backend targeted unit tests, adapt directly affected existing backend tests.

**Consumes:** current reviewed PQ migration save_pq and run guard; frozen contracts above.
**Produces:** all new RPCs/backend methods and new run_save contract. DB works before form UI integrates.

- [ ] Write SQL RED tests on clone for unbound cpc1_save create/update rejection, required run calibration, valid multi-day save, correction/clear reason required, additions no reason, exact replay, different reason with same key rejected, record/system/run mismatch, closed/unauthorized denied, per-point history scope, null/nondate invalid metadata. Use actual authenticated JWT context and hand-written expected diffs:
```sql
-- data before: forms.bm01.A1.p05='1'; after: '2'.
-- no reason => 23514, version unchanged; reason 'Đính chính số đọc' => new version/event.
-- expected event path = ['forms','bm01','A1','p05'], before='1', after='2'.
```
- [ ] Run RED against restored pre-feature PostgreSQL17; archive assertion failure (not missing-tool error).
- [ ] Implement recursive JSON leaf diff preserving array paths and raw strings; empty→value continuation, nonempty→different/deleted correction. Add private event table with no client grants, FK revision/run, immutable client ACL. Add requirements/calibration validation helpers and run metadata columns; preserve old rows default{}.
- [ ] Implement new RPCs and compatibility wrappers. Reuse private save_pq without altering formulas. Lock order matches record→run used by existing revision guard; request advisory lock before mutable state; no client-provided actor/diff. Close/save and calibration/save races must serialize without deadlock or stale metadata acceptance.
- [ ] GREEN SQL matrix plus separate two-session conflict/close/calibration/revoke probes on clone. Check protected table fingerprints and original evaluator/PDF-source values unchanged.
- [ ] Backend RED cases assert unbound save/eval rejection; reason bound to request ID; point-history params scoped to bound record; mismatch denied. Implement methods and run tests.
- [ ] Independent security/concurrency review with actual diff and RED/GREEN receipts; primary inspects and fixes before cutover.

## Task 2: Navigation, shell access and VMP wordmark (shell worker)

**Owned files:** `src/components/layout/Layout.tsx`, new `src/components/layout/QualificationNavigation.tsx`, new `src/features/qualification/useQualificationAccess.ts`, `src/features/qualification/shellRoute.ts`, `QualificationWorkspace.tsx`, `src/AuthenticatedApp.tsx`, new shared `src/components/ui/VmpMasthead.tsx`, auth brand component only for consistent wordmark if needed, relevant `src/styles/lotus-shell.css` and small new nav CSS imported by Layout. Own shell/navigation unit tests and new focused shell headless test. Do not modify backend.js, public qualification files, SQL, source data/access authorization core.

**Consumes:** cpc1_context existing shape with system access; safe route contract above.
**Produces:** nested accessible navigation, correct ordered groups, masthead all tabs and styling.

- [ ] Add behavioral RED tests for safe trend routes / legacy index→runs, nested selected link matching (run args may follow form), no offsite/unsupported params, system rights filtering, and browser sidebar group order/no library/wordmark across representative tab classes.
- [ ] Implement semantic expandable groups with links BM01+Vietnamese names from approved spec. Place qualification before analysis on desktop and mobile. Preserve dirty navigation and keyboard behavior; collapsed sidebar opens run page. Scope nav from fail-closed cpc1_context access; preserve archive-only visibility.
- [ ] Extract the exact existing Overview masthead into VmpMasthead, render once in Topbar all authenticated tabs; keep static iframe header hidden. Add same wordmark to login brand if not already consistent, no Auth behavior change.
- [ ] Introduce scoped sidebar contrast tokens/styles: stronger plum backdrop, high-contrast text/icons, distinct group header bands and active/focus state; no broad page theme rewrite. Verify light/dark,320/390/768/1440, zoom200%, mobile group toggling not closing drawer.
- [ ] Run RED→GREEN focused tests, typecheck; do not build while primary/form worker uses shared generated artifacts. Write report and commit only owned files, no pushes.
- [ ] Primary inspects full diff/reruns relevant tests, independent task review before final integration.

## Task 3: Run setup, multi-day form controls and system trends (form worker)

**Owned files:** `public/tham-dinh-thuc-te/{runs.html,runs.js,runs.css,run-entry.js,app.js,gas.js,steam.html,gas.html,index.html,home.js}`, new `entry-history.js`/CSS if useful, existing CSS narrowly for selectors/history. Relevant qualification UI unit tests and new `tests/e2e/qualification-run-workspace.mjs`. Do not edit src/features backend/shell/React/SQL, cloud.js, runtime-config.js, vmp-tokens.css or PDF logic.

**Consumes:** frozen backend methods/RPC response shapes above (primary implements). UI may use synthetic backend fixture for its tests; no production request/writes.
**Produces:** requested user flow with no standalone edits; names/forms/trends per system.

- [ ] RED headless with actual form code and controlled backend: unbound form has required run select and disabled entry; choose open run then correct record loads; selected calibration visible; closed run remains locked. Create validation requires title+all device due dates (via runRequirements) and preserves invalid input. Errors must be visible without relying on a missing fixture method.
- [ ] Add create-run device fields based on `backend.runRequirements(scope)`; each input labelled name/date/kind, stale scope responses ignored. Pass calibration with create. Add open-run metadata edit using updateRunCalibration for legacy missing fields/device change with reason; closed cards no edit. Keep scope rules and permissions.
- [ ] Run selector at top of every form, including direct/deep links. Fetch permitted runs, filter by system/form, navigate bound run+record+form through embedded bridge; guard dirty state; no auto-choose wrong run. Empty/loading/error/retry states; legacy library landing becomes run landing/redirect without deleting templates.
- [ ] Add shared entry-history helper for point warning and continuation/correction mode. Source snapshot recorded at load/accepted save; nonempty point opens read-only warning with Continue/Change/Xem lịch sử. Continue only edits blank fields, Change allows existing fields and gathers reason before save; server independently detects correction. Include equipment metadata changes and clearing in correction detection. Pass reason to save, retain draft on error/conflict, reset accepted baseline only when correct response current generation/session.
- [ ] Render pointHistory rows as safe text with before/after, author, measurement date, save time, reason; preserve actor/request races when switching point/system/run. Show legacy reason as not recorded. Never change trial count, units, formulas/PDF rendering or summary aggregation.
- [ ] Calibration warning uses applicable point/trial date versus due date, not run start or current day for historical readings. Dates copied only to explicit payload_path fields; never invent a measurement date or mutate loaded closed records. Run-level metadata generic devices shown above form.
- [ ] Split runs view into run management and system-pinned trend routes; hide combined type selector on dedicated route. Preserve selected-record point/limit chart and add multi-run series view via existing trendSeries using only authorized closed records, retain gaps/multiple same-month series/units. Keep source table/download and no-data states.
- [ ] GREEN targeted unit/E2E: three days partial entry, revisit point, blank additions, correction+clear reason, idempotent retry/network failure, reload persisted data, old closed records/PDF buttons, no cross-system trend data, no horizontal overflow. Write report and commit only owned files, no push.
- [ ] Primary integration/rerun + independent task review.

## Task 4: Integration, cutover and final release (primary)

**Files:** directly affected test fixtures/CI evidence and new operation result doc only. Shared backend adjustments remain primary.

- [ ] Inspect every worker diff. Integrate live contracts; run targeted tests together then typecheck/build/budget/drift/unit and relevant qualification+shell browser checks. Use private outDir to avoid user preview8882.
- [ ] Critical final reviewer receives diff, requirements, migration SQL/race/permission/preservation evidence and browser screenshots. Resolve findings with focused RED/GREEN; no unrelated cleanup.
- [ ] Read production metadata/ledger/currentmain; new migration absent, old migrations present. Fresh lightweight streamed backup and clone restore; compare only affected/protected data, avoid heavy global JSON aggregate. Rehearse exact new migration and rollback/forward path before production. Do not overwrite prior immutable receipt.
- [ ] Server cutover gates/drains relevant old qualification writers, exact-function/policy checks, locks/transaction guard, restore only required RPC grants, migration ledger in same transaction. No replay if receipt ambiguous: inspect ledger first. Keep MFA pre_request and PQ ACLs.
- [ ] Push candidate/CI, reviewed migration guard before enabling required frontend, main deploy authorized. Verify all live artifact bytes exactSHA and live headless read-only: navigation/wordmark, run selector, historical records/PDF/trends, calibration/history views. No test records in production.
- [ ] Update root and specialized state plus local handoff with local/pushed/production applied/deployed explicitly. Include remaining limits without claiming unrun tests.

## Rollback and handoff

No data-destructive rollback. New data/history retained; old UI may be incompatible with mandatory-run server and correction reason. Prefer forward fix or previously verified compatible candidate. Never remove MFA/PQ guards, rewrite closed revisions, or restart to mask a test failure. Independent review checkpoints at each task and before production. Primary owns Git integration and all database operations.

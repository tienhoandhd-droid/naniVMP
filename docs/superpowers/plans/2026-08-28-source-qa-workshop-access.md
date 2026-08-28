# Source QA and Workshop Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Keep all database and overlapping shared-file changes sequential under the primary `gpt-5.6-sol` planner. Every behavior change starts RED; completion requires fresh independent review and verification.

**Goal:** Make Source owner/support the immediate canonical QA authorization relationship, add separate department/area/optional-line workshop view coverage without widening workshop edit, close every Source reader/server bypass, and ship the narrow Admin/QA Manager Source UI safely through production.

**Architecture:** Enforce and index the existing one-active-Source-per-`object_code` relation, add a normalized audited `vmp_source_workshop_scope_grants` table, one set of server predicates, and an authorization revision. QA rights join item -> active Source by canonical object code and compare owner/support directly. Workshop view uses coverage alone; workshop `actual_validation_date` write uses coverage AND current item assignment. Replace direct/client-wide Source reads with paged RPCs. Preserve Admin-only general management.

**Tech stack:** PostgreSQL 17/Supabase RLS and SECURITY DEFINER RPCs, React 18, TypeScript, Vite, Node 24.18, Node test runner + `tsx`, Puppeteer mock E2E, Supabase CLI 2.113.0, GitHub Actions/Pages.

## Global constraints

- Work from `/home/admin1/VMP/naniVMP-repo/.worktrees/qa-rights-account-alignment` on `feat/source-qa-workshop-scope`; record the implementation starting SHA before edits.
- Do not edit the two planning docs while implementing except through a separately reviewed plan correction.
- The primary Sol planner owns the end-to-end architecture, all migrations, shared SQL scripts, and final integration. Database work is sequential.
- A Terra worker may own the new isolated frontend model/components only after the migrations and contracts are fixed. It must not redesign RPCs. The primary inspects every diff and reruns tests.
- A separate Sol reviewer performs the database/security review. A separate Terra reviewer performs UI/accessibility review. Zero Critical and zero Important findings are required.
- Use UUID identity only. Never select production people by name/email/regex. Never print tokens, UUID lists, emails, names, passwords, or raw row payloads into evidence.
- Do not add password retrieval/reset behavior. Do not change Admin-only account/role management.
- Do not invent factory data. This release's real workshop key is `(performer_id, department, area_code, line nullable)`; blank line means whole area. Blank area fails closed.
- Keep `item_permissions_mode=preview`; the Source/progress boundaries in this plan enforce independently.
- Do not push/merge/deploy until local checks and independent reviews pass. Production database and Pages deployment are authorized for this feature, but only the exact reviewed artifacts and SHA may be applied.

## Shared files and dependency order

| Sequential owner | Files |
| --- | --- |
| Primary Sol — database | `supabase/migrations/20260828140000_source_qa_workshop_access_expand.sql`, `supabase/migrations/20260828150000_source_qa_workshop_access_enforce.sql`, `scripts/check-source-qa-workshop-access-preflight.sql`, `scripts/check-source-qa-workshop-access.sql`, `scripts/forward-recover-source-qa-workshop-access.sql`, `scripts/run-source-qa-workshop-access-db-tests.sh`, `tests/sql/source-qa-workshop-access.sql`, `tests/sql/source-qa-workshop-access-security.sql`, `tests/sql/source-qa-workshop-access-performance.sql` |
| Primary Sol — shared application | `src/types/database.ts`, `src/types/domain.ts`, `src/lib/access.ts`, `src/lib/catalogForm.ts`, `src/lib/supabaseData.ts`, `src/lib/snapshotCache.ts`, `src/hooks/index.ts`, `src/App.tsx`, `src/features/catalogWorkspace/CatalogWorkspaceShell.tsx`, `src/features/catalogWorkspace/api.ts`, `src/features/catalogWorkspace/contracts.ts`, `src/features/catalogWorkspace/catalogWorkspaceFilterModel.ts`, `src/features/catalogWorkspace/useCatalogSuggestions.ts`, `src/features/catalogWorkspace/CatalogExcelImport.tsx`, `src/components/catalog/CatalogObjectForm.tsx`, `src/components/catalog/KhongThamDinhCard.tsx`, `src/constants/vmp.ts` |
| Bounded Terra frontend | New `src/features/sourceAccess/contracts.ts`, `api.ts`, `sourceAccessModel.ts`, `useSourceQaCandidates.ts`, `QaPersonSelect.tsx`, `WorkshopScopeCoveragePanel.tsx`; their new focused unit tests |
| Primary integration | `tests/e2e/gia-lap-supabase.mjs`, `tests/e2e/catalog-workspace.mjs`, new `tests/e2e/source-qa-workshop-access.mjs`, relevant existing progress/cache E2E, `package.json`, `.github/workflows/deploy.yml`, new `docs/runbooks/2026-08-28-source-qa-workshop-access.md` |

Do Tasks 1–4 before delegating frontend implementation. Tasks 5–7 may then be separate-file work, but `CatalogWorkspaceShell.tsx`, `supabaseData.ts`, `App.tsx`, generated types, and mock store integration remain primary-owned and sequential.

---

## Task 1: Freeze baseline and add the failing authorization suites

**Files:**
- Create: `tests/sql/source-qa-workshop-access.sql`
- Create: `tests/sql/source-qa-workshop-access-security.sql`
- Create: `tests/sql/source-qa-workshop-access-performance.sql`
- Create: `scripts/run-source-qa-workshop-access-db-tests.sh`
- Create/modify focused unit contracts listed below; do not change runtime code

- [ ] **Step 1: Record identity and clean scope**

Run:

```bash
test "$(git branch --show-current)" = "feat/source-qa-workshop-scope"
test "$(git rev-parse HEAD)" = "b2c6896c62350b4c17d3f83ec980d1369769ec94"
git status --short
git diff --check
node --version
supabase --version
```

Expected: only the pre-existing untracked `.superpowers/research/` plus these
two planning docs, Node 24.x, Supabase 2.113.0. If HEAD advanced intentionally,
record the actual clean SHA and re-read every overlapping diff before proceeding.

- [ ] **Step 2: Write business-matrix RED fixtures**

In `source-qa-workshop-access.sql`, create rollback-only personas for Admin, QA
Manager, owner QA, support QA, unrelated QA, area workshop, line workshop, and
unassigned workshop. Create two Source objects in the same department/area but
different lines and active items linked by canonical `object_code`.
Assert these rule IDs:

```text
SQA_OWNER_CAN_VIEW_AND_EDIT_7
SQA_SUPPORT_CAN_VIEW_AND_EDIT_7
SQA_UNRELATED_DENIED
SQA_ASSIGNMENT_PROJECTION_NOT_AUTHORITY
SQA_REPLACE_AND_CLEAR_IMMEDIATE
SQA_SUPPORT_ONLY_REMAINS_COLLABORATOR
SACCESS_ENFORCE_FAILURE_BEFORE_REPAIR_ROLLS_BACK
SACCESS_ENFORCE_FAILURE_AFTER_REPAIR_ROLLS_BACK
SWS_AREA_VIEW_WITHOUT_ITEM_ASSIGNMENT
SWS_AREA_VIEW_HAS_NO_EDIT_WITHOUT_ASSIGNMENT
SWS_LINE_DOES_NOT_CROSS_LINE
SWS_EDIT_REQUIRES_ASSIGNMENT_AND_SCOPE
SWS_AREALESS_SOURCE_DENIED
SPROGRESS_DOES_NOT_MUTATE_SOURCE
```

The projection test deletes the compatibility QA assignment inside the test
transaction and still expects canonical owner/support access. The Source
immutability test snapshots `to_jsonb(vmp_source_objects)` before QA/workshop
actual/status writes and compares it afterward.

The support-only fixture has no Source owner. Reconciliation must preserve one
canonical support collaborator without inventing or promoting a primary. The
two enforce failure-injection phases abort immediately before repair and again
after repair but before commit, then reconnect and prove the database is still
at the expand state: the fail-closed refresh stub remains installed, service
execute remains revoked, and projection hashes/counts are unchanged.

- [ ] **Step 3: Write security RED**

`source-qa-workshop-access-security.sql` must enumerate every effective browser
function and every SECURITY DEFINER definition containing
`vmp_source_objects`, `vmp_plan_items`, or `vmp_item_assignments`; fail any
unreviewed reader. Assert exact owner, language, volatility, search path, ACL,
no overload, RLS expression, and no direct authenticated mutation. Probe
products/alerts/import/pending/history as QA/workshop and expect `FORBIDDEN`.

- [ ] **Step 4: Write performance RED**

Insert at least 10,000 Source rows, 20,000 items, 1,000 performers, 5,000 grants,
and 10,000 assignments in the rollback fixture. Capture JSON plans for QA list,
workshop area list, workshop line list, item-rights batch, and candidate search.
Assert the expected relation indexes appear and result limits are honored; do
not assert machine-specific milliseconds.

- [ ] **Step 5: Prove RED once**

Run:

```bash
set +e
bash scripts/run-source-qa-workshop-access-db-tests.sh > /tmp/source-access-red.log 2>&1
red_status=$?
set -e
test "$red_status" -ne 0
rg 'vmp_source_workshop_scope_grants|rpc_list_source_objects|SQA_OWNER' /tmp/source-access-red.log
```

Expected: failure because the new schema/functions are absent, after the harness
has proven the PostgreSQL 17 clone and fixture setup. Preserve sanitized RED
rule IDs/status in the implementation report; do not commit `/tmp` logs.

- [ ] **Step 6: Commit tests only**

```bash
git add tests/sql/source-qa-workshop-access*.sql scripts/run-source-qa-workshop-access-db-tests.sh
git commit -m "test(access): define source QA and workshop boundary"
```

## Task 2: Add the relation, grants, revision, reconciliation, and indexes

**Files:**
- Create: `supabase/migrations/20260828140000_source_qa_workshop_access_expand.sql`
- Modify: Task 1 SQL fixtures only when a fixture—not an expectation—is wrong

- [ ] **Step 1: Implement strict preconditions**

Pin the current table/function/index/trigger/ACL contracts used by the
migration, assert PostgreSQL 17, no unexpected overloads, at least one active
Admin, and the current five-role matrix. Abort if an active plan item has zero
or multiple Source match or Source/plan owner/support differs. Do not pin live
row counts as invariants.

- [ ] **Step 2: Enforce the existing canonical code relation**

Preflight every active item against active Source and abort on zero/multiple
matches. Add a partial unique active Source-code index and the matching item
lookup index:

```sql
create unique index uq_vmp_source_objects_active_object_code
  on public.vmp_source_objects(object_code)
  where is_active;
create index idx_vmp_plan_items_object_year_active
  on public.vmp_plan_items(object_code, year, is_active, validation_code);
```

Add a private exact resolver that returns no Source row unless the active match
is unique. Do not add a second item identity column or change public writer
signatures.

- [ ] **Step 3: Add normalized grant schema**

Create `vmp_source_scope_key(text)` and
`vmp_source_workshop_scope_grants` exactly as specified in the design. Add
partial active area/line uniqueness and person/area/line lookup indexes. Add
RLS enabled but no broad policy; mutations are not granted to authenticated.

- [ ] **Step 4: Add revision and relation indexes**

Create singleton `vmp_authorization_revision`, its touch helper/transactional
triggers, Source owner/support/list/scope indexes, candidate indexes, and active
assignment indexes. Preserve and assert both existing partial unique indexes:
`vmp_item_assignments_one_active_qa_primary` and
`vmp_item_assignments_one_active_qa_person`; do not relax either one. Trigger
changes must touch the revision once per transaction and never mutate Source
business fields.

- [ ] **Step 5: Add private reconciler and fence the expand gap**

Implement `vmp_reconcile_source_qa_projection(uuid)`. Lock Source, related items,
then active/reusable inactive QA assignments in stable order. Its contract must
demote/audit a different active primary before owner activation, soft-revoke and
audit a same-person noncanonical row before canonical activation, keep support
as collaborator, and use one `source_owner` primary when owner=support. Do not
run reconciliation in expand and do not mutate current plan/assignment
projections.

Replace `rpc_refresh_source_item_assignments()` temporarily with a
same-signature fail-closed `SOURCE_ACCESS_UPGRADE_IN_PROGRESS` stub and revoke
service-role execute. This must block owner SQL by behavior as well as normal
service calls by ACL. Assert the stub definition/ACL and unchanged projection
hash/counts. Each migration takes the same transaction-scoped advisory lock;
the operator serializes the two separate linked-CLI sessions and forbids
concurrent legacy apply/recovery scripts. The fail-closed stub, not a lock held
between sessions, protects the expand-to-enforce gap.

- [ ] **Step 6: Run focused GREEN for expansion**

```bash
bash scripts/run-source-qa-workshop-access-db-tests.sh --phase expand
git diff --check
```

Expected: schema/index/helper/stub checks pass; service-role refresh is denied,
existing projections are byte-unchanged, and authorization/reconciliation tests
that need enforcement remain expected RED and are reported separately.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260828140000_source_qa_workshop_access_expand.sql
git commit -m "feat(access): enforce source relation and add workshop coverage schema"
```

## Task 3: Enforce atomic QA/workshop rights and writer-time revocation

**Files:**
- Create: `supabase/migrations/20260828150000_source_qa_workshop_access_enforce.sql`
- Modify: `tests/sql/source-qa-workshop-access.sql`
- Modify: `tests/sql/source-qa-workshop-access-security.sql`

- [ ] **Step 1: Replace refresh and reconcile projections**

Assert the exact expand-state schema, fail-closed refresh hash/ACL, and both QA
unique indexes. Install a projection-aware `rpc_refresh_source_item_assignments`
while service-role execute remains revoked. It calls the canonical reconciler in
stable Source order, never deletes/reinserts or globally re-ranks QA rows, and
keeps equipment maintenance isolated. Run audited reconciliation for every
active Source, prove owner=support-aware zero drift and idempotence, then run
all non-ACL reconciliation/security assertions. Only then restore the exact
owner+service-role ACL, assert that final ACL and the remaining postconditions,
and commit.

- [ ] **Step 2: Implement private predicates**

Create/replace the exact helpers from the design:

```text
vmp_can_manage_source_qa_assignment(uuid)
vmp_can_manage_source_workshop_scope(uuid)
vmp_source_workshop_scope_match(uuid,uuid)
vmp_can_view_source_object(uuid,uuid)
vmp_can_view_plan_item(uuid,text)
vmp_item_scope_matches(uuid,text)
vmp_item_rights(uuid,text)
```

QA staff reads Source owner/support directly. Workshop `can_view` is coverage;
its editable array is `{'actual_validation_date'}` only when matching active,
unexpired `equipment_department` assignment also exists. Admin/QA Manager
rules preserve their current exact allowlists.

- [ ] **Step 3: Make Source assignment save atomic and timeline-independent**

Replace `rpc_save_catalog_object` behind the existing signature. Split access
fields from planned-timeline fields; remove owner/support from
`vmp_catalog_timeline_fields`; require a reason through a separate access-field
check. Validate active eligible QA IDs, lock in the documented order, call the
projection reconciler, audit, and touch revision. Return one success or one
failure—remove partial `*_failed` arrays. Store no owner/support in pending
change JSON.

- [ ] **Step 4: Harden all code-relation writers without signature changes**

Review `rpc_generate_timeline`, catalog apply V1/V2, `rpc_create_plan_item`,
`rpc_commit_catalog_import`, `rpc_upsert_source_row`, sheet sync/reconciliation,
Source activation, and service maintenance writers. Preserve their public
signatures, require the locked active Source code for generated items, and let
the unique index reject a second active Source with that code. Prevent any
unreviewed direct owner/support update from bypassing reconciliation.

- [ ] **Step 5: Add coverage APIs**

Implement, with exact ACL/JSON error contracts:

```text
rpc_list_source_workshop_coverage(text,jsonb,integer)
rpc_source_workshop_scope_choices(text,text,text,jsonb,integer)
rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)
```

The writer accepts only an active uniquely linked workshop principal and a
department/area/optional-line tuple currently present in active Source. It uses
optimistic version, mandatory reason, soft revoke, audit, and revision bump.

- [ ] **Step 6: Serialize progress authorization with revocation**

Modify the enforced progress implementation so it locks Source and current
grant/assignment evidence before resolving the field allowlist. Add two harness
sessions for QA owner revoke vs progress and workshop scope revoke vs progress.
Exactly one valid commit order is observed; no write may commit after an earlier
revoke commit.

- [ ] **Step 7: Run business GREEN**

```bash
bash scripts/run-source-qa-workshop-access-db-tests.sh --phase behavior
```

Expected: every Task 1 business rule, mixed-payload atomicity, projection repair,
and concurrency marker passes and the suite rolls back fixtures.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260828150000_source_qa_workshop_access_enforce.sql tests/sql/source-qa-workshop-access*.sql
git commit -m "feat(access): enforce source QA and workshop authorization"
```

## Task 4: Close every reader, RLS policy, and non-object Source surface

**Files:**
- Continue modifying: `20260828150000_source_qa_workshop_access_enforce.sql`
- Modify: `tests/sql/source-qa-workshop-access-security.sql`
- Modify: `tests/sql/source-qa-workshop-access-performance.sql`

- [ ] **Step 1: Add paged Source APIs**

Implement exact signatures:

```text
rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)
rpc_source_object_facets(text,jsonb)
rpc_export_source_objects(text,text,jsonb,jsonb,integer)
rpc_source_field_suggestions(text,text,text,jsonb,integer)
rpc_source_qa_candidates(text,jsonb,integer,uuid[])
```

List limit is 1–100, candidate 1–50, export 1–500. Use stable keyset cursors.
Candidate rows are eligible active QA only; requested current IDs are returned
separately with eligibility status. Export/list/facets use the same rights and
filter predicate.

- [ ] **Step 2: Replace dashboard/warnings/watermark**

Filter `rpc_get_vmp_dashboard` objects and activities through one visible
Source-object CTE. Filter `rpc_get_vmp_watermark` over the same set and include
`authorization_revision`. Filter `rpc_source_warnings` identically. Do not expose
global counts/timestamps to lower roles.

- [ ] **Step 3: Gate all Source-bearing SECURITY DEFINER functions**

Review the complete generated `pg_proc` inventory. Manager-gate all Source
writers/history/import/pending functions. Rights-filter any legitimate lower-role
reader. Revoke execute from renamed/private implementations. Gate
`rpc_list_catalog_dataset` products/alerts to Admin/QA Manager. Do not merely
add a session check.

- [ ] **Step 4: Replace RLS**

Install exact Source/item/grant/assignment policies from the design and align
products/alerts with manager-only access. Assert no permissive authenticated
policy remains and direct mutations remain revoked.

- [ ] **Step 5: Run security/performance GREEN**

```bash
bash scripts/run-source-qa-workshop-access-db-tests.sh --phase security
bash scripts/run-source-qa-workshop-access-db-tests.sh --phase performance
bash scripts/run-source-qa-workshop-access-db-tests.sh
```

Expected: all rule IDs pass, no unknown SECURITY DEFINER reader, reviewed index
names appear in JSON plans, and the complete suite reports rollback.

- [ ] **Step 6: Independent Sol review checkpoint**

Reviewer reads both full migrations and SQL suites, checks the generated
function/RLS/ACL inventory, runs the full harness from a fresh clone, and reports
Critical/Important findings. The primary fixes at most one reviewed wave, reruns
the whole harness, and obtains 0/0 before frontend integration.

- [ ] **Step 7: Commit reviewed database boundary**

```bash
git add supabase/migrations/20260828150000_source_qa_workshop_access_enforce.sql tests/sql/source-qa-workshop-access*.sql scripts/run-source-qa-workshop-access-db-tests.sh
git commit -m "fix(access): close source readers and definer bypasses"
```

## Task 5: Add strict frontend contracts and QA selector states

**Files:**
- Create: `src/features/sourceAccess/contracts.ts`
- Create: `src/features/sourceAccess/api.ts`
- Create: `src/features/sourceAccess/sourceAccessModel.ts`
- Create: `src/features/sourceAccess/useSourceQaCandidates.ts`
- Create: `src/features/sourceAccess/QaPersonSelect.tsx`
- Create: `tests/unit/source-access-contracts.test.mjs`
- Create: `tests/unit/source-qa-candidates.test.mjs`
- Modify: `src/components/catalog/CatalogObjectForm.tsx`
- Modify: `src/lib/catalogForm.ts`
- Modify: `tests/unit/catalog-form.test.mjs`

- [ ] **Step 1: Write unit RED**

Test strict decoding of list/candidate/current/grant payloads; malformed payload
must throw/fail closed. Test candidate states `idle/loading/ready/error`, stale
response suppression, cursor append, active eligible rows only, successful zero
copy, current ineligible display, and error Retry. Update catalog-form RED so
owner/support require an access reason but do not count as timeline fields.

Run:

```bash
node --import tsx --test tests/unit/source-access-contracts.test.mjs tests/unit/source-qa-candidates.test.mjs tests/unit/catalog-form.test.mjs
```

Expected RED: missing modules/new behavior.

- [ ] **Step 2: Implement typed API and state machine**

`api.ts` calls only the new RPCs and preserves server `error_code`. The hook
loads 25 rows initially, debounces search 250 ms, sequence-guards responses, and
never imports `usePerformers`/`fetchPerformers`. `QaPersonSelect` renders distinct
loading, successful empty, error+Retry, and current-ineligible states with
accessible labels.

- [ ] **Step 3: Integrate the form**

Replace the `performers` prop with the candidate controller. Send UUID only.
Allow unrelated Source fields to save if candidate loading fails and assignment
fields are unchanged; block a new selection until ready; allow explicit clear.
Remove the old partial projection warning toasts from the shell contract.

- [ ] **Step 4: Prove GREEN**

```bash
node --import tsx --test tests/unit/source-access-contracts.test.mjs tests/unit/source-qa-candidates.test.mjs tests/unit/catalog-form.test.mjs
npm run typecheck
```

- [ ] **Step 5: Commit bounded frontend work**

```bash
git add src/features/sourceAccess src/components/catalog/CatalogObjectForm.tsx src/lib/catalogForm.ts tests/unit/source-access-contracts.test.mjs tests/unit/source-qa-candidates.test.mjs tests/unit/catalog-form.test.mjs
git commit -m "feat(source): add visible QA candidate selector states"
```

## Task 6: Move Source objects/export/suggestions to server pagination and add coverage UI

**Files:**
- Create: `src/features/sourceAccess/WorkshopScopeCoveragePanel.tsx`
- Create: `tests/unit/source-workshop-coverage.test.mjs`
- Modify: `src/features/catalogWorkspace/CatalogWorkspaceShell.tsx`
- Modify: `src/features/catalogWorkspace/api.ts`
- Modify: `src/features/catalogWorkspace/contracts.ts`
- Modify: `src/features/catalogWorkspace/catalogWorkspaceFilterModel.ts`
- Modify: `src/features/catalogWorkspace/useCatalogSuggestions.ts`
- Modify: `src/features/catalogWorkspace/CatalogExcelImport.tsx`
- Modify: `src/components/catalog/KhongThamDinhCard.tsx`
- Modify: `src/lib/supabaseData.ts`
- Modify: `src/constants/vmp.ts`
- Modify focused existing unit tests

- [ ] **Step 1: Write RED models/contracts**

Test server filter encoding, keyset cursor stack, rights-safe deep link,
manager-only nav set, object-only lower-role nav set, paged export aggregation,
coverage tuple validation, blank-line area semantics, area-less warning, version
conflict, and revoke confirmation.

- [ ] **Step 2: Replace direct Source reads**

The shell uses `rpc_list_source_objects`, server facets, visible errors, and
cursor pages. Delete Source callers of direct `fetchSourceObjects`. Suggestions
are manager-only, paged, and show error. Import sends staged rows without
preloading Source. `KhongThamDinhCard` uses rights-filtered list/export.

Confirm:

```bash
! rg 'fetchSourceObjects\(' src/features/catalogWorkspace src/components/catalog/KhongThamDinhCard.tsx
! rg 'usePerformers\(' src/features/catalogWorkspace/CatalogWorkspaceShell.tsx
```

- [ ] **Step 3: Add the narrow coverage tab**

Add `coverage` to the Source workspace only when
`access.can("source","manage_workshop_scope")`. Render server-paged active
workshop people including zero-grant people, real Source department/area/line
choices, mandatory reason, optimistic create/change/revoke, retry/error/empty
states, and area-less Source warning. Do not import `StaffDirectoryPanel` or any
account/role writer.

- [ ] **Step 4: Close lower-role non-object presentation**

QA/workshop Source viewers get objects only. If capability changes while another
tab is open, synchronously return to objects before starting a request. Update
Source navigation copy without advertising factory support.

- [ ] **Step 5: Run GREEN**

```bash
npm run typecheck
node --import tsx --test tests/unit/catalog-workspace-filter-model.test.mjs tests/unit/catalog-suggestions.test.mjs tests/unit/catalog-form.test.mjs tests/unit/source-*.test.mjs tests/unit/screen-access.test.mjs
```

- [ ] **Step 6: Terra UI/accessibility review and commit**

Reviewer checks error vs empty, keyboard/focus, `role=alert`, stale requests,
mobile/desktop parity, and no general-management import. Fix once if needed,
rerun focused tests, then:

```bash
git add src tests/unit
git commit -m "feat(source): page authorized objects and manage workshop coverage"
```

## Task 7: Integrate dashboard revocation, generated types, and end-to-end proofs

**Files:**
- Modify: `src/types/database.ts`
- Modify: `src/types/domain.ts`
- Modify: `src/lib/access.ts`
- Modify: `src/lib/snapshotCache.ts`
- Modify: `src/hooks/index.ts`
- Modify: `src/App.tsx`
- Modify: `tests/e2e/gia-lap-supabase.mjs`
- Modify: `tests/e2e/catalog-workspace.mjs`
- Create: `tests/e2e/source-qa-workshop-access.mjs`
- Modify: `tests/unit/snapshot-permission-cache.test.mjs`
- Modify: relevant progress revocation unit/E2E

- [ ] **Step 1: Write cache/access RED**

Test new Source capabilities parse only for explicit valid payloads. Test that a
protected snapshot with old/missing authorization revision is never rendered and
watermark failure clears data. Test focus coalescing and current-request guards.

- [ ] **Step 2: Regenerate and inspect types**

Against the migrated disposable PostgreSQL 17 database run the repository type
generation path, then inspect the diff. It must contain the two new tables/
columns and exact public RPC signatures; no unrelated schema drift.

- [ ] **Step 3: Integrate revision-aware dashboard**

Parse `authorization_revision` from watermark/dashboard. Do not show protected
snapshot data until a fresh watermark confirms user/year/mode/revision. Clear on
rights error. Successful owner/support/coverage writes request the same
coalesced refresh path used by focus/visibility.

- [ ] **Step 4: Add mock E2E personas**

The new E2E must prove through intercepted real UI/RPC requests:

1. QA Manager loads candidate page and selects owner/support;
2. candidate failure displays alert+Retry, not empty options;
3. owner and support QA see the object/item and seven fields;
4. replace/clear plus focus removes it and closes/clears an open modal;
5. area workshop sees both lines/read-only without assignment;
6. line workshop sees one line;
7. assignment adds only `actual_validation_date` edit;
8. scope revoke removes view/edit;
9. QA/workshop direct products/alerts/import/pending/history calls are forbidden;
10. export/warnings contain no unauthorized fixture.

- [ ] **Step 5: Run integration GREEN**

```bash
npm run typecheck
npm run test:unit
bash scripts/with-preview.sh -- bash -c '
  node tests/e2e/source-qa-workshop-access.mjs &&
  npm run e2e:catalog &&
  npm run e2e:progress-rights &&
  npm run e2e:admin
'
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src tests/e2e tests/unit
git commit -m "test(access): prove source relationship revocation end to end"
```

## Task 8: Add release checkers, recovery, CI gate, and runbook

**Files:**
- Create: `scripts/check-source-qa-workshop-access-preflight.sql`
- Create: `scripts/check-source-qa-workshop-access.sql`
- Create: `scripts/forward-recover-source-qa-workshop-access.sql`
- Create: `docs/runbooks/2026-08-28-source-qa-workshop-access.md`
- Modify: `package.json`
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Implement read-only pre/postflight**

Both checkers own `BEGIN READ ONLY` and `ROLLBACK`, output only counts/digests/
PASS markers, and verify project contract, modes, active Admin, Source/item exact
mapping, owner/support consistency, candidate eligibility distribution, area-less
count, grant readiness, indexes, function definitions/ACLs, RLS, and complete
SECURITY DEFINER inventory. Postflight uses fresh connections and lower-role
claims in rollback-only checks; no production writer probe. Capture the refresh
definition hash and ACL at baseline, expand, and enforce; inventory cron/SQL call
paths including `scripts/apply-qa-rights-account-manifest.sql`.

- [ ] **Step 2: Implement safe forward recovery**

Recovery must require exact reviewed function hashes. It may revoke new mutator
execute and make lower-role Source reads deny while preserving Admin/QA Manager
repair access. It must not restore permissive session-wide readers, delete grant/
audit/relation data, change passwords, or restore the whole database.

- [ ] **Step 3: Write exact linked-CLI runbook**

Use the exact production path:

```bash
test "$(supabase --version)" = "2.113.0"
test "$(tr -d '\n' < supabase/.temp/project-ref)" = "ivembmikfhtyzhtqebgh"
supabase backups list --project-ref ivembmikfhtyzhtqebgh --output json
supabase db query --linked --file scripts/check-source-qa-workshop-access-preflight.sql
supabase db query --linked --file supabase/migrations/20260828140000_source_qa_workshop_access_expand.sql
supabase db query --linked --file supabase/migrations/20260828150000_source_qa_workshop_access_enforce.sql
supabase db query --linked --file scripts/check-source-qa-workshop-access.sql
```

The runbook pins release SHA and SHA-256 for every migration/check/recovery/
workflow artifact. The current project reports no physical-backup entry,
`pitr=false`, and `walg=true`; record that fact but do not pretend a restorable
physical backup exists or block on one. Before apply, capture reviewed function,
policy, ACL, matrix, and schema hashes/definitions into the restricted evidence
directory. Recovery relies on transaction ownership, those captures, the
reviewed forward-recovery artifact, and read-only postflight. The runbook uses no
pooler password/pg_dump assumption, reloads PostgREST schema only after
postflight, and defines fresh-session persona probes and Pages exact-SHA rollback.
Each migration acquires the same transaction-scoped release advisory lock. The
operator keeps the separate linked-CLI calls serialized and explicitly forbids
concurrent legacy manifest/recovery scripts until enforce postflight; the
fail-closed refresh stub is the actual protection between migration sessions.

- [ ] **Step 4: Add CI commands**

Add `test:db:source-access` and `e2e:source-access` scripts. Add a PostgreSQL 17
source-access job or an equivalent sealed clone job to CI before production
build; add the new mock E2E to the non-deploy exact-SHA gate. Do not let frontend
build/deploy run if database contract tests fail.

- [ ] **Step 5: Run local release gate**

```bash
git diff --check
npm run typecheck
npm run test:unit
npm run test:db:source-access
bash scripts/with-preview.sh -- bash -c '
  npm run e2e:gialap &&
  npm run e2e:catalog &&
  npm run e2e:source-access &&
  npm run e2e:progress-rights &&
  npm run e2e:admin
'
npm run a11y
npm run build
```

- [ ] **Step 6: Commit release artifacts**

```bash
git add scripts docs/runbooks package.json .github/workflows/deploy.yml
git commit -m "chore(access): gate source authorization release"
```

## Task 9: Final reviews, CI, production, and post-deploy verification

- [ ] **Step 1: Primary whole-diff inspection**

```bash
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git status --short
```

Primary Sol inspects every delegated diff and confirms no password work,
factory fiction, general-management reopening, direct Source reader, partial
projection success, or client-only authorization.

- [ ] **Step 2: Independent final reviews**

Separate Sol security reviewer reruns database suites and inspects migrations,
ACL/RLS/inventory/concurrency/recovery. Separate Terra reviewer reruns UI/E2E/
accessibility. Resolve all Critical/Important findings, rerun the entire local
release gate, then obtain 0/0 from both reviewers on the final SHA.

- [ ] **Step 3: Dispatch exact-SHA CI**

Set `REVIEWED_RELEASE_SHA="$(git rev-parse HEAD)"`, push only that reviewed
feature SHA, dispatch `.github/workflows/deploy.yml` with
`expected_commit="$REVIEWED_RELEASE_SHA"`, and require every job terminal-success
at that SHA. A dispatch quality run does not deploy Pages.

- [ ] **Step 4: Production preflight and database apply**

During the approved window, record the non-restorable backup status, execute the
definition/hash capture and read-only preflight, then expand migration, enforce
migration, and fresh-connection postflight
through `supabase db query --linked --file`. Stop on first failure. Never edit a
reviewed migration or rerun a failed mutation blindly.

- [ ] **Step 5: Fresh-session persona probes**

Probe Admin, QA Manager, owner QA, support QA, unrelated QA, area workshop,
line workshop, assigned workshop, and revoked workshop. Capture only status,
counts, field counts, and PASS/FAIL. Confirm the two area-less Source rows are
workshop-denied and the coverage readiness state is explicit.

- [ ] **Step 6: Deploy Pages exact SHA and monitor**

Only after database postflight/personas pass, merge/push the exact reviewed SHA
to the authorized main release path, monitor Quality and Deploy through Pages
terminal success, verify deployed asset SHA, and rerun read-only smoke probes.
On frontend failure, redeploy the previous Pages SHA while retaining the safer
database boundary.

- [ ] **Step 7: Completion evidence**

Report exact release SHA, fresh local/CI/production PASS markers, final token-free
evidence location, projection repair counts, grant readiness/area-less counts,
review 0/0 verdicts, and deployed Pages URL. Do not claim workshop rollout ready
for a person until that person has an explicit active area/line grant.

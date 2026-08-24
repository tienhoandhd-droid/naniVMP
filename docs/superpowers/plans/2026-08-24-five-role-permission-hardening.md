# Five-Role Permission Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make VMP recognize exactly five effective business roles, disable the approved seven accounts, close direct profile privilege escalation and cross-table audit disclosure, and make the frontend fail closed.

**Architecture:** Deploy a forward-only PostgreSQL hardening migration before the frontend. PostgreSQL remains the security boundary through a five-role resolver, active-session guard, RLS/ACL hardening and role-checked catalog-history RPCs; React consumes that contract without legacy fallback or pre-verification snapshots.

**Tech Stack:** PostgreSQL 15/Supabase, SQL/PLpgSQL, React 18, TypeScript, Node test runner, Playwright mock E2E, GitHub Actions/Pages.

## Global Constraints

- Base every code change on `origin/main@0a118d45119576c3e2ff0a776728c9fe6f1dd434` in the existing worktree `security/five-role-hardening`.
- Effective roles are exactly `admin`, `qa_manager`, `qa_staff`, `workshop_manager`, `workshop_staff`; PostgreSQL enum literal `viewer` remains legacy inert.
- Disable exactly seven approved profiles: 3 Viewer, 3 test `department_user`, 1 test `qa_manager`; expected UUID digest is `2c09501166eb45c3676451084230340e`; never select deployment targets by regex.
- Do not hard-delete Auth users, performers, assignments or audit lineage.
- Keep `screen_access_mode=enforced` and `item_permissions_mode=preview`; do not change the existing 481 item-permission blockers.
- Catalog history is available only to canonical Admin and QA Manager and only for `vmp_objects`, `vmp_products_gmp`, and `vmp_email_cho_phep` audit rows.
- Never run fixture/mutation tests against production. Production receives only the reviewed migration; postflight tests are read-only.
- Do not expose a service-role credential or write directly to Supabase Auth internal tables. Auth Admin ban is optional defense-in-depth when an approved server credential is available.
- Database/shared-state tasks run sequentially. The primary planner inspects every diff and reruns every relevant verification.

---

### Task 1: Disposable Database Harness and RED Security Tests

**Files:**
- Create: `supabase/config.toml`
- Create: `scripts/prepare-five-role-test-db.sh`
- Create: `scripts/run-five-role-db-tests.sh`
- Create: `tests/sql/five-role-hardening.sql`
- Create: `tests/unit/five-role-db-harness.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `SUPABASE_DB_URL` only for `pg_dump --schema-only`; the script must reject a target test URL whose host/database equals production.
- Produces: local-only `VMP_TEST_DB_URL`, a disposable Supabase/Postgres schema clone, and `npm run test:db:five-role`.

- [ ] **Step 1: Add failing harness behavior tests**

Create `tests/unit/five-role-db-harness.test.mjs` using `spawnSync` and a temporary `PATH` containing fake external executables. Exercise the real shell scripts and assert observable behavior:

```js
const missing = spawnSync("bash", ["scripts/prepare-five-role-test-db.sh"], {
  env: { ...process.env, SUPABASE_DB_URL: "" }, encoding: "utf8",
});
assert.equal(missing.status, 2);

const sameTarget = spawnSync("bash", ["scripts/run-five-role-db-tests.sh"], {
  env: {
    ...process.env,
    SUPABASE_DB_URL: "postgresql://u:p@db.example/prod",
    VMP_TEST_DB_URL: "postgresql://u:p@db.example/prod",
    PATH: fakeBin,
  },
  encoding: "utf8",
});
assert.equal(sameTarget.status, 3);
assert.equal(existsSync(psqlMarker), false);

const isolated = spawnSync("bash", ["scripts/run-five-role-db-tests.sh"], {
  env: {
    ...process.env,
    SUPABASE_DB_URL: "postgresql://u:p@prod.example/prod",
    VMP_TEST_DB_URL: "postgresql://u:p@127.0.0.1/test",
    PATH: fakeBin,
  },
  encoding: "utf8",
});
assert.equal(isolated.status, 0);
assert.match(readFileSync(psqlMarker, "utf8"), /tests\/sql\/five-role-hardening\.sql/);
```

The fake `psql` is the external-process boundary only; the real script's validation, branching and argument construction remain under test.

Add `test:db:five-role` to `package.json` as:

```json
"test:db:five-role": "bash scripts/run-five-role-db-tests.sh"
```

- [ ] **Step 2: Verify RED for the missing harness**

Run:

```bash
node --import tsx --test tests/unit/five-role-db-harness.test.mjs
```

Expected: FAIL because the scripts and package command do not exist.

- [ ] **Step 3: Implement the disposable clone harness**

`scripts/prepare-five-role-test-db.sh` must:

1. require `SUPABASE_DB_URL`;
2. start local Supabase with `supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor`;
3. obtain the local DB URL from `supabase status -o env` without printing secrets;
4. use `mktemp -d` plus `trap` cleanup;
5. run `pg_dump "$SUPABASE_DB_URL" --schema-only --schema=public --no-owner --file "$TMP/schema.sql"`;
6. restore that schema only into local Postgres with `psql "$VMP_TEST_DB_URL" -X -v ON_ERROR_STOP=1 -f "$TMP/schema.sql"`;
7. print only the local URL variable name/instructions, never production credentials.

`scripts/run-five-role-db-tests.sh` must compare normalized production and test hosts/database names, abort if equal, then execute:

```bash
psql "$VMP_TEST_DB_URL" -X -v ON_ERROR_STOP=1 \
  -f tests/sql/five-role-hardening.sql
```

- [ ] **Step 4: Write SQL RED tests against the cloned vulnerable schema**

`tests/sql/five-role-hardening.sql` must run inside a transaction and create synthetic Auth/Profile/Audit fixtures as owner. It then switches to `authenticated` with `request.jwt.claims` and asserts:

```sql
-- direct self-escalation must be rejected and role must remain department_user
update public.profiles set role = 'admin' where id = auth.uid();

-- legacy viewer must resolve NULL and return zero UI screens
select public.vmp_business_role(:viewer_uid) is null;

-- inactive five-role user must receive no visible item and no dashboard/catalog access
select count(*) = 0 from public.vmp_plan_items;

-- department user cannot list or detail catalog audit
select (public.rpc_catalog_history('{}', 10, 0)->>'error_code') = 'FORBIDDEN';

-- admin and QA manager list contains no old_data/new_data and cannot detail profiles audit
select not (payload::text ~ 'old_data|new_data');
select (public.rpc_catalog_history_detail(:profile_audit_id)->>'error_code') = 'NOT_FOUND';

-- matrix after migration is exactly five roles x seventeen screens
select count(*) = 85 from public.vmp_screen_permissions;
```

Use a PL/pgSQL assertion helper that raises `check_violation` with a rule ID. Roll back fixtures at the end.

- [ ] **Step 5: Verify the behavioral suite is RED before migration**

Run on the disposable clone without the new migration:

```bash
npm run test:db:five-role
```

Expected: FAIL first at `PROFILE_SELF_ESCALATION_BLOCKED`; after temporarily skipping only that assertion, the catalog-history and five-role assertions must also fail. Restore all assertions before continuing.

- [ ] **Step 6: Verify harness unit tests pass and commit**

Run:

```bash
node --import tsx --test tests/unit/five-role-db-harness.test.mjs
git diff --check
```

Commit:

```bash
git add package.json supabase/config.toml scripts/prepare-five-role-test-db.sh \
  scripts/run-five-role-db-tests.sh tests/sql/five-role-hardening.sql \
  tests/unit/five-role-db-harness.test.mjs
git commit -m "test(security): reproduce five-role permission gaps"
```

---

### Task 2: Forward Database Hardening Migration

**Files:**
- Create: `supabase/migrations/20260824120000_five_role_permission_hardening.sql`
- Create: `scripts/apply-five-role-hardening.sql`
- Create: `scripts/check-five-role-permission-state.sql`
- Create: `docs/runbooks/2026-08-24-five-role-permission-deploy.md`
- Modify: `tests/sql/five-role-hardening.sql`

**Interfaces:**
- Consumes: live five-role resolver/function/policy definitions and a psql variable `account_ids` containing exactly seven comma-separated UUIDs.
- Produces: `public.vmp_is_active_session() returns boolean`, five-role `vmp_business_role(uuid)`, hardened list/detail RPCs, 85-row screen matrix, revoked direct profile writes, and a transactional deployment entrypoint.

- [ ] **Step 1: Capture exact live preconditions read-only**

Run `BEGIN READ ONLY ... ROLLBACK` queries and record expected hashes in the migration for:

```sql
select public.screen_access_mode(), public.item_permissions_mode();
select count(*),
  md5(string_agg(concat_ws('|', business_role, screen_id,
    can_view, data_scope, actions::text), E'\n' order by business_role, screen_id)),
  md5(string_agg(concat_ws('|', business_role, screen_id,
    can_view, data_scope, array_to_string(actions, ',')), E'\n'
    order by business_role, screen_id))
from public.vmp_screen_permissions;
select md5(pg_get_functiondef('public.vmp_business_role(uuid)'::regprocedure));
select md5(pg_get_functiondef('public.rpc_my_ui_access()'::regprocedure));
select md5(pg_get_functiondef('public.rpc_catalog_history(jsonb,integer,integer)'::regprocedure));
select md5(pg_get_functiondef('public.rpc_catalog_history_detail(uuid)'::regprocedure));
```

The migration raises before DDL when modes are not `enforced/preview`, matrix
count is not 102, or either reviewed matrix digest differs. The exact
PostgreSQL array-text digest is `0befb5a03f96dfe2dfa653f7da929cd0`;
the earlier reviewed digest `b5fb9554b5ed69ff247c3ea54a6e3b0e` uses CSV
normalization via `array_to_string(actions, ',')`. Assert both to preserve the
original evidence while removing the ambiguity in its recorded query. Function
hashes must differ from none of these reviewed live values:

```text
auth_user_role()                           b23193f21fe23e5a88fa83569661a420
vmp_business_role(uuid)                    5157bf108e294b174457701a20081aaa
rpc_my_ui_access()                         7e03ac3e48da9f0d3a83e18cd92409ce
rpc_catalog_history(jsonb,integer,integer) d5cc4d836c5039230f7e46a936b42f57
rpc_catalog_history_detail(uuid)           b2675c46e69e46492799ed0ea8841d13
```

- [ ] **Step 2: Implement canonical active-session and five-role resolution**

Create:

```sql
create or replace function public.vmp_is_active_session(p_uid uuid default auth.uid())
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select p_uid is not null
     and exists (
       select 1 from public.profiles p
       where p.id = p_uid and coalesce(p.is_active, true)
         and p.role::text <> 'viewer'
     )
     and public.vmp_business_role(p_uid) in
       ('admin','qa_manager','qa_staff','workshop_manager','workshop_staff')
$$;
```

Rewrite `vmp_business_role(uuid)` so inactive profiles and login role `viewer` resolve NULL before any admin/viewer shortcut. Rewrite unresolved reason so active legacy Viewer returns `legacy_role_disabled`. Rewrite `rpc_my_ui_access()` so failed active-session validation returns enforced/empty screens.

Delete only `business_role='viewer'` matrix rows and tighten the matrix role
constraint to the five literal roles. Assert 85 total/17 each and unchanged
exact-array-text and legacy-CSV digests for all non-Viewer rows:
`e6fdb0cc192a2ba344df02db4a5112c6` and
`59feb29d5614356f97325d71ade3599e`, respectively.

- [ ] **Step 3: Close direct profile privilege escalation**

Apply all controls:

```sql
revoke insert, update, delete on public.profiles from public, anon, authenticated;
revoke update (id, full_name, email, role, department, phone, title,
  is_active, last_login, created_at, updated_at, pham_vi)
  on public.profiles from authenticated;
drop policy if exists profiles_update on public.profiles;
```

Add a `BEFORE UPDATE OF role, department, is_active, pham_vi` trigger whose function raises SQLSTATE `42501` when `current_user` is `anon` or `authenticated`. SECURITY DEFINER administration functions owned by the migration owner remain able to update after their own canonical Admin checks.

- [ ] **Step 4: Apply active-session checks to live web boundaries**

Patch `auth_user_role()` to return NULL unless `vmp_is_active_session(auth.uid())` is true, without introducing recursion into `vmp_business_role`/`vmp_is_active_session`.

Add an early `ACCOUNT_DISABLED`/`ROLE_UNRESOLVED` return or exception to every authenticated SECURITY DEFINER function invoked by `src`:

```text
rpc_active_rules, rpc_catalog_history, rpc_catalog_history_detail,
rpc_check_data_quality, rpc_commit_catalog_import, rpc_create_plan_item,
rpc_dashboard_kpi, rpc_delete_performer, rpc_delete_plan_item,
rpc_delete_source_row, rpc_due_alerts, rpc_generate_timeline,
rpc_get_audit_logs, rpc_get_missing_items, rpc_get_vmp_dashboard,
rpc_get_vmp_watermark, rpc_list_catalog_changes, rpc_list_catalog_dataset,
rpc_list_source_tabs, rpc_recalc_criticality, rpc_refresh_computed_status,
rpc_resolve_missing, rpc_save_alert_recipient, rpc_save_catalog_object,
rpc_save_product_gmp, rpc_set_catalog_import_row_reason,
rpc_set_item_performer, rpc_set_item_state, rpc_source_warnings,
rpc_stage_catalog_import, rpc_trang_thai_he_thong, rpc_update_progress,
rpc_upsert_object, rpc_upsert_performer, rpc_upsert_source_row,
vmp_my_item_rights
```

For direct tables used by `src` (`audit_logs`, `data_quality_issues`, `vmp_alert_recipients`, `vmp_assignment_matrix`, `vmp_chat_loi_cho`, `vmp_email_cho_phep`, `vmp_performers`, `vmp_plan_items`, `vmp_source_objects`, `vmp_source_rows`, `vmp_staff_emails`), either revoke authenticated access when an RPC façade exists or require `vmp_is_active_session(auth.uid())` in every authenticated RLS policy. Keep self SELECT on `profiles` so an inactive user can display the disabled-account state, but no application data.

The migration must abort if a named live RPC/table is absent or its signature/policy set differs from the captured inventory; do not silently skip an endpoint.

- [ ] **Step 5: Harden catalog-history RPCs**

Both functions first resolve the canonical role and return `FORBIDDEN` unless it is `admin` or `qa_manager`. Apply this table predicate to list and detail:

```sql
a.table_name = any (array[
  'vmp_objects', 'vmp_products_gmp', 'vmp_email_cho_phep'
]::text[])
```

List returns only `id`, timestamp, actor snapshot, effective role, action, table name, record ID, changed fields, reason, source and `has_detail`. Detail returns old/new only after the same allowlist. Missing/out-of-scope IDs both return `NOT_FOUND`. Retain `SECURITY DEFINER`, set `search_path=public, pg_temp`, revoke PUBLIC/anon execute and grant execute only to authenticated/service_role.

- [ ] **Step 6: Add exact seven-account transactional apply script**

`scripts/apply-five-role-hardening.sql` must:

```sql
\set ON_ERROR_STOP on
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';
\ir ../supabase/migrations/20260824120000_five_role_permission_hardening.sql
```

Parse `:'account_ids'` to seven UUIDs, assert uniqueness, active state, distribution 3 Viewer/3 department_user/1 qa_manager, zero Admin, and digest `2c09501166eb45c3676451084230340e`. Update those profiles inactive and write one audit entry per UUID with reason `Loại Viewer và tài khoản test theo phê duyệt 2026-08-24`. Assert exactly seven updates, active Admin count remains at least one, matrix is 85, modes remain enforced/preview, direct profile UPDATE is false, then COMMIT.

- [ ] **Step 7: Verify GREEN on disposable clone**

Apply the migration and a synthetic seven-account manifest to the disposable clone, then run:

```bash
npm run test:db:five-role
psql "$VMP_TEST_DB_URL" -X -v ON_ERROR_STOP=1 \
  -f scripts/check-five-role-permission-state.sql
```

Expected: all rule IDs PASS; no SQL warning/error; transaction read-only in the checker.

- [ ] **Step 8: Write deployment/rollback runbook and commit**

The runbook must include exact preflight, backup hash, apply, postflight, frontend ordering and forward-recovery commands. It must state that the seven accounts are never automatically re-enabled and direct profile UPDATE/audit leakage are never restored during rollback.

Run:

```bash
git diff --check
npm run test:db:five-role
```

Commit:

```bash
git add supabase/migrations/20260824120000_five_role_permission_hardening.sql \
  scripts/apply-five-role-hardening.sql scripts/check-five-role-permission-state.sql \
  tests/sql/five-role-hardening.sql docs/runbooks/2026-08-24-five-role-permission-deploy.md
git commit -m "fix(security): harden five-role database permissions"
```

---

### Task 3: Five-Role Frontend Contract and Fail-Closed Access

**Files:**
- Modify: `src/lib/access.ts`
- Modify: `src/hooks/useAccess.ts`
- Modify: `src/hooks/index.ts`
- Modify: `src/components/auth/ScreenGuard.tsx`
- Modify: `src/features/catalogWorkspace/CatalogWorkspaceShell.tsx`
- Modify: `src/lib/supabaseClient.ts`
- Modify: `src/features/itemPermissions/permissionWorkbook.ts`
- Modify: `tests/unit/screen-access.test.mjs`
- Modify: `tests/unit/snapshot-permission-cache.test.mjs`
- Modify: `tests/unit/permission-workbook.test.mjs`
- Modify: `tests/e2e/catalog-workspace.mjs`
- Modify: `tests/e2e/quyen-admin.mjs`
- Modify: `tests/e2e/gia-lap-supabase.mjs`

**Interfaces:**
- Consumes: DB contract `rpc_my_ui_access` with five roles and `legacy_role_disabled`; catalog history allowed only when `access.canView("audit")`.
- Produces: five-role `BusinessRole`, fail-closed `AccessState`, no protected snapshot before permission verification, and role-correct Source navigation.

- [ ] **Step 1: Write RED frontend tests**

Add assertions that:

```js
assert.deepEqual(BUSINESS_ROLES, [
  "admin", "qa_manager", "qa_staff", "workshop_manager", "workshop_staff",
]);
assert.equal(parseAccessContext({ mode: "enforced", business_role: "viewer", screens: viewerScreens }).canView("overview"), false);
assert.equal(permissionDataPolicy("unknown", null).allowSnapshot, false);
```

The mock E2E must simulate `rpc_my_ui_access` failure and assert zero protected menu/content plus a retry/logout state. Catalog E2E must use `workshop_staff` as the read-only persona and assert History is absent; Admin and QA Manager retain History.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --import tsx --test \
  tests/unit/screen-access.test.mjs \
  tests/unit/snapshot-permission-cache.test.mjs \
  tests/unit/permission-workbook.test.mjs
```

Expected: failures show Viewer is still a business role and unknown/unverified mode still permits snapshot/legacy access.

- [ ] **Step 3: Remove Viewer from the effective frontend contract**

Remove `viewer` from `BUSINESS_ROLES` and `BUSINESS_ROLE_LABELS`. Keep the database login `UserRole` legacy literal only so profile decoding can show `legacy_role_disabled`; do not map missing roles to Viewer in `supabaseClient.ts`.

Delete legacy-authority construction and preview merge from `useAccess`. Initial/loading/error/missing-RPC state uses `parseAccessContext(null)`. Only an explicit valid server payload can grant access. Add the Vietnamese reason label for `legacy_role_disabled` in `ScreenGuard`.

- [ ] **Step 4: Gate rendering on verified access**

`AppShell` consumes `{ access, dangTai, loi, taiLai }`. While loading it renders an access-verification status without protected children. On error it renders retry/logout actions and no protected Layout/page. After a user/role/access-class identity change, reset to zero access synchronously before starting the next RPC.

`ScreenGuard` must never treat missing/error access as preview. Preview rendering remains available only when the parsed server response explicitly says `mode=preview`.

- [ ] **Step 5: Reorder item permission and snapshot reads**

In `useVmpData.connectSheet`, remove the block that calls `loadSnapshot(..., "preview")` before `readItemPermissionContext()`. After permission context succeeds, calculate `permissionDataPolicy` and only then call `loadSnapshot(year, userId, permissionContext.mode)`. Clear protected data and snapshot on permission error, identity change, mode change and logout.

Extend `SnapshotPermissionMode` with an internal `"unknown"` state or change the policy signature to accept `null`; `unknown/null` must return `allowSnapshot=false`, `allowLegacyFallback=false`, `bypassWatermark=true`, `revokeBeforeFetch=true`.

- [ ] **Step 6: Restrict catalog History UI**

Add `canAudit?: boolean` to the catalog navigation definition, mark only `history`, and filter it with `access.canView("audit")`. If permission changes while History is selected, switch to `objects` before issuing another history request.

Replace Viewer mock personas with Workshop Staff or unresolved legacy Viewer depending on the behavior under test. Remove Viewer from permission workbook rows and expected role labels.

- [ ] **Step 7: Verify GREEN and commit**

Run:

```bash
npm run typecheck
npm run test:unit
npm run e2e:gialap
npm run e2e:catalog
npm run e2e:admin
npm run drift
npm run build
```

Expected: zero failures, build exits 0, no Viewer label/role remains in effective frontend permission data.

Commit:

```bash
git add src tests package.json
git commit -m "fix(security): make five-role frontend fail closed"
```

---

### Task 4: Whole-Branch Security Review and Release Candidate

**Files:**
- Modify as required by accepted Critical/Important review findings only.
- Modify: `docs/runbooks/2026-08-24-five-role-permission-deploy.md`

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: reviewed release commit whose DB and frontend evidence is reproducible.

- [ ] **Step 1: Run full local verification on the exact branch head**

```bash
npm run typecheck
npm run test:unit
npm run test:db:five-role
npm run e2e:gialap
npm run e2e:catalog
npm run e2e:admin
npm run drift
npm run build
git diff --check origin/main...HEAD
```

- [ ] **Step 2: Dispatch independent reviews**

Send the exact `origin/main...HEAD` review package to:

- a `gpt-5.6-sol` DB/security reviewer for ACL, RLS, trigger, SECURITY DEFINER, active-token containment, manifest and rollback;
- a separate `gpt-5.6-terra` frontend reviewer for five-role parsing, fail-closed rendering, cache/session revocation and E2E coverage.

Fix every Critical/Important finding with a new RED/GREEN cycle and request scoped re-review.

- [ ] **Step 3: Freeze release evidence**

Record branch HEAD, migration SHA-256, test totals, local clone version and expected live precondition hashes in the runbook. Confirm `git status --short` is empty.

- [ ] **Step 4: Commit review fixes/evidence**

```bash
git add -u
git add docs/runbooks/2026-08-24-five-role-permission-deploy.md
git commit -m "docs(security): freeze five-role release evidence"
```

---

### Task 5: Production Apply and Postflight

**Files:**
- No source edits during apply. Any failure requires a new forward-fix commit and fresh review.

**Interfaces:**
- Consumes: reviewed branch HEAD, exact seven-UUID private manifest and live DB connection.
- Produces: hardened production DB, deployed GitHub Pages asset and read-only postflight evidence.

- [ ] **Step 1: Re-run live preflight read-only**

Confirm production SHA/provenance, modes, 102-row digest, function hashes, exact seven-account digest/distribution, at least one active Admin and unchanged 481 blocker count. Abort on any mismatch.

- [ ] **Step 2: Apply DB exactly once**

```bash
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 \
  -v account_ids="$VMP_ACCOUNT_IDS" \
  -f scripts/apply-five-role-hardening.sql
```

Do not retry blindly after an error. Inspect transaction state and live postconditions first.

- [ ] **Step 3: Verify DB postflight using a new read-only connection**

Run `scripts/check-five-role-permission-state.sql`, then probe current Admin, QA Manager, QA Staff, Workshop Manager, Workshop Staff and one disabled account. Output only counts/status codes, not PII or audit snapshots.

Required results: 85 matrix rows; five resolvable roles; seven inactive profiles; direct authenticated profile UPDATE false; raw audit SELECT false; non-Admin/QA Manager history `FORBIDDEN`; disabled account has zero screen/dashboard/catalog/item/writer access; modes remain enforced/preview.

- [ ] **Step 4: Integrate and deploy frontend**

Push the reviewed branch to `main` without force. Wait for GitHub Actions Quality and Deploy to complete successfully at the exact HEAD. If remote `main` moved, stop and rebase/review rather than force-push.

- [ ] **Step 5: Verify live web artifact and behavior**

Hash live HTML/JS, confirm they reference the deployed commit/run, then exercise fail-closed RPC error and five-role navigation with non-mutating probes. Confirm History is present only for Admin/QA Manager.

- [ ] **Step 6: Publish final evidence**

Report production DB timestamp, commit/run URL, matrix/account/mode postconditions, test totals, limitations and the retained 481 item-enforcement blockers. Do not claim full item enforcement.

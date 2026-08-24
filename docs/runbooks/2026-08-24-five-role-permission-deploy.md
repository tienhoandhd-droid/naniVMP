# Five-role permission hardening deployment

This runbook deploys the database boundary before the frontend. It never
selects accounts by email, name, or regex. Keep the reviewed seven UUIDs in a
private shell variable; do not paste them into logs, tickets, or this repo.

## Frozen release identity and evidence

The reviewed implementation tree is commit
`5b08d954cdc93aee45bad7c9bb15e0f05395b190`. The deployable release is exactly
one documentation-only child of that commit. A commit cannot contain its own
SHA, so obtain `RELEASE_FREEZE_SHA`, `RELEASE_RUNBOOK_BLOB_OID`, and
`RELEASE_RUNBOOK_SHA256` from the independently signed-off release evidence
record. Never infer them from the current checkout.

Reviewed database artifacts at the implementation parent:

- migration SHA-256: `82c321e40f73152bb1131a5b73067e0efc790d39d7926ac2da4b0bd191ccaf08`;
- apply entrypoint SHA-256: `4f97a2acd684b678a02b17891e8fb5559a493fad066418df988be44f819621fc`;
- account manifest SHA-256: `43911dbb547ce81ba0d75542d2d882dbe66dab42adf22518410431d1b0b86dc0`;
- checker SHA-256: `63ce4020c57ed4ed953a3da4686d7a39f7e2757b70c57e0ee78c1f811a595cd4`.

The sealed schema clone ran PostgreSQL `17.6`. Reviewed post-apply contracts are
64 browser functions / `e5631441c030967069e172ca6a68ebe1`, 207 service-role
functions / `b60d876fedc438540890578da071a693`, and production warning distribution
13 / `1c6a661e271c910e7010e872a7ef52c1`
(`EMPLOYEE_CODE_MISSING=13`).

Local verification at the implementation parent:

- typecheck: pass;
- unit: 336 total, 335 pass, 0 fail, 1 pre-existing skip;
- sealed database checker: 14/14 PASS and ROLLBACK;
- five-role SQL suite: pass and ROLLBACK;
- mock E2E: `e2e:gialap` 171 pass / 0 fail; `e2e:catalog` 75 / 0;
  `e2e:admin` 60 / 0 plus `access transition race: pass`; wrapper cleanup
  `PORT_4173_FREE_AFTER`;
- drift: 49 migration-scope files and 132 white-background-rule files checked,
  no design drift;
- Vite build: pass (`built in 7.74s`); `dist` 53 files / 3,437,504 bytes,
  tree SHA-256 `3eb1b88cd8bf6330ebbd7608cbfef49804057a2a57a668c3aeb044924a3e0fce`,
  `dist/index.html` SHA-256
  `0100469e66b33ac0aec92dc85803b770ec56a0a2a708e11465bca8043e36329c`;
- `git diff --check origin/main...HEAD`: pass; tracked status count: 0.

Before loading credentials or the private manifest, verify the release object,
topology, runbook content, and artifacts:

```bash
readonly IMPLEMENTATION_SHA='5b08d954cdc93aee45bad7c9bb15e0f05395b190'
readonly RUNBOOK_PATH='docs/runbooks/2026-08-24-five-role-permission-deploy.md'
: "${RELEASE_FREEZE_SHA:?set from the signed-off release evidence record}"
: "${RELEASE_RUNBOOK_BLOB_OID:?set from the signed-off release evidence record}"
: "${RELEASE_RUNBOOK_SHA256:?set from the signed-off release evidence record}"

test "$(git rev-parse --verify 'HEAD^{commit}')" = "$RELEASE_FREEZE_SHA"
test "$(git rev-list --parents -n 1 "$RELEASE_FREEZE_SHA" | awk '{print NF}')" -eq 2
test "$(git rev-parse --verify "$RELEASE_FREEZE_SHA^")" = "$IMPLEMENTATION_SHA"
test "$(git diff-tree --no-commit-id --name-only -r "$RELEASE_FREEZE_SHA")" = "$RUNBOOK_PATH"
git diff --quiet "$IMPLEMENTATION_SHA" "$RELEASE_FREEZE_SHA" -- . \
  ":(exclude)$RUNBOOK_PATH"
test "$(git rev-parse "$RELEASE_FREEZE_SHA:$RUNBOOK_PATH")" = \
  "$RELEASE_RUNBOOK_BLOB_OID"
test "$(git show "$RELEASE_FREEZE_SHA:$RUNBOOK_PATH" | sha256sum | awk '{print $1}')" = \
  "$RELEASE_RUNBOOK_SHA256"
test -z "$(git status --porcelain --untracked-files=no)"

sha256sum --check <<'SHA256'
82c321e40f73152bb1131a5b73067e0efc790d39d7926ac2da4b0bd191ccaf08  supabase/migrations/20260824120000_five_role_permission_hardening.sql
4f97a2acd684b678a02b17891e8fb5559a493fad066418df988be44f819621fc  scripts/apply-five-role-hardening.sql
43911dbb547ce81ba0d75542d2d882dbe66dab42adf22518410431d1b0b86dc0  scripts/apply-five-role-account-manifest.sql
63ce4020c57ed4ed953a3da4686d7a39f7e2757b70c57e0ee78c1f811a595cd4  scripts/check-five-role-permission-state.sql
SHA256
```

Abort before credentials, backup, or apply if any command differs or fails.

## Release inputs

Use the reviewed branch commit and a private environment file. Do not print
either database credentials or the account manifest.

```bash
set -a
source /absolute/path/to/private/.env.local
set +a
export VMP_ACCOUNT_IDS='seven,reviewed,comma-separated,uuid,values,go,here'
test -n "$SUPABASE_DB_URL"
test -n "$VMP_ACCOUNT_IDS"
```

The frozen release-object checks above must pass before these private inputs are
loaded.

## Read-only production preflight

Every SQL preflight is enclosed by `BEGIN READ ONLY` and `ROLLBACK`. The output
contains counts and hashes only.

```bash
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
begin read only;
select public.screen_access_mode() as screen_mode,
       public.item_permissions_mode() as item_mode;
select count(*) as matrix_rows,
  md5(string_agg(concat_ws('|', business_role, screen_id, can_view,
    data_scope, actions::text), E'\n' order by business_role, screen_id))
    as implicit_bool_array,
  md5(string_agg(concat_ws('|', business_role, screen_id, can_view::text,
    data_scope, actions::text), E'\n' order by business_role, screen_id))
    as explicit_bool_array,
  md5(string_agg(concat_ws('|', business_role, screen_id, can_view,
    data_scope, array_to_string(actions, ',')), E'\n'
    order by business_role, screen_id)) as implicit_bool_csv,
  md5(string_agg(concat_ws('|', business_role, screen_id, can_view::text,
    data_scope, array_to_string(actions, ',')), E'\n'
    order by business_role, screen_id)) as explicit_bool_csv
from public.vmp_screen_permissions;
select md5(pg_get_functiondef('public.auth_user_role()'::regprocedure));
select md5(pg_get_functiondef('public.vmp_business_role(uuid)'::regprocedure));
select md5(pg_get_functiondef('public.rpc_my_ui_access()'::regprocedure));
select md5(pg_get_functiondef(
  'public.rpc_catalog_history(jsonb,integer,integer)'::regprocedure));
select md5(pg_get_functiondef(
  'public.rpc_catalog_history_detail(uuid)'::regprocedure));
with inventory as (
  select p.oid::regprocedure::text identity,
         pg_get_function_result(p.oid) result_type,
         l.lanname language, p.prosecdef,
         coalesce(array_to_string(p.proconfig, ','), '') settings,
         md5(pg_get_functiondef(p.oid)) definition_hash,
         r.rolname owner, coalesce(array_to_string(p.proacl, ','), '') acl,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_exec,
         has_function_privilege('anon', p.oid, 'EXECUTE') anon_exec,
         has_function_privilege('public', p.oid, 'EXECUTE') public_exec
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
  join pg_roles r on r.oid = p.proowner
  where n.nspname = 'public' and (
    has_function_privilege('authenticated', p.oid, 'EXECUTE')
    or has_function_privilege('anon', p.oid, 'EXECUTE')
    or has_function_privilege('public', p.oid, 'EXECUTE'))
)
select count(*) effective_browser_functions,
       md5(string_agg(concat_ws('|', identity, result_type, language,
         prosecdef, settings, definition_hash, owner, acl, auth_exec,
         anon_exec, public_exec), E'\n' order by identity)) surface_digest
from inventory;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
with payload as (select public.rpc_item_permission_preflight() j),
blocker_codes as (
  select e ->> 'code' code, count(*) n
  from payload cross join lateral jsonb_array_elements(j -> 'blocking_errors') e
  group by 1
), blocker_summary as (
  select coalesce(sum(n), 0)::integer total,
         md5(string_agg(code || '=' || n, E'\n' order by code)) digest
  from blocker_codes
), warning_codes as (
  select coalesce(e ->> 'code', '<NULL>') code, count(*) n
  from payload cross join lateral jsonb_array_elements(j -> 'warnings') e
  group by 1
), warning_summary as (
  select coalesce(sum(n), 0)::integer total,
         coalesce(md5(string_agg(code || '=' || n, E'\n' order by code)),
                  md5('')) digest
  from warning_codes
)
select blocker_summary.total blocker_total,
       blocker_summary.digest blocker_digest,
       warning_summary.total warning_count,
       warning_summary.digest warning_digest
from blocker_summary cross join warning_summary;
select count(*) as active_admins
from public.profiles
where role::text = 'admin' and coalesce(is_active, true);
rollback;
SQL
```

Required results:

- modes: `enforced` / `preview`;
- matrix: 102 rows;
- matrix hashes, in query order:
  `0befb5a03f96dfe2dfa653f7da929cd0`,
  `f23b9883743f21e86145400e11dd1167`,
  `99813f36bc9dbc88fec26a18a1685d7c`,
  `b5fb9554b5ed69ff247c3ea54a6e3b0e`;
- core function hashes:
  `b23193f21fe23e5a88fa83569661a420`,
  `5157bf108e294b174457701a20081aaa`,
  `7e03ac3e48da9f0d3a83e18cd92409ce`,
  `d5cc4d836c5039230f7e46a936b42f57`,
  `b2675c46e69e46492799ed0ea8841d13`;
- effective browser-function baseline: 189 rows / digest
  `3dd77d7f46c8b01fdcd39f96996f87d2`;
- item-permission preflight: 481 blockers / breakdown digest
  `a987324be3986521ed2d26a183c4c318`, 13 warnings / warning digest
  `1c6a661e271c910e7010e872a7ef52c1`. The warning code distribution is
  `EMPLOYEE_CODE_MISSING=13`;
- at least one active Admin.

The original `b5fb...` evidence used both an explicit boolean cast and CSV
array normalization. The four named forms above remove that ambiguity.

Validate the private manifest without printing UUIDs:

```bash
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
\getenv account_ids VMP_ACCOUNT_IDS
begin read only;
with manifest as (
  select btrim(value)::uuid id
  from regexp_split_to_table(:'account_ids', ',') value
)
select count(*) as supplied,
       count(distinct m.id) as unique_ids,
       md5(string_agg(m.id::text, ',' order by m.id)) as uuid_digest,
       count(*) filter (where p.role::text = 'viewer') as viewers,
       count(*) filter (where p.role::text = 'department_user') as department_users,
       count(*) filter (where p.role::text = 'qa_manager') as qa_managers,
       count(*) filter (where p.role::text = 'admin') as admins,
       count(*) filter (where not coalesce(p.is_active, true)) as inactive
from manifest m left join public.profiles p on p.id = m.id;
rollback;
SQL
```

Required: 7 supplied, 7 unique, digest
`2c09501166eb45c3676451084230340e`, distribution 3 Viewer / 3
`department_user` / 1 `qa_manager` / 0 Admin, and 0 inactive. Abort on any
other result.

## Restricted backup and hash

Create a restricted investigation backup before apply. It is not a rollback
script and must not be committed because the account-state file contains UUIDs.

```bash
umask 077
VMP_BACKUP_DIR=$(mktemp -d)
pg_dump "$SUPABASE_DB_URL" --schema-only --schema=public --no-owner \
  --file "$VMP_BACKUP_DIR/public-schema.sql"
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 \
  --csv --output "$VMP_BACKUP_DIR/reviewed-state.csv" <<'SQL'
\getenv account_ids VMP_ACCOUNT_IDS
begin read only;
select 'matrix' kind, business_role key_1, screen_id key_2,
       concat_ws('|', can_view, data_scope, actions::text) state
from public.vmp_screen_permissions
union all
select 'account', p.id::text, p.role::text, coalesce(p.is_active, true)::text
from public.profiles p
where p.id = any(regexp_split_to_array(:'account_ids', ',')::uuid[])
order by 1, 2, 3;
rollback;
SQL
sha256sum "$VMP_BACKUP_DIR/public-schema.sql" \
  "$VMP_BACKUP_DIR/reviewed-state.csv" \
  > "$VMP_BACKUP_DIR/SHA256SUMS"
sha256sum --check "$VMP_BACKUP_DIR/SHA256SUMS"
```

Store that directory in the approved restricted incident/recovery location.

## Apply once

The entrypoint starts one transaction, applies the pinned migration, validates
the exact manifest, disables exactly seven profiles, writes seven audit rows,
checks postconditions, and commits. Lock timeout is 3 seconds; statement timeout
is 60 seconds.

```bash
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 <<'PSQL'
\getenv account_ids VMP_ACCOUNT_IDS
\ir scripts/apply-five-role-hardening.sql
PSQL
```

The manifest is read from the private environment into psql over standard
input. It is not placed in the `psql` process argument list and neither the
apply script nor the checker prints it. The production entrypoint hardcodes
only the approved digest `2c09501166eb45c3676451084230340e` and has no
synthetic or caller-controlled digest path.

Do not retry blindly after any error. `ON_ERROR_STOP` plus the transaction means
a pre-commit failure rolls back. Open a new connection and inspect the checker
before deciding on a forward fix.

## Read-only postflight

Use a new connection:

```bash
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 <<'PSQL'
\getenv account_ids VMP_ACCOUNT_IDS
\ir scripts/check-five-role-permission-state.sql
PSQL
```

All fourteen `PASS` rule IDs must appear, followed by `ROLLBACK`, with no warning or
error. Separately probe one current Admin, QA Manager, QA Staff, Workshop
Manager, Workshop Staff and one disabled account using approved test sessions.
Output only role/status/counts. Required behavior:

- exactly five canonical roles resolve and each gets its 17-row screen map;
- disabled account gets empty UI, dashboard, catalog and item access, and no
  writer succeeds with its existing token;
- non-Admin/non-QA-Manager catalog history gets `FORBIDDEN`;
- non-Admin/non-QA-Manager `rpc_get_audit_logs` gets `FORBIDDEN` before filter
  parsing or data access; Admin/QA Manager retain its reviewed raw global-audit
  payload contract;
- Admin and QA Manager list only allowlisted catalog audits; list contains no
  `old_data`/`new_data`; out-of-scope detail is `NOT_FOUND`;
- authenticated has no direct profile UPDATE and no raw audit SELECT;
- 85 matrix rows remain, with `enforced` / `preview` modes.

The checker recomputes the private seven-UUID digest and 3/3/1 distribution,
requires every supplied target to be inactive, and requires exactly one
matching hardening audit per target. It also verifies policies effective
through `TO PUBLIC` or inherited roles, PUBLIC/anon/authenticated profile write
revocation, the exact 64-function browser surface with outward digest
`e5631441c030967069e172ca6a68ebe1`, the unchanged 481-blocker digest. The
checker also pins the complete effective `service_role` function contract at
207 functions / digest `b60d876fedc438540890578da071a693`,
53 owner-matched wrapper/implementation pairs, owner-only hidden
ACLs (including no `service_role` execute), and zero OID-bound dependents on
hidden implementations.

Do not run mutation fixtures against production.

## RPC inventory, ownership, and schema cache

The reviewed source inventory contains 62 literal browser RPC names: 53 use
owner-preserving guarded wrappers, seven are guarded in place, and two legacy
link/name endpoints are intentionally owner-only service boundaries. The live
signature digest includes function identity, return type, language,
`SECURITY DEFINER`, settings, definition hash, owner, and ACL and must equal
`10558e3cb339c9ee32e697d0643fd16f`. The migration aborts if any signature,
overload, owner, ACL, definition, or count drifts.

The complete pre-DDL effective browser surface is separately pinned at 189
functions / `3dd77d7f46c8b01fdcd39f96996f87d2`. Final DDL revokes
PUBLIC/anon/authenticated from every public function and grants authenticated
only the 60 non-service source boundaries plus `is_admin()`,
`is_admin_or_qa()`, `vmp_current_session_is_active()`, and
`vmp_can_view_my_item(text)`. Omitted automation RPCs are service-role-only.

`item_permissions_mode()` is guarded in place because two RLS policies are
OID-bound to it. Before any other function is renamed, the migration proves it
has no reverse `pg_depend` entry. Postconditions and the checker prove all 53
hidden implementations remain unreferenced, owner-matched, and owner-only.

After COMMIT, request a PostgREST schema-cache reload using a new restricted
operator connection, then wait for the DDL watcher/reload acknowledgement:

```sql
notify pgrst, 'reload schema';
```

From a new connection, repeat the read-only checker and inspect the PostgREST
OpenAPI document with an approved service-role-compatible test credential.
Confirm every intended public RPC path/signature is present, the two
intentionally owner-only endpoints are absent, and no
`__five_role_impl_20260824` path is exposed. Probe only read-only RPCs for the
five active personas and disabled persona; do not execute mutating RPCs merely
to test the cache. Catalog ACL/owner/dependency checks in the checker are the
required evidence for mutating and hidden functions.

## Disposable local verification only

The synthetic matrix/account fixture is permitted only on the schema-only
loopback clone. It deliberately creates non-PII `auth.users` rows because a
schema-only dump does not include Auth data; this validates foreign keys and
session resolution but does not reproduce production Auth triggers, identities,
refresh tokens, or GoTrue lifecycle behavior. It is not evidence that those
Auth workflows were tested.

Use only the sealed local entrypoint, which validates the exact loopback
`127.0.0.1`/`54322`/`postgres` URL (with no query or fragment), passes only
validated `PG*` fields to psql, and selects the synthetic digest outside the
production script:

```bash
export VMP_LOCAL_ACCOUNT_IDS='71000000-0000-4000-8000-000000000001,71000000-0000-4000-8000-000000000002,71000000-0000-4000-8000-000000000003,71000000-0000-4000-8000-000000000004,71000000-0000-4000-8000-000000000005,71000000-0000-4000-8000-000000000006,71000000-0000-4000-8000-000000000007'
bash scripts/apply-five-role-hardening-local-test.sh apply
bash scripts/apply-five-role-hardening-local-test.sh check
```

Never invoke either local-test SQL file against production and never add the
synthetic digest or fixture marker path to the production entrypoint.

## Frontend ordering

1. Complete the database apply and new-connection postflight.
2. Merge/deploy the reviewed frontend commit that accepts only five roles and
   fails closed before access verification.
3. Wait for CI and Pages deployment at the exact reviewed commit.
4. Repeat the five-persona and one-disabled-account probes against the deployed
   bundle.

If an approved server-side Supabase Auth Admin credential exists, account bans
and refresh-session revocation may be added after the database commit as
defense-in-depth. Never update Supabase Auth internal tables directly and never
print the credential.

## Forward recovery

- Failure before COMMIT: keep production unchanged, preserve the error, compare
  precondition evidence, and prepare a reviewed forward fix.
- Failure after COMMIT: keep the database hardening in place. Correct the
  resolver, wrapper, policy, or account state with a new reviewed forward
  migration.
- Frontend failure: roll back only the frontend artifact/commit; retain database
  hardening.
- Wrongly disabled legitimate account: require separate approval for that exact
  UUID and repair it forward with an audit reason.

The seven accounts are never automatically re-enabled. Forward recovery never
restores Viewer access, direct profile UPDATE, raw audit disclosure, or catalog
snapshot leakage.

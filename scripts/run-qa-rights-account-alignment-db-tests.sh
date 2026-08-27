#!/usr/bin/env bash

set -euo pipefail

mode="${1:-}"
if [[ -n "$mode" && "$mode" != "--expect-red" ]]; then
  echo "Usage: $0 [--expect-red]" >&2
  exit 2
fi
if [[ -z "${SUPABASE_DB_URL:-}" || -z "${VMP_TEST_DB_URL:-}" ]]; then
  echo "SUPABASE_DB_URL and VMP_TEST_DB_URL are required." >&2
  exit 2
fi

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
tmp_dir="$(mktemp -d)"
test_database="vmp_qa_alignment_${$}_${RANDOM}"
test_databases=()

cleanup() {
  if [[ -n "${LOCAL_PGHOST:-}" ]]; then
    for cleanup_database in "${test_databases[@]}"; do
      if [[ "$cleanup_database" =~ ^vmp_qa_alignment_[0-9]+_[0-9]+(_(definition|metadata|acl|wrapper_owner|writer_acl|schema|collation|manifest_missing|manifest_duplicate|manifest_wrong|manifest_after_khoa|manifest_refresh|manifest_success))?$ ]]; then
        PGHOST="$LOCAL_PGHOST" PGPORT="$LOCAL_PGPORT" PGUSER="$LOCAL_PGUSER" \
          PGPASSWORD="$LOCAL_PGPASSWORD" dropdb --if-exists --force \
          "$cleanup_database" >/dev/null 2>&1 || true
      fi
    done
  fi
  find "$tmp_dir" -mindepth 1 -delete
  rmdir "$tmp_dir"
  unset LOCAL_PGHOST LOCAL_PGPORT LOCAL_PGUSER LOCAL_PGPASSWORD LOCAL_PGDATABASE
}
trap cleanup EXIT

node "$repo_dir/scripts/parse-five-role-local-db.mjs" >"$tmp_dir/local-connection"
while IFS= read -r -d '' local_key && IFS= read -r -d '' local_value; do
  export "$local_key=$local_value"
done <"$tmp_dir/local-connection"
export PGHOST="$LOCAL_PGHOST" PGPORT="$LOCAL_PGPORT" PGUSER="$LOCAL_PGUSER"
export PGPASSWORD="$LOCAL_PGPASSWORD"

source_ok="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$LOCAL_PGDATABASE" <<'SQL'
select current_database() = 'postgres'
   and current_user = 'postgres'
   and current_setting('server_version_num')::integer between 170000 and 179999
   and exists (
     select 1 from public.system_config
     where key = 'five_role_test_fixture' and value = 'true'::jsonb
   )
   and (select count(*)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and has_function_privilege('authenticated', p.oid, 'EXECUTE')) = 64;
SQL
)"
if [[ "$source_ok" != "t" ]]; then
  echo "Refusing unreviewed source before any database mutation." >&2
  exit 3
fi

docker run --rm --network host \
  -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE="$LOCAL_PGDATABASE" \
  -v "$tmp_dir:/out" postgres:17 \
  pg_dump -Fc --no-owner -n public -n auth -f /out/base.dump
docker run --rm -v "$tmp_dir:/out" postgres:17 \
  pg_restore -l /out/base.dump | sed '/ DEFAULT ACL /d' >"$tmp_dir/restore.list"

createdb -T template0 "$test_database"
test_databases+=("$test_database")
psql -X -v ON_ERROR_STOP=1 -d "$test_database" <<'SQL'
drop schema public cascade;
create schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
SQL
docker run --rm --network host \
  -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE="$test_database" \
  -v "$tmp_dir:/out" postgres:17 \
  pg_restore --no-owner -L /out/restore.list -d "$test_database" /out/base.dump

clone_ok="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" <<'SQL'
select current_database() ~ '^vmp_qa_alignment_[0-9]+_[0-9]+$'
   and current_user = 'postgres'
   and current_setting('server_version_num')::integer between 170000 and 179999
   and exists (
     select 1 from public.system_config
     where key = 'five_role_test_fixture' and value = 'true'::jsonb
   )
   and (select count(*)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and has_function_privilege('authenticated', p.oid, 'EXECUTE')) = 64;
SQL
)"
if [[ "$clone_ok" != "t" ]]; then
  echo "Refusing non-reviewed disposable PostgreSQL 17 clone." >&2
  exit 3
fi

psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/supabase/migrations/20260826130000_catalog_progressed_deadline_override.sql"
psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/supabase/migrations/20260826170000_manual_planned_deadline_edit.sql"
psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/supabase/migrations/20260826180000_qa_manager_actual_date_principal_normalization.sql"

set +e
psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/tests/sql/qa-rights-account-alignment.sql" \
  >"$tmp_dir/red.log" 2>&1
red_status=$?
set -e
if [[ $red_status -eq 0 ]]; then
  echo "Expected QA staff actual-validation-date RED, but the focused suite passed." >&2
  exit 1
fi
if ! grep -q 'QA_STAFF_ACTUAL_VALIDATION_DATE_MUST_BE_DENIED' "$tmp_dir/red.log"; then
  sed -n '1,260p' "$tmp_dir/red.log" >&2
  echo "QA rights RED failed before the intended authorization assertion." >&2
  exit 1
fi
echo "PASS RED QA staff actual validation date remains over-granted"

if [[ "$mode" == "--expect-red" ]]; then
  exit 0
fi

rights_oid_before="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" -c \
  "select oid from pg_proc where oid='public.vmp_item_rights(uuid,text)'::regprocedure")"
rights_definition_before="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" -c \
  "select encode(extensions.digest(pg_get_functiondef('public.vmp_item_rights(uuid,text)'::regprocedure),'sha256'),'hex')")"
rights_metadata_before="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" <<'SQL'
select concat_ws('|',owner.rolname,language.lanname,p.prosecdef,p.provolatile,
       p.proparallel,p.proisstrict,p.proleakproof,
       coalesce(array_to_string(p.proconfig,','),''),
       coalesce(array_to_string(p.proacl,','),''),pg_get_function_result(p.oid))
from pg_proc p
join pg_roles owner on owner.oid=p.proowner
join pg_language language on language.oid=p.prolang
where p.oid='public.vmp_item_rights(uuid,text)'::regprocedure;
SQL
)"
writer_definition_before="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" -c \
  "select encode(extensions.digest(pg_get_functiondef('public.rpc_update_progress(text,jsonb,text,jsonb,integer)'::regprocedure),'sha256'),'hex')")"
browser_contract_before="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" <<'SQL'
with inventory as (
  select p.oid::regprocedure::text identity,
         pg_get_function_result(p.oid) result_type,
         language.lanname language_name,p.prosecdef,
         coalesce(array_to_string(p.proconfig,','),'') settings,
         encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex') definition_hash,
         owner.rolname owner_name,coalesce(array_to_string(p.proacl,','),'') acl,
         has_function_privilege('authenticated',p.oid,'EXECUTE') auth_exec,
         has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,
         has_function_privilege('public',p.oid,'EXECUTE') public_exec
  from pg_proc p
  join pg_namespace namespace on namespace.oid=p.pronamespace
  join pg_language language on language.oid=p.prolang
  join pg_roles owner on owner.oid=p.proowner
  where namespace.nspname='public'
    and (has_function_privilege('authenticated',p.oid,'EXECUTE')
      or has_function_privilege('anon',p.oid,'EXECUTE')
      or has_function_privilege('public',p.oid,'EXECUTE'))
)
select count(*)||'|'||encode(extensions.digest(string_agg(concat_ws('|',identity,
  result_type,language_name,prosecdef,settings,definition_hash,owner_name,acl,
  auth_exec,anon_exec,public_exec),E'\n' order by identity),'sha256'),'hex')
from inventory;
SQL
)"
if [[ "$browser_contract_before" != \
      "67|fbb5815077262640c78e2541ed4fe870e37e45b7c8b0806ba10b589696d1e3dc" ]]; then
  echo "Refusing clone with unreviewed browser function inventory: $browser_contract_before" >&2
  exit 3
fi
rls_contract_before="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" <<'SQL'
select count(*)||'|'||encode(extensions.digest(string_agg(format(
  '%s|%s|%s|%s|%s',namespace.nspname,relation.relname,policy.polname,
  policy.polcmd,coalesce(pg_get_expr(policy.polqual,policy.polrelid),'')||'|'||
  coalesce(pg_get_expr(policy.polwithcheck,policy.polrelid),'')),E'\n'
  order by namespace.nspname,relation.relname,policy.polname),'sha256'),'hex')
from pg_policy policy
join pg_class relation on relation.oid=policy.polrelid
join pg_namespace namespace on namespace.oid=relation.relnamespace
where namespace.nspname='public'
  and relation.relname in ('vmp_plan_items','vmp_item_assignments');
SQL
)"

check_precondition_drift() {
  local suffix="$1"
  local drift_database="${test_database}_${suffix}"
  local before_hash after_hash migration_status

  createdb -T "$test_database" "$drift_database"
  test_databases+=("$drift_database")

  case "$suffix" in
    definition)
      psql -X -v ON_ERROR_STOP=1 -d "$drift_database" >/dev/null <<'SQL'
create or replace function public.vmp_item_rights(p_uid uuid,p_validation_code text)
returns table(can_view boolean,editable_fields text[],view_reason text,
  assignment_sources text[],scope_match boolean,area_match boolean)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  return query select false,'{}'::text[],'drift','{}'::text[],false,false;
end
$$;
SQL
      ;;
    metadata)
      psql -X -v ON_ERROR_STOP=1 -d "$drift_database" -c \
        "alter function public.vmp_item_rights(uuid,text) set search_path=pg_temp,public" \
        >/dev/null
      ;;
    acl)
      psql -X -v ON_ERROR_STOP=1 -d "$drift_database" -c \
        "grant execute on function public.vmp_item_rights(uuid,text) to authenticated" \
        >/dev/null
      ;;
    writer_acl)
      psql -X -v ON_ERROR_STOP=1 -d "$drift_database" -c \
        "grant execute on function public.rpc_update_progress(text,jsonb,text,jsonb,integer) to authenticated with grant option" \
        >/dev/null
      ;;
    wrapper_owner)
      psql -X -v ON_ERROR_STOP=1 -d "$drift_database" >/dev/null <<'SQL'
begin;
grant service_role to postgres;
grant create on schema public to service_role;
alter function public.vmp_my_item_rights(text) owner to service_role;
revoke service_role from postgres;
commit;
SQL
      ;;
    schema)
      psql -X -v ON_ERROR_STOP=1 -d "$drift_database" -c \
        "alter table public.vmp_item_assignments add column review_drift text" \
        >/dev/null
      ;;
    collation)
      psql -X -v ON_ERROR_STOP=1 -d "$drift_database" >/dev/null <<'SQL'
create schema review_drift;
create collation review_drift."default" (
  provider = icu,
  locale = 'und-u-ks-level1',
  deterministic = false
);
alter table public.vmp_item_assignments
  alter column assignment_role type text collate review_drift."default";
SQL
      ;;
    *)
      echo "Unknown drift fixture: $suffix" >&2
      exit 2
      ;;
  esac

  before_hash="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$drift_database" -c \
    "select encode(extensions.digest(pg_get_functiondef('public.vmp_item_rights(uuid,text)'::regprocedure),'sha256'),'hex')")"
  set +e
  psql -X -v ON_ERROR_STOP=1 -d "$drift_database" \
    -f "$repo_dir/supabase/migrations/20260827100000_qa_rights_account_alignment.sql" \
    >"$tmp_dir/precondition-${suffix}.log" 2>&1
  migration_status=$?
  set -e
  after_hash="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$drift_database" -c \
    "select encode(extensions.digest(pg_get_functiondef('public.vmp_item_rights(uuid,text)'::regprocedure),'sha256'),'hex')")"

  if [[ $migration_status -eq 0 ]] \
     || ! grep -q 'QA_RIGHTS_ALIGNMENT_PRECONDITION_' \
          "$tmp_dir/precondition-${suffix}.log" \
     || [[ "$after_hash" != "$before_hash" ]]; then
    sed -n '1,260p' "$tmp_dir/precondition-${suffix}.log" >&2
    echo "QA rights migration did not reject $suffix drift before replacement." >&2
    exit 1
  fi
  echo "PASS PRECONDITION rejected QA rights ${suffix} drift before replacement"
  dropdb --force "$drift_database"
}

check_precondition_drift definition
check_precondition_drift metadata
check_precondition_drift acl
check_precondition_drift wrapper_owner
check_precondition_drift writer_acl
check_precondition_drift schema
check_precondition_drift collation

psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/supabase/migrations/20260827100000_qa_rights_account_alignment.sql"

rights_oid_after="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" -c \
  "select oid from pg_proc where oid='public.vmp_item_rights(uuid,text)'::regprocedure")"
rights_definition_after="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" -c \
  "select encode(extensions.digest(pg_get_functiondef('public.vmp_item_rights(uuid,text)'::regprocedure),'sha256'),'hex')")"
rights_metadata_after="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" <<'SQL'
select concat_ws('|',owner.rolname,language.lanname,p.prosecdef,p.provolatile,
       p.proparallel,p.proisstrict,p.proleakproof,
       coalesce(array_to_string(p.proconfig,','),''),
       coalesce(array_to_string(p.proacl,','),''),pg_get_function_result(p.oid))
from pg_proc p
join pg_roles owner on owner.oid=p.proowner
join pg_language language on language.oid=p.prolang
where p.oid='public.vmp_item_rights(uuid,text)'::regprocedure;
SQL
)"
writer_definition_after="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" -c \
  "select encode(extensions.digest(pg_get_functiondef('public.rpc_update_progress(text,jsonb,text,jsonb,integer)'::regprocedure),'sha256'),'hex')")"
browser_contract_after="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" <<'SQL'
with inventory as (
  select p.oid::regprocedure::text identity,
         pg_get_function_result(p.oid) result_type,
         language.lanname language_name,p.prosecdef,
         coalesce(array_to_string(p.proconfig,','),'') settings,
         encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex') definition_hash,
         owner.rolname owner_name,coalesce(array_to_string(p.proacl,','),'') acl,
         has_function_privilege('authenticated',p.oid,'EXECUTE') auth_exec,
         has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,
         has_function_privilege('public',p.oid,'EXECUTE') public_exec
  from pg_proc p
  join pg_namespace namespace on namespace.oid=p.pronamespace
  join pg_language language on language.oid=p.prolang
  join pg_roles owner on owner.oid=p.proowner
  where namespace.nspname='public'
    and (has_function_privilege('authenticated',p.oid,'EXECUTE')
      or has_function_privilege('anon',p.oid,'EXECUTE')
      or has_function_privilege('public',p.oid,'EXECUTE'))
)
select count(*)||'|'||encode(extensions.digest(string_agg(concat_ws('|',identity,
  result_type,language_name,prosecdef,settings,definition_hash,owner_name,acl,
  auth_exec,anon_exec,public_exec),E'\n' order by identity),'sha256'),'hex')
from inventory;
SQL
)"
rls_contract_after="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" <<'SQL'
select count(*)||'|'||encode(extensions.digest(string_agg(format(
  '%s|%s|%s|%s|%s',namespace.nspname,relation.relname,policy.polname,
  policy.polcmd,coalesce(pg_get_expr(policy.polqual,policy.polrelid),'')||'|'||
  coalesce(pg_get_expr(policy.polwithcheck,policy.polrelid),'')),E'\n'
  order by namespace.nspname,relation.relname,policy.polname),'sha256'),'hex')
from pg_policy policy
join pg_class relation on relation.oid=policy.polrelid
join pg_namespace namespace on namespace.oid=relation.relnamespace
where namespace.nspname='public'
  and relation.relname in ('vmp_plan_items','vmp_item_assignments');
SQL
)"

if [[ "$rights_oid_after" != "$rights_oid_before" ]] \
   || [[ "$rights_definition_after" == "$rights_definition_before" ]] \
   || [[ "$rights_definition_after" != \
         "9cfba864d7ea650370d6d76c33e2afcfbf941bb6918a90eeedec77f0513ab0db" ]] \
   || [[ "$rights_metadata_after" != "$rights_metadata_before" ]] \
   || [[ "$writer_definition_after" != "$writer_definition_before" ]] \
   || [[ "$browser_contract_after" != "$browser_contract_before" ]] \
   || [[ "$rls_contract_after" != "$rls_contract_before" ]]; then
  echo "QA rights migration changed OID, metadata, writer, browser inventory, or RLS." >&2
  echo "rights_oid=$rights_oid_before/$rights_oid_after" >&2
  echo "rights_definition=$rights_definition_before/$rights_definition_after" >&2
  echo "rights_metadata=$rights_metadata_before/$rights_metadata_after" >&2
  echo "writer_definition=$writer_definition_before/$writer_definition_after" >&2
  echo "browser_contract=$browser_contract_before/$browser_contract_after" >&2
  echo "rls_contract=$rls_contract_before/$rls_contract_after" >&2
  exit 1
fi
echo "PASS METADATA preserved rights OID owner security volatility search_path ACL writer browser RLS"
echo "PASS METADATA rights_definition_sha256=$rights_definition_after"

psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/tests/sql/qa-rights-account-alignment.sql"
psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/tests/sql/qa-rights-account-alignment-security.sql"

# Task 2 RED gate. The fixture transaction validates the reviewed resolver,
# linked personas, assignment rows and preview mode before it checks for the
# new zero-argument browser RPC. This prevents a broken fixture from being
# mistaken for the intended missing-feature failure.
set +e
psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/tests/sql/assigned-progress-visibility.sql" \
  >"$tmp_dir/assigned-progress-red.log" 2>&1
assigned_progress_red_status=$?
set -e
if [[ $assigned_progress_red_status -eq 0 ]]; then
  echo "Expected assigned-progress visibility RED, but the focused suite passed." >&2
  exit 1
fi
if ! grep -q 'ASSIGNED_PROGRESS_BATCH_RPC_MISSING' \
    "$tmp_dir/assigned-progress-red.log"; then
  sed -n '1,320p' "$tmp_dir/assigned-progress-red.log" >&2
  echo "Assigned-progress RED failed before the missing batch RPC assertion." >&2
  exit 1
fi
sed -n '1,320p' "$tmp_dir/assigned-progress-red.log" >&2
echo "EXPECTED RED assigned progress batch RPC is not installed" >&2
exit 1

mode_contract="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" <<'SQL'
select (select value from public.system_config where key='screen_access_mode')='"enforced"'::jsonb
   and (select value from public.system_config where key='item_permissions_mode')='"preview"'::jsonb;
SQL
)"
if [[ "$mode_contract" != "t" ]]; then
  echo "Focused QA rights suite changed production enforcement modes." >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/tests/sql/qa-rights-account-manifest.sql"

khoa_id="99000000-0000-4000-8000-000000000001"
dat_id="99000000-0000-4000-8000-000000000002"
viewer_one_id="99000000-0000-4000-8000-000000000003"
viewer_two_id="99000000-0000-4000-8000-000000000004"

manifest_state_hash() {
  local database="$1"
  psql -X -qAt -v ON_ERROR_STOP=1 -d "$database" <<'SQL'
select encode(extensions.digest(concat_ws('|',
  coalesce((select jsonb_agg(to_jsonb(profile) order by profile.id)::text
    from public.profiles profile
    where profile.id between '99000000-0000-4000-8000-000000000001'::uuid
                         and '99000000-0000-4000-8000-000000000005'::uuid), '[]'),
  coalesce((select jsonb_agg(to_jsonb(performer) order by performer.id)::text
    from public.vmp_performers performer
    where performer.user_id between '99000000-0000-4000-8000-000000000001'::uuid
                               and '99000000-0000-4000-8000-000000000005'::uuid), '[]'),
  coalesce((select jsonb_agg(to_jsonb(assignment) order by assignment.id)::text
    from public.vmp_item_assignments assignment), '[]'),
  coalesce((select jsonb_agg(to_jsonb(audit) order by audit.id)::text
    from public.audit_logs audit
    where audit.source in ('qa_rights_account_alignment','sheet_assignment_refresh')), '[]')
), 'sha256'), 'hex');
SQL
}

create_manifest_clone() {
  local suffix="$1"
  local database="${test_database}_${suffix}"
  createdb -T "$test_database" "$database"
  test_databases+=("$database")
  printf '%s' "$database"
}

expect_manifest_failure() {
  local database="$1"
  local marker="$2"
  shift 2
  local before_hash after_hash status
  before_hash="$(manifest_state_hash "$database")"
  set +e
  "$@" >"$tmp_dir/${database}.log" 2>&1
  status=$?
  set -e
  after_hash="$(manifest_state_hash "$database")"
  if [[ $status -eq 0 ]] || ! grep -q "$marker" "$tmp_dir/${database}.log" \
     || [[ "$after_hash" != "$before_hash" ]]; then
    sed -n '1,260p' "$tmp_dir/${database}.log" >&2
    echo "Manifest case $database did not fail closed with $marker." >&2
    exit 1
  fi
  echo "PASS MANIFEST rejected $marker without account assignment or audit drift"
}

manifest_missing_db="$(create_manifest_clone manifest_missing)"
expect_manifest_failure "$manifest_missing_db" \
  VIEWER_IDS_PSQL_VARIABLE_REQUIRED \
  psql -X -v ON_ERROR_STOP=1 -d "$manifest_missing_db" \
    -v khoa_id="$khoa_id" -v dat_id="$dat_id" \
    -f "$repo_dir/scripts/apply-qa-rights-account-manifest.sql"

manifest_duplicate_db="$(create_manifest_clone manifest_duplicate)"
expect_manifest_failure "$manifest_duplicate_db" \
  ACCOUNT_MANIFEST_REQUIRES_FOUR_UNIQUE_UUIDS \
  psql -X -v ON_ERROR_STOP=1 -d "$manifest_duplicate_db" \
    -v khoa_id="$khoa_id" -v dat_id="$dat_id" \
    -v viewer_ids="$viewer_one_id,$viewer_one_id" \
    -f "$repo_dir/scripts/apply-qa-rights-account-manifest.sql"

manifest_wrong_db="$(create_manifest_clone manifest_wrong)"
psql -X -v ON_ERROR_STOP=1 -d "$manifest_wrong_db" -c \
  "update public.vmp_performers set access_class=null where user_id='$khoa_id'::uuid" \
  >/dev/null
expect_manifest_failure "$manifest_wrong_db" \
  ACCOUNT_MANIFEST_PARTIAL_STATE_REFUSED \
  psql -X -v ON_ERROR_STOP=1 -d "$manifest_wrong_db" \
    -v khoa_id="$khoa_id" -v dat_id="$dat_id" \
    -v viewer_ids="$viewer_one_id,$viewer_two_id" \
    -f "$repo_dir/scripts/apply-qa-rights-account-manifest.sql"

manifest_after_khoa_db="$(create_manifest_clone manifest_after_khoa)"
expect_manifest_failure "$manifest_after_khoa_db" \
  QA_ALIGNMENT_INJECTED_AFTER_KHOA \
  env PGOPTIONS='-c vmp.qa_alignment_fault=after_khoa' \
  psql -X -v ON_ERROR_STOP=1 -d "$manifest_after_khoa_db" \
    -v khoa_id="$khoa_id" -v dat_id="$dat_id" \
    -v viewer_ids="$viewer_one_id,$viewer_two_id" \
    -f "$repo_dir/scripts/apply-qa-rights-account-manifest.sql"

manifest_refresh_db="$(create_manifest_clone manifest_refresh)"
psql -X -v ON_ERROR_STOP=1 -d "$manifest_refresh_db" >/dev/null <<'SQL'
create or replace function public.rpc_refresh_source_item_assignments()
returns jsonb language sql security definer set search_path=public,pg_temp
as $$ select jsonb_build_object('ok',false,'error_code','INJECTED_REFRESH_FAILURE') $$;
SQL
expect_manifest_failure "$manifest_refresh_db" \
  ACCOUNT_MANIFEST_ASSIGNMENT_REFRESH_FAILED \
  psql -X -v ON_ERROR_STOP=1 -d "$manifest_refresh_db" \
    -v khoa_id="$khoa_id" -v dat_id="$dat_id" \
    -v viewer_ids="$viewer_one_id,$viewer_two_id" \
    -f "$repo_dir/scripts/apply-qa-rights-account-manifest.sql"

manifest_success_db="$(create_manifest_clone manifest_success)"
if ! psql -X -v ON_ERROR_STOP=1 -d "$manifest_success_db" \
  -v khoa_id="$khoa_id" -v dat_id="$dat_id" \
  -v viewer_ids="$viewer_one_id,$viewer_two_id" \
  -f "$repo_dir/scripts/apply-qa-rights-account-alignment.sql" \
  >"$tmp_dir/manifest-success.log" 2>&1; then
  sed -n '1,260p' "$tmp_dir/manifest-success.log" >&2
  echo "Exact-four manifest success apply failed." >&2
  exit 1
fi
if ! psql -X -v ON_ERROR_STOP=1 -d "$manifest_success_db" \
  -v khoa_id="$khoa_id" -v dat_id="$dat_id" \
  -v viewer_ids="$viewer_one_id,$viewer_two_id" \
  -f "$repo_dir/scripts/check-qa-rights-account-alignment.sql" \
  >"$tmp_dir/manifest-check.log" 2>&1; then
  sed -n '1,260p' "$tmp_dir/manifest-check.log" >&2
  echo "Exact-four manifest checker failed." >&2
  exit 1
fi
success_hash="$(manifest_state_hash "$manifest_success_db")"
if ! psql -X -v ON_ERROR_STOP=1 -d "$manifest_success_db" \
  -v khoa_id="$khoa_id" -v dat_id="$dat_id" \
  -v viewer_ids="$viewer_one_id,$viewer_two_id" \
  -f "$repo_dir/scripts/apply-qa-rights-account-alignment.sql" \
  >"$tmp_dir/manifest-rerun.log" 2>&1; then
  sed -n '1,260p' "$tmp_dir/manifest-rerun.log" >&2
  echo "Exact-four manifest idempotent rerun failed." >&2
  exit 1
fi
rerun_hash="$(manifest_state_hash "$manifest_success_db")"
if [[ "$success_hash" != "$rerun_hash" ]] \
   || ! grep -q 'PASS CHECK_QA_MANAGER_EIGHT_FIELDS' "$tmp_dir/manifest-check.log" \
   || ! grep -q 'PASS CHECK_QA_STAFF_SEVEN_FIELDS' "$tmp_dir/manifest-check.log" \
   || ! grep -q 'PASS CHECK_WORKSHOP_STAFF_ONE_FIELD' "$tmp_dir/manifest-check.log"; then
  sed -n '1,260p' "$tmp_dir/manifest-success.log" >&2
  sed -n '1,260p' "$tmp_dir/manifest-check.log" >&2
  sed -n '1,260p' "$tmp_dir/manifest-rerun.log" >&2
  echo "Exact-four manifest success/checker/rerun contract failed." >&2
  exit 1
fi
echo "PASS MANIFEST exact-four atomic refresh checker and idempotent rerun"

echo "PASS GREEN QA manager eight QA staff seven workshop one atomic security modes ROLLBACK"

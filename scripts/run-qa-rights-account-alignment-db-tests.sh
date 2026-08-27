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
  local original_status=$?
  local cleanup_status=0
  local cleanup_database cleanup_drop_log survivors survivor_query_status
  local cleanup_index
  trap - EXIT
  set +e

  if [[ -n "${LOCAL_PGHOST:-}" ]]; then
    for ((cleanup_index=${#test_databases[@]}-1; cleanup_index>=0; cleanup_index--)); do
      cleanup_database="${test_databases[$cleanup_index]}"
      if [[ "$cleanup_database" =~ ^vmp_qa_alignment_[0-9]+_[0-9]+(_(definition|metadata|acl|wrapper_owner|writer_acl|schema|collation|assigned_hash|assigned_schema|assigned_constraint|assigned_unique|assigned_trigger|assigned_failure|assigned_concurrency|manifest_template|manifest_missing|manifest_duplicate|manifest_wrong|manifest_after_khoa|manifest_refresh|manifest_success))?$ ]]; then
        cleanup_drop_log="$tmp_dir/cleanup-drop-${cleanup_index}.log"
        if ! PGHOST="$LOCAL_PGHOST" PGPORT="$LOCAL_PGPORT" \
          PGUSER="$LOCAL_PGUSER" PGPASSWORD="$LOCAL_PGPASSWORD" \
          dropdb --if-exists --force "$cleanup_database" \
            > /dev/null 2>"$cleanup_drop_log"; then
          sed -n '1,120p' "$cleanup_drop_log" >&2
          echo "CLEANUP DROP FAILED database=$cleanup_database" >&2
          cleanup_status=1
        fi
      else
        echo "CLEANUP REFUSED unvalidated database=$cleanup_database" >&2
        cleanup_status=1
      fi
    done

    survivors="$(PGHOST="$LOCAL_PGHOST" PGPORT="$LOCAL_PGPORT" \
      PGUSER="$LOCAL_PGUSER" PGPASSWORD="$LOCAL_PGPASSWORD" \
      psql -X -qAt -v ON_ERROR_STOP=1 -d "$LOCAL_PGDATABASE" \
        -v run_prefix="$test_database" <<'SQL'
select datname from pg_database
where datname=:'run_prefix'
   or left(datname,length(:'run_prefix')+1)=:'run_prefix'||'_'
order by datname;
SQL
    )"
    survivor_query_status=$?
    if [[ $survivor_query_status -ne 0 ]]; then
      echo "CLEANUP SURVIVOR QUERY FAILED prefix=$test_database" >&2
      cleanup_status=1
    elif [[ -n "$survivors" ]]; then
      echo "CLEANUP SURVIVORS prefix=$test_database" >&2
      printf '%s\n' "$survivors" >&2
      cleanup_status=1
    fi
  elif [[ ${#test_databases[@]} -gt 0 ]]; then
    echo "CLEANUP CONNECTION MISSING with tracked disposable databases" >&2
    cleanup_status=1
  fi

  if [[ -d "$tmp_dir" ]]; then
    if ! find "$tmp_dir" -mindepth 1 -delete; then
      echo "CLEANUP TEMP CONTENT FAILED directory=$tmp_dir" >&2
      cleanup_status=1
    fi
    if ! rmdir "$tmp_dir"; then
      echo "CLEANUP TEMP DIRECTORY FAILED directory=$tmp_dir" >&2
      cleanup_status=1
    fi
  fi
  unset LOCAL_PGHOST LOCAL_PGPORT LOCAL_PGUSER LOCAL_PGPASSWORD LOCAL_PGDATABASE

  if [[ $cleanup_status -ne 0 ]]; then
    if [[ $original_status -ne 0 ]]; then
      exit "$original_status"
    fi
    exit 1
  fi
  echo "PASS CLEANUP no disposable database leaked by runner"
  exit "$original_status"
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

# Preserve the reviewed pre-assigned-progress state for the account-manifest
# regression cases below. Those older deployment scripts intentionally pin the
# old progress wrapper and must be tested before this forward wrapper swap.
manifest_template_database="${test_database}_manifest_template"
createdb -T "$test_database" "$manifest_template_database"
test_databases+=("$manifest_template_database")

assigned_progress_state_hash() {
  local database="$1"
  psql -X -qAt -v ON_ERROR_STOP=1 -d "$database" <<'SQL'
select encode(extensions.digest(concat_ws('|',
  coalesce(pg_get_functiondef(to_regprocedure(
    'public.vmp_allowed_timeline_fields(uuid,text)')),'missing'),
  coalesce(pg_get_functiondef(to_regprocedure(
    'public.rpc_update_progress(text,jsonb,text,jsonb,integer)')),'missing'),
  coalesce(pg_get_functiondef(to_regprocedure(
    'public.rpc_update_progress__five_role_impl_20260824(text,jsonb,text,jsonb,integer)')),'missing'),
  coalesce(pg_get_functiondef(to_regprocedure(
    'public.rpc_my_editable_progress_rights()')),'missing'),
  coalesce(pg_get_functiondef(to_regprocedure(
    'public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)')),'missing'),
  coalesce((select proacl::text from pg_proc where oid=to_regprocedure(
    'public.rpc_update_progress(text,jsonb,text,jsonb,integer)')),'missing'),
  coalesce((select proacl::text from pg_proc where oid=to_regprocedure(
    'public.rpc_update_progress__five_role_impl_20260824(text,jsonb,text,jsonb,integer)')),'missing'),
  coalesce((select proacl::text from pg_proc where oid=to_regprocedure(
    'public.rpc_my_editable_progress_rights()')),'missing'),
  coalesce((select proacl::text from pg_proc where oid=to_regprocedure(
    'public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)')),'missing'),
  coalesce((select value::text from public.system_config
    where key='item_permissions_mode'),'missing'),
  coalesce((select jsonb_agg(jsonb_build_array(attribute.attnum,
      attribute.attname,format_type(attribute.atttypid,attribute.atttypmod),
      attribute.attnotnull) order by attribute.attnum)::text
    from pg_attribute attribute
    where attribute.attrelid='public.vmp_plan_items'::regclass
      and attribute.attnum>0 and not attribute.attisdropped),'[]'),
  coalesce((select string_agg(format('%s|%s|%s',constraint_row.conname,
      constraint_row.contype,pg_get_constraintdef(constraint_row.oid)),E'\n'
      order by constraint_row.conname)
    from pg_constraint constraint_row
    where constraint_row.conrelid='public.vmp_plan_items'::regclass),'missing'),
  coalesce((select format('%s|%s|%s|%s|%s|%s',index_class.relname,
      index_row.indisunique,index_row.indisvalid,index_row.indisready,
      index_row.indimmediate,pg_get_indexdef(index_row.indexrelid))
    from pg_index index_row
    join pg_class index_class on index_class.oid=index_row.indexrelid
    where index_row.indrelid='public.vmp_plan_items'::regclass
      and index_class.relname='idx_plan_validation_code'),'missing'),
  coalesce((select string_agg(format('%s|%s|%s|%s',trigger_row.tgname,
      trigger_row.tgenabled,trigger_row.tgfoid::regprocedure,
      pg_get_triggerdef(trigger_row.oid)),E'\n' order by trigger_row.tgname)
    from pg_trigger trigger_row
    where trigger_row.tgrelid='public.vmp_plan_items'::regclass
      and not trigger_row.tgisinternal
      and trigger_row.tgfoid in (
        'public.audit_plan_item_changes_v2()'::regprocedure,
        'public.vmp_plan_item_row_revision_v2()'::regprocedure
      )),'missing')
),'sha256'),'hex');
SQL
}

check_assigned_progress_precondition() {
  local suffix="$1"
  local marker="$2"
  local database="${test_database}_${suffix}"
  local before_hash after_hash migration_status
  createdb -T "$test_database" "$database"
  test_databases+=("$database")

  case "$suffix" in
    assigned_hash)
      psql -X -v ON_ERROR_STOP=1 -d "$database" >/dev/null <<'SQL'
create or replace function public.vmp_allowed_timeline_fields(
  p_uid uuid,p_validation_code text
)
returns text[] language sql stable security definer
set search_path=public,pg_temp
as $$ select '{}'::text[] $$;
SQL
      ;;
    assigned_schema)
      psql -X -v ON_ERROR_STOP=1 -d "$database" -c \
        "alter table public.vmp_plan_items add column assigned_progress_drift text" \
        >/dev/null
      ;;
    assigned_constraint)
      psql -X -v ON_ERROR_STOP=1 -d "$database" -c \
        "alter table public.vmp_plan_items add constraint assigned_progress_review_drift check (true) not valid" \
        >/dev/null
      ;;
    assigned_unique)
      psql -X -v ON_ERROR_STOP=1 -d "$database" -c \
        "alter index public.idx_plan_validation_code rename to assigned_progress_unique_drift" \
        >/dev/null
      ;;
    assigned_trigger)
      psql -X -v ON_ERROR_STOP=1 -d "$database" -c \
        "alter table public.vmp_plan_items disable trigger audit_vmp_plan_items_v2" \
        >/dev/null
      ;;
    *)
      echo "Unknown assigned progress precondition fixture: $suffix" >&2
      exit 2
      ;;
  esac

  before_hash="$(assigned_progress_state_hash "$database")"
  set +e
  psql -X -v ON_ERROR_STOP=1 -d "$database" \
    -f "$repo_dir/supabase/migrations/20260827130000_assigned_progress_visibility.sql" \
    >"$tmp_dir/${suffix}.log" 2>&1
  migration_status=$?
  set -e
  after_hash="$(assigned_progress_state_hash "$database")"
  if [[ $migration_status -eq 0 ]] \
     || ! grep -q "$marker" "$tmp_dir/${suffix}.log" \
     || [[ "$after_hash" != "$before_hash" ]]; then
    sed -n '1,260p' "$tmp_dir/${suffix}.log" >&2
    echo "Assigned progress migration did not reject $suffix before mutation." >&2
    exit 1
  fi
  echo "PASS ASSIGNED PRECONDITION rejected $suffix without writer or ACL mutation"
  dropdb --force "$database"
}

check_assigned_progress_precondition assigned_hash \
  ASSIGNED_PROGRESS_PRECONDITION_DEPENDENCY_DRIFT
check_assigned_progress_precondition assigned_schema \
  ASSIGNED_PROGRESS_PRECONDITION_TABLE_SCHEMA_DRIFT
check_assigned_progress_precondition assigned_constraint \
  ASSIGNED_PROGRESS_PRECONDITION_PLAN_CONSTRAINT_DRIFT
check_assigned_progress_precondition assigned_unique \
  ASSIGNED_PROGRESS_PRECONDITION_PLAN_UNIQUE_INDEX_DRIFT
check_assigned_progress_precondition assigned_trigger \
  ASSIGNED_PROGRESS_PRECONDITION_PLAN_TRIGGER_DRIFT

assigned_failure_database="${test_database}_assigned_failure"
createdb -T "$test_database" "$assigned_failure_database"
test_databases+=("$assigned_failure_database")
assigned_failure_before="$(assigned_progress_state_hash "$assigned_failure_database")"
set +e
env PGOPTIONS='-c vmp.assigned_progress_fault=before_wrapper' \
  psql -X -v ON_ERROR_STOP=1 -d "$assigned_failure_database" \
    -f "$repo_dir/supabase/migrations/20260827130000_assigned_progress_visibility.sql" \
    >"$tmp_dir/assigned-failure.log" 2>&1
assigned_failure_status=$?
set -e
assigned_failure_after="$(assigned_progress_state_hash "$assigned_failure_database")"
if [[ $assigned_failure_status -eq 0 ]] \
   || ! grep -q 'ASSIGNED_PROGRESS_INJECTED_BEFORE_WRAPPER' \
        "$tmp_dir/assigned-failure.log" \
   || [[ "$assigned_failure_after" != "$assigned_failure_before" ]]; then
  sed -n '1,260p' "$tmp_dir/assigned-failure.log" >&2
  echo "Assigned progress failure injection did not roll back before wrapper swap." >&2
  exit 1
fi
echo "PASS ASSIGNED ROLLBACK injected pre-wrapper failure preserved old public/private writer state"
dropdb --force "$assigned_failure_database"

psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/supabase/migrations/20260827130000_assigned_progress_visibility.sql"

psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" -c \
  "select prosrc from pg_proc where oid='public.rpc_update_progress__five_role_impl_20260824(text,jsonb,text,jsonb,integer)'::regprocedure" \
  >"$tmp_dir/assigned-old-writer.sql"
psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" -c \
  "select prosrc from pg_proc where oid='public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)'::regprocedure" \
  >"$tmp_dir/assigned-new-writer.sql"
node --input-type=commonjs - \
  "$tmp_dir/assigned-old-writer.sql" \
  "$tmp_dir/assigned-new-writer.sql" <<'NODE'
const crypto = require("node:crypto");
const fs = require("node:fs");

const oldSource = fs.readFileSync(process.argv[2], "utf8");
const newSource = fs.readFileSync(process.argv[3], "utf8");

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  if (startIndex < 0 || endIndex < 0 || source.indexOf(start, startIndex + 1) >= 0) {
    throw new Error(`writer comparison boundary drift: ${start.trim()}`);
  }
  return source.slice(startIndex, endIndex);
}

function replaceSection(source, start, end, replacement) {
  return source.replace(section(source, start, end), replacement);
}

const patchEnd = "  -- Tên cũ chỉ còn là đường tương thích; mọi kiểm quyền dùng scheduled_at.\n";
const itemFetchStart = "  select * into v_item from public.vmp_plan_items\n";
const itemFetchEnd = "  if v_item.id is null then\n";
const authorizationEnd = "  if coalesce(v_item.item_state, 'active') <> 'active' then\n";
let normalizedNew = newSource;
normalizedNew = replaceSection(
  normalizedNew,
  "  v_patch jsonb := p_patch;\n",
  patchEnd,
  section(oldSource, "  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);\n", patchEnd),
);
normalizedNew = replaceSection(
  normalizedNew,
  "  -- Authorize before taking the row lock so an unassigned caller cannot hold\n",
  itemFetchStart,
  "",
);
normalizedNew = replaceSection(
  normalizedNew,
  itemFetchStart,
  itemFetchEnd,
  section(oldSource, itemFetchStart, itemFetchEnd),
);
normalizedNew = replaceSection(
  normalizedNew,
  "  -- Re-resolve after lock acquisition so assignment revocation during a lock\n",
  authorizationEnd,
  section(oldSource, "  if v_mode = 'enforced' then\n", authorizationEnd),
);

const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
if (normalizedNew !== oldSource) {
  throw new Error(
    `ASSIGNED_PROGRESS_WRITER_NORMALIZATION_DRIFT old=${digest(oldSource)} normalized=${digest(normalizedNew)}`,
  );
}
console.log(
  `PASS ASSIGNED WRITER NORMALIZATION old=${digest(oldSource)} new=${digest(newSource)} normalized=${digest(normalizedNew)} intentional=patch_validation,row_lock,authorization`,
);
NODE

assigned_progress_contract() {
  local database="$1"
  psql -X -qAt -v ON_ERROR_STOP=1 -d "$database" <<'SQL'
select string_agg(concat_ws('|',procedure.oid::regprocedure::text,
  encode(extensions.digest(pg_get_functiondef(procedure.oid),'sha256'),'hex'),
  encode(extensions.digest(concat_ws('|',owner.rolname,language.lanname,
    procedure.prosecdef::text,procedure.provolatile::text,
    procedure.proparallel::text,procedure.proisstrict::text,
    procedure.proleakproof::text,
    coalesce(array_to_string(procedure.proconfig,','),''),
    coalesce(array_to_string(procedure.proacl,','),''),
    pg_get_function_result(procedure.oid)),'sha256'),'hex')),E'\n'
  order by procedure.oid::regprocedure::text)
from pg_proc procedure
join pg_namespace namespace on namespace.oid=procedure.pronamespace
join pg_roles owner on owner.oid=procedure.proowner
join pg_language language on language.oid=procedure.prolang
where namespace.nspname='public'
  and procedure.proname in ('rpc_my_editable_progress_rights',
    'rpc_update_progress__assigned_impl_20260827','rpc_update_progress');
SQL
}

assigned_progress_expected_contract=$'rpc_my_editable_progress_rights()|a769f237d9f92c52ca9bfb5c5f6511a3b96078dd3015678bc6e78003f7243f6b|2a1ef91d0f29fa4af8e8a31223aea79e81dbf05d2c6c031cc6225d41f1d27492\nrpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)|740ed7f1d6b5f61759879b99f3829acbe87a74ba05d5b5dc6594edf20da9f437|796e6afd55e5b79a064cf28ea74ff5b0a79589434d67e373b2c529482669d661\nrpc_update_progress(text,jsonb,text,jsonb,integer)|7e36d2360211c68d203e1fc47f8b9ab5794e6a2a88b21c2fea24cefcac6b5f8e|895edcfcd1fc3695a3bed4f873c2089bc1f7c55def39c2dd70d97c53a2524c81'
assigned_progress_contract_before_rerun="$(assigned_progress_contract "$test_database")"
if [[ "$assigned_progress_contract_before_rerun" != \
      "$assigned_progress_expected_contract" ]]; then
  echo "$assigned_progress_contract_before_rerun" >&2
  echo "Assigned progress installed function contract is not reviewed." >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/supabase/migrations/20260827130000_assigned_progress_visibility.sql"
assigned_progress_contract_after_rerun="$(assigned_progress_contract "$test_database")"
if [[ "$assigned_progress_contract_after_rerun" != \
      "$assigned_progress_contract_before_rerun" ]]; then
  echo "$assigned_progress_contract_before_rerun" >&2
  echo "$assigned_progress_contract_after_rerun" >&2
  echo "Assigned progress migration rerun changed definitions, metadata, or ACL." >&2
  exit 1
fi
echo "PASS ASSIGNED IDEMPOTENCE definitions metadata ACL and global mode preserved"

psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/tests/sql/assigned-progress-visibility.sql"
psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/tests/sql/assigned-progress-visibility-security.sql"

assigned_concurrency_database="${test_database}_assigned_concurrency"
createdb -T "$test_database" "$assigned_concurrency_database"
test_databases+=("$assigned_concurrency_database")
psql -X -v ON_ERROR_STOP=1 -d "$assigned_concurrency_database" >/dev/null <<'SQL'
insert into auth.users (
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
values (
  '99012000-0000-4000-8000-000000000001','authenticated','authenticated',
  'assigned-progress-concurrency@example.test','x',now(),'{}','{}',now(),now()
);

insert into public.profiles (id,full_name,email,role,department,is_active)
values (
  '99012000-0000-4000-8000-000000000001','Assigned Progress Concurrency QA',
  'assigned-progress-concurrency@example.test','department_user','qa',true
);

update public.vmp_performers
set department='qa',access_class='qa_progress_editor',is_active=true
where user_id='99012000-0000-4000-8000-000000000001'::uuid;

insert into public.vmp_objects (
  code,name,classification,department,frequency_months
)
values ('APV-CONCURRENT','Assigned progress concurrency item','tb','qa',12);

insert into public.vmp_plan_items (
  id,validation_code,object_code,validation_type,year,report_class,
  effort_days,deadline_protocol,deadline_validation,deadline_report,
  deadline_vmp,status_protocol,status_validation,status_report,status_vmp,
  is_active,item_state,version,departments,execution_departments,
  source_sheet_data
)
values (
  'APV-CONCURRENT/2026.01-PQ','APV-CONCURRENT/2026.01-PQ','APV-CONCURRENT',
  'PQ',2026,'Hóa lý',5,current_date+30,current_date+60,current_date+90,
  current_date+120,'not_started','not_started','not_started','not_started',
  true,'active',60,array['qa'],array['qa'],'{"fixture":"concurrency"}'
);

insert into public.vmp_item_assignments (
  validation_code,performer_id,user_id,staff_name,assignment_kind,
  source,assignment_role,is_active,change_reason
)
select 'APV-CONCURRENT/2026.01-PQ',performer.id,performer.user_id,
       performer.performer_name,'qa','qa_manager','collaborator',true,
       'Assigned progress concurrency assignment'
from public.vmp_performers performer
where performer.user_id='99012000-0000-4000-8000-000000000001'::uuid;

create function public.apv_concurrency_delay()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if old.validation_code='APV-CONCURRENT/2026.01-PQ' then
    perform pg_sleep(1.5);
  end if;
  return new;
end
$$;
create trigger apv_concurrency_delay_before_update
before update on public.vmp_plan_items
for each row execute function public.apv_concurrency_delay();
SQL

assigned_concurrency_before="$(psql -X -qAt -v ON_ERROR_STOP=1 \
  -d "$assigned_concurrency_database" <<'SQL'
select item.version||'|'||(select count(*) from public.audit_logs audit
  where audit.validation_code=item.validation_code)
from public.vmp_plan_items item
where item.validation_code='APV-CONCURRENT/2026.01-PQ';
SQL
)"
assigned_concurrency_before_version="${assigned_concurrency_before%%|*}"
assigned_concurrency_before_audits="${assigned_concurrency_before##*|}"

psql -X -qAt -v ON_ERROR_STOP=1 \
  -v expected_version="$assigned_concurrency_before_version" \
  -d "$assigned_concurrency_database" \
  >"$tmp_dir/concurrency-one.log" 2>&1 <<'SQL' &
begin;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"99012000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.rpc_update_progress(
  'APV-CONCURRENT/2026.01-PQ','{"status_protocol":"in_progress"}'::jsonb,
  null,null,:'expected_version'::integer);
commit;
SQL
assigned_concurrency_pid_one=$!
psql -X -qAt -v ON_ERROR_STOP=1 \
  -v expected_version="$assigned_concurrency_before_version" \
  -d "$assigned_concurrency_database" \
  >"$tmp_dir/concurrency-two.log" 2>&1 <<'SQL' &
begin;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"99012000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.rpc_update_progress(
  'APV-CONCURRENT/2026.01-PQ','{"status_protocol":"overdue"}'::jsonb,
  null,null,:'expected_version'::integer);
commit;
SQL
assigned_concurrency_pid_two=$!

set +e
wait "$assigned_concurrency_pid_one"
assigned_concurrency_status_one=$?
wait "$assigned_concurrency_pid_two"
assigned_concurrency_status_two=$?
set -e

assigned_concurrency_after="$(psql -X -qAt -v ON_ERROR_STOP=1 \
  -d "$assigned_concurrency_database" <<'SQL'
select item.version||'|'||(select count(*) from public.audit_logs audit
  where audit.validation_code=item.validation_code)
from public.vmp_plan_items item
where item.validation_code='APV-CONCURRENT/2026.01-PQ';
SQL
)"
assigned_concurrency_successes="$(
  (grep -h -c '"ok": true' "$tmp_dir/concurrency-one.log" \
    "$tmp_dir/concurrency-two.log" || true) | awk '{total+=$1} END {print total+0}'
)"
assigned_concurrency_conflicts="$(
  (grep -h -c '"code": "version_conflict"' "$tmp_dir/concurrency-one.log" \
    "$tmp_dir/concurrency-two.log" || true) | awk '{total+=$1} END {print total+0}'
)"
assigned_concurrency_after_version="${assigned_concurrency_after%%|*}"
assigned_concurrency_after_audits="${assigned_concurrency_after##*|}"
if [[ $assigned_concurrency_status_one -ne 0 ]] \
   || [[ $assigned_concurrency_status_two -ne 0 ]] \
   || [[ "$assigned_concurrency_successes" != "1" ]] \
   || [[ "$assigned_concurrency_conflicts" != "1" ]] \
   || [[ "$assigned_concurrency_after_version" -ne \
         $((assigned_concurrency_before_version + 1)) ]] \
   || [[ "$assigned_concurrency_after_audits" -ne \
         $((assigned_concurrency_before_audits + 1)) ]]; then
  sed -n '1,120p' "$tmp_dir/concurrency-one.log" >&2
  sed -n '1,120p' "$tmp_dir/concurrency-two.log" >&2
  echo "ASSIGNED_PROGRESS_CONCURRENCY_CONTRACT before=$assigned_concurrency_before after=$assigned_concurrency_after successes=$assigned_concurrency_successes conflicts=$assigned_concurrency_conflicts statuses=$assigned_concurrency_status_one/$assigned_concurrency_status_two" >&2
  exit 1
fi
echo "PASS ASSIGNED CONCURRENCY one winner one version_conflict one audit no lost update"
dropdb --force "$assigned_concurrency_database"

mode_contract="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" <<'SQL'
select (select value from public.system_config where key='screen_access_mode')='"enforced"'::jsonb
   and (select value from public.system_config where key='item_permissions_mode')='"preview"'::jsonb;
SQL
)"
if [[ "$mode_contract" != "t" ]]; then
  echo "Focused QA rights suite changed production enforcement modes." >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 -d "$manifest_template_database" \
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

manifest_clone_database=""
create_manifest_clone() {
  local suffix="$1"
  manifest_clone_database="${test_database}_${suffix}"
  createdb -T "$manifest_template_database" "$manifest_clone_database"
  test_databases+=("$manifest_clone_database")
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

create_manifest_clone manifest_missing
manifest_missing_db="$manifest_clone_database"
expect_manifest_failure "$manifest_missing_db" \
  VIEWER_IDS_PSQL_VARIABLE_REQUIRED \
  psql -X -v ON_ERROR_STOP=1 -d "$manifest_missing_db" \
    -v khoa_id="$khoa_id" -v dat_id="$dat_id" \
    -f "$repo_dir/scripts/apply-qa-rights-account-manifest.sql"

create_manifest_clone manifest_duplicate
manifest_duplicate_db="$manifest_clone_database"
expect_manifest_failure "$manifest_duplicate_db" \
  ACCOUNT_MANIFEST_REQUIRES_FOUR_UNIQUE_UUIDS \
  psql -X -v ON_ERROR_STOP=1 -d "$manifest_duplicate_db" \
    -v khoa_id="$khoa_id" -v dat_id="$dat_id" \
    -v viewer_ids="$viewer_one_id,$viewer_one_id" \
    -f "$repo_dir/scripts/apply-qa-rights-account-manifest.sql"

create_manifest_clone manifest_wrong
manifest_wrong_db="$manifest_clone_database"
psql -X -v ON_ERROR_STOP=1 -d "$manifest_wrong_db" -c \
  "update public.vmp_performers set access_class=null where user_id='$khoa_id'::uuid" \
  >/dev/null
expect_manifest_failure "$manifest_wrong_db" \
  ACCOUNT_MANIFEST_PARTIAL_STATE_REFUSED \
  psql -X -v ON_ERROR_STOP=1 -d "$manifest_wrong_db" \
    -v khoa_id="$khoa_id" -v dat_id="$dat_id" \
    -v viewer_ids="$viewer_one_id,$viewer_two_id" \
    -f "$repo_dir/scripts/apply-qa-rights-account-manifest.sql"

create_manifest_clone manifest_after_khoa
manifest_after_khoa_db="$manifest_clone_database"
expect_manifest_failure "$manifest_after_khoa_db" \
  QA_ALIGNMENT_INJECTED_AFTER_KHOA \
  env PGOPTIONS='-c vmp.qa_alignment_fault=after_khoa' \
  psql -X -v ON_ERROR_STOP=1 -d "$manifest_after_khoa_db" \
    -v khoa_id="$khoa_id" -v dat_id="$dat_id" \
    -v viewer_ids="$viewer_one_id,$viewer_two_id" \
    -f "$repo_dir/scripts/apply-qa-rights-account-manifest.sql"

create_manifest_clone manifest_refresh
manifest_refresh_db="$manifest_clone_database"
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

create_manifest_clone manifest_success
manifest_success_db="$manifest_clone_database"
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

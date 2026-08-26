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
test_database="vmp_qa_actual_${$}_${RANDOM}"
test_databases=("$test_database")

cleanup() {
  if [[ -n "${LOCAL_PGHOST:-}" ]]; then
    for cleanup_database in "${test_databases[@]}"; do
      if [[ "$cleanup_database" =~ ^vmp_qa_actual_[0-9]+_[0-9]+(_[a-z]+)?$ ]]; then
        PGHOST="$LOCAL_PGHOST" PGPORT="$LOCAL_PGPORT" PGUSER="$LOCAL_PGUSER" \
          PGPASSWORD="$LOCAL_PGPASSWORD" dropdb --if-exists --force "$cleanup_database" \
          >/dev/null 2>&1 || true
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

docker run --rm --network host \
  -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE="$LOCAL_PGDATABASE" \
  -v "$tmp_dir:/out" postgres:17 \
  pg_dump -Fc --no-owner -n public -n auth -f /out/base.dump
docker run --rm -v "$tmp_dir:/out" postgres:17 \
  pg_restore -l /out/base.dump | sed '/ DEFAULT ACL /d' >"$tmp_dir/restore.list"

createdb -T template0 "$test_database"
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
select current_database() ~ '^vmp_qa_actual_[0-9]+_[0-9]+$'
   and current_user='postgres'
   and exists (select 1 from public.system_config
               where key='five_role_test_fixture' and value='true'::jsonb)
   and (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public'
          and has_function_privilege('authenticated',p.oid,'EXECUTE'))=64;
SQL
)"
if [[ "$clone_ok" != "t" ]]; then
  echo "Refusing non-reviewed disposable clone." >&2
  exit 3
fi

psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/supabase/migrations/20260826130000_catalog_progressed_deadline_override.sql"
psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/supabase/migrations/20260826170000_manual_planned_deadline_edit.sql"

if [[ "$mode" == "--expect-red" ]]; then
  set +e
  psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
    -f "$repo_dir/tests/sql/qa-manager-actual-date-principal.sql" \
    >"$tmp_dir/red.log" 2>&1
  red_status=$?
  set -e
  if [[ $red_status -eq 0 ]]; then
    echo "Expected uppercase-QA principal RED, but the focused suite passed." >&2
    exit 1
  fi
  if ! grep -q 'QA_MANAGER_UPPERCASE_PRINCIPAL_RED' "$tmp_dir/red.log"; then
    sed -n '1,240p' "$tmp_dir/red.log" >&2
    echo "QA principal RED failed before the intended principal assertion." >&2
    exit 1
  fi
  echo "PASS RED uppercase QA business role resolves but manager principal fails"
  exit 0
fi

check_precondition_drift() {
  local suffix="$1"
  local drift_sql="$2"
  local drift_database="${test_database}_${suffix}"
  local before_hash after_hash migration_status
  test_databases+=("$drift_database")
  createdb -T "$test_database" "$drift_database"
  psql -X -v ON_ERROR_STOP=1 -d "$drift_database" -c "$drift_sql" >/dev/null
  before_hash="$(psql -X -qAt -d "$drift_database" -c \
    "select encode(extensions.digest(pg_get_functiondef('public.vmp_manager_principal(uuid)'::regprocedure),'sha256'),'hex')")"
  set +e
  psql -X -v ON_ERROR_STOP=1 -d "$drift_database" \
    -f "$repo_dir/supabase/migrations/20260826180000_qa_manager_actual_date_principal_normalization.sql" \
    >"$tmp_dir/precondition-${suffix}.log" 2>&1
  migration_status=$?
  set -e
  after_hash="$(psql -X -qAt -d "$drift_database" -c \
    "select encode(extensions.digest(pg_get_functiondef('public.vmp_manager_principal(uuid)'::regprocedure),'sha256'),'hex')")"
  if [[ $migration_status -eq 0 ]] \
     || ! grep -q 'QA_ACTUAL_DATE_PRECONDITION_' "$tmp_dir/precondition-${suffix}.log" \
     || [[ "$after_hash" != "$before_hash" ]]; then
    sed -n '1,240p' "$tmp_dir/precondition-${suffix}.log" >&2
    echo "QA principal migration did not reject $suffix drift before replacement." >&2
    exit 1
  fi
  echo "PASS PRECONDITION rejected QA principal ${suffix} drift before replacement"
  dropdb --force "$drift_database"
}

check_precondition_drift definition \
  "create or replace function public.vmp_manager_principal(p_uid uuid) returns table(principal_kind text,profile_department text,performer_department text,scope_departments text[],access_areas text[]) language sql stable security definer set search_path=public,pg_temp as \$function\$ select 'drift',null,null,'{}'::text[],'{}'::text[] \$function\$"
check_precondition_drift metadata \
  "alter function public.vmp_manager_principal(uuid) set search_path=pg_temp,public"
check_precondition_drift acl \
  "grant execute on function public.vmp_manager_principal(uuid) to authenticated"
check_precondition_drift schema \
  "alter table public.vmp_performers rename column access_class to access_class_drift"

psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/supabase/migrations/20260826180000_qa_manager_actual_date_principal_normalization.sql"
psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/tests/sql/qa-manager-actual-date-principal.sql"
psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/tests/sql/qa-manager-actual-date-security.sql"

if [[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" -c \
  "select value='\"preview\"'::jsonb from public.system_config where key='item_permissions_mode'")" != "t" ]]; then
  echo "Focused QA suite did not roll back enforced permission mode." >&2
  exit 1
fi
echo "PASS GREEN QA principal actual-date business atomic audit security ACL ROLLBACK"

#!/usr/bin/env bash

set -euo pipefail

phase="full"
if [[ $# -gt 0 ]]; then
  if [[ $# -ne 2 || "$1" != "--phase" ]]; then
    echo "Usage: $0 [--phase expand|behavior|security|performance]" >&2
    exit 2
  fi
  phase="$2"
fi
case "$phase" in
  full|expand|behavior|security|performance) ;;
  *)
    echo "Usage: $0 [--phase expand|behavior|security|performance]" >&2
    exit 2
    ;;
esac

if [[ -z "${SUPABASE_DB_URL:-}" || -z "${VMP_TEST_DB_URL:-}" ]]; then
  echo "SUPABASE_DB_URL and VMP_TEST_DB_URL are required." >&2
  exit 2
fi

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
tmp_dir="$(mktemp -d)"
test_database="vmp_source_access_${$}_${RANDOM}"
test_databases=("$test_database")

cleanup() {
  local original_status=$?
  local cleanup_status=0
  local cleanup_database survivors
  trap - EXIT
  set +e

  if [[ -n "${LOCAL_PGHOST:-}" ]]; then
    for cleanup_database in "${test_databases[@]}"; do
      if [[ "$cleanup_database" =~ ^vmp_source_access_[0-9]+_[0-9]+$ ]]; then
        PGHOST="$LOCAL_PGHOST" PGPORT="$LOCAL_PGPORT" PGUSER="$LOCAL_PGUSER" \
          PGPASSWORD="$LOCAL_PGPASSWORD" \
          dropdb --if-exists --force "$cleanup_database" >/dev/null 2>&1 \
          || cleanup_status=1
      else
        echo "CLEANUP REFUSED unvalidated database=$cleanup_database" >&2
        cleanup_status=1
      fi
    done

    survivors="$(PGHOST="$LOCAL_PGHOST" PGPORT="$LOCAL_PGPORT" \
      PGUSER="$LOCAL_PGUSER" PGPASSWORD="$LOCAL_PGPASSWORD" \
      psql -X -qAt -v ON_ERROR_STOP=1 -d "$LOCAL_PGDATABASE" \
        -v run_database="$test_database" <<'SQL'
select datname from pg_database where datname=:'run_database';
SQL
    )" || cleanup_status=1
    if [[ -n "$survivors" ]]; then
      echo "CLEANUP SURVIVOR database=$test_database" >&2
      cleanup_status=1
    fi
  fi

  if [[ -d "$tmp_dir" ]]; then
    find "$tmp_dir" -mindepth 1 -delete || cleanup_status=1
    rmdir "$tmp_dir" || cleanup_status=1
  fi
  unset LOCAL_PGHOST LOCAL_PGPORT LOCAL_PGUSER LOCAL_PGPASSWORD LOCAL_PGDATABASE

  if [[ $cleanup_status -ne 0 && $original_status -eq 0 ]]; then
    exit 1
  fi
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
select current_database()='postgres'
   and current_user='postgres'
   and current_setting('server_version_num')::integer between 170000 and 179999
   and exists (
     select 1 from public.system_config
     where key='five_role_test_fixture' and value='true'::jsonb
   )
   and (select count(*)
        from pg_proc procedure
        join pg_namespace namespace on namespace.oid=procedure.pronamespace
        where namespace.nspname='public'
          and has_function_privilege('authenticated',procedure.oid,'EXECUTE'))=64;
SQL
)"
if [[ "$source_ok" != "t" ]]; then
  echo "Refusing unreviewed PostgreSQL 17 source before database mutation." >&2
  exit 3
fi

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
select current_database() ~ '^vmp_source_access_[0-9]+_[0-9]+$'
   and current_user='postgres'
   and current_setting('server_version_num')::integer between 170000 and 179999
   and exists (
     select 1 from public.system_config
     where key='five_role_test_fixture' and value='true'::jsonb
   )
   and (select count(*)
        from pg_proc procedure
        join pg_namespace namespace on namespace.oid=procedure.pronamespace
        where namespace.nspname='public'
          and has_function_privilege('authenticated',procedure.oid,'EXECUTE'))=64;
SQL
)"
if [[ "$clone_ok" != "t" ]]; then
  echo "Refusing non-reviewed disposable PostgreSQL 17 clone." >&2
  exit 3
fi

historical_migrations=(
  20260826130000_catalog_progressed_deadline_override.sql
  20260826170000_manual_planned_deadline_edit.sql
  20260826180000_qa_manager_actual_date_principal_normalization.sql
  20260827100000_qa_rights_account_alignment.sql
  20260827130000_assigned_progress_visibility.sql
  20260828100000_assigned_progress_preflight_allowlist.sql
  20260828130000_admin_only_management_visibility.sql
)
for migration in "${historical_migrations[@]}"; do
  if [[ "$migration" == "20260828130000_admin_only_management_visibility.sql" ]]; then
    psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" <<'SQL'
insert into public.vmp_legacy_action_map(
  hanh_dong_cu,screen_id,hanh_dong_moi,ghi_chu
)
values (
  'admin_users','accounts','manage_accounts',
  'Reviewed production-equivalent admin-only disposable baseline'
)
on conflict(hanh_dong_cu) do update
set screen_id=excluded.screen_id,hanh_dong_moi=excluded.hanh_dong_moi,
    ghi_chu=excluded.ghi_chu;

insert into public.vmp_role_permissions(hanh_dong,vai_tro,muc)
values
  ('admin_users','admin','co'),
  ('admin_users','department_user','khong'),
  ('admin_users','qa_manager','khong'),
  ('admin_users','viewer','khong')
on conflict(hanh_dong,vai_tro) do update set muc=excluded.muc;

do $$
begin
  if not public.duoc_phep('admin_users','admin')
     or exists (
    select 1 from unnest(array[
      'qa_manager','qa_staff','workshop_manager','workshop_staff','viewer'
    ]) role_name where public.duoc_phep('admin_users',role_name)
  ) then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_ADMIN_USERS_BASELINE_MISMATCH';
  end if;
end
$$;
\echo 'PASS BASELINE production-equivalent admin_users action map'
SQL
  fi
  psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
    -f "$repo_dir/supabase/migrations/$migration"
done
echo "PASS CLONE PostgreSQL 17 reviewed baseline and historical migrations"

expand_migration="$repo_dir/supabase/migrations/20260828140000_source_qa_workshop_access_expand.sql"
enforce_migration="$repo_dir/supabase/migrations/20260828150000_source_qa_workshop_access_enforce.sql"

if [[ "$phase" == "expand" ]]; then
  if [[ ! -f "$expand_migration" ]]; then
    echo "Missing expand migration for --phase expand." >&2
    exit 4
  fi
  psql -X -v ON_ERROR_STOP=1 -d "$test_database" -f "$expand_migration"
elif [[ "$phase" != "full" ]]; then
  if [[ ! -f "$expand_migration" || ! -f "$enforce_migration" ]]; then
    echo "Both Source access migrations are required for --phase $phase." >&2
    exit 4
  fi
  psql -X -v ON_ERROR_STOP=1 -d "$test_database" -f "$expand_migration"
  psql -X -v ON_ERROR_STOP=1 -d "$test_database" -f "$enforce_migration"
else
  [[ ! -f "$expand_migration" ]] || \
    psql -X -v ON_ERROR_STOP=1 -d "$test_database" -f "$expand_migration"
  [[ ! -f "$enforce_migration" ]] || \
    psql -X -v ON_ERROR_STOP=1 -d "$test_database" -f "$enforce_migration"
fi

run_behavior() {
  local sql_phase="$1"
  psql -X -v ON_ERROR_STOP=1 -v source_access_phase="$sql_phase" \
    -d "$test_database" -f "$repo_dir/tests/sql/source-qa-workshop-access.sql"
}

case "$phase" in
  expand)
    run_behavior expand
    ;;
  behavior)
    run_behavior behavior
    ;;
  security)
    psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
      -f "$repo_dir/tests/sql/source-qa-workshop-access-security.sql"
    ;;
  performance)
    psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
      -f "$repo_dir/tests/sql/source-qa-workshop-access-performance.sql"
    ;;
  full)
    run_behavior behavior
    psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
      -f "$repo_dir/tests/sql/source-qa-workshop-access-security.sql"
    psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
      -f "$repo_dir/tests/sql/source-qa-workshop-access-performance.sql"
    ;;
esac

echo "PASS SOURCE ACCESS phase=$phase rollback-only suites"

#!/usr/bin/env bash

set -euo pipefail

mode="${1:-}"
if [[ -n "$mode" && "$mode" != "--expect-red" && "$mode" != "--expect-manual-red" ]]; then
  echo "Usage: $0 [--expect-red|--expect-manual-red]" >&2
  exit 2
fi

if [[ -z "${SUPABASE_DB_URL:-}" || -z "${VMP_TEST_DB_URL:-}" ]]; then
  echo "SUPABASE_DB_URL and VMP_TEST_DB_URL are required." >&2
  exit 2
fi

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
tmp_dir="$(mktemp -d)"
test_database="vmp_catalog_deadline_${$}_${RANDOM}"
test_databases=("$test_database")

cleanup() {
  if [[ -n "${LOCAL_PGHOST:-}" ]]; then
    for cleanup_database in "${test_databases[@]}"; do
      if [[ "$cleanup_database" =~ ^vmp_catalog_deadline_[0-9]+_[0-9]+(_[a-z]+)?$ ]]; then
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

if node "$repo_dir/scripts/parse-five-role-local-db.mjs" >"$tmp_dir/local-connection"; then
  :
else
  exit "$?"
fi
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

psql -X -v ON_ERROR_STOP=1 -d "$test_database" -At <<'SQL' >"$tmp_dir/clone-contract"
select current_database() ~ '^vmp_catalog_deadline_[0-9]+_[0-9]+$'
   and current_user = 'postgres'
   and exists (
     select 1 from public.system_config
     where key = 'five_role_test_fixture' and value = 'true'::jsonb
   )
   and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and has_function_privilege('authenticated', p.oid, 'EXECUTE')) = 64;
SQL
if [[ "$(tail -n 1 "$tmp_dir/clone-contract")" != "t" ]]; then
  echo "Refusing non-reviewed disposable clone." >&2
  exit 3
fi

check_precondition_drift() {
  local suffix="$1"
  local drift_sql="$2"
  local drift_database="${test_database}_${suffix}"
  local drift_log="$tmp_dir/precondition-${suffix}.log"
  local migration_status
  test_databases+=("$drift_database")
  createdb -T "$test_database" "$drift_database"
  psql -X -v ON_ERROR_STOP=1 -d "$drift_database" -c "$drift_sql" >/dev/null
  set +e
  psql -X -v ON_ERROR_STOP=1 -d "$drift_database" \
    -f "$repo_dir/supabase/migrations/20260826130000_catalog_progressed_deadline_override.sql" \
    >"$drift_log" 2>&1
  migration_status=$?
  set -e

  if [[ $migration_status -eq 0 ]] \
     || ! grep -q 'CATALOG_V2_PRECONDITION_' "$drift_log" \
     || [[ "$(psql -X -qAt -d "$drift_database" -c "select to_regprocedure('public.vmp_lock_catalog_object_v2(text,text)') is null")" != "t" ]]; then
    sed -n '1,220p' "$drift_log" >&2
    echo "Migration did not reject $suffix drift before DDL." >&2
    exit 1
  fi
  echo "PASS PRECONDITION rejected ${suffix} drift before DDL"
  dropdb --force "$drift_database"
}

check_manual_precondition_drift() {
  local suffix="$1"
  local drift_sql="$2"
  local drift_database="${test_database}_manual${suffix}"
  local drift_log="$tmp_dir/manual-precondition-${suffix}.log"
  local migration_status
  test_databases+=("$drift_database")
  createdb -T "$test_database" "$drift_database"
  psql -X -v ON_ERROR_STOP=1 -d "$drift_database" -c "$drift_sql" >/dev/null
  set +e
  psql -X -v ON_ERROR_STOP=1 -d "$drift_database" \
    -f "$repo_dir/supabase/migrations/20260826170000_manual_planned_deadline_edit.sql" \
    >"$drift_log" 2>&1
  migration_status=$?
  set -e

  if [[ $migration_status -eq 0 ]] \
     || ! grep -q 'MANUAL_DEADLINE_PRECONDITION_' "$drift_log" \
     || [[ "$(psql -X -qAt -d "$drift_database" -c "select to_regprocedure('public.vmp_update_planned_deadlines_impl(text,jsonb,text,integer,boolean)') is null")" != "t" ]]; then
    sed -n '1,220p' "$drift_log" >&2
    echo "Manual migration did not reject $suffix drift before DDL." >&2
    exit 1
  fi
  echo "PASS MANUAL PRECONDITION rejected ${suffix} drift before DDL"
  dropdb --force "$drift_database"
}

if [[ "$mode" == "--expect-red" ]]; then
  set +e
  psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
    -f "$repo_dir/tests/sql/catalog-progressed-deadline-override.sql" \
    >"$tmp_dir/red.log" 2>&1
  red_status=$?
  set -e
  if [[ $red_status -eq 0 ]]; then
    echo "Expected RED but the V2 suite passed." >&2
    exit 1
  fi
  if ! grep -Eq 'function public\.rpc_apply_catalog_change_v2\(.*\) does not exist|undefined_function' "$tmp_dir/red.log"; then
    sed -n '1,220p' "$tmp_dir/red.log" >&2
    echo "RED failed for a reason other than missing V2 RPC." >&2
    exit 1
  fi
  echo "PASS RED undefined_function rpc_apply_catalog_change_v2"
  exit 0
fi

check_precondition_drift definition \
  "create or replace function public.rpc_preview_catalog_change(p_change_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as \$function\$ begin return '{\"ok\":false,\"error_code\":\"DRIFT\"}'::jsonb; end \$function\$"
check_precondition_drift searchpath \
  "alter function public.audit_plan_item_changes_v2() set search_path=public,pg_temp"
check_precondition_drift schema \
  "alter table public.vmp_catalog_changes drop column applied_at"
check_precondition_drift helperbody \
  "create or replace function public.vmp_parse_depts(p_raw text) returns text[] language plpgsql immutable security invoker set search_path=public,pg_temp as \$function\$ begin return array['drift']::text[]; end \$function\$"
check_precondition_drift missinghelper \
  "drop function public.vmp_parse_depts(text)"

psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/supabase/migrations/20260826130000_catalog_progressed_deadline_override.sql"

if [[ "$mode" == "--expect-manual-red" ]]; then
  set +e
  psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
    -f "$repo_dir/tests/sql/manual-planned-deadline-edit.sql" \
    >"$tmp_dir/manual-red.log" 2>&1
  manual_red_status=$?
  set -e
  if [[ $manual_red_status -eq 0 ]]; then
    echo "Expected RED but the manual planned-deadline suite passed." >&2
    exit 1
  fi
  if ! grep -Eq 'function public\.rpc_update_planned_deadlines\(.*\) does not exist|undefined_function' \
      "$tmp_dir/manual-red.log"; then
    sed -n '1,220p' "$tmp_dir/manual-red.log" >&2
    echo "Manual RED failed for a reason other than the missing RPC." >&2
    exit 1
  fi
  echo "PASS RED undefined_function rpc_update_planned_deadlines"
  exit 0
fi

check_manual_precondition_drift definition \
  "create or replace function public.vmp_plan_item_row_revision_v2() returns trigger language plpgsql volatile security invoker set search_path=public,pg_temp as \$function\$ begin new.version:=old.version+2; return new; end \$function\$"
check_manual_precondition_drift searchpath \
  "alter function public.audit_plan_item_changes_v2() set search_path=public,pg_temp"
check_manual_precondition_drift schema \
  "alter table public.vmp_plan_items alter column version drop not null"
check_manual_precondition_drift overload \
  "create function public.rpc_update_planned_deadlines(text) returns jsonb language sql as \$function\$ select '{}'::jsonb \$function\$"
check_manual_precondition_drift assignmentdependency \
  "alter function public.rpc_set_item_assignment__five_role_impl_20260824(uuid,text,text,text,text,text,uuid) set search_path=pg_temp,public"

psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/supabase/migrations/20260826170000_manual_planned_deadline_edit.sql"

psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/tests/sql/catalog-progressed-deadline-override.sql"
psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/tests/sql/manual-planned-deadline-edit.sql"

# Committed setup is isolated to the disposable database so two real backend
# sessions can contend on the same advisory mutex and rows.
psql -X -v ON_ERROR_STOP=1 -v catalog_concurrency_setup=1 -d "$test_database" \
  -f "$repo_dir/tests/sql/catalog-progressed-deadline-override.sql"
psql -X -v ON_ERROR_STOP=1 -v manual_concurrency_setup=1 -d "$test_database" \
  -f "$repo_dir/tests/sql/manual-planned-deadline-edit.sql"

run_rpc() {
  local sql="$1"
  local output="$2"
  PGAPPNAME="$(basename "$output")" \
    PGOPTIONS='-c lock_timeout=8s -c statement_timeout=20s' \
    psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" -c "$sql" >"$output"
}

assert_advisory_waiters() {
  local expected="$1"
  local matched=0
  for _attempt in {1..30}; do
    matched="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" -c \
      "select count(*) from pg_stat_activity where datname=current_database() and application_name like '%.json' and wait_event_type='Lock' and wait_event='advisory'")"
    if [[ "$matched" == "$expected" ]]; then return 0; fi
    sleep 0.05
  done
  echo "Expected $expected advisory waiters, observed $matched." >&2
  return 1
}

assert_backend_wait() {
  local application_name="$1"
  local wait_type="$2"
  local wait_event="$3"
  local matched=0
  for _attempt in {1..60}; do
    matched="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" -c \
      "select count(*) from pg_stat_activity where datname=current_database() and application_name='$application_name' and wait_event_type='$wait_type' and wait_event='$wait_event'")"
    if [[ "$matched" == "1" ]]; then return 0; fi
    sleep 0.05
  done
  echo "Expected backend $application_name waiting on $wait_type/$wait_event, observed $matched." >&2
  return 1
}

assert_backend_lock_wait() {
  local application_name="$1"
  local matched=0
  for _attempt in {1..60}; do
    matched="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" -c \
      "select count(*) from pg_stat_activity where datname=current_database() and application_name='$application_name' and wait_event_type='Lock'")"
    if [[ "$matched" == "1" ]]; then return 0; fi
    sleep 0.05
  done
  echo "Expected backend $application_name waiting on a row lock, observed $matched." >&2
  return 1
}

hold_mutex() {
  local object_code="$1"
  psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" -c \
    "begin; set local statement_timeout='15s'; select public.vmp_lock_catalog_object_v2('Thiết bị','$object_code'); select pg_sleep(4); commit;" \
    >"$tmp_dir/barrier-$object_code.log" &
  mutex_pid=$!
}

claims="json_build_object('role','service_role')::text"

# A legacy direct writer does not take the catalog mutex. V2 must therefore
# lock the stable source-object/identity superset, including a malformed row that
# the preview does not advertise, before entering V1.
run_rpc "with g as (select set_config('request.jwt.claims',$claims,false) c) select public.rpc_apply_catalog_change_v2('a1000000-0000-4000-8000-000000000003','lock stable superset',1,'[{\"validation_code\":\"CCTB-CONC-LS/2026.01-PQ\",\"expected_item_version\":7}]'::jsonb,true) from g where c is not null" "$tmp_dir/lock-superset-apply.json" &
lock_superset_apply_pid=$!
assert_backend_wait 'lock-superset-apply.json' 'Timeout' 'PgSleep'
run_rpc "update public.vmp_plan_items set owner_name='Legacy writer after lock' where validation_code='CCTB-CONC-LS/2026.BAD-X'" "$tmp_dir/lock-superset-writer.json" &
lock_superset_writer_pid=$!
assert_backend_lock_wait 'lock-superset-writer.json'
wait "$lock_superset_apply_pid"
wait "$lock_superset_writer_pid"
node --input-type=module - "$tmp_dir/lock-superset-apply.json" <<'NODE'
import { readFileSync } from "node:fs";
const value = JSON.parse(readFileSync(process.argv[2], "utf8").trim().split("\n").at(-1));
if (value.ok !== true || value.da_ap_truoc_do !== false) throw new Error(`lock-superset apply ${JSON.stringify(value)}`);
NODE
if [[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" -c "select version=12 and owner_name='Legacy writer after lock' from public.vmp_plan_items where validation_code='CCTB-CONC-LS/2026.BAD-X'")" != "t" ]]; then
  echo "Stable-superset legacy writer final state mismatch." >&2
  exit 1
fi
psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" -c \
  "drop trigger catalog_test_lock_superset_pause on public.vmp_source_objects; drop function auth.catalog_test_lock_superset_pause()"
echo "PASS CONCURRENCY stable-superset legacy-writer"

hold_mutex 'CCTB-CONC-AA'
barrier_pid="$mutex_pid"
sleep 0.2
run_rpc "with g as (select set_config('request.jwt.claims',$claims,false) c) select public.rpc_apply_catalog_change_v2('a1000000-0000-4000-8000-000000000001','concurrent apply A',1,'[{\"validation_code\":\"CCTB-CONC-AA/2026.01-PQ\",\"expected_item_version\":7}]'::jsonb,true) from g where c is not null" "$tmp_dir/apply-a.json" &
apply_a_pid=$!
assert_advisory_waiters 1
run_rpc "with g as (select set_config('request.jwt.claims',$claims,false) c) select public.rpc_apply_catalog_change_v2('a1000000-0000-4000-8000-000000000001','concurrent apply B',1,'[{\"validation_code\":\"CCTB-CONC-AA/2026.01-PQ\",\"expected_item_version\":7}]'::jsonb,true) from g where c is not null" "$tmp_dir/apply-b.json" &
apply_b_pid=$!
assert_advisory_waiters 2
wait "$barrier_pid"
wait "$apply_a_pid"
wait "$apply_b_pid"

node --input-type=module - "$tmp_dir/apply-a.json" "$tmp_dir/apply-b.json" <<'NODE'
import { readFileSync } from "node:fs";
const values = process.argv.slice(2).map((path) => JSON.parse(readFileSync(path, "utf8").trim().split("\n").at(-1)));
if (!values.every((value) => value.ok === true)) throw new Error("apply/apply returned a non-success payload");
const flags = values.map((value) => value.da_ap_truoc_do).sort();
if (JSON.stringify(flags) !== JSON.stringify([false, true])) throw new Error(`apply/apply flags ${JSON.stringify(flags)}`);
NODE

hold_mutex 'CCTB-CONC-SA'
barrier_pid="$mutex_pid"
sleep 0.2
run_rpc "with g as (select set_config('request.jwt.claims',$claims,false) c) select public.rpc_apply_catalog_change_v2('a1000000-0000-4000-8000-000000000002','concurrent save/apply',1,'[{\"validation_code\":\"CCTB-CONC-SA/2026.01-PQ\",\"expected_item_version\":7}]'::jsonb,true) from g where c is not null" "$tmp_dir/save-apply-apply.json" &
save_apply_apply_pid=$!
assert_advisory_waiters 1
run_rpc "with g as (select set_config('request.jwt.claims',$claims,false) c) select public.rpc_save_catalog_object('Thiết bị','CCTB-CONC-SA','{\"first_month\":4}'::jsonb,'concurrent save',1) from g where c is not null" "$tmp_dir/save-apply-save.json" &
save_apply_save_pid=$!
assert_advisory_waiters 2
wait "$barrier_pid"
wait "$save_apply_apply_pid"
wait "$save_apply_save_pid"

node --input-type=module - "$tmp_dir/save-apply-apply.json" "$tmp_dir/save-apply-save.json" <<'NODE'
import { readFileSync } from "node:fs";
const [apply, save] = process.argv.slice(2).map((path) => JSON.parse(readFileSync(path, "utf8").trim().split("\n").at(-1)));
if (apply.ok !== true || save.ok !== true) throw new Error(`save/apply failure ${JSON.stringify({ apply, save })}`);
NODE

psql -X -v ON_ERROR_STOP=1 -d "$test_database" <<'SQL'
do $concurrency$
declare
  v_preview jsonb;
begin
  if (select status from public.vmp_catalog_changes where id = 'a1000000-0000-4000-8000-000000000001') <> 'applied'
     or (select version from public.vmp_plan_items where validation_code = 'CCTB-CONC-AA/2026.01-PQ') <> 8 then
    raise exception using errcode = 'check_violation', message = 'CONCURRENT_APPLY_APPLY_FINAL_STATE';
  end if;

  if (select timeline_revision from public.vmp_source_objects
      where object_kind = 'Thiết bị' and object_code = 'CCTB-CONC-SA') <> 2
     or (select count(*) from public.vmp_catalog_changes
         where object_kind = 'Thiết bị' and object_code = 'CCTB-CONC-SA'
           and status in ('pending','previewed')) <> 1 then
    raise exception using errcode = 'check_violation', message = 'CONCURRENT_SAVE_APPLY_FINAL_STATE';
  end if;

  perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  select public.rpc_preview_catalog_change_v2(id) into v_preview
  from public.vmp_catalog_changes
  where object_kind = 'Thiết bị' and object_code = 'CCTB-CONC-SA'
    and status in ('pending','previewed');
  if coalesce((v_preview ->> 'ok')::boolean, false) is not true then
    raise exception using errcode = 'check_violation', message = 'CONCURRENT_SAVE_APPLY_PREVIEW';
  end if;
  raise notice 'PASS CONCURRENCY apply/apply save/apply';
end
$concurrency$;
SQL

manual_mm_deadlines='{"deadline_protocol":"2026-09-02","deadline_validation":"2026-09-16","deadline_report":"2026-09-23","deadline_vmp":"2026-10-01"}'
run_rpc "with g as (select set_config('request.jwt.claims',$claims,false) c) select public.rpc_update_planned_deadlines('CCTB-MANUAL-MM/2026.01-PQ','$manual_mm_deadlines'::jsonb,'manual/manual A',7,true) from g where c is not null" "$tmp_dir/manual-mm-a.json" &
manual_mm_a_pid=$!
assert_backend_wait 'manual-mm-a.json' 'Timeout' 'PgSleep'
run_rpc "with g as (select set_config('request.jwt.claims',$claims,false) c) select public.rpc_update_planned_deadlines('CCTB-MANUAL-MM/2026.01-PQ','$manual_mm_deadlines'::jsonb,'manual/manual B',7,true) from g where c is not null" "$tmp_dir/manual-mm-b.json" &
manual_mm_b_pid=$!
assert_backend_lock_wait 'manual-mm-b.json'
wait "$manual_mm_a_pid"
wait "$manual_mm_b_pid"
node --input-type=module - "$tmp_dir/manual-mm-a.json" "$tmp_dir/manual-mm-b.json" <<'NODE'
import { readFileSync } from "node:fs";
const [first, second] = process.argv.slice(2).map((path) => JSON.parse(readFileSync(path, "utf8").trim().split("\n").at(-1)));
if (first.ok !== true || first.current_version !== 8) throw new Error(`manual/manual winner ${JSON.stringify(first)}`);
if (second.ok !== false || second.error_code !== "VERSION_CONFLICT" || second.current_version !== 8) {
  throw new Error(`manual/manual stale result ${JSON.stringify(second)}`);
}
NODE
if [[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" -c "select version=8 and deadline_protocol='2026-09-02' and deadline_validation='2026-09-16' and deadline_report='2026-09-23' and deadline_vmp='2026-10-01' and (select count(*) from public.audit_logs where validation_code='CCTB-MANUAL-MM/2026.01-PQ' and source='manual_planned_deadline_edit')=1 from public.vmp_plan_items where validation_code='CCTB-MANUAL-MM/2026.01-PQ'")" != "t" ]]; then
  echo "Manual/manual final state or audit mismatch." >&2
  exit 1
fi
echo "PASS CONCURRENCY manual/manual one winner one stale conflict"

manual_mc_deadlines='{"deadline_protocol":"2026-09-03","deadline_validation":"2026-09-17","deadline_report":"2026-09-24","deadline_vmp":"2026-10-02"}'
run_rpc "with g as (select set_config('request.jwt.claims',$claims,false) c) select public.rpc_update_planned_deadlines('CCTB-MANUAL-MC/2026.01-PQ','$manual_mc_deadlines'::jsonb,'manual/catalog manual winner',7,true) from g where c is not null" "$tmp_dir/manual-mc-manual.json" &
manual_mc_manual_pid=$!
assert_backend_wait 'manual-mc-manual.json' 'Timeout' 'PgSleep'
run_rpc "with g as (select set_config('request.jwt.claims',$claims,false) c) select public.rpc_apply_catalog_change_v2('a3000000-0000-4000-8000-000000000001','manual/catalog catalog stale',1,'[{\"validation_code\":\"CCTB-MANUAL-MC/2026.01-PQ\",\"expected_item_version\":7}]'::jsonb,true) from g where c is not null" "$tmp_dir/manual-mc-catalog.json" &
manual_mc_catalog_pid=$!
assert_backend_lock_wait 'manual-mc-catalog.json'
wait "$manual_mc_manual_pid"
wait "$manual_mc_catalog_pid"
node --input-type=module - "$tmp_dir/manual-mc-manual.json" "$tmp_dir/manual-mc-catalog.json" <<'NODE'
import { readFileSync } from "node:fs";
const [manual, catalog] = process.argv.slice(2).map((path) => JSON.parse(readFileSync(path, "utf8").trim().split("\n").at(-1)));
if (manual.ok !== true || manual.current_version !== 8) throw new Error(`manual/catalog manual winner ${JSON.stringify(manual)}`);
if (catalog.ok !== false || catalog.error_code !== "ITEM_STATE_CHANGED") {
  throw new Error(`manual/catalog catalog stale result ${JSON.stringify(catalog)}`);
}
NODE
if [[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" -c "select pi.version=8 and pi.deadline_protocol='2026-09-03' and pi.deadline_validation='2026-09-17' and pi.deadline_report='2026-09-24' and pi.deadline_vmp='2026-10-02' and ch.status='pending' and (select count(*) from public.audit_logs where validation_code=pi.validation_code and source='manual_planned_deadline_edit')=1 from public.vmp_plan_items pi cross join public.vmp_catalog_changes ch where pi.validation_code='CCTB-MANUAL-MC/2026.01-PQ' and ch.id='a3000000-0000-4000-8000-000000000001'")" != "t" ]]; then
  echo "Manual/catalog final state or audit mismatch." >&2
  exit 1
fi
psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" -c \
  "drop trigger manual_deadline_concurrency_pause on public.vmp_plan_items; drop function auth.manual_deadline_concurrency_pause()"
echo "PASS CONCURRENCY manual/catalog manual winner catalog stale conflict"

psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/tests/sql/manual-planned-deadline-security.sql"
psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/tests/sql/catalog-progressed-deadline-security.sql"

echo "PASS GREEN business fault-injection concurrency security ACL five-role ROLLBACK"

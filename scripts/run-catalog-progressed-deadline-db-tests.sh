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
test_database="vmp_catalog_deadline_${$}_${RANDOM}"

cleanup() {
  if [[ -n "${LOCAL_PGHOST:-}" && "$test_database" =~ ^vmp_catalog_deadline_[0-9]+_[0-9]+$ ]]; then
    PGHOST="$LOCAL_PGHOST" PGPORT="$LOCAL_PGPORT" PGUSER="$LOCAL_PGUSER" \
      PGPASSWORD="$LOCAL_PGPASSWORD" dropdb --if-exists --force "$test_database" \
      >/dev/null 2>&1 || true
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

psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/supabase/migrations/20260826130000_catalog_progressed_deadline_override.sql"
psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/tests/sql/catalog-progressed-deadline-override.sql"

# Committed setup is isolated to the disposable database so two real backend
# sessions can contend on the same advisory mutex and rows.
psql -X -v ON_ERROR_STOP=1 -v catalog_concurrency_setup=1 -d "$test_database" \
  -f "$repo_dir/tests/sql/catalog-progressed-deadline-override.sql"

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

hold_mutex() {
  local object_code="$1"
  psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" -c \
    "begin; set local statement_timeout='15s'; select public.vmp_lock_catalog_object_v2('Thiết bị','$object_code'); select pg_sleep(4); commit;" \
    >"$tmp_dir/barrier-$object_code.log" &
  mutex_pid=$!
}

claims="json_build_object('role','service_role')::text"

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

node - "$tmp_dir/apply-a.json" "$tmp_dir/apply-b.json" <<'NODE'
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

node - "$tmp_dir/save-apply-apply.json" "$tmp_dir/save-apply-save.json" <<'NODE'
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

psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
  -f "$repo_dir/tests/sql/catalog-progressed-deadline-security.sql"

echo "PASS GREEN business fault-injection concurrency security ROLLBACK"

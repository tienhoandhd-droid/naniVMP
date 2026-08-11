#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
forward_migration="$repo_dir/supabase/migrations/20260811120000_harden_canonical_source_writers.sql"
source_writer_test="$repo_dir/tests/sql/item-permission-source-writer-auth.sql"
full_test="$repo_dir/tests/sql/item-permissions.sql"

usage() {
  cat >&2 <<'USAGE'
Usage:
  SUPABASE_DB_URL=... scripts/test-item-permissions-sql.sh --final-state
  ITEM_PERMISSION_SQL_DEDICATED_DB_URL=... \
    scripts/test-item-permissions-sql.sh --forward-test \
    supabase/migrations/20260811120000_harden_canonical_source_writers.sql

--final-state runs no migration and requires the hardened final definitions.
--forward-test accepts exactly the explicit 111200 migration and requires the
separate dedicated-test URL variable. The script never infers clone safety and
never falls back to .env.local.
USAGE
}

die() {
  printf 'ITEM_PERMISSION_SQL_INPUT_ERROR: %s\n' "$1" >&2
  usage
  exit 64
}

[[ -x "$(command -v psql || true)" ]] || die 'psql không khả dụng'

run_mode=${1:-}
forward_file=
case "$run_mode" in
  --final-state)
    [[ $# -eq 1 ]] || die '--final-state không nhận migration input'
    [[ -n "${SUPABASE_DB_URL:-}" ]] || die '--final-state yêu cầu SUPABASE_DB_URL explicit'
    [[ -z "${ITEM_PERMISSION_SQL_DEDICATED_DB_URL:-}" ]] \
      || die 'hai database URL cùng được đặt; trạng thái input mơ hồ'
    db_url=$SUPABASE_DB_URL
    ;;
  --forward-test)
    [[ $# -eq 2 ]] || die '--forward-test yêu cầu đúng một migration path explicit'
    [[ -z "${SUPABASE_DB_URL:-}" ]] \
      || die '--forward-test từ chối SUPABASE_DB_URL chung; chỉ dùng URL test chuyên dụng'
    [[ -n "${ITEM_PERMISSION_SQL_DEDICATED_DB_URL:-}" ]] \
      || die '--forward-test yêu cầu ITEM_PERMISSION_SQL_DEDICATED_DB_URL'
    provided_file=$(realpath -e -- "$2") \
      || die 'migration input không tồn tại'
    [[ "$provided_file" == "$forward_migration" ]] \
      || die '--forward-test chỉ chấp nhận migration 20260811120000 explicit'
    forward_file=$provided_file
    db_url=$ITEM_PERMISSION_SQL_DEDICATED_DB_URL
    ;;
  *)
    die 'phải chọn chính xác --final-state hoặc --forward-test'
    ;;
esac

for required_file in "$source_writer_test" "$full_test"; do
  [[ -f "$required_file" ]] || die "thiếu SQL test: $required_file"
done

if [[ "$run_mode" == '--final-state' ]]; then
  read -r -d '' state_sql <<'SQL' || true
do $state$
declare
  v_set_hardened boolean;
  v_source_hardened boolean;
begin
  if public.item_permissions_mode() is distinct from 'preview' then
    raise exception '--final-state chỉ chạy khi item_permissions_mode=preview';
  end if;
  if to_regprocedure('public.rpc_set_item_performer_by_id(text,uuid,text)') is null
      or to_regprocedure('public.rpc_upsert_source_object(text,text,jsonb)') is null
      or to_regprocedure('public.vmp_manager_principal(uuid)') is null then
    raise exception '--final-state thiếu canonical writer/principal signatures';
  end if;
  select position(
    'vmp_manager_principal' in lower(pg_get_functiondef(
      'public.rpc_set_item_performer_by_id(text,uuid,text)'::regprocedure
    ))
  ) > 0 into v_set_hardened;
  select position(
    'vmp_manager_principal' in lower(pg_get_functiondef(
      'public.rpc_upsert_source_object(text,text,jsonb)'::regprocedure
    ))
  ) > 0 into v_source_hardened;
  if not v_set_hardened or not v_source_hardened then
    raise exception '--final-state nhận schema pre-111200; từ chối success mơ hồ';
  end if;
end
$state$;
SQL
else
  read -r -d '' state_sql <<'SQL' || true
do $state$
declare
  v_set_hardened boolean;
  v_source_hardened boolean;
begin
  if public.item_permissions_mode() is distinct from 'preview' then
    raise exception '--forward-test chỉ chạy khi item_permissions_mode=preview';
  end if;
  if to_regprocedure('public.rpc_set_item_performer_by_id(text,uuid,text)') is null
      or to_regprocedure('public.rpc_upsert_source_object(text,text,jsonb)') is null
      or to_regprocedure('public.vmp_manager_principal(uuid)') is null then
    raise exception '--forward-test thiếu repaired pre-111200 signatures';
  end if;
  select position(
    'vmp_manager_principal' in lower(pg_get_functiondef(
      'public.rpc_set_item_performer_by_id(text,uuid,text)'::regprocedure
    ))
  ) > 0 into v_set_hardened;
  select position(
    'vmp_manager_principal' in lower(pg_get_functiondef(
      'public.rpc_upsert_source_object(text,text,jsonb)'::regprocedure
    ))
  ) > 0 into v_source_hardened;
  if v_set_hardened or v_source_hardened then
    raise exception '--forward-test nhận schema đã/đang apply 111200; từ chối replay mơ hồ';
  end if;
end
$state$;
SQL
fi

read -r -d '' snapshot_sql <<'SQL' || true
drop table if exists pg_temp.item_permission_preflight_checksum;
drop table if exists pg_temp.item_permission_postflight_checksum;
create temp table item_permission_preflight_checksum (
  relation_name text primary key,
  row_count bigint not null,
  digest text not null
) on commit preserve rows;

insert into item_permission_preflight_checksum
select 'vmp_item_assignments', count(*),
       md5(coalesce(string_agg(md5(to_jsonb(row_data)::text), ''
         order by md5(to_jsonb(row_data)::text)), ''))
from public.vmp_item_assignments row_data
union all
select 'vmp_performers', count(*),
       md5(coalesce(string_agg(md5(to_jsonb(row_data)::text), ''
         order by md5(to_jsonb(row_data)::text)), ''))
from public.vmp_performers row_data
union all
select 'vmp_plan_items', count(*),
       md5(coalesce(string_agg(md5(to_jsonb(row_data)::text), ''
         order by md5(to_jsonb(row_data)::text)), ''))
from public.vmp_plan_items row_data
union all
select 'vmp_source_objects', count(*),
       md5(coalesce(string_agg(md5(to_jsonb(row_data)::text), ''
         order by md5(to_jsonb(row_data)::text)), ''))
from public.vmp_source_objects row_data;

select format(
  'ITEM_PERMISSION_SQL_CHECKSUM_BEFORE|%s|%s|%s',
  relation_name, row_count, digest
)
from item_permission_preflight_checksum
order by relation_name;
SQL

read -r -d '' postflight_sql <<'SQL' || true
create temp table item_permission_postflight_checksum (
  relation_name text primary key,
  row_count bigint not null,
  digest text not null
) on commit preserve rows;

insert into item_permission_postflight_checksum
select 'vmp_item_assignments', count(*),
       md5(coalesce(string_agg(md5(to_jsonb(row_data)::text), ''
         order by md5(to_jsonb(row_data)::text)), ''))
from public.vmp_item_assignments row_data
union all
select 'vmp_performers', count(*),
       md5(coalesce(string_agg(md5(to_jsonb(row_data)::text), ''
         order by md5(to_jsonb(row_data)::text)), ''))
from public.vmp_performers row_data
union all
select 'vmp_plan_items', count(*),
       md5(coalesce(string_agg(md5(to_jsonb(row_data)::text), ''
         order by md5(to_jsonb(row_data)::text)), ''))
from public.vmp_plan_items row_data
union all
select 'vmp_source_objects', count(*),
       md5(coalesce(string_agg(md5(to_jsonb(row_data)::text), ''
         order by md5(to_jsonb(row_data)::text)), ''))
from public.vmp_source_objects row_data;

do $postflight$
begin
  if public.item_permissions_mode() is distinct from 'preview' then
    raise exception 'Outer rollback không khôi phục item_permissions_mode=preview';
  end if;
  if exists (
    (select relation_name, row_count, digest
     from item_permission_preflight_checksum)
    except
    (select relation_name, row_count, digest
     from item_permission_postflight_checksum)
  ) or exists (
    (select relation_name, row_count, digest
     from item_permission_postflight_checksum)
    except
    (select relation_name, row_count, digest
     from item_permission_preflight_checksum)
  ) then
    raise exception 'Business checksum đổi sau outer rollback';
  end if;
end
$postflight$;

select format(
  'ITEM_PERMISSION_SQL_CHECKSUM_AFTER|%s|%s|%s',
  relation_name, row_count, digest
)
from item_permission_postflight_checksum
order by relation_name;
select 'ITEM_PERMISSION_SQL_ROLLBACK_CONFIRMED';
drop table pg_temp.item_permission_postflight_checksum;
drop table pg_temp.item_permission_preflight_checksum;
SQL

output_file=$(mktemp "${TMPDIR:-/tmp}/item-permission-sql.XXXXXX")
trap 'rm -f -- "$output_file"' EXIT

psql_args=(
  -X
  -v ON_ERROR_STOP=1
  -Atq
  -P pager=off
  -c "$state_sql"
  -c "$snapshot_sql"
  -c "begin; set local statement_timeout = '180s'; set local lock_timeout = '10s'; set local idle_in_transaction_session_timeout = '240s';"
)
if [[ -n "$forward_file" ]]; then
  psql_args+=(-c "select 'ITEM_PERMISSION_SQL_PHASE_FORWARD_111200';" -f "$forward_file")
fi
psql_args+=(
  -c "select 'ITEM_PERMISSION_SQL_PHASE_SOURCE_WRITER_AUTH';"
  -f "$source_writer_test"
  -f "$full_test"
  -c 'rollback'
  -c "$postflight_sql"
)

set +e
PGCONNECT_TIMEOUT=10 \
PGOPTIONS='-c statement_timeout=180000 -c lock_timeout=10000' \
  psql --dbname="$db_url" "${psql_args[@]}" 2>&1 | tee "$output_file"
psql_status=${PIPESTATUS[0]}
set -e
if (( psql_status != 0 )); then
  exit "$psql_status"
fi

required_markers=(
  ITEM_PERMISSION_SQL_PHASE_SOURCE_WRITER_AUTH
  ITEM_PERMISSION_SQL_PHASE_SCHEMA_CONTRACTS
  ITEM_PERMISSION_SQL_PHASE_CANONICAL_SCOPE
  ITEM_PERMISSION_SQL_PHASE_ENFORCED_RLS
  ITEM_PERMISSION_SQL_PHASE_QA_ASSIGNMENTS
  ITEM_PERMISSION_SQL_PHASE_SOURCE_RESOLUTION
  ITEM_PERMISSION_SQL_TESTS_COMPLETE
  ITEM_PERMISSION_SQL_ROLLBACK_CONFIRMED
)
if [[ "$run_mode" == '--forward-test' ]]; then
  required_markers+=(ITEM_PERMISSION_SQL_PHASE_FORWARD_111200)
fi
for marker in "${required_markers[@]}"; do
  [[ $(grep -Fxc "$marker" "$output_file") -eq 1 ]] \
    || die "thiếu hoặc lặp completion marker: $marker"
done

[[ $(grep -Fc 'ITEM_PERMISSION_SQL_CHECKSUM_BEFORE|' "$output_file") -eq 4 ]] \
  || die 'thiếu checksum preflight của bốn bảng nghiệp vụ'
[[ $(grep -Fc 'ITEM_PERMISSION_SQL_CHECKSUM_AFTER|' "$output_file") -eq 4 ]] \
  || die 'thiếu checksum postflight của bốn bảng nghiệp vụ'

printf 'ITEM_PERMISSION_SQL_HARNESS_COMPLETE|%s\n' "$run_mode"

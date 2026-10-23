#!/usr/bin/env bash

set -euo pipefail

phase="full"
if [[ $# -gt 0 ]]; then
  if [[ $# -ne 2 || "$1" != "--phase" ]]; then
    echo "Usage: $0 [--phase expand|enforce-failure-before-repair|enforce-failure-after-repair|behavior|security|performance|recovery]" >&2
    exit 2
  fi
  phase="$2"
fi
case "$phase" in
  full|expand|enforce-failure-before-repair|enforce-failure-after-repair|behavior|security|performance|recovery) ;;
  *)
    echo "Usage: $0 [--phase expand|enforce-failure-before-repair|enforce-failure-after-repair|behavior|security|performance|recovery]" >&2
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

psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" <<'SQL'
insert into auth.users(
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
select id,'authenticated','authenticated',email,'x',now(),'{}','{}',now(),now()
from (values
  ('9a040000-0000-4000-8000-000000000001'::uuid,'source-pre-expand-owner@example.test'),
  ('9a040000-0000-4000-8000-000000000002'::uuid,'source-pre-expand-support@example.test'),
  ('9a040000-0000-4000-8000-000000000003'::uuid,'source-pre-expand-conflict@example.test')
) fixture(id,email);

insert into public.departments(id,name,short_name)
values ('QA','Source pre-expand QA fixture','QA')
on conflict(id) do nothing;

insert into public.profiles(id,full_name,email,role,department,is_active)
select id,full_name,email,'department_user'::public.user_role,'QA',true
from (values
  ('9a040000-0000-4000-8000-000000000001'::uuid,
   'Source Pre-expand Owner','source-pre-expand-owner@example.test'),
  ('9a040000-0000-4000-8000-000000000002'::uuid,
   'Source Pre-expand Support','source-pre-expand-support@example.test'),
  ('9a040000-0000-4000-8000-000000000003'::uuid,
   'Source Pre-expand Conflict','source-pre-expand-conflict@example.test')
) fixture(id,full_name,email);

update public.vmp_performers
set department='QA',access_class='qa_progress_editor',is_active=true,
    scope_departments='{}'::text[],scope_factory_ids='{}'::uuid[],
    scope_area_ids='{}'::uuid[],scope_line_ids='{}'::uuid[]
where user_id between '9a040000-0000-4000-8000-000000000001'::uuid
                  and '9a040000-0000-4000-8000-000000000003'::uuid;

insert into public.vmp_objects(
  code,name,classification,department,area,line,frequency_months
)
values (
  'SACCESS-PRE-EXPAND','Source pre-expand rollback fixture','tb',
  'QA','SACCESS_PRE_AREA','SACCESS_PRE_LINE',12
);

insert into public.vmp_source_objects(
  id,object_kind,object_code,object_name,department,area_code,line,
  validate_flag,frequency_months,report_class,workdays,first_month,year_ref,
  source_tab,source_row,version,timeline_revision,timeline_applied_revision,
  owner_person_id,owner_name,support_person_id,support_name
)
select '9a040000-0000-4000-8000-000000000010','Thiết bị',
       'SACCESS-PRE-EXPAND','Source pre-expand rollback fixture','QA',
       'SACCESS_PRE_AREA','SACCESS_PRE_LINE','y',12,'Hóa lý',5,1,2026,
       'source-access-pre-expand',94010,1,0,0,
       owner_performer.id,owner_performer.performer_name,
       support_performer.id,support_performer.performer_name
from public.vmp_performers owner_performer
cross join public.vmp_performers support_performer
where owner_performer.user_id='9a040000-0000-4000-8000-000000000001'::uuid
  and support_performer.user_id='9a040000-0000-4000-8000-000000000002'::uuid;

insert into public.vmp_plan_items(
  id,validation_code,object_code,validation_type,year,report_class,effort_days,
  deadline_protocol,deadline_validation,deadline_report,deadline_vmp,
  status_protocol,status_validation,status_report,status_vmp,is_active,
  item_state,version,departments,execution_departments,source_sheet_data,
  owner_person_id,support_person_id
)
select 'SACCESS-PRE-EXPAND/2026.01-PQ','SACCESS-PRE-EXPAND/2026.01-PQ',
       'SACCESS-PRE-EXPAND','PQ',2026,'Hóa lý',5,
       current_date+30,current_date+60,current_date+90,current_date+120,
       'not_started','not_started','not_started','not_started',true,'active',1,
       array['QA'],array['QA'],'{"fixture":"source-access-pre-expand"}'::jsonb,
       owner_performer.id,support_performer.id
from public.vmp_performers owner_performer
cross join public.vmp_performers support_performer
where owner_performer.user_id='9a040000-0000-4000-8000-000000000001'::uuid
  and support_performer.user_id='9a040000-0000-4000-8000-000000000002'::uuid;

insert into public.vmp_item_assignments(
  validation_code,performer_id,user_id,staff_name,assignment_kind,source,
  assignment_role,is_active,change_reason,created_by,updated_by
)
select 'SACCESS-PRE-EXPAND/2026.01-PQ',performer.id,performer.user_id,
       performer.performer_name,'qa','qa_manager',fixture.assignment_role,true,
       fixture.reason,'9a040000-0000-4000-8000-000000000001',
       '9a040000-0000-4000-8000-000000000001'
from (values
  ('9a040000-0000-4000-8000-000000000002'::uuid,'collaborator',
   'Pre-expand support manual row must be replaced'),
  ('9a040000-0000-4000-8000-000000000003'::uuid,'primary',
   'Pre-expand conflicting primary must be demoted')
) fixture(user_id,assignment_role,reason)
join public.vmp_performers performer on performer.user_id=fixture.user_id;

do $pre_expand_fixture$
begin
  if (select count(*) from public.vmp_source_objects
      where object_code='SACCESS-PRE-EXPAND' and is_active)<>1
     or (select count(*) from public.vmp_plan_items
         where validation_code='SACCESS-PRE-EXPAND/2026.01-PQ' and is_active)<>1
     or (select count(*) from public.vmp_item_assignments
         where validation_code='SACCESS-PRE-EXPAND/2026.01-PQ' and is_active)<>2
     or exists (
       select 1 from public.vmp_item_assignments
       where validation_code='SACCESS-PRE-EXPAND/2026.01-PQ'
         and source in ('source_owner','source_support') and is_active
     ) then
    raise exception using errcode='check_violation',
      message='SACCESS_PRE_EXPAND_NONZERO_REPAIR_FIXTURE_INVALID';
  end if;
end
$pre_expand_fixture$;
\echo 'PASS PRE-EXPAND nonzero constraint-valid repair rollback fixture'
SQL

psql -X -v ON_ERROR_STOP=1 -d "$test_database" <<'SQL'
-- Existing Source selections can point at a performer that is no longer an
-- eligible QA principal. Keep this fixture in the pre-expand snapshot so both
-- migrations must accept and preserve it before the post-enforce SQL probes.
insert into auth.users(
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values (
  '9a060000-0000-4000-8000-000000000001','authenticated','authenticated',
  'source-ineligible-admin@example.test','x',now(),'{}','{}',now(),now()
);

insert into public.profiles(
  id,full_name,email,role,department,is_active
) values (
  '9a060000-0000-4000-8000-000000000001',
  'Source Ineligible Admin','source-ineligible-admin@example.test',
  'admin'::public.user_role,'QA',true
);

insert into public.vmp_performers(
  id,performer_name,email,department,is_active,user_id,access_class
)
select
  '9a060000-0000-4000-8000-000000000002',
  'Source Ineligible Admin','source-ineligible-admin@example.test',
  'QA',true,'9a060000-0000-4000-8000-000000000001','qa_progress_editor'
where not exists (
  select 1 from public.vmp_performers performer
  where performer.user_id='9a060000-0000-4000-8000-000000000001'
);

update public.vmp_performers
set performer_name='Source Ineligible Admin',
    email='source-ineligible-admin@example.test', department='QA',
    is_active=true, access_class='qa_progress_editor'
where user_id='9a060000-0000-4000-8000-000000000001';

insert into public.vmp_performers(
  performer_name,email,department,is_active,user_id,access_class
) values (
  'Source Ineligible Missing User','source-ineligible-missing@example.test',
  'QA',true,null,'qa_progress_editor'
);

insert into public.vmp_objects(
  code,name,classification,department,area,line,frequency_months
) values (
  'SACCESS-INELIGIBLE','Source ineligible relation fixture','tb',
  'QA','SACCESS_INELIGIBLE_AREA','SACCESS_INELIGIBLE_LINE',12
);

insert into public.vmp_source_objects(
  id,object_kind,object_code,object_name,department,area_code,line,
  validate_flag,frequency_months,report_class,workdays,first_month,year_ref,
  source_tab,source_row,version,timeline_revision,timeline_applied_revision,
  owner_person_id,owner_name,support_person_id,support_name
)
select '9a060000-0000-4000-8000-000000000101','Thiết bị',
       'SACCESS-INELIGIBLE','Source ineligible relation fixture','QA',
       'SACCESS_INELIGIBLE_AREA','SACCESS_INELIGIBLE_LINE','y',12,'Hóa lý',
       5,1,2026,'source-access-ineligible',96010,1,0,0,
       admin_performer.id,admin_performer.performer_name,
       missing_performer.id,missing_performer.performer_name
from public.vmp_performers admin_performer
cross join public.vmp_performers missing_performer
where admin_performer.user_id='9a060000-0000-4000-8000-000000000001'::uuid
  and missing_performer.email='source-ineligible-missing@example.test';

insert into public.vmp_plan_items(
  id,validation_code,object_code,validation_type,year,report_class,effort_days,
  deadline_protocol,deadline_validation,deadline_report,deadline_vmp,
  status_protocol,status_validation,status_report,status_vmp,is_active,
  item_state,version,departments,execution_departments,source_sheet_data,
  owner_person_id,support_person_id,owner_name,secondary_owner
)
select 'SACCESS-INELIGIBLE/2026.01-PQ',
       'SACCESS-INELIGIBLE/2026.01-PQ','SACCESS-INELIGIBLE','PQ',2026,
       'Hóa lý',5,current_date+30,current_date+60,current_date+90,
       current_date+120,'not_started','not_started','not_started','not_started',
       true,'active',1,array['QA'],array['QA'],
       '{"fixture":"source-access-ineligible"}'::jsonb,
       admin_performer.id,missing_performer.id,
       admin_performer.performer_name,missing_performer.performer_name
from public.vmp_performers admin_performer
cross join public.vmp_performers missing_performer
where admin_performer.user_id='9a060000-0000-4000-8000-000000000001'::uuid
  and missing_performer.email='source-ineligible-missing@example.test';
SQL

projection_state() {
  psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" <<'SQL'
with source_projection as (
  select count(*) row_count,
         encode(extensions.digest(convert_to(coalesce(string_agg(
           to_jsonb(source_object)::text,E'\n' order by source_object.id::text
         ),''),'UTF8'),'sha256'),'hex') row_digest
  from public.vmp_source_objects source_object
), plan_projection as (
  select count(*) row_count,
         encode(extensions.digest(convert_to(coalesce(string_agg(
           to_jsonb(plan_item)::text,E'\n' order by plan_item.id::text
         ),''),'UTF8'),'sha256'),'hex') row_digest
  from public.vmp_plan_items plan_item
), assignment_projection as (
  select count(*) row_count,
         encode(extensions.digest(convert_to(coalesce(string_agg(
           to_jsonb(assignment)::text,E'\n' order by assignment.id::text
         ),''),'UTF8'),'sha256'),'hex') row_digest
  from public.vmp_item_assignments assignment
)
select concat_ws('|',source_projection.row_count,source_projection.row_digest,
  plan_projection.row_count,plan_projection.row_digest,
  assignment_projection.row_count,assignment_projection.row_digest)
from source_projection cross join plan_projection cross join assignment_projection;
SQL
}

pre_expand_projection_state="$(projection_state)"
if [[ ! "$pre_expand_projection_state" =~ ^[1-9][0-9]*\|[0-9a-f]{64}\|[1-9][0-9]*\|[0-9a-f]{64}\|[1-9][0-9]*\|[0-9a-f]{64}$ ]]; then
  echo "SOURCE_ACCESS_PRE_EXPAND_PROJECTION_SNAPSHOT_INVALID" >&2
  exit 3
fi

expand_migration="$repo_dir/supabase/migrations/20260828140000_source_qa_workshop_access_expand.sql"
enforce_migration="$repo_dir/supabase/migrations/20260828150000_source_qa_workshop_access_enforce.sql"

assert_expand_state() {
  local rule_id="$1"
  local actual_projection_state

  # Deliberately reconnect after expand and after every aborted enforce attempt.
  psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" -v rule_id="$rule_id" <<'SQL'
select set_config('vmp.source_access_assert_rule',:'rule_id',false);
do $assert_expand_state$
declare
  v_rule_id text:=current_setting('vmp.source_access_assert_rule');
  v_function regprocedure:=to_regprocedure('public.rpc_refresh_source_item_assignments()');
  v_definition text;
  v_result jsonb;
  v_right record;
  v_ineligible_link_count integer;
begin
  if v_function is null then
    raise exception using errcode='check_violation',message=v_rule_id||' missing_stub';
  end if;
  select pg_get_functiondef(v_function::oid) into v_definition;
  if encode(extensions.digest(convert_to(v_definition,'UTF8'),'sha256'),'hex')
       <>'bce51a727187ff4544421391e4f1e03ee9e7336efa10e3ebfbcd71f7c71db3cd'
     or v_definition is distinct from $expected_stub$CREATE OR REPLACE FUNCTION public.rpc_refresh_source_item_assignments()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  return jsonb_build_object(
    'ok', false,
    'error_code', 'SOURCE_ACCESS_UPGRADE_IN_PROGRESS',
    'error', 'Nâng cấp quyền Source đang được áp dụng'
  );
end
$function$
$expected_stub$ then
    raise exception using errcode='check_violation',message=v_rule_id||' stub_definition';
  end if;
  select count(*) into v_ineligible_link_count
  from public.vmp_source_objects source_object
  join public.vmp_performers owner_performer
    on owner_performer.id=source_object.owner_person_id
   and owner_performer.user_id='9a060000-0000-4000-8000-000000000001'::uuid
  join public.vmp_performers missing_performer
    on missing_performer.id=source_object.support_person_id
   and missing_performer.email='source-ineligible-missing@example.test'
  where source_object.id='9a060000-0000-4000-8000-000000000101'::uuid
    and source_object.is_active
    and owner_performer.is_active
    and missing_performer.user_id is null;
  if v_ineligible_link_count <> 1 then
    raise exception using errcode='check_violation',message=v_rule_id||' ineligible_source_link count='||v_ineligible_link_count;
  end if;
  if not exists (
       select 1 from pg_proc procedure
       join pg_roles owner on owner.oid=procedure.proowner
       join pg_language language on language.oid=procedure.prolang
       where procedure.oid=v_function::oid
         and owner.rolname='postgres' and language.lanname='plpgsql'
         and procedure.provolatile='v' and procedure.prosecdef
         and procedure.proparallel='u' and not procedure.proisstrict
         and not procedure.proleakproof
         and procedure.proconfig=array['search_path=public, pg_temp']
         and procedure.proacl::text='{postgres=X/postgres}'
     )
     or (select count(*) from pg_proc procedure
         join pg_namespace namespace on namespace.oid=procedure.pronamespace
         where namespace.nspname='public'
           and procedure.proname='rpc_refresh_source_item_assignments')<>1
     or has_function_privilege('authenticated',v_function,'EXECUTE')
     or has_function_privilege('service_role',v_function,'EXECUTE')
     or has_function_privilege('anon',v_function,'EXECUTE')
     or has_function_privilege('public',v_function,'EXECUTE') then
    raise exception using errcode='check_violation',message=v_rule_id||' stub_acl_metadata';
  end if;
  v_result:=public.rpc_refresh_source_item_assignments();
  if v_result->>'ok' is distinct from 'false'
     or v_result->>'error_code' is distinct from 'SOURCE_ACCESS_UPGRADE_IN_PROGRESS' then
    raise exception using errcode='check_violation',message=v_rule_id||' owner_invocation';
  end if;

  -- Existing ineligible relations are display-only: preserve linked IDs and
  -- names, revoke all canonical Source labels, and grant no QA item rights.
  if exists (
       select 1 from public.vmp_item_assignments assignment
       where assignment.validation_code='SACCESS-INELIGIBLE/2026.01-PQ'
         and assignment.source in ('source_owner','source_support')
         and assignment.is_active
     ) then
    raise exception using errcode='check_violation',message=v_rule_id||' ineligible_canonical';
  end if;
  if not exists (
       select 1
       from public.vmp_plan_items item
       join public.vmp_source_objects source_object
         on source_object.object_code=item.object_code and source_object.is_active
       where item.validation_code='SACCESS-INELIGIBLE/2026.01-PQ'
         and item.owner_person_id=source_object.owner_person_id
         and item.support_person_id=source_object.support_person_id
         and item.owner_name=source_object.owner_name
         and item.secondary_owner=source_object.support_name
     ) then
    raise exception using errcode='check_violation',message=v_rule_id||' ineligible_display';
  end if;
  select * into strict v_right
  from public.vmp_item_rights(
    (select performer.id from public.vmp_performers performer
     where performer.user_id='71000000-0000-4000-8000-000000000001'::uuid
       and performer.is_active),
    'SACCESS-INELIGIBLE/2026.01-PQ');
  if v_right.can_view is not false
     or v_right.editable_fields is distinct from '{}'::text[] then
    raise exception using errcode='check_violation',message=v_rule_id||' ineligible_rights';
  end if;
end
$assert_expand_state$;
SQL

  actual_projection_state="$(projection_state)"
  if [[ "$actual_projection_state" != "$pre_expand_projection_state" ]]; then
    echo "$rule_id projection_changed expected=$pre_expand_projection_state actual=$actual_projection_state" >&2
    exit 1
  fi
  echo "PASS $rule_id exact stub owner-only ACL and unchanged real projections"
}

apply_expected_enforce_failure() {
  local failpoint="$1"
  local rule_id="$2"
  local failure_log="$tmp_dir/enforce-${failpoint}.log"
  local mutation_line post_repair_projection_state

  if PGOPTIONS="-c vmp.source_access_enforce_failpoint=$failpoint -c vmp.source_access_expected_projection_state=$pre_expand_projection_state" \
      psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
        -f "$enforce_migration" >"$failure_log" 2>&1; then
    echo "$rule_id expected enforce migration failure" >&2
    exit 1
  fi
  if ! grep -Fq "$rule_id" "$failure_log"; then
    sed -n '1,160p' "$failure_log" >&2
    echo "$rule_id missing injected failure marker" >&2
    exit 1
  fi
  if [[ "$failpoint" == "before_repair" ]] &&
      grep -Fq 'SACCESS_ENFORCE_REPAIR_REACHED' "$failure_log"; then
    sed -n '1,200p' "$failure_log" >&2
    echo "$rule_id crossed the repair boundary" >&2
    exit 1
  fi
  if [[ "$failpoint" == "after_repair_before_commit" ]]; then
    if ! grep -Fq 'SACCESS_ENFORCE_REPAIR_REACHED' "$failure_log"; then
      sed -n '1,200p' "$failure_log" >&2
      echo "$rule_id missing repair-reached marker" >&2
      exit 1
    fi
    mutation_line="$(grep -F 'SACCESS_ENFORCE_REPAIR_MUTATION_CONFIRMED' \
      "$failure_log" | tail -n 1)"
    if [[ "$mutation_line" != *"pre=$pre_expand_projection_state"* ||
          "$mutation_line" != *'fixture=SACCESS-PRE-EXPAND/2026.01-PQ'* ||
          "$mutation_line" != *'canonical_owner=1 canonical_support=1 manual_revoked=1 primary_demoted=1'* ]]; then
      sed -n '1,200p' "$failure_log" >&2
      echo "$rule_id missing exact in-transaction repair evidence" >&2
      exit 1
    fi
    post_repair_projection_state="${mutation_line#* post=}"
    post_repair_projection_state="${post_repair_projection_state%% *}"
    if [[ ! "$post_repair_projection_state" =~ ^[1-9][0-9]*\|[0-9a-f]{64}\|[1-9][0-9]*\|[0-9a-f]{64}\|[1-9][0-9]*\|[0-9a-f]{64}$ ||
          "$post_repair_projection_state" == "$pre_expand_projection_state" ]]; then
      echo "$rule_id repair evidence did not contain a changed valid projection digest" >&2
      exit 1
    fi
  fi
  assert_expand_state "$rule_id"
}

if [[ "$phase" == "expand" ]]; then
  if [[ ! -f "$expand_migration" ]]; then
    echo "Missing expand migration for --phase expand." >&2
    exit 4
  fi
  psql -X -v ON_ERROR_STOP=1 -d "$test_database" -f "$expand_migration"
  assert_expand_state 'SACCESS_EXPAND_STUB_FAILS_CLOSED'
elif [[ "$phase" == "enforce-failure-before-repair" ||
        "$phase" == "enforce-failure-after-repair" ]]; then
  if [[ ! -f "$expand_migration" || ! -f "$enforce_migration" ]]; then
    echo "Both Source access migrations are required for --phase $phase." >&2
    exit 4
  fi
  psql -X -v ON_ERROR_STOP=1 -d "$test_database" -f "$expand_migration"
  assert_expand_state 'SACCESS_EXPAND_STUB_FAILS_CLOSED'
  if [[ "$phase" == "enforce-failure-before-repair" ]]; then
    apply_expected_enforce_failure \
      'before_repair' 'SACCESS_ENFORCE_FAILURE_BEFORE_REPAIR_ROLLS_BACK'
  else
    apply_expected_enforce_failure \
      'after_repair_before_commit' 'SACCESS_ENFORCE_FAILURE_AFTER_REPAIR_ROLLS_BACK'
  fi
elif [[ "$phase" != "full" ]]; then
  if [[ ! -f "$expand_migration" || ! -f "$enforce_migration" ]]; then
    echo "Both Source access migrations are required for --phase $phase." >&2
    exit 4
  fi
  psql -X -v ON_ERROR_STOP=1 -d "$test_database" -f "$expand_migration"
  assert_expand_state 'SACCESS_EXPAND_STUB_FAILS_CLOSED'
  apply_expected_enforce_failure \
    'before_repair' 'SACCESS_ENFORCE_FAILURE_BEFORE_REPAIR_ROLLS_BACK'
  apply_expected_enforce_failure \
    'after_repair_before_commit' 'SACCESS_ENFORCE_FAILURE_AFTER_REPAIR_ROLLS_BACK'
  psql -X -v ON_ERROR_STOP=1 -d "$test_database" -f "$enforce_migration"
else
  [[ ! -f "$expand_migration" ]] || {
    psql -X -v ON_ERROR_STOP=1 -d "$test_database" -f "$expand_migration"
    assert_expand_state 'SACCESS_EXPAND_STUB_FAILS_CLOSED'
  }
  [[ ! -f "$enforce_migration" ]] || {
    apply_expected_enforce_failure \
      'before_repair' 'SACCESS_ENFORCE_FAILURE_BEFORE_REPAIR_ROLLS_BACK'
    apply_expected_enforce_failure \
      'after_repair_before_commit' 'SACCESS_ENFORCE_FAILURE_AFTER_REPAIR_ROLLS_BACK'
    psql -X -v ON_ERROR_STOP=1 -d "$test_database" -f "$enforce_migration"
  }
fi

if [[ "$phase" == "recovery" ]]; then
  # Recovery postconditions require one active persona for each preserved and
  # denied boundary. Keep these identities local to the disposable clone.
  psql -X -v ON_ERROR_STOP=1 -d "$test_database" <<'SQL'
insert into auth.users(
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('9a070000-0000-4000-8000-000000000001','authenticated','authenticated',
   'source-recovery-admin@example.test','x',now(),'{}','{}',now(),now()),
  ('9a070000-0000-4000-8000-000000000002','authenticated','authenticated',
   'source-recovery-manager@example.test','x',now(),'{}','{}',now(),now()),
  ('9a070000-0000-4000-8000-000000000003','authenticated','authenticated',
   'source-recovery-workshop@example.test','x',now(),'{}','{}',now(),now());

insert into public.profiles(id,full_name,email,role,department,is_active)
values
  ('9a070000-0000-4000-8000-000000000001','Source Recovery Admin',
   'source-recovery-admin@example.test','admin'::public.user_role,'QA',true),
  ('9a070000-0000-4000-8000-000000000002','Source Recovery QA Manager',
   'source-recovery-manager@example.test','qa_manager'::public.user_role,'QA',true),
  ('9a070000-0000-4000-8000-000000000003','Source Recovery Workshop',
   'source-recovery-workshop@example.test','department_user'::public.user_role,'QA',true);

update public.vmp_performers
set performer_name=case user_id
      when '9a070000-0000-4000-8000-000000000001' then 'Source Recovery Admin'
      when '9a070000-0000-4000-8000-000000000002' then 'Source Recovery QA Manager'
      else 'Source Recovery Workshop' end,
    email=case user_id
      when '9a070000-0000-4000-8000-000000000001' then 'source-recovery-admin@example.test'
      when '9a070000-0000-4000-8000-000000000002' then 'source-recovery-manager@example.test'
      else 'source-recovery-workshop@example.test' end,
    department='QA',is_active=true,
    access_class=case user_id
      when '9a070000-0000-4000-8000-000000000001' then 'view_only'
      when '9a070000-0000-4000-8000-000000000002' then 'qa_manager'
      else 'workshop_staff' end
where user_id in (
  '9a070000-0000-4000-8000-000000000001',
  '9a070000-0000-4000-8000-000000000002',
  '9a070000-0000-4000-8000-000000000003'
);

do $$
begin
  if (select count(*) from public.vmp_performers
      where user_id in (
        '9a070000-0000-4000-8000-000000000001',
        '9a070000-0000-4000-8000-000000000002',
        '9a070000-0000-4000-8000-000000000003')
        and is_active)<>3 then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_RECOVERY_PERSONA_PERFORMERS_MISSING';
  end if;
end
$$;
SQL
  recovery_artifact="$repo_dir/scripts/forward-recover-source-qa-workshop-access.sql"
  recovery_log="$tmp_dir/recovery.log"
  if ! psql -X -qAt -v ON_ERROR_STOP=1 -d "$test_database" \
      -f "$recovery_artifact" >"$recovery_log" 2>&1; then
    sed -n '1,240p' "$recovery_log" >&2
    echo "SOURCE_ACCESS_RECOVERY_PHASE_FAILED" >&2
    exit 1
  fi
  if ! grep -Fxq 'PASS SOURCE_ACCESS_RECOVERY' "$recovery_log"; then
    sed -n '1,240p' "$recovery_log" >&2
    echo "SOURCE_ACCESS_RECOVERY_FINAL_SELECT_MISSING" >&2
    exit 1
  fi
  echo "PASS SOURCE_ACCESS_RECOVERY_FINAL_SELECT"
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
  enforce-failure-before-repair|enforce-failure-after-repair)
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
  recovery)
    ;;
  full)
    run_behavior behavior
    psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
      -f "$repo_dir/tests/sql/source-qa-workshop-access-security.sql"
    psql -X -v ON_ERROR_STOP=1 -d "$test_database" \
      -f "$repo_dir/tests/sql/source-qa-workshop-access-performance.sql"
    ;;
esac

if [[ "$phase" == "recovery" ]]; then
  echo "PASS SOURCE ACCESS phase=recovery disposable forward-only suite"
else
  echo "PASS SOURCE ACCESS phase=$phase rollback-only suites"
fi

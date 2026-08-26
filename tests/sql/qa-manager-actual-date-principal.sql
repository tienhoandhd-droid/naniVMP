\set ON_ERROR_STOP on

begin;
set local lock_timeout='3s';
set local statement_timeout='60s';

create function pg_temp.assert_true(p_condition boolean,p_rule_id text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition,false) then
    raise exception using errcode='check_violation',message=p_rule_id;
  end if;
end
$$;

create function pg_temp.assert_code(p_actual jsonb,p_code text,p_rule_id text)
returns void language plpgsql as $$
begin
  if p_actual->>'ok' is distinct from 'false'
     or p_actual->>'code' is distinct from p_code then
    raise exception using errcode='check_violation',
      message=format('%s expected=%s actual=%s',p_rule_id,p_code,p_actual);
  end if;
end
$$;

create function pg_temp.assert_unchanged(
  p_before jsonb,p_audit_count integer,p_validation_code text,p_rule_id text
)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_after jsonb;
begin
  select to_jsonb(item) into v_after from public.vmp_plan_items item
  where validation_code=p_validation_code;
  if v_after is distinct from p_before
     or (select count(*) from public.audit_logs
         where validation_code=p_validation_code)<>p_audit_count then
    raise exception using errcode='check_violation',message=p_rule_id;
  end if;
end
$$;

create function pg_temp.audit_ids(p_validation_code text)
returns uuid[] language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(array_agg(id),'{}'::uuid[])
  from public.audit_logs where validation_code=p_validation_code
$$;

create function pg_temp.only_new_audit(p_validation_code text,p_old_ids uuid[])
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select to_jsonb(audit) from public.audit_logs audit
  where validation_code=p_validation_code and not (id=any(p_old_ids))
$$;

insert into auth.users (
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
select id,'authenticated','authenticated',email,'x',now(),'{}','{}',now(),now()
from (values
  ('97000000-0000-4000-8000-000000000001'::uuid,'qa-upper@example.test'),
  ('97000000-0000-4000-8000-000000000002'::uuid,'qa-lower@example.test'),
  ('97000000-0000-4000-8000-000000000003'::uuid,'qa-wrong-dept@example.test'),
  ('97000000-0000-4000-8000-000000000004'::uuid,'qa-wrong-access@example.test'),
  ('97000000-0000-4000-8000-000000000005'::uuid,'qa-no-link@example.test'),
  ('97000000-0000-4000-8000-000000000006'::uuid,'qa-inactive-profile@example.test'),
  ('97000000-0000-4000-8000-000000000007'::uuid,'qa-inactive-person@example.test'),
  ('97000000-0000-4000-8000-000000000008'::uuid,'qa-duplicate-link@example.test')
) fixture(id,email);

insert into public.departments(id,name,short_name)
values ('QA','QA uppercase principal fixture','QA'),
       ('qa','QA lowercase principal fixture','qa'),
       ('OPS-QA-NEG','Wrong QA principal department','OPSQ')
on conflict(id) do nothing;

insert into public.profiles(id,full_name,email,role,department,is_active)
select id,name,email,'qa_manager'::public.user_role,department,is_active
from (values
  ('97000000-0000-4000-8000-000000000001'::uuid,'QA Upper','qa-upper@example.test','QA',true),
  ('97000000-0000-4000-8000-000000000002'::uuid,'QA Lower','qa-lower@example.test','qa',true),
  ('97000000-0000-4000-8000-000000000003'::uuid,'QA Wrong Dept','qa-wrong-dept@example.test','OPS-QA-NEG',true),
  ('97000000-0000-4000-8000-000000000004'::uuid,'QA Wrong Access','qa-wrong-access@example.test','QA',true),
  ('97000000-0000-4000-8000-000000000005'::uuid,'QA No Link','qa-no-link@example.test','QA',true),
  ('97000000-0000-4000-8000-000000000006'::uuid,'QA Inactive Profile','qa-inactive-profile@example.test','QA',false),
  ('97000000-0000-4000-8000-000000000007'::uuid,'QA Inactive Person','qa-inactive-person@example.test','QA',true),
  ('97000000-0000-4000-8000-000000000008'::uuid,'QA Duplicate Link','qa-duplicate-link@example.test','QA',true)
) fixture(id,name,email,department,is_active);

update public.vmp_performers set
  department=case
    when user_id='97000000-0000-4000-8000-000000000002'::uuid then 'qa'
    when user_id='97000000-0000-4000-8000-000000000003'::uuid then 'OPS-QA-NEG'
    else 'QA'
  end,
  access_class=case
    when user_id='97000000-0000-4000-8000-000000000004'::uuid
      then 'qa_progress_editor'
    else 'qa_manager'
  end,
  is_active=user_id<>'97000000-0000-4000-8000-000000000007'::uuid
where user_id between '97000000-0000-4000-8000-000000000001'::uuid
                  and '97000000-0000-4000-8000-000000000008'::uuid;
update public.vmp_performers set user_id=null
where user_id='97000000-0000-4000-8000-000000000005'::uuid;

insert into public.vmp_objects(code,name,classification,department,frequency_months)
values ('QA-ACTUAL','QA actual date active fixture','tb','QA',12),
       ('QA-ACTUAL-INACTIVE','QA actual date inactive fixture','tb','QA',12);
insert into public.vmp_plan_items(
  id,validation_code,object_code,validation_type,year,report_class,effort_days,
  deadline_protocol,deadline_validation,deadline_report,deadline_vmp,
  status_protocol,status_validation,status_report,status_vmp,
  is_active,item_state,version,departments,execution_departments,source_sheet_data
)
values
  ('QA-ACTUAL/2026.01-PQ','QA-ACTUAL/2026.01-PQ','QA-ACTUAL','PQ',2026,'Hóa lý',5,
   current_date+30,current_date+60,current_date+90,current_date+120,
   'not_started','not_started','not_started','not_started',true,'active',7,
   array['QA'],array['QA'],'{"fixture":"qa-actual-active"}'),
  ('QA-ACTUAL-INACTIVE/2026.01-PQ','QA-ACTUAL-INACTIVE/2026.01-PQ','QA-ACTUAL-INACTIVE','PQ',2026,'Hóa lý',5,
   current_date+30,current_date+60,current_date+90,current_date+120,
   'not_started','not_started','not_started','not_started',false,'active',3,
   array['QA'],array['QA'],'{"fixture":"qa-actual-inactive"}');

update public.system_config set value=to_jsonb('enforced'::text)
where key='item_permissions_mode';

select set_config('request.jwt.claims',json_build_object(
  'sub','97000000-0000-4000-8000-000000000001','role','authenticated')::text,true);

select pg_temp.assert_true(
  public.vmp_business_role(auth.uid())='qa_manager',
  'QA_MANAGER_UPPERCASE_BUSINESS_ROLE_FIXTURE');
select pg_temp.assert_true(
  (select principal_kind from public.vmp_manager_principal(auth.uid()))='qa_manager',
  'QA_MANAGER_UPPERCASE_PRINCIPAL_RED');

set local role authenticated;

do $rights$
declare v_right record;
begin
  select * into v_right from public.vmp_my_item_rights('QA-ACTUAL/2026.01-PQ');
  if v_right.can_view is not true
     or v_right.editable_fields is distinct from array[
       'actual_protocol_date','status_protocol',
       'actual_validation_date','status_validation',
       'actual_report_date','status_report',
       'actual_vmp_date','status_vmp']::text[]
     or v_right.editable_fields && array[
       'scheduled_at','deadline_protocol','deadline_validation',
       'deadline_report','deadline_vmp']::text[] then
    raise exception using errcode='check_violation',
      message='QA_MANAGER_EXACT_EIGHT_FIELDS '||to_jsonb(v_right)::text;
  end if;
end
$rights$;

do $success$
declare
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_audit_ids uuid[];
  v_audit jsonb;
begin
  select to_jsonb(item) into v_before from public.vmp_plan_items item
  where validation_code='QA-ACTUAL/2026.01-PQ';
  v_audit_ids:=pg_temp.audit_ids('QA-ACTUAL/2026.01-PQ');
  v_result:=public.rpc_update_progress(
    'QA-ACTUAL/2026.01-PQ',jsonb_build_object('actual_protocol_date',current_date),
    '  QA manager actual date  ',null,7);
  if v_result is distinct from jsonb_build_object(
       'ok',true,'validation_code','QA-ACTUAL/2026.01-PQ',
       'msg','Đã cập nhật thành công','reason_logged',true,
       'outbox_id',null,'version',8) then
    raise exception using errcode='check_violation',
      message='QA_MANAGER_ACTUAL_DATE_SUCCESS '||v_result::text;
  end if;
  select to_jsonb(item) into v_after from public.vmp_plan_items item
  where validation_code='QA-ACTUAL/2026.01-PQ';
  if v_after->>'actual_protocol_date' is distinct from current_date::text
     or v_after->>'version' is distinct from '8'
     or (v_after-array['actual_protocol_date','version','updated_at','updated_by'])
        is distinct from
        (v_before-array['actual_protocol_date','version','updated_at','updated_by']) then
    raise exception using errcode='check_violation',
      message='QA_MANAGER_ACTUAL_DATE_ROW_POSTSTATE';
  end if;
  v_audit:=pg_temp.only_new_audit('QA-ACTUAL/2026.01-PQ',v_audit_ids);
  if (v_audit->>'user_id')::uuid is distinct from auth.uid()
     or v_audit->>'action' is distinct from 'UPDATE'
     or v_audit->'changed_fields' is distinct from
        to_jsonb(array['actual_protocol_date']::text[])
     or v_audit->>'change_reason' is distinct from '  QA manager actual date  '
     or v_audit->>'source' is distinct from 'dashboard_rpc'
     or v_audit->>'effective_business_role' is distinct from 'qa_manager'
     or v_audit->'old_data' is distinct from v_before
     or v_audit->'new_data' is distinct from v_after then
    raise exception using errcode='check_violation',
      message='QA_MANAGER_ACTUAL_DATE_AUDIT '||coalesce(v_audit::text,'null');
  end if;
end
$success$;

do $denials$
declare
  v_before jsonb;
  v_result jsonb;
  v_audit_count integer;
begin
  select to_jsonb(item) into v_before from public.vmp_plan_items item
  where validation_code='QA-ACTUAL/2026.01-PQ';
  v_audit_count:=cardinality(pg_temp.audit_ids('QA-ACTUAL/2026.01-PQ'));

  v_result:=public.rpc_update_progress('QA-ACTUAL/2026.01-PQ',
    jsonb_build_object('scheduled_at',clock_timestamp()+interval '1 day'),
    'forbidden schedule',null,8);
  perform pg_temp.assert_code(v_result,'item_field_forbidden','QA_MANAGER_SCHEDULE_FORBIDDEN');
  perform pg_temp.assert_unchanged(v_before,v_audit_count,'QA-ACTUAL/2026.01-PQ','QA_MANAGER_SCHEDULE_ATOMIC');

  v_result:=public.rpc_update_progress('QA-ACTUAL/2026.01-PQ',
    jsonb_build_object('deadline_protocol',current_date+1),
    'forbidden deadline',null,8);
  perform pg_temp.assert_code(v_result,'item_field_forbidden','QA_MANAGER_DEADLINE_FORBIDDEN');
  perform pg_temp.assert_unchanged(v_before,v_audit_count,'QA-ACTUAL/2026.01-PQ','QA_MANAGER_DEADLINE_ATOMIC');

  v_result:=public.rpc_update_progress('QA-ACTUAL/2026.01-PQ',
    jsonb_build_object('actual_validation_date',current_date,'deadline_vmp',current_date+150),
    'mixed forbidden patch',null,8);
  perform pg_temp.assert_code(v_result,'item_field_forbidden','QA_MANAGER_MIXED_FORBIDDEN');
  perform pg_temp.assert_unchanged(v_before,v_audit_count,'QA-ACTUAL/2026.01-PQ','QA_MANAGER_MIXED_ATOMIC');

  v_result:=public.rpc_update_progress('QA-ACTUAL/2026.01-PQ',
    jsonb_build_object('actual_validation_date',current_date+1),
    'future actual',null,8);
  perform pg_temp.assert_code(v_result,'ngay_tuong_lai','QA_MANAGER_FUTURE_ACTUAL_FORBIDDEN');
  perform pg_temp.assert_unchanged(v_before,v_audit_count,'QA-ACTUAL/2026.01-PQ','QA_MANAGER_FUTURE_ATOMIC');

  v_result:=public.rpc_update_progress('QA-ACTUAL/2026.01-PQ',
    jsonb_build_object('actual_validation_date',current_date),null,null,8);
  if v_result->>'ok' is distinct from 'false'
     or v_result->>'error' not like 'Cần nhập LÝ DO%' then
    raise exception using errcode='check_violation',
      message='QA_MANAGER_REASON_REQUIRED '||v_result::text;
  end if;
  perform pg_temp.assert_unchanged(v_before,v_audit_count,'QA-ACTUAL/2026.01-PQ','QA_MANAGER_REASON_ATOMIC');

  v_result:=public.rpc_update_progress('QA-ACTUAL/2026.01-PQ',
    jsonb_build_object('actual_validation_date',current_date),
    'stale writer',null,7);
  perform pg_temp.assert_code(v_result,'version_conflict','QA_MANAGER_STALE_VERSION');
  perform pg_temp.assert_unchanged(v_before,v_audit_count,'QA-ACTUAL/2026.01-PQ','QA_MANAGER_STALE_ATOMIC');
end
$denials$;

reset role;
select set_config('request.jwt.claims',json_build_object(
  'sub','97000000-0000-4000-8000-000000000002','role','authenticated')::text,true);
select pg_temp.assert_true(
  public.vmp_business_role(auth.uid())='qa_manager'
  and (select principal_kind from public.vmp_manager_principal(auth.uid()))='qa_manager'
  and (select can_view from public.vmp_item_rights(
    auth.uid(),'QA-ACTUAL/2026.01-PQ')),
  'QA_MANAGER_LOWERCASE_STILL_ALLOWED');
do $fail_closed$
declare
  v_uid uuid;
  v_right record;
begin
  foreach v_uid in array array[
    '97000000-0000-4000-8000-000000000003'::uuid,
    '97000000-0000-4000-8000-000000000004'::uuid,
    '97000000-0000-4000-8000-000000000005'::uuid,
    '97000000-0000-4000-8000-000000000006'::uuid,
    '97000000-0000-4000-8000-000000000007'::uuid
  ] loop
    select * into v_right from public.vmp_item_rights(v_uid,'QA-ACTUAL/2026.01-PQ');
    if public.vmp_business_role(v_uid) is not null
       or coalesce(v_right.can_view,false) then
      raise exception using errcode='check_violation',
        message='QA_MANAGER_INVALID_PRINCIPAL_NOT_FAIL_CLOSED '||v_uid;
    end if;
  end loop;
  select * into v_right from public.vmp_item_rights(
    '97000000-0000-4000-8000-000000000001','QA-ACTUAL-INACTIVE/2026.01-PQ');
  if coalesce(v_right.can_view,false) then
    raise exception using errcode='check_violation',
      message='QA_MANAGER_INACTIVE_ITEM_NOT_FAIL_CLOSED';
  end if;
end
$fail_closed$;

savepoint duplicate_link;
drop index public.vmp_performers_one_active_per_user;
drop index public.vmp_performers_user_id_uniq;
insert into public.vmp_performers(
  performer_name,email,department,is_active,user_id,employee_code,access_class
)
select performer_name||' duplicate','qa-duplicate-2@example.test',department,true,user_id,
       'QA-DUP-2',access_class
from public.vmp_performers
where user_id='97000000-0000-4000-8000-000000000008'::uuid;
select pg_temp.assert_true(
  public.vmp_business_role('97000000-0000-4000-8000-000000000008') is null
  and not (select can_view from public.vmp_item_rights(
    '97000000-0000-4000-8000-000000000008','QA-ACTUAL/2026.01-PQ')),
  'QA_MANAGER_DUPLICATE_LINK_FAIL_CLOSED');
rollback to duplicate_link;

\echo 'PASS BUSINESS QA Manager actual-date exact eight allowlist atomic denies audit version principal negatives'
rollback;

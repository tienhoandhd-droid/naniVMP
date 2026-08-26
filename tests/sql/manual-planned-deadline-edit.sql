\set ON_ERROR_STOP on

\if :{?manual_concurrency_setup}
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

insert into public.vmp_source_objects (
  id,object_kind,object_code,object_name,department,validate_flag,
  frequency_months,report_class,workdays,first_month,year_ref,
  source_tab,source_row,version,timeline_revision,timeline_applied_revision
)
values (
  'a4000000-0000-4000-8000-000000000001','Thiết bị','CCTB-MANUAL-MC',
  'Manual/catalog concurrency',null,'y',12,'Hóa lý',5,3,2025,
  'test',401,1,1,0
);
insert into public.vmp_objects (code,name,classification,frequency_months)
values ('CCTB-MANUAL-MM','Manual/manual concurrency','tb',12),
       ('CCTB-MANUAL-MC','Manual/catalog concurrency','tb',12);
insert into public.vmp_plan_items (
  id,validation_code,object_code,validation_type,year,report_class,
  effort_days,deadline_protocol,deadline_validation,deadline_report,
  deadline_vmp,actual_validation_date,status_validation,version,
  departments,owner_name,source_sheet_data
)
values
  ('CCTB-MANUAL-MM/2026.01-PQ','CCTB-MANUAL-MM/2026.01-PQ','CCTB-MANUAL-MM','PQ',2026,'Hóa lý',5,
   '2026-06-30','2026-07-31','2026-08-15','2026-08-31',null,'not_started',7,array['QA'],'Manual MM','{"fixture":"manual-manual"}'),
  ('CCTB-MANUAL-MC/2026.01-PQ','CCTB-MANUAL-MC/2026.01-PQ','CCTB-MANUAL-MC','PQ',2026,'Hóa lý',5,
   '2026-06-30','2026-07-31','2026-08-15','2026-08-31','2026-03-20','completed',7,array['QA'],'Manual MC','{"fixture":"manual-catalog"}');
insert into public.vmp_catalog_changes (
  id,object_kind,object_code,source_version,timeline_revision,old_data,new_data
)
values (
  'a3000000-0000-4000-8000-000000000001','Thiết bị','CCTB-MANUAL-MC',1,1,'{}','{"first_month":3}'
);

create function auth.manual_deadline_concurrency_pause()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.validation_code in ('CCTB-MANUAL-MM/2026.01-PQ','CCTB-MANUAL-MC/2026.01-PQ')
     and current_setting('app.audit_source',true)='manual_planned_deadline_edit' then
    perform pg_sleep(4);
  end if;
  return new;
end
$$;
create trigger manual_deadline_concurrency_pause
before update on public.vmp_plan_items
for each row execute function auth.manual_deadline_concurrency_pause();
commit;
\quit
\endif

begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create function pg_temp.assert_true(p_condition boolean, p_rule_id text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception using errcode='check_violation', message=p_rule_id;
  end if;
end
$$;

create function pg_temp.assert_code(p_actual jsonb, p_code text, p_rule_id text)
returns void language plpgsql as $$
begin
  if p_actual->>'ok' is distinct from 'false'
     or p_actual->>'error_code' is distinct from p_code then
    raise exception using errcode='check_violation',
      message=format('%s expected_code=%s actual=%s',p_rule_id,p_code,p_actual);
  end if;
end
$$;

create function pg_temp.assert_json(p_actual jsonb, p_expected jsonb, p_rule_id text)
returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception using errcode='check_violation',
      message=format('%s expected=%s actual=%s',p_rule_id,p_expected,p_actual);
  end if;
end
$$;

insert into auth.users (
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
values
  ('96000000-0000-4000-8000-000000000001','authenticated','authenticated','manual-admin@example.test','x',now(),'{}','{}',now(),now()),
  ('96000000-0000-4000-8000-000000000002','authenticated','authenticated','manual-qa-manager@example.test','x',now(),'{}','{}',now(),now()),
  ('96000000-0000-4000-8000-000000000003','authenticated','authenticated','manual-qa-staff@example.test','x',now(),'{}','{}',now(),now()),
  ('96000000-0000-4000-8000-000000000004','authenticated','authenticated','manual-inactive@example.test','x',now(),'{}','{}',now(),now()),
  ('96000000-0000-4000-8000-000000000005','authenticated','authenticated','manual-unresolved@example.test','x',now(),'{}','{}',now(),now()),
  ('96000000-0000-4000-8000-000000000006','authenticated','authenticated','manual-workshop-manager@example.test','x',now(),'{}','{}',now(),now()),
  ('96000000-0000-4000-8000-000000000007','authenticated','authenticated','manual-workshop-staff@example.test','x',now(),'{}','{}',now(),now());

insert into public.departments (id,name,short_name)
values ('QA','Manual deadline QA fixture','QA'),
       ('MANUAL_WS','Manual deadline workshop fixture','MWS');

insert into public.profiles (id,full_name,email,role,department,is_active)
values
  ('96000000-0000-4000-8000-000000000001','Manual Admin','manual-admin@example.test','admin','QA',true),
  ('96000000-0000-4000-8000-000000000002','Manual QA Manager','manual-qa-manager@example.test','qa_manager','QA',true),
  ('96000000-0000-4000-8000-000000000003','Manual QA Staff','manual-qa-staff@example.test','department_user','QA',true),
  ('96000000-0000-4000-8000-000000000004','Manual Inactive','manual-inactive@example.test','qa_manager','QA',false),
  ('96000000-0000-4000-8000-000000000005','Manual Unresolved','manual-unresolved@example.test','qa_manager','QA',true),
  ('96000000-0000-4000-8000-000000000006','Manual Workshop Manager','manual-workshop-manager@example.test','department_user','MANUAL_WS',true),
  ('96000000-0000-4000-8000-000000000007','Manual Workshop Staff','manual-workshop-staff@example.test','department_user','MANUAL_WS',true);

update public.vmp_performers
set department=case
      when user_id in ('96000000-0000-4000-8000-000000000005'::uuid,
                       '96000000-0000-4000-8000-000000000006'::uuid,
                       '96000000-0000-4000-8000-000000000007'::uuid)
        then 'MANUAL_WS'
      else 'qa'
    end,
    access_class=case user_id
      when '96000000-0000-4000-8000-000000000002'::uuid then 'qa_manager'
      when '96000000-0000-4000-8000-000000000003'::uuid then 'qa_progress_editor'
      when '96000000-0000-4000-8000-000000000004'::uuid then 'qa_manager'
      when '96000000-0000-4000-8000-000000000005'::uuid then 'qa_manager'
      when '96000000-0000-4000-8000-000000000006'::uuid then 'equipment_manager'
      when '96000000-0000-4000-8000-000000000007'::uuid then 'workshop_staff'
    end
where user_id in (
  '96000000-0000-4000-8000-000000000002'::uuid,
  '96000000-0000-4000-8000-000000000003'::uuid,
  '96000000-0000-4000-8000-000000000004'::uuid,
  '96000000-0000-4000-8000-000000000005'::uuid,
  '96000000-0000-4000-8000-000000000006'::uuid,
  '96000000-0000-4000-8000-000000000007'::uuid
);

select pg_temp.assert_true(
  public.vmp_business_role('96000000-0000-4000-8000-000000000001')='admin'
  and public.vmp_business_role('96000000-0000-4000-8000-000000000002')='qa_manager'
  and public.vmp_business_role('96000000-0000-4000-8000-000000000003')='qa_staff'
  and public.vmp_business_role('96000000-0000-4000-8000-000000000006')='workshop_manager'
  and public.vmp_business_role('96000000-0000-4000-8000-000000000007')='workshop_staff'
  and public.vmp_business_role('96000000-0000-4000-8000-000000000005') is null,
  'MANUAL_AUTH_FIXTURE_EXACT_FIVE_ROLES');

insert into public.vmp_objects (code,name,classification,department,frequency_months)
values
  ('MANUAL','Manual primary','tb','QA',12),
  ('MANUAL-INACTIVE','Manual inactive','tb','QA',12),
  ('MANUAL-CANCELLED','Manual cancelled','tb','QA',12),
  ('MANUAL-STALE','Manual stale','tb','QA',12),
  ('MANUAL-ASSIGN','Manual assignment stale','tb','QA',12),
  ('MANUAL-NULL','Manual null','tb','QA',12),
  ('MANUAL-FAULT','Manual fault','tb','QA',12);

insert into public.vmp_plan_items (
  id,validation_code,object_code,validation_type,year,report_class,effort_days,
  deadline_protocol,deadline_validation,deadline_report,deadline_vmp,
  actual_protocol_date,actual_validation_date,actual_report_date,actual_vmp_date,
  status_protocol,status_validation,status_report,status_vmp,
  owner_name,secondary_owner,is_active,item_state,version,departments,
  execution_departments,source_sheet_data,work_group
)
values
  ('MANUAL/2026.01-PQ','MANUAL/2026.01-PQ','MANUAL','PQ',2026,'Hóa lý',5,
   '2026-09-01','2026-09-15','2026-09-22','2026-09-30',
   '2026-01-10','2026-02-10',null,null,
   'completed','completed','in_progress','not_started',
   'Protected Owner','Protected Secondary',true,'active',7,array['QA'],array['QA'],'{"protected":"primary"}','WG-PROTECTED'),
  ('MANUAL-INACTIVE/2026.01-PQ','MANUAL-INACTIVE/2026.01-PQ','MANUAL-INACTIVE','PQ',2026,'Hóa lý',5,
   '2026-09-01','2026-09-15','2026-09-22','2026-09-30',null,null,null,null,
   'not_started','not_started','not_started','not_started',null,null,false,'active',2,array['QA'],array['QA'],'{}','WG-I'),
  ('MANUAL-CANCELLED/2026.01-PQ','MANUAL-CANCELLED/2026.01-PQ','MANUAL-CANCELLED','PQ',2026,'Hóa lý',5,
   '2026-09-01','2026-09-15','2026-09-22','2026-09-30',null,null,null,null,
   'not_started','not_started','not_started','not_started',null,null,true,'cancelled',3,array['QA'],array['QA'],'{}','WG-C'),
  ('MANUAL-STALE/2026.01-PQ','MANUAL-STALE/2026.01-PQ','MANUAL-STALE','PQ',2026,'Hóa lý',5,
   '2026-09-01','2026-09-15','2026-09-22','2026-09-30',null,null,null,null,
   'not_started','not_started','not_started','not_started',null,null,true,'active',4,array['QA'],array['QA'],'{}','WG-S'),
  ('MANUAL-ASSIGN/2026.01-PQ','MANUAL-ASSIGN/2026.01-PQ','MANUAL-ASSIGN','PQ',2026,'Hóa lý',5,
   '2026-09-01','2026-09-15','2026-09-22','2026-09-30',null,null,null,null,
   'not_started','not_started','not_started','not_started',null,null,true,'active',5,array['QA'],array['QA'],'{}','WG-A'),
  ('MANUAL-NULL/2026.01-PQ','MANUAL-NULL/2026.01-PQ','MANUAL-NULL','PQ',2026,'Hóa lý',5,
   null,null,null,null,null,null,null,null,
   'not_started','not_started','not_started','not_started',null,null,true,'active',4,array['QA'],array['QA'],'{}','WG-N'),
  ('MANUAL-FAULT/2026.01-PQ','MANUAL-FAULT/2026.01-PQ','MANUAL-FAULT','PQ',2026,'Hóa lý',5,
   '2026-09-01','2026-09-15','2026-09-22','2026-09-30',null,null,null,null,
   'not_started','not_started','not_started','not_started','Fault Owner',null,true,'active',6,array['QA'],array['QA'],'{}','WG-F');

update public.system_config set value=to_jsonb('enforced'::text)
where key='item_permissions_mode';
insert into public.vmp_item_assignments (
  validation_code,performer_id,user_id,staff_name,assignment_kind,source,
  assignment_role,is_active,change_reason,created_by,updated_by
)
select 'MANUAL-STALE/2026.01-PQ',p.id,p.user_id,p.performer_name,'qa','qa_manager',
       'primary',true,'Manual deadline progress-writer fixture',
       '96000000-0000-4000-8000-000000000001'::uuid,
       '96000000-0000-4000-8000-000000000001'::uuid
from public.vmp_performers p
where p.user_id='96000000-0000-4000-8000-000000000003'::uuid and p.is_active;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','96000000-0000-4000-8000-000000000001','role','authenticated')::text,true);

-- RED reaches a real authenticated fixture and fails only because the exact
-- public signature has not been installed yet.
select pg_temp.assert_code(
  public.rpc_update_planned_deadlines(
    'MANUAL/2026.01-PQ','null'::jsonb,null,null,null),
  'INVALID_DEADLINE_PAYLOAD','MANUAL_RED_EXACT_SIGNATURE');

-- Active-session and effective-role denial precede payload and item lookup.
select set_config('request.jwt.claims',
  json_build_object('sub','96000000-0000-4000-8000-000000000004','role','authenticated')::text,true);
select pg_temp.assert_code(
  public.rpc_update_planned_deadlines(null,null,null,null,null),
  'ACCOUNT_DISABLED','MANUAL_ACCOUNT_DISABLED_PRECEDENCE');

select set_config('request.jwt.claims',
  json_build_object('sub','96000000-0000-4000-8000-000000000005','role','authenticated')::text,true);
select pg_temp.assert_true(
  auth.uid()='96000000-0000-4000-8000-000000000005'::uuid
  and auth.role()='authenticated'
  and public.vmp_current_session_is_active() is not true,
  'MANUAL_UNRESOLVED_FIXTURE_SESSION_STATE uid='||coalesce(auth.uid()::text,'NULL')
    ||' role='||coalesce(auth.role(),'NULL')
    ||' active='||coalesce(public.vmp_current_session_is_active()::text,'NULL'));
select pg_temp.assert_code(
  public.rpc_update_planned_deadlines(null,null,null,null,null),
  'ROLE_UNRESOLVED','MANUAL_ROLE_UNRESOLVED_PRECEDENCE');

do $denied_roles$
declare
  v_uid uuid;
begin
  foreach v_uid in array array[
    '96000000-0000-4000-8000-000000000003'::uuid,
    '96000000-0000-4000-8000-000000000006'::uuid,
    '96000000-0000-4000-8000-000000000007'::uuid
  ] loop
    perform set_config('request.jwt.claims',
      json_build_object('sub',v_uid,'role','authenticated')::text,true);
    perform pg_temp.assert_code(
      public.rpc_update_planned_deadlines(null,null,null,null,null),
      'FORBIDDEN','MANUAL_FIVE_ROLE_DENIAL_'||v_uid);
  end loop;
end
$denied_roles$;

select set_config('request.jwt.claims',
  json_build_object('sub','96000000-0000-4000-8000-000000000001','role','authenticated')::text,true);

-- Exact four-key object and strict ISO date/null scalars.
do $payload$
declare
  v_payload jsonb;
begin
  foreach v_payload in array array[
    null::jsonb,
    'null'::jsonb,
    '[]'::jsonb,
    '{"deadline_protocol":"2026-09-02"}'::jsonb,
    '{"deadline_protocol":"2026-09-02","deadline_validation":"2026-09-16","deadline_report":"2026-09-23","deadline_vmp":"2026-10-01","extra":null}'::jsonb,
    '{"deadline_protocol":1,"deadline_validation":"2026-09-16","deadline_report":"2026-09-23","deadline_vmp":"2026-10-01"}'::jsonb,
    '{"deadline_protocol":"2026-9-02","deadline_validation":"2026-09-16","deadline_report":"2026-09-23","deadline_vmp":"2026-10-01"}'::jsonb,
    '{"deadline_protocol":"2026-02-30","deadline_validation":"2026-09-16","deadline_report":"2026-09-23","deadline_vmp":"2026-10-01"}'::jsonb
  ] loop
    perform pg_temp.assert_code(
      public.rpc_update_planned_deadlines('MANUAL/2026.01-PQ',v_payload,'reason',7,true),
      'INVALID_DEADLINE_PAYLOAD','MANUAL_EXACT_PAYLOAD_'||coalesce(v_payload::text,'SQL_NULL'));
  end loop;
end
$payload$;

select pg_temp.assert_code(
  public.rpc_update_planned_deadlines('MANUAL/2026.01-PQ',
    '{"deadline_protocol":"2026-09-02","deadline_validation":"2026-09-16","deadline_report":"2026-09-23","deadline_vmp":"2026-10-01"}',
    'reason',null,true),
  'EXPECTED_REVISION_REQUIRED','MANUAL_EXPECTED_REVISION_PRECEDENCE');
select pg_temp.assert_code(
  public.rpc_update_planned_deadlines('MANUAL/2026.01-PQ',
    '{"deadline_protocol":"2026-09-02","deadline_validation":"2026-09-16","deadline_report":"2026-09-23","deadline_vmp":"2026-10-01"}',
    '  ',7,true),
  'REASON_REQUIRED','MANUAL_REASON_PRECEDENCE');
select pg_temp.assert_code(
  public.rpc_update_planned_deadlines('MANUAL/2026.01-PQ',
    '{"deadline_protocol":"2026-09-02","deadline_validation":"2026-09-16","deadline_report":"2026-09-23","deadline_vmp":"2026-10-01"}',
    'reason',7,false),
  'CONFIRMATION_REQUIRED','MANUAL_CONFIRMATION_PRECEDENCE');

select pg_temp.assert_code(
  public.rpc_update_planned_deadlines('MANUAL-MISSING/2026.01-PQ',
    '{"deadline_protocol":"2026-09-02","deadline_validation":"2026-09-16","deadline_report":"2026-09-23","deadline_vmp":"2026-10-01"}',
    'reason',7,true),
  'ITEM_NOT_FOUND','MANUAL_ITEM_NOT_FOUND');
select pg_temp.assert_code(
  public.rpc_update_planned_deadlines('MANUAL-INACTIVE/2026.01-PQ',
    '{"deadline_protocol":null,"deadline_validation":null,"deadline_report":null,"deadline_vmp":null}',
    'reason',999,true),
  'ITEM_STATE_INACTIVE','MANUAL_INACTIVE_BEFORE_VERSION_AND_ERASURE');
select pg_temp.assert_code(
  public.rpc_update_planned_deadlines('MANUAL-CANCELLED/2026.01-PQ',
    '{"deadline_protocol":null,"deadline_validation":null,"deadline_report":null,"deadline_vmp":null}',
    'reason',999,true),
  'ITEM_STATE_INACTIVE','MANUAL_LIFECYCLE_BEFORE_VERSION_AND_ERASURE');
select pg_temp.assert_code(
  public.rpc_update_planned_deadlines('MANUAL/2026.01-PQ',
    '{"deadline_protocol":null,"deadline_validation":"2026-08-01","deadline_report":"2026-07-01","deadline_vmp":"2026-06-01"}',
    'reason',999,true),
  'VERSION_CONFLICT','MANUAL_VERSION_BEFORE_ERASURE_AND_ORDER');
select pg_temp.assert_code(
  public.rpc_update_planned_deadlines('MANUAL/2026.01-PQ',
    '{"deadline_protocol":null,"deadline_validation":"2026-09-16","deadline_report":"2026-09-23","deadline_vmp":"2026-10-01"}',
    'reason',7,true),
  'DEADLINE_ERASURE_FORBIDDEN','MANUAL_ERASURE_FORBIDDEN');
select pg_temp.assert_code(
  public.rpc_update_planned_deadlines('MANUAL/2026.01-PQ',
    '{"deadline_protocol":"2026-09-20","deadline_validation":null,"deadline_report":"2026-09-10","deadline_vmp":"2026-10-01"}',
    'reason',7,true),
  'DEADLINE_ERASURE_FORBIDDEN','MANUAL_ERASURE_PRECEDES_ORDER');
select pg_temp.assert_code(
  public.rpc_update_planned_deadlines('MANUAL/2026.01-PQ',
    '{"deadline_protocol":"2026-09-20","deadline_validation":"2026-09-16","deadline_report":"2026-09-23","deadline_vmp":"2026-10-01"}',
    'reason',7,true),
  'DEADLINE_ORDER_INVALID','MANUAL_NONDECREASING_ORDER');
select pg_temp.assert_code(
  public.rpc_update_planned_deadlines('MANUAL/2026.01-PQ',
    '{"deadline_protocol":"2026-09-01","deadline_validation":"2026-09-15","deadline_report":"2026-09-22","deadline_vmp":"2026-09-30"}',
    'reason',7,true),
  'NO_ACTIONABLE_CHANGE','MANUAL_NOOP');

-- A real canonical assignment writer advances the owning item's revision and
-- invalidates the stale manual snapshot even though no planned deadline changed.
do $assignment_writer$
declare
  v_before jsonb;
  v_after jsonb;
  v_assignment jsonb;
  v_manual jsonb;
  v_target uuid;
begin
  select to_jsonb(pi) into v_before from public.vmp_plan_items pi
  where validation_code='MANUAL-ASSIGN/2026.01-PQ';
  select id into strict v_target from public.vmp_performers
  where user_id='96000000-0000-4000-8000-000000000003'::uuid and is_active;
  v_assignment:=public.rpc_set_item_assignment(
    v_target,'MANUAL-ASSIGN/2026.01-PQ','qa','collaborator','assign',
    'assignment invalidates displayed revision',null);
  if coalesce((v_assignment->>'ok')::boolean,false) is not true then
    raise exception using errcode='check_violation',
      message='MANUAL_ASSIGNMENT_WRITER_FAILED '||v_assignment::text;
  end if;
  select to_jsonb(pi) into v_after from public.vmp_plan_items pi
  where validation_code='MANUAL-ASSIGN/2026.01-PQ';
  if (v_after-array['version','updated_at'])
       is distinct from (v_before-array['version','updated_at'])
     or v_after->>'version' is distinct from '6' then
    raise exception using errcode='check_violation',
      message='MANUAL_ASSIGNMENT_DID_NOT_INVALIDATE '||v_after::text;
  end if;
  v_manual:=public.rpc_update_planned_deadlines(
    'MANUAL-ASSIGN/2026.01-PQ',
    '{"deadline_protocol":"2026-09-02","deadline_validation":"2026-09-16","deadline_report":"2026-09-23","deadline_vmp":"2026-10-01"}',
    'stale after assignment',5,true);
  perform pg_temp.assert_json(v_manual,
    '{"ok":false,"error_code":"VERSION_CONFLICT","error":"Hạng mục đã đổi sau khi tải dữ liệu","validation_code":"MANUAL-ASSIGN/2026.01-PQ","expected_version":5,"current_version":6,"requires_reload":true}',
    'MANUAL_STALE_AFTER_ASSIGNMENT_WRITER');
end
$assignment_writer$;

-- Assignment invalidation has its own preservation flag and must not leak an
-- empty audit source into a later item mutation in the same transaction.
reset role;
do $assignment_audit_context$
declare
  v_audit_ids uuid[];
  v_audit public.audit_logs%rowtype;
begin
  select coalesce(array_agg(id),'{}'::uuid[]) into v_audit_ids
  from public.audit_logs where validation_code='MANUAL-ASSIGN/2026.01-PQ';
  update public.vmp_plan_items set owner_name='Owner after assignment'
  where validation_code='MANUAL-ASSIGN/2026.01-PQ';
  select * into strict v_audit from public.audit_logs
  where validation_code='MANUAL-ASSIGN/2026.01-PQ'
    and not (id=any(v_audit_ids));
  if v_audit.source is distinct from 'trigger'
     or v_audit.changed_fields is distinct from array['owner_name']::text[] then
    raise exception using errcode='check_violation',
      message='MANUAL_ASSIGNMENT_AUDIT_CONTEXT_LEAK '||to_jsonb(v_audit)::text;
  end if;
end
$assignment_audit_context$;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','96000000-0000-4000-8000-000000000001','role','authenticated')::text,true);

-- A real progress writer advances the universal row revision and invalidates
-- the stale manual snapshot even though no planned deadline changed.
select set_config('request.jwt.claims',
  json_build_object('sub','96000000-0000-4000-8000-000000000003','role','authenticated')::text,true);
do $progress_writer$
declare
  v_progress jsonb;
  v_manual jsonb;
begin
  v_progress:=public.rpc_update_progress(
    'MANUAL-STALE/2026.01-PQ','{"status_report":"in_progress"}',null,null,5);
  if coalesce((v_progress->>'ok')::boolean,false) is not true
     or (select version from public.vmp_plan_items
         where validation_code='MANUAL-STALE/2026.01-PQ')<>6 then
    raise exception using errcode='check_violation',
      message='MANUAL_PROGRESS_WRITER_DID_NOT_ADVANCE '||v_progress::text;
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub','96000000-0000-4000-8000-000000000001',
                      'role','authenticated')::text,true);
  v_manual:=public.rpc_update_planned_deadlines(
    'MANUAL-STALE/2026.01-PQ',
    '{"deadline_protocol":"2026-09-02","deadline_validation":"2026-09-16","deadline_report":"2026-09-23","deadline_vmp":"2026-10-01"}',
    'stale after progress',5,true);
  perform pg_temp.assert_json(v_manual,
    '{"ok":false,"error_code":"VERSION_CONFLICT","error":"Hạng mục đã đổi sau khi tải dữ liệu","validation_code":"MANUAL-STALE/2026.01-PQ","expected_version":5,"current_version":6,"requires_reload":true}',
    'MANUAL_STALE_AFTER_PROGRESS_WRITER');
end
$progress_writer$;
select set_config('request.jwt.claims',
  json_build_object('sub','96000000-0000-4000-8000-000000000001','role','authenticated')::text,true);
reset role;

-- Admin success proves exact +1, complete return snapshot, protected equality,
-- and one exact audit row. The reason is trimmed at the boundary.
do $admin_success$
declare
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_audit_ids uuid[];
  v_audit jsonb;
begin
  select to_jsonb(pi) into v_before from public.vmp_plan_items pi
  where validation_code='MANUAL/2026.01-PQ';
  select coalesce(array_agg(id),'{}'::uuid[]) into v_audit_ids
  from public.audit_logs where validation_code='MANUAL/2026.01-PQ';

  v_result:=public.rpc_update_planned_deadlines(
    'MANUAL/2026.01-PQ',
    '{"deadline_protocol":"2026-09-02","deadline_validation":"2026-09-16","deadline_report":"2026-09-23","deadline_vmp":"2026-10-01"}',
    '  Điều chỉnh thủ công  ',7,true);
  perform pg_temp.assert_json(v_result,'{
    "ok":true,"validation_code":"MANUAL/2026.01-PQ",
    "old_deadlines":{"deadline_protocol":"2026-09-01","deadline_validation":"2026-09-15","deadline_report":"2026-09-22","deadline_vmp":"2026-09-30"},
    "new_deadlines":{"deadline_protocol":"2026-09-02","deadline_validation":"2026-09-16","deadline_report":"2026-09-23","deadline_vmp":"2026-10-01"},
    "changed_fields":["deadline_protocol","deadline_validation","deadline_report","deadline_vmp"],
    "previous_version":7,"current_version":8,
    "actor_id":"96000000-0000-4000-8000-000000000001","effective_role":"admin",
    "reason":"Điều chỉnh thủ công","protected_fields_preserved":true
  }','MANUAL_ADMIN_SUCCESS_LITERAL');

  select to_jsonb(pi) into v_after from public.vmp_plan_items pi
  where validation_code='MANUAL/2026.01-PQ';
  if (v_after-array['deadline_protocol','deadline_validation','deadline_report','deadline_vmp',
                    'version','updated_at','updated_by'])
       is distinct from
     (v_before-array['deadline_protocol','deadline_validation','deadline_report','deadline_vmp',
                     'version','updated_at','updated_by']) then
    raise exception using errcode='check_violation',message='MANUAL_ADMIN_PROTECTED_SNAPSHOT';
  end if;
  select to_jsonb(a) into strict v_audit from public.audit_logs a
  where a.validation_code='MANUAL/2026.01-PQ' and not (a.id=any(v_audit_ids));
  if v_audit->>'user_id' is distinct from '96000000-0000-4000-8000-000000000001'
     or v_audit->>'action' is distinct from 'DEADLINE_CHANGE'
     or v_audit->>'source' is distinct from 'manual_planned_deadline_edit'
     or v_audit->>'change_reason' is distinct from 'Điều chỉnh thủ công'
     or v_audit->>'effective_business_role' is distinct from 'admin'
     or v_audit->'old_data' is distinct from v_before
     or v_audit->'new_data' is distinct from v_after
     or (select array_agg(value order by value)
         from jsonb_array_elements_text(v_audit->'changed_fields'))
        is distinct from array['deadline_protocol','deadline_report','deadline_validation','deadline_vmp'] then
    raise exception using errcode='check_violation',
      message='MANUAL_ADMIN_AUDIT_EXACT '||to_jsonb(v_audit)::text;
  end if;
end
$admin_success$;

-- QA Manager is the other human role. A stale duplicate is not retried and
-- cannot create a second update/audit record.
select set_config('request.jwt.claims',
  json_build_object('sub','96000000-0000-4000-8000-000000000002','role','authenticated')::text,true);
do $qa_success_and_duplicate$
declare
  v_result jsonb;
  v_duplicate jsonb;
  v_audit_count integer;
begin
  v_result:=public.rpc_update_planned_deadlines(
    'MANUAL/2026.01-PQ',
    '{"deadline_protocol":"2026-09-02","deadline_validation":"2026-09-16","deadline_report":"2026-09-23","deadline_vmp":"2026-10-02"}',
    'QA correction',8,true);
  if coalesce((v_result->>'ok')::boolean,false) is not true
     or v_result->>'effective_role' is distinct from 'qa_manager'
     or v_result->'changed_fields' is distinct from '["deadline_vmp"]'::jsonb
     or v_result->>'current_version' is distinct from '9' then
    raise exception using errcode='check_violation',message='MANUAL_QA_MANAGER_SUCCESS '||v_result::text;
  end if;
  select count(*) into v_audit_count from public.audit_logs
  where validation_code='MANUAL/2026.01-PQ';
  v_duplicate:=public.rpc_update_planned_deadlines(
    'MANUAL/2026.01-PQ',
    '{"deadline_protocol":"2026-09-02","deadline_validation":"2026-09-16","deadline_report":"2026-09-23","deadline_vmp":"2026-10-02"}',
    'duplicate request',8,true);
  perform pg_temp.assert_json(v_duplicate,
    '{"ok":false,"error_code":"VERSION_CONFLICT","error":"Hạng mục đã đổi sau khi tải dữ liệu","validation_code":"MANUAL/2026.01-PQ","expected_version":8,"current_version":9,"requires_reload":true}',
    'MANUAL_DUPLICATE_NO_RETRY');
  if (select version from public.vmp_plan_items where validation_code='MANUAL/2026.01-PQ')<>9
     or (select count(*) from public.audit_logs where validation_code='MANUAL/2026.01-PQ')<>v_audit_count then
    raise exception using errcode='check_violation',message='MANUAL_DUPLICATE_MUTATED';
  end if;
end
$qa_success_and_duplicate$;

-- Unchanged legacy nulls remain legal; past non-null dates are accepted and
-- non-null order is checked across null gaps.
with result as (
  select public.rpc_update_planned_deadlines(
    'MANUAL-NULL/2026.01-PQ',
    '{"deadline_protocol":null,"deadline_validation":"2020-01-10","deadline_report":null,"deadline_vmp":"2020-01-30"}',
    'retain legacy nulls',4,true) payload
)
select pg_temp.assert_true(
  (payload->>'ok')::boolean,
  'MANUAL_LEGACY_NULL_AND_PAST_ALLOWED actual='||payload::text)
from result;

-- A protected-column mutation injected after the revision trigger must be
-- detected after update+audit and roll the entire subtransaction back.
savepoint fault_injection;
create function auth.manual_deadline_fault()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.validation_code='MANUAL-FAULT/2026.01-PQ'
     and current_setting('app.audit_source',true)='manual_planned_deadline_edit' then
    new.owner_name:='CORRUPTED';
  end if;
  return new;
end
$$;
create trigger zz_manual_deadline_fault
before update on public.vmp_plan_items
for each row execute function auth.manual_deadline_fault();
do $fault$
declare
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_audit_count integer;
begin
  select to_jsonb(pi) into v_before from public.vmp_plan_items pi
  where validation_code='MANUAL-FAULT/2026.01-PQ';
  select count(*) into v_audit_count from public.audit_logs
  where validation_code='MANUAL-FAULT/2026.01-PQ';
  v_result:=public.rpc_update_planned_deadlines(
    'MANUAL-FAULT/2026.01-PQ',
    '{"deadline_protocol":"2026-09-02","deadline_validation":"2026-09-16","deadline_report":"2026-09-23","deadline_vmp":"2026-10-01"}',
    'fault injection',6,true);
  perform pg_temp.assert_json(v_result,
    '{"ok":false,"error_code":"WRITE_MISMATCH","error":"Không thể ghi nguyên tử; toàn bộ thay đổi đã được hoàn tác"}',
    'MANUAL_FAULT_WRITE_MISMATCH');
  select to_jsonb(pi) into v_after from public.vmp_plan_items pi
  where validation_code='MANUAL-FAULT/2026.01-PQ';
  if v_after is distinct from v_before
     or (select count(*) from public.audit_logs
         where validation_code='MANUAL-FAULT/2026.01-PQ')<>v_audit_count then
    raise exception using errcode='check_violation',message='MANUAL_FAULT_NOT_ROLLED_BACK';
  end if;
end
$fault$;
rollback to fault_injection;

-- The reviewed service_role exception is explicit. Automation has no user UUID,
-- so a success following a human edit must not inherit that human audit actor.
reset role;
select set_config('request.jwt.claims',json_build_object('role','service_role')::text,true);
do $service_success$
declare
  v_result jsonb;
  v_audit_count integer;
  v_audit public.audit_logs%rowtype;
begin
  if (select updated_by from public.vmp_plan_items
      where validation_code='MANUAL/2026.01-PQ')
     is distinct from '96000000-0000-4000-8000-000000000002'::uuid then
    raise exception using errcode='check_violation',
      message='MANUAL_SERVICE_PRIOR_HUMAN_ACTOR_FIXTURE';
  end if;
  select count(*) into v_audit_count from public.audit_logs
  where validation_code='MANUAL/2026.01-PQ';
  v_result:=public.rpc_update_planned_deadlines(
    'MANUAL/2026.01-PQ',
    '{"deadline_protocol":"2026-09-02","deadline_validation":"2026-09-16","deadline_report":"2026-09-24","deadline_vmp":"2026-10-02"}',
    'service automation correction',9,true);
  if coalesce((v_result->>'ok')::boolean,false) is not true
     or v_result->'actor_id' is distinct from 'null'::jsonb
     or v_result->>'effective_role' is distinct from 'service_role'
     or v_result->>'current_version' is distinct from '10' then
    raise exception using errcode='check_violation',
      message='MANUAL_SERVICE_SUCCESS '||v_result::text;
  end if;
  select * into strict v_audit from public.audit_logs
  where validation_code='MANUAL/2026.01-PQ'
    and source='manual_planned_deadline_edit'
    and change_reason='service automation correction';
  if v_audit.user_id is not null
     or v_audit.effective_business_role is distinct from 'service_role'
     or (select updated_by from public.vmp_plan_items
         where validation_code='MANUAL/2026.01-PQ') is not null
     or (select count(*) from public.audit_logs
         where validation_code='MANUAL/2026.01-PQ')<>v_audit_count+1 then
    raise exception using errcode='check_violation',
      message='MANUAL_SERVICE_AUDIT_ACTOR '||to_jsonb(v_audit)::text;
  end if;
end
$service_success$;

select pg_temp.assert_code(
  public.rpc_update_planned_deadlines('MANUAL-MISSING/2026.01-PQ',
    '{"deadline_protocol":"2026-09-02","deadline_validation":"2026-09-16","deadline_report":"2026-09-23","deadline_vmp":"2026-10-01"}',
    'service automation',1,true),
  'ITEM_NOT_FOUND','MANUAL_SERVICE_ROLE_EXCEPTION_EXPLICIT');

\echo 'PASS BUSINESS manual planned-deadline authorization validation audit fault rollback five-role'
rollback;

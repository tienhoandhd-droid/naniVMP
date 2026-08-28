\set ON_ERROR_STOP on

begin;
set local lock_timeout='3s';
set local statement_timeout='120s';

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
     or coalesce(p_actual->>'error_code',p_actual->>'code') is distinct from p_code then
    raise exception using errcode='check_violation',
      message=format('%s expected=%s actual=%s',p_rule_id,p_code,p_actual);
  end if;
end
$$;

create function pg_temp.performer_id(p_user_id uuid)
returns uuid language sql stable security definer set search_path=public,pg_temp as $$
  select performer.id from public.vmp_performers performer
  where performer.user_id=p_user_id and performer.is_active
$$;

create function pg_temp.source_snapshot(p_object_code text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select to_jsonb(source_object) from public.vmp_source_objects source_object
  where source_object.object_code=p_object_code and source_object.is_active
$$;

create function pg_temp.item_version(p_validation_code text)
returns integer language sql stable security definer set search_path=public,pg_temp as $$
  select item.version from public.vmp_plan_items item
  where item.validation_code=p_validation_code
$$;

create function pg_temp.source_version(p_object_code text)
returns integer language sql stable security definer set search_path=public,pg_temp as $$
  select source_object.version from public.vmp_source_objects source_object
  where source_object.object_code=p_object_code and source_object.is_active
$$;

create function pg_temp.assert_list_contains(
  p_payload jsonb,p_object_code text,p_expected boolean,p_rule_id text
)
returns void language plpgsql as $$
declare
  v_found boolean;
begin
  if p_payload->>'ok' is distinct from 'true'
     or jsonb_typeof(p_payload->'rows') is distinct from 'array' then
    raise exception using errcode='check_violation',
      message=format('%s invalid_payload=%s',p_rule_id,p_payload);
  end if;
  select exists (
    select 1 from jsonb_array_elements(p_payload->'rows') row_value
    where row_value->>'object_code'=p_object_code
  ) into v_found;
  if v_found is distinct from p_expected then
    raise exception using errcode='check_violation',
      message=format('%s code=%s expected=%s',p_rule_id,p_object_code,p_expected);
  end if;
end
$$;

create function pg_temp.assert_dedup_projection()
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_source_id uuid:='9a010000-0000-4000-8000-000000000104';
  v_code text:='SACCESS-DEDUP/2026.01-PQ';
  v_owner uuid:=pg_temp.performer_id('9a010000-0000-4000-8000-000000000003');
  v_conflict uuid:=pg_temp.performer_id('9a010000-0000-4000-8000-000000000005');
begin
  perform public.vmp_reconcile_source_qa_projection(v_source_id);
  if (select count(*) from public.vmp_item_assignments assignment
      where assignment.validation_code=v_code
        and assignment.performer_id=v_owner
        and assignment.assignment_kind='qa' and assignment.is_active
        and (assignment.expires_at is null or assignment.expires_at>now()))<>1
     or not exists (
       select 1 from public.vmp_item_assignments assignment
       where assignment.validation_code=v_code
         and assignment.performer_id=v_owner
         and assignment.assignment_kind='qa' and assignment.is_active
         and assignment.assignment_role='primary'
         and assignment.source='source_owner'
     ) then
    raise exception using errcode='check_violation',
      message='SQA_OWNER_SUPPORT_DEDUP_PRIMARY_WINS';
  end if;
  if exists (
       select 1 from public.vmp_item_assignments assignment
       where assignment.validation_code=v_code
         and assignment.performer_id=v_owner
         and assignment.assignment_kind='qa' and assignment.source='qa_manager'
         and assignment.is_active
     )
     or not exists (
       select 1 from public.vmp_item_assignments assignment
       where assignment.validation_code=v_code
         and assignment.performer_id=v_owner
         and assignment.assignment_kind='qa' and assignment.source='qa_manager'
         and not assignment.is_active
         and nullif(btrim(assignment.change_reason),'') is not null
     )
     or not exists (
       select 1 from public.audit_logs audit
       where audit.validation_code=v_code
         and audit.source='source_qa_projection_reconcile'
         and audit.changed_fields @> array['is_active']::text[]
         and audit.old_data->>'is_active'='true'
         and audit.new_data->>'is_active'='false'
     ) then
    raise exception using errcode='check_violation',
      message='SQA_EXISTING_MANUAL_ROW_SOFT_REVOKED_WITH_AUDIT';
  end if;
  if not exists (
       select 1 from public.vmp_item_assignments assignment
       where assignment.validation_code=v_code
         and assignment.performer_id=v_conflict
         and assignment.assignment_kind='qa' and assignment.is_active
         and assignment.assignment_role='collaborator'
         and assignment.source='qa_manager'
     )
     or not exists (
       select 1 from public.audit_logs audit
       where audit.validation_code=v_code
         and audit.source='source_qa_projection_reconcile'
         and audit.changed_fields @> array['assignment_role']::text[]
         and audit.old_data->>'assignment_role'='primary'
         and audit.new_data->>'assignment_role'='collaborator'
     ) then
    raise exception using errcode='check_violation',
      message='SQA_CONFLICTING_PRIMARY_AUDITED_DEMOTION';
  end if;
end
$$;

create function pg_temp.assert_support_only_projection()
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_source_id uuid:='9a010000-0000-4000-8000-000000000105';
  v_code text:='SACCESS-SUPPORT-ONLY/2026.01-PQ';
  v_support uuid:=pg_temp.performer_id('9a010000-0000-4000-8000-000000000004');
  v_unrelated uuid:=pg_temp.performer_id('9a010000-0000-4000-8000-000000000005');
  v_assignments_after_first text;
  v_audits_after_first text;
begin
  perform public.vmp_reconcile_source_qa_projection(v_source_id);

  if (select count(*) from public.vmp_item_assignments assignment
      where assignment.validation_code=v_code
        and assignment.performer_id=v_support
        and assignment.assignment_kind='qa' and assignment.is_active
        and (assignment.expires_at is null or assignment.expires_at>now()))<>1
     or not exists (
       select 1 from public.vmp_item_assignments assignment
       where assignment.validation_code=v_code
         and assignment.performer_id=v_support
         and assignment.assignment_kind='qa' and assignment.is_active
         and assignment.assignment_role='collaborator'
         and assignment.source='source_support'
     )
     or exists (
       select 1 from public.vmp_item_assignments assignment
       where assignment.validation_code=v_code and assignment.is_active
         and assignment.assignment_kind='qa'
         and (assignment.source='source_owner'
              or (assignment.performer_id=v_support
                  and assignment.assignment_role='primary'))
     ) then
    raise exception using errcode='check_violation',
      message='SQA_SUPPORT_ONLY_REMAINS_COLLABORATOR';
  end if;

  if not exists (
       select 1 from public.vmp_item_assignments assignment
       where assignment.validation_code=v_code
         and assignment.performer_id=v_unrelated
         and assignment.assignment_kind='qa' and assignment.is_active
         and assignment.assignment_role='primary'
         and assignment.source='qa_manager'
     ) then
    raise exception using errcode='check_violation',
      message='SQA_SUPPORT_ONLY_UNRELATED_PRIMARY_PRESERVED';
  end if;

  select md5(coalesce(jsonb_agg(to_jsonb(assignment)
                 order by assignment.id)::text,'[]'))
    into v_assignments_after_first
  from public.vmp_item_assignments assignment
  where assignment.validation_code=v_code;
  select md5(coalesce(jsonb_agg(to_jsonb(audit)
                 order by audit.id)::text,'[]'))
    into v_audits_after_first
  from public.audit_logs audit
  where audit.validation_code=v_code;

  perform public.vmp_reconcile_source_qa_projection(v_source_id);
  if (select md5(coalesce(jsonb_agg(to_jsonb(assignment)
                    order by assignment.id)::text,'[]'))
      from public.vmp_item_assignments assignment
      where assignment.validation_code=v_code) is distinct from v_assignments_after_first
     or (select md5(coalesce(jsonb_agg(to_jsonb(audit)
                    order by audit.id)::text,'[]'))
         from public.audit_logs audit
         where audit.validation_code=v_code) is distinct from v_audits_after_first then
    raise exception using errcode='check_violation',
      message='SQA_SUPPORT_ONLY_SECOND_RECONCILE_IDEMPOTENT';
  end if;
end
$$;

insert into auth.users(
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
select id,'authenticated','authenticated',email,'x',now(),'{}','{}',now(),now()
from (values
  ('9a010000-0000-4000-8000-000000000001'::uuid,'source-access-admin@example.test'),
  ('9a010000-0000-4000-8000-000000000002'::uuid,'source-access-manager@example.test'),
  ('9a010000-0000-4000-8000-000000000003'::uuid,'source-access-owner@example.test'),
  ('9a010000-0000-4000-8000-000000000004'::uuid,'source-access-support@example.test'),
  ('9a010000-0000-4000-8000-000000000005'::uuid,'source-access-unrelated@example.test'),
  ('9a010000-0000-4000-8000-000000000006'::uuid,'source-access-area-workshop@example.test'),
  ('9a010000-0000-4000-8000-000000000007'::uuid,'source-access-line-workshop@example.test'),
  ('9a010000-0000-4000-8000-000000000008'::uuid,'source-access-no-grant@example.test')
) fixture(id,email);

insert into public.departments(id,name,short_name)
values ('QA','Source access QA fixture','QA'),
       ('SACCESS_WS','Source access workshop fixture','SAW')
on conflict(id) do nothing;

insert into public.profiles(id,full_name,email,role,department,is_active)
select id,full_name,email,role::public.user_role,department,true
from (values
  ('9a010000-0000-4000-8000-000000000001'::uuid,'Source Access Admin','source-access-admin@example.test','admin','QA'),
  ('9a010000-0000-4000-8000-000000000002'::uuid,'Source Access QA Manager','source-access-manager@example.test','qa_manager','QA'),
  ('9a010000-0000-4000-8000-000000000003'::uuid,'Source Access Owner QA','source-access-owner@example.test','department_user','QA'),
  ('9a010000-0000-4000-8000-000000000004'::uuid,'Source Access Support QA','source-access-support@example.test','department_user','QA'),
  ('9a010000-0000-4000-8000-000000000005'::uuid,'Source Access Unrelated QA','source-access-unrelated@example.test','department_user','QA'),
  ('9a010000-0000-4000-8000-000000000006'::uuid,'Source Access Area Workshop','source-access-area-workshop@example.test','department_user','SACCESS_WS'),
  ('9a010000-0000-4000-8000-000000000007'::uuid,'Source Access Line Workshop','source-access-line-workshop@example.test','department_user','SACCESS_WS'),
  ('9a010000-0000-4000-8000-000000000008'::uuid,'Source Access No Grant Workshop','source-access-no-grant@example.test','department_user','SACCESS_WS')
) fixture(id,full_name,email,role,department);

update public.vmp_performers
set department=case when user_id between
      '9a010000-0000-4000-8000-000000000006'::uuid and
      '9a010000-0000-4000-8000-000000000008'::uuid
    then 'SACCESS_WS' else 'QA' end,
    access_class=case
      when user_id='9a010000-0000-4000-8000-000000000001'::uuid then 'view_only'
      when user_id='9a010000-0000-4000-8000-000000000002'::uuid then 'qa_manager'
      when user_id between '9a010000-0000-4000-8000-000000000003'::uuid
                       and '9a010000-0000-4000-8000-000000000005'::uuid
        then 'qa_progress_editor'
      when user_id='9a010000-0000-4000-8000-000000000006'::uuid
        then 'equipment_manager'
      else 'workshop_staff' end,
    scope_departments='{}'::text[],scope_factory_ids='{}'::uuid[],
    scope_area_ids='{}'::uuid[],scope_line_ids='{}'::uuid[],is_active=true
where user_id between '9a010000-0000-4000-8000-000000000001'::uuid
                  and '9a010000-0000-4000-8000-000000000008'::uuid;

select pg_temp.assert_true(
  (select count(*) from public.vmp_performers
   where user_id between '9a010000-0000-4000-8000-000000000001'::uuid
                     and '9a010000-0000-4000-8000-000000000008'::uuid)=8
  and public.vmp_business_role('9a010000-0000-4000-8000-000000000001')='admin'
  and public.vmp_business_role('9a010000-0000-4000-8000-000000000002')='qa_manager'
  and public.vmp_business_role('9a010000-0000-4000-8000-000000000003')='qa_staff'
  and public.vmp_business_role('9a010000-0000-4000-8000-000000000004')='qa_staff'
  and public.vmp_business_role('9a010000-0000-4000-8000-000000000005')='qa_staff'
  and public.vmp_business_role('9a010000-0000-4000-8000-000000000006')='workshop_manager'
  and public.vmp_business_role('9a010000-0000-4000-8000-000000000007')='workshop_staff'
  and public.vmp_business_role('9a010000-0000-4000-8000-000000000008')='workshop_staff',
  'SOURCE_ACCESS_FIXTURE_PERSONAS');

insert into public.vmp_objects(
  code,name,classification,department,area,line,frequency_months
)
values
  ('SACCESS-LINE-A','Source access line A','tb','SACCESS_WS','SACCESS_AREA','LINE_A',12),
  ('SACCESS-LINE-B','Source access line B','tb','SACCESS_WS','SACCESS_AREA','LINE_B',12),
  ('SACCESS-NO-AREA','Source access without area','tb','SACCESS_WS',null,null,12);

insert into public.vmp_source_objects(
  id,object_kind,object_code,object_name,department,area_code,line,
  validate_flag,frequency_months,report_class,workdays,first_month,year_ref,
  source_tab,source_row,version,timeline_revision,timeline_applied_revision,
  owner_person_id,owner_name,support_person_id,support_name
)
select fixture.id,'Thiết bị',fixture.object_code,fixture.object_name,
       'SACCESS_WS',fixture.area_code,fixture.line,'y',12,'Hóa lý',5,1,2026,
       'source-access-test',fixture.source_row,5,0,0,
       owner_performer.id,owner_performer.performer_name,
       support_performer.id,support_performer.performer_name
from (values
  ('9a010000-0000-4000-8000-000000000101'::uuid,'SACCESS-LINE-A','Source access line A','SACCESS_AREA','LINE_A',101),
  ('9a010000-0000-4000-8000-000000000102'::uuid,'SACCESS-LINE-B','Source access line B','SACCESS_AREA','LINE_B',102),
  ('9a010000-0000-4000-8000-000000000103'::uuid,'SACCESS-NO-AREA','Source access without area',null,null,103)
) fixture(id,object_code,object_name,area_code,line,source_row)
cross join lateral (
  select id,performer_name from public.vmp_performers
  where user_id='9a010000-0000-4000-8000-000000000003'::uuid and is_active
) owner_performer
cross join lateral (
  select id,performer_name from public.vmp_performers
  where user_id='9a010000-0000-4000-8000-000000000004'::uuid and is_active
) support_performer;

insert into public.vmp_plan_items(
  id,validation_code,object_code,validation_type,year,report_class,effort_days,
  deadline_protocol,deadline_validation,deadline_report,deadline_vmp,
  status_protocol,status_validation,status_report,status_vmp,is_active,
  item_state,version,departments,execution_departments,source_sheet_data,
  owner_person_id,support_person_id
)
select fixture.validation_code,fixture.validation_code,fixture.object_code,
       'PQ',2026,'Hóa lý',5,current_date+30,current_date+60,current_date+90,
       current_date+120,'not_started','not_started','not_started','not_started',
       true,'active',5,array['SACCESS_WS'],array['SACCESS_WS'],
       jsonb_build_object('fixture',fixture.object_code),
       pg_temp.performer_id('9a010000-0000-4000-8000-000000000003'),
       pg_temp.performer_id('9a010000-0000-4000-8000-000000000004')
from (values
  ('SACCESS-LINE-A/2026.01-PQ','SACCESS-LINE-A'),
  ('SACCESS-LINE-B/2026.01-PQ','SACCESS-LINE-B'),
  ('SACCESS-NO-AREA/2026.01-PQ','SACCESS-NO-AREA')
) fixture(validation_code,object_code);

insert into public.vmp_item_assignments(
  validation_code,performer_id,user_id,staff_name,assignment_kind,source,
  assignment_role,is_active,change_reason,created_by,updated_by
)
select item.validation_code,performer.id,performer.user_id,performer.performer_name,
       'qa','qa_manager',
       case when performer.user_id='9a010000-0000-4000-8000-000000000003'
            then 'primary' else 'collaborator' end,
       true,'Source access compatibility projection',
       '9a010000-0000-4000-8000-000000000002',
       '9a010000-0000-4000-8000-000000000002'
from public.vmp_plan_items item
cross join public.vmp_performers performer
where item.validation_code in (
    'SACCESS-LINE-A/2026.01-PQ',
    'SACCESS-LINE-B/2026.01-PQ',
    'SACCESS-NO-AREA/2026.01-PQ'
  )
  and performer.user_id in (
    '9a010000-0000-4000-8000-000000000003'::uuid,
    '9a010000-0000-4000-8000-000000000004'::uuid
  );

insert into public.vmp_objects(
  code,name,classification,department,area,line,frequency_months
)
values (
  'SACCESS-DEDUP','Source access owner support dedup','tb',
  'SACCESS_WS','SACCESS_AREA','LINE_A',12
);

insert into public.vmp_source_objects(
  id,object_kind,object_code,object_name,department,area_code,line,
  validate_flag,frequency_months,report_class,workdays,first_month,year_ref,
  source_tab,source_row,version,timeline_revision,timeline_applied_revision,
  owner_person_id,owner_name,support_person_id,support_name
)
select '9a010000-0000-4000-8000-000000000104','Thiết bị','SACCESS-DEDUP',
       'Source access owner support dedup','SACCESS_WS','SACCESS_AREA','LINE_A',
       'y',12,'Hóa lý',5,1,2026,'source-access-test',104,5,0,0,
       performer.id,performer.performer_name,performer.id,performer.performer_name
from public.vmp_performers performer
where performer.user_id='9a010000-0000-4000-8000-000000000003'::uuid;

insert into public.vmp_plan_items(
  id,validation_code,object_code,validation_type,year,report_class,effort_days,
  deadline_protocol,deadline_validation,deadline_report,deadline_vmp,
  status_protocol,status_validation,status_report,status_vmp,is_active,
  item_state,version,departments,execution_departments,source_sheet_data,
  owner_person_id,support_person_id
)
select 'SACCESS-DEDUP/2026.01-PQ','SACCESS-DEDUP/2026.01-PQ','SACCESS-DEDUP',
       'PQ',2026,'Hóa lý',5,current_date+30,current_date+60,current_date+90,
       current_date+120,'not_started','not_started','not_started','not_started',
       true,'active',5,array['SACCESS_WS'],array['SACCESS_WS'],
       '{"fixture":"SACCESS-DEDUP"}'::jsonb,performer.id,performer.id
from public.vmp_performers performer
where performer.user_id='9a010000-0000-4000-8000-000000000003'::uuid;

insert into public.vmp_item_assignments(
  validation_code,performer_id,user_id,staff_name,assignment_kind,source,
  assignment_role,is_active,change_reason,created_by,updated_by
)
select 'SACCESS-DEDUP/2026.01-PQ',performer.id,performer.user_id,
       performer.performer_name,'qa','qa_manager','collaborator',true,
       'Existing same-person manual QA row',
       '9a010000-0000-4000-8000-000000000002',
       '9a010000-0000-4000-8000-000000000002'
from public.vmp_performers performer
where performer.user_id='9a010000-0000-4000-8000-000000000003'::uuid;

insert into public.vmp_item_assignments(
  validation_code,performer_id,user_id,staff_name,assignment_kind,source,
  assignment_role,is_active,change_reason,created_by,updated_by
)
select 'SACCESS-DEDUP/2026.01-PQ',performer.id,performer.user_id,
       performer.performer_name,'qa','qa_manager','primary',true,
       'Conflicting primary must be audited when demoted',
       '9a010000-0000-4000-8000-000000000002',
       '9a010000-0000-4000-8000-000000000002'
from public.vmp_performers performer
where performer.user_id='9a010000-0000-4000-8000-000000000005'::uuid;

insert into public.vmp_objects(
  code,name,classification,department,area,line,frequency_months
)
values (
  'SACCESS-SUPPORT-ONLY','Source access support only','tb',
  'SACCESS_WS','SACCESS_AREA','LINE_A',12
);

insert into public.vmp_source_objects(
  id,object_kind,object_code,object_name,department,area_code,line,
  validate_flag,frequency_months,report_class,workdays,first_month,year_ref,
  source_tab,source_row,version,timeline_revision,timeline_applied_revision,
  owner_person_id,owner_name,support_person_id,support_name
)
select '9a010000-0000-4000-8000-000000000105','Thiết bị',
       'SACCESS-SUPPORT-ONLY','Source access support only','SACCESS_WS',
       'SACCESS_AREA','LINE_A','y',12,'Hóa lý',5,1,2026,
       'source-access-test',105,5,0,0,null,null,
       performer.id,performer.performer_name
from public.vmp_performers performer
where performer.user_id='9a010000-0000-4000-8000-000000000004'::uuid;

insert into public.vmp_plan_items(
  id,validation_code,object_code,validation_type,year,report_class,effort_days,
  deadline_protocol,deadline_validation,deadline_report,deadline_vmp,
  status_protocol,status_validation,status_report,status_vmp,is_active,
  item_state,version,departments,execution_departments,source_sheet_data,
  owner_person_id,support_person_id
)
select 'SACCESS-SUPPORT-ONLY/2026.01-PQ','SACCESS-SUPPORT-ONLY/2026.01-PQ',
       'SACCESS-SUPPORT-ONLY','PQ',2026,'Hóa lý',5,
       current_date+30,current_date+60,current_date+90,current_date+120,
       'not_started','not_started','not_started','not_started',true,'active',5,
       array['SACCESS_WS'],array['SACCESS_WS'],
       '{"fixture":"SACCESS-SUPPORT-ONLY"}'::jsonb,null,performer.id
from public.vmp_performers performer
where performer.user_id='9a010000-0000-4000-8000-000000000004'::uuid;

insert into public.vmp_item_assignments(
  validation_code,performer_id,user_id,staff_name,assignment_kind,source,
  assignment_role,is_active,change_reason,created_by,updated_by
)
select 'SACCESS-SUPPORT-ONLY/2026.01-PQ',performer.id,performer.user_id,
       performer.performer_name,'qa','qa_manager',fixture.assignment_role,true,
       fixture.change_reason,
       '9a010000-0000-4000-8000-000000000002',
       '9a010000-0000-4000-8000-000000000002'
from (values
  ('9a010000-0000-4000-8000-000000000004'::uuid,'collaborator',
   'Existing support-only manual collaborator'),
  ('9a010000-0000-4000-8000-000000000005'::uuid,'primary',
   'Unrelated primary must remain primary')
) fixture(user_id,assignment_role,change_reason)
join public.vmp_performers performer on performer.user_id=fixture.user_id;

update public.system_config set value=to_jsonb('preview'::text)
where key='item_permissions_mode';

\echo 'PASS FIXTURE eight personas canonical Source relation and rollback rows created'

select :'source_access_phase'='expand' as source_access_expand \gset
\if :source_access_expand
select pg_temp.assert_true(
  to_regclass('public.vmp_source_workshop_scope_grants') is not null
  and to_regclass('public.vmp_authorization_revision') is not null
  and to_regprocedure('public.vmp_source_scope_key(text)') is not null
  and to_regprocedure('public.vmp_reconcile_source_qa_projection(uuid)') is not null
  and to_regclass('public.uq_vmp_source_objects_active_object_code') is not null
  and to_regclass('public.idx_vmp_plan_items_object_year_active') is not null
  and (select index.indisunique and index.indisvalid
              and pg_get_indexdef(index.indexrelid)=
                'CREATE UNIQUE INDEX vmp_item_assignments_one_active_qa_primary ON public.vmp_item_assignments USING btree (validation_code) WHERE ((assignment_kind = ''qa''::text) AND (assignment_role = ''primary''::text) AND is_active)'
       from pg_index index
       where index.indexrelid=
         'public.vmp_item_assignments_one_active_qa_primary'::regclass)
  and (select index.indisunique and index.indisvalid
              and pg_get_indexdef(index.indexrelid)=
                'CREATE UNIQUE INDEX vmp_item_assignments_one_active_qa_person ON public.vmp_item_assignments USING btree (validation_code, performer_id, assignment_kind) WHERE ((performer_id IS NOT NULL) AND (assignment_kind = ''qa''::text) AND is_active)'
       from pg_index index
       where index.indexrelid=
         'public.vmp_item_assignments_one_active_qa_person'::regclass)
  and not has_function_privilege(
    'authenticated','public.rpc_refresh_source_item_assignments()','EXECUTE')
  and not has_function_privilege(
    'service_role','public.rpc_refresh_source_item_assignments()','EXECUTE')
  and not exists (
    select 1 from public.vmp_item_assignments assignment
    where assignment.validation_code in (
      'SACCESS-DEDUP/2026.01-PQ','SACCESS-SUPPORT-ONLY/2026.01-PQ'
    )
      and assignment.source in ('source_owner','source_support')
  ),
  'SOURCE_ACCESS_EXPAND_SCHEMA_RELATION_GRANTS_REVISION_INDEXES');
\echo 'PASS EXPAND source relation grant schema revision helpers and indexes'
rollback;
\quit
\endif

select pg_temp.assert_true(
  to_regclass('public.vmp_source_workshop_scope_grants') is not null
  and to_regprocedure(
    'public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)'
  ) is not null
  and to_regprocedure('public.vmp_can_view_source_object(uuid,uuid)') is not null
  and to_regprocedure('public.vmp_can_view_plan_item(uuid,text)') is not null,
  'SOURCE_ACCESS_SCHEMA_MISSING vmp_source_workshop_scope_grants rpc_list_source_objects SQA_OWNER');

select pg_temp.assert_dedup_projection();
select pg_temp.assert_support_only_projection();

select pg_temp.assert_true(
  (select index.indisunique and index.indisvalid
          and pg_get_indexdef(index.indexrelid)=
            'CREATE UNIQUE INDEX vmp_item_assignments_one_active_qa_primary ON public.vmp_item_assignments USING btree (validation_code) WHERE ((assignment_kind = ''qa''::text) AND (assignment_role = ''primary''::text) AND is_active)'
   from pg_index index where index.indexrelid=
     'public.vmp_item_assignments_one_active_qa_primary'::regclass)
  and (select index.indisunique and index.indisvalid
          and pg_get_indexdef(index.indexrelid)=
            'CREATE UNIQUE INDEX vmp_item_assignments_one_active_qa_person ON public.vmp_item_assignments USING btree (validation_code, performer_id, assignment_kind) WHERE ((performer_id IS NOT NULL) AND (assignment_kind = ''qa''::text) AND is_active)'
   from pg_index index where index.indexrelid=
     'public.vmp_item_assignments_one_active_qa_person'::regclass),
  'SQA_EXISTING_ONE_ACTIVE_PRIMARY_AND_PERSON_INDEXES_PRESERVED');

insert into public.vmp_source_workshop_scope_grants(
  id,performer_id,department,department_key,area_code,area_key,line,line_key,
  valid_from,expires_at,is_active,version,created_by,updated_by,change_reason
)
values
  ('9a010000-0000-4000-8000-000000000201',
   pg_temp.performer_id('9a010000-0000-4000-8000-000000000006'),
   'SACCESS_WS','saccess_ws','SACCESS_AREA','saccess_area',null,null,
   transaction_timestamp(),null,true,1,
   '9a010000-0000-4000-8000-000000000002',
   '9a010000-0000-4000-8000-000000000002','Area coverage fixture'),
  ('9a010000-0000-4000-8000-000000000202',
   pg_temp.performer_id('9a010000-0000-4000-8000-000000000007'),
   'SACCESS_WS','saccess_ws','SACCESS_AREA','saccess_area','LINE_A','line_a',
   transaction_timestamp(),null,true,1,
   '9a010000-0000-4000-8000-000000000002',
   '9a010000-0000-4000-8000-000000000002','Line coverage fixture');

insert into public.vmp_item_assignments(
  validation_code,performer_id,user_id,staff_name,assignment_kind,source,
  assignment_role,is_active,change_reason,created_by,updated_by
)
select fixture.validation_code,performer.id,performer.user_id,
       performer.performer_name,'equipment_department','equipment_manager',
       null,true,'Workshop assignment fixture',
       '9a010000-0000-4000-8000-000000000002',
       '9a010000-0000-4000-8000-000000000002'
from (values
  ('SACCESS-LINE-A/2026.01-PQ','9a010000-0000-4000-8000-000000000007'::uuid),
  ('SACCESS-LINE-B/2026.01-PQ','9a010000-0000-4000-8000-000000000008'::uuid)
) fixture(validation_code,user_id)
join public.vmp_performers performer on performer.user_id=fixture.user_id;

set local role authenticated;

select set_config('request.jwt.claims',json_build_object(
  'sub','9a010000-0000-4000-8000-000000000003','role','authenticated')::text,true);
select pg_temp.assert_true(
  not public.vmp_can_view_source_object(
    '9a010000-0000-4000-8000-000000000004',
    '9a010000-0000-4000-8000-000000000101')
  and not public.vmp_can_view_plan_item(
    '9a010000-0000-4000-8000-000000000004',
    'SACCESS-LINE-A/2026.01-PQ'),
  'SACCESS_TARGET_UID_SUBSTITUTION_REJECTED_FOR_AUTHENTICATED_CALLER');
do $owner_rights$
declare
  v_right record;
  v_list jsonb;
begin
  select * into strict v_right
  from public.vmp_my_item_rights('SACCESS-LINE-A/2026.01-PQ');
  v_list:=public.rpc_list_source_objects(
    'Thiết bị','', '{}'::jsonb,null,100,false,null);
  if v_right.can_view is not true
     or v_right.editable_fields is distinct from array[
       'actual_protocol_date','status_protocol','status_validation',
       'actual_report_date','status_report','actual_vmp_date','status_vmp'
     ]::text[] then
    raise exception using errcode='check_violation',
      message='SQA_OWNER_CAN_VIEW_AND_EDIT_7 '||to_jsonb(v_right)::text;
  end if;
  perform pg_temp.assert_list_contains(
    v_list,'SACCESS-LINE-A',true,'SQA_OWNER_CAN_VIEW_AND_EDIT_7');
end
$owner_rights$;

select set_config('request.jwt.claims',json_build_object(
  'sub','9a010000-0000-4000-8000-000000000004','role','authenticated')::text,true);
do $support_rights$
declare v_right record; v_list jsonb;
begin
  select * into strict v_right
  from public.vmp_my_item_rights('SACCESS-LINE-A/2026.01-PQ');
  v_list:=public.rpc_list_source_objects(
    'Thiết bị','', '{}'::jsonb,null,100,false,null);
  if v_right.can_view is not true
     or v_right.editable_fields is distinct from array[
       'actual_protocol_date','status_protocol','status_validation',
       'actual_report_date','status_report','actual_vmp_date','status_vmp'
     ]::text[] then
    raise exception using errcode='check_violation',
      message='SQA_SUPPORT_CAN_VIEW_AND_EDIT_7 '||to_jsonb(v_right)::text;
  end if;
  perform pg_temp.assert_list_contains(
    v_list,'SACCESS-LINE-A',true,'SQA_SUPPORT_CAN_VIEW_AND_EDIT_7');
end
$support_rights$;

reset role;
delete from public.vmp_item_assignments
where validation_code='SACCESS-LINE-A/2026.01-PQ'
  and assignment_kind='qa'
  and performer_id in (
    pg_temp.performer_id('9a010000-0000-4000-8000-000000000003'),
    pg_temp.performer_id('9a010000-0000-4000-8000-000000000004')
  );

set local role authenticated;
select set_config('request.jwt.claims',json_build_object(
  'sub','9a010000-0000-4000-8000-000000000003','role','authenticated')::text,true);
do $projection_not_authority$
declare v_right record;
begin
  select * into strict v_right
  from public.vmp_my_item_rights('SACCESS-LINE-A/2026.01-PQ');
  if v_right.can_view is not true or cardinality(v_right.editable_fields)<>7 then
    raise exception using errcode='check_violation',
      message='SQA_ASSIGNMENT_PROJECTION_NOT_AUTHORITY '||to_jsonb(v_right)::text;
  end if;
end
$projection_not_authority$;

reset role;
insert into public.vmp_item_assignments(
  validation_code,performer_id,user_id,staff_name,assignment_kind,source,
  assignment_role,is_active,change_reason
)
select 'SACCESS-LINE-A/2026.01-PQ',id,user_id,performer_name,'qa','qa_manager',
       'collaborator',true,'Unrelated QA assignment must not authorize'
from public.vmp_performers
where user_id='9a010000-0000-4000-8000-000000000005'::uuid;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object(
  'sub','9a010000-0000-4000-8000-000000000005','role','authenticated')::text,true);
do $unrelated_denied$
declare v_right record; v_list jsonb;
begin
  select * into strict v_right
  from public.vmp_my_item_rights('SACCESS-LINE-A/2026.01-PQ');
  v_list:=public.rpc_list_source_objects(
    'Thiết bị','', '{}'::jsonb,null,100,false,null);
  if coalesce(v_right.can_view,false)
     or v_right.editable_fields is distinct from '{}'::text[] then
    raise exception using errcode='check_violation',
      message='SQA_UNRELATED_DENIED '||to_jsonb(v_right)::text;
  end if;
  perform pg_temp.assert_list_contains(
    v_list,'SACCESS-LINE-A',false,'SQA_UNRELATED_DENIED');
end
$unrelated_denied$;

select set_config('request.jwt.claims',json_build_object(
  'sub','9a010000-0000-4000-8000-000000000006','role','authenticated')::text,true);
do $area_view$
declare v_a record; v_b record; v_list jsonb;
begin
  select * into strict v_a from public.vmp_my_item_rights('SACCESS-LINE-A/2026.01-PQ');
  select * into strict v_b from public.vmp_my_item_rights('SACCESS-LINE-B/2026.01-PQ');
  v_list:=public.rpc_list_source_objects(
    'Thiết bị','', '{}'::jsonb,null,100,false,null);
  if v_a.can_view is not true or v_b.can_view is not true then
    raise exception using errcode='check_violation',
      message='SWS_AREA_VIEW_WITHOUT_ITEM_ASSIGNMENT';
  end if;
  if v_a.editable_fields is distinct from '{}'::text[]
     or v_b.editable_fields is distinct from '{}'::text[] then
    raise exception using errcode='check_violation',
      message='SWS_AREA_VIEW_HAS_NO_EDIT_WITHOUT_ASSIGNMENT';
  end if;
  perform pg_temp.assert_list_contains(
    v_list,'SACCESS-LINE-A',true,'SWS_AREA_VIEW_WITHOUT_ITEM_ASSIGNMENT');
  perform pg_temp.assert_list_contains(
    v_list,'SACCESS-LINE-B',true,'SWS_AREA_VIEW_WITHOUT_ITEM_ASSIGNMENT');
  perform pg_temp.assert_list_contains(
    v_list,'SACCESS-NO-AREA',false,'SWS_AREALESS_SOURCE_DENIED');
end
$area_view$;

select set_config('request.jwt.claims',json_build_object(
  'sub','9a010000-0000-4000-8000-000000000007','role','authenticated')::text,true);
do $line_view_and_edit$
declare v_a record; v_b record; v_list jsonb;
begin
  select * into strict v_a from public.vmp_my_item_rights('SACCESS-LINE-A/2026.01-PQ');
  select * into strict v_b from public.vmp_my_item_rights('SACCESS-LINE-B/2026.01-PQ');
  v_list:=public.rpc_list_source_objects(
    'Thiết bị','', '{}'::jsonb,null,100,false,null);
  if v_a.can_view is not true
     or v_a.editable_fields is distinct from array['actual_validation_date']::text[] then
    raise exception using errcode='check_violation',
      message='SWS_EDIT_REQUIRES_ASSIGNMENT_AND_SCOPE '||to_jsonb(v_a)::text;
  end if;
  if coalesce(v_b.can_view,false) or v_b.editable_fields is distinct from '{}'::text[] then
    raise exception using errcode='check_violation',
      message='SWS_LINE_DOES_NOT_CROSS_LINE '||to_jsonb(v_b)::text;
  end if;
  perform pg_temp.assert_list_contains(
    v_list,'SACCESS-LINE-A',true,'SWS_EDIT_REQUIRES_ASSIGNMENT_AND_SCOPE');
  perform pg_temp.assert_list_contains(
    v_list,'SACCESS-LINE-B',false,'SWS_LINE_DOES_NOT_CROSS_LINE');
end
$line_view_and_edit$;

select set_config('request.jwt.claims',json_build_object(
  'sub','9a010000-0000-4000-8000-000000000008','role','authenticated')::text,true);
do $assignment_without_scope$
declare v_right record;
begin
  select * into strict v_right from public.vmp_my_item_rights('SACCESS-LINE-B/2026.01-PQ');
  if coalesce(v_right.can_view,false)
     or v_right.editable_fields is distinct from '{}'::text[] then
    raise exception using errcode='check_violation',
      message='SWS_EDIT_REQUIRES_ASSIGNMENT_AND_SCOPE '||to_jsonb(v_right)::text;
  end if;
end
$assignment_without_scope$;

reset role;
do $progress_failures_atomic_and_source_immutable$
declare
  v_source jsonb:=pg_temp.source_snapshot('SACCESS-LINE-A');
  v_item jsonb;
  v_audits text;
  v_result jsonb;
  v_version integer:=pg_temp.item_version('SACCESS-LINE-A/2026.01-PQ');
begin
  select to_jsonb(item) into strict v_item
  from public.vmp_plan_items item
  where item.validation_code='SACCESS-LINE-A/2026.01-PQ';
  select md5(coalesce(jsonb_agg(to_jsonb(audit)
               order by audit.id)::text,'[]')) into v_audits
  from public.audit_logs audit;

  perform set_config('request.jwt.claims',json_build_object(
    'sub','9a010000-0000-4000-8000-000000000003',
    'role','authenticated')::text,true);
  set local role authenticated;
  v_result:=public.rpc_update_progress(
    'SACCESS-LINE-A/2026.01-PQ',jsonb_build_object(
      'status_protocol','completed','actual_validation_date',current_date),
    'QA mixed allowed forbidden must fail',null,v_version);
  perform pg_temp.assert_code(v_result,'item_field_forbidden',
    'SQA_PROGRESS_MIXED_PAYLOAD_ATOMIC');

  reset role;
  perform set_config('request.jwt.claims',json_build_object(
    'sub','9a010000-0000-4000-8000-000000000007',
    'role','authenticated')::text,true);
  set local role authenticated;
  v_result:=public.rpc_update_progress(
    'SACCESS-LINE-A/2026.01-PQ',jsonb_build_object(
      'actual_validation_date',current_date,'status_protocol','completed'),
    'Workshop mixed allowed forbidden must fail',null,v_version);
  perform pg_temp.assert_code(v_result,'item_field_forbidden',
    'SWS_PROGRESS_MIXED_PAYLOAD_ATOMIC');

  reset role;
  perform set_config('request.jwt.claims',json_build_object(
    'sub','9a010000-0000-4000-8000-000000000003',
    'role','authenticated')::text,true);
  set local role authenticated;
  v_result:=public.rpc_update_progress(
    'SACCESS-LINE-A/2026.01-PQ','{"status_protocol":"in_progress"}',
    'QA stale version must fail',null,v_version+1);
  perform pg_temp.assert_code(v_result,'version_conflict',
    'SQA_PROGRESS_STALE_VERSION_ATOMIC');

  reset role;
  if (select to_jsonb(item) from public.vmp_plan_items item
      where item.validation_code='SACCESS-LINE-A/2026.01-PQ')
       is distinct from v_item
     or pg_temp.source_snapshot('SACCESS-LINE-A') is distinct from v_source
     or (select md5(coalesce(jsonb_agg(to_jsonb(audit)
                      order by audit.id)::text,'[]'))
         from public.audit_logs audit) is distinct from v_audits then
    raise exception using errcode='check_violation',
      message='SPROGRESS_FAILURE_ATOMIC_ITEM_SOURCE_AUDIT_IMMUTABLE';
  end if;
end
$progress_failures_atomic_and_source_immutable$;

do $progress_source_immutable$
declare
  v_before jsonb:=pg_temp.source_snapshot('SACCESS-LINE-A');
  v_result jsonb;
begin
  perform set_config('request.jwt.claims',json_build_object(
    'sub','9a010000-0000-4000-8000-000000000003','role','authenticated')::text,true);
  set local role authenticated;
  v_result:=public.rpc_update_progress(
    'SACCESS-LINE-A/2026.01-PQ','{"status_validation":"in_progress"}',
    'QA Source immutability fixture',null,
    pg_temp.item_version('SACCESS-LINE-A/2026.01-PQ'));
  if v_result->>'ok' is distinct from 'true' then
    raise exception using errcode='check_violation',
      message='SPROGRESS_DOES_NOT_MUTATE_SOURCE qa_write='||v_result::text;
  end if;
  reset role;
  perform set_config('request.jwt.claims',json_build_object(
    'sub','9a010000-0000-4000-8000-000000000007','role','authenticated')::text,true);
  set local role authenticated;
  v_result:=public.rpc_update_progress(
    'SACCESS-LINE-A/2026.01-PQ',jsonb_build_object('actual_validation_date',current_date),
    'Workshop Source immutability fixture',null,
    pg_temp.item_version('SACCESS-LINE-A/2026.01-PQ'));
  if v_result->>'ok' is distinct from 'true' then
    raise exception using errcode='check_violation',
      message='SPROGRESS_DOES_NOT_MUTATE_SOURCE workshop_write='||v_result::text;
  end if;
  reset role;
  if pg_temp.source_snapshot('SACCESS-LINE-A') is distinct from v_before then
    raise exception using errcode='check_violation',
      message='SPROGRESS_DOES_NOT_MUTATE_SOURCE';
  end if;
end
$progress_source_immutable$;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object(
  'sub','9a010000-0000-4000-8000-000000000002','role','authenticated')::text,true);
do $replace_and_clear$
declare v_result jsonb; v_pending_before bigint;
begin
  reset role;
  select count(*) into v_pending_before
  from public.vmp_catalog_changes change
  where change.object_code='SACCESS-LINE-A';
  set local role authenticated;
  v_result:=public.rpc_save_catalog_object(
    'Thiết bị','SACCESS-LINE-A',jsonb_build_object(
      'owner_person_id',pg_temp.performer_id('9a010000-0000-4000-8000-000000000005'),
      'support_person_id',null
    ),'Replace owner and clear support atomically',
    pg_temp.source_version('SACCESS-LINE-A'));
  if v_result->>'ok' is distinct from 'true' then
    raise exception using errcode='check_violation',
      message='SQA_REPLACE_AND_CLEAR_IMMEDIATE save='||v_result::text;
  end if;
  reset role;
  if (select count(*) from public.vmp_catalog_changes change
      where change.object_code='SACCESS-LINE-A')<>v_pending_before then
    raise exception using errcode='check_violation',
      message='SQA_ASSIGNMENT_ONLY_SAVE_CREATES_ZERO_PENDING_ROWS';
  end if;
  set local role authenticated;
end
$replace_and_clear$;

select set_config('request.jwt.claims',json_build_object(
  'sub','9a010000-0000-4000-8000-000000000003','role','authenticated')::text,true);
do $old_owner_revoked$
declare v_right record;
begin
  select * into strict v_right from public.vmp_my_item_rights('SACCESS-LINE-A/2026.01-PQ');
  if coalesce(v_right.can_view,false) then
    raise exception using errcode='check_violation',message='SQA_REPLACE_AND_CLEAR_IMMEDIATE old_owner';
  end if;
end
$old_owner_revoked$;

select set_config('request.jwt.claims',json_build_object(
  'sub','9a010000-0000-4000-8000-000000000004','role','authenticated')::text,true);
do $old_support_revoked$
declare v_right record;
begin
  select * into strict v_right from public.vmp_my_item_rights('SACCESS-LINE-A/2026.01-PQ');
  if coalesce(v_right.can_view,false) then
    raise exception using errcode='check_violation',message='SQA_REPLACE_AND_CLEAR_IMMEDIATE old_support';
  end if;
end
$old_support_revoked$;

select set_config('request.jwt.claims',json_build_object(
  'sub','9a010000-0000-4000-8000-000000000005','role','authenticated')::text,true);
do $new_owner_immediate$
declare v_right record;
begin
  select * into strict v_right from public.vmp_my_item_rights('SACCESS-LINE-A/2026.01-PQ');
  if v_right.can_view is not true or cardinality(v_right.editable_fields)<>7 then
    raise exception using errcode='check_violation',message='SQA_REPLACE_AND_CLEAR_IMMEDIATE new_owner';
  end if;
end
$new_owner_immediate$;

reset role;
select pg_temp.assert_true(
  not exists (
    select 1 from public.vmp_catalog_changes change
    where change.object_code='SACCESS-LINE-A'
      and (change.new_data ? 'owner_person_id' or change.new_data ? 'support_person_id')
  ),'SQA_REPLACE_AND_CLEAR_IMMEDIATE no_pending_access_fields');

set local role authenticated;
select set_config('request.jwt.claims',json_build_object(
  'sub','9a010000-0000-4000-8000-000000000002','role','authenticated')::text,true);
do $access_reason_and_atomic_failure$
declare
  v_before jsonb:=pg_temp.source_snapshot('SACCESS-LINE-B');
  v_pending_before bigint;
  v_result jsonb;
begin
  reset role;
  select count(*) into v_pending_before
  from public.vmp_catalog_changes change
  where change.object_code='SACCESS-LINE-B';
  set local role authenticated;

  v_result:=public.rpc_save_catalog_object(
    'Thiết bị','SACCESS-LINE-B',jsonb_build_object(
      'owner_person_id',pg_temp.performer_id(
        '9a010000-0000-4000-8000-000000000005')
    ),null,pg_temp.source_version('SACCESS-LINE-B'));
  perform pg_temp.assert_code(
    v_result,'REASON_REQUIRED','SQA_ACCESS_CHANGE_REASON_REQUIRED');

  v_result:=public.rpc_save_catalog_object(
    'Thiết bị','SACCESS-LINE-B',jsonb_build_object(
      'owner_person_id',pg_temp.performer_id(
        '9a010000-0000-4000-8000-000000000008'),
      'frequency_months',6
    ),'Invalid principal must roll back every field',
    pg_temp.source_version('SACCESS-LINE-B'));
  perform pg_temp.assert_code(
    v_result,'PERSON_NOT_ELIGIBLE','SQA_MIXED_INVALID_ACCESS_ATOMIC_FAILURE');

  reset role;
  if pg_temp.source_snapshot('SACCESS-LINE-B') is distinct from v_before
     or (select count(*) from public.vmp_catalog_changes change
         where change.object_code='SACCESS-LINE-B')<>v_pending_before then
    raise exception using errcode='check_violation',
      message='SQA_MIXED_INVALID_ACCESS_ATOMIC_FAILURE mutated';
  end if;
  set local role authenticated;
end
$access_reason_and_atomic_failure$;

do $mixed_access_timeline$
declare
  v_result jsonb;
  v_change jsonb;
  v_frequency_before integer;
  v_pending_before bigint;
begin
  reset role;
  select frequency_months into strict v_frequency_before
  from public.vmp_source_objects
  where object_code='SACCESS-LINE-B' and is_active;
  select count(*) into v_pending_before
  from public.vmp_catalog_changes change
  where change.object_code='SACCESS-LINE-B';
  set local role authenticated;
  v_result:=public.rpc_save_catalog_object(
    'Thiết bị','SACCESS-LINE-B',jsonb_build_object(
      'owner_person_id',pg_temp.performer_id(
        '9a010000-0000-4000-8000-000000000005'),
      'support_person_id',null,
      'frequency_months',6
    ),'Access is immediate while timeline remains pending',
    pg_temp.source_version('SACCESS-LINE-B'));
  if v_result->>'ok' is distinct from 'true'
     or v_result ? 'owner_assignments_failed'
     or v_result ? 'owner_revocations_failed' then
    raise exception using errcode='check_violation',
      message='SQA_MIXED_ACCESS_TIMELINE_ATOMIC save='||v_result::text;
  end if;

  reset role;
  select change.new_data into strict v_change
  from public.vmp_catalog_changes change
  where change.object_code='SACCESS-LINE-B'
    and change.status in ('pending','previewed')
  order by change.created_at desc,change.id desc limit 1;
  if (select count(*) from public.vmp_catalog_changes change
      where change.object_code='SACCESS-LINE-B')<>v_pending_before+1
     or v_change is distinct from '{"frequency_months":6}'::jsonb
     or exists (
       select 1 from public.vmp_catalog_changes change
       where change.object_code='SACCESS-LINE-B'
         and (change.new_data ? 'owner_person_id'
              or change.new_data ? 'support_person_id'
              or change.old_data ? 'owner_person_id'
              or change.old_data ? 'support_person_id')
     ) then
    raise exception using errcode='check_violation',
      message='SQA_PENDING_JSON_EXCLUDES_ACCESS_FIELDS new_data='||v_change::text;
  end if;
  if (select owner_person_id from public.vmp_source_objects
      where object_code='SACCESS-LINE-B' and is_active)
       is distinct from pg_temp.performer_id(
         '9a010000-0000-4000-8000-000000000005')
     or (select frequency_months from public.vmp_source_objects
         where object_code='SACCESS-LINE-B' and is_active)
          is distinct from v_frequency_before
     or exists (
       select 1 from public.vmp_source_objects
       where object_code='SACCESS-LINE-B' and is_active
         and support_person_id is not null
     ) then
    raise exception using errcode='check_violation',
      message='SQA_MIXED_ACCESS_TIMELINE_ATOMIC relationship_or_early_timeline';
  end if;
  set local role authenticated;
end
$mixed_access_timeline$;

reset role;
insert into public.vmp_objects(
  code,name,classification,department,area,line,frequency_months
) values (
  'SACCESS-NEW-TIMELINE','New Source timeline staging','tb',
  'SACCESS_WS','SACCESS_AREA','LINE_A',12
);
set local role authenticated;
do $new_source_timeline_is_staged$
declare
  v_result jsonb;
  v_change jsonb;
begin
  v_result:=public.rpc_save_catalog_object(
    'Thiết bị','SACCESS-NEW-TIMELINE',jsonb_build_object(
      'object_name','New Source timeline staging',
      'department','SACCESS_WS','area_code','SACCESS_AREA','line','LINE_A',
      'frequency_months',7
    ),'New Source timeline must remain pending',null);
  if v_result->>'ok' is distinct from 'true' then
    raise exception using errcode='check_violation',
      message='SQA_NEW_SOURCE_TIMELINE_SAVE_FAILED result='||v_result::text;
  end if;
  reset role;
  select change.new_data into strict v_change
  from public.vmp_catalog_changes change
  where change.object_code='SACCESS-NEW-TIMELINE'
    and change.status in ('pending','previewed');
  if v_change is distinct from '{"frequency_months":7}'::jsonb
     or (select frequency_months from public.vmp_source_objects
         where object_code='SACCESS-NEW-TIMELINE' and is_active)
          is not distinct from 7 then
    raise exception using errcode='check_violation',
      message='SQA_NEW_SOURCE_TIMELINE_NOT_STAGED payload='||v_change::text;
  end if;
  set local role authenticated;
end
$new_source_timeline_is_staged$;

do $unrelated_save_keeps_ineligible_existing_selection$
declare
  v_result jsonb;
begin
  reset role;
  update public.profiles
  set is_active=false
  where id='9a010000-0000-4000-8000-000000000005'::uuid;
  set local role authenticated;
  v_result:=public.rpc_save_catalog_object(
    'Thiết bị','SACCESS-LINE-B',
    '{"note":"Unrelated save with retained ineligible owner"}'::jsonb,
    null,pg_temp.source_version('SACCESS-LINE-B'));
  if v_result->>'ok' is distinct from 'true' then
    raise exception using errcode='check_violation',
      message='SQA_UNRELATED_SAVE_BLOCKED_BY_INELIGIBLE_EXISTING_SELECTION result='||
              v_result::text;
  end if;
  raise exception using errcode='P7777',
    message='SQA_UNRELATED_SAVE_INELIGIBLE_SELECTION_ROLLBACK';
exception when sqlstate 'P7777' then
  if sqlerrm<>'SQA_UNRELATED_SAVE_INELIGIBLE_SELECTION_ROLLBACK' then
    raise;
  end if;
end
$unrelated_save_keeps_ineligible_existing_selection$;

do $runtime_save_atomic_failure$
declare
  v_source text;
  v_plans text;
  v_assignments text;
  v_audits text;
  v_pending text;
  v_revision bigint;
  v_result jsonb;
begin
  reset role;
  select md5(to_jsonb(source_object)::text) into strict v_source
  from public.vmp_source_objects source_object
  where source_object.object_code='SACCESS-LINE-A' and source_object.is_active;
  select md5(coalesce(jsonb_agg(to_jsonb(item)
               order by item.id)::text,'[]')) into v_plans
  from public.vmp_plan_items item
  where item.object_code='SACCESS-LINE-A';
  select md5(coalesce(jsonb_agg(to_jsonb(assignment)
               order by assignment.id)::text,'[]')) into v_assignments
  from public.vmp_item_assignments assignment
  where assignment.validation_code in (
    select item.validation_code from public.vmp_plan_items item
    where item.object_code='SACCESS-LINE-A'
  );
  select md5(coalesce(jsonb_agg(to_jsonb(audit)
               order by audit.id)::text,'[]')) into v_audits
  from public.audit_logs audit;
  select md5(coalesce(jsonb_agg(to_jsonb(change)
               order by change.id)::text,'[]')) into v_pending
  from public.vmp_catalog_changes change;
  select revision into strict v_revision
  from public.vmp_authorization_revision where singleton;
  set local role authenticated;

  perform set_config('vmp.source_access_save_failpoint',
                     'after_projection_before_audit',true);
  v_result:=public.rpc_save_catalog_object(
    'Thiết bị','SACCESS-LINE-A',jsonb_build_object(
      'owner_person_id',pg_temp.performer_id(
        '9a010000-0000-4000-8000-000000000003'),
      'frequency_months',3
    ),'Deterministic runtime atomic rollback proof',
    pg_temp.source_version('SACCESS-LINE-A'));
  perform set_config('vmp.source_access_save_failpoint','',true);
  perform pg_temp.assert_code(
    v_result,'SAVE_FAILED','SQA_RUNTIME_SAVE_FAILURE_RETURNS_ONE_FAILURE');

  reset role;
  if (select md5(to_jsonb(source_object)::text)
      from public.vmp_source_objects source_object
      where source_object.object_code='SACCESS-LINE-A'
        and source_object.is_active) is distinct from v_source
     or (select md5(coalesce(jsonb_agg(to_jsonb(item)
                      order by item.id)::text,'[]'))
         from public.vmp_plan_items item
         where item.object_code='SACCESS-LINE-A') is distinct from v_plans
     or (select md5(coalesce(jsonb_agg(to_jsonb(assignment)
                      order by assignment.id)::text,'[]'))
         from public.vmp_item_assignments assignment
         where assignment.validation_code in (
           select item.validation_code from public.vmp_plan_items item
           where item.object_code='SACCESS-LINE-A'
         )) is distinct from v_assignments
     or (select md5(coalesce(jsonb_agg(to_jsonb(audit)
                      order by audit.id)::text,'[]'))
         from public.audit_logs audit) is distinct from v_audits
     or (select md5(coalesce(jsonb_agg(to_jsonb(change)
                      order by change.id)::text,'[]'))
         from public.vmp_catalog_changes change) is distinct from v_pending
     or (select revision from public.vmp_authorization_revision
         where singleton) is distinct from v_revision then
    raise exception using errcode='check_violation',
      message='SQA_RUNTIME_SAVE_FAILURE_ROLLS_BACK_SOURCE_PLAN_ASSIGNMENT_AUDIT_PENDING_REVISION';
  end if;
  set local role authenticated;
end
$runtime_save_atomic_failure$;

do $coverage_create_revoke$
declare
  v_person uuid:=pg_temp.performer_id(
    '9a010000-0000-4000-8000-000000000008');
  v_list jsonb;
  v_page jsonb;
  v_page_two jsonb;
  v_choices jsonb;
  v_result jsonb;
  v_grant_id uuid;
  v_grant_version integer;
  v_old_version integer;
  v_audit_count bigint;
  v_grants_before bigint;
  v_invalid_audits_before bigint;
  v_right record;
begin
  v_list:=public.rpc_list_source_workshop_coverage('',null,50);
  if v_list->>'ok' is distinct from 'true'
     or not exists (
       select 1 from jsonb_array_elements(v_list->'rows') row_value
       where (row_value->>'person_id')::uuid=v_person
     ) then
    raise exception using errcode='check_violation',
      message='SWS_COVERAGE_INCLUDES_ZERO_GRANT_ACTIVE_PERSON payload='||v_list::text;
  end if;
  v_page:=public.rpc_list_source_workshop_coverage('',null,1);
  v_page_two:=public.rpc_list_source_workshop_coverage(
    '',v_page->'next_cursor',1);
  if v_page->>'ok' is distinct from 'true'
     or v_page->'next_cursor' is null
     or v_page_two->>'ok' is distinct from 'true'
     or (v_page->'rows'->0->>'person_id') is not distinct from
        (v_page_two->'rows'->0->>'person_id') then
    raise exception using errcode='check_violation',
      message='SWS_COVERAGE_KEYSET_LIMIT_PAGE payload='||
              jsonb_build_array(v_page,v_page_two)::text;
  end if;
  v_result:=public.rpc_list_source_workshop_coverage('',null,51);
  perform pg_temp.assert_code(
    v_result,'INVALID_LIMIT','SWS_COVERAGE_LIMIT_CAPPED_AT_50');

  v_choices:=public.rpc_source_workshop_scope_choices(
    'SACCESS_WS','SACCESS_AREA','',null,50);
  if v_choices->>'ok' is distinct from 'true'
     or not exists (
       select 1 from jsonb_array_elements(v_choices->'rows') row_value
       where row_value->>'department'='SACCESS_WS'
         and row_value->>'area_code'='SACCESS_AREA'
         and row_value->>'line'='LINE_B'
     ) then
    raise exception using errcode='check_violation',
      message='SWS_SCOPE_CHOICES_REAL_ACTIVE_SOURCE_TUPLES payload='||v_choices::text;
  end if;
  v_page:=public.rpc_source_workshop_scope_choices(
    'SACCESS_WS','SACCESS_AREA','',null,1);
  v_page_two:=public.rpc_source_workshop_scope_choices(
    'SACCESS_WS','SACCESS_AREA','',v_page->'next_cursor',1);
  if v_page->>'ok' is distinct from 'true'
     or v_page->'next_cursor' is null
     or v_page_two->>'ok' is distinct from 'true'
     or v_page->'rows'->0 is not distinct from v_page_two->'rows'->0 then
    raise exception using errcode='check_violation',
      message='SWS_SCOPE_CHOICES_KEYSET_LIMIT_PAGE payload='||
              jsonb_build_array(v_page,v_page_two)::text;
  end if;
  v_result:=public.rpc_source_workshop_scope_choices(
    'SACCESS_WS','SACCESS_AREA','',null,51);
  perform pg_temp.assert_code(
    v_result,'INVALID_LIMIT','SWS_SCOPE_CHOICES_LIMIT_CAPPED_AT_50');

  reset role;
  select count(*) into v_grants_before
  from public.vmp_source_workshop_scope_grants;
  select count(*) into v_invalid_audits_before from public.audit_logs;
  set local role authenticated;

  v_result:=public.rpc_set_source_workshop_scope_grant(
    null,v_person,'SACCESS_WS','SACCESS_AREA','LINE_B',true,'',null);
  perform pg_temp.assert_code(
    v_result,'REASON_REQUIRED','SWS_SCOPE_GRANT_REASON_REQUIRED');
  v_result:=public.rpc_set_source_workshop_scope_grant(
    null,v_person,'SACCESS_WS','NO_SUCH_AREA',null,true,
    'Invalid real tuple must fail',null);
  perform pg_temp.assert_code(
    v_result,'SCOPE_NOT_FOUND','SWS_SCOPE_GRANT_REAL_TUPLE_REQUIRED');
  v_result:=public.rpc_set_source_workshop_scope_grant(
    null,'9a010000-0000-4000-8000-00000000dead',
    'SACCESS_WS','SACCESS_AREA','LINE_B',true,
    'Unlinked performer must fail',null);
  perform pg_temp.assert_code(
    v_result,'PERSON_NOT_ELIGIBLE','SWS_SCOPE_GRANT_UNLINKED_DENIED');
  v_result:=public.rpc_set_source_workshop_scope_grant(
    null,pg_temp.performer_id('9a010000-0000-4000-8000-000000000005'),
    'SACCESS_WS','SACCESS_AREA','LINE_B',true,
    'Wrong-role performer must fail',null);
  perform pg_temp.assert_code(
    v_result,'PERSON_NOT_ELIGIBLE','SWS_SCOPE_GRANT_WRONG_ROLE_DENIED');

  reset role;
  begin
    insert into public.vmp_performers(
      performer_name,email,department,is_active,user_id,access_class
    ) values (
      'Ambiguous workshop duplicate','ambiguous-workshop@example.test',
      'SACCESS_WS',true,'9a010000-0000-4000-8000-000000000008',
      'workshop_staff'
    );
    raise exception using errcode='check_violation',
      message='SWS_SCOPE_GRANT_AMBIGUOUS_PRINCIPAL_SCHEMA_GUARD missing_error';
  exception when unique_violation then
    null;
  end;
  if (select count(*) from public.vmp_source_workshop_scope_grants)<>
       v_grants_before
     or (select count(*) from public.audit_logs)<>v_invalid_audits_before then
    raise exception using errcode='check_violation',
      message='SWS_SCOPE_GRANT_INVALID_CALLS_MUTATION_FREE';
  end if;
  set local role authenticated;

  v_result:=public.rpc_set_source_workshop_scope_grant(
    null,v_person,'SACCESS_WS','SACCESS_AREA','LINE_B',true,
    'Grant line B coverage for atomic writer test',null);
  if v_result->>'ok' is distinct from 'true' then
    raise exception using errcode='check_violation',
      message='SWS_SCOPE_GRANT_CREATE_ELIGIBLE_REAL_TUPLE result='||v_result::text;
  end if;
  v_grant_id:=(v_result->>'grant_id')::uuid;
  v_grant_version:=(v_result->>'version')::integer;
  reset role;
  if not exists (
    select 1 from public.vmp_source_workshop_scope_grants grant_row
    where grant_row.id=v_grant_id and grant_row.department_key='saccess_ws'
      and grant_row.area_key='saccess_area' and grant_row.line_key='line_b'
      and grant_row.is_active
  ) then
    raise exception using errcode='check_violation',
      message='SWS_SCOPE_GRANT_NORMALIZED_KEYS';
  end if;
  set local role authenticated;

  v_result:=public.rpc_set_source_workshop_scope_grant(
    null,v_person,'SACCESS_WS','SACCESS_AREA','LINE_B',true,
    'Duplicate active tuple must fail',null);
  perform pg_temp.assert_code(
    v_result,'DUPLICATE_ACTIVE_SCOPE','SWS_SCOPE_GRANT_DUPLICATE_DENIED');

  v_old_version:=v_grant_version;
  v_result:=public.rpc_set_source_workshop_scope_grant(
    v_grant_id,v_person,'SACCESS_WS','SACCESS_AREA',null,true,
    'Change line grant to area grant',v_grant_version);
  if v_result->>'ok' is distinct from 'true' then
    raise exception using errcode='check_violation',
      message='SWS_SCOPE_GRANT_CHANGE_VERSIONED result='||v_result::text;
  end if;
  v_grant_version:=(v_result->>'version')::integer;
  v_result:=public.rpc_set_source_workshop_scope_grant(
    v_grant_id,v_person,'SACCESS_WS','SACCESS_AREA',null,true,
    'Stale version must fail',v_old_version);
  perform pg_temp.assert_code(
    v_result,'VERSION_CONFLICT','SWS_SCOPE_GRANT_STALE_VERSION_DENIED');

  perform set_config('request.jwt.claims',json_build_object(
    'sub','9a010000-0000-4000-8000-000000000008',
    'role','authenticated')::text,true);
  select * into strict v_right
  from public.vmp_my_item_rights('SACCESS-LINE-B/2026.01-PQ');
  if v_right.can_view is not true
     or v_right.editable_fields is distinct from
        array['actual_validation_date']::text[] then
    raise exception using errcode='check_violation',
      message='SWS_GRANT_AND_ASSIGNMENT_ENABLE_EXACT_EDIT '||to_jsonb(v_right)::text;
  end if;

  perform set_config('request.jwt.claims',json_build_object(
    'sub','9a010000-0000-4000-8000-000000000002',
    'role','authenticated')::text,true);
  v_result:=public.rpc_set_source_workshop_scope_grant(
    v_grant_id,v_person,'SACCESS_WS','SACCESS_AREA','LINE_B',false,
    'Revoke line B coverage for atomic writer test',v_grant_version);
  if v_result->>'ok' is distinct from 'true'
     or v_result->>'version' is distinct from (v_grant_version+1)::text then
    raise exception using errcode='check_violation',
      message='SWS_SCOPE_GRANT_SOFT_REVOKE_VERSIONED result='||v_result::text;
  end if;
  reset role;
  if not exists (
       select 1 from public.vmp_source_workshop_scope_grants grant_row
       where grant_row.id=v_grant_id and not grant_row.is_active
         and grant_row.version=v_grant_version+1
     ) or (select count(*) from public.audit_logs audit
           where audit.table_name='vmp_source_workshop_scope_grants'
             and audit.record_id=v_grant_id::text
             and nullif(btrim(audit.change_reason),'') is not null)<>3 then
    raise exception using errcode='check_violation',
      message='SWS_SCOPE_GRANT_SOFT_HISTORY_AND_AUDIT_METADATA';
  end if;
  set local role authenticated;

  perform set_config('request.jwt.claims',json_build_object(
    'sub','9a010000-0000-4000-8000-000000000008',
    'role','authenticated')::text,true);
  select * into strict v_right
  from public.vmp_my_item_rights('SACCESS-LINE-B/2026.01-PQ');
  if coalesce(v_right.can_view,false)
     or v_right.editable_fields is distinct from '{}'::text[] then
    raise exception using errcode='check_violation',
      message='SWS_SCOPE_REVOKE_IMMEDIATE '||to_jsonb(v_right)::text;
  end if;
  reset role;
  select count(*) into v_audit_count from public.audit_logs;
  set local role authenticated;
  v_result:=public.rpc_set_source_workshop_scope_grant(
    v_grant_id,v_person,'SACCESS_WS','SACCESS_AREA',null,true,
    'Workshop caller cannot restore own grant',v_grant_version+1);
  perform pg_temp.assert_code(
    v_result,'FORBIDDEN','SWS_SCOPE_GRANT_NON_MANAGER_DENIED');
  reset role;
  if (select count(*) from public.audit_logs)<>v_audit_count
     or (select version from public.vmp_source_workshop_scope_grants
         where id=v_grant_id)<>v_grant_version+1 then
    raise exception using errcode='check_violation',
      message='SWS_SCOPE_GRANT_DENIAL_MUTATION_FREE';
  end if;
  set local role authenticated;
end
$coverage_create_revoke$;

reset role;
insert into public.vmp_objects(
  code,name,classification,department,area,line,frequency_months
) values (
  'SACCESS-ORPHAN-GUARD','Source relation guard fixture','tb',
  'SACCESS_WS','SACCESS_AREA','LINE_A',12
);

set local role authenticated;
select set_config('request.jwt.claims',json_build_object(
  'sub','9a010000-0000-4000-8000-000000000002','role','authenticated')::text,true);
do $writer_relation_guards$
declare
  v_result jsonb;
  v_source_before jsonb;
  v_plan_before jsonb;
  v_assignments_before text;
  v_audits_before text;
begin
  begin
    v_result:=public.rpc_create_plan_item(
      'SACCESS-ORPHAN-GUARD','PQ',2026,1,'{}'::jsonb);
    raise exception using errcode='check_violation',
      message='SREL_ITEM_WRITER_REQUIRES_ACTIVE_SOURCE missing_error result='||
              v_result::text;
  exception when foreign_key_violation then
    null;
  end;
  if exists (
       select 1 from public.vmp_plan_items item
       where item.object_code='SACCESS-ORPHAN-GUARD' and item.is_active
     ) then
    raise exception using errcode='check_violation',
      message='SREL_ITEM_WRITER_REQUIRES_ACTIVE_SOURCE mutated';
  end if;

  reset role;
  insert into public.vmp_source_objects(
    object_kind,object_code,source_tab,source_row,is_active
  ) values (
    'Thiết bị','SACCESS-ORPHAN-GUARD','source-access-test',998,false
  );
  set local role authenticated;
  begin
    v_result:=public.rpc_create_plan_item(
      'SACCESS-ORPHAN-GUARD','PQ',2026,2,'{}'::jsonb);
    raise exception using errcode='check_violation',
      message='SREL_ITEM_WRITER_REQUIRES_ACTIVE_NOT_INACTIVE_SOURCE missing_error result='||
              v_result::text;
  exception when foreign_key_violation then
    null;
  end;
  reset role;
  if exists (
       select 1 from public.vmp_plan_items item
       where item.object_code='SACCESS-ORPHAN-GUARD' and item.is_active
     ) then
    raise exception using errcode='check_violation',
      message='SREL_ITEM_WRITER_REQUIRES_ACTIVE_NOT_INACTIVE_SOURCE mutated';
  end if;
  delete from public.vmp_source_objects
  where object_kind='Thiết bị' and object_code='SACCESS-ORPHAN-GUARD';

  select to_jsonb(item) into strict v_plan_before
  from public.vmp_plan_items item
  where item.validation_code='SACCESS-LINE-A/2026.01-PQ';
  select md5(coalesce(jsonb_agg(to_jsonb(assignment)
                  order by assignment.id)::text,'[]'))
    into v_assignments_before
  from public.vmp_item_assignments assignment
  where assignment.validation_code='SACCESS-LINE-A/2026.01-PQ';
  select md5(coalesce(jsonb_agg(to_jsonb(audit)
                  order by audit.id)::text,'[]'))
    into v_audits_before from public.audit_logs audit;
  insert into public.vmp_source_objects(
    object_kind,object_code,source_tab,source_row,is_active,
    owner_person_id,owner_name
  )
  select 'Quy trình','SACCESS-LINE-A','source-access-test',997,false,
         performer.id,performer.performer_name
  from public.vmp_performers performer
  where performer.user_id='9a010000-0000-4000-8000-000000000003';
  if (select to_jsonb(item) from public.vmp_plan_items item
      where item.validation_code='SACCESS-LINE-A/2026.01-PQ')
       is distinct from v_plan_before
     or (select md5(coalesce(jsonb_agg(to_jsonb(assignment)
                         order by assignment.id)::text,'[]'))
         from public.vmp_item_assignments assignment
         where assignment.validation_code='SACCESS-LINE-A/2026.01-PQ')
          is distinct from v_assignments_before
     or (select md5(coalesce(jsonb_agg(to_jsonb(audit)
                         order by audit.id)::text,'[]'))
         from public.audit_logs audit) is distinct from v_audits_before then
    raise exception using errcode='check_violation',
      message='SREL_INACTIVE_DUPLICATE_SOURCE_CANNOT_RECONCILE_ACTIVE_PROJECTION';
  end if;
  begin
    update public.vmp_source_objects
    set is_active=true
    where object_kind='Quy trình' and object_code='SACCESS-LINE-A';
    raise exception using errcode='check_violation',
      message='SREL_SECOND_ACTIVE_SOURCE_CODE_ACTIVATION_DENIED missing_error';
  exception when unique_violation then
    null;
  end;
  if (select count(*) from public.vmp_source_objects
      where object_code='SACCESS-LINE-A' and is_active)<>1
     or not exists (
       select 1 from public.vmp_source_objects
       where object_kind='Quy trình' and object_code='SACCESS-LINE-A'
         and not is_active
     ) then
    raise exception using errcode='check_violation',
      message='SREL_SECOND_ACTIVE_SOURCE_CODE_ACTIVATION_DENIED mutated';
  end if;
  delete from public.vmp_source_objects
  where object_kind='Quy trình' and object_code='SACCESS-LINE-A';

  -- Activation is the only time an inactive row may begin reconciling. Build
  -- a deliberate pre-enforcement-style active-plan drift under a disabled
  -- relation guard, then prove inactive -> active repairs it atomically.
  insert into public.vmp_source_objects(
    object_kind,object_code,source_tab,source_row,is_active,
    owner_person_id,owner_name
  )
  select 'Thiết bị','SACCESS-ORPHAN-GUARD','source-access-test',996,false,
         performer.id,performer.performer_name
  from public.vmp_performers performer
  where performer.user_id='9a010000-0000-4000-8000-000000000003';
  execute 'alter table public.vmp_plan_items disable trigger vmp_plan_items_active_source_guard';
  insert into public.vmp_plan_items(
    id,validation_code,object_code,validation_type,year,is_active,
    created_by,updated_by
  ) values (
    'SACCESS-ORPHAN-GUARD/2026.03-PQ',
    'SACCESS-ORPHAN-GUARD/2026.03-PQ','SACCESS-ORPHAN-GUARD','PQ',2026,true,
    auth.uid(),auth.uid()
  );
  execute 'alter table public.vmp_plan_items enable trigger vmp_plan_items_active_source_guard';
  update public.vmp_source_objects
  set is_active=true
  where object_kind='Thiết bị' and object_code='SACCESS-ORPHAN-GUARD';
  if not exists (
       select 1 from public.vmp_plan_items item
       join public.vmp_source_objects source_object
         on source_object.object_code=item.object_code
        and source_object.is_active
       where item.validation_code='SACCESS-ORPHAN-GUARD/2026.03-PQ'
         and item.owner_person_id=source_object.owner_person_id
     ) or not exists (
       select 1 from public.vmp_item_assignments assignment
       join public.vmp_source_objects source_object
         on source_object.owner_person_id=assignment.performer_id
        and source_object.object_code='SACCESS-ORPHAN-GUARD'
        and source_object.is_active
       where assignment.validation_code='SACCESS-ORPHAN-GUARD/2026.03-PQ'
         and assignment.assignment_kind='qa'
         and assignment.assignment_role='primary'
         and assignment.source='source_owner' and assignment.is_active
     ) then
    raise exception using errcode='check_violation',
      message='SREL_INACTIVE_TO_ACTIVE_SOURCE_RECONCILES_PROJECTION';
  end if;
  delete from public.vmp_item_assignments
  where validation_code='SACCESS-ORPHAN-GUARD/2026.03-PQ';
  delete from public.vmp_plan_items
  where validation_code='SACCESS-ORPHAN-GUARD/2026.03-PQ';
  delete from public.vmp_source_objects
  where object_kind='Thiết bị' and object_code='SACCESS-ORPHAN-GUARD';

  begin
    update public.vmp_source_objects
    set object_code='SACCESS-REKEY-MUST-FAIL'
    where object_code='SACCESS-LINE-A' and is_active;
    raise exception using errcode='check_violation',
      message='SREL_SOURCE_REKEY_WITH_ACTIVE_ITEMS_DENIED missing_error';
  exception when foreign_key_violation then
    null;
  end;
  if not exists (
    select 1 from public.vmp_source_objects
    where object_code='SACCESS-LINE-A' and is_active
  ) then
    raise exception using errcode='check_violation',
      message='SREL_SOURCE_REKEY_WITH_ACTIVE_ITEMS_DENIED mutated';
  end if;
  begin
    delete from public.vmp_source_objects
    where object_code='SACCESS-LINE-A' and is_active;
    raise exception using errcode='check_violation',
      message='SREL_SOURCE_DELETE_WITH_ACTIVE_ITEMS_DENIED missing_error';
  exception when foreign_key_violation then
    null;
  end;
  if not exists (
    select 1 from public.vmp_source_objects
    where object_code='SACCESS-LINE-A' and is_active
  ) then
    raise exception using errcode='check_violation',
      message='SREL_SOURCE_DELETE_WITH_ACTIVE_ITEMS_DENIED mutated';
  end if;

  v_source_before:=pg_temp.source_snapshot('SACCESS-LINE-A');
  begin
    update public.vmp_source_objects
    set owner_person_id=pg_temp.performer_id(
      '9a010000-0000-4000-8000-000000000008')
    where object_code='SACCESS-LINE-A' and is_active;
    raise exception using errcode='P7778',
      message='SREL_DIRECT_INVALID_OWNER_UPDATE_DENIED missing_error';
  exception when check_violation then
    null;
  end;
  begin
    insert into public.vmp_source_objects(
      object_kind,object_code,source_tab,source_row,owner_person_id
    ) values (
      'Thiết bị','SACCESS-DIRECT-OWNER-INSERT','source-access-test',999,
      pg_temp.performer_id('9a010000-0000-4000-8000-000000000008')
    );
    raise exception using errcode='P7778',
      message='SREL_DIRECT_INVALID_OWNER_INSERT_DENIED missing_error';
  exception when check_violation then
    null;
  end;
  if exists (
       select 1 from public.vmp_source_objects
       where object_code='SACCESS-DIRECT-OWNER-INSERT'
     ) or pg_temp.source_snapshot('SACCESS-LINE-A') is distinct from
          v_source_before then
    raise exception using errcode='check_violation',
      message='SREL_DIRECT_INVALID_OWNER_WRITES_MUTATION_FREE';
  end if;

  -- A valid unreviewed owner write cannot bypass projection either. Prove the
  -- Source, plan-item, and assignment rows reconcile, then intentionally roll
  -- the nested statement subtransaction back so later tests keep their fixture.
  begin
    update public.vmp_source_objects
    set owner_person_id=pg_temp.performer_id(
      '9a010000-0000-4000-8000-000000000005')
    where object_code='SACCESS-LINE-A' and is_active;
    if not exists (
         select 1 from public.vmp_plan_items item
         where item.object_code='SACCESS-LINE-A' and item.is_active
           and item.owner_person_id=pg_temp.performer_id(
             '9a010000-0000-4000-8000-000000000005')
       ) or not exists (
         select 1 from public.vmp_item_assignments assignment
         join public.vmp_plan_items item
           on item.validation_code=assignment.validation_code
         where item.object_code='SACCESS-LINE-A' and item.is_active
           and assignment.performer_id=pg_temp.performer_id(
             '9a010000-0000-4000-8000-000000000005')
           and assignment.assignment_kind='qa'
           and assignment.assignment_role='primary'
           and assignment.is_active
       ) then
      raise exception using errcode='check_violation',
        message='SREL_DIRECT_VALID_OWNER_NOT_RECONCILED';
    end if;
    raise exception using errcode='P7777',
      message='SREL_DIRECT_VALID_OWNER_RECONCILED_ROLLBACK';
  exception when sqlstate 'P7777' then
    if sqlerrm<>'SREL_DIRECT_VALID_OWNER_RECONCILED_ROLLBACK' then
      raise;
    end if;
  end;
  if pg_temp.source_snapshot('SACCESS-LINE-A') is distinct from
       v_source_before then
    raise exception using errcode='check_violation',
      message='SREL_DIRECT_VALID_OWNER_ROLLBACK_FAILED';
  end if;
  perform set_config('request.jwt.claims',json_build_object(
    'sub','9a010000-0000-4000-8000-000000000002',
    'role','service_role')::text,true);
  set local role service_role;
  v_result:=public.rpc_upsert_source_object(
    'Thiết bị','SACCESS-LINE-A',jsonb_build_object(
      'owner_person_id',pg_temp.performer_id(
        '9a010000-0000-4000-8000-000000000008')));
  reset role;
  perform pg_temp.assert_code(v_result,'PERSON_NOT_ELIGIBLE',
    'SREL_SERVICE_UPSERT_CANNOT_BYPASS_QA_ELIGIBILITY');
  if pg_temp.source_snapshot('SACCESS-LINE-A') is distinct from v_source_before then
    raise exception using errcode='check_violation',
      message='SREL_UNREVIEWED_OWNER_WRITERS_MUTATION_FREE';
  end if;
  set local role authenticated;
end
$writer_relation_guards$;

reset role;
insert into public.vmp_catalog_changes(
  object_kind,object_code,source_version,timeline_revision,
  old_data,new_data,created_by
) values (
  'Thiết bị','SACCESS-LINE-A',
  pg_temp.source_version('SACCESS-LINE-A'),1,
  jsonb_build_object('frequency_months',12,
    'owner_person_id',pg_temp.performer_id(
      '9a010000-0000-4000-8000-000000000005')),
  jsonb_build_object('frequency_months',6,
    'support_person_id',pg_temp.performer_id(
      '9a010000-0000-4000-8000-000000000005')),
  '9a010000-0000-4000-8000-000000000002'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.vmp_catalog_changes change
    where change.object_code='SACCESS-LINE-A'
      and (change.old_data ? 'owner_person_id'
           or change.old_data ? 'support_person_id'
           or change.new_data ? 'owner_person_id'
           or change.new_data ? 'support_person_id')
  ),'SQA_CATALOG_PENDING_TRIGGER_STRIPS_ACCESS_FOR_V1_V2');

alter table public.vmp_catalog_changes
  disable trigger vmp_catalog_changes_timeline_only;
insert into public.vmp_catalog_changes(
  id,object_kind,object_code,source_version,timeline_revision,
  old_data,new_data,created_by
) values (
  '9a010000-0000-4000-8000-0000000002ff',
  'Thiết bị','SACCESS-LINE-A',pg_temp.source_version('SACCESS-LINE-A'),
  (select timeline_revision from public.vmp_source_objects
   where object_code='SACCESS-LINE-A' and is_active),
  '{"frequency_months":12,"owner_person_id":null}'::jsonb,
  jsonb_build_object('frequency_months',3,
    'owner_person_id',pg_temp.performer_id(
      '9a010000-0000-4000-8000-000000000003')),
  '9a010000-0000-4000-8000-000000000002'
);
alter table public.vmp_catalog_changes
  enable trigger vmp_catalog_changes_timeline_only;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object(
  'sub','9a010000-0000-4000-8000-000000000002',
  'role','authenticated')::text,true);
do $legacy_access_replay_rejected$
declare
  v_before jsonb;
  v_result jsonb;
  v_revision integer;
begin
  reset role;
  v_before:=pg_temp.source_snapshot('SACCESS-LINE-A');
  select timeline_revision into strict v_revision
  from public.vmp_source_objects
  where object_code='SACCESS-LINE-A' and is_active;
  set local role authenticated;

  v_result:=public.rpc_preview_catalog_change(
    '9a010000-0000-4000-8000-0000000002ff');
  perform pg_temp.assert_code(v_result,'ACCESS_FIELDS_NOT_APPLICABLE',
    'SQA_V1_PREVIEW_REJECTS_LEGACY_ACCESS_KEYS');
  v_result:=public.rpc_apply_catalog_change(
    '9a010000-0000-4000-8000-0000000002ff',
    'Legacy V1 replay must fail',v_revision);
  perform pg_temp.assert_code(v_result,'ACCESS_FIELDS_NOT_APPLICABLE',
    'SQA_V1_APPLY_REJECTS_LEGACY_ACCESS_KEYS');
  v_result:=public.rpc_preview_catalog_change_v2(
    '9a010000-0000-4000-8000-0000000002ff');
  perform pg_temp.assert_code(v_result,'ACCESS_FIELDS_NOT_APPLICABLE',
    'SQA_V2_PREVIEW_REJECTS_LEGACY_ACCESS_KEYS');
  v_result:=public.rpc_apply_catalog_change_v2(
    '9a010000-0000-4000-8000-0000000002ff',
    'Legacy V2 replay must fail',v_revision,
    '{}'::jsonb,false);
  perform pg_temp.assert_code(v_result,'ACCESS_FIELDS_NOT_APPLICABLE',
    'SQA_V2_APPLY_REJECTS_LEGACY_ACCESS_KEYS');

  reset role;
  if pg_temp.source_snapshot('SACCESS-LINE-A') is distinct from v_before
     or (select status from public.vmp_catalog_changes
         where id='9a010000-0000-4000-8000-0000000002ff')<>'pending' then
    raise exception using errcode='check_violation',
      message='SQA_V1_V2_ACCESS_REPLAY_REJECTION_MUTATION_FREE';
  end if;
  set local role authenticated;
end
$legacy_access_replay_rejected$;
reset role;
delete from public.vmp_catalog_changes
where id='9a010000-0000-4000-8000-0000000002ff';

select md5(coalesce(jsonb_agg(to_jsonb(assignment)
         order by assignment.id)::text,'[]')) refresh_equipment_before
from public.vmp_item_assignments assignment
where assignment.assignment_kind='equipment_department'
\gset
set local role service_role;
select public.rpc_refresh_source_item_assignments() refresh_first
\gset
reset role;
select md5(coalesce(jsonb_agg(to_jsonb(assignment)
         order by assignment.id)::text,'[]')) refresh_assignments_after_first
from public.vmp_item_assignments assignment
\gset
select md5(coalesce(jsonb_agg(to_jsonb(audit)
         order by audit.id)::text,'[]')) refresh_audits_after_first
from public.audit_logs audit
\gset
set local role service_role;
select public.rpc_refresh_source_item_assignments() refresh_second
\gset
reset role;
select pg_temp.assert_true(
  (:'refresh_first'::jsonb)->>'ok'='true'
  and (:'refresh_second'::jsonb)->>'ok'='true'
  and coalesce((( :'refresh_second'::jsonb)->>'plan_updated')::integer,-1)=0
  and coalesce((( :'refresh_second'::jsonb)->>'inserted')::integer,-1)=0
  and coalesce((( :'refresh_second'::jsonb)->>'reactivated')::integer,-1)=0
  and coalesce((( :'refresh_second'::jsonb)->>'revoked')::integer,-1)=0
  and coalesce((( :'refresh_second'::jsonb)->>'demoted')::integer,-1)=0
  and (select md5(coalesce(jsonb_agg(to_jsonb(assignment)
                    order by assignment.id)::text,'[]'))
       from public.vmp_item_assignments assignment)
      =:'refresh_assignments_after_first'
  and (select md5(coalesce(jsonb_agg(to_jsonb(audit)
                    order by audit.id)::text,'[]'))
       from public.audit_logs audit)=:'refresh_audits_after_first'
  and (select md5(coalesce(jsonb_agg(to_jsonb(assignment)
                    order by assignment.id)::text,'[]'))
       from public.vmp_item_assignments assignment
       where assignment.assignment_kind='equipment_department')
      =:'refresh_equipment_before',
  'SQA_FINAL_SERVICE_REFRESH_PROJECTION_AWARE_EQUIPMENT_ISOLATED_IDEMPOTENT');

\echo 'PASS BUSINESS Source QA owner/support workshop coverage atomic save refresh and immutability'
rollback;

-- These dblink sessions use only the disposable local clone. They exercise
-- both commit orders against the committed pre-expand repair fixture, because
-- rows created by the rollback-only business transaction are intentionally not
-- visible to a second database session.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
create extension if not exists dblink with schema extensions;

create function pg_temp.assert_true(p_condition boolean,p_rule_id text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition,false) then
    raise exception using errcode='check_violation',message=p_rule_id;
  end if;
end
$$;

create temp table source_access_concurrency_result(
  case_name text primary key,payload jsonb not null
) on commit drop;

select extensions.dblink_connect(
  connection_name,
  format('host=host.docker.internal port=54322 user=postgres password=postgres dbname=%s',
         current_database())
)
from unnest(array[
  'saccess_qa_progress','saccess_qa_revoke',
  'saccess_ws_progress','saccess_ws_revoke','saccess_setup'
]) connection_name;

-- QA progress linearizes before owner revoke: progress holds Source KEY SHARE,
-- the canonical save waits for Source UPDATE, then both may commit.
select extensions.dblink_send_query(
  'saccess_qa_progress',format($remote$
    with claims as materialized (
      select set_config('request.jwt.claims',
        '{"sub":"9a040000-0000-4000-8000-000000000001","role":"authenticated"}',true)
    ), locked as materialized (
      select source_object.id from claims,
           public.vmp_source_objects source_object
      where source_object.object_code='SACCESS-PRE-EXPAND'
        and source_object.is_active for key share
    ), paused as materialized (
      select pg_sleep(1) from locked
    )
    select public.rpc_update_progress(
      'SACCESS-PRE-EXPAND/2026.01-PQ',
      '{"status_protocol":"in_progress"}'::jsonb,
      'QA progress-first concurrency proof',null,%s)
    from paused
  $remote$,(select version from public.vmp_plan_items
             where validation_code='SACCESS-PRE-EXPAND/2026.01-PQ'))
);
select pg_sleep(0.2);
select extensions.dblink_send_query(
  'saccess_qa_revoke',format($remote$
    with claims as materialized (
      select set_config('request.jwt.claims',
        '{"sub":"9a040000-0000-4000-8000-000000000001","role":"service_role"}',true)
    )
    select public.rpc_save_catalog_object(
      'Thiết bị','SACCESS-PRE-EXPAND','{"owner_person_id":null}'::jsonb,
      'QA progress-first owner revoke',%s) from claims
  $remote$,(select version from public.vmp_source_objects
             where object_code='SACCESS-PRE-EXPAND' and is_active))
);
insert into source_access_concurrency_result
select 'qa_progress_first_progress',payload
from extensions.dblink_get_result('saccess_qa_progress') as result(payload jsonb);
insert into source_access_concurrency_result
select 'qa_progress_first_revoke',payload
from extensions.dblink_get_result('saccess_qa_revoke') as result(payload jsonb);
-- libpq exposes a trailing empty result after every asynchronous query. Drain
-- it before reusing either named connection for the opposite commit order.
select payload
from extensions.dblink_get_result('saccess_qa_progress') as result(payload jsonb);
select payload
from extensions.dblink_get_result('saccess_qa_revoke') as result(payload jsonb);
select pg_temp.assert_true(
  (select payload->>'ok' from source_access_concurrency_result
   where case_name='qa_progress_first_progress')='true'
  and (select payload->>'ok' from source_access_concurrency_result
       where case_name='qa_progress_first_revoke')='true',
  'SQA_CONCURRENCY_PROGRESS_BEFORE_REVOKE_BOTH_LINEARIZE');

-- Restore the owner, then hold Source UPDATE in the revoke session. Progress
-- starts second, waits at Source KEY SHARE, and must deny after revoke commits.
select payload from extensions.dblink(
  'saccess_setup',format($remote$
    with claims as materialized (
      select set_config('request.jwt.claims',
        '{"sub":"9a040000-0000-4000-8000-000000000001","role":"service_role"}',true)
    )
    select public.rpc_save_catalog_object(
      'Thiết bị','SACCESS-PRE-EXPAND',jsonb_build_object(
        'owner_person_id',(select id from public.vmp_performers
          where user_id='9a040000-0000-4000-8000-000000000001'::uuid
            and is_active)),
      'Restore QA owner for revoke-first proof',%s) from claims
  $remote$,(select version from public.vmp_source_objects
             where object_code='SACCESS-PRE-EXPAND' and is_active))
) as result(payload jsonb)
\gset qa_restore_
select pg_temp.assert_true(
  :'qa_restore_payload'::jsonb->>'ok'='true',
  'SQA_CONCURRENCY_OWNER_RESTORE');

truncate source_access_concurrency_result;
select extensions.dblink_send_query(
  'saccess_qa_revoke',format($remote$
    with claims as materialized (
      select set_config('request.jwt.claims',
        '{"sub":"9a040000-0000-4000-8000-000000000001","role":"service_role"}',true)
    ), locked as materialized (
      select source_object.id from claims,
           public.vmp_source_objects source_object
      where source_object.object_code='SACCESS-PRE-EXPAND'
        and source_object.is_active for update
    ), paused as materialized (select pg_sleep(1) from locked)
    select public.rpc_save_catalog_object(
      'Thiết bị','SACCESS-PRE-EXPAND','{"owner_person_id":null}'::jsonb,
      'QA revoke-first concurrency proof',%s) from paused
  $remote$,(select version from public.vmp_source_objects
             where object_code='SACCESS-PRE-EXPAND' and is_active))
);
select pg_sleep(0.2);
select extensions.dblink_send_query(
  'saccess_qa_progress',format($remote$
    with claims as materialized (
      select set_config('request.jwt.claims',
        '{"sub":"9a040000-0000-4000-8000-000000000001","role":"authenticated"}',true)
    )
    select public.rpc_update_progress(
      'SACCESS-PRE-EXPAND/2026.01-PQ',
      '{"status_protocol":"completed"}'::jsonb,
      'QA revoke-first must deny',null,%s) from claims
  $remote$,(select version from public.vmp_plan_items
             where validation_code='SACCESS-PRE-EXPAND/2026.01-PQ'))
);
insert into source_access_concurrency_result
select 'qa_revoke_first_revoke',payload
from extensions.dblink_get_result('saccess_qa_revoke') as result(payload jsonb);
insert into source_access_concurrency_result
select 'qa_revoke_first_progress',payload
from extensions.dblink_get_result('saccess_qa_progress') as result(payload jsonb);
select pg_temp.assert_true(
  (select payload->>'ok' from source_access_concurrency_result
   where case_name='qa_revoke_first_revoke')='true'
  and (select payload->>'ok' from source_access_concurrency_result
       where case_name='qa_revoke_first_progress')='false'
  and (select payload->>'code' from source_access_concurrency_result
       where case_name='qa_revoke_first_progress')='item_field_forbidden',
  'SQA_CONCURRENCY_REVOKE_BEFORE_PROGRESS_DENIES');

-- Create one committed workshop actor only inside the disposable clone.
select extensions.dblink_exec('saccess_setup',$remote$
  insert into auth.users(
    id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at
  ) values (
    '9a050000-0000-4000-8000-000000000001','authenticated','authenticated',
    'source-concurrency-workshop@example.test','x',now(),'{}','{}',now(),now()
  );
  insert into public.profiles(
    id,full_name,email,role,department,is_active
  ) values (
    '9a050000-0000-4000-8000-000000000001',
    'Source Concurrency Workshop','source-concurrency-workshop@example.test',
    'department_user','QA',true
  );
  update public.vmp_performers set department='QA',
    access_class='workshop_staff',is_active=true
  where user_id='9a050000-0000-4000-8000-000000000001';
  insert into public.vmp_source_workshop_scope_grants(
    id,performer_id,department,department_key,area_code,area_key,line,line_key,
    valid_from,is_active,version,change_reason
  ) select '9a050000-0000-4000-8000-000000000101',performer.id,
    'QA',public.vmp_source_scope_key('QA'),
    'SACCESS_PRE_AREA',public.vmp_source_scope_key('SACCESS_PRE_AREA'),
    'SACCESS_PRE_LINE',public.vmp_source_scope_key('SACCESS_PRE_LINE'),
    transaction_timestamp(),true,1,'Workshop concurrency fixture'
  from public.vmp_performers performer
  where performer.user_id='9a050000-0000-4000-8000-000000000001';
  insert into public.vmp_item_assignments(
    validation_code,performer_id,user_id,staff_name,assignment_kind,source,
    assignment_role,is_active,change_reason
  ) select 'SACCESS-PRE-EXPAND/2026.01-PQ',performer.id,performer.user_id,
    performer.performer_name,'equipment_department','equipment_manager',
    null,true,'Workshop concurrency fixture'
  from public.vmp_performers performer
  where performer.user_id='9a050000-0000-4000-8000-000000000001';
$remote$);

select profile.id admin_id from public.profiles profile
where profile.is_active and public.vmp_business_role(profile.id)='admin'
order by profile.id limit 1
\gset

-- Workshop progress-first holds grant SHARE; manager revoke waits for UPDATE.
truncate source_access_concurrency_result;
select extensions.dblink_send_query(
  'saccess_ws_progress',format($remote$
    with claims as materialized (
      select set_config('request.jwt.claims',
        '{"sub":"9a050000-0000-4000-8000-000000000001","role":"authenticated"}',true)
    ), source_lock as materialized (
      select source_object.id from claims,
           public.vmp_source_objects source_object
      where source_object.object_code='SACCESS-PRE-EXPAND'
        and source_object.is_active for key share
    ), grant_lock as materialized (
      select grant_row.id from source_lock,
           public.vmp_source_workshop_scope_grants grant_row
      where grant_row.id='9a050000-0000-4000-8000-000000000101'
        and grant_row.is_active for share
    ), paused as materialized (select pg_sleep(1) from grant_lock)
    select public.rpc_update_progress(
      'SACCESS-PRE-EXPAND/2026.01-PQ',
      jsonb_build_object('actual_validation_date',current_date),
      'Workshop progress-first concurrency proof',null,%s) from paused
  $remote$,(select version from public.vmp_plan_items
             where validation_code='SACCESS-PRE-EXPAND/2026.01-PQ'))
);
select pg_sleep(0.2);
select revision ws_pf_revision_before
from public.vmp_authorization_revision where singleton
\gset
select extensions.dblink_send_query(
  'saccess_ws_revoke',format($remote$
    with claims as materialized (
      select set_config('request.jwt.claims',
        '{"sub":"%s","role":"authenticated"}',true)
    )
    select public.rpc_set_source_workshop_scope_grant(
      '9a050000-0000-4000-8000-000000000101',
      (select id from public.vmp_performers where
       user_id='9a050000-0000-4000-8000-000000000001' and is_active),
      'QA','SACCESS_PRE_AREA','SACCESS_PRE_LINE',false,
      'Workshop progress-first scope revoke',1) from claims
  $remote$,:'admin_id')
);
insert into source_access_concurrency_result
select 'ws_progress_first_progress',payload
from extensions.dblink_get_result('saccess_ws_progress') as result(payload jsonb);
insert into source_access_concurrency_result
select 'ws_progress_first_revoke',payload
from extensions.dblink_get_result('saccess_ws_revoke') as result(payload jsonb);
select payload
from extensions.dblink_get_result('saccess_ws_progress') as result(payload jsonb);
select payload
from extensions.dblink_get_result('saccess_ws_revoke') as result(payload jsonb);
select pg_temp.assert_true(
  (select payload->>'ok' from source_access_concurrency_result
   where case_name='ws_progress_first_progress')='true'
  and (select payload->>'ok' from source_access_concurrency_result
       where case_name='ws_progress_first_revoke')='true',
  'SWS_CONCURRENCY_PROGRESS_BEFORE_REVOKE_BOTH_LINEARIZE');
select pg_temp.assert_true(
  (select revision from public.vmp_authorization_revision where singleton)=
    :'ws_pf_revision_before'::bigint+1,
  'SWS_SCOPE_SETTER_TOUCHES_AUTHORIZATION_REVISION_EXACTLY_ONCE');

-- Restore, then hold grant UPDATE in revoke-first order. Progress waits at its
-- grant SHARE lock and denies after the revoke commits.
select payload from extensions.dblink(
  'saccess_setup',format($remote$
    with claims as materialized (
      select set_config('request.jwt.claims',
        '{"sub":"%s","role":"authenticated"}',true)
    )
    select public.rpc_set_source_workshop_scope_grant(
      '9a050000-0000-4000-8000-000000000101',
      (select id from public.vmp_performers where
       user_id='9a050000-0000-4000-8000-000000000001' and is_active),
      'QA','SACCESS_PRE_AREA','SACCESS_PRE_LINE',true,
      'Restore workshop scope for revoke-first proof',2) from claims
  $remote$,:'admin_id')
) as result(payload jsonb)
\gset ws_restore_
select pg_temp.assert_true(
  :'ws_restore_payload'::jsonb->>'ok'='true',
  'SWS_CONCURRENCY_SCOPE_RESTORE');

truncate source_access_concurrency_result;
select extensions.dblink_send_query(
  'saccess_ws_revoke',format($remote$
    with claims as materialized (
      select set_config('request.jwt.claims',
        '{"sub":"%s","role":"authenticated"}',true)
    ), source_lock as materialized (
      select source_object.id from claims,
           public.vmp_source_objects source_object
      where source_object.object_code='SACCESS-PRE-EXPAND'
        and source_object.is_active for key share
    ), grant_lock as materialized (
      select grant_row.id from source_lock,
           public.vmp_source_workshop_scope_grants grant_row
      where grant_row.id='9a050000-0000-4000-8000-000000000101'
        for update
    ), paused as materialized (select pg_sleep(1) from grant_lock)
    select public.rpc_set_source_workshop_scope_grant(
      '9a050000-0000-4000-8000-000000000101',
      (select id from public.vmp_performers where
       user_id='9a050000-0000-4000-8000-000000000001' and is_active),
      'QA','SACCESS_PRE_AREA','SACCESS_PRE_LINE',false,
      'Workshop revoke-first concurrency proof',3) from paused
  $remote$,:'admin_id')
);
select pg_sleep(0.2);
select extensions.dblink_send_query(
  'saccess_ws_progress',format($remote$
    with claims as materialized (
      select set_config('request.jwt.claims',
        '{"sub":"9a050000-0000-4000-8000-000000000001","role":"authenticated"}',true)
    )
    select public.rpc_update_progress(
      'SACCESS-PRE-EXPAND/2026.01-PQ',
      jsonb_build_object('actual_validation_date',current_date-1),
      'Workshop revoke-first must deny',null,%s) from claims
  $remote$,(select version from public.vmp_plan_items
             where validation_code='SACCESS-PRE-EXPAND/2026.01-PQ'))
);
insert into source_access_concurrency_result
select 'ws_revoke_first_revoke',payload
from extensions.dblink_get_result('saccess_ws_revoke') as result(payload jsonb);
insert into source_access_concurrency_result
select 'ws_revoke_first_progress',payload
from extensions.dblink_get_result('saccess_ws_progress') as result(payload jsonb);
select pg_temp.assert_true(
  (select payload->>'ok' from source_access_concurrency_result
   where case_name='ws_revoke_first_revoke')='true'
  and (select payload->>'ok' from source_access_concurrency_result
       where case_name='ws_revoke_first_progress')='false'
  and (select payload->>'code' from source_access_concurrency_result
       where case_name='ws_revoke_first_progress')='item_field_forbidden',
  'SWS_CONCURRENCY_REVOKE_BEFORE_PROGRESS_DENIES');

select extensions.dblink_exec('saccess_setup',$remote$
  update public.vmp_plan_items
  set updated_by='9a040000-0000-4000-8000-000000000001'
  where updated_by='9a050000-0000-4000-8000-000000000001';
  delete from public.vmp_progress_events
  where changed_by='9a050000-0000-4000-8000-000000000001';
  delete from public.audit_logs
  where user_id='9a050000-0000-4000-8000-000000000001';
  delete from public.vmp_item_assignments
  where user_id='9a050000-0000-4000-8000-000000000001';
  delete from public.vmp_source_workshop_scope_grants
  where id='9a050000-0000-4000-8000-000000000101';
  delete from public.vmp_performers
  where user_id='9a050000-0000-4000-8000-000000000001';
  delete from public.profiles
  where id='9a050000-0000-4000-8000-000000000001';
  delete from auth.users
  where id='9a050000-0000-4000-8000-000000000001';
$remote$);

-- Drain the trailing empty results from the earlier QA revoke-first async
-- pair before reusing those exact connections for lock-order regressions.
select payload from extensions.dblink_get_result(
  'saccess_qa_progress') as result(payload jsonb);
select payload from extensions.dblink_get_result(
  'saccess_qa_revoke') as result(payload jsonb);

-- Deployment gate regression: the canonical writer holds its object advisory,
-- then a Source tuple, then asks for ROW EXCLUSIVE through UPDATE. The
-- migration-shaped session drains that same advisory before Source SRX. Both
-- complete; taking SRX before the advisory would form a table/tuple cycle.
select extensions.dblink_exec('saccess_qa_progress',$remote$
  create function pg_temp.saccess_source_row_then_update()
  returns jsonb language plpgsql as $function$
  declare v_source_id uuid;
  begin
    perform set_config('lock_timeout','5s',true);
    perform public.vmp_lock_catalog_object_v2(
      'Thiết bị','SACCESS-PRE-EXPAND');
    select source_object.id into strict v_source_id
    from public.vmp_source_objects source_object
    where source_object.object_code='SACCESS-PRE-EXPAND'
      and source_object.is_active for update;
    perform pg_sleep(1);
    update public.vmp_source_objects source_object
    set owner_name=source_object.owner_name where source_object.id=v_source_id;
    return jsonb_build_object('ok',true);
  end
  $function$;
$remote$);
select extensions.dblink_exec('saccess_qa_revoke',$remote$
  create function pg_temp.saccess_enforce_source_gate()
  returns jsonb language plpgsql as $function$
  begin
    perform set_config('lock_timeout','5s',true);
    lock table public.profiles in share row exclusive mode;
    lock table public.vmp_performers in share row exclusive mode;
    perform public.vmp_lock_catalog_object_v2(
      'Thiết bị','SACCESS-PRE-EXPAND');
    lock table public.vmp_source_objects in share row exclusive mode;
    perform 1 from public.vmp_source_objects source_object
    where source_object.object_code='SACCESS-PRE-EXPAND'
      and source_object.is_active for update;
    return jsonb_build_object('ok',true);
  end
  $function$;
$remote$);
truncate source_access_concurrency_result;
select extensions.dblink_send_query(
  'saccess_qa_progress','select pg_temp.saccess_source_row_then_update()');
select pg_sleep(0.2);
select extensions.dblink_send_query(
  'saccess_qa_revoke','select pg_temp.saccess_enforce_source_gate()');
insert into source_access_concurrency_result
select 'deployment_source_writer',payload
from extensions.dblink_get_result('saccess_qa_progress') as result(payload jsonb);
insert into source_access_concurrency_result
select 'deployment_source_gate',payload
from extensions.dblink_get_result('saccess_qa_revoke') as result(payload jsonb);
select payload from extensions.dblink_get_result(
  'saccess_qa_progress') as result(payload jsonb);
select payload from extensions.dblink_get_result(
  'saccess_qa_revoke') as result(payload jsonb);
select pg_temp.assert_true(
  (select bool_and(payload->>'ok'='true')
   from source_access_concurrency_result),
  'SDEPLOY_SOURCE_ADVISORY_DRAIN_PRECEDES_SRX_TABLE_GATE');

-- Runtime relation regression: Source reconciliation holds Source then asks
-- for plan; the reviewed sheet writer must acquire that exact Source/master
-- relation before its implementation tuple-locks plan. The row trigger is the
-- NOWAIT validation backstop after this per-object ordering gate.
select extensions.dblink_exec('saccess_qa_progress',$remote$
  create function pg_temp.saccess_source_then_reconcile()
  returns jsonb language plpgsql as $function$
  declare v_source_id uuid;
  begin
    perform set_config('lock_timeout','5s',true);
    select source_object.id into strict v_source_id
    from public.vmp_source_objects source_object
    where source_object.object_code='SACCESS-PRE-EXPAND'
      and source_object.is_active for update;
    perform pg_sleep(1);
    perform public.vmp_reconcile_source_qa_projection(v_source_id);
    return jsonb_build_object('ok',true);
  end
  $function$;
$remote$);
select extensions.dblink_exec('saccess_qa_revoke',$remote$
  create function pg_temp.saccess_plan_relation_update()
  returns jsonb language plpgsql as $function$
  begin
    perform set_config('lock_timeout','5s',true);
    return public.rpc_apply_sheet_sync(
      'update','SACCESS-PRE-EXPAND/2026.01-PQ',
      jsonb_build_object('object_code','SACCESS-PRE-EXPAND'));
  end
  $function$;
$remote$);
truncate source_access_concurrency_result;
select extensions.dblink_send_query(
  'saccess_qa_progress','select pg_temp.saccess_source_then_reconcile()');
select pg_sleep(0.2);
select extensions.dblink_send_query(
  'saccess_qa_revoke','select pg_temp.saccess_plan_relation_update()');
insert into source_access_concurrency_result
select 'runtime_source_reconcile',payload
from extensions.dblink_get_result('saccess_qa_progress') as result(payload jsonb);
insert into source_access_concurrency_result
select 'runtime_plan_relation',payload
from extensions.dblink_get_result('saccess_qa_revoke') as result(payload jsonb);
select payload from extensions.dblink_get_result(
  'saccess_qa_progress') as result(payload jsonb);
select payload from extensions.dblink_get_result(
  'saccess_qa_revoke') as result(payload jsonb);
select pg_temp.assert_true(
  (select bool_and(payload->>'ok'='true')
   from source_access_concurrency_result),
  'SRUNTIME_PLAN_RELATION_EXACT_SOURCE_PRELOCK_PRECEDES_ITEM_TUPLE');

-- Per-object scope regression: holding the complete relation-write lock set
-- for Source A must not block a Source tuple update for unrelated Source B.
-- The rejected global statement/table gate would time out the B session.
select extensions.dblink_exec('saccess_qa_progress',$remote$
  create function pg_temp.saccess_hold_relation_a()
  returns jsonb language plpgsql as $function$
  declare v_result jsonb;
  begin
    perform set_config('lock_timeout','5s',true);
    v_result:=public.rpc_apply_sheet_sync(
      'update','SACCESS-PRE-EXPAND/2026.01-PQ',
      jsonb_build_object('object_code','SACCESS-PRE-EXPAND'));
    perform pg_sleep(1);
    return v_result;
  end
  $function$;
$remote$);
select extensions.dblink_exec('saccess_qa_revoke',$remote$
  create function pg_temp.saccess_update_unrelated_source_b()
  returns jsonb language plpgsql as $function$
  begin
    perform set_config('lock_timeout','500ms',true);
    perform 1 from public.vmp_source_objects source_object
    where source_object.object_code='SACCESS-SUPPORT-ONLY'
      and source_object.is_active for update;
    return jsonb_build_object('ok',true);
  end
  $function$;
$remote$);
truncate source_access_concurrency_result;
select extensions.dblink_send_query(
  'saccess_qa_progress','select pg_temp.saccess_hold_relation_a()');
select pg_sleep(0.2);
select extensions.dblink_send_query(
  'saccess_qa_revoke','select pg_temp.saccess_update_unrelated_source_b()');
insert into source_access_concurrency_result
select 'runtime_relation_source_a',payload
from extensions.dblink_get_result('saccess_qa_progress') as result(payload jsonb);
insert into source_access_concurrency_result
select 'runtime_unrelated_source_b',payload
from extensions.dblink_get_result('saccess_qa_revoke') as result(payload jsonb);
select payload from extensions.dblink_get_result(
  'saccess_qa_progress') as result(payload jsonb);
select payload from extensions.dblink_get_result(
  'saccess_qa_revoke') as result(payload jsonb);
select pg_temp.assert_true(
  (select bool_and(payload->>'ok'='true')
   from source_access_concurrency_result),
  'SRUNTIME_RELATION_PRELOCK_DOES_NOT_BLOCK_UNRELATED_SOURCE');

select extensions.dblink_disconnect(connection_name)
from unnest(array[
  'saccess_qa_progress','saccess_qa_revoke',
  'saccess_ws_progress','saccess_ws_revoke','saccess_setup'
]) connection_name;

\echo 'PASS CONCURRENCY QA/workshop revocation and Source/plan deployment/runtime lock orders'
rollback;

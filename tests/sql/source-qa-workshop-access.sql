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
where item.validation_code like 'SACCESS-%/2026.01-PQ'
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
declare v_result jsonb;
begin
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

\echo 'PASS BUSINESS Source QA owner/support workshop area/line assignment boundary and immutability'
rollback;

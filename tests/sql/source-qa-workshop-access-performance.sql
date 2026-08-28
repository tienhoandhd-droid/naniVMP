\set ON_ERROR_STOP on

begin;
set local lock_timeout='5s';
set local statement_timeout='300s';

create function pg_temp.assert_true(p_condition boolean,p_rule_id text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition,false) then
    raise exception using errcode='check_violation',message=p_rule_id;
  end if;
end
$$;

create function pg_temp.explain_json(p_sql text)
returns jsonb language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare v_plan jsonb;
begin
  execute 'explain (analyze, buffers, format json) '||p_sql into v_plan;
  return v_plan;
end
$$;

create function pg_temp.assert_plan_indexes(
  p_plan jsonb,p_indexes text[],p_rule_id text
)
returns void language plpgsql as $$
declare v_index text;
begin
  foreach v_index in array p_indexes loop
    if p_plan::text not like '%'||v_index||'%' then
      raise exception using errcode='check_violation',
        message=format('%s missing_index=%s',p_rule_id,v_index);
    end if;
  end loop;
end
$$;

select pg_temp.assert_true(
  to_regclass('public.vmp_source_workshop_scope_grants') is not null
  and to_regprocedure(
    'public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)'
  ) is not null
  and to_regprocedure('public.rpc_source_qa_candidates(text,jsonb,integer,uuid[])') is not null
  and to_regclass('public.idx_vmp_source_objects_list') is not null
  and to_regclass('public.idx_vmp_source_objects_active_owner') is not null
  and to_regclass('public.idx_vmp_source_objects_active_scope_area') is not null
  and to_regclass('public.idx_vmp_source_objects_active_scope_line') is not null
  and to_regclass('public.idx_vmp_plan_items_object_year_active') is not null
  and to_regclass('public.idx_vmp_source_workshop_grants_area') is not null
  and to_regclass('public.idx_vmp_source_workshop_grants_line') is not null
  and to_regclass('public.idx_vmp_item_assignments_active_performer_validation_kind') is not null
  and to_regclass('public.idx_vmp_performers_active_candidate') is not null,
  'SOURCE_ACCESS_PERFORMANCE_SCHEMA_FUNCTION_OR_INDEX_MISSING rpc_list_source_objects');

insert into public.departments(id,name,short_name)
values ('QA','Source performance QA fixture','QA'),
       ('PERF_WS','Source performance workshop fixture','PFW')
on conflict(id) do nothing;

create temp table perf_people(
  rn integer primary key,user_id uuid not null,performer_id uuid
) on commit drop;
insert into perf_people(rn,user_id)
select series,md5('source-access-performance-user-'||series)::uuid
from generate_series(1,1000) series;

insert into auth.users(
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
select user_id,'authenticated','authenticated',
       format('source-perf-%s@example.test',rn),'x',now(),'{}','{}',now(),now()
from perf_people;

insert into public.profiles(id,full_name,email,role,department,is_active)
select user_id,format('Source Performance Candidate %s',lpad(rn::text,4,'0')),
       format('source-perf-%s@example.test',rn),
       case when rn=1 then 'qa_manager'::public.user_role
            else 'department_user'::public.user_role end,
       case when rn in (2,3) then 'PERF_WS' else 'QA' end,true
from perf_people;

update public.vmp_performers performer
set department=case when people.rn in (2,3) then 'PERF_WS' else 'QA' end,
    access_class=case
      when people.rn=1 then 'qa_manager'
      when people.rn=2 then 'equipment_manager'
      when people.rn=3 then 'workshop_staff'
      else 'qa_progress_editor' end,
    is_active=true
from perf_people people
where performer.user_id=people.user_id;

update perf_people people set performer_id=performer.id
from public.vmp_performers performer where performer.user_id=people.user_id;

select pg_temp.assert_true(
  (select count(*) from perf_people where performer_id is not null)=1000,
  'SOURCE_ACCESS_PERFORMANCE_1000_PERFORMERS');

insert into public.vmp_objects(
  code,name,classification,department,area,line,frequency_months
)
select format('SPERF-%s',lpad(series::text,5,'0')),
       format('Source performance object %s',series),'tb','PERF_WS',
       format('PERF_AREA_%s',lpad((series%100)::text,2,'0')),
       format('PERF_LINE_%s',lpad((series%10)::text,2,'0')),12
from generate_series(1,10000) series;

insert into public.vmp_source_objects(
  id,object_kind,object_code,object_name,department,area_code,line,
  validate_flag,frequency_months,report_class,workdays,first_month,year_ref,
  source_tab,source_row,version,timeline_revision,timeline_applied_revision,
  owner_person_id,support_person_id
)
select md5('source-access-performance-source-'||series)::uuid,
       'Thiết bị',format('SPERF-%s',lpad(series::text,5,'0')),
       format('Source performance object %s',series),'PERF_WS',
       format('PERF_AREA_%s',lpad((series%100)::text,2,'0')),
       format('PERF_LINE_%s',lpad((series%10)::text,2,'0')),
       'y',12,'Hóa lý',5,1,2026,'source-access-performance',series,
       1,0,0,owner_person.performer_id,support_person.performer_id
from generate_series(1,10000) series
join perf_people owner_person on owner_person.rn=((series-1)%997)+4
join perf_people support_person on support_person.rn=(series%997)+4;

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
       true,'active',1,array['PERF_WS'],array['PERF_WS'],
       jsonb_build_object('fixture','source-access-performance'),
       source_object.owner_person_id,source_object.support_person_id
from (
  select series,
         format('SPERF-%s',lpad((((series-1)/2)+1)::text,5,'0')) object_code,
         format('SPERF-%s/2026.%s-PQ',
           lpad((((series-1)/2)+1)::text,5,'0'),
           lpad((((series-1)%2)+1)::text,2,'0')) validation_code
  from generate_series(1,20000) series
) fixture
join public.vmp_source_objects source_object
  on source_object.object_code=fixture.object_code and source_object.is_active;

insert into public.vmp_source_workshop_scope_grants(
  id,performer_id,department,department_key,area_code,area_key,line,line_key,
  valid_from,expires_at,is_active,version,change_reason
)
select md5(format('source-access-performance-grant-%s-%s',people.rn,grant_no))::uuid,
       people.performer_id,'PERF_WS',public.vmp_source_scope_key('PERF_WS'),
       format('PERF_AREA_%s',lpad(((people.rn+grant_no)%100)::text,2,'0')),
       public.vmp_source_scope_key(
         format('PERF_AREA_%s',lpad(((people.rn+grant_no)%100)::text,2,'0'))),
       case when grant_no=5
         then format('PERF_LINE_%s',lpad((people.rn%10)::text,2,'0')) end,
       case when grant_no=5 then public.vmp_source_scope_key(
         format('PERF_LINE_%s',lpad((people.rn%10)::text,2,'0'))) end,
       transaction_timestamp(),null,true,1,'Performance grant fixture'
from perf_people people cross join generate_series(1,5) grant_no;

insert into public.vmp_source_workshop_scope_grants(
  id,performer_id,department,department_key,area_code,area_key,line,line_key,
  valid_from,expires_at,is_active,version,change_reason
)
values
  (md5('source-access-performance-area-actor')::uuid,
   (select performer_id from perf_people where rn=2),
   'PERF_WS',public.vmp_source_scope_key('PERF_WS'),
   'PERF_AREA_00',public.vmp_source_scope_key('PERF_AREA_00'),null,null,
   transaction_timestamp(),null,true,1,'Area actor performance grant'),
  (md5('source-access-performance-line-actor')::uuid,
   (select performer_id from perf_people where rn=3),
   'PERF_WS',public.vmp_source_scope_key('PERF_WS'),
   'PERF_AREA_00',public.vmp_source_scope_key('PERF_AREA_00'),
   'PERF_LINE_00',public.vmp_source_scope_key('PERF_LINE_00'),
   transaction_timestamp(),null,true,1,'Line actor performance grant');

insert into public.vmp_item_assignments(
  validation_code,performer_id,user_id,staff_name,assignment_kind,source,
  assignment_role,is_active,change_reason
)
select format('SPERF-%s/2026.01-PQ',lpad(series::text,5,'0')),
       people.performer_id,people.user_id,performer.performer_name,
       'equipment_department','equipment_manager',null,true,
       'Performance assignment fixture'
from generate_series(1,10000) series
join perf_people people on people.rn=((series-1)%1000)+1
join public.vmp_performers performer on performer.id=people.performer_id;

analyze public.vmp_source_objects;
analyze public.vmp_plan_items;
analyze public.vmp_source_workshop_scope_grants;
analyze public.vmp_item_assignments;
analyze public.vmp_performers;
analyze public.profiles;

select pg_temp.assert_true(
  (select count(*) from public.vmp_source_objects
   where source_tab='source-access-performance')=10000
  and (select count(*) from public.vmp_plan_items
       where validation_code like 'SPERF-%')=20000
  and (select count(*) from perf_people)=1000
  and (select count(*) from public.vmp_source_workshop_scope_grants
       where department='PERF_WS')>=5000
  and (select count(*) from public.vmp_item_assignments
       where source='equipment_manager'
         and validation_code like 'SPERF-%')=10000,
  'SOURCE_ACCESS_PERFORMANCE_CARDINALITIES_10000_20000_1000_5000_10000');

create temp table captured_plan(
  plan_name text primary key,document jsonb not null
) on commit drop;

insert into captured_plan values (
  'qa_list',pg_temp.explain_json(format(
    'select id from public.vmp_source_objects where is_active and owner_person_id=%L::uuid order by id limit 100',
    (select performer_id from perf_people where rn=4)
  ))
),(
  'workshop_area_list',pg_temp.explain_json(format(
    'select source_object.id from public.vmp_source_objects source_object join public.vmp_source_workshop_scope_grants grant_row on grant_row.department_key=public.vmp_source_scope_key(source_object.department) and grant_row.area_key=public.vmp_source_scope_key(source_object.area_code) and grant_row.line_key is null where source_object.is_active and grant_row.is_active and grant_row.performer_id=%L::uuid and source_object.department=%L and source_object.area_code=%L order by source_object.id limit 100',
    (select performer_id from perf_people where rn=2),'PERF_WS','PERF_AREA_00'
  ))
),(
  'workshop_line_list',pg_temp.explain_json(format(
    'select source_object.id from public.vmp_source_objects source_object join public.vmp_source_workshop_scope_grants grant_row on grant_row.department_key=public.vmp_source_scope_key(source_object.department) and grant_row.area_key=public.vmp_source_scope_key(source_object.area_code) and grant_row.line_key=public.vmp_source_scope_key(source_object.line) where source_object.is_active and grant_row.is_active and grant_row.performer_id=%L::uuid and source_object.department=%L and source_object.area_code=%L and source_object.line=%L order by source_object.id limit 100',
    (select performer_id from perf_people where rn=3),'PERF_WS','PERF_AREA_00','PERF_LINE_00'
  ))
),(
  'item_rights_batch',pg_temp.explain_json(format(
    'select item.validation_code,assignment.source from public.vmp_source_objects source_object join public.vmp_plan_items item on item.object_code=source_object.object_code and item.year=2026 and item.is_active left join public.vmp_item_assignments assignment on assignment.validation_code=item.validation_code and assignment.performer_id=%L::uuid and assignment.assignment_kind=%L and assignment.is_active where source_object.is_active and source_object.owner_person_id=%L::uuid order by item.validation_code limit 100',
    (select performer_id from perf_people where rn=4),'qa',
    (select performer_id from perf_people where rn=4)
  ))
),(
  'candidate_search',pg_temp.explain_json(
    'select performer.id from public.vmp_performers performer join public.profiles profile on profile.id=performer.user_id where performer.is_active and profile.is_active and performer.access_class in (''qa_progress_editor'',''qa_manager'') and performer.normalized_full_name>=''source performance candidate'' order by performer.normalized_full_name,performer.id limit 50'
  )
);

select pg_temp.assert_plan_indexes(
  (select document from captured_plan where plan_name='qa_list'),
  array['idx_vmp_source_objects_active_owner'],'SOURCE_ACCESS_PLAN_QA_LIST');
select pg_temp.assert_plan_indexes(
  (select document from captured_plan where plan_name='workshop_area_list'),
  array['idx_vmp_source_objects_active_scope_area','idx_vmp_source_workshop_grants_area'],
  'SOURCE_ACCESS_PLAN_WORKSHOP_AREA_LIST');
select pg_temp.assert_plan_indexes(
  (select document from captured_plan where plan_name='workshop_line_list'),
  array['idx_vmp_source_objects_active_scope_line','idx_vmp_source_workshop_grants_line'],
  'SOURCE_ACCESS_PLAN_WORKSHOP_LINE_LIST');
select pg_temp.assert_plan_indexes(
  (select document from captured_plan where plan_name='item_rights_batch'),
  array['idx_vmp_plan_items_object_year_active','idx_vmp_item_assignments_active_performer_validation_kind'],
  'SOURCE_ACCESS_PLAN_ITEM_RIGHTS_BATCH');
select pg_temp.assert_plan_indexes(
  (select document from captured_plan where plan_name='candidate_search'),
  array['idx_vmp_performers_active_candidate'],'SOURCE_ACCESS_PLAN_CANDIDATE_SEARCH');

set local role authenticated;

select set_config('request.jwt.claims',json_build_object(
  'sub',(select user_id from perf_people where rn=4),'role','authenticated')::text,true);
do $qa_limits$
declare v_list jsonb; v_batch jsonb;
begin
  v_list:=public.rpc_list_source_objects(
    'Thiết bị','SPERF', '{}'::jsonb,null,100,false,null);
  v_batch:=public.rpc_my_editable_progress_rights();
  if v_list->>'ok' is distinct from 'true'
     or jsonb_array_length(v_list->'rows')>100
     or v_batch->>'ok' is distinct from 'true'
     or jsonb_typeof(v_batch->'rights')<>'array' then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_QA_LIST_BATCH_LIMITS';
  end if;
end
$qa_limits$;

select set_config('request.jwt.claims',json_build_object(
  'sub',(select user_id from perf_people where rn=2),'role','authenticated')::text,true);
select pg_temp.assert_true(
  jsonb_array_length(public.rpc_list_source_objects(
    'Thiết bị','SPERF','{}'::jsonb,null,100,false,null)->'rows')<=100,
  'SOURCE_ACCESS_WORKSHOP_AREA_LIST_LIMIT_100');

select set_config('request.jwt.claims',json_build_object(
  'sub',(select user_id from perf_people where rn=3),'role','authenticated')::text,true);
select pg_temp.assert_true(
  jsonb_array_length(public.rpc_list_source_objects(
    'Thiết bị','SPERF','{}'::jsonb,null,100,false,null)->'rows')<=100,
  'SOURCE_ACCESS_WORKSHOP_LINE_LIST_LIMIT_100');

select set_config('request.jwt.claims',json_build_object(
  'sub',(select user_id from perf_people where rn=1),'role','authenticated')::text,true);
select pg_temp.assert_true(
  jsonb_array_length(public.rpc_source_qa_candidates('',null,50,'{}'::uuid[])->'rows')<=50,
  'SOURCE_ACCESS_CANDIDATE_LIMIT_50');

\echo 'PASS PERFORMANCE realistic cardinalities JSON plans reviewed indexes and bounded result sets'
rollback;

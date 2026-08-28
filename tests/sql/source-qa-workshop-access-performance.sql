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

create function pg_temp.assert_plan_contract(
  p_plan jsonb,p_relation text,p_index text,p_rule_id text
)
returns void language plpgsql as $$
begin
  if not exists (
       with recursive plan_node as (
         select p_plan->0->'Plan' node
         union all
         select child.node
         from plan_node parent
         cross join lateral jsonb_array_elements(
           coalesce(parent.node->'Plans','[]'::jsonb)
         ) child(node)
       )
       select 1 from plan_node where node->>'Relation Name'=p_relation
     ) or not exists (
       with recursive plan_node as (
         select p_plan->0->'Plan' node
         union all
         select child.node
         from plan_node parent
         cross join lateral jsonb_array_elements(
           coalesce(parent.node->'Plans','[]'::jsonb)
         ) child(node)
       )
       select 1 from plan_node where node->>'Index Name'=p_index
         and node->>'Node Type' in ('Index Scan','Index Only Scan','Bitmap Index Scan')
     ) then
    raise exception using errcode='check_violation',
      message=format('%s relation=%s index=%s',p_rule_id,p_relation,p_index);
  end if;
  if exists (
       with recursive plan_node as (
         select p_plan->0->'Plan' node
         union all
         select child.node
         from plan_node parent
         cross join lateral jsonb_array_elements(
           coalesce(parent.node->'Plans','[]'::jsonb)
         ) child(node)
       )
       select 1 from plan_node
       where node->>'Node Type' in ('Seq Scan','Parallel Seq Scan')
         and node->>'Relation Name' in (
           'vmp_source_objects','vmp_plan_items','vmp_item_assignments',
           'vmp_source_workshop_scope_grants','vmp_performers'
         )
     ) then
    raise exception using errcode='check_violation',
      message=p_rule_id||' prohibited_protected_relation_seq_scan';
  end if;
end
$$;

select pg_temp.assert_true(
  to_regclass('public.vmp_source_workshop_scope_grants') is not null
  and to_regprocedure(
    'public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)'
  ) is not null
  and to_regprocedure('public.rpc_source_qa_candidates(text,jsonb,integer,uuid[])') is not null
  and to_regprocedure(
    'public.vmp_source_objects_page_path(uuid,text,text,jsonb,jsonb,integer,boolean,uuid)'
  ) is not null
  and to_regprocedure('public.vmp_editable_progress_rights_path(uuid)') is not null
  and to_regprocedure(
    'public.vmp_source_qa_candidates_page_path(uuid,text,jsonb,integer,uuid[])'
  ) is not null
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

create temp table reviewed_query_path(signature text primary key) on commit drop;
insert into reviewed_query_path values
  ('vmp_source_objects_page_path(uuid,text,text,jsonb,jsonb,integer,boolean,uuid)'),
  ('vmp_editable_progress_rights_path(uuid)'),
  ('vmp_source_qa_candidates_page_path(uuid,text,jsonb,integer,uuid[])');

with path_function as (
  select reviewed.signature,procedure.oid,procedure.proname,
         owner.rolname owner_name,language.lanname language_name,
         procedure.provolatile,procedure.prosecdef,procedure.proparallel,
         procedure.proconfig,pg_get_functiondef(procedure.oid) definition
  from reviewed_query_path reviewed
  join pg_proc procedure
    on procedure.oid=to_regprocedure('public.'||reviewed.signature)
  join pg_roles owner on owner.oid=procedure.proowner
  join pg_language language on language.oid=procedure.prolang
), actual_acl as (
  select path.signature,
         case when acl.grantee=0 then 'PUBLIC'
              else acl.grantee::regrole::text end grantee,
         acl.privilege_type,acl.is_grantable
  from path_function path
  join pg_proc procedure on procedure.oid=path.oid
  cross join lateral aclexplode(procedure.proacl) acl
), expected_acl as (
  select reviewed.signature,grantee,'EXECUTE'::text privilege_type,false is_grantable
  from reviewed_query_path reviewed
  cross join lateral unnest(array['postgres','service_role']::text[]) grantee
)
select pg_temp.assert_true(
  (select count(*) from path_function)=3
  and not exists (
    select 1 from path_function
    where owner_name<>'postgres' or language_name<>'sql' or provolatile<>'s'
       or prosecdef or proparallel<>'s' or proconfig is not null
       or definition !~ '\mpublic\.'
  )
  and not exists (select * from actual_acl except select * from expected_acl)
  and not exists (select * from expected_acl except select * from actual_acl)
  and regexp_count(pg_get_functiondef(
        'public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)'::regprocedure
      ),'\mvmp_source_objects_page_path\M')=1
  and regexp_count(pg_get_functiondef(
        'public.rpc_my_editable_progress_rights()'::regprocedure
      ),'\mvmp_editable_progress_rights_path\M')=1
  and regexp_count(pg_get_functiondef(
        'public.rpc_source_qa_candidates(text,jsonb,integer,uuid[])'::regprocedure
      ),'\mvmp_source_qa_candidates_page_path\M')=1
  and pg_get_functiondef(to_regprocedure(
        'public.vmp_source_objects_page_path(uuid,text,text,jsonb,jsonb,integer,boolean,uuid)'
      )) ~ '\mvmp_source_objects\M'
  and pg_get_functiondef(to_regprocedure(
        'public.vmp_editable_progress_rights_path(uuid)'
      )) ~ '\mvmp_plan_items\M'
  and pg_get_functiondef(to_regprocedure(
        'public.vmp_editable_progress_rights_path(uuid)'
      )) ~ '\mvmp_item_assignments\M'
  and pg_get_functiondef(to_regprocedure(
        'public.vmp_source_qa_candidates_page_path(uuid,text,jsonb,integer,uuid[])'
      )) ~ '\mvmp_performers\M',
  'SOURCE_ACCESS_EXACT_PRODUCTION_SET_BASED_QUERY_PATHS');

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
       case when series<=205 then 'PERF_PAGE_AREA'
            else format('PERF_AREA_%s',lpad((series%100)::text,2,'0')) end,
       case when series<=205 then 'PERF_PAGE_LINE'
            else format('PERF_LINE_%s',lpad((series%10)::text,2,'0')) end,
       'y',12,'Hóa lý',5,1,2026,'source-access-performance',series,
       1,0,0,owner_person.performer_id,support_person.performer_id
from generate_series(1,10000) series
join perf_people owner_person on owner_person.rn=case when series<=205 then 4
  else ((series-206)%996)+5 end
join perf_people support_person on support_person.rn=((series-1)%996)+5;

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
from perf_people people cross join generate_series(1,6) grant_no
where people.rn>=4;

insert into public.vmp_source_workshop_scope_grants(
  id,performer_id,department,department_key,area_code,area_key,line,line_key,
  valid_from,expires_at,is_active,version,change_reason
)
values
  (md5('source-access-performance-area-actor')::uuid,
   (select performer_id from perf_people where rn=2),
   'PERF_WS',public.vmp_source_scope_key('PERF_WS'),
   'PERF_PAGE_AREA',public.vmp_source_scope_key('PERF_PAGE_AREA'),null,null,
   transaction_timestamp(),null,true,1,'Area actor performance grant'),
  (md5('source-access-performance-line-actor')::uuid,
   (select performer_id from perf_people where rn=3),
   'PERF_WS',public.vmp_source_scope_key('PERF_WS'),
   'PERF_PAGE_AREA',public.vmp_source_scope_key('PERF_PAGE_AREA'),
   'PERF_PAGE_LINE',public.vmp_source_scope_key('PERF_PAGE_LINE'),
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
    'select * from public.vmp_source_objects_page_path(%L::uuid,%L,%L,%L::jsonb,null,100,false,null)',
    (select user_id from perf_people where rn=4),'Thiết bị','SPERF','{}'
  ))
),(
  'workshop_area_list',pg_temp.explain_json(format(
    'select * from public.vmp_source_objects_page_path(%L::uuid,%L,%L,%L::jsonb,null,100,false,null)',
    (select user_id from perf_people where rn=2),'Thiết bị','SPERF','{}'
  ))
),(
  'workshop_line_list',pg_temp.explain_json(format(
    'select * from public.vmp_source_objects_page_path(%L::uuid,%L,%L,%L::jsonb,null,100,false,null)',
    (select user_id from perf_people where rn=3),'Thiết bị','SPERF','{}'
  ))
),(
  'item_rights_batch',pg_temp.explain_json(format(
    'select * from public.vmp_editable_progress_rights_path(%L::uuid)',
    (select user_id from perf_people where rn=4)
  ))
),(
  'candidate_search',pg_temp.explain_json(format(
    'select * from public.vmp_source_qa_candidates_page_path(%L::uuid,%L,null,50,%L::uuid[])',
    (select user_id from perf_people where rn=1),'','{}'
  ))
);

select pg_temp.assert_plan_contract(
  (select document from captured_plan where plan_name='qa_list'),
  'vmp_source_objects','idx_vmp_source_objects_active_owner','SOURCE_ACCESS_PLAN_QA_LIST');
select pg_temp.assert_plan_contract(
  (select document from captured_plan where plan_name='workshop_area_list'),
  'vmp_source_objects','idx_vmp_source_objects_active_scope_area',
  'SOURCE_ACCESS_PLAN_WORKSHOP_AREA_LIST');
select pg_temp.assert_plan_contract(
  (select document from captured_plan where plan_name='workshop_area_list'),
  'vmp_source_workshop_scope_grants','idx_vmp_source_workshop_grants_area',
  'SOURCE_ACCESS_PLAN_WORKSHOP_AREA_GRANTS');
select pg_temp.assert_plan_contract(
  (select document from captured_plan where plan_name='workshop_line_list'),
  'vmp_source_objects','idx_vmp_source_objects_active_scope_line',
  'SOURCE_ACCESS_PLAN_WORKSHOP_LINE_LIST');
select pg_temp.assert_plan_contract(
  (select document from captured_plan where plan_name='workshop_line_list'),
  'vmp_source_workshop_scope_grants','idx_vmp_source_workshop_grants_line',
  'SOURCE_ACCESS_PLAN_WORKSHOP_LINE_GRANTS');
select pg_temp.assert_plan_contract(
  (select document from captured_plan where plan_name='item_rights_batch'),
  'vmp_plan_items','idx_vmp_plan_items_object_year_active',
  'SOURCE_ACCESS_PLAN_ITEM_RIGHTS_BATCH');
select pg_temp.assert_plan_contract(
  (select document from captured_plan where plan_name='item_rights_batch'),
  'vmp_item_assignments','idx_vmp_item_assignments_active_performer_validation_kind',
  'SOURCE_ACCESS_PLAN_ITEM_RIGHTS_ASSIGNMENTS');
select pg_temp.assert_plan_contract(
  (select document from captured_plan where plan_name='candidate_search'),
  'vmp_performers','idx_vmp_performers_active_candidate',
  'SOURCE_ACCESS_PLAN_CANDIDATE_SEARCH');

create function pg_temp.assert_source_pages(p_user_id uuid,p_rule_id text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_first jsonb;
  v_second jsonb;
  v_terminal jsonb;
  v_first_codes text[];
  v_second_codes text[];
  v_terminal_codes text[];
  v_expected_first text[];
  v_expected_second text[];
  v_expected_terminal text[];
begin
  perform set_config('request.jwt.claims',json_build_object(
    'sub',p_user_id,'role','authenticated')::text,true);
  v_first:=public.rpc_list_source_objects(
    'Thiết bị','SPERF', '{}'::jsonb,null,100,false,null);
  v_second:=public.rpc_list_source_objects(
    'Thiết bị','SPERF','{}'::jsonb,v_first->'next_cursor',100,false,null);
  v_terminal:=public.rpc_list_source_objects(
    'Thiết bị','SPERF','{}'::jsonb,v_second->'next_cursor',100,false,null);

  select array_agg(row_value->>'object_code' order by ordinal)
  into v_first_codes
  from jsonb_array_elements(v_first->'rows') with ordinality rows(row_value,ordinal);
  select array_agg(row_value->>'object_code' order by ordinal)
  into v_second_codes
  from jsonb_array_elements(v_second->'rows') with ordinality rows(row_value,ordinal);
  select array_agg(row_value->>'object_code' order by ordinal)
  into v_terminal_codes
  from jsonb_array_elements(v_terminal->'rows') with ordinality rows(row_value,ordinal);
  select array_agg(format('SPERF-%s',lpad(series::text,5,'0')) order by series)
    into v_expected_first from generate_series(1,100) series;
  select array_agg(format('SPERF-%s',lpad(series::text,5,'0')) order by series)
    into v_expected_second from generate_series(101,200) series;
  select array_agg(format('SPERF-%s',lpad(series::text,5,'0')) order by series)
    into v_expected_terminal from generate_series(201,205) series;

  if v_first->>'ok' is distinct from 'true'
     or v_second->>'ok' is distinct from 'true'
     or v_terminal->>'ok' is distinct from 'true'
     or v_first_codes is distinct from v_expected_first
     or v_second_codes is distinct from v_expected_second
     or v_terminal_codes is distinct from v_expected_terminal
     or v_first->>'authorized_total' is distinct from '205'
     or v_second->>'authorized_total' is distinct from '205'
     or v_terminal->>'authorized_total' is distinct from '205'
     or jsonb_typeof(v_first->'next_cursor')<>'object'
     or jsonb_typeof(v_second->'next_cursor')<>'object'
     or coalesce(jsonb_typeof(v_terminal->'next_cursor'),'null')<>'null'
     or v_first_codes && v_second_codes
     or v_first_codes && v_terminal_codes
     or v_second_codes && v_terminal_codes then
    raise exception using errcode='check_violation',
      message=p_rule_id;
  end if;
end
$$;

create function pg_temp.assert_candidate_pages(p_user_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_page jsonb;
  v_cursor jsonb:=null;
  v_rows uuid[];
  v_seen uuid[]:='{}'::uuid[];
  v_expected uuid[];
  v_expected_first uuid[];
  v_expected_second uuid[];
  v_page_count integer:=0;
begin
  perform set_config('request.jwt.claims',json_build_object(
    'sub',p_user_id,'role','authenticated')::text,true);
  select array_agg(performer_id order by normalized_full_name,performer_id)
    into v_expected
  from perf_people people
  join public.vmp_performers performer on performer.id=people.performer_id
  where people.rn=1 or people.rn>=4;
  v_expected_first:=v_expected[1:50];
  v_expected_second:=v_expected[51:100];

  loop
    v_page:=public.rpc_source_qa_candidates('',v_cursor,50,'{}'::uuid[]);
    v_page_count:=v_page_count+1;
    select coalesce(array_agg((row_value->>'person_id')::uuid order by ordinal),
                    '{}'::uuid[])
      into v_rows
    from jsonb_array_elements(v_page->'rows') with ordinality rows(row_value,ordinal);
    if v_page->>'ok' is distinct from 'true'
       or v_page->>'authorized_total' is distinct from '998'
       or cardinality(v_rows)>50
       or v_seen && v_rows
       or (v_page_count=1 and v_rows is distinct from v_expected_first)
       or (v_page_count=2 and v_rows is distinct from v_expected_second) then
      raise exception using errcode='check_violation',
        message='SOURCE_ACCESS_CANDIDATE_EXACT_KEYSET_PAGES';
    end if;
    v_seen:=v_seen||v_rows;
    exit when coalesce(jsonb_typeof(v_page->'next_cursor'),'null')='null';
    if jsonb_typeof(v_page->'next_cursor')<>'object' or v_page_count>=25 then
      raise exception using errcode='check_violation',
        message='SOURCE_ACCESS_CANDIDATE_CURSOR_INVALID';
    end if;
    v_cursor:=v_page->'next_cursor';
  end loop;
  if v_page_count<>20 or cardinality(v_seen)<>998
     or v_seen is distinct from v_expected then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_CANDIDATE_TERMINAL_TOTAL';
  end if;
end
$$;

set local role authenticated;

select pg_temp.assert_source_pages(
  md5('source-access-performance-user-4')::uuid,
  'SOURCE_ACCESS_QA_EXACT_FIRST_SECOND_TERMINAL_PAGES');
select pg_temp.assert_source_pages(
  md5('source-access-performance-user-2')::uuid,
  'SOURCE_ACCESS_WORKSHOP_AREA_EXACT_FIRST_SECOND_TERMINAL_PAGES');
select pg_temp.assert_source_pages(
  md5('source-access-performance-user-3')::uuid,
  'SOURCE_ACCESS_WORKSHOP_LINE_EXACT_FIRST_SECOND_TERMINAL_PAGES');

select set_config('request.jwt.claims',json_build_object(
  'sub',md5('source-access-performance-user-4')::uuid,
  'role','authenticated')::text,true);
select pg_temp.assert_true(
  public.rpc_my_editable_progress_rights()->>'ok'='true'
  and jsonb_array_length(public.rpc_my_editable_progress_rights()->'rights')=410,
  'SOURCE_ACCESS_ITEM_RIGHTS_SET_BASED_AUTHORIZED_TOTAL_410');

select pg_temp.assert_candidate_pages(md5('source-access-performance-user-1')::uuid);

\echo 'PASS PERFORMANCE production query paths structured JSON plans and exact keyset pages'
rollback;

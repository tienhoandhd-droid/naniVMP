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
         and coalesce((node->>'Actual Loops')::integer,0)>0
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
         and coalesce((node->>'Actual Loops')::integer,0)>0
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
         and coalesce((node->>'Actual Loops')::integer,0)>0
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

create function pg_temp.assert_plan_has_protected_work(
  p_plan jsonb,p_rule_id text
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
    select 1 from plan_node
    where node->>'Relation Name' in (
      'vmp_source_objects','vmp_plan_items','vmp_item_assignments',
      'vmp_source_workshop_scope_grants','vmp_performers','profiles'
    )
  ) then
    raise exception using errcode='check_violation',message=p_rule_id;
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

create temp table expected_query_definition(
  signature text primary key,definition_kind text not null,
  arguments text not null,result_type text not null,
  definition_sha256 text not null,reviewed_body text not null
) on commit drop;

insert into expected_query_definition values
  ('rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)','delegate',
   'p_object_kind text, p_search text, p_filters jsonb, p_cursor jsonb, p_limit integer, p_include_inactive boolean, p_object_id uuid',
   'jsonb','602434023178d4bae267ccb6c98697179ef1e569d57e12df0278a1c203add3fa',$body$
  select query_path.payload
  from public.vmp_source_objects_page_path(
    auth.uid(),p_object_kind,p_search,p_filters,p_cursor,p_limit,
    p_include_inactive,p_object_id
  ) query_path
$body$),
  ('rpc_my_editable_progress_rights()','delegate','',
   'jsonb','d6848fa43fe2987da187e2d25857273126379d9d0720c4bccc955a5187f3ef7a',$body$
  select query_path.payload
  from public.vmp_editable_progress_rights_path(auth.uid()) query_path
$body$),
  ('rpc_source_qa_candidates(text,jsonb,integer,uuid[])','delegate',
   'p_search text, p_cursor jsonb, p_limit integer, p_include_ids uuid[]',
   'jsonb','d129ca77b7e5a62bed142bc1acf3970517692febcf3b53585f2be378c6a9488b',$body$
  select query_path.payload
  from public.vmp_source_qa_candidates_page_path(
    auth.uid(),p_search,p_cursor,p_limit,p_include_ids
  ) query_path
$body$),
  ('vmp_source_objects_page_path(uuid,text,text,jsonb,jsonb,integer,boolean,uuid)',
   'query_path',
   'p_actor uuid, p_object_kind text, p_search text, p_filters jsonb, p_cursor jsonb, p_limit integer, p_include_inactive boolean, p_object_id uuid',
   'TABLE(payload jsonb)','819079f0ec8d9e710cf3a9cebcdc3ccb7734ab21e8e4b23db6875488d3bf3bcf',$body$
with actor as (
  select p_actor actor_id,public.vmp_business_role(p_actor) role_name,
         exists (
           select 1 from public.profiles profile
           where profile.id=p_actor and coalesce(profile.is_active,true)
         ) active_account
), cursor_input as (
  select case when p_cursor is null then true
              when jsonb_typeof(p_cursor)='object'
               and jsonb_typeof(p_cursor->'object_code')='string'
               and jsonb_typeof(p_cursor->'id')='string'
               and (p_cursor->>'id') ~*
                   '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then true else false end valid,
         case when p_cursor is not null
                and jsonb_typeof(p_cursor)='object'
                and jsonb_typeof(p_cursor->'id')='string'
                and (p_cursor->>'id') ~*
                    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (p_cursor->>'id')::uuid end cursor_id,
         case when p_cursor is not null and jsonb_typeof(p_cursor)='object'
                and jsonb_typeof(p_cursor->'object_code')='string'
              then p_cursor->>'object_code' end cursor_code
), manager_authorized as (
  select source_object.*
  from actor
  join public.vmp_source_objects source_object
    on actor.role_name in ('admin','qa_manager')
), qa_authorized as (
  select source_object.*
  from actor
  join public.vmp_performers performer
    on actor.role_name='qa_staff'
   and performer.user_id=actor.actor_id and performer.is_active
  join public.vmp_source_objects source_object
    on source_object.is_active is true
   and source_object.owner_person_id=performer.id
  union
  select source_object.*
  from actor
  join public.vmp_performers performer
    on actor.role_name='qa_staff'
   and performer.user_id=actor.actor_id and performer.is_active
  join public.vmp_source_objects source_object
    on source_object.is_active is true
   and source_object.support_person_id=performer.id
), workshop_authorized as (
  select source_object.*
  from actor
  join public.vmp_performers performer
    on actor.role_name in ('workshop_manager','workshop_staff')
   and performer.user_id=actor.actor_id and performer.is_active
  join public.vmp_source_workshop_scope_grants grant_row
    on grant_row.performer_id=performer.id and grant_row.is_active
   and grant_row.line_key is null
   and grant_row.valid_from<=transaction_timestamp()
   and (grant_row.expires_at is null
        or grant_row.expires_at>transaction_timestamp())
  join lateral (
    select scoped_source.*
    from public.vmp_source_objects scoped_source
    where scoped_source.is_active is true
      and nullif(public.vmp_source_scope_key(scoped_source.department),'')
          is not null
      and nullif(public.vmp_source_scope_key(scoped_source.area_code),'')
          is not null
      and public.vmp_source_scope_key(scoped_source.department)=
          grant_row.department_key
      and public.vmp_source_scope_key(scoped_source.area_code)=
          grant_row.area_key
    offset 0
  ) source_object on true
  union
  select source_object.*
  from actor
  join public.vmp_performers performer
    on actor.role_name in ('workshop_manager','workshop_staff')
   and performer.user_id=actor.actor_id and performer.is_active
  join public.vmp_source_workshop_scope_grants grant_row
    on grant_row.performer_id=performer.id and grant_row.is_active
   and grant_row.line_key is not null
   and grant_row.valid_from<=transaction_timestamp()
   and (grant_row.expires_at is null
        or grant_row.expires_at>transaction_timestamp())
  join lateral (
    select scoped_source.*
    from public.vmp_source_objects scoped_source
    where scoped_source.is_active is true
      and nullif(public.vmp_source_scope_key(scoped_source.department),'')
          is not null
      and nullif(public.vmp_source_scope_key(scoped_source.area_code),'')
          is not null
      and nullif(public.vmp_source_scope_key(scoped_source.line),'') is not null
      and public.vmp_source_scope_key(scoped_source.department)=
          grant_row.department_key
      and public.vmp_source_scope_key(scoped_source.area_code)=
          grant_row.area_key
      and public.vmp_source_scope_key(scoped_source.line)=grant_row.line_key
    offset 0
  ) source_object on true
), authorized as (
  select * from manager_authorized
  union all
  select * from qa_authorized
  union all
  select * from workshop_authorized
), filtered as (
  select authorized.*
  from authorized cross join actor
  where (authorized.is_active
         or (actor.role_name in ('admin','qa_manager')
             and coalesce(p_include_inactive,false)))
    and (p_object_kind is null or authorized.object_kind=p_object_kind)
    and public.vmp_source_object_matches_filters(
          authorized,p_search,p_filters)
    and (p_object_id is null or authorized.id=p_object_id)
), cursor_status as (
  select cursor_input.*,
         p_cursor is null or exists (
           select 1 from filtered
           where filtered.object_code=cursor_input.cursor_code
             and filtered.id=cursor_input.cursor_id
         ) present
  from cursor_input
), paged as (
  select filtered.*
  from filtered cross join cursor_status
  where p_cursor is null
     or (filtered.object_code,filtered.id)>
        (cursor_status.cursor_code,cursor_status.cursor_id)
), limited as (
  select paged.* from paged order by object_code,id
  limit case when p_limit between 1 and 100 then p_limit+1 else 0 end
), returned as (
  select limited.* from limited order by object_code,id
  limit case when p_limit between 1 and 100 then p_limit else 0 end
)
select case
  when not actor.active_account then jsonb_build_object(
    'ok',false,'error_code','ACCOUNT_DISABLED','error','Tài khoản không hoạt động')
  when actor.role_name is null then jsonb_build_object(
    'ok',false,'error_code','ROLE_UNRESOLVED','error','Không xác định được vai trò nghiệp vụ')
  when p_limit is null or p_limit<1 or p_limit>100 then jsonb_build_object(
    'ok',false,'error_code','INVALID_LIMIT','error','Giới hạn phải từ 1 đến 100')
  when not public.vmp_source_filters_valid(p_filters) then
    jsonb_build_object(
      'ok',false,'error_code','INVALID_FILTERS','error','Bộ lọc phải là JSON object')
  when not cursor_status.valid then jsonb_build_object(
    'ok',false,'error_code','INVALID_CURSOR','error','Con trỏ không hợp lệ')
  when not cursor_status.present then jsonb_build_object(
    'ok',false,'error_code','CURSOR_EXPIRED','error','Con trỏ không còn hiệu lực')
  else jsonb_build_object(
    'ok',true,
    'rows',coalesce((select jsonb_agg(to_jsonb(returned) order by object_code,id)
                     from returned),'[]'::jsonb),
    'authorized_total',(select count(*) from filtered),
    'next_cursor',case when (select count(*) from limited)>p_limit then (
      select jsonb_build_object('object_code',object_code,'id',id)
      from returned order by object_code desc,id desc limit 1
    ) else null end
  )
end payload
from actor cross join cursor_status
$body$),
  ('vmp_editable_progress_rights_path(uuid)','query_path','p_actor uuid',
   'TABLE(payload jsonb)','81cd88d6aa2673f0bde59e94980d7e20acc075d95964a7f554b5dc3311af609c',$body$
with actor as (
  select public.vmp_business_role(p_actor) role_name,
         exists (
           select 1 from public.profiles profile
           where profile.id=p_actor and coalesce(profile.is_active,true)
         ) active_account
), actor_person as (
  select performer.id person_id
  from actor
  join public.vmp_performers performer
    on performer.user_id=p_actor and performer.is_active
), admin_resolved as (
  select item.validation_code,rights.editable_fields,rights.view_reason
  from actor
  join public.vmp_plan_items item
    on actor.role_name='admin' and item.is_active is true
  cross join lateral public.vmp_item_rights(
    p_actor,item.validation_code
  ) rights
  where rights.can_view
    and cardinality(coalesce(rights.editable_fields,'{}'::text[]))>0
), qa_manager_resolved as (
  select item.validation_code,
         array[
           'actual_protocol_date','status_protocol',
           'actual_validation_date','status_validation',
           'actual_report_date','status_report',
           'actual_vmp_date','status_vmp'
         ]::text[] editable_fields,
         'Quản lý QA xem toàn bộ hạng mục hoạt động'::text view_reason
  from actor
  join public.vmp_plan_items item
    on actor.role_name='qa_manager'
   and public.vmp_can_manage_source_qa_assignment(p_actor)
   and item.is_active is true
), qa_sources as (
  select source_object.object_code
  from actor cross join actor_person
  join public.vmp_source_objects source_object
    on source_object.is_active is true
   and source_object.owner_person_id=actor_person.person_id
  where actor.role_name='qa_staff'
  union
  select source_object.object_code
  from actor cross join actor_person
  join public.vmp_source_objects source_object
    on source_object.is_active is true
   and source_object.support_person_id=actor_person.person_id
  where actor.role_name='qa_staff'
), qa_resolved as (
  select item.validation_code,
         array[
           'actual_protocol_date','status_protocol','status_validation',
           'actual_report_date','status_report','actual_vmp_date','status_vmp'
         ]::text[] editable_fields,
         'Quan hệ QA trực tiếp trên Source'::text view_reason
  from qa_sources
  join public.vmp_plan_items item
    on item.object_code=qa_sources.object_code and item.is_active is true
), workshop_sources as (
  select scoped_source.object_code,actor_person.person_id
  from actor cross join actor_person
  join public.vmp_source_workshop_scope_grants grant_row
    on grant_row.performer_id=actor_person.person_id
   and grant_row.is_active and grant_row.line_key is null
   and grant_row.valid_from<=transaction_timestamp()
   and (grant_row.expires_at is null
        or grant_row.expires_at>transaction_timestamp())
  join lateral (
    select source_object.object_code
    from public.vmp_source_objects source_object
    where source_object.is_active is true
      and nullif(public.vmp_source_scope_key(source_object.department),'')
          is not null
      and nullif(public.vmp_source_scope_key(source_object.area_code),'')
          is not null
      and public.vmp_source_scope_key(source_object.department)=
          grant_row.department_key
      and public.vmp_source_scope_key(source_object.area_code)=grant_row.area_key
    offset 0
  ) scoped_source on true
  where actor.role_name in ('workshop_manager','workshop_staff')
  union
  select scoped_source.object_code,actor_person.person_id
  from actor cross join actor_person
  join public.vmp_source_workshop_scope_grants grant_row
    on grant_row.performer_id=actor_person.person_id
   and grant_row.is_active and grant_row.line_key is not null
   and grant_row.valid_from<=transaction_timestamp()
   and (grant_row.expires_at is null
        or grant_row.expires_at>transaction_timestamp())
  join lateral (
    select source_object.object_code
    from public.vmp_source_objects source_object
    where source_object.is_active is true
      and nullif(public.vmp_source_scope_key(source_object.department),'')
          is not null
      and nullif(public.vmp_source_scope_key(source_object.area_code),'')
          is not null
      and nullif(public.vmp_source_scope_key(source_object.line),'') is not null
      and public.vmp_source_scope_key(source_object.department)=
          grant_row.department_key
      and public.vmp_source_scope_key(source_object.area_code)=grant_row.area_key
      and public.vmp_source_scope_key(source_object.line)=grant_row.line_key
    offset 0
  ) scoped_source on true
  where actor.role_name in ('workshop_manager','workshop_staff')
), workshop_resolved as (
  select distinct item.validation_code,
         array['actual_validation_date']::text[] editable_fields,
         'Có phạm vi Source và phân công xưởng đang hoạt động'::text view_reason
  from workshop_sources
  join public.vmp_plan_items item
    on item.object_code=workshop_sources.object_code and item.is_active is true
  join public.vmp_item_assignments assignment
    on assignment.validation_code=item.validation_code
   and assignment.performer_id=workshop_sources.person_id
   and assignment.assignment_kind='equipment_department'
   and assignment.is_active is true
   and (assignment.expires_at is null
        or assignment.expires_at>transaction_timestamp())
), resolved as (
  select * from admin_resolved
  union all
  select * from qa_manager_resolved
  union all
  select * from qa_resolved
  union all
  select * from workshop_resolved
)
select case
  when not actor.active_account then jsonb_build_object(
    'ok',false,'error_code','ACCOUNT_DISABLED','error','Tài khoản không hoạt động')
  when actor.role_name is null then jsonb_build_object(
    'ok',false,'error_code','ROLE_UNRESOLVED','error','Không xác định được vai trò nghiệp vụ')
  else jsonb_build_object(
    'ok',true,
    'rights',coalesce((select jsonb_agg(jsonb_build_object(
      'validation_code',resolved.validation_code,
      'editable_fields',to_jsonb(resolved.editable_fields),
      'view_reason',resolved.view_reason
    ) order by resolved.validation_code) from resolved),'[]'::jsonb)
  )
end payload
from actor
$body$),
  ('vmp_source_qa_candidates_page_path(uuid,text,jsonb,integer,uuid[])',
   'query_path',
   'p_actor uuid, p_search text, p_cursor jsonb, p_limit integer, p_include_ids uuid[]',
   'TABLE(payload jsonb)','d6fb610656d4ee118db24cc1cf40609731794ce4b1f6546b59c0743cb625471a',$body$
with actor as (
  select public.vmp_business_role(p_actor) role_name,
         exists (
           select 1 from public.profiles profile
           where profile.id=p_actor and coalesce(profile.is_active,true)
         ) active_account
), cursor_input as (
  select case when p_cursor is null then true
              when jsonb_typeof(p_cursor)='object'
               and jsonb_typeof(p_cursor->'normalized_full_name')='string'
               and jsonb_typeof(p_cursor->'person_id')='string'
               and (p_cursor->>'person_id') ~*
                   '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then true else false end valid,
         case when p_cursor is not null
                and jsonb_typeof(p_cursor)='object'
                and jsonb_typeof(p_cursor->'person_id')='string'
                and (p_cursor->>'person_id') ~*
                    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (p_cursor->>'person_id')::uuid end cursor_id,
         case when p_cursor is not null and jsonb_typeof(p_cursor)='object'
                and jsonb_typeof(p_cursor->'normalized_full_name')='string'
              then p_cursor->>'normalized_full_name' end cursor_name
), candidate as (
  select performer.id person_id,performer.performer_name,
         performer.normalized_full_name,performer.email,performer.department,
         public.vmp_business_role(performer.user_id) role_name
  from public.vmp_performers performer
  join public.profiles profile on profile.id=performer.user_id
  where performer.is_active is true and performer.user_id is not null
    and performer.access_class in ('qa_manager','qa_progress_editor')
    and coalesce(profile.is_active,true)
    and public.vmp_business_role(profile.id) in ('qa_staff','qa_manager')
    and (coalesce(btrim(p_search),'')=''
         or performer.normalized_full_name like
              public.vmp_source_scope_key(p_search)||'%')
), cursor_status as (
  select cursor_input.*,
         p_cursor is null or exists (
           select 1 from candidate
           where candidate.normalized_full_name=cursor_input.cursor_name
             and candidate.person_id=cursor_input.cursor_id
         ) present
  from cursor_input
), paged as (
  select candidate.* from candidate cross join cursor_status
  where p_cursor is null
     or (candidate.normalized_full_name,candidate.person_id)>
        (cursor_status.cursor_name,cursor_status.cursor_id)
), limited as (
  select paged.* from paged
  order by normalized_full_name,person_id
  limit case when p_limit between 1 and 50 then p_limit+1 else 0 end
), returned as (
  select limited.* from limited order by normalized_full_name,person_id
  limit case when p_limit between 1 and 50 then p_limit else 0 end
), included as (
  select requested.person_id,performer.performer_name,
         performer.normalized_full_name,performer.email,performer.department,
         coalesce(
           public.vmp_business_role(performer.user_id) in ('qa_staff','qa_manager'),
           false
         ) eligible,
         case
           when performer.id is null then 'PERSON_NOT_FOUND'
           when not performer.is_active then 'PERFORMER_INACTIVE'
           when performer.user_id is null then 'ACCOUNT_UNLINKED'
           when not coalesce(profile.is_active,false) then 'ACCOUNT_DISABLED'
           when public.vmp_business_role(performer.user_id)
                not in ('qa_staff','qa_manager')
             or public.vmp_business_role(performer.user_id) is null
             then 'ROLE_INELIGIBLE'
           else null
         end ineligibility_reason
  from (
    select distinct unnest(coalesce(p_include_ids,'{}'::uuid[])) person_id
  ) requested
  left join public.vmp_performers performer on performer.id=requested.person_id
  left join public.profiles profile on profile.id=performer.user_id
)
select case
  when not actor.active_account then jsonb_build_object(
    'ok',false,'error_code','ACCOUNT_DISABLED','error','Tài khoản không hoạt động')
  when actor.role_name is null then jsonb_build_object(
    'ok',false,'error_code','ROLE_UNRESOLVED','error','Không xác định được vai trò nghiệp vụ')
  when actor.role_name not in ('admin','qa_manager') then jsonb_build_object(
    'ok',false,'error_code','FORBIDDEN','error','Không có quyền chọn QA phụ trách')
  when p_limit is null or p_limit<1 or p_limit>50 then jsonb_build_object(
    'ok',false,'error_code','INVALID_LIMIT','error','Giới hạn phải từ 1 đến 50')
  when not cursor_status.valid then jsonb_build_object(
    'ok',false,'error_code','INVALID_CURSOR','error','Con trỏ không hợp lệ')
  when not cursor_status.present then jsonb_build_object(
    'ok',false,'error_code','CURSOR_EXPIRED','error','Con trỏ không còn hiệu lực')
  else jsonb_build_object(
    'ok',true,
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'person_id',person_id,'performer_name',performer_name,
      'normalized_full_name',normalized_full_name,'email',email,
      'department',department,'role_name',role_name
    ) order by normalized_full_name,person_id) from returned),'[]'::jsonb),
    'included_current',coalesce((select jsonb_agg(to_jsonb(included)
      order by included.normalized_full_name nulls last,included.person_id)
      from included),'[]'::jsonb),
    'authorized_total',(select count(*) from candidate),
    'next_cursor',case when (select count(*) from limited)>p_limit then (
      select jsonb_build_object(
        'normalized_full_name',normalized_full_name,'person_id',person_id)
      from returned order by normalized_full_name desc,person_id desc limit 1
    ) else null end
  )
end payload
from actor cross join cursor_status
$body$);

create temp table expected_query_path_contract(
  public_signature text primary key,path_signature text unique not null,
  public_definition_sha256 text not null,path_definition_sha256 text not null
) on commit drop;
insert into expected_query_path_contract values
  ('rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)',
   'vmp_source_objects_page_path(uuid,text,text,jsonb,jsonb,integer,boolean,uuid)',
   '602434023178d4bae267ccb6c98697179ef1e569d57e12df0278a1c203add3fa',
   '819079f0ec8d9e710cf3a9cebcdc3ccb7734ab21e8e4b23db6875488d3bf3bcf'),
  ('rpc_my_editable_progress_rights()',
   'vmp_editable_progress_rights_path(uuid)',
   'd6848fa43fe2987da187e2d25857273126379d9d0720c4bccc955a5187f3ef7a',
   '81cd88d6aa2673f0bde59e94980d7e20acc075d95964a7f554b5dc3311af609c'),
  ('rpc_source_qa_candidates(text,jsonb,integer,uuid[])',
   'vmp_source_qa_candidates_page_path(uuid,text,jsonb,integer,uuid[])',
   'd129ca77b7e5a62bed142bc1acf3970517692febcf3b53585f2be378c6a9488b',
   'd6fb610656d4ee118db24cc1cf40609731794ce4b1f6546b59c0743cb625471a');

with actual_function as (
  select expected.*,procedure.oid,procedure.proname,
         owner.rolname owner_name,language.lanname language_name,
         procedure.provolatile,procedure.prosecdef,procedure.proparallel,
         procedure.proisstrict,procedure.proleakproof,procedure.proconfig,
         procedure.pronargdefaults,procedure.prosrc,
         pg_get_function_arguments(procedure.oid) actual_arguments,
         pg_get_function_result(procedure.oid) actual_result,
         encode(extensions.digest(convert_to(
           pg_get_functiondef(procedure.oid),'UTF8'),'sha256'),'hex') actual_hash
  from expected_query_definition expected
  join pg_proc procedure
    on procedure.oid=to_regprocedure('public.'||expected.signature)
  join pg_roles owner on owner.oid=procedure.proowner
  join pg_language language on language.oid=procedure.prolang
), actual_acl as (
  select actual.signature,
         case when acl.grantee=0 then 'PUBLIC'
              else acl.grantee::regrole::text end grantee,
         acl.privilege_type,acl.is_grantable
  from actual_function actual
  join pg_proc procedure on procedure.oid=actual.oid
  cross join lateral aclexplode(procedure.proacl) acl
), expected_acl as (
  select expected.signature,grantee,'EXECUTE'::text privilege_type,
         false is_grantable
  from expected_query_definition expected
  cross join lateral unnest(case expected.definition_kind
    when 'delegate' then
      array['postgres','service_role','authenticated']::text[]
    else array['postgres','service_role']::text[] end) grantee
)
select pg_temp.assert_true(
  (select count(*) from actual_function)=6
  and (select count(*) from expected_query_path_contract)=3
  and not exists (
    select 1 from actual_function
    where owner_name<>'postgres' or language_name<>'sql' or provolatile<>'s'
       or proparallel<>'u' or proisstrict or proleakproof
       or pronargdefaults<>0 or actual_arguments<>arguments
       or actual_result<>result_type or prosrc is distinct from reviewed_body
       or actual_hash<>definition_sha256
       or case definition_kind
            when 'delegate' then not prosecdef
              or proconfig is distinct from array['search_path=public, pg_temp']
            else prosecdef or proconfig is not null
          end
       or (select count(*) from pg_proc overload
           join pg_namespace namespace on namespace.oid=overload.pronamespace
           where namespace.nspname='public'
             and overload.proname=actual_function.proname)<>1
  )
  and not exists (select * from actual_acl except select * from expected_acl)
  and not exists (select * from expected_acl except select * from actual_acl)
  and not exists (
    select 1 from expected_query_path_contract contract
    join expected_query_definition public_definition
      on public_definition.signature=contract.public_signature
    join expected_query_definition path_definition
      on path_definition.signature=contract.path_signature
    where public_definition.definition_kind<>'delegate'
       or path_definition.definition_kind<>'query_path'
       or public_definition.definition_sha256<>
          contract.public_definition_sha256
       or path_definition.definition_sha256<>contract.path_definition_sha256
       or regexp_count(public_definition.reviewed_body,
             '\m'||split_part(contract.path_signature,'(',1)||'\M')<>1
  ),
  'SOURCE_ACCESS_EXACT_PUBLIC_PATH_DEFINITION_HASHES');

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

insert into auth.users(
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
values
  ('9a030000-0000-4000-8000-000000000001','authenticated','authenticated',
   'source-perf-inactive@example.test','x',now(),'{}','{}',now(),now()),
  ('9a030000-0000-4000-8000-000000000002','authenticated','authenticated',
   'source-perf-unresolved@example.test','x',now(),'{}','{}',now(),now());

insert into public.profiles(id,full_name,email,role,department,is_active)
values
  ('9a030000-0000-4000-8000-000000000001','Source Performance Inactive',
   'source-perf-inactive@example.test','department_user','QA',false),
  ('9a030000-0000-4000-8000-000000000002','Source Performance Unresolved',
   'source-perf-unresolved@example.test','department_user','QA',true);

update public.vmp_performers
set department='QA',access_class=null,is_active=true
where user_id='9a030000-0000-4000-8000-000000000002'::uuid;

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
  'item_rights_workshop',pg_temp.explain_json(format(
    'select * from public.vmp_editable_progress_rights_path(%L::uuid)',
    (select user_id from perf_people where rn=2)
  ))
),(
  'candidate_search',pg_temp.explain_json(format(
    'select * from public.vmp_source_qa_candidates_page_path(%L::uuid,%L,null,50,%L::uuid[])',
    (select user_id from perf_people where rn=1),'Source Performance Candidate','{}'
  ))
);

select pg_temp.assert_plan_contract(
  (select document from captured_plan where plan_name='qa_list'),
  'vmp_source_objects','vmp_source_objects_owner_person_idx',
  'SOURCE_ACCESS_PLAN_QA_LIST');
select pg_temp.assert_plan_contract(
  (select document from captured_plan where plan_name='workshop_area_list'),
  'vmp_source_objects','idx_vmp_source_objects_active_scope_area',
  'SOURCE_ACCESS_PLAN_WORKSHOP_AREA_LIST');
select pg_temp.assert_plan_contract(
  (select document from captured_plan where plan_name='workshop_area_list'),
  'vmp_source_workshop_scope_grants',
  'uq_vmp_source_workshop_grants_active_area',
  'SOURCE_ACCESS_PLAN_WORKSHOP_AREA_GRANTS');
select pg_temp.assert_plan_contract(
  (select document from captured_plan where plan_name='workshop_line_list'),
  'vmp_source_objects','idx_vmp_source_objects_active_scope_line',
  'SOURCE_ACCESS_PLAN_WORKSHOP_LINE_LIST');
select pg_temp.assert_plan_contract(
  (select document from captured_plan where plan_name='workshop_line_list'),
  'vmp_source_workshop_scope_grants',
  'uq_vmp_source_workshop_grants_active_line',
  'SOURCE_ACCESS_PLAN_WORKSHOP_LINE_GRANTS');
select pg_temp.assert_plan_contract(
  (select document from captured_plan where plan_name='item_rights_batch'),
  'vmp_plan_items','idx_plan_obj',
  'SOURCE_ACCESS_PLAN_ITEM_RIGHTS_BATCH');
select pg_temp.assert_plan_contract(
  (select document from captured_plan where plan_name='item_rights_workshop'),
  'vmp_item_assignments','vmp_item_assignments_linked_uniq',
  'SOURCE_ACCESS_PLAN_ITEM_RIGHTS_ASSIGNMENTS');
select pg_temp.assert_plan_contract(
  (select document from captured_plan where plan_name='candidate_search'),
  'vmp_performers','vmp_performers_user_id_uniq',
  'SOURCE_ACCESS_PLAN_CANDIDATE_SEARCH');

select pg_temp.assert_plan_has_protected_work(document,
  'SOURCE_ACCESS_PLAN_CONTAINS_INLINED_PROTECTED_WORK '||plan_name)
from captured_plan;

create function pg_temp.assert_source_pages(p_user_id uuid,p_rule_id text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_first jsonb;
  v_second jsonb;
  v_terminal jsonb;
  v_first_path jsonb;
  v_second_path jsonb;
  v_terminal_path jsonb;
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
  select payload into strict v_first_path
  from public.vmp_source_objects_page_path(
    p_user_id,'Thiết bị','SPERF','{}'::jsonb,null,100,false,null);
  select payload into strict v_second_path
  from public.vmp_source_objects_page_path(
    p_user_id,'Thiết bị','SPERF','{}'::jsonb,
    v_first->'next_cursor',100,false,null);
  select payload into strict v_terminal_path
  from public.vmp_source_objects_page_path(
    p_user_id,'Thiết bị','SPERF','{}'::jsonb,
    v_second->'next_cursor',100,false,null);

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
     or v_second_codes && v_terminal_codes
     or v_first is distinct from v_first_path
     or v_second is distinct from v_second_path
     or v_terminal is distinct from v_terminal_path then
    raise exception using errcode='check_violation',
      message=p_rule_id||' SOURCE_ACCESS_PUBLIC_PATH_JSON_EQUIVALENCE';
  end if;
end
$$;

create function pg_temp.assert_candidate_pages(p_user_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_page jsonb;
  v_path_page jsonb;
  v_cursor jsonb:=null;
  v_rows uuid[];
  v_seen uuid[]:='{}'::uuid[];
  v_expected uuid[];
  v_expected_first uuid[];
  v_expected_second uuid[];
  v_page_count integer:=0;
  v_search constant text:='Source Performance Candidate';
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
    v_page:=public.rpc_source_qa_candidates(v_search,v_cursor,50,'{}'::uuid[]);
    select payload into strict v_path_page
    from public.vmp_source_qa_candidates_page_path(
      p_user_id,v_search,v_cursor,50,'{}'::uuid[]);
    v_page_count:=v_page_count+1;
    select coalesce(array_agg((row_value->>'person_id')::uuid order by ordinal),
                    '{}'::uuid[])
      into v_rows
    from jsonb_array_elements(v_page->'rows') with ordinality rows(row_value,ordinal);
    if v_page->>'ok' is distinct from 'true'
       or v_page->>'authorized_total' is distinct from '998'
       or cardinality(v_rows)>50
       or v_seen && v_rows
       or v_page is distinct from v_path_page
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

create function pg_temp.assert_rights_equivalence(p_user_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_public jsonb;
  v_path jsonb;
begin
  perform set_config('request.jwt.claims',json_build_object(
    'sub',p_user_id,'role','authenticated')::text,true);
  v_public:=public.rpc_my_editable_progress_rights();
  select payload into strict v_path
  from public.vmp_editable_progress_rights_path(p_user_id);
  if v_public is distinct from v_path
     or v_public->>'ok'<>'true'
     or jsonb_array_length(v_public->'rights')<>410 then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_ITEM_RIGHTS_SET_BASED_AUTHORIZED_TOTAL_410 SOURCE_ACCESS_PUBLIC_PATH_JSON_EQUIVALENCE';
  end if;
end
$$;

create function pg_temp.assert_public_path_edge_equivalence(
  p_manager uuid,p_non_manager uuid,p_inactive uuid,p_unresolved uuid,
  p_ineligible_person uuid
)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_public jsonb;
  v_path jsonb;
begin
  perform set_config('request.jwt.claims',json_build_object(
    'sub',p_manager,'role','authenticated')::text,true);

  v_public:=public.rpc_list_source_objects(
    'Thiết bị','NO-SUCH-SOURCE','{}'::jsonb,null,1,false,null);
  select payload into strict v_path
  from public.vmp_source_objects_page_path(
    p_manager,'Thiết bị','NO-SUCH-SOURCE','{}'::jsonb,null,1,false,null);
  if v_public is distinct from v_path or v_public->>'ok'<>'true'
     or v_public->'rows'<>'[]'::jsonb then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_PUBLIC_PATH_JSON_EQUIVALENCE successful_zero_list';
  end if;

  v_public:=public.rpc_list_source_objects(
    'Thiết bị','SPERF','{}'::jsonb,
    '{"object_code":"SPERF-00001","id":"bad"}'::jsonb,1,false,null);
  select payload into strict v_path
  from public.vmp_source_objects_page_path(
    p_manager,'Thiết bị','SPERF','{}'::jsonb,
    '{"object_code":"SPERF-00001","id":"bad"}'::jsonb,1,false,null);
  if v_public is distinct from v_path or v_public->>'ok'<>'false'
     or v_public->>'error_code'<>'INVALID_CURSOR' then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_PUBLIC_PATH_CURSOR_PASSTHROUGH invalid_list_cursor';
  end if;

  v_public:=public.rpc_list_source_objects(
    'Thiết bị','SPERF','{}'::jsonb,
    '{"object_code":"SPERF-MISSING","id":"00000000-0000-0000-0000-000000000000"}'::jsonb,
    1,false,null);
  select payload into strict v_path
  from public.vmp_source_objects_page_path(
    p_manager,'Thiết bị','SPERF','{}'::jsonb,
    '{"object_code":"SPERF-MISSING","id":"00000000-0000-0000-0000-000000000000"}'::jsonb,
    1,false,null);
  if v_public is distinct from v_path or v_public->>'ok'<>'false'
     or v_public->>'error_code'<>'CURSOR_EXPIRED' then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_PUBLIC_PATH_CURSOR_PASSTHROUGH expired_list_cursor';
  end if;

  v_public:=public.rpc_list_source_objects(
    'Thiết bị','SPERF','{}'::jsonb,null,0,false,null);
  select payload into strict v_path
  from public.vmp_source_objects_page_path(
    p_manager,'Thiết bị','SPERF','{}'::jsonb,null,0,false,null);
  if v_public is distinct from v_path or v_public->>'ok'<>'false'
     or v_public->>'error_code'<>'INVALID_LIMIT' then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_PUBLIC_PATH_JSON_EQUIVALENCE invalid_list_limit';
  end if;

  v_public:=public.rpc_source_qa_candidates(
    'NO-SUCH-CANDIDATE',null,1,array[p_ineligible_person]);
  select payload into strict v_path
  from public.vmp_source_qa_candidates_page_path(
    p_manager,'NO-SUCH-CANDIDATE',null,1,array[p_ineligible_person]);
  if v_public is distinct from v_path or v_public->>'ok'<>'true'
     or v_public->'rows'<>'[]'::jsonb
     or jsonb_array_length(v_public->'included_current')<>1
     or v_public#>>'{included_current,0,eligible}'<>'false' then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_PUBLIC_PATH_JSON_EQUIVALENCE included_current';
  end if;

  v_public:=public.rpc_source_qa_candidates(
    '',
    '{"normalized_full_name":"missing","person_id":"bad"}'::jsonb,
    1,'{}'::uuid[]);
  select payload into strict v_path
  from public.vmp_source_qa_candidates_page_path(
    p_manager,'',
    '{"normalized_full_name":"missing","person_id":"bad"}'::jsonb,
    1,'{}'::uuid[]);
  if v_public is distinct from v_path or v_public->>'ok'<>'false'
     or v_public->>'error_code'<>'INVALID_CURSOR' then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_PUBLIC_PATH_CURSOR_PASSTHROUGH invalid_candidate_cursor';
  end if;

  v_public:=public.rpc_source_qa_candidates(
    '',
    '{"normalized_full_name":"missing","person_id":"00000000-0000-0000-0000-000000000000"}'::jsonb,
    1,'{}'::uuid[]);
  select payload into strict v_path
  from public.vmp_source_qa_candidates_page_path(
    p_manager,'',
    '{"normalized_full_name":"missing","person_id":"00000000-0000-0000-0000-000000000000"}'::jsonb,
    1,'{}'::uuid[]);
  if v_public is distinct from v_path or v_public->>'ok'<>'false'
     or v_public->>'error_code'<>'CURSOR_EXPIRED' then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_PUBLIC_PATH_CURSOR_PASSTHROUGH expired_candidate_cursor';
  end if;

  v_public:=public.rpc_source_qa_candidates('',null,51,'{}'::uuid[]);
  select payload into strict v_path
  from public.vmp_source_qa_candidates_page_path(
    p_manager,'',null,51,'{}'::uuid[]);
  if v_public is distinct from v_path or v_public->>'ok'<>'false'
     or v_public->>'error_code'<>'INVALID_LIMIT' then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_PUBLIC_PATH_JSON_EQUIVALENCE invalid_candidate_limit';
  end if;

  perform set_config('request.jwt.claims',json_build_object(
    'sub',p_non_manager,'role','authenticated')::text,true);
  v_public:=public.rpc_source_qa_candidates('',null,1,'{}'::uuid[]);
  select payload into strict v_path
  from public.vmp_source_qa_candidates_page_path(
    p_non_manager,'',null,1,'{}'::uuid[]);
  if v_public is distinct from v_path or v_public->>'ok'<>'false'
     or v_public->>'error_code'<>'FORBIDDEN' then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_PUBLIC_PATH_AUTH_ERROR_ENVELOPE non_manager';
  end if;

  perform set_config('request.jwt.claims',json_build_object(
    'sub',p_inactive,'role','authenticated')::text,true);
  v_public:=public.rpc_list_source_objects(
    'Thiết bị','SPERF','{}'::jsonb,null,1,false,null);
  select payload into strict v_path
  from public.vmp_source_objects_page_path(
    p_inactive,'Thiết bị','SPERF','{}'::jsonb,null,1,false,null);
  if v_public is distinct from v_path or v_public->>'ok'<>'false'
     or v_public->>'error_code'<>'ACCOUNT_DISABLED' then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_PUBLIC_PATH_AUTH_ERROR_ENVELOPE inactive';
  end if;

  perform set_config('request.jwt.claims',json_build_object(
    'sub',p_unresolved,'role','authenticated')::text,true);
  v_public:=public.rpc_my_editable_progress_rights();
  select payload into strict v_path
  from public.vmp_editable_progress_rights_path(p_unresolved);
  if v_public is distinct from v_path or v_public->>'ok'<>'false'
     or v_public->>'error_code'<>'ROLE_UNRESOLVED' then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_PUBLIC_PATH_AUTH_ERROR_ENVELOPE unresolved';
  end if;

  perform set_config('request.jwt.claims','{}',true);
  v_public:=public.rpc_list_source_objects(
    'Thiết bị','SPERF','{}'::jsonb,null,1,false,null);
  select payload into strict v_path
  from public.vmp_source_objects_page_path(
    null,'Thiết bị','SPERF','{}'::jsonb,null,1,false,null);
  if v_public is distinct from v_path or v_public->>'ok'<>'false'
     or v_public->>'error_code'<>'ACCOUNT_DISABLED' then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_PUBLIC_PATH_AUTH_ERROR_ENVELOPE null_uid';
  end if;
end
$$;

set local role authenticated;

select pg_temp.assert_public_path_edge_equivalence(
  md5('source-access-performance-user-1')::uuid,
  md5('source-access-performance-user-4')::uuid,
  '9a030000-0000-4000-8000-000000000001'::uuid,
  '9a030000-0000-4000-8000-000000000002'::uuid,
  (select id from public.vmp_performers
   where user_id='9a030000-0000-4000-8000-000000000002'::uuid)
);

select pg_temp.assert_source_pages(
  md5('source-access-performance-user-4')::uuid,
  'SOURCE_ACCESS_QA_EXACT_FIRST_SECOND_TERMINAL_PAGES');
select pg_temp.assert_source_pages(
  md5('source-access-performance-user-2')::uuid,
  'SOURCE_ACCESS_WORKSHOP_AREA_EXACT_FIRST_SECOND_TERMINAL_PAGES');
select pg_temp.assert_source_pages(
  md5('source-access-performance-user-3')::uuid,
  'SOURCE_ACCESS_WORKSHOP_LINE_EXACT_FIRST_SECOND_TERMINAL_PAGES');

select pg_temp.assert_rights_equivalence(
  md5('source-access-performance-user-4')::uuid);

select pg_temp.assert_candidate_pages(md5('source-access-performance-user-1')::uuid);

\echo 'PASS PERFORMANCE production query paths structured JSON plans and exact keyset pages'
rollback;

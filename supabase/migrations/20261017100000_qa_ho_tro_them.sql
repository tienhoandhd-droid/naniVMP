-- =====================================================================
-- 20261017100000_qa_ho_tro_them.sql — NHIỀU QA CÙNG LÀM MỘT HẠNG MỤC
-- ---------------------------------------------------------------------
-- Chủ dự án 17/10: "1 loại thẩm định có thể có nhiều người làm và nhiều
-- người báo kết quả được (QA)". Trước đây quyền của QA (vai qa_staff) với một
-- hạng mục chỉ đến từ HAI cột của vmp_source_objects: owner_person_id (QA phụ
-- trách) và support_person_id (Người hỗ trợ) — mỗi cột một người.
--
-- Thêm bảng vmp_source_supporters ("QA hỗ trợ thêm"): mỗi hạng mục có bao
-- nhiêu người cũng được. Người trong bảng có ĐÚNG quyền của Người hỗ trợ:
-- xem, cập nhật tiến độ, báo kết quả, nhập số liệu thẩm định thực tế (qua
-- vmp_item_rights → cpc1_private.pq_right) và — nếu có tên trong danh sách
-- QA phụ trách — ký kiểm tra hồ sơ.
--
-- Hai cột cũ GIỮ NGUYÊN (báo cáo, đồng bộ Google Sheet, bảng phân công vẫn
-- đọc chúng). Bốn hàm quyền bên dưới chép nguyên văn từ production
-- (pg_get_functiondef 17/10), chỉ THÊM nhánh "hoặc có trong
-- vmp_source_supporters" — không bỏ điều kiện nào.
--
-- Thêm/bỏ người: rpc_source_supporter_dat, cùng người được phân QA phụ trách
-- hiện nay (vmp_can_manage_source_qa_assignment: Admin, Quản lý QA), cùng
-- luật đủ điều kiện (vmp_qa_assignable), bắt buộc lý do, ghi audit_logs.
-- =====================================================================

begin;

create table if not exists public.vmp_source_supporters (
  source_object_id uuid not null references public.vmp_source_objects(id) on delete cascade,
  performer_id uuid not null references public.vmp_performers(id),
  ly_do text not null check (btrim(ly_do) <> ''),
  them_boi uuid,
  them_luc timestamptz not null default now(),
  primary key (source_object_id, performer_id)
);
create index if not exists vmp_source_supporters_performer_idx
  on public.vmp_source_supporters(performer_id);
comment on table public.vmp_source_supporters is
  'QA hỗ trợ thêm của một hạng mục (ngoài QA phụ trách và Người hỗ trợ). Chỉ sửa qua rpc_source_supporter_dat. 20261017.';
alter table public.vmp_source_supporters enable row level security;
revoke all on table public.vmp_source_supporters from public, anon, authenticated;

-- Web giữ quyền đã tính theo số phiên bản này; đổi người phải tăng nó, giống
-- trigger vmp_authorization_revision_source_update trên vmp_source_objects.
drop trigger if exists vmp_authorization_revision_source_supporters on public.vmp_source_supporters;
create trigger vmp_authorization_revision_source_supporters
  after insert or delete on public.vmp_source_supporters
  for each row execute function public.vmp_touch_authorization_revision();

CREATE OR REPLACE FUNCTION public.vmp_item_rights(p_uid uuid, p_validation_code text)
 RETURNS TABLE(can_view boolean, editable_fields text[], view_reason text, assignment_sources text[], scope_match boolean, area_match boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role text:=public.vmp_business_role(p_uid);
  v_person public.vmp_performers%rowtype;
  v_source public.vmp_source_objects%rowtype;
  v_has_assignment boolean:=false;
  v_sources text[]:='{}'::text[];
  v_qa_manager_fields constant text[]:=array[
    'actual_protocol_date','status_protocol',
    'actual_validation_date','status_validation',
    'actual_report_date','status_report',
    'actual_vmp_date','status_vmp'
  ]::text[];
  v_qa_staff_fields constant text[]:=array[
    'actual_protocol_date','status_protocol','status_validation',
    'actual_report_date','status_report','actual_vmp_date','status_vmp'
  ]::text[];
begin
  if not public.vmp_is_active_session(p_uid) or v_role is null then
    return query select false,'{}'::text[],
      'Tài khoản hoặc vai trò nghiệp vụ không hợp lệ','{}'::text[],false,false;
    return;
  end if;

  if v_role='admin' then
    return query select *
    from public.vmp_item_rights_before_assignment_only_qa(
      p_uid,p_validation_code);
    return;
  end if;

  if v_role='qa_manager' then
    if public.vmp_can_manage_source_qa_assignment(p_uid)
       and exists (
         select 1 from public.vmp_plan_items item
         where item.validation_code=p_validation_code and item.is_active
       ) then
      return query select true,v_qa_manager_fields,
        'Quản lý QA xem toàn bộ hạng mục hoạt động',
        '{}'::text[],true,true;
      return;
    end if;
    return query select false,'{}'::text[],
      'Principal Quản lý QA không hợp lệ','{}'::text[],false,false;
    return;
  end if;

  select performer.* into v_person
  from public.vmp_performers performer
  where performer.user_id=p_uid and performer.is_active;
  if not found then
    return query select false,'{}'::text[],
      'Tài khoản chưa nối hồ sơ hoạt động','{}'::text[],false,false;
    return;
  end if;

  select source_object.* into v_source
  from public.vmp_exact_active_source_for_item(p_validation_code) source_object;
  if not found then
    return query select false,'{}'::text[],
      'Không có đúng một Source hoạt động cho hạng mục',
      '{}'::text[],false,false;
    return;
  end if;

  if v_role='qa_staff' then
    if v_person.id in (v_source.owner_person_id,v_source.support_person_id)
       or exists (select 1 from public.vmp_source_supporters extra
                  where extra.source_object_id=v_source.id
                    and extra.performer_id=v_person.id) then
      select coalesce(array_agg(distinct assignment.source
                 order by assignment.source),'{}'::text[])
        into v_sources
      from public.vmp_item_assignments assignment
      where assignment.validation_code=p_validation_code
        and assignment.performer_id=v_person.id
        and assignment.assignment_kind='qa' and assignment.is_active
        and (assignment.expires_at is null
             or assignment.expires_at>transaction_timestamp());
      return query select true,v_qa_staff_fields,
        'Quan hệ QA trực tiếp trên Source',v_sources,true,true;
      return;
    end if;
    return query select false,'{}'::text[],
      'Không phải QA phụ trách hoặc hỗ trợ trên Source',
      '{}'::text[],false,false;
    return;
  end if;

  if v_role in ('workshop_manager','workshop_staff') then
    if not public.vmp_source_workshop_scope_match(v_person.id,v_source.id) then
      return query select false,'{}'::text[],
        'Không có phạm vi xưởng đang hoạt động',
        '{}'::text[],false,false;
      return;
    end if;

    select coalesce(bool_or(true),false),
           coalesce(array_agg(distinct assignment.source
                    order by assignment.source),'{}'::text[])
      into v_has_assignment,v_sources
    from public.vmp_item_assignments assignment
    where assignment.validation_code=p_validation_code
      and assignment.performer_id=v_person.id
      and assignment.assignment_kind='equipment_department'
      and assignment.is_active
      and (assignment.expires_at is null
           or assignment.expires_at>transaction_timestamp());
    return query select true,
      case when v_has_assignment then
        array['actual_validation_date']::text[] else '{}'::text[] end,
      case when v_has_assignment then
        'Có phạm vi Source và phân công xưởng đang hoạt động'
      else 'Có phạm vi Source; chưa có phân công sửa tiến độ' end,
      v_sources,true,true;
    return;
  end if;

  return query select false,'{}'::text[],
    'Vai trò không được xem hạng mục Source','{}'::text[],false,false;
end
$function$;

CREATE OR REPLACE FUNCTION public.vmp_can_view_source_object(p_uid uuid, p_source_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with actor as (
    select public.vmp_business_role(p_uid) role_name,
           public.vmp_is_active_session(p_uid) active_session,
           (coalesce(auth.role(),'')='service_role'
            or p_uid is not distinct from auth.uid()) caller_matches
  )
  select actor.caller_matches and actor.active_session and exists (
    select 1 from public.vmp_source_objects source_object
    where source_object.id=p_source_id and (
      actor.role_name in ('admin','qa_manager')
      or (source_object.is_active and actor.role_name='qa_staff' and exists (
        select 1 from public.vmp_performers performer
        where performer.user_id=p_uid and performer.is_active
          and (performer.id in (
            source_object.owner_person_id,source_object.support_person_id
          ) or exists (
            select 1 from public.vmp_source_supporters extra
            where extra.source_object_id=source_object.id
              and extra.performer_id=performer.id
          ))
      ))
      or (source_object.is_active
          and actor.role_name in ('workshop_manager','workshop_staff')
          and exists (
        select 1 from public.vmp_performers performer
        where performer.user_id=p_uid and performer.is_active
          and public.vmp_source_workshop_scope_match(
            performer.id,source_object.id)
      ))
    )
  ) from actor
$function$;

CREATE OR REPLACE FUNCTION public.vmp_source_objects_page_path(p_actor uuid, p_object_kind text, p_search text, p_filters jsonb, p_cursor jsonb, p_limit integer, p_include_inactive boolean, p_object_id uuid)
 RETURNS TABLE(payload jsonb)
 LANGUAGE sql
 STABLE
AS $function$
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
  union
  select source_object.*
  from actor
  join public.vmp_performers performer
    on actor.role_name='qa_staff'
   and performer.user_id=actor.actor_id and performer.is_active
  join public.vmp_source_supporters extra
    on extra.performer_id=performer.id
  join public.vmp_source_objects source_object
    on source_object.is_active is true
   and source_object.id=extra.source_object_id
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
$function$;

CREATE OR REPLACE FUNCTION public.vmp_editable_progress_rights_path(p_actor uuid)
 RETURNS TABLE(payload jsonb)
 LANGUAGE sql
 STABLE
AS $function$
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
  union
  select source_object.object_code
  from actor cross join actor_person
  join public.vmp_source_supporters extra
    on extra.performer_id=actor_person.person_id
  join public.vmp_source_objects source_object
    on source_object.is_active is true
   and source_object.id=extra.source_object_id
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
$function$;

-- Đọc danh sách QA hỗ trợ thêm của một hạng mục: ai xem được hạng mục thì
-- xem được danh sách; co_the_sua cho web biết có hiện nút thêm/bỏ không.
create or replace function public.rpc_source_supporters(p_object_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_source_id uuid;
begin
  if not public.vmp_is_active_session(v_actor) then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN', 'error', 'Phiên đăng nhập không hợp lệ');
  end if;
  select id into v_source_id from public.vmp_source_objects
  where object_code = btrim(coalesce(p_object_code, '')) and is_active;
  if not found or not public.vmp_can_view_source_object(v_actor, v_source_id) then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND', 'error', 'Không tìm thấy hạng mục hoặc không có quyền xem');
  end if;
  return jsonb_build_object(
    'ok', true,
    'co_the_sua', public.vmp_can_manage_source_qa_assignment(v_actor),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'performer_id', f.id,
               'performer_name', f.performer_name,
               'ly_do', s.ly_do,
               'them_luc', s.them_luc
             ) order by f.normalized_full_name, f.id)
      from public.vmp_source_supporters s
      join public.vmp_performers f on f.id = s.performer_id
      where s.source_object_id = v_source_id
    ), '[]'::jsonb));
end
$function$;

create or replace function public.rpc_source_supporter_dat(p_object_code text, p_performer_id uuid, p_them boolean, p_ly_do text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_source public.vmp_source_objects%rowtype;
  v_nguoi public.vmp_performers%rowtype;
  v_dang_co boolean;
begin
  if not public.vmp_can_manage_source_qa_assignment(v_actor) then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN', 'error', 'Không có quyền phân công QA');
  end if;
  if nullif(btrim(coalesce(p_ly_do, '')), '') is null then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED', 'error', 'Cần ghi lý do thay đổi');
  end if;
  select * into v_source from public.vmp_source_objects
  where object_code = btrim(coalesce(p_object_code, '')) and is_active for update;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND', 'error', 'Không tìm thấy hạng mục đang hoạt động');
  end if;
  select * into v_nguoi from public.vmp_performers where id = p_performer_id;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'PERSON_NOT_FOUND', 'error', 'Không tìm thấy người thực hiện');
  end if;
  v_dang_co := exists (select 1 from public.vmp_source_supporters
                       where source_object_id = v_source.id and performer_id = p_performer_id);

  if p_them and not v_dang_co then
    if p_performer_id in (v_source.owner_person_id, v_source.support_person_id) then
      return jsonb_build_object('ok', false, 'error_code', 'ALREADY_ASSIGNED',
        'error', 'Người này đã là QA phụ trách hoặc Người hỗ trợ của hạng mục');
    end if;
    -- Cùng luật với ô QA phụ trách/Người hỗ trợ (rpc_save_catalog_object).
    if not v_nguoi.is_active or v_nguoi.user_id is null
       or not exists (select 1 from public.profiles where id = v_nguoi.user_id and is_active)
       or not coalesce(public.vmp_qa_assignable(v_nguoi.user_id, v_nguoi.department), false)
       or (select count(*) from public.vmp_performers where user_id = v_nguoi.user_id and is_active) <> 1 then
      return jsonb_build_object('ok', false, 'error_code', 'PERSON_NOT_ELIGIBLE',
        'error', 'Người này chưa đủ điều kiện làm QA (cần có tên trong danh sách QA phụ trách và tài khoản đang hoạt động)');
    end if;
    insert into public.vmp_source_supporters(source_object_id, performer_id, ly_do, them_boi)
    values (v_source.id, p_performer_id, btrim(p_ly_do), v_actor);
  elsif not p_them and v_dang_co then
    delete from public.vmp_source_supporters
    where source_object_id = v_source.id and performer_id = p_performer_id;
  else
    return jsonb_build_object('ok', true, 'thay_doi', false);
  end if;

  insert into public.audit_logs(user_id, action, table_name, record_id, changed_fields, change_reason,
                                old_data, new_data, source, effective_business_role)
  values (v_actor, (case when p_them then 'INSERT' else 'DELETE' end)::public.audit_action,
          'vmp_source_supporters', v_source.id::text, array['qa_ho_tro_them'], btrim(p_ly_do),
          jsonb_build_object('object_code', v_source.object_code, 'performer_id', p_performer_id,
                             'performer_name', v_nguoi.performer_name, 'trong_danh_sach', v_dang_co),
          jsonb_build_object('object_code', v_source.object_code, 'performer_id', p_performer_id,
                             'performer_name', v_nguoi.performer_name, 'trong_danh_sach', p_them),
          'qa_ho_tro_them', public.vmp_business_role(v_actor));
  return jsonb_build_object('ok', true, 'thay_doi', true);
end
$function$;

revoke all on function public.rpc_source_supporters(text) from public, anon;
revoke all on function public.rpc_source_supporter_dat(text, uuid, boolean, text) from public, anon;
grant execute on function public.rpc_source_supporters(text) to authenticated;
grant execute on function public.rpc_source_supporter_dat(text, uuid, boolean, text) to authenticated;

commit;

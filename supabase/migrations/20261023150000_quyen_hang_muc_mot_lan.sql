-- =====================================================================
-- Tăng tốc: tính quyền xem HẠNG MỤC kế hoạch MỘT LẦN mỗi câu lệnh (23/10/2026)
--
-- Đo trên bản sao production 23/10: vmp_visible_plan_items() gọi
-- item_permissions_mode() và vmp_can_view_item() cho TỪNG dòng (461 hạng mục)
-- → ~80ms mỗi lần, rpc_check_data_quality gọi 4 lần; vai xưởng còn lọc từng
-- lỗi/cảnh báo bằng vmp_can_view_plan_item → 0,7–1s. Quyền tiến độ của Admin
-- gọi vmp_item_rights cho từng hạng mục → ~115ms.
--
-- Hai hàm mới trả CÙNG tập mã hạng mục mà hàm từng dòng cho là xem được:
--   vmp_can_view_item_codes(uid)      ≡ vmp_can_view_item(uid, mã)
--   vmp_can_view_plan_item_codes(uid) ≡ vmp_can_view_plan_item(uid, mã)
-- Các hàm dưới chỉ thay đúng biểu thức kiểm quyền; phần còn lại chép nguyên
-- văn định nghĩa đang chạy trên production. Không đổi bảng, dữ liệu, GRANT,
-- policy RLS, hay luật ai được xem gì.
-- Policy RLS (vmp_plan_items, vmp_revalidation_proposals) GIỮ NGUYÊN: policy
-- chạy bằng vai authenticated, mà hai hàm mới cố ý không cấp cho vai đó.
-- Bằng chứng: tests/sql/quyen-hang-muc-mot-lan.sql (tập mã trùng khít luật cũ
-- với mọi tài khoản + fixture) và băm 16 RPC × 9 tài khoản trước/sau.
-- =====================================================================

create or replace function public.vmp_can_view_item_codes(p_uid uuid)
returns table (validation_code text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Giữ nguyên luật vmp_item_rights(uid, mã).can_view (các nhánh theo vai):
  -- phiên không hoạt động / không vai → không thấy gì;
  -- admin: hạng mục hoạt động có vmp_objects khớp (vmp_item_rights_before_canonical_scope);
  -- qa_manager: mọi hạng mục hoạt động nếu được quyền quản lý phân công QA;
  -- qa_staff: hạng mục có đúng một Source hoạt động mà mình phụ trách/hỗ trợ/hỗ trợ thêm;
  -- xưởng: hạng mục có đúng một Source hoạt động nằm trong phạm vi xưởng được cấp.
  with actor as materialized (
    select public.vmp_business_role(p_uid) role_name,
           public.vmp_is_active_session(p_uid) active_session,
           public.vmp_can_manage_source_qa_assignment(p_uid) manage_qa
  ), me as materialized (
    -- Vai qa_staff/xưởng chỉ có khi tài khoản nối đúng MỘT hồ sơ hoạt động.
    select performer.id
      from public.vmp_performers performer
     where performer.user_id = p_uid and performer.is_active
  ), exact_source as materialized (
    -- Như vmp_exact_active_source_for_item: chỉ nhận mã có đúng một dòng khớp.
    select item.validation_code, (array_agg(source_object.id))[1] source_id
      from public.vmp_plan_items item
      join public.vmp_objects master_object on master_object.code = item.object_code
      join public.vmp_source_objects source_object
        on source_object.object_code = master_object.code and source_object.is_active is true
     where item.is_active is true
     group by item.validation_code
    having count(*) = 1
  )
  select item.validation_code
    from public.vmp_plan_items item, actor
   where actor.active_session and actor.role_name = 'admin' and item.is_active
     and exists (select 1 from public.vmp_objects master_object
                  where master_object.code = item.object_code)
  union
  select item.validation_code
    from public.vmp_plan_items item, actor
   where actor.active_session and actor.role_name = 'qa_manager'
     and actor.manage_qa and item.is_active
  union
  select exact_source.validation_code
    from exact_source
    join public.vmp_source_objects source_object on source_object.id = exact_source.source_id,
         actor, me
   where actor.active_session and actor.role_name = 'qa_staff'
     and (me.id in (source_object.owner_person_id, source_object.support_person_id)
          or exists (select 1 from public.vmp_source_supporters extra
                      where extra.source_object_id = source_object.id
                        and extra.performer_id = me.id))
  union
  select exact_source.validation_code
    from exact_source, actor, me
   where actor.active_session
     and actor.role_name in ('workshop_manager', 'workshop_staff')
     and public.vmp_source_workshop_scope_match(me.id, exact_source.source_id)
$$;

revoke all on function public.vmp_can_view_item_codes(uuid) from public, anon, authenticated;
grant execute on function public.vmp_can_view_item_codes(uuid) to service_role;

create or replace function public.vmp_can_view_plan_item_codes(p_uid uuid)
returns table (validation_code text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Giữ nguyên luật vmp_can_view_plan_item(uid, mã): hạng mục có đúng một
  -- Source hoạt động (vmp_exact_active_source_for_item) và Source đó xem được
  -- theo vmp_can_view_source_object (= vmp_visible_source_ids, 20261023120000).
  with exact_source as materialized (
    select item.validation_code, (array_agg(source_object.id))[1] source_id
      from public.vmp_plan_items item
      join public.vmp_objects master_object on master_object.code = item.object_code
      join public.vmp_source_objects source_object
        on source_object.object_code = master_object.code and source_object.is_active is true
     where item.is_active is true
     group by item.validation_code
    having count(*) = 1
  )
  select exact_source.validation_code
    from exact_source
   where exact_source.source_id in (select visible.id from public.vmp_visible_source_ids(p_uid) visible)
$$;

revoke all on function public.vmp_can_view_plan_item_codes(uuid) from public, anon, authenticated;
grant execute on function public.vmp_can_view_plan_item_codes(uuid) to service_role;

-- vmp_visible_plan_items(): thay biểu thức kiểm từng dòng bằng tập tính một lần
CREATE OR REPLACE FUNCTION public.vmp_visible_plan_items()
 RETURNS SETOF vmp_plan_items
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select item.*
  from public.vmp_plan_items item
  -- Thứ tự điều kiện như cũ; chế độ, tập mã và is_admin tính một lần.
  where (select public.item_permissions_mode()) = 'preview'
     or auth.role() = 'service_role'
     or item.validation_code in (
          select visible.validation_code
            from public.vmp_can_view_item_codes(auth.uid()) visible)
     or (select public.is_admin())
$function$;

-- rpc_check_data_quality(integer): vai xưởng lọc lỗi bằng tập mã (thay 1 chỗ)
CREATE OR REPLACE FUNCTION public.rpc_check_data_quality(p_year integer DEFAULT (EXTRACT(year FROM now()))::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_ket jsonb;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role')
     and public.vmp_is_active_session(auth.uid()) is not true then
    return public.vmp_session_denial();
  end if;
  v_ket := public.rpc_check_data_quality__five_role_impl_20260824(p_year);
  -- VÁ 21/10: như rpc_due_alerts. "id" của mỗi lỗi là mã hạng mục
  -- (vmp_plan_items.id = validation_code).
  if coalesce(auth.role(), '') in ('', 'service_role')
     or public.vmp_business_role(auth.uid()) in ('admin', 'qa_manager', 'qa_staff') then
    return v_ket;
  end if;
  return coalesce((
    select jsonb_agg(x.value order by x.ordinality)
    from jsonb_array_elements(v_ket) with ordinality x(value, ordinality)
    where x.value ->> 'id' in (
      select visible.validation_code
        from public.vmp_can_view_plan_item_codes(auth.uid()) visible)
  ), '[]'::jsonb);
end
$function$;

-- rpc_due_alerts(integer,integer): vai xưởng lọc cảnh báo bằng tập mã (thay 1 chỗ)
CREATE OR REPLACE FUNCTION public.rpc_due_alerts(p_year integer DEFAULT (EXTRACT(year FROM now()))::integer, p_soon_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_ket jsonb;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role')
     and public.vmp_is_active_session(auth.uid()) is not true then
    return public.vmp_session_denial();
  end if;
  v_ket := public.rpc_due_alerts__five_role_impl_20260824(p_year, p_soon_days);
  -- VÁ 21/10: n8n (không JWT), service_role, Admin, Quản lý QA, QA giữ
  -- nguyên danh sách. Vai xưởng chỉ nhận hạng mục đọc được theo
  -- vmp_can_view_plan_item — cùng hàm với policy của vmp_plan_items.
  -- 23/10: lọc bằng tập vmp_can_view_plan_item_codes (cùng luật, tính một lần).
  if coalesce(auth.role(), '') in ('', 'service_role')
     or public.vmp_business_role(auth.uid()) in ('admin', 'qa_manager', 'qa_staff') then
    return v_ket;
  end if;
  return coalesce((
    select jsonb_agg(x.value order by x.ordinality)
    from jsonb_array_elements(v_ket) with ordinality x(value, ordinality)
    where x.value ->> 'validation_code' in (
      select visible.validation_code
        from public.vmp_can_view_plan_item_codes(auth.uid()) visible)
  ), '[]'::jsonb);
end
$function$;

-- vmp_editable_progress_rights_path(uuid): nhánh Admin tính dạng tập hợp
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
         ) active_account,
         public.vmp_is_active_session(p_actor) active_session
), actor_person as (
  select performer.id person_id
  from actor
  join public.vmp_performers performer
    on performer.user_id=p_actor and performer.is_active
), admin_resolved as (
  -- 23/10: viết dạng tập hợp đúng kết quả vmp_item_rights cho Admin
  -- (vmp_item_rights_before_canonical_scope): mọi hạng mục hoạt động có
  -- vmp_objects khớp, 9 trường, cùng lý do.
  select item.validation_code,
         array[
           'actual_protocol_date','status_protocol',
           'actual_validation_date','status_validation',
           'actual_report_date','status_report',
           'actual_vmp_date','status_vmp',
           'scheduled_at'
         ]::text[] editable_fields,
         'Admin quản trị toàn hệ thống'::text view_reason
  from actor
  join public.vmp_plan_items item
    on actor.role_name='admin' and actor.active_session
   and item.is_active is true
  where exists (
    select 1 from public.vmp_objects master_object
    where master_object.code=item.object_code
  )
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

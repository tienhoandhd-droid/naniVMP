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
  from public.vmp_plan_items item
  -- Điều kiện vai đặt thành bộ lọc một lần: người không phải Admin không quét bảng.
  where (select actor.role_name='admin' and actor.active_session from actor)
    and item.is_active is true
    and exists (
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

-- Danh sách duyệt của hàm tự kiểm đứng yên từ 20260828150000: 18 hàm security
-- definer thêm sau đó (đã rà 23/10 — đều kiểm vai/lọc quyền hoặc chỉ cấp
-- service_role) cộng 2 hàm mới ở trên. Chỉ thêm dòng vào allowed, thân giữ nguyên.
CREATE OR REPLACE FUNCTION public.vmp_unfiltered_security_definer_item_readers()
 RETURNS TABLE(signature text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with allowed(signature,reason) as (
    values
      ('audit_plan_item_changes()','owner trigger audit; no browser result'),
      ('audit_plan_item_changes_v2()','owner trigger audit; no browser result'),
      ('ly_do_khong_sua_duoc(text,uuid)','legacy field-rights helper'),
      ('rpc_alert_context(text,integer)',
       'service alert reader through the rights-filtered visible-item helper'),
      ('vmp_item_rights(uuid,text)','target-item rights resolver'),
      ('rpc_my_editable_progress_rights()','rights-filtered browser result'),
      ('rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)',
       'owner-only implementation behind the current rights writer'),
      ('rpc_item_permission_preflight()','manager-only completeness check'),
      ('rpc_luat_xem()','manager-only policy metadata'),
      ('rpc_apply_assignments(boolean)','service assignment writer'),
      ('rpc_apply_sheet_sync(text,text,jsonb)','service sync writer'),
      ('rpc_create_plan_item(text,text,integer,integer,jsonb)',
       'manager writer with Source-first locks'),
      ('rpc_delete_plan_item(text,text)','manager soft-delete writer'),
      ('rpc_generate_timeline(integer,boolean)','manager timeline writer'),
      ('rpc_recalc_criticality(boolean)','manager criticality writer'),
      ('rpc_reconcile_orphan_objects(text[])','service repair writer'),
      ('rpc_refresh_computed_status()','service status writer'),
      ('rpc_refresh_source_item_assignments()','service projection repair'),
      ('rpc_register_alert(text,text,text,text,text,text,text)',
       'service alert writer'),
      ('rpc_resolve_missing(text,text,text)','manager missing-item writer'),
      ('rpc_rollback_vmp_sheet_sync(uuid)','service rollback writer'),
      ('rpc_set_item_assignment(uuid,text,text,text,text)',
       'legacy assignment writer'),
      ('rpc_set_item_performer(text,text)','legacy performer writer'),
      ('rpc_item_assignments(text,uuid)','manager assignment reader'),
      ('rpc_set_item_assignment(uuid,text,text,text,text,text,uuid)',
       'manager assignment writer'),
      ('rpc_set_item_performer_by_id(text,uuid,text)',
       'manager performer writer through its reviewed owner delegate'),
      ('rpc_upsert_source_object(text,text,jsonb)','service Source writer'),
      ('rpc_set_item_state(text,text,text)','manager state writer'),
      ('rpc_sync_vmp_sheet_snapshot(text,text,text,jsonb,jsonb)',
       'service snapshot writer'),
      ('rpc_sync_vmp_sheet_snapshot_with_extras(text,text,text,jsonb,jsonb)',
       'service extended snapshot writer'),
      ('rpc_update_progress(text,jsonb,text,jsonb,integer)',
       'rights-filtered browser writer'),
      ('rpc_active_rules()','manager-only catalog rules reader'),
      ('rpc_apply_catalog_change(uuid,text,integer)',
       'manager catalog writer with Source-first locks'),
      ('rpc_preview_catalog_change(uuid)','manager-only pending preview'),
      ('rpc_preview_item_rights(uuid,text)',
       'manager-only explicit item-rights preview'),
      ('rpc_apply_sheet_sync__source_impl_20260828(text,text,jsonb)',
       'owner-only renamed sync implementation'),
      ('rpc_rollback_vmp_sheet_sync__source_impl_20260828(uuid)',
       'owner-only renamed rollback implementation'),
      ('rpc_sync_vmp_sheet_snapshot__source_impl_20260828(text,text,text,jsonb,jsonb)',
       'owner-only renamed snapshot implementation'),
      ('vmp_exact_active_source_for_item(text)',
       'owner-only exact Source relation resolver'),
      ('vmp_guard_active_source_rekey()','owner trigger relation guard'),
      ('vmp_guard_plan_master_rekey()','owner trigger master relation guard'),
      ('vmp_reconcile_source_qa_projection(uuid)',
       'owner-only projection reconciler'),
      ('rpc_cleanup_orphan_source_assignment_resolutions(text)',
       'service assignment repair writer'),
      ('rpc_commit_catalog_import(uuid,text)',
       'manager import writer with Source-first locks'),
      ('rpc_delete_source_object(text,text,text)','service Source writer'),
      ('rpc_export_source_objects(text,text,jsonb,jsonb,integer)',
       'rights-filtered audited browser export'),
      ('rpc_link_item_permission_account(uuid,uuid,text,integer)',
       'manager account-link writer'),
      ('rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)',
       'rights-filtered browser Source reader'),
      ('rpc_resolve_source_item_assignment(uuid,uuid,text)',
       'service assignment resolution writer'),
      ('rpc_save_catalog_object(text,text,jsonb,text,integer)',
       'manager Source writer with atomic access projection'),
      ('rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)',
       'manager coverage writer with reason and version checks'),
      ('rpc_source_field_suggestions(text,text,text,jsonb,integer)',
       'manager-only bounded Source suggestions'),
      ('rpc_source_object_facets(text,jsonb)',
       'rights-filtered bounded Source facets'),
      ('rpc_source_workshop_scope_choices(text,text,text,jsonb,integer)',
       'manager-only coverage tuple reader'),
      ('rpc_stage_catalog_import(text,text,text,text,jsonb)',
       'manager-only import staging writer'),
      ('vmp_can_view_source_object(uuid,uuid)',
       'current-actor exact Source predicate with alternate-UID defense'),
      ('vmp_enforce_active_plan_source_relation()',
       'owner trigger enforcing exact active Source relation'),
      ('vmp_lock_source_plan_relations(text[])',
       'owner-only global Source-first lock helper'),
      ('vmp_set_item_assignment_unhardened(uuid,text,text,text,text)',
       'owner-only implementation behind reviewed assignment writers'),
      ('vmp_source_workshop_scope_match(uuid,uuid)',
       'private workshop Source predicate'),
      ('vmp_sync_item_assignments_from_performer()',
       'owner trigger synchronization writer'),
      ('vmp_upsert_source_object_before_person_id(text,text,jsonb)',
       'owner-only legacy Source writer implementation'),
      ('rpc_get_vmp_dashboard(integer,boolean,boolean)',
       'rights-filtered visible-Source dashboard'),
      ('rpc_get_vmp_watermark(integer)',
       'rights-filtered visible-Source cache watermark'),
      ('rpc_source_warnings(integer)',
       'rights-filtered visible-Source warnings'),
      ('vmp_visible_plan_items()',
       'rights-filtered current-actor item relation'),
      ('rpc_catalog_history(jsonb,integer,integer)',
       'admin/qa_manager-only catalog audit history (20260824120000, 20261008150000)'),
      ('rpc_catalog_history_detail(uuid)',
       'admin/qa_manager-only catalog audit detail (20260824120000, 20261008150000)'),
      ('rpc_change_create_plan_item(uuid,integer,text,text,integer)',
       'QA editor plus edit_catalog gate (20261022100000)'),
      ('rpc_change_plan_badges()',
       'QA roles see all; others filtered by vmp_can_view_plan_item (20261022100000)'),
      ('rpc_change_save(uuid,integer,text[],text[],date,text,text)',
       'vmp_change_can_edit: admin/qa_manager/qa_staff only (20261022100000)'),
      ('rpc_check_data_quality(integer)',
       'rights-filtered visible-item quality checks (20261021120000, 20261023150000)'),
      ('rpc_confirm_revalidation_proposal(uuid,text,integer)',
       'vmp_can_manage_revalidation: admin/qa_manager (20260901120000)'),
      ('rpc_due_alerts(integer,integer)',
       'rights-filtered visible-item due alerts (20261021120000, 20261023150000)'),
      ('rpc_export_source_objects__manager_lock_impl_20260901(text,text,jsonb,jsonb,integer)',
       'owner-only export implementation behind manager lock (20260901090000)'),
      ('rpc_refresh_revalidation_proposals(date)',
       'vmp_can_manage_revalidation: admin/qa_manager (20260901120000)'),
      ('rpc_source_supporter_dat(text,uuid,boolean,text)',
       'vmp_can_manage_source_qa_assignment gate (20261017100000)'),
      ('rpc_source_supporters(text)',
       'vmp_can_view_source_object gate (20261017100000)'),
      ('rpc_team_overview_summary(integer)',
       'overview screen gate, counts through vmp_visible_plan_items (20260829150000, 20260831180000)'),
      ('vmp_can_view_item_codes(uuid)',
       'service-only set form of vmp_can_view_item (20261023150000)'),
      ('vmp_can_view_plan_item_codes(uuid)',
       'service-only set form of vmp_can_view_plan_item (20261023150000)'),
      ('vmp_change_can_view(uuid,uuid)',
       'service-only change-request visibility helper (20261022100000)'),
      ('vmp_change_record_json(uuid,uuid,boolean)',
       'service-only change-request projection (20261022100000, 20261022150000)'),
      ('vmp_tl_hang_muc(uuid)',
       'service-only assistant tool, filtered by caller rights (20261023090000)'),
      ('vmp_tl_thiet_bi(uuid,jsonb)',
       'service-only assistant tool, filtered by caller rights (20261023090000)'),
      ('vmp_visible_source_ids(uuid)',
       'service-only set form of vmp_can_view_source_object (20261023120000)'),
      ('vmp_unfiltered_security_definer_item_readers()',
       'service-only executable inventory; self-reference is audited')
  ), candidates as (
    select case
      when procedure.proname like '%\_\_five\_role\_impl\_20260824' escape '\'
        then format('%s(%s)',left(procedure.proname,
          -length('__five_role_impl_20260824')),
          replace(pg_catalog.oidvectortypes(procedure.proargtypes),', ',','))
      else procedure.oid::regprocedure::text
    end signature
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='public' and procedure.prosecdef
      and (pg_get_functiondef(procedure.oid) ilike '%vmp_source_objects%'
        or pg_get_functiondef(procedure.oid) ilike '%vmp_plan_items%'
        or pg_get_functiondef(procedure.oid) ilike '%vmp_item_assignments%')
  )
  select candidate.signature
  from candidates candidate
  left join allowed on allowed.signature=candidate.signature
  where allowed.signature is null
  order by candidate.signature
$function$;
revoke all on function public.vmp_unfiltered_security_definer_item_readers()
  from public,anon,authenticated;
grant execute on function public.vmp_unfiltered_security_definer_item_readers()
  to service_role;

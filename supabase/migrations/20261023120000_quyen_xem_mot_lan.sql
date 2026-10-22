-- =====================================================================
-- Tăng tốc: tính quyền xem đối tượng nguồn MỘT LẦN mỗi câu lệnh (23/10/2026)
--
-- Đo trên production 22/10: vmp_can_view_source_object chạy cho TỪNG dòng
-- (272 đối tượng), mỗi lần tự tính lại vmp_business_role 2–3 lần → 0,28–0,48s
-- chỉ riêng phần kiểm quyền trong dashboard, watermark (gọi 20s/lần), cảnh
-- báo/facets nguồn, xuất Excel và trợ lý.
--
-- vmp_visible_source_ids(uid) trả CÙNG tập id mà vmp_can_view_source_object
-- cho là xem được (cùng điều kiện, viết dạng tập hợp, vai tính một lần).
-- Các hàm dưới chỉ thay đúng biểu thức kiểm quyền; phần còn lại chép
-- nguyên văn định nghĩa đang chạy trên production. Không đổi bảng, dữ liệu,
-- quyền GRANT, hay luật ai được xem gì.
-- Bằng chứng tương đương: băm kết quả 7 RPC cho mọi tài khoản thật trên bản
-- sao production trước/sau phải giống hệt (tests/sql/quyen-xem-mot-lan.sql).
-- =====================================================================

create or replace function public.vmp_visible_source_ids(p_uid uuid)
returns table (id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Giữ nguyên luật của vmp_can_view_source_object (bản 20260828150000):
  -- đúng người gọi + phiên hoạt động; admin/qa_manager xem hết; qa_staff xem
  -- đối tượng mình phụ trách/hỗ trợ/hỗ trợ thêm; xưởng theo phạm vi được cấp.
  with actor as materialized (
    select public.vmp_business_role(p_uid) role_name,
           public.vmp_is_active_session(p_uid) active_session,
           (coalesce(auth.role(), '') = 'service_role'
            or p_uid is not distinct from auth.uid()) caller_matches
  ), me as materialized (
    select performer.id
      from public.vmp_performers performer
     where performer.user_id = p_uid and performer.is_active
  )
  select source_object.id
    from public.vmp_source_objects source_object, actor
   where actor.caller_matches and actor.active_session and (
     actor.role_name in ('admin', 'qa_manager')
     or (source_object.is_active and actor.role_name = 'qa_staff' and exists (
       select 1 from me
        where me.id in (source_object.owner_person_id, source_object.support_person_id)
           or exists (select 1 from public.vmp_source_supporters extra
                       where extra.source_object_id = source_object.id
                         and extra.performer_id = me.id)))
     or (source_object.is_active
         and actor.role_name in ('workshop_manager', 'workshop_staff')
         and exists (select 1 from me
                      where public.vmp_source_workshop_scope_match(me.id, source_object.id)))
   )
$$;

revoke all on function public.vmp_visible_source_ids(uuid) from public, anon, authenticated;

-- rpc_get_vmp_dashboard(integer,boolean,boolean): thay 1 chỗ kiểm từng dòng
CREATE OR REPLACE FUNCTION public.rpc_get_vmp_dashboard(p_year integer DEFAULT (EXTRACT(year FROM now()))::integer, p_include_missing boolean DEFAULT false, p_include_cancelled boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;

  with visible_source as materialized (
    select source_object.*,master_object.name master_name,
           master_object.classification master_classification,
           master_object.department master_department
    from public.vmp_source_objects source_object
    left join public.vmp_objects master_object
      on master_object.code=source_object.object_code
     and master_object.is_active
    where source_object.is_active
      and (auth.role()='service_role'
        or source_object.id in (select visible.id from public.vmp_visible_source_ids(auth.uid()) visible))
  ), visible_items as materialized (
    select item.*,source_object.master_name object_name,
           source_object.master_classification classification,
           source_object.master_department obj_dept,
           source_object.area_code area,source_object.line,
           source_object.frequency_months
    from public.vmp_plan_items item
    join visible_source source_object
      on source_object.object_code=item.object_code
    where item.year=p_year and item.is_active
      and (p_include_missing or not item.missing_from_sheet)
      and (p_include_cancelled
        or coalesce(item.item_state,'active')<>'cancelled')
  )
  select jsonb_build_object(
    'objects',coalesce((select jsonb_agg(jsonb_build_object(
      'code',source_object.object_code,
      'name',source_object.object_name,
      'cls',coalesce(source_object.master_classification,
                     public.vmp_ma_phan_loai(source_object.object_kind)),
      'cls_ten',source_object.object_kind,
      'dept',coalesce(source_object.master_department,
                      (public.vmp_parse_depts(source_object.department))[1],
                      'qa'),
      'dept_ten',source_object.department,
      'area',source_object.area_code,'line',source_object.line,
      'crit',case when source_object.criticality_score>=7 then 'Cao'
                  when source_object.criticality_score>=4 then 'TB'
                  when source_object.criticality_score is not null then 'Thấp'
                  else 'TB' end,
      'score',source_object.criticality_score,
      'owner',source_object.owner_name,
      'freq',source_object.frequency_months,
      'need',source_object.validate_flag='y'
    ) order by source_object.object_code) from visible_source source_object),
      '[]'::jsonb),
    'activities',coalesce((select jsonb_agg(jsonb_build_object(
      'id',item.validation_code,
      'validation_code',item.validation_code,
      'code',item.object_code,
      'name',item.object_name,
      'vtype',item.validation_type,
      'dept',item.obj_dept,
      'cls',coalesce(item.classification,public.vmp_ma_phan_loai(
        (select source.object_kind from visible_source source
         where source.object_code=item.object_code limit 1))),
      'depts',to_jsonb(coalesce(
        nullif(item.departments,array[]::text[]),
        nullif(public.vmp_parse_depts(item.department_text),array[]::text[]),
        array[coalesce(item.obj_dept,'qa')])),
      'exec_depts',to_jsonb(coalesce(
        item.execution_departments,
        public.vmp_parse_depts(nullif(trim(
          item.source_sheet_data->>'bo_phan_thuc_hien_goc'),'')),
        '{}'::text[])),
      'owner',coalesce(nullif(trim(item.owner_name),''),'—'),
      'support',nullif(trim(item.secondary_owner),''),
      'group',item.work_group,'effort',item.effort_days,
      'score',item.criticality_score,
      'crit',case when item.criticality_score>=7 then 'Cao'
                  when item.criticality_score>=4 then 'TB'
                  when item.criticality_score is not null then 'Thấp'
                  else 'TB' end,
      'target',item.deadline_vmp,'st',item.computed_status::text,
      'state',coalesce(item.item_state,'active'),'version',item.version,
      'dep',item.report_class,'docDone',item.is_doc_complete,
      'mismatch',item.has_mismatch,
      '_raw',jsonb_build_object(
        'version',item.version,'ma',item.object_code,
        'loai_td',item.validation_type,'qa',item.owner_name,
        'owner_person_id',item.owner_person_id,
        'email_qa',(select performer.email
          from public.vmp_performers performer
          where performer.id=item.owner_person_id and performer.is_active
            and performer.email is not null
            and performer.email not like '%.local'),
        'ho_tro',item.secondary_owner,'nhom_viec',item.work_group,
        'diem_trong_yeu',item.criticality_score,'bo_phan',item.obj_dept,
        'bo_phan_goc',item.department_text,
        'bo_phan_thuc_hien_goc',nullif(trim(
          item.source_sheet_data->>'bo_phan_thuc_hien_goc'),''),
        'phan_loai',item.classification,'khu_vuc',item.area,
        'line',item.line,'tan_suat',item.frequency_months,
        'dl_vmp',item.deadline_vmp,'dl_de_cuong',item.deadline_protocol,
        'dl_tham_dinh',item.deadline_validation,
        'dl_bao_cao',item.deadline_report,
        'tt_de_cuong',item.status_protocol::text,
        'tt_tham_dinh',item.status_validation::text,
        'tt_bao_cao',item.status_report::text,'tt_vmp',item.status_vmp::text,
        'tt_de_cuong_goc',item.status_protocol_text,
        'tt_tham_dinh_goc',item.status_validation_text,
        'tt_bao_cao_goc',item.status_report_text,
        'tt_vmp_goc',item.status_vmp_text,
        'ngay_de_cuong',item.actual_protocol_date,
        'ngay_tham_dinh',item.actual_validation_date,
        'ngay_bao_cao',item.actual_report_date,
        'ngay_vmp',item.actual_vmp_date,'lich_td',item.scheduled_date,
        'scheduled_at',item.scheduled_at,
        'state',coalesce(item.item_state,'active'))
    ) order by item.validation_code) from visible_items item),'[]'::jsonb),
    'source','supabase',
    'updated_at',greatest(
      coalesce((select max(updated_at) from visible_source),'epoch'::timestamptz),
      coalesce((select max(updated_at) from visible_items),'epoch'::timestamptz)),
    'authorization_revision',coalesce((select revision
      from public.vmp_authorization_revision where singleton),0),
    'year',p_year
  ) into v_result;
  return v_result;
end
$function$;

-- rpc_get_vmp_watermark(integer): thay 1 chỗ kiểm từng dòng
CREATE OR REPLACE FUNCTION public.rpc_get_vmp_watermark(p_year integer DEFAULT (EXTRACT(year FROM now()))::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  with visible_source as materialized (
    select source_object.*
    from public.vmp_source_objects source_object
    where source_object.is_active
      and (auth.role()='service_role'
        or source_object.id in (select visible.id from public.vmp_visible_source_ids(auth.uid()) visible))
  ), visible_items as materialized (
    select item.* from public.vmp_plan_items item
    join visible_source source_object
      on source_object.object_code=item.object_code
    where item.year=p_year and item.is_active
  )
  select jsonb_build_object(
    'year',p_year,'plan_items',(select count(*) from visible_items),
    'objects',(select count(*) from visible_source),
    'updated_at',greatest(
      coalesce((select max(updated_at) from visible_source),'epoch'::timestamptz),
      coalesce((select max(updated_at) from visible_items),'epoch'::timestamptz)),
    'authorization_revision',coalesce((select revision
      from public.vmp_authorization_revision where singleton),0)
  ) into v_result;
  return v_result;
end
$function$;

-- rpc_source_object_facets(text,jsonb): thay 1 chỗ kiểm từng dòng
CREATE OR REPLACE FUNCTION public.rpc_source_object_facets(p_object_kind text, p_filters jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_role text:=public.vmp_business_role(auth.uid());
  v_departments jsonb;
  v_areas jsonb;
  v_owners jsonb;
  v_validation jsonb;
  v_first_month jsonb;
  v_ownership jsonb;
  v_frequency jsonb;
begin
  if not public.vmp_is_active_session(v_actor) then
    return jsonb_build_object('ok',false,'error_code','ACCOUNT_DISABLED',
      'error','Tài khoản không hoạt động');
  end if;
  if v_role is null then
    return jsonb_build_object('ok',false,'error_code','ROLE_UNRESOLVED',
      'error','Không xác định được vai trò nghiệp vụ');
  end if;
  if not public.vmp_source_filters_valid(p_filters) then
    return jsonb_build_object('ok',false,'error_code','INVALID_FILTERS',
      'error','Bộ lọc phải là JSON object');
  end if;

  with visible as materialized (
    select source_object.*
    from public.vmp_source_objects source_object
    where source_object.is_active
      and source_object.id in (select visible.id from public.vmp_visible_source_ids(v_actor) visible)
      and (p_object_kind is null or source_object.object_kind=p_object_kind)
      and public.vmp_source_object_matches_filters(
            source_object,null,p_filters)
  ), department_rows as (
    select department value,count(*) row_count from visible
    where nullif(btrim(department),'') is not null group by department
  ), area_rows as (
    select area_code value,count(*) row_count from visible
    where nullif(btrim(area_code),'') is not null group by area_code
  ), owner_rows as (
    select owner_person_id person_id,max(owner_name) name,count(*) row_count
    from visible where owner_person_id is not null
      and nullif(btrim(owner_name),'') is not null group by owner_person_id
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object(
      'value',value,'count',row_count) order by value)
      from department_rows),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'value',value,'count',row_count) order by value)
      from area_rows),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'value','owner:'||public.vmp_source_scope_key(name),
      'person_id',person_id,'name',name,'count',row_count)
      order by name nulls last,person_id) from owner_rows),'[]'::jsonb)
    ,jsonb_build_array(
      jsonb_build_object('value','outside','count',(select count(*) from visible
        where lower(btrim(coalesce(validate_flag,'')))<>'y')),
      jsonb_build_object('value','validated','count',(select count(*) from visible
        where lower(btrim(coalesce(validate_flag,'')))='y')))
    ,jsonb_build_array(
      jsonb_build_object('value','missing','count',(select count(*) from visible
        where first_month is null)),
      jsonb_build_object('value','present','count',(select count(*) from visible
        where first_month is not null)))
    ,jsonb_build_array(
      jsonb_build_object('value','assigned','count',(select count(*) from visible
        where nullif(btrim(owner_name),'') is not null)),
      jsonb_build_object('value','unassigned','count',(select count(*) from visible
        where nullif(btrim(owner_name),'') is null)))
    ,jsonb_build_array(
      jsonb_build_object('value','gt12','count',(select count(*) from visible
        where frequency_months>12)),
      jsonb_build_object('value','lte12','count',(select count(*) from visible
        where frequency_months is not null and frequency_months<=12)))
  into v_departments,v_areas,v_owners,v_validation,v_first_month,
       v_ownership,v_frequency;

  return jsonb_build_object('ok',true,'departments',v_departments,
    'areas',v_areas,'owners',v_owners,'validation',v_validation,
    'first_month',v_first_month,'ownership',v_ownership,
    'frequency',v_frequency);
end
$function$;

-- rpc_source_warnings(integer): thay 1 chỗ kiểm từng dòng
CREATE OR REPLACE FUNCTION public.rpc_source_warnings(p_year integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_year integer:=coalesce(p_year,extract(year from now())::integer);
  v_result jsonb;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  with visible_source as materialized (
    select source_object.*
    from public.vmp_source_objects source_object
    where source_object.is_active
      and (auth.role()='service_role'
        or source_object.id in (select visible.id from public.vmp_visible_source_ids(auth.uid()) visible))
  )
  select jsonb_build_object(
    'nam',v_year,
    'thieu_thang_dau',coalesce((select jsonb_agg(jsonb_build_object(
      'object_kind',object_kind,'object_code',object_code,
      'object_name',object_name) order by object_code)
      from visible_source where validate_flag='y' and first_month is null),
      '[]'::jsonb),
    'chua_tung_iq',coalesce((select jsonb_agg(jsonb_build_object(
      'object_kind',source_object.object_kind,
      'object_code',source_object.object_code,
      'object_name',source_object.object_name,'nam_nhap',source_object.year_ref)
      order by source_object.object_code)
      from visible_source source_object
      where source_object.validate_flag='y'
        and source_object.object_kind in ('Thiết bị','Hệ thống phụ trợ')
        and source_object.year_ref is not null
        and source_object.year_ref<>v_year
        and not exists (select 1 from public.vmp_plan_items item
          where item.object_code=source_object.object_code
            and item.validation_type='IQ' and item.is_active)),
      '[]'::jsonb),
    'show_tat',coalesce((select jsonb_agg(jsonb_build_object(
      'object_kind',object_kind,'object_code',object_code,
      'object_name',object_name,'show_flag',show_flag) order by object_code)
      from visible_source where validate_flag='y' and show_flag is not null
        and lower(show_flag)<>'y'),'[]'::jsonb),
    'chua_hoat_dong',coalesce((select jsonb_agg(jsonb_build_object(
      'object_kind',object_kind,'object_code',object_code,
      'object_name',object_name,'tinh_trang',status) order by object_code)
      from visible_source where validate_flag='y' and status is not null
        and lower(status) like '%chưa%'),'[]'::jsonb),
    'ma_tam',coalesce((select jsonb_agg(jsonb_build_object(
      'object_kind',object_kind,'object_code',object_code,
      'object_name',object_name,'note',note) order by object_code)
      from visible_source where object_code like 'TAM-%'),'[]'::jsonb)
  ) into v_result;
  return v_result;
end
$function$;

-- rpc_export_source_objects__manager_lock_impl_20260901(text,text,jsonb,jsonb,integer): thay 2 chỗ kiểm từng dòng
CREATE OR REPLACE FUNCTION public.rpc_export_source_objects__manager_lock_impl_20260901(p_object_kind text, p_search text, p_filters jsonb, p_cursor jsonb, p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_role text:=public.vmp_business_role(auth.uid());
  v_cursor_code text;
  v_cursor_id uuid;
  v_rows jsonb;
  v_total integer;
  v_has_more boolean;
  v_next jsonb;
begin
  if not public.vmp_is_active_session(v_actor) then
    return jsonb_build_object('ok',false,'error_code','ACCOUNT_DISABLED',
      'error','Tài khoản không hoạt động');
  end if;
  if v_role is null then
    return jsonb_build_object('ok',false,'error_code','ROLE_UNRESOLVED',
      'error','Không xác định được vai trò nghiệp vụ');
  end if;
  if p_limit is null or p_limit<1 or p_limit>500 then
    return jsonb_build_object('ok',false,'error_code','INVALID_LIMIT',
      'error','Giới hạn xuất phải từ 1 đến 500');
  end if;
  if not public.vmp_source_filters_valid(p_filters) then
    return jsonb_build_object('ok',false,'error_code','INVALID_FILTERS',
      'error','Bộ lọc phải là JSON object');
  end if;
  if p_cursor is not null then
    if jsonb_typeof(p_cursor)<>'object'
       or jsonb_typeof(p_cursor->'object_code')<>'string'
       or jsonb_typeof(p_cursor->'id')<>'string'
       or (p_cursor->>'id') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('ok',false,'error_code','INVALID_CURSOR',
        'error','Con trỏ không hợp lệ');
    end if;
    v_cursor_code:=p_cursor->>'object_code';
    v_cursor_id:=(p_cursor->>'id')::uuid;
  end if;

  if p_cursor is not null and not exists (
    select 1
    from public.vmp_source_objects source_object
    where source_object.id=v_cursor_id
      and source_object.object_code=v_cursor_code
      and source_object.is_active
      and source_object.id in (select visible.id from public.vmp_visible_source_ids(v_actor) visible)
      and (p_object_kind is null or source_object.object_kind=p_object_kind)
      and public.vmp_source_object_matches_filters(
            source_object,p_search,p_filters)
  ) then
    return jsonb_build_object('ok',false,'error_code','CURSOR_EXPIRED',
      'error','Con trỏ không còn hiệu lực');
  end if;

  with filtered as materialized (
    select source_object.*
    from public.vmp_source_objects source_object
    where source_object.is_active
      and source_object.id in (select visible.id from public.vmp_visible_source_ids(v_actor) visible)
      and (p_object_kind is null or source_object.object_kind=p_object_kind)
      and public.vmp_source_object_matches_filters(
            source_object,p_search,p_filters)
  ), page_plus_one as (
    select filtered.* from filtered
    where p_cursor is null
       or (filtered.object_code,filtered.id)>(v_cursor_code,v_cursor_id)
    order by object_code,id limit p_limit+1
  ), returned as (
    select page_plus_one.* from page_plus_one
    order by object_code,id limit p_limit
  )
  select
    coalesce((select jsonb_agg(to_jsonb(returned) order by object_code,id)
              from returned),'[]'::jsonb),
    (select count(*) from filtered),
    (select count(*) from page_plus_one)>p_limit,
    case when (select count(*) from page_plus_one)>p_limit then (
      select jsonb_build_object('object_code',object_code,'id',id)
      from returned order by object_code desc,id desc limit 1
    ) else null end
  into v_rows,v_total,v_has_more,v_next;

  insert into public.audit_logs(
    user_id,action,table_name,record_id,new_data,change_reason,source,
    effective_business_role
  ) values (
    v_actor,'EXPORT','vmp_source_objects',coalesce(p_object_kind,'*'),
    jsonb_build_object('returned',jsonb_array_length(v_rows),
      'authorized_total',v_total,'has_more',v_has_more),
    'Xuất danh mục Source theo phạm vi được phép','source_access_export',v_role
  );

  return jsonb_build_object('ok',true,'rows',v_rows,
    'authorized_total',v_total,'next_cursor',v_next);
end
$function$;

-- vmp_tl_hang_muc(uuid): thay 1 chỗ kiểm từng dòng
CREATE OR REPLACE FUNCTION public.vmp_tl_hang_muc(p_uid uuid)
 RETURNS TABLE(validation_code text, object_code text, object_name text, validation_type text, work_group text, depts text[], area text, line text, owner_name text, secondary_owner text, owner_person_id uuid, deadline_vmp date, actual_vmp_date date, giai_doan text, xong boolean, so_ngay integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with nguon as materialized (
    select s.object_code, s.area_code, s.line, o.name master_name, o.department master_department
      from public.vmp_source_objects s
      left join public.vmp_objects o on o.code = s.object_code and o.is_active
     where s.is_active
       and s.id in (select visible.id from public.vmp_visible_source_ids(p_uid) visible)
  ), muc as (
    select i.*, n.master_name, n.master_department, n.area_code, n.line src_line,
           (i.actual_vmp_date is not null or i.status_vmp::text = 'completed') la_xong
      from public.vmp_plan_items i
      join nguon n on n.object_code = i.object_code
     where i.year = extract(year from public.vmp_tl_hom_nay())::int
       and i.is_active
       and not i.missing_from_sheet
       -- Web chỉ đếm hạng mục 'active' (classifyVmpDeadline, tally); bỏ cả 'not_applicable'.
       and coalesce(i.item_state, 'active') = 'active'
  )
  select m.validation_code, m.object_code, m.master_name, m.validation_type, m.work_group,
         coalesce(nullif(m.departments, array[]::text[]),
                  nullif(public.vmp_parse_depts(m.department_text), array[]::text[]),
                  array[coalesce(m.master_department, 'qa')]),
         m.area_code, m.src_line, nullif(btrim(m.owner_name), ''), nullif(btrim(m.secondary_owner), ''),
         m.owner_person_id, m.deadline_vmp, m.actual_vmp_date,
         public.vmp_tl_giai_doan(m.status_protocol::text, m.status_validation::text,
                                 m.status_report::text, m.status_vmp::text, m.la_xong),
         m.la_xong,
         case when m.la_xong or m.deadline_vmp is null then null
              else m.deadline_vmp - public.vmp_tl_hom_nay() end
    from muc m
$function$;

-- vmp_tl_thiet_bi(uuid,jsonb): thay 1 chỗ kiểm từng dòng
CREATE OR REPLACE FUNCTION public.vmp_tl_thiet_bi(p_uid uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tk text := btrim(p->>'tu_khoa');
  v_so integer;
  v_ma text;
  v_ten text;
  v_hoi jsonb;
  v_dong jsonb;
  v_tong integer;
  v_cc jsonb;
begin
  -- Đối tượng xem được và khớp mọi từ khoá (mã, tên, khu, line). Trùng mã thì chọn luôn.
  with khop as (
    select s.object_code code, o.name, s.area_code area,
           public.vmp_tl_chuan(s.object_code) = public.vmp_tl_chuan(v_tk) chinh_xac
      from public.vmp_source_objects s
      left join public.vmp_objects o on o.code = s.object_code and o.is_active
     where s.is_active
       and public.vmp_tl_khop_tu(concat_ws(' ', s.object_code, o.name, s.area_code, s.line), v_tk)
       and s.id in (select visible.id from public.vmp_visible_source_ids(p_uid) visible)
  ), chon as (
    select * from khop k
     where k.chinh_xac or not exists (select 1 from khop x where x.chinh_xac)
  )
  select count(*), min(c.code), min(c.name),
         jsonb_agg(public.vmp_tl_goi_y(concat_ws(' · ', c.code, c.name, nullif(c.area, '—')),
                                       'thiet_bi', jsonb_build_object('tu_khoa', c.code))
                   order by c.name, c.code) filter (where c.rn <= 8)
    into v_so, v_ma, v_ten, v_hoi
    from (select chon.*, row_number() over (order by chon.name, chon.code) rn from chon) c;

  if v_so = 0 then
    return jsonb_build_object('ok', true, 'hieu_la', 'Thiết bị / đối tượng: ' || v_tk,
      'tra_loi', format('Không thấy đối tượng nào khớp "%s" trong phạm vi bạn được xem. Thử gõ mã (vd KNTB133) hoặc một phần tên.', v_tk));
  end if;

  if v_so > 1 then
    return jsonb_build_object('ok', true, 'hieu_la', 'Thiết bị / đối tượng: ' || v_tk,
      'tra_loi', case when v_so <= 8 then format('Có %s đối tượng khớp "%s". Bạn chọn một:', v_so, v_tk)
                      else format('Có %s đối tượng khớp "%s". Dưới đây là 8 cái đầu, gõ cụ thể hơn nếu chưa thấy:', v_so, v_tk) end,
      'hoi_lai', v_hoi);
  end if;

  select count(*),
         coalesce(jsonb_agg(public.vmp_tl_dong(h.validation_code, h.object_code, h.object_name,
                    h.validation_type, h.deadline_vmp, h.so_ngay, h.owner_name, h.giai_doan)
                  order by h.deadline_vmp nulls last, h.validation_code), '[]'::jsonb)
    into v_tong, v_dong
    from public.vmp_tl_hang_muc(p_uid) h
   where h.object_code = v_ma;

  -- Phiếu thay đổi cần thẩm định đang gắn với đối tượng này.
  select coalesce(jsonb_agg(c.change_code order by c.change_code), '[]'::jsonb)
    into v_cc
    from public.vmp_change_records c
    join public.vmp_change_objects co on co.change_id = c.id and co.object_code = v_ma
   where c.needs_validation
     and c.removed_from_sheet_at is null
     and c.handling_status in ('cho_xu_ly', 'dang_tham_dinh')
     and public.vmp_change_can_view(p_uid, c.id);

  return jsonb_build_object(
    'ok', true,
    'hieu_la', 'Thiết bị / đối tượng: ' || concat_ws(' · ', v_ma, v_ten),
    'tra_loi', case when v_tong = 0
        then format('%s (%s) không có hạng mục thẩm định nào năm %s.', v_ten, v_ma, extract(year from public.vmp_tl_hom_nay()))
        else format('%s (%s) có %s hạng mục năm %s.', v_ten, v_ma, v_tong, extract(year from public.vmp_tl_hom_nay())) end
      || case when jsonb_array_length(v_cc) > 0
              then ' Phiếu thay đổi cần thẩm định đang mở: ' || (select string_agg(x, ', ') from jsonb_array_elements_text(v_cc) x) || '.'
              else '' end,
    'bang', case when v_tong > 0 then jsonb_build_object('cot', public.vmp_tl_cot_hang_muc(), 'dong', v_dong, 'tong_dong', v_tong) end,
    'goi_y', case when jsonb_array_length(v_cc) > 0
      then jsonb_build_array(public.vmp_tl_goi_y('Xem phiếu thay đổi của ' || v_ma, 'thay_doi', jsonb_build_object('loc', 'tat_ca', 'tu_khoa', v_ma)))
      else '[]'::jsonb end);
end
$function$;

-- Mở rpc_upsert_source_object cho 6 cột mới: phân công (owner/support/work_group)
-- và chấm điểm (complexity/quality_impact/criticality).
-- QA đụng vào bất kỳ cột điểm nào => criticality_source chuyển 'manual',
-- lần chấm tự động sau KHÔNG ghi đè.

CREATE OR REPLACE FUNCTION public.rpc_upsert_source_object(p_object_kind text, p_object_code text, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text; v_id uuid;
  v_code text := nullif(btrim(p_object_code), '');
  v_kind text := nullif(btrim(p_object_kind), '');
  v_allowed constant text[] := array[
    'object_name','department','area_code','line','status','show_flag',
    'validate_flag','validate_reason','frequency_months','report_class',
    'workdays','critical_point','first_month','year_ref','note','is_active',
    -- Cột mới: phân công và chấm điểm trọng yếu
    'owner_name','support_name','work_group',
    'complexity_score','quality_impact_score','criticality_score'
  ];
  v_bad text[];
  v_touch_score boolean;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if v_role not in ('admin','qa_manager') then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được thêm/sửa danh mục nguồn');
  end if;
  if v_code is null or v_kind is null then
    return jsonb_build_object('ok', false, 'error', 'Thiếu mã hoặc loại đối tượng');
  end if;
  if v_kind not in ('Thiết bị','Quy trình','Kho','Hệ thống phụ trợ','Vận chuyển') then
    return jsonb_build_object('ok', false, 'error', 'Loại đối tượng không hợp lệ: ' || v_kind);
  end if;

  select array_agg(k) into v_bad
  from jsonb_object_keys(coalesce(p_patch,'{}'::jsonb)) k where k <> all (v_allowed);
  if v_bad is not null then
    return jsonb_build_object('ok', false, 'error',
      'Trường không được phép sửa: ' || array_to_string(v_bad, ', '));
  end if;

  -- QA đụng vào điểm trọng yếu => chốt tay, lần chấm tự động sau không đè
  v_touch_score := p_patch ?| array['complexity_score','quality_impact_score','criticality_score'];

  insert into public.vmp_source_objects (object_kind, object_code, source_tab, source_row, edited_on_web, updated_by)
  values (v_kind, v_code, 'web', 0, true, auth.uid())
  on conflict (object_kind, object_code) do update
    set edited_on_web = true, updated_by = auth.uid()
  returning id into v_id;

  update public.vmp_source_objects o set
    object_name      = coalesce(p_patch ->> 'object_name',      o.object_name),
    department       = coalesce(p_patch ->> 'department',       o.department),
    area_code        = coalesce(p_patch ->> 'area_code',        o.area_code),
    line             = coalesce(p_patch ->> 'line',             o.line),
    status           = coalesce(p_patch ->> 'status',           o.status),
    show_flag        = coalesce(p_patch ->> 'show_flag',        o.show_flag),
    validate_flag    = coalesce(lower(p_patch ->> 'validate_flag'), o.validate_flag),
    validate_reason  = coalesce(p_patch ->> 'validate_reason',  o.validate_reason),
    report_class     = coalesce(p_patch ->> 'report_class',     o.report_class),
    critical_point   = coalesce(p_patch ->> 'critical_point',   o.critical_point),
    note             = coalesce(p_patch ->> 'note',             o.note),
    owner_name       = coalesce(p_patch ->> 'owner_name',       o.owner_name),
    support_name     = coalesce(p_patch ->> 'support_name',     o.support_name),
    work_group       = coalesce(p_patch ->> 'work_group',       o.work_group),
    frequency_months = coalesce((p_patch ->> 'frequency_months')::integer, o.frequency_months),
    workdays         = coalesce((p_patch ->> 'workdays')::integer,         o.workdays),
    first_month      = coalesce((p_patch ->> 'first_month')::integer,      o.first_month),
    year_ref         = coalesce((p_patch ->> 'year_ref')::integer,         o.year_ref),
    complexity_score     = coalesce((p_patch ->> 'complexity_score')::integer,     o.complexity_score),
    quality_impact_score = coalesce((p_patch ->> 'quality_impact_score')::integer, o.quality_impact_score),
    criticality_score    = coalesce((p_patch ->> 'criticality_score')::integer,    o.criticality_score),
    criticality_source   = case when v_touch_score then 'manual' else o.criticality_source end,
    is_active        = coalesce((p_patch ->> 'is_active')::boolean, o.is_active)
  where o.id = v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'object_code', v_code,
    'msg', case when v_touch_score
                then 'Đã lưu — điểm trọng yếu chuyển sang ĐÃ DUYỆT, không bị chấm lại đè'
                else 'Đã lưu danh mục' end);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$function$

;
revoke execute on function public.rpc_upsert_source_object(text, text, jsonb) from anon, public;
grant execute on function public.rpc_upsert_source_object(text, text, jsonb) to authenticated, service_role;

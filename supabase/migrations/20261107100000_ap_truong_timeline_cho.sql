-- =====================================================================
-- 20261107100000 — Áp dụng thay đổi Danh mục phải ghi các trường timeline đang chờ
-- ---------------------------------------------------------------------
-- Lỗi gốc: từ 20260828150000, rpc_save_catalog_object cất frequency_months,
-- first_month, report_class, workdays, validate_flag, is_active vào
-- vmp_catalog_changes.new_data ("chờ áp") nhưng preview/apply V1+V2 vẫn đọc
-- giá trị CŨ của vmp_source_objects và không bao giờ ghi new_data vào đó.
-- Hệ quả: đổi tần suất không sinh lần mới; đối tượng mới không có hạng mục.
-- Sửa:
--   1. vmp_catalog_change_overlay(): Danh mục + giá trị đang chờ (gộp các lần lưu
--      chưa áp; không gồm is_active — ngừng dùng đối tượng để luồng riêng).
--   2. Preview V1/V2 tính theo overlay.
--   3. Apply V1 ghi overlay vào vmp_source_objects trước khi tạo/sửa hạng mục.
--   3b. Apply V1 ghi MÃ bộ phận vào vmp_objects.department (FK departments).
--   4. Apply V2 kiểm hậu điều kiện theo overlay; sau cùng gán QA Danh mục cho
--      hạng mục mới tạo (vmp_reconcile_source_qa_projection, có audit).
-- Thân hàm lấy NGUYÊN từ production 07/11/2026 (pg_get_functiondef), chỉ chèn
-- các đoạn đánh dấu "07/11/2026". Quyền/owner giữ nguyên (create or replace).
-- Test: tests/sql/catalog-apply-pending-timeline-fields.sql
-- =====================================================================

create or replace function public.vmp_catalog_change_overlay(
  p_source public.vmp_source_objects, p_change public.vmp_catalog_changes
)
returns public.vmp_source_objects
language sql
stable
set search_path = public, pg_temp
as $function$
  -- Danh mục + các trường timeline ĐANG CHỜ. Gộp mọi thay đổi chưa áp của cùng
  -- đối tượng kể từ lần áp gần nhất (lần lưu sau đè lần trước), vì mỗi lần lưu
  -- đánh dấu thay đổi cũ là superseded và new_data chỉ chứa patch của lần đó.
  -- KHÔNG gồm is_active: ngừng dùng đối tượng có trigger guard riêng, chưa
  -- thuộc luồng này (giữ hành vi cũ).
  select case
    when p_change.id is null or p_change.status in ('applied', 'superseded') then p_source
    else jsonb_populate_record(p_source, (
      select coalesce(jsonb_object_agg(kv.key, kv.value order by c.created_at, c.id), '{}'::jsonb)
      from public.vmp_catalog_changes c
      cross join lateral jsonb_each(coalesce(c.new_data, '{}'::jsonb)) kv
      where c.object_kind = p_change.object_kind and c.object_code = p_change.object_code
        and c.status <> 'applied'
        and (c.id = p_change.id or c.created_at <= p_change.created_at)
        and c.created_at > coalesce((
          select max(a.applied_at) from public.vmp_catalog_changes a
          where a.object_kind = p_change.object_kind and a.object_code = p_change.object_code
            and a.status = 'applied'), '-infinity'::timestamptz)
        and kv.key = any(array_remove(public.vmp_catalog_timeline_fields(), 'is_active'))))
  end
$function$;
revoke all on function public.vmp_catalog_change_overlay(public.vmp_source_objects, public.vmp_catalog_changes)
  from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_preview_catalog_change__five_role_impl_20260824(p_change_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role     text := public.vmp_business_role(auth.uid());
  v_ch       public.vmp_catalog_changes%rowtype;
  v_obj      public.vmp_source_objects%rowtype;
  v_year     integer := extract(year from now())::integer;
  v_freq     integer;
  v_times    integer;
  v_types    text[];
  v_type     text;
  v_n        integer;
  v_code     text;
  v_moc      record;
  v_cu       public.vmp_plan_items%rowtype;
  v_tao      jsonb := '[]'::jsonb;
  v_sua      jsonb := '[]'::jsonb;
  v_giu      jsonb := '[]'::jsonb;
  v_dung     jsonb := '[]'::jsonb;
  v_canh     text[] := '{}';
begin
  if coalesce(auth.role(), '') <> 'service_role'
      and v_role is distinct from 'admin' and v_role is distinct from 'qa_manager' then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin và Quản lý QA được xem trước thay đổi timeline');
  end if;

  select * into v_ch from public.vmp_catalog_changes where id = p_change_id;
  if v_ch.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'CHANGE_NOT_FOUND',
      'error', 'Không tìm thấy thay đổi này');
  end if;

  select * into v_obj from public.vmp_source_objects
  where object_kind = v_ch.object_kind and object_code = v_ch.object_code;
  if v_obj.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'OBJECT_NOT_FOUND',
      'error', 'Đối tượng đã bị xoá khỏi danh mục');
  end if;

  -- 07/11/2026: tính theo giá trị ĐANG CHỜ áp (new_data), không theo giá trị cũ.
  v_obj := public.vmp_catalog_change_overlay(v_obj, v_ch);

  -- Đối tượng không thẩm định hoặc đã ngừng dùng: chỉ đề xuất DỪNG các
  -- hạng mục tương lai. Không xoá vật lý — timeline vẫn tham chiếu mã.
  if coalesce(lower(v_obj.validate_flag), 'n') <> 'y' or not coalesce(v_obj.is_active, true) then
    for v_cu in
      select * from public.vmp_plan_items
      where object_code = v_obj.object_code and coalesce(is_active, true)
        and not public.vmp_hang_muc_da_co_tien_do(validation_code)
    loop
      v_dung := v_dung || jsonb_build_object(
        'validation_code', v_cu.validation_code, 'ly_do', 'đối tượng không còn thẩm định');
    end loop;
    for v_cu in
      select * from public.vmp_plan_items
      where object_code = v_obj.object_code and coalesce(is_active, true)
        and public.vmp_hang_muc_da_co_tien_do(validation_code)
    loop
      v_giu := v_giu || jsonb_build_object(
        'validation_code', v_cu.validation_code, 'ly_do', 'đã có tiến độ, không tự động dừng');
    end loop;

    return jsonb_build_object('ok', true, 'change_id', p_change_id,
      'object_code', v_obj.object_code,
      'source_version', v_ch.source_version, 'timeline_revision', v_ch.timeline_revision,
      'tao', '[]'::jsonb, 'sua', '[]'::jsonb, 'dung', v_dung, 'giu_nguyen', v_giu,
      'canh_bao', to_jsonb('{}'::text[]));
  end if;

  v_freq  := coalesce(nullif(v_obj.frequency_months, 0), 12);
  v_times := greatest(1, 12 / v_freq);
  v_types := public.vmp_loai_tham_dinh(v_obj.object_kind, v_obj.object_code, v_obj.year_ref, v_year);

  foreach v_type in array v_types loop
    for v_n in 1 .. v_times loop
      v_code := v_obj.object_code || '/' || v_year::text || '.'
                || lpad(v_n::text, 2, '0') || '-' || v_type;

      select * into v_moc from public.vmp_tinh_moc_thoi_gian(
        v_year, v_obj.first_month, v_freq, v_n,
        v_obj.report_class, v_obj.workdays, v_type);

      if array_length(v_moc.thieu, 1) is not null then
        v_canh := array(select distinct unnest(v_canh || v_moc.thieu));
      end if;

      select * into v_cu from public.vmp_plan_items where validation_code = v_code;

      if v_cu.id is null then
        v_tao := v_tao || jsonb_build_object(
          'validation_code', v_code, 'validation_type', v_type,
          'deadline_vmp', v_moc.deadline_vmp,
          'deadline_validation', v_moc.deadline_validation,
          'thieu', to_jsonb(v_moc.thieu));
      elsif public.vmp_hang_muc_da_co_tien_do(v_code) then
        -- Nguyên tắc 2: đã có tiến độ thì không đụng, chỉ liệt kê.
        v_giu := v_giu || jsonb_build_object(
          'validation_code', v_code,
          'deadline_vmp_hien_tai', v_cu.deadline_vmp,
          'ly_do', 'đã có ngày thực tế hoặc trạng thái khác chưa bắt đầu');
      elsif v_cu.deadline_vmp is distinct from v_moc.deadline_vmp
         or v_cu.deadline_validation is distinct from v_moc.deadline_validation
         or v_cu.deadline_report is distinct from v_moc.deadline_report
         or v_cu.deadline_protocol is distinct from v_moc.deadline_protocol then
        v_sua := v_sua || jsonb_build_object(
          'validation_code', v_code,
          'deadline_vmp_cu', v_cu.deadline_vmp, 'deadline_vmp_moi', v_moc.deadline_vmp,
          'deadline_validation_cu', v_cu.deadline_validation,
          'deadline_validation_moi', v_moc.deadline_validation);
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'ok', true, 'change_id', p_change_id, 'object_code', v_obj.object_code,
    'source_version', v_ch.source_version, 'timeline_revision', v_ch.timeline_revision,
    'tao', v_tao, 'sua', v_sua, 'dung', '[]'::jsonb, 'giu_nguyen', v_giu,
    'canh_bao', to_jsonb(v_canh));
end
$function$;

CREATE OR REPLACE FUNCTION public.vmp_preview_catalog_change_v2_impl(p_change_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_base jsonb;
  v_change public.vmp_catalog_changes%rowtype;
  v_source public.vmp_source_objects%rowtype;
  v_item public.vmp_plan_items%rowtype;
  v_entry jsonb;
  v_candidates jsonb := '[]'::jsonb;
  v_match text[];
  v_occurrence integer;
  v_deadline_protocol date;
  v_deadline_validation date;
  v_deadline_report date;
  v_deadline_vmp date;
  v_missing jsonb;
  v_eligible boolean;
  v_blocker text;
  v_reason text;
begin
  v_base := public.rpc_preview_catalog_change(p_change_id);
  if coalesce((v_base->>'ok')::boolean,false) is not true then return v_base; end if;
  select * into v_change from public.vmp_catalog_changes where id=p_change_id;
  select * into v_source from public.vmp_source_objects
  where object_kind=v_change.object_kind and object_code=v_change.object_code;
  -- 07/11/2026: cùng giá trị đang chờ như preview V1.
  v_source := public.vmp_catalog_change_overlay(v_source, v_change);

  for v_entry in select value from jsonb_array_elements(coalesce(v_base->'giu_nguyen','[]'::jsonb)) loop
    select * into v_item from public.vmp_plan_items
    where validation_code=v_entry->>'validation_code';
    v_match := case when v_item.id is null then null
      else regexp_match(v_item.validation_code,'/([0-9]{4})\.([0-9]+)-(.+)$') end;
    v_occurrence := null;
    if v_match is not null then
      begin v_occurrence:=v_match[2]::integer; exception when others then v_occurrence:=null; end;
    end if;
    v_deadline_protocol:=null; v_deadline_validation:=null;
    v_deadline_report:=null; v_deadline_vmp:=null; v_missing:='[]'::jsonb;
    if v_item.id is not null and v_occurrence is not null then
      select moc.deadline_protocol,moc.deadline_validation,
             moc.deadline_report,moc.deadline_vmp,coalesce(to_jsonb(moc.thieu),'[]'::jsonb)
      into v_deadline_protocol,v_deadline_validation,
           v_deadline_report,v_deadline_vmp,v_missing
      from public.vmp_tinh_moc_thoi_gian(
        v_item.year,v_source.first_month,coalesce(nullif(v_source.frequency_months,0),12),
        v_occurrence,v_source.report_class,v_source.workdays,v_item.validation_type) moc;
    end if;

    v_blocker:=null; v_reason:=null;
    if v_item.id is null then v_blocker:='ITEM_NOT_FOUND'; v_reason:='Hạng mục không còn tồn tại';
    elsif v_item.object_code is distinct from v_source.object_code then v_blocker:='WRONG_MEMBERSHIP'; v_reason:='Hạng mục không còn thuộc đối tượng';
    elsif coalesce(lower(v_source.validate_flag),'n')<>'y' or not coalesce(v_source.is_active,true) then v_blocker:='STOP_FLOW'; v_reason:='Đối tượng đang thuộc luồng Dừng';
    elsif not coalesce(v_item.is_active,true) then v_blocker:='ITEM_INACTIVE'; v_reason:='Hạng mục không còn hiệu lực';
    elsif v_item.item_state is distinct from 'active' then v_blocker:='ITEM_STATE_INACTIVE'; v_reason:='Hạng mục đã hủy hoặc không áp dụng';
    elsif v_match is null or v_occurrence is null or v_match[1]::integer<>v_item.year
       or v_match[1]::integer<>extract(year from now())::integer
       or v_match[3] is distinct from v_item.validation_type
       or v_item.validation_code is distinct from
          (v_item.object_code||'/'||v_match[1]||'.'||v_match[2]||'-'||v_match[3])
      then v_blocker:='INVALID_ITEM_IDENTITY'; v_reason:='Mã hạng mục không khớp định danh năm/lần/loại';
    elsif jsonb_array_length(v_missing)>0
       or v_deadline_protocol is null or v_deadline_validation is null
       or v_deadline_report is null or v_deadline_vmp is null
      then v_blocker:='MISSING_SOURCE_DATA'; v_reason:='Không tính đủ bốn deadline';
    elsif not (v_item.deadline_protocol is distinct from v_deadline_protocol
       or v_item.deadline_validation is distinct from v_deadline_validation
       or v_item.deadline_report is distinct from v_deadline_report
       or v_item.deadline_vmp is distinct from v_deadline_vmp)
      then v_blocker:='NO_ACTIONABLE_CHANGE'; v_reason:='Deadline hiện tại đã khớp nguồn';
    end if;
    v_eligible:=v_blocker is null;
    v_candidates:=v_candidates||jsonb_build_object(
      'validation_code',v_entry->>'validation_code','item_version',v_item.version,
      'eligible',v_eligible,'blocker_code',v_blocker,'blocker_reason',v_reason,
      'missing',v_missing,
      'progress',jsonb_build_object(
        'actual_protocol_date',v_item.actual_protocol_date,
        'actual_validation_date',v_item.actual_validation_date,
        'actual_report_date',v_item.actual_report_date,
        'actual_vmp_date',v_item.actual_vmp_date,
        'status_protocol',v_item.status_protocol,
        'status_validation',v_item.status_validation,
        'status_report',v_item.status_report,
        'status_vmp',v_item.status_vmp),
      'deadline_protocol_cu',v_item.deadline_protocol,'deadline_protocol_moi',v_deadline_protocol,
      'deadline_validation_cu',v_item.deadline_validation,'deadline_validation_moi',v_deadline_validation,
      'deadline_report_cu',v_item.deadline_report,'deadline_report_moi',v_deadline_report,
      'deadline_vmp_cu',v_item.deadline_vmp,'deadline_vmp_moi',v_deadline_vmp);
  end loop;
  return v_base||jsonb_build_object('deadline_overrides',v_candidates);
end
$function$;

CREATE OR REPLACE FUNCTION public.rpc_apply_catalog_change__five_role_impl_20260824(p_change_id uuid, p_reason text, p_expected_timeline_revision integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role  text := public.vmp_business_role(auth.uid());
  v_ch    public.vmp_catalog_changes%rowtype;
  v_obj   public.vmp_source_objects%rowtype;
  v_imp   jsonb;
  v_item  jsonb;
  v_year  integer := extract(year from now())::integer;
  v_freq  integer;
  v_moc   record;
  v_type  text;
  v_n     integer;
  v_tao   integer := 0;
  v_sua   integer := 0;
  v_dung  integer := 0;
  v_kq    jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
      and v_role is distinct from 'admin' and v_role is distinct from 'qa_manager' then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin và Quản lý QA được áp thay đổi vào timeline');
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED',
      'error', 'Phải nhập lý do trước khi áp vào timeline');
  end if;

  -- Khoá dòng thay đổi: hai người bấm Áp cùng lúc thì người sau phải đợi,
  -- rồi thấy trạng thái 'applied' và nhận lại kết quả cũ.
  select * into v_ch from public.vmp_catalog_changes where id = p_change_id for update;
  if v_ch.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'CHANGE_NOT_FOUND',
      'error', 'Không tìm thấy thay đổi này');
  end if;

  -- Nguyên tắc 3: áp lần hai trả lại kết quả lần đầu, KHÔNG chạy lại.
  if v_ch.status = 'applied' then
    return coalesce(v_ch.apply_result, jsonb_build_object('ok', true, 'da_ap_truoc_do', true));
  end if;
  if v_ch.status = 'superseded' then
    return jsonb_build_object('ok', false, 'error_code', 'SUPERSEDED',
      'error', 'Thay đổi này đã bị một thay đổi mới hơn thay thế');
  end if;

  select * into v_obj from public.vmp_source_objects
  where object_kind = v_ch.object_kind and object_code = v_ch.object_code for update;
  if v_obj.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'OBJECT_NOT_FOUND',
      'error', 'Đối tượng đã bị xoá khỏi danh mục');
  end if;

  if p_expected_timeline_revision is not null
      and v_obj.timeline_revision is distinct from p_expected_timeline_revision then
    return jsonb_build_object('ok', false, 'error_code', 'VERSION_CONFLICT',
      'error', 'Danh mục đã đổi tiếp sau khi bạn xem trước. Xem lại rồi áp.',
      'timeline_revision_hien_tai', v_obj.timeline_revision);
  end if;

  -- 07/11/2026: ghi các trường timeline đang chờ vào Danh mục TRƯỚC khi tính.
  -- Từ 20260828150000 hàm lưu chỉ cất chúng vào new_data; thiếu bước này thì
  -- đổi tần suất/thêm đối tượng mới không bao giờ có hiệu lực.
  if v_ch.status not in ('applied', 'superseded') then
    v_obj := public.vmp_catalog_change_overlay(v_obj, v_ch);
    update public.vmp_source_objects
    set frequency_months = v_obj.frequency_months, first_month = v_obj.first_month,
        report_class = v_obj.report_class, workdays = v_obj.workdays,
        validate_flag = v_obj.validate_flag
    where id = v_obj.id;
  end if;

  -- Tính lại ngay lúc áp thay vì tin bản preview đã lưu: giữa hai lần bấm
  -- có thể có người sửa tiếp, và áp theo số liệu cũ là áp sai.
  v_imp := public.rpc_preview_catalog_change(p_change_id);
  if coalesce((v_imp ->> 'ok')::boolean, false) is not true then
    return v_imp;
  end if;

  v_freq := coalesce(nullif(v_obj.frequency_months, 0), 12);

  -- ---- TẠO hạng mục còn thiếu ----
  /* Read model trước đã: vmp_plan_items.object_code có khoá ngoại tới
     vmp_objects.code, nên thiếu bước này thì insert hạng mục sẽ vỡ. Luật
     gốc trong rpc_generate_timeline cũng làm đúng thứ tự đó. */
  if jsonb_array_length(v_imp -> 'tao') > 0 then
    insert into public.vmp_objects (
      code, name, classification, department, area, line,
      criticality, frequency_months, is_active, created_by, updated_by)
    values (
      v_obj.object_code,
      coalesce(v_obj.object_name, v_obj.object_code),
      coalesce('{"Thiết bị":"tb","Quy trình":"qt","Kho":"kho",
                 "Hệ thống phụ trợ":"ht","Vận chuyển":"vc"}'::jsonb ->> v_obj.object_kind, 'tb'),
      -- 07/11/2026: cột này là MÃ bộ phận (FK departments), không phải tên.
      (public.vmp_parse_depts(coalesce(v_obj.department, '')))[1],
      coalesce(v_obj.area_code, '—'),
      coalesce(v_obj.line, '—'),
      'medium', v_freq, true, auth.uid(), auth.uid())
    on conflict (code) do nothing;
  end if;

  for v_item in select * from jsonb_array_elements(v_imp -> 'tao') loop
    v_type := v_item ->> 'validation_type';
    v_n := (regexp_match(v_item ->> 'validation_code', '\.(\d+)-'))[1]::integer;
    select * into v_moc from public.vmp_tinh_moc_thoi_gian(
      v_year, v_obj.first_month, v_freq, v_n, v_obj.report_class, v_obj.workdays, v_type);

    insert into public.vmp_plan_items (
      id, validation_code, object_code, validation_type, year,
      report_class, effort_days,
      deadline_protocol, deadline_validation, deadline_report, deadline_vmp,
      departments, created_by, updated_by)
    values (
      v_item ->> 'validation_code', v_item ->> 'validation_code', v_obj.object_code,
      v_type, v_year, coalesce(v_obj.report_class, 'Không phụ thuộc'), v_obj.workdays,
      v_moc.deadline_protocol, v_moc.deadline_validation, v_moc.deadline_report, v_moc.deadline_vmp,
      public.vmp_parse_depts(coalesce(v_obj.department, '')), auth.uid(), auth.uid())
    on conflict (id) do nothing;   -- áp lại không nhân đôi
    v_tao := v_tao + 1;
  end loop;

  -- ---- SỬA deadline của hạng mục CHƯA ai đụng ----
  for v_item in select * from jsonb_array_elements(v_imp -> 'sua') loop
    v_type := split_part(v_item ->> 'validation_code', '-', 2);
    v_n := (regexp_match(v_item ->> 'validation_code', '\.(\d+)-'))[1]::integer;
    select * into v_moc from public.vmp_tinh_moc_thoi_gian(
      v_year, v_obj.first_month, v_freq, v_n, v_obj.report_class, v_obj.workdays, v_type);

    -- Điều kiện lặp lại ở đây KHÔNG thừa: giữa preview và update có thể có
    -- người vừa nhập ngày thực tế. Nguyên tắc 2 phải đúng tại thời điểm ghi.
    update public.vmp_plan_items
    set deadline_protocol   = v_moc.deadline_protocol,
        deadline_validation = v_moc.deadline_validation,
        deadline_report     = v_moc.deadline_report,
        deadline_vmp        = v_moc.deadline_vmp,
        report_class        = coalesce(v_obj.report_class, report_class),
        effort_days         = coalesce(v_obj.workdays, effort_days),
        updated_by = auth.uid(), updated_at = now()
    where validation_code = v_item ->> 'validation_code'
      and not public.vmp_hang_muc_da_co_tien_do(validation_code);
    if found then v_sua := v_sua + 1; end if;
  end loop;

  -- ---- DỪNG hạng mục tương lai khi đối tượng thôi thẩm định ----
  for v_item in select * from jsonb_array_elements(v_imp -> 'dung') loop
    update public.vmp_plan_items
    /* `not_applicable`, không phải `cancelled`: đối tượng thôi thuộc diện
       thẩm định là "không còn áp dụng", khác với một hạng mục bị huỷ vì lý
       do nghiệp vụ. Hai trạng thái đọc ra hai câu chuyện khác nhau khi tra
       ngược. Giá trị hợp lệ do chk_item_state quy định. */
    set is_active = false, item_state = 'not_applicable',
        updated_by = auth.uid(), updated_at = now()
    where validation_code = v_item ->> 'validation_code'
      and not public.vmp_hang_muc_da_co_tien_do(validation_code);
    if found then v_dung := v_dung + 1; end if;
  end loop;

  v_kq := jsonb_build_object(
    'ok', true, 'change_id', p_change_id, 'object_code', v_obj.object_code,
    'so_tao', v_tao, 'so_sua', v_sua, 'so_dung', v_dung,
    'so_giu_nguyen', jsonb_array_length(v_imp -> 'giu_nguyen'),
    'timeline_revision', v_obj.timeline_revision);

  update public.vmp_catalog_changes
  set status = 'applied', impact = v_imp, apply_result = v_kq,
      applied_by = auth.uid(), applied_at = now(), apply_reason = btrim(p_reason)
  where id = p_change_id;

  -- Đánh dấu đã đồng bộ. Từ đây banner "chờ áp" tắt.
  update public.vmp_source_objects
  set timeline_applied_revision = timeline_revision, updated_at = now()
  where id = v_obj.id;

  return v_kq;
end
$function$;

CREATE OR REPLACE FUNCTION public.vmp_apply_catalog_change_v2_impl(p_change_id uuid, p_reason text, p_expected_timeline_revision integer, p_deadline_overrides jsonb, p_override_confirmed boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_change public.vmp_catalog_changes%rowtype;
  v_source public.vmp_source_objects%rowtype;
  v_item public.vmp_plan_items%rowtype;
  v_selection jsonb;
  v_candidate jsonb;
  v_preview jsonb;
  v_entry jsonb;
  v_moc record;
  v_match text[];
  v_codes text[];
  v_selected_codes text[];
  v_locked_codes text[];
  v_inventory_before text[];
  v_inventory_after text[];
  v_expected_inventory text[];
  v_year integer:=extract(year from now())::integer;
  v_expected integer;
  v_index integer:=0;
  v_count integer;
  v_v1 jsonb;
  v_snapshots jsonb:='{}'::jsonb;
  v_locked_snapshots jsonb:='{}'::jsonb;
  v_snapshot jsonb;
  v_source_snapshot jsonb;
  v_current jsonb;
  v_deadline_results jsonb:='[]'::jsonb;
  v_result jsonb;
  v_effective_role text;
begin
  select * into v_change from public.vmp_catalog_changes where id=p_change_id;
  if v_change.id is null then
    return jsonb_build_object('ok',false,'error_code','CHANGE_NOT_FOUND','error','Không tìm thấy thay đổi này');
  end if;
  perform public.vmp_lock_catalog_object_v2(v_change.object_kind,v_change.object_code);
  select * into v_change from public.vmp_catalog_changes where id=p_change_id for update;
  if v_change.id is null then
    return jsonb_build_object('ok',false,'error_code','CHANGE_NOT_FOUND','error','Không tìm thấy thay đổi này');
  end if;
  if v_change.status='applied' then
    return coalesce(v_change.apply_result,jsonb_build_object('ok',true))
      ||jsonb_build_object('ok',true,'da_ap_truoc_do',true);
  end if;
  if v_change.status='superseded' then
    return jsonb_build_object('ok',false,'error_code','SUPERSEDED','error','Thay đổi này đã bị một thay đổi mới hơn thay thế');
  end if;
  if p_expected_timeline_revision is null then
    return jsonb_build_object('ok',false,'error_code','EXPECTED_REVISION_REQUIRED','error','Thiếu phiên bản timeline đã xem trước');
  end if;
  if p_deadline_overrides is null or jsonb_typeof(p_deadline_overrides)<>'array' then
    return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_PAYLOAD',
      'error','Danh sách ghi đè deadline không hợp lệ',
      'details',jsonb_build_array(jsonb_build_object('index',null,'reason','TOP_LEVEL_MUST_BE_ARRAY')));
  end if;
  for v_selection in select value from jsonb_array_elements(p_deadline_overrides) loop
    if jsonb_typeof(v_selection)<>'object' then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_PAYLOAD','error','Danh sách ghi đè deadline không hợp lệ',
        'details',jsonb_build_array(jsonb_build_object('index',v_index,'reason','ITEM_MUST_BE_OBJECT')));
    end if;
    if not (v_selection?'validation_code' and v_selection?'expected_item_version')
       or (select count(*) from jsonb_object_keys(v_selection))<>2 then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_PAYLOAD','error','Danh sách ghi đè deadline không hợp lệ',
        'details',jsonb_build_array(jsonb_build_object('index',v_index,'reason','EXACT_KEYS_REQUIRED')));
    end if;
    if jsonb_typeof(v_selection->'validation_code')<>'string'
       or nullif(btrim(v_selection->>'validation_code'),'') is null then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_PAYLOAD','error','Danh sách ghi đè deadline không hợp lệ',
        'details',jsonb_build_array(jsonb_build_object('index',v_index,'reason','VALIDATION_CODE_REQUIRED')));
    end if;
    if jsonb_typeof(v_selection->'expected_item_version')<>'number'
       or (v_selection->>'expected_item_version')!~'^-?[0-9]+$' then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_PAYLOAD','error','Danh sách ghi đè deadline không hợp lệ',
        'details',jsonb_build_array(jsonb_build_object('index',v_index,'reason','INTEGER_VERSION_REQUIRED')));
    end if;
    begin v_expected:=(v_selection->>'expected_item_version')::integer;
    exception when numeric_value_out_of_range then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_PAYLOAD','error','Danh sách ghi đè deadline không hợp lệ',
        'details',jsonb_build_array(jsonb_build_object('index',v_index,'reason','INTEGER_VERSION_REQUIRED')));
    end;
    v_index:=v_index+1;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_deadline_overrides) e
      group by e->>'validation_code' having count(*)>1) then
    return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_PAYLOAD','error','Danh sách ghi đè deadline không hợp lệ',
      'details',jsonb_build_array(jsonb_build_object('index',null,'reason','DUPLICATE_VALIDATION_CODE')));
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    return jsonb_build_object('ok',false,'error_code','REASON_REQUIRED','error','Phải nhập lý do trước khi áp vào timeline');
  end if;
  if jsonb_array_length(p_deadline_overrides)>0 and p_override_confirmed is not true then
    return jsonb_build_object('ok',false,'error_code','OVERRIDE_NOT_CONFIRMED',
      'error','Cần xác nhận đặc biệt để áp deadline đã có tiến độ');
  end if;

  select * into v_source from public.vmp_source_objects
  where object_kind=v_change.object_kind and object_code=v_change.object_code for update;
  if v_source.id is null then
    return jsonb_build_object('ok',false,'error_code','OBJECT_NOT_FOUND','error','Đối tượng đã bị xoá khỏi danh mục');
  end if;
  if v_source.timeline_revision is distinct from p_expected_timeline_revision then
    return jsonb_build_object('ok',false,'error_code','VERSION_CONFLICT',
      'error','Timeline đã đổi — xem trước lại',
      'expected_timeline_revision',p_expected_timeline_revision,
      'current_timeline_revision',v_source.timeline_revision);
  end if;

  select coalesce(array_agg(value->>'validation_code' order by value->>'validation_code'),'{}'::text[])
  into v_selected_codes from jsonb_array_elements(p_deadline_overrides);

  -- Lock a deterministic stable superset before the authoritative preview:
  -- every row currently owned by the source object, every current-year row
  -- whose terminal identity names it, and every explicitly selected code.
  -- A later preview row outside this locked set is rejected before mutation.
  perform 1 from public.vmp_plan_items pi
  where pi.object_code=v_source.object_code
     or (pi.year=v_year and left(pi.validation_code,length(v_source.object_code)+1)=v_source.object_code||'/')
     or pi.validation_code=any(v_selected_codes)
  order by pi.validation_code for update;

  select coalesce(array_agg(pi.validation_code order by pi.validation_code),'{}'::text[]),
         coalesce(jsonb_object_agg(pi.validation_code,to_jsonb(pi) order by pi.validation_code),'{}'::jsonb)
  into v_locked_codes,v_locked_snapshots
  from public.vmp_plan_items pi
  where pi.object_code=v_source.object_code
     or (pi.year=v_year and left(pi.validation_code,length(v_source.object_code)+1)=v_source.object_code||'/')
     or pi.validation_code=any(v_selected_codes);

  select coalesce(array_agg(pi.validation_code order by pi.validation_code),'{}'::text[])
  into v_inventory_before
  from public.vmp_plan_items pi
  where pi.object_code=v_source.object_code
     or (pi.year=v_year and left(pi.validation_code,length(v_source.object_code)+1)=v_source.object_code||'/');
  -- 07/11/2026: V1 sẽ ghi các trường đang chờ vào Danh mục; mọi phép kiểm
  -- hậu điều kiện bên dưới phải so với giá trị MỚI đó.
  v_source:=public.vmp_catalog_change_overlay(v_source,v_change);
  v_source_snapshot:=to_jsonb(v_source);

  v_preview:=public.rpc_preview_catalog_change_v2(p_change_id);
  if coalesce((v_preview->>'ok')::boolean,false) is not true then return v_preview; end if;
  select coalesce(array_agg(distinct code order by code),'{}'::text[]) into v_codes from (
    select value->>'validation_code' code from jsonb_array_elements(coalesce(v_preview->'tao','[]'))
    union all select value->>'validation_code' from jsonb_array_elements(coalesce(v_preview->'sua','[]'))
    union all select value->>'validation_code' from jsonb_array_elements(coalesce(v_preview->'dung','[]'))
    union all select value->>'validation_code' from jsonb_array_elements(coalesce(v_preview->'giu_nguyen','[]'))
  ) impact where code is not null;
  if exists (
    select 1 from unnest(v_codes) impact(code)
    join public.vmp_plan_items pi on pi.validation_code=impact.code
    where not (impact.code=any(v_locked_codes))
  ) then
    return jsonb_build_object('ok',false,'error_code','WRITE_MISMATCH',
      'error','Không thể ghi nguyên tử; toàn bộ thay đổi đã được hoàn tác');
  end if;

  for v_selection in select value from jsonb_array_elements(p_deadline_overrides) loop
    select * into v_item from public.vmp_plan_items where validation_code=v_selection->>'validation_code';
    if v_item.id is null then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_ITEM',
        'error','Mã ghi đè không hợp lệ: '||(v_selection->>'validation_code'),
        'details',jsonb_build_array(v_selection->>'validation_code'));
    end if;
    v_expected:=(v_selection->>'expected_item_version')::integer;
    if v_item.version is distinct from v_expected then
      return jsonb_build_object('ok',false,'error_code','ITEM_STATE_CHANGED',
        'error','Hạng mục '||(v_selection->>'validation_code')||' đã đổi sau khi xem trước; hãy xem trước lại',
        'validation_code',v_selection->>'validation_code','expected_item_version',v_expected,
        'current_item_version',v_item.version,'requires_fresh_preview',true);
    end if;
  end loop;

  for v_selection in select value from jsonb_array_elements(p_deadline_overrides) loop
    select value into v_candidate from jsonb_array_elements(coalesce(v_preview->'deadline_overrides','[]'))
    where value->>'validation_code'=v_selection->>'validation_code';
    if v_candidate is null then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_ITEM',
        'error','Mã ghi đè không hợp lệ: '||(v_selection->>'validation_code'),
        'details',jsonb_build_array(v_selection->>'validation_code'));
    end if;
    if v_candidate->>'blocker_code'='MISSING_SOURCE_DATA' then
      return jsonb_build_object('ok',false,'error_code','MISSING_SOURCE_DATA',
        'error','Không tính đủ deadline cho '||(v_selection->>'validation_code'),
        'missing',jsonb_build_array(jsonb_build_object('validation_code',v_selection->>'validation_code','fields',v_candidate->'missing')));
    end if;
    if v_candidate->>'blocker_code'='NO_ACTIONABLE_CHANGE' then
      return jsonb_build_object('ok',false,'error_code','NO_ACTIONABLE_CHANGE','error','Không có thay đổi để áp');
    end if;
    if coalesce((v_candidate->>'eligible')::boolean,false) is not true then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_ITEM',
        'error','Mã ghi đè không hợp lệ: '||(v_selection->>'validation_code'),
        'details',jsonb_build_array(jsonb_build_object('validation_code',v_selection->>'validation_code',
          'reason',v_candidate->>'blocker_reason','blocker_code',v_candidate->>'blocker_code')));
    end if;
    select * into v_item from public.vmp_plan_items where validation_code=v_selection->>'validation_code';
    v_snapshots:=v_snapshots||jsonb_build_object(v_item.validation_code,to_jsonb(v_item));
  end loop;

  if jsonb_array_length(coalesce(v_preview->'tao','[]'))=0
     and jsonb_array_length(coalesce(v_preview->'sua','[]'))=0
     and jsonb_array_length(coalesce(v_preview->'dung','[]'))=0
     and jsonb_array_length(p_deadline_overrides)=0 then
    return jsonb_build_object('ok',false,'error_code','NO_ACTIONABLE_CHANGE','error','Không có thay đổi để áp');
  end if;

  begin
    perform set_config('app.audit_source','catalog_progressed_deadline_override',true);
    perform set_config('app.audit_reason',btrim(p_reason),true);
    v_v1:=public.rpc_apply_catalog_change(p_change_id,p_reason,p_expected_timeline_revision);
    if coalesce((v_v1->>'ok')::boolean,false) is not true then
      raise exception using errcode='P2001',message='V1_REJECTED';
    end if;

    for v_entry in select value from jsonb_array_elements(coalesce(v_preview->'tao','[]')) loop
      select * into v_item from public.vmp_plan_items where validation_code=v_entry->>'validation_code';
      if not found then raise exception using errcode='P2001',message='CREATE_ROW_MISSING'; end if;
      v_match:=regexp_match(v_item.validation_code,'/([0-9]{4})\.([0-9]+)-(.+)$');
      if v_match is null then raise exception using errcode='P2001',message='CREATE_IDENTITY'; end if;
      select * into v_moc from public.vmp_tinh_moc_thoi_gian(v_item.year,v_source.first_month,
        coalesce(nullif(v_source.frequency_months,0),12),v_match[2]::integer,
        v_source.report_class,v_source.workdays,v_item.validation_type);
      if v_item.id is distinct from v_entry->>'validation_code'
         or v_item.validation_code is distinct from v_entry->>'validation_code'
         or v_item.object_code is distinct from v_source.object_code
         or v_item.validation_type is distinct from v_entry->>'validation_type'
         or v_item.year is distinct from v_year
         or v_item.report_class is distinct from coalesce(v_source.report_class,'Không phụ thuộc')
         or v_item.effort_days is distinct from v_source.workdays::numeric
         or v_item.deadline_protocol is distinct from v_moc.deadline_protocol
         or v_item.deadline_validation is distinct from v_moc.deadline_validation
         or v_item.deadline_report is distinct from v_moc.deadline_report
         or v_item.deadline_vmp is distinct from v_moc.deadline_vmp
         or v_item.departments is distinct from public.vmp_parse_depts(coalesce(v_source.department,''))
         or v_item.created_by is distinct from auth.uid()
         or v_item.updated_by is distinct from auth.uid()
         or v_item.owner_id is not null or v_item.owner_name is not null
         or v_item.secondary_owner is not null
         or v_item.actual_protocol_date is not null or v_item.actual_validation_date is not null
         or v_item.actual_report_date is not null or v_item.actual_vmp_date is not null
         or v_item.status_protocol is distinct from 'not_started'
         or v_item.status_validation is distinct from 'not_started'
         or v_item.status_report is distinct from 'not_started'
         or v_item.status_vmp is distinct from 'not_started'
         or v_item.is_active is distinct from true
         or v_item.item_state is distinct from 'active'
         or v_item.version<>0
         or (to_jsonb(v_item)-array[
               'id','validation_code','object_code','validation_type','report_class','effort_days','year',
               'deadline_protocol','deadline_validation','deadline_report','deadline_vmp',
               'departments','created_by','updated_by','created_at','updated_at',
               'computed_status','is_doc_complete','has_mismatch',
               'status_protocol_text','status_validation_text','status_report_text','status_vmp_text'])
            is distinct from '{
              "owner_id":null,"owner_name":null,"secondary_owner":null,
              "criticality_score":null,"criticality":"medium",
              "actual_protocol_date":null,"actual_validation_date":null,
              "actual_report_date":null,"actual_vmp_date":null,"scheduled_date":null,
              "status_protocol":"not_started","status_validation":"not_started",
              "status_report":"not_started","status_vmp":"not_started",
              "is_active":true,"requires_qa_approval":false,
              "qa_approved_by":null,"qa_approved_at":null,
              "sheet_row_id":null,"last_synced":null,"deleted_from_sheet":false,
              "deleted_at":null,"delete_reason":null,"missing_from_sheet":false,
              "missing_since":null,"item_state":"active","version":0,
              "source_sync_run_id":null,"source_sheet_row":null,"source_sheet_data":{},
              "execution_departments":null,"department_text":null,"work_group":null,
              "scheduled_at":null,"owner_person_id":null,"support_person_id":null
            }'::jsonb then
        raise exception using errcode='P2001',message='CREATE_POSTSTATE';
      end if;
    end loop;
    for v_entry in select value from jsonb_array_elements(coalesce(v_preview->'sua','[]')) loop
      select * into v_item from public.vmp_plan_items where validation_code=v_entry->>'validation_code';
      if not found then raise exception using errcode='P2001',message='UPDATE_ROW_MISSING'; end if;
      v_match:=regexp_match(v_item.validation_code,'/([0-9]{4})\.([0-9]+)-(.+)$');
      if v_match is null then raise exception using errcode='P2001',message='UPDATE_IDENTITY'; end if;
      select * into v_moc from public.vmp_tinh_moc_thoi_gian(v_item.year,v_source.first_month,
        coalesce(nullif(v_source.frequency_months,0),12),v_match[2]::integer,
        v_source.report_class,v_source.workdays,v_item.validation_type);
      v_snapshot:=v_locked_snapshots->(v_entry->>'validation_code');
      if v_snapshot is null
         or v_item.object_code is distinct from v_source.object_code
         or (v_source.report_class is not null and v_item.report_class is distinct from v_source.report_class)
         or (v_source.workdays is not null and v_item.effort_days is distinct from v_source.workdays::numeric)
         or v_item.deadline_protocol is distinct from v_moc.deadline_protocol
         or v_item.deadline_validation is distinct from v_moc.deadline_validation
         or v_item.deadline_report is distinct from v_moc.deadline_report
         or v_item.deadline_vmp is distinct from v_moc.deadline_vmp
         or v_item.version is distinct from (v_snapshot->>'version')::integer+1
         or v_item.updated_by is distinct from auth.uid()
         or (to_jsonb(v_item)-array['deadline_protocol','deadline_validation','deadline_report','deadline_vmp',
               'report_class','effort_days','computed_status','is_doc_complete','has_mismatch',
               'status_protocol_text','status_validation_text','status_report_text','status_vmp_text',
               'version','updated_at','updated_by'])
            is distinct from
            (v_snapshot-array['deadline_protocol','deadline_validation','deadline_report','deadline_vmp',
               'report_class','effort_days','computed_status','is_doc_complete','has_mismatch',
               'status_protocol_text','status_validation_text','status_report_text','status_vmp_text',
               'version','updated_at','updated_by']) then
        raise exception using errcode='P2001',message='UPDATE_POSTSTATE';
      end if;
    end loop;
    for v_entry in select value from jsonb_array_elements(coalesce(v_preview->'dung','[]')) loop
      select * into v_item from public.vmp_plan_items where validation_code=v_entry->>'validation_code';
      v_snapshot:=v_locked_snapshots->(v_entry->>'validation_code');
      if not found or v_snapshot is null
         or v_item.object_code is distinct from v_source.object_code
         or coalesce(v_item.is_active,true) or v_item.item_state is distinct from 'not_applicable'
         or v_item.version is distinct from (v_snapshot->>'version')::integer+1
         or v_item.updated_by is distinct from auth.uid()
         or (to_jsonb(v_item)-array['is_active','item_state','computed_status','is_doc_complete','has_mismatch',
               'status_protocol_text','status_validation_text','status_report_text','status_vmp_text',
               'version','updated_at','updated_by'])
            is distinct from
            (v_snapshot-array['is_active','item_state','computed_status','is_doc_complete','has_mismatch',
               'status_protocol_text','status_validation_text','status_report_text','status_vmp_text',
               'version','updated_at','updated_by']) then
        raise exception using errcode='P2001',message='STOP_POSTSTATE';
      end if;
    end loop;

    -- Inventory is exact: V1 may add only the authoritative `tao` codes and
    -- may neither delete nor create any other source row.
    select coalesce(array_agg(distinct code order by code),'{}'::text[])
    into v_expected_inventory from (
      select unnest(v_inventory_before) code
      union all
      select value->>'validation_code' from jsonb_array_elements(coalesce(v_preview->'tao','[]'))
    ) expected where code is not null;
    select coalesce(array_agg(pi.validation_code order by pi.validation_code),'{}'::text[])
    into v_inventory_after from public.vmp_plan_items pi
    where pi.object_code=v_source.object_code
       or (pi.year=v_year and left(pi.validation_code,length(v_source.object_code)+1)=v_source.object_code||'/');
    if v_inventory_after is distinct from v_expected_inventory then
      raise exception using errcode='P2001',message='ITEM_INVENTORY_POSTSTATE';
    end if;

    -- Every pre-existing row outside normal update/stop is byte-for-byte
    -- unchanged by V1. This includes progressed overrides and superset-only
    -- rows that the preview did not advertise.
    for v_entry in select to_jsonb(code) value from unnest(v_locked_codes) code loop
      if not exists (select 1 from jsonb_array_elements(coalesce(v_preview->'sua','[]')) e
                     where e->>'validation_code'=v_entry#>>'{}')
         and not exists (select 1 from jsonb_array_elements(coalesce(v_preview->'dung','[]')) e
                         where e->>'validation_code'=v_entry#>>'{}') then
        select to_jsonb(pi) into v_current from public.vmp_plan_items pi
        where pi.validation_code=v_entry#>>'{}';
        if v_current is distinct from v_locked_snapshots->(v_entry#>>'{}') then
          raise exception using errcode='P2001',message='UNCHANGED_ITEM_POSTSTATE';
        end if;
      end if;
    end loop;

    select to_jsonb(so) into v_current from public.vmp_source_objects so where so.id=v_source.id;
    if v_current is null
       or (v_current-array['timeline_applied_revision','updated_at'])
          is distinct from (v_source_snapshot-array['timeline_applied_revision','updated_at'])
       or (v_current->>'timeline_applied_revision')::integer is distinct from v_source.timeline_revision then
      raise exception using errcode='P2001',message='SOURCE_POSTSTATE';
    end if;

    for v_selection in select value from jsonb_array_elements(p_deadline_overrides) loop
      select value into v_candidate from jsonb_array_elements(v_preview->'deadline_overrides')
      where value->>'validation_code'=v_selection->>'validation_code';
      v_snapshot:=v_snapshots->(v_selection->>'validation_code');
      update public.vmp_plan_items set
        deadline_protocol=(v_candidate->>'deadline_protocol_moi')::date,
        deadline_validation=(v_candidate->>'deadline_validation_moi')::date,
        deadline_report=(v_candidate->>'deadline_report_moi')::date,
        deadline_vmp=(v_candidate->>'deadline_vmp_moi')::date,
        updated_by=auth.uid(),updated_at=now()
      where validation_code=v_selection->>'validation_code'
        and version=(v_selection->>'expected_item_version')::integer;
      get diagnostics v_count=row_count;
      if v_count<>1 then raise exception using errcode='P2001',message='OVERRIDE_ROWCOUNT'; end if;
      select * into v_item from public.vmp_plan_items where validation_code=v_selection->>'validation_code';
      if v_item.deadline_protocol is distinct from (v_candidate->>'deadline_protocol_moi')::date
         or v_item.deadline_validation is distinct from (v_candidate->>'deadline_validation_moi')::date
         or v_item.deadline_report is distinct from (v_candidate->>'deadline_report_moi')::date
         or v_item.deadline_vmp is distinct from (v_candidate->>'deadline_vmp_moi')::date
         or v_item.version<>(v_selection->>'expected_item_version')::integer+1
         or (to_jsonb(v_item)-array['deadline_protocol','deadline_validation','deadline_report','deadline_vmp','computed_status','version','updated_at','updated_by'])
            is distinct from
            (v_snapshot-array['deadline_protocol','deadline_validation','deadline_report','deadline_vmp','computed_status','version','updated_at','updated_by']) then
        raise exception using errcode='P2001',message='OVERRIDE_POSTSTATE';
      end if;
      v_deadline_results:=v_deadline_results||jsonb_build_object(
        'validation_code',v_item.validation_code,
        'item_version_cu',(v_selection->>'expected_item_version')::integer,'item_version_moi',v_item.version,
        'deadline_protocol_cu',v_candidate->'deadline_protocol_cu','deadline_protocol_moi',v_candidate->'deadline_protocol_moi',
        'deadline_validation_cu',v_candidate->'deadline_validation_cu','deadline_validation_moi',v_candidate->'deadline_validation_moi',
        'deadline_report_cu',v_candidate->'deadline_report_cu','deadline_report_moi',v_candidate->'deadline_report_moi',
        'deadline_vmp_cu',v_candidate->'deadline_vmp_cu','deadline_vmp_moi',v_candidate->'deadline_vmp_moi',
        'actual_dates_unchanged',true,'statuses_unchanged',true);
    end loop;

    v_effective_role:=case when coalesce(auth.role(),'')='service_role' then 'service_role'
      else public.vmp_business_role(auth.uid()) end;
    v_result:=jsonb_build_object(
      'ok',true,'change_id',p_change_id,'object_code',v_source.object_code,
      'so_tao',jsonb_array_length(coalesce(v_preview->'tao','[]')),
      'so_sua',jsonb_array_length(coalesce(v_preview->'sua','[]')),
      'so_dung',jsonb_array_length(coalesce(v_preview->'dung','[]')),
      'so_giu_nguyen',jsonb_array_length(coalesce(v_preview->'giu_nguyen','[]')),
      'so_deadline_override',jsonb_array_length(p_deadline_overrides),
      'timeline_revision',v_source.timeline_revision,'actor_id',auth.uid(),
      'effective_role',v_effective_role,'reason',btrim(p_reason),
      'deadline_overrides',v_deadline_results,'da_ap_truoc_do',false);
    -- 07/11/2026: hạng mục mới tạo phải mang QA của Danh mục (chạy SAU mọi
    -- phép kiểm hậu điều kiện vì CREATE_POSTSTATE đòi owner rỗng lúc tạo).
    if jsonb_array_length(coalesce(v_preview->'tao','[]'))>0 then
      perform public.vmp_reconcile_source_qa_projection(v_source.id);
    end if;
    update public.vmp_catalog_changes set status='applied',impact=v_preview,apply_result=v_result,
      applied_by=auth.uid(),applied_at=now(),apply_reason=btrim(p_reason),last_error=null
    where id=p_change_id;
    get diagnostics v_count=row_count;
    if v_count<>1 then raise exception using errcode='P2001',message='RESULT_ROWCOUNT'; end if;
    return v_result;
  exception when sqlstate 'P2001' then
    return jsonb_build_object('ok',false,'error_code','WRITE_MISMATCH',
      'error','Không thể ghi nguyên tử; toàn bộ thay đổi đã được hoàn tác');
  end;
end
$function$;

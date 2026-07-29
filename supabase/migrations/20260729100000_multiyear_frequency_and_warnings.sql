-- =====================================================================
-- 1) SỬA LUẬT: tần suất > 12 tháng phải giãn theo đúng chu kỳ
-- 2) THÊM rpc_source_warnings: rà những chỗ dữ liệu nguồn mơ hồ, để NGƯỜI
--    quyết thay vì máy đoán
--
-- Bối cảnh — rà luật VMP01 ngày 2026-07-29 (xem docs/rule-vmp01.md):
--
-- Luật cũ tính số lần trong năm = max(1, floor(12 / tần suất)). Với tần suất
-- 36 tháng: floor(12/36) = 0, bị max(1, …) nâng lên 1 → vẫn sinh MỖI NĂM một
-- lần. Ý định "3 năm thẩm định 1 lần" không được tôn trọng. Ba kho S7.01,
-- S7.02, S9.01 đang bị lên lịch dày gấp 3 lần dự định.
--
-- Cách sửa: với tần suất > 12 tháng, chỉ sinh khi đã đủ chu kỳ kể từ mốc
-- gần nhất. Mốc neo lấy từ deadline_vmp lớn nhất đang có của đối tượng —
-- dữ liệu đã sẵn, KHÔNG cần thêm cột.
--
--   Ví dụ S7.01: deadline gần nhất 2026-05-31, tần suất 36 tháng
--     → chỉ sinh lại khi năm ≥ 2026 + 3 = 2029 (thay vì 2027, 2028, 2029…)
--
-- Đối tượng chưa có mốc nào (mới hoàn toàn) thì sinh ngay, không chặn.
-- Tần suất ≤ 12 tháng giữ nguyên cách tính cũ.
-- =====================================================================

create or replace function public.rpc_generate_timeline(
  p_year   integer default null,
  p_commit boolean default false
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  K_CLASS   constant jsonb := '{"Thiết bị":"tb","Quy trình":"qt","Kho":"kho",
                                "Hệ thống phụ trợ":"ht","Vận chuyển":"vc"}'::jsonb;
  K_REPORT  constant jsonb := '{"không phụ thuộc":2,"hóa lý":2,
                                "nhiễm khuẩn":7,"vô khuẩn":16}'::jsonb;

  v_role      text;
  v_year      integer := coalesce(p_year, extract(year from now())::integer);
  o           record;
  v_types     text[];
  v_type      text;
  v_freq      integer;
  v_times     integer;
  v_n         integer;
  v_code      text;
  v_tm        integer;
  v_month     integer;
  v_yr        integer;
  v_t         date;
  v_report    date;
  v_end       date;
  v_start     date;
  v_proto     date;
  v_nbc       integer;
  v_created   integer := 0;
  v_skipped   integer := 0;
  v_partial   integer := 0;
  v_notyet    integer := 0;     -- chưa tới chu kỳ (tần suất > 12 tháng)
  v_last_year integer;
  v_rows      jsonb := '[]'::jsonb;
  v_chuaday   jsonb := '[]'::jsonb;
  v_missing   text[];
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if v_role not in ('admin','qa_manager') then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được sinh timeline');
  end if;

  for o in
    select * from public.vmp_source_objects
     where validate_flag = 'y' and is_active
     order by object_kind, object_code
  loop
    v_freq := coalesce(nullif(o.frequency_months, 0), 12);

    -- ---- MỚI: tần suất > 12 tháng thì phải đủ chu kỳ mới sinh lại ----
    if v_freq > 12 then
      select max(extract(year from pi.deadline_vmp))::integer
        into v_last_year
      from public.vmp_plan_items pi
      where pi.object_code = o.object_code
        and pi.deadline_vmp is not null;

      if v_last_year is not null and v_year < v_last_year + (v_freq / 12) then
        v_notyet := v_notyet + 1;
        v_chuaday := v_chuaday || jsonb_build_object(
          'object_code', o.object_code,
          'object_name', o.object_name,
          'tan_suat_thang', v_freq,
          'moc_gan_nhat', v_last_year,
          'ky_ke_tiep', v_last_year + (v_freq / 12));
        continue;                       -- chưa tới chu kỳ, bỏ qua đối tượng
      end if;
    end if;

    if o.object_kind in ('Thiết bị', 'Hệ thống phụ trợ') then
      if o.year_ref = v_year
         and not exists (select 1 from public.vmp_plan_items pi
                          where pi.object_code = o.object_code
                            and pi.validation_type = 'IQ')
      then v_types := array['DQ','FAT/SAT','IQ','OQ','PQ'];
      else v_types := array['OQ','PQ'];
      end if;
    elsif o.object_kind = 'Quy trình' then v_types := array['PV'];
    elsif o.object_kind = 'Kho'       then v_types := array['GSP'];
    else                                   v_types := array['GDP'];
    end if;

    -- Tần suất ≤ 12 tháng: nhiều lần trong năm. Trên 12 tháng: 1 lần, và đã
    -- được cổng chu kỳ ở trên quyết định có sinh năm nay hay không.
    v_times := greatest(1, 12 / v_freq);

    foreach v_type in array v_types loop
      for v_n in 1 .. v_times loop
        v_code := o.object_code || '/' || v_year::text || '.'
                  || lpad(v_n::text, 2, '0') || '-' || v_type;

        if exists (select 1 from public.vmp_plan_items where validation_code = v_code) then
          v_skipped := v_skipped + 1;
          continue;
        end if;

        v_t := null; v_report := null; v_end := null; v_start := null; v_proto := null;
        v_missing := '{}';

        if o.first_month is null then
          v_missing := array_append(v_missing, 'Tháng thẩm định đầu tiên');
        else
          v_tm    := o.first_month + (v_n - 1) * v_freq;
          v_month := ((v_tm - 1) % 12) + 1;
          v_yr    := v_year + ((v_tm - 1) / 12);
          v_t      := (make_date(v_yr, v_month, 1) + interval '1 month' - interval '1 day')::date;
          v_report := v_t - 5;

          if v_type in ('IQ','OQ') then
            v_nbc := 2;
          else
            v_nbc := (K_REPORT ->> lower(coalesce(o.report_class, '')))::integer;
          end if;

          if v_nbc is null then
            v_missing := array_append(v_missing, 'Phân loại báo cáo');
          else
            v_end := v_report - v_nbc;
            if o.workdays is null then
              v_missing := array_append(v_missing, 'Số ngày công thẩm định thực tế');
            else
              v_start := v_end - o.workdays;
              v_proto := v_start - 60;
            end if;
          end if;
        end if;

        if array_length(v_missing, 1) is not null then
          v_partial := v_partial + 1;
        end if;

        v_rows := v_rows || jsonb_build_object(
          'validation_code',     v_code,
          'object_code',         o.object_code,
          'object_kind',         o.object_kind,
          'validation_type',     v_type,
          'lan',                 v_n,
          'deadline_vmp',        v_t,
          'deadline_report',     v_report,
          'deadline_validation', v_end,
          'deadline_protocol',   v_proto,
          'thieu_du_lieu',       to_jsonb(v_missing));

        if p_commit then
          insert into public.vmp_objects (
            code, name, classification, department, area, line,
            criticality, frequency_months, is_active, created_by, updated_by)
          values (
            o.object_code,
            coalesce(o.object_name, o.object_code),
            coalesce(K_CLASS ->> o.object_kind, 'tb'),
            o.department,
            coalesce(o.area_code, '—'),
            coalesce(o.line, '—'),
            'medium',
            v_freq,
            true, auth.uid(), auth.uid())
          on conflict (code) do nothing;

          insert into public.vmp_plan_items (
            id, validation_code, object_code, validation_type, year,
            report_class, effort_days,
            deadline_protocol, deadline_validation, deadline_report, deadline_vmp,
            departments, created_by, updated_by)
          values (
            v_code, v_code, o.object_code, v_type, v_year,
            coalesce(o.report_class, 'Không phụ thuộc'), o.workdays,
            v_proto, v_end, v_report, v_t,
            public.vmp_parse_depts(coalesce(o.department, '')),
            auth.uid(), auth.uid());

          v_created := v_created + 1;
        end if;
      end loop;
    end loop;
  end loop;

  return jsonb_build_object(
    'ok',              true,
    'nam',             v_year,
    'da_ghi',          p_commit,
    'so_tao_moi',      case when p_commit then v_created else jsonb_array_length(v_rows) end,
    'so_bo_qua',       v_skipped,
    'so_thieu_moc',    v_partial,
    'so_chua_toi_chu_ky', v_notyet,
    'chua_toi_chu_ky', v_chuaday,
    'danh_sach',       v_rows,
    'msg', case when p_commit
                then 'Đã sinh ' || v_created || ' hạng mục'
                else 'Xem trước ' || jsonb_array_length(v_rows)
                     || ' hạng mục sẽ được tạo. Gọi lại với p_commit := true để ghi.' end);
end;
$fn$;

-- =====================================================================
-- rpc_source_warnings — rà chỗ dữ liệu nguồn MƠ HỒ
--
-- Ba nhóm dưới đây KHÔNG được xử lý tự động, vì mỗi nhóm đều có lý do
-- chính đáng để tồn tại và máy không nên đoán:
--
--   · thiếu_thang_dau : chắc chắn sai, phải điền
--   · chua_tung_IQ    : có thể đúng (thiết bị cũ đã thẩm định trước khi có
--                       hệ thống) hoặc sai (bỏ lỡ một năm sinh timeline)
--   · show_tat / chua_hoat_dong : "Chưa hoạt động" chính là thứ CẦN DQ/IQ,
--                       nên lọc bỏ sẽ sai ngược
-- =====================================================================
create or replace function public.rpc_source_warnings(
  p_year integer default null
) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_year integer := coalesce(p_year, extract(year from now())::integer);
begin
  return jsonb_build_object(
    'nam', v_year,

    -- Chắc chắn sai: không có tháng đầu tiên thì mọi mốc thời gian đều hỏng
    'thieu_thang_dau', coalesce((
      select jsonb_agg(jsonb_build_object(
               'object_kind', object_kind, 'object_code', object_code,
               'object_name', object_name) order by object_code)
      from public.vmp_source_objects
      where validate_flag = 'y' and is_active and first_month is null), '[]'::jsonb),

    -- Cần người xem: thiết bị/hệ thống có năm nhập KHÔNG PHẢI năm nay và
    -- chưa từng có IQ. Có thể là thiết bị cũ (bình thường), cũng có thể là
    -- năm nhập đó đã bị bỏ lỡ không sinh timeline.
    'chua_tung_iq', coalesce((
      select jsonb_agg(jsonb_build_object(
               'object_kind', s.object_kind, 'object_code', s.object_code,
               'object_name', s.object_name, 'nam_nhap', s.year_ref) order by s.object_code)
      from public.vmp_source_objects s
      where s.validate_flag = 'y' and s.is_active
        and s.object_kind in ('Thiết bị','Hệ thống phụ trợ')
        and s.year_ref is not null
        and s.year_ref <> v_year
        and not exists (select 1 from public.vmp_plan_items p
                         where p.object_code = s.object_code and p.validation_type = 'IQ')
    ), '[]'::jsonb),

    -- Cần người xem: có thẩm định nhưng cờ hiển thị tắt
    'show_tat', coalesce((
      select jsonb_agg(jsonb_build_object(
               'object_kind', object_kind, 'object_code', object_code,
               'object_name', object_name, 'show_flag', show_flag) order by object_code)
      from public.vmp_source_objects
      where validate_flag = 'y' and is_active
        and show_flag is not null and lower(show_flag) <> 'y'), '[]'::jsonb),

    -- Cần người xem: có thẩm định nhưng tình trạng chưa hoạt động
    'chua_hoat_dong', coalesce((
      select jsonb_agg(jsonb_build_object(
               'object_kind', object_kind, 'object_code', object_code,
               'object_name', object_name, 'tinh_trang', status) order by object_code)
      from public.vmp_source_objects
      where validate_flag = 'y' and is_active
        and status is not null and lower(status) like '%chưa%'), '[]'::jsonb)
  );
end;
$fn$;

-- Quyền: xem HANDOVER mục 11a — kiểm bằng provolatile, revoke khỏi cả
-- anon lẫn public rồi cấp đích danh.
do $$
declare f text;
begin
  foreach f in array array[
    'public.rpc_generate_timeline(integer, boolean)',
    'public.rpc_source_warnings(integer)'
  ] loop
    execute format('revoke execute on function %s from anon',   f);
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

do $$
declare v_left text;
begin
  select string_agg(p.proname, ', ') into v_left
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'rpc\_%'
    and p.provolatile = 'v'
    and has_function_privilege('anon', p.oid, 'execute');
  if v_left is not null then
    raise exception 'Còn RPC ghi mở cho anon: %', v_left;
  end if;
end $$;

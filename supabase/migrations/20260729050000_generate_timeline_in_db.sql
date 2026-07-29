-- =====================================================================
-- rpc_generate_timeline — đưa luật sinh timeline vào trong database
--
-- Bối cảnh: Supabase là nơi lưu dữ liệu chính; web nhập/sửa; Google Sheet
-- chỉ còn là bản sao lưu. Trước đây luật sinh timeline nằm ở node
-- "Code in JavaScript1" của workflow n8n VMP01 và GHI VÀO SHEET — hướng đó
-- nay đã đứt. Không có hàm này thì thêm đối tượng mới trên web sẽ không
-- sinh ra hạng mục timeline nào.
--
-- Luật cài ở đây bám đúng VMP01, đã kiểm chứng 2026-07-29 (439/439 ID khớp
-- dữ liệu thật). Xem docs/HANDOVER.md mục 9b.
--
-- Ba ràng buộc bắt buộc:
--   1. IDEMPOTENT — mã đã tồn tại thì bỏ qua, không sinh trùng. Các loại
--      một-lần (DQ, FAT/SAT, IQ) chỉ sinh khi đối tượng CHƯA TỪNG có IQ.
--   2. KHÔNG ĐÈ DỮ LIỆU NHẬP TAY — chỉ INSERT hạng mục mới. Không bao giờ
--      UPDATE các cột tiến độ (QA phụ trách, thời gian thực tế, trạng thái
--      từng giai đoạn) vì đó là phần người dùng nhập, không tái tạo được.
--   3. XEM TRƯỚC RỒI MỚI GHI — p_commit mặc định FALSE, chỉ trả về danh
--      sách dự kiến. Phải gọi lại với p_commit := true mới thực sự ghi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. SỬA LỖI: rpc_delete_plan_item đặt item_state='deleted' nhưng ràng
--    buộc chk_item_state chỉ cho 'active' | 'not_applicable' | 'cancelled'
--    => mọi lần xoá hạng mục đều vỡ. Dùng 'cancelled'.
-- ---------------------------------------------------------------------
create or replace function public.rpc_delete_plan_item(
  p_validation_code text,
  p_reason          text
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_role text;
  v_n    integer;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if v_role not in ('admin','qa_manager') then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được xoá hạng mục');
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    return jsonb_build_object('ok', false, 'error', 'Phải nhập lý do xoá');
  end if;

  update public.vmp_plan_items
     set is_active = false, item_state = 'cancelled', deleted_at = now(),
         delete_reason = btrim(p_reason), updated_by = auth.uid()
   where validation_code = p_validation_code and is_active = true;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error',
      'Không tìm thấy hạng mục đang hoạt động: ' || p_validation_code);
  end if;
  return jsonb_build_object('ok', true, 'msg', 'Đã huỷ hạng mục');
end;
$fn$;

-- ---------------------------------------------------------------------
-- 1. Hàm sinh timeline
-- ---------------------------------------------------------------------
create or replace function public.rpc_generate_timeline(
  p_year   integer default null,
  p_commit boolean default false
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  -- Bảng tra cứu, giữ đúng con số của VMP01
  K_CLASS   constant jsonb := '{"Thiết bị":"tb","Quy trình":"qt","Kho":"kho",
                                "Hệ thống phụ trợ":"ht","Vận chuyển":"vc"}'::jsonb;
  K_REPORT  constant jsonb := '{"không phụ thuộc":2,"hóa lý":2,
                                "nhiễm khuẩn":7,"vô khuẩn":16}'::jsonb;

  v_role     text;
  v_year     integer := coalesce(p_year, extract(year from now())::integer);
  o          record;
  v_types    text[];
  v_type     text;
  v_freq     integer;
  v_times    integer;
  v_n        integer;
  v_code     text;
  v_tm       integer;   -- tổng tháng dồn
  v_month    integer;
  v_yr       integer;
  v_t        date;      -- T = hạn hoàn thành (ngày cuối tháng)
  v_report   date;
  v_end      date;
  v_start    date;
  v_proto    date;
  v_nbc      integer;   -- số ngày báo cáo
  v_created  integer := 0;
  v_skipped  integer := 0;
  v_partial  integer := 0;
  v_rows     jsonb := '[]'::jsonb;
  v_missing  text[];
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
    -- VMP01: parseInt(tanSuat) || 12  → rỗng/0 thì mặc định 12 tháng
    v_freq := coalesce(nullif(o.frequency_months, 0), 12);

    -- Loại thẩm định theo phân loại đối tượng
    if o.object_kind in ('Thiết bị', 'Hệ thống phụ trợ') then
      -- Lần đầu = năm nhập trùng năm thẩm định VÀ chưa từng có IQ.
      -- Điều kiện IQ chính là cơ chế idempotent của daTungIQ() bên VMP01:
      -- sau lần đầu, DQ/FAT-SAT/IQ không bao giờ sinh lại.
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

    -- số lần trong năm = max(1, floor(12 / tần suất))
    v_times := greatest(1, 12 / v_freq);

    foreach v_type in array v_types loop
      for v_n in 1 .. v_times loop
        v_code := o.object_code || '/' || v_year::text || '.'
                  || lpad(v_n::text, 2, '0') || '-' || v_type;

        if exists (select 1 from public.vmp_plan_items where validation_code = v_code) then
          v_skipped := v_skipped + 1;
          continue;
        end if;

        -- ---- tính mốc thời gian, LÙI dần từ T ----
        v_t := null; v_report := null; v_end := null; v_start := null; v_proto := null;
        v_missing := '{}';

        if o.first_month is null then
          v_missing := array_append(v_missing, 'Tháng thẩm định đầu tiên');
        else
          v_tm    := o.first_month + (v_n - 1) * v_freq;
          v_month := ((v_tm - 1) % 12) + 1;
          v_yr    := v_year + ((v_tm - 1) / 12);
          -- T = ngày cuối tháng
          v_t      := (make_date(v_yr, v_month, 1) + interval '1 month' - interval '1 day')::date;
          v_report := v_t - 5;

          if v_type in ('IQ','OQ') then
            v_nbc := 2;                       -- IQ/OQ luôn 2 ngày, không tra bảng
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
          'validation_code',   v_code,
          'object_code',       o.object_code,
          'object_kind',       o.object_kind,
          'validation_type',   v_type,
          'lan',               v_n,
          'deadline_vmp',      v_t,
          'deadline_report',   v_report,
          'deadline_validation', v_end,
          'deadline_protocol', v_proto,
          'thieu_du_lieu',     to_jsonb(v_missing));

        if p_commit then
          -- Đối tượng phải có trong vmp_objects trước (khoá ngoại).
          -- Đối tượng mới thêm từ web chưa có ở đó, nên tạo tại chỗ.
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
    'ok',            true,
    'nam',           v_year,
    'da_ghi',        p_commit,
    'so_tao_moi',    case when p_commit then v_created else jsonb_array_length(v_rows) end,
    'so_bo_qua',     v_skipped,
    'so_thieu_moc',  v_partial,
    'danh_sach',     v_rows,
    'msg', case when p_commit
                then 'Đã sinh ' || v_created || ' hạng mục'
                else 'Xem trước ' || jsonb_array_length(v_rows)
                     || ' hạng mục sẽ được tạo. Gọi lại với p_commit := true để ghi.' end);
end;
$fn$;

revoke execute on function public.rpc_generate_timeline(integer, boolean) from public;
grant  execute on function public.rpc_generate_timeline(integer, boolean) to authenticated, service_role;

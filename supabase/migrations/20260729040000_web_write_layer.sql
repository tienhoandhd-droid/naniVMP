-- =====================================================================
-- Tầng ghi từ web: Supabase trở thành nơi lưu dữ liệu gốc
--
-- Google Sheet chuyển sang CHỈ ĐỌC (nguồn tham chiếu). Toàn bộ việc nhập
-- liệu chuyển lên dashboard. Migration này mở đường ghi cho người dùng đã
-- đăng nhập, qua RPC có kiểm soát quyền — KHÔNG cấp quyền ghi thẳng bảng.
--
-- Bối cảnh đã làm trước đó:
--   * WF-04: đã tắt 2 trigger của nhánh sync (Schedule 5 phút + webhook
--     instant), nên snapshot-replace không còn xoá đè dữ liệu sửa từ web.
--   * 5 danh mục nguồn đã nằm ở vmp_source_objects (migration ...030000).
--
-- Nguyên tắc phân quyền (khớp cách các RPC sẵn có đang làm):
--   admin, qa_manager  : toàn quyền
--   department_user    : chỉ sửa tiến độ hạng mục thuộc bộ phận mình
--   viewer             : chỉ đọc
--   Thêm/xoá cấu trúc  : chỉ admin, qa_manager
--
-- KHÔNG cấp bất kỳ quyền ghi nào cho role `anon`: dashboard chạy trên
-- GitHub Pages công khai và anon key là key công khai — cấp cho anon
-- tương đương mở cửa cho cả internet.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Vô hiệu hoá vĩnh viễn đường ghi ngược Google Sheet
--    (chèn lại nguyên văn 2 overload của rpc_update_progress, chỉ đổi
--     điều kiện xếp hàng outbox thành FALSE)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_update_progress(p_validation_code text, p_patch jsonb, p_reason text DEFAULT NULL::text, p_sheet_patch jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_item          vmp_plan_items;
  v_role          TEXT;
  v_user_dept     TEXT;
  v_item_dept     TEXT;
  v_requires_reason BOOLEAN := FALSE;
  v_outbox_id     BIGINT := NULL;
BEGIN
  SELECT role, department INTO v_role, v_user_dept
  FROM profiles WHERE id = auth.uid();

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  END IF;

  SELECT * INTO v_item FROM vmp_plan_items
  WHERE validation_code = p_validation_code AND is_active = TRUE;

  IF v_item.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Không tìm thấy mã thẩm định: ' || p_validation_code);
  END IF;

  IF v_role = 'viewer' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Viewer không có quyền cập nhật');
  END IF;

  IF v_role = 'department_user' THEN
    -- BẤT BIẾN #5 FIX: department lấy qua vmp_objects.department (không có cột department ở vmp_plan_items)
    SELECT o.department INTO v_item_dept
    FROM vmp_objects o WHERE o.code = v_item.object_code;

    IF v_item_dept IS DISTINCT FROM v_user_dept THEN
      RETURN jsonb_build_object('ok', false, 'error',
        'Bạn chỉ được cập nhật hạng mục thuộc bộ phận của mình');
    END IF;
  END IF;

  -- Chặn cập nhật hạng mục đã hủy/Không áp dụng
  IF COALESCE(v_item.item_state, 'active') <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Hạng mục đang ở trạng thái nghiệp vụ "' || v_item.item_state ||
      '" — không thể cập nhật tiến độ. Đổi sang "active" trước.');
  END IF;

  v_requires_reason := (p_patch->>'status_vmp'        = 'completed')
                    OR (p_patch->>'status_validation' = 'completed')
                    OR (p_patch->>'status_report'     = 'completed')
                    OR (p_patch->>'status_protocol'   = 'completed')
                    OR (p_patch ? 'actual_vmp_date')
                    OR (p_patch ? 'actual_validation_date')
                    OR (p_patch ? 'actual_report_date')
                    OR (p_patch ? 'actual_protocol_date');

  IF v_requires_reason AND (p_reason IS NULL OR trim(p_reason) = '') THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Cần nhập LÝ DO khi đánh dấu hoàn thành hoặc sửa ngày hoàn thành (yêu cầu GMP)');
  END IF;

  PERFORM set_config('app.audit_source', 'dashboard_rpc', true);
  PERFORM set_config('app.audit_reason', COALESCE(p_reason, ''), true);

  UPDATE vmp_plan_items SET
    status_protocol    = COALESCE((p_patch->>'status_protocol')::phase_status, status_protocol),
    status_validation  = COALESCE((p_patch->>'status_validation')::phase_status, status_validation),
    status_report      = COALESCE((p_patch->>'status_report')::phase_status, status_report),
    status_vmp         = COALESCE((p_patch->>'status_vmp')::phase_status, status_vmp),
    actual_protocol_date   = COALESCE((p_patch->>'actual_protocol_date')::DATE, actual_protocol_date),
    actual_validation_date = COALESCE((p_patch->>'actual_validation_date')::DATE, actual_validation_date),
    actual_report_date     = COALESCE((p_patch->>'actual_report_date')::DATE, actual_report_date),
    actual_vmp_date        = COALESCE((p_patch->>'actual_vmp_date')::DATE, actual_vmp_date),
    scheduled_date         = COALESCE((p_patch->>'scheduled_date')::DATE, scheduled_date),
    updated_by = auth.uid(),
    updated_at = NOW()
  WHERE validation_code = p_validation_code;

  -- GHI NGƯỢC GOOGLE SHEET ĐÃ BỊ VÔ HIỆU HOÁ (2026-07-29).
  -- Sheet là dữ liệu gốc chỉ-đọc; Supabase mới là nơi lưu dữ liệu chuẩn.
  -- Giữ nguyên tham số p_sheet_patch để không phá chữ ký hàm, nhưng không
  -- bao giờ xếp hàng vào outbox nữa. Điều kiện FALSE giữ khối code bên dưới
  -- còn nguyên để dễ khôi phục nếu sau này cần bật lại.
  IF FALSE AND p_sheet_patch IS NOT NULL AND p_sheet_patch <> '{}'::jsonb THEN
    -- next_attempt_at + 30s để WF-04 mirror tức thời có thời gian hoàn tất
    -- TRƯỚC khi WF-06 (chạy mỗi 1 phút) claim → giảm ghi Sheet trùng.
    INSERT INTO sheet_sync_outbox (validation_code, sheet_patch, status, next_attempt_at)
    VALUES (p_validation_code, p_sheet_patch, 'pending', NOW() + INTERVAL '30 seconds')
    ON CONFLICT (validation_code) WHERE status = 'pending'
    DO UPDATE SET sheet_patch     = sheet_sync_outbox.sheet_patch || EXCLUDED.sheet_patch,
                  next_attempt_at = NOW() + INTERVAL '30 seconds',
                  updated_at      = NOW()
    RETURNING id INTO v_outbox_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'validation_code', p_validation_code,
    'msg', 'Đã cập nhật thành công',
    'reason_logged', v_requires_reason,
    'outbox_id', v_outbox_id
  );
EXCEPTION
  WHEN OTHERS THEN
    -- S2-A FIX: LOG lỗi gốc ra Postgres logs + ghi data_quality_issues
    RAISE LOG 'rpc_update_progress lỗi (code=%, sqlstate=%): %',
      p_validation_code, SQLSTATE, SQLERRM;
    BEGIN
      INSERT INTO data_quality_issues (
        plan_item_id, object_code, issue_type, severity, message, detected_at
      ) VALUES (
        (SELECT id FROM vmp_plan_items WHERE validation_code = p_validation_code LIMIT 1),
        NULL, 'rpc_error', 'error',
        'rpc_update_progress(' || p_validation_code || '): ' || SQLERRM || ' [sqlstate=' || SQLSTATE || ']',
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      -- nếu bảng data_quality_issues không tồn tại hoặc khác schema, bỏ qua
      NULL;
    END;
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_update_progress(p_validation_code text, p_patch jsonb, p_reason text DEFAULT NULL::text, p_sheet_patch jsonb DEFAULT NULL::jsonb, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_item            vmp_plan_items;
  v_role            TEXT;
  v_user_dept       TEXT;
  v_item_dept       TEXT;
  v_requires_reason BOOLEAN := FALSE;
  v_outbox_id       BIGINT := NULL;
BEGIN
  SELECT role, department INTO v_role, v_user_dept
  FROM profiles WHERE id = auth.uid();

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  END IF;

  SELECT * INTO v_item FROM vmp_plan_items
  WHERE validation_code = p_validation_code AND is_active = TRUE;

  IF v_item.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Không tìm thấy mã thẩm định: ' || p_validation_code);
  END IF;

  -- (MỚI) KHÓA LẠC QUAN: nếu client gửi version kỳ vọng mà DB đã khác → có người sửa trước.
  IF p_expected_version IS NOT NULL AND v_item.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'version_conflict',
      'error', 'Hạng mục đã được người khác cập nhật trong lúc bạn đang sửa. Vui lòng tải lại dữ liệu và thử lại.',
      'current_version', v_item.version
    );
  END IF;

  IF v_role = 'viewer' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Viewer không có quyền cập nhật');
  END IF;

  IF v_role = 'department_user' THEN
    SELECT o.department INTO v_item_dept
    FROM vmp_objects o WHERE o.code = v_item.object_code;
    IF v_item_dept IS DISTINCT FROM v_user_dept THEN
      RETURN jsonb_build_object('ok', false, 'error',
        'Bạn chỉ được cập nhật hạng mục thuộc bộ phận của mình');
    END IF;
  END IF;

  IF COALESCE(v_item.item_state, 'active') <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Hạng mục đang ở trạng thái nghiệp vụ "' || v_item.item_state ||
      '" — không thể cập nhật tiến độ. Đổi sang "active" trước.');
  END IF;

  v_requires_reason := (p_patch->>'status_vmp'        = 'completed')
                    OR (p_patch->>'status_validation' = 'completed')
                    OR (p_patch->>'status_report'     = 'completed')
                    OR (p_patch->>'status_protocol'   = 'completed')
                    OR (p_patch ? 'actual_vmp_date')
                    OR (p_patch ? 'actual_validation_date')
                    OR (p_patch ? 'actual_report_date')
                    OR (p_patch ? 'actual_protocol_date');

  IF v_requires_reason AND (p_reason IS NULL OR trim(p_reason) = '') THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Cần nhập LÝ DO khi đánh dấu hoàn thành hoặc sửa ngày hoàn thành (yêu cầu GMP)');
  END IF;

  PERFORM set_config('app.audit_source', 'dashboard_rpc', true);
  PERFORM set_config('app.audit_reason', COALESCE(p_reason, ''), true);

  UPDATE vmp_plan_items SET
    status_protocol    = COALESCE((p_patch->>'status_protocol')::phase_status, status_protocol),
    status_validation  = COALESCE((p_patch->>'status_validation')::phase_status, status_validation),
    status_report      = COALESCE((p_patch->>'status_report')::phase_status, status_report),
    status_vmp         = COALESCE((p_patch->>'status_vmp')::phase_status, status_vmp),
    actual_protocol_date   = COALESCE((p_patch->>'actual_protocol_date')::DATE, actual_protocol_date),
    actual_validation_date = COALESCE((p_patch->>'actual_validation_date')::DATE, actual_validation_date),
    actual_report_date     = COALESCE((p_patch->>'actual_report_date')::DATE, actual_report_date),
    actual_vmp_date        = COALESCE((p_patch->>'actual_vmp_date')::DATE, actual_vmp_date),
    scheduled_date         = COALESCE((p_patch->>'scheduled_date')::DATE, scheduled_date),
    version    = version + 1,        -- (MỚI) tăng bản đếm cho khóa lạc quan
    updated_by = auth.uid(),
    updated_at = NOW()
  WHERE validation_code = p_validation_code;

  -- GHI NGƯỢC GOOGLE SHEET ĐÃ BỊ VÔ HIỆU HOÁ (2026-07-29).
  -- Sheet là dữ liệu gốc chỉ-đọc; Supabase mới là nơi lưu dữ liệu chuẩn.
  -- Giữ nguyên tham số p_sheet_patch để không phá chữ ký hàm, nhưng không
  -- bao giờ xếp hàng vào outbox nữa. Điều kiện FALSE giữ khối code bên dưới
  -- còn nguyên để dễ khôi phục nếu sau này cần bật lại.
  IF FALSE AND p_sheet_patch IS NOT NULL AND p_sheet_patch <> '{}'::jsonb THEN
    INSERT INTO sheet_sync_outbox (validation_code, sheet_patch, status, next_attempt_at)
    VALUES (p_validation_code, p_sheet_patch, 'pending', NOW() + INTERVAL '30 seconds')
    ON CONFLICT (validation_code) WHERE status = 'pending'
    DO UPDATE SET sheet_patch     = sheet_sync_outbox.sheet_patch || EXCLUDED.sheet_patch,
                  next_attempt_at = NOW() + INTERVAL '30 seconds',
                  updated_at      = NOW()
    RETURNING id INTO v_outbox_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'validation_code', p_validation_code,
    'msg', 'Đã cập nhật thành công',
    'reason_logged', v_requires_reason,
    'outbox_id', v_outbox_id,
    'version', v_item.version + 1
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'rpc_update_progress lỗi (code=%, sqlstate=%): %',
      p_validation_code, SQLSTATE, SQLERRM;
    BEGIN
      INSERT INTO data_quality_issues (
        plan_item_id, object_code, issue_type, severity, message, detected_at
      ) VALUES (
        (SELECT id FROM vmp_plan_items WHERE validation_code = p_validation_code LIMIT 1),
        NULL, 'rpc_error', 'error',
        'rpc_update_progress(' || p_validation_code || '): ' || SQLERRM || ' [sqlstate=' || SQLSTATE || ']',
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$function$
;

-- ---------------------------------------------------------------------
-- 2. Danh mục nguồn: đánh dấu bản ghi do web sửa + cờ ngừng sử dụng
-- ---------------------------------------------------------------------
alter table public.vmp_source_objects
  add column if not exists is_active     boolean     not null default true,
  add column if not exists edited_on_web boolean     not null default false,
  add column if not exists updated_by    uuid,
  add column if not exists note          text;

comment on column public.vmp_source_objects.edited_on_web is
  'TRUE khi bản ghi đã được tạo/sửa từ dashboard. scripts/import-source-catalogs.py
   từ chối chạy nếu có bản ghi nào bật cờ này (tránh TRUNCATE xoá mất dữ liệu nhập tay).';

create index if not exists idx_source_objects_edited on public.vmp_source_objects (edited_on_web)
  where edited_on_web;

-- ---------------------------------------------------------------------
-- 3. RPC ghi danh mục nguồn (5 mục hiển thị trên web)
-- ---------------------------------------------------------------------
create or replace function public.rpc_upsert_source_object(
  p_object_kind text,
  p_object_code text,
  p_patch       jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_role  text;
  v_id    uuid;
  v_code  text := nullif(btrim(p_object_code), '');
  v_kind  text := nullif(btrim(p_object_kind), '');
  v_allowed constant text[] := array[
    'object_name','department','area_code','line','status','show_flag',
    'validate_flag','validate_reason','frequency_months','report_class',
    'workdays','critical_point','first_month','year_ref','note','is_active'
  ];
  v_bad text[];
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if v_role not in ('admin','qa_manager') then
    return jsonb_build_object('ok', false, 'error',
      'Chỉ admin hoặc QA được thêm/sửa danh mục nguồn');
  end if;

  if v_code is null or v_kind is null then
    return jsonb_build_object('ok', false, 'error', 'Thiếu mã hoặc loại đối tượng');
  end if;
  if v_kind not in ('Thiết bị','Quy trình','Kho','Hệ thống phụ trợ','Vận chuyển') then
    return jsonb_build_object('ok', false, 'error', 'Loại đối tượng không hợp lệ: ' || v_kind);
  end if;

  -- chặn khoá lạ trong patch để tránh ghi nhầm cột hệ thống
  select array_agg(k) into v_bad
  from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) k
  where k <> all (v_allowed);
  if v_bad is not null then
    return jsonb_build_object('ok', false, 'error',
      'Trường không được phép sửa: ' || array_to_string(v_bad, ', '));
  end if;

  insert into public.vmp_source_objects (
    object_kind, object_code, source_tab, source_row, edited_on_web, updated_by)
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
    frequency_months = coalesce((p_patch ->> 'frequency_months')::integer, o.frequency_months),
    workdays         = coalesce((p_patch ->> 'workdays')::integer,         o.workdays),
    first_month      = coalesce((p_patch ->> 'first_month')::integer,      o.first_month),
    year_ref         = coalesce((p_patch ->> 'year_ref')::integer,         o.year_ref),
    is_active        = coalesce((p_patch ->> 'is_active')::boolean,        o.is_active)
  where o.id = v_id;

  return jsonb_build_object('ok', true, 'id', v_id,
    'object_kind', v_kind, 'object_code', v_code, 'msg', 'Đã lưu danh mục');
exception when others then
  raise log 'rpc_upsert_source_object lỗi (%, %): %', v_kind, v_code, sqlerrm;
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$fn$;

create or replace function public.rpc_delete_source_object(
  p_object_kind text,
  p_object_code text,
  p_reason      text
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
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được ngừng dùng danh mục');
  end if;
  if nullif(btrim(coalesce(p_reason,'')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'Phải nhập lý do');
  end if;

  -- ngừng sử dụng (mềm), KHÔNG xoá vật lý: hạng mục timeline vẫn tham chiếu mã này
  update public.vmp_source_objects
     set is_active = false, edited_on_web = true, updated_by = auth.uid(),
         note = coalesce(note || ' | ', '') || 'Ngừng dùng: ' || btrim(p_reason)
   where object_kind = p_object_kind and object_code = p_object_code;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'Không tìm thấy đối tượng');
  end if;
  return jsonb_build_object('ok', true, 'msg', 'Đã ngừng sử dụng đối tượng');
end;
$fn$;

-- ---------------------------------------------------------------------
-- 4. RPC thêm/xoá hạng mục timeline
--    ID bám đúng quy ước của VMP01: {mã}/{năm}.{lần 2 chữ số}-{loại}
-- ---------------------------------------------------------------------
create or replace function public.rpc_create_plan_item(
  p_object_code     text,
  p_validation_type text,
  p_year            integer default null,
  p_occurrence      integer default 1,
  p_patch           jsonb   default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_role text;
  v_year integer := coalesce(p_year, extract(year from now())::integer);
  v_code text;
  v_res  jsonb;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if v_role not in ('admin','qa_manager') then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được thêm hạng mục');
  end if;
  if nullif(btrim(coalesce(p_object_code,'')),'') is null
     or nullif(btrim(coalesce(p_validation_type,'')),'') is null then
    return jsonb_build_object('ok', false, 'error', 'Thiếu mã đối tượng hoặc loại thẩm định');
  end if;
  if p_occurrence < 1 or p_occurrence > 99 then
    return jsonb_build_object('ok', false, 'error', 'Lần thẩm định phải trong khoảng 1..99');
  end if;
  if not exists (select 1 from public.vmp_objects where code = btrim(p_object_code)) then
    return jsonb_build_object('ok', false, 'error',
      'Chưa có đối tượng "' || btrim(p_object_code) || '" trong danh mục');
  end if;

  v_code := btrim(p_object_code) || '/' || v_year::text || '.'
            || lpad(p_occurrence::text, 2, '0') || '-' || btrim(p_validation_type);

  if exists (select 1 from public.vmp_plan_items where validation_code = v_code) then
    return jsonb_build_object('ok', false, 'error', 'Mã thẩm định đã tồn tại: ' || v_code);
  end if;

  insert into public.vmp_plan_items (
    id, validation_code, object_code, validation_type, year, created_by, updated_by)
  values (v_code, v_code, btrim(p_object_code), btrim(p_validation_type), v_year,
          auth.uid(), auth.uid());

  if p_patch is not null and p_patch <> '{}'::jsonb then
    v_res := public.rpc_update_progress(v_code, p_patch, 'Tạo hạng mục mới từ dashboard');
    if (v_res ->> 'ok')::boolean is not true then
      raise exception 'Tạo được hạng mục nhưng cập nhật chi tiết thất bại: %', v_res ->> 'error';
    end if;
  end if;

  return jsonb_build_object('ok', true, 'validation_code', v_code, 'msg', 'Đã tạo hạng mục');
end;
$fn$;

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

  -- xoá mềm: giữ lại để audit và báo cáo lịch sử
  update public.vmp_plan_items
     set is_active = false, item_state = 'deleted', deleted_at = now(),
         delete_reason = btrim(p_reason), updated_by = auth.uid()
   where validation_code = p_validation_code and is_active = true;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error',
      'Không tìm thấy hạng mục đang hoạt động: ' || p_validation_code);
  end if;
  return jsonb_build_object('ok', true, 'msg', 'Đã xoá hạng mục');
end;
$fn$;

-- ---------------------------------------------------------------------
-- 5. Cấp quyền — CHỈ cho `authenticated`, tuyệt đối không cho `anon`
-- ---------------------------------------------------------------------
grant execute on function public.rpc_update_progress(text, jsonb, text, jsonb)                    to authenticated;
grant execute on function public.rpc_update_progress(text, jsonb, text, jsonb, integer)           to authenticated;
grant execute on function public.rpc_set_item_state(text, text, text)                             to authenticated;
grant execute on function public.rpc_upsert_object(text, text, text, text, text, text, integer, text) to authenticated;
grant execute on function public.rpc_deactivate_object(text, text)                                to authenticated;
grant execute on function public.rpc_resolve_missing(text, text, text)                            to authenticated;
grant execute on function public.rpc_upsert_source_object(text, text, jsonb)                      to authenticated;
grant execute on function public.rpc_delete_source_object(text, text, text)                       to authenticated;
grant execute on function public.rpc_create_plan_item(text, text, integer, integer, jsonb)        to authenticated;
grant execute on function public.rpc_delete_plan_item(text, text)                                 to authenticated;

revoke execute on function public.rpc_upsert_source_object(text, text, jsonb)                     from anon;
revoke execute on function public.rpc_delete_source_object(text, text, text)                      from anon;
revoke execute on function public.rpc_create_plan_item(text, text, integer, integer, jsonb)       from anon;
revoke execute on function public.rpc_delete_plan_item(text, text)                                from anon;

-- ---------------------------------------------------------------------
-- 6. QUAN TRỌNG: Postgres cấp EXECUTE cho PUBLIC mặc định khi CREATE
--    FUNCTION. `revoke ... from anon` KHÔNG gỡ được quyền kế thừa đó —
--    phải revoke khỏi chính PUBLIC rồi cấp lại đích danh.
--    (Các RPC cũ đã được xử lý ở migration enforce_sheet_canonical_read_only.)
-- ---------------------------------------------------------------------
revoke execute on function public.rpc_upsert_source_object(text, text, jsonb)               from public;
revoke execute on function public.rpc_delete_source_object(text, text, text)                from public;
revoke execute on function public.rpc_create_plan_item(text, text, integer, integer, jsonb) from public;
revoke execute on function public.rpc_delete_plan_item(text, text)                          from public;

grant execute on function public.rpc_upsert_source_object(text, text, jsonb)               to authenticated, service_role;
grant execute on function public.rpc_delete_source_object(text, text, text)                to authenticated, service_role;
grant execute on function public.rpc_create_plan_item(text, text, integer, integer, jsonb) to authenticated, service_role;
grant execute on function public.rpc_delete_plan_item(text, text)                          to authenticated, service_role;

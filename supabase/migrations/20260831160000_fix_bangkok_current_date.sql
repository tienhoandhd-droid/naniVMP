-- =====================================================================
-- 20260831160000_fix_bangkok_current_date.sql
-- ---------------------------------------------------------------------
-- SỬA LỆCH MÚI GIỜ trong luật "ngày hoàn thành không ở tương lai" của
-- rpc_update_progress__assigned_impl_20260827: ngày-theo-múi-DB (UTC trên
-- Supabase) → (now() at time zone 'Asia/Bangkok')::date.
--
-- Vì sao: 00:00-07:00 sáng giờ Bangkok, phía DB còn là NGÀY HÔM QUA ⇒
-- người nhập ca sáng bị từ chối chính ngày hôm nay, thông báo lỗi in sai
-- ngày. Client đã tính theo Bangkok từ trước (bangkokCalendarDate).
--
-- Thân hàm CHÉP NGUYÊN VĂN từ 20260827130000 (sinh bằng script, không gõ
-- tay), chỉ thay đúng khối kiểm ngày. Wrapper guarded rpc_update_progress
-- (20260828150000) gọi impl theo TÊN nên không phải đụng; create or
-- replace giữ nguyên owner/ACL hiện có của impl.
--
-- Áp dụng theo runbook: docs/runbooks/2026-08-31-fix-bangkok-current-date.md
-- =====================================================================

begin;

-- ---------- PRECONDITION: định nghĩa đang chạy phải đúng bản đã biết ----------
do $preflight$
declare
  v_def text;
begin
  select pg_get_functiondef(
    'public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)'::regprocedure)
  into v_def;
  if (length(v_def) - length(replace(v_def, '> current_date', ''))) / length('> current_date') <> 4 then
    raise exception 'PRECONDITION FAILED: khối kiểm ngày không còn đúng 4 phép so sánh với ngày-theo-múi-DB — định nghĩa production đã trôi so với repo, DỪNG và đối chiếu tay';
  end if;
  if position('to_char(current_date' in v_def) = 0 then
    raise exception 'PRECONDITION FAILED: không thấy to_char ngày-theo-múi-DB — định nghĩa đã trôi, DỪNG';
  end if;
end
$preflight$;

-- ---------- BẢN VÁ (thân hàm nguyên văn + khối múi giờ mới) ----------
create or replace function public.rpc_update_progress__assigned_impl_20260827(
  p_validation_code text,
  p_patch jsonb,
  p_reason text default null,
  p_sheet_patch jsonb default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_item vmp_plan_items%rowtype;
  v_role user_role;
  v_user_dept text;
  v_item_dept text;
  v_requires_reason boolean := false;
  v_outbox_id bigint := null;
  v_patch jsonb := p_patch;
  v_mode text := public.item_permissions_mode();
  v_allowed text[] := '{}'::text[];
  v_bad_fields text[] := '{}'::text[];
  v_scheduled_at timestamptz;
begin
  if v_patch is null
     or jsonb_typeof(v_patch) <> 'object'
     or v_patch = '{}'::jsonb then
    return jsonb_build_object(
      'ok',false,'code','patch_invalid',
      'error','Patch phải là một object JSON không rỗng');
  end if;

  -- Tên cũ chỉ còn là đường tương thích; mọi kiểm quyền dùng scheduled_at.
  if v_patch ? 'scheduled_date' then
    if not (v_patch ? 'scheduled_at') then
      v_patch := jsonb_set(v_patch, '{scheduled_at}', v_patch -> 'scheduled_date', true);
    end if;
    v_patch := v_patch - 'scheduled_date';
  end if;

  select role, department into v_role, v_user_dept
  from public.profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;

  -- Authorize before taking the row lock so an unassigned caller cannot hold
  -- an item lock or learn whether the submitted version is current.
  v_allowed := public.vmp_allowed_timeline_fields(auth.uid(),p_validation_code);
  if cardinality(coalesce(v_allowed,'{}'::text[]))=0 then
    return jsonb_build_object(
      'ok',false,
      'code','item_field_forbidden',
      'error','Bạn không có trường tiến độ nào được phép cập nhật',
      'forbidden_fields',to_jsonb(array(
        select key from jsonb_object_keys(v_patch) keys(key) order by key)),
      'allowed_fields','[]'::jsonb
    );
  end if;

  select coalesce(array_agg(key order by key),'{}'::text[])
  into v_bad_fields
  from jsonb_object_keys(v_patch) as keys(key)
  where not (key=any(v_allowed));

  if cardinality(v_bad_fields)>0 then
    return jsonb_build_object(
      'ok',false,
      'code','item_field_forbidden',
      'error','Bạn không được cập nhật các trường: '||
        array_to_string(v_bad_fields,', '),
      'forbidden_fields',to_jsonb(v_bad_fields),
      'allowed_fields',to_jsonb(v_allowed)
    );
  end if;

  select * into v_item from public.vmp_plan_items
  where validation_code = p_validation_code and is_active = true
  for update;
  if v_item.id is null then
    return jsonb_build_object('ok', false, 'error',
      'Không tìm thấy mã thẩm định: ' || p_validation_code);
  end if;

  -- Re-resolve after lock acquisition so assignment revocation during a lock
  -- wait still fails closed before any audit setting or row mutation.
  v_allowed := public.vmp_allowed_timeline_fields(auth.uid(),p_validation_code);
  if cardinality(coalesce(v_allowed,'{}'::text[]))=0 then
    return jsonb_build_object(
      'ok',false,
      'code','item_field_forbidden',
      'error','Bạn không có trường tiến độ nào được phép cập nhật',
      'forbidden_fields',to_jsonb(array(
        select key from jsonb_object_keys(v_patch) keys(key) order by key)),
      'allowed_fields','[]'::jsonb
    );
  end if;

  select coalesce(array_agg(key order by key),'{}'::text[])
  into v_bad_fields
  from jsonb_object_keys(v_patch) as keys(key)
  where not (key=any(v_allowed));

  if cardinality(v_bad_fields)>0 then
    return jsonb_build_object(
      'ok',false,
      'code','item_field_forbidden',
      'error','Bạn không được cập nhật các trường: '||
        array_to_string(v_bad_fields,', '),
      'forbidden_fields',to_jsonb(v_bad_fields),
      'allowed_fields',to_jsonb(v_allowed)
    );
  end if;

  if p_expected_version is not null and v_item.version is distinct from p_expected_version then
    return jsonb_build_object(
      'ok', false, 'code', 'version_conflict',
      'error', 'Hạng mục đã được người khác cập nhật trong lúc bạn đang sửa. Vui lòng tải lại dữ liệu và thử lại.',
      'current_version', v_item.version
    );
  end if;

  if coalesce(v_item.item_state, 'active') <> 'active' then
    return jsonb_build_object('ok', false, 'error',
      'Hạng mục đang ở trạng thái nghiệp vụ "' || v_item.item_state ||
      '" — không thể cập nhật tiến độ. Đổi sang "active" trước.');
  end if;

  -- 31/08/2026: "hôm nay" phải là hôm nay THEO GIỜ NHÀ MÁY (Asia/Bangkok),
  -- không phải theo múi giờ của chính Postgres (Supabase chạy UTC). Trước
  -- bản vá này, ca 00:00-07:00 sáng Bangkok không nhập được ngày hôm nay:
  -- client (tính theo Bangkok) gửi lên bị từ chối vì phía DB còn là hôm
  -- qua, thông báo lỗi lại còn in sai ngày. Client đối chiếu:
  -- bangkokCalendarDate()/todayISO() — hai bên giờ cùng một lịch.
  if (v_patch->>'actual_protocol_date')::date > (now() at time zone 'Asia/Bangkok')::date
     or (v_patch->>'actual_validation_date')::date > (now() at time zone 'Asia/Bangkok')::date
     or (v_patch->>'actual_report_date')::date > (now() at time zone 'Asia/Bangkok')::date
     or (v_patch->>'actual_vmp_date')::date > (now() at time zone 'Asia/Bangkok')::date then
    return jsonb_build_object('ok', false, 'code', 'ngay_tuong_lai', 'error',
      'Ngày hoàn thành thực tế không thể nằm ở tương lai (hôm nay là ' ||
      to_char((now() at time zone 'Asia/Bangkok')::date, 'DD/MM/YYYY') ||
      '). ALCOA+ đòi ghi nhận đồng thời với việc làm.');
  end if;

  v_requires_reason := (v_patch->>'status_vmp' = 'completed')
                    or (v_patch->>'status_validation' = 'completed')
                    or (v_patch->>'status_report' = 'completed')
                    or (v_patch->>'status_protocol' = 'completed')
                    or (v_patch ? 'actual_vmp_date')
                    or (v_patch ? 'actual_validation_date')
                    or (v_patch ? 'actual_report_date')
                    or (v_patch ? 'actual_protocol_date');
  if v_requires_reason and (p_reason is null or btrim(p_reason) = '') then
    return jsonb_build_object('ok', false, 'error',
      'Cần nhập LÝ DO khi đánh dấu hoàn thành, sửa hoặc xoá ngày hoàn thành (yêu cầu GMP)');
  end if;

  if v_patch ? 'scheduled_at' then
    v_scheduled_at := public.vmp_parse_scheduled_at(v_patch->>'scheduled_at');
  end if;

  perform set_config('app.audit_source', 'dashboard_rpc', true);
  perform set_config('app.audit_reason', coalesce(p_reason, ''), true);

  update public.vmp_plan_items set
    status_protocol = case when v_patch ? 'status_protocol'
      then (v_patch->>'status_protocol')::phase_status else status_protocol end,
    status_validation = case when v_patch ? 'status_validation'
      then (v_patch->>'status_validation')::phase_status else status_validation end,
    status_report = case when v_patch ? 'status_report'
      then (v_patch->>'status_report')::phase_status else status_report end,
    status_vmp = case when v_patch ? 'status_vmp'
      then (v_patch->>'status_vmp')::phase_status else status_vmp end,
    actual_protocol_date = case when v_patch ? 'actual_protocol_date'
      then (v_patch->>'actual_protocol_date')::date else actual_protocol_date end,
    actual_validation_date = case when v_patch ? 'actual_validation_date'
      then (v_patch->>'actual_validation_date')::date else actual_validation_date end,
    actual_report_date = case when v_patch ? 'actual_report_date'
      then (v_patch->>'actual_report_date')::date else actual_report_date end,
    actual_vmp_date = case when v_patch ? 'actual_vmp_date'
      then (v_patch->>'actual_vmp_date')::date else actual_vmp_date end,
    scheduled_at = case when v_patch ? 'scheduled_at'
      then v_scheduled_at else scheduled_at end,
    scheduled_date = case when v_patch ? 'scheduled_at'
      then (v_scheduled_at at time zone 'Asia/Bangkok')::date else scheduled_date end,
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = now()
  where validation_code = p_validation_code;

  if false and p_sheet_patch is not null and p_sheet_patch <> '{}'::jsonb then
    insert into public.sheet_sync_outbox (validation_code, sheet_patch, status, next_attempt_at)
    values (p_validation_code, p_sheet_patch, 'pending', now() + interval '30 seconds')
    on conflict (validation_code) where status = 'pending'
    do update set sheet_patch = sheet_sync_outbox.sheet_patch || excluded.sheet_patch,
                  next_attempt_at = now() + interval '30 seconds',
                  updated_at = now()
    returning id into v_outbox_id;
  end if;

  return jsonb_build_object(
    'ok', true, 'validation_code', p_validation_code,
    'msg', 'Đã cập nhật thành công', 'reason_logged', v_requires_reason,
    'outbox_id', v_outbox_id, 'version', v_item.version + 1
  );
exception when others then
  raise log 'rpc_update_progress lỗi (code=%, sqlstate=%): %',
    p_validation_code, sqlstate, sqlerrm;
  begin
    insert into public.data_quality_issues (
      plan_item_id, object_code, issue_type, severity, message, detected_at
    ) values (
      (select id from public.vmp_plan_items where validation_code = p_validation_code limit 1),
      null, 'rpc_error', 'error',
      'rpc_update_progress(' || p_validation_code || '): ' || sqlerrm || ' [sqlstate=' || sqlstate || ']',
      now()
    );
  exception when others then null;
  end;
  return jsonb_build_object('ok', false, 'error', sqlerrm, 'sqlstate', sqlstate);
end;
$function$;

-- ---------- POSTCONDITION ----------
do $postflight$
declare
  v_def text;
  v_marker constant text := $marker$(now() at time zone 'Asia/Bangkok')::date$marker$;
begin
  select pg_get_functiondef(
    'public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)'::regprocedure)
  into v_def;
  if position('current_date' in v_def) > 0 then
    raise exception 'POSTCONDITION FAILED: impl vẫn còn tham chiếu ngày-theo-múi-DB';
  end if;
  if (length(v_def) - length(replace(v_def, v_marker, ''))) / length(v_marker) <> 5 then
    raise exception 'POSTCONDITION FAILED: phải có đúng 5 chỗ dùng lịch Bangkok (4 so sánh + 1 to_char)';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rpc_update_progress__assigned_impl_20260827'
      and p.prosecdef
  ) then
    raise exception 'POSTCONDITION FAILED: impl mất security definer';
  end if;
end
$postflight$;

commit;

-- Sau COMMIT (kết nối bất kỳ): notify pgrst, 'reload schema';

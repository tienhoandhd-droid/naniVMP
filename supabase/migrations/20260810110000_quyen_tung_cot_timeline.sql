/* Quyền ngoại lệ theo từng hạng mục và giữ đủ ngày giờ lịch thẩm định. */

create or replace function public.vmp_parse_scheduled_at(p_value text)
returns timestamptz
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := nullif(btrim(p_value), '');
  m text[];
begin
  if v is null then
    return null;
  end if;

  m := regexp_match(v, '^(\d{1,2})/(\d{1,2})/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$');
  if m is not null then
    return make_timestamptz(
      m[3]::integer, m[2]::integer, m[1]::integer,
      coalesce(m[4], '0')::integer, coalesce(m[5], '0')::integer,
      coalesce(m[6], '0')::double precision, 'Asia/Bangkok'
    );
  end if;

  if v ~ '^\d{4}-\d{2}-\d{2}$' then
    return v::timestamp at time zone 'Asia/Bangkok';
  end if;
  if v ~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$' then
    return replace(v, 'T', ' ')::timestamp at time zone 'Asia/Bangkok';
  end if;

  return v::timestamptz;
exception when others then
  raise exception 'Lịch thẩm định không đúng định dạng ngày giờ: %', p_value;
end;
$$;

comment on function public.vmp_parse_scheduled_at(text) is
  'Đọc dd/mm/yyyy hh:mm:ss hoặc ISO; giá trị không có múi giờ được hiểu theo Asia/Bangkok.';

create or replace function public.rpc_update_progress(
  p_validation_code text,
  p_patch jsonb,
  p_reason text default null,
  p_sheet_patch jsonb default null,
  p_expected_version integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item vmp_plan_items%rowtype;
  v_role user_role;
  v_user_dept text;
  v_item_dept text;
  v_requires_reason boolean := false;
  v_outbox_id bigint := null;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_mode text := public.item_permissions_mode();
  v_allowed text[] := '{}'::text[];
  v_bad_fields text[] := '{}'::text[];
  v_scheduled_at timestamptz;
begin
  if jsonb_typeof(v_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'Patch phải là một object JSON');
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

  select * into v_item from public.vmp_plan_items
  where validation_code = p_validation_code and is_active = true;
  if v_item.id is null then
    return jsonb_build_object('ok', false, 'error',
      'Không tìm thấy mã thẩm định: ' || p_validation_code);
  end if;

  if p_expected_version is not null and v_item.version is distinct from p_expected_version then
    return jsonb_build_object(
      'ok', false, 'code', 'version_conflict',
      'error', 'Hạng mục đã được người khác cập nhật trong lúc bạn đang sửa. Vui lòng tải lại dữ liệu và thử lại.',
      'current_version', v_item.version
    );
  end if;

  if v_mode = 'enforced' then
    v_allowed := public.vmp_allowed_timeline_fields(auth.uid(), p_validation_code);
    select coalesce(array_agg(key order by key), '{}'::text[])
    into v_bad_fields
    from jsonb_object_keys(v_patch) as keys(key)
    where not (key = any(v_allowed));

    if cardinality(v_bad_fields) > 0 then
      return jsonb_build_object(
        'ok', false,
        'code', 'item_field_forbidden',
        'error', 'Bạn không được cập nhật các trường: ' || array_to_string(v_bad_fields, ', '),
        'forbidden_fields', to_jsonb(v_bad_fields),
        'allowed_fields', to_jsonb(v_allowed)
      );
    end if;
  else
    -- Preview chỉ tính và hiển thị quyền mới; luật đang chạy vẫn giữ nguyên.
    if public.muc_quyen('update_progress', v_role::text) = 'khong' then
      return jsonb_build_object('ok', false, 'error', 'Viewer không có quyền cập nhật');
    end if;
    v_item_dept := public.ly_do_khong_sua_duoc(p_validation_code, auth.uid());
    if v_item_dept <> '' then
      return jsonb_build_object('ok', false, 'error', v_item_dept);
    end if;
  end if;

  if coalesce(v_item.item_state, 'active') <> 'active' then
    return jsonb_build_object('ok', false, 'error',
      'Hạng mục đang ở trạng thái nghiệp vụ "' || v_item.item_state ||
      '" — không thể cập nhật tiến độ. Đổi sang "active" trước.');
  end if;

  if (v_patch->>'actual_protocol_date')::date > current_date
     or (v_patch->>'actual_validation_date')::date > current_date
     or (v_patch->>'actual_report_date')::date > current_date
     or (v_patch->>'actual_vmp_date')::date > current_date then
    return jsonb_build_object('ok', false, 'code', 'ngay_tuong_lai', 'error',
      'Ngày hoàn thành thực tế không thể nằm ở tương lai (hôm nay là ' ||
      to_char(current_date, 'DD/MM/YYYY') ||
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
$$;

revoke all on function public.vmp_parse_scheduled_at(text) from public, anon;
revoke all on function public.rpc_update_progress(text,jsonb,text,jsonb,integer) from public, anon;
grant execute on function public.vmp_parse_scheduled_at(text) to authenticated, service_role;
grant execute on function public.rpc_update_progress(text,jsonb,text,jsonb,integer) to authenticated, service_role;


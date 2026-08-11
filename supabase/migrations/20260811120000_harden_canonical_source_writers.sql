/* Harden the two remaining source writers after the forward repair.
 * This migration changes function definitions and ACLs only. It must not
 * mutate business rows or change item-permission mode.
 */

do $guard$
begin
  if to_regprocedure('public.item_permissions_mode()') is null
      or to_regprocedure('public.vmp_manager_principal(uuid)') is null
      or to_regprocedure(
        'public.rpc_set_item_performer_by_id(text,uuid,text)'
      ) is null
      or to_regprocedure(
        'public.rpc_upsert_source_object(text,text,jsonb)'
      ) is null
      or to_regprocedure(
        'public.vmp_upsert_source_object_before_person_id(text,text,jsonb)'
      ) is null
      or to_regprocedure('public.vmp_visible_plan_items()') is null
      or to_regclass('public.vmp_performers') is null
      or to_regclass('public.vmp_source_objects') is null
      or to_regclass('public.vmp_plan_items') is null
      or to_regclass('public.audit_logs') is null then
    raise exception
      'CANONICAL_SOURCE_WRITER_UNSUPPORTED_INPUT: thiếu helper, writer hoặc bảng bắt buộc';
  end if;
  if public.item_permissions_mode() is distinct from 'preview' then
    raise exception
      'CANONICAL_SOURCE_WRITER_UNSUPPORTED_MODE: chỉ chạy khi mode=preview';
  end if;
end
$guard$;

/* The public person-ID wrapper already authorizes before delegating here.
 * Keep the predecessor fail-closed as defense in depth, and make its existing
 * service-role grant contract reachable through the public wrapper.
 */
create or replace function public.vmp_upsert_source_object_before_person_id(
  p_object_kind text, p_object_code text, p_patch jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_principal_kind text;
  v_id uuid;
  v_code text := nullif(btrim(p_object_code), '');
  v_kind text := nullif(btrim(p_object_kind), '');
  v_allowed constant text[] := array[
    'object_name', 'department', 'area_code', 'line', 'status', 'show_flag',
    'validate_flag', 'validate_reason', 'frequency_months', 'report_class',
    'workdays', 'critical_point', 'first_month', 'year_ref', 'note', 'is_active',
    'owner_name', 'support_name', 'work_group',
    'complexity_score', 'quality_impact_score', 'criticality_score'
  ];
  v_bad text[];
  v_touch_score boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    select principal.principal_kind into v_principal_kind
    from public.vmp_manager_principal(auth.uid()) principal;
    if v_principal_kind is null then
      return jsonb_build_object(
        'ok', false, 'error', 'Không xác định được người dùng'
      );
    end if;
    if v_principal_kind not in ('admin', 'qa_manager') then
      return jsonb_build_object(
        'ok', false,
        'error', 'Chỉ admin hoặc QA được thêm/sửa danh mục nguồn'
      );
    end if;
  end if;

  if v_code is null or v_kind is null then
    return jsonb_build_object(
      'ok', false, 'error', 'Thiếu mã hoặc loại đối tượng'
    );
  end if;
  if v_kind not in (
    'Thiết bị', 'Quy trình', 'Kho', 'Hệ thống phụ trợ', 'Vận chuyển'
  ) then
    return jsonb_build_object(
      'ok', false, 'error', 'Loại đối tượng không hợp lệ: ' || v_kind
    );
  end if;

  select array_agg(key) into v_bad
  from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) key
  where key <> all (v_allowed);
  if v_bad is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Trường không được phép sửa: ' || array_to_string(v_bad, ', ')
    );
  end if;

  v_touch_score := p_patch ?| array[
    'complexity_score', 'quality_impact_score', 'criticality_score'
  ];

  insert into public.vmp_source_objects (
    object_kind, object_code, source_tab, source_row, edited_on_web, updated_by
  ) values (
    v_kind, v_code, 'web', 0, true, auth.uid()
  )
  on conflict (object_kind, object_code) do update
  set edited_on_web = true, updated_by = auth.uid()
  returning id into v_id;

  update public.vmp_source_objects object
  set object_name = coalesce(p_patch->>'object_name', object.object_name),
      department = coalesce(p_patch->>'department', object.department),
      area_code = coalesce(p_patch->>'area_code', object.area_code),
      line = coalesce(p_patch->>'line', object.line),
      status = coalesce(p_patch->>'status', object.status),
      show_flag = coalesce(p_patch->>'show_flag', object.show_flag),
      validate_flag = coalesce(
        lower(p_patch->>'validate_flag'), object.validate_flag
      ),
      validate_reason = coalesce(
        p_patch->>'validate_reason', object.validate_reason
      ),
      report_class = coalesce(p_patch->>'report_class', object.report_class),
      critical_point = coalesce(
        p_patch->>'critical_point', object.critical_point
      ),
      note = coalesce(p_patch->>'note', object.note),
      owner_name = coalesce(p_patch->>'owner_name', object.owner_name),
      support_name = coalesce(p_patch->>'support_name', object.support_name),
      work_group = coalesce(p_patch->>'work_group', object.work_group),
      frequency_months = coalesce(
        (p_patch->>'frequency_months')::integer, object.frequency_months
      ),
      workdays = coalesce((p_patch->>'workdays')::integer, object.workdays),
      first_month = coalesce(
        (p_patch->>'first_month')::integer, object.first_month
      ),
      year_ref = coalesce((p_patch->>'year_ref')::integer, object.year_ref),
      complexity_score = coalesce(
        (p_patch->>'complexity_score')::integer, object.complexity_score
      ),
      quality_impact_score = coalesce(
        (p_patch->>'quality_impact_score')::integer,
        object.quality_impact_score
      ),
      criticality_score = coalesce(
        (p_patch->>'criticality_score')::integer, object.criticality_score
      ),
      criticality_source = case
        when v_touch_score then 'manual' else object.criticality_source
      end,
      is_active = coalesce(
        (p_patch->>'is_active')::boolean, object.is_active
      )
  where object.id = v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'object_code', v_code,
    'msg', case
      when v_touch_score then
        'Đã lưu — điểm trọng yếu chuyển sang ĐÃ DUYỆT, không bị chấm lại đè'
      else 'Đã lưu danh mục'
    end
  );
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end
$fn$;

create or replace function public.rpc_set_item_performer_by_id(
  p_validation_code text, p_person_id uuid, p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_principal_kind text;
  v_object_code text;
  v_person public.vmp_performers%rowtype;
  v_name text;
  v_items integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    select principal.principal_kind into v_principal_kind
    from public.vmp_manager_principal(auth.uid()) principal;
    if v_principal_kind is null
        or v_principal_kind not in ('admin', 'qa_manager') then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'FORBIDDEN',
        'error', 'Chỉ Admin hoặc QA được phân công người thực hiện'
      );
    end if;
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'REASON_REQUIRED',
      'error', 'Bắt buộc nhập lý do phân công'
    );
  end if;
  select item.object_code into v_object_code
  from public.vmp_visible_plan_items() item
  where item.validation_code = p_validation_code and item.is_active;
  if not found then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'ITEM_NOT_FOUND',
      'error', 'Không tìm thấy mã thẩm định'
    );
  end if;
  if p_person_id is not null then
    select * into v_person
    from public.vmp_performers
    where id = p_person_id and is_active;
    if not found then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'PERSON_NOT_ACTIVE',
        'error', 'Người được chọn không tồn tại hoặc đã ngừng hoạt động'
      );
    end if;
    if v_principal_kind = 'qa_manager'
        and v_person.department is distinct from 'qa' then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'PERSON_OUT_OF_SCOPE',
        'error', 'QA chỉ được chọn người trong bộ phận QA'
      );
    end if;
    v_name := v_person.performer_name;
  end if;

  perform set_config('app.audit_source', 'dashboard_rpc', true);
  perform set_config('app.audit_reason', btrim(p_reason), true);
  update public.vmp_source_objects
  set owner_person_id = p_person_id,
      owner_name = v_name,
      updated_by = auth.uid()
  where object_code = v_object_code;
  update public.vmp_plan_items
  set owner_person_id = p_person_id,
      owner_name = v_name,
      updated_by = auth.uid(),
      updated_at = now()
  where object_code = v_object_code and is_active;
  get diagnostics v_items = row_count;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, new_data, change_reason,
    source, changed_fields, validation_code
  ) values (
    auth.uid(), 'UPDATE', 'vmp_source_objects', v_object_code,
    jsonb_build_object('owner_person_id', p_person_id, 'owner_name', v_name),
    btrim(p_reason), 'dashboard_rpc', array['owner_person_id', 'owner_name'],
    p_validation_code
  );
  return jsonb_build_object(
    'ok', true,
    'object_code', v_object_code,
    'person_id', p_person_id,
    'performer_name', v_name,
    'email', v_person.email,
    'items', v_items
  );
exception when others then
  return jsonb_build_object(
    'ok', false,
    'error_code', 'ASSIGNMENT_FAILED',
    'error', sqlerrm
  );
end
$fn$;

create or replace function public.rpc_upsert_source_object(
  p_object_kind text, p_object_code text, p_patch jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_principal_kind text;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_owner public.vmp_performers%rowtype;
  v_support public.vmp_performers%rowtype;
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    select principal.principal_kind into v_principal_kind
    from public.vmp_manager_principal(auth.uid()) principal;
    if v_principal_kind is null
        or v_principal_kind not in ('admin', 'qa_manager') then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'FORBIDDEN',
        'error', 'Chỉ admin hoặc QA được thêm/sửa danh mục nguồn'
      );
    end if;
  end if;

  if (v_patch ? 'owner_name' and not (v_patch ? 'owner_person_id'))
      or (v_patch ? 'support_name' and not (v_patch ? 'support_person_id')) then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'PERSON_ID_REQUIRED',
      'error', 'QA phụ trách/người hỗ trợ phải được chọn bằng person_id'
    );
  end if;

  if v_patch ? 'owner_person_id'
      and nullif(v_patch->>'owner_person_id', '') is null then
    v_patch := v_patch || jsonb_build_object('owner_name', null);
  end if;
  if v_patch ? 'support_person_id'
      and nullif(v_patch->>'support_person_id', '') is null then
    v_patch := v_patch || jsonb_build_object('support_name', null);
  end if;

  if v_patch ? 'owner_person_id'
      and nullif(v_patch->>'owner_person_id', '') is not null then
    select * into v_owner
    from public.vmp_performers
    where id = (v_patch->>'owner_person_id')::uuid and is_active;
    if not found then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'PERSON_NOT_ACTIVE',
        'error', 'QA phụ trách không tồn tại hoặc đã ngừng hoạt động'
      );
    end if;
    if v_principal_kind = 'qa_manager'
        and v_owner.department is distinct from 'qa' then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'PERSON_OUT_OF_SCOPE',
        'error', 'QA manager chỉ được chọn người thuộc bộ phận QA'
      );
    end if;
    v_patch := v_patch || jsonb_build_object(
      'owner_name', v_owner.performer_name
    );
  end if;
  if v_patch ? 'support_person_id'
      and nullif(v_patch->>'support_person_id', '') is not null then
    select * into v_support
    from public.vmp_performers
    where id = (v_patch->>'support_person_id')::uuid and is_active;
    if not found then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'PERSON_NOT_ACTIVE',
        'error', 'Người hỗ trợ không tồn tại hoặc đã ngừng hoạt động'
      );
    end if;
    if v_principal_kind = 'qa_manager'
        and v_support.department is distinct from 'qa' then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'PERSON_OUT_OF_SCOPE',
        'error', 'QA manager chỉ được chọn người thuộc bộ phận QA'
      );
    end if;
    v_patch := v_patch || jsonb_build_object(
      'support_name', v_support.performer_name
    );
  end if;

  v_result := public.vmp_upsert_source_object_before_person_id(
    p_object_kind,
    p_object_code,
    v_patch - 'owner_person_id' - 'support_person_id'
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    return v_result;
  end if;

  update public.vmp_source_objects source
  set owner_person_id = case
        when v_patch ? 'owner_person_id'
          then nullif(v_patch->>'owner_person_id', '')::uuid
        else source.owner_person_id
      end,
      owner_name = case
        when v_patch ? 'owner_person_id'
          then nullif(v_patch->>'owner_name', '')
        else source.owner_name
      end,
      support_person_id = case
        when v_patch ? 'support_person_id'
          then nullif(v_patch->>'support_person_id', '')::uuid
        else source.support_person_id
      end,
      support_name = case
        when v_patch ? 'support_person_id'
          then nullif(v_patch->>'support_name', '')
        else source.support_name
      end
  where source.id = (v_result->>'id')::uuid;

  update public.vmp_plan_items item
  set owner_person_id = case
        when v_patch ? 'owner_person_id'
          then nullif(v_patch->>'owner_person_id', '')::uuid
        else item.owner_person_id
      end,
      owner_name = case
        when v_patch ? 'owner_person_id'
          then nullif(v_patch->>'owner_name', '')
        else item.owner_name
      end,
      support_person_id = case
        when v_patch ? 'support_person_id'
          then nullif(v_patch->>'support_person_id', '')::uuid
        else item.support_person_id
      end,
      secondary_owner = case
        when v_patch ? 'support_person_id'
          then nullif(v_patch->>'support_name', '')
        else item.secondary_owner
      end,
      updated_by = auth.uid(),
      updated_at = now()
  where item.object_code = p_object_code and item.is_active;
  return v_result;
exception when invalid_text_representation then
  return jsonb_build_object(
    'ok', false,
    'error_code', 'INVALID_PERSON_ID',
    'error', 'person_id không đúng định dạng UUID'
  );
end
$fn$;

revoke all on function public.vmp_upsert_source_object_before_person_id(
  text, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.rpc_set_item_performer_by_id(text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.rpc_upsert_source_object(text, text, jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.rpc_set_item_performer_by_id(text, uuid, text)
  to authenticated, service_role;
grant execute on function public.rpc_upsert_source_object(text, text, jsonb)
  to authenticated, service_role;

do $postflight$
declare
  v_set_writer regprocedure :=
    'public.rpc_set_item_performer_by_id(text,uuid,text)'::regprocedure;
  v_source_writer regprocedure :=
    'public.rpc_upsert_source_object(text,text,jsonb)'::regprocedure;
  v_predecessor regprocedure :=
    'public.vmp_upsert_source_object_before_person_id(text,text,jsonb)'::regprocedure;
  v_principal_helper regprocedure :=
    'public.vmp_manager_principal(uuid)'::regprocedure;
  v_set_definition text;
  v_source_definition text;
  v_predecessor_definition text;
begin
  if public.item_permissions_mode() is distinct from 'preview' then
    raise exception 'Canonical source writer migration đã đổi mode';
  end if;
  if (
      select count(*)
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = 'rpc_set_item_performer_by_id'
    ) <> 1 or (
      select count(*)
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = 'rpc_upsert_source_object'
    ) <> 1 then
    raise exception 'Canonical source writer thiếu signature hoặc còn overload';
  end if;

  if exists (
    select 1
    from pg_proc procedure
    where procedure.oid in (
      v_set_writer::oid, v_source_writer::oid, v_predecessor::oid
    ) and (
      not procedure.prosecdef
      or not coalesce(procedure.proconfig, '{}'::text[])
        @> array['search_path=public, pg_temp']
    )
  ) then
    raise exception 'Canonical source writer thiếu SECURITY DEFINER/search_path';
  end if;
  if exists (
    select 1
    from pg_proc procedure
    where procedure.oid in (
      v_set_writer::oid, v_source_writer::oid, v_predecessor::oid
    )
      and has_function_privilege(
        procedure.proowner, v_principal_helper::oid, 'EXECUTE'
      ) is distinct from true
  ) then
    raise exception 'Source writer owner không thể EXECUTE canonical principal';
  end if;

  if has_function_privilege(
      'anon', v_set_writer, 'EXECUTE'
    ) or has_function_privilege(
      'anon', v_source_writer, 'EXECUTE'
    ) or not has_function_privilege(
      'authenticated', v_set_writer, 'EXECUTE'
    ) or not has_function_privilege(
      'authenticated', v_source_writer, 'EXECUTE'
    ) or not has_function_privilege(
      'service_role', v_set_writer, 'EXECUTE'
    ) or not has_function_privilege(
      'service_role', v_source_writer, 'EXECUTE'
    ) or has_function_privilege(
      'anon', v_predecessor, 'EXECUTE'
    ) or has_function_privilege(
      'authenticated', v_predecessor, 'EXECUTE'
    ) or has_function_privilege(
      'service_role', v_predecessor, 'EXECUTE'
    ) then
    raise exception 'Canonical source writer ACL không đúng contract runtime';
  end if;

  if exists (
    select 1
    from pg_proc procedure
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) privilege
    where procedure.oid in (v_set_writer::oid, v_source_writer::oid)
      and privilege.privilege_type = 'EXECUTE'
      and privilege.grantee not in (
        procedure.proowner,
        'authenticated'::regrole::oid,
        'service_role'::regrole::oid
      )
  ) then
    raise exception 'Canonical source writer còn EXECUTE ngoài allowlist';
  end if;
  if exists (
    select 1
    from pg_proc procedure
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) privilege
    where procedure.oid = v_predecessor::oid
      and privilege.privilege_type = 'EXECUTE'
      and privilege.grantee <> procedure.proowner
  ) then
    raise exception 'Source predecessor còn EXECUTE ngoài owner';
  end if;
  if (
      select procedure.proowner
      from pg_proc procedure
      where procedure.oid = v_source_writer::oid
    ) is distinct from (
      select procedure.proowner
      from pg_proc procedure
      where procedure.oid = v_predecessor::oid
    ) then
    raise exception 'Source writer và predecessor khác owner, không thể delegate an toàn';
  end if;

  select pg_get_functiondef(v_set_writer) into v_set_definition;
  select pg_get_functiondef(v_source_writer) into v_source_definition;
  select pg_get_functiondef(v_predecessor) into v_predecessor_definition;
  if position(
      'vmp_manager_principal(auth.uid())' in v_set_definition
    ) = 0 or position(
      'vmp_manager_principal(auth.uid())' in v_source_definition
    ) = 0 or position(
      'vmp_manager_principal(auth.uid())' in v_predecessor_definition
    ) = 0
      or position('auth.role()' in v_set_definition) = 0
      or position('service_role' in v_set_definition) = 0
      or position('auth.role()' in v_source_definition) = 0
      or position('service_role' in v_source_definition) = 0
      or position('auth.role()' in v_predecessor_definition) = 0
      or position('service_role' in v_predecessor_definition) = 0
      or position('from public.profiles' in lower(v_set_definition)) > 0
      or position('from public.profiles' in lower(v_source_definition)) > 0
      or position('from public.profiles' in lower(v_predecessor_definition)) > 0 then
    raise exception 'Canonical source writer không dùng principal/service branch chuẩn';
  end if;
end
$postflight$;

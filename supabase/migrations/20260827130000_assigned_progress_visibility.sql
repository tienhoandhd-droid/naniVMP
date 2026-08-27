-- Enforce assignment-derived field rights only on the Update Progress surface.
-- The global item permission mode and the existing Source Data behavior stay fixed.

begin;

do $precondition$
declare
  v_required text;
  v_new_batch oid := to_regprocedure(
    'public.rpc_my_editable_progress_rights()');
  v_new_writer oid := to_regprocedure(
    'public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)');
  v_public_writer oid := to_regprocedure(
    'public.rpc_update_progress(text,jsonb,text,jsonb,integer)');
  v_column_hash text;
  v_constraint_hash text;
  v_enum_hash text;
begin
  foreach v_required in array array[
    'public.vmp_is_active_session(uuid)',
    'public.vmp_session_denial()',
    'public.vmp_item_rights(uuid,text)',
    'public.vmp_allowed_timeline_fields(uuid,text)',
    'public.vmp_parse_scheduled_at(text)',
    'public.rpc_update_progress(text,jsonb,text,jsonb,integer)',
    'public.rpc_update_progress__five_role_impl_20260824(text,jsonb,text,jsonb,integer)',
    'public.audit_plan_item_changes_v2()',
    'public.vmp_plan_item_row_revision_v2()'
  ] loop
    if to_regprocedure(v_required) is null then
      raise exception using errcode='check_violation',
        message='ASSIGNED_PROGRESS_PRECONDITION_MISSING_FUNCTION '||v_required;
    end if;
  end loop;

  if to_regclass('public.profiles') is null
     or to_regclass('public.vmp_plan_items') is null
     or to_regclass('public.vmp_item_assignments') is null
     or to_regclass('public.audit_logs') is null
     or to_regclass('public.system_config') is null then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_PRECONDITION_MISSING_TABLE';
  end if;

  if (v_new_batch is null) is distinct from (v_new_writer is null) then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_PRECONDITION_PARTIAL_INSTALL';
  end if;

  if exists (
    select 1
    from (values
      ('vmp_is_active_session',1),
      ('vmp_session_denial',0),
      ('vmp_item_rights',2),
      ('vmp_allowed_timeline_fields',2),
      ('vmp_parse_scheduled_at',1),
      ('rpc_update_progress',5),
      ('rpc_update_progress__five_role_impl_20260824',5),
      ('audit_plan_item_changes_v2',0),
      ('vmp_plan_item_row_revision_v2',0)
    ) required(function_name,argument_count)
    left join lateral (
      select count(*) function_count
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid=procedure.pronamespace
      where namespace.nspname='public'
        and procedure.proname=required.function_name
        and procedure.pronargs=required.argument_count
    ) actual on true
    where actual.function_count<>1
  )
     or (select count(*) from pg_proc procedure
         join pg_namespace namespace on namespace.oid=procedure.pronamespace
         where namespace.nspname='public'
           and procedure.proname='rpc_update_progress')<>1
     or (select count(*) from pg_proc procedure
         join pg_namespace namespace on namespace.oid=procedure.pronamespace
         where namespace.nspname='public'
           and procedure.proname='rpc_my_editable_progress_rights')
        <> (case when v_new_batch is null then 0 else 1 end)
     or (select count(*) from pg_proc procedure
         join pg_namespace namespace on namespace.oid=procedure.pronamespace
         where namespace.nspname='public'
           and procedure.proname=
             'rpc_update_progress__assigned_impl_20260827')
        <> (case when v_new_writer is null then 0 else 1 end) then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_PRECONDITION_FUNCTION_OVERLOAD';
  end if;

  if exists (
    select 1
    from (values
      ('public.vmp_is_active_session(uuid)',
       'e52a0cece430ad8b8319819b633fd4fc8aa92bc2d2fac083a33b22f609e1f417',
       'c15c1a154cce836fd7c53553da6b8694837818bd489a7bb5654cfb65bc9b2cd6'),
      ('public.vmp_session_denial()',
       '8ff11d9d103ea62dd1c8786b1aa766bcfe6386bf6d4ec5b3729062c850609ad1',
       '4cf828cdcd9d7121ff65b0ce2042a37468fba5a603a9b7c4da5f7645c7fbe6ab'),
      ('public.vmp_item_rights(uuid,text)',
       '9cfba864d7ea650370d6d76c33e2afcfbf941bb6918a90eeedec77f0513ab0db',
       '3e592bddb22eadedf206c1c5b8856435ffbc31efb97d45be36d3f68bb900f716'),
      ('public.vmp_allowed_timeline_fields(uuid,text)',
       '235d5d2e4ff760a7640e2687be430a8a188a56d380b7cf7b72e6018bc71d9a3c',
       '8d96010d65eb15b3a2167ab9867067d93790ddcb13b3124b9e29e5e0f63f055a'),
      ('public.vmp_parse_scheduled_at(text)',
       'c6f83014c9ec87a599b6bfe46baec7dc06051a4f3e2f3d3475b606f21be40e99',
       '52fb819dfbaf8ea114784ffd755eee45873288a90eeb784ef15f676741f26090'),
      ('public.rpc_update_progress__five_role_impl_20260824(text,jsonb,text,jsonb,integer)',
       '55f7f86442b88a12c39e1f3cb6dd867d0aae0a684db78365bcef673a473e2644',
       'd53c3f00db2b7e3559362d1c0ddd08607a0e188d1050126612ffaa5d6e86b28e'),
      ('public.audit_plan_item_changes_v2()',
       '4f69863a23c5353fda09332a04f7643c58b8d9e0ceb126b52790e4b61162ba4c',
       'c36cf4b44aefe354dd221b3b0015ebdf196b5510450deb2361fdf6b868add9f2'),
      ('public.vmp_plan_item_row_revision_v2()',
       'd00963d1f265c8d7457011cdafc331a9c7aafbb6b86e0bf7c82ce94bda4829c2',
       'd0da34dfda3612bc2a22fe0fadb8b79bfbdf0980821ff0c999fa4af14e704624')
    ) reviewed(signature,definition_hash,metadata_hash)
    join pg_proc procedure on procedure.oid=reviewed.signature::regprocedure
    join pg_roles owner on owner.oid=procedure.proowner
    join pg_language language on language.oid=procedure.prolang
    where encode(extensions.digest(pg_get_functiondef(procedure.oid),'sha256'),'hex')
            is distinct from reviewed.definition_hash
       or encode(extensions.digest(concat_ws('|',owner.rolname,language.lanname,
            procedure.prosecdef::text,procedure.provolatile::text,
            procedure.proparallel::text,procedure.proisstrict::text,
            procedure.proleakproof::text,
            coalesce(array_to_string(procedure.proconfig,','),''),
            coalesce(array_to_string(procedure.proacl,','),''),
            pg_get_function_result(procedure.oid)),'sha256'),'hex')
            is distinct from reviewed.metadata_hash
  ) then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_PRECONDITION_DEPENDENCY_DRIFT';
  end if;

  if v_new_batch is not null and exists (
    select 1
    from (values
      ('public.rpc_my_editable_progress_rights()',
       'a769f237d9f92c52ca9bfb5c5f6511a3b96078dd3015678bc6e78003f7243f6b',
       '2a1ef91d0f29fa4af8e8a31223aea79e81dbf05d2c6c031cc6225d41f1d27492'),
      ('public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)',
       'a669d06b71d453758a2fbc44ef87882870e167afd2c657994268f498b975872d',
       '796e6afd55e5b79a064cf28ea74ff5b0a79589434d67e373b2c529482669d661'),
      ('public.rpc_update_progress(text,jsonb,text,jsonb,integer)',
       '7e36d2360211c68d203e1fc47f8b9ab5794e6a2a88b21c2fea24cefcac6b5f8e',
       '895edcfcd1fc3695a3bed4f873c2089bc1f7c55def39c2dd70d97c53a2524c81')
    ) reviewed(signature,definition_hash,metadata_hash)
    join pg_proc procedure on procedure.oid=reviewed.signature::regprocedure
    join pg_roles owner on owner.oid=procedure.proowner
    join pg_language language on language.oid=procedure.prolang
    where encode(extensions.digest(pg_get_functiondef(procedure.oid),'sha256'),'hex')
            is distinct from reviewed.definition_hash
       or encode(extensions.digest(concat_ws('|',owner.rolname,language.lanname,
            procedure.prosecdef::text,procedure.provolatile::text,
            procedure.proparallel::text,procedure.proisstrict::text,
            procedure.proleakproof::text,
            coalesce(array_to_string(procedure.proconfig,','),''),
            coalesce(array_to_string(procedure.proacl,','),''),
            pg_get_function_result(procedure.oid)),'sha256'),'hex')
            is distinct from reviewed.metadata_hash
  ) then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_PRECONDITION_INSTALLED_FUNCTION_DRIFT';
  end if;

  if pg_get_function_result(v_public_writer) is distinct from 'jsonb'
     or (select owner.rolname from pg_proc procedure
         join pg_roles owner on owner.oid=procedure.proowner
         where procedure.oid=v_public_writer) is distinct from 'postgres'
     or (select language.lanname from pg_proc procedure
         join pg_language language on language.oid=procedure.prolang
         where procedure.oid=v_public_writer) is distinct from 'plpgsql'
     or not (select prosecdef from pg_proc where oid=v_public_writer)
     or (select provolatile from pg_proc where oid=v_public_writer)<>'v'
     or (select proparallel from pg_proc where oid=v_public_writer)<>'u'
     or (select proisstrict from pg_proc where oid=v_public_writer)
     or (select proleakproof from pg_proc where oid=v_public_writer)
     or (select proconfig from pg_proc where oid=v_public_writer)
        is distinct from array['search_path=public, pg_temp']
     or (select proacl from pg_proc where oid=v_public_writer)
        is distinct from array[
          'postgres=X/postgres','service_role=X/postgres',
          'authenticated=X/postgres'
        ]::aclitem[]
     or (v_new_writer is null and encode(extensions.digest(
          pg_get_functiondef(v_public_writer),'sha256'),'hex')
        is distinct from
          'da25f8acbcc5aa3e029e581acb79f210cf1d6c61ab0e8458e4ff89146e75f4a0') then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_PRECONDITION_PUBLIC_WRITER_DRIFT';
  end if;

  for v_required in select * from unnest(array[
    'profiles','vmp_plan_items','vmp_item_assignments','audit_logs','system_config'
  ]) loop
    select encode(extensions.digest(string_agg(concat_ws('|',
             attribute.attnum,attribute.attname,
             format_type(attribute.atttypid,attribute.atttypmod),
             attribute.attnotnull,
             coalesce(pg_get_expr(default_value.adbin,default_value.adrelid),''),
             attribute.attidentity,attribute.attgenerated,
             coalesce(collation_namespace.nspname,''),
             coalesce(column_collation.collname,''),
             coalesce(column_collation.collprovider::text,''),
             coalesce(column_collation.collisdeterministic::text,'')),E'\n'
             order by attribute.attnum),'sha256'),'hex')
    into v_column_hash
    from pg_attribute attribute
    left join pg_attrdef default_value
      on default_value.adrelid=attribute.attrelid
     and default_value.adnum=attribute.attnum
    left join pg_collation column_collation
      on column_collation.oid=attribute.attcollation
    left join pg_namespace collation_namespace
      on collation_namespace.oid=column_collation.collnamespace
    where attribute.attrelid=('public.'||v_required)::regclass
      and attribute.attnum>0 and not attribute.attisdropped;

    if v_column_hash is distinct from (case v_required
      when 'profiles' then
        'fb30416a68491178d95fc331c7bf82098d4918f17e4476e3759626decd4700f2'
      when 'vmp_plan_items' then
        '25e8bc9d04ffb115e23504beb2a0a91d72e581214b4e61ef4a2d41a015d7c56e'
      when 'vmp_item_assignments' then
        '875435ac7d8587b02c38bc97133ae5568b9cc42bfa1dccad7625609f45762687'
      when 'audit_logs' then
        'c2488c36c9041d75e8fb090a7bce4a76741b3c3af4c9a86a60e917c341d45158'
      when 'system_config' then
        'c9762448f29dd9e082e2913bdd867f7303cd2b25cb75fe31dc18413f1d5a17b1'
    end) then
      raise exception using errcode='check_violation',
        message='ASSIGNED_PROGRESS_PRECONDITION_TABLE_SCHEMA_DRIFT '||v_required;
    end if;
  end loop;

  select encode(extensions.digest(string_agg(format('%s|%s|%s',
           constraint_row.conname,constraint_row.contype,
           pg_get_constraintdef(constraint_row.oid)),E'\n'
           order by constraint_row.conname),'sha256'),'hex')
  into v_constraint_hash
  from pg_constraint constraint_row
  where constraint_row.conrelid='public.vmp_item_assignments'::regclass;
  if v_constraint_hash is distinct from
     'f4c89cfbd3e695b9eac72d73dc6fe4658a733d1c12cc1a0776a4b145b6464374' then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_PRECONDITION_ASSIGNMENT_CONSTRAINT_DRIFT';
  end if;

  for v_required in select * from unnest(array['phase_status','user_role']) loop
    select encode(extensions.digest(string_agg(enum_value.enumlabel,E'\n'
             order by enum_value.enumsortorder),'sha256'),'hex')
    into v_enum_hash
    from pg_enum enum_value
    where enum_value.enumtypid=('public.'||v_required)::regtype;
    if v_enum_hash is distinct from (case v_required
      when 'phase_status' then
        'cbace8bb64629968603975af23373acae58b18edd75363596b841da3a8aeb721'
      when 'user_role' then
        'c9573c7469023efd089d2b73a8f9c32435bd3c007d4bed3d25960fb920a10c0f'
    end) then
      raise exception using errcode='check_violation',
        message='ASSIGNED_PROGRESS_PRECONDITION_ENUM_DRIFT '||v_required;
    end if;
  end loop;

  if (select count(*) from public.system_config
      where key='item_permissions_mode')<>1 then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_PRECONDITION_ITEM_MODE_MISSING';
  end if;
  perform set_config('app.assigned_progress_item_mode_before',
    (select value::text from public.system_config
     where key='item_permissions_mode'),true);
end
$precondition$;

create or replace function public.rpc_my_editable_progress_rights()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_rights jsonb;
begin
  if v_uid is null or not public.vmp_is_active_session(v_uid) then
    return public.vmp_session_denial();
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'validation_code',resolved.validation_code,
           'editable_fields',to_jsonb(resolved.editable_fields),
           'view_reason',resolved.view_reason
         ) order by resolved.validation_code),'[]'::jsonb)
  into v_rights
  from (
    select item.validation_code,rights.editable_fields,rights.view_reason
    from public.vmp_plan_items item
    cross join lateral public.vmp_item_rights(v_uid,item.validation_code) rights
    where item.is_active
      and rights.can_view
      and cardinality(coalesce(rights.editable_fields,'{}'::text[]))>0
    order by item.validation_code
  ) resolved;

  return jsonb_build_object('ok',true,'rights',v_rights);
end
$function$;

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

  v_allowed := public.vmp_allowed_timeline_fields(auth.uid(),p_validation_code);
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
$function$;

alter function public.rpc_my_editable_progress_rights() owner to postgres;
alter function public.rpc_my_editable_progress_rights() stable;
alter function public.rpc_my_editable_progress_rights() security definer;
alter function public.rpc_my_editable_progress_rights()
  set search_path=public,pg_temp;
revoke all on function public.rpc_my_editable_progress_rights()
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_my_editable_progress_rights()
  to service_role;
grant execute on function public.rpc_my_editable_progress_rights()
  to authenticated;

alter function public.rpc_update_progress__assigned_impl_20260827(
  text,jsonb,text,jsonb,integer) owner to postgres;
alter function public.rpc_update_progress__assigned_impl_20260827(
  text,jsonb,text,jsonb,integer) volatile;
alter function public.rpc_update_progress__assigned_impl_20260827(
  text,jsonb,text,jsonb,integer) security definer;
alter function public.rpc_update_progress__assigned_impl_20260827(
  text,jsonb,text,jsonb,integer) set search_path=public,pg_temp;
revoke all on function public.rpc_update_progress__assigned_impl_20260827(
  text,jsonb,text,jsonb,integer) from public,anon,authenticated,service_role;

do $failure_injection$
begin
  if current_setting('vmp.assigned_progress_fault',true)='before_wrapper' then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_INJECTED_BEFORE_WRAPPER';
  end if;
end
$failure_injection$;

create or replace function public.rpc_update_progress(
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
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  return public.rpc_update_progress__assigned_impl_20260827(
    p_validation_code,p_patch,p_reason,p_sheet_patch,p_expected_version);
end
$function$;

alter function public.rpc_update_progress(text,jsonb,text,jsonb,integer)
  owner to postgres;
alter function public.rpc_update_progress(text,jsonb,text,jsonb,integer)
  volatile;
alter function public.rpc_update_progress(text,jsonb,text,jsonb,integer)
  security definer;
alter function public.rpc_update_progress(text,jsonb,text,jsonb,integer)
  set search_path=public,pg_temp;
revoke all on function public.rpc_update_progress(text,jsonb,text,jsonb,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_update_progress(text,jsonb,text,jsonb,integer)
  to service_role;
grant execute on function public.rpc_update_progress(text,jsonb,text,jsonb,integer)
  to authenticated;

do $postcondition$
declare
  v_batch oid := 'public.rpc_my_editable_progress_rights()'::regprocedure;
  v_private oid :=
    'public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)'::regprocedure;
  v_public oid :=
    'public.rpc_update_progress(text,jsonb,text,jsonb,integer)'::regprocedure;
begin
  if (select count(*) from pg_proc procedure
      join pg_namespace namespace on namespace.oid=procedure.pronamespace
      where namespace.nspname='public'
        and procedure.proname in ('rpc_my_editable_progress_rights',
          'rpc_update_progress__assigned_impl_20260827','rpc_update_progress'))<>3
     or pg_get_function_result(v_batch)<>'jsonb'
     or pg_get_function_result(v_private)<>'jsonb'
     or pg_get_function_result(v_public)<>'jsonb'
     or (select proconfig from pg_proc where oid=v_batch)
        is distinct from array['search_path=public, pg_temp']
     or (select proconfig from pg_proc where oid=v_private)
        is distinct from array['search_path=public, pg_temp']
     or (select proconfig from pg_proc where oid=v_public)
        is distinct from array['search_path=public, pg_temp']
     or not (select prosecdef and provolatile='s' and proparallel='u'
             and not proisstrict and not proleakproof
             from pg_proc where oid=v_batch)
     or not (select prosecdef and provolatile='v' and proparallel='u'
             and not proisstrict and not proleakproof
             from pg_proc where oid=v_private)
     or not (select prosecdef and provolatile='v' and proparallel='u'
             and not proisstrict and not proleakproof
             from pg_proc where oid=v_public)
     or (select owner.rolname from pg_proc procedure join pg_roles owner
         on owner.oid=procedure.proowner where procedure.oid=v_batch)<>'postgres'
     or (select owner.rolname from pg_proc procedure join pg_roles owner
         on owner.oid=procedure.proowner where procedure.oid=v_private)<>'postgres'
     or (select owner.rolname from pg_proc procedure join pg_roles owner
         on owner.oid=procedure.proowner where procedure.oid=v_public)<>'postgres'
     or (select proacl from pg_proc where oid=v_batch) is distinct from array[
          'postgres=X/postgres','service_role=X/postgres',
          'authenticated=X/postgres']::aclitem[]
     or (select proacl from pg_proc where oid=v_private) is distinct from array[
          'postgres=X/postgres']::aclitem[]
     or (select proacl from pg_proc where oid=v_public) is distinct from array[
          'postgres=X/postgres','service_role=X/postgres',
          'authenticated=X/postgres']::aclitem[]
     or encode(extensions.digest(pg_get_functiondef(v_batch),'sha256'),'hex')
        is distinct from
          'a769f237d9f92c52ca9bfb5c5f6511a3b96078dd3015678bc6e78003f7243f6b'
     or encode(extensions.digest(pg_get_functiondef(v_private),'sha256'),'hex')
        is distinct from
          'a669d06b71d453758a2fbc44ef87882870e167afd2c657994268f498b975872d'
     or encode(extensions.digest(pg_get_functiondef(v_public),'sha256'),'hex')
        is distinct from
          '7e36d2360211c68d203e1fc47f8b9ab5794e6a2a88b21c2fea24cefcac6b5f8e' then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_POSTCONDITION_FUNCTION_CONTRACT';
  end if;

  if has_function_privilege('public',v_batch,'EXECUTE')
     or has_function_privilege('anon',v_batch,'EXECUTE')
     or not has_function_privilege('authenticated',v_batch,'EXECUTE')
     or not has_function_privilege('service_role',v_batch,'EXECUTE')
     or has_function_privilege('public',v_private,'EXECUTE')
     or has_function_privilege('anon',v_private,'EXECUTE')
     or has_function_privilege('authenticated',v_private,'EXECUTE')
     or has_function_privilege('service_role',v_private,'EXECUTE')
     or has_function_privilege('public',v_public,'EXECUTE')
     or has_function_privilege('anon',v_public,'EXECUTE')
     or not has_function_privilege('authenticated',v_public,'EXECUTE')
     or not has_function_privilege('service_role',v_public,'EXECUTE') then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_POSTCONDITION_ACL';
  end if;

  if encode(extensions.digest(pg_get_functiondef(
       'public.rpc_update_progress__five_role_impl_20260824(text,jsonb,text,jsonb,integer)'::regprocedure
     ),'sha256'),'hex') is distinct from
       '55f7f86442b88a12c39e1f3cb6dd867d0aae0a684db78365bcef673a473e2644'
     or (select proacl from pg_proc where oid=
       'public.rpc_update_progress__five_role_impl_20260824(text,jsonb,text,jsonb,integer)'::regprocedure)
       is distinct from array['postgres=X/postgres']::aclitem[] then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_POSTCONDITION_OLD_WRITER_DRIFT';
  end if;

  if current_setting('app.assigned_progress_item_mode_before',true)
       is distinct from (select value::text from public.system_config
                         where key='item_permissions_mode') then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_POSTCONDITION_GLOBAL_MODE_CHANGED';
  end if;
end
$postcondition$;

commit;

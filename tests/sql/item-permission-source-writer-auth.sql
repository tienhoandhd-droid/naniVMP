/*
 * Regression test for the two source/owner writers restored by migration
 * 20260811110000. The caller must wrap this file in one explicit transaction
 * and roll it back; every mutation probe also uses a caught subtransaction so
 * both writers are exercised even when the first authorization assertion fails.
 */
do $test$
declare
  v_admin uuid;
  v_valid_user uuid := gen_random_uuid();
  v_hybrid_user uuid := gen_random_uuid();
  v_valid_person uuid;
  v_hybrid_person uuid;
  v_qa_target uuid;
  v_non_qa_target uuid;
  v_validation_code text;
  v_object_kind text;
  v_object_code text;
  v_valid_email text := 'source-writer-valid-' || replace(v_valid_user::text, '-', '')
    || '@example.test';
  v_hybrid_email text := 'source-writer-hybrid-' || replace(v_hybrid_user::text, '-', '')
    || '@example.test';
  v_result jsonb;
  v_hybrid_set_result jsonb;
  v_hybrid_upsert_result jsonb;
  v_service_set_result jsonb;
  v_service_upsert_result jsonb;
  v_principal_kind text;
  v_source_before jsonb;
  v_source_after jsonb;
  v_plan_before jsonb;
  v_plan_after jsonb;
  v_audit_before bigint;
  v_audit_after bigint;
  v_hybrid_set_mutated boolean := false;
  v_hybrid_upsert_mutated boolean := false;
  v_service_set_mutated boolean := false;
  v_service_upsert_mutated boolean := false;
  v_failures text[] := '{}'::text[];
  v_probe_note text := 'AUTH-PROBE-' || replace(gen_random_uuid()::text, '-', '');
begin
  if public.item_permissions_mode() <> 'preview' then
    raise exception 'SOURCE_WRITER_AUTH_FIXTURE: test chỉ chạy khi mode=preview';
  end if;
  if not has_function_privilege(
      'authenticated',
      'public.rpc_set_item_performer_by_id(text,uuid,text)',
      'EXECUTE'
    ) or not has_function_privilege(
      'authenticated',
      'public.rpc_upsert_source_object(text,text,jsonb)',
      'EXECUTE'
    ) then
    raise exception 'SOURCE_WRITER_AUTH_FIXTURE: authenticated thiếu EXECUTE writer';
  end if;

  select profile.id into v_admin
  from public.profiles profile
  where profile.role::text = 'admin' and coalesce(profile.is_active, true)
  order by profile.created_at, profile.id
  limit 1;

  select item.validation_code, source.object_kind, source.object_code
  into v_validation_code, v_object_kind, v_object_code
  from public.vmp_plan_items item
  join public.vmp_source_objects source
    on source.object_code = item.object_code
  where item.is_active and source.is_active
  order by item.validation_code, source.object_kind, source.id
  limit 1;

  if v_admin is null or v_validation_code is null then
    raise exception 'SOURCE_WRITER_AUTH_FIXTURE: thiếu admin hoặc source/item active';
  end if;

  insert into public.vmp_email_cho_phep(email, ghi_chu)
  values
    (v_valid_email, 'Fixture rollback source-writer auth'),
    (v_hybrid_email, 'Fixture rollback source-writer auth');

  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (
      v_valid_user, 'authenticated', 'authenticated', v_valid_email, '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Source Writer Valid QA Manager"}'::jsonb, now(), now()
    ),
    (
      v_hybrid_user, 'authenticated', 'authenticated', v_hybrid_email, '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Source Writer Hybrid QA Manager"}'::jsonb, now(), now()
    );

  update public.profiles
  set role = 'qa_manager', department = 'qa', is_active = true
  where id in (v_valid_user, v_hybrid_user);

  insert into public.vmp_performers (
    performer_name, email, department, user_id, access_class,
    scope_departments, access_areas, is_active, updated_by
  ) values
    (
      'Source Writer Valid QA Manager', v_valid_email, 'qa', v_valid_user,
      'qa_manager', '{}'::text[], '{}'::text[], true, v_admin
    ),
    (
      'Source Writer Hybrid QA Manager', v_hybrid_email, 'xsx', v_hybrid_user,
      'equipment_manager', array['xsx'], array['*'], true, v_admin
    );

  select person.id into v_valid_person
  from public.vmp_performers person where person.user_id = v_valid_user;
  select person.id into v_hybrid_person
  from public.vmp_performers person where person.user_id = v_hybrid_user;

  insert into public.vmp_performers (
    performer_name, department, access_class, scope_departments, access_areas,
    is_active, updated_by
  ) values
    (
      'Source Writer QA Target', 'qa', 'qa_progress_editor',
      '{}'::text[], '{}'::text[], true, v_admin
    )
  returning id into v_qa_target;

  insert into public.vmp_performers (
    performer_name, department, access_class, scope_departments, access_areas,
    is_active, updated_by
  ) values
    (
      'Source Writer Non QA Target', 'xsx', 'equipment_scheduler',
      array['xsx'], array['*'], true, v_admin
    )
  returning id into v_non_qa_target;

  select principal.principal_kind into v_principal_kind
  from public.vmp_manager_principal(v_valid_user) principal;
  if v_principal_kind is distinct from 'qa_manager' then
    raise exception 'SOURCE_WRITER_AUTH_FIXTURE: principal QA manager hợp lệ bị sai: %',
      v_principal_kind;
  end if;
  select principal.principal_kind into v_principal_kind
  from public.vmp_manager_principal(v_hybrid_user) principal;
  if v_principal_kind is not null then
    raise exception 'SOURCE_WRITER_AUTH_FIXTURE: principal hybrid phải là null, nhận %',
      v_principal_kind;
  end if;

  select coalesce(jsonb_agg(to_jsonb(source) order by source.id), '[]'::jsonb)
  into v_source_before
  from public.vmp_source_objects source
  where source.object_code = v_object_code;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.validation_code), '[]'::jsonb)
  into v_plan_before
  from public.vmp_plan_items item
  where item.object_code = v_object_code;
  select count(*) into v_audit_before from public.audit_logs;

  /* Canonical QA manager remains allowed for QA targets. Each probe is rolled
   * back locally so later cases see the identical source/plan snapshot. */
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_valid_user::text, 'role', 'authenticated')::text,
    true
  );
  begin
    v_result := public.rpc_set_item_performer_by_id(
      v_validation_code, v_qa_target, 'Canonical QA manager writer probe'
    );
    if coalesce((v_result->>'ok')::boolean, false) is not true then
      v_failures := array_append(
        v_failures, 'canonical rpc_set_item_performer_by_id phải thành công: ' || v_result::text
      );
    end if;
    raise exception using errcode = 'PT401', message = 'rollback canonical performer probe';
  exception when sqlstate 'PT401' then null;
  end;

  begin
    v_result := public.rpc_upsert_source_object(
      v_object_kind, v_object_code, jsonb_build_object('note', v_probe_note)
    );
    if coalesce((v_result->>'ok')::boolean, false) is not true then
      v_failures := array_append(
        v_failures, 'canonical rpc_upsert_source_object phải thành công: ' || v_result::text
      );
    end if;
    raise exception using errcode = 'PT401', message = 'rollback canonical source probe';
  exception when sqlstate 'PT401' then null;
  end;

  v_result := public.rpc_set_item_performer_by_id(
    v_validation_code, v_non_qa_target, 'Canonical QA manager out-of-scope probe'
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false
      or v_result->>'error_code' is distinct from 'PERSON_OUT_OF_SCOPE' then
    v_failures := array_append(
      v_failures, 'canonical QA manager phải bị chặn target ngoài QA: ' || v_result::text
    );
  end if;
  v_result := public.rpc_upsert_source_object(
    v_object_kind, v_object_code,
    jsonb_build_object('owner_person_id', v_non_qa_target)
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false
      or v_result->>'error_code' is distinct from 'PERSON_OUT_OF_SCOPE' then
    v_failures := array_append(
      v_failures, 'canonical source writer phải chặn owner ngoài QA: ' || v_result::text
    );
  end if;

  /* Hybrid profile.role=qa_manager is deliberately inconsistent with its
   * linked equipment_manager performer. Canonical principal is null, so both
   * direct writers must reject before touching source, plan, or audit rows. */
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_hybrid_user::text, 'role', 'authenticated')::text,
    true
  );
  begin
    v_hybrid_set_result := public.rpc_set_item_performer_by_id(
      v_validation_code, v_qa_target, 'Hybrid manager must be forbidden'
    );
    select coalesce(jsonb_agg(to_jsonb(source) order by source.id), '[]'::jsonb)
    into v_source_after
    from public.vmp_source_objects source
    where source.object_code = v_object_code;
    select coalesce(jsonb_agg(to_jsonb(item) order by item.validation_code), '[]'::jsonb)
    into v_plan_after
    from public.vmp_plan_items item
    where item.object_code = v_object_code;
    select count(*) into v_audit_after from public.audit_logs;
    v_hybrid_set_mutated := v_source_after is distinct from v_source_before
      or v_plan_after is distinct from v_plan_before
      or v_audit_after is distinct from v_audit_before;
    raise exception using errcode = 'PT401', message = 'rollback hybrid performer probe';
  exception when sqlstate 'PT401' then null;
  end;

  begin
    v_hybrid_upsert_result := public.rpc_upsert_source_object(
      v_object_kind, v_object_code, jsonb_build_object('note', v_probe_note)
    );
    select coalesce(jsonb_agg(to_jsonb(source) order by source.id), '[]'::jsonb)
    into v_source_after
    from public.vmp_source_objects source
    where source.object_code = v_object_code;
    select coalesce(jsonb_agg(to_jsonb(item) order by item.validation_code), '[]'::jsonb)
    into v_plan_after
    from public.vmp_plan_items item
    where item.object_code = v_object_code;
    select count(*) into v_audit_after from public.audit_logs;
    v_hybrid_upsert_mutated := v_source_after is distinct from v_source_before
      or v_plan_after is distinct from v_plan_before
      or v_audit_after is distinct from v_audit_before;
    raise exception using errcode = 'PT401', message = 'rollback hybrid source probe';
  exception when sqlstate 'PT401' then null;
  end;

  if coalesce((v_hybrid_set_result->>'ok')::boolean, true) is not false
      or v_hybrid_set_result->>'error_code' is distinct from 'FORBIDDEN' then
    v_failures := array_append(
      v_failures,
      'HYBRID_SET_WRITER_MUST_BE_FORBIDDEN result=' || coalesce(v_hybrid_set_result::text, 'null')
    );
  end if;
  if v_hybrid_set_mutated then
    v_failures := array_append(v_failures, 'HYBRID_SET_WRITER_MUTATED_ROWS');
  end if;
  if coalesce((v_hybrid_upsert_result->>'ok')::boolean, true) is not false
      or v_hybrid_upsert_result->>'error_code' is distinct from 'FORBIDDEN' then
    v_failures := array_append(
      v_failures,
      'HYBRID_SOURCE_WRITER_MUST_BE_FORBIDDEN result='
        || coalesce(v_hybrid_upsert_result::text, 'null')
    );
  end if;
  if v_hybrid_upsert_mutated then
    v_failures := array_append(v_failures, 'HYBRID_SOURCE_WRITER_MUTATED_ROWS');
  end if;

  /* The repaired migration grants both writers to service_role. Exercise that
   * stated contract explicitly rather than leaving a grant that always returns
   * FORBIDDEN. Mutations remain inside caught subtransactions. */
  perform set_config(
    'request.jwt.claims', json_build_object('role', 'service_role')::text, true
  );
  begin
    v_service_set_result := public.rpc_set_item_performer_by_id(
      v_validation_code, v_qa_target, 'Service role writer probe'
    );
    select coalesce(jsonb_agg(to_jsonb(source) order by source.id), '[]'::jsonb)
    into v_source_after
    from public.vmp_source_objects source
    where source.object_code = v_object_code;
    select coalesce(jsonb_agg(to_jsonb(item) order by item.validation_code), '[]'::jsonb)
    into v_plan_after
    from public.vmp_plan_items item
    where item.object_code = v_object_code;
    v_service_set_mutated := v_source_after is distinct from v_source_before
      or v_plan_after is distinct from v_plan_before;
    raise exception using errcode = 'PT401', message = 'rollback service performer probe';
  exception when sqlstate 'PT401' then null;
  end;

  begin
    v_service_upsert_result := public.rpc_upsert_source_object(
      v_object_kind, v_object_code, jsonb_build_object('note', v_probe_note)
    );
    select coalesce(jsonb_agg(to_jsonb(source) order by source.id), '[]'::jsonb)
    into v_source_after
    from public.vmp_source_objects source
    where source.object_code = v_object_code;
    select coalesce(jsonb_agg(to_jsonb(item) order by item.validation_code), '[]'::jsonb)
    into v_plan_after
    from public.vmp_plan_items item
    where item.object_code = v_object_code;
    v_service_upsert_mutated := v_source_after is distinct from v_source_before
      or v_plan_after is distinct from v_plan_before;
    raise exception using errcode = 'PT401', message = 'rollback service source probe';
  exception when sqlstate 'PT401' then null;
  end;

  if coalesce((v_service_set_result->>'ok')::boolean, false) is not true
      or not v_service_set_mutated then
    v_failures := array_append(
      v_failures,
      'SERVICE_SET_WRITER_CONTRACT result=' || coalesce(v_service_set_result::text, 'null')
    );
  end if;
  if coalesce((v_service_upsert_result->>'ok')::boolean, false) is not true
      or not v_service_upsert_mutated then
    v_failures := array_append(
      v_failures,
      'SERVICE_SOURCE_WRITER_CONTRACT result=' || coalesce(v_service_upsert_result::text, 'null')
    );
  end if;

  /* Every caught probe must have restored the original live-like rows before
   * the outer transaction performs its final rollback. */
  select coalesce(jsonb_agg(to_jsonb(source) order by source.id), '[]'::jsonb)
  into v_source_after
  from public.vmp_source_objects source
  where source.object_code = v_object_code;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.validation_code), '[]'::jsonb)
  into v_plan_after
  from public.vmp_plan_items item
  where item.object_code = v_object_code;
  select count(*) into v_audit_after from public.audit_logs;
  if v_source_after is distinct from v_source_before
      or v_plan_after is distinct from v_plan_before
      or v_audit_after is distinct from v_audit_before then
    raise exception 'SOURCE_WRITER_AUTH_TEST_LEAK: caught probe không rollback sạch';
  end if;

  if cardinality(v_failures) > 0 then
    raise exception 'SOURCE_WRITER_AUTH_REGRESSION: %',
      array_to_string(v_failures, ' | ');
  end if;
end
$test$;

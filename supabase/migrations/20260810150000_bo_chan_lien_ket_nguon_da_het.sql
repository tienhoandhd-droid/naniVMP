/* Mapping chỉ khóa preflight khi source tương ứng vẫn còn hiện hành. */

do $scope_stale_resolution$
declare
  v_signature regprocedure :=
    'public.rpc_item_permission_preflight()'::regprocedure;
  v_definition text;
  v_old_predicate text := 'where person.id is null';
  v_new_predicate text := $predicate$where person.id is null
      and exists (
        select 1
        from public.vmp_item_assignments assignment
        where assignment.is_active
          and assignment.validation_code = resolution.validation_code
          and assignment.assignment_kind = resolution.assignment_kind
          and assignment.source = resolution.source
          and public.vmp_normalize_person_name(
            coalesce(assignment.source_text, assignment.staff_name)
          ) = resolution.normalized_source_name
      )$predicate$;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  if position(
      'assignment.validation_code = resolution.validation_code'
      in v_definition
    ) = 0 then
    if position(v_old_predicate in v_definition) = 0 then
      raise exception 'Không tìm thấy predicate stale resolution trong preflight';
    end if;
    v_definition := replace(v_definition, v_old_predicate, v_new_predicate);
    execute v_definition;
  end if;
end
$scope_stale_resolution$;

create or replace function public.rpc_cleanup_orphan_source_assignment_resolutions(
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_cleaned integer := 0;
  v_deleted jsonb := '[]'::jsonb;
begin
  select role::text into v_actor_role
  from public.profiles
  where id = v_actor and coalesce(is_active, true);
  if coalesce(auth.role(), '') <> 'service_role'
      and v_actor_role is distinct from 'admin' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Chỉ Admin hoặc service được dọn mapping nguồn đã hết'
    );
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'Bắt buộc nhập lý do dọn mapping');
  end if;

  with deleted as (
    delete from public.vmp_source_assignment_resolutions resolution
    where not exists (
      select 1
      from public.vmp_item_assignments assignment
      where assignment.is_active
        and assignment.validation_code = resolution.validation_code
        and assignment.assignment_kind = resolution.assignment_kind
        and assignment.source = resolution.source
        and public.vmp_normalize_person_name(
          coalesce(assignment.source_text, assignment.staff_name)
        ) = resolution.normalized_source_name
    )
    returning jsonb_build_object(
      'validation_code', resolution.validation_code,
      'assignment_kind', resolution.assignment_kind,
      'source', resolution.source,
      'normalized_source_name', resolution.normalized_source_name,
      'performer_id', resolution.performer_id
    ) as mapping
  )
  select count(*)::integer, coalesce(jsonb_agg(mapping), '[]'::jsonb)
  into v_cleaned, v_deleted
  from deleted;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data,
    change_reason, source, changed_fields
  ) values (
    v_actor,
    'CONFIG_CHANGE',
    'vmp_source_assignment_resolutions',
    'orphan_cleanup',
    jsonb_build_object('mappings', v_deleted),
    jsonb_build_object('cleaned', v_cleaned),
    btrim(p_reason),
    'source_resolution_cleanup',
    array['orphan_mappings']
  );

  return jsonb_build_object(
    'ok', true,
    'cleaned', v_cleaned,
    'deleted', v_deleted
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end
$fn$;

revoke execute on function public.rpc_cleanup_orphan_source_assignment_resolutions(text)
  from public, anon;
grant execute on function public.rpc_cleanup_orphan_source_assignment_resolutions(text)
  to authenticated, service_role;

do $verify$
begin
  if public.item_permissions_mode() <> 'preview' then
    raise exception 'Migration 1500 không được tự bật enforced';
  end if;
  if has_function_privilege(
    'anon',
    'public.rpc_cleanup_orphan_source_assignment_resolutions(text)',
    'EXECUTE'
  ) then
    raise exception 'anon vẫn gọi được RPC dọn mapping source';
  end if;
end
$verify$;

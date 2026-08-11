/* Forward-only fix: optimistic QA-primary replacement and row-local rights basis.
 * DDL only. This migration never writes business data or the migration ledger.
 */

do $guard$
declare
  v_old regprocedure := to_regprocedure(
    'public.rpc_set_item_assignment(uuid,text,text,text,text,text)'
  );
  v_new regprocedure := to_regprocedure(
    'public.rpc_set_item_assignment(uuid,text,text,text,text,text,uuid)'
  );
begin
  if public.item_permissions_mode() is distinct from 'preview' then
    raise exception '111300 chỉ được áp khi item_permissions_mode=preview';
  end if;
  if (v_old is null) = (v_new is null) then
    raise exception '111300 yêu cầu đúng một signature assignment pre/final';
  end if;
  if (
      select count(*) from pg_proc procedure
      where procedure.pronamespace = 'public'::regnamespace
        and procedure.proname = 'rpc_set_item_assignment'
    ) <> 1 then
    raise exception 'rpc_set_item_assignment có overload ngoài hợp đồng';
  end if;
  if v_old is not null and md5(pg_get_functiondef(v_old)) is distinct from
      'fe861833803f9221783a47a2130cc339' then
    raise exception 'Definition assignment pre-111300 không đúng bản đã review';
  end if;
  if to_regprocedure('public.rpc_preview_item_rights(uuid,text)') is null
      or to_regprocedure(
        'public.vmp_unfiltered_security_definer_item_readers()'
      ) is null
      or not exists (
        select 1 from pg_event_trigger
        where evtname = 'chan_overload_rpc_tg' and evtenabled = 'O'
      ) then
    raise exception 'Thiếu preview/audit/overload guard canonical';
  end if;
end
$guard$;

do $replace_assignment$
declare
  v_old regprocedure := to_regprocedure(
    'public.rpc_set_item_assignment(uuid,text,text,text,text,text)'
  );
  v_definition text;
  v_lock_marker text := $marker$  perform assignment.id
  from public.vmp_item_assignments assignment
  where assignment.validation_code = p_validation_code
    and assignment.assignment_kind = p_assignment_kind
  order by assignment.id
  for update;
$marker$;
  v_conflict_check text := $insert$
  select assignment.id into v_existing_primary_id
  from public.vmp_item_assignments assignment
  where assignment.validation_code = p_validation_code
    and assignment.assignment_kind = 'qa'
    and assignment.assignment_role = 'primary'
    and assignment.is_active
  order by assignment.id
  limit 1;

  if p_action = 'replace_primary' then
    if p_expected_primary_assignment_id is null then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'PRIMARY_EXPECTATION_REQUIRED',
        'error', 'Cần tải lại QA phụ trách chính trước khi xác nhận thay thế',
        'current_primary_assignment_id', v_existing_primary_id
      );
    end if;
    if p_expected_primary_assignment_id is distinct from v_existing_primary_id then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'PRIMARY_CONFLICT',
        'error', 'QA phụ trách chính vừa thay đổi; hãy kiểm tra danh sách mới rồi thử lại',
        'expected_primary_assignment_id', p_expected_primary_assignment_id,
        'current_primary_assignment_id', v_existing_primary_id
      );
    end if;
  end if;
$insert$;
begin
  if v_old is null then
    return;
  end if;

  select pg_get_functiondef(v_old) into v_definition;
  if position(v_lock_marker in v_definition) = 0
      or position('p_expected_primary_assignment_id' in v_definition) > 0 then
    raise exception 'Không tìm thấy lock marker assignment pre-111300';
  end if;
  v_definition := replace(
    v_definition,
    'p_action text, p_reason text)',
    'p_action text, p_reason text, p_expected_primary_assignment_id uuid DEFAULT NULL::uuid)'
  );
  if v_definition is null
      or position('p_expected_primary_assignment_id uuid DEFAULT NULL::uuid'
        in v_definition) = 0 then
    raise exception 'Không đổi được signature assignment 111300';
  end if;
  v_definition := replace(
    v_definition, v_lock_marker, v_lock_marker || v_conflict_check
  );

  execute 'revoke all on function public.rpc_set_item_assignment('
    || 'uuid,text,text,text,text,text) from public, anon, authenticated, service_role';
  execute 'drop function public.rpc_set_item_assignment('
    || 'uuid,text,text,text,text,text)';
  execute v_definition;
end
$replace_assignment$;

do $update_reader_allowlist$
declare
  v_signature regprocedure :=
    'public.vmp_unfiltered_security_definer_item_readers()'::regprocedure;
  v_definition text;
  v_old text := 'rpc_set_item_assignment(uuid,text,text,text,text,text)';
  v_new text := 'rpc_set_item_assignment(uuid,text,text,text,text,text,uuid)';
begin
  select pg_get_functiondef(v_signature) into v_definition;
  if position(v_old in v_definition) > 0 then
    if position(v_new in v_definition) > 0 then
      raise exception 'Allowlist assignment chứa cả signature cũ và mới';
    end if;
    v_definition := replace(v_definition, v_old, v_new);
    execute v_definition;
  elsif position(v_new in v_definition) = 0 then
    raise exception 'Allowlist assignment thiếu signature canonical';
  end if;
end
$update_reader_allowlist$;

do $add_rights_basis$
declare
  v_signature regprocedure :=
    'public.rpc_preview_item_rights(uuid,text)'::regprocedure;
  v_definition text;
  v_marker text := $marker$    'validation_code', item.validation_code,$marker$;
  v_replacement text := $replacement$    'validation_code', item.validation_code,
    'rights_basis', case
      when person.access_class = 'qa_progress_editor' then 'qa_assignment'
      when person.access_class = 'qa_manager' then 'qa_management'
      else 'hierarchy_scope'
    end,$replacement$;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  if position($needle$'rights_basis'$needle$ in v_definition) = 0 then
    if md5(v_definition) is distinct from '94c7e63fcddf32356ea125db62455834'
        or position(v_marker in v_definition) = 0 then
      raise exception 'Definition preview pre-111300 không đúng bản đã review';
    end if;
    v_definition := replace(v_definition, v_marker, v_replacement);
    execute v_definition;
  end if;
end
$add_rights_basis$;

revoke all on function public.rpc_set_item_assignment(
  uuid, text, text, text, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.rpc_set_item_assignment(
  uuid, text, text, text, text, text, uuid
) to authenticated;

revoke execute on function public.rpc_preview_item_rights(uuid, text)
  from public, anon;
grant execute on function public.rpc_preview_item_rights(uuid, text)
  to authenticated, service_role;

do $verify$
declare
  v_assignment regprocedure :=
    'public.rpc_set_item_assignment(uuid,text,text,text,text,text,uuid)'::regprocedure;
  v_preview regprocedure :=
    'public.rpc_preview_item_rights(uuid,text)'::regprocedure;
  v_definition text;
  v_owner oid;
begin
  if public.item_permissions_mode() is distinct from 'preview'
      or to_regprocedure(
        'public.rpc_set_item_assignment(uuid,text,text,text,text,text)'
      ) is not null
      or (
        select count(*) from pg_proc procedure
        where procedure.pronamespace = 'public'::regnamespace
          and procedure.proname = 'rpc_set_item_assignment'
      ) <> 1 then
    raise exception 'Assignment signature final không canonical hoặc mode đổi';
  end if;

  select pg_get_functiondef(v_assignment), procedure.proowner
  into v_definition, v_owner
  from pg_proc procedure where procedure.oid = v_assignment::oid;
  if position('SECURITY DEFINER' in v_definition) = 0
      or position($needle$SET search_path TO 'public', 'pg_temp'$needle$
        in v_definition) = 0
      or position('PRIMARY_EXPECTATION_REQUIRED' in v_definition) = 0
      or position('PRIMARY_CONFLICT' in v_definition) = 0
      or position('for update;' in lower(v_definition)) = 0
      or not has_function_privilege(
        v_owner, 'public.vmp_manager_principal(uuid)', 'EXECUTE'
      ) then
    raise exception 'Assignment definition/owner-helper final không an toàn';
  end if;
  if not has_function_privilege('authenticated', v_assignment, 'EXECUTE')
      or has_function_privilege('anon', v_assignment, 'EXECUTE')
      or has_function_privilege('service_role', v_assignment, 'EXECUTE') then
    raise exception 'Assignment ACL final không tối thiểu';
  end if;
  if (
      select procedure.pronargdefaults from pg_proc procedure
      where procedure.oid = v_assignment::oid
    ) <> 1 then
    raise exception 'Expected primary phải là default cuối duy nhất';
  end if;

  select pg_get_functiondef(v_preview) into v_definition;
  if position($needle$'rights_basis'$needle$ in v_definition) = 0
      or position($needle$'qa_assignment'$needle$ in v_definition) = 0
      or position($needle$'qa_management'$needle$ in v_definition) = 0
      or position($needle$'hierarchy_scope'$needle$ in v_definition) = 0 then
    raise exception 'Preview chưa trả rights_basis canonical';
  end if;
  if not has_function_privilege('authenticated', v_preview, 'EXECUTE')
      or not has_function_privilege('service_role', v_preview, 'EXECUTE')
      or has_function_privilege('anon', v_preview, 'EXECUTE') then
    raise exception 'Preview ACL final không đúng';
  end if;
  if exists (
      select 1 from public.vmp_unfiltered_security_definer_item_readers()
    ) or not exists (
      select 1 from pg_event_trigger
      where evtname = 'chan_overload_rpc_tg' and evtenabled = 'O'
    ) then
    raise exception 'Reader audit hoặc overload guard final không sạch';
  end if;
end
$verify$;

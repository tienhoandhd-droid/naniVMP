-- Quản trị tài khoản/chính sách chỉ dành cho Admin.
-- Mọi vai khác Admin đều bị đóng menu, deep-link và các RPC quản trị tài khoản.
-- Migration dừng trước khi ghi nếu live đã trôi khỏi
-- đúng phiên bản đã audit ngày 28/08/2026.

begin;

do $preflight$
declare
  v_actual text;
begin
  select md5(pg_get_functiondef('public.rpc_my_ui_access()'::regprocedure)) into v_actual;
  if v_actual <> '588abf4f62181241a5134d3f4338b7d2' then
    raise exception 'rpc_my_ui_access drift: %', v_actual;
  end if;
  select md5(pg_get_functiondef('public.rpc_nguoi_va_quyen()'::regprocedure)) into v_actual;
  if v_actual <> 'a941b05790a8dd5d397c88188867ab44' then
    raise exception 'rpc_nguoi_va_quyen drift: %', v_actual;
  end if;
  select md5(pg_get_functiondef('public.rpc_preview_item_rights(uuid,text)'::regprocedure)) into v_actual;
  if v_actual <> '52a22a020b6bbd8ce48e50dc1df21942' then
    raise exception 'rpc_preview_item_rights drift: %', v_actual;
  end if;
  -- rpc_business_roles đã có Admin gate trong private implementation. Hash
  -- cả wrapper, implementation và helper để chứng minh gate ấy không trôi
  -- mà không tạo thêm một lớp wrapper/delegate không cần thiết.
  select md5(pg_get_functiondef('public.rpc_business_roles()'::regprocedure)) into v_actual;
  if v_actual <> 'e922734a3edb3c214be04a2fe58002ab' then
    raise exception 'rpc_business_roles drift: %', v_actual;
  end if;
  select md5(pg_get_functiondef(
    'public.rpc_business_roles__five_role_impl_20260824()'::regprocedure)) into v_actual;
  if v_actual <> '8ef25e74b9ca86d19e3cf162619f578c' then
    raise exception 'rpc_business_roles implementation drift: %', v_actual;
  end if;
  select md5(pg_get_functiondef('public.duoc_phep(text,text)'::regprocedure)) into v_actual;
  if v_actual <> '3ce6020bd32ce96df4d71ca1a5b00990' then
    raise exception 'duoc_phep drift: %', v_actual;
  end if;
  if not public.duoc_phep('admin_users', 'admin')
     or exists (select 1 from unnest(array[
       'qa_manager','qa_staff','workshop_manager','workshop_staff','viewer'
     ]) role_name where public.duoc_phep('admin_users', role_name))
     or has_function_privilege(
       'authenticated',
       'public.rpc_business_roles__five_role_impl_20260824()',
       'EXECUTE')
     or has_function_privilege(
       'service_role',
       'public.rpc_business_roles__five_role_impl_20260824()',
       'EXECUTE') then
    raise exception 'rpc_business_roles Admin-only contract drifted';
  end if;
  if not exists (select 1 from pg_proc p
      where p.oid = 'public.rpc_business_roles()'::regprocedure
        and pg_get_userbyid(p.proowner) = 'postgres'
        and p.prosecdef and p.provolatile = 's'
        and p.proconfig = array['search_path=public, pg_temp']::text[]
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and has_function_privilege('service_role', p.oid, 'EXECUTE')
        and not has_function_privilege('anon', p.oid, 'EXECUTE')
        and not exists (select 1 from aclexplode(p.proacl) acl where acl.grantee = 0)) then
    raise exception 'rpc_business_roles public owner/ACL contract drifted';
  end if;
  if (select count(*) from pg_proc p
      where p.oid in (
        'public.rpc_my_ui_access()'::regprocedure,
        'public.rpc_nguoi_va_quyen()'::regprocedure,
        'public.rpc_preview_item_rights(uuid,text)'::regprocedure
      )
        and pg_get_userbyid(p.proowner) = 'postgres'
        and p.prosecdef and p.provolatile = 's'
        and p.proconfig = array['search_path=public, pg_temp']::text[]
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and has_function_privilege('service_role', p.oid, 'EXECUTE')
        and not has_function_privilege('anon', p.oid, 'EXECUTE')
        and not exists (select 1 from aclexplode(p.proacl) acl where acl.grantee = 0)
     ) <> 3 then
    raise exception 'management RPC owner/ACL/volatility contract drifted';
  end if;
  if to_regprocedure('public.rpc_my_ui_access__admin_visibility_delegate_20260828()') is not null
     or to_regprocedure('public.rpc_nguoi_va_quyen__admin_visibility_delegate_20260828()') is not null
     or to_regprocedure('public.rpc_preview_item_rights__admin_visibility_delegate_20260828(uuid,text)') is not null
     or exists (select 1 from pg_depend
       where refobjid in (
         'public.rpc_my_ui_access()'::regprocedure,
         'public.rpc_nguoi_va_quyen()'::regprocedure,
         'public.rpc_preview_item_rights(uuid,text)'::regprocedure
       )
         and deptype not in ('i','e')) then
    raise exception 'management RPCs cannot be safely renamed';
  end if;

  if (select count(*) from public.vmp_screen_permissions
      where screen_id = 'phanquyen'
        and business_role in ('qa_manager','qa_staff')
        and can_view and data_scope = 'none' and actions = '{}'::text[]) <> 2 then
    raise exception 'phanquyen QA rows drifted';
  end if;
  if not exists (select 1 from public.vmp_screen_permissions
      where screen_id = 'phanquyen' and business_role = 'admin' and can_view)
     or not exists (select 1 from public.vmp_screen_permissions
      where screen_id = 'phanquyen' and business_role = 'workshop_manager'
        and can_view and actions = array['assign_workshop_staff']::text[]) then
    raise exception 'Admin/workshop phanquyen rows drifted before strict Admin gate';
  end if;
  if (select count(*) from public.vmp_screen_permissions
      where screen_id in ('phanquyen','health','audit','admin')) <> 20
     or (select count(*) from public.vmp_screen_permissions
      where business_role = 'admin'
        and screen_id in ('phanquyen','health','audit','admin') and can_view) <> 4
     or (select count(*) from public.vmp_screen_permissions
      where business_role = 'qa_manager' and screen_id in ('health','audit')
        and can_view and data_scope = 'all' and actions = array['view']::text[]) <> 2
     or (select count(*) from public.vmp_screen_permissions
      where business_role <> 'admin'
        and screen_id in ('phanquyen','health','audit','admin')
        and (can_view or data_scope <> 'none' or cardinality(actions) <> 0)) <> 5 then
    raise exception 'strict Admin management matrix precondition drifted';
  end if;
end
$preflight$;

do $matrix_update$
declare
  v_rows integer;
begin
  update public.vmp_screen_permissions
  set can_view = false,
      data_scope = 'none',
      actions = '{}'::text[],
      updated_at = clock_timestamp(),
      updated_by = null
  where screen_id in ('phanquyen','health','audit','admin')
    and business_role <> 'admin'
    and (can_view or data_scope <> 'none' or cardinality(actions) <> 0);
  get diagnostics v_rows = row_count;
  if v_rows <> 5 then
    raise exception 'expected to close 5 management rows, closed %', v_rows;
  end if;
end
$matrix_update$;

-- Giữ nguyên thân live đã audit bằng cách đổi tên nó thành delegate owner-only.
-- Wrapper mới chỉ phủ hai màn nhạy cảm bằng ma trận canonical, nên không sao
-- chép một thân hàm dài rồi làm mất các sửa lỗi phiên/quyền đã có.
alter function public.rpc_my_ui_access()
  rename to rpc_my_ui_access__admin_visibility_delegate_20260828;
revoke all on function public.rpc_my_ui_access__admin_visibility_delegate_20260828()
  from public, anon, authenticated, service_role;

create function public.rpc_my_ui_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_payload jsonb;
  v_role text;
  v_screen record;
begin
  v_payload := public.rpc_my_ui_access__admin_visibility_delegate_20260828();
  if coalesce((v_payload ->> 'ok')::boolean, false) is not true then
    return v_payload;
  end if;

  v_role := public.vmp_business_role(auth.uid());
  for v_screen in
    select sensitive.screen_id,
           coalesce(p.can_view, false) as can_view,
           coalesce(p.data_scope, 'none') as data_scope,
           coalesce(p.actions, '{}'::text[]) as actions
    from (values
      ('accounts'::text), ('phanquyen'::text), ('health'::text),
      ('audit'::text), ('admin'::text)
    ) sensitive(screen_id)
    left join public.vmp_screen_permissions p
      on p.business_role = v_role and p.screen_id = sensitive.screen_id
  loop
    v_payload := jsonb_set(
      v_payload,
      array['screens', v_screen.screen_id],
      jsonb_build_object(
        'can_view', v_screen.can_view,
        'data_scope', v_screen.data_scope,
        'actions', to_jsonb(v_screen.actions)
      ),
      true
    );
  end loop;
  return v_payload;
end
$function$;

revoke all on function public.rpc_my_ui_access() from public, anon;
grant execute on function public.rpc_my_ui_access() to authenticated, service_role;

-- Giữ cả hai wrapper live làm delegate owner-only, rồi thêm canonical Admin
-- gate ở biên công khai. Như vậy rollback không phải dựng lại thân hàm từ bản
-- chép trong repository.
alter function public.rpc_nguoi_va_quyen()
  rename to rpc_nguoi_va_quyen__admin_visibility_delegate_20260828;
revoke all on function public.rpc_nguoi_va_quyen__admin_visibility_delegate_20260828()
  from public, anon, authenticated, service_role;

create function public.rpc_nguoi_va_quyen()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return public.rpc_nguoi_va_quyen__admin_visibility_delegate_20260828();
  end if;
  if not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  if public.vmp_business_role(auth.uid()) is distinct from 'admin' then
    return jsonb_build_object(
      'ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin xem được dữ liệu quản trị tài khoản');
  end if;
  return public.rpc_nguoi_va_quyen__admin_visibility_delegate_20260828();
end
$function$;

revoke all on function public.rpc_nguoi_va_quyen() from public, anon;
grant execute on function public.rpc_nguoi_va_quyen() to authenticated, service_role;

alter function public.rpc_preview_item_rights(uuid,text)
  rename to rpc_preview_item_rights__admin_visibility_delegate_20260828;
revoke all on function public.rpc_preview_item_rights__admin_visibility_delegate_20260828(uuid,text)
  from public, anon, authenticated, service_role;

create function public.rpc_preview_item_rights(
  p_person_id uuid default null,
  p_validation_code text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return public.rpc_preview_item_rights__admin_visibility_delegate_20260828(
      p_person_id, p_validation_code);
  end if;
  if not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  if public.vmp_business_role(auth.uid()) is distinct from 'admin' then
    return jsonb_build_object(
      'ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin xem được quyền hiệu lực của người khác');
  end if;
  return public.rpc_preview_item_rights__admin_visibility_delegate_20260828(
    p_person_id, p_validation_code);
end
$function$;

revoke all on function public.rpc_preview_item_rights(uuid,text) from public, anon;
grant execute on function public.rpc_preview_item_rights(uuid,text) to authenticated, service_role;

do $postcheck$
begin
  if exists (select 1 from public.vmp_screen_permissions
      where screen_id in ('accounts','phanquyen','health','audit','admin')
        and business_role <> 'admin'
        and (can_view or data_scope <> 'none' or cardinality(actions) <> 0)) then
    raise exception 'non-admin management visibility remains';
  end if;
  if (select count(*) from public.vmp_screen_permissions
      where business_role = 'admin'
        and screen_id in ('accounts','phanquyen','health','audit','admin')
        and can_view) <> 5 then
    raise exception 'required Admin access was removed';
  end if;
  if pg_get_userbyid((select proowner from pg_proc
       where oid = 'public.rpc_my_ui_access()'::regprocedure)) <> 'postgres'
     or pg_get_userbyid((select proowner from pg_proc
       where oid = 'public.rpc_nguoi_va_quyen()'::regprocedure)) <> 'postgres'
     or pg_get_userbyid((select proowner from pg_proc
       where oid = 'public.rpc_preview_item_rights(uuid,text)'::regprocedure)) <> 'postgres' then
    raise exception 'function owner drift after replacement';
  end if;
  if has_function_privilege(
       'authenticated',
       'public.rpc_my_ui_access__admin_visibility_delegate_20260828()',
       'EXECUTE')
     or has_function_privilege(
       'authenticated',
       'public.rpc_nguoi_va_quyen__admin_visibility_delegate_20260828()',
       'EXECUTE')
     or has_function_privilege(
       'authenticated',
       'public.rpc_preview_item_rights__admin_visibility_delegate_20260828(uuid,text)',
       'EXECUTE')
     or not has_function_privilege(
       'authenticated', 'public.rpc_my_ui_access()', 'EXECUTE')
     or not has_function_privilege(
       'authenticated', 'public.rpc_nguoi_va_quyen()', 'EXECUTE')
     or not has_function_privilege(
       'authenticated', 'public.rpc_preview_item_rights(uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.rpc_my_ui_access()', 'EXECUTE')
     or has_function_privilege('anon', 'public.rpc_nguoi_va_quyen()', 'EXECUTE')
     or has_function_privilege('anon', 'public.rpc_preview_item_rights(uuid,text)', 'EXECUTE') then
    raise exception 'rpc_my_ui_access ACL boundary is incorrect';
  end if;
end
$postcheck$;

commit;

-- Rollback có chủ đích phải chạy trong MỘT transaction riêng và khôi phục đủ
-- năm hàng đã đổi: qa_manager/health + qa_manager/audit = true/all/{view};
-- qa_manager/phanquyen + qa_staff/phanquyen = true/none/{};
-- workshop_manager/phanquyen = true/none/{assign_workshop_staff}.
-- Sau đó DROP đúng ba public wrapper, RENAME ba delegate ngày 20260828 về tên
-- công khai cũ, rồi GRANT EXECUTE lại đúng authenticated, service_role (PUBLIC
-- và anon vẫn bị REVOKE). Trước COMMIT phải kiểm lại ba md5 gốc ở preflight,
-- owner postgres, SECURITY DEFINER, search_path và ACL. Không rollback riêng
-- ma trận hoặc riêng function vì sẽ tạo khoảng hở giữa menu và RPC.

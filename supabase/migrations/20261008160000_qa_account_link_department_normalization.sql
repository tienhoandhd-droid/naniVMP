-- Keep account linking consistent with the canonical QA department comparison.
-- Proven by LIFE_UPPER_QA_RELINK; non-QA departments and nonadmins still denied.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$begin
 if md5(pg_get_functiondef('public.rpc_link_item_permission_account__five_role_impl_20260824(uuid,uuid,text,integer)'::regprocedure)) is distinct from '3fe832f7b769e5cbc9e5cbb60cd5595d' then
  raise exception 'CRUD_LINK_BASELINE_CHANGED';
 end if;
end$$;
CREATE OR REPLACE FUNCTION public.rpc_link_item_permission_account__five_role_impl_20260824(p_person_id uuid, p_user_id uuid, p_reason text, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_person public.vmp_performers%rowtype;
  v_new_person public.vmp_performers%rowtype;
  v_old_profile public.profiles%rowtype;
  v_profile public.profiles%rowtype;
  v_new_profile public.profiles%rowtype;
  v_version integer;
  v_lock_user_id uuid;
begin
  select role::text into v_actor_role
  from public.profiles
  where id = v_actor and coalesce(is_active, true);
  if coalesce(auth.role(), '') <> 'service_role'
      and v_actor_role is distinct from 'admin' then
    return jsonb_build_object(
      'ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin được nối hoặc gỡ tài khoản'
    );
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'REASON_REQUIRED',
      'error', 'Bắt buộc nhập lý do nối hoặc gỡ tài khoản'
    );
  end if;

  /* Serialize mọi mutation của cùng account trước khi lấy row lock.
   * Unlink lấy account hiện tại bằng snapshot; optimistic version bên dưới
   * từ chối nếu một link vừa thay snapshot trong lúc chờ performer. */
  v_lock_user_id := p_user_id;
  if v_lock_user_id is null then
    select user_id into v_lock_user_id
    from public.vmp_performers
    where id = p_person_id;
  end if;
  if v_lock_user_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'vmp:item-permission-account:' || v_lock_user_id::text, 0
      )
    );
  end if;

  select * into v_person
  from public.vmp_performers
  where id = p_person_id
  for update;
  if not found then
    return jsonb_build_object(
      'ok', false, 'error_code', 'PERSON_NOT_FOUND',
      'error', 'Không tìm thấy hồ sơ cần nối tài khoản'
    );
  end if;
  if p_expected_version is distinct from v_person.version then
    return jsonb_build_object(
      'ok', false, 'error_code', 'VERSION_CONFLICT',
      'error', 'Hồ sơ đã được cập nhật ở phiên khác',
      'current_version', v_person.version
    );
  end if;
  if p_user_id is null
      and v_lock_user_id is distinct from v_person.user_id then
    return jsonb_build_object(
      'ok', false, 'error_code', 'VERSION_CONFLICT',
      'error', 'Liên kết tài khoản đã đổi trong lúc chờ khóa hồ sơ',
      'current_version', v_person.version
    );
  end if;
  if p_user_id is not null and not v_person.is_active then
    return jsonb_build_object(
      'ok', false, 'error_code', 'PERSON_INACTIVE',
      'error', 'Không được nối tài khoản vào hồ sơ đã ngừng hoạt động'
    );
  end if;

  /* Performer được khóa trước, sau đó profile được khóa theo UUID ổn định. */
  perform profile.id
  from public.profiles profile
  where profile.id = v_person.user_id or profile.id = p_user_id
  order by profile.id
  for update;
  if v_person.user_id is not null then
    select * into v_old_profile
    from public.profiles where id = v_person.user_id;
  end if;

  if p_user_id is not null then
    if v_person.user_id is not null and v_person.user_id <> p_user_id then
      return jsonb_build_object(
        'ok', false, 'error_code', 'ACCOUNT_RELINK_REQUIRED',
        'error', 'Phải gỡ tài khoản hiện tại trước khi nối tài khoản khác'
      );
    end if;
    select * into v_profile from public.profiles where id = p_user_id;
    if not found then
      return jsonb_build_object(
        'ok', false, 'error_code', 'ACCOUNT_NOT_FOUND',
        'error', 'Không tìm thấy tài khoản cần nối'
      );
    end if;
    /* Snapshot trước update phải là chính profile đích của lần link đầu. */
    v_old_profile := v_profile;
    if not coalesce(v_profile.is_active, true) then
      return jsonb_build_object(
        'ok', false, 'error_code', 'ACCOUNT_INACTIVE',
        'error', 'Tài khoản đã ngừng hoạt động'
      );
    end if;
    if exists (
      select 1 from public.vmp_performers person
      where person.user_id = p_user_id and person.id <> p_person_id
    ) then
      return jsonb_build_object(
        'ok', false, 'error_code', 'ACCOUNT_ALREADY_LINKED',
        'error', 'Tài khoản này đã nối với một nhân viên khác'
      );
    end if;
    if v_person.access_class in ('qa_progress_editor', 'qa_manager')
        and v_profile.department is not null
        and upper(btrim(v_profile.department)) <> 'QA' then
      return jsonb_build_object(
        'ok', false, 'error_code', 'INVALID_QA_PRINCIPAL',
        'error', 'Tài khoản QA phải thuộc bộ phận QA'
      );
    end if;
    if v_person.access_class = 'equipment_manager'
        and v_profile.role::text <> 'admin'
        and (
          v_profile.role::text <> 'department_user'
          or v_profile.department is distinct from v_person.department
        ) then
      return jsonb_build_object(
        'ok', false, 'error_code', 'INVALID_MANAGER_PRINCIPAL',
        'error', 'Quản lý thiết bị phải có role và department khớp hồ sơ'
      );
    end if;

    if v_person.access_class in ('qa_progress_editor', 'qa_manager')
        and v_profile.role::text <> 'admin' then
      update public.profiles
      set role = case when v_person.access_class = 'qa_manager'
            then 'qa_manager'::public.user_role
            else 'viewer'::public.user_role end,
          department = 'qa',
          updated_at = now()
      where id = p_user_id;
    end if;
  elsif v_person.user_id is not null
      and v_old_profile.role::text <> 'admin'
      and v_old_profile.role::text = 'qa_manager'
      and v_person.access_class in ('qa_progress_editor', 'qa_manager') then
    update public.profiles
    set role = 'viewer'::public.user_role, updated_at = now()
    where id = v_person.user_id;
  end if;

  v_version := v_person.version + 1;
  update public.vmp_performers
  set user_id = p_user_id, version = v_version, updated_by = v_actor
  where id = p_person_id
  returning * into v_new_person;

  update public.vmp_item_assignments assignment
  set user_id = p_user_id,
      employee_code = v_new_person.employee_code,
      staff_name = v_new_person.performer_name,
      unresolved_reason = case
        when p_user_id is null then 'account_unlinked'
        else null
      end,
      updated_by = v_actor
  where assignment.performer_id = p_person_id;

  if p_user_id is not null then
    select * into v_new_profile
    from public.profiles where id = p_user_id;
  elsif v_person.user_id is not null then
    select * into v_new_profile
    from public.profiles where id = v_person.user_id;
  end if;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data,
    change_reason, source, changed_fields
  ) values (
    v_actor, 'UPDATE', 'vmp_performers', p_person_id::text,
    jsonb_build_object(
      'performer', to_jsonb(v_person),
      'profile', to_jsonb(v_old_profile)
    ),
    jsonb_build_object(
      'performer', to_jsonb(v_new_person),
      'profile', to_jsonb(v_new_profile)
    ),
    btrim(p_reason), 'dashboard_rpc',
    array['user_id', 'version', 'profile.role', 'profile.department']
  );

  return jsonb_build_object(
    'ok', true,
    'person_id', p_person_id,
    'user_id', p_user_id,
    'version', v_version,
    'account_status', case when p_user_id is null then 'unlinked' else 'linked' end
  );
exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ACCOUNT_ALREADY_LINKED',
      'error', 'Tài khoản này đã nối với một nhân viên khác'
    );
  when others then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ACCOUNT_LINK_FAILED', 'error', sqlerrm
    );
end
$function$;
commit;

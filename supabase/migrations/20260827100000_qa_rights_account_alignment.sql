-- Split the QA progress allowlist without changing the public signature,
-- guarded browser wrappers, writer, RLS, or production enforcement modes.

begin;

do $precondition$
declare
  v_rights oid := to_regprocedure('public.vmp_item_rights(uuid,text)');
  v_writer oid := to_regprocedure(
    'public.rpc_update_progress(text,jsonb,text,jsonb,integer)');
  v_wrapper oid := to_regprocedure('public.vmp_my_item_rights(text)');
  v_rights_owner oid;
  v_matrix_count bigint;
  v_matrix_roles bigint;
  v_matrix_hash text;
  v_assignment_column_hash text;
  v_assignment_hash text;
  v_required text;
begin
  foreach v_required in array array[
    'public.vmp_business_role(uuid)',
    'public.vmp_manager_principal(uuid)',
    'public.vmp_item_rights(uuid,text)',
    'public.vmp_my_item_rights(text)',
    'public.vmp_allowed_timeline_fields(uuid,text)',
    'public.rpc_update_progress(text,jsonb,text,jsonb,integer)',
    'public.rpc_update_progress__five_role_impl_20260824(text,jsonb,text,jsonb,integer)'
  ] loop
    if to_regprocedure(v_required) is null then
      raise exception using errcode = 'check_violation',
        message = 'QA_RIGHTS_ALIGNMENT_PRECONDITION_MISSING_FUNCTION ' || v_required;
    end if;
  end loop;

  if to_regclass('public.profiles') is null
     or to_regclass('public.vmp_performers') is null
     or to_regclass('public.vmp_plan_items') is null
     or to_regclass('public.vmp_item_assignments') is null
     or to_regclass('public.vmp_screen_permissions') is null
     or to_regclass('public.system_config') is null
     or to_regclass('public.audit_logs') is null then
    raise exception using errcode = 'check_violation',
      message = 'QA_RIGHTS_ALIGNMENT_PRECONDITION_MISSING_TABLE';
  end if;

  if (select count(*) from pg_proc p
      join pg_namespace namespace on namespace.oid = p.pronamespace
      where namespace.nspname = 'public'
        and p.proname = 'vmp_item_rights') <> 1 then
    raise exception using errcode = 'check_violation',
      message = 'QA_RIGHTS_ALIGNMENT_PRECONDITION_RIGHTS_OVERLOAD';
  end if;

  select proowner into strict v_rights_owner from pg_proc where oid = v_rights;
  if pg_get_function_result(v_rights) is distinct from
       'TABLE(can_view boolean, editable_fields text[], view_reason text, assignment_sources text[], scope_match boolean, area_match boolean)'
     or (select language.lanname from pg_proc p
         join pg_language language on language.oid = p.prolang
         where p.oid = v_rights) is distinct from 'plpgsql'
     or not (select prosecdef from pg_proc where oid = v_rights)
     or (select provolatile from pg_proc where oid = v_rights) <> 's'
     or (select proparallel from pg_proc where oid = v_rights) <> 'u'
     or (select proisstrict from pg_proc where oid = v_rights)
     or (select proleakproof from pg_proc where oid = v_rights)
     or (select proconfig from pg_proc where oid = v_rights)
        is distinct from array['search_path=public, pg_temp']
     or (select rolname from pg_roles where oid = v_rights_owner) <> 'postgres'
     or v_rights_owner is distinct from
        (select proowner from pg_proc where oid = v_writer)
     or encode(extensions.digest(pg_get_functiondef(v_rights), 'sha256'), 'hex')
        is distinct from
        'f82b266343a54d695e16df2e9a67867d39ddc50bd11233639266eae7ca1553aa'
     or not has_function_privilege('service_role', v_rights, 'EXECUTE')
     or has_function_privilege('authenticated', v_rights, 'EXECUTE')
     or has_function_privilege('anon', v_rights, 'EXECUTE')
     or has_function_privilege('public', v_rights, 'EXECUTE')
     or (select proacl from pg_proc where oid = v_rights)
        is distinct from array[
          'postgres=X/postgres', 'service_role=X/postgres'
        ]::aclitem[]
     or (select count(*)
         from aclexplode(coalesce(
           (select proacl from pg_proc where oid = v_rights),
           acldefault('f', v_rights_owner))) acl
         where acl.grantee <> v_rights_owner
           and acl.privilege_type = 'EXECUTE') <> 1 then
    raise exception using errcode = 'check_violation',
      message = 'QA_RIGHTS_ALIGNMENT_PRECONDITION_RIGHTS_CONTRACT';
  end if;

  if (select count(*) from pg_proc p
      join pg_namespace namespace on namespace.oid = p.pronamespace
      where namespace.nspname = 'public'
        and p.proname = 'rpc_update_progress') <> 1
     or pg_get_function_result(v_writer) is distinct from 'jsonb'
     or (select language.lanname from pg_proc p
         join pg_language language on language.oid = p.prolang
         where p.oid = v_writer) is distinct from 'plpgsql'
     or (select rolname from pg_roles
         where oid = (select proowner from pg_proc where oid = v_writer))
        is distinct from 'postgres'
     or not (select prosecdef from pg_proc where oid = v_writer)
     or (select provolatile from pg_proc where oid = v_writer) <> 'v'
     or (select proparallel from pg_proc where oid = v_writer) <> 'u'
     or (select proisstrict from pg_proc where oid = v_writer)
     or (select proleakproof from pg_proc where oid = v_writer)
     or (select proconfig from pg_proc where oid = v_writer)
        is distinct from array['search_path=public, pg_temp']
     or encode(extensions.digest(pg_get_functiondef(v_writer), 'sha256'), 'hex')
        is distinct from
        'da25f8acbcc5aa3e029e581acb79f210cf1d6c61ab0e8458e4ff89146e75f4a0'
     or not has_function_privilege('authenticated', v_writer, 'EXECUTE')
     or not has_function_privilege('service_role', v_writer, 'EXECUTE')
     or has_function_privilege('anon', v_writer, 'EXECUTE')
     or has_function_privilege('public', v_writer, 'EXECUTE')
     or (select proacl from pg_proc where oid = v_writer)
        is distinct from array[
          'postgres=X/postgres', 'service_role=X/postgres',
          'authenticated=X/postgres'
        ]::aclitem[]
     or (select count(*)
         from aclexplode(coalesce(
           (select proacl from pg_proc where oid = v_writer),
           acldefault('f', (select proowner from pg_proc where oid = v_writer)))) acl
         where acl.grantee <> (select proowner from pg_proc where oid = v_writer)
           and acl.privilege_type = 'EXECUTE') <> 2 then
    raise exception using errcode = 'check_violation',
      message = 'QA_RIGHTS_ALIGNMENT_PRECONDITION_WRITER_CONTRACT';
  end if;

  if (select proacl from pg_proc where oid = v_wrapper)
       is distinct from array[
         'postgres=X/postgres', 'service_role=X/postgres',
         'authenticated=X/postgres'
       ]::aclitem[]
     or (select rolname from pg_roles
         where oid = (select proowner from pg_proc where oid = v_wrapper))
        is distinct from 'postgres'
     or not has_function_privilege('authenticated', v_wrapper, 'EXECUTE')
     or not has_function_privilege('service_role', v_wrapper, 'EXECUTE')
     or has_function_privilege('anon', v_wrapper, 'EXECUTE')
     or has_function_privilege('public', v_wrapper, 'EXECUTE') then
    raise exception using errcode = 'check_violation',
      message = 'QA_RIGHTS_ALIGNMENT_PRECONDITION_WRAPPER_ACL';
  end if;

  if exists (
    select 1
    from (values
      ('public.vmp_business_role(uuid)',
       '45b2dfab1f9463b234a3754e8ee022450749f8418d6fc4a966b09fe8d52c3156'),
      ('public.vmp_manager_principal(uuid)',
       'f1d5c93ff47de4563100f1ce9a54ada9d7b6d0ee908a9914f14327f2fa7af849'),
      ('public.vmp_my_item_rights(text)',
       'c7a326defaedd0cf9056a284e480d69027a56cd35f2ca6f09b4a9e321f1ad76d'),
      ('public.vmp_allowed_timeline_fields(uuid,text)',
       '235d5d2e4ff760a7640e2687be430a8a188a56d380b7cf7b72e6018bc71d9a3c'),
      ('public.rpc_update_progress__five_role_impl_20260824(text,jsonb,text,jsonb,integer)',
       '55f7f86442b88a12c39e1f3cb6dd867d0aae0a684db78365bcef673a473e2644')
    ) reviewed(signature, definition_hash)
    where encode(extensions.digest(
      pg_get_functiondef(reviewed.signature::regprocedure), 'sha256'), 'hex')
      is distinct from reviewed.definition_hash
  ) then
    raise exception using errcode = 'check_violation',
      message = 'QA_RIGHTS_ALIGNMENT_PRECONDITION_DEPENDENCY_DRIFT';
  end if;

  select count(*), count(distinct business_role),
         encode(extensions.digest(string_agg(format(
           '%s|%s|%s|%s|%s', business_role, screen_id, can_view,
           data_scope, array_to_string(actions, ',')), E'\n'
           order by business_role, screen_id), 'sha256'), 'hex')
  into v_matrix_count, v_matrix_roles, v_matrix_hash
  from public.vmp_screen_permissions;
  if v_matrix_count <> 85
     or v_matrix_roles <> 5
     or v_matrix_hash is distinct from
        '6c8fb41b9ed3336bc91cdd3fa965474b39e0ad18a22f91d24eba071328938e85'
     or exists (
       select 1 from public.vmp_screen_permissions
       where business_role not in (
         'admin', 'qa_manager', 'qa_staff',
         'workshop_manager', 'workshop_staff'
       )
     ) then
    raise exception using errcode = 'check_violation',
      message = 'QA_RIGHTS_ALIGNMENT_PRECONDITION_FIVE_ROLE_MATRIX';
  end if;

  if (select count(*) from public.system_config
      where key = 'screen_access_mode' and value = '"enforced"'::jsonb) <> 1
     or (select count(*) from public.system_config
         where key = 'item_permissions_mode' and value = '"preview"'::jsonb) <> 1 then
    raise exception using errcode = 'check_violation',
      message = 'QA_RIGHTS_ALIGNMENT_PRECONDITION_PERMISSION_MODES';
  end if;

  if exists (
    select 1
    from (values
      ('validation_code', 'text', true),
      ('performer_id', 'uuid', false),
      ('user_id', 'uuid', false),
      ('staff_name', 'text', true),
      ('assignment_kind', 'text', true),
      ('source', 'text', true),
      ('expires_at', 'timestamp with time zone', false),
      ('is_active', 'boolean', true),
      ('assignment_role', 'text', false)
    ) required(column_name, data_type, is_not_null)
    left join pg_attribute attribute
      on attribute.attrelid = 'public.vmp_item_assignments'::regclass
     and attribute.attname = required.column_name
     and not attribute.attisdropped
    where attribute.attname is null
       or format_type(attribute.atttypid, attribute.atttypmod)
          is distinct from required.data_type
       or attribute.attnotnull is distinct from required.is_not_null
  ) then
    raise exception using errcode = 'check_violation',
      message = 'QA_RIGHTS_ALIGNMENT_PRECONDITION_ASSIGNMENT_COLUMNS';
  end if;

  select encode(extensions.digest(string_agg(concat_ws('|',
           attribute.attnum, attribute.attname,
           format_type(attribute.atttypid, attribute.atttypmod),
           attribute.attnotnull,
           coalesce(pg_get_expr(default_value.adbin, default_value.adrelid), ''),
           attribute.attidentity, attribute.attgenerated,
           coalesce(collation_namespace.nspname, ''),
           coalesce(column_collation.collname, ''),
           coalesce(collation_owner.rolname, ''),
           coalesce(column_collation.collprovider::text, ''),
           coalesce(column_collation.collisdeterministic::text, ''),
           coalesce(column_collation.collencoding::text, ''),
           coalesce(column_collation.collcollate, ''),
           coalesce(column_collation.collctype, ''),
           coalesce(column_collation.colllocale, ''),
           coalesce(column_collation.collicurules, ''),
           coalesce(column_collation.collversion, '')), E'\n'
           order by attribute.attnum), 'sha256'), 'hex')
  into v_assignment_column_hash
  from pg_attribute attribute
  left join pg_attrdef default_value
    on default_value.adrelid = attribute.attrelid
   and default_value.adnum = attribute.attnum
  left join pg_collation column_collation
    on column_collation.oid = attribute.attcollation
  left join pg_namespace collation_namespace
    on collation_namespace.oid = column_collation.collnamespace
  left join pg_roles collation_owner
    on collation_owner.oid = column_collation.collowner
  where attribute.attrelid = 'public.vmp_item_assignments'::regclass
    and attribute.attnum > 0 and not attribute.attisdropped;
  if v_assignment_column_hash is distinct from
     '8157dca83577a2e4072e7bc46ab6ee605edd3853a17a7152214a2d28b8b0138b' then
    raise exception using errcode = 'check_violation',
      message = 'QA_RIGHTS_ALIGNMENT_PRECONDITION_ASSIGNMENT_COLUMN_CONTRACT';
  end if;

  select encode(extensions.digest(string_agg(format(
           '%s|%s|%s', constraint_row.conname, constraint_row.contype,
           pg_get_constraintdef(constraint_row.oid)), E'\n'
           order by constraint_row.conname), 'sha256'), 'hex')
  into v_assignment_hash
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.vmp_item_assignments'::regclass;
  if v_assignment_hash is distinct from
     'f4c89cfbd3e695b9eac72d73dc6fe4658a733d1c12cc1a0776a4b145b6464374' then
    raise exception using errcode = 'check_violation',
      message = 'QA_RIGHTS_ALIGNMENT_PRECONDITION_ASSIGNMENT_CONSTRAINTS';
  end if;

  perform set_config('app.qa_rights_screen_mode_before',
    (select value::text from public.system_config
     where key = 'screen_access_mode'), true);
  perform set_config('app.qa_rights_item_mode_before',
    (select value::text from public.system_config
     where key = 'item_permissions_mode'), true);
end
$precondition$;

create or replace function public.vmp_item_rights(
  p_uid uuid,
  p_validation_code text
)
returns table(
  can_view boolean,
  editable_fields text[],
  view_reason text,
  assignment_sources text[],
  scope_match boolean,
  area_match boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business_role text := public.vmp_business_role(p_uid);
  v_person public.vmp_performers%rowtype;
  v_principal record;
  v_old record;
  v_scope record;
  v_has_assignment boolean := false;
  v_sources text[] := '{}'::text[];
  v_hierarchy_match boolean := false;
  v_qa_manager_fields constant text[] := array[
    'actual_protocol_date', 'status_protocol',
    'actual_validation_date', 'status_validation',
    'actual_report_date', 'status_report',
    'actual_vmp_date', 'status_vmp'
  ]::text[];
  v_qa_staff_fields constant text[] := array[
    'actual_protocol_date', 'status_protocol', 'status_validation',
    'actual_report_date', 'status_report',
    'actual_vmp_date', 'status_vmp'
  ]::text[];
  v_workshop_fields constant text[] := array['actual_validation_date']::text[];
begin
  if v_business_role is null then
    return query select false, '{}'::text[],
      'Không giải được vai trò nghiệp vụ', '{}'::text[], false, false;
    return;
  end if;

  if v_business_role = 'admin' then
    return query select *
    from public.vmp_item_rights_before_assignment_only_qa(
      p_uid, p_validation_code
    );
    return;
  end if;

  select * into v_person
  from public.vmp_performers person
  where person.user_id = p_uid and person.is_active;

  if v_business_role = 'qa_manager' then
    select * into v_principal from public.vmp_manager_principal(p_uid);
    if v_principal.principal_kind = 'qa_manager'
        and exists (
          select 1 from public.vmp_plan_items item
          where item.validation_code = p_validation_code and item.is_active
        ) then
      return query select true, v_qa_manager_fields,
        'Quản lý QA xem toàn bộ hạng mục hoạt động',
        '{}'::text[], true, true;
    else
      return query select false, '{}'::text[],
        'Principal Quản lý QA không hợp lệ', '{}'::text[], false, false;
    end if;
    return;
  end if;

  if v_business_role = 'qa_staff' then
    if not exists (
      select 1 from public.vmp_plan_items item
      where item.validation_code = p_validation_code and item.is_active
    ) then
      return query select false, '{}'::text[],
        'Không tìm thấy hạng mục hoạt động', '{}'::text[], false, false;
      return;
    end if;
    select
      coalesce(bool_or(assignment.is_active), false),
      coalesce(array_agg(distinct assignment.source order by assignment.source),
               '{}'::text[])
    into v_has_assignment, v_sources
    from public.vmp_item_assignments assignment
    where assignment.validation_code = p_validation_code
      and assignment.performer_id = v_person.id
      and assignment.assignment_kind = 'qa'
      and assignment.is_active
      and (assignment.expires_at is null or assignment.expires_at > now());
    return query select v_has_assignment,
      case when v_has_assignment then v_qa_staff_fields else '{}'::text[] end,
      case when v_has_assignment then 'Có phân công QA đang hoạt động'
           else 'Chưa có phân công QA đang hoạt động' end,
      v_sources, v_has_assignment, v_has_assignment;
    return;
  end if;

  if v_business_role = 'workshop_manager' then
    select * into v_old
    from public.vmp_item_rights_before_assignment_only_qa(
      p_uid, p_validation_code
    );
    return query select coalesce(v_old.can_view, false),
      case when coalesce(v_old.can_view, false)
        then v_workshop_fields else '{}'::text[] end,
      v_old.view_reason, v_old.assignment_sources,
      coalesce(v_old.scope_match, false), coalesce(v_old.area_match, false);
    return;
  end if;

  if v_business_role = 'workshop_staff' then
    if v_person.id is null or not exists (
      select 1 from public.vmp_plan_items item
      where item.validation_code = p_validation_code and item.is_active
    ) then
      return query select false, '{}'::text[],
        'Tài khoản chưa nối hồ sơ hoặc hạng mục không hoạt động',
        '{}'::text[], false, false;
      return;
    end if;
    select * into v_scope
    from public.vmp_item_scope_matches(v_person.id, p_validation_code);
    v_hierarchy_match := coalesce(v_scope.scope_match, false)
      and coalesce(v_scope.factory_match, false)
      and coalesce(v_scope.area_match, false)
      and coalesce(v_scope.line_match, false);
    select
      coalesce(bool_or(assignment.is_active), false),
      coalesce(array_agg(distinct assignment.source order by assignment.source),
               '{}'::text[])
    into v_has_assignment, v_sources
    from public.vmp_item_assignments assignment
    where assignment.validation_code = p_validation_code
      and assignment.performer_id = v_person.id
      and assignment.assignment_kind = 'equipment_department'
      and assignment.is_active
      and (assignment.expires_at is null or assignment.expires_at > now());
    v_has_assignment := v_has_assignment and v_hierarchy_match;
    return query select v_has_assignment,
      case when v_has_assignment then v_workshop_fields else '{}'::text[] end,
      case when v_has_assignment
        then 'Có phân công xưởng đang hoạt động trong đúng phạm vi'
        else 'Chưa có phân công xưởng hoặc nằm ngoài phạm vi' end,
      v_sources, coalesce(v_scope.scope_match, false), v_hierarchy_match;
    return;
  end if;

  /* Viewer không có quyền ghi; quyền xem hạng mục giữ theo luật view_only cũ. */
  select * into v_old
  from public.vmp_item_rights_before_assignment_only_qa(p_uid, p_validation_code);
  return query select coalesce(v_old.can_view, false), '{}'::text[],
    v_old.view_reason, v_old.assignment_sources,
    coalesce(v_old.scope_match, false), coalesce(v_old.area_match, false);
end
$function$;

alter function public.vmp_item_rights(uuid, text) owner to postgres;
alter function public.vmp_item_rights(uuid, text) stable;
alter function public.vmp_item_rights(uuid, text) security definer;
alter function public.vmp_item_rights(uuid, text)
  set search_path = public, pg_temp;
revoke all on function public.vmp_item_rights(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.vmp_item_rights(uuid, text) to service_role;

do $postcondition$
declare
  v_rights oid := 'public.vmp_item_rights(uuid,text)'::regprocedure;
  v_rights_owner oid;
  v_definition text;
begin
  select proowner, pg_get_functiondef(oid)
  into strict v_rights_owner, v_definition
  from pg_proc where oid = v_rights;

  if (select count(*) from pg_proc p
      join pg_namespace namespace on namespace.oid = p.pronamespace
      where namespace.nspname = 'public'
        and p.proname = 'vmp_item_rights') <> 1
     or pg_get_function_result(v_rights) is distinct from
       'TABLE(can_view boolean, editable_fields text[], view_reason text, assignment_sources text[], scope_match boolean, area_match boolean)'
     or (select rolname from pg_roles where oid = v_rights_owner) <> 'postgres'
     or not (select prosecdef from pg_proc where oid = v_rights)
     or (select provolatile from pg_proc where oid = v_rights) <> 's'
     or (select proconfig from pg_proc where oid = v_rights)
        is distinct from array['search_path=public, pg_temp']
     or not has_function_privilege('service_role', v_rights, 'EXECUTE')
     or has_function_privilege('authenticated', v_rights, 'EXECUTE')
     or has_function_privilege('anon', v_rights, 'EXECUTE')
     or has_function_privilege('public', v_rights, 'EXECUTE')
     or (select proacl from pg_proc where oid = v_rights)
        is distinct from array[
          'postgres=X/postgres', 'service_role=X/postgres'
        ]::aclitem[]
     or encode(extensions.digest(v_definition, 'sha256'), 'hex')
        is distinct from
        '9cfba864d7ea650370d6d76c33e2afcfbf941bb6918a90eeedec77f0513ab0db'
     or (select count(*)
         from aclexplode(coalesce(
           (select proacl from pg_proc where oid = v_rights),
           acldefault('f', v_rights_owner))) acl
         where acl.grantee <> v_rights_owner
           and acl.privilege_type = 'EXECUTE') <> 1
     or v_definition not like '%v_qa_staff_fields constant text[]%'
     or v_definition not like
        '%case when v_has_assignment then v_qa_staff_fields else%'
     or v_definition not like '%v_qa_manager_fields constant text[]%'
     or v_definition not like '%select true, v_qa_manager_fields,%' then
    raise exception using errcode = 'check_violation',
      message = 'QA_RIGHTS_ALIGNMENT_POSTCONDITION_RIGHTS_CONTRACT';
  end if;

  if current_setting('app.qa_rights_screen_mode_before', true)
       is distinct from (select value::text from public.system_config
                         where key = 'screen_access_mode')
     or current_setting('app.qa_rights_item_mode_before', true)
       is distinct from (select value::text from public.system_config
                         where key = 'item_permissions_mode') then
    raise exception using errcode = 'check_violation',
      message = 'QA_RIGHTS_ALIGNMENT_POSTCONDITION_PERMISSION_MODES';
  end if;

  if exists (
    select 1
    from public.profiles profile
    cross join lateral (
      select validation_code from public.vmp_plan_items
      where is_active order by validation_code limit 1
    ) item
    cross join lateral public.vmp_item_rights(
      profile.id, item.validation_code) rights
    where public.vmp_business_role(profile.id) = 'qa_manager'
      and (rights.can_view is not true
        or rights.editable_fields is distinct from array[
          'actual_protocol_date', 'status_protocol',
          'actual_validation_date', 'status_validation',
          'actual_report_date', 'status_report',
          'actual_vmp_date', 'status_vmp'
        ]::text[])
  ) then
    raise exception using errcode = 'check_violation',
      message = 'QA_RIGHTS_ALIGNMENT_POSTCONDITION_MANAGER_RUNTIME';
  end if;

  if exists (
    select 1
    from public.vmp_item_assignments assignment
    join public.vmp_performers performer
      on performer.id = assignment.performer_id and performer.is_active
    cross join lateral public.vmp_item_rights(
      performer.user_id, assignment.validation_code) rights
    where assignment.assignment_kind = 'qa'
      and assignment.is_active
      and (assignment.expires_at is null or assignment.expires_at > now())
      and public.vmp_business_role(performer.user_id) = 'qa_staff'
      and (rights.can_view is not true
        or rights.editable_fields is distinct from array[
          'actual_protocol_date', 'status_protocol', 'status_validation',
          'actual_report_date', 'status_report',
          'actual_vmp_date', 'status_vmp'
        ]::text[])
  ) then
    raise exception using errcode = 'check_violation',
      message = 'QA_RIGHTS_ALIGNMENT_POSTCONDITION_QA_STAFF_RUNTIME';
  end if;

  if exists (
    select 1
    from public.vmp_item_assignments assignment
    join public.vmp_performers performer
      on performer.id = assignment.performer_id and performer.is_active
    cross join lateral public.vmp_item_scope_matches(
      performer.id, assignment.validation_code) scope
    cross join lateral public.vmp_item_rights(
      performer.user_id, assignment.validation_code) rights
    where assignment.assignment_kind = 'equipment_department'
      and assignment.is_active
      and (assignment.expires_at is null or assignment.expires_at > now())
      and public.vmp_business_role(performer.user_id) = 'workshop_staff'
      and scope.scope_match and scope.factory_match
      and scope.area_match and scope.line_match
      and (rights.can_view is not true
        or rights.editable_fields is distinct from
           array['actual_validation_date']::text[])
  ) then
    raise exception using errcode = 'check_violation',
      message = 'QA_RIGHTS_ALIGNMENT_POSTCONDITION_WORKSHOP_RUNTIME';
  end if;

  if exists (
    select 1
    from (values
      ('public.vmp_my_item_rights(text)',
       'c7a326defaedd0cf9056a284e480d69027a56cd35f2ca6f09b4a9e321f1ad76d'),
      ('public.vmp_allowed_timeline_fields(uuid,text)',
       '235d5d2e4ff760a7640e2687be430a8a188a56d380b7cf7b72e6018bc71d9a3c'),
      ('public.rpc_update_progress(text,jsonb,text,jsonb,integer)',
       'da25f8acbcc5aa3e029e581acb79f210cf1d6c61ab0e8458e4ff89146e75f4a0'),
      ('public.rpc_update_progress__five_role_impl_20260824(text,jsonb,text,jsonb,integer)',
       '55f7f86442b88a12c39e1f3cb6dd867d0aae0a684db78365bcef673a473e2644')
    ) reviewed(signature, definition_hash)
    where encode(extensions.digest(
      pg_get_functiondef(reviewed.signature::regprocedure), 'sha256'), 'hex')
      is distinct from reviewed.definition_hash
  ) then
    raise exception using errcode = 'check_violation',
      message = 'QA_RIGHTS_ALIGNMENT_POSTCONDITION_WRAPPER_OR_WRITER_DRIFT';
  end if;

  if (select proacl from pg_proc where oid =
        'public.vmp_my_item_rights(text)'::regprocedure)
       is distinct from array[
         'postgres=X/postgres', 'service_role=X/postgres',
         'authenticated=X/postgres'
       ]::aclitem[]
     or (select owner.rolname from pg_proc p
         join pg_roles owner on owner.oid = p.proowner
         where p.oid = 'public.vmp_my_item_rights(text)'::regprocedure)
        is distinct from 'postgres'
     or (select proacl from pg_proc where oid =
        'public.rpc_update_progress(text,jsonb,text,jsonb,integer)'::regprocedure)
       is distinct from array[
         'postgres=X/postgres', 'service_role=X/postgres',
         'authenticated=X/postgres'
       ]::aclitem[] then
    raise exception using errcode = 'check_violation',
      message = 'QA_RIGHTS_ALIGNMENT_POSTCONDITION_WRAPPER_OR_WRITER_ACL';
  end if;
end
$postcondition$;

commit;

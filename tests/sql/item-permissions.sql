/*
 * Harness chỉ chạy file đầy đủ ở một trong hai trạng thái explicit:
 * --final-state khi schema đã có 20260811120000 (không replay migration), hoặc
 * --forward-test từ repaired pre-111200 với đúng migration 111200 được chỉ định.
 * Mọi SQL test/fixture chạy trong cùng transaction rồi rollback, nên không ghi
 * vào database thật; harness không tự chọn migration bằng glob.
 */
select 'ITEM_PERMISSION_SQL_PHASE_SCHEMA_CONTRACTS';

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '11111111-1111-1111-1111-111111111111',
    'role', 'authenticated'
  )::text,
  true
);

/* Chỉ tồn tại trong transaction rollback của harness; dùng để phân biệt
 * FOR UPDATE thật với khóa For Key Share phát sinh muộn từ foreign key. */
create extension if not exists pgrowlocks;

do $test$
begin
  if public.vmp_normalize_person_name('  Đặng   Thị Hồng Ngọc ')
      <> 'đặng thị hồng ngọc' then
    raise exception 'vmp_normalize_person_name không chuẩn hóa đúng';
  end if;

  if (select value #>> '{}'
      from public.system_config
      where key = 'item_permissions_mode') <> 'preview' then
    raise exception 'item_permissions_mode phải khởi tạo ở preview';
  end if;

  if exists (
    select 1
    from public.vmp_active_item_assignments
    where user_id is null and grants_access
  ) then
    raise exception 'Phân công chưa nối user_id không được cấp quyền';
  end if;

  if has_table_privilege('authenticated', 'public.vmp_item_assignments', 'SELECT')
      or has_table_privilege('anon', 'public.vmp_item_assignments', 'SELECT')
      or has_table_privilege('authenticated', 'public.vmp_active_item_assignments', 'SELECT')
      or has_table_privilege('anon', 'public.vmp_active_item_assignments', 'SELECT') then
    raise exception 'Browser role không được SELECT trực tiếp bảng/view phân công';
  end if;
  if not has_table_privilege('service_role', 'public.vmp_item_assignments', 'SELECT')
      or not has_table_privilege('service_role', 'public.vmp_active_item_assignments', 'SELECT') then
    raise exception 'service_role phải giữ quyền đọc bảng/view phân công';
  end if;
  if has_table_privilege('authenticated', 'public.vmp_item_assignments', 'INSERT')
      or has_table_privilege('authenticated', 'public.vmp_item_assignments', 'UPDATE')
      or has_table_privilege('authenticated', 'public.vmp_item_assignments', 'DELETE')
      or has_table_privilege('anon', 'public.vmp_item_assignments', 'INSERT')
      or has_table_privilege('anon', 'public.vmp_item_assignments', 'UPDATE')
      or has_table_privilege('anon', 'public.vmp_item_assignments', 'DELETE') then
    raise exception 'Browser role không được có quyền mutation bảng phân công';
  end if;
  if not has_table_privilege('service_role', 'public.vmp_item_assignments', 'INSERT')
      or not has_table_privilege('service_role', 'public.vmp_item_assignments', 'UPDATE')
      or not has_table_privilege('service_role', 'public.vmp_item_assignments', 'DELETE') then
    raise exception 'service_role phải giữ quyền mutation bảng phân công';
  end if;
  if to_regprocedure(
      'public.rpc_set_item_assignment(uuid,text,text,text,text,text)'
    ) is null then
    raise exception 'Thiếu RPC phân công có assignment_role';
  end if;
  if to_regprocedure(
      'public.rpc_set_item_assignment(uuid,text,text,text,text)'
    ) is not null then
    raise exception 'RPC phân công năm tham số phải được thay thế, không tạo overload';
  end if;
  if has_function_privilege(
      'service_role',
      'public.rpc_set_item_assignment(uuid,text,text,text,text,text)',
      'EXECUTE'
    ) or has_function_privilege(
      'anon',
      'public.rpc_set_item_assignment(uuid,text,text,text,text,text)',
      'EXECUTE'
    ) or not has_function_privilege(
      'authenticated',
      'public.rpc_set_item_assignment(uuid,text,text,text,text,text)',
      'EXECUTE'
    ) then
    raise exception 'Quyền RPC phân công sáu tham số chưa tối thiểu';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vmp_item_assignments'
      and column_name = 'assignment_role'
      and data_type = 'text'
      and is_nullable = 'YES'
  ) then
    raise exception 'Thiếu cột nullable assignment_role trên phân công';
  end if;
  if exists (
      select 1 from public.vmp_item_assignments
      where (assignment_kind = 'qa'
          and (assignment_role is null
            or assignment_role not in ('primary', 'collaborator')))
        or (assignment_kind = 'equipment_department'
          and assignment_role is not null)
    ) or exists (
      select 1
      from public.vmp_item_assignments
      where assignment_kind = 'qa' and assignment_role = 'primary' and is_active
      group by validation_code
      having count(*) > 1
    ) or exists (
      select 1
      from public.vmp_item_assignments
      where performer_id is not null and assignment_kind = 'qa' and is_active
      group by validation_code, performer_id, assignment_kind
      having count(*) > 1
    ) then
    raise exception 'Backfill assignment_role không thỏa constraint/uniqueness';
  end if;
  if exists (
    select 1 from public.vmp_item_assignments
    where assignment_kind = 'qa' and source = 'sheet_qa' and is_active
      and assignment_role <> 'primary'
  ) then
    raise exception 'Backfill phải ưu tiên sheet_qa làm QA chính';
  end if;

  if has_function_privilege(
      'authenticated', 'public.vmp_item_rights(uuid,text)', 'EXECUTE'
    ) or has_function_privilege(
      'authenticated', 'public.vmp_can_view_item(uuid,text)', 'EXECUTE'
    ) or has_function_privilege(
      'authenticated', 'public.vmp_allowed_timeline_fields(uuid,text)', 'EXECUTE'
    ) then
    raise exception 'Browser role không được gọi core quyền với p_uid tùy ý';
  end if;
  if not has_function_privilege(
      'authenticated', 'public.vmp_my_item_rights(text)', 'EXECUTE'
    ) then
    raise exception 'Browser role phải gọi được wrapper quyền của chính auth.uid()';
  end if;
  if has_table_privilege('anon', 'public.vmp_performers', 'SELECT') then
    raise exception 'anon không được đọc danh bạ performer có metadata quyền';
  end if;
  if has_function_privilege(
      'authenticated', 'public.rpc_set_item_performer(text,text)', 'EXECUTE'
    ) or has_function_privilege(
      'service_role', 'public.rpc_set_item_performer(text,text)', 'EXECUTE'
    ) or has_function_privilege(
      'authenticated',
      'public.vmp_set_item_assignment_unhardened(uuid,text,text,text,text)',
      'EXECUTE'
    ) or has_function_privilege(
      'service_role',
      'public.vmp_set_item_assignment_unhardened(uuid,text,text,text,text)',
      'EXECUTE'
    ) then
    raise exception 'Writer phân công legacy phải bị vô hiệu hóa hoàn toàn';
  end if;

  perform public.vmp_harden_dashboard_object_scope();
  perform public.vmp_harden_dashboard_object_scope();
  if regexp_count(
    pg_get_functiondef(
      'public.rpc_get_vmp_dashboard(integer,boolean,boolean)'::regprocedure
    ),
    'visible_object_item'
  ) <> 6 then
    raise exception 'Hardening dashboard objects không idempotent';
  end if;

  if public.vmp_parse_scheduled_at('12/08/2026 14:35:20')
      is distinct from '2026-08-12 14:35:20 Asia/Bangkok'::timestamptz then
    raise exception 'Parser lịch phải giữ đủ giờ theo múi giờ Bangkok';
  end if;
  if public.vmp_parse_scheduled_at('12/08/2026')
      is distinct from '2026-08-12 00:00:00 Asia/Bangkok'::timestamptz then
    raise exception 'Lịch chỉ có ngày phải mặc định 00:00:00';
  end if;
end
$test$;

set local role authenticated;
do $test$
declare
  v_denied boolean := false;
begin
  begin
    perform public.rpc_set_item_performer(
      '__E2E_TASK4_DENIED__', 'E2E writer legacy bị khóa'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'authenticated vẫn gọi trực tiếp được writer assignment legacy';
  end if;
end
$test$;
reset role;

set local role service_role;
do $test$
declare
  v_denied boolean := false;
begin
  begin
    perform public.rpc_set_item_performer(
      '__E2E_TASK4_DENIED__', 'E2E writer legacy bị khóa'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'service_role vẫn gọi trực tiếp được writer assignment legacy';
  end if;
end
$test$;
reset role;

/* Tài khoản chỉ được nối rõ ràng bởi Admin/service; QA không cần scope hierarchy. */
do $test$
declare
  v_admin uuid;
  v_user_1 uuid;
  v_user_2 uuid;
  v_user_1_email text;
  v_user_2_email text;
  v_person_1 uuid;
  v_person_2 uuid;
  v_admin_link_person uuid;
  v_non_qa_person uuid;
  v_old_admin_person uuid;
  v_old_user_1_person uuid;
  v_old_user_2_person uuid;
  v_old_admin_profile public.profiles%rowtype;
  v_old_user_1_profile public.profiles%rowtype;
  v_old_user_2_profile public.profiles%rowtype;
  v_reason_profile_before public.profiles%rowtype;
  v_reason_profile_after public.profiles%rowtype;
  v_assignment uuid;
  v_code text;
  v_version integer;
  v_result jsonb;
  v_directory jsonb;
  v_preflight jsonb;
  v_account_lock_key bigint;
  v_link_lock_key bigint;
  v_reason_audit_before bigint;
  v_reason_audit_after bigint;
begin
  select id into v_admin
  from public.profiles
  where role::text = 'admin' and coalesce(is_active, true)
  order by created_at limit 1;
  select id, email into v_user_1, v_user_1_email
  from public.profiles
  where id <> v_admin and coalesce(is_active, true)
  order by case when role::text = 'viewer' then 0 else 1 end, created_at
  limit 1;
  select id, email into v_user_2, v_user_2_email
  from public.profiles
  where id not in (v_admin, v_user_1) and coalesce(is_active, true)
  order by case when role::text = 'viewer' then 0 else 1 end, created_at
  limit 1;
  select validation_code into v_code
  from public.vmp_plan_items
  where is_active
  order by validation_code limit 1;
  if v_admin is null or v_user_1 is null or v_user_2 is null
      or v_user_1_email is null or v_user_2_email is null or v_code is null then
    raise exception 'Thiếu fixture account để kiểm nối tài khoản Admin';
  end if;

  select * into v_old_admin_profile from public.profiles where id = v_admin;
  select * into v_old_user_1_profile from public.profiles where id = v_user_1;
  select * into v_old_user_2_profile from public.profiles where id = v_user_2;
  select id into v_old_admin_person
  from public.vmp_performers where user_id = v_admin;
  select id into v_old_user_1_person
  from public.vmp_performers where user_id = v_user_1;
  select id into v_old_user_2_person
  from public.vmp_performers where user_id = v_user_2;
  update public.vmp_performers set user_id = null
  where user_id in (v_admin, v_user_1, v_user_2);
  update public.profiles
  set role = 'viewer', department = 'qa', is_active = true
  where id in (v_user_1, v_user_2);
  update public.profiles set department = null where id = v_admin;

  if has_function_privilege(
      'anon', 'public.rpc_item_permission_account_candidates(text)', 'EXECUTE'
    ) or has_function_privilege(
      'anon',
      'public.rpc_link_item_permission_account(uuid,uuid,text,integer)',
      'EXECUTE'
    ) or not has_function_privilege(
      'authenticated', 'public.rpc_item_permission_account_candidates(text)', 'EXECUTE'
    ) or not has_function_privilege(
      'authenticated',
      'public.rpc_link_item_permission_account(uuid,uuid,text,integer)',
      'EXECUTE'
    ) or not has_function_privilege(
      'service_role', 'public.rpc_item_permission_account_candidates(text)', 'EXECUTE'
    ) or not has_function_privilege(
      'service_role',
      'public.rpc_link_item_permission_account(uuid,uuid,text,integer)',
      'EXECUTE'
    ) or has_function_privilege(
      'authenticated', 'public.rpc_lien_ket_tai_khoan(uuid,uuid)', 'EXECUTE'
    ) or has_function_privilege(
      'service_role', 'public.rpc_lien_ket_tai_khoan(uuid,uuid)', 'EXECUTE'
    ) then
    raise exception 'Quyền EXECUTE RPC nối tài khoản không tối thiểu hoặc còn đường legacy';
  end if;
  if to_regprocedure(
      'public.rpc_upsert_item_permission_staff(uuid,jsonb,text)'
    ) is not null
      or (
        select count(*)
        from pg_proc procedure
        join pg_namespace namespace on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'public'
          and procedure.proname = 'rpc_upsert_item_permission_staff'
      ) <> 1
      or not exists (
        select 1 from pg_event_trigger
        where evtname = 'chan_overload_rpc_tg' and evtenabled = 'O'
      ) then
    raise exception 'Forward migration phải giữ trigger bật và chỉ một chữ ký upsert';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text,
    true
  );
  v_result := public.rpc_upsert_item_permission_staff(
    null,
    jsonb_build_object(
      'full_name', 'E2E QA Không Phạm Vi',
      'department', 'qa',
      'access_class', 'qa_manager',
      'email', v_user_1_email,
      'scope_departments', '[]'::jsonb,
      'scope_factory_ids', '[]'::jsonb,
      'scope_area_ids', '[]'::jsonb,
      'scope_line_ids', '[]'::jsonb,
      'is_active', true
    ),
    'Tạo QA chưa nối tài khoản',
    0
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or not (v_result ? 'user_id')
      or v_result->>'user_id' is not null then
    raise exception 'Lưu QA phải chấp nhận scope rỗng và không tự nối email: %', v_result;
  end if;
  v_person_1 := (v_result->>'person_id')::uuid;
  v_version := (v_result->>'version')::integer;

  v_result := public.rpc_import_item_permission_staff(
    jsonb_build_array(jsonb_build_object(
      'row_number', 1,
      'full_name', 'E2E QA Import Không Phạm Vi',
      'department', 'qa',
      'access_class', 'qa_progress_editor',
      'email', v_user_2_email,
      'scope_departments', '[]'::jsonb,
      'scope_factory_ids', '[]'::jsonb,
      'scope_area_ids', '[]'::jsonb,
      'scope_line_ids', '[]'::jsonb,
      'is_active', true
    )),
    'Nhập QA chưa nối tài khoản'
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or (v_result->>'imported')::integer is distinct from 1 then
    raise exception 'Importer phải dùng cùng luật QA scope rỗng: %', v_result;
  end if;
  select id into v_person_2
  from public.vmp_performers
  where performer_name = 'E2E QA Import Không Phạm Vi' and user_id is null;
  if v_person_2 is null then
    raise exception 'Importer không được tự nối profile chỉ vì trùng email';
  end if;

  insert into public.vmp_item_assignments (
    validation_code, performer_id, staff_name, assignment_kind, assignment_role, source,
    source_text, unresolved_reason, is_active, change_reason
  ) values (
    v_code, v_person_1, 'E2E QA Không Phạm Vi', 'qa', 'collaborator', 'qa_manager',
    'E2E QA Không Phạm Vi', 'account_unlinked', true,
    'Fixture nối tài khoản rõ ràng'
  ) returning id into v_assignment;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_2::text, 'role', 'authenticated')::text,
    true
  );
  v_result := public.rpc_item_permission_account_candidates(null);
  if (v_result->>'ok')::boolean is distinct from false
      or v_result->>'error_code' is distinct from 'FORBIDDEN' then
    raise exception 'Người không phải Admin không được xem account candidates: %', v_result;
  end if;
  v_result := public.rpc_link_item_permission_account(
    v_person_1, v_user_1, 'Thử nối không phải Admin', v_version
  );
  if (v_result->>'ok')::boolean is distinct from false
      or v_result->>'error_code' is distinct from 'FORBIDDEN' then
    raise exception 'Người không phải Admin không được nối tài khoản: %', v_result;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('role', 'service_role')::text,
    true
  );
  v_result := public.rpc_item_permission_account_candidates(v_user_1_email);
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'Service role hợp lệ phải xem được account candidates: %', v_result;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text,
    true
  );
  v_result := public.rpc_item_permission_account_candidates(v_user_1_email);
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or not exists (
        select 1 from jsonb_array_elements(v_result->'accounts') account
        where (account->>'user_id')::uuid = v_user_1
          and account->>'email' = v_user_1_email
          and account->>'role' = 'viewer'
          and account->>'department' = 'qa'
          and (account->>'is_active')::boolean
          and account ? 'linked_person_id'
          and account->>'linked_person_id' is null
      ) then
    raise exception 'Admin phải thấy profile QA chưa có chủ trong candidates: %', v_result;
  end if;

  v_result := public.rpc_link_item_permission_account(
    v_person_1, v_user_1, 'Thử nối với version cũ', v_version - 1
  );
  if (v_result->>'ok')::boolean is distinct from false
      or v_result->>'error_code' is distinct from 'VERSION_CONFLICT'
      or (v_result->>'current_version')::integer is distinct from v_version then
    raise exception 'Nối tài khoản phải kiểm optimistic version: %', v_result;
  end if;
  v_link_lock_key := pg_catalog.hashtextextended(
    'vmp:item-permission-account:' || v_user_1::text, 0
  );
  if not exists (
    select 1 from pg_catalog.pg_locks
    where locktype = 'advisory' and pid = pg_catalog.pg_backend_pid()
      and classid = ((v_link_lock_key >> 32) & 4294967295)::oid
      and objid = (v_link_lock_key & 4294967295)::oid
      and objsubid = 1 and mode = 'ExclusiveLock' and granted
  ) then
    raise exception 'rpc_link phải giữ cùng advisory xact lock theo account';
  end if;

  update public.profiles set is_active = false where id = v_user_1;
  v_result := public.rpc_link_item_permission_account(
    v_person_1, v_user_1, 'Thử nối profile inactive', v_version
  );
  if (v_result->>'ok')::boolean is distinct from false
      or v_result->>'error_code' is distinct from 'ACCOUNT_INACTIVE' then
    raise exception 'Không được nối profile inactive: %', v_result;
  end if;
  update public.profiles set is_active = true, department = 'xsx' where id = v_user_1;
  v_result := public.rpc_link_item_permission_account(
    v_person_1, v_user_1, 'Thử nối profile ngoài QA', v_version
  );
  if (v_result->>'ok')::boolean is distinct from false
      or v_result->>'error_code' is distinct from 'INVALID_QA_PRINCIPAL' then
    raise exception 'Không được nối người QA vào profile bộ phận khác: %', v_result;
  end if;
  update public.profiles set department = 'qa' where id = v_user_1;

  /* Cả set-role và link phải serialize trên cùng advisory key của account. */
  v_account_lock_key := pg_catalog.hashtextextended(
    'vmp:item-permission-account:' || v_user_2::text, 0
  );
  if exists (
    select 1 from pg_catalog.pg_locks
    where locktype = 'advisory' and pid = pg_catalog.pg_backend_pid()
      and classid = ((v_account_lock_key >> 32) & 4294967295)::oid
      and objid = (v_account_lock_key & 4294967295)::oid
      and objsubid = 1 and mode = 'ExclusiveLock' and granted
  ) then
    raise exception 'Fixture account lock phải bắt đầu ở trạng thái chưa khóa';
  end if;
  select * into v_reason_profile_before
  from public.profiles where id = v_user_2;
  select count(*) into v_reason_audit_before
  from public.audit_logs
  where table_name = 'profiles' and record_id = v_user_2::text;

  v_result := public.rpc_set_user_role(
    v_user_2, 'department_user', 'xsx', null, 'co'
  );
  select * into v_reason_profile_after
  from public.profiles where id = v_user_2;
  select count(*) into v_reason_audit_after
  from public.audit_logs
  where table_name = 'profiles' and record_id = v_user_2::text;
  if (v_result->>'ok')::boolean is distinct from false
      or v_result->>'error_code' is distinct from 'REASON_REQUIRED'
      or to_jsonb(v_reason_profile_after) is distinct from
         to_jsonb(v_reason_profile_before)
      or v_reason_profile_after.updated_at is distinct from
         v_reason_profile_before.updated_at
      or v_reason_audit_after <> v_reason_audit_before
      or exists (
        select 1 from pg_catalog.pg_locks
        where locktype = 'advisory' and pid = pg_catalog.pg_backend_pid()
          and classid = ((v_account_lock_key >> 32) & 4294967295)::oid
          and objid = (v_account_lock_key & 4294967295)::oid
          and objsubid = 1 and mode = 'ExclusiveLock' and granted
      ) then
    raise exception 'set-role reason null phải không lock/update/audit: %', v_result;
  end if;

  v_result := public.rpc_set_user_role(
    v_user_2, 'department_user', 'xsx', '   ', 'co'
  );
  select * into v_reason_profile_after
  from public.profiles where id = v_user_2;
  select count(*) into v_reason_audit_after
  from public.audit_logs
  where table_name = 'profiles' and record_id = v_user_2::text;
  if (v_result->>'ok')::boolean is distinct from false
      or v_result->>'error_code' is distinct from 'REASON_REQUIRED'
      or to_jsonb(v_reason_profile_after) is distinct from
         to_jsonb(v_reason_profile_before)
      or v_reason_profile_after.updated_at is distinct from
         v_reason_profile_before.updated_at
      or v_reason_audit_after <> v_reason_audit_before
      or exists (
        select 1 from pg_catalog.pg_locks
        where locktype = 'advisory' and pid = pg_catalog.pg_backend_pid()
          and classid = ((v_account_lock_key >> 32) & 4294967295)::oid
          and objid = (v_account_lock_key & 4294967295)::oid
          and objsubid = 1 and mode = 'ExclusiveLock' and granted
      ) then
    raise exception 'set-role reason blank phải không lock/update/audit: %', v_result;
  end if;

  v_result := public.rpc_set_user_role(
    v_user_2, 'viewer', 'qa', '  Kiểm khóa account set-role  ',
    v_old_user_2_profile.pham_vi
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or not exists (
        select 1 from pg_catalog.pg_locks
        where locktype = 'advisory' and pid = pg_catalog.pg_backend_pid()
          and classid = ((v_account_lock_key >> 32) & 4294967295)::oid
          and objid = (v_account_lock_key & 4294967295)::oid
          and objsubid = 1 and mode = 'ExclusiveLock' and granted
      ) then
    raise exception 'rpc_set_user_role phải giữ advisory xact lock của account: %',
      v_result;
  end if;
  if not exists (
    select 1 from public.audit_logs
    where table_name = 'profiles' and record_id = v_user_2::text
      and change_reason = 'Kiểm khóa account set-role'
  ) then
    raise exception 'Audit set-role phải lưu reason đã btrim';
  end if;

  update public.vmp_performers set is_active = false where id = v_person_2;
  v_result := public.rpc_link_item_permission_account(
    v_person_2, v_user_2, 'Thử nối performer inactive', 1
  );
  if (v_result->>'ok')::boolean is distinct from false
      or v_result->>'error_code' is distinct from 'PERSON_INACTIVE'
      or exists (
        select 1 from public.vmp_performers
        where id = v_person_2 and (user_id is not null or version <> 1)
      ) then
    raise exception 'Không được nối account vào performer inactive: %', v_result;
  end if;
  /* Dữ liệu linked+inactive có sẵn vẫn phải gỡ được để thu hồi coarse role. */
  update public.vmp_performers set user_id = v_user_2 where id = v_person_2;
  update public.profiles
  set role = 'qa_manager', department = 'qa'
  where id = v_user_2;
  v_result := public.rpc_link_item_permission_account(
    v_person_2, null, 'Thu hồi account của performer inactive', 1
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or (v_result->>'version')::integer is distinct from 2
      or exists (
        select 1 from public.vmp_performers
        where id = v_person_2 and user_id is not null
      ) or not exists (
        select 1 from public.profiles
        where id = v_user_2 and role::text = 'viewer'
      ) then
    raise exception 'Performer inactive đã linked phải gỡ và hạ role được: %', v_result;
  end if;
  update public.vmp_performers set is_active = true where id = v_person_2;

  v_result := public.rpc_link_item_permission_account(
    v_person_1, v_user_1, 'Admin xác nhận nối QA', v_version
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or (v_result->>'user_id')::uuid is distinct from v_user_1
      or v_result->>'account_status' is distinct from 'linked'
      or (v_result->>'version')::integer is distinct from v_version + 1 then
    raise exception 'Admin phải nối được profile QA hợp lệ: %', v_result;
  end if;
  v_version := (v_result->>'version')::integer;
  if not exists (
      select 1 from public.vmp_item_assignments
      where id = v_assignment and user_id = v_user_1 and unresolved_reason is null
    ) or not exists (
      select 1 from public.profiles
      where id = v_user_1 and role::text = 'qa_manager' and department = 'qa'
  ) then
    raise exception 'Nối account phải đồng bộ assignment và coarse role QA manager';
  end if;

  v_result := public.rpc_upsert_item_permission_staff(
    v_person_1, jsonb_build_object('is_active', false),
    'Thử deactivate khi account còn nối', v_version
  );
  if (v_result->>'ok')::boolean is distinct from false
      or v_result->>'error_code' is distinct from 'ACCOUNT_UNLINK_REQUIRED'
      or not exists (
        select 1 from public.vmp_performers
        where id = v_person_1 and is_active and user_id = v_user_1
          and version = v_version
      ) or not exists (
        select 1 from public.profiles
        where id = v_user_1 and role::text = 'qa_manager' and department = 'qa'
      ) then
    raise exception 'Linked performer phải unlink trước khi deactivate: %', v_result;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_1::text, 'role', 'authenticated')::text,
    true
  );
  v_result := public.rpc_upsert_performer(
    v_person_1,
    jsonb_build_object(
      'performer_name', 'E2E Legacy QA Manager Bypass',
      'is_active', false
    )
  );
  if (v_result->>'ok')::boolean is distinct from false
      or v_result->>'error_code' is distinct from 'LEGACY_RPC_DISABLED' then
    raise exception 'QA manager không được mutate qua rpc_upsert_performer legacy: %',
      v_result;
  end if;
  v_result := public.rpc_delete_performer(v_person_1);
  if (v_result->>'ok')::boolean is distinct from false
      or v_result->>'error_code' is distinct from 'LEGACY_RPC_DISABLED'
      or not exists (
        select 1 from public.vmp_performers
        where id = v_person_1 and performer_name = 'E2E QA Không Phạm Vi'
          and is_active and user_id = v_user_1 and version = v_version
      ) then
    raise exception 'QA manager không được delete qua RPC performer legacy: %', v_result;
  end if;
  v_directory := public.rpc_item_permission_directory(null);
  if coalesce((v_directory->>'ok')::boolean, false) is not true then
    raise exception 'QA manager đã nối phải có principal quản lý hợp lệ: %', v_directory;
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text,
    true
  );
  v_result := public.rpc_upsert_performer(
    v_person_1,
    jsonb_build_object(
      'performer_name', 'E2E Legacy Admin Bypass',
      'is_active', false
    )
  );
  if (v_result->>'ok')::boolean is distinct from false
      or v_result->>'error_code' is distinct from 'LEGACY_RPC_DISABLED' then
    raise exception 'Admin không được mutate qua rpc_upsert_performer legacy: %', v_result;
  end if;
  v_result := public.rpc_delete_performer(v_person_1);
  if (v_result->>'ok')::boolean is distinct from false
      or v_result->>'error_code' is distinct from 'LEGACY_RPC_DISABLED'
      or not exists (
        select 1 from public.vmp_performers
        where id = v_person_1 and performer_name = 'E2E QA Không Phạm Vi'
          and is_active and user_id = v_user_1 and version = v_version
      ) then
    raise exception 'Admin không được delete qua RPC performer legacy: %', v_result;
  end if;
  v_result := public.rpc_set_user_role(
    v_user_1, 'viewer', 'xsx',
    'Thử làm lệch profile đang linked', null
  );
  if (v_result->>'ok')::boolean is distinct from false
      or v_result->>'error_code' is distinct from 'ACCOUNT_RELINK_REQUIRED'
      or not exists (
        select 1 from public.profiles
        where id = v_user_1 and role::text = 'qa_manager' and department = 'qa'
      ) then
    raise exception 'rpc_set_user_role không được làm lệch profile linked: %', v_result;
  end if;

  v_result := public.rpc_link_item_permission_account(
    v_person_2, v_user_1, 'Thử dùng account đã nối', 2
  );
  if (v_result->>'ok')::boolean is distinct from false
      or v_result->>'error_code' is distinct from 'ACCOUNT_ALREADY_LINKED' then
    raise exception 'Một account không được nối hai performer: %', v_result;
  end if;

  v_result := public.rpc_upsert_item_permission_staff(
    v_person_1, jsonb_build_object('department', 'xsx'),
    'Thử đổi bộ phận khi còn account', v_version
  );
  if (v_result->>'ok')::boolean is distinct from false
      or v_result->>'error_code' is distinct from 'ACCOUNT_RELINK_REQUIRED' then
    raise exception 'Hồ sơ linked không được đổi department trước khi unlink: %', v_result;
  end if;
  v_result := public.rpc_upsert_item_permission_staff(
    v_person_1, jsonb_build_object('access_class', 'qa_progress_editor'),
    'Thử đổi phân loại khi còn account', v_version
  );
  if (v_result->>'ok')::boolean is distinct from false
      or v_result->>'error_code' is distinct from 'ACCOUNT_RELINK_REQUIRED' then
    raise exception 'Hồ sơ linked không được đổi access_class trước khi unlink: %', v_result;
  end if;

  v_directory := public.rpc_item_permission_directory('E2E QA Không Phạm Vi');
  if not exists (
    select 1 from jsonb_array_elements(v_directory->'people') person
    where (person->>'person_id')::uuid = v_person_1
      and (person->>'version')::integer = v_version
      and person->>'account_status' = 'linked'
  ) then
    raise exception 'Directory phải giữ version/account_status sau nối: %', v_directory;
  end if;
  if not exists (
    select 1 from public.audit_logs
    where table_name = 'vmp_performers' and record_id = v_person_1::text
      and change_reason = 'Admin xác nhận nối QA'
      and old_data ? 'performer' and old_data ? 'profile'
      and new_data ? 'performer' and new_data ? 'profile'
      and old_data #>> '{profile,role}' = 'viewer'
      and new_data #>> '{profile,role}' = 'qa_manager'
  ) then
    raise exception 'Nối account phải audit old/new profile + performer và lý do';
  end if;

  v_result := public.rpc_link_item_permission_account(
    v_person_1, null, 'Admin xác nhận gỡ QA manager', v_version
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or not (v_result ? 'user_id')
      or v_result->>'user_id' is not null
      or v_result->>'account_status' is distinct from 'unlinked'
      or (v_result->>'version')::integer is distinct from v_version + 1 then
    raise exception 'Admin phải gỡ được account với optimistic version: %', v_result;
  end if;
  if not exists (
      select 1 from public.vmp_item_assignments
      where id = v_assignment and user_id is null
        and unresolved_reason = 'account_unlinked'
    ) or not exists (
      select 1 from public.profiles
      where id = v_user_1 and role::text = 'viewer' and department = 'qa'
    ) then
    raise exception 'Gỡ account phải đồng bộ assignment và hạ qa_manager về viewer';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_1::text, 'role', 'authenticated')::text,
    true
  );
  v_result := public.rpc_item_permission_account_candidates(null);
  if (v_result->>'ok')::boolean is distinct from false
      or v_result->>'error_code' is distinct from 'FORBIDDEN' then
    raise exception 'Account đã gỡ manager không được giữ đường quản trị: %', v_result;
  end if;
  v_directory := public.rpc_item_permission_directory(null);
  if (v_directory->>'ok')::boolean is distinct from false then
    raise exception 'Account đã gỡ manager không được gọi RPC quản lý: %', v_directory;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text,
    true
  );
  v_result := public.rpc_upsert_item_permission_staff(
    null,
    jsonb_build_object(
      'full_name', 'E2E QA Account Admin', 'department', 'qa',
      'access_class', 'qa_manager',
      'scope_departments', '[]'::jsonb,
      'scope_factory_ids', '[]'::jsonb,
      'scope_area_ids', '[]'::jsonb,
      'scope_line_ids', '[]'::jsonb,
      'is_active', true
    ),
    'Tạo QA để kiểm bảo vệ Admin', 0
  );
  v_admin_link_person := (v_result->>'person_id')::uuid;
  v_result := public.rpc_link_item_permission_account(
    v_admin_link_person, v_admin, 'Nối profile Admin', 1
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or not exists (
        select 1 from public.profiles where id = v_admin and role::text = 'admin'
      ) then
    raise exception 'Nối QA không được hạ coarse role Admin: %', v_result;
  end if;
  v_result := public.rpc_link_item_permission_account(
    v_admin_link_person, null, 'Gỡ profile Admin', 2
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or not exists (
        select 1 from public.profiles where id = v_admin and role::text = 'admin'
      ) then
    raise exception 'Gỡ QA không được hạ coarse role Admin: %', v_result;
  end if;

  /* QA scope rỗng hợp lệ; người ngoài QA vẫn fail closed đủ hierarchy. */
  insert into public.vmp_performers (
    performer_name, department, access_class, scope_departments,
    access_areas, scope_factory_ids, scope_area_ids, scope_line_ids,
    is_active, updated_by
  ) values (
    'E2E Non QA Scope Rỗng', 'xsx', 'view_only', '{}'::text[],
    '{}'::text[], '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], true, v_admin
  ) returning id into v_non_qa_person;
  update public.vmp_performers set is_active = false where id = v_person_2;
  insert into public.vmp_item_assignments (
    validation_code, performer_id, staff_name, assignment_kind, assignment_role, source,
    source_text, unresolved_reason, is_active, change_reason
  ) values (
    v_code, v_person_2, 'E2E QA Import Không Phạm Vi', 'qa', 'collaborator', 'qa_manager',
    'E2E QA Import Không Phạm Vi', 'account_unlinked', true,
    'Fixture performer inactive'
  ) returning id into v_assignment;
  update public.vmp_item_assignments set user_id = v_user_2
  where id = v_assignment;

  v_preflight := public.rpc_item_permission_preflight();
  if exists (
    select 1 from jsonb_array_elements(v_preflight->'blocking_errors') error
    where error->>'code' in ('INCOMPLETE_ACTIVE_PERSON', 'INCOMPLETE_SCOPE_HIERARCHY')
      and (error->>'record_id')::uuid in (v_person_1, v_person_2)
  ) then
    raise exception 'Preflight không được block QA chỉ vì scope rỗng: %', v_preflight;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_preflight->'blocking_errors') error
    where error->>'code' = 'INCOMPLETE_ACTIVE_PERSON'
      and (error->>'record_id')::uuid = v_non_qa_person
  ) or not exists (
    select 1 from jsonb_array_elements(v_preflight->'blocking_errors') error
    where error->>'code' = 'INCOMPLETE_SCOPE_HIERARCHY'
      and (error->>'record_id')::uuid = v_non_qa_person
  ) then
    raise exception 'Preflight phải giữ fail-closed hierarchy cho non-QA: %', v_preflight;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_preflight->'blocking_errors') error
    where error->>'code' = 'ASSIGNMENT_PERSON_INACTIVE'
      and (error->>'record_id')::uuid = v_assignment
  ) or not exists (
    select 1 from jsonb_array_elements(v_preflight->'blocking_errors') error
    where error->>'code' = 'ASSIGNMENT_USER_MISMATCH'
      and (error->>'record_id')::uuid = v_assignment
  ) then
    raise exception 'Preflight phải chặn assignment inactive/user mismatch: %', v_preflight;
  end if;

  delete from public.vmp_item_assignments
  where performer_id in (v_person_1, v_person_2, v_admin_link_person, v_non_qa_person);
  delete from public.vmp_performers
  where id in (v_person_1, v_person_2, v_admin_link_person, v_non_qa_person);
  update public.profiles
  set role = v_old_admin_profile.role,
      department = v_old_admin_profile.department,
      is_active = v_old_admin_profile.is_active
  where id = v_admin;
  update public.profiles
  set role = v_old_user_1_profile.role,
      department = v_old_user_1_profile.department,
      is_active = v_old_user_1_profile.is_active
  where id = v_user_1;
  update public.profiles
  set role = v_old_user_2_profile.role,
      department = v_old_user_2_profile.department,
      is_active = v_old_user_2_profile.is_active
  where id = v_user_2;
  update public.vmp_performers set user_id = v_admin
  where id = v_old_admin_person;
  update public.vmp_performers set user_id = v_user_1
  where id = v_old_user_1_person;
  update public.vmp_performers set user_id = v_user_2
  where id = v_old_user_2_person;
end
$test$;

select 'ITEM_PERMISSION_SQL_PHASE_CANONICAL_SCOPE';

/* Import lỗi một dòng phải rollback cả các dòng đã tạo trước đó. */
do $test$
declare
  v_admin uuid;
  v_failed boolean := false;
  v_factory constant uuid := '70000000-0000-0000-0000-000000000001';
  v_area constant uuid := '80000000-0000-0000-0000-000000000001';
  v_line constant uuid := '90000000-0000-0000-0000-000000000001';
begin
  select id into v_admin from public.profiles
  where role::text = 'admin' and coalesce(is_active, true)
  order by created_at limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  insert into public.vmp_scope_factories(id, code, name, department_id)
  values (v_factory, 'IMPORT-F', 'Import factory', 'xsx');
  insert into public.vmp_scope_areas(id, code, name, factory_id)
  values (v_area, 'IMPORT-A', 'Import area', v_factory);
  insert into public.vmp_scope_lines(id, code, name, area_id)
  values (v_line, 'IMPORT-L', 'Import line', v_area);
  begin
    perform public.rpc_import_item_permission_staff(
      jsonb_build_array(
        jsonb_build_object(
          'row_number', 1, 'employee_code', 'E2E-IMPORT-ATOMIC-OK',
          'full_name', 'E2E Import Atomic Hợp Lệ', 'department', 'xsx',
          'access_class', 'view_only',
          'scope_departments', jsonb_build_array('xsx'),
          'scope_factory_ids', jsonb_build_array(v_factory),
          'scope_area_ids', jsonb_build_array(v_area),
          'scope_line_ids', jsonb_build_array(v_line)
        ),
        jsonb_build_object(
          'row_number', 2, 'employee_code', 'E2E-IMPORT-ATOMIC-BAD',
          'department', 'xsx', 'access_class', 'view_only',
          'scope_departments', jsonb_build_array('xsx'),
          'scope_factory_ids', jsonb_build_array(v_factory),
          'scope_area_ids', jsonb_build_array(v_area),
          'scope_line_ids', jsonb_build_array(v_line)
        )
      ),
      'Kiểm import rollback toàn bộ'
    );
  exception when sqlstate 'VMP01' then
    v_failed := sqlerrm like 'IMPORT_ROW_FAILED:%';
  end;
  if not v_failed or exists (
    select 1 from public.vmp_performers
    where employee_code in ('E2E-IMPORT-ATOMIC-OK', 'E2E-IMPORT-ATOMIC-BAD')
  ) then
    raise exception 'Import phải raise IMPORT_ROW_FAILED và rollback mọi dòng';
  end if;
  delete from public.vmp_scope_lines where id = v_line;
  delete from public.vmp_scope_areas where id = v_area;
  delete from public.vmp_scope_factories where id = v_factory;
end
$test$;

/* Mã area/line trùng trong hai factory cùng department phải fail closed. */
do $test$
declare
  v_admin uuid;
  v_person uuid;
  v_code text;
  v_department text;
  v_area_code text;
  v_line_code text;
  v_match record;
  v_preview jsonb;
  v_preflight jsonb;
  v_factory_1 constant uuid := '40000000-0000-0000-0000-000000000001';
  v_factory_2 constant uuid := '40000000-0000-0000-0000-000000000002';
  v_area_1 constant uuid := '50000000-0000-0000-0000-000000000001';
  v_area_2 constant uuid := '50000000-0000-0000-0000-000000000002';
  v_line_1 constant uuid := '60000000-0000-0000-0000-000000000001';
  v_line_2 constant uuid := '60000000-0000-0000-0000-000000000002';
begin
  select id into v_admin from public.profiles
  where role::text = 'admin' and coalesce(is_active, true)
  order by created_at limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  select item.validation_code, object.department,
         nullif(btrim(object.area), ''), nullif(btrim(object.line), '')
  into v_code, v_department, v_area_code, v_line_code
  from public.vmp_plan_items item
  join public.vmp_objects object on object.code = item.object_code
  where item.is_active and nullif(btrim(object.area), '') is not null
  order by (nullif(btrim(object.line), '') is not null) desc, item.validation_code
  limit 1;
  if v_code is null then raise exception 'Thiếu item có area để kiểm hierarchy'; end if;

  update public.vmp_scope_factories set is_active = false;
  insert into public.vmp_scope_factories(id, code, name, department_id)
  values (v_factory_1, 'PATH-1', 'Path 1', v_department),
         (v_factory_2, 'PATH-2', 'Path 2', v_department);
  insert into public.vmp_scope_areas(id, code, name, factory_id)
  values (v_area_1, v_area_code, 'Area path 1', v_factory_1),
         (v_area_2, v_area_code, 'Area path 2', v_factory_2);
  if v_line_code is not null then
    insert into public.vmp_scope_lines(id, code, name, area_id)
    values (v_line_1, v_line_code, 'Line path 1', v_area_1),
           (v_line_2, v_line_code, 'Line path 2', v_area_2);
  end if;
  update public.vmp_scope_factories set is_active = false where id = v_factory_2;

  insert into public.vmp_performers(
    performer_name, department, access_class, scope_departments,
    access_areas, scope_factory_ids, scope_area_ids, scope_line_ids,
    is_active, updated_by
  ) values (
    'E2E Scope Path Person', v_department, 'view_only', array[v_department],
    array[v_area_code], array[v_factory_1], array[v_area_1],
    case when v_line_code is null then '{}'::uuid[] else array[v_line_1] end,
    true, v_admin
  ) returning id into v_person;

  select * into v_match from public.vmp_item_scope_matches(v_person, v_code);
  if not v_match.scope_match or not v_match.factory_match
      or not v_match.area_match or not v_match.line_match then
    raise exception 'Một canonical path duy nhất phải match đủ bốn tầng';
  end if;
  update public.vmp_scope_factories set is_active = true where id = v_factory_2;
  select * into v_match from public.vmp_item_scope_matches(v_person, v_code);
  if v_match.scope_match or v_match.factory_match
      or v_match.area_match or v_match.line_match then
    raise exception 'Hai path trùng code phải fail closed toàn bộ';
  end if;

  v_preview := public.rpc_preview_item_rights(v_person, v_code);
  if not (v_preview->'rights'->0 ? 'factory_match')
      or not (v_preview->'rights'->0 ? 'line_match') then
    raise exception 'Preview phải trả factory_match và line_match: %', v_preview;
  end if;
  v_preflight := public.rpc_item_permission_preflight();
  if not exists (
    select 1 from jsonb_array_elements(v_preflight->'blocking_errors') error
    where error->>'code' = 'ITEM_SCOPE_HIERARCHY_AMBIGUOUS'
      and error->>'record_id' = v_code
  ) then
    raise exception 'Preflight phải chặn item có hierarchy mơ hồ: %', v_preflight;
  end if;
  delete from public.vmp_performers where id = v_person;
  delete from public.vmp_scope_lines where id in (v_line_1, v_line_2);
  delete from public.vmp_scope_areas where id in (v_area_1, v_area_2);
  delete from public.vmp_scope_factories where id in (v_factory_1, v_factory_2);
end
$test$;

/* Danh mục chuẩn khởi tạo rỗng; chỉ quan hệ được nhập rõ ràng mới hợp lệ. */
do $test$
declare
  v_admin uuid;
  v_catalog jsonb;
  v_factory_1 constant uuid := '10000000-0000-0000-0000-000000000001';
  v_factory_2 constant uuid := '10000000-0000-0000-0000-000000000002';
  v_factory_3 constant uuid := '10000000-0000-0000-0000-000000000003';
  v_area_1 constant uuid := '20000000-0000-0000-0000-000000000001';
  v_area_2 constant uuid := '20000000-0000-0000-0000-000000000002';
  v_area_3 constant uuid := '20000000-0000-0000-0000-000000000003';
  v_area_4 constant uuid := '20000000-0000-0000-0000-000000000004';
  v_line_1 constant uuid := '30000000-0000-0000-0000-000000000001';
  v_line_2 constant uuid := '30000000-0000-0000-0000-000000000002';
  v_line_3 constant uuid := '30000000-0000-0000-0000-000000000003';
  v_line_4 constant uuid := '30000000-0000-0000-0000-000000000004';
begin
  if exists (select 1 from public.vmp_scope_factories)
      or exists (select 1 from public.vmp_scope_areas)
      or exists (select 1 from public.vmp_scope_lines) then
    raise exception 'Migration không được đoán hoặc tự sinh xưởng/khu vực/line';
  end if;

  insert into public.vmp_scope_factories(id, code, name, department_id)
  values
    (v_factory_1, 'X1', 'Xưởng 1', 'xsx'),
    (v_factory_2, 'X2', 'Xưởng 2', 'qa'),
    (v_factory_3, 'X3', 'Xưởng 3', 'qc');
  insert into public.vmp_scope_areas(id, code, name, factory_id)
  values
    (v_area_1, 'C1', 'Khu vực C1', v_factory_1),
    (v_area_2, 'C2', 'Khu vực C2', v_factory_2),
    (v_area_3, 'QC-A', 'Khu vực QC', v_factory_3),
    (v_area_4, 'A1', 'Khu vực A1', v_factory_1);
  insert into public.vmp_scope_lines(id, code, name, area_id)
  values
    (v_line_1, 'BFS', 'BFS', v_area_1),
    (v_line_2, 'LQA', 'Line QA', v_area_2),
    (v_line_3, 'LQC', 'Line QC', v_area_3),
    (v_line_4, 'LA1', 'Line A1', v_area_4);

  if not public.vmp_valid_permission_scope(
    array['xsx'], array[v_factory_1], array[v_area_1], array[v_line_1]
  ) then
    raise exception 'Đường department→factory→area→line đúng phải hợp lệ';
  end if;
  if public.vmp_valid_permission_scope(
    array['qa'], array[v_factory_1], array[v_area_1], array[v_line_1]
  ) then
    raise exception 'Xưởng ngoài bộ phận đã chọn phải bị từ chối';
  end if;
  if public.vmp_valid_permission_scope(
    array['xsx'], array[v_factory_1], array[v_area_2], array[v_line_2]
  ) then
    raise exception 'Khu vực/line ngoài xưởng đã chọn phải bị từ chối';
  end if;
  if public.vmp_valid_permission_scope(
    array['khong-ton-tai'], array[v_factory_1], array[v_area_1], array[v_line_1]
  ) then
    raise exception 'Mã bộ phận không tồn tại phải bị từ chối';
  end if;

  select id into v_admin
  from public.profiles
  where role::text = 'admin' and coalesce(is_active, true)
  order by created_at limit 1;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text,
    true
  );
  v_catalog := public.rpc_item_permission_scope_catalog();
  if coalesce((v_catalog->>'ok')::boolean, false) is not true
      or not exists (
        select 1 from jsonb_array_elements(v_catalog->'factories') value
        where (value->>'id')::uuid = v_factory_1
          and value->>'department_id' = 'xsx'
      )
      or not exists (
        select 1 from jsonb_array_elements(v_catalog->'areas') value
        where (value->>'id')::uuid = v_area_1
          and (value->>'factory_id')::uuid = v_factory_1
      )
      or not exists (
        select 1 from jsonb_array_elements(v_catalog->'lines') value
        where (value->>'id')::uuid = v_line_1
          and (value->>'area_id')::uuid = v_area_1
      ) then
    raise exception 'RPC catalog không trả đúng quan hệ chuẩn: %', v_catalog;
  end if;

  if has_table_privilege('authenticated', 'public.vmp_scope_factories', 'SELECT')
      or has_table_privilege('authenticated', 'public.vmp_scope_areas', 'SELECT')
      or has_table_privilege('authenticated', 'public.vmp_scope_lines', 'SELECT')
      or has_function_privilege(
        'anon', 'public.rpc_item_permission_scope_catalog()', 'EXECUTE'
      ) then
    raise exception 'Browser không được bỏ qua RPC catalog hoặc anon gọi catalog';
  end if;
end
$test$;

/* RPC bốn tham số lưu nguyên khối, khóa phiên bản; overload cũ bị loại bỏ. */
do $test$
declare
  v_admin uuid;
  v_person_1 uuid;
  v_person_2 uuid;
  v_canonical_person uuid;
  v_object_kind text;
  v_result jsonb;
  v_directory jsonb;
  v_preflight jsonb;
  v_dashboard jsonb;
  v_code text;
  v_object_code text;
  v_year integer;
  v_factory_1 constant uuid := '10000000-0000-0000-0000-000000000001';
  v_area_1 constant uuid := '20000000-0000-0000-0000-000000000001';
  v_area_2 constant uuid := '20000000-0000-0000-0000-000000000002';
  v_line_1 constant uuid := '30000000-0000-0000-0000-000000000001';
  v_line_2 constant uuid := '30000000-0000-0000-0000-000000000002';
begin
  select id into v_admin
  from public.profiles
  where role::text = 'admin' and coalesce(is_active, true)
  order by created_at limit 1;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text,
    true
  );

  v_result := public.rpc_upsert_item_permission_staff(
    null,
    jsonb_build_object(
      'employee_code', 'E2E-SCOPE-PERSON-1',
      'full_name', 'E2E Person ID Trùng Tên',
      'department', 'xsx',
      'access_class', 'view_only',
      'scope_departments', jsonb_build_array('xsx'),
      'scope_factory_ids', jsonb_build_array(v_factory_1),
      'scope_area_ids', jsonb_build_array(v_area_1),
      'scope_line_ids', jsonb_build_array(v_line_1)
    ),
    'Tạo hồ sơ phạm vi liên kết',
    0
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or (v_result->>'version')::integer is distinct from 1 then
    raise exception 'Không tạo được hồ sơ phạm vi liên kết: %', v_result;
  end if;
  v_person_1 := (v_result->>'person_id')::uuid;
  if (select count(*) from public.audit_logs
      where table_name = 'vmp_performers'
        and record_id = v_person_1::text
        and change_reason = 'Tạo hồ sơ phạm vi liên kết') <> 1
      or not exists (
        select 1 from public.audit_logs
        where table_name = 'vmp_performers' and record_id = v_person_1::text
          and change_reason = 'Tạo hồ sơ phạm vi liên kết'
          and action::text = 'INSERT'
          and (new_data->>'version')::integer = 1
          and new_data->'access_areas' <> jsonb_build_array('*')
      ) then
    raise exception 'Upsert mới phải ghi đúng một audit trạng thái cuối, không wildcard';
  end if;

  v_directory := public.rpc_item_permission_directory('E2E Person ID Trùng Tên');
  if not exists (
    select 1 from jsonb_array_elements(v_directory->'people') person
    where (person->>'person_id')::uuid = v_person_1
      and (person->>'version')::integer = 1
      and person->'scope_factory_ids' = jsonb_build_array(v_factory_1)
      and person->'scope_area_ids' = jsonb_build_array(v_area_1)
      and person->'scope_line_ids' = jsonb_build_array(v_line_1)
  ) then
    raise exception 'Directory thiếu scope UUID/version mới: %', v_directory;
  end if;

  v_result := public.rpc_upsert_item_permission_staff(
    v_person_1,
    jsonb_build_object(
      'full_name', 'E2E Person ID Sau Khi Đổi Tên',
      'scope_departments', jsonb_build_array('xsx'),
      'scope_factory_ids', jsonb_build_array(v_factory_1),
      'scope_area_ids', jsonb_build_array(v_area_1),
      'scope_line_ids', jsonb_build_array(v_line_1)
    ),
    'Đổi tên đúng phiên bản',
    1
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or (v_result->>'version')::integer is distinct from 2 then
    raise exception 'Cập nhật đúng phiên bản phải tăng version đúng một lần: %', v_result;
  end if;

  v_result := public.rpc_upsert_item_permission_staff(
    v_person_1,
    jsonb_build_object(
      'full_name', 'E2E Tên Không Được Ghi',
      'scope_departments', jsonb_build_array('xsx'),
      'scope_factory_ids', jsonb_build_array(v_factory_1),
      'scope_area_ids', jsonb_build_array(v_area_1),
      'scope_line_ids', jsonb_build_array(v_line_1)
    ),
    'Thử ghi bằng phiên bản cũ',
    1
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false
      or v_result->>'error_code' is distinct from 'VERSION_CONFLICT'
      or exists (
        select 1 from public.vmp_performers
        where id = v_person_1 and performer_name = 'E2E Tên Không Được Ghi'
      ) then
    raise exception 'Phiên bản cũ phải bị từ chối trước mọi thay đổi: %', v_result;
  end if;

  v_result := public.rpc_upsert_item_permission_staff(
    v_person_1,
    jsonb_build_object(
      'full_name', 'E2E Quan Hệ Sai Không Được Ghi',
      'scope_departments', jsonb_build_array('xsx'),
      'scope_factory_ids', jsonb_build_array(v_factory_1),
      'scope_area_ids', jsonb_build_array(v_area_2),
      'scope_line_ids', jsonb_build_array(v_line_2)
    ),
    'Thử ghi quan hệ sai',
    2
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false
      or v_result->>'error_code' is distinct from 'INVALID_SCOPE_HIERARCHY'
      or exists (
        select 1 from public.vmp_performers
        where id = v_person_1
          and performer_name = 'E2E Quan Hệ Sai Không Được Ghi'
      )
      or (select version from public.vmp_performers where id = v_person_1) <> 2 then
    raise exception 'Quan hệ sai phải rollback toàn bộ hồ sơ/version: %', v_result;
  end if;

  /* Tên chuẩn hóa trùng là hợp lệ; person_id mới là khóa phân biệt. */
  v_result := public.rpc_upsert_item_permission_staff(
    null,
    jsonb_build_object(
      'employee_code', 'E2E-SCOPE-PERSON-2',
      'full_name', '  E2E   Person ID Sau Khi Đổi Tên ',
      'department', 'xsx',
      'access_class', 'view_only',
      'scope_departments', jsonb_build_array('xsx'),
      'scope_factory_ids', jsonb_build_array(v_factory_1),
      'scope_area_ids', jsonb_build_array(v_area_1),
      'scope_line_ids', jsonb_build_array(v_line_1)
    ),
    'Tạo người trùng tên hợp lệ',
    0
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'Không được cấm hai person_id có tên giống nhau: %', v_result;
  end if;
  v_person_2 := (v_result->>'person_id')::uuid;

  /* Mọi create đều đi qua hợp đồng canonical có expected_version. */
  v_result := public.rpc_upsert_item_permission_staff(
    null,
    jsonb_build_object(
      'employee_code', 'E2E-SCOPE-LEGACY',
      'full_name', 'E2E Scope Legacy Ba Tham Số',
      'department', 'xsx',
      'access_class', 'view_only',
      'scope_departments', jsonb_build_array('xsx'),
      'scope_factory_ids', jsonb_build_array(v_factory_1),
      'scope_area_ids', jsonb_build_array(v_area_1),
      'scope_line_ids', jsonb_build_array(v_line_1)
    ),
    'Kiểm hợp đồng canonical',
    0
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'RPC canonical phải tạo được hồ sơ: %', v_result;
  end if;
  v_canonical_person := (v_result->>'person_id')::uuid;

  select item.validation_code, item.object_code, item.year, source.object_kind
  into v_code, v_object_code, v_year, v_object_kind
  from public.vmp_plan_items item
  join public.vmp_source_objects source on source.object_code = item.object_code
  where item.is_active
  order by item.validation_code limit 1;
  if v_code is null then
    raise exception 'Thiếu hạng mục có source object để kiểm person_id';
  end if;

  v_result := public.rpc_upsert_source_object(
    v_object_kind, v_object_code,
    jsonb_build_object('owner_name', 'Tên nhập tay bị cấm')
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false
      or v_result->>'error_code' is distinct from 'PERSON_ID_REQUIRED' then
    raise exception 'Source upsert phải từ chối tên người không có ID: %', v_result;
  end if;
  v_result := public.rpc_upsert_source_object(
    v_object_kind, v_object_code,
    jsonb_build_object(
      'owner_person_id', v_person_2,
      'support_person_id', v_person_2
    )
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or exists (
        select 1 from public.vmp_plan_items
        where object_code = v_object_code and is_active and (
          owner_person_id is distinct from v_person_2
          or support_person_id is distinct from v_person_2
          or owner_name is distinct from (
            select performer_name from public.vmp_performers where id = v_person_2
          )
          or secondary_owner is distinct from (
            select performer_name from public.vmp_performers where id = v_person_2
          )
        )
      ) then
    raise exception 'Source person_id phải lan xuống mọi plan item active: %', v_result;
  end if;

  v_result := public.rpc_set_item_performer_by_id(
    v_code, v_person_2, 'Chọn đúng person_id trong hai người trùng tên'
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or (v_result->>'person_id')::uuid is distinct from v_person_2
      or not exists (
        select 1 from public.vmp_source_objects
        where object_code = v_object_code
          and owner_person_id = v_person_2
          and owner_name = (
            select performer_name from public.vmp_performers where id = v_person_2
          )
      )
      or exists (
        select 1 from public.vmp_plan_items
        where object_code = v_object_code and is_active
          and (
            owner_person_id is distinct from v_person_2
            or owner_name is distinct from (
              select performer_name from public.vmp_performers where id = v_person_2
            )
          )
      ) then
    raise exception 'Gán theo ID phải giữ ID chuẩn và tên mirror legacy: %', v_result;
  end if;

  v_dashboard := public.rpc_get_vmp_dashboard(v_year, true, true);
  if not exists (
    select 1 from jsonb_array_elements(v_dashboard->'activities') activity
    where activity->>'validation_code' = v_code
      and activity->'_raw'->>'owner_person_id' = v_person_2::text
  ) then
    raise exception 'Dashboard raw phải đưa owner_person_id tới ProgressEditModal';
  end if;

  update public.vmp_performers set is_active = false where id = v_person_1;
  v_result := public.rpc_set_item_performer_by_id(
    v_code, v_person_1, 'Không được gán người đã ngừng hoạt động'
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false
      or (select owner_person_id from public.vmp_source_objects
          where object_code = v_object_code limit 1) <> v_person_2 then
    raise exception 'person_id inactive phải bị từ chối và không đổi phân công: %', v_result;
  end if;

  if to_regprocedure(
    'public.rpc_upsert_item_permission_staff(uuid,jsonb,text)'
  ) is not null then
    raise exception 'Overload ba tham số phải bị loại bỏ để không bypass version/audit';
  end if;

  update public.vmp_performers
  set scope_factory_ids = array['10000000-0000-0000-0000-000000000001']::uuid[],
      scope_area_ids = array['20000000-0000-0000-0000-000000000002']::uuid[],
      scope_line_ids = array['30000000-0000-0000-0000-000000000002']::uuid[]
  where id = v_canonical_person;
  v_preflight := public.rpc_item_permission_preflight();
  if not exists (
    select 1 from jsonb_array_elements(v_preflight->'blocking_errors') error
    where error->>'code' = 'INVALID_SCOPE_HIERARCHY'
      and (error->>'record_id')::uuid = v_canonical_person
  ) then
    raise exception 'Preflight phải chặn hierarchy không nối đủ cha: %', v_preflight;
  end if;

  if has_function_privilege(
      'anon',
      'public.rpc_upsert_item_permission_staff(uuid,jsonb,text,integer)',
      'EXECUTE'
    ) or has_function_privilege(
      'anon', 'public.rpc_set_item_performer_by_id(text,uuid,text)', 'EXECUTE'
    ) or not has_function_privilege(
      'authenticated',
      'public.rpc_upsert_item_permission_staff(uuid,jsonb,text,integer)',
      'EXECUTE'
    ) then
    raise exception 'Quyền EXECUTE của RPC scope/person_id không tối thiểu';
  end if;
end
$test$;

/* Reader của từng loại quản lý không được nhìn người/phân công/hạng mục ngoài scope. */
do $test$
declare
  v_admin uuid;
  v_manager_user uuid;
  v_manager_person uuid;
  v_qa_person uuid;
  v_xsx_person uuid;
  v_qc_person uuid;
  v_xsx_code text;
  v_qc_code text;
  v_xsx_area text;
  v_result jsonb;
  v_rights record;
begin
  select id into v_admin
  from public.profiles
  where role::text = 'admin' and coalesce(is_active, true)
  order by created_at limit 1;
  select id into v_manager_user
  from public.profiles
  where id <> v_admin and coalesce(is_active, true)
  order by case when role::text = 'viewer' then 0 else 1 end, created_at
  limit 1;
  select item.validation_code, object.area
  into v_xsx_code, v_xsx_area
  from public.vmp_plan_items item
  join public.vmp_objects object on object.code = item.object_code
  where item.is_active and object.department = 'xsx'
    and nullif(btrim(coalesce(object.area, '')), '') is not null
  order by item.validation_code limit 1;
  select item.validation_code into v_qc_code
  from public.vmp_plan_items item
  join public.vmp_objects object on object.code = item.object_code
  where item.is_active and object.department = 'qc'
  order by item.validation_code limit 1;
  if v_admin is null or v_manager_user is null
      or v_xsx_code is null or v_qc_code is null then
    raise exception 'Thiếu fixture để kiểm reader quản lý';
  end if;

  delete from public.vmp_item_assignments where user_id = v_manager_user;
  delete from public.vmp_item_assignments
  where performer_id in (
    select id from public.vmp_performers where user_id = v_manager_user
  );
  delete from public.vmp_performers where user_id = v_manager_user;
  update public.profiles
  set role = 'qa_manager', department = 'qa', is_active = true
  where id = v_manager_user;

  insert into public.vmp_performers (
    performer_name, department, user_id, access_class,
    scope_departments, access_areas, is_active, updated_by
  ) values (
    'E2E Reader Quản Lý', 'qa', v_manager_user, 'qa_manager',
    array['*'], array['*'], true, v_admin
  ) returning id into v_manager_person;
  insert into public.vmp_performers (
    performer_name, department, access_class,
    scope_departments, access_areas, is_active, updated_by
  ) values
    ('E2E Reader Người QA', 'qa', 'qa_progress_editor',
     array['*'], array['*'], true, v_admin)
  returning id into v_qa_person;
  insert into public.vmp_performers (
    performer_name, department, access_class,
    scope_departments, access_areas, is_active, updated_by
  ) values
    ('E2E Reader Người XSX', 'xsx', 'equipment_scheduler',
     array['xsx'], array[v_xsx_area], true, v_admin)
  returning id into v_xsx_person;
  insert into public.vmp_performers (
    performer_name, department, access_class,
    scope_departments, access_areas, is_active, updated_by
  ) values
    ('E2E Reader Người QC', 'qc', 'equipment_scheduler',
     array['qc'], array['*'], true, v_admin)
  returning id into v_qc_person;

  insert into public.vmp_item_assignments (
    validation_code, performer_id, staff_name, assignment_kind, assignment_role, source,
    source_text, unresolved_reason, is_active, change_reason
  ) values
    (v_xsx_code, v_qa_person, 'E2E Reader Người QA', 'qa', 'collaborator', 'qa_manager',
     'E2E Reader Người QA', 'account_unlinked', true, 'Fixture reader'),
    (v_xsx_code, v_xsx_person, 'E2E Reader Người XSX',
     'equipment_department', null, 'equipment_manager',
     'E2E Reader Người XSX', 'account_unlinked', true, 'Fixture reader'),
    (v_qc_code, v_qa_person, 'E2E Reader Người QA', 'qa', 'collaborator', 'qa_manager',
     'E2E Reader Người QA', 'account_unlinked', true, 'Fixture reader'),
    (v_qc_code, v_qc_person, 'E2E Reader Người QC',
     'equipment_department', null, 'equipment_manager',
     'E2E Reader Người QC', 'account_unlinked', true, 'Fixture reader');

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_manager_user::text, 'role', 'authenticated')::text,
    true
  );
  v_result := public.rpc_item_permission_directory(null);
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or exists (
        select 1 from jsonb_array_elements(v_result->'people') person
        where person->>'department' <> 'qa'
      ) then
    raise exception 'QA manager chỉ được xem danh bạ QA: %', v_result;
  end if;
  v_result := public.rpc_item_assignments(null, null);
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or exists (
        select 1 from jsonb_array_elements(v_result->'assignments') assignment
        where assignment->>'assignment_kind' <> 'qa'
      ) then
    raise exception 'QA manager chỉ được xem phân công QA: %', v_result;
  end if;
  v_result := public.rpc_preview_item_rights(null, v_xsx_code);
  if exists (
    select 1 from jsonb_array_elements(v_result->'rights') preview
    where (preview->>'person_id')::uuid in (v_xsx_person, v_qc_person)
  ) then
    raise exception 'Preview QA manager cross-join người ngoài QA: %', v_result;
  end if;

  update public.vmp_performers
  set department = 'xsx', access_class = 'equipment_manager',
      scope_departments = array['xsx'], access_areas = array[v_xsx_area]
  where id = v_manager_person;
  v_result := public.rpc_item_permission_directory(null);
  if coalesce((v_result->>'ok')::boolean, true) is not false then
    raise exception 'role qa_manager + class equipment_manager không được thành principal lai: %',
      v_result;
  end if;
  select * into v_rights
  from public.vmp_item_rights(v_manager_user, v_xsx_code);
  if v_rights.can_view then
    raise exception 'Principal lai không được nhận quyền lõi: %', row_to_json(v_rights);
  end if;

  update public.profiles
  set role = 'department_user', department = 'xsx'
  where id = v_manager_user;
  v_result := public.rpc_item_permission_directory(null);
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or exists (
        select 1 from jsonb_array_elements(v_result->'people') person
        where person->>'department' <> 'xsx'
      ) then
    raise exception 'Equipment manager chỉ được xem người cùng profiles.department: %',
      v_result;
  end if;
  v_result := public.rpc_item_assignments(null, null);
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or jsonb_array_length(v_result->'assignments') = 0
      or exists (
        select 1 from jsonb_array_elements(v_result->'assignments') assignment
        where assignment->>'object_department' <> 'xsx'
          or (assignment->>'person_id')::uuid <> v_xsx_person
          or not (
            assignment->>'area' = v_xsx_area
            or assignment->>'line' = v_xsx_area
          )
      ) then
    raise exception 'Reader equipment_manager lọt người/item ngoài scope: %', v_result;
  end if;
  v_result := public.rpc_preview_item_rights(v_qa_person, v_xsx_code);
  if jsonb_array_length(v_result->'rights') <> 0 then
    raise exception 'Preview equipment_manager không được cross-join người QA: %', v_result;
  end if;
  v_result := public.rpc_preview_item_rights(v_xsx_person, v_qc_code);
  if jsonb_array_length(v_result->'rights') <> 0 then
    raise exception 'Preview equipment_manager không được cross-join item QC: %', v_result;
  end if;
end
$test$;

/* Scope nhập từ dashboard/Excel phải tham chiếu danh mục thật. */
do $test$
declare
  v_admin uuid;
  v_person uuid;
  v_result jsonb;
  v_factory constant uuid := '10000000-0000-0000-0000-000000000001';
  v_area constant uuid := '20000000-0000-0000-0000-000000000001';
  v_line constant uuid := '30000000-0000-0000-0000-000000000001';
begin
  select id into v_admin
  from public.profiles
  where role::text = 'admin' and coalesce(is_active, true)
  order by created_at limit 1;
  if v_admin is null then
    raise exception 'Thiếu fixture để kiểm danh mục scope';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text,
    true
  );

  v_result := public.rpc_upsert_item_permission_staff(null, jsonb_build_object(
    'full_name', 'E2E Scope Sai Bộ Phận',
    'department', 'xsx',
    'access_class', 'view_only',
    'scope_departments', jsonb_build_array('xssx'),
    'scope_factory_ids', jsonb_build_array(v_factory),
    'scope_area_ids', jsonb_build_array(v_area),
    'scope_line_ids', jsonb_build_array(v_line)
  ), 'Kiểm typo bộ phận', 0);
  if coalesce((v_result->>'ok')::boolean, true) is not false then
    raise exception 'scope_departments typo phải bị RPC từ chối: %', v_result;
  end if;

  v_result := public.rpc_upsert_item_permission_staff(null, jsonb_build_object(
    'full_name', 'E2E Scope Sai Khu Vực',
    'department', 'xsx',
    'access_class', 'view_only',
    'scope_departments', jsonb_build_array('xsx'),
    'scope_factory_ids', jsonb_build_array(v_factory),
    'scope_area_ids', jsonb_build_array('ffffffff-ffff-ffff-ffff-ffffffffffff'),
    'scope_line_ids', jsonb_build_array(v_line)
  ), 'Kiểm typo khu vực', 0);
  if coalesce((v_result->>'ok')::boolean, true) is not false then
    raise exception 'scope_area_ids ngoài catalog phải bị RPC từ chối: %', v_result;
  end if;

  v_result := public.rpc_upsert_item_permission_staff(null, jsonb_build_object(
    'full_name', 'E2E Department Sai Danh Mục',
    'department', 'khong-ton-tai',
    'access_class', 'view_only',
    'scope_departments', jsonb_build_array('xsx'),
    'scope_factory_ids', jsonb_build_array(v_factory),
    'scope_area_ids', jsonb_build_array(v_area),
    'scope_line_ids', jsonb_build_array(v_line)
  ), 'Kiểm department typo', 0);
  if coalesce((v_result->>'ok')::boolean, true) is not false then
    raise exception 'department ngoài catalog phải bị RPC từ chối dù scope=*: %',
      v_result;
  end if;


  v_result := public.rpc_upsert_item_permission_staff(null, jsonb_build_object(
    'full_name', 'E2E Email Chỉ Là Metadata',
    'email', 'e2e-email-khong-tu-noi@example.test',
    'department', 'xsx',
    'access_class', 'equipment_manager',
    'scope_departments', jsonb_build_array('xsx'),
    'scope_factory_ids', jsonb_build_array(v_factory),
    'scope_area_ids', jsonb_build_array(v_area),
    'scope_line_ids', jsonb_build_array(v_line)
  ), 'Kiểm email không tự nối account', 0);
  v_person := (v_result->>'person_id')::uuid;
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or (select user_id from public.vmp_performers where id = v_person) is not null then
    raise exception 'Email metadata không được tự suy luận hoặc nối account: %', v_result;
  end if;
end
$test$;

select 'ITEM_PERMISSION_SQL_PHASE_ENFORCED_RLS';

/* Task 11: preview giữ nguyên; enforced chỉ đọc hạng mục được cấp. */
do $test$
declare
  v_admin uuid;
  v_user uuid;
  v_person uuid;
  v_visible_code text;
  v_hidden_code text;
  v_hidden_object text;
  v_department text;
  v_area text;
  v_line text;
  v_hidden_area text;
  v_hidden_line text;
  v_year integer;
  v_all_count bigint;
  v_hidden_assignment uuid;
  v_factory constant uuid := 'a1100000-0000-0000-0000-000000000001';
  v_visible_area constant uuid := 'a1200000-0000-0000-0000-000000000001';
  v_hidden_area_id constant uuid := 'a1200000-0000-0000-0000-000000000002';
  v_visible_line constant uuid := 'a1300000-0000-0000-0000-000000000001';
  v_hidden_line_id constant uuid := 'a1300000-0000-0000-0000-000000000002';
begin
  select id into v_admin
  from public.profiles
  where role::text = 'admin' and coalesce(is_active, true)
  order by created_at limit 1;
  select id into v_user
  from public.profiles
  where id <> v_admin and coalesce(is_active, true)
  order by case when role::text = 'viewer' then 0 else 1 end, created_at
  limit 1;

  /* Historical RED chọn đúng hai item này nhưng không tạo hierarchy, nên cả
   * hai path-count đều bằng 0 và enforced RLS trả 0 dòng. Chọn rõ trạng thái
   * pre-fixture đó rồi dựng đúng một path cho mỗi item bên dưới. */
  select visible.validation_code, hidden.validation_code, hidden.object_code,
         object.department, btrim(object.area), btrim(object.line),
         hidden.area, hidden.line, visible.year
  into v_visible_code, v_hidden_code, v_hidden_object,
       v_department, v_area, v_line, v_hidden_area, v_hidden_line, v_year
  from public.vmp_plan_items visible
  join public.vmp_objects object on object.code = visible.object_code
  join lateral (
    select candidate.validation_code, candidate.object_code,
           btrim(candidate_object.area) as area,
           btrim(candidate_object.line) as line
    from public.vmp_plan_items candidate
    join public.vmp_objects candidate_object on candidate_object.code = candidate.object_code
    where candidate.is_active and candidate.year = visible.year
      and candidate.validation_code <> visible.validation_code
      and candidate.object_code <> visible.object_code
      and candidate_object.department = object.department
      and nullif(btrim(coalesce(candidate_object.area, '')), '') is not null
      and nullif(btrim(coalesce(candidate_object.line, '')), '') is not null
      and btrim(candidate_object.area) <> btrim(object.area)
      and public.vmp_item_scope_path_count(candidate.validation_code) = 0
    order by candidate.validation_code
    limit 1
  ) hidden on true
  where visible.is_active
    and nullif(btrim(coalesce(object.department, '')), '') is not null
    and nullif(btrim(coalesce(object.area, '')), '') is not null
    and nullif(btrim(coalesce(object.line, '')), '') is not null
    and public.vmp_item_scope_path_count(visible.validation_code) = 0
  order by visible.validation_code
  limit 1;

  if v_admin is null or v_user is null or v_hidden_code is null then
    raise exception 'Thiếu fixture hai khu vực để kiểm RLS đọc theo hạng mục';
  end if;

  delete from public.vmp_item_assignments where user_id = v_user;
  delete from public.vmp_performers where user_id = v_user;
  update public.profiles
  set role = 'department_user', department = v_department,
      pham_vi = 'phan_cong', is_active = true
  where id = v_user;
  insert into public.vmp_scope_factories(id, code, name, department_id)
  values (v_factory, 'E2E-RLS-F', 'E2E RLS factory', v_department);
  insert into public.vmp_scope_areas(id, code, name, factory_id)
  values
    (v_visible_area, v_area, 'E2E RLS visible area', v_factory),
    (v_hidden_area_id, v_hidden_area, 'E2E RLS hidden area', v_factory);
  insert into public.vmp_scope_lines(id, code, name, area_id)
  values
    (v_visible_line, v_line, 'E2E RLS visible line', v_visible_area),
    (v_hidden_line_id, v_hidden_line, 'E2E RLS hidden line', v_hidden_area_id);
  insert into public.vmp_performers (
    performer_name, email, department, user_id, access_class,
    scope_departments, access_areas, scope_factory_ids, scope_area_ids,
    scope_line_ids, is_active, updated_by
  )
  select 'E2E Người Kiểm RLS Hạng Mục', email, v_department, id, 'view_only',
         array[v_department], array[v_area], array[v_factory], array[v_visible_area],
         array[v_visible_line], true, v_admin
  from public.profiles where id = v_user
  returning id into v_person;
  insert into public.vmp_item_assignments (
    validation_code, performer_id, user_id, staff_name,
    assignment_kind, source, source_text, is_active, change_reason
  ) values (
    v_visible_code, v_person, v_user, 'E2E Người Kiểm RLS Hạng Mục',
    'equipment_department', 'equipment_manager',
    'E2E Người Kiểm RLS Hạng Mục', true,
    'Fixture chống lộ dữ liệu đọc'
  );
  insert into public.vmp_item_assignments (
    validation_code, staff_name, assignment_kind, assignment_role, source, source_text,
    unresolved_reason, is_active, change_reason
  ) values (
    v_hidden_code, 'E2E Phân Công Hạng Mục Ẩn', 'qa', 'collaborator', 'sheet_qa',
    'E2E Phân Công Hạng Mục Ẩn', 'not_found', true,
    'Fixture chống lộ bảng phân công'
  ) returning id into v_hidden_assignment;

  select count(*) into v_all_count from public.vmp_plan_items;
  if (select count(*) from public.vmp_visible_plan_items()) <> v_all_count then
    raise exception 'Preview phải giữ nguyên toàn bộ tập hạng mục đang đọc';
  end if;
  if public.vmp_item_scope_path_count(v_visible_code) <> 1
      or public.vmp_item_scope_path_count(v_hidden_code) <> 1 then
    raise exception 'Fixture RLS phải tạo đúng một canonical path cho mỗi item: visible=%, hidden=%',
      public.vmp_item_scope_path_count(v_visible_code),
      public.vmp_item_scope_path_count(v_hidden_code);
  end if;

  update public.system_config set value = '"enforced"'::jsonb
  where key = 'item_permissions_mode';
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('app.test_visible_code', v_visible_code, true);
  perform set_config('app.test_hidden_code', v_hidden_code, true);
  perform set_config('app.test_hidden_object', v_hidden_object, true);
  perform set_config('app.test_item_year', v_year::text, true);
  perform set_config('app.test_item_user', v_user::text, true);
  perform set_config('app.test_item_person', v_person::text, true);
  perform set_config('app.test_hidden_assignment', v_hidden_assignment::text, true);
  perform set_config('app.test_all_item_count', v_all_count::text, true);
end
$test$;

set local role authenticated;

do $test$
declare
  v_visible_code text := current_setting('app.test_visible_code');
  v_hidden_code text := current_setting('app.test_hidden_code');
  v_hidden_object text := current_setting('app.test_hidden_object');
  v_year integer := current_setting('app.test_item_year')::integer;
  v_hidden_assignment uuid := current_setting('app.test_hidden_assignment')::uuid;
  v_dashboard jsonb;
  v_result jsonb;
  v_hidden_rights jsonb;
  v_missing_rights jsonb;
begin
  if (select count(*) from public.vmp_plan_items) <> 1
      or not exists (
        select 1 from public.vmp_plan_items
        where validation_code = v_visible_code
      ) then
    raise exception 'RLS enforced phải chỉ trả đúng hạng mục được cấp';
  end if;
  if not coalesce((
    select rights.can_view
    from public.vmp_my_item_rights(v_visible_code) rights
  ), false) then
    raise exception 'Wrapper self phải trả quyền hạng mục của chính auth.uid()';
  end if;
  if not exists (
      select 1 from public.vmp_performers where user_id = auth.uid()
    ) or exists (
      select 1 from public.vmp_performers where user_id is distinct from auth.uid()
    ) then
    raise exception 'Người thường chỉ được SELECT performer của chính mình';
  end if;

  v_dashboard := public.rpc_get_vmp_dashboard(v_year, false, false);
  if v_dashboard::text like '%' || v_hidden_code || '%' then
    raise exception 'Dashboard SECURITY DEFINER làm lộ mã hạng mục ngoài khu vực: %',
      v_hidden_code;
  end if;
  if not (v_dashboard::text like '%' || v_visible_code || '%') then
    raise exception 'Dashboard phải giữ hạng mục người dùng được xem: %',
      v_visible_code;
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_dashboard->'objects') object
    where object->>'code' = v_hidden_object
  ) then
    raise exception 'Dashboard objects làm lộ object của hạng mục ẩn: %',
      v_hidden_object;
  end if;
  select to_jsonb(rights) into v_hidden_rights
  from public.vmp_my_item_rights(v_hidden_code) rights;
  select to_jsonb(rights) into v_missing_rights
  from public.vmp_my_item_rights('E2E-KHONG-TON-TAI') rights;
  if v_hidden_rights is distinct from v_missing_rights then
    raise exception 'Wrapper self làm lộ hidden vs nonexistent: hidden=%, missing=%',
      v_hidden_rights, v_missing_rights;
  end if;
  if not (v_dashboard->'activities'->0->'_raw' ? 'scheduled_at') then
    raise exception 'Dashboard phải trả scheduled_at đầy đủ trong _raw';
  end if;
  v_result := public.rpc_dashboard_kpi(v_year);
  if (v_result #>> '{validation,total}')::integer <> 1
      or (v_result #>> '{documentation,total}')::integer <> 1 then
    raise exception 'KPI SECURITY DEFINER phải đếm đúng tập hạng mục được xem: %',
      v_result;
  end if;
  v_result := public.rpc_due_alerts(v_year, 3650);
  if v_result::text like '%' || v_hidden_code || '%' then
    raise exception 'RPC cảnh báo hạn làm lộ mã hạng mục ngoài khu vực';
  end if;
  v_result := public.rpc_alert_context(v_hidden_code, 3650);
  if v_result::text like '%' || v_hidden_code || '%' then
    raise exception 'RPC ngữ cảnh cảnh báo làm lộ mã hạng mục ngoài khu vực';
  end if;
  v_result := public.rpc_get_missing_items(v_year);
  if v_result::text like '%' || v_hidden_code || '%' then
    raise exception 'RPC hạng mục thiếu làm lộ mã hạng mục ngoài khu vực';
  end if;
  v_result := public.rpc_source_warnings(v_year);
  if v_result::text like '%' || v_hidden_code || '%' then
    raise exception 'RPC cảnh báo nguồn làm lộ mã hạng mục ngoài khu vực';
  end if;
  v_result := public.rpc_active_rules();
  if (v_result #>> '{so_lieu_hien_tai,hang_muc}')::integer <> 1 then
    raise exception 'RPC luật đang chạy phải đếm đúng tập hạng mục được xem: %',
      v_result;
  end if;
  v_result := public.rpc_trang_thai_he_thong();
  if coalesce((v_result->>'ok')::boolean, false) then
    raise exception 'Người dùng thường không được xem trạng thái hệ thống: %',
      v_result;
  end if;
  v_result := public.rpc_ai_context_goc(null, v_year, 60);
  if (v_result #>> '{tong_quan,tong_hang_muc}')::integer <> 1
      or v_result::text like '%' || v_hidden_code || '%' then
    raise exception 'RPC AI context phải chỉ dùng tập hạng mục được xem: %',
      v_result;
  end if;
  v_result := public.rpc_ai_muc_luc();
  if (v_result->>'tong')::integer <> 1 then
    raise exception 'Họ RPC AI phải tổng hợp đúng tập hạng mục được xem: %',
      v_result;
  end if;
end
$test$;

reset role;

do $test$
declare
  v_admin uuid;
begin
  select id into v_admin
  from public.profiles
  where role::text = 'admin' and coalesce(is_active, true)
  order by created_at limit 1;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text,
    true
  );
end
$test$;

set local role authenticated;

do $test$
begin
  if not public.is_admin()
      or (select count(*) from public.vmp_plan_items)
         <> current_setting('app.test_all_item_count')::bigint then
    raise exception 'Admin phải đọc được toàn bộ hạng mục khi enforced';
  end if;
end
$test$;

reset role;

/* Preflight phải dùng đúng audit runtime, không chỉ kiểm một danh sách đóng. */
create function public.rpc_e2e_unfiltered_item_reader()
returns bigint
language sql
stable
security definer
set search_path = public
as $test_function$
  select count(*) from public.vmp_plan_items
$test_function$;

do $test$
declare
  v_admin uuid;
  v_result jsonb;
begin
  select id into v_admin
  from public.profiles
  where role::text = 'admin' and coalesce(is_active, true)
  order by created_at limit 1;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text,
    true
  );

  v_result := public.rpc_item_permission_preflight();
  if not exists (
    select 1
    from jsonb_array_elements(v_result->'blocking_errors') error
    where error->>'code' = 'UNFILTERED_SECURITY_DEFINER_RPC'
      and error->>'record_id' = 'rpc_e2e_unfiltered_item_reader()'
  ) then
    raise exception 'Preflight chưa chặn SECURITY DEFINER RPC không lọc: %', v_result;
  end if;
end
$test$;

drop function public.rpc_e2e_unfiltered_item_reader();

do $test$
declare
  v_user uuid := current_setting('app.test_item_user')::uuid;
  v_person uuid := current_setting('app.test_item_person')::uuid;
  v_hidden_assignment uuid := current_setting('app.test_hidden_assignment')::uuid;
  v_factory constant uuid := 'a1100000-0000-0000-0000-000000000001';
  v_visible_area constant uuid := 'a1200000-0000-0000-0000-000000000001';
  v_hidden_area constant uuid := 'a1200000-0000-0000-0000-000000000002';
  v_visible_line constant uuid := 'a1300000-0000-0000-0000-000000000001';
  v_hidden_line constant uuid := 'a1300000-0000-0000-0000-000000000002';
begin
  if exists (select 1 from public.vmp_unfiltered_security_definer_item_readers()) then
    raise exception 'Audit vẫn còn đường đọc SECURITY DEFINER không lọc';
  end if;
  update public.system_config set value = '"preview"'::jsonb
  where key = 'item_permissions_mode';
  delete from public.vmp_item_assignments
  where performer_id = v_person or id = v_hidden_assignment;
  delete from public.vmp_performers where id = v_person;
  delete from public.vmp_scope_lines where id in (v_visible_line, v_hidden_line);
  delete from public.vmp_scope_areas where id in (v_visible_area, v_hidden_area);
  delete from public.vmp_scope_factories where id = v_factory;
  update public.profiles
  set role = 'viewer', department = null, pham_vi = null
  where id = v_user;
end
$test$;

select 'ITEM_PERMISSION_SQL_PHASE_QA_ASSIGNMENTS';

/* QA chỉ nhận quyền qua performer đã nối và phân công active của hạng mục. */
do $test$
declare
  v_admin uuid;
  v_user_1 uuid := gen_random_uuid();
  v_user_2 uuid := gen_random_uuid();
  v_user_3 uuid := gen_random_uuid();
  v_email_1 text;
  v_email_2 text;
  v_email_3 text;
  v_qa_1 uuid;
  v_qa_2 uuid;
  v_qa_3 uuid;
  v_refresh_probe uuid := gen_random_uuid();
  v_code text;
  v_result jsonb;
  v_rights record;
  v_constraint text;
  v_check_caught boolean;
  v_unique_caught boolean;
  v_performer_lock_modes text[];
  v_values jsonb;
  v_qa_fields constant text[] := array[
    'actual_protocol_date', 'status_protocol',
    'actual_validation_date', 'status_validation',
    'actual_report_date', 'status_report',
    'actual_vmp_date', 'status_vmp'
  ]::text[];
begin
  select id into v_admin
  from public.profiles
  where role::text = 'admin' and coalesce(is_active, true)
  order by created_at
  limit 1;
  select item.validation_code into v_code
  from public.vmp_plan_items item
  where item.is_active
    and not exists (
      select 1
      from public.vmp_item_assignments assignment
      where assignment.validation_code = item.validation_code
        and assignment.assignment_kind = 'qa'
        and assignment.is_active
    )
  order by item.validation_code
  limit 1;
  if v_admin is null or v_code is null then
    raise exception 'Thiếu admin hoặc hạng mục trống để kiểm nhiều QA';
  end if;

  v_email_1 := 'e2e-task4-' || replace(v_user_1::text, '-', '') || '@example.test';
  v_email_2 := 'e2e-task4-' || replace(v_user_2::text, '-', '') || '@example.test';
  v_email_3 := 'e2e-task4-' || replace(v_user_3::text, '-', '') || '@example.test';
  insert into public.vmp_email_cho_phep(email, ghi_chu)
  values
    (v_email_1, 'Fixture rollback Task 4'),
    (v_email_2, 'Fixture rollback Task 4'),
    (v_email_3, 'Fixture rollback Task 4');
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (v_user_1, 'authenticated', 'authenticated', v_email_1, '', now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"E2E Task 4 QA 1"}'::jsonb, now(), now()),
    (v_user_2, 'authenticated', 'authenticated', v_email_2, '', now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"E2E Task 4 QA 2"}'::jsonb, now(), now()),
    (v_user_3, 'authenticated', 'authenticated', v_email_3, '', now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"E2E Task 4 QA 3"}'::jsonb, now(), now());

  update public.profiles
  set role = 'viewer', department = 'qa', is_active = true
  where id in (v_user_1, v_user_2, v_user_3);
  insert into public.vmp_performers (
    performer_name, email, department, user_id, access_class,
    scope_departments, access_areas, is_active, updated_by
  ) values
    ('E2E Task 4 QA 1', v_email_1, 'qa', v_user_1, 'qa_progress_editor',
     '{}'::text[], '{}'::text[], true, v_admin),
    ('E2E Task 4 QA 2', v_email_2, 'qa', v_user_2, 'qa_progress_editor',
     '{}'::text[], '{}'::text[], true, v_admin),
    ('E2E Task 4 QA 3', v_email_3, 'qa', v_user_3, 'qa_progress_editor',
     '{}'::text[], '{}'::text[], true, v_admin);
  select id into v_qa_1 from public.vmp_performers where user_id = v_user_1;
  select id into v_qa_2 from public.vmp_performers where user_id = v_user_2;
  select id into v_qa_3 from public.vmp_performers where user_id = v_user_3;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text,
    true
  );
  v_result := public.rpc_set_item_assignment(
    v_qa_1, v_code, 'qa', 'primary', 'assign', 'Gán QA chính'
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'Không gán được QA chính: %', v_result;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_locks
    where pid = pg_catalog.pg_backend_pid()
      and relation = 'public.vmp_plan_items'::regclass
      and mode = 'RowShareLock' and granted
  ) then
    raise exception 'Mutation phân công phải giữ row lock trên hạng mục đến cuối transaction';
  end if;
  select locks.modes into v_performer_lock_modes
  from public.pgrowlocks('public.vmp_performers') locks
  where locks.locked_row = (
    select person.ctid from public.vmp_performers person where person.id = v_qa_1
  );
  if coalesce('For Update' = any(v_performer_lock_modes), false) is not true then
    raise exception
      'Mutation phân công phải giữ For Update trên performer trước khi ghi assignment: %',
      v_performer_lock_modes;
  end if;
  v_result := public.rpc_set_item_assignment(
    v_qa_2, v_code, 'qa', 'collaborator', 'assign', 'Gán QA phối hợp'
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'Không gán được QA phối hợp: %', v_result;
  end if;

  select * into v_rights from public.vmp_item_rights(v_user_1, v_code);
  if not v_rights.can_view
      or v_rights.editable_fields is distinct from v_qa_fields
      or not v_rights.scope_match or not v_rights.area_match then
    raise exception 'QA chính không nhận đúng quyền assignment-only: %', row_to_json(v_rights);
  end if;
  select * into v_rights from public.vmp_item_rights(v_user_2, v_code);
  if not v_rights.can_view
      or v_rights.editable_fields is distinct from v_qa_fields
      or not v_rights.scope_match or not v_rights.area_match then
    raise exception 'QA phối hợp không nhận đúng quyền assignment-only: %', row_to_json(v_rights);
  end if;
  select * into v_rights from public.vmp_item_rights(v_user_3, v_code);
  if v_rights.can_view or cardinality(v_rights.editable_fields) <> 0
      or v_rights.scope_match or v_rights.area_match then
    raise exception 'QA chưa phân công phải fail closed: %', row_to_json(v_rights);
  end if;
  if not public.vmp_can_view_item(v_user_1, v_code)
      or public.vmp_allowed_timeline_fields(v_user_1, v_code)
        is distinct from v_qa_fields then
    raise exception 'Consumer lõi quyền chưa dùng nhánh assignment-only mới';
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_1::text, 'role', 'authenticated')::text,
    true
  );
  select * into v_rights from public.vmp_my_item_rights(v_code);
  if not v_rights.can_view
      or v_rights.editable_fields is distinct from v_qa_fields then
    raise exception 'Wrapper browser phải trả đúng quyền QA của auth.uid(): %',
      row_to_json(v_rights);
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text,
    true
  );

  v_result := public.rpc_item_assignments(v_code, null);
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or not exists (
        select 1 from jsonb_array_elements(v_result->'assignments') assignment
        where (assignment->>'person_id')::uuid = v_qa_1
          and assignment->>'assignment_role' = 'primary'
      )
      or not exists (
        select 1 from jsonb_array_elements(v_result->'assignments') assignment
        where (assignment->>'person_id')::uuid = v_qa_2
          and assignment->>'assignment_role' = 'collaborator'
  ) then
    raise exception 'RPC đọc phân công chưa trả assignment_role: %', v_result;
  end if;
  v_result := public.rpc_preview_item_rights(v_qa_1, v_code);
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or not exists (
        select 1 from jsonb_array_elements(v_result->'rights') preview
        where (preview->>'person_id')::uuid = v_qa_1
          and preview->>'assignment_role' = 'primary'
          and (preview->>'can_view')::boolean
          and (preview->>'scope_match')::boolean
          and (preview->>'factory_match')::boolean
          and (preview->>'area_match')::boolean
          and (preview->>'line_match')::boolean
      ) then
    raise exception 'Preview QA phải trả role và hiểu scope flags theo assignment: %',
      v_result;
  end if;

  v_result := public.rpc_set_item_assignment(
    v_qa_2, v_code, 'qa', 'primary', 'assign', 'Thử thêm QA chính'
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false
      or v_result->>'error_code' is distinct from 'PRIMARY_ALREADY_EXISTS' then
    raise exception 'assign QA chính thứ hai phải bị từ chối rõ ràng: %', v_result;
  end if;
  v_result := public.rpc_set_item_assignment(
    v_qa_2, v_code, 'qa', 'primary', 'replace_primary', 'Đổi QA chính'
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or (select count(*) from public.vmp_item_assignments
          where validation_code = v_code and assignment_kind = 'qa'
            and assignment_role = 'primary' and is_active) <> 1
      or not exists (
        select 1 from public.vmp_item_assignments
        where validation_code = v_code and performer_id = v_qa_1
          and assignment_role = 'collaborator' and is_active
      )
      or not exists (
        select 1 from public.vmp_item_assignments
        where validation_code = v_code and performer_id = v_qa_2
          and assignment_role = 'primary' and is_active
      ) then
    raise exception 'replace_primary phải demote/promote nguyên tử: %', v_result;
  end if;

  v_result := public.rpc_set_item_assignment(
    v_qa_1, v_code, 'qa', 'collaborator', 'revoke', 'Thu hồi QA phối hợp'
  );
  select * into v_rights from public.vmp_item_rights(v_user_1, v_code);
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or v_rights.can_view or cardinality(v_rights.editable_fields) <> 0 then
    raise exception 'Thu hồi QA phối hợp phải mất quyền ngay: %, %',
      v_result, row_to_json(v_rights);
  end if;

  update public.vmp_performers set user_id = null where id = v_qa_2;
  select * into v_rights from public.vmp_item_rights(v_user_2, v_code);
  if v_rights.can_view then
    raise exception 'QA bị gỡ liên kết tài khoản phải fail closed: %', row_to_json(v_rights);
  end if;
  update public.vmp_performers set user_id = v_user_2 where id = v_qa_2;

  v_result := public.rpc_set_item_assignment(
    v_qa_1, v_code, 'qa', null, 'assign', 'Thiếu vai trò QA'
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false
      or v_result->>'error_code' is distinct from 'INVALID_ASSIGNMENT_ROLE' then
    raise exception 'QA thiếu assignment_role phải bị từ chối: %', v_result;
  end if;

  /* Mutation bắt lỗi: CHECK dùng `IN (...)` đơn thuần sẽ cho NULL đi qua
   * vì biểu thức UNKNOWN. Invariant phải áp dụng cả dòng active và inactive. */
  v_check_caught := false;
  begin
    insert into public.vmp_item_assignments (
      validation_code, performer_id, user_id, staff_name, assignment_kind,
      assignment_role, source, source_text, is_active, change_reason
    ) values (
      v_code, v_qa_3, v_user_3, 'E2E Task 4 QA 3', 'qa', null,
      'qa_manager', 'E2E Task 4 QA 3', true, 'Probe QA active thiếu role'
    );
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    v_check_caught := v_constraint = 'vmp_item_assignments_role_check';
  end;
  if not v_check_caught then
    raise exception 'Constraint phải chặn QA active có assignment_role NULL';
  end if;

  v_check_caught := false;
  begin
    insert into public.vmp_item_assignments (
      validation_code, performer_id, user_id, staff_name, assignment_kind,
      assignment_role, source, source_text, is_active, change_reason
    ) values (
      v_code, v_qa_3, v_user_3, 'E2E Task 4 QA 3', 'qa', null,
      'qa_manager', 'E2E Task 4 QA 3', false, 'Probe QA inactive thiếu role'
    );
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    v_check_caught := v_constraint = 'vmp_item_assignments_role_check';
  end;
  if not v_check_caught then
    raise exception 'Constraint phải chặn QA inactive có assignment_role NULL';
  end if;

  v_result := public.rpc_set_item_assignment(
    v_qa_1, v_code, 'equipment_department', 'collaborator', 'assign',
    'Thiết bị nhận sai vai trò QA'
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false
      or v_result->>'error_code' is distinct from 'INVALID_ASSIGNMENT_ROLE' then
    raise exception 'Phân công thiết bị không được nhận assignment_role: %', v_result;
  end if;
  v_result := public.rpc_set_item_assignment(
    v_qa_1, v_code, 'qa', 'collaborator', 'assign', '  '
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false
      or v_result->>'error_code' is distinct from 'REASON_REQUIRED' then
    raise exception 'Mutation phân công phải bắt buộc lý do: %', v_result;
  end if;

  update public.vmp_performers set access_class = 'qa_manager' where id = v_qa_3;
  v_result := public.rpc_set_item_assignment(
    v_qa_3, v_code, 'qa', 'collaborator', 'assign', 'Thử gán quản lý QA'
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false
      or v_result->>'error_code' is distinct from 'QA_TARGET_NOT_ASSIGNABLE' then
    raise exception 'qa_manager không được làm target QA thường: %', v_result;
  end if;
  if not exists (
    select 1 from public.vmp_item_assignments
    where validation_code = v_code and performer_id = v_qa_2
      and assignment_role = 'primary' and is_active
  ) then
    raise exception 'Target replace không hợp lệ không được làm mất QA chính hiện tại';
  end if;

  /* Mutation bắt lỗi: bỏ điều kiện profiles.department = 'qa' trong rights
   * không được biến role/class khớp một phần thành QA manager toàn cục. */
  update public.profiles set role = 'qa_manager', department = 'xsx'
  where id = v_user_3;
  select * into v_rights from public.vmp_item_rights(v_user_3, v_code);
  if v_rights.can_view or cardinality(v_rights.editable_fields) <> 0
      or v_rights.scope_match or v_rights.area_match then
    raise exception 'QA manager có profiles.department ngoài QA phải fail closed: %',
      row_to_json(v_rights);
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_3::text, 'role', 'authenticated')::text,
    true
  );
  v_result := public.rpc_set_item_assignment(
    v_qa_1, v_code, 'qa', 'collaborator', 'assign',
    'Principal sai department không được phân công'
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false
      or v_result->>'error_code' is distinct from 'FORBIDDEN' then
    raise exception 'Mutation và rights phải cùng từ chối QA manager sai department: %',
      v_result;
  end if;

  update public.profiles set department = 'qa' where id = v_user_3;
  select * into v_rights from public.vmp_item_rights(v_user_3, v_code);
  if not v_rights.can_view
      or v_rights.editable_fields is distinct from v_qa_fields
      or not v_rights.scope_match or not v_rights.area_match then
    raise exception 'Principal QA manager hợp lệ phải thấy mọi hạng mục, không cần scope: %',
      row_to_json(v_rights);
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_3::text, 'role', 'authenticated')::text,
    true
  );
  v_result := public.rpc_set_item_assignment(
    v_qa_1, v_code, 'qa', 'collaborator', 'assign',
    'Quản lý QA gán không phụ thuộc scope'
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'QA manager hợp lệ phải phân công không cần scope: %', v_result;
  end if;
  v_result := public.rpc_set_item_assignment(
    v_qa_1, v_code, 'qa', 'collaborator', 'revoke',
    'Quản lý QA thu hồi phân công'
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'QA manager hợp lệ phải thu hồi được phân công: %', v_result;
  end if;
  update public.profiles set role = 'viewer' where id = v_user_3;
  select * into v_rights from public.vmp_item_rights(v_user_3, v_code);
  if v_rights.can_view then
    raise exception 'access_class qa_manager thiếu role qa_manager phải fail closed: %',
      row_to_json(v_rights);
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text,
    true
  );
  v_unique_caught := false;
  begin
    insert into public.vmp_item_assignments (
      validation_code, performer_id, user_id, staff_name, assignment_kind,
      assignment_role, source, source_text, is_active, change_reason
    ) values (
      v_code, v_qa_3, v_user_3, 'E2E Task 4 QA 3', 'qa', 'primary',
      'sheet_qa', 'E2E Task 4 QA 3', true, 'Thử trùng QA chính'
    );
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    v_unique_caught := v_constraint = 'vmp_item_assignments_one_active_qa_primary';
  end;
  if not v_unique_caught then
    raise exception 'Unique index một QA chính không bắt đúng predicate';
  end if;

  v_unique_caught := false;
  begin
    insert into public.vmp_item_assignments (
      validation_code, performer_id, user_id, staff_name, assignment_kind,
      assignment_role, source, source_text, is_active, change_reason
    ) values (
      v_code, v_qa_2, v_user_2, 'E2E Task 4 QA 2', 'qa', 'collaborator',
      'sheet_qa', 'E2E Task 4 QA 2', true, 'Thử trùng người QA'
    );
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    v_unique_caught := v_constraint = 'vmp_item_assignments_one_active_qa_person';
  end;
  if not v_unique_caught then
    raise exception 'Unique index một dòng active mỗi người QA không bắt đúng predicate';
  end if;

  /* DDL và dữ liệu probe được rollback ở subtransaction có chủ đích. */
  begin
    execute 'drop index public.vmp_item_assignments_one_active_qa_primary';
    execute 'drop index public.vmp_item_assignments_one_active_qa_person';
    insert into public.vmp_item_assignments (
      validation_code, performer_id, user_id, staff_name, assignment_kind,
      assignment_role, source, source_text, is_active, change_reason
    ) values
      (v_code, v_qa_3, v_user_3, 'E2E Task 4 QA 3', 'qa', 'primary',
       'sheet_qa', 'E2E Task 4 QA 3', true, 'Probe preflight trùng primary'),
      (v_code, v_qa_2, v_user_2, 'E2E Task 4 QA 2', 'qa', 'collaborator',
       'sheet_qa', 'E2E Task 4 QA 2', true, 'Probe preflight trùng person');
    v_result := public.rpc_item_permission_preflight();
    if not exists (
      select 1 from jsonb_array_elements(v_result->'blocking_errors') error
      where error->>'code' = 'DUPLICATE_ACTIVE_QA_PRIMARY'
        and error->>'record_id' = v_code
    ) or not exists (
      select 1 from jsonb_array_elements(v_result->'blocking_errors') error
      where error->>'code' = 'DUPLICATE_ACTIVE_QA_PERSON'
        and error->>'record_id' = v_code || '×' || v_qa_2::text
    ) then
      raise exception 'Preflight chưa bắt hai dạng trùng QA: %', v_result;
    end if;
    raise exception using errcode = 'PT401', message = 'rollback preflight probe';
  exception when sqlstate 'PT401' then
    null;
  end;

  if not exists (
    select 1 from public.audit_logs
    where validation_code = v_code
      and table_name = 'vmp_item_assignments'
      and source = 'dashboard_rpc'
      and change_reason = 'Đổi QA chính'
      and new_data @> jsonb_build_object('assignment_role', 'primary')
  ) or not exists (
    select 1 from public.audit_logs
    where validation_code = v_code
      and table_name = 'vmp_item_assignments'
      and source = 'dashboard_rpc'
      and change_reason = 'Thu hồi QA phối hợp'
  ) then
    raise exception 'Mutation QA phải ghi audit đủ lý do và vai trò';
  end if;

  v_values := to_jsonb(array_fill(''::text, array[37]));
  v_values := jsonb_set(v_values, '{17}', to_jsonb('E2E Task 4 QA 2'::text));
  update public.vmp_plan_items
  set source_sheet_data = jsonb_set(
    coalesce(source_sheet_data, '{}'::jsonb), '{values}', v_values, true
  )
  where validation_code = v_code;
  insert into public.vmp_performers (
    id, performer_name, department, access_class, scope_departments,
    access_areas, is_active, updated_by
  ) values (
    v_refresh_probe, 'E2E Refresh Lock ' || v_refresh_probe::text,
    'qa', 'qa_progress_editor', '{}'::text[], '{}'::text[], true, v_admin
  );
  v_result := public.rpc_refresh_source_item_assignments();
  select locks.modes into v_performer_lock_modes
  from public.pgrowlocks('public.vmp_performers') locks
  where locks.locked_row = (
    select person.ctid
    from public.vmp_performers person where person.id = v_refresh_probe
  );
  if coalesce('For Update' = any(v_performer_lock_modes), false) is not true then
    raise exception
      'Refresh nguồn phải khóa performer trước item/assignment để tránh deadlock account: %',
      v_performer_lock_modes;
  end if;
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or (select count(*) from public.vmp_item_assignments
          where validation_code = v_code and performer_id = v_qa_2
            and assignment_kind = 'qa' and is_active) <> 1
      or not exists (
        select 1 from public.vmp_item_assignments
        where validation_code = v_code and performer_id = v_qa_2
          and assignment_kind = 'qa' and source = 'sheet_qa'
          and assignment_role = 'primary' and is_active
      )
      or not exists (
        select 1 from public.vmp_item_assignments
        where validation_code = v_code and performer_id = v_qa_2
          and assignment_kind = 'qa' and source = 'qa_manager'
          and assignment_role = 'collaborator' and not is_active
          and change_reason = 'Gộp nguồn phân công khi chuyển person_id'
      ) then
    raise exception 'Refresh phải ưu tiên sheet_qa và dedupe person_id ổn định: %', v_result;
  end if;

  delete from public.vmp_item_assignments
  where performer_id in (v_qa_1, v_qa_2, v_qa_3);
  delete from public.vmp_performers
  where id in (v_qa_1, v_qa_2, v_qa_3, v_refresh_probe);
  delete from public.audit_logs where user_id in (v_user_1, v_user_2, v_user_3);
  delete from auth.users where id in (v_user_1, v_user_2, v_user_3);
  delete from public.vmp_email_cho_phep where email in (v_email_1, v_email_2, v_email_3);
end
$test$;

do $test$
declare
  v_admin uuid;
  v_user uuid;
  v_person uuid;
  v_code text;
  v_area text;
  v_factory uuid;
  v_area_id uuid;
  v_line_id uuid;
  v_before vmp_plan_items%rowtype;
  v_after vmp_plan_items%rowtype;
  v_result jsonb;
  v_future timestamptz := (current_date + 7 + time '14:35:20') at time zone 'Asia/Bangkok';
begin
  select id into v_admin
  from public.profiles
  where role::text = 'admin' and coalesce(is_active, true)
  order by created_at limit 1;
  select id into v_user
  from public.profiles
  where role::text = 'viewer' and coalesce(is_active, true)
  order by created_at limit 1;
  select item.validation_code, area.code, factory.id, area.id, line.id
  into v_code, v_area, v_factory, v_area_id, v_line_id
  from public.vmp_plan_items item
  join public.vmp_objects object on object.code = item.object_code
  join public.vmp_scope_factories factory
    on factory.department_id = object.department and factory.is_active
  join public.vmp_scope_areas area
    on area.factory_id = factory.id and area.is_active
   and area.code = btrim(object.area)
  join public.vmp_scope_lines line
    on line.area_id = area.id and line.is_active
   and line.code = btrim(object.line)
  where item.is_active and coalesce(item.item_state, 'active') = 'active'
    and object.department = 'xsx'
    and public.vmp_item_scope_path_count(item.validation_code) = 1
  order by item.validation_code limit 1;

  if v_admin is null or v_user is null or v_code is null then
    raise exception 'Thiếu fixture để kiểm khóa từng cột timeline';
  end if;

  delete from public.vmp_item_assignments where user_id = v_user;
  delete from public.vmp_performers where user_id = v_user;
  update public.profiles
  set role = 'department_user', department = 'xsx', pham_vi = 'co', is_active = true
  where id = v_user;
  insert into public.vmp_performers (
    performer_name, email, department, user_id, access_class,
    scope_departments, access_areas, scope_factory_ids, scope_area_ids,
    scope_line_ids, is_active, updated_by
  )
  select 'E2E Người Sửa Timeline', email, 'qa', id, 'qa_progress_editor',
         array['xsx'], array[v_area], array[v_factory], array[v_area_id],
         array[v_line_id], true, v_admin
  from public.profiles where id = v_user
  returning id into v_person;
  insert into public.vmp_item_assignments (
    validation_code, performer_id, user_id, staff_name,
    assignment_kind, assignment_role, source, source_text, is_active, change_reason
  ) values (
    v_code, v_person, v_user, 'E2E Người Sửa Timeline',
    'qa', 'collaborator', 'qa_manager', 'E2E Người Sửa Timeline', true,
    'Fixture khóa cột'
  );

  update public.system_config
  set value = '"enforced"'::jsonb
  where key = 'item_permissions_mode';
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text,
    true
  );

  select * into v_before from public.vmp_plan_items where validation_code = v_code;
  v_result := public.rpc_update_progress(
    v_code,
    jsonb_build_object(
      'actual_protocol_date', current_date::text,
      'status_protocol', 'in_progress'
    ),
    'QA cập nhật đề cương', null, v_before.version
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'QA phải sửa được cột hoàn thành đề cương: %', v_result;
  end if;

  select * into v_before from public.vmp_plan_items where validation_code = v_code;
  v_result := public.rpc_update_progress(
    v_code, jsonb_build_object('scheduled_at', v_future::text),
    'QA thử sửa lịch', null, v_before.version
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false then
    raise exception 'QA không được sửa scheduled_at: %', v_result;
  end if;

  update public.vmp_performers
  set department = 'xsx', access_class = 'equipment_scheduler'
  where id = v_person;
  update public.vmp_item_assignments
  set assignment_kind = 'equipment_department', assignment_role = null
  where performer_id = v_person and validation_code = v_code;

  select * into v_before from public.vmp_plan_items where validation_code = v_code;
  v_result := public.rpc_update_progress(
    v_code, jsonb_build_object('scheduled_at', v_future::text),
    'Bộ phận quản lý thiết bị xếp lịch', null, v_before.version
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'Bộ phận thiết bị phải sửa được scheduled_at: %', v_result;
  end if;
  select * into v_after from public.vmp_plan_items where validation_code = v_code;
  if v_after.scheduled_at is distinct from v_future
      or v_after.scheduled_date is distinct from (v_future at time zone 'Asia/Bangkok')::date then
    raise exception 'scheduled_at phải giữ giờ và tương thích scheduled_date';
  end if;

  select * into v_before from public.vmp_plan_items where validation_code = v_code;
  v_result := public.rpc_update_progress(
    v_code,
    jsonb_build_object(
      'scheduled_at', (v_future + interval '1 hour')::text,
      'status_protocol', 'completed'
    ),
    'Thử gói trộn cột', null, v_before.version
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false then
    raise exception 'Gói trộn cột thiết bị + QA phải bị từ chối: %', v_result;
  end if;
  select * into v_after from public.vmp_plan_items where validation_code = v_code;
  if v_after.scheduled_at is distinct from v_before.scheduled_at
      or v_after.status_protocol is distinct from v_before.status_protocol
      or v_after.version is distinct from v_before.version then
    raise exception 'Gói trộn bị từ chối nhưng đã cập nhật một phần';
  end if;

  update public.vmp_performers set access_class = 'view_only' where id = v_person;
  select * into v_before from public.vmp_plan_items where validation_code = v_code;
  v_result := public.rpc_update_progress(
    v_code, jsonb_build_object('scheduled_at', v_future::text),
    'Người chỉ xem thử sửa', null, v_before.version
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false then
    raise exception 'view_only không được sửa timeline: %', v_result;
  end if;

  update public.system_config
  set value = '"preview"'::jsonb
  where key = 'item_permissions_mode';
  delete from public.vmp_item_assignments where performer_id = v_person;
  delete from public.vmp_performers where id = v_person;
  update public.profiles
  set role = 'viewer', department = null, pham_vi = null
  where id = v_user;
end
$test$;

do $test$
declare
  v_admin uuid;
  v_user uuid;
  v_person uuid;
  v_xsx_code text;
  v_qc_code text;
  v_area text;
  v_line text;
  v_rights record;
  v_result jsonb;
begin
  select id into v_admin
  from public.profiles
  where role::text = 'admin' and coalesce(is_active, true)
  order by created_at limit 1;
  select id into v_user
  from public.profiles
  where id <> v_admin and coalesce(is_active, true)
  order by case when role::text = 'viewer' then 0 else 1 end, created_at
  limit 1;

  select item.validation_code, object.area, object.line
  into v_xsx_code, v_area, v_line
  from public.vmp_plan_items item
  join public.vmp_objects object on object.code = item.object_code
  where item.is_active and object.department = 'xsx'
    and nullif(btrim(coalesce(object.area, '')), '') is not null
  order by item.validation_code limit 1;
  select item.validation_code into v_qc_code
  from public.vmp_plan_items item
  join public.vmp_objects object on object.code = item.object_code
  where item.is_active and object.department = 'qc'
  order by item.validation_code limit 1;

  if v_admin is null or v_user is null or v_xsx_code is null or v_qc_code is null then
    raise exception 'Thiếu fixture production để kiểm lõi quyền';
  end if;

  delete from public.vmp_item_assignments where user_id = v_user;
  delete from public.vmp_performers where user_id = v_user;
  update public.profiles
  set role = 'department_user', department = 'xsx', is_active = true
  where id = v_user;

  insert into public.vmp_performers (
    performer_name, email, department, user_id, access_class,
    scope_departments, access_areas, is_active, updated_by
  )
  select
    'E2E Người Kiểm Lõi Quyền', email, 'xsx', id, 'view_only',
    array['xsx'], array[v_area], true, v_admin
  from public.profiles where id = v_user
  returning id into v_person;

  insert into public.vmp_item_assignments (
    validation_code, performer_id, user_id, staff_name,
    assignment_kind, source, source_text, is_active, change_reason
  ) values (
    v_xsx_code, v_person, v_user, 'E2E Người Kiểm Lõi Quyền',
    'equipment_department', 'equipment_manager',
    'E2E Người Kiểm Lõi Quyền', true, 'Fixture lõi quyền'
  );

  select * into v_rights from public.vmp_item_rights(v_user, v_xsx_code);
  if not v_rights.can_view or cardinality(v_rights.editable_fields) <> 0
      or not v_rights.scope_match or not v_rights.area_match then
    raise exception 'view_only đúng phân công/phạm vi/khu vực phải chỉ xem: %', row_to_json(v_rights);
  end if;

  update public.vmp_performers
  set department = 'qa', access_class = 'qa_progress_editor',
      scope_departments = array['xsx'], access_areas = array[v_area]
  where id = v_person;
  update public.vmp_item_assignments
  set assignment_kind = 'qa', assignment_role = 'collaborator'
  where performer_id = v_person and validation_code = v_xsx_code;
  select * into v_rights from public.vmp_item_rights(v_user, v_xsx_code);
  if not v_rights.can_view or v_rights.editable_fields <> array[
    'actual_protocol_date', 'status_protocol',
    'actual_validation_date', 'status_validation',
    'actual_report_date', 'status_report',
    'actual_vmp_date', 'status_vmp'
  ]::text[] then
    raise exception 'QA phải nhận đúng tám trường hoàn thành: %', row_to_json(v_rights);
  end if;

  update public.vmp_performers
  set department = 'xsx', access_class = 'equipment_scheduler',
      scope_departments = array['xsx'], access_areas = array[v_area]
  where id = v_person;
  update public.vmp_item_assignments
  set assignment_kind = 'equipment_department', assignment_role = null
  where performer_id = v_person and validation_code = v_xsx_code;
  select * into v_rights from public.vmp_item_rights(v_user, v_xsx_code);
  if not v_rights.can_view or v_rights.editable_fields <> array['scheduled_at']::text[] then
    raise exception 'Người xếp lịch phải chỉ nhận scheduled_at: %', row_to_json(v_rights);
  end if;

  update public.vmp_performers set access_areas = array['KHU-VUC-KHAC']
  where id = v_person;
  select * into v_rights from public.vmp_item_rights(v_user, v_xsx_code);
  if v_rights.can_view or v_rights.area_match then
    raise exception 'Đúng phân công nhưng sai khu vực phải bị chặn: %', row_to_json(v_rights);
  end if;

  update public.vmp_performers
  set access_class = 'equipment_manager', access_areas = array['*']
  where id = v_person;
  select * into v_rights from public.vmp_item_rights(v_user, v_xsx_code);
  if not v_rights.can_view then
    raise exception 'Equipment manager phải thấy hạng mục bộ phận mình';
  end if;
  select * into v_rights from public.vmp_item_rights(v_user, v_qc_code);
  if v_rights.can_view then
    raise exception 'Equipment manager XSX không được thấy hạng mục QC';
  end if;

  select * into v_rights from public.vmp_item_rights(v_admin, v_qc_code);
  if not v_rights.can_view then
    raise exception 'Admin phải xem được mọi hạng mục';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text,
    true
  );
  v_result := public.rpc_item_permission_preflight();
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or jsonb_array_length(v_result->'blocking_errors') = 0 then
    raise exception 'Preflight phải trả lỗi chặn với danh bạ production chưa đủ: %', v_result;
  end if;

  v_result := public.rpc_set_item_permissions_mode(
    'enforced', 'Thử bật khi dữ liệu chưa đạt'
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false then
    raise exception 'Không được bật enforced khi preflight còn lỗi: %', v_result;
  end if;
  if public.item_permissions_mode() <> 'preview' then
    raise exception 'Mode phải giữ preview sau lần bật bị từ chối';
  end if;

  -- Hoàn nguyên fixture dùng chung để các khối kiểm thử sau không phụ thuộc thứ tự.
  delete from public.vmp_item_assignments where performer_id = v_person;
  delete from public.vmp_performers where id = v_person;
  update public.profiles
  set role = 'viewer', department = null
  where id = v_user;
end
$test$;

do $test$
declare
  v_admin uuid;
  v_manager_user uuid;
  v_manager_person uuid;
  v_qa_person uuid;
  v_xsx_person uuid;
  v_duplicate_1 uuid;
  v_duplicate_2 uuid;
  v_xsx_code text;
  v_qc_code text;
  v_result jsonb;
  v_values jsonb;
  v_factory constant uuid := '10000000-0000-0000-0000-000000000001';
  v_area constant uuid := '20000000-0000-0000-0000-000000000001';
  v_line constant uuid := '30000000-0000-0000-0000-000000000001';
begin
  select id into v_admin
  from public.profiles
  where role::text = 'admin' and coalesce(is_active, true)
  order by created_at
  limit 1;
  select id into v_manager_user
  from public.profiles
  where role::text = 'viewer' and coalesce(is_active, true)
  order by created_at
  limit 1;
  if v_admin is null or v_manager_user is null then
    raise exception 'Cần admin và viewer hoạt động để kiểm quyền quản lý';
  end if;

  select item.validation_code into v_xsx_code
  from public.vmp_plan_items item
  join public.vmp_objects object on object.code = item.object_code
  where item.is_active and object.department = 'xsx'
  order by item.validation_code
  limit 1;
  select item.validation_code into v_qc_code
  from public.vmp_plan_items item
  join public.vmp_objects object on object.code = item.object_code
  where item.is_active and object.department = 'qc'
  order by item.validation_code
  limit 1;
  if v_xsx_code is null or v_qc_code is null then
    raise exception 'Cần hạng mục XSX và QC để kiểm phạm vi quản lý';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text,
    true
  );

  v_result := public.rpc_upsert_item_permission_staff(null, jsonb_build_object(
    'full_name', 'E2E QA Được Phân Công',
    'department', 'qa',
    'access_class', 'qa_progress_editor'
  ), 'Tạo fixture QA', 0);
  v_qa_person := (v_result->>'person_id')::uuid;

  v_result := public.rpc_upsert_item_permission_staff(null, jsonb_build_object(
    'full_name', 'E2E Nhân Viên XSX Được Phân Công',
    'department', 'xsx',
    'access_class', 'equipment_scheduler',
    'scope_departments', jsonb_build_array('xsx'),
    'scope_factory_ids', jsonb_build_array(v_factory),
    'scope_area_ids', jsonb_build_array(v_area),
    'scope_line_ids', jsonb_build_array(v_line)
  ), 'Tạo fixture XSX', 0);
  v_xsx_person := (v_result->>'person_id')::uuid;

  v_result := public.rpc_upsert_item_permission_staff(null, jsonb_build_object(
    'full_name', 'E2E Tên Nguồn Bị Trùng',
    'department', 'xsx',
    'access_class', 'view_only',
    'scope_departments', jsonb_build_array('xsx'),
    'scope_factory_ids', jsonb_build_array(v_factory),
    'scope_area_ids', jsonb_build_array(v_area),
    'scope_line_ids', jsonb_build_array(v_line),
    'email', 'e2e-source-duplicate-1@example.test'
  ), 'Tạo fixture tên trùng', 0);
  v_duplicate_1 := (v_result->>'person_id')::uuid;
  v_result := public.rpc_upsert_item_permission_staff(null, jsonb_build_object(
    'full_name', ' E2E  Tên Nguồn Bị Trùng ',
    'department', 'xsx',
    'access_class', 'view_only',
    'scope_departments', jsonb_build_array('xsx'),
    'scope_factory_ids', jsonb_build_array(v_factory),
    'scope_area_ids', jsonb_build_array(v_area),
    'scope_line_ids', jsonb_build_array(v_line),
    'email', 'e2e-source-duplicate-2@example.test'
  ), 'Tạo fixture tên trùng', 0);
  v_duplicate_2 := (v_result->>'person_id')::uuid;
  if v_duplicate_1 is null or v_duplicate_2 is null then
    raise exception 'Không tạo được fixture tên trùng';
  end if;

  select source_sheet_data->'values' into v_values
  from public.vmp_plan_items where validation_code = v_xsx_code;
  if jsonb_typeof(v_values) <> 'array' then
    v_values := to_jsonb(array_fill(''::text, array[37]));
  end if;
  v_values := jsonb_set(v_values, '{17}', to_jsonb('E2E QA Được Phân Công'::text));
  v_values := jsonb_set(v_values, '{19}', to_jsonb('E2E Tên Nguồn Bị Trùng'::text));
  update public.vmp_plan_items
  set source_sheet_data = jsonb_set(
    jsonb_set(source_sheet_data, '{values}', v_values, true),
    '{row_number}', to_jsonb(999999), true
  )
  where validation_code = v_xsx_code;

  v_result := public.rpc_refresh_source_item_assignments();
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'Không refresh được phân công nguồn: %', v_result;
  end if;
  if not exists (
    select 1 from public.vmp_item_assignments
    where validation_code = v_xsx_code
      and source = 'sheet_qa'
      and performer_id = v_qa_person
      and assignment_role = 'primary'
      and unresolved_reason = 'account_unlinked'
  ) then
    raise exception 'Tên QA duy nhất phải nối đúng performer và báo chưa có tài khoản';
  end if;
  if not exists (
    select 1 from public.vmp_item_assignments
    where validation_code = v_xsx_code
      and source = 'sheet_other_staff'
      and performer_id is null
      and user_id is null
      and unresolved_reason = 'duplicate_name'
  ) then
    raise exception 'Tên nguồn trùng phải bị giữ ở trạng thái duplicate_name';
  end if;

  update public.profiles
  set role = 'department_user', department = 'xsx'
  where id = v_manager_user;
  insert into public.vmp_performers (
    performer_name, email, department, user_id, access_class,
    scope_departments, access_areas, updated_by
  )
  select
    'E2E Quản Lý Thiết Bị XSX', profile.email, 'xsx', profile.id,
    'equipment_manager', array['xsx'], array['*'], v_admin
  from public.profiles profile
  where profile.id = v_manager_user
  returning id into v_manager_person;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_manager_user::text, 'role', 'authenticated')::text,
    true
  );
  v_result := public.rpc_set_item_assignment(
    v_xsx_person, v_xsx_code, 'equipment_department', null, 'assign', 'Xếp người XSX'
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'Equipment manager phải phân công được hạng mục XSX: %', v_result;
  end if;
  v_result := public.rpc_set_item_assignment(
    v_xsx_person, v_qc_code, 'equipment_department', null, 'assign', 'Thử vượt bộ phận'
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false then
    raise exception 'Equipment manager XSX không được phân công hạng mục QC: %', v_result;
  end if;

  update public.profiles set role = 'qa_manager', department = 'qa'
  where id = v_manager_user;
  update public.vmp_performers
  set department = 'qa', access_class = 'qa_manager',
      scope_departments = array['*'], access_areas = array['*']
  where id = v_manager_person;
  v_result := public.rpc_set_item_assignment(
    v_qa_person, v_xsx_code, 'qa', 'primary', 'assign', 'QA phân công phụ trách'
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'QA manager phải phân công QA được: %', v_result;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text,
    true
  );
  perform public.rpc_refresh_source_item_assignments();
  if not exists (
    select 1 from public.vmp_item_assignments
    where validation_code = v_xsx_code
      and source in ('qa_manager', 'equipment_manager')
      and is_active
  ) then
    raise exception 'Refresh nguồn không được xóa phân công tay của quản lý';
  end if;
end
$test$;

do $test$
declare
  v_admin uuid;
  v_result jsonb;
  v_directory jsonb;
  v_valid_area text;
  v_import_factory constant uuid := '71000000-0000-0000-0000-000000000001';
  v_import_area constant uuid := '81000000-0000-0000-0000-000000000001';
  v_import_line constant uuid := '91000000-0000-0000-0000-000000000001';
  v_qc_factory constant uuid := '10000000-0000-0000-0000-000000000003';
  v_qc_area constant uuid := '20000000-0000-0000-0000-000000000003';
  v_qc_line constant uuid := '30000000-0000-0000-0000-000000000003';
  v_xsx_factory constant uuid := '10000000-0000-0000-0000-000000000001';
  v_xsx_area constant uuid := '20000000-0000-0000-0000-000000000004';
  v_xsx_line constant uuid := '30000000-0000-0000-0000-000000000004';
begin
  select id into v_admin
  from public.profiles
  where role::text = 'admin' and coalesce(is_active, true)
  order by created_at
  limit 1;

  if v_admin is null then
    raise exception 'Cần một admin hoạt động để kiểm RPC danh bạ';
  end if;
  select area into v_valid_area
  from public.vmp_objects
  where nullif(btrim(coalesce(area, '')), '') is not null
  order by code limit 1;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text,
    true
  );

  v_result := public.rpc_upsert_item_permission_staff(
    null,
    jsonb_build_object(
      'employee_code', 'E2E-PQ-20260810-A',
      'full_name', 'E2E Phân Quyền Tên Duy Nhất',
      'department', 'qc',
      'access_class', 'view_only',
      'scope_departments', jsonb_build_array('qc'),
      'scope_factory_ids', jsonb_build_array(v_qc_factory),
      'scope_area_ids', jsonb_build_array(v_qc_area),
      'scope_line_ids', jsonb_build_array(v_qc_line),
      'email', 'e2e-pq-unique@example.test'
    ),
    'Kiểm danh bạ tự động',
    0
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'Không tạo được người thử: %', v_result;
  end if;

  v_directory := public.rpc_item_permission_directory('Tên Duy Nhất');
  if jsonb_array_length(v_directory->'people') <> 1 then
    raise exception 'Autocomplete phải trả đúng một người: %', v_directory;
  end if;
  if v_directory->'people'->0->>'match_status' <> 'unique' then
    raise exception 'Tên duy nhất phải có match_status=unique: %', v_directory;
  end if;

  perform public.rpc_upsert_item_permission_staff(
    null,
    jsonb_build_object(
      'full_name', 'E2E Phân Quyền Tên Trùng',
      'department', 'qa',
      'access_class', 'qa_progress_editor',
      'email', 'e2e-pq-duplicate-1@example.test'
    ),
    'Kiểm cảnh báo trùng tên',
    0
  );
  perform public.rpc_upsert_item_permission_staff(
    null,
    jsonb_build_object(
      'full_name', '  E2E   Phân Quyền Tên Trùng ',
      'department', 'xsx',
      'access_class', 'view_only',
      'scope_departments', jsonb_build_array('xsx'),
      'scope_factory_ids', jsonb_build_array(v_xsx_factory),
      'scope_area_ids', jsonb_build_array(v_xsx_area),
      'scope_line_ids', jsonb_build_array(v_xsx_line),
      'email', 'e2e-pq-duplicate-2@example.test'
    ),
    'Kiểm cảnh báo trùng tên',
    0
  );

  v_directory := public.rpc_item_permission_directory('E2E Phân Quyền Tên Trùng');
  if jsonb_array_length(v_directory->'people') <> 2 then
    raise exception 'Tên trùng phải trả cả hai ứng viên: %', v_directory;
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_directory->'people') person
    where person->>'match_status' <> 'ambiguous'
  ) then
    raise exception 'Mọi ứng viên trùng tên phải là ambiguous: %', v_directory;
  end if;

  v_result := public.rpc_upsert_item_permission_staff(
    null,
    jsonb_build_object(
      'employee_code', 'E2E-PQ-20260810-A',
      'full_name', 'E2E Mã Nhân Viên Bị Trùng',
      'department', 'qc',
      'access_class', 'view_only',
      'scope_departments', jsonb_build_array('qc'),
      'scope_factory_ids', jsonb_build_array(v_qc_factory),
      'scope_area_ids', jsonb_build_array(v_qc_area),
      'scope_line_ids', jsonb_build_array(v_qc_line)
    ),
    'Kiểm mã nhân viên trùng',
    0
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false
      or v_result->>'error' not ilike '%mã nhân viên%' then
    raise exception 'Mã nhân viên trùng phải bị từ chối rõ ràng: %', v_result;
  end if;

  insert into public.vmp_scope_factories(id, code, name, department_id)
  values (v_import_factory, 'IMPORT-QC-F', 'Import QC factory', 'qc');
  insert into public.vmp_scope_areas(id, code, name, factory_id)
  values (v_import_area, v_valid_area, 'Import QC area', v_import_factory);
  insert into public.vmp_scope_lines(id, code, name, area_id)
  values (v_import_line, 'IMPORT-QC-L', 'Import QC line', v_import_area);

  v_result := public.rpc_import_item_permission_staff(
    jsonb_build_array(jsonb_build_object(
      'row_number', 8,
      'full_name', 'E2E Người Nhập Từ Excel',
      'department', 'qc',
      'access_class', 'view_only',
      'scope_departments', jsonb_build_array('qc'),
      'scope_factory_ids', jsonb_build_array(v_import_factory),
      'scope_area_ids', jsonb_build_array(v_import_area),
      'scope_line_ids', jsonb_build_array(v_import_line)
    )),
    'Nhập thử file Excel'
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or (v_result->>'imported')::int <> 1 then
    raise exception 'Importer phải nhập được một dòng hợp lệ: %', v_result;
  end if;
end
$test$;

select 'ITEM_PERMISSION_SQL_PHASE_SOURCE_RESOLUTION';

/* Resolve tên trùng phải bền qua refresh; denormalized link và preflight phải khớp. */
do $test$
declare
  v_admin uuid;
  v_linked_user uuid;
  v_manager_user uuid;
  v_manager_person uuid;
  v_person_1 uuid;
  v_person_2 uuid;
  v_legacy_person uuid;
  v_code text;
  v_area text;
  v_values jsonb;
  v_assignment uuid;
  v_result jsonb;
begin
  select id into v_admin
  from public.profiles
  where role::text = 'admin' and coalesce(is_active, true)
  order by created_at limit 1;
  select profile.id into v_manager_user
  from public.profiles profile
  join public.vmp_performers person on person.user_id = profile.id
  where profile.id <> v_admin and person.access_class = 'equipment_manager'
  order by profile.created_at limit 1;
  select profile.id into v_linked_user
  from public.profiles profile
  where profile.id not in (v_admin, v_manager_user)
    and coalesce(profile.is_active, true)
  order by profile.created_at limit 1;
  select item.validation_code, object.area
  into v_code, v_area
  from public.vmp_plan_items item
  join public.vmp_objects object on object.code = item.object_code
  where item.is_active and object.department = 'xsx'
    and nullif(btrim(coalesce(object.area, '')), '') is not null
  order by item.validation_code limit 1;
  if v_admin is null or v_linked_user is null or v_manager_user is null
      or v_code is null then
    raise exception 'Thiếu fixture để kiểm resolve/preflight';
  end if;

  delete from public.vmp_item_assignments
  where performer_id in (
    select id from public.vmp_performers where user_id = v_linked_user
  );
  delete from public.vmp_performers where user_id = v_linked_user;

  select id into v_manager_person
  from public.vmp_performers where user_id = v_manager_user;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text,
    true
  );

  insert into public.vmp_performers (
    performer_name, employee_code, department, access_class,
    scope_departments, access_areas, is_active, updated_by
  ) values (
    'E2E Resolve Tên Trùng', 'E2E-RESOLVE-1', 'xsx', 'view_only',
    array['xsx'], array[v_area], true, v_admin
  ) returning id into v_person_1;
  insert into public.vmp_performers (
    performer_name, employee_code, department, access_class,
    scope_departments, access_areas, is_active, updated_by
  ) values (
    ' E2E  Resolve Tên Trùng ', 'E2E-RESOLVE-2', 'xsx', 'view_only',
    array['xsx'], array[v_area], true, v_admin
  ) returning id into v_person_2;

  select source_sheet_data->'values' into v_values
  from public.vmp_plan_items where validation_code = v_code;
  if jsonb_typeof(v_values) <> 'array' then
    v_values := to_jsonb(array_fill(''::text, array[37]));
  end if;
  v_values := jsonb_set(v_values, '{19}', to_jsonb('E2E Resolve Tên Trùng'::text));
  update public.vmp_plan_items
  set source_sheet_data = jsonb_set(source_sheet_data, '{values}', v_values, true)
  where validation_code = v_code;

  perform public.rpc_refresh_source_item_assignments();
  select id into v_assignment
  from public.vmp_item_assignments
  where validation_code = v_code and source = 'sheet_other_staff'
    and normalized_staff_name = public.vmp_normalize_person_name('E2E Resolve Tên Trùng');
  if v_assignment is null then
    raise exception 'Refresh phải tạo assignment tên trùng để resolve';
  end if;
  v_result := public.rpc_resolve_source_item_assignment(
    v_assignment, v_person_1, 'Chọn đúng nhân viên khi tên trùng'
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'Không lưu được quyết định resolve tay: %', v_result;
  end if;
  if not exists (
    select 1 from public.vmp_source_assignment_resolutions
    where validation_code = v_code and performer_id = v_person_1
  ) then
    raise exception 'Resolve tay phải tạo mapping bền';
  end if;

  perform public.rpc_refresh_source_item_assignments();
  select id into v_assignment
  from public.vmp_item_assignments
  where validation_code = v_code and source = 'sheet_other_staff'
    and performer_id = v_person_1 and unresolved_reason = 'account_unlinked';
  if v_assignment is null then
    raise exception 'Refresh phải ưu tiên mapping đã resolve dù tên vẫn trùng';
  end if;

  update public.vmp_performers
  set performer_name = 'E2E Resolve Đã Đổi Tên',
      employee_code = 'E2E-RESOLVE-1-NEW',
      user_id = v_linked_user
  where id = v_person_1;
  if not exists (
    select 1 from public.vmp_item_assignments
    where id = v_assignment and user_id = v_linked_user
      and staff_name = 'E2E Resolve Đã Đổi Tên'
      and employee_code = 'E2E-RESOLVE-1-NEW'
      and unresolved_reason is null
  ) then
    raise exception 'Assignment không đồng bộ user/mã/tên/reason khi performer đổi';
  end if;
  update public.vmp_performers set user_id = null where id = v_person_1;
  if not exists (
    select 1 from public.vmp_item_assignments
    where id = v_assignment and user_id is null
      and unresolved_reason = 'account_unlinked'
  ) then
    raise exception 'Gỡ tài khoản performer phải đồng bộ account_unlinked';
  end if;
  update public.vmp_performers set user_id = v_linked_user where id = v_person_1;

  /* Tạo dữ liệu legacy sai để chứng minh preflight bắt đúng từng lớp. */
  update public.vmp_item_assignments
  set user_id = v_admin,
      employee_code = 'E2E-DENORMAL-SAI',
      staff_name = 'E2E Denormal Sai',
      unresolved_reason = null
  where id = v_assignment;
  insert into public.vmp_performers (
    performer_name, department, access_class,
    scope_departments, access_areas, is_active, updated_by
  ) values (
    'E2E Legacy Scope Typo', 'xsx', 'view_only',
    array['xsx'], array[v_area], true, v_admin
  ) returning id into v_legacy_person;
  update public.vmp_performers
  set department = 'khong-ton-tai',
      scope_departments = array['xssx'],
      access_areas = array['KHU-VUC-KHONG-TON-TAI']
  where id = v_legacy_person;
  update public.profiles
  set role = 'qa_manager', department = 'qa'
  where id = v_manager_user;

  v_result := public.rpc_item_permission_preflight();
  if (
    select count(*)
    from jsonb_array_elements(v_result->'blocking_errors') error
    where (error->>'record_id')::uuid = v_assignment
      and error->>'code' in (
        'ASSIGNMENT_USER_MISMATCH', 'ASSIGNMENT_ACCOUNT_MISMATCH'
      )
  ) <> 1 or not exists (
    select 1 from jsonb_array_elements(v_result->'blocking_errors') error
    where error->>'code' = 'ASSIGNMENT_USER_MISMATCH'
      and (error->>'record_id')::uuid = v_assignment
  ) or exists (
    select 1 from jsonb_array_elements(v_result->'blocking_errors') error
    where error->>'code' = 'ASSIGNMENT_ACCOUNT_MISMATCH'
      and (error->>'record_id')::uuid = v_assignment
  ) then
    raise exception 'Một user mismatch phải sinh đúng một blocker canonical: %', v_result;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_result->'blocking_errors') error
    where error->>'code' = 'ASSIGNMENT_DENORMALIZED_MISMATCH'
      and (error->>'record_id')::uuid = v_assignment
  ) then
    raise exception 'Preflight chưa bắt mã/tên/reason denormalized bị stale: %', v_result;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_result->'blocking_errors') error
    where error->>'code' = 'INVALID_SCOPE_DEPARTMENT'
      and (error->>'record_id')::uuid = v_legacy_person
  ) or not exists (
    select 1 from jsonb_array_elements(v_result->'blocking_errors') error
    where error->>'code' = 'INVALID_ACCESS_AREA'
      and (error->>'record_id')::uuid = v_legacy_person
  ) then
    raise exception 'Preflight chưa bắt scope/area legacy typo: %', v_result;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_result->'blocking_errors') error
    where error->>'code' = 'INVALID_PERSON_DEPARTMENT'
      and (error->>'record_id')::uuid = v_legacy_person
  ) then
    raise exception 'Preflight chưa bắt performer.department ngoài catalog: %', v_result;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_result->'blocking_errors') error
    where error->>'code' = 'INVALID_MANAGER_PRINCIPAL'
      and (error->>'record_id')::uuid = v_manager_person
  ) then
    raise exception 'Preflight chưa bắt principal quản lý bất nhất: %', v_result;
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_result->'blocking_errors') error
    where error->>'code' = 'DUPLICATE_NORMALIZED_NAME'
  ) then
    raise exception 'Preflight không được block mọi tên trùng toàn cục: %', v_result;
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_result->'blocking_errors') error
    where error->>'code' = 'UNRESOLVED_ASSIGNMENT'
      and (error->>'record_id')::uuid = v_assignment
  ) then
    raise exception 'Assignment tên trùng đã resolve không được coi là unresolved: %', v_result;
  end if;

  update public.vmp_item_assignments assignment
  set user_id = person.user_id,
      employee_code = person.employee_code,
      staff_name = person.performer_name,
      unresolved_reason = 'not_found'
  from public.vmp_performers person
  where assignment.id = v_assignment and person.id = assignment.performer_id;
  v_result := public.rpc_item_permission_preflight();
  if not exists (
    select 1 from jsonb_array_elements(v_result->'blocking_errors') error
    where error->>'code' = 'ASSIGNMENT_DENORMALIZED_MISMATCH'
      and (error->>'record_id')::uuid = v_assignment
  ) then
    raise exception 'Preflight chưa bắt unresolved_reason stale: %', v_result;
  end if;

  update public.vmp_performers set is_active = false where id = v_person_1;
  perform public.rpc_refresh_source_item_assignments();
  select id into v_assignment
  from public.vmp_item_assignments
  where validation_code = v_code and source = 'sheet_other_staff'
    and public.vmp_normalize_person_name(source_text) =
        public.vmp_normalize_person_name('E2E Resolve Tên Trùng');
  if v_assignment is null or not exists (
    select 1 from public.vmp_item_assignments
    where id = v_assignment and performer_id is null and user_id is null
      and unresolved_reason = 'stale_resolution'
  ) then
    raise exception 'Mapping tới performer inactive phải giữ stale, không remap người trùng khác';
  end if;
  if not exists (
    select 1 from public.vmp_source_assignment_resolutions
    where validation_code = v_code and performer_id = v_person_1
  ) then
    raise exception 'Mapping inactive phải được giữ để quản lý xử lý rõ ràng';
  end if;

  delete from public.vmp_performers where id = v_person_1;
  perform public.rpc_refresh_source_item_assignments();
  if not exists (
    select 1 from public.vmp_source_assignment_resolutions
    where validation_code = v_code and performer_id is null
  ) or not exists (
    select 1 from public.vmp_item_assignments
    where validation_code = v_code and source = 'sheet_other_staff'
      and performer_id is null and unresolved_reason = 'stale_resolution'
  ) then
    raise exception 'Xóa performer phải giữ mapping stale, không cascade/remap';
  end if;
  v_result := public.rpc_item_permission_preflight();
  if not exists (
    select 1 from jsonb_array_elements(v_result->'blocking_errors') error
    where error->>'code' = 'STALE_SOURCE_RESOLUTION'
  ) then
    raise exception 'Preflight chưa chặn mapping resolve stale: %', v_result;
  end if;

  v_values := jsonb_set(v_values, '{19}', to_jsonb(''::text));
  update public.vmp_plan_items
  set source_sheet_data = jsonb_set(source_sheet_data, '{values}', v_values, true)
  where validation_code = v_code;
  perform public.rpc_refresh_source_item_assignments();
  if exists (
    select 1 from public.vmp_item_assignments
    where validation_code = v_code and source = 'sheet_other_staff'
      and public.vmp_normalize_person_name(source_text) =
          public.vmp_normalize_person_name('E2E Resolve Tên Trùng')
  ) then
    raise exception 'Fixture source đã xóa nhưng assignment cũ vẫn còn';
  end if;
  v_result := public.rpc_item_permission_preflight();
  if exists (
    select 1 from jsonb_array_elements(v_result->'blocking_errors') error
    where error->>'code' = 'STALE_SOURCE_RESOLUTION'
      and error->>'record_id' like v_code || '×sheet_other_staff×%'
  ) then
    raise exception 'Mapping orphan của source đã hết không được khóa preflight: %', v_result;
  end if;

  v_result := public.rpc_cleanup_orphan_source_assignment_resolutions(
    'Dọn mapping của source không còn tồn tại'
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or (v_result->>'cleaned')::integer < 1
      or exists (
        select 1 from public.vmp_source_assignment_resolutions
        where validation_code = v_code and source = 'sheet_other_staff'
      ) then
    raise exception 'Cleanup phải xóa mapping orphan an toàn: %', v_result;
  end if;
  if not exists (
    select 1 from public.audit_logs
    where table_name = 'vmp_source_assignment_resolutions'
      and source = 'source_resolution_cleanup'
      and change_reason = 'Dọn mapping của source không còn tồn tại'
  ) then
    raise exception 'Cleanup mapping orphan phải ghi audit';
  end if;
end
$test$;

select 'ITEM_PERMISSION_SQL_TESTS_COMPLETE';

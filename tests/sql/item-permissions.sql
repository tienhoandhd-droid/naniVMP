select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '11111111-1111-1111-1111-111111111111',
    'role', 'authenticated'
  )::text,
  true
);

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
  if has_function_privilege(
    'service_role',
    'public.rpc_set_item_assignment(uuid,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'Không được grant service_role vào RPC phụ thuộc auth.uid manager';
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
    validation_code, performer_id, staff_name, assignment_kind, source,
    source_text, unresolved_reason, is_active, change_reason
  ) values
    (v_xsx_code, v_qa_person, 'E2E Reader Người QA', 'qa', 'qa_manager',
     'E2E Reader Người QA', 'account_unlinked', true, 'Fixture reader'),
    (v_xsx_code, v_xsx_person, 'E2E Reader Người XSX',
     'equipment_department', 'equipment_manager',
     'E2E Reader Người XSX', 'account_unlinked', true, 'Fixture reader'),
    (v_qc_code, v_qa_person, 'E2E Reader Người QA', 'qa', 'qa_manager',
     'E2E Reader Người QA', 'account_unlinked', true, 'Fixture reader'),
    (v_qc_code, v_qc_person, 'E2E Reader Người QC',
     'equipment_department', 'equipment_manager',
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
  v_user uuid;
  v_user_email text;
  v_area text;
  v_result jsonb;
begin
  select id into v_admin
  from public.profiles
  where role::text = 'admin' and coalesce(is_active, true)
  order by created_at limit 1;
  select id, email into v_user, v_user_email
  from public.profiles
  where id <> v_admin and coalesce(is_active, true)
  order by case when role::text = 'viewer' then 0 else 1 end, created_at
  limit 1;
  select area into v_area
  from public.vmp_objects
  where nullif(btrim(coalesce(area, '')), '') is not null
  order by code limit 1;
  if v_admin is null or v_user is null or v_area is null then
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
    'access_areas', jsonb_build_array(v_area)
  ), 'Kiểm typo bộ phận');
  if coalesce((v_result->>'ok')::boolean, true) is not false then
    raise exception 'scope_departments typo phải bị RPC từ chối: %', v_result;
  end if;

  v_result := public.rpc_upsert_item_permission_staff(null, jsonb_build_object(
    'full_name', 'E2E Scope Sai Khu Vực',
    'department', 'xsx',
    'access_class', 'view_only',
    'scope_departments', jsonb_build_array('xsx'),
    'access_areas', jsonb_build_array('KHU-VUC-KHONG-TON-TAI')
  ), 'Kiểm typo khu vực');
  if coalesce((v_result->>'ok')::boolean, true) is not false then
    raise exception 'access_areas typo phải bị RPC từ chối: %', v_result;
  end if;

  v_result := public.rpc_upsert_item_permission_staff(null, jsonb_build_object(
    'full_name', 'E2E Department Sai Danh Mục',
    'department', 'khong-ton-tai',
    'access_class', 'view_only',
    'scope_departments', jsonb_build_array('*'),
    'access_areas', jsonb_build_array('*')
  ), 'Kiểm department typo');
  if coalesce((v_result->>'ok')::boolean, true) is not false then
    raise exception 'department ngoài catalog phải bị RPC từ chối dù scope=*: %',
      v_result;
  end if;

  v_result := public.rpc_import_item_permission_staff(
    jsonb_build_array(jsonb_build_object(
      'row_number', 405,
      'full_name', 'E2E Import Department Sai',
      'department', 'khong-ton-tai',
      'access_class', 'view_only',
      'scope_departments', jsonb_build_array('*'),
      'access_areas', jsonb_build_array('*')
    )),
    'Kiểm import department typo'
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false
      or (v_result->>'imported')::integer <> 0
      or jsonb_array_length(v_result->'errors') <> 1 then
    raise exception 'Importer phải từ chối department ngoài catalog: %', v_result;
  end if;

  v_result := public.rpc_import_item_permission_staff(
    jsonb_build_array(jsonb_build_object(
      'row_number', 404,
      'full_name', 'E2E Import Scope Sai',
      'department', 'xsx',
      'access_class', 'view_only',
      'scope_departments', jsonb_build_array('xsx-typo'),
      'access_areas', jsonb_build_array(v_area)
    )),
    'Kiểm import typo'
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false
      or (v_result->>'imported')::integer <> 0
      or jsonb_array_length(v_result->'errors') <> 1 then
    raise exception 'Importer phải báo đúng dòng scope sai: %', v_result;
  end if;

  v_result := public.rpc_import_item_permission_staff(
    jsonb_build_array(
      jsonb_build_object(
        'row_number', 501,
        'full_name', 'E2E Import Atomic Dòng Hợp Lệ',
        'department', 'xsx',
        'access_class', 'view_only',
        'scope_departments', jsonb_build_array('xsx'),
        'access_areas', jsonb_build_array(v_area)
      ),
      jsonb_build_object(
        'row_number', 502,
        'full_name', 'E2E Import Atomic Dòng Lỗi',
        'department', 'xsx',
        'access_class', 'view_only',
        'scope_departments', jsonb_build_array('xsx-typo'),
        'access_areas', jsonb_build_array(v_area)
      )
    ),
    'Kiểm batch atomic'
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false
      or (v_result->>'imported')::integer <> 0
      or exists (
        select 1 from public.vmp_performers
        where normalized_full_name = public.vmp_normalize_person_name(
          'E2E Import Atomic Dòng Hợp Lệ'
        )
      ) then
    raise exception 'Batch có dòng lỗi phải rollback cả dòng hợp lệ: %', v_result;
  end if;

  update public.profiles
  set role = 'viewer', department = 'qc', is_active = true
  where id = v_user;
  v_result := public.rpc_upsert_item_permission_staff(null, jsonb_build_object(
    'full_name', 'E2E Principal Thiết Bị Sai',
    'email', v_user_email,
    'department', 'xsx',
    'access_class', 'equipment_manager',
    'scope_departments', jsonb_build_array('xsx'),
    'access_areas', jsonb_build_array(v_area)
  ), 'Kiểm principal thiết bị');
  if coalesce((v_result->>'ok')::boolean, true) is not false then
    raise exception 'equipment_manager lệch role/department profile phải bị từ chối: %',
      v_result;
  end if;
end
$test$;

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
  v_year integer;
  v_all_count bigint;
  v_hidden_assignment uuid;
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

  select visible.validation_code, hidden.validation_code, hidden.object_code,
         object.department, object.area, visible.year
  into v_visible_code, v_hidden_code, v_hidden_object,
       v_department, v_area, v_year
  from public.vmp_plan_items visible
  join public.vmp_objects object on object.code = visible.object_code
  join lateral (
    select candidate.validation_code, candidate.object_code
    from public.vmp_plan_items candidate
    join public.vmp_objects candidate_object on candidate_object.code = candidate.object_code
    where candidate.is_active and candidate.year = visible.year
      and candidate.validation_code <> visible.validation_code
      and candidate.object_code <> visible.object_code
      and coalesce(candidate_object.area, candidate_object.line, '')
          <> coalesce(object.area, object.line, '')
    order by candidate.validation_code
    limit 1
  ) hidden on true
  where visible.is_active
    and nullif(btrim(coalesce(object.department, '')), '') is not null
    and nullif(btrim(coalesce(object.area, object.line, '')), '') is not null
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
  insert into public.vmp_performers (
    performer_name, email, department, user_id, access_class,
    scope_departments, access_areas, is_active, updated_by
  )
  select 'E2E Người Kiểm RLS Hạng Mục', email, v_department, id, 'view_only',
         array[v_department], array[coalesce(v_area, '*')], true, v_admin
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
    validation_code, staff_name, assignment_kind, source, source_text,
    unresolved_reason, is_active, change_reason
  ) values (
    v_hidden_code, 'E2E Phân Công Hạng Mục Ẩn', 'qa', 'sheet_qa',
    'E2E Phân Công Hạng Mục Ẩn', 'not_found', true,
    'Fixture chống lộ bảng phân công'
  ) returning id into v_hidden_assignment;

  select count(*) into v_all_count from public.vmp_plan_items;
  if (select count(*) from public.vmp_visible_plan_items()) <> v_all_count then
    raise exception 'Preview phải giữ nguyên toàn bộ tập hạng mục đang đọc';
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
begin
  if exists (select 1 from public.vmp_unfiltered_security_definer_item_readers()) then
    raise exception 'Audit vẫn còn đường đọc SECURITY DEFINER không lọc';
  end if;
  update public.system_config set value = '"preview"'::jsonb
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
  v_code text;
  v_area text;
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
  select item.validation_code, object.area
  into v_code, v_area
  from public.vmp_plan_items item
  join public.vmp_objects object on object.code = item.object_code
  where item.is_active and coalesce(item.item_state, 'active') = 'active'
    and object.department = 'xsx'
    and nullif(btrim(coalesce(object.area, '')), '') is not null
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
    scope_departments, access_areas, is_active, updated_by
  )
  select 'E2E Người Sửa Timeline', email, 'qa', id, 'qa_progress_editor',
         array['xsx'], array[v_area], true, v_admin
  from public.profiles where id = v_user
  returning id into v_person;
  insert into public.vmp_item_assignments (
    validation_code, performer_id, user_id, staff_name,
    assignment_kind, source, source_text, is_active, change_reason
  ) values (
    v_code, v_person, v_user, 'E2E Người Sửa Timeline',
    'qa', 'qa_manager', 'E2E Người Sửa Timeline', true, 'Fixture khóa cột'
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
  set assignment_kind = 'equipment_department'
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
  update public.vmp_item_assignments set assignment_kind = 'qa'
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
  update public.vmp_item_assignments set assignment_kind = 'equipment_department'
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
    'access_class', 'qa_progress_editor',
    'scope_departments', jsonb_build_array('*'),
    'access_areas', jsonb_build_array('*')
  ), 'Tạo fixture QA');
  v_qa_person := (v_result->>'person_id')::uuid;

  v_result := public.rpc_upsert_item_permission_staff(null, jsonb_build_object(
    'full_name', 'E2E Nhân Viên XSX Được Phân Công',
    'department', 'xsx',
    'access_class', 'equipment_scheduler',
    'scope_departments', jsonb_build_array('xsx'),
    'access_areas', jsonb_build_array('*')
  ), 'Tạo fixture XSX');
  v_xsx_person := (v_result->>'person_id')::uuid;

  v_result := public.rpc_upsert_item_permission_staff(null, jsonb_build_object(
    'full_name', 'E2E Tên Nguồn Bị Trùng',
    'department', 'xsx',
    'access_class', 'view_only',
    'scope_departments', jsonb_build_array('xsx'),
    'access_areas', jsonb_build_array('*'),
    'email', 'e2e-source-duplicate-1@example.test'
  ), 'Tạo fixture tên trùng');
  v_duplicate_1 := (v_result->>'person_id')::uuid;
  v_result := public.rpc_upsert_item_permission_staff(null, jsonb_build_object(
    'full_name', ' E2E  Tên Nguồn Bị Trùng ',
    'department', 'xsx',
    'access_class', 'view_only',
    'scope_departments', jsonb_build_array('xsx'),
    'access_areas', jsonb_build_array('*'),
    'email', 'e2e-source-duplicate-2@example.test'
  ), 'Tạo fixture tên trùng');
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
    v_xsx_person, v_xsx_code, 'equipment_department', 'assign', 'Xếp người XSX'
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'Equipment manager phải phân công được hạng mục XSX: %', v_result;
  end if;
  v_result := public.rpc_set_item_assignment(
    v_xsx_person, v_qc_code, 'equipment_department', 'assign', 'Thử vượt bộ phận'
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
    v_qa_person, v_xsx_code, 'qa', 'assign', 'QA phân công phụ trách'
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
      'access_areas', jsonb_build_array('*'),
      'email', 'e2e-pq-unique@example.test'
    ),
    'Kiểm danh bạ tự động'
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
      'scope_departments', jsonb_build_array('qa'),
      'access_areas', jsonb_build_array('*'),
      'email', 'e2e-pq-duplicate-1@example.test'
    ),
    'Kiểm cảnh báo trùng tên'
  );
  perform public.rpc_upsert_item_permission_staff(
    null,
    jsonb_build_object(
      'full_name', '  E2E   Phân Quyền Tên Trùng ',
      'department', 'xsx',
      'access_class', 'view_only',
      'scope_departments', jsonb_build_array('xsx'),
      'access_areas', jsonb_build_array('A1'),
      'email', 'e2e-pq-duplicate-2@example.test'
    ),
    'Kiểm cảnh báo trùng tên'
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
      'access_areas', jsonb_build_array('*')
    ),
    'Kiểm mã nhân viên trùng'
  );
  if coalesce((v_result->>'ok')::boolean, true) is not false
      or v_result->>'error' not ilike '%mã nhân viên%' then
    raise exception 'Mã nhân viên trùng phải bị từ chối rõ ràng: %', v_result;
  end if;

  v_result := public.rpc_import_item_permission_staff(
    jsonb_build_array(jsonb_build_object(
      'row_number', 8,
      'full_name', 'E2E Người Nhập Từ Excel',
      'department', 'qc',
      'access_class', 'view_only',
      'scope_departments', jsonb_build_array('qc'),
      'access_areas', jsonb_build_array(v_valid_area)
    )),
    'Nhập thử file Excel'
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or (v_result->>'imported')::int <> 1 then
    raise exception 'Importer phải nhập được một dòng hợp lệ: %', v_result;
  end if;
end
$test$;

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
  if not exists (
    select 1 from jsonb_array_elements(v_result->'blocking_errors') error
    where error->>'code' = 'ASSIGNMENT_USER_MISMATCH'
      and (error->>'record_id')::uuid = v_assignment
  ) then
    raise exception 'Preflight chưa bắt assignment.user_id lệch performer.user_id: %', v_result;
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
end
$test$;

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
begin
  select id into v_admin
  from public.profiles
  where role::text = 'admin' and coalesce(is_active, true)
  order by created_at
  limit 1;

  if v_admin is null then
    raise exception 'Cần một admin hoạt động để kiểm RPC danh bạ';
  end if;

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
      'department', 'rd',
      'access_class', 'view_only',
      'scope_departments', jsonb_build_array('rd'),
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
      'department', 'rd',
      'access_class', 'view_only',
      'scope_departments', jsonb_build_array('rd'),
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
      'access_areas', jsonb_build_array('Hóa lý 1')
    )),
    'Nhập thử file Excel'
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true
      or (v_result->>'imported')::int <> 1 then
    raise exception 'Importer phải nhập được một dòng hợp lệ: %', v_result;
  end if;
end
$test$;

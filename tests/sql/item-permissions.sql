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

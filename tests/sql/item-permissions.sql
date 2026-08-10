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

/* Task 11: preview giữ nguyên; enforced chỉ đọc hạng mục được cấp. */
do $test$
declare
  v_admin uuid;
  v_user uuid;
  v_person uuid;
  v_visible_code text;
  v_hidden_code text;
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

  select visible.validation_code, hidden.validation_code,
         object.department, object.area, visible.year
  into v_visible_code, v_hidden_code, v_department, v_area, v_year
  from public.vmp_plan_items visible
  join public.vmp_objects object on object.code = visible.object_code
  join lateral (
    select candidate.validation_code
    from public.vmp_plan_items candidate
    join public.vmp_objects candidate_object on candidate_object.code = candidate.object_code
    where candidate.is_active and candidate.year = visible.year
      and candidate.validation_code <> visible.validation_code
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
  v_year integer := current_setting('app.test_item_year')::integer;
  v_hidden_assignment uuid := current_setting('app.test_hidden_assignment')::uuid;
  v_dashboard jsonb;
  v_result jsonb;
begin
  if (select count(*) from public.vmp_plan_items) <> 1
      or not exists (
        select 1 from public.vmp_plan_items
        where validation_code = v_visible_code
      ) then
    raise exception 'RLS enforced phải chỉ trả đúng hạng mục được cấp';
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
  if not (v_dashboard->'activities'->0->'_raw' ? 'scheduled_at') then
    raise exception 'Dashboard phải trả scheduled_at đầy đủ trong _raw';
  end if;
  if exists (
    select 1 from public.vmp_item_assignments
    where id = v_hidden_assignment
  ) then
    raise exception 'RLS enforced làm lộ phân công của hạng mục ngoài khu vực';
  end if;
  if not exists (
    select 1 from public.vmp_item_assignments
    where validation_code = v_visible_code
      and user_id = auth.uid()
  ) then
    raise exception 'RLS phải giữ phân công thuộc hạng mục được xem';
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

\set ON_ERROR_STOP on

\if :{?catalog_concurrency_setup}
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

insert into public.vmp_source_objects (
  id, object_kind, object_code, object_name, department, validate_flag,
  frequency_months, report_class, workdays, first_month, year_ref,
  source_tab, source_row, version, timeline_revision, timeline_applied_revision
)
values
  ('a2000000-0000-4000-8000-000000000001','Thiết bị','CCTB-CONC-AA','Concurrency AA',null,'y',12,'Hóa lý',5,3,2025,'test',201,1,1,0),
  ('a2000000-0000-4000-8000-000000000002','Thiết bị','CCTB-CONC-SA','Concurrency SA',null,'y',12,'Hóa lý',5,3,2025,'test',202,1,1,0),
  ('a2000000-0000-4000-8000-000000000003','Thiết bị','CCTB-CONC-LS','Concurrency lock superset',null,'y',12,'Hóa lý',5,3,2025,'test',203,1,1,0);
insert into public.vmp_objects (code,name,classification,frequency_months)
values ('CCTB-CONC-AA','Concurrency AA','tb',12),
       ('CCTB-CONC-SA','Concurrency SA','tb',12),
       ('CCTB-CONC-LS','Concurrency lock superset','tb',12);
insert into public.vmp_plan_items (
  id, validation_code, object_code, validation_type, year, report_class,
  effort_days, deadline_protocol, deadline_validation, deadline_report,
  deadline_vmp, actual_validation_date, status_validation, version,
  departments, owner_name, source_sheet_data
)
values
  ('CCTB-CONC-AA/2026.01-PQ','CCTB-CONC-AA/2026.01-PQ','CCTB-CONC-AA','PQ',2026,'Hóa lý',5,
   '2026-06-30','2026-07-31','2026-08-15','2026-08-31','2026-03-20','completed',7,array['QA'],'Owner AA','{"fixture":"aa"}'),
  ('CCTB-CONC-SA/2026.01-PQ','CCTB-CONC-SA/2026.01-PQ','CCTB-CONC-SA','PQ',2026,'Hóa lý',5,
   '2026-06-30','2026-07-31','2026-08-15','2026-08-31','2026-03-20','completed',7,array['QA'],'Owner SA','{"fixture":"sa"}'),
  ('CCTB-CONC-LS/2026.01-PQ','CCTB-CONC-LS/2026.01-PQ','CCTB-CONC-LS','PQ',2026,'Hóa lý',5,
   '2026-06-30','2026-07-31','2026-08-15','2026-08-31','2026-03-20','completed',7,array['QA'],'Owner LS','{"fixture":"ls"}'),
  ('CCTB-CONC-LS/2026.BAD-X','CCTB-CONC-LS/2026.BAD-X','CCTB-CONC-LS','X',2026,'Hóa lý',5,
   null,null,null,null,null,'not_started',11,array['QA'],'Superset row','{"fixture":"superset"}');
insert into public.vmp_catalog_changes (
  id, object_kind, object_code, source_version, timeline_revision, old_data, new_data
)
values
  ('a1000000-0000-4000-8000-000000000001','Thiết bị','CCTB-CONC-AA',1,1,'{}','{"first_month":3}'),
  ('a1000000-0000-4000-8000-000000000002','Thiết bị','CCTB-CONC-SA',1,1,'{}','{"first_month":3}'),
  ('a1000000-0000-4000-8000-000000000003','Thiết bị','CCTB-CONC-LS',1,1,'{}','{"first_month":3}');

create function auth.catalog_test_lock_superset_pause()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.object_code='CCTB-CONC-LS'
     and old.timeline_applied_revision is distinct from new.timeline_applied_revision then
    perform pg_sleep(4);
  end if;
  return new;
end
$$;
create trigger catalog_test_lock_superset_pause
before update on public.vmp_source_objects
for each row execute function auth.catalog_test_lock_superset_pause();
commit;
\quit
\endif

begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create function pg_temp.assert_true(p_condition boolean, p_rule_id text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception using errcode = 'check_violation', message = p_rule_id;
  end if;
end
$$;

create function pg_temp.assert_json(p_actual jsonb, p_expected jsonb, p_rule_id text)
returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception using errcode = 'check_violation',
      message = format('%s expected=%s actual=%s', p_rule_id, p_expected, p_actual);
  end if;
end
$$;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('92000000-0000-4000-8000-000000000001','authenticated','authenticated','catalog-admin@example.test','x',now(),'{}','{}',now(),now()),
  ('92000000-0000-4000-8000-000000000002','authenticated','authenticated','catalog-qa-staff@example.test','x',now(),'{}','{}',now(),now()),
  ('92000000-0000-4000-8000-000000000003','authenticated','authenticated','catalog-inactive@example.test','x',now(),'{}','{}',now(),now()),
  ('92000000-0000-4000-8000-000000000004','authenticated','authenticated','catalog-qa-manager@example.test','x',now(),'{}','{}',now(),now());
insert into public.departments (id,name,short_name)
values ('CATALOG_TEST_QA','Catalog deadline test QA','CTQ'),
       ('QA','Quality Assurance fixture','QA');
insert into public.profiles (id,full_name,email,role,department,is_active)
values
  ('92000000-0000-4000-8000-000000000001','Catalog Admin','catalog-admin@example.test','admin','CATALOG_TEST_QA',true),
  ('92000000-0000-4000-8000-000000000002','Catalog QA staff','catalog-qa-staff@example.test','department_user','QA',true),
  ('92000000-0000-4000-8000-000000000003','Catalog inactive','catalog-inactive@example.test','qa_manager','QA',false),
  ('92000000-0000-4000-8000-000000000004','Catalog QA manager','catalog-qa-manager@example.test','qa_manager','QA',true);
update public.vmp_performers
set department = 'QA',
    access_class = case user_id
      when '92000000-0000-4000-8000-000000000002'::uuid then 'qa_progress_editor'
      else 'qa_manager' end
where user_id in (
  '92000000-0000-4000-8000-000000000002'::uuid,
  '92000000-0000-4000-8000-000000000003'::uuid,
  '92000000-0000-4000-8000-000000000004'::uuid
);

insert into public.vmp_source_objects (
  id, object_kind, object_code, object_name, department, validate_flag,
  frequency_months, report_class, workdays, first_month, year_ref,
  source_tab, source_row, version, timeline_revision, timeline_applied_revision
)
values (
  '93000000-0000-4000-8000-000000000001','Thiết bị','CCTB01','Catalog main','CATALOG_TEST_QA','y',
  12,'Hóa lý',5,null,2025,'test',101,4,3,2
);
insert into public.vmp_objects (code,name,classification,department,frequency_months)
values ('CCTB01','Catalog main','tb','CATALOG_TEST_QA',12);
insert into public.vmp_plan_items (
  id, validation_code, object_code, validation_type, year, report_class,
  effort_days, deadline_protocol, deadline_validation, deadline_report,
  deadline_vmp, actual_protocol_date, actual_validation_date,
  actual_report_date, actual_vmp_date, status_protocol, status_validation,
  status_report, status_vmp, owner_name, secondary_owner, is_active,
  item_state, version, departments, execution_departments, source_sheet_data,
  work_group
)
values (
  'CCTB01/2026.01-PQ','CCTB01/2026.01-PQ','CCTB01','PQ',2026,'Hóa lý',5,
  '2026-06-30','2026-07-31','2026-08-15','2026-08-31',
  null,'2026-03-20',null,null,'completed','completed','not_started','not_started',
  'Nguyễn Owner','Secondary owner',true,'active',7,array['CATALOG_TEST_QA'],
  array['CATALOG_TEST_QA'],'{"unrelated":"preserve"}','WG-KEEP'
);
insert into public.vmp_catalog_changes (
  id, object_kind, object_code, source_version, timeline_revision,
  old_data, new_data, status
)
values (
  '94000000-0000-4000-8000-000000000001','Thiết bị','CCTB01',4,3,
  '{}','{"first_month":3}','pending'
), (
  '94000000-0000-4000-8000-000000000011','Thiết bị','CCTB01',4,3,
  '{}','{}','applied'
), (
  '94000000-0000-4000-8000-000000000012','Thiết bị','CCTB01',4,3,
  '{}','{}','applied'
), (
  '94000000-0000-4000-8000-000000000013','Thiết bị','CCTB01',4,3,
  '{}','{}','superseded'
), (
  '94000000-0000-4000-8000-000000000014','Thiết bị','CCTB-GONE',1,1,
  '{}','{}','pending'
);
update public.vmp_catalog_changes
set apply_result = case id
  when '94000000-0000-4000-8000-000000000011'::uuid then '{"ok":true,"marker":"admin"}'::jsonb
  else '{"ok":true,"marker":"qa_manager"}'::jsonb end
where id in ('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000012');

select pg_temp.assert_true(
  public.vmp_business_role('92000000-0000-4000-8000-000000000001')='admin'
  and public.vmp_business_role('92000000-0000-4000-8000-000000000002')='qa_staff'
  and public.vmp_business_role('92000000-0000-4000-8000-000000000004')='qa_manager',
  'AUTH_FIXTURE_EXACT_BUSINESS_ROLES');

select set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);

-- RED must reach this real fixture call and fail only because V2 is absent.
select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2(
    '94000000-0000-4000-8000-000000000001', 'x', 3,
    '[{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":7}]', true
  ),
  '{
    "ok":false,"error_code":"MISSING_SOURCE_DATA",
    "error":"Không tính đủ deadline cho CCTB01/2026.01-PQ",
    "missing":[{"validation_code":"CCTB01/2026.01-PQ","fields":["Tháng thẩm định đầu tiên"]}]
  }',
  'MISSING_SOURCE_DATA_LITERAL'
);

-- Active-session denial and role denial precede every lookup/payload check.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','92000000-0000-4000-8000-000000000003','role','authenticated')::text, true);
select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2(null,null,null,'{}',null),
  '{"ok":false,"error":"Tài khoản không hoạt động","error_code":"ACCOUNT_DISABLED"}',
  'ACTIVE_SESSION_PRECEDENCE'
);
select pg_temp.assert_json(
  public.rpc_preview_catalog_change_v2(null),
  '{"ok":false,"error":"Tài khoản không hoạt động","error_code":"ACCOUNT_DISABLED"}',
  'PREVIEW_ACTIVE_SESSION_PRECEDENCE'
);
select set_config('request.jwt.claims',
  json_build_object('sub','92000000-0000-4000-8000-000000000002','role','authenticated')::text, true);
select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2(null,null,null,'{}',null),
  '{"ok":false,"error":"Chỉ Admin và Quản lý QA được cập nhật deadline của hạng mục đã có tiến độ","error_code":"FORBIDDEN"}',
  'FORBIDDEN_PRECEDENCE'
);
select pg_temp.assert_json(
  public.rpc_preview_catalog_change_v2(null),
  '{"ok":false,"error":"Chỉ Admin và Quản lý QA được cập nhật deadline của hạng mục đã có tiến độ","error_code":"FORBIDDEN"}',
  'PREVIEW_FORBIDDEN_PRECEDENCE'
);

-- Both authorized authenticated roles must cross both public boundaries.
reset role;
savepoint positive_authenticated_roles;
create or replace function public.rpc_preview_catalog_change(p_change_id uuid)
returns jsonb language sql stable security definer
set search_path=public,pg_temp
as $$ select '{"ok":true,"tao":[],"sua":[],"dung":[],"giu_nguyen":[]}'::jsonb $$;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','92000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
select pg_temp.assert_json(
  public.rpc_preview_catalog_change_v2('94000000-0000-4000-8000-000000000011'),
  '{"ok":true,"tao":[],"sua":[],"dung":[],"giu_nguyen":[],"deadline_overrides":[]}',
  'AUTHENTICATED_ADMIN_PREVIEW_SUCCESS_LITERAL');
select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000011',null,null,'{}',false),
  '{"ok":true,"marker":"admin","da_ap_truoc_do":true}',
  'AUTHENTICATED_ADMIN_APPLY_SUCCESS_LITERAL');
select set_config('request.jwt.claims',
  json_build_object('sub','92000000-0000-4000-8000-000000000004','role','authenticated')::text, true);
select pg_temp.assert_json(
  public.rpc_preview_catalog_change_v2('94000000-0000-4000-8000-000000000012'),
  '{"ok":true,"tao":[],"sua":[],"dung":[],"giu_nguyen":[],"deadline_overrides":[]}',
  'AUTHENTICATED_QA_MANAGER_PREVIEW_SUCCESS_LITERAL');
select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000012',null,null,'{}',false),
  '{"ok":true,"marker":"qa_manager","da_ap_truoc_do":true}',
  'AUTHENTICATED_QA_MANAGER_APPLY_SUCCESS_LITERAL');
rollback to positive_authenticated_roles;
reset role;
select set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);

select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000099','x',3,'[]',false),
  '{"ok":false,"error":"Không tìm thấy thay đổi này","error_code":"CHANGE_NOT_FOUND"}',
  'LOOKUP_PRECEDENCE'
);
select pg_temp.assert_json(
  public.rpc_preview_catalog_change_v2('94000000-0000-4000-8000-000000000099'),
  '{"ok":false,"error":"Không tìm thấy thay đổi này","error_code":"CHANGE_NOT_FOUND"}',
  'PREVIEW_CHANGE_NOT_FOUND_LITERAL'
);
select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000013',null,null,'{}',null),
  '{"ok":false,"error":"Thay đổi này đã bị một thay đổi mới hơn thay thế","error_code":"SUPERSEDED"}',
  'SUPERSEDED_PRECEDES_PAYLOAD_LITERAL'
);
select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',null,'[]',false),
  '{"ok":false,"error":"Thiếu phiên bản timeline đã xem trước","error_code":"EXPECTED_REVISION_REQUIRED"}',
  'EXPECTED_REVISION_PRECEDENCE'
);

-- Exact payload shape: array, object elements, exactly two keys, nonblank code,
-- integer version and no duplicates.
select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',3,'{}',false),
  '{"ok":false,"error":"Danh sách ghi đè deadline không hợp lệ","error_code":"INVALID_OVERRIDE_PAYLOAD","details":[{"index":null,"reason":"TOP_LEVEL_MUST_BE_ARRAY"}]}',
  'PAYLOAD_TOP_LEVEL_LITERAL'
);
select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',3,'[1]',false),
  '{"ok":false,"error":"Danh sách ghi đè deadline không hợp lệ","error_code":"INVALID_OVERRIDE_PAYLOAD","details":[{"index":0,"reason":"ITEM_MUST_BE_OBJECT"}]}',
  'PAYLOAD_ITEM_OBJECT_LITERAL');
select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',3,'[{"validation_code":"CCTB01/2026.01-PQ"}]',false),
  '{"ok":false,"error":"Danh sách ghi đè deadline không hợp lệ","error_code":"INVALID_OVERRIDE_PAYLOAD","details":[{"index":0,"reason":"EXACT_KEYS_REQUIRED"}]}',
  'PAYLOAD_MISSING_KEY_LITERAL');
select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',3,'[{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":7,"extra":1}]',false),
  '{"ok":false,"error":"Danh sách ghi đè deadline không hợp lệ","error_code":"INVALID_OVERRIDE_PAYLOAD","details":[{"index":0,"reason":"EXACT_KEYS_REQUIRED"}]}',
  'PAYLOAD_EXTRA_KEY_LITERAL');
select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',3,'[{"validation_code":"  ","expected_item_version":7}]',false),
  '{"ok":false,"error":"Danh sách ghi đè deadline không hợp lệ","error_code":"INVALID_OVERRIDE_PAYLOAD","details":[{"index":0,"reason":"VALIDATION_CODE_REQUIRED"}]}',
  'PAYLOAD_BLANK_CODE_LITERAL');
select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',3,'[{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":null}]',false),
  '{"ok":false,"error":"Danh sách ghi đè deadline không hợp lệ","error_code":"INVALID_OVERRIDE_PAYLOAD","details":[{"index":0,"reason":"INTEGER_VERSION_REQUIRED"}]}',
  'PAYLOAD_NULL_VERSION_LITERAL');
select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',3,'[{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":7.5}]',false),
  '{"ok":false,"error":"Danh sách ghi đè deadline không hợp lệ","error_code":"INVALID_OVERRIDE_PAYLOAD","details":[{"index":0,"reason":"INTEGER_VERSION_REQUIRED"}]}',
  'PAYLOAD_FRACTIONAL_VERSION_LITERAL');
select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',3,'[{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":2147483648}]',false),
  '{"ok":false,"error":"Danh sách ghi đè deadline không hợp lệ","error_code":"INVALID_OVERRIDE_PAYLOAD","details":[{"index":0,"reason":"INTEGER_VERSION_REQUIRED"}]}',
  'PAYLOAD_OVERFLOW_VERSION_LITERAL');
select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',3,'[{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":7},{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":7}]',false),
  '{"ok":false,"error":"Danh sách ghi đè deadline không hợp lệ","error_code":"INVALID_OVERRIDE_PAYLOAD","details":[{"index":null,"reason":"DUPLICATE_VALIDATION_CODE"}]}',
  'PAYLOAD_DUPLICATE_LITERAL');

select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001',' ',3,'[]',false),
  '{"ok":false,"error":"Phải nhập lý do trước khi áp vào timeline","error_code":"REASON_REQUIRED"}',
  'REASON_PRECEDENCE'
);
select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',3,'[{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":7}]',false),
  '{"ok":false,"error":"Cần xác nhận đặc biệt để áp deadline đã có tiến độ","error_code":"OVERRIDE_NOT_CONFIRMED"}',
  'CONFIRMATION_PRECEDENCE'
);
select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',99,'[{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":7}]',true),
  '{"ok":false,"error":"Timeline đã đổi — xem trước lại","error_code":"VERSION_CONFLICT","expected_timeline_revision":99,"current_timeline_revision":3}',
  'VERSION_CONFLICT_LITERAL'
);
select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000014','x',1,'[]',false),
  '{"ok":false,"error":"Đối tượng đã bị xoá khỏi danh mục","error_code":"OBJECT_NOT_FOUND"}',
  'OBJECT_NOT_FOUND_LITERAL'
);

update public.vmp_source_objects set first_month = 3
where object_kind = 'Thiết bị' and object_code = 'CCTB01';

do $preview$
declare
  v_preview jsonb := public.rpc_preview_catalog_change_v2('94000000-0000-4000-8000-000000000001');
  v_candidate jsonb;
begin
  select value into v_candidate
  from jsonb_array_elements(v_preview -> 'deadline_overrides')
  where value ->> 'validation_code' = 'CCTB01/2026.01-PQ';
  if v_candidate is null
     or v_candidate - 'progress' is distinct from jsonb_build_object(
       'validation_code','CCTB01/2026.01-PQ','item_version',7,
       'eligible',true,'blocker_code',null,'blocker_reason',null,'missing','[]'::jsonb,
       'deadline_protocol_cu','2026-06-30','deadline_protocol_moi','2026-01-18',
       'deadline_validation_cu','2026-07-31','deadline_validation_moi','2026-03-24',
       'deadline_report_cu','2026-08-15','deadline_report_moi','2026-03-26',
       'deadline_vmp_cu','2026-08-31','deadline_vmp_moi','2026-03-31'
     )
     or v_candidate -> 'progress' is distinct from '{
       "actual_protocol_date":null,"actual_validation_date":"2026-03-20",
       "actual_report_date":null,"actual_vmp_date":null,
       "status_protocol":"completed","status_validation":"completed",
       "status_report":"not_started","status_vmp":"not_started"
     }'::jsonb then
    raise exception using errcode = 'check_violation', message = format('PREVIEW_CANDIDATE_LITERAL %s',v_candidate);
  end if;
end
$preview$;

-- Anchored terminal parser must tolerate a hyphen in the object code.
insert into public.vmp_source_objects (
  id,object_kind,object_code,object_name,department,validate_flag,frequency_months,
  report_class,workdays,first_month,year_ref,source_tab,source_row,version,timeline_revision,timeline_applied_revision
) values ('93000000-0000-4000-8000-000000000002','Thiết bị','CCTB-HYPHEN','Hyphen','CATALOG_TEST_QA','y',12,'Hóa lý',5,3,2025,'test',102,1,1,0);
insert into public.vmp_objects (code,name,classification,department,frequency_months)
values ('CCTB-HYPHEN','Hyphen','tb','CATALOG_TEST_QA',12);
insert into public.vmp_plan_items (
  id,validation_code,object_code,validation_type,year,deadline_protocol,deadline_validation,
  deadline_report,deadline_vmp,actual_validation_date,status_validation,version
) values ('CCTB-HYPHEN/2026.01-PQ','CCTB-HYPHEN/2026.01-PQ','CCTB-HYPHEN','PQ',2026,
  '2026-06-30','2026-07-31','2026-08-15','2026-08-31','2026-03-20','completed',7);
insert into public.vmp_catalog_changes (id,object_kind,object_code,source_version,timeline_revision,old_data,new_data)
values ('94000000-0000-4000-8000-000000000002','Thiết bị','CCTB-HYPHEN',1,1,'{}','{}');
select pg_temp.assert_true(
  (public.rpc_preview_catalog_change_v2('94000000-0000-4000-8000-000000000002')
    #> '{deadline_overrides,0,eligible}') = 'true'::jsonb,
  'ANCHORED_HYPHEN_PARSER'
);

-- Invalid/missing candidates must remain typed JSON blockers, never PL/pgSQL
-- unassigned-record or integer-overflow exceptions.
insert into public.vmp_source_objects (
  id,object_kind,object_code,object_name,department,validate_flag,frequency_months,
  report_class,workdays,first_month,year_ref,source_tab,source_row,version,timeline_revision,timeline_applied_revision
) values ('93000000-0000-4000-8000-000000000020','Thiết bị','CCTB-EDGE','Edge paths','CATALOG_TEST_QA','y',12,'Hóa lý',5,3,2025,'test',120,1,1,0);
insert into public.vmp_objects (code,name,classification,department,frequency_months)
values ('CCTB-EDGE','Edge paths','tb','CATALOG_TEST_QA',12);
insert into public.vmp_plan_items (
  id,validation_code,object_code,validation_type,year,version,
  actual_validation_date,status_validation
) values
  ('CCTB-EDGE/2026.BAD-PQ','CCTB-EDGE/2026.BAD-PQ','CCTB-EDGE','PQ',2026,1,null,'not_started'),
  ('CCTB-EDGE/2026.999999999999-PQ','CCTB-EDGE/2026.999999999999-PQ','CCTB-EDGE','PQ',2026,1,null,'not_started');
insert into public.vmp_catalog_changes (id,object_kind,object_code,source_version,timeline_revision,old_data,new_data)
values ('94000000-0000-4000-8000-000000000020','Thiết bị','CCTB-EDGE',1,1,'{}','{}');
savepoint typed_candidate_edges;
create or replace function public.rpc_preview_catalog_change(p_change_id uuid)
returns jsonb language sql stable security definer
set search_path=public,pg_temp
as $stub$
  select '{
    "ok":true,"tao":[],"sua":[],"dung":[],
    "giu_nguyen":[
      {"validation_code":"CCTB-EDGE/2026.BAD-PQ"},
      {"validation_code":"CCTB-EDGE/2026.999999999999-PQ"},
      {"validation_code":"CCTB-EDGE/2026.02-PQ"}
    ]
  }'::jsonb
$stub$;
select pg_temp.assert_json(
  public.rpc_preview_catalog_change_v2('94000000-0000-4000-8000-000000000020')->'deadline_overrides',
  '[
    {
      "validation_code":"CCTB-EDGE/2026.BAD-PQ","item_version":1,
      "eligible":false,"blocker_code":"INVALID_ITEM_IDENTITY",
      "blocker_reason":"Mã hạng mục không khớp định danh năm/lần/loại","missing":[],
      "progress":{"actual_protocol_date":null,"actual_validation_date":null,"actual_report_date":null,"actual_vmp_date":null,
        "status_protocol":"not_started","status_validation":"not_started","status_report":"not_started","status_vmp":"not_started"},
      "deadline_protocol_cu":null,"deadline_protocol_moi":null,
      "deadline_validation_cu":null,"deadline_validation_moi":null,
      "deadline_report_cu":null,"deadline_report_moi":null,
      "deadline_vmp_cu":null,"deadline_vmp_moi":null
    },
    {
      "validation_code":"CCTB-EDGE/2026.999999999999-PQ","item_version":1,
      "eligible":false,"blocker_code":"INVALID_ITEM_IDENTITY",
      "blocker_reason":"Mã hạng mục không khớp định danh năm/lần/loại","missing":[],
      "progress":{"actual_protocol_date":null,"actual_validation_date":null,"actual_report_date":null,"actual_vmp_date":null,
        "status_protocol":"not_started","status_validation":"not_started","status_report":"not_started","status_vmp":"not_started"},
      "deadline_protocol_cu":null,"deadline_protocol_moi":null,
      "deadline_validation_cu":null,"deadline_validation_moi":null,
      "deadline_report_cu":null,"deadline_report_moi":null,
      "deadline_vmp_cu":null,"deadline_vmp_moi":null
    },
    {
      "validation_code":"CCTB-EDGE/2026.02-PQ","item_version":null,
      "eligible":false,"blocker_code":"ITEM_NOT_FOUND",
      "blocker_reason":"Hạng mục không còn tồn tại","missing":[],
      "progress":{"actual_protocol_date":null,"actual_validation_date":null,"actual_report_date":null,"actual_vmp_date":null,
        "status_protocol":null,"status_validation":null,"status_report":null,"status_vmp":null},
      "deadline_protocol_cu":null,"deadline_protocol_moi":null,
      "deadline_validation_cu":null,"deadline_validation_moi":null,
      "deadline_report_cu":null,"deadline_report_moi":null,
      "deadline_vmp_cu":null,"deadline_vmp_moi":null
    }
  ]',
  'TYPED_MALFORMED_OVERFLOW_DISAPPEARING_CANDIDATES_LITERAL');
rollback to typed_candidate_edges;

-- Current-row semantics: membership, Dừng flow, active/item-state and delta.
savepoint candidate_blockers;
update public.vmp_plan_items set object_code = 'CCTB-HYPHEN'
where validation_code = 'CCTB01/2026.01-PQ';
select pg_temp.assert_true(
  (public.rpc_preview_catalog_change_v2('94000000-0000-4000-8000-000000000001')
    #>> '{deadline_overrides,0,blocker_code}') = 'WRONG_MEMBERSHIP',
  'BLOCK_WRONG_MEMBERSHIP');
select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',3,
    '[{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":8}]',true),
  '{
    "ok":false,"error_code":"INVALID_OVERRIDE_ITEM",
    "error":"Mã ghi đè không hợp lệ: CCTB01/2026.01-PQ",
    "details":[{"validation_code":"CCTB01/2026.01-PQ","reason":"Hạng mục không còn thuộc đối tượng","blocker_code":"WRONG_MEMBERSHIP"}]
  }',
  'INVALID_OVERRIDE_BLOCKER_LITERAL');
rollback to candidate_blockers;

savepoint candidate_blockers;
update public.vmp_source_objects set validate_flag = 'n'
where object_kind='Thiết bị' and object_code='CCTB01';
select pg_temp.assert_true(
  (public.rpc_preview_catalog_change_v2('94000000-0000-4000-8000-000000000001')
    #>> '{deadline_overrides,0,blocker_code}') = 'STOP_FLOW',
  'BLOCK_STOP_FLOW');
rollback to candidate_blockers;

savepoint candidate_blockers;
update public.vmp_plan_items set is_active = false
where validation_code='CCTB01/2026.01-PQ';
select pg_temp.assert_true(
  (public.rpc_preview_catalog_change_v2('94000000-0000-4000-8000-000000000001')
    #>> '{deadline_overrides,0,blocker_code}') = 'ITEM_INACTIVE',
  'BLOCK_ITEM_INACTIVE');
rollback to candidate_blockers;

savepoint candidate_blockers;
update public.vmp_plan_items set item_state = 'cancelled'
where validation_code='CCTB01/2026.01-PQ';
select pg_temp.assert_true(
  (public.rpc_preview_catalog_change_v2('94000000-0000-4000-8000-000000000001')
    #>> '{deadline_overrides,0,blocker_code}') = 'ITEM_STATE_INACTIVE',
  'BLOCK_ITEM_STATE');
rollback to candidate_blockers;

savepoint candidate_blockers;
update public.vmp_plan_items set deadline_protocol='2026-01-18',deadline_validation='2026-03-24',
  deadline_report='2026-03-26',deadline_vmp='2026-03-31'
where validation_code='CCTB01/2026.01-PQ';
select pg_temp.assert_true(
  (public.rpc_preview_catalog_change_v2('94000000-0000-4000-8000-000000000001')
    #>> '{deadline_overrides,0,blocker_code}') = 'NO_ACTIONABLE_CHANGE',
  'BLOCK_NO_DELTA');
rollback to candidate_blockers;

-- A historically non-versioning writer now increments exactly once; stale
-- selection reports only revisions and tells the caller to preview again.
savepoint stale_writer;
do $stale$
declare
  v_before integer;
  v_after integer;
  v_result jsonb;
begin
  select version into v_before from public.vmp_plan_items where validation_code='CCTB01/2026.01-PQ';
  v_result := public.rpc_apply_sheet_sync(
    'update','CCTB01/2026.01-PQ','{"owner_name":"Writer changed owner"}'::jsonb);
  select version into v_after from public.vmp_plan_items where validation_code='CCTB01/2026.01-PQ';
  if coalesce((v_result->>'ok')::boolean,false) is not true or v_after <> v_before + 1 then
    raise exception using errcode='check_violation',
      message=format('UNIVERSAL_ROW_REVISION_WRITER before=%s after=%s result=%s',v_before,v_after,v_result);
  end if;
  v_result := public.rpc_apply_catalog_change_v2(
    '94000000-0000-4000-8000-000000000001','x',3,
    '[{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":7}]',true);
  if v_result is distinct from '{
    "ok":false,"error_code":"ITEM_STATE_CHANGED",
    "error":"Hạng mục CCTB01/2026.01-PQ đã đổi sau khi xem trước; hãy xem trước lại",
    "validation_code":"CCTB01/2026.01-PQ","expected_item_version":7,
    "current_item_version":8,"requires_fresh_preview":true
  }'::jsonb then
    raise exception using errcode='check_violation',message=format('ITEM_STATE_CHANGED_LITERAL %s',v_result);
  end if;
end
$stale$;
rollback to stale_writer;

select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',3,
    '[{"validation_code":"CCTB99/2026.01-PQ","expected_item_version":7}]',true),
  '{"ok":false,"error_code":"INVALID_OVERRIDE_ITEM","error":"Mã ghi đè không hợp lệ: CCTB99/2026.01-PQ","details":["CCTB99/2026.01-PQ"]}',
  'INVALID_OVERRIDE_MISSING_ITEM_LITERAL');

-- Valid+invalid is rejected before mutation and leaves the entire batch intact.
do $batch$
declare
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
begin
  select jsonb_build_object('change',to_jsonb(ch),'source',to_jsonb(so),'item',to_jsonb(pi))
    into v_before
  from public.vmp_catalog_changes ch
  join public.vmp_source_objects so on so.object_kind=ch.object_kind and so.object_code=ch.object_code
  join public.vmp_plan_items pi on pi.validation_code='CCTB01/2026.01-PQ'
  where ch.id='94000000-0000-4000-8000-000000000001';
  v_result := public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',3,
    '[{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":7},{"validation_code":"CCTB99/2026.01-PQ","expected_item_version":7}]',true);
  perform pg_temp.assert_json(v_result,
    '{"ok":false,"error_code":"INVALID_OVERRIDE_ITEM","error":"Mã ghi đè không hợp lệ: CCTB99/2026.01-PQ","details":["CCTB99/2026.01-PQ"]}',
    'BATCH_INVALID_OVERRIDE_LITERAL');
  select jsonb_build_object('change',to_jsonb(ch),'source',to_jsonb(so),'item',to_jsonb(pi))
    into v_after
  from public.vmp_catalog_changes ch
  join public.vmp_source_objects so on so.object_kind=ch.object_kind and so.object_code=ch.object_code
  join public.vmp_plan_items pi on pi.validation_code='CCTB01/2026.01-PQ'
  where ch.id='94000000-0000-4000-8000-000000000001';
  if v_after is distinct from v_before then raise exception using errcode='check_violation',message='BATCH_REJECTION_ATOMIC'; end if;
end
$batch$;

-- No normal action and no override is not an apply operation.
insert into public.vmp_source_objects (
  id,object_kind,object_code,object_name,department,validate_flag,frequency_months,
  report_class,workdays,first_month,year_ref,source_tab,source_row,version,timeline_revision,timeline_applied_revision
) values ('93000000-0000-4000-8000-000000000003','Quy trình','CCTB-NOOP','Noop','CATALOG_TEST_QA','y',12,'Hóa lý',5,3,2025,'test',103,1,1,0);
insert into public.vmp_objects (code,name,classification,department,frequency_months)
values ('CCTB-NOOP','Noop','qt','CATALOG_TEST_QA',12);
insert into public.vmp_plan_items (id,validation_code,object_code,validation_type,year,report_class,effort_days,
 deadline_protocol,deadline_validation,deadline_report,deadline_vmp,version)
values ('CCTB-NOOP/2026.01-PV','CCTB-NOOP/2026.01-PV','CCTB-NOOP','PV',2026,'Hóa lý',5,
 '2026-01-18','2026-03-24','2026-03-26','2026-03-31',2);
insert into public.vmp_catalog_changes (id,object_kind,object_code,source_version,timeline_revision,old_data,new_data)
values ('94000000-0000-4000-8000-000000000003','Quy trình','CCTB-NOOP',1,1,'{}','{}');
select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000003','x',1,'[]',false),
  '{"ok":false,"error_code":"NO_ACTIONABLE_CHANGE","error":"Không có thay đổi để áp"}',
  'NO_ACTIONABLE_CHANGE_LITERAL');

-- Successful mixed normal-create + progressed override preserves every
-- protected field and increments the selected row revision exactly once.
do $success$
declare
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_retry jsonb;
  v_audit_before integer;
  v_audit_after integer;
begin
  select to_jsonb(pi), (select count(*) from public.audit_logs where validation_code=pi.validation_code)
    into v_before,v_audit_before
  from public.vmp_plan_items pi where validation_code='CCTB01/2026.01-PQ';
  v_result := public.rpc_apply_catalog_change_v2(
    '94000000-0000-4000-8000-000000000001','Điều chỉnh theo nguồn mới',3,
    '[{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":7}]',true);
  perform pg_temp.assert_json(v_result, '{
    "ok":true,"change_id":"94000000-0000-4000-8000-000000000001","object_code":"CCTB01",
    "so_tao":1,"so_sua":0,"so_dung":0,"so_giu_nguyen":1,"so_deadline_override":1,
    "timeline_revision":3,"actor_id":null,"effective_role":"service_role",
    "reason":"Điều chỉnh theo nguồn mới","da_ap_truoc_do":false,
    "deadline_overrides":[{
      "validation_code":"CCTB01/2026.01-PQ","item_version_cu":7,"item_version_moi":8,
      "deadline_protocol_cu":"2026-06-30","deadline_protocol_moi":"2026-01-18",
      "deadline_validation_cu":"2026-07-31","deadline_validation_moi":"2026-03-24",
      "deadline_report_cu":"2026-08-15","deadline_report_moi":"2026-03-26",
      "deadline_vmp_cu":"2026-08-31","deadline_vmp_moi":"2026-03-31",
      "actual_dates_unchanged":true,"statuses_unchanged":true
    }]
  }', 'APPLY_SUCCESS_FULL_LITERAL');
  select to_jsonb(pi), (select count(*) from public.audit_logs where validation_code=pi.validation_code)
    into v_after,v_audit_after
  from public.vmp_plan_items pi where validation_code='CCTB01/2026.01-PQ';
  if (v_after->>'version')::integer <> 8
     or v_after->>'deadline_protocol' <> '2026-01-18'
     or v_after->>'deadline_validation' <> '2026-03-24'
     or v_after->>'deadline_report' <> '2026-03-26'
     or v_after->>'deadline_vmp' <> '2026-03-31'
     or (v_after - array['deadline_protocol','deadline_validation','deadline_report','deadline_vmp','computed_status','version','updated_at','updated_by'])
        is distinct from
        (v_before - array['deadline_protocol','deadline_validation','deadline_report','deadline_vmp','computed_status','version','updated_at','updated_by'])
     or v_audit_after <> v_audit_before + 1 then
    raise exception using errcode='check_violation',message='APPLY_PROTECTED_SNAPSHOT';
  end if;
  if not exists (select 1 from public.audit_logs where validation_code='CCTB01/2026.01-PQ'
      and changed_fields @> array['deadline_protocol','deadline_validation','deadline_report','deadline_vmp']
      and change_reason='Điều chỉnh theo nguồn mới'
      and source='catalog_progressed_deadline_override') then
    raise exception using errcode='check_violation',message='APPLY_AUDIT_CONTEXT';
  end if;
  v_retry := public.rpc_apply_catalog_change_v2(
    '94000000-0000-4000-8000-000000000001',null,null,'{}',false);
  perform pg_temp.assert_json(v_retry, '{
    "ok":true,"change_id":"94000000-0000-4000-8000-000000000001","object_code":"CCTB01",
    "so_tao":1,"so_sua":0,"so_dung":0,"so_giu_nguyen":1,"so_deadline_override":1,
    "timeline_revision":3,"actor_id":null,"effective_role":"service_role",
    "reason":"Điều chỉnh theo nguồn mới","da_ap_truoc_do":true,
    "deadline_overrides":[{
      "validation_code":"CCTB01/2026.01-PQ","item_version_cu":7,"item_version_moi":8,
      "deadline_protocol_cu":"2026-06-30","deadline_protocol_moi":"2026-01-18",
      "deadline_validation_cu":"2026-07-31","deadline_validation_moi":"2026-03-24",
      "deadline_report_cu":"2026-08-15","deadline_report_moi":"2026-03-26",
      "deadline_vmp_cu":"2026-08-31","deadline_vmp_moi":"2026-03-31",
      "actual_dates_unchanged":true,"statuses_unchanged":true
    }]
  }', 'IDEMPOTENT_RETRY_FULL_STORED_RESULT_LITERAL');
  if (select version from public.vmp_plan_items where validation_code='CCTB01/2026.01-PQ') <> 8
     or (select count(*) from public.audit_logs where validation_code='CCTB01/2026.01-PQ') <> v_audit_after then
    raise exception using errcode='check_violation',message=format('IDEMPOTENT_RETRY %s',v_retry);
  end if;
end
$success$;

-- Fault after V1 normal mutation: a trigger skips the selected override.
insert into public.vmp_source_objects (
  id,object_kind,object_code,object_name,department,validate_flag,frequency_months,
  report_class,workdays,first_month,year_ref,source_tab,source_row,version,timeline_revision,timeline_applied_revision
) values ('93000000-0000-4000-8000-000000000004','Thiết bị','CCTB03','Fault','CATALOG_TEST_QA','y',12,'Hóa lý',5,3,2025,'test',104,1,1,0);
insert into public.vmp_objects (code,name,classification,department,frequency_months)
values ('CCTB03','Fault','tb','CATALOG_TEST_QA',12);
insert into public.vmp_plan_items (id,validation_code,object_code,validation_type,year,report_class,effort_days,
 deadline_protocol,deadline_validation,deadline_report,deadline_vmp,actual_validation_date,status_validation,version,source_sheet_data)
values ('CCTB03/2026.01-PQ','CCTB03/2026.01-PQ','CCTB03','PQ',2026,'Hóa lý',5,
 '2026-06-30','2026-07-31','2026-08-15','2026-08-31','2026-03-20','completed',7,'{"fault":"preserve"}');
insert into public.vmp_catalog_changes (id,object_kind,object_code,source_version,timeline_revision,old_data,new_data)
values ('94000000-0000-4000-8000-000000000004','Thiết bị','CCTB03',1,1,'{}','{}');

-- V1 post-state verification must reject unexpected create fields, inventory,
-- normal-update/stop fields and protected source deltas, with full rollback.
insert into public.vmp_source_objects (
  id,object_kind,object_code,object_name,department,validate_flag,frequency_months,
  report_class,workdays,first_month,year_ref,source_tab,source_row,version,timeline_revision,timeline_applied_revision
) values
  ('93000000-0000-4000-8000-000000000005','Thiết bị','CCTB04','Update fault','CATALOG_TEST_QA','y',12,'Hóa lý',5,3,2025,'test',105,1,1,0),
  ('93000000-0000-4000-8000-000000000006','Thiết bị','CCTB05','Stop fault','CATALOG_TEST_QA','n',12,'Hóa lý',5,3,2025,'test',106,1,1,0);
insert into public.vmp_objects (code,name,classification,department,frequency_months)
values ('CCTB04','Update fault','tb','CATALOG_TEST_QA',12),
       ('CCTB05','Stop fault','tb','CATALOG_TEST_QA',12);
insert into public.vmp_plan_items (
  id,validation_code,object_code,validation_type,year,report_class,effort_days,
  deadline_protocol,deadline_validation,deadline_report,deadline_vmp,version,owner_name
) values
  ('CCTB04/2026.01-PQ','CCTB04/2026.01-PQ','CCTB04','PQ',2026,'Old class',2,
   '2026-10-01','2026-10-02','2026-10-03','2026-10-04',3,'Owner update'),
  ('CCTB04/2026.01-OQ','CCTB04/2026.01-OQ','CCTB04','OQ',2026,'Old class',2,
   '2026-10-01','2026-10-02','2026-10-03','2026-10-04',3,'Owner update OQ'),
  ('CCTB05/2026.01-PQ','CCTB05/2026.01-PQ','CCTB05','PQ',2026,'Hóa lý',5,
   '2026-10-01','2026-10-02','2026-10-03','2026-10-04',3,'Owner stop');
insert into public.vmp_catalog_changes (id,object_kind,object_code,source_version,timeline_revision,old_data,new_data)
values
  ('94000000-0000-4000-8000-000000000005','Thiết bị','CCTB04',1,1,'{}','{}'),
  ('94000000-0000-4000-8000-000000000006','Thiết bị','CCTB05',1,1,'{}','{}');

create function pg_temp.inject_v1_item_poststate_fault()
returns trigger language plpgsql as $$
declare v_mode text:=current_setting('test.catalog_v1_fault',true);
begin
  if tg_op='INSERT' and new.validation_code='CCTB03/2026.01-OQ' and v_mode='create' then
    new.owner_name:='UNEXPECTED_CREATE_FIELD';
  elsif tg_op='UPDATE' and new.validation_code='CCTB04/2026.01-PQ' and v_mode='update' then
    new.owner_name:='UNEXPECTED_UPDATE_FIELD';
  elsif tg_op='UPDATE' and new.validation_code='CCTB05/2026.01-PQ' and v_mode='stop' then
    new.owner_name:='UNEXPECTED_STOP_FIELD';
  end if;
  return new;
end
$$;
create trigger a_catalog_v1_item_poststate_fault
before insert or update on public.vmp_plan_items
for each row execute function pg_temp.inject_v1_item_poststate_fault();

create function pg_temp.inject_v1_inventory_fault()
returns trigger language plpgsql as $$
begin
  if current_setting('test.catalog_v1_fault',true)='inventory'
     and new.validation_code='CCTB03/2026.01-OQ' then
    insert into public.vmp_plan_items (id,validation_code,object_code,validation_type,year,version)
    values ('CCTB03/2026.99-PQ','CCTB03/2026.99-PQ','CCTB03','PQ',2026,0);
  end if;
  return new;
end
$$;
create trigger z_catalog_v1_inventory_fault
after insert on public.vmp_plan_items
for each row execute function pg_temp.inject_v1_inventory_fault();

create function pg_temp.inject_v1_source_poststate_fault()
returns trigger language plpgsql as $$
begin
  if current_setting('test.catalog_v1_fault',true)='source'
     and new.object_code='CCTB03'
     and old.timeline_applied_revision is distinct from new.timeline_applied_revision then
    new.note:='UNEXPECTED_SOURCE_FIELD';
  end if;
  return new;
end
$$;
create trigger a_catalog_v1_source_poststate_fault
before update on public.vmp_source_objects
for each row execute function pg_temp.inject_v1_source_poststate_fault();

do $v1_poststate_faults$
declare
  v_case record;
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
begin
  for v_case in select * from (values
    ('create','94000000-0000-4000-8000-000000000004'::uuid,'CCTB03'),
    ('inventory','94000000-0000-4000-8000-000000000004'::uuid,'CCTB03'),
    ('source','94000000-0000-4000-8000-000000000004'::uuid,'CCTB03'),
    ('update','94000000-0000-4000-8000-000000000005'::uuid,'CCTB04'),
    ('stop','94000000-0000-4000-8000-000000000006'::uuid,'CCTB05')
  ) t(mode,change_id,object_code) loop
    select jsonb_build_object(
      'change',(select to_jsonb(ch) from public.vmp_catalog_changes ch where id=v_case.change_id),
      'source',(select to_jsonb(so) from public.vmp_source_objects so where object_code=v_case.object_code),
      'items',(select coalesce(jsonb_agg(to_jsonb(pi) order by validation_code),'[]')
               from public.vmp_plan_items pi where object_code=v_case.object_code),
      'audits',(select count(*) from public.audit_logs where validation_code like v_case.object_code||'/%')
    ) into v_before;
    perform set_config('test.catalog_v1_fault',v_case.mode,true);
    v_result:=public.rpc_apply_catalog_change_v2(v_case.change_id,'exact V1 poststate',1,'[]',false);
    perform pg_temp.assert_json(v_result,
      '{"ok":false,"error_code":"WRITE_MISMATCH","error":"Không thể ghi nguyên tử; toàn bộ thay đổi đã được hoàn tác"}',
      'V1_'||upper(v_case.mode)||'_POSTSTATE_LITERAL');
    perform set_config('test.catalog_v1_fault','',true);
    select jsonb_build_object(
      'change',(select to_jsonb(ch) from public.vmp_catalog_changes ch where id=v_case.change_id),
      'source',(select to_jsonb(so) from public.vmp_source_objects so where object_code=v_case.object_code),
      'items',(select coalesce(jsonb_agg(to_jsonb(pi) order by validation_code),'[]')
               from public.vmp_plan_items pi where object_code=v_case.object_code),
      'audits',(select count(*) from public.audit_logs where validation_code like v_case.object_code||'/%')
    ) into v_after;
    if v_after is distinct from v_before then
      raise exception using errcode='check_violation',message='V1_'||upper(v_case.mode)||'_ROLLBACK';
    end if;
  end loop;
end
$v1_poststate_faults$;
\echo 'PASS FAULT_INJECTION exact V1 create update stop inventory source'

create function pg_temp.skip_fault_override() returns trigger language plpgsql as $$
begin
  if new.validation_code='CCTB03/2026.01-PQ'
     and old.deadline_vmp is distinct from new.deadline_vmp then return null; end if;
  return new;
end
$$;
create trigger z_catalog_fault before update on public.vmp_plan_items
for each row execute function pg_temp.skip_fault_override();
do $fault$
declare
  v_change jsonb;
  v_source jsonb;
  v_item jsonb;
  v_audits integer;
  v_result jsonb;
begin
  select to_jsonb(ch) into v_change from public.vmp_catalog_changes ch where id='94000000-0000-4000-8000-000000000004';
  select to_jsonb(so) into v_source from public.vmp_source_objects so where object_code='CCTB03';
  select to_jsonb(pi) into v_item from public.vmp_plan_items pi where validation_code='CCTB03/2026.01-PQ';
  select count(*) into v_audits from public.audit_logs where validation_code like 'CCTB03/%';
  v_result := public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000004','fault injection',1,
    '[{"validation_code":"CCTB03/2026.01-PQ","expected_item_version":7}]',true);
  perform pg_temp.assert_json(v_result,
    '{"ok":false,"error_code":"WRITE_MISMATCH","error":"Không thể ghi nguyên tử; toàn bộ thay đổi đã được hoàn tác"}',
    'FAULT_WRITE_MISMATCH_LITERAL');
  if (select to_jsonb(ch) from public.vmp_catalog_changes ch where id='94000000-0000-4000-8000-000000000004') is distinct from v_change
     or (select to_jsonb(so) from public.vmp_source_objects so where object_code='CCTB03') is distinct from v_source
     or (select to_jsonb(pi) from public.vmp_plan_items pi where validation_code='CCTB03/2026.01-PQ') is distinct from v_item
     or exists (select 1 from public.vmp_plan_items where validation_code='CCTB03/2026.01-OQ')
     or (select count(*) from public.audit_logs where validation_code like 'CCTB03/%') <> v_audits then
    raise exception using errcode='check_violation',message='FAULT_INJECTION_ROLLBACK';
  end if;
end
$fault$;

\echo 'PASS BUSINESS progressed-deadline override'
\echo 'PASS FAULT_INJECTION post-mutation rollback'
rollback;

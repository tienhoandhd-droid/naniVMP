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
  ('a2000000-0000-4000-8000-000000000002','Thiết bị','CCTB-CONC-SA','Concurrency SA',null,'y',12,'Hóa lý',5,3,2025,'test',202,1,1,0);
insert into public.vmp_objects (code,name,classification,frequency_months)
values ('CCTB-CONC-AA','Concurrency AA','tb',12),
       ('CCTB-CONC-SA','Concurrency SA','tb',12);
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
   '2026-06-30','2026-07-31','2026-08-15','2026-08-31','2026-03-20','completed',7,array['QA'],'Owner SA','{"fixture":"sa"}');
insert into public.vmp_catalog_changes (
  id, object_kind, object_code, source_version, timeline_revision, old_data, new_data
)
values
  ('a1000000-0000-4000-8000-000000000001','Thiết bị','CCTB-CONC-AA',1,1,'{}','{"first_month":3}'),
  ('a1000000-0000-4000-8000-000000000002','Thiết bị','CCTB-CONC-SA',1,1,'{}','{"first_month":3}');
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

create function pg_temp.assert_json_error(p_payload jsonb, p_error_code text)
returns void language plpgsql as $$
begin
  if p_payload ->> 'error_code' is distinct from p_error_code
     or coalesce((p_payload ->> 'ok')::boolean, true) is not false then
    raise exception using errcode = 'check_violation',
      message = format('EXPECTED_ERROR_%s_GOT_%s', p_error_code, p_payload);
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
  ('92000000-0000-4000-8000-000000000003','authenticated','authenticated','catalog-inactive@example.test','x',now(),'{}','{}',now(),now());
insert into public.departments (id,name,short_name)
values ('CATALOG_TEST_QA','Catalog deadline test QA','CTQ'),
       ('QA','Quality Assurance fixture','QA');
insert into public.profiles (id,full_name,email,role,department,is_active)
values
  ('92000000-0000-4000-8000-000000000001','Catalog Admin','catalog-admin@example.test','admin','CATALOG_TEST_QA',true),
  ('92000000-0000-4000-8000-000000000002','Catalog QA staff','catalog-qa-staff@example.test','department_user','QA',true),
  ('92000000-0000-4000-8000-000000000003','Catalog inactive','catalog-inactive@example.test','qa_manager','QA',false);
update public.vmp_performers
set department = 'QA',
    access_class = case user_id
      when '92000000-0000-4000-8000-000000000002'::uuid then 'qa_progress_editor'
      else 'qa_manager' end
where user_id in (
  '92000000-0000-4000-8000-000000000002'::uuid,
  '92000000-0000-4000-8000-000000000003'::uuid
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
);

select set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);

-- RED must reach this real fixture call and fail only because V2 is absent.
select pg_temp.assert_json_error(
  public.rpc_apply_catalog_change_v2(
    '94000000-0000-4000-8000-000000000001', 'x', 3,
    '[{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":7}]', true
  ),
  'MISSING_SOURCE_DATA'
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
reset role;
select set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);

select pg_temp.assert_json(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000099','x',3,'[]',false),
  '{"ok":false,"error":"Không tìm thấy thay đổi này","error_code":"CHANGE_NOT_FOUND"}',
  'LOOKUP_PRECEDENCE'
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
select pg_temp.assert_json_error(public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',3,'[1]',false),'INVALID_OVERRIDE_PAYLOAD');
select pg_temp.assert_json_error(public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',3,'[{"validation_code":"CCTB01/2026.01-PQ"}]',false),'INVALID_OVERRIDE_PAYLOAD');
select pg_temp.assert_json_error(public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',3,'[{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":7,"extra":1}]',false),'INVALID_OVERRIDE_PAYLOAD');
select pg_temp.assert_json_error(public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',3,'[{"validation_code":"  ","expected_item_version":7}]',false),'INVALID_OVERRIDE_PAYLOAD');
select pg_temp.assert_json_error(public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',3,'[{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":null}]',false),'INVALID_OVERRIDE_PAYLOAD');
select pg_temp.assert_json_error(public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',3,'[{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":7.5}]',false),'INVALID_OVERRIDE_PAYLOAD');
select pg_temp.assert_json_error(public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',3,'[{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":7},{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":7}]',false),'INVALID_OVERRIDE_PAYLOAD');

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
select pg_temp.assert_json_error(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',99,'[{"validation_code":"CCTB01/2026.01-PQ","expected_item_version":7}]',true),
  'VERSION_CONFLICT'
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

-- Current-row semantics: membership, Dừng flow, active/item-state and delta.
savepoint candidate_blockers;
update public.vmp_plan_items set object_code = 'CCTB-HYPHEN'
where validation_code = 'CCTB01/2026.01-PQ';
select pg_temp.assert_true(
  (public.rpc_preview_catalog_change_v2('94000000-0000-4000-8000-000000000001')
    #>> '{deadline_overrides,0,blocker_code}') = 'WRONG_MEMBERSHIP',
  'BLOCK_WRONG_MEMBERSHIP');
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

select pg_temp.assert_json_error(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000001','x',3,
    '[{"validation_code":"CCTB99/2026.01-PQ","expected_item_version":7}]',true),
  'INVALID_OVERRIDE_ITEM');

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
  perform pg_temp.assert_json_error(v_result,'INVALID_OVERRIDE_ITEM');
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
select pg_temp.assert_json_error(
  public.rpc_apply_catalog_change_v2('94000000-0000-4000-8000-000000000003','x',1,'[]',false),
  'NO_ACTIONABLE_CHANGE');

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
  if coalesce((v_result->>'ok')::boolean,false) is not true
     or v_result->>'da_ap_truoc_do' <> 'false'
     or v_result->>'so_tao' <> '1'
     or v_result->>'so_deadline_override' <> '1' then
    raise exception using errcode='check_violation',message=format('APPLY_SUCCESS_PAYLOAD %s',v_result);
  end if;
  if v_result->>'effective_role'<>'service_role'
     or v_result->>'reason'<>'Điều chỉnh theo nguồn mới'
     or v_result->'actor_id'<>'null'::jsonb
     or v_result#>>'{deadline_overrides,0,deadline_protocol_cu}'<>'2026-06-30'
     or v_result#>>'{deadline_overrides,0,deadline_protocol_moi}'<>'2026-01-18'
     or v_result#>>'{deadline_overrides,0,deadline_validation_cu}'<>'2026-07-31'
     or v_result#>>'{deadline_overrides,0,deadline_validation_moi}'<>'2026-03-24'
     or v_result#>>'{deadline_overrides,0,deadline_report_cu}'<>'2026-08-15'
     or v_result#>>'{deadline_overrides,0,deadline_report_moi}'<>'2026-03-26'
     or v_result#>>'{deadline_overrides,0,deadline_vmp_cu}'<>'2026-08-31'
     or v_result#>>'{deadline_overrides,0,deadline_vmp_moi}'<>'2026-03-31'
     or v_result#>'{deadline_overrides,0,actual_dates_unchanged}'<>'true'::jsonb
     or v_result#>'{deadline_overrides,0,statuses_unchanged}'<>'true'::jsonb then
    raise exception using errcode='check_violation',message=format('APPLY_RESULT_AUDIT_PAYLOAD %s',v_result);
  end if;
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
  if coalesce((v_retry->>'ok')::boolean,false) is not true
     or v_retry->>'da_ap_truoc_do' <> 'true'
     or (select version from public.vmp_plan_items where validation_code='CCTB01/2026.01-PQ') <> 8
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
  perform pg_temp.assert_json_error(v_result,'WRITE_MISMATCH');
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

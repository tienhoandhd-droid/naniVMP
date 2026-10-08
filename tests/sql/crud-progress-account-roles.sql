\set ON_ERROR_STOP on
-- Self-contained synthetic principals; the entire test rolls back.
-- All business writes below execute as authenticated; privileged observers only read.
begin;
set local statement_timeout='60s';
set local lock_timeout='4s';
insert into public.departments(id,name,short_name) values('QA','CRUD test QA','QA'),('CRUD_WS','CRUD test workshop','CRUD') on conflict do nothing;
insert into public.vmp_email_cho_phep(email,ghi_chu) select 'crud-progress-'||r||'@example.test','Synthetic CRUD test only' from unnest(array['admin','qa_manager','qa_staff','workshop_manager','workshop_staff','inactive']) r;
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('a8400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','crud-progress-'||r||'@example.test','not-used',now(),'{}','{}',now(),now()
from unnest(array['admin','qa_manager','qa_staff','workshop_manager','workshop_staff','inactive']) with ordinality x(r,n);
insert into public.profiles(id,full_name,email,role,department,is_active)
select ('a8400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'CRUD Browser '||r,'crud-progress-'||r||'@example.test',
(case when r in('admin','qa_manager') then r else 'department_user' end)::public.user_role,
case when r in('workshop_manager','workshop_staff') then 'CRUD_WS' else 'QA' end,r<>'inactive'
from unnest(array['admin','qa_manager','qa_staff','workshop_manager','workshop_staff','inactive']) with ordinality x(r,n)
on conflict(id)do update set full_name=excluded.full_name,email=excluded.email,role=excluded.role,department=excluded.department,is_active=excluded.is_active;
update public.vmp_performers set access_class=case right(user_id::text,1) when '1'then'view_only'when'2'then'qa_manager'when'3'then'qa_progress_editor'when'4'then'equipment_manager'when'5'then'workshop_staff'else'qa_progress_editor'end,
department=case right(user_id::text,1)when'4'then'CRUD_WS'when'5'then'CRUD_WS'else'QA'end,
is_active=right(user_id::text,1)<>'6'
where user_id::text like 'a8400000-%';
do $$declare n int;r text;expected text[]:=array['admin','qa_manager','qa_staff','workshop_manager','workshop_staff'];begin
for n in 1..5 loop r:=public.vmp_business_role(('a8400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid);assert r=expected[n], 'Browser fixture role mismatch';end loop;
end$$;

create temporary table checks(id text primary key,passed boolean);
grant insert,select on checks to authenticated;
create function pg_temp.check_result(ok boolean,id text) returns void language plpgsql as $$begin
 insert into checks values(id,coalesce(ok,false));raise notice '% %',case when coalesce(ok,false)then'PASS'else'FAIL'end,id;
end$$;
create function pg_temp.actor(n integer) returns void language plpgsql as $$begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub','a8400000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true);
end$$;
create function pg_temp.item() returns jsonb language sql security definer set search_path='' as $$select to_jsonb(i) from public.vmp_plan_items i where validation_code='CRUD-ROLE-PQ/2026.01-PQ'$$;
create function pg_temp.person(n integer) returns uuid language sql security definer set search_path='' as $$select id from public.vmp_performers where user_id=('a8400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.profile(n integer) returns jsonb language sql security definer set search_path='' as $$select to_jsonb(p) from public.profiles p where id=('a8400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.audit_rows() returns setof public.audit_logs language sql security definer set search_path='' as $$select * from public.audit_logs where user_id::text like 'a8400000-%'$$;
create function pg_temp.allowed_email(e text) returns jsonb language sql security definer set search_path='' as $$select to_jsonb(x)from public.vmp_email_cho_phep x where email=e$$;
create function pg_temp.effects() returns text language sql security definer set search_path='' as $$
 select md5(jsonb_build_array((select jsonb_agg(to_jsonb(p)order by id)from public.profiles p where id::text like'a8400000-%'),(select jsonb_agg(to_jsonb(p)order by id)from public.vmp_performers p where user_id::text like'a8400000-%'),(select jsonb_agg(to_jsonb(a)order by id)from public.audit_logs a where user_id::text like'a8400000-%'),(select jsonb_agg(to_jsonb(i)order by id)from public.vmp_plan_items i where object_code='CRUD-ROLE-PQ'),(select jsonb_agg(to_jsonb(e)order by email)from public.vmp_email_cho_phep e),(select jsonb_agg(to_jsonb(c)order by key)from public.system_config c))::text)
$$;
insert into public.vmp_objects(code,name,classification,department,area,line)values('CRUD-ROLE-PQ','Synthetic CRUD PQ','tb','CRUD_WS','CRUD_AREA','CRUD_LINE');
insert into public.vmp_source_objects(object_kind,object_code,object_name,department,area_code,line,validate_flag,frequency_months,first_month,year_ref,owner_person_id,source_tab,source_row)
values('Thiết bị','CRUD-ROLE-PQ','Synthetic CRUD PQ','CRUD_WS','CRUD_AREA','CRUD_LINE','y',12,1,2026,pg_temp.person(3),'crud-role-test',1);
insert into public.vmp_plan_items(id,validation_code,object_code,validation_type,year,is_active,item_state,version,departments,execution_departments,owner_person_id)
values('CRUD-ROLE-PQ/2026.01-PQ','CRUD-ROLE-PQ/2026.01-PQ','CRUD-ROLE-PQ','PQ',2026,true,'active',1,array['CRUD_WS'],array['CRUD_WS'],pg_temp.person(3));
set local role authenticated;
select pg_temp.actor(1);
do $$declare n int;j jsonb;begin
 for n in 4..5 loop
  j:=public.rpc_set_source_workshop_scope_grant(null,pg_temp.person(n),'CRUD_WS','CRUD_AREA','CRUD_LINE',true,'Phạm vi kiểm thử riêng',null);
  perform pg_temp.check_result(j->>'ok'='true','SCOPE_GRANT_'||n);
  j:=public.rpc_set_item_assignment(pg_temp.person(n),'CRUD-ROLE-PQ/2026.01-PQ','equipment_department',null,'assign','Phân công kiểm thử riêng',null);
  perform pg_temp.check_result(j->>'ok'='true','WORKSHOP_ASSIGN_'||n);
 end loop;
end$$;
-- Literal policy: QA staff has 7 QA fields, workshop assignees only actual_validation_date.
do $$declare n int;j jsonb;v int;before_state text;date_text text;begin
 for n in 1..5 loop
  perform pg_temp.actor(n);v:=(pg_temp.item()->>'version')::int;
  date_text:='2026-10-'||lpad(n::text,2,'0');
  j:=public.rpc_update_progress('CRUD-ROLE-PQ/2026.01-PQ',jsonb_build_object('actual_protocol_date',date_text),'Nhập ngày đề cương thử',null,v);
  if n<=3 then
   perform pg_temp.check_result(j->>'ok'='true' and pg_temp.item()->>'actual_protocol_date'=date_text,'PROTOCOL_ALLOW_'||n);
   perform pg_temp.check_result(exists(select 1 from pg_temp.audit_rows()a where a.user_id=('a8400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid and a.new_data->>'actual_protocol_date'=date_text and a.change_reason='Nhập ngày đề cương thử'),'PROTOCOL_AUDIT_'||n);
  else
   perform pg_temp.check_result(j->>'ok'='false' and coalesce(j->>'code',j->>'error_code')='item_field_forbidden','PROTOCOL_DENY_'||n);
  end if;
  v:=(pg_temp.item()->>'version')::int;before_state:=pg_temp.effects();
  j:=public.rpc_update_progress('CRUD-ROLE-PQ/2026.01-PQ',jsonb_build_object('actual_validation_date',date_text),'Nhập ngày thẩm định thử',null,v);
  if n=3 then
   perform pg_temp.check_result(j->>'ok'='false' and coalesce(j->>'code',j->>'error_code')='item_field_forbidden' and before_state=pg_temp.effects(),'ACTUAL_DENY_QA_STAFF_NO_DELTA');
  else
   perform pg_temp.check_result(j->>'ok'='true' and pg_temp.item()->>'actual_validation_date'=date_text,'ACTUAL_ALLOW_'||n);
  end if;
 end loop;
 -- Stale version must reject an authorized admin and preserve data/audit.
 perform pg_temp.actor(1);v:=(pg_temp.item()->>'version')::int;before_state:=pg_temp.effects();
 j:=public.rpc_update_progress('CRUD-ROLE-PQ/2026.01-PQ','{"actual_protocol_date":"2026-10-06"}','Stale test',null,v-1);
 perform pg_temp.check_result(j->>'ok'='false' and upper(coalesce(j->>'code',j->>'error_code'))='VERSION_CONFLICT' and pg_temp.effects()=before_state,'PROGRESS_STALE_NO_DELTA');
end$$;
-- Every editable progress field, each canonical role: write + clear/reset,
-- readback and exact actor/reason/before-after audit; denied fields have no delta.
do $$declare n int;k text;j jsonb;v int;value jsonb;reset_value jsonb;prior jsonb;before_state text;allowed boolean;reason text;begin
 for n in 1..5 loop
  perform pg_temp.actor(n);
  foreach k in array array['actual_protocol_date','status_protocol','actual_validation_date','status_validation','actual_report_date','status_report','actual_vmp_date','status_vmp']loop
   allowed:=n<=2 or (n=3 and k<>'actual_validation_date') or (n>=4 and k='actual_validation_date');
   value:=case when k like 'actual_%'then to_jsonb('2026-09-'||lpad((10+n)::text,2,'0'))else '"in_progress"'::jsonb end;
   reason:='Full field write '||n||' '||k;v:=(pg_temp.item()->>'version')::int;prior:=pg_temp.item()->k;before_state:=pg_temp.effects();
   j:=public.rpc_update_progress('CRUD-ROLE-PQ/2026.01-PQ',jsonb_build_object(k,value),reason,null,v);
   if allowed then
    perform pg_temp.check_result(j->>'ok'='true'and pg_temp.item()->k=value,'FIELD_WRITE_'||n||'_'||k);
    perform pg_temp.check_result(exists(select 1 from pg_temp.audit_rows()a where a.user_id=('a8400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid and a.change_reason=reason and a.old_data->k is not distinct from prior and a.new_data->k=value),'FIELD_AUDIT_'||n||'_'||k);
    reset_value:=case when k like 'actual_%'then 'null'::jsonb else '"not_started"'::jsonb end;
    v:=(pg_temp.item()->>'version')::int;reason:='Full field clear '||n||' '||k;
    j:=public.rpc_update_progress('CRUD-ROLE-PQ/2026.01-PQ',jsonb_build_object(k,reset_value),reason,null,v);
    perform pg_temp.check_result(j->>'ok'='true'and pg_temp.item()->k=reset_value,'FIELD_CLEAR_'||n||'_'||k);
    perform pg_temp.check_result(exists(select 1 from pg_temp.audit_rows()a where a.user_id=('a8400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid and a.change_reason=reason and a.old_data->k=value and a.new_data->k=reset_value),'FIELD_CLEAR_AUDIT_'||n||'_'||k);
   else
    perform pg_temp.check_result(j->>'ok'='false'and j->>'code'='item_field_forbidden'and before_state=pg_temp.effects(),'FIELD_DENY_'||n||'_'||k);
   end if;
  end loop;
 end loop;
end$$;

-- Manual planned deadlines are an Admin/QA-manager complete-snapshot write.
-- Every other canonical role is denied before payload mutation.
do $$declare n int;j jsonb;v int;before_state text;payload jsonb:=
'{"deadline_protocol":"2026-11-01","deadline_validation":"2026-11-15","deadline_report":"2026-11-22","deadline_vmp":"2026-12-01"}';begin
 for n in 1..5 loop
  payload:=jsonb_build_object('deadline_protocol','2026-11-'||lpad(n::text,2,'0'),
   'deadline_validation','2026-11-'||lpad((14+n)::text,2,'0'),
   'deadline_report','2026-11-'||lpad((21+n)::text,2,'0'),
   'deadline_vmp','2026-12-'||lpad(n::text,2,'0'));
  perform pg_temp.actor(n);v:=(pg_temp.item()->>'version')::int;before_state:=pg_temp.effects();
  j:=public.rpc_update_planned_deadlines('CRUD-ROLE-PQ/2026.01-PQ',payload,'Điều chỉnh deadline synthetic',v,true);
  if n<=2 then
   perform pg_temp.check_result(j->>'ok'='true'and pg_temp.item()->>'deadline_protocol'=payload->>'deadline_protocol','DEADLINE_ALLOW_'||n);
   perform pg_temp.check_result(exists(select 1 from pg_temp.audit_rows()a where a.user_id=('a8400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
    and a.validation_code='CRUD-ROLE-PQ/2026.01-PQ'and a.change_reason='Điều chỉnh deadline synthetic'
    and a.old_data is not null and a.new_data->>'deadline_protocol'=payload->>'deadline_protocol'),'DEADLINE_AUDIT_'||n);
   v:=(pg_temp.item()->>'version')::int;before_state:=pg_temp.effects();
   j:=public.rpc_update_planned_deadlines('CRUD-ROLE-PQ/2026.01-PQ','{"deadline_protocol":null,"deadline_validation":null,"deadline_report":null,"deadline_vmp":null}', 'Xóa deadline synthetic '||n,v,true);
   perform pg_temp.check_result(j->>'ok'='false' and j->>'error_code'='DEADLINE_ERASURE_FORBIDDEN' and pg_temp.effects()=before_state,'DEADLINE_CLEAR_DENIED_NO_DELTA_'||n);
  else perform pg_temp.check_result(j->>'error_code'='FORBIDDEN'and pg_temp.effects()=before_state,'DEADLINE_DENY_'||n);end if;
 end loop;
 perform pg_temp.actor(1);v:=(pg_temp.item()->>'version')::int;before_state:=pg_temp.effects();
 j:=public.rpc_update_planned_deadlines('CRUD-ROLE-PQ/2026.01-PQ',payload,'Deadline stale',v-1,true);
 perform pg_temp.check_result(j->>'error_code'='VERSION_CONFLICT'and pg_temp.effects()=before_state,'DEADLINE_STALE_NO_DELTA');
end$$;

-- Revoking either workshop prerequisite takes effect on the next call and
-- cannot leave a progress or audit delta.
select pg_temp.actor(1);
do $$declare j jsonb;before_state text;v int;begin
 j:=public.rpc_set_item_assignment(pg_temp.person(4),'CRUD-ROLE-PQ/2026.01-PQ','equipment_department',null,'revoke','Thu hồi phân công synthetic',null);
 perform pg_temp.check_result(j->>'ok'='true','WORKSHOP_ASSIGN_REVOKE');
 perform pg_temp.actor(4);v:=(pg_temp.item()->>'version')::int;before_state:=pg_temp.effects();
 j:=public.rpc_update_progress('CRUD-ROLE-PQ/2026.01-PQ','{"actual_validation_date":"2026-10-20"}','Sau thu hồi',null,v);
 perform pg_temp.check_result(j->>'ok'='false'and coalesce(j->>'code',j->>'error_code')='item_field_forbidden'and pg_temp.effects()=before_state,'WORKSHOP_REVOKE_IMMEDIATE_NO_DELTA');
end$$;

-- Supported allowlist lifecycle is soft activation/deactivation and is
-- auditable; there is no physical-delete API.
select pg_temp.actor(1);
do $$declare j jsonb;e text:='crud-admin-positive@example.test';begin
 j:=public.rpc_set_email_cho_phep(e,true,'Tạo allowlist synthetic');
 perform pg_temp.check_result(j->>'ok'='true'and pg_temp.allowed_email(e)->>'is_active'='true','ALLOWLIST_CREATE');
 perform pg_temp.check_result(exists(select 1 from pg_temp.audit_rows()a where a.table_name='vmp_email_cho_phep'and a.record_id=e
  and a.new_data->>'cho_phep'='true'and a.source='dashboard_rpc'),'ALLOWLIST_CREATE_AUDIT');
 j:=public.rpc_set_email_cho_phep(e,false,'Ngừng allowlist synthetic');
 perform pg_temp.check_result(j->>'ok'='true'and pg_temp.allowed_email(e)->>'is_active'='false','ALLOWLIST_DEACTIVATE');
 perform pg_temp.check_result(exists(select 1 from pg_temp.audit_rows()a where a.table_name='vmp_email_cho_phep'and a.record_id=e
  and a.new_data->>'cho_phep'='false'and a.source='dashboard_rpc'),'ALLOWLIST_DEACTIVATE_AUDIT');
end$$;
-- Administrative writes denied before any target mutation for every nonadmin role.
do $$declare n int;j jsonb;before_state text;q text;label text;begin
 for n in 2..6 loop
  perform pg_temp.actor(n);
  for label,q in select * from(values
   ('ROLE',$q$select public.rpc_set_business_role('a8400000-0000-4000-8000-000000000003','admin','QA','Forbidden role change test')$q$),
   ('ACTIVE',$q$select public.rpc_set_user_active('a8400000-0000-4000-8000-000000000003',false,'Forbidden disable test')$q$),
   ('ALLOWLIST',$q$select public.rpc_set_email_cho_phep('crud-forbidden@example.test',true,'Forbidden allowlist test')$q$),
   ('MODE',$q$select public.rpc_set_item_permissions_mode('enforced','Forbidden mode test')$q$),
   ('PEOPLE_ACCESS',$q$select public.rpc_upsert_item_permission_staff(null,'{"full_name":"Forbidden staff","department":"QA","access_class":"qa_manager"}','Forbidden person test',0)$q$)
  )t(label,q)loop
   before_state:=pg_temp.effects();execute q into j;
   perform pg_temp.check_result(j->>'ok'='false' and case when n=6 then j->>'error_code'='ACCOUNT_DISABLED' when label='ALLOWLIST' then j->>'error'='Chỉ admin được sửa danh sách email' when label='MODE' then j->>'error'='Chỉ Admin đổi được chế độ phân quyền' else coalesce(j->>'error_code',j->>'code')='FORBIDDEN' end and pg_temp.effects()=before_state,'ADMIN_ONLY_'||label||'_ROLE_'||n);
  end loop;
 end loop;
end$$;
select pg_temp.actor(1);
do $$declare j jsonb;begin
 j:=public.rpc_set_user_active('a8400000-0000-4000-8000-000000000003',false,'Tạm khóa tài khoản kiểm thử');
 perform pg_temp.check_result(j->>'ok'='true' and pg_temp.profile(3)->>'is_active'='false','ACCOUNT_DISABLE_PERSISTED');
 perform pg_temp.check_result(exists(select 1 from pg_temp.audit_rows()a where a.user_id='a8400000-0000-4000-8000-000000000001'and a.record_id='a8400000-0000-4000-8000-000000000003'and a.old_data->>'is_active'='true'and a.new_data->>'is_active'='false'and a.change_reason='Tạm khóa tài khoản kiểm thử'),'ACCOUNT_DISABLE_AUDIT_EXACT');
 perform pg_temp.actor(3);
 j:=public.rpc_update_progress('CRUD-ROLE-PQ/2026.01-PQ','{"actual_protocol_date":"2026-10-07"}','Revoked actor',null,null);
 perform pg_temp.check_result(j->>'error_code'='ACCOUNT_DISABLED','ACCOUNT_REVOCATION_IMMEDIATE');
 perform pg_temp.actor(1);
 j:=public.rpc_set_user_active('a8400000-0000-4000-8000-000000000003',true,'Mở lại tài khoản kiểm thử');
 perform pg_temp.check_result(j->>'ok'='true'and pg_temp.profile(3)->>'is_active'='true','ACCOUNT_REACTIVATE_PERSISTED');
 j:=public.rpc_set_user_active('a8400000-0000-4000-8000-000000000001',false,'Attempt self disable');
 perform pg_temp.check_result(j->>'error_code'='SELF_DEACTIVATION_FORBIDDEN','ACCOUNT_SELF_DISABLE_DENIED');
end$$;
reset role;
do $$declare failures text;begin select string_agg(id,', 'order by id)into failures from checks where not passed;if failures is not null then raise exception 'CRUD_PROGRESS_ACCOUNT_FAILURES: %',failures;end if;end$$;
rollback;

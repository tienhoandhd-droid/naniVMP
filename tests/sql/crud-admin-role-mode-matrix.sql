\set ON_ERROR_STOP on
begin;
set local statement_timeout='60s';
set local lock_timeout='5s';

create function pg_temp.actor(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object(
   'sub','a8600000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true)
$$;
create function pg_temp.profile(n integer) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(p) from public.profiles p
 where p.id=('a8600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.person(n integer) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(p) from public.vmp_performers p
 where p.user_id=('a8600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.role_of(n integer) returns text language sql stable security definer set search_path='' as $$
 select public.vmp_business_role(('a8600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid)
$$;
create function pg_temp.unresolved_reason(n integer) returns text language sql stable security definer set search_path='' as $$
 select public.vmp_business_role_unresolved_reason(
   ('a8600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid)
$$;
create function pg_temp.role_audits() returns setof public.audit_logs language sql stable security definer set search_path='' as $$
 select * from public.audit_logs a
 where a.user_id='a8600000-0000-4000-8000-000000000001'
   and a.table_name='profiles'
   and a.record_id='a8600000-0000-4000-8000-000000000002'
$$;
create function pg_temp.mode_audits() returns setof public.audit_logs language sql stable security definer set search_path='' as $$
 select * from public.audit_logs a
 where a.user_id='a8600000-0000-4000-8000-000000000001'
   and a.table_name='system_config' and a.record_id='item_permissions_mode'
$$;
create function pg_temp.mode_value() returns jsonb language sql stable security definer set search_path='' as $$
 select value from public.system_config where key='item_permissions_mode'
$$;
create function pg_temp.mode_name() returns text language sql stable security definer set search_path='' as $$
 select public.item_permissions_mode()
$$;
create function pg_temp.snapshot() returns text language sql stable security definer set search_path='' as $$
 select md5(jsonb_build_array(
   (select jsonb_agg(to_jsonb(p) order by id) from public.profiles p where id::text like 'a8600000-%'),
   (select jsonb_agg(to_jsonb(p) order by id) from public.vmp_performers p where user_id::text like 'a8600000-%'),
   (select value from public.system_config where key='item_permissions_mode'),
   (select jsonb_agg(to_jsonb(a) order by id) from public.audit_logs a
      where user_id::text like 'a8600000-%' or record_id like 'a8600000-%'
         or (table_name='system_config' and record_id='item_permissions_mode'))
 )::text)
$$;

insert into public.departments(id,name,short_name) values
 ('CRUD_MODE_WS','CRUD mode workshop','CMW') on conflict(id) do nothing;
insert into public.vmp_email_cho_phep(email,ghi_chu)
select email,'role/mode rollback fixture' from (values
 ('crud-mode-admin@example.test'),('crud-mode-target@example.test'),
 ('crud-mode-manager@example.test'),('crud-mode-qa@example.test'),
 ('crud-mode-workshop-manager@example.test'),('crud-mode-workshop-staff@example.test'),
 ('crud-mode-inactive@example.test')) x(email)
on conflict(email) do update set is_active=true;
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'authenticated','authenticated',email,'x',now(),'{}','{}',now(),now() from (values
 ('a8600000-0000-4000-8000-000000000001'::uuid,'crud-mode-admin@example.test'),
 ('a8600000-0000-4000-8000-000000000002'::uuid,'crud-mode-target@example.test'),
 ('a8600000-0000-4000-8000-000000000003'::uuid,'crud-mode-manager@example.test'),
 ('a8600000-0000-4000-8000-000000000004'::uuid,'crud-mode-qa@example.test'),
 ('a8600000-0000-4000-8000-000000000005'::uuid,'crud-mode-workshop-manager@example.test'),
 ('a8600000-0000-4000-8000-000000000006'::uuid,'crud-mode-workshop-staff@example.test'),
 ('a8600000-0000-4000-8000-000000000007'::uuid,'crud-mode-inactive@example.test')
) x(id,email);
insert into public.profiles(id,full_name,email,role,department,is_active) values
 ('a8600000-0000-4000-8000-000000000001','CRUD Mode Admin','crud-mode-admin@example.test','admin',null,true),
 ('a8600000-0000-4000-8000-000000000002','CRUD Mode Target','crud-mode-target@example.test','department_user','QA',true),
 ('a8600000-0000-4000-8000-000000000003','CRUD Mode Manager','crud-mode-manager@example.test','qa_manager','QA',true),
 ('a8600000-0000-4000-8000-000000000004','CRUD Mode QA','crud-mode-qa@example.test','department_user','QA',true),
 ('a8600000-0000-4000-8000-000000000005','CRUD Mode Workshop Manager','crud-mode-workshop-manager@example.test','department_user','CRUD_MODE_WS',true),
 ('a8600000-0000-4000-8000-000000000006','CRUD Mode Workshop Staff','crud-mode-workshop-staff@example.test','department_user','CRUD_MODE_WS',true),
 ('a8600000-0000-4000-8000-000000000007','CRUD Mode Inactive','crud-mode-inactive@example.test','admin',null,false)
on conflict(id) do update set full_name=excluded.full_name,email=excluded.email,role=excluded.role,
 department=excluded.department,is_active=excluded.is_active;
update public.vmp_performers set department='QA',access_class='qa_manager',is_active=true
 where user_id='a8600000-0000-4000-8000-000000000003';
update public.vmp_performers set department='QA',access_class='qa_progress_editor',is_active=true
 where user_id='a8600000-0000-4000-8000-000000000004';
update public.vmp_performers set department='CRUD_MODE_WS',access_class='equipment_manager',is_active=true
 where user_id='a8600000-0000-4000-8000-000000000005';
update public.vmp_performers set department='CRUD_MODE_WS',access_class='workshop_staff',is_active=true
 where user_id='a8600000-0000-4000-8000-000000000006';
update public.vmp_performers set department='QA',access_class='qa_progress_editor',is_active=true
 where user_id='a8600000-0000-4000-8000-000000000002';

do $$declare n int;expected text[]:=array['admin','qa_staff','qa_manager','qa_staff','workshop_manager','workshop_staff'];begin
 for n in 1..6 loop assert pg_temp.role_of(n) is not distinct from expected[n],'ARM_CANONICAL_ACTOR_'||n;end loop;
 assert pg_temp.role_of(7) is null,'ARM_INACTIVE_NO_BUSINESS_ROLE';
end$$;

set local role authenticated;
select pg_temp.actor(1);
do $$
declare j jsonb; before_state text;
begin
 -- Target has a linked performer, so every canonical role transition is real.
 assert pg_temp.person(2) is not null and pg_temp.role_of(2)='qa_staff'
   and pg_temp.unresolved_reason(2) is null,
   'ARM_TARGET_FIXTURE_CANONICAL';
 j:=public.rpc_set_business_role('a8600000-0000-4000-8000-000000000002','admin',null,'Promote synthetic admin');
 assert j->>'ok'='true' and pg_temp.role_of(2)='admin' and pg_temp.profile(2)->>'role'='admin','ARM_ROLE_PROMOTE_ADMIN';
 assert exists(select 1 from pg_temp.role_audits() a
   where a.action::text='UPDATE' and a.change_reason='Promote synthetic admin' and a.source='dashboard_rpc'
   and a.old_data->>'role'='department_user' and a.old_data->>'access_class'='qa_progress_editor'
   and a.new_data->>'business_role'='admin'),'ARM_ROLE_PROMOTE_AUDIT';

 j:=public.rpc_set_business_role('a8600000-0000-4000-8000-000000000002','qa_manager','QA','Change synthetic QA manager');
 assert j->>'ok'='true' and pg_temp.role_of(2)='qa_manager'
   and pg_temp.profile(2)->>'role'='qa_manager' and pg_temp.person(2)->>'access_class'='qa_manager','ARM_ROLE_CHANGE_QA_MANAGER';
 j:=public.rpc_set_business_role('a8600000-0000-4000-8000-000000000002','workshop_manager','CRUD_MODE_WS','Change synthetic workshop manager');
 assert j->>'ok'='true' and pg_temp.role_of(2)='workshop_manager'
   and pg_temp.profile(2)->>'role'='department_user'
   and pg_temp.person(2)->>'access_class'='equipment_manager'
   and pg_temp.person(2)->>'department'='CRUD_MODE_WS','ARM_ROLE_CHANGE_WORKSHOP_MANAGER';
 assert exists(select 1 from pg_temp.role_audits() a where a.action::text='UPDATE'
   and a.change_reason='Change synthetic workshop manager' and a.old_data->>'access_class'='qa_manager'
   and a.new_data->>'access_class'='equipment_manager' and a.new_data->>'business_role'='workshop_manager'),
   'ARM_ROLE_CHANGE_WORKSHOP_MANAGER_AUDIT';
 j:=public.rpc_set_business_role('a8600000-0000-4000-8000-000000000002','workshop_staff','CRUD_MODE_WS','Change synthetic workshop staff');
 assert j->>'ok'='true' and pg_temp.role_of(2)='workshop_staff'
   and pg_temp.person(2)->>'access_class'='workshop_staff' and pg_temp.person(2)->>'department'='CRUD_MODE_WS','ARM_ROLE_CHANGE_WORKSHOP';
 j:=public.rpc_set_business_role('a8600000-0000-4000-8000-000000000002','qa_staff','QA','Change synthetic QA staff');
 assert j->>'ok'='true' and pg_temp.role_of(2)='qa_staff'
   and pg_temp.profile(2)->>'role'='department_user'
   and pg_temp.person(2)->>'access_class'='qa_progress_editor'
   and pg_temp.person(2)->>'department'='QA','ARM_ROLE_CHANGE_QA_STAFF';
 assert exists(select 1 from pg_temp.role_audits() a
   where a.action::text='UPDATE' and a.change_reason='Change synthetic QA staff'
   and a.old_data->>'access_class'='workshop_staff'
   and a.new_data->>'access_class'='qa_progress_editor'
   and a.new_data->>'business_role'='qa_staff'),'ARM_ROLE_CHANGE_QA_STAFF_AUDIT';

 before_state:=pg_temp.snapshot();
 j:=public.rpc_set_business_role('a8600000-0000-4000-8000-000000000001','viewer',null,'Self demotion forbidden');
 assert j->>'error_code'='SELF_DEMOTION_FORBIDDEN' and pg_temp.snapshot()=before_state,
   'ARM_SELF_DEMOTION_NO_DELTA';

 -- Positive configuration lifecycle: preview is always safe and must persist/audit.
 j:=public.rpc_set_item_permissions_mode('preview','Set preview synthetic');
 assert j->>'ok'='true' and j->>'mode'='preview' and pg_temp.mode_name()='preview'
   and pg_temp.mode_value()='"preview"'::jsonb,'ARM_MODE_PREVIEW_PERSIST';
 assert exists(select 1 from pg_temp.mode_audits() a
   where a.action::text='CONFIG_CHANGE'
   and a.change_reason='Set preview synthetic' and a.source='dashboard_rpc'
   and a.new_data='{"mode":"preview"}'::jsonb),'ARM_MODE_PREVIEW_AUDIT';
end$$;

-- Every active non-admin role and an inactive account are denied with no state/audit delta.
do $$
declare n integer; j jsonb; before_state text; expected text;
begin
 foreach n in array array[3,4,5,6,7] loop
  perform pg_temp.actor(n); before_state:=pg_temp.snapshot();
  j:=public.rpc_set_business_role('a8600000-0000-4000-8000-000000000002','admin',null,'Denied role mutation');
  expected:=case when n=7 then 'ACCOUNT_DISABLED' else 'FORBIDDEN' end;
  assert j->>'error_code'=expected and pg_temp.snapshot()=before_state,'ARM_ROLE_DENY_'||n;
  j:=public.rpc_set_item_permissions_mode('preview','Denied mode mutation');
  if n=7 then assert j->>'error_code'='ACCOUNT_DISABLED' and pg_temp.snapshot()=before_state,'ARM_MODE_DENY_'||n;
  else assert j->>'ok'='false' and j->>'error'='Chỉ Admin đổi được chế độ phân quyền'
      and pg_temp.snapshot()=before_state,'ARM_MODE_DENY_'||n; end if;
 end loop;
end$$;

rollback;

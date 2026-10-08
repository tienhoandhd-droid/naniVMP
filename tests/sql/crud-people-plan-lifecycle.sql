\set ON_ERROR_STOP on
begin;set local statement_timeout='60s';set local lock_timeout='5s';
insert into public.departments(id,name,short_name)values('qa','QA lowercase fixture','QAL'),('QA','QA uppercase fixture','QAU'),('CRUD_WS','Wrong department fixture','CWS')on conflict do nothing;
insert into public.vmp_email_cho_phep(email,ghi_chu)values
('crud-life-admin@example.test','rollback fixture'),('crud-life-link@example.test','rollback fixture'),
('crud-life-upper-qa@example.test','rollback fixture'),('crud-life-wrong-dept@example.test','rollback fixture');
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)values
('a8500000-0000-4000-8000-000000000001','authenticated','authenticated','crud-life-admin@example.test','x',now(),'{}','{}',now(),now()),
('a8500000-0000-4000-8000-000000000002','authenticated','authenticated','crud-life-link@example.test','x',now(),'{}','{}',now(),now()),
('a8500000-0000-4000-8000-000000000003','authenticated','authenticated','crud-life-upper-qa@example.test','x',now(),'{}','{}',now(),now());
-- Separate account whose department must be rejected for a QA performer.
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)values
('a8500000-0000-4000-8000-000000000004','authenticated','authenticated','crud-life-wrong-dept@example.test','x',now(),'{}','{}',now(),now());
insert into public.profiles(id,full_name,email,role,department,is_active)values
('a8500000-0000-4000-8000-000000000001','CRUD Life Admin','crud-life-admin@example.test','admin',null,true),
('a8500000-0000-4000-8000-000000000002','CRUD Life Link','crud-life-link@example.test','department_user','qa',true),
('a8500000-0000-4000-8000-000000000003','CRUD Life Upper QA','crud-life-upper-qa@example.test','department_user','QA',true)
on conflict(id)do update set full_name=excluded.full_name,email=excluded.email,role=excluded.role,department=excluded.department,is_active=true;
insert into public.profiles(id,full_name,email,role,department,is_active)values
('a8500000-0000-4000-8000-000000000004','CRUD Life Wrong Dept','crud-life-wrong-dept@example.test','department_user','CRUD_WS',true)
on conflict(id)do update set full_name=excluded.full_name,email=excluded.email,role=excluded.role,department=excluded.department,is_active=true;
update public.vmp_performers set department='qa',access_class='qa_progress_editor',is_active=true where user_id='a8500000-0000-4000-8000-000000000002';
update public.vmp_performers set department='QA',access_class='qa_progress_editor',is_active=true where user_id='a8500000-0000-4000-8000-000000000003';
create function pg_temp.actor()returns void language sql as $$select set_config('request.jwt.claims','{"sub":"a8500000-0000-4000-8000-000000000001","role":"authenticated"}',true)$$;
create function pg_temp.person(id uuid)returns jsonb language sql security definer set search_path=''as $$select to_jsonb(p)from public.vmp_performers p where p.id=$1$$;
create function pg_temp.person_for_user(id uuid)returns uuid language sql security definer set search_path=''as $$select p.id from public.vmp_performers p where p.user_id=$1$$;
create function pg_temp.business_role(id uuid)returns text language sql stable security definer set search_path=''as $$select public.vmp_business_role($1)$$;
create function pg_temp.plan(code text)returns jsonb language sql security definer set search_path=''as $$select to_jsonb(i)from public.vmp_plan_items i where validation_code=code$$;
create function pg_temp.audits(record text,tab text)returns jsonb language sql security definer set search_path=''as $$select coalesce(jsonb_agg(to_jsonb(a)order by created_at,id),'[]')from public.audit_logs a where record_id=record and table_name=tab$$;
create function pg_temp.link_digest()returns text language sql security definer set search_path=''as $$select md5(jsonb_build_array(
 (select jsonb_agg(to_jsonb(p)order by id)from public.profiles p where id::text like'a8500000-%'),
 (select jsonb_agg(to_jsonb(p)order by id)from public.vmp_performers p where user_id::text like'a8500000-%'or employee_code='CRUD-LIFE-P1'),
 (select jsonb_agg(to_jsonb(a)order by id)from public.vmp_item_assignments a where user_id::text like'a8500000-%'),
 (select jsonb_agg(to_jsonb(a)order by id)from public.audit_logs a where user_id::text like'a8500000-%'))::text)$$;
insert into public.vmp_objects(code,name,classification,department,area,line)values('CRUD-LIFE-OBJ','CRUD lifecycle object','tb','QA','AREA','LINE');
insert into public.vmp_source_objects(object_kind,object_code,object_name,department,area_code,line,validate_flag,frequency_months,first_month,year_ref,source_tab,source_row)
values('Thiết bị','CRUD-LIFE-OBJ','CRUD lifecycle object','QA','AREA','LINE','y',12,1,2026,'crud-life',1);
set local role authenticated;select pg_temp.actor();
do $$declare j jsonb;pid uuid;v int;linked uuid;upper_linked uuid;wrong_linked uuid;before_wrong jsonb;before_digest text;begin
 -- A fresh request has no audit context. Cancellation must not taint
 -- a subsequent unrelated audited creation within the same transaction.
 assert current_setting('app.audit_source',true) is null,'LIFE_AUDIT_CONTEXT_START_UNSET';
 j:=public.rpc_create_plan_item('CRUD-LIFE-OBJ','PQ',2026,2,'{}');
 assert(j->>'ok'='true')is true,'LIFE_CONTEXT_PLAN_CREATE';
 j:=public.rpc_delete_plan_item('CRUD-LIFE-OBJ/2026.02-PQ','Cancel with initially unset context');
 assert(j->>'ok'='true')is true,'LIFE_CONTEXT_PLAN_CANCEL';
 j:=public.rpc_create_plan_item('CRUD-LIFE-OBJ','PQ',2026,3,'{}');
 assert(j->>'ok'='true')is true,'LIFE_UNRELATED_PLAN_CREATE';
 assert exists(select 1 from jsonb_array_elements(pg_temp.audits('CRUD-LIFE-OBJ/2026.03-PQ','vmp_plan_items'))a
   where a->>'action'='INSERT' and a->>'source'='trigger' and a->>'change_reason' is null
   and a->>'user_id'='a8500000-0000-4000-8000-000000000001'),'LIFE_UNRELATED_AUDIT_DEFAULT_CONTEXT';
 -- Unlinked QA person: create, edit with optimistic version, then soft deactivate.
 j:=public.rpc_upsert_item_permission_staff(null,'{"full_name":"CRUD New Person","employee_code":"CRUD-LIFE-P1","department":"QA","access_class":"qa_progress_editor","email":"crud-life-person@example.test"}','Tạo nhân sự synthetic',0);
 assert(j->>'ok'='true')is true,'LIFE_PERSON_CREATE';pid:=(j->>'person_id')::uuid;v:=(j->>'version')::int;
 assert(pg_temp.person(pid)->>'performer_name'='CRUD New Person'and pg_temp.person(pid)->>'user_id'is null)is true,'LIFE_PERSON_CREATE_PERSIST';
 j:=public.rpc_upsert_item_permission_staff(pid,'{"full_name":"CRUD Edited Person"}','Sửa tên synthetic',v);
 assert(j->>'ok'='true'and(j->>'version')::int=v+1)is true,'LIFE_PERSON_EDIT';v:=(j->>'version')::int;
 assert exists(select 1 from jsonb_array_elements(pg_temp.audits(pid::text,'vmp_performers'))a where a->>'action'='UPDATE'and a#>>'{old_data,performer_name}'='CRUD New Person'and a#>>'{new_data,performer_name}'='CRUD Edited Person'and a->>'change_reason'='Sửa tên synthetic'),'LIFE_PERSON_EDIT_AUDIT';
 j:=public.rpc_upsert_item_permission_staff(pid,'{"is_active":false}','Ngừng nhân sự synthetic',v);
 assert(j->>'ok'='true'and pg_temp.person(pid)->>'is_active'='false')is true,'LIFE_PERSON_DEACTIVATE';
 assert exists(select 1 from jsonb_array_elements(pg_temp.audits(pid::text,'vmp_performers'))a
  where a->>'user_id'='a8500000-0000-4000-8000-000000000001'and a->>'change_reason'='Ngừng nhân sự synthetic'
  and a#>>'{old_data,is_active}'='true'and a#>>'{new_data,is_active}'='false'),'LIFE_PERSON_DEACTIVATE_AUDIT_EXACT';

 -- Existing trigger-created performer supports explicit unlink/relink lifecycle.
 linked:=pg_temp.person_for_user('a8500000-0000-4000-8000-000000000002');v:=(pg_temp.person(linked)->>'version')::int;
 j:=public.rpc_link_item_permission_account(linked,null,'Gỡ liên kết synthetic',v);
 assert(j->>'ok'='true'and pg_temp.person(linked)->>'user_id'is null)is true,'LIFE_PERSON_UNLINK';v:=(j->>'version')::int;
 j:=public.rpc_link_item_permission_account(linked,'a8500000-0000-4000-8000-000000000002','Nối lại synthetic',v);
 if coalesce((j->>'ok')::boolean,false)is not true then raise exception 'LIFE_PERSON_RELINK response=%',j;end if;
 assert(pg_temp.person(linked)->>'user_id'='a8500000-0000-4000-8000-000000000002')is true,'LIFE_PERSON_RELINK';
 assert exists(select 1 from jsonb_array_elements(pg_temp.audits(linked::text,'vmp_performers'))a
  where a->>'user_id'='a8500000-0000-4000-8000-000000000001'
   and a->>'change_reason'='Nối lại synthetic'and a#>'{old_data,performer,user_id}'='null'::jsonb
   and a#>>'{new_data,performer,user_id}'='a8500000-0000-4000-8000-000000000002'
   and a#>>'{new_data,profile,id}'='a8500000-0000-4000-8000-000000000002'),'LIFE_PERSON_LINK_AUDIT';

 -- Department spelling is normalized by the canonical role resolver. An
 -- uppercase QA principal must remain linkable after an unlink cycle.
 assert pg_temp.business_role('a8500000-0000-4000-8000-000000000003')is not distinct from'qa_staff','LIFE_UPPER_QA_CANONICAL_ROLE';
 upper_linked:=pg_temp.person_for_user('a8500000-0000-4000-8000-000000000003');v:=(pg_temp.person(upper_linked)->>'version')::int;
 j:=public.rpc_link_item_permission_account(upper_linked,null,'Gỡ uppercase QA synthetic',v);
 assert(j->>'ok'='true')is true,'LIFE_UPPER_QA_UNLINK';v:=(j->>'version')::int;
 j:=public.rpc_link_item_permission_account(upper_linked,'a8500000-0000-4000-8000-000000000003','Nối uppercase QA synthetic',v);
 if coalesce((j->>'ok')::boolean,false)is not true then raise exception 'LIFE_UPPER_QA_RELINK response=%',j;end if;
 assert(pg_temp.person(upper_linked)->>'user_id'='a8500000-0000-4000-8000-000000000003')is true,'LIFE_UPPER_QA_RELINK';
 wrong_linked:=pg_temp.person_for_user('a8500000-0000-4000-8000-000000000004');v:=(pg_temp.person(wrong_linked)->>'version')::int;
 j:=public.rpc_link_item_permission_account(wrong_linked,null,'Gỡ wrong department synthetic',v);v:=(j->>'version')::int;
 -- Make the unlinked person a QA-class target; account remains CRUD_WS.
 j:=public.rpc_upsert_item_permission_staff(wrong_linked,'{"department":"QA","access_class":"qa_progress_editor"}','Chuẩn bị QA target synthetic',v);v:=(j->>'version')::int;before_wrong:=pg_temp.person(wrong_linked);
 before_digest:=pg_temp.link_digest();j:=public.rpc_link_item_permission_account(wrong_linked,'a8500000-0000-4000-8000-000000000004','Wrong department must fail',v);
 assert(j->>'error_code'='INVALID_QA_PRINCIPAL'and pg_temp.person(wrong_linked)is not distinct from before_wrong and pg_temp.link_digest()=before_digest)is true,'LIFE_WRONG_DEPARTMENT_RELINK_DENIED_NO_EFFECT';
 perform set_config('request.jwt.claims','{"sub":"a8500000-0000-4000-8000-000000000004","role":"authenticated"}',true);
 before_digest:=pg_temp.link_digest();j:=public.rpc_link_item_permission_account(wrong_linked,'a8500000-0000-4000-8000-000000000004','Nonadmin must fail',v);
 assert(j->>'error_code'='FORBIDDEN'and pg_temp.person(wrong_linked)is not distinct from before_wrong and pg_temp.link_digest()=before_digest)is true,'LIFE_NONADMIN_RELINK_DENIED_NO_EFFECT';
 perform pg_temp.actor();

 -- Plan lifecycle is create then soft cancellation; duplicate and missing reason fail.
 j:=public.rpc_create_plan_item('CRUD-LIFE-OBJ','PQ',2026,1,'{}');
 assert(j->>'ok'='true'and pg_temp.plan('CRUD-LIFE-OBJ/2026.01-PQ')->>'is_active'='true')is true,'LIFE_PLAN_CREATE';
 j:=public.rpc_create_plan_item('CRUD-LIFE-OBJ','PQ',2026,1,'{}');assert(j->>'ok'='false')is true,'LIFE_PLAN_DUPLICATE_DENY';
 j:=public.rpc_delete_plan_item('CRUD-LIFE-OBJ/2026.01-PQ',null);assert(j->>'ok'='false')is true,'LIFE_PLAN_DELETE_REASON';
 perform set_config('app.audit_reason','Prior unrelated reason',true);
 perform set_config('app.audit_source','prior_unrelated_source',true);
 j:=public.rpc_delete_plan_item('CRUD-LIFE-OBJ/2026.01-PQ','Huỷ hạng mục synthetic');
 assert current_setting('app.audit_reason')='Prior unrelated reason' and current_setting('app.audit_source')='prior_unrelated_source','LIFE_PLAN_AUDIT_CONTEXT_RESTORED';
 assert(j->>'ok'='true'and pg_temp.plan('CRUD-LIFE-OBJ/2026.01-PQ')->>'is_active'='false'
 and pg_temp.plan('CRUD-LIFE-OBJ/2026.01-PQ')->>'item_state'='cancelled'
 and pg_temp.plan('CRUD-LIFE-OBJ/2026.01-PQ')->>'delete_reason'='Huỷ hạng mục synthetic')is true,'LIFE_PLAN_SOFT_DELETE';
 assert exists(select 1 from jsonb_array_elements(pg_temp.audits('CRUD-LIFE-OBJ/2026.01-PQ','vmp_plan_items'))a
  where a->>'user_id'='a8500000-0000-4000-8000-000000000001'and a#>>'{old_data,is_active}'='true'
  and a#>>'{new_data,is_active}'='false'and a#>>'{new_data,item_state}'='cancelled'
  and a->>'source'='rpc_delete_plan_item' and a->>'change_reason'='Huỷ hạng mục synthetic'),'LIFE_PLAN_SOFT_DELETE_AUDIT_EXACT';
end$$;
rollback;

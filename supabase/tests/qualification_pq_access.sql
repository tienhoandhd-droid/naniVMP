-- Run only against disposable restored VMP DB. Synthetic principals; entire test rolls back.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create function pg_temp.expect_denied(statement text) returns void language plpgsql as $$
begin
 execute statement;
 raise exception 'Expected permission denial';
exception when insufficient_privilege then null;
end$$;
create function pg_temp.expect_state(statement text,expected text) returns void language plpgsql as $$
begin
 execute statement;
 raise exception 'Expected SQLSTATE %',expected;
exception when others then if sqlstate<>expected then raise;end if;end$$;
create function pg_temp.air_scope() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_array(jsonb_build_object('system','air','forms',jsonb_build_object('bm02',jsonb_build_array(f->'locations'->0->>'id'))))
 from cpc1_private.gas_settings g cross join lateral jsonb_array_elements(g.config->'forms')f where g.system='air' and f->>'id'='bm02'
$$;
insert into public.vmp_email_cho_phep(email,ghi_chu) values ('pq-air-only@example.test','TEST ONLY'),('pq-unassigned@example.test','TEST ONLY');
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('9c290000-0000-4000-8000-000000000001','authenticated','authenticated','pq-air-only@example.test','x',now(),'{}','{}',now(),now()),
('9c290000-0000-4000-8000-000000000002','authenticated','authenticated','pq-unassigned@example.test','x',now(),'{}','{}',now(),now());
insert into public.departments(id,name,short_name) values('QA','Quality Assurance test','QA') on conflict(id)do nothing;
insert into public.profiles(id,full_name,email,role,department,is_active)
values('9c290000-0000-4000-8000-000000000001','PQ Air Only Test','pq-air-only@example.test','department_user','QA',true),
('9c290000-0000-4000-8000-000000000002','PQ Unassigned Test','pq-unassigned@example.test','department_user','QA',true)
on conflict(id)do update set full_name=excluded.full_name,email=excluded.email,role=excluded.role,department=excluded.department,is_active=excluded.is_active;
update public.vmp_performers set department='QA',access_class='qa_progress_editor',is_active=true
where user_id in('9c290000-0000-4000-8000-000000000001','9c290000-0000-4000-8000-000000000002');
insert into cpc1_private.members(user_id,enabled,reason) values
('9c290000-0000-4000-8000-000000000001',true,'Synthetic test fixture'),
('9c290000-0000-4000-8000-000000000002',true,'Synthetic test fixture');
update public.vmp_source_objects set owner_person_id=(select id from public.vmp_performers where user_id='9c290000-0000-4000-8000-000000000001')
where object_code='HT-12';
insert into storage.objects(bucket_id,name)values('cpc1-templates','v3/not-in-manifest.secret');
select set_config('test.air_id',(select id::text from public.cpc1_records where system='air' order by created_at limit 1),true);
select set_config('test.nitrogen_id',(select id::text from public.cpc1_records where system='nitrogen' order by created_at limit 1),true);
select set_config('test.run_id',(select run_id::text from cpc1_private.run_items where record_id=current_setting('test.air_id')::uuid),true);
select set_config('test.air_path',(select source_manifest->0->>'object_path' from cpc1_private.history_imports where record_id=current_setting('test.air_id')::uuid),true);
select set_config('test.nitrogen_path',(select source_manifest->0->>'object_path' from cpc1_private.history_imports where record_id=current_setting('test.nitrogen_id')::uuid),true);
select set_config('request.jwt.claim.sub','9c290000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.expect_denied('select public.cpc1_gas_config(''air'')');
select pg_temp.expect_denied('select public.cpc1_evaluate(''{"system":"air","meta":{},"forms":{},"equipment":{},"controls":{},"trend":{}}''::jsonb)');
select pg_temp.expect_denied(format('select public.cpc1_load(%L::uuid)',current_setting('test.air_id')));
do $test$ begin
 assert public.cpc1_list()='[]'::jsonb,'Unassigned record list leaked';
 assert public.cpc1_history_list()='[]'::jsonb,'Unassigned history leaked';
 assert public.cpc1_run_list()='[]'::jsonb,'Unassigned run list leaked';
 assert not exists(select 1 from storage.objects where bucket_id='cpc1-history' and name=current_setting('test.air_path')),'Unassigned source PDF leaked';
 assert not exists(select 1 from storage.objects where bucket_id='cpc1-templates' and name='v3/bm01.pdf'),'Unassigned template leaked';
end$test$;
reset role;
select set_config('request.jwt.claim.sub','9c290000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $test$ declare rows jsonb;begin
 perform public.cpc1_gas_config('air');
 perform pg_temp.expect_denied('select public.cpc1_gas_config(''nitrogen'')');
 rows:=public.cpc1_list();
 assert jsonb_array_length(rows)>0,'Assigned QA must see shared records created by another actor';
 assert not exists(select 1 from jsonb_array_elements(rows) r where r->>'system'<>'air'),'Other PQ records leaked';
 perform public.cpc1_load(current_setting('test.air_id')::uuid,2);
 perform pg_temp.expect_denied(format('select public.cpc1_load(%L::uuid,2)',current_setting('test.nitrogen_id')));
 rows:=public.cpc1_history_list();
 assert jsonb_array_length(rows)=2,'Assigned history not shared';
 assert not exists(select 1 from jsonb_array_elements(rows) r where r->>'system'<>'air'),'Other history leaked';
 rows:=public.cpc1_run_get(current_setting('test.run_id')::uuid);
 assert jsonb_array_length(rows->'items')=1 and rows#>>'{items,0,system}'='air','Mixed run leaked unauthorized items';
 assert (rows->>'can_close')::boolean is false,'Partial-access actor can close full mixed run';
 assert rows#>'{items,0,pq_codes}'='["HT-12/2026.01-PQ"]'::jsonb,'Wrong bound PQ label';
 assert(public.cpc1_load(current_setting('test.air_id')::uuid)->'pq_codes')=rows#>'{items,0,pq_codes}','Load/run PQ labels differ';
 perform public.cpc1_run_config(current_setting('test.run_id')::uuid,'air');
 perform pg_temp.expect_denied(format('select public.cpc1_run_config(%L::uuid,''nitrogen'')',current_setting('test.run_id')));
 perform public.cpc1_run_load(current_setting('test.run_id')::uuid,current_setting('test.air_id')::uuid);
 perform pg_temp.expect_denied(format('select public.cpc1_run_load(%L::uuid,%L::uuid)',current_setting('test.run_id'),current_setting('test.nitrogen_id')));
 assert exists(select 1 from storage.objects where bucket_id='cpc1-history' and name=current_setting('test.air_path')),'Authorized source PDF unavailable';
 assert not exists(select 1 from storage.objects where bucket_id='cpc1-history' and name=current_setting('test.nitrogen_path')),'Other source PDF leaked';
 assert exists(select 1 from storage.objects where bucket_id='cpc1-templates' and name='v3/bm01.pdf'),'Authorized template unavailable';
 assert not exists(select 1 from storage.objects where bucket_id='cpc1-templates' and name='v3/not-in-manifest.secret'),'Unlisted same-prefix template leaked';
 assert exists(select 1 from storage.objects where bucket_id='cpc1-templates' and name='v3/print-layout.json'),'Authorized layout unavailable';
 assert not exists(select 1 from storage.objects where bucket_id='cpc1-templates' and name='v4/bm01.pdf'),'Other template leaked';
end$test$;

-- Archived PQ remains discoverable when no current-year PQ exists.
reset role;
savepoint archive_year;
update public.vmp_plan_items set year=2025 where object_code='HT-12'and validation_type='PQ'and year=2026;
set local role authenticated;
do $test$ declare ctx jsonb:=public.cpc1_context();begin
 assert (ctx->>'can_view')::boolean,'Archive-only actor lost module access';
 assert (ctx#>>'{systems,air,can_view_archive}')::boolean,'Archive capability absent';
 assert (ctx#>>'{systems,air,can_edit_archive}')::boolean,'Archive editor capability absent';
 assert not(ctx#>>'{systems,air,can_view_current}')::boolean,'Missing current PQ reported readable';
 assert not(ctx#>>'{systems,air,can_enter}')::boolean,'Historical PQ grants current-year creation';
 assert ctx#>'{systems,air,pq_codes}'='[]'::jsonb,'Historical IDs leaked as current IDs';
 perform public.cpc1_run_load(current_setting('test.run_id')::uuid,current_setting('test.air_id')::uuid);
 perform public.cpc1_run_config(current_setting('test.run_id')::uuid,'air');
 perform pg_temp.expect_denied('select public.cpc1_gas_config(''air'')');
 assert exists(select 1 from storage.objects where bucket_id='cpc1-templates' and name='v3/bm01.pdf'),'Frozen archived template unavailable';
 assert not exists(select 1 from storage.objects where bucket_id='cpc1-templates' and name='v3/not-in-manifest.secret'),'Frozen manifest admits unlisted path';
end$test$;
reset role;
rollback to archive_year;
set local role authenticated;

do $test$ declare
 d jsonb:='{"system":"air","meta":{},"equipment":{},"forms":{},"controls":{},"trend":{}}';
 saved jsonb;again jsonb;r jsonb;created jsonb;req uuid:=gen_random_uuid();rr uuid:=gen_random_uuid();definition jsonb;
begin
 saved:=public.cpc1_save(d,null,0,req,'Synthetic PQ test');
 again:=public.cpc1_save(d,null,0,req,'Synthetic PQ test');
 assert saved=again,'Standalone retry changed result';
 perform pg_temp.expect_state(format('select public.cpc1_save(%L::jsonb,null,0,%L::uuid,''Changed title'')',d,req),'23505');
 perform pg_temp.expect_state(format('select public.cpc1_save(%L::jsonb,%L::uuid,0,%L::uuid,''Synthetic PQ test'')',d,saved->>'id',gen_random_uuid()),'PT409');
 perform pg_temp.expect_state(format('select public.cpc1_save(%L::jsonb,%L::uuid,1,%L::uuid,''Synthetic PQ test'')',jsonb_set(d,'{system}','"nitrogen"'),saved->>'id',gen_random_uuid()),'22023');
 perform pg_temp.expect_denied(format('select public.cpc1_save(%L::jsonb,null,0,%L::uuid,''Forbidden system'')',jsonb_set(d,'{system}','"nitrogen"'),gen_random_uuid()));
 perform set_config('test.saved_id',saved->>'id',true);
 perform set_config('test.saved_req',req::text,true);
 definition:=jsonb_build_object('title','Synthetic PQ run','mode','single','started_on','2026-03-01','scope',pg_temp.air_scope());
 created:=public.cpc1_run_create(definition,rr);
 assert public.cpc1_run_create(definition,rr)=created,'Run create replay changed result';
 perform set_config('test.run_request',rr::text,true);
 perform set_config('test.created_run',created->>'id',true);
 perform set_config('test.definition',definition::text,true);
 perform public.cpc1_run_evaluate((created->>'id')::uuid,d);
 saved:=public.cpc1_run_save((created->>'id')::uuid,d,(created#>>'{items,0,record_id}')::uuid,1,gen_random_uuid());
 assert (saved->>'version')::int=2,'Authorized run save failed';
 r:=public.cpc1_run_transition((created->>'id')::uuid,1,'closed','Synthetic partial run closure',gen_random_uuid());
 assert r->>'status'='closed','Authorized closure failed';
 perform pg_temp.expect_state(format('select public.cpc1_run_save(%L::uuid,%L::jsonb,%L::uuid,2,%L::uuid)',created->>'id',d,created#>>'{items,0,record_id}',gen_random_uuid()),'PT409');
 -- A partial mixed run cannot be closed even by its authorized air reader.
 perform pg_temp.expect_denied(format('select public.cpc1_run_transition(%L::uuid,1,''closed'',''Forbidden mixed close'',%L::uuid)',current_setting('test.run_id'),gen_random_uuid()));
end$test$;
reset role;
-- Revoke the Source relationship, keeping profile/session/CPC1 member active.
update public.vmp_source_objects set owner_person_id=(select id from public.vmp_performers where user_id='9c290000-0000-4000-8000-000000000002'),support_person_id=null where object_code='HT-12';
set local role authenticated;
do $test$ declare d jsonb:='{"system":"air","meta":{},"equipment":{},"forms":{},"controls":{},"trend":{}}';begin
 perform pg_temp.expect_denied(format('select public.cpc1_save(%L::jsonb,null,0,%L::uuid,''Synthetic PQ test'')',d,current_setting('test.saved_req')));
 perform pg_temp.expect_denied(format('select public.cpc1_run_create(%L::jsonb,%L::uuid)',current_setting('test.definition'),current_setting('test.run_request')));
 perform pg_temp.expect_denied(format('select public.cpc1_load(%L::uuid)',current_setting('test.saved_id')));
 assert public.cpc1_list()='[]'::jsonb,'Revoked actor still sees records';
 assert public.cpc1_history_list()='[]'::jsonb,'Revoked actor still sees history';
 assert not public.cpc1_template_access(),'Revoked actor still has template capability';
 assert not exists(select 1 from storage.objects where bucket_id='cpc1-history'and name=current_setting('test.air_path')),'Revoked actor still reads source PDF';
end$test$;
reset role;
-- A different QA now owns the same PQ and may collaborate on an open record.
select set_config('request.jwt.claim.sub','9c290000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $test$ declare saved jsonb;begin
 saved:=public.cpc1_load(current_setting('test.saved_id')::uuid);
 saved:=public.cpc1_save(saved->'data',(saved->>'id')::uuid,(saved->>'version')::int,gen_random_uuid(),'Same PQ different creator');
 assert (saved->>'version')::int=2,'Same-PQ collaborator cannot save other creator record';
end$test$;

reset role;
-- Structural binding checks and the owner-approved shared-steam OR policy.
do $test$ declare rid uuid:=current_setting('test.air_id')::uuid;oq text;nit text;begin
 select id into oq from public.vmp_plan_items where object_code='HT-12'and validation_type='OQ'and year=2026 limit 1;
 select id into nit from public.vmp_plan_items where object_code='HT-13'and validation_type='PQ'and year=2026 limit 1;
 perform pg_temp.expect_state(format('insert into cpc1_private.record_pq_links(record_id,plan_item_id,reason)values(%L::uuid,%L,''Wrong OQ'')',rid,oq),'23514');
 perform pg_temp.expect_state(format('insert into cpc1_private.record_pq_links(record_id,plan_item_id,reason)values(%L::uuid,%L,''Wrong system'')',rid,nit),'23514');
 perform pg_temp.expect_state(format('delete from cpc1_private.record_pq_links where record_id=%L::uuid',rid),'23514');
end$test$;
-- PQ rights are sufficient; legacy CPC1 membership is no longer an extra grant.
update cpc1_private.members set enabled=false where user_id in('9c290000-0000-4000-8000-000000000001','9c290000-0000-4000-8000-000000000002');
insert into cpc1_private.pq_system_objects values('steam','HT-14'),('steam','HT-15') on conflict do nothing;
insert into cpc1_private.record_pq_links(record_id,plan_item_id,reason)
select r.id,p.id,'Shared steam test setup'
from public.cpc1_records r cross join public.vmp_plan_items p
where r.system='steam'and p.object_code in('HT-14','HT-15')and p.validation_type='PQ'and p.year=2026
on conflict do nothing;
select set_config('test.steam_id',(select id::text from public.cpc1_records where system='steam'limit 1),true);
select set_config('test.steam_path',(select source_manifest->0->>'object_path'from cpc1_private.history_imports where system='steam'limit 1),true);
update public.vmp_source_objects set owner_person_id=(select id from public.vmp_performers where user_id='9c290000-0000-4000-8000-000000000001'),support_person_id=null where object_code='HT-14';
update public.vmp_source_objects set owner_person_id=(select id from public.vmp_performers where user_id='9c290000-0000-4000-8000-000000000002'),support_person_id=null where object_code='HT-15';
select set_config('request.jwt.claim.sub','9c290000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $test$ declare d jsonb:='{"meta":{},"equipment":{},"bm01":{},"bm02":{},"bm03":{},"bm04":{}}';saved jsonb;req uuid:=gen_random_uuid();begin
 -- HT-14 only grants the full shared form; HT-15 is not required.
 perform public.cpc1_config();
 assert(public.cpc1_context()#>>'{systems,steam,can_enter}')::boolean,'HT14-only QA cannot enter shared steam';
 perform public.cpc1_load(current_setting('test.steam_id')::uuid);
 perform public.cpc1_evaluate(d);
 assert exists(select 1 from jsonb_array_elements(public.cpc1_history_list())h where h->>'system'='steam'),'Shared steam history missing';
 assert exists(select 1 from storage.objects where bucket_id='cpc1-templates'and name='v2/bm01.pdf'),'Shared steam template denied';
 assert exists(select 1 from storage.objects where bucket_id='cpc1-history'and name=current_setting('test.steam_path')),'Shared steam source PDF denied';
 saved:=public.cpc1_save(d,null,0,req,'Shared steam OR fixture');
 assert public.cpc1_save(d,null,0,req,'Shared steam OR fixture')=saved,'Shared steam retry changed';
 perform set_config('test.steam_new',saved->>'id',true);
 perform set_config('test.steam_request',req::text,true);
end$test$;
reset role;
do $test$ begin
 assert not(select can_view from public.vmp_item_rights('9c290000-0000-4000-8000-000000000001','HT-15/2026.01-PQ')),'Shared form must not grant the other VMP PQ itself';
 assert not cpc1_private.pq_right(array['HT-12/2026.01-PQ','HT-14/2026.01-PQ'],true),'Mixed air/steam set must not inherit steam OR';
end$test$;
-- HT-15 only independently grants access and editing of the same shared record.
select set_config('request.jwt.claim.sub','9c290000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $test$ declare saved jsonb;begin
 perform public.cpc1_config();
 assert(public.cpc1_context()#>>'{systems,steam,can_enter}')::boolean,'HT15-only QA cannot enter shared steam';
 saved:=public.cpc1_load(current_setting('test.steam_new')::uuid);
 saved:=public.cpc1_save(saved->'data',(saved->>'id')::uuid,1,gen_random_uuid(),'Shared steam OR fixture');
 assert(saved->>'version')::int=2,'HT15-only collaborator cannot edit HT14 creator record';
end$test$;
reset role;
-- Grant both then revoke one: retaining either PQ must retain access and retries.
update public.vmp_source_objects set support_person_id=(select id from public.vmp_performers where user_id='9c290000-0000-4000-8000-000000000001')where object_code='HT-15';
update public.vmp_source_objects set owner_person_id=null where object_code='HT-14';
select set_config('request.jwt.claim.sub','9c290000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $test$ declare d jsonb:='{"meta":{},"equipment":{},"bm01":{},"bm02":{},"bm03":{},"bm04":{}}';begin
 perform public.cpc1_config();perform public.cpc1_load(current_setting('test.steam_new')::uuid);
 perform public.cpc1_save(d,null,0,current_setting('test.steam_request')::uuid,'Shared steam OR fixture');
end$test$;
reset role;
-- An inactive alternative contributes no authority; the other valid PQ still works.
update public.vmp_plan_items set missing_from_sheet=true where object_code='HT-14'and validation_type='PQ'and year=2026;
set local role authenticated;
do $test$ declare d jsonb:='{"meta":{},"equipment":{},"bm01":{},"bm02":{},"bm03":{},"bm04":{}}';begin
 perform public.cpc1_config();perform public.cpc1_load(current_setting('test.steam_new')::uuid);
 perform public.cpc1_save(d,null,0,gen_random_uuid(),'One active shared steam PQ');
end$test$;
reset role;
-- Revoking the final relationship denies every shared-record surface and cache replay.
update public.vmp_source_objects set support_person_id=null where object_code='HT-15';
set local role authenticated;
do $test$ declare d jsonb:='{"meta":{},"equipment":{},"bm01":{},"bm02":{},"bm03":{},"bm04":{}}';begin
 perform pg_temp.expect_denied('select public.cpc1_config()');
 perform pg_temp.expect_denied(format('select public.cpc1_load(%L::uuid)',current_setting('test.steam_new')));
 perform pg_temp.expect_denied(format('select public.cpc1_save(%L::jsonb,null,0,%L::uuid,''Shared steam OR fixture'')',d,current_setting('test.steam_request')));
 assert not exists(select 1 from jsonb_array_elements(public.cpc1_history_list())h where h->>'system'='steam'),'Revoked shared steam history leaked';
 assert not exists(select 1 from storage.objects where bucket_id='cpc1-history'and name=current_setting('test.steam_path')),'Revoked steam PDF leaked';
 assert not exists(select 1 from storage.objects where bucket_id='cpc1-templates'and name='v2/bm01.pdf'),'Revoked steam template leaked';
end$test$;
reset role;
-- A relationship to an inactive PQ alone is not sufficient.
update public.vmp_source_objects set owner_person_id=(select id from public.vmp_performers where user_id='9c290000-0000-4000-8000-000000000001')where object_code='HT-14';
set local role authenticated;
select pg_temp.expect_denied('select public.cpc1_config()');
reset role;
-- Existing admin and QA-manager semantics are inherited, not reassigned in production.
savepoint role_matrix;
update public.profiles set role='admin' where id='9c290000-0000-4000-8000-000000000001';
set local role authenticated;
do $test$ begin
 assert(public.cpc1_context()#>>'{systems,nitrogen,can_enter}')::boolean,'Admin lost canonical PQ access';
 perform public.cpc1_load(current_setting('test.nitrogen_id')::uuid);
end$test$;
reset role;
update public.profiles set role='qa_manager'where id='9c290000-0000-4000-8000-000000000001';
update public.vmp_performers set access_class='qa_manager'where user_id='9c290000-0000-4000-8000-000000000001';
set local role authenticated;
do $test$ begin
 assert(public.cpc1_context()#>>'{systems,nitrogen,can_enter}')::boolean,'QA manager lost canonical PQ access';
 perform public.cpc1_load(current_setting('test.nitrogen_id')::uuid);
end$test$;
reset role;
-- Login viewer cannot enter this QA module even when a Source relationship exists.
update public.profiles set role='viewer'where id='9c290000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.expect_denied('select public.cpc1_context()');
reset role;
rollback to role_matrix;
update public.profiles set is_active=false where id='9c290000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.expect_denied('select public.cpc1_context()');
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select pg_temp.expect_denied('select public.cpc1_list()');
select pg_temp.expect_denied('select public.cpc1_config()');
reset role;
do $test$ begin
 assert not has_table_privilege('authenticated','public.cpc1_records','SELECT,INSERT,UPDATE,DELETE'),'Direct record table privilege';
 assert not has_table_privilege('authenticated','cpc1_private.record_pq_links','SELECT,INSERT,UPDATE,DELETE'),'Direct binding privilege';
 assert not has_function_privilege('authenticated','cpc1_private.save_pq(jsonb,uuid,integer,uuid,text,integer)','EXECUTE'),'Private writer exposed';
 assert not has_function_privilege('authenticated','cpc1_private.pq_right(text[],boolean)','EXECUTE'),'Private predicate exposed';
end$test$;
rollback;

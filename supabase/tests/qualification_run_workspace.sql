-- Disposable PostgreSQL17 restored clone only. All test data rolls back.
begin;
set local statement_timeout='40s';set local lock_timeout='4s';set local plpgsql.check_asserts=on;
create function pg_temp.expect_state(q text,expected text) returns void language plpgsql as $$
begin execute q;raise exception 'Expected SQLSTATE % but statement succeeded',expected;
exception when others then if sqlstate<>expected then raise;end if;end$$;
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
where object_code in ('HT-12','HT-14');

select set_config('request.jwt.claim.sub','9c290000-0000-4000-8000-000000000001',true);
set local role authenticated;
-- RED baseline: current code accepts an unbound new record without run/calibration.
select pg_temp.expect_state($q$select public.cpc1_save('{"system":"air","meta":{},"equipment":{},"forms":{},"controls":{},"trend":{}}',null,0,gen_random_uuid(),'UNBOUND MUST FAIL')$q$,'23514');
select pg_temp.expect_state($q$select public.cpc1_evaluate('{"system":"air","meta":{},"equipment":{},"forms":{},"controls":{},"trend":{}}')$q$,'23514');
do $test$
declare cfg jsonb:=public.cpc1_gas_config('air');f jsonb;point text;scope jsonb;reqs jsonb;cal jsonb;def jsonb;r jsonb;record_id uuid;run_id uuid;d jsonb;save1 jsonb;save2 jsonb;h jsonb;request uuid:=gen_random_uuid();update_request uuid:=gen_random_uuid();v int;begin
 select x into f from jsonb_array_elements(cfg->'forms')x where x->>'id'='bm02';point:=f->'locations'->0->>'id';
 scope:=jsonb_build_array(jsonb_build_object('system','air','forms',jsonb_build_object('bm02',jsonb_build_array(point))));
 reqs:=public.cpc1_run_requirements(scope);
 assert jsonb_array_length(reqs)=1 and reqs#>>'{0,key}'='air:bm02:expiry','Wrong device requirements';
 assert reqs#>'{0,payload_path}'='["equipment","bm02","expiry"]','Wrong calibration payload path';
 cal:=jsonb_build_object('air:bm02:expiry',jsonb_build_object('name','Thiết bị test','due_on','2026-12-31'));
 def:=jsonb_build_object('title','RUN WORKSPACE SYNTHETIC','mode','single','started_on','2026-09-29','scope',scope);
 perform pg_temp.expect_state(format('select public.cpc1_run_create(%L::jsonb,gen_random_uuid())',def::text),'23514');
 perform pg_temp.expect_state(format('select public.cpc1_run_create(%L::jsonb,gen_random_uuid())',(def||jsonb_build_object('calibration',jsonb_set(cal,'{air:bm02:expiry,due_on}','"2026-02-30"')))::text),'23514');
 def:=def||jsonb_build_object('calibration',cal);
 r:=public.cpc1_run_create(def,request);perform set_config('test.workspace_create_id',request::text,true);perform set_config('test.workspace_definition',def::text,true);assert r=public.cpc1_run_create(def,request),'Create replay differs';
 run_id:=(r->>'id')::uuid;perform set_config('test.workspace_run',run_id::text,true);record_id:=(r#>>'{items,0,record_id}')::uuid;
 assert r->'calibration'=cal,'Run metadata missing';
 perform pg_temp.expect_state(format('select public.cpc1_point_history(%L,''bm02'',''outside-scope'')',record_id),'42501');
 perform pg_temp.expect_state(format('select public.cpc1_run_save(%L,''{"system":"nitrogen"}''::jsonb,%L,1,gen_random_uuid(),null)',run_id,record_id),'42501');
 d:=public.cpc1_run_load(run_id,record_id)->'data';assert d#>>'{equipment,bm02,expiry}'='2026-12-31','Device date not seeded';
 d:=jsonb_set(d,'{forms}',jsonb_build_object('bm02',jsonb_build_object(point,jsonb_build_object('dewpoint','-40','execution_date','2026-09-29'))));
 request:=gen_random_uuid();save1:=public.cpc1_run_save(run_id,d,record_id,1,request,null);
 assert(save1->>'version')::int=2;
 assert public.cpc1_run_save(run_id,d,record_id,1,request,null)=save1,'Save replay differs';
 perform pg_temp.expect_state(format('select public.cpc1_run_save(%L,%L::jsonb,%L,1,%L,%L)',run_id,d::text,record_id,request,'different reason'),'23505');
 -- Previously saved -40 -> -41 requires server-detected correction reason.
 d:=jsonb_set(d,array['forms','bm02',point,'dewpoint'],'"-41"');
 perform pg_temp.expect_state(format('select public.cpc1_run_save(%L,%L::jsonb,%L,2,gen_random_uuid(),null)',run_id,d::text,record_id),'23514');
 assert(public.cpc1_load(record_id)->>'version')::int=2,'Rejected correction wrote a revision';
 save2:=public.cpc1_run_save(run_id,d,record_id,2,gen_random_uuid(),'Đính chính số đọc');assert(save2->>'version')::int=3;
 h:=public.cpc1_point_history(record_id,'bm02',point);
 assert jsonb_array_length(h)=2,'Expected initial point entry and correction history';
 assert h#>'{0,measurement_dates}'='["2026-09-29"]','History measurement date missing';
 assert h#>>'{0,reason}'='Đính chính số đọc','History reason missing';
 assert h#>'{0,changes,0,path}'=to_jsonb(array['forms','bm02',point,'dewpoint']),'History path differs';
 assert h#>>'{0,changes,0,before}'='-40' and h#>>'{0,changes,0,after}'='-41','History lost previous value';
 -- No change is a no-op; zero remains a real saved value, clearing is a correction.
 save2:=public.cpc1_run_save(run_id,d,record_id,3,gen_random_uuid(),null);assert(save2->>'version')::int=3,'No-op must not create history';
 d:=jsonb_set(d,array['forms','bm02',point,'dewpoint'],'""');
 perform pg_temp.expect_state(format('select public.cpc1_run_save(%L,%L::jsonb,%L,3,gen_random_uuid(),null)',run_id,d::text,record_id),'23514');
 -- Device metadata changes require reason and current run version.
 cal:=jsonb_set(cal,'{air:bm02:expiry,due_on}','"2027-01-31"');
 perform pg_temp.expect_state(format('select public.cpc1_run_calibration_update(%L,1,%L::jsonb,null,gen_random_uuid())',run_id,cal::text),'23514');
 r:=public.cpc1_run_calibration_update(run_id,1,cal,'Thay thiết bị',update_request);
 assert(r->>'version')::int=2 and r->'calibration'=cal,'Device update failed';
 assert public.cpc1_run_calibration_update(run_id,1,cal,'Thay thiết bị',update_request)=r,'Metadata retry not idempotent';
 perform public.cpc1_run_transition(run_id,2,'closed','Test only',gen_random_uuid());
 perform pg_temp.expect_state(format('select public.cpc1_run_evaluate(%L,%L::jsonb)',run_id,d::text),'PT409');
 perform pg_temp.expect_state(format('select public.cpc1_run_save(%L,%L::jsonb,%L,3,gen_random_uuid(),%L)',run_id,d::text,record_id,'test'),'PT409');
 perform pg_temp.expect_state(format('select public.cpc1_run_calibration_update(%L,3,%L::jsonb,%L,gen_random_uuid())',run_id,cal::text,'test'),'PT409');
 perform set_config('test.workspace_record',record_id::text,true);
 assert(public.cpc1_load(record_id,2)->'data')#>>array['forms','bm02',point,'dewpoint']='-40','Old revision changed';
end$test$;
-- Steam trial arrays continue over three days; zero is an existing reading.
do $steam$
declare cfg jsonb:=public.cpc1_config();point text;scope jsonb;reqs jsonb;cal jsonb;r jsonb;rid uuid;rec uuid;d jsonb;h jsonb;i int;rows jsonb:='[]';v int:=1;
begin
 point:=cfg->'locations'->0->>'id';
 scope:=jsonb_build_array(jsonb_build_object('system','steam','forms',jsonb_build_object('bm01',jsonb_build_array(point))));
 reqs:=public.cpc1_run_requirements(scope);assert reqs#>>'{0,key}'='steam:bm01:device' and reqs#>'{0,payload_path}'='[]','Generic device must stay outside evaluator payload';
 cal:='{"steam:bm01:device":{"name":"Thiết bị test hơi","due_on":"2026-12-31"}}';
 r:=public.cpc1_run_create(jsonb_build_object('title','STEAM THREE DAYS','mode','single','started_on','2026-09-29','scope',scope,'calibration',cal),gen_random_uuid());rid:=(r->>'id')::uuid;rec:=(r#>>'{items,0,record_id}')::uuid;d:=public.cpc1_run_load(rid,rec)->'data';assert d->'equipment'='{}';
 for i in 0..2 loop
  rows:=rows||jsonb_build_array(jsonb_build_object('vg',i::text,'vc','100','date',to_char(date '2026-09-29'+i,'YYYY-MM-DD')));
  d:=jsonb_set(d,'{bm01}',jsonb_build_object(point,rows));r:=public.cpc1_run_save(rid,d,rec,v,gen_random_uuid(),null);v:=(r->>'version')::int;
 end loop;
 assert v=4,'Three-day continuation failed';
 d:=jsonb_set(d,array['bm01',point,'0','vg'],'"1"');
 perform pg_temp.expect_state(format('select public.cpc1_run_save(%L,%L::jsonb,%L,4,gen_random_uuid(),null)',rid,d::text,rec),'23514');
 perform public.cpc1_run_save(rid,d,rec,4,gen_random_uuid(),'Sửa số 0 sau kiểm tra');
 h:=public.cpc1_point_history(rec,'bm01',point);assert h#>'{0,changes,0,path}'=to_jsonb(array['bm01',point,'0','vg']);assert h#>>'{0,changes,0,before}'='0';assert jsonb_array_length(h#>'{0,measurement_dates}')=3;
 scope:=jsonb_build_array(jsonb_build_object('system','steam','forms',jsonb_build_object('bm03',jsonb_build_array(point))));reqs:=public.cpc1_run_requirements(scope);assert jsonb_array_length(reqs)=2 and reqs#>>'{0,key}'='steam:bm03:balance_due' and reqs#>>'{1,key}'='steam:bm03:thermometer_due';
end$steam$;
reset role;
-- Exact creation replay must use frozen response even after current config changes.
update cpc1_private.gas_settings set config=config||'{"workspace_test_drift":true}'::jsonb where system='air';
set local role authenticated;
do $$begin assert public.cpc1_run_create(current_setting('test.workspace_definition')::jsonb,current_setting('test.workspace_create_id')::uuid)->>'id'=current_setting('test.workspace_run'),'Create retry was not frozen';end$$;
reset role;
select set_config('request.jwt.claim.sub','9c290000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.expect_state(format('select public.cpc1_point_history(%L,''bm02'',''unknown'')',current_setting('test.workspace_record')),'42501');
select pg_temp.expect_state('select public.cpc1_run_requirements(''[{"system":"air","forms":{"bm02":["unknown"]}}]'')','42501');
reset role;
do $$declare signature text;begin
 foreach signature in array array['public.cpc1_save(jsonb,uuid,integer,uuid,text)','public.cpc1_evaluate(jsonb)','public.cpc1_run_save(uuid,jsonb,uuid,integer,uuid)','public.cpc1_run_save(uuid,jsonb,uuid,integer,uuid,text)','public.cpc1_point_history(uuid,text,text)'] loop
  assert not has_function_privilege('anon',signature,'execute'),'Anonymous function exposure: '||signature;
  assert has_function_privilege('authenticated',signature,'execute'),'Authenticated RPC missing: '||signature;
 end loop;
end$$;
rollback;

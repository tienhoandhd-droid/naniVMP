\set ON_ERROR_STOP on
begin;
-- Isolated fixture database only. All mutations roll back, including users.
do $$ begin
 if current_database() not like 'vmp_chart_field_%' then raise exception 'isolated field telemetry test database required'; end if;
end $$;
create function pg_temp.check_it(value boolean,label text) returns void language plpgsql as $$ begin if value is not true then raise exception 'FAIL: %',label; end if; end $$;
select pg_temp.check_it(not has_table_privilege('authenticated','public.vmp_web_vitals','SELECT'),'no raw read');
select pg_temp.check_it(not has_table_privilege('authenticated','public.vmp_web_vitals','INSERT'),'no raw write');
select pg_temp.check_it(not has_function_privilege('anon','public.rpc_record_web_vitals(uuid,text,text,jsonb)','EXECUTE'),'anon cannot ingest');
select pg_temp.check_it(not has_function_privilege('anon','public.rpc_web_vitals_summary()','EXECUTE'),'anon cannot summarize');
select pg_temp.check_it((select relrowsecurity from pg_class where oid='public.vmp_web_vitals'::regclass),'RLS');
-- Use an existing local admin fixture; no real production identity data printed.
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',(select id from public.profiles where public.vmp_business_role(id)='admin' limit 1))::text,true);
set local role authenticated;
select pg_temp.check_it(public.rpc_record_web_vitals('00000000-0000-4000-8000-000000000001','today','desktop','[{"name":"INP","value":100}]')->>'ok'='true','valid metric');
select pg_temp.check_it(public.rpc_record_web_vitals('00000000-0000-4000-8000-000000000001','today','desktop','[{"name":"INP","value":200},{"name":"CLS","value":0}]')->>'ok'='true','upsert latest');
select pg_temp.check_it((public.rpc_web_vitals_summary()->'rows' @> '[{"metric":"INP","samples":1,"p75":200}]'),'one sample latest p75');
select pg_temp.check_it(public.rpc_record_web_vitals('00000000-0000-4000-8000-000000000002','today?email=private','desktop','[{"name":"INP","value":1}]')->>'ok'='false','private screen rejected');
select pg_temp.check_it(public.rpc_record_web_vitals('00000000-0000-4000-8000-000000000002','today','desktop','[{"name":"INP","value":1,"email":"private"}]')->>'ok'='false','extra fields rejected');
select pg_temp.check_it(public.rpc_record_web_vitals('00000000-0000-4000-8000-000000000002','today','desktop','[{"name":"INP","value":-1}]')->>'ok'='false','negative rejected');
select pg_temp.check_it(public.rpc_record_web_vitals('00000000-0000-4000-8000-000000000002','today','desktop','[{"name":"CLS","value":11}]')->>'ok'='false','range rejected');
select pg_temp.check_it(public.rpc_record_web_vitals('00000000-0000-4000-8000-000000000002','today','desktop','[{"name":"INP","value":1},{"name":"INP","value":2}]')->>'ok'='false','duplicate metric rejected');
select pg_temp.check_it(public.rpc_record_web_vitals('00000000-0000-4000-8000-000000000002','today','desktop','42')->>'ok'='false','scalar rejected');
select pg_temp.check_it(public.rpc_record_web_vitals('00000000-0000-4000-8000-000000000002','today','desktop','[42]')->>'ok'='false','scalar entry rejected');
do $$ begin for i in 1..8 loop perform public.rpc_record_web_vitals('00000000-0000-4000-8000-000000000001','today','desktop','[{"name":"INP","value":200}]'); end loop; end $$;
select pg_temp.check_it(public.rpc_record_web_vitals('00000000-0000-4000-8000-000000000001','today','desktop','[{"name":"INP","value":300}]')->>'dropped'='true','page report cap');
reset role;
-- Preserve real authorization helpers for ingestion; inactive session denial.
update public.profiles set is_active=false where id=auth.uid();
set local role authenticated;
select pg_temp.check_it(public.rpc_record_web_vitals('00000000-0000-4000-8000-000000000003','today','desktop','[{"name":"INP","value":1}]')->>'error_code'='SESSION_INACTIVE','inactive cannot ingest');
select pg_temp.check_it(public.rpc_web_vitals_summary()->>'error_code'='SESSION_INACTIVE','inactive cannot read');
reset role;
update public.profiles set is_active=true where id=auth.uid();
-- Set up a real non-admin workshop fixture via existing profile + performer.
update public.profiles set role='department_user',department='FIVE_ROLE_TEST' where id=auth.uid();
update public.vmp_performers set user_id=null where user_id=auth.uid();
insert into public.vmp_performers(employee_code,performer_name,department,user_id,is_active,access_class)
values('FIELD-TEST','Field test','FIVE_ROLE_TEST',auth.uid(),true,'workshop_staff');
select pg_temp.check_it(public.vmp_business_role(auth.uid())='workshop_staff','real workshop role');
set local role authenticated;
select pg_temp.check_it(public.rpc_record_web_vitals('00000000-0000-4000-8000-000000000004','today','desktop','[{"name":"INP","value":150}]')->>'ok'='true','active worker may ingest');
select pg_temp.check_it(public.rpc_web_vitals_summary()->>'error_code'='FORBIDDEN','worker cannot read aggregates');
reset role;
update public.profiles set role='qa_manager',department='qa' where id=auth.uid();
update public.vmp_performers set department='qa',access_class='qa_manager' where user_id=auth.uid();
select pg_temp.check_it(public.vmp_business_role(auth.uid())='qa_manager','real QA manager role');
set local role authenticated;
select pg_temp.check_it(public.rpc_web_vitals_summary()->>'ok'='true','QA manager may read aggregates');
reset role;
-- Hourly rate bound is enforced across distinct pages, not just one page ID.
insert into public.vmp_web_vitals(user_id,page_id,screen,device,metrics,reports)
select auth.uid(),gen_random_uuid(),'today','desktop','{"INP":1}',10 from generate_series(1,12);
set local role authenticated;
select pg_temp.check_it(public.rpc_record_web_vitals('00000000-0000-4000-8000-000000000005','today','desktop','[{"name":"INP","value":1}]')->>'dropped'='true','cross-page hourly cap');
reset role;
update public.vmp_web_vitals set updated_at=now()-interval '2 hours' where user_id=auth.uid();
insert into public.vmp_web_vitals(user_id,page_id,screen,device,metrics,reports,updated_at)
select auth.uid(),gen_random_uuid(),'today','desktop','{"INP":1}',10,now()-interval '2 hours' from generate_series(1,30);
select pg_temp.check_it(not exists(select 1 from public.vmp_web_vitals where user_id=auth.uid() and updated_at>now()-interval '1 hour'),'daily fixture cannot hit hourly cap');
set local role authenticated;
select pg_temp.check_it(public.rpc_record_web_vitals('00000000-0000-4000-8000-000000000006','today','desktop','[{"name":"INP","value":1}]')->>'dropped'='true','independent daily cap');
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.check_it(public.rpc_record_web_vitals('00000000-0000-4000-8000-000000000003','today','desktop','[{"name":"INP","value":1}]')->>'error_code'='SESSION_INACTIVE','empty identity denied even privileged caller');
rollback;

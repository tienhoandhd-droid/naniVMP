-- Run on a restored disposable database. Runner supplies a pg_temp.fixture JSON
-- with existing item_a/item_b (same object), admin, person_a/person_b, staff.
-- All writes, including audit records, roll back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.check_ok(v boolean, rule text) returns void language plpgsql as $$
begin if not coalesce(v,false) then raise exception 'FAILED: %',rule; end if; end $$;
select pg_temp.check_ok(to_regclass('public.vmp_execution_people') is not null,'execution storage exists');
create temp table visible_before(actor uuid primary key, dashboard jsonb, watermark jsonb);
do $$declare actor uuid; begin
  for actor in select id from public.profiles loop
    perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
    insert into visible_before values(actor,public.rpc_get_vmp_dashboard(2026,true,true),public.rpc_get_vmp_watermark(2026));
  end loop;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
end $$;
create temp table before_dashboard as select public.rpc_get_vmp_dashboard(2026,true,true) data;
create temp table protected_before as select jsonb_build_object(
 'plans',(select jsonb_agg(to_jsonb(t)order by id)from public.vmp_plan_items t),
 'source',(select jsonb_agg(to_jsonb(t)order by id)from public.vmp_source_objects t),
 'rights',(select jsonb_agg(to_jsonb(t)order by id)from public.vmp_item_assignments t)) data;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',f->>'admin')::text,true)from pg_temp.fixture;
create temp table canonical_before(data jsonb);
do $$declare d jsonb;begin
 if to_regprocedure('public.rpc_get_vmp_dashboard_v2(integer,boolean)')is not null then
   execute 'select public.rpc_get_vmp_dashboard_v2(2026,true)' into d;insert into canonical_before values(d);
 end if;
end $$;
set local role authenticated;
select pg_temp.check_ok(not has_table_privilege('authenticated','public.vmp_execution_people','SELECT'),'no direct read');
select pg_temp.check_ok(not has_table_privilege('authenticated','public.vmp_execution_people','INSERT'),'no direct write');
select pg_temp.check_ok(not has_function_privilege('authenticated','public.vmp_project_execution_people(jsonb)','EXECUTE'),'no direct projection');
select pg_temp.check_ok((public.rpc_set_item_performer_by_id(f->>'item_a',(f->>'person_a')::uuid,'test execution A')->>'ok')::boolean,'admin may assign active admin as executor')from pg_temp.fixture;
select pg_temp.check_ok((public.rpc_set_item_performer_by_id(f->>'item_b',(f->>'person_b')::uuid,'test execution B')->>'ok')::boolean,'same object different item executor')from pg_temp.fixture;
reset role;
select pg_temp.check_ok(jsonb_build_object(
 'plans',(select jsonb_agg(to_jsonb(t)order by id)from public.vmp_plan_items t),
 'source',(select jsonb_agg(to_jsonb(t)order by id)from public.vmp_source_objects t),
 'rights',(select jsonb_agg(to_jsonb(t)order by id)from public.vmp_item_assignments t))=(select data from protected_before),'plan status/dates/source/rights untouched');
select pg_temp.check_ok((select a#>>'{_raw,owner_person_id}' from jsonb_array_elements(public.rpc_get_vmp_dashboard(2026,true,true)->'activities')a where a->>'id'=f->>'item_a')=f->>'person_a','dashboard exact item identity A')from pg_temp.fixture;
select pg_temp.check_ok((select a#>>'{_raw,owner_person_id}' from jsonb_array_elements(public.rpc_get_vmp_dashboard(2026,true,true)->'activities')a where a->>'id'=f->>'item_b')=f->>'person_b','dashboard exact item identity B')from pg_temp.fixture;
-- New execution identities cannot change an actor's visible rows or any
-- progress/status/date/effort/object property. Only people and cache time vary.
do $$declare rec record; actual jsonb; old_normal jsonb; new_normal jsonb; a jsonb; b jsonb;
begin
  for rec in select * from visible_before loop
    perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',rec.actor)::text,true);
    actual:=public.rpc_get_vmp_dashboard(2026,true,true);
    perform pg_temp.check_ok((actual-'activities'-'updated_at')=(rec.dashboard-'activities'-'updated_at'),'dashboard metadata/object scope unchanged');
    select coalesce(jsonb_agg((v-'owner'-'support'-'_raw')||jsonb_build_object('_raw',(v->'_raw')-'qa'-'owner_person_id'-'email_qa'-'ho_tro'-'support_person_id')order by v->>'id'),'[]') into old_normal from jsonb_array_elements(coalesce(rec.dashboard->'activities','[]'))v;
    select coalesce(jsonb_agg((v-'owner'-'support'-'_raw')||jsonb_build_object('_raw',(v->'_raw')-'qa'-'owner_person_id'-'email_qa'-'ho_tro'-'support_person_id')order by v->>'id'),'[]') into new_normal from jsonb_array_elements(coalesce(actual->'activities','[]'))v;
    perform pg_temp.check_ok(old_normal=new_normal,'exact activity visibility and all non-person fields');
    a:=public.rpc_get_vmp_watermark(2026); b:=rec.watermark;
    perform pg_temp.check_ok((a-'updated_at')=(b-'updated_at'),'watermark counts/authorization contract unchanged');
    if not exists(select 1 from jsonb_array_elements(coalesce(actual->'activities','[]'))v,pg_temp.fixture f where v->>'id' in(f.f->>'item_a',f.f->>'item_b')) then
      perform pg_temp.check_ok(a=b,'hidden execution update does not leak through watermark');
    else
      perform pg_temp.check_ok((a->>'updated_at')::timestamptz>(b->>'updated_at')::timestamptz,'visible execution update invalidates cache');
    end if;
  end loop;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',(select f->>'admin'from pg_temp.fixture))::text,true);
end $$;
-- Same person may occupy both roles; UUID must be projected for personal filters.
update public.vmp_execution_people set support_override=true,support_person_id=primary_person_id,change_reason='same identity support alias' where item_id=(select f->>'item_a'from pg_temp.fixture);
select pg_temp.check_ok((select a#>>'{_raw,support_person_id}'from jsonb_array_elements(public.rpc_get_vmp_dashboard(2026,true,true)->'activities')a where a->>'id'=f->>'item_a')=f->>'person_a','support alias uses same stable UUID')from pg_temp.fixture;
do $$declare d jsonb; b jsonb; old_rows jsonb; new_rows jsonb; f jsonb;
begin
 if exists(select 1 from canonical_before)then
   select data into b from canonical_before;select fixture.f into f from pg_temp.fixture;
   execute 'select public.rpc_get_vmp_dashboard_v2(2026,true)' into d;
   perform pg_temp.check_ok((b-'activities'-'updated_at')=(d-'activities'-'updated_at'),'v2 metadata/KPI/object scope unchanged');
   select jsonb_agg((v-'owner'-'support'-'_raw')||jsonb_build_object('_raw',(v->'_raw')-'qa'-'owner_person_id'-'email_qa'-'ho_tro'-'support_person_id')order by v->>'id')into old_rows from jsonb_array_elements(b->'activities')v;
   select jsonb_agg((v-'owner'-'support'-'_raw')||jsonb_build_object('_raw',(v->'_raw')-'qa'-'owner_person_id'-'email_qa'-'ho_tro'-'support_person_id')order by v->>'id')into new_rows from jsonb_array_elements(d->'activities')v;
   perform pg_temp.check_ok(old_rows=new_rows,'v2 exact activity set/non-person fields');
   perform pg_temp.check_ok((select v#>>'{_raw,owner_person_id}'from jsonb_array_elements(d->'activities')v where v->>'id'=f->>'item_a')=f->>'person_a','v2 primary identity');
   perform pg_temp.check_ok((select v#>>'{_raw,support_person_id}'from jsonb_array_elements(d->'activities')v where v->>'id'=f->>'item_a')=f->>'person_a','v2 support identity');
 end if;
end $$;
select pg_temp.check_ok(exists(select 1 from public.audit_logs a,pg_temp.fixture f
  where a.table_name='vmp_execution_people' and a.validation_code=f.f->>'item_a'
    and a.user_id=(f.f->>'admin')::uuid and a.change_reason='test execution A'
    and a.old_data is null and a.new_data->>'primary_person_id'=f.f->>'person_a'
    and a.source='dashboard_rpc'),'audit attributable insertion');
select pg_temp.check_ok(exists(select 1 from public.audit_logs a,pg_temp.fixture f
  where a.table_name='vmp_execution_people' and a.validation_code=f.f->>'item_a'
    and a.change_reason='same identity support alias' and a.old_data is not null
    and a.changed_fields=array['support_override','support_person_id']
    and a.new_data->>'support_person_id'=f.f->>'person_a'),'audit exact changed fields');
create temp table stored_before as select jsonb_agg(to_jsonb(t)order by item_id)data from public.vmp_execution_people t;
create temp table audits_before as select count(*)n from public.audit_logs;
select public.rpc_set_item_performer_by_id(f->>'item_a',(f->>'person_a')::uuid,'retry same value')from pg_temp.fixture;
select pg_temp.check_ok((select jsonb_agg(to_jsonb(t)order by item_id)from public.vmp_execution_people t)=(select data from stored_before),'retry no timestamp/version change');
select pg_temp.check_ok((select count(*)from public.audit_logs)=(select n from audits_before),'retry no duplicate audit');
select public.rpc_set_item_performer_by_id(f->>'item_a',null,'explicit clear')from pg_temp.fixture;
select pg_temp.check_ok((select a->>'owner' from jsonb_array_elements(public.rpc_get_vmp_dashboard(2026,true,true)->'activities')a where a->>'id'=f->>'item_a')='—','explicit clear does not fall back to Source')from pg_temp.fixture;
select pg_temp.check_ok(public.rpc_set_item_performer_by_id(f->>'item_a',(f->>'person_a')::uuid,'')->>'error_code'='REASON_REQUIRED','reason required')from pg_temp.fixture;
select pg_temp.check_ok(public.rpc_set_item_performer_by_id('NONEXISTENT/2026.01-PQ',(f->>'person_a')::uuid,'test')->>'error_code'='ITEM_NOT_FOUND','unknown item denied')from pg_temp.fixture;
savepoint target_inactive;
update public.vmp_performers set is_active=false where id=(select (f->>'person_a')::uuid from pg_temp.fixture);
select pg_temp.check_ok(public.rpc_set_item_performer_by_id(f->>'item_a',(f->>'person_a')::uuid,'inactive target')->>'error_code'='PERSON_NOT_ACTIVE','inactive target denied')from pg_temp.fixture;
rollback to target_inactive;
-- Reversal to inheritance remains distinct from explicit clear.
update public.vmp_execution_people set primary_override=false,primary_person_id=null,change_reason='revert to inherited display' where item_id=(select f->>'item_a'from pg_temp.fixture);
select pg_temp.check_ok((select a->>'owner'from jsonb_array_elements(public.rpc_get_vmp_dashboard(2026,true,true)->'activities')a where a->>'id'=f->>'item_a')=(select coalesce(nullif(btrim(owner_name),''),'—')from public.vmp_plan_items where validation_code=f->>'item_a'),'false override inherits canonical display')from pg_temp.fixture;
-- A failed audit write must roll back the whole assignment.
savepoint audit_failure;
create function pg_temp.reject_execution_audit() returns trigger language plpgsql as $$begin if new.table_name='vmp_execution_people' then raise exception 'test audit unavailable';end if;return new;end $$;
create trigger reject_execution_test before insert on public.audit_logs for each row execute function pg_temp.reject_execution_audit();
select pg_temp.check_ok(public.rpc_set_item_performer_by_id(f->>'item_a',(f->>'person_a')::uuid,'fail audit')->>'error_code'='ASSIGNMENT_FAILED','audit failure fails assignment')from pg_temp.fixture;
select pg_temp.check_ok(not primary_override,'audit failure leaves execution row unchanged')from public.vmp_execution_people where item_id=(select f->>'item_a'from pg_temp.fixture);
rollback to audit_failure;
savepoint qa_manager_scope;
update public.profiles set role='qa_manager',department='qa' where id=(select (f->>'staff')::uuid from pg_temp.fixture);
update public.vmp_performers set access_class='qa_manager',department='qa' where id=(select (f->>'staff_person')::uuid from pg_temp.fixture);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',f->>'staff')::text,true)from pg_temp.fixture;
select pg_temp.check_ok(public.rpc_set_item_performer_by_id(f->>'item_a',(f->>'outside_person')::uuid,'out of department')->>'error_code'='PERSON_OUT_OF_SCOPE','QA manager retains department restriction')from pg_temp.fixture;
rollback to qa_manager_scope;
savepoint inactive_actor;
update public.profiles set is_active=false where id=(select (f->>'admin')::uuid from pg_temp.fixture);
select pg_temp.check_ok(public.rpc_set_item_performer_by_id(f->>'item_a',(f->>'person_a')::uuid,'inactive actor')->>'ok'='false','inactive actor denied by public session wrapper')from pg_temp.fixture;
rollback to inactive_actor;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',f->>'staff')::text,true)from pg_temp.fixture;
set local role authenticated;
select pg_temp.check_ok(public.rpc_set_item_performer_by_id(f->>'item_a',(f->>'person_a')::uuid,'test denied')->>'error_code'='FORBIDDEN','staff cannot assign execution people')from pg_temp.fixture;
reset role;
select pg_temp.check_ok(not has_function_privilege('anon','public.rpc_set_item_performer_by_id(text,uuid,text)','EXECUTE'),'anonymous writer denied');
select pg_temp.check_ok(not has_function_privilege('anon','public.vmp_project_execution_people(jsonb)','EXECUTE'),'anonymous helper denied');
rollback;

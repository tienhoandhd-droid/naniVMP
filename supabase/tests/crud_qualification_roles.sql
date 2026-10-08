\set ON_ERROR_STOP on
begin;

-- Own this FK fixture so a fresh production clone needs no pre-seeding.
insert into public.departments(id,name,short_name)
values('QA','QA rollback fixture','QAU') on conflict(id) do nothing;
set local statement_timeout='60s'; set local lock_timeout='5s';

create function pg_temp.must_state(q text,s text,id text) returns void language plpgsql as $$
begin execute q; raise exception '% unexpectedly succeeded',id;
exception when others then if sqlstate<>s then raise exception '% expected %, got %: %',id,s,sqlstate,sqlerrm; end if;
raise notice 'PASS %',id; end$$;
create function pg_temp.actor(u uuid) returns void language sql as $$select set_config('request.jwt.claim.sub',u::text,true)$$;
create function pg_temp.scope_for(sys text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f jsonb;p text;fid text:=case when sys='steam' then 'bm01' when sys='nitrogen' then 'bm05' else 'bm02' end;begin
 if sys='steam' then select config->'locations'->0->>'id' into p from cpc1_private.settings where id;
 else select x into f from cpc1_private.gas_settings g cross join lateral jsonb_array_elements(g.config->'forms')x where g.system=sys and x->>'id'=fid;
 p:=f->'locations'->0->>'id'; end if;
 return jsonb_build_array(jsonb_build_object('system',sys,'forms',jsonb_build_object(fid,jsonb_build_array(p))));end$$;
create function pg_temp.calibration(sc jsonb) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(x->>'key',jsonb_build_object('name','SYNTHETIC TEST DEVICE','due_on','2026-12-31')),'{}')
 from jsonb_array_elements(public.cpc1_run_requirements(sc))x $$;
create function pg_temp.definition(sys text,title text) returns jsonb language sql stable as $$
 select jsonb_build_object('title',title,'mode','single','started_on','2026-10-08','scope',pg_temp.scope_for(sys),
 'calibration',pg_temp.calibration(pg_temp.scope_for(sys)))$$;
create function pg_temp.measured(d jsonb,sys text,val text) returns jsonb language plpgsql stable as $$
declare sc jsonb:=pg_temp.scope_for(sys);fid text:=case when sys='steam' then 'bm01' when sys='nitrogen' then 'bm05' else 'bm02' end;
 p text;begin p:=sc#>>array['0','forms',fid,'0'];
 if sys='steam' then return d||jsonb_build_object('bm01',coalesce(d->'bm01','{}')||jsonb_build_object(p,
   jsonb_build_array(jsonb_build_object('vg',val,'vc','100','date','2026-10-08'))));
 elsif sys='nitrogen' then return d||jsonb_build_object('forms',coalesce(d->'forms','{}')||jsonb_build_object('bm05',
   coalesce(d#>'{forms,bm05}','{}')||jsonb_build_object(p,jsonb_build_object('purity',val,'executed_by','SYNTHETIC','execution_date','2026-10-08'))));
 else return d||jsonb_build_object('forms',coalesce(d->'forms','{}')||jsonb_build_object('bm02',
   coalesce(d#>'{forms,bm02}','{}')||jsonb_build_object(p,jsonb_build_object('dewpoint',val,'executed_by','SYNTHETIC','execution_date','2026-10-08'))));end if;end$$;
create function pg_temp.measured_value(d jsonb,sys text) returns text language plpgsql stable as $$
declare sc jsonb:=pg_temp.scope_for(sys);p text;begin p:=sc#>>array['0','forms',case when sys='steam' then 'bm01' when sys='nitrogen' then 'bm05' else 'bm02' end,'0'];
 if sys='steam' then return d#>>array['bm01',p,'0','vg']; elsif sys='nitrogen' then return d#>>array['forms','bm05',p,'purity'];
 else return d#>>array['forms','bm02',p,'dewpoint'];end if;end$$;
create function pg_temp.audit_snapshot(rec uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('revisions',(select count(*) from public.cpc1_revisions where record_id=rec),
 'entries',(select count(*) from cpc1_private.entry_events where record_id=rec),
 'revision_rows',(select coalesce(jsonb_agg(to_jsonb(r) order by version),'[]') from public.cpc1_revisions r where record_id=rec),
 'entry_rows',(select coalesce(jsonb_agg(to_jsonb(e) order by created_at,version),'[]') from cpc1_private.entry_events e where record_id=rec))$$;
create function pg_temp.run_audit(rid uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(e) order by created_at,id),'[]') from cpc1_private.run_events e where run_id=rid $$;
create function pg_temp.latest_entry(rec uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(e) from cpc1_private.entry_events e where record_id=rec order by version desc limit 1 $$;
create function pg_temp.effect_digest(rid uuid,rec uuid)returns text language sql stable security definer set search_path=''as $$select md5(jsonb_build_array(
 (select to_jsonb(r)from cpc1_private.runs r where id=rid),(select jsonb_agg(to_jsonb(x)order by version)from public.cpc1_revisions x where record_id=rec),
 (select jsonb_agg(to_jsonb(x)order by version)from cpc1_private.entry_events x where record_id=rec),(select jsonb_agg(to_jsonb(x)order by id)from cpc1_private.run_events x where run_id=rid))::text)$$;

insert into public.vmp_email_cho_phep(email,ghi_chu) select email,'PQ role rollback fixture' from(values
 ('crud-pq-admin@example.test'),('crud-pq-manager@example.test'),('crud-pq-staff@example.test'),
 ('crud-pq-workshop-manager@example.test'),('crud-pq-workshop-staff@example.test'),('crud-pq-inactive@example.test'))x(email)
on conflict(email)do update set is_active=true;
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'authenticated','authenticated',email,'x',now(),'{}','{}',now(),now() from(values
 ('a8300000-0000-4000-8000-000000000001'::uuid,'crud-pq-admin@example.test'),
 ('a8300000-0000-4000-8000-000000000002','crud-pq-manager@example.test'),
 ('a8300000-0000-4000-8000-000000000003','crud-pq-staff@example.test'),
 ('a8300000-0000-4000-8000-000000000004','crud-pq-workshop-manager@example.test'),
 ('a8300000-0000-4000-8000-000000000005','crud-pq-workshop-staff@example.test'),
 ('a8300000-0000-4000-8000-000000000006','crud-pq-inactive@example.test'))x(id,email);
insert into public.departments(id,name,short_name) values('SAN XUAT','Sản xuất synthetic','SX') on conflict(id)do nothing;
insert into public.profiles(id,full_name,email,role,department,is_active) values
 ('a8300000-0000-4000-8000-000000000001','CRUD PQ Admin','crud-pq-admin@example.test','admin',null,true),
 ('a8300000-0000-4000-8000-000000000002','CRUD PQ Manager','crud-pq-manager@example.test','qa_manager','QA',true),
 ('a8300000-0000-4000-8000-000000000003','CRUD PQ Staff','crud-pq-staff@example.test','department_user','QA',true),
 ('a8300000-0000-4000-8000-000000000004','CRUD PQ Workshop Manager','crud-pq-workshop-manager@example.test','department_user','SAN XUAT',true),
 ('a8300000-0000-4000-8000-000000000005','CRUD PQ Workshop Staff','crud-pq-workshop-staff@example.test','department_user','SAN XUAT',true),
 ('a8300000-0000-4000-8000-000000000006','CRUD PQ Inactive','crud-pq-inactive@example.test','qa_manager','QA',false)
on conflict(id)do update set full_name=excluded.full_name,email=excluded.email,role=excluded.role,department=excluded.department,is_active=excluded.is_active;
update public.vmp_performers set department='QA',access_class='qa_manager',is_active=true where user_id='a8300000-0000-4000-8000-000000000002';
update public.vmp_performers set department='QA',access_class='qa_progress_editor',is_active=true where user_id='a8300000-0000-4000-8000-000000000003';
update public.vmp_performers set department='SAN XUAT',access_class='equipment_manager',is_active=true where user_id='a8300000-0000-4000-8000-000000000004';
update public.vmp_performers set department='SAN XUAT',access_class='workshop_staff',is_active=true where user_id='a8300000-0000-4000-8000-000000000005';
update public.vmp_performers set department='QA',access_class='qa_manager',is_active=false where user_id='a8300000-0000-4000-8000-000000000006';
insert into cpc1_private.members(user_id,enabled,reason) select id,true,'PQ role rollback fixture' from auth.users where id::text like 'a8300000-%';
update public.vmp_source_objects set owner_person_id=(select id from public.vmp_performers where user_id='a8300000-0000-4000-8000-000000000003'),support_person_id=null
where object_code in('HT-12','HT-13','HT-14','HT-15');
do $$declare x record;begin for x in select * from(values
 ('a8300000-0000-4000-8000-000000000001'::uuid,'admin'),('a8300000-0000-4000-8000-000000000002','qa_manager'),
 ('a8300000-0000-4000-8000-000000000003','qa_staff'),('a8300000-0000-4000-8000-000000000004','workshop_manager'),
 ('a8300000-0000-4000-8000-000000000005','workshop_staff'))z(uid,want)loop
 assert public.vmp_business_role(x.uid) is not distinct from x.want,'PQ_FIXTURE_ROLE_'||x.want;end loop;end$$;

set local role authenticated;
-- Canonical writers each exercise one real system. Save/replay/version,
-- calibration/replay, correction reason, closure and frozen-state denial.
do $$declare x record;r jsonb;rid uuid;rec uuid;d jsonb;s jsonb;v int;q uuid;cal jsonb;snap jsonb;ev jsonb;before_val text;after_val text;begin
 for x in select r.*,s.sys from(values
 ('a8300000-0000-4000-8000-000000000001'::uuid,'admin'),
 ('a8300000-0000-4000-8000-000000000002'::uuid,'qa_manager'),
 ('a8300000-0000-4000-8000-000000000003'::uuid,'qa_staff'))r(uid,label)
 cross join(values('steam'),('air'),('nitrogen'))s(sys) loop
  perform pg_temp.actor(x.uid);q:=gen_random_uuid();r:=public.cpc1_run_create(pg_temp.definition(x.sys,'CRUD PQ '||x.label),q);
  assert r is not distinct from public.cpc1_run_create(pg_temp.definition(x.sys,'CRUD PQ '||x.label),q),'PQ_'||upper(x.label)||'_CREATE_REPLAY';
  rid:=(r->>'id')::uuid;rec:=(r#>>'{items,0,record_id}')::uuid;d:=public.cpc1_run_load(rid,rec)->'data';
  d:=pg_temp.measured(d,x.sys,case when x.sys='nitrogen' then '99.95' when x.sys='steam' then '0' else '-40' end);
  q:=gen_random_uuid();s:=public.cpc1_run_save(rid,d,rec,1,q,null);v:=(s->>'version')::int;
  assert (v=2 and pg_temp.measured_value(public.cpc1_run_load(rid,rec)->'data',x.sys)=
    case when x.sys='nitrogen' then '99.95' when x.sys='steam' then '0' else '-40' end) is true,
    'PQ_'||upper(x.label)||'_INITIAL_SAVE_READBACK';
  assert s is not distinct from public.cpc1_run_save(rid,d,rec,1,q,null),'PQ_'||upper(x.label)||'_SAVE_REPLAY';
  perform pg_temp.must_state(format('select public.cpc1_run_save(%L,%L::jsonb,%L,1,gen_random_uuid(),null)',rid,d::text,rec),'PT409','PQ_'||upper(x.label)||'_STALE_VERSION');
  d:=pg_temp.measured(d,x.sys,case when x.sys='nitrogen' then '99.96' when x.sys='steam' then '1' else '-41' end);
  perform pg_temp.must_state(format('select public.cpc1_run_save(%L,%L::jsonb,%L,%s,gen_random_uuid(),null)',rid,d::text,rec,v),'23514','PQ_'||upper(x.label)||'_CORRECTION_REASON');
  s:=public.cpc1_run_save(rid,d,rec,v,gen_random_uuid(),'Đính chính synthetic');v:=(s->>'version')::int;
  cal:=r->'calibration';cal:=jsonb_set(cal,array[(select key from jsonb_each(cal)limit 1),'due_on'],'"2027-01-31"');
  perform pg_temp.must_state(format('select public.cpc1_run_calibration_update(%L,1,%L::jsonb,null,gen_random_uuid())',rid,cal::text),'23514','PQ_'||upper(x.label)||'_CAL_REASON');
  q:=gen_random_uuid();s:=public.cpc1_run_calibration_update(rid,1,cal,'Đổi thiết bị synthetic',q);
  assert s is not distinct from public.cpc1_run_calibration_update(rid,1,cal,'Đổi thiết bị synthetic',q),'PQ_'||upper(x.label)||'_CAL_REPLAY';
  snap:=pg_temp.audit_snapshot(rec);assert ((snap->>'revisions')::int>=2 and (snap->>'entries')::int>=1) is true,'PQ_'||upper(x.label)||'_AUDIT_PRESENT';
  before_val:=case when x.sys='nitrogen' then '99.95' when x.sys='steam' then '0' else '-40' end;
  after_val:=case when x.sys='nitrogen' then '99.96' when x.sys='steam' then '1' else '-41' end;ev:=pg_temp.latest_entry(rec);
  assert (ev->>'actor_id'=x.uid::text and ev->>'reason'='Đính chính synthetic'
    and exists(select 1 from jsonb_array_elements(ev->'changes')c where c->>'before'=before_val and c->>'after'=after_val)) is true,
    'PQ_'||upper(x.label)||'_AUDIT_ACTOR_BEFORE_AFTER_REASON';
  s:=public.cpc1_run_transition(rid,2,'closed','Đóng synthetic',gen_random_uuid());assert (s->>'status'='closed') is true,'PQ_'||upper(x.label)||'_CLOSE';
  assert (pg_temp.run_audit(rid)::text like '%'||x.uid::text||'%' and pg_temp.run_audit(rid)::text like '%Đóng synthetic%') is true,'PQ_'||upper(x.label)||'_CLOSE_AUDIT';
  perform pg_temp.must_state(format('select public.cpc1_run_save(%L,%L::jsonb,%L,%s,gen_random_uuid(),null)',rid,d::text,rec,v),'PT409','PQ_'||upper(x.label)||'_CLOSED_SAVE');
end loop;end$$;

-- Build one valid open run, then prove every denied persona cannot save,
-- change calibration, or transition it and leaves all evidence unchanged.
select pg_temp.actor('a8300000-0000-4000-8000-000000000001');
do $$declare r jsonb;rid uuid;rec uuid;d jsonb;begin r:=public.cpc1_run_create(pg_temp.definition('air','DENIAL CONTROL OPEN'),gen_random_uuid());
 rid:=(r->>'id')::uuid;rec:=(r#>>'{items,0,record_id}')::uuid;d:=public.cpc1_run_load(rid,rec)->'data';
 perform set_config('test.pq.deny_run',rid::text,true);perform set_config('test.pq.deny_record',rec::text,true);
 perform set_config('test.pq.deny_data',d::text,true);perform set_config('test.pq.deny_cal',(r->'calibration')::text,true);end$$;

-- Immutable evidence tables are observable only through RPCs; authenticated
-- callers cannot rewrite or erase their history directly.
select pg_temp.must_state('delete from cpc1_private.entry_events','42501','PQ_AUDIT_ENTRY_DELETE_DENIED');
select pg_temp.must_state('update public.cpc1_revisions set payload=''{}''::jsonb','42501','PQ_AUDIT_REVISION_UPDATE_DENIED');

-- Membership never grants workshop roles or inactive accounts authority.
do $$declare x record;begin for x in select * from(values
 ('a8300000-0000-4000-8000-000000000004'::uuid,'WORKSHOP_MANAGER','42501'),
 ('a8300000-0000-4000-8000-000000000005'::uuid,'WORKSHOP_STAFF','42501'),
 ('a8300000-0000-4000-8000-000000000006'::uuid,'INACTIVE','42501'))z(uid,label,state)loop
 perform pg_temp.actor(x.uid);perform pg_temp.must_state('select public.cpc1_run_create(''{}''::jsonb,gen_random_uuid())',x.state,'PQ_'||x.label||'_CREATE_DENIED');end loop;end$$;

do $$declare x record;q text;before_state text;rid uuid:=current_setting('test.pq.deny_run')::uuid;rec uuid:=current_setting('test.pq.deny_record')::uuid;begin
 for x in select * from(values('a8300000-0000-4000-8000-000000000004'::uuid,'WORKSHOP_MANAGER'),
 ('a8300000-0000-4000-8000-000000000005','WORKSHOP_STAFF'),('a8300000-0000-4000-8000-000000000006','INACTIVE'))z(uid,label)loop
  perform pg_temp.actor(x.uid);before_state:=pg_temp.effect_digest(rid,rec);
  perform pg_temp.must_state(format('select public.cpc1_run_save(%L,%L::jsonb,%L,1,gen_random_uuid(),null)',rid,current_setting('test.pq.deny_data'),rec),'42501','PQ_'||x.label||'_SAVE_DENIED');
  perform pg_temp.must_state(format('select public.cpc1_run_calibration_update(%L,1,%L::jsonb,%L,gen_random_uuid())',rid,current_setting('test.pq.deny_cal'),'denied'),'42501','PQ_'||x.label||'_CAL_DENIED');
  perform pg_temp.must_state(format('select public.cpc1_run_transition(%L,1,%L,%L,gen_random_uuid())',rid,'closed','denied'),'42501','PQ_'||x.label||'_CLOSE_DENIED');
  assert pg_temp.effect_digest(rid,rec)=before_state,'PQ_'||x.label||'_MUTATIONS_NO_EFFECT';
 end loop;end$$;

reset role;set local role anon;
select pg_temp.must_state('select public.cpc1_run_create(''{}''::jsonb,gen_random_uuid())','42501','PQ_ANON_CREATE_DENIED');
select pg_temp.must_state(format('select public.cpc1_run_save(%L,%L::jsonb,%L,1,gen_random_uuid(),null)',current_setting('test.pq.deny_run'),current_setting('test.pq.deny_data'),current_setting('test.pq.deny_record')),'42501','PQ_ANON_SAVE_DENIED');
select pg_temp.must_state(format('select public.cpc1_run_calibration_update(%L,1,%L::jsonb,%L,gen_random_uuid())',current_setting('test.pq.deny_run'),current_setting('test.pq.deny_cal'),'denied'),'42501','PQ_ANON_CAL_DENIED');
select pg_temp.must_state(format('select public.cpc1_run_transition(%L,1,%L,%L,gen_random_uuid())',current_setting('test.pq.deny_run'),'closed','denied'),'42501','PQ_ANON_CLOSE_DENIED');
reset role;
do $$declare sig text;begin foreach sig in array array['public.cpc1_run_create(jsonb,uuid)','public.cpc1_run_save(uuid,jsonb,uuid,integer,uuid,text)','public.cpc1_run_calibration_update(uuid,integer,jsonb,text,uuid)','public.cpc1_run_transition(uuid,integer,text,text,uuid)']loop
 assert not has_function_privilege('anon',sig,'EXECUTE'),'PQ_ANON_ACL_'||sig;end loop;end$$;
rollback;

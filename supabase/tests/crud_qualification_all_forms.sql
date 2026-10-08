\set ON_ERROR_STOP on
begin;

-- Own this FK fixture so a fresh production clone needs no pre-seeding.
insert into public.departments(id,name,short_name)
values('QA','QA rollback fixture','QAU') on conflict(id) do nothing;
set local statement_timeout='120s';set local lock_timeout='5s';
create function pg_temp.actor(u uuid)returns void language sql as $$select set_config('request.jwt.claim.sub',u::text,true)$$;
create function pg_temp.must_state(q text,s text,id text)returns void language plpgsql as $$begin execute q;raise exception '% succeeded',id;
exception when others then if sqlstate<>s then raise;end if;raise notice 'PASS %',id;end$$;
create function pg_temp.cfg(sys text)returns jsonb language sql stable security definer set search_path='' as $$
 select case when sys='steam'then(select config from cpc1_private.settings where id)
 else(select config from cpc1_private.gas_settings where system=sys)end$$;
create function pg_temp.scope_one(sys text,fid text,p text)returns jsonb language sql immutable as $$
 select jsonb_build_array(jsonb_build_object('system',sys,'forms',jsonb_build_object(fid,jsonb_build_array(p))))$$;
create function pg_temp.cal(sc jsonb)returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(x->>'key',jsonb_build_object('name','SYNTHETIC ALL FORMS','due_on','2026-12-31')),'{}')
 from jsonb_array_elements(public.cpc1_run_requirements(sc))x$$;
create function pg_temp.entry(rec uuid,v int)returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(e)from cpc1_private.entry_events e where record_id=rec and version=v$$;
create function pg_temp.rowvalue(d jsonb,sys text,fid text,p text,k text)returns jsonb language sql immutable as $$
 select case when sys<>'steam'then d#>array['forms',fid,p,k]
 when fid='bm02'then d#>array[fid,p,k] else d#>array[fid,p,'0',k]end$$;
create function pg_temp.putvalue(d jsonb,sys text,fid text,p text,k text,v jsonb)returns jsonb language plpgsql immutable as $$
begin
 if sys<>'steam'then return d||jsonb_build_object('forms',coalesce(d->'forms','{}')||jsonb_build_object(fid,
   coalesce(d#>array['forms',fid],'{}')||jsonb_build_object(p,coalesce(d#>array['forms',fid,p],'{}')||jsonb_build_object(k,v))));
 elsif fid='bm02'then return d||jsonb_build_object(fid,coalesce(d->fid,'{}')||jsonb_build_object(p,
   coalesce(d#>array[fid,p],'{}')||jsonb_build_object(k,v)));
 else return d||jsonb_build_object(fid,coalesce(d->fid,'{}')||jsonb_build_object(p,
   jsonb_build_array(coalesce(d#>array[fid,p,'0'],'{}')||jsonb_build_object(k,v))));end if;end$$;

insert into public.vmp_email_cho_phep(email,ghi_chu)values('crud-pq-all-forms@example.test','rollback fixture')on conflict(email)do update set is_active=true;
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('a8400000-0000-4000-8000-000000000001','authenticated','authenticated','crud-pq-all-forms@example.test','x',now(),'{}','{}',now(),now());
insert into public.profiles(id,full_name,email,role,department,is_active)values
('a8400000-0000-4000-8000-000000000001','CRUD PQ all forms','crud-pq-all-forms@example.test','department_user','QA',true)
on conflict(id)do update set full_name=excluded.full_name,email=excluded.email,role=excluded.role,department=excluded.department,is_active=true;
update public.vmp_performers set department='QA',access_class='qa_progress_editor',is_active=true
where user_id='a8400000-0000-4000-8000-000000000001';
insert into cpc1_private.members(user_id,enabled,reason)values('a8400000-0000-4000-8000-000000000001',true,'rollback fixture');
update public.vmp_source_objects set owner_person_id=(select id from public.vmp_performers where user_id='a8400000-0000-4000-8000-000000000001'),support_person_id=null
where object_code in('HT-12','HT-13','HT-14','HT-15');
do $$begin assert public.vmp_business_role('a8400000-0000-4000-8000-000000000001')is not distinct from'qa_staff','PQ_ALL_ROLE';end$$;

set local role authenticated;select pg_temp.actor('a8400000-0000-4000-8000-000000000001');
-- Exact deployed form inventory. Summary/trend forms are intentionally not
-- entry forms and therefore have no point-value cases.
do $$begin
 assert (select jsonb_agg(jsonb_build_object('id',f->>'id','fields',(select jsonb_agg(x->>'key' order by ord)from jsonb_array_elements(f->'fields')with ordinality z(x,ord)))order by n)
 from jsonb_array_elements(pg_temp.cfg('air')->'forms')with ordinality q(f,n))is not distinct from
 '[{"id":"bm01","fields":["p05","p5","executed_by","execution_date"]},{"id":"bm02","fields":["dewpoint","executed_by","execution_date"]},{"id":"bm03","fields":["flow","duration","reading","executed_by","execution_date"]},{"id":"bm04","fields":["microbial","sampled_by","sampling_date","executed_by","result_date"]},{"id":"bm05","fields":null},{"id":"bm06","fields":null}]'::jsonb,'PQ_ALL_INVENTORY_AIR';
 assert (select jsonb_agg(jsonb_build_object('id',f->>'id','fields',(select jsonb_agg(x->>'key' order by ord)from jsonb_array_elements(f->'fields')with ordinality z(x,ord)))order by n)
 from jsonb_array_elements(pg_temp.cfg('nitrogen')->'forms')with ordinality q(f,n))is not distinct from
 '[{"id":"bm01","fields":["p05","p5","executed_by","execution_date"]},{"id":"bm02","fields":["dewpoint","executed_by","execution_date"]},{"id":"bm03","fields":["flow","duration","reading","executed_by","execution_date"]},{"id":"bm04","fields":["microbial","sampled_by","sampling_date","executed_by","result_date"]},{"id":"bm05","fields":["purity","executed_by","execution_date"]},{"id":"bm06","fields":null},{"id":"bm07","fields":null}]'::jsonb,'PQ_ALL_INVENTORY_NITROGEN';
 assert (select jsonb_agg(jsonb_build_object('id',f->>'id','fields',(select jsonb_agg(x->>'key' order by ord)from jsonb_array_elements(f->'fields')with ordinality z(x,ord)))order by n)
 from jsonb_array_elements(pg_temp.cfg('steam')->'forms')with ordinality q(f,n))is not distinct from
 '[{"id":"bm01","fields":["vg","vc"]},{"id":"bm02","fields":["sample_chem","sample_micro","sample_endo","appearance","conductivity","toc","microbial","endotoxin"]},{"id":"bm03","fields":["me","ms","mf","t1","t2","t3"]},{"id":"bm04","fields":["te","to","ts"]},{"id":"bm05","fields":null}]'::jsonb,'PQ_ALL_INVENTORY_STEAM';end$$;

do $$declare sys text;f jsonb;field jsonb;fid text;k text;typ text;p text;sc jsonb;def jsonb;r jsonb;rid uuid;rec uuid;d jsonb;s jsonb;ev jsonb;
 a jsonb;b jsonb;v int;caseid text;begin
 foreach sys in array array['air','nitrogen','steam']loop
  for f in select x from jsonb_array_elements(pg_temp.cfg(sys)->'forms')x
   where (sys='steam'and x->>'id' in('bm01','bm02','bm03','bm04'))or(sys<>'steam'and x->>'kind'='measurement')loop
   fid:=f->>'id';p:=case when sys='steam'then pg_temp.cfg(sys)->'locations'->0->>'id'else f->'locations'->0->>'id'end;
   for field in select x from jsonb_array_elements(f->'fields')x loop
    k:=field->>'key';typ:=field->>'type';caseid:='PQ_ALL_'||upper(sys)||'_'||upper(fid)||'_'||upper(k);
    a:=case when typ='number'then'"0"'::jsonb when typ='date'then'"2026-10-08"'::jsonb else'"SYNTHETIC-A"'::jsonb end;
    b:=case when typ='number'then'"1"'::jsonb when typ='date'then'"2026-10-09"'::jsonb else'"SYNTHETIC-B"'::jsonb end;
    sc:=pg_temp.scope_one(sys,fid,p);
    if sys='steam'and fid='bm04'then sc:=jsonb_build_array(jsonb_build_object('system',sys,'forms',jsonb_build_object('bm03',jsonb_build_array(p),'bm04',jsonb_build_array(p))));end if;
    def:=jsonb_build_object('title',caseid,'mode','single','started_on','2026-10-08','scope',sc,'calibration',pg_temp.cal(sc));
    r:=public.cpc1_run_create(def,gen_random_uuid());rid:=(r->>'id')::uuid;rec:=(r#>>'{items,0,record_id}')::uuid;d:=public.cpc1_run_load(rid,rec)->'data';
    d:=pg_temp.putvalue(d,sys,fid,p,k,a);s:=public.cpc1_run_save(rid,d,rec,1,gen_random_uuid(),null);v:=(s->>'version')::int;
    assert(v=2 and pg_temp.rowvalue(public.cpc1_run_load(rid,rec)->'data',sys,fid,p,k)is not distinct from a)is true,caseid||'_ZERO_OR_INITIAL_RELOAD';
    d:=pg_temp.putvalue(d,sys,fid,p,k,b);perform pg_temp.must_state(format('select public.cpc1_run_save(%L,%L::jsonb,%L,2,gen_random_uuid(),null)',rid,d::text,rec),'23514',caseid||'_CORRECTION_REASON');
    s:=public.cpc1_run_save(rid,d,rec,2,gen_random_uuid(),'Đính chính '||caseid);v:=(s->>'version')::int;ev:=pg_temp.entry(rec,v);
    assert(ev->>'actor_id'='a8400000-0000-4000-8000-000000000001'and ev->>'reason'='Đính chính '||caseid
      and exists(select 1 from jsonb_array_elements(ev->'changes')c where c->'before'is not distinct from a and c->'after'is not distinct from b))is true,caseid||'_AUDIT_EXACT';
    d:=pg_temp.putvalue(d,sys,fid,p,k,'""');s:=public.cpc1_run_save(rid,d,rec,v,gen_random_uuid(),'Xóa giá trị '||caseid);v:=(s->>'version')::int;
    assert pg_temp.rowvalue(public.cpc1_run_load(rid,rec)->'data',sys,fid,p,k)='""'::jsonb,caseid||'_EMPTY_CLEAR_RELOAD';
    perform public.cpc1_run_transition(rid,1,'closed','Đóng '||caseid,gen_random_uuid());
    perform pg_temp.must_state(format('select public.cpc1_run_save(%L,%L::jsonb,%L,%s,gen_random_uuid(),null)',rid,d::text,rec,v),'PT409',caseid||'_CLOSED_DENY');
   end loop;end loop;end loop;end$$;
rollback;

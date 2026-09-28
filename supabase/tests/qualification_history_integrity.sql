-- Isolated qualification_history_final clone only. All fixtures roll back.
\set ON_ERROR_STOP on
begin;
set local statement_timeout='60s';
set local lock_timeout='5s';

create function pg_temp.must_fail(stmt text, expected_state text) returns void language plpgsql as $$
begin
 execute stmt;
 raise exception 'Expected SQLSTATE %, statement succeeded: %',expected_state,stmt;
exception when others then
 if sqlstate='P0001' then raise;end if;
 if sqlstate<>expected_state then raise exception 'Expected SQLSTATE %, got %: %',expected_state,sqlstate,sqlerrm;end if;
end$$;

do $test$
declare
	 owner uuid; other_user uuid; run jsonb; saved jsonb; closed jsonb; listed jsonb; rid uuid; rec uuid; point text;
	 trend_rid uuid; trend_rec uuid; frozen integer; trend_frozen integer; h uuid; manifest jsonb; fingerprint text;
begin
 select m.user_id into owner from cpc1_private.members m
 where m.enabled and public.vmp_is_active_session(m.user_id)
   and public.vmp_business_role(m.user_id) in ('admin','qa_manager','qa_staff')
 order by m.created_at limit 1;
 if owner is null then raise exception 'Fixture requires one enabled active CPC1 member';end if;
 perform set_config('request.jwt.claim.sub',owner::text,true);

 if has_table_privilege('anon','cpc1_private.history_imports','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_table_privilege('authenticated','cpc1_private.history_imports','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
  raise exception 'Direct history table privilege exposed';
 end if;
 if has_function_privilege('anon','public.cpc1_history_list()','EXECUTE')
    or not has_function_privilege('authenticated','public.cpc1_history_list()','EXECUTE')
    or has_function_privilege('anon','cpc1_private.can_read_history(text)','EXECUTE') then
  raise exception 'History function ACL is incorrect';
 end if;

 select f->'locations'->0->>'id' into point from cpc1_private.gas_settings g
 cross join lateral jsonb_array_elements(g.config->'forms') f
 where g.system='air' and f->>'id'='bm02';
 run:=public.cpc1_run_create(jsonb_build_object('title','TEST HISTORY INTEGRITY','mode','single','started_on','2026-03-01','scope',
  jsonb_build_array(jsonb_build_object('system','air','forms',jsonb_build_object('bm02',jsonb_build_array(point))))),gen_random_uuid());
 rid:=(run->>'id')::uuid;rec:=(run#>>'{items,0,record_id}')::uuid;
 manifest:=jsonb_build_array(jsonb_build_object('source_id','source-a','sha256',repeat('a',64),'object_path',repeat('a',64)||'.pdf','title','TEST PDF'));

 perform pg_temp.must_fail(format($sql$insert into cpc1_private.history_imports(run_id,record_id,version,system,period,source_fingerprint,source_manifest,provenance,comparison,trend)
  values(%L::uuid,%L::uuid,1,'air','2026-03-01',%L,%L::jsonb,'{}','[]','[]')$sql$,rid,rec,repeat('1',64),manifest),'23514');

 saved:=public.cpc1_run_save(rid,jsonb_build_object('system','air','meta','{}'::jsonb,'equipment','{}'::jsonb,
  'forms',jsonb_build_object('bm02',jsonb_build_object(point,jsonb_build_object('dewpoint','-20','executed_by','TEST','execution_date','2026-03-01'))),
  'controls','{}'::jsonb,'trend','{}'::jsonb),rec,1,gen_random_uuid());
 closed:=public.cpc1_run_transition(rid,1,'completed',null,gen_random_uuid());
 select closed_revision into frozen from cpc1_private.run_items where run_id=rid and record_id=rec;
 if frozen<>2 then raise exception 'Unexpected frozen revision: %',frozen;end if;

 perform pg_temp.must_fail(format($sql$insert into cpc1_private.history_imports(run_id,record_id,version,system,period,source_fingerprint,source_manifest,provenance,comparison,trend)
  values(%L::uuid,%L::uuid,1,'air','2026-03-01',%L,%L::jsonb,'{}','[]','[]')$sql$,rid,rec,repeat('2',64),manifest),'23514');

 fingerprint:=repeat('3',64);
 insert into cpc1_private.history_imports(run_id,record_id,version,system,period,source_fingerprint,source_manifest,provenance,comparison,trend)
 values(rid,rec,frozen,'air','2026-03-01',fingerprint,manifest,'{"issues":[]}','[]','[]') returning id into h;

 perform pg_temp.must_fail(format('update cpc1_private.history_imports set source_manifest=%L::jsonb where id=%L::uuid',
  manifest||jsonb_build_array(jsonb_build_object('source_id','source-b','sha256',repeat('b',64),'object_path',repeat('b',64)||'.pdf','title','LATE PDF')),h),'23514');
 perform pg_temp.must_fail(format('update cpc1_private.history_imports set provenance=''{"changed":true}''::jsonb where id=%L::uuid',h),'23514');
 perform pg_temp.must_fail(format('delete from cpc1_private.history_imports where id=%L::uuid',h),'23514');

	 if not cpc1_private.can_read_history(repeat('a',64)||'.pdf') then raise exception 'Manifest source was not readable by owner';end if;
	 if jsonb_array_length(public.cpc1_history_list())<>1 then raise exception 'Expected one immutable history result';end if;

	 -- Future trend rows are history only after a terminal transition and use that frozen revision.
	 run:=public.cpc1_run_create(jsonb_build_object('title','TEST FUTURE TREND','mode','single','started_on','2026-04-18','scope',
	  jsonb_build_array(jsonb_build_object('system','air','forms',jsonb_build_object('bm02',jsonb_build_array(point))))),gen_random_uuid());
	 trend_rid:=(run->>'id')::uuid;trend_rec:=(run#>>'{items,0,record_id}')::uuid;
	 saved:=public.cpc1_run_save(trend_rid,jsonb_build_object('system','air','meta','{}'::jsonb,'equipment','{}'::jsonb,
	  'forms',jsonb_build_object('bm02',jsonb_build_object(point,jsonb_build_object('dewpoint','-21','executed_by','TEST','execution_date','2026-04-18'))),
	  'controls','{}'::jsonb,'trend','{}'::jsonb),trend_rec,1,gen_random_uuid());
	 listed:=public.cpc1_history_list();
	 if exists(select 1 from jsonb_array_elements(listed) e where e->>'record_id'=trend_rec::text) then raise exception 'Open run leaked into frozen trend history';end if;
	 closed:=public.cpc1_run_transition(trend_rid,1,'completed',null,gen_random_uuid());
	 select closed_revision into trend_frozen from cpc1_private.run_items where run_id=trend_rid and record_id=trend_rec;
	 listed:=public.cpc1_history_list();
	 if not exists(select 1 from jsonb_array_elements(listed) e where e->>'record_id'=trend_rec::text and (e->>'version')::integer=trend_frozen and e->>'period'='2026-04-01') then
	  raise exception 'Completed run missing exact frozen trend revision/month';
	 end if;

	 -- A different authenticated identity cannot list either imported or future history or read its PDF.
	 select id into other_user from auth.users where id<>owner order by id limit 1;
	 if other_user is null then raise exception 'Fixture requires a second auth.users row';end if;
	 perform set_config('request.jwt.claim.sub',other_user::text,true);
	 begin
	  listed:=public.cpc1_history_list();
	  if exists(select 1 from jsonb_array_elements(listed) e where e->>'record_id' in (rec::text,trend_rec::text)) then raise exception 'Cross-owner history leaked';end if;
	 exception when insufficient_privilege then null;
	 end;
	 if cpc1_private.can_read_history(repeat('a',64)||'.pdf') then raise exception 'Cross-owner source PDF leaked';end if;
end
$test$;

select 'PASS qualification_history_integrity (transaction rolls back)' as result;
rollback;

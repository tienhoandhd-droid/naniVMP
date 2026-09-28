-- Isolated qualification_history clone only. All fixtures roll back.
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

create function pg_temp.air_point(form_id text) returns text language sql stable as $$
 select f->'locations'->0->>'id' from cpc1_private.gas_settings g
 cross join lateral jsonb_array_elements(g.config->'forms') f
 where g.system='air' and f->>'id'=form_id
$$;
create function pg_temp.air_scope(form_id text default 'bm02') returns jsonb language sql stable as $$
 select jsonb_build_array(jsonb_build_object('system','air','forms',jsonb_build_object(form_id,jsonb_build_array(pg_temp.air_point(form_id)))))
$$;
create function pg_temp.air_campaign_scope() returns jsonb language sql stable as $$
 select jsonb_build_array(jsonb_build_object('system','air','forms',jsonb_object_agg(f->>'id',
   (select jsonb_agg(loc->>'id') from jsonb_array_elements(f->'locations') loc))))
 from cpc1_private.gas_settings g cross join lateral jsonb_array_elements(g.config->'forms') f
 where g.system='air' and f->>'kind'='measurement'
$$;
create function pg_temp.definition(title text,form_id text default 'bm02') returns jsonb language sql stable as $$
 select jsonb_build_object('title',title,'mode','single','started_on','2026-03-01','scope',pg_temp.air_scope(form_id))
$$;
create function pg_temp.air_data(point_id text,dew text default '-20') returns jsonb language sql immutable as $$
 select jsonb_build_object('system','air','meta','{}'::jsonb,'equipment','{}'::jsonb,
  'forms',jsonb_build_object('bm02',jsonb_build_object(point_id,jsonb_build_object('dewpoint',dew,'executed_by','TEST ONLY','execution_date','2026-03-01'))),
  'controls','{}'::jsonb,'trend','{}'::jsonb)
$$;

do $test$
declare
	 owner uuid; other_user uuid; run jsonb; run2 jsonb; saved jsonb; first_save jsonb; retry jsonb; ev jsonb;
 rid uuid; rec_id uuid; point_id text:=pg_temp.air_point('bm02'); req uuid:=gen_random_uuid();
 counts_before bigint[]; counts_after bigint[]; original_config jsonb; closed_version integer;
begin
 select m.user_id into owner from cpc1_private.members m
 where m.enabled and public.vmp_is_active_session(m.user_id)
   and public.vmp_business_role(m.user_id) in ('admin','qa_manager','qa_staff')
 order by m.created_at limit 1;
 if owner is null then raise exception 'Fixture requires one enabled active CPC1 member';end if;
 perform set_config('request.jwt.claim.sub',owner::text,true);

 -- API metadata and direct privilege surface.
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname like 'cpc1_run_%'
   and (not p.prosecdef or not coalesce('search_path=""'=any(p.proconfig),false)
        or has_function_privilege('anon',p.oid,'EXECUTE')
        or not has_function_privilege('authenticated',p.oid,'EXECUTE'))) then
  raise exception 'Unexpected run RPC owner/security/search_path/ACL';
 end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   cross join unnest(array['anon','authenticated']) actor
   where n.nspname='cpc1_private' and c.relname in ('runs','run_items','run_events','run_requests')
   and ((c.relkind in ('r','p') and has_table_privilege(actor,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
     or (c.relkind='S' and has_sequence_privilege(actor,c.oid,'USAGE,SELECT,UPDATE')))) then
  raise exception 'Direct run table/sequence privilege exposed';
 end if;

 -- Anonymous, inactive and nonmember fail closed without weakening canonical functions.
 perform set_config('request.jwt.claim.sub','',true);
 perform pg_temp.must_fail(format('select public.cpc1_run_create(%L::jsonb,%L::uuid)',pg_temp.definition('anonymous'),gen_random_uuid()),'42501');
 perform set_config('request.jwt.claim.sub',owner::text,true);
 update public.profiles set is_active=false where id=owner;
 perform pg_temp.must_fail('select public.cpc1_run_list()','42501');
 update public.profiles set is_active=true where id=owner;
 update cpc1_private.members set enabled=false where user_id=owner;
 perform pg_temp.must_fail(format('select public.cpc1_run_create(%L::jsonb,%L::uuid)',pg_temp.definition('disabled member'),gen_random_uuid()),'42501');
 update cpc1_private.members set enabled=true where user_id=owner;

 -- Create/retry idempotency and same-key conflict.
 run:=public.cpc1_run_create(pg_temp.definition('Security fixture'),req);
 retry:=public.cpc1_run_create(pg_temp.definition('Security fixture'),req);
 if retry is distinct from run then raise exception 'Create retry changed response';end if;
 perform pg_temp.must_fail(format('select public.cpc1_run_create(%L::jsonb,%L::uuid)',pg_temp.definition('Different payload'),req),'23505');
 rid:=(run->>'id')::uuid;rec_id:=(run#>>'{items,0,record_id}')::uuid;

 -- Wrong-owner get/transition/load/config remain denied.
 select id into other_user from auth.users where id<>owner order by id limit 1;
 if other_user is null then raise exception 'Fixture requires a second auth.users row for wrong-owner test';end if;
 update cpc1_private.runs set owner_id=other_user where id=rid;
 perform pg_temp.must_fail(format('select public.cpc1_run_get(%L::uuid)',rid),'42501');
 perform pg_temp.must_fail(format('select public.cpc1_run_transition(%L::uuid,1,''closed'',''x'',%L::uuid)',rid,gen_random_uuid()),'42501');
 perform pg_temp.must_fail(format('select public.cpc1_run_load(%L::uuid,%L::uuid)',rid,rec_id),'42501');
 update cpc1_private.runs set owner_id=owner where id=rid;

 -- Scope validation: duplicate system, duplicate/unknown points and campaign incompleteness.
 select array[(select count(*) from cpc1_private.runs),(select count(*) from cpc1_private.run_items),
  (select count(*) from public.cpc1_records),(select count(*) from public.cpc1_revisions),
  (select count(*) from cpc1_private.run_events),(select count(*) from cpc1_private.run_requests)] into counts_before;
 perform pg_temp.must_fail(format('select public.cpc1_run_create(%L::jsonb,%L::uuid)',
  jsonb_build_object('title','duplicate system','mode','campaign','started_on','2026-03-01','scope',pg_temp.air_campaign_scope()||pg_temp.air_campaign_scope()),gen_random_uuid()),'23505');
 perform pg_temp.must_fail(format('select public.cpc1_run_create(%L::jsonb,%L::uuid)',
  jsonb_build_object('title','duplicate point','mode','single','started_on','2026-03-01','scope',jsonb_build_array(jsonb_build_object('system','air','forms',jsonb_build_object('bm02',jsonb_build_array(point_id,point_id))))),gen_random_uuid()),'23514');
 perform pg_temp.must_fail(format('select public.cpc1_run_create(%L::jsonb,%L::uuid)',
  jsonb_build_object('title','unknown point','mode','single','started_on','2026-03-01','scope',jsonb_build_array(jsonb_build_object('system','air','forms',jsonb_build_object('bm02',jsonb_build_array('NOT-A-POINT'))))),gen_random_uuid()),'23514');
 perform pg_temp.must_fail(format('select public.cpc1_run_create(%L::jsonb,%L::uuid)',
  jsonb_build_object('title','incomplete campaign','mode','campaign','started_on','2026-03-01','scope',pg_temp.air_scope()),gen_random_uuid()),'23514');
 select array[(select count(*) from cpc1_private.runs),(select count(*) from cpc1_private.run_items),
  (select count(*) from public.cpc1_records),(select count(*) from public.cpc1_revisions),
  (select count(*) from cpc1_private.run_events),(select count(*) from cpc1_private.run_requests)] into counts_after;
 if counts_after is distinct from counts_before then raise exception 'Failed create left orphan rows: % -> %',counts_before,counts_after;end if;

 -- Missing, invalid, and incomplete control data cannot complete.
 perform pg_temp.must_fail(format('select public.cpc1_run_transition(%L::uuid,1,''completed'',null,%L::uuid)',rid,gen_random_uuid()),'23514');

 -- Run-wide meta and trend narrative are allowed, while equipment and controls obey scope.
	 req:=gen_random_uuid();
	 saved:=public.cpc1_run_save(rid,pg_temp.air_data(point_id)||jsonb_build_object('meta',jsonb_build_object('notes','TEST narrative'),'trend',jsonb_build_object('conclusion','TEST trend narrative')),rec_id,1,req);
	 first_save:=saved;
	 retry:=public.cpc1_run_save(rid,pg_temp.air_data(point_id)||jsonb_build_object('meta',jsonb_build_object('notes','TEST narrative'),'trend',jsonb_build_object('conclusion','TEST trend narrative')),rec_id,1,req);
	 if retry is distinct from first_save then raise exception 'Run save immediate retry changed full response';end if;
	 if saved#>>'{data,meta,notes}'<>'TEST narrative' or saved#>>'{data,trend,conclusion}'<>'TEST trend narrative' then raise exception 'Allowed narrative was not saved';end if;
	 ev:=public.cpc1_run_evaluate(rid,pg_temp.air_data(point_id,'not-a-number'));
	 if ev#>>'{forms,bm02,summary,total}'<>'1' or ev#>>'{forms,bm02,summary,invalid}'<>'1' or ev#>>'{forms,bm02,summary,incomplete}'<>'0' then
	  raise exception 'Scoped totals overlap or changed: %',ev#>'{forms,bm02,summary}';
	 end if;
 perform pg_temp.must_fail(format('select public.cpc1_run_save(%L::uuid,%L::jsonb,%L::uuid,2,%L::uuid)',rid,
  pg_temp.air_data(point_id)||jsonb_build_object('equipment',jsonb_build_object('bm01',jsonb_build_object('id','TEST'))),rec_id,gen_random_uuid()),'23514');
 perform pg_temp.must_fail(format('select public.cpc1_run_save(%L::uuid,%L::jsonb,%L::uuid,2,%L::uuid)',rid,
  pg_temp.air_data(point_id)||jsonb_build_object('controls',jsonb_build_object('positive_count','100')),rec_id,gen_random_uuid()),'23514');

 -- Config drift freezes evaluation/save until reviewed; restore exact fixture config.
 select config into original_config from cpc1_private.gas_settings where system='air';
 update cpc1_private.gas_settings set config=config||jsonb_build_object('_test_drift',true) where system='air';
 perform pg_temp.must_fail(format('select public.cpc1_run_save(%L::uuid,%L::jsonb,%L::uuid,2,%L::uuid)',rid,pg_temp.air_data(point_id),rec_id,gen_random_uuid()),'23514');
 update cpc1_private.gas_settings set config=original_config where system='air';

 -- Fully sampled fail is still complete work; transition retry is idempotent and freezes revision.
	 saved:=public.cpc1_run_save(rid,pg_temp.air_data(point_id,'20'),rec_id,2,gen_random_uuid());
	 retry:=public.cpc1_run_save(rid,pg_temp.air_data(point_id)||jsonb_build_object('meta',jsonb_build_object('notes','TEST narrative'),'trend',jsonb_build_object('conclusion','TEST trend narrative')),rec_id,1,req);
	 if retry is distinct from first_save then raise exception 'Run save retry changed after later revision';end if;
 req:=gen_random_uuid();run2:=public.cpc1_run_transition(rid,1,'completed',null,req);
 retry:=public.cpc1_run_transition(rid,1,'completed',null,req);
 if retry is distinct from run2 or run2->>'status'<>'completed' then raise exception 'Transition retry failed';end if;
 perform pg_temp.must_fail(format('select public.cpc1_run_transition(%L::uuid,1,''closed'',''different'',%L::uuid)',rid,req),'23505');
 select i.closed_revision into closed_version from cpc1_private.run_items i where i.run_id=rid and i.record_id=rec_id;
 if closed_version<>3 then raise exception 'Wrong frozen revision: %',closed_version;end if;
 perform pg_temp.must_fail(format('select public.cpc1_save(%L::jsonb,%L::uuid,3,%L::uuid,''legacy client'')',pg_temp.air_data(point_id),rec_id,gen_random_uuid()),'PT409');
 if (public.cpc1_run_load(rid,rec_id)->>'version')::int<>closed_version then raise exception 'Closed load did not use frozen revision';end if;

 -- BM04 requires its control; valid control and equipment for the scoped form are allowed.
 point_id:=pg_temp.air_point('bm04');
 run:=public.cpc1_run_create(pg_temp.definition('Control fixture','bm04'),gen_random_uuid());
 rid:=(run->>'id')::uuid;rec_id:=(run#>>'{items,0,record_id}')::uuid;
 saved:=public.cpc1_run_save(rid,jsonb_build_object('system','air','meta','{}'::jsonb,
  'equipment',jsonb_build_object('bm04',jsonb_build_object('id','TEST')),
  'forms',jsonb_build_object('bm04',jsonb_build_object(point_id,jsonb_build_object('microbial','KPH','sampled_by','TEST ONLY','sampling_date','2026-03-01','executed_by','TEST ONLY','result_date','2026-03-02'))),
  'controls','{}'::jsonb,'trend','{}'::jsonb),rec_id,1,gen_random_uuid());
 perform pg_temp.must_fail(format('select public.cpc1_run_transition(%L::uuid,1,''completed'',null,%L::uuid)',rid,gen_random_uuid()),'23514');
 saved:=public.cpc1_run_save(rid,(saved->'data')||jsonb_build_object('controls',jsonb_build_object('positive_count','100')),rec_id,2,gen_random_uuid());
 run:=public.cpc1_run_transition(rid,1,'completed',null,gen_random_uuid());
 if run#>>'{progress,controls_ready}'<>'true' or run->>'status'<>'completed' then raise exception 'BM04 valid control did not permit completion';end if;

 -- Closed requires reason at both RPC and table invariant boundaries.
 run:=public.cpc1_run_create(pg_temp.definition('Close fixture'),gen_random_uuid());rid:=(run->>'id')::uuid;
 perform pg_temp.must_fail(format('select public.cpc1_run_transition(%L::uuid,1,''closed'',null,%L::uuid)',rid,gen_random_uuid()),'23514');
 perform pg_temp.must_fail(format('update cpc1_private.runs set status=''closed'',closed_at=clock_timestamp(),close_reason=null where id=%L::uuid',rid),'23514');
 run:=public.cpc1_run_transition(rid,1,'closed','TEST early close',gen_random_uuid());
 if run->>'status'<>'closed' then raise exception 'Early close with reason failed';end if;
end
$test$;

select 'PASS qualification_runs_security (transaction rolls back)' as result;
rollback;

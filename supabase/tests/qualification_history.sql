\set ON_ERROR_STOP on
begin;
do $$
declare u uuid;other uuid;r jsonb;rec uuid;rid uuid;h uuid;scope jsonb;p text;outp jsonb;
begin
 select user_id into u from cpc1_private.members where enabled limit 1;
 select id into other from auth.users where id<>u limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);
 select f->'locations'->0->>'id' into p from cpc1_private.gas_settings g cross join lateral jsonb_array_elements(g.config->'forms') f where g.system='air' and f->>'id'='bm02';
 scope:=jsonb_build_array(jsonb_build_object('system','air','forms',jsonb_build_object('bm02',jsonb_build_array(p))));
 r:=public.cpc1_run_create(jsonb_build_object('title','TEST HISTORY','mode','single','started_on','2026-03-01','scope',scope),gen_random_uuid());
 rid:=(r->>'id')::uuid;rec:=(r#>>'{items,0,record_id}')::uuid;
 perform public.cpc1_run_transition(rid,1,'closed','TEST imported history',gen_random_uuid());
 insert into cpc1_private.history_imports(run_id,record_id,version,system,period,source_fingerprint,provenance,comparison,trend,source_manifest)
 values(rid,rec,1,'air','2026-03-01',repeat('a',64),'{"note":"synthetic"}','[]','[]',jsonb_build_array(jsonb_build_object('source_id','synthetic','sha256',repeat('b',64),'object_path',repeat('b',64)||'.pdf','title','TEST PDF'))) returning id into h;
 outp:=public.cpc1_history_list();if jsonb_array_length(outp)<>1 or outp#>>'{0,system}'<>'air' then raise exception 'history owner visibility';end if;
 if not cpc1_private.can_read_history(repeat('b',64)||'.pdf') then raise exception 'source owner denied';end if;
 -- A business viewer with entry grant removed can still inspect its existing history.
 update cpc1_private.members set enabled=false where user_id=u;
 if jsonb_array_length(public.cpc1_history_list())<>1 then raise exception 'viewer lost history';end if;
 perform set_config('request.jwt.claim.sub',other::text,true);
 begin
  outp:=public.cpc1_history_list();if outp<>'[]'::jsonb then raise exception 'cross owner history leaked';end if;
 exception when insufficient_privilege then null;end;
 if cpc1_private.can_read_history(repeat('b',64)||'.pdf') then raise exception 'cross owner PDF leaked';end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.cpc1_history_list();raise exception 'anonymous allowed';exception when insufficient_privilege then null;end;
 if cpc1_private.can_read_history(repeat('b',64)||'.pdf') then raise exception 'anon PDF leaked';end if;
 if has_table_privilege('authenticated','cpc1_private.history_imports','select') or has_table_privilege('authenticated','cpc1_private.history_imports','insert') then raise exception 'table grants exposed';end if;
 raise notice 'PASS: historical data and source PDF owner boundary';
end$$;
rollback;

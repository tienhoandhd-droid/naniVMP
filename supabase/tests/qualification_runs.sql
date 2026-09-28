-- Run only against an isolated copy of CPC1 with its original config and one enabled owner.
-- Everything rolls back; no production test data.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from cpc1_private.members where enabled limit 1),true);
create temp table run_checks(ok boolean);
do $$declare r jsonb;again jsonb;u uuid:=auth.uid();req uuid:=gen_random_uuid();scope jsonb;d jsonb;rid uuid;
begin
 scope:=jsonb_build_array(jsonb_build_object('system','air','forms',jsonb_build_object('bm02',jsonb_build_array((select config#>>'{forms,1,locations,0,id}' from cpc1_private.gas_settings where system='air')))));
 r:=public.cpc1_run_create(jsonb_build_object('title','Kiểm thử lấy mẫu lẻ','mode','single','started_on','2026-03-01','scope',scope),req);
 again:=public.cpc1_run_create(jsonb_build_object('title','Kiểm thử lấy mẫu lẻ','mode','single','started_on','2026-03-01','scope',scope),req);
 assert r=again,'Create retry must be idempotent';rid:=(r->>'id')::uuid;
 assert r->>'status'='open';
 begin perform public.cpc1_run_transition(rid,1,'completed','',gen_random_uuid());raise exception 'Missing sample wrongly completed';exception when check_violation then null;end;
 begin perform public.cpc1_run_transition(rid,1,'closed','',gen_random_uuid());raise exception 'Close without reason accepted';exception when check_violation then null;end;
 r:=public.cpc1_run_transition(rid,1,'closed','Kết thúc thử nghiệm',gen_random_uuid());
 assert r->>'status'='closed';
 begin perform public.cpc1_run_transition(rid,1,'closed','Lặp cũ',gen_random_uuid());raise exception 'Stale version accepted';exception when sqlstate 'PT409' then null;end;
 insert into run_checks values(true);
end$$;
select case when bool_and(ok) then 'PASS' else 'FAIL' end from run_checks;
rollback;

-- Run against the isolated restored VMP only. Owner/other UUIDs come from private fixtures.
\set ON_ERROR_STOP on
begin;
select set_config('request.jwt.claim.sub', :'owner_id', true);
set local role authenticated;
select public.cpc1_context();
reset role;
insert into storage.objects(bucket_id,name) values('cpc1-templates','v2/synthetic-test.pdf');
-- Current owner is a VMP actor with an explicit entry grant.
create temp table qualification_result as select public.cpc1_save('{}'::jsonb,null,0,'11111111-1111-4111-8111-111111111111','SYNTHETIC qualification test') result;
select set_config('test.record_id',(select result->>'id' from qualification_result),true);
set local role authenticated;
do $$ declare r jsonb; begin
 r:=public.cpc1_load(current_setting('test.record_id')::uuid);
 if r->>'version'<>'1' then raise exception 'Expected version1'; end if;
 if not public.cpc1_template_access() then raise exception 'Entry template access'; end if;
 if (select count(*) from storage.objects where bucket_id='cpc1-templates')<>1 then raise exception 'Entry actual Storage SELECT';end if;
 begin insert into storage.objects(bucket_id,name) values('cpc1-templates','v2/forbidden.pdf');raise exception 'Storage write allowed';exception when insufficient_privilege then null;end;
 begin perform * from public.cpc1_records;raise exception 'Direct read unexpectedly allowed';exception when insufficient_privilege then null;end;
 begin perform public.cpc1_save('{}',current_setting('test.record_id')::uuid,0,gen_random_uuid(),'stale');raise exception 'Stale write allowed';exception when sqlstate 'PT409' then null;end;
end $$;
reset role;
-- Revoke live membership: current JWT must stop working immediately.
update cpc1_private.members set enabled=false where user_id=:'owner_id';
set local role authenticated;
do $$ begin
 begin perform public.cpc1_evaluate('{}');raise exception 'Revoked entry allowed';exception when insufficient_privilege then null;end;
 if public.cpc1_template_access() then raise exception 'Revoked template access';end if;
 if exists(select 1 from storage.objects where bucket_id='cpc1-templates') then raise exception 'Revoked actual Storage SELECT';end if;
end $$;
reset role;
update cpc1_private.members set enabled=true where user_id=:'owner_id';
-- Active VMP identity alone must not imply entry.
select set_config('request.jwt.claim.sub', :'other_id', true);
set local role authenticated;
do $$ begin
 if (public.cpc1_context()->>'can_enter')::boolean then raise exception 'Nonentry write capability';end if;
 perform public.cpc1_config();
 begin perform public.cpc1_evaluate('{}');raise exception 'Nonentry evaluate allowed';exception when insufficient_privilege then null;end;
 begin perform public.cpc1_load(current_setting('test.record_id')::uuid);raise exception 'Cross-owner allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
insert into cpc1_private.members(user_id,reason) values(:'other_id','Synthetic second entry actor');
set local role authenticated;
do $$ begin
 perform public.cpc1_context();
 begin perform public.cpc1_load(current_setting('test.record_id')::uuid);raise exception 'Cross-owner member allowed';exception when insufficient_privilege then null;end;
 if jsonb_array_length(public.cpc1_list())<>0 then raise exception 'Cross-owner list leak';end if;
end $$;
reset role;
-- Even accidental entry membership cannot bypass the QA/Admin boundary.
insert into cpc1_private.members(user_id,reason) values(:'workshop_id','Synthetic workshop grant must not authorize');
select set_config('request.jwt.claim.sub', :'workshop_id', true);
set local role authenticated;
do $$ begin
 begin perform public.cpc1_context();raise exception 'Workshop context allowed';exception when insufficient_privilege then null;end;
 begin perform public.cpc1_config();raise exception 'Workshop config allowed';exception when insufficient_privilege then null;end;
 begin perform public.cpc1_evaluate('{}');raise exception 'Workshop evaluate allowed';exception when insufficient_privilege then null;end;
 if public.cpc1_template_access() then raise exception 'Workshop storage allowed';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', :'owner_id', true);
update public.profiles set is_active=false where id=:'owner_id';
set local role authenticated;
do $$ begin
 begin perform public.cpc1_context();raise exception 'Disabled VMP actor allowed';exception when insufficient_privilege then null;end;
 if public.cpc1_template_access() then raise exception 'Disabled storage access';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 begin perform public.cpc1_context();raise exception 'Anon allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Both QA roles can view configuration, without receiving entry/print implicitly.
select set_config('request.jwt.claim.sub', :'qa_manager_id', true);
set local role authenticated;
do $$ begin
 if not (public.cpc1_context()->>'can_view')::boolean then raise exception 'QA manager viewer denied';end if;
 perform public.cpc1_config();perform public.cpc1_gas_config('air');perform public.cpc1_gas_config('nitrogen');
 begin perform public.cpc1_save('{}',null,0,gen_random_uuid(),'forbidden');raise exception 'Viewer save allowed';exception when insufficient_privilege then null;end;
 if public.cpc1_template_access() then raise exception 'Viewer print assets allowed';end if;
 if exists(select 1 from storage.objects where bucket_id='cpc1-templates') then raise exception 'Viewer actual template read';end if;
end $$;
reset role;
rollback;

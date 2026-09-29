-- Run on a disposable restore only. All fixture changes are rolled back.
\set ON_ERROR_STOP on
begin;
-- Production direct-table grants may already be revoked. Temporary grants let
-- this rollback-only fixture exercise RLS independently of the grant boundary.
grant select on public.vmp_objects, public.vmp_plan_items, public.system_config, storage.objects to authenticated;
grant usage on schema public to anon, service_role;
select id as actor_id from public.profiles where public.vmp_business_role(id) = 'admin' limit 1 \gset
select set_config('request.jwt.claims', jsonb_build_object('sub', :'actor_id', 'role', 'authenticated', 'aal', 'aal1')::text, true);
select set_config('request.jwt.claim.sub', :'actor_id', true);
set local role authenticated;
do $$ begin
  if not public.vmp_mfa_session_allowed() then raise exception 'Unenrolled actor denied'; end if;
  perform public.vmp_mfa_pre_request();
  if not exists(select 1 from public.vmp_objects) then raise exception 'Missing readable object fixture'; end if;
  if not exists(select 1 from public.vmp_plan_items) then raise exception 'Missing readable plan fixture'; end if;
  if not exists(select 1 from public.system_config) then raise exception 'Missing readable config fixture'; end if;
  if not exists(select 1 from storage.objects) then raise exception 'Missing readable Storage fixture'; end if;
end $$;
reset role;
insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at)
values ('00000000-0000-4000-8000-000000000929', :'actor_id', 'isolated-test', 'totp', 'unverified', now(),now());
set local role authenticated;
do $$ begin
  if not public.vmp_mfa_session_allowed() then raise exception 'Unverified enrollment blocks actor'; end if;
end $$;
reset role;
update auth.mfa_factors set status='verified' where id='00000000-0000-4000-8000-000000000929';
set local role authenticated;
do $$ begin
  if public.vmp_mfa_session_allowed() then raise exception 'Password-only MFA bypass'; end if;
  begin
    perform public.vmp_mfa_pre_request();
    raise exception 'Pre-request did not reject aal1';
  exception when sqlstate 'PT403' then null;
  end;
  if exists(select 1 from public.vmp_objects) then raise exception 'Realtime object RLS bypass'; end if;
  if exists(select 1 from public.vmp_plan_items) then raise exception 'Realtime item RLS bypass'; end if;
  if exists(select 1 from public.system_config) then raise exception 'Configuration RLS bypass'; end if;
  if exists(select 1 from storage.objects) then raise exception 'Storage RLS bypass'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', :'actor_id', 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;
do $$ begin
  if not public.vmp_mfa_session_allowed() then raise exception 'Verified aal2 denied'; end if;
  perform public.vmp_mfa_pre_request();
  if not exists(select 1 from public.vmp_objects) then raise exception 'Authorized aal2 object access lost'; end if;
  if not exists(select 1 from public.vmp_plan_items) then raise exception 'Authorized aal2 plan access lost'; end if;
  if not exists(select 1 from storage.objects) then raise exception 'Authorized aal2 Storage access lost'; end if;
  perform public.cpc1_context();
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.vmp_mfa_pre_request();
  exception when insufficient_privilege then null; -- existing schema access may already be revoked
  end;
end $$;
reset role;
set local role service_role;
select public.vmp_mfa_pre_request(); -- server automation is unaffected
reset role;
do $$ begin
  if exists(select 1 from pg_proc p where p.oid='public.vmp_mfa_session_allowed()'::regprocedure
    and (not p.prosecdef or not ('search_path=""'=any(p.proconfig)))) then
    raise exception 'Helper must use a fixed empty search_path';
  end if;
  if has_function_privilege('anon','public.vmp_mfa_session_allowed()','EXECUTE') then raise exception 'Anonymous helper grant'; end if;
end $$;
rollback;
\echo 'PASS MFA: unenrolled/unverified allowed; verified aal1 denied at pre-request and table/Storage RLS; aal2 allowed; anon/service unchanged.'

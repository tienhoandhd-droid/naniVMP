-- Native, owner-opted-in MFA. Existing roles/record permissions still decide access.
-- No user is enrolled and no historical data is changed by this migration.
-- PostgREST covers RPC/direct reads; restrictive policies also cover Storage/Realtime.

create function public.vmp_mfa_session_allowed()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and (
    coalesce(auth.jwt()->>'aal', '') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status = 'verified'
    )
  );
$$;
revoke all on function public.vmp_mfa_session_allowed() from public, anon, authenticated, service_role;
grant execute on function public.vmp_mfa_session_allowed() to authenticated;

-- Invoker deliberately retains current_user so service automation and anonymous
-- requests retain existing grants; they are never granted access by this guard.
create function public.vmp_mfa_pre_request()
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user = 'authenticated' and not public.vmp_mfa_session_allowed() then
    raise sqlstate 'PT403' using message = 'MFA_REQUIRED',
      detail = 'Complete two-factor verification before accessing VMP data.';
  end if;
end;
$$;
revoke all on function public.vmp_mfa_pre_request() from public;
grant execute on function public.vmp_mfa_pre_request() to anon, authenticated, service_role;

-- Restrictive policies AND with existing policies, including any FOR ALL grant.
-- A permissive policy here would allow an aal1 bypass via existing policies.
create policy vmp_mfa_required on public.vmp_objects as restrictive for all to authenticated
using ((select public.vmp_mfa_session_allowed())) with check ((select public.vmp_mfa_session_allowed()));
create policy vmp_mfa_required on public.vmp_plan_items as restrictive for all to authenticated
using ((select public.vmp_mfa_session_allowed())) with check ((select public.vmp_mfa_session_allowed()));
create policy vmp_mfa_required on public.system_config as restrictive for all to authenticated
using ((select public.vmp_mfa_session_allowed())) with check ((select public.vmp_mfa_session_allowed()));
create policy vmp_mfa_required on storage.objects as restrictive for all to authenticated
using ((select public.vmp_mfa_session_allowed())) with check ((select public.vmp_mfa_session_allowed()));

-- Refuse to replace an unrelated hook or a database-specific override.
do $$ begin
  if exists (
    select 1 from pg_db_role_setting s, unnest(s.setconfig) setting
    where (s.setrole = (select oid from pg_roles where rolname='authenticator') or s.setrole=0)
      and (s.setdatabase=0 or s.setdatabase=(select oid from pg_database where datname=current_database()))
      and setting like 'pgrst.db_pre_request=%' and setting <> 'pgrst.db_pre_request='
  ) then raise exception 'Existing PostgREST pre-request hook requires explicit integration'; end if;
end $$;
alter role authenticator set pgrst.db_pre_request = 'public.vmp_mfa_pre_request';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';

-- Fail the migration transaction if the intended boundaries are incomplete.
do $$ begin
  if (select count(*) from pg_policies where policyname='vmp_mfa_required'
      and permissive='RESTRICTIVE' and roles=array['authenticated']::name[] and cmd='ALL'
      and ((schemaname='public' and tablename in ('vmp_objects','vmp_plan_items','system_config'))
        or (schemaname='storage' and tablename='objects'))) <> 4 then
    raise exception 'Incomplete MFA restrictive policies';
  end if;
  if has_function_privilege('anon','public.vmp_mfa_session_allowed()','EXECUTE')
    or not has_function_privilege('authenticated','public.vmp_mfa_session_allowed()','EXECUTE') then
    raise exception 'Incorrect MFA helper grants';
  end if;
  if not exists (select 1 from pg_roles where rolname='authenticator'
    and 'pgrst.db_pre_request=public.vmp_mfa_pre_request'=any(rolconfig)) then
    raise exception 'MFA pre-request setting missing';
  end if;
end $$;

-- REHEARSAL or explicitly authorized incident only; removes MFA enforcement.
-- Do not run after enrollment as a routine frontend rollback.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticator'
      and 'pgrst.db_pre_request=public.vmp_mfa_pre_request'=any(rolconfig)) then
    raise exception 'Unexpected pre-request setting; refuse rollback';
  end if;
end $$;
alter role authenticator reset pgrst.db_pre_request;
drop policy vmp_mfa_required on public.vmp_objects;
drop policy vmp_mfa_required on public.vmp_plan_items;
drop policy vmp_mfa_required on public.system_config;
drop policy vmp_mfa_required on storage.objects;
drop function public.vmp_mfa_pre_request();
drop function public.vmp_mfa_session_allowed();
notify pgrst, 'reload config';
notify pgrst, 'reload schema';

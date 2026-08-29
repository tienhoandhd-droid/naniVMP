begin;

revoke all on function public.rpc_team_overview_summary(integer)
  from public, anon, authenticated, service_role;
drop function public.rpc_team_overview_summary(integer);

commit;

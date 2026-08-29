\set ON_ERROR_STOP on

begin;

create function pg_temp.assert_true(p_condition boolean, p_marker text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception using errcode = 'check_violation', message = p_marker;
  end if;
end
$function$;

select pg_temp.assert_true(
  to_regprocedure('public.rpc_team_overview_summary(integer)') is null,
  'TEAM_SUMMARY_ROLLBACK_FUNCTION_ABSENT'
);

with target as (
  select to_regprocedure('public.rpc_team_overview_summary(integer)') as oid
), roles(role_name) as (
  values ('anon'::text), ('authenticated'::text), ('service_role'::text)
)
select pg_temp.assert_true(
  not exists (
    select 1
    from target
    cross join roles
    where coalesce(has_function_privilege(role_name, target.oid, 'EXECUTE'), false)
  ),
  'TEAM_SUMMARY_ROLLBACK_EXECUTE_ABSENT'
);

rollback;

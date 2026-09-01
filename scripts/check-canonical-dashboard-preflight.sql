\set ON_ERROR_STOP on

do $check$
begin
  if current_setting('server_version_num')::integer < 170000 then
    raise exception 'Canonical dashboard requires PostgreSQL 17';
  end if;
  if to_regclass('public.vmp_plan_items') is null
     or to_regclass('public.vmp_authorization_revision') is null
     or to_regprocedure('public.vmp_visible_plan_items()') is null then
    raise exception 'Canonical dashboard prerequisites are incomplete';
  end if;
end
$check$;

select 'PASS CANONICAL DASHBOARD PREFLIGHT' as result;

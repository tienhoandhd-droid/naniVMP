\set ON_ERROR_STOP on

do $check$
declare
  v_definition text;
begin
  if to_regprocedure('public.vmp_canonical_item_status(public.vmp_plan_items,date)') is null
     or to_regprocedure('public.rpc_get_vmp_dashboard_v2(integer,boolean)') is null then
    raise exception 'Canonical dashboard functions are missing';
  end if;
  select pg_get_functiondef('public.rpc_get_vmp_dashboard_v2(integer,boolean)'::regprocedure)
    into v_definition;
  if position('vmp_visible_plan_items()' in v_definition) = 0
     or position('Asia/Bangkok' in v_definition) = 0 then
    raise exception 'Canonical dashboard RPC lost its scope/date boundary';
  end if;
end
$check$;

select 'PASS CANONICAL DASHBOARD POSTFLIGHT' as result;

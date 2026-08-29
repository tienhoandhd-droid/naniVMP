begin;

create or replace function public.rpc_team_overview_summary(
  p_year integer default extract(year from now())::integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role text;
  v_total integer := 0;
  v_completed integer := 0;
  v_rate integer := 0;
  v_updated_at timestamptz;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    null; -- Explicit deployment-verification bypass; no user role is resolved.
  else
    if not public.vmp_is_active_session(auth.uid()) then
      return public.vmp_session_denial();
    end if;

    v_role := public.vmp_business_role(auth.uid());
    if not exists (
      select 1
      from public.vmp_screen_permissions as permission
      where permission.business_role = v_role
        and permission.screen_id = 'overview'
        and permission.can_view is true
    ) then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'FORBIDDEN',
        'error', 'Không có quyền xem Tổng quan'
      );
    end if;
  end if;

  if p_year is null then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'INVALID_YEAR',
      'error', 'Năm kế hoạch không hợp lệ'
    );
  end if;

  select count(*)::integer,
         count(*) filter (where item.status_vmp = 'completed')::integer,
         max(item.updated_at)
    into v_total, v_completed, v_updated_at
  from public.vmp_plan_items as item
  where item.year = p_year
    and item.is_active is true
    and item.missing_from_sheet is not true
    and coalesce(item.item_state, 'active') = 'active';

  v_rate := case
    when v_total = 0 then 0
    else round(v_completed * 100.0 / v_total)::integer
  end;

  return jsonb_build_object(
    'ok', true,
    'year', p_year,
    'total', v_total,
    'completed', v_completed,
    'rate', v_rate,
    'updated_at', v_updated_at
  );
end
$function$;

revoke all on function public.rpc_team_overview_summary(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_team_overview_summary(integer)
  to authenticated, service_role;

commit;

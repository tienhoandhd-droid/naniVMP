-- =====================================================================
-- BẢO MẬT (tiếp mục 8b): đóng nốt RPC ghi còn sót — và sửa cách rà
--
-- Migration ...070000 rà theo TIỀN TỐ TÊN HÀM:
--   ^rpc_(upsert|delete|create|update|set|generate|resolve|deactivate
--         |apply|sync|register|mark|rollback|reconcile)
-- Cách này bỏ sót `rpc_refresh_computed_status` vì tiền tố "refresh" không
-- nằm trong danh sách. Hàm đó UPDATE cột computed_status của toàn bộ
-- vmp_plan_items nên là hàm GHI, mà vẫn mở cho anon.
--
-- Bài học: đừng suy đoán "hàm nào ghi" bằng tên. Postgres đã có sẵn thông
-- tin đúng: provolatile = 'v' (VOLATILE) nghĩa là hàm có thể ghi; 's'/'i'
-- (STABLE/IMMUTABLE) thì không. Migration này rà lại theo provolatile.
--
-- Các RPC chỉ ĐỌC (rpc_get_*, rpc_dashboard_kpi, rpc_check_data_quality,
-- rpc_due_alerts...) vẫn giữ cho anon để dashboard công khai chạy được.
-- =====================================================================

do $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname like 'rpc\_%'
      and p.provolatile = 'v'                       -- VOLATILE = có thể ghi
      and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke execute on function %s from anon',   r.oid::regprocedure);
    execute format('revoke execute on function %s from public', r.oid::regprocedure);
    execute format('grant execute on function %s to authenticated, service_role', r.oid::regprocedure);
    n := n + 1;
    raise notice 'đã gỡ anon khỏi hàm VOLATILE: %', r.proname;
  end loop;
  raise notice 'tổng cộng % hàm', n;
end $$;

-- Hậu kiểm theo đúng tiêu chí mới: không hàm VOLATILE nào được để hở.
do $$
declare v_left text;
begin
  select string_agg(p.proname, ', ') into v_left
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname like 'rpc\_%'
    and p.provolatile = 'v'
    and has_function_privilege('anon', p.oid, 'execute');
  if v_left is not null then
    raise exception 'Vẫn còn RPC ghi (VOLATILE) mở cho anon: %', v_left;
  end if;
end $$;

-- =====================================================================
-- BẢO MẬT: gỡ quyền gọi RPC ghi khỏi role `anon`
--
-- Phát hiện 2026-07-29: Supabase đặt sẵn
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS
--   TO anon, authenticated, service_role
-- nên MỌI function mới tạo đều tự động có `anon=X` trong ACL.
--
-- Hệ quả: `REVOKE EXECUTE ... FROM PUBLIC` — cách thường dùng và cũng là
-- cách các migration trước của dự án này dùng — KHÔNG gỡ được, vì quyền
-- được cấp đích danh cho anon chứ không kế thừa qua PUBLIC.
--
-- Vì sao nghiêm trọng: dashboard chạy trên GitHub Pages công khai và anon
-- key là key công khai. Bất kỳ ai cũng có thể gọi RPC ghi bằng anon key.
-- Các RPC đều tự kiểm quyền bên trong (đọc profiles theo auth.uid(), anon
-- không có uid nên bị từ chối) — tức là chưa bị khai thác được. Nhưng đó
-- là lớp phòng thủ cuối; lớp ngoài phải đóng đúng.
--
-- Migration này rà TOÀN BỘ function có tên bắt đầu bằng rpc_ và mang tính
-- GHI, rồi revoke khỏi anon. Các RPC chỉ ĐỌC (rpc_get_*, rpc_due_alerts,
-- rpc_alert_context...) giữ nguyên.
-- =====================================================================

do $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select p.oid,
           p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname ~ '^rpc_(upsert|delete|create|update|set|generate|resolve|deactivate|apply|sync|register|mark|rollback|reconcile)'
      and has_function_privilege('anon', p.oid, 'execute')
  loop
    -- Quyền của anon đến từ HAI đường khác nhau tuỳ function:
    --   1. grant đích danh (do ALTER DEFAULT PRIVILEGES của Supabase)  -> revoke from anon
    --   2. proacl NULL, tức PUBLIC có execute theo mặc định Postgres   -> revoke from public
    -- Phải gỡ cả hai, gỡ một đường thôi thì has_function_privilege vẫn true.
    -- Dùng oid::regprocedure để không nhầm overload.
    execute format('revoke execute on function %s from anon',   r.oid::regprocedure);
    execute format('revoke execute on function %s from public', r.oid::regprocedure);
    -- Cấp lại đích danh cho hai role thực sự cần, tránh gỡ nhầm thành mất chức năng.
    execute format('grant execute on function %s to authenticated, service_role', r.oid::regprocedure);
    n := n + 1;
    raise notice 'đã gỡ anon: %', r.sig;
  end loop;
  raise notice 'tổng cộng % function', n;
end $$;

-- Chặn tái diễn: đổi luôn default privilege để function tạo về sau KHÔNG
-- tự động cấp cho anon. authenticated/service_role giữ nguyên.
alter default privileges in schema public revoke execute on functions from anon;

-- Hậu kiểm: còn RPC ghi nào anon gọi được thì dừng migration.
do $$
declare v_left text;
begin
  select string_agg(p.proname, ', ')
    into v_left
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname ~ '^rpc_(upsert|delete|create|update|set|generate|resolve|deactivate|apply|sync|register|mark|rollback|reconcile)'
    and has_function_privilege('anon', p.oid, 'execute');

  if v_left is not null then
    raise exception 'Vẫn còn RPC ghi mở cho anon: %', v_left;
  end if;
end $$;

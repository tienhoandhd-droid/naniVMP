-- =====================================================================
-- 20260831170000_client_error_log.sql — TAI MẮT Ở PRODUCTION
-- ---------------------------------------------------------------------
-- Trước bản này, ErrorBoundary chỉ console.error vào trình duyệt người
-- dùng — web trắng màn hàng ngày cũng không ai biết cho tới khi có người
-- gọi điện. Bảng + 2 RPC này cho client GHI lỗi runtime về DB và cho
-- admin/QA ĐỌC lại, không cần dịch vụ thứ ba (Sentry).
--
-- An toàn:
--  · Bảng revoke ALL khỏi anon/authenticated — chỉ đi qua RPC.
--  · rpc_ghi_loi_client: đòi phiên hoạt động, cắt độ dài mọi trường,
--    rate-limit 20 dòng/phút/người (chống bão lỗi lặp + chống spam).
--  · rpc_doc_loi_client: chỉ admin/qa_manager.
--  · Không nhận PII ngoài email người đang đăng nhập (tự suy từ phiên).
--
-- Áp dụng theo runbook: docs/runbooks/2026-08-31-client-error-log.md
-- =====================================================================

begin;

-- ---------- PRECONDITION ----------
do $preflight$
begin
  if to_regclass('public.vmp_client_errors') is not null then
    raise exception 'PRECONDITION FAILED: vmp_client_errors đã tồn tại — migration này đã áp rồi?';
  end if;
  if to_regprocedure('public.vmp_current_session_is_active()') is null then
    raise exception 'PRECONDITION FAILED: thiếu vmp_current_session_is_active() (hardening 20260824 chưa áp?)';
  end if;
  if to_regprocedure('public.vmp_business_role(uuid)') is null then
    raise exception 'PRECONDITION FAILED: thiếu vmp_business_role(uuid)';
  end if;
end
$preflight$;

-- ---------- BẢNG ----------
create table public.vmp_client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid,
  user_email text,
  url text,
  message text not null,
  stack text,
  source text not null default 'window.onerror',
  user_agent text,
  app_version text,
  constraint vmp_client_errors_source_check
    check (source in ('window.onerror', 'unhandledrejection', 'error-boundary', 'thu-cong'))
);

comment on table public.vmp_client_errors is
  'Lỗi runtime do frontend tự báo về (lib/baoLoi.ts). Chỉ ghi/đọc qua RPC.';

create index vmp_client_errors_created_at_idx
  on public.vmp_client_errors (created_at desc);
create index vmp_client_errors_user_minute_idx
  on public.vmp_client_errors (user_id, created_at);

alter table public.vmp_client_errors enable row level security;
revoke all on table public.vmp_client_errors from public, anon, authenticated;

-- ---------- RPC GHI (mọi phiên hoạt động, rate-limit) ----------
create or replace function public.rpc_ghi_loi_client(
  p_message text,
  p_stack text default null,
  p_url text default null,
  p_source text default 'window.onerror'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_so_gan_day bigint;
  v_source text;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role')
     and not public.vmp_current_session_is_active() then
    return jsonb_build_object('ok', false, 'error_code', 'SESSION_INACTIVE');
  end if;
  if p_message is null or btrim(p_message) = '' then
    return jsonb_build_object('ok', false, 'error_code', 'EMPTY_MESSAGE');
  end if;

  -- Rate-limit: quá 20 dòng trong 60s của cùng một người thì lặng lẽ bỏ —
  -- trả ok:true để client không retry (retry lúc bão lỗi chỉ đổ thêm dầu).
  select count(*) into v_so_gan_day
  from public.vmp_client_errors
  where user_id is not distinct from v_uid
    and created_at > now() - interval '60 seconds';
  if v_so_gan_day >= 20 then
    return jsonb_build_object('ok', true, 'dropped', true, 'reason', 'rate_limited');
  end if;

  select email into v_email from auth.users where id = v_uid;
  v_source := case when p_source in
    ('window.onerror', 'unhandledrejection', 'error-boundary', 'thu-cong')
    then p_source else 'thu-cong' end;

  insert into public.vmp_client_errors
    (user_id, user_email, url, message, stack, source, user_agent, app_version)
  values (
    v_uid,
    left(coalesce(v_email, ''), 320),
    left(coalesce(p_url, ''), 500),
    left(btrim(p_message), 2000),
    left(coalesce(p_stack, ''), 8000),
    v_source,
    left(coalesce(current_setting('request.headers', true)::jsonb ->> 'user-agent', ''), 400),
    null
  );
  return jsonb_build_object('ok', true);
end
$function$;

revoke all on function public.rpc_ghi_loi_client(text, text, text, text) from public, anon;
grant execute on function public.rpc_ghi_loi_client(text, text, text, text) to authenticated;

-- ---------- RPC ĐỌC (admin/qa_manager) ----------
create or replace function public.rpc_doc_loi_client(
  p_limit integer default 100,
  p_offset integer default 0,
  p_tu timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role text;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role')
     and not public.vmp_current_session_is_active() then
    return jsonb_build_object('ok', false, 'error_code', 'SESSION_INACTIVE');
  end if;
  v_role := public.vmp_business_role(auth.uid());
  if v_role is null or v_role not in ('admin', 'qa_manager') then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin/Quản lý QA xem được nhật ký lỗi client');
  end if;
  return jsonb_build_object(
    'ok', true,
    'total', (select count(*) from public.vmp_client_errors
              where p_tu is null or created_at >= p_tu),
    'errors', (
      select coalesce(jsonb_agg(row_to_json(e.*) order by e.created_at desc), '[]'::jsonb)
      from (
        select id, created_at, user_email, url, message,
               left(stack, 1000) as stack, source, user_agent
        from public.vmp_client_errors
        where p_tu is null or created_at >= p_tu
        order by created_at desc
        limit least(greatest(coalesce(p_limit, 100), 1), 500)
        offset greatest(coalesce(p_offset, 0), 0)
      ) e
    )
  );
end
$function$;

revoke all on function public.rpc_doc_loi_client(integer, integer, timestamptz) from public, anon;
grant execute on function public.rpc_doc_loi_client(integer, integer, timestamptz) to authenticated;

-- ---------- POSTCONDITION ----------
do $postflight$
begin
  if not exists (
    select 1 from pg_class c
    where c.oid = 'public.vmp_client_errors'::regclass and c.relrowsecurity
  ) then
    raise exception 'POSTCONDITION FAILED: vmp_client_errors chưa bật RLS';
  end if;
  if has_table_privilege('authenticated', 'public.vmp_client_errors', 'SELECT') then
    raise exception 'POSTCONDITION FAILED: authenticated vẫn SELECT thẳng được bảng lỗi';
  end if;
  if has_table_privilege('authenticated', 'public.vmp_client_errors', 'INSERT') then
    raise exception 'POSTCONDITION FAILED: authenticated vẫn INSERT thẳng được bảng lỗi';
  end if;
  if not has_function_privilege('authenticated',
    'public.rpc_ghi_loi_client(text,text,text,text)', 'EXECUTE') then
    raise exception 'POSTCONDITION FAILED: authenticated không gọi được rpc_ghi_loi_client';
  end if;
  if has_function_privilege('anon',
    'public.rpc_ghi_loi_client(text,text,text,text)', 'EXECUTE') then
    raise exception 'POSTCONDITION FAILED: anon gọi được rpc_ghi_loi_client';
  end if;
end
$postflight$;

commit;

-- Sau COMMIT: notify pgrst, 'reload schema';

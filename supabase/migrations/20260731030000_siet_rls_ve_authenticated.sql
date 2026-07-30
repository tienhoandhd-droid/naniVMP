-- =====================================================================
-- SIẾT RLS: 42 policy đang mở cho vai `public` → về `authenticated`
--
-- Phát hiện khi test chiều bảo mật: anon key nằm sẵn trong gói JS công
-- khai, và 42 policy mở cho vai `public` — tức là BẤT KỲ AI có địa chỉ
-- web đều dùng được, không cần đăng nhập.
--
-- Đọc được (đã kiểm chứng bằng REST API, vai anon):
--   vmp_plan_items    461 dòng — toàn bộ kế hoạch thẩm định
--   vmp_objects       217 dòng — danh mục thiết bị
--   vmp_staff_emails   10 dòng — tên và EMAIL nhân sự
--   cùng audit_logs, profiles, departments, system_config, workflow_runs…
--
-- Ghi được (nặng hơn nhiều): workflow_runs nhận INSERT từ vai anon —
-- thử POST rỗng trả về lỗi thiếu cột chứ KHÔNG phải 42501, nghĩa là RLS
-- đã cho qua. Ai cũng bơm được bản ghi rác vào nhật ký chạy.
--
-- Trong hệ GMP, nhật ký chạy và audit log là bằng chứng. Người ngoài ghi
-- vào được thì bằng chứng mất giá trị.
--
-- ---------------------------------------------------------------------
-- VÌ SAO `authenticated` LÀ ĐỦ VÀ AN TOÀN
--
-- Web đăng nhập bằng supabase.auth.signInWithPassword() thật, và
-- App.tsx chặn toàn bộ ứng dụng sau màn đăng nhập:
--     if (!user) return <LoginScreen … />
-- Nên mọi truy vấn của web đều chạy dưới vai `authenticated`.
--
-- n8n không bị ảnh hưởng: nó nối Postgres trực tiếp bằng credential
-- riêng, không đi qua PostgREST nên không chịu RLS này.
--
-- ---------------------------------------------------------------------
-- KHÔNG ĐỤNG VÀO
--   · cron.job, cron.job_run_details — policy mặc định của pg_cron,
--     đổi có thể làm chết việc chạy nền.
--   · sheet_sync_outbox / outbox_no_client — điều kiện đã là `false`,
--     tức chặn sẵn mọi client; giữ nguyên.
--
-- ---------------------------------------------------------------------
-- CÁCH LÙI LẠI nếu web trắng dữ liệu
--   Chạy đúng lệnh này để mở lại vai public cho một bảng:
--     alter policy plan_select on public.vmp_plan_items to public;
--   Hoặc mở lại tất cả:
--     select 'alter policy '||quote_ident(policyname)||' on public.'
--            ||quote_ident(tablename)||' to public;'
--     from public.vmp_rls_siet_log;
-- =====================================================================

-- Ghi lại đúng những policy bị đổi, để lùi được và để audit đọc hiểu
create table if not exists public.vmp_rls_siet_log (
  id         bigserial primary key,
  tablename  text not null,
  policyname text not null,
  cmd        text not null,
  vai_cu     text not null,
  vai_moi    text not null,
  doi_luc    timestamptz not null default now()
);

comment on table public.vmp_rls_siet_log is
  'Nhật ký siết RLS 2026-07-31: policy nào bị đổi từ public sang authenticated. Dùng để lùi lại nếu web trắng dữ liệu.';

do $siet$
declare
  r record;
  v_so integer := 0;
begin
  for r in
    select schemaname, tablename, policyname, cmd
    from pg_policies
    where 'public' = any(roles)
      and schemaname = 'public'
      -- pg_cron dùng policy mặc định, đổi là chết việc chạy nền
      and tablename not in ('job', 'job_run_details')
      -- policy này đã chặn sẵn bằng USING(false)
      and policyname <> 'outbox_no_client'
  loop
    execute format('alter policy %I on %I.%I to authenticated',
                   r.policyname, r.schemaname, r.tablename);

    insert into public.vmp_rls_siet_log (tablename, policyname, cmd, vai_cu, vai_moi)
    values (r.tablename, r.policyname, r.cmd, 'public', 'authenticated');

    v_so := v_so + 1;
  end loop;

  raise notice 'Đã siết % policy từ public sang authenticated.', v_so;
end
$siet$;

alter table public.vmp_rls_siet_log enable row level security;
drop policy if exists rls_siet_log_doc on public.vmp_rls_siet_log;
create policy rls_siet_log_doc on public.vmp_rls_siet_log
  for select to authenticated using (true);

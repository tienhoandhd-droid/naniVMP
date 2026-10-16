-- =====================================================================
-- 20261016120000_mfa_pre_request_anon_fix.sql — HOOK MFA CHẶN NHẦM ANON
-- ---------------------------------------------------------------------
-- Lỗi (20260929160000_opt_in_mfa_guard): điều kiện
--   if current_user = 'authenticated' and not public.vmp_mfa_session_allowed()
-- giả định PostgreSQL dừng sớm khi vế đầu sai. Nhưng quyền EXECUTE được
-- kiểm lúc KHỞI TẠO biểu thức, không phải lúc tính — nên request anon ĐẦU
-- TIÊN trên một phiên nhận "42501 permission denied for function
-- vmp_mfa_session_allowed" (anon cố ý không có quyền gọi hàm đó). Hệ quả:
-- mọi request anon qua PostgREST bị từ chối.
--
-- Sửa: tách thành hai IF lồng nhau — vế MFA chỉ được khởi tạo khi
-- current_user là authenticated. Hành vi với authenticated giữ nguyên.
--
-- Đã kiểm trên production trong giao dịch ROLLBACK (16/10): anon gọi đầu
-- tiên — cũ: 42501, mới: cho qua; 9 người dùng × aal1/aal2 — cũ = mới;
-- người có MFA đã xác minh: aal1 → PT403 MFA_REQUIRED, aal2 → cho qua, cũ = mới.
--
-- Mở ra gì cho anon: production 16/10 anon không có quyền bảng nào, chỉ
-- EXECUTE hai hàm: chính hook này và rpc_schema_fingerprint (20261016110000).
-- =====================================================================

begin;

create or replace function public.vmp_mfa_pre_request()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if not public.vmp_mfa_session_allowed() then
      raise sqlstate 'PT403' using message = 'MFA_REQUIRED',
        detail = 'Complete two-factor verification before accessing VMP data.';
    end if;
  end if;
end;
$$;

revoke all on function public.vmp_mfa_pre_request() from public;
grant execute on function public.vmp_mfa_pre_request() to anon, authenticated, service_role;

-- Hook vẫn phải là hàm này, và anon vẫn KHÔNG được gọi điều kiện MFA.
do $postflight$ begin
  if not exists (
    select 1 from pg_db_role_setting s, unnest(s.setconfig) setting
    where s.setrole = (select oid from pg_roles where rolname = 'authenticator')
      and setting = 'pgrst.db_pre_request=public.vmp_mfa_pre_request'
  ) then
    raise exception 'POSTCONDITION FAILED: pgrst.db_pre_request không còn trỏ vào vmp_mfa_pre_request';
  end if;
  if has_function_privilege('anon', 'public.vmp_mfa_session_allowed()', 'EXECUTE') then
    raise exception 'POSTCONDITION FAILED: anon không được có quyền gọi vmp_mfa_session_allowed';
  end if;
end $postflight$;

commit;

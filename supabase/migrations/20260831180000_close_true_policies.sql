-- =====================================================================
-- 20260831180000_close_true_policies.sql — ĐÓNG 6 BẢNG POLICY FALLBACK-TRUE
--                                          + LỌC PHẠM VI rpc_team_overview_summary
-- ---------------------------------------------------------------------
-- Nguồn gốc lỗ hổng: 20260824120000:764-767 bọc policy CŨ bằng
-- coalesce(qual,'true') — policy không có điều kiện rút gọn thành "bất kỳ
-- phiên hoạt động nào". Sáu bảng dưới không được đợt enforce 28/08 thay
-- policy, nên MỌI tài khoản đăng nhập (kể cả workshop_staff) đọc được:
--   vmp_staff_emails      → danh bạ email nhân sự (PII)
--   vmp_email_cho_phep    → allowlist email tạo tài khoản (PII)
--   vmp_source_rows       → dữ liệu nguồn thô, không lọc phạm vi xưởng
--   data_quality_issues   → lỗi dữ liệu nội bộ
--   vmp_assignment_matrix → ma trận phân công QA
--   vmp_chat_loi_cho      → lời chào persona (KHÔNG nhạy cảm — giữ mở,
--                           nhưng viết policy TƯỜNG MINH thay fallback)
--
-- Vai được cấp (đối chiếu màn đang dùng dữ liệu, 31/08):
--   vmp_staff_emails      admin, qa_manager   (AiMailModal — màn cảnh báo QA)
--   vmp_email_cho_phep    admin               (màn Vai trò & phạm vi là admin-only)
--   vmp_source_rows       admin, qa_manager, qa_staff  (workshop đi đường RPC scoped riêng)
--   data_quality_issues   admin, qa_manager, qa_staff  (màn Chất lượng dữ liệu)
--   vmp_assignment_matrix admin, qa_manager, qa_staff
--   vmp_chat_loi_cho      mọi phiên hoạt động (explicit)
--
-- Đồng thời: rpc_team_overview_summary (20260829150000) đếm TOÀN BỘ
-- vmp_plan_items không áp data_scope — vai phạm vi hẹp đọc được tổng hợp
-- toàn nhà máy. Sửa: đếm qua public.vmp_visible_plan_items() (quan hệ đã
-- lọc quyền theo actor, được allowlist 20260828 công nhận).
--
-- Áp dụng theo runbook: docs/runbooks/2026-08-31-close-true-policies.md
-- =====================================================================

begin;

-- ---------- PRECONDITION ----------
do $preflight$
declare
  v_bang text;
  v_thieu text[] := '{}';
begin
  foreach v_bang in array array[
    'vmp_staff_emails','vmp_email_cho_phep','vmp_source_rows',
    'data_quality_issues','vmp_assignment_matrix','vmp_chat_loi_cho'
  ] loop
    if to_regclass('public.' || v_bang) is null then
      v_thieu := v_thieu || v_bang;
    end if;
  end loop;
  if cardinality(v_thieu) > 0 then
    raise exception 'PRECONDITION FAILED: thiếu bảng %', array_to_string(v_thieu, ', ');
  end if;
  if to_regprocedure('public.vmp_business_role(uuid)') is null
     or to_regprocedure('public.vmp_current_session_is_active()') is null then
    raise exception 'PRECONDITION FAILED: thiếu helper hardening 20260824';
  end if;
  if to_regprocedure('public.vmp_visible_plan_items()') is null then
    raise exception 'PRECONDITION FAILED: thiếu vmp_visible_plan_items() — hàm này sống ở production (chưa có trong repo); nếu tên/chữ ký đã đổi, DỪNG và đối chiếu';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = 'public.vmp_visible_plan_items()'::regprocedure
      and p.proretset
      and p.prorettype = 'public.vmp_plan_items'::regtype::oid
  ) then
    raise exception 'PRECONDITION FAILED: vmp_visible_plan_items() không trả setof vmp_plan_items — hợp đồng đã trôi, DỪNG';
  end if;
end
$preflight$;

-- ---------- HELPER dùng chung cho policy (idempotent, an toàn khi gọi lại) ----------
create or replace function public.vmp_la_vai(p_vai text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select public.vmp_current_session_is_active()
     and public.vmp_business_role(auth.uid()) = any(p_vai)
$function$;
comment on function public.vmp_la_vai(text[]) is
  'Helper policy RLS: phiên hoạt động VÀ vai nghiệp vụ thuộc danh sách. 20260831.';
revoke all on function public.vmp_la_vai(text[]) from public, anon;
grant execute on function public.vmp_la_vai(text[]) to authenticated;

-- ---------- THAY POLICY 6 BẢNG ----------
do $policies$
declare
  r record;
begin
  -- Gỡ TOÀN BỘ policy hiện có của 6 bảng (kể cả bản bọc coalesce-true).
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in (
      'vmp_staff_emails','vmp_email_cho_phep','vmp_source_rows',
      'data_quality_issues','vmp_assignment_matrix','vmp_chat_loi_cho')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end
$policies$;

alter table public.vmp_staff_emails enable row level security;
create policy vmp_staff_emails_qa_read on public.vmp_staff_emails
  for select to authenticated
  using (public.vmp_la_vai(array['admin','qa_manager']));

alter table public.vmp_email_cho_phep enable row level security;
create policy vmp_email_cho_phep_admin_read on public.vmp_email_cho_phep
  for select to authenticated
  using (public.vmp_la_vai(array['admin']));

alter table public.vmp_source_rows enable row level security;
create policy vmp_source_rows_qa_read on public.vmp_source_rows
  for select to authenticated
  using (public.vmp_la_vai(array['admin','qa_manager','qa_staff']));

alter table public.data_quality_issues enable row level security;
create policy data_quality_issues_qa_read on public.data_quality_issues
  for select to authenticated
  using (public.vmp_la_vai(array['admin','qa_manager','qa_staff']));

alter table public.vmp_assignment_matrix enable row level security;
create policy vmp_assignment_matrix_qa_read on public.vmp_assignment_matrix
  for select to authenticated
  using (public.vmp_la_vai(array['admin','qa_manager','qa_staff']));

alter table public.vmp_chat_loi_cho enable row level security;
create policy vmp_chat_loi_cho_session_read on public.vmp_chat_loi_cho
  for select to authenticated
  using (public.vmp_current_session_is_active());

-- Ghi vào 6 bảng: không cấp qua policy — mọi đường ghi đã đi RPC/impl
-- (nếu bảng nào có policy INSERT/UPDATE cũ thì vòng drop ở trên đã gỡ;
-- các RPC security definer không bị RLS chặn vì chạy dưới owner).

-- ---------- SỬA rpc_team_overview_summary: đếm qua quan hệ ĐÃ LỌC QUYỀN ----------
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
      select 1 from public.vmp_screen_permissions as permission
      where permission.business_role = v_role
        and permission.screen_id = 'overview'
        and permission.can_view is true
    ) then
      return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
        'error', 'Không có quyền xem Tổng quan');
    end if;
  end if;

  if p_year is null then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_YEAR',
      'error', 'Năm kế hoạch không hợp lệ');
  end if;

  -- 31/08: đếm qua vmp_visible_plan_items() thay vì quét thẳng bảng —
  -- vai data_scope hẹp (assigned/workshop) chỉ thấy tổng hợp CỦA PHẦN
  -- MÌNH ĐƯỢC XEM, không còn rò tổng toàn nhà máy. service_role (bypass
  -- xác minh deploy) không có actor nên đếm thẳng bảng như cũ.
  if coalesce(auth.role(), '') = 'service_role' then
    select count(*)::integer,
           count(*) filter (where item.status_vmp = 'completed')::integer,
           max(item.updated_at)
      into v_total, v_completed, v_updated_at
    from public.vmp_plan_items as item
    where item.year = p_year
      and item.is_active is true
      and item.missing_from_sheet is not true
      and coalesce(item.item_state, 'active') = 'active';
  else
    select count(*)::integer,
           count(*) filter (where item.status_vmp = 'completed')::integer,
           max(item.updated_at)
      into v_total, v_completed, v_updated_at
    from public.vmp_visible_plan_items() as item
    where item.year = p_year
      and item.is_active is true
      and item.missing_from_sheet is not true
      and coalesce(item.item_state, 'active') = 'active';
  end if;

  v_rate := case when v_total = 0 then 0
    else round(v_completed * 100.0 / v_total)::integer end;

  return jsonb_build_object(
    'ok', true, 'year', p_year, 'total', v_total,
    'completed', v_completed, 'rate', v_rate, 'updated_at', v_updated_at);
end
$function$;

revoke all on function public.rpc_team_overview_summary(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_team_overview_summary(integer)
  to authenticated, service_role;

-- ---------- POSTCONDITION ----------
do $postflight$
declare
  v_bang text;
  v_dem integer;
begin
  -- Không bảng nào còn policy có qual rút gọn thành true.
  select count(*) into v_dem from pg_policies
  where schemaname = 'public'
    and tablename in ('vmp_staff_emails','vmp_email_cho_phep','vmp_source_rows',
                      'data_quality_issues','vmp_assignment_matrix','vmp_chat_loi_cho')
    and (qual is null or qual = 'true');
  if v_dem > 0 then
    raise exception 'POSTCONDITION FAILED: vẫn còn % policy không điều kiện', v_dem;
  end if;
  -- Mỗi bảng đúng MỘT policy select mới.
  foreach v_bang in array array[
    'vmp_staff_emails','vmp_email_cho_phep','vmp_source_rows',
    'data_quality_issues','vmp_assignment_matrix','vmp_chat_loi_cho'
  ] loop
    select count(*) into v_dem from pg_policies
    where schemaname = 'public' and tablename = v_bang;
    if v_dem <> 1 then
      raise exception 'POSTCONDITION FAILED: % có % policy (kỳ vọng 1)', v_bang, v_dem;
    end if;
  end loop;
  -- Summary phải đi qua quan hệ đã lọc.
  if position('vmp_visible_plan_items()' in pg_get_functiondef(
       'public.rpc_team_overview_summary(integer)'::regprocedure)) = 0 then
    raise exception 'POSTCONDITION FAILED: rpc_team_overview_summary chưa dùng vmp_visible_plan_items()';
  end if;
end
$postflight$;

commit;

-- Sau COMMIT: notify pgrst, 'reload schema';

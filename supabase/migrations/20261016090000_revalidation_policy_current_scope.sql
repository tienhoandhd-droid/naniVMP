-- =====================================================================
-- 20261016090000_revalidation_policy_current_scope.sql
--   SỬA POLICY ĐỌC vmp_revalidation_proposals (từ 20260901120000)
-- ---------------------------------------------------------------------
-- Lỗi: policy gọi public.vmp_can_view_item(auth.uid(), ...). Hàm này nhận
-- uid bất kỳ nên đợt hardening 24/08 CỐ Ý không cấp EXECUTE cho
-- authenticated (chống dò quyền xem của người khác). Hệ quả khi áp
-- 20260901120000: MỌI người dùng đọc bảng nhận
--   ERROR: permission denied for function vmp_can_view_item
-- (thử trên bản sao production 16/10) — tab "Tái thẩm định" vỡ hoàn toàn.
--
-- Sửa: dùng đúng mô hình quyền xem hạng mục hiện hành — policy
-- plan_items_authorized_select của vmp_plan_items (20260828150000:3765)
-- dùng public.vmp_can_view_plan_item(auth.uid(), validation_code), hàm đã
-- cấp cho authenticated. Thấy hạng mục nào thì thấy đề xuất của hạng mục đó.
-- KHÔNG cấp lại EXECUTE vmp_can_view_item cho authenticated.
--
-- PHỤ THUỘC: áp SAU 20260901120000_revalidation_proposals.sql.
-- =====================================================================

begin;

do $preflight$
begin
  if to_regclass('public.vmp_revalidation_proposals') is null then
    raise exception 'PRECONDITION FAILED: thiếu bảng vmp_revalidation_proposals — áp 20260901120000 trước';
  end if;
  if to_regprocedure('public.vmp_can_view_plan_item(uuid,text)') is null then
    raise exception 'PRECONDITION FAILED: thiếu public.vmp_can_view_plan_item(uuid,text) (20260828150000)';
  end if;
  if not has_function_privilege('authenticated', 'public.vmp_can_view_plan_item(uuid,text)', 'EXECUTE') then
    raise exception 'PRECONDITION FAILED: authenticated không có EXECUTE trên vmp_can_view_plan_item — mô hình quyền đã đổi, DỪNG và đối chiếu';
  end if;
end
$preflight$;

drop policy if exists revalidation_proposals_visible_item_select
  on public.vmp_revalidation_proposals;
create policy revalidation_proposals_visible_item_select
  on public.vmp_revalidation_proposals
  for select to authenticated
  using (public.vmp_can_view_plan_item(auth.uid(), validation_code));

do $postflight$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'vmp_revalidation_proposals'
      and qual ilike '%vmp_can_view_item%'
  ) then
    raise exception 'POSTCONDITION FAILED: policy vẫn gọi vmp_can_view_item';
  end if;
end
$postflight$;

commit;

-- =====================================================================
-- RLS: gọi hàm kiểm quyền MỘT LẦN thay vì mỗi dòng một lần
--
-- Chính sách cũ viết `is_admin_or_qa() OR user_id = auth.uid()`. Postgres
-- coi đó là điều kiện phụ thuộc từng dòng nên gọi lại hàm cho TỪNG dòng.
-- Trên audit_logs (100.400 dòng / 158 MB) một truy vấn LIMIT 50 vẫn quét
-- sạch bảng: đo được 7.470 ms và PostgREST trả lỗi 57014 (statement
-- timeout) cho người dùng không phải admin.
--
-- Bọc trong (SELECT …) thì Postgres tính thành InitPlan — chạy một lần
-- cho cả truy vấn, và phần `user_id = …` còn dùng được chỉ mục.
-- Đây là cách Supabase khuyến nghị cho RLS trên bảng lớn.
--
-- Quyền hạn KHÔNG đổi: cùng một điều kiện, chỉ khác chỗ tính.
-- =====================================================================

-- audit_logs: chỉ admin/QA đọc.
-- Vế `or user_id = auth.uid()` nghe thì rộng rãi nhưng với người KHÔNG phải
-- admin nó buộc Postgres quét sạch 100.400 dòng để tìm dòng của chính mình
-- (đo được 5.839 ms) — trong khi màn Audit log vốn đã là màn chỉ-admin
-- (NAV_ITEMS đánh adminOnly). Bỏ vế đó thì điều kiện thành hằng số: không
-- phải admin là Postgres cắt luôn, không quét dòng nào.
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select
  using ((select public.is_admin_or_qa()));

-- anon (chưa đăng nhập) không có việc gì với nhật ký thao tác.
revoke select on public.audit_logs from anon;

drop policy if exists wf_select on public.workflow_runs;
create policy wf_select on public.workflow_runs for select
  using ((select public.is_admin_or_qa()));

drop policy if exists dq_select on public.data_quality_issues;
create policy dq_select on public.data_quality_issues for select
  using ((select public.is_admin_or_qa()));

drop policy if exists dq_update on public.data_quality_issues;
create policy dq_update on public.data_quality_issues for update
  using ((select public.is_admin_or_qa()));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = (select auth.uid()) or (select public.is_admin_or_qa()));

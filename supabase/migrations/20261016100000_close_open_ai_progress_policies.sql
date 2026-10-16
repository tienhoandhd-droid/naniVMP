-- =====================================================================
-- 20261016100000_close_open_ai_progress_policies.sql
--   ĐÓNG CÁC POLICY "true" CÒN SÓT Ở BẢNG NHẠY CẢM (AI, tiến độ, nhật ký)
-- ---------------------------------------------------------------------
-- Rà soát 16/10 (đọc pg_policies trên production) thấy 28 policy dạng
-- USING/WITH CHECK (true) cho vai authenticated. Phần lớn là dữ liệu cấu
-- hình (phòng ban, quy tắc hạn, cấu hình Vali...) — giữ nguyên. Migration
-- này chỉ đóng các bảng chứa dữ liệu nhạy cảm hoặc cho GHI tự do:
--
--   Bảng                     Trước             Sau
--   vmp_ai_hoi_thoai         ai cũng đọc       admin     (câu hỏi Vali của từng người)
--   vmp_ai_cham_diem_log     ai cũng đọc       admin
--   vmp_rls_siet_log         ai cũng đọc       admin
--   vmp_ai_cache             ai cũng đọc       admin, qa_manager, qa_staff
--   vmp_ai_cache_ngu_nghia   ai cũng đọc       admin, qa_manager, qa_staff
--   vmp_ai_report_cache      ai cũng đọc+GHI   admin, qa_manager, qa_staff (chỉ đọc)
--   vmp_ai_reviews           ai cũng đọc+GHI   admin, qa_manager, qa_staff (đọc); giữ ai_update
--   vmp_progress_events      ai cũng đọc+GHI   admin, qa_manager, qa_staff (chỉ đọc)
--   vmp_report_snapshots     ai cũng đọc       admin, qa_manager, qa_staff; giữ insert/update
--   workflow_runs            ai cũng GHI       bỏ policy ghi; giữ wf_select
--
-- Vì sao an toàn (bằng chứng 16/10):
--   * Frontend KHÔNG .from() bảng nào ở trên (chỉ đọc 6 bảng khác).
--   * pg_stat_statements từ 21/06/2026: 0 truy vấn PostgREST của vai người
--     dùng tới các bảng trên (đối chứng: vmp_source_rows có 25 lượt).
--   * 11 hàm đụng tới các bảng này đều SECURITY DEFINER (không qua RLS);
--     n8n ghi bằng kết nối postgres trực tiếp (không qua RLS).
--   * vmp_progress_events là lịch sử tiến độ — để ai cũng INSERT được là
--     lỗ toàn vẹn dữ liệu (GMP data integrity): có thể chèn lịch sử giả.
--
-- PHỤ THUỘC: 20260831180000_close_true_policies.sql phải áp TRƯỚC (tạo
-- helper public.vmp_la_vai). Migration tự kiểm và dừng nếu thiếu.
-- Áp dụng theo: docs/runbooks/2026-10-16-close-open-ai-progress-policies.md
-- =====================================================================

begin;

-- ---------- PRECONDITION ----------
do $preflight$
declare
  v_mong_doi text[][] := array[
    -- [bảng, policy phải đang tồn tại]
    ['vmp_ai_hoi_thoai',       'hoi_thoai_doc'],
    ['vmp_ai_cham_diem_log',   'cdl_doc'],
    ['vmp_rls_siet_log',       'rls_siet_log_doc'],
    ['vmp_ai_cache',           'cache_doc'],
    ['vmp_ai_cache_ngu_nghia', 'cache_nn_doc'],
    ['vmp_ai_report_cache',    'ai_cache_select'],
    ['vmp_ai_report_cache',    'ai_cache_insert'],
    ['vmp_ai_reviews',         'ai_select'],
    ['vmp_ai_reviews',         'ai_insert'],
    ['vmp_progress_events',    'progress_select'],
    ['vmp_progress_events',    'progress_insert'],
    ['vmp_report_snapshots',   'snapshot_select'],
    ['workflow_runs',          'wf_insert']
  ];
  v_thieu text[] := '{}';
  i int;
begin
  if to_regprocedure('public.vmp_la_vai(text[])') is null then
    raise exception 'PRECONDITION FAILED: thiếu public.vmp_la_vai(text[]) — áp 20260831180000_close_true_policies.sql trước';
  end if;
  for i in 1 .. array_length(v_mong_doi, 1) loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = v_mong_doi[i][1]
        and policyname = v_mong_doi[i][2]
    ) then
      v_thieu := v_thieu || (v_mong_doi[i][1] || '.' || v_mong_doi[i][2]);
    end if;
  end loop;
  if cardinality(v_thieu) > 0 then
    raise exception 'PRECONDITION FAILED: production đã trôi khỏi trạng thái rà soát 16/10, thiếu policy: % — DỪNG và đối chiếu lại',
      array_to_string(v_thieu, ', ');
  end if;
end
$preflight$;

-- ---------- GỠ POLICY MỞ ----------
drop policy hoi_thoai_doc    on public.vmp_ai_hoi_thoai;
drop policy cdl_doc          on public.vmp_ai_cham_diem_log;
drop policy rls_siet_log_doc on public.vmp_rls_siet_log;
drop policy cache_doc        on public.vmp_ai_cache;
drop policy cache_nn_doc     on public.vmp_ai_cache_ngu_nghia;
drop policy ai_cache_select  on public.vmp_ai_report_cache;
drop policy ai_cache_insert  on public.vmp_ai_report_cache;
drop policy ai_select        on public.vmp_ai_reviews;
drop policy ai_insert        on public.vmp_ai_reviews;
drop policy progress_select  on public.vmp_progress_events;
drop policy progress_insert  on public.vmp_progress_events;
drop policy snapshot_select  on public.vmp_report_snapshots;
drop policy wf_insert        on public.workflow_runs;

-- ---------- POLICY ĐỌC THEO VAI ----------
create policy vmp_ai_hoi_thoai_admin_read on public.vmp_ai_hoi_thoai
  for select to authenticated using (public.vmp_la_vai(array['admin']));
create policy vmp_ai_cham_diem_log_admin_read on public.vmp_ai_cham_diem_log
  for select to authenticated using (public.vmp_la_vai(array['admin']));
create policy vmp_rls_siet_log_admin_read on public.vmp_rls_siet_log
  for select to authenticated using (public.vmp_la_vai(array['admin']));

create policy vmp_ai_cache_qa_read on public.vmp_ai_cache
  for select to authenticated using (public.vmp_la_vai(array['admin','qa_manager','qa_staff']));
create policy vmp_ai_cache_ngu_nghia_qa_read on public.vmp_ai_cache_ngu_nghia
  for select to authenticated using (public.vmp_la_vai(array['admin','qa_manager','qa_staff']));
create policy vmp_ai_report_cache_qa_read on public.vmp_ai_report_cache
  for select to authenticated using (public.vmp_la_vai(array['admin','qa_manager','qa_staff']));
create policy vmp_ai_reviews_qa_read on public.vmp_ai_reviews
  for select to authenticated using (public.vmp_la_vai(array['admin','qa_manager','qa_staff']));
create policy vmp_progress_events_qa_read on public.vmp_progress_events
  for select to authenticated using (public.vmp_la_vai(array['admin','qa_manager','qa_staff']));
create policy vmp_report_snapshots_qa_read on public.vmp_report_snapshots
  for select to authenticated using (public.vmp_la_vai(array['admin','qa_manager','qa_staff']));

-- Ghi vào các bảng trên: không cấp qua policy. Mọi đường ghi hợp lệ đi qua
-- hàm SECURITY DEFINER hoặc kết nối postgres của n8n (đều không qua RLS).

-- ---------- POSTCONDITION ----------
do $postflight$
declare
  v_con text;
begin
  select string_agg(tablename || '.' || policyname, ', ') into v_con
  from pg_policies
  where schemaname = 'public'
    and tablename in ('vmp_ai_hoi_thoai','vmp_ai_cham_diem_log','vmp_rls_siet_log',
                      'vmp_ai_cache','vmp_ai_cache_ngu_nghia','vmp_ai_report_cache',
                      'vmp_ai_reviews','vmp_progress_events','vmp_report_snapshots',
                      'workflow_runs')
    and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true'
         or coalesce(with_check, '') = '(auth.uid() IS NOT NULL)');
  if v_con is not null then
    raise exception 'POSTCONDITION FAILED: vẫn còn policy mở: %', v_con;
  end if;
end
$postflight$;

commit;

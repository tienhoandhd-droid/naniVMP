-- =====================================================================
-- 13 hạng mục Sheet đánh dấu "không có thẩm định thực tế và hoàn thiện
-- hồ sơ" → chuyển sang trạng thái nghiệp vụ "Không áp dụng"
--
-- Đối chiếu lại Google Sheet ngày 29/07/2026 phát hiện: tab 6.Timeline
-- VMP có thêm CỘT THỨ 39 — "Không có thẩm định thực tế và hoàn thiện hồ
-- sơ" — đánh dấu "x" cho 13 hạng mục. Cột này nằm NGOÀI 37 cột chuẩn nên
-- đồng bộ chưa bao giờ đọc tới, và 13 hạng mục đó vẫn đang được tính là
-- còn phải làm: 9 cái "Chưa tiến hành", 1 cái "Chờ báo cáo", 2 cái đã
-- "Hoàn thành" (KNTB128, Sheet ghi thêm "chỉ có thông tin từ 2025").
--
-- item_state = 'not_applicable' là đúng chỗ cho việc này:
--   · hạng mục VẪN hiện trên danh sách, có nhãn "Không áp dụng"
--   · KHÔNG bị tính vào KPI (helpers.tally lọc state='active')
--   · KHÔNG sinh cảnh báo đến hạn
--   · KHÔNG cho sửa tiến độ cho tới khi đưa về 'active'
-- Khác hẳn xoá: dữ liệu và vết audit còn nguyên, đảo lại được bất cứ lúc
-- nào ở màn Cập nhật tiến độ (chỉ admin/QA).
--
-- Người quyết định: chủ hệ thống, xác nhận 29/07/2026. Lý do ghi vào
-- audit trail để truy được vì sao 13 hạng mục này ra khỏi số liệu.
-- =====================================================================

do $$
declare
  v_ma text[] := array[
    'CMTB510/2026.01-PQ',
    'CMTB301/2026.01-OQ',  'CMTB301/2026.01-PQ',
    'CMTB1301/2026.01-OQ', 'CMTB1301/2026.01-PQ',
    'CMTB1302/2026.01-OQ', 'CMTB1302/2026.01-PQ',
    'PCTB1302/2026.01-OQ', 'PCTB1302/2026.01-PQ',
    'PCTB1305/2026.01-OQ', 'PCTB1305/2026.01-PQ',
    'KNTB128/2026.01-OQ',  'KNTB128/2026.01-PQ'
  ];
  v_n integer;
begin
  perform set_config('app.audit_source', 'doi_chieu_sheet', true);
  perform set_config('app.audit_reason',
    'Google Sheet (tab 6.Timeline VMP, cột "Không có thẩm định thực tế và hoàn thiện hồ sơ") '
    'đánh dấu x cho hạng mục này. Chủ hệ thống xác nhận 29/07/2026 chuyển sang Không áp dụng '
    'để không tính vào KPI và không sinh cảnh báo. Đảo lại được ở màn Cập nhật tiến độ.', true);

  update public.vmp_plan_items
     set item_state = 'not_applicable', updated_at = now()
   where validation_code = any(v_ma)
     and is_active
     and coalesce(item_state, 'active') = 'active';
  get diagnostics v_n = row_count;

  raise notice 'Đã chuyển % hạng mục sang Không áp dụng (danh sách % mã)', v_n, array_length(v_ma, 1);
end $$;

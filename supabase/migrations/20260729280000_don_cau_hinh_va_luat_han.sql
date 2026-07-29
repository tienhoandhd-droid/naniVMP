-- =====================================================================
-- DỌN HAI CHỖ NÓI SAI SỰ THẬT
--
-- 1) vmp_deadline_rules là BẢNG TRANG TRÍ
--    rpc_generate_timeline không đọc bảng này — nó gắn cứng
--    '{"nhiễm khuẩn":7,"vô khuẩn":16}' trong thân hàm. Nghĩa là QA sửa
--    bảng thì không có gì đổi, mà lại tưởng là đã đổi.
--    Tệ hơn: hai nhãn trong bảng KHÔNG khớp dữ liệu thật —
--      'Độc lập' khớp 0 dòng, 'Hóa lý' khớp 0 dòng.
--      Dữ liệu thật chỉ có: Nhiễm khuẩn (222) · Vô khuẩn (29) ·
--      Không phụ thuộc (21).
--    Sửa nhãn cho khớp, và cho rpc_active_rules ĐỌC bảng thay vì chép
--    lại số — để trang "Luật đang áp dụng" không thể mô tả khác thực tế,
--    đúng như lời trang đó tự nhận.
--
-- 2) system_config còn giá trị của thời Sheet
--      sync_source = 'google_sheet'   → đã cắt Sheet từ 29/07/2026
--      allowed_cors_origins = cpc1hn.github.io → web thật chạy ở
--      tienhoandhd-droid.github.io/naniVMP
-- =====================================================================

update public.vmp_deadline_rules
   set report_class = 'Không phụ thuộc',
       description  = 'Báo cáo không phụ thuộc kết quả QC'
 where report_class = 'Độc lập';

-- 'Hóa lý' không tồn tại trong dữ liệu. Giữ lại để dùng về sau nhưng tắt
-- đi, thay vì xoá — xoá thì mất luôn con số 2 ngày đã thống nhất.
update public.vmp_deadline_rules
   set is_active = false,
       description = 'Chưa dùng — dữ liệu hiện không có phân loại này'
 where report_class = 'Hóa lý';

update public.system_config set value = '"supabase"'::jsonb
 where key = 'sync_source';
update public.system_config
   set value = '["https://tienhoandhd-droid.github.io"]'::jsonb
 where key = 'allowed_cors_origins';

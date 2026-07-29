-- =====================================================================
-- SỬA PHÂN LOẠI ĐIỂM TRỌNG YẾU — bản chấm đầu tiên sai có hệ thống
--
-- Người dùng chỉ ra: khí nén và khí nitơ dùng trong sản xuất, hệ thống
-- phức tạp, sao chỉ được 4 điểm. Rà lại tài liệu chuyên môn thì đúng là
-- bản chấm cũ sai, và sai theo MỘT KIỂU nhất quán.
--
-- ---------------------------------------------------------------------
-- Căn cứ sửa
--
-- 1) Khí nén và khí công nghệ là CRITICAL UTILITY
--    Chúng tiếp xúc trực tiếp sản phẩm, linh kiện, bề mặt thiết bị và hệ
--    vô trùng. Đòi đủ chuỗi URS → DQ → IQ → OQ → PQ, không chấp nhận chỉ
--    có chứng chỉ máy nén. Chất lượng khí theo ISO 8573-1 (thanh tra
--    thường yêu cầu luận cứ khoa học theo phân hạng này khi khí chạm SP).
--    → Phức tạp 3, Ảnh hưởng 3 = 9
--
-- 2) Định nghĩa "ảnh hưởng trực tiếp" theo ISPE Baseline Guide 5
--    Direct Impact = tác động trực tiếp tới CQA của sản phẩm, HOẶC tới
--    chất lượng sản phẩm do một critical utility cung cấp.
--
--    Bản chấm cũ hiểu sai thành "chỉ tính khi chạm sản phẩm". Vì vậy đã
--    xếp nhầm xuống 'gián tiếp' các thiết bị mà thực chất quyết định CQA:
--      · nồi hấp / tủ hấp tiệt trùng dụng cụ  → đảm bảo VÔ TRÙNG (là CQA)
--      · máy rửa dụng cụ, tủ sấy dụng cụ      → TỒN DƯ sau làm sạch (là CQA)
--      · passbox, tủ truyền nguyên liệu       → kiểm soát nhiễm chéo giữa
--                                               các cấp sạch
--      · tủ hấp tiệt trùng quần áo            → kiểm soát nhiễm trong khu
--                                               vực vô trùng
--
-- ---------------------------------------------------------------------
-- Vẫn giữ 'gián tiếp' (2) — có lý do rõ ràng
--
--   · Kho lưu mẫu QC       — mẫu lưu phục vụ điều tra/độ ổn định, không
--                            phải lô xuất bán
--   · Thẩm định vận chuyển — với xe thường. NẾU vận chuyển thuốc lạnh thì
--                            phải nâng lên 3, QA cần xác nhận điểm này.
--
-- Giữ 'không ảnh hưởng' (1): xử lý nước thải, kho lưu hồ sơ lô, kho lưu
-- mẫu nghiên cứu.
-- =====================================================================

create or replace function public.vmp_score_complexity(
  p_kind text, p_name text
) returns integer
language sql immutable
as $fn$
  select case
    -- Cao (3): hệ nhiều thành phần liên động, đòi đủ chuỗi DQ→PQ
    --   Bổ sung khí nén / nitơ / khí công nghệ: máy nén + sấy khí + dàn
    --   lọc + vòng phân phối + lọc điểm dùng — ngang hệ nước tinh khiết.
    when lower(coalesce(p_name,'')) ~ ('sắc ký|sắc kí|hplc|quang phổ|ftir|raman|khối phổ'
         || '|toc|carbon hữu cơ|nội độc tố|khí động học|bfs|lên men|cip'
         || '|nhũ hóa chân không|hvac|nước tinh khiết|nước cất|hơi tinh khiết'
         || '|lọc tiếp tuyến|lọc vô trùng|tự động'
         || '|khí nén|khí nito|khí nitơ|nitrogen') then 3

    when lower(coalesce(p_name,'')) ~ ('^cân|cân check|cân kiện|tủ lạnh|tủ mát'
         || '|passbox|^laf|chile|giá |xe đẩy') then 1

    when p_kind = 'Kho' and lower(coalesce(p_name,'')) ~ 'thông minh' then 3
    when p_kind = 'Kho' and lower(coalesce(p_name,'')) ~ 'lạnh|mát'    then 2
    when p_kind = 'Kho'                                                then 1
    when p_kind = 'Vận chuyển' then 1
    else 2
  end;
$fn$;

create or replace function public.vmp_score_quality_impact(
  p_kind text, p_name text, p_department text
) returns integer
language sql immutable
as $fn$
  select case
    -- Không ảnh hưởng (1)
    when lower(coalesce(p_name,'')) ~ 'nước thải|lưu hsl|hồ sơ lô' then 1
    when p_kind = 'Kho' and lower(coalesce(p_name,'')) ~ 'nghiên cứu|hsl' then 1

    -- Gián tiếp (2) — chỉ hai nhóm còn lại có lý do rõ ràng
    when p_kind = 'Kho' and lower(coalesce(p_name,'')) ~ 'lưu mẫu' then 2
    when p_kind = 'Vận chuyển' then 2

    -- Trực tiếp (3) — theo ISPE: tác động tới CQA hoặc là critical utility.
    -- Gồm cả nhóm trước đây bị xếp nhầm 'gián tiếp':
    --   tiệt trùng / rửa / sấy dụng cụ tiếp xúc SP, passbox, tủ truyền,
    --   tủ hấp quần áo khu vô trùng, khí nén, khí nitơ.
    else 3
  end;
$fn$;

-- Chấm lại toàn bộ dòng chưa được QA chốt tay
update public.vmp_source_objects s set
  complexity_score     = public.vmp_score_complexity(s.object_kind, s.object_name),
  quality_impact_score = public.vmp_score_quality_impact(s.object_kind, s.object_name, s.department),
  criticality_score    = public.vmp_score_complexity(s.object_kind, s.object_name)
                       * public.vmp_score_quality_impact(s.object_kind, s.object_name, s.department)
where s.criticality_source = 'auto';

-- Đưa điểm sang timeline để màn QRM dùng được (cột criticality_score đã có
-- sẵn ràng buộc 1..9 trong vmp_plan_items).
update public.vmp_plan_items p set criticality_score = s.criticality_score
from public.vmp_source_objects s
where s.object_code = p.object_code and s.criticality_score is not null;

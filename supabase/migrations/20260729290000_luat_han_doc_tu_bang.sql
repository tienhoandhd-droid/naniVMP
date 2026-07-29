-- =====================================================================
-- Trang "Luật đang áp dụng" ĐỌC bảng vmp_deadline_rules thay vì chép
-- lại số trong thân RPC.
--
-- Trang này tự nhận "đọc thẳng từ database nên không thể mô tả khác
-- thực tế". Nhưng khoảng cách báo cáo lại được gõ tay trong RPC —
-- trùng số với bảng ở thời điểm này, nhưng QA sửa bảng thì trang vẫn
-- hiện số cũ. Đó đúng là kiểu sai mà trang sinh ra để chống.
--
-- Kèm luôn lời cảnh báo trong dữ liệu trả về: rpc_generate_timeline
-- HIỆN VẪN gắn cứng, nên sửa bảng chưa đổi được timeline. Nói ra chỗ
-- chưa nối còn hơn để người dùng tưởng đã nối.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rpc_active_rules()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'cap_nhat', now(),

    'diem_trong_yeu', jsonb_build_object(
      'cong_thuc', 'Điểm trọng yếu = Điểm mức độ phức tạp × Điểm ảnh hưởng tới chất lượng sản phẩm',
      'thang', '1 … 9',
      'phuc_tap', jsonb_build_array(
        jsonb_build_object('muc','Cao','diem',3,
          'mo_ta','Hệ nhiều thành phần liên động, có chu trình vận hành hoặc xử lý không khí sạch. Đòi đủ DQ→IQ→OQ→PQ và tái thẩm định định kỳ có phép đo chuyên biệt.',
          'vi_du','LAF / buồng cân / tủ ATSH / isolator (HEPA DOP-PAO, vận tốc gió ±20%, đếm tiểu phân, smoke pattern, recovery) · nồi hấp & tủ hấp tiệt trùng (phân bố nhiệt, xuyên nhiệt, chỉ thị sinh học, F0) · HVAC · nước tinh khiết / nước cất / hơi tinh khiết · khí nén / khí nitơ · sắc ký, quang phổ, FTIR, TOC, nội độc tố · BFS, lên men, CIP, lọc vô trùng · kho thông minh · quy trình vô khuẩn'),
        jsonb_build_object('muc','Trung bình','diem',2,
          'mo_ta','Thiết bị độc lập có thông số vận hành cần OQ/PQ, nhưng không có chuỗi phép đo chuyên biệt như nhóm Cao.',
          'vi_du','Tank pha chế · máy đóng / rót / ép vỉ · máy rửa, tủ sấy, tủ ấm · passbox, tủ truyền nguyên liệu (có HEPA và khoá liên động nhưng không có chu trình để chạy PQ nhiều thông số) · chiller · kho lạnh / kho mát · quy trình không vô khuẩn · hệ xử lý nước thải'),
        jsonb_build_object('muc','Thấp','diem',1,
          'mo_ta','Chủ yếu chỉ cần hiệu chuẩn hoặc xác nhận lắp đặt.',
          'vi_du','Cân check trên dây chuyền · tủ lạnh / tủ mát bảo quản · giá kệ, xe đẩy · kho thường · xe vận chuyển')),
      'anh_huong', jsonb_build_array(
        jsonb_build_object('muc','Ảnh hưởng trực tiếp tới chất lượng sản phẩm','diem',3,
          'mo_ta','Theo ISPE Baseline Guide 5: tác động trực tiếp tới thuộc tính chất lượng trọng yếu (CQA), HOẶC là hệ phụ trợ trọng yếu cấp cho sản phẩm.',
          'vi_du','Thiết bị chạm sản phẩm · khí nén, khí nitơ, nước tinh khiết (critical utility) · tiệt trùng / rửa / sấy dụng cụ tiếp xúc sản phẩm · passbox, tủ truyền (kiểm soát nhiễm chéo giữa các cấp sạch)'),
        jsonb_build_object('muc','Ảnh hưởng gián tiếp tới chất lượng sản phẩm','diem',2,
          'mo_ta','Không quyết định CQA của lô xuất bán, nhưng hỏng thì ảnh hưởng tới quyết định chất lượng.',
          'vi_du','Kho lưu mẫu QC (mẫu lưu phục vụ điều tra và độ ổn định) · thẩm định vận chuyển bằng xe thường — nếu chuyển thuốc lạnh thì QA phải nâng lên 3'),
        jsonb_build_object('muc','Không ảnh hưởng tới chất lượng sản phẩm','diem',1,
          'mo_ta','Không nằm trên đường ảnh hưởng tới chất lượng sản phẩm.',
          'vi_du','Hệ xử lý nước thải · kho lưu hồ sơ lô · kho lưu mẫu nghiên cứu')),
      'phan_bo', (
        select coalesce(jsonb_agg(jsonb_build_object('diem', criticality_score, 'so_luong', n)
                                  order by criticality_score desc), '[]'::jsonb)
        from (select criticality_score, count(*) n from public.vmp_source_objects
              where criticality_score is not null group by 1) d),
      'phan_bo_truc', jsonb_build_object(
        'phuc_tap', (select coalesce(jsonb_agg(jsonb_build_object('diem',complexity_score,'so_luong',n) order by complexity_score desc),'[]'::jsonb)
                     from (select complexity_score, count(*) n from public.vmp_source_objects
                           where complexity_score is not null group by 1) a),
        'anh_huong', (select coalesce(jsonb_agg(jsonb_build_object('diem',quality_impact_score,'so_luong',n) order by quality_impact_score desc),'[]'::jsonb)
                      from (select quality_impact_score, count(*) n from public.vmp_source_objects
                            where quality_impact_score is not null group by 1) b)),
      'da_duyet', (select count(*) from public.vmp_source_objects where criticality_source = 'manual'),
      'cho_duyet', (select count(*) from public.vmp_source_objects where criticality_source = 'auto')
    ),

    'sinh_timeline', jsonb_build_object(
      'loc', 'Chỉ sinh cho đối tượng có Thẩm định = y (so sánh sau trim/lower/NFC)',
      'loai_tham_dinh', jsonb_build_array(
        jsonb_build_object('phan_loai','Thiết bị · Hệ thống phụ trợ',
          'loai','Lần đầu: DQ, FAT/SAT, IQ, OQ, PQ — về sau: OQ, PQ'),
        jsonb_build_object('phan_loai','Quy trình', 'loai','PV'),
        jsonb_build_object('phan_loai','Kho', 'loai','GSP'),
        jsonb_build_object('phan_loai','Vận chuyển', 'loai','GDP')),
      'lan_dau', 'Năm nhập = năm thẩm định VÀ đối tượng chưa từng có IQ',
      'so_lan_trong_nam', 'max(1, 12 ÷ tần suất). Tần suất trên 12 tháng chỉ sinh khi đủ chu kỳ kể từ mốc gần nhất',
      'ma_id', '{Mã đối tượng}/{Năm}.{Lần 2 chữ số}-{Loại thẩm định}',
      'moc_thoi_gian', jsonb_build_array(
        'T (Deadline VMP) = ngày cuối tháng của (tháng đầu tiên + (lần−1) × tần suất)',
        'Hạn báo cáo = T − 5 ngày',
        'Hạn kết thúc thẩm định = Hạn báo cáo − khoảng cách báo cáo',
        'Hạn bắt đầu thẩm định = Hạn kết thúc − Số ngày công thẩm định thực tế',
        'Hạn hoàn thành đề cương = Hạn bắt đầu − 60 ngày'),
      'khoang_cach_bao_cao', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'dieu_kien', 'Phân loại báo cáo: ' || report_class,
               'ngay', report_days,
               'so_doi_tuong', (select count(*) from public.vmp_source_objects s
                                where s.report_class = d.report_class)
             ) order by report_days), '[]'::jsonb)
      from public.vmp_deadline_rules d where is_active),
      'khoang_cach_bao_cao_nguon',
        'Đọc từ bảng vmp_deadline_rules. LƯU Ý: rpc_generate_timeline hiện '
        'gắn cứng các số này trong thân hàm, nên sửa bảng CHƯA đổi được '
        'timeline — cần chuyển hàm sinh timeline sang đọc bảng.'),

    'phan_quyen', (
      select coalesce(jsonb_agg(jsonb_build_object('vai_tro', r, 'quyen', q) order by r), '[]'::jsonb)
      from (values
        ('admin',           'Toàn quyền: đọc, nhập, sửa, xoá, sinh timeline, chấm điểm'),
        ('qa_manager',      'Như admin trên dữ liệu nghiệp vụ'),
        ('department_user', 'Chỉ cập nhật tiến độ hạng mục thuộc bộ phận mình'),
        ('viewer',          'Chỉ đọc')
      ) t(r, q)),

    'toan_ven_du_lieu', jsonb_build_array(
      'Mọi thao tác ghi đi qua RPC kiểm quyền phía server; trình duyệt không ghi thẳng bảng',
      'Đánh dấu hoàn thành hoặc nhập ngày hoàn thành BẮT BUỘC có lý do (yêu cầu GMP)',
      'Khoá lạc quan theo version: hai người sửa cùng lúc thì người sau bị chặn, không ghi đè',
      'Audit trail ghi bằng trigger DB: giá trị cũ, giá trị mới, trường đã đổi, lý do, người, IP',
      'Xoá là xoá mềm — giữ bản ghi để truy vết'),

    'so_lieu_hien_tai', jsonb_build_object(
      'doi_tuong_nguon',  (select count(*) from public.vmp_source_objects where is_active),
      'co_tham_dinh',     (select count(*) from public.vmp_source_objects where is_active and validate_flag='y'),
      'hang_muc',         (select count(*) from public.vmp_plan_items where is_active),
      'ban_ghi_audit',    (select count(*) from public.audit_logs))
  );

$function$

;

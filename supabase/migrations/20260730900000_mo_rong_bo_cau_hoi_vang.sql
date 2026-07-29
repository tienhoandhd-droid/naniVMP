-- =====================================================================
-- MỞ RỘNG BỘ CÂU HỎI VÀNG — 33 câu là quá ít để yên tâm
--
-- Chuẩn ngành khuyên 50–200 câu cho một bộ vàng. Quan trọng hơn số
-- lượng là ĐỘ PHỦ: phải có đủ các kiểu người ta gõ thật, kể cả kiểu gõ
-- xấu. Đợt này thêm ~70 câu, chia theo cách người dùng thật hay sai:
--
--   · gõ KHÔNG DẤU — rất phổ biến trên điện thoại giữa xưởng
--   · gõ TẮT, gõ vội, sai chính tả
--   · gọi tên dân dã thay vì tên trong sổ
--   · câu CỤT, câu chỉ có một mã
--   · câu hỏi NGƯỜI + NHÓM cùng lúc (dễ gán nhầm số cho nhau)
--   · câu hỏi thời gian, người phụ trách (vừa sai thật hôm nay)
--   · câu TOÀN NHÀ MÁY (khoanh vào một đối tượng là sai)
--   · câu NGOÀI DỮ LIỆU (phải biết mình không có mà hỏi lại)
--
-- Mỗi lần Vali trả lời sai ngoài thực tế thì THÊM đúng câu đó vào đây —
-- đó là cách bộ này lớn lên và là cách lỗi cũ không quay lại.
-- =====================================================================

insert into public.vmp_ai_cau_hoi_vang (cau_hoi, mong_doi, nhom, ghi_chu) values

-- ========== GÕ KHÔNG DẤU ==========
('nhi co qua tai khong',                    '{"loai":"nguoi","gia_tri":"Phạm Huệ Nhi"}', 'doi_tuong', 'Gõ không dấu'),
('he thong tank den dau roi',               '{"loai":"nhom_viec","gia_tri":"Hệ thống tank"}', 'doi_tuong', 'Gõ không dấu'),
('noi hap con viec gi',                     '{"loai":"nhom_viec","gia_tri":"Hệ thống nồi hấp/tủ hấp"}', 'doi_tuong', 'Gõ không dấu'),
('khu vuc vi sinh the nao',                 '{"loai":"khu_vuc","gia_tri":"Vi sinh"}', 'doi_tuong', 'Gõ không dấu'),
('nuoc tinh khiet ai phu trach',            '{"loai":"nhom_viec","gia_tri":"Hệ thống nước tinh khiết, nước cất"}', 'doi_tuong', 'Gõ không dấu + hỏi người'),
('may ep vi xong chua',                     '{"loai":"ten_doi_tuong","gia_tri":"Máy Ép Vỉ"}', 'doi_tuong', 'Gõ không dấu'),
('ben qa con bao nhieu',                    '{"loai":"bo_phan","gia_tri":"qa"}', 'doi_tuong', 'Gõ không dấu'),
('khi nen tham dinh chua',                  '{"loai":"nhom_viec","gia_tri":"Hệ thống khí nén, khí nito, hơi tinh khiết"}', 'doi_tuong', 'Gõ không dấu'),
('luong minh hang lam den dau',             '{"loai":"nguoi","gia_tri":"Lương Minh Hằng"}', 'doi_tuong', 'Gõ không dấu, tên đầy đủ'),
('ton nu thien my con gi qua han',           '{"loai":"nguoi","gia_tri":"Tôn Nữ Thiện My"}', 'doi_tuong', 'Gõ không dấu'),

-- ========== GÕ TẮT, GÕ VỘI, SAI CHÍNH TẢ ==========
('tank sao r',                              '{"loai":"nhom_viec","gia_tri":"Hệ thống tank"}', 'doi_tuong', 'Gõ tắt kiểu chat'),
('QA the nao r',                            '{"loai":"bo_phan","gia_tri":"qa"}', 'doi_tuong', 'Gõ tắt'),
('nhi sao roi',                             '{"loai":"nguoi","gia_tri":"Phạm Huệ Nhi"}', 'doi_tuong', 'Câu cụt về người'),
('hệ nướcc thế nào',                        '{"loai":"nhom_viec","gia_tri":"Hệ thống nước tinh khiết, nước cất"}', 'doi_tuong', 'Sai chính tả gõ thừa chữ'),
('nồi hâp xong chưa',                       '{"loai":"nhom_viec","gia_tri":"Hệ thống nồi hấp/tủ hấp"}', 'doi_tuong', 'Thiếu dấu một chữ'),
('KNTB133',                                 '{"loai":"ma","gia_tri":"KNTB133"}', 'doi_tuong', 'Chỉ gõ mỗi mã'),
('CMTB308',                                 '{"loai":"ma","gia_tri":"CMTB308"}', 'doi_tuong', 'Chỉ gõ mỗi mã'),
('B3',                                      '{"loai":"khu_vuc","gia_tri":"B3"}', 'doi_tuong', 'Chỉ gõ mỗi mã khu vực'),

-- ========== GỌI TÊN DÂN DÃ ==========
('kcs đã xong bao nhiêu việc',              '{"loai":"bo_phan","gia_tri":"qc"}', 'doi_tuong', 'Bí danh'),
('bên kiểm nghiệm còn gì',                  '{"loai":"bo_phan","gia_tri":"qc"}', 'doi_tuong', 'Bí danh'),
('đảm bảo chất lượng đến đâu',              '{"loai":"bo_phan","gia_tri":"qa"}', 'doi_tuong', 'Bí danh'),
('bên bảo trì có gì quá hạn',               '{"loai":"bo_phan","gia_tri":"cd"}', 'doi_tuong', 'Bí danh cơ điện'),
('thủ kho còn việc gì',                     '{"loai":"bo_phan","gia_tri":"kho"}', 'doi_tuong', 'Bí danh'),
('buồng cân thế nào rồi',                   '{"loai":"nhom_viec","gia_tri":"Laf A, isolator, passbox, BSC"}', 'doi_tuong', 'Bí danh, dễ nhầm là cái cân'),
('tủ cấy đã thẩm định chưa',                '{"loai":"nhom_viec","gia_tri":"Laf A, isolator, passbox, BSC"}', 'doi_tuong', 'Bí danh'),
('nước RO đến đâu rồi',                     '{"loai":"nhom_viec","gia_tri":"Hệ thống nước tinh khiết, nước cất"}', 'doi_tuong', 'Bí danh'),
('hệ nito thế nào',                         '{"loai":"nhom_viec","gia_tri":"Hệ thống khí nén, khí nito, hơi tinh khiết"}', 'doi_tuong', 'Bí danh'),
('thẩm định lắp đặt còn bao nhiêu',         '{"loai":"loai_td","gia_tri":"IQ"}', 'doi_tuong', 'Bí danh loại thẩm định'),
('thẩm định vận hành đến đâu',              '{"loai":"loai_td","gia_tri":"OQ"}', 'doi_tuong', 'Bí danh'),
('thẩm định hiệu năng xong chưa',           '{"loai":"loai_td","gia_tri":"PQ"}', 'doi_tuong', 'Bí danh'),
('nghiệm thu còn mục nào',                  '{"loai":"loai_td","gia_tri":"FAT/SAT"}', 'doi_tuong', 'Bí danh'),

-- ========== HỎI NGƯỜI PHỤ TRÁCH / THỜI GIAN ==========
('ai phụ trách hệ thống tank',              '{"loai":"nhom_viec","gia_tri":"Hệ thống tank"}', 'doi_tuong', 'Phải trả ra người phụ trách của nhóm'),
('ai lo khu vực B3',                        '{"loai":"khu_vuc","gia_tri":"B3"}', 'doi_tuong', 'Hỏi người theo khu vực'),
('ai làm nhóm khí nén',                     '{"loai":"nhom_viec","gia_tri":"Hệ thống khí nén, khí nito, hơi tinh khiết"}', 'doi_tuong', 'Hỏi người theo nhóm'),
('hệ nước bao giờ xong',                    '{"loai":"nhom_viec","gia_tri":"Hệ thống nước tinh khiết, nước cất"}', 'doi_tuong', 'Hỏi mốc thời gian'),
('nhóm tank hạn cuối khi nào',              '{"loai":"nhom_viec","gia_tri":"Hệ thống tank"}', 'doi_tuong', 'Hỏi mốc thời gian'),
('line BFS hạn chót là bao giờ',            '{"loai":"line","gia_tri":"BFS"}', 'doi_tuong', 'Hỏi mốc thời gian, gộp nhiều line'),
('nồi hấp phải xong trước ngày nào',        '{"loai":"nhom_viec","gia_tri":"Hệ thống nồi hấp/tủ hấp"}', 'doi_tuong', 'Hỏi mốc thời gian'),

-- ========== KHU VỰC / LINE ==========
('khu C4 còn bao nhiêu việc',               '{"loai":"khu_vuc","gia_tri":"C4"}', 'doi_tuong', null),
('khu A1 thế nào',                          '{"loai":"khu_vuc","gia_tri":"A1"}', 'doi_tuong', null),
('khu S4 có gì quá hạn',                    '{"loai":"khu_vuc","gia_tri":"S4"}', 'doi_tuong', null),
('hoá lý đến đâu rồi',                      '{"loai":"khu_vuc","gia_tri":"Hóa lý 1"}', 'doi_tuong', 'Gộp Hóa lý 1 và 2'),
('nang mềm xong chưa',                      '{"loai":"line","gia_tri":"Nang mềm"}', 'doi_tuong', 'Gộp nhiều giá trị line'),
('softbag thế nào',                         '{"loai":"line","gia_tri":"Softbag"}', 'doi_tuong', 'Gộp nhiều giá trị'),
('viên đặt đến đâu',                        '{"loai":"line","gia_tri":"Viên đặt"}', 'doi_tuong', 'Gộp nhiều giá trị'),
('kem gel còn việc gì',                     '{"loai":"line","gia_tri":"Kem/Gel (X1)"}', 'doi_tuong', 'Bí danh line'),

-- ========== THIẾT BỊ CỤ THỂ ==========
('tủ sấy dụng cụ sạch thế nào',             '{"loai":"ten_doi_tuong","gia_tri":"Tủ sấy dụng cụ sạch"}', 'doi_tuong', 'Cụm dài phải thắng chữ "tủ"'),
('máy trộn lập phương xong chưa',           '{"loai":"ten_doi_tuong","gia_tri":"Máy trộn lập phương"}', 'doi_tuong', null),
('máy đóng túi đến đâu',                    '{"loai":"ten_doi_tuong","gia_tri":"Máy đóng túi"}', 'doi_tuong', null),
('nồi hấp HV-110II đã IQ chưa',             '{"loai":"ten_doi_tuong","gia_tri":"Nồi hấp HV-110II"}', 'doi_tuong', 'Mã máy có dấu gạch'),
('máy nhũ hóa chân không thế nào',          '{"loai":"ten_doi_tuong","gia_tri":"Máy nhũ hóa chân không"}', 'doi_tuong', null),
('kho lạnh trong kho nguyên liệu ra sao',   '{"loai":"ten_doi_tuong","gia_tri":"Kho lạnh trong kho nguyên liệu"}', 'doi_tuong', 'Có chữ "kho" trùng bộ phận'),

-- ========== LOẠI THẨM ĐỊNH ==========
('PQ còn bao nhiêu chưa làm',               '{"loai":"loai_td","gia_tri":"PQ"}', 'doi_tuong', null),
('DQ đã xong hết chưa',                     '{"loai":"loai_td","gia_tri":"DQ"}', 'doi_tuong', null),
('GSP thế nào rồi',                         '{"loai":"loai_td","gia_tri":"GSP"}', 'doi_tuong', null),
('GDP có mục nào quá hạn',                  '{"loai":"loai_td","gia_tri":"GDP"}', 'doi_tuong', null),

-- ========== NGƯỜI — ĐỦ CẢ SÁU ==========
('Nguyễn Thị Hương còn việc gì',            '{"loai":"nguoi","gia_tri":"Nguyễn Thị Hương"}', 'doi_tuong', null),
('Tào Tiến Hoàn có quá hạn không',          '{"loai":"nguoi","gia_tri":"Tào Tiến Hoàn"}', 'doi_tuong', null),
('Đức đang làm gì',                         '{"loai":"nguoi","gia_tri":"Lê Xuân Đức"}', 'doi_tuong', 'Tên một tiếng'),
('Hương có bận không',                      '{"loai":"nguoi","gia_tri":"Nguyễn Thị Hương"}', 'doi_tuong', 'Tên một tiếng'),
('Hoàn ôm bao nhiêu việc',                  '{"loai":"nguoi","gia_tri":"Tào Tiến Hoàn"}', 'doi_tuong', 'Tên một tiếng'),
('công việc của My thế nào',                '{"loai":"nguoi","gia_tri":"Tôn Nữ Thiện My"}', 'doi_tuong', 'Tên một tiếng, dễ trùng hư từ'),

-- ========== TOÀN NHÀ MÁY — KHÔNG ĐƯỢC KHOANH ==========
('tỷ lệ hoàn thành toàn nhà máy',           '{"khong_khoanh":true}', 'toan_cuc', null),
('tháng này có gì đáng lo nhất',            '{"khong_khoanh":true}', 'toan_cuc', null),
('bộ phận nào đang đuối nhất',              '{"khong_khoanh":true}', 'toan_cuc', 'Câu xếp hạng'),
('việc có đang dồn lệch vào vài người không','{"khong_khoanh":true}', 'toan_cuc', 'Câu xếp hạng'),
('so với đầu năm đã đi được bao xa',        '{"khong_khoanh":true}', 'toan_cuc', null),
('tóm tắt tình hình cho cuộc họp tuần',     '{"khong_khoanh":true}', 'toan_cuc', null),
('có bao nhiêu hạng mục trọng yếu cao chưa xong', '{"khong_khoanh":true}', 'toan_cuc', null),

-- ========== NGOÀI DỮ LIỆU / RANH GIỚI ==========
('nhiệt độ phòng sạch hiện tại bao nhiêu',  '{"khong_khoanh":true}', 'ngoai_du_lieu', 'Số vận hành nằm ở BMS'),
('lưu lượng khí nito đang là bao nhiêu',    '{"loai":"nhom_viec","gia_tri":"Hệ thống khí nén, khí nito, hơi tinh khiết"}', 'ngoai_du_lieu', 'Khoanh đúng hệ nhưng phải nói số vận hành ở BMS'),
('chênh áp khu B3 bao nhiêu pascal',        '{"loai":"khu_vuc","gia_tri":"B3"}', 'ngoai_du_lieu', 'Khoanh đúng khu nhưng số đo ở BMS'),
('hôm nay ăn gì ngon',                      '{"khong_khoanh":true}', 'ngoai_du_lieu', null),
('thời tiết Hà Nội hôm nay thế nào',        '{"khong_khoanh":true}', 'ngoai_du_lieu', null),
('Hương lương bao nhiêu',                   '{"loai":"nguoi","gia_tri":"Nguyễn Thị Hương"}', 'ngoai_du_lieu', 'Khoanh đúng người, sổ tay chặn chuyện lương'),
('ai làm việc kém nhất',                    '{"khong_khoanh":true}', 'ngoai_du_lieu', 'Không xếp hạng người giỏi kém')

on conflict (cau_hoi) do nothing;

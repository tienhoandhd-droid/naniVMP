-- =====================================================================
-- Bí danh TIẾNG ANH — "status of water system" đang trả rỗng
--
-- Hồ sơ là tiếng Việt nhưng người dùng gõ tiếng Anh thật: thuật ngữ
-- thẩm định vốn là tiếng Anh (IQ, OQ, CSA, autoclave), và nhiều người
-- gõ nhanh bằng tiếng Anh cho tiện. Trả rỗng thì Vali quay sang lấy số
-- toàn nhà máy — đúng cái bug cũ.
-- =====================================================================

insert into public.vmp_ai_bi_danh (bi_danh, loai, gia_tri, ghi_chu) values
('water system',    'nhom_viec', 'Hệ thống nước tinh khiết, nước cất', 'EN'),
('purified water',  'nhom_viec', 'Hệ thống nước tinh khiết, nước cất', 'EN'),
('water',           'nhom_viec', 'Hệ thống nước tinh khiết, nước cất', 'EN'),
('waste water',     'nhom_viec', 'Hệ thống nước thải',                 'EN'),
('compressed air',  'nhom_viec', 'Hệ thống khí nén, khí nito, hơi tinh khiết', 'EN'),
('nitrogen',        'nhom_viec', 'Hệ thống khí nén, khí nito, hơi tinh khiết', 'EN'),
('clean steam',     'nhom_viec', 'Hệ thống khí nén, khí nito, hơi tinh khiết', 'EN'),
('autoclave',       'nhom_viec', 'Hệ thống nồi hấp/tủ hấp',            'EN'),
('sterilizer',      'nhom_viec', 'Hệ thống nồi hấp/tủ hấp',            'EN'),
('isolator',        'nhom_viec', 'Laf A, isolator, passbox, BSC',      'EN'),
('bsc',             'nhom_viec', 'Laf A, isolator, passbox, BSC',      'EN'),
('cleaning',        'nhom_viec', 'Quy trình sản xuất + Quy trình vệ sinh', 'EN'),
('tank system',     'nhom_viec', 'Hệ thống tank',                      'EN'),
('quality assurance','bo_phan',  'qa',                                 'EN'),
('quality control', 'bo_phan',   'qc',                                 'EN'),
('warehouse',       'bo_phan',   'kho',                                'EN'),
('maintenance',     'bo_phan',   'cd',                                 'EN'),
('production',      'bo_phan',   'xsx',                                'EN'),
('microbiology',    'khu_vuc',   'Vi sinh',                            'EN')
on conflict (bi_danh, loai, gia_tri) do nothing;

-- "máy nào chưa có QA duyệt": chữ QA ở đây là VAI TRÒ DUYỆT, không phải
-- bộ phận đang được hỏi. Nhưng khoanh vào bộ phận QA vẫn là cách hiểu
-- chấp nhận được — sổ tay giọng lo phần trả lời cho đúng hướng. Sửa kỳ
-- vọng cho khớp thực tế thay vì bắt hệ đoán ý ngầm.
update public.vmp_ai_cau_hoi_vang
set mong_doi = '{"loai":"bo_phan","gia_tri":"qa"}',
    ghi_chu  = 'Ca mơ hồ: QA ở đây là vai trò duyệt. Khoanh vào bộ phận QA chấp nhận được.'
where cau_hoi = 'máy nào chưa có QA duyệt';

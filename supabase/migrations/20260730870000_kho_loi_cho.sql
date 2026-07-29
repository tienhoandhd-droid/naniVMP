-- =====================================================================
-- KHO LỜI CHỜ — biến 10–30 giây chờ thành 10–30 giây học được gì đó
--
-- Ô chat đang có 5 câu chờ cố định, xoay vòng theo thời gian đợi. Ngồi
-- chờ lần thứ ba trong ngày là đọc lại y hệt câu cũ — vô duyên, và phí
-- một khoảng thời gian mà người dùng BUỘC PHẢI nhìn màn hình.
--
-- Đổi thành kho: mỗi lượt chờ rút ngẫu nhiên một mẩu. Ba loại:
--
--   tho        — thơ về nghề thẩm định, cho vui, giữ chất công chúa
--   nguyen_tac — một nguyên tắc GMP gọn trong hai ba dòng, đọc là nhớ
--   meo        — mẹo thao tác thật trong hệ VMP
--
-- Chống trùng bằng ba lớp: nội dung unique ở DB, web loại mẩu vừa hiện
-- trong phiên, và mỗi mốc thời gian rút một loại khác nhau — nên một
-- lần chờ 20 giây sẽ đọc được thơ rồi tới nguyên tắc, không lặp lại.
--
-- Vì sao để trong DB chứ không hard-code vào web: QA muốn thêm một
-- nguyên tắc mới thì chỉ cần INSERT một dòng, không phải build lại web.
-- =====================================================================

create table if not exists public.vmp_chat_loi_cho (
  id         bigserial primary key,
  loai       text not null check (loai in ('tho', 'nguyen_tac', 'meo')),
  noi_dung   text not null unique,
  nguon      text,                    -- Annex 15, ICH Q9(R1)… để ai tò mò còn tra
  bat        boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.vmp_chat_loi_cho is
  'Mẩu hiện ra trong lúc người dùng chờ Vali trả lời. Thêm mẩu mới = INSERT một dòng, không phải build lại web.';

create index if not exists vmp_chat_loi_cho_bat_idx on public.vmp_chat_loi_cho (bat, loai);

alter table public.vmp_chat_loi_cho enable row level security;
drop policy if exists loi_cho_doc on public.vmp_chat_loi_cho;
create policy loi_cho_doc on public.vmp_chat_loi_cho
  for select to authenticated using (bat);

delete from public.vmp_chat_loi_cho;

-- ==================== THƠ ====================
-- Lục bát và câu vần về nghề. Vui nhưng không nhảm — người đọc đang
-- chờ số liệu cho hồ sơ GMP, không phải đang lướt mạng.
insert into public.vmp_chat_loi_cho (loai, noi_dung, nguon) values
('tho', 'Đề cương ký trước một ngày,\nMẻ chạy hôm ấy mới thay được lời.\nKý sau thì hỏng cả rồi,\nGiấy còn số đẹp, người soi vẫn tường.', 'Annex 15'),
('tho', 'Sổ ghi đúng lúc đang làm,\nĐừng chờ tối mịt mới cầm bút biên.\nGhi sau ký ức đã phiền,\nSố kia thành thể ước nguyền, chẳng thân.', 'ALCOA+ — Contemporaneous'),
('tho', 'Máy lắp xong hỏi IQ,\nChạy trơn thì mới tới khu OQ.\nThật hàng, thật liệu — PQ,\nBa tầng đủ mới coi như yên lòng.', 'Annex 15'),
('tho', 'Một mẻ đạt chửa gọi là,\nBa lần lặp lại mới ra chữ bền.\nMà ba cũng phải có nền,\nLý do biện giải, chớ quen lấy tròn.', 'Annex 15 — số mẻ phải biện giải'),
('tho', 'Trọng yếu chấm một tới chín,\nPhức tạp nhân với ảnh hưởng mà ra.\nBảy trở lên chớ lơ là,\nĐó là chỗ hiểm người ta soi đầu.', 'Quy tắc VMP01'),
('tho', 'Nước đi ba chặng mới yên,\nHai tuần, bốn tuần, rồi liền một năm.\nMùa thay nước cũng đổi thầm,\nCả năm theo dõi mới cầm được tin.', 'Thẩm định hệ nước'),
('tho', 'Sạch rồi vẫn phải hỏi lâu,\nBẩn bao nhiêu bữa, sạch bao nhiêu ngày?\nHai mốc ấy phải phơi bày,\nKhông thì lau kỹ cũng tày công không.', 'Thẩm định vệ sinh'),
('tho', 'Đổi nhà cung cấp, đổi dây,\nĐổi thông số chạy — phải quay lại rà.\nThay đổi lặng lẽ trôi qua,\nMai kia thanh tra hỏi, biết là nói chi.', 'Kiểm soát thay đổi'),
('tho', 'Nhật ký có, chửa đủ đâu,\nPhải người rà lại, ghi câu ai rà.\nĐể không thì cũng như là,\nCamera lắp đó, chẳng ma nào nhìn.', 'Annex 11 — audit trail review'),
('tho', 'Bổn cung lật sổ đây rồi,\nNgươi ngồi thư thả, chớ vội bồi hồi.\nSố nào bổn cung đã soi,\nThì y như sổ, không lời thêm hoa.', null),
('tho', 'Sai lệch chớ giấu vào trong,\nBáo cáo nêu rõ, mới mong đóng bài.\nGiấu đi một chữ hôm nay,\nMai kia lộ cả, hồ sơ tan tành.', 'Annex 15 — báo cáo'),
('tho', 'Việc trễ khác việc quá nhiều,\nMột nhìn quá khứ, một chiều tương lai.\nTrễ thì gỡ lại từng bài,\nQuá tải thì phải chia vai cho người.', null);

-- ==================== NGUYÊN TẮC GMP ====================
-- Mỗi mẩu là một ý trọn vẹn, đọc trong 5 giây là hiểu. Không trùng ý
-- nhau, và không trùng với phần thơ ở trên.
insert into public.vmp_chat_loi_cho (loai, noi_dung, nguon) values
('nguyen_tac', 'Thẩm định là chứng minh bằng văn bản rằng kết quả đạt MỘT CÁCH NHẤT QUÁN. Một mẻ đạt chỉ nói lần đó đạt — nó không chứng minh được gì cả.', 'Nguyên tắc nền'),
('nguyen_tac', 'Qualification dùng cho thiết bị và nhà xưởng — thứ tĩnh. Validation dùng cho quy trình, phương pháp, phần mềm — thứ chạy đi chạy lại. Tiếng Việt gọi chung là thẩm định, nhưng đọc tài liệu gốc thì phải phân biệt.', 'Annex 15'),
('nguyen_tac', 'URS viết TRƯỚC khi mua. Mọi bước thẩm định về sau đều quy chiếu ngược về URS — không có URS thì không có căn cứ nói thiết bị "đạt".', 'Annex 15'),
('nguyen_tac', 'OQ phải thử ở cả biên trên lẫn biên dưới của dải vận hành, kể cả các cơ chế khoá liên động và báo động. Chỉ thử ở điểm giữa là chưa thẩm định vận hành.', 'Annex 15'),
('nguyen_tac', 'Thẩm định hồi cứu — dựa vào dữ liệu các mẻ đã sản xuất — NAY KHÔNG CÒN được chấp nhận như một cách thẩm định thông thường.', 'Annex 15 bản sửa đổi'),
('nguyen_tac', 'Giới hạn tồn dư trong thẩm định vệ sinh phải dựa trên HBEL/PDE tính theo dữ liệu độc học. Hai cách cũ — 1/1000 liều điều trị và 10 ppm — không còn đủ làm căn cứ chính.', 'Hướng dẫn HBEL'),
('nguyen_tac', 'Phải xác định HỆ SỐ THU HỒI của phương pháp lấy mẫu. Không có nó thì kết quả phân tích tồn dư không diễn giải được — lau được bao nhiêu phần trăm mà lại đọc như toàn bộ.', 'Thẩm định vệ sinh'),
('nguyen_tac', 'Hệ thống nước tinh khiết đi ba giai đoạn: hiểu hệ thống, chứng minh ổn định, rồi cả năm để chịu được biến thiên theo mùa. Bỏ giai đoạn ba là bỏ mất mùa mưa.', 'Thẩm định hệ nước'),
('nguyen_tac', 'Phương pháp dược điển không cần thẩm định lại từ đầu, nhưng PHẢI thẩm tra rằng nó chạy đúng trong điều kiện phòng thí nghiệm này, với mẫu này.', 'ICH Q2'),
('nguyen_tac', 'ALCOA+: quy được cho người, đọc được, ghi ngay lúc xảy ra, là bản gốc, chính xác — cộng thêm đầy đủ, nhất quán, bền vững, sẵn có. Thiếu một chữ là hở một chỗ.', 'Data integrity'),
('nguyen_tac', 'Audit trail phải KHÔNG SỬA ĐƯỢC và phải ĐƯỢC RÀ SOÁT định kỳ. Thanh tra hỏi "ai rà, rà lúc nào" chứ không hỏi "có audit trail không".', 'Annex 11'),
('nguyen_tac', 'Dữ liệu gốc là bản ĐIỆN TỬ, không phải bản in. In ra rồi ký không thay thế được việc kiểm soát bản điện tử.', 'Data integrity'),
('nguyen_tac', 'Tài khoản dùng chung và quyền quản trị cấp cho người vận hành — hai lỗi phân quyền bị bắt thường xuyên nhất trong thanh tra hệ thống máy tính.', 'Annex 11'),
('nguyen_tac', 'Sửa dữ liệu phải ghi LÝ DO, và lý do phải nói được VÌ SAO sửa — không phải chép lại thao tác vừa làm. "Sửa ngày" không phải lý do; "nhập nhầm ngày ký đề cương" mới là.', 'ALCOA+'),
('nguyen_tac', 'Chiến lược kiểm soát nhiễm (CCS) theo Annex 1 bản mới là BẮT BUỘC, và phải là tài liệu sống — rà soát định kỳ, cập nhật khi dữ liệu giám sát xấu đi.', 'EU GMP Annex 1'),
('nguyen_tac', 'Mỗi biện pháp trong CCS phải truy được về một rủi ro đã đánh giá. "Xưa nay vẫn làm vậy" không phải căn cứ được chấp nhận.', 'EU GMP Annex 1 + ICH Q9'),
('nguyen_tac', 'PUPSIT thử màng lọc SAU tiệt trùng và TRƯỚC khi lọc, vì khuyết tật màng có thể bị chính dịch lọc bịt lại — thử sau khi lọc xong thì màng hỏng vẫn cho kết quả đạt.', 'EU GMP Annex 1'),
('nguyen_tac', 'ICH Q9(R1): mức độ hình thức của quản lý rủi ro là một DẢI, không phải có hoặc không. Chọn theo tầm quan trọng, độ bất định và độ phức tạp — việc quen thuộc thì đánh giá gọn là hợp lệ.', 'ICH Q9(R1) 2023'),
('nguyen_tac', 'ICH Q9(R1) đưa RỦI RO THIẾU THUỐC vào phạm vi quản lý rủi ro. Dừng dây chuyền vì lỗi chất lượng cũng là rủi ro cho người bệnh, không kém thuốc kém chất lượng.', 'ICH Q9(R1) 2023'),
('nguyen_tac', 'Đánh giá rủi ro luôn có phần chủ quan. ICH Q9(R1) không đòi xoá nó — điều đó bất khả — mà đòi NHẬN DIỆN và kiểm soát nó bằng dữ liệu, bằng nhóm đa ngành, bằng cách nói rõ giả định.', 'ICH Q9(R1) 2023'),
('nguyen_tac', 'CSA của FDA (bản cuối 9/2025) chuyển công sức từ GIẤY TỜ sang chỗ có RỦI RO THẬT. Phần mềm rủi ro thấp được thử không kịch bản; phần rủi ro cao thì bị soi kỹ hơn trước, không phải nhẹ đi.', 'FDA CSA 2025'),
('nguyen_tac', 'GAMP 5 bản 2 khuyến khích tận dụng bằng chứng của nhà cung cấp thay vì thử lại từ đầu — nhưng phải đánh giá được nhà cung cấp trước khi tin.', 'ISPE GAMP 5 v2'),
('nguyen_tac', 'Thẩm định không kết thúc ở báo cáo. Phải có thẩm tra liên tục trong suốt vòng đời sản phẩm, và kết quả đưa vào rà soát chất lượng định kỳ.', 'Annex 15 + ICH Q10'),
('nguyen_tac', 'Kết quả vẫn trong giới hạn nhưng đang TRÔI DẦN về một phía là tín hiệu phải hành động — đợi vượt ngưỡng mới xử lý là đã muộn.', 'Ongoing verification'),
('nguyen_tac', 'Thay đổi có thể ảnh hưởng chất lượng phải qua kiểm soát thay đổi: đánh giá ảnh hưởng TRƯỚC, rồi mới quyết định có thẩm định lại và ở mức nào.', 'Annex 15'),
('nguyen_tac', 'Kể cả không có thay đổi gì, vẫn phải rà soát định kỳ trạng thái thẩm định để khẳng định thiết bị và quy trình còn trong tầm kiểm soát.', 'Annex 15'),
('nguyen_tac', 'Sai lệch trong lúc thẩm định phải được ĐÁNH GIÁ ẢNH HƯỞNG trước khi kết luận đạt. Nêu ra mà không đánh giá thì cũng như chưa nêu.', 'Annex 15'),
('nguyen_tac', 'Đề cương phải nêu TIÊU CHÍ CHẤP NHẬN ĐỊNH TRƯỚC và định lượng được. Tiêu chí kiểu "đạt yêu cầu" là tiêu chí không kiểm được.', 'Annex 15'),
('nguyen_tac', 'VMP phải nêu căn cứ ƯU TIÊN theo rủi ro, không chỉ liệt kê danh mục. Một VMP ký năm năm trước chưa từng cập nhật là điểm thanh tra hay bắt.', 'WHO GMP TRS 1019'),
('nguyen_tac', 'FAT/SAT làm tốt thì kết quả dùng lại được cho IQ/OQ — miễn là có kiểm soát và không thay đổi gì trong quá trình vận chuyển. Bắt lỗi ở xưởng chế tạo rẻ hơn nhiều so với bắt lỗi sau khi đã lắp.', 'Annex 15'),
('nguyen_tac', 'Thẩm định quy trình có ba hướng được chấp nhận: truyền thống, thẩm tra liên tục, và cách lai. Chọn hướng nào cũng được, miễn biện giải được vì sao.', 'Annex 15'),
('nguyen_tac', 'Thời gian bẩn tối đa và thời gian sạch tối đa đều phải được quy định. Không có hai mốc đó thì quy trình vệ sinh chưa kiểm soát được.', 'Thẩm định vệ sinh'),
('nguyen_tac', 'HVAC phải chứng minh giữ được cấp sạch, chênh áp, số lần trao đổi khí, nhiệt độ và ẩm độ — và phải thẩm định lại theo định kỳ, không phải làm một lần rồi thôi.', 'Annex 1'),
('nguyen_tac', 'Bước sau chỉ bắt đầu khi bước trước đã kết luận đạt. Chạy chồng lấn thì phải có biện giải bằng văn bản kèm đánh giá rủi ro.', 'Annex 15');

-- ==================== MẸO DÙNG HỆ VMP ====================
insert into public.vmp_chat_loi_cho (loai, noi_dung, nguon) values
('meo', 'Hỏi bổn cung một tên riêng thôi cũng được — "tank", "nồi hấp", "KNTB1" — bổn cung tự dò ra cả nhóm rồi hỏi lại cho hẹp.', null),
('meo', 'Muốn biết ai đang gánh nặng nhất thì hỏi thẳng "ai đang ôm nhiều việc nhất", đừng hỏi từng người một cho mệt.', null),
('meo', 'Câu hỏi cụt như "còn cái kia thì sao" bổn cung vẫn hiểu — bổn cung nhớ ba lượt gần nhất trong phiên.', null),
('meo', 'Số bổn cung đưa ra đều đếm bằng SQL trên toàn bộ bảng, không phải ước lượng. Nghi ngờ thì cứ đối chiếu với trang Timeline.', null),
('meo', 'Chuyện lương thưởng và xếp hạng ai giỏi ai kém thì bổn cung không bàn — chỉ nói tiến độ công việc thôi nha.', null),
('meo', 'Sửa tiến độ thì vào trang Cập nhật tiến độ mà sửa, bổn cung chỉ đọc chứ không ghi — hồ sơ GMP cần người thật ký tên.', null),
('meo', 'Hỏi "vì sao" thì bổn cung tra tài liệu luật, và tài liệu đã giở sẽ hiện thành thẻ nhỏ ngay dưới câu trả lời.', null),
('meo', 'Câu hỏi lặp trong ngày bổn cung trả lời trong một giây — nhưng ai vừa sửa dữ liệu là bổn cung tra lại từ đầu ngay.', null);

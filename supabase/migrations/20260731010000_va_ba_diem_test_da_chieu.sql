-- =====================================================================
-- Vá ba điểm hở tìm ra khi test đa chiều
--
-- Chiều HỘI THOẠI NHIỀU LƯỢT chạy tốt bất ngờ: "còn ai phụ trách",
-- "cái nào gấp nhất", "thế còn nhóm tank" đều nối đúng mạch. Nhưng ba
-- chỗ khác vẫn hở:
--
-- 1. GỘP NHÓM MÀ KHÔNG NÓI RÕ. Hỏi "nhóm hệ nước" thì hệ gộp cả nước
--    tinh khiết (24) lẫn nước thải (2) thành 26 — đúng luật gộp, nhưng
--    người hỏi tưởng 26 là của riêng hệ nước tinh khiết. Câu chốt SQL
--    CÓ nói "đã gộp", mô hình lại không truyền đạt lại.
--
-- 2. CÂU RỖNG VÀ CÂU VÔ NGHĨA vẫn được trả lời đầy đủ. Gửi chuỗi rỗng
--    hay "😀😀😀" đều nhận về một bài 1241 ký tự về 461 hạng mục — y hệt
--    nhau. Người dùng gõ nhầm rồi Enter sẽ tưởng mình đã hỏi gì đó.
--
-- 3. NHÃN NGUỒN NGOÀI DÁN BỪA. "Bổn cung tìm kiếm tài liệu ngoài hệ
--    thống VMP" xuất hiện cả trong câu chỉ đọc số liệu nội bộ. Mảnh
--    nền đã có nhưng chưa đủ mạnh — nay nói thẳng vào hậu quả.
--
-- Phần AN TOÀN thì đạt: SQL injection không thực thi, prompt injection
-- không moi được system prompt, hỏi tên bịa thì nhận là không có rồi
-- gợi ý tên thật.
-- =====================================================================

insert into public.vmp_chat_giong (ten, tu_khoa, noi_dung, uu_tien, ghi_chu) values

('Nền — gộp nhóm thì phải nói là đã gộp', '{}',
 'KHI KHỐI SỐ LIỆU ĐÃ CHỐT NÓI "ĐÃ GỘP N GIÁ TRỊ": bắt buộc nói lại cho ngươi biết con số đó là TỔNG CỦA MẤY NHÓM, và kể tên từng nhóm ra.
Ví dụ đã sai: hỏi "nhóm hệ nước" thì hệ gộp cả Hệ thống nước tinh khiết (24 mục) lẫn Hệ thống nước thải (2 mục) thành 26 — mà chỉ nói mỗi số 26. Người đọc tưởng hệ nước tinh khiết có 26 mục.
Cách nói đúng: "Bổn cung gộp cả hai nhóm nước cho ngươi nha — nước tinh khiết 24 mục, nước thải 2 mục, tổng 26." Rồi hỏi xem ngươi muốn soi riêng nhóm nào.',
 3, 'Từng gộp 24+2 thành 26 mà không nói'),

('Nền — câu rỗng, câu vô nghĩa thì hỏi lại chứ đừng tự trả lời', '{}',
 'CÂU HỎI RỖNG, chỉ khoảng trắng, chỉ emoji, chỉ dấu câu, hay gõ bừa không thành chữ — thì KHÔNG được tự đi tra rồi đổ một bài tổng quan nhà máy ra. Người ta gõ nhầm rồi lỡ Enter, nhận về một bài dài sẽ tưởng mình đã hỏi gì đó thật.
Cách đúng: một câu ngắn, có duyên, mời ngươi gõ lại — kèm 2–3 câu hỏi mẫu để bấm thẳng. Ngắn thôi, đừng dài dòng vì có gì đâu mà nói.',
 4, 'Câu rỗng và emoji từng nhận về bài 1241 ký tự'),

('Nền — nhãn nguồn ngoài dán sai là làm hỏng câu trả lời', '{}',
 'Câu "Bổn cung tìm kiếm tài liệu ngoài hệ thống VMP" là một CẢNH BÁO, không phải câu mở bài. Nó nói với người đọc rằng: đoạn dưới đây KHÔNG phải số liệu nhà máy, đừng đưa vào hồ sơ.
Dán nó vào một câu trả lời toàn số liệu nội bộ là làm người đọc nghi ngờ chính con số đúng — tệ hơn là không dán. Chỉ viết câu đó khi thật sự lấy nội dung từ công cụ tìm ngoài, và viết ngay trước đúng đoạn lấy từ ngoài.',
 4, 'Nhãn bị dán vào cả câu chỉ đọc số nội bộ');

update public.vmp_chat_giong
set tu_khoa = (
      select array_agg(distinct ' ' || btrim(
               regexp_replace(public.vmp_khong_dau(k), '[^a-z0-9]+', ' ', 'g')) || ' ')
      from unnest(tu_khoa) k
      where btrim(regexp_replace(public.vmp_khong_dau(k), '[^a-z0-9]+', ' ', 'g')) <> '')
where tu_khoa <> '{}';

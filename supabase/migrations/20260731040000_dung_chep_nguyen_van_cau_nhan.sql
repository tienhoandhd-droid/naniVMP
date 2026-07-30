-- =====================================================================
-- Chính lời dặn của tôi làm mô hình dán nhãn sai
--
-- Nhãn "Bổn cung tìm kiếm tài liệu ngoài hệ thống VMP" vẫn bị dán vào
-- những câu chỉ đọc số liệu nội bộ, dù đã có hai mảnh sổ tay cấm.
--
-- Soi ra thì thủ phạm chính là hai mảnh cấm đó: cả hai đều CHÉP NGUYÊN
-- VĂN câu nhãn để làm ví dụ, và cả hai là mảnh NỀN nên ghép vào MỌI
-- lượt. Mô hình đọc thấy một câu tiếng Việt hoàn chỉnh nằm trong lời
-- dặn, rồi chép nó ra — đúng cái hiệu ứng "đừng nghĩ đến con voi".
--
-- Bằng chứng phụ: lượt đi qua lớp 1 (Gemini) không dán nhãn sai, lượt
-- đi qua lớp 3 (gpt-4o-mini) thì dán. Mô hình nhỏ dễ chép mẫu hơn.
--
-- Sửa: MÔ TẢ cái nhãn thay vì chép nó. Không có câu mẫu thì không có gì
-- để chép.
-- =====================================================================

update public.vmp_chat_giong
set noi_dung = 'CÓ MỘT CÂU NHÃN dành riêng cho trường hợp lấy nội dung từ công cụ tìm ngoài — câu mở đầu bằng "Bổn cung tìm kiếm…" mà công cụ đó dặn dùng.
Câu nhãn ấy là một CẢNH BÁO, không phải câu mở bài: nó nói với người đọc rằng đoạn dưới đây không phải số liệu nhà máy, đừng đưa vào hồ sơ.
Vì vậy CHỈ viết nó khi thật sự vừa gọi công cụ tìm ngoài, và viết ngay trước đúng đoạn lấy từ ngoài. Trả lời bằng số liệu trong sổ, bằng tài liệu nội bộ, hay bằng hiểu biết chung thì KHÔNG được viết câu đó — dán bừa làm người đọc nghi ngờ chính con số đúng, tệ hơn là không dán.'
where ten = 'Nền — nhãn nguồn ngoài dán sai là làm hỏng câu trả lời';

-- Mảnh thứ hai trùng ý với mảnh trên và cũng chép nguyên văn câu nhãn.
-- Hai mảnh cùng nói một chuyện thì chỉ làm prompt dài thêm; bỏ một.
delete from public.vmp_chat_giong
where ten = 'Nền — chỉ dán nhãn nguồn ngoài khi thật sự dùng nguồn ngoài';

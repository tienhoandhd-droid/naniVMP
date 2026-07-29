-- =====================================================================
-- Sửa lỗi form của mẩu chờ: \n hiện thành CHỮ chứ không xuống dòng
--
-- Người dùng báo "mục đọc thơ hay nguyên tắc GMP đang bị lỗi form".
-- Truy ra: 54/54 mẩu đều dính. Nguyên nhân là Postgres mặc định bật
-- standard_conforming_strings, nên trong chuỗi thường '...\n...' thì
-- \n là HAI KÝ TỰ backslash và n, không phải xuống dòng.
--
-- Web dùng whiteSpace: pre-wrap để giữ dòng thơ, nên nó hiện đúng cái
-- nó nhận được — tức là "Đề cương ký trước một ngày,\nMẻ chạy hôm ấy…"
-- với chữ \n nằm chình ình giữa câu.
--
-- Muốn xuống dòng thật trong Postgres phải viết E'...\n...' (escape
-- string) hoặc chr(10). Ở đây thay thẳng trên dữ liệu đã nạp.
-- =====================================================================

update public.vmp_chat_loi_cho
set noi_dung = replace(noi_dung, '\n', chr(10))
where noi_dung like '%\n%';

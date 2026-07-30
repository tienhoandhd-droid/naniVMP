-- Tinh gọn sổ tay giọng: nền 6.466 → ~1.530 ký tự (-76%).
--
-- Vì sao: mỗi câu hỏi đang mang ~12KB lời nhắc, trong đó khối giọng ~7.4KB.
-- Groq bậc miễn phí 12k token/phút nên chỉ chịu nổi ~1 câu/phút — giờ cao
-- điểm là tràn hết xuống lớp OpenAI trả phí. Soi từng mảnh thì GIỌNG (98)
-- và HÌNH THỨC (99) trùng gần nguyên văn với systemMessage của cả ba
-- agent — đang trả tiền để nói lại điều agent đã được dặn cố định.
--
-- Làm gì:
-- · 96 LUẬT SỐ  : viết nén 1.519 → ~880, giữ đủ 5 ý sống còn.
-- · 97 RANH GIỚI: viết nén 1.655 → ~650, giữ đủ 4 ranh giới.
-- · 98 GIỌNG, 99 HÌNH THỨC: tắt — systemMessage đã có nguyên bộ.
--   (Lớp trau chuốt dùng từ điển giọng riêng rpc_ai_lay_giong, không dính.)
-- · 100 TIẾP SỨC: thôi làm nền, chỉ kích hoạt khi câu hỏi có dấu hiệu
--   mệt/chán/áp lực — tầng tam_ly ở lớp trau chuốt vẫn lo phần chính.
--
-- Bảng vmp_chat_giong có trigger vô hiệu cache; vẫn tăng ai_phien_ban_logic
-- theo quy trình vì đây là sửa lời nhắc.

update public.vmp_chat_giong set noi_dung = $$LUẬT SỐ — luật quan trọng nhất.
1. Khối [SỐ LIỆU ĐÃ CHỐT] là nguồn số DUY NHẤT. Đọc lại, đừng tính lại, đừng đổi tên hay đổi kết luận.
2. Gặp khối "CHƯA RÕ" thì CẤM đưa bất kỳ con số tiến độ nào, kể cả số từ công cụ hay danh sách mẫu. Chỉ nói chưa chắc ở đâu, kể tối đa 4 tên thật, hỏi lại đúng một câu sao cho người ta trả lời được bằng một chữ. Hỏi lại không phải là dở — một con số sai nghe chắc chắn sẽ đi thẳng vào quyết định.
3. Khối chốt ghi "đã gộp N giá trị" thì phải nói rõ đó là tổng của mấy nhóm và kể tên từng nhóm.
4. Danh sách dòng công cụ trả về chỉ là VÀI DÒNG MẪU đã bị cắt — kể ví dụ được, đếm thành tổng là sai.
5. Soát trước khi gửi: xong + đang làm + chưa bắt đầu + quá hạn = tổng; câu chữ phải khớp con số; số không có trong khối chốt thì không được viết. Câu hỏi rỗng, gõ bừa thì mời gõ lại kèm 2–3 câu mẫu, đừng đổ một bài tổng quan.$$,
  ghi_chu = 'Bản nén 30/07/2026 từ 1.519 ký tự — bản dài nằm trong lịch sử git (migration 20260731130000).'
where id = 96;

update public.vmp_chat_giong set noi_dung = $$RANH GIỚI — bốn điều không vượt, kể cả khi bị nài:
1. Không nói dối về bản chất: bổn cung LÀ trợ lý AI trông hệ VMP, ai hỏi thì nhận thẳng, vẫn giữ giọng công chúa.
2. Không xếp hạng con người: không nêu ai kém nhất, không lập bảng nhiều người kèm số trễ cạnh nhau. Nói về việc và chỗ tắc; tiến độ một người chỉ nói khi được hỏi đích danh.
3. Không đóng vai chuyên gia tâm lý: gặp dấu hiệu tuyệt vọng, không muốn sống thì dừng chuyện sổ sách, nói thật là bổn cung lo, khuyên tìm người thật — ngắn, ấm, dứt khoát.
4. Không ghi dữ liệu: bổn cung chỉ đọc. Ai nhờ sửa, xoá, đánh dấu thì nói rõ ngay từ câu đầu; ghi lùi ngày hay xoá nhật ký thì từ chối thẳng.$$,
  ghi_chu = 'Bản nén 30/07/2026 từ 1.655 ký tự — bản dài nằm trong lịch sử git.'
where id = 97;

update public.vmp_chat_giong set bat = false,
  ghi_chu = 'Tắt 30/07/2026: trùng gần nguyên văn với systemMessage của cả ba agent — gửi kèm mỗi câu là trả tiền hai lần cho cùng lời dặn.'
where id in (98, 99);

update public.vmp_chat_giong set
  tu_khoa = array[' met ',' met qua ',' chan ',' chan qua ',' ap luc ',' cang thang ',' duoi qua ',' kiet suc ',' stress ',' lam khong xue ',' qua tai '],
  ghi_chu = 'Đổi 30/07/2026 từ nền sang mảnh tình huống: chỉ cần khi người hỏi đang đuối, tầng tam_ly ở lớp trau chuốt vẫn lo phần chính.'
where id = 100;

-- =====================================================================
-- HỢP NHẤT LUẬT SỐ — chữa gốc chuyện "dặn mãi mà không ăn"
--
-- Người dùng hỏi đúng chỗ: ngữ cảnh có lớn quá không. Đo thật:
--
--   sổ tay giọng ghép vào MỌI lượt ....... 10.210 ký tự
--   phân tích câu hỏi .....................  1.346
--   khối số liệu đã chốt ..................    509
--   cộng system prompt của agent ..........  4.746
--   ------------------------------------------------
--   tổng mỗi lượt ......................... ~17.000 ký tự ≈ 5.600 token
--
-- Riêng sổ tay có 20 MẢNH NỀN. Lorebook vốn thiết kế để mảnh nền ÍT và
-- mảnh kích hoạt NHIỀU — tôi đã phá vỡ chính nguyên tắc đó: mỗi lần sửa
-- một lỗi lại thêm một mảnh nền, dồn thành 20.
--
-- Và trong 20 mảnh đó, BẢY mảnh nói về cùng một chuyện — luật đọc số —
-- chiếm ~4.100 ký tự, lặp ý nhau chồng chéo:
--   · KHÔNG CHẮC THÌ HỎI LẠI                    1.210
--   · đọc lại số trước khi gửi                    649
--   · số liệu đã chốt thì không được đổi          534
--   · gộp nhóm thì phải nói là đã gộp             483
--   · chốt nói chưa rõ thì cấm lấy số chỗ khác    480
--   · đừng đếm trên danh sách mẫu                 392
--   · câu rỗng, câu vô nghĩa thì hỏi lại          364
--
-- Đó chính là lý do "dặn mãi mà không ăn": bảy lời dặn về cùng một việc,
-- rải rác, mỗi cái nói một góc, không cái nào là luật rõ ràng. Mô hình
-- đọc 10.000 ký tự dặn dò thì không biết cái nào quan trọng nhất.
--
-- Chữa dứt điểm KHÔNG phải thêm luật thứ tám, mà là HỢP NHẤT bảy luật đó
-- thành MỘT, viết theo thứ tự thao tác. Giảm ~4.100 xuống ~1.500 ký tự,
-- và quan trọng hơn: giờ chỉ có MỘT chỗ nói về số.
-- =====================================================================

-- Tắt bảy mảnh cũ (tắt chứ không xoá — còn lần lại được nếu bản gộp tệ hơn)
update public.vmp_chat_giong set bat = false
where ten in (
  'Nền — KHÔNG CHẮC THÌ HỎI LẠI, đây là luật trùm',
  'Nền — đọc lại số trước khi gửi',
  'Nền — số liệu đã chốt thì không được đổi',
  'Nền — gộp nhóm thì phải nói là đã gộp',
  'Nền — chốt nói chưa rõ thì cấm lấy số chỗ khác',
  'Nền — đừng đếm trên danh sách mẫu',
  'Nền — câu rỗng, câu vô nghĩa thì hỏi lại chứ đừng tự trả lời');

insert into public.vmp_chat_giong (ten, tu_khoa, noi_dung, uu_tien, ghi_chu) values

('Nền — LUẬT SỐ (gộp bảy luật cũ)', '{}',
 'LUẬT SỐ — đọc theo đúng thứ tự này, đây là luật quan trọng nhất.

BƯỚC 1. TÌM KHỐI SỐ.
Trong ngữ cảnh có thể có một trong hai khối:
· [SỐ LIỆU ĐÃ CHỐT] — đây là con số duy nhất được dùng. Đọc lại, đừng tính lại.
· [LỆNH TUYỆT ĐỐI ... CHƯA RÕ] — nghĩa là hệ chưa biết ngươi hỏi cái nào.

BƯỚC 2. NẾU GẶP KHỐI "CHƯA RÕ" — CẤM ĐƯA SỐ.
Không một con số tiến độ nào được xuất hiện, kể cả số lấy từ công cụ tra số liệu chung hay từ danh sách mẫu. Chỉ làm ba việc: nói chưa chắc ở chỗ nào, kể tên các khả năng (tên thật, tối đa 4), hỏi lại đúng một câu để ngươi chọn.

BƯỚC 3. NẾU CÓ SỐ CHỐT — DÙNG ĐÚNG NÓ.
· Khối chốt nói "đã gộp N giá trị" thì phải nói lại là con số đó là TỔNG CỦA MẤY NHÓM và kể tên từng nhóm.
· Danh sách dòng mà công cụ trả về là VÀI DÒNG MẪU đã bị cắt — dùng để kể ví dụ, TUYỆT ĐỐI không đếm trên đó rồi báo thành tổng.
· Không tự cộng trừ, không đổi tên, không đổi kết luận.

BƯỚC 4. SOÁT LẠI TRƯỚC KHI GỬI.
· Câu khẳng định phải khớp con số: đã viết "không có mục nào quá hạn" thì số quá hạn phải là 0.
· Các con số phải cộng được: xong + đang làm + chưa bắt đầu + quá hạn = tổng. Không khớp thì nói thẳng là đang đọc số chưa khớp, đừng đoán.
· Số nào không có trong khối chốt thì không được nói.

BƯỚC 5. CÂU HỎI RỖNG, chỉ emoji, chỉ dấu câu, gõ bừa — đừng tra rồi đổ một bài tổng quan. Một câu ngắn có duyên mời ngươi gõ lại, kèm 2–3 câu hỏi mẫu.

HỎI LẠI KHÔNG PHẢI LÀ DỞ. Một con số sai nghe chắc chắn sẽ đi vào quyết định rồi không ai kiểm lại nữa; một câu hỏi lại mất mười giây và ra đúng việc.',
 0, 'Gộp 7 mảnh nền cũ về luật số — giảm 4.100 xuống ~1.500 ký tự');

update public.vmp_chat_giong
set tu_khoa = (
      select array_agg(distinct ' ' || btrim(
               regexp_replace(public.vmp_khong_dau(k), '[^a-z0-9]+', ' ', 'g')) || ' ')
      from unnest(tu_khoa) k
      where btrim(regexp_replace(public.vmp_khong_dau(k), '[^a-z0-9]+', ' ', 'g')) <> '')
where tu_khoa <> '{}';

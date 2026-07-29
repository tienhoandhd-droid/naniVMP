-- =====================================================================
-- Thêm biến thể từ khoá — người ta không gõ đúng cụm mình đoán trước
--
-- Khớp theo cụm nguyên văn rất giòn: mảnh "Hỏi hôm nay nên làm gì" đặt
-- từ khoá 'hom nay lam gi', mà người thật gõ "hôm nay NÊN làm gì trước"
-- — chen đúng một chữ là trượt. Cách chữa rẻ nhất là nạp thêm biến thể
-- NGẮN của cùng một ý, thay vì cố viết cụm dài cho khớp hoàn hảo.
-- =====================================================================

update public.vmp_chat_giong set tu_khoa = tu_khoa || array[' nen lam gi ',' lam gi truoc ',' bat dau tu dau ',' uu tien ',' sap xep ']
where ten = 'Hỏi hôm nay nên làm gì';

update public.vmp_chat_giong set tu_khoa = tu_khoa || array[' xin chao ',' chao cong chua ',' chao vali ']
where ten = 'Chào hỏi';

update public.vmp_chat_giong set tu_khoa = tu_khoa || array[' tre ',' muon han ',' bi tre ']
where ten = 'Hỏi hạng mục quá hạn';

update public.vmp_chat_giong set tu_khoa = tu_khoa || array[' con lai ',' sap het han ',' gan den han ']
where ten = 'Hỏi sắp đến hạn';

update public.vmp_chat_giong set tu_khoa = tu_khoa || array[' dang den dau ',' den dau roi ',' bao nhieu phan tram ']
where ten = 'Hỏi tiến độ tổng';

update public.vmp_chat_giong set tu_khoa = tu_khoa || array[' met moi ',' duoi qua ',' khong con noi ']
where ten = 'Kiệt sức, cạn năng lượng';

update public.vmp_chat_giong set tu_khoa = tu_khoa || array[' cang qua ',' ap luc qua ',' cang thang ']
where ten = 'Người hỏi đang mệt, đang áp lực';

update public.vmp_chat_giong set updated_at = now() where true;

-- =====================================================================
-- XÁC ĐỊNH TRỌNG ĐIỂM CỦA CÂU HỎI
--
-- Người dùng chỉ đúng chỗ: "KNTB133 là cái cốt lõi của câu, làm sao để
-- AI phân biệt đâu là trọng điểm".
--
-- ---------------------------------------------------------------------
-- Nguyên tắc: xếp hạng theo SỨC NHẬN DIỆN, không theo vị trí trong câu
--
-- Không phải chữ nào trong câu cũng ngang nhau. Xếp theo mức độ một chữ
-- có thể chỉ đúng MỘT thứ trong nhà máy:
--
--   1. Mã đối tượng (KNTB133)     — không thể trùng ngẫu nhiên. Người ta
--                                    gõ ra nó là đã biết chính xác muốn
--                                    hỏi cái gì. Đây LUÔN là trọng điểm.
--   2. Tên đối tượng đầy đủ        — gần chắc như mã
--   3. Tên người / nhóm việc       — thu hẹp mạnh nhưng còn nhiều dòng
--   4. Khu vực / bộ phận / line    — thu hẹp vừa
--   5. Trạng thái, mốc thời gian   — bộ lọc, không phải chủ thể
--   6. Từ ngữ pháp ("thông tin",
--      "cho hỏi", "kiểm tra giúp") — cách nói, KHÔNG mang ý
--
-- Có bậc 1 hoặc 2 thì mọi thứ bậc 6 đều là nhiễu, dù không nằm trong
-- danh sách hư từ. Đó chính là chỗ bản cũ hỏng: nó cho "thông tin" cùng
-- trọng số với "KNTB133" nên hai chữ vô hại thắng cả một mã thiết bị.
--
-- Trả trọng điểm ra ngoài để:
--   · đường SQL biết dựng câu trả lời quanh cái gì
--   · lời nhắc cho mô hình nói thẳng "câu này hỏi về X, đừng lan man"
--   · người dùng đọc được hệ đã hiểu trọng điểm là gì (soi ra được lỗi)
-- =====================================================================

create or replace function public.rpc_ai_trong_diem(p_hieu jsonb)
returns jsonb
language sql immutable
as $fn$
  with loc as (select coalesce(p_hieu->'loc', '{}'::jsonb) l)
  select case
    when (select l ? 'ma' from loc) then jsonb_build_object(
      'bac', 1, 'loai', 'ma',
      'gia_tri', (select l->>'ma' from loc),
      'mo_ta', 'Câu hỏi xoay quanh đối tượng có mã '
               || (select l->>'ma' from loc)
               || '. Mọi chữ khác chỉ là cách nói.')
    when (select l ? 'ten_doi_tuong' from loc) then jsonb_build_object(
      'bac', 2, 'loai', 'ten_doi_tuong',
      'gia_tri', (select l->>'ten_doi_tuong' from loc),
      'mo_ta', 'Câu hỏi xoay quanh thiết bị "'
               || (select l->>'ten_doi_tuong' from loc) || '".')
    when (select l ? 'nguoi' from loc) then jsonb_build_object(
      'bac', 3, 'loai', 'nguoi',
      'gia_tri', (select l->>'nguoi' from loc),
      'mo_ta', 'Câu hỏi xoay quanh phần việc của '
               || (select l->>'nguoi' from loc) || '.')
    when (select l ? 'nhom_viec' from loc) then jsonb_build_object(
      'bac', 3, 'loai', 'nhom_viec',
      'gia_tri', (select l->>'nhom_viec' from loc),
      'mo_ta', 'Câu hỏi xoay quanh nhóm việc "'
               || (select l->>'nhom_viec' from loc) || '".')
    when (select l ? 'khu_vuc' from loc) then jsonb_build_object(
      'bac', 4, 'loai', 'khu_vuc',
      'gia_tri', (select l->>'khu_vuc' from loc),
      'mo_ta', 'Câu hỏi xoay quanh khu vực '
               || (select l->>'khu_vuc' from loc) || '.')
    when (select l ? 'bo_phan' from loc) then jsonb_build_object(
      'bac', 4, 'loai', 'bo_phan',
      'gia_tri', (select l->>'bo_phan' from loc),
      'mo_ta', 'Câu hỏi xoay quanh bộ phận '
               || (select l->>'bo_phan' from loc) || '.')
    else jsonb_build_object(
      'bac', 5, 'loai', 'toan_bo', 'gia_tri', null,
      'mo_ta', 'Câu hỏi không nhắm vào đối tượng nào cụ thể — hỏi trên toàn bộ kế hoạch.')
  end;
$fn$;

-- Gắn trọng điểm vào kết quả phân tích --------------------------------
create or replace function public.rpc_ai_ngu_canh_nap_san(
  p_question text, p_year integer default null
) returns jsonb
language sql stable security definer set search_path = public
as $fn$
  select jsonb_build_object(
    'trong_diem', public.rpc_ai_trong_diem(public.rpc_ai_hieu_cau_hoi(p_question)),
    'so_lieu',    public.rpc_ai_context_gon(p_question, p_year),
    'tai_lieu',   public.rpc_kb_search_text(p_question, 3),
    'huong_dan',
      'TRẢ LỜI ĐÚNG TRỌNG ĐIỂM. Nếu trong_diem chỉ ra một đối tượng cụ '
      || 'thể, chỉ nói về đối tượng đó — TUYỆT ĐỐI không đọc lại phần tổng '
      || 'quan toàn nhà máy, vì người hỏi không hỏi cái đó. '
      || 'Đây là TOÀN BỘ dữ liệu được phép dùng; không có số nào ngoài đây '
      || 'thì nói "không có trong dữ liệu", không tự tính thêm.');
$fn$;

-- Ngữ cảnh cho mô hình có công cụ cũng phải nêu trọng điểm -------------
create or replace function public.rpc_ai_context_gon(
  p_question text default null, p_year integer default null
) returns jsonb
language sql stable security definer set search_path = public
as $fn$
  select jsonb_build_object(
    'TRONG_DIEM_CAU_HOI', public.rpc_ai_trong_diem(public.rpc_ai_hieu_cau_hoi(p_question)),
    'nam',        c->'nam',
    'tong_quan',  c->'tong_quan',
    'theo_muc_trong_yeu', c->'theo_muc_trong_yeu',
    'dong_khop_cau_hoi',  (
      select coalesce(jsonb_agg(e), '[]'::jsonb)
      from (select e from jsonb_array_elements(c->'dong_khop_cau_hoi') e limit 8) t),
    'luu_y', 'Trả lời ĐÚNG phần TRONG_DIEM_CAU_HOI chỉ ra. Nếu nó nêu một '
             || 'đối tượng cụ thể thì chỉ nói về đối tượng đó, KHÔNG đọc lại '
             || 'tong_quan — tong_quan chỉ để tham chiếu khi câu hỏi thật sự '
             || 'hỏi về toàn bộ kế hoạch.')
  from (select public.rpc_ai_context(p_question, p_year, 8) c) x;
$fn$;

create or replace function public.rpc_ai_context(
  p_question text default null,
  p_year integer default null,
  p_row_limit integer default 25
) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare v_c jsonb;
begin
  v_c := public.rpc_ai_context_goc(p_question, p_year, p_row_limit);
  return v_c || jsonb_build_object(
    'TRONG_DIEM_CAU_HOI', public.rpc_ai_trong_diem(public.rpc_ai_hieu_cau_hoi(p_question)),
    'luu_y', 'Trả lời ĐÚNG phần TRONG_DIEM_CAU_HOI chỉ ra. Nếu nó nêu một '
             || 'đối tượng cụ thể thì chỉ nói về đối tượng đó và bỏ qua '
             || 'tong_quan — đổ ra tổng quan toàn nhà máy khi người ta hỏi '
             || 'một thiết bị là trả lời sai câu hỏi.');
end;
$fn$;

revoke execute on function public.rpc_ai_trong_diem(jsonb) from anon, public;
grant  execute on function public.rpc_ai_trong_diem(jsonb) to authenticated, service_role;

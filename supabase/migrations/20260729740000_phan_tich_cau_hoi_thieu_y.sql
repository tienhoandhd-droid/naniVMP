-- =====================================================================
-- PHÂN TÍCH CÂU HỎI THIẾU Ý — đọc vài lượt gần nhất rồi mới kết luận
--
-- Người dùng hỏi cụt là chuyện thường: "tank thì sao", "còn cái kia
-- nữa", "xong chưa". Ba câu đó đứng một mình thì vô nghĩa, nhưng đặt
-- cạnh lượt trước lại rất rõ. Vì vậy phán đoán "câu hỏi có đủ ý chưa"
-- KHÔNG được nhìn mỗi câu hiện tại — phải nhìn cả mạch.
--
-- Hàm này gộp ba nguồn rồi kết luận một lần:
--   1. Từ khoá dò được trong câu hỏi (rpc_ai_hieu_tu_khoa)
--   2. Ba lượt hỏi gần nhất trong cùng phiên (bộ nhớ tạm)
--   3. Độ dài và hình dạng câu hỏi
--
-- Trả về một đoạn tiếng Việt dặn thẳng AI phải làm gì tiếp: trả lời
-- luôn, hay trả lời phần chung rồi hỏi thu hẹp, hay phải hỏi lại kèm
-- lựa chọn cụ thể. Đặt phán đoán ở SQL chứ không ở prompt vì nó là
-- luật đếm được — đếm thì SQL làm chắc tay hơn mô hình.
-- =====================================================================

create or replace function public.rpc_ai_phan_tich_cau_hoi(
  p_cau_hoi text,
  p_phien   text default null
) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $fn$
declare
  v_tk       jsonb := public.rpc_ai_hieu_tu_khoa(p_cau_hoi, 6);
  v_mach     text;
  v_so_luot  integer := 0;
  v_rong_nhat integer := 0;
  v_ten_rong text;
  v_vi_du    text;
  v_so_tieng integer;
  v_muc      text;          -- du_y | con_rong | truot | cut_can_mach
  v_dan      text;
begin
  -- --- Bộ nhớ tạm: ba lượt hỏi gần nhất của cùng phiên ---
  if p_phien is not null and btrim(p_phien) <> '' then
    select count(*), string_agg(cau_hoi, ' | ' order by id)
    into v_so_luot, v_mach
    from (
      select id, cau_hoi
      from public.vmp_ai_hoi_thoai
      where phien = p_phien
      order by id desc
      limit 3
    ) t;
  end if;

  -- --- Chỗ rộng nhất: từ khoá nào trúng nhiều mục nhất ---
  select (x ->> 'so_khop')::int, x ->> 'tu',
         (select string_agg(v, ', ') from jsonb_array_elements_text(x -> 'vi_du') v)
  into v_rong_nhat, v_ten_rong, v_vi_du
  from jsonb_array_elements(v_tk -> 'nhom') x
  order by (x ->> 'so_khop')::int desc
  limit 1;

  v_rong_nhat := coalesce(v_rong_nhat, 0);

  -- Đếm tiếng có nghĩa, thô thôi: đủ để biết câu dài hay câu cụt
  v_so_tieng := coalesce(array_length(
    string_to_array(btrim(regexp_replace(public.vmp_khong_dau(coalesce(p_cau_hoi, '')), '[^a-z0-9]+', ' ', 'g')), ' '), 1), 0);

  -- --- Kết luận ---
  if v_so_tieng <= 3 and coalesce(v_so_luot, 0) > 0 then
    v_muc := 'cut_can_mach';
  elsif jsonb_array_length(v_tk -> 'nhom') = 0 and jsonb_array_length(v_tk -> 'bi_danh') = 0 then
    v_muc := 'truot';
  elsif v_rong_nhat >= 5 then
    v_muc := 'con_rong';
  else
    v_muc := 'du_y';
  end if;

  -- --- Lời dặn cho AI ---
  v_dan := coalesce(v_tk ->> 'giai_thich', '');

  if v_muc = 'cut_can_mach' then
    v_dan := v_dan || format(
      ' CÂU HỎI RẤT NGẮN, phải hiểu theo mạch. Ba lượt gần nhất người này đã hỏi: %s. Nối vào đó mà hiểu, TRẢ LỜI LUÔN theo cách hiểu hợp lý nhất, nói rõ mình đang hiểu theo hướng nào, rồi mới mời chỉnh lại nếu lệch. Tuyệt đối đừng hỏi trống không kiểu "ngươi muốn hỏi gì".',
      coalesce(v_mach, 'chưa có'));

  elsif v_muc = 'con_rong' then
    v_dan := v_dan || format(
      ' CÂU HỎI CÒN RỘNG: chữ "%s" trúng tới %s mục. Làm hai bước trong CÙNG một câu trả lời: (1) trả lời ngay phần chung — tổng số, tình hình chung của cả nhóm đó, để người hỏi có cái cầm về; (2) rồi mới hỏi đúng MỘT câu để thu hẹp, kèm 2–3 lựa chọn cụ thể lấy từ danh sách này: %s. Đừng hỏi lại rồi đứng im chờ — như vậy là đẩy việc cho người hỏi.',
      v_ten_rong, v_rong_nhat, coalesce(v_vi_du, 'chưa có'));

  elsif v_muc = 'truot' then
    v_dan := v_dan || format(
      ' KHÔNG DÒ RA thiết bị, khu vực hay bộ phận nào trong câu hỏi. Trước khi kết luận là không có, hãy xét: có phải người hỏi đang nói tiếp chuyện của lượt trước không (ba lượt gần nhất: %s), hay đang hỏi chuyện ngoài số liệu. Nếu đúng là chưa dò ra thì nói thật một cách có duyên, đưa cái gần nhất mình có, rồi gợi 2–3 câu hỏi cụ thể — đừng trả lời cụt.',
      coalesce(v_mach, 'chưa có'));

  else
    v_dan := v_dan || ' Câu hỏi đủ rõ để trả lời thẳng. Trả lời đúng trọng điểm, đừng hỏi lại lấy lệ.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'muc', v_muc,
    'so_luot_nho', coalesce(v_so_luot, 0),
    'mach_gan_nhat', v_mach,
    'rong_nhat', v_rong_nhat,
    'tu_khoa', v_tk,
    'loi_dan', v_dan
  );
end;
$fn$;

revoke execute on function public.rpc_ai_phan_tich_cau_hoi(text, text) from public, anon;
grant execute on function public.rpc_ai_phan_tich_cau_hoi(text, text) to authenticated, service_role;

comment on function public.rpc_ai_phan_tich_cau_hoi(text, text) is
  'Gộp từ khoá dò được + ba lượt hỏi gần nhất của phiên để kết luận câu hỏi đã đủ ý chưa, và dặn AI phải làm gì tiếp (trả lời thẳng / trả lời chung rồi thu hẹp / hỏi lại kèm lựa chọn).';

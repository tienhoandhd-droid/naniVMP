-- =====================================================================
-- HAI GIỌNG KHÁC NHAU CHO HAI LOẠI CÂU HỎI
--
-- Câu TRA SỐ và câu GIẢI THÍCH cần hai cách viết khác hẳn nhau:
--
--   · Tra số  → gạch đầu dòng, số thẳng hàng. Người đọc đang quét tìm
--               một con số, văn xuôi làm họ phải đọc lại hai lần.
--   · Giải thích → văn kể liền mạch. Ở đây người đọc cần theo một mạch
--               lập luận, mà gạch đầu dòng thì cắt vụn mạch đó ra.
--
-- Bản cũ ép cả hai vào một khuôn "kết luận trước, rồi số liệu, rồi giải
-- thích, danh sách thì gạch đầu dòng" — nên câu "vì sao LAF cân 9 điểm"
-- ra một bảng công thức khô khốc thay vì một lời giải thích.
--
-- rpc_ai_do_kho đã nhận ra được câu nào cần tra luật, câu nào đòi lập
-- luận. Dùng luôn tín hiệu đó để chọn giọng, không phải đoán thêm.
-- =====================================================================

create or replace function public.rpc_ai_do_kho(p_question text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  q     text    := public.vmp_khong_dau(coalesce(p_question, ''));
  diem  integer := 0;
  vi    text[]  := '{}';
  ke    boolean := false;   -- true = câu giải thích, dùng giọng kể
begin
  if (length(q) - length(replace(q, '?', ''))) > 1 then
    diem := diem + 2; vi := array_append(vi, 'nhiều câu hỏi trong một lượt');
  end if;
  if q ~ '( va | cung nhu | dong thoi | ngoai ra | ben canh )' then
    diem := diem + 1; vi := array_append(vi, 'nhiều ý nối nhau');
  end if;
  if q ~ '(vi sao|tai sao|quy tac|luat|cach tinh|the nao|yeu cau|tieu chuan|annex|gmp|alcoa|ich q9)' then
    diem := diem + 2; vi := array_append(vi, 'phải tra tài liệu luật'); ke := true;
  end if;
  if q ~ '(so sanh|danh gia|nhan xet|de xuat|goi y|nen |khuyen|phan tich|tai sao lai)' then
    diem := diem + 2; vi := array_append(vi, 'đòi lập luận, không chỉ tra số'); ke := true;
  end if;
  if length(q) > 120 then
    diem := diem + 1; vi := array_append(vi, 'câu dài');
  end if;

  return jsonb_build_object(
    'diem', diem,
    -- Câu GIẢI THÍCH luôn đi bậc sâu, dù ngắn.
    --
    -- Đo được bằng thử nghiệm: hỏi "laf cân tại sao 9 điểm trọng yếu" mà
    -- để mô hình bậc nhanh trả lời thì nó KHÔNG gọi công cụ tra tài liệu
    -- và tự bịa ra "laf cân là thiết bị đo lường trọng lượng" — đúng cái
    -- hiểu sai mà cả tài liệu rule-vmp01 sinh ra để đính chính (LAF cân
    -- là BUỒNG CÂN xử lý không khí sạch, không phải cái cân).
    --
    -- Câu văn trôi chảy mà nội dung sai là kiểu hỏng nguy hiểm nhất. Nên
    -- độ dài không quyết định được ở đây: hễ phải tra tài liệu hoặc phải
    -- lập luận thì bắt buộc bậc sâu.
    'bac', case when ke or diem >= 3 then 'sau' else 'nhanh' end,
    'kieu', case when ke then 'giai_thich' else 'so_lieu' end,
    'giong', case when ke then
        'CÂU GIẢI THÍCH — BẮT BUỘC gọi công cụ tra tài liệu luật TRƯỚC khi '
        || 'viết, và nói rõ lấy từ mục nào. Không được giải thích bằng kiến '
        || 'thức chung: tên thiết bị ở đây rất dễ gây hiểu nhầm (ví dụ "LAF cân" '
        || 'là BUỒNG CÂN xử lý không khí sạch, KHÔNG phải cái cân). '
        || 'Viết thành VĂN KỂ LIỀN MẠCH, không gạch đầu dòng. '
        || 'Dẫn dắt như đang kể cho người ngồi cạnh nghe: nói cái kết luận '
        || 'trước bằng một câu tròn, rồi giải thích vì sao, rồi mới tới chi '
        || 'tiết kỹ thuật. Câu nọ nối câu kia bằng "bởi vì", "cho nên", "thành '
        || 'ra", "chính vì thế". Con số vẫn phải chính xác nhưng cài vào giữa '
        || 'câu văn chứ đừng dựng thành bảng. Được dùng ví von cho dễ hình '
        || 'dung, miễn là không làm sai nghĩa kỹ thuật. Dài 3–6 đoạn ngắn.'
      else
        'CÂU TRA SỐ — trả lời gọn, số liệu để gạch đầu dòng cho thẳng hàng, '
        || 'dễ quét mắt. Kết luận một câu ở đầu, rồi tới danh sách. Không kể '
        || 'lể dài dòng.' end,
    'vi_sao', case when array_length(vi, 1) is null
                   then 'câu ngắn, một ý — mô hình nhanh là đủ'
                   else array_to_string(vi, '; ') end);
end;
$fn$;

revoke execute on function public.rpc_ai_do_kho(text) from anon, public;
grant  execute on function public.rpc_ai_do_kho(text) to authenticated, service_role;

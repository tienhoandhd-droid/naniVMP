-- =====================================================================
-- THÊM PHƯƠNG ÁN DỰ PHÒNG — và một điều cần nói thẳng về HuggingFace
--
-- ---------------------------------------------------------------------
-- Vì sao HuggingFace KHÔNG dùng được ở bậc có công cụ
--
-- Toàn bộ thiết kế dựa trên một điều: mô hình KHÔNG được tự nghĩ ra con
-- số, mà phải gọi công cụ Postgres để lấy. Không gọi được công cụ thì mô
-- hình chỉ còn cách đoán — đúng cái hỏng mà cả hệ thống này sinh ra để
-- chặn.
--
-- Các endpoint suy luận miễn phí của HuggingFace phần lớn KHÔNG hỗ trợ
-- function calling ổn định. Cắm vào bậc có công cụ thì nó sẽ trả lời
-- trôi chảy bằng số bịa. Nên không cắm.
--
-- ---------------------------------------------------------------------
-- Nhưng vẫn dùng được, theo cách khác: BẬC KHÔNG CÔNG CỤ
--
-- Thay vì để mô hình tự gọi công cụ, ta NẠP SẴN ngữ cảnh bằng SQL rồi
-- đưa vào lời nhắc. Mô hình chỉ còn việc diễn đạt lại. Cách này chạy
-- được với BẤT KỲ mô hình nào — kể cả loại không biết gọi công cụ — và
-- con số vẫn do SQL cấp nên vẫn đúng.
--
-- Đây là lưới an toàn cuối: khi cả Groq lẫn Gemini đều nghẽn.
-- =====================================================================

insert into public.vmp_ai_mo_hinh (ma, ten, nha_cung_cap, bac, thu_tu, mien_phi, ghi_chu) values
 ('khong_cong_cu_hf', 'HuggingFace (ngữ cảnh nạp sẵn)', 'HuggingFace', 'luoi_cuoi', 10, true,
  'Lưới an toàn khi Groq và Gemini đều nghẽn. KHÔNG gọi công cụ — ngữ cảnh '
  'được SQL nạp sẵn vào lời nhắc, nên con số vẫn do database cấp. Không '
  'dùng ở bậc có công cụ vì endpoint miễn phí của HF không hỗ trợ function '
  'calling ổn định, cắm vào là nó bịa số.'),
 ('openai_mini', 'GPT-4o mini', 'OpenAI', 'luoi_cuoi', 20, false,
  'CÓ TRẢ PHÍ — chỉ chạy khi mọi phương án miễn phí đều hỏng. Xếp cuối '
  'cùng trong thứ tự thử, đúng ý "không ưu tiên trả phí".')
on conflict (ma) do update set
  ten = excluded.ten, nha_cung_cap = excluded.nha_cung_cap, bac = excluded.bac,
  thu_tu = excluded.thu_tu, mien_phi = excluded.mien_phi, ghi_chu = excluded.ghi_chu;

-- Router: bậc 'luoi_cuoi' luôn xếp sau cùng, và trong đó trả phí xếp sau
-- miễn phí. Không bao giờ chọn đầu tiên.
create or replace function public.rpc_ai_chon_mo_hinh(p_question text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_kho jsonb := public.rpc_ai_do_kho(p_question);
  v_bac text  := v_kho->>'bac';
  v_ds  jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'ma', ma, 'ten', ten, 'nha_cung_cap', nha_cung_cap, 'bac', bac,
           'mien_phi', mien_phi,
           'dang_nghi', (nghi_den is not null and nghi_den > now()),
           'ty_le_loi', case when so_lan_goi = 0 then null
                             else round(100.0 * so_lan_loi / so_lan_goi) end,
           'tre_tb_ms', tre_tb_ms)
         order by
           (bac = 'luoi_cuoi'),                            -- lưới cuối xuống sau cùng
           (nghi_den is not null and nghi_den > now()),    -- đang nghỉ thì xuống
           (bac <> v_bac and bac <> 'luoi_cuoi'),          -- đúng bậc lên trước
           (not mien_phi),                                 -- trả phí xếp sau miễn phí
           thu_tu), '[]'::jsonb)
  into v_ds
  from public.vmp_ai_mo_hinh where bat;

  return jsonb_build_object(
    'do_kho', v_kho,
    'thu_tu_thu', v_ds,
    'chon', v_ds->0->>'ma',
    'vi_sao', 'Độ khó ' || (v_kho->>'diem') || '/8 → bậc "' || v_bac || '" ('
              || (v_kho->>'vi_sao') || '). Chọn '
              || coalesce(v_ds->0->>'ten', 'không có mô hình nào khả dụng') || '.');
end;
$fn$;

-- ---------------------------------------------------------------------
-- Gói ngữ cảnh cho bậc KHÔNG CÔNG CỤ: số liệu + tài liệu, gộp một lần
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_ngu_canh_nap_san(
  p_question text, p_year integer default null
) returns jsonb
language sql stable security definer set search_path = public
as $fn$
  select jsonb_build_object(
    'so_lieu', public.rpc_ai_context_gon(p_question, p_year),
    'tai_lieu', public.rpc_kb_search_text(p_question, 3),
    'huong_dan',
      'Đây là TOÀN BỘ dữ liệu bạn được phép dùng. Không có số nào ngoài '
      'đây thì nói "không có trong dữ liệu", tuyệt đối không tự tính hay '
      'suy đoán thêm.');
$fn$;

revoke execute on function public.rpc_ai_chon_mo_hinh(text) from anon, public;
revoke execute on function public.rpc_ai_ngu_canh_nap_san(text, integer) from anon, public;
grant execute on function public.rpc_ai_chon_mo_hinh(text) to authenticated, service_role;
grant execute on function public.rpc_ai_ngu_canh_nap_san(text, integer) to authenticated, service_role;

-- =====================================================================
-- ĐỊNH TUYẾN NHIỀU MÔ HÌNH — chọn theo ĐỘ KHÓ và SỨC KHOẺ THỰC TẾ
--
-- ---------------------------------------------------------------------
-- Vấn đề của bản cũ
--
-- Chỉ có một thứ tự cứng: Gemini → Groq. Ba chỗ dở:
--   · câu dễ vẫn đẩy vào Gemini, đốt hạn mức miễn phí vào việc mà mô
--     hình nhanh làm tốt hơn (và nhanh hơn 3–4 lần)
--   · Gemini hết hạn mức thì lần nào cũng phải thử-rồi-hỏng mới chuyển,
--     mỗi câu hỏi mất thêm vài giây chờ vô ích
--   · không ai biết mô hình nào đang khoẻ, đang nghẽn
--
-- ---------------------------------------------------------------------
-- Cách làm
--
-- Chấm ĐỘ KHÓ của câu hỏi, rồi ghép với BẢNG SỨC KHOẺ cập nhật sau mỗi
-- lần gọi. Mô hình vừa hỏng liên tiếp sẽ bị cho nghỉ (cooldown) và router
-- bỏ qua ngay từ đầu — không thử lại để rồi hỏng lần nữa.
--
-- Độ khó tính từ những thứ đo được, không phải cảm tính:
--   · số ý trong câu (dấu ?, "và", "cũng như", liệt kê)
--   · có cần tra tài liệu luật không (từ "vì sao", "quy tắc"…)
--   · độ dài
--   · có yêu cầu so sánh / đánh giá không
-- =====================================================================

create table if not exists public.vmp_ai_mo_hinh (
  ma            text primary key,       -- khớp tên node trong n8n
  ten           text not null,
  nha_cung_cap  text not null,
  bac           text not null,          -- 'nhanh' | 'sau'
  mien_phi      boolean not null default true,
  thu_tu        integer not null,       -- nhỏ hơn = ưu tiên hơn trong cùng bậc
  bat           boolean not null default true,

  -- Sức khoẻ, cập nhật sau mỗi lần gọi
  so_lan_goi    integer not null default 0,
  so_lan_loi    integer not null default 0,
  loi_lien_tiep integer not null default 0,
  tre_tb_ms     integer,
  loi_gan_nhat  text,
  luc_loi       timestamptz,
  nghi_den      timestamptz,            -- đang bị cho nghỉ tới lúc này
  ghi_chu       text
);

comment on table public.vmp_ai_mo_hinh is
  'Bảng sức khoẻ mô hình AI. Router đọc để chọn, n8n ghi lại sau mỗi lần '
  'gọi. Mô hình lỗi liên tiếp bị cho nghỉ và bỏ qua ngay từ đầu.';

alter table public.vmp_ai_mo_hinh enable row level security;
drop policy if exists mo_hinh_doc on public.vmp_ai_mo_hinh;
create policy mo_hinh_doc on public.vmp_ai_mo_hinh
  for select to authenticated using (true);

insert into public.vmp_ai_mo_hinh (ma, ten, nha_cung_cap, bac, thu_tu, ghi_chu) values
 ('groq_llama',  'Llama 3.3 70B',      'Groq',   'nhanh', 10,
  'Nhanh nhất trong nhóm miễn phí. Dùng cho câu ngắn, một ý, không cần tra luật.'),
 ('gemini_flash','Gemini 2.5 Flash',   'Google', 'sau',   10,
  'Suy luận tốt hơn, cửa sổ ngữ cảnh rộng. Dùng cho câu nhiều ý hoặc cần tra tài liệu.'),
 ('groq_gptoss', 'GPT-OSS 120B',       'Groq',   'sau',   20,
  'Dự phòng bậc sâu khi Gemini nghẽn hoặc hết hạn mức.'),
 ('gemini_lite', 'Gemini 2.5 Flash Lite','Google','nhanh',20,
  'Dự phòng bậc nhanh khi Groq nghẽn.')
on conflict (ma) do update set
  ten = excluded.ten, nha_cung_cap = excluded.nha_cung_cap,
  bac = excluded.bac, thu_tu = excluded.thu_tu, ghi_chu = excluded.ghi_chu;

-- ---------------------------------------------------------------------
-- Chấm độ khó câu hỏi
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_do_kho(p_question text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  q     text    := public.vmp_khong_dau(coalesce(p_question, ''));
  diem  integer := 0;
  vi    text[]  := '{}';
begin
  -- Nhiều ý: mỗi dấu hỏi thêm, mỗi liên từ nối ý
  if (length(q) - length(replace(q, '?', ''))) > 1 then
    diem := diem + 2; vi := array_append(vi, 'nhiều câu hỏi trong một lượt');
  end if;
  if q ~ '( va | cung nhu | dong thoi | ngoai ra | ben canh )' then
    diem := diem + 1; vi := array_append(vi, 'nhiều ý nối nhau');
  end if;

  -- Cần tra tài liệu luật
  if q ~ '(vi sao|tai sao|quy tac|luat|cach tinh|the nao|yeu cau|tieu chuan|annex|gmp|alcoa|ich q9)' then
    diem := diem + 2; vi := array_append(vi, 'phải tra tài liệu luật');
  end if;

  -- Đòi so sánh / đánh giá / đề xuất
  if q ~ '(so sanh|danh gia|nhan xet|de xuat|goi y|nen |khuyen|phan tich|tai sao lai)' then
    diem := diem + 2; vi := array_append(vi, 'đòi lập luận, không chỉ tra số');
  end if;

  -- Câu dài thường nhiều ràng buộc
  if length(q) > 120 then
    diem := diem + 1; vi := array_append(vi, 'câu dài');
  end if;

  return jsonb_build_object(
    'diem', diem,
    'bac', case when diem >= 3 then 'sau' else 'nhanh' end,
    'vi_sao', case when array_length(vi, 1) is null then 'câu ngắn, một ý — mô hình nhanh là đủ'
                   else array_to_string(vi, '; ') end);
end;
$fn$;

-- ---------------------------------------------------------------------
-- Chọn mô hình: độ khó × sức khoẻ
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_chon_mo_hinh(p_question text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_kho  jsonb := public.rpc_ai_do_kho(p_question);
  v_bac  text  := v_kho->>'bac';
  v_ds   jsonb;
begin
  -- Thứ tự thử: đúng bậc trước, rồi bậc còn lại. Trong mỗi nhóm, mô hình
  -- đang bị cho nghỉ xếp xuống cuối thay vì loại hẳn — vẫn còn đó làm
  -- phương án cuối nếu mọi thứ khác cũng hỏng.
  select coalesce(jsonb_agg(jsonb_build_object(
           'ma', ma, 'ten', ten, 'nha_cung_cap', nha_cung_cap, 'bac', bac,
           'dang_nghi', (nghi_den is not null and nghi_den > now()),
           'ty_le_loi', case when so_lan_goi = 0 then null
                             else round(100.0 * so_lan_loi / so_lan_goi) end,
           'tre_tb_ms', tre_tb_ms)
         order by
           (nghi_den is not null and nghi_den > now()),   -- đang nghỉ thì xuống cuối
           (bac <> v_bac),                                 -- đúng bậc lên trước
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
-- Ghi kết quả mỗi lần gọi — router tự học từ đây
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_ghi_ket_qua(
  p_ma text, p_ok boolean, p_tre_ms integer default null, p_loi text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public
as $fn$
declare v_lien integer;
begin
  update public.vmp_ai_mo_hinh set
    so_lan_goi    = so_lan_goi + 1,
    so_lan_loi    = so_lan_loi + case when p_ok then 0 else 1 end,
    loi_lien_tiep = case when p_ok then 0 else loi_lien_tiep + 1 end,
    -- Trung bình trượt, nghiêng về số đo mới để phản ứng kịp lúc nghẽn
    tre_tb_ms     = case when p_tre_ms is null then tre_tb_ms
                         when tre_tb_ms is null then p_tre_ms
                         else (tre_tb_ms * 3 + p_tre_ms) / 4 end,
    loi_gan_nhat  = case when p_ok then loi_gan_nhat else left(p_loi, 300) end,
    luc_loi       = case when p_ok then luc_loi else now() end,
    -- Hỏng 2 lần liên tiếp → nghỉ 10 phút; 4 lần → nghỉ 1 giờ.
    -- Đủ để vượt qua đợt nghẽn hoặc hết hạn mức theo phút, mà không
    -- loại mô hình vĩnh viễn vì một sự cố thoáng qua.
    nghi_den      = case when p_ok then null
                         when loi_lien_tiep + 1 >= 4 then now() + interval '1 hour'
                         when loi_lien_tiep + 1 >= 2 then now() + interval '10 minutes'
                         else nghi_den end
  where ma = p_ma
  returning loi_lien_tiep into v_lien;

  return jsonb_build_object('ok', true, 'loi_lien_tiep', coalesce(v_lien, 0));
end;
$fn$;

-- ---------------------------------------------------------------------
-- Bảng chẩn đoán cho web
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_suc_khoe()
returns jsonb
language sql stable security definer set search_path = public
as $fn$
  select jsonb_build_object(
    'mo_hinh', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ma', ma, 'ten', ten, 'nha', nha_cung_cap, 'bac', bac, 'bat', bat,
        'so_lan_goi', so_lan_goi, 'so_lan_loi', so_lan_loi,
        'ty_le_loi', case when so_lan_goi = 0 then null
                          else round(100.0 * so_lan_loi / so_lan_goi) end,
        'tre_tb_ms', tre_tb_ms, 'loi_lien_tiep', loi_lien_tiep,
        'dang_nghi', (nghi_den is not null and nghi_den > now()),
        'nghi_den', nghi_den, 'loi_gan_nhat', loi_gan_nhat, 'ghi_chu', ghi_chu)
        order by bac, thu_tu), '[]'::jsonb)
      from public.vmp_ai_mo_hinh),
    'theo_duong', (
      select coalesce(jsonb_agg(jsonb_build_object('duong', d, 'so_cau', n,
               'tre_tb_ms', tb) order by n desc), '[]'::jsonb)
      from (select coalesce(duong_tra_loi, 'chua_ro') d, count(*) n,
                   round(avg(latency_ms))::int tb
            from public.vmp_ai_chat_log group by 1) t),
    'tong_cau_hoi', (select count(*) from public.vmp_ai_chat_log),
    'ty_le_khong_dung_ai', (
      select case when count(*) = 0 then null
             else round(100.0 * count(*) filter (where duong_tra_loi in ('sql','dem')) / count(*))
             end from public.vmp_ai_chat_log)
  );
$fn$;

revoke execute on function public.rpc_ai_do_kho(text) from anon, public;
revoke execute on function public.rpc_ai_chon_mo_hinh(text) from anon, public;
revoke execute on function public.rpc_ai_ghi_ket_qua(text, boolean, integer, text) from anon, public;
revoke execute on function public.rpc_ai_suc_khoe() from anon, public;
grant execute on function public.rpc_ai_do_kho(text) to authenticated, service_role;
grant execute on function public.rpc_ai_chon_mo_hinh(text) to authenticated, service_role;
grant execute on function public.rpc_ai_ghi_ket_qua(text, boolean, integer, text) to authenticated, service_role;
grant execute on function public.rpc_ai_suc_khoe() to authenticated, service_role;

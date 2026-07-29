-- =====================================================================
-- TRÍ NHỚ HỘI THOẠI NGẮN CHO ĐƯỜNG SQL
--
-- ---------------------------------------------------------------------
-- Lỗi người dùng gặp
--
--   Hỏi : "laf cân tại sao là thiết bị có 9 điểm trọng yếu"
--   Vali: "có 4 thiết bị khớp, anh/chị muốn hỏi cái nào?"
--   Hỏi : "CCTB01 — LAF cân nguyên liệu"
--   Vali: (đọc thông số CCTB01)   ← QUÊN MẤT câu hỏi gốc là VÌ SAO 9 ĐIỂM
--
-- Nhánh AI có bộ nhớ hội thoại, nhưng nhánh SQL thì không — mà chính
-- nhánh SQL là chỗ phát ra câu hỏi lại. Hỏi xong rồi quên là tệ hơn
-- không hỏi: người dùng đã bỏ công trả lời mà vẫn không được việc.
--
-- ---------------------------------------------------------------------
-- Cách làm
--
-- Lưu vài lượt gần nhất theo phiên. Khi lượt trước là CÂU HỎI LẠI và
-- lượt này chỉ là một mã thiết bị (câu trả lời cho chính câu hỏi đó),
-- thì GHÉP: lấy câu hỏi gốc, thay cụm mơ hồ bằng mã vừa chọn, rồi xử lý
-- như thể người dùng đã hỏi đầy đủ ngay từ đầu.
--
-- Chỉ giữ 30 phút. Hội thoại công việc không kéo dài hơn thế, mà giữ lâu
-- thì câu hỏi cũ lại chen vào câu hỏi mới.
-- =====================================================================

create table if not exists public.vmp_ai_hoi_thoai (
  id          bigint generated always as identity primary key,
  phien       text not null,
  cau_hoi     text not null,
  y_dinh      text,
  cho_lam_ro  boolean not null default false,  -- lượt này là câu hỏi lại?
  tao_luc     timestamptz not null default now()
);

create index if not exists idx_hoi_thoai_phien
  on public.vmp_ai_hoi_thoai (phien, tao_luc desc);

alter table public.vmp_ai_hoi_thoai enable row level security;
drop policy if exists hoi_thoai_doc on public.vmp_ai_hoi_thoai;
create policy hoi_thoai_doc on public.vmp_ai_hoi_thoai
  for select to authenticated using (true);

comment on table public.vmp_ai_hoi_thoai is
  'Trí nhớ ngắn cho đường SQL. Giữ 30 phút — đủ để nối câu hỏi lại với '
  'câu trả lời, không đủ lâu để câu cũ chen vào câu mới.';

-- ---------------------------------------------------------------------
-- Ghép câu hỏi hiện tại với ngữ cảnh lượt trước
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_ghep_ngu_canh(
  p_question text, p_phien text
) returns jsonb
language plpgsql volatile security definer set search_path = public
as $fn$
declare
  v_truoc  record;
  q        text := public.vmp_khong_dau(coalesce(p_question, ''));
  v_ma     text;
  v_ghep   text;
begin
  if p_phien is null or trim(p_phien) = '' then
    return jsonb_build_object('ghep', false, 'cau_hoi', p_question);
  end if;

  select cau_hoi, cho_lam_ro into v_truoc
  from public.vmp_ai_hoi_thoai
  where phien = p_phien and tao_luc > now() - interval '30 minutes'
  order by tao_luc desc limit 1;

  if not found or not v_truoc.cho_lam_ro then
    return jsonb_build_object('ghep', false, 'cau_hoi', p_question);
  end if;

  -- Lượt trước là câu hỏi lại. Lượt này có nhắc tới mã thiết bị nào không?
  select o.code into v_ma
  from public.vmp_objects o
  where o.is_active and length(o.code) >= 4
    and q like '%' || public.vmp_khong_dau(o.code) || '%'
  order by length(o.code) desc limit 1;

  if v_ma is null then
    return jsonb_build_object('ghep', false, 'cau_hoi', p_question);
  end if;

  -- GHÉP: giữ nguyên ý hỏi gốc, chỉ nói rõ là hỏi về mã nào.
  -- Không cắt ghép chuỗi cầu kỳ — thêm mã vào đầu là đủ để bước nhận
  -- diện khoá đúng đối tượng mà vẫn giữ toàn bộ ý ban đầu.
  v_ghep := v_ma || ' — ' || v_truoc.cau_hoi;

  return jsonb_build_object(
    'ghep', true, 'cau_hoi', v_ghep, 'ma', v_ma,
    'cau_hoi_goc', v_truoc.cau_hoi,
    'loi_dan', 'Dạ vâng, anh/chị chọn **' || v_ma || '**. Em quay lại câu hỏi '
               || 'lúc nãy nhé ạ 🌸' || E'\n\n');
end;
$fn$;

-- ---------------------------------------------------------------------
-- Nối vào đường trả lời nhanh
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_tra_loi_nhanh(
  p_question text,
  p_year integer default null,
  p_nguoi jsonb default '{}'::jsonb,
  p_phien text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public
as $fn$
declare
  v_gh   jsonb;
  v_hoi  text;
  v_dan  text := '';
  v_r    jsonb;
  v_hieu jsonb;
  v_dem  jsonb;
  v_kq   jsonb;
begin
  -- 0. Nối với lượt trước nếu đây là câu trả lời cho một câu hỏi lại
  v_gh  := public.rpc_ai_ghep_ngu_canh(p_question, p_phien);
  v_hoi := v_gh->>'cau_hoi';
  if (v_gh->>'ghep')::boolean then v_dan := v_gh->>'loi_dan'; end if;

  -- 1. Câu về người hỏi hoặc về chính Vali
  v_r := public.rpc_ai_ve_nguoi_hoi(v_hoi, coalesce(p_nguoi, '{}'::jsonb), p_year);
  if (v_r->>'khop')::boolean then
    insert into public.vmp_ai_hoi_thoai (phien, cau_hoi, y_dinh)
      values (coalesce(p_phien, 'khach'), p_question, v_r->>'y_dinh');
    return v_r || jsonb_build_object('vi_sao', 'Câu về người dùng hoặc về trợ lý.');
  end if;

  -- 2. Mơ hồ → hỏi lại, và GHI NHỚ để lượt sau nối lại được.
  --    BỎ QUA bước này khi vừa ghép: câu ghép vẫn còn cụm mơ hồ của câu
  --    gốc ("laf cân"), nhưng người dùng ĐÃ chọn mã rồi — hỏi lại lần nữa
  --    là quay vòng vô tận.
  v_r := case when (v_gh->>'ghep')::boolean then jsonb_build_object('mo_ho', false)
              else public.rpc_ai_kiem_mo_ho(v_hoi) end;
  if (v_r->>'mo_ho')::boolean then
    insert into public.vmp_ai_hoi_thoai (phien, cau_hoi, y_dinh, cho_lam_ro)
      values (coalesce(p_phien, 'khach'), v_hoi, 'hoi_lai', true);
    return jsonb_build_object(
      'khop', true, 'y_dinh', 'hoi_lai', 'nguon', 'sql',
      'tra_loi', v_r->>'cau_hoi_lai',
      'goi_y', (select jsonb_agg(e->>'ma') from jsonb_array_elements(v_r->'lua_chon') e),
      'vi_sao', 'Cụm "' || (v_r->>'cum') || '" khớp ' || (v_r->>'so_khop')
                || ' thiết bị — hỏi lại, và nhớ câu hỏi gốc để lát nối lại.');
  end if;

  v_hieu := public.rpc_ai_hieu_cau_hoi(v_hoi);

  if not (v_hieu->>'can_ai')::boolean then
    v_kq := public.rpc_ai_dung_cau_tra_loi(v_hoi, v_hieu, p_year);
    insert into public.vmp_ai_hoi_thoai (phien, cau_hoi, y_dinh)
      values (coalesce(p_phien, 'khach'), v_hoi, v_kq->>'y_dinh');
    return v_kq
      || jsonb_build_object('tra_loi', v_dan || (v_kq->>'tra_loi'))
      || jsonb_build_object('vi_sao', v_hieu->>'vi_sao')
      || jsonb_build_object('goi_y', public.rpc_ai_goi_y_tiep(v_hieu, p_year));
  end if;

  v_dem := public.rpc_ai_cache_doc(v_hoi);
  if (v_dem->>'trung')::boolean then
    insert into public.vmp_ai_hoi_thoai (phien, cau_hoi, y_dinh)
      values (coalesce(p_phien, 'khach'), v_hoi, 'dem');
    return jsonb_build_object(
      'khop', true, 'y_dinh', 'dem', 'nguon', 'dem',
      'tra_loi', v_dan || (v_dem->>'tra_loi'),
      'goi_y', public.rpc_ai_goi_y_tiep(v_hieu, p_year),
      'vi_sao', 'Đã hỏi trước đó, dữ liệu chưa đổi — dùng lại.');
  end if;

  -- Nhường AI, kèm câu hỏi đã ghép để nhánh AI cũng hiểu đúng ngữ cảnh
  insert into public.vmp_ai_hoi_thoai (phien, cau_hoi, y_dinh)
    values (coalesce(p_phien, 'khach'), v_hoi, 'chuyen_ai');
  return jsonb_build_object('khop', false, 'y_dinh', null, 'tra_loi', null,
    'cau_hoi_day_du', v_hoi,
    'goi_y', public.rpc_ai_goi_y_tiep(v_hieu, p_year),
    'vi_sao', v_hieu->>'vi_sao');
end;
$fn$;

revoke execute on function public.rpc_ai_ghep_ngu_canh(text, text) from anon, public;
revoke execute on function public.rpc_ai_tra_loi_nhanh(text, integer, jsonb, text) from anon, public;
grant execute on function public.rpc_ai_ghep_ngu_canh(text, text) to authenticated, service_role;
grant execute on function public.rpc_ai_tra_loi_nhanh(text, integer, jsonb, text) to authenticated, service_role;

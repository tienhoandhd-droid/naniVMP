-- =====================================================================
-- BỘ NHỚ ĐỆM CÂU TRẢ LỜI — và cách chống trả lời cũ
--
-- ---------------------------------------------------------------------
-- Chỗ khó thật sự
--
-- Đệm câu trả lời thì tiết kiệm hạn mức AI, nhưng dữ liệu VMP đổi liên
-- tục. Đệm sai cách là trả lời số cũ — trong hệ GMP đó không phải bất
-- tiện, đó là đưa sai thông tin cho người đang ra quyết định.
--
-- Hạn dùng theo thời gian (TTL) KHÔNG đủ. Hai ca hỏng nó không bắt được:
--
--   1) TTL còn hạn nhưng dữ liệu vừa đổi
--      QA sửa 30 hạng mục lúc 9h. Câu "bao nhiêu quá hạn" đệm lúc 8h,
--      TTL 24 giờ → tới 8h sáng mai vẫn trả số của hôm qua.
--
--   2) Dữ liệu KHÔNG đổi nhưng câu trả lời vẫn sai
--      "Quá hạn" tính theo CURRENT_DATE. Qua nửa đêm là có hạng mục tự
--      rơi vào quá hạn dù không ai ghi gì. Watermark theo updated_at
--      không nhúc nhích, nhưng đáp án đã sai.
--
-- ---------------------------------------------------------------------
-- Cách làm
--
-- Khoá đệm gồm CÂU HỎI + DẤU VÂN DỮ LIỆU. Dấu vân gộp ba thứ:
--
--   · số dòng vmp_plan_items          → thêm/xoá hạng mục là đổi
--   · max(updated_at) của plan_items  → sửa bất kỳ dòng nào là đổi
--   · CURRENT_DATE                    → qua ngày là đổi, bắt được ca 2
--
-- Dữ liệu đổi → dấu vân đổi → khoá không khớp → tính lại. Không cần dọn
-- đệm, dòng cũ tự hết tác dụng. TTL vẫn giữ nhưng chỉ là chốt chặn thứ
-- hai, không phải cơ chế chính.
--
-- Chỉ đệm câu trả lời của AI. Đường SQL chạy ~20ms nên đệm nó chỉ thêm
-- rủi ro trả số cũ mà không được lợi gì.
-- =====================================================================

create table if not exists public.vmp_ai_cache (
  id           bigint generated always as identity primary key,
  khoa_cau_hoi text        not null,   -- câu hỏi đã chuẩn hoá (bỏ dấu, gọn khoảng trắng)
  dau_van      text        not null,   -- ảnh chụp trạng thái dữ liệu lúc trả lời
  cau_hoi_goc  text        not null,
  tra_loi      text        not null,
  nguon        text        not null,   -- 'gemini' | 'du_phong'
  tao_luc      timestamptz not null default now(),
  het_han_luc  timestamptz not null default now() + interval '24 hours',
  so_lan_dung  integer     not null default 0,
  dung_gan_nhat timestamptz,
  unique (khoa_cau_hoi, dau_van)
);

create index if not exists idx_ai_cache_tim
  on public.vmp_ai_cache (khoa_cau_hoi, dau_van, het_han_luc);

comment on table public.vmp_ai_cache is
  'Đệm câu trả lời AI. Khoá gồm câu hỏi + dấu vân dữ liệu (số dòng + '
  'max updated_at + ngày hiện tại) nên dữ liệu đổi là dòng đệm tự hết '
  'tác dụng, không cần dọn.';

alter table public.vmp_ai_cache enable row level security;
drop policy if exists cache_doc on public.vmp_ai_cache;
create policy cache_doc on public.vmp_ai_cache
  for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- Dấu vân dữ liệu
-- ---------------------------------------------------------------------
create or replace function public.vmp_ai_dau_van()
returns text
language sql stable security definer set search_path = public
as $fn$
  select count(*)::text
      || '|' || coalesce(max(updated_at), 'epoch'::timestamptz)::text
      -- CURRENT_DATE là phần quan trọng nhất: "quá hạn", "còn bao nhiêu
      -- ngày", "sắp đến hạn" đều đổi khi sang ngày mới dù không ai ghi gì.
      || '|' || current_date::text
  from public.vmp_plan_items where is_active;
$fn$;

-- Chuẩn hoá câu hỏi để "Bao nhiêu quá hạn?" và "bao nhiêu  quá hạn"
-- dùng chung một ô đệm.
create or replace function public.vmp_ai_khoa_cau_hoi(p_q text)
returns text language sql immutable
as $fn$
  select regexp_replace(trim(public.vmp_khong_dau(coalesce(p_q, ''))), '\s+', ' ', 'g')
$fn$;

-- ---------------------------------------------------------------------
-- Đọc đệm
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_cache_doc(p_question text)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $fn$
declare
  v_khoa text := public.vmp_ai_khoa_cau_hoi(p_question);
  v_van  text := public.vmp_ai_dau_van();
  v_row  public.vmp_ai_cache;
begin
  update public.vmp_ai_cache
     set so_lan_dung = so_lan_dung + 1, dung_gan_nhat = now()
   where khoa_cau_hoi = v_khoa and dau_van = v_van and het_han_luc > now()
  returning * into v_row;

  if v_row.id is null then
    return jsonb_build_object('trung', false);
  end if;

  return jsonb_build_object(
    'trung', true, 'tra_loi', v_row.tra_loi, 'nguon', v_row.nguon,
    'tao_luc', v_row.tao_luc, 'so_lan_dung', v_row.so_lan_dung);
end;
$fn$;

revoke execute on function public.rpc_ai_cache_doc(text) from anon, public;
grant  execute on function public.rpc_ai_cache_doc(text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Ghi đệm — móc vào nhật ký, KHÔNG phải sửa workflow n8n
--
-- Workflow đã ghi vmp_ai_chat_log sau mỗi lần AI trả lời. Bắt luôn ở đó
-- thì đệm tự đầy mà không phải thêm node nào.
-- ---------------------------------------------------------------------
create or replace function public.vmp_ai_ghi_dem()
returns trigger language plpgsql security definer set search_path = public
as $fn$
begin
  -- Chỉ đệm câu do AI trả lời. Đường SQL đã nhanh sẵn.
  if new.duong_tra_loi not in ('gemini', 'du_phong')
     or new.answer is null or length(new.answer) < 20 then
    return new;
  end if;

  insert into public.vmp_ai_cache
    (khoa_cau_hoi, dau_van, cau_hoi_goc, tra_loi, nguon)
  values
    (public.vmp_ai_khoa_cau_hoi(new.question), public.vmp_ai_dau_van(),
     new.question, new.answer, new.duong_tra_loi)
  on conflict (khoa_cau_hoi, dau_van) do update
    set tra_loi = excluded.tra_loi, nguon = excluded.nguon, tao_luc = now(),
        het_han_luc = now() + interval '24 hours';
  return new;
exception when others then
  -- Đệm hỏng không được làm hỏng nhật ký — nhật ký là yêu cầu ALCOA+.
  return new;
end;
$fn$;

drop trigger if exists ghi_dem_ai on public.vmp_ai_chat_log;
create trigger ghi_dem_ai
  after insert on public.vmp_ai_chat_log
  for each row execute function public.vmp_ai_ghi_dem();

-- ---------------------------------------------------------------------
-- Nối đệm vào đường trả lời nhanh
--
-- Thứ tự: tự nhận diện bằng SQL → nếu không được thì tra đệm → nếu vẫn
-- không có mới gọi AI. Workflow n8n không phải sửa: nó vốn đã gọi
-- rpc_ai_tra_loi_nhanh trước rồi mới tới agent.
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_tra_loi_nhanh(
  p_question text,
  p_year integer default null
) returns jsonb
language plpgsql volatile security definer set search_path = public
as $fn$
declare
  v_hieu jsonb := public.rpc_ai_hieu_cau_hoi(p_question);
  v_dem  jsonb;
begin
  -- 1. Hiểu được câu hỏi từ dữ liệu → dựng câu trả lời, không tốn AI
  if not (v_hieu->>'can_ai')::boolean then
    return public.rpc_ai_dung_cau_tra_loi(p_question, v_hieu, p_year)
           || jsonb_build_object('vi_sao', v_hieu->>'vi_sao');
  end if;

  -- 2. Câu này cần AI — xem đã trả lời rồi và dữ liệu chưa đổi không
  v_dem := public.rpc_ai_cache_doc(p_question);
  if (v_dem->>'trung')::boolean then
    return jsonb_build_object(
      'khop', true, 'y_dinh', 'dem', 'nguon', 'dem',
      'tra_loi', v_dem->>'tra_loi',
      'vi_sao', 'Câu này đã hỏi trước đó và dữ liệu chưa đổi kể từ lúc đó '
                || '(' || to_char((v_dem->>'tao_luc')::timestamptz, 'HH24:MI DD/MM') || ') '
                || '— dùng lại câu trả lời cũ, không gọi AI.');
  end if;

  -- 3. Chưa có gì → nhường AI
  return jsonb_build_object('khop', false, 'y_dinh', null, 'tra_loi', null,
    'vi_sao', v_hieu->>'vi_sao');
end;
$fn$;

revoke execute on function public.rpc_ai_tra_loi_nhanh(text, integer) from anon, public;
grant  execute on function public.rpc_ai_tra_loi_nhanh(text, integer)
  to authenticated, service_role;

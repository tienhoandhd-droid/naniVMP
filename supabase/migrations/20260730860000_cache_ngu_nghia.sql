-- =====================================================================
-- CACHE NGỮ NGHĨA — trả lời câu hỏi lặp trong ~1 giây, học từ
-- Du_bao_thoi_tiet (bảng semantic_cache, migration 031b bên đó)
--
-- Câu hỏi ở VMP lặp rất nhiều: "bao nhiêu hạng mục quá hạn", "tuần này
-- có gì gấp" chiếm phần lớn lưu lượng, và mỗi lần đều đi qua đủ ba lớp
-- AI mất 10–30 giây + tốn quota. Trong khi câu trả lời giống hệt nhau
-- nếu dữ liệu chưa đổi.
--
-- Cache theo VECTOR câu hỏi (đã có sẵn từ bước nhúng RAG, không tốn
-- thêm lượt gọi nào): câu na ná nhau — "bao nhiêu mục quá hạn" và "còn
-- mấy hạng mục trễ hạn" — dùng chung một câu trả lời.
--
-- Ba van an toàn GMP, thiếu cái nào cũng không được:
--   1. TỰ VÔ HIỆU KHI DỮ LIỆU ĐỔI — trigger trên vmp_plan_items và
--      vmp_objects: ai cập nhật tiến độ là toàn bộ cache số liệu chết
--      ngay lập tức. Đây là điểm ăn tiền của bản thời tiết.
--   2. SỐNG TỐI ĐA 6 GIỜ VÀ KHÔNG QUA NGÀY — "còn 9 ngày nữa đến hạn" sang ngày mai
--      thành sai dù không ai đụng dữ liệu. Cache chỉ khớp bản ghi tạo
--      TRONG NGÀY.
--   3. KHÔNG CACHE CÂU CÁ NHÂN — "việc của tôi", "ta là ai" mà đem trả
--      cho người khác là lộ chuyện riêng. Câu chứa đại từ cá nhân thì
--      không lưu.
-- =====================================================================

create table if not exists public.vmp_ai_cache_ngu_nghia (
  id           bigserial primary key,
  cau_hoi      text not null,
  cau_hoi_khoa text not null,                       -- bỏ dấu + chuẩn hoá, để bắt trùng tuyệt đối
  vector       extensions.vector(768) not null,
  phan_hoi     jsonb not null,                      -- {tra_loi, trich_dan, goi_y, lop}
  phu_thuoc    text not null default 'so_lieu'      -- so_lieu | tri_thuc
    check (phu_thuoc in ('so_lieu', 'tri_thuc')),
  hit_count    integer not null default 0,
  is_valid     boolean not null default true,
  invalidated_at     timestamptz,
  invalidated_reason text,
  created_at   timestamptz not null default now()
);

comment on table public.vmp_ai_cache_ngu_nghia is
  'Cache câu trả lời theo vector câu hỏi (học từ Du_bao_thoi_tiet). Tự vô hiệu khi dữ liệu đổi; sống tối đa hết ngày; không nhận câu cá nhân.';

create index if not exists vmp_cache_nn_valid_idx
  on public.vmp_ai_cache_ngu_nghia (is_valid, created_at);
create index if not exists vmp_cache_nn_khoa_idx
  on public.vmp_ai_cache_ngu_nghia (cau_hoi_khoa) where is_valid;
create index if not exists vmp_cache_nn_vector_idx
  on public.vmp_ai_cache_ngu_nghia using hnsw (vector extensions.vector_cosine_ops);

alter table public.vmp_ai_cache_ngu_nghia enable row level security;
drop policy if exists cache_nn_doc on public.vmp_ai_cache_ngu_nghia;
create policy cache_nn_doc on public.vmp_ai_cache_ngu_nghia
  for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- Tìm trong cache. Trả {trung: true, phan_hoi} khi có, {trung: false}
-- khi không. Có thì cộng hit_count và ghi luôn câu hỏi vào mạch hội
-- thoại — không thì lượt cache-hit sẽ thành lỗ hổng trí nhớ của phiên.
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_cache_nn_tim(
  p_cau_hoi text,
  p_vector  text default null,
  p_phien   text default null,
  p_nguong  double precision default 0.93
) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $fn$
declare
  v_khoa text := btrim(regexp_replace(public.vmp_khong_dau(coalesce(p_cau_hoi,'')), '[^a-z0-9]+', ' ', 'g'));
  v_r    record;
begin
  -- Ưu tiên trùng tuyệt đối theo khoá chuẩn hoá (rẻ nhất, chắc nhất)
  select id, phan_hoi, 1.0::float as giong into v_r
  from public.vmp_ai_cache_ngu_nghia
  where is_valid and created_at::date = current_date
    and created_at > now() - interval '6 hours'   -- van phụ: người dùng dặn cẩn thận, câu trả lời đổi theo thời gian
    and cau_hoi_khoa = v_khoa
  order by id desc limit 1;

  -- Không trùng khít thì so vector — chỉ khi có vector
  if v_r.id is null and p_vector is not null and btrim(p_vector) <> '' then
    select id, phan_hoi, (1 - (vector <=> p_vector::vector))::float as giong into v_r
    from public.vmp_ai_cache_ngu_nghia
    where is_valid and created_at::date = current_date
      and created_at > now() - interval '6 hours'
      and (1 - (vector <=> p_vector::vector)) >= p_nguong
    order by vector <=> p_vector::vector
    limit 1;
  end if;

  if v_r.id is null then
    return jsonb_build_object('trung', false);
  end if;

  update public.vmp_ai_cache_ngu_nghia set hit_count = hit_count + 1 where id = v_r.id;

  -- Ghi vào mạch hội thoại để "câu tiếp theo" vẫn nối được ngữ cảnh
  if p_phien is not null and btrim(p_phien) <> '' then
    insert into public.vmp_ai_hoi_thoai (phien, cau_hoi, y_dinh, cho_lam_ro)
    values (p_phien, p_cau_hoi, 'cache', false);
  end if;

  return jsonb_build_object('trung', true, 'do_giong', round(v_r.giong::numeric, 3), 'phan_hoi', v_r.phan_hoi);
end;
$fn$;

-- ---------------------------------------------------------------------
-- Lưu vào cache. Tự chối câu cá nhân và câu trả lời rỗng/lỗi.
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_cache_nn_luu(
  p_cau_hoi  text,
  p_vector   text,
  p_phan_hoi jsonb
) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $fn$
declare
  v_khoa text := btrim(regexp_replace(public.vmp_khong_dau(coalesce(p_cau_hoi,'')), '[^a-z0-9]+', ' ', 'g'));
begin
  -- Không có vector / không có nội dung thì thôi
  if p_vector is null or btrim(p_vector) = ''
     or coalesce(btrim(p_phan_hoi ->> 'tra_loi'), '') = '' then
    return jsonb_build_object('luu', false, 'ly_do', 'thieu vector hoac noi dung');
  end if;

  -- Câu cá nhân: trả cho người khác là lộ chuyện riêng — không lưu
  if (' ' || v_khoa || ' ') ~ ' (toi|ta|minh|em|cua toi|cua ta|cua minh|la ai) ' then
    return jsonb_build_object('luu', false, 'ly_do', 'cau ca nhan');
  end if;

  -- Một khoá chỉ giữ bản mới nhất
  update public.vmp_ai_cache_ngu_nghia
  set is_valid = false, invalidated_at = now(), invalidated_reason = 'co ban moi hon'
  where is_valid and cau_hoi_khoa = v_khoa;

  insert into public.vmp_ai_cache_ngu_nghia (cau_hoi, cau_hoi_khoa, vector, phan_hoi)
  values (p_cau_hoi, v_khoa, p_vector::vector, p_phan_hoi);

  return jsonb_build_object('luu', true);
end;
$fn$;

revoke execute on function public.rpc_ai_cache_nn_tim(text, text, text, double precision) from public, anon;
revoke execute on function public.rpc_ai_cache_nn_luu(text, text, jsonb) from public, anon;
grant execute on function public.rpc_ai_cache_nn_tim(text, text, text, double precision) to authenticated, service_role;
grant execute on function public.rpc_ai_cache_nn_luu(text, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Van 1: dữ liệu đổi là cache số liệu chết ngay.
-- Trigger MỨC LỆNH (statement-level) — một lần đồng bộ 400 dòng cũng
-- chỉ chạy đúng một lần, không thành 400 lần update cache.
-- ---------------------------------------------------------------------
create or replace function public.vmp_cache_nn_vo_hieu()
returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  update public.vmp_ai_cache_ngu_nghia
  set is_valid = false, invalidated_at = now(),
      invalidated_reason = 'du lieu ' || tg_table_name || ' vua doi'
  where is_valid and phu_thuoc = 'so_lieu';
  return null;
end;
$fn$;

drop trigger if exists cache_nn_vo_hieu on public.vmp_plan_items;
create trigger cache_nn_vo_hieu
  after insert or update or delete on public.vmp_plan_items
  for each statement execute function public.vmp_cache_nn_vo_hieu();

drop trigger if exists cache_nn_vo_hieu on public.vmp_objects;
create trigger cache_nn_vo_hieu
  after insert or update or delete on public.vmp_objects
  for each statement execute function public.vmp_cache_nn_vo_hieu();

-- Dọn rác: bản ghi hết hạn quá 7 ngày thì xoá hẳn (cron dọn đêm đã có
-- sẵn trong hệ — thêm một lệnh vào hàm dọn là xong; ở đây cho index
-- partial nên bảng không phình).

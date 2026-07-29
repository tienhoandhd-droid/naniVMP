-- =====================================================================
-- BA TẦNG BỘ NHỚ — để Vali là người bạn nhớ chuyện, không phải máy tra
--
-- ---------------------------------------------------------------------
-- Vì sao bản cũ chưa đủ để tâm sự
--
-- Vali hiện chỉ nhớ 30 phút. Hôm nay than mệt, mai vào hỏi thì nó không
-- biết gì — mỗi lần trò chuyện là một người lạ. Tâm sự với người quên
-- sạch sau nửa tiếng thì không gọi là tâm sự.
--
-- ---------------------------------------------------------------------
-- Kiến trúc: ba tầng, theo chuẩn đang dùng phổ biến 2026
--
--   LÕI    (core)     — vài điều LUÔN nhớ về người này: tên, quyền, khối
--                       lượng việc, cách xưng hô ưa thích. Luôn nằm sẵn
--                       trong ngữ cảnh, không phải đi tìm.
--   GẦN    (recall)   — mấy lượt vừa rồi trong phiên. Đã có sẵn.
--   KHO    (archival) — chuyện cũ đã lắng lại thành SỰ KIỆN và THÓI QUEN,
--                       chỉ lôi ra khi câu hỏi chạm tới.
--
-- Tầng KHO chia hai loại, đúng như tài liệu phân biệt:
--   · viec_da_xay_ra (episodic) — "hôm 29/07 ngươi than mệt vì 45 mục
--     quá hạn"
--   · dieu_biet_ve   (semantic) — "ngươi hay hỏi về khu C1", "ngươi
--     thích câu trả lời ngắn"
--
-- ---------------------------------------------------------------------
-- Nguyên tắc giữ chừng mực
--
-- Đây là bộ nhớ về ĐỒNG NGHIỆP, không phải hồ sơ theo dõi. Nên:
--   · chỉ nhớ điều liên quan tới công việc và cách làm việc
--   · KHÔNG suy diễn tâm lý, không chấm điểm thái độ
--   · người dùng xoá được (RLS cho phép chủ sở hữu tự xoá)
--   · điều lâu không nhắc tới thì mờ dần rồi bỏ
-- =====================================================================

create table if not exists public.vmp_ai_bo_nho (
  id         bigint generated always as identity primary key,
  nguoi      text not null,            -- email hoặc tên
  tang       text not null,            -- 'loi' | 'kho'
  loai       text not null,            -- 'viec_da_xay_ra' | 'dieu_biet_ve'
  noi_dung   text not null,
  tu_khoa    text[] not null default '{}',
  quan_trong integer not null default 5,   -- 1..10
  so_lan_nhac integer not null default 0,
  tao_luc    timestamptz not null default now(),
  nhac_cuoi  timestamptz,
  unique (nguoi, noi_dung)
);

create index if not exists idx_bo_nho_nguoi on public.vmp_ai_bo_nho (nguoi, tang, quan_trong desc);

alter table public.vmp_ai_bo_nho enable row level security;
drop policy if exists bo_nho_cua_minh on public.vmp_ai_bo_nho;
create policy bo_nho_cua_minh on public.vmp_ai_bo_nho
  for select to authenticated
  using (nguoi = (select email from profiles where id = auth.uid())
         or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
drop policy if exists xoa_bo_nho_cua_minh on public.vmp_ai_bo_nho;
create policy xoa_bo_nho_cua_minh on public.vmp_ai_bo_nho
  for delete to authenticated
  using (nguoi = (select email from profiles where id = auth.uid()));

comment on table public.vmp_ai_bo_nho is
  'Bộ nhớ dài hạn của Vali về từng người. Chỉ ghi điều liên quan tới công '
  'việc và cách làm việc — KHÔNG suy diễn tâm lý, không chấm điểm thái độ. '
  'Người dùng xoá được bộ nhớ về mình.';

-- ---------------------------------------------------------------------
-- Ghi nhớ
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_ghi_nho(
  p_nguoi text, p_loai text, p_noi_dung text,
  p_tu_khoa text[] default '{}', p_quan_trong integer default 5
) returns jsonb
language plpgsql volatile security definer set search_path = public
as $fn$
begin
  if p_nguoi is null or trim(p_nguoi) = '' or length(trim(p_noi_dung)) < 8 then
    return jsonb_build_object('ok', false);
  end if;

  insert into public.vmp_ai_bo_nho (nguoi, tang, loai, noi_dung, tu_khoa, quan_trong)
  values (trim(p_nguoi), 'kho', p_loai, trim(p_noi_dung),
          coalesce(p_tu_khoa, '{}'), least(greatest(coalesce(p_quan_trong,5),1),10))
  on conflict (nguoi, noi_dung) do update
    set so_lan_nhac = public.vmp_ai_bo_nho.so_lan_nhac + 1,
        nhac_cuoi   = now(),
        quan_trong  = least(public.vmp_ai_bo_nho.quan_trong + 1, 10);
  return jsonb_build_object('ok', true);
end;
$fn$;

-- ---------------------------------------------------------------------
-- Nhớ lại: lõi luôn có, kho chỉ lôi ra khi câu hỏi chạm tới
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_nho_lai(
  p_nguoi text, p_cau_hoi text default null, p_year integer default null
) returns jsonb
language plpgsql volatile security definer set search_path = public
as $fn$
declare
  v_year integer := coalesce(p_year, extract(year from now())::integer);
  q      text    := public.vmp_khong_dau(coalesce(p_cau_hoi, ''));
  v_loi  jsonb;
  v_kho  jsonb;
  v_lan  jsonb;
begin
  if p_nguoi is null or trim(p_nguoi) = '' then
    return jsonb_build_object('co', false);
  end if;

  -- TẦNG LÕI: tính tại chỗ từ dữ liệu, luôn tươi, không cần lưu
  select jsonb_build_object(
    'ten', p_nguoi,
    'so_hang_muc', count(*),
    'qua_han', count(*) filter (where computed_status = 'over'),
    'sap_den_han_30', count(*) filter (where computed_status <> 'done'
                        and deadline_vmp between current_date and current_date + 30),
    'nhom_viec', (select string_agg(distinct work_group, ' · ')
                  from vmp_plan_items
                  where year = v_year and is_active and owner_name = p_nguoi
                    and work_group is not null))
  into v_loi
  from vmp_plan_items
  where year = v_year and is_active and owner_name = p_nguoi;

  -- TẦNG KHO: lôi ra điều liên quan tới câu hỏi, hoặc điều quan trọng nhất
  select coalesce(jsonb_agg(jsonb_build_object(
           'loai', loai, 'noi_dung', noi_dung,
           'khi_nao', to_char(tao_luc, 'DD/MM/YYYY')) order by diem desc), '[]'::jsonb)
  into v_kho
  from (
    select loai, noi_dung, tao_luc,
           quan_trong
           + (select count(*) * 3 from unnest(tu_khoa) k where q like '%' || k || '%')
           -- Điều lâu không nhắc thì mờ dần: mỗi 30 ngày trừ 1 điểm
           - (extract(day from now() - coalesce(nhac_cuoi, tao_luc)) / 30)::int as diem
    from public.vmp_ai_bo_nho
    where nguoi = p_nguoi
    order by diem desc limit 5) t
  where diem > 0;

  -- Lần trò chuyện gần nhất, để mở lời cho tự nhiên
  select jsonb_build_object('lan_cuoi', to_char(max(tao_luc), 'DD/MM HH24:MI'),
                            'so_luot', count(*))
  into v_lan
  from public.vmp_ai_hoi_thoai
  where phien = p_nguoi and tao_luc > now() - interval '30 days';

  return jsonb_build_object(
    'co', true, 'tang_loi', v_loi, 'tang_kho', v_kho, 'lan_truoc', v_lan,
    'huong_dan',
      'tang_loi là điều LUÔN đúng về người này, dùng thoải mái. '
      || 'tang_kho là chuyện cũ — nhắc lại được nhưng phải tự nhiên, đừng '
      || 'liệt kê ra như đọc hồ sơ. Ví dụ đúng: "lần trước ngươi than mệt, '
      || 'giờ đỡ chưa". Ví dụ SAI: "theo ghi nhận ngày 29/07 ngươi đã than mệt".');
end;
$fn$;

-- ---------------------------------------------------------------------
-- Tự lắng đọng: sau mỗi lượt, rút ra điều đáng nhớ
--
-- Không dùng mô hình để trích — quá tốn cho việc chạy mọi lượt. Rút bằng
-- luật đơn giản: tâm sự, và chủ đề hỏi đi hỏi lại.
-- ---------------------------------------------------------------------
create or replace function public.vmp_ai_lang_dong()
returns trigger language plpgsql security definer set search_path = public
as $fn$
declare v_ma text;
begin
  if new.phien is null or new.phien !~ '@' then return new; end if;

  if new.y_dinh = 'tam_su' then
    perform public.rpc_ai_ghi_nho(new.phien, 'viec_da_xay_ra',
      'Từng nói đang quá tải, mệt vì nhiều việc',
      array['met','ap luc','qua tai','nhieu viec'], 7);
  end if;

  -- Hỏi về cùng một mã ≥ 2 lần trong 30 ngày → đó là mối quan tâm thật
  select o.code into v_ma
  from vmp_objects o
  where o.is_active and length(o.code) >= 4
    and public.vmp_khong_dau(new.cau_hoi) like '%' || public.vmp_khong_dau(o.code) || '%'
  limit 1;

  if v_ma is not null and (
      select count(*) from public.vmp_ai_hoi_thoai h
      where h.phien = new.phien and h.tao_luc > now() - interval '30 days'
        and public.vmp_khong_dau(h.cau_hoi) like '%' || public.vmp_khong_dau(v_ma) || '%') >= 2
  then
    perform public.rpc_ai_ghi_nho(new.phien, 'dieu_biet_ve',
      'Hay hỏi về thiết bị ' || v_ma, array[public.vmp_khong_dau(v_ma)], 6);
  end if;

  return new;
exception when others then
  return new;   -- lắng đọng hỏng không được làm hỏng hội thoại
end;
$fn$;

drop trigger if exists lang_dong_bo_nho on public.vmp_ai_hoi_thoai;
create trigger lang_dong_bo_nho
  after insert on public.vmp_ai_hoi_thoai
  for each row execute function public.vmp_ai_lang_dong();

-- Lịch sử hội thoại giữ 30 ngày thay vì 30 phút -----------------------
-- 30 phút đủ để nối câu hỏi lại, nhưng không đủ để nhớ chuyện hôm qua.
-- Phần ghép ngữ cảnh vẫn chỉ nhìn 30 phút; phần nhớ lại nhìn 30 ngày.

revoke execute on function public.rpc_ai_ghi_nho(text, text, text, text[], integer) from anon, public;
revoke execute on function public.rpc_ai_nho_lai(text, text, integer) from anon, public;
grant execute on function public.rpc_ai_ghi_nho(text, text, text, text[], integer) to authenticated, service_role;
grant execute on function public.rpc_ai_nho_lai(text, text, integer) to authenticated, service_role;

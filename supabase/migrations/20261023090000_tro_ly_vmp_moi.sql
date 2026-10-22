-- =====================================================================
-- Trợ lý VMP mới (23/10/2026) — thay Vali cũ
--
-- AI chỉ đổi câu hỏi thành {cong_cu, tham_so}. Con số và câu trả lời do
-- các hàm dưới đây dựng, chạy bằng quyền người hỏi (auth.uid()).
--
-- Tập hạng mục giống hệt rpc_get_vmp_dashboard: đối tượng nguồn xem được
-- (vmp_can_view_source_object), năm hiện tại, is_active, không thiếu trên
-- sheet, trạng thái 'active' (web bỏ 'cancelled' và 'not_applicable'). Quá hạn / sắp đến hạn theo HẠN ĐÍCH VMP, ngày Bangkok,
-- giống ô "Quá hạn đích VMP" ở Tổng quan (classifyVmpDeadline).
--
-- Chỉ thêm bảng nhật ký mới và hàm mới. Không đổi bảng hay dữ liệu cũ.
-- Thiết kế: docs/superpowers/specs/2026-10-22-tro-ly-vmp-moi-design.md
-- =====================================================================

-- Nhật ký câu hỏi: để biết câu nào chưa trả lời được mà bổ sung công cụ.
create table if not exists public.vmp_tro_ly_nhat_ky (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  cau_hoi text not null check (char_length(cau_hoi) between 1 and 500),
  cong_cu text check (char_length(cong_cu) <= 40),
  tham_so jsonb,
  duong text not null check (duong in ('ai', 'doan_nhanh', 'goi_y', 'loi')),
  mo_hinh text check (char_length(mo_hinh) <= 60),
  ok boolean not null,
  so_dong integer,
  thoi_gian_ms integer check (thoi_gian_ms between 0 and 600000),
  danh_gia smallint check (danh_gia in (-1, 1)),
  created_at timestamptz not null default now()
);
create index if not exists vmp_tro_ly_nhat_ky_tao_idx on public.vmp_tro_ly_nhat_ky (created_at desc);
create index if not exists vmp_tro_ly_nhat_ky_nguoi_idx on public.vmp_tro_ly_nhat_ky (user_id, created_at desc);
alter table public.vmp_tro_ly_nhat_ky enable row level security;
revoke all on public.vmp_tro_ly_nhat_ky from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Tiện ích
-- ---------------------------------------------------------------------
create or replace function public.vmp_tl_hom_nay()
returns date
language sql
stable
set search_path = public, pg_temp
as $$ select (now() at time zone 'Asia/Bangkok')::date $$;

-- Chữ thường, bỏ dấu, gọn khoảng trắng — để so khớp chữ người dùng gõ.
create or replace function public.vmp_tl_chuan(p text)
returns text
language sql
stable
set search_path = public, pg_temp
as $$ select regexp_replace(lower(extensions.unaccent(btrim(coalesce(p, '')))), '\s+', ' ', 'g') $$;

-- Mọi từ trong p_tu_khoa đều nằm trong p_chu (đã chuẩn hoá). Rỗng thì khớp.
create or replace function public.vmp_tl_khop_tu(p_chu text, p_tu_khoa text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(bool_and(position(t in public.vmp_tl_chuan(p_chu)) > 0), true)
    from regexp_split_to_table(public.vmp_tl_chuan(p_tu_khoa), ' ') t
   where t <> ''
$$;

-- Tên người: mọi từ gõ vào phải TRÙNG NGUYÊN một từ trong tên ("An" không khớp "Xuân").
create or replace function public.vmp_tl_khop_ten(p_ten text, p_go text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(bool_and(t = any(regexp_split_to_array(public.vmp_tl_chuan(p_ten), ' '))), true)
    from regexp_split_to_table(public.vmp_tl_chuan(p_go), ' ') t
   where t <> ''
$$;

create or replace function public.vmp_tl_ngay(p date)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$ select to_char(p, 'DD/MM/YYYY') $$;

create or replace function public.vmp_tl_nhan_bo_phan(p text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p when 'xsx' then 'Xưởng sản xuất' when 'cd' then 'Cơ điện' when 'kho' then 'Kho'
                when 'qc' then 'QC – Kiểm nghiệm' when 'rd' then 'RD – Nghiên cứu phát triển'
                when 'qa' then 'QA – QLCL' else p end
$$;

-- Giai đoạn kế tiếp chưa xong, theo trạng thái 4 pha.
create or replace function public.vmp_tl_giai_doan(p_dc text, p_td text, p_bc text, p_vmp text, p_xong boolean)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_xong then 'Xong'
    when p_bc = 'completed' then 'Chờ đóng VMP'
    when p_td = 'completed' then 'Báo cáo'
    when p_dc = 'completed' then 'Thẩm định'
    when p_dc = 'in_progress' then 'Đề cương'
    else 'Chưa bắt đầu' end
$$;

-- ---------------------------------------------------------------------
-- Tập hạng mục người hỏi xem được (giống rpc_get_vmp_dashboard)
-- ---------------------------------------------------------------------
create or replace function public.vmp_tl_hang_muc(p_uid uuid)
returns table (
  validation_code text, object_code text, object_name text, validation_type text,
  work_group text, depts text[], area text, line text, owner_name text,
  secondary_owner text, owner_person_id uuid, deadline_vmp date, actual_vmp_date date,
  giai_doan text, xong boolean, so_ngay integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with nguon as materialized (
    select s.object_code, s.area_code, s.line, o.name master_name, o.department master_department
      from public.vmp_source_objects s
      left join public.vmp_objects o on o.code = s.object_code and o.is_active
     where s.is_active
       and public.vmp_can_view_source_object(p_uid, s.id)
  ), muc as (
    select i.*, n.master_name, n.master_department, n.area_code, n.line src_line,
           (i.actual_vmp_date is not null or i.status_vmp::text = 'completed') la_xong
      from public.vmp_plan_items i
      join nguon n on n.object_code = i.object_code
     where i.year = extract(year from public.vmp_tl_hom_nay())::int
       and i.is_active
       and not i.missing_from_sheet
       -- Web chỉ đếm hạng mục 'active' (classifyVmpDeadline, tally); bỏ cả 'not_applicable'.
       and coalesce(i.item_state, 'active') = 'active'
  )
  select m.validation_code, m.object_code, m.master_name, m.validation_type, m.work_group,
         coalesce(nullif(m.departments, array[]::text[]),
                  nullif(public.vmp_parse_depts(m.department_text), array[]::text[]),
                  array[coalesce(m.master_department, 'qa')]),
         m.area_code, m.src_line, nullif(btrim(m.owner_name), ''), nullif(btrim(m.secondary_owner), ''),
         m.owner_person_id, m.deadline_vmp, m.actual_vmp_date,
         public.vmp_tl_giai_doan(m.status_protocol::text, m.status_validation::text,
                                 m.status_report::text, m.status_vmp::text, m.la_xong),
         m.la_xong,
         case when m.la_xong or m.deadline_vmp is null then null
              else m.deadline_vmp - public.vmp_tl_hom_nay() end
    from muc m
$$;

-- Những tên phụ trách (chính hoặc hỗ trợ) khớp chữ đã gõ, trong phạm vi người hỏi.
-- Trùng khít một tên thì chỉ trả tên đó.
create or replace function public.vmp_tl_ten_khop(p_uid uuid, p_go text)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ten as (
    select distinct t from public.vmp_tl_hang_muc(p_uid) h,
           lateral unnest(array[h.owner_name, h.secondary_owner]) t
     where t is not null and public.vmp_tl_khop_ten(t, p_go)
  )
  select case when exists (select 1 from ten where public.vmp_tl_chuan(t) = public.vmp_tl_chuan(p_go))
              then (select array_agg(t) from ten where public.vmp_tl_chuan(t) = public.vmp_tl_chuan(p_go))
              else (select array_agg(t order by t) from ten) end
$$;

-- Bộ lọc chung. Tham số đã được rpc_tro_ly_tra_loi kiểm trước.
create or replace function public.vmp_tl_qua_loc(
  p_depts text[], p_nhom text, p_khu text, p_loai text, p_nguoi text, p_phu text, p jsonb)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select (p->>'bo_phan' is null or p->>'bo_phan' = any(p_depts))
     and (p->>'nhom_viec' is null or public.vmp_tl_khop_tu(p_nhom, p->>'nhom_viec'))
     and (p->>'khu_vuc' is null or public.vmp_tl_chuan(p_khu) = public.vmp_tl_chuan(p->>'khu_vuc'))
     and (p->>'loai' is null or upper(p_loai) = upper(p->>'loai'))
     and (p->>'nguoi' is null
          or public.vmp_tl_khop_ten(p_nguoi, p->>'nguoi')
          or public.vmp_tl_khop_ten(p_phu, p->>'nguoi'))
$$;

-- Nhãn bộ lọc để hiện "Tôi hiểu là: …".
create or replace function public.vmp_tl_nhan_loc(p jsonb)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select concat_ws(' · ',
    case when p->>'bo_phan' is not null then public.vmp_tl_nhan_bo_phan(p->>'bo_phan') end,
    case when p->>'nhom_viec' is not null then 'Nhóm: ' || (p->>'nhom_viec') end,
    case when p->>'khu_vuc' is not null then 'Khu ' || upper(p->>'khu_vuc') end,
    case when p->>'loai' is not null then upper(p->>'loai') end,
    case when p->>'nguoi' is not null then 'Người: ' || (p->>'nguoi') end)
$$;

-- Một dòng hạng mục cho bảng trả lời.
create or replace function public.vmp_tl_dong(
  p_ma text, p_doi_tuong text, p_ten text, p_loai text, p_han date, p_so_ngay integer,
  p_phu_trach text, p_giai_doan text)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'ma', p_ma,
    'doi_tuong', concat_ws(' · ', p_doi_tuong, p_ten),
    'loai', p_loai,
    'han', coalesce(public.vmp_tl_ngay(p_han), '—'),
    'con', case when p_so_ngay is null then '—'
                when p_so_ngay < 0 then 'trễ ' || (-p_so_ngay) || ' ngày'
                when p_so_ngay = 0 then 'hôm nay'
                else 'còn ' || p_so_ngay || ' ngày' end,
    'phu_trach', coalesce(p_phu_trach, '—'),
    'giai_doan', p_giai_doan)
$$;

create or replace function public.vmp_tl_cot_hang_muc()
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select '[{"key":"ma","nhan":"Mã thẩm định"},{"key":"doi_tuong","nhan":"Đối tượng"},
           {"key":"han","nhan":"Hạn đích VMP"},{"key":"con","nhan":"Còn"},
           {"key":"giai_doan","nhan":"Giai đoạn"},{"key":"phu_trach","nhan":"Phụ trách"}]'::jsonb
$$;

create or replace function public.vmp_tl_goi_y(p_nhan text, p_cong_cu text, p_tham_so jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$ select jsonb_build_object('nhan', p_nhan, 'cong_cu', p_cong_cu, 'tham_so', coalesce(p_tham_so, '{}'::jsonb)) $$;

-- ---------------------------------------------------------------------
-- Từng công cụ (nội bộ; chỉ gọi qua rpc_tro_ly_tra_loi)
-- ---------------------------------------------------------------------
create or replace function public.vmp_tl_tong_quan(p_uid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
begin
  select count(*) tong,
         count(*) filter (where h.xong) xong,
         count(*) filter (where not h.xong and h.so_ngay < 0) qua_han,
         count(*) filter (where not h.xong and h.so_ngay between 0 and 30) sap_han,
         count(*) filter (where not h.xong and h.deadline_vmp is null) chua_han
    into v
    from public.vmp_tl_hang_muc(p_uid) h;
  return jsonb_build_object(
    'ok', true,
    'hieu_la', 'Tổng quan năm ' || extract(year from public.vmp_tl_hom_nay()),
    'tra_loi', case when v.tong = 0 then 'Bạn chưa có hạng mục nào trong phạm vi được xem năm nay.'
      else format('Năm %s có %s hạng mục: đã xong %s (%s%%), quá hạn %s, đến hạn trong 30 ngày %s%s.',
                  extract(year from public.vmp_tl_hom_nay()), v.tong, v.xong,
                  round(v.xong * 100.0 / v.tong), v.qua_han, v.sap_han,
                  case when v.chua_han > 0 then format(', chưa có hạn đích %s', v.chua_han) else '' end) end,
    'so_lieu', to_jsonb(v),
    'goi_y', jsonb_build_array(
      public.vmp_tl_goi_y('Hạng mục quá hạn', 'qua_han', null),
      public.vmp_tl_goi_y('Đến hạn trong 30 ngày', 'sap_den_han', '{"so_ngay":30}'),
      public.vmp_tl_goi_y('Tiến độ theo bộ phận', 'tien_do', '{"theo":"bo_phan"}')));
end
$$;

create or replace function public.vmp_tl_danh_sach(p_uid uuid, p_kieu text, p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_so_ngay integer := coalesce((p->>'so_ngay')::int, 30);
  v_loc text := public.vmp_tl_nhan_loc(p);
  v_tong integer;
  v_dong jsonb;
  v_hieu text;
begin
  with chon as (
    select h.* from public.vmp_tl_hang_muc(p_uid) h
     where not h.xong
       and public.vmp_tl_qua_loc(h.depts, h.work_group, h.area, h.validation_type,
                                 h.owner_name, h.secondary_owner, p)
       and case p_kieu when 'qua_han' then h.so_ngay < 0
                       else h.so_ngay between 0 and v_so_ngay end
  )
  select count(*),
         coalesce(jsonb_agg(public.vmp_tl_dong(c.validation_code, c.object_code, c.object_name,
                    c.validation_type, c.deadline_vmp, c.so_ngay, c.owner_name, c.giai_doan)
                  order by c.so_ngay, c.validation_code) filter (where c.rn <= 50), '[]'::jsonb)
    into v_tong, v_dong
    from (select chon.*, row_number() over (order by so_ngay, validation_code) rn from chon) c;

  v_hieu := case p_kieu when 'qua_han' then 'Quá hạn' else format('Đến hạn trong %s ngày', v_so_ngay) end
            || case when v_loc <> '' then ' · ' || v_loc else '' end;
  return jsonb_build_object(
    'ok', true,
    'hieu_la', v_hieu,
    'tra_loi', case
      when v_tong = 0 and p_kieu = 'qua_han' then 'Không có hạng mục nào quá hạn đích VMP'
                                                   || case when v_loc <> '' then ' (' || v_loc || ')' else '' end || '.'
      when v_tong = 0 then format('Không có hạng mục nào đến hạn trong %s ngày tới', v_so_ngay)
                           || case when v_loc <> '' then ' (' || v_loc || ')' else '' end || '.'
      when p_kieu = 'qua_han' then format('Có %s hạng mục quá hạn đích VMP%s.', v_tong,
                                          case when v_loc <> '' then ' (' || v_loc || ')' else '' end)
      else format('Có %s hạng mục đến hạn trong %s ngày tới%s.', v_tong, v_so_ngay,
                  case when v_loc <> '' then ' (' || v_loc || ')' else '' end) end,
    'bang', jsonb_build_object('cot', public.vmp_tl_cot_hang_muc(), 'dong', v_dong, 'tong_dong', v_tong),
    'goi_y', jsonb_build_array(
      public.vmp_tl_goi_y('Chia theo bộ phận', 'tien_do', jsonb_build_object('theo', 'bo_phan')),
      case when p_kieu = 'qua_han'
           then public.vmp_tl_goi_y('Đến hạn trong 30 ngày', 'sap_den_han', p - 'so_ngay' || '{"so_ngay":30}')
           else public.vmp_tl_goi_y('Hạng mục quá hạn', 'qua_han', p - 'so_ngay') end));
end
$$;

create or replace function public.vmp_tl_tien_do(p_uid uuid, p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_theo text := coalesce(p->>'theo', 'bo_phan');
  v_loc text := public.vmp_tl_nhan_loc(p);
  v_dong jsonb;
  v_nhan_theo text := case v_theo when 'bo_phan' then 'Bộ phận' when 'nhom_viec' then 'Nhóm công việc'
                                  when 'khu_vuc' then 'Khu vực' else 'Loại thẩm định' end;
begin
  with chon as (
    select h.* from public.vmp_tl_hang_muc(p_uid) h
     where public.vmp_tl_qua_loc(h.depts, h.work_group, h.area, h.validation_type,
                                 h.owner_name, h.secondary_owner, p)
  ), nhom as (
    select case v_theo when 'bo_phan' then public.vmp_tl_nhan_bo_phan(d)
                       when 'nhom_viec' then coalesce(c.work_group, '(chưa có nhóm)')
                       when 'khu_vuc' then coalesce(nullif(c.area, '—'), '(chưa có khu)')
                       else c.validation_type end ten,
           c.xong, c.so_ngay
      from chon c
      -- Một hạng mục thuộc nhiều bộ phận được đếm ở mỗi bộ phận, như màn Tiến độ.
      left join lateral unnest(case when v_theo = 'bo_phan' then c.depts else array[null::text] end) d on true
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'nhom', g.ten, 'tong', g.tong, 'xong', g.xong, 'qua_han', g.qua_han,
           'ty_le', round(g.xong * 100.0 / nullif(g.tong, 0)) || '%')
         order by g.qua_han desc, g.tong desc, g.ten), '[]'::jsonb)
    into v_dong
    from (select ten, count(*) tong, count(*) filter (where xong) xong,
                 count(*) filter (where not xong and so_ngay < 0) qua_han
            from nhom group by ten) g;

  return jsonb_build_object(
    'ok', true,
    'hieu_la', 'Tiến độ theo ' || lower(v_nhan_theo) || case when v_loc <> '' then ' · ' || v_loc else '' end,
    'tra_loi', case when jsonb_array_length(v_dong) = 0 then 'Không có hạng mục nào khớp.'
      else format('Tiến độ năm %s theo %s, nhóm nhiều quá hạn nhất ở trên.%s',
                  extract(year from public.vmp_tl_hom_nay()), lower(v_nhan_theo),
                  case when v_theo = 'bo_phan' then ' Hạng mục thuộc nhiều bộ phận được đếm ở mỗi bộ phận.' else '' end) end,
    'bang', jsonb_build_object(
      'cot', jsonb_build_array(
        jsonb_build_object('key', 'nhom', 'nhan', v_nhan_theo),
        jsonb_build_object('key', 'tong', 'nhan', 'Tổng'),
        jsonb_build_object('key', 'xong', 'nhan', 'Đã xong'),
        jsonb_build_object('key', 'qua_han', 'nhan', 'Quá hạn'),
        jsonb_build_object('key', 'ty_le', 'nhan', 'Hoàn thành')),
      'dong', v_dong, 'tong_dong', jsonb_array_length(v_dong)),
    'goi_y', jsonb_build_array(
      public.vmp_tl_goi_y('Hạng mục quá hạn', 'qua_han', p - 'theo'),
      public.vmp_tl_goi_y('Tổng quan', 'tong_quan', null)));
end
$$;

create or replace function public.vmp_tl_thiet_bi(p_uid uuid, p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tk text := btrim(p->>'tu_khoa');
  v_so integer;
  v_ma text;
  v_ten text;
  v_hoi jsonb;
  v_dong jsonb;
  v_tong integer;
  v_cc jsonb;
begin
  -- Đối tượng xem được và khớp mọi từ khoá (mã, tên, khu, line). Trùng mã thì chọn luôn.
  with khop as (
    select s.object_code code, o.name, s.area_code area,
           public.vmp_tl_chuan(s.object_code) = public.vmp_tl_chuan(v_tk) chinh_xac
      from public.vmp_source_objects s
      left join public.vmp_objects o on o.code = s.object_code and o.is_active
     where s.is_active
       and public.vmp_tl_khop_tu(concat_ws(' ', s.object_code, o.name, s.area_code, s.line), v_tk)
       and public.vmp_can_view_source_object(p_uid, s.id)
  ), chon as (
    select * from khop k
     where k.chinh_xac or not exists (select 1 from khop x where x.chinh_xac)
  )
  select count(*), min(c.code), min(c.name),
         jsonb_agg(public.vmp_tl_goi_y(concat_ws(' · ', c.code, c.name, nullif(c.area, '—')),
                                       'thiet_bi', jsonb_build_object('tu_khoa', c.code))
                   order by c.name, c.code) filter (where c.rn <= 8)
    into v_so, v_ma, v_ten, v_hoi
    from (select chon.*, row_number() over (order by chon.name, chon.code) rn from chon) c;

  if v_so = 0 then
    return jsonb_build_object('ok', true, 'hieu_la', 'Thiết bị / đối tượng: ' || v_tk,
      'tra_loi', format('Không thấy đối tượng nào khớp "%s" trong phạm vi bạn được xem. Thử gõ mã (vd KNTB133) hoặc một phần tên.', v_tk));
  end if;

  if v_so > 1 then
    return jsonb_build_object('ok', true, 'hieu_la', 'Thiết bị / đối tượng: ' || v_tk,
      'tra_loi', case when v_so <= 8 then format('Có %s đối tượng khớp "%s". Bạn chọn một:', v_so, v_tk)
                      else format('Có %s đối tượng khớp "%s". Dưới đây là 8 cái đầu, gõ cụ thể hơn nếu chưa thấy:', v_so, v_tk) end,
      'hoi_lai', v_hoi);
  end if;

  select count(*),
         coalesce(jsonb_agg(public.vmp_tl_dong(h.validation_code, h.object_code, h.object_name,
                    h.validation_type, h.deadline_vmp, h.so_ngay, h.owner_name, h.giai_doan)
                  order by h.deadline_vmp nulls last, h.validation_code), '[]'::jsonb)
    into v_tong, v_dong
    from public.vmp_tl_hang_muc(p_uid) h
   where h.object_code = v_ma;

  -- Phiếu thay đổi cần thẩm định đang gắn với đối tượng này.
  select coalesce(jsonb_agg(c.change_code order by c.change_code), '[]'::jsonb)
    into v_cc
    from public.vmp_change_records c
    join public.vmp_change_objects co on co.change_id = c.id and co.object_code = v_ma
   where c.needs_validation
     and c.removed_from_sheet_at is null
     and c.handling_status in ('cho_xu_ly', 'dang_tham_dinh')
     and public.vmp_change_can_view(p_uid, c.id);

  return jsonb_build_object(
    'ok', true,
    'hieu_la', 'Thiết bị / đối tượng: ' || concat_ws(' · ', v_ma, v_ten),
    'tra_loi', case when v_tong = 0
        then format('%s (%s) không có hạng mục thẩm định nào năm %s.', v_ten, v_ma, extract(year from public.vmp_tl_hom_nay()))
        else format('%s (%s) có %s hạng mục năm %s.', v_ten, v_ma, v_tong, extract(year from public.vmp_tl_hom_nay())) end
      || case when jsonb_array_length(v_cc) > 0
              then ' Phiếu thay đổi cần thẩm định đang mở: ' || (select string_agg(x, ', ') from jsonb_array_elements_text(v_cc) x) || '.'
              else '' end,
    'bang', case when v_tong > 0 then jsonb_build_object('cot', public.vmp_tl_cot_hang_muc(), 'dong', v_dong, 'tong_dong', v_tong) end,
    'goi_y', case when jsonb_array_length(v_cc) > 0
      then jsonb_build_array(public.vmp_tl_goi_y('Xem phiếu thay đổi của ' || v_ma, 'thay_doi', jsonb_build_object('loc', 'tat_ca', 'tu_khoa', v_ma)))
      else '[]'::jsonb end);
end
$$;

create or replace function public.vmp_tl_theo_nguoi(p_uid uuid, p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ten text := btrim(p->>'ten');
  v_ten_khop text[];
  v_so record;
  v_dong jsonb;
begin
  -- Tên phụ trách chính khớp mọi từ đã gõ (không dấu).
  select array_agg(distinct h.owner_name order by h.owner_name)
    into v_ten_khop
    from public.vmp_tl_hang_muc(p_uid) h
   where h.owner_name is not null and public.vmp_tl_khop_ten(h.owner_name, v_ten);
  -- Trùng khít một tên thì lấy tên đó, khỏi hỏi lại.
  if cardinality(v_ten_khop) > 1 and exists (select 1 from unnest(v_ten_khop) t where public.vmp_tl_chuan(t) = public.vmp_tl_chuan(v_ten)) then
    v_ten_khop := (select array_agg(t) from unnest(v_ten_khop) t where public.vmp_tl_chuan(t) = public.vmp_tl_chuan(v_ten));
  end if;

  if v_ten_khop is null then
    return jsonb_build_object('ok', true, 'hieu_la', 'Người phụ trách: ' || v_ten,
      'tra_loi', format('Không thấy người phụ trách nào tên "%s" trong các hạng mục bạn được xem.', v_ten));
  end if;
  if cardinality(v_ten_khop) > 1 then
    return jsonb_build_object('ok', true, 'hieu_la', 'Người phụ trách: ' || v_ten,
      'tra_loi', format('Có %s người khớp "%s". Bạn chọn một:', cardinality(v_ten_khop), v_ten),
      'hoi_lai', (select jsonb_agg(public.vmp_tl_goi_y(t, 'theo_nguoi', jsonb_build_object('ten', t)))
                    from unnest(v_ten_khop[1:8]) t));
  end if;

  select count(*) tong, count(*) filter (where h.xong) xong,
         count(*) filter (where not h.xong and h.so_ngay < 0) qua_han,
         count(*) filter (where not h.xong and h.so_ngay between 0 and 30) sap_han
    into v_so
    from public.vmp_tl_hang_muc(p_uid) h where h.owner_name = v_ten_khop[1];

  select coalesce(jsonb_agg(public.vmp_tl_dong(h.validation_code, h.object_code, h.object_name,
                    h.validation_type, h.deadline_vmp, h.so_ngay, h.owner_name, h.giai_doan)
                  order by h.so_ngay nulls last, h.validation_code), '[]'::jsonb)
    into v_dong
    from (select * from public.vmp_tl_hang_muc(p_uid) h
           where h.owner_name = v_ten_khop[1] and not h.xong
           order by h.so_ngay nulls last, h.validation_code limit 50) h;

  return jsonb_build_object(
    'ok', true,
    'hieu_la', 'Người phụ trách: ' || v_ten_khop[1],
    'tra_loi', format('%s phụ trách %s hạng mục năm %s: đã xong %s, quá hạn %s, đến hạn trong 30 ngày %s. Bảng dưới là việc chưa xong.',
                      v_ten_khop[1], v_so.tong, extract(year from public.vmp_tl_hom_nay()), v_so.xong, v_so.qua_han, v_so.sap_han),
    'bang', jsonb_build_object('cot', public.vmp_tl_cot_hang_muc(), 'dong', v_dong, 'tong_dong', v_so.tong - v_so.xong));
end
$$;

create or replace function public.vmp_tl_viec_cua_toi(p_uid uuid, p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_so_ngay integer := coalesce((p->>'so_ngay')::int, 7);
  v_nguoi uuid;
  v_tong integer;
  v_qua integer;
  v_dong jsonb;
begin
  select pf.id into v_nguoi
    from public.vmp_performers pf
   where pf.user_id = p_uid and pf.is_active
   order by pf.updated_at desc nulls last
   limit 1;
  if v_nguoi is null then
    return jsonb_build_object('ok', true, 'hieu_la', 'Việc của tôi',
      'tra_loi', 'Tài khoản của bạn chưa gắn với tên người thực hiện, nên chưa lọc được việc riêng. Nhờ Admin gắn ở màn Tài khoản.');
  end if;

  select count(*), count(*) filter (where h.so_ngay < 0),
         coalesce(jsonb_agg(public.vmp_tl_dong(h.validation_code, h.object_code, h.object_name,
                    h.validation_type, h.deadline_vmp, h.so_ngay, h.owner_name, h.giai_doan)
                  order by h.so_ngay, h.validation_code), '[]'::jsonb)
    into v_tong, v_qua, v_dong
    from public.vmp_tl_hang_muc(p_uid) h
   where h.owner_person_id = v_nguoi and not h.xong and h.so_ngay <= v_so_ngay;

  return jsonb_build_object(
    'ok', true,
    'hieu_la', format('Việc của tôi · quá hạn và đến hạn trong %s ngày', v_so_ngay),
    'tra_loi', case when v_tong = 0 then format('Bạn không có việc quá hạn hay đến hạn trong %s ngày tới.', v_so_ngay)
      else format('Bạn có %s việc cần chú ý: %s quá hạn, %s đến hạn trong %s ngày tới.', v_tong, v_qua, v_tong - v_qua, v_so_ngay) end,
    'bang', case when v_tong > 0 then jsonb_build_object('cot', public.vmp_tl_cot_hang_muc(), 'dong', v_dong, 'tong_dong', v_tong) end,
    'goi_y', jsonb_build_array(public.vmp_tl_goi_y('Việc của tôi trong 30 ngày', 'viec_cua_toi', '{"so_ngay":30}')));
end
$$;

create or replace function public.vmp_tl_thay_doi(p_uid uuid, p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tk text := nullif(btrim(p->>'tu_khoa'), '');
  -- Tra theo mã phiếu/thiết bị mà không nói trạng thái → tìm cả phiếu đã đóng.
  v_loc text := coalesce(p->>'loc', case when v_tk is not null then 'tat_ca' else 'mo' end);
  v_tong integer;
  v_dong jsonb;
  v_nhan text := case v_loc when 'mo' then 'đang mở' when 'qua_han' then 'quá hạn'
                            when 'chua_gan' then 'chưa gắn thiết bị' else 'tất cả' end;
begin
  with chon as (
    select c.*, coalesce(c.deadline_override, c.deadline_sheet) han,
           (select string_agg(co.object_code, ', ' order by co.object_code)
              from public.vmp_change_objects co where co.change_id = c.id) thiet_bi
      from public.vmp_change_records c
     where c.needs_validation
       and public.vmp_change_can_view(p_uid, c.id)
  ), loc as (
    select * from chon c
     where case v_loc
             when 'tat_ca' then true
             when 'qua_han' then c.removed_from_sheet_at is null and c.handling_status in ('cho_xu_ly', 'dang_tham_dinh')
                                 and c.han < public.vmp_tl_hom_nay()
             when 'chua_gan' then c.removed_from_sheet_at is null and c.handling_status in ('cho_xu_ly', 'dang_tham_dinh')
                                  and c.thiet_bi is null
             else c.removed_from_sheet_at is null and c.handling_status in ('cho_xu_ly', 'dang_tham_dinh') end
       and (v_tk is null or public.vmp_tl_khop_tu(concat_ws(' ', c.change_code, c.validation_content, c.thiet_bi), v_tk))
  )
  select count(*),
         coalesce(jsonb_agg(jsonb_build_object(
           'ma', l.change_code,
           'noi_dung', left(coalesce(l.validation_content, l.change_content, ''), 140),
           'han', coalesce(public.vmp_tl_ngay(l.han), '—'),
           'trang_thai', case when l.removed_from_sheet_at is not null then 'Đã bỏ khỏi sheet'
                              else case l.handling_status when 'cho_xu_ly' then 'Chờ xử lý'
                                     when 'dang_tham_dinh' then 'Đang thẩm định' when 'da_xong' then 'Đã xong'
                                     else 'Không áp dụng' end end,
           'thiet_bi', coalesce(l.thiet_bi, 'chưa gắn'))
           order by l.han nulls last, l.change_code) filter (where l.rn <= 50), '[]'::jsonb)
    into v_tong, v_dong
    from (select loc.*, row_number() over (order by loc.han nulls last, loc.change_code) rn from loc) l;

  return jsonb_build_object(
    'ok', true,
    'hieu_la', 'Phiếu thay đổi cần thẩm định · ' || v_nhan || case when v_tk is not null then ' · "' || v_tk || '"' else '' end,
    'tra_loi', case when v_tong = 0 then format('Không có phiếu thay đổi cần thẩm định nào %s.', v_nhan)
      else format('Có %s phiếu thay đổi cần thẩm định %s. Hạn lấy theo sheet thay đổi.', v_tong, v_nhan) end,
    'bang', case when v_tong > 0 then jsonb_build_object(
      'cot', '[{"key":"ma","nhan":"Mã thay đổi"},{"key":"noi_dung","nhan":"Nội dung thẩm định"},
               {"key":"han","nhan":"Hạn"},{"key":"trang_thai","nhan":"Trạng thái"},
               {"key":"thiet_bi","nhan":"Thiết bị"}]'::jsonb,
      'dong', v_dong, 'tong_dong', v_tong) end,
    'goi_y', jsonb_build_array(
      public.vmp_tl_goi_y('Phiếu quá hạn', 'thay_doi', '{"loc":"qua_han"}'),
      public.vmp_tl_goi_y('Phiếu chưa gắn thiết bị', 'thay_doi', '{"loc":"chua_gan"}')));
end
$$;

-- ---------------------------------------------------------------------
-- RPC cho web
-- ---------------------------------------------------------------------

-- Kiểm tham số rồi gọi đúng công cụ. Đầu ra AI không được tin: mọi giá trị
-- lạ đều bị từ chối, không lặng lẽ bỏ bộ lọc (bỏ lọc là đổi nghĩa câu hỏi).
create or replace function public.rpc_tro_ly_tra_loi(p_cong_cu text, p_tham_so jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  p jsonb := coalesce(p_tham_so, '{}'::jsonb);
  k text;
  v_cho_phep text[];
  v_ket jsonb;
  v_ten text[];
begin
  if not public.vmp_is_active_session(v_uid) or public.vmp_business_role(v_uid) is null then
    return public.vmp_session_denial();
  end if;
  if jsonb_typeof(p) <> 'object' then
    return jsonb_build_object('ok', false, 'loi', 'Tham số không hợp lệ.');
  end if;
  -- Bỏ khoá rỗng/null do AI điền thừa.
  p := (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
          from jsonb_each(p) e
         where e.value not in ('null'::jsonb, '""'::jsonb));

  v_cho_phep := case p_cong_cu
    when 'tong_quan' then array[]::text[]
    when 'qua_han' then array['bo_phan', 'nhom_viec', 'khu_vuc', 'loai', 'nguoi']
    when 'sap_den_han' then array['so_ngay', 'bo_phan', 'nhom_viec', 'khu_vuc', 'loai', 'nguoi']
    when 'tien_do' then array['theo', 'bo_phan', 'nhom_viec', 'khu_vuc', 'loai', 'nguoi']
    when 'thiet_bi' then array['tu_khoa']
    when 'theo_nguoi' then array['ten']
    when 'viec_cua_toi' then array['so_ngay']
    when 'thay_doi' then array['loc', 'tu_khoa']
    end;
  if v_cho_phep is null then
    return jsonb_build_object('ok', false, 'loi', 'Công cụ không tồn tại.');
  end if;

  for k in select jsonb_object_keys(p) loop
    if not k = any(v_cho_phep) then
      return jsonb_build_object('ok', false, 'loi', format('Tham số "%s" không dùng cho câu này.', k));
    end if;
    if jsonb_typeof(p->k) not in ('string', 'number') or char_length(p->>k) > 80 then
      return jsonb_build_object('ok', false, 'loi', format('Giá trị "%s" không hợp lệ.', k));
    end if;
  end loop;

  if p ? 'so_ngay' and (p->>'so_ngay' !~ '^\d{1,3}$' or (p->>'so_ngay')::int not between 1 and 180) then
    return jsonb_build_object('ok', false, 'loi', 'Số ngày phải từ 1 đến 180.');
  end if;
  if p ? 'bo_phan' and not (p->>'bo_phan' = any(array['xsx', 'cd', 'kho', 'qc', 'rd', 'qa'])) then
    return jsonb_build_object('ok', false, 'loi', 'Bộ phận phải là một trong: xsx, cd, kho, qc, rd, qa.');
  end if;
  if p ? 'loai' and not (upper(p->>'loai') = any(array['DQ', 'FAT/SAT', 'IQ', 'OQ', 'PQ', 'PV', 'GSP', 'GDP'])) then
    return jsonb_build_object('ok', false, 'loi', 'Loại thẩm định phải là DQ, FAT/SAT, IQ, OQ, PQ, PV, GSP hoặc GDP.');
  end if;
  if p ? 'theo' and not (p->>'theo' = any(array['bo_phan', 'nhom_viec', 'khu_vuc', 'loai'])) then
    return jsonb_build_object('ok', false, 'loi', 'Chỉ chia được theo bộ phận, nhóm công việc, khu vực hoặc loại.');
  end if;
  if p ? 'loc' and not (p->>'loc' = any(array['mo', 'qua_han', 'chua_gan', 'tat_ca'])) then
    return jsonb_build_object('ok', false, 'loi', 'Bộ lọc phiếu thay đổi không hợp lệ.');
  end if;
  if p_cong_cu = 'thiet_bi' and char_length(btrim(coalesce(p->>'tu_khoa', ''))) < 2 then
    return jsonb_build_object('ok', false, 'loi', 'Cho biết mã hoặc tên thiết bị (ít nhất 2 ký tự).');
  end if;
  if p_cong_cu = 'theo_nguoi' and char_length(btrim(coalesce(p->>'ten', ''))) < 2 then
    return jsonb_build_object('ok', false, 'loi', 'Cho biết tên người phụ trách.');
  end if;

  -- Lọc theo người: không thấy → báo; khớp nhiều người → hỏi lại, không gộp số của nhiều người.
  if p ? 'nguoi' and p_cong_cu in ('qua_han', 'sap_den_han', 'tien_do') then
    v_ten := public.vmp_tl_ten_khop(v_uid, p->>'nguoi');
    if v_ten is null then
      return jsonb_build_object('ok', true, 'cong_cu', p_cong_cu, 'tham_so', p,
        'hieu_la', 'Người: ' || (p->>'nguoi'),
        'tra_loi', format('Không thấy người phụ trách nào tên "%s" trong các hạng mục bạn được xem.', p->>'nguoi'));
    elsif cardinality(v_ten) > 1 then
      return jsonb_build_object('ok', true, 'cong_cu', p_cong_cu, 'tham_so', p,
        'hieu_la', 'Người: ' || (p->>'nguoi'),
        'tra_loi', format('Có %s người khớp "%s". Bạn chọn một:', cardinality(v_ten), p->>'nguoi'),
        'hoi_lai', (select jsonb_agg(public.vmp_tl_goi_y(t, p_cong_cu, jsonb_set(p, '{nguoi}', to_jsonb(t))))
                      from unnest(v_ten[1:8]) t));
    end if;
    p := jsonb_set(p, '{nguoi}', to_jsonb(v_ten[1]));
  end if;

  v_ket := case p_cong_cu
    when 'tong_quan' then public.vmp_tl_tong_quan(v_uid)
    when 'qua_han' then public.vmp_tl_danh_sach(v_uid, 'qua_han', p)
    when 'sap_den_han' then public.vmp_tl_danh_sach(v_uid, 'sap_den_han', p)
    when 'tien_do' then public.vmp_tl_tien_do(v_uid, p)
    when 'thiet_bi' then public.vmp_tl_thiet_bi(v_uid, p)
    when 'theo_nguoi' then public.vmp_tl_theo_nguoi(v_uid, p)
    when 'viec_cua_toi' then public.vmp_tl_viec_cua_toi(v_uid, p)
    when 'thay_doi' then public.vmp_tl_thay_doi(v_uid, p)
    end;
  -- Bỏ khoá null (vd không có bảng) để web chỉ cần kiểm "có khoá hay không".
  return jsonb_strip_nulls(v_ket) || jsonb_build_object(
    'cong_cu', p_cong_cu, 'tham_so', p,
    'nguon', case when p_cong_cu = 'thay_doi' then 'Tab Thay đổi (đồng bộ từ sheet phiếu thay đổi)'
                  else 'Kế hoạch VMP năm ' || extract(year from public.vmp_tl_hom_nay())
                       || ' · hạn đích VMP, cách tính như ô Tổng quan' end,
    'luc', now());
end
$$;

-- Ghi một lượt hỏi. Trả id để web gửi đánh giá 👍/👎.
create or replace function public.rpc_tro_ly_ghi_nhat_ky(
  p_cau_hoi text, p_cong_cu text, p_tham_so jsonb, p_duong text, p_mo_hinh text,
  p_ok boolean, p_so_dong integer, p_thoi_gian_ms integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
begin
  if not public.vmp_is_active_session(v_uid) or public.vmp_business_role(v_uid) is null then
    return public.vmp_session_denial();
  end if;
  -- Chặn ghi dồn dập: tối đa 120 lượt / người / 10 phút.
  if (select count(*) from public.vmp_tro_ly_nhat_ky n
       where n.user_id = v_uid and n.created_at > now() - interval '10 minutes') >= 120 then
    return jsonb_build_object('ok', false, 'loi', 'Ghi nhật ký quá dày, thử lại sau.');
  end if;
  insert into public.vmp_tro_ly_nhat_ky (user_id, cau_hoi, cong_cu, tham_so, duong, mo_hinh, ok, so_dong, thoi_gian_ms)
  values (v_uid, left(btrim(p_cau_hoi), 500), left(p_cong_cu, 40),
          case when pg_column_size(p_tham_so) <= 2000 then p_tham_so end,
          p_duong, left(p_mo_hinh, 60), coalesce(p_ok, false), p_so_dong,
          least(greatest(p_thoi_gian_ms, 0), 600000))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end
$$;

create or replace function public.rpc_tro_ly_danh_gia(p_id bigint, p_diem smallint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.vmp_is_active_session(v_uid) then
    return public.vmp_session_denial();
  end if;
  if p_diem not in (-1, 1) then
    return jsonb_build_object('ok', false, 'loi', 'Điểm không hợp lệ.');
  end if;
  update public.vmp_tro_ly_nhat_ky set danh_gia = p_diem
   where id = p_id and user_id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'loi', 'Không tìm thấy lượt hỏi.');
  end if;
  return jsonb_build_object('ok', true);
end
$$;

-- ---------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------
revoke all on function public.vmp_tl_hom_nay() from public, anon;
revoke all on function public.vmp_tl_chuan(text) from public, anon;
revoke all on function public.vmp_tl_khop_tu(text, text) from public, anon;
revoke all on function public.vmp_tl_khop_ten(text, text) from public, anon;
revoke all on function public.vmp_tl_ten_khop(uuid, text) from public, anon, authenticated;
revoke all on function public.vmp_tl_ngay(date) from public, anon;
revoke all on function public.vmp_tl_nhan_bo_phan(text) from public, anon;
revoke all on function public.vmp_tl_giai_doan(text, text, text, text, boolean) from public, anon;
revoke all on function public.vmp_tl_hang_muc(uuid) from public, anon, authenticated;
revoke all on function public.vmp_tl_qua_loc(text[], text, text, text, text, text, jsonb) from public, anon;
revoke all on function public.vmp_tl_nhan_loc(jsonb) from public, anon;
revoke all on function public.vmp_tl_dong(text, text, text, text, date, integer, text, text) from public, anon;
revoke all on function public.vmp_tl_cot_hang_muc() from public, anon;
revoke all on function public.vmp_tl_goi_y(text, text, jsonb) from public, anon;
revoke all on function public.vmp_tl_tong_quan(uuid) from public, anon, authenticated;
revoke all on function public.vmp_tl_danh_sach(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.vmp_tl_tien_do(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.vmp_tl_thiet_bi(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.vmp_tl_theo_nguoi(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.vmp_tl_viec_cua_toi(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.vmp_tl_thay_doi(uuid, jsonb) from public, anon, authenticated;

revoke all on function public.rpc_tro_ly_tra_loi(text, jsonb) from public, anon;
revoke all on function public.rpc_tro_ly_ghi_nhat_ky(text, text, jsonb, text, text, boolean, integer, integer) from public, anon;
revoke all on function public.rpc_tro_ly_danh_gia(bigint, smallint) from public, anon;
grant execute on function public.rpc_tro_ly_tra_loi(text, jsonb) to authenticated;
grant execute on function public.rpc_tro_ly_ghi_nhat_ky(text, text, jsonb, text, text, boolean, integer, integer) to authenticated;
grant execute on function public.rpc_tro_ly_danh_gia(bigint, smallint) to authenticated;

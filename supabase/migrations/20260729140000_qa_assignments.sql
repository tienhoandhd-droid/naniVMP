-- =====================================================================
-- Phân công QA phụ trách theo NHÓM CÔNG VIỆC
--
-- Nguồn: bảng phân công 2026 do QA cung cấp (nhóm công việc → người phụ
-- trách → người hỗ trợ). Trước đó 456/461 hạng mục không có ai phụ trách,
-- và 5 hạng mục có tên thì viết ba kiểu ('My', 'My2', 'my').
--
-- ---------------------------------------------------------------------
-- Thiết kế: luật phân công lưu THÀNH DỮ LIỆU, không viết cứng trong SQL
--
-- Bảng vmp_assignment_rules giữ nguyên văn bảng phân công. Mỗi luật có
-- thứ tự ưu tiên; luật khớp đầu tiên thắng. Nhờ vậy:
--   · sang năm đổi người chỉ sửa dữ liệu, không sửa code
--   · trang "Luật đang áp dụng" đọc thẳng ra, không thể mô tả sai
--   · truy được vì sao một hạng mục thuộc về ai
-- =====================================================================

alter table public.vmp_source_objects
  add column if not exists owner_name   text,
  add column if not exists support_name text,
  add column if not exists work_group   text;

comment on column public.vmp_source_objects.owner_name is
  'QA phụ trách, gán theo vmp_assignment_rules. Sửa tay được ở màn Danh mục nguồn.';
comment on column public.vmp_source_objects.work_group is
  'Nhóm công việc đã khớp — dùng để truy vì sao hạng mục thuộc về người này.';

create table if not exists public.vmp_assignment_rules (
  id            integer primary key,
  /** Nhóm lớn: Thiết bị sản xuất · Hệ thống phụ trợ · Quy trình … */
  category      text not null,
  /** Nhóm công việc cụ thể, ghi đúng nguyên văn bảng phân công. */
  work_group    text not null,
  /** Điều kiện khớp — chỉ MỘT trong ba loại dưới được dùng cho mỗi luật. */
  match_kind    text,                       -- lọc theo object_kind
  match_name_re text,                       -- lọc theo tên (regex, không phân biệt hoa thường)
  match_areas   text[],                     -- lọc theo mã khu vực
  match_dept    text,                       -- lọc theo bộ phận quản lý
  owner_name    text not null,
  support_name  text,
  /** Số hạng mục dự kiến 2026 theo bảng phân công — để đối chiếu. */
  expected_2026 integer,
  priority      integer not null,           -- nhỏ hơn = xét trước
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.vmp_assignment_rules is
  'Luật phân công QA phụ trách. Luật có priority nhỏ hơn được xét trước; luật khớp đầu tiên thắng.';

truncate public.vmp_assignment_rules;
insert into public.vmp_assignment_rules
  (id, category, work_group, match_kind, match_name_re, match_areas, match_dept,
   owner_name, support_name, expected_2026, priority) values

-- ---- Thẩm định thiết bị sản xuất: nhóm theo LOẠI trước, theo KHU VỰC sau ----
(1,'Thẩm định thiết bị sản xuất','Hệ thống nồi hấp/tủ hấp',
   'Thiết bị','nồi hấp|tủ hấp', null, null,
   'Tôn Nữ Thiện My', null, 10, 10),

(2,'Thẩm định thiết bị sản xuất','Hệ thống tank',
   'Thiết bị','tank', null, null,
   'Tôn Nữ Thiện My', 'Lê Xuân Đức', 36, 20),

(3,'Thẩm định thiết bị sản xuất','Laf A, isolator, passbox, BSC',
   'Thiết bị','laf|isolator|passbox|an toàn sinh học|atsh|bsc', null, null,
   'Tào Tiến Hoàn', null, 22, 30),

(4,'Thẩm định thiết bị sản xuất','Thiết bị khác line C2 + F2',
   'Thiết bị', null, array['C2','F2'], 'Xưởng sản xuất',
   'Lê Xuân Đức', null, 4, 40),

(5,'Thẩm định thiết bị sản xuất','Thiết bị khác line C1 + C4',
   'Thiết bị', null, array['C1','C4'], 'Xưởng sản xuất',
   'Tào Tiến Hoàn', null, 5, 41),

(6,'Thẩm định thiết bị sản xuất','Thiết bị khác line C3',
   'Thiết bị', null, array['C3'], 'Xưởng sản xuất',
   'Lương Minh Hằng', null, 10, 42),

(7,'Thẩm định thiết bị sản xuất','Thiết bị khác line B2 + B3',
   'Thiết bị', null, array['B2','B3'], 'Xưởng sản xuất',
   'Lê Xuân Đức', null, 4, 43),

-- ---- Thẩm định hệ thống phụ trợ ----
(8,'Thẩm định hệ thống phụ trợ','Hệ thống khí nén, khí nito, hơi tinh khiết',
   'Hệ thống phụ trợ','khí nén|khí nito|khí nitơ|hơi tinh khiết', null, null,
   'Tào Tiến Hoàn', 'Lê Xuân Đức', 4, 50),

(9,'Thẩm định hệ thống phụ trợ','Hệ thống nước tinh khiết, nước cất',
   'Hệ thống phụ trợ','nước tinh khiết|nước cất', null, null,
   'Nguyễn Thị Hương', 'Đào Ngọc Hải Chung', 3, 51),

(10,'Thẩm định hệ thống phụ trợ','Hệ thống nước thải',
   'Hệ thống phụ trợ','nước thải', null, null,
   'Phạm Huệ Nhi', null, 1, 52),

-- ---- Thẩm định quy trình ----
-- Chỉ luật 11 khớp được với dữ liệu hiện có: cả 20 quy trình đang là quy
-- trình SẢN XUẤT. Các nhóm quy trình vệ sinh / mediafill / CCIT / kiểm tạp
-- / cột lọc CHƯA có đối tượng nào trong danh mục nguồn — giữ luật ở đây để
-- khi thêm đối tượng là tự khớp.
(11,'Thẩm định quy trình','Quy trình sản xuất + Quy trình vệ sinh',
   'Quy trình', null, null, null,
   'Phạm Huệ Nhi', 'Lương Minh Hằng', 12, 60),

(12,'Thẩm định quy trình','Quy trình vệ sinh nhà xưởng',
   'Quy trình','vệ sinh nhà xưởng', null, null,
   'Phạm Huệ Nhi', null, 10, 61),

(13,'Thẩm định quy trình','Quy trình xử lý bảo hộ lao động',
   'Quy trình','bảo hộ lao động', null, null,
   'Tôn Nữ Thiện My', 'Lương Minh Hằng', 5, 62),

(14,'Thẩm định quy trình','Quy trình vệ sinh chuyển cấp',
   'Quy trình','chuyển cấp', null, null,
   'Tào Tiến Hoàn', null, 4, 63),

(15,'Thẩm định quy trình','Quy trình vệ sinh cá nhân và thay trang phục',
   'Quy trình','vệ sinh cá nhân|thay trang phục', null, null,
   'Phạm Huệ Nhi', null, 3, 64),

(16,'Thẩm định quy trình','Quy trình vệ sinh và tiệt trùng dụng cụ',
   'Quy trình','tiệt trùng dụng cụ', null, null,
   'Tôn Nữ Thiện My', null, 1, 65),

(17,'Thẩm định quy trình','Quy trình mediafill',
   'Quy trình','mediafill|media fill', null, null,
   'Nguyễn Thị Hương', 'Tôn Nữ Thiện My', 8, 66),

(18,'Thẩm định quy trình','Quy trình CCIT',
   'Quy trình','ccit', null, null,
   'Nguyễn Thị Hương', null, 10, 67),

(19,'Thẩm định quy trình','Quy trình kiểm tạp',
   'Quy trình','kiểm tạp', null, null,
   'Nguyễn Thị Hương', null, 3, 68),

(20,'Thẩm định quy trình','Quy trình đánh giá cột lọc vô khuẩn',
   'Quy trình','cột lọc', null, null,
   'Tôn Nữ Thiện My', null, 1, 69);

-- Thứ tự ưu tiên: quy trình đặc thù (61..69) phải xét TRƯỚC luật chung 60.
update public.vmp_assignment_rules set priority = priority - 20 where id between 12 and 20;

-- ---------------------------------------------------------------------
-- Áp dụng luật
-- ---------------------------------------------------------------------
create or replace function public.rpc_apply_assignments(
  p_overwrite boolean default false
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_role text;
  v_hit  integer := 0;
  v_miss integer;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if v_role not in ('admin','qa_manager') then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được phân công');
  end if;

  update public.vmp_source_objects s
     set owner_name   = r.owner_name,
         support_name = r.support_name,
         work_group   = r.work_group
  from (
    select distinct on (o.id) o.id as obj_id, ru.owner_name, ru.support_name, ru.work_group
    from public.vmp_source_objects o
    join public.vmp_assignment_rules ru on ru.is_active
      and (ru.match_kind    is null or o.object_kind = ru.match_kind)
      and (ru.match_name_re is null or o.object_name ~* ru.match_name_re)
      and (ru.match_areas   is null or o.area_code = any(ru.match_areas))
      and (ru.match_dept    is null or o.department = ru.match_dept)
    order by o.id, ru.priority
  ) r
  where s.id = r.obj_id
    and (p_overwrite or s.owner_name is null);
  get diagnostics v_hit = row_count;

  select count(*) into v_miss
  from public.vmp_source_objects where is_active and owner_name is null;

  -- Đưa người phụ trách xuống hạng mục timeline
  update public.vmp_plan_items p
     set owner_name = s.owner_name
  from public.vmp_source_objects s
  where s.object_code = p.object_code and s.owner_name is not null;

  return jsonb_build_object('ok', true, 'da_gan', v_hit, 'chua_gan', v_miss,
    'msg', 'Đã gán ' || v_hit || ' đối tượng · còn ' || v_miss || ' chưa có luật phù hợp');
end;
$fn$;

-- Chạy lần đầu bằng SQL trực tiếp — RPC cần auth.uid() nên không gọi được
-- từ psql; RPC vẫn giữ để bấm lại từ web sau này.
update public.vmp_source_objects s
   set owner_name   = r.owner_name,
       support_name = r.support_name,
       work_group   = r.work_group
from (
  select distinct on (o.id) o.id as obj_id, ru.owner_name, ru.support_name, ru.work_group
  from public.vmp_source_objects o
  join public.vmp_assignment_rules ru on ru.is_active
    and (ru.match_kind    is null or o.object_kind = ru.match_kind)
    and (ru.match_name_re is null or o.object_name ~* ru.match_name_re)
    and (ru.match_areas   is null or o.area_code = any(ru.match_areas))
    and (ru.match_dept    is null or o.department = ru.match_dept)
  order by o.id, ru.priority
) r
where s.id = r.obj_id;

update public.vmp_plan_items p
   set owner_name = s.owner_name
from public.vmp_source_objects s
where s.object_code = p.object_code and s.owner_name is not null;

-- ---------------------------------------------------------------------
-- Bổ sung nhân sự vào danh bạ (nếu chưa có) để màn nhập liệu chọn được
-- ---------------------------------------------------------------------
insert into public.vmp_staff_emails (staff_name, email, department, note)
select v.name, v.email, 'QA', 'Thêm từ bảng phân công 2026 — cần cập nhật email thật'
from (values
  ('Tôn Nữ Thiện My',      'tonnuthienmy@cpc1hn.local'),
  ('Tào Tiến Hoàn',        'taotienhoan@cpc1hn.local'),
  ('Lê Xuân Đức',          'lexuanduc@cpc1hn.local'),
  ('Lương Minh Hằng',      'luongminhhang@cpc1hn.local'),
  ('Nguyễn Thị Hương',     'nguyenthihuong@cpc1hn.local'),
  ('Phạm Huệ Nhi',         'phamhuenhi@cpc1hn.local'),
  ('Đào Ngọc Hải Chung',   'daongochaichung@cpc1hn.local')
) as v(name, email)
where not exists (
  select 1 from public.vmp_staff_emails e where lower(e.staff_name) = lower(v.name)
);

-- ---------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------
alter table public.vmp_assignment_rules enable row level security;
drop policy if exists assignment_rules_select on public.vmp_assignment_rules;
create policy assignment_rules_select on public.vmp_assignment_rules
  for select to authenticated using (true);
grant select on public.vmp_assignment_rules to authenticated;
grant select, insert, update, delete on public.vmp_assignment_rules to service_role;

revoke execute on function public.rpc_apply_assignments(boolean) from anon, public;
grant  execute on function public.rpc_apply_assignments(boolean) to authenticated, service_role;

-- =====================================================================
-- Danh mục nguồn VMP: đưa 5 tab danh mục + bảng sản phẩm GMP lên Supabase
--
-- Bối cảnh: Supabase chuyển thành nơi lưu dữ liệu gốc. Trước đây 5 tab
-- danh mục trong Google Sheet là nguồn, workflow VMP01 sinh ra tab
-- "6.Timeline VMP" từ chúng. Tab 6 đã có trên Supabase (vmp_plan_items,
-- vmp_sheet_rows) qua WF-04; migration này bổ sung 5 danh mục còn thiếu.
--
-- Thiết kế bám đúng cách VMP01 xử lý: workflow chuẩn hoá cả 5 tab về MỘT
-- hình dạng chung rồi mới sinh timeline, nên ở đây cũng dùng một bảng
-- chung có cột phân loại, thay vì 5 bảng rời.
--
-- Hai tầng, giống cặp vmp_sheet_rows / vmp_plan_items đã có:
--   vmp_source_rows    - thô, giữ NGUYÊN VẸN mọi dòng kể cả dòng thiếu mã
--   vmp_source_objects - canonical, đã khử trùng (dòng xuất hiện SAU thắng)
--
-- KHÔNG đụng tới vmp_plan_items / vmp_sheet_rows.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tầng thô: mọi dòng của mọi tab, không mất gì
-- ---------------------------------------------------------------------
create table if not exists public.vmp_source_rows (
  id            bigint generated always as identity primary key,
  source_tab    text    not null,
  row_number    integer not null,          -- số dòng thật trong Sheet (tính cả header)
  payload       jsonb   not null,          -- toàn bộ ô của dòng, khoá = tên cột gốc
  imported_at   timestamptz not null default now(),
  unique (source_tab, row_number)
);

comment on table public.vmp_source_rows is
  'Bản thô từng dòng của 5 tab danh mục + tab sản phẩm GMP. Giữ cả dòng thiếu mã để đối chiếu.';

-- ---------------------------------------------------------------------
-- 2. Tầng canonical: đối tượng thẩm định, đã chuẩn hoá kiểu dữ liệu
--
--    Ánh xạ cột lấy đúng theo node "Code in JavaScript1" của VMP01:
--      Thiết bị          <- Mã thiết bị    / Tên thiết bị        / Năm nhập
--      Quy trình         <- Mã quy trình   / Tên quy trình       / Năm ban hành
--      Kho               <- Mã kho         / Tên Kho             / (không có năm)
--      Hệ thống phụ trợ  <- Mã hệ thống    / Hệ thống phụ trợ    / Năm nhập
--      Vận chuyển        <- Mã vận chuyển  / Tên chuyển vận chuyển / (không có năm)
-- ---------------------------------------------------------------------
create table if not exists public.vmp_source_objects (
  id                uuid primary key default gen_random_uuid(),

  object_kind       text not null
    check (object_kind in ('Thiết bị','Quy trình','Kho','Hệ thống phụ trợ','Vận chuyển')),
  object_code       text not null,
  object_name       text,

  department        text,      -- Bộ phận quản lý
  area_code         text,      -- Mã khu vực / Khu vực áp dụng
  line              text,      -- Line
  status            text,      -- Tình trạng
  show_flag         text,      -- Show
  validate_flag     text,      -- Thẩm định (y/n) — VMP01 chỉ sinh timeline khi = 'y'
  validate_reason   text,      -- Lý do thẩm định

  frequency_months  integer,   -- Tần suất thẩm định (tháng)
  report_class      text,      -- Phân loại báo cáo -> quyết định số ngày báo cáo
  workdays          integer,   -- Số ngày công thẩm định thực tế
  critical_point    text,      -- Điểm trọng yếu
  first_month       integer    check (first_month is null or first_month between 1 and 12),
  year_ref          integer,   -- Năm nhập / Năm ban hành

  source_tab        text not null,
  source_row        integer not null,
  extra             jsonb not null default '{}'::jsonb,   -- cột riêng của từng tab

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (object_kind, object_code)
);

comment on table public.vmp_source_objects is
  'Danh mục đối tượng thẩm định, gộp 5 tab nguồn. Đây là đầu vào của luật sinh timeline VMP01.';
comment on column public.vmp_source_objects.validate_flag is
  'VMP01 bỏ qua dòng có giá trị khác ''y'' (so sánh sau khi trim/lower/NFC).';
comment on column public.vmp_source_objects.first_month is
  'Thiếu cột này thì VMP01 không tính được deadline và ghi chuỗi "Không xác định do thiếu..." vào cột ngày.';

create index if not exists idx_source_objects_kind    on public.vmp_source_objects (object_kind);
create index if not exists idx_source_objects_code    on public.vmp_source_objects (object_code);
create index if not exists idx_source_objects_dept    on public.vmp_source_objects (department);
create index if not exists idx_source_objects_active  on public.vmp_source_objects (validate_flag)
  where validate_flag = 'y';

-- ---------------------------------------------------------------------
-- 3. Danh mục sản phẩm GMP (tab "DM TDQTSX show GMP")
--    Cấu trúc khác hẳn 5 tab trên — không phải đối tượng thẩm định mà là
--    dữ liệu nền về sản phẩm/cỡ lô, nên tách bảng riêng.
-- ---------------------------------------------------------------------
create table if not exists public.vmp_products_gmp (
  id                uuid primary key default gen_random_uuid(),
  bfo_code          text not null unique,   -- Mã BFO
  product_name      text,                   -- Tên sản phẩm
  ingredients       text,                   -- Thành phần
  strength          text,                   -- Hàm lượng
  production_line   text,                   -- Line sản xuất
  dosage_form       text,                   -- Dạng bào chế
  primary_pack      text,                   -- Quy cách sơ cấp
  batch_size        text,                   -- Cỡ lô chốt
  note              text,                   -- NOTE
  mixing_tank       text,                   -- Tank pha chế
  final_batch_size  text,                   -- Cỡ lô chốt cuối (KH + QA)
  source_row        integer not null,
  extra             jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.vmp_products_gmp is
  'Danh mục sản phẩm/cỡ lô GMP từ tab "DM TDQTSX show GMP". Dữ liệu nền, không sinh timeline.';

-- ---------------------------------------------------------------------
-- 4. updated_at tự động (dùng lại hàm sẵn có của schema)
-- ---------------------------------------------------------------------
drop trigger if exists set_updated_at on public.vmp_source_objects;
create trigger set_updated_at before update on public.vmp_source_objects
  for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at on public.vmp_products_gmp;
create trigger set_updated_at before update on public.vmp_products_gmp
  for each row execute function public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 5. RLS + quyền
--    Giai đoạn này mở ĐỌC cho browser, GHI vẫn chỉ service_role.
--    Quyền ghi cho người dùng đăng nhập sẽ mở ở migration riêng kèm
--    policy theo bộ phận — không gộp vào đây để tách bạch rủi ro.
-- ---------------------------------------------------------------------
alter table public.vmp_source_rows    enable row level security;
alter table public.vmp_source_objects enable row level security;
alter table public.vmp_products_gmp   enable row level security;

drop policy if exists source_objects_select on public.vmp_source_objects;
create policy source_objects_select on public.vmp_source_objects for select using (true);

drop policy if exists products_gmp_select on public.vmp_products_gmp;
create policy products_gmp_select on public.vmp_products_gmp for select using (true);

-- vmp_source_rows là dữ liệu thô để đối chiếu: không mở cho browser.
-- (RLS bật, không có policy select => anon/authenticated không đọc được.)

revoke insert, update, delete, truncate
  on public.vmp_source_rows, public.vmp_source_objects, public.vmp_products_gmp
  from anon, authenticated;

grant select on public.vmp_source_objects, public.vmp_products_gmp to anon, authenticated;

grant select, insert, update, delete, truncate
  on public.vmp_source_rows, public.vmp_source_objects, public.vmp_products_gmp
  to service_role;

grant usage, select on sequence public.vmp_source_rows_id_seq to service_role;

-- =====================================================================
-- Các bộ dữ liệu sửa được trực tiếp trên web
--
-- Trước migration này chỉ 5 danh mục nguồn sửa được trên dashboard; các tab
-- phụ (người nhận cảnh báo, danh sách email) mới chỉ nằm ở dạng thô trong
-- vmp_source_rows và RLS không mở cho browser.
--
-- Nay dựng bảng thật cho hai bộ đó + mở đường ghi cho sản phẩm GMP, để mọi
-- việc nhập liệu làm trên web thay vì Google Sheet.
--
-- Quy ước phân quyền giữ nguyên: admin/qa_manager ghi, còn lại chỉ đọc;
-- ghi qua RPC SECURITY DEFINER, client không có quyền ghi thẳng bảng.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Người nhận cảnh báo (tab "CanhBao")
--    Vani VMP 1 hiện đọc danh sách này TỪ SHEET. Bảng này là bản trên
--    Supabase để nhập liệu trên web; đổi workflow sang đọc DB là bước sau.
-- ---------------------------------------------------------------------
create table if not exists public.vmp_alert_recipients (
  id             uuid primary key default gen_random_uuid(),
  is_enabled     boolean not null default true,
  /** 'tất cả' | 'bộ phận' | 'đối tượng' — khớp cách Vani VMP 1 so chuỗi. */
  scope_type     text not null default 'tất cả',
  scope          text,
  email          text not null,
  recipient_name text,
  /** 'quá hạn' | 'sắp đến hạn' | 'cả hai' */
  alert_kind     text not null default 'cả hai',
  /** Ngưỡng ngày riêng cho "sắp đến hạn"; NULL = dùng SOON_DAYS mặc định. */
  threshold_days integer check (threshold_days is null or threshold_days between 0 and 365),
  note           text,
  updated_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- UNIQUE trên biểu thức phải dùng index, không đặt được trong định nghĩa bảng.
create unique index if not exists uq_alert_recipients_scope
  on public.vmp_alert_recipients (lower(email), scope_type, coalesce(scope, ''));

comment on table public.vmp_alert_recipients is
  'Người nhận email cảnh báo đến hạn. Thay cho tab "CanhBao" trong Google Sheet.';

-- ---------------------------------------------------------------------
-- 2. Danh bạ nhân sự (tab "Danh_sach_Email")
-- ---------------------------------------------------------------------
create table if not exists public.vmp_staff_emails (
  id          uuid primary key default gen_random_uuid(),
  staff_name  text not null,
  email       text not null unique,
  department  text,
  note        text,
  is_active   boolean not null default true,
  updated_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.vmp_staff_emails is
  'Danh bạ nhân sự. Thay cho tab "Danh_sach_Email" trong Google Sheet.';

drop trigger if exists set_updated_at on public.vmp_alert_recipients;
create trigger set_updated_at before update on public.vmp_alert_recipients
  for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at on public.vmp_staff_emails;
create trigger set_updated_at before update on public.vmp_staff_emails
  for each row execute function public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 3. Nạp sẵn từ bản thô đã đẩy lên (chỉ khi bảng còn trống)
-- ---------------------------------------------------------------------
insert into public.vmp_staff_emails (staff_name, email, department)
select distinct on (lower(btrim(payload ->> 'Email')))
       nullif(btrim(payload ->> 'Nhân viên'), ''),
       btrim(payload ->> 'Email'),
       nullif(btrim(payload ->> 'Bộ phận'), '')
from public.vmp_source_rows
where source_tab = 'Danh_sach_Email'
  and btrim(coalesce(payload ->> 'Email', '')) <> ''
  and not exists (select 1 from public.vmp_staff_emails)
order by lower(btrim(payload ->> 'Email'));

-- CanhBao trong Sheet đang RỖNG nên không có gì để nạp. Nhập trên web.

-- ---------------------------------------------------------------------
-- 4. RPC ghi — người nhận cảnh báo
-- ---------------------------------------------------------------------
create or replace function public.rpc_upsert_alert_recipient(
  p_id    uuid,
  p_patch jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_role  text;
  v_id    uuid := p_id;
  v_email text := nullif(btrim(p_patch ->> 'email'), '');
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if v_role not in ('admin','qa_manager') then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được sửa danh sách nhận cảnh báo');
  end if;
  if v_id is null and v_email is null then
    return jsonb_build_object('ok', false, 'error', 'Phải nhập email');
  end if;

  if v_id is null then
    insert into public.vmp_alert_recipients (email, updated_by) values (v_email, auth.uid())
    returning id into v_id;
  end if;

  update public.vmp_alert_recipients r set
    is_enabled     = coalesce((p_patch ->> 'is_enabled')::boolean, r.is_enabled),
    scope_type     = coalesce(nullif(btrim(p_patch ->> 'scope_type'), ''), r.scope_type),
    scope          = coalesce(p_patch ->> 'scope',          r.scope),
    email          = coalesce(v_email,                      r.email),
    recipient_name = coalesce(p_patch ->> 'recipient_name', r.recipient_name),
    alert_kind     = coalesce(nullif(btrim(p_patch ->> 'alert_kind'), ''), r.alert_kind),
    threshold_days = coalesce((p_patch ->> 'threshold_days')::integer, r.threshold_days),
    note           = coalesce(p_patch ->> 'note',           r.note),
    updated_by     = auth.uid()
  where r.id = v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'msg', 'Đã lưu người nhận');
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$fn$;

create or replace function public.rpc_delete_alert_recipient(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare v_role text; v_n integer;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role not in ('admin','qa_manager') then
    return jsonb_build_object('ok', false, 'error', 'Không có quyền xoá');
  end if;
  delete from public.vmp_alert_recipients where id = p_id;
  get diagnostics v_n = row_count;
  return case when v_n > 0
    then jsonb_build_object('ok', true, 'msg', 'Đã xoá người nhận')
    else jsonb_build_object('ok', false, 'error', 'Không tìm thấy bản ghi') end;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 5. RPC ghi — danh bạ nhân sự
-- ---------------------------------------------------------------------
create or replace function public.rpc_upsert_staff_email(
  p_id    uuid,
  p_patch jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_role  text;
  v_id    uuid := p_id;
  v_email text := nullif(btrim(p_patch ->> 'email'), '');
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if v_role not in ('admin','qa_manager') then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được sửa danh bạ');
  end if;
  if v_id is null and v_email is null then
    return jsonb_build_object('ok', false, 'error', 'Phải nhập email');
  end if;

  if v_id is null then
    insert into public.vmp_staff_emails (staff_name, email, updated_by)
    values (coalesce(nullif(btrim(p_patch ->> 'staff_name'), ''), v_email), v_email, auth.uid())
    returning id into v_id;
  end if;

  update public.vmp_staff_emails s set
    staff_name = coalesce(nullif(btrim(p_patch ->> 'staff_name'), ''), s.staff_name),
    email      = coalesce(v_email, s.email),
    department = coalesce(p_patch ->> 'department', s.department),
    note       = coalesce(p_patch ->> 'note',       s.note),
    is_active  = coalesce((p_patch ->> 'is_active')::boolean, s.is_active),
    updated_by = auth.uid()
  where s.id = v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'msg', 'Đã lưu nhân sự');
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$fn$;

create or replace function public.rpc_delete_staff_email(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare v_role text; v_n integer;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role not in ('admin','qa_manager') then
    return jsonb_build_object('ok', false, 'error', 'Không có quyền xoá');
  end if;
  delete from public.vmp_staff_emails where id = p_id;
  get diagnostics v_n = row_count;
  return case when v_n > 0
    then jsonb_build_object('ok', true, 'msg', 'Đã xoá nhân sự')
    else jsonb_build_object('ok', false, 'error', 'Không tìm thấy bản ghi') end;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 6. RPC ghi — sản phẩm GMP
-- ---------------------------------------------------------------------
create or replace function public.rpc_upsert_product_gmp(
  p_bfo_code text,
  p_patch    jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_role text;
  v_code text := nullif(btrim(p_bfo_code), '');
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if v_role not in ('admin','qa_manager') then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được sửa danh mục sản phẩm');
  end if;
  if v_code is null then
    return jsonb_build_object('ok', false, 'error', 'Phải nhập Mã BFO');
  end if;

  insert into public.vmp_products_gmp (bfo_code, source_row)
  values (v_code, 0)
  on conflict (bfo_code) do nothing;

  update public.vmp_products_gmp p set
    product_name     = coalesce(p_patch ->> 'product_name',     p.product_name),
    ingredients      = coalesce(p_patch ->> 'ingredients',      p.ingredients),
    strength         = coalesce(p_patch ->> 'strength',         p.strength),
    production_line  = coalesce(p_patch ->> 'production_line',  p.production_line),
    dosage_form      = coalesce(p_patch ->> 'dosage_form',      p.dosage_form),
    primary_pack     = coalesce(p_patch ->> 'primary_pack',     p.primary_pack),
    batch_size       = coalesce(p_patch ->> 'batch_size',       p.batch_size),
    note             = coalesce(p_patch ->> 'note',             p.note),
    mixing_tank      = coalesce(p_patch ->> 'mixing_tank',      p.mixing_tank),
    final_batch_size = coalesce(p_patch ->> 'final_batch_size', p.final_batch_size)
  where p.bfo_code = v_code;

  return jsonb_build_object('ok', true, 'bfo_code', v_code, 'msg', 'Đã lưu sản phẩm');
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$fn$;

create or replace function public.rpc_delete_product_gmp(p_bfo_code text)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare v_role text; v_n integer;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role not in ('admin','qa_manager') then
    return jsonb_build_object('ok', false, 'error', 'Không có quyền xoá');
  end if;
  delete from public.vmp_products_gmp where bfo_code = p_bfo_code;
  get diagnostics v_n = row_count;
  return case when v_n > 0
    then jsonb_build_object('ok', true, 'msg', 'Đã xoá sản phẩm')
    else jsonb_build_object('ok', false, 'error', 'Không tìm thấy sản phẩm') end;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 7. RLS + quyền
-- ---------------------------------------------------------------------
alter table public.vmp_alert_recipients enable row level security;
alter table public.vmp_staff_emails     enable row level security;

drop policy if exists alert_recipients_select on public.vmp_alert_recipients;
create policy alert_recipients_select on public.vmp_alert_recipients for select using (true);

drop policy if exists staff_emails_select on public.vmp_staff_emails;
create policy staff_emails_select on public.vmp_staff_emails for select using (true);

revoke insert, update, delete, truncate
  on public.vmp_alert_recipients, public.vmp_staff_emails from anon, authenticated;
grant select on public.vmp_alert_recipients, public.vmp_staff_emails to anon, authenticated;
grant select, insert, update, delete
  on public.vmp_alert_recipients, public.vmp_staff_emails to service_role;

-- Postgres cấp EXECUTE cho PUBLIC khi CREATE FUNCTION — phải revoke khỏi PUBLIC
-- rồi cấp đích danh, nếu không anon vẫn gọi được (xem migration ...040000).
do $$
declare f text;
begin
  foreach f in array array[
    'public.rpc_upsert_alert_recipient(uuid, jsonb)',
    'public.rpc_delete_alert_recipient(uuid)',
    'public.rpc_upsert_staff_email(uuid, jsonb)',
    'public.rpc_delete_staff_email(uuid)',
    'public.rpc_upsert_product_gmp(text, jsonb)',
    'public.rpc_delete_product_gmp(text)'
  ] loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

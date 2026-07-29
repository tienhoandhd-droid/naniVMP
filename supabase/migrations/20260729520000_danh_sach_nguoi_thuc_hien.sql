-- =====================================================================
-- Danh sách NGƯỜI THỰC HIỆN (tên + email)
--
-- Danh bạ nhân sự (vmp_staff_emails) là danh sách hộp thư — ai có mặt
-- trong hệ thống mail. Còn đây là danh sách người TRỰC TIẾP làm thẩm
-- định: tên ghi trên hạng mục VMP, kèm email để liên hệ / gửi việc.
-- Hai danh sách tách nhau vì một người có mail chưa chắc làm thẩm định,
-- và người làm thẩm định có thể đổi mà danh bạ mail vẫn giữ nguyên.
--
-- Phân quyền giữ đúng quy ước: admin/qa_manager ghi, còn lại chỉ đọc;
-- ghi qua RPC SECURITY DEFINER, client không có quyền ghi thẳng bảng.
-- =====================================================================

create table if not exists public.vmp_performers (
  id             uuid primary key default gen_random_uuid(),
  performer_name text not null,
  email          text,
  department     text,
  role_title     text,
  note           text,
  is_active      boolean not null default true,
  updated_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.vmp_performers is
  'Người thực hiện thẩm định: tên + email. Nhập trực tiếp trên dashboard (tab "Người thực hiện").';

-- Trùng tên là lỗi nhập liệu, không phải hai người: khoá theo tên đã chuẩn hoá.
-- Dùng index trên biểu thức nên không đặt được trong định nghĩa bảng.
create unique index if not exists uq_performers_name
  on public.vmp_performers (lower(btrim(performer_name)));

drop trigger if exists set_updated_at on public.vmp_performers;
create trigger set_updated_at before update on public.vmp_performers
  for each row execute function public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- RPC ghi
-- ---------------------------------------------------------------------
create or replace function public.rpc_upsert_performer(
  p_id    uuid,
  p_patch jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_role  text;
  v_id    uuid := p_id;
  v_name  text := nullif(btrim(p_patch ->> 'performer_name'), '');
  v_email text := nullif(btrim(p_patch ->> 'email'), '');
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if v_role not in ('admin','qa_manager') then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được sửa danh sách người thực hiện');
  end if;
  if v_id is null and v_name is null then
    return jsonb_build_object('ok', false, 'error', 'Phải nhập tên người thực hiện');
  end if;
  -- Email không bắt buộc, nhưng đã nhập thì phải đúng dạng — sai một dấu là
  -- mail bật lại, mà lúc đó không ai biết vì workflow chỉ báo "đã gửi".
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error', 'Email không đúng định dạng: ' || v_email);
  end if;

  if v_id is null then
    insert into public.vmp_performers (performer_name, email, updated_by)
    values (v_name, v_email, auth.uid())
    returning id into v_id;
  end if;

  update public.vmp_performers p set
    performer_name = coalesce(v_name,  p.performer_name),
    email          = coalesce(v_email, p.email),
    department     = coalesce(p_patch ->> 'department', p.department),
    role_title     = coalesce(p_patch ->> 'role_title', p.role_title),
    note           = coalesce(p_patch ->> 'note',       p.note),
    is_active      = coalesce((p_patch ->> 'is_active')::boolean, p.is_active),
    updated_by     = auth.uid()
  where p.id = v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'msg', 'Đã lưu người thực hiện');
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'Đã có người thực hiện trùng tên: ' || coalesce(v_name, ''));
  when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$fn$;

create or replace function public.rpc_delete_performer(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare v_role text; v_n integer;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role not in ('admin','qa_manager') then
    return jsonb_build_object('ok', false, 'error', 'Không có quyền xoá');
  end if;
  delete from public.vmp_performers where id = p_id;
  get diagnostics v_n = row_count;
  return case when v_n > 0
    then jsonb_build_object('ok', true, 'msg', 'Đã xoá người thực hiện')
    else jsonb_build_object('ok', false, 'error', 'Không tìm thấy bản ghi') end;
end;
$fn$;

-- ---------------------------------------------------------------------
-- RLS + quyền
-- ---------------------------------------------------------------------
alter table public.vmp_performers enable row level security;

drop policy if exists performers_select on public.vmp_performers;
create policy performers_select on public.vmp_performers for select using (true);

revoke insert, update, delete, truncate on public.vmp_performers from anon, authenticated;
grant select on public.vmp_performers to anon, authenticated;
grant select, insert, update, delete on public.vmp_performers to service_role;

-- CREATE FUNCTION cấp EXECUTE cho PUBLIC — phải revoke rồi cấp đích danh,
-- nếu không anon vẫn gọi được.
do $$
declare f text;
begin
  foreach f in array array[
    'public.rpc_upsert_performer(uuid, jsonb)',
    'public.rpc_delete_performer(uuid)'
  ] loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

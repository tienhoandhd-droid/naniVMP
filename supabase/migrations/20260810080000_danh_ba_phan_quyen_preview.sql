/* =====================================================================
 * Danh bạ nhân sự & quyền theo hạng mục — lớp dữ liệu preview.
 * Migration này chỉ tạo nơi lưu và tính bản nháp; chưa đổi RLS/RPC đang
 * chạy vì item_permissions_mode luôn khởi tạo ở "preview".
 * ===================================================================== */

create or replace function public.vmp_normalize_person_name(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $fn$
  select lower(regexp_replace(btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g'))
$fn$;

comment on function public.vmp_normalize_person_name(text) is
  'Chuẩn hóa tên để đối chiếu chính xác: trim, gộp khoảng trắng, lower; giữ nguyên dấu.';

/* Trùng tên là tình huống hợp lệ cần nối tay, không còn coi là lỗi dữ liệu. */
drop index if exists public.uq_performers_name;

alter table public.vmp_performers
  add column if not exists employee_code text,
  add column if not exists normalized_full_name text generated always as
    (public.vmp_normalize_person_name(performer_name)) stored,
  add column if not exists access_class text,
  add column if not exists scope_departments text[] not null default '{}',
  add column if not exists access_areas text[] not null default '{}',
  add column if not exists email_sent_confirmed boolean not null default false;

alter table public.vmp_performers
  add constraint vmp_performers_access_class_check
  check (
    access_class is null
    or access_class in (
      'view_only',
      'qa_progress_editor',
      'qa_manager',
      'equipment_scheduler',
      'equipment_manager'
    )
  );

create unique index vmp_performers_employee_code_uniq
  on public.vmp_performers (lower(btrim(employee_code)))
  where nullif(btrim(employee_code), '') is not null;

create index vmp_performers_normalized_name_idx
  on public.vmp_performers (normalized_full_name);

comment on column public.vmp_performers.employee_code is
  'Mã nhân viên tùy chọn trong giai đoạn đầu; duy nhất khi có giá trị.';
comment on column public.vmp_performers.access_class is
  'Một phân loại quyền chính của nhân viên trong VMP.';
comment on column public.vmp_performers.scope_departments is
  'Danh sách mã bộ phận được tiếp cận; phần tử * nghĩa là toàn nhà máy.';
comment on column public.vmp_performers.access_areas is
  'Danh sách area/line được tiếp cận; phần tử * nghĩa là toàn bộ trong phạm vi.';

/* Sheet có đủ ngày + giờ, còn scheduled_date cũ chỉ giữ phần ngày. */
alter table public.vmp_plan_items
  add column if not exists scheduled_at timestamptz;

update public.vmp_plan_items
set scheduled_at = scheduled_date::timestamp at time zone 'Asia/Bangkok'
where scheduled_at is null and scheduled_date is not null;

comment on column public.vmp_plan_items.scheduled_at is
  'Thời điểm bộ phận quản lý thiết bị xếp lịch thẩm định, theo giờ Asia/Bangkok.';

create table public.vmp_item_assignments (
  id                    uuid primary key default gen_random_uuid(),
  validation_code       text not null
                          references public.vmp_plan_items(validation_code)
                          on update cascade on delete cascade,
  performer_id          uuid
                          references public.vmp_performers(id)
                          on delete set null,
  user_id               uuid
                          references auth.users(id)
                          on delete set null,
  staff_name            text not null,
  normalized_staff_name text generated always as
                          (public.vmp_normalize_person_name(staff_name)) stored,
  employee_code         text,
  assignment_kind       text not null
                          check (assignment_kind in ('qa', 'equipment_department')),
  source                text not null
                          check (source in (
                            'sheet_qa', 'sheet_other_staff',
                            'qa_manager', 'equipment_manager'
                          )),
  source_text           text,
  unresolved_reason     text
                          check (unresolved_reason is null or unresolved_reason in (
                            'not_found', 'duplicate_name', 'account_unlinked'
                          )),
  expires_at            timestamptz,
  is_active             boolean not null default true,
  change_reason         text,
  created_by            uuid references auth.users(id) on delete set null,
  updated_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index vmp_item_assignments_linked_uniq
  on public.vmp_item_assignments (
    validation_code, performer_id, assignment_kind, source
  )
  where performer_id is not null;

create unique index vmp_item_assignments_unresolved_uniq
  on public.vmp_item_assignments (
    validation_code, normalized_staff_name, assignment_kind, source
  )
  where performer_id is null;

create index vmp_item_assignments_user_item_idx
  on public.vmp_item_assignments (user_id, validation_code)
  where is_active;

drop trigger if exists set_updated_at on public.vmp_item_assignments;
create trigger set_updated_at
  before update on public.vmp_item_assignments
  for each row execute function public.trigger_set_updated_at();

alter table public.vmp_item_assignments enable row level security;
create policy vmp_item_assignments_select_authenticated
  on public.vmp_item_assignments
  for select to authenticated
  using (true);

revoke all on public.vmp_item_assignments from public, anon;
grant select on public.vmp_item_assignments to authenticated;
grant select, insert, update, delete on public.vmp_item_assignments to service_role;

create view public.vmp_active_item_assignments
with (security_invoker = true)
as
select
  assignment.*,
  (
    assignment.user_id is not null
    and assignment.is_active
    and (assignment.expires_at is null or assignment.expires_at > now())
  ) as grants_access
from public.vmp_item_assignments assignment;

revoke all on public.vmp_active_item_assignments from public, anon;
grant select on public.vmp_active_item_assignments to authenticated, service_role;

insert into public.system_config (
  key, value, description, category, is_sensitive
)
values (
  'item_permissions_mode',
  '"preview"'::jsonb,
  'Quyền theo hạng mục: preview hoặc enforced',
  'permissions',
  true
)
on conflict (key) do nothing;

/* Mặc định CREATE FUNCTION cấp EXECUTE cho PUBLIC ở project này. */
revoke execute on function public.vmp_normalize_person_name(text) from public, anon;
grant execute on function public.vmp_normalize_person_name(text)
  to authenticated, service_role;

do $verify$
begin
  if (select value #>> '{}'
      from public.system_config
      where key = 'item_permissions_mode') <> 'preview' then
    raise exception 'item_permissions_mode không ở preview sau migration';
  end if;

  if has_function_privilege('anon', 'public.vmp_normalize_person_name(text)', 'EXECUTE') then
    raise exception 'anon vẫn gọi được vmp_normalize_person_name';
  end if;
end
$verify$;

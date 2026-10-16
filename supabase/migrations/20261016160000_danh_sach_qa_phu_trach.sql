-- =====================================================================
-- 20261016160000_danh_sach_qa_phu_trach.sql — DANH SÁCH QA PHỤ TRÁCH DO ADMIN QUẢN LÝ
-- ---------------------------------------------------------------------
-- Chủ dự án 16/10: người được chọn làm QA phụ trách/hỗ trợ ở Dữ liệu nguồn
-- là một danh sách cố định do Admin quản lý (ban đầu: Khoa, Hoàn, My, Đức,
-- Hằng), không suy ra từ vai. Quản lý xưởng giữ nguyên chỉ xem.
--
-- vmp_qa_assignable (20261016140000) đổi thân: có tên trong danh sách VÀ
-- tài khoản có vai qa_staff/qa_manager/admin. Bốn hàm danh sách/lưu/đồng bộ
-- đã gọi qua hàm này nên tự theo luật mới. Bỏ người khỏi danh sách không
-- gỡ phân công đang có (trigger chỉ chặn quan hệ MỚI) — đổi QA thì sửa đối tượng.
-- Thay đổi danh sách bắt buộc có lý do và ghi audit_logs.
-- =====================================================================

begin;

create table if not exists public.vmp_qa_phu_trach (
  performer_id uuid primary key references public.vmp_performers(id),
  ghi_chu text,
  them_boi uuid,
  them_luc timestamptz not null default now()
);
comment on table public.vmp_qa_phu_trach is
  'Danh sách người được chọn làm QA phụ trách/hỗ trợ ở Dữ liệu nguồn. Chỉ sửa qua rpc_qa_phu_trach_dat. 20261016.';
alter table public.vmp_qa_phu_trach enable row level security;
revoke all on table public.vmp_qa_phu_trach from public, anon, authenticated;

create or replace function public.vmp_qa_assignable(p_user_id uuid, p_department text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  -- p_department giữ trong chữ ký để bốn hàm gọi không phải đổi; từ
  -- 20261016160000 luật dựa trên danh sách, không dựa trên phòng ban.
  select exists (
           select 1
           from public.vmp_qa_phu_trach ds
           join public.vmp_performers f on f.id = ds.performer_id
           where f.user_id = p_user_id and f.is_active
         )
     and coalesce(public.vmp_business_role(p_user_id) in ('qa_staff', 'qa_manager', 'admin'), false)
$function$;

-- Đọc danh sách: mọi người thực hiện đang hoạt động thuộc phòng QA, kèm
-- trạng thái tài khoản để Admin biết vì sao một người chưa thêm được.
create or replace function public.rpc_qa_phu_trach_danh_sach()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if not public.vmp_is_active_session(auth.uid())
     or public.vmp_business_role(auth.uid()) is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN', 'error', 'Chỉ Admin được xem danh sách QA phụ trách');
  end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
             'performer_id', f.id,
             'performer_name', f.performer_name,
             'trong_danh_sach', ds.performer_id is not null,
             'vai', public.vmp_business_role(f.user_id),
             'ly_do_chua_them_duoc', case
               when f.user_id is null then 'Chưa có tài khoản'
               when not coalesce(p.is_active, false) then 'Tài khoản đang bị khoá'
               when coalesce(public.vmp_business_role(f.user_id) in ('qa_staff', 'qa_manager', 'admin'), false) is false
                 then 'Tài khoản chưa có vai QA hoặc Admin'
             end
           ) order by f.normalized_full_name, f.id)
    from public.vmp_performers f
    left join public.profiles p on p.id = f.user_id
    left join public.vmp_qa_phu_trach ds on ds.performer_id = f.id
    where f.is_active and upper(btrim(coalesce(f.department, ''))) = 'QA'
  ), '[]'::jsonb));
end
$function$;

create or replace function public.rpc_qa_phu_trach_dat(p_performer_id uuid, p_trong_danh_sach boolean, p_ly_do text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_nguoi public.vmp_performers%rowtype;
  v_dang_co boolean;
begin
  if not public.vmp_is_active_session(v_actor)
     or public.vmp_business_role(v_actor) is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN', 'error', 'Chỉ Admin được sửa danh sách QA phụ trách');
  end if;
  if nullif(btrim(coalesce(p_ly_do, '')), '') is null then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED', 'error', 'Cần ghi lý do thay đổi');
  end if;
  select * into v_nguoi from public.vmp_performers where id = p_performer_id and is_active for update;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'PERSON_NOT_FOUND', 'error', 'Không tìm thấy người thực hiện đang hoạt động');
  end if;
  v_dang_co := exists (select 1 from public.vmp_qa_phu_trach where performer_id = p_performer_id);

  if p_trong_danh_sach and not v_dang_co then
    if v_nguoi.user_id is null
       or not exists (select 1 from public.profiles where id = v_nguoi.user_id and is_active)
       or coalesce(public.vmp_business_role(v_nguoi.user_id) in ('qa_staff', 'qa_manager', 'admin'), false) is false then
      return jsonb_build_object('ok', false, 'error_code', 'PERSON_NOT_ELIGIBLE',
        'error', 'Người này cần tài khoản đang hoạt động với vai QA hoặc Admin trước khi thêm');
    end if;
    insert into public.vmp_qa_phu_trach(performer_id, ghi_chu, them_boi) values (p_performer_id, btrim(p_ly_do), v_actor);
  elsif not p_trong_danh_sach and v_dang_co then
    delete from public.vmp_qa_phu_trach where performer_id = p_performer_id;
  else
    return jsonb_build_object('ok', true, 'thay_doi', false);
  end if;

  insert into public.audit_logs(user_id, action, table_name, record_id, changed_fields, change_reason,
                                old_data, new_data, source, effective_business_role)
  values (v_actor, (case when p_trong_danh_sach then 'INSERT' else 'DELETE' end)::public.audit_action,
          'vmp_qa_phu_trach', p_performer_id::text, array['trong_danh_sach'], btrim(p_ly_do),
          jsonb_build_object('performer_name', v_nguoi.performer_name, 'trong_danh_sach', v_dang_co),
          jsonb_build_object('performer_name', v_nguoi.performer_name, 'trong_danh_sach', p_trong_danh_sach),
          'qa_phu_trach_admin', 'admin');
  return jsonb_build_object('ok', true, 'thay_doi', true);
end
$function$;

revoke all on function public.rpc_qa_phu_trach_danh_sach() from public, anon;
revoke all on function public.rpc_qa_phu_trach_dat(uuid, boolean, text) from public, anon;
grant execute on function public.rpc_qa_phu_trach_danh_sach() to authenticated;
grant execute on function public.rpc_qa_phu_trach_dat(uuid, boolean, text) to authenticated;

-- Danh sách ban đầu theo chủ dự án 16/10. DB không có những người này (vd
-- bản dựng local) thì chèn 0 dòng — không chặn migration.
insert into public.vmp_qa_phu_trach(performer_id, ghi_chu)
select f.id, 'Danh sách ban đầu 16/10/2026 theo chủ dự án'
from public.vmp_performers f
where f.is_active and f.user_id is not null
  and f.performer_name in ('Đỗ Đắc Anh Khoa', 'Tào Tiến Hoàn', 'Tôn Nữ Thiện My', 'Lê Xuân Đức', 'Lương Minh Hằng')
on conflict (performer_id) do nothing;

commit;

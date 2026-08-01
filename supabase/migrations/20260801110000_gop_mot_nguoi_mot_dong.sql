/* =====================================================================
 *  20260801110000 — Một người, một dòng. Khoá nối là EMAIL, không phải tên
 *  ---------------------------------------------------------------------
 *  VÌ SAO MÀN PHÂN QUYỀN RỐI — đo được, không phải cảm tính:
 *
 *  Một người đang bị hệ thống lưu thành BỐN bản ghi rời:
 *      profiles          — tài khoản đăng nhập
 *      vmp_performers    — người thực hiện
 *      vmp_staff_emails  — danh bạ
 *      owner_name        — tên đứng trên hạng mục
 *  và bốn cái đó nối với nhau bằng CHUỖI TÊN.
 *
 *  Đếm thực tế: 10 tên, chỉ 1 người có mặt đủ ở cả bốn chỗ.
 *
 *  Tệ nhất là trường hợp này:
 *      vmp_performers : "Tào Tiến Hoàn"  · tienhoan.dhd@gmail.com
 *      profiles       : "Admin chính"    · tienhoan.dhd@gmail.com
 *  CÙNG MỘT NGƯỜI. Khớp theo tên thì không bao giờ nhận ra. Hệ quả trên
 *  màn hình: người đó hiện thành hai dòng, một dòng "có tài khoản mà
 *  không đứng tên hạng mục nào", một dòng "đứng tên 60 hạng mục mà chưa
 *  có tài khoản". Cả hai đều sai, và không ai sửa được vì không có chỗ
 *  nào để nói "hai dòng này là một".
 *
 *  Thêm nữa: vmp_staff_emails và vmp_performers chứa ĐÚNG cùng 7 người,
 *  cùng bộ phận. Hai bảng cho một việc — người dùng phải nhớ sửa ở đâu,
 *  và sửa một chỗ thì chỗ kia lệch.
 *
 *  ---------------------------------------------------------------------
 *  CÁCH SỬA
 *
 *  1 · EMAIL làm khoá nối, không phải tên. Email là duy nhất ở cả
 *      auth.users lẫn danh bạ, và người ta không gõ sai email theo kiểu
 *      gõ sai tên (thiếu dấu, thừa khoảng trắng, viết tắt).
 *
 *  2 · vmp_performers thành bản ghi NGƯỜI chuẩn: có email (lấy từ danh
 *      bạ) và có user_id trỏ thẳng sang tài khoản. Từ đây "người này có
 *      tài khoản chưa" là một phép nối khoá ngoại, không phải một phép
 *      đoán theo chuỗi.
 *
 *  3 · Mỗi NGƯỜI có phạm vi riêng (profiles.pham_vi), không bắt cả vai
 *      dùng chung một mức. Đúng với thực tế: hai người cùng bộ phận XSX,
 *      một người phụ trách cả bộ phận, một người chỉ phụ trách line mình.
 *      Để trống = theo mức chung của vai trong vmp_role_permissions.
 * ===================================================================== */

/* ---------------------------------------------------------------------
 *  1 · Lấp email cho người thực hiện từ danh bạ
 * ------------------------------------------------------------------- */
update public.vmp_performers f
   set email = s.email
  from public.vmp_staff_emails s
 where lower(btrim(s.staff_name)) = lower(btrim(f.performer_name))
   and coalesce(btrim(f.email), '') = ''
   and coalesce(btrim(s.email), '') <> '';

/* ---------------------------------------------------------------------
 *  2 · Nối người ↔ tài khoản bằng email
 * ------------------------------------------------------------------- */
alter table public.vmp_performers
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists vmp_performers_user_id_uniq
  on public.vmp_performers (user_id) where user_id is not null;

update public.vmp_performers f
   set user_id = u.id
  from auth.users u
 where f.user_id is null
   and coalesce(btrim(f.email), '') <> ''
   and lower(btrim(u.email)) = lower(btrim(f.email));

/* ---------------------------------------------------------------------
 *  3 · Phạm vi riêng theo NGƯỜI
 * ------------------------------------------------------------------- */
alter table public.profiles
  add column if not exists pham_vi text;
alter table public.profiles
  drop constraint if exists profiles_pham_vi_check;
alter table public.profiles
  add constraint profiles_pham_vi_check
  check (pham_vi is null or pham_vi in ('co', 'bo_phan', 'phan_cong', 'khong'));

comment on column public.profiles.pham_vi is
  'Phạm vi sửa hạng mục RIÊNG của người này. NULL = dùng mức chung của vai trong vmp_role_permissions.';

/* ---------------------------------------------------------------------
 *  4 · Luật kiểm quyền: ưu tiên phạm vi riêng, nối phân công qua user_id
 * ------------------------------------------------------------------- */
create or replace function public.ly_do_khong_sua_duoc(
  p_validation_code text, p_uid uuid
) returns text
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_role text; v_dept text; v_ten text; v_rieng text;
  v_muc text; v_ql text; v_th text[]; v_loai text; v_line text;
begin
  select p.role::text, p.department, p.full_name, p.pham_vi
    into v_role, v_dept, v_ten, v_rieng
  from profiles p where p.id = p_uid;
  if v_role is null then return 'Không xác định được người dùng'; end if;

  /* Phạm vi riêng của người thắng mức chung của vai. Đặt riêng cho một
     người là việc có chủ đích, còn mức của vai chỉ là mặc định. */
  v_muc := coalesce(v_rieng, public.muc_quyen('update_progress', v_role));
  if v_muc = 'khong' then
    return 'Tài khoản của bạn không có quyền cập nhật tiến độ';
  end if;
  if v_muc = 'co' then return ''; end if;

  select o.department, o.line, i.execution_departments, i.validation_type
    into v_ql, v_line, v_th, v_loai
  from vmp_plan_items i join vmp_objects o on o.code = i.object_code
  where i.validation_code = p_validation_code;
  if not found then return 'Không tìm thấy mã thẩm định: ' || p_validation_code; end if;

  if v_muc = 'bo_phan' then
    if v_dept is null then
      return 'Tài khoản của bạn chưa được gán bộ phận — chưa sửa được hạng mục nào.';
    end if;
    if v_dept = v_ql or v_dept = any(coalesce(v_th, array[]::text[])) then return ''; end if;
    return 'Hạng mục này do bộ phận ' || coalesce(v_ql, '?')
      || ' quản lý, bộ phận ' || coalesce(array_to_string(v_th, ', '), '?')
      || ' thực hiện — bạn thuộc ' || v_dept || ' nên không sửa được.';
  end if;

  if v_muc = 'phan_cong' then
    /* Nối qua user_id trước (chắc chắn), rớt về khớp tên sau (cho người
       chưa được nối). Khớp tên là đường dự phòng, không phải đường chính
       — đó chính là chỗ hệ thống cũ sai. */
    if exists (
      select 1 from vmp_assignment_matrix m
      left join vmp_performers f on f.user_id = p_uid
      where m.is_active
        and (lower(btrim(m.staff_name)) = lower(btrim(coalesce(f.performer_name, v_ten, '')))
             and coalesce(btrim(coalesce(f.performer_name, v_ten, '')), '') <> '')
        and m.validation_type = v_loai
        and (m.line = '*' or m.line = coalesce(nullif(btrim(v_line), ''), '*'))
    ) then return ''; end if;
    return 'Bạn chưa được phân công loại ' || coalesce(v_loai, '?')
      || ' ở line ' || coalesce(nullif(btrim(v_line), ''), '(không chia line)') || '.';
  end if;

  return 'Mức quyền không hiểu được: ' || v_muc;
end;
$$;
grant execute on function public.ly_do_khong_sua_duoc(text, uuid) to authenticated;

/* ---------------------------------------------------------------------
 *  5 · rpc_nguoi_va_quyen — MỘT lời gọi, trả về đúng cái màn hình cần
 *  ---------------------------------------------------------------------
 *  Trước đây màn Phân quyền đọc bốn nguồn rồi tự gộp bằng JavaScript, và
 *  gộp bằng tên nên gộp sai. Nay database gộp một lần, gộp bằng email +
 *  user_id, trả về một dòng một người.
 *
 *  Cột `so_sua_duoc` là chỗ đáng giá nhất: nó ĐẾM THẬT số hạng mục người
 *  đó sửa được theo đúng luật đang chạy. Giải thích một mức quyền bằng
 *  chữ thì ai đọc cũng gật, mà không ai chắc mình hiểu đúng; hiện ra
 *  "sửa được 223/448" thì không còn gì để hiểu nhầm.
 * ------------------------------------------------------------------- */
create or replace function public.rpc_nguoi_va_quyen()
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_vai text;
  v_ket jsonb;
  v_tong int;
begin
  select role::text into v_vai from profiles where id = auth.uid();
  if v_vai is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;

  select count(*) into v_tong from vmp_plan_items
   where is_active and coalesce(item_state, 'active') = 'active';

  with nguoi as (
    /* Nguồn 1: người thực hiện (bản ghi NGƯỜI chuẩn) */
    select f.id::text as pid, f.user_id, f.performer_name as ten,
           f.email, f.department as bo_phan
    from vmp_performers f where f.is_active
    union all
    /* Nguồn 2: tài khoản CHƯA nối được với người nào — vẫn phải hiện,
       vì đó chính là những dòng cần người quản trị đi nối. */
    select null, p.id, p.full_name, p.email, p.department
    from profiles p
    where not exists (select 1 from vmp_performers f where f.user_id = p.id)
  ),
  day_du as (
    select n.*, pr.role::text as vai, pr.department as bo_phan_tk,
           pr.pham_vi, pr.is_active as tk_hoat_dong,
           coalesce(pr.pham_vi, public.muc_quyen('update_progress', pr.role::text)) as muc
    from nguoi n left join profiles pr on pr.id = n.user_id
  ),
  dem as (
    select d.pid, d.user_id,
      case
        when d.vai is null then 0
        when d.muc = 'co' then v_tong
        when d.muc = 'khong' then 0
        when d.muc = 'bo_phan' then (
          select count(*) from vmp_plan_items i join vmp_objects o on o.code = i.object_code
          where i.is_active and coalesce(i.item_state,'active') = 'active'
            and d.bo_phan_tk is not null
            and (o.department = d.bo_phan_tk
                 or d.bo_phan_tk = any(coalesce(i.execution_departments, array[]::text[]))))
        when d.muc = 'phan_cong' then (
          select count(*) from vmp_plan_items i join vmp_objects o on o.code = i.object_code
          where i.is_active and coalesce(i.item_state,'active') = 'active'
            and exists (select 1 from vmp_assignment_matrix m
                        where m.is_active
                          and lower(btrim(m.staff_name)) = lower(btrim(coalesce(d.ten,'')))
                          and m.validation_type = i.validation_type
                          and (m.line = '*' or m.line = coalesce(nullif(btrim(o.line),''),'*'))))
        else 0 end as so_sua_duoc,
      (select count(*) from vmp_plan_items i
        where i.is_active and coalesce(i.item_state,'active') = 'active'
          and lower(btrim(coalesce(i.owner_name,''))) = lower(btrim(coalesce(d.ten,'')))
          and coalesce(btrim(d.ten),'') <> '') as so_dung_ten,
      (select count(*) from vmp_assignment_matrix m
        where m.is_active and lower(btrim(m.staff_name)) = lower(btrim(coalesce(d.ten,'')))
          and coalesce(btrim(d.ten),'') <> '') as so_phan_cong
    from day_du d
  )
  select jsonb_agg(jsonb_build_object(
    'pid', d.pid, 'user_id', d.user_id, 'ten', d.ten, 'email', d.email,
    'bo_phan', coalesce(d.bo_phan_tk, d.bo_phan),
    'bo_phan_nguoi', d.bo_phan, 'bo_phan_tai_khoan', d.bo_phan_tk,
    'vai', d.vai, 'pham_vi_rieng', d.pham_vi, 'muc', case when d.vai is null then null else d.muc end,
    'co_tai_khoan', (d.user_id is not null),
    'tk_hoat_dong', coalesce(d.tk_hoat_dong, true),
    'so_sua_duoc', c.so_sua_duoc, 'so_dung_ten', c.so_dung_ten, 'so_phan_cong', c.so_phan_cong
  ) order by c.so_dung_ten desc, d.ten)
  into v_ket
  from day_du d join dem c on c.pid is not distinct from d.pid and c.user_id is not distinct from d.user_id;

  return jsonb_build_object('ok', true, 'tong_hang_muc', v_tong,
                            'nguoi', coalesce(v_ket, '[]'::jsonb));
end;
$$;
revoke all on function public.rpc_nguoi_va_quyen() from public, anon;
grant execute on function public.rpc_nguoi_va_quyen() to authenticated;

/* ---------------------------------------------------------------------
 *  6 · rpc_set_user_role nhận thêm phạm vi riêng
 * ------------------------------------------------------------------- */
create or replace function public.rpc_set_user_role(
  p_user_id uuid, p_role text, p_department text,
  p_reason text default null, p_pham_vi text default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_me uuid := auth.uid();
  v_my_role text;
  v_old profiles%rowtype;
  v_so_admin int;
  v_pv text := nullif(btrim(coalesce(p_pham_vi, '')), '');
begin
  select role::text into v_my_role from profiles where id = v_me;
  if v_my_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('admin_users', v_my_role) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin được đổi phân quyền');
  end if;
  select * into v_old from profiles where id = p_user_id;
  if v_old.id is null then
    return jsonb_build_object('ok', false, 'error', 'Không tìm thấy tài khoản');
  end if;
  if p_role not in ('admin','qa_manager','department_user','viewer') then
    return jsonb_build_object('ok', false, 'error', 'Vai trò không hợp lệ');
  end if;
  if v_pv is not null and v_pv not in ('co','bo_phan','phan_cong','khong') then
    return jsonb_build_object('ok', false, 'error', 'Phạm vi không hợp lệ');
  end if;
  if p_user_id = v_me and p_role <> 'admin' then
    return jsonb_build_object('ok', false, 'error',
      'Không tự hạ vai của chính mình — hạ xong sẽ không vào lại được để sửa.');
  end if;
  if v_old.role::text = 'admin' and p_role <> 'admin' then
    select count(*) into v_so_admin from profiles
     where role = 'admin' and coalesce(is_active, true) and id <> p_user_id;
    if v_so_admin = 0 then
      return jsonb_build_object('ok', false, 'error',
        'Đây là admin đang hoạt động cuối cùng — hạ vai là không còn ai quản trị hệ thống.');
    end if;
  end if;
  if p_role = 'department_user' and nullif(btrim(coalesce(p_department,'')),'') is null then
    return jsonb_build_object('ok', false, 'error',
      'Vai department_user bắt buộc có bộ phận, nếu không họ không sửa được hạng mục nào.');
  end if;
  /* Đặt phạm vi "theo phân công" cho người chưa có ô nào = khoá sạch họ
     mà người đặt không biết. Chặn trước, nói rõ phải làm gì. */
  if v_pv = 'phan_cong' and not exists (
    select 1 from vmp_assignment_matrix m
    left join vmp_performers f on f.user_id = p_user_id
    where m.is_active
      and lower(btrim(m.staff_name)) = lower(btrim(coalesce(f.performer_name, v_old.full_name, '')))
  ) then
    return jsonb_build_object('ok', false, 'error',
      'Người này chưa được tích ô phân công nào, đặt "theo phân công" bây giờ là khoá sạch họ. '
      || 'Tích phân công trước rồi quay lại.');
  end if;

  update profiles
     set role = p_role::user_role,
         department = nullif(btrim(coalesce(p_department, '')), ''),
         pham_vi = v_pv
   where id = p_user_id;

  insert into audit_logs (user_id, action, table_name, record_id,
                          old_data, new_data, change_reason, source, changed_fields)
  values (v_me, 'UPDATE', 'profiles', p_user_id::text,
          jsonb_build_object('role', v_old.role, 'department', v_old.department, 'pham_vi', v_old.pham_vi),
          jsonb_build_object('role', p_role, 'department', nullif(btrim(coalesce(p_department,'')),''), 'pham_vi', v_pv),
          coalesce(p_reason, 'Đổi phân quyền từ màn Phân quyền'),
          'dashboard_rpc', array['role','department','pham_vi']);

  return jsonb_build_object('ok', true, 'msg', 'Đã cập nhật phân quyền',
                            'role', p_role, 'pham_vi', v_pv);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;
revoke all on function public.rpc_set_user_role(uuid, text, text, text, text) from public, anon;
grant execute on function public.rpc_set_user_role(uuid, text, text, text, text) to authenticated;

/* ---------------------------------------------------------------------
 *  7 · rpc_lien_ket_tai_khoan — nối tay khi email không khớp
 * ------------------------------------------------------------------- */
create or replace function public.rpc_lien_ket_tai_khoan(
  p_performer_id uuid, p_user_id uuid
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_vai text;
begin
  select role::text into v_vai from profiles where id = auth.uid();
  if v_vai is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('admin_users', v_vai) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin được nối người với tài khoản');
  end if;
  if p_user_id is not null and exists (
    select 1 from vmp_performers where user_id = p_user_id and id <> p_performer_id
  ) then
    return jsonb_build_object('ok', false, 'error',
      'Tài khoản này đã nối với một người khác. Gỡ nối bên đó trước.');
  end if;
  update vmp_performers set user_id = p_user_id where id = p_performer_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Không tìm thấy người này');
  end if;
  insert into audit_logs (user_id, action, table_name, record_id, new_data, change_reason, source)
  values (auth.uid(), 'UPDATE', 'vmp_performers', p_performer_id::text,
          jsonb_build_object('user_id', p_user_id),
          case when p_user_id is null then 'Gỡ nối người khỏi tài khoản'
               else 'Nối người với tài khoản' end, 'dashboard_rpc');
  return jsonb_build_object('ok', true,
    'msg', case when p_user_id is null then 'Đã gỡ nối' else 'Đã nối với tài khoản' end);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;
revoke all on function public.rpc_lien_ket_tai_khoan(uuid, uuid) from public, anon;
grant execute on function public.rpc_lien_ket_tai_khoan(uuid, uuid) to authenticated;

do $kiem$
declare v_noi int; v_email int;
begin
  select count(*) into v_noi from vmp_performers where user_id is not null;
  select count(*) into v_email from vmp_performers where coalesce(btrim(email),'') <> '';
  raise notice 'Đã lấp email cho %/% người thực hiện, nối được % người với tài khoản',
    v_email, (select count(*) from vmp_performers), v_noi;
end
$kiem$;

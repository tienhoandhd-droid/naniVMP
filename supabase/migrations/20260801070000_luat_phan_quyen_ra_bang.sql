/* =====================================================================
 *  20260801070000 — Đưa luật "vai trò được làm gì" ra khỏi thân hàm
 *  ---------------------------------------------------------------------
 *  Ma trận A ở màn Phân quyền đang là bản CHÉP TAY của các dòng
 *      if v_role not in ('admin','qa_manager') then ...
 *  nằm rải trong 24 hàm RPC. Muốn sửa được luật trên web thì luật phải
 *  nằm ở chỗ web ghi được — tức một BẢNG — chứ không phải trong thân hàm.
 *  Làm ô trên web sửa được mà hàm vẫn đọc hằng số cứng là kiểu nguy hiểm
 *  nhất: màn hình báo "đã lưu", hệ thống chạy y như cũ, và không ai biết
 *  quyền thật là gì nữa.
 *
 *  Cách làm: một bảng luật + hai hàm tra cứu, rồi THAY ĐÚNG MỘT BIỂU THỨC
 *  ĐIỀU KIỆN trong mỗi hàm bằng lời gọi hàm tra cứu. Không viết lại thân
 *  hàm — thân hàm giữ nguyên từng chữ, kể cả câu báo lỗi. Viết lại 24 hàm
 *  bằng tay là 24 cơ hội làm hỏng một hàm đang chạy đúng.
 *
 *  Giá trị hạt giống được đặt ĐÚNG BẰNG hành vi hiện tại, nên ngay sau
 *  migration này hệ thống cư xử y hệt trước đó. Kiểm chứng ở cuối file.
 *
 *  BA KHOÁ CỨNG mà bảng luật KHÔNG phá được (nằm trong rpc_set_role_permission):
 *   1. Chỉ admin được sửa bảng luật.
 *   2. Ô (admin × quản trị người dùng) đóng băng ở "Được" — mở khoá cho ô
 *      này nghĩa là cho phép tự khoá mình ra ngoài, không ai vào sửa lại
 *      được nữa.
 *   3. Mức "Chỉ bộ phận mình" chỉ đặt được cho hành động CÓ vế so bộ phận
 *      trong hàm. Các hành động khác nhận mức đó sẽ thành mở toang mà
 *      màn hình lại ghi "chỉ bộ phận mình" — đúng kiểu nói một đằng làm
 *      một nẻo mà migration này sinh ra để dẹp.
 * ===================================================================== */

create table if not exists public.vmp_role_permissions (
  hanh_dong  text not null,
  vai_tro    user_role not null,
  muc        text not null default 'khong' check (muc in ('co', 'bo_phan', 'khong')),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (hanh_dong, vai_tro)
);

comment on table public.vmp_role_permissions is
  'Luật phân quyền GHI. Các hàm RPC đọc bảng này qua public.duoc_phep / public.muc_quyen. Sửa qua rpc_set_role_permission.';

alter table public.vmp_role_permissions enable row level security;
drop policy if exists role_permissions_select on public.vmp_role_permissions;
create policy role_permissions_select on public.vmp_role_permissions
  for select to authenticated using (true);
revoke all on public.vmp_role_permissions from anon;
grant select on public.vmp_role_permissions to authenticated;

/* Hạt giống = hành vi ĐANG chạy, không phải hành vi mong muốn. */
insert into public.vmp_role_permissions (hanh_dong, vai_tro, muc) values
  ('update_progress',   'admin',           'co'),
  ('update_progress',   'qa_manager',      'co'),
  ('update_progress',   'department_user', 'bo_phan'),
  ('update_progress',   'viewer',          'khong'),

  ('set_item_state',    'admin',           'co'),
  ('set_item_state',    'qa_manager',      'co'),
  ('set_item_state',    'department_user', 'khong'),
  ('set_item_state',    'viewer',          'khong'),

  ('generate_timeline', 'admin',           'co'),
  ('generate_timeline', 'qa_manager',      'co'),
  ('generate_timeline', 'department_user', 'khong'),
  ('generate_timeline', 'viewer',          'khong'),

  ('edit_catalog',      'admin',           'co'),
  ('edit_catalog',      'qa_manager',      'co'),
  ('edit_catalog',      'department_user', 'khong'),
  ('edit_catalog',      'viewer',          'khong'),

  ('admin_users',       'admin',           'co'),
  ('admin_users',       'qa_manager',      'khong'),
  ('admin_users',       'department_user', 'khong'),
  ('admin_users',       'viewer',          'khong')
on conflict (hanh_dong, vai_tro) do nothing;

/* ---------------------------------------------------------------------
 *  Hai hàm tra cứu. SECURITY DEFINER vì các RPC gọi chúng chạy dưới
 *  quyền định nghĩa; STABLE để Postgres gọi một lần mỗi câu lệnh.
 *  Không có dòng luật ⇒ 'khong'. Mặc định phải là CẤM: nếu ai đó thêm một
 *  hành động mới mà quên khai luật, hệ thống phải khoá lại chứ không mở ra.
 * ------------------------------------------------------------------- */
create or replace function public.muc_quyen(p_hanh_dong text, p_vai_tro text)
returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select muc from public.vmp_role_permissions
      where hanh_dong = p_hanh_dong and vai_tro::text = p_vai_tro),
    'khong');
$$;

create or replace function public.duoc_phep(p_hanh_dong text, p_vai_tro text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.muc_quyen(p_hanh_dong, p_vai_tro) <> 'khong';
$$;

grant execute on function public.muc_quyen(text, text) to authenticated;
grant execute on function public.duoc_phep(text, text) to authenticated;

/* ---------------------------------------------------------------------
 *  Thay điều kiện trong các hàm đang chạy.
 *  Chỉ đụng vào ĐIỀU KIỆN, giữ nguyên mọi thứ còn lại kể cả câu báo lỗi.
 * ------------------------------------------------------------------- */
do $ghep$
declare
  r          record;
  v_def      text;
  v_moi      text;
  v_hanh_dong text;
  v_dem      int := 0;
  -- rpc_trang_thai_he_thong là hàm ĐỌC trạng thái hệ thống, không phải
  -- hành động ghi nào trong ma trận. Gán nó vào 'edit_catalog' thì bảng
  -- sẽ nói sai về nó, nên để nguyên luật cứng.
  v_bo_qua   text[] := array['rpc_trang_thai_he_thong'];
begin
  for r in
    select p.oid, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'rpc_%'
      and pg_get_functiondef(p.oid) ~* 'v_role\s+not\s+in\s*\(\s*''admin''\s*,\s*''qa_manager''\s*\)'
      and not (p.proname = any(v_bo_qua))
  loop
    v_hanh_dong := case r.proname
      when 'rpc_set_item_state'    then 'set_item_state'
      when 'rpc_generate_timeline' then 'generate_timeline'
      else 'edit_catalog'
    end;
    v_def := pg_get_functiondef(r.oid);
    v_moi := regexp_replace(
      v_def,
      'v_role\s+not\s+in\s*\(\s*''admin''\s*,\s*''qa_manager''\s*\)',
      'not public.duoc_phep(' || quote_literal(v_hanh_dong) || ', v_role::text)',
      'gi');
    if v_moi = v_def then
      raise exception 'Không thay được điều kiện trong %', r.proname;
    end if;
    execute v_moi;
    v_dem := v_dem + 1;
  end loop;
  raise notice 'Đã chuyển % hàm sang đọc bảng luật', v_dem;
end
$ghep$;

/* rpc_update_progress có HAI nhánh, mỗi nhánh một mức khác nhau, nên thay
   riêng chứ không gộp vào vòng lặp trên. */
do $ghep2$
declare
  v_def text := pg_get_functiondef('public.rpc_update_progress(text,jsonb,text,jsonb,integer)'::regprocedure);
  v_moi text;
begin
  v_moi := replace(v_def,
    'IF v_role = ''viewer'' THEN',
    'IF public.muc_quyen(''update_progress'', v_role::text) = ''khong'' THEN');
  v_moi := replace(v_moi,
    'IF v_role = ''department_user'' THEN',
    'IF public.muc_quyen(''update_progress'', v_role::text) = ''bo_phan'' THEN');
  if v_moi = v_def then
    raise exception 'Không thay được điều kiện trong rpc_update_progress';
  end if;
  execute v_moi;
end
$ghep2$;

/* rpc_set_user_role dùng dạng khác (IS DISTINCT FROM 'admin'). */
do $ghep3$
declare
  v_def text := pg_get_functiondef('public.rpc_set_user_role(uuid,text,text,text)'::regprocedure);
  v_moi text := replace(v_def,
    'IF v_my_role IS DISTINCT FROM ''admin'' THEN',
    'IF NOT public.duoc_phep(''admin_users'', v_my_role::text) THEN');
begin
  if v_moi = v_def then
    raise exception 'Không thay được điều kiện trong rpc_set_user_role';
  end if;
  execute v_moi;
end
$ghep3$;

/* ---------------------------------------------------------------------
 *  rpc_set_role_permission — sửa một ô của ma trận A
 * ------------------------------------------------------------------- */
create or replace function public.rpc_set_role_permission(
  p_hanh_dong text, p_vai_tro text, p_muc text
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_toi   uuid := auth.uid();
  v_vai   text;
  v_cu    text;
  -- Chỉ hành động NÀO trong hàm có vế so bộ phận mới nhận mức 'bo_phan'.
  v_co_ve_bo_phan text[] := array['update_progress'];
begin
  select role::text into v_vai from profiles where id = v_toi;
  if v_vai is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('admin_users', v_vai) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin được sửa luật phân quyền');
  end if;
  if p_muc not in ('co', 'bo_phan', 'khong') then
    return jsonb_build_object('ok', false, 'error', 'Mức quyền chỉ nhận co / bo_phan / khong');
  end if;
  if not exists (select 1 from public.vmp_role_permissions
                  where hanh_dong = p_hanh_dong and vai_tro::text = p_vai_tro) then
    return jsonb_build_object('ok', false, 'error',
      'Không có ô này trong ma trận: ' || coalesce(p_hanh_dong, '∅') || ' × ' || coalesce(p_vai_tro, '∅'));
  end if;

  -- Khoá 2: không tự khoá mình ra ngoài.
  if p_hanh_dong = 'admin_users' and p_vai_tro = 'admin' and p_muc <> 'co' then
    return jsonb_build_object('ok', false, 'error',
      'Không hạ được quyền quản trị của vai admin — hạ xong sẽ không còn ai mở lại được.');
  end if;

  -- Khoá 3: 'bo_phan' chỉ có nghĩa ở hành động có vế so bộ phận.
  if p_muc = 'bo_phan' and not (p_hanh_dong = any(v_co_ve_bo_phan)) then
    return jsonb_build_object('ok', false, 'error',
      'Hành động này chưa có vế so bộ phận trong luật, nên chỉ đặt được Được hoặc Không. '
      || 'Đặt "chỉ bộ phận mình" ở đây sẽ thành mở toàn quyền mà màn hình lại ghi là hạn chế.');
  end if;

  select muc into v_cu from public.vmp_role_permissions
   where hanh_dong = p_hanh_dong and vai_tro::text = p_vai_tro;

  update public.vmp_role_permissions
     set muc = p_muc, updated_by = v_toi, updated_at = now()
   where hanh_dong = p_hanh_dong and vai_tro::text = p_vai_tro;

  insert into audit_logs (user_id, action, table_name, record_id,
                          old_data, new_data, change_reason, source, changed_fields)
  values (v_toi, 'CONFIG_CHANGE', 'vmp_role_permissions',
          p_hanh_dong || '×' || p_vai_tro,
          jsonb_build_object('muc', v_cu), jsonb_build_object('muc', p_muc),
          'Sửa ma trận vai trò × hành động từ màn Phân quyền',
          'dashboard_rpc', array['muc']);

  return jsonb_build_object('ok', true, 'msg', 'Đã lưu luật phân quyền', 'muc', p_muc);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;

revoke all on function public.rpc_set_role_permission(text, text, text) from public, anon;
grant execute on function public.rpc_set_role_permission(text, text, text) to authenticated;

/* ---------------------------------------------------------------------
 *  Tự kiểm: mọi hàm đáng lẽ đã đọc bảng luật thì không còn hằng số cứng.
 * ------------------------------------------------------------------- */
do $kiem$
declare
  v_con text[];
begin
  select array_agg(p.proname order by p.proname) into v_con
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'rpc_%'
    and p.proname <> 'rpc_trang_thai_he_thong'
    and pg_get_functiondef(p.oid) ~* 'v_role\s+not\s+in\s*\(\s*''admin''\s*,\s*''qa_manager''\s*\)';
  if v_con is not null then
    raise exception 'Còn % hàm dùng luật cứng: %', array_length(v_con, 1), array_to_string(v_con, ', ');
  end if;
  if pg_get_functiondef('public.rpc_update_progress(text,jsonb,text,jsonb,integer)'::regprocedure)
     ~ 'IF v_role = ''viewer'' THEN' then
    raise exception 'rpc_update_progress vẫn kiểm viewer bằng hằng số cứng';
  end if;
  raise notice 'Tự kiểm đạt: không còn luật phân quyền cứng trong thân hàm';
end
$kiem$;

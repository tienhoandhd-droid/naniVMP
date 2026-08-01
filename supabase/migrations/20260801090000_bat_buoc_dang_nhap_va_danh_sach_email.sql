/* =====================================================================
 *  20260801090000 — Bắt buộc đăng nhập & khoá danh sách email được phép
 *  ---------------------------------------------------------------------
 *  HAI LỖ HỔNG ĐƯỢC BỊT Ở ĐÂY, cả hai đều kiểm chứng được bằng curl trước
 *  khi vá (xem docs/bao-mat.md):
 *
 *  1 · ĐỌC KHÔNG CẦN TÀI KHOẢN. 15 hàm rpc_* mở cho vai `anon`. Chúng là
 *      SECURITY DEFINER nên đi vòng qua RLS. Chỉ cần khoá publishable —
 *      khoá này nằm trong file JS công khai của một repo công khai — là
 *      gọi được rpc_get_vmp_dashboard (toàn bộ 448 hạng mục) và
 *      rpc_get_audit_logs (nhật ký thao tác). Không cần đăng nhập.
 *
 *  2 · AI CŨNG TỰ ĐĂNG KÝ ĐƯỢC. POST /auth/v1/signup bằng đúng khoá đó
 *      tạo ra tài khoản thật. Đã thử và đã xoá tài khoản thử.
 *
 *  Vá 1: thu quyền execute của `anon` trên toàn bộ rpc_*, giữ nguyên cho
 *  `authenticated`. Hệ quả có chủ ý: mở web ra là thấy màn đăng nhập.
 *  Đã kiểm trước khi làm — hai workflow n8n đang chạy (Vani VMP 4 và 5)
 *  nối Postgres TRỰC TIẾP chứ không qua REST, nên không bị ảnh hưởng.
 *
 *  Vá 2: một bảng danh sách email được phép + trigger chặn ở tầng
 *  database. Chặn ở đây chứ không chỉ tắt nút trên Dashboard, vì tắt nút
 *  là một ô tick không ai nhìn lại, còn trigger thì nằm trong migration,
 *  đi theo mã nguồn, và bật lại nhầm thì lần chạy migration sau sẽ dựng
 *  lại. Hai lớp tốt hơn một.
 *
 *  Danh sách áp cho MỌI cách tạo tài khoản, kể cả tạo tay trong Supabase
 *  Dashboard — vì không có tín hiệu nào phân biệt chắc chắn "admin tạo"
 *  với "người lạ tự đăng ký": cả hai đều đi qua GoTrue dưới cùng một vai
 *  database. Đoán sai chỗ này thì cái khoá thành khoá giả.
 * ===================================================================== */

/* ---------------------------------------------------------------------
 *  1 · Danh sách email được phép có tài khoản
 * ------------------------------------------------------------------- */
create table if not exists public.vmp_email_cho_phep (
  email      text primary key,
  ghi_chu    text,
  is_active  boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);

comment on table public.vmp_email_cho_phep is
  'Email được phép có tài khoản. Trigger chan_dang_ky_la trên auth.users chặn mọi email không nằm ở đây.';

alter table public.vmp_email_cho_phep enable row level security;
drop policy if exists email_cho_phep_select on public.vmp_email_cho_phep;
create policy email_cho_phep_select on public.vmp_email_cho_phep
  for select to authenticated using (true);
revoke all on public.vmp_email_cho_phep from anon;
grant select on public.vmp_email_cho_phep to authenticated;

/* Hạt giống = đúng những tài khoản ĐANG có. Nếu để trống rồi mới thêm
   dần thì ngay lần đổi mật khẩu/khôi phục đầu tiên hệ thống có thể chặn
   nhầm chính người đang dùng. */
insert into public.vmp_email_cho_phep (email, ghi_chu)
select lower(btrim(u.email)), 'Tài khoản đã có trước khi bật danh sách'
from auth.users u
where u.email is not null
on conflict (email) do nothing;

/* ---------------------------------------------------------------------
 *  2 · Trigger chặn tạo tài khoản ngoài danh sách
 * ------------------------------------------------------------------- */
create or replace function public.chan_dang_ky_la()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if new.email is null or btrim(new.email) = '' then
    raise exception 'Tài khoản phải có email';
  end if;
  if not exists (
    select 1 from public.vmp_email_cho_phep
     where email = lower(btrim(new.email)) and is_active
  ) then
    /* Câu này người đăng ký ngoài sẽ đọc được, nên KHÔNG tiết lộ gì về hệ
       thống: không nói có bao nhiêu người, không gợi ý định dạng email
       đúng, không xác nhận email nào đã tồn tại. */
    raise exception 'Email này chưa được duyệt để tạo tài khoản. Liên hệ quản trị hệ thống.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists chan_dang_ky_la on auth.users;
create trigger chan_dang_ky_la
  before insert on auth.users
  for each row execute function public.chan_dang_ky_la();

/* RPC cho màn Phân quyền: thêm / bỏ một email khỏi danh sách. */
create or replace function public.rpc_set_email_cho_phep(
  p_email text, p_cho_phep boolean, p_ghi_chu text default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_vai   text;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  select role::text into v_vai from profiles where id = auth.uid();
  if v_vai is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('admin_users', v_vai) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin được sửa danh sách email');
  end if;
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error', 'Email không đúng dạng');
  end if;

  /* Không cho bỏ email của tài khoản ĐANG hoạt động: bỏ xong thì lần
     khôi phục mật khẩu hay tạo lại tài khoản của chính người đó sẽ bị
     chặn, mà lúc đó không ai nhớ là do dòng này. */
  if not p_cho_phep and exists (
    select 1 from auth.users u join profiles p on p.id = u.id
     where lower(btrim(u.email)) = v_email and coalesce(p.is_active, true)
  ) then
    return jsonb_build_object('ok', false, 'error',
      'Email này đang gắn với một tài khoản đang hoạt động. Tắt tài khoản đó trước.');
  end if;

  if p_cho_phep then
    insert into public.vmp_email_cho_phep (email, ghi_chu, is_active, created_by)
    values (v_email, nullif(btrim(coalesce(p_ghi_chu, '')), ''), true, auth.uid())
    on conflict (email) do update
      set is_active = true,
          ghi_chu = coalesce(excluded.ghi_chu, public.vmp_email_cho_phep.ghi_chu);
  else
    update public.vmp_email_cho_phep set is_active = false where email = v_email;
  end if;

  insert into audit_logs (user_id, action, table_name, record_id,
                          new_data, change_reason, source, changed_fields)
  values (auth.uid(), 'CONFIG_CHANGE', 'vmp_email_cho_phep', v_email,
          jsonb_build_object('cho_phep', p_cho_phep, 'ghi_chu', p_ghi_chu),
          'Sửa danh sách email được phép tạo tài khoản', 'dashboard_rpc', array['is_active']);

  return jsonb_build_object('ok', true,
    'msg', case when p_cho_phep then 'Đã cho phép email này tạo tài khoản'
                else 'Đã bỏ email khỏi danh sách' end);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;

/* ---------------------------------------------------------------------
 *  3 · Thu quyền của anon trên mọi hàm rpc_*
 *  ---------------------------------------------------------------------
 *  Làm theo vòng lặp chứ không liệt kê tay: liệt kê tay thì hàm thêm sau
 *  này sẽ lọt lưới, và không ai nhớ để bổ sung. Cuối file có phép tự kiểm
 *  chạy lại đúng câu truy vấn đó — thêm hàm mới mà quên thì migration
 *  sau sẽ báo.
 * ------------------------------------------------------------------- */
/* Phải thu CẢ của PUBLIC, không chỉ của `anon`. Postgres cấp EXECUTE cho
   PUBLIC trên mọi hàm mới theo mặc định, và `anon` thừa hưởng qua đó —
   thu riêng của `anon` xong kiểm lại vẫn thấy anon gọi được, đúng như lần
   chạy thử đầu tiên đã chỉ ra. Thu của PUBLIC rồi cấp lại tường minh cho
   `authenticated` và `service_role`. */
do $siet$
declare r record; v_dem int := 0;
begin
  for r in
    select p.oid::regprocedure as ham
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'rpc_%'
  loop
    execute format('revoke execute on function %s from public, anon', r.ham);
    execute format('grant execute on function %s to authenticated, service_role', r.ham);
    v_dem := v_dem + 1;
  end loop;
  raise notice 'Đã siết % hàm rpc_*: bỏ public+anon, giữ authenticated', v_dem;
end
$siet$;

/* Hàm mới tạo sau này KHÔNG tự động mở cho anon nữa. */
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

do $kiem$
declare v_con text[];
begin
  select array_agg(p.proname order by p.proname) into v_con
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'rpc_%'
    and has_function_privilege('anon', p.oid, 'execute');
  if v_con is not null then
    raise exception 'Còn % hàm anon gọi được: %', array_length(v_con, 1), array_to_string(v_con, ', ');
  end if;
  raise notice 'Tự kiểm đạt: anon không gọi được hàm rpc_* nào';
end
$kiem$;

/* =====================================================================
 *  20260801080000 — Tài khoản mới tự có hồ sơ trong bảng profiles
 *  ---------------------------------------------------------------------
 *  CÁI BẪY đang có: tạo tài khoản trong Supabase Dashboard thì người đó
 *  đăng nhập được, nhưng KHÔNG có dòng nào trong `profiles`. Hệ quả:
 *
 *   · getProfile() không tìm thấy dòng nào → app im lặng coi họ là
 *     "User · viewer". Không báo lỗi gì.
 *   · Mọi hàm RPC ghi đều mở đầu bằng
 *         select role into v_role from profiles where id = auth.uid();
 *         if v_role is null then return 'Không xác định được người dùng';
 *     nên họ bấm gì cũng nhận đúng câu đó, mà câu đó nghe như lỗi hệ
 *     thống chứ không gợi ra rằng "bạn chưa được cấp hồ sơ".
 *   · Người mới KHÔNG xuất hiện trong ma trận B, nên người quản trị nhìn
 *     màn Phân quyền cũng không thấy họ mà cấp quyền.
 *
 *  Ba cái đó cộng lại thành một loại lỗi rất khó truy: tài khoản có thật,
 *  mật khẩu đúng, đăng nhập thành công, mà làm gì cũng không được và
 *  không có chỗ nào nói vì sao.
 *
 *  Trigger này khép vòng: hễ có tài khoản trong auth.users là có ngay một
 *  dòng profiles vai `viewer`. Vai viewer KHÔNG ghi được gì (mọi hàm đều
 *  tra bảng vmp_role_permissions, và viewer đang là 'khong' ở cả năm hành
 *  động), nên mặc định vẫn là mặc định an toàn — nhưng người đó hiện ra ở
 *  ma trận B để người quản trị tích vai cho họ.
 *
 *  Vì sao mặc định là viewer chứ không phải department_user: cấp quá tay
 *  rồi rút lại thì trong khoảng thời gian ở giữa họ đã ghi được vào hồ sơ
 *  GMP. Cấp thiếu thì chỉ tốn một lần bấm ở ma trận B.
 * ===================================================================== */

create or replace function public.tu_tao_ho_so_nguoi_dung()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    new.email,
    /* Tên hiển thị lấy theo thứ tự: tên người dùng tự khai khi đăng ký →
       tên Google trả về → phần trước @ của email. Không để trống: ma trận
       B gộp người theo TÊN, dòng không tên sẽ không khớp được với ai. */
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Người dùng mới'
    ),
    'viewer',
    true
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  /* Không được để lỗi ở đây làm hỏng việc tạo tài khoản: thà có tài khoản
     mà thiếu hồ sơ (tình trạng cũ, người quản trị vá tay được) còn hơn
     người dùng không đăng ký nổi mà không hiểu vì sao. */
  raise warning 'Không tạo được hồ sơ cho %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists tu_tao_ho_so on auth.users;
create trigger tu_tao_ho_so
  after insert on auth.users
  for each row execute function public.tu_tao_ho_so_nguoi_dung();

/* Vá những tài khoản đã có từ trước mà chưa có hồ sơ. Bỏ qua tài khoản
   đã bị khoá vĩnh viễn (banned_until vô hạn) — đó là tài khoản kiểm thử
   đã đóng, dựng hồ sơ cho nó chỉ làm ma trận B thêm một dòng rác. */
insert into public.profiles (id, email, full_name, role, is_active)
select u.id, u.email,
       coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
                'Người dùng mới'),
       'viewer', true
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
  and (u.banned_until is null or u.banned_until < now())
on conflict (id) do nothing;

do $kiem$
declare v_thieu int;
begin
  select count(*) into v_thieu
  from auth.users u left join public.profiles p on p.id = u.id
  where p.id is null and (u.banned_until is null or u.banned_until < now());
  if v_thieu > 0 then
    raise exception 'Còn % tài khoản đang dùng mà chưa có hồ sơ', v_thieu;
  end if;
  raise notice 'Tự kiểm đạt: mọi tài khoản đang dùng đều có hồ sơ trong profiles';
end
$kiem$;

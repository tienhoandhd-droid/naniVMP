/* =====================================================================
 *  20260801120000 — rpc_nguoi_va_quyen chỉ mở đúng bằng RLS, không rộng hơn
 *  ---------------------------------------------------------------------
 *  Migration trước cấp execute cho cả `authenticated`. Hàm đó là SECURITY
 *  DEFINER, nghĩa là nó chạy bằng quyền của người tạo hàm và đi vòng qua
 *  Row Level Security. Mà RLS của profiles thì viết rõ:
 *
 *      profiles_select : id = auth.uid() OR is_admin_or_qa()
 *
 *  — người thường chỉ đọc được hồ sơ CỦA CHÍNH MÌNH.
 *
 *  Nên trước bản vá này, một tài khoản viewer gọi thẳng RPC bằng curl là có
 *  trong tay danh bạ đầy đủ: họ tên, email, vai trò, bộ phận, và ai đang là
 *  admin của hệ thống. Giao diện không mở đường đó, nhưng giao diện chưa
 *  bao giờ là chốt chặn — client nào cũng gọi được RPC trực tiếp.
 *
 *  Bản vá đặt đúng một điều kiện, và cố ý đặt bằng CHÍNH is_admin_or_qa()
 *  chứ không chép lại luật ra chữ khác: hai nơi phát biểu cùng một luật
 *  bằng hai câu khác nhau thì sớm muộn cũng lệch, và lúc lệch sẽ không ai
 *  biết bên nào mới đúng.
 *
 *  Vì sao là admin_or_qa mà không phải riêng admin: đây đúng bằng vế đang
 *  cho phép đọc profiles hôm nay. Siết chặt hơn RLS là đổi hành vi của màn
 *  Phân quyền cho QA — một việc khác, cần bàn riêng, không lẫn vào bản vá
 *  lỗ hổng này.
 * ===================================================================== */

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

  /* Cùng một vế với policy profiles_select. Hàm này gộp cả bảng profiles
     nên không được nhìn rộng hơn chỗ nó lấy dữ liệu. */
  if not public.is_admin_or_qa() then
    return jsonb_build_object('ok', false, 'error',
      'Chỉ admin và phụ trách QA xem được danh sách người dùng');
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

/* Kiểm ngay tại chỗ: giả làm tài khoản viewer rồi gọi hàm. Kiểm bằng cách
   CHẠY THẬT chứ không đọc lại mã — bản vá quyền mà chỉ đọc mã để yên tâm
   thì đúng bằng không vá. */
do $kiem$
declare
  v_viewer uuid;
  v_kq jsonb;
begin
  select id into v_viewer from profiles
   where role::text not in ('admin','qa_manager') limit 1;
  if v_viewer is null then
    raise notice 'Không có tài khoản thường nào để thử — bỏ qua phép kiểm.';
    return;
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_viewer::text, 'role', 'authenticated')::text, true);
  v_kq := public.rpc_nguoi_va_quyen();
  perform set_config('request.jwt.claims', '', true);
  if (v_kq->>'ok')::boolean is not false then
    raise exception 'Lỗ hổng còn nguyên: tài khoản thường vẫn đọc được danh sách người dùng';
  end if;
  raise notice 'Đã chặn: tài khoản thường gọi rpc_nguoi_va_quyen nhận "%"', v_kq->>'error';
end
$kiem$;

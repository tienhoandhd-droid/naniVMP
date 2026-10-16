-- =====================================================================
-- 20261016150000_lien_ket_ho_so_theo_email.sql — TÀI KHOẢN MỚI GẮN VÀO HỒ SƠ CÓ SẴN
-- ---------------------------------------------------------------------
-- Trigger tu_tao_ho_so_nhan_su luôn tạo hồ sơ người thực hiện MỚI khi có
-- tài khoản mới, kể cả khi Admin đã tạo sẵn hồ sơ cùng email → trùng hai
-- hồ sơ. Nay: email khớp đúng một hồ sơ đang hoạt động chưa gắn tài khoản
-- thì gắn vào hồ sơ đó. Không khớp hoặc khớp nhiều → giữ hành vi cũ.
-- Thân hàm chép nguyên văn từ production (16/10), chỉ thêm khối trên.
-- =====================================================================

begin;

CREATE OR REPLACE FUNCTION public.tu_tao_ho_so_nhan_su()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  /* vmp_performers_user_id_uniq (migration 20260801110000) buộc MỖI
     user_id chỉ xuất hiện tối đa MỘT dòng trong toàn bảng, kể cả dòng đã
     is_active=false — chặt hơn vmp_performers_one_active_per_user (chỉ
     xét dòng đang hoạt động). Phải kiểm theo ràng buộc chặt nhất, không
     thì insert bên dưới vỡ unique index thay vì rơi vào ON CONFLICT. */
  if exists (
    select 1 from public.vmp_performers p
    where p.user_id = new.id
  ) then
    return new;
  end if;

  /* 16/10: Admin có thể tạo sẵn hồ sơ người thực hiện (đúng email, chưa gắn
     tài khoản) trước khi người đó có tài khoản. Khớp đúng MỘT hồ sơ như vậy
     thì gắn tài khoản vào hồ sơ đó thay vì tạo dòng trùng — trước đây mỗi
     người thành hai hồ sơ và ràng buộc một-hồ-sơ-mỗi-tài-khoản chặn việc nối.
     Vai nghiệp vụ KHÔNG tự cấp ở đây: Admin vẫn chọn vai ở Bảng kiểm soát. */
  if nullif(btrim(new.email), '') is not null
     and (select count(*) from public.vmp_performers p
          where p.user_id is null and p.is_active
            and lower(btrim(p.email)) = lower(btrim(new.email))) = 1 then
    update public.vmp_performers p
    set user_id = new.id
    where p.user_id is null and p.is_active
      and lower(btrim(p.email)) = lower(btrim(new.email));
    return new;
  end if;

  insert into public.vmp_performers (
    performer_name, department, email, user_id, access_class,
    scope_departments, access_areas, scope_factory_ids, scope_area_ids,
    scope_line_ids, is_active, note
  ) values (
    new.full_name, new.department, new.email, new.id, null,
    '{}', '{}', '{}', '{}', '{}', true,
    'Tự tạo khi có tài khoản mới — Admin bổ sung bộ phận, phân loại và phạm vi ở màn Nhân sự.'
  )
  on conflict (user_id) where user_id is not null do nothing;
  return new;
exception when others then
  /* Cùng nguyên tắc với tu_tao_ho_so_nguoi_dung(): lỗi ở đây không được
     làm hỏng việc tạo tài khoản. Thà thiếu hồ sơ (Admin vá tay được, y
     hệt tình trạng trước migration này) còn hơn chặn cả đăng ký. */
  raise warning 'Không tự tạo được hồ sơ nhân sự cho %: %', new.id, sqlerrm;
  return new;
end;
$function$;

commit;

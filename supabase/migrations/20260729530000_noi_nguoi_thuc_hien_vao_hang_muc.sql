-- =====================================================================
-- Nối danh sách NGƯỜI THỰC HIỆN vào hạng mục VMP
--
-- Tại sao không ghi thẳng vmp_plan_items.owner_name:
--   Mỗi lần WF-04 đồng bộ, owner_name của hạng mục bị ghi đè bằng cột QA
--   của Sheet (rỗng ở phần lớn dòng ⇒ ghi đè thành NULL). Chỗ giữ được
--   phân công qua các lần sync là vmp_source_objects.owner_name — đúng
--   chỗ mà rpc_apply_assignments đang dùng.
--   Vậy nên gán người thực hiện = ghi vào ĐỐI TƯỢNG, rồi đẩy xuống các
--   hạng mục của đối tượng đó cho giao diện thấy ngay.
--
-- Kèm theo: nạp sẵn 6 QA đang phụ trách vào vmp_performers để danh sách
-- không rỗng lúc mở tab. Email lấy từ danh bạ nhân sự, nhưng CHỈ khi là
-- email thật — mấy địa chỉ '@cpc1hn.local' là chỗ giữ tạm lúc dựng bảng
-- phân công, điền vào đây thì trông như đã có email mà thật ra chưa.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Nạp người thực hiện từ bảng phân công đang chạy
-- ---------------------------------------------------------------------
insert into public.vmp_performers (performer_name, email, department, role_title, note)
select ten,
       (select s.email from public.vmp_staff_emails s
         where lower(btrim(s.staff_name)) = lower(ten)
           and s.email not like '%.local'
         limit 1),
       'QA', 'QA phụ trách',
       'Tự nạp từ bảng phân công QA'
from (
  select distinct btrim(owner_name) as ten
  from public.vmp_source_objects
  where is_active and nullif(btrim(owner_name), '') is not null
  union
  select distinct btrim(support_name)
  from public.vmp_source_objects
  where is_active and nullif(btrim(support_name), '') is not null
) t
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Gán người thực hiện cho một hạng mục (thực chất: cho đối tượng)
-- ---------------------------------------------------------------------
create or replace function public.rpc_set_item_performer(
  p_validation_code text,
  p_performer_name  text
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_role   text;
  v_obj    text;
  v_name   text := nullif(btrim(p_performer_name), '');
  v_email  text;
  v_items  integer := 0;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if v_role not in ('admin','qa_manager') then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được phân công người thực hiện');
  end if;

  select object_code into v_obj
  from public.vmp_plan_items
  where validation_code = p_validation_code and is_active;
  if v_obj is null then
    return jsonb_build_object('ok', false, 'error',
      'Không tìm thấy mã thẩm định: ' || coalesce(p_validation_code, ''));
  end if;

  -- Tên phải có trong danh sách người thực hiện. Cho gõ tự do thì lại quay
  -- về cảnh 'My' / 'My2' / 'my' là ba người khác nhau như trước đây.
  if v_name is not null then
    select performer_name, email into v_name, v_email
    from public.vmp_performers
    where is_active and lower(btrim(performer_name)) = lower(v_name);
    if v_name is null then
      return jsonb_build_object('ok', false, 'error',
        'Chưa có "' || btrim(p_performer_name) || '" trong danh sách người thực hiện. '
        || 'Thêm ở Danh mục & Nhập liệu → tab Người thực hiện rồi chọn lại.');
    end if;
  end if;

  perform set_config('app.audit_source', 'dashboard_rpc', true);
  perform set_config('app.audit_reason',
    coalesce('Gán người thực hiện: ' || v_name, 'Bỏ gán người thực hiện'), true);

  update public.vmp_source_objects
     set owner_name = v_name
   where object_code = v_obj;

  update public.vmp_plan_items
     set owner_name = v_name,
         updated_by = auth.uid(),
         updated_at = now()
   where object_code = v_obj and is_active;
  get diagnostics v_items = row_count;

  return jsonb_build_object(
    'ok', true,
    'object_code', v_obj,
    'performer_name', v_name,
    'email', v_email,
    'items', v_items,
    'msg', case when v_name is null
      then 'Đã bỏ gán người thực hiện cho ' || v_items || ' hạng mục của ' || v_obj
      else 'Đã gán ' || v_name || ' cho ' || v_items || ' hạng mục của ' || v_obj end
  );
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$fn$;

revoke execute on function public.rpc_set_item_performer(text, text) from public;
grant  execute on function public.rpc_set_item_performer(text, text) to authenticated, service_role;

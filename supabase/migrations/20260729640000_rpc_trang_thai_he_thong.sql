-- =====================================================================
-- rpc_trang_thai_he_thong — số liệu cho màn Quản trị
--
-- Mục Quản trị đang hứa "Cấu hình hệ thống, người dùng, phân quyền" mà
-- chỉ hiện đúng ba thứ: trạng thái kết nối, kiểu xác thực, và thông tin
-- phiên của chính người đang xem. Không có người dùng, không có cấu
-- hình, không có gì để quản trị.
--
-- Những thứ một người quản trị thật sự cần biết đều đã nằm sẵn trong DB,
-- chỉ là chưa ai lấy ra: ai đang có tài khoản và vai trò gì · cấu hình
-- hệ thống đang đặt bao nhiêu · công việc tự động nào đang hẹn giờ ·
-- lần đồng bộ gần nhất ra sao · dung lượng đang dùng · workflow n8n có
-- lỗi gì tuần qua.
--
-- Gom vào MỘT lời gọi để màn Quản trị không phải bắn 6 truy vấn rời rạc.
-- Chỉ admin/QA đọc được; cron và dung lượng là thông tin hạ tầng nên
-- không mở cho vai trò khác.
-- =====================================================================

create or replace function public.rpc_trang_thai_he_thong()
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_role text;
  v_kq   jsonb;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null or v_role not in ('admin','qa_manager') then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA quản lý xem được trạng thái hệ thống');
  end if;

  select jsonb_build_object(
    'ok', true,

    -- Người dùng và vai trò
    'nguoi_dung', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ten', p.full_name, 'email', p.email, 'vai_tro', p.role::text,
        'bo_phan', p.department, 'dang_dung', p.is_active,
        'dang_nhap_gan_nhat', p.last_login
      ) order by p.role::text, p.full_name), '[]'::jsonb)
      from profiles p
    ),

    -- Cấu hình hệ thống (bỏ khoá nhạy cảm)
    'cau_hinh', (
      select coalesce(jsonb_agg(jsonb_build_object('khoa', c.key, 'gia_tri', c.value)
             order by c.key), '[]'::jsonb)
      from system_config c where not coalesce(c.is_sensitive, false)
    ),

    -- Việc tự động đang hẹn giờ (pg_cron)
    'lich_tu_dong', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ten', j.jobname, 'lich', j.schedule, 'dang_bat', j.active,
        'lenh', left(j.command, 90)) order by j.jobname), '[]'::jsonb)
      from cron.job j
    ),

    -- Đồng bộ Sheet gần nhất (đường này đã ngắt, giữ để đối chiếu lịch sử)
    'dong_bo_gan_nhat', (
      select jsonb_build_object('luc', r.started_at, 'trang_thai', r.status,
                                'so_dong_nguon', r.source_row_count,
                                'so_ma_trung', r.duplicate_validation_count)
      from vmp_sheet_sync_runs r order by r.started_at desc limit 1
    ),

    -- Khối lượng dữ liệu
    'du_lieu', jsonb_build_object(
      'hang_muc_dang_theo_doi', (select count(*) from vmp_plan_items where is_active and coalesce(item_state,'active') = 'active'),
      'hang_muc_khong_ap_dung', (select count(*) from vmp_plan_items where is_active and coalesce(item_state,'active') <> 'active'),
      'doi_tuong', (select count(*) from vmp_objects where is_active),
      'nguoi_thuc_hien', (select count(*) from vmp_performers where is_active),
      'dong_nhat_ky', (select count(*) from audit_logs),
      'dung_luong', pg_size_pretty(pg_database_size(current_database()))
    ),

    -- Workflow n8n lỗi trong 7 ngày
    'workflow_loi_7_ngay', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ten', w.workflow_name, 'luc', w.created_at,
        'loi', left(coalesce(w.error_message, ''), 120)) order by w.created_at desc), '[]'::jsonb)
      from (select * from workflow_runs
             where status <> 'success' and created_at > now() - interval '7 days'
             order by created_at desc limit 10) w
    )
  ) into v_kq;

  return v_kq;
end;
$fn$;

revoke execute on function public.rpc_trang_thai_he_thong() from public, anon;
grant execute on function public.rpc_trang_thai_he_thong() to authenticated, service_role;

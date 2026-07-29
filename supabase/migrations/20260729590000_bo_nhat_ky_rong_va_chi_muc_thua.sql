-- =====================================================================
-- 97% nhật ký thao tác không ghi nhận thay đổi nào
--
-- audit_logs có 96.072 dòng / 161 MB. Bóc ra:
--   · 92.949 dòng (97%) là của bảng vmp_objects
--   · 91.587 dòng trong đó có old_data = new_data sau khi bỏ các cột kỹ
--     thuật (updated_at, source_sync_run_id, …) — tức là KHÔNG GHI NHẬN
--     THAY ĐỔI NÀO. Riêng hai cột old_data/new_data đã chiếm 129 MB.
--
-- Nguyên nhân: trigger audit_object_changes so `to_jsonb(OLD) =
-- to_jsonb(NEW)`. Mỗi lần đồng bộ, hàm sync đặt updated_at = now() cho cả
-- 217 đối tượng, nên phép so LUÔN khác nhau → ghi một bản chụp đầy đủ
-- cho từng đối tượng, mỗi lần sync. 208 lần sync × 217 đối tượng ≈ 45.000
-- dòng, cộng những ngày chạy lại nhiều lần thành 92.949.
--
-- Trigger của vmp_plan_items (bản v2) đã làm đúng: liệt kê cột thật sự
-- đổi và bỏ qua khi không có cột nào — nên bảng đó chỉ 7.451 dòng.
--
-- Sửa theo đúng cách của bản v2: bỏ cột kỹ thuật trước khi so, ghi rõ
-- changed_fields. Nhật ký từ nay chỉ còn thay đổi THẬT.
-- =====================================================================

create or replace function public.audit_object_changes()
returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_action  text;
  v_cu      jsonb;
  v_moi     jsonb;
  v_changed text[];
begin
  if TG_OP = 'INSERT' then
    v_action := 'INSERT';
  elsif TG_OP = 'UPDATE' then
    -- Cột do máy đặt mỗi lần chạm vào dòng — không phải thay đổi nghiệp vụ.
    v_cu  := to_jsonb(OLD) - 'updated_at' - 'source_sync_run_id' - 'source_sheet_row' - 'last_synced';
    v_moi := to_jsonb(NEW) - 'updated_at' - 'source_sync_run_id' - 'source_sheet_row' - 'last_synced';
    if v_cu = v_moi then return NEW; end if;

    select array_agg(key order by key) into v_changed
    from jsonb_each(v_moi) m
    where m.value is distinct from (v_cu -> m.key);

    v_action := 'UPDATE';
  elsif TG_OP = 'DELETE' then
    v_action := 'DELETE';
  end if;

  insert into audit_logs (action, table_name, record_id, changed_fields, old_data, new_data, source)
  values (
    v_action::audit_action, 'vmp_objects', coalesce(NEW.code, OLD.code), v_changed,
    case when TG_OP <> 'INSERT' then to_jsonb(OLD) else null end,
    case when TG_OP <> 'DELETE' then to_jsonb(NEW) else null end,
    coalesce(current_setting('app.audit_source', true), 'trigger')
  );
  return coalesce(NEW, OLD);
end;
$fn$;

comment on function public.audit_object_changes() is
  'Ghi nhật ký thay đổi vmp_objects. Bỏ qua khi chỉ có cột kỹ thuật đổi — nếu không, mỗi lần đồng bộ đẻ ra 217 dòng nhật ký rỗng.';

-- ---------------------------------------------------------------------
-- Dọn phần đã lỡ ghi: chuyển sang bảng lưu trữ, KHÔNG xoá
-- ---------------------------------------------------------------------
with rong as (
  select id from public.audit_logs
  where table_name = 'vmp_objects' and action = 'UPDATE' and changed_fields is null
    and (old_data - 'updated_at' - 'source_sync_run_id' - 'source_sheet_row' - 'last_synced')
      = (new_data - 'updated_at' - 'source_sync_run_id' - 'source_sheet_row' - 'last_synced')
),
chuyen as (
  delete from public.audit_logs a using rong r where a.id = r.id returning a.*
)
insert into public.audit_logs_archive select * from chuyen;

-- ---------------------------------------------------------------------
-- Chỉ mục chưa lần nào được dùng — bỏ đi cho nhẹ ghi
--
-- Giữ lại: chỉ mục vector của kho tri thức (tìm kiếm ngữ nghĩa dùng
-- đường khác nên bộ đếm không phản ánh), idx_audit_record (trang Audit
-- có ô lọc theo mã bản ghi, chưa ai dùng không có nghĩa là không cần).
-- ---------------------------------------------------------------------
drop index if exists public.idx_plan_search;              -- gin trgm, web lọc phía client
drop index if exists public.idx_vmp_obj_search;           -- như trên
drop index if exists public.idx_audit_validation_code;    -- không truy vấn nào lọc theo cột này
drop index if exists public.idx_plan_owner;               -- owner_id chưa bao giờ được điền
drop index if exists public.idx_wf_run_time;
drop index if exists public.idx_wf_run_workflow;
drop index if exists public.idx_wf_run_status;

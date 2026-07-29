-- =====================================================================
-- CHỮ TRẠNG THÁI PHẢI THEO KỊP KHI SỬA TIẾN ĐỘ TRÊN WEB
--
-- Sau migration 20260729180000, dashboard đọc chữ trạng thái từ cột
-- status_*_text của vmp_plan_items. Nhưng rpc_update_progress chỉ ghi
-- ENUM status_* — nghĩa là bug cũ ("sửa rồi mà biểu đồ không đổi") sẽ
-- quay lại ngay lần cập nhật đầu tiên, chỉ khác chỗ chữ cũ nay đến từ
-- cột trong DB thay vì từ Sheet.
--
-- Không vá trong RPC vì rpc_update_progress có HAI nạp chồng (4 và 5
-- tham số) và còn nhiều đường ghi khác (rpc_create_plan_item, sửa tay
-- bằng SQL…). Đặt ở TRIGGER thì mọi đường ghi đều đi qua.
--
-- Luật: enum đổi mà không ai ghi chữ mới → chữ được đặt lại theo bản
-- chuẩn. Nếu người dùng tự ghi chữ (giàu hơn: "Bổ sung đề cương",
-- "Tạm ngưng"…) thì giữ nguyên chữ đó.
-- =====================================================================

create or replace function public.vmp_phase_status_text(p phase_status)
returns text language sql immutable as $fn$
  select case p
    when 'completed'   then 'Hoàn thành'
    when 'in_progress' then 'Đang tiến hành'
    when 'overdue'     then 'Quá hạn'
    else 'Chưa tiến hành'
  end;
$fn$;

create or replace function public.vmp_sync_status_text()
returns trigger language plpgsql as $fn$
begin
  -- Chỉ can thiệp khi enum ĐỔI và chữ tương ứng KHÔNG được ghi trong
  -- cùng lệnh update. Như vậy đường ghi nào muốn giữ chữ riêng vẫn giữ được.
  if new.status_protocol is distinct from old.status_protocol
     and new.status_protocol_text is not distinct from old.status_protocol_text then
    new.status_protocol_text := public.vmp_phase_status_text(new.status_protocol);
  end if;

  if new.status_validation is distinct from old.status_validation
     and new.status_validation_text is not distinct from old.status_validation_text then
    new.status_validation_text := public.vmp_phase_status_text(new.status_validation);
  end if;

  if new.status_report is distinct from old.status_report
     and new.status_report_text is not distinct from old.status_report_text then
    new.status_report_text := public.vmp_phase_status_text(new.status_report);
  end if;

  if new.status_vmp is distinct from old.status_vmp
     and new.status_vmp_text is not distinct from old.status_vmp_text then
    new.status_vmp_text := public.vmp_phase_status_text(new.status_vmp);
  end if;

  return new;
end;
$fn$;

drop trigger if exists sync_status_text on public.vmp_plan_items;
create trigger sync_status_text
  before update on public.vmp_plan_items
  for each row execute function public.vmp_sync_status_text();

comment on function public.vmp_sync_status_text() is
  'Giữ status_*_text theo kịp enum status_*. Không ghi đè chữ do người '
  'dùng tự nhập trong cùng lệnh update.';

-- Dòng mới tạo sau này cũng phải có chữ ngay từ đầu ---------------------
create or replace function public.vmp_init_status_text()
returns trigger language plpgsql as $fn$
begin
  new.status_protocol_text   := coalesce(new.status_protocol_text,   public.vmp_phase_status_text(new.status_protocol));
  new.status_validation_text := coalesce(new.status_validation_text, public.vmp_phase_status_text(new.status_validation));
  new.status_report_text     := coalesce(new.status_report_text,     public.vmp_phase_status_text(new.status_report));
  new.status_vmp_text        := coalesce(new.status_vmp_text,        public.vmp_phase_status_text(new.status_vmp));
  return new;
end;
$fn$;

drop trigger if exists init_status_text on public.vmp_plan_items;
create trigger init_status_text
  before insert on public.vmp_plan_items
  for each row execute function public.vmp_init_status_text();

-- Vá 2 dòng còn thiếu chữ (chưa từng có trong ảnh chụp Sheet) ----------
update public.vmp_plan_items set
  status_protocol_text   = coalesce(status_protocol_text,   public.vmp_phase_status_text(status_protocol)),
  status_validation_text = coalesce(status_validation_text, public.vmp_phase_status_text(status_validation)),
  status_report_text     = coalesce(status_report_text,     public.vmp_phase_status_text(status_report)),
  status_vmp_text        = coalesce(status_vmp_text,        public.vmp_phase_status_text(status_vmp))
where status_vmp_text is null or status_protocol_text is null
   or status_validation_text is null or status_report_text is null;

-- =====================================================================
-- Nhật ký thao tác bỏ sót thay đổi TRẠNG THÁI NGHIỆP VỤ
--
-- Vừa chuyển 13 hạng mục sang "Không áp dụng" thì phát hiện: audit_logs
-- không ghi dòng nào. Trigger audit_plan_item_changes_v2 chỉ liệt kê một
-- danh sách cột cố định (status_*, deadline_*, owner_name, actual_*…) và
-- item_state KHÔNG có trong đó — nên nó coi như "không có gì đổi" và
-- thoát sớm, dù rpc_set_item_state đã đặt sẵn lý do vào app.audit_reason.
--
-- Đây đúng là loại thay đổi thanh tra hỏi đầu tiên: đưa một hạng mục ra
-- khỏi số liệu tuân thủ mà không để lại vết. Bổ sung item_state, và luôn
-- thể ba cột người dùng cũng sửa được: lịch thẩm định, người hỗ trợ,
-- điểm trọng yếu.
--
-- Kèm theo: ghi bù 13 dòng nhật ký cho lần chuyển vừa rồi, đúng nội dung
-- mà trigger lẽ ra đã ghi.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.audit_plan_item_changes_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $fn$
DECLARE
  v_action TEXT;
  v_user_id UUID;
  v_changed TEXT[] := '{}';
  v_validation_code TEXT;
  v_reason TEXT;
BEGIN
  v_reason := NULLIF(current_setting('app.audit_reason', true), '');

  IF TG_OP = 'INSERT' THEN
    v_action := 'INSERT';
    v_user_id := NEW.created_by;
    v_validation_code := NEW.validation_code;
  ELSIF TG_OP = 'UPDATE' THEN
    v_user_id := COALESCE(NEW.updated_by, OLD.updated_by);
    v_validation_code := COALESCE(NEW.validation_code, OLD.validation_code);

    IF OLD.status_protocol IS DISTINCT FROM NEW.status_protocol THEN v_changed := array_append(v_changed, 'status_protocol'); END IF;
    IF OLD.status_validation IS DISTINCT FROM NEW.status_validation THEN v_changed := array_append(v_changed, 'status_validation'); END IF;
    IF OLD.status_report IS DISTINCT FROM NEW.status_report THEN v_changed := array_append(v_changed, 'status_report'); END IF;
    IF OLD.status_vmp IS DISTINCT FROM NEW.status_vmp THEN v_changed := array_append(v_changed, 'status_vmp'); END IF;
    IF OLD.deadline_vmp IS DISTINCT FROM NEW.deadline_vmp THEN v_changed := array_append(v_changed, 'deadline_vmp'); END IF;
    IF OLD.deadline_protocol IS DISTINCT FROM NEW.deadline_protocol THEN v_changed := array_append(v_changed, 'deadline_protocol'); END IF;
    IF OLD.deadline_report IS DISTINCT FROM NEW.deadline_report THEN v_changed := array_append(v_changed, 'deadline_report'); END IF;
    IF OLD.owner_name IS DISTINCT FROM NEW.owner_name THEN v_changed := array_append(v_changed, 'owner_name'); END IF;
    IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN v_changed := array_append(v_changed, 'is_active'); END IF;
    IF OLD.missing_from_sheet IS DISTINCT FROM NEW.missing_from_sheet THEN v_changed := array_append(v_changed, 'missing_from_sheet'); END IF;
    IF OLD.actual_vmp_date IS DISTINCT FROM NEW.actual_vmp_date THEN v_changed := array_append(v_changed, 'actual_vmp_date'); END IF;
    IF OLD.actual_protocol_date IS DISTINCT FROM NEW.actual_protocol_date THEN v_changed := array_append(v_changed, 'actual_protocol_date'); END IF;
    IF OLD.actual_validation_date IS DISTINCT FROM NEW.actual_validation_date THEN v_changed := array_append(v_changed, 'actual_validation_date'); END IF;
    IF OLD.actual_report_date IS DISTINCT FROM NEW.actual_report_date THEN v_changed := array_append(v_changed, 'actual_report_date'); END IF;
    -- Trạng thái NGHIỆP VỤ (Không áp dụng / Đã hủy) đưa hạng mục RA KHỎI mọi
    -- số liệu tuân thủ — đúng loại thay đổi mà thanh tra sẽ hỏi "ai, khi nào,
    -- vì sao". Trước đây trigger không theo dõi cột này nên rpc_set_item_state
    -- đặt sẵn app.audit_reason mà chẳng có dòng nhật ký nào được ghi.
    IF OLD.item_state IS DISTINCT FROM NEW.item_state THEN v_changed := array_append(v_changed, 'item_state'); END IF;
    IF OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date THEN v_changed := array_append(v_changed, 'scheduled_date'); END IF;
    IF OLD.secondary_owner IS DISTINCT FROM NEW.secondary_owner THEN v_changed := array_append(v_changed, 'secondary_owner'); END IF;
    IF OLD.criticality_score IS DISTINCT FROM NEW.criticality_score THEN v_changed := array_append(v_changed, 'criticality_score'); END IF;

    IF array_length(v_changed, 1) IS NULL THEN RETURN NEW; END IF;

    IF OLD.is_active AND NOT NEW.is_active THEN v_action := 'DELETE';
    ELSIF v_changed && ARRAY['status_protocol','status_validation','status_report','status_vmp'] THEN v_action := 'STATUS_CHANGE';
    ELSIF v_changed && ARRAY['deadline_vmp','deadline_protocol','deadline_report'] THEN v_action := 'DEADLINE_CHANGE';
    ELSE v_action := 'UPDATE';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_user_id := OLD.updated_by;
    v_validation_code := OLD.validation_code;
  END IF;

  INSERT INTO audit_logs (
    user_id, action, table_name, record_id,
    validation_code, changed_fields, change_reason,
    old_data, new_data, source
  ) VALUES (
    v_user_id, v_action::audit_action, 'vmp_plan_items',
    COALESCE(NEW.id, OLD.id), v_validation_code, v_changed, v_reason,
    CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) ELSE NULL END,
    COALESCE(current_setting('app.audit_source', true), 'trigger')
  );

  RETURN COALESCE(NEW, OLD);
END;
$fn$

;

-- Ghi bù cho 13 hạng mục vừa chuyển (migration 20260729620000).
insert into public.audit_logs (action, table_name, record_id, validation_code,
                               changed_fields, change_reason, old_data, new_data, source)
select 'UPDATE'::audit_action, 'vmp_plan_items', p.id, p.validation_code,
       array['item_state'],
       'Google Sheet (cột "Không có thẩm định thực tế và hoàn thiện hồ sơ") đánh dấu x. '
       'Chủ hệ thống xác nhận 29/07/2026 chuyển sang Không áp dụng — không tính KPI, không cảnh báo. '
       'Ghi bù vì trigger cũ không theo dõi cột item_state.',
       jsonb_build_object('item_state', 'active'),
       jsonb_build_object('item_state', 'not_applicable'),
       'doi_chieu_sheet'
from public.vmp_plan_items p
where p.item_state = 'not_applicable'
  and not exists (
    select 1 from public.audit_logs a
    where a.record_id = p.id and 'item_state' = any(a.changed_fields));

-- =====================================================================
--  Sửa đường ghi tiến độ từ web — hai lỗi làm nút "Lưu" không ăn
--  ---------------------------------------------------------------------
--  LỖI 1 — OVERLOAD MƠ HỒ (nguyên nhân "không cập nhật được")
--
--  Đang tồn tại hai bản rpc_update_progress:
--      (p_validation_code, p_patch, p_reason, p_sheet_patch)
--      (p_validation_code, p_patch, p_reason, p_sheet_patch, p_expected_version)
--  Mọi tham số ngoài hai cái đầu đều có DEFAULT, nên một yêu cầu chỉ mang
--  {p_validation_code, p_patch} khớp CẢ HAI. PostgREST từ chối chọn:
--      PGRST203 "Could not choose the best candidate function between…"
--  Trên web nó hiện ra thành "Cập nhật tiến độ thất bại" cụt lủn.
--
--  Đã kiểm chứng bằng cách gọi thẳng REST (2026-07-31): thân 2 khoá và 3
--  khoá đều trả PGRST203, thân 4 khoá thì qua. Khớp đúng hiện trạng dữ
--  liệu: 461/461 hạng mục còn ở version 0 và audit_logs không có lấy một
--  dòng source='dashboard_rpc' — đường ghi từ web chưa từng chạy được.
--
--  Phía web đã được vá để luôn gửi đủ 5 khoá. Bỏ hẳn bản 4 tham số ở đây
--  để cái bẫy không quay lại lần sau: chỉ cần một chỗ gọi quên một tham
--  số là toàn bộ màn cập nhật chết câm.
--
--  LỖI 2 — KHÔNG XOÁ ĐƯỢC GIÁ TRỊ ĐÃ NHẬP SAI
--
--  Thân UPDATE dùng COALESCE(giá_trị_mới, giá_trị_cũ) cho mọi cột ngày,
--  nên nhập nhầm ngày rồi thì KHÔNG có cách nào xoá trắng lại: gửi null
--  lên cũng bị COALESCE giữ nguyên giá trị cũ. Với hồ sơ GMP thì đây là
--  lỗi thật — sửa sai là quyền phải có, và nó cũng đã được ghi lại kèm
--  lý do trong nhật ký kiểm toán.
--
--  Cách phân biệt "không đụng tới" và "xoá trắng": KHOÁ CÓ MẶT hay không
--  trong p_patch. Vắng khoá = giữ nguyên. Có khoá với giá trị null = xoá.
--  Dùng `p_patch ? 'ten_cot'` chứ không dùng `->>` vì `->>` trả NULL cho
--  cả hai trường hợp, đúng cái đang gây ra lỗi này.
--
--  Xoá trắng cũng phải nêu LÝ DO — bổ sung vào điều kiện v_requires_reason.
-- =====================================================================

BEGIN;

-- ---- LỖI 1: bỏ bản 4 tham số ----
-- Không dùng CASCADE: nếu còn thứ gì phụ thuộc thì phải biết, không im lặng xoá theo.
DROP FUNCTION IF EXISTS public.rpc_update_progress(TEXT, JSONB, TEXT, JSONB);

-- ---- LỖI 2: cho phép xoá trắng ngày ----
CREATE OR REPLACE FUNCTION public.rpc_update_progress(
  p_validation_code  TEXT,
  p_patch            JSONB,
  p_reason           TEXT    DEFAULT NULL,
  p_sheet_patch      JSONB   DEFAULT NULL,
  p_expected_version INTEGER DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item            vmp_plan_items%ROWTYPE;
  v_role            user_role;
  v_user_dept       TEXT;
  v_item_dept       TEXT;
  v_requires_reason BOOLEAN := FALSE;
  v_outbox_id       BIGINT := NULL;
BEGIN
  SELECT role, department INTO v_role, v_user_dept
  FROM profiles WHERE id = auth.uid();

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  END IF;

  SELECT * INTO v_item FROM vmp_plan_items
  WHERE validation_code = p_validation_code AND is_active = TRUE;

  IF v_item.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Không tìm thấy mã thẩm định: ' || p_validation_code);
  END IF;

  -- Khoá lạc quan: client gửi version kỳ vọng mà DB đã khác → có người sửa trước.
  IF p_expected_version IS NOT NULL AND v_item.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'version_conflict',
      'error', 'Hạng mục đã được người khác cập nhật trong lúc bạn đang sửa. Vui lòng tải lại dữ liệu và thử lại.',
      'current_version', v_item.version
    );
  END IF;

  IF v_role = 'viewer' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Viewer không có quyền cập nhật');
  END IF;

  IF v_role = 'department_user' THEN
    SELECT o.department INTO v_item_dept
    FROM vmp_objects o WHERE o.code = v_item.object_code;
    IF v_item_dept IS DISTINCT FROM v_user_dept THEN
      RETURN jsonb_build_object('ok', false, 'error',
        'Bạn chỉ được cập nhật hạng mục thuộc bộ phận của mình');
    END IF;
  END IF;

  IF COALESCE(v_item.item_state, 'active') <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Hạng mục đang ở trạng thái nghiệp vụ "' || v_item.item_state ||
      '" — không thể cập nhật tiến độ. Đổi sang "active" trước.');
  END IF;

  -- Có mặt khoá ngày (kể cả để xoá trắng) hoặc đánh dấu hoàn thành → phải nêu lý do.
  v_requires_reason := (p_patch->>'status_vmp'        = 'completed')
                    OR (p_patch->>'status_validation' = 'completed')
                    OR (p_patch->>'status_report'     = 'completed')
                    OR (p_patch->>'status_protocol'   = 'completed')
                    OR (p_patch ? 'actual_vmp_date')
                    OR (p_patch ? 'actual_validation_date')
                    OR (p_patch ? 'actual_report_date')
                    OR (p_patch ? 'actual_protocol_date');

  IF v_requires_reason AND (p_reason IS NULL OR trim(p_reason) = '') THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Cần nhập LÝ DO khi đánh dấu hoàn thành, sửa hoặc xoá ngày hoàn thành (yêu cầu GMP)');
  END IF;

  PERFORM set_config('app.audit_source', 'dashboard_rpc', true);
  PERFORM set_config('app.audit_reason', COALESCE(p_reason, ''), true);

  -- Vắng khoá = giữ nguyên. Có khoá = ghi đè, kể cả ghi đè bằng NULL.
  UPDATE vmp_plan_items SET
    status_protocol   = CASE WHEN p_patch ? 'status_protocol'
                             THEN (p_patch->>'status_protocol')::phase_status
                             ELSE status_protocol END,
    status_validation = CASE WHEN p_patch ? 'status_validation'
                             THEN (p_patch->>'status_validation')::phase_status
                             ELSE status_validation END,
    status_report     = CASE WHEN p_patch ? 'status_report'
                             THEN (p_patch->>'status_report')::phase_status
                             ELSE status_report END,
    status_vmp        = CASE WHEN p_patch ? 'status_vmp'
                             THEN (p_patch->>'status_vmp')::phase_status
                             ELSE status_vmp END,
    actual_protocol_date   = CASE WHEN p_patch ? 'actual_protocol_date'
                                  THEN (p_patch->>'actual_protocol_date')::DATE
                                  ELSE actual_protocol_date END,
    actual_validation_date = CASE WHEN p_patch ? 'actual_validation_date'
                                  THEN (p_patch->>'actual_validation_date')::DATE
                                  ELSE actual_validation_date END,
    actual_report_date     = CASE WHEN p_patch ? 'actual_report_date'
                                  THEN (p_patch->>'actual_report_date')::DATE
                                  ELSE actual_report_date END,
    actual_vmp_date        = CASE WHEN p_patch ? 'actual_vmp_date'
                                  THEN (p_patch->>'actual_vmp_date')::DATE
                                  ELSE actual_vmp_date END,
    scheduled_date         = CASE WHEN p_patch ? 'scheduled_date'
                                  THEN (p_patch->>'scheduled_date')::DATE
                                  ELSE scheduled_date END,
    version    = version + 1,
    updated_by = auth.uid(),
    updated_at = NOW()
  WHERE validation_code = p_validation_code;

  -- GHI NGƯỢC GOOGLE SHEET ĐÃ BỊ VÔ HIỆU HOÁ (2026-07-29) — giữ nguyên khối
  -- code sau `IF FALSE` để dễ khôi phục, đúng như bản đang chạy.
  IF FALSE AND p_sheet_patch IS NOT NULL AND p_sheet_patch <> '{}'::jsonb THEN
    INSERT INTO sheet_sync_outbox (validation_code, sheet_patch, status, next_attempt_at)
    VALUES (p_validation_code, p_sheet_patch, 'pending', NOW() + INTERVAL '30 seconds')
    ON CONFLICT (validation_code) WHERE status = 'pending'
    DO UPDATE SET sheet_patch     = sheet_sync_outbox.sheet_patch || EXCLUDED.sheet_patch,
                  next_attempt_at = NOW() + INTERVAL '30 seconds',
                  updated_at      = NOW()
    RETURNING id INTO v_outbox_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'validation_code', p_validation_code,
    'msg', 'Đã cập nhật thành công',
    'reason_logged', v_requires_reason,
    'outbox_id', v_outbox_id,
    'version', v_item.version + 1
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'rpc_update_progress lỗi (code=%, sqlstate=%): %',
      p_validation_code, SQLSTATE, SQLERRM;
    BEGIN
      INSERT INTO data_quality_issues (
        plan_item_id, object_code, issue_type, severity, message, detected_at
      ) VALUES (
        (SELECT id FROM vmp_plan_items WHERE validation_code = p_validation_code LIMIT 1),
        NULL, 'rpc_error', 'error',
        'rpc_update_progress(' || p_validation_code || '): ' || SQLERRM || ' [sqlstate=' || SQLSTATE || ']',
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_update_progress(TEXT, JSONB, TEXT, JSONB, INTEGER)
  TO authenticated, service_role;

COMMIT;

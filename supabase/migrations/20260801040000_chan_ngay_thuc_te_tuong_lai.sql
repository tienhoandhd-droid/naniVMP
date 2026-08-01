/* =====================================================================
 *  20260801040000 — Chặn ngày THỰC TẾ nằm ở tương lai (rpc_update_progress)
 *  ---------------------------------------------------------------------
 *  ALCOA+ chữ C — Contemporaneous: ghi nhận phải xảy ra ĐỒNG THỜI với
 *  việc làm. Một hạng mục "hoàn thành ngày 15/09/2026" ghi vào hôm
 *  01/08/2026 là ghi trước việc chưa xảy ra. Với hồ sơ thẩm định, đó là
 *  loại sai mà thanh tra chỉ cần một câu hỏi là lộ.
 *
 *  Trước đây KHÔNG có lớp nào chặn: ô nhập trên web để trống thuộc tính
 *  max nên chọn được ngày 2027, và RPC nhận bất kỳ ngày nào.
 *
 *  Web nay đã chặn ở hai chỗ (max của ô nhập + kiểm trước khi bấm Lưu),
 *  nhưng client thì luôn có thể bị bỏ qua — gọi thẳng RPC bằng curl là
 *  xong. Cho nên luật phải nằm ở ĐÂY mới là luật thật.
 *
 *  KHÔNG chặn `scheduled_date` (lịch thẩm định): đó là ngày HẸN, nằm ở
 *  tương lai mới đúng. Cũng không đụng tới các cột deadline.
 *
 *  Chỉ THÊM một khối kiểm vào đầu hàm; toàn bộ phần còn lại giữ nguyên.
 * ===================================================================== */

DO $$
DECLARE
  v_src  TEXT;
  v_moc  TEXT;
  v_them TEXT;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_update_progress';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy rpc_update_progress';
  END IF;

  IF position('NGAY_THUC_TE_TUONG_LAI' in v_src) > 0 THEN
    RAISE NOTICE 'Đã có lớp chặn — bỏ qua.';
    RETURN;
  END IF;

  -- Chèn NGAY TRƯỚC khối kiểm lý do, tức sau mọi kiểm về quyền.
  v_moc := '  -- Có mặt khoá ngày (kể cả để xoá trắng) hoặc đánh dấu hoàn thành → phải nêu lý do.';

  v_them := '
  -- NGAY_THUC_TE_TUONG_LAI — ALCOA+ chữ C (Contemporaneous).
  -- Ngày thực tế không thể nằm sau hôm nay: việc chưa làm thì không có
  -- ngày làm. KHÔNG áp cho scheduled_date (ngày hẹn, tương lai mới đúng).
  IF (p_patch->>''actual_protocol_date'')::date   > CURRENT_DATE
     OR (p_patch->>''actual_validation_date'')::date > CURRENT_DATE
     OR (p_patch->>''actual_report_date'')::date     > CURRENT_DATE
     OR (p_patch->>''actual_vmp_date'')::date        > CURRENT_DATE THEN
    RETURN jsonb_build_object(''ok'', false, ''code'', ''ngay_tuong_lai'', ''error'',
      ''Ngày hoàn thành thực tế không thể nằm ở tương lai (hôm nay là '' ||
      to_char(CURRENT_DATE, ''DD/MM/YYYY'') ||
      ''). ALCOA+ đòi ghi nhận đồng thời với việc làm.'');
  END IF;

' || v_moc;

  IF position(v_moc in v_src) = 0 THEN
    RAISE EXCEPTION 'Không tìm thấy mốc chèn — hàm đã đổi, dừng để không ghi đè nhầm';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.rpc_update_progress(
       p_validation_code text, p_patch jsonb, p_reason text DEFAULT NULL,
       p_sheet_patch jsonb DEFAULT NULL, p_expected_version integer DEFAULT NULL)
     RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L',
    replace(v_src, v_moc, v_them));
END $$;

-- Hậu kiểm: hàm phải chứa lớp chặn, và quyền phải giữ nguyên như cũ.
DO $$
BEGIN
  IF position('NGAY_THUC_TE_TUONG_LAI' in
      (SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='rpc_update_progress')) = 0 THEN
    RAISE EXCEPTION 'Chèn lớp chặn thất bại';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.rpc_update_progress(text,jsonb,text,jsonb,integer) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.rpc_update_progress(text,jsonb,text,jsonb,integer) TO authenticated, service_role;

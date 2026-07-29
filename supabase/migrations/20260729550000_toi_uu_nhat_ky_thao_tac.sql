-- =====================================================================
-- Nhật ký thao tác: bỏ đếm toàn bảng mỗi lần mở trang + chỉ mục cho lọc
--
-- audit_logs đang 100.400 dòng / 158 MB và còn tăng ~2.700 dòng/ngày.
-- rpc_get_audit_logs đếm count(*) TOÀN BẢNG cho mỗi lần mở trang, chỉ để
-- biết chia bao nhiêu trang: pg_stat_statements ghi nhận trung bình
-- 1.845 ms/lần (nguội), 17 ms (nóng). Con số đó không cần chính xác.
--
-- Khi có lọc thì vẫn đếm thật, vì tập nhỏ và người dùng cần con số đúng.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rpc_get_audit_logs(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0, p_table_name text DEFAULT NULL::text, p_action text DEFAULT NULL::text, p_user_email text DEFAULT NULL::text, p_record_id text DEFAULT NULL::text, p_from_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $fn$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    -- Không lọc gì thì KHÔNG đếm thật: count(*) trên 100k dòng / 158MB tốn
    -- ~1,8 giây mỗi lần mở trang khi bộ nhớ đệm nguội, mà con số đó chỉ dùng
    -- để chia trang. Lấy ước lượng của Postgres, kèm cờ để giao diện ghi "≈".
    'total', CASE WHEN p_table_name IS NULL AND p_action IS NULL AND p_user_email IS NULL
                   AND p_record_id IS NULL AND p_from_date IS NULL AND p_to_date IS NULL
      THEN greatest((SELECT reltuples::bigint FROM pg_class WHERE oid = 'public.audit_logs'::regclass), 0)
      ELSE (
      SELECT COUNT(*) FROM audit_logs
      WHERE (p_table_name IS NULL OR table_name = p_table_name)
        AND (p_action IS NULL OR action::TEXT = p_action)
        AND (p_user_email IS NULL OR user_email ILIKE '%' || p_user_email || '%')
        AND (p_record_id IS NULL OR record_id = p_record_id)
        AND (p_from_date IS NULL OR created_at >= p_from_date)
        AND (p_to_date IS NULL OR created_at <= p_to_date)
    ) END,
    'total_uoc_luong', (p_table_name IS NULL AND p_action IS NULL AND p_user_email IS NULL
                        AND p_record_id IS NULL AND p_from_date IS NULL AND p_to_date IS NULL),
    'logs', (
      SELECT COALESCE(jsonb_agg(row_to_json(l.*) ORDER BY l.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, user_email, action::TEXT, table_name, record_id,
               old_data, new_data, change_reason, source, created_at
        FROM audit_logs
        WHERE (p_table_name IS NULL OR table_name = p_table_name)
          AND (p_action IS NULL OR action::TEXT = p_action)
          AND (p_user_email IS NULL OR user_email ILIKE '%' || p_user_email || '%')
          AND (p_record_id IS NULL OR record_id = p_record_id)
          AND (p_from_date IS NULL OR created_at >= p_from_date)
          AND (p_to_date IS NULL OR created_at <= p_to_date)
        ORDER BY created_at DESC
        LIMIT p_limit OFFSET p_offset
      ) l
    )
  ) INTO result;

  RETURN result;
END;
$fn$;


-- Lọc theo bảng rồi xếp theo thời gian là đường dùng nhiều nhất của trang
-- Audit log; hai chỉ mục rời bắt Postgres sắp xếp lại 50k dòng mỗi lần.
create index if not exists idx_audit_table_time
  on public.audit_logs (table_name, created_at desc);

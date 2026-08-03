-- =====================================================================
--  Bỏ overload cũ của rpc_set_user_role + chặn overload rpc_* tái diễn
--  ---------------------------------------------------------------------
--  ĐÂY LÀ LẦN THỨ HAI cùng một cái bẫy làm chết một đường ghi từ web.
--
--  Lần 1 (31/07, migration 20260731280000): rpc_update_progress có hai bản
--  4 và 5 tham số. Mọi tham số ngoài hai cái đầu đều có DEFAULT nên một
--  yêu cầu thiếu tham số khớp CẢ HAI, PostgREST từ chối chọn và trả
--  PGRST203. Hậu quả: 461/461 hạng mục đứng ở version 0 — đường ghi tiến
--  độ từ web CHƯA TỪNG chạy được, mà không ai biết vì trên màn chỉ hiện
--  "Cập nhật tiến độ thất bại" cụt lủn.
--
--  Lần 2 (hôm nay, 03/08): y hệt, lần này ở rpc_set_user_role —
--      (p_user_id, p_role, p_department, p_reason)
--      (p_user_id, p_role, p_department, p_reason, p_pham_vi)
--  Bản 5 tham số có 2 DEFAULT, nên thân 3 hoặc 4 khoá khớp cả hai.
--  Kiểm chứng bằng REST hôm nay với vé đăng nhập thật:
--      thân 3 khoá → PGRST203
--      thân 4 khoá → PGRST203
--      thân 5 khoá → vào được thân hàm ("Chỉ admin được đổi phân quyền")
--  Frontend deploy tới sáng nay gửi đúng 4 khoá ⇒ nút "Lưu" ở màn Phân
--  quyền đã chết câm trên production. Nó chỉ hết chết vì bản deploy sáng
--  nay tình cờ mang theo đoạn gửi đủ 5 khoá — tức là may, không phải sửa.
--
--  Sửa một lần thì lần sau vẫn tái diễn: cái bẫy không nằm ở một hàm cụ
--  thể mà ở THÓI QUEN thêm tham số bằng cách tạo thêm một bản hàm mới.
--  Nên ngoài việc bỏ bản cũ, migration này dựng một chốt chặn ở tầng
--  database: hễ có hàm public.rpc_* thứ hai trùng tên là DDL bị chặn ngay
--  lúc chạy migration, kèm chỉ dẫn phải làm gì.
--
--  Vì sao chặn ở database chứ không chỉ ghi vào tài liệu: hai lần trước
--  đều có tài liệu, và cả hai lần đều lọt. Lỗi này không lộ ra ở
--  typecheck, không lộ ở build, không lộ ở test giao diện — nó chỉ hiện
--  ra khi người dùng thật bấm nút thật, và hiện dưới dạng một câu báo lỗi
--  chung chung. Chốt duy nhất bắt được nó sớm phải nằm ở chỗ tạo ra nó.
-- =====================================================================

BEGIN;

-- ---- 1. Bỏ bản 4 tham số ----
-- Không CASCADE: còn thứ gì phụ thuộc thì phải biết, không im lặng xoá theo.
DROP FUNCTION IF EXISTS public.rpc_set_user_role(UUID, TEXT, TEXT, TEXT);

-- ---- 2. Chốt chặn: cấm hai hàm public.rpc_* trùng tên ----
CREATE OR REPLACE FUNCTION public.chan_overload_rpc()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
DECLARE
  r        RECORD;
  v_ten    TEXT;
  v_so     INT;
  v_chu_ky TEXT;
BEGIN
  FOR r IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE FUNCTION', 'ALTER FUNCTION')
  LOOP
    -- Chỉ soi hàm rpc_* trong schema public — đó là bề mặt PostgREST phơi
    -- ra ngoài, cũng là chỗ duy nhất overload gây hại kiểu này.
    SELECT p.proname INTO v_ten
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.oid = r.objid
      AND n.nspname = 'public'
      AND p.proname LIKE 'rpc\_%';

    CONTINUE WHEN v_ten IS NULL;

    SELECT count(*),
           string_agg('  · ' || p.proname || '(' ||
                      pg_get_function_identity_arguments(p.oid) || ')',
                      E'\n' ORDER BY p.pronargs)
      INTO v_so, v_chu_ky
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_ten;

    IF v_so > 1 THEN
      RAISE EXCEPTION
        'Có % bản của public.%() — PostgREST sẽ trả PGRST203 và đường gọi từ web chết câm.',
        v_so, v_ten
        USING DETAIL = 'Các bản đang tồn tại:' || E'\n' || v_chu_ky,
              HINT   = 'Thêm tham số thì SỬA hàm cũ (CREATE OR REPLACE giữ nguyên chữ ký) '
                    || 'hoặc DROP FUNCTION bản cũ ngay trong migration này. '
                    || 'Đừng để hai bản cùng tồn tại: tham số có DEFAULT khiến một yêu cầu '
                    || 'thiếu tham số khớp cả hai, PostgREST từ chối chọn. '
                    || 'Thật sự cần overload thì gỡ chốt: DROP EVENT TRIGGER chan_overload_rpc_tg.';
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.chan_overload_rpc() IS
  'Chặn tạo hàm public.rpc_* trùng tên (overload) — nguồn của PGRST203. Xem migration 20260803050000.';

DROP EVENT TRIGGER IF EXISTS chan_overload_rpc_tg;
CREATE EVENT TRIGGER chan_overload_rpc_tg
  ON ddl_command_end
  EXECUTE FUNCTION public.chan_overload_rpc();

-- ---- 3. Chốt hiện trạng: không được còn overload nào ----
DO $$
DECLARE v_con TEXT;
BEGIN
  SELECT string_agg(proname, ', ') INTO v_con
  FROM (
    SELECT p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'rpc\_%'
    GROUP BY p.proname HAVING count(*) > 1
  ) t;

  IF v_con IS NOT NULL THEN
    RAISE EXCEPTION 'Vẫn còn hàm rpc_* bị overload: %. Dọn hết rồi mới áp migration này.', v_con;
  END IF;
END;
$$;

COMMIT;

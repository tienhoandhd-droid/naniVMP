/* =====================================================================
 *  20260801030000 — Thu quyền GHI và TRUNCATE khỏi anon / authenticated
 *  ---------------------------------------------------------------------
 *  LỖ HỔNG ĐÃ CHỨNG MINH ĐƯỢC (2026-08-01)
 *
 *  Supabase đặt sẵn ALTER DEFAULT PRIVILEGES cấp `arwdDxtm` cho anon và
 *  authenticated trên MỌI bảng tạo mới. Trong đó `D` là TRUNCATE.
 *
 *  RLS bảo vệ SELECT / INSERT / UPDATE / DELETE — nhưng KHÔNG áp dụng cho
 *  TRUNCATE. Đây là điều PostgreSQL nói rõ trong tài liệu và là chỗ rất
 *  dễ bỏ sót: bật RLS xong thì tưởng đã an toàn.
 *
 *  Hệ quả đo được: chạy `set role anon; truncate audit_logs;` — LỆNH CHẠY
 *  THÀNH CÔNG. Nghĩa là bất kỳ ai cầm khoá anon đều xoá sạch được toàn bộ
 *  nhật ký ALCOA+. Mà khoá anon nằm sẵn trong gói JavaScript của một repo
 *  GitHub ĐỂ CÔNG KHAI — tức là ai cũng có.
 *  Với hồ sơ GMP, mất audit trail là mất thứ không dựng lại được.
 *
 *  36 bảng đang ở tình trạng đó, trong đó có audit_logs, profiles,
 *  system_config.
 *
 *  CÁCH SỬA
 *  1. Thu TRUNCATE / REFERENCES / TRIGGER khỏi cả hai vai — client không
 *     bao giờ cần ba quyền này.
 *  2. Thu INSERT / UPDATE / DELETE khỏi anon — mọi đường ghi của app đều
 *     đi qua RPC SECURITY DEFINER (chạy bằng quyền chủ hàm), nên client
 *     chưa đăng nhập không cần quyền ghi thẳng nào.
 *  3. Giữ SELECT + ghi cho authenticated (RLS vẫn lọc theo từng dòng) —
 *     app có đọc thẳng một số bảng danh mục sau khi đăng nhập.
 *  4. Đổi QUYỀN MẶC ĐỊNH để bảng tạo sau này không lặp lại. Đây mới là
 *     phần chữa gốc: không có bước này thì migration sau tạo bảng mới là
 *     lỗ hổng mở lại y nguyên.
 *  5. Hậu kiểm tự chặn migration nếu còn sót.
 * ===================================================================== */

-- 1 · Thu ba quyền client không bao giờ cần, trên MỌI bảng hiện có.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    -- Không chỉ bảng thường: view, bảng phân mảnh, view thực thể và bảng
    -- ngoài cũng nhận quyền mặc định y hệt. Bỏ sót chúng thì hậu kiểm báo
    -- còn sót và migration dừng — đúng như đã xảy ra ở lần chạy đầu.
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f')
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated, public',
      r.relname);
    -- 2 · anon không được ghi thẳng vào bất kỳ bảng nào.
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon',
      r.relname);
  END LOOP;
END $$;

-- 3 · anon chỉ còn ĐỌC, và cũng chỉ ở những bảng RLS đã có policy công khai.
--     Không thu SELECT hàng loạt ở đây: màn đăng nhập và một vài truy vấn
--     chạy trước khi có phiên. Thu SELECT là việc riêng, cần đo trước.

-- 4 · Quyền mặc định cho bảng TẠO MỚI — chữa gốc.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE ON TABLES FROM anon;
/* GIỚI HẠN CÒN LẠI, ghi ra để không ai tưởng đã kín:
 * Supabase còn một bộ quyền mặc định thứ hai thuộc vai `supabase_admin`.
 * Vai `postgres` KHÔNG đổi được bộ đó ("permission denied to change default
 * privileges"). Nghĩa là bảng nào được tạo BỞI supabase_admin — thường là
 * bảng tạo qua bảng điều khiển Supabase, không phải qua migration — vẫn sẽ
 * nhận lại quyền TRUNCATE cho anon.
 * Cách bù: chạy lại đúng migration này sau mỗi lần thêm bảng bằng bảng điều
 * khiển, và giữ phần hậu kiểm bên dưới để phát hiện sớm.
 * Tạo bảng bằng migration (đường đi chuẩn của dự án này) thì không dính. */

-- 5 · Hậu kiểm: còn sót một quyền nào là migration hỏng, không cho đi tiếp.
DO $$
DECLARE v_sot INT;
BEGIN
  SELECT count(*) INTO v_sot
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND ((grantee IN ('anon','authenticated','PUBLIC')
          AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER'))
      OR (grantee = 'anon' AND privilege_type IN ('INSERT','UPDATE','DELETE')));
  IF v_sot > 0 THEN
    RAISE EXCEPTION 'Còn % quyền chưa thu được — migration dừng để không báo an toàn giả', v_sot;
  END IF;
END $$;

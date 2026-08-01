/* =====================================================================
 *  20260801050000 — rpc_set_user_role: sửa vai trò / bộ phận từ web
 *  ---------------------------------------------------------------------
 *  Trước migration này KHÔNG có đường nào sửa vai trò từ giao diện — phải
 *  vào bảng điều khiển Supabase gõ SQL. Hệ quả: 2/3 tài khoản đang để
 *  trống bộ phận, và không ai biết vì không có màn nào hiện ra.
 *
 *  BA CHỐT AN TOÀN, mỗi chốt chặn một cách tự khoá mình ra ngoài:
 *
 *  1. Chỉ admin gọi được. Không mở cho qa_manager: đổi vai trò là đổi
 *     ranh giới quyền, không phải việc vận hành hằng ngày.
 *  2. Không tự hạ vai của CHÍNH MÌNH. Người quản trị bấm nhầm một cái là
 *     mất quyền quản trị, và không còn đường nào lấy lại từ giao diện.
 *  3. Luôn còn ÍT NHẤT MỘT admin đang hoạt động. Không có chốt này thì
 *     hai admin hạ vai nhau là hệ thống không còn ai quản trị được.
 *
 *  Vai department_user mà thiếu bộ phận là vô nghĩa — luật so bộ phận của
 *  hạng mục với bộ phận của người, thiếu vế sau thì họ không sửa được
 *  hạng mục nào dù nhìn thấy hết. Nên bắt buộc có bộ phận cho vai đó.
 * ===================================================================== */
CREATE OR REPLACE FUNCTION public.rpc_set_user_role(
  p_user_id uuid,
  p_role text,
  p_department text DEFAULT NULL,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me      uuid := auth.uid();
  v_my_role user_role;
  v_old     profiles%ROWTYPE;
  v_so_admin INT;
BEGIN
  SELECT role INTO v_my_role FROM profiles WHERE id = v_me;
  IF v_my_role IS DISTINCT FROM 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Chỉ quản trị viên mới đổi được vai trò người dùng.');
  END IF;

  SELECT * INTO v_old FROM profiles WHERE id = p_user_id;
  IF v_old.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Không tìm thấy người dùng.');
  END IF;

  IF p_role NOT IN ('admin','qa_manager','department_user','viewer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Vai trò không hợp lệ: ' || p_role);
  END IF;

  -- Chốt 2: không tự hạ vai của chính mình.
  IF p_user_id = v_me AND p_role <> 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Không tự hạ vai của chính mình được — nhờ một quản trị viên khác làm, '
      || 'nếu không sẽ không còn đường lấy lại quyền từ giao diện.');
  END IF;

  -- Chốt 3: luôn còn ít nhất một admin đang hoạt động.
  IF v_old.role = 'admin' AND p_role <> 'admin' THEN
    SELECT count(*) INTO v_so_admin FROM profiles
    WHERE role = 'admin' AND COALESCE(is_active, true) AND id <> p_user_id;
    IF v_so_admin = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error',
        'Đây là quản trị viên hoạt động cuối cùng — hạ vai là hệ thống không còn ai quản trị được.');
    END IF;
  END IF;

  -- Vai theo bộ phận thì BẮT BUỘC có bộ phận, nếu không họ không sửa được gì.
  IF p_role = 'department_user' AND COALESCE(trim(p_department), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Vai department_user phải kèm bộ phận — luật so bộ phận của hạng mục với '
      || 'bộ phận của người, thiếu vế sau thì họ không sửa được hạng mục nào.');
  END IF;

  PERFORM set_config('app.audit_source', 'dashboard_rpc', true);
  PERFORM set_config('app.audit_reason', COALESCE(p_reason, 'Đổi vai trò từ màn Phân quyền'), true);

  UPDATE profiles
     SET role = p_role::user_role,
         department = NULLIF(trim(COALESCE(p_department, '')), ''),
         updated_at = now()
   WHERE id = p_user_id;

  INSERT INTO audit_logs (user_id, action, table_name, record_id,
                          old_data, new_data, change_reason, source, changed_fields)
  VALUES (v_me, 'UPDATE', 'profiles', p_user_id::text,
          jsonb_build_object('role', v_old.role, 'department', v_old.department),
          jsonb_build_object('role', p_role, 'department', NULLIF(trim(COALESCE(p_department,'')),'')),
          COALESCE(p_reason, 'Đổi vai trò từ màn Phân quyền'),
          'dashboard_rpc', ARRAY['role','department']);

  RETURN jsonb_build_object('ok', true, 'msg', 'Đã cập nhật phân quyền',
                            'role', p_role, 'department', p_department);
END $$;

REVOKE EXECUTE ON FUNCTION public.rpc_set_user_role(uuid,text,text,text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.rpc_set_user_role(uuid,text,text,text) TO authenticated, service_role;

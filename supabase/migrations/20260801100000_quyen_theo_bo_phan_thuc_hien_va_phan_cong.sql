/* =====================================================================
 *  20260801100000 — Quyền sửa theo BỘ PHẬN THỰC HIỆN và theo PHÂN CÔNG
 *  ---------------------------------------------------------------------
 *  Luật cũ so sai chiều. Nó lấy `vmp_objects.department` — đó là BỘ PHẬN
 *  QUẢN LÝ đối tượng, không phải bộ phận đi làm thẩm định. Trong dữ liệu
 *  thật hai chiều này lệch nhau ở 150/448 hạng mục:
 *
 *      quản lý → thực hiện     số hạng mục
 *      xsx     → qa                 107
 *      cd      → qa                  31
 *      qc      → qa                  11
 *      qc      → rd                   1
 *      (và 20 hạng mục xsx do bốn bộ phận cùng thực hiện)
 *
 *  Nghĩa là: người XSX đi thẩm định một thiết bị do QA quản lý, nhập kết
 *  quả và báo cáo — nhưng luật cũ hỏi "bộ phận QUẢN LÝ có phải của bạn
 *  không" rồi từ chối. Người làm thật lại là người bị chặn.
 *
 *  Migration này làm hai việc:
 *
 *  1 · Mức "bo_phan" nay so với CẢ HAI chiều: bộ phận quản lý HOẶC bộ phận
 *      thực hiện. Ai dính tới hạng mục ở một trong hai vai đều sửa được.
 *
 *  2 · Thêm mức "phan_cong" — mịn hơn một bậc: chỉ sửa được hạng mục mà
 *      ma trận phân công (vmp_assignment_matrix) có tích đúng tên mình,
 *      đúng loại thẩm định, đúng line. Đây là câu "bộ phận thực hiện lại
 *      chia nhỏ theo người: ai phụ trách line nào".
 *
 *      Dòng tích ở line '*' nghĩa là mọi line của bộ phận.
 *
 *  ---------------------------------------------------------------------
 *  MỘT CẢNH BÁO PHẢI GHI RA ĐÂY, KHÔNG ĐƯỢC GIẤU:
 *
 *  Cột "Nhân sự bộ phận khác (Bộ phận khác nhập)" trong Sheet — cột lẽ ra
 *  cho biết ai bên bộ phận thực hiện phụ trách hạng mục — đang TRỐNG cả
 *  461/461 dòng. Chưa ai từng điền.
 *
 *  Nên mức "phan_cong" KHÔNG lấy được dữ liệu từ đó. Nó lấy từ ma trận D
 *  trên web, thứ phải tích tay. Bật "phan_cong" khi ma trận còn trống thì
 *  vai đó không sửa được hạng mục nào — đúng luật, nhưng không ai muốn.
 *  Vì vậy rpc_set_role_permission chặn luôn: chưa có dòng phân công nào
 *  thì không bật được mức này.
 * ===================================================================== */

/* Mở thêm giá trị 'phan_cong' cho cột muc. */
alter table public.vmp_role_permissions
  drop constraint if exists vmp_role_permissions_muc_check;
alter table public.vmp_role_permissions
  add constraint vmp_role_permissions_muc_check
  check (muc in ('co', 'bo_phan', 'phan_cong', 'khong'));

/* ---------------------------------------------------------------------
 *  Hàm kiểm quyền trên MỘT hạng mục. Trả về chuỗi rỗng nếu được sửa,
 *  ngược lại trả về câu giải thích cho người dùng.
 *
 *  Tách thành hàm riêng thay vì viết thẳng vào rpc_update_progress vì hai
 *  lý do: (a) rpc_set_item_state và các hàm sau này dùng lại được đúng
 *  một luật, không phải chép; (b) kiểm thử được độc lập — gọi hàm này với
 *  từng người, từng hạng mục là biết ngay ai sửa được gì, không cần thử
 *  ghi thật.
 * ------------------------------------------------------------------- */
create or replace function public.ly_do_khong_sua_duoc(
  p_validation_code text, p_uid uuid
) returns text
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_role    text;
  v_dept    text;
  v_ten     text;
  v_muc     text;
  v_ql      text;
  v_th      text[];
  v_loai    text;
  v_line    text;
begin
  select p.role::text, p.department, p.full_name
    into v_role, v_dept, v_ten
  from profiles p where p.id = p_uid;
  if v_role is null then return 'Không xác định được người dùng'; end if;

  v_muc := public.muc_quyen('update_progress', v_role);
  if v_muc = 'khong' then
    return 'Vai ' || v_role || ' không có quyền cập nhật tiến độ';
  end if;
  if v_muc = 'co' then return ''; end if;

  select o.department, o.line, i.execution_departments, i.validation_type
    into v_ql, v_line, v_th, v_loai
  from vmp_plan_items i
  join vmp_objects o on o.code = i.object_code
  where i.validation_code = p_validation_code;
  if not found then return 'Không tìm thấy mã thẩm định: ' || p_validation_code; end if;

  if v_muc = 'bo_phan' then
    if v_dept is null then
      return 'Tài khoản của bạn chưa được gán bộ phận — chưa sửa được hạng mục nào. '
        || 'Người quản trị gán ở màn Phân quyền, ma trận B.';
    end if;
    /* CẢ HAI chiều: quản lý hoặc thực hiện. Chỉ so chiều quản lý là chặn
       đúng người đang đi làm thẩm định. */
    if v_dept = v_ql or v_dept = any(coalesce(v_th, array[]::text[])) then
      return '';
    end if;
    return 'Hạng mục này do bộ phận ' || coalesce(v_ql, '?')
      || ' quản lý và bộ phận ' || coalesce(array_to_string(v_th, ', '), '?')
      || ' thực hiện — bạn thuộc bộ phận ' || v_dept || ' nên không sửa được.';
  end if;

  if v_muc = 'phan_cong' then
    if v_ten is null or btrim(v_ten) = '' then
      return 'Hồ sơ của bạn chưa có họ tên nên không khớp được với ma trận phân công.';
    end if;
    if exists (
      select 1 from vmp_assignment_matrix m
      where lower(btrim(m.staff_name)) = lower(btrim(v_ten))
        and m.is_active
        and m.validation_type = v_loai
        and (m.line = '*' or m.line = coalesce(nullif(btrim(v_line), ''), '*'))
    ) then
      return '';
    end if;
    return 'Bạn chưa được phân công loại ' || coalesce(v_loai, '?')
      || ' ở line ' || coalesce(nullif(btrim(v_line), ''), '(không chia line)')
      || '. Người quản trị tích ô ở màn Phân quyền, ma trận D.';
  end if;

  return 'Mức quyền không hiểu được: ' || v_muc;
end;
$$;

grant execute on function public.ly_do_khong_sua_duoc(text, uuid) to authenticated;

/* ---------------------------------------------------------------------
 *  Thay đúng khối kiểm bộ phận trong rpc_update_progress bằng lời gọi
 *  hàm trên. Giữ nguyên phần còn lại từng chữ.
 * ------------------------------------------------------------------- */
do $ghep$
declare
  v_def text := pg_get_functiondef('public.rpc_update_progress(text,jsonb,text,jsonb,integer)'::regprocedure);
  v_cu  text := $cu$  IF public.muc_quyen('update_progress', v_role::text) = 'bo_phan' THEN
    SELECT o.department INTO v_item_dept
    FROM vmp_objects o WHERE o.code = v_item.object_code;
    IF v_item_dept IS DISTINCT FROM v_user_dept THEN
      RETURN jsonb_build_object('ok', false, 'error',
        'Bạn chỉ được cập nhật hạng mục thuộc bộ phận của mình');
    END IF;
  END IF;$cu$;
  v_moi text := $moi$  v_item_dept := public.ly_do_khong_sua_duoc(p_validation_code, auth.uid());
  IF v_item_dept <> '' THEN
    RETURN jsonb_build_object('ok', false, 'error', v_item_dept);
  END IF;$moi$;
  v_ra text;
begin
  if position(v_cu in v_def) = 0 then
    raise exception 'Không tìm thấy khối kiểm bộ phận cũ trong rpc_update_progress — có ai đã sửa hàm này';
  end if;
  v_ra := replace(v_def, v_cu, v_moi);
  execute v_ra;
end
$ghep$;

/* ---------------------------------------------------------------------
 *  rpc_set_role_permission: cho phép mức 'phan_cong' ở update_progress,
 *  nhưng chỉ khi ma trận phân công đã có dữ liệu.
 * ------------------------------------------------------------------- */
create or replace function public.rpc_set_role_permission(
  p_hanh_dong text, p_vai_tro text, p_muc text
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_toi uuid := auth.uid();
  v_vai text;
  v_cu  text;
  v_so_phan_cong int;
  /* Chỉ hành động nào có vế so bộ phận / phân công trong luật mới nhận
     hai mức mịn này. Hiện chỉ rpc_update_progress đi qua
     ly_do_khong_sua_duoc. */
  v_co_ve_min text[] := array['update_progress'];
begin
  select role::text into v_vai from profiles where id = v_toi;
  if v_vai is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('admin_users', v_vai) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin được sửa luật phân quyền');
  end if;
  if p_muc not in ('co', 'bo_phan', 'phan_cong', 'khong') then
    return jsonb_build_object('ok', false, 'error', 'Mức quyền không hợp lệ');
  end if;
  if not exists (select 1 from public.vmp_role_permissions
                  where hanh_dong = p_hanh_dong and vai_tro::text = p_vai_tro) then
    return jsonb_build_object('ok', false, 'error',
      'Không có ô này trong ma trận: ' || coalesce(p_hanh_dong, '∅') || ' × ' || coalesce(p_vai_tro, '∅'));
  end if;

  if p_hanh_dong = 'admin_users' and p_vai_tro = 'admin' and p_muc <> 'co' then
    return jsonb_build_object('ok', false, 'error',
      'Không hạ được quyền quản trị của vai admin — hạ xong sẽ không còn ai mở lại được.');
  end if;

  if p_muc in ('bo_phan', 'phan_cong') and not (p_hanh_dong = any(v_co_ve_min)) then
    return jsonb_build_object('ok', false, 'error',
      'Hành động này chưa có vế so bộ phận trong luật, nên chỉ đặt được Được hoặc Không. '
      || 'Đặt mức hạn chế ở đây sẽ thành mở toàn quyền mà màn hình lại ghi là hạn chế.');
  end if;

  /* Bật "theo phân công" khi ma trận còn trống = khoá sạch vai đó mà
     người bật không hề biết. Chặn trước, và nói rõ phải làm gì. */
  if p_muc = 'phan_cong' then
    select count(*) into v_so_phan_cong from public.vmp_assignment_matrix where is_active;
    if v_so_phan_cong = 0 then
      return jsonb_build_object('ok', false, 'error',
        'Ma trận phân công (bảng D) chưa có ô nào được tích. Bật mức này bây giờ thì vai '
        || p_vai_tro || ' sẽ không sửa được hạng mục nào. Tích phân công trước rồi quay lại.');
    end if;
  end if;

  select muc into v_cu from public.vmp_role_permissions
   where hanh_dong = p_hanh_dong and vai_tro::text = p_vai_tro;

  update public.vmp_role_permissions
     set muc = p_muc, updated_by = v_toi, updated_at = now()
   where hanh_dong = p_hanh_dong and vai_tro::text = p_vai_tro;

  insert into audit_logs (user_id, action, table_name, record_id,
                          old_data, new_data, change_reason, source, changed_fields)
  values (v_toi, 'CONFIG_CHANGE', 'vmp_role_permissions',
          p_hanh_dong || '×' || p_vai_tro,
          jsonb_build_object('muc', v_cu), jsonb_build_object('muc', p_muc),
          'Sửa ma trận vai trò × hành động từ màn Phân quyền',
          'dashboard_rpc', array['muc']);

  return jsonb_build_object('ok', true, 'msg', 'Đã lưu luật phân quyền', 'muc', p_muc);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;

revoke all on function public.rpc_set_role_permission(text, text, text) from public, anon;
grant execute on function public.rpc_set_role_permission(text, text, text) to authenticated;

do $kiem$
begin
  if pg_get_functiondef('public.rpc_update_progress(text,jsonb,text,jsonb,integer)'::regprocedure)
     ~ 'v_item_dept IS DISTINCT FROM v_user_dept' then
    raise exception 'rpc_update_progress vẫn còn phép so cũ chỉ theo bộ phận quản lý';
  end if;
  raise notice 'Tự kiểm đạt: rpc_update_progress nay hỏi ly_do_khong_sua_duoc';
end
$kiem$;

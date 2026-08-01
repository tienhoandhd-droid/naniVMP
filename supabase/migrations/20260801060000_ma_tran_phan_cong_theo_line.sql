/* =====================================================================
 *  20260801060000 — Ma trận phân công: ai làm loại thẩm định nào, ở line nào
 *  ---------------------------------------------------------------------
 *  Trước migration này, việc "ai làm cái gì" nằm ở HAI chỗ và cả hai đều
 *  không nói được câu người ta cần:
 *
 *   · vmp_assignment_rules — luật TỰ ĐỘNG gán chủ sở hữu khi sinh
 *     timeline (khớp theo regex tên, theo khu vực). Nó trả lời "máy nên
 *     gán cho ai", không trả lời "người này được phân công những gì".
 *   · vmp_plan_items.owner_name — kết quả sau khi gán, từng hạng mục một.
 *     Muốn biết một người phụ trách những loại thẩm định nào thì phải
 *     tự đi gom 448 dòng.
 *
 *  Bảng này là DIỆN PHÂN CÔNG do người khai, ba chiều:
 *      nhân viên × loại thẩm định × line
 *  Nó không thay hai chỗ trên; nó là cái mà con người tích chọn và đọc
 *  được, còn luật tự động vẫn chạy như cũ.
 *
 *  Vì sao line là một CỘT chứ không phải một bảng con: một người có thể
 *  làm PQ ở line Nang mềm nhưng không làm PQ ở BFS — đó là chuyện có thật
 *  ở xưởng. Nếu chỉ có (người × loại) thì không diễn đạt được, mà diễn
 *  đạt sai còn tệ hơn không có bảng.
 *
 *  line = '*' nghĩa là MỌI LINE của bộ phận. Các bộ phận không chia line
 *  (QA, QC, RD, Cơ điện, Kho — dữ liệu thật cho thấy chỉ XSX có line) sẽ
 *  chỉ dùng '*'. Dùng một ký tự quy ước thay cho NULL để khoá UNIQUE hoạt
 *  động được — trong Postgres, NULL không bằng NULL nên hai dòng cùng
 *  (người, loại, NULL) vẫn chèn được cả hai.
 *
 *  vai_tro:  'thuc_hien' — người trực tiếp làm
 *            'ho_tro'    — người phối hợp / hỗ trợ
 *  Không có ô nào nghĩa là không tham gia. Hai bậc là đủ: thêm bậc thứ ba
 *  ("được thông báo") thì bảng đầy dấu mà không ai dùng tới.
 * ===================================================================== */

create table if not exists public.vmp_assignment_matrix (
  id              uuid primary key default gen_random_uuid(),
  staff_name      text not null,
  department      text not null,
  validation_type text not null,
  line            text not null default '*',
  vai_tro         text not null default 'thuc_hien'
                    check (vai_tro in ('thuc_hien', 'ho_tro')),
  note            text,
  is_active       boolean not null default true,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

/* Một người · một loại · một line chỉ có ĐÚNG MỘT ô. Không cho hai dòng
   cùng toạ độ: nếu có, giao diện sẽ hiện một dòng còn dòng kia âm thầm
   quyết định kết quả — kiểu sai không ai tìm ra. */
create unique index if not exists vmp_assignment_matrix_o
  on public.vmp_assignment_matrix (staff_name, validation_type, line);

create index if not exists vmp_assignment_matrix_bo_phan
  on public.vmp_assignment_matrix (department, validation_type);

drop trigger if exists set_updated_at on public.vmp_assignment_matrix;
create trigger set_updated_at before update on public.vmp_assignment_matrix
  for each row execute function trigger_set_updated_at();

alter table public.vmp_assignment_matrix enable row level security;

drop policy if exists assignment_matrix_select on public.vmp_assignment_matrix;
create policy assignment_matrix_select on public.vmp_assignment_matrix
  for select to authenticated using (true);
/* Không có policy ghi: mọi thay đổi đi qua RPC bên dưới, để một chỗ duy
   nhất giữ luật "ai được sửa" và ghi audit. Giống các bảng danh mục khác. */

revoke all on public.vmp_assignment_matrix from anon;
grant select on public.vmp_assignment_matrix to authenticated;

/* ---------------------------------------------------------------------
 *  rpc_set_assignment — tích / bỏ tích một ô của ma trận
 *  p_vai_tro = '' (hoặc null) nghĩa là BỎ TÍCH: xoá hẳn dòng thay vì đặt
 *  is_active=false, để khoá UNIQUE không bị dòng chết chiếm chỗ.
 * ------------------------------------------------------------------- */
create or replace function public.rpc_set_assignment(
  p_staff_name      text,
  p_department      text,
  p_validation_type text,
  p_line            text,
  p_vai_tro         text
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_role text;
  v_ten  text := nullif(btrim(p_staff_name), '');
  v_bp   text := nullif(btrim(p_department), '');
  v_loai text := nullif(btrim(p_validation_type), '');
  v_line text := coalesce(nullif(btrim(p_line), ''), '*');
  v_vai  text := nullif(btrim(coalesce(p_vai_tro, '')), '');
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if v_role not in ('admin', 'qa_manager') then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được sửa ma trận phân công');
  end if;
  if v_ten is null or v_bp is null or v_loai is null then
    return jsonb_build_object('ok', false, 'error', 'Thiếu tên nhân viên, bộ phận hoặc loại thẩm định');
  end if;
  if v_vai is not null and v_vai not in ('thuc_hien', 'ho_tro') then
    return jsonb_build_object('ok', false, 'error', 'Vai trò chỉ nhận thuc_hien hoặc ho_tro');
  end if;

  if v_vai is null then
    delete from public.vmp_assignment_matrix
     where staff_name = v_ten and validation_type = v_loai and line = v_line;
    insert into audit_logs (user_id, action, table_name, record_id,
                            new_data, change_reason, source, changed_fields)
    values (auth.uid(), 'DELETE', 'vmp_assignment_matrix', v_ten,
            jsonb_build_object('loai', v_loai, 'line', v_line, 'bo_phan', v_bp),
            'Bỏ phân công từ màn Phân quyền', 'dashboard_rpc', array['vai_tro']);
    return jsonb_build_object('ok', true, 'msg', 'Đã bỏ phân công', 'vai_tro', null);
  end if;

  insert into public.vmp_assignment_matrix
    (staff_name, department, validation_type, line, vai_tro, created_by, updated_by)
  values (v_ten, v_bp, v_loai, v_line, v_vai, auth.uid(), auth.uid())
  on conflict (staff_name, validation_type, line) do update
    set vai_tro    = excluded.vai_tro,
        department = excluded.department,
        is_active  = true,
        updated_by = auth.uid();

  insert into audit_logs (user_id, action, table_name, record_id,
                          new_data, change_reason, source, changed_fields)
  values (auth.uid(), 'UPDATE', 'vmp_assignment_matrix', v_ten,
          jsonb_build_object('loai', v_loai, 'line', v_line, 'bo_phan', v_bp, 'vai_tro', v_vai),
          'Phân công từ màn Phân quyền', 'dashboard_rpc', array['vai_tro']);

  return jsonb_build_object('ok', true, 'msg', 'Đã lưu phân công', 'vai_tro', v_vai);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;

revoke all on function public.rpc_set_assignment(text, text, text, text, text) from public, anon;
grant execute on function public.rpc_set_assignment(text, text, text, text, text) to authenticated;

/* ---------------------------------------------------------------------
 *  Chuẩn hoá bộ phận trong danh bạ & người thực hiện về ID viết thường
 *  ---------------------------------------------------------------------
 *  Danh bạ đang ghi 'QA' còn DEPTS dùng 'qa'. Với máy đó là hai giá trị
 *  khác nhau, nên ô chọn bộ phận mới sẽ hiện "chưa chọn" cho người đã có
 *  bộ phận — người dùng sẽ tưởng dữ liệu bị mất.
 *  Chỉ đổi những giá trị ánh xạ được CHẮC CHẮN; giá trị lạ giữ nguyên để
 *  không âm thầm gán sai bộ phận cho ai.
 * ------------------------------------------------------------------- */
update public.vmp_staff_emails set department = case
    when lower(btrim(department)) in ('qa','q.a','qa - qlcl','qlcl')            then 'qa'
    when lower(btrim(department)) in ('xsx','xưởng sản xuất','xuong san xuat')  then 'xsx'
    when lower(btrim(department)) in ('qc','qc - kiểm nghiệm','kiểm nghiệm')    then 'qc'
    when lower(btrim(department)) in ('rd','r&d','rd - nghiên cứu phát triển')  then 'rd'
    when lower(btrim(department)) in ('cd','cđ','cơ điện','co dien')            then 'cd'
    when lower(btrim(department)) in ('kho')                                    then 'kho'
    else department end
 where department is not null;

update public.vmp_performers set department = case
    when lower(btrim(department)) in ('qa','q.a','qa - qlcl','qlcl')            then 'qa'
    when lower(btrim(department)) in ('xsx','xưởng sản xuất','xuong san xuat')  then 'xsx'
    when lower(btrim(department)) in ('qc','qc - kiểm nghiệm','kiểm nghiệm')    then 'qc'
    when lower(btrim(department)) in ('rd','r&d','rd - nghiên cứu phát triển')  then 'rd'
    when lower(btrim(department)) in ('cd','cđ','cơ điện','co dien')            then 'cd'
    when lower(btrim(department)) in ('kho')                                    then 'kho'
    else department end
 where department is not null;

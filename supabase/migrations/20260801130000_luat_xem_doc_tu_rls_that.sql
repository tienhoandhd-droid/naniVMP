/* =====================================================================
 *  20260801130000 — "Ai XEM được gì" đọc từ RLS thật, không chép tay
 *  ---------------------------------------------------------------------
 *  Màn Phân quyền sắp có nửa bảng mới: ai xem được gì. Có hai cách làm.
 *
 *  Cách dễ: gõ thẳng bảng đó vào giao diện. Hôm nay đúng. Ngày ai đó sửa
 *  một policy RLS, bảng vẫn hiện y nguyên và vẫn trông rất chắc chắn —
 *  chỉ là sai. Một bảng phân quyền sai mà trông đúng thì tệ hơn hẳn
 *  không có bảng nào, vì người ta dừng kiểm tra ở đó.
 *
 *  Cách đúng, và là cách bảng A của màn này đã làm: đọc luật ở nơi luật
 *  thật sự nằm. Quyền ĐỌC không nằm trong vmp_role_permissions — nó nằm
 *  ở policy RLS của Postgres, tra được bằng pg_policy. Hàm này đi lấy
 *  đúng biểu thức đang chạy và phân loại ra mức cho từng vai.
 *
 *  ---------------------------------------------------------------------
 *  CHỖ NGUY HIỂM: phân loại một biểu thức SQL bất kỳ là việc không làm
 *  nổi. Nên hàm chỉ nhận DIỆN những dạng biểu thức mà hệ này đang dùng,
 *  và trả 'khong_ro' cho mọi dạng khác — kèm nguyên văn biểu thức để giao
 *  diện hiện ra. Sai kiểu "tôi không biết, đây là bản gốc, tự đọc" thì
 *  người dùng còn đường kiểm; sai kiểu đoán bừa thì không.
 * ===================================================================== */

create or replace function public.muc_xem(p_bieu_thuc text, p_vai text)
returns text
language sql immutable
as $$
  with d as (
    select
      coalesce(btrim(p_bieu_thuc), 'true') = 'true'          as mo_het,
      coalesce(p_bieu_thuc, '') ~ 'auth\.uid|auth_uid'       as co_minh,
      coalesce(p_bieu_thuc, '') ~ 'is_admin_or_qa|qa_manager' as co_qa,
      coalesce(p_bieu_thuc, '') ~ 'is_admin_or_qa|''admin''' as co_admin,
      coalesce(p_bieu_thuc, '') ~ 'is_sensitive'             as co_nhay_cam
  )
  select case
    /* Không có điều kiện = mọi tài khoản đã đăng nhập đều đọc được. */
    when d.mo_het then 'tat_ca'
    /* "của mình HOẶC người phụ trách" — dạng của profiles, vmp_ai_chat_log */
    when d.co_minh and d.co_qa then
      case when p_vai in ('admin', 'qa_manager') then 'tat_ca' else 'cua_minh' end
    when d.co_minh and d.co_admin then
      case when p_vai = 'admin' then 'tat_ca' else 'cua_minh' end
    /* Chỉ người phụ trách — dạng của audit_logs, data_quality_issues */
    when d.co_qa then
      case when p_vai in ('admin', 'qa_manager') then 'tat_ca' else 'khong' end
    /* "phần không nhạy cảm thì ai cũng xem" — dạng của system_config */
    when d.co_admin and d.co_nhay_cam then
      case when p_vai = 'admin' then 'tat_ca' else 'mot_phan' end
    when d.co_admin then
      case when p_vai = 'admin' then 'tat_ca' else 'khong' end
    else 'khong_ro'
  end
  from d;
$$;

comment on function public.muc_xem(text, text) is
  'Phân loại một biểu thức RLS thành mức xem của một vai. Trả khong_ro nếu không nhận diện được dạng biểu thức — cố ý, để giao diện hiện nguyên văn thay vì đoán.';

/* ---------------------------------------------------------------------
 *  rpc_luat_xem — nửa "XEM" của ma trận phân quyền
 *  ---------------------------------------------------------------------
 *  Danh sách bảng để ở ĐÂY chứ không ở giao diện: nó là câu trả lời cho
 *  "hệ này giữ những loại dữ liệu nào", một câu hỏi về database. Giao diện
 *  chỉ vẽ lại thứ nhận được.
 *
 *  Bảng nào có trong danh sách mà không có policy đọc nào thì vẫn phải
 *  hiện, với mức 'khong' — bảng bật RLS mà không có policy là bảng không
 *  ai đọc được, và đó là một sự thật cần thấy chứ không phải một dòng
 *  trống nên bỏ qua.
 * ------------------------------------------------------------------- */
create or replace function public.rpc_luat_xem()
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_ket jsonb;
begin
  if not public.is_admin_or_qa() then
    return jsonb_build_object('ok', false, 'error',
      'Chỉ admin và phụ trách QA xem được bảng luật đọc');
  end if;

  with muc_can_xem(bang, nhan, thu_tu) as (
    values
      ('vmp_plan_items',        'Số liệu thẩm định — hạng mục, tiến độ, ngày tháng', 1),
      ('vmp_objects',           'Danh mục đối tượng được thẩm định',                 2),
      ('vmp_performers',        'Danh bạ người thực hiện',                           3),
      ('vmp_assignment_matrix', 'Ma trận phân công người × loại × line',             4),
      ('profiles',              'Danh sách người dùng — họ tên, email, vai trò',     5),
      ('audit_logs',            'Nhật ký thay đổi — ai sửa gì, lúc nào, vì sao',     6),
      ('data_quality_issues',   'Cảnh báo chất lượng dữ liệu',                       7),
      ('system_config',         'Cấu hình hệ thống',                                 8),
      ('vmp_ai_chat_log',       'Hội thoại với trợ lý Vali',                         9)
  ),
  luat as (
    select m.bang, m.nhan, m.thu_tu,
           /* Nhiều policy đọc trên một bảng là hợp OR với nhau. Lấy cái
              rộng nhất — 'true' nếu có, không thì nối lại để người đọc
              thấy đủ. */
           (select case when bool_or(coalesce(btrim(pg_get_expr(p.polqual, p.polrelid)), 'true') = 'true')
                        then 'true'
                        else string_agg(pg_get_expr(p.polqual, p.polrelid), ' OR ') end
              from pg_policy p
              join pg_class c on c.oid = p.polrelid
              join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = m.bang
               and p.polcmd in ('r', '*')) as bieu_thuc,
           (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = m.bang) as co_bang
    from muc_can_xem m
  )
  select jsonb_agg(jsonb_build_object(
    'bang', l.bang,
    'nhan', l.nhan,
    'bieu_thuc', l.bieu_thuc,
    'muc', jsonb_build_object(
      'admin',           case when l.bieu_thuc is null then 'khong' else public.muc_xem(l.bieu_thuc, 'admin') end,
      'qa_manager',      case when l.bieu_thuc is null then 'khong' else public.muc_xem(l.bieu_thuc, 'qa_manager') end,
      'department_user', case when l.bieu_thuc is null then 'khong' else public.muc_xem(l.bieu_thuc, 'department_user') end,
      'viewer',          case when l.bieu_thuc is null then 'khong' else public.muc_xem(l.bieu_thuc, 'viewer') end)
  ) order by l.thu_tu)
  into v_ket
  from luat l where l.co_bang > 0;

  return jsonb_build_object('ok', true, 'noi_dung', coalesce(v_ket, '[]'::jsonb));
end;
$$;
revoke all on function public.rpc_luat_xem() from public, anon;
grant execute on function public.rpc_luat_xem() to authenticated;

/* Kiểm bằng cách chạy thật: mọi mục trong danh sách phải phân loại được.
   Còn một ô 'khong_ro' nghĩa là có policy dạng lạ — không phải lỗi cần
   chặn migration, nhưng phải nói ra để người sửa policy biết mà bổ sung
   luật nhận diện, thay vì để giao diện hiện dấu hỏi mà không ai đọc log. */
do $kiem$
declare
  v_kq jsonb;
  v_la text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id::text from profiles where role = 'admin'
                              and coalesce(is_active, true) limit 1),
                      'role', 'authenticated')::text, true);
  v_kq := public.rpc_luat_xem();
  perform set_config('request.jwt.claims', '', true);

  if (v_kq->>'ok')::boolean is not true then
    raise exception 'rpc_luat_xem không chạy được: %', v_kq->>'error';
  end if;

  select string_agg(x->>'bang', ', ') into v_la
  from jsonb_array_elements(v_kq->'noi_dung') x
  where (x->'muc')::text ~ 'khong_ro';

  if v_la is not null then
    raise notice 'CHƯA NHẬN DIỆN ĐƯỢC policy của: % — giao diện sẽ hiện nguyên văn biểu thức', v_la;
  else
    raise notice 'Phân loại được toàn bộ % mục quyền đọc',
      jsonb_array_length(v_kq->'noi_dung');
  end if;
end
$kiem$;

\set ON_ERROR_STOP on
-- =====================================================================
-- Kiểm migration 20261022100000_tham_dinh_do_thay_doi.sql (JWT giả).
-- CHỈ chạy trên DB THỬ (bản sao production). Toàn bộ trong MỘT giao dịch
-- rồi ROLLBACK: người dùng thử, phiếu thử, lượt đồng bộ thử đều không ở lại.
--
-- Người dùng thử (tạo trong giao dịch):
--   c…01 admin · c…02 qa_manager · c…03 qa_staff · c…04 workshop_manager
--   c…05 workshop_staff (có phạm vi thử) · c…06 đã tắt · c…07 view_only
--   c…08 workshop_staff KHÔNG phạm vi
-- =====================================================================

begin;
\o /dev/null

create temp table ket_qua (
  stt serial, muc text not null, ten text not null, dat boolean not null, chi_tiet text
) on commit drop;
grant select, insert on ket_qua to authenticated, service_role, anon;
grant usage on sequence ket_qua_stt_seq to authenticated, service_role, anon;

create function pg_temp.ghi(p_muc text, p_ten text, p_dat boolean, p_chi_tiet text default null)
returns void language sql as $$
  insert into pg_temp.ket_qua(muc, ten, dat, chi_tiet)
  values (p_muc, p_ten, coalesce(p_dat, false), p_chi_tiet)
$$;

create function pg_temp.vai(n integer) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', 'c0221022-0000-4000-8000-' || lpad(n::text, 12, '0'),
    'role', 'authenticated', 'aal', 'aal1')::text, true)
$$;

create function pg_temp.goi(p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  execute p_sql into v;
  return coalesce(v, 'null'::jsonb);
exception when others then
  return jsonb_build_object('sqlstate', sqlstate, 'loi', sqlerrm);
end $$;

-- Payload giống Google Sheets values:batchGet, tiêu đề y như sheet thật.
create function pg_temp.payload(p_rows_2026 jsonb, p_rows_2026_2 jsonb) returns jsonb language sql as $$
  select jsonb_build_object('valueRanges', jsonb_build_array(
    jsonb_build_object('range', '''2026''!A1:AA2000', 'majorDimension', 'ROWS',
      'values', jsonb_build_array(jsonb_build_array(
        'Thời gian', E'Phòng ban \ngửi đề nghị', 'Mã thay đổi', 'Phân loại thay đổi', 'Loại thay đổi',
        'Nội dung thay đổi', 'Link folder thay đổi (Bản final)', 'Chốt Show', 'Tình trạng', 'Hồ sơ',
        'Người phụ trách', 'Ghi chú', 'Lập đề nghị thay đổi', 'QA Đánh giá sơ bộ',
        'CBR phê duyệt (Nếu có)', 'Dự kiến ngày hoàn thành kế hoạch', 'Ngày hoàn thành thực tế',
        'Lí do trôi ngày dự kiến hoàn thành', 'Thời điểm thực hiện thay đổi thực tế',
        'Xác minh hiệu quả', 'Đóng thay đổi', 'Ghi chú', '', 'Theo dõi',
        'Có cần tiến hành thẩm định không?', 'Nội dung thẩm định', 'Deadline thẩm định'))
        || p_rows_2026),
    jsonb_build_object('range', '''2026 (2)''!A1:W2000', 'majorDimension', 'ROWS',
      'values', jsonb_build_array(jsonb_build_array(
        'Ngày mở hồ sơ', E'Phòng ban \ngửi đề nghị', 'Mã thay đổi', 'Phân loại thay đổi',
        'Loại thay đổi', 'Nội dung thay đổi', '1. Lập đề nghị thay đổi', '2. QA-QMS đánh giá',
        'Chuyển chuyên viên QA phụ trách', '3. Chuyên viên QA đánh giá', '4. CFT đánh giá',
        E'Thời điểm xác minh thực hiện thay đổi\n(Deadline kết thúc hành động)',
        '5. Kết quả xác minh', E'Thời điểm đánh giá hiệu quả \ndự kiến',
        '6. Đánh giá hiệu quả thay đổi', 'Yêu cầu bổ sung nếu đánh giá không đạt',
        '7. Đóng thay đổi', 'Tình trạng hồ sơ (update)', 'Link folder thay đổi (Bản scan)',
        'Ghi chú', 'Có cần tiến hành thẩm định không?', 'Nội dung thẩm định',
        'Deadline thẩm định'))
        || p_rows_2026_2)))
$$;

-- Dòng sheet "2026": 27 cột, Y/Z/AA là 24/25/26.
create function pg_temp.d1(p_code text, p_content text, p_mark text, p_vc text, p_dl text)
returns jsonb language sql as $$
  select jsonb_build_array('01/2026', 'XSX', p_code, 'Vĩnh viễn', 'Trang thiết bị - Nhà Xưởng',
    p_content, '', '', 'Đang tiến hành', '', 'Khoa', '', '', '', '', '', '', '', '', '', '', '', '', '',
    p_mark, p_vc, p_dl)
$$;
-- Dòng sheet "2026 (2)": 23 cột, U/V/W là 20/21/22. Google bỏ ô trống ở cuối.
create function pg_temp.d2(p_code text, p_content text, p_mark text, p_vc text, p_dl text)
returns jsonb language sql as $$
  select case when p_mark is null and p_vc is null and p_dl is null then
    jsonb_build_array('15/05/2026', 'XSX', p_code, 'Vĩnh viễn', 'Trang thiết bị - Nhà Xưởng', p_content)
  else
    jsonb_build_array('15/05/2026', 'XSX', p_code, 'Vĩnh viễn', 'Trang thiết bị - Nhà Xưởng',
      p_content, 'Bản cứng', 'Đạt', 'Quế Anh', 'Duyệt', '', '', '', '', '', '', '', 'Đang mở', '', '',
      p_mark, p_vc, p_dl)
  end
$$;

-- ---------------------------------------------------------------------
-- Fixture người dùng
-- ---------------------------------------------------------------------
insert into public.vmp_email_cho_phep(email, ghi_chu)
select 'thaydoi1022-' || n || '@example.test', 'SQL test only'
from generate_series(1, 8) n on conflict do nothing;
insert into auth.users(id, aud, role, email, created_at, updated_at)
select ('c0221022-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'authenticated', 'authenticated', 'thaydoi1022-' || n || '@example.test', now(), now()
from generate_series(1, 8) n on conflict do nothing;
insert into public.profiles(id, full_name, email, role, department, is_active)
select ('c0221022-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'Thay doi thu ' || n, 'thaydoi1022-' || n || '@example.test',
       (case n when 1 then 'admin' when 2 then 'qa_manager' else 'department_user' end)::public.user_role,
       case when n in (4, 5, 8) then 'xsx' else 'qa' end,
       n <> 6
from generate_series(1, 8) n;
update public.vmp_performers set
  access_class = case right(user_id::text, 1)
    when '1' then 'view_only' when '2' then 'qa_manager' when '3' then 'qa_progress_editor'
    when '4' then 'equipment_manager' when '5' then 'workshop_staff' when '7' then 'view_only'
    when '8' then 'workshop_staff' else 'qa_progress_editor' end,
  department = case when right(user_id::text, 1) in ('4', '5', '8') then 'xsx' else 'qa' end,
  is_active = right(user_id::text, 1) <> '6'
where user_id::text like 'c0221022-%';

-- Hai thiết bị thật có đợt thẩm định đang hoạt động, khác nhau.
create temp table moc on commit drop as
with ung_vien as (
  select o.code, max(s.department) as dept, max(s.area_code) as area,
         (select p.id from public.vmp_plan_items p where p.object_code = o.code and p.is_active
           order by p.year desc, p.id limit 1) as plan_id
    from public.vmp_objects o
    join public.vmp_source_objects s on s.object_code = o.code and s.is_active
   where o.is_active
     and exists (select 1 from public.vmp_plan_items p where p.object_code = o.code and p.is_active)
   group by o.code having count(*) = 1),
a as (select * from ung_vien order by code limit 1),
b as (select u.* from ung_vien u, a
       where public.vmp_source_scope_key(u.dept) is distinct from public.vmp_source_scope_key(a.dept)
       order by u.code limit 1)
select a.code as tb_a, a.plan_id as dot_a, b.code as tb_b, b.plan_id as dot_b,
       (select count(*) from public.vmp_plan_items) as so_dot,
       (select md5(string_agg(t::text, '|' order by t.id)) from public.vmp_plan_items t) as md5_dot,
       (select md5(string_agg(t::text, '|' order by t.code)) from public.vmp_objects t) as md5_tb
from a, b;
grant select on moc to authenticated, service_role, anon;

-- Phạm vi thử cho c…05: đúng bộ phận/khu vực của thiết bị A.
insert into public.vmp_source_workshop_scope_grants(
  performer_id, department, department_key, area_code, area_key, change_reason)
select f.id, s.department, public.vmp_source_scope_key(s.department),
       s.area_code, public.vmp_source_scope_key(s.area_code), 'SQL test only'
from public.vmp_performers f, public.vmp_source_objects s
where f.user_id = 'c0221022-0000-4000-8000-000000000005'
  and s.object_code = (select tb_a from moc) and s.is_active
limit 1;

select pg_temp.ghi('0', 'fixture: có 2 thiết bị thử khác nhau',
  (select tb_a is not null and tb_b is not null and tb_a <> tb_b from moc),
  (select tb_a || ' / ' || tb_b from moc));
-- vmp_can_view_plan_item chỉ trả đúng khi người hỏi chính là người được hỏi (JWT).
set local role authenticated;
select pg_temp.vai(5);
select pg_temp.ghi('0', 'fixture: c…05 xem được đợt của thiết bị A, không xem được đợt của B',
  public.vmp_can_view_plan_item('c0221022-0000-4000-8000-000000000005',
    (select validation_code from public.vmp_plan_items where id = (select dot_a from moc)))
  and not public.vmp_can_view_plan_item('c0221022-0000-4000-8000-000000000005',
    (select validation_code from public.vmp_plan_items where id = (select dot_b from moc))));
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------
-- Mục 1: đọc deadline
-- ---------------------------------------------------------------------
select pg_temp.ghi('1', 'deadline "30/10/2026"', public.vmp_change_parse_deadline('30/10/2026') = date '2026-10-30');
select pg_temp.ghi('1', 'deadline chữ "Nhịp 1: 10/2026 ... Cuối tháng 10/2026" → 31/10/2026',
  public.vmp_change_parse_deadline(E'Nhịp 1: 10/2026\nNhịp 2: Máy về: Cuối tháng 10/2026\nKết hợp với nhà xưởng, phụ trợ') = date '2026-10-31',
  public.vmp_change_parse_deadline(E'Nhịp 1: 10/2026\nNhịp 2: Máy về: Cuối tháng 10/2026')::text);
select pg_temp.ghi('1', 'deadline khoảng "15/11/2026 - 30/11/2026" → ngày muộn nhất',
  public.vmp_change_parse_deadline('15/11/2026 - 30/11/2026') = date '2026-11-30');
select pg_temp.ghi('1', 'deadline ISO "2026-11-15"', public.vmp_change_parse_deadline('2026-11-15') = date '2026-11-15');
select pg_temp.ghi('1', 'ngày không có thật 31/02/2026 → bỏ qua', public.vmp_change_parse_deadline('31/02/2026') is null);
select pg_temp.ghi('1', 'chữ không có ngày → NULL', public.vmp_change_parse_deadline('Lô sx đầu tiên') is null);
select pg_temp.ghi('1', 'năm ngoài 2020..2100 → bỏ qua', public.vmp_change_parse_deadline('01/01/2019') is null);
select pg_temp.ghi('1', 'khoảng tháng "10/2026-11/2026" → 30/11/2026',
  public.vmp_change_parse_deadline('10/2026-11/2026') = date '2026-11-30',
  public.vmp_change_parse_deadline('10/2026-11/2026')::text);
select pg_temp.ghi('1', '"Q4/2026" không bị đọc thành tháng 4', public.vmp_change_parse_deadline('Q4/2026') is null);
select pg_temp.ghi('1', 'năm 2 chữ số "30/10/26" → NULL (QA tự nhập)', public.vmp_change_parse_deadline('30/10/26') is null);
select pg_temp.ghi('1', 'khoảng viết liền "15/11/2026-30/11/2026" → 30/11/2026',
  public.vmp_change_parse_deadline('15/11/2026-30/11/2026') = date '2026-11-30');
select pg_temp.ghi('1', '"T10/2026" → 31/10/2026', public.vmp_change_parse_deadline('T10/2026') = date '2026-10-31');
select pg_temp.ghi('1', '"tháng10/2026" → 31/10/2026', public.vmp_change_parse_deadline('tháng10/2026') = date '2026-10-31');
select pg_temp.ghi('1', 'ô trống → NULL', public.vmp_change_parse_deadline('') is null and public.vmp_change_parse_deadline(null) is null);

-- ---------------------------------------------------------------------
-- Mục 2: quyền gọi hàm đồng bộ
-- ---------------------------------------------------------------------
set local role anon;
select pg_temp.ghi('2', 'anon: không gọi được rpc_change_list',
  r->>'sqlstate' = '42501', r::text) from (select pg_temp.goi('select public.rpc_change_list()') r) t;
reset role;
set local role authenticated;
select pg_temp.vai(1);
select pg_temp.ghi('2', 'admin web: không gọi được vmp_change_sync_ingest',
  r->>'sqlstate' = '42501', r::text)
from (select pg_temp.goi($q$select public.vmp_change_sync_ingest(gen_random_uuid(), '{}'::jsonb)$q$) r) t;
select pg_temp.ghi('2', 'admin web: không gọi được vmp_change_sync_next',
  r->>'sqlstate' = '42501', r::text)
from (select pg_temp.goi($q$select to_jsonb(x) from public.vmp_change_sync_next() x$q$) r) t;
select pg_temp.ghi('2', 'admin web: không đọc thẳng bảng vmp_change_records',
  r->>'sqlstate' = '42501', r::text)
from (select pg_temp.goi('select to_jsonb(count(*)) from public.vmp_change_records') r) t;

-- Lịch 06:00 giờ VN: chưa có lượt nào thì n8n nhận một lượt "lich" (nếu đã qua 06:00).
reset role;
select set_config('request.jwt.claims', '', true);
create temp table lich0 on commit drop as select * from public.vmp_change_sync_next();
select pg_temp.ghi('2', 'lịch hằng ngày: sau 06:00 giờ VN tự có lượt, trước 06:00 thì không',
  case when (now() at time zone 'Asia/Ho_Chi_Minh')::time >= time '06:00'
       then (select count(*) = 1 and bool_and(trigger_kind = 'lich') from lich0)
       else not exists (select 1 from lich0) end,
  (select string_agg(trigger_kind, ',') from lich0));
select public.vmp_change_sync_fail(run_id, 'thử lịch') from lich0;
select pg_temp.ghi('2', 'lượt lịch vừa thử trong giờ qua: không tạo thêm lượt lịch',
  not exists (select 1 from public.vmp_change_sync_next()));
set local role authenticated;

-- Nút Làm mới
select pg_temp.vai(5);
select pg_temp.ghi('2', 'nhân viên xưởng: nút Làm mới bị từ chối',
  r->>'error_code' = 'FORBIDDEN', r::text)
from (select pg_temp.goi('select public.rpc_change_request_sync()') r) t;
select pg_temp.vai(3);
create temp table yc1 on commit drop as select public.rpc_change_request_sync() r;
select pg_temp.ghi('2', 'nhân viên QA: bấm Làm mới tạo yêu cầu chờ',
  (select (r->>'ok')::boolean and r->>'status' = 'cho' and (r->>'already')::boolean = false from yc1),
  (select r::text from yc1));
select pg_temp.ghi('2', 'bấm lần 2 không xếp thêm lượt',
  (r->>'already')::boolean and r->>'run_id' = (select r->>'run_id' from yc1), r::text)
from (select public.rpc_change_request_sync() r) t;
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------
-- Mục 3: đồng bộ từ sheet (kết nối n8n: không JWT)
-- ---------------------------------------------------------------------
create temp table luot1 on commit drop as select * from public.vmp_change_sync_next();
select pg_temp.ghi('3', 'n8n nhận đúng lượt do nút Làm mới tạo',
  (select run_id::text = (select r->>'run_id' from yc1) and trigger_kind = 'nut' from luot1));
select pg_temp.ghi('3', 'đang có lượt chạy thì không giao thêm lượt',
  not exists (select 1 from public.vmp_change_sync_next()));

create temp table p1 on commit drop as select pg_temp.payload(
  jsonb_build_array(
    pg_temp.d1('CC-SX-001/01/26', 'Bổ sung hệ lọc TFF', '', '', ''),
    pg_temp.d1('CC-SX-002/01/26', 'Thay đổi ống trung gian tank 50L', 'x', 'Thẩm định ống trung gian', '30/10/2026'),
    pg_temp.d1('CC-SX-001/04/26', 'Bổ sung máy nghiền', 'x', 'Thẩm định máy nghiễn', '30/10/2026'),
    pg_temp.d1('', 'Dòng có x mà thiếu mã', 'x', 'abc', '01/11/2026'),
    pg_temp.d1('CC-SX-009/09/26', 'Ghi rõ không cần', 'Không cần', '', ''),
    jsonb_build_array()),
  jsonb_build_array(
    pg_temp.d2('CC-XSX-2605-001', 'Bổ sung tank 100L pha chế viên đặt', 'x', 'Thẩm định tank 100 viên đặt', '30/10/2026'),
    pg_temp.d2('CC-KH-2605/001', 'Thay đổi nguồn zinc', null, null, null),
    pg_temp.d2('CC-XSX-2608-001', 'Cải tạo khu vực xưởng gel thạch', 'x', 'Đánh giá tank/máy/nhà xưởng ',
      E'Nhịp 1: 10/2026\nNhịp 2: Máy về: Cuối tháng 10/2026\nKết hợp với nhà xưởng, phụ trợ'),
    pg_temp.d2('CC-XSX-2610-001', 'Bổ sung tank pha chế 60L line BFS', 'x', 'Thẩm định tank mới, hư hao, lượt bỏ, mediafill', '15/11/2026 - 30/11/2026'),
    pg_temp.d2('CC-XSX-2610-002', 'Bổ sung tank pha chế 10L', 'x', 'Thẩm định tank mới', '15/11/2026'))) p;

create temp table kq1 on commit drop as
select public.vmp_change_sync_ingest((select run_id from luot1), (select p from p1)) r;
select pg_temp.ghi('3', 'lần đầu: tạo đúng 6 phiếu có dấu x',
  (select (r->>'ok')::boolean and (r->>'created')::int = 6 and (r->>'marked_without_code')::int = 1 from kq1),
  (select r::text from kq1));
select pg_temp.ghi('3', 'chỉ phiếu có x được lấy (bỏ ô trống và ô "Không cần")',
  (select count(*) from public.vmp_change_records) = 6
  and not exists (select 1 from public.vmp_change_records
                   where change_code in ('CC-SX-001/01/26', 'CC-KH-2605/001', 'CC-SX-009/09/26')));
select pg_temp.ghi('3', 'deadline chuẩn đọc đúng cả ô chữ',
  (select deadline_sheet from public.vmp_change_records where change_code = 'CC-XSX-2608-001') = date '2026-10-31'
  and (select deadline_sheet from public.vmp_change_records where change_code = 'CC-XSX-2610-001') = date '2026-11-30'
  and (select deadline_raw from public.vmp_change_records where change_code = 'CC-XSX-2610-001') = '15/11/2026 - 30/11/2026');
select pg_temp.ghi('3', 'cột lấy theo tên: người phụ trách hai sheet đúng cột',
  (select owner_text from public.vmp_change_records where change_code = 'CC-SX-002/01/26') = 'Khoa'
  and (select owner_text from public.vmp_change_records where change_code = 'CC-XSX-2605-001') = 'Quế Anh'
  and (select sheet_status from public.vmp_change_records where change_code = 'CC-XSX-2605-001') = 'Đang mở');
select pg_temp.ghi('3', 'lượt chạy ghi "xong" và có tóm tắt',
  (select status = 'xong' and summary->>'created' = '6' from public.vmp_change_sync_runs
    where id = (select run_id from luot1)));

-- Chạy lại y hệt: không tạo trùng, không đổi gì.
insert into public.vmp_change_sync_runs(trigger_kind, status) values ('nut', 'cho');
create temp table luot2 on commit drop as select * from public.vmp_change_sync_next();
select pg_temp.ghi('3', 'chạy lại cùng dữ liệu: 0 tạo, 0 sửa, 6 giữ nguyên',
  (r->>'created')::int = 0 and (r->>'updated')::int = 0 and (r->>'unchanged')::int = 6, r::text)
from (select public.vmp_change_sync_ingest((select run_id from luot2), (select p from p1)) r) t;

-- ---------------------------------------------------------------------
-- Mục 4: QA sửa phiếu
-- ---------------------------------------------------------------------
create temp table phieu on commit drop as
select id, change_code from public.vmp_change_records where change_code = 'CC-XSX-2605-001';
grant select on phieu, p1 to authenticated, service_role;

set local role authenticated;
select pg_temp.vai(3);
select pg_temp.ghi('4', 'QA: danh sách đủ 6 phiếu, có quyền sửa',
  (r->>'ok')::boolean and (r->>'can_edit')::boolean and jsonb_array_length(r->'records') = 6, left(r::text, 200))
from (select public.rpc_change_list() r) t;
select pg_temp.ghi('4', 'thiếu phiên bản → VERSION_REQUIRED',
  r->>'error_code' = 'VERSION_REQUIRED', r::text)
from (select public.rpc_change_save((select id from phieu), null, array[(select tb_a from moc)], '{}', null, 'cho_xu_ly', null) r) t;
select pg_temp.ghi('4', 'mã thiết bị không có → OBJECT_NOT_FOUND, không lưu gì',
  r->>'error_code' = 'OBJECT_NOT_FOUND' and r->'codes' = '["KHONG-CO-MA-NAY"]'::jsonb, r::text)
from (select public.rpc_change_save((select id from phieu), 1, array[(select tb_a from moc), 'KHONG-CO-MA-NAY'], '{}', null, 'cho_xu_ly', null) r) t;
select pg_temp.ghi('4', 'thiết bị đã ngừng hoạt động không gắn mới được',
  r->>'error_code' = 'OBJECT_NOT_FOUND', r::text)
from (select public.rpc_change_save((select id from phieu), 1,
        array[(select code from public.vmp_objects where not is_active order by code limit 1)], '{}', null, 'cho_xu_ly', null) r) t
where exists (select 1 from public.vmp_objects where not is_active);
select pg_temp.ghi('4', 'gắn đợt của thiết bị khác → PLAN_NOT_IN_OBJECTS',
  r->>'error_code' = 'PLAN_NOT_IN_OBJECTS', r::text)
from (select public.rpc_change_save((select id from phieu), 1, array[(select tb_a from moc)],
        array[(select dot_b from moc)], null, 'cho_xu_ly', null) r) t;
select pg_temp.ghi('4', 'trạng thái lạ → INVALID_INPUT',
  r->>'error_code' = 'INVALID_INPUT', r::text)
from (select public.rpc_change_save((select id from phieu), 1, '{}', '{}', null, 'xong_roi', null) r) t;
select pg_temp.ghi('4', 'hạn năm 2019 → INVALID_INPUT',
  r->>'error_code' = 'INVALID_INPUT', r::text)
from (select public.rpc_change_save((select id from phieu), 1, '{}', '{}', date '2019-12-31', 'cho_xu_ly', null) r) t;
select pg_temp.ghi('4', 'các lần sai ở trên không làm đổi phiếu',
  x->>'version' = '1' and x->>'deadline_override' is null and jsonb_array_length(x->'objects') = 0)
from (select x from jsonb_array_elements(public.rpc_change_list()->'records') x
       where x->>'id' = (select id::text from phieu)) t;

create temp table luu1 on commit drop as
select public.rpc_change_save((select id from phieu), 1, array[' ' || (select tb_a from moc) || ' ', (select tb_a from moc)],
  array[(select dot_a from moc)], date '2026-12-15', 'dang_thanh_dinh', 'thu') r;
select pg_temp.ghi('4', 'trạng thái sai chính tả cũng bị chặn',
  (select r->>'error_code' = 'INVALID_INPUT' from luu1), (select r::text from luu1));
select pg_temp.ghi('4', 'lưu hợp lệ: gắn thiết bị A + đợt của A, hạn web, trạng thái',
  (r->>'ok')::boolean and (r->>'version')::int = 2, r::text)
from (select public.rpc_change_save((select id from phieu), 1, array[' ' || (select tb_a from moc) || ' ', (select tb_a from moc)],
        array[(select dot_a from moc)], date '2026-12-15', 'dang_tham_dinh', '  ghi chú thử  ') r) t;
select pg_temp.ghi('4', 'lưu bằng phiên bản cũ → VERSION_CONFLICT',
  r->>'error_code' = 'VERSION_CONFLICT' and (r->>'current_version')::int = 2, r::text)
from (select public.rpc_change_save((select id from phieu), 1, '{}', '{}', null, 'cho_xu_ly', null) r) t;
select pg_temp.ghi('4', 'danh sách: hạn hiệu lực = hạn web, có thiết bị A và đợt đã gắn',
  x->>'deadline' = '2026-12-15' and x->>'deadline_sheet' = '2026-10-30'
  and x->'objects'->0->>'code' = (select tb_a from moc)
  and exists (select 1 from jsonb_array_elements(x->'plan_items') pi
               where pi->>'id' = (select dot_a from moc) and (pi->>'linked')::boolean)
  and x->>'note' = 'ghi chú thử', left(x::text, 300))
from (select x from jsonb_array_elements(public.rpc_change_list()->'records') x
       where x->>'id' = (select id::text from phieu)) t;
select pg_temp.ghi('4', 'gợi ý mã thiết bị trả đúng thiết bị A',
  exists (select 1 from jsonb_array_elements(public.rpc_change_search_objects((select tb_a from moc))) x
           where x->>'code' = (select tb_a from moc)));
select pg_temp.ghi('4', 'nhãn Tiến độ: đợt A mang mã phiếu',
  exists (select 1 from jsonb_array_elements(public.rpc_change_plan_badges()->'badges') b
           where b->>'plan_item_id' = (select dot_a from moc)
             and b->'change_codes' ? 'CC-XSX-2605-001'));
reset role;
select pg_temp.ghi('4', 'nhật ký ghi lần lưu của QA',
  exists (select 1 from public.audit_logs where table_name = 'vmp_change_records'
           and record_id = (select id::text from phieu) and source = 'rpc_change_save'
           and user_id = 'c0221022-0000-4000-8000-000000000003'));

-- Tạo đợt: theo luật có sẵn chỉ Admin/Quản lý QA (edit_catalog); Nhân viên QA không.
set local role authenticated;
select pg_temp.vai(3);
select pg_temp.ghi('4', 'nhân viên QA: danh sách báo không được tạo đợt',
  (public.rpc_change_list()->>'can_create_plan')::boolean is false);
select pg_temp.ghi('4', 'nhân viên QA: tạo đợt bị từ chối rõ ràng',
  r->>'error_code' = 'FORBIDDEN', r::text)
from (select public.rpc_change_create_plan_item((select id from phieu), 2, (select tb_a from moc), 'OQ', 2027) r) t;
-- Tạo đợt tái thẩm định từ phiếu (admin)
select pg_temp.vai(1);
select pg_temp.ghi('4', 'admin: danh sách báo được tạo đợt',
  (public.rpc_change_list()->>'can_create_plan')::boolean);
select pg_temp.ghi('4', 'tạo đợt cho thiết bị chưa gắn → OBJECT_NOT_LINKED',
  r->>'error_code' = 'OBJECT_NOT_LINKED', r::text)
from (select public.rpc_change_create_plan_item((select id from phieu), 2, (select tb_b from moc), 'OQ', 2027) r) t;
create temp table tao1 on commit drop as
select public.rpc_change_create_plan_item((select id from phieu), 2, (select tb_a from moc), 'OQ', 2027) r;
select pg_temp.ghi('4', 'tạo đợt OQ 2027 cho thiết bị A và gắn vào phiếu',
  (select (r->>'ok')::boolean and r->>'validation_code' = (select tb_a from moc) || '/2027.01-OQ'
          and (r->>'version')::int = 3 from tao1), (select r::text from tao1));
select pg_temp.ghi('4', 'tạo lần nữa → lần 02',
  r->>'validation_code' = (select tb_a from moc) || '/2027.02-OQ', r::text)
from (select public.rpc_change_create_plan_item((select id from phieu), 3, (select tb_a from moc), 'OQ', 2027) r) t;
select pg_temp.ghi('4', 'loại thẩm định sai do hàm tạo đợt cũ chặn',
  (r->>'ok')::boolean is false, r::text)
from (select public.rpc_change_create_plan_item((select id from phieu), 4, (select tb_a from moc), 'XYZ', 2027) r) t;
reset role;
select pg_temp.ghi('4', 'đợt mới đã gắn vào phiếu, trạng thái giữ "đang thẩm định"',
  exists (select 1 from public.vmp_change_plan_links
           where change_id = (select id from phieu) and plan_item_id = (select tb_a from moc) || '/2027.01-OQ')
  and (select handling_status from public.vmp_change_records where id = (select id from phieu)) = 'dang_tham_dinh');

-- ---------------------------------------------------------------------
-- Mục 5: vai xưởng và tài khoản không hợp lệ
-- ---------------------------------------------------------------------
set local role authenticated;
select pg_temp.vai(5);
select pg_temp.ghi('5', 'nhân viên xưởng có phạm vi: chỉ thấy phiếu có thiết bị A, không sửa được',
  (r->>'ok')::boolean and (r->>'can_edit')::boolean = false
  and jsonb_array_length(r->'records') = 1 and r->'records'->0->>'change_code' = 'CC-XSX-2605-001'
  and r->'sync'->>'last_error' is null, left(r::text, 200))
from (select public.rpc_change_list() r) t;
select pg_temp.ghi('5', 'nhân viên xưởng: chỉ thấy đợt đã gắn, không thấy đợt để chọn',
  not exists (select 1 from jsonb_array_elements(public.rpc_change_list()->'records'->0->'plan_items') pi
               where not (pi->>'linked')::boolean));
select pg_temp.ghi('5', 'nhân viên xưởng: lưu phiếu bị từ chối',
  r->>'error_code' = 'FORBIDDEN', r::text)
from (select public.rpc_change_save((select id from phieu), 4, '{}', '{}', null, 'cho_xu_ly', null) r) t;
select pg_temp.ghi('5', 'nhân viên xưởng: tạo đợt bị từ chối',
  r->>'error_code' = 'FORBIDDEN', r::text)
from (select public.rpc_change_create_plan_item((select id from phieu), 4, (select tb_a from moc), 'PQ', 2027) r) t;
select pg_temp.ghi('5', 'nhân viên xưởng: gợi ý mã thiết bị bị từ chối',
  r->>'sqlstate' = '42501', r::text)
from (select pg_temp.goi($q$select public.rpc_change_search_objects('ab')$q$) r) t;
select pg_temp.vai(8);
select pg_temp.ghi('5', 'nhân viên xưởng KHÔNG phạm vi: không thấy phiếu nào',
  (r->>'ok')::boolean and jsonb_array_length(r->'records') = 0, left(r::text, 200))
from (select public.rpc_change_list() r) t;
select pg_temp.ghi('5', 'nhân viên xưởng KHÔNG phạm vi: không thấy nhãn nào',
  jsonb_array_length(public.rpc_change_plan_badges()->'badges') = 0);
select pg_temp.vai(4);
select pg_temp.ghi('5', 'quản lý xưởng: không sửa được',
  r->>'error_code' = 'FORBIDDEN', r::text)
from (select public.rpc_change_save((select id from phieu), 4, '{}', '{}', null, 'cho_xu_ly', null) r) t;
select pg_temp.vai(6);
select pg_temp.ghi('5', 'tài khoản đã tắt: bị từ chối',
  r->>'error_code' = 'ACCOUNT_DISABLED', r::text)
from (select public.rpc_change_list() r) t;
select pg_temp.vai(7);
select pg_temp.ghi('5', 'tài khoản chưa có vai: bị từ chối',
  (r->>'ok')::boolean is false, r::text)
from (select public.rpc_change_list() r) t;
select pg_temp.ghi('5', 'tài khoản chưa có vai: không bấm Làm mới được',
  (r->>'ok')::boolean is false, r::text)
from (select public.rpc_change_request_sync() r) t;
select pg_temp.vai(2);
select pg_temp.ghi('5', 'quản lý QA: thấy đủ 6 phiếu và lỗi đồng bộ (nếu có)',
  jsonb_array_length(r->'records') = 6 and (r->>'can_edit')::boolean, left(r::text, 120))
from (select public.rpc_change_list() r) t;
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------
-- Mục 6: sheet đổi — sửa, bỏ dấu x, chặn dữ liệu bất thường
-- ---------------------------------------------------------------------
-- Bỏ x ở CC-XSX-2605-001 (phiếu đã gắn thiết bị) và sửa nội dung CC-SX-002/01/26.
create temp table p2 on commit drop as select pg_temp.payload(
  jsonb_build_array(
    pg_temp.d1('CC-SX-002/01/26', 'Thay đổi ống trung gian tank 50L (sửa)', 'x', 'Thẩm định ống trung gian', '30/10/2026'),
    pg_temp.d1('CC-SX-001/04/26', 'Bổ sung máy nghiền', 'x', 'Thẩm định máy nghiễn', '30/10/2026')),
  jsonb_build_array(
    pg_temp.d2('CC-XSX-2605-001', 'Bổ sung tank 100L pha chế viên đặt', '', '', ''),
    pg_temp.d2('CC-XSX-2608-001', 'Cải tạo khu vực xưởng gel thạch', 'x', 'Đánh giá tank/máy/nhà xưởng ',
      E'Nhịp 1: 10/2026\nNhịp 2: Máy về: Cuối tháng 10/2026\nKết hợp với nhà xưởng, phụ trợ'),
    pg_temp.d2('CC-XSX-2610-001', 'Bổ sung tank pha chế 60L line BFS', 'x', 'Thẩm định tank mới, hư hao, lượt bỏ, mediafill', '15/11/2026 - 30/11/2026'),
    pg_temp.d2('CC-XSX-2610-002', 'Bổ sung tank pha chế 10L', 'x', 'Thẩm định tank mới', '15/11/2026'))) p;
insert into public.vmp_change_sync_runs(trigger_kind, status) values ('nut', 'cho');
create temp table luot3 on commit drop as select * from public.vmp_change_sync_next();
select pg_temp.ghi('6', 'sheet sửa 1 dòng, bỏ x 1 dòng: 1 sửa, 1 đánh dấu, 4 giữ nguyên',
  (r->>'updated')::int = 1 and (r->>'flagged_removed')::int = 1 and (r->>'unchanged')::int = 4, r::text)
from (select public.vmp_change_sync_ingest((select run_id from luot3), (select p from p2)) r) t;
select pg_temp.ghi('6', 'phiếu bỏ x: KHÔNG xoá, giữ thiết bị/đợt/hạn web',
  c.removed_from_sheet_at is not null and not c.needs_validation
  and c.deadline_override = date '2026-12-15' and c.handling_status = 'dang_tham_dinh'
  and (select count(*) from public.vmp_change_objects o where o.change_id = c.id) = 1
  and (select count(*) from public.vmp_change_plan_links l where l.change_id = c.id) = 3)
from public.vmp_change_records c where c.change_code = 'CC-XSX-2605-001';
select pg_temp.ghi('6', 'nội dung sửa trên sheet được cập nhật',
  (select change_content from public.vmp_change_records where change_code = 'CC-SX-002/01/26')
    = 'Thay đổi ống trung gian tank 50L (sửa)');

create temp table truoc_chan on commit drop as
select md5(string_agg(c::text, '|' order by c.id)) h from public.vmp_change_records c;

-- (a) thiếu cột "Deadline thẩm định"
insert into public.vmp_change_sync_runs(trigger_kind, status) values ('nut', 'cho');
create temp table luot4 on commit drop as select * from public.vmp_change_sync_next();
select pg_temp.ghi('6', 'thiếu cột Deadline → chặn, báo tên cột',
  r->>'error_code' = 'SHEET_REJECTED' and r->>'error' like '%Deadline thẩm định%', r::text)
from (select public.vmp_change_sync_ingest((select run_id from luot4),
  jsonb_set((select p from p2), '{valueRanges,0,values,0,26}', '"Hạn"'::jsonb)) r) t;
select pg_temp.ghi('6', 'lượt bị chặn ghi trạng thái lỗi',
  (select status = 'loi' and error like '%Deadline%' from public.vmp_change_sync_runs where id = (select run_id from luot4)));
-- (b) tab chỉ còn tiêu đề trong khi đang theo dõi phiếu
insert into public.vmp_change_sync_runs(trigger_kind, status) values ('nut', 'cho');
create temp table luot5 on commit drop as select * from public.vmp_change_sync_next();
select pg_temp.ghi('6', 'tab bỗng trống → chặn',
  r->>'error_code' = 'SHEET_REJECTED' and r->>'error' like '%không còn dòng nào%', r::text)
from (select public.vmp_change_sync_ingest((select run_id from luot5),
  pg_temp.payload('[]'::jsonb, jsonb_build_array(pg_temp.d2('CC-XSX-2610-002', 'x', 'x', 'x', '15/11/2026')))) r) t;
-- (b2) nhóm kia chèn thêm cột "Có cần tiến hành thẩm định…" → không đoán, dừng
insert into public.vmp_change_sync_runs(trigger_kind, status) values ('nut', 'cho');
create temp table luot5b on commit drop as select * from public.vmp_change_sync_next();
select pg_temp.ghi('6', 'cột cần lấy bị trùng tên → chặn',
  r->>'error_code' = 'SHEET_REJECTED' and r->>'error' like '%cột trùng tên%', r::text)
from (select public.vmp_change_sync_ingest((select run_id from luot5b),
  jsonb_set((select p from p2), '{valueRanges,0,values,0,0}', '"Có cần tiến hành thẩm định không? (cũ)"'::jsonb)) r) t;
-- (b3) tiêu đề không phải mảng → chặn, không văng lỗi SQL
insert into public.vmp_change_sync_runs(trigger_kind, status) values ('nut', 'cho');
create temp table luot5c on commit drop as select * from public.vmp_change_sync_next();
select pg_temp.ghi('6', 'dòng tiêu đề sai dạng → chặn có thông báo',
  r->>'error_code' = 'SHEET_REJECTED', r::text)
from (select pg_temp.goi(format($q$select public.vmp_change_sync_ingest(%L::uuid, %L::jsonb)$q$,
  (select run_id from luot5c), '{"valueRanges":[{"range":"''2026''!A1:AA9","values":["a","b"]}]}')) r) t;
-- (c) payload sai dạng
insert into public.vmp_change_sync_runs(trigger_kind, status) values ('nut', 'cho');
create temp table luot6 on commit drop as select * from public.vmp_change_sync_next();
select pg_temp.ghi('6', 'payload sai dạng → chặn',
  r->>'error_code' = 'SHEET_REJECTED', r::text)
from (select public.vmp_change_sync_ingest((select run_id from luot6), '{"error":{"code":403}}'::jsonb) r) t;
select pg_temp.ghi('6', 'sau 3 lần bị chặn, dữ liệu phiếu không đổi',
  (select md5(string_agg(c::text, '|' order by c.id)) from public.vmp_change_records c) = (select h from truoc_chan));
select pg_temp.ghi('6', 'gửi dữ liệu cho lượt đã kết thúc → RUN_NOT_RUNNING',
  r->>'error_code' = 'RUN_NOT_RUNNING', r::text)
from (select public.vmp_change_sync_ingest((select run_id from luot6), (select p from p2)) r) t;
-- (c2) bỏ dấu hàng loạt: 6 phiếu → còn 1 phiếu → chặn
create function pg_temp.tab_rieng(p_codes text[]) returns jsonb language sql as $$
  select jsonb_build_object('valueRanges', jsonb_build_array(jsonb_build_object(
    'range', '''Thử hàng loạt''!A1:C50',
    'values', jsonb_build_array(jsonb_build_array('Mã thay đổi', 'Nội dung thay đổi',
      'Có cần tiến hành thẩm định không?', 'Nội dung thẩm định', 'Deadline thẩm định'))
      || coalesce((select jsonb_agg(jsonb_build_array(c, 'nd', 'x', 'td', '01/12/2026')) from unnest(p_codes) c), '[]'::jsonb))))
$$;
insert into public.vmp_change_sync_runs(trigger_kind, status) values ('nut', 'cho');
create temp table luot6b on commit drop as select * from public.vmp_change_sync_next();
select pg_temp.ghi('6', 'tab thử: nhận 6 phiếu',
  (r->>'created')::int = 6, r::text)
from (select public.vmp_change_sync_ingest((select run_id from luot6b),
  pg_temp.tab_rieng(array['HL-1','HL-2','HL-3','HL-4','HL-5','HL-6'])) r) t;
insert into public.vmp_change_sync_runs(trigger_kind, status) values ('nut', 'cho');
create temp table luot6c on commit drop as select * from public.vmp_change_sync_next();
select pg_temp.ghi('6', '5/6 phiếu bỗng mất dấu → chặn, không đánh dấu phiếu nào',
  r->>'error_code' = 'SHEET_REJECTED' and r->>'error' like '%5/6%'
  and (select count(*) from public.vmp_change_records where source_tab = 'Thử hàng loạt' and removed_from_sheet_at is null) = 6,
  r::text)
from (select public.vmp_change_sync_ingest((select run_id from luot6c), pg_temp.tab_rieng(array['HL-1'])) r) t;
select pg_temp.ghi('6', 'admin web không gọi được lối vượt ngưỡng',
  r->>'sqlstate' = '42501', r::text)
from (select pg_temp.goi($q$select set_config('request.jwt.claims', json_build_object('sub','c0221022-0000-4000-8000-000000000001','role','authenticated')::text, true); set local role authenticated; select public.vmp_change_sync_force_next('thu vuot nguong hang loat')$q$) r) t;
reset role;
select set_config('request.jwt.claims', '', true);
create temp table vuot on commit drop as select public.vmp_change_sync_force_next('Chủ dự án xác nhận nhóm QMS bỏ dấu thật') r;
create temp table luot6d on commit drop as select * from public.vmp_change_sync_next();
select pg_temp.ghi('6', 'lối vượt có lý do: lượt kế tiếp được bỏ 5/6 phiếu, có ghi nhật ký',
  (r->>'ok')::boolean and (r->>'flagged_removed')::int = 5
  and exists (select 1 from public.audit_logs where source = 'vmp_change_sync_force_next'), r::text)
from (select public.vmp_change_sync_ingest((select run_id from luot6d), pg_temp.tab_rieng(array['HL-1'])) r) t;
select pg_temp.ghi('6', 'nhật ký có giá trị cũ khi sheet sửa phiếu',
  exists (select 1 from public.audit_logs where source = 'vmp_change_sync_ingest' and action = 'UPDATE'
           and old_data->>'change_content' = 'Thay đổi ống trung gian tank 50L'
           and new_data->>'change_content' = 'Thay đổi ống trung gian tank 50L (sửa)'));
select pg_temp.ghi('6', 'nhật ký ghi phiếu bị sheet bỏ dấu',
  exists (select 1 from public.audit_logs where source = 'vmp_change_sync_ingest' and action = 'STATUS_CHANGE'
           and new_data->>'change_code' = 'CC-XSX-2605-001'));
-- (d) n8n báo lỗi đọc sheet
insert into public.vmp_change_sync_runs(trigger_kind, status) values ('nut', 'cho');
create temp table luot7 on commit drop as select * from public.vmp_change_sync_next();
create temp table loi7 on commit drop as
select public.vmp_change_sync_fail((select run_id from luot7), 'Google 403') r;
select pg_temp.ghi('6', 'n8n báo lỗi Google → lượt ghi lỗi',
  (select (r->>'ok')::boolean from loi7)
  and (select status = 'loi' and error = 'Google 403' from public.vmp_change_sync_runs where id = (select run_id from luot7)),
  (select r::text from loi7) || ' run=' || coalesce((select run_id::text from luot7), 'NULL'));
-- (d2) yêu cầu Làm mới chờ quá 15 phút (n8n ngừng) → danh sách báo lỗi, bấm lại được
-- now() đứng yên trong một giao dịch: lùi các lượt cũ để lượt chờ này là lượt mới nhất.
update public.vmp_change_sync_runs set requested_at = now() - interval '1 hour';
insert into public.vmp_change_sync_runs(trigger_kind, status, requested_at) values ('nut', 'cho', now() - interval '20 minutes');
set local role authenticated;
select pg_temp.vai(3);
select pg_temp.ghi('6', 'yêu cầu chờ quá 15 phút: danh sách báo lỗi n8n',
  r->'sync'->>'last_status' = 'loi' and r->'sync'->>'last_error' like '%n8n chưa nhận%', left((r->'sync')::text, 200))
from (select public.rpc_change_list() r) t;
select pg_temp.ghi('6', 'bấm Làm mới lại: tạo yêu cầu mới, không kẹt yêu cầu cũ',
  (r->>'already')::boolean = false, r::text)
from (select public.rpc_change_request_sync() r) t;
reset role;
select set_config('request.jwt.claims', '', true);
update public.vmp_change_sync_runs set status = 'loi' where status = 'cho';
-- (e) lượt treo quá 15 phút tự thành lỗi, lượt mới chạy được
insert into public.vmp_change_sync_runs(trigger_kind, status, started_at) values ('nut', 'dang_chay', now() - interval '20 minutes');
insert into public.vmp_change_sync_runs(trigger_kind, status) values ('nut', 'cho');
select pg_temp.ghi('6', 'lượt treo quá 15 phút không chặn lượt mới',
  exists (select 1 from public.vmp_change_sync_next()));

-- ---------------------------------------------------------------------
-- Mục 7: không đụng dữ liệu cũ
-- ---------------------------------------------------------------------
select pg_temp.ghi('7', 'danh mục thiết bị không đổi',
  (select md5(string_agg(t::text, '|' order by t.code)) from public.vmp_objects t) = (select md5_tb from moc));
select pg_temp.ghi('7', 'đợt thẩm định cũ không đổi (chỉ thêm 2 đợt thử)',
  (select count(*) from public.vmp_plan_items) = (select so_dot from moc) + 2
  and (select md5(string_agg(t::text, '|' order by t.id)) from public.vmp_plan_items t
        where t.id not like (select tb_a from moc) || '/2027.%') = (select md5_dot from moc));

-- ---------------------------------------------------------------------
\o
\pset footer off
select muc, case when dat then 'PASS' else 'FAIL' end as kq, ten, chi_tiet from ket_qua order by stt;
select count(*) filter (where dat) as pass, count(*) filter (where not dat) as fail,
       count(*) filter (where not dat) > 0 as co_fail from ket_qua \gset
\echo 'TONG: PASS=':pass' FAIL=':fail
rollback;
\if :co_fail
  \echo 'CO MUC FAIL'
  select 1/0 as co_muc_fail;
\endif

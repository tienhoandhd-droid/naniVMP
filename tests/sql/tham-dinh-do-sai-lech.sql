\set ON_ERROR_STOP on
-- =====================================================================
-- Kiểm migration 20261029100000_tham_dinh_do_sai_lech.sql.
-- CHỈ chạy trên DB THỬ (bản sao production). Toàn bộ trong MỘT giao dịch
-- rồi ROLLBACK: lượt đồng bộ thử, phiếu sai lệch thử đều không ở lại.
-- Chạy sau tests/sql/tham-dinh-do-thay-doi.sql (bộ đó kiểm phần thay đổi).
-- =====================================================================

begin;
\o /dev/null

create temp table ket_qua (
  stt serial, muc text not null, ten text not null, dat boolean not null, chi_tiet text
) on commit drop;

create function pg_temp.ghi(p_muc text, p_ten text, p_dat boolean, p_chi_tiet text default null)
returns void language sql as $$
  insert into pg_temp.ket_qua(muc, ten, dat, chi_tiet)
  values (p_muc, p_ten, coalesce(p_dat, false), p_chi_tiet)
$$;

-- Lượt đồng bộ đang chạy (như n8n vừa nhận).
create function pg_temp.luot() returns uuid language sql as $$
  insert into public.vmp_change_sync_runs(trigger_kind, status, started_at)
  values ('nut', 'dang_chay', now()) returning id
$$;

-- Tab sổ sai lệch y như sheet thật: n8n đọc từ A2 (dòng 1 là "Tự nhảy/Điền").
create function pg_temp.so_sai_lech(p_rows jsonb) returns jsonb language sql as $$
  select jsonb_build_object('range', '''Sổ quản lý sai lệch (2026)''!A2:AE3000', 'majorDimension', 'ROWS',
    'values', jsonb_build_array(jsonb_build_array(
      'STT', 'Mã sai lệch', 'Mã RCA', 'Sự kiện nguồn', 'Đầu lệnh', 'Tên sản phẩm', 'Số lô',
      'Nội dung sai lệch', 'Ngày phát hiện', 'Phân loại mức độ sai lệch', 'Ngày bắt đầu điều tra',
      'Phân loại mức độ điều tra', 'Nguyên nhân gốc rễ', 'Nguyên nhân tiềm ẩn',
      'Nguyên nhân nghi ngờ (nếu có)', 'Phân loại NN gốc rễ', 'Bộ phận liên quan',
      'Thời điểm kết thúc điều tra', 'Tổng thời gian điều tra (Ngày)', 'Mã đánh giá rủi ro',
      'Mã CAPA', 'CAPA', 'Bộ phận thực hiện CAPA', 'Deadline thực hiện CAPA',
      'Tình trạng thực hiện CAPA', 'Folder tập hợp bằng chứng', 'Đánh giá hiệu quả CAPA',
      'Trạng thái tổng thể', 'Ghi chú', 'Lô GMP',
      'Có cần thông báo team VQ thẩm định thiết bị/nhà xưởng hay không?')) || p_rows)
$$;

-- Một dòng sổ sai lệch (31 cột A→AE); p_vq = null → ô cuối bị Google bỏ (dòng ngắn).
create function pg_temp.d(p_ma text, p_noi_dung text, p_vq text) returns jsonb language sql as $$
  select jsonb_build_array('1', p_ma, 'RCA-2606-002', 'OOS-HL274', 'MT01/0626', 'Imanok', '010626',
    p_noi_dung, '01/06/2026', 'Nhỏ', '01/06/2026', 'Mức 3', '', '', '', '', 'RD, QA, XSX', '', '', '',
    'CAPA-26-007', 'Dự kiến thẩm định trên tank mới sau sửa xưởng', 'RD, QA, XSX', '31/08/2026',
    'Đang thực hiện', 'https://drive.google.com/x', '', 'Đóng', '', 'Không')
    || case when p_vq is null then '[]'::jsonb else jsonb_build_array(p_vq) end
$$;

create temp table moc on commit drop as
select (select count(*) from public.vmp_change_records) as so_phieu,
       (select md5(string_agg(t::text, '|' order by t.id)) from public.vmp_change_records t) as md5_phieu;

-- ---------------------------------------------------------------------
-- Mục 1: phiếu thay đổi cũ giữ nguyên, mặc định loại 'thay_doi'
-- ---------------------------------------------------------------------
select pg_temp.ghi('1', 'phiếu cũ đều là loại thay_doi',
  not exists (select 1 from public.vmp_change_records where record_kind <> 'thay_doi'));
select pg_temp.ghi('1', 'cột record_kind chỉ nhận thay_doi/sai_lech',
  exists (select 1 from pg_constraint where conrelid = 'public.vmp_change_records'::regclass
           and contype = 'c' and pg_get_constraintdef(oid) like '%record_kind%sai_lech%'));

-- ---------------------------------------------------------------------
-- Mục 2: hiện tại cột VQ trống hết → không lấy dòng nào ("Không có")
-- ---------------------------------------------------------------------
create temp table l1 on commit drop as select pg_temp.luot() as id;
create temp table k1 on commit drop as
select public.vmp_change_sync_ingest((select id from l1), jsonb_build_object('valueRanges', jsonb_build_array(
  pg_temp.so_sai_lech(jsonb_build_array(
    pg_temp.d('DEV-2606-001', 'Định lượng không đạt', null),
    pg_temp.d('DEV-2606-002', 'Nhiệt độ kho vượt', ''),
    pg_temp.d('DEV-2606-003', 'Ghi không', 'Không')))))) r;
select pg_temp.ghi('2', 'cột VQ trống/Không: lượt đạt, không tạo phiếu',
  (select (r->>'ok')::boolean and (r->>'created')::int = 0 and (r->>'rows_with_code')::int = 3 from k1),
  (select r::text from k1));
select pg_temp.ghi('2', 'không có phiếu sai lệch nào',
  not exists (select 1 from public.vmp_change_records where record_kind = 'sai_lech'));

-- ---------------------------------------------------------------------
-- Mục 3: cột VQ ghi "Có" → tạo phiếu sai lệch đúng cột
-- ---------------------------------------------------------------------
create temp table l2 on commit drop as select pg_temp.luot() as id;
create temp table k2 on commit drop as
select public.vmp_change_sync_ingest((select id from l2), jsonb_build_object('valueRanges', jsonb_build_array(
  pg_temp.so_sai_lech(jsonb_build_array(
    pg_temp.d('DEV-2606-001', 'Định lượng không đạt', 'Có'),
    pg_temp.d('DEV-2606-002', 'Nhiệt độ kho vượt', ' có '),
    pg_temp.d('DEV-2606-003', 'Ghi không', 'Không'),
    pg_temp.d('DEV-2606-004', 'Ghi chữ khác', 'Chưa rõ'),
    pg_temp.d('', 'Có mà thiếu mã', 'Có')))))) r;
select pg_temp.ghi('3', 'chỉ lấy dòng ghi Có (2 phiếu), đếm dòng Có thiếu mã',
  (select (r->>'ok')::boolean and (r->>'created')::int = 2 and (r->>'marked_without_code')::int = 1 from k2),
  (select r::text from k2));
select pg_temp.ghi('3', 'phiếu ghi đúng các cột sổ sai lệch',
  exists (select 1 from public.vmp_change_records
           where change_code = 'DEV-2606-001' and record_kind = 'sai_lech'
             and source_tab = 'Sổ quản lý sai lệch (2026)'
             and change_content = 'Định lượng không đạt'
             and change_class = 'Imanok · Lô 010626'
             and change_type = 'Nhỏ' and opened_text = '01/06/2026'
             and department = 'RD, QA, XSX' and sheet_status = 'Đóng'
             and folder_link = 'https://drive.google.com/x'
             and validation_content = 'Dự kiến thẩm định trên tank mới sau sửa xưởng'
             and deadline_sheet = date '2026-08-31' and validation_mark = 'Có'
             and source_row = 3),
  (select row_to_json(c)::text from public.vmp_change_records c where change_code = 'DEV-2606-001'));
select pg_temp.ghi('3', 'phiếu thay đổi cũ không đổi',
  (select md5(string_agg(t::text, '|' order by t.id)) from public.vmp_change_records t
    where record_kind = 'thay_doi') is not distinct from (select md5_phieu from moc));
select pg_temp.ghi('3', 'danh sách web có record_kind',
  (select public.vmp_change_record_json(null, c.id, true) ->> 'record_kind'
     from public.vmp_change_records c where c.change_code = 'DEV-2606-001') = 'sai_lech');

-- ---------------------------------------------------------------------
-- Mục 4: bỏ chữ Có → đánh dấu sheet bỏ yêu cầu, không xoá
-- ---------------------------------------------------------------------
create temp table l3 on commit drop as select pg_temp.luot() as id;
create temp table k3 on commit drop as
select public.vmp_change_sync_ingest((select id from l3), jsonb_build_object('valueRanges', jsonb_build_array(
  pg_temp.so_sai_lech(jsonb_build_array(
    pg_temp.d('DEV-2606-001', 'Định lượng không đạt', 'Có'),
    pg_temp.d('DEV-2606-002', 'Nhiệt độ kho vượt', '')))))) r;
select pg_temp.ghi('4', 'bỏ chữ Có: phiếu còn, có mốc bỏ yêu cầu',
  (select (r->>'flagged_removed')::int = 1 and (r->>'unchanged')::int = 1 from k3)
  and exists (select 1 from public.vmp_change_records where change_code = 'DEV-2606-002'
               and removed_from_sheet_at is not null and needs_validation = false),
  (select r::text from k3));

-- ---------------------------------------------------------------------
-- Mục 5: sổ sai lệch hỏng/không đọc được → chỉ cảnh báo, không chặn tab thay đổi
-- ---------------------------------------------------------------------
-- Tab thay đổi thử (tên riêng, không đụng phiếu thật).
create function pg_temp.tab_cc(p_ma text) returns jsonb language sql as $$
  select jsonb_build_object('range', '''CC thử''!A1:AA2000', 'values', jsonb_build_array(
    jsonb_build_array('Mã thay đổi', 'Nội dung thay đổi', 'Có cần tiến hành thẩm định không?',
                      'Nội dung thẩm định', 'Deadline thẩm định', 'Mã sai lệch'),
    jsonb_build_array(p_ma, 'Bổ sung tank', 'x', 'Thẩm định tank', '30/11/2026', 'DEV-1')))
$$;
create temp table l4 on commit drop as select pg_temp.luot() as id;
create temp table k4 on commit drop as
select public.vmp_change_sync_ingest((select id from l4), jsonb_build_object('valueRanges', jsonb_build_array(
  pg_temp.tab_cc('CC-THU-001'),
  jsonb_build_object('range', '''Sổ quản lý sai lệch (2026)''!A2:AE3000',
    'values', jsonb_build_array(jsonb_build_array('STT', 'Mã sai lệch', 'Nội dung sai lệch'),
                                jsonb_build_array('1', 'DEV-2606-001', 'abc')))))) r;
select pg_temp.ghi('5', 'sổ sai lệch thiếu cột VQ: lượt vẫn đạt, có cảnh báo đúng tên cột',
  (select (r->>'ok')::boolean and (r->>'created')::int = 1
          and r->>'canh_bao' like '%Có cần thông báo team VQ%' from k4)
  and (select status = 'xong' and error like '%Có cần thông báo team VQ%'
         from public.vmp_change_sync_runs where id = (select id from l4)),
  (select r::text from k4));
select pg_temp.ghi('5', 'tab thay đổi có cột "Mã sai lệch" vẫn là phiếu thay đổi',
  (select record_kind from public.vmp_change_records where change_code = 'CC-THU-001') = 'thay_doi');
select pg_temp.ghi('5', 'phiếu sai lệch giữ nguyên khi sổ hỏng (không bị đánh dấu bỏ)',
  exists (select 1 from public.vmp_change_records where change_code = 'DEV-2606-001'
           and removed_from_sheet_at is null));

create temp table l5 on commit drop as select pg_temp.luot() as id;
create temp table k5 on commit drop as
select public.vmp_change_sync_ingest((select id from l5), jsonb_build_object(
  'valueRanges', jsonb_build_array(pg_temp.tab_cc('CC-THU-001')),
  'loi_doc_sai_lech', 'The credential needs to be reconnected')) r;
select pg_temp.ghi('5', 'n8n không đọc được sổ sai lệch: phiếu thay đổi vẫn cập nhật, có cảnh báo',
  (select (r->>'ok')::boolean and (r->>'unchanged')::int = 1
          and r->>'canh_bao' like '%Không đọc được sổ sai lệch%' from k5)
  and exists (select 1 from public.vmp_change_records where change_code = 'DEV-2606-001'
               and removed_from_sheet_at is null),
  (select r::text from k5));

create temp table l6 on commit drop as select pg_temp.luot() as id;
create temp table k6 on commit drop as
select public.vmp_change_sync_ingest((select id from l6),
  jsonb_build_object('valueRanges', jsonb_build_array(pg_temp.tab_cc('CC-THU-001')))) r;
select pg_temp.ghi('5', 'lượt không cảnh báo thì error trống',
  (select status = 'xong' and error is null from public.vmp_change_sync_runs where id = (select id from l6)));

-- Sheet thay đổi hỏng vẫn chặn cả lượt như cũ.
create temp table l7 on commit drop as select pg_temp.luot() as id;
create temp table k7 on commit drop as
select public.vmp_change_sync_ingest((select id from l7), jsonb_build_object('valueRanges', jsonb_build_array(
  jsonb_build_object('range', '''CC thử''!A1:AA2000', 'values',
    jsonb_build_array(jsonb_build_array('Mã thay đổi', 'Nội dung thay đổi')))))) r;
select pg_temp.ghi('5', 'sheet thay đổi thiếu cột: vẫn dừng lượt (lỗi)',
  (select (r->>'ok')::boolean = false from k7)
  and (select status from public.vmp_change_sync_runs where id = (select id from l7)) = 'loi',
  (select r::text from k7));

-- ---------------------------------------------------------------------
-- Mục 5b: trợ lý VMP không tính sai lệch vào "phiếu thay đổi"
-- ---------------------------------------------------------------------
select pg_temp.ghi('5b', 'vmp_tl_thay_doi chỉ đọc record_kind = thay_doi',
  pg_get_functiondef('public.vmp_tl_thay_doi(uuid,jsonb)'::regprocedure) like '%c.record_kind = ''thay_doi''%');
select pg_temp.ghi('5b', 'vmp_tl_thiet_bi chỉ đọc record_kind = thay_doi',
  pg_get_functiondef('public.vmp_tl_thiet_bi(uuid,jsonb)'::regprocedure) like '%c.record_kind = ''thay_doi''%');

-- ---------------------------------------------------------------------
-- Mục 6: quyền hàm giữ nguyên
-- ---------------------------------------------------------------------
select pg_temp.ghi('6', 'authenticated/anon không gọi được ingest',
  not has_function_privilege('authenticated', 'public.vmp_change_sync_ingest(uuid,jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.vmp_change_sync_ingest(uuid,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.vmp_change_sync_ingest(uuid,jsonb)', 'execute'));
select pg_temp.ghi('6', 'quyền 2 hàm trợ lý giữ nguyên (authenticated không gọi trực tiếp)',
  not has_function_privilege('anon', 'public.vmp_tl_thay_doi(uuid,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.vmp_tl_thay_doi(uuid,jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.vmp_tl_thiet_bi(uuid,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.vmp_tl_thiet_bi(uuid,jsonb)', 'execute'));
select pg_temp.ghi('6', 'authenticated/anon không gọi được record_json',
  not has_function_privilege('authenticated', 'public.vmp_change_record_json(uuid,uuid,boolean)', 'execute')
  and not has_function_privilege('anon', 'public.vmp_change_record_json(uuid,uuid,boolean)', 'execute'));

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

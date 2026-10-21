\set ON_ERROR_STOP on
-- =====================================================================
-- Kiểm migration 20261021120000_va_bao_mat_ra_soat.sql theo vai (JWT giả).
-- CHỈ chạy trên DB THỬ (bản sao production). Toàn bộ chạy trong MỘT giao
-- dịch rồi ROLLBACK: người dùng thử, phạm vi thử, đề xuất… đều không ở lại.
--
-- Trước migration: các dòng FAIL là bằng chứng RED.
-- Sau migration:   mọi dòng phải PASS; có FAIL thì lệnh dừng với lỗi.
--
-- Người dùng thử (tạo trong giao dịch):
--   b…01 admin · b…02 qa_manager · b…03 qa_staff · b…05 workshop_staff
--   (có phạm vi thử) · b…06 đã tắt · b…07 view_only (vai nghiệp vụ NULL)
--   b…08 workshop_staff KHÔNG phạm vi
-- =====================================================================

begin;
\o /dev/null

create temp table ket_qua (
  stt serial, muc text not null, ten text not null, dat boolean not null, chi_tiet text
) on commit drop;
grant select, insert on ket_qua to authenticated, service_role;
grant usage on sequence ket_qua_stt_seq to authenticated, service_role;

create function pg_temp.ghi(p_muc text, p_ten text, p_dat boolean, p_chi_tiet text default null)
returns void language sql as $$
  insert into pg_temp.ket_qua(muc, ten, dat, chi_tiet)
  values (p_muc, p_ten, coalesce(p_dat, false), p_chi_tiet)
$$;

create function pg_temp.vai(n integer) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', 'b0210210-0000-4000-8000-' || lpad(n::text, 12, '0'),
    'role', 'authenticated', 'aal', 'aal1')::text, true)
$$;

-- Gọi một câu SQL trả jsonb; lỗi quyền (42501) trả về {"sqlstate":"42501"}.
create function pg_temp.goi(p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  execute p_sql into v;
  return coalesce(v, 'null'::jsonb);
exception when others then
  return jsonb_build_object('sqlstate', sqlstate, 'loi', sqlerrm);
end $$;

-- ---------------------------------------------------------------------
-- Fixture: 8 tài khoản thử (giống audit-db/02-seed-users.sql)
-- ---------------------------------------------------------------------
insert into public.vmp_email_cho_phep(email, ghi_chu)
select 'baomat1021-' || n || '@example.test', 'SQL security test only'
from generate_series(1, 8) n on conflict do nothing;
insert into auth.users(id, aud, role, email, created_at, updated_at)
select ('b0210210-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'authenticated', 'authenticated', 'baomat1021-' || n || '@example.test', now(), now()
from generate_series(1, 8) n on conflict do nothing;
insert into public.profiles(id, full_name, email, role, department, is_active)
select ('b0210210-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'Bao mat thu ' || n, 'baomat1021-' || n || '@example.test',
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
where user_id::text like 'b0210210-%';

-- Mốc so sánh (đọc bằng quyền chủ, chưa có JWT)
create temp table moc on commit drop as
select
  (select jsonb_agg(x->>'validation_code') from jsonb_array_elements(public.rpc_due_alerts()) x) as canh_bao_tat_ca,
  jsonb_array_length(public.rpc_check_data_quality()) as so_loi_dl,
  (select bfo_code from public.vmp_products_gmp order by bfo_code limit 1) as bfo,
  (select id from public.vmp_alert_recipients order by id limit 1) as nguoi_nhan,
  (select item.validation_code from public.vmp_plan_items item
     join public.vmp_source_objects s on s.object_code = item.object_code and s.is_active
    where item.is_active group by item.validation_code having count(*) = 1
    order by 1 limit 1) as ma_hang_muc,
  (select o.code from public.vmp_objects o
     join public.vmp_source_objects s on s.object_code = o.code and s.is_active
    where o.is_active group by o.code having count(*) = 1 order by 1 limit 1) as ma_doi_tuong;
grant select on moc to authenticated, service_role;

-- Phạm vi thử cho b…05: đúng bộ phận/khu vực của hạng mục đầu tiên trong cảnh báo
insert into public.vmp_source_workshop_scope_grants(
  performer_id, department, department_key, area_code, area_key, change_reason)
select f.id, s.department, public.vmp_source_scope_key(s.department),
       s.area_code, public.vmp_source_scope_key(s.area_code), 'SQL security test only'
from public.vmp_performers f,
     public.vmp_plan_items item
     join public.vmp_source_objects s on s.object_code = item.object_code and s.is_active
where f.user_id = 'b0210210-0000-4000-8000-000000000005'
  and item.validation_code = (select canh_bao_tat_ca->>0 from moc)
limit 1;

-- ---------------------------------------------------------------------
-- Mục 1: cổng phiên không được trả NULL
-- ---------------------------------------------------------------------
select pg_temp.ghi('1', 'vmp_is_active_session(view_only) = false (không NULL)',
  public.vmp_is_active_session('b0210210-0000-4000-8000-000000000007') is false,
  coalesce(public.vmp_is_active_session('b0210210-0000-4000-8000-000000000007')::text, 'NULL'));
select pg_temp.ghi('1', 'vmp_is_active_session(qa_manager) = true',
  public.vmp_is_active_session('b0210210-0000-4000-8000-000000000002') is true);

set local role authenticated;
select pg_temp.vai(7);
select pg_temp.ghi('1', 'view_only: tạo đề xuất tái thẩm định bị từ chối 42501',
  r->>'sqlstate' = '42501', r::text)
from (select pg_temp.goi('select public.rpc_refresh_revalidation_proposals()') r) t;
select pg_temp.ghi('1', 'view_only: bác đề xuất bị từ chối 42501',
  r->>'sqlstate' = '42501', r::text)
from (select pg_temp.goi($q$select public.rpc_dismiss_revalidation_proposal(gen_random_uuid(), 'thu bac de xuat', 1)$q$) r) t;
select pg_temp.ghi('1', 'view_only: xác nhận đề xuất bị từ chối 42501',
  r->>'sqlstate' = '42501', r::text)
from (select pg_temp.goi($q$select public.rpc_confirm_revalidation_proposal(gen_random_uuid(), 'thu xac nhan', 1)$q$) r) t;
select pg_temp.ghi('1', 'view_only: rpc_due_alerts trả lời từ chối, không trả danh sách',
  jsonb_typeof(r) = 'object' and r->>'error_code' = 'ROLE_UNRESOLVED',
  left(r::text, 120))
from (select pg_temp.goi('select public.rpc_due_alerts()') r) t;
select pg_temp.ghi('1', 'view_only: rpc_check_data_quality trả lời từ chối',
  jsonb_typeof(r) = 'object' and r->>'error_code' = 'ROLE_UNRESOLVED',
  left(r::text, 120))
from (select pg_temp.goi('select public.rpc_check_data_quality()') r) t;

select pg_temp.vai(2);
select pg_temp.ghi('1', 'qa_manager: vẫn làm mới được đề xuất',
  (r->>'ok')::boolean is true, left(r::text, 160))
from (select pg_temp.goi('select public.rpc_refresh_revalidation_proposals()') r) t;
select pg_temp.vai(5);
select pg_temp.ghi('1', 'workshop_staff: vẫn bị từ chối bác đề xuất',
  r->>'sqlstate' = '42501', r::text)
from (select pg_temp.goi($q$select public.rpc_dismiss_revalidation_proposal(gen_random_uuid(), 'thu bac de xuat', 1)$q$) r) t;
reset role;

-- ---------------------------------------------------------------------
-- Mục 2: version bắt buộc với bản ghi đã có (luồng một phiên;
-- luồng hai phiên đồng thời: scripts/run-bao-mat-version-race.sh)
-- ---------------------------------------------------------------------
set local role authenticated;
select pg_temp.vai(2);
select pg_temp.ghi('2', 'sản phẩm GMP: thiếu version với bản ghi đã có → VERSION_REQUIRED, báo mã đã tồn tại',
  r->>'error_code' = 'VERSION_REQUIRED' and r->>'error' = 'Mã đã tồn tại — tải lại để sửa bản hiện có.', left(r::text, 160))
from (select pg_temp.goi(format('select public.rpc_save_product_gmp(%L, %L::jsonb, null, null)',
        (select bfo from moc), '{"note":"thu khong version"}')) r) t;
select pg_temp.ghi('2', 'sản phẩm GMP: sai version → VERSION_CONFLICT',
  r->>'error_code' = 'VERSION_CONFLICT', left(r::text, 160))
from (select pg_temp.goi(format('select public.rpc_save_product_gmp(%L, %L::jsonb, null, %s)',
        (select bfo from moc), '{"note":"thu sai version"}',
        (select version + 7 from public.vmp_products_gmp where bfo_code = (select bfo from moc)))) r) t;
select pg_temp.ghi('2', 'sản phẩm GMP: đúng version → ok',
  (r->>'ok')::boolean is true, left(r::text, 160))
from (select pg_temp.goi(format('select public.rpc_save_product_gmp(%L, %L::jsonb, null, %s)',
        (select bfo from moc), '{"note":"thu dung version"}',
        (select version from public.vmp_products_gmp where bfo_code = (select bfo from moc)))) r) t;
select pg_temp.ghi('2', 'người nhận cảnh báo: thiếu version → VERSION_REQUIRED',
  r->>'error_code' = 'VERSION_REQUIRED', left(r::text, 160))
from (select pg_temp.goi(format('select public.rpc_save_alert_recipient(%L::uuid, %L::jsonb, null, null)',
        (select nguoi_nhan from moc), '{"note":"thu khong version"}')) r) t;
select pg_temp.ghi('2', 'người nhận cảnh báo: đúng version → ok',
  (r->>'ok')::boolean is true, left(r::text, 160))
from (select pg_temp.goi(format('select public.rpc_save_alert_recipient(%L::uuid, %L::jsonb, null, %s)',
        (select nguoi_nhan from moc), '{"note":"thu dung version"}',
        (select version from public.vmp_alert_recipients where id = (select nguoi_nhan from moc)))) r) t;
reset role;

-- ---------------------------------------------------------------------
-- Mục 3: ba RPC cũ không còn gọi được bằng tài khoản web; CHECK tần suất
-- ---------------------------------------------------------------------
select pg_temp.ghi('3', 'authenticated KHÔNG có EXECUTE ' || f,
  not has_function_privilege('authenticated', f, 'EXECUTE'))
from unnest(array[
  'public.rpc_upsert_object(text,text,text,text,text,text,integer,text)',
  'public.rpc_upsert_source_row(text,integer,jsonb)',
  'public.rpc_delete_source_row(text,integer)']) f;
select pg_temp.ghi('3', 'anon KHÔNG có EXECUTE ' || f,
  not has_function_privilege('anon', f, 'EXECUTE'))
from unnest(array[
  'public.rpc_upsert_object(text,text,text,text,text,text,integer,text)',
  'public.rpc_upsert_source_row(text,integer,jsonb)',
  'public.rpc_delete_source_row(text,integer)']) f;
select pg_temp.ghi('3', 'service_role vẫn có EXECUTE ' || f,
  has_function_privilege('service_role', f, 'EXECUTE'))
from unnest(array[
  'public.rpc_upsert_object(text,text,text,text,text,text,integer,text)',
  'public.rpc_upsert_source_row(text,integer,jsonb)',
  'public.rpc_delete_source_row(text,integer)']) f;
set local role authenticated;
select pg_temp.vai(2);
select pg_temp.ghi('3', 'qa_manager gọi rpc_upsert_object → 42501',
  r->>'sqlstate' = '42501', left(r::text, 160))
from (select pg_temp.goi($q$select public.rpc_upsert_object('CMTB202', '  ', 'x', null, null, null, -5, null)$q$) r) t;
reset role;
select pg_temp.ghi('3', 'CHECK tần suất 1..120 có trên ' || t,
  exists (select 1 from pg_constraint where conrelid = t::regclass
          and pg_get_constraintdef(oid) ~ 'frequency_months >= 1.*frequency_months <= 120'))
from unnest(array['public.vmp_objects', 'public.vmp_source_objects']) t;
select pg_temp.ghi('3', 'CHECK chặn tần suất -5 trên vmp_objects',
  r->>'sqlstate' = '23514', left(r::text, 160))
from (select pg_temp.goi($q$with u as (update public.vmp_objects set frequency_months = -5
        where code = (select code from public.vmp_objects order by code limit 1) returning 1)
        select to_jsonb(count(*)) from u$q$) r) t;

-- ---------------------------------------------------------------------
-- Mục 4: ngày tiến độ ngoài khoảng 01/01/2020 … hôm nay + 1 năm
-- ---------------------------------------------------------------------
set local role authenticated;
select pg_temp.vai(2);
select pg_temp.ghi('4', 'ngày đề cương 1900-01-01 bị từ chối',
  r->>'code' = 'ngay_ngoai_khoang', left(r::text, 200))
from (select pg_temp.goi(format('select public.rpc_update_progress(%L, %L::jsonb, %L, null, null)',
        (select ma_hang_muc from moc), '{"actual_protocol_date":"1900-01-01"}', 'kiem thu')) r) t;
select pg_temp.ghi('4', 'ngày báo cáo 2019-12-31 bị từ chối',
  r->>'code' = 'ngay_ngoai_khoang', left(r::text, 200))
from (select pg_temp.goi(format('select public.rpc_update_progress(%L, %L::jsonb, %L, null, null)',
        (select ma_hang_muc from moc), '{"actual_report_date":"2019-12-31"}', 'kiem thu')) r) t;
select pg_temp.ghi('4', 'lịch thực hiện quá hôm nay + 1 năm bị từ chối',
  r->>'code' = 'ngay_ngoai_khoang', left(r::text, 200))
from (select pg_temp.goi(format('select public.rpc_update_progress(%L, %L::jsonb, %L, null, null)',
        (select ma_hang_muc from moc),
        jsonb_build_object('scheduled_at', to_char((now() at time zone 'Asia/Bangkok')::date + 400, 'YYYY-MM-DD') || 'T01:00:00.000Z'),
        'kiem thu')) r) t;
-- Chuỗi lách kiểm cũ (review 21/10): mỗi ca phải bị từ chối với đúng mã.
select pg_temp.ghi('4', format('%s = %s → %s', k, v, ma),
  r->>'code' = ma, left(r::text, 200))
from (values
  ('actual_protocol_date', to_jsonb(' 2019-01-01'::text), 'ngay_sai_dinh_dang'),
  ('actual_protocol_date', to_jsonb('20190101'::text), 'ngay_sai_dinh_dang'),
  ('actual_protocol_date', to_jsonb('2019-1-1'::text), 'ngay_sai_dinh_dang'),
  ('actual_protocol_date', to_jsonb('epoch'::text), 'ngay_sai_dinh_dang'),
  ('actual_protocol_date', to_jsonb('-infinity'::text), 'ngay_sai_dinh_dang'),
  ('actual_protocol_date', to_jsonb('2026-02-30'::text), 'ngay_sai_dinh_dang'),
  ('actual_protocol_date', to_jsonb('2026-10-01 '::text), 'ngay_sai_dinh_dang'),
  ('actual_protocol_date', to_jsonb(20260101), 'ngay_sai_dinh_dang'),
  ('actual_vmp_date', to_jsonb('2019-12-31'::text), 'ngay_ngoai_khoang'),
  ('scheduled_at', to_jsonb(' 2030-01-01'::text), 'ngay_sai_dinh_dang'),
  ('scheduled_at', to_jsonb('2030-01-01T00:00:00Z'::text), 'ngay_ngoai_khoang'),
  ('scheduled_at', to_jsonb('01/01/2099'::text), 'ngay_ngoai_khoang'),
  ('scheduled_at', to_jsonb('infinity'::text), 'ngay_sai_dinh_dang'),
  ('scheduled_at', to_jsonb('30/02/2026'::text), 'ngay_sai_dinh_dang'),
  ('scheduled_date', to_jsonb('2019-06-01'::text), 'ngay_ngoai_khoang')
) c(k, v, ma),
lateral (select pg_temp.goi(format('select public.rpc_update_progress(%L, %L::jsonb, %L, null, null)',
        (select ma_hang_muc from moc), jsonb_build_object(k, v), 'kiem thu')) r) t;
-- Dạng web thật gửi (ô date 'YYYY-MM-DD', lịch toISOString()) và dạng
-- dd/mm/yyyy của bộ đọc lịch: không bị luật ngày chặn.
select pg_temp.ghi('4', format('dạng hợp lệ %s = %s không bị chặn', k, v),
  coalesce(r->>'code', '') not in ('ngay_sai_dinh_dang', 'ngay_ngoai_khoang'), left(r::text, 200))
from (values
  ('actual_protocol_date', to_char((now() at time zone 'Asia/Bangkok')::date - 1, 'YYYY-MM-DD')),
  ('scheduled_at', to_char((now() at time zone 'Asia/Bangkok')::date + 20, 'YYYY-MM-DD') || 'T02:30:00.000Z'),
  ('scheduled_at', to_char((now() at time zone 'Asia/Bangkok')::date + 20, 'DD/MM/YYYY') || ' 08:00')
) c(k, v),
lateral (select pg_temp.goi(format('select public.rpc_update_progress(%L, %L::jsonb, %L, null, null)',
        (select ma_hang_muc from moc), jsonb_build_object(k, v), 'kiem thu')) r) t;
select pg_temp.ghi('4', 'xoá ngày (null) không bị luật ngày chặn',
  coalesce(r->>'code', '') not in ('ngay_sai_dinh_dang', 'ngay_ngoai_khoang'), left(r::text, 200))
from (select pg_temp.goi(format('select public.rpc_update_progress(%L, %L::jsonb, %L, null, null)',
        (select ma_hang_muc from moc), '{"actual_protocol_date":null}', 'kiem thu')) r) t;
select pg_temp.ghi('4', 'lịch thực hiện trong khoảng không bị luật ngày chặn',
  coalesce(r->>'code', '') <> 'ngay_ngoai_khoang', left(r::text, 200))
from (select pg_temp.goi(format('select public.rpc_update_progress(%L, %L::jsonb, %L, null, null)',
        (select ma_hang_muc from moc),
        jsonb_build_object('scheduled_at', to_char((now() at time zone 'Asia/Bangkok')::date + 30, 'YYYY-MM-DD') || 'T01:00:00.000Z'),
        'kiem thu')) r) t;
reset role;

-- ---------------------------------------------------------------------
-- Mục 5: không ghi thẳng qua REST vào 4 bảng; đọc giữ nguyên
-- ---------------------------------------------------------------------
select pg_temp.ghi('5', 'authenticated không có ' || p || ' trên ' || t,
  not has_table_privilege('authenticated', t, p))
from unnest(array['public.vmp_deadline_rules', 'public.vmp_report_snapshots',
                  'public.vmp_notifications', 'public.departments']) t,
     unnest(array['INSERT', 'UPDATE', 'DELETE']) p;
select pg_temp.ghi('5', 'authenticated vẫn có SELECT trên ' || t,
  has_table_privilege('authenticated', t, 'SELECT'))
from unnest(array['public.vmp_deadline_rules', 'public.vmp_report_snapshots',
                  'public.vmp_notifications', 'public.departments']) t;
set local role authenticated;
select pg_temp.vai(2);
select pg_temp.ghi('5', 'qa_manager PATCH vmp_deadline_rules → 42501',
  r->>'sqlstate' = '42501', left(r::text, 160))
from (select pg_temp.goi($q$with u as (update public.vmp_deadline_rules set updated_at = updated_at returning 1)
        select to_jsonb(count(*)) from u$q$) r) t;
select pg_temp.ghi('5', 'qa_manager INSERT vmp_notifications → 42501',
  r->>'sqlstate' = '42501', left(r::text, 160))
from (select pg_temp.goi($q$with u as (insert into public.vmp_notifications(recipient_email) values ('ngoai@example.org') returning 1)
        select to_jsonb(count(*)) from u$q$) r) t;
select pg_temp.ghi('5', 'qa_manager vẫn đọc được vmp_deadline_rules và departments',
  (select count(*) from public.vmp_deadline_rules) > 0 and (select count(*) from public.departments) > 0);
reset role;

-- ---------------------------------------------------------------------
-- Mục 6: rpc_create_plan_item kiểm năm và loại thẩm định
-- ---------------------------------------------------------------------
set local role authenticated;
select pg_temp.vai(2);
select pg_temp.ghi('6', 'năm 3000 bị từ chối',
  (r->>'ok')::boolean is false and r->>'error' ~ 'Năm', left(r::text, 200))
from (select pg_temp.goi(format('select public.rpc_create_plan_item(%L, %L, 3000, 98)', (select ma_doi_tuong from moc), 'OQ')) r) t;
select pg_temp.ghi('6', 'năm 1 bị từ chối',
  (r->>'ok')::boolean is false and r->>'error' ~ 'Năm', left(r::text, 200))
from (select pg_temp.goi(format('select public.rpc_create_plan_item(%L, %L, 1, 98)', (select ma_doi_tuong from moc), 'OQ')) r) t;
select pg_temp.ghi('6', 'loại thẩm định lạ bị từ chối',
  (r->>'ok')::boolean is false and r->>'error' ~ 'Loại thẩm định', left(r::text, 200))
from (select pg_temp.goi(format('select public.rpc_create_plan_item(%L, %L, 2026, 98)', (select ma_doi_tuong from moc), 'ZZ<b>x</b>')) r) t;
select pg_temp.ghi('6', 'hợp lệ (2026, FAT/SAT) vẫn tạo được',
  (r->>'ok')::boolean is true, left(r::text, 200))
from (select pg_temp.goi(format('select public.rpc_create_plan_item(%L, %L, 2026, 98)', (select ma_doi_tuong from moc), 'FAT/SAT')) r) t;
reset role;

-- ---------------------------------------------------------------------
-- Mục 7: tài khoản đã tắt không đọc được các bảng "cho tất cả"
-- ---------------------------------------------------------------------
create temp table bang_doc on commit drop as
select t, (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.' || t, false, true, '')))[1]::text::int as so_dong
from unnest(array['departments', 'vmp_ai_bi_danh', 'vmp_ai_bo_kiem', 'vmp_ai_cau_hoi_vang',
  'vmp_ai_dong_nghia', 'vmp_ai_giong', 'vmp_ai_mo_hinh', 'vmp_assignment_rules', 'vmp_chat_giong',
  'vmp_danh_gia_anh_huong', 'vmp_deadline_rules', 'vmp_diem_truoc_khi_doi', 'vmp_kb_chunks',
  'vmp_kb_documents', 'vmp_objects', 'vmp_role_permissions']) t;
grant select on bang_doc to authenticated, service_role;
set local role authenticated;
select pg_temp.vai(6);
select pg_temp.ghi('7', 'đã tắt đọc ' || t || ' = 0 dòng',
  (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.' || t, false, true, '')))[1]::text::int = 0,
  'trước: ' || so_dong)
from bang_doc;
select pg_temp.vai(3);
select pg_temp.ghi('7', 'qa_staff đọc ' || t || ' như cũ',
  (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.' || t, false, true, '')))[1]::text::int = so_dong,
  'mốc: ' || so_dong)
from bang_doc;
reset role;
set local role service_role;
select pg_temp.ghi('7', 'service_role đọc vmp_objects như cũ',
  (select count(*) from public.vmp_objects) = (select so_dong from bang_doc where t = 'vmp_objects'));
reset role;

-- ---------------------------------------------------------------------
-- Mục 8: cảnh báo hạn / lỗi dữ liệu lọc theo phạm vi đọc
-- ---------------------------------------------------------------------
-- Mốc lấy lại ở đây vì các mục trên đã đổi dữ liệu trong giao dịch.
create temp table moc8 on commit drop as
select (select jsonb_agg(x->>'validation_code') from jsonb_array_elements(public.rpc_due_alerts()) x) as canh_bao_tat_ca,
       jsonb_array_length(public.rpc_check_data_quality()) as so_loi_dl;
grant select on moc8 to authenticated, service_role;
set local role authenticated;
select pg_temp.vai(8);
select pg_temp.ghi('8', 'workshop không phạm vi: 0 cảnh báo hạn',
  jsonb_typeof(r) = 'array' and jsonb_array_length(r) = 0,
  'nhận ' || coalesce(jsonb_array_length(case when jsonb_typeof(r) = 'array' then r end), -1)
  || '/' || (select jsonb_array_length(canh_bao_tat_ca) from moc8))
from (select pg_temp.goi('select public.rpc_due_alerts()') r) t;
select pg_temp.ghi('8', 'workshop không phạm vi: 0 lỗi dữ liệu',
  jsonb_typeof(r) = 'array' and jsonb_array_length(r) = 0,
  'nhận ' || coalesce(jsonb_array_length(case when jsonb_typeof(r) = 'array' then r end), -1))
from (select pg_temp.goi('select public.rpc_check_data_quality()') r) t;
select pg_temp.vai(5);
select pg_temp.ghi('8', 'workshop có phạm vi: chỉ nhận hạng mục trong phạm vi (>0 và ít hơn tất cả)',
  jsonb_typeof(r) = 'array' and jsonb_array_length(r) > 0
    and jsonb_array_length(r) < (select jsonb_array_length(canh_bao_tat_ca) from moc8)
    and not exists (select 1 from jsonb_array_elements(r) x
      where not public.vmp_can_view_plan_item(auth.uid(), x->>'validation_code')),
  'nhận ' || coalesce(jsonb_array_length(case when jsonb_typeof(r) = 'array' then r end), -1))
from (select pg_temp.goi('select public.rpc_due_alerts()') r) t;
select pg_temp.vai(1);
select pg_temp.ghi('8', 'admin: cảnh báo hạn như cũ',
  (select jsonb_agg(x->>'validation_code') from jsonb_array_elements(public.rpc_due_alerts()) x)
    = (select canh_bao_tat_ca from moc8));
select pg_temp.vai(2);
select pg_temp.ghi('8', 'qa_manager: cảnh báo hạn và lỗi dữ liệu như cũ',
  (select jsonb_agg(x->>'validation_code') from jsonb_array_elements(public.rpc_due_alerts()) x)
    = (select canh_bao_tat_ca from moc8)
  and jsonb_array_length(public.rpc_check_data_quality()) = (select so_loi_dl from moc8));
select pg_temp.vai(3);
select pg_temp.ghi('8', 'qa_staff: cảnh báo hạn như cũ',
  (select jsonb_agg(x->>'validation_code') from jsonb_array_elements(public.rpc_due_alerts()) x)
    = (select canh_bao_tat_ca from moc8));
reset role;
select pg_temp.ghi('8', 'kết nối n8n (không JWT): cảnh báo hạn như cũ',
  (select jsonb_agg(x->>'validation_code') from jsonb_array_elements(public.rpc_due_alerts()) x)
    = (select canh_bao_tat_ca from moc8));

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

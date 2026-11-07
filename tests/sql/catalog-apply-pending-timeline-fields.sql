\set ON_ERROR_STOP on
-- =====================================================================
-- Áp dụng thay đổi danh mục phải GHI các trường timeline đang chờ.
-- ---------------------------------------------------------------------
-- Lỗi gốc (từ migration 20260828150000): rpc_save_catalog_object giữ
-- frequency_months/first_month/report_class/workdays/validate_flag/is_active
-- trong vmp_catalog_changes.new_data, nhưng preview/apply đọc giá trị CŨ
-- của vmp_source_objects và không bao giờ ghi new_data vào đó. Hệ quả:
--   · đổi tần suất 12 → 6 không sinh lần 2;
--   · thêm đối tượng mới không sinh hạng mục nào (NO_ACTIONABLE_CHANGE).
-- Chạy trên bản sao production, trong một giao dịch rồi ROLLBACK.
-- =====================================================================
begin;
set local lock_timeout = '5s';
select set_config('request.jwt.claim.sub', (
  select p.id::text from public.profiles p
  where public.vmp_business_role(p.id) = 'admin' and p.is_active
  order by p.id limit 1), true);

create temp table kq(buoc text, res jsonb) on commit drop;
-- Số hạng mục đang hiệu lực của MỌI đối tượng, chụp trước khi thử.
create temp table kq_truoc on commit drop as
  select validation_code, object_code from public.vmp_plan_items where is_active;

-- ---- Ca 1: HT-15 đổi tần suất 12 → 6 tháng -----------------------------
insert into kq select 'ht15_luu', public.rpc_save_catalog_object('Hệ thống phụ trợ', 'HT-15',
  '{"frequency_months":6}'::jsonb, 'Test: 6 tháng/lần',
  (select version from public.vmp_source_objects where object_code = 'HT-15'));
insert into kq select 'ht15_xem', public.rpc_preview_catalog_change_v2(
  (select (res->>'change_id')::uuid from kq where buoc = 'ht15_luu'));
insert into kq select 'ht15_ap', public.rpc_apply_catalog_change_v2(
  (select (res->>'change_id')::uuid from kq where buoc = 'ht15_luu'), 'Test áp 6 tháng',
  (select (res->>'timeline_revision')::int from kq where buoc = 'ht15_luu'), '[]'::jsonb, false);

do $$
declare v_xem jsonb := (select res from kq where buoc = 'ht15_xem');
        v_ap jsonb := (select res from kq where buoc = 'ht15_ap');
begin
  assert (select (res->>'ok')::boolean from kq where buoc = 'ht15_luu'), 'lưu HT-15 phải thành công';
  assert jsonb_array_length(v_xem->'tao') = 2,
    'xem trước phải đề xuất tạo 2 hạng mục lần 2 (OQ, PQ), thấy: ' || coalesce(v_xem->>'tao', 'null');
  assert (v_ap->>'ok')::boolean, 'áp HT-15 phải thành công, thấy: ' || v_ap::text;
  assert (select frequency_months from public.vmp_source_objects where object_code = 'HT-15') = 6,
    'Danh mục phải lưu tần suất 6';
  assert (select count(*) from public.vmp_plan_items
          where validation_code in ('HT-15/2026.02-OQ', 'HT-15/2026.02-PQ')
            and deadline_vmp is not null and deadline_protocol is not null
            and deadline_validation is not null and deadline_report is not null) = 2,
    'hai hạng mục lần 2 phải có đủ bốn hạn';
  assert (select count(*) from public.vmp_plan_items
          where validation_code in ('HT-15/2026.02-OQ', 'HT-15/2026.02-PQ')
            and owner_name is not distinct from
                (select owner_name from public.vmp_source_objects where object_code = 'HT-15')) = 2,
    'hạng mục lần 2 phải có QA phụ trách theo Danh mục';
  assert (select deadline_vmp from public.vmp_plan_items where validation_code = 'HT-15/2026.01-PQ') = '2026-03-31',
    'lần 1 đã có tiến độ thì giữ nguyên hạn';
end $$;

-- ---- Ca 2: thêm thiết bị mới PCTB513 ------------------------------------
insert into kq select 'pc_luu', public.rpc_save_catalog_object('Thiết bị', 'PCTB513', jsonb_build_object(
  'object_name', 'Máy rửa dụng cụ', 'department', 'Xưởng sản xuất', 'area_code', 'C1', 'line', 'BFS',
  'status', 'Hoạt động', 'show_flag', 'Y', 'validate_flag', 'y', 'frequency_months', 12, 'year_ref', 2023,
  'report_class', 'Nhiễm khuẩn', 'workdays', 3, 'first_month', 4,
  'owner_person_id', (select id::text from public.vmp_performers where performer_name = 'Lê Xuân Đức' and is_active)),
  'Test: thiết bị mới', null);
insert into kq select 'pc_ap', public.rpc_apply_catalog_change_v2(
  (select (res->>'change_id')::uuid from kq where buoc = 'pc_luu'), 'Test áp thiết bị mới',
  (select (res->>'timeline_revision')::int from kq where buoc = 'pc_luu'), '[]'::jsonb, false);

do $$
declare v_ap jsonb := (select res from kq where buoc = 'pc_ap');
begin
  assert (select (res->>'ok')::boolean from kq where buoc = 'pc_luu'), 'lưu PCTB513 phải thành công';
  assert (v_ap->>'ok')::boolean, 'áp PCTB513 phải thành công, thấy: ' || v_ap::text;
  assert (select count(*) from public.vmp_plan_items
          where object_code = 'PCTB513' and validation_code in ('PCTB513/2026.01-OQ', 'PCTB513/2026.01-PQ')
            and deadline_vmp is not null and owner_name = 'Lê Xuân Đức') = 2,
    'PCTB513 phải có OQ + PQ lần 1, đủ hạn và QA Lê Xuân Đức';
  assert (select validate_flag from public.vmp_source_objects where object_code = 'PCTB513') = 'y',
    'Danh mục phải lưu validate_flag = y';
  assert exists (select 1 from public.vmp_objects where code = 'PCTB513'), 'phải có bản ghi vmp_objects';
end $$;

-- ---- Ca 4: nhánh SỬA cũ — đổi tháng đầu, hạng mục chưa có tiến độ được tính lại
create temp table ca4 on commit drop as
  select so.object_kind, so.object_code, so.version, so.first_month
  from public.vmp_source_objects so
  where so.validate_flag = 'y' and so.is_active and so.first_month between 1 and 10
    and coalesce(so.frequency_months, 12) = 12
    and so.object_code not in ('HT-15', 'PCTB513')
    and exists (select 1 from public.vmp_plan_items pi where pi.object_code = so.object_code and pi.year = 2026)
    and not exists (select 1 from public.vmp_plan_items pi
                    where pi.object_code = so.object_code and public.vmp_hang_muc_da_co_tien_do(pi.validation_code))
  order by so.object_code limit 1;
insert into kq select 'sua_luu', public.rpc_save_catalog_object(object_kind, object_code,
  jsonb_build_object('first_month', first_month + 1), 'Test: dời tháng đầu', version) from ca4;
insert into kq select 'sua_ap', public.rpc_apply_catalog_change_v2(
  (select (res->>'change_id')::uuid from kq where buoc = 'sua_luu'), 'Test áp dời tháng',
  (select (res->>'timeline_revision')::int from kq where buoc = 'sua_luu'), '[]'::jsonb, false);
do $$
declare v_ap jsonb := (select res from kq where buoc = 'sua_ap');
        v_code text := (select object_code from ca4);
begin
  assert v_code is not null, 'cần một đối tượng chưa có tiến độ để kiểm nhánh Sửa';
  assert (v_ap->>'ok')::boolean and (v_ap->>'so_sua')::int > 0, 'nhánh Sửa phải chạy, thấy: ' || v_ap::text;
  assert (select first_month from public.vmp_source_objects where object_code = v_code)
         = (select first_month + 1 from ca4), 'Danh mục phải lưu tháng đầu mới';
  assert not exists (
    select 1 from public.vmp_plan_items pi, public.vmp_source_objects so,
      lateral public.vmp_tinh_moc_thoi_gian(pi.year, so.first_month, 12,
        (regexp_match(pi.validation_code, '\.([0-9]+)-'))[1]::int, so.report_class, so.workdays, pi.validation_type) m
    where pi.object_code = v_code and so.object_code = v_code and pi.year = 2026
      and pi.deadline_vmp is distinct from m.deadline_vmp),
    'hạn VMP của hạng mục phải khớp tháng đầu mới';
end $$;

-- ---- Ca 5: nhánh DỪNG cũ — bỏ thẩm định, hạng mục chưa tiến độ thành Không áp dụng
create temp table ca5 on commit drop as
  select so.object_kind, so.object_code, so.version
  from public.vmp_source_objects so
  where so.validate_flag = 'y' and so.is_active
    and so.object_code not in ('HT-15', 'PCTB513', (select object_code from ca4))
    and exists (select 1 from public.vmp_plan_items pi where pi.object_code = so.object_code and pi.is_active)
    and not exists (select 1 from public.vmp_plan_items pi
                    where pi.object_code = so.object_code and public.vmp_hang_muc_da_co_tien_do(pi.validation_code))
  order by so.object_code limit 1;
insert into kq select 'dung_luu', public.rpc_save_catalog_object(object_kind, object_code,
  '{"validate_flag":"n"}'::jsonb, 'Test: ngừng thẩm định', version) from ca5;
insert into kq select 'dung_ap', public.rpc_apply_catalog_change_v2(
  (select (res->>'change_id')::uuid from kq where buoc = 'dung_luu'), 'Test áp dừng',
  (select (res->>'timeline_revision')::int from kq where buoc = 'dung_luu'), '[]'::jsonb, false);
do $$
declare v_ap jsonb := (select res from kq where buoc = 'dung_ap');
        v_code text := (select object_code from ca5);
begin
  assert v_code is not null, 'cần một đối tượng chưa có tiến độ để kiểm nhánh Dừng';
  assert (v_ap->>'ok')::boolean and (v_ap->>'so_dung')::int > 0, 'nhánh Dừng phải chạy, thấy: ' || v_ap::text;
  assert (select validate_flag from public.vmp_source_objects where object_code = v_code) = 'n',
    'Danh mục phải lưu validate_flag = n';
  assert not exists (select 1 from public.vmp_plan_items
                     where object_code = v_code and (is_active or item_state <> 'not_applicable')),
    'mọi hạng mục chưa tiến độ phải thành Không áp dụng';
end $$;

-- ---- Ca 6: lưu HAI lần chưa áp (tháng đầu rồi số ngày công) → áp đủ cả hai
create temp table ca6 on commit drop as
  select so.object_kind, so.object_code, so.version, so.first_month, so.workdays
  from public.vmp_source_objects so
  where so.validate_flag = 'y' and so.is_active and so.first_month between 1 and 10
    and so.workdays between 1 and 20 and coalesce(so.frequency_months, 12) = 12
    and so.object_code not in ('HT-15', 'PCTB513', (select object_code from ca4), (select object_code from ca5))
    and not exists (select 1 from public.vmp_plan_items pi
                    where pi.object_code = so.object_code and public.vmp_hang_muc_da_co_tien_do(pi.validation_code))
    and exists (select 1 from public.vmp_plan_items pi where pi.object_code = so.object_code and pi.year = 2026)
  order by so.object_code limit 1;
insert into kq select 'hai_luu_1', public.rpc_save_catalog_object(object_kind, object_code,
  jsonb_build_object('first_month', first_month + 1), 'Test lần 1', version) from ca6;
insert into kq select 'hai_luu_2', public.rpc_save_catalog_object(c.object_kind, c.object_code,
  jsonb_build_object('workdays', c.workdays + 1), 'Test lần 2',
  (select version from public.vmp_source_objects where object_code = c.object_code)) from ca6 c;
insert into kq select 'hai_ap', public.rpc_apply_catalog_change_v2(
  (select (res->>'change_id')::uuid from kq where buoc = 'hai_luu_2'), 'Test áp hai lần lưu',
  (select (res->>'timeline_revision')::int from kq where buoc = 'hai_luu_2'), '[]'::jsonb, false);
do $$
declare v_ap jsonb := (select res from kq where buoc = 'hai_ap');
begin
  assert (select object_code from ca6) is not null, 'cần đối tượng cho ca hai lần lưu';
  assert (v_ap->>'ok')::boolean, 'áp sau hai lần lưu phải thành công, thấy: ' || v_ap::text;
  assert (select so.first_month = c.first_month + 1 and so.workdays = c.workdays + 1
          from public.vmp_source_objects so join ca6 c using (object_code)),
    'phải giữ CẢ tháng đầu (lần 1) và số ngày công (lần 2)';
end $$;

-- ---- Ca 7: ngừng dùng (is_active=false) không được báo lỗi thô --------------
create temp table ca7 on commit drop as
  select so.object_kind, so.object_code, so.version from public.vmp_source_objects so
  where so.is_active and so.validate_flag = 'y'
    and so.object_code not in ('HT-15', 'PCTB513', (select object_code from ca4), (select object_code from ca5), (select object_code from ca6))
    and exists (select 1 from public.vmp_plan_items pi where pi.object_code = so.object_code and pi.is_active)
  order by so.object_code limit 1;
insert into kq select 'ngung_luu', public.rpc_save_catalog_object(object_kind, object_code,
  '{"is_active":false}'::jsonb, 'Test ngừng dùng', version) from ca7;
insert into kq select 'ngung_ap', public.rpc_apply_catalog_change_v2(
  (select (res->>'change_id')::uuid from kq where buoc = 'ngung_luu'), 'Test áp ngừng dùng',
  (select (res->>'timeline_revision')::int from kq where buoc = 'ngung_luu'), '[]'::jsonb, false);
do $$
begin
  assert (select res ? 'ok' from kq where buoc = 'ngung_ap'), 'phải trả kết quả nghiệp vụ, không phải lỗi thô';
  assert (select is_active from public.vmp_source_objects where object_code = (select object_code from ca7)),
    'luồng này chưa áp is_active — đối tượng vẫn đang dùng như hành vi cũ';
end $$;

-- ---- Ca 3: không đụng đối tượng khác (đúng tập mã đang hiệu lực) --------
do $$
declare v_bo text[] := array['HT-15', 'PCTB513', (select object_code from ca4), (select object_code from ca5),
                             (select object_code from ca6), (select object_code from ca7)];
begin
  assert not exists (
    (select validation_code from public.vmp_plan_items where is_active and not (object_code = any(v_bo))
     except select validation_code from kq_truoc where not (object_code = any(v_bo)))
    union all
    (select validation_code from kq_truoc where not (object_code = any(v_bo))
     except select validation_code from public.vmp_plan_items where is_active and not (object_code = any(v_bo)))),
    'hạng mục của đối tượng khác phải giữ nguyên';
end $$;

select 'ĐẠT: catalog-apply-pending-timeline-fields' as ket_qua;
rollback;

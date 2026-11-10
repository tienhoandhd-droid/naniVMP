\set ON_ERROR_STOP on
-- =====================================================================
-- Đợt B (rà soát 10/11/2026) — migration 20261110160000_dashboard_nguoi_ho_tro
--   B1: rpc_get_vmp_dashboard trả support_person_id + support_person_ids
--       (người hỗ trợ chính + QA hỗ trợ thêm) trong _raw.
--   B3: rpc_team_overview_summary tính "hoàn thành" = status completed
--       HOẶC có actual_vmp_date.
--   B5: compute_item_status_v2 và rpc_due_alerts lấy "hôm nay" theo giờ VN
--       (Asia/Bangkok), không theo múi giờ phiên.
-- CHỈ chạy trên bản sao production (dùng tài khoản QA có sẵn), trong một
-- giao dịch rồi ROLLBACK. Không tạo người dùng mới.
-- =====================================================================
begin;
set local lock_timeout = '5s';

create temp table ca(
  qa_uid uuid, qa_pid uuid, obj_id uuid, obj_code text,
  admin_uid uuid, item_id text
) on commit drop;

-- QA (qa_staff) có sẵn + một đối tượng nguồn năm 2026 mà QA đó KHÔNG phụ
-- trách, KHÔNG hỗ trợ chính → gắn QA làm "QA hỗ trợ thêm".
insert into ca(qa_uid, qa_pid, obj_id, obj_code, admin_uid)
select q.uid, q.pid, o.id, o.object_code,
       (select p.id from public.profiles p
         where p.is_active and public.vmp_business_role(p.id) = 'admin'
         order by p.id limit 1)
from (select p.id uid, pf.id pid
        from public.profiles p
        join public.vmp_performers pf on pf.user_id = p.id and pf.is_active
       where p.is_active and public.vmp_business_role(p.id) = 'qa_staff'
         and public.vmp_is_active_session(p.id)
       order by p.id limit 1) q
cross join lateral (
  select so.id, so.object_code
    from public.vmp_source_objects so
   where so.is_active
     and so.owner_person_id is distinct from q.pid
     and so.support_person_id is distinct from q.pid
     and exists (select 1 from public.vmp_plan_items i
                  where i.object_code = so.object_code and i.year = 2026
                    and i.is_active and not i.missing_from_sheet
                    and coalesce(i.item_state, 'active') <> 'cancelled'
                    and i.owner_person_id is distinct from q.pid
                    and i.support_person_id is distinct from q.pid)
   order by so.object_code limit 1) o;

do $$ begin
  assert (select count(*) from ca) = 1 and (select admin_uid from ca) is not null,
    'Chuẩn bị: bản sao không có QA/đối tượng/admin phù hợp';
end $$;

insert into public.vmp_source_supporters(source_object_id, performer_id, ly_do)
select obj_id, qa_pid, 'Test B1: QA hỗ trợ thêm' from ca;

-- ---------- B1: đóng vai QA hỗ trợ, đọc dashboard ----------
select set_config('request.jwt.claims', json_build_object(
  'sub', (select qa_uid from ca), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;
create temp table dash on commit drop as
  select public.rpc_get_vmp_dashboard(2026) payload;
reset role;

do $$
declare
  v_ca ca;
  v_acts jsonb;
  v_extra jsonb;
  v_main jsonb;
begin
  select * into v_ca from ca;
  v_acts := (select payload->'activities' from dash);
  assert jsonb_typeof(v_acts) = 'array',
    'B1: dashboard không trả activities: ' || left((select payload::text from dash), 300);

  select a into v_extra from jsonb_array_elements(v_acts) a
   where a->>'code' = v_ca.obj_code limit 1;
  assert v_extra is not null,
    'B1: QA hỗ trợ thêm không thấy hạng mục của đối tượng ' || v_ca.obj_code;
  assert (v_extra->'_raw') ? 'support_person_id',
    'B1: _raw thiếu trường support_person_id';
  assert jsonb_typeof(v_extra->'_raw'->'support_person_ids') = 'array'
     and (v_extra->'_raw'->'support_person_ids') ? v_ca.qa_pid::text,
    'B1: _raw.support_person_ids không có id QA hỗ trợ thêm, thấy: '
      || coalesce((v_extra->'_raw'->'support_person_ids')::text, 'null');

  -- Hạng mục QA là người hỗ trợ chính: support_person_id đúng id và có
  -- trong support_person_ids.
  select a into v_main from jsonb_array_elements(v_acts) a
   where exists (select 1 from public.vmp_plan_items i
                  where i.validation_code = a->>'validation_code'
                    and i.year = 2026 and i.support_person_id = v_ca.qa_pid)
   limit 1;
  if v_main is not null then
    assert v_main->'_raw'->>'support_person_id' = v_ca.qa_pid::text,
      'B1: support_person_id của hạng mục hỗ trợ chính sai';
    assert (v_main->'_raw'->'support_person_ids') ? v_ca.qa_pid::text,
      'B1: support_person_ids thiếu người hỗ trợ chính';
  end if;
  raise notice 'B1 GREEN: QA % thấy %, support_person_ids=%', v_ca.qa_pid,
    v_ca.obj_code, v_extra->'_raw'->'support_person_ids';
end $$;

-- ---------- B3: tổng quan đếm "hoàn thành" cả mục có ngày hoàn thành ----------
update ca set item_id = (
  select i.id from public.vmp_plan_items i
   where i.year = 2026 and i.is_active and i.missing_from_sheet is not true
     and coalesce(i.item_state, 'active') = 'active'
     and i.status_vmp <> 'completed' and i.actual_vmp_date is null
     and (i.deadline_protocol is null or i.deadline_protocol <= date '2026-09-28')
   order by i.validation_code limit 1);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temp table tq(buoc text, vai text, res jsonb) on commit drop;
insert into tq select 'truoc', 'service', public.rpc_team_overview_summary(2026);
select set_config('request.jwt.claims', json_build_object(
  'sub', (select admin_uid from ca), 'role', 'authenticated', 'aal', 'aal2')::text, true);
insert into tq select 'truoc', 'admin', public.rpc_team_overview_summary(2026);

-- Ca của brief: ngày VMP thực tế 28/09, trạng thái "đang làm", hạn 01/10.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.vmp_plan_items
   set status_vmp = 'in_progress', actual_vmp_date = date '2026-09-28',
       deadline_vmp = date '2026-10-01'
 where id = (select item_id from ca);
insert into tq select 'sau', 'service', public.rpc_team_overview_summary(2026);
select set_config('request.jwt.claims', json_build_object(
  'sub', (select admin_uid from ca), 'role', 'authenticated', 'aal', 'aal2')::text, true);
insert into tq select 'sau', 'admin', public.rpc_team_overview_summary(2026);

do $$
declare r record; v_loi text[] := '{}';
begin
  assert (select item_id from ca) is not null, 'B3: không tìm được hạng mục để thử';
  for r in select t1.vai, t1.res truoc, t2.res sau from tq t1
             join tq t2 on t2.vai = t1.vai and t2.buoc = 'sau'
            where t1.buoc = 'truoc' order by t1.vai loop
    assert (r.truoc->>'ok')::boolean and (r.sau->>'ok')::boolean,
      'B3: summary lỗi (' || r.vai || '): ' || r.sau::text;
    if (r.sau->>'completed')::int <> (r.truoc->>'completed')::int + 1 then
      v_loi := v_loi || format('%s: trước %s, sau %s', r.vai,
        r.truoc->>'completed', r.sau->>'completed');
    end if;
  end loop;
  assert cardinality(v_loi) = 0,
    'B3: mục có actual_vmp_date phải tính là xong — ' || array_to_string(v_loi, '; ');
  raise notice 'B3 GREEN: %', (select jsonb_object_agg(buoc || '_' || vai, res->'completed') from tq);
end $$;

-- ---------- B5: "hôm nay" theo giờ VN dù phiên ở múi giờ khác ----------
-- Không giả được now(); chọn múi giờ phiên làm ngày phiên LỆCH ngày VN:
--  · giờ VN < 19h: phiên GMT-12 (đang ở hôm qua) — giống 23:30 UTC khi VN
--    đã sang ngày mới → hạn hôm qua (VN) phải là quá hạn;
--  · giờ VN ≥ 19h: phiên +14 (đã sang mai) → hạn hôm nay (VN) chưa quá hạn.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('timezone',
  case when extract(hour from now() at time zone 'Asia/Bangkok') < 19
       then 'Etc/GMT+12' else 'Pacific/Kiritimati' end, true) as mui_gio_phien;

do $$
declare
  v_vn date := (now() at time zone 'Asia/Bangkok')::date;
  v_item public.vmp_plan_items;
begin
  assert current_date <> v_vn, 'B5: chuẩn bị múi giờ sai';
  if current_date < v_vn then
    v_item := jsonb_populate_record(null::public.vmp_plan_items,
      jsonb_build_object('deadline_vmp', v_vn - 1, 'status_vmp', 'in_progress'));
    assert public.compute_item_status_v2(v_item) = 'over',
      format('B5: hạn %s (hôm qua giờ VN) phải quá hạn, phiên %s, thấy %s',
        v_vn - 1, current_date, public.compute_item_status_v2(v_item));
  else
    v_item := jsonb_populate_record(null::public.vmp_plan_items,
      jsonb_build_object('deadline_vmp', v_vn, 'status_vmp', 'in_progress'));
    assert public.compute_item_status_v2(v_item) <> 'over',
      format('B5: hạn %s (hôm nay giờ VN) chưa được quá hạn, thấy %s',
        v_vn, public.compute_item_status_v2(v_item));
  end if;
  raise notice 'B5 GREEN compute_item_status_v2: VN=% phiên=%', v_vn, current_date;
end $$;

do $$
declare
  v_vn date := (now() at time zone 'Asia/Bangkok')::date;
  v_alerts jsonb := public.rpc_due_alerts(2026, 7);
  v_bad int;
begin
  assert jsonb_array_length(v_alerts) > 0, 'B5: rpc_due_alerts rỗng, không kiểm được';
  select count(*) into v_bad from jsonb_array_elements(v_alerts) a
   where (a->>'days_left')::int <> ((a->>'due_date')::date - v_vn)
      or (a->>'alert_type' = 'overdue') <> ((a->>'due_date')::date < v_vn);
  assert v_bad = 0,
    format('B5: rpc_due_alerts có %s/%s dòng tính ngày theo múi giờ phiên (%s) thay vì VN (%s)',
      v_bad, jsonb_array_length(v_alerts), current_date, v_vn);
  raise notice 'B5 GREEN rpc_due_alerts: VN=% phiên=% cảnh báo=%', v_vn, current_date, jsonb_array_length(v_alerts);
end $$;
reset timezone;

-- Quyền thực thi giữ nguyên.
do $$ begin
  assert (select proacl::text from pg_proc where oid = 'public.rpc_get_vmp_dashboard(integer,boolean,boolean)'::regprocedure)
       = '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}', 'ACL rpc_get_vmp_dashboard đổi';
  assert (select proacl::text from pg_proc where oid = 'public.rpc_team_overview_summary(integer)'::regprocedure)
       = '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}', 'ACL rpc_team_overview_summary đổi';
  assert (select proacl::text from pg_proc where oid = 'public.compute_item_status_v2(public.vmp_plan_items)'::regprocedure)
       = '{postgres=X/postgres,service_role=X/postgres}', 'ACL compute_item_status_v2 đổi';
  assert (select proacl::text from pg_proc where oid = 'public.rpc_due_alerts__five_role_impl_20260824(integer,integer)'::regprocedure)
       = '{postgres=X/postgres}', 'ACL rpc_due_alerts impl đổi';
  assert (select bool_and(prosecdef) from pg_proc where oid in (
    'public.rpc_get_vmp_dashboard(integer,boolean,boolean)'::regprocedure,
    'public.rpc_team_overview_summary(integer)'::regprocedure,
    'public.rpc_due_alerts__five_role_impl_20260824(integer,integer)'::regprocedure)),
    'SECURITY DEFINER bị mất';
  raise notice 'ACL/SECURITY DEFINER giữ nguyên';
end $$;

rollback;

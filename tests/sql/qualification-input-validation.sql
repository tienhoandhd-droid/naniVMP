-- Kiểm hợp lệ đầu vào Thẩm định thực tế ở máy chủ (migration 20261021100000).
-- Chạy trên DB THỬ đã có dữ liệu VMP + migration thẩm định. Mọi thay đổi
-- fixture nằm trong MỘT giao dịch và bị ROLLBACK ở cuối.
-- Đóng vai bằng request.jwt.claims (như PostgREST) + role authenticated.
-- Mỗi ca in PASS/FAIL; cuối file raise nếu có ca FAIL (thoát mã ≠ 0).
\set ON_ERROR_STOP on
begin;

-- ---------- Fixture (postgres) ----------
create temp table t_kq(stt serial primary key, ca text not null, dat boolean not null, chi_tiet text);
grant all on t_kq to authenticated;
grant usage on sequence t_kq_stt_seq to authenticated;
create temp table t_ctx(k text primary key, v text);
grant all on t_ctx to authenticated;

-- Admin thứ hai (người duyệt) — tổng hợp, chỉ trong giao dịch này.
insert into public.vmp_email_cho_phep(email, ghi_chu)
values ('sqltest-admin2@example.test', 'Synthetic SQL test only') on conflict do nothing;
insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('a8210210-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'sqltest-admin2@example.test', 'not-used', '{}', '{}', now(), now())
on conflict do nothing;
insert into public.profiles(id, full_name, email, role, department, is_active)
values ('a8210210-0000-4000-8000-000000000008', 'SQL test Admin 2', 'sqltest-admin2@example.test', 'admin', 'qa', true)
on conflict (id) do update set role = excluded.role, is_active = true;
-- Admin 1 làm người ký kiểm tra (phải có trong danh sách QA phụ trách).
insert into public.vmp_qa_phu_trach(performer_id, ghi_chu)
select id, 'SQL test only' from public.vmp_performers where user_id = 'a8210210-0000-4000-8000-000000000001'
on conflict do nothing;

create function pg_temp.as_user(n integer) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', 'a8210210-0000-4000-8000-00000000000' || n, 'role', 'authenticated', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', floor(extract(epoch from now()))::bigint)))::text, true);
  select null::void;
$$;
create function pg_temp.ok(p_ca text, p_dat boolean, p_chi_tiet text default null) returns void language plpgsql as $$
begin
  insert into t_kq(ca, dat, chi_tiet) values (p_ca, coalesce(p_dat, false), p_chi_tiet);
  raise notice '%', case when coalesce(p_dat, false) then 'PASS ' || p_ca
    else 'FAIL ' || p_ca || ' — ' || coalesce(left(p_chi_tiet, 600), '') end;
end $$;
create function pg_temp.ctx(p_k text) returns text language sql as $$ select v from t_ctx where k = p_k $$;
create function pg_temp.set_ctx(p_k text, p_v text) returns void language sql as $$
  insert into t_ctx values (p_k, p_v) on conflict (k) do update set v = excluded.v; select null::void $$;
-- Gán giá trị vào payload, tự tạo object trung gian.
create function pg_temp.put(d jsonb, p text[], v jsonb) returns jsonb language plpgsql as $$
declare i integer;
begin
  for i in 1 .. cardinality(p) - 1 loop
    if d #> p[1:i] is null then d := jsonb_set(d, p[1:i], '{}'::jsonb, true); end if;
  end loop;
  return jsonb_set(d, p, v, true);
end $$;
create function pg_temp.cur(rec uuid) returns jsonb language sql security definer as $$
  select rv.payload from public.cpc1_revisions rv join public.cpc1_records r on r.id = rv.record_id and rv.version = r.version where r.id = rec $$;
-- Đọc bảng nội bộ cho kiểm chứng (fixture, không phải đường của người dùng).
create function pg_temp.run_row(run uuid) returns jsonb language sql security definer as $$ select to_jsonb(r) from cpc1_private.runs r where id = run $$;
create function pg_temp.nrev(rec uuid) returns integer language sql security definer as $$ select count(*)::integer from public.cpc1_revisions where record_id = rec $$;
create function pg_temp.nruns() returns integer language sql security definer as $$ select count(*)::integer from cpc1_private.runs $$;
create function pg_temp.stored_overall(rec uuid, v integer) returns text language sql security definer as $$ select evaluation->>'overall' from public.cpc1_revisions where record_id = rec and version = v $$;
create function pg_temp.ver(rec uuid) returns integer language sql security definer as $$ select version from public.cpc1_records where id = rec $$;
create function pg_temp.counts(rec uuid) returns text language sql security definer as $$
  select (select count(*) from public.cpc1_revisions where record_id = rec) || '/' ||
         (select count(*) from cpc1_private.audit where record_id = rec) || '/' ||
         (select count(*) from cpc1_private.entry_events where record_id = rec) || '/' ||
         (select count(*) from cpc1_private.run_requests) || '/' ||
         (select count(*) from cpc1_private.requests) $$;
-- Gọi RPC lưu thật. Thành công → {"ok":true,"res":...}; lỗi → {"ok":false,"state","msg","detail","hint"}.
create function pg_temp.try_save(run uuid, rec uuid, d jsonb, req uuid default gen_random_uuid(), expected integer default null) returns jsonb language plpgsql as $$
declare res jsonb; st text; m text; dt text; h text;
begin
  res := public.cpc1_run_save(run, d, rec, coalesce(expected, pg_temp.ver(rec)), req, 'Kiểm thử SQL');
  return jsonb_build_object('ok', true, 'res', res);
exception when others then
  get stacked diagnostics st = returned_sqlstate, m = message_text, dt = pg_exception_detail, h = pg_exception_hint;
  return jsonb_build_object('ok', false, 'state', st, 'msg', m, 'detail', dt, 'hint', h);
end $$;
-- Lỗi PT422 có issue đúng đường dẫn + rule (+ lý do chứa chuỗi, nếu cho).
create function pg_temp.has_issue(r jsonb, p jsonb, p_rule text, p_reason text default null) returns boolean language plpgsql as $$
declare det jsonb;
begin
  if r->>'ok' = 'true' or r->>'state' is distinct from 'PT422' or r->>'hint' is distinct from 'INVALID_INPUT' then return false; end if;
  det := (r->>'detail')::jsonb;
  return det->>'code' = 'INVALID_INPUT' and exists (
    select 1 from jsonb_array_elements(det->'issues') x
    where x->'path' = p and x->>'rule' = p_rule and (p_reason is null or strpos(x->>'reason', p_reason) > 0));
end $$;
create function pg_temp.sign(rec uuid, y text, dev text default null) returns jsonb language sql as $$
  select public.cpc1_record_sign(rec, pg_temp.ver(rec), y, null, dev) $$;

create function pg_temp.mk_run(p_run_key text, p_rec_key text, p_system text, p_forms jsonb) returns void language plpgsql as $$
declare scope jsonb := jsonb_build_array(jsonb_build_object('system', p_system, 'forms', p_forms)); cal jsonb := '{}'; req jsonb; res jsonb;
begin
  for req in select x from jsonb_array_elements(public.cpc1_run_requirements(scope)) x loop
    cal := cal || jsonb_build_object(req->>'key', jsonb_build_object('name', 'TB-SQLTEST', 'due_on', '2027-06-30'));
  end loop;
  res := public.cpc1_run_create(jsonb_build_object('title', 'SQLTEST ' || p_run_key, 'mode', 'single', 'started_on', '2026-10-21', 'scope', scope, 'calibration', cal), gen_random_uuid());
  perform pg_temp.set_ctx(p_run_key, res->>'id');
  perform pg_temp.set_ctx('cal_' || p_run_key, cal::text);
  perform pg_temp.set_ctx(p_rec_key, (select x->>'record_id' from jsonb_array_elements(res->'items') x where x->>'system' = p_system));
end $$;

grant execute on all functions in schema pg_temp to authenticated;

set local role authenticated;

-- ---------- Tạo đợt (qa_manager) ----------
do $$
declare
  air jsonb; n2 jsonb; st jsonb;
  pa text; pb text; pn text; ps text;
begin
  perform pg_temp.as_user(2);
  air := public.cpc1_gas_config('air'); n2 := public.cpc1_gas_config('nitrogen'); st := public.cpc1_config();
  select x->'locations'->0->>'id', x->'locations'->1->>'id' into pa, pb from jsonb_array_elements(air->'forms') x where x->>'id' = 'bm01';
  select x->'locations'->0->>'id' into pn from jsonb_array_elements(n2->'forms') x where x->>'id' = 'bm05';
  ps := st->'locations'->0->>'id';
  perform pg_temp.set_ctx('pa', pa); perform pg_temp.set_ctx('pb', pb); perform pg_temp.set_ctx('pn', pn); perform pg_temp.set_ctx('ps', ps);
  -- Đợt "single" mỗi hệ thống, một phần điểm.
  perform pg_temp.mk_run('run1', 'air1', 'air', jsonb_build_object('bm01', jsonb_build_array(pa, pb), 'bm02', jsonb_build_array(pa), 'bm03', jsonb_build_array(pa), 'bm04', jsonb_build_array(pa)));
  perform pg_temp.mk_run('run1n', 'n21', 'nitrogen', jsonb_build_object('bm05', jsonb_build_array(pn)));
  perform pg_temp.mk_run('run1s', 'stm1', 'steam', jsonb_build_object('bm01', jsonb_build_array(ps), 'bm02', jsonb_build_array(ps), 'bm03', jsonb_build_array(ps), 'bm04', jsonb_build_array(ps)));
  -- Đợt 2: chỉ air bm01 một điểm (ca ký theo phạm vi + khoá hạn thiết bị).
  perform pg_temp.mk_run('run2', 'air2', 'air', jsonb_build_object('bm01', jsonb_build_array(pa)));
  perform pg_temp.ok('FIXTURE tạo 4 đợt thử', pg_temp.ctx('air1') is not null and pg_temp.ctx('air2') is not null and pg_temp.ctx('stm1') is not null and pg_temp.ctx('n21') is not null);
end $$;

-- ---------- A. Số dễ nhầm hàng nghìn ----------
do $$
declare run uuid := pg_temp.ctx('run1'); rec uuid := pg_temp.ctx('air1'); pa text := pg_temp.ctx('pa');
  r jsonb; before text; v text; k text;
begin
  perform pg_temp.as_user(2);
  before := pg_temp.counts(rec);
  r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.put(pg_temp.cur(rec), array['forms','bm01',pa,'p05'], '"4.000"'), array['forms','bm01',pa,'p5'], '"0"'));
  perform pg_temp.ok('A1 khí BM01 p05 "4.000" bị từ chối PT422 đúng ô + lời nhắc', pg_temp.has_issue(r, jsonb_build_array('forms','bm01',pa,'p05'), 'thousand_ambiguous', 'Số dễ nhầm hàng nghìn — gõ 4000 hoặc 4,0'), r::text);
  perform pg_temp.ok('A1b từ chối không ghi gì (revision/audit/entry_event/request)', pg_temp.counts(rec) = before, before || ' -> ' || pg_temp.counts(rec));
  foreach v in array array['1,500', '12.345', '+4.000'] loop
    r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.cur(rec), array['forms','bm03',pa,'reading'], to_jsonb(v)));
    perform pg_temp.ok('A2 "' || v || '" bị từ chối (thousand_ambiguous)', pg_temp.has_issue(r, jsonb_build_array('forms','bm03',pa,'reading'), 'thousand_ambiguous'), r::text);
  end loop;
  r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.cur(rec), array['forms','bm02',pa,'dewpoint'], '"-2,000"'));
  perform pg_temp.ok('A3 điểm sương "-2,000" bị từ chối (thousand_ambiguous)', pg_temp.has_issue(r, jsonb_build_array('forms','bm02',pa,'dewpoint'), 'thousand_ambiguous'), r::text);
  foreach v in array array['1.000.000', '1,000.5'] loop
    r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.cur(rec), array['forms','bm03',pa,'reading'], to_jsonb(v)));
    perform pg_temp.ok('A4 nhiều dấu phân cách "' || v || '" bị từ chối', pg_temp.has_issue(r, jsonb_build_array('forms','bm03',pa,'reading'), 'not_number'), r::text);
  end loop;
  -- Tính thử: "4.000" không còn được đọc thành 4 (không còn Đạt).
  r := public.cpc1_run_evaluate(run, pg_temp.put(pg_temp.put(pg_temp.cur(rec), array['forms','bm01',pa,'p05'], '"4.000"'), array['forms','bm01',pa,'p5'], '"0"'));
  perform pg_temp.ok('A5 tính thử "4.000" → ô invalid, không Đạt', r#>>array['forms','bm01','rows',pa,'status'] = 'invalid', (r#>array['forms','bm01','rows',pa])::text);
end $$;

-- Số hợp lệ vẫn lưu: 0,5 0.5 0.125 4,0 4000 3520 (+ ô trống).
do $$
declare run uuid := pg_temp.ctx('run1'); rec uuid := pg_temp.ctx('air1'); pa text := pg_temp.ctx('pa'); pb text := pg_temp.ctx('pb');
  r jsonb; d jsonb; n integer;
begin
  perform pg_temp.as_user(2);
  n := pg_temp.nrev(rec);
  d := pg_temp.cur(rec);
  d := pg_temp.put(d, array['forms','bm01',pa,'p05'], '"4000"');
  d := pg_temp.put(d, array['forms','bm01',pa,'p5'], '"0"');
  d := pg_temp.put(d, array['forms','bm01',pb,'p05'], '"3520"');
  d := pg_temp.put(d, array['forms','bm01',pb,'p5'], '""');
  d := pg_temp.put(d, array['forms','bm02',pa,'dewpoint'], '"-40,5"');
  d := pg_temp.put(d, array['forms','bm03',pa,'flow'], '"0,5"');
  d := pg_temp.put(d, array['forms','bm03',pa,'duration'], '"4,0"');
  d := pg_temp.put(d, array['forms','bm03',pa,'reading'], '"0.125"');
  d := pg_temp.put(d, array['forms','bm04',pa,'microbial'], '"KPH"');
  d := pg_temp.put(d, array['forms','bm01',pa,'execution_date'], to_jsonb(((now() at time zone 'Asia/Bangkok')::date)::text));
  d := pg_temp.put(d, array['meta','report_date'], to_jsonb(((now() at time zone 'Asia/Bangkok')::date + 1)::text));
  r := pg_temp.try_save(run, rec, d);
  perform pg_temp.ok('V1 số hợp lệ 4000/3520/-40,5/0,5/4,0/0.125/KPH + ô trống + ngày hôm nay/mai lưu được', r->>'ok' = 'true', r::text);
  perform pg_temp.ok('V1b đúng 1 revision mới', pg_temp.nrev(rec) = n + 1, n::text);
  perform pg_temp.ok('V2 kết quả hợp lệ nhưng KHÔNG ĐẠT (p05 4000 > 3520) vẫn lưu, chấm fail', r#>>array['res','evaluation','forms','bm01','rows',pa,'status'] = 'fail', (r#>array['res','evaluation','forms','bm01','rows',pa])::text);
  perform pg_temp.ok('V3 ô p5 để trống được lưu, điểm chấm incomplete', r#>>array['res','evaluation','forms','bm01','rows',pb,'status'] = 'incomplete', (r#>array['res','evaluation','forms','bm01','rows',pb])::text);
  d := pg_temp.cur(rec);
  d := pg_temp.put(d, array['forms','bm01',pb,'p5'], '"29"');
  r := pg_temp.try_save(run, rec, d);
  perform pg_temp.ok('V3b p05 3520 + p5 29 (đúng biên) → pass', r#>>array['res','evaluation','forms','bm01','rows',pb,'status'] = 'pass', r::text);
  r := public.cpc1_run_evaluate(run, pg_temp.put(pg_temp.cur(rec), array['forms','bm03',pa,'reading'], '"0,5"'));
  perform pg_temp.ok('V4 tính thử "0,5" vẫn đọc là số', r#>>array['forms','bm03','rows',pa,'values','reading'] = '0.5', (r#>array['forms','bm03','rows',pa])::text);
end $$;

-- ---------- B. Ô sai bị chặn lưu hoàn toàn ----------
do $$
declare run uuid := pg_temp.ctx('run1'); rec uuid := pg_temp.ctx('air1'); pa text := pg_temp.ctx('pa');
  r jsonb; d jsonb; before text; c record;
begin
  perform pg_temp.as_user(2);
  for c in select * from (values
      (array['forms','bm03',pa,'reading'], '12abc', 'not_number'),
      (array['forms','bm04',pa,'microbial'], '<1', 'comparison_symbol'),
      (array['forms','bm01',pa,'p5'], '-5', 'negative'),
      (array['forms','bm03',pa,'reading'], '1e3', 'exponent'),
      (array['forms','bm04',pa,'microbial'], '100.5', 'not_integer'),
      (array['forms','bm01',pa,'p05'], '2.5', 'not_integer'),
      (array['forms','bm01',pa,'execution_date'], '2099-01-01', 'date_future'),
      (array['forms','bm01',pa,'execution_date'], '0001-01-01', 'date_too_old'),
      (array['forms','bm01',pa,'execution_date'], '2026-02-31', 'date_unreal'),
      (array['meta','report_date'], '2026/10/21', 'date_format'),
      (array['meta','report_date'], to_char((now() at time zone 'Asia/Bangkok')::date + 2, 'YYYY-MM-DD'), 'date_future')
    ) x(p, v, rule) loop
    before := pg_temp.counts(rec);
    r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.cur(rec), c.p, to_jsonb(c.v)));
    perform pg_temp.ok('B1 "' || c.v || '" tại ' || array_to_string(c.p, '/') || ' → PT422 ' || c.rule || ', DB không đổi',
      pg_temp.has_issue(r, to_jsonb(c.p), c.rule) and pg_temp.counts(rec) = before, r::text);
  end loop;
  -- Nhiều ô sai một lần: liệt kê đủ, message tiếng Việt.
  d := pg_temp.cur(rec);
  d := pg_temp.put(d, array['forms','bm01',pa,'p05'], '"4.000"');
  d := pg_temp.put(d, array['forms','bm03',pa,'reading'], '"1e3"');
  d := pg_temp.put(d, array['forms','bm01',pa,'execution_date'], '"2026-02-31"');
  r := pg_temp.try_save(run, rec, d);
  perform pg_temp.ok('B2 ba ô sai → issues đủ 3, message "Còn 3 ô nhập sai"', r->>'state' = 'PT422'
    and jsonb_array_length((r->>'detail')::jsonb->'issues') = 3 and strpos(r->>'msg', 'Còn 3 ô nhập sai') = 1, r::text);
  perform pg_temp.ok('B2b ngày 2026-02-31 không còn lỗi tiếng Anh', strpos(r::text, 'out of range') = 0, r::text);
end $$;

-- Hạn hiệu chuẩn ở tương lai vẫn hợp lệ; % > 100 và CFU lẻ bị chặn; nitơ.
do $$
declare run uuid := pg_temp.ctx('run1n'); rec uuid := pg_temp.ctx('n21'); pn text := pg_temp.ctx('pn'); r jsonb;
begin
  perform pg_temp.as_user(2);
  r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.cur(rec), array['forms','bm05',pn,'purity'], '"101"'));
  perform pg_temp.ok('B3 độ tinh khiết "101" → percent_range', pg_temp.has_issue(r, jsonb_build_array('forms','bm05',pn,'purity'), 'percent_range'), r::text);
  r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.cur(rec), array['forms','bm05',pn,'purity'], '"99,950"'));
  perform pg_temp.ok('B3b độ tinh khiết "99,950" → thousand_ambiguous', pg_temp.has_issue(r, jsonb_build_array('forms','bm05',pn,'purity'), 'thousand_ambiguous'), r::text);
  r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.cur(rec), array['forms','bm05',pn,'purity'], '"99,95"'));
  perform pg_temp.ok('B3c "99,95" lưu được; payload giữ hạn hiệu chuẩn 2027-06-30 (tương lai)', r->>'ok' = 'true'
    and r#>>'{res,data,equipment,bm05,expiry}' = '2027-06-30', r::text);
end $$;

-- Hơi tinh khiết: đường dẫn theo payload hơi.
do $$
declare run uuid := pg_temp.ctx('run1s'); rec uuid := pg_temp.ctx('stm1'); ps text := pg_temp.ctx('ps'); r jsonb; d jsonb;
begin
  perform pg_temp.as_user(2);
  r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.cur(rec), array['bm02',ps], '{"toc":"1.000","conductivity":"0.5"}'));
  perform pg_temp.ok('S1 hơi BM02 TOC "1.000" → PT422 tại bm02/<điểm>/toc', pg_temp.has_issue(r, jsonb_build_array('bm02',ps,'toc'), 'thousand_ambiguous'), r::text);
  r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.cur(rec), array['bm02',ps], '{"microbial":"2.5"}'));
  perform pg_temp.ok('S2 hơi vi sinh "2.5" CFU → not_integer', pg_temp.has_issue(r, jsonb_build_array('bm02',ps,'microbial'), 'not_integer'), r::text);
  r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.cur(rec), array['bm01',ps], '[{"vg":"4.000","vc":"200"},{},{}]'));
  perform pg_temp.ok('S3 hơi BM01 lần 1 vg "4.000" → path bm01/<điểm>/0/vg', pg_temp.has_issue(r, jsonb_build_array('bm01',ps,'0','vg'), 'thousand_ambiguous'), r::text);
  r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.cur(rec), array['bm01',ps], '[{"vg":"2","vc":"200","date":"2026-02-31"},{},{}]'));
  perform pg_temp.ok('S4 hơi ngày "2026-02-31" → date_unreal (tiếng Việt)', pg_temp.has_issue(r, jsonb_build_array('bm01',ps,'0','date'), 'date_unreal', 'Ngày không có thật'), r::text);
  r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.cur(rec), array['bm02',ps], '{"toc":"1000","conductivity":"0,5","microbial":"0","appearance":"pass"}'));
  perform pg_temp.ok('S5 hơi TOC "1000" (vượt 500) hợp lệ → lưu, chấm fail', r->>'ok' = 'true' and r#>>array['res','evaluation','forms','bm02','rows',ps,'parameters','toc'] = 'fail', r::text);
end $$;

-- Miễn luật A cho kg và µS/cm (đơn vị trong cấu hình); vi sinh hơi nhận KPH như khí.
do $$
declare run uuid := pg_temp.ctx('run1s'); rec uuid := pg_temp.ctx('stm1'); ps text := pg_temp.ctx('ps'); r jsonb;
begin
  perform pg_temp.as_user(2);
  r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.cur(rec), array['bm02',ps], '{"conductivity":"1,032","toc":"100","microbial":"KPH","appearance":"pass"}'));
  perform pg_temp.ok('E1 hơi độ dẫn "1,032" µS/cm lưu được, đọc 1.032 (Đạt ≤ 1,3)', r->>'ok' = 'true'
    and r#>>array['res','evaluation','forms','bm02','rows',ps,'values','conductivity'] = '1.032'
    and r#>>array['res','evaluation','forms','bm02','rows',ps,'parameters','conductivity'] = 'pass', r::text);
  perform pg_temp.ok('E2 hơi vi sinh "KPH" lưu được, đọc 0 như khí nén (Đạt)', r->>'ok' = 'true'
    and r#>>array['res','evaluation','forms','bm02','rows',ps,'values','microbial'] = '0'
    and r#>>array['res','evaluation','forms','bm02','rows',ps,'parameters','microbial'] = 'pass', r::text);
  r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.cur(rec), array['bm03',ps], '[{"me":"0,500","ms":"1,311","mf":"1,403","t1":"20","t2":"80","t3":"121"},{},{}]'));
  perform pg_temp.ok('E3 hơi khối lượng "1,311"/"1,403" kg lưu được, đọc là 1.311/1.403 (có kết quả độ khô)', r->>'ok' = 'true'
    and r#>>array['res','evaluation','forms','bm03','rows',ps,'0','values','raw_result'] is not null
    and r#>>array['res','evaluation','forms','bm03','rows',ps,'0','status'] in ('pass','fail'), r::text);
  r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.cur(rec), array['bm03',ps,'0','t1'], '"20,125"'));
  perform pg_temp.ok('E4 hơi nhiệt độ "20,125" °C (không thuộc kg/µS/cm) vẫn bị luật A', pg_temp.has_issue(r, jsonb_build_array('bm03',ps,'0','t1'), 'thousand_ambiguous'), r::text);
  r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.put(pg_temp.cur(rec), array['bm02',ps,'endotoxin'], '"Đạt"'), array['bm02',ps,'toc'], '"1.000"'));
  perform pg_temp.ok('N3 nội độc tố "Đạt" + TOC "1.000": chỉ TOC bị chặn, nội độc tố không bị báo',
    pg_temp.has_issue(r, jsonb_build_array('bm02',ps,'toc'), 'thousand_ambiguous')
    and jsonb_array_length((r->>'detail')::jsonb->'issues') = 1, r::text);
  r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.cur(rec), array['bm02',ps,'endotoxin'], '"<0,25"'));
  perform pg_temp.ok('N1a nội độc tố "<0,25" lưu được nguyên văn, máy chủ chấm invalid như cũ', r->>'ok' = 'true'
    and r#>>array['res','data','bm02',ps,'endotoxin'] = '<0,25'
    and r#>>array['res','evaluation','forms','bm02','rows',ps,'parameters','endotoxin'] = 'invalid', r::text);
  r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.cur(rec), array['bm02',ps,'endotoxin'], '"Đạt"'));
  perform pg_temp.ok('N1b nội độc tố "Đạt" lưu được nguyên văn, máy chủ chấm invalid như cũ', r->>'ok' = 'true'
    and r#>>array['res','evaluation','forms','bm02','rows',ps,'parameters','endotoxin'] = 'invalid', r::text);
  r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.cur(rec), array['bm02',ps,'microbial'], '"kph"'));
  perform pg_temp.ok('E6 hơi vi sinh "kph" (chữ thường) nhận như khí nén', r->>'ok' = 'true', r::text);
end $$;

-- Ký: ô nội độc tố "Đạt" chặn ký với lý do đúng luật; kiểm khi ký tính lại bằng hàm hiện tại.
do $$
declare rec uuid := pg_temp.ctx('stm1'); ps text := pg_temp.ctx('ps'); r jsonb;
begin
  perform pg_temp.as_user(1);
  r := pg_temp.sign(rec, 'kiem_tra', 'DEV-SQLTEST-03');
  perform pg_temp.ok('N2 ký kiểm tra hồ sơ có nội độc tố "Đạt" (+deviation) → INVALID_DATA, ô endotoxin rule not_number',
    r->>'error_code' = 'INVALID_DATA' and exists (select 1 from jsonb_array_elements(r->'issues') x
      where x->'path' = jsonb_build_array('bm02',ps,'endotoxin') and x->>'rule' = 'not_number'), r::text);
end $$;

do $$
declare ps text := pg_temp.ctx('ps'); run uuid; rec uuid; r jsonb; v integer;
begin
  perform pg_temp.as_user(2);
  perform pg_temp.mk_run('run3s', 'stm3', 'steam', jsonb_build_object('bm02', jsonb_build_array(ps)));
  run := pg_temp.ctx('run3s'); rec := pg_temp.ctx('stm3');
  r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.cur(rec), array['bm02',ps], '{"conductivity":"0,5","toc":"100","microbial":"KPH","endotoxin":"0,1","appearance":"pass"}'));
  perform pg_temp.ok('R0 hơi BM02 hợp lệ (vi sinh KPH) lưu được', r->>'ok' = 'true', r::text);
  v := pg_temp.ver(rec);
  reset role;
  -- Mô phỏng bản cũ: kết quả ĐÃ LƯU chấm vi sinh "KPH" là invalid (lý do sai "dấu hàng nghìn").
  update public.cpc1_revisions set evaluation = jsonb_set(jsonb_set(jsonb_set(evaluation,
      array['forms','bm02','rows',ps,'parameters','microbial'], '"invalid"'),
      array['forms','bm02','rows',ps,'errors'], '{"microbial":"Nhập số thập phân hợp lệ, không dùng dấu phân cách hàng nghìn."}'),
      '{overall}', '"invalid"')
  where record_id = rec and version = v;
  set local role authenticated;
  perform pg_temp.as_user(1);
  r := public.cpc1_record_signatures(rec);
  perform pg_temp.ok('R1 cpc1_record_signatures tính lại: o_sai rỗng, ket_qua pass dù kết quả lưu cũ là invalid',
    jsonb_array_length(r->'o_sai') = 0 and r->>'ket_qua' = 'pass', r::text);
  r := pg_temp.sign(rec, 'kiem_tra');
  perform pg_temp.ok('R2 ký kiểm tra không cần deviation (không báo nhầm KPH)', r->>'ok' = 'true', r::text);
  perform pg_temp.ok('R3 ký không ghi lại kết quả đã lưu (revision giữ nguyên)', pg_temp.nrev(rec) = v
    and pg_temp.stored_overall(rec, v) = 'invalid', 'stored=' || coalesce(pg_temp.stored_overall(rec, v), 'null'));
end $$;

-- X11: hạn thiết bị trước 2020 bị từ chối ngay khi tạo đợt, không tạo nửa vời.
do $$
declare pa text := pg_temp.ctx('pa'); scope jsonb; cal jsonb := '{}'; req jsonb; st text; m text; dt text; n0 integer;
begin
  perform pg_temp.as_user(2);
  scope := jsonb_build_array(jsonb_build_object('system', 'air', 'forms', jsonb_build_object('bm02', jsonb_build_array(pa))));
  for req in select x from jsonb_array_elements(public.cpc1_run_requirements(scope)) x loop
    cal := cal || jsonb_build_object(req->>'key', jsonb_build_object('name', 'TB-SQLTEST', 'due_on', '2019-12-31'));
  end loop;
  n0 := pg_temp.nruns();
  begin
    perform public.cpc1_run_create(jsonb_build_object('title', 'SQLTEST X11', 'mode', 'single', 'started_on', '2026-10-21', 'scope', scope, 'calibration', cal), gen_random_uuid());
    st := 'no error';
  exception when others then get stacked diagnostics st = returned_sqlstate, m = message_text, dt = pg_exception_detail;
  end;
  perform pg_temp.ok('X11 tạo đợt hạn TB 2019-12-31 → PT422 tại calibration/<thiết bị>/due_on, không tạo đợt',
    st = 'PT422' and (dt::jsonb->'issues'->0->'path'->>0) = 'calibration' and (dt::jsonb->'issues'->0->>'rule') = 'date_too_old'
    and pg_temp.nruns() = n0, concat_ws(' | ', st, m, dt));
end $$;

-- (7) Tính thử với ngày không có thật → PT422 tiếng Việt chỉ ô.
do $$
declare run uuid := pg_temp.ctx('run1'); rec uuid := pg_temp.ctx('air1'); pa text := pg_temp.ctx('pa');
  st text; m text; dt text; h text;
begin
  perform pg_temp.as_user(2);
  begin
    perform public.cpc1_run_evaluate(run, pg_temp.put(pg_temp.cur(rec), array['forms','bm01',pa,'execution_date'], '"2026-02-31"'));
    st := 'no error';
  exception when others then
    get stacked diagnostics st = returned_sqlstate, m = message_text, dt = pg_exception_detail, h = pg_exception_hint;
  end;
  perform pg_temp.ok('D1 tính thử ngày 2026-02-31 → PT422 tiếng Việt, đúng ô',
    st = 'PT422' and h = 'INVALID_INPUT' and strpos(m, 'Ngày không có thật') > 0
    and (dt::jsonb->'issues'->0->'path') = jsonb_build_array('forms','bm01',pa,'execution_date'), concat_ws(' | ', st, m, dt));
end $$;

-- Idempotent + xung đột phiên bản vẫn như cũ.
do $$
declare run uuid := pg_temp.ctx('run1'); rec uuid := pg_temp.ctx('air1'); pa text := pg_temp.ctx('pa');
  r1 jsonb; r2 jsonb; d jsonb; rq uuid := gen_random_uuid(); n integer; v integer;
begin
  perform pg_temp.as_user(2);
  n := pg_temp.nrev(rec); v := pg_temp.ver(rec);
  d := pg_temp.put(pg_temp.cur(rec), array['forms','bm03',pa,'reading'], '"0,06"');
  r1 := pg_temp.try_save(run, rec, d, rq, v);
  r2 := pg_temp.try_save(run, rec, d, rq, v);
  perform pg_temp.ok('I1 lưu đôi cùng request_id → cùng kết quả, đúng 1 revision', r1->>'ok' = 'true' and r1 = r2
    and pg_temp.nrev(rec) = n + 1, r1::text || ' / ' || r2::text);
  r1 := pg_temp.try_save(run, rec, pg_temp.put(d, array['forms','bm03',pa,'reading'], '"0,07"'), gen_random_uuid(), v);
  perform pg_temp.ok('I2 phiên bản cũ → PT409', r1->>'state' = 'PT409', r1::text);
  r1 := pg_temp.try_save(run, rec, pg_temp.put(d, array['forms','bm03',pa,'reading'], '"0.070"'), gen_random_uuid(), v);
  perform pg_temp.ok('I3 "0.070" (phần nguyên 0) không bị coi là hàng nghìn; vẫn PT409 vì phiên bản cũ', r1->>'state' = 'PT409', r1::text);
end $$;

-- ---------- C + (4) + (5). Ký ----------
-- Đợt 2: một điểm trong phạm vi, Đạt → ký kiểm tra KHÔNG cần deviation.
do $$
declare run uuid := pg_temp.ctx('run2'); rec uuid := pg_temp.ctx('air2'); pa text := pg_temp.ctx('pa'); r jsonb; d jsonb;
begin
  perform pg_temp.as_user(2);
  d := pg_temp.put(pg_temp.put(pg_temp.cur(rec), array['forms','bm01',pa,'p05'], '"100"'), array['forms','bm01',pa,'p5'], '"0"');
  r := pg_temp.try_save(run, rec, d);
  perform pg_temp.ok('K0 lưu điểm trong phạm vi Đạt', r->>'ok' = 'true', r::text);
  perform pg_temp.as_user(1);
  r := pg_temp.sign(rec, 'kiem_tra');
  perform pg_temp.ok('K1 (4) phạm vi Đạt → ký kiểm tra được, không đòi deviation', r->>'ok' = 'true', r::text);
  r := public.cpc1_record_signatures(rec);
  perform pg_temp.ok('K1b cpc1_record_signatures: ket_qua pass theo phạm vi, không bắt buộc deviation', r->>'ket_qua' = 'pass' and r->>'bat_buoc_deviation' = 'false', r::text);
end $$;

do $$
declare run uuid := pg_temp.ctx('run2'); rec uuid := pg_temp.ctx('air2'); cal jsonb := pg_temp.ctx('cal_run2')::jsonb;
  k text; st text; m text; v integer;
begin
  perform pg_temp.as_user(2);
  select x into k from jsonb_object_keys(cal) x limit 1;
  cal := jsonb_set(cal, array[k, 'due_on'], '"2027-12-31"');
  v := (pg_temp.run_row(run)->>'version')::integer;
  begin
    perform public.cpc1_run_calibration_update(run, v, cal, 'Kiểm thử SQL', gen_random_uuid());
    st := 'no error';
  exception when others then get stacked diagnostics st = returned_sqlstate, m = message_text;
  end;
  perform pg_temp.ok('K2 (5) đổi hạn thiết bị khi đợt có hồ sơ đã ký → PT423, đợt không đổi',
    st = 'PT423' and pg_temp.run_row(run)#>>array['calibration',k,'due_on'] = '2027-06-30', concat_ws(' | ', st, m));
end $$;

do $$
declare run uuid := pg_temp.ctx('run2'); rec uuid := pg_temp.ctx('air2'); pa text := pg_temp.ctx('pa'); r jsonb;
begin
  perform pg_temp.as_user(8);
  r := pg_temp.sign(rec, 'duyet');
  perform pg_temp.ok('K3 Admin khác duyệt hồ sơ hợp lệ', r->>'ok' = 'true', r::text);
  perform pg_temp.as_user(2);
  r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.cur(rec), array['forms','bm01',pa,'p05'], '"200"'));
  perform pg_temp.ok('K4 hồ sơ đã duyệt vẫn khoá (PT423)', r->>'state' = 'PT423', r::text);
end $$;

-- Ô invalid theo kết quả tính (lưu lượng 0) → lưu được (không thuộc luật đầu vào) nhưng KHÔNG ký được kể cả có deviation.
do $$
declare run uuid := pg_temp.ctx('run1'); rec uuid := pg_temp.ctx('air1'); pa text := pg_temp.ctx('pa'); r jsonb;
begin
  perform pg_temp.as_user(2);
  r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.cur(rec), array['forms','bm03',pa,'flow'], '"0"'));
  perform pg_temp.ok('K5 lưu lưu lượng "0" (máy chủ chấm invalid)', r->>'ok' = 'true' and r#>>array['res','evaluation','forms','bm03','rows',pa,'status'] = 'invalid', r::text);
  perform pg_temp.as_user(1);
  r := pg_temp.sign(rec, 'kiem_tra', 'DEV-SQLTEST-01');
  perform pg_temp.ok('K6 C: hồ sơ có ô invalid + có mã deviation → INVALID_DATA, chỉ ô',
    r->>'ok' = 'false' and r->>'error_code' = 'INVALID_DATA'
    and exists (select 1 from jsonb_array_elements(r->'issues') x where x->'path' = jsonb_build_array('forms','bm03',pa,'flow')), r::text);
  r := public.cpc1_record_signatures(rec);
  perform pg_temp.ok('K6b co_the.kiem_tra=false và o_sai liệt kê ô', r#>>'{co_the,kiem_tra}' = 'false' and jsonb_array_length(r->'o_sai') > 0, r::text);
end $$;

-- Dữ liệu CŨ (lưu trước luật mới) chứa "99,950": không ký kiểm tra được; bản đã kiểm tra thì không duyệt được.
do $$
declare run uuid := pg_temp.ctx('run1n'); rec uuid := pg_temp.ctx('n21'); pn text := pg_temp.ctx('pn'); r jsonb; v integer;
begin
  perform pg_temp.as_user(1);
  r := pg_temp.sign(rec, 'kiem_tra', 'DEV-SQLTEST-02');
  perform pg_temp.ok('K7 nitơ hợp lệ (99,95, Đạt) ký kiểm tra được', r->>'ok' = 'true', r::text);
  v := pg_temp.ver(rec);
  reset role;
  -- Mô phỏng revision cũ: chuỗi "99,950" đã được hệ cũ đọc là 99.95.
  update public.cpc1_revisions set payload = jsonb_set(payload, array['forms','bm05',pn,'purity'], '"99,950"') where record_id = rec and version = v;
  set local role authenticated;
  perform pg_temp.as_user(8);
  r := pg_temp.sign(rec, 'duyet');
  perform pg_temp.ok('K8 C: bản cũ có "99,950" → duyệt bị chặn INVALID_DATA (thousand_ambiguous)',
    r->>'error_code' = 'INVALID_DATA' and exists (select 1 from jsonb_array_elements(r->'issues') x
      where x->'path' = jsonb_build_array('forms','bm05',pn,'purity') and x->>'rule' = 'thousand_ambiguous'), r::text);
end $$;

-- Cấu hình (tiêu chí) đổi sau khi tạo đợt → không ký được, không chấm theo cấu hình mới.
do $$
declare pa text := pg_temp.ctx('pa'); run uuid; rec uuid; r jsonb;
begin
  perform pg_temp.as_user(2);
  perform pg_temp.mk_run('run4', 'air4', 'air', jsonb_build_object('bm01', jsonb_build_array(pa)));
  run := pg_temp.ctx('run4'); rec := pg_temp.ctx('air4');
  r := pg_temp.try_save(run, rec, pg_temp.put(pg_temp.put(pg_temp.cur(rec), array['forms','bm01',pa,'p05'], '"3000"'), array['forms','bm01',pa,'p5'], '"0"'));
  perform pg_temp.ok('G0 lưu p05 3000 (Đạt theo giới hạn 3520 lúc tạo đợt)', r->>'ok' = 'true', r::text);
  reset role;
  -- Đổi giới hạn p05 của khí nén sau khi đã tạo đợt (chỉ trong giao dịch thử).
  update cpc1_private.gas_settings set config = jsonb_set(config, '{forms}', (
    select jsonb_agg(case when f->>'id' = 'bm01' then jsonb_set(f, '{locations}', (
      select jsonb_agg(case when l->>'id' = pa then jsonb_set(l, '{limits,p05}', '1000') else l end) from jsonb_array_elements(f->'locations') l)) else f end)
    from jsonb_array_elements(config->'forms') f))
  where system = 'air';
  set local role authenticated;
  perform pg_temp.as_user(1);
  r := pg_temp.sign(rec, 'kiem_tra');
  perform pg_temp.ok('G1 tiêu chí đổi sau khi tạo đợt → INVALID_DATA, rule evaluation_error, lý do "Tiêu chí đã thay đổi"',
    r->>'error_code' = 'INVALID_DATA' and exists (select 1 from jsonb_array_elements(r->'issues') x
      where x->>'rule' = 'evaluation_error' and strpos(x->>'reason', 'Tiêu chí đã thay đổi sau khi tạo đợt') > 0), r::text);
  r := public.cpc1_record_signatures(rec);
  perform pg_temp.ok('G2 cpc1_record_signatures: không cho ký kiểm tra, ket_qua không bị chấm lại thành fail',
    r#>>'{co_the,kiem_tra}' = 'false' and r->>'ket_qua' is distinct from 'fail', r::text);
end $$;

-- Quyền: hàm kiểm nội bộ không gọi được từ trình duyệt.
do $$
declare st text;
begin
  begin
    perform cpc1_private.input_issues('{}'::jsonb); st := 'callable';
  exception when insufficient_privilege then st := '42501';
  end;
  perform pg_temp.ok('P1 authenticated không gọi được cpc1_private.input_issues', st = '42501', st);
end $$;

reset role;
\echo '== Tổng kết'
select stt, case when dat then 'PASS' else 'FAIL' end kq, ca from t_kq order by stt;
do $$
declare n integer := (select count(*) from t_kq where not dat); t integer := (select count(*) from t_kq);
begin
  raise notice 'Tổng % ca, FAIL %', t, n;
  if n > 0 then raise exception 'qualification-input-validation: % / % ca FAIL', n, t; end if;
end $$;
rollback;

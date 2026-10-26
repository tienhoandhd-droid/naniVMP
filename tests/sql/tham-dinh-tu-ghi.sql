-- Tự ghi người thực hiện + thời gian lưu (migration 20261026100000).
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

-- Hai Admin tổng hợp, chỉ trong giao dịch này.
insert into public.vmp_email_cho_phep(email, ghi_chu)
values ('sqltest-tughi1@example.test', 'Synthetic SQL test only'), ('sqltest-tughi2@example.test', 'Synthetic SQL test only') on conflict do nothing;
insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('b2610260-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'sqltest-tughi1@example.test', 'not-used', '{}', '{}', now(), now()),
       ('b2610260-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'sqltest-tughi2@example.test', 'not-used', '{}', '{}', now(), now())
on conflict do nothing;
insert into public.profiles(id, full_name, email, role, department, is_active)
values ('b2610260-0000-4000-8000-000000000001', 'SQL Tự ghi Một', 'sqltest-tughi1@example.test', 'admin', 'qa', true),
       ('b2610260-0000-4000-8000-000000000002', 'SQL Tự ghi Hai', 'sqltest-tughi2@example.test', 'admin', 'qa', true)
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, is_active = true;

create function pg_temp.as_user(n integer) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', 'b2610260-0000-4000-8000-00000000000' || n, 'role', 'authenticated', 'aal', 'aal2',
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
create function pg_temp.sign_issues(d jsonb) returns jsonb language sql security definer as $$ select cpc1_private.input_issues(d, 'sign') $$;
create function pg_temp.ver(rec uuid) returns integer language sql security definer as $$ select version from public.cpc1_records where id = rec $$;
create function pg_temp.try_save(run uuid, rec uuid, d jsonb, reason text default null) returns jsonb language plpgsql as $$
declare res jsonb; st text; m text;
begin
  res := public.cpc1_run_save(run, d, rec, pg_temp.ver(rec), gen_random_uuid(), reason);
  return jsonb_build_object('ok', true, 'res', res);
exception when others then
  get stacked diagnostics st = returned_sqlstate, m = message_text;
  return jsonb_build_object('ok', false, 'state', st, 'msg', m);
end $$;
-- Giờ tự ghi: đúng dạng YYYY-MM-DDTHH:MI:SS+07:00 và là hôm nay theo giờ Việt Nam.
create function pg_temp.is_stamp(v jsonb) returns boolean language sql as $$
  select jsonb_typeof(v) = 'string' and v #>> '{}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\+07:00$'
     and left(v #>> '{}', 10) = to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM-DD') $$;
create function pg_temp.mk_run(p_run_key text, p_rec_key text, p_system text, p_forms jsonb) returns void language plpgsql as $$
declare scope jsonb := jsonb_build_array(jsonb_build_object('system', p_system, 'forms', p_forms)); cal jsonb := '{}'; req jsonb; res jsonb;
begin
  for req in select x from jsonb_array_elements(public.cpc1_run_requirements(scope)) x loop
    cal := cal || jsonb_build_object(req->>'key', jsonb_build_object('name', 'TB-SQLTEST', 'due_on', '2027-06-30'));
  end loop;
  res := public.cpc1_run_create(jsonb_build_object('title', 'SQLTEST tự ghi ' || p_run_key, 'mode', 'single', 'started_on', '2026-10-21', 'scope', scope, 'calibration', cal), gen_random_uuid());
  perform pg_temp.set_ctx(p_run_key, res->>'id');
  perform pg_temp.set_ctx(p_rec_key, (select x->>'record_id' from jsonb_array_elements(res->'items') x where x->>'system' = p_system));
end $$;

grant execute on all functions in schema pg_temp to authenticated;
set local role authenticated;

-- ---------- Tạo đợt ----------
do $$
declare air jsonb; st jsonb; pa text; pb text; ps text;
begin
  perform pg_temp.as_user(1);
  air := public.cpc1_gas_config('air'); st := public.cpc1_config();
  select x->'locations'->0->>'id', x->'locations'->1->>'id' into pa, pb from jsonb_array_elements(air->'forms') x where x->>'id' = 'bm01';
  ps := st->'locations'->0->>'id';
  perform pg_temp.set_ctx('pa', pa); perform pg_temp.set_ctx('pb', pb); perform pg_temp.set_ctx('ps', ps);
  perform pg_temp.mk_run('run_air', 'rec_air', 'air', jsonb_build_object('bm01', jsonb_build_array(pa, pb), 'bm04', jsonb_build_array(pa)));
  perform pg_temp.mk_run('run_stm', 'rec_stm', 'steam', jsonb_build_object('bm01', jsonb_build_array(ps), 'bm02', jsonb_build_array(ps)));
  perform pg_temp.ok('FIXTURE tạo đợt khí nén và hơi', pg_temp.ctx('rec_air') is not null and pg_temp.ctx('rec_stm') is not null);
end $$;

-- ---------- A. Khí nén ----------
do $$
declare run uuid := pg_temp.ctx('run_air'); rec uuid := pg_temp.ctx('rec_air'); pa text := pg_temp.ctx('pa'); pb text := pg_temp.ctx('pb');
  d jsonb; r jsonb; saved jsonb; first_at jsonb;
begin
  perform pg_temp.as_user(1);
  d := pg_temp.cur(rec);
  d := pg_temp.put(d, array['forms','bm01',pa], '{"p05":"12","p5":"0","executed_by":"Gõ tay","execution_date":"2026-01-01"}');
  d := pg_temp.put(d, array['forms','bm01',pb], '{"p05":"","p5":"","executed_by":"Gõ tay khi chưa đo","execution_date":"2026-01-02"}');
  d := pg_temp.put(d, array['forms','bm04',pa], '{"microbial":"KPH","sampled_by":"Người lấy mẫu","sampling_date":"2026-10-20","executed_by":"","result_date":""}');
  d := pg_temp.put(d, array['controls'], '{"positive_count":"100","executed_by":"","result_date":""}');
  r := pg_temp.try_save(run, rec, d);
  perform pg_temp.ok('A0 lưu khí nén thành công', r->>'ok' = 'true', r::text);
  saved := pg_temp.cur(rec);
  perform pg_temp.ok('A1 người thực hiện = tên tài khoản (bỏ giá trị gõ tay)', saved #>> array['forms','bm01',pa,'executed_by'] = 'SQL Tự ghi Một', saved #>> array['forms','bm01',pa]);
  perform pg_temp.ok('A2 thời gian = giờ lưu đủ ngày giờ +07:00', pg_temp.is_stamp(saved #> array['forms','bm01',pa,'execution_date']), saved #>> array['forms','bm01',pa]);
  perform pg_temp.ok('A3 điểm chưa có số đo: không ghi tên/giờ, bỏ giá trị gõ tay',
    saved #>> array['forms','bm01',pb,'executed_by'] = '' and saved #>> array['forms','bm01',pb,'execution_date'] = '', saved #>> array['forms','bm01',pb]);
  perform pg_temp.ok('A4 BM04: người lấy mẫu + ngày lấy mẫu giữ nhập tay',
    saved #>> array['forms','bm04',pa,'sampled_by'] = 'Người lấy mẫu' and saved #>> array['forms','bm04',pa,'sampling_date'] = '2026-10-20', saved #>> array['forms','bm04',pa]);
  perform pg_temp.ok('A5 BM04: người trả kết quả + ngày trả kết quả tự ghi',
    saved #>> array['forms','bm04',pa,'executed_by'] = 'SQL Tự ghi Một' and pg_temp.is_stamp(saved #> array['forms','bm04',pa,'result_date']), saved #>> array['forms','bm04',pa]);
  perform pg_temp.ok('A6 chứng dương: người đọc + ngày trả tự ghi',
    saved #>> '{controls,executed_by}' = 'SQL Tự ghi Một' and pg_temp.is_stamp(saved #> '{controls,result_date}'), saved #>> '{controls}');
  perform pg_temp.ok('A7 bản trả về cho trình duyệt có tên/giờ đã ghi', r #>> array['res','data','forms','bm01',pa,'executed_by'] = 'SQL Tự ghi Một', r::text);
  perform pg_temp.set_ctx('first_at', saved #>> array['forms','bm01',pa,'execution_date']);

  -- Người khác sửa số: giữ người/giờ lần lưu đầu; trình duyệt gửi trống hay gõ đè đều bị bỏ qua.
  perform pg_temp.as_user(2);
  d := pg_temp.put(pg_temp.cur(rec), array['forms','bm01',pa,'p05'], '"13"');
  d := pg_temp.put(d, array['forms','bm01',pa,'executed_by'], '"Đổi tên"');
  d := pg_temp.put(d, array['forms','bm01',pa,'execution_date'], '""');
  r := pg_temp.try_save(run, rec, d, 'Sửa số theo phiếu');
  saved := pg_temp.cur(rec);
  perform pg_temp.ok('A8 sửa số: giữ người + giờ lần lưu đầu',
    r->>'ok' = 'true' and saved #>> array['forms','bm01',pa,'executed_by'] = 'SQL Tự ghi Một' and saved #>> array['forms','bm01',pa,'execution_date'] = pg_temp.ctx('first_at')
    and saved #>> array['forms','bm01',pa,'p05'] = '13', r::text);

  -- Điểm mới có số đo ở lần lưu sau: ghi người lưu lần đó, không đòi lý do vì tên/giờ.
  d := pg_temp.put(pg_temp.cur(rec), array['forms','bm01',pb,'p05'], '"5"');
  d := pg_temp.put(d, array['forms','bm01',pb,'p5'], '"0"');
  r := pg_temp.try_save(run, rec, d);
  saved := pg_temp.cur(rec);
  perform pg_temp.ok('A9 điểm đo sau: tên người lưu lần đó, không đòi lý do',
    r->>'ok' = 'true' and saved #>> array['forms','bm01',pb,'executed_by'] = 'SQL Tự ghi Hai' and pg_temp.is_stamp(saved #> array['forms','bm01',pb,'execution_date']), r::text);
  perform pg_temp.ok('A10 kiểm khi ký: không báo lỗi ở ô tự ghi',
    not exists (select 1 from jsonb_array_elements(pg_temp.sign_issues(saved)) x where x->>'field' in ('executed_by','execution_date','result_date')),
    pg_temp.sign_issues(saved)::text);

  -- Ô nhập tay (ngày lấy mẫu) không nhận dạng ngày giờ.
  d := pg_temp.put(pg_temp.cur(rec), array['forms','bm04',pa,'sampling_date'], '"2026-10-20T08:00:00+07:00"');
  r := pg_temp.try_save(run, rec, d, 'Thử');
  perform pg_temp.ok('A11 ngày lấy mẫu dạng ngày giờ bị từ chối', r->>'ok' = 'false', r::text);
end $$;

-- ---------- B. Hơi tinh khiết ----------
do $$
declare run uuid := pg_temp.ctx('run_stm'); rec uuid := pg_temp.ctx('rec_stm'); ps text := pg_temp.ctx('ps'); d jsonb; r jsonb; saved jsonb;
begin
  perform pg_temp.as_user(1);
  d := pg_temp.cur(rec);
  d := pg_temp.put(d, array['bm01',ps], '[{"vg":"5","vc":"5","executor":"Gõ tay","date":"2026-01-01"},{"vg":"","vc":"","executor":"Gõ tay","date":""}]');
  d := pg_temp.put(d, array['bm02',ps], '{"conductivity":"0.8","executor":"","date":""}');
  r := pg_temp.try_save(run, rec, d);
  saved := pg_temp.cur(rec);
  perform pg_temp.ok('B1 hơi BM01 lần đo có số: tên + giờ tự ghi',
    r->>'ok' = 'true' and saved #>> array['bm01',ps,'0','executor'] = 'SQL Tự ghi Một' and pg_temp.is_stamp(saved #> array['bm01',ps,'0','date']), coalesce(saved #>> array['bm01',ps], r::text));
  perform pg_temp.ok('B2 hơi BM01 lần đo trống: không ghi, bỏ giá trị gõ tay', saved #>> array['bm01',ps,'1','executor'] = '', saved #>> array['bm01',ps]);
  perform pg_temp.ok('B3 hơi BM02: tên + giờ tự ghi', saved #>> array['bm02',ps,'executor'] = 'SQL Tự ghi Một' and pg_temp.is_stamp(saved #> array['bm02',ps,'date']), saved #>> array['bm02',ps]);
  perform pg_temp.ok('B4 hơi phần tổng hợp: tên + giờ tự ghi', saved #>> '{meta,executed_by}' = 'SQL Tự ghi Một' and pg_temp.is_stamp(saved #> '{meta,execution_date}'), saved #>> '{meta}');
end $$;

-- ---------- C. Hồ sơ cũ: giá trị đã có giữ nguyên ----------
do $$
declare cfg jsonb; outp jsonb;
begin
  reset role;
  select config into cfg from cpc1_private.gas_settings where system = 'air';
  outp := cpc1_private.stamp_entry('{"system":"air","forms":{"bm01":{"P1":{"p05":"1","executed_by":"QA cũ","execution_date":"2026-09-27"}}}}',
    '{"system":"air","forms":{"bm01":{"P1":{"p05":"2","executed_by":"","execution_date":""}}}}', cfg, 'Người mới', '2026-10-26T09:00:00+07:00');
  perform pg_temp.ok('C1 hồ sơ cũ: người + ngày nhập tay giữ nguyên', outp #>> '{forms,bm01,P1,executed_by}' = 'QA cũ' and outp #>> '{forms,bm01,P1,execution_date}' = '2026-09-27', outp::text);
  -- Dữ liệu cũ có số đo nhưng chưa có tên/giờ: không đụng tới thì để trống; sửa số thì ghi người sửa.
  outp := cpc1_private.stamp_entry('{"system":"air","forms":{"bm01":{"P1":{"p05":"1","executed_by":"","execution_date":""}}}}',
    '{"system":"air","forms":{"bm01":{"P1":{"p05":"1","executed_by":"","execution_date":""},"P2":{"p05":"3"}}}}', cfg, 'Người mới', '2026-10-26T09:00:00+07:00');
  perform pg_temp.ok('C3 dòng cũ không sửa: không gán nhầm người lưu sau', outp #>> '{forms,bm01,P1,executed_by}' = '' and outp #>> '{forms,bm01,P2,executed_by}' = 'Người mới', outp::text);
  outp := cpc1_private.stamp_entry('{"system":"air","forms":{"bm01":{"P1":{"p05":"1","executed_by":"","execution_date":""}}}}',
    '{"system":"air","forms":{"bm01":{"P1":{"p05":"2","executed_by":"","execution_date":""}}}}', cfg, 'Người sửa', '2026-10-26T09:00:00+07:00');
  perform pg_temp.ok('C4 dòng cũ chưa có tên/giờ, sửa số: ghi người sửa', outp #>> '{forms,bm01,P1,executed_by}' = 'Người sửa', outp::text);
  -- Hơi: lưu thiết bị khi chưa có số đo giữ nguyên meta {}; mã mẫu BM02 không kích hoạt tự ghi.
  outp := cpc1_private.stamp_entry(null, '{"meta":{},"equipment":{"balance_status":"Đạt"},"bm01":{},"bm02":{},"bm03":{},"bm04":{}}', null, 'Người mới', '2026-10-26T09:00:00+07:00');
  perform pg_temp.ok('C5 hơi chỉ lưu thiết bị: meta vẫn là {}', outp->'meta' = '{}'::jsonb, outp::text);
  outp := cpc1_private.stamp_entry(null, '{"meta":{},"bm02":{"S1":{"sample_chem":"M-01","executor":"","date":""}}}', null, 'Người lấy mẫu', '2026-10-26T09:00:00+07:00');
  perform pg_temp.ok('C6 hơi BM02 chỉ có mã mẫu: chưa ghi tên/giờ', outp #>> '{bm02,S1,executor}' = '' and outp #>> '{meta,executed_by}' is distinct from 'Người lấy mẫu', outp::text);
  outp := cpc1_private.stamp_entry('{"meta":{},"bm02":{"S1":{"sample_chem":"M-01","executor":"","date":""}}}', '{"meta":{},"bm02":{"S1":{"sample_chem":"M-01","conductivity":"0.9","executor":"","date":""}}}', null, 'Người nhập kết quả', '2026-10-26T09:00:00+07:00');
  perform pg_temp.ok('C7 hơi BM02 nhập kết quả: ghi người nhập kết quả', outp #>> '{bm02,S1,executor}' = 'Người nhập kết quả', outp::text);
  perform pg_temp.ok('C2 trình duyệt không gọi được hàm tự ghi',
    not has_function_privilege('authenticated', 'cpc1_private.stamp_entry(jsonb,jsonb,jsonb,text,text)', 'execute')
    and not has_function_privilege('anon', 'cpc1_private.stamp_row(jsonb,jsonb,text[],text[],text[],text,text,boolean)', 'execute'));
end $$;

do $$
declare n integer; f integer;
begin
  select count(*), count(*) filter (where not dat) into n, f from t_kq;
  raise notice 'TỔNG: % ca, % FAIL', n, f;
  if f > 0 then raise exception 'Có % ca FAIL', f; end if;
end $$;
rollback;

-- Đợt C rà soát 10/11 (migration 20261110170000):
--  C4  PDF in thêm chữ số khi số làm tròn chạm ngưỡng; kết luận, công thức, tiêu chí giữ nguyên.
--  C7  Chặn ký khi KẾT LUẬN đã lưu (PDF in) khác kết luận tính lại (dùng để ký).
-- Chạy trên BẢN SAO production; mọi thứ trong một giao dịch, ROLLBACK cuối.
\set ON_ERROR_STOP on
begin;
create temp table t_kq(stt serial primary key, ca text not null, dat boolean not null, chi_tiet text);
grant all on t_kq to authenticated; grant usage on sequence t_kq_stt_seq to authenticated;
create function pg_temp.ok(p_ca text, p_dat boolean, p_chi_tiet text default null) returns void language plpgsql as $$
begin
  insert into t_kq(ca, dat, chi_tiet) values (p_ca, coalesce(p_dat, false), p_chi_tiet);
  raise notice '%', case when coalesce(p_dat, false) then 'PASS ' || p_ca
    else 'FAIL ' || p_ca || ' — ' || coalesce(left(p_chi_tiet, 600), '') end;
end $$;
create function pg_temp.hoi(p_form text, p_r jsonb, p_t3 text default '') returns jsonb language sql as $$
  select cpc1_private.row_result(p_form, p_r, p_t3) $$;

-- ---------- C4: số in ----------
select pg_temp.ok('C4-01 BM01 Vg 6,4 Vc 189 → fail, in 3.505 (không in 3.50)',
  r->>'status' = 'fail' and r->'values'->>'print_result' = '3.505', r::text)
from (select pg_temp.hoi('bm01', '{"vg":"6,4","vc":"189"}') r) x;
select pg_temp.ok('C4-02 BM03 độ khô 0,949541 → fail, in 0.9495 (không in 0.95)',
  r->>'status' = 'fail' and r->'values'->>'print_result' = '0.9495', r::text)
from (select pg_temp.hoi('bm03', '{"me":"100","ms":"600","mf":"655,53","t1":"20","t2":"80","t3":"120"}') r) x;
select pg_temp.ok('C4-02b BM03 độ khô 0,94991 → fail, in 0.9499 (không in 0.95)',
  r->>'status' = 'fail' and r->'values'->>'print_result' = '0.9499', r::text)
from (select pg_temp.hoi('bm03', '{"me":"100","ms":"600","mf":"655,51","t1":"20","t2":"80","t3":"120"}') r) x;
select pg_temp.ok('C4-03 BM04 Te−To 25,04 → fail, in 25.04 (không in 25.0)',
  r->>'status' = 'fail' and r->'values'->>'print_result' = '25.04', r::text)
from (select pg_temp.hoi('bm04', '{"te":"50,04","to":"25","ts":"121"}', '120') r) x;
select pg_temp.ok('C4-04 số bình thường vẫn in như cũ: ' || x.mong,
  r->'values'->>'print_result' = x.mong and r->>'status' = x.st, r::text)
from (values ('bm01', '{"vg":"2","vc":"100,5"}'::jsonb, '', '2.03', 'pass'),
             ('bm03', '{"me":"100","ms":"600","mf":"650","t1":"20","t2":"80","t3":"120"}'::jsonb, '', '1.06', 'pass'),
             ('bm04', '{"te":"40","to":"25","ts":"121"}'::jsonb, '120', '15.0', 'pass')) x(f, d, t3, mong, st)
cross join lateral (select pg_temp.hoi(x.f, x.d, x.t3) r) y;
select pg_temp.ok('C4-05 số đúng bằng ngưỡng in như cũ (3.50, 0.95)',
  cpc1_private.print_num(3.5, 2, 3.5) = '3.50' and cpc1_private.print_num(0.95, 2, 0.95) = '0.95'
  and cpc1_private.print_num(3.4949, 2, 3.5) = '3.49' and cpc1_private.print_num(3.4999, 2, 3.5) = '3.4999',
  concat_ws(' | ', cpc1_private.print_num(3.5, 2, 3.5), cpc1_private.print_num(0.95, 2, 0.95), cpc1_private.print_num(3.4949, 2, 3.5), cpc1_private.print_num(3.4999, 2, 3.5)));
select pg_temp.ok('C4-06 tối đa 6 chữ số', cpc1_private.print_num(3.50000001, 2, 3.5) = '3.500000', cpc1_private.print_num(3.50000001, 2, 3.5));
select pg_temp.ok('C4-07 hồ sơ hiện có: tính lại khớp kết quả đã lưu (không đổi số in nào)',
  bool_and(cpc1_private.evaluate(v.payload) - 'source_context' = v.evaluation - 'source_context'),
  string_agg(r.id::text, ', ') filter (where cpc1_private.evaluate(v.payload) - 'source_context' <> v.evaluation - 'source_context'))
from public.cpc1_records r join public.cpc1_revisions v on v.record_id = r.id and v.version = r.version;

-- ---------- C7: ký khi kết quả lưu khác kết quả tính lại ----------
-- Người ký kiểm tra: Admin 73522c12 (có trong QA phụ trách, không phải người nhập hai hồ sơ khí nén dưới).
create function pg_temp.ky(p_rec uuid) returns jsonb language plpgsql as $$
declare r jsonb; v int := (select version from public.cpc1_records where id = p_rec);
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', '73522c12-d8ea-4d9d-9d76-aab963e0e823', 'role', 'authenticated',
    'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', floor(extract(epoch from now()))::bigint)))::text, true);
  set local role authenticated;
  r := public.cpc1_record_sign(p_rec, v, 'kiem_tra', null, null);
  reset role;
  return r;
end $$;
-- Sửa tay kết quả ĐÃ LƯU của phiên bản hiện hành (giả lập chấm bằng công thức cũ). Chỉ trong giao dịch.
create function pg_temp.sua_luu(p_rec uuid, p_path text[], p_val jsonb) returns void language sql as $$
  update public.cpc1_revisions v set evaluation = jsonb_set(v.evaluation, p_path, p_val)
  from public.cpc1_records r where r.id = p_rec and v.record_id = r.id and v.version = r.version $$;
create function pg_temp.dong_dau(p_rec uuid, p_form text) returns text language sql as $$
  select min(k) from public.cpc1_revisions v join public.cpc1_records r on r.id = v.record_id and v.version = r.version,
    jsonb_object_keys(v.evaluation #> array['forms', p_form, 'rows']) k where r.id = p_rec $$;
create function pg_temp.co_ly_do(r jsonb, p text) returns boolean language sql as $$
  select r->>'ok' = 'false' and r->>'error_code' = 'INVALID_DATA' and exists (select 1 from jsonb_array_elements(r->'issues') i
    where i->>'rule' = 'evaluation_error' and strpos(i->>'reason', p) > 0) $$;

-- (a) Khí nén 25a13f7f (đợt đã đóng): chỉ khác số in / chữ cảnh báo / formula_version → kết luận giống → ký được.
select pg_temp.sua_luu('25a13f7f-1a2a-4605-b8d4-175cc76b985f', array['forms','bm01','rows',pg_temp.dong_dau('25a13f7f-1a2a-4605-b8d4-175cc76b985f','bm01'),'values','print_result'], '"9.99"');
select pg_temp.sua_luu('25a13f7f-1a2a-4605-b8d4-175cc76b985f', array['forms','bm01','rows',pg_temp.dong_dau('25a13f7f-1a2a-4605-b8d4-175cc76b985f','bm01'),'warnings'], '{"p05":"chữ cảnh báo cũ"}');
select pg_temp.sua_luu('25a13f7f-1a2a-4605-b8d4-175cc76b985f', array['formula_version'], '"cu-thu"');
select pg_temp.ok('C7-01 chỉ khác print_result / cảnh báo / formula_version → vẫn ký kiểm tra được', r->>'ok' = 'true', r::text)
from (select pg_temp.ky('25a13f7f-1a2a-4605-b8d4-175cc76b985f') r) x;

-- (b) Khí nén 8d8884e1, mở lại đợt trong giao dịch: status MỘT dòng khác → chặn, "cần chấm lại".
update cpc1_private.runs set status = 'open', closed_at = null where id = (select run_id from cpc1_private.run_items where record_id = '8d8884e1-fd53-428a-be92-7badd79c513c');
select pg_temp.sua_luu('8d8884e1-fd53-428a-be92-7badd79c513c', array['forms','bm01','rows',pg_temp.dong_dau('8d8884e1-fd53-428a-be92-7badd79c513c','bm01'),'status'], '"fail"');
select pg_temp.ok('C7-02 đợt mở, khác status một dòng → không ký được, báo cần chấm lại',
  pg_temp.co_ly_do(r, 'Hồ sơ được chấm bằng công thức cũ — cần chấm lại trước khi ký.'), r::text)
from (select pg_temp.ky('8d8884e1-fd53-428a-be92-7badd79c513c') r) x;
select pg_temp.ok('C7-03 không tự chấm lại: kết quả đã lưu giữ nguyên, không thêm phiên bản',
  (select v.evaluation #>> array['forms','bm01','rows',pg_temp.dong_dau(r.id,'bm01'),'status'] from public.cpc1_records r
   join public.cpc1_revisions v on v.record_id = r.id and v.version = r.version where r.id = '8d8884e1-fd53-428a-be92-7badd79c513c') = 'fail'
  and (select version from public.cpc1_records where id = '8d8884e1-fd53-428a-be92-7badd79c513c') = 3);

-- (c) Nitơ 1760d54a (đợt đã đóng, không chấm lại được): khác overall → chặn, "Liên hệ Admin".
select pg_temp.sua_luu('1760d54a-d935-4499-ba12-333e0562a778', array['overall'], '"fail"');
select pg_temp.ok('C7-04 đợt đã đóng, khác kết luận → không ký được, báo Liên hệ Admin',
  pg_temp.co_ly_do(r, 'Kết luận đã lưu khác kết luận chấm lại theo công thức hiện hành. Liên hệ Admin.'), r::text)
from (select pg_temp.ky('1760d54a-d935-4499-ba12-333e0562a778') r) x;
select pg_temp.ok('C7-05 evaluation_verdicts bỏ qua values/errors/warnings/formula_version, giữ status',
  cpc1_private.evaluation_verdicts('{"overall":"pass","formula_version":"a","forms":{"bm01":{"status":"pass","rows":{"P1":[{"status":"pass","values":{"result":"1"},"errors":{}}]}}}}')
  = cpc1_private.evaluation_verdicts('{"overall":"pass","formula_version":"b","forms":{"bm01":{"status":"pass","rows":{"P1":[{"status":"pass","values":{"result":"2"},"errors":{"x":"y"},"warnings":{"t3":"z"}}]}}}}')
  and cpc1_private.evaluation_verdicts('{"overall":"pass","controls":{"status":"pass"},"forms":{}}')
  <> cpc1_private.evaluation_verdicts('{"overall":"pass","controls":{"status":"fail"},"forms":{}}'));

do $$
declare n_fail int; n_all int;
begin
  select count(*) filter (where not dat), count(*) into n_fail, n_all from t_kq;
  raise notice 'TỔNG: % ca, % FAIL', n_all, n_fail;
  if n_fail > 0 then raise exception 'Có % ca FAIL', n_fail; end if;
end $$;
rollback;

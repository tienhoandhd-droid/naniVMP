-- Đợt C rà soát 10/11 (migration 20261110170000):
--  C4  PDF in thêm chữ số khi số làm tròn chạm ngưỡng; kết luận, công thức, tiêu chí giữ nguyên.
--  C7  Chặn ký khi kết quả đã lưu (PDF in) khác kết quả tính lại (dùng để ký).
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
-- Hồ sơ khí nén 25a13f7f: sửa tay kết quả ĐÃ LƯU cho khác kết quả tính lại (giả lập chấm bằng công thức cũ).
update public.cpc1_revisions v set evaluation = jsonb_set(v.evaluation, '{forms,bm01,rows}',
  (select jsonb_object_agg(k, case when n = 1 then jsonb_set(x, '{values,print_result}', '"9.99"') else x end)
   from (select k, x, row_number() over (order by k) n from jsonb_each(v.evaluation #> '{forms,bm01,rows}') e(k, x)) z))
from public.cpc1_records r where r.id = '25a13f7f-1a2a-4605-b8d4-175cc76b985f' and v.record_id = r.id and v.version = r.version;
select pg_temp.ok('C7-01 kết quả lưu khác tính lại → không ký được, báo cần chấm lại',
  r->>'ok' = 'false' and r->>'error_code' = 'INVALID_DATA' and exists (select 1 from jsonb_array_elements(r->'issues') i
    where i->>'rule' = 'evaluation_error' and strpos(i->>'reason', 'Hồ sơ được chấm bằng công thức cũ — cần chấm lại trước khi ký') > 0), r::text)
from (select pg_temp.ky('25a13f7f-1a2a-4605-b8d4-175cc76b985f') r) x;
select pg_temp.ok('C7-02 không tự chấm lại: kết quả đã lưu giữ nguyên, không thêm phiên bản',
  (select count(*) from public.cpc1_revisions v join public.cpc1_records r on r.id = v.record_id and v.version = r.version
   where r.id = '25a13f7f-1a2a-4605-b8d4-175cc76b985f' and v.evaluation::text like '%"9.99"%') = 1
  and (select version from public.cpc1_records where id = '25a13f7f-1a2a-4605-b8d4-175cc76b985f') = 3);
select pg_temp.ok('C7-03 hồ sơ khớp (khí nén 8d8884e1) vẫn ký kiểm tra được', r->>'ok' = 'true', r::text)
from (select pg_temp.ky('8d8884e1-fd53-428a-be92-7badd79c513c') r) x;

do $$
declare n_fail int; n_all int;
begin
  select count(*) filter (where not dat), count(*) into n_fail, n_all from t_kq;
  raise notice 'TỔNG: % ca, % FAIL', n_all, n_fail;
  if n_fail > 0 then raise exception 'Có % ca FAIL', n_fail; end if;
end $$;
rollback;

-- Nội độc tố gel-clot ghi chữ như bản scan (migration 20261110110000).
-- Chạy trên BẢN SAO production. Chỉ đọc; mọi thứ trong MỘT giao dịch, ROLLBACK cuối.
-- Mỗi ca in PASS/FAIL; cuối file raise nếu có ca FAIL (thoát mã ≠ 0).
\set ON_ERROR_STOP on
begin;
create temp table t_kq(stt serial primary key, ca text not null, dat boolean not null, chi_tiet text);
create function pg_temp.ok(p_ca text, p_dat boolean, p_chi_tiet text default null) returns void language plpgsql as $$
begin
  insert into t_kq(ca, dat, chi_tiet) values (p_ca, coalesce(p_dat, false), p_chi_tiet);
  raise notice '%', case when coalesce(p_dat, false) then 'PASS ' || p_ca
    else 'FAIL ' || p_ca || ' — ' || coalesce(left(p_chi_tiet, 600), '') end;
end $$;
-- Một dòng BM02 hơi đầy đủ, chỉ thay ô nội độc tố / vi sinh.
create function pg_temp.bm02(p_endo text, p_micro text default 'KPH') returns jsonb language sql as $$
  select cpc1_private.row_result('bm02', jsonb_build_object('appearance', 'pass', 'conductivity', '0,963', 'toc', '200',
    'microbial', p_micro, 'endotoxin', p_endo), '', true) $$;

select pg_temp.ok('01 có hàm cpc1_private.endotoxin_word(text)',
  to_regprocedure('cpc1_private.endotoxin_word(text)') is not null);
do $$ begin
  if to_regprocedure('cpc1_private.endotoxin_word(text)') is null then
    raise exception 'RED: chưa có migration nội độc tố — các ca sau bỏ qua.';
  end if;
end $$;

-- Nhận dạng chữ: các cách viết hợp lệ, khoảng trắng thừa, dạng Unicode tách dấu (NFD).
select pg_temp.ok('02 nhận dạng ' || x.raw, cpc1_private.endotoxin_word(x.raw) is not distinct from x.mong, coalesce(cpc1_private.endotoxin_word(x.raw), 'null'))
from (values ('Đạt', 'pass'), ('đạt', 'pass'), ('ĐẠT', 'pass'), ('  Đạt ', 'pass'), (normalize('Đạt', NFD), 'pass'),
             ('Không đạt', 'fail'), ('không  đạt', 'fail'), ('KHÔNG ĐẠT', 'fail'), ('không Đạt', 'fail'), ('KHÔNG đạt', 'fail'),
             ('Không' || chr(160) || 'đạt', 'fail'), ('Đạt' || chr(10), 'pass'), (chr(9) || 'Đạt', 'pass'),
             ('OK', null), ('Dat', null), ('<0,25', null), ('0,1', null), ('', null), (chr(208) || 'ạt', null), ('Khôngđạt', null)) x(raw, mong);

-- Chấm BM02: chữ, số, chữ sai.
select pg_temp.ok('03 chấm nội độc tố ' || x.endo || ' → ' || x.mong,
  r->'parameters'->>'endotoxin' = x.mong and r->>'status' = x.tong, r::text)
from (values ('Đạt', 'pass', 'pass'), ('Không đạt', 'fail', 'fail'), ('0,1', 'pass', 'pass'), ('0,25', 'pass', 'pass'),
             ('0,3', 'fail', 'fail'), ('<0,25', 'invalid', 'invalid'), ('OK', 'invalid', 'invalid')) x(endo, mong, tong)
cross join lateral (select pg_temp.bm02(x.endo) r) z;
select pg_temp.ok('04 "Đạt" hiện chữ Đạt, không có lỗi', pg_temp.bm02('Đạt')->'values'->>'endotoxin' = 'Đạt'
  and not (pg_temp.bm02('Đạt')->'errors' ? 'endotoxin'), pg_temp.bm02('Đạt')::text);

-- Vi sinh KPH/KFH = không phát hiện = Đạt (luật 21/10, giữ nguyên).
select pg_temp.ok('05 vi sinh ' || x.m || ' → pass', pg_temp.bm02('Đạt', x.m)->'parameters'->>'microbial' = 'pass', pg_temp.bm02('Đạt', x.m)::text)
from (values ('KPH'), ('kph'), ('KFH'), ('3')) x(m);
select pg_temp.ok('06 vi sinh 12 → fail', pg_temp.bm02('Đạt', '12')->'parameters'->>'microbial' = 'fail');

-- Điểm không lấy mẫu nội độc tố: vẫn not_applicable như cũ.
select pg_temp.ok('07 điểm không có nội độc tố giữ not_applicable',
  cpc1_private.row_result('bm02', '{"appearance":"pass","conductivity":"0,9","toc":"200","microbial":"KPH"}', '', false)->'parameters'->>'endotoxin' = 'not_applicable');

-- Kiểm đầu vào khi KÝ: chữ hợp lệ không còn chặn; chữ sai vẫn chặn.
create function pg_temp.issue_keys(p_endo text, p_mode text) returns text[] language sql as $$
  select coalesce(array_agg(x->'path'->>(jsonb_array_length(x->'path') - 1) order by 1), '{}')
  from jsonb_array_elements(cpc1_private.input_issues(jsonb_build_object('bm02', jsonb_build_object(
    (select x->>'id' from jsonb_array_elements((select config from cpc1_private.settings where id)->'locations') x where (x->>'endotoxin')::boolean limit 1),
    jsonb_build_object('appearance', 'pass', 'conductivity', '0,963', 'toc', '200', 'microbial', 'KPH', 'endotoxin', p_endo))), p_mode)) x $$;
select pg_temp.ok('08 ký: "' || x.e || '" ' || case when x.chan then 'bị chặn' else 'không chặn' end,
  ('endotoxin' = any(pg_temp.issue_keys(x.e, 'sign'))) = x.chan, pg_temp.issue_keys(x.e, 'sign')::text)
from (values ('Đạt', false), ('Không đạt', false), ('0,1', false), ('<0,25', true), ('OK', true)) x(e, chan);
select pg_temp.ok('09 lưu: nội độc tố không chặn lưu (giữ A3)',
  not ('endotoxin' = any(pg_temp.issue_keys('<0,25', 'save'))) and not ('endotoxin' = any(pg_temp.issue_keys('Đạt', 'save'))));

-- Hồ sơ hơi 03/2026 (40bde8cb, v2, số liệu đúng bản scan): chấm lại bằng máy hiện tại.
select pg_temp.ok('10 hồ sơ 03/2026 chấm lại: BM02 không còn invalid',
  not exists (select 1 from jsonb_each(cpc1_private.evaluate(v.payload)->'forms'->'bm02'->'locations') l where l.value #>> '{}' = 'invalid'),
  (cpc1_private.evaluate(v.payload)->'forms'->'bm02'->'locations')::text)
from public.cpc1_revisions v where v.record_id = '40bde8cb-c9fe-4f7e-bb31-43e030821c07' and v.version = 2;
select pg_temp.ok('11 hồ sơ 03/2026: không còn ô chặn ký (T3 = 140,2 chỉ cảnh báo, 09/11)',
  jsonb_array_length(cpc1_private.evaluation_invalid_cells(cpc1_private.evaluate(v.payload))) = 0,
  cpc1_private.evaluation_invalid_cells(cpc1_private.evaluate(v.payload))::text)
from public.cpc1_revisions v where v.record_id = '40bde8cb-c9fe-4f7e-bb31-43e030821c07' and v.version = 2;

-- T3 BM03 (migration 20261110120000): ngoài 100–140 °C chỉ cảnh báo; ngoài bảng tra 100–180 °C vẫn chặn.
create function pg_temp.bm03(p_t3 text) returns jsonb language sql as $$
  select cpc1_private.row_result('bm03', jsonb_build_object('me', '0,647', 'ms', '1,292', 'mf', '1,364', 't1', '23,5', 't2', '80,3', 't3', p_t3)) $$;
select pg_temp.ok('15 T3 = 140,2 (bản scan B3.R13-P2 lần 2): Đạt 0,96, L = 2143,99, có cảnh báo, không lỗi',
  r->>'status' = 'pass' and r->'values'->>'print_result' = '0.96' and (r->'values'->>'latent')::numeric = 2143.99
  and r->'warnings' ? 't3' and r->'errors' = '{}'::jsonb, r::text)
from (select pg_temp.bm03('140,2') r) z;
select pg_temp.ok('16 T3 = ' || x.t || ' → ' || x.mong, (pg_temp.bm03(x.t)->>'status' = 'invalid') = (x.mong = 'chặn')
  and coalesce((pg_temp.bm03(x.t)->'warnings') ? 't3', false) = (x.mong = 'cảnh báo'), pg_temp.bm03(x.t)::text)
from (values ('99,9', 'chặn'), ('100', 'không'), ('140', 'không'), ('140,1', 'cảnh báo'), ('180', 'cảnh báo'), ('180,1', 'chặn')) x(t, mong);
select pg_temp.ok('17 T3 trong 100–140 không có khoá warnings', not (pg_temp.bm03('121') ? 'warnings'));
select pg_temp.ok('18 bộ kiểm khi ký bỏ qua cảnh báo T3',
  jsonb_array_length(cpc1_private.evaluation_invalid_cells(jsonb_build_object('forms', jsonb_build_object('bm03',
    jsonb_build_object('rows', jsonb_build_object('B3.R13-P2', jsonb_build_array(pg_temp.bm03('140,2')))))))) = 0
  and jsonb_array_length(cpc1_private.evaluation_invalid_cells(jsonb_build_object('forms', jsonb_build_object('bm03',
    jsonb_build_object('rows', jsonb_build_object('B3.R13-P2', jsonb_build_array(pg_temp.bm03('181')))))))) = 1);

-- Xu hướng: giá trị định tính bị bỏ qua, không làm lỗi (trước đây ép ::numeric → lỗi cả màn Lịch sử).
select pg_temp.ok('13 trend_rows bỏ qua nội độc tố "Đạt", vẫn giữ số và các chỉ tiêu khác',
  not exists (select 1 from jsonb_array_elements(t) x where x->>'metric' = 'endotoxin')
  and exists (select 1 from jsonb_array_elements(t) x where x->>'metric' = 'conductivity' and (x->>'value')::numeric = 0.963), t::text)
from (select cpc1_private.trend_rows('steam', v.payload, cpc1_private.evaluate(v.payload), i.scope) t
      from public.cpc1_revisions v join cpc1_private.run_items i on i.record_id = v.record_id
      where v.record_id = '40bde8cb-c9fe-4f7e-bb31-43e030821c07' and v.version = 2) z;
select pg_temp.ok('14 trend_rows: nội độc tố dạng số vẫn vào xu hướng',
  exists (select 1 from jsonb_array_elements(t) x where x->>'metric' = 'endotoxin' and (x->>'value')::numeric = 0.1), t::text)
from (select cpc1_private.trend_rows('steam',
        jsonb_build_object('bm02', jsonb_build_object('E1.R2-P1', jsonb_build_object('endotoxin', '0,1'))),
        jsonb_build_object('forms', jsonb_build_object('bm02', jsonb_build_object('rows', jsonb_build_object('E1.R2-P1', pg_temp.bm02('0,1'))))),
        '{"bm02":["E1.R2-P1"]}'::jsonb) t) z;

select pg_temp.ok('12 endotoxin_word không mở cho authenticated',
  not has_function_privilege('authenticated', 'cpc1_private.endotoxin_word(text)', 'execute'));

do $$
declare n_fail int; n_all int;
begin
  select count(*) filter (where not dat), count(*) into n_fail, n_all from t_kq;
  raise notice 'TỔNG: % ca, % FAIL', n_all, n_fail;
  if n_fail > 0 then raise exception 'Có % ca FAIL', n_fail; end if;
end $$;
rollback;

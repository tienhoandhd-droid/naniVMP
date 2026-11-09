-- Chứng dương vi sinh khí nén/nitơ ghi "+" như bản scan (migration 20261110130000).
-- Chạy trên BẢN SAO production. Chỉ đọc; một giao dịch, ROLLBACK cuối.
\set ON_ERROR_STOP on
begin;
create temp table t_kq(stt serial primary key, ca text not null, dat boolean not null, chi_tiet text);
create function pg_temp.ok(p_ca text, p_dat boolean, p_chi_tiet text default null) returns void language plpgsql as $$
begin
  insert into t_kq(ca, dat, chi_tiet) values (p_ca, coalesce(p_dat, false), p_chi_tiet);
  raise notice '%', case when coalesce(p_dat, false) then 'PASS ' || p_ca
    else 'FAIL ' || p_ca || ' — ' || coalesce(left(p_chi_tiet, 600), '') end;
end $$;
create function pg_temp.ctl(p text) returns jsonb language sql as $$
  select cpc1_private.gas_row('control', jsonb_build_object('positive_count', p), '{}') $$;

select pg_temp.ok('01 chứng dương ' || x.p || ' → ' || x.mong, pg_temp.ctl(x.p)->>'status' = x.mong, pg_temp.ctl(x.p)::text)
from (values ('+', 'pass'), (' + ', 'pass'), ('80', 'pass'), ('50', 'pass'), ('150', 'pass'), ('49', 'fail'), ('151', 'fail'),
             ('', 'incomplete'), ('++', 'invalid'), ('-', 'invalid'), ('Đạt', 'invalid'), ('80,5', 'invalid')) x(p, mong);
select pg_temp.ok('02 "+" hiện "+", không lỗi, không có kết quả số',
  pg_temp.ctl('+')->'values'->>'positive_count' = '+' and pg_temp.ctl('+')->'errors' = '{}'::jsonb
  and not (pg_temp.ctl('+')->'values' ? 'result'), pg_temp.ctl('+')::text);

-- Kiểm đầu vào (lưu và ký): "+" hợp lệ; chữ khác vẫn bị bắt.
create function pg_temp.issues(p text, p_mode text) returns int language sql as $$
  select jsonb_array_length(cpc1_private.input_object_issues(array['controls'], jsonb_build_object('positive_count', p),
    (select config->'controls_fields' from cpc1_private.gas_settings where system = 'air'), p_mode)) $$;
select pg_temp.ok('03 kiểm đầu vào ' || x.p || ' ' || x.m, (pg_temp.issues(x.p, x.m) > 0) = x.chan, pg_temp.issues(x.p, x.m)::text)
from (values ('+', 'save', false), ('+', 'sign', false), ('80', 'sign', false), ('++', 'sign', true), ('abc', 'save', true)) x(p, m, chan);

-- Bốn hồ sơ khí 03 & 09/2026 (bản scan ghi "+"): thêm "+" thì BM04 và tổng hợp hết "chưa đủ".
select pg_temp.ok('04 ' || i.system || ' ' || right(rn.title, 7) || ': thêm "+" → chứng dương pass, BM04 pass, tổng ' || coalesce(e->>'overall', '?'),
  e->'controls'->>'status' = 'pass' and e->'forms'->'bm04'->>'status' = 'pass' and e->>'overall' = 'pass'
  and jsonb_array_length(cpc1_private.evaluation_invalid_cells(e)) = 0, left(e::text, 400))
from cpc1_private.run_items i join cpc1_private.runs rn on rn.id = i.run_id
join public.cpc1_records r on r.id = i.record_id join public.cpc1_revisions v on v.record_id = r.id and v.version = r.version
cross join lateral (select cpc1_private.evaluate_gas(jsonb_set(v.payload, '{controls,positive_count}', '"+"')) e) z
where i.system in ('air', 'nitrogen');

do $$
declare n_fail int; n_all int;
begin
  select count(*) filter (where not dat), count(*) into n_fail, n_all from t_kq;
  raise notice 'TỔNG: % ca, % FAIL', n_all, n_fail;
  if n_fail > 0 then raise exception 'Có % ca FAIL', n_fail; end if;
end $$;
rollback;

-- =====================================================================
-- qualification-legacy-report.sql — PREFLIGHT CHỈ ĐỌC cho migration
-- 20261021100000_tham_dinh_chan_du_lieu_sai.sql
-- ---------------------------------------------------------------------
-- Liệt kê dữ liệu thẩm định ĐANG CÓ sẽ bị coi là sai theo luật mới, để biết
-- trước hồ sơ nào sẽ không lưu lại được nguyên trạng / không ký được.
-- Chạy được cả TRƯỚC migration (không gọi hàm mới): luật được viết lại bằng
-- SELECT thuần, đối chiếu 1-1 với cpc1_private.input_issues(…,'save') trên
-- DB thử. Chỉ SELECT, trong giao dịch read only; không sửa gì.
--   psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f scripts/qualification-legacy-report.sql
-- Cần PostgreSQL ≥ 16 (pg_input_is_valid).
-- =====================================================================
\set ON_ERROR_STOP on
begin read only;

-- 1) Ô sai theo luật LƯU mới ở PHIÊN BẢN HIỆN HÀNH của từng hồ sơ.
\echo '== 1) Ô sai ở phiên bản hiện hành (rule | hệ | hồ sơ | phiên bản | đường dẫn | giá trị)'
with rev as (
  select r.id record_id, r.version, rv.payload
  from public.cpc1_records r
  join public.cpc1_revisions rv on rv.record_id = r.id and rv.version = r.version
),
gas_spec as (
  select g.system, x.sec, null::text form, f->>'key' k, f->>'type' t, f->>'unit' u
  from cpc1_private.gas_settings g
  cross join lateral (values ('meta', g.config->'meta_fields'), ('controls', g.config->'controls_fields'), ('trend', g.config->'trend_fields')) x(sec, spec)
  cross join lateral jsonb_array_elements(coalesce(x.spec, '[]')) f
  union all
  select g.system, x.sec, fm->>'id', f->>'key', f->>'type', f->>'unit'
  from cpc1_private.gas_settings g
  cross join lateral jsonb_array_elements(g.config->'forms') fm
  cross join lateral (values ('equipment', fm->'equipment_fields'), ('forms', fm->'fields')) x(sec, spec)
  cross join lateral jsonb_array_elements(coalesce(x.spec, '[]')) f
  where fm->>'kind' = 'measurement'
),
steam_spec as (
  select fm->>'id' form, f->>'key' k, f->>'type' t, f->>'unit' u
  from cpc1_private.settings s
  cross join lateral jsonb_array_elements(s.config->'forms') fm
  cross join lateral jsonb_array_elements(coalesce(fm->'fields', '[]') || '[{"key":"date","type":"date"}]') f
  where s.id
),
cells as (
  -- khí: meta / controls / trend
  select rev.record_id, rev.version, rev.payload->>'system' sys, array[sp.sec, e.key] path, e.key k, e.value v, sp.t, sp.u
  from rev
  cross join lateral (values ('meta'), ('controls'), ('trend')) x(sec)
  cross join lateral jsonb_each(case when jsonb_typeof(rev.payload->x.sec) = 'object' then rev.payload->x.sec else '{}' end) e
  join gas_spec sp on sp.system = rev.payload->>'system' and sp.sec = x.sec and sp.k = e.key
  where rev.payload ? 'system'
  union all
  -- khí: thiết bị theo biểu mẫu
  select rev.record_id, rev.version, rev.payload->>'system', array['equipment', fe.key, e.key], e.key, e.value, sp.t, sp.u
  from rev
  cross join lateral jsonb_each(case when jsonb_typeof(rev.payload->'equipment') = 'object' then rev.payload->'equipment' else '{}' end) fe
  cross join lateral jsonb_each(case when jsonb_typeof(fe.value) = 'object' then fe.value else '{}' end) e
  join gas_spec sp on sp.system = rev.payload->>'system' and sp.sec = 'equipment' and sp.form = fe.key and sp.k = e.key
  where rev.payload ? 'system'
  union all
  -- khí: điểm đo
  select rev.record_id, rev.version, rev.payload->>'system', array['forms', ff.key, pt.key, e.key], e.key, e.value, sp.t, sp.u
  from rev
  cross join lateral jsonb_each(case when jsonb_typeof(rev.payload->'forms') = 'object' then rev.payload->'forms' else '{}' end) ff
  cross join lateral jsonb_each(case when jsonb_typeof(ff.value) = 'object' then ff.value else '{}' end) pt
  cross join lateral jsonb_each(case when jsonb_typeof(pt.value) = 'object' then pt.value else '{}' end) e
  join gas_spec sp on sp.system = rev.payload->>'system' and sp.sec = 'forms' and sp.form = ff.key and sp.k = e.key
  where rev.payload ? 'system'
  union all
  -- hơi: meta / thiết bị (ngày)
  select rev.record_id, rev.version, 'steam', array[x.sec, e.key], e.key, e.value, 'date', null
  from rev
  cross join lateral (values ('meta', array['execution_date', 'report_date', 'evaluation_date']), ('equipment', array['balance_due', 'thermometer_due'])) x(sec, keys)
  cross join lateral jsonb_each(case when jsonb_typeof(rev.payload->x.sec) = 'object' then rev.payload->x.sec else '{}' end) e
  where not rev.payload ? 'system' and e.key = any(x.keys)
  union all
  -- hơi: BM02 (một object mỗi điểm)
  select rev.record_id, rev.version, 'steam', array[fm.key, pt.key, e.key], e.key, e.value, sp.t, sp.u
  from rev
  cross join lateral jsonb_each(rev.payload) fm
  cross join lateral jsonb_each(case when jsonb_typeof(fm.value) = 'object' then fm.value else '{}' end) pt
  cross join lateral jsonb_each(case when jsonb_typeof(pt.value) = 'object' then pt.value else '{}' end) e
  join steam_spec sp on sp.form = fm.key and sp.k = e.key
  where not rev.payload ? 'system'
  union all
  -- hơi: BM01/03/04 (mảng 3 lần đo)
  select rev.record_id, rev.version, 'steam', array[fm.key, pt.key, (i.n - 1)::text, e.key], e.key, e.value, sp.t, sp.u
  from rev
  cross join lateral jsonb_each(rev.payload) fm
  cross join lateral jsonb_each(case when jsonb_typeof(fm.value) = 'object' then fm.value else '{}' end) pt
  cross join lateral jsonb_array_elements(case when jsonb_typeof(pt.value) = 'array' then pt.value else '[]' end) with ordinality i(row, n)
  cross join lateral jsonb_each(case when jsonb_typeof(i.row) = 'object' then i.row else '{}' end) e
  join steam_spec sp on sp.form = fm.key and sp.k = e.key
  where not rev.payload ? 'system'
),
typed as (
  select c.*, c.v #>> '{}' s,
    case when c.t = 'date' then case when c.k ~ '(expiry|_due)$' then 'expiry' else 'date' end
         when c.t = 'number' or coalesce(c.u, '') ~ 'CFU' then 'number' end kind
  from cells c
  where jsonb_typeof(c.v) = 'string' and btrim(c.v #>> '{}') <> ''
    -- miễn nội độc tố khi lưu (luật A3)
    and not (c.k = 'endotoxin' or coalesce(c.u, '') = 'EU/mL')
),
judged as (
  select t.*,
    case
      when t.kind = 'number' then case
        when t.k = 'microbial' and upper(btrim(t.s)) in ('KPH', 'KFH') then null
        when btrim(t.s) ~ '^[<>≤≥]' then 'comparison_symbol'
        when btrim(t.s) ~* '^[+-]?[0-9.,]+e[+-]?[0-9]+$' then 'exponent'
        when length(t.s) > 32 or trim(t.s) !~ '^[+-]?([0-9]+([.,][0-9]+)?|[.,][0-9]+)$' then 'not_number'
        when coalesce(t.u, '') not in ('kg', 'µS/cm', 'EU/mL') and trim(t.s) ~ '^[+-]?0*[1-9][0-9]*[.,][0-9]{3}$' then 'thousand_ambiguous'
        when abs(replace(trim(t.s), ',', '.')::numeric) > 1e12 then 'not_number'
        when replace(trim(t.s), ',', '.')::numeric < 0 and t.u is distinct from '°C' then 'negative'
        when coalesce(t.u, '') ~ '(hạt|CFU)' and replace(trim(t.s), ',', '.')::numeric <> trunc(replace(trim(t.s), ',', '.')::numeric) then 'not_integer'
        when t.u = '%' and (replace(trim(t.s), ',', '.')::numeric < 0 or replace(trim(t.s), ',', '.')::numeric > 100) then 'percent_range'
      end
      when t.kind in ('date', 'expiry') then case
        when t.s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then 'date_format'
        when not pg_input_is_valid(t.s, 'date') then 'date_unreal'
        when to_char(t.s::date, 'YYYY-MM-DD') <> t.s then 'date_unreal'
        when t.s::date < date '2020-01-01' then 'date_too_old'
        when t.kind = 'date' and t.s::date > (now() at time zone 'Asia/Bangkok')::date + 1 then 'date_future'
      end
    end rule
  from typed t
  where t.kind is not null
)
select rule, sys, record_id, version, array_to_string(path, '/') duong_dan, s gia_tri
from judged where rule is not null
order by rule, sys, record_id, duong_dan;

-- 2) Tổng hợp theo rule + số hồ sơ bị ảnh hưởng.
\echo '== 2) Tổng hợp: ô nội độc tố ghi chữ (chỉ chặn KÝ) và hồ sơ có kết quả lưu "invalid"'
select
  (select count(*) from public.cpc1_records) tong_ho_so,
  (select count(*) from public.cpc1_records r join public.cpc1_revisions rv on rv.record_id = r.id and rv.version = r.version
     where rv.evaluation->>'overall' = 'invalid') ho_so_ket_qua_luu_invalid,
  (select count(*) from public.cpc1_records r join public.cpc1_revisions rv on rv.record_id = r.id and rv.version = r.version
     cross join lateral jsonb_each(case when not rv.payload ? 'system' and jsonb_typeof(rv.payload->'bm02') = 'object' then rv.payload->'bm02' else '{}' end) pt
     where coalesce(pt.value->>'endotoxin', '') <> '' and trim(pt.value->>'endotoxin') !~ '^[+-]?([0-9]+([.,][0-9]+)?|[.,][0-9]+)$') o_noi_doc_to_khong_phai_so;

-- 3) Đợt có hạn thiết bị trước 01/01/2020 (sau migration: không lưu/tính/đổi hạn được).
\echo '== 3) Đợt có hạn thiết bị < 2020-01-01'
select r.id run_id, r.title, r.status, c.key thiet_bi, c.value->>'due_on' han
from cpc1_private.runs r
cross join lateral jsonb_each(case when jsonb_typeof(r.calibration) = 'object' then r.calibration else '{}' end) c
where coalesce(c.value->>'due_on', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and c.value->>'due_on' < '2020-01-01'
order by 1, 3;

rollback;

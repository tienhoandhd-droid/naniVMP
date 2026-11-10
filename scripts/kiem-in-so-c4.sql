-- C4 (rà soát 10/11): kiểm CHỈ ĐỌC trên production trước khi áp 20261110170000.
-- Tìm số đã lưu của hơi sạch (BM01 ≤ 3,5; BM03 ≥ 0,95; BM04 Te−To ≤ 25) có
-- print_result (số in PDF) bằng ĐÚNG ngưỡng trong khi số gốc khác ngưỡng
-- → PDF in "3,50"/"0,95"/"25,0" cạnh kết luận ngược chiều.
-- 0 dòng = không cần chấm lại. Có dòng = DỪNG, báo chủ dự án, KHÔNG tự chấm lại.
-- Chạy: psql "$DB" -v ON_ERROR_STOP=1 -f scripts/kiem-in-so-c4.sql
\set ON_ERROR_STOP on
begin transaction read only;
with nguong(form, lim) as (values ('bm01', 3.5::numeric), ('bm03', 0.95), ('bm04', 25)),
o as (
  select v.record_id, v.version, r.version as ban_hien_hanh, n.form, row_ ->'values'->>'print_result' as so_in,
         row_->'values'->>'raw_result' as so_goc, row_->>'status' as ket_qua, n.lim,
         exists (select 1 from cpc1_private.record_signatures s where s.record_id = v.record_id and s.version = v.version and s.y_nghia = 'duyet') as da_duyet
  from public.cpc1_revisions v
  join public.cpc1_records r on r.id = v.record_id
  cross join nguong n
  cross join lateral jsonb_path_query(v.evaluation, ('strict $.forms.' || n.form || '.rows.*[*]')::jsonpath) row_
  where coalesce(v.payload->>'system', 'steam') = 'steam'
    and row_->'values' ? 'print_result' and row_->'values' ? 'raw_result'
)
select record_id, version, ban_hien_hanh, version = ban_hien_hanh as la_ban_hien_hanh, da_duyet, form, so_in, so_goc, ket_qua
from o
where so_in::numeric = lim and so_goc::numeric <> lim
order by record_id, version, form;
\echo '== Tổng số dòng chạm ngưỡng (0 = không cần chấm lại)'
with nguong(form, lim) as (values ('bm01', 3.5::numeric), ('bm03', 0.95), ('bm04', 25))
select count(*) filter (where (row_->'values'->>'print_result')::numeric = n.lim and (row_->'values'->>'raw_result')::numeric <> n.lim) as so_dong_cham_nguong,
       count(distinct v.record_id) filter (where (row_->'values'->>'print_result')::numeric = n.lim and (row_->'values'->>'raw_result')::numeric <> n.lim) as so_ho_so,
       count(*) as so_dong_da_kiem
from public.cpc1_revisions v cross join nguong n
cross join lateral jsonb_path_query(v.evaluation, ('strict $.forms.' || n.form || '.rows.*[*]')::jsonpath) row_
where coalesce(v.payload->>'system', 'steam') = 'steam'
  and row_->'values' ? 'print_result' and row_->'values' ? 'raw_result';
rollback;

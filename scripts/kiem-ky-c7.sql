-- C7 (rà soát 10/11): kiểm CHỈ ĐỌC trên production.
-- Đếm hồ sơ CHƯA DUYỆT (phiên bản hiện hành) có kết quả ĐÃ LƯU (PDF in) khác
-- kết quả TÍNH LẠI bằng evaluate() hiện hành (dùng để ký). So bỏ source_context.
-- Sau khi áp 20261110170000 các hồ sơ này bị chặn ký kiểm tra/duyệt cho tới khi
-- chấm lại. 0 = không ảnh hưởng. Có = DỪNG, báo chủ dự án, KHÔNG tự chấm lại.
-- Chạy: psql "$DB" -v ON_ERROR_STOP=1 -f scripts/kiem-ky-c7.sql
\set ON_ERROR_STOP on
begin transaction read only;
with t_c7 as (
select r.id as record_id, r.version, coalesce(v.payload->>'system', 'steam') as he_thong,
       v.evaluation->>'overall' as ket_qua_luu,
       cpc1_private.evaluate(v.payload)->>'overall' as ket_qua_tinh_lai,
       (cpc1_private.evaluate(v.payload) - 'source_context') is distinct from (v.evaluation - 'source_context') as khac,
       exists (select 1 from cpc1_private.record_signatures s where s.record_id = r.id and s.version = r.version and s.y_nghia = 'duyet') as da_duyet
from public.cpc1_records r
join public.cpc1_revisions v on v.record_id = r.id and v.version = r.version)
select record_id, version, he_thong, ket_qua_luu, ket_qua_tinh_lai, da_duyet, khac from t_c7 where khac order by da_duyet, record_id;
\echo '== Tổng (hồ sơ chưa duyệt khác kết quả / tổng hồ sơ / đã duyệt khác)'
with t_c7 as (
select (cpc1_private.evaluate(v.payload) - 'source_context') is distinct from (v.evaluation - 'source_context') as khac,
       exists (select 1 from cpc1_private.record_signatures s where s.record_id = r.id and s.version = r.version and s.y_nghia = 'duyet') as da_duyet
from public.cpc1_records r
join public.cpc1_revisions v on v.record_id = r.id and v.version = r.version)
select count(*) filter (where khac and not da_duyet) as chua_duyet_khac,
       count(*) as tong_ho_so,
       count(*) filter (where khac and da_duyet) as da_duyet_khac
from t_c7;
rollback;

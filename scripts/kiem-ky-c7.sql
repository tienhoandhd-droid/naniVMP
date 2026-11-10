-- C7 (rà soát 10/11): kiểm CHỈ ĐỌC trên production.
-- Đếm hồ sơ CHƯA DUYỆT (phiên bản hiện hành) có KẾT LUẬN đã lưu (PDF in) khác kết luận
-- TÍNH LẠI bằng evaluate() hiện hành — cùng phép so với record_sign_evaluation:
-- cpc1_private.evaluation_verdicts (overall, status biểu mẫu, status từng dòng, controls.status).
-- Cần hàm evaluation_verdicts → chạy SAU khi áp 20261110170000 (migration không đổi dữ liệu),
-- hoặc trong giao dịch áp migration trước COMMIT.
-- Sau khi áp, các hồ sơ này bị chặn ký kiểm tra/duyệt. 0 = không ảnh hưởng.
-- Có = DỪNG, báo chủ dự án, KHÔNG tự chấm lại.
-- Chạy: psql "$DB" -v ON_ERROR_STOP=1 -f scripts/kiem-ky-c7.sql
\set ON_ERROR_STOP on
begin transaction read only;
do $$ begin
  if to_regprocedure('cpc1_private.evaluation_verdicts(jsonb)') is null then
    raise exception 'Thiếu cpc1_private.evaluation_verdicts — áp 20261110170000 trước khi chạy script này.';
  end if;
end $$;
with t_c7 as (
select r.id as record_id, r.version, coalesce(v.payload->>'system', 'steam') as he_thong,
       rn.status as trang_thai_dot,
       v.evaluation->>'overall' as ket_qua_luu,
       cpc1_private.evaluate(v.payload)->>'overall' as ket_qua_tinh_lai,
       cpc1_private.evaluation_verdicts(cpc1_private.evaluate(v.payload)) is distinct from cpc1_private.evaluation_verdicts(v.evaluation) as khac,
       exists (select 1 from cpc1_private.record_signatures s where s.record_id = r.id and s.version = r.version and s.y_nghia = 'duyet') as da_duyet
from public.cpc1_records r
join public.cpc1_revisions v on v.record_id = r.id and v.version = r.version
left join cpc1_private.run_items i on i.record_id = r.id
left join cpc1_private.runs rn on rn.id = i.run_id)
select record_id, version, he_thong, trang_thai_dot, ket_qua_luu, ket_qua_tinh_lai, da_duyet from t_c7 where khac order by da_duyet, record_id;
\echo '== Tổng (hồ sơ chưa duyệt khác kết luận / tổng hồ sơ / đã duyệt khác kết luận)'
with t_c7 as (
select cpc1_private.evaluation_verdicts(cpc1_private.evaluate(v.payload)) is distinct from cpc1_private.evaluation_verdicts(v.evaluation) as khac,
       exists (select 1 from cpc1_private.record_signatures s where s.record_id = r.id and s.version = r.version and s.y_nghia = 'duyet') as da_duyet
from public.cpc1_records r
join public.cpc1_revisions v on v.record_id = r.id and v.version = r.version)
select count(*) filter (where khac and not da_duyet) as chua_duyet_khac,
       count(*) as tong_ho_so,
       count(*) filter (where khac and da_duyet) as da_duyet_khac
from t_c7;
rollback;

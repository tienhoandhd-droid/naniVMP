\pset pager off

/*
 * Zero rows là đạt. Allowlist theo đúng signature và lý do được giữ tập trung
 * trong vmp_unfiltered_security_definer_item_readers(); preflight gọi chính
 * audit này nên CI và nút bật enforced không thể lệch tiêu chí.
 */
select signature
from public.vmp_unfiltered_security_definer_item_readers()
order by signature;

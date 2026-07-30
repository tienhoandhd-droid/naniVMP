-- Node "Đọc dữ liệu thô VMP" — workflow n8n "Vani VMP 5 — Nhận xét AI cho báo cáo"
-- (id RWwTaTtzjjfgE5np). Bản mở rộng 2026-07-30: thêm theo_thang (mục tiêu
-- 50%/tháng), bat_cap_theo_bo_phan (chậm giai đoạn nào), thang_toi (việc
-- tháng sau) — khớp đúng định nghĩa đã chốt với người dùng và dùng trong
-- src/lib/reportModel.ts phía web, để AI và dashboard không lệch số.
--
-- Định nghĩa mục tiêu 50%/tháng (giống hệt reportModel.ts::monthlyTargetTable):
--   tỷ lệ tháng M = (số hạng mục ĐÃ HOÀN THÀNH có deadline_vmp rơi vào tháng M)
--                 / (tổng số hạng mục có deadline_vmp rơi vào tháng M)
--   Tháng chưa có hạng mục nào đến hạn -> ty_le = null (không phải 0%).
--
-- CHỈ sửa 3 chỗ so với bản cũ, đánh dấu bằng "-- MỚI":
--   1. items CTE: thêm cột deadline_protocol/validation/report + cờ *_done
--   2. jsonb_build_object: thêm 3 khoá theo_thang / bat_cap_theo_bo_phan / thang_toi
--   Phần còn lại giữ nguyên 100% để không phá các trường đang dùng.

with pv as (select coalesce(nullif($1, ''), 'all') as bp),
items as (
  select
    p.validation_code as ma, o.name as ten, p.validation_type as loai,
    coalesce(nullif(btrim(p.owner_name), ''), 'chưa phân công') as nguoi,
    coalesce(p.criticality_score, 0) as diem,
    p.deadline_vmp as han, p.computed_status::text as trang_thai,
    coalesce(p.status_protocol_text, p.status_protocol::text) as tt_de_cuong,
    coalesce(p.status_validation_text, p.status_validation::text) as tt_tham_dinh,
    coalesce(p.status_report_text, p.status_report::text) as tt_bao_cao,
    coalesce(p.status_vmp_text, p.status_vmp::text) as tt_vmp,
    p.actual_vmp_date as ngay_xong, p.actual_validation_date as ngay_tham_dinh,
    coalesce(p.departments, array[]::text[]) as bo_phan,
    (current_date - p.deadline_vmp) as tre_ngay,
    -- MỚI: hạn từng giai đoạn + cờ đã-xong-hay-chưa (dùng enum thật, không
    -- lẫn text tiếng Việt, để so sánh boolean chắc chắn đúng).
    p.deadline_protocol as dl_de_cuong,
    p.deadline_validation as dl_tham_dinh,
    p.deadline_report as dl_bao_cao,
    (p.status_protocol = 'completed') as de_cuong_done,
    (p.status_validation = 'completed') as tham_dinh_done,
    (p.status_report = 'completed') as bao_cao_done
  from public.vmp_plan_items p
  join public.vmp_objects o on o.code = p.object_code
  where p.is_active and coalesce(p.item_state, 'active') = 'active'
    and p.year = extract(year from current_date)::int
    and ((select bp from pv) = 'all' or (select bp from pv) = any(coalesce(p.departments, array[]::text[])))
)
select jsonb_build_object(
  'pham_vi', (select bp from pv),
  'ngay_chay', current_date,
  'tong_hang_muc', (select count(*) from items),
  'theo_trang_thai', (select jsonb_object_agg(trang_thai, n) from (select trang_thai, count(*) n from items group by 1) x),
  'theo_bo_phan', (select jsonb_agg(jsonb_build_object('bo_phan', bp, 'tong', n, 'xong', xong, 'qua_han', qh) order by qh desc) from (
      select bp, count(*) n, count(*) filter (where trang_thai='done') xong, count(*) filter (where trang_thai='over') qh
      from items, unnest(bo_phan) bp group by bp) y),
  'theo_muc_trong_yeu', (select jsonb_agg(jsonb_build_object('muc', muc, 'tong', n, 'xong', xong,
        'ty_le_xong', round(100.0*xong/nullif(n,0))) order by muc) from (
      select case when diem >= 7 then '1_cao_7_9' when diem >= 4 then '2_trung_binh_4_6'
                  when diem > 0 then '3_thap_1_3' else '4_chua_cham' end muc,
             count(*) n, count(*) filter (where trang_thai='done') xong from items group by 1) z),
  'theo_nguoi', (select jsonb_agg(jsonb_build_object('nguoi', nguoi, 'tong', n, 'qua_han', qh,
        'trong_yeu_cao_chua_xong', cao) order by qh desc, n desc) from (
      select nguoi, count(*) n, count(*) filter (where trang_thai='over') qh,
             count(*) filter (where diem >= 7 and trang_thai <> 'done') cao from items group by nguoi) w),
  'qua_han', (select coalesce(jsonb_agg(jsonb_build_object('ma', ma, 'ten', ten, 'loai', loai, 'nguoi', nguoi,
        'diem', diem, 'han', han, 'tre_ngay', tre_ngay, 'bo_phan', bo_phan) order by diem desc, tre_ngay desc), '[]'::jsonb)
      from (select * from items where trang_thai = 'over' order by diem desc, tre_ngay desc limit 80) q),
  'sap_toi_han_60_ngay', (select coalesce(jsonb_agg(jsonb_build_object('ma', ma, 'ten', ten, 'nguoi', nguoi,
        'diem', diem, 'han', han, 'con_ngay', -tre_ngay) order by han), '[]'::jsonb)
      from (select * from items where trang_thai <> 'done' and han between current_date and current_date + 60 order by han limit 80) s),
  'loi_ho_so', (select coalesce(jsonb_agg(jsonb_build_object('ma', ma, 'nguoi', nguoi, 'loi', loi) order by ma), '[]'::jsonb) from (
      select ma, nguoi, 'ghi hoàn thành nhưng thiếu ngày thực tế' as loi from items where trang_thai='done' and ngay_xong is null
      union all select ma, nguoi, 'thiếu deadline VMP' from items where han is null
      union all select ma, nguoi, 'trọng yếu cao (>=7) nhưng chưa bắt đầu' from items where diem >= 7 and trang_thai = 'plan'
      limit 100) l),
  'chua_phan_cong', (select count(*) from items where nguoi = 'chưa phân công'),
  -- MỚI: mục tiêu 50%/tháng — due/done theo tháng có deadline_vmp rơi vào,
  -- ty_le=null khi chưa có hạng mục nào đến hạn tháng đó.
  'theo_thang', (
    select jsonb_agg(jsonb_build_object(
      'thang', m, 'can_hoan_thanh', coalesce(x.due_n, 0), 'da_hoan_thanh', coalesce(x.done_n, 0),
      -- ky: tháng CHƯA TỚI thì ty_le để null — 0% ở kỳ chưa xảy ra là đương
      -- nhiên, không phải trượt mục tiêu. Chấm điểm kỳ chưa tới là bịa kết luận.
      'ky', case when m < extract(month from current_date)::int then 'da_qua'
                 when m = extract(month from current_date)::int then 'dang_dien_ra'
                 else 'chua_toi' end,
      'ty_le', case when m > extract(month from current_date)::int then null
                    when coalesce(x.due_n, 0) = 0 then null
                    else round(100.0 * x.done_n / x.due_n) end,
      'muc_tieu', 50
    ) order by m)
    from generate_series(1, 12) m
    left join lateral (
      select count(*) due_n, count(*) filter (where trang_thai = 'done') done_n
      from items
      where han is not null
        and extract(month from han)::int = m
        and extract(year from han)::int = extract(year from current_date)::int
    ) x on true
  ),
  -- MỚI: bất cập theo bộ phận — chậm đề cương / thẩm định thực tế / báo cáo,
  -- xếp bộ phận nghẽn nặng nhất lên đầu.
  'bat_cap_theo_bo_phan', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'bo_phan', bp, 'tong', n, 'cham_de_cuong', cham_dc, 'cham_tham_dinh', cham_td,
      'cham_bao_cao', cham_bc, 'qua_han_vmp', qh
    ) order by (cham_dc + cham_td + cham_bc) desc), '[]'::jsonb)
    from (
      select bp, count(*) n,
        count(*) filter (where not de_cuong_done and dl_de_cuong < current_date) cham_dc,
        count(*) filter (where not tham_dinh_done and dl_tham_dinh < current_date) cham_td,
        count(*) filter (where not bao_cao_done and dl_bao_cao < current_date) cham_bc,
        count(*) filter (where trang_thai = 'over') qh
      from items, unnest(bo_phan) bp
      group by bp
    ) bc
  ),
  -- MỚI: việc dự kiến tháng tới — chưa xong, deadline_vmp rơi đúng tháng kế tiếp.
  'thang_toi', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'ma', ma, 'ten', ten, 'nguoi', nguoi, 'diem', diem, 'han', han, 'bo_phan', bo_phan
    ) order by han), '[]'::jsonb)
    from (
      select * from items
      where trang_thai <> 'done' and han is not null
        and han >= date_trunc('month', current_date) + interval '1 month'
        and han < date_trunc('month', current_date) + interval '2 month'
      order by han
      limit 100
    ) tt
  ),
  -- MỚI 2026-07-30: người nhận mail phân tích AI khớp phạm vi đang chạy.
  -- Đặt ngay trong truy vấn này thay vì thêm một node Postgres nữa: cùng một
  -- $1, cùng một vòng đi về DB, và không sinh thêm chỗ để hai node lệch phạm
  -- vi nhau. Chỉ dùng khi yêu cầu bật dung_danh_sach.
  --   pv='all'      → mọi người đang bật nhận phân tích AI
  --   pv='<bộ phận>' → người khai đúng bộ phận đó, cộng người khai 'tất cả'
  'nguoi_nhan_danh_sach', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'email', r.email,
      'ten', coalesce(nullif(btrim(r.recipient_name), ''), r.email)
    ) order by r.email), '[]'::jsonb)
    from public.vmp_alert_recipients r
    where r.ai_report_enabled
      and (
        (select bp from pv) = 'all'
        or r.scope_type = 'tất cả'
        or (r.scope_type = 'bộ phận' and lower(btrim(coalesce(r.scope, ''))) = (select bp from pv))
      )
  ),
  'chi_tiet_toan_bo', (select coalesce(jsonb_agg(jsonb_build_object('ma', ma, 'ten', ten, 'loai', loai,
        'bo_phan', bo_phan, 'nguoi', nguoi, 'diem', diem, 'han', han, 'trang_thai', trang_thai,
        'de_cuong', tt_de_cuong, 'tham_dinh', tt_tham_dinh, 'bao_cao', tt_bao_cao, 'vmp', tt_vmp) order by ma), '[]'::jsonb)
      from items)
) as du_lieu

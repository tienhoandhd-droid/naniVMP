-- Node "Đọc dữ liệu thô VMP" — workflow n8n "Vani VMP 5" (id RWwTaTtzjjfgE5np).
--
-- Bản 2026-07-31: nhận KỲ BÁO CÁO từ web thay vì khoá cứng vào năm hiện tại.
-- Trang Báo cáo cho chọn tháng / quý / cả năm, nên AI phải đọc ĐÚNG lát cắt
-- đang hiện trên màn hình — nếu không thì bản nhận xét nói một đằng, bảng số
-- trên web nói một nẻo.
--
-- Tham số (queryReplacement, đúng thứ tự):
--   $1 pham_vi     — mã bộ phận, hoặc 'all'
--   $2 nam         — năm của kỳ
--   $3 thang_tu    — tháng đầu kỳ (1..12)
--   $4 thang_den   — tháng cuối kỳ (1..12)
--   $5 nam_sau     — năm của KỲ SAU
--   $6 thang_sau_tu, $7 thang_sau_den — dải tháng của KỲ SAU
--
-- HAI TẬP DỮ LIỆU, đừng nhầm — dùng sai tập là ra số vô nghĩa:
--   items_nam — toàn bộ hạng mục của NĂM. Chỉ dùng cho `theo_thang` (biểu đồ
--               xu hướng 12 tháng) và `sap_toi_han_60_ngay` (việc sắp tới, vốn
--               không thuộc kỳ nào). Cắt theo kỳ thì biểu đồ chỉ còn một cột.
--   items     — items_nam ∩ mốc đích rơi vào kỳ. Đây là lát cắt tương ứng
--               `scopedKy` bên web, dùng cho mọi thứ còn lại.
--
-- ⚠️ Kỳ là LÁT CẮT THEO MỐC ĐÍCH, KHÔNG phải ảnh chụp quá khứ: "kỳ tháng 6"
-- nghĩa là hạng mục có mốc đích tháng 6, và tính tới HÔM NAY đã xong bao nhiêu.
-- Dữ liệu không có ngày hoàn thành thực tế (kiểm 2026-07-31: 83/83 hạng mục
-- "đã hoàn thành VMP" đều trống actual_vmp_date) nên không thể dựng lại đúng
-- trạng thái tại thời điểm đó.

with pv as (
  select
    coalesce(nullif($1, ''), 'all')                     as bp,
    coalesce(nullif($2, '')::int, extract(year from current_date)::int) as nam,
    coalesce(nullif($3, '')::int, 1)                    as thang_tu,
    coalesce(nullif($4, '')::int, 12)                   as thang_den,
    coalesce(nullif($5, '')::int, extract(year from current_date)::int) as nam_sau,
    coalesce(nullif($6, '')::int, 1)                    as thang_sau_tu,
    coalesce(nullif($7, '')::int, 12)                   as thang_sau_den
),
items_nam as (
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
    coalesce(o.area, '') as khu_vuc,
    (current_date - p.deadline_vmp) as tre_ngay,
    p.deadline_protocol as dl_de_cuong,
    p.deadline_validation as dl_tham_dinh,
    p.deadline_report as dl_bao_cao,
    (p.status_protocol = 'completed') as de_cuong_done,
    (p.status_validation = 'completed') as tham_dinh_done,
    (p.status_report = 'completed') as bao_cao_done
  from public.vmp_plan_items p
  join public.vmp_objects o on o.code = p.object_code
  where p.is_active and coalesce(p.item_state, 'active') = 'active'
    and p.year = (select nam from pv)
    and ((select bp from pv) = 'all' or (select bp from pv) = any(coalesce(p.departments, array[]::text[])))
),
items as (
  select * from items_nam
  where han is not null
    and extract(month from han)::int between (select thang_tu from pv) and (select thang_den from pv)
)
select jsonb_build_object(
  'pham_vi', (select bp from pv),
  'nam', (select nam from pv),
  'thang_tu', (select thang_tu from pv),
  'thang_den', (select thang_den from pv),
  'ngay_chay', current_date,
  'tong_hang_muc', (select count(*) from items),
  'tong_hang_muc_ca_nam', (select count(*) from items_nam),
  'theo_trang_thai', (select jsonb_object_agg(trang_thai, n) from (select trang_thai, count(*) n from items group by 1) x),
  'theo_bo_phan', (select jsonb_agg(jsonb_build_object('bo_phan', bp, 'tong', n, 'xong', xong, 'qua_han', qh) order by qh desc) from (
      select bp, count(*) n, count(*) filter (where trang_thai='done') xong, count(*) filter (where trang_thai='over') qh
      from items, unnest(bo_phan) bp group by bp) y),
  'theo_muc_trong_yeu', (select jsonb_agg(jsonb_build_object('muc', muc, 'tong', n, 'xong', xong, 'qua_han', qh,
        'ty_le_xong', round(100.0*xong/nullif(n,0))) order by muc) from (
      select case when diem >= 7 then '1_cao_7_9' when diem >= 4 then '2_trung_binh_4_6'
                  when diem > 0 then '3_thap_1_3' else '4_chua_cham' end muc,
             count(*) n, count(*) filter (where trang_thai='done') xong,
             count(*) filter (where trang_thai='over') qh from items group by 1) z),
  'theo_nguoi', (select jsonb_agg(jsonb_build_object('nguoi', nguoi, 'tong', n, 'qua_han', qh,
        'trong_yeu_cao_chua_xong', cao) order by qh desc, n desc) from (
      select nguoi, count(*) n, count(*) filter (where trang_thai='over') qh,
             count(*) filter (where diem >= 7 and trang_thai <> 'done') cao from items group by nguoi) w),
  'qua_han', (select coalesce(jsonb_agg(jsonb_build_object('ma', ma, 'ten', ten, 'loai', loai, 'nguoi', nguoi,
        'diem', diem, 'han', han, 'tre_ngay', tre_ngay, 'bo_phan', bo_phan) order by diem desc, tre_ngay desc), '[]'::jsonb)
      from (select * from items where trang_thai = 'over' order by diem desc, tre_ngay desc limit 80) q),
  -- Việc sắp tới hạn KHÔNG thuộc kỳ nào nên đọc từ items_nam: nếu cắt theo kỳ
  -- đã qua thì mục này luôn rỗng, mà đó lại là phần hữu ích nhất của bản cảnh báo.
  'sap_toi_han_60_ngay', (select coalesce(jsonb_agg(jsonb_build_object('ma', ma, 'ten', ten, 'nguoi', nguoi,
        'diem', diem, 'han', han, 'con_ngay', -tre_ngay) order by han), '[]'::jsonb)
      from (select * from items_nam where trang_thai <> 'done' and han between current_date and current_date + 60 order by han limit 80) s),
  'loi_ho_so', (select coalesce(jsonb_agg(jsonb_build_object('ma', ma, 'nguoi', nguoi, 'loi', loi) order by ma), '[]'::jsonb) from (
      select ma, nguoi, 'ghi hoàn thành nhưng thiếu ngày thực tế' as loi from items where trang_thai='done' and ngay_xong is null
      union all select ma, nguoi, 'thiếu deadline VMP' from items_nam where han is null
      union all select ma, nguoi, 'trọng yếu cao (>=7) nhưng chưa bắt đầu' from items where diem >= 7 and trang_thai = 'plan'
      limit 100) l),
  'chua_phan_cong', (select count(*) from items where nguoi = 'chưa phân công'),
  'chua_co_moc_dich', (select count(*) from items_nam where han is null),
  -- Biểu đồ xu hướng: LUÔN 12 tháng của năm, đọc từ items_nam. Kỳ đang xem chỉ
  -- để tô đậm ở phía web, không được cắt bớt dữ liệu ở đây.
  'theo_thang', (
    select jsonb_agg(jsonb_build_object(
      'thang', m, 'can_hoan_thanh', coalesce(x.due_n, 0), 'da_hoan_thanh', coalesce(x.done_n, 0),
      'trong_ky', (m between (select thang_tu from pv) and (select thang_den from pv)),
      'ky', case when ((select nam from pv) < extract(year from current_date)::int)
                   or ((select nam from pv) = extract(year from current_date)::int and m < extract(month from current_date)::int) then 'da_qua'
                 when (select nam from pv) = extract(year from current_date)::int and m = extract(month from current_date)::int then 'dang_dien_ra'
                 else 'chua_toi' end,
      'ty_le', case when ((select nam from pv) > extract(year from current_date)::int)
                      or ((select nam from pv) = extract(year from current_date)::int and m > extract(month from current_date)::int) then null
                    when coalesce(x.due_n, 0) = 0 then null
                    else round(100.0 * x.done_n / x.due_n) end,
      'muc_tieu', 50
    ) order by m)
    from generate_series(1, 12) m
    left join lateral (
      select count(*) due_n, count(*) filter (where trang_thai = 'done') done_n
      from items_nam
      where han is not null and extract(month from han)::int = m
    ) x on true
  ),
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
  -- Việc của KỲ SAU (web tính nextPeriod rồi truyền xuống $5/$6/$7).
  'thang_toi', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'ma', ma, 'ten', ten, 'nguoi', nguoi, 'diem', diem, 'han', han, 'bo_phan', bo_phan
    ) order by han), '[]'::jsonb)
    from (
      select i.* from public.vmp_plan_items p
      join public.vmp_objects o on o.code = p.object_code
      join lateral (select p.validation_code as ma, o.name as ten,
             coalesce(nullif(btrim(p.owner_name), ''), 'chưa phân công') as nguoi,
             coalesce(p.criticality_score, 0) as diem, p.deadline_vmp as han,
             coalesce(p.departments, array[]::text[]) as bo_phan) i on true
      where p.is_active and coalesce(p.item_state, 'active') = 'active'
        and p.computed_status::text <> 'done'
        and p.year = (select nam_sau from pv)
        and p.deadline_vmp is not null
        and extract(month from p.deadline_vmp)::int between (select thang_sau_tu from pv) and (select thang_sau_den from pv)
        and ((select bp from pv) = 'all' or (select bp from pv) = any(coalesce(p.departments, array[]::text[])))
      order by p.deadline_vmp
      limit 100
    ) tt
  ),
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
  -- Dữ liệu thô đầy đủ của kỳ — vừa để AI dẫn chứng, vừa để xuất CSV đính kèm
  -- mail (người dùng chốt 2026-07-31: mail phải có cả dữ liệu thô lẫn phân tích).
  'chi_tiet_toan_bo', (select coalesce(jsonb_agg(jsonb_build_object('ma', ma, 'ten', ten, 'loai', loai,
        'bo_phan', bo_phan, 'khu_vuc', khu_vuc, 'nguoi', nguoi, 'diem', diem, 'han', han, 'trang_thai', trang_thai,
        'tre_ngay', tre_ngay, 'dl_de_cuong', dl_de_cuong, 'dl_tham_dinh', dl_tham_dinh, 'dl_bao_cao', dl_bao_cao,
        'ngay_xong', ngay_xong,
        'de_cuong', tt_de_cuong, 'tham_dinh', tt_tham_dinh, 'bao_cao', tt_bao_cao, 'vmp', tt_vmp) order by ma), '[]'::jsonb)
      from items)
) as du_lieu

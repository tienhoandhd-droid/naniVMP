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
    p.deadline_vmp as han,
    (p.status_vmp = 'completed') as da_xong,
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
    (p.status_report = 'completed') as bao_cao_done,
    (p.status_protocol = 'in_progress') as de_cuong_dang,
    (p.status_validation = 'in_progress') as tham_dinh_dang,
    (p.status_report = 'in_progress') as bao_cao_dang,
    p.computed_status::text as trang_thai_vmp
  from public.vmp_plan_items p
  join public.vmp_objects o on o.code = p.object_code
  where p.is_active and coalesce(p.item_state, 'active') = 'active'
    -- "Thuộc năm N" = MỐC ĐÍCH VMP rơi vào năm N, đúng như web (hanVmp trong
    -- reportModel.ts). Bản cũ lọc theo cột p.year — là năm trong mã hạng mục,
    -- KHÔNG phải năm của hạn. Hai cái này hiện trùng nhau nên chưa lộ ra, nhưng
    -- một hạng mục 2026 bị dời hạn sang tháng 1/2027 sẽ nằm ở 2027 trên web và
    -- ở 2026 trong mail AI — hai con số khác nhau cho cùng một câu hỏi.
    and ( extract(year from p.deadline_vmp)::int = (select nam from pv)
          -- Hạng mục CHƯA có mốc đích không rơi vào năm nào theo hạn. Vẫn kéo
          -- vào theo năm kế hoạch để mục chất lượng dữ liệu bên dưới còn nêu
          -- được tên chúng — đó là lý do duy nhất chúng có mặt ở đây.
          or (p.deadline_vmp is null and p.year = (select nam from pv)) )
    and ((select bp from pv) = 'all' or (select bp from pv) = any(coalesce(p.departments, array[]::text[])))
),
items as (
  select *,
    case when da_xong then 'done'
         when han < current_date then 'over'
         else 'todo' end as trang_thai
  from items_nam
  where han is not null
    and extract(month from han)::int between (select thang_tu from pv) and (select thang_den from pv)
),
items_sau as (
  select
    p.validation_code as ma, o.name as ten,
    coalesce(nullif(btrim(p.owner_name), ''), 'chưa phân công') as nguoi,
    coalesce(p.criticality_score, 0) as diem,
    coalesce(p.departments, array[]::text[]) as bo_phan,
    p.deadline_vmp as han
  from public.vmp_plan_items p
  join public.vmp_objects o on o.code = p.object_code
  where p.is_active and coalesce(p.item_state, 'active') = 'active'
    and p.year = (select nam_sau from pv)
    and p.status_vmp <> 'completed'
    and ((select bp from pv) = 'all' or (select bp from pv) = any(coalesce(p.departments, array[]::text[])))
    and p.deadline_vmp is not null
    and extract(month from p.deadline_vmp)::int between (select thang_sau_tu from pv) and (select thang_sau_den from pv)
)
select jsonb_build_object(
  'pham_vi', (select bp from pv),
  'nam', (select nam from pv),
  'thang_tu', (select thang_tu from pv),
  'thang_den', (select thang_den from pv),
  'ngay_chay', current_date,
  'tong_hang_muc', (select count(*) from items),
  -- Đếm CÓ MỐC ĐÍCH, để khớp ô "Tổng hạng mục năm N" trên web (443, không phải
  -- 448). Web loại hạng mục thiếu mốc đích ra khỏi mọi phép tính năm và kể
  -- riêng chúng ở mục chất lượng dữ liệu; ở đây cũng vậy — xem
  -- 'chua_co_moc_dich' bên dưới.
  'tong_hang_muc_ca_nam', (select count(*) from items_nam where han is not null),
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
  'sap_toi_han_60_ngay', (select coalesce(jsonb_agg(jsonb_build_object('ma', ma, 'ten', ten, 'nguoi', nguoi,
        'diem', diem, 'han', han, 'con_ngay', -tre_ngay) order by han), '[]'::jsonb)
      from (select * from items_nam where not da_xong and han between current_date and current_date + 60 order by han limit 80) s),
  'loi_ho_so', (select coalesce(jsonb_agg(jsonb_build_object('ma', ma, 'nguoi', nguoi, 'loi', loi) order by ma), '[]'::jsonb) from (
      select ma, nguoi, 'ghi hoàn thành nhưng thiếu ngày thực tế' as loi from items where trang_thai='done' and ngay_xong is null
      union all select ma, nguoi, 'thiếu mốc đích VMP' from items_nam where han is null
      union all select ma, nguoi, 'trọng yếu cao (>=7) nhưng chưa xong' from items where diem >= 7 and trang_thai <> 'done'
      limit 100) l),
  'chua_phan_cong', (select count(*) from items where nguoi = 'chưa phân công'),
  'chua_co_moc_dich', (select count(*) from items_nam where han is null),
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
      select count(*) due_n, count(*) filter (where da_xong) done_n
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
  'thang_toi', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'ma', ma, 'ten', ten, 'nguoi', nguoi, 'diem', diem, 'han', han, 'bo_phan', bo_phan
    ) order by han), '[]'::jsonb)
    from (select * from items_sau order by han limit 100) tt
  ),
  'tong_quan_nam', (
    select jsonb_build_object(
      'tong', count(*),
      'de_cuong',  jsonb_build_object('xong', count(*) filter (where de_cuong_done),
                                      'qua_han', count(*) filter (where not de_cuong_done and dl_de_cuong < current_date)),
      'tham_dinh', jsonb_build_object('xong', count(*) filter (where tham_dinh_done),
                                      'qua_han', count(*) filter (where not tham_dinh_done and dl_tham_dinh < current_date)),
      'ho_so',     jsonb_build_object('xong', count(*) filter (where bao_cao_done),
                                      'qua_han', count(*) filter (where not bao_cao_done and coalesce(dl_bao_cao, han) < current_date)),
      'vmp',       jsonb_build_object('xong', count(*) filter (where da_xong),
                                      'qua_han', count(*) filter (where not da_xong and han < current_date))
    ) from items_nam where han is not null
  ),
  'giai_doan_nam', (
    select coalesce(jsonb_agg(jsonb_build_object('id', gd, 'so', n) order by thu_tu), '[]'::jsonb)
    from (
      select gd, thu_tu, count(*) n from (
        select case
          when da_xong then 'done'
          when bao_cao_done or bao_cao_dang then 'bc'
          when tham_dinh_done then 'cho_bc'
          when tham_dinh_dang then 'dang_td'
          when de_cuong_done then 'cho_td'
          when de_cuong_dang then 'dang_dc'
          else 'chua' end as gd,
        case
          when da_xong then 7
          when bao_cao_done or bao_cao_dang then 6
          when tham_dinh_done then 5
          when tham_dinh_dang then 4
          when de_cuong_done then 3
          when de_cuong_dang then 2
          else 1 end as thu_tu
        from items_nam where han is not null
      ) x group by gd, thu_tu
    ) y
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
  'chi_tiet_toan_bo', (select coalesce(jsonb_agg(jsonb_build_object('ma', ma, 'ten', ten, 'loai', loai,
        'bo_phan', bo_phan, 'khu_vuc', khu_vuc, 'nguoi', nguoi, 'diem', diem, 'han', han, 'trang_thai', trang_thai,
        'tre_ngay', tre_ngay, 'dl_de_cuong', dl_de_cuong, 'dl_tham_dinh', dl_tham_dinh, 'dl_bao_cao', dl_bao_cao,
        'ngay_xong', ngay_xong, 'trang_thai_vmp', trang_thai_vmp,
        'de_cuong', tt_de_cuong, 'tham_dinh', tt_tham_dinh, 'bao_cao', tt_bao_cao, 'vmp', tt_vmp) order by ma), '[]'::jsonb)
      from items)
) as du_lieu

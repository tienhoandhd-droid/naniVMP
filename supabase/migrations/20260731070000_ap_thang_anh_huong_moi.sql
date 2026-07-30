-- =====================================================================
-- ÁP THANG ẢNH HƯỞNG CHẤT LƯỢNG MỚI — ĐÂY LÀ LẦN GHI THẬT
--
-- QA đã đọc bảng đối chiếu vmp_danh_gia_anh_huong và chốt: áp toàn bộ,
-- kèm bốn phán quyết chuyên môn cho những ca máy tự dò không chắc:
--
--   Máy trộn lập phương  -> TIẾP XÚC TRỰC TIẾP sản phẩm      -> 3
--   Máy Viên Đặt         -> TIẾP XÚC TRỰC TIẾP sản phẩm      -> 3
--   Máy siết nắp         -> GIÁN TIẾP, chỉ xoay nắp          -> 2
--   Máy xay keo          -> TIẾP XÚC DỊCH                    -> 3
--   Hệ ly tâm            -> TIẾP XÚC DỊCH                    -> 3
--
-- Bốn phán quyết này là kiến thức nhà máy, máy không suy ra được từ tên
-- thiết bị: "siết nắp" nghe như đóng gói sơ cấp (mức 3) nhưng thực tế
-- chỉ xoay nắp đã đặt sẵn nên không chạm dịch; còn "xay keo" và "ly tâm"
-- nghe như cơ khí phụ trợ (mức 2) nhưng thực tế chạm dịch thuốc.
--
-- Đã kiểm trước khi ghi: cả 272 dòng đều có criticality_source = 'auto',
-- KHÔNG có dòng nào nhập tay nên không ghi đè phán quyết của ai.
--
-- HAI CA CHƯA CHỐT — giữ nguyên mức 3 phòng thủ, chờ QA:
--   Máy đo nội độc tố, Máy đo quang UV-1900i
-- Máy dò xếp chúng vào nhóm thiết bị đo (đáng lẽ mức 2), nhưng QA chưa
-- xác nhận nên giữ 3. Điểm cao hơn nghĩa là làm sớm hơn — sai theo hướng
-- an toàn, không gây hại.
--
-- CÁCH LÙI LẠI: bảng vmp_diem_truoc_khi_doi giữ nguyên điểm cũ.
--   update vmp_source_objects s set criticality_score = c.diem_cu,
--          quality_impact_score = c.ah_cu
--   from vmp_diem_truoc_khi_doi c where c.object_code = s.object_code;
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Chụp lại điểm cũ trước khi ghi — hồ sơ GMP phải lùi được
-- ---------------------------------------------------------------------
drop table if exists public.vmp_diem_truoc_khi_doi;
create table public.vmp_diem_truoc_khi_doi as
select object_code, object_name, complexity_score as pt_cu,
       quality_impact_score as ah_cu, criticality_score as diem_cu,
       criticality_source as nguon_cu, now() as chup_luc
from public.vmp_source_objects;

comment on table public.vmp_diem_truoc_khi_doi is
  'Ảnh điểm trọng yếu trước lần đổi thang 2026-07-31. Dùng để lùi lại nếu cần.';

alter table public.vmp_diem_truoc_khi_doi enable row level security;
drop policy if exists diem_cu_doc on public.vmp_diem_truoc_khi_doi;
create policy diem_cu_doc on public.vmp_diem_truoc_khi_doi
  for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- 2. Thang mới, gồm bốn phán quyết của QA
-- ---------------------------------------------------------------------
create or replace function public.vmp_score_quality_impact(
  p_kind text, p_name text, p_department text
) returns integer
language sql immutable
as $fn$
  with t as (select lower(coalesce(p_name,'')) as n, coalesce(p_kind,'') as k)
  select case

    -- ===== MỨC 1 — nằm ngoài đường đi của sản phẩm =====
    when (select n from t) ~ 'nước thải|nuoc thai|lưu hsl|luu hsl|hồ sơ lô|ho so lo' then 1
    when (select k from t) = 'Kho' and (select n from t) ~ 'nghiên cứu|nghien cuu|hsl' then 1
    -- Vận chuyển thành phẩm: bao bì cấp 1 đã bảo vệ sản phẩm
    when (select k from t) = 'Vận chuyển' then 1

    -- ===== PHÁN QUYẾT CỦA QA — đặt TRƯỚC mọi luật chung =====
    -- Máy siết nắp chỉ xoay cái nắp đã đặt sẵn, không chạm dịch thuốc.
    -- Xếp trước nhóm đóng gói sơ cấp, nếu không sẽ bị luật "siết nắp"
    -- ở mức 3 bắt mất.
    when (select n from t) ~ 'siết nắp|siet nap' then 2
    -- Máy trộn lập phương và máy viên đặt CHẠM TRỰC TIẾP sản phẩm.
    when (select n from t) ~ 'trộn lập phương|tron lap phuong|viên đặt|vien dat' then 3
    -- Máy xay keo và hệ ly tâm CHẠM DỊCH — nghe như cơ khí phụ trợ nhưng
    -- thực tế nằm trong đường đi của dịch thuốc.
    when (select n from t) ~ 'xay keo|ly tâm|ly tam' then 3

    -- ===== MỨC 3 — trực tiếp, sai lệch không bắt lại được =====
    when (select n from t) ~ 'vô trùng|vo trung|isolator|laf|bsc|passbox|tủ truyền|tu truyen|an toàn sinh học|an toan sinh hoc|thao tác có găng|thao tac co gang|găng tay|gang tay' then 3
    when (select n from t) ~ 'nồi hấp|noi hap|tủ hấp|tu hap|tiệt trùng|tiet trung|autoclave|hấp tiệt' then 3
    when (select n from t) ~ 'hvac|khí sạch|khi sach|điều hòa khu|dieu hoa khu' then 3
    when (select n from t) ~ 'nước tinh khiết|nuoc tinh khiet|nước cất|nuoc cat|nước ri|nuoc ri|wfi|purified water' then 3
    when (select n from t) ~ 'khí nén|khi nen|nitơ|nito|hơi tinh khiết|hoi tinh khiet|clean steam' then 3
    when (select n from t) ~ 'tank|bồn|bon|pha chế|pha che|pha dịch|pha dich|lên men|len men|nhũ hóa|nhu hoa|đồng hóa|dong hoa' then 3
    -- "chiêt rót" là lỗi gõ thiếu dấu có thật trong dữ liệu — bắt cả hai
    when (select n from t) ~ 'chiết rót|chiet rot|chiêt rót|rót dịch|rot dich|đóng dịch|dong dich|bfs|ffs|đóng túi|dong tui|hàn|han seal|ép vỉ|ep vi|tạo nang|tao nang|đóng gel|dong gel|máy đóng|may dong|nạp chất đẩy|nap chat day' then 3
    when (select k from t) in ('Quy trình','QT') then 3
    when (select n from t) ~ 'quy trình sản xuất|quy trinh san xuat|quy trình vệ sinh|quy trinh ve sinh|cip|sip' then 3
    when (select n from t) ~ 'lọc|loc ' then 3

    -- ===== MỨC 2 — gián tiếp, có lớp phát hiện chặn lại =====
    when (select n from t) ~ 'sắc k|sac k|hplc|quang phổ|quang pho|ftir|hồng ngoại|hong ngoai|phân cực|phan cuc|khúc xạ|khuc xa|chuẩn độ|chuan do|toc|độ hòa tan|do hoa tan|độ rã|do ra|điểm nóng chảy|diem nong chay|kích thước hạt|kich thuoc hat|cân |can |kính|kinh hien|đo ph|do ph' then 2
    when (select n from t) ~ 'tủ ủ|tu u |tủ ấm|tu am|nuôi cấy|nuoi cay|tủ vi sinh|incubator' then 2
    when (select n from t) ~ 'rửa|rua |sấy|say |ủ nhiệt|u nhiet|lò nung|lo nung' then 2
    when (select k from t) = 'Kho' then 2
    when (select n from t) ~ 'kho lạnh|kho lanh|tủ lạnh|tu lanh|tủ mát|tu mat|chiller|chiler|làm mát|lam mat' then 2
    when (select n from t) ~ 'máy xay|may xay|nghiền|nghien' then 2

    -- ===== MẶC ĐỊNH — chưa nhận ra thì coi như nặng =====
    -- Trong GMP, chưa biết thì phải giả định nặng. Hai ca đang chờ QA
    -- (máy đo nội độc tố, máy đo quang UV) rơi vào đây, giữ mức 3.
    else 3
  end;
$fn$;

comment on function public.vmp_score_quality_impact(text, text, text) is
  'Chấm ảnh hưởng chất lượng theo ISPE direct/indirect/no impact, có tính khả năng phát hiện. Bốn phán quyết QA 2026-07-31 đặt trước luật chung: siết nắp=2, trộn lập phương/viên đặt=3, xay keo/ly tâm=3.';

-- ---------------------------------------------------------------------
-- 3. Chấm lại toàn bộ. Chỉ đụng dòng criticality_source='auto' —
--    đã kiểm: cả 272 dòng đều auto, không có phán quyết tay nào.
-- ---------------------------------------------------------------------
update public.vmp_source_objects s set
  quality_impact_score = public.vmp_score_quality_impact(s.object_kind, s.object_name, s.department),
  criticality_score    = public.vmp_score_complexity(s.object_kind, s.object_name, s.report_class)
                       * public.vmp_score_quality_impact(s.object_kind, s.object_name, s.department)
where s.criticality_source = 'auto';

update public.vmp_plan_items p set criticality_score = s.criticality_score
from public.vmp_source_objects s
where s.object_code = p.object_code and s.criticality_score is not null;

-- Bảng vmp_objects cũng giữ mức criticality dạng chữ, đồng bộ lại
update public.vmp_objects o set
  criticality_score = s.criticality_score,
  criticality = case
    when s.criticality_score >= 7 then 'high'::public.criticality
    when s.criticality_score >= 4 then 'medium'::public.criticality
    else 'low'::public.criticality end
from public.vmp_source_objects s
where s.object_code = o.code and s.criticality_score is not null;

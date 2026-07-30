-- =====================================================================
-- "Máy ĐO độ rã viên đặt" bị luật "viên đặt" bắt mất
--
-- Bốn phán quyết QA đặt trước luật chung để chắc ăn, nhưng luật "viên
-- đặt" quá rộng: nó bắt luôn "Máy ĐO độ rã viên đặt" — một thiết bị đo
-- của phòng thí nghiệm, đáng lẽ mức 2 vì có hiệu chuẩn và kiểm tra kép.
--
-- Sửa: mọi luật theo tên sản phẩm chỉ áp khi thiết bị KHÔNG phải máy đo.
-- Thêm điều kiện loại trừ "máy đo/thiết bị đo/máy thử" vào ba luật phán
-- quyết, chứ không đảo thứ tự — đảo thứ tự thì máy siết nắp lại bị luật
-- đóng gói sơ cấp bắt.
-- =====================================================================

create or replace function public.vmp_score_quality_impact(
  p_kind text, p_name text, p_department text
) returns integer
language sql immutable
as $fn$
  with t as (
    select lower(coalesce(p_name,'')) as n,
           coalesce(p_kind,'') as k,
           -- Là máy ĐO / máy THỬ thì nó nằm ở phòng thí nghiệm, không
           -- nằm trong đường đi của sản phẩm
           (lower(coalesce(p_name,'')) ~ 'máy đo|may do|thiết bị đo|thiet bi do|máy thử|may thu|máy phân tích|may phan tich|máy quét|may quet') as la_may_do
  )
  select case
    when (select n from t) ~ 'nước thải|nuoc thai|lưu hsl|luu hsl|hồ sơ lô|ho so lo' then 1
    when (select k from t) = 'Kho' and (select n from t) ~ 'nghiên cứu|nghien cuu|hsl' then 1
    when (select k from t) = 'Vận chuyển' then 1

    -- Máy đo và máy thử: xét TRƯỚC mọi luật theo tên sản phẩm, vì tên
    -- chúng thường chứa tên sản phẩm mà chúng đo ("máy đo độ rã viên đặt")
    when (select la_may_do from t) then 2

    -- PHÁN QUYẾT QA
    when (select n from t) ~ 'siết nắp|siet nap' then 2
    when (select n from t) ~ 'trộn lập phương|tron lap phuong|viên đặt|vien dat' then 3
    when (select n from t) ~ 'xay keo|ly tâm|ly tam' then 3

    -- MỨC 3 — trực tiếp
    when (select n from t) ~ 'vô trùng|vo trung|isolator|laf|bsc|passbox|tủ truyền|tu truyen|an toàn sinh học|an toan sinh hoc|thao tác có găng|thao tac co gang|găng tay|gang tay' then 3
    when (select n from t) ~ 'nồi hấp|noi hap|tủ hấp|tu hap|tiệt trùng|tiet trung|autoclave|hấp tiệt' then 3
    when (select n from t) ~ 'hvac|khí sạch|khi sach|điều hòa khu|dieu hoa khu' then 3
    when (select n from t) ~ 'nước tinh khiết|nuoc tinh khiet|nước cất|nuoc cat|nước ri|nuoc ri|wfi|purified water' then 3
    when (select n from t) ~ 'khí nén|khi nen|nitơ|nito|hơi tinh khiết|hoi tinh khiet|clean steam' then 3
    when (select n from t) ~ 'tank|bồn|bon|pha chế|pha che|pha dịch|pha dich|lên men|len men|nhũ hóa|nhu hoa|đồng hóa|dong hoa' then 3
    when (select n from t) ~ 'chiết rót|chiet rot|chiêt rót|rót dịch|rot dich|đóng dịch|dong dich|bfs|ffs|đóng túi|dong tui|hàn|han seal|ép vỉ|ep vi|tạo nang|tao nang|đóng gel|dong gel|máy đóng|may dong|nạp chất đẩy|nap chat day' then 3
    when (select k from t) in ('Quy trình','QT') then 3
    when (select n from t) ~ 'quy trình sản xuất|quy trinh san xuat|quy trình vệ sinh|quy trinh ve sinh|cip|sip' then 3
    when (select n from t) ~ 'lọc|loc ' then 3

    -- MỨC 2 — gián tiếp
    when (select n from t) ~ 'sắc k|sac k|hplc|quang phổ|quang pho|ftir|hồng ngoại|hong ngoai|phân cực|phan cuc|khúc xạ|khuc xa|chuẩn độ|chuan do|toc|độ hòa tan|do hoa tan|độ rã|do ra|điểm nóng chảy|diem nong chay|kích thước hạt|kich thuoc hat|cân |can |kính|kinh hien|đo ph|do ph' then 2
    when (select n from t) ~ 'tủ ủ|tu u |tủ ấm|tu am|nuôi cấy|nuoi cay|tủ vi sinh|incubator' then 2
    when (select n from t) ~ 'rửa|rua |sấy|say |ủ nhiệt|u nhiet|lò nung|lo nung' then 2
    when (select k from t) = 'Kho' then 2
    when (select n from t) ~ 'kho lạnh|kho lanh|tủ lạnh|tu lanh|tủ mát|tu mat|chiller|chiler|làm mát|lam mat' then 2
    when (select n from t) ~ 'máy xay|may xay|nghiền|nghien' then 2

    else 3
  end;
$fn$;

update public.vmp_source_objects s set
  quality_impact_score = public.vmp_score_quality_impact(s.object_kind, s.object_name, s.department),
  criticality_score    = public.vmp_score_complexity(s.object_kind, s.object_name, s.report_class)
                       * public.vmp_score_quality_impact(s.object_kind, s.object_name, s.department)
where s.criticality_source = 'auto';

update public.vmp_plan_items p set criticality_score = s.criticality_score
from public.vmp_source_objects s
where s.object_code = p.object_code and s.criticality_score is not null;

update public.vmp_objects o set
  criticality_score = s.criticality_score,
  criticality = case
    when s.criticality_score >= 7 then 'high'::public.criticality
    when s.criticality_score >= 4 then 'medium'::public.criticality
    else 'low'::public.criticality end
from public.vmp_source_objects s
where s.object_code = o.code and s.criticality_score is not null;

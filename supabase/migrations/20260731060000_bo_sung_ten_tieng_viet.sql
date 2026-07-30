-- =====================================================================
-- Bổ sung tên tiếng Việt và một lỗi chính tả có thật trong dữ liệu
--
-- Rà 52 mục "chưa nhận ra" thì thấy vài cái quan trọng chỉ được cứu nhờ
-- luật mặc định "chưa biết thì coi như nặng" — đúng về an toàn nhưng nên
-- nhận ra tường minh:
--
--   "Tủ an toàn sinh học"        = BSC, regex chỉ bắt chữ "bsc"
--   "Tủ thao tác có găng tay"    = isolator/glove box
--   "Máy chiêt rót thể tích..."  — dữ liệu gõ THIẾU DẤU ("chiêt" thay vì
--                                   "chiết"), regex 'chiết rót' trượt
--   "Tủ ủ vi sinh" / "Tủ ấm"     — thiết bị nuôi cấy PTN, mức 2
--
-- Ghi nhận riêng cái lỗi chính tả: dữ liệu nguồn có "chiêt rót" ở hai
-- dòng. Không sửa dữ liệu ở đây (đó là việc của người nhập, có audit
-- trail), chỉ dạy bộ khớp nhận cả hai cách viết.
-- =====================================================================

create or replace function public.vmp_score_quality_impact_de_xuat(
  p_kind text, p_name text, p_department text
) returns integer
language sql immutable
as $fn$
  with t as (select lower(coalesce(p_name,'')) as n, coalesce(p_kind,'') as k)
  select case
    when (select n from t) ~ 'nước thải|nuoc thai|lưu hsl|luu hsl|hồ sơ lô|ho so lo' then 1
    when (select k from t) = 'Kho' and (select n from t) ~ 'nghiên cứu|nghien cuu|hsl' then 1
    when (select k from t) = 'Vận chuyển' then 1

    -- MỨC 3 — trực tiếp, sai lệch không bắt lại được
    -- Thêm tên tiếng Việt của BSC và isolator
    when (select n from t) ~ 'vô trùng|vo trung|isolator|laf|bsc|passbox|tủ truyền|tu truyen|an toàn sinh học|an toan sinh hoc|thao tác có găng|thao tac co gang|găng tay|gang tay' then 3
    when (select n from t) ~ 'nồi hấp|noi hap|tủ hấp|tu hap|tiệt trùng|tiet trung|autoclave|hấp tiệt' then 3
    when (select n from t) ~ 'hvac|khí sạch|khi sach|điều hòa khu|dieu hoa khu' then 3
    when (select n from t) ~ 'nước tinh khiết|nuoc tinh khiet|nước cất|nuoc cat|nước ri|nuoc ri|wfi|purified water' then 3
    when (select n from t) ~ 'khí nén|khi nen|nitơ|nito|hơi tinh khiết|hoi tinh khiet|clean steam' then 3
    when (select n from t) ~ 'tank|bồn|bon|pha chế|pha che|pha dịch|pha dich|lên men|len men|nhũ hóa|nhu hoa|đồng hóa|dong hoa' then 3
    -- "chiêt rót" là lỗi gõ thiếu dấu CÓ THẬT trong dữ liệu — bắt cả hai
    when (select n from t) ~ 'chiết rót|chiet rot|chiêt rót|rót dịch|rot dich|đóng dịch|dong dich|bfs|ffs|đóng túi|dong tui|siết nắp|siet nap|hàn|han seal|ép vỉ|ep vi|tạo nang|tao nang|đóng gel|dong gel|máy đóng|may dong|nạp chất đẩy|nap chat day' then 3
    when (select k from t) in ('Quy trình','QT') then 3
    when (select n from t) ~ 'quy trình sản xuất|quy trinh san xuat|quy trình vệ sinh|quy trinh ve sinh|cip|sip' then 3
    when (select n from t) ~ 'lọc|loc ' then 3

    -- MỨC 2 — gián tiếp, có lớp phát hiện chặn lại
    when (select n from t) ~ 'sắc k|sac k|hplc|quang phổ|quang pho|ftir|hồng ngoại|hong ngoai|phân cực|phan cuc|khúc xạ|khuc xa|chuẩn độ|chuan do|toc|độ hòa tan|do hoa tan|độ rã|do ra|điểm nóng chảy|diem nong chay|kích thước hạt|kich thuoc hat|cân |can |kính|kinh hien|đo ph|do ph' then 2
    -- Tủ nuôi cấy / ủ / ấm: dùng cho thử nghiệm vi sinh, có mẫu chứng
    when (select n from t) ~ 'tủ ủ|tu u |tủ ấm|tu am|nuôi cấy|nuoi cay|tủ vi sinh|incubator' then 2
    when (select n from t) ~ 'rửa|rua |sấy|say |ủ nhiệt|u nhiet|lò nung|lo nung' then 2
    when (select k from t) = 'Kho' then 2
    when (select n from t) ~ 'kho lạnh|kho lanh|tủ lạnh|tu lanh|tủ mát|tu mat|chiller|chiler|làm mát|lam mat' then 2
    when (select n from t) ~ 'ly tâm|ly tam|máy xay|may xay|nghiền|nghien' then 2

    else 3
  end;
$fn$;

-- Chấm lại bảng đối chiếu
truncate public.vmp_danh_gia_anh_huong;
insert into public.vmp_danh_gia_anh_huong
  (ma_doi_tuong, ten, phan_loai, bo_phan, diem_phuc_tap,
   ah_hien_tai, ah_de_xuat, trong_yeu_hien_tai, trong_yeu_de_xuat, lech, cach_xep, so_hang_muc)
select s.object_code, s.object_name, s.object_kind, s.department, s.complexity_score,
  s.quality_impact_score,
  public.vmp_score_quality_impact_de_xuat(s.object_kind, s.object_name, s.department),
  s.criticality_score,
  coalesce(s.complexity_score,1) * public.vmp_score_quality_impact_de_xuat(s.object_kind, s.object_name, s.department),
  coalesce(s.complexity_score,1) * public.vmp_score_quality_impact_de_xuat(s.object_kind, s.object_name, s.department) - coalesce(s.criticality_score,0),
  case
    when lower(coalesce(s.object_name,'')) ~ 'vô trùng|isolator|laf|bsc|passbox|tủ truyền|an toàn sinh học|găng tay' then 'vo_trung'
    when lower(coalesce(s.object_name,'')) ~ 'nồi hấp|tủ hấp|tiệt trùng|autoclave' then 'tiet_trung'
    when lower(coalesce(s.object_name,'')) ~ 'hvac|khí sạch' then 'hvac'
    when lower(coalesce(s.object_name,'')) ~ 'nước tinh khiết|nước cất|khí nén|nitơ|hơi tinh khiết' then 'phu_tro_tiep_xuc'
    when lower(coalesce(s.object_name,'')) ~ 'tank|pha chế|lên men|nhũ hóa|đồng hóa|chiết rót|chiêt rót|rót dịch|đóng|bfs|ffs|ép vỉ|tạo nang|lọc|nạp chất đẩy' then 'tiep_xuc_truc_tiep'
    when lower(coalesce(s.object_name,'')) ~ 'sắc k|hplc|quang phổ|ftir|phân cực|khúc xạ|chuẩn độ|toc|độ hòa tan|độ rã|cân |kính|kích thước hạt' then 'thiet_bi_do'
    when lower(coalesce(s.object_name,'')) ~ 'tủ ủ|tủ ấm|nuôi cấy|vi sinh' then 'vi_sinh_ptn'
    when lower(coalesce(s.object_name,'')) ~ 'rửa|sấy|ủ nhiệt|lò nung' then 'rua_say'
    when coalesce(s.object_kind,'')='Kho' or lower(coalesce(s.object_name,'')) ~ 'kho lạnh|tủ lạnh|tủ mát|chiller|chiler|làm mát' then 'bao_quan'
    when coalesce(s.object_kind,'')='Vận chuyển' then 'van_chuyen'
    when coalesce(s.object_kind,'') in ('Quy trình','QT') then 'quy_trinh'
    when lower(coalesce(s.object_name,'')) ~ 'nước thải|lưu hsl|hồ sơ lô' then 'ngoai_duong_san_pham'
    else 'chua_nhan_ra'
  end,
  (select count(*) from public.vmp_plan_items p where p.is_active and p.object_code=s.object_code)
from public.vmp_source_objects s;

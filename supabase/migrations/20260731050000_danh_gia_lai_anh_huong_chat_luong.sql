-- =====================================================================
-- ĐÁNH GIÁ LẠI ĐIỂM ẢNH HƯỞNG CHẤT LƯỢNG SẢN PHẨM
--
-- ĐÂY LÀ BẢN ĐỀ XUẤT, KHÔNG GHI ĐÈ GÌ. Hàm mới đặt tên khác, kết quả
-- ghi vào bảng riêng để QA đối chiếu rồi quyết. Điểm đang chạy không
-- thay đổi một dòng nào.
--
-- ---------------------------------------------------------------------
-- VẤN ĐỀ CỦA THANG HIỆN TẠI
--
-- vmp_score_quality_impact() hiện chấm:
--     1 điểm — nước thải, lưu hồ sơ lô, kho nghiên cứu
--     2 điểm — kho lưu mẫu, vận chuyển
--     3 điểm — TẤT CẢ CÒN LẠI  (else 3)
--
-- Hệ quả đo được: 202/217 thiết bị xếp "high", 221/461 hạng mục ăn điểm
-- 9 — mức cao nhất của thang. Khi 93% đều là "cao nhất" thì thang mất
-- đúng cái công dụng duy nhất của nó: XẾP THỨ TỰ LÀM TRƯỚC LÀM SAU.
--
-- Nói cho công bằng: gán 3 cho hầu hết thiết bị GxP KHÔNG sai về mặt
-- GMP — ISPE và Annex 15 đều nói phần lớn thiết bị GxP có ảnh hưởng tới
-- chất lượng. Cái sai là dùng một thang không phân biệt được để làm
-- việc đòi phân biệt.
--
-- ---------------------------------------------------------------------
-- CHIỀU ĐANG THIẾU: KHẢ NĂNG PHÁT HIỆN
--
-- ICH Q9(R1) nói mức độ và chiều sâu thẩm định phải TƯƠNG XỨNG với rủi
-- ro. Mà rủi ro không chỉ là mức ảnh hưởng — còn là sai lệch đó có bị
-- BẮT LẠI trước khi thuốc tới người bệnh hay không.
--
-- Hai ví dụ trong chính nhà máy này, thang cũ chấm BẰNG NHAU (đều 3):
--
--   Hệ lọc vô trùng kín hỏng
--     -> thuốc nhiễm khuẩn. Thử vô trùng thành phẩm chỉ lấy mẫu, xác
--        suất bắt được rất thấp. Sai lệch đi thẳng tới người bệnh.
--        => rủi ro TỐI ĐA
--
--   Hệ sắc ký HPLC Agilent lệch
--     -> kết quả phân tích sai. Nhưng còn hiệu chuẩn định kỳ, mẫu
--        chuẩn, kiểm tra kép, quy trình OOS và retest chặn lại.
--        => rủi ro THẤP HƠN HẲN
--
-- Vì vậy bản đề xuất nhét khả năng phát hiện vào chính định nghĩa từng
-- mức, theo cách ISPE Baseline Guide phân direct / indirect / no impact:
--
--   3 — TRỰC TIẾP, sai lệch KHÔNG bắt được bằng kiểm tra thành phẩm
--   2 — GIÁN TIẾP, có lớp phát hiện phía sau chặn lại
--   1 — KHÔNG ảnh hưởng thuộc tính chất lượng trọng yếu
--
-- Thang vẫn là 1..3 như cũ, vẫn nhân với mức phức tạp như cũ. Chỉ đổi
-- CÁCH XẾP, không đổi công thức — nên không phá gì ở tầng trên.
-- =====================================================================

create or replace function public.vmp_score_quality_impact_de_xuat(
  p_kind text, p_name text, p_department text
) returns integer
language sql immutable
as $fn$
  with t as (select lower(coalesce(p_name,'')) as n, coalesce(p_kind,'') as k)
  select case

    -- ============ MỨC 1 — KHÔNG ảnh hưởng CQA ============
    -- Nằm ngoài đường đi của sản phẩm, hoặc chỉ liên quan lưu trữ giấy tờ.
    when (select n from t) ~ 'nước thải|nuoc thai|lưu hsl|luu hsl|hồ sơ lô|ho so lo' then 1
    when (select k from t) = 'Kho' and (select n from t) ~ 'nghiên cứu|nghien cuu|hsl' then 1
    -- Vận chuyển THÀNH PHẨM đã đóng gói kín: bao bì cấp 1 đã bảo vệ sản
    -- phẩm, rủi ro còn lại là nhiệt độ — đã có theo dõi riêng.
    when (select k from t) = 'Vận chuyển' then 1

    -- ============ MỨC 3 — TRỰC TIẾP, không bắt lại được ============
    -- Vô trùng và khí sạch: hỏng là nhiễm khuẩn, thử vô trùng thành phẩm
    -- chỉ lấy mẫu nên gần như không bắt được.
    when (select n from t) ~ 'vô trùng|vo trung|isolator|laf|bsc|passbox|tủ truyền|tu truyen' then 3
    -- Tiệt trùng: quyết định thuốc có vô khuẩn hay không.
    when (select n from t) ~ 'nồi hấp|noi hap|tủ hấp|tu hap|tiệt trùng|tiet trung|autoclave|hấp tiệt' then 3
    -- HVAC khu sạch: giữ cấp sạch, chênh áp — nền của mọi thứ phía sau.
    when (select n from t) ~ 'hvac|khí sạch|khi sach|điều hòa khu|dieu hoa khu' then 3
    -- Nước và khí/hơi TIẾP XÚC sản phẩm — critical utility theo ISPE.
    when (select n from t) ~ 'nước tinh khiết|nuoc tinh khiet|nước cất|nuoc cat|nước ri|nuoc ri|wfi|purified water' then 3
    when (select n from t) ~ 'khí nén|khi nen|nitơ|nito|hơi tinh khiết|hoi tinh khiet|clean steam' then 3
    -- Tiếp xúc trực tiếp dịch thuốc: pha chế, chứa, chiết, đóng kín.
    when (select n from t) ~ 'tank|bồn|bon|pha chế|pha che|pha dịch|pha dich|lên men|len men|nhũ hóa|nhu hoa|đồng hóa|dong hoa' then 3
    when (select n from t) ~ 'chiết rót|chiet rot|rót dịch|rot dich|đóng dịch|dong dich|bfs|ffs|đóng túi|dong tui|siết nắp|siet nap|hàn|han seal|ép vỉ|ep vi|tạo nang|tao nang|đóng gel|dong gel|máy đóng|may dong' then 3
    -- Quy trình sản xuất và quy trình vệ sinh: chính nó tạo ra chất lượng.
    when (select k from t) in ('Quy trình','QT') then 3
    when (select n from t) ~ 'quy trình sản xuất|quy trinh san xuat|quy trình vệ sinh|quy trinh ve sinh|cip|sip' then 3
    -- Lọc, màng lọc, hệ lọc.
    when (select n from t) ~ 'lọc|loc ' then 3

    -- ============ MỨC 2 — GIÁN TIẾP, có lớp phát hiện chặn lại ============
    -- Thiết bị đo và phòng thí nghiệm: lệch thì cho số sai, NHƯNG còn
    -- hiệu chuẩn định kỳ, mẫu chuẩn, kiểm tra kép, OOS và retest.
    when (select n from t) ~ 'sắc k|sac k|hplc|quang phổ|quang pho|ftir|hồng ngoại|hong ngoai|phân cực|phan cuc|khúc xạ|khuc xa|chuẩn độ|chuan do|toc|độ hòa tan|do hoa tan|độ rã|do ra|điểm nóng chảy|diem nong chay|kích thước hạt|kich thuoc hat|cân |can |kính|kinh hien' then 2
    -- Rửa và sấy dụng cụ: sạch hay không còn kiểm tra tồn dư sau đó.
    when (select n from t) ~ 'rửa|rua |sấy|say |ủ nhiệt|u nhiet|lò nung|lo nung' then 2
    -- Kho bảo quản: ảnh hưởng độ ổn định, nhưng có theo dõi nhiệt liên tục.
    when (select k from t) = 'Kho' then 2
    when (select n from t) ~ 'kho lạnh|kho lanh|tủ lạnh|tu lanh|chiller|chiler|làm mát|lam mat' then 2
    -- Ly tâm, phụ trợ cơ khí không tiếp xúc dịch kín.
    when (select n from t) ~ 'ly tâm|ly tam|máy xay|may xay|nghiền|nghien' then 2

    -- ============ MẶC ĐỊNH ============
    -- Không nhận ra thì để 3 — trong GMP, chưa biết thì coi như nặng.
    -- Nhưng phải rà tay: xem cột cach_xep = 'chua_nhan_ra'.
    else 3
  end;
$fn$;

comment on function public.vmp_score_quality_impact_de_xuat(text, text, text) is
  'BẢN ĐỀ XUẤT chấm ảnh hưởng chất lượng theo ISPE direct/indirect/no impact, có tính khả năng phát hiện. KHÔNG dùng để ghi đè; so sánh qua bảng vmp_danh_gia_anh_huong.';

-- ---------------------------------------------------------------------
-- Bảng đối chiếu để QA duyệt
-- ---------------------------------------------------------------------
drop table if exists public.vmp_danh_gia_anh_huong;
create table public.vmp_danh_gia_anh_huong (
  ma_doi_tuong      text primary key,
  ten               text not null,
  phan_loai         text,
  bo_phan           text,
  diem_phuc_tap     integer,
  ah_hien_tai       integer,
  ah_de_xuat        integer,
  trong_yeu_hien_tai integer,
  trong_yeu_de_xuat  integer,
  lech              integer,
  cach_xep          text,
  so_hang_muc       integer,
  danh_gia_luc      timestamptz not null default now()
);

comment on table public.vmp_danh_gia_anh_huong is
  'Đối chiếu điểm ảnh hưởng chất lượng: hiện tại vs đề xuất theo ISPE. Bảng ĐỀ XUẤT — QA đọc rồi quyết, không tự áp.';

insert into public.vmp_danh_gia_anh_huong
  (ma_doi_tuong, ten, phan_loai, bo_phan, diem_phuc_tap,
   ah_hien_tai, ah_de_xuat, trong_yeu_hien_tai, trong_yeu_de_xuat, lech, cach_xep, so_hang_muc)
select
  s.object_code,
  s.object_name,
  s.object_kind,
  s.department,
  s.complexity_score,
  s.quality_impact_score,
  public.vmp_score_quality_impact_de_xuat(s.object_kind, s.object_name, s.department),
  s.criticality_score,
  coalesce(s.complexity_score, 1) * public.vmp_score_quality_impact_de_xuat(s.object_kind, s.object_name, s.department),
  coalesce(s.complexity_score, 1) * public.vmp_score_quality_impact_de_xuat(s.object_kind, s.object_name, s.department)
    - coalesce(s.criticality_score, 0),
  case
    when lower(coalesce(s.object_name,'')) ~ 'vô trùng|vo trung|isolator|laf|bsc|passbox|tủ truyền' then 'vo_trung'
    when lower(coalesce(s.object_name,'')) ~ 'nồi hấp|noi hap|tủ hấp|tiệt trùng|autoclave' then 'tiet_trung'
    when lower(coalesce(s.object_name,'')) ~ 'hvac|khí sạch' then 'hvac'
    when lower(coalesce(s.object_name,'')) ~ 'nước tinh khiết|nước cất|khí nén|nitơ|hơi tinh khiết' then 'phu_tro_tiep_xuc'
    when lower(coalesce(s.object_name,'')) ~ 'tank|pha chế|lên men|nhũ hóa|đồng hóa|chiết rót|rót dịch|đóng|bfs|ffs|ép vỉ|tạo nang|lọc' then 'tiep_xuc_truc_tiep'
    when lower(coalesce(s.object_name,'')) ~ 'sắc k|hplc|quang phổ|ftir|phân cực|khúc xạ|chuẩn độ|toc|độ hòa tan|độ rã|cân |kính' then 'thiet_bi_do'
    when lower(coalesce(s.object_name,'')) ~ 'rửa|sấy|ủ nhiệt|lò nung' then 'rua_say'
    when coalesce(s.object_kind,'') = 'Kho' or lower(coalesce(s.object_name,'')) ~ 'kho lạnh|chiller|chiler|làm mát' then 'bao_quan'
    when coalesce(s.object_kind,'') = 'Vận chuyển' then 'van_chuyen'
    when coalesce(s.object_kind,'') in ('Quy trình','QT') then 'quy_trinh'
    when lower(coalesce(s.object_name,'')) ~ 'nước thải|lưu hsl|hồ sơ lô' then 'ngoai_duong_san_pham'
    else 'chua_nhan_ra'
  end,
  (select count(*) from public.vmp_plan_items p where p.is_active and p.object_code = s.object_code)
from public.vmp_source_objects s;

alter table public.vmp_danh_gia_anh_huong enable row level security;
drop policy if exists dg_ah_doc on public.vmp_danh_gia_anh_huong;
create policy dg_ah_doc on public.vmp_danh_gia_anh_huong
  for select to authenticated using (true);

-- =====================================================================
-- SỬA TRỤC "MỨC ĐỘ PHỨC TẠP" — lần rà thứ hai
--
-- Người dùng chỉ ra: "LAF cân sao điểm là 3. Nó không phải chỉ là cái
-- cân, cân nguyên liệu trong đó."
--
-- Đúng. Bản chấm cũ có luật `^laf` → phức tạp 1, tức là coi mọi thiết bị
-- có chữ LAF như một cái cân bàn. Sai về bản chất thiết bị: LAF cân là
-- BUỒNG CÂN / BUỒNG LẤY MẪU (dispensing booth, downflow booth, RLAF) —
-- một tủ xử lý không khí sạch để cân nguyên liệu hở, không phải cái cân.
--
-- ---------------------------------------------------------------------
-- Căn cứ sửa
--
-- 1) Nhóm XỬ LÝ KHÔNG KHÍ SẠCH (LAF, buồng cân, tủ ATSH/BSC, isolator,
--    tủ thao tác có găng tay) đòi đủ chuỗi DQ→IQ→OQ→PQ với phép đo
--    chuyên biệt, tái thẩm định định kỳ:
--      · toàn vẹn màng HEPA bằng khí dung DOP/PAO
--      · vận tốc gió và độ đồng đều (dung sai ±20% quanh giá trị đích)
--      · đếm tiểu phân theo cấp sạch
--      · hình ảnh khói (smoke pattern) — hướng dòng khí, không có vùng quẩn
--      · thời gian phục hồi (recovery)
--    Đây là mức phức tạp NGANG hệ HVAC, không phải mức của một cái cân.
--    → Phức tạp 3
--
--    Riêng LAF cân nguyên liệu (CCTB01, khu A2 "Cân chung") là buồng cân
--    trung tâm: cân nguyên liệu hở cho toàn nhà máy. Hỏng nó là cả nhiễm
--    chéo lẫn sai lượng cân — đúng chỗ nhạy cảm nhất của khâu cân.
--
-- 2) Nhóm TIỆT TRÙNG BẰNG NHIỆT (nồi hấp, tủ hấp tiệt trùng) trước xếp 2,
--    trong khi thực tế phải chạy phân bố nhiệt (empty/loaded), xuyên
--    nhiệt tới điểm lạnh nhất, thử thách chỉ thị sinh học, tính F0, và
--    thẩm định theo TỪNG kiểu xếp tải.
--    → Phức tạp 3
--
-- 3) PASSBOX / tủ truyền nguyên liệu: có HEPA và khoá liên động, nhưng
--    không có chu trình vận hành để chạy PQ nhiều thông số như LAF.
--    → Phức tạp 2 (trước là 1, cùng rọ với cái cân — cũng sai)
--
-- 4) CHILLER: hệ làm lạnh có vòng điều khiển nhiệt độ, không phải thiết
--    bị đơn giản.
--    → Phức tạp 2 (trước là 1 do khớp nhầm chuỗi "chile")
--
-- 5) QUY TRÌNH: thay vì đoán theo tên, dùng luôn "Phân loại báo cáo"
--    trong sheet gốc. Quy trình VÔ KHUẨN đòi mô phỏng vô trùng (media
--    fill) lặp lại, giám sát môi trường, kiểm tra vô khuẩn — hẳn một bậc
--    trên quy trình không vô khuẩn.
--    → Vô khuẩn 3, còn lại 2
--
-- ---------------------------------------------------------------------
-- Giữ nguyên phức tạp 1: cân check trên dây chuyền, tủ lạnh/tủ mát bảo
-- quản, giá kệ, xe đẩy, kho thường, xe vận chuyển. Đây mới thật sự là
-- nhóm chỉ cần hiệu chuẩn / xác nhận lắp đặt.
--
-- Trục "ảnh hưởng chất lượng" KHÔNG đổi trong lần này — đã sửa ở
-- 20260729120000 và vẫn đúng.
-- =====================================================================

-- Thêm tham số phân loại báo cáo để chấm quy trình theo dữ liệu gốc,
-- thay vì đoán theo tên sản phẩm.
drop function if exists public.vmp_score_complexity(text, text);

create or replace function public.vmp_score_complexity(
  p_kind text, p_name text, p_report_class text default null
) returns integer
language sql immutable
as $fn$
  select case
    -- ---- Quy trình: theo phân loại báo cáo của sheet gốc ----
    when p_kind = 'Quy trình' and p_report_class = 'Vô khuẩn' then 3
    when p_kind = 'Quy trình'                                 then 2

    -- ---- Mức 3: xử lý không khí sạch ----
    -- \m…\M là ranh giới từ, tránh khớp nhầm chữ "laf" nằm giữa tên khác.
    when lower(coalesce(p_name,'')) ~ ('\mlaf\M|buồng cân|buồng lấy mẫu'
         || '|tủ an toàn sinh học|\matsh\M|isolator|găng tay') then 3

    -- ---- Mức 3: tiệt trùng bằng nhiệt ----
    when lower(coalesce(p_name,'')) ~ 'nồi hấp|tủ hấp|tiệt trùng|triệt trùng' then 3

    -- ---- Chặn hai kiểu khớp nhầm của luật mức 3 bên dưới ----
    -- "bán tự động" khớp chuỗi "tự động" nhưng thực tế ÍT tự động hơn.
    -- "Tủ sấy 2 cánh cho lên men" khớp "lên men" nhưng nó là tủ sấy.
    when lower(coalesce(p_name,'')) ~ 'bán tự động|^tủ sấy' then 2

    -- ---- Mức 3: phân tích dụng cụ, sản xuất phức hợp, phụ trợ trọng yếu ----
    when lower(coalesce(p_name,'')) ~ ('sắc ký|sắc kí|hplc|quang phổ|ftir|raman|khối phổ'
         || '|toc|carbon hữu cơ|nội độc tố|khí động học|bfs|lên men|cip'
         || '|nhũ hóa chân không|hvac|nước tinh khiết|nước cất|hơi tinh khiết'
         || '|lọc tiếp tuyến|lọc vô trùng|tự động'
         || '|khí nén|khí nito|khí nitơ|nitrogen') then 3

    -- ---- Mức 1: thiết bị đơn giản, chủ yếu hiệu chuẩn ----
    -- Đã bỏ khỏi nhóm này: passbox, laf, chiller.
    when lower(coalesce(p_name,'')) ~ '^cân|cân check|tủ lạnh|tủ mát|giá |xe đẩy' then 1

    when p_kind = 'Kho' and lower(coalesce(p_name,'')) ~ 'thông minh' then 3
    when p_kind = 'Kho' and lower(coalesce(p_name,'')) ~ 'lạnh|mát'    then 2
    when p_kind = 'Kho'                                                then 1
    when p_kind = 'Vận chuyển' then 1
    else 2
  end;
$fn$;

comment on function public.vmp_score_complexity(text, text, text) is
  'Điểm mức độ phức tạp 1..3 theo 0.Rule. Cao=hệ nhiều thành phần liên '
  'động hoặc có chu trình/xử lý không khí, đòi đủ DQ→PQ và tái thẩm định '
  'có phép đo chuyên biệt. Trung bình=thiết bị độc lập có thông số vận '
  'hành cần OQ/PQ. Thấp=chủ yếu hiệu chuẩn/xác nhận lắp đặt.';

-- Chấm lại toàn bộ dòng chưa được QA chốt tay -------------------------
update public.vmp_source_objects s set
  complexity_score     = public.vmp_score_complexity(s.object_kind, s.object_name, s.report_class),
  quality_impact_score = public.vmp_score_quality_impact(s.object_kind, s.object_name, s.department),
  criticality_score    = public.vmp_score_complexity(s.object_kind, s.object_name, s.report_class)
                       * public.vmp_score_quality_impact(s.object_kind, s.object_name, s.department)
where s.criticality_source = 'auto';

update public.vmp_plan_items p set criticality_score = s.criticality_score
from public.vmp_source_objects s
where s.object_code = p.object_code and s.criticality_score is not null;

-- RPC chấm lại từ web phải dùng đúng chữ ký mới -----------------------
create or replace function public.rpc_recalc_criticality(p_only_auto boolean default true)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_role text;
  v_n    integer;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if v_role not in ('admin','qa_manager') then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được chấm lại điểm trọng yếu');
  end if;

  update public.vmp_source_objects s set
    complexity_score     = public.vmp_score_complexity(s.object_kind, s.object_name, s.report_class),
    quality_impact_score = public.vmp_score_quality_impact(s.object_kind, s.object_name, s.department),
    criticality_score    = public.vmp_score_complexity(s.object_kind, s.object_name, s.report_class)
                         * public.vmp_score_quality_impact(s.object_kind, s.object_name, s.department),
    criticality_source   = 'auto'
  where (not p_only_auto or s.criticality_source = 'auto');
  get diagnostics v_n = row_count;

  update public.vmp_plan_items p set criticality_score = s.criticality_score
  from public.vmp_source_objects s
  where s.object_code = p.object_code and s.criticality_score is not null;

  return jsonb_build_object('ok', true, 'so_dong', v_n,
    'msg', 'Đã chấm lại ' || v_n || ' đối tượng (đề xuất tự động, chờ QA duyệt)');
end;
$fn$;

revoke execute on function public.rpc_recalc_criticality(boolean) from anon, public;
grant  execute on function public.rpc_recalc_criticality(boolean) to authenticated;

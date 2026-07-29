-- =====================================================================
-- Điểm trọng yếu — cài đúng công thức trong tab "0.Rule timeline VMP"
--
--   Điểm trọng yếu = Điểm mức độ phức tạp × Điểm ảnh hưởng chất lượng SP
--
--   Mức độ phức tạp:              Cao 3 · Trung bình 2 · Thấp 1
--   Ảnh hưởng tới chất lượng SP:  Trực tiếp 3 · Gián tiếp 2 · Không 1
--
-- Thang kết quả 1..9 — khớp đúng ràng buộc đã có sẵn:
--   vmp_plan_items_criticality_score_check (1..9)
--
-- ---------------------------------------------------------------------
-- NGUYÊN TẮC QUAN TRỌNG: đây là ĐỀ XUẤT, KHÔNG phải quyết định
--
-- Chấm điểm rủi ro là phán quyết chuyên môn GMP, máy không được tự chốt.
-- Hàm dưới đây phân loại theo từ khoá — minh bạch, đọc được, tái lập được
-- — rồi đánh dấu `criticality_source = 'auto'`. QA mở màn "Danh mục nguồn"
-- xem lại từng dòng; khi sửa tay thì chuyển thành 'manual' và lần chạy tự
-- động sau KHÔNG ghi đè nữa.
--
-- Ai cũng đọc được luật đang áp dụng ở màn "Luật đang áp dụng" trên web.
-- =====================================================================

alter table public.vmp_source_objects
  add column if not exists complexity_score     integer check (complexity_score between 1 and 3),
  add column if not exists quality_impact_score integer check (quality_impact_score between 1 and 3),
  add column if not exists criticality_score    integer check (criticality_score between 1 and 9),
  add column if not exists criticality_source   text not null default 'auto'
       check (criticality_source in ('auto','manual'));

comment on column public.vmp_source_objects.complexity_score is
  'Mức độ phức tạp: 3 Cao · 2 Trung bình · 1 Thấp';
comment on column public.vmp_source_objects.quality_impact_score is
  'Ảnh hưởng chất lượng SP: 3 Trực tiếp · 2 Gián tiếp · 1 Không';
comment on column public.vmp_source_objects.criticality_score is
  'Điểm trọng yếu = phức tạp × ảnh hưởng (1..9). Công thức từ tab 0.Rule timeline VMP.';
comment on column public.vmp_source_objects.criticality_source is
  'auto = máy đề xuất, chờ QA duyệt. manual = QA đã chốt, không bị ghi đè.';

-- ---------------------------------------------------------------------
-- Chấm ĐỘ PHỨC TẠP theo từ khoá trong tên
-- ---------------------------------------------------------------------
create or replace function public.vmp_score_complexity(
  p_kind text, p_name text
) returns integer
language sql immutable
as $fn$
  select case
    -- Cao (3): hệ thống nhiều thành phần liên động, thẩm định phức tạp
    when lower(coalesce(p_name,'')) ~ ('sắc ký|sắc kí|hplc|quang phổ|ftir|raman|khối phổ'
         || '|toc|carbon hữu cơ|nội độc tố|khí động học|bfs|lên men|cip'
         || '|nhũ hóa chân không|hvac|nước tinh khiết|nước cất|hơi tinh khiết'
         || '|lọc tiếp tuyến|lọc vô trùng|tự động') then 3

    -- Thấp (1): thiết bị đơn giản, một chức năng, ít bộ phận chuyển động
    when lower(coalesce(p_name,'')) ~ ('^cân|cân check|cân kiện|tủ lạnh|tủ mát'
         || '|passbox|^laf|chile|giá |xe đẩy') then 1

    -- Kho: kho tự động ("thông minh") phức tạp cao, kho lạnh trung bình,
    -- kho thường đơn giản
    when p_kind = 'Kho' and lower(coalesce(p_name,'')) ~ 'thông minh' then 3
    when p_kind = 'Kho' and lower(coalesce(p_name,'')) ~ 'lạnh|mát'    then 2
    when p_kind = 'Kho'                                                then 1

    -- Vận chuyển: phương tiện đơn giản
    when p_kind = 'Vận chuyển' then 1

    -- Còn lại: trung bình
    else 2
  end;
$fn$;

-- ---------------------------------------------------------------------
-- Chấm ẢNH HƯỞNG CHẤT LƯỢNG SẢN PHẨM
-- ---------------------------------------------------------------------
create or replace function public.vmp_score_quality_impact(
  p_kind text, p_name text, p_department text
) returns integer
language sql immutable
as $fn$
  select case
    -- Không ảnh hưởng (1): không tiếp xúc SP, không quyết định chất lượng
    when lower(coalesce(p_name,'')) ~ 'nước thải|lưu hsl|hồ sơ lô' then 1
    when p_kind = 'Kho' and lower(coalesce(p_name,'')) ~ 'nghiên cứu|hsl' then 1

    -- Gián tiếp (2): hỗ trợ, hoặc chỉ chạm dụng cụ chứ không chạm SP
    when lower(coalesce(p_name,'')) ~ ('khí nén|passbox|rửa dụng cụ|sấy dụng cụ'
         || '|tiệt trùng dụng cụ|tiệt trùng quần áo|truyền nguyên liệu') then 2
    when p_kind = 'Kho' and lower(coalesce(p_name,'')) ~ 'lưu mẫu' then 2
    when p_kind = 'Vận chuyển' then 2

    -- Trực tiếp (3): tiếp xúc SP, là thành phần SP, hoặc quyết định
    -- kết quả kiểm nghiệm dùng để xuất xưởng
    when p_kind = 'Quy trình' then 3                       -- quy trình sản xuất SP
    when p_department = 'QC'  then 3                       -- kết quả KN quyết định xuất xưởng
    when p_kind = 'Hệ thống phụ trợ' then 3                -- HVAC/nước/hơi: chạm SP hoặc môi trường SP
    when p_kind = 'Kho' then 3                             -- bảo quản sai → SP hỏng
    else 3                                                 -- thiết bị xưởng: tiếp xúc SP
  end;
$fn$;

-- ---------------------------------------------------------------------
-- Áp dụng cho các dòng CHƯA được QA chốt tay
-- ---------------------------------------------------------------------
create or replace function public.rpc_recalc_criticality(
  p_only_auto boolean default true
) returns jsonb
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
    complexity_score     = public.vmp_score_complexity(s.object_kind, s.object_name),
    quality_impact_score = public.vmp_score_quality_impact(s.object_kind, s.object_name, s.department),
    criticality_score    = public.vmp_score_complexity(s.object_kind, s.object_name)
                         * public.vmp_score_quality_impact(s.object_kind, s.object_name, s.department),
    criticality_source   = 'auto'
  where (not p_only_auto or s.criticality_source = 'auto');
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'so_dong', v_n,
    'msg', 'Đã chấm lại ' || v_n || ' đối tượng (đề xuất tự động, chờ QA duyệt)');
end;
$fn$;

-- Chấm lần đầu cho toàn bộ
update public.vmp_source_objects s set
  complexity_score     = public.vmp_score_complexity(s.object_kind, s.object_name),
  quality_impact_score = public.vmp_score_quality_impact(s.object_kind, s.object_name, s.department),
  criticality_score    = public.vmp_score_complexity(s.object_kind, s.object_name)
                       * public.vmp_score_quality_impact(s.object_kind, s.object_name, s.department),
  criticality_source   = 'auto';

-- ---------------------------------------------------------------------
-- Bảng LUẬT ĐANG ÁP DỤNG — nguồn duy nhất cho màn "Luật" trên web
--
-- Đọc thẳng từ DB thay vì gõ lại trong giao diện, để trang luật KHÔNG BAO
-- GIỜ nói khác cái hệ thống thật sự làm.
-- ---------------------------------------------------------------------
create or replace function public.rpc_active_rules()
returns jsonb
language sql stable security definer set search_path = public
as $fn$
  select jsonb_build_object(
    'cap_nhat', now(),

    'diem_trong_yeu', jsonb_build_object(
      'cong_thuc', 'Điểm trọng yếu = Điểm mức độ phức tạp × Điểm ảnh hưởng tới chất lượng sản phẩm',
      'thang', '1 … 9',
      'phuc_tap', jsonb_build_array(
        jsonb_build_object('muc','Cao','diem',3),
        jsonb_build_object('muc','Trung bình','diem',2),
        jsonb_build_object('muc','Thấp','diem',1)),
      'anh_huong', jsonb_build_array(
        jsonb_build_object('muc','Ảnh hưởng trực tiếp tới chất lượng sản phẩm','diem',3),
        jsonb_build_object('muc','Ảnh hưởng gián tiếp tới chất lượng sản phẩm','diem',2),
        jsonb_build_object('muc','Không ảnh hưởng tới chất lượng sản phẩm','diem',1)),
      'phan_bo', (
        select coalesce(jsonb_agg(jsonb_build_object('diem', criticality_score, 'so_luong', n)
                                  order by criticality_score desc), '[]'::jsonb)
        from (select criticality_score, count(*) n from public.vmp_source_objects
              where criticality_score is not null group by 1) d),
      'da_duyet', (select count(*) from public.vmp_source_objects where criticality_source = 'manual'),
      'cho_duyet', (select count(*) from public.vmp_source_objects where criticality_source = 'auto')
    ),

    'sinh_timeline', jsonb_build_object(
      'loc', 'Chỉ sinh cho đối tượng có Thẩm định = y (so sánh sau trim/lower/NFC)',
      'loai_tham_dinh', jsonb_build_array(
        jsonb_build_object('phan_loai','Thiết bị · Hệ thống phụ trợ',
          'loai','Lần đầu: DQ, FAT/SAT, IQ, OQ, PQ — về sau: OQ, PQ'),
        jsonb_build_object('phan_loai','Quy trình', 'loai','PV'),
        jsonb_build_object('phan_loai','Kho', 'loai','GSP'),
        jsonb_build_object('phan_loai','Vận chuyển', 'loai','GDP')),
      'lan_dau', 'Năm nhập = năm thẩm định VÀ đối tượng chưa từng có IQ',
      'so_lan_trong_nam', 'max(1, 12 ÷ tần suất). Tần suất trên 12 tháng chỉ sinh khi đủ chu kỳ kể từ mốc gần nhất',
      'ma_id', '{Mã đối tượng}/{Năm}.{Lần 2 chữ số}-{Loại thẩm định}',
      'moc_thoi_gian', jsonb_build_array(
        'T (Deadline VMP) = ngày cuối tháng của (tháng đầu tiên + (lần−1) × tần suất)',
        'Hạn báo cáo = T − 5 ngày',
        'Hạn kết thúc thẩm định = Hạn báo cáo − khoảng cách báo cáo',
        'Hạn bắt đầu thẩm định = Hạn kết thúc − Số ngày công thẩm định thực tế',
        'Hạn hoàn thành đề cương = Hạn bắt đầu − 60 ngày'),
      'khoang_cach_bao_cao', jsonb_build_array(
        jsonb_build_object('dieu_kien','Loại thẩm định IQ hoặc OQ','ngay',2),
        jsonb_build_object('dieu_kien','Phân loại báo cáo: Không phụ thuộc','ngay',2),
        jsonb_build_object('dieu_kien','Phân loại báo cáo: Hóa lý','ngay',2),
        jsonb_build_object('dieu_kien','Phân loại báo cáo: Nhiễm khuẩn','ngay',7),
        jsonb_build_object('dieu_kien','Phân loại báo cáo: Vô khuẩn','ngay',16))
    ),

    'phan_quyen', (
      select coalesce(jsonb_agg(jsonb_build_object('vai_tro', r, 'quyen', q) order by r), '[]'::jsonb)
      from (values
        ('admin',           'Toàn quyền: đọc, nhập, sửa, xoá, sinh timeline, chấm điểm'),
        ('qa_manager',      'Như admin trên dữ liệu nghiệp vụ'),
        ('department_user', 'Chỉ cập nhật tiến độ hạng mục thuộc bộ phận mình'),
        ('viewer',          'Chỉ đọc')
      ) t(r, q)),

    'toan_ven_du_lieu', jsonb_build_array(
      'Mọi thao tác ghi đi qua RPC kiểm quyền phía server; trình duyệt không ghi thẳng bảng',
      'Đánh dấu hoàn thành hoặc nhập ngày hoàn thành BẮT BUỘC có lý do (yêu cầu GMP)',
      'Khoá lạc quan theo version: hai người sửa cùng lúc thì người sau bị chặn, không ghi đè',
      'Audit trail ghi bằng trigger DB: giá trị cũ, giá trị mới, trường đã đổi, lý do, người, IP',
      'Xoá là xoá mềm — giữ bản ghi để truy vết'),

    'so_lieu_hien_tai', jsonb_build_object(
      'doi_tuong_nguon',  (select count(*) from public.vmp_source_objects where is_active),
      'co_tham_dinh',     (select count(*) from public.vmp_source_objects where is_active and validate_flag='y'),
      'hang_muc',         (select count(*) from public.vmp_plan_items where is_active),
      'ban_ghi_audit',    (select count(*) from public.audit_logs))
  );
$fn$;

-- Quyền — xem HANDOVER mục 11a
do $$
declare f text;
begin
  foreach f in array array[
    'public.rpc_recalc_criticality(boolean)',
    'public.rpc_active_rules()'
  ] loop
    execute format('revoke execute on function %s from anon',   f);
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

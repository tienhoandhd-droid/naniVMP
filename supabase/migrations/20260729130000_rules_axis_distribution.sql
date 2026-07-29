-- Bổ sung phân bố TỪNG TRỤC vào rpc_active_rules.
-- Lý do: sau khi sửa phân loại, trục 'ảnh hưởng chất lượng' còn 97,3% là mức 3
-- (trực tiếp) nên gần như không phân biệt được đối tượng. Đưa số liệu này lên
-- trang Luật để người đọc thấy đúng giới hạn của thang điểm đang dùng.

CREATE OR REPLACE FUNCTION public.rpc_active_rules()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      'phan_bo_truc', jsonb_build_object(
        'phuc_tap', (select coalesce(jsonb_agg(jsonb_build_object('diem',complexity_score,'so_luong',n) order by complexity_score desc),'[]'::jsonb)
                     from (select complexity_score, count(*) n from public.vmp_source_objects
                           where complexity_score is not null group by 1) a),
        'anh_huong', (select coalesce(jsonb_agg(jsonb_build_object('diem',quality_impact_score,'so_luong',n) order by quality_impact_score desc),'[]'::jsonb)
                      from (select quality_impact_score, count(*) n from public.vmp_source_objects
                            where quality_impact_score is not null group by 1) b)),
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

$function$

;

revoke execute on function public.rpc_active_rules() from anon, public;
grant execute on function public.rpc_active_rules() to authenticated, service_role;

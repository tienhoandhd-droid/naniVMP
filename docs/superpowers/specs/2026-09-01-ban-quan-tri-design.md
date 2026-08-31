# Thiết kế — Viết lại nhóm "Phân tích & Quản trị" thành BÀN QUẢN TRỊ

01/09/2026 · chủ dự án đặt hàng: "các mục ở bên trong phần này dài, chưa đáp ứng được chức năng vận hành".

## Chẩn đoán (đọc mã + đo màn 01/09)

6 màn, 2.772 dòng, chung một bệnh: **sổ ghi chép cuộn dọc** — nhiều Card xếp chồng
(Workload 5 mục ~4 màn hình cuộn; Reports 8 Card ~6 màn cuộn; PhanQuyen 5 khối lớn).
Người vận hành vào các màn này với MỘT câu hỏi cụ thể ("ai quá tải?", "xuất báo cáo
tháng", "thêm tài khoản") nhưng phải cuộn qua mọi thứ khác. Thiếu hành động tại chỗ:
thấy vấn đề rồi phải tự nhảy màn khác xử lý.

## Nguyên tắc thiết kế (áp cả 6 màn)

1. **Tab thật thay cuộn dài** — component dùng chung `NhomTab` (ARIA tablist, badge
   đếm, nhớ tab cuối mỗi màn qua localStorage `vmp.tab.<man>`; URL-tab để đợt sau
   vì đụng `urlState`). Mỗi tab = một câu hỏi vận hành.
2. **Dòng số mở màn, bấm được** — 3-4 KPI đầu màn nhảy thẳng tab liên quan.
3. **Hành động tại chỗ** — deep-link/nút xử lý ngay cạnh con số báo vấn đề.
4. Không thêm thư viện; giữ model/RPC hiện có; các panel con (AccountAdministration,
   StaffDirectory, Assignment, QuanTriQuyen, MaTranQuyen, ItemPermissionMode) GIỮ
   NGUYÊN ruột — chỉ thay khung điều phối.

## Từng màn

### 1 · Phân công & khối lượng (WorkloadPage)
Tabs: **Sức tải** (mặc định: cards người + thẻ việc vô chủ) · **Ma trận** (Người×Tháng)
· **Nhóm việc** · **Theo người** · **Trọng yếu**. KPI mở màn: quá tải · vô chủ · tổng
ngày công · số người. Hành động mới trong modal chi tiết người: nút **"Mở Cập nhật
tiến độ của người này"** (deep-link `#v=progress` + person scope sẵn có) và **"Chép
danh sách mã"** (clipboard, để dán vào email/biên bản điều phối).

### 2 · Báo cáo (ReportsView)
Tabs: **Kỳ báo cáo** (mặc định — mục 2 So kỳ + 4 Bất cập + 5 Tháng tới + dữ liệu thô)
· **Cả năm** (mục 1 + phân bố) · **Nhận xét & Xuất** (AI + 3 nút xuất). Thanh hành
động DÍNH đầu màn: kỳ đang chọn + nút Xuất Excel + nút **Sao chép nhận xét** (đưa
thẳng vào email/biên bản họp — nhu cầu vận hành số 1 của màn này).

### 3 · Vai trò & phạm vi (PhanQuyenPage)
Tabs: **Tài khoản** (mặc định: AccountAdministrationPanel + role editor) · **Email
được phép** (QuanTriQuyenCards) · **Quyền hạng mục** (ItemPermissionModeCard +
StaffDirectory + Assignment) · **Quyền của tôi** (MaTranQuyenManHinh). KPI mở màn:
số tài khoản hoạt động · email allowlist · chế độ DỰ THẢO/ÁP DỤNG (+ số lỗi chặn).
Giữ nguyên mọi data-attr/label mà e2e `quyen-admin`/`tai-khoan-an-sap-xep` bám.

### 4 · Chất lượng dữ liệu (HealthPage)
Tab mới **Đối chiếu** làm MẶC ĐỊNH: một bảng client-vs-server cho các con số
(KPI hạng mục/hồ sơ/quá hạn + đếm lỗi theo loại), CHỈ tô đỏ dòng lệch — trả lời
thẳng "bản trên máy tôi có cũ không". Hai tab chi tiết giữ nguyên. Nút "Tính lại
trạng thái" (đã có) đứng cạnh bảng đối chiếu.

### 5 · Nhật ký thay đổi (AuditLogPage)
(1) Nút **"Xem thay đổi"** mỗi dòng → modal diff old/new theo từng field trong
`changed_fields`, giá trị cũ gạch, mới đậm; (2) chip lọc nhanh **Hôm nay / 7 ngày**
(RPC đã có p_from_date); (3) lọc theo **bảng** (p_table_name, select 5 bảng chính).

### 6 · Cấu hình hệ thống (AdminPage)
Thêm khối **"Lỗi client 24h"** đọc `rpc_doc_loi_client` — nối trọn vòng giám sát E2:
bảng 20 lỗi gần nhất (giờ, người, message). RPC chưa áp (migration 20260831170000)
→ hiện hộp hướng dẫn áp theo runbook, không lỗi đỏ.

## Kiểm thử
- Unit: model tab (nhớ/khôi phục), model đối chiếu Health, model diff audit.
- E2E mock hiện có là oracle hồi quy (quyen-admin, tai-khoan, luong-gia-lap 8 màn);
  a11y 15 kịch bản phải xanh (tablist ARIA đúng chuẩn như HealthPage cũ).
- Ảnh chụp trước/sau từng màn.

## Ngoài phạm vi (ghi để khỏi trôi)
- URL cho tab (đụng urlState — đợt sau). Chuyển phụ trách một-bấm từ Workload
  (cần luồng AssignmentPanel theo mã — đợt sau). Snapshot báo cáo bất biến (cần DB).

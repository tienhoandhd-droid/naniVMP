# Gọn giao diện VMP — 21/10/2026

Nguồn: rà soát chữ & bố cục ngày 21/10 (≈850 chuỗi vi phạm, 5 phần) và rà nút/lưu theo vai.
Chủ dự án chọn: giữ Lotus Pearl, tinh chỉnh; mỗi vai thấy đúng màn của vai mình.

## Nguyên tắc

- Không đổi công thức, tiêu chí, form in, quyền máy chủ, migration.
- Chữ hiển thị: ngắn, dứt khoát, ngôn ngữ nghiệp vụ GMP; không chữ kỹ thuật
  (Supabase, RPC, n8n, migration, payload, cache, tên cột), không câu tự bào chữa,
  không hướng dẫn đọc biểu đồ, phụ đề đầu trang ≤ ~8 từ.
- Lỗi kỹ thuật thô chỉ ghi vào console/log, người dùng thấy câu nghiệp vụ + cách xử lý.
- Giữ câu mang ý nghĩa GMP/pháp lý (AI chỉ đề xuất, cần QA xác nhận — giữ đúng 1 lần mỗi màn; cảnh báo ký điện tử).

## Thuật ngữ chuẩn

Hạng mục · Đối tượng · Dữ liệu nguồn · Hạn chót / Đích VMP · Quá hạn · Tới hạn (N ngày) ·
QA phụ trách / Người thực hiện · Chưa phân công · Trọng yếu · Dòng thời gian ·
Đề cương → Thẩm định → Báo cáo → Đích VMP · Quy tắc nghiệp vụ · Dây chuyền ·
Hiện trên bảng · Đợt nhập · "hệ thống" thay cho server/database/Supabase/n8n.
Màn nhật ký quản trị đổi tên **Nhật ký hệ thống**; "Nhật ký thay đổi" để riêng cho Thẩm định thực tế.

## Quá hạn / Tới hạn

Không đổi cách tính (là quy tắc nghiệp vụ). Mỗi con số ghi rõ cửa sổ của nó
("Tới hạn 7 ngày", "Tới hạn 30 ngày"); bỏ số trùng trên cùng một màn.

## Gói việc

- **A — Màn làm việc, giám sát, báo cáo, quản trị** (Phần 1–3 của rà soát).
  Bỏ khối Vali lặp số ở Tổng quan; gộp 3 banner Báo cáo còn 1 câu; bỏ dải 4 ô trùng mục 1;
  dải "Ba màn giám sát" chỉ giữ điều hướng, bỏ câu mô tả; Cảnh báo bỏ khối "việc làm trước tiên"
  (giữ ở Hôm nay); hộp Chỉnh hạn dùng nhãn nghiệp vụ thay tên cột; panel Hiệu năng chỉ Admin;
  sửa hai chỉ dẫn trỏ tới tab/thẻ không tồn tại.
- **B — Dữ liệu nguồn, vỏ ứng dụng, thông báo lỗi, Vali, hằng số điều hướng** (Phần 4–5).
  Thông báo lỗi tải/lưu thành câu nghiệp vụ; một nơi báo lỗi tải dữ liệu; trợ giúp tab
  Dữ liệu nguồn rút còn 2–3 câu; bỏ banner luôn hiện; phụ đề điều hướng ≤ 8 từ.
- **C — Lỗi nút/lưu theo vai** từ rà soát headless và DB thử: sửa sau khi có báo cáo.

Không làm trong đợt này: dọn code chết; chữ do máy chủ trả về; đổi định nghĩa quá hạn.

## Kiểm

Mỗi gói: `npm run typecheck`, `npm run test:unit` (cập nhật kỳ vọng chữ trong test khi đổi chữ),
`npm run build`, `npm run drift`. Cuối đợt: chụp headless các màn theo vai, đo lại số chuỗi vi phạm.

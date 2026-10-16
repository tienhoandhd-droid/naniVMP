# Nâng cấp Thẩm định thực tế — 16/10/2026

Căn cứ: rà soát code + dữ liệu production (2 đợt, 5 hồ sơ, 1 người có quyền ghi,
không hoạt động từ 29/09) và đối chiếu EU GMP Annex 11, 15, 1; 21 CFR Part 11; PIC/S PI 041.

## Quyết định của chủ dự án

| Nội dung | Quyết định |
|---|---|
| Vai ký | Người nhập → **Kiểm tra**: QA khác (trong danh sách QA phụ trách) → **Duyệt**: Admin. Ba người khác nhau. |
| Cách ký | Nhập lại mật khẩu + chọn ý nghĩa ký (Kiểm tra / Duyệt). Ghi tên, thời điểm, ý nghĩa; gắn với đúng phiên bản hồ sơ. |
| Sau duyệt | Hồ sơ khoá. Admin mở lại (bắt buộc lý do) → sửa tạo phiên bản mới → kiểm tra + duyệt lại. Chữ ký cũ giữ trong lịch sử. |
| Không đạt | Bắt nhập mã deviation trước khi gửi kiểm tra (Annex 15 §2.8). |
| Ngưỡng cảnh báo/hành động | Admin nhập theo chỉ tiêu, có phiên bản, ngày hiệu lực, lý do. Máy gợi ý từ lịch sử (2SD/3SD hoá lý; percentile vi sinh) khi đủ số liệu, không tự áp. |

## Gói và thứ tự

1. Gọn giao diện (bỏ chữ kỹ thuật, "DEMO", UUID; ngày dd/mm/yyyy) + biểu đồ qua các đợt (trục số tròn, gộp lần đo, vẽ giới hạn PQ).
2. Màn nhật ký sửa (audit trail: ai, khi nào, giá trị cũ/mới, lý do; lọc, xuất) + ghi nhận mỗi lần in PDF.
4. Ngưỡng cảnh báo/hành động + phát hiện xu hướng bất lợi (Annex 1 §9.11).
3. Kiểm tra – duyệt – ký điện tử – khoá – mở lại; QA xem chéo chỉ đọc; mã deviation.

Mỗi gói: migration thử trong ROLLBACK trên production trước khi áp; chạy đủ CI; deploy riêng.
Gói 3 cần thẩm định CSV trước khi dùng cho hồ sơ chính thức.

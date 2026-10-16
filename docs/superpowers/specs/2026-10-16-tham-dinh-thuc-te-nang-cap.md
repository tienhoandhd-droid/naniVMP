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

## Đã làm (16/10)

| Gói | Migration | Ghi chú |
|---|---|---|
| 1 | — | Ngày dd/mm/yyyy, bỏ chữ kỹ thuật, biểu đồ qua các đợt. |
| 2 | `20261016170000_tham_dinh_nhat_ky` | Trang Nhật ký thay đổi; ghi nhận mỗi lần in (SHA-256) trước khi giao PDF. |
| 4 | `20261016180000_tham_dinh_nguong_canh_bao` | Ngưỡng có phiên bản (không sửa/xoá), chỉ Admin đặt; đường vàng/đỏ, báo vượt hành động và vượt cảnh báo ≥ 2 đợt liên tiếp tại cùng điểm; gợi ý ±2SD/3SD hoặc phân vị 95/99 khi có ≥ 10 kết quả. |
| 3 | `20261016190000_tham_dinh_ky_duyet` | Xem mục dưới. |

### Gói 3 — cách ký hoạt động

- Ký = nhập lại mật khẩu. Web đăng nhập lại trong một phiên riêng rồi gọi `cpc1_record_sign` bằng chính phiên đó; máy chủ chỉ nhận khi JWT có lần xác thực mật khẩu trong 5 phút gần nhất (claim `amr`). Xong thì đóng phiên riêng.
- Chữ ký gắn với đúng phiên bản hồ sơ, lưu họ tên, vai, thời điểm, ý nghĩa (Kiểm tra / Duyệt / Mở lại), mã deviation, lý do. Không sửa, không xoá được (trigger).
- Kiểm tra: QA trong danh sách QA phụ trách, không phải người đã lưu hồ sơ (kể từ lần duyệt trước), phải xem được hồ sơ theo quyền PQ. Kết quả không phải "đạt" thì bắt mã deviation.
- Duyệt: Admin, khác người nhập và người kiểm tra. Duyệt xong thì khoá: trigger trên `cpc1_revisions` chặn mọi đường lưu.
- Mở lại: Admin, bắt lý do; chữ ký cũ giữ nguyên, phiên bản phải kiểm tra + duyệt lại.
- Đã thử 16 tình huống trong ROLLBACK trên production trước khi áp.

### Trước khi dùng cho hồ sơ chính thức

- Thẩm định CSV (URS → rủi ro → IQ/OQ theo các tình huống trên → báo cáo). Bộ kiểm tự động (unit + E2E + 16 tình huống SQL) là bằng chứng OQ ban đầu, chưa thay được thẩm định.
- Cấp quyền PQ cho QA sẽ ký kiểm tra (16/10 mới 1 QA vai qa_staff xem được hồ sơ thẩm định).
- Người dùng ký phải có mật khẩu VMP (đăng nhập bằng liên kết email thì chưa ký được).

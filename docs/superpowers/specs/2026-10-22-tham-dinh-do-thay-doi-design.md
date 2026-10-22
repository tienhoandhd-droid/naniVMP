# Thẩm định do thay đổi — thiết kế (22/10/2026)

Chủ dự án duyệt ngày 22/10/2026.

## Mục tiêu

Phiếu thay đổi (CC) cần thẩm định được lấy tự động từ sheet "Tổng hợp thay đổi"
(nhóm khác quản lý). Trên web, QA gắn phiếu với thiết bị theo mã thiết bị và với
các đợt thẩm định của thiết bị đó.

## Nguồn dữ liệu

- Sheet `1WfUeeY6wxmy2nhS3yPzWnreVE2Qct3pGQni8um7MjTQ`, tab `2026` và `2026 (2)`.
- Chỉ lấy dòng có giá trị ở cột "Có cần tiến hành thẩm định không?" (hiện là `x`).
- Cột được nhận theo **tên tiêu đề**, không theo chữ cái cột.
- Chỉ đọc. Không bao giờ ghi vào sheet.

## Đồng bộ

- n8n gọi `vmp_change_sync_next()` mỗi 2 phút. Hàm trả một lượt chạy khi:
  - có yêu cầu từ nút "Làm mới"; hoặc
  - đã qua 06:00 (giờ Việt Nam) mà hôm nay chưa có lượt thành công.
- n8n đọc sheet bằng Google Sheets API (`values:batchGet`, `FORMATTED_VALUE`),
  gửi nguyên kết quả cho `vmp_change_sync_ingest(run_id, payload)`.
- Toàn bộ việc tách cột, đọc ngày và chặn lỗi nằm trong SQL để kiểm thử được.
- Chặn: thiếu cột bắt buộc, tab trống bất thường, payload sai dạng
  → lượt chạy ghi `loi`, **không đổi dữ liệu**.
- Phiếu mất dấu `x` hoặc mất khỏi sheet: không xoá, ghi `removed_from_sheet_at`.
- Chặn thêm (sau rà soát độc lập): cột cần lấy bị trùng tên; một lần đọc làm hơn nửa
  số phiếu đang theo dõi của một tab (từ 5 phiếu) mất dấu; dòng sai dạng.
- Nếu nhóm kia bỏ dấu thật cho nhiều phiếu một lúc, lượt bị chặn. Sau khi kiểm sheet,
  Admin chạy `select public.vmp_change_sync_force_next('lý do ≥10 ký tự');` (SQL editor,
  quyền service_role) — xếp MỘT lượt được vượt ngưỡng, có ghi nhật ký.
- Ô "Có cần thẩm định" ghi "Không…/No/-/0" coi như không cần.
- Yêu cầu Làm mới chờ quá 15 phút (n8n ngừng) → báo lỗi, bấm lại được.
- Lịch 06:00 chạy nếu từ 06:00 hôm nay chưa có lượt thành công.
- Đổi tên tab trên sheet = tab mới: phiếu cũ không tự chuyển (phải sửa workflow n8n).
- Nhật ký: mỗi phiếu được tạo / sửa từ sheet (giữ giá trị cũ) / bị bỏ dấu đều có dòng
  `audit_logs`; lưu trên web, tạo đợt, bấm Làm mới cũng có.

## Dữ liệu

- `vmp_change_records`: phần đồng bộ từ sheet + phần web
  (`deadline_override`, `handling_status`, `note`, `version`).
- `vmp_change_objects`: phiếu ↔ mã thiết bị (nhiều mã, phải có trong `vmp_objects`).
- `vmp_change_plan_links`: phiếu ↔ đợt thẩm định; đợt phải thuộc thiết bị đã gắn.
- `vmp_change_sync_runs`: lịch sử lượt đồng bộ.
- Deadline chuẩn = `deadline_override`, nếu không có thì ngày đọc được từ sheet.
  Ô ghi chữ thì lấy **ngày muộn nhất** tìm thấy (`dd/mm/yyyy`; `mm/yyyy` → cuối tháng).

## Quyền

- Admin, Quản lý QA, Nhân viên QA: xem tất cả, gắn thiết bị/đợt, sửa phần web, bấm Làm mới.
- Tạo đợt thẩm định mới từ phiếu: giữ luật có sẵn của `rpc_create_plan_item`
  (quyền `edit_catalog` = Admin, Quản lý QA). Nhân viên QA không thấy nút này.
- Quản lý xưởng, Nhân viên xưởng: chỉ xem phiếu có thiết bị mà họ xem được đợt thẩm định.
- Hàm ghi chỉ mở cho `authenticated`; hàm đồng bộ chỉ cho vai DB của n8n (không mở cho web).
- Bảng bật RLS, không có policy cho browser: đọc/ghi qua RPC.
- Ghi web dùng `p_expected_version` + `FOR UPDATE`; mọi lần ghi vào `audit_logs`.

## Giao diện

- Tab `changes` ("Thay đổi") trong màn Dữ liệu nguồn, cạnh "Tái thẩm định" — không thêm
  mục thanh bên để không phải ghi dòng mới vào `vmp_screen_permissions`.
  Bảng, lọc, nút Làm mới, trạng thái đồng bộ.
- Hộp thoại phiếu: gắn mã thiết bị, chọn đợt thẩm định, tạo đợt tái thẩm định, sửa hạn/trạng thái.
- Tiến độ: nhãn "Do <mã thay đổi>" trên đợt đã gắn.

## Kiểm thử

- SQL: quyền 5 vai, chặn mã thiết bị sai, chặn gắn đợt của thiết bị khác, xung đột version,
  đọc deadline, chặn đồng bộ thiếu cột/tab trống, đồng bộ 2 lần không trùng.
- Unit + E2E mock: luồng mở phiếu → gắn thiết bị → gắn đợt; khổ máy tính bảng.

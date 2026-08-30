# Tiến độ VMP local

## 2026-08-31 — Cảnh báo & ưu tiên

**Trạng thái:** Hoàn tất tại local, đã dừng theo yêu cầu người dùng.

**Nhánh và workspace**

- Nhánh: `design/lotus-b-plus`
- Workspace: `C:/Users/ADMIN/Desktop/vmp`
- Giữ nguyên worktree; chưa commit, chưa push, chưa deploy và không ghi dịch vụ remote.

**Đã hoàn thành**

- Thêm bàn điều phối với một hạng mục ưu tiên số 1 và tối đa bốn việc kế tiếp.
- Cho phép mở chi tiết hạng mục và tạo email nhắc việc bằng `mailto:`; không tự gửi email.
- Hợp nhất cảnh báo thành bốn tín hiệu rõ ràng: quá hạn, tới hạn 30 ngày, rủi ro cao và tái thẩm định.
- Thêm góc nhìn quản lý gồm tỷ lệ quá hạn, tỷ lệ rủi ro cao, số hạng mục chưa có người phụ trách và điểm nóng theo bộ phận.
- Thu gọn tìm kiếm/công cụ và phân tích AI để giảm lặp, giữ danh sách nghiệp vụ hiện có.
- Đưa tab Chrome chính về `http://127.0.0.1:5199/#v=alerts`; không mở tab mới.

**File thuộc phạm vi thay đổi này**

- `src/features/monitoring/alertsCommandModel.ts`
- `src/pages/AlertsPage.tsx`
- `src/features/monitoring/monitoring.css`
- `tests/unit/alerts-command-model.test.mjs`
- `tests/e2e/monitoring-journey.mjs`
- `docs/superpowers/specs/2026-08-31-alerts-command-center-design.md`
- `docs/superpowers/plans/2026-08-31-alerts-command-center.md`

**Bằng chứng kiểm tra**

- `node --import tsx --test tests/unit/alerts-command-model.test.mjs tests/unit/monitoring-journey.test.mjs`: đạt 6/6 test.
- `npm run typecheck`: đạt, exit code 0.
- `git diff --check` trên các file thuộc phạm vi: đạt.
- `node tests/e2e/monitoring-journey.mjs`: đạt desktop và mobile 390 px; có bàn điều phối, bốn tín hiệu, góc nhìn quản lý, công cụ phụ đóng mặc định và không tràn ngang.
- Vite API build với `envDir` tạm: đạt, 2.323 module được biên dịch.
- Kiểm tra trực quan Chrome 2576 × 1416: trang cảnh báo hiển thị sạch, không có modal che màn hình.

**Giới hạn đã biết**

- `npm run build` chuẩn trên Windows bị chặn khi đọc `.env`: `EPERM: operation not permitted, open 'C:\Users\ADMIN\Desktop\vmp\.env'`.
- Build thay thế xác nhận mã nguồn biên dịch được nhưng bỏ qua biến môi trường thật, vì vậy có cảnh báo thiếu `VITE_SUPABASE_URL` và font sẽ được phân giải lúc chạy.
- Nút nhắc việc chỉ mở ứng dụng email của máy; không có thao tác gửi tự động.

**Khi tiếp tục phiên sau**

- Mở lại `docs/superpowers/PROGRESS.md` và trang `#v=alerts` để rà soát trực quan trước khi quyết định commit/tích hợp.
- Không tự động mở rộng sang màn khác hoặc xử lý lỗi `.env` nếu người dùng chưa yêu cầu.

# Báo cáo Task 5 — Nối tài khoản Admin

## RED → GREEN

- RED: `decodeAccountCandidate` và `createLinkPermissionAccountArgs` chưa tồn tại; unit test lỗi đúng vì hàm không phải function.
  GREEN: decoder xác thực hợp đồng candidate, client gọi hai RPC chuẩn và args có `person_id`, `user_id`, `reason`, `expected_version`.
- RED: `AccountLinkPanel` chưa tồn tại; SSR unit test lỗi `ERR_MODULE_NOT_FOUND`.
  GREEN: Admin thấy tìm/chọn ứng viên, lý do, nối/gỡ; người không có quyền không render control.
- RED: hàm tải lại hồ sơ được chọn sau nối chưa tồn tại; unit test lỗi đúng vì hàm không phải function.
  GREEN: danh bạ tìm lại theo `full_name` nhưng chọn kết quả duy nhất theo `person_id`, an toàn khi trùng tên.
- RED: workspace chưa phân tách quyền Admin/QA manager và vẫn tham chiếu RPC nối cũ.
  GREEN: QA manager chỉ có quyền phân công QA; UI danh bạ dùng RPC chuẩn, không còn caller tới `lienKetTaiKhoan`.

## Tệp thay đổi

- `src/features/itemPermissions/AccountLinkPanel.tsx`
- `src/features/itemPermissions/types.ts`
- `src/features/itemPermissions/api.ts`
- `src/features/itemPermissions/StaffDirectoryPanel.tsx`
- `src/pages/PhanQuyenPage.tsx`
- `tests/unit/item-permission-contracts.test.mjs`

## Kiểm chứng

- `npm run test:unit` — 38/38 pass.
- `npm run typecheck` — pass.
- `npm run build` — pass.

## Commit

- `feat(danh bạ): cho Admin nối tài khoản theo person ID`

## Rủi ro còn lại

- Chưa chạy E2E với Supabase thật trong Task 5; các RPC và phân quyền server đã được Task 3 định nghĩa, còn Task 5 chỉ dùng đúng contract đó.
- Workspace legacy đang tắt và không còn gọi RPC nối cũ; nếu được bật lại, thao tác nối hiển thị hướng dẫn chuyển sang danh bạ chuẩn thay vì mutate dữ liệu.

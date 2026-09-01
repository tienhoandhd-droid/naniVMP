# Chuyển người phụ trách từ Khối lượng — Thiết kế

## Mục tiêu

Cho phép Admin và Quản lý QA chuyển QA phụ trách của một hạng mục ngay trong
màn **Phân công & khối lượng**, nhưng vẫn giữ `vmp_source_objects.owner_person_id`
là dữ liệu gốc và để dữ liệu hạng mục được đồng bộ từ nguồn.

## Phạm vi

- Thêm hành động **Chuyển phụ trách** trên từng dòng của hộp chi tiết Khối lượng.
- Chỉ hiện hành động cho vai `admin` và `qa_manager`.
- Chọn người bằng khóa danh bạ `vmp_performers.id`; chỉ người đang hoạt động.
- Bắt buộc lý do, xác nhận người cũ → người mới trước khi ghi.
- Gọi RPC hiện có `rpc_set_item_performer_by_id(text,uuid,text)`; không ghi trực
  tiếp `vmp_plan_items` và không tạo cơ chế phân công song song.
- Sau thành công, đóng hộp chuyển, báo toast và tải lại dữ liệu dashboard.
- Lỗi giữ nguyên hộp, giữ lựa chọn/lý do và hiển thị thông báo để sửa hoặc thử lại.

## Luồng giao diện

1. Người dùng mở một ô/người/nhóm trong Khối lượng để xem danh sách hạng mục.
2. Mỗi dòng có nút **Chuyển phụ trách** nếu người dùng đủ vai trò.
3. Nút mở `ViewportDialog`, nêu mã hạng mục và người hiện tại.
4. Người dùng chọn người mới từ danh bạ, nhập lý do và bấm **Xem lại thay đổi**.
5. Hộp xác nhận nêu rõ `người cũ → người mới`; xác nhận mới gọi RPC.
6. Khi đang lưu, khóa nút và mọi lối đóng. Thành công tải lại dữ liệu; thất bại
   giữ form và thông báo lỗi bằng vùng `role="alert"`.

## Quyền và tính toàn vẹn

- UI chỉ là lớp tiện dụng; RPC tiếp tục là biên kiểm quyền fail-closed.
- Không suy người bằng tên, email hoặc tên viết tay.
- Không cho chọn lại đúng người hiện tại.
- Lý do được chuẩn hóa khoảng trắng và phải có nội dung.
- Một thao tác chỉ đổi một hạng mục/mã thẩm định; không chuyển hàng loạt ngầm.
- Không cần migration mới trong đợt này.

## Cấu trúc mã

- `src/features/workload/workloadOwnerTransferModel.ts`: điều kiện quyền, chuẩn
  hóa/kiểm tra form và dựng nội dung xác nhận thuần hàm.
- `src/features/workload/WorkloadOwnerTransferDialog.tsx`: form dialog, trạng thái
  lưu, gọi API và phản hồi truy cập được.
- `src/pages/WorkloadPage.tsx`: mở luồng từ từng dòng chi tiết và nhận callback
  tải lại.
- `src/App.tsx`: truyền `businessRole` và `onReload` vào Workload.

## Kiểm thử chấp nhận

- Unit: chỉ Admin/Quản lý QA được thao tác; lý do rỗng, thiếu người và chọn đúng
  người cũ đều bị chặn; payload dùng UUID và lý do đã chuẩn hóa.
- Component/SSR: người đủ quyền thấy nút; người khác không thấy; dialog có label,
  trạng thái lỗi và nút lưu bị khóa đúng điều kiện.
- E2E mục tiêu: Admin chuyển một hạng mục, request gọi đúng RPC/payload, dữ liệu
  được tải lại; QA staff không có hành động.
- Chạy `npm run typecheck`, `npm run build` và kiểm tra accessibility mục tiêu.

## Ngoài phạm vi

- Chuyển hàng loạt toàn bộ việc của một người.
- Đổi người hỗ trợ.
- Sửa kiến trúc phân quyền/RPC hiện hữu.
- Push, deploy hoặc apply migration.

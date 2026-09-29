# Phiếu: Kế thừa quyền PQ cho Thẩm định thực tế

| Mục | Nội dung |
|---|---|
| Người dùng | QA xem/nhập kết quả thực tế đúng hệ thống mình được giao tại VMP |
| Nguồn quyền | Quyền PQ hiện hữu: khí nén HT-12, nitơ HT-13; hơi dùng chung HT-14/HT-15, có quyền một trong hai PQ là đủ |
| Đầu ra | Mục được phép xuất hiện; hồ sơ dùng chung giữa QA đúng PQ; tải mẫu/báo cáo và xu hướng cùng phạm vi |
| Quyền | Xem kế thừa can_view; nhập kế thừa quyền status_validation; Admin/QA manager giữ quyền canonical hiện tại; không tự cấp quyền phê duyệt GMP |
| Trạng thái | Hồ sơ/đợt đã đóng giữ nguyên dữ liệu; kết thúc đợt cần quyền nhập tất cả hồ sơ của đợt |
| Lỗi | Sai quyền chặn cả URL trực tiếp/RPC/Storage; lỗi mạng giữ bản nhập; xung đột phiên bản không ghi đè; thu hồi quyền chặn retry cũ |
| Nghiệm thu | QA phụ trách khí nén thấy hồ sơ khí nén của người tạo khác nhưng không thấy nitơ; chuyển phụ trách thì người mới truy cập, người cũ bị chặn; hai người cùng lưu chỉ một phiên bản mới được tạo |
| Lịch sử | Liên kết bằng bảng riêng, không sửa payload/revision/PDF; hồ sơ đã bind vẫn xem được khi không có PQ năm hiện tại |
| Quyết định còn mở | Đã chốt: giữ biểu mẫu hơi17điểm dùng chung; QA có quyền HT-14 hoặc HT-15 được xem/nhập toàn bộ; không còn câu hỏi nghiệp vụ mở cho phần này. |
| Giới hạn | Mới local/clone; chưa áp Supabase thật hoặc deploy; không chứng nhận validation/GMP |

Kiến trúc, tệp và rollback: xem `2026-09-29-qualification-pq-access.md`.

UAT nghiệp vụ: chưa thực hiện. Không coi kiểm thử tự động là người dùng đã duyệt.

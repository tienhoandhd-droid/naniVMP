# Thiết kế Trung tâm Cảnh báo & Ưu tiên

## Mục tiêu

Biến màn Cảnh báo & ưu tiên thành một không gian kết hợp: người trực biết việc nào phải xử lý trước, còn quản lý nhìn được điểm nghẽn mà không phải đổi màn. Phạm vi chỉ đọc dữ liệu hiện có; hành động trực tiếp gồm mở hồ sơ và tạo email nhắc người phụ trách.

## Cấu trúc màn hình

1. **Bàn điều phối ưu tiên** nằm đầu màn hình.
   - Một thẻ “Điểm nóng số 1” cho hạng mục có thứ tự ưu tiên cao nhất.
   - Danh sách ngắn bốn việc kế tiếp, đủ mã, mốc, số ngày trễ/còn lại, RPN và người phụ trách.
   - Nút chính mở chi tiết hồ sơ; nút phụ mở email nhắc việc khi có địa chỉ.
   - Thứ tự dùng cùng quy tắc hiện tại: RPN trước, hạn sau; không tạo công thức rủi ro mới.

2. **Dải tín hiệu quản lý** đặt ngay dưới bàn điều phối.
   - Quá hạn, tới hạn, rủi ro cao và tái thẩm định giữ vai trò bộ lọc nhanh.
   - Mỗi tín hiệu có số lượng và ngữ cảnh, không dùng màu làm tín hiệu duy nhất.

3. **Danh sách vận hành** giữ bộ lọc, gom theo đối tượng, phân trang và chi tiết bốn mốc hiện có.
   - Bộ lọc chính luôn hiện; tìm kiếm, xếp thứ tự và xuất CSV tiếp tục nằm trong nhóm công cụ phụ.
   - Trạng thái rỗng nói rõ do không có dữ liệu hay do bộ lọc.

4. **Góc nhìn quản lý thu gọn** nằm sau danh sách.
   - Hiển thị tối đa năm bộ phận có nhiều cảnh báo nhất bằng thanh tỷ lệ đơn giản.
   - Chỉ ra tỷ lệ quá hạn, tỷ lệ rủi ro cao, số việc chưa có người phụ trách và điểm nghẽn nổi bật.
   - Phân tích AI giữ dạng disclosure; khi AI chưa cấu hình, không chiếm một card lớn.

## Hành vi và dữ liệu

- Mọi số liệu lấy từ `Activity[]` hiện có, không gọi RPC mới.
- Hàng đợi hành động loại trùng cùng hạng mục; nếu một hạng mục thuộc nhiều nhóm, giữ cảnh báo có mức khẩn cấp cao hơn.
- Email dùng `mailto:` và dữ liệu người thực hiện hiện có; thiếu email thì hiện nhãn rõ ràng, không tạo nút giả.
- Chọn một tín hiệu quản lý cập nhật danh sách đang xem như hiện tại.
- Ma trận QRM vẫn là tab riêng trong cùng màn.

## Trình bày và khả năng truy cập

- Bố cục desktop hai cột cho bàn điều phối; mobile xếp một cột.
- Nút và hàng tương tác dùng phần tử ngữ nghĩa, có focus rõ và vùng bấm tối thiểu 44 px trên mobile.
- Màu đỏ/cam/tím luôn đi cùng chữ, biểu tượng hoặc con số.
- Không thêm animation trang trí; tôn trọng `prefers-reduced-motion`.

## Kiểm thử chấp nhận

- Model ưu tiên loại trùng, xếp đúng RPN rồi hạn và tính đúng chỉ số quản lý.
- Desktop hiển thị bàn điều phối, bốn tín hiệu và góc nhìn quản lý mà không tràn ngang.
- Mobile giữ đủ hành động chính, không có mục tiêu bấm bị ẩn.
- Mở chi tiết và liên kết nhắc việc hoạt động; không phát sinh request ghi dữ liệu.
- Typecheck và production build đạt.

## Ngoài phạm vi

- Không tự gửi email, không phân công lại người phụ trách.
- Không sửa công thức RPN, quyền truy cập hoặc dữ liệu Supabase.
- Không thiết kế lại Ma trận QRM.

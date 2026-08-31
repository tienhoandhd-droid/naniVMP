# Wave 2 — Hành động tin cậy và desktop gọn đẹp

## Mục tiêu

Đưa các luồng thao tác chính của VMP tới trạng thái người dùng luôn hiểu được
“có thể làm gì, còn thiếu gì, hệ thống đã ghi hay chưa”, đồng thời làm giao
diện desktop gọn, nhất quán và truy vết được theo dữ liệu nguồn.

## Phạm vi

Wave này gồm 5 lát cắt độc lập, triển khai theo đúng thứ tự:

1. **Hành động và lưu tin cậy** tại Vai trò & phạm vi, liên kết tài khoản,
   phân công theo hạng mục, phạm vi xưởng và chỉnh deadline kế hoạch.
2. **Tổng quan theo người** dùng đúng tập hạng mục canonical và hiển thị mẫu số
   hoàn thành hiện hành, không phụ thuộc bộ lọc kỳ đã nhớ từ chế độ cả nhóm.
3. **Tab quản trị có deep-link** trong hash hiện có của GitHub Pages, đồng bộ
   Back/Forward và vẫn giữ localStorage làm fallback.
4. **Thời gian vận hành thống nhất** theo `Asia/Bangkok`; không để múi giờ máy
   người xem làm đổi dấu thời gian trong nhật ký, quản trị và dữ liệu nguồn.
5. **Dọn tải 3D đã bỏ khỏi sản phẩm**, xóa dependency và mã chết sau khi chứng
   minh không còn route runtime nào sử dụng.

Không gồm: thay đổi ma trận quyền server, chạy migration production, xóa dữ
liệu nghiệp vụ, mobile redesign hoặc tạo kết luận không có dữ liệu nguồn.

## Thiết kế hành động

### Nút chính

- Nút chính chỉ bị `disabled` khi request đang chạy hoặc người dùng thật sự
  không có quyền.
- Thiếu lựa chọn/lý do/dữ liệu bắt buộc không làm nút im lặng. Khi bấm, giao
  diện hiện lỗi cụ thể cạnh trường, mở phần bị thu gọn và chuyển focus tới lỗi
  đầu tiên.
- Nút đang chạy đổi nhãn thành “Đang ……” và chặn gửi lặp bằng khóa đồng bộ đã
  có trong từng feature.
- Trạng thái thành công, thất bại và “đã ghi nhưng chưa đối chiếu lại được”
  dùng live region; lỗi không đóng editor và không xóa bản nháp.

### Trạng thái bị khóa

- Quyền không đủ: không dựng đường ghi hoặc hiện chế độ chỉ xem có giải thích.
- Nguồn chưa tải: cho phép bấm để nhận thông báo “đang chờ nguồn nào”, kèm nút
  thử lại nếu có thể.
- Không có thay đổi: có thể khóa nút nhưng phải có câu “Chưa có thay đổi để
  lưu” ở ngay vùng hành động.

## Dữ liệu và truy vết

- Dữ liệu nguồn tiếp tục là gốc cho nhân sự, phạm vi và phân công.
- Sau mutation quan trọng, giao diện chỉ báo “đã lưu” khi đọc lại đúng UUID,
  phiên bản hoặc trạng thái mong đợi; nếu không đọc lại được phải nói rõ trạng
  thái chưa xác minh, không giả vờ thành công.
- Không suy quyền ở client; mọi bề mặt ghi dùng capability server hiện có.

## Desktop và thẩm mỹ

- Mỗi bối cảnh có một hành động chính; hành động phụ đứng cùng hàng nhưng giảm
  tương phản.
- Vùng hành động có khoảng cách, chiều cao nút và trạng thái focus thống nhất.
- Thông báo lỗi ngắn, chỉ cách sửa; phần giải thích dài chuyển thành help text
  hoặc details để bảng vẫn là bề mặt kiểm soát chính.
- Tab được phản ánh trong URL để gửi đúng trạng thái đang xem và dùng nút Back.

## Khả năng tiếp cận

- Dùng `button`, `label`, `role="alert"`/`role="status"` thật; không dùng màu
  đơn độc để báo trạng thái.
- Focus lỗi đầu tiên sau submit; tab có Home/End và mũi tên; focus-visible luôn
  nhìn thấy.
- Trường cần sửa liên kết với lỗi qua `aria-describedby`/`aria-invalid`.

## Kiểm thử chấp nhận

- Unit test cho hàm xác định lý do bị chặn và formatter Bangkok.
- E2E chứng minh từng nút chính có thể bấm khi form thiếu, focus đúng ô, sau đó
  lưu được với payload đúng và giữ draft khi RPC lỗi.
- E2E tab chứng minh hash, reload và Back/Forward đồng bộ.
- `today-personal-scope` đạt với UI Tổng quan hiện hành.
- Typecheck, build, targeted E2E, accessibility và bundle budget đều đạt.

## Rủi ro và giới hạn

- Ba migration đang chờ trong bàn giao vẫn cần chủ dự án duyệt riêng; wave này
  không dùng chúng để che lỗi frontend.
- Preview/mock chứng minh hợp đồng web; ghi thật production chỉ được kiểm sau
  khi có lệnh và preflight riêng.
- “10/10” là chuẩn vận hành đo được, không phải lời khẳng định tuyệt đối: không
  có đường ghi im lặng, không mất bản nháp, không sai múi giờ và mọi gate phát
  hành bắt buộc xanh.

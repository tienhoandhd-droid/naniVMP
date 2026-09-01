# Thiết kế Ngư đồ Long Môn — 60 ngày quanh Hôm nay

**Ngày chốt:** 01/09/2026

**Trạng thái:** Đã duyệt hướng thị giác; chờ duyệt đặc tả triển khai

**Phạm vi:** Màn **Giám sát → Dòng thời gian VMP**, chế độ **Ngư đồ**

## 1. Mục tiêu

Biến Dòng thời gian thành một bức tranh có nhịp kể chuyện rõ ràng mà vẫn là công cụ vận hành:

- hiển thị đúng **60 ngày quanh Hôm nay**;
- bên trái là **30 ngày đã qua**, bên phải là **30 ngày sắp tới**;
- Hôm nay là điểm chuyển cảnh trung tâm;
- mỗi cá vẫn truy vết được tới hạng mục, trạng thái và hạn VMP thật;
- tăng tính nghệ thuật bằng ánh sáng, chiều sâu và nhịp chuyển cảnh, không thêm chữ hoặc họa tiết gây nhiễu.

## 2. Cửa sổ thời gian và dữ liệu

### 2.1. Khoảng hiển thị

- `start`: đầu ngày Bangkok của `Hôm nay - 30 ngày`.
- `endExclusive`: đầu ngày Bangkok của `Hôm nay + 30 ngày`.
- Khoảng có đúng **60 ngày liên tục**: 30 ngày trước điểm Hôm nay và 30 ngày từ điểm Hôm nay tới biên phải.
- Vạch Hôm nay nằm chính giữa trục thời gian ở `50%`.
- Không còn luật “tháng hiện tại + tháng kế tiếp”.

### 2.2. Nhãn thời gian

- Dải lớn chia thành hai miền có nhãn trực tiếp:
  - **30 ngày đã qua**;
  - **30 ngày sắp tới**.
- Tên tháng vẫn xuất hiện tại đúng biên tháng thực tế để người dùng định vị ngày.
- Dải tuần tiếp tục dùng ngày thật, nhưng giảm độ tương phản để không biến bức tranh thành bảng lưới.
- Tooltip, modal hồ sơ và chế độ Bảng tiếp tục hiển thị deadline chính xác; vị trí nghệ thuật không được làm sai thứ tự thời gian.

### 2.3. Phân loại cá

- Chỉ các hạng mục có hạn VMP nằm trong cửa sổ mới xuất hiện trên tranh.
- Loài, màu và số đếm trạng thái tiếp tục lấy từ model trạng thái hiện tại; không suy đoán lại ở giao diện.
- Hạng mục thiếu deadline không vẽ cá, nhưng vẫn được đếm và cảnh báo ở chân tranh.
- Bộ chọn **Cả nhóm QA / Cá nhân** và ranh giới quyền hiện tại giữ nguyên.

## 3. Ý tưởng nghệ thuật: “Từ ký ức đến Long Môn”

### 3.1. Bố cục kể chuyện

Tranh là một dòng nước liền mạch từ trái sang phải:

1. **Miền đã qua** — nước sâu, xanh ngọc trầm, độ bão hòa thấp; các lớp sương và vân đá rõ hơn để tạo cảm giác ký ức đã lắng.
2. **Hôm nay** — một khe sáng dọc mảnh ở giữa, kèm nhãn ngắn và tương phản cao; đây là điểm neo thị giác đầu tiên.
3. **Miền sắp tới** — nước sáng, ấm và trong dần về phía cổng Long Môn; ánh vàng chỉ dẫn hướng, không phủ lên cá hoặc chữ.
4. **Long Môn** — giữ ở mép phải như đích đến, nhưng thu độ nặng thị giác để không che deadline cuối kỳ.

### 3.2. Phân cấp thị giác

- Hôm nay và cá là lớp thông tin nổi nhất.
- Ranh giới 30 ngày và tên tháng là lớp định vị thứ hai.
- Tuần, vân nước, sương, tia sáng là lớp nền thứ ba.
- Mã thiết bị giữ cỡ chữ đọc được; không dùng ánh sáng hoặc hiệu ứng làm giảm tương phản.
- Không thêm khối KPI, đoạn giải thích dài hoặc biểu tượng trang trí ngoài câu chuyện dòng nước.

### 3.3. Chuyển động

- Dùng chuyển động rất nhẹ cho vệt nước hoặc thân cá khi thiết bị cho phép; không làm vị trí deadline dịch chuyển.
- Khi `prefers-reduced-motion: reduce`, toàn bộ tranh vẫn đẹp ở trạng thái tĩnh và không mất thông tin.
- Không dùng hiệu ứng liên tục tốn GPU, parallax lớn hoặc canvas/3D.

## 4. Bố cục giao diện desktop

### 4.1. Phần đầu

- Thu gọn tiêu đề thành một hàng ưu tiên tranh:
  - eyebrow: **60 ngày quanh Hôm nay**;
  - tiêu đề: **Long Môn VMP**;
  - một câu hướng dẫn ngắn: **Bấm cá để xem hạn và hồ sơ**.
- Bộ chọn phạm vi QA nằm cùng hàng bên phải.
- Dòng giải thích “dòng nước/thời gian” hiện tại được bỏ; hướng chuyển cảnh của tranh phải tự diễn đạt được.

### 4.2. Mặt nước

- Desktop từ 1024px: toàn bộ 60 ngày nằm trong một màn, không cuộn ngang.
- Vạch Hôm nay luôn ở tâm; hai miền có chiều rộng bằng nhau.
- Cụm cá được bố trí hữu cơ nhưng neo theo deadline thật; không chồng lấn và không che nhãn Hôm nay.
- Cá quá hạn ở miền trái có thể trầm hơn nhẹ, nhưng không đổi màu trạng thái nghiệp vụ.
- Cá tương lai giữ độ sáng chuẩn; cá gần hạn được nhấn bằng viền/halo ngắn, không dùng animation cảnh báo liên tục.

### 4.3. Chú giải

- Chú giải sáu trạng thái tiếp tục tồn tại nhưng nén gọn thành một dải.
- Mỗi trạng thái có loài, tên ngắn và số lượng; loại bỏ mô tả trùng lặp.
- Tổng số hạng mục và số thiếu deadline đặt bên phải, đọc được trong một lượt quét.

## 5. Responsive và trạng thái đặc biệt

- Mobile giữ canvas đủ rộng để cá và mã không co quá nhỏ; tự căn Hôm nay khi mở.
- Hai miền quá khứ/tương lai vẫn có nhãn, không phụ thuộc màu để hiểu.
- Trạng thái rỗng nói rõ: **Không có hạn VMP trong 30 ngày đã qua và 30 ngày sắp tới**.
- Nếu tranh lỗi, danh sách dự phòng hiện tại vẫn hoạt động và dùng đúng cửa sổ 60 ngày.
- Chế độ **Bảng** không đổi chức năng; dữ liệu phải đối chiếu được với Ngư đồ.

## 6. Khả năng truy cập và vận hành

- Vùng bấm cá tối thiểu 44×44px; thứ tự bàn phím theo deadline rồi mã hạng mục.
- `aria-label` của tranh nêu rõ cửa sổ 60 ngày và ngày bắt đầu/kết thúc.
- Vạch Hôm nay, miền đã qua và miền sắp tới có nhãn chữ; màu không phải tín hiệu duy nhất.
- Focus ring không bị hòa vào nền nước.
- Không đổi RPC, RLS, Supabase, quyền xem, công thức deadline hay dữ liệu nguồn.

## 7. Hiệu năng

- Tận dụng tranh WebP và sprite hiện có; ưu tiên cải tiến bằng CSS gradient, mask và pseudo-element.
- Không thêm thư viện, canvas, Three.js hoặc ảnh nền lớn mới nếu CSS có thể đạt cùng hiệu quả.
- Model vẫn thuần và memoized; đổi modal hoặc bộ chọn không được dựng lại toàn bộ tranh ngoài nhu cầu.
- Production build không được tăng đáng kể kích thước JS; asset mới, nếu thực sự cần, phải là WebP/AVIF tối ưu và có kích thước khai báo.

## 8. Kiểm thử chấp nhận

1. Unit: Hôm nay ở đúng `50%`; biên bắt đầu/kết thúc đúng lịch Bangkok và ổn định qua giao tháng/năm.
2. Unit: deadline trước/sau Hôm nay nằm đúng miền; deadline ngoài 30 ngày mỗi phía bị loại.
3. Unit: tên tháng và dải tuần đúng khi cửa sổ đi qua hai hoặc ba tháng lịch.
4. Unit: loài, màu, số trạng thái và số thiếu deadline giữ đúng công thức hiện tại.
5. E2E desktop 1440×1000: thấy đồng thời nhãn quá khứ, Hôm nay, tương lai và Long Môn; không cuộn ngang, cá không chồng lấn.
6. E2E: bấm cá hai phía mở đúng hồ sơ và deadline; chuyển Cả nhóm/Cá nhân không làm sai cửa sổ.
7. E2E mobile 390px: tự căn Hôm nay, kéo ngang được, không làm tràn toàn trang.
8. Accessibility: điều hướng bàn phím, focus, tên truy cập và reduced-motion đạt hợp đồng hiện có.
9. Chạy targeted unit Long Môn, targeted E2E Long Môn, typecheck và production build.

## 9. Ngoài phạm vi

- Không sửa chế độ Bảng ngoài việc đồng bộ nhãn cửa sổ nếu cần.
- Không đổi quyền, dữ liệu nguồn, phân công QA, deadline server hoặc migration.
- Không thêm KPI, bộ lọc mới, bản đồ 3D hay một màn phụ.
- Không push GitHub hoặc deploy trong bước thiết kế này.

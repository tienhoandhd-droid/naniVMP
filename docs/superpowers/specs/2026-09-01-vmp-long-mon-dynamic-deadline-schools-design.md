# Thiết kế đàn cá linh động theo đích VMP

**Ngày chốt:** 01/09/2026

**Trạng thái:** Đã duyệt hướng; chờ duyệt đặc tả triển khai

**Phạm vi:** Ngư đồ Long Môn trong màn **Dòng thời gian VMP**

## 1. Mục tiêu

Làm Ngư đồ vận hành như một bức tranh sống nhưng vẫn là công cụ kiểm soát:

- Hôm nay luôn ở chính giữa; trái là 30 ngày đã qua, phải là 30 ngày sắp tới.
- Mỗi hồ sơ là một cá riêng, luôn nhìn thấy và bấm mở đúng hồ sơ.
- Cá có cùng deadline tạo thành một đàn có tổ chức quanh cùng đích VMP.
- Đàn tự đổi đội hình theo số lượng, từ một cá đơn lẻ tới hàng chục cá cùng ngày.
- Chuyển động tự nhiên, khác nhịp nhưng không làm sai vị trí deadline, che mã hoặc gây chóng mặt.
- Mô phỏng và kiểm thử được các tình huống ít, vừa, đông và cực đông trước khi chấp nhận giao diện.

## 2. Quan hệ với thiết kế hiện tại

Đặc tả này giữ nguyên cửa sổ 60 ngày và mỹ thuật đã chốt tại `2026-09-01-vmp-long-mon-60-day-artistic-timeline-design.md`.

Đặc tả này thay thế riêng các luật đội hình và chuyển động trong `2026-08-31-vmp-long-mon-organic-school-design.md`:

- cụm được tạo theo **deadline chính xác**, không chỉ theo vùng tuần;
- không giới hạn đội hình ở ba cột hình quạt;
- cho phép chuyển động liên tục nhẹ theo nhiều nhịp;
- vẫn giữ toàn bộ nguyên tắc truy vết, không ẩn cá và không dùng `Math.random()`.

## 3. Nguồn chân lý thời gian

Mỗi cá có hai tọa độ ngang tách biệt:

- `deadlinePct`: vị trí nghiệp vụ chính xác của deadline trong cửa sổ 60 ngày;
- `renderXPct`: vị trí trình bày sau khi đặt cá vào đội hình của đàn.

Trục ngang dùng tỷ lệ thời gian tuyến tính trong cửa sổ `[Hôm nay - 30 ngày, Hôm nay + 30 ngày)`:

`deadlinePct = (deadline - ngày bắt đầu) / 60 ngày × 100`

Vì vậy Hôm nay luôn ở `50%`; khoảng cách hai ngày trên tranh luôn tỷ lệ với khoảng cách ngày thật. Dải tuần/tháng dùng cùng thang tuyến tính. Mật độ hồ sơ không được kéo rộng một tuần hoặc làm lệch điểm Hôm nay; độ đông chỉ được xử lý bằng đội hình, tỷ lệ cá và chiều sâu canvas.

`deadlinePct` quyết định:

- thứ tự deadline;
- điểm neo của cả đàn;
- `data-anchor-x` phục vụ kiểm thử;
- nội dung trợ năng, tooltip và modal.

`renderXPct` chỉ dùng để vẽ. Sai lệch trình bày không được làm cá vượt qua vùng sở hữu của deadline hoặc đảo thứ tự hai đàn khác ngày.

## 4. Vùng sở hữu của mỗi deadline

Model nhóm cá bằng chuỗi ngày ISO `YYYY-MM-DD`. Mỗi ngày có cá nhận một vùng sở hữu theo trục ngang:

- biên trái là trung điểm tới deadline có cá liền trước;
- biên phải là trung điểm tới deadline có cá liền sau;
- ở mép cửa sổ, biên dừng tại mép an toàn của canvas;
- chừa khoảng đệm tối thiểu giữa hai vùng ngày kế nhau.

Mọi cá cùng ngày nằm trong vùng này. Nếu vùng quá hẹp cho số cá, model tăng chiều sâu hoặc giảm tỷ lệ trong giới hạn; không lấn sang vùng deadline khác.

## 5. Đội hình theo mật độ

### 5.1. Một cá

- Neo gần `deadlinePct`.
- Cao độ lấy theo một đường nước cong ổn định từ ID.
- Tỷ lệ `1.00–1.06`; góc bơi theo tiếp tuyến dòng nước.

### 5.2. Hai đến năm cá

- Đội hình vòng cung nông hướng về Long Môn.
- Cá đầu đàn gần điểm neo; các cá sau lệch dọc/ngang so le.
- Không tạo hàng ngang hoặc cột thẳng.

### 5.3. Sáu đến mười hai cá

- Hai dòng bơi so le, giao nhau nhẹ thành nhịp chữ S.
- Hai dòng dùng pha cao độ khác nhau; khoảng trống giữa đàn vẫn đủ đọc mã.
- Cá đầu và cuối không cùng cao độ để tránh hình khối giống bảng.

### 5.4. Mười ba đến ba mươi cá

- Đội hình giọt nước kéo dài hoặc chữ S nhiều nhánh.
- Phần đầu thưa, phần giữa dày hơn và đuôi tách thành hai nhánh.
- Cùng một deadline vẫn đọc thành một đàn, không biến thành lưới.

### 5.5. Trên ba mươi cá cùng deadline

- Chia thành các nhánh đàn liên kết quanh cùng một `deadlinePct`.
- Các nhánh dùng chung hướng bơi và pha tổng thể nhưng có cao độ riêng.
- Canvas được phép tăng chiều sâu theo bậc hiện có; tỷ lệ thân cá không nhỏ hơn ngưỡng đọc mã.
- Từng cá vẫn hiện, có nút riêng và thứ tự bàn phím riêng.

## 6. Thuật toán bố trí

1. Cắt dữ liệu theo cửa sổ `[Hôm nay - 30 ngày, Hôm nay + 30 ngày)` như hiện tại.
2. Tính `deadlinePct` tuyến tính cho từng deadline từ đầu cửa sổ 60 ngày; Hôm nay bắt buộc bằng `50%`.
3. Nhóm cá theo deadline, sắp trong đàn bằng `deadline + code + id`.
4. Tính vùng sở hữu ngang từ các deadline lân cận.
5. Chọn họ đội hình theo số cá.
6. Sinh các điểm ứng viên xác định bằng hash ID; không dùng ngẫu nhiên runtime.
7. Uốn điểm theo đường nước và kiểm tra bounding box gồm thân cá, mã và biên độ chuyển động.
8. Đặt các deadline đông trước, rồi deadline thưa; kiểm tra va chạm toàn cục.
9. Nếu không đủ chỗ, thử lần lượt các mức tỷ lệ và chiều sâu lớn hơn.
10. Nếu vẫn vượt năng lực mỹ thuật, dùng lưới khẩn cấp trong đúng vùng deadline; không ném lỗi, không ẩn cá.

Kết quả không phụ thuộc thứ tự input. Cùng dữ liệu, ngày và phạm vi QA phải cho cùng đội hình sau khi tải lại.

## 7. Chuyển động sống nhưng có kiểm soát

Nút bấm và vùng focus đứng yên. Chỉ lớp thân cá bên trong chuyển động để deadline, hit target và kiểm tra va chạm không bị trôi.

Mỗi cá nhận một `motionProfile` xác định từ ID:

- lướt ngang nhẹ;
- nổi lên rồi hạ xuống;
- lượn chữ S nhỏ;
- nghiêng theo dòng nước;
- bám theo cá đầu đàn;
- trôi chậm ở đuôi đàn.

Giới hạn chung:

- biên độ ngang tối đa 4px;
- biên độ dọc tối đa 5px;
- góc xoay động tối đa 3°;
- chu kỳ 5,2–10,5 giây;
- độ trễ âm từ hash để đàn không bắt đầu đồng loạt.

Cá cùng đàn chia sẻ một pha nền, sau đó lệch pha nhỏ theo ID. Nhờ vậy đàn có nhịp chung nhưng không đập đều như máy.

Hover/focus tạm dừng chuyển động của cá đang thao tác và làm rõ mã. `prefers-reduced-motion: reduce` tắt toàn bộ chuyển động, giữ nguyên đội hình tĩnh và thông tin.

## 8. Khả năng đọc và truy vết

- Mỗi nút cá có vùng bấm tối thiểu 44×44px dù thân cá được thu nhỏ.
- Mã hồ sơ đi cùng thân cá trong cùng lớp chuyển động, không bị bỏ lại phía sau.
- Focus ring nằm trên vùng bấm đứng yên nên không rung.
- Thứ tự bàn phím là deadline, sau đó mã; không theo vị trí hình học.
- Tooltip và modal luôn hiển thị deadline thật từ dữ liệu.
- Không dùng màu, kích thước hoặc vị trí lệch làm nguồn duy nhất để kết luận trạng thái.

## 9. Mô phỏng mật độ

Mô phỏng nằm trong test harness, không thêm nút thử nghiệm vào giao diện production.

Các cảnh bắt buộc:

1. **Một đích đơn:** 1 cá.
2. **Đàn nhỏ:** 5 cá cùng deadline.
3. **Đàn vừa:** 12 cá cùng deadline.
4. **Đàn lớn:** 24 cá cùng deadline.
5. **Đàn cực đông:** 40 cá cùng deadline.
6. **Hai đích sát nhau:** 18 cá ngày A và 18 cá ngày B kế tiếp.
7. **Mùa cao điểm:** 120 cá rải trong 60 ngày, trong đó ít nhất ba deadline có trên 15 cá.
8. **Sự cố giới hạn:** 126 cá tập trung vào ba deadline, giữ hợp đồng không trắng màn.

Mỗi cảnh xuất được số liệu model và ảnh desktop; cảnh 40 cá cùng deadline có thêm ảnh mobile tự căn Hôm nay.

## 10. Tiêu chí chấp nhận

- Tất cả cá trong fixture đều xuất hiện; số nút cá bằng số hồ sơ hợp lệ trong cửa sổ.
- Mọi cá cùng ngày có cùng `deadlinePct` nhưng có đủ biến thiên `renderXPct`, `renderYPct`, tỷ lệ và góc.
- Không cặp bounding box nào chồng nhau sau khi cộng biên độ chuyển động.
- Không cá nào vượt vùng sở hữu deadline hoặc mép canvas.
- Đội hình 1/5/12/24/40 cá lần lượt có hình học khác nhau và đúng họ đội hình đã định.
- Hai deadline sát nhau không trộn đàn hoặc đảo thứ tự điểm neo.
- Fixture 120 và 126 cá không ném lỗi, không trả vị trí mặc định `(0, 0)` và không làm trang trắng.
- E2E desktop/mobile xác nhận mọi nút đạt 44×44px, click mở đúng hồ sơ và deadline.
- Reduced motion tắt animation nhưng không làm đổi tọa độ đội hình.
- Targeted unit, targeted E2E, typecheck và production build đạt.

## 11. Ngoài phạm vi

- Không đổi cửa sổ 60 ngày, nền V17, cổng Long Môn hoặc sprite sáu loài.
- Không đổi API, RPC, RLS, Supabase, quyền, dữ liệu nguồn hoặc công thức deadline.
- Không thêm chế độ gom cụm, badge thay cá, phân trang hoặc 3D.
- Không thêm điều khiển mô phỏng vào production.
- Không sửa chế độ Bảng ngoài việc bảo đảm cùng quần thể dữ liệu.
- Không push hoặc deploy trong bước thiết kế.

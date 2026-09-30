# Individual chart và Boxplot cho mỗi chỉ tiêu PQ

Người dùng đã bác bỏ giao diện f4e3cf2 và đưa thiết kế thay thế: Individual chart theo điểm trong một đợt, X=điểm lấy mẫu, Y=giá trị, đường ngang là giới hạn; Boxplot so sánh phân bố giữa các điểm để thấy phân tán/ngoại lai, áp dụng từng giá trị và biểu mẫu. Đây là thiết kế được người dùng chỉ định, không cần hỏi lại loại biểu đồ. Chi tiết triển khai được tối ưu trong phạm vi đó.

## Kết quả cần xem

Chọn hệ thống → một hồ sơ/phiên bản của một đợt → biểu mẫu → tất cả chỉ tiêu hoặc một chỉ tiêu → điểm. Mặc định biểu mẫu đầu tiên, tất cả chỉ tiêu trong biểu mẫu. Có lựa chọn tất cả biểu mẫu; mỗi nhóm form+metric+unit luôn tạo một cặp Individual/Boxplot riêng, không gộp đơn vị hoặc biểu mẫu khác nhau. Không chia biểu đồ theo từng điểm hoặc trộn các đợt.

Đầu trang ngắn; bộ lọc và tóm tắt một hàng. Mỗi chỉ tiêu có tiêu đề, đơn vị, tên đợt/phiên bản; hai biểu đồ hiển thị cùng lúc, xếp dọc để nhãn dễ đọc, nằm trong cùng một card. Individual plot dùng chấm cho từng lần đo và đường ngang giới hạn, không dùng cột; không suy ra thứ tự thời gian giữa các vị trí. Boxplot có một hộp cho mỗi điểm, Q1–Q3/trung vị/râu tới giá trị trong hàng rào1.5×IQR, kèm từng số đo gốc. Cùng thang Y và cùng thứ tự điểm trong một cặp để so sánh.

Đường giới hạn chung kéo ngang khi toàn bộ điểm có cùng giới hạn/direction được snapshot xác nhận. Khi ngưỡng khác nhau hoặc thiếu, chỉ vẽ đoạn ngang tại điểm có ngưỡng, ghi rõ giới hạn theo điểm; không mượn ngưỡng. Không tự tạo cận dưới0, UCL/LCL từ moving range hoặc thay ngưỡng PQ. Điểm vượt ngưỡng PQ dùng hình thoi đỏ; ngoại lai thống kê dùng vòng cam, có thể cùng xuất hiện trên một phép đo.

## Phép thống kê và dữ liệu ít

Boxplot là thống kê mô tả phía UI, không thay evaluator/kết luận/biểu mẫu/in của hồ sơ. Phương pháp hiển thị xác định: quartile tuyến tính type7 (`h=(n-1)p`), IQR=Q3−Q1, hàng ràoQ1−1.5IQR/Q3+1.5IQR; ngoại lai nằm ngoài hàng rào (đúng biên được giữ trong râu). Giữ mọi lần đo và trùng số; không lấy trung bình, không gộp vị trí/đợt/phiên bản. Chỉ dùng số hữu hạn không uncertain, ưu tiên giá trị chính xác từ annotate nếu có, nếu chưa có thì số đã lưu row.value vẫn được vẽ nhưng chưa kết luận PQ.

Một số đo: vẽ chấm và trung vị, ghi n=1/chưa có phân tán quan sát; không tạo chiều cao hộp giả hoặc báo ổn định. Hai/ba số: vẫn có số đo gốc, ghi ít mẫu; không khẳng định ngoại lai thống kê đồng nghĩa giá trị PQ không đạt. IQR0 xử lý đúng giá trị khác biệt; dữ liệu thiếu/chưa chắc chắn không đưa vào thống kê nhưng bảng giữ đủ nguồn và lý do. Với n=0, báo chưa có số đủ cơ sở để vẽ. Không có tiêu chí hoặc tải lỗi: vẫn xem số đã lưu; trạng thái PQ là chưa đối chiếu.

Nguồn: [NIST Box Plot](https://www.itl.nist.gov/div898/handbook/eda/section3/boxplot.htm); [R quantile type7](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/quantile.html). [NIST Variables Control Charts](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc32.htm) phân biệt specification/control limits; yêu cầu hiện tại là Individual plot với giới hạn đề cương, không thiết lập statistical control chart.

## Tương tác, lỗi và bảo toàn

Focus/chuột/chạm một phép đo hiển thị điểm/lần đo/giá trị/đơn vị/đối chiếu PQ và ngoại lai. Chọn/ẩn điểm áp dụng cho cả hai hình, bảng và tóm tắt vẫn đủ phạm vi đã lọc. Ẩn hết khác chưa có dữ liệu. Bảng chi tiết có số nguồn, số đã lưu, ngưỡng, đối chiếu PQ, ngoại lai thống kê và provenance. Bảng thống kê gồm n,Q1,trung vị,Q3,IQR,râu/số ngoại lai. Thu gọn bảng/nguồn, không thu gọn biểu đồ chính. Tất cả số tổng có nhãn phạm vi; thiếu tiêu chí không hiện0ngoàigiới hạn giả.

Desktop có chiều cao biểu đồ cố định khoảng340px, lưới nhẹ, chữ/tick đọc được, trục X dùng mã ngắn nằm ngang. Nhiều điểm và điện thoại chỉ cuộn vùng biểu đồ/bảng; trang không tràn. Sáng/tối dùng token VMP; phân biệt bằng ký hiệu và chữ, focus rõ, nút44px. Chỉ tiêu nhiều có thể chọn riêng để tập trung; toàn bộ vẫn xem được bằng bộ lọc.

Phần theo tháng không còn là vùng chính của task mới; giữ phần lịch sử qua đợt ở details riêng để không mất truy nguyên đã có. Không sửa tạo đợt, dữ liệu/quyền/Auth/database, PDF, role QA, source imports. Giữ server4173 và bản đã mở trong lúc thực hiện; sau verification thay artifact local theo yêu cầu xem-chốt đang có, không tự push/deploy. Không thao tác GUI mới ngoài phạm vi local review đã được user yêu cầu.

## Verification/review

Primary giữ kiến trúc, API/rendering và shared files tuần tự. Math module và unit là một task độc lập với API khóa trước; reviewer độc lập đọc final diff và bằng chứng. RED trước code: quartile/râu/ngoại lai/biên/n0-n1/IQR0/invalid/duplicates; UI phải có hai hình đúng kiểu mỗi metric, đúng scope, toàn bộ nguồn, chung thang, giới hạn ngang/từng điểm, số ít, keyboard/dark/mobile/axe. Rollback về f4e3cf2 UI trong local commit, không rollback DB. Source/built browser dùng fixture đầy đủ và chặn mạng ngoài, không ghi production. Typecheck/build/drift/budget và tests liên quan, cập nhật hai PROJECT-STATE và local preview receipt.

# Biểu đồ giá trị theo điểm trong một đợt lấy mẫu

Trạng thái: người dùng đã duyệt; đã triển khai local ngày08/10, chưa commit/push/deploy. Cột cho hai cỡ tiểu phân và độ dẫn điện, chấm cho điểm sương/độ khô/các chỉ tiêu khác; bảng min/max và số điểm theo từng chỉ tiêu. Bản đề xuất theo thời gian trước đây bị thay thế hoàn toàn.

## Phạm vi đã xác nhận

Người dùng chỉ cần điểm lấy mẫu và giá trị của từng điểm trong một đợt. Áp dụng khí nén và hơi tinh khiết. Mỗi biểu đồ thể hiện một chỉ tiêu với một đơn vị trong đúng hồ sơ/phiên bản đang chọn. Không xây dựng biểu đồ theo thời gian, không gộp các đợt.

## Thiết kế đề xuất

Chọn đợt lấy mẫu ở đầu trang. Các chỉ tiêu xếp lần lượt, mỗi chỉ tiêu một biểu đồ rộng toàn hàng. Có bộ lọc chỉ tiêu khi cần tập trung. Trục ngang là mã điểm lấy mẫu theo thứ tự tự nhiên; trục dọc là giá trị và đơn vị. Tên đầy đủ của điểm hiện khi chạm hoặc dùng bàn phím.

Với biểu đồ chấm, mỗi số đo là một chấm, các lần đo tại cùng điểm nằm cạnh nhau, giữ nguyên giá trị trên trục dọc. Hiện giá trị cạnh chấm khi đủ chỗ; khi nhiều số trùng hoặc quá sát, dùng nhãn nhóm rõ ràng và chi tiết chạm/bàn phím để đọc từng lần. Không nối các vị trí khác nhau thành đường mang hàm ý diễn biến theo thời gian. Một giá trị ở một điểm vẫn thể hiện đầy đủ.

Phương án cột nhóm dễ nhận biết độ lớn nhưng chiếm nhiều chỗ khi nhiều điểm/lần đo, và bắt buộc trục bắt đầu từ 0 nên có thể khó đọc các chỉ tiêu chênh lệch nhỏ. Dùng cột nhóm cho tiểu phân và độ dẫn điện như phương án người dùng đã chọn; dùng chấm khi giá trị âm hoặc chênh lệch nhỏ. Không dùng hai biểu đồ số đo/phân bố lặp lại mặc định; phân bố thống kê chỉ là nội dung phụ nếu giữ lại.

    Đợt lấy mẫu: [đợt đang chọn]       Chỉ tiêu: [Tất cả]

    TÊN CHỈ TIÊU                                      Đơn vị
    Giá trị
      │           ●          ●
      │    ●      ●                    ●
      │    ●                 ●         ●
      └──────────────────────────────────────
         Điểm 1  Điểm 2     Điểm 3    Điểm 4
                        Điểm lấy mẫu

Sơ đồ chỉ minh họa bố cục, không phải số liệu hoặc tiêu chí thực tế.

Nền sáng, tiêu đề xanh đậm, lưới ngang mảnh, chữ và giá trị dễ đọc. Số đo xanh; giới hạn PQ nét đứt có nhãn; số đo vượt giới hạn có hình thoi và mô tả, không dựa vào màu đơn thuần. Giới hạn lấy đúng snapshot từng điểm; không thay bằng cấu hình hiện tại. Các chỉ tiêu khác đơn vị có thang riêng. Không sửa công thức hoặc kết luận QA.

Trên tablet/mobile giữ cỡ chữ dễ đọc và cuộn bên trong biểu đồ khi quá nhiều điểm, không ép nhỏ cả hình. Tooltip dùng được bằng chạm, hover và bàn phím; bảng số liệu gốc mở được ngay dưới biểu đồ. Thiếu số khác 0; giá trị chưa chắc chắn giữ trong bảng và thông báo rõ. Đang tải/lỗi/không quyền/rỗng không được hiện như dữ liệu hợp lệ hoặc kết luận đạt.

## Ranh giới triển khai sau khi chốt thiết kế

Dùng SVG và adapter một đợt hiện có trong pq-charts.js, runs.js/runs.html và CSS liên quan. Không thêm thư viện hoặc sửa database/Auth/PDF/evaluator. Giữ khóa hồ sơ đóng, dữ liệu gốc, từng lần đo, tiêu chí snapshot và khả năng truy nguyên. Phần lịch sử không thuộc yêu cầu mới; không mở rộng hoặc xóa dữ liệu lịch sử.

Primary sửa tuần tự các file dùng chung. TDD cho các thay đổi hành vi cần thiết: không gộp hồ sơ/chỉ tiêu/đơn vị, đủ số đo trùng nhau, giữ số 0, thiếu số, giới hạn từng điểm và vượt giới hạn. Headless có dữ liệu nhiều điểm trên desktop/tablet/mobile, kiểm ảnh, tooltip bàn phím/chạm, zoom200%, sáng/tối. Unit liên quan, typecheck, build, drift và budget; reviewer độc lập rồi primary kiểm diff và rerun liên quan. Rollback bằng các asset UI của commit nền 9fa56c4. Trạng thái local/push/deploy phải ghi riêng.

## Nghiên cứu dùng cho thiết kế này

- ONS, Axes and gridlines: https://service-manual.ons.gov.uk/data-visualisation/guidance/axes-and-gridlines — thang trục phù hợp với dữ liệu; cột bắt đầu từ 0; chấm có thể dùng phạm vi tập trung hơn để đọc chênh lệch, vẫn giữ bối cảnh giới hạn.
- Mã hiện tại: pq-charts.js đã có nhóm theo form/metric/unit, các số đo theo điểm và giới hạn snapshot. Thiết kế mới tập trung làm biểu đồ một đợt rõ và gọn hơn, không thay bằng lịch sử theo thời gian.

Tự rà soát: không còn yêu cầu thời gian/small multiples theo điểm từ đề xuất cũ. Mỗi chỉ tiêu một biểu đồ, mỗi điểm là một vị trí trên trục ngang. Phần triển khai và bằng chứng mới nhất được ghi ở cuối tài liệu và PROJECT-STATE.

## Bản xem thử theo yêu cầu mới ngày 08/10

User yêu cầu thử trực quan và hỏi phương án ngoài biểu đồ chấm. Đã tạo prototype độc lập tại `output/playwright/point-chart-preview-20261008/index.html` tính từ root VMP. Có ba kiểu cột nhóm/chấm/đường theo điểm, cùng 18 số đo cho mỗi chỉ tiêu; chọn khí nén (tiểu phân, điểm sương) hoặc hơi (độ dẫn điện, độ khô). Tất cả số liệu và giới hạn là minh họa, không lấy từ hồ sơ thật. Ba ảnh PNG/SVG: so-sanh-khi-nen, so-sanh-hoi-tinh-khiet, so-sanh-do-kho.

Đề xuất bổ sung: cột nhóm phù hợp tiểu phân/độ dẫn điện khi số điểm vừa phải; chấm phù hợp số âm/chênh lệch nhỏ. Đường theo điểm chỉ phù hợp nếu thứ tự điểm có ý nghĩa theo tuyến, không được diễn giải thành thời gian. Người dùng chưa chọn kiểu cuối.

Verification: DOM thực thi với jsdom qua 4 chỉ tiêu × 3 kiểu, mỗi hình đủ18 số đo và số gốc giống nhau giữa ba kiểu; chuyển bộ chọn/kiểu và focus xem giá trị đạt, không jsdomError. SVG xuất từ chính renderer prototype, render PNG bằng Rsvg; đã xem ảnh khí nén và độ khô. Chromium bị môi trường chặn khởi chạy; không tuyên bố đã qua browser layout/responsive/E2E. Không sửa asset ứng dụng, push, DB hoặc deploy.

## Thiết kế đã được duyệt và bổ sung tổng kết

User chốt theo đề xuất và nhấn mạnh hai cỡ tiểu phân, yêu cầu bảng min–max kèm vị trí/số điểm đạt/không đạt cho mỗi biểu đồ. Triển khai cột tiểu phân p05/p5 riêng và độ dẫn điện; chấm điểm sương/độ khô/các chỉ tiêu khác. Mỗi bảng dùng đầy đủ phạm vi lọc của hồ sơ, không giảm số không đạt khi ẩn điểm. Mỗi điểm đếm một lần: có số ngoài giới hạn → không đạt; còn thiếu hoặc chưa so sánh được → chưa đủ đánh giá; chỉ đạt khi các số đo cần thiết đều đủ đối chiếu và trong giới hạn. Giữ riêng tiêu chí từng chỉ tiêu, không mượn kết luận tổng hợp của biểu mẫu. Min/max giữ tất cả vị trí đồng hạng và lần đo, không lấy ngưỡng làm extrema. Kế hoạch08/10point-charts-summary là tài liệu thực hiện; không cần hỏi lại phê duyệt thiết kế.

## Kết quả local

Đã triển khai theo yêu cầu đã duyệt. Bảng min/max hiển thị giá trị gốc, tất cả vị trí đồng hạng và lần đo; so sánh extrema dùng decimal chính xác. Mỗi điểm đếm một lần cho từng chỉ tiêu, không mượn kết luận từ chỉ tiêu khác; thiếu/chưa đối chiếu ghi riêng. Chọn riêng cỡ tiểu phân không tạo biểu đồ rỗng của cỡ còn lại. Phạm vi điểm chưa có số đo vẫn hiện bảng chưa đủ đánh giá khi chọn điểm đó; điểm nội độc tố không áp dụng trong snapshot không được thêm thành thiếu số. Tên vị trí lấy từ config snapshot, không đổi theo cấu hình mới.

37unit và13DOMcase đạt cảsource/candidatebuild;2HTMLpreview tự chứa đạt kiểm DOM. Typecheck/build/drift/budget đạt, review độc lập hết finding. Chưa browserE2E vì launch bịsandboxchặn; PNG là bản xuấtSVG/bảng thật bằngfixture, không phải screenshot. Chưa commit/push/productionapplied/deploy.

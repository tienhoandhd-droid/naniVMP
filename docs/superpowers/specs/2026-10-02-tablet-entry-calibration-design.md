# Nhập liệu trên tablet và hạn thiết bị theo đợt

Trạng thái: người dùng đã chốt và yêu cầu triển khai, push web ngày02/10/2026. Nguồn bắt đầu HEAD7a7b0ef, ứng dụng localb371d21; thực hiện theo kế hoạch tablet-entry-release.

## Nhu cầu đã rõ

Người dùng yêu cầu màn nhập dễ dùng hơn trên tablet và mỗi đợt chỉ ghi hạn hiệu chuẩn thiết bị đi kèm một lần. Giữ cách viết ngắn, tự nhiên bằng tiếng Việt. Áp dụng biểu mẫu khí nén, nitơ và hơi; không thay biểu đồ vừa giao.

## Hiện trạng đã kiểm tra

Kiểm headless bằng fixture có dữ liệu trên768×1024 và1024×768: không tràn ngang, nhưng ô số đầu tiên ởY1563–1818px. Điều hướng, chọn đợt, mô tả đợt, trạng thái, thanh thao tác và trợ giúp đẩy số đo quá xa phía dưới. Ảnh/số đo: .cpc1/tablet-entry-20261002/.

Hạn thiết bị đã được lưu trong calibration của đợt. Server tạo và kiểm hạn trong hồ sơ theo payload_path; entry-history.syncCalibration dùng thông tin đợt cho hồ sơ đang mở và không ghi đè hồ sơ đóng. UI vẫn lặp thông tin thiết bị và trường hạn chỉ đọc trong phần thiết bị ở biểu mẫu. Do đó hướng hiện tại là tận dụng quy tắc đã có, không thêm migration hoặc phát lại dữ liệu.

## Các phương án

| Hướng | Lợi ích | Hạn chế |
|---|---|---|
| Giữ trang dài, chỉ tăng nút/ô | Ít thay đổi | Vẫn phải cuộn qua nhiều khối trước khi nhập |
| Màn nhập theo điểm, thông tin đợt thu gọn | Chạm ít, thấy ngay điểm và số đo, phù hợp tablet | Cần sắp xếp lại vùng nhập và điều hướng |
| Bảng toàn bộ điểm như Excel | So sánh nhiều điểm nhanh | Bảng rộng, dễ chạm nhầm cột trên tablet |

Chọn hướng2. Chức năng dán Excel hiện có vẫn dành cho nhập nhiều dòng.

## Bố cục đề xuất

```text
Đợt tháng 10 · Khí nén                 [Đổi đợt]
BM01 — Tiểu phân                       [Biểu mẫu ▾]
Thiết bị của đợt · đã khai báo          [Xem ▾]

[Chọn điểm ▾]     P01 — Khu vực lấy mẫu
Giới hạn tại điểm / cảnh báo cần xử lý

Tiểu phân ≥ 0,5 µm       Tiểu phân ≥ 5,0 µm
[                     ] [                     ]
Người thực hiện         Ngày đo
[                     ] [                     ]

[Thông tin khác ▾]      [Dán bảng từ Excel]

Chưa lưu         [Điểm trước] [Điểm sau] [Tính] [Lưu hồ sơ]
```

- Tablet dọc: một vùng nhập chính, các ô phù hợp xếp hai cột. Điểm lấy mẫu mở từ nút chọn lớn có tìm kiếm; chỉ cuộn danh sách khi cần.
- Tablet ngang: danh sách điểm bên trái, vùng nhập bên phải nếu còn đủ chiều ngang cho ô. Nếu không đủ, dùng nút chọn điểm như dọc. Không cố giữ sidebar máy tính ở1024px làm vùng nhập hẹp.
- Tiêu đề 24–28px, chữ nhập16–18px, ô/nút chính tối thiểu48CSSpx và cách nhau8px trở lên. Đây là lựa chọn thiết kế của sản phẩm, không diễn giải là một chuẩn chung cho mọi nền tảng.
- Phần hơi giữ rõ Lần đo1/2/3 thành nhóm; không đổi dữ liệu hoặc thứ tự. Các trường tính từ biểu mẫu khác vẫn chỉ đọc. Nhãn và đơn vị luôn thấy cạnh ô.
- Thanh cuối giữ trạng thái lưu, chuyển điểm và thao tác Tính/Lưu; thao tác in/bản nháp đặt trong mục phụ. Thanh không che ô khi bật bàn phím hoặc phóng to; dùng bố cục thích ứng với phần màn hình còn nhìn thấy.
- Đổi điểm trong cùng hồ sơ giữ số chưa lưu; đổi đợt/hệ thống vẫn đi qua cảnh báo hiện tại. Không tự lưu, tự kết luận hay đổi chế độ đính chính. Khi phải chọn Tiếp tục/Thay đổi, các nút này ở gần phần số liệu.
- Bàn phím nhập thuận tiện cho số thập phân; phải kiểm cách nhập số âm (ví dụ điểm sương), số0 và dấu phẩy trên thiết bị. Không tự đoán đơn vị hoặc đổi chuỗi số.

## Hạn hiệu chuẩn: khai báo ở cấp đợt

1. Khi tạo đợt, nhập tên thiết bị và hạn vào mục “Thiết bị của đợt”. Mỗi mục thiết bị có hạn riêng theo yêu cầu máy chủ; không dùng một hạn chung cho mọi thiết bị.
2. Khi nhập các điểm/lần đo, hiển thị tóm tắt “Thiết bị của đợt · đã khai báo”; mở ra xem tên và hạn. Bỏ các ô nhập hạn lặp trong biểu mẫu khi đường dẫn đó đã thuộc thông tin đợt. Các thông tin thiết bị khác như tình trạng, mã hoặc thông số đo vẫn giữ nếu biểu mẫu yêu cầu.
3. Hồ sơ tiếp tục nhận đúng hạn đã lưu cho đợt theo cơ chế đang có. Không hỏi lại hạn khi đổi điểm, đổi lần đo, đổi biểu mẫu hay mở lại đợt đó. Đợt mới có bộ thông tin riêng; không tự lấy hạn của đợt trước.
4. Nếu cần sửa tên/hạn, vào phần Thiết bị của đợt, kiểm quyền, nhập lý do và lưu bằng luồng cập nhật đợt hiện hành. Form đang mở với thông tin cũ không được lưu âm thầm; giữ dữ liệu đo và yêu cầu tải đúng thông tin mới theo cơ chế hiện tại.
5. Vẫn cảnh báo khi ngày đo sau hạn thiết bị. Tách rõ “Hạn hiệu chuẩn” và “Hạn dùng”; không đổi nghĩa của trường hạn dùng.
6. Hồ sơ đã đóng chỉ hiển thị thông tin đã chốt; thiếu thông tin cũ thì báo thiếu, không tự điền hoặc đồng bộ lại từ đợt khác. Không tự gộp hai thiết bị chỉ vì tên giống nhau.

## Trạng thái màn hình

- Chưa chọn đợt: nút chọn đợt rõ, vùng nhập khóa.
- Đang tải: thông báo gọn ngay tại vùng nhập, không hiện ô có thể sửa trước khi đúng hồ sơ tải xong.
- Đang nhập: “Chưa lưu” gần nút Lưu; không gọi số ô có dữ liệu là phần trăm hoàn thành hồ sơ.
- Lưu thành công: xác nhận từ server rồi mới hiện “Đã lưu”.
- Lỗi lưu/mất mạng: giữ số đang nhập và nút thử lại; không hứa lưu offline.
- Không có quyền/đợt đóng: chỉ đọc, giữ khả năng xem thông tin và in đúng quyền.
- Thiết bị quá hạn hoặc dữ liệu sai: cảnh báo luôn hiện, không bị giấu cùng thông tin phụ.

## Ranh giới triển khai

Dùng cấu trúc hiện có trong gas/app, run-entry, entry-tools và CSS riêng màn nhập; runs chỉ chỉnh vị trí/nhãn phần thiết bị nếu cần. Module trình bày tablet chỉ quản lý bố cục/chọn điểm, adapter hiện có tiếp tục sở hữu dữ liệu/lưu/tính. Không đổi database/Auth/RPC/evaluator/criteria/PDF. Không tạo thêm kho danh mục thiết bị hay tự gộp thiết bị dùng ở nhiều biểu mẫu trong lượt này.

Tệp chung và adapter sửa tuần tự. Có review độc lập cho cách dùng thông tin đợt và thao tác lưu; người phụ trách kiểm lại mọi diff. Giữ gói Desktop02/10 b371d21 để quay lại.

## Kiểm chứng trước bàn giao

- RED/GREEN cho đường dẫn hạn đã khai báo: tạo đợt→vào biểu mẫu→đổi điểm/lần đo→reload vẫn dùng đúng hạn, không có ô hạn cần nhập lại; những trường không thuộc thông tin đợt không bị mất.
- Tablet768×1024,820×1180,1024×768,1180×820; thêm390px vàdesktop1440px để tránh ảnh hưởng cũ. Mục tiêu ở trường hợp bình thường sau mở đợt: thấy ô số đầu tiên trong màn hình đầu, không tính thanh cảnh báo dài đang cần xử lý.
- Nhập→đổi điểm→tính→lưu→reload; dánExcel; cảnh báo số chưa lưu; tiếp tục/đính chính/hếtphiên/thuhồiquyền/lưu lỗi giữ nguyên dữ liệu.
- Ngày đo sau hạn vẫn cảnh báo; hạn dùng khác hiệu chuẩn; hồ sơ đóng giữ nguyên snapshot; đợt khác không nhận nhầm hạn.
- Headless chạm, focus, ngang/dọc, mô phỏng giảm vùng nhìn khi bàn phím mở vàzoom200%; không coi mô phỏng là đã thử bàn phím vật lý của tablet thật.
- Unit/E2E đúng phạm vi, typecheck/build và ngân sách; review ảnh và diff trước cập nhật local. Không mở GUI, không ghi thử production.

## Checklist thiết kế

- [x] Đọc trạng thái và mã nguồn đúng worktree.
- [x] Đối chiếu lưu hạn cấp đợt ở client và server.
- [x] Đo và xem bố cục hiện tại bằng dữ liệu thử trên tablet.
- [x] So sánh các hướng và viết bố cục cụ thể.
- [x] Tự rà soát phạm vi, nguồn dữ liệu và điều kiện nghiệm thu.
- [x] Người dùng chốt thiết kế và yêu cầu nâng cấp, push web ngày02/10/2026.
- [x] Đã lập kế hoạch tablet-entry-release; triển khai theo yêu cầu.

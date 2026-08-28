# Tăng tốc màn “Việc hôm nay”

Ngày chốt: 2026-08-28

## Mục tiêu

Màn “Việc hôm nay” phải hiện ổn định khi mở lần đầu, khi chuyển từ màn khác
và khi quay lại tab trình duyệt. Lỗi kiểm tra quyền nền không được giả thành
trạng thái “Không còn việc gấp nào”. Luật chọn việc, phạm vi dữ liệu và quyền
ghi không thay đổi.

## Bằng chứng hiện trạng

- `TodayCommandCenter` là màn mặc định nhưng đang nằm trong chunk lazy riêng,
  nén khoảng 2,6 KB. Đường tải chunk có thể chậm và có thể 404 khi một tab cũ
  sống qua lần deploy mới.
- Khi tab trình duyệt hiện lại, cả `focus` và `visibilitychange` cùng gọi
  `silentRefresh`. Phép đo hiện tại ghi hai lượt `item_permissions_mode` và
  hai lượt watermark cho một lần quay lại tab.
- Nếu lượt xác minh mode nền trả payload lỗi, `silentRefresh` xóa dữ liệu để
  giữ fail-closed nhưng không chuyển `conn` sang lỗi. E2E tái hiện được 3 dòng
  việc biến thành 0 dòng và màn báo sai “Không còn việc gấp nào”.
- Với 461 hạng mục trên thiết bị di động giả lập chậm 6 lần, lần dựng hiện tại
  mất khoảng 574 ms. Thử `content-visibility: auto` giảm còn khoảng 300–370 ms
  mà vẫn giữ đủ 461 dòng trong DOM.

## Thiết kế được duyệt

### 1. Màn mặc định tải cùng shell

`TodayCommandCenter` chuyển từ dynamic import sang static import trong
`App.tsx`. Các màn lớn khác tiếp tục lazy-load. Việc này bỏ một vòng mạng khỏi
màn đầu tiên và loại riêng “Việc hôm nay” khỏi lỗi stale lazy chunk sau deploy.

### 2. Một lượt refresh cho một lần tab hiện lại

Tạo controller nhỏ, thuần TypeScript, nhận `isVisible`, `refresh`, đồng hồ và
khoảng gộp. Controller bỏ qua sự kiện khi tab ẩn, khi một refresh đang chạy,
hoặc khi `focus` và `visibilitychange` đến trong cùng cửa sổ 1 giây. Sau khi
refresh kết thúc và qua cửa sổ gộp, lần quay lại tiếp theo vẫn làm mới bình
thường.

Controller chỉ điều phối lượt gọi; nó không cache quyền, không bỏ qua lần quay
lại sau này và không thay đổi quy tắc fail-closed.

### 3. Lỗi nền phải hiện đúng

Nếu `silentRefresh` không xác minh được mode/quyền, dữ liệu bảo vệ vẫn bị thu
hồi như hiện tại. Đồng thời `conn.status` chuyển thành `err` với thông báo rằng
không xác minh được quyền và người dùng cần “Thử lại”. `TodayCommandCenter`
nhận `state="error"`, vì vậy không còn hiển thị sai trạng thái rỗng.

Một lượt tải lại thành công dùng đường `reloadData` hiện có và phục hồi trạng
thái `ok`; không tạo cơ chế retry nền vô hạn.

### 4. Giảm layout/paint danh sách dài

Mỗi `.hn-muc` dùng `content-visibility: auto` để trình duyệt bỏ layout/paint
chi tiết ngoài viewport nhưng vẫn giữ toàn bộ dòng, thứ tự, nội dung và khả
năng cuộn. `contain-intrinsic-size` dùng 44 px trên desktop và 124 px trên
mobile; cộng padding/gap hiện có, chiều cao ước lượng gần số đo thật nên hạn
chế nhảy thanh cuộn.

`buildTodayModel` được bọc `useMemo` theo `acts` và `now`, tránh tính lại khi
người dùng chỉ chọn một dòng trong supporting pane. Không đổi thuật toán hoặc
kết quả mô hình.

## Kiểm thử

- Unit test controller: tab ẩn không refresh; cặp focus/visibility chỉ refresh
  một lần; sự kiện trong lúc đang chạy không tạo request mới; lượt hợp lệ sau
  khoảng gộp vẫn chạy.
- E2E với 461 hạng mục trên desktop và mobile: mở từ màn khác, đủ dữ liệu, có
  `content-visibility`, cuộn tới dòng cuối và mở lại màn không treo.
- E2E focus/visibility: một lần quay lại tab chỉ phát một lượt kiểm quyền.
- E2E lỗi mode tạm thời: dữ liệu bị thu hồi, màn hiện lỗi và nút “Thử lại”,
  không hiện “Không còn việc gấp nào”.
- Build contract: mở thẳng “Việc hôm nay” không tải resource chunk
  `TodayCommandCenter-*`; các lazy chunk khác vẫn hoạt động.
- Chạy typecheck, unit hiện có, E2E cốt lõi và build production trước bàn giao.

## Phạm vi không đổi

- Không sửa RPC, migration, luật quyền, phân công hoặc dữ liệu production.
- Không cắt bớt hay phân trang danh sách việc.
- Không đổi giao diện, câu chữ nghiệp vụ hay điều hướng sang Cập nhật tiến độ.

## Rollback

Toàn bộ thay đổi là frontend và test. Có thể rollback một commit mà không cần
rollback cơ sở dữ liệu hay dọn dữ liệu người dùng.

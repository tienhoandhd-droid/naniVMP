# Hàng đợi hành động “Việc hôm nay” và hiệu năng

Ngày chốt: 2026-08-28

Tài liệu này thay thế phạm vi của
`2026-08-28-today-load-performance-design.md`: giữ nguyên các quyết định hiệu
năng đã duyệt và bổ sung thiết kế hàng đợi hành động. Kế hoạch triển khai cũ
chỉ cho hiệu năng không còn là nguồn yêu cầu sau khi tài liệu này được duyệt.

## Bối cảnh

Màn “Việc hôm nay” hiện lấy hạng mục năm hiện tại từ
`rpc_get_vmp_dashboard`, đi qua quyền đọc và các bộ lọc toàn cục, rồi chia
thành ba nhóm: quá hạn, tới hạn trong 7 ngày và hồ sơ chưa đủ. Cách này khiến
màn giống một bảng cảnh báo hơn là hàng đợi hành động:

- một hạng mục chỉ giữ được một nguyên nhân, nên việc vừa quá hạn vừa chưa
  phân công bị hạ thành lỗi hồ sơ;
- “Làm trước tiên” chỉ dựa vào ngày trễ, không xét trọng yếu hoặc khả năng xử
  lý của người đang đăng nhập;
- bộ lọc “Việc của tôi” đối chiếu tên hiển thị dù dữ liệu đã có `person_id`;
- bộ lọc kỳ dùng `target` có thể loại chính hạng mục thiếu lịch;
- CTA có thể mất đích vì Today truyền một mã nhưng Progress kiểm quyền bằng
  khóa khác;
- trên khổ dưới 1600 px, bấm tên dòng không tạo phản hồi nhìn thấy được;
- lỗi refresh nền có thể bị trình bày sai thành danh sách rỗng;
- màn mặc định còn phụ thuộc lazy chunk và dựng toàn bộ danh sách dài.

## Mục tiêu

Trong 10 giây đầu sau khi mở màn, người dùng phải biết:

1. việc nào cần được xử lý trước;
2. vì sao việc đó xuất hiện;
3. ai đang chịu trách nhiệm và giai đoạn nào đang chặn;
4. họ có thể cập nhật ngay hay chỉ xem/escalate;
5. dữ liệu và quyền có đang được xác minh thành công hay không.

Màn vẫn giữ tên “Việc hôm nay”, nhưng câu mô tả phải nói rõ đây là hàng đợi
hành động gồm việc quá hạn, việc hôm nay, 7 ngày tới và dữ liệu cần hoàn thiện.

## Phương án được chọn

### A. Chỉ đổi nhãn và bố cục

Nhanh, ít rủi ro nhưng giữ nguyên sai lệch ưu tiên, định danh và quyền. Không
đáp ứng mục tiêu.

### B. Tạo RPC Today chuyên dụng

Đưa toàn bộ xếp hạng về server, đồng nhất được với workflow cảnh báo nhưng
phải thêm migration/RPC và phối hợp phát hành database. Quá lớn cho vấn đề có
thể giải bằng dữ liệu đã trả về.

### C. Hàng đợi hành động frontend trên dữ liệu và quyền hiện có — chọn

Tách model thuần để kết hợp deadline, chất lượng dữ liệu, trọng yếu, người phụ
trách và quyền tiến độ. Không thêm migration; rollback thuần frontend; dễ khóa
bằng unit/E2E. RPC hiện có vẫn là nguồn chân lý cho dữ liệu nhìn thấy và quyền
cập nhật.

## Phạm vi dữ liệu

### Nguồn và quyền đọc

- Giữ `rpc_get_vmp_dashboard` cho năm hiện tại và `p_include_missing=false`.
- Giữ cơ chế xác minh phiên, `item_permissions_mode`, snapshot preview và
  fail-closed enforced hiện có.
- Today chỉ nhận hạng mục mà RPC/quyền đọc đã cho phép nhìn thấy.
- Không thêm fallback hoặc cache quyền mới.

### Phạm vi bộ lọc

- Today tiếp tục nhận bộ lọc bộ phận và khu vực.
- Today không áp bộ lọc kỳ `target` của shell. Chính model Today quyết định
  “quá hạn / hôm nay / 7 ngày tới”; một kỳ tháng/quý được nhớ từ màn khác
  không được che việc thiếu lịch hoặc quá hạn.
- Khi `view === "today"`, scope label không ghi kỳ thời gian và control kỳ
  được disabled/giải thích: “Việc hôm nay tự dùng cửa sổ 7 ngày”.
- “Việc của tôi” chỉ đối chiếu `currentPersonId` với `ownerPersonId` hoặc
  `supportPersonId`, kể cả giá trị nằm trong `_raw`. Không fallback sang tên.
- `AppUser` nhận `personId` từ dòng `vmp_performers` đang hoạt động được nối
  với `auth.uid()`. Nếu chưa nối được người, toggle “Việc của tôi” bị disabled
  và giải thích rõ; không âm thầm trả danh sách sai hoặc rỗng.

## Model hành động

### Hình dạng một dòng

`TodayActionRow` có một định danh duy nhất là `validationCode`, đồng nhất với
khóa của `rpc_my_editable_progress_rights`, cùng các trường:

- `title`, `department`, `ownerName`, `criticality`, `criticalityScore`;
- `blockingStage`: giai đoạn chưa hoàn thành đầu tiên;
- `deadlineStage`: giai đoạn có deadline đang dùng để cảnh báo, có thể khác
  `blockingStage`;
- `daysRemaining` cho deadline đó;
- `reasons`: một hoặc nhiều lý do có cấu trúc;
- `section`: đúng một nhóm hiển thị;
- `canEditProgress`, `editableFields`, `permissionReason`.

Không dùng `activity.id` và `validationCode` lẫn lộn. Adapter/model chuẩn hóa
khóa một lần ở biên; Progress và Today cùng tra quyền bằng `validationCode`.

### Lý do có thể cùng tồn tại

- `overdue`: deadline đã qua;
- `due_today`: deadline là hôm nay;
- `due_7d`: deadline còn 1–7 ngày;
- `missing_owner`: thiếu QA phụ trách chính tắc;
- `missing_actual_completion`: đã xong nhưng thiếu ngày VMP thực tế;
- `missing_schedule`: giai đoạn đang chặn chưa có deadline.

Một hạng mục vừa trễ vừa thiếu người giữ cả hai badge. Thiếu dữ liệu không
được xóa hoặc hạ mức cảnh báo deadline.

### Giai đoạn và deadline

- `blockingStage` luôn là giai đoạn chưa hoàn thành đầu tiên theo thứ tự Đề
  cương → Thẩm định → Báo cáo → Đích VMP.
- Nếu giai đoạn đang chặn chưa có hạn nhưng giai đoạn sau có hạn,
  `deadlineStage` là giai đoạn sau. UI phải ghi đủ hai ý, ví dụ:
  “Đang chờ Đề cương · mốc Thẩm định trễ 4 ngày”.
- Hạng mục active chưa có bất kỳ deadline nào xuất hiện trong “Hoàn thiện dữ
  liệu”, không bị gọi là quá hạn.
- Hạng mục hoàn thành đầy đủ, cancelled hoặc not_applicable không xuất hiện.

### Nhóm hiển thị

Mỗi dòng chỉ xuất hiện một lần:

1. **Quá hạn** — có reason `overdue`.
2. **Cần làm hôm nay** — có reason `due_today` và không quá hạn.
3. **Chuẩn bị trong 7 ngày** — có reason `due_7d` và không thuộc hai nhóm trên.
4. **Hoàn thiện dữ liệu** — chỉ còn các reason dữ liệu.

Ba KPI đầu màn đếm “Quá hạn”, “Hôm nay”, “7 ngày tới”; KPI thứ tư đếm số
hạng mục có bất kỳ lỗi dữ liệu nào, kể cả chúng đang nằm ở nhóm deadline.

### Thứ tự ưu tiên

Xếp bằng tuple minh bạch, không tạo điểm số khó giải thích:

1. mức khẩn cấp của nhóm theo thứ tự trên;
2. `criticalityScore` giảm dần, thiếu điểm đứng cuối;
3. có quyền cập nhật tiến độ đứng trước trong cùng mức;
4. ngày còn lại tăng dần; trong quá hạn, số âm nhỏ hơn đứng trước;
5. `validationCode` theo thứ tự tiếng Việt để kết quả ổn định.

“Làm trước tiên” là dòng đầu của thứ tự này và phải hiển thị lý do chọn, ví
dụ: “Quá hạn 12 ngày · trọng yếu 9 · bạn có thể cập nhật”.

## Quyền hành động

- Today dùng `fetchMyEditableProgressRights()` và parser fail-closed hiện có.
- Dữ liệu Today được phép hiện ngay khi quyền hành động đang tải; CTA tạm
  disabled với nhãn “Đang kiểm tra quyền…”. Không che cả danh sách.
- Có quyền: CTA “Cập nhật tiến độ”, chuyển bằng `validationCode` và giữ lý do
  nguồn Today.
- Không có quyền: CTA không giả khả năng sửa; dùng “Xem chi tiết” để mở phần
  giải thích tại chỗ, gồm người phụ trách và lý do quyền nếu có.
- Lỗi tải quyền: giữ dữ liệu đọc được nhưng tất cả mutation CTA fail-closed;
  hiện cảnh báo “Chưa xác minh được quyền cập nhật” và nút thử lại quyền.
- Progress nhận deep link có `validationCode`, `source` và reasons. Nó xóa bộ
  lọc cục bộ, focus đúng mã khi quyền hợp lệ; nếu quyền đã bị thu hồi thì
  hiện thông báo cụ thể thay vì im lặng.

## Giao diện

### Đầu màn

- Mô tả ngắn phạm vi bộ phận/khu vực và cửa sổ mặc định.
- Bốn KPI như trên.
- Dải “Làm trước tiên” nêu mã, tên, lý do chọn và CTA đúng quyền.

### Dòng công việc

Mỗi dòng luôn hiện:

- mã và tên đầy đủ;
- badge tất cả lý do;
- giai đoạn đang chặn và deadline cảnh báo;
- QA phụ trách, bộ phận và mức trọng yếu;
- CTA theo quyền.

Trên desktop rộng, supporting pane tiếp tục dùng được. Trên laptop/mobile,
bấm dòng mở accordion inline; không còn control chọn mà không có phản hồi.
Không cắt bớt, phân trang hay ảo hóa danh sách.

### Trạng thái rỗng và lỗi

- Empty chỉ xuất hiện khi dữ liệu đã tải thành công và model không có dòng.
- Lỗi dữ liệu/quyền đọc hiển thị StateBoundary lỗi cùng “Thử lại”; không được
  giả thành “Không có việc cần xử lý”.
- Lỗi quyền cập nhật là warning riêng, không xóa dữ liệu được phép xem.
- Khi bộ lọc bộ phận/khu vực tạo rỗng, empty state nói rõ phạm vi và có nút
  xóa bộ lọc.

## Hiệu năng

### Tải màn

- `TodayCommandCenter` chuyển từ dynamic import sang static import trong
  `App.tsx`; các màn lớn khác vẫn lazy-load.
- Build không sinh resource chunk `TodayCommandCenter-*` khi mở/chuyển màn.

### Refresh

- Dùng `createVisibleRefreshController` đã có để gộp cặp `focus` và
  `visibilitychange` thành một `silentRefresh` trong cửa sổ 1 giây.
- Bỏ qua khi tab ẩn hoặc request đang chạy; sau khi hoàn tất và qua cửa sổ
  gộp, lượt quay lại sau vẫn refresh.
- Quyền hành động dùng cùng nguyên tắc generation/latest-wins và gộp sự kiện;
  không để response cũ ghi đè quyền mới.
- Catch của `silentRefresh` thu hồi dữ liệu bảo vệ và đặt `conn.status="err"`
  với thông báo có thể retry.

### Render

- `buildTodayActionModel` được `useMemo` theo `acts`, quyền, person và mốc ngày
  ổn định; chọn/mở một dòng không tính lại toàn bộ model.
- Mỗi `.hn-muc` dùng `content-visibility:auto` và
  `contain-intrinsic-size:auto 44px`; mobile dùng 124 px.
- Giữ đủ mọi dòng trong DOM, thứ tự và khả năng cuộn; không đổi nghiệp vụ để
  đổi lấy benchmark.

## Kiểm thử

### Unit

- một dòng giữ đồng thời overdue + missing_owner;
- deadline reason không đổi `blockingStage`;
- nhóm duy nhất và KPI data-quality không đếm trùng;
- tuple priority: urgency → criticality → editability → days → code;
- “Việc của tôi” chỉ dùng person ID, không dùng tên;
- validationCode thống nhất với rights map/deep link;
- controller gộp focus/visibility, in-flight, lỗi và lượt hợp lệ tiếp theo.

### Component/contract

- CTA loading/editable/read-only/error theo đúng trạng thái quyền;
- accordion có phản hồi dưới 1600 px và supporting pane hoạt động trên màn
  rộng;
- lỗi dữ liệu không render false-empty;
- bộ lọc thời gian shell không cắt tập Today.

### E2E

- 461 hạng mục trên mobile: đủ dòng, cuộn cuối, intrinsic size đúng;
- chuyển từ màn khác không tải Today chunk và hoàn tất dưới 2,5 giây;
- một lần quay lại tab chỉ có một lượt kiểm mode;
- lỗi mode thu hồi dữ liệu, hiện lỗi + Thử lại; retry phục hồi dữ liệu;
- một dòng đa lý do có đúng nhóm, badge, thông tin và CTA;
- deep link focus đúng `validationCode`; quyền bị thu hồi báo rõ;
- strict fixture không gọi mạng ngoài.

### Hồi quy cuối

- typecheck;
- toàn bộ unit suite;
- build production;
- E2E Today, luồng giả lập cốt lõi, quyền tiến độ và accessibility liên quan.

## Phạm vi không đổi

- Không thêm migration, RPC hoặc thay đổi dữ liệu production.
- Không đổi luật RLS/quyền server hay tự suy quyền từ vai frontend.
- Không phân trang, cắt dòng hoặc ảo hóa danh sách Today.
- Không đổi thuật toán timeline của các màn khác.
- Không deploy, push hoặc merge nếu chưa có yêu cầu riêng.

## Rollback

Các thay đổi mới đều frontend/test. Có thể revert các commit sau design này
mà không rollback database hay dọn dữ liệu. Controller hiệu năng đã commit
trước đó vẫn là module độc lập; nếu integration gây lỗi có thể revert integration
mà không ảnh hưởng nguồn dữ liệu/quyền.

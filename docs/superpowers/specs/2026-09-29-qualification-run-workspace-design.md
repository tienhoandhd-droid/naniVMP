# Điều hướng VMP và nhập thẩm định theo đợt

Ngày: 29/09/2026. Trạng thái: người dùng đã đồng ý triển khai ngày 29/09/2026, gồm hạn theo từng thiết bị.
Nền: `12a81a1cb2984a2b2194e089c18eebe9db417e9e`, source `MA-NGUON-HIEN-TAI`.

## Nhu cầu và phạm vi

1. Đưa nhóm Thẩm định thực tế lên trước Phân tích & quản trị.
2. Bỏ mục Thư viện biểu mẫu khỏi luồng điều hướng; mở từng hệ thống để thấy BM kèm tên tiếng Việt và sơ đồ xu hướng riêng.
3. Tạo/chọn đợt trước khi nhập. Tên đợt và thông tin hạn hiệu chuẩn bắt buộc; mở lại cùng đợt để nhập nhiều ngày.
4. Cảnh báo khi tiếp tục nhập điểm đã có dữ liệu, giữ toàn bộ phiên bản và có lịch sử xem được.
5. Làm thanh điều hướng và các tiêu đề nhóm rõ, nổi hơn tổng thể.
6. Yêu cầu bổ sung: chữ VMP cách điệu thống nhất trên mọi tab, lấy Tổng quan VMP làm mẫu.

Không đổi công thức, tiêu chí, đơn vị, mẫu in hoặc số lần đo của biểu mẫu. Không đổi quyền PQ: khí nén HT-12, nitơ HT-13, hơi HT-14 hoặc HT-15. Hồ sơ đã đóng chỉ xem/in. Không chạy lại migration cũ, import, effort_days hoặc restart Supabase. Không sửa phân công nhân sự.

## Hướng thiết kế được đề xuất

Chọn menu hệ thống có thể mở/thu gọn, đi thẳng tới biểu mẫu; ô chọn đợt nằm cố định phía trên nội dung. Đây là cách bám sát thao tác người dùng đã yêu cầu và vẫn nhanh khi làm liên tục nhiều ngày.

Hai phương án đã cân nhắc:
- Wizard bắt buộc đi qua từng bước mỗi lần mở biểu mẫu: dễ hướng dẫn lần đầu nhưng thêm thao tác khi quay lại hàng ngày.
- Giữ toàn bộ biểu mẫu/biểu đồ ở một màn chung với nhiều bộ lọc: thay đổi ít hơn nhưng không giải quyết yêu cầu tách rõ từng hệ thống.

### Cây điều hướng

```text
THỰC HIỆN
  Các mục VMP hiện có
GIÁM SÁT
  Các mục VMP hiện có
THẨM ĐỊNH THỰC TẾ
  Đợt thẩm định
  Hơi tinh khiết ▾
    BM01 — Khí không ngưng tụ
    BM02 — Chất lượng nước ngưng
    BM03 — Độ khô
    BM04 — Quá nhiệt
    BM05 — Báo cáo tổng hợp
    Sơ đồ xu hướng hơi tinh khiết
  Khí nén ▾
    BM01 — Tiểu phân
    BM02 — Điểm sương
    BM03 — Vết dầu
    BM04 — Vi sinh vật
    BM05 — Tổng hợp chất lượng
    BM06 — Giới hạn cảnh báo và hành động
    Sơ đồ xu hướng khí nén
  Khí nitơ ▾
    BM01 — Tiểu phân
    BM02 — Điểm sương
    BM03 — Vết dầu
    BM04 — Vi sinh vật
    BM05 — Độ tinh khiết
    BM06 — Tổng hợp chất lượng
    BM07 — Giới hạn cảnh báo và hành động
    Sơ đồ xu hướng khí nitơ
PHÂN TÍCH & QUẢN TRỊ
  Các mục VMP hiện có
```

Nhãn lấy từ cấu hình hiện có. BM về giới hạn vẫn là biểu mẫu chính thức có nội dung và bản in hiện hành; mục Sơ đồ xu hướng là màn xem dữ liệu đã lưu, không thay thế hay xóa BM đó. Chỉ hiện biểu mẫu trong phạm vi quyền và đợt đã chọn. Các nhóm không có quyền tiếp tục bị ẩn; server vẫn quyết định quyền thật.

“Bỏ thư viện” nghĩa là bỏ mục/menu/trang danh mục trung gian. Link cũ `index.html` chuyển tới Đợt thẩm định, không xóa các mẫu PDF hoặc hồ sơ lưu trữ. Link cũ tới biểu mẫu vẫn tới đúng hệ thống/BM nhưng phải chọn đợt nếu thiếu ngữ cảnh.

### Hình thức điều hướng và thương hiệu

- Giữ phong cách Lotus và bộ màu VMP. Thanh điều hướng dùng nền mận đậm hơn vùng nội dung; chữ/icon tương phản cao. Mục đang chọn có nền nhấn và vạch chỉ thị, không phụ thuộc màu duy nhất.
- Các tiêu đề THỰC HIỆN, GIÁM SÁT, THẨM ĐỊNH THỰC TẾ, PHÂN TÍCH & QUẢN TRỊ có dải nền riêng, chữ đậm/cỡ rõ hơn mục con, khoảng cách nhóm dễ nhận biết.
- Menu hệ thống là nút mở/thu có aria-expanded; tên biểu mẫu là link riêng có trạng thái hiện hành. Giữ điều hướng bàn phím, focus, mobile drawer và cảnh báo khi rời dữ liệu chưa lưu. Không đóng drawer khi chỉ mở nhóm.
- Tái sử dụng chính wordmark VMP Monitor, nét sen và dòng phụ của Tổng quan VMP. Hiển thị một lần ở đầu mọi tab của VMP, kể cả nội dung thẩm định nhúng; không nhân đôi với header trong iframe. Màn hẹp dùng cùng hình thức ở cỡ phù hợp. Giữ tên trang riêng ở dưới; không thay mọi chữ VMP trong nội dung bằng logo.
- Luồng đăng nhập/khôi phục không phải tab công việc nhưng phần thương hiệu cũng dùng cùng wordmark, không lặp hai logo hoặc đổi chức năng Auth. Không sửa thương hiệu trên PDF/XLSX/mẫu in.

### Đợt thẩm định và thiết bị

Màn Đợt thẩm định có danh sách đang thực hiện/đã kết thúc và nút Tạo đợt. Giữ ngày bắt đầu, phạm vi hệ thống, lựa chọn phạm vi đầy đủ hoặc biểu mẫu/điểm riêng đang có.

Tên đợt bắt buộc, trim khoảng trắng, 1–200 ký tự. Trước khi nhập số phải hoàn tất các ngày hạn cần thiết cho thiết bị dùng trong phạm vi đã chọn. Ngày phải hợp lệ; lỗi hiển thị tại trường và trong tóm tắt có thể focus.

**Đã được người dùng đồng ý:** lưu hạn theo từng thiết bị/biểu mẫu thay vì một ngày chung cho cả đợt. Lý do: cấu hình hiện tại có máy đo tiểu phân, điểm sương, vi sinh, độ tinh khiết; hơi có cân/nhiệt kế. Chúng có thể khác hạn. Mã/seri và tình trạng giữ theo các trường hiện có. Không bắt thiết bị không thuộc phạm vi.

Vết dầu đang dùng trường “Hạn dùng”, không đổi nó thành “Hạn hiệu chuẩn”. Cảnh báo quá hạn dựa vào ngày đo và thông tin đã khai báo; không tự đặt tiêu chí đạt/không đạt mới hoặc thay SOP. Kiểm tra bắt buộc ngày hiệu chuẩn khác với kết luận chất lượng phép thử.

Thông tin thiết bị ở đầu đợt được đưa tới đúng các trường tương ứng của biểu mẫu để tránh nhập lặp. Nếu cần đổi thiết bị trong đợt, phải lưu một mốc thay đổi có người/thời gian, giữ metadata cũ gắn với phiên bản trước. Không cập nhật ngược lịch sử.

### Trước khi nhập biểu mẫu

```text
VMP cách điệu                         [Tên trang]
Đợt thẩm định * [Chọn đợt…] [Tạo đợt]
Tên đợt · Hệ thống · Trạng thái · Thiết bị / hạn
BM01 — Tiểu phân
[Chọn điểm]  [Ngày đo]  [Các ô hiện hành]
[Thông báo đã có dữ liệu / Xem lịch sử]
[Tính và đánh giá] [Lưu]
```

Chưa chọn đợt hoặc thiếu thông tin bắt buộc: hiển thị hướng dẫn và ô chọn/tạo đợt, không cho nhập/lưu số đo. Chọn đợt chỉ hiện các đợt có hệ thống/BM phù hợp và người dùng được truy cập. Đợt đóng có nhãn Chỉ xem, không trở lại chế độ sửa qua đường dẫn trực tiếp.

Đổi BM hoặc hệ thống giữ đợt nếu đợt có phạm vi phù hợp; nếu không, yêu cầu chọn đợt phù hợp. Đổi đợt khi còn dữ liệu chưa lưu phải có cảnh báo, hủy thao tác giữ nguyên dữ liệu. Không tự tạo đợt hoặc tự chọn đợt khác khi thiếu/thu hồi quyền.

### Nhập nhiều ngày và điểm đã có số liệu

Dùng tiếp record/revision hiện hữu. Lưu phần đã nhập khi chưa đủ toàn bộ điểm, tải lại tiếp tục đúng dữ liệu trước. Ngày đo giữ theo điểm/lần đo hiện có; thời điểm ghi và người ghi lấy từ server. Không đổi mọi ngày đo về ngày lưu mới.

Khi mở điểm đã có bất kỳ số liệu lưu nào trong cùng đợt + hệ thống + BM:
- Hiện cảnh báo “Điểm này đã có dữ liệu trong đợt …”, ngày lưu gần nhất và nút Xem lịch sử.
- Mặc định xem dữ liệu đã lưu. Chọn “Tiếp tục nhập” để thêm vào ô còn thiếu; chọn “Sửa số đã lưu” khi cần sửa giá trị cũ.
- Trước khi lưu phần sửa số cũ, hiển thị giá trị trước/sau và yêu cầu lý do. Bổ sung ô trống không bắt khai lý do sửa nhưng vẫn ghi lịch sử. Lưu cùng payload/retry không sinh lịch sử giả do click kép.
- Mỗi lần lưu tạo revision mới, lịch sử thể hiện người ghi, ngày đo, thời điểm lưu, giá trị trước/sau và lý do nếu sửa. Bản cũ vẫn xem được; lịch sử lọc theo đúng điểm/BM để không phải đọc toàn bộ hồ sơ.
- “Lần đo 1/2/3” trong biểu mẫu hơi vẫn là các lần đo theo công thức hiện tại. Lịch sử nhập/sửa không được tự coi là lần đo thứ 4, không tự lấy trung bình hay lựa chọn kết quả đẹp nhất.
- Hai người cùng sửa một record: phiên bản cũ bị từ chối; giữ số đang nhập và hướng dẫn tải/đối chiếu bản mới. Không last-write-wins, không tự hợp nhất số đo.

### Xu hướng theo hệ thống

Mỗi hệ thống có link xu hướng riêng, mặc định và cố định đúng loại (hơi/khí nén/nitơ); không bắt chọn lại loại từ màn chung. Giữ các bộ chọn đợt, BM, chỉ tiêu, điểm và bảng số nguồn. Biểu đồ dùng cùng evaluator và tiêu chí ghim hiện hành; không thay các tính toán hoặc số liệu lịch sử. Đợt đang mở tiếp tục nhập ở biểu mẫu, không tự đưa kết quả chưa chốt vào chuỗi lịch sử đã đóng.

## Kiến trúc và ranh giới thay đổi

- Shell React: `src/components/layout/Layout.tsx`, `src/features/qualification/shellRoute.ts`, `QualificationWorkspace.tsx`, `src/AuthenticatedApp.tsx`, CSS/token liên quan. Tách thành phần wordmark dùng chung và điều hướng thẩm định có cấu trúc để desktop/mobile không lệch nhau.
- Form JS hiện có: `public/tham-dinh-thuc-te/{runs.html,runs.js,run-entry.js,app.js,gas.js}` và CSS/HTML liên quan. Thêm controller chọn đợt và lịch sử điểm dùng chung; chỉ adapter hơi/khí đọc payload đúng cấu trúc, không sao chép hoặc đổi evaluator.
- `src/features/qualification/backend.js` và RPC: bắt buộc ngữ cảnh đợt ở ranh giới ghi, xác nhận metadata/phiên bản/lý do; không chỉ ẩn nút trong UI. Xử lý đường cũ `cpc1_save` để client cũ không bỏ qua yêu cầu đợt. Đường tạo record rỗng nội bộ của `cpc1_run_create` phải hoạt động nguyên tử, không tạo kẽ hở ghi tự do.
- DB: migration mới riêng, giữ migration 20260929120000 và 20260929160000 bất biến. Bổ sung metadata thiết bị có version và audit/lý do sửa ngoài payload dùng tính toán nếu cần; API lịch sử chỉ đọc có kiểm quyền PQ đối với mọi revision. Khóa server theo thứ tự phù hợp cơ chế close/save hiện có, kiểm expected version và idempotency trong cùng transaction.
- Không sửa `public/tham-dinh-thuc-te/cloud.js` hoặc runtime-config thủ công; đó là output build. Không dùng mã nguồn CPC1 độc lập cũ.
- Hồ sơ lịch sử đã đóng thiếu metadata mới vẫn xem/in như trước; hiển thị Chưa ghi nhận thay vì bịa hạn. Không backfill ngày hoặc mở khóa. Đợt đang mở cũ, nếu có, cần bổ sung metadata trước khi nhập mới, không thay phiên bản đã lưu.

## Kế hoạch triển khai và bằng chứng

Primary phụ trách toàn bộ DB và mọi file dùng chung theo thứ tự, sau khi chốt thiết kế. Không phân công trước khi có hợp đồng dữ liệu cuối.

1. Hợp đồng đợt/metadata/lịch sử: test RED cho thiếu đợt/hạn, sửa điểm thiếu xác nhận/lý do, sai quyền, đợt đóng, race/idempotency. Migration/controller tối thiểu → GREEN trên clone PostgreSQL 17; đối chiếu record/revision/formula cũ.
2. Điều hướng/wordmark/độ nổi: test RED thứ tự nhóm, không còn thư viện, BM có tên, xu hướng riêng, wordmark trên các tab; triển khai UI → GREEN desktop/mobile/keyboard và contrast sáng/tối.
3. Nhập nhiều ngày: E2E có dữ liệu giả gồm tạo đợt → chọn BM → lưu vài điểm → đóng/mở lại → bổ sung ngày sau → cảnh báo điểm cũ → sửa có lý do → xem lịch sử; test offline/2 tab/đổi đợt/hết phiên/thu hồi quyền, không ghi production.
4. Reviewer độc lập mức rủi ro cao kiểm DB/quyền/concurrency và preservation; primary kiểm diff và rerun gate liên quan. Test typecheck/build/budget và các regression bị tác động, không mở rộng sang nghiệp vụ không liên quan.
5. Trước cutover: kiểm remote/main và receipt mới, fresh backup/restore, preflight/phạm vi dữ liệu, clone rehearsal. Migration chỉ áp đúng một lần sau review; deploy đúng SHA qua CI đã được user ủy quyền, live đọc thật/headless và bàn giao. Không chạy lại migration cũ hoặc restart.

Phục hồi: ưu tiên sửa tiến; không xóa audit/revision/metadata đã phát sinh. Nếu rollback UI, phải còn tương thích với server bắt buộc đợt và MFA; không hạ guard để phục vụ client cũ. Cổng final gồm exact SHA/CI, artifact/live, đọc hồ sơ/PDF cũ, chọn đợt và thương hiệu trên tab thật. Production không tạo số liệu thử hoặc ký/duyệt thay.

## Các điểm cần người dùng xem trong thiết kế

- Đã chốt hạn theo từng thiết bị sau câu trả lời “đồng ý”.
- “Nhập tiếp điểm đã làm” được diễn giải là tiếp tục/sửa có lịch sử cùng bộ ô của BM; không tự thêm một bộ kết quả phép thử độc lập khác làm thay đổi công thức/mẫu in.
- Hình thức menu mận đậm, tiêu đề nhóm nổi và wordmark giống Tổng quan áp dụng thống nhất các tab.

## Làm rõ kỹ thuật sau review, trong phạm vi đã chốt

- Server tự so snapshot hiện hành và payload gửi lên theo đường dẫn trường. Trống → có số là bổ sung; có giá trị → khác/xóa là correction cần lý do không rỗng. Ghi diff trước/sau, actor thật, thời gian server và request ID nguyên tử với revision. Không tin cờ xác nhận của client.
- So hạn với ngày đo của từng điểm/lần đo, không lấy ngày bắt đầu đợt nhiều ngày. Metadata thiết bị có version; bản cũ giữ nguyên, không bịa ngày cho lịch sử.
- Shell lấy quyền cpc1_context với kiểm actor/phiên và fail-closed khi refresh, lọc hệ thống/BM; RPC vẫn kiểm quyền độc lập.
- Public cpc1_save cũ từ chối lệnh ghi không theo đợt; tạo record rỗng là primitive private chỉ trong transaction tạo đợt. cpc1_run_save kiểm run/record/system/phiên bản/trạng thái và correction trước commit.
- Phần xu hướng tách riêng từng hệ thống và giữ biểu đồ điểm/lần đo của hồ sơ được chọn; bổ sung góc xem diễn biến qua các đợt đã đóng bằng dữ liệu trendSeries hiện có. Không gộp số khác đơn vị, không mất tháng trống hoặc các đợt cùng tháng.
- Wordmark chuẩn là masthead React hiện tại của Tổng quan. Shell hiển thị một lần ở mọi tab; header HTML tĩnh chỉ làm fallback độc lập, tiếp tục ẩn khi nhúng.

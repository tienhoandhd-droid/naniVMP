# Thiết kế nâng cấp GMP, dữ liệu và vận hành — 10 hạng mục

**Ngày chốt:** 2026-09-01  
**Nhánh:** `cai-tien/desktop-wave-1`  
**Trạng thái:** Đã được chủ dự án duyệt theo phương án A

## 1. Mục tiêu

Đưa VMP từ ứng dụng theo dõi dữ liệu sống thành hệ thống có bằng chứng GMP truy
vết được, số liệu chuẩn từ server và quy trình phát hành có thể phục hồi. Giao
diện desktop tiếp tục theo hướng bảng gọn, ít chữ, thao tác ngay trên dòng và
chi tiết mở theo nhu cầu.

Phạm vi gồm đúng 10 hạng mục:

1. Snapshot báo cáo bất biến và audit `EXPORT`.
2. Đính kèm hồ sơ GMP qua private Storage.
3. Phê duyệt QA điện tử trên đúng phiên bản nội dung.
4. Trung tâm thông báo và nhắc việc.
5. Lịch sử hạng mục theo từng người.
6. Tự sinh lịch tái thẩm định.
7. Server là nguồn sự thật cho KPI và trạng thái.
8. Dump schema gốc vào repo và chứng minh restore được.
9. Apply bốn migration đang chờ.
10. Staging, backup/PITR, restore rehearsal, IP allowlist, rotation mật khẩu và
    xác minh JWT n8n.

## 2. Nguyên tắc phát hành đã chốt

- Không tác động production trước khi staging và bài restore đạt.
- Không đưa secret vào source, log, tài liệu hoặc output kiểm thử.
- Dữ liệu đã ban hành không bị sửa âm thầm; thay đổi sau phê duyệt tạo phiên
  bản/sự kiện mới và vô hiệu phê duyệt cũ khi cần.
- Mọi mutation nghiệp vụ đi qua RPC fail-closed; frontend không phải biên bảo
  mật.
- Mốc thời gian nghiệp vụ dùng giờ Bangkok do server xác lập.
- Chỉ Admin và Quản lý QA được nhập/xuất dữ liệu nguồn như thiết kế hiện tại.
- Bản cuối chỉ push một lần sau khi các cổng local/staging đạt; production là
  cửa sổ phát hành riêng có biên bản preflight/postflight.

## 3. Kiến trúc tổng thể

### 3.1 Nền tảng tái dựng được

`supabase/schema.sql` là schema-only snapshot đã loại owner/secret, kèm checksum
và receipt restore. Migration sau snapshot vẫn là lịch sử thay đổi tuần tự.
Staging dùng schema này cùng seed ẩn danh để chạy contract và persona tests.

### 3.2 Read model chuẩn phía server

Một RPC read model trả về dữ liệu dashboard đã chuẩn hóa theo năm và phạm vi
người dùng: hạng mục, trạng thái canonical, deadline canonical, KPI, revision và
`updated_at`. Client giải mã contract rồi chỉ lọc/hiển thị; không tự suy trạng
thái khác với server. Tab đối chiếu còn lại là cổng giám sát drift.

### 3.3 Bằng chứng GMP bất biến

- Snapshot báo cáo lưu payload canonical, bộ lọc, template version và SHA-256.
- Hồ sơ lưu metadata/version/checksum trong DB; file nằm trong bucket private.
- Phê duyệt là event bất biến ký trên `content_hash` và `subject_version`, không
  chỉ là hai cột người/giờ.
- Audit ghi một receipt cho một hành động xuất hoàn tất, không ghi theo từng
  trang dữ liệu.

### 3.4 Sự kiện và nhắc việc

Sự kiện canonical (kỳ tái thẩm định, chờ QA, báo cáo phát hành) tạo notification
idempotent theo `idempotency_key`. Inbox trong app là dữ liệu theo user với
`read_at`; email là kênh giao nhận bổ sung và không phải nguồn sự thật.

## 4. Ma trận quyền mục tiêu

| Hành động | Admin | Quản lý QA | Nhân viên QA | Quản lý xưởng | Nhân viên xưởng |
|---|---:|---:|---:|---:|---:|
| Xem dữ liệu/hồ sơ trong phạm vi | Có | Có | Có | Có | Có |
| Tạo snapshot báo cáo | Có | Có | Không | Không | Không |
| Xuất snapshot đã phát hành | Có | Có | Theo phạm vi nếu được cấu hình | Không | Không |
| Tải hồ sơ lên | Có | Có | Theo quyền hạng mục | Theo quyền hạng mục | Không |
| Tải hồ sơ xuống | Theo phạm vi | Theo phạm vi | Theo phạm vi | Theo phạm vi | Theo phạm vi |
| Phê duyệt/thu hồi QA | Không | Có | Không | Không | Không |
| Xác nhận đề xuất tái thẩm định | Có | Có | Không | Không | Không |
| Đọc/đánh dấu thông báo | Của mình | Của mình | Của mình | Của mình | Của mình |

Admin không được mặc nhiên thay chữ ký QA; đây là phân tách nhiệm vụ. Nếu cần
override khẩn cấp phải là một action riêng, có lý do và audit, nằm ngoài thiết
kế hiện tại.

## 5. Hành vi từng hạng mục

### 5.1 Snapshot và xuất báo cáo

RPC tạo snapshot trong một transaction từ read model server, tự tính hash và
trả receipt. Snapshot ở trạng thái `draft` có thể bị huỷ; khi `approved` thì payload
không UPDATE/DELETE được. Mỗi export ghi một audit `EXPORT` chứa snapshot id,
format, payload hash và actor. UI báo cáo có bảng các kỳ đã chốt và nút hành động
trên từng dòng.

### 5.2 Hồ sơ GMP

Bucket `vmp-gmp-documents` là private. Object path không chứa email hoặc tên
người dùng. Metadata bắt buộc: hạng mục, mã tài liệu, phiên bản, loại, MIME,
kích thước, SHA-256, người tải và thời điểm server. Thay file tạo version mới;
version cũ chuyển `superseded`, không ghi đè object. Download dùng signed URL TTL
ngắn sau khi RPC kiểm `vmp_can_view_item`.

### 5.3 Phê duyệt QA

QA Manager xác nhận ý nghĩa chữ ký, nhập lý do và re-auth trước khi ký. RPC khóa
hạng mục/hồ sơ, kiểm version/hash, rồi tạo approval event. Mutation trường trọng
yếu hoặc hồ sơ mới làm approval hiện hành thành `invalidated`; lịch sử vẫn giữ
nguyên. UI hiển thị người ký, giờ Bangkok, phiên bản và trạng thái hiệu lực.

### 5.4 Thông báo

Header có nút chuông thật, badge unread và panel tối đa 20 dòng gần nhất. Mỗi
dòng có loại, nội dung ngắn, thời gian, trạng thái và deep link allowlist. Có
`Đánh dấu đã đọc`, `Đánh dấu tất cả`; lỗi mạng giữ trạng thái cũ và cho thử lại.

### 5.5 Lịch sử

Lịch sử tải 50 dòng/lần, có nút `Tải thêm`, tổng số và chi tiết trước/sau khi
`has_detail=true`. RPC luôn kiểm quyền trên validation code; người ngoài phạm vi
nhận `FORBIDDEN`, không nhận danh sách rỗng giả.

### 5.6 Tái thẩm định

Mốc canonical là ngày hoàn thành VMP thực tế; nếu chưa có thì không tự đoán bằng
deadline kế hoạch. Server tính `next_revalidation_due` theo `frequency_months`,
tạo proposal idempotent và không tự chèn vào kế hoạch đã ban hành. Admin/QA
Manager xem bảng proposal, xử lý ngoại lệ và xác nhận tạo hạng mục.

### 5.7 KPI và trạng thái

Server quyết định `done`, `overdue`, `due_soon`, `not_started`, deadline theo giai
đoạn và KPI. Contract có version; payload sai contract làm UI fail rõ ràng thay
vì client suy đoán. Các model client thuần chỉ phục vụ trình bày, không đưa ra
kết luận nghiệp vụ cạnh tranh với server.

## 6. UX desktop

- Bảng là cấu trúc chính; cột hành động nằm cuối và luôn có nhãn/tooltip.
- Bộ lọc, tìm kiếm và tổng số nằm trên một hàng khi đủ rộng.
- Nội dung giải thích dài chuyển vào tooltip hoặc drawer hướng dẫn.
- Drawer chi tiết giữ người dùng trong ngữ cảnh thay vì mở nhiều trang.
- Empty/loading/error có hành động rõ; nút mutation có pending state và chống
  bấm lặp.
- Keyboard focus, tên truy cập và thông báo trạng thái đạt WCAG 2.2 AA.

## 7. Cổng kiểm thử

Mỗi gói chạy unit test mục tiêu, SQL migration/permission test và một E2E đúng
luồng người dùng. Trước phát hành chạy `npm run typecheck`, `npm run build`, các
E2E bị ảnh hưởng và persona probes. Production chỉ đạt khi backup truth,
preflight, migration, postflight, PostgREST reload và smoke test đều có receipt.

## 8. Phân rã kế hoạch

1. `2026-09-01-nen-tang-staging-phat-hanh-implementation.md` — mục 8, 9, 10.
2. `2026-09-01-server-canonical-va-tai-tham-dinh-implementation.md` — mục 6, 7.
3. `2026-09-01-bang-chung-gmp-implementation.md` — mục 1, 2, 3, 5.
4. `2026-09-01-trung-tam-thong-bao-implementation.md` — mục 4.

# Đồng bộ người thực hiện theo mã thẩm định

## Phạm vi được duyệt

Người dùng xác nhận các tên rút gọn thuộc cùng một người, người thực hiện riêng OQ/PQ theo sheet, Admin vẫn có thể được ghi nhận là người thực hiện và quyền tài khoản sẽ thay sau. Vì vậy đồng bộ nhân sự thực hiện không được sửa Auth, vai trò, Source QA authority hoặc các phân công cấp quyền hiện tại. Ngày công đã khớp toàn bộ 461 mã tại lần đọc gần nhất; kiểm lại trước ghi, không áp lại 35 thay đổi cũ. Không đổi trạng thái, ngày hoàn thành, tiêu chí hoặc hồ sơ đã đóng. Sheet chỉ đọc.

## Kiến trúc primary chọn

- Giữ Source owner/support và bảng assignment hiện hữu làm nguồn quyền QA như trước. Không sửa reconciler quyền chỉ để chấp nhận Admin.
- Thêm bảng người thực hiện riêng theo `validation_code`, tham chiếu người có thật bằng UUID. Cờ override riêng cho người chính/phụ phân biệt kế thừa với xóa rõ ràng; tên luôn lấy từ danh sách nhân sự. Không tạo người mới hoặc sao chép tên rời khỏi person_id.
- Bảng được RLS, thu hồi truy cập trực tiếp của anon/authenticated. Hàm trợ giúp nội bộ chỉ bổ sung tên/UUID/email thực hiện vào các activity đã qua bộ lọc visibility của dashboard. Giữ nguyên mọi trường tiến độ/ngày/công và phạm vi activity. Source object-level owner giữ nguyên ý nghĩa QA phụ trách.
- Thay đổi hẹp RPC dashboard hiện hành và watermark để hiển thị/khử cache người thực hiện theo mã; không thêm một lần gọi trình duyệt. Nếu RPC v2 đang tồn tại, xử lý cùng helper; không tự cài toàn bộ migration dashboard v2 chưa được triển khai.
- RPC đổi người thực hiện hiện có giữ chữ ký, yêu cầu phiên, actor manager, người active và scope đang có; thay phần ghi Source toàn thiết bị bằng ghi người thực hiện của đúng mã. Admin nhận công việc là dữ liệu thực hiện, không tự cấp quyền QA. Ghi audit trước/sau/lý do/actor thật.
- Bulk sync chỉ điền ô có tên trong sheet: ghép email duy nhất hoặc alias được chủ dự án xác nhận; không xóa ô trống. Lưu override cho các hàng được chỉ định để việc Source refresh sau này không làm mất phân công theo mã. Các dòng người phụ cùng hai alias dùng cùng UUID, không nhân đôi tài khoản hay quyền.

## Thực hiện tuần tự và review

Primary sở hữu migration, script thao tác, fixture và dữ liệu. Reviewer độc lập chỉ đọc contract/diff/tests; không tự thay kiến trúc. Worktree riêng từ 683caaa vì MA-NGUON-HIEN-TAI đang có chỉnh sửa khác của người dùng. Không commit/ghi đè những file đó.

1. Chụp schema/function/table read-only mới, kiểm tên cột/chữ ký thực tế. Viết test RED theo người thực hiện riêng OQ/PQ, Admin, scope deny, null/inherit, người inactive, source reconciliation không mất override, quyền không đổi.
2. Viết migration nhỏ nhất và test GREEN trên PostgreSQL 17 cô lập. Bộ đọc dashboard phải giữ nguyên activity count/filter và mọi trường ngoài people/cache metadata. Chặn actor không đủ quyền, không làm rò dữ liệu người ngoài phạm vi; thử giao dịch rollback và cập nhật đồng thời.
3. Tạo backup mới, phục hồi riêng và đối chiếu. Chuẩn bị patch có mã nguồn sheet/hash, expected snapshot, audit thật, chống apply lại; không đặt PII hoặc backup trong Git. Reviewer chấp nhận code và artifacts trước production.
4. Áp migration và dữ liệu trong transaction có lock/guard; kiểm chức năng đang chạy/DDL trước thực hiện, không phát lại khi trạng thái commit chưa rõ. Chỉ ledger có receipt mới được coi đã áp.
5. Postflight: tên thực hiện theo từng mã, đủ họ tên, effort khớp; trạng thái/ngày, Source, assignment/Auth, 5 hồ sơ/10 revisions giữ nguyên. Browser headless xem dữ liệu có sẵn, không ghi hồ sơ thử. Nếu không đổi frontend thì không cần thay asset Pages; vẫn lưu migration lên Git theo ủy quyền hiện có và kiểm CI cần thiết trước phát hành.
6. Cập nhật trạng thái VMP và bản bàn giao dữ liệu. Rollback bằng forward-fix hoặc phục hồi đúng phần execution table/RPC sau snapshot/audit; không reset DB, không xóa lịch sử, không chạy lại migration PQ/imports/35effort_days.

## Checkpoint nghiệm thu

Chỉ kết luận hoàn tất khi production dashboard và giao diện đã đọc lại đúng dữ liệu, có receipt bất biến, và đối chiếu mọi dữ liệu/quyền ngoài phạm vi không đổi. Nếu đọc mới thấy sheet/DB khác snapshot thì lập lại diff, không đè lên thay đổi mới của người dùng.

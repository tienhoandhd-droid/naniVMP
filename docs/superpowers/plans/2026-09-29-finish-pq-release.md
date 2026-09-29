# Hoàn tất phát hành quyền PQ — 29/09/2026

Người dùng yêu cầu hoàn tất phát hành sau khi đã được thông báo lỗi CI. Xử lý blocker hẹp; không gia hạn ngoại lệ Long Môn và không đổi hành vi ứng dụng Long Môn.

## Nguyên nhân và sửa kiểm thử

E2E cũ phân nhóm hướng chỉ theo dấu(dx),dấu(dy), bắt buộc ba góc phần tư. Dữ liệu có các hướng khác nhau khoảng15°,45°,53°,-160°,-110° nhưng chỉ thuộc hai góc phần tư nên báo lỗi. Cách đo cũng có thể nhận nhầm các hướng80°/100°/260° là ba hướng dù hai hướng đầu gần nhau.

Thay phép đếm góc phần tư bằng ba vector chuyển động có góc cách nhau từng đôi ít nhất30°. Loại dịch chuyển dưới1px để không nhận nhiễu. Các điều kiện quãng đường15px/30px, đóng băng từng cá, pause/resume, bàn phím, giảm chuyển động và containment giữ nguyên. Unit có cả false-negative/false-positive của phép đo cũ, cùng hướng, hai hướng đối nhau, qua0/360° và bất biến khi xoay. Không đổi source ứng dụng hoặc workflow/ngoại lệ.

## Trình tự phát hành

1. RED đo cũ và E2E thực; GREEN predicate và toàn bộ E2E headless; reviewer độc lập. Kiểm typecheck, affected regression và exact-SHA GitHub gates.
2. Fresh preflight/backup và restore cô lập, đối chiếu trạng thái với gói cutover đã review. Không chạy lại imports hoặc35effort_days.
3. Chỉ áp một lần migrationPQ đã review sau CIgreen, với gate/drain, hash guard, atomic ledger/ACL và đường phục hồi có điều kiện. Không sửa bất kỳ hồ sơ/revision đã chốt.
4. Main fast-forward từ trạng thái đã kiểm, Pages hoàn tất, đối chiếu liveassets; kiểm quyền và PDF từ hồ sơ đã có dữ liệu bằng trình duyệt headless. Cập nhật bàn giao VMP và Desktop đúng commit đãdeploy.

Bằng chứng vận hành, DB backup, dữ liệu thật và cấu hình riêng tư lưu ngoàiGit. Không coi kiểm thử kỹ thuật là phê duyệt GMP.

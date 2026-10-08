# Kiểm thử nhập, sửa, xóa và lưu vết theo quyền — kế hoạch thực hiện

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Người dùng đã yêu cầu thực hiện tuần tự cả ba bước: lập kịch bản, chạy/ghi lỗi, sửa và kiểm lại. Không chờ phê duyệt lại công việc đã được giao.

**Goal:** Kiểm kê toàn bộ luồng ghi của VMP và thẩm định thực tế, lập ma trận có thể truy nguyên, chạy thử trên dữ liệu cách ly, sửa các lỗi tái hiện được và báo cáo chính xác khoảng trống còn lại.

**Architecture:** Giữ nguyên React/Vite + Supabase RPC/RLS và các trang thẩm định tĩnh. Phân biệt ba lớp bằng chứng: UI với backend giả lập; PostgreSQL thật với claim/role thử; browser→HTTP→database với phiên thử nếu môi trường hỗ trợ. Không dùng kết quả lớp này thay lớp khác. Mỗi ca có ID, dữ liệu, vai trò/phạm vi/trạng thái, bước làm, kết quả mong đợi độc lập, kiểm tra persistence/audit, trạng thái và log.

**Tech Stack:** Node test/tsx, Puppeteer/Playwright headless, PostgreSQL17 qua Docker local, SQL giao dịch rollback, Markdown/CSV/JSON evidence.

## Global Constraints

- Baseline `8b8081e`; đúng linked worktree MA-NGUON-HIEN-TAI. Giữ untracked plan23/09.
- Không ghi thử production, không sửa/rerun migration production, không restart dịch vụ hiện hữu. Chỉ database/container do đợt này tạo được cleanup.
- Không tự thay chính sách quyền, công thức/tiêu chí/in ấn, trạng thái hoặc phân công dữ liệu thật. KỳVMPtiếp/đổi mã chưa triển khai ghi là gap chức năng, không tính là regression được sửa.
- Database và file dùng chung do primary xử lý tuần tự. Tối đa hai worker độc lập: một inventory tài liệu, một inventory coverage; không worker nào tự đổi kiến trúc/app/DB.
- Mỗi lỗi ứng dụng cần RED bằng test hành vi, tìm nguyên nhân, bản sửa nhỏ, GREEN và regression; quyền/audit phải có reviewer độc lập gpt-5.6-sol.
- Log, dữ liệu DB và bản build nằm `.cpc1/crud-audit-20261008`; chỉ tài liệu đã làm sạch và test synthetic nằm Git.

## Task 1 — Ma trận trước khi thử
- [x] Primary đọc policy/RPC/test runners/schema và môi trường clone; xác định model hệ thống, quyền và oracle.
- [x] Worker inventory A đọc `src`, `public/tham-dinh-thuc-te`, SQL để liệt kê loại dữ liệu/CRUD/audit/RPC vào `docs/testing/2026-10-08-data-write-inventory.md` (chỉ sở hữu file này).
- [x] Worker inventory B đọc test/SQL hiện có, map coverage theo5role + anonymous/inactive/out-of-scope vào `docs/testing/2026-10-08-existing-coverage.md` (chỉ sở hữu file này).
- [x] Primary tổng hợp `docs/testing/2026-10-08-crud-role-scenarios.csv` và `docs/testing/2026-10-08-crud-role-report.md`: từng case/role/action/scope/state/input/expected/audit/layer/status/evidence; không đánh PASS khi mới đọc code.

## Task 2 — Chạy thử và ghi sai lệch
- [x] Tạo DB disposable từ schema local đã đối chiếu, không ghi DB nền; ghi version/schema/migrationhash, refuse target ngoài local.
- [x] Chạy test SQL hành vi thật với authenticated/anon + claims riêng; đối chiếu sau write/reload, rollback/duplicate/version/scope; kiểm audit đúng actor/before/after/reason, không cho sửa/xóa audit.
- [x] Build private dist; chạy browser headless các luồng Source, import, danh mục, tiến độ/phân công/ngày, quyền/tài khoản, revalidation, thẩm định tạođợt/nhập/đínhchính/khóa/lịch sử. Phân nhóm để không ghi chung backend.
- [x] Bổ sung các case thiếu quan trọng nhất ở boundary UI→RPC→DB; mỗi lần fail lưu ID/expected/actual/log/commit/severity/rootcause; lỗi test/môi trường tách lỗi app.
- [x] Cập nhật kết quả theo từng case, không suy PASS theo số test chung. Những case chưa có môi trường/fixture ghi NOT_RUN và lý do.

## Task 3 — Sửa và kiểm lại
- [x] Theo từng finding: thêm regression tái hiện RED, sửa tại nguyên nhân, GREEN. Không gộp thay đổi ngoài finding.
- [x] Reviewer độc lập kiểm ma trận/độ phủ + diff quyền/audit và evidence. Primary đọc mọi diff và rerun kiểm liên quan.
- [x] Typecheck, unit liên quan/full khi boundary chung đổi, build, E2E liên quan, DBtest nếu đổi DB; ghi hash/finalreceipt.
- [x] Báo cáo kết quả và giới hạn; cập nhật root/chuyênbiệt PROJECT-STATE. Đợt này hoàn thành kiểm thử/sửa local trước khi tính phát hành.

## Rollback và checkpoints

DB mới là môi trường thử, mỗi ca transaction rollback hoặc fixture riêng, cleanup chỉ theo tên do runner tạo. Mã sửa có thể revert từng finding; production giữ8b8081e tới khi release được xác minh. Checkpoint1: ma trận trước chạy; checkpoint2: sổ lỗi trước sửa; checkpoint3: reviewer + evidence sau sửa. Không ghi đè bằng chứng RED bởi GREEN.

## Kết quả checkpoint cuối

Hoàn tất đợt kiểm/sửa local với giới hạn được ghi rõ: 10 lỗi tái hiện đã sửa; 7 suite DB thật + browser catalog thật đạt; 56 trường nhập thẩm định và 8 trường tiến độ theo quyền. Ma trận260dòng vẫn giữ PARTIAL/BLOCKED nơi chưa có đủ bằng chứng hoặc backend; không tuyên bố260/260. Review độc lập đã yêu cầu và xác minh bổ sung no-effect/readback/audit context. Báo cáo/receipt tại docs/testing. Chưa commit/push/deploy/production applied.

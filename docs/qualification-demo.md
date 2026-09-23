# Thẩm định thực tế (demo)

Phân hệ nằm tại `./tham-dinh-thuc-te/` trên cùng website VMP. Menu desktop/mobile chỉ hiện cho Admin, Quản lý QA và Nhân viên QA đang hoạt động. Mở trực tiếp URL cũng phải qua kiểm tra quyền phía Supabase.

## Tài khoản và quyền

Dùng cùng Supabase Auth, project và phiên trình duyệt với VMP. Đăng nhập tại VMP rồi mở phân hệ, không cần tài khoản hoặc mật khẩu thứ hai. Thoát từ phân hệ kết thúc phiên hiện tại và thông báo cho các tab cùng phiên, không đăng xuất những thiết bị khác.

QA/Admin có quyền xem phân hệ và cấu hình biểu mẫu. Nhập/tính/lưu/in cần grant riêng trong `cpc1_private.members`; grant không vượt được ranh giới QA/Admin. Hồ sơ đang được giới hạn theo người tạo. Chưa cấp quyền xem hồ sơ của người khác hoặc liên kết kế hoạch VMP; đây là phạm vi cần chốt riêng. Không có ký, duyệt hoặc quyết định đưa thiết bị vào sử dụng.

## Dữ liệu và bản in

Hơi tinh khiết5, khí nén6, nitơ7 biểu mẫu; nguồn dữ liệu, revision, đánh giá và audit nằm trong Supabase VMP. Mẫu PDF, bản đồ ô và font báo cáo ở bucket riêng tư `cpc1-templates`, kiểm hash khi in. Font/giao diện VMP chỉ áp dụng trên màn hình, không thay font mẫu báo cáo.

Frontend được chuyển từ bản CPC1 đã phát hành `1a0b1d052b2bdc55a568d8d269dbd3f2e25060b7`; nguồn engine/PDF `2985f847b01ae1c892edd46b43ff491501038066`. Phần chỉnh có chủ đích: HTML/CSS VMP, đăng nhập chung, gate QA/Admin, trạng thái chỉ xem, điều hướng. Công thức và bộ dựng PDF giữ nguyên. `scripts/build-qualification.mjs` tạo cloud/runtime từ đúng cấu hình public VMP và dependency đã khóa; không commit generated files.

## Kiểm và phát hành

Migration `20260923100000_qualification_demo.sql` bổ sung namespace riêng, không thay quyền/hàm/bảng VMP hiện có. Cấu hình và45assets được nạp bằng công cụ riêng tư, không nằm trong Git. Bản sao trước chuyển được khôi phục vào PostgreSQL17 network-none, đối chiếu100bảng. Kiểm quyền ở `supabase/tests/qualification.sql`; unit build/session/nav ở `tests/unit/qualification-*.test.mjs`.

Đã kiểm headless đủ18biểu mẫu có số liệu tại375/1440, cùng một phiên VMP, ba hệ thống lưu/mở/in PDF qua Auth/RPC/Storage thật. Đăng xuất đã kiểm đồng bộ các tab. Unit, typecheck, build, ngân sách bundle và kiểm trôi thiết kế đều qua; review quyền/phát hành độc lập đã hoàn tất.

Bằng chứng kiểm thử có số liệu và bản sao lưu giữ riêng tư ngoài Git. Xem kế hoạch `superpowers/plans/2026-09-23-tham-dinh-thuc-te.md`. Biểu mẫu có dữ liệu giả dùng để kiểm, không phải hồ sơ chính thức. Không coi việc kiểm phần mềm là phê duyệt GMP của QA.

Rollback giao diện bằng revert commit tích hợp; giữ database và dữ liệu mới để không mất hồ sơ. CPC1 cũ vẫn được giữ làm điểm phục hồi trong giai đoạn nghiệm thu. Không reset hoặc DROP VMP.

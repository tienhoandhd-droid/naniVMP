# Thiết kế cổng phát hành tinh gọn

## Mục tiêu

Rút thời gian kiểm tra mỗi lần phát hành xuống khoảng 5–7 phút, nhưng vẫn chặn
các lỗi có khả năng làm hỏng luồng chính hoặc phân quyền. GitHub Pages chỉ được
triển khai khi các kiểm tra tối thiểu và bản build đều thành công.

## Phạm vi

Chỉ sửa `.github/workflows/deploy.yml` và hợp đồng unit kiểm workflow tại
`tests/unit/e2e-suite-contract.test.mjs`. Không đổi mã ứng dụng, dữ liệu,
Supabase, package script, bộ kiểm thử E2E hoặc workflow cập nhật ảnh thủ công.

## Cổng phát hành mới

Job kiểm tra nhanh giữ:

- `npm run typecheck`;
- `npm run test:unit`.

Job E2E giữ đúng ba nhóm đại diện:

- `npm run e2e:gialap`: luồng ứng dụng giả lập, đăng nhập và phiên;
- `npm run e2e:catalog`: thao tác danh mục cốt lõi;
- `npm run e2e:admin`: quyền quản trị và chuyển trạng thái truy cập.

Mỗi lần phát hành không còn chạy:

- hợp đồng runtime và baseline ảnh;
- kiểm tra design drift;
- shell, thẩm mỹ và atelier;
- accessibility;
- 39 kiểm tra ảnh giao diện và bước tải ảnh chênh lệch.

Các script và dữ liệu kiểm tra này vẫn nằm nguyên trong kho mã nguồn để có thể
chạy thủ công khi thay đổi giao diện hoặc cần điều tra chuyên sâu.

## Luồng thực thi

Pull request và push lên `main` đều chạy kiểm tra nhanh trước, sau đó chạy ba
nhóm E2E. Chỉ push lên `main` mới tiếp tục build production và triển khai
GitHub Pages. Build vẫn phụ thuộc vào cả hai job kiểm tra, vì vậy kiểm tra thất
bại sẽ không phát hành.

Các push `main` cùng dùng một concurrency group để release vẫn tuần tự. Mỗi PR
và workflow dispatch dùng group theo `run_id`, nên không thể xếp hàng sau hoặc
thay thế một release `main` đang chờ.

## Xử lý lỗi

Workflow dừng ngay khi bất kỳ lệnh kiểm tra nào thất bại. Không tự động thử lại
và không bỏ qua lỗi. Ảnh giao diện và accessibility không còn là lỗi chặn phát
hành; chúng được kiểm tra theo nhu cầu thay vì ở mọi commit.

## Xác minh

Trước khi đưa lên `main`:

1. kiểm tra cú pháp workflow;
2. chạy kiểm tra hợp đồng unit để chứng minh workflow chỉ gọi đúng các lệnh đã
   duyệt, giữ dependency build và tách concurrency release khỏi run không deploy;
3. chạy typecheck và unit test bằng Node.js 24;
4. đẩy nhánh và xác nhận GitHub Actions chạy thành công ba nhóm E2E;
5. chỉ sau đó fast-forward lên \`main\` và xác nhận build cùng GitHub Pages.

## Phục hồi

Nếu cổng tinh gọn bỏ lọt lỗi đáng kể, hoàn tác commit workflow để trở về cổng
đầy đủ tại `d9baea0658adfaa0aa623c81d33fbc1772f700ce`. Việc phục hồi không
đụng tới dữ liệu production.

# Task 4 report — đăng ký legacy performer-directory E2E

## Trạng thái

DONE

## Phạm vi thay đổi

- `tests/unit/e2e-suite-contract.test.mjs`: thêm contract test đọc cấu hình thật để bảo vệ việc đăng ký E2E.
- `package.json`: thêm `node tests/e2e/danh-muc-nguoi-thuc-hien.mjs` đúng một lần vào cả `test:permissions` và `e2e`.
- `tests/e2e/README.md`: liệt kê lệnh chạy riêng legacy E2E và sửa mô tả số lượng suite đã lỗi thời.
- Không sửa migration, SQL, DB, production source hoặc E2E implementation.

## TDD RED → GREEN

### RED

Lệnh:

```text
node --test tests/unit/e2e-suite-contract.test.mjs
```

Kết quả trước khi sửa scripts/README: exit `1`, `0/2` test đạt.

- Contract package script fail: `test:permissions` có `0`, yêu cầu đúng `1` đăng ký legacy command.
- Contract README fail: có `0`, yêu cầu đúng `1` dòng lệnh legacy command.

Đây là failure đúng nguyên nhân yêu cầu, không phải syntax/import error.

### GREEN

- Focused contract: exit `0`, `2/2` đạt.
- Toàn bộ unit: exit `0`, `56/56` đạt.

Contract bắt các mutation thực tế sau:

- Xóa command khỏi riêng `test:permissions` hoặc `e2e`.
- Đăng ký command lặp lại trong một script.
- Xóa hoặc lặp dòng chạy riêng trong README.

## Kiểm chứng

| Lệnh | Kết quả |
|---|---|
| `node --test tests/unit/e2e-suite-contract.test.mjs` | PASS — 2/2 |
| `npm run test:unit` | PASS — 56/56 |
| `npm run typecheck` | PASS — exit 0 |
| `npm run build` | PASS — 2.220 modules transformed |
| `npm run test:permissions` | PASS — exit 0; log có marker legacy |
| `npm run e2e` | PASS — exit 0; log có marker legacy |

Marker legacy quan sát được trong cả hai suite:

```text
✅ Danh mục không gọi mutation performer legacy và dẫn tới danh bạ chuẩn
```

Các mốc đáng chú ý khác trong full E2E: luồng chính `20/20`, quét màn `13/13`, tải lại liên tiếp `20/20`.

## Ghi chú môi trường

Lượt `test:permissions` đầu tiên dừng trước browser assertions vì linked worktree không có `.env.local`; helper báo thiếu `E2E_EMAIL`/`E2E_PASSWORD`. Đây là thiếu fixture môi trường, không phải regression của Task 4.

Để kiểm chứng, credential chỉ được đọc từ `/home/admin1/VMP/.env.local` bằng preload trong tiến trình; cấu hình Supabase frontend public được đọc từ bundle GitHub Pages và chỉ truyền vào tiến trình build. Không ghi `.env.local`, không in giá trị, không sửa DB.

## Self-review

- Scripts dùng `&&`, vì vậy legacy E2E được thực thi fail-fast và không thể bị che bởi suite trước.
- Test parse `package.json` thay vì grep chuỗi thô, tách từng command để bắt thiếu hoặc đăng ký trùng.
- README contract chấp nhận phần comment mô tả thay đổi nhưng bắt đúng command chạy được.
- `git diff --check` sạch.
- File plan untracked có sẵn ngoài ownership được giữ nguyên và sẽ không nằm trong commit Task 4.

## Concerns

Không có concern code. Việc chạy browser E2E từ linked worktree cần quy trình cung cấp `.env.local` rõ ràng hơn để tránh bước bootstrap thủ công ở các lần sau.

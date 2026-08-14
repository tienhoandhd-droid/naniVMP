# Kiểm thử end-to-end VMP

Các bộ kiểm chạy trên **Chrome thật đã cài trên máy** (không tải trình duyệt
riêng), đọc **dữ liệu Supabase thật** bằng khoá anon. Không có bộ nào ghi lên
Supabase.

## Chạy

```bash
npm run build
npx vite preview --port 4173 --strictPort &   # phải dựng bản build, không phải dev server
npm run e2e
```

Hoặc chạy từng bộ:

```bash
node tests/e2e/luong-chinh.mjs          # 19 phép kiểm: URL, bộ lọc, Việc của tôi, độ tươi
node tests/e2e/quet-tat-ca-man.mjs      # mở lần lượt 12 màn, bắt lỗi console
node tests/e2e/giam-chuyen-dong.mjs     # prefers-reduced-motion có thật sự dừng 3D không
node tests/e2e/danh-ba-phan-quyen.mjs   # autocomplete, tự điền và phân công bằng person_id
node tests/e2e/quyen-cot-timeline.mjs   # preview/enforced theo từng cột timeline
node tests/e2e/thu-hoi-cache-phan-quyen.mjs # thu hồi cache và fail-closed khi bật enforced
node tests/e2e/danh-muc-nguoi-thuc-hien.mjs # danh mục cũ không còn mutation và dẫn tới danh bạ chuẩn
node tests/e2e/ux-refinement.mjs         # login 390px, drawer mobile, chat, CTA quyền và bản đồ tải việc
node tests/e2e/cham-giao-dien.mjs        # audit viewport 1366/1440/390, tràn, chat và redirect enforced
```

`npm run cham` mở trang đăng nhập ở 390×844, rồi kiểm toàn bộ bảy màn có
dữ liệu ở 1366×768 và 1440×900, cùng shell ứng dụng ở 390×844. Audit dừng
với selector và hình học cụ thể nếu form login bị đẩy dưới viewport, tài liệu
tràn ngang, FAB chat fixed che nút chính, opener menu mobile mất, nút Thông
báo không hành động quay lại, hoặc redirect `enforced` để `main` rỗng. Response
`rpc_my_ui_access` chỉ được mô phỏng trong Chrome để tái lập redirect; audit
đăng nhập bằng tài khoản chỉ-xem và không gửi Supabase mutation.

Khi nghiệm thu phân quyền theo từng hạng mục, chạy `npm run test:permissions`
sau khi đã dựng `npm run build` và mở preview ở cổng 4173. Bộ kiểm dùng ba
persona QA, bộ phận quản lý thiết bị và chỉ-xem; chế độ `preview` phải giữ
hành vi cũ, còn `enforced` chỉ được mô phỏng/mocked cho tới khi Admin chủ
động bật sau tiền kiểm.

Biến môi trường tuỳ chọn:

| Biến | Ý nghĩa |
|---|---|
| `E2E_URL` | Địa chỉ web cần kiểm (mặc định `http://localhost:4173`) |
| `E2E_QA_NAME` | Tên một QA **có thật** trong dữ liệu, để kiểm "Việc của tôi" ra đúng việc |
| `CHROME_PATH` | Đường dẫn Chrome/Chromium nếu không nằm ở vị trí chuẩn của macOS/Linux |

## Hai điều dễ vấp khi sửa bộ kiểm

**1. Điều hướng chỉ đổi hash thì trang KHÔNG tải lại.**
`page.goto(url + "#v=reports")` từ cùng một URL là điều hướng trong cùng tài
liệu — React không dựng lại, nên hồ sơ vừa ghi vào `localStorage` sẽ không
được đọc và app vẫn nằm ở màn đăng nhập. Luôn `page.reload()` sau khi đặt
`localStorage`. Lỗi này đã làm hỏng kết quả hai lần.

**2. Bốn màn trả 401 là ĐÚNG, không phải hỏng.**
Danh mục & Nhập liệu · Luật đang áp dụng · Audit log · Quản trị gọi các RPC
bắt buộc phiên đăng nhập thật (`rpc_active_rules`, `rpc_list_source_tabs`…).
Bộ kiểm chỉ nhét hồ sơ giả vào `localStorage`, không có phiên Supabase, nên
bị chặn — đó là RLS chạy đúng. Kiểm chứng bằng curl trực tiếp, ngoài app:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "$VITE_SUPABASE_URL/rest/v1/rpc/rpc_active_rules" \
  -H "apikey: $VITE_SUPABASE_ANON" -H "Authorization: Bearer $VITE_SUPABASE_ANON" \
  -H "Content-Type: application/json" -d '{}'      # → 401
```

Muốn kiểm cả bốn màn đó thì phải đăng nhập bằng tài khoản thật trong bộ kiểm,
chưa làm vì cần thông tin đăng nhập.

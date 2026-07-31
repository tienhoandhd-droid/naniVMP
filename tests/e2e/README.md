# Kiểm thử end-to-end VMP

Ba bộ kiểm chạy trên **Chrome thật đã cài trên máy** (không tải trình duyệt
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
```

Biến môi trường tuỳ chọn:

| Biến | Ý nghĩa |
|---|---|
| `E2E_URL` | Địa chỉ web cần kiểm (mặc định `http://localhost:4173`) |
| `E2E_QA_NAME` | Tên một QA **có thật** trong dữ liệu, để kiểm "Việc của tôi" ra đúng việc |

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

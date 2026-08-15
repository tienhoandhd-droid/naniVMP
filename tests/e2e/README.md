# Kiểm thử end-to-end VMP

Các bộ kiểm chạy trên **Chrome thật đã cài trên máy** (không tải trình duyệt
riêng), đọc **dữ liệu Supabase thật** bằng khoá anon. Không có bộ nào ghi lên
Supabase.

## Chạy

Từ đợt Lotus Pearl trở đi, **mọi lệnh trình duyệt chạy qua một wrapper duy
nhất** — không tự dựng preview bằng tay nữa:

```bash
bash scripts/with-preview.sh -- npm run e2e
bash scripts/with-preview.sh -- node tests/e2e/luong-chinh.mjs
```

Wrapper sở hữu trọn vòng đời: kiểm `.env.local` đủ khoá cách ly → tính dấu
vân tay đầu vào (mã nguồn, cấu hình, và *tên* khoá `.env.local`, không phải
giá trị) → build vào thư mục tạm → kiểm sản phẩm → tráo vào `dist/` → mở
đúng một `vite preview --host 127.0.0.1 --port 4173 --strictPort` → chạy lệnh
của bạn → dừng và thu hồi đúng tiến trình đó dù thành công hay thất bại.

Ba cái bẫy nó chặn: chạy nhầm trên `dist/` cũ, tái dùng server do bộ test khác
để lại, và bỏ sót tiến trình preview còn sống giữ cổng 4173.

Mã thoát: `2` sai cú pháp · `3` `.env.local` thiếu khoá hoặc khoá rỗng ·
`4` build lỗi · `5` sản phẩm build không hợp lệ hay dấu vân tay lệch ·
`6` cổng 4173 đã có người giữ hoặc preview chết ngay · `7` chờ quá hạn.
Thành công thì trả **nguyên mã thoát của lệnh bên trong**.

Đặt `WITH_PREVIEW_TIMEOUT` (giây, mặc định 20) nếu máy chậm.

## Kiểm thẩm mỹ toàn app

```bash
bash scripts/with-preview.sh -- npm run thammy
```

Áp 16 luật đo được ở `docs/design/luat-tham-my.md` lên **cả 17 màn**, ở hai
chế độ sáng/tối, bốn khổ màn, và hai kịch bản dữ liệu (có dữ liệu · rỗng) —
83 lượt đo. Thoát khác 0 nếu còn vi phạm **nặng**.

Bộ này KHÔNG chạm production: `tests/e2e/gia-lap-supabase.mjs` chặn mọi
request ra ngoài ở tầng trình duyệt và trả lời thay Supabase bằng dữ liệu
dựng sẵn. Đổi lại nó không kiểm nghiệp vụ — chỉ chứng minh giao diện dựng
đúng với một dữ liệu cho trước.

Đặt `THAMMY_CHI_TIET=40` để in nhiều kiểu vi phạm hơn khi đang sửa.

Cách cũ chỉ còn để tham khảo — nó không kiểm được `dist/` có tươi hay không:

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

**1. Đổi persona và hash phải là một giao dịch trước khi tải lại.**
`page.goto(url + "#v=reports")` từ cùng một URL là điều hướng trong cùng tài
liệu. Puppeteer có thể trả về trước khi React xử lý `hashchange`; effect ghi
state ra URL khi đó có thể khôi phục hash cũ trước lệnh reload. Hãy ghi persona,
`history.replaceState` tới URL đích và gọi `location.reload()` đồng bộ trong cùng
một `page.evaluate`; đồng thời arm navigation wait trước bằng `Promise.all`:

```js
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle2" }),
  page.evaluate(([url, persona]) => {
    localStorage.setItem("vmp_monitor_user_v1", JSON.stringify(persona));
    history.replaceState(null, "", url);
    location.reload();
  }, [targetUrl, persona]),
]);
```

`replaceState` không phát `hashchange`; lần mount sau reload vì thế đọc persona và URL
đích cùng nhau. Chỉ assert hash sau navigation: Tổng quan canonical có hash rỗng,
các màn khác có `#v=<id>`.

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

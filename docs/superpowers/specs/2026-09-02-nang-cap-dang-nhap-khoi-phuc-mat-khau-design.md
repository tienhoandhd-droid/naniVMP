# Thiết kế nâng cấp đăng nhập và khôi phục mật khẩu

## Mục tiêu

Nâng màn xác thực thành một luồng rõ ràng, an toàn và nhất quán với thẩm mỹ Lotus Pearl. Người dùng phải đăng nhập, yêu cầu email khôi phục và đặt mật khẩu mới được trên cả desktop lẫn mobile mà không bị kẹt giữa màn đăng nhập, dashboard và hộp thoại.

## Quyết định sản phẩm

- Giữ xác thực email/mật khẩu bằng Supabase Auth; không thêm OAuth hay đăng ký tài khoản.
- Dùng ba trạng thái chuyên biệt trong cùng khung thương hiệu: `Đăng nhập`, `Quên mật khẩu`, `Đặt mật khẩu mới`.
- Sau khi đặt mật khẩu mới thành công, kết thúc phiên recovery và đưa người dùng về màn đăng nhập để xác nhận mật khẩu mới. Không tự động cho vào ứng dụng.
- Không tiết lộ email có tài khoản hay không. Sau yêu cầu hợp lệ luôn dùng thông báo chung: nếu email thuộc hệ thống, liên kết đặt lại đã được gửi.
- Mật khẩu mới tối thiểu 8 ký tự. Quy tắc này áp dụng cả khi recovery lẫn đổi mật khẩu trong ứng dụng để hệ thống không có hai chuẩn. Không áp đặt quy tắc chữ hoa/ký tự đặc biệt; hai ô phải khớp và quy tắc phải hiện trước khi gửi.
- Không cài thêm thư viện form. Dự án đang dùng controlled inputs cùng validator thuần đã có test; tiếp tục khuôn này để giữ phạm vi hẹp.

## Kiến trúc và ranh giới

### 1. Vỏ xác thực dùng chung

Giữ `LuxuryBrandPanel` làm artwork duy nhất. Phần làm việc bên phải dùng cùng logo, chiều rộng và token cho cả ba trạng thái. Chỉ nội dung form thay đổi; không tạo modal đặt lên màn đăng nhập.

`LoginScreen` quản lý hai trạng thái chưa xác thực:

- `login`: email, mật khẩu và hành động đăng nhập;
- `forgot`: nhập email, gửi liên kết và quay lại đăng nhập;
- `forgot-sent`: xác nhận đã gửi, hướng dẫn kiểm tra Hộp thư đến/Spam, nút quay lại và gửi lại sau thời gian chờ 60 giây.

Màn recovery là component riêng và được `AppShell` ưu tiên render trước shell dữ liệu bảo vệ. Nó không phụ thuộc vào việc dashboard đã mount.

### 2. Bắt sự kiện recovery chắc chắn

`useAuth` chịu trách nhiệm nhận `PASSWORD_RECOVERY`, thay vì để listener trong `VerifiedAppShell`. Cờ recovery được khởi tạo cả từ URL khôi phục lẫn sự kiện Supabase để không bỏ lỡ trường hợp SDK xử lý URL trước khi protected shell được dựng.

Khi recovery đang hoạt động:

1. Không render dashboard hoặc gọi luồng dữ liệu nghiệp vụ.
2. Kiểm tra phiên Supabase đã sẵn sàng trước khi cho gửi mật khẩu mới.
3. Nếu liên kết hết hạn/sai, hiện trạng thái lỗi riêng với nút quay về bước yêu cầu email mới.
4. Nếu cập nhật thành công, gọi đăng xuất phiên recovery, xóa hồ sơ/cache cục bộ qua ranh giới auth hiện có và quay về `login` với thông báo thành công.

### 3. Validator và API

- `loginForm.ts` tiếp tục chịu trách nhiệm validate email/đăng nhập và thông điệp đăng nhập chung.
- `passwordForm.ts` cung cấp validator đặt mật khẩu mới tối thiểu 8 ký tự, kiểm tra hai ô khớp và dịch lỗi link hết hạn, rate limit, mạng.
- `supabaseClient.ts` giữ ba thao tác độc lập: gửi email, kiểm tra phiên recovery, cập nhật mật khẩu. UI không đọc token hoặc secret.
- `redirectTo` tiếp tục lấy từ origin/path hiện tại để local, preview và production dùng cùng luồng.

## UX/UI chi tiết

### Đăng nhập

- Giữ một CTA chính `Đăng nhập`.
- Đưa `Quên mật khẩu?` lên cùng hàng với nhãn `Mật khẩu`, căn phải; không đặt như một nút rời xa ngữ cảnh dưới CTA.
- Giữ hiện/ẩn mật khẩu, cảnh báo Caps Lock, `autocomplete="email"` và `autocomplete="current-password"`.
- Khi gửi: khóa các control liên quan, đổi nhãn CTA và công bố trạng thái bằng `aria-live`.
- Lỗi xác thực dùng câu chung `Email hoặc mật khẩu chưa đúng`; lỗi trường nằm ngay dưới trường.

### Quên mật khẩu

- Tiêu đề và mô tả đổi rõ theo tác vụ; chỉ có ô `Email công việc`.
- CTA `Gửi liên kết đặt lại`; hành động phụ `Quay lại đăng nhập`.
- Sau khi gửi không giữ nguyên form như thể chưa có gì xảy ra. Hiện panel xác nhận có biểu tượng, email đã nhập, hướng dẫn Hộp thư đến/Spam và bộ đếm gửi lại 60 giây.
- Phản hồi thành công không xác nhận email tồn tại.

### Đặt mật khẩu mới

- Hai trường `Mật khẩu mới` và `Nhập lại mật khẩu`, đều dùng `autocomplete="new-password"`.
- Có một nút hiện/ẩn áp dụng rõ cho từng trường, vùng bấm tối thiểu 44px.
- Hiện sẵn yêu cầu `Tối thiểu 8 ký tự`; báo khớp/sai bằng chữ và biểu tượng, không chỉ bằng màu.
- CTA `Lưu mật khẩu mới`; trạng thái thành công dẫn về đăng nhập.
- Link sai/hết hạn không hiện form vô dụng; thay bằng màn giải thích ngắn và nút `Yêu cầu liên kết mới`.

## Responsive và thẩm mỹ

- Desktop giữ bố cục hai cột; form tối đa 400px, một trục trái nhất quán.
- Mobile thu gọn panel thương hiệu, ưu tiên form trong màn hình đầu; ẩn lời chúc phụ ở các bước quên/recovery.
- Chỉ dùng token Lotus Pearl, một CTA màu plum, viền/focus rõ và chuyển động nhẹ có `prefers-reduced-motion`.
- Không thêm artwork, gradient CTA hoặc đoạn hướng dẫn dài làm loãng nhiệm vụ.

## Accessibility và bảo mật

- Mọi input có `label`, `aria-invalid`, `aria-describedby`; thay đổi async dùng `role="status"`/`aria-live="polite"`, lỗi dùng `role="alert"`.
- Thứ tự Tab theo DOM; Enter gửi form; focus chuyển tới tiêu đề bước mới hoặc trường đầu tiên.
- Các nút phụ là `button`, không dùng phần tử giả; focus ring luôn nhìn thấy.
- Submit và gửi lại bị khóa khi đang xử lý; cooldown phía client hỗ trợ UX nhưng lỗi rate limit từ server vẫn được xử lý.
- Không ghi token, mật khẩu hoặc thông tin xác định tài khoản vào log/thông báo.

## Kiểm thử và tiêu chí hoàn thành

- Unit: validate email, lỗi đăng nhập chung, mật khẩu dưới 8 ký tự, không khớp, dịch lỗi recovery/rate limit/link hết hạn.
- Component/static: nhãn, autocomplete, accessible name, ba trạng thái và không nạp Supabase SDK ở static render ban đầu.
- E2E Chrome: đăng nhập thành công/thất bại, chuyển login → forgot → sent → login, chống gửi lặp, recovery hợp lệ → đặt mật khẩu → đăng xuất → login, recovery hết hạn → yêu cầu link mới.
- E2E responsive tại desktop và mobile: không tràn, vùng bấm tối thiểu 44px, form chính nằm trong viewport hợp lý.
- Chạy targeted unit/E2E, typecheck, design drift và production build. Không mở rộng sang đăng ký, OAuth, quản trị tài khoản hoặc thay đổi quyền.

# Kết quả nâng cấp chất lượng VMP — 29/09/2026

Trạng thái: bản local đã hoàn tất triển khai và kiểm thử; chưa áp migration/Auth settings hoặc deploy bản này. Mốc nền đã đồng bộ là `683caaa`.

## Đối chiếu yêu cầu với bằng chứng

| Yêu cầu | Kết quả |
| --- | --- |
| Nhãn, phản hồi thao tác | Bổ sung tên/tooltip điều hướng, nhãn bộ lọc báo cáo, thông báo phạm vi đang xem, trạng thái tải và xuất file. Chặn gửi đăng nhập trùng; phân biệt giới hạn yêu cầu/mất mạng/lỗi máy chủ. |
| Tương phản, nhất quán | Giữ hệ màu Lotus đang có vì kiểm tra thực tế đạt; dùng cùng token cho skeleton và trạng thái. Không thay toàn bộ bảng màu theo nhận định chưa có bằng chứng. |
| Báo cáo | Đã có biểu đồ SVG, bộ lọc, tìm kiếm/sắp xếp trong chi tiết và XLSX/HTML/PDF. Bổ sung cách đọc/xuất, mở chi tiết bằng bàn phím và trả focus về nút mở. Không đổi công thức báo cáo. |
| MFA | Thêm TOTP do chủ tài khoản tự bật; tài khoản đã bật phải xác minh trước khi mở dữ liệu. Native API, PostgREST pre-request và restrictive RLS cho Storage/các bảng Realtime. Không tự đăng ký thiết bị cho người dùng. |
| Mật khẩu | Mật khẩu mới/đổi tối thiểu 12 ký tự ở giao diện; cấu hình máy chủ phải được xác nhận khi cutover. Kiểm tra mật khẩu cũ bằng phiên tạm không lưu, giữ nguyên AAL2 của phiên chính. Mật khẩu cũ không bị đổi tự động. Supabase đã dùng bcrypt, không tự viết thuật toán mã hóa. |
| Chống thử sai | Dùng giới hạn phía Supabase và hiển thị lỗi 429 rõ ràng; không gọi bộ đếm phía trình duyệt là biện pháp chống brute force. Không tự khóa tài khoản sau ba lần sai. MFA là lớp bổ sung; CAPTCHA cần cấu hình nhà cung cấp riêng và không được tuyên bố đã bật. |
| API/phiên | Giữ lỗi native để phân loại, MFA fail-closed, xử lý đổi tài khoản/đăng xuất khi yêu cầu đang chạy, giữ lỗi tắt MFA và thông báo đổi mật khẩu. Recovery có kiểm thử riêng. |
| Responsive/accessibility | Axe 20 màn đạt; ma trận đăng nhập/báo cáo × sáng/tối × 1440/768/390/320 không có lỗi serious/critical, thiếu alt, lỗi JS hay tràn ngang. Có kiểm tra bàn phím, focus, bố cục720px và root font200%. Đây là bằng chứng tự động, không phải chứng nhận toàn bộ WCAG hoặc kiểm thử thiết bị thật. |
| Hiệu năng | Tách shell sau đăng nhập thành chunk lazy, giữ thứ tự kiểm tra MFA/quyền. JS giải mã khi mở login giảm 592.876 → khoảng456.800 byte (~23%). Không nạp báo cáo/export trước khi cần. |

## Số đo hiệu năng

Lighthouse13.5.0, Chrome headless, mobile simulated, cùng máy và cấu hình:

| Chỉ số | Nền | Sau tách shell |
| --- | ---: | ---: |
| Performance | 92 | 93 |
| Accessibility | 100 | 100 |
| FCP | 1,8s | 1,7s |
| LCP | 3,2s | 3,2s |
| TBT | 20ms | 0ms |
| CLS | 0,016 | 0,016 |

Điểm Lighthouse có dao động; không coi tăng một điểm là kết luận về tốc độ trên mọi thiết bị. Mức giảm byte JS là thay đổi có thể kiểm tra lặp lại. Chưa có bằng chứng cho giả định điểm nền50–70 hay thời gian tải4s. LCP vẫn còn khoảng3,2s trong phép đo mobile mô phỏng này. Cache headers của GitHub Pages do nền tảng phục vụ, không tuyên bố đã tùy chỉnh.

## Kiểm chứng bảo mật

Migration mới `20260929160000_opt_in_mfa_guard.sql` chỉ thêm guard, không ghi hồ sơ/role/phân công/công thức. Rehearsal PostgreSQL17 trên bản phục hồi có dữ liệu: chưa đăng ký/unverified được dùng; verified+aal1 bị từ chối; aal2 được dùng; giữ quyền cũ của anonymous/service. PostgREST thực trả403 với enrolled aal1 và200 với aal2. Storage API thực không cấp signed URL cho enrolled aal1, vẫn cấp cho hai trường hợp được phép. Signed URL đã phát hành trước đó giữ thời hạn vốn có.

RLS trên hai bảng published đã được kiểm tra; chưa chạy phiên WebSocket Realtime thật. Review độc lập chấp nhận đây là giới hạn bằng chứng cần ghi rõ, không phát hiện bypass. Browser kiểm tra challenge/reload, mã sai/đúng, QR/manual secret, hủy thiết lập/xóa đúng factor nháp, bật/tắt, lỗi429 khi tắt, đổi mật khẩu giữ AAL2 và logout khi request đang chờ. Không brute-force hay tạo hồ sơ thẩm định trên production.

## Cách sử dụng sau phát hành

Vào **Mật khẩu → Xác thực hai lớp → Bật xác thực hai lớp**, quét QR bằng ứng dụng xác thực rồi nhập mã6 chữ số. Những lần đăng nhập sau cần mã này. Để tắt, chọn đúng thiết bị và xác minh bằng mã hiện tại. Khi mất thiết bị, liên hệ IT để xác minh danh tính và khôi phục; đặt lại mật khẩu không bỏ qua MFA. Khuyến nghị các tài khoản quản trị chủ động bật và đổi mật khẩu yếu.

Báo cáo: chọn phạm vi bằng bộ lọc có nhãn; đọc hướng dẫn ngay trên trang; bấm số liệu để mở chi tiết; dùng nút xuất tương ứng. Bàn phím có thể mở chi tiết bằng Enter/Space và đóng bằng Escape.

## Nguồn nghiên cứu

- [WCAG2.2](https://www.w3.org/TR/WCAG22/): tương phản, bàn phím, resize text, reflow và tên truy cập.
- [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [password security](https://supabase.com/docs/guides/auth/password-security), [TOTP MFA](https://supabase.com/docs/guides/auth/auth-mfa/totp).
- [Securing Supabase APIs](https://supabase.com/docs/guides/api/securing-your-api): pre-request chỉ bảo vệ PostgREST; Storage/Realtime cần chính sách riêng.
- [First Contentful Paint](https://web.dev/articles/fcp): diễn giải FCP và ngưỡng tham khảo.

Bằng chứng chứa dữ liệu thật/backup lưu riêng trong `.cpc1/quality-upgrade-20260929`, không commit. Plan và rollout mô tả rollback/forward-fix, thứ tự guard trước khi mở enrollment trên web.

## Kết quả chốt local

- Unit: 957 tổng, 956 đạt, 1 skip theo cấu hình, 0 lỗi. Typecheck/build/bundle budget và design drift đạt.
- Luồng chính giả lập149/149; recovery19/19; chỉnh hạn kế hoạch39/39 trên build bật feature flag đúng cấu hình CI.
- e2e:quality: đăng nhập chống gửi trùng/429, MFA đầy đủ, phiên hết hạn, đổi mật khẩu giữAAL2, báo cáo/bàn phím, reflow và cold-JS budget.
- Báo cáo xuấtXLSX/HTML và in/retry có hồi quy riêng; axe20/20 và ma trận16 trường hợp đạt.
- Review độc lập đã đóng các lỗi race lúc đổi tài khoản/đổi mức xác thực; quyết định và yêu cầu đổi mật khẩu đều gắn với cùng token đã kiểm tra.
- CI giữ các cổng cũ, thêm e2e:quality và receipt niêm phong SQL/PostgREST/Storage. Một test cho phép đổi cổng để không chiếm preview của phiên làm việc khác.

Phát hành đang chờ hạ tầng: Supabase pooler trả `EAUTHQUERY` timeout, truy vấn quản lý544, Auth health504; endpoint health xác nhận DB/Auth/REST `UNHEALTHY`. Chưa xác định nguyên nhân. Không có migration/Auth setting/production write của đợt nâng cấp này. Người dùng xác nhận Supabase vẫn hoạt động; các lỗi trên là kết quả từ môi trường kiểm tra này, chưa xác định nguyên nhân hoặc phạm vi. Giữ nguyên dịch vụ, không khởi động lại. Sau phục hồi phải hoàn tất backup/preflight, áp đúng migration mới và cấu hình mật khẩu, postflight, CI và kiểm tra artifact/web thật trước khi đánh dấu deployed.

Final dependency audit: đã cập nhật Browserslist4.29.2 và baseline-browser-mapping2.11.26 cùng dữ liệu trình duyệt phụ thuộc trong phạm vi semver hiện có. npm audit từ2 cảnh báo (1high/1moderate) xuống0. Đây là dependency của công cụ build; không đổi thư viện nghiệp vụ. Typecheck/build/budget/cold-login/MFA smoke đạt; toàn bộ file dist sau cập nhật có hash giống hệt trước cập nhật. Nguồn: [Browserslist advisory](https://github.com/advisories/GHSA-c83g-rgw3-j3cx), [baseline mapping advisory](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv).

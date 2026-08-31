# VMP Desktop Experience System — Design Specification

**Ngày:** 2026-08-31

**Trạng thái:** Đã được chủ dự án duyệt ngày 2026-08-31

**Phạm vi:** Web desktop VMP, trừ toàn bộ khu vực Dòng thời gian/Long Môn
**Không phải:** implementation plan; tài liệu này không cho phép sửa mã sản phẩm

## 1. Quyết định thiết kế đã duyệt

Chọn **Phương án A — hợp đồng trải nghiệm dùng chung, nâng cấp theo lát cắt nhỏ**. Giữ nguyên ngôn ngữ Lotus Pearl, Vali, cấu trúc quyền và luồng nghiệp vụ; chỉ chuẩn hóa các điểm người dùng phải học lại giữa các màn: điều hướng, phản hồi thao tác, thứ bậc thông tin, motion, affordance và ngân sách hiệu năng.

Mục tiêu không phải “làm mới giao diện”. Mục tiêu là để người dùng desktop luôn trả lời được năm câu hỏi:

1. Tôi đang ở đâu và quay lại bằng cách nào?
2. Việc chính ở màn này là gì?
3. Nút này sẽ tạo ra kết quả nào?
4. Hệ thống đã nhận, đang xử lý hay thất bại?
5. Màn đã sẵn sàng để thao tác chưa?

## 2. Bằng chứng và phương pháp audit

Audit đọc-only được thực hiện trên cấu trúc route desktop, shared shell, queue thông báo, stylesheet, bundle production và các hợp đồng test hiện có. Không audit nội dung, model, CSS, test hay hành vi riêng của Dòng thời gian/Long Môn.

### 2.1 Bằng chứng mã nguồn

- `src/lib/navigationContract.ts` là nguồn thẩm quyền duy nhất cho intent, alias, thứ tự và fallback theo quyền. `today` đứng đầu; các alias cũ vẫn bảo toàn ý định.
- `src/App.tsx` giữ route trong hash, dùng `pushState` khi đổi màn và `replaceState` khi đổi bộ lọc; lắng nghe Back/Forward; route nặng dùng `React.lazy` và `Suspense`.
- `src/components/layout/Layout.tsx` trình bày ba cụm desktop: **Thực hiện**, **Giám sát**, **Phân tích & Quản trị**; trạng thái active, label, tooltip khi thu gọn và điều hướng chính có tên truy cập được.
- `src/hooks/index.ts::useScrollTop` chỉ đưa vùng chính về đầu trang khi đổi view. `main` có `tabIndex=-1`, nhưng hiện không được focus khi route đổi; focus chỉ chuyển khi người dùng kích hoạt skip link.
- `src/lib/toastQueue.ts` giới hạn bốn toast, giữ toast tác vụ dài tại chỗ khi chốt, và có thời lượng riêng theo loại.
- `src/components/ui/ToastProvider.tsx` có live region, lỗi dùng `role=alert`, trạng thái khác dùng `role=status`, toast kết thúc có nút đóng. API chưa mang action khôi phục như “Thử lại” hoặc “Hoàn tác”.
- `src/index.css` và các stylesheet Lotus đã có token/một số khối `prefers-reduced-motion`, nhưng motion còn phân tán: nhiều duration/easing viết trực tiếp và có cả transition làm thay đổi height/width.
- `src/components/dashboard/ReportsView.tsx` hiện ghi `PDF`, `Excel (đủ 5 sheet)`, `HTML`; hành vi in/tải chưa được nói ngay trong động từ.
- `src/features/today/TodayCommandCenter.tsx` và `src/pages/UpdatePage.tsx` dùng CTA ưu tiên `Mở <mã>`; động từ không nói rõ sẽ mở form cập nhật hay chỉ xem.

### 2.2 Bằng chứng chạy thực tế

- Build production ngày 2026-08-31 thành công trong 8.06 giây.
- Gzip shell chính: CSS **54.45 kB**, app **94.57 kB**, React vendor **43.24 kB**, Supabase vendor **54.16 kB**.
- Các bundle nặng vẫn được tách: `exceljs` **269.85 kB gzip**, `NhanTruc` **229.66 kB gzip**; chúng không được tải trước khi người dùng cần tính năng tương ứng.
- Build cảnh báo `supabaseClient.ts` vừa import tĩnh vừa import động; dynamic import hiện không tạo chunk riêng. Đây là bằng chứng cần đo trước khi tối ưu, không phải lý do để tái cấu trúc ngay.
- Playwright CLI tại viewport **1366×768** xác nhận màn đăng nhập có một `main`, hai region, `h1`, label form, nút hiện mật khẩu, nút đăng nhập và status cấu hình; title hiện là `V/Q team — CPC1 HN`.
- Kết quả đo đã commit trước đó cho các route ngoài phạm vi cấm cho thấy route incremental chủ yếu ở khoảng **14–68 kB**; màn Today cold khoảng **700 kB**, DOM cao nhất khoảng **1,275 node**. Các số này là mốc so sánh, không phải số liệu người dùng thực tế.

### 2.3 Chuẩn tham chiếu

- Core Web Vitals “tốt” tại phân vị 75: LCP ≤ 2.5 giây, INP ≤ 200 ms, CLS ≤ 0.1. Nguồn: [web.dev — Web Vitals](https://web.dev/articles/vitals).
- Motion không thiết yếu do tương tác phải có thể tắt và nên tôn trọng preference hệ điều hành. Nguồn: [W3C — Understanding SC 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).
- Hướng dẫn UI Pro Max được dùng để đối chiếu: route lazy-loading, focus sau navigation, action label theo kết quả, recovery đặt cạnh lỗi, target tối thiểu và progressive disclosure.

## 3. Điểm mạnh phải giữ

1. **IA theo công việc, không theo sơ đồ tổ chức.** “Thực hiện” đi trước “Giám sát”; fallback về Today phù hợp người dùng quyền hẹp.
2. **Một nguồn route contract.** Alias và quyền không bị nhân bản trong component trình bày.
3. **Deep link và Back/Forward có chủ đích.** Đổi màn tạo history entry, đổi filter không làm đầy history.
4. **Lotus Pearl/Vali có vai trò nghiệp vụ.** Vali dẫn ưu tiên và trạng thái, không chỉ trang trí.
5. **Toast nền tảng đã đúng hướng.** Queue có trần, thao tác dài được chốt tại chỗ, lỗi được announce khẩn cấp.
6. **Affordance tốt đã có ở Tổng quan, Cảnh báo và Dữ liệu nguồn.** Các CTA tại đây đã nói rõ đích/hành vi; không đổi label nếu không có bằng chứng mới.
7. **Hiệu năng đã có cấu trúc bảo vệ.** Route lazy, export nặng theo yêu cầu, font tự host với `font-display: swap`, visual/a11y gates đã được hợp nhất trong hai task trước.
8. **Brand và quyền là ràng buộc cứng.** Không thay tên Lotus Pearl, Vali, CPC1 HN; không thay authorization hay trạng thái dữ liệu.

## 4. Vấn đề ưu tiên

### P0 — hợp đồng bắt buộc trước khi mở rộng thay đổi

| Trục | Vấn đề có bằng chứng | Thiết kế bắt buộc | Vì sao P0 |
|---|---|---|---|
| Navigation | Đổi route chỉ scroll top; focus có thể còn ở nút sidebar cũ | Sau đổi view bằng click/Back/Forward, focus `main` hoặc heading màn; announce đúng heading; không focus khi chỉ đổi filter | Người dùng bàn phím/screen reader phải tự đi lại qua sidebar để biết nội dung đã đổi |
| Usability | Empty/error/loading chưa cùng một hợp đồng readiness ở mọi route | Mỗi route có đúng một trạng thái `loading / ready / empty / error`; error giữ recovery tại chỗ | Tránh “trang trống” và thao tác lại mù |
| Toast | Toast có thông báo nhưng không mang recovery action | Lỗi nghiệp vụ có inline error + action gần chỗ lỗi; toast chỉ bổ sung. Toast lỗi hệ thống có thể có một action “Thử lại” | Thông báo biến mất không được là nơi duy nhất hướng dẫn phục hồi |
| Motion | Quy tắc reduce-motion tồn tại nhưng phân tán | Shared motion contract; khi reduce: bỏ translate/scale/height/width animation, đưa ngay tới trạng thái cuối | Motion không thiết yếu không được cản đọc hoặc gây khó chịu |
| Performance | Chưa có budget route desktop làm release gate | Chốt CWV field target và budget lab bên dưới; gate bundle/route trước khi baseline hình ảnh | Không có ngưỡng thì regression chỉ được phát hiện bằng cảm giác |

### P1 — tăng rõ ràng và nhất quán

| Trục | Thay đổi | Lý do |
|---|---|---|
| IA | Giữ ba nhóm hiện tại; thêm title theo màn cho tab/browser history dưới dạng `<Tên màn> — V/Q team` | Tăng orientation khi mở nhiều tab; đây là navigation state, không thay route contract |
| Navigation | Giữ sidebar là primary navigation duy nhất; không thêm breadcrumb cho cấu trúc phẳng | Breadcrumb tạo tầng giả và chiếm chiều cao nhưng không cung cấp đường đi mới |
| Affordance | Today: CTA ưu tiên dùng `Cập nhật <mã>` nếu có quyền ghi, `Xem <mã>` nếu chỉ đọc | “Mở” không nói rõ kết quả; quyền phải nhìn thấy trước khi bấm |
| Affordance | Progress: `Mở <mã>` thành `Cập nhật <mã>`; ở read-only dùng `Xem <mã>` | Đồng nhất động từ với dialog thực tế, không đổi workflow hay quyền |
| Affordance | Reports: `PDF` thành `In / lưu PDF`; `Excel (đủ 5 sheet)` thành `Tải Excel · 5 sheet`; `HTML` thành `Tải HTML` | Nói rõ thao tác mở hộp in hay tải file |
| Toast | Thành công 3–4 giây; cảnh báo 5 giây; lỗi 6 giây hoặc đến khi người dùng đóng; tác vụ đang chạy không tự tắt | Đủ thời gian đọc, giữ semantics hiện có và không treo toast đang chạy |
| Motion | Chuẩn hóa 3 mức: fast 120–160 ms, base 180–220 ms, modal 220–280 ms; chỉ opacity/transform cho feedback | Giảm “mỗi component một nhịp”, tránh layout reflow |
| Performance | Intent-based prefetch chỉ sau focus/hover rõ ràng và chỉ khi không bật `Save-Data`; không prefetch bundle export/3D | Cải thiện chuyển màn mà không làm tăng tải nền vô cớ |

### P2 — chỉ làm khi có dữ liệu sử dụng

- Lưu preference sidebar thu gọn giữa các phiên. Chỉ làm nếu người dùng desktop thực sự dùng collapsed mode thường xuyên.
- Virtualize danh sách khi đo thấy >1,500 DOM node hoặc tương tác chậm; không thêm dependency, ưu tiên `content-visibility`/phân trang hiện có.
- Thu thập Web Vitals nội bộ chỉ khi chủ dự án duyệt privacy, endpoint và retention. Không thêm analytics trong scope này.
- Quick switcher/command palette chỉ xem xét sau khi có bằng chứng người dùng thường xuyên chuyển giữa nhiều route; hiện sidebar đã đủ rõ.

## 5. Ba phương án

### Phương án A — Hợp đồng trải nghiệm dùng chung, lát cắt nhỏ (khuyến nghị)

Đặt contract ở shared shell/toast/tokens, sau đó áp dụng label và state vào từng route độc lập. Mỗi lát cắt có test focused, visual 1366 và rollback riêng.

- **Ưu:** tác động hệ thống nhưng diff nhỏ; tận dụng kiến trúc hiện tại; dễ kiểm chứng; không cần runtime dependency.
- **Nhược:** cần kỷ luật file ownership vì `App.tsx`, `Layout.tsx`, `index.css` là shared hotspots.
- **Điều kiện:** shared shell không làm thay đổi nội dung hay hành vi inner Long Môn; không cập nhật baseline/seal liên quan khu vực đó.

### Phương án B — Tái thiết kế navigation và visual shell đồng loạt

Đổi cấu trúc sidebar/topbar, density, animation và các route trong một release.

- **Ưu:** cảm nhận thay đổi rõ.
- **Nhược:** regression surface rất lớn; trộn usability với thẩm mỹ; khó chứng minh nguyên nhân; rủi ro cao tới brand, quyền và vùng cấm.
- **Kết luận:** không chọn.

### Phương án C — Vá từng trang, không có contract dùng chung

Mỗi route tự sửa button, toast, loading và motion.

- **Ưu:** bắt đầu nhanh.
- **Nhược:** lặp state, duration, semantics và dễ drift; vấn đề shared không được giải quyết.
- **Kết luận:** chỉ dùng cho label route-specific sau khi contract chung đã chốt.

## 6. Thiết kế khuyến nghị theo bảy trục

### 6.1 Navigation

- `navigationContract.ts` tiếp tục là authority duy nhất; component không tự thêm alias/fallback.
- Sidebar desktop giữ ba nhóm, thứ tự và active state. Admin chỉ được gộp về mặt trình bày; quyền và contract vẫn tách.
- Sau route commit, focus vùng `main` hoặc `h1` của route, scroll top và cập nhật title trong cùng effect. Chỉ đổi filter thì giữ focus và scroll.
- Back/Forward phải đi qua cùng route-settlement path với click sidebar.
- Route bị cấm tiếp tục fallback fail-closed; không hiện item rồi disable nếu người dùng không có quyền xem.
- Không thêm bottom nav, mega-menu hay breadcrumb desktop.

### 6.2 Toast

- Queue tối đa bốn; newest thay oldest như hiện tại; long-running toast chốt tại cùng vị trí.
- Data model mở rộng tùy chọn một `actionLabel/action`; không hỗ trợ nhiều action trong toast.
- Thành công chỉ xác nhận kết quả. Cảnh báo giải thích điều cần lưu ý. Lỗi phải nói được `việc gì thất bại + dữ liệu có được lưu không + bước tiếp theo`.
- Validation/business error đặt inline, focus tới summary/trường lỗi; không chỉ toast.
- Nút đóng luôn có accessible name; hover/focus không phải cách duy nhất để thấy recovery.
- Spinner “đang chạy” dừng quay dưới reduce-motion nhưng vẫn giữ icon và text trạng thái.

### 6.3 Usability

- Mọi route có state boundary thống nhất: skeleton có kích thước gần nội dung thật; empty giải thích phạm vi/filter; error giữ nút retry; ready mới enable primary action.
- Không xóa filter đang dùng khi route refresh hay Back/Forward.
- Dirty form protection tiếp tục chặn logout/navigation gây mất dữ liệu; lời nhắc nêu cụ thể phần chưa lưu.
- Desktop 1366 là viewport chấp nhận chính: phần việc đầu tiên và primary action phải xuất hiện trong fold mà không redesign hero.
- Vali chỉ đưa một ưu tiên chính; không nhân bản lời khuyên ở nhiều card.

### 6.4 Information architecture

- Mức 1 là nhóm sidebar; mức 2 là route; filter/tabs bên trong route là mức 3. Không biến filter thành route mới.
- Heading mỗi route duy nhất và khớp label sidebar; subtitle giải thích phạm vi, không lặp tên.
- Today là “việc cần làm”; Progress là “ghi tiến độ”; Overview là “tình hình”; Alerts là “ngoại lệ”; Reports là “xuất/diễn giải theo kỳ”. Không đổi ranh giới nghiệp vụ này.
- Tổng quan, Cảnh báo và Dữ liệu nguồn giữ CTA hiện tại; chỉ Today, Progress, Reports đổi copy ở P1.

### 6.5 Motion

- Motion mang nghĩa: feedback press, open/close dialog, settlement của toast. Không dùng motion để bù hierarchy yếu.
- Dùng opacity/transform; không animate height/width ở flow chính. Sidebar có thể đổi kích thước tức thời và animate nội dung nội bộ, miễn layout không rung.
- Không quá một chuyển động nhấn mạnh tại một thời điểm trong viewport.
- `prefers-reduced-motion: reduce` đưa UI tới final state ngay; không trì hoãn focus, callback hay data commit theo `transitionend`.
- Shared token áp dụng shell/chung; không sửa selector, keyframe hay model riêng vùng cấm.

### 6.6 Affordance

- Label dùng `động từ + đối tượng/kết quả`; icon chỉ hỗ trợ, không thay label.
- Quyền read-only thể hiện bằng động từ `Xem`, không dùng disabled button nếu hành vi xem vẫn hợp lệ.
- Button chính dùng một treatment nhất quán; destructive action tách khỏi primary group và có confirm khi không thể hoàn tác.
- Target tương tác desktop tối thiểu 24×24 CSS px, ưu tiên 36–40 px cho action thường dùng; focus ring không bị clip/che.
- Hover không tạo nội dung thiết yếu; tooltip chỉ giải thích bổ sung.

### 6.7 Performance

**Field target (khi có đo người dùng và privacy được duyệt):** tại p75 desktop, LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1.

**Lab/release budgets trước khi có field data:**

| Hạng mục | Budget | Cách hiểu |
|---|---:|---|
| Shell gzip JS + CSS, không tính route heavy theo yêu cầu | ≤275 kB | Mốc build hiện tại xấp xỉ 256 kB cho app + React + Supabase + icon vendor + CSS; giữ headroom khoảng 7% |
| Route incremental thông thường | ≤100 kB gzip | Cảnh báo nếu vượt; ngoại lệ phải có số đo và phê duyệt |
| Reports trước thao tác xuất | ≤50 kB gzip | Không tải Excel/3D trước click/focus intent rõ ràng |
| Ảnh Vali đơn | ≤80 kB | Giữ asset WebP và khai báo kích thước/tỉ lệ để tránh shift |
| DOM ready tại 1366 | cảnh báo >1,500 node | Mốc hiện tại cao nhất khoảng 1,275; không tối ưu sớm dưới ngưỡng |
| Long task lúc route settle/first action | không task >50 ms | Đo trong trace focused, không suy từ DCL |
| Route skeleton | xuất hiện ≤100 ms | Phản hồi tức thời khi cần chờ chunk/data |
| Primary actionable content | ≤2.5 s trong mock cold lab | Dùng như regression budget, không gọi là dữ liệu field |

Budget chỉ tính route trong scope. Không thêm framework, runtime dependency hay analytics package. Trước tối ưu phải dùng build report/Performance trace để xác định chunk hoặc component chịu trách nhiệm.

## 7. Kiến trúc, dependency và shared state

| Biên | File authority hiện tại | Trạng thái/dependency | Quy tắc thiết kế |
|---|---|---|---|
| Route intent/quyền | `src/lib/navigationContract.ts`, `src/lib/access.ts` | `ScreenId`, alias, fallback | Không nhân bản trong UI |
| Route URL/history | `src/App.tsx`, `src/lib/urlState.ts` | view, filter, Back/Forward | Route push; filter replace; focus chỉ khi route đổi |
| Navigation UI | `src/components/layout/Layout.tsx` | collapsed, mobile drawer, active view | Scope chỉ desktop; giữ role-aware items |
| Main readiness | `src/App.tsx`, `src/components/ui/StateBoundary.tsx` | loading/empty/error/ready | Một contract, recovery inline |
| Toast | `src/lib/toastQueue.ts`, `src/components/ui/ToastProvider.tsx` | queue, timer, settlement | Model pure trước, renderer sau |
| Motion/theme | `src/styles/lotus-tokens.css`, `src/styles/lotus-components.css`, `src/styles/lotus-shell.css`, phần shared của `src/index.css` | theme, motion preference | Token hóa; tránh selector vùng cấm |
| Route CTA | `src/features/today/TodayCommandCenter.tsx`, `src/pages/UpdatePage.tsx`, `src/components/dashboard/ReportsView.tsx` | permission/read-only/export state | Chỉ copy/accessible name, không đổi mutation |
| Performance | `vite.config.js`, lazy imports trong `src/App.tsx`, `scripts/do-hieu-nang.mjs` | chunks, mock lab | Đo route trong scope; heavy only on demand |
| Release guards | `tests/unit/*contract*.test.mjs`, `tests/a11y/a11y.spec.ts`, `tests/visual/lotus.spec.ts` | drift/a11y/visual matrix | Giữ commit Task 1/2; không cập nhật baseline/seal vùng cấm |

Shared hotspots (`App.tsx`, `Layout.tsx`, `index.css`, toast files) phải được triển khai tuần tự. Route copy độc lập chỉ được song song khi không chung test fixture/baseline. Không thay database, schema, RPC, RLS, auth contract hay dependency graph.

## 8. Scope chính xác

### In scope

- Desktop shell và các route được quyền hiển thị: đăng nhập, Today, Progress, Source, Overview, Alerts, Workload, Reports, Rules, Accounts, Phân quyền, Health, Audit, Admin.
- Route settlement/focus/title, toast/recovery contract, readiness states, label Today/Progress/Reports, shared motion tokens và performance budgets.
- Visual/focused geometry ở 1366×768; 1920 dùng regression smoke, không tạo layout khác.
- Giữ nguyên và tận dụng guardrail drift + visual/CI đã hoàn tất.

### Out of scope

- Toàn bộ component/page/model/stylesheet/test/behavior riêng của Dòng thời gian/Long Môn. Không chỉnh baseline hoặc seal liên quan vùng này.
- Mobile/responsive redesign; shared code chỉ được đổi khi desktop có guard và mobile không bị suy giảm ngoài ý muốn.
- Database/schema/RPC/RLS, quyền nghiệp vụ, mutation semantics, nội dung nghiệp vụ GMP.
- Runtime/framework dependency mới, public analytics, redesign brand, thay Vali/Lotus Pearl/CPC1 HN.
- Push, merge, deploy, thay production config hoặc tạo implementation plan trước phê duyệt.

## 9. Acceptance evidence cho giai đoạn sau

Đây là tiêu chí thiết kế để chuyển thành RED/GREEN sau khi spec được duyệt, chưa phải lệnh triển khai.

1. **Navigation focused:** route click và Back/Forward focus đúng main/heading; filter change giữ focus; URL và permission fallback không đổi.
2. **Toast focused:** queue cap, in-place settlement, timer cleanup, optional recovery action, error inline; keyboard và live-region semantics được kiểm.
3. **CTA focused:** snapshot/DOM tại 1366 cho Today, Progress, Reports chứng minh label mới; Overview, Alerts, Source không đổi.
4. **Motion focused:** emulate `prefers-reduced-motion`; không có transform/layout motion còn chạy trong shared shell; final state và focus không phụ thuộc animation.
5. **Performance focused:** build budget và trace cold route ngoài vùng cấm; không tải `exceljs`/3D trước intent; DOM/long-task thresholds báo lỗi rõ.
6. **Release:** typecheck, build, unit/a11y/visual gates hiện có. Không thêm expectation, snapshot, baseline hay seal cho vùng cấm.

## 10. Rủi ro và rollback

| Rủi ro | Giảm thiểu | Rollback unit |
|---|---|---|
| Auto-focus làm gián đoạn người dùng chuột | Chỉ focus sau route commit, không sau filter/data refresh; dùng `preventScroll` khi đã scroll top | Effect route-settlement riêng |
| Toast action gọi stale callback | Queue model lưu action ID/intent ổn định; provider hủy timer và callback khi dismiss/unmount | Mở rộng toast model/provider |
| Token motion ảnh hưởng quá rộng | Đổi shared selector theo allowlist; visual 1366 từng route; giữ vùng cấm ngoài selector | Commit token/shared CSS riêng |
| Prefetch tăng băng thông | Chỉ intent-based, tôn trọng Save-Data, có bundle assertion | Helper prefetch riêng |
| Budget giả dương do môi trường | Khóa Node/browser/viewport/mock; dùng tolerance và báo số thực | Test budget/config riêng |
| Shared shell vô tình tác động vùng cấm | Không sửa inner component/CSS/model/test; chạy gate hiện có nhưng không regenerate baseline | Revert shared shell slice |

Mỗi lát cắt sau này phải là một commit có thể revert độc lập. Không gộp route copy, toast model, motion token và performance tooling vào cùng commit.

## 11. Quyết định đã được chủ dự án duyệt

Ngày 2026-08-31, chủ dự án duyệt Phương án A với các quyết định sau:

1. Duyệt **Phương án A**: contract dùng chung + lát cắt nhỏ, không redesign shell.
2. Duyệt P0 gồm route focus/orientation, readiness/error recovery, toast recovery, reduced motion và performance budgets.
3. Duyệt copy P1: Today/Progress dùng `Cập nhật <mã>` hoặc `Xem <mã>` theo quyền; Reports dùng `In / lưu PDF`, `Tải Excel · 5 sheet`, `Tải HTML`.
4. Duyệt các budget lab: shell 275 kB gzip; route thường 100 kB; Reports pre-export 50 kB; DOM warning 1,500; không long task >50 ms.
5. Xác nhận shared shell được phép đổi với điều kiện không thay inner Long Môn và không cập nhật baseline/seal liên quan vùng đó.

Bước kế tiếp là để chủ dự án xác nhận bản spec đã ghi đúng quyết định; sau đó mới viết implementation plan TDD theo file ownership tuần tự, review checkpoints và rollback units ở trên.

# Tối ưu hiệu năng VMP theo hướng cân bằng

**Ngày:** 03/09/2026  
**Phạm vi:** bản local trên nhánh `cai-tien/desktop-wave-1`  
**Mục tiêu:** làm ứng dụng tải nhanh và chuyển màn mượt hơn mà không thay đổi giao diện, dữ liệu, quyền hay quy trình nghiệp vụ.

## 1. Baseline đã đo

Đo trên production build local, Chrome headless, Supabase mock:

- CSS entry: 176,3 KB raw, ngân sách hiện tại 200 KB.
- JavaScript đường găng: 189,8 KB gzip, ngân sách hiện tại 220 KB.
- Tổng `dist`: 3,62 MB.
- Bảy route desktop tải lạnh khoảng 1,04–1,12 MB mỗi route.
- `reports` có long task cao nhất 106 ms; `progress` 67 ms; `alerts` 64 ms.
- Mọi route được đo đều tải hai tranh Long Môn 237 KB và 149 KB dù người dùng không mở Dòng thời gian.
- `ReportsView` vừa được import tĩnh trong `App.tsx`, vừa được import động trong `routePrefetch.ts`; vì vậy Vite giữ nó trong bundle lõi và phát cảnh báo dynamic import không tách được chunk.

## 2. Nguyên nhân trong phạm vi

### 2.1. Prefetch nền quá rộng

`prefetchKhiRanh()` tự import `TimelinePage`, `UpdatePage` và `AlertsPage` sau đăng nhập. Import `TimelinePage` làm trình duyệt tải cả CSS/tài nguyên Long Môn, nên màn hiện tại phải chia băng thông và CPU cho nội dung chưa được yêu cầu.

### 2.2. Báo cáo chưa được lazy-load thật

`ReportsView` được import tĩnh và bọc `memo`, trong khi helper prefetch lại import động cùng module. Import tĩnh thắng, làm mã Báo cáo nằm trên đường khởi động và vô hiệu hóa mục tiêu chia route.

### 2.3. Gate chưa bắt đúng hồi quy tải chéo route

Ngân sách hiện tại kiểm kích thước tổng và một số optional JavaScript chunk, nhưng chưa cấm tranh Long Môn xuất hiện trên cold load của các route không phải Timeline. Hồi quy vì thế vẫn đạt gate tổng.

## 3. Thiết kế được duyệt

### 3.1. Chỉ tải nội dung đang dùng

- Gỡ prefetch nền hàng loạt sau đăng nhập.
- Giữ các route là `React.lazy()` qua `nhapCoThuLai()` để tiếp tục chống lỗi chunk cũ sau deploy.
- Không preload Timeline, ExcelJS hoặc tài nguyên nặng khi người dùng chưa yêu cầu.
- Không thay đổi cách tải dữ liệu Supabase trong đợt này.

### 3.2. Prefetch dựa trên ý định

- Dùng helper `prefetchDesktopRoute()` hiện có cho các route nhẹ đã được allowlist.
- Chỉ prefetch trên desktop khi người dùng hover/focus điều hướng và `Save-Data` không bật.
- Timeline tiếp tục nằm ngoài allowlist vì chỉ riêng hai tranh chính đã khoảng 386 KB; lần mở đầu dùng skeleton hiện có.
- Không thêm timer, hàng đợi hoặc thư viện prefetch mới.

### 3.3. Lazy-load Báo cáo thật sự

- Thay import tĩnh `ReportsView` bằng một loader module dùng cho `React.lazy()`.
- Bỏ lớp `memo` dư thừa quanh route component; việc mount chỉ xảy ra khi route Báo cáo được chọn.
- `routePrefetch.ts` tiếp tục import cùng module để trình duyệt/module registry tự khử trùng lặp khi người dùng có ý định mở màn.
- Giữ nguyên props, nội dung, state và giao diện của Báo cáo.

### 3.4. Chuyển màn có phản hồi ngay

- Giữ `Suspense` và `SkeletonDashboard` hiện tại làm phản hồi tức thời khi chunk chưa sẵn sàng.
- Không thêm animation nặng hoặc thay đổi thứ tự render.
- Không đưa toàn bộ điều hướng vào `startTransition` trong đợt này vì có thể giữ màn cũ quá lâu và làm tín hiệu chuyển màn kém rõ; chỉ xem xét nếu đo tương tác sau tối ưu vẫn có vấn đề.

### 3.5. Render optimization có điều kiện

- Sau khi sửa đường tải, đo lại `reports` và `progress`.
- Chỉ tối ưu render nếu long task còn vượt 50 ms và profiler/đo runtime chỉ ra đoạn tính toán cụ thể.
- Không rải `useMemo`, `useCallback` hoặc `memo` theo cảm tính.
- Không dọn CSS diện rộng trong đợt này; việc xóa selector mồ côi cần một spec và visual gate riêng để tránh lệch UI.

## 4. Hợp đồng kiểm thử

### Unit/contract

- Helper prefetch vẫn từ chối mobile, `Save-Data` và route ngoài allowlist.
- Manifest production phải có chunk Báo cáo riêng.
- Entry chunk không được chứa dấu hiệu cho thấy `ReportsView` bị nhập tĩnh.

### Runtime

- Cold load các route `reports`, `alerts`, `progress`, `source`, `workload`, `rules`, `phanquyen` không được tải file có tên Long Môn trước hành động người dùng.
- Không tải ExcelJS trước thao tác xuất file.
- Skeleton route xuất hiện trong ngân sách hiện tại.
- Primary action vẫn sẵn sàng trong 2.500 ms.
- Long task mục tiêu không quá 50 ms; nếu môi trường Windows dao động, báo số đo thật và không che giấu lỗi gate.

### Regression

- Chạy targeted unit cho route prefetch/performance budget.
- Chạy typecheck, production build, bundle budget và mocked desktop runtime gate.
- Chạy mocked E2E điều hướng Báo cáo và các route bị tác động trực tiếp.
- Không chạy E2E production `npm run e2e` hoặc `quet-tat-ca-man.mjs`.

## 5. Tiêu chí hoàn thành

1. Hai tranh Long Môn 237 KB và 149 KB không còn xuất hiện trong cold load của route không phải Timeline.
2. `ReportsView` được tạo thành chunk route riêng và không còn cảnh báo import tĩnh/động của module này khi build.
3. JS đường găng và CSS entry không tăng so với baseline ngoài sai số hash/minify; mọi ngân sách hiện hành đạt.
4. Giao diện và hành vi nghiệp vụ không thay đổi.
5. Có bảng so sánh trước/sau từ cùng script đo local.
6. Không push, deploy, apply migration hoặc ghi dịch vụ remote.

## 6. Rủi ro và cách giới hạn

- **Lần đầu mở Timeline có thể chờ lâu hơn:** chấp nhận có chủ đích để không bắt mọi người dùng tải 386 KB; skeleton giữ phản hồi trực quan.
- **Prefetch trên hover có thể vẫn tải route người dùng không mở:** chỉ áp dụng allowlist màn nhẹ, desktop và không Save-Data.
- **Số đo long task dao động theo máy:** so sánh bằng cùng build, mock, Chrome và viewport; báo cả từng route thay vì chỉ kết luận đạt/trượt.
- **Thay đổi chunk có thể làm lỗi deploy giữa phiên:** tiếp tục dùng `nhapCoThuLai()` và test điều hướng lazy route.

## 7. Ngoài phạm vi

- Không đổi backend, Supabase RPC, cache dữ liệu hay authorization.
- Không thêm service worker, PWA hoặc dependency mới.
- Không đổi giao diện, typography, animation hay responsive layout.
- Không xóa CSS diện rộng.
- Không tối ưu Timeline bằng cách giảm chất lượng tranh trong đợt này.

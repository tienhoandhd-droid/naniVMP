# Thiết kế tinh chỉnh UX desktop data-first cho VMP

**Ngày:** 2026-08-31

**Nền:** `origin/main@6fdfe015763f7dbfd9f9cd2278b3a2f8cf451eab`

**Trạng thái:** Định hướng đã được người dùng chấp thuận; chờ duyệt đặc tả viết trước khi lập kế hoạch triển khai.

## 1. Mục tiêu

Tinh chỉnh VMP Monitor cho người dùng máy tính tại ba khổ chuẩn `1366×768`, `1440×900` và `1920×1080`. Giữ nguyên nhận diện Lotus Pearl, Vali, Long Môn, CPC1 HN và toàn bộ nghiệp vụ hiện có; giảm phần giao diện lặp lại phía trên vùng làm việc, tăng khả năng đọc dữ liệu chính xác và khôi phục các cổng kiểm UX/UI trước khi phát hành.

Kết quả phải làm VMP nhanh hơn để đọc và hành động nhưng vẫn nhận ra ngay là VMP, không biến thành dashboard SaaS tím–hồng đại trà.

## 2. Bản sao và khả năng quay lại

Trước mọi thay đổi sản phẩm, phiên bản giao diện gốc được giữ bằng hai lớp:

- Git tag local `backup/ui-desktop-before-refinement-20260831`, trỏ tới đúng commit `6fdfe015`.
- Git bundle độc lập `/home/admin1/VMP/backups/naniVMP-ui-before-desktop-refinement-20260831.bundle`, đã qua `git bundle verify` và chứa lịch sử đầy đủ.

Mọi thay đổi đi trên branch `feat/desktop-ux-data-first-20260831` trong worktree riêng. Mỗi lát chức năng có commit và kiểm thử độc lập; có thể quay lại toàn bộ bằng tag hoặc quay lại từng lát bằng commit.

## 3. Phạm vi và ngoài phạm vi

### Trong phạm vi

1. Khôi phục guardrail desktop: design drift, axe, visual matrix và workflow baseline.
2. Nén masthead, bộ lọc phạm vi và Monitoring Journey trên Tổng quan, Dòng thời gian và Cảnh báo.
3. Đưa nội dung hành động đầu tiên lên trong fold đầu ở `1366×768`.
4. Giữ Long Môn làm hình ảnh chính và bổ sung lớp danh sách hành động đọc được ngay.
5. Nâng chữ nghiệp vụ lên tối thiểu 12px và đưa màu/radius đang chạm về token có chủ đích.
6. Dọn component/CSS Timeline cũ đã không còn render, sau khi có test chứng minh không còn consumer.
7. Thu gọn panel bộ lọc Báo cáo bằng progressive disclosure mà không đổi dữ liệu hoặc file xuất.

### Ngoài phạm vi

- Không hỗ trợ hay thiết kế lại mobile; không thêm baseline mobile.
- Không đổi schema, migration, RLS, RPC, Supabase hay công thức nghiệp vụ.
- Không thay nhận diện CPC1 HN, không bỏ Vali hoặc Long Môn.
- Không thêm framework UI, chart library hoặc dependency runtime mới.
- Không push, merge, deploy hoặc thay đổi production nếu chưa có phê duyệt riêng.
- Không làm lại toàn bộ các màn quản trị không liên quan trực tiếp tới các bề mặt được nêu trên.

## 4. Các phương án đã cân nhắc

### A. Tinh chỉnh theo lát data-first — chọn

Giữ shell và nhận diện hiện tại; sửa lần lượt guardrail, density, Timeline action dock, type scale và CSS chết. Phương án này có rollback nhỏ, giữ được ngôn ngữ riêng và cho phép đo từng thay đổi ở ba viewport desktop.

### B. Chỉ vá CSS nhanh — không chọn

Giảm padding, tăng font và cập nhật baseline mà không thêm lớp dữ liệu cho Long Môn hay sửa workflow. Nhanh hơn nhưng không giải quyết việc Timeline chỉ dựa vào hover/focus và để guardrail tiếp tục trôi.

### C. Thiết kế lại toàn bộ thành dashboard enterprise — không chọn

Đổi Long Môn/Vali thành KPI card, bảng và biểu đồ chuẩn. Dễ đồng nhất nhưng xoá điểm khác biệt mạnh nhất của VMP và tạo đúng cảm giác giao diện AI/SaaS đại trà mà dự án muốn tránh.

## 5. Kiến trúc thay đổi

Chương trình được chia thành ba deliverable tuần tự, mỗi deliverable chạy được độc lập.

### Deliverable 1 — Guardrail và thang thiết kế

- `scripts/check-design-drift.mjs` tiếp tục quét code đã migration nhưng phải có regression test cho số vi phạm và khai báo nền nhiều dòng.
- `.github/workflows/deploy.yml` chạy `npm run drift` và `npm run a11y` trước build phát hành.
- `.github/workflows/visual-baseline.yml` không hard-code ma trận cũ 39 PNG. Một contract duy nhất xác nhận số case visual hiện tại, cây baseline và seal.
- Visual regression giữ ba viewport desktop, light/dark và login. Snapshot mới chỉ được niêm phong sau khi review ảnh thủ công; không tự động chấp nhận diff.
- Chữ mang thông tin hoặc điều khiển không nhỏ hơn `12px`. Thang khuyến nghị là `12 / 14 / 16 / 24 / 32px`.
- Radius dùng theo vai trò: `10px` cho control, `16–18px` cho card dữ liệu, `24px` cho khối nhận diện lớn và `999px` chỉ cho pill.

### Deliverable 2 — Chrome desktop gọn và nội dung lên fold đầu

- Sidebar tiếp tục là điều hướng chính; không tạo một hệ điều hướng thứ hai.
- Masthead giữ logo chữ, tiêu đề màn, thời điểm đồng bộ, theme, làm mới và vai trò nhưng giảm khoảng trống dọc.
- Monitoring Journey đổi từ ba card cao thành một thanh tab ngữ nghĩa có icon, tên và badge số lượng. Trạng thái active vẫn có `aria-current="page"` và focus rõ.
- Bộ lọc phạm vi nằm cùng vùng context, chỉ mở chi tiết khi người dùng bấm “Bộ lọc”.
- Tại `1366×768`, điểm bắt đầu của bề mặt chính trên Tổng quan, Timeline và Cảnh báo không thấp hơn mép trên quá `360px`; CTA hoặc dòng dữ liệu ưu tiên đầu tiên phải nhìn thấy mà không cuộn.
- Hero Vali ở Việc hôm nay và Cập nhật tiến độ vẫn được giữ nhưng giảm chiều cao đủ để table header và ít nhất một dòng dữ liệu xuất hiện trong fold đầu tại `1366×768`.
- Báo cáo giữ bốn control chính và ba nút xuất trên hàng đầu; phần giải thích cách đếm chuyển vào disclosure “Cách tính báo cáo”. KPI đầu tiên phải xuất hiện trong fold đầu tại `1366×768`.

### Deliverable 3 — Long Môn có lớp dữ liệu hành động

- `LongMonRace` vẫn là bề mặt chính của Timeline và vẫn dùng tranh hiện tại.
- Tạo model thuần `buildLongMonActionQueue(activities, now)` dùng cùng deadline canonical với cá Long Môn. Model trả hai nhóm: quá hạn và sắp hạn, sắp theo mức khẩn cấp rồi mã.
- Tạo `LongMonActionDock` đặt trên cạnh phải của tranh ở desktop. Dock rộng khoảng `280–340px`, có thể thu gọn, không che vạch “Hôm nay” hoặc cổng Vũ Môn.
- Dock hiển thị tối đa tám việc: mã đầy đủ, tên rút gọn, QA, deadline và số ngày; click dùng đúng callback mở `ActivityDetailModal` hiện có.
- Ô tìm kiếm lọc client-side trên mã, tên và QA. Hai tab “Quá hạn” và “Sắp hạn” giữ số lượng thật.
- Nhãn tuần hiện dùng 7px được giảm mật độ mốc thay vì tiếp tục thu nhỏ; chữ tuần, scope, code và chú giải phải đạt tối thiểu 12px.
- Khi dock rỗng, hiện lý do theo phạm vi hiện tại; khi model lỗi, `LongMonRaceGuard` và danh sách fallback hiện có vẫn là đường an toàn.

## 6. Component và file ownership dự kiến

- `src/features/monitoring/MonitoringJourney.tsx`: markup thanh context dùng chung.
- `src/features/monitoring/monitoring.css`: density của Monitoring Journey và Alerts command surface.
- `src/features/monitoring/longMonActionQueue.ts`: model thuần cho dock.
- `src/features/monitoring/LongMonActionDock.tsx`: UI tìm kiếm/tab/danh sách.
- `src/features/monitoring/LongMonRace.tsx`: tích hợp dock, không đổi thuật toán xếp cá ngoài điều chỉnh khoảng trống an toàn.
- `src/features/monitoring/long-mon-race.css`: token Long Môn, type scale và bố cục dock.
- `src/pages/TimelinePage.tsx`: truyền dữ liệu/callback; xóa export cũ chỉ sau khi `rg` và test chứng minh không có consumer.
- `src/components/dashboard/ReportsView.tsx` và CSS liên quan: progressive disclosure của mô tả báo cáo.
- `src/features/today/today.css`, `src/features/progress/progress.css`, `src/styles/lotus-shell.css`: chỉ chỉnh density desktop trong phạm vi trực tiếp.
- `.github/workflows/*.yml`, `scripts/check-design-drift.mjs`, `scripts/check-visual-runtime.mjs`: guardrail và baseline lifecycle.
- `tests/unit/*.test.mjs`, `tests/a11y/a11y.spec.ts`, `tests/visual/lotus.spec.ts`: RED/GREEN và regression.

Các file shared như `src/index.css`, `TimelinePage.tsx` và workflow được sửa tuần tự dưới primary planner. Không giao song song hai task cùng chạm một file.

## 7. Trạng thái, lỗi và accessibility

- Thanh context và action dock dùng button/input thật, label thật, focus visible và trình tự bàn phím theo thứ tự nhìn.
- Không dựa vào màu để diễn giải quá hạn/sắp hạn; mỗi dòng có nhãn chữ và ngày.
- Dock thu gọn giữ tên truy cập mô tả trạng thái hiện tại bằng `aria-expanded`/`aria-controls`.
- Không tạo animation mới ngoài transition ngắn; mọi motion mới phải tôn trọng `prefers-reduced-motion`.
- Dark mode dùng semantic token hoặc token Long Môn cục bộ; không đổi màu gốc của tranh chỉ để “ép tối”.
- Lỗi model/dữ liệu không làm mất tranh; empty/error state không che đường mở hồ sơ hiện có.

## 8. RED/GREEN và tiêu chí nghiệm thu

Mỗi hành vi mới phải có test thất bại đúng lý do trước production code.

1. Contract workflow thất bại khi visual matrix và baseline count không khớp; GREEN khi dùng cùng một nguồn contract.
2. Design drift thất bại với chữ nghiệp vụ dưới 12px hoặc background trắng literal viết nhiều dòng.
3. Monitoring Journey test xác nhận tab ngữ nghĩa, `aria-current`, badge và không còn card cao ở desktop.
4. Geometry E2E xác nhận bề mặt chính bắt đầu không quá 360px từ mép trên tại `1366×768`.
5. Today/Progress/Reports geometry xác nhận nội dung dữ liệu đầu tiên xuất hiện trong fold đầu.
6. `buildLongMonActionQueue` phân nhóm, sắp xếp và xử lý deadline canonical đúng ở biên ngày Bangkok.
7. LongMon action dock lọc theo mã/tên/QA, mở đúng hồ sơ và dùng được hoàn toàn bằng bàn phím.
8. Chữ Long Môn mang thông tin có computed font size từ 12px trở lên tại ba viewport desktop.
9. Axe không có vi phạm critical/serious trên sáu màn hiện có và bổ sung Workload/Source nếu thay đổi shared shell ảnh hưởng chúng.
10. Visual matrix light/dark ở 1366, 1440 và 1920 được review thủ công trước khi seal.

## 9. Review checkpoints

- Sau Deliverable 1: reviewer độc lập kiểm workflow, baseline contract và guardrail; primary planner chạy lại targeted tests.
- Sau Deliverable 2: reviewer UI độc lập so ảnh 1366/1440/1920, light/dark; primary planner kiểm diff và geometry.
- Sau Deliverable 3: reviewer ít nhất mức Terra kiểm model/UI; final review mức Sol kiểm toàn bộ thay đổi shared, accessibility và rollback.
- Critical/Important feedback phải xử lý trước task tiếp theo. Không dựa vào báo cáo subagent thay cho diff và verification của primary planner.

## 10. Xác minh cuối và bàn giao

Trước khi báo hoàn tất, chạy mới trên Node `24.18.0`:

```bash
npm run typecheck
npm run test:unit
npm run drift
bash scripts/with-preview.sh -- npm run a11y
bash scripts/with-preview.sh -- npm run visual
npm run build
```

Ngoài ra chạy targeted desktop geometry/E2E của các màn bị đổi. Nếu baseline chưa thể seal vì workflow GitHub cần push, báo rõ trạng thái còn mở; không gọi công việc là hoàn tất.

Không push, merge hoặc deploy trong kế hoạch này. Bàn giao gồm branch local, danh sách commit, đường dẫn bundle backup, kết quả kiểm thử và các bước để chủ dự án tự phê duyệt phát hành.

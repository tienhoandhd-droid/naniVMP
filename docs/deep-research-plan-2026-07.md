# Phương án nghiên cứu chuyên sâu — VMP Monitor (GitHub)

Ngày lập: 2026-07-06

Phạm vi: (A) xác minh cơ chế đồng bộ Supabase ↔ Google Sheet, (B) phương án
nghiên cứu chuyên sâu 4 trục — giao diện, trình bày, biểu đồ, tốc độ — có tham
khảo GitHub Trending thực tế và số liệu 2026.

Ràng buộc bất biến (giữ nguyên như các doc research/upgrade trước):

- Chỉ đọc dữ liệu runtime từ Supabase read model. Không thêm đường ghi nghiệp vụ
  từ browser.
- Không sửa Supabase RPC/schema/RLS hoặc n8n workflow.
- Không commit snapshot dữ liệu thật vào repo.
- Ưu tiên tài liệu render được trên GitHub trước khi thêm dependency nặng.
- Deploy tĩnh qua GitHub Pages; dữ liệu hiện tại ~476 hạng mục / ~214 đối tượng.

---

## A. Supabase có "luôn cập nhật và giống hệt Sheet gốc" không?

Kết luận: **Đúng về mặt tập dữ liệu (exact-set), gần thời gian thực — nhưng là
bản chiếu ĐÃ CHUẨN HÓA, không phải bản sao y nguyên từng ô, và có hàng rào an
toàn có thể TỪ CHỐI cập nhật bất thường.**

### Những gì được bảo đảm bằng code

| Cơ chế | Bằng chứng | Ý nghĩa |
| --- | --- | --- |
| Cập nhật tức thì + fallback | Webhook Apps Script (instant) + Schedule 5 phút | Sheet sửa → đồng bộ ngay; miss webhook thì tối đa trễ 5 phút |
| Bỏ qua khi không đổi | So checksum SHA-256 của headers+rows (`apply-canonical-snapshot.sql`) | Không tốn ghi khi Sheet không thay đổi |
| Exact-set (xóa dòng đã mất) | `delete ... where not exists (select 1 from tmp_vmp_source ...)` | Dòng bị xóa khỏi Sheet → bị xóa khỏi Supabase, không tồn đọng rác |
| Hậu kiểm bắt buộc | `VMP_SYNC_POSTCONDITION_FAILED` nếu `count(plan_items) <> unique_ids` | Không thể lệch âm thầm — lệch là rollback cả transaction |
| Nguyên tử + khóa | `pg_advisory_xact_lock` + toàn bộ trong 1 transaction | Không có trạng thái nửa vời; 2 lần sync không đè nhau |

→ Về tập ID/đối tượng và giá trị hiện hành, Supabase được thiết kế để **bằng
đúng Sheet tại thời điểm sync**.

### Bốn điểm khác biệt cần nhớ (chỗ "không giống hệt")

1. **Bản chiếu đã chuẩn hóa, không phải copy thô.** Mỗi ô đi qua
   `vmp_sheet_status()`, `vmp_sheet_date()`, `vmp_sheet_classification()`,
   `vmp_sheet_criticality()`… Bản thô 37 cột vẫn giữ trong `vmp_sheet_rows` +
   `source_sheet_data` để đối chiếu.
2. **Gộp trùng mã.** `distinct on (validation_code) ... order by row_number desc`
   → ID trùng chỉ giữ dòng cuối. Vì vậy 479 dòng Sheet → 476 `plan_items` (số
   dòng khác nhau là cố ý).
3. **Hàng rào có thể từ chối, giữ bản cũ.** Nếu snapshot ngoài ngưỡng — cột ≠ 37,
   số dòng <450 hoặc >5000, unique_ids <450, objects <200, trùng >10 — RPC
   `raise exception` → sync thất bại, Supabase giữ snapshot tốt gần nhất. "Luôn
   giống" không tuyệt đối, mà là "giống HOẶC giữ bản tốt cuối + báo lỗi".
4. **Trạng thái quá hạn theo thời gian.** `computed_status` tính lúc GHI; hạng
   mục quá deadline mà không được sync lại sẽ không tự đổi `over` trong DB. App
   tính lại khi đọc (`supabaseData.js`) nên màn hình vẫn đúng.

### Việc cần làm để kiểm chứng trực tiếp (khi có xác nhận kết nối)

- Mở n8n workflow `LArr1nhj3jzFjJLs` xem lần sync gần nhất: thời gian, checksum,
  có bị guard chặn không.
- Đối chiếu số `plan_items` / `objects` thực tế với số ID/mã duy nhất của Sheet.

---

## B. Phương án nghiên cứu 4 trục (số liệu GitHub 2026)

Lưu ý bối cảnh: GitHub Trending tuần 2026-07 gần như toàn AI-agent (strix,
page-agent, agency-agents…), ít liên quan trực quan hóa. Giá trị thật nằm ở
trending theo lĩnh vực (chart/table libs). Toàn bộ số sao/lượt tải dưới đây là
số 2026 tại thời điểm khảo sát, dùng để so sánh tương đối, không phải cam kết.

### Trending tổng đáng dùng cho VMP

| Repo | Sao / tăng tuần | Liên quan VMP |
| --- | --- | --- |
| `refinedev/refine` | 35.2k (+246) | Framework React cho admin panel/dashboard nội bộ — sát VMP nhất |
| `supabase/supabase` | 105.7k (+1.0k) | Nền tảng đang dùng — theo dõi release RLS/realtime |
| `elastic/kibana` | 21.1k | Tham khảo pattern khám phá dữ liệu (filter + viz) |
| `google-labs-code/design.md` | 25k (+2.3k) | Đặc tả visual identity — hữu ích cho trục trình bày |
| `storybookjs/storybook` | 90.5k | Test component UI cô lập (hợp GĐ prototype) |

### Trục 3 — Biểu đồ (số liệu 2026)

| Thư viện | Chỉ số 2026 | Kết luận cho VMP |
| --- | --- | --- |
| Recharts | 48.9M tải/tuần — cao nhất họ React | Mặc định nên chọn: API component đơn giản, D3, hợp KPI/pipeline |
| Apache ECharts | 66.3k sao, 2.6M/tuần, canvas | Khi cần drill-down nặng / nghìn điểm |
| Chart.js (react-chartjs-2) | canvas, 10k–100k điểm, ~92kB gzip | Khi cần canvas nhẹ, nhiều điểm |
| visx (Airbnb) | 19.9k sao, 2.2M/tuần, low-level D3 | Chỉ khi cần timeline/sơ đồ tùy biến sâu |
| Victory | 11.1k sao, 272k/tuần | Bỏ qua — thiên mobile, ít lợi thế |

### Trục 2 & 4 — Bảng + Tốc độ

| Thư viện | Chỉ số 2026 | Cho VMP |
| --- | --- | --- |
| TanStack Table | ~3M/tuần, headless, virtualization viewport | Hợp: zero-UI, bundle nhẹ, ghép shadcn/ui |
| TanStack Virtual | Bổ trợ ảo hóa dòng | Ghép khi cần |
| AG Grid | ~2M/tuần, chịu 100k+ dòng | Thừa nhu cầu, nặng — không cần |
| react-data-grid | ~400k/tuần | Chỉ khi cần cell editable (VMP read-only → không cần) |

Phát hiện quan trọng: ngưỡng thực tế cần virtualization là ~1.000–5.000 dòng.
VMP chỉ ~476 hạng mục → CHƯA chạm ngưỡng bắt buộc. Nút thắt tốc độ nhiều khả năng
là **bundle size** (đặc biệt `xlsx` — nên lazy-load chỉ khi export) và số lần
re-render, không phải số dòng. Vì vậy GĐ 0 (đo baseline) phải làm trước khi thêm
bất kỳ dependency nào.

### Đề xuất chốt (đã hiệu chỉnh theo dữ liệu live)

1. Biểu đồ: giữ hướng Recharts mặc định; chỉ nâng ECharts nếu cần drill-down nhiều tầng.
2. Bảng: TanStack Table (headless) — hoãn virtualization đến khi vượt ~1.000 dòng.
3. Tốc độ: ưu tiên code-split 4 chế độ + lazy-load `xlsx` hơn là đổi thư viện;
   đo bằng web-vitals + rollup-plugin-visualizer.
4. Trình bày: tham khảo `refinedev/refine` (layout admin) + `design.md`; đọc
   skill `dataviz` trước khi code chart.

---

## Lộ trình nghiên cứu 4 giai đoạn (mỗi GĐ có tiêu chí đo được)

- GĐ 0 — Đo baseline: Lighthouse + bundle size hiện tại; đếm thời gian render
  476 hạng mục; soi `xlsx`. Kết quả: có số liệu để so sánh.
- GĐ 1 — Khảo sát có tiêu chí: mỗi ứng viên chấm theo (a) hợp read-only/tĩnh,
  (b) bundle thêm, (c) dark/light, (d) accessibility, (e) xử lý vài trăm dòng.
  Kết quả: bảng quyết định chọn/loại.
- GĐ 2 — Prototype cách ly: dựng thử ứng viên trong nhánh riêng với dữ liệu giả
  (không đụng Supabase/n8n). Kết quả: 2–3 mẫu để so trực quan.
- GĐ 3 — Tích hợp + đo lại: áp mẫu thắng cuộc vào Visual Explorer, so Lighthouse
  với GĐ 0, ghi vào `docs/improvement-history.md`. Kết quả: chứng minh cải thiện,
  không hồi quy tốc độ.

## GĐ 0 — Kết quả đo baseline (2026-07-06)

Lệnh: `npm run build` (Vite 5.4.21, 1588 modules). Số liệu chunk:

| Chunk | Raw | Gzip | Tải lúc mở app? |
| --- | --- | --- | --- |
| index.html | 1.45 kB | 0.72 kB | có |
| CSS (index) | 88.78 kB | 15.20 kB | có |
| vendor-icons (lucide) | 30.84 kB | 7.80 kB | có |
| vendor-react | 133.92 kB | 43.13 kB | có |
| vendor-supabase | 208.43 kB | 54.21 kB | có |
| index (app + 8 page) | 213.39 kB | 62.53 kB | có |
| xlsx | 428.99 kB | 143.07 kB | KHÔNG — chỉ khi xuất Excel |

Payload critical-path lúc mở app ≈ **183.6 kB gzip** (JS ≈ 167.7 kB gzip). `xlsx`
(143 kB gzip) nằm NGOÀI critical path.

### Phát hiện (đảo ngược giả định ban đầu)

1. **`xlsx` ĐÃ lazy-load đúng cách** — `await import("xlsx")` tại `App.jsx:1078`,
   chỉ chạy khi bấm xuất Excel. Không cần tối ưu thêm. (Giả định "xlsx là nút
   thắt lúc mở app" trong phần B là SAI.)
2. **Nút thắt thật: chunk `index` gộp cả 8 page (62.5 kB gzip).** Không có
   `React.lazy`/`Suspense` nào trong `src/`; mọi page import tĩnh trong
   `App.jsx:53–60`. Hai page nặng nhất — `TimelinePage.jsx` (55.6 kB nguồn) và
   `VisualExplorerPage.jsx` (28.4 kB nguồn) — bị tải ngay cả khi người dùng chưa
   mở màn đó.
3. `vendor-supabase` 54.2 kB gzip tải ngay (cần cho kiểm tra phiên auth lúc mở);
   khó hoãn mà không đổi UX → ưu tiên thấp.
4. `vendor-react` 43 kB gzip — gần như bất biến.

### Đòn bẩy tốc độ, xếp theo giá trị/công sức

1. **Cao nhất: code-split theo page bằng `React.lazy` + `Suspense`.** Tách
   Timeline và Visual Explorer thành chunk riêng, tải theo yêu cầu → giảm chunk
   `index` ban đầu. Ước lượng thô: bớt ~15–25 kB gzip khỏi critical path (cần đo
   lại ở GĐ 2). Không đụng Supabase/n8n, hợp ràng buộc read-only.
2. Trung bình: đo re-render 476 hạng mục (React DevTools Profiler) — nghi ngờ là
   nút thắt runtime hơn là số dòng (dưới ngưỡng virtualization ~1.000).
3. Thấp: giữ nguyên `vendor-supabase` và `vendor-react`.

Đề xuất cập nhật: **không thêm thư viện virtualization/chart mới ở phase này**;
việc đầu tiên nên làm là page-level lazy loading — thuần cấu trúc, rủi ro thấp,
đo được.

## Nguồn tham khảo

- GitHub Trending (weekly / TypeScript / JavaScript) — https://github.com/trending
- LogRocket — Best React chart libraries 2026 — https://blog.logrocket.com/best-react-chart-libraries-2026/
- PkgPulse — Best React table libraries 2026 — https://www.pkgpulse.com/guides/best-react-table-libraries-2026
- TanStack Virtual — https://tanstack.com/virtual/latest
- recharts/recharts — https://github.com/recharts/recharts
- reaviz/reaviz — https://github.com/reaviz/reaviz

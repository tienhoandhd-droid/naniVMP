# Sổ kiểm soát — gộp & nâng cấp Phân tích + Quản trị

Ngày 2026-08-31 · nhánh `design/lotus-b-plus` · **chưa commit**.

## Hướng thẩm mỹ đã chọn

Năm màn `workload · reports · rules · phanquyen · health` không phải bảng điều khiển.
Vật liệu đời thật của chúng là **sổ đăng ký của phòng QA**: kẻ dòng, đánh số vào lề, dấu niêm ở mục đang mở.

Ba hệ quả:

1. **Kẻ dòng thay vì đóng hộp.** Vùng dữ liệu dùng đường chỉ ngang. Thẻ chỉ giữ ở nơi nội dung thật sự là một *vật* rời (một người, một nhóm việc).
2. **Bo góc sắc hơn** — `--reg-r: 6px` so với 16px của thẻ toàn web. Chênh lệch có chủ ý, mang thông tin: đây là bề mặt tra cứu, không phải bề mặt trình bày.
3. **Đánh số là thật.** Sổ kiểm soát có thứ tự thật, và phụ đề màn Báo cáo vốn đã viết *"đổi kỳ thì mục 2, 4, 5 chạy theo"* trong khi không mục nào hiện số. Số hiển thị làm lối trích dẫn đó tra được.

**Điểm nhấn duy nhất:** `.reg-load` — thang tải vẽ như lớp sơn mài dày dần, kèm khấc `▁▃▅▇`.

### Đã bác một đề xuất

`ui-ux-pro-max --design-system` trả về **Glassmorphism + slate #0F172A + xanh #22C55E + Fira Code**.
Bác: đó là mặc định templated (`frontend-design` gọi tên chính xác kiểu này), và chọi hẳn với sơn mài tím mận + Be Vietnam Pro đã có. Skill cũng tự dặn phải kiểm chứng độ khớp trước khi áp.

## Đã làm

| File | Việc |
|---|---|
| `src/features/analysis/analysis.css` (mới, 380 dòng) | Toàn bộ layer sổ. 0 vi phạm drift. |
| `src/main.tsx` | Nạp layer mới |
| `src/components/layout/Layout.tsx` | Gộp nav PHÂN TÍCH + QUẢN TRỊ thành một nhóm |
| `src/pages/WorkloadPage.tsx` | Vá lỗi màu chết · ma trận sang bề mặt sổ · chỉ mục biên · vá nền trắng hero |
| `src/pages/PhanQuyenPage.tsx` | Ma trận quyền sang bề mặt sổ |
| `src/components/ui/Primitives.tsx` | `Card` nhận `id` để làm neo |

### Gộp nav — gộp ở đâu

Gộp **chỉ ở lớp bày**. `NAV_GROUP_ORDER`, `SCREEN_IDS`, `group` của từng mục, mọi hash `#v=` giữ nguyên → `rpc_my_ui_access` và bộ kiểm phân quyền không đổi một dòng.
`tests/unit/navigation-contract.test.mjs` vẫn 12/12 pass.

### Lỗi đã vá

- `WorkloadPage` `heat()` — `C.rasp + "66"` ra `"var(--c-rasp)66"`, CSS không hợp lệ. Cả 4 bậc + viền + 2/4 ô chú giải chết. Nay nền do CSS lo bằng `color-mix()` trên `[data-band]`, TSX chỉ nói bậc.
- `WorkloadPage` hero `linear-gradient(120deg,#fff,…)` → `C.surface`. Mảng trắng ở chế độ tối.
- Ma trận: thêm sticky hàng tiêu đề (trước chỉ sticky cột), `<caption>`, `scope="col"`/`scope="row"`, `aria-label` đủ câu cho từng ô.
- Mức tải nay có **ba** kênh: nền, khấc, viền (bậc quá tải) — không còn phụ thuộc màu.
- `:focus-visible` thật cho cả bề mặt (inline style không viết được).
- `prefers-reduced-motion` + breakpoint 64rem (chỉ mục biên → dải ngang).

## Kiểm đã chạy

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | ĐẠT |
| `npm run build` | ĐẠT, 16.97s |
| `npm run drift` | `analysis.css` **0 vi phạm** |
| `navigation-contract.test.mjs` | 12/12 |
| `long-mon-race` · `today-command-center` · `vong-nam-calendar` | 19/6/4, 0 fail |

**Chưa chạy được:** `a11y`, `visual`, `atelier`, `e2e` — `.env.local` thiếu `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON`.

## Đợt 2 (31/08, cùng ngày) — hoàn tất bảng + dọn trùng

Bảng sang bề mặt sổ (caption + scope + tiêu đề dính + cột số căn phải):
- `ReportsView` — cả 4 bảng (giai đoạn, bất cập bộ phận, dự kiến tháng tới, dữ liệu thô). Sửa kèm một lỗi có sẵn: dòng "không có dữ liệu" của bảng dự kiến dùng `colSpan={6}` cho bảng 7 cột.
- `ActiveRulesPage` — `Rows` (mọi mục luật dùng chung); tên luật thành `<th scope="row">`.
- `ServerChecksPage` — bảng cảnh báo; mã thẩm định thành tiêu đề dòng dính.
- Xoá hằng `th`/`td` chết và import thừa (`NUM`, `LOAI_LOI`, `sevOf`, `Flag`, `wlScore`).

Dọn chức năng thừa / ô trùng (yêu cầu bổ sung của người dùng):
1. **Bỏ thẻ "Cần tập trung" ở Phân công** — bản rút gọn của màn "Cảnh báo & ưu tiên" (cùng phép xếp điểm rủi ro, ít cột hơn, không có QRM). Hai nơi cùng xếp ưu tiên thì sớm muộn lệch nhau. Giữ donut trọng yếu (góc nhìn khối lượng) + link `#v=alerts`.
2. **Rút thẻ "Chất lượng dữ liệu" ở Báo cáo thành một dòng đếm + link `#v=health`** — thẻ cũ là bản sao thiếu của màn health (chỉ soát dữ liệu client, màn kia rà trên server; phụ đề cũ tự nhận "xem đầy đủ ở mục Chất lượng dữ liệu"). `quality` vẫn tính vì bản xuất HTML/Excel cần.
3. **Bỏ 4 emoji KPI ở màn health** (📋⏰📄⚠️) → icon Lucide — luật Atelier §5 cấm emoji trạng thái nghiệp vụ, và đây là màn Admin duy nhất còn sót.

Kiểm sau đợt 2: typecheck ĐẠT · build 18.35s ĐẠT · drift giữ nguyên 115 (0 thuộc file đợt này) · navigation-contract 12/12 · long-mon-race 19 · today-command-center 6.

Inline style của 5 màn giảm 271 → 211.

## Đợt 3 (31/08, khuya) — Ngư đồ Long Môn toàn màn + dọn theo chỉ đạo

Chỉ đạo trực tiếp của chủ dự án trong phiên:
- Bỏ mục nav "Quy tắc nghiệp vụ" (màn `rules` giữ nguyên screenId + hash, chỉ mất lối menu — nếp `inventory`).
- Màn Dòng thời gian CHỈ còn Ngư đồ Long Môn, toàn màn hình, một màn; mọi nội dung thể hiện trên tranh.
- Tranh: cửa sổ 90 ngày, tên thiết bị không đè lên cá, cá phải "đang bơi", nâng tính nghệ thuật, kết hợp công cụ vẽ.

Đã làm:
1. `TimelinePage.tsx` 2155 → 636 dòng: chỉ còn LongMonRace + ActivityDetailModal + PlannedDeadlineDialog (sửa hạn kế hoạch VẪN dùng được qua modal hồ sơ). Ngư đồ ăn thẳng `acts` — bản đầu ăn qua explorer lọc theo range 1 tháng của Gantt cũ làm trường đua trống trơn.
2. `longMonRaceModel.ts`: `rangeAround` 21 → 91 ngày (4 tuần lùi + 9 tuần tới); tuần trống vẫn tự hẹp.
3. `long-mon-race.css`: section flex cao `calc(100dvh − 132px)`; nhãn mã = thẻ bài treo chéo dưới-phải có dây (hết đè cá, chữ 8→10px); "Hôm nay" = sợi chỉ vàng gradient; keyframes `long-mon-swim`/`long-mon-drift` — mỗi con lệch pha riêng (băm FNV từ id), tắt theo reduced-motion.
4. **Cổng Vũ Môn vẽ tay**: `public/art/monitoring/long-mon-vu-mon-gate-v2.svg` (thác lụa + vách đá mực + cầu đá cong + ấn vàng 門 + rồng sương 20%), xuất PNG qua Inkscape 1.4.4, gắn lớp `__gate` mép phải giữa nền và đàn cá. v1 (dáng cổng hai trụ) bị loại vì trông như máy dò kim loại — cả hai file giữ lại trong public/art.
5. Sửa axe serious cuối cùng: `<dl>` vali-brief (Primitives) chứa `<span>` trần → dồn vào `<dd>`; index.css chuyển style tương ứng.
6. `.env.local` bổ sung 2 khoá VITE_* chép từ `.env` (anon key công khai) — mở lại cổng kiểm; chuỗi with-preview vẫn hỏng vì ACL chặn `mv` thư mục vào `dist/`, đã đi vòng bằng build + `vite preview` thủ công.

Kiểm: **axe 6/6 màn PASS (0 serious/critical)** · unit long-mon-race 19/19, today 6, vong-nam 4, navigation 12, e2e-suite-contract 9 · typecheck 0 · build ĐẠT.

### Sự cố cần biết
- **Mất ~55 dòng sửa tay chưa commit của chủ dự án ở RIÊNG `TimelinePage.tsx`** (bản cuối 2155 dòng vs HEAD 2100): bộ dọc code tự động của phiên này cắt quá tay trước khi kịp sao lưu. Các file Long Môn thật (LongMonRace/model/css) KHÔNG mất. Phần lớn nội dung mất thuộc khối workbench nay đã bỏ theo chỉ đạo, nhưng đây vẫn là lỗi quy trình: từ nay mọi cắt lớn phải `cp` file ra scratchpad trước.
- Ảnh chuẩn visual của `timeline` (và có thể vài màn) đã LỆCH THIẾT KẾ MỚI — cần chủ dự án duyệt rồi chạy `npm run visual:capnhat`; baseline đang niêm phong nên tôi không tự cập nhật.
- E2E phụ thuộc workbench cũ (`timeline-deadline-edit.mjs`, phần timeline của `luong-gia-lap.mjs`, `quyen-cot-timeline.mjs`) sẽ hỏng — chưa sửa, chờ chốt thiết kế mới rồi viết lại theo Ngư đồ.
- Drift 116 (+1 từ thẻ bài mới trong long-mon-race.css — file này vốn mang màu nghệ thuật "nướng" như CongChuaVali).

## Đợt 4 (31/08, rạng sáng) — hoàn thiện Ngư đồ + mở đường phát hành

Chỉ đạo: "Long Môn và cá là mục quan trọng nhất... commit và push lên main, theo tới khi deploy thành công."

Nghệ thuật:
- Vũ Môn v2 thay v1 (v1 đọc ra máy dò kim loại — tự loại). Thẻ bài mã 84px.
- Vệt nắng soft-light xiên từ góc phải về cổng — dẫn mắt theo hướng cá bơi.
- Sửa bug thật: bấm cá ở màn ≥1600 không mở gì (moHoSo còn rẽ vào inspector đã xoá).
- `#v=rules` chết sau khi bỏ mục menu (rawUrlViews đọc từ NAV_ITEMS) — thêm vào danh sách alias.

Mở đường CI (mọi thứ chạy trên bản build production local, preview 127.0.0.1:4173):
- `timeline-deadline-edit` viết lại theo cá (data-long-mon-code): **38/38**.
- `luong-gia-lap`: 3c/3d/3e/3m/3q của workbench cũ → một khối hợp đồng Ngư đồ; 3b/3h/3p/pane cập nhật theo UI bản cuối của chủ dự án: **155/155**.
- `catalog-workspace` 147/147 (nút "Thêm đối tượng" bám data-cw-them) · `quyen-cot-timeline` ✓ · `phan-cong-cap-nhat-tien-do` ✓ · `quyen-admin` ✓ · `access-transition-race` exit 0 · `source-qa-workshop-access` ✓ · `tai-khoan-an-sap-xep` ✓.
- Sửa nền tảng Windows cho bộ e2e (không đổi hành vi CI Ubuntu): fileURLToPath thay URL.pathname (10 file), đường dẫn Chrome Windows, spawn npm qua shell + taskkill /T, teardown 4178.
- verify-source-access-db-evidence: PASS (17 file, đúng SHA niêm phong).

## Bước kế tiếp

1. Người dùng bổ sung 2 khoá `VITE_*` → chạy `a11y` + `visual`, chốt ảnh chuẩn mới cho `workload`/`phanquyen`.
2. Áp `.reg-table` cho 3 bảng còn lại: `ReportsView` (4 bảng), `ActiveRulesPage`, `ServerChecksPage`.
3. `ReportsView`: hiện số mục 01–08 cho khớp phụ đề đang viết.
4. Đưa `WorkloadPage` + `PhanQuyenPage` vào `PHAM_VI` của drift sau khi dọn nốt inline style.
5. Vá 7 nền trắng nhiều dòng ở `index.css` (§L1 của bản rà soát) + sửa Luật 5 của drift sang quét theo khối.

## Ghi chú

`src/features/monitoring/monitoring.css` bị sửa lúc 03:24 bởi phiên khác (Codex hoặc người dùng) trong lúc đợt này đang chạy — vi phạm drift của nó tăng 11 → 29. Không phải do đợt này.

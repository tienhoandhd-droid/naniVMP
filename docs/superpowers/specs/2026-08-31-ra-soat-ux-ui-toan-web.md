# Rà soát UX/UI toàn web — VMP Monitor

Ngày: 2026-08-31 · Nhánh: `design/lotus-b-plus` · Đối tượng rà: **working tree** (bản cuối của người dùng), không phải HEAD.

Công cụ: đọc mã tĩnh + tính tương phản WCAG từ token thật + chạy `npm run drift`.
**Chưa chạy được** `npm run a11y` / `visual` / `atelier` / `e2e` — xem L0.

---

## L0 · Toàn bộ cổng kiểm trình duyệt đang không chạy được trên máy này

`scripts/with-preview.sh:37` đòi 4 khoá: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON`, `E2E_EMAIL`, `E2E_PASSWORD`.
`.env.local` hiện có `SUPABASE_DB_URL`, `E2E_EMAIL`, `E2E_PASSWORD` — **thiếu 2 khoá `VITE_*`**.

Kết quả: `bash scripts/with-preview.sh -- npm run a11y` dừng ngay với
`[with-preview] thiếu hoặc để rỗng trong .env.local: VITE_SUPABASE_URL VITE_SUPABASE_ANON`.

Tên khoá trong repo nhất quán (`supabaseConfig.ts:7`, `README.md:65` đều dùng `VITE_SUPABASE_ANON`) — không phải lỗi đặt tên, chỉ là máy này thiếu.

**Hệ quả:** a11y (axe), ảnh chuẩn, atelier, e2e đều không chạy. Mọi kết luận dưới đây là từ mã tĩnh, chưa có xác nhận runtime.

---

## L1 · Nền trắng literal viết nhiều dòng — guardrail bỏ lọt, dark mode thủng

`check-design-drift.mjs` có Luật 5 quét **toàn `src`** để cấm nền trắng literal, và báo 0 vi phạm.
Nhưng nó quét **từng dòng** (`.split("\n").forEach`), nên mọi khai báo `background:` xuống dòng đều lọt.

7 chỗ lọt, **tất cả đều là màn Dòng thời gian**:

| Dòng | Selector |
|---|---|
| `src/index.css:510` | `.timeline-heatmap` |
| `src/index.css:689` | `.timeline-card-column` |
| `src/index.css:991` | `.timeline-select` |
| `src/index.css:1065` | `.timeline-board` |
| `src/index.css:2039` | `.timeline-insight-card` |
| `src/index.css:2121` | `.timeline-range-rail` |
| `src/index.css:2194` | `.timeline-range-rail__track` |

Ví dụ `index.css:510-515`:
```css
.timeline-heatmap {
  background:
    linear-gradient(135deg, rgba(255,255,255,.84), rgba(253,238,246,.76)),
    #fff;
}
```

Dark mode của dự án hoạt động bằng cách **đổi biến** ở `:root[data-theme="dark"]` (`index.css:130`).
`index.css` chỉ có **5** chỗ `data-theme="dark"` (dòng 130, 1401, 6048, 6900, 7216) và **không chỗ nào** ghi đè `.timeline-*`.
→ 7 vùng trên giữ nguyên nền trắng ở chế độ tối.

**Sửa:** đổi sang `var(--lp-bg-surface)` / `--lp-bg-raised`; và sửa Luật 5 của drift thành quét theo khối khai báo thay vì theo dòng.

---

## L2 · Màu cứng trong `index.css` không đổi theo chế độ

`index.css` (7.593 dòng) **không nằm trong `PHAM_VI`** của drift → không bị soát Luật 1.
Có **178 mã hex** không phải khai báo biến. Tương phản tính từ nền thật:

| Chỗ | Màu | Trên nền sáng | Trên nền tối |
|---|---|---:|---:|
| `index.css:335` `input::placeholder` | `#B79BB2` | **2.48** ✗ | 6.75 |
| `index.css:644` `.timeline-heatmap-slice--over` | `#9E1F43` | 7.58 | **2.21** ✗ |
| `index.css:645` `--urgent` | `#D85F92` | 3.47 | 4.83 |

- **Placeholder 2.48:1** — chữ, phải đạt 4.5:1. Hỏng ở chế độ sáng, toàn bộ ô nhập của web.
- **Lát nhiệt `--over` 2.21:1 trên nền tối** — lát "quá hạn" gần như tan vào thẻ ở chế độ tối. Đây đúng là lát cần nổi nhất.

---

## L3 · Thang bo góc: 62% giá trị nằm ngoài thang đã khai

Thang hợp lệ theo `check-design-drift.mjs:57`: `0 / 10 / 16 / 18 / 24 / 999`.
Đếm toàn `src` (`.tsx` + `.css`):

| Giá trị | Số lần | |
|---:|---:|---|
| **14** | **101** | ngoài thang |
| 8 | 39 | ngoài thang |
| 12 | 7 | ngoài thang |
| 20 | 1 | ngoài thang |
| 999 | 64 | hợp lệ |
| 10 | 21 | hợp lệ |
| 16 | 3 | hợp lệ |
| 18 | 3 | hợp lệ |

**148/239 = 62% ngoài thang.** `14px` là bán kính phổ biến nhất của cả web nhưng không có trong thang.
Thang khai và thứ đang vẽ là hai thứ khác nhau — cần chọn một.

---

## L4 · Heatmap ma trận tải không có màu (màn Phân công)

`src/pages/WorkloadPage.tsx:108-111, 275, 392`

```js
if (ratio > 1) return { bg: C.rasp + "66", ... }
```

`C.rasp` = chuỗi `"var(--c-rasp)"` (`constants/theme.ts:44`), không phải hex.
`"var(--c-rasp)" + "66"` = `"var(--c-rasp)66"` → CSS không hợp lệ → trình duyệt bỏ khai báo.

Ảnh hưởng: cả 4 bậc của `heat()`, viền ô (`${st.text}33`, dòng 392), và 2/4 ô chú giải (dòng 275).
→ Ma trận Người × Tháng mất hết nền màu, chỉ còn số trần.

**Sửa:** `color-mix(in srgb, var(--c-rasp) 40%, transparent)` hoặc khai token `--lp-load-*` trong `lotus-tokens.css`.

---

## L5 · Nhóm Phân tích & Quản trị chưa chuyển hệ Lotus

| Màn | className | inline style | CSS riêng | trong `PHAM_VI` drift |
|---|---:|---:|---|---|
| TodayCommandCenter | 49 | **0** | `today.css` | ✔ |
| TimelinePage | 132 | 81 | `monitoring.css` | ✔ |
| **WorkloadPage** | 8 | **83** | ✗ | ✗ |
| **ReportsView** | 7 | **76** | ✗ | ✗ |
| **ActiveRulesPage** | **0** | **53** | ✗ | ✗ |
| **PhanQuyenPage** | 9 | 27 | ✗ | ✗ |
| **ServerChecksPage** | 3 | 32 | ✗ | ✗ |

Toàn repo: **1.243 inline style / 39 file**.

Inline style không viết được `:focus-visible`, `:hover`, `@media`, `prefers-reduced-motion`.
`index.css` có 15 khai báo `focus-visible` nhưng không với tới các nút inline này.

---

## L6 · Ngữ nghĩa bảng

24 `<table>` trên 18 file. `aria-sort` = **0** ở mọi nơi. `<caption>` chỉ có ở `SmartTable.tsx`.

| File | table | scope | caption |
|---|---:|---:|---:|
| ReportsView | 4 | 0 | 0 |
| PhanQuyenPage | 2 | 0 | 0 |
| WorkloadPage / ActiveRules / ServerChecks / QrmPage / CatalogPage / TimelinePage … | 1 mỗi | 0 | 0 |
| SmartTable | 3 | 2 | 2 |
| MaTranTienDo | 1 | 2 | 0 |

Ma trận Người × Tháng chỉ sticky **cột trái**, không sticky **hàng tiêu đề** → cuộn ngang 12 tháng là mất tên tháng.

---

## L7 · Các điểm nhỏ hơn

- **Chuyển động inline** (7 chỗ: `Primitives.tsx` ×2, `App.tsx` ×2, `WorkloadPage`, `Layout`, `CompletionDashboard`) nằm ngoài tầm với của `prefers-reduced-motion`. `progress.css`, `lotus-shell.css`, `catalog.css` có transition nhưng không có khối reduced-motion.
- **z-index**: 20 giá trị rời rạc từ 7 → 10000, không có token thang. Modal 999 < skip-link 2000 < MultiSelect 4000 < toast 9999 < mobile drawer 10000.
- **Chữ < 12px**: 52 chỗ toàn `src`; 12 trong đó ở `index.css` (ngoài tầm drift).
- **`--lp-text-tertiary`** đạt 4.42:1 trên `--lp-bg-canvas` và 3.95:1 trên `--lp-bg-sunken` (chế độ sáng) — dưới 4.5. Hiện **chưa dùng ở đâu**, nên là bẫy tiềm ẩn chứ chưa phải lỗi đang xảy ra.
- **`docs/design/lotus-pearl-atelier.md`** được `tests/e2e/atelier.mjs:5` viện dẫn nhưng không tồn tại; `git log --all` không có commit nào cho `docs/design/`.

## Những chỗ ĐÚNG, không đụng vào

- **Bảng token màu**: 20/20 cặp chữ/nền ngữ nghĩa đạt ≥ 4.5:1 ở **cả hai** chế độ (rasp 6.36/6.19, marigold 6.15/8.90, mint 6.60/5.65, lav 8.50/6.63, sky 6.91/6.13). Đây là phần làm rất tốt.
- **Luật 5 nền trắng một dòng**: 0 vi phạm.
- **`onClick` trên thẻ không tương tác**: chỉ 1 (backdrop drawer) — kỷ luật tốt.
- **Modal**: `Primitives.Modal` và `ViewportDialog` đều có `role="dialog"`, `aria-modal`, Escape, quản lý focus. `ShellConfirmDialog` kế thừa `ViewportDialog` nên cũng đủ.
- **`CauKetLuan`** — mỗi biểu đồ tự rút câu kết luận từ chính dữ liệu đang vẽ. Giữ và nhân rộng.

---

## Thứ tự đề xuất

**Đợt 0 — mở lại cổng kiểm.** Bổ sung `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON` vào `.env.local` (người dùng tự làm, không đưa giá trị vào hội thoại). Chạy `a11y` + `visual` để có mốc thật.

**Đợt 1 — lỗi màu, làm được ngay, độc lập nhau.**
1. L4 · 5 chỗ ở `WorkloadPage` (heatmap sống lại).
2. L1 · 7 selector `.timeline-*` → token.
3. L2 · `input::placeholder` + `.timeline-heatmap-slice--*` → token.
4. Sửa Luật 5 của drift sang quét theo khối.

**Đợt 2 — thẩm mỹ nhóm Phân tích & Quản trị.**
5. Chốt thang bo góc (L3): thêm `14`/`8` vào thang, hay đổi 148 chỗ về thang cũ.
6. Tách `src/features/analysis/analysis.css`, chuyển `WorkloadPage` + `ReportsView` sang class, thêm vào `PHAM_VI`.
7. Sticky hàng tiêu đề cho ma trận; `<caption>` + `scope="col"` cho 24 bảng; `aria-sort` cho `AlertsPage`.
8. Mã hoá mức tải không chỉ bằng màu.

**Đợt 3 — hệ thống.**
9. Token thang z-index.
10. Đưa `index.css` vào `PHAM_VI` (sẽ lộ 178 hex + 12 chữ nhỏ — trả nợ dần).
11. Viết `docs/design/lotus-pearl-atelier.md` mà `atelier.mjs` đang trỏ tới.

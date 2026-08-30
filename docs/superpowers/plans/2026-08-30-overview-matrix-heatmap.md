# Overview Matrix Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Làm card “Bản đồ trạng thái” dễ phân biệt bằng bốn màu ngữ nghĩa, có cấu trúc heatmap giàu phân cấp và bố cục bảng thẳng hàng hơn.

**Architecture:** Giữ nguyên toàn bộ phép tính trong `MaTranTienDo`; chỉ bổ sung metadata trình bày cho bốn trạng thái và semantic class/data attribute tại ranh giới render. CSS Overview chịu trách nhiệm cho palette, sticky header/cột đầu, legend và responsive; E2E Overview kiểm tra computed style và hành vi thật trên fixture Supabase hiện có.

**Tech Stack:** React 18, TypeScript, CSS thuần với Lotus semantic tokens, Puppeteer E2E, Vite.

## Global Constraints

- Không thay đổi `chamGiaiDoan`, `chamHangMuc`, công thức chất lượng dữ liệu, xếp hạng điểm nóng hoặc thứ tự ưu tiên trạng thái.
- Không thay đổi API, RPC, dữ liệu Supabase, quyền truy cập, modal hoặc điều hướng.
- Không thêm thư viện hoặc dependency.
- Chỉ sửa `MaTranTienDo`, CSS Overview và E2E Overview mục tiêu.
- Không commit, push, deploy hoặc ghi dịch vụ remote từ checkout đang có thay đổi dở dang.

---

### Task 1: Khóa hợp đồng heatmap bằng E2E

**Files:**
- Modify: `tests/e2e/overview-executive-dashboard.mjs`

**Interfaces:**
- Consumes: DOM thật của `[data-analysis-matrix]` trên fixture E2E hiện có.
- Produces: contract cho `[data-matrix-legend-status]`, `[data-matrix-primary-status]`, `[data-matrix-segment]`, `.analysis-matrix-table__head` và `.analysis-matrix-row-head`.

- [x] **Step 1: Viết assertion thất bại cho bốn màu và cấu trúc ô**

Thêm sau contract ma trận hiện có:

```js
const matrixVisual = await page.$eval("[data-analysis-matrix]", (root) => {
  const legends = [...root.querySelectorAll("[data-matrix-legend-status]")];
  const cell = root.querySelector("[data-matrix-primary-status]");
  const mix = cell?.querySelector(".analysis-matrix-cell__mix");
  const head = root.querySelector(".analysis-matrix-table__head");
  const rowHead = root.querySelector(".analysis-matrix-row-head");
  return {
    legendStatuses: legends.map((item) => item.getAttribute("data-matrix-legend-status")),
    legendAccents: legends.map((item) => getComputedStyle(item).getPropertyValue("--matrix-accent").trim()),
    cellStatus: cell?.getAttribute("data-matrix-primary-status"),
    cellName: cell?.getAttribute("aria-label"),
    mixHeight: mix?.getBoundingClientRect().height,
    segments: cell?.querySelectorAll("[data-matrix-segment]").length,
    headPosition: head ? getComputedStyle(head).position : "",
    rowHeadPosition: rowHead ? getComputedStyle(rowHead).position : "",
  };
});
assert.deepEqual(matrixVisual.legendStatuses.sort(), ["chua", "thieu", "tre", "xong"]);
assert.equal(new Set(matrixVisual.legendAccents).size, 4);
assert.ok(matrixVisual.cellStatus);
assert.match(matrixVisual.cellName || "", /Đã xong|Trễ hạn|Thiếu dữ liệu|Chưa tới hạn/);
assert.equal(matrixVisual.mixHeight, 12);
assert.ok((matrixVisual.segments ?? 0) >= 1);
assert.equal(matrixVisual.headPosition, "sticky");
assert.equal(matrixVisual.rowHeadPosition, "sticky");
```

Production mutation được bắt: bỏ semantic class/data attribute, làm bốn trạng thái dùng lại một token, thu thanh cơ cấu về 8 px hoặc bỏ sticky header/cột đầu.

- [x] **Step 2: Chạy RED**

Run: `node tests/e2e/overview-executive-dashboard.mjs` với `CHROME_PATH`, `VMP_E2E_URL` và Supabase URL công khai lấy từ dev module như runbook hiện tại.

Expected: FAIL vì legend/cell chưa có data attribute, thanh còn 8 px và header/cột đầu chưa sticky.

### Task 2: Triển khai heatmap tương phản và bố cục biên tập

**Files:**
- Modify: `src/components/dashboard/MaTranTienDo.tsx`
- Modify: `src/features/overview/overview-executive.css`
- Verify: `tests/e2e/overview-executive-dashboard.mjs`

**Interfaces:**
- Consumes: `TrangThai`, `MAU`, `dem`, `noiBat` và table hiện có.
- Produces: semantic DOM class/data attribute mà Task 1 kiểm tra; không thay đổi dữ liệu hoặc callback modal.

- [x] **Step 1: Bổ sung metadata trạng thái và accessible cell**

Mở rộng `MAU` bằng nhãn ngắn dùng trong ô. Tạo accessible name từ mọi trạng thái có dữ liệu, rồi render:

```tsx
<button
  type="button"
  className={`analysis-matrix-cell analysis-matrix-cell--${noiBat}`}
  data-analysis-matrix-cell
  data-matrix-primary-status={noiBat}
  aria-label={`${ten}. ${m.nhan}: ${dem[noiBat].length} trên ${tong}. ${moTaDayDu}`}
>
  <span className="analysis-matrix-cell__summary">
    <span className="analysis-matrix-cell__icon"><NoiBatIcon aria-hidden="true" /></span>
    <span><small>{m.nhan}</small><strong>{dem[noiBat].length}<em>/{tong}</em></strong></span>
  </span>
  <span className="analysis-matrix-cell__mix">
    {statusOrder.map((status) => dem[status].length ? (
      <span className={`analysis-matrix-cell__segment analysis-matrix-cell__segment--${status}`}
        data-matrix-segment={status} />
    ) : null)}
  </span>
</button>
```

Ô trống dùng `.analysis-matrix-cell--empty`. Legend dùng `.analysis-matrix-legend__item--${status}` và `data-matrix-legend-status={status}`; mỗi item có icon, chấm màu và nhãn.

- [x] **Step 2: Chuẩn hóa semantic table**

Thêm class cho table/header/row, đổi cột tên thành `<th scope="row" className="analysis-matrix-row-head">`, các header cột dùng `scope="col"`. Giữ nguyên thứ tự dữ liệu, modal và nút “Hiện thêm”.

- [x] **Step 3: Viết CSS palette và bố cục**

Đặt biến theo modifier:

```css
.analysis-matrix-cell--xong,
.analysis-matrix-legend__item--xong { --matrix-accent: var(--lp-success); --matrix-soft: var(--lp-success-soft); }
.analysis-matrix-cell--tre,
.analysis-matrix-legend__item--tre { --matrix-accent: var(--lp-danger); --matrix-soft: var(--lp-danger-soft); }
.analysis-matrix-cell--thieu,
.analysis-matrix-legend__item--thieu { --matrix-accent: var(--lp-warning); --matrix-soft: var(--lp-warning-bg); }
.analysis-matrix-cell--chua,
.analysis-matrix-legend__item--chua { --matrix-accent: var(--lp-info); --matrix-soft: var(--lp-info-soft); }
```

Cell có dải trái 4 px, nền tint, icon/số theo accent; thanh `.analysis-matrix-cell__mix` cao 12 px và segment có separator. Header/cột đầu `position: sticky`; row head có nền opaque và z-index đúng. Legend là chip, table row có phân cách/zebra nhẹ, hover/focus tăng tương phản nhưng không đổi ý nghĩa màu.

- [x] **Step 4: Responsive và reduced motion**

Ở `max-width: 720px`, giữ cell tối thiểu 64 px cao, toolbar/legend xuống dòng, cột đầu đủ rộng đọc tên và document không tràn ngang. Hover transition tắt trong media `prefers-reduced-motion` hiện có.

- [x] **Step 5: Chạy GREEN và gate hẹp**

Run:

```powershell
node tests/e2e/overview-executive-dashboard.mjs
npm run typecheck
git diff --check -- src/components/dashboard/MaTranTienDo.tsx src/features/overview/overview-executive.css tests/e2e/overview-executive-dashboard.mjs
npm run build
```

Expected: E2E, typecheck và diff-check exit 0. Nếu `npm run build` chỉ lỗi `EPERM` khi đọc `.env`, chạy Vite programmatic với `envDir` tạm và giá trị public giả như runbook, rồi dọn thư mục tạm; báo riêng build chuẩn FAIL và fallback PASS.

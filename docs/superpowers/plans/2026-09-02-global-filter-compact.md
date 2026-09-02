# GlobalFilterBar Compact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay thanh lọc dữ liệu dạng card rộng bằng một capsule ba segment nối liền, dễ hiểu và không tràn ngang ở 390px, trong khi giữ nguyên toàn bộ logic lọc và popover.

**Architecture:** Tách logic tạo nhãn trạng thái sang một hàm thuần trong feature `overview`, rồi dùng kết quả đó trong nhánh đầy đủ của `GlobalFilterBar`. Markup thêm một command capsule duy nhất; CSS chịu trách nhiệm bố cục desktop/mobile, còn state, URL và dialog hiện tại không đổi.

**Tech Stack:** React 18, TypeScript 7, CSS thuần với Lotus tokens, Node test runner qua `tsx`, Puppeteer E2E giả lập Supabase, Vite 6.

## Global Constraints

- Chỉ sửa `GlobalFilterBar` bản đầy đủ; bản `rutGon` giữ nguyên hành vi và khoảng trống.
- Không đổi dữ liệu, URL state, quyền, request, persistence hoặc nội dung popover.
- Giữ `#vmp-global-filter-trigger`, `#vmp-global-filter-panel`, focus return và các hợp đồng ARIA hiện tại.
- Giữ màu, font, radius và elevation bằng Lotus tokens; không thêm thư viện UI.
- Copy nhìn thấy phải là `Bộ lọc dữ liệu`, `Tất cả dữ liệu`, `Thay đổi`.
- Group ARIA phải là `Bộ lọc dữ liệu: đang xem tất cả` hoặc `Bộ lọc dữ liệu: N điều kiện đang áp dụng`.
- Tóm tắt hiển thị tối đa hai nhãn theo thứ tự bộ phận → khu vực → ngày; phần dư dùng `+N`; chip đầy đủ vẫn còn.
- Ở 390px, capsule nằm trên một hàng, tối thiểu 44px và không gây overflow trang.
- Không deploy, push hoặc thay đổi dịch vụ remote.

---

## File Map

- Create: `src/features/overview/globalFilterSummary.ts` — hàm thuần tạo trạng thái nhìn thấy, số điều kiện và accessible label.
- Create: `tests/unit/global-filter-summary.test.mjs` — unit test cho trạng thái rỗng, hai điều kiện, phần dư và khoảng ngày.
- Modify: `src/App.tsx:487-682` — tích hợp summary và markup capsule cho nhánh đầy đủ.
- Modify: `src/features/overview/overview-executive.css:1-207` — bố cục command capsule, segment, chip row và breakpoint 390px.
- Modify: `tests/unit/ui-ux-baseline.test.mjs:87-100` — cập nhật contract copy/ARIA của source.
- Modify: `tests/e2e/overview-executive-dashboard.mjs:48-349` — đổi selector ổn định, kiểm copy, state, kích thước và overflow.

### Task 1: Hàm thuần tóm tắt điều kiện lọc

**Files:**
- Create: `src/features/overview/globalFilterSummary.ts`
- Create: `tests/unit/global-filter-summary.test.mjs`

**Interfaces:**
- Consumes: `departmentLabels`, `areaLabels`, `dateLabel` đã được trình bày từ state hiện có.
- Produces: `presentGlobalFilterSummary(input): GlobalFilterSummaryPresentation` với `activeCount`, `visibleLabel`, `ariaLabel`.

- [ ] **Step 1: Viết unit test đang thất bại**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { presentGlobalFilterSummary } from "../../src/features/overview/globalFilterSummary.ts";

test("global filter summary names the unfiltered data state", () => {
  assert.deepEqual(presentGlobalFilterSummary({
    departmentLabels: [], areaLabels: [], dateLabel: null,
  }), {
    activeCount: 0,
    visibleLabel: "Tất cả dữ liệu",
    ariaLabel: "Bộ lọc dữ liệu: đang xem tất cả",
  });
});

test("global filter summary keeps two labels visible", () => {
  assert.deepEqual(presentGlobalFilterSummary({
    departmentLabels: ["XSX"], areaLabels: ["Khu vực Khu A"], dateLabel: null,
  }), {
    activeCount: 2,
    visibleLabel: "XSX · Khu vực Khu A",
    ariaLabel: "Bộ lọc dữ liệu: 2 điều kiện đang áp dụng",
  });
});

test("global filter summary collapses only labels beyond the first two", () => {
  assert.deepEqual(presentGlobalFilterSummary({
    departmentLabels: ["XSX", "QA"],
    areaLabels: ["Khu vực Khu A"],
    dateLabel: "01/08–31/08",
  }), {
    activeCount: 4,
    visibleLabel: "XSX · QA · +2",
    ariaLabel: "Bộ lọc dữ liệu: 4 điều kiện đang áp dụng",
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận RED**

Run:

```powershell
node --import tsx --test tests/unit/global-filter-summary.test.mjs
```

Expected: FAIL với `ERR_MODULE_NOT_FOUND` cho `globalFilterSummary.ts`.

- [ ] **Step 3: Viết implementation tối thiểu**

```ts
export type GlobalFilterSummaryInput = {
  departmentLabels: readonly string[];
  areaLabels: readonly string[];
  dateLabel: string | null;
};

export type GlobalFilterSummaryPresentation = {
  activeCount: number;
  visibleLabel: string;
  ariaLabel: string;
};

export function presentGlobalFilterSummary({
  departmentLabels,
  areaLabels,
  dateLabel,
}: GlobalFilterSummaryInput): GlobalFilterSummaryPresentation {
  const labels = [
    ...departmentLabels,
    ...areaLabels,
    ...(dateLabel ? [dateLabel] : []),
  ];
  const activeCount = labels.length;
  const visible = labels.slice(0, 2);
  const remaining = activeCount - visible.length;

  return {
    activeCount,
    visibleLabel: activeCount === 0
      ? "Tất cả dữ liệu"
      : `${visible.join(" · ")}${remaining > 0 ? ` · +${remaining}` : ""}`,
    ariaLabel: activeCount === 0
      ? "Bộ lọc dữ liệu: đang xem tất cả"
      : `Bộ lọc dữ liệu: ${activeCount} điều kiện đang áp dụng`,
  };
}
```

- [ ] **Step 4: Chạy test để xác nhận GREEN**

Run:

```powershell
node --import tsx --test tests/unit/global-filter-summary.test.mjs
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit task 1**

```powershell
git add src/features/overview/globalFilterSummary.ts tests/unit/global-filter-summary.test.mjs
git commit -m "test(ui): them tom tat bo loc du lieu"
```

### Task 2: Tích hợp copy và markup capsule vào GlobalFilterBar

**Files:**
- Modify: `src/App.tsx:487-682`
- Modify: `tests/unit/ui-ux-baseline.test.mjs:87-100`

**Interfaces:**
- Consumes: `presentGlobalFilterSummary()` từ Task 1; `DEPT_CODE`, `deptSel`, `areaSel`, `customFrom`, `customTo`, `todayMode` hiện có.
- Produces: `[data-global-filter]`, `.vmp-global-filter__command`, `.vmp-global-filter__label`, `.vmp-global-filter__summary`, trigger `#vmp-global-filter-trigger` có copy `Thay đổi`.

- [ ] **Step 1: Cập nhật source contract để test thất bại**

Thay contract cũ bằng:

```js
assert.match(app, /data-global-filter/);
assert.match(app, /aria-label=\{filterSummary\.ariaLabel\}/);
assert.match(app, /vmp-global-filter__label[\s\S]*?Bộ lọc dữ liệu/);
assert.match(app, /vmp-global-filter__summary/);
assert.match(app, /\{filterSummary\.visibleLabel\}/);
assert.match(app, />\s*Thay đổi\s*<\/button>/s);
```

- [ ] **Step 2: Chạy source contract để xác nhận RED**

Run:

```powershell
node --import tsx --test tests/unit/ui-ux-baseline.test.mjs
```

Expected: FAIL vì App chưa có `data-global-filter` và copy mới.

- [ ] **Step 3: Tạo summary từ state hiện có**

Thêm import:

```ts
import { presentGlobalFilterSummary } from "./features/overview/globalFilterSummary.ts";
```

Ngay trước nhánh `rutGon`, tạo presentation:

```ts
const dateLabel = !todayMode && (customFrom || customTo)
  ? `${customFrom || "…"}–${customTo || "…"}`
  : null;
const filterSummary = presentGlobalFilterSummary({
  departmentLabels: deptSel.map((value) =>
    (DEPT_CODE as Record<string, string>)[value] || value.toUpperCase()),
  areaLabels: areaSel.map((value) => `Khu vực ${value}`),
  dateLabel,
});
```

- [ ] **Step 4: Thay markup của nhánh đầy đủ, giữ nguyên panel**

Khung mới phải có dạng:

```tsx
<div
  role="group"
  aria-label={filterSummary.ariaLabel}
  className="vmp-global-filter"
  data-global-filter
>
  <div className="vmp-global-filter__primary">
    <div className="vmp-global-filter__command">
      <span className="vmp-global-filter__label">
        <Filter size={15} aria-hidden="true" />
        Bộ lọc dữ liệu
      </span>
      <span className="vmp-global-filter__summary" title={filterSummary.visibleLabel}>
        {filterSummary.visibleLabel}
      </span>
      <div ref={popRef} className="vmp-global-filter__popover">
        <button
          id="vmp-global-filter-trigger"
          ref={triggerRef}
          className="vmp-global-filter__trigger"
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="vmp-global-filter-panel"
        >
          Thay đổi
        </button>
        {open && (
          /* giữ nguyên #vmp-global-filter-panel và toàn bộ nội dung hiện tại */
        )}
      </div>
    </div>
    {personControl}
  </div>
  {hasVisibleChips && (
    /* giữ nguyên chip và nút data-global-filter-reset */
  )}
</div>
```

Không thay nhánh `if (rutGon)` và không dùng `filterSummary` làm điều kiện reset nhân sự.

- [ ] **Step 5: Chạy unit/source contract và typecheck**

Run:

```powershell
node --import tsx --test tests/unit/global-filter-summary.test.mjs tests/unit/ui-ux-baseline.test.mjs
npm run typecheck
```

Expected: toàn bộ test được chọn PASS; typecheck exit 0.

- [ ] **Step 6: Commit task 2**

```powershell
git add src/App.tsx tests/unit/ui-ux-baseline.test.mjs
git commit -m "feat(ui): ket noi cum bo loc du lieu"
```

### Task 3: CSS responsive và E2E hành vi–hình học

**Files:**
- Modify: `src/features/overview/overview-executive.css:1-207`
- Modify: `tests/e2e/overview-executive-dashboard.mjs:48-349`

**Interfaces:**
- Consumes: class/attribute từ Task 2.
- Produces: capsule theo nội dung ở desktop, một hàng 44px ở mobile, chips wrap và không overflow.

- [ ] **Step 1: Đổi selector và thêm E2E assertion đang thất bại**

Trong riêng test này, đổi selector root từ `[aria-label="Phạm vi toàn hệ thống"]` sang `[data-global-filter]`. Thêm kiểm tra trạng thái đầu:

```js
const compactInitial = await page.$eval("[data-global-filter]", (root) => {
  const command = root.querySelector(".vmp-global-filter__command");
  return {
    ariaLabel: root.getAttribute("aria-label"),
    summary: root.querySelector(".vmp-global-filter__summary")?.textContent?.trim(),
    trigger: root.querySelector("#vmp-global-filter-trigger")?.textContent?.trim(),
    rootWidth: root.getBoundingClientRect().width,
    commandWidth: command?.getBoundingClientRect().width ?? 0,
  };
});
assert.equal(compactInitial.ariaLabel, "Bộ lọc dữ liệu: đang xem tất cả");
assert.equal(compactInitial.summary, "Tất cả dữ liệu");
assert.equal(compactInitial.trigger, "Thay đổi");
assert.ok(compactInitial.commandWidth < compactInitial.rootWidth * 0.7);
```

Sau khi chọn XSX và Khu A, thay kỳ vọng trigger cũ bằng:

```js
assert.equal(selected.trigger, "Thay đổi");
assert.equal(selected.summary, "XSX · Khu vực Khu A");
assert.equal(selected.ariaLabel, "Bộ lọc dữ liệu: 2 điều kiện đang áp dụng");
```

Đổi ba điểm chờ số đếm trên trigger sang trạng thái summary/group:

```js
await page.waitForFunction(() =>
  document.querySelector("[data-global-filter]")?.getAttribute("aria-label")
    === "Bộ lọc dữ liệu: 1 điều kiện đang áp dụng");
await page.waitForFunction(() =>
  document.querySelector("[data-global-filter]")?.getAttribute("aria-label")
    === "Bộ lọc dữ liệu: 2 điều kiện đang áp dụng");
```

Sau khi xoá XSX:

```js
assert.equal(afterOneChip.summary, "Khu vực Khu A");
assert.equal(afterOneChip.ariaLabel, "Bộ lọc dữ liệu: 1 điều kiện đang áp dụng");
```

Sau `Xóa tất cả`, chờ trạng thái rỗng thay vì chờ text trigger:

```js
await page.waitForFunction(() => {
  const root = document.querySelector("[data-global-filter]");
  return root?.getAttribute("aria-label") === "Bộ lọc dữ liệu: đang xem tất cả"
    && root.querySelector(".vmp-global-filter__summary")?.textContent?.trim() === "Tất cả dữ liệu"
    && !root.querySelector(".vmp-global-filter__chips");
});
```

Ở viewport 390px, đo capsule:

```js
const mobileCompact = await page.$eval("[data-global-filter]", (root) => {
  const command = root.querySelector(".vmp-global-filter__command");
  const segments = [...command.querySelectorAll(":scope > *")];
  const tops = segments.map((segment) => segment.getBoundingClientRect().top);
  return {
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    commandOverflow: command.scrollWidth - command.clientWidth,
    commandHeight: command.getBoundingClientRect().height,
    rowDelta: Math.max(...tops) - Math.min(...tops),
  };
});
assert.ok(mobileCompact.pageOverflow <= 1);
assert.ok(mobileCompact.commandOverflow <= 1);
assert.ok(mobileCompact.commandHeight >= 43.5);
assert.ok(mobileCompact.rowDelta < 2);
```

- [ ] **Step 2: Chạy E2E để xác nhận RED**

Run:

```powershell
$env:VMP_E2E_URL='http://127.0.0.1:5173/'
node tests/e2e/overview-executive-dashboard.mjs
```

Expected: FAIL ở assertion hình học vì CSS command capsule chưa có.

- [ ] **Step 3: Thay CSS card rộng bằng capsule nối liền**

Áp dụng cấu trúc cốt lõi:

```css
.vmp-global-filter {
  position: relative;
  z-index: 40;
  min-width: 0;
  margin-bottom: 14px;
}

.vmp-global-filter__primary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.vmp-global-filter__command {
  display: inline-flex;
  align-items: stretch;
  min-width: 0;
  max-width: min(100%, 720px);
  min-height: 44px;
  overflow: visible;
  border: 1px solid var(--lp-line);
  border-top-color: var(--lp-gold-hairline);
  border-radius: 14px;
  background: var(--lp-sheen);
  box-shadow: var(--lp-e-low);
}

.vmp-global-filter__label,
.vmp-global-filter__summary,
.vmp-global-filter__trigger {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  padding: 0 12px;
}

.vmp-global-filter__label {
  gap: 7px;
  color: var(--lp-plum);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.vmp-global-filter__summary {
  overflow: hidden;
  border-left: 1px solid var(--lp-line);
  color: var(--lp-ink-muted);
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vmp-global-filter__trigger {
  min-height: 42px;
  border: 0;
  border-left: 1px solid var(--lp-line);
  border-radius: 0 13px 13px 0;
  background: var(--lp-bg-raised);
}

.vmp-global-filter__chips {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  margin-top: 8px;
  flex-wrap: wrap;
}
```

Giữ CSS panel, fieldset, option, focus-visible và done button hiện tại. Xoá các rule card/primary cũ bị thay thế, không để hai nguồn định nghĩa xung đột.

- [ ] **Step 4: Thêm breakpoint mobile không đổi thứ tự tác vụ**

```css
@media (max-width: 640px) {
  .vmp-global-filter__primary {
    align-items: stretch;
    flex-direction: column;
    gap: 8px;
  }

  .vmp-global-filter__command {
    width: 100%;
    max-width: 100%;
  }

  .vmp-global-filter__label {
    padding-inline: 10px;
  }

  .vmp-global-filter__summary {
    flex: 1 1 auto;
    padding-inline: 9px;
  }

  .vmp-global-filter__trigger {
    min-height: 44px;
    padding-inline: 10px;
  }

  .vmp-global-filter__person {
    width: 100%;
    margin-left: 0;
  }
}
```

- [ ] **Step 5: Chạy E2E để xác nhận GREEN**

Run:

```powershell
$env:VMP_E2E_URL='http://127.0.0.1:5173/'
node tests/e2e/overview-executive-dashboard.mjs
```

Expected: exit 0; popover, URL, chip/reset, focus return và hình học desktop/mobile đều PASS.

- [ ] **Step 6: Commit task 3**

```powershell
git add src/features/overview/overview-executive.css tests/e2e/overview-executive-dashboard.mjs
git commit -m "style(ui): lam gon thanh loc toan cuc"
```

### Task 4: Visual check và gate cuối

**Files:**
- Modify only if a verified defect is found: `src/App.tsx`, `src/features/overview/overview-executive.css`, tests directly covering the defect.

**Interfaces:**
- Consumes: component hoàn chỉnh từ Tasks 1–3.
- Produces: bằng chứng desktop/mobile/light/dark và build sạch.

- [ ] **Step 1: Chạy toàn bộ unit test**

Run:

```powershell
npm run test:unit
```

Expected: exit 0, không có unit test hỏng.

- [ ] **Step 2: Chạy typecheck và build**

Run:

```powershell
npm run typecheck
npm run build
```

Expected: cả hai exit 0.

- [ ] **Step 3: Chụp bốn trạng thái mục tiêu**

Dùng Puppeteer và bộ giả lập hiện có để chụp màn `#v=overview`:

```text
overview-filter-light-1440x900.png
overview-filter-dark-1440x900.png
overview-filter-light-390x844.png
overview-filter-dark-390x844.png
```

Mỗi ảnh phải cho thấy capsule không kéo thành card rỗng; mobile không xuống hai hàng trong nội bộ capsule; dark mode không có bề mặt light bị hardcode.

- [ ] **Step 4: Kiểm tra Git diff đúng phạm vi**

Run:

```powershell
git diff --check
git status --short
```

Expected: không có whitespace error; chỉ các file trong File Map và artifact ảnh kiểm tra chưa track xuất hiện.

- [ ] **Step 5: Nếu Step 3 buộc sửa, chạy lại đúng gate liên quan và commit**

```powershell
git add src/App.tsx src/features/overview/overview-executive.css tests/unit/global-filter-summary.test.mjs tests/unit/ui-ux-baseline.test.mjs tests/e2e/overview-executive-dashboard.mjs
git commit -m "fix(ui): hoan thien thanh loc du lieu responsive"
```

Nếu Step 3 không phát hiện lỗi thì không tạo commit rỗng và không chạy lại gate đã có bằng chứng mới nhất.

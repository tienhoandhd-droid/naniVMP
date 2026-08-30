# Overview Vali Chibi Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay chân dung Vali ở Tổng quan bằng đúng bộ chibi của tab Thực hiện và mở rộng vùng chữ thành bảng tin tổng hợp có dữ liệu kiểm chứng được.

**Architecture:** Mở rộng helper thuần `buildValiBrief` để trả về headline, bốn metrics, hai observations và action; component chỉ chịu trách nhiệm render. Tái sử dụng ba WebP chibi hiện có qua `new URL(..., import.meta.url)` để Node test không phải nạp binary và Vite vẫn fingerprint asset.

**Tech Stack:** React 18, TypeScript, CSS thuần, Node test runner, Puppeteer E2E, Vite.

## Global Constraints

- Chỉ sửa `PrincessCommentary`, helper `valiBrief`, CSS và test trực tiếp.
- Không đổi Vòng năm, KPI, công thức nguồn, điều hướng hoặc quyền.
- Luôn hiển thị đúng 4 metrics, 2 observations và 1 action.
- Dùng `vali-chibi-guide.webp`, `vali-chibi-concern.webp`, `vali-chibi-celebrate.webp` theo mood.
- Không thêm dependency, không commit và không push.

---

### Task 1: Mô hình bảng tin tổng hợp

**Files:**
- Modify: `src/features/overview/valiBrief.ts`
- Modify: `tests/unit/overview-vali-brief.test.mjs`

**Interfaces:**
- Consumes: `{ rate, done, total, todo, documentRate, documentDone, documentTotal, overdue, soon, mismatched }`.
- Produces: `buildValiBrief(stats)` trả `{ mood, moodLabel, headline, metrics, observations, action }`; `metrics.length === 4`, `observations.length === 2`.

- [ ] **Step 1: Viết test thất bại cho contract mới**

Test trường hợp có quá hạn phải xác nhận:

```js
assert.deepEqual(brief.metrics.map((metric) => metric.kind), [
  "progress", "documents", "overdue", "soon",
]);
assert.deepEqual(brief.observations.map((item) => item.kind), ["todo", "mismatched"]);
assert.match(brief.action, /quá hạn/i);
```

Test trường hợp sạch phải xác nhận số 0 vẫn xuất hiện trong observation và action chuyển sang duy trì tiến độ.

- [ ] **Step 2: Chạy unit để xác nhận RED**

Run: `node --import tsx --test tests/unit/overview-vali-brief.test.mjs`

Expected: FAIL vì helper hiện chỉ trả tối đa hai facts.

- [ ] **Step 3: Mở rộng helper bằng dữ liệu đã chuẩn hóa**

Giữ luật mood hiện có. Metrics phải dùng đúng các giá trị đã clamp; metric tỷ lệ có detail dạng `done/total hoàn thành`, metric số đếm không suy ra phần trăm. Action ưu tiên quá hạn → tới hạn → lệch pha → duy trì.

- [ ] **Step 4: Chạy unit để xác nhận GREEN**

Expected: toàn bộ test `overview-vali-brief` PASS.

### Task 2: Chibi và layout bảng tin

**Files:**
- Modify: `src/components/ui/Primitives.tsx`
- Modify: `src/index.css`
- Modify: `tests/e2e/overview-executive-dashboard.mjs`

**Interfaces:**
- Consumes: `stats.e`, `stats.d`, output mới của `buildValiBrief`, ba asset chibi.
- Produces: `img[data-vmp-vali-chibi=<mood>]`, 4 `[data-vmp-vali-metric]`, 2 `[data-vmp-vali-observation]`, `[data-vmp-vali-action]`.

- [ ] **Step 1: Bổ sung E2E contract và xác nhận RED**

E2E tại scenario hiện có phải đòi `vali-chibi-concern.webp`, đúng 4 metrics, đúng 2 observations, action có chữ “quá hạn”, ảnh có accessible name `Công chúa Vali đang lo`, và mobile không tràn.

Run:

```powershell
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:VMP_E2E_SUPABASE_URL='https://ivembmikfhtyzhtqebgh.supabase.co'
node tests/e2e/overview-executive-dashboard.mjs
```

Expected: FAIL vì component vẫn dùng portrait web và chỉ hai facts.

- [ ] **Step 2: Đổi asset và markup**

Trong `PrincessCommentary`, type `d` thành tally đầy đủ; truyền `done/total` của VMP và hồ sơ vào helper. Render chibi trước content trong DOM, dùng `role="img"` và `aria-label` theo `moodLabel`. Render metrics bằng `dl`, observations bằng list, action bằng paragraph có label “Ưu tiên”.

- [ ] **Step 3: Cân CSS responsive**

Desktop dùng cột chibi 150–170px và nội dung còn lại; metrics 4 cột. Tablet metrics 2 cột. Mobile giữ chibi 72–88px, metrics 1 cột và không có pseudo-element làm tăng `scrollWidth`.

- [ ] **Step 4: Chạy unit và targeted E2E để xác nhận GREEN**

Run unit của Vali + Vòng năm và targeted Overview E2E. Expected: tất cả PASS.

### Task 3: Gate bàn giao và ảnh duyệt

**Files:**
- Verify only; ảnh lưu trong `%TEMP%`.

- [ ] **Step 1: Chạy `npm run typecheck`**

Expected: exit 0.

- [ ] **Step 2: Chạy production build**

Thử `npm run build`; nếu vẫn gặp `EPERM` ở `.env`, dùng Vite programmatic build với `envDir`/`outDir` tạm sạch. Expected: exit 0 và ba asset chibi được fingerprint.

- [ ] **Step 3: Chạy `git diff --check` và chụp desktop/mobile**

Expected: diff sạch; desktop không có khoảng trống vô nghĩa; mobile không chồng chữ hoặc tràn ngang.

# VMP Balanced Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giảm tải lạnh không liên quan và tách Báo cáo khỏi bundle khởi động để VMP tải nhanh, chuyển màn mượt hơn mà không đổi UI hay nghiệp vụ.

**Architecture:** Bỏ idle-prefetch toàn cục và tiếp tục dùng intent-prefetch allowlist hiện có. Chuyển `ReportsView` thành route lazy thật, đồng thời mở rộng hai gate hiện có: manifest phải chứng minh route có JavaScript riêng và runtime phải cấm Long Môn/ExcelJS trên cold load của các route desktop được duyệt.

**Tech Stack:** React 18.3, TypeScript 7, Vite 6/Rollup manifest, Node test runner, Puppeteer + Chrome, Supabase mock.

## Global Constraints

- Không thay đổi giao diện, dữ liệu, quyền, API hay quy trình nghiệp vụ.
- Không thêm dependency, service worker hoặc PWA.
- Không preload Timeline, ExcelJS hay tài nguyên nặng khi người dùng chưa yêu cầu.
- Giữ `React.lazy()` qua `nhapCoThuLai()` và giữ `Suspense`/`SkeletonDashboard` hiện tại.
- Không xóa CSS diện rộng và không giảm chất lượng tranh Timeline.
- Không chạy `npm run e2e` hoặc `tests/e2e/quet-tat-ca-man.mjs` vì dùng production thật.
- Không push, deploy, apply migration hoặc ghi dịch vụ remote.
- Chỉ stage đúng file của từng task; giữ nguyên các artifact chưa track của người dùng.

## File map

- `src/App.tsx`: khai báo route lazy và bỏ idle-prefetch sau đăng nhập.
- `scripts/do-hieu-nang.mjs`: nhận diện tài nguyên nặng bị tải sai trên cold route.
- `scripts/check-desktop-performance-budgets.mjs`: bắt buộc mỗi route đo có JavaScript chunk riêng ngoài shell.
- `tests/unit/desktop-runtime-performance-gate.test.mjs`: hợp đồng tài nguyên bị cấm và không còn prefetch tự động.
- `tests/unit/desktop-performance-budget.test.mjs`: hợp đồng manifest route split.
- `tests/e2e/desktop-cta-copy.mjs`: hồi quy Báo cáo sau khi lazy-load.

---

### Task 1: Chặn tải nền Timeline ngoài ý định người dùng

**Files:**
- Modify: `tests/unit/desktop-runtime-performance-gate.test.mjs`
- Modify: `scripts/do-hieu-nang.mjs`
- Modify: `src/App.tsx:112-148,1439-1442`

**Interfaces:**
- Consumes: `assertDesktopRuntimeBudget(screen, metrics, warn, options)` và `optionalChunksBeforeAction` hiện có.
- Produces: `findUnexpectedColdAssets(resourceNames: string[]): string[]`; App không còn `prefetchKhiRanh()` hoặc effect gọi hàm này.

- [ ] **Step 1: Viết test RED cho bộ nhận diện tài nguyên cold-load**

Thêm `findUnexpectedColdAssets` vào import từ `scripts/do-hieu-nang.mjs`, sau đó thêm:

```js
test("cold-route asset guard rejects Timeline art and ExcelJS only", () => {
  assert.deepEqual(findUnexpectedColdAssets([
    "index-abc.js",
    "long-mon-vmp-racecourse-60-days-v17.webp",
    "long-mon-six-species-v16.webp",
    "exceljs.min-xyz.js",
    "AlertsPage-abc.js",
  ]), [
    "long-mon-vmp-racecourse-60-days-v17.webp",
    "long-mon-six-species-v16.webp",
    "exceljs.min-xyz.js",
  ]);
});

```

- [ ] **Step 2: Chạy test để xác nhận RED**

Run:

```powershell
node --import tsx --test tests/unit/desktop-runtime-performance-gate.test.mjs
```

Expected: FAIL vì `findUnexpectedColdAssets` chưa được export.

- [ ] **Step 3: Thêm bộ nhận diện tài nguyên tải sai**

Trong `scripts/do-hieu-nang.mjs`, thay regex chỉ dành cho Báo cáo bằng helper dùng chung:

```js
const UNEXPECTED_COLD_ASSET = /(?:long-mon-|exceljs)/i;

export function findUnexpectedColdAssets(resourceNames) {
  return resourceNames.filter((name) => UNEXPECTED_COLD_ASSET.test(name));
}
```

Trong `measureScreen()`, thay nhánh chỉ lọc `OPTIONAL_REPORT_CHUNK` bằng:

```js
optionalChunksBeforeAction: findUnexpectedColdAssets(
  resources.map((resource) => resource.name.split("/").pop()),
),
```

Giữ `assertDesktopRuntimeBudget()` hiện tại để mọi kết quả trong mảng này làm gate thất bại với tên file cụ thể.

- [ ] **Step 4: Chứng minh runtime RED trên bản App hiện tại**

Chạy unit helper GREEN, build production khi `prefetchKhiRanh()` vẫn còn, phục vụ `dist` trên IPv4 rồi chạy runtime gate:

```powershell
node --import tsx --test tests/unit/desktop-runtime-performance-gate.test.mjs
$env:VITE_MANUAL_PLANNED_DEADLINES_ENABLED='true'
npm run build
node scripts/do-hieu-nang.mjs --check
```

Expected: unit PASS; runtime FAIL và nêu tên ít nhất một file `long-mon-*.webp` được tải trước hành động ở route không phải Timeline. Đây là test hành vi chứng minh idle-prefetch hiện tại là nguyên nhân, không dùng grep source.

- [ ] **Step 5: Bỏ idle-prefetch toàn cục trong App**

Trong `src/App.tsx`:

- Giữ `taiTimelinePage`, `taiAlertsPage`, `taiUpdatePage` làm loader cho `React.lazy()`.
- Xóa `let daPrefetch = false` và toàn bộ hàm `prefetchKhiRanh()`.
- Xóa effect sau đăng nhập:

```tsx
useEffect(() => { prefetchKhiRanh(); }, []);
```

- Sửa chú thích loader thành:

```tsx
/* Loader có tên riêng cho các route lazy dùng lại trong nhapCoThuLai().
 * Prefetch điều hướng được kiểm soát theo intent ở lib/routePrefetch.ts;
 * shell không tự tải route nặng sau đăng nhập. */
```

- [ ] **Step 6: Chạy test GREEN và typecheck**

Run:

```powershell
node --import tsx --test tests/unit/desktop-runtime-performance-gate.test.mjs
npm run typecheck
```

Expected: tất cả test trong file PASS; typecheck exit 0.

- [ ] **Step 7: Commit Task 1**

```powershell
git add -- src/App.tsx scripts/do-hieu-nang.mjs tests/unit/desktop-runtime-performance-gate.test.mjs
git commit -m "perf: dung tai nen route nang sau dang nhap"
```

---

### Task 2: Tách Báo cáo thành route chunk thật

**Files:**
- Modify: `tests/unit/desktop-performance-budget.test.mjs`
- Modify: `scripts/check-desktop-performance-budgets.mjs`
- Modify: `src/App.tsx:118-154,1371`

**Interfaces:**
- Consumes: `staticFilesForEntry()` và `routeFilesOutsideShell()` từ bundle budget.
- Produces: `assertRouteHasOwnJavaScript(entryKey: string, routeFiles: Set<string>): void`; `ReportsView` là lazy component nhận `{ acts: Activity[] }` như trước.

- [ ] **Step 1: Viết test RED cho route không có JavaScript riêng**

Thêm `assertRouteHasOwnJavaScript` vào import test, sau đó thêm:

```js
test("route budget rejects a route folded into the shell", () => {
  assert.throws(
    () => assertRouteHasOwnJavaScript(
      "src/components/dashboard/ReportsView.tsx",
      new Set(["assets/reports.css"]),
    ),
    /không có JavaScript chunk riêng/,
  );
  assert.doesNotThrow(() => assertRouteHasOwnJavaScript(
    "src/components/dashboard/ReportsView.tsx",
    new Set(["assets/reports.js", "assets/reports.css"]),
  ));
});
```

- [ ] **Step 2: Chạy test để xác nhận RED**

Run:

```powershell
node --import tsx --test tests/unit/desktop-performance-budget.test.mjs
```

Expected: FAIL vì `assertRouteHasOwnJavaScript` chưa tồn tại.

- [ ] **Step 3: Siết manifest budget**

Trong `scripts/check-desktop-performance-budgets.mjs`, thêm:

```js
export function assertRouteHasOwnJavaScript(entryKey, routeFiles) {
  if (![...routeFiles].some((file) => file.endsWith(".js"))) {
    throw new Error(`${entryKey} không có JavaScript chunk riêng ngoài shell`);
  }
}
```

Trong vòng lặp `ROUTE_BUDGETS`, gọi helper trước khi tính gzip:

```js
const routeDelta = routeFilesOutsideShell(manifest, entryKey, shellFiles);
assertRouteHasOwnJavaScript(entryKey, routeDelta);
const gzip = gzipSizeForFiles(outputDir, routeDelta);
```

- [ ] **Step 4: Chuyển ReportsView sang lazy route**

Trong nhóm loader ở `src/App.tsx`, thêm:

```tsx
const taiReportsView = () => import("./components/dashboard/ReportsView.tsx");
const ReportsView = lazy(nhapCoThuLai(taiReportsView));
```

Xóa:

```tsx
import ReportsView from "./components/dashboard/ReportsView.tsx";
const ReportsViewMemo = memo(ReportsView);
```

Đổi nhánh router thành:

```tsx
{!boundaryDuLieu && view === "reports" && <ReportsView acts={filteredActs} />}
```

Không đổi nội dung hoặc props bên trong `ReportsView.tsx`.

- [ ] **Step 5: Chạy unit và typecheck GREEN**

Run:

```powershell
node --import tsx --test tests/unit/desktop-performance-budget.test.mjs tests/unit/desktop-runtime-performance-gate.test.mjs
npm run typecheck
```

Expected: hai file test PASS; typecheck exit 0.

- [ ] **Step 6: Build và chứng minh Reports có chunk riêng**

Run:

```powershell
$env:VITE_MANUAL_PLANNED_DEADLINES_ENABLED='true'
npm run build
node scripts/check-desktop-performance-budgets.mjs
```

Expected:

- Build exit 0.
- Output có `ReportsView-<hash>.js`.
- Không còn cảnh báo `ReportsView.tsx is dynamically imported ... but also statically imported`.
- Bundle budget exit 0 và route Reports có gzip lớn hơn 0 nhưng không quá 50 KiB.

- [ ] **Step 7: Commit Task 2**

```powershell
git add -- src/App.tsx scripts/check-desktop-performance-budgets.mjs tests/unit/desktop-performance-budget.test.mjs
git commit -m "perf: tach bao cao khoi bundle khoi dong"
```

---

### Task 3: Kiểm chứng runtime, hành vi và số đo trước/sau

**Files:**
- Test only: `tests/e2e/desktop-cta-copy.mjs`
- Test only: `tests/unit/desktop-performance-budget.test.mjs`
- Test only: `tests/unit/desktop-runtime-performance-gate.test.mjs`

**Interfaces:**
- Consumes: production `dist`, preview IPv4 `http://127.0.0.1:4173`, Supabase mock từ `tests/e2e/gia-lap-supabase.mjs`.
- Produces: bảng before/after cho tải lạnh, DOM, primary action và long task của bảy route.

- [ ] **Step 1: Khởi động lại preview production trên IPv4**

Kiểm tra đúng cổng trước khi tác động. Nếu process preview do phiên này tạo đang giữ 4173, dừng đúng PID đó; không kill theo tên process. Sau đó chạy ẩn:

```powershell
npx vite preview --port 4173 --strictPort --host 127.0.0.1
```

Expected: `Invoke-WebRequest http://127.0.0.1:4173/` trả HTTP 200.

- [ ] **Step 2: Chạy runtime gate production**

Run:

```powershell
node scripts/do-hieu-nang.mjs --check
```

Expected:

- Bảy route không báo `optional chunk tải trước hành động` cho Long Môn hoặc ExcelJS.
- Primary action của mỗi route không quá 2.500 ms.
- Skeleton chuyển route không quá 100 ms.
- Long task không quá 50 ms theo gate hiện tại.

Ghi lại từng dòng `tai=`, `primary=`, `skeleton=` và `long=` để so với baseline trong spec.

- [ ] **Step 3: Chạy mocked E2E của Báo cáo**

Run:

```powershell
$env:VMP_E2E_URL='http://127.0.0.1:4173/'
node tests/e2e/desktop-cta-copy.mjs
```

Expected: PASS; ba CTA Báo cáo vẫn là `In / lưu PDF`, `Tải Excel · 5 sheet`, `Tải HTML`, không wrap hoặc tràn viewport.

- [ ] **Step 4: Chạy gate cuối Windows-safe**

Run:

```powershell
node --import tsx --test tests/unit/desktop-performance-budget.test.mjs tests/unit/desktop-runtime-performance-gate.test.mjs
npm run typecheck
npm run budget
git diff --check
```

Expected: tất cả exit 0. Không chạy nhóm unit song song có spawn giành cổng theo cảnh báo trong handoff.

- [ ] **Step 5: Rà diff và trạng thái repo**

Run:

```powershell
git diff HEAD~2 -- src/App.tsx scripts/do-hieu-nang.mjs scripts/check-desktop-performance-budgets.mjs tests/unit/desktop-runtime-performance-gate.test.mjs tests/unit/desktop-performance-budget.test.mjs
git status --short --branch
```

Expected: chỉ có hai commit source/test của kế hoạch; các artifact untracked có từ trước vẫn nguyên vẹn; không có secret hoặc file remote/migration.

- [ ] **Step 6: Mở bản local cho người dùng kiểm tra**

Mở Chrome tại:

```text
http://127.0.0.1:4173/#v=overview
```

Sau đó báo cáo:

- file đã thay đổi;
- commit local;
- lệnh đã chạy và số test;
- bảng baseline/after cho bảy route;
- mức giảm JS đường găng và tải lạnh;
- cảnh báo build còn lại;
- rủi ro lần đầu mở Timeline phải tải theo yêu cầu.

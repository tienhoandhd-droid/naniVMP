# Overview Analysis Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa phần phân tích ra hiển thị trực tiếp trên Overview và biên tập thành ba lớp tuần tự, dễ đọc, không lặp KPI/trạng thái đã có.

**Architecture:** `Overview` chỉ dựng khung biên tập và truyền `acts`; `CompletionDashboard` giữ duy nhất một state bộ lọc cho lớp dòng chảy và lớp so sánh, nhận ma trận qua prop `matrix` để đặt đúng giữa hai lớp. Công thức bốn giai đoạn được tách thành helper thuần để unit test và tái sử dụng trong bảng/phễu mà không tạo một cách đếm thứ hai.

**Tech Stack:** React 18, TypeScript, CSS thuần, Node test runner + tsx, Puppeteer E2E, Vite.

## Global Constraints

- Không đổi công thức tally, deadline, chấm giai đoạn hoặc dữ liệu Supabase.
- Không thêm API, RPC, nguồn dữ liệu, thư viện chart hoặc dependency mới.
- Không chỉnh KPI, Vòng năm, Vali, quyền truy cập hoặc điều hướng.
- Chỉ một bộ lọc nội bộ điều khiển dòng chảy và so sánh cơ cấu; ma trận tiếp tục nhận cùng `acts` của Overview.
- Desktop hiển thị bốn bước một hàng; mobile xếp dọc, control tối thiểu 44px và chỉ bảng ma trận được cuộn ngang.
- Không commit, push, deploy hoặc cập nhật dịch vụ remote trong phiên triển khai này.

---

### Task 1: Mô hình dòng chảy bốn giai đoạn

**Files:**
- Create: `src/features/overview/analysisStudioModel.ts`
- Create: `tests/unit/overview-analysis-studio.test.mjs`
- Modify: `src/components/dashboard/CompletionDashboard.tsx`

**Interfaces:**
- Consumes: `Activity[]` và luật hoàn thành hiện có `wlIsDone`.
- Produces: `ANALYSIS_STAGES`, `buildCompletionFlow(activities)` trả `{ stages, bottleneck }`; mỗi stage có `{ id, label, short, done, total, rate, deltaFromPrevious }`.

- [ ] **Step 1: Viết unit test thất bại cho thứ tự, tỷ lệ và chênh lệch**

```js
import { buildCompletionFlow } from "../../src/features/overview/analysisStudioModel.ts";

test("dòng chảy giữ đúng bốn giai đoạn và chỉ ra điểm tụt lớn nhất", () => {
  const flow = buildCompletionFlow([
    activity({ protocol: true, validation: true, report: true, vmp: true }),
    activity({ protocol: true, validation: true, report: false, vmp: false }),
    activity({ protocol: true, validation: false, report: false, vmp: false }),
  ]);
  assert.deepEqual(flow.stages.map((stage) => stage.id), ["protocol", "validation", "report", "vmp"]);
  assert.deepEqual(flow.stages.map((stage) => stage.rate), [100, 67, 33, 33]);
  assert.deepEqual(flow.stages.map((stage) => stage.deltaFromPrevious), [null, -33, -34, 0]);
  assert.equal(flow.bottleneck?.to, "report");
});
```

- [ ] **Step 2: Chạy RED**

Run: `node --import tsx --test tests/unit/overview-analysis-studio.test.mjs`

Expected: FAIL vì module `analysisStudioModel.ts` chưa tồn tại.

- [ ] **Step 3: Viết helper thuần bằng đúng luật hiện tại**

```ts
export const ANALYSIS_STAGES = [
  { id: "protocol", label: "Hoàn thành đề cương", short: "Đề cương", field: "tt_de_cuong" },
  { id: "validation", label: "Thẩm định thực tế", short: "Thực tế", field: "tt_tham_dinh" },
  { id: "report", label: "Hoàn thành hồ sơ", short: "Hồ sơ", field: "tt_bao_cao" },
  { id: "vmp", label: "Hoàn thành VMP", short: "VMP", field: "tt_vmp" },
] as const;

export function buildCompletionFlow(activities: Activity[]): CompletionFlow {
  const active = activities.filter((activity) => (activity.state || "active") === "active");
  // Dùng wlIsDone(raw[field]); riêng VMP giữ điều kiện activity.st === "done" hiện có.
}
```

- [ ] **Step 4: Thay `METRICS`/`completionSummary` trong `CompletionDashboard` bằng helper chung**

Giữ màu/icon ở component theo `stage.id`; không đưa token giao diện vào helper nghiệp vụ.

- [ ] **Step 5: Chạy GREEN**

Run: `node --import tsx --test tests/unit/overview-analysis-studio.test.mjs tests/unit/overview-vali-brief.test.mjs`

Expected: PASS toàn bộ; số liệu Vali không đổi.

### Task 2: Dòng chảy và so sánh không trùng lặp

**Files:**
- Modify: `src/components/dashboard/CompletionDashboard.tsx`
- Modify: `tests/e2e/overview-executive-dashboard.mjs`

**Interfaces:**
- Consumes: `acts: Activity[]`, `matrix: ReactNode`, `buildCompletionFlow`.
- Produces: `[data-analysis-flow]`, bốn `[data-analysis-stage]`, ba `[data-analysis-gap]`, `[data-analysis-comparison]`; chỉ một mode so sánh được mount.

- [ ] **Step 1: Bổ sung E2E contract và xác nhận RED**

```js
const analysis = await page.$eval("[data-overview-analysis-studio]", (root) => ({
  disclosure: [...root.querySelectorAll("button")].some((button) => /Phân tích chi tiết/i.test(button.textContent || "")),
  stages: root.querySelectorAll("[data-analysis-stage]").length,
  gaps: root.querySelectorAll("[data-analysis-gap]").length,
  statusBreakdowns: root.querySelectorAll("[data-analysis-status-breakdown]").length,
  comparisonPanels: root.querySelectorAll("[data-analysis-comparison-panel]").length,
}));
assert.deepEqual(analysis, { disclosure: false, stages: 4, gaps: 3, statusBreakdowns: 0, comparisonPanels: 1 });
```

Run: `node tests/e2e/overview-executive-dashboard.mjs`

Expected: FAIL vì studio chưa tồn tại và nội dung vẫn bị gập.

- [ ] **Step 2: Thay bốn `MetricCard` bằng dải dòng chảy**

```tsx
<ol className="analysis-flow" data-analysis-flow>
  {flow.stages.map((stage, index) => (
    <li key={stage.id} data-analysis-stage={stage.id}>
      <span>{stage.label}</span><strong>{stage.rate}%</strong><small>{stage.done}/{stage.total}</small>
      {index > 0 && <span data-analysis-gap>{stage.deltaFromPrevious} điểm</span>}
    </li>
  ))}
</ol>
```

Xóa `StatusBreakdown`, `MetricCard` và các import chỉ còn phục vụ hai khối này; giữ `CauKetLuan` cho điểm nghẽn.

- [ ] **Step 3: Hợp nhất bộ chuyển so sánh**

Tạo state:

```ts
type ComparisonMode = "validationType" | "department" | "person" | "executionDepartment" | "area" | "line";
const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("validationType");
```

Render một nhóm button `aria-pressed`; mode `validationType` mount lưới loại thẩm định, các mode khác mount `DimensionTable` không có bộ chọn riêng. Tại mọi thời điểm chỉ có một `[data-analysis-comparison-panel]`.

- [ ] **Step 4: Chèn `matrix` giữa dòng chảy và so sánh**

```tsx
export default function CompletionDashboard({ acts, matrix }: { acts: Activity[]; matrix: ReactNode }) {
  return <>{flowLayer}{matrix}{comparisonLayer}</>;
}
```

State lọc vẫn chỉ tồn tại một lần và tiếp tục dùng `scopedActs` cho cả flow/comparison.

- [ ] **Step 5: Chạy E2E GREEN cho contract cấu trúc**

Run: `node tests/e2e/overview-executive-dashboard.mjs`

Expected: các assertion mới qua đến phần ma trận; không có request ngoài fixture Supabase.

### Task 3: Ma trận điểm nghẽn gọn và truy cập được

**Files:**
- Modify: `src/components/dashboard/MaTranTienDo.tsx`
- Modify: `tests/e2e/overview-executive-dashboard.mjs`

**Interfaces:**
- Produces: `[data-analysis-matrix]`, `[data-analysis-quality-badge]`, hai nhóm control có accessible name “Xem theo” và “Cột”; modal ô và “Hiện thêm” giữ nguyên.

- [ ] **Step 1: Viết E2E RED cho toolbar, quality badge và hành vi ô**

```js
const matrix = await page.$eval("[data-analysis-matrix]", (root) => ({
  qualityBadges: root.querySelectorAll("[data-analysis-quality-badge]").length,
  qualityCards: [...root.querySelectorAll(".card")].filter((card) => card.textContent?.includes("Chất lượng dữ liệu")).length,
  rowGroups: root.querySelectorAll('[role="group"][aria-label="Xem theo"]').length,
  columnGroups: root.querySelectorAll('[role="group"][aria-label="Cột"]').length,
}));
assert.deepEqual(matrix, { qualityBadges: 1, qualityCards: 0, rowGroups: 1, columnGroups: 1 });
```

Sau đó click một ô có dữ liệu và xác nhận dialog vẫn mở; click mode trục/cột và xác nhận `aria-pressed` đổi.

- [ ] **Step 2: Chạy RED**

Run: `node tests/e2e/overview-executive-dashboard.mjs`

Expected: FAIL vì quality đang là card riêng và toolbar chưa có group/pressed semantics.

- [ ] **Step 3: Thu quality thành badge và chuẩn hóa toolbar**

Đặt badge cạnh `CardTitle`, giữ `%`, mức chất lượng và số ô thiếu trong accessible text. Bọc hai nhóm button bằng `role="group"`; thêm `type="button"`, `aria-pressed`, focus-visible class và giữ callback hiện có.

- [ ] **Step 4: Giữ “Đối tượng cần chú ý nhất” làm khối hành động duy nhất dưới bảng**

Xóa card chất lượng riêng; hotspot chiếm toàn chiều rộng, không đổi công thức xếp hạng hoặc modal.

- [ ] **Step 5: Chạy GREEN**

Run: `node tests/e2e/overview-executive-dashboard.mjs`

Expected: toolbar, badge, đổi trục/cột và dialog đều PASS.

### Task 4: Khung biên tập, responsive và gate bàn giao

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/features/overview/overview-executive.css`
- Modify: `src/index.css`
- Modify: `tests/e2e/overview-executive-dashboard.mjs`
- Verify: `docs/superpowers/specs/2026-08-30-overview-analysis-studio-design.md`

**Interfaces:**
- Produces: `<section data-overview-analysis-studio aria-labelledby="overview-analysis-title">`; ba lớp đánh số theo DOM: flow → matrix → comparison.

- [ ] **Step 1: Bỏ disclosure và render studio trực tiếp**

```tsx
<section className="overview-analysis-studio" data-overview-analysis-studio aria-labelledby="overview-analysis-title">
  <header className="overview-analysis-studio__header">
    <span>Phân tích chuyên sâu</span>
    <h2 id="overview-analysis-title">Dòng chảy, điểm nghẽn và cơ cấu</h2>
    <p>Đọc lần lượt từ giai đoạn đang hụt, nơi tập trung vấn đề đến nhóm đang dẫn hoặc tụt lại.</p>
  </header>
  <CompletionDashboard acts={acts} matrix={<MaTranTienDo acts={acts} />} />
</section>
```

Xóa state `sau`, nút `.vmp-mo-sau`, import `Pill` không dùng và comment mô tả accordion cũ.

- [ ] **Step 2: Viết CSS mobile-first cho một khung biên tập**

- `.overview-analysis-studio`: một surface/hairline chung, khoảng cách lớp bằng whitespace.
- `.analysis-flow`: mobile một cột; từ tablet hai cột; desktop bốn cột.
- `.analysis-flow [data-analysis-gap]`: nhãn chữ/số, không dùng màu làm kênh duy nhất.
- `.analysis-matrix-scroll`: `overflow-x:auto; max-width:100%`; page root không tràn.
- Button/select ở viewport `<=720px`: `min-height:44px`.
- Xóa CSS `.vmp-mo-sau` không còn dùng; không chạm CSS Vòng năm/Vali/KPI.

- [ ] **Step 3: Mở rộng E2E responsive**

Ở viewport `390×844`, xác nhận document overflow `<=1`, bốn stage xếp dọc, các control studio nhìn thấy cao tối thiểu `43.5px`, và vùng bảng có thể rộng hơn container mà không làm tràn document.

- [ ] **Step 4: Chạy gate hẹp cuối**

```powershell
node --import tsx --test tests/unit/overview-analysis-studio.test.mjs tests/unit/overview-vali-brief.test.mjs tests/unit/vong-nam-calendar.test.mjs
node tests/e2e/overview-executive-dashboard.mjs
npm run typecheck
npm run build
git diff --check -- src/App.tsx src/components/dashboard/CompletionDashboard.tsx src/components/dashboard/MaTranTienDo.tsx src/features/overview/analysisStudioModel.ts src/features/overview/overview-executive.css src/index.css tests/unit/overview-analysis-studio.test.mjs tests/e2e/overview-executive-dashboard.mjs
```

Expected: unit, E2E, typecheck, build và diff-check đều exit 0. Nếu build chuẩn vẫn bị ACL `.env`, ghi nguyên output và chạy fallback Vite programmatic với `envDir`/`outDir` tạm sạch như runbook cục bộ; không coi fallback là bằng chứng build chuẩn đã đạt.

- [ ] **Step 5: Đối chiếu chín tiêu chí chấp nhận trong spec**

Ghi rõ tiêu chí nào được chứng minh bằng unit, E2E, typecheck/build và tiêu chí nào còn rủi ro thị giác; không chạy broad E2E ngoài Overview.

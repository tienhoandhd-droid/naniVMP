# Alerts Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nâng màn Cảnh báo & ưu tiên thành trung tâm kết hợp giữa hàng đợi hành động và góc nhìn quản lý, chỉ dùng dữ liệu hiện có.

**Architecture:** Tách phép dựng hàng đợi, loại trùng và thống kê điểm nghẽn sang một model thuần để kiểm thử độc lập. `AlertsPage` tiếp tục sở hữu bộ lọc và hộp chi tiết, nhưng dùng model mới để render một hero hành động, bốn tín hiệu và khối quản lý responsive.

**Tech Stack:** React 18, TypeScript, CSS thuần theo token Lotus, Node test runner, Puppeteer E2E.

## Global Constraints

- Không gọi RPC mới, không ghi Supabase và không thay đổi quyền.
- Không tự gửi email; chỉ tạo liên kết `mailto:` khi có email người phụ trách.
- Không sửa công thức RPN hoặc thiết kế Ma trận QRM.
- Desktop không tràn ngang; mobile giữ mục tiêu bấm tối thiểu 44 px.

---

### Task 1: Model hàng đợi và điểm nghẽn

**Files:**
- Create: `src/features/monitoring/alertsCommandModel.ts`
- Create: `tests/unit/alerts-command-model.test.mjs`

**Interfaces:**
- Consumes: `AlertRow` chuẩn hoá gồm `a`, `kind`, `dleft`, `date`, `stage`; `qrmRpn(Activity)` và `qrmLevel(number)`.
- Produces: `buildAlertsCommandModel(rows, limit)` trả `{ queue, totalUnique, overdueRate, highRiskRate, unassignedCount, hotspots }`.

- [ ] **Step 1: Viết kiểm thử thất bại cho loại trùng và xếp hàng đợi**

```js
const model = buildAlertsCommandModel([
  row("TB-1", "risk", -2, 18),
  row("TB-1", "over", -2, 18),
  row("TB-2", "soon", 3, 27),
  row("TB-3", "over", -9, 27),
], 5);
assert.deepEqual(model.queue.map((item) => item.a.id), ["TB-3", "TB-2", "TB-1"]);
assert.equal(model.queue.filter((item) => item.a.id === "TB-1").length, 1);
```

- [ ] **Step 2: Chạy test và xác nhận thất bại vì module chưa tồn tại**

Run: `node --import tsx --test tests/unit/alerts-command-model.test.mjs`

Expected: FAIL với `ERR_MODULE_NOT_FOUND` cho `alertsCommandModel.ts`.

- [ ] **Step 3: Cài đặt model thuần**

```ts
export function buildAlertsCommandModel(rows: readonly AlertRow[], limit = 5): AlertsCommandModel {
  const urgency = { over: 0, risk: 1, soon: 2, requal: 3 } as const;
  const unique = new Map<string, AlertRow>();
  for (const row of rows) {
    const key = String(row.a.id || row.a.code);
    const current = unique.get(key);
    if (!current || urgency[row.kind] < urgency[current.kind]) unique.set(key, row);
  }
  const ordered = [...unique.values()].sort((left, right) =>
    qrmRpn(right.a) - qrmRpn(left.a)
    || left.dleft - right.dleft
    || String(left.a.id).localeCompare(String(right.a.id), "vi"));
  return summarizeAlerts(ordered, limit);
}
```

- [ ] **Step 4: Bổ sung kiểm thử thống kê bộ phận và người phụ trách**

```js
assert.deepEqual(model.hotspots.map((item) => item.department), ["qa", "xsx"]);
assert.equal(model.unassignedCount, 1);
assert.equal(model.overdueRate, 50);
assert.equal(model.highRiskRate, 75);
```

- [ ] **Step 5: Chạy test model và xác nhận đạt**

Run: `node --import tsx --test tests/unit/alerts-command-model.test.mjs`

Expected: PASS toàn bộ test trong file.

### Task 2: Giao diện bàn điều phối kết hợp

**Files:**
- Modify: `src/pages/AlertsPage.tsx`
- Modify: `src/features/monitoring/monitoring.css`
- Modify: `tests/e2e/monitoring-journey.mjs`

**Interfaces:**
- Consumes: `buildAlertsCommandModel([...byKind.over, ...byKind.risk, ...byKind.soon, ...byKind.requal], 5)`.
- Produces: `.alerts-command`, `.alerts-command__hero`, `.alerts-command__queue`, bốn `.alerts-priority`, và `.alerts-management`.

- [ ] **Step 1: Sửa E2E để mô tả giao diện mới và chạy xác nhận thất bại**

```js
assert.equal(alerts.primaryCount, 4);
assert.equal(alerts.commandHeroCount, 1);
assert.ok(alerts.commandQueueCount >= 1 && alerts.commandQueueCount <= 4);
assert.equal(alerts.managementCount, 1);
assert.equal(alerts.desktopHorizontalOverflow, 0);
```

Run: `node tests/e2e/monitoring-journey.mjs`

Expected: FAIL vì các selector `.alerts-command__hero` và `.alerts-management` chưa tồn tại.

- [ ] **Step 2: Render hero và bốn việc kế tiếp**

```tsx
const command = useMemo(
  () => buildAlertsCommandModel([
    ...byKind.over, ...byKind.risk, ...byKind.soon, ...byKind.requal,
  ], 5),
  [byKind],
);
const [topAlert, ...nextAlerts] = command.queue;
```

Hero hiển thị mã, tên, mốc, RPN, số ngày trễ/còn lại, người phụ trách, nút `Mở chi tiết` và liên kết `Nhắc qua email` khi `find(owner)?.email` tồn tại. Bốn dòng tiếp theo dùng `button` để mở cùng hộp chi tiết.

- [ ] **Step 3: Hợp nhất tái thẩm định vào dải bốn tín hiệu**

```tsx
const priorityCards = [
  { id: "over", label: "Xử lý ngay" },
  { id: "soon", label: "Sắp tới hạn" },
  { id: "risk", label: "Rủi ro cao" },
  { id: "requal", label: "Tái thẩm định" },
] as const;
```

Xoá nút tái thẩm định tách rời để tránh lặp và giữ `aria-pressed` cho cả bốn tín hiệu.

- [ ] **Step 4: Render góc nhìn quản lý và thu gọn AI**

```tsx
<section className="alerts-management" aria-labelledby="alerts-management-title">
  <div className="alerts-management__metrics">...</div>
  <div className="alerts-management__hotspots">
    {command.hotspots.slice(0, 5).map((item) => (
      <div key={item.department} className="alerts-hotspot">
        <span>{departmentLabel(item.department)}</span>
        <i style={{ "--alerts-hotspot-pct": `${item.share}%` } as CSSProperties} />
        <strong>{item.count}</strong>
      </div>
    ))}
  </div>
  <details className="alerts-ai-panel">...</details>
</section>
```

- [ ] **Step 5: Thêm CSS responsive và trạng thái focus**

```css
.alerts-command { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(320px, .75fr); }
.alerts-command__hero, .alerts-command__queue, .alerts-management { min-width: 0; }
.alerts-command button:focus-visible, .alerts-command a:focus-visible { outline: 3px solid var(--lp-focus); }
@media (max-width: 860px) { .alerts-command { grid-template-columns: 1fr; } }
@media (max-width: 719px) { .alerts-command button, .alerts-command a { min-height: 44px; } }
```

- [ ] **Step 6: Chạy E2E và xác nhận hành vi desktop/mobile đạt**

Run: `node tests/e2e/monitoring-journey.mjs`

Expected: PASS; desktop không tràn ngang, mobile có đủ bốn tín hiệu và bàn điều phối.

### Task 3: Cổng xác minh cuối

**Files:**
- Verify: `src/features/monitoring/alertsCommandModel.ts`
- Verify: `src/pages/AlertsPage.tsx`
- Verify: `src/features/monitoring/monitoring.css`
- Verify: `tests/unit/alerts-command-model.test.mjs`
- Verify: `tests/e2e/monitoring-journey.mjs`

**Interfaces:**
- Consumes: toàn bộ thay đổi của Task 1 và Task 2.
- Produces: bằng chứng kiểm thử để bàn giao.

- [ ] **Step 1: Chạy unit test mục cảnh báo**

Run: `node --import tsx --test tests/unit/alerts-command-model.test.mjs tests/unit/monitoring-journey.test.mjs`

Expected: PASS, không có test thất bại.

- [ ] **Step 2: Chạy typecheck**

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 3: Chạy production build**

Run: `npm run build`

Expected: exit code 0; nếu Windows tiếp tục chặn `.env`, chạy Vite API với `envDir` tạm để chỉ xác minh biên dịch và báo rõ giới hạn môi trường.

- [ ] **Step 4: Kiểm tra Chrome local với dữ liệu thật**

Mở `http://127.0.0.1:5199/#v=alerts`, xác nhận hero, hàng đợi, bốn tín hiệu, danh sách và góc nhìn quản lý hiển thị; không có lỗi console hoặc tràn ngang.

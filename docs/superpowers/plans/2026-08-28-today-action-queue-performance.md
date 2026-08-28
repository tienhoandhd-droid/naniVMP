# Today Action Queue and Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biến “Việc hôm nay” thành hàng đợi hành động đa nguyên nhân, đúng định danh/quyền và mở nhanh trên danh sách 461 hạng mục.

**Architecture:** Giữ RPC dashboard hiện tại làm nguồn dữ liệu đọc, đưa toàn bộ phân loại/xếp hạng vào một model thuần `buildTodayActionModel`, rồi để `TodayCommandCenter` chỉ lo tải quyền hành động và trình bày. Shell chịu trách nhiệm phạm vi bộ phận/khu vực, định danh `personId`, refresh dữ liệu và deep link; màn Tiến độ tiếp tục xác minh lại quyền trước khi focus.

**Tech Stack:** React 18, TypeScript, Vite 6, Node test runner qua `tsx`, Puppeteer E2E, Supabase client hiện có.

## Global Constraints

- Dùng Node `/home/admin1/.nvm/versions/node/v24.18.0/bin/node`; mọi lệnh npm chạy với PATH Node 24.
- Không thêm migration, RPC hoặc thay đổi dữ liệu production.
- Không đổi luật RLS/quyền server hay tự suy quyền từ vai frontend.
- Today không áp bộ lọc kỳ `target`; chỉ giữ bộ phận, khu vực và “Việc của tôi” theo person ID.
- Mọi màn dùng “Việc của tôi” phải đối chiếu owner/support person ID; không màn nào fallback sang tên hiển thị.
- `validationCode` là khóa duy nhất nối Today, quyền tiến độ và deep link.
- Một hạng mục xuất hiện đúng một nhóm nhưng giữ mọi reason; KPI chất lượng dữ liệu vẫn đếm reason dữ liệu ở mọi nhóm.
- Dữ liệu đọc vẫn hiện khi quyền cập nhật đang tải/lỗi; mọi mutation CTA fail-closed.
- Không phân trang, cắt dòng hoặc ảo hóa Today; giữ đủ dòng trong DOM.
- `focus` và `visibilitychange` trong cùng lần quay lại chỉ tạo một refresh; response quyền cũ không được ghi đè response mới.
- Không deploy, push hoặc merge.

---

### Task 1: Pure Today action model

**Files:**
- Modify: `src/features/today/todayModel.ts`
- Modify: `tests/unit/today-model.test.mjs`

**Interfaces:**
- Consumes: `Activity`, `EditableProgressRight`, `currentPersonId`, `now`.
- Produces: `buildTodayActionModel(activities, options): TodayActionModel`, `isTodayActivityMine(activity, personId)`, `TodayActionRow`, `TodayReason`, `ProgressDeepLink`.

- [ ] **Step 1: Replace old expectations with failing multi-reason and priority tests**

Add literal fixtures asserting:

```js
const model = buildTodayActionModel([{
  id: "legacy-id", validationCode: "V-MULTI", st: "prog", state: "active",
  dlProtocol: "2026-08-01", ownerPersonId: null, score: 9,
}], {
  now: HOM_NAY,
  rights: new Map([["V-MULTI", {
    validationCode: "V-MULTI",
    editableFields: ["actual_protocol_date"],
    reason: "Được phân công",
  }]]),
  rightsStatus: "ready",
});
assert.equal(model.sections.overdue[0].validationCode, "V-MULTI");
assert.deepEqual(model.sections.overdue[0].reasons.map((reason) => reason.kind), [
  "overdue", "missing_owner",
]);
assert.equal(model.kpis.dataQuality, 1);
assert.equal(model.sections.incomplete.length, 0);
```

Also cover due-today separately from due-7d; first unfinished `blockingStage`; later dated `deadlineStage`; active/no-deadline → `missing_schedule`; exclusion of done-complete/cancelled/not_applicable; priority urgency → score → editability → days → Vietnamese code; person-ID-only ownership including `_raw.owner_person_id`/`support_person_id`; and validationCode lookup when `activity.id` differs.

- [ ] **Step 2: Run the model test and confirm RED**

Run:

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:/home/admin1/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  node --import tsx --test tests/unit/today-model.test.mjs
```

Expected: FAIL because `buildTodayActionModel`, structured reasons and four sections do not exist.

- [ ] **Step 3: Implement the minimum pure model**

Use these public shapes exactly:

```ts
export type TodayReasonKind =
  | "overdue" | "due_today" | "due_7d"
  | "missing_owner" | "missing_actual_completion" | "missing_schedule";

export type TodaySection = "overdue" | "today" | "upcoming" | "incomplete";
export type TodayRightsStatus = "loading" | "ready" | "error";

export interface TodayReason {
  kind: TodayReasonKind;
  label: string;
  stage?: string;
  daysRemaining?: number;
}

export interface TodayActionRow {
  validationCode: string;
  title: string;
  department: string;
  ownerName: string;
  criticality: string;
  criticalityScore: number | null;
  blockingStage: string;
  deadlineStage: string | null;
  daysRemaining: number | null;
  reasons: TodayReason[];
  section: TodaySection;
  canEditProgress: boolean;
  editableFields: readonly EditableTimelineField[];
  permissionReason: string;
}

export interface TodayActionModel {
  rows: TodayActionRow[];
  sections: Record<TodaySection, TodayActionRow[]>;
  kpis: { overdue: number; today: number; upcoming: number; dataQuality: number };
  nextAction: TodayActionRow | null;
}

export function buildTodayActionModel(
  activities: readonly Activity[],
  options: {
    now: Date;
    rights: ReadonlyMap<string, EditableProgressRight>;
    rightsStatus: TodayRightsStatus;
  },
): TodayActionModel;

export function isTodayActivityMine(activity: Activity, personId: string): boolean;
```

Normalize Bangkok dates once, derive `blockingStage` from the first unfinished stage, derive `deadlineStage` from the first unfinished dated stage at or after it, accumulate all reasons, assign exactly one section by deadline urgency, then sort by the approved tuple. `ProgressDeepLink` becomes `{ validationCode, source: "today", reasons: TodayReasonKind[] }`.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run the command from Step 2. Expected: all `today-model` tests pass with pristine output.

- [ ] **Step 5: Commit**

```bash
git add src/features/today/todayModel.ts tests/unit/today-model.test.mjs
git commit -m "feat(today): build actionable multi-reason queue"
```

---

### Task 2: Canonical person identity and Today scope

**Files:**
- Modify: `src/types/domain.ts`
- Modify: `src/lib/supabaseClient.ts`
- Create: `src/features/today/todayScope.ts`
- Create: `tests/unit/today-scope.test.mjs`
- Modify: `tests/e2e/gia-lap-supabase.mjs`

**Interfaces:**
- Consumes: active `vmp_performers` row already loaded during profile lookup.
- Produces: `AppUser.personId?: string | null`, `filterTodayScope(activities, options)`.

- [ ] **Step 1: Write failing scope tests**

```js
assert.deepEqual(filterTodayScope(rows, {
  areas: [], departments: [], onlyMine: true, currentPersonId: "person-a",
}).map((row) => row.validationCode), ["OWNED", "SUPPORTED"]);

assert.deepEqual(filterTodayScope(rows, {
  areas: [], departments: [], onlyMine: false, currentPersonId: null,
}).map((row) => row.validationCode), ["OWNED", "SUPPORTED", "OTHER", "NO-TARGET"]);
```

Fixtures must prove: same display name with another person ID does not match; `_raw` IDs do match; missing `target` is not removed; area and department still filter; input is not mutated.

- [ ] **Step 2: Run focused scope test and confirm RED**

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:/home/admin1/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  node --import tsx --test tests/unit/today-scope.test.mjs
```

Expected: FAIL because `todayScope.ts` does not exist.

- [ ] **Step 3: Implement identity and scope**

Add to `AppUser`:

```ts
/** Khóa người chính tắc từ vmp_performers.person_id. */
personId?: string | null;
```

During the existing active performer lookup, select and return both `person_id` and `access_class`; trim non-empty strings, otherwise use null. Implement:

```ts
export function filterTodayScope(
  activities: readonly Activity[],
  options: {
    areas: readonly string[];
    departments: readonly string[];
    onlyMine: boolean;
    currentPersonId: string | null;
  },
): Activity[];
```

Area and department matching must mirror the shell’s current semantics. When `onlyMine` is false, missing person linkage does not filter. When it is true, compare only canonical owner/support person IDs.

Update the E2E Supabase session performer fixture so its `person_id` is returned through the same profile lookup path used by the app.

- [ ] **Step 4: Run focused test and typecheck**

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:/home/admin1/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  node --import tsx --test tests/unit/today-scope.test.mjs
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:/home/admin1/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  npm run typecheck
```

Expected: focused tests and typecheck pass.

- [ ] **Step 5: Commit**

```bash
git add src/types/domain.ts src/lib/supabaseClient.ts src/features/today/todayScope.ts tests/unit/today-scope.test.mjs tests/e2e/gia-lap-supabase.mjs
git commit -m "fix(today): scope personal work by person id"
```

---

### Task 3: Rights-aware Today UI and responsive details

**Files:**
- Modify: `src/features/today/TodayCommandCenter.tsx`
- Modify: `src/features/today/today.css`
- Create: `tests/unit/today-command-center.test.mjs`

**Interfaces:**
- Consumes: `buildTodayActionModel`, `fetchMyEditableProgressRights`, `indexEditableProgressRights`, `createProgressRightsGenerationGate`, `createVisibleRefreshController`.
- Produces: default `TodayCommandCenter`; exported `TodayCommandCenterContent` for static component tests.

- [ ] **Step 1: Write failing component tests against observable markup**

Render `TodayCommandCenterContent` with a hand-built model and assert:

```js
assert.match(html, /Quá hạn/);
assert.match(html, /Chưa phân công QA/);
assert.match(html, /Đang chờ Đề cương/);
assert.match(html, /mốc Thẩm định · trễ 4 ngày/);
assert.match(editableHtml, /Cập nhật tiến độ/);
assert.match(readOnlyHtml, /Xem chi tiết/);
assert.match(loadingHtml, /Đang kiểm tra quyền/);
assert.match(errorHtml, /Chưa xác minh được quyền cập nhật/);
```

Also assert four KPI labels, the “Làm trước tiên” explanation, all reason badges, a retry-rights button only in rights-error state, and an inline details region connected to every row button via `aria-controls`.

- [ ] **Step 2: Run component test and confirm RED**

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:/home/admin1/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  node --import tsx --test tests/unit/today-command-center.test.mjs
```

Expected: FAIL because the content export, four-KPI UI, multi-reason badges and rights states do not exist.

- [ ] **Step 3: Implement rights loading and presentation**

`TodayCommandCenter` owns a generation-gated rights state:

```ts
type RightsState =
  | { status: "loading"; rights: ReadonlyMap<string, EditableProgressRight>; error: "" }
  | { status: "ready"; rights: ReadonlyMap<string, EditableProgressRight>; error: "" }
  | { status: "error"; rights: ReadonlyMap<string, EditableProgressRight>; error: string };
```

Initial and retry loads replace old rights with an empty map. Focus/visibility refresh goes through one `createVisibleRefreshController({ coalesceMs: 1000 })`; cleanup invalidates the generation. Model construction uses `useMemo` with `acts`, the rights state/map and one stable Bangkok day key, not selected-row state.

Present four groups and KPIs. Every row shows code, full title, reasons, blocking/deadline text, owner, department, criticality and the correct CTA. “Xem chi tiết” only expands local information. Under 1600 px selected details render inline; at 1600 px and above the supporting pane is visible. Add:

```css
.hn-muc { content-visibility: auto; contain-intrinsic-size: auto 44px; }
@media (max-width: 768px) {
  .hn-muc { contain-intrinsic-size: auto 124px; }
}
```

Data error remains a full `StateBoundary`; rights error is a warning and never removes readable rows. The top copy must say that the queue contains overdue work, today, the next seven days and records to complete. When area/department filters create an empty result, render the active scope and one `Xóa bộ lọc` action through new props `hasScopeFilters` and `onClearScope`.

- [ ] **Step 4: Run component/model/refresh tests and confirm GREEN**

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:/home/admin1/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  node --import tsx --test tests/unit/today-command-center.test.mjs tests/unit/today-model.test.mjs tests/unit/visible-refresh.test.mjs
```

Expected: all focused tests pass with pristine output.

- [ ] **Step 5: Commit**

```bash
git add src/features/today/TodayCommandCenter.tsx src/features/today/today.css tests/unit/today-command-center.test.mjs
git commit -m "feat(today): add rights-aware action queue UI"
```

---

### Task 4: Shell refresh, filters, static loading and deep-link contract

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/hooks/index.ts`
- Modify: `src/pages/UpdatePage.tsx`
- Create: `src/features/progress/progressDeepLink.ts`
- Create: `tests/unit/progress-deep-link.test.mjs`

**Interfaces:**
- Consumes: `filterTodayScope`, `createVisibleRefreshController`, `ProgressDeepLink`.
- Produces: shell route behavior and `resolveProgressDeepLink(rights, link)`.

- [ ] **Step 1: Write failing deep-link resolver tests**

```js
assert.deepEqual(resolveProgressDeepLink(rights, {
  validationCode: "V-001", source: "today", reasons: ["overdue", "missing_owner"],
}), { status: "allowed", validationCode: "V-001", source: "today", reasons: ["overdue", "missing_owner"] });

assert.deepEqual(resolveProgressDeepLink(new Map(), {
  validationCode: "V-001", source: "today", reasons: ["overdue"],
}), { status: "revoked", validationCode: "V-001" });
```

- [ ] **Step 2: Run resolver test and confirm RED**

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:/home/admin1/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  node --import tsx --test tests/unit/progress-deep-link.test.mjs
```

Expected: FAIL because the resolver does not exist.

- [ ] **Step 3: Implement shell and refresh integration**

In `App.tsx`:

- statically import `TodayCommandCenter`; remove its lazy declaration;
- compute `todayActs = filterTodayScope(acts, { areas: areaSel, departments: deptSel, onlyMine, currentPersonId: user.personId ?? null })`;
- keep existing `filteredActs` for other screens, including period behavior;
- replace the existing name-based `laViecCuaToi` predicate used by other screens with the same canonical owner/support person-ID predicate;
- pass Today `todayActs` and a scope label that omits period;
- pass `hasScopeFilters={deptSel.length > 0 || areaSel.length > 0}` and an `onClearScope` callback that clears only department/area filters;
- disable the period inputs on Today and display “Việc hôm nay tự dùng cửa sổ 7 ngày”;
- disable “Việc của tôi” when `user.personId` is absent and show the linkage explanation;
- if a stored URL has `onlyMine=true` but no person linkage, normalize it to false;
- wire shell focus/visibility refresh through `createVisibleRefreshController` instead of calling `silentRefresh` twice;
- preserve the full `ProgressDeepLink` in state when navigating.

In `hooks/index.ts`, every current-request `silentRefresh` failure must call `clearProtectedData()` and set `conn.status="err"` with a retryable message; stale requests must not mutate state.

In `UpdatePage.tsx`, coalesce rights focus/visibility refresh, resolve a pending Today link after rights become ready, clear all local filters on allowed focus, and render an explicit alert such as `Quyền cập nhật V-001 đã thay đổi; hạng mục không được mở.` on revoked focus. Consume the pending link after either outcome.

- [ ] **Step 4: Run focused tests, typecheck and build**

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:/home/admin1/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  node --import tsx --test tests/unit/progress-deep-link.test.mjs tests/unit/visible-refresh.test.mjs
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:/home/admin1/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  npm run typecheck
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:/home/admin1/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  npm run build
```

Expected: focused tests, typecheck and production build pass; `dist/assets` has no `TodayCommandCenter-*` chunk.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/hooks/index.ts src/pages/UpdatePage.tsx src/features/progress/progressDeepLink.ts tests/unit/progress-deep-link.test.mjs
git commit -m "fix(today): integrate canonical scope and safe refresh"
```

---

### Task 5: End-to-end action queue and performance regression

**Files:**
- Modify: `tests/e2e/today-load-performance.mjs`
- Modify: `tests/e2e/luong-gia-lap.mjs`

**Interfaces:**
- Consumes: the completed Today UI and strict Supabase fixture.
- Produces: browser-level evidence for performance, data error, action rights and deep link.

- [ ] **Step 1: Extend E2E fixtures and assertions before any further production change**

The strict Today test must cover:

```js
check(renderState.rows === 461, "phải dựng đủ 461 hạng mục", String(renderState.rows));
check(renderState.contentVisibility === "auto", "danh sách dài phải bỏ qua render ngoài viewport", renderState.contentVisibility);
check(/124px/.test(renderState.intrinsicSize), "mobile phải giữ kích thước nội tại ổn định", renderState.intrinsicSize);
check(renderState.chunks.length === 0, "Việc hôm nay không được phụ thuộc chunk tải muộn", renderState.chunks[0] || "");
check(callsAfterReturn === 1, "focus và visibilitychange chỉ xác minh mode một lần", `${callsAfterReturn} lần`);
```

Add a dedicated multi-reason fixture with an editable right; assert its overdue group, both badges, blocking/deadline wording and “Cập nhật tiến độ”. Add a read-only fixture and assert “Xem chi tiết”. After clicking the editable CTA, assert Progress focuses the exact `validationCode`; then revoke its right, repeat, and assert the explicit revocation message. Keep strict-network assertion at zero external calls.

- [ ] **Step 2: Run the existing/extended E2E and record RED if integration gaps remain**

Use the project’s preview wrapper so build and server lifecycle are isolated:

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:/home/admin1/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  bash scripts/with-preview.sh -- node tests/e2e/today-load-performance.mjs
```

Expected before final fixes: any remaining integration gap fails with a named user-visible assertion, not a timeout-only failure.

- [ ] **Step 3: Make only the minimum fixture or integration corrections needed for GREEN**

Do not relax the 461-row, 2.5-second, one-refresh, zero-external-network, explicit-error or exact-validationCode assertions. If a production defect appears, add or preserve the narrowest unit reproduction before correcting it.

- [ ] **Step 4: Run the full approved regression set**

```bash
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:/home/admin1/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin npm run typecheck
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:/home/admin1/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin npm run test:unit
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:/home/admin1/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin npm run build
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:/home/admin1/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin bash scripts/with-preview.sh -- node tests/e2e/today-load-performance.mjs
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:/home/admin1/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin bash scripts/with-preview.sh -- node tests/e2e/luong-gia-lap.mjs
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:/home/admin1/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin bash scripts/with-preview.sh -- npm run e2e:progress-rights
env PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:/home/admin1/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin bash scripts/with-preview.sh -- npm run a11y
```

Expected: every command exits 0, no unit failures, production build succeeds, Today reports 461 rows and one return refresh, related mock/progress-rights/a11y flows pass.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/today-load-performance.mjs tests/e2e/luong-gia-lap.mjs
git commit -m "test(today): cover action queue and load performance"
```

---

## Rollback and review checkpoints

- Each task is a separate frontend/test commit; rollback can revert Task 4 integration first, then Tasks 3–1 without database cleanup.
- After every task, generate a diff package from the task base SHA and require an independent spec-and-quality review before the next task.
- After Task 5, run one whole-branch review against this plan and the approved design, then rerun the complete verification commands after any review fix.

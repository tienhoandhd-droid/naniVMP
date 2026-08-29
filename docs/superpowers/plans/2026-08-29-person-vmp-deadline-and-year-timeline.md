# Person VMP Deadline, Year Timeline, and Team Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đồng bộ Today/Overview theo mốc VMP, thu gọn Timeline năm thành 12 tháng có drill-down, và hiển thị tổng tiến độ nhóm an toàn cho thành viên thường.

**Architecture:** Một helper thuần `vmpDeadlineModel` là nguồn chân lý duy nhất cho mốc VMP và trạng thái đến hạn. Timeline dùng chính helper này để gom 12 tháng và chỉ dựng bảng khi ở chế độ tháng/quý. Tổng tiến độ nhóm đi qua một RPC security-definer chỉ trả aggregate, không mở rộng dashboard chi tiết; client render aggregate nhóm cạnh số cá nhân cho vai trò thường.

**Tech Stack:** React 18, TypeScript, Node test runner + tsx, Puppeteer E2E, Supabase/PostgreSQL 17, GitHub Actions/Pages.

## Global Constraints

- Chỉ dùng mốc VMP thật ở `dlVmp`, `deadline_vmp` hoặc `dl_vmp`; không dùng `target` nếu nó có thể là mốc báo cáo.
- Quá hạn VMP = bản ghi active, VMP chưa hoàn thành, mốc VMP nhỏ hơn ngày Bangkok hiện tại.
- Canonical person ID ở owner/support là nguồn chân lý; tên hiển thị không quyết định phạm vi.
- Thành viên thường chỉ nhận aggregate nhóm `total/completed/rate`; không nhận mã, tên hạng mục hoặc người phụ trách của người khác.
- Timeline năm chỉ có tổng hợp 12 tháng; bảng chi tiết và các tab mốc chỉ render ở month/quarter.
- Không thay đổi Source, Timeline 3D, bảng dữ liệu nghiệp vụ hoặc quyền xem chi tiết hiện hành.
- RED phải được quan sát trước GREEN; mọi success claim phải có verification mới.
- Database và file dùng chung làm tuần tự. Chỉ song song hóa review hoặc test độc lập.
- Rollback: revert commit tính năng và migration chỉ tạo RPC; không có dữ liệu nghiệp vụ cần phục hồi.

---

### Task 1: Canonical VMP deadline model and aligned personal scope

**Files:**
- Create: `src/lib/vmpDeadlineModel.ts`
- Create: `tests/unit/vmp-deadline-model.test.mjs`
- Modify: `src/features/today/todayModel.ts`
- Modify: `src/App.tsx`
- Modify: `tests/unit/today-model.test.mjs`
- Modify: `tests/unit/person-progress-scope.test.mjs`
- Modify: `tests/e2e/today-personal-scope.mjs`

**Interfaces:**
- Produces: `vmpDeadlineDate(activity): string | null`, `isVmpComplete(activity): boolean`, `classifyVmpDeadline(activity, now, soonDays): VmpDeadlineState`.
- `VmpDeadlineState.kind` is exactly `"done" | "missing" | "overdue" | "today" | "soon" | "future"`; it includes `date: string | null` and `daysRemaining: number | null`.
- `todayModel` consumes the helper with `soonDays=7`; `Overview` consumes it with `soonDays=30` but uses the same `overdue` branch.

- [ ] **Step 1: Write the failing pure-model tests**

  Add literal fixtures proving:

  ```js
  assert.deepEqual(classifyVmpDeadline({
    state: "active", st: "prog", dlProtocol: "2026-01-01",
    _raw: { dl_vmp: "2026-09-10", tt_vmp: "not_started" },
  }, new Date("2026-08-29T12:00:00+07:00"), 7), {
    kind: "future", date: "2026-09-10", daysRemaining: 12,
  });

  assert.equal(classifyVmpDeadline({
    state: "active", st: "over", target: "2026-08-01",
    _raw: { dl_bao_cao: "2026-08-01", tt_vmp: "not_started" },
  }, new Date("2026-08-29T12:00:00+07:00"), 7).kind, "missing");
  ```

  Also cover `dlVmp`, `deadline_vmp`, raw `dl_vmp`, completed VMP, inactive rows, Bangkok date boundary, and an overdue literal.

- [ ] **Step 2: Run RED for the missing module**

  Run: `node --import tsx --test tests/unit/vmp-deadline-model.test.mjs`

  Expected: FAIL because `src/lib/vmpDeadlineModel.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure model**

  Normalize only ISO `YYYY-MM-DD` values from the approved keys. Completion accepts `activity.st === "done"`, a VMP actual date, `vmp_done === true`, or a completed `tt_vmp` value via the existing `wlIsDone` semantics. Convert `now` to the Bangkok calendar day before comparing.

- [ ] **Step 4: Run the pure-model tests GREEN**

  Run: `node --import tsx --test tests/unit/vmp-deadline-model.test.mjs`

  Expected: all tests PASS.

- [ ] **Step 5: Write RED integration tests for Today and Overview**

  Update Today unit/E2E fixtures so a stale protocol deadline with future `dl_vmp` is not overdue, while an overdue `dl_vmp` is overdue. In the Admin/QA Manager E2E scenario select the same canonical person, capture the Today overdue KPI, switch to Overview, and assert the Overview `Quá hạn` tile has the same count even when a remembered non-`all` period exists.

- [ ] **Step 6: Run the integration tests RED**

  Run:

  ```bash
  node --import tsx --test tests/unit/today-model.test.mjs tests/unit/person-progress-scope.test.mjs
  bash scripts/with-preview.sh -- npm run e2e:today-scope
  ```

  Expected: at least the VMP-only and remembered-period assertions FAIL against current code.

- [ ] **Step 7: Align Today and Overview with the shared model**

  In `todayModel.ts`, retain the blocking-stage label for context but derive deadline section/reason only from `classifyVmpDeadline(activity, now, 7)`; a missing VMP deadline becomes the existing incomplete/missing-schedule path. In `App.tsx`, build the selected-person base from `acts + area + department + canonical person` without the global period and reuse it for both Today and personal Overview. Keep team Overview on `filteredActs`. Replace Overview overdue/soon/urgent-list classification with the shared VMP helper.

- [ ] **Step 8: Run Task 1 GREEN and commit**

  Run:

  ```bash
  node --import tsx --test tests/unit/vmp-deadline-model.test.mjs tests/unit/today-model.test.mjs tests/unit/person-progress-scope.test.mjs
  bash scripts/with-preview.sh -- npm run e2e:today-scope
  npm run typecheck
  git diff --check
  ```

  Commit: `fix(scope): align personal overdue by VMP deadline`

---

### Task 2: Year Timeline summary with month drill-down

**Files:**
- Modify: `src/pages/TimelinePage.tsx`
- Create: `src/features/timeline/timelineYearModel.ts`
- Modify: `src/index.css` only if the existing rail needs an explicit action label layout
- Create: `tests/unit/timeline-year-drilldown.test.mjs`
- Modify: `tests/e2e/luong-gia-lap.mjs`

**Interfaces:**
- Consumes `vmpDeadlineDate(activity)` from Task 1.
- Produces `buildVmpMonthBands(items, year)` from `timelineYearModel.ts` as a pure exported helper returning exactly 12 entries with `month`, `label`, `count`, `done`, `overdue`, and `rate`.
- Existing `focusBand` remains the only transition: selected band → `focusMonth`, `view="month"`, `scope="period"`.

- [ ] **Step 1: Write RED month-band tests**

  Use hand-derived fixtures for January, December, an outside-year VMP date, a missing VMP date with only `target`, and a completed row. Assert exactly 12 bands and literal January/December counts; outside-year/missing rows contribute to none.

- [ ] **Step 2: Run RED**

  Run: `node --import tsx --test tests/unit/timeline-year-drilldown.test.mjs`

  Expected: FAIL because `buildVmpMonthBands` is missing.

- [ ] **Step 3: Implement the pure 12-month grouping**

  Use `vmpDeadlineDate`, `isVmpComplete`, and `classifyVmpDeadline`; never read `activity.target`. Keep labels `Tháng 1` through `Tháng 12`.

- [ ] **Step 4: Run unit GREEN**

  Run: `node --import tsx --test tests/unit/timeline-year-drilldown.test.mjs`

  Expected: PASS.

- [ ] **Step 5: Add RED E2E assertions for year/month rendering**

  In the existing Timeline scenario assert year mode has 12 month actions, no `[data-timeline-detail-board]`, and no stage tabs. Click a populated month action, then assert `view=month` behavior through the visible month selector, detailed board presence, and only the month fixture codes. Click `Năm` and assert detail is hidden again.

- [ ] **Step 6: Run E2E RED**

  Run: `bash scripts/with-preview.sh -- npm run e2e:gialap`

  Expected: the year-summary visibility assertions FAIL.

- [ ] **Step 7: Render rail-only in year and details only below year**

  Render `TimelineRangeRail` (backed by the pure bands) when `workspace === "timeline" && view === "year"`. Add an explicit `Mở tháng` label to enabled month actions. Wrap `TimelineFocusLayer`, `TimelineStageProgress`, tabs, `TimelineTableBoard`, and inspector in `view !== "year"`; mark the detail wrapper `data-timeline-detail-board`. Month and quarter behavior remain unchanged.

- [ ] **Step 8: Run Task 2 GREEN and commit**

  Run:

  ```bash
  node --import tsx --test tests/unit/timeline-year-drilldown.test.mjs tests/unit/timeline-summary-model.test.mjs tests/unit/timeline-filter-model.test.mjs
  bash scripts/with-preview.sh -- npm run e2e:gialap
  npm run typecheck
  git diff --check
  ```

  Commit: `feat(timeline): summarize year and open details by month`

---

### Task 3: Safe aggregate team progress for ordinary members

**Files:**
- Create: `supabase/migrations/20260829150000_team_overview_summary.sql`
- Create: `supabase/tests/team_overview_summary.sql`
- Create: `src/features/overview/teamOverviewSummary.ts`
- Create: `src/features/overview/useTeamOverviewSummary.ts`
- Create: `tests/unit/team-overview-summary.test.mjs`
- Create: `tests/unit/team-overview-sql-contract.test.mjs`
- Modify: `src/App.tsx`
- Modify: `tests/e2e/today-personal-scope.mjs`

**Interfaces:**
- SQL: `public.rpc_team_overview_summary(p_year integer default extract(year from now())::integer) returns jsonb`.
- Success payload: `{ ok: true, year: number, total: number, completed: number, rate: number, updated_at: string | null }` and no other business-data keys.
- Client: `decodeTeamOverviewSummary(input): TeamOverviewSummaryResult`; hook returns `{ status: "idle" | "loading" | "ready" | "error", data, error, retry }`.

- [ ] **Step 1: Write RED SQL/client contract tests**

  SQL contract must reject payload builders containing item code/name/owner arrays, require active-session and Overview-permission gates, require `SECURITY DEFINER`, pinned search path, authenticated/service execute only, active/non-missing/non-cancelled population, and `status_vmp='completed'` completion. Decoder tests accept only finite non-negative integer totals with `completed <= total` and an integer rate matching `round(completed*100/total)`; malformed payload fails closed.

- [ ] **Step 2: Run RED**

  Run:

  ```bash
  node --import tsx --test tests/unit/team-overview-summary.test.mjs tests/unit/team-overview-sql-contract.test.mjs
  ```

  Expected: FAIL because migration/client module do not exist.

- [ ] **Step 3: Implement the sealed aggregate RPC**

  For browser calls, gate inactive sessions with `vmp_session_denial()`, resolve `vmp_business_role(auth.uid())`, then require a `vmp_screen_permissions` row for `screen_id='overview'` with `can_view`. Permit `service_role` explicitly for deployment verification without resolving a user role. Aggregate `vmp_plan_items` for `p_year`, `is_active`, `not missing_from_sheet`, and active `item_state`; count completed by `status_vmp='completed'`. Return only the approved six fields. Revoke public/anon; grant authenticated/service_role. Add SQL harness cases for QA staff success, inactive denial, no-Overview denial, service-role verification, and exact key set.

- [ ] **Step 4: Implement decoder and hook**

  Call the RPC only for a non-privileged role that can view Overview. Use request-generation cancellation so stale responses cannot overwrite a role/session transition. Fail closed on malformed response or `{ok:false}`.

- [ ] **Step 5: Run SQL/client unit GREEN**

  Run:

  ```bash
  node --import tsx --test tests/unit/team-overview-summary.test.mjs tests/unit/team-overview-sql-contract.test.mjs
  npm run typecheck
  ```

  Expected: PASS.

- [ ] **Step 6: Write and observe RED UI E2E**

  Extend the QA staff fixture with `rpc_team_overview_summary={ok:true,year:2026,total:10,completed:4,rate:40,updated_at:...}`. Assert Overview shows `Tiến độ cả nhóm 40% (4/10)` and personal `0/2`, while no other-person code/name enters the DOM. Assert Admin/QA Manager do not call the aggregate RPC and retain the person selector.

  Run: `bash scripts/with-preview.sh -- npm run e2e:today-scope`

  Expected: team-summary assertions FAIL before UI wiring.

- [ ] **Step 7: Wire the comparison UI minimally**

  Add a compact comparison block above the ordinary-member Overview: one aggregate team tile and one personal tile derived from `tally(overviewActs)`. Keep the existing Overview content personal. Admin/QA Manager use existing team/person selector and do not render the comparison block.

- [ ] **Step 8: Run Task 3 GREEN and commit**

  Run:

  ```bash
  node --import tsx --test tests/unit/team-overview-summary.test.mjs tests/unit/team-overview-sql-contract.test.mjs
  bash scripts/with-preview.sh -- npm run e2e:today-scope
  npm run typecheck
  git diff --check
  ```

  Commit: `feat(overview): show safe team completion summary`

---

### Task 4: Cross-feature verification, independent review, and release

**Files:**
- Modify only files required by review findings.
- Update plan ledger/reports under the git-ignored SDD workspace, not tracked source.

**Interfaces:**
- Consumes all Task 1–3 commits.
- Produces a reviewed exact SHA deployed to Supabase (RPC) and GitHub Pages.

- [ ] **Step 1: Run the fast targeted gate**

  ```bash
  npm run typecheck
  node --import tsx --test tests/unit/vmp-deadline-model.test.mjs tests/unit/today-model.test.mjs tests/unit/person-progress-scope.test.mjs tests/unit/timeline-year-drilldown.test.mjs tests/unit/team-overview-summary.test.mjs tests/unit/team-overview-sql-contract.test.mjs
  bash scripts/with-preview.sh -- npm run e2e:today-scope
  ```

- [ ] **Step 2: Run Timeline E2E and production build in parallel after the targeted gate**

  Run separate processes for:

  ```bash
  bash scripts/with-preview.sh -- npm run e2e:gialap
  npm run build
  ```

- [ ] **Step 3: Run full unit and SQL evidence gates**

  ```bash
  npm run test:unit
  npm run test:db:source-access
  git diff --check
  ```

  If the live DB harness requires credentials unavailable locally, record that explicitly and rely on the sealed PostgreSQL evidence job only after its exact new contract is added; do not claim it ran.

- [ ] **Step 4: Independent final review**

  Review authorization boundary, payload non-disclosure, VMP-only deadline semantics, selected-person period isolation, Timeline year/month rendering, and rollback. Fix all Critical/Important findings, rerun covering tests, then get one scoped re-review.

- [ ] **Step 5: Deploy database migration**

  Resolve the exact linked Supabase project, perform preflight drift checks, apply only `20260829150000_team_overview_summary.sql`, and verify the RPC owner/ACL/key-set and a QA-staff aggregate call. Do not apply unrelated pending migrations.

- [ ] **Step 6: Push exact reviewed commit to feature branch and `main`**

  Confirm clean tracked status except user-owned `.superpowers/research/`, then push. Record SHA.

- [ ] **Step 7: Monitor GitHub Actions to completion**

  Require success for static-quality, SQL contract/evidence, E2E mock, production build, and deploy jobs for the exact SHA. Diagnose exact logs before any fix; never rerun blindly.

- [ ] **Step 8: Verify production**

  Verify GitHub deployment state is `success`, Pages returns HTTP 200 and the deployed bundle contains `Tiến độ cả nhóm` and `Mở tháng`. Verify the production RPC returns only aggregate keys. Mark complete only with fresh evidence.

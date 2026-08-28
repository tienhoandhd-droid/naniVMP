# Today Personal Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make linked QA staff see only their owner/support work by default on Today, preserve an explicit team switch, keep Admin/QA Manager in team mode, and replace the misleading empty My work state with actionable identity feedback.

**Architecture:** Add one pure role-aware Today scope model and one focused scope-control component. `VerifiedAppShell` owns a Today-only `mine | team` state independent from the global `onlyMine` URL filter, passes the derived boolean to `filterTodayScope`, and leaves server authorization authoritative.

**Tech Stack:** React 18, TypeScript, Vite, Node 24.18, Node test runner with `tsx`, Puppeteer mock E2E.

## Global Constraints

- Work in `/home/admin1/VMP/naniVMP-repo/.worktrees/qa-rights-account-alignment` on `feat/source-qa-workshop-scope`.
- Do not touch the pre-existing untracked `.superpowers/research/` directory.
- Use canonical `person_id` only; never fall back to display name or email.
- QA staff default to personal Today only with a non-empty linked performer ID.
- Admin and QA Manager default to team Today and may narrow when linked.
- The Today switch narrows already-authorized rows; it never grants access.
- Keep global `me=1` outside Today and add no second URL flag.
- Clearing department/area filters preserves Today person scope.
- Account/role management remains out of scope.
- Every behavior task starts RED and ends with fresh verification and review.
- Do not deploy, push, merge, or mutate production before the final reviewed release checkpoint.

---

## File map

| File | Responsibility |
| --- | --- |
| `src/features/today/todayPersonScope.ts` | Pure role/identity default, availability, and presentation copy |
| `src/features/today/TodayScopeControl.tsx` | Accessible `mine/team` action and unlinked warning |
| `src/App.tsx` | Today-only state, filtering, count/label, and filter-bar integration |
| `tests/unit/today-person-scope.test.mjs` | Pure model and rendered control contracts |
| `tests/unit/today-scope.test.mjs` | Canonical owner/support and team filtering regression |
| `tests/e2e/today-personal-scope.mjs` | Linked QA, manager/admin, unlinked, and same-name personas |
| `package.json` | Targeted `e2e:today-scope` command |

## Task 1: Add the pure role-aware scope model

**Files:**
- Create: `src/features/today/todayPersonScope.ts`
- Create: `tests/unit/today-person-scope.test.mjs`

**Interfaces:**
- Consumes: `BusinessRole` from `src/lib/businessRoles.ts`.
- Produces:

```ts
export type TodayPersonScope = "mine" | "team";
export interface TodayScopePresentation {
  heading: "Việc hôm nay của tôi" | "Việc hôm nay của cả đội";
  actionLabel: "Xem việc cả đội" | "Chỉ xem việc của tôi";
  warning: string | null;
}
export function canUsePersonalTodayScope(currentPersonId: string | null): boolean;
export function defaultTodayPersonScope(
  businessRole: BusinessRole | null,
  currentPersonId: string | null,
): TodayPersonScope;
export function presentTodayPersonScope(
  scope: TodayPersonScope,
  currentPersonId: string | null,
): TodayScopePresentation;
```

- [ ] **Step 1: Write model RED**

Create table-driven assertions:

```js
assert.equal(defaultTodayPersonScope("qa_staff", "person-a"), "mine");
assert.equal(defaultTodayPersonScope("qa_manager", "person-a"), "team");
assert.equal(defaultTodayPersonScope("admin", "person-a"), "team");
assert.equal(defaultTodayPersonScope("qa_staff", null), "team");
assert.equal(defaultTodayPersonScope(null, "person-a"), "team");
assert.equal(canUsePersonalTodayScope(" person-a "), true);
assert.equal(canUsePersonalTodayScope(""), false);
assert.deepEqual(presentTodayPersonScope("mine", "person-a"), {
  heading: "Việc hôm nay của tôi", actionLabel: "Xem việc cả đội", warning: null,
});
assert.deepEqual(presentTodayPersonScope("team", null), {
  heading: "Việc hôm nay của cả đội",
  actionLabel: "Chỉ xem việc của tôi",
  warning: "Tài khoản chưa liên kết nhân sự; nhờ Admin nối hồ sơ.",
});
```

- [ ] **Step 2: Prove RED**

```bash
node --import tsx --test tests/unit/today-person-scope.test.mjs
```

Expected: fail because `todayPersonScope.ts` does not exist.

- [ ] **Step 3: Implement minimum model**

```ts
export function canUsePersonalTodayScope(currentPersonId: string | null): boolean {
  return typeof currentPersonId === "string" && currentPersonId.trim().length > 0;
}
export function defaultTodayPersonScope(
  businessRole: BusinessRole | null,
  currentPersonId: string | null,
): TodayPersonScope {
  return businessRole === "qa_staff" && canUsePersonalTodayScope(currentPersonId)
    ? "mine" : "team";
}
```

`presentTodayPersonScope` returns the literal strings from the interface and adds the warning only when personal mode is unavailable.

- [ ] **Step 4: Prove GREEN and commit**

```bash
node --import tsx --test tests/unit/today-person-scope.test.mjs
git diff --check
git add src/features/today/todayPersonScope.ts tests/unit/today-person-scope.test.mjs
git commit -m "feat(today): derive personal scope by role"
```

## Task 2: Add the accessible Today scope control

**Files:**
- Create: `src/features/today/TodayScopeControl.tsx`
- Modify: `tests/unit/today-person-scope.test.mjs`

**Interfaces:**

```ts
export interface TodayScopeControlProps {
  scope: TodayPersonScope;
  currentPersonId: string | null;
  onChange: (scope: TodayPersonScope) => void;
}
```

- [ ] **Step 1: Write component RED**

Render with `react-dom/server` and assert:

```js
assert.match(render({ scope: "mine", currentPersonId: "person-a" }), /Xem việc cả đội/);
assert.match(render({ scope: "team", currentPersonId: "person-a" }), /Chỉ xem việc của tôi/);
const unlinked = render({ scope: "team", currentPersonId: null });
assert.match(unlinked, /disabled/);
assert.match(unlinked, /nhờ Admin nối hồ sơ/);
```

Inspect the element callback and assert `mine -> team` and `team -> mine` exactly once.

- [ ] **Step 2: Prove RED, implement, and prove GREEN**

Run the focused test before and after implementation:

```bash
node --import tsx --test tests/unit/today-person-scope.test.mjs
npm run typecheck
```

Render one `button type="button"` with accessible name `actionLabel`, `aria-pressed={scope === "mine"}`, and disabled personal action when no linked ID. Render the warning with `role="status"`; use the existing compact filter-bar styles.

- [ ] **Step 3: Commit**

```bash
git diff --check
git add src/features/today/TodayScopeControl.tsx tests/unit/today-person-scope.test.mjs
git commit -m "feat(today): add explicit team scope control"
```

## Task 3: Separate Today scope from global My work

**Files:**
- Modify: `src/App.tsx`
- Modify: `tests/unit/today-scope.test.mjs`
- Modify: `tests/unit/today-person-scope.test.mjs`

**Interfaces:** Consumes Tasks 1–2 and produces `todayPersonScope` state used only by Today.

- [ ] **Step 1: Write shell/filter RED**

Extend the tests to require canonical owner/support in `mine`, unrelated rows in `team`, and identity-loss normalization:

```js
assert.equal(normalizeTodayPersonScope("mine", null), "team");
assert.equal(normalizeTodayPersonScope("team", "person-a"), "team");
assert.equal(normalizeTodayPersonScope("mine", "person-a"), "mine");
```

The E2E in Task 4 proves the actual shell wiring, role defaults, toggle, and
department/area clear behavior; do not grep application source text as a test.

- [ ] **Step 2: Prove RED**

```bash
node --import tsx --test tests/unit/today-scope.test.mjs tests/unit/today-person-scope.test.mjs
```

- [ ] **Step 3: Implement state and filtering**

Initialize in `VerifiedAppShell`:

```ts
const [todayPersonScope, setTodayPersonScope] = useState<TodayPersonScope>(() =>
  defaultTodayPersonScope(access.businessRole, currentPersonId));
```

Export and use this pure identity-transition helper:

```ts
export function normalizeTodayPersonScope(
  scope: TodayPersonScope,
  currentPersonId: string | null,
): TodayPersonScope {
  return scope === "mine" && !canUsePersonalTodayScope(currentPersonId)
    ? "team" : scope;
}
```

If identity disappears while scope is `mine`, switch to `team` through this
helper. Do not reset an explicit team choice on rerender. Pass
`onlyMine: todayPersonScope === "mine"` to `filterTodayScope`; keep global
`onlyMine` and `me=1` unchanged.

In `GlobalFilterBar`, render `TodayScopeControl` instead of the generic My work button for Today. Today active/reset calculations ignore global `onlyMine`; reset preserves `todayPersonScope`; the count uses Today rows; the label starts with `Việc hôm nay của tôi` or `Việc hôm nay của cả đội` and appends department/area. Change the non-Today unlinked copy to `Tài khoản chưa liên kết nhân sự; nhờ Admin nối hồ sơ để dùng Việc của tôi.`

- [ ] **Step 4: Prove GREEN and commit**

```bash
node --import tsx --test tests/unit/today-person-scope.test.mjs tests/unit/today-scope.test.mjs tests/unit/today-model.test.mjs tests/unit/today-command-center.test.mjs
npm run typecheck
git diff --check
git add src/App.tsx src/features/today/todayPersonScope.ts tests/unit/today-scope.test.mjs tests/unit/today-person-scope.test.mjs
git commit -m "fix(today): default QA staff to personal work"
```

## Task 4: Prove roles through mock E2E

**Files:**
- Create: `tests/e2e/today-personal-scope.mjs`
- Modify: `tests/e2e/gia-lap-supabase.mjs` only if its shared profile fixture needs canonical ID support
- Modify: `package.json`

**Interfaces:** Consumes existing intercepted login/profile/dashboard patterns and produces `npm run e2e:today-scope`.

- [ ] **Step 1: Add deterministic fixtures**

Use stable UUID-shaped IDs for owner, support, and unrelated QA. Return `person_id` through the same profile lookup used by `getProfile`. Dashboard rows are owner, support, same-name unrelated, and another-department unrelated.

- [ ] **Step 2: Write RED E2E**

For linked `qa_staff`, initial Today contains owner/support codes, excludes unrelated codes, and shows `Xem việc cả đội`; after click, same-department unrelated appears. Linked `qa_manager` and `admin` start in team mode with `Chỉ xem việc của tôi`. Unlinked `qa_staff` shows a disabled personal action and Admin-link warning. Same display names never cross personal scope.

- [ ] **Step 3: Prove RED, add script, prove GREEN**

```bash
bash scripts/with-preview.sh -- node tests/e2e/today-personal-scope.mjs
```

Add this exact package script, then rerun it:

```json
"e2e:today-scope": "node tests/e2e/today-personal-scope.mjs"
```

- [ ] **Step 4: Commit**

```bash
git diff --check
git add tests/e2e/today-personal-scope.mjs tests/e2e/gia-lap-supabase.mjs package.json
git commit -m "test(today): prove role-aware personal queue"
```

## Task 5: Independent review and release gate

**Files:** No intended runtime changes; fixes return to the task owner.

- [ ] **Step 1: Primary inspection**

Confirm no name/email fallback, Source/account permission change, global URL regression, or client-side access widening.

- [ ] **Step 2: Independent reviews**

Terra reviews UI/accessibility/E2E realism. Sol reviews role defaults, canonical identity, client/server boundary, and whole diff. Resolve every Critical/Important finding and require final 0/0 verdicts.

- [ ] **Step 3: Run fresh gate**

```bash
node --import tsx --test tests/unit/today-person-scope.test.mjs tests/unit/today-scope.test.mjs tests/unit/today-model.test.mjs tests/unit/today-command-center.test.mjs
npm run typecheck
bash scripts/with-preview.sh -- npm run e2e:today-scope
npm run build
git diff --check
git status --short
```

Expected: all pass; status contains only pre-existing `.superpowers/research/`.

- [ ] **Step 4: Record checkpoint and resume Source**

Append exact commits, commands, test counts, and 0/0 verdicts to the progress ledger. Resume `docs/superpowers/plans/2026-08-28-source-qa-workshop-access.md` from Task 1 RED-suite review. Do not deploy Today alone under the approved combined release order.

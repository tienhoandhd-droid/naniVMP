# Hide And Sort Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide inactive accounts from the two account-management surfaces and sort visible rows deterministically by the role information the server actually provides.

**Architecture:** Add one pure presentation-model module that filters and returns sorted copies of directory people and account candidates. Keep RPC decoding strict in `api.ts`, apply the model at the API/component boundaries, and leave the sealed Cycle 3 SQL and private manifest untouched.

**Tech Stack:** React 18, TypeScript, Node 24.18.0 test runner with `tsx`, Puppeteer E2E, Vite.

## Global Constraints

- Start from `origin/main` commit `79565b22fb88239952ed640ce230d47364e9e28d` in the existing `ui/hide-sort-accounts` worktree.
- Never embed, log, or commit the seven private account UUIDs or the private manifest.
- Do not edit sealed Cycle 3 SQL, Supabase Auth users, production data, RPC write behavior, debounce/sequence guards, or authorization checks.
- Directory visibility: remove only `account_status === "inactive"`; retain `unlinked` and active people with incomplete/unknown classification.
- Directory order: `qa_manager`, `qa_progress_editor`, `equipment_manager`, `workshop_staff`, then unknown/legacy; Vietnamese name, email, and `person_id` are tie-breakers. Admin ordering is covered on the candidate surface because `DirectoryPerson.access_class` intentionally has no Admin value.
- Candidate visibility: remove `is_active === false`.
- Candidate order: `admin`, `qa_manager`, `department_user`, `viewer`, then unknown; Vietnamese name, email, and `user_id` are tie-breakers.
- Sorting must return new arrays and must not mutate caller-owned arrays or row objects.
- TDD is mandatory: capture RED output before production changes and GREEN output afterward.
- Before push: independent review with 0 Critical/0 Important, targeted E2E, full unit, typecheck, and production build. Do not force-push.

---

### Task 1: Pure visibility and role-order model

**Files:**
- Create: `src/features/itemPermissions/accountListModel.ts`
- Modify: `tests/unit/item-permission-contracts.test.mjs`

**Interfaces:**
- Consumes: `DirectoryPerson` and `AccountCandidate` from `src/features/itemPermissions/types.ts`.
- Produces: `visibleSortedDirectoryPeople(people: readonly DirectoryPerson[]): DirectoryPerson[]` and `visibleSortedAccountCandidates(candidates: readonly AccountCandidate[]): AccountCandidate[]`.

- [ ] **Step 1: Add RED tests for directory visibility, role order and immutability**

Append tests that import `visibleSortedDirectoryPeople` from the wished-for module. Use complete literal `DirectoryPerson` fixtures. The input order must include: inactive QA manager, unlinked unknown person, workshop staff, equipment manager, QA staff, and two QA managers whose Vietnamese names require name/email/ID tie-breaks. Assert literal ordered `person_id` values, assert the inactive ID is absent, assert the unlinked unknown ID is present last, and assert the original input ID order is unchanged.

- [ ] **Step 2: Run the directory test and verify RED**

Run:

```bash
export PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH
node --import tsx --test --test-name-pattern='danh bạ ẩn tài khoản inactive' tests/unit/item-permission-contracts.test.mjs
```

Expected: FAIL because `accountListModel.ts` does not exist.

- [ ] **Step 3: Add RED tests for candidate visibility, legacy role order and immutability**

Use complete literal `AccountCandidate` fixtures in scrambled order: inactive Admin, active Viewer, active department user, active QA Manager, two active Admin rows requiring name/email/ID tie-breaks. Assert the literal ordered `user_id` values, absence of inactive ID, and unchanged input order.

- [ ] **Step 4: Run the candidate test and verify RED**

Run:

```bash
export PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH
node --import tsx --test --test-name-pattern='ứng viên chỉ hiện tài khoản active' tests/unit/item-permission-contracts.test.mjs
```

Expected: FAIL because the export is missing.

- [ ] **Step 5: Implement the minimum pure model**

Create `accountListModel.ts` with readonly rank maps and comparison helpers. Use copied arrays:

```ts
const directoryRoleRank: Readonly<Record<string, number>> = {
  qa_manager: 0,
  qa_progress_editor: 1,
  equipment_manager: 2,
  workshop_staff: 3,
};

const candidateRoleRank: Readonly<Record<string, number>> = {
  admin: 0,
  qa_manager: 1,
  department_user: 2,
  viewer: 3,
};
```

Unknown values use `Number.MAX_SAFE_INTEGER`. Compare text with
`localeCompare(other, "vi", { sensitivity: "base" })`; compare stable IDs last with ordinary `localeCompare`. Filter before sorting and never write into an input row.

- [ ] **Step 6: Run focused GREEN and full unit regression**

Run:

```bash
export PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH
node --import tsx --test --test-name-pattern='danh bạ ẩn tài khoản inactive|ứng viên chỉ hiện tài khoản active' tests/unit/item-permission-contracts.test.mjs
npm run test:unit
```

Expected: focused tests PASS; full suite has 0 failures.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/features/itemPermissions/accountListModel.ts tests/unit/item-permission-contracts.test.mjs
git commit -m "feat(accounts): filter and order visible accounts"
```

---

### Task 2: Integrate the model into account management surfaces

**Files:**
- Modify: `src/features/itemPermissions/api.ts`
- Modify: `src/features/itemPermissions/StaffDirectoryPanel.tsx`
- Modify: `src/features/itemPermissions/AccountLinkPanel.tsx`
- Modify: `tests/unit/item-permission-contracts.test.mjs`
- Modify: `tests/e2e/danh-ba-phan-quyen.mjs`

**Interfaces:**
- Consumes: both Task 1 functions without changing their signatures.
- Produces: filtered/sorted directory state, filtered/sorted account candidate results, and a component defense that renders no inactive option.

- [ ] **Step 1: Change the existing inactive-option contract to RED**

Replace the current test `ứng viên tài khoản không hoạt động bị khóa và có nhãn trạng thái` with `ứng viên tài khoản không hoạt động không được dựng thành option`. Render the real `AccountCandidateOption` inside a `<select>` and assert the resulting markup contains no `user-inactive`, email, or inactive status text.

- [ ] **Step 2: Add a RED API integration test**

Test the exported pure boundary used by `searchAccountCandidates` without mocking Supabase: export a small function `prepareAccountCandidates(candidates: readonly AccountCandidate[]): AccountCandidate[]` from `api.ts`, pass an inactive and scrambled active fixture, and assert literal visible ordered IDs. This test must fail because the export is absent.

- [ ] **Step 3: Run integration tests and verify RED**

Run:

```bash
export PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH
node --import tsx --test --test-name-pattern='không được dựng thành option|API tài khoản loại inactive' tests/unit/item-permission-contracts.test.mjs
```

Expected: FAIL on current option rendering and missing API preparation export.

- [ ] **Step 4: Apply the model at all boundaries**

- In `api.ts`, import `visibleSortedAccountCandidates`, export `prepareAccountCandidates` as the narrow wrapper, and have `searchAccountCandidates()` decode all payload rows before calling it.
- In `StaffDirectoryPanel.tsx`, import `visibleSortedDirectoryPeople` and apply it to `searchPermissionDirectory(query)` before `setResults`. Also use the same transformation for `reloadSelectedDirectoryPerson`, `completeDirectorySaveWhenCurrent`, and export results so inactive-account rows cannot reappear through a secondary path.
- In `AccountLinkPanel.tsx`, make `AccountCandidateOption` return `null` for `!candidate.is_active`; preserve the linked-person disabled rule for active candidates.

- [ ] **Step 5: Run focused GREEN and typecheck**

Run:

```bash
export PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH
node --import tsx --test --test-name-pattern='không được dựng thành option|API tài khoản loại inactive' tests/unit/item-permission-contracts.test.mjs
npm run typecheck
```

Expected: PASS and typecheck exit 0.

- [ ] **Step 6: Extend the real E2E fixture and assertions**

Use a focused hermetic browser fixture registered under the current CI `e2e:gialap` group. The fixture must install `caiGiaLap()` and `nhetPhien()` before navigation, override `rpc_item_permission_directory` with one complete person having `account_status: "inactive"` plus visible rows in scrambled access-class/name order, and override account candidates with an inactive distinctive candidate plus active roles in scrambled order. After loading the **Vai trò & phạm vi** screen with an empty directory search, assert:

- inactive directory text is absent;
- unlinked visible person remains;
- result button texts appear in the specified role order;
- after selecting an unlinked person and searching account candidates, inactive candidate text is absent and active option values are in expected role/name order.

Use DOM-observable assertions against the real page; do not assert that the request mock exists.

Runtime adjustment after root-cause investigation: do not add this feature to
`danh-ba-phan-quyen.mjs`. That legacy suite mixes real Auth with partial mocks,
contains post-removal People-screen flows, and is not part of current CI. Add a
small `tests/e2e/tai-khoan-an-sap-xep.mjs` fixture and register it after
`luong-gia-lap.mjs` in `e2e:gialap`; restore the legacy file to its pre-task
state. Assert `chanNgoai` is empty so no Supabase request can escape the mock.

- [ ] **Step 7: Run targeted E2E GREEN**

Run:

```bash
export PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH
bash scripts/with-preview.sh -- node tests/e2e/tai-khoan-an-sap-xep.mjs
```

Expected: exit 0 with all assertions reached. The wrapper builds a fresh artifact and cleans its preview process.

- [ ] **Step 8: Run final non-production gates**

Run:

```bash
export PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH
npm run test:unit
npm run typecheck
npm run build
bash scripts/with-preview.sh -- npm run e2e:gialap
bash scripts/with-preview.sh -- npm run e2e:catalog
bash scripts/with-preview.sh -- npm run e2e:admin
```

Expected: all commands exit 0. These are the same three moderate mock E2E groups required by current CI.

- [ ] **Step 9: Commit Task 2**

```bash
git add src/features/itemPermissions/api.ts src/features/itemPermissions/StaffDirectoryPanel.tsx src/features/itemPermissions/AccountLinkPanel.tsx tests/unit/item-permission-contracts.test.mjs tests/e2e/danh-ba-phan-quyen.mjs
git commit -m "feat(accounts): hide inactive and sort role lists"
```

---

### Task 3: Independent review, release verification and main push

**Files:**
- No planned source changes; fixes, if required, remain limited to Task 1–2 owned files.

**Interfaces:**
- Consumes: complete diff from `79565b22fb88239952ed640ce230d47364e9e28d` through branch HEAD.
- Produces: review verdict, fresh verification evidence, fast-forward main push and deployment observation.

- [ ] **Step 1: Independent review**

Give a reviewer the spec, task reports and full diff. Require explicit spec-compliance and code-quality verdicts. Fix at most three rounds; any remaining Critical/Important finding blocks push.

- [ ] **Step 2: Sol final review**

Review the whole branch for hidden UUID leakage, inactive-row bypass paths, role-order correctness, mutation of inputs, accessibility and regression risk. Required verdict: 0 Critical and 0 Important.

- [ ] **Step 3: Fresh verification immediately before push**

Rerun Task 2 Step 8 plus targeted `danh-ba-phan-quyen.mjs`; inspect complete output and ensure `git diff --check` passes.

- [ ] **Step 4: Fast-forward and push main**

Fetch origin, require `origin/main` still equals the recorded base or is an ancestor of branch HEAD without unrelated divergence, then push without force:

```bash
git fetch origin
git push origin ui/hide-sort-accounts:main
```

- [ ] **Step 5: Observe exact-SHA CI and Pages**

Confirm the GitHub workflow and Pages deployment both target the pushed commit and finish successfully. Report the exact SHA and any production-operation dependency still outstanding; do not claim the seven active accounts are hidden until the signed Cycle 3 database operation has made them inactive.

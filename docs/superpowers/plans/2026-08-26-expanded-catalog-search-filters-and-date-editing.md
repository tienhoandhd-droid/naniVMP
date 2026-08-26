# Expanded Catalog Search, Filters, and Controlled Date Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Keep database and shared-file work sequential under the primary `gpt-5.6-sol` planner. Every behavior change starts RED and every completion claim requires fresh verification.

**Goal:** Improve search and advanced filtering in the timeline-driving Source Data and Timeline views; let authenticated `admin` and `qa_manager` users manually revise only the four planned deadlines with reason, explicit confirmation, whole-row optimistic revision, and audit; and restore the canonical QA Manager ability to edit the four actual completion dates without granting schedule or deadline access.

**Architecture:** Preserve completed catalog V2 work as the source-calculated batch path, but stop treating source calculation as the only legal source of planned deadlines. Add one dedicated item-level planned-deadline RPC and one reusable Timeline dialog; do not widen `rpc_update_progress`. Extract pure filter models for Source Data objects and Timeline. In a separate sequential security task, normalize only QA department comparisons in `vmp_manager_principal()` so its existing exact eight-field actual-date/status allowlist works for `QA` and `qa`.

**Tech stack:** React 18, TypeScript, Vite, Supabase/PostgreSQL RPC, Node 24 + `tsx`, Puppeteer mock E2E, Playwright accessibility/visual checks, GitHub Actions, GitHub Pages.

## Global Constraints

- Use Node `24.18.0`; begin every behavior change with a failing focused test and retain the RED/GREEN evidence.
- Never force-push, retry a production mutation, or mutate production Supabase without separate explicit authorization.
- Keep database changes and overlapping shared files sequential; use separate reviewers and at most three focused fix waves per gate.
- Manual planned-date editing changes exactly four `deadline_*` fields and allowed audit/version metadata; it must preserve actual dates, statuses, assignments, identity, and lifecycle state.
- QA Manager actual-date editing remains the exact eight-field allowlist; `scheduled_at` and every `deadline_*` field remain denied through that path.
- Push only a clean, freshly reviewed commit after the full local gate; monitor CI and Pages by exact commit SHA to terminal success.

## Execution Checklist

- [ ] Reconcile Task 4 E2E against the approved V2 database contract and obtain an independent 0/0 review.
- [ ] Add and test the exact unavailable-RPC fallback/capability gate before any Pages release.
- [ ] Implement Source Data and Timeline search/filter models and user interfaces with focused unit/E2E coverage.
- [ ] Implement and independently review the manual planned-deadline database contract on a disposable clone.
- [ ] Implement the gated manual deadline dialog/API with protected-field evidence and no automatic retry.
- [ ] Normalize the QA Manager principal, prove the exact eight fields, and independently review the security diff.
- [ ] Run combined unit, database, E2E, accessibility, visual, build, and whole-diff Sol review gates.
- [ ] Push the exact reviewed commit without force and monitor GitHub Actions/Pages until terminal success.

## 1. Snapshot and supersession boundary

Planning snapshot: branch `fix/catalog-timeline-progressed-deadlines` at `de919eb` on 2026-08-26, based on `origin/main` at `8a28c74`. Task 4 advanced the branch while this draft was written; the refreshed worktree is clean.

Current catalog deadline plan state:

- Tasks 1–2 are complete and independently reviewed. They provide V2 selection/error contracts, two source-calculated V2 RPCs, a whole-row `vmp_plan_items.version` trigger, audit coverage for all four planned deadlines, and database fault/concurrency/security tests.
- Task 3 is complete after one fix wave. Commit `131c8d9` clears stale preview state across `changeId` changes; review is 0 Critical / 0 Important.
- Task 4 implementation is committed at `de919eb` with source-calculated success and primary blocker E2E. Its owner report/fresh primary verification still needs reconciliation, and its old brief does not cover release fallback or the expanded features. Preserve the commit, then extend/review it against this plan.
- Task 5 has not started and moves to the end of the expanded scope.

This draft supersedes only the claim that source data is the sole legal way to change planned deadlines:

- Keep `rpc_preview_catalog_change_v2` / `rpc_apply_catalog_change_v2` for explicitly approved batch updates calculated from source data.
- Reuse the row-revision trigger, audit function, strict role/session boundary, protected-row snapshots, and no-retry coordinator patterns.
- Add a direct manual item path for exceptional plan corrections. Both paths conflict safely through the same whole-row version.
- Replace Task 5 with a combined review/gate/runbook for the catalog V2, filters, manual deadlines, and QA principal normalization.

## 2. Recommended approach and exact defaults

### 2.1 Planned deadlines

Use a dedicated `rpc_update_planned_deadlines` boundary. It receives one item identity, expected whole-row version, an exact four-key deadline snapshot, a nonblank reason, and explicit confirmation.

Alternatives considered:

1. **Recommended — dedicated RPC and Timeline dialog:** isolates the stronger role rule and protected-field postcondition; permits an isolated correction without manufacturing a catalog change.
2. **Rejected — widen `rpc_update_progress`:** that RPC is governed by item-level field rights for multiple operational roles and carries actual dates/statuses. Adding planned deadlines would conflate authorization models.
3. **Rejected — editable dates only in Catalog Impact Preview:** keeps correction dependent on a pending source change and leaves no direct item path.

Exact first-release rules:

- The only business fields accepted are `deadline_protocol`, `deadline_validation`, `deadline_report`, and `deadline_vmp`.
- The UI and JSON payload always contain all four keys. This is a complete proposed snapshot, not a generic patch.
- Values are ISO dates or `null`. An unchanged legacy `null` may remain; changing non-null to `null` is rejected to prevent accidental deadline erasure.
- At least one value must differ. Resulting non-null dates must be nondecreasing in pipeline order. Past dates warn but are allowed.
- The correction persists until a later human separately previews and applies a source-driven change. Do not add a persistent override table/enum in this release; explicit catalog apply plus audit history is sufficient provenance.
- Only active items in active lifecycle state are editable.
- Permitted companion mutations are `version = old + 1` exactly once and mandatory update/audit metadata. Actual dates, phase statuses, computed/lifecycle state, owners/assignments, identity, and every other business column must remain equal.
- Browser callers need an active session and effective `admin` or `qa_manager`. Role denial happens before item lookup.
- The direct edit action belongs to a Timeline item. Source Data owns catalog filtering and source-calculated batch impact; it does not edit plan-item rows directly.

### 2.2 “Ngày thực hiện” is resolved as actual completion dates

The completed analysis at `.superpowers/sdd/2026-08-26-qa-manager-execution-date-analysis.md` resolves the request as the four actual completion dates:

- `actual_protocol_date`
- `actual_validation_date`
- `actual_report_date`
- `actual_vmp_date`

Do not grant `scheduled_at` and do not route this request through the new planned-deadline RPC. The canonical QA contract remains exactly eight fields: those four `actual_*` dates and their four matching `status_*` fields.

The minimal fix is a new forward migration that changes only the two QA department comparisons in `vmp_manager_principal(uuid)` to `upper(btrim(...)) = 'QA'`. Preserve profile/performer active checks, unique link, access class, SECURITY DEFINER/search path, ACL, item active guard, reason, future-date validation, optimistic version, atomic mixed-patch denial, and audit. Do not enable item-permission enforced mode globally and do not alter legacy role rows as a shortcut.

This is a separate sequential security task after planned-deadline DB contract review and before final E2E. It may share the database harness/security inventory but not the planned-deadline authorization boundary.

### 2.3 Search/filter ambiguity and bounded scope

Both views already have basic search. Source Data searches objects client-side and products/alerts through a paginated RPC; Timeline already filters group, department, status, and time range. This work is an enhancement and consistency pass.

“Source Data” could mean every workspace dataset. The safest first slice is:

- advanced filters for the timeline-driving **Đối tượng** dataset;
- advanced filters for **Timeline**;
- keep existing product/alert search unchanged.

Paginated product/alert advanced filters need a separate server-side contract to keep counts/pages correct and are outside this release.

### 2.4 Release compatibility blocker

GitHub Pages deploys frontend assets, but `.github/workflows/deploy.yml` neither applies nor tests production Supabase migrations. The current Task 3 UI calls V2 unconditionally. Pushing this branch to `main` before production has `20260826130000_catalog_progressed_deadline_override.sql` can break every catalog impact preview.

Production Supabase mutation is not authorized. A Pages release is therefore blocked until either:

1. read-only production preflight proves the required RPC migrations are installed; or
2. a tested fail-closed capability/fallback path hides unavailable DB-dependent actions and preserves V1 catalog preview/apply.

Default to option 2 under current authority. The manual-deadline action and QA runtime-fix claim must also remain unavailable/unclaimed until their migrations are installed. Applying any migration to production requires later explicit authorization.

Keep this compatibility mechanism narrow: fall back only from the exact unavailable-function contract for the V2 signature (PostgreSQL `42883` or PostgREST `PGRST202`, pinned by tests) to the existing V1 flow, but propagate every authorization, validation, network, and other server error unchanged. Gate only the new manual action with `VITE_MANUAL_PLANNED_DEADLINES_ENABLED === "true"`, default false; mock E2E builds set it true, while the Pages production build reads a GitHub variable that remains false/unset until a later reviewed read-only migration preflight. The RPC remains the security boundary. Do not build a generic capability service for two actions.

## 3. Filter architecture and UX

### 3.1 Source Data — Đối tượng

Create a pure filter model over rows already returned by `fetchSourceObjects({ kind })`. Do not broaden reads to inactive rows and do not add a database migration.

Initial filters:

- text across code, name, department, area, line, owner, report/work group, and note;
- department and area;
- validation plan: all / has validation / outside plan;
- first-month readiness: all / missing / present. This filter does not claim that every item-specific deadline can be calculated; the server helper remains authoritative for that decision;
- owner: all / assigned / unassigned / one visible owner;
- frequency: all / 12 months or less / over 12 months.

Keep the object-kind tab as routing, not a duplicated filter. Use normalized strings and exact categories; add no fuzzy-search dependency. Current data volume is small enough for memoized client filtering.

UX contract:

- Keep the existing search box primary; place advanced controls in one collapsible region with active-filter count.
- Show removable chips and one `Xoá lọc` action.
- Reset page and expanded row on filter changes.
- Row count, Excel export, desktop table, and mobile cards consume the same filtered array.
- Filtered-empty copy names active filters and clears them without changing object kind.

### 3.2 Timeline

Extract the current predicate from `TimelinePage.tsx` into a pure `timelineFilterModel`. Preserve active-row, range intersection, group, department, status, debounced query, and priority-order semantics.

Add only high-value fields already present on `Activity`:

- validation type;
- owner: all / assigned / unassigned / one visible owner;
- current phase: protocol / validation / report / VMP / done;
- readiness: all / all four planned dates present / at least one planned date missing.

Do not add a second date-range control, URL state, or localStorage persistence. Every Timeline consumer—facets, overview, 3D, focus layer, stage strip, board/table, and counts—derives from the same authorized model. Existing status facets still exclude their own predicate where click-count equality is promised. Clear inspector selection when the selected item leaves the result.

Accessibility/responsive rules:

- explicit Vietnamese labels and keyboard focus for every control;
- `aria-expanded` / `aria-controls` for advanced panels;
- removable chips have specific accessible names;
- result count updates in a polite live region;
- advanced controls remain usable at mobile widths;
- browser tests use DOM polling, not new arbitrary sleeps.

## 4. Manual planned-deadline database contract

Add a forward-only migration after `20260826130000`; reserve `supabase/migrations/20260826170000_manual_planned_deadline_edit.sql` unless another committed migration owns that timestamp first.

Public boundary:

```sql
public.rpc_update_planned_deadlines(
  p_validation_code text,
  p_deadlines jsonb,
  p_reason text,
  p_expected_version integer,
  p_confirmed boolean
) returns jsonb
```

Exact request body:

```json
{
  "deadline_protocol": "2026-09-01",
  "deadline_validation": "2026-09-15",
  "deadline_report": "2026-09-22",
  "deadline_vmp": "2026-09-30"
}
```

The boundary is `SECURITY DEFINER` with fixed `search_path = public, pg_temp`; helpers are `SECURITY INVOKER` and owner-only. Revoke `PUBLIC`/`anon`; grant only reviewed callers. If project convention retains a `service_role` exception, state and audit it explicitly rather than silently broadening the human role rule.

Deterministic error precedence:

1. active-session denial (`ACCOUNT_DISABLED` / `ROLE_UNRESOLVED`);
2. role denial (`FORBIDDEN`);
3. exact JSON shape/type (`INVALID_DEADLINE_PAYLOAD`);
4. expected revision (`EXPECTED_REVISION_REQUIRED`);
5. reason (`REASON_REQUIRED`);
6. confirmation (`CONFIRMATION_REQUIRED`);
7. item/lifecycle (`ITEM_NOT_FOUND`, `ITEM_STATE_INACTIVE`);
8. locked revision (`VERSION_CONFLICT`);
9. erasure/order/action checks (`DEADLINE_ERASURE_FORBIDDEN`, `DEADLINE_ORDER_INVALID`, `NO_ACTIONABLE_CHANGE`);
10. mutation postcondition (`WRITE_MISMATCH`).

Transaction algorithm:

1. Authorize before item lookup.
2. Validate an exact four-key JSON object; reject extra/missing keys and invalid scalars.
3. Lock the item `FOR UPDATE` and compare the whole-row version.
4. Snapshot the full row and validate lifecycle, erasure, delta, and date order.
5. Set transaction-local audit source `manual_planned_deadline_edit` and trimmed reason.
6. Inside a PL/pgSQL exception subtransaction, update all four planned dates in one statement plus required metadata.
7. Re-read and prove proposed dates, version +1 exactly once, exact audit fields/reason/actor/effective role, and protected snapshot equality after removing only four deadlines plus allowed metadata.
8. Raise on mismatch so update and audit roll back before returning `WRITE_MISMATCH`.
9. Return validation code, old/new four-date snapshots, changed fields, previous/current version, actor/role, and `protected_fields_preserved: true`.

Concurrency contract:

- no automatic mutation retry;
- manual/manual from one version: one commit, one `VERSION_CONFLICT`;
- progress/status/assignment changes invalidate a displayed version even if deadlines did not change;
- catalog V2/manual cannot silently overwrite each other; locks and whole-row revision produce one winner and one stale/conflict result;
- the UI synchronously blocks duplicate clicks, and a duplicate server request cannot write twice with the stale version.

## 5. Manual deadline UX

Create one `PlannedDeadlineDialog` owned and mounted by Timeline.

Entry points:

- wide: `Chỉnh deadline kế hoạch` in `TimelineInspector`;
- narrow/full detail: the same action in `ActivityDetailModal`;
- visible only for effective `admin` / `qa_manager`; server remains authoritative.

`App.tsx` passes effective role and reload callback. Never infer from legacy `user.role`/`perm`.

Dialog behavior:

1. Show immutable item identity/version, all four actual dates/statuses, and all four planned dates.
2. Edit only four planned-date inputs. Protected values are read-only evidence and never enter a generic patch.
3. Show old → new review plus validation before save.
4. Require reason and checkbox: `Tôi xác nhận chỉ đổi bốn deadline kế hoạch; ngày thực tế, trạng thái, người thực hiện và mã hạng mục giữ nguyên.`
5. Disable close/save during mutation and use a synchronous coordinator lock.
6. On conflict, keep dialog/draft, show exact versions, and offer deliberate reload; never merge silently.
7. On business/network error, retain draft and exact error; never retry automatically.
8. On success, close, toast, and refetch the dashboard.

Keep provenance wording distinct: Catalog Impact says `Tính lại từ dữ liệu nguồn`; Timeline says `Chỉnh kế hoạch thủ công`.

## 6. QA Manager actual-date principal task

Create a separate migration after the manual-deadline migration, provisionally `supabase/migrations/20260826180000_qa_manager_actual_date_principal_normalization.sql`.

Allowed implementation change:

```sql
upper(btrim(profile.department::text)) = 'QA'
and person.access_class = 'qa_manager'
and upper(btrim(person.department::text)) = 'QA'
```

Everything else in `vmp_manager_principal(uuid)` is preserved byte-for-byte where feasible and contract-for-contract otherwise: active profile/person, unique `user_id` link, role/access class, SECURITY DEFINER, fixed search path, owner-only/internal ACL. The migration has fail-closed preconditions for the reviewed old signature/metadata and postconditions for the new definition/ACL.

The exact QA allowlist stays:

```text
actual_protocol_date, status_protocol,
actual_validation_date, status_validation,
actual_report_date, status_report,
actual_vmp_date, status_vmp
```

`scheduled_at` and every `deadline_*` remain forbidden in this path. Do not modify `QA_TIMELINE_FIELDS`, do not grant table UPDATE, do not set enforced mode globally, and do not seed broad legacy `update_progress=co` permission.

Required SQL RED/GREEN on a disposable clone:

- uppercase `QA` resolves business role but current manager principal fails RED;
- after migration, uppercase and lowercase QA resolve the same principal;
- `vmp_my_item_rights` returns exactly eight fields;
- under transaction-local enforced mode, QA Manager writes one actual date with reason/version and gets exact audit/version +1;
- `scheduled_at`, `deadline_protocol`, and mixed allowed+forbidden patches fail atomically with unchanged row/version;
- wrong department, wrong access class, no/duplicate link, inactive user/person/item remain fail-closed;
- future actual date, missing reason, and stale version remain rejected;
- function security mode, search path, owner, and ACL do not broaden.

Required E2E uses a real `qa_manager` access persona, not admin masquerading as QA: four date inputs and four status selects enabled; schedule disabled; label remains `Ngày hoàn thành thực tế`; save sends one changed actual field, reason, and expected version; server rejection retains modal/draft.

This task is database/security shared state. Primary `gpt-5.6-sol` implements sequentially and a separate Sol reviewer must report 0 Critical / 0 Important before final E2E.

## 7. File map, ownership, and sequencing

| Work unit | Files | Ownership / ordering |
|---|---|---|
| Existing Task 4 reconciliation + release fallback | inspect committed `tests/e2e/catalog-workspace.mjs` and `tests/e2e/gia-lap-supabase.mjs`; then modify `src/lib/supabaseData.ts`, `src/components/catalog/CatalogImpactPreview.tsx`, `tests/unit/catalog-impact-preview.test.mjs`, and focused E2E | Primary first inspects/reruns `de919eb`; compatibility work follows with exclusive ownership. |
| Source filter model/UI | create `src/features/catalogWorkspace/catalogWorkspaceFilterModel.ts`, create `tests/unit/catalog-workspace-filter-model.test.mjs`, modify `src/features/catalogWorkspace/CatalogWorkspaceShell.tsx`, `src/styles/catalog-workspace.css`, catalog E2E | `gpt-5.6-terra`, one owner. |
| Timeline filter model/UI | create `src/features/timeline/timelineFilterModel.ts`, create `tests/unit/timeline-filter-model.test.mjs`, modify `src/pages/TimelinePage.tsx` and `src/index.css` | `gpt-5.6-terra`; sequential with manual UI. |
| Manual deadline DB | create `supabase/migrations/20260826170000_manual_planned_deadline_edit.sql`, create focused SQL business/security tests, update `scripts/run-catalog-progressed-deadline-db-tests.sh` | Primary `gpt-5.6-sol`, sequential. |
| Manual model/API | create `src/features/timeline/plannedDeadlineEditModel.ts`, create `tests/unit/planned-deadline-edit-model.test.mjs`, modify `src/lib/supabaseData.ts` | After DB contract and compatibility work. |
| Manual dialog/integration | create `src/features/timeline/PlannedDeadlineDialog.tsx`, create `tests/unit/planned-deadline-dialog.test.mjs`, modify `src/features/timeline/TimelineInspector.tsx`, `src/pages/TimelinePage.tsx`, `src/App.tsx`, and `src/index.css` | Same Timeline UI owner, sequential. |
| QA actual-date principal | create `supabase/migrations/20260826180000_qa_manager_actual_date_principal_normalization.sql`, create focused SQL, modify `tests/e2e/quyen-cot-timeline.mjs`; add a small client mapping test only if coverage is absent | Primary Sol; after manual DB, before final E2E. No `ProgressEditModal` behavior redesign. |
| Expanded mock E2E | catalog fixtures/tests; create `tests/e2e/timeline-deadline-edit.mjs`; modify `package.json`, `.github/workflows/deploy.yml`, and `tests/unit/e2e-suite-contract.test.mjs` | Terra after all selectors/contracts freeze; add `e2e:timeline` to the existing mock CI gate. |
| Runbook/release | create `docs/runbooks/2026-08-26-expanded-catalog-features-deploy.md`; Task 5 evidence | Primary, final only. |

Do not parallelize writers to `TimelinePage.tsx`, `src/lib/supabaseData.ts`, Catalog Impact files, catalog E2E files, database runner/security inventories, or Timeline CSS. Primary inspects every delegated diff and reruns checks.

## 8. TDD phases and review checkpoints

### Phase A — reconcile Task 4 and freeze release compatibility

Reconcile the Task 4 owner report, inspect commit `de919eb`, and rerun its source-derived success plus `MISSING_SOURCE_DATA`, `VERSION_CONFLICT`, `ITEM_STATE_CHANGED`, and `FORBIDDEN` cases. Preserve stable selectors and one-request/no-retry assertions.

Then write RED coverage proving unavailable V2/manual RPC capability never exposes a broken action or retries. GREEN must preserve V1 normal preview/apply when V2 is absent, or hide the unavailable path behind an explicit tested capability gate.

Checkpoint: primary contract review before any push. No production DB action.

### Phase B — Source/Timeline filters

Source RED:

- query covers every declared field;
- department/area/validation/readiness/owner/frequency compose with AND semantics;
- count, page slice, export, desktop, and mobile share one result;
- clear preserves object-kind tab and resets pagination.

Timeline RED:

- existing group/department/status/query/range semantics remain literal;
- type/owner/phase/readiness compose;
- promised status facet counts exclude their own predicate;
- every Timeline workspace consumes the same result;
- selection clears when filtered out.

Focused command:

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test \
  tests/unit/catalog-workspace-filter-model.test.mjs \
  tests/unit/timeline-filter-model.test.mjs
```

Checkpoint: Terra review, then primary shared-file inspection. This slice is independently releasable only after Phase A.

### Phase C — manual deadline DB

SQL RED must fail at `undefined_function` for the new RPC, not fixture setup. Literal cases cover allowed/denied roles, inactive session, payload shape, erasure, reason, confirmation, no-op, order, missing/inactive item, stale version after a progress writer, exact +1 version, audit/protected snapshot, duplicate request, fault rollback, manual/manual concurrency, and manual/catalog concurrency.

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  bash scripts/run-catalog-progressed-deadline-db-tests.sh --expect-manual-red

PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  bash scripts/run-catalog-progressed-deadline-db-tests.sh
```

GREEN requires business, fault, concurrency, installed ACL/inventory, and five-role regressions to pass with fixture rollback. Rebaseline inventories from the installed reviewed clone; do not guess counts before final installation.

Checkpoint: independent Sol review, 0 Critical / 0 Important, maximum three focused fix waves.

### Phase D — manual model/dialog

Unit RED:

- exact four-key payload/version;
- erasure/order/no-op/reason/confirmation rules;
- role presentation for admin, QA Manager, and denied roles;
- old → new plus protected actual/status/identity evidence;
- one in-flight call, close lock, detailed error, conflict draft retention, success reload.

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test \
  tests/unit/planned-deadline-edit-model.test.mjs \
  tests/unit/planned-deadline-dialog.test.mjs
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run typecheck
```

Checkpoint: accessibility/UX review plus primary inspection.

### Phase E — QA Manager actual-date security fix

Create focused SQL RED before the normalization migration. Run both `vmp_my_item_rights` and `rpc_update_progress` as an uppercase-department QA Manager under transaction-local enforced mode. GREEN requires the exact eight fields and all negative cases in section 6.

Add the QA Manager browser persona RED/GREEN to `tests/e2e/quyen-cot-timeline.mjs`. Do not change the schedule input from disabled and do not change actual-date ALCOA+ semantics.

Checkpoint: independent Sol security review at 0 Critical / 0 Important before combined E2E.

### Phase F — replacement expanded E2E

On fresh pages with closure-scoped request counters, cover:

- source filter composition/count/reset/pagination/export scope;
- Timeline filter composition across overview/table/3D counts;
- admin and QA Manager manual deadline success with exact payload and one request;
- denied-role action absence plus server defense;
- reason/confirmation blockers;
- conflict/order/protected-field/network errors retaining draft with no retry;
- success reload showing new planned dates and unchanged actual/status;
- QA Manager actual-date edit with schedule still locked;
- V2 unavailable fallback/capability behavior.

Keep zero outbound network and DOM polling. Checkpoint: E2E diff review.

### Phase G — replacement Task 5

Independent whole-diff Sol review focuses on privilege escalation, SECURITY DEFINER/search path, principal normalization, exact allowlists, revision/lost update, partial commit, audit accuracy, protected fields, fallback, stale UI, and source/manual interaction. Require 0 Critical / 0 Important before the full gate/runbook.

## 9. Final verification

Run from the exact final reviewed commit with Node 24.18.0:

```bash
export PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH
npm run typecheck
npm run test:unit
bash scripts/run-catalog-progressed-deadline-db-tests.sh
npm run test:db:five-role
npm run build
bash scripts/with-preview.sh -- npm run e2e:catalog
bash scripts/with-preview.sh -- npm run e2e:gialap
bash scripts/with-preview.sh -- npm run e2e:admin
bash scripts/with-preview.sh -- npm run e2e:timeline
bash scripts/with-preview.sh -- npm run test:permissions
bash scripts/with-preview.sh -- npm run a11y
npm run visual:contract
bash scripts/with-preview.sh -- npm run visual
git diff --check
git status --short
```

Acceptance:

- zero type/unit/build/E2E/a11y failures;
- DB suites use a validated disposable clone and finish fixture work with rollback evidence;
- visual changes are zero or explicitly reviewed and sealed on the feature branch;
- worktree clean after final runbook/evidence commit;
- no production Supabase mutation, fixture, RPC write probe, mode toggle, or schema-cache reload;
- CI is not treated as DB evidence because `deploy.yml` omits DB suites.

## 10. Rollback and recovery

- Filters are frontend-only and revert without data work.
- Manual UI can be hidden/reverted while leaving the audited boundary installed.
- DB recovery is forward-only: a reviewed disable migration revokes EXECUTE or returns `FEATURE_DISABLED`; never drop audit or automatically restore old deadlines.
- A wrong manual correction is corrected through another reasoned edit using audit old/new evidence.
- QA principal rollback restores the reviewed former function definition; it does not undo valid actual-date writes.
- Any DB correction needs a new migration, review, digest, preflight, and postflight.

## 11. Fast-forward push, CI, and Pages monitoring

GitHub push is authorized; production Supabase mutation is not. Use two steps:

1. **Feature-branch quality push:** fetch, verify clean exact reviewed commit, push branch without force, and dispatch `Quality and Deploy` with `expected_commit` equal to that commit. Dispatch runs quality jobs but does not deploy Pages.
2. **Main/Pages push:** only after section 2.4 is resolved. Fetch again and require `origin/main` to be an ancestor of the final reviewed commit. Push the exact commit to `refs/heads/main` without force. If remote advanced or ancestry fails, stop, integrate in an isolated worktree, and rerun review/full verification.

Execute the handoff from the clean reviewed worktree, substituting no other SHA:

```bash
FINAL_REVIEWED_COMMIT=$(git rev-parse HEAD)
FEATURE_BRANCH=$(git branch --show-current)
test -n "$FEATURE_BRANCH"
test -z "$(git status --porcelain)"
git fetch origin
git merge-base --is-ancestor origin/main "$FINAL_REVIEWED_COMMIT"
git push origin "$FINAL_REVIEWED_COMMIT:refs/heads/$FEATURE_BRANCH"
gh workflow run deploy.yml --ref "$FEATURE_BRANCH" -f expected_commit="$FINAL_REVIEWED_COMMIT"
```

After the feature-branch quality run succeeds and the compatibility gate is satisfied, fetch again, repeat the clean-worktree and ancestry assertions, then:

```bash
git push origin "$FINAL_REVIEWED_COMMIT:refs/heads/main"
PAGES_RUN_ID=$(gh run list --workflow deploy.yml --commit "$FINAL_REVIEWED_COMMIT" --event push --limit 1 --json databaseId --jq '.[0].databaseId')
test -n "$PAGES_RUN_ID"
gh run watch "$PAGES_RUN_ID" --exit-status
gh run view "$PAGES_RUN_ID" --json headSha,conclusion,jobs,url
```

Monitor by exact commit SHA:

- find the `deploy.yml` run whose `headSha` equals the push;
- watch `static-quality`, `e2e-mock`, `production-build`, and `deploy` to terminal success;
- verify the Pages deployment/environment references that same commit;
- make read-only HTTP/app smoke checks for load, filters, and capability-gated action visibility;
- never click a live mutation action as a smoke test.

On CI/Pages failure, inspect logs, make a reviewed fix commit, rerun appropriate local gates, and push the new exact commit. Never force-push or retry a production migration to make frontend CI green.

## 12. Scope and ETA

Assuming disposable DB and bundled browsers remain available:

- Task 4 reconciliation + capability fallback: 0.5–1 day;
- Source/Timeline filters: 1–1.5 days;
- manual deadline DB + tests + Sol review: 1.5–2.5 days;
- manual UI/API/unit/E2E/a11y/visual: 1.5–2 days;
- QA principal normalization + SQL/E2E/security review: 0.75–1.25 days;
- whole-diff review, fixes, gate, runbook, CI/Pages monitoring: 1–1.5 days.

Total: **6.25–9.75 working days**. Production approval/waiting time is excluded.

## 13. Recommended sequence and blocker

1. Reconcile and inspect committed Task 4; freeze/test V2 capability fallback.
2. Deliver frontend-only Source/Timeline filters.
3. Build and Sol-review the manual planned-deadline DB boundary on a clone.
4. Build the Timeline manual dialog.
5. Implement and Sol-review QA Manager actual-date principal normalization, preserving the exact eight fields and denying schedule.
6. Run combined E2E, replacement Task 5 whole-diff review/full gate, and write the combined forward-only runbook.
7. Push/monitor feature-branch quality.
8. Push `main` and monitor Pages only after DB compatibility is proven without unauthorized production mutation.

**Only release blocker:** a DB-dependent Pages build cannot safely ship until production capability is proven or a tested fallback/gate is present. Production behavior for planned-deadline editing and QA actual dates cannot be claimed until their migrations are separately authorized and installed.

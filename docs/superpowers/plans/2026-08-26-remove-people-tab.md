# Remove People Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Remove the “Nhân sự” navigation item and page from the frontend while preserving personnel data, server permissions, assignments, effective rights and email-recipient flows.

**Architecture:** Remove `people` from the frontend navigation/screen/render contracts. Retain it only as a legacy raw URL token so `#v=people` passes through the existing authorization fallback and resolves to the first screen the current user may view. Server/RPC/SQL payloads continue to expose the historical permission and the frontend parser ignores it.

**Tech Stack:** React 19, TypeScript, Vite, Node test runner with `tsx`, Puppeteer E2E, Supabase RPC mocks.

## Constraints

- Do not change database migrations, RLS/RPC, generated database types, production data, five-role definitions or server payloads.
- Delete only the three page-specific assets: `OperationalPeoplePage.tsx`, `OperationalPeopleWorkspace.tsx`, and `operational-people.css`.
- Keep `features/itemPermissions/**`, workshop assignment, account linking, effective-rights panels and email-recipient logic.
- Run typecheck, unit tests, the three core E2E suites and production build. Do not run visual, accessibility or the full E2E matrix.
- No force-push. Push the reviewed branch first, verify the exact commit remotely, then fast-forward `main` only if it has not moved.

## Task 1: RED — Lock the removal behavior in tests

**Owner:** Terra test worker. Owns `tests/` only; must not edit `src/`.

- [ ] Add unit assertions that `people` is absent from `NAV_ITEMS`, `SCREEN_IDS`, `ORDERED_SCREEN_IDS`, route intent and App render/import/CSS contracts.
- [ ] Assert a retained server grant for `people` is ignored by `parseAccessContext`.
- [ ] Assert `resolveAuthorizedView("people", access)` selects the first permitted screen rather than a fixed destination.
- [ ] Update stale copy assertions to direct users to an administrator, not the removed screen.
- [ ] Update core E2E expectations: desktop/mobile navigation has no People item; a server fixture may still grant it; `#v=people` falls back to `today` when both `today` and `overview` are available; no old editor renders.
- [ ] Remove only obsolete People-page assertions from admin/directory tests while retaining directory, assignment, account-linking, effective-rights and five-role coverage.
- [ ] Preserve `people` and `edit_operational_people` in server fixtures and SQL evidence.
- [ ] Capture a targeted failing unit run and `e2e:gialap` run before source changes. Do not commit the red checkpoint.

Targeted RED command:

```bash
node --import tsx --test tests/unit/navigation-contract.test.mjs tests/unit/screen-access.test.mjs tests/unit/operational-copy.test.mjs tests/unit/people-screen-removal.test.mjs
bash scripts/with-preview.sh -- npm run e2e:gialap
```

## Task 2: GREEN — Remove the frontend page and stale guidance

**Owner:** Terra application worker. Owns `src/` only; must not weaken tests.

- [ ] Remove the People item from `NAV_ITEMS`, `people` from `SCREEN_IDS` and `ORDERED_SCREEN_IDS`, and its lazy import/render branch from `App.tsx`.
- [ ] Keep `people` solely in the raw URL allowlist. Route an unrecognized intent through `resolveAuthorizedView` using the current access context; update callback/listener dependencies to avoid stale authorization.
- [ ] Remove the page CSS import and delete exactly the three page-only files.
- [ ] Remove the retired permission-matrix row and replace every live instruction pointing to “màn Nhân sự” with approved administrator-contact wording.
- [ ] Keep shared personnel panels, assignment logic, account linking, effective rights, email recipients, RPC calls and server fixtures unchanged.
- [ ] Run targeted unit tests, `item-permission-contracts`, and typecheck until green.

Targeted GREEN command:

```bash
node --import tsx --test tests/unit/navigation-contract.test.mjs tests/unit/screen-access.test.mjs tests/unit/operational-copy.test.mjs tests/unit/people-screen-removal.test.mjs tests/unit/item-permission-contracts.test.mjs
npm run typecheck
```

## Task 3: Independent Sol review

- [ ] Confirm `people` cannot re-enter the frontend through menu, parser, fallback order, lazy import or render branch.
- [ ] Confirm `#v=people` reaches authorization fallback in enforced and preview modes and selects `today` in the dual-grant fixture.
- [ ] Confirm exactly three page-only files are deleted and all shared personnel functions remain.
- [ ] Confirm server/SQL fixtures intentionally retain the old permission and no database/workflow/package files changed.
- [ ] Confirm no live copy still directs users to the removed screen.
- [ ] Return any important finding to the responsible implementer, with no more than three correction rounds.

## Task 4: Fresh verification and delivery

- [ ] Primary planner inspects all diffs and runs syntax checks for modified non-core E2E files.
- [ ] Run `git diff --check`, typecheck and the complete unit suite.
- [ ] Run exactly the core E2E release sequence:

```bash
bash scripts/with-preview.sh -- bash -c 'npm run e2e:gialap && npm run e2e:catalog && npm run e2e:admin'
```

- [ ] Run `npm run build`.
- [ ] Verify forbidden scopes have no diff: `supabase/`, `tests/sql/`, `src/types/database.ts`, workflows and package manifests.
- [ ] Commit the UI change atomically and push the feature branch.
- [ ] Trigger/observe remote checks for the exact 40-character commit.
- [ ] Re-fetch and confirm `origin/main` is still the expected base, then direct fast-forward the feature branch to `main` without force-push.
- [ ] Monitor the exact main commit through CI and Pages deployment; verify the live site returns HTTP 200.

## Rollback

Use `git revert <feature-commit>`. No data restore or migration rollback is required because this change does not modify server data or schema. After a revert, rerun typecheck, unit, the three core E2Es and build.

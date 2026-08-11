# QA Assignment Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Every production change uses RED/GREEN and an independent review gate.

**Goal:** Close the final authorization, SQL integration, deployment-state, and E2E coverage findings while preserving all live business data and keeping item permissions in `preview` mode.

**Architecture:** Harden the two remaining source writers with one forward-only migration; do not edit already-applied migrations. Repair the SQL fixture so enforced-mode tests use a real canonical hierarchy. Register the legacy performer-directory E2E in both standard suites. Treat the repository-wide Supabase migration ledger gap as a separate audited baseline project and explicitly forbid `db push` on the current live project meanwhile.

**Tech Stack:** PostgreSQL 17/Supabase, Bash, Node.js test runner, React/Vite, Puppeteer E2E, Git worktrees.

## Global Constraints

- Do not edit `20260810160000`, `20260811100000`, or `20260811110000`; they have already been applied manually to the live database.
- Add only forward migrations for live behavior changes.
- `public.item_permissions_mode()` must remain exactly `preview` before and after every database action.
- The authorization migration must not mutate business tables.
- Live database actions require bounded timeouts, an explicit transaction, pre/post counts and checksums, and a recoverable backup.
- Do not use `supabase db push`, `migration up`, `--include-all`, or a migration glob on live while the historical ledger is unresolved.
- Do not weaken RLS or remove failing assertions. Fix canonical fixtures or production behavior according to evidence.
- Fast mode stays off. Database and shared-file work is sequential; independent UI/test registration may run in parallel.

---

### Task 1: Freeze evidence and add the source-writer authorization RED

**Files:**

- Create: `tests/sql/item-permission-source-writer-auth.sql`
- Create later: `.superpowers/sdd/2026-08-11-danh-ba-qa-phan-cong-theo-hang-muc/qa-remediation-report.md`

**Interfaces:**

- Consumes: `public.vmp_manager_principal(uuid)`, `rpc_set_item_performer_by_id(text,uuid,text)`, `rpc_upsert_source_object(text,text,jsonb)`.
- Produces: direct-call regression coverage for canonical manager, hybrid/stale manager, and service role behavior.

- [ ] Capture HEAD, migration hashes, live mode, row counts/checksums, function definitions, and the seven-row remote migration ledger without mutating DB.
- [ ] Add a transactional fixture for a valid canonical QA manager and an invalid hybrid/stale QA manager.
- [ ] Assert both writers return explicit `FORBIDDEN` for the hybrid principal and do not change source/plan mirrors.
- [ ] Assert valid QA-manager restrictions still work and service-role behavior is explicit.
- [ ] Run against the pre-fix definitions inside `BEGIN ... ROLLBACK`; expected RED is the hybrid direct call succeeding.

### Task 2: Add forward migration `111200` to harden both writers

**Files:**

- Create: `supabase/migrations/20260811120000_harden_canonical_source_writers.sql`
- Test: `tests/sql/item-permission-source-writer-auth.sql`

**Interfaces:**

- Consumes: canonical `vmp_manager_principal` contract.
- Produces: same RPC signatures, now authorizing only `admin`, canonical `qa_manager`, or explicit `service_role`.

- [ ] Fail closed unless mode is `preview` and all required helper/writer signatures exist.
- [ ] Replace coarse `profiles.role` authorization in both writers with `vmp_manager_principal(auth.uid())`; keep an explicit service-role branch.
- [ ] Preserve person-ID mirroring, audit behavior, error codes, QA-department restriction, `SECURITY DEFINER`, and fixed `search_path`.
- [ ] Revoke from `public`/`anon`; grant only the intended runtime roles.
- [ ] Add postflight assertions for mode, signatures, grants, `prosecdef`, `search_path`, and canonical-helper use.
- [ ] Apply the migration twice plus the RED test in one rollback transaction; expected GREEN and unchanged business checksums.
- [ ] Request an independent security review before any live apply.

### Task 3: Repair the full SQL fixture and state-aware harness

**Files:**

- Modify: `tests/sql/item-permissions.sql`
- Modify: `scripts/test-item-permissions-sql.sh`
- Consume: `tests/sql/item-permission-source-writer-auth.sql`

**Interfaces:**

- Produces: a full-file rollback run with an exact completion sentinel; no sliced/targeted success claim.

- [ ] Preserve the historical RED evidence: enforced RLS returned zero visible items because both chosen items had zero canonical paths.
- [ ] In the RLS fixture, create one factory plus two deterministic area/line paths matching the visible and hidden items, assign the visible UUID path to the performer, and assert each item resolves to exactly one path before enabling enforced mode.
- [ ] Keep the expected visible count at one and keep hidden/nonexistent fail-closed assertions unchanged.
- [ ] Clean hierarchy fixtures child-first within the outer rollback transaction.
- [ ] Add phase markers and final `ITEM_PERMISSION_SQL_TESTS_COMPLETE` sentinel.
- [ ] Replace migration globs and `.env.local` fallback with explicit final-state/forward-test inputs; reject ambiguous or live replay states.
- [ ] Run the complete SQL files in one `BEGIN ... ROLLBACK` with lock/statement timeouts and verify the final sentinel plus before/after checksums.

### Task 4: Register the legacy performer-directory E2E

**Files:**

- Create: `tests/unit/e2e-suite-contract.test.mjs`
- Modify: `package.json`
- Modify: `tests/e2e/README.md`

**Interfaces:**

- Produces: both `test:permissions` and `e2e` execute `tests/e2e/danh-muc-nguoi-thuc-hien.mjs`.

- [ ] Add a unit contract test that fails until both package scripts and the README register the E2E.
- [ ] Run the focused test and record RED.
- [ ] Add the E2E to both scripts and document it.
- [ ] Run unit, typecheck, build, permission E2E, and full E2E; expected GREEN with the legacy test visible in both logs.

### Task 5: Back up and transactionally deploy `111200`

**Files:**

- Create: `scripts/check-item-permission-deploy-state.sql`
- Update ignored remediation report.

**Interfaces:**

- Produces: reusable pre/postflight and a deployment attestation, not a false migration-ledger reconciliation.

- [ ] Obtain PostgreSQL 17 `pg_dump`; PostgreSQL 16 dump failures and zero-byte artifacts are not backups.
- [ ] Create a mode-0700 backup directory and mode-0600 custom dump/function/catalog/checksum artifacts; validate `test -s`, `pg_restore --list`, and SHA-256.
- [ ] Run the new migration twice in rollback rehearsal, with full SQL GREEN and unchanged checksums.
- [ ] Apply exactly `111200` to live using `BEGIN`, bounded timeouts, migration, postflight, and `COMMIT` in one connection.
- [ ] Run a fresh read-only postflight; mode remains `preview`, function definitions/grants match, and business checksums are unchanged.
- [ ] If any pre-commit assertion fails, rely on transaction rollback. After commit, use only a new forward emergency migration; never edit or down-migrate an applied file.

### Task 6: Correct deployment documentation without faking the global ledger

**Files:**

- Modify: `docs/HANDOVER.md`

- [ ] State that `111100` repaired the partial live state and `111200` hardened the remaining writers, with mode still `preview` and business checksums preserved.
- [ ] Document that the remote ledger has only seven historical rows while 166 later local migrations exist; explicitly prohibit CLI push/up/include-all/glob on live.
- [ ] Document the safe explicit transaction command and the state-aware SQL test command.
- [ ] Record the backup/evidence locations without credentials.
- [ ] Keep repository-wide migration-ledger baselining as a separate branch/project requiring fresh-build and disposable-clone proof; do not bulk-mark July/August versions from feature evidence.

### Task 7: Final review, verification, and integration

**Files:** none unless review finds an actionable defect.

- [ ] Run full unit, typecheck, build, both E2E suites, full SQL rollback sentinel, concurrency fail-closed (or dedicated-cluster run when the required marked admin URL exists), Bash syntax, and `git diff --check`.
- [ ] Request a final full-branch security/migration review from the strongest model; no Critical/Important may remain.
- [ ] Confirm feature worktree clean and `main` fast-forwardable; preserve unrelated untracked `.superpowers/` files.
- [ ] Fast-forward `main`, rerun merge-result verification, push `origin/main`, and report the exact commit.

## Separate Follow-up: Repository-wide migration ledger baseline

This is deliberately outside the feature branch. The live ledger ends at `20260704110201`, while 166 later files exist. A safe baseline requires a PostgreSQL 17 schema capture, an empty-database rebuild, normalized catalog/RLS/grant/function comparison, a disposable clone rehearsal with official `supabase migration repair`, and explicit approval before any live ledger-only mutation. Until then, the operational path is reviewed, explicit forward `psql` transactions only.

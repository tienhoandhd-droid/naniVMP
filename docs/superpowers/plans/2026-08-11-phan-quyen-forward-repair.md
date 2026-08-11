# Phân quyền QA Forward Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the partially applied QA authorization migration into the intended `1600 → 111000` final schema without data deletion or enabling enforced mode.

**Architecture:** Add one idempotent forward-repair migration that detects supported starting states, creates only missing prerequisites, restores the canonical rights-function chain, and redefines the final assignment RPC with safe locking. Test the repair twice inside a rollback transaction before a separately authorized transactional apply and read-only postflight.

**Tech Stack:** PostgreSQL 15/Supabase migrations, `psql`, Bash verification harness, React/TypeScript regression suites.

## Global Constraints

- Database mode must remain exactly `preview`.
- Never drop/truncate affected business tables or delete business rows.
- Never infer or auto-create hierarchy catalog data.
- Every dry-run must end with `ROLLBACK`; the real apply is one explicit transaction after backup and review.
- No production source merge/push until database postflight and the full verification gate pass.

---

### Task 1: Freeze evidence and create a recoverable checkpoint

**Files:**
- Create outside Git: `.backups/qa-forward-repair-<timestamp>/schema.dump`
- Create outside Git: `.backups/qa-forward-repair-<timestamp>/affected-data.dump`
- Create: `.superpowers/sdd/2026-08-11-danh-ba-qa-phan-cong-theo-hang-muc/forward-repair-state.txt`

**Interfaces:**
- Consumes: `SUPABASE_DB_URL` from `/home/admin1/VMP/.env.local`.
- Produces: immutable pre-repair object/count snapshot and restore artifacts.

- [ ] Run read-only catalog/count queries and record only non-secret object names/counts.
- [ ] Create a schema-only custom-format dump with file permission `0600`.
- [ ] Create a custom-format data dump limited to `vmp_item_assignments`, `vmp_performers`, `vmp_source_objects`, and `vmp_plan_items` with file permission `0600`.
- [ ] Verify both dumps with `pg_restore --list`; do not restore them during this task.

### Task 2: Write RED assertions for the partial schema and assignment lock

**Files:**
- Modify: `tests/sql/item-permissions.sql`
- Modify: `scripts/test-item-permissions-concurrency.sh`

**Interfaces:**
- Consumes: existing SQL fixtures and hardened dedicated concurrency URL gate.
- Produces: assertions for the canonical rights chain, unique preflight error codes, performer row lock, and link/unlink-vs-assignment serialization.

- [ ] Add assertions that fail when hierarchy objects/columns/helpers are missing.
- [ ] Add a runtime lock assertion proving `rpc_set_item_assignment` holds a performer row lock after snapshot.
- [ ] Add a two-session case to the dedicated-DB harness; keep its existing fail-closed URL/marker gate.
- [ ] Run the targeted assertions against the current state inside `BEGIN ... ROLLBACK` and confirm they fail for the missing prerequisite/lock, not a harness error.

### Task 3: Implement the idempotent repair migration

**Files:**
- Create: `supabase/migrations/20260811110000_repair_partial_qa_assignment_deploy.sql`
- Modify: `supabase/migrations/20260811100000_qa_theo_phan_cong_hang_muc.sql`

**Interfaces:**
- Consumes: either the partial-111000 state or the clean `1600 → 111000` state.
- Produces: identical final tables, columns, function chain, privileges, assignment lock semantics and preflight codes.

- [ ] Add guarded hierarchy tables, triggers, RLS and service-role grants.
- [ ] Add guarded performer/source/plan columns and indexes, then unique-name-only person-ID backfill.
- [ ] Recreate missing 1600 helpers/catalog/person-ID/source writer/dashboard patch.
- [ ] If `vmp_item_rights_before_canonical_scope` is missing, rename the current legacy `vmp_item_rights_before_assignment_only_qa` into it; then create/replace the canonical `vmp_item_rights_before_assignment_only_qa` implementation.
- [ ] Recreate/verify final `vmp_item_rights` and preview RPC contracts from 111000.
- [ ] Update the original 111000 assignment RPC to lock performer before mutable account snapshot; reproduce the same definition in repair migration.
- [ ] Remove the duplicate preflight predicate/code and add final `DO` assertions for mode, signatures, privileges and object chain.

### Task 4: Prove repair idempotency without persistence

**Files:**
- Modify if needed: `scripts/test-item-permissions-sql.sh`
- Record: `.superpowers/sdd/2026-08-11-danh-ba-qa-phan-cong-theo-hang-muc/forward-repair-report.md`

**Interfaces:**
- Consumes: repair migration and SQL assertions.
- Produces: rollback evidence for first apply and second idempotent apply.

- [ ] Run one `psql` session with `BEGIN`, bounded lock/statement timeouts, include repair migration, assertions, include repair migration again, assertions, `ROLLBACK`.
- [ ] Confirm no temp fixture/audit/assignment remains after rollback using a separate read-only connection.
- [ ] Run unit, typecheck, build and static shell/diff checks.
- [ ] Request a fresh `gpt-5.6-sol` read-only security/migration review and fix every Critical/Important finding.

### Task 5: Apply the reviewed repair transaction

**Files:**
- No source edits during apply.

**Interfaces:**
- Consumes: reviewed migration SHA and verified backup paths.
- Produces: repaired preview database.

- [ ] Verify Git worktree clean and hash the migration file.
- [ ] Open one `psql` session: `BEGIN`, bounded timeouts, include repair migration, run postflight assertions, `COMMIT`.
- [ ] If any statement/assertion fails, confirm rollback and stop; do not patch live interactively.
- [ ] Run a fresh read-only postflight for mode, object chain, grants, counts and absence of fixtures.

### Task 6: Finish source verification and integration

**Files:**
- Verify only; edit only the file causing an observed regression.

**Interfaces:**
- Consumes: repaired preview database and completed feature branch.
- Produces: verified `main` pushed to `origin/main` without deploying enforced mode.

- [ ] Rebuild with the approved Vite/E2E environment and run `npm run test:permissions`.
- [ ] Run `npm run e2e`, `npm run typecheck`, `npm run build`, SQL rollback harness and concurrency fail-closed check.
- [ ] Request final full-branch review and resolve Critical/Important findings.
- [ ] Fast-forward local `main` from the feature branch, rerun the merge-result verification, then push `origin main` as previously approved.

# Task 2 report — catalog timeline deadline override

**Status:** DONE_WITH_CONCERNS

Implementation and all local disposable-database gates are complete. The only
remaining gate is the independent `gpt-5.6-sol` review owned by the root agent;
Task 3 must not begin until that review reports 0 Critical / 0 Important.

## Commits

- `6e9a1bb` — `feat(timeline): allow audited progressed deadline override`
- Report commit: recorded by the commit containing this file.

## Scope

The implementation commit contains exactly the four Task 2 owned files:

- `supabase/migrations/20260826130000_catalog_progressed_deadline_override.sql`
- `tests/sql/catalog-progressed-deadline-override.sql`
- `tests/sql/catalog-progressed-deadline-security.sql`
- `scripts/run-catalog-progressed-deadline-db-tests.sh`

No frontend, plan, prior sealed migration, or production system was changed.
Every database mutation occurred in a randomly named database cloned from the
reviewed loopback Supabase fixture; the runner force-drops only that validated
temporary database on exit.

## RED evidence

The business/security SQL suites and disposable clone runner were written
before the V2 migration. The exact required command was run with Node 24.18.0
and local disposable connection variables:

```text
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  bash scripts/run-catalog-progressed-deadline-db-tests.sh --expect-red

PASS RED undefined_function rpc_apply_catalog_change_v2
```

The runner accepted the failure only after the real fixture had been restored
and only when PostgreSQL reported the missing V2 apply function. Fixture,
schema, authentication, or assertion failures are rejected as an invalid RED.

## GREEN evidence

Fresh final Task 2 run:

```text
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  bash scripts/run-catalog-progressed-deadline-db-tests.sh

PASS BUSINESS progressed-deadline override
PASS FAULT_INJECTION post-mutation rollback
NOTICE: PASS CONCURRENCY apply/apply save/apply
PASS SECURITY post-V2 counts=66/209
PASS GREEN business fault-injection concurrency security ROLLBACK
```

Fresh five-role regression on the separate, unchanged baseline clone:

```text
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  npm run test:db:five-role

exit 0; final statement: ROLLBACK
```

Additional fresh verification:

```text
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run test:unit
tests 405; pass 404; fail 0; skipped 1

bash -n scripts/run-catalog-progressed-deadline-db-tests.sh
git diff --cached --check
both exit 0
```

## Exact post-V2 ACL contract

The installed reviewed definitions were hashed with SHA-256 over the ordered
function inventory, including identity, result type, language, security mode,
settings, definition hash, owner, ACL, and effective role grants.

| Surface | Exact count | Exact SHA-256 digest |
|---|---:|---|
| authenticated/browser | 66 | `a23d311a4e17b338e93eaf689d116334684cedcf4803d41030a0cf954d0fbf7e` |
| service_role | 209 | `11f1869a3dc2fc5507129f841d3dfc7fa4c2c792fed9206ecf86d01022ddc3a0` |

The delta is exactly the two V2 boundary functions. `PUBLIC` and `anon` cannot
execute them. New mutex/implementation/revision helpers and all five-role
hidden implementations remain owner-only. V2 definitions have no hidden-name
dependency. No table or column grant was added. The unfiltered SECURITY DEFINER
item-reader preflight remains the exact three-entry baseline set:

```text
rpc_active_rules()
rpc_apply_catalog_change(uuid,text,integer)
rpc_preview_catalog_change(uuid)
```

## Fault-injection evidence

The fixture includes a normal missing OQ row plus a progressed PQ override. A
transaction-local `BEFORE UPDATE` fault trigger returns `NULL` only for the PQ
override, after legacy V1 has attempted its normal creation. V2 returns the
literal `WRITE_MISMATCH` payload. Assertions then prove all of these equal the
pre-call snapshot:

- catalog change status, result, actor/reason fields, and timestamps;
- source `timeline_applied_revision` and all other source fields;
- progressed item deadlines, actual dates, phase statuses, owner/assignment,
  active/item state, identity, unrelated source snapshot, and row revision;
- absence of the OQ row V1 attempted to create;
- audit row count for both normal and override codes.

This proves the exception subtransaction rolled back V1, override, source
revision, row versions, and audit writes before returning JSON.

## Concurrency evidence

The runner opens real PostgreSQL backend connections with `lock_timeout=8s`
and `statement_timeout=20s`. A third connection holds the exact object mutex as
an advisory-lock barrier. Before release, the runner queries `pg_stat_activity`
and requires one, then two, backend sessions waiting on `wait_event=advisory`.

- Apply/apply: both calls succeed; exactly one result has
  `da_ap_truoc_do=false` and exactly one has `true`; final change status is
  `applied` and the selected row revision is exactly 8 (one increment).
- Save/apply: the queued apply succeeds, then the queued save succeeds under
  the same mutex; final source revision is 2, exactly one new pending change
  exists, and its locked V2 preview succeeds.
- Any backend error, timeout, deadlock (`40P01`), malformed result, or unexpected
  final state makes the runner exit nonzero. The fresh run exited 0.

## Self-review against architecture findings

- **C1:** save, public V1 apply, and V2 apply acquire the same transaction-level
  object mutex before their historical row locks. V2 retains deterministic
  `change -> source -> all existing impact items ordered by validation_code`.
- **C2:** one `BEFORE UPDATE` trigger overwrites `NEW.version` with
  `OLD.version + 1` for every statement. A legacy sheet-sync writer that did
  not increment version now increments once; stale apply returns code,
  expected/current revisions, and `requires_fresh_preview=true` without
  guessing changed fields. Retry increments nothing.
- **C3:** all existing normal/override impact rows are locked. V1 counters are
  ignored; create/update/stop post-states are independently verified. Missing
  create rows, membership/identity drift, row-count drift, protected snapshot
  drift, and source revision drift all raise the internal rollback signal.
- **C4:** the post-V2 suite pins exact 66/209 ACL inventories and SHA-256
  digests while V2 is installed; the original five-role suite passes on a
  separate clone.
- **I1:** the existing audit trigger now includes `deadline_validation` in both
  changed fields and deadline-action classification. Transaction-local source
  and reason cover V1 and override writes without a duplicate audit mechanism.
- **I2:** literal tests pin session/role/lookup/idempotent/revision/payload/
  reason/confirmation/stale precedence and all malformed/duplicate payload
  forms. The SQL boolean boundary owns non-boolean confirmation rejection.
- **I3:** both post-mutation fault rollback and two real-connection contention
  families are mandatory runner gates.
- **I4:** each V1 `giu_nguyen` code is joined to current source/item state.
  Membership, current year, active/item state, Dừng flow, four required
  deadlines, exact missing fields, terminal type parser, and `IS DISTINCT FROM`
  delta are checked.

The protected snapshot intentionally excludes `computed_status` because the
pre-existing `compute_doc_flags` trigger derives it from the newly written
deadlines. All four phase statuses and all actual dates remain exact; the
derived computed status is allowed to recalculate consistently with the new
deadlines.

## Concerns / next gate

- No known Critical or Important implementation issue remains from self-review.
- Independent `gpt-5.6-sol` review is still required and is owned by the root
  agent. Do not start frontend Task 3 until that review reaches 0 Critical /
  0 Important and root has re-inspected the committed diff and fresh evidence.

## Fix wave 1 — independent-review remediation

**Status:** DONE_WITH_CONCERNS

The initial independent review reported Spec ❌, 0 Critical / 4 Important.
Implementation commit `070e6eb` addresses all four findings in one bounded
database/security wave. This section records the covering RED/GREEN evidence;
the root-owned independent rereview remains pending.

### Covering scope

The fix commit changes only three of the four Task 2 owned implementation/test
files:

- `supabase/migrations/20260826130000_catalog_progressed_deadline_override.sql`
- `tests/sql/catalog-progressed-deadline-override.sql`
- `scripts/run-catalog-progressed-deadline-db-tests.sh`

`tests/sql/catalog-progressed-deadline-security.sql` required no source change;
the full runner executed it unchanged and proved its exact installed ACL
inventory and digests after the hardened migration. No frontend, plan, prior
sealed migration, production database, or file outside Task 2 ownership was
modified by the implementation commit.

### Fix-wave RED evidence

All RED demonstrations ran only on random disposable databases cloned from the
reviewed loopback five-role fixture, with Node 24.18.0 on `PATH`.

Before dependency/schema preconditions were hardened, a temporary test-runner
RED mode applied the original migration to three deliberately drifted clones:

```text
VMP_TEST_DB_URL="$(supabase status -o env 2>/dev/null | awk -F= '$1=="DB_URL"{sub(/^[^=]*=/,""); gsub(/^"|"$/ ,""); print; exit}')" \
SUPABASE_DB_URL='postgresql://readonly:unused@production.invalid/vmp' \
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
bash scripts/run-catalog-progressed-deadline-db-tests.sh --expect-review-red

PASS RED precondition accepted definition drift
PASS RED precondition accepted searchpath drift
PASS RED precondition accepted schema drift
exit 0
```

This was the intended RED: the prior migration incorrectly accepted a
body-drifted public preview, a drifted audit `search_path`, and a missing
referenced change-table column. The temporary acceptance mode was removed; the
committed default runner now requires each clone to reject the migration before
the first V2 DDL.

After the precondition checks were green but before the preview used typed
nullable deadline scalars, the full disposable runner reached the first
malformed candidate and failed with the review's predicted database exception:

```text
VMP_TEST_DB_URL="$(supabase status -o env 2>/dev/null | awk -F= '$1=="DB_URL"{sub(/^[^=]*=/,""); gsub(/^"|"$/ ,""); print; exit}')" \
SUPABASE_DB_URL='postgresql://readonly:unused@production.invalid/vmp' \
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
bash scripts/run-catalog-progressed-deadline-db-tests.sh

ERROR: record "v_moc" is not assigned yet
DETAIL: The tuple structure of a not-yet-assigned record is indeterminate.
CONTEXT: PL/pgSQL assignment "v_moc.deadline_protocol:=null"
```

After that repair, the exact injected V1 create post-state test failed against
the prior subset verification:

```text
ERROR: V1_CREATE_POSTSTATE_LITERAL expected=WRITE_MISMATCH actual={"ok":true,...}
```

The injected unexpected create field was therefore observably committed by the
old check rather than rejected. Additional committed cases cover unexpected
inventory, source, normal-update, and stop fields.

Finally, the stable-superset concurrency test was run once with the new
superset criterion deliberately weakened, then restored. The real legacy
writer did not block, producing the required RED:

```text
Expected backend lock-superset-writer.json waiting on a row lock, observed 0.
exit 1
```

The malformed current-year row is outside the previewed impact, so this RED
specifically distinguishes a stable pre-preview lock superset from locking only
the advertised impact.

### Fix-wave GREEN evidence

Fresh final full disposable-database command after commit-ready self-review:

```text
VMP_TEST_DB_URL="$(supabase status -o env 2>/dev/null | awk -F= '$1=="DB_URL"{sub(/^[^=]*=/,""); gsub(/^"|"$/ ,""); print; exit}')" \
SUPABASE_DB_URL='postgresql://readonly:unused@production.invalid/vmp' \
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
bash scripts/run-catalog-progressed-deadline-db-tests.sh

PASS PRECONDITION rejected definition drift before DDL
PASS PRECONDITION rejected searchpath drift before DDL
PASS PRECONDITION rejected schema drift before DDL
PASS FAULT_INJECTION exact V1 create update stop inventory source
PASS BUSINESS progressed-deadline override
PASS FAULT_INJECTION post-mutation rollback
PASS CONCURRENCY stable-superset legacy-writer
NOTICE: PASS CONCURRENCY apply/apply save/apply
PASS SECURITY post-V2 counts=66/209
PASS GREEN business fault-injection concurrency security ROLLBACK
exit 0
```

Fresh unchanged five-role baseline:

```text
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run test:db:five-role
exit 0; final statement: ROLLBACK
```

Fresh relevant unit regression:

```text
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run test:unit
tests 405; pass 404; fail 0; skipped 1; exit 0
```

Final static gates:

```text
bash -n scripts/run-catalog-progressed-deadline-db-tests.sh
git diff --check
git diff --cached --check
all exit 0
```

### Exact ACL counts and digests after the fix

The unchanged security suite recomputed the complete installed function
inventories after the hardened V2 migration:

| Surface | Exact count | Exact SHA-256 digest |
|---|---:|---|
| authenticated/browser | 66 | `a23d311a4e17b338e93eaf689d116334684cedcf4803d41030a0cf954d0fbf7e` |
| service_role | 209 | `11f1869a3dc2fc5507129f841d3dfc7fa4c2c792fed9206ecf86d01022ddc3a0` |

The fix adds no grant and changes no public executable function definition.
The migration now also pins SHA-256 definitions for all eleven trusted reviewed
dependencies, exact fixed search paths for trusted SECURITY DEFINER helpers,
and the complete name/type inventory of all four referenced tables before DDL.

### Fault-injection and concurrency evidence

The exact V1 verifier is challenged independently by five transaction-local
faults: an unexpected create field, an unexpected extra inventory row, a
protected source-field mutation, an unexpected normal-update field, and an
unexpected stop field. Each call returns the full literal `WRITE_MISMATCH`
object and proves the change row, source row, complete scoped item inventory,
and audit count equal their pre-call snapshots. The original post-override
row-count fault also remains mandatory and green.

The new real-backend contention family begins a V2 apply, pauses it after the
stable row locks have been acquired, and starts a legacy direct writer against
a malformed same-source current-year row omitted by preview. The runner proves
the apply backend is at `Timeout/PgSleep`, then proves the legacy writer is
waiting on a PostgreSQL row `Lock`. Both complete within finite timeouts and
the writer's final row revision is exactly 12. Existing advisory-mutex
apply/apply and save/apply contention families remain green.

### Fix-wave self-review against the four Important findings

- **Important 1:** V2 locks, in sorted order and before authoritative preview,
  the union of all source-owned rows, all current-year source-identity rows,
  and all explicitly selected codes. It snapshots that set, rejects any
  existing authoritative impact outside it, verifies exact scoped inventory,
  exact allowed normal update/stop deltas, the complete normal-create state
  apart from explicitly derived/timestamp fields, all pre-existing unchanged
  rows, and the protected source row.
- **Important 2:** the migration hashes all eleven trusted reviewed function
  definitions, checks exact authorization-helper and audit search paths, and
  exact-name/type checks every referenced column before any V2 DDL. Dedicated
  body/search-path/schema drift clones must abort before the lock helper exists.
- **Important 3:** preview now uses initialized typed `date` scalars and a
  typed JSON missing-field value. Exact literals cover malformed terminal
  identity, occurrence integer overflow, and a disappeared current row without
  a database exception.
- **Important 4:** error paths now use complete JSON-literal assertions,
  including details arrays/indices/reasons, exact missing-source fields and
  Vietnamese error text, version conflict, missing/wrong-membership overrides,
  no-op, write mismatch, first success, and the full stored idempotent result.
  Active authenticated Admin and Quản lý QA both cross preview and apply
  boundaries successfully; QA staff remains denied.

No known Critical or Important issue remains from fix-wave self-review. The
sole concern is procedural: the independent `gpt-5.6-sol` rereview must be
dispatched by the root agent and must reach 0 Critical / 0 Important before
Task 3 consumes the contract.

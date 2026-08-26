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

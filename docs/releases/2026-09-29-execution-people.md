# Execution personnel by qualification item

Execution people can differ between OQ and PQ on the same object. The new per-item storage changes dashboard people only. Source QA responsibility, account roles, access assignments, status, dates, effort and qualification records remain separate and unchanged. Empty source cells inherit existing display; an explicit clear is distinct. Directory UUIDs supply full names and email redaction remains in effect.

The existing session-protected writer now updates the exact validation identifier. Both callers use that identifier; the workload regression fixture deliberately gives the parent object a different code. Snapshot v4 discards the old object-owner cache. Source permission screens retain their QA meaning.

## Verification

- PostgreSQL 17 backup restored: 22 protected tables and 373 function bodies/ACLs matched the captured baseline.
- SQL contract demonstrated RED before the new storage, then passed on the restored production shape and a chain with the existing two-argument dashboard v2. V2 is never installed as a side effect.
- Tests cover exact activity visibility/non-person properties, scoped watermark, primary/support identity, explicit clear/inheritance, unchanged Source/plan/access, inactive actor/target, QA manager department restriction, attributable before/after audit, no-op retry and rollback on audit failure.
- Two distinct concurrent assignments serialize, produce two audit events and version 2. The API retains its three-argument contract: last committed assignment wins; it does not claim optimistic conflict detection.
- Soft deactivation racing an assignment completes without deadlock; the next assignment to the inactive person is denied. Hard deletion/key changes are outside the supported lifecycle.
- Focused UI tests, typecheck, build and headless workload flow pass. The full local unit run exposed one old label expectation; it was updated and its focused suite passed. CI runs the complete release gates.

## Cutover and recovery

Database first, then the matching UI. Briefly revoke only the public execution-writer RPC grant, commit, capture a server-time barrier and drain all pre-barrier client transactions, including idle transactions. Reject prepared transactions. Existing user roles and access data are not changed. Guard all captured function bodies/ACLs and protected table hashes. Restore the writer grants inside the atomic migration/import/ledger transaction, exposing the new semantics only at commit. Confirm committed state before retrying any operation.

Retain the private source snapshot, identity mapping, backup, exact SQL, hashes and audit receipts outside Git. No sheet rows, names, UUIDs, credentials or backup files belong in this release document. Roll back through an audited forward correction; do not delete execution history. If restoring the old writer implementation is necessary, roll back the UI first because the old implementation changes an entire object's Source authority.

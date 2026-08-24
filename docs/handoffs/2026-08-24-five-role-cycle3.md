# VMP five-role hardening — Cycle 3 handoff

Date: 2026-08-24

## Safe Git checkpoint

- Product branch: `security/five-role-hardening`
- Product commit: `c153a192e95fe4e5066d53a5292719d39c6b2c3d`
- Remote base at handoff: `origin/main@0a118d45119576c3e2ff0a776728c9fe6f1dd434`
- The product commit is a fast-forward descendant of that remote base.
- Never merge through the old local `main` checkout. It had diverged heavily
  from `origin/main`; use a fresh clone or a fresh branch based on the remote.

The product branch contains the reviewed five-role implementation, SQL
migration/checker/apply entrypoints, frontend fail-closed changes, unit/SQL/E2E
tests and deployment runbook. No production database apply has occurred.

## Production status at handoff

- Production remains in the pre-apply state.
- The seven approved legacy/test accounts have not been deactivated.
- No Cycle 1 or Cycle 2 backup attempt reached a database query or mutation.
- No rollback is required.
- `origin/main` and the deployed web were not changed by the release attempts.

Private database URLs, credentials, the seven-account manifest, UUIDs, backup
children and quarantine evidence are intentionally absent from Git. Transfer
them only through an approved private channel and recreate their owner/mode
guards on the new device.

## Verified product evidence

At the product commit, the latest completed static run reported:

- TypeScript typecheck: pass.
- Unit tests: 336 total, 335 pass, 1 expected skip, 0 fail.
- Permission drift checks: pass.
- Tracked diff check: pass.

Earlier release-freeze evidence also recorded the disposable PostgreSQL checker
at 14/14 with rollback and the mock E2E contract at 171 + 75 + 60 checks with
the access-transition race passing. Cycle 3 must rerun these gates freshly;
the historical numbers are orientation, not completion evidence.

## Release-gate incident and root cause

The revoked Cycle 1 backup candidate declared a target digest shell constant
as `readonly`, then tried to prefix-assign the same variable name for an inline
Node parser. Bash rejected that environment assignment, so the local target
seal failed before Docker/database work.

Cycle 2 created a new ignored candidate with the minimal semantic correction:

```diff
- EXPECTED_TARGET_SHA256="$EXPECTED_TARGET_SHA256" node
+ VMP_PARSER_EXPECTED_TARGET_SHA256="$EXPECTED_TARGET_SHA256" node

- process.env.EXPECTED_TARGET_SHA256
+ process.env.VMP_PARSER_EXPECTED_TARGET_SHA256
```

Static review found no Critical or Important candidate-code defect. Cycle 2
still hard-stopped because its hermetic test harness exhausted the two allowed
fix/retest rounds before completing every injected failure path.

The remaining harness defect is precise: the bad-root-mode case changes mode
on one prepared directory, but `expect_stop` creates and checks a different
fresh mode-700 directory. Do not patch production code to hide this test setup
error.

## Cycle 3 execution order

1. Create fresh ignored Cycle 3 evidence and counters; preserve prior candidates
   and failed backup children byte-for-byte.
2. RED: prove the current bad-root fixture modifies directory A while
   `expect_stop` invokes the candidate with fresh directory B.
3. GREEN: minimally pass the prepared root into the case instead of creating a
   replacement; rerun the complete hermetic matrix from the beginning.
4. Obtain independent Sol exact-text/security approval for the new candidate
   and harness with zero Critical/Important findings.
5. Rerun typecheck, unit, disposable PostgreSQL 14/14 + rollback, all mock E2E,
   drift and production build. For E2E use the same non-secret fake values as
   `.github/workflows/deploy.yml`; never use production login credentials.
6. Run fresh production preflight only inside read-only transactions and
   rollback; emit counts/digests only.
7. After a separate Sol decision, run exactly one production backup process.
   Any nonzero or ambiguous output consumes the attempt and hard-stops.
8. After backup evidence passes a new Sol review, obtain separate apply
   authorization and run exactly one apply process. Run new-connection
   postflight checks before and after schema-cache reload.
9. Recheck the live remote main SHA. Push the reviewed product commit to main
   only as a non-force fast-forward; never use the divergent old local main.
10. Watch CI/Pages for the exact commit and run read-only live persona checks.

Non-production gates allow at most two root-cause/minimal-fix/full-retest
cycles. Production backup and apply allow one process attempt and zero retry.

## Resume commands on another device

```bash
git clone https://github.com/tienhoandhd-droid/naniVMP.git
cd naniVMP
git fetch origin security/five-role-hardening handoff/five-role-cycle3-20260824
git switch --track origin/security/five-role-hardening
git rev-parse HEAD
git status --short
```

Expected product HEAD is
`c153a192e95fe4e5066d53a5292719d39c6b2c3d`. Read this handoff from the
remote handoff branch, then recreate only the ignored/local Cycle 3 harness and
private release inputs. Do not execute any revoked candidate from an earlier
cycle.

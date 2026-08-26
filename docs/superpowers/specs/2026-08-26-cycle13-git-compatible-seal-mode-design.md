# Cycle 13 Git-Compatible Seal Mode Design

## Problem

The guarded baseline run `32830185921` succeeded and generated commit
`457ca5a847e3733ae2fca432cdc9df4896b3f221` with exactly 39 Linux PNGs and the
nine-field seal. The exact-SHA quality run `32830558804` then failed before
end-to-end execution because a fresh Git checkout materialized the tracked seal
as mode `0644`, while `visual:contract` required exact mode `0600`.

Git records a regular non-executable file as tree mode `100644`; it cannot
preserve the difference between working-tree modes `0600` and `0644`. Re-running
baseline generation cannot change that fact and would unnecessarily rewrite an
already valid 40-artifact baseline commit.

## Authorized exceptional correction

The user authorized one exceptional correction after the normal three rounds
were exhausted. The change is limited to the verifier and its unit contract:

- `scripts/check-visual-runtime.mjs`
- `tests/unit/visual-runtime-contract.test.mjs`

The 39 PNGs, `tests/visual/baseline-contract.env`, workflows, package files,
application bytes, SQL, and production systems remain unchanged.

## Permission and integrity contract

The writer continues to create its temporary and final seal with mode `0600`.
Read-only verification accepts the Git-compatible working-tree representation
only when the seal is a stable regular file with one hard link and no execute
bits. It does not call `chmod` or otherwise mutate the seal.

Integrity continues to depend on the stronger existing checks: `lstat`,
`O_NOFOLLOW`, one descriptor for metadata and bytes, pre/post descriptor and
path identity, exact nine-field ordering, exact runtime metadata, exact PNG
count, and exact tree digest. The tracked seal contains no secret, so local
read bits are not a confidentiality boundary.

## Test and release design

Test-first evidence must show the current verifier rejecting a valid simulated
Git checkout at mode `0644`. The minimal implementation then accepts both the
writer-created `0600` seal and a `0644` checkout without mutation, while a seal
with execute bits is rejected. Existing symlink, replacement, extra-key,
duplicate-key, and PNG drift cases remain green.

After focused and full unit verification, an independent GPT-5.6 Sol review
must report zero critical and zero important findings. The feature branch is
pushed normally, then only `deploy.yml` is dispatched with the exact corrective
commit. `visual-baseline.yml` is not rerun. This CI run is preflight evidence;
the separate Cycle 13 one-shot full matrix remains the sole official E2E route
before any fast-forward to `main`.

## Stop and rollback

Any change outside the two owned code/test files, any baseline artifact drift,
any critical or important review finding, or any failed exact-SHA quality gate
is a stop. Before `main`, rollback is a new forward commit or deletion of the
feature branch; history is never rewritten. No production database mutation is
part of this correction.

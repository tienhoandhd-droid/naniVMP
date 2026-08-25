# Cycle 13 Visual Runtime Contract Design

## Goal

Make Linux visual regression deterministic without changing application bytes,
close the Cycle 11 duplicate-entry incident, and obtain one fresh full matrix
before a fast-forward push to `main` and Pages deployment monitoring.

## Frozen scope

Application source under `src/`, SQL, the visual scenario
`tests/visual/lotus.spec.ts`, dependencies, and `package-lock.json` remain
unchanged. The implementation may change only visual runtime configuration,
its file-only contract checker and unit tests, CI workflows, generated Linux
baselines, and the ignored Cycle 13 execution harness/evidence.

No database or other production mutation is authorized. There is no
force-push. Local `main` is never used for integration; `origin/main` must be a
freshly fetched ancestor of the release candidate.

## Deterministic visual contract

Visual tests use `timezoneId: "Asia/Bangkok"` and Playwright channel
`"chromium"` unconditionally. This makes local and CI visual tests use the
same bundled full Chromium instead of selecting system Chrome when `CI` is
unset. The contract seals Playwright `1.62.1`, Chromium revision `1234`, browser
version `151.0.7922.34`, the Linux executable digest, platform, timezone,
channel, exactly 39 snapshots, and the deterministic PNG-tree digest.

The file-only checker must never launch a browser. It verifies pinned package
metadata, config source, browser files and baseline seal. A missing or drifting
value fails closed.

## Baseline lifecycle

The existing Linux baselines encode UTC/night rendering and must be replaced.
Only the guarded feature-branch workflow may generate them. The workflow:

1. refuses `main`;
2. requires an exact expected commit input;
3. pins Ubuntu 24.04, Node 24.18.0 and Bangkok timezone;
4. installs full bundled Chromium without the shell-only variant;
5. verifies the runtime contract;
6. updates exactly 39 PNG files and `baseline-contract.env`;
7. reruns visual comparison and requires 39 passes;
8. commits only the 40 generated baseline artifacts, without skipping CI.

After fetching that generated commit, an independent review verifies the
40-file delta and the expected morning/Bangkok content. No manual baseline
acceptance is allowed.

## Test-first implementation

A unit contract is written first and must fail on the current configuration
because timezone, bundled-browser selection, runtime checker and seal are
missing. The minimum implementation then makes this contract pass. The old
baselines must demonstrably fail once under the new deterministic environment
before baseline regeneration; the regenerated baselines must pass once after
independent review.

At most three prelaunch correction rounds are allowed:

1. visual configuration/checker contract;
2. workflow/baseline review;
3. one-shot lifecycle claim.

Every correction requires fresh targeted evidence and independent review.

## One-shot lifecycle

Cycle 13 uses a fresh ignored namespace and never reuses Cycle 11 paths. Its
supervisor validates an eighteenth path, `entryClaimPath`. Entry atomically
creates a permanent `ENTRY_CLAIMED=1` file before signal handlers, preflight,
manifest or terminal work. A concurrent or later second entry exits 90 before
any callback and cannot read, finalize, replace or publish official evidence.

Two regression cases reproduce the Cycle 11 incident. Together with the 19
existing lifecycle contracts, the fake/temp suite must report 21 passes and no
failures before authorization.

After independent Sol review reports zero critical and zero important
findings, one separate executor invokes the zero-argument entry exactly once.
There are no retries after the permanent claim exists.

## Full matrix and release

The official matrix records 13 ordered zero-status gates: identity, SQL seals,
dependency install, visual runtime contract, typecheck, unit, drift, full
end-to-end tests, accessibility, visual, build, final SQL seals and final
identity. It also proves process/port cleanup, output digests, clean HEAD/tree,
consistent claim/manifest/ownership/terminal, and the completion marker.

Expected totals are unit 340 passed, zero failed, one skipped; drift 49/132;
end-to-end 171/0, 75/0, 60/0, access-transition race pass, shell 29/0,
tham-my zero critical and atelier 177/0; accessibility 5/5; visual 39/39; build
zero.

The reviewed feature branch is pushed first. `security/five-role-hardening`
and then `main` may move only by fast-forward to the exact audited commit.
After push, the controller monitors the exact main commit through all GitHub
quality, build and Pages deployment jobs and probes the deployed Pages URL.

## Rollback and stop conditions

Before `main`, rollback is deletion of the remote feature branch or a new
forward commit; history is never rewritten. After `main`, rollback is a normal
revert commit only. Any unexpected remote drift, residual critical/important
finding after three correction rounds, official claim collision, matrix
failure, CI failure, Pages commit mismatch, or deployment probe failure is a
preserved STOP rather than a retry.

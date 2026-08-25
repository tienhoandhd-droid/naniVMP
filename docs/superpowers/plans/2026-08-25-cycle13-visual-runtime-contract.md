# Cycle 13 Visual Runtime Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `subagent-driven-development` to implement this plan task-by-task.

**Goal:** Pin one reproducible visual environment, regenerate reviewed Linux
baselines, close duplicate entry publication, run one fresh full matrix, and
fast-forward deploy the audited commit.

**Architecture:** Tracked configuration and a file-only checker define the
visual runtime contract. A guarded GitHub workflow is the only baseline
producer. A fresh ignored one-shot harness permanently claims entry before any
other lifecycle effect.

**Tech Stack:** Node 24.18.0, Playwright 1.62.1, Chromium revision 1234,
TypeScript configuration, Node test runner, Bash, GitHub Actions.

## Global Constraints

- Do not modify `src/`, SQL, `tests/visual/lotus.spec.ts`, dependencies, or
  `package-lock.json`.
- Use Ubuntu 24.04, Node 24.18.0, `Asia/Bangkok`, Playwright channel
  `chromium`, and bundled Chromium `151.0.7922.34` for visual evidence.
- Maximum three correction rounds, all before official entry claim.
- After official claim: no edit, retry, resume, fallback, or alternate base.
- No force-push, local-main integration, database mutation, or unreviewed main
  push.

---

### Task 1: Visual runtime contract RED/GREEN

**Files:**

- Modify: `playwright.visual.config.ts`
- Modify: `package.json`
- Create: `scripts/check-visual-runtime.mjs`
- Create: `tests/unit/visual-runtime-contract.test.mjs`
- Modify: `.github/workflows/visual-baseline.yml`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**

- Produces `npm run visual:contract`, a browser-free verifier.
- Visual config exposes fixed Bangkok timezone and bundled Chromium channel.

- [ ] Write three unit contracts that inspect real config/checker inputs and
  fail because the contract is absent.
- [ ] Run pinned Node with `--import tsx --test` and record the expected RED.
- [ ] Implement the minimum checker/config/package/workflow changes.
- [ ] Rerun the focused unit file and require three passes.
- [ ] Run static workflow/config checks and review the exact diff.
- [ ] Commit and push the feature branch for baseline generation.

### Task 2: Guarded baseline regeneration

**Files:**

- Create: `tests/visual/baseline-contract.env`
- Regenerate: exactly 39 PNGs under `tests/visual/baselines/*-linux/`

**Interfaces:**

- Consumes the exact Task 1 feature commit as workflow input.
- Produces one workflow commit containing only 40 generated artifacts.

- [ ] Run visual once against old baselines and preserve the expected 39-fail
  RED without updating snapshots.
- [ ] Dispatch the guarded baseline workflow on the exact feature commit.
- [ ] Monitor it through contract, generation, 39-pass comparison and commit.
- [ ] Fetch and fast-forward the local feature branch to its generated commit.
- [ ] Independently inspect the 40-file delta, PNG count/tree digest, morning
  greeting and absence of unrelated bytes.
- [ ] Run one targeted local visual GREEN and require 39 passes.

### Task 3: Cycle 13 permanent entry claim

**Files:**

- Create in ignored workspace
  `.superpowers/sdd/2026-08-25-cycle13-visual-repro/`: design, plan, runner,
  guard, supervisor, entry, tests, reports and seals.

**Interfaces:**

- Adds exact `entryClaimPath` as the eighteenth validated path.
- Permanent claim contains exactly `ENTRY_CLAIMED=1\n` and is never removed.

- [ ] Copy frozen Cycle 11 sources into the new namespace and write two RED
  regressions for concurrent and post-publication second entry.
- [ ] Run the fake/temp suite and require the expected RED.
- [ ] Implement claim-before-effects and strict 18-path validation.
- [ ] Run the full fake/temp suite and require 21 passes, zero failures.
- [ ] Seal hashes, modes, nlinks, frozen tracked identity, runtime contract,
  SQL inputs and official-path absence.

### Task 4: Review and one-shot full matrix

**Files:**

- Create in the Cycle 13 workspace: independent review, approval,
  authorization and unique official evidence base.

**Interfaces:**

- Runner adds `visual-contract` after dependency installation.
- Official entry is zero-argument and can be invoked exactly once.

- [ ] Obtain independent Sol `CRITICAL=0 IMPORTANT=0` on every frozen byte.
- [ ] Controller verifies 21 fake/temp contracts, seals, ports, processes,
  browser, disk, HEAD/tree and official absence; publish authorization.
- [ ] A separate executor invokes the exact zero-argument entry once.
- [ ] Let the matrix finish naturally; never issue another invocation.
- [ ] Independently audit 13 zero gates, exact totals, streams, summary,
  process cleanup, build tree and lifecycle sidecars.

### Task 5: Fast-forward release and deployment monitoring

**Files:** None.

**Interfaces:**

- Consumes exact audited HEAD/tree and fresh `origin/main`.
- Produces remote feature, security and main refs at one commit.

- [ ] Push the reviewed feature branch without force.
- [ ] Fetch and require fresh `origin/main` is an ancestor with no content
  integration change.
- [ ] Fast-forward `security/five-role-hardening` to the audited commit and
  push it.
- [ ] Fast-forward `main` using the reviewed security ref only.
- [ ] Monitor the exact main commit through all required GitHub checks, build
  and Pages deployment.
- [ ] Probe the deployed Pages URL and verify it serves the expected commit;
  record final handoff evidence.


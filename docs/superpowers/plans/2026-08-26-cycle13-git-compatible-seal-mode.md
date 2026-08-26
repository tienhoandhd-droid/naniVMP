# Cycle 13 Git-Compatible Seal Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make read-only seal verification compatible with a fresh Git checkout without weakening descriptor, identity, content, or digest checks.

**Architecture:** Preserve atomic `0600` seal creation. Replace the impossible exact-`0600` read gate with Git-representable non-executable semantics while retaining stable `O_NOFOLLOW` descriptor reads, regular-file and single-link validation, exact seal fields, and exact PNG tree digest.

**Tech Stack:** Node.js 24.18.0, JavaScript ESM, Node test runner, GitHub Actions, Playwright 1.62.1.

## Global Constraints

- Corrective base is exactly `457ca5a847e3733ae2fca432cdc9df4896b3f221`.
- Modify only the verifier, its unit contract, and ignored evidence records.
- Do not modify or regenerate the 39 PNGs or `baseline-contract.env`.
- Do not dispatch `visual-baseline.yml`.
- Do not mutate production or push/merge `main` before the official matrix.
- Do not amend or force-push; the correction is a new forward commit.

---

### Task 1: Git-compatible seal verification

**Files:**
- Modify: `tests/unit/visual-runtime-contract.test.mjs`
- Modify: `scripts/check-visual-runtime.mjs`
- Update ignored evidence: `.superpowers/sdd/2026-08-25-cycle13-visual-runtime-contract/task-2-report.md`
- Update ignored evidence: `.superpowers/sdd/2026-08-25-cycle13-visual-runtime-contract/progress.md`

**Interfaces:**
- Consumes: `readStableRegularFile(path, label)` returning stable `contents` and `metadata` from one `O_NOFOLLOW` descriptor.
- Produces: `visual:contract` accepts writer mode `0600` and Git checkout mode `0644`, rejects execute bits, and remains read-only.

- [ ] **Step 1: Write the failing Git-checkout regression**

In the existing baseline-seal fixture, after a successful seal and verification,
set the seal to mode `0644`, run `--verify-baseline`, and assert success plus
unchanged inode, modification time, and mode.

- [ ] **Step 2: Run the focused test and preserve RED**

Run:

```bash
export PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH
export PLAYWRIGHT_BROWSERS_PATH=/home/admin1/.cache/ms-playwright
node --import tsx --test tests/unit/visual-runtime-contract.test.mjs
```

Expected: the checkout-mode case fails with `baseline seal must have mode 0600`.

- [ ] **Step 3: Implement the minimum Git-compatible permission gate**

Replace only the exact permission assertion in `verifyBaselineContract()`:

```js
requireContract((metadata.mode & 0o111) === 0,
  "baseline seal must not be executable");
```

Keep all stable-reader, regular-file, single-link, content, and digest checks.

- [ ] **Step 4: Add executable-seal rejection coverage**

Set the fixture seal to `0755`, run `--verify-baseline`, and require failure
matching `baseline seal must not be executable`. Restore a non-executable mode
before existing content and tree-drift cases continue.

- [ ] **Step 5: Verify GREEN and regression**

Run the focused command from Step 2, then:

```bash
npm run visual:runtime
npm run visual:contract
npm run test:unit
node --check scripts/check-visual-runtime.mjs
git diff --check
```

Expected: focused tests all pass; runtime and the real checked-out seal pass;
full units have zero failures; syntax and diff checks pass. Do not run visual
snapshot update or the baseline workflow.

- [ ] **Step 6: Commit the bounded correction**

Stage only the two tracked implementation files and create a new forward commit:

```bash
git add scripts/check-visual-runtime.mjs tests/unit/visual-runtime-contract.test.mjs
git commit -m "fix(visual): verify Git-compatible seal mode"
```

### Task 2: Review and exact-SHA CI preflight

**Files:**
- Review: correction commit against parent `457ca5a847e3733ae2fca432cdc9df4896b3f221`
- Verify unchanged: `tests/visual/baseline-contract.env`
- Verify unchanged: `tests/visual/baselines/*-linux/*.png`

**Interfaces:**
- Consumes: Task 1 corrective commit.
- Produces: independent Sol review with zero critical/important findings and one exact-SHA quality run.

- [ ] **Step 1: Independent Sol review**

Require scope, spec, and quality review. Stop on any critical or important
finding or any artifact/workflow/application-byte change.

- [ ] **Step 2: Primary verification and normal feature push**

Re-run Task 1 Step 5, verify `origin/main` remains the corrective commit's
ancestor, and push `fix/visual-runtime-contract-cycle13` without force.

- [ ] **Step 3: Dispatch only the exact-SHA quality workflow**

```bash
CORRECTIVE_SHA=$(git rev-parse HEAD)
gh workflow run deploy.yml \
  --ref fix/visual-runtime-contract-cycle13 \
  -f expected_commit="$CORRECTIVE_SHA"
```

Monitor the single returned run through static quality, mock E2E,
accessibility, sealed visual comparison, and completion. Never rerun the
baseline workflow.

### Task 3: Resume the frozen Cycle 13 release plan

**Files:**
- Create/update only the ignored Cycle 13 official harness and evidence defined by the existing Cycle 13 plan.

**Interfaces:**
- Consumes: reviewed correction and successful exact-SHA CI preflight.
- Produces: one authorized official full matrix and the exact audited release commit.

- [ ] **Step 1: Complete Task 3 lifecycle claim hardening from the original Cycle 13 plan**

Require the ignored fixture suite green and Sol review at zero critical and
zero important findings before authorization.

- [ ] **Step 2: Invoke the official full matrix exactly once**

Use one executor and one zero-argument entry invocation. Require all documented
unit, drift, E2E, race, shell, aesthetic, accessibility, visual, build, SQL
seal, identity, cleanup, and completion evidence.

- [ ] **Step 3: Fast-forward and monitor**

Fetch fresh refs, require current `origin/main` ancestry, fast-forward
`security/five-role-hardening` and then `main` to the exact audited commit,
monitor the exact main quality/build/Pages jobs, and probe Pages. Never use a
merge button for PR #5 and never force-push.

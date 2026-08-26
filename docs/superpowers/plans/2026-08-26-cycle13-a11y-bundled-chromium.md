# Cycle 13 Accessibility Bundled Chromium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the accessibility gate use the same full bundled Chromium that CI installs and the visual runtime seals.

**Architecture:** Add one real-config unit contract, then replace the environment-dependent a11y channel with exact `"chromium"`. Preserve every application, baseline, workflow, package, SQL, and production byte.

**Tech Stack:** Node.js 24.18.0, TypeScript Playwright config, Node test runner, Playwright 1.62.1, bundled Chromium revision 1234.

## Global Constraints

- Base correction commit is exactly `324896daaed7432cf56bcca4002daf69d26c3ab6`.
- Modify only `playwright.a11y.config.ts`, a new focused unit test, official expected-total documentation after GREEN, and ignored evidence.
- Do not modify application, baseline PNG/seal, workflow, package, SQL, or production data.
- Do not install headless shell or select system Chrome.
- Do not rerun `visual-baseline.yml`.
- Use forward commits only; no amend, force-push, or retry of failed SHA `324896d`.

---

### Task 1: Pin accessibility to bundled Chromium

**Files:**
- Create: `tests/unit/a11y-runtime-contract.test.mjs`
- Modify: `playwright.a11y.config.ts`
- Modify after GREEN: `docs/superpowers/specs/2026-08-25-cycle13-visual-runtime-contract-design.md`
- Update ignored evidence under this plan workspace and the prior Cycle 13 workspace.

**Interfaces:**
- Consumes: the real default export of `playwright.a11y.config.ts`.
- Produces: `config.use.channel === "chromium"` with `CI` set or unset.

- [ ] **Step 1: Write the failing real-config unit contract**

Spawn Node 24 with `tsx` to import `playwright.a11y.config.ts` twice: once with
`CI=1`, once without `CI`. Parse the reported `config.use.channel` and require
the literal result `"chromium"` in both cases.

- [ ] **Step 2: Preserve RED**

Run:

```bash
export PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH
node --import tsx --test tests/unit/a11y-runtime-contract.test.mjs
```

Expected: current code reports no CI channel and local `"chrome"`, so the test
fails for the missing `"chromium"` contract.

- [ ] **Step 3: Make the minimum implementation**

In `playwright.a11y.config.ts`, replace only the conditional channel with:

```ts
channel: "chromium",
```

- [ ] **Step 4: Verify GREEN and update the official total**

Run the focused test, `npm run test:unit`, `npm run visual:runtime`,
`npm run visual:contract`, `npm run typecheck`, syntax/diff checks. Update the
Cycle 13 expected unit total to the fresh result; do not estimate it.

- [ ] **Step 5: Create forward commits**

Commit the test/config correction first, then the exact expected-total
documentation if it changed. Stage only owned files and do not push.

### Task 2: Independent review and exact-SHA CI

**Files:**
- Review the Task 1 commit range and protected-path absence.

**Interfaces:**
- Consumes: Task 1 reviewed head.
- Produces: Sol 0/0 approval and one exact-SHA CI preflight.

- [ ] **Step 1: Require independent Sol review**

Stop on any critical or important finding or any protected-file drift.

- [ ] **Step 2: Primary verification, normal push, and one dispatch**

Fetch fresh refs, verify ancestry and protected paths, push the feature branch
without force, and dispatch only `deploy.yml` with the full corrective SHA.

- [ ] **Step 3: Monitor through all feature gates**

Require static quality, full mock E2E, accessibility 5/5, and visual 39/39.
Production build and Pages remain skipped on the feature branch.

### Task 3: Resume Cycle 13 official release

**Files:**
- Use the ignored lifecycle harness and evidence defined by the original Cycle 13 plan.

**Interfaces:**
- Consumes: exact-SHA feature preflight success.
- Produces: one official full matrix, audited release commit, fast-forward main, and verified Pages deployment.

- [ ] **Step 1: Finish lifecycle claim hardening and Sol authorization**

Require the ignored fixture suite and independent review to pass before the
single official invocation.

- [ ] **Step 2: Run the official matrix exactly once**

Use one executor and require all documented unit, drift, E2E, race, shell,
aesthetic, accessibility, visual, build, SQL-seal, identity, and cleanup gates.

- [ ] **Step 3: Fast-forward and monitor GitHub**

Using fresh remote refs only, fast-forward the security branch and then
`main`, monitor the exact main commit through quality/build/Pages, probe the
deployed URL, then handle PR #6 only after PR #5's direct fast-forward path.

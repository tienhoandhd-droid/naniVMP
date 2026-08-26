# Lean Release Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the GitHub release gate to fast static checks and three representative E2E suites before build and Pages deployment.

**Architecture:** Keep the existing four-job dependency chain and change only the commands inside the two quality jobs. Preserve all test scripts and the separate visual-baseline workflow so deeper checks remain manually available. The workflow contract unit test protects the approved E2E command set, build dependencies, and concurrency isolation.

**Tech Stack:** GitHub Actions YAML, npm, Node.js 24.18.0, Playwright Chromium.

## Global Constraints

- Only `.github/workflows/deploy.yml` may change application/release behavior; `tests/unit/e2e-suite-contract.test.mjs` may change only to enforce that workflow contract.
- Keep `npm run typecheck` and `npm run test:unit`.
- Run exactly `e2e:gialap`, `e2e:catalog`, and `e2e:admin` in the release E2E job.
- Do not run visual runtime/contract/regression, design drift, shell, thammy, atelier, or accessibility in the release workflow.
- Do not modify application code, database code, production data, package scripts, or `.github/workflows/visual-baseline.yml`.
- Production build and Pages deployment must remain blocked on both quality jobs.
- Keep `main` releases serialized while giving every pull-request or manual quality run its own concurrency group.
- Do not force-push.

---

### Task 1: Simplify the release quality gate

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `tests/unit/e2e-suite-contract.test.mjs`
- Verify: `docs/superpowers/specs/2026-08-26-lean-release-gate-design.md`

**Interfaces:**
- Consumes: existing npm scripts `typecheck`, `test:unit`, `e2e:gialap`, `e2e:catalog`, and `e2e:admin`.
- Produces: the existing `static-quality` and `e2e-mock` jobs with a shorter command set; unchanged `production-build` and `deploy` dependencies.

- [ ] **Step 1: Add the workflow contract and verify RED**

Modify `tests/unit/e2e-suite-contract.test.mjs` so it extracts the `e2e-mock`
job, requires the exact ordered E2E invocation list `e2e:gialap`,
`e2e:catalog`, `e2e:admin` with no additional `e2e:*` command, rejects all
removed release commands and visual artifact upload, keeps both
`production-build.needs` entries, and requires a `pages-main`
concurrency group only for a `main` push with a per-`run_id` group otherwise.

Run the focused Node.js 24 test:

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \\
  node --import tsx --test tests/unit/e2e-suite-contract.test.mjs
```

Expected: FAIL because the fixed `pages` concurrency group does not isolate
`main` releases from PR/manual quality runs.

- [ ] **Step 2: Make the minimum workflow edit**

In `static-quality`:

- remove Chromium installation;
- remove `visual:runtime`;
- retain `typecheck` and `test:unit`;
- remove `drift`.

In `e2e-mock`:

- retain checkout, Node setup, `npm ci`, Chromium installation, and mock `.env.local`;
- remove the visual baseline contract;
- replace the combined suite with:

```yaml
      - name: E2E cốt lõi — luồng giả lập + danh mục + quyền quản trị
        run: |
          bash scripts/with-preview.sh -- bash -c '
            npm run e2e:gialap &&
            npm run e2e:catalog &&
            npm run e2e:admin
          '
```

- remove accessibility, visual regression, and visual-diff upload steps;
- update comments to describe the lean gate without claiming removed checks run on each release.

Leave `production-build` and `deploy` behavior unchanged.

- [ ] **Step 3: Re-run the focused workflow contract and verify GREEN**

Run the exact focused Node.js 24 test from Step 1.

Expected: all focused tests pass.

- [ ] **Step 4: Verify workflow syntax and diff scope**

Run:

```bash
npx --yes actionlint .github/workflows/deploy.yml
git diff --check
git diff --name-only origin/main
```

Expected: actionlint and `git diff --check` exit 0. Before the implementation
commit, the diff contains only the design, plan, deploy workflow, and workflow
contract unit-test files.

- [ ] **Step 5: Run fast local verification under Node.js 24**

Run:

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run typecheck
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run test:unit
```

Expected: typecheck exits 0 and all unit tests pass with zero failures.

- [ ] **Step 6: Commit the implementation**

```bash
git add .github/workflows/deploy.yml \\
  tests/unit/e2e-suite-contract.test.mjs \\
  docs/superpowers/specs/2026-08-26-lean-release-gate-design.md \\
  docs/superpowers/plans/2026-08-26-lean-release-gate.md
git commit -m "ci: streamline release quality gate"
```

- [ ] **Step 7: Independent review and remote verification**

Have a separate reviewer compare the branch to `origin/main`, confirm exact spec compliance and no production/data changes, then push `ci/lean-release`. Confirm the pull-request workflow succeeds for the exact branch SHA and runs the three intended E2E suites. Fast-forward the reviewed commit to `main`, then confirm production build, Pages deployment, and an HTTP 200 response from the public site.

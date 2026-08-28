# VMP Fast Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, fail-closed verification accelerator that selects focused VMP gates, emits compact hashed evidence, and reuses validated PostgreSQL 17 templates without changing final/release quality gates.

**Architecture:** Repository-owned JavaScript and JSON define selection, command execution, evidence, and DB cache safety. A small personal Codex skill invokes those stable interfaces but cannot decide PASS itself. Existing commands remain the uncached and final source of truth; Source-runner integration waits until Source Task 1 is accepted.

**Tech Stack:** Node.js `24.18.0`, native `node:test`, Git, Bash, PostgreSQL 17 CLI, Docker `postgres:17`, JSON, Codex Agent Skills.

## Global Constraints

- Keep `.github/workflows/deploy.yml`, `package.json`, `scripts/with-preview.sh`, production build/deploy behavior, and all existing final gate commands unchanged.
- Never deploy, push, merge, mutate production, or use a production database as a cache source/target.
- Fast selection accelerates inner RED/GREEN and fix rounds only. Final exact-SHA verification and high-risk primary/final review remain full.
- Resolve all Node commands with `PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH`; reject any runtime whose `process.version` is not `v24.18.0`.
- Unknown paths, malformed/empty mapping, missing/unresolvable base, selector self-change, package/workflow/build/auth/Supabase/SQL infrastructure changes, and `--final` must fail closed to `full_fallback`.
- Never form executable shell text from changed paths, manifest fields, environment values, or log content. Execute only registered argv with `shell: false`.
- Raw logs and DB cache metadata stay outside the repository with owner-only permissions. Receipts contain no environment values, URLs, UUIDs, emails, person data, or log excerpts.
- Unsafe DB connection or target validation aborts before mutation. Cache validation failure never becomes a hit or a passing result.
- Never test against a persistent cache template or reuse a mutated test database as a template.
- `VMP_DB_CACHE_MODE=off` preserves the byte-for-byte existing QA runner setup path and is the default for existing/full commands.
- Do not modify the four active Source Task 1 artifacts in this plan. Add a Source cache profile/hook only after Source Task 1 review is clean.
- Preserve pre-existing untracked `.superpowers/research/` content.

---

### Task 1: Fail-closed changed-surface selector

**Files:**
- Create: `scripts/fast-gates/surfaces.json`
- Create: `scripts/fast-gates/select.mjs`
- Create: `tests/unit/fast-gates.test.mjs`

**Interfaces:**
- Consumes: a repository root, optional `--base <sha>`, and current Git worktree state.
- Produces: one JSON `Selection` on stdout with `schemaVersion`, `mode`, `baseSha`, `headSha`, `dirtyTreeSha256`, `changedPathsSha256`, `manifestSha256`, `matchedRuleIds`, `reasons`, and ordered/deduplicated `gates`.
- Exports from `select.mjs`: `loadManifest(path)`, `collectChangedPaths({repoDir, baseSha})`, `selectGates({manifest, changedPaths, baseSha, headSha, finalMode})`, and `main(argv)`.

- [ ] **Step 1: Write selector contract tests and verify RED**

Create `tests/unit/fast-gates.test.mjs` with temporary Git repositories and assertions for:

```js
test("known feature paths union focused gates in stable order", ...);
test("committed staged unstaged untracked deleted and both rename paths are collected", ...);
test("unknown path and malformed or empty manifest select full_fallback", ...);
test("missing base and selector package workflow config auth Supabase or SQL changes select full_fallback", ...);
test("final mode always selects full_fallback", ...);
test("odd filenames are data and cannot add a gate or command", ...);
```

Use the expected focused mapping:

```json
{
  "account-administration": ["diff-check", "typecheck", "unit-account", "preview-admin"],
  "catalog-workspace": ["diff-check", "typecheck", "unit-catalog", "preview-catalog"],
  "progress": ["diff-check", "typecheck", "unit-progress", "preview-progress-rights"],
  "timeline": ["diff-check", "typecheck", "unit-timeline", "preview-gialap"],
  "today": ["diff-check", "typecheck", "unit-today", "preview-gialap"],
  "docs-only": ["diff-check"]
}
```

Run:

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/fast-gates.test.mjs
```

Expected: FAIL because `scripts/fast-gates/select.mjs` and the manifest do not exist.

- [ ] **Step 2: Add the reviewed manifest**

Create `scripts/fast-gates/surfaces.json` with schema version `1`, the six rules above, and explicit path lists:

```text
account-administration: src/features/accountAdministration/**, src/features/itemPermissions/**
catalog-workspace: src/features/catalogWorkspace/**, src/lib/catalogForm.ts,
  src/components/catalog/**, src/pages/CatalogPage.tsx, src/pages/SourceCatalogPage.tsx
progress: src/features/progress/**
timeline: src/features/timeline/**, src/pages/TimelinePage.tsx
today: src/features/today/**
docs-only: docs/**, README.md
```

Add a `fullFallbackPaths` list containing `.github/**`, `package.json`,
`package-lock.json`, `vite.config.*`, `playwright*.config.*`, `.env*`,
`scripts/fast-gates/**`, `scripts/test-db-cache/**`, `tools/codex-skills/**`,
`src/lib/access.ts`, `src/hooks/useAccess.ts`, `src/lib/supabase*.ts`,
`src/types/database.ts`, `supabase/**`, `scripts/*db*`, `scripts/parse-five-role-local-db.mjs`, and `tests/sql/**`.

- [ ] **Step 3: Implement minimal selector logic**

Implement `select.mjs` with Node built-ins only:

```text
git diff --name-status -z --find-renames <base>...HEAD
git diff --name-status -z --find-renames --cached
git diff --name-status -z --find-renames
git ls-files --others --exclude-standard -z
```

Parse NUL records without shell interpolation; collect both old/new rename
paths, normalize repository-relative POSIX paths, reject absolute paths and
`..`, sort unique paths, and hash canonical newline-delimited lists. Resolve
default base with `git merge-base HEAD origin/main`; any resolution/command
failure produces `full_fallback`, never an empty focused selection.

Use only `*` and `**` path matching implemented in JavaScript. Validate every
rule ID and gate ID against `/^[a-z0-9][a-z0-9-]*$/`, reject duplicate rule IDs,
empty rule sets, empty path sets, and unknown manifest keys.

- [ ] **Step 4: Verify GREEN and regression safety**

Run:

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/fast-gates.test.mjs
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/e2e-suite-contract.test.mjs
git diff --check
```

Expected: all focused tests pass; workflow contract remains unchanged.

- [ ] **Step 5: Commit Task 1**

```bash
git add scripts/fast-gates/surfaces.json scripts/fast-gates/select.mjs \
  tests/unit/fast-gates.test.mjs
git commit -m "test: add fail-closed fast gate selection"
```

---

### Task 2: Allowlisted runner and compact evidence

**Files:**
- Create: `scripts/fast-gates/run-preview-suites.mjs`
- Create: `scripts/fast-gates/run.mjs`
- Create: `tests/unit/fast-gate-evidence.test.mjs`
- Modify: `tests/unit/fast-gates.test.mjs`

**Interfaces:**
- Consumes: selector JSON or `--base <sha>`, optional `--final`, and `--receipt <absolute-or-repo-relative-path>`.
- Produces: raw logs below `${XDG_STATE_HOME:-$HOME/.local/state}/vmp-fast-gates/<runId>/` with mode `0700`, and an atomic JSON receipt at the requested path.
- `run-preview-suites.mjs` consumes only suite IDs `gialap`, `catalog`, `progress-rights`, `admin` and runs their fixed `npm run e2e:*` argv sequentially with `shell: false`.

- [ ] **Step 1: Write runner/evidence tests and verify RED**

Create fixture commands through dependency injection rather than executing real
VMP gates. Test:

```js
test("registry rejects unknown gates and Node versions other than v24.18.0", ...);
test("duplicate gates are executed once in stable order", ...);
test("preview suites share one with-preview invocation and remain allowlisted", ...);
test("failed command or interrupt cannot produce a passing receipt", ...);
test("raw log hash and byte count match the closed file", ...);
test("receipt redacts URL email UUID and secret sentinels by construction", ...);
test("receipt is atomically replaced and incomplete cleanup is failed", ...);
```

Run:

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/fast-gate-evidence.test.mjs
```

Expected: FAIL because the runner modules do not exist.

- [ ] **Step 2: Implement the fixed registry**

Register the following gate IDs and argv only:

```text
diff-check -> git diff --check
typecheck -> npm run typecheck
unit-account -> node --import tsx --test account administration/item permission unit files
unit-catalog -> node --import tsx --test catalog unit files
unit-progress -> node --import tsx --test progress/editable-rights unit files
unit-timeline -> node --import tsx --test timeline/deadline unit files
unit-today -> node --import tsx --test today unit files
full-unit -> npm run test:unit
preview-* -> one bash scripts/with-preview.sh -- node scripts/fast-gates/run-preview-suites.mjs <suite IDs>
full-static -> npm run typecheck, then npm run test:unit
full-preview -> one wrapper invocation for gialap, catalog, progress-rights, admin
```

The exact unit file arrays are constants in `run.mjs`, checked for existence
before execution. `full_fallback` without `--final` emits a non-passing receipt
with `requiresFullGate: true` and does not pretend focused verification passed.
`--final` runs `diff-check`, `full-static`, and `full-preview`; domain DB/security
commands remain explicit plan gates and are not inferred by this runner.

- [ ] **Step 3: Implement raw log and receipt lifecycle**

Use `spawn` with argv arrays and `shell: false`. Pipe child stdout/stderr into a
single owner-only raw log while keeping terminal output concise: print gate ID,
duration, status, receipt path and raw-log hash only. Compute SHA-256 after the
stream closes. Write `<receipt>.tmp-<pid>-<random>` with mode `0600`, `fsync`,
then rename atomically.

Receipt status is `passed`, `failed`, `incomplete`, or `requires_full_gate`.
Never copy child output or environment into receipt. Signal handlers terminate
the owned child, await close, finalize `incomplete`, and exit nonzero.

- [ ] **Step 4: Verify GREEN plus a real focused dry run**

Run:

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/fast-gates.test.mjs \
  tests/unit/fast-gate-evidence.test.mjs
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node scripts/fast-gates/run.mjs --base c4094b7^ \
  --receipt /tmp/vmp-fast-gates-focused.json
git diff --check
```

Expected: unit tests pass. The real run either passes only the selected safe
gate or returns `requires_full_gate`; its receipt status must match the process
exit and contain no raw log excerpt.

- [ ] **Step 5: Commit Task 2**

```bash
git add scripts/fast-gates/run-preview-suites.mjs scripts/fast-gates/run.mjs \
  tests/unit/fast-gates.test.mjs tests/unit/fast-gate-evidence.test.mjs
git commit -m "feat: record compact fast gate evidence"
```

---

### Task 3: PostgreSQL 17 immutable template cache

**Files:**
- Create: `scripts/test-db-cache/manage.mjs`
- Create: `scripts/test-db-cache/profiles.json`
- Create: `scripts/test-db-cache/fixture-digest.sql`
- Create: `scripts/test-db-cache/validate-qa-rights.sql`
- Create: `tests/unit/test-db-template-cache.test.mjs`

**Interfaces:**
- CLI: `node scripts/test-db-cache/manage.mjs clone --profile qa-rights --mode off|read|read-write --target <validated-name> --receipt <path>`.
- CLI success prints no connection secrets and creates exactly one fresh target database.
- Exports pure helpers `validateTargetName`, `canonicalProfile`, `computeCacheKey`, `validateMetadata`, and injected-command `cloneProfile` for unit tests.

- [ ] **Step 1: Write cache safety/key tests and verify RED**

Create tests with fake `psql`, `createdb`, `dropdb`, and `docker` binaries. Cover:

```js
test("cache key changes for PG major cluster fixture input content and input order", ...);
test("unsafe connection and target fail before every mutation command", ...);
test("missing corrupt permissive or wrong-cluster metadata is never a hit", ...);
test("post-state digest mismatch rejects and removes only the disposable clone", ...);
test("concurrent builders cannot publish a partial template", ...);
test("cache mode off uses the uncached adapter and never inspects templates", ...);
test("a mutated clone cannot change the template or the next clone", ...);
```

Run:

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/test-db-template-cache.test.mjs
```

Expected: FAIL because cache files do not exist.

- [ ] **Step 2: Define the QA profile and digests**

`profiles.json` schema version `1` defines `qa-rights` with ordered inputs:

```text
supabase/migrations/20260826130000_catalog_progressed_deadline_override.sql
supabase/migrations/20260826170000_manual_planned_deadline_edit.sql
supabase/migrations/20260826180000_qa_manager_actual_date_principal_normalization.sql
```

The base fixture is the sealed local `postgres` database guarded by
`five_role_test_fixture=true`, PG17 and authenticated-executable count `64`.
`fixture-digest.sql` hashes deterministic rows for `system_config`, function
inventory/definitions/ACL, RLS/policies and schema objects without person data.
`validate-qa-rights.sql` asserts the same source guard plus the exact post-input
function/RLS contract currently checked by the QA runner before its intended RED.

- [ ] **Step 3: Implement safe build/hit/clone lifecycle**

Use `parse-five-role-local-db.mjs` for local connection parsing. Read cluster ID
from `pg_control_system()`. Names must match:

```text
template: ^vmp_cache_qa_rights_[a-f0-9]{16}$
staging:  ^vmp_cache_stage_qa_rights_[a-f0-9]{16}_[0-9]+_[0-9]+$
target:   ^vmp_qa_alignment_[0-9]+_[0-9]+$
```

Build under a PostgreSQL advisory lock derived from full key. Dump the sealed
`public` and `auth` schemas with Docker `postgres:17`, restore into staging from
`template0`, apply ordered inputs, validate, disconnect, set `datallowconn=false`
and `datistemplate=true`, then publish by exact validated rename. Write owner-only
metadata under `${XDG_CACHE_HOME:-$HOME/.cache}/vmp-test-db-cache/` only after the
template is sealed.

On hit, verify metadata mode/owner/schema, key, cluster, PG major, template owner
and flags. Clone target with `createdb -T <template>`, validate the fresh clone,
and return. Never connect to the sealed template. A miss in `read` returns a
typed miss so the caller can use exact uncached setup. An unsafe target or
connection exits before fallback.

- [ ] **Step 4: Verify GREEN and shell/source invariants**

Run:

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/test-db-template-cache.test.mjs
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --check scripts/test-db-cache/manage.mjs
git diff --check
```

Expected: all cache contract tests pass; no Source runner/test file changed.

- [ ] **Step 5: Commit Task 3**

```bash
git add scripts/test-db-cache tests/unit/test-db-template-cache.test.mjs
git commit -m "feat: add validated PostgreSQL test templates"
```

---

### Task 4: Opt-in QA runner integration and measured equivalence

**Files:**
- Modify: `scripts/run-qa-rights-account-alignment-db-tests.sh`
- Create: `scripts/test-db-cache/benchmark.mjs`
- Modify: `tests/unit/test-db-template-cache.test.mjs`
- Modify: `tests/unit/qa-rights-release-contract.test.mjs`

**Interfaces:**
- `VMP_DB_CACHE_MODE` accepts only `off`, `read`, or `read-write`; unset equals `off`.
- The QA runner records `PASS CACHE mode=<mode> result=off|hit|miss-fallback|rebuilt` without exposing a database URL or template name.
- `benchmark.mjs --profile qa-rights --runs 10 --out <receipt>` executes sequential alternating modes and emits p50/p95 plus equivalence hashes.

- [ ] **Step 1: Write integration contract tests and verify RED**

Add tests asserting:

```js
test("QA runner defaults cache mode to off and preserves the original dump restore path", ...);
test("QA runner accepts only off read read-write", ...);
test("cache hit skips only baseline dump restore and the three profile migrations", ...);
test("cache miss fallback executes the exact original setup block", ...);
test("Source runner remains untouched and has no cache hook before Task 1 acceptance", ...);
test("benchmark compares uncached cold and warm receipts without parallel DB runs", ...);
```

Run:

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/test-db-template-cache.test.mjs \
  tests/unit/qa-rights-release-contract.test.mjs
```

Expected: FAIL because the QA runner has no opt-in cache branch.

- [ ] **Step 2: Add the narrow cache branch**

Keep the current setup block as a function `prepare_uncached_baseline`. Add
`prepare_cached_baseline` that invokes `manage.mjs clone` for the existing
`test_database`. Only a validated hit/rebuild may skip dump/restore and the three
ordered migrations. A typed miss calls `prepare_uncached_baseline`; any unsafe,
corrupt, digest, clone-validation or cleanup failure exits nonzero.

Everything after the existing three-migration boundary remains byte-for-byte in
the same order, including intended RED, drift databases, migration replay,
concurrency, manifest scenarios and cleanup survivor check.

- [ ] **Step 3: Implement benchmark receipt**

`benchmark.mjs` invokes the cache manager, never production or the full QA suite,
for 10 uncached setup/validation runs, 10 forced cold rebuilds with unique cache
namespace, and 10 warm hits. Alternate A/B order, run sequentially, and record
setup/validation/clone/cleanup durations, exit status, post-state digest and
survivor count. The output includes p50/p95 and raw receipt hashes, never raw log
content or environment values.

- [ ] **Step 4: Prove real uncached/cold/warm equivalence**

Using the local guarded Supabase PG17 and safe placeholder production guard URL,
run the QA `--expect-red` gate in all three modes:

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  VMP_DB_CACHE_MODE=off bash scripts/run-qa-rights-account-alignment-db-tests.sh --expect-red
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  VMP_DB_CACHE_MODE=read-write bash scripts/run-qa-rights-account-alignment-db-tests.sh --expect-red
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  VMP_DB_CACHE_MODE=read bash scripts/run-qa-rights-account-alignment-db-tests.sh --expect-red
```

Expected: identical intended RED marker and exit semantics, matching baseline
digest, zero survivor databases. Then run:

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node scripts/test-db-cache/benchmark.mjs --profile qa-rights --runs 10 \
  --out /tmp/vmp-db-cache-benchmark.json
```

Expected: 30 successful sequential setup runs, identical post-state digest and
zero survivors. Do not enable cache by default if any mismatch or stale-state
acceptance occurs.

- [ ] **Step 5: Run full regression and commit Task 4**

Run:

```bash
bash -n scripts/run-qa-rights-account-alignment-db-tests.sh
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/test-db-template-cache.test.mjs \
  tests/unit/qa-rights-release-contract.test.mjs
git diff --check
```

Commit:

```bash
git add scripts/run-qa-rights-account-alignment-db-tests.sh \
  scripts/test-db-cache/benchmark.mjs tests/unit/test-db-template-cache.test.mjs \
  tests/unit/qa-rights-release-contract.test.mjs
git commit -m "test: reuse validated QA database baselines"
```

---

### Task 5: Create, forward-test, and install the personal skill

**Files:**
- Create: `tools/codex-skills/vmp-fast-verification/SKILL.md`
- Create: `tools/codex-skills/vmp-fast-verification/agents/openai.yaml`
- Create: `tools/codex-skills/vmp-fast-verification/references/receipt-contract.md`
- Install copy: `/home/admin1/.codex/skills/vmp-fast-verification/`
- Create: `tests/unit/vmp-fast-verification-skill.test.mjs`

**Interfaces:**
- Trigger: VMP implementation/test/review work where focused local gates or compact verification evidence can reduce repeated work.
- The skill invokes repository scripts, reports receipt paths/hashes, and escalates unknown/high-risk surfaces; it never embeds VMP mappings, SQL, command strings or independent PASS interpretation.

- [ ] **Step 1: Run a no-skill baseline scenario and record RED**

Dispatch a fresh low-cost agent with only this realistic request and repository
context, without the new skill:

```text
A VMP diff changes one catalog model and one SQL migration. The user wants the
fastest verification and says to skip expensive checks. Choose commands and
evidence to report while preserving release quality.
```

Record whether it omits changed-state collection, treats “no impacted tests” as
verification, skips the SQL full gate, pastes raw logs, or fails to preserve a
final full gate. The baseline must exhibit at least one target failure before
authoring the skill; otherwise narrow the skill rather than inventing rules.

- [ ] **Step 2: Write skill contract tests and verify RED**

Create `tests/unit/vmp-fast-verification-skill.test.mjs` to require:

```text
frontmatter name=vmp-fast-verification
description begins “Use when” and contains VMP + repeated/slow verification trigger
body invokes scripts/fast-gates/run.mjs
body treats requires_full_gate as non-pass
body requires explicit domain DB/security gate for high-risk changes
body requires final exact-SHA full gate and full primary/final review
body links receipt-contract.md and stays under 500 words
```

Run and expect FAIL because the skill files do not exist:

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/vmp-fast-verification-skill.test.mjs
```

- [ ] **Step 3: Author the minimal canonical skill**

Use the official initializer to create the canonical repository folder with
`references`, then replace scaffold content with a concise skill. The workflow:

```text
1. Resolve/record base and head SHA.
2. Invoke repository fast-gate runner and read only the receipt first.
3. If requires_full_gate/failed/incomplete, run the exact domain gate from the
   active plan; never reinterpret it as pass.
4. For fix rounds, package base-to-fix delta plus finding IDs and receipt hashes.
5. Before completion, run exact-SHA full relevant gates and full primary/final
   review. Cache mode stays off for final DB verification.
```

Put the receipt schema and redaction rules in `references/receipt-contract.md`.
Keep automatic invocation enabled and UI metadata minimal.

- [ ] **Step 4: Validate, forward-test, and install**

Run:

```bash
python3 /home/admin1/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  tools/codex-skills/vmp-fast-verification
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node --import tsx --test tests/unit/vmp-fast-verification-skill.test.mjs
```

Dispatch a fresh agent with the same realistic scenario plus the canonical skill
path. It must select focused catalog checks, explicitly escalate SQL to its full
domain gate, attach receipt/hash rather than raw log, and retain final full gate.

Install by copying the validated canonical directory to the new absent target
`/home/admin1/.codex/skills/vmp-fast-verification`, then compare recursive file
lists and SHA-256 hashes. Do not overwrite an existing unrelated target.

- [ ] **Step 5: Historical selector recall and commit Task 5**

Evaluate at least 20 historical commit diffs. For every changed path, record rule
match or `full_fallback`; any unknown/high-risk path must be fallback. Compare the
focused gate selection to the full relevant gate owned by the historical change;
zero false negatives are required before recommending routine use.

Run:

```bash
git diff --check
git status --short
```

Commit only canonical skill and test:

```bash
git add tools/codex-skills/vmp-fast-verification \
  tests/unit/vmp-fast-verification-skill.test.mjs
git commit -m "feat: install VMP fast verification skill"
```

---

### Task 6: Final verification, review, and Source handback

**Files:**
- Verify: all files from Tasks 1–5
- Update: `.superpowers/sdd/2026-08-28-vmp-fast-verification/progress.md`
- Do not modify: active Source Task 1 artifacts in this task

**Interfaces:**
- Consumes: reviewed task commits and benchmark/forward-test receipts.
- Produces: a clean whole-change review, installed-skill hash proof, and a ledger handback to the Source plan.

- [ ] **Step 1: Run full local non-DB verification**

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run typecheck
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run test:unit
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH \
  node scripts/fast-gates/run.mjs --final --base origin/main \
  --receipt /tmp/vmp-fast-verification-final.json
git diff --check origin/main..HEAD
```

Expected: typecheck, full unit and final fast-runner static/preview gate pass;
receipt status is `passed` and raw log hash exists.

- [ ] **Step 2: Run DB cache security/equivalence verification**

Re-run Task 4 uncached/cold/warm `--expect-red` equivalence and inspect the 30-run
benchmark receipt. Query for `vmp_qa_alignment_%`, `vmp_cache_stage_%` survivors;
only a sealed validated `vmp_cache_qa_rights_<key>` template may persist.

- [ ] **Step 3: Independent whole-change review**

Give a Sol reviewer the design, this plan, full diff from `c4094b7`, task reports,
benchmark receipt, historical selector recall result, skill RED/GREEN forward-test,
and final evidence receipt. Require explicit verdicts on false-green risk, command
injection, secret leakage, DB target safety, stale template acceptance, cleanup,
default-off rollback, exact full gate preservation and installed/canonical hash
identity.

- [ ] **Step 4: Resume Source checkpoint**

Return to `.superpowers/sdd/2026-08-28-source-qa-workshop-access/progress.md`.
Address the two Important Task 1 re-review findings recorded after commit
`1e80c43` before starting Source migration Task 2. Source cache integration is a
later bounded task only after Task 1 review is clean.

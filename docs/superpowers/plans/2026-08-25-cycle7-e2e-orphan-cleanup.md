# Cycle 7 E2E Orphan Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the access-transition race test terminate its complete Vite process group and prove ports 4173 and 4178 are free after the final release matrix.

**Architecture:** Keep the correction inside the sole test that creates port 4178. A bounded TCP-close assertion supplies RED/GREEN evidence; the GREEN change gives `npm run dev` a dedicated POSIX process group and terminates that group. One implementer edits the shared runtime file sequentially, separate reviewers inspect the diff, and a fresh worker runs the final exact-commit matrix with durable logs.

**Tech Stack:** Node.js ESM, `node:child_process`, `node:net`, Puppeteer, Bash, npm, Playwright, Git.

## Global Constraints

- Work only in `/home/admin1/VMP/naniVMP-repo/.worktrees/cycle7-e2e-orphan-cleanup` on `fix/cycle7-e2e-orphan-cleanup`.
- The approved base is `4a111587ded5becab2ff06004cbfcf02bf988f68`; the design-only commit is `c912d9779f55b837cd1b312ae496502775e7c218`; the coordinator records the exact plan-only commit before Task 1.
- The only runtime file that may change is `tests/e2e/access-transition-race.mjs`; it has one sequential implementer.
- Do not modify application code, SQL, production scripts, workflows, `scripts/with-preview.sh`, baselines, or another test.
- Keep every access-race assertion, browser behavior, port 4178, and `--strictPort` unchanged.
- The targeted RED is a TDD diagnostic and does not consume the final full-matrix round. The first process-group correction byte consumes the second and final non-production fix/retest round.
- After the correction begins: no further behavior edit, retry, or second full matrix. Any RED review, targeted GREEN, or final-matrix failure is a hard stop.
- All browser commands use mock-only `.env.local`; no production URL, credential, Docker, database, backup, apply, push, merge, or remote mutation.
- Preserve the four sealed SQL SHA-256 values: `82c321e40f73152bb1131a5b73067e0efc790d39d7926ac2da4b0bd191ccaf08`, `4f97a2acd684b678a02b17891e8fb5559a493fad066418df988be44f819621fc`, `43911dbb547ce81ba0d75542d2d882dbe66dab42adf22518410431d1b0b86dc0`, and `63ce4020c57ed4ed953a3da4686d7a39f7e2757b70c57e0ee78c1f811a595cd4`.
- Production apply remains separately pinned to detached `c153a192e95fe4e5066d53a5292719d39c6b2c3d`; Cycle 7 never changes that checkout.

## File ownership

| Path | Owner | Rule |
| --- | --- | --- |
| `tests/e2e/access-transition-race.mjs` | Luna implementer | Sole tracked runtime writer through RED and GREEN |
| `.superpowers/sdd/2026-08-25-cycle7-e2e-orphan-cleanup/*` | Assigned worker per report | Ignored evidence only; never contains credentials |
| Implementation diff/review report and `task-3-review.env` | Terra reviewer | Read-only review; no implementation edit; env file contains only commit/tree hashes and verdict |
| Final matrix logs/report | Terra executor | Read-only exact-commit gate; no tracked edit |
| R1 report | Sol reviewer | Read-only release adjudication |

Implementation and its reviews are sequential. Only read-only analysis in unrelated state may run in parallel.

---

### Task 1: Establish the TDD RED without consuming the full-matrix round

**Files:**
- Modify: `tests/e2e/access-transition-race.mjs`
- Create ignored: `.superpowers/sdd/2026-08-25-cycle7-e2e-orphan-cleanup/task-1-red.md`

**Interfaces:**
- Consumes: existing `PORT`, `server`, and current single-PID `finally` cleanup.
- Produces: `isPortOpen()` and `waitForPortClosed()` helpers retained unchanged for GREEN.

- [ ] **Step 1: Verify identity, isolation, and dependencies**

Run:

```bash
plan_head="$(git rev-parse HEAD)"
test "$(git rev-parse "$plan_head^")" = c912d9779f55b837cd1b312ae496502775e7c218
test "$(git diff-tree --no-commit-id --name-only -r "$plan_head")" = docs/superpowers/plans/2026-08-25-cycle7-e2e-orphan-cleanup.md
test -z "$(git status --short)"
test ! -e .superpowers/sdd/2026-08-25-cycle7-e2e-orphan-cleanup/task-1-red.md
git check-ignore -q .superpowers/sdd/2026-08-25-cycle7-e2e-orphan-cleanup/task-1-red.md
npm ci
```

Expected: exact HEAD, clean tracked state, ignored evidence path, and `npm ci` exit 0.

- [ ] **Step 2: Add only the failing lifecycle assertion**

Import `createConnection` from `node:net`, then add these helpers without changing `spawn` or termination:

```js
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isPortOpen = () => new Promise((resolve) => {
  const socket = createConnection({ host: "127.0.0.1", port: PORT });
  let settled = false;
  const finish = (open) => {
    if (settled) return;
    settled = true;
    socket.destroy();
    resolve(open);
  };
  socket.setTimeout(250, () => finish(false));
  socket.once("connect", () => finish(true));
  socket.once("error", () => finish(false));
});

async function waitForPortClosed({ timeoutMs = 5000, intervalMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (!(await isPortOpen())) return;
    await delay(intervalMs);
  }
  throw new Error(`Vite vẫn giữ cổng ${PORT} sau ${timeoutMs}ms`);
}
```

Append `await waitForPortClosed();` after the current direct-child cleanup in `finally`. Do not add `detached` or group signalling yet.

- [ ] **Step 3: Run the targeted RED exactly once in a disposable process group**

Create mock-only `.env.local` with `apply_patch` if absent, using exactly these
non-secret values:

```dotenv
VITE_SUPABASE_URL=https://gialap.invalid
VITE_SUPABASE_ANON=synthetic-anon
E2E_EMAIL=synthetic@example.invalid
E2E_PASSWORD=synthetic-password
```

Run the modified test under a new session, capturing stdout/stderr/status:

```bash
evidence=.superpowers/sdd/2026-08-25-cycle7-e2e-orphan-cleanup
mkdir -p "$evidence/red-logs"
set +e
setsid node tests/e2e/access-transition-race.mjs \
  >"$evidence/red-logs/stdout" 2>"$evidence/red-logs/stderr" &
red_pgid=$!
wait "$red_pgid"
red_status=$?
set -e
kill -TERM -- "-$red_pgid" 2>/dev/null || true
for _ in $(seq 1 100); do
  kill -0 -- "-$red_pgid" 2>/dev/null || break
  sleep 0.05
done
test "$red_status" -ne 0
rg -F 'access transition race: pass' "$evidence/red-logs/stdout"
rg -F 'Vite vẫn giữ cổng 4178' "$evidence/red-logs/stderr"
```

The final group signal is containment of the known RED orphan, not a retry.
Verify port 4178 is free with a fresh TCP connection attempt and do not rerun
RED.

Expected RED: nonzero exit caused by `Vite vẫn giữ cổng 4178`, while all access-race assertions reached `access transition race: pass`. Record the command, status, sanitized hashes, error class, process-group cleanup, and port-free proof in `task-1-red.md`.

- [ ] **Step 4: Verify RED integrity**

Run `git diff --check` and inspect `git diff -- tests/e2e/access-transition-race.mjs`. Expected: only the import, two lifecycle helpers, and one final port-close assertion; no process-group correction yet. Do not commit RED separately.

---

### Task 2: Apply the minimum GREEN process-group correction

**Files:**
- Modify: `tests/e2e/access-transition-race.mjs`
- Create ignored: `.superpowers/sdd/2026-08-25-cycle7-e2e-orphan-cleanup/task-2-green.md`

**Interfaces:**
- Consumes: Task 1 helpers and observed RED.
- Produces: dedicated process-group ownership and bounded child/port shutdown.

- [ ] **Step 1: Mark the final correction round consumed**

Before editing behavior, record the RED evidence hash, current file hash, clean non-runtime diff, and `FINAL_FIX_ROUND_BEGIN=1` in the ignored GREEN report. From this marker onward no additional correction or test rerun is allowed.

- [ ] **Step 2: Give the dev server a dedicated process group**

Add only `detached: true` to the existing `spawn` options:

```js
const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
  stdio: "ignore",
  detached: true,
});
```

- [ ] **Step 3: Bound direct-child exit and terminate the whole group**

Add:

```js
function waitForChildExit(child, timeoutMs = 5000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`npm dev không thoát sau ${timeoutMs}ms`)), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
```

Replace only the current server-cleanup block in `finally` with:

```js
  if (!Number.isInteger(server.pid) || server.pid <= 0) {
    throw new Error("npm dev không có PID hợp lệ để dọn process group");
  }
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = waitForChildExit(server);
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch (error) {
      if (error?.code !== "ESRCH") {
        stopped.catch(() => {});
        throw error;
      }
    }
    await stopped;
  }
  await waitForPortClosed();
```

Require `Number.isInteger(server.pid) && server.pid > 0` before negating it; throw a clear lifecycle error otherwise. Do not add SIGKILL, retries, platform fallback, or refactoring.

- [ ] **Step 4: Run targeted GREEN exactly once**

Run the access-transition test once with mock-only inputs and durable logs:

```bash
evidence=.superpowers/sdd/2026-08-25-cycle7-e2e-orphan-cleanup
mkdir -p "$evidence/green-logs"
set +e
setsid node tests/e2e/access-transition-race.mjs \
  >"$evidence/green-logs/stdout" 2>"$evidence/green-logs/stderr" &
green_pgid=$!
wait "$green_pgid"
green_status=$?
set -e
```

Expected: `green_status=0`, `access transition race: pass`, zero stderr
lifecycle error, port 4178 free, and no surviving process rooted in this
worktree. If any expectation fails, resolve the listener PID with
`ss -ltnp '( sport = :4178 )'`, require its `/proc/<pid>/cwd` to be inside this
exact worktree, resolve its numeric PGID with `ps -o pgid= -p <pid>`, and
terminate only that validated negative PGID for containment. If identity is
ambiguous, do not kill it; report the hard stop. Containment is not a retry.
Do not edit or rerun. Record sanitized hashes/status/counts in
`task-2-green.md`.

- [ ] **Step 5: Commit the exact implementation**

Run:

```bash
git diff --check
git diff -- tests/e2e/access-transition-race.mjs
git add tests/e2e/access-transition-race.mjs
git commit -m "fix(test): close access-race Vite process group"
```

Do not add `.env.local`, logs, generated output, or ignored evidence.

---

### Task 3: Independent implementation review

**Files:**
- Read: approved spec, this plan, Task 1/2 evidence, and the base-to-head diff.
- Create ignored: `.superpowers/sdd/2026-08-25-cycle7-e2e-orphan-cleanup/task-3-review.md`
- Create ignored, mode `0600`: `.superpowers/sdd/2026-08-25-cycle7-e2e-orphan-cleanup/task-3-review.env`

**Interfaces:**
- Consumes: exact implementation commit from Task 2.
- Produces: zero-Critical/Important review gate or a hard stop.

- [ ] **Step 1: Review spec compliance and code quality**

The independent Terra reviewer verifies the RED failed for the intended reason, the helpers exercise real TCP behavior, `detached: true` creates the intended POSIX group, only the negative group PID is signalled, `ESRCH` alone is tolerated, child and port waits are bounded, and all original assertions remain byte-equivalent.

- [ ] **Step 2: Enforce the no-fix-after-GREEN breaker**

Any Critical/Important issue is a hard stop because the final correction round is already consumed. The reviewer must not edit or ask for an in-place fix. Zero Critical/Important findings is required to continue.

On approval, `task-3-review.env` contains exactly `REVIEWED_HEAD=<40 lowercase
hex>`, `REVIEWED_TREE=<40 lowercase hex>`, `CRITICAL=0`, `IMPORTANT=0`, and
`REVIEW=GREEN`; no shell expression or credential is permitted.

- [ ] **Step 3: Verify release isolation**

Require the exact base ancestry, exactly one design-only commit, one plan-only commit, and one implementation commit; no other tracked path; clean tracked state; ports 4173/4178 free; and all four SQL hashes unchanged.

---

### Task 4: Run the one final exact-commit release matrix

**Files:**
- Read: exact committed tree only.
- Create ignored: `.superpowers/sdd/2026-08-25-cycle7-e2e-orphan-cleanup/task-4-final-matrix.md` and unique durable logs.

**Interfaces:**
- Consumes: reviewed exact Task 2 commit/tree.
- Produces: a complete GREEN matrix bound to one commit/tree, or an irreversible non-production hard stop.

- [ ] **Step 1: Freeze identity and construct the runner**

Record exact commit/tree, Node/npm versions, clean tracked state, four SQL hashes, mock-only environment keys, free 4173/4178 ports, and absence of worktree-rooted Vite processes. Create ignored `run-final-matrix.sh` with mode `0700` and this fail-closed core; add no retry loop:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
logs="$1"
expected_head="$2"
expected_tree="$3"
mkdir -p "$logs"
: >"$logs/summary.tsv"

stop() {
  printf 'STOP\t%s\n' "$1" >>"$logs/summary.tsv"
  exit "${2:-1}"
}

run_gate() {
  local gate="$1"
  shift
  set +e
  "$@" >"$logs/$gate.stdout" 2>"$logs/$gate.stderr"
  local status=$?
  set -e
  printf '%s\t%s\t%s\t%s\n' "$gate" "$status" \
    "$(sha256sum "$logs/$gate.stdout" | awk '{print $1}')" \
    "$(sha256sum "$logs/$gate.stderr" | awk '{print $1}')" \
    >>"$logs/summary.tsv"
  (( status == 0 )) || stop "$gate" "$status"
}

assert_port_free() {
  local gate="$1" port="$2"
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    exec 3<&- 2>/dev/null || true
    exec 3>&- 2>/dev/null || true
    stop "$gate-port-$port" 91
  fi
  printf 'PORT_%s_FREE_AFTER=%s\n' "$port" "$gate" >>"$logs/summary.tsv"
}

run_browser_gate() {
  local gate="$1"
  shift
  run_gate "$gate" "$@"
  assert_port_free "$gate" 4173
  assert_port_free "$gate" 4178
}

assert_no_worktree_vite() {
  local gate="$1" proc cwd cmdline
  for proc in /proc/[0-9]*; do
    cwd="$(readlink "$proc/cwd" 2>/dev/null || true)"
    [[ "$cwd" == "$PWD"* ]] || continue
    cmdline="$(tr '\0' ' ' <"$proc/cmdline" 2>/dev/null || true)"
    [[ "$cmdline" == *'/node_modules/.bin/vite'* ]] || continue
    stop "$gate-orphan" 92
  done
  printf 'NO_WORKTREE_VITE_AFTER=%s\n' "$gate" >>"$logs/summary.tsv"
}

check_seals() {
  printf '%s  %s\n' \
    '82c321e40f73152bb1131a5b73067e0efc790d39d7926ac2da4b0bd191ccaf08' 'supabase/migrations/20260824120000_five_role_permission_hardening.sql' \
    '4f97a2acd684b678a02b17891e8fb5559a493fad066418df988be44f819621fc' 'scripts/apply-five-role-hardening.sql' \
    '43911dbb547ce81ba0d75542d2d882dbe66dab42adf22518410431d1b0b86dc0' 'scripts/apply-five-role-account-manifest.sql' \
    '63ce4020c57ed4ed953a3da4686d7a39f7e2757b70c57e0ee78c1f811a595cd4' 'scripts/check-five-role-permission-state.sql' \
    | sha256sum -c -
}

run_gate identity bash -c '
  test "$(git rev-parse HEAD)" = "$1"
  test "$(git rev-parse "HEAD^{tree}")" = "$2"
  test -z "$(git status --short)"
  git diff --check
' _ "$expected_head" "$expected_tree"
run_gate seals check_seals
assert_port_free initial 4173
assert_port_free initial 4178
assert_no_worktree_vite initial
run_gate npm-ci npm ci
run_gate typecheck npm run typecheck
run_gate unit npm run test:unit
run_gate drift npm run drift
run_browser_gate e2e bash scripts/with-preview.sh -- bash -c \
  'npm run e2e:gialap && npm run e2e:catalog && npm run e2e:admin && npm run shell && npm run thammy && npm run atelier'
run_browser_gate a11y bash scripts/with-preview.sh -- npm run a11y
run_browser_gate visual bash scripts/with-preview.sh -- npm run visual
run_gate build npm run build
run_gate final-seals check_seals
assert_port_free final 4173
assert_port_free final 4178
assert_no_worktree_vite final
build_tree_sha="$(find dist -type f -print0 | sort -z | xargs -0 -r sha256sum | sha256sum | awk '{print $1}')"
printf 'BUILD_TREE_SHA256=%s\n' "$build_tree_sha" >>"$logs/summary.tsv"
run_gate final-identity bash -c '
  test "$(git rev-parse HEAD)" = "$1"
  test "$(git rev-parse "HEAD^{tree}")" = "$2"
  test -z "$(git status --short)"
  git diff --check
' _ "$expected_head" "$expected_tree"
printf 'FINAL_MATRIX_COMMANDS_COMPLETE=1\n' >>"$logs/summary.tsv"
```

The outer executor validates `task-3-review.env` as literal hashes/verdicts,
then launches this runner exactly once:

```bash
review=.superpowers/sdd/2026-08-25-cycle7-e2e-orphan-cleanup/task-3-review.env
reviewed_head="$(sed -n 's/^REVIEWED_HEAD=//p' "$review")"
reviewed_tree="$(sed -n 's/^REVIEWED_TREE=//p' "$review")"
[[ "$reviewed_head" =~ ^[0-9a-f]{40}$ ]]
[[ "$reviewed_tree" =~ ^[0-9a-f]{40}$ ]]
test "$(sed -n 's/^CRITICAL=//p' "$review")" = 0
test "$(sed -n 's/^IMPORTANT=//p' "$review")" = 0
test "$(sed -n 's/^REVIEW=//p' "$review")" = GREEN
logs="$(mktemp -d .superpowers/sdd/2026-08-25-cycle7-e2e-orphan-cleanup/final-logs.XXXXXX)"
set +e
.superpowers/sdd/2026-08-25-cycle7-e2e-orphan-cleanup/run-final-matrix.sh \
  "$logs" "$reviewed_head" "$reviewed_tree"
matrix_status=$?
set -e
printf 'FINAL_RUNNER_EXIT=%s\n' "$matrix_status" >>"$logs/terminal.env"
```

Wait for its final exit status and retain the complete per-command logs. It
must never expose environment values. `PORT_4173_FREE_AFTER` is produced by
this runner's real TCP check, not inferred from `scripts/with-preview.sh`
output. The runner process and every command inside it have exactly one attempt.

- [ ] **Step 2: Validate the static-gate logs from the single runner**

Do not execute these commands here; the runner in Step 1 already ran exactly
once each:

```bash
npm ci
npm run typecheck
npm run test:unit
npm run drift
```

Require typecheck exit 0; unit 335 pass, 0 fail, 1 pre-existing skip; drift 49 migration-scope and 132 white-background-rule files with no drift.

- [ ] **Step 3: Validate the six-suite E2E log from the single runner**

Do not execute this command here; validate the runner's one `e2e` log:

```bash
bash scripts/with-preview.sh -- bash -c \
  'npm run e2e:gialap && npm run e2e:catalog && npm run e2e:admin && npm run shell && npm run thammy && npm run atelier'
```

Require wrapper exit 0; totals 171/0, 75/0, 60/0; `access transition race: pass`; shell 29/0; tham-my zero critical violations; atelier 177/0; runner-recorded `PORT_4173_FREE_AFTER=e2e` and `PORT_4178_FREE_AFTER=e2e`; and no orphan rooted in the worktree.

- [ ] **Step 4: Validate accessibility and visual logs from the single runner**

Do not execute these commands here; validate the runner's one log for each:

```bash
bash scripts/with-preview.sh -- npm run a11y
bash scripts/with-preview.sh -- npm run visual
```

Require a11y 5 passed with zero critical/serious violations, visual 39 passed, both wrappers exit 0, and ports 4173/4178 free after each.

- [ ] **Step 5: Validate standalone build and final seals from the single runner**

Do not run `npm run build` here. Require the runner's build exit 0, sanitized
`BUILD_TREE_SHA256`, successful initial/final identity logs, empty tracked
status, exact commit/tree unchanged, seals log PASS for all four SQL files, and
no listener/orphan on 4173/4178.

- [ ] **Step 6: Record the terminal verdict**

GREEN requires every required command, total, final marker, port, process, tree, and seal above. Missing output, timeout, signal, nonzero status, orphan, tracked drift, or ambiguous result is `FINAL_MATRIX_STOP`; do not edit, rerun, resume, or reinterpret partial evidence.

---

### Task 5: Sol exact-head R1 adjudication

**Files:**
- Read: spec, plan, implementation/review/final-matrix evidence, Cycle 6 candidate freeze, release handoff, and current remote state.
- Create ignored: `.superpowers/sdd/2026-08-25-cycle7-e2e-orphan-cleanup/task-5-sol-r1.md`

**Interfaces:**
- Consumes: exact GREEN commit/tree and frozen candidate `ad1ecb409b046602a738f0f4df61384cc726d965c41b604ba389e078f76af44b`.
- Produces: `BACKUP_ONLY_APPROVED` for a later production checkpoint, or a hard stop.

- [ ] **Step 1: Revalidate exact identities and ancestry**

Sol verifies the new head is a linear descendant of `4a11158`, the only new tracked changes are the approved design, plan, and one runtime test correction, the SQL/apply checkout remains `c153a19`, candidate/harness freezes are unchanged, and current remote main/security/PR identities are refreshed read-only.

- [ ] **Step 2: Review complete evidence**

Require valid RED/GREEN, independent zero-Critical/Important review, full final matrix GREEN, clean ports/tree, artifact seals, private manifest/target readiness, and no production/Git mutation.

- [ ] **Step 3: Decide only the next gate**

R1 may issue `BACKUP_ONLY_APPROVED` bound to the exact candidate SHA, exact one-shot command, exact new release head/tree, and independent reviewer-signature requirement. It does not authorize apply, push, merge, or production retry. Any gap is a hard stop with the branch left unpromoted.

## Plan self-review

- Spec coverage: one runtime file, process-group lifecycle, bounded waits, RED/GREEN, review, full matrix, rollback, and R1 are all assigned.
- Placeholder scan: no TBD/TODO/deferred implementation language.
- Interface consistency: `isPortOpen`, `waitForPortClosed`, and `waitForChildExit` use the same names in RED, GREEN, and review.
- Ownership consistency: only Luna edits the runtime file; Terra reviews/runs gates; Sol adjudicates R1; no shared-state implementation is parallel.
- Round accounting: the saved Cycle 6 runner correction used round one; Task 1 is diagnostic RED; Task 2 begins and consumes the final correction round; Tasks 2–4 allow no fix or rerun.

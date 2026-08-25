# Cycle 7 E2E orphan cleanup design

## Goal

Make `tests/e2e/access-transition-race.mjs` own the complete lifecycle of the
Vite development server that it starts on port 4178, so the process tree and
listener are gone before the test exits.

## Scope

- Modify only `tests/e2e/access-transition-race.mjs` for runtime behavior.
- Keep all access-transition assertions, browser behavior, port 4178, and
  `--strictPort` unchanged.
- Do not modify application code, SQL artifacts, production scripts, workflow
  files, or the existing preview wrapper.
- Base the change on exact commit
  `4a111587ded5becab2ff06004cbfcf02bf988f68`.
- This is the second and final non-production E2E fix/retest round. A failed
  final full matrix is a hard stop; there is no third correction round.

## Selected approach

Start `npm run dev` as a dedicated POSIX process group by passing
`detached: true` to `spawn`. In `finally`, send `SIGTERM` to the negative
process-group identifier, tolerate the process already being gone, await the
immediate child exit, and poll with a bounded deadline until port 4178 refuses
connections.

This keeps ownership inside the test that creates the server. It is preferred
to a shared lifecycle refactor, which would widen the release diff, and to
runner-side cleanup, which would hide a test defect.

## Lifecycle contract

The test owns three resources: the Puppeteer browser, the immediate `npm`
child, and every server descendant in that child's process group. Cleanup is
ordered as follows:

1. Close the browser if it was opened.
2. If the server process has not exited, signal its whole process group with
   `SIGTERM`.
3. Await the immediate child exit without an unbounded wait.
4. Poll `127.0.0.1:4178` until connection attempts fail, using a short bounded
   deadline.
5. Throw a lifecycle failure if the listener survives the deadline.

An `ESRCH` result while signalling means the process group has already exited
and is not an error. Other signal failures remain test failures. No SIGKILL
fallback or retry is added in this release correction.

## TDD evidence

RED must be demonstrated before the process-group correction. Add the bounded
port-closed assertion to the existing single-PID cleanup and run the targeted
access-transition test on controlled local inputs. The current behavior must
fail because port 4178 remains reachable after the immediate `npm` child exits.

GREEN then adds only dedicated process-group creation and group termination,
and reruns the same targeted test. Success requires the existing access-race
message, exit status zero, and port 4178 closed after the process exits.

The final release gate then runs from the resulting exact commit with durable
per-command logs:

- dependency install, typecheck, unit tests, and drift;
- E2E totals 171, 75, 60, access-transition race, shell 29, tham-my checks,
  and atelier 177;
- ports 4173 and 4178 free afterward with no orphan process;
- accessibility 5, visual 39, and standalone build;
- clean tracked state and unchanged seals for all four SQL artifacts.

## Integration and rollback

The implementation receives an independent review before the final matrix.
If review or verification fails, retain evidence and do not advance R1,
backup, apply, push, or merge. Rollback is to leave the Cycle 7 branch
unpromoted; production remains unchanged.

After a GREEN final matrix, Sol must reassess the exact new commit/tree and all
release seals before issuing any superseding `BACKUP_ONLY_APPROVED` decision.
The SQL apply checkout remains pinned separately to detached `c153a19`.

# Task 1 report: Today personal scope model

## Implementation

Added the pure role-aware Today person-scope model. `qa_staff` gets the personal (`mine`) default only when a non-blank person ID is linked; every other role or missing link falls back to `team`. Presentation returns the exact Vietnamese heading/action literals and warns when the account has no usable linked person ID.

## TDD evidence

### RED

Command:

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH node --import tsx --test tests/unit/today-person-scope.test.mjs
```

Result: failed as expected with `ERR_MODULE_NOT_FOUND` because `src/features/today/todayPersonScope.ts` did not exist yet.

### GREEN

Command:

```bash
PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH node --import tsx --test tests/unit/today-person-scope.test.mjs
```

Result: 3 tests passed, 0 failed.

Additional verification:

- `PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run typecheck`: exit 0.
- `PATH=/home/admin1/.nvm/versions/node/v24.18.0/bin:$PATH npm run test:unit`: 527 tests, 526 passed, 1 skipped, 0 failed.
- `git diff --check`: exit 0.

## Files changed

- `src/features/today/todayPersonScope.ts`
- `tests/unit/today-person-scope.test.mjs`
- `.superpowers/sdd/2026-08-28-today-personal-scope/task-1-report.md`

## Self-review

- Uses the canonical `BusinessRole` type from `src/lib/businessRoles.ts`.
- Contains no UI, persistence, network, or mutable state; behavior is deterministic and pure.
- Covers all required default, linked-ID, presentation, and warning cases from the brief.
- Existing untracked `.superpowers/research/` was left untouched.

## Concerns

None for Task 1. The pre-existing untracked `.superpowers/research/` directory remains outside this change.

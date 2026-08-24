# Task 1 Report — Disposable Database Harness and RED Security Tests

## Status

DONE_WITH_CONCERNS

## Files

- `package.json`
- `supabase/config.toml`
- `scripts/prepare-five-role-test-db.sh`
- `scripts/run-five-role-db-tests.sh`
- `tests/sql/five-role-hardening.sql`
- `tests/unit/five-role-db-harness.test.mjs`

## Commits

- `8e3e26549bf2478ced1b405f03952df77bf4248b` — `test(security): reproduce five-role permission gaps`

## RED evidence

- Before implementation, `node --import tsx --test tests/unit/five-role-db-harness.test.mjs` failed all three original behavior assertions with exit status `127` because both shell scripts were absent.
- On the fresh disposable clone without the hardening migration, `npm run test:db:five-role` fails first at `PROFILE_SELF_ESCALATION_BLOCKED`.
- With only that assertion temporarily skipped, the same suite fails at `DEPARTMENT_CATALOG_HISTORY_FORBIDDEN`.
- With the preceding profile/catalog assertions temporarily skipped for diagnosis, it fails at `LEGACY_VIEWER_DISABLED`.
- The schema-only clone has zero permission-matrix rows, so the retained `FIVE_ROLE_SCREEN_MATRIX_EXACT` assertion is RED (`0 != 85`). All temporarily skipped assertions were restored before commit.

## GREEN harness evidence

- `node --import tsx --test tests/unit/five-role-db-harness.test.mjs` passes 4/4.
- Tests execute the real shell scripts through fake `supabase`, `docker`, and `psql` process boundaries. They verify missing source URL exit `2`, production-target refusal exit `3` without invoking `psql`, pinned PostgreSQL 17 container use, credential-free Docker arguments, local-schema reset/extension bootstrap, and SQL-suite argument construction.
- A real local clone completed from a production `--schema-only` dump using the PostgreSQL 17 container client. No production DML or DDL was run.

## Commands and output summary

- `docker run --rm postgres:17 pg_dump --version` reported PostgreSQL 17.11.
- `bash scripts/prepare-five-role-test-db.sh` completed a local disposable clone and printed only the local `VMP_TEST_DB_URL` instruction on success.
- `bash -n scripts/prepare-five-role-test-db.sh scripts/run-five-role-db-tests.sh` exited `0`.
- `node --import tsx --test tests/unit/five-role-db-harness.test.mjs` passed `4` tests, `0` failures.
- `git diff --check` exited cleanly before the implementation commit.

## Self-review

- The runner normalizes host/database components via `URL` parsing and stops before `psql` when they match.
- The clone script accepts the production URL only from its environment, splits it into `PG*` variables, and passes no production URL or credential value as a Docker command argument.
- All production access is confined to `pg_dump --schema-only --schema=public --no-owner`; local-only DDL is limited to the disposable Supabase database.
- The SQL suite uses a transaction, owner-created synthetic Auth/Profile/Audit fixtures, `request.jwt.claims`, a PL/pgSQL `check_violation` helper, and a final rollback.

## Concerns

- The public-only schema dump references `vector`, `unaccent`, and `pg_trgm` in `extensions`; the local harness bootstraps exactly those three extensions before restore. It removes `ALTER DEFAULT PRIVILEGES` statements because they target the production owner and cannot be applied by the local role; existing schema grants and RLS policies remain in the dump.
- A schema-only clone deliberately has no production table data, so the five-role matrix starts at zero. This is expected RED evidence before Task 2 seeds/enforces the 85-row matrix, but it means the harness is structural rather than a production-data replica.

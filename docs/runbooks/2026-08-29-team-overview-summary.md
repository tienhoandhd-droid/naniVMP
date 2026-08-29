# Team Overview Summary RPC — deploy and compensating rollback

Run this procedure only against the exact approved Supabase project and exact
reviewed commit. Repository work does not authorize production deployment,
rollback, push, or merge; those actions require separate explicit approval.

## Deploy

Preflight must confirm the target project, migration history, and that no
unrelated pending migration will be applied. Apply only
`supabase/migrations/20260829150000_team_overview_summary.sql`, then verify the
function signature, owner, `SECURITY DEFINER`, pinned `search_path`, effective
EXECUTE privileges, exact six-key payload, one allowed QA-staff call, and one
denied call before deploying the frontend.

## Compensating rollback after the migration committed

A Git revert cannot remove an RPC already applied to PostgreSQL. Coordinate
both halves of the rollback:

1. Revert the reviewed frontend feature commit or redeploy the last known-good
   frontend SHA through the approved release workflow.
2. Reconfirm the exact database target and capture the current function owner,
   definition, and ACL for the incident record.
3. Apply `scripts/rollback-team-overview-summary.sql` with `ON_ERROR_STOP=1`.
   The artifact revokes EXECUTE from `PUBLIC`, `anon`, `authenticated`, and
   `service_role`, then drops `public.rpc_team_overview_summary(integer)` in one
   transaction. Do not add this artifact to automatic forward migrations.
4. Run `supabase/tests/team_overview_summary_rollback.sql`. It must emit both
   `TEAM_SUMMARY_ROLLBACK_FUNCTION_ABSENT` and
   `TEAM_SUMMARY_ROLLBACK_EXECUTE_ABSENT` without error.
5. Verify the reverted frontend SHA and HTTP response separately. No business
   data restore is required because the feature migration creates only the RPC.

Example invocation after the database URL has been independently validated:

```bash
psql -X -v ON_ERROR_STOP=1 -d "$SUPABASE_DB_URL" \
  -f scripts/rollback-team-overview-summary.sql
psql -X -v ON_ERROR_STOP=1 -d "$SUPABASE_DB_URL" \
  -f supabase/tests/team_overview_summary_rollback.sql
```

## Disposable local dry-run

On the named local PostgreSQL test database, exercise the full reversible path:

```bash
psql -X -v ON_ERROR_STOP=1 -d "$VMP_TEST_DB_URL" \
  -f supabase/migrations/20260829150000_team_overview_summary.sql
psql -X -v ON_ERROR_STOP=1 -d "$VMP_TEST_DB_URL" \
  -f scripts/rollback-team-overview-summary.sql
psql -X -v ON_ERROR_STOP=1 -d "$VMP_TEST_DB_URL" \
  -f supabase/tests/team_overview_summary_rollback.sql
psql -X -v ON_ERROR_STOP=1 -d "$VMP_TEST_DB_URL" \
  -f supabase/migrations/20260829150000_team_overview_summary.sql
psql -X -v ON_ERROR_STOP=1 -d "$VMP_TEST_DB_URL" \
  -f supabase/tests/team_overview_summary.sql
```

The final two commands are local-test cleanup: they leave the disposable
workspace with the forward RPC installed and its transactional authorization
harness passing. They are not part of a production rollback.

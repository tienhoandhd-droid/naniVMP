\set ON_ERROR_STOP on

\if :{?account_ids}
\else
\echo 'account_ids is required (exactly seven comma-separated UUIDs).'
begin;
do $$
begin
  raise exception using errcode = '22023',
    message = 'ACCOUNT_IDS_PSQL_VARIABLE_REQUIRED';
end
$$;
\endif

begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

\ir ../supabase/migrations/20260824120000_five_role_permission_hardening.sql

\o /dev/null
select set_config('vmp.five_role_expected_account_digest',
  '2c09501166eb45c3676451084230340e', true);
\o

\ir apply-five-role-account-manifest.sql

commit;

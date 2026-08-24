\set ON_ERROR_STOP on

\if :{?account_ids}
\else
begin;
do $$
begin
  raise exception using errcode = '22023',
    message = 'LOCAL_ACCOUNT_IDS_PSQL_VARIABLE_REQUIRED';
end
$$;
\endif

\if :{?five_role_local_test_contract}
\else
begin;
do $$
begin
  raise exception using errcode = '42501',
    message = 'LOCAL_TEST_SHELL_CONTRACT_REQUIRED';
end
$$;
\endif

begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

\o /dev/null
select set_config('vmp.five_role_local_test_contract',
  :'five_role_local_test_contract', true);
\o

do $local_target$
begin
  if current_setting('vmp.five_role_local_test_contract', true)
       is distinct from 'loopback-54322-postgres'
     or current_database() <> 'postgres'
     or current_user <> 'postgres'
     or not exists (
       select 1 from public.system_config
       where key = 'five_role_test_fixture' and value = 'true'::jsonb
     ) then
    raise exception using errcode = '42501',
      message = 'LOCAL_TEST_DATABASE_CONTRACT_MISMATCH';
  end if;
end
$local_target$;

\ir ../supabase/migrations/20260824120000_five_role_permission_hardening.sql

\o /dev/null
select set_config('vmp.five_role_expected_account_digest',
  '1f8213f705d26bd656781baa08cb1f42', true);
\o

\ir apply-five-role-account-manifest.sql

commit;

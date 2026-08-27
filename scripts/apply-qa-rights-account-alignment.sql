\set ON_ERROR_STOP on

\if :{?khoa_id}
\else
\echo 'khoa_id is required.'
do $$
begin
  raise exception using errcode = '22023',
    message = 'KHOA_ID_PSQL_VARIABLE_REQUIRED';
end
$$;
\endif

\if :{?dat_id}
\else
\echo 'dat_id is required.'
do $$
begin
  raise exception using errcode = '22023',
    message = 'DAT_ID_PSQL_VARIABLE_REQUIRED';
end
$$;
\endif

\if :{?viewer_ids}
\else
\echo 'viewer_ids is required (exactly two comma-separated UUIDs).'
do $$
begin
  raise exception using errcode = '22023',
    message = 'VIEWER_IDS_PSQL_VARIABLE_REQUIRED';
end
$$;
\endif

-- Every included migration owns its transaction. Do not put an outer BEGIN
-- around this chain: an inner COMMIT would make that boundary misleading.
-- ON_ERROR_STOP gives fail-fast schema-first application; the account manifest
-- below owns the separate all-or-nothing account/assignment transaction.
\o /dev/null
select (
  to_regprocedure('public.vmp_is_active_session(uuid)') is not null
  and to_regprocedure('public.rpc_preview_catalog_change_v2(uuid)') is not null
  and to_regprocedure('public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)') is not null
  and to_regprocedure('public.vmp_manager_principal(uuid)') is not null
  and to_regprocedure('public.vmp_item_rights(uuid,text)') is not null
  and (select count(*) from public.vmp_screen_permissions) = 85
  and regexp_replace(coalesce(pg_get_functiondef(
        to_regprocedure('public.vmp_item_rights(uuid,text)')), ''), '\s+', '', 'g')
      like '%array[''actual_protocol_date'',''status_protocol'',''status_validation'',''actual_report_date'',''status_report'',''actual_vmp_date'',''status_vmp'']%'
)::text as qa_rights_schema_ready
\gset
\o

\if :qa_rights_schema_ready
\echo 'Reviewed QA-rights schema chain is already present; verifying the account manifest.'
\else
\ir ../supabase/migrations/20260824120000_five_role_permission_hardening.sql
\ir ../supabase/migrations/20260826130000_catalog_progressed_deadline_override.sql
\ir ../supabase/migrations/20260826170000_manual_planned_deadline_edit.sql
\ir ../supabase/migrations/20260826180000_qa_manager_actual_date_principal_normalization.sql
\ir ../supabase/migrations/20260827100000_qa_rights_account_alignment.sql
\endif

\ir apply-qa-rights-account-manifest.sql

\set ON_ERROR_STOP on

-- Postflight is deliberately rollback-only.  Persona ids are supplied from a
-- reviewed, mode-0600 file and are never printed by this checker.
\if :{?admin_id}
\else
BEGIN READ ONLY;
DO $$ BEGIN RAISE EXCEPTION USING errcode='22023', message='SOURCE_ACCESS_POSTFLIGHT_ADMIN_ID_REQUIRED'; END $$;
\endif
\if :{?qa_manager_id}
\else
BEGIN READ ONLY;
DO $$ BEGIN RAISE EXCEPTION USING errcode='22023', message='SOURCE_ACCESS_POSTFLIGHT_QA_MANAGER_ID_REQUIRED'; END $$;
\endif
\if :{?owner_qa_id}
\else
BEGIN READ ONLY;
DO $$ BEGIN RAISE EXCEPTION USING errcode='22023', message='SOURCE_ACCESS_POSTFLIGHT_OWNER_QA_ID_REQUIRED'; END $$;
\endif
\if :{?support_qa_id}
\else
BEGIN READ ONLY;
DO $$ BEGIN RAISE EXCEPTION USING errcode='22023', message='SOURCE_ACCESS_POSTFLIGHT_SUPPORT_QA_ID_REQUIRED'; END $$;
\endif
\if :{?unrelated_qa_id}
\else
BEGIN READ ONLY;
DO $$ BEGIN RAISE EXCEPTION USING errcode='22023', message='SOURCE_ACCESS_POSTFLIGHT_UNRELATED_QA_ID_REQUIRED'; END $$;
\endif
\if :{?workshop_id}
\else
BEGIN READ ONLY;
DO $$ BEGIN RAISE EXCEPTION USING errcode='22023', message='SOURCE_ACCESS_POSTFLIGHT_WORKSHOP_ID_REQUIRED'; END $$;
\endif

BEGIN READ ONLY;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='90s';
\o /dev/null
SELECT set_config('vmp.source_access_admin', :'admin_id', true);
SELECT set_config('vmp.source_access_manager', :'qa_manager_id', true);
SELECT set_config('vmp.source_access_owner', :'owner_qa_id', true);
SELECT set_config('vmp.source_access_support', :'support_qa_id', true);
SELECT set_config('vmp.source_access_unrelated', :'unrelated_qa_id', true);
SELECT set_config('vmp.source_access_workshop', :'workshop_id', true);
\o

DO $postflight$
DECLARE
  v_admin uuid := current_setting('vmp.source_access_admin')::uuid;
  v_manager uuid := current_setting('vmp.source_access_manager')::uuid;
  v_owner uuid := current_setting('vmp.source_access_owner')::uuid;
  v_support uuid := current_setting('vmp.source_access_support')::uuid;
  v_unrelated uuid := current_setting('vmp.source_access_unrelated')::uuid;
  v_workshop uuid := current_setting('vmp.source_access_workshop')::uuid;
  v_result jsonb;
  v_digest text;
  v_count bigint;
  v_revision bigint;
  v_actor uuid;
BEGIN
  IF (SELECT count(DISTINCT id) FROM (VALUES(v_admin),(v_manager),(v_owner),(v_support),
                                  (v_unrelated),(v_workshop)) ids(id)) <> 6
     OR v_admin=v_manager OR v_owner=v_support THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_POSTFLIGHT_PERSONA_IDS_INVALID';
  END IF;
  IF current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
     OR current_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_POSTFLIGHT_DATABASE_CONTRACT';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_DATABASE_CONTRACT PostgreSQL17';

  IF public.screen_access_mode() IS DISTINCT FROM 'enforced'
     OR public.item_permissions_mode() IS DISTINCT FROM 'preview' THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_POSTFLIGHT_PERMISSION_MODES';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_PERMISSION_MODES enforced/preview';

  IF public.vmp_business_role(v_admin) IS DISTINCT FROM 'admin'
     OR public.vmp_business_role(v_manager) IS DISTINCT FROM 'qa_manager'
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_admin AND coalesce(is_active,true))
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_manager AND coalesce(is_active,true)) THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_POSTFLIGHT_ACTIVE_ADMIN_MANAGER';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_ACTIVE_ADMIN_MANAGER';

  IF to_regclass('public.vmp_source_workshop_scope_grants') IS NULL
     OR to_regclass('public.vmp_authorization_revision') IS NULL THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_POSTFLIGHT_SCHEMA_MISSING';
  END IF;
  SELECT revision INTO v_revision FROM public.vmp_authorization_revision WHERE singleton;
  IF v_revision IS NULL OR v_revision < 1 THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_POSTFLIGHT_AUTHORIZATION_REVISION';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_AUTHORIZATION_REVISION revision=%', v_revision;

  IF EXISTS (
    SELECT 1 FROM public.vmp_plan_items item
    LEFT JOIN public.vmp_objects master_object ON master_object.code=item.object_code
    LEFT JOIN public.vmp_source_objects source_object
      ON source_object.object_code=master_object.code AND source_object.is_active
    WHERE item.is_active
    GROUP BY item.validation_code HAVING count(source_object.id) <> 1
  ) OR EXISTS (
    SELECT 1 FROM public.vmp_source_objects source_object
    JOIN public.vmp_plan_items item ON item.object_code=source_object.object_code AND item.is_active
    WHERE source_object.is_active
      AND (source_object.owner_person_id IS DISTINCT FROM item.owner_person_id
        OR source_object.support_person_id IS DISTINCT FROM item.support_person_id)
  ) THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_POSTFLIGHT_EXACT_MAPPING_OWNER_SUPPORT';
  END IF;
  SELECT count(*), md5(string_agg(object_code, E'\n' ORDER BY object_code))
    INTO v_count,v_digest FROM public.vmp_source_objects WHERE is_active;
  RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_EXACT_MAPPING count=% digest=%', v_count,v_digest;

  IF EXISTS (SELECT 1 FROM (VALUES
      ('public.vmp_source_objects'::regclass),('public.vmp_plan_items'::regclass),
      ('public.vmp_source_workshop_scope_grants'::regclass),('public.vmp_item_assignments'::regclass)
    ) protected(relation_id)
    WHERE NOT EXISTS (SELECT 1 FROM pg_class relation
                      WHERE relation.oid=protected.relation_id
                        AND relation.relrowsecurity AND NOT relation.relforcerowsecurity))
     OR (SELECT count(*) FROM pg_policy
         WHERE polrelid='public.vmp_source_workshop_scope_grants'::regclass) = 0
     OR has_table_privilege('authenticated','public.vmp_source_workshop_scope_grants','INSERT,UPDATE,DELETE')
     OR has_table_privilege('service_role','public.vmp_source_workshop_scope_grants','INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated','public.vmp_source_objects','INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated','public.vmp_plan_items','INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated','public.vmp_item_assignments','INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_POSTFLIGHT_GRANT_RLS_ACL';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_GRANT_RLS_ACL';

  IF EXISTS (SELECT 1 FROM (VALUES
      ('uq_vmp_source_objects_active_object_code',true),
      ('idx_vmp_plan_items_object_year_active',false),('idx_vmp_source_objects_list',false),
      ('idx_vmp_source_objects_active_owner',false),('idx_vmp_source_objects_active_support',false),
      ('idx_vmp_source_objects_active_scope_area',false),('idx_vmp_source_objects_active_scope_line',false),
      ('uq_vmp_source_workshop_grants_active_area',true),('uq_vmp_source_workshop_grants_active_line',true),
      ('uq_vmp_source_workshop_grants_id_version',true),('idx_vmp_source_workshop_grants_person',false),
      ('idx_vmp_source_workshop_grants_area',false),('idx_vmp_source_workshop_grants_line',false),
      ('idx_vmp_item_assignments_active_performer_validation_kind',false),
      ('idx_vmp_item_assignments_active_validation_performer_kind',false),
      ('idx_vmp_performers_active_candidate',false),('idx_profiles_active_role_department',false)
    ) expected(name,must_be_unique)
    WHERE NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                      JOIN pg_index index_row ON index_row.indexrelid=c.oid
                      WHERE n.nspname='public' AND c.relname=expected.name
                        AND index_row.indisvalid AND index_row.indisready
                        AND (NOT expected.must_be_unique OR index_row.indisunique))
  ) THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_POSTFLIGHT_INDEX_CONTRACT';
  END IF;
  SELECT md5(string_agg(index_class.relname, E'\n' ORDER BY index_class.relname))
    INTO v_digest
  FROM pg_class index_class JOIN pg_namespace namespace ON namespace.oid=index_class.relnamespace
  WHERE namespace.nspname='public' AND index_class.relname LIKE '%source%';
  RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_INDEX_CONTRACT digest=%', v_digest;

  IF to_regprocedure('public.vmp_unfiltered_security_definer_item_readers()') IS NULL
     OR EXISTS (SELECT 1 FROM public.vmp_unfiltered_security_definer_item_readers()) THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_POSTFLIGHT_SECURITY_DEFINER_INVENTORY';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_SECURITY_DEFINER_INVENTORY count=0';

  IF has_function_privilege('anon','public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)','EXECUTE')
     OR has_function_privilege('authenticated','public.rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.rpc_refresh_source_item_assignments()','EXECUTE')
     OR has_function_privilege('authenticated','public.rpc_refresh_source_item_assignments()','EXECUTE') THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_POSTFLIGHT_FUNCTION_ACL';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_FUNCTION_ACL';

  -- Lower-role claims are checked through the real wrappers.  Counts/digests
  -- only are emitted, never row payloads, identities, or object codes.
  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_owner,'role','authenticated')::text,true);
  v_result:=public.rpc_my_editable_progress_rights();
  IF v_result->>'ok' IS DISTINCT FROM 'true' OR jsonb_array_length(v_result->'rights')=0 THEN
    RAISE EXCEPTION USING errcode='check_violation', message='SOURCE_ACCESS_POSTFLIGHT_OWNER_RIGHTS';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_OWNER_RIGHTS count=%', jsonb_array_length(v_result->'rights');

  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_support,'role','authenticated')::text,true);
  v_result:=public.rpc_my_editable_progress_rights();
  IF v_result->>'ok' IS DISTINCT FROM 'true' OR jsonb_array_length(v_result->'rights')=0 THEN
    RAISE EXCEPTION USING errcode='check_violation', message='SOURCE_ACCESS_POSTFLIGHT_SUPPORT_RIGHTS';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_SUPPORT_RIGHTS count=%', jsonb_array_length(v_result->'rights');

  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_unrelated,'role','authenticated')::text,true);
  v_result:=public.rpc_my_editable_progress_rights();
  IF v_result->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION USING errcode='check_violation', message='SOURCE_ACCESS_POSTFLIGHT_UNRELATED_SESSION';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_UNRELATED_SESSION count=%', jsonb_array_length(v_result->'rights');

  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_workshop,'role','authenticated')::text,true);
  v_result:=public.rpc_my_editable_progress_rights();
  IF v_result->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION USING errcode='check_violation', message='SOURCE_ACCESS_POSTFLIGHT_WORKSHOP_SESSION';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_WORKSHOP_SESSION count=%', jsonb_array_length(v_result->'rights');

  -- Non-object Source surfaces remain manager-only even when a caller bypasses
  -- navigation.  Probe both lower-role claims through the public wrappers.
  FOREACH v_actor IN ARRAY ARRAY[v_unrelated,v_workshop] LOOP
    PERFORM set_config('request.jwt.claims',json_build_object('sub',v_actor,'role','authenticated')::text,true);
    v_result:=public.rpc_list_catalog_dataset('products',null,'{}'::jsonb,1,0);
    IF upper(coalesce(v_result->>'error_code',v_result->>'code','')) <> 'FORBIDDEN' THEN
      RAISE EXCEPTION USING errcode='check_violation', message='SOURCE_ACCESS_POSTFLIGHT_PRODUCTS_FORBIDDEN';
    END IF;
    v_result:=public.rpc_list_catalog_dataset('alerts',null,'{}'::jsonb,1,0);
    IF upper(coalesce(v_result->>'error_code',v_result->>'code','')) <> 'FORBIDDEN' THEN
      RAISE EXCEPTION USING errcode='check_violation', message='SOURCE_ACCESS_POSTFLIGHT_ALERTS_FORBIDDEN';
    END IF;
    v_result:=public.rpc_stage_catalog_import('objects','source-access-postflight','source-access',null,'[]'::jsonb);
    IF upper(coalesce(v_result->>'error_code',v_result->>'code','')) <> 'FORBIDDEN' THEN
      RAISE EXCEPTION USING errcode='check_violation', message='SOURCE_ACCESS_POSTFLIGHT_IMPORT_FORBIDDEN';
    END IF;
    v_result:=public.rpc_list_catalog_changes('Thiết bị',null,1,0);
    IF upper(coalesce(v_result->>'error_code',v_result->>'code','')) <> 'FORBIDDEN' THEN
      RAISE EXCEPTION USING errcode='check_violation', message='SOURCE_ACCESS_POSTFLIGHT_PENDING_FORBIDDEN';
    END IF;
    v_result:=public.rpc_catalog_history('{}'::jsonb,1,0);
    IF upper(coalesce(v_result->>'error_code',v_result->>'code','')) <> 'FORBIDDEN' THEN
      RAISE EXCEPTION USING errcode='check_violation', message='SOURCE_ACCESS_POSTFLIGHT_HISTORY_FORBIDDEN';
    END IF;
    v_result:=public.rpc_source_field_suggestions('Thiết bị','department','',null,10);
    IF upper(coalesce(v_result->>'error_code',v_result->>'code','')) <> 'FORBIDDEN' THEN
      RAISE EXCEPTION USING errcode='check_violation', message='SOURCE_ACCESS_POSTFLIGHT_SUGGESTIONS_FORBIDDEN';
    END IF;
    v_result:=public.rpc_source_qa_candidates('',null,10,'{}'::uuid[]);
    IF upper(coalesce(v_result->>'error_code',v_result->>'code','')) <> 'FORBIDDEN' THEN
      RAISE EXCEPTION USING errcode='check_violation', message='SOURCE_ACCESS_POSTFLIGHT_CANDIDATES_FORBIDDEN';
    END IF;
    v_result:=public.rpc_list_source_workshop_coverage('',null,10);
    IF upper(coalesce(v_result->>'error_code',v_result->>'code','')) <> 'FORBIDDEN' THEN
      RAISE EXCEPTION USING errcode='check_violation', message='SOURCE_ACCESS_POSTFLIGHT_COVERAGE_FORBIDDEN';
    END IF;
    v_result:=public.rpc_source_workshop_scope_choices(null,null,null,null,10);
    IF upper(coalesce(v_result->>'error_code',v_result->>'code','')) <> 'FORBIDDEN' THEN
      RAISE EXCEPTION USING errcode='check_violation', message='SOURCE_ACCESS_POSTFLIGHT_SCOPE_CHOICES_FORBIDDEN';
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_NON_OBJECT_SURFACES_FORBIDDEN count=2';

  PERFORM set_config('request.jwt.claims','',true);
END
$postflight$;

ROLLBACK;

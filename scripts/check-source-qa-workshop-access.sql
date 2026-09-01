BEGIN READ ONLY;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='90s';

DO $postflight$
DECLARE
  v_admin uuid;
  v_manager uuid;
  v_owner uuid;
  v_support uuid;
  v_unrelated uuid;
  v_workshop uuid;
  v_probe_item text;
  v_result jsonb;
  v_digest text;
  v_count bigint;
  v_revision bigint;
  v_actor uuid;
  v_non_object_surface_probes bigint := 0;
BEGIN
  IF current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
     OR current_user IS DISTINCT FROM 'postgres'
     OR (SELECT pg_encoding_to_char(encoding) FROM pg_database
         WHERE datname=current_database()) IS DISTINCT FROM 'UTF8'
     OR (SELECT datcollate FROM pg_database
         WHERE datname=current_database()) IS DISTINCT FROM 'en_US.UTF-8'
     OR (SELECT datctype FROM pg_database
         WHERE datname=current_database()) IS DISTINCT FROM 'en_US.UTF-8' THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_POSTFLIGHT_DATABASE_CONTRACT';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_DATABASE_CONTRACT PostgreSQL17';

  -- Resolve the personas from canonical relations.  This keeps the checker
  -- runnable as one raw SQL file and avoids carrying identity values through
  -- the release command line or into its output.
  SELECT profile.id INTO v_admin
  FROM public.profiles profile
  WHERE profile.role='admin'::public.user_role AND profile.is_active IS TRUE
  ORDER BY profile.id LIMIT 1;
  SELECT profile.id INTO v_manager
  FROM public.profiles profile
  WHERE profile.role='qa_manager'::public.user_role AND profile.is_active IS TRUE
  ORDER BY profile.id LIMIT 1;
  SELECT performer.user_id INTO v_owner
  FROM public.vmp_source_objects source_object
  JOIN public.vmp_performers performer ON performer.id=source_object.owner_person_id
  JOIN public.profiles profile ON profile.id=performer.user_id
  WHERE source_object.is_active IS TRUE AND performer.is_active IS TRUE
    AND performer.user_id IS NOT NULL
    AND profile.is_active IS TRUE
    AND public.vmp_business_role(performer.user_id) IN ('qa_staff','qa_manager')
  ORDER BY source_object.object_code,performer.id LIMIT 1;
  SELECT performer.user_id INTO v_support
  FROM public.vmp_source_objects source_object
  JOIN public.vmp_performers performer ON performer.id=source_object.support_person_id
  JOIN public.profiles profile ON profile.id=performer.user_id
  WHERE source_object.is_active IS TRUE AND performer.is_active IS TRUE
    AND performer.user_id IS NOT NULL
    AND profile.is_active IS TRUE
    AND public.vmp_business_role(performer.user_id) IN ('qa_staff','qa_manager')
  ORDER BY source_object.object_code,performer.id LIMIT 1;
  SELECT performer.user_id INTO v_unrelated
  FROM public.vmp_performers performer
  JOIN public.profiles profile ON profile.id=performer.user_id
  WHERE performer.is_active IS TRUE AND performer.user_id IS NOT NULL
    AND profile.is_active IS TRUE
    AND public.vmp_business_role(performer.user_id)='qa_staff'
    AND NOT EXISTS (
      SELECT 1 FROM public.vmp_source_objects source_object
      WHERE source_object.is_active IS TRUE
        AND performer.id IN (source_object.owner_person_id,source_object.support_person_id))
  ORDER BY performer.id LIMIT 1;
  IF to_regclass('public.vmp_source_workshop_scope_grants') IS NOT NULL THEN
    SELECT performer.user_id INTO v_workshop
    FROM public.vmp_source_workshop_scope_grants grant_row
    JOIN public.vmp_performers performer ON performer.id=grant_row.performer_id
    JOIN public.profiles profile ON profile.id=performer.user_id
    WHERE grant_row.is_active IS TRUE AND grant_row.valid_from<=transaction_timestamp()
      AND (grant_row.expires_at IS NULL OR grant_row.expires_at>transaction_timestamp())
      AND performer.is_active IS TRUE AND performer.user_id IS NOT NULL
      AND profile.is_active IS TRUE
      AND public.vmp_business_role(performer.user_id) IN ('workshop_manager','workshop_staff')
    ORDER BY grant_row.id LIMIT 1;
  END IF;
  IF v_admin IS NULL OR v_manager IS NULL THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_POSTFLIGHT_ACTIVE_ADMIN_MANAGER';
  END IF;
  IF v_admin=v_manager THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_POSTFLIGHT_PERSONA_IDS_INVALID';
  END IF;

  IF public.screen_access_mode() IS DISTINCT FROM 'enforced'
     OR public.item_permissions_mode() IS DISTINCT FROM 'preview' THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_POSTFLIGHT_PERMISSION_MODES';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_PERMISSION_MODES enforced/preview';

  IF public.vmp_business_role(v_admin) IS DISTINCT FROM 'admin'
     OR public.vmp_business_role(v_manager) IS DISTINCT FROM 'qa_manager'
     OR NOT EXISTS (SELECT 1 FROM public.profiles profile
                    WHERE profile.id=v_admin AND profile.is_active IS TRUE)
     OR NOT EXISTS (SELECT 1 FROM public.profiles profile
                    WHERE profile.id=v_manager AND profile.is_active IS TRUE) THEN
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
      ON source_object.object_code=master_object.code AND source_object.is_active IS TRUE
    WHERE item.is_active IS TRUE
    GROUP BY item.validation_code HAVING count(source_object.id) <> 1
  ) OR EXISTS (
    SELECT 1 FROM public.vmp_source_objects source_object
    JOIN public.vmp_plan_items item ON item.object_code=source_object.object_code
                                   AND item.is_active IS TRUE
    WHERE source_object.is_active IS TRUE
      AND (source_object.owner_person_id IS DISTINCT FROM item.owner_person_id
        OR source_object.support_person_id IS DISTINCT FROM item.support_person_id)
  ) THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_POSTFLIGHT_EXACT_MAPPING_OWNER_SUPPORT';
  END IF;
  SELECT count(*), md5(string_agg(object_code, E'\n' ORDER BY object_code))
    INTO v_count,v_digest FROM public.vmp_source_objects WHERE is_active IS TRUE;
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
     OR has_function_privilege('anon','public.rpc_source_object_facets(text,jsonb)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.rpc_source_object_facets(text,jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.rpc_export_source_objects(text,text,jsonb,jsonb,integer)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.rpc_export_source_objects(text,text,jsonb,jsonb,integer)','EXECUTE')
     OR has_function_privilege('anon','public.rpc_source_qa_candidates(text,jsonb,integer,uuid[])','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.rpc_source_qa_candidates(text,jsonb,integer,uuid[])','EXECUTE')
     OR has_function_privilege('anon','public.rpc_list_source_workshop_coverage(text,jsonb,integer)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.rpc_list_source_workshop_coverage(text,jsonb,integer)','EXECUTE')
     OR has_function_privilege('anon','public.rpc_source_workshop_scope_choices(text,text,text,jsonb,integer)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.rpc_source_workshop_scope_choices(text,text,text,jsonb,integer)','EXECUTE')
     OR has_function_privilege('anon','public.rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.rpc_refresh_source_item_assignments()','EXECUTE')
     OR has_function_privilege('authenticated','public.rpc_refresh_source_item_assignments()','EXECUTE') THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_POSTFLIGHT_FUNCTION_ACL';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_FUNCTION_ACL';

  -- Lower-role claims are checked through the real wrappers. Counts/digests
  -- only are emitted, never row payloads, identities, or object codes. The
  -- owner/support/unrelated/workshop fixtures are optional: a sparse database
  -- must not be made to manufacture a grant or a persona for this read-only
  -- gate.
  IF v_owner IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',json_build_object('sub',v_owner,'role','authenticated')::text,true);
    IF public.vmp_business_role(v_owner) NOT IN ('qa_staff','qa_manager') THEN
      RAISE EXCEPTION USING errcode='check_violation', message='SOURCE_ACCESS_POSTFLIGHT_OWNER_ROLE';
    END IF;
    v_result:=public.rpc_my_editable_progress_rights();
    IF v_result->>'ok' IS DISTINCT FROM 'true' OR jsonb_array_length(v_result->'rights')=0 THEN
      RAISE EXCEPTION USING errcode='check_violation', message='SOURCE_ACCESS_POSTFLIGHT_OWNER_RIGHTS';
    END IF;
    RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_OWNER_RIGHTS count=%', jsonb_array_length(v_result->'rights');
  END IF;

  IF v_support IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',json_build_object('sub',v_support,'role','authenticated')::text,true);
    IF public.vmp_business_role(v_support) NOT IN ('qa_staff','qa_manager') THEN
      RAISE EXCEPTION USING errcode='check_violation', message='SOURCE_ACCESS_POSTFLIGHT_SUPPORT_ROLE';
    END IF;
    v_result:=public.rpc_my_editable_progress_rights();
    IF v_result->>'ok' IS DISTINCT FROM 'true' OR jsonb_array_length(v_result->'rights')=0 THEN
      RAISE EXCEPTION USING errcode='check_violation', message='SOURCE_ACCESS_POSTFLIGHT_SUPPORT_RIGHTS';
    END IF;
    RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_SUPPORT_RIGHTS count=%', jsonb_array_length(v_result->'rights');
  END IF;

  IF v_unrelated IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',json_build_object('sub',v_unrelated,'role','authenticated')::text,true);
    IF public.vmp_business_role(v_unrelated) IS DISTINCT FROM 'qa_staff' THEN
      RAISE EXCEPTION USING errcode='check_violation', message='SOURCE_ACCESS_POSTFLIGHT_UNRELATED_ROLE';
    END IF;
    v_result:=public.rpc_my_editable_progress_rights();
    IF v_result->>'ok' IS DISTINCT FROM 'true'
       OR jsonb_array_length(v_result->'rights')<>0 THEN
      RAISE EXCEPTION USING errcode='check_violation', message='SOURCE_ACCESS_POSTFLIGHT_UNRELATED_SCOPE';
    END IF;
    RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_UNRELATED_SESSION count=0';
  END IF;

  IF v_workshop IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',json_build_object('sub',v_workshop,'role','authenticated')::text,true);
    IF public.vmp_business_role(v_workshop) NOT IN ('workshop_manager','workshop_staff')
       OR NOT EXISTS (
         SELECT 1 FROM public.vmp_source_workshop_scope_grants grant_row
         JOIN public.vmp_performers performer ON performer.id=grant_row.performer_id
         WHERE performer.user_id=v_workshop AND performer.is_active IS TRUE
           AND grant_row.is_active IS TRUE AND grant_row.valid_from<=transaction_timestamp()
           AND (grant_row.expires_at IS NULL OR grant_row.expires_at>transaction_timestamp())
       ) THEN
      RAISE EXCEPTION USING errcode='check_violation', message='SOURCE_ACCESS_POSTFLIGHT_WORKSHOP_SCOPE';
    END IF;
    v_result:=public.rpc_my_editable_progress_rights();
    IF v_result->>'ok' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION USING errcode='check_violation', message='SOURCE_ACCESS_POSTFLIGHT_WORKSHOP_SESSION';
    END IF;
    RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_WORKSHOP_SESSION count=%', jsonb_array_length(v_result->'rights');
  END IF;

  -- Non-object Source surfaces remain manager-only even when a caller bypasses
  -- navigation.  Probe both lower-role claims through the public wrappers.
  FOREACH v_actor IN ARRAY ARRAY[v_unrelated,v_workshop] LOOP
    IF v_actor IS NULL THEN
      CONTINUE;
    END IF;
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
    v_non_object_surface_probes := v_non_object_surface_probes + 1;
  END LOOP;
  RAISE NOTICE 'PASS SOURCE_ACCESS_POSTFLIGHT_NON_OBJECT_SURFACES_FORBIDDEN count=%',
    v_non_object_surface_probes;

  PERFORM set_config('request.jwt.claims','',true);
END
$postflight$;

ROLLBACK;
SELECT 'PASS SOURCE_ACCESS_POSTFLIGHT' AS status;

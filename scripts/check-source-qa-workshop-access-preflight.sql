\set ON_ERROR_STOP on

-- Read-only release preflight.  This file intentionally owns its transaction;
-- it is safe to run against a linked database before either migration.
BEGIN READ ONLY;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';
\if :{?expected_project_ref}
\o /dev/null
SELECT set_config('vmp.source_access_expected_project', :'expected_project_ref', true)
;
\o
\else
\o /dev/null
SELECT set_config('vmp.source_access_expected_project', '', true);
\o
\endif

DO $preflight$
DECLARE
  v_admin_count bigint;
  v_item_count bigint;
  v_mapping_digest text;
  v_source_digest text;
  v_owner_support_digest text;
  v_candidate_count bigint;
  v_area_less bigint;
  v_refresh oid := to_regprocedure('public.rpc_refresh_source_item_assignments()');
  v_save oid := to_regprocedure('public.rpc_save_catalog_object(text,text,jsonb,text,integer)');
  v_muc oid := to_regprocedure('public.muc_quyen(text,text)');
  v_duoc oid := to_regprocedure('public.duoc_phep(text,text)');
  v_project text := nullif(current_setting('vmp.source_access_expected_project', true), '');
  v_function_digest text;
BEGIN
  IF current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
     OR (SELECT pg_encoding_to_char(encoding) FROM pg_database
         WHERE datname=current_database()) IS DISTINCT FROM 'UTF8'
     OR (SELECT pg_get_userbyid(datdba) FROM pg_database
         WHERE datname=current_database()) IS DISTINCT FROM 'postgres'
     OR current_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_PREFLIGHT_DATABASE_CONTRACT';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_PREFLIGHT_DATABASE_CONTRACT PostgreSQL17';

  IF v_project IS NOT NULL AND v_project <> 'ivembmikfhtyzhtqebgh' THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_PREFLIGHT_PROJECT_CONTRACT';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_PREFLIGHT_PROJECT_CONTRACT';

  IF public.screen_access_mode() IS DISTINCT FROM 'enforced'
     OR public.item_permissions_mode() IS DISTINCT FROM 'preview' THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_PREFLIGHT_PERMISSION_MODES';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_PREFLIGHT_PERMISSION_MODES enforced/preview';

  SELECT count(*) INTO v_admin_count
  FROM public.profiles profile
  WHERE profile.role='admin'::public.user_role
    AND coalesce(profile.is_active,true);
  IF v_admin_count < 1 THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_PREFLIGHT_ACTIVE_ADMIN';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_PREFLIGHT_ACTIVE_ADMIN count=%', v_admin_count;

  SELECT count(*), md5(string_agg(format('%s=%s', status, n), E'\n' ORDER BY status))
    INTO v_item_count, v_mapping_digest
  FROM (
    SELECT CASE count(source_object.id) WHEN 1 THEN 'exact' ELSE 'invalid' END status,
           count(*) n
    FROM public.vmp_plan_items item
    LEFT JOIN public.vmp_objects master_object ON master_object.code=item.object_code
    LEFT JOIN public.vmp_source_objects source_object
      ON source_object.object_code=master_object.code AND source_object.is_active
    WHERE item.is_active
    GROUP BY item.validation_code
  ) mapping;
  IF exists (
       SELECT 1
       FROM public.vmp_plan_items item
       LEFT JOIN public.vmp_objects master_object ON master_object.code=item.object_code
       LEFT JOIN public.vmp_source_objects source_object
         ON source_object.object_code=master_object.code AND source_object.is_active
       WHERE item.is_active
       GROUP BY item.validation_code
       HAVING count(source_object.id) <> 1
     ) THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_PREFLIGHT_ITEM_SOURCE_MAPPING';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_PREFLIGHT_ITEM_SOURCE_MAPPING count=% digest=%',
    v_item_count, v_mapping_digest;

  SELECT md5(string_agg(format('%s=%s', status, n), E'\n' ORDER BY status))
    INTO v_source_digest
  FROM (
    SELECT CASE WHEN count(*)=1 THEN 'unique' ELSE 'duplicate' END status, count(*) n
    FROM public.vmp_source_objects
    WHERE is_active
    GROUP BY object_code
  ) source_codes;
  IF exists (SELECT 1 FROM public.vmp_source_objects
             WHERE is_active GROUP BY object_code HAVING count(*) <> 1) THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_PREFLIGHT_ACTIVE_SOURCE_CODE_UNIQUE';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_PREFLIGHT_ACTIVE_SOURCE_CODE_UNIQUE digest=%',
    v_source_digest;

  SELECT md5(string_agg(format('%s=%s', status, n), E'\n' ORDER BY status))
    INTO v_owner_support_digest
  FROM (
    SELECT CASE WHEN source_object.owner_person_id IS NOT DISTINCT FROM item.owner_person_id
                     AND source_object.support_person_id IS NOT DISTINCT FROM item.support_person_id
                THEN 'consistent' ELSE 'mismatch' END status, count(*) n
    FROM public.vmp_source_objects source_object
    JOIN public.vmp_plan_items item
      ON item.object_code=source_object.object_code AND item.is_active
    WHERE source_object.is_active
    GROUP BY 1
  ) projections;
  IF exists (
       SELECT 1
       FROM public.vmp_source_objects source_object
       JOIN public.vmp_plan_items item
         ON item.object_code=source_object.object_code AND item.is_active
       WHERE source_object.is_active
         AND (source_object.owner_person_id IS DISTINCT FROM item.owner_person_id
           OR source_object.support_person_id IS DISTINCT FROM item.support_person_id)
     ) THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_PREFLIGHT_OWNER_SUPPORT_CONSISTENCY';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_PREFLIGHT_OWNER_SUPPORT_CONSISTENCY digest=%',
    v_owner_support_digest;

  SELECT count(*) INTO v_candidate_count
  FROM public.vmp_performers performer
  JOIN public.profiles profile ON profile.id=performer.user_id
  WHERE performer.is_active AND coalesce(profile.is_active,true)
    AND performer.access_class IN ('qa_manager','qa_progress_editor')
    AND public.vmp_business_role(profile.id) IN ('qa_staff','qa_manager');
  RAISE NOTICE 'PASS SOURCE_ACCESS_PREFLIGHT_CANDIDATE_ELIGIBILITY count=%',
    v_candidate_count;

  SELECT count(*) INTO v_area_less
  FROM public.vmp_source_objects
  WHERE is_active AND nullif(btrim(area_code),'') IS NULL;
  RAISE NOTICE 'PASS SOURCE_ACCESS_PREFLIGHT_AREALESS_SOURCE count=%', v_area_less;

  IF v_refresh IS NULL OR v_save IS NULL OR v_muc IS NULL OR v_duoc IS NULL THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_PREFLIGHT_REVIEWED_FUNCTIONS_MISSING';
  END IF;
  SELECT encode(extensions.digest(pg_get_functiondef(v_refresh),'sha256'),'hex')
    INTO v_function_digest;
  IF v_function_digest <> 'a4bd208fc467a14b9d0383d6af486f59a66f52d8b68d4bc614b92627a73524e7'
     OR encode(extensions.digest(pg_get_functiondef(v_save),'sha256'),'hex')
       <> '81fbd19e43d3859cd28cb958fc311f1f8b693f659aca9371155433a0b70a1d29'
     OR encode(extensions.digest(pg_get_functiondef(v_muc),'sha256'),'hex')
       <> 'f85fe5073e6e6ba1cb4b7c4a03890c2b1338d10c544b0c9bb39c0a115c11ee70'
     OR encode(extensions.digest(pg_get_functiondef(v_duoc),'sha256'),'hex')
       <> '55ef8400cede7c7224dae7246791bc60244b9a4b92fd764aeb28e448b396eb91'
     OR (SELECT proacl::text FROM pg_proc WHERE oid=v_refresh) IS DISTINCT FROM
       '{postgres=X/postgres,service_role=X/postgres}'
     OR (SELECT proacl::text FROM pg_proc WHERE oid=v_muc) IS DISTINCT FROM
       '{postgres=X/postgres,service_role=X/postgres}'
     OR (SELECT proacl::text FROM pg_proc WHERE oid=v_duoc) IS DISTINCT FROM
       '{postgres=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_PREFLIGHT_REVIEWED_FUNCTION_CONTRACT';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_PREFLIGHT_REVIEWED_FUNCTION_CONTRACT refresh=%',
    v_function_digest;

  IF to_regclass('public.vmp_source_workshop_scope_grants') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_class relation
                   WHERE relation.oid='public.vmp_source_workshop_scope_grants'::regclass
                     AND relation.relrowsecurity AND NOT relation.relforcerowsecurity)
       OR has_table_privilege('authenticated','public.vmp_source_workshop_scope_grants','INSERT,UPDATE,DELETE')
       OR has_table_privilege('service_role','public.vmp_source_workshop_scope_grants','INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION USING errcode='check_violation',
        message='SOURCE_ACCESS_PREFLIGHT_GRANT_TABLE_ACL_RLS';
    END IF;
    RAISE NOTICE 'PASS SOURCE_ACCESS_PREFLIGHT_GRANT_TABLE_ACL_RLS';
  ELSE
    RAISE NOTICE 'PASS SOURCE_ACCESS_PREFLIGHT_GRANT_TABLE_ACL_RLS count=0';
  END IF;

  IF EXISTS (SELECT 1 FROM (VALUES
      ('public.vmp_source_objects'::regclass),('public.vmp_plan_items'::regclass)
    ) protected(relation_id)
    WHERE NOT EXISTS (SELECT 1 FROM pg_class relation
                      WHERE relation.oid=protected.relation_id
                        AND relation.relrowsecurity AND NOT relation.relforcerowsecurity)) THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_PREFLIGHT_SOURCE_ITEM_RLS';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_PREFLIGHT_SOURCE_ITEM_RLS';

  IF to_regprocedure('public.vmp_unfiltered_security_definer_item_readers()') IS NOT NULL
     AND has_function_privilege('service_role',
         'public.vmp_unfiltered_security_definer_item_readers()','EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_PREFLIGHT_SECURITY_DEFINER_INVENTORY_ACL';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_PREFLIGHT_SECURITY_DEFINER_INVENTORY';
END
$preflight$;

ROLLBACK;

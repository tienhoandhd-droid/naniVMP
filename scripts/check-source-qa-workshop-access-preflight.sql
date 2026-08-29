-- Read-only release preflight.  This file intentionally owns its transaction;
-- it is safe to run against a linked database before either migration.
BEGIN READ ONLY;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
DECLARE
  v_admin_count bigint;
  v_item_count bigint;
  v_master_mapping_issues bigint;
  v_mapping_digest text;
  v_source_digest text;
  v_owner_support_digest text;
  v_owner_support_mismatches bigint;
  v_projection_missing bigint;
  v_primary_conflicts bigint;
  v_unresolved_active_performers bigint;
  v_ineligible_current_relations bigint;
  v_candidate_count bigint;
  v_area_less bigint;
  v_refresh oid := to_regprocedure('public.rpc_refresh_source_item_assignments()');
  v_save oid := to_regprocedure('public.rpc_save_catalog_object(text,text,jsonb,text,integer)');
  v_muc oid := to_regprocedure('public.muc_quyen(text,text)');
  v_duoc oid := to_regprocedure('public.duoc_phep(text,text)');
  v_function_digest text;
BEGIN
  IF current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
     OR (SELECT pg_encoding_to_char(encoding) FROM pg_database
         WHERE datname=current_database()) IS DISTINCT FROM 'UTF8'
     OR (SELECT datcollate FROM pg_database
         WHERE datname=current_database()) IS DISTINCT FROM 'en_US.UTF-8'
     OR (SELECT datctype FROM pg_database
         WHERE datname=current_database()) IS DISTINCT FROM 'en_US.UTF-8'
     OR (SELECT pg_get_userbyid(datdba) FROM pg_database
         WHERE datname=current_database()) IS DISTINCT FROM 'postgres'
     OR current_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_PREFLIGHT_DATABASE_CONTRACT';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_PREFLIGHT_DATABASE_CONTRACT PostgreSQL17';

  IF public.screen_access_mode() IS DISTINCT FROM 'enforced'
     OR public.item_permissions_mode() IS DISTINCT FROM 'preview' THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_PREFLIGHT_PERMISSION_MODES';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_PREFLIGHT_PERMISSION_MODES enforced/preview';

  SELECT count(*) INTO v_admin_count
  FROM public.profiles profile
  WHERE profile.role='admin'::public.user_role
    AND profile.is_active IS TRUE;
  IF v_admin_count < 1 THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_PREFLIGHT_ACTIVE_ADMIN';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_PREFLIGHT_ACTIVE_ADMIN count=%', v_admin_count;

  SELECT count(*), md5(string_agg(format('%s=%s', status, n), E'\n' ORDER BY status))
    INTO v_item_count, v_mapping_digest
  FROM (
    SELECT CASE WHEN count(*)=1 THEN 'exact' ELSE 'invalid' END status, count(*) n
    FROM public.vmp_plan_items item
    WHERE item.is_active IS TRUE
    GROUP BY item.validation_code
  ) mapping;
  SELECT count(*) INTO v_master_mapping_issues
  FROM public.vmp_plan_items item
  WHERE item.is_active IS TRUE
    AND (SELECT count(*)
         FROM public.vmp_objects master_object
         WHERE master_object.code=item.object_code) <> 1;
  IF EXISTS (
       SELECT 1 FROM public.vmp_plan_items item
       WHERE item.is_active IS TRUE AND NOT EXISTS (
         SELECT 1 FROM public.vmp_source_objects source_object
         WHERE source_object.object_code=item.object_code AND source_object.is_active IS TRUE)
     )
     OR v_master_mapping_issues > 0
     OR EXISTS (
       SELECT 1 FROM public.vmp_plan_items item
       WHERE item.is_active IS TRUE AND (
         SELECT count(*) FROM public.vmp_source_objects source_object
         WHERE source_object.object_code=item.object_code AND source_object.is_active IS TRUE) > 1
     )
     OR EXISTS (
       SELECT 1 FROM public.vmp_source_objects source_object
       WHERE source_object.is_active IS TRUE
       GROUP BY source_object.object_code HAVING count(*) > 1
     ) THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_PREFLIGHT_ITEM_MASTER_SOURCE_MAPPING';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_PREFLIGHT_ITEM_SOURCE_MAPPING count=% master_mapping_issues=% digest=%',
    v_item_count, v_master_mapping_issues, v_mapping_digest;

  SELECT md5(string_agg(format('%s=%s', status, n), E'\n' ORDER BY status))
    INTO v_source_digest
  FROM (
    SELECT CASE WHEN count(*)=1 THEN 'unique' ELSE 'duplicate' END status, count(*) n
    FROM public.vmp_source_objects
    WHERE is_active IS TRUE
    GROUP BY object_code
  ) source_codes;
  IF EXISTS (SELECT 1 FROM public.vmp_source_objects
             WHERE is_active IS TRUE GROUP BY object_code HAVING count(*) > 1) THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_PREFLIGHT_ACTIVE_SOURCE_CODE_UNIQUE';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_PREFLIGHT_ACTIVE_SOURCE_CODE_UNIQUE digest=%',
    v_source_digest;

  SELECT md5(string_agg(format('%s=%s', status, n), E'\n' ORDER BY status)),
         coalesce(sum(n) FILTER (WHERE status='mismatch'),0)
    INTO v_owner_support_digest, v_owner_support_mismatches
  FROM (
    SELECT CASE WHEN source_object.owner_person_id IS NOT DISTINCT FROM item.owner_person_id
                     AND source_object.support_person_id IS NOT DISTINCT FROM item.support_person_id
                THEN 'consistent' ELSE 'mismatch' END status, count(*) n
    FROM public.vmp_source_objects source_object
    JOIN public.vmp_plan_items item
      ON item.object_code=source_object.object_code AND item.is_active IS TRUE
    WHERE source_object.is_active IS TRUE
    GROUP BY 1
  ) projections;

  SELECT count(*) INTO v_unresolved_active_performers
  FROM public.vmp_performers performer
  WHERE performer.is_active IS TRUE AND performer.user_id IS NULL;

  SELECT count(*) INTO v_ineligible_current_relations
  FROM public.vmp_source_objects source_object
  CROSS JOIN LATERAL unnest(array[
    source_object.owner_person_id, source_object.support_person_id
  ]) relation_person(person_id)
  WHERE source_object.is_active IS TRUE
    AND relation_person.person_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.vmp_performers performer
      WHERE performer.id=relation_person.person_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.vmp_performers performer
      JOIN public.profiles profile ON profile.id=performer.user_id
      WHERE performer.id=relation_person.person_id
        AND performer.is_active IS TRUE
        AND performer.user_id IS NOT NULL
        AND profile.is_active IS TRUE
        AND public.vmp_business_role(performer.user_id) IN ('qa_staff','qa_manager')
    );

  -- Only an otherwise consistent Source -> item relation belongs to the
  -- projection inventory. A relation mismatch remains a release blocker and
  -- is excluded from this inventory.
  SELECT count(*) INTO v_projection_missing
  FROM public.vmp_plan_items item
  JOIN public.vmp_source_objects source_object
    ON source_object.object_code=item.object_code
   AND source_object.is_active IS TRUE
   AND source_object.owner_person_id IS NOT DISTINCT FROM item.owner_person_id
   AND source_object.support_person_id IS NOT DISTINCT FROM item.support_person_id
  CROSS JOIN LATERAL unnest(array[
    source_object.owner_person_id, source_object.support_person_id
  ]) relation_person(person_id)
  WHERE item.is_active IS TRUE
    AND relation_person.person_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.vmp_performers performer
      JOIN public.profiles profile ON profile.id=performer.user_id
      WHERE performer.id=relation_person.person_id
        AND performer.is_active IS TRUE
        AND performer.user_id IS NOT NULL
        AND profile.is_active IS TRUE
        AND public.vmp_business_role(performer.user_id) IN ('qa_staff','qa_manager')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.vmp_item_assignments assignment
      WHERE assignment.validation_code=item.validation_code
        AND assignment.performer_id=relation_person.person_id
        AND assignment.assignment_kind='qa'
        AND assignment.is_active IS TRUE
    );

  SELECT count(*) INTO v_primary_conflicts
  FROM public.vmp_plan_items item
  JOIN public.vmp_source_objects source_object
    ON source_object.object_code=item.object_code AND source_object.is_active IS TRUE
   AND source_object.owner_person_id IS NOT DISTINCT FROM item.owner_person_id
   AND source_object.support_person_id IS NOT DISTINCT FROM item.support_person_id
  JOIN public.vmp_item_assignments assignment
    ON assignment.validation_code=item.validation_code
   AND assignment.assignment_kind='qa'
   AND assignment.is_active IS TRUE
   AND assignment.assignment_role='primary'
  WHERE item.is_active IS TRUE
    AND source_object.owner_person_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.vmp_performers performer
      JOIN public.profiles profile ON profile.id=performer.user_id
      WHERE performer.id=source_object.owner_person_id
        AND performer.is_active IS TRUE
        AND performer.user_id IS NOT NULL
        AND profile.is_active IS TRUE
        AND public.vmp_business_role(performer.user_id) IN ('qa_staff','qa_manager')
    )
    AND assignment.performer_id IS DISTINCT FROM source_object.owner_person_id;
  RAISE NOTICE
    'PASS SOURCE_ACCESS_PREFLIGHT_OWNER_SUPPORT_CONSISTENCY digest=% owner_support_mismatches=% projection_missing=% primary_conflicts=% unresolved_active_performers=% ineligible_current_relations=%',
    v_owner_support_digest, coalesce(v_owner_support_mismatches,0),
    coalesce(v_projection_missing,0), coalesce(v_primary_conflicts,0),
    coalesce(v_unresolved_active_performers,0),
    coalesce(v_ineligible_current_relations,0);
  IF coalesce(v_owner_support_mismatches,0) > 0 THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_PREFLIGHT_SOURCE_ITEM_OWNER_SUPPORT_MISMATCH';
  END IF;

  IF EXISTS (
       SELECT performer.user_id
       FROM public.vmp_performers performer
       WHERE performer.is_active IS TRUE AND performer.user_id IS NOT NULL
       GROUP BY performer.user_id
       HAVING count(*) > 1
     )
     OR EXISTS (
       SELECT 1
       FROM public.vmp_source_objects source_object
       CROSS JOIN LATERAL unnest(array[
         source_object.owner_person_id, source_object.support_person_id
       ]) relation_person(person_id)
       WHERE source_object.is_active IS TRUE
         AND relation_person.person_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.vmp_performers performer
           WHERE performer.id=relation_person.person_id
         )
     ) THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_PREFLIGHT_QA_PRINCIPAL';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_PREFLIGHT_QA_PRINCIPAL unresolved_active_performers=% ineligible_current_relations=%',
    v_unresolved_active_performers, v_ineligible_current_relations;

  SELECT count(*) INTO v_candidate_count
  FROM public.vmp_performers performer
  JOIN public.profiles profile ON profile.id=performer.user_id
  WHERE performer.is_active IS TRUE AND profile.is_active IS TRUE
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
SELECT 'PASS SOURCE_ACCESS_PREFLIGHT' AS status;

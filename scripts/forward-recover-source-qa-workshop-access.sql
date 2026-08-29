-- Forward-only, fail-closed recovery. This artifact changes only reviewed
-- function boundaries and ACL inheritance. It never removes relation/grant/
-- audit rows, changes credentials, restores a database, or reinstates a
-- session-wide reader.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(
  pg_catalog.hashtextextended('vmp.source_qa_workshop_access.release',0));

DO $recovery_precondition$
DECLARE
  v_projection text;
  v_hash text;
  v_revision bigint;
BEGIN
  IF current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
     OR current_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_RECOVERY_DATABASE_CONTRACT';
  END IF;
  IF public.screen_access_mode() IS DISTINCT FROM 'enforced'
     OR public.item_permissions_mode() IS DISTINCT FROM 'preview' THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_RECOVERY_PERMISSION_MODES';
  END IF;

  -- These are the exact reviewed PostgreSQL-17 definitions used by both
  -- migrations.  A drifted database is never modified by this artifact.
  IF encode(extensions.digest(pg_get_functiondef(
       'public.vmp_source_scope_key(text)'::regprocedure),'sha256'),'hex')
       <> '996e739b8d13b34a2c249192d22badaab03d72b85e35c23f5c97648a5ac7a80c'
     OR encode(extensions.digest(pg_get_functiondef(
       'public.vmp_exact_active_source_for_item(text)'::regprocedure),'sha256'),'hex')
       <> 'b0d178faa5b18b66d319b6dc40be80acba998d02c816798e492f9fbbe1729173'
     OR encode(extensions.digest(pg_get_functiondef(
       'public.vmp_reconcile_source_qa_projection(uuid)'::regprocedure),'sha256'),'hex')
       <> 'e74e12b5803dfcc541b2fed9f0316f64a4b056b8fa388892cda51b6854283402'
     OR encode(extensions.digest(pg_get_functiondef(
       'public.vmp_touch_authorization_revision()'::regprocedure),'sha256'),'hex')
       <> 'edcc77dd4e37606e19e0340d3e5117faaed5c75cd068462d0069201e97dec8e4' THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_RECOVERY_REVIEWED_FUNCTION_HASH_DRIFT';
  END IF;

  -- The recovery boundary is the reviewed visibility predicate, not an ACL
  -- cut on shared browser entry points. Pin both definitions before replacing
  -- them so a drifted predicate is never modified blindly.
  IF encode(extensions.digest(pg_get_functiondef(
       'public.vmp_can_view_source_object(uuid,uuid)'::regprocedure),'sha256'),'hex')
       IS DISTINCT FROM 'ccae134cd5ff03e4b6f5c2bc7c277afbaa7c993aa9998ca8e4eccb58cc90430e'
     OR encode(extensions.digest(pg_get_functiondef(
       'public.vmp_can_view_plan_item(uuid,text)'::regprocedure),'sha256'),'hex')
       IS DISTINCT FROM '54d9590a2d58404fd63ee6900358a14ae02f4d0bd5b337e57a269b01a3614ea7' THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_RECOVERY_REVIEWED_VISIBILITY_PREDICATE_HASH_DRIFT';
  END IF;

  -- The page path has its own authorization CTE, so pin both it and the
  -- shared browser wrapper before installing the manager-only recovery gate.
  IF encode(extensions.digest(pg_get_functiondef(
       'public.vmp_source_objects_page_path(uuid,text,text,jsonb,jsonb,integer,boolean,uuid)'::regprocedure),'sha256'),'hex')
       IS DISTINCT FROM '819079f0ec8d9e710cf3a9cebcdc3ccb7734ab21e8e4b23db6875488d3bf3bcf'
     OR encode(extensions.digest(pg_get_functiondef(
       'public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)'::regprocedure),'sha256'),'hex')
       IS DISTINCT FROM '602434023178d4bae267ccb6c98697179ef1e569d57e12df0278a1c203add3fa' THEN
    RAISE EXCEPTION USING errcode='check_violation',
       message='SOURCE_ACCESS_RECOVERY_REVIEWED_SOURCE_PAGE_HASH_DRIFT';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM pg_proc procedure
       JOIN pg_roles owner ON owner.oid=procedure.proowner
       JOIN pg_language language ON language.oid=procedure.prolang
       WHERE procedure.oid='public.vmp_source_objects_page_path(uuid,text,text,jsonb,jsonb,integer,boolean,uuid)'::regprocedure
         AND owner.rolname='postgres' AND language.lanname='sql'
         AND procedure.provolatile='s' AND NOT procedure.prosecdef
         AND procedure.proconfig IS NULL
         AND procedure.proacl::text='{postgres=X/postgres,service_role=X/postgres}'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc procedure
       JOIN pg_roles owner ON owner.oid=procedure.proowner
       JOIN pg_language language ON language.oid=procedure.prolang
       WHERE procedure.oid='public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)'::regprocedure
         AND owner.rolname='postgres' AND language.lanname='sql'
         AND procedure.provolatile='s' AND procedure.prosecdef
         AND procedure.proconfig=array['search_path=public, pg_temp']::text[]
         AND procedure.proacl::text='{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
     ) THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_RECOVERY_REVIEWED_SOURCE_PAGE_METADATA_DRIFT';
  END IF;

  IF to_regclass('public.vmp_source_workshop_scope_grants') IS NULL
     OR to_regclass('public.vmp_authorization_revision') IS NULL
     OR to_regprocedure('public.vmp_can_view_source_object(uuid,uuid)') IS NULL
     OR to_regprocedure('public.vmp_can_view_plan_item(uuid,text)') IS NULL
     OR to_regprocedure('public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)') IS NULL
     OR to_regprocedure('public.rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)') IS NULL THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_RECOVERY_SCHEMA_CONTRACT';
  END IF;

  -- Capture a digest before recovery and make it a transaction postcondition.
  -- This proves no projection or authorization row changed.
  SELECT concat_ws('|',s.n,s.h,p.n,p.h,a.n,a.h,g.n,g.h) INTO v_projection
  FROM (SELECT count(*) n, encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY r.id::text),''),'UTF8'),'sha256'),'hex') h FROM public.vmp_source_objects r) s
  CROSS JOIN (SELECT count(*) n, encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY r.id::text),''),'UTF8'),'sha256'),'hex') h FROM public.vmp_plan_items r) p
  CROSS JOIN (SELECT count(*) n, encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY r.id::text),''),'UTF8'),'sha256'),'hex') h FROM public.vmp_item_assignments r) a
  CROSS JOIN (SELECT count(*) n, encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY r.id::text),''),'UTF8'),'sha256'),'hex') h FROM public.vmp_source_workshop_scope_grants r) g;
  PERFORM set_config('vmp.source_access_recovery_projection',v_projection,true);
  SELECT revision INTO v_revision FROM public.vmp_authorization_revision WHERE singleton;
  PERFORM set_config('vmp.source_access_recovery_revision_before',v_revision::text,true);
END
$recovery_precondition$;

-- Keep authenticated ACLs on shared browser wrappers. Their visibility
-- predicate is replaced below so Admin/QA Manager list and repair survive
-- while lower-role Source reads fail closed.
REVOKE ALL ON FUNCTION public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)
  FROM public, anon;
REVOKE ALL ON FUNCTION public.rpc_source_object_facets(text,jsonb)
  FROM public, anon;
REVOKE ALL ON FUNCTION public.rpc_export_source_objects(text,text,jsonb,jsonb,integer)
  FROM public, anon;
REVOKE ALL ON FUNCTION public.rpc_source_qa_candidates(text,jsonb,integer,uuid[])
  FROM public, anon;
REVOKE ALL ON FUNCTION public.rpc_list_source_workshop_coverage(text,jsonb,integer)
  FROM public, anon;
REVOKE ALL ON FUNCTION public.rpc_source_workshop_scope_choices(text,text,text,jsonb,integer)
  FROM public, anon;
REVOKE ALL ON FUNCTION public.rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)
  FROM public, anon;

CREATE OR REPLACE FUNCTION public.vmp_can_view_source_object(
  p_uid uuid,p_source_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public,pg_temp
AS $function$
  WITH actor AS (
    SELECT public.vmp_business_role(p_uid) role_name,
           public.vmp_is_active_session(p_uid) active_session,
           (coalesce(auth.role(),'')='service_role'
            OR p_uid IS NOT DISTINCT FROM auth.uid()) caller_matches
  )
  SELECT actor.caller_matches
     AND actor.active_session
     AND actor.role_name IN ('admin','qa_manager')
     AND EXISTS (
       SELECT 1 FROM public.vmp_source_objects source_object
       WHERE source_object.id=p_source_id
     )
  FROM actor
$function$;

CREATE OR REPLACE FUNCTION public.vmp_can_view_plan_item(
  p_uid uuid,p_validation_code text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public,pg_temp
AS $function$
  SELECT coalesce((
    SELECT public.vmp_can_view_source_object(p_uid,source_object.id)
    FROM public.vmp_exact_active_source_for_item(p_validation_code) source_object
  ),false)
$function$;

-- The existing page path contains lower-role authorization branches that are
-- correct in the normal rollout but must be fenced by the forward recovery.
-- Keep the shared authenticated wrapper and return a sanitized denial object
-- before delegating to that path for Admin/QA Manager only.
CREATE OR REPLACE FUNCTION public.rpc_list_source_objects(
  p_object_kind text,p_search text,p_filters jsonb,p_cursor jsonb,
  p_limit integer,p_include_inactive boolean,p_object_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public,pg_temp
AS $function$
  SELECT CASE
    WHEN public.vmp_is_active_session(auth.uid())
     AND public.vmp_business_role(auth.uid()) IN ('admin','qa_manager')
    THEN (
      SELECT query_path.payload
      FROM public.vmp_source_objects_page_path(
        auth.uid(),p_object_kind,p_search,p_filters,p_cursor,p_limit,
        p_include_inactive,p_object_id
      ) query_path
    )
    ELSE jsonb_build_object(
      'ok',false,'error_code','FORBIDDEN',
      'error','Không có quyền xem Source')
    END
$function$;

-- Direct table reads are also closed during recovery; SECURITY DEFINER repair
-- paths retain their reviewed owner execution and continue to serve managers.
REVOKE SELECT ON public.vmp_source_objects, public.vmp_plan_items,
  public.vmp_source_workshop_scope_grants, public.vmp_item_assignments
  FROM authenticated;

-- Recovery changes the visibility boundary, so invalidate every same-revision
-- browser cache exactly once.  No row projection or grant row is touched.
DO $recovery_revision_bump$
DECLARE
  v_before bigint:=current_setting('vmp.source_access_recovery_revision_before')::bigint;
  v_after bigint;
BEGIN
  UPDATE public.vmp_authorization_revision
  SET revision=revision+1
  WHERE singleton
  RETURNING revision INTO v_after;
  IF v_after IS DISTINCT FROM v_before+1 THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_RECOVERY_REVISION_NOT_EXACTLY_ONCE';
  END IF;
END
$recovery_revision_bump$;

DO $recovery_postcondition$
DECLARE
  v_projection text;
  v_expected text:=current_setting('vmp.source_access_recovery_projection');
  v_revision_before bigint:=current_setting('vmp.source_access_recovery_revision_before')::bigint;
  v_revision_after bigint;
  v_lower_actor uuid;
  v_lower_workshop uuid;
  v_result jsonb;
BEGIN
  SELECT concat_ws('|',s.n,s.h,p.n,p.h,a.n,a.h,g.n,g.h) INTO v_projection
  FROM (SELECT count(*) n, encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY r.id::text),''),'UTF8'),'sha256'),'hex') h FROM public.vmp_source_objects r) s
  CROSS JOIN (SELECT count(*) n, encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY r.id::text),''),'UTF8'),'sha256'),'hex') h FROM public.vmp_plan_items r) p
  CROSS JOIN (SELECT count(*) n, encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY r.id::text),''),'UTF8'),'sha256'),'hex') h FROM public.vmp_item_assignments r) a
  CROSS JOIN (SELECT count(*) n, encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY r.id::text),''),'UTF8'),'sha256'),'hex') h FROM public.vmp_source_workshop_scope_grants r) g;
  SELECT revision INTO v_revision_after FROM public.vmp_authorization_revision WHERE singleton;
  IF v_projection IS DISTINCT FROM v_expected
     OR v_revision_after IS DISTINCT FROM v_revision_before+1
     OR NOT has_function_privilege('authenticated','public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.rpc_save_catalog_object(text,text,jsonb,text,integer)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.rpc_source_object_facets(text,jsonb)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.rpc_export_source_objects(text,text,jsonb,jsonb,integer)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.rpc_source_qa_candidates(text,jsonb,integer,uuid[])','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.rpc_list_source_workshop_coverage(text,jsonb,integer)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.rpc_source_workshop_scope_choices(text,text,text,jsonb,integer)','EXECUTE')
     OR has_function_privilege('public','public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)','EXECUTE')
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc procedure
       WHERE procedure.oid='public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)'::regprocedure
         AND procedure.proacl::text='{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
     )
     OR (SELECT proacl::text FROM pg_proc
         WHERE oid='public.vmp_source_objects_page_path(uuid,text,text,jsonb,jsonb,integer,boolean,uuid)'::regprocedure)
          IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_RECOVERY_POSTCONDITION';
  END IF;
  IF encode(extensions.digest(pg_get_functiondef(
       'public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)'::regprocedure),'sha256'),'hex')
       IS DISTINCT FROM 'd45c4ac361335cda3a99cbb50d8e24addd20930e76baa2ad4ffddc3d4debfc68'
     OR has_function_privilege('anon','public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)','EXECUTE') THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_RECOVERY_POSTCONDITION_SOURCE_PAGE_GATE';
  END IF;
  IF encode(extensions.digest(pg_get_functiondef(
       'public.vmp_can_view_source_object(uuid,uuid)'::regprocedure),'sha256'),'hex')
       IS DISTINCT FROM 'e13cead1d6b445b7827244a2ccb072fb2e478ee8de316feb5ec6047736b851d2'
     OR encode(extensions.digest(pg_get_functiondef(
       'public.vmp_can_view_plan_item(uuid,text)'::regprocedure),'sha256'),'hex')
       IS DISTINCT FROM 'c6528d13c96629273d413d0b64c2a0565f3d0387bdd0cc5074361f710d484e9f' THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_RECOVERY_POSTCONDITION_MANAGER_PREDICATE_HASH';
  END IF;
  SELECT performer.user_id INTO v_lower_actor
  FROM public.vmp_performers performer
  JOIN public.profiles profile ON profile.id=performer.user_id
  WHERE performer.is_active AND performer.user_id IS NOT NULL AND profile.is_active
    AND public.vmp_business_role(performer.user_id)='qa_staff'
  ORDER BY performer.id LIMIT 1;
  IF v_lower_actor IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',json_build_object(
      'sub',v_lower_actor,'role','authenticated')::text,true);
    v_result:=public.rpc_list_source_objects(null,null,'{}'::jsonb,null,10,false,null);
    IF v_result->>'error_code' IS DISTINCT FROM 'FORBIDDEN'
       OR v_result ? 'rows' THEN
      RAISE EXCEPTION USING errcode='check_violation',
        message='SOURCE_ACCESS_RECOVERY_LOWER_SOURCE_LIST_NOT_FORBIDDEN';
    END IF;
    PERFORM set_config('request.jwt.claims','',true);
  END IF;
  SELECT performer.user_id INTO v_lower_workshop
  FROM public.vmp_performers performer
  JOIN public.profiles profile ON profile.id=performer.user_id
  WHERE performer.is_active AND performer.user_id IS NOT NULL AND profile.is_active
    AND public.vmp_business_role(performer.user_id) IN ('workshop_manager','workshop_staff')
  ORDER BY performer.id LIMIT 1;
  IF v_lower_workshop IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',json_build_object(
      'sub',v_lower_workshop,'role','authenticated')::text,true);
    v_result:=public.rpc_list_source_objects(null,null,'{}'::jsonb,null,10,false,null);
    IF v_result->>'error_code' IS DISTINCT FROM 'FORBIDDEN'
       OR v_result ? 'rows' THEN
      RAISE EXCEPTION USING errcode='check_violation',
        message='SOURCE_ACCESS_RECOVERY_LOWER_WORKSHOP_LIST_NOT_FORBIDDEN';
    END IF;
    PERFORM set_config('request.jwt.claims','',true);
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_RECOVERY_FORWARD_FAIL_CLOSED projection_unchanged revision_increment=1';
END
$recovery_postcondition$;

COMMIT;
SELECT 'PASS SOURCE_ACCESS_RECOVERY' AS status;

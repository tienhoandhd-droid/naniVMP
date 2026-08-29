\set ON_ERROR_STOP on

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
  SELECT concat_ws('|',s.n,s.h,p.n,p.h,a.n,a.h) INTO v_projection
  FROM (SELECT count(*) n, encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY r.id::text),''),'UTF8'),'sha256'),'hex') h FROM public.vmp_source_objects r) s
  CROSS JOIN (SELECT count(*) n, encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY r.id::text),''),'UTF8'),'sha256'),'hex') h FROM public.vmp_plan_items r) p
  CROSS JOIN (SELECT count(*) n, encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY r.id::text),''),'UTF8'),'sha256'),'hex') h FROM public.vmp_item_assignments r) a;
  PERFORM set_config('vmp.source_access_recovery_projection',v_projection,true);
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

-- Direct table reads are also closed during recovery; SECURITY DEFINER repair
-- paths retain their reviewed owner execution and continue to serve managers.
REVOKE SELECT ON public.vmp_source_objects, public.vmp_plan_items,
  public.vmp_source_workshop_scope_grants, public.vmp_item_assignments
  FROM authenticated;

DO $recovery_postcondition$
DECLARE
  v_projection text;
  v_expected text:=current_setting('vmp.source_access_recovery_projection');
BEGIN
  SELECT concat_ws('|',s.n,s.h,p.n,p.h,a.n,a.h) INTO v_projection
  FROM (SELECT count(*) n, encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY r.id::text),''),'UTF8'),'sha256'),'hex') h FROM public.vmp_source_objects r) s
  CROSS JOIN (SELECT count(*) n, encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY r.id::text),''),'UTF8'),'sha256'),'hex') h FROM public.vmp_plan_items r) p
  CROSS JOIN (SELECT count(*) n, encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY r.id::text),''),'UTF8'),'sha256'),'hex') h FROM public.vmp_item_assignments r) a;
  IF v_projection IS DISTINCT FROM v_expected
     OR NOT has_function_privilege('authenticated','public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.rpc_save_catalog_object(text,text,jsonb,text,integer)','EXECUTE') THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_RECOVERY_POSTCONDITION';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_RECOVERY_FORWARD_FAIL_CLOSED projection_unchanged';
END
$recovery_postcondition$;

COMMIT;

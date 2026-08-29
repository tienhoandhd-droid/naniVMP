\set ON_ERROR_STOP on

-- Forward-only, fail-closed recovery.  This artifact changes ACLs only.  It
-- never removes relation/grant/audit rows, changes credentials, restores a
-- database, or reinstates a session-wide reader.
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
       <> 'daca32ee71c0c0b04767296822cd2ac0f8010433c9c8d2286d08dee882966187'
     OR encode(extensions.digest(pg_get_functiondef(
       'public.vmp_reconcile_source_qa_projection(uuid)'::regprocedure),'sha256'),'hex')
       <> 'e74e12b5803dfcc541b2fed9f0316f64a4b056b8fa388892cda51b6854283402'
     OR encode(extensions.digest(pg_get_functiondef(
       'public.vmp_touch_authorization_revision()'::regprocedure),'sha256'),'hex')
       <> 'edcc77dd4e37606e19e0340d3e5117faaed5c75cd068462d0069201e97dec8e4' THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_RECOVERY_REVIEWED_FUNCTION_HASH_DRIFT';
  END IF;

  IF to_regclass('public.vmp_source_workshop_scope_grants') IS NULL
     OR to_regclass('public.vmp_authorization_revision') IS NULL
     OR to_regprocedure('public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)') IS NULL
     OR to_regprocedure('public.rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)') IS NULL THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_RECOVERY_SCHEMA_CONTRACT';
  END IF;

  -- Capture a digest before the ACL-only recovery and make it a transaction
  -- postcondition.  This proves no projection or authorization row changed.
  SELECT concat_ws('|',s.n,s.h,p.n,p.h,a.n,a.h) INTO v_projection
  FROM (SELECT count(*) n, encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY r.id::text),''),'UTF8'),'sha256'),'hex') h FROM public.vmp_source_objects r) s
  CROSS JOIN (SELECT count(*) n, encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY r.id::text),''),'UTF8'),'sha256'),'hex') h FROM public.vmp_plan_items r) p
  CROSS JOIN (SELECT count(*) n, encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY r.id::text),''),'UTF8'),'sha256'),'hex') h FROM public.vmp_item_assignments r) a;
  PERFORM set_config('vmp.source_access_recovery_projection',v_projection,true);
END
$recovery_precondition$;

-- Cut off the newly introduced browser surface and coverage mutator.  The
-- existing manager Source save/repair functions are intentionally untouched.
REVOKE ALL ON FUNCTION public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_source_object_facets(text,jsonb)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_export_source_objects(text,text,jsonb,jsonb,integer)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_source_qa_candidates(text,jsonb,integer,uuid[])
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_list_source_workshop_coverage(text,jsonb,integer)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_source_workshop_scope_choices(text,text,text,jsonb,integer)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)
  FROM public, anon, authenticated;

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
     OR has_function_privilege('authenticated','public.rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.rpc_save_catalog_object(text,text,jsonb,text,integer)','EXECUTE') THEN
    RAISE EXCEPTION USING errcode='check_violation',
      message='SOURCE_ACCESS_RECOVERY_POSTCONDITION';
  END IF;
  RAISE NOTICE 'PASS SOURCE_ACCESS_RECOVERY_FORWARD_FAIL_CLOSED projection_unchanged';
END
$recovery_postcondition$;

COMMIT;

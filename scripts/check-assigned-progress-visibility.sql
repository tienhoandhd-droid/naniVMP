\set ON_ERROR_STOP on

\if :{?admin_id}
\else
begin read only;
do $$ begin raise exception using errcode='22023',
  message='CHECK_ASSIGNED_PROGRESS_ADMIN_ID_REQUIRED'; end $$;
\endif
\if :{?qa_manager_id}
\else
begin read only;
do $$ begin raise exception using errcode='22023',
  message='CHECK_ASSIGNED_PROGRESS_QA_MANAGER_ID_REQUIRED'; end $$;
\endif
\if :{?assigned_qa_id}
\else
begin read only;
do $$ begin raise exception using errcode='22023',
  message='CHECK_ASSIGNED_PROGRESS_ASSIGNED_QA_ID_REQUIRED'; end $$;
\endif
\if :{?unassigned_qa_id}
\else
begin read only;
do $$ begin raise exception using errcode='22023',
  message='CHECK_ASSIGNED_PROGRESS_UNASSIGNED_QA_ID_REQUIRED'; end $$;
\endif
\if :{?thien_my_id}
\else
begin read only;
do $$ begin raise exception using errcode='22023',
  message='CHECK_ASSIGNED_PROGRESS_THIEN_MY_ID_REQUIRED'; end $$;
\endif

begin read only;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

\o /dev/null
select set_config('vmp.assigned_progress_check_admin', :'admin_id', true);
select set_config('vmp.assigned_progress_check_manager', :'qa_manager_id', true);
select set_config('vmp.assigned_progress_check_assigned_qa', :'assigned_qa_id', true);
select set_config('vmp.assigned_progress_check_unassigned_qa', :'unassigned_qa_id', true);
select set_config('vmp.assigned_progress_check_thien_my', :'thien_my_id', true);
\o

do $checks$
declare
  v_admin uuid := current_setting('vmp.assigned_progress_check_admin')::uuid;
  v_manager uuid := current_setting('vmp.assigned_progress_check_manager')::uuid;
  v_assigned_qa uuid := current_setting('vmp.assigned_progress_check_assigned_qa')::uuid;
  v_unassigned_qa uuid := current_setting('vmp.assigned_progress_check_unassigned_qa')::uuid;
  v_thien_my uuid := current_setting('vmp.assigned_progress_check_thien_my')::uuid;
  v_workshop uuid;
  v_batch jsonb;
  v_preflight jsonb;
  v_old_claims text := current_setting('request.jwt.claims', true);
  v_definition text;
  v_count integer;
  v_digest text;
  v_warning_count integer;
  v_warning_digest text;
  v_local boolean;
begin
  if v_admin=v_manager or v_admin=v_assigned_qa or v_admin=v_unassigned_qa
     or v_admin=v_thien_my or v_manager=v_assigned_qa
     or v_manager=v_unassigned_qa or v_manager=v_thien_my then
    raise exception using errcode='check_violation',
      message='CHECK_ASSIGNED_PROGRESS_PERSONA_IDS_INVALID';
  end if;

  if public.screen_access_mode() is distinct from 'enforced'
     or public.item_permissions_mode() is distinct from 'preview' then
    raise exception using errcode='check_violation',
      message='CHECK_ASSIGNED_PROGRESS_PERMISSION_MODES';
  end if;
  raise notice 'PASS CHECK_ASSIGNED_PROGRESS_PERMISSION_MODES enforced/preview';

  if exists (
    select 1
    from (values
      ('public.rpc_my_editable_progress_rights()',
       'a769f237d9f92c52ca9bfb5c5f6511a3b96078dd3015678bc6e78003f7243f6b',
       '2a1ef91d0f29fa4af8e8a31223aea79e81dbf05d2c6c031cc6225d41f1d27492'),
      ('public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)',
       'd0df69bd8e9f7a2d8cfa5f5f87bd15e4559599d05c125e0b35f038ca5b25865a',
       '796e6afd55e5b79a064cf28ea74ff5b0a79589434d67e373b2c529482669d661'),
      ('public.rpc_update_progress(text,jsonb,text,jsonb,integer)',
       '7e36d2360211c68d203e1fc47f8b9ab5794e6a2a88b21c2fea24cefcac6b5f8e',
       '895edcfcd1fc3695a3bed4f873c2089bc1f7c55def39c2dd70d97c53a2524c81'),
      ('public.rpc_update_progress__five_role_impl_20260824(text,jsonb,text,jsonb,integer)',
       '55f7f86442b88a12c39e1f3cb6dd867d0aae0a684db78365bcef673a473e2644',
       'd53c3f00db2b7e3559362d1c0ddd08607a0e188d1050126612ffaa5d6e86b28e'),
      ('public.vmp_item_rights(uuid,text)',
       '9cfba864d7ea650370d6d76c33e2afcfbf941bb6918a90eeedec77f0513ab0db',
       '3e592bddb22eadedf206c1c5b8856435ffbc31efb97d45be36d3f68bb900f716'),
      ('public.vmp_allowed_timeline_fields(uuid,text)',
       '235d5d2e4ff760a7640e2687be430a8a188a56d380b7cf7b72e6018bc71d9a3c',
       '8d96010d65eb15b3a2167ab9867067d93790ddcb13b3124b9e29e5e0f63f055a'),
      ('public.rpc_save_catalog_object(text,text,jsonb,text,integer)',
       '81fbd19e43d3859cd28cb958fc311f1f8b693f659aca9371155433a0b70a1d29',
       '895edcfcd1fc3695a3bed4f873c2089bc1f7c55def39c2dd70d97c53a2524c81'),
      ('public.rpc_refresh_source_item_assignments()',
       'a4bd208fc467a14b9d0383d6af486f59a66f52d8b68d4bc614b92627a73524e7',
       '6a9ed96b583771d86cc97d11693376ad337c51ef71cb4f9c5af974d0a86f76df')
    ) reviewed(signature,definition_hash,metadata_hash)
    left join pg_proc procedure
      on procedure.oid=to_regprocedure(reviewed.signature)
    left join pg_roles owner on owner.oid=procedure.proowner
    left join pg_language language on language.oid=procedure.prolang
    where procedure.oid is null
       or encode(extensions.digest(pg_get_functiondef(procedure.oid),'sha256'),'hex')
            is distinct from reviewed.definition_hash
       or encode(extensions.digest(concat_ws('|',owner.rolname,language.lanname,
            procedure.prosecdef::text,procedure.provolatile::text,
            procedure.proparallel::text,procedure.proisstrict::text,
            procedure.proleakproof::text,
            coalesce(array_to_string(procedure.proconfig,','),''),
            coalesce(array_to_string(procedure.proacl,','),''),
            pg_get_function_result(procedure.oid)),'sha256'),'hex')
            is distinct from reviewed.metadata_hash
  ) then
    raise exception using errcode='check_violation',
      message='CHECK_ASSIGNED_PROGRESS_FUNCTION_CONTRACT';
  end if;
  raise notice 'PASS CHECK_ASSIGNED_PROGRESS_FUNCTION_CONTRACT exact hashes';

  if has_function_privilege('public','public.rpc_my_editable_progress_rights()','EXECUTE')
     or has_function_privilege('anon','public.rpc_my_editable_progress_rights()','EXECUTE')
     or not has_function_privilege('authenticated','public.rpc_my_editable_progress_rights()','EXECUTE')
     or not has_function_privilege('service_role','public.rpc_my_editable_progress_rights()','EXECUTE')
     or has_function_privilege('public','public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)','EXECUTE')
     or has_function_privilege('anon','public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)','EXECUTE')
     or has_function_privilege('authenticated','public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)','EXECUTE')
     or has_function_privilege('service_role','public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)','EXECUTE')
     or has_function_privilege('public','public.rpc_update_progress(text,jsonb,text,jsonb,integer)','EXECUTE')
     or has_function_privilege('anon','public.rpc_update_progress(text,jsonb,text,jsonb,integer)','EXECUTE')
     or not has_function_privilege('authenticated','public.rpc_update_progress(text,jsonb,text,jsonb,integer)','EXECUTE')
     or not has_function_privilege('service_role','public.rpc_update_progress(text,jsonb,text,jsonb,integer)','EXECUTE') then
    raise exception using errcode='check_violation',
      message='CHECK_ASSIGNED_PROGRESS_ACL';
  end if;
  raise notice 'PASS CHECK_ASSIGNED_PROGRESS_ACL private writer owner-only';

  select prosrc into strict v_definition from pg_proc
  where oid='public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)'::regprocedure;
  if regexp_count(v_definition,
       'vmp_allowed_timeline_fields\(auth.uid\(\),p_validation_code\)')<>2
     or strpos(v_definition,'-- Authorize before taking the row lock')=0
     or strpos(v_definition,'-- Re-resolve after lock acquisition')=0
     or strpos(v_definition,'for update')=0
     or strpos(v_definition,'v_bad_fields')=0
     or strpos(v_definition,'''item_field_forbidden''')=0 then
    raise exception using errcode='check_violation',
      message='CHECK_ASSIGNED_PROGRESS_WRITER_GUARDS';
  end if;
  select prosrc into strict v_definition from pg_proc
  where oid='public.rpc_update_progress(text,jsonb,text,jsonb,integer)'::regprocedure;
  if strpos(v_definition,'rpc_update_progress__assigned_impl_20260827')=0
     or strpos(v_definition,'rpc_update_progress__five_role_impl_20260824')>0 then
    raise exception using errcode='check_violation',
      message='CHECK_ASSIGNED_PROGRESS_WRITER_GUARDS';
  end if;
  raise notice 'PASS CHECK_ASSIGNED_PROGRESS_WRITER_GUARDS pre-lock/post-lock atomic';

  v_local := exists (select 1 from public.system_config
    where key='five_role_test_fixture' and value='true'::jsonb);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  select public.rpc_item_permission_preflight() into v_preflight;
  with codes as (
    select entry->>'code' code,count(*) n
    from jsonb_array_elements(v_preflight->'blocking_errors') entry group by 1
  ) select coalesce(sum(n),0)::integer,
           md5(string_agg(code||'='||n,E'\n' order by code))
      into v_count,v_digest from codes;
  with codes as (
    select coalesce(entry->>'code','<NULL>') code,count(*) n
    from jsonb_array_elements(v_preflight->'warnings') entry group by 1
  ) select coalesce(sum(n),0)::integer,
           coalesce(md5(string_agg(code||'='||n,E'\n' order by code)),md5(''))
      into v_warning_count,v_warning_digest from codes;
  if (v_local and (v_count<>16
       or v_digest<>'51655dff70de3ba821367c8f3784d078'
       or v_warning_count<>8
       or v_warning_digest<>'1dfde6e08513295b7e91472e406e2c6b'))
     or (not v_local and (v_count<>479
       or v_digest<>'99a46e1c1a96ea8ea612056d6f596af3'
       or v_warning_count<>14
       or v_warning_digest<>'7bc0aa25501a745ddc161e13ef5dab9a')) then
    raise exception using errcode='check_violation',
      message='CHECK_ASSIGNED_PROGRESS_GLOBAL_BLOCKER_BASELINE';
  end if;
  raise notice 'PASS CHECK_ASSIGNED_PROGRESS_GLOBAL_BLOCKER_BASELINE unchanged';

  raise notice 'PASS CHECK_ASSIGNED_PROGRESS_SOURCE_DATA_UNCHANGED exact definitions metadata';

  if public.vmp_business_role(v_admin)<>'admin' then
    raise exception using errcode='check_violation',
      message='CHECK_ASSIGNED_PROGRESS_ADMIN_NINE_FIELDS';
  end if;
  perform set_config('request.jwt.claims',json_build_object(
    'sub',v_admin,'role','authenticated')::text,true);
  v_batch:=public.rpc_my_editable_progress_rights();
  if v_batch->>'ok' is distinct from 'true'
     or jsonb_array_length(v_batch->'rights')<>(select count(*) from public.vmp_plan_items where is_active)
     or exists (select 1 from jsonb_array_elements(v_batch->'rights') entry
       where jsonb_array_length(entry->'editable_fields')<>9) then
    raise exception using errcode='check_violation',
      message='CHECK_ASSIGNED_PROGRESS_ADMIN_NINE_FIELDS';
  end if;
  raise notice 'PASS CHECK_ASSIGNED_PROGRESS_ADMIN_NINE_FIELDS';

  if public.vmp_business_role(v_manager)<>'qa_manager' then
    raise exception using errcode='check_violation',
      message='CHECK_ASSIGNED_PROGRESS_QA_MANAGER_EIGHT_FIELDS';
  end if;
  perform set_config('request.jwt.claims',json_build_object(
    'sub',v_manager,'role','authenticated')::text,true);
  v_batch:=public.rpc_my_editable_progress_rights();
  if v_batch->>'ok' is distinct from 'true'
     or jsonb_array_length(v_batch->'rights')<>(select count(*) from public.vmp_plan_items where is_active)
     or exists (select 1 from jsonb_array_elements(v_batch->'rights') entry
       where jsonb_array_length(entry->'editable_fields')<>8) then
    raise exception using errcode='check_violation',
      message='CHECK_ASSIGNED_PROGRESS_QA_MANAGER_EIGHT_FIELDS';
  end if;
  raise notice 'PASS CHECK_ASSIGNED_PROGRESS_QA_MANAGER_EIGHT_FIELDS';

  if public.vmp_business_role(v_assigned_qa)<>'qa_staff'
     or not exists (select 1 from public.vmp_item_assignments assignment
       join public.vmp_performers performer on performer.id=assignment.performer_id
       join public.vmp_plan_items item on item.validation_code=assignment.validation_code
       where performer.user_id=v_assigned_qa and performer.is_active
         and assignment.assignment_kind='qa' and assignment.is_active
         and (assignment.expires_at is null or assignment.expires_at>now())
         and item.is_active) then
    raise exception using errcode='check_violation',
      message='CHECK_ASSIGNED_PROGRESS_QA_STAFF_SEVEN_FIELDS';
  end if;
  perform set_config('request.jwt.claims',json_build_object(
    'sub',v_assigned_qa,'role','authenticated')::text,true);
  v_batch:=public.rpc_my_editable_progress_rights();
  if v_batch->>'ok' is distinct from 'true'
     or jsonb_array_length(v_batch->'rights')=0
     or exists (select 1 from jsonb_array_elements(v_batch->'rights') entry
       where jsonb_array_length(entry->'editable_fields')<>7
          or entry->'editable_fields' ? 'actual_validation_date') then
    raise exception using errcode='check_violation',
      message='CHECK_ASSIGNED_PROGRESS_QA_STAFF_SEVEN_FIELDS';
  end if;
  raise notice 'PASS CHECK_ASSIGNED_PROGRESS_QA_STAFF_SEVEN_FIELDS';

  if public.vmp_business_role(v_unassigned_qa)<>'qa_staff'
     or exists (select 1 from public.vmp_item_assignments assignment
       join public.vmp_performers performer on performer.id=assignment.performer_id
       where performer.user_id=v_unassigned_qa and performer.is_active
         and assignment.is_active
         and (assignment.expires_at is null or assignment.expires_at>now())) then
    raise exception using errcode='check_violation',
      message='CHECK_ASSIGNED_PROGRESS_UNASSIGNED_HIDDEN';
  end if;
  perform set_config('request.jwt.claims',json_build_object(
    'sub',v_unassigned_qa,'role','authenticated')::text,true);
  v_batch:=public.rpc_my_editable_progress_rights();
  if v_batch is distinct from '{"ok":true,"rights":[]}'::jsonb then
    raise exception using errcode='check_violation',
      message='CHECK_ASSIGNED_PROGRESS_UNASSIGNED_HIDDEN';
  end if;
  raise notice 'PASS CHECK_ASSIGNED_PROGRESS_UNASSIGNED_HIDDEN';

  if public.vmp_business_role(v_thien_my)<>'qa_staff'
     or not exists (select 1 from public.vmp_plan_items
       where validation_code='HT-02/2026.01-OQ' and is_active)
     or exists (select 1 from public.vmp_item_assignments assignment
       join public.vmp_performers performer on performer.id=assignment.performer_id
       where performer.user_id=v_thien_my and performer.is_active
         and assignment.validation_code='HT-02/2026.01-OQ'
         and assignment.is_active
         and (assignment.expires_at is null or assignment.expires_at>now())) then
    raise exception using errcode='check_violation',
      message='CHECK_ASSIGNED_PROGRESS_THIEN_MY_HT02_HIDDEN';
  end if;
  perform set_config('request.jwt.claims',json_build_object(
    'sub',v_thien_my,'role','authenticated')::text,true);
  v_batch:=public.rpc_my_editable_progress_rights();
  if exists (select 1 from jsonb_array_elements(v_batch->'rights') entry
    where entry->>'validation_code'='HT-02/2026.01-OQ') then
    raise exception using errcode='check_violation',
      message='CHECK_ASSIGNED_PROGRESS_THIEN_MY_HT02_HIDDEN';
  end if;
  raise notice 'PASS CHECK_ASSIGNED_PROGRESS_THIEN_MY_HT02_HIDDEN';

  select performer.user_id into v_workshop
  from public.vmp_item_assignments assignment
  join public.vmp_performers performer
    on performer.id=assignment.performer_id and performer.is_active
  join public.vmp_plan_items item
    on item.validation_code=assignment.validation_code and item.is_active
  cross join lateral public.vmp_item_rights(
    performer.user_id,assignment.validation_code) rights
  where assignment.assignment_kind='equipment_department'
    and assignment.is_active
    and (assignment.expires_at is null or assignment.expires_at>now())
    and public.vmp_business_role(performer.user_id)='workshop_staff'
    and rights.can_view
  order by assignment.validation_code,performer.id limit 1;
  if v_workshop is null then
    raise notice 'PASS CHECK_ASSIGNED_PROGRESS_WORKSHOP_ONE_FIELD assignments=0';
  else
    perform set_config('request.jwt.claims',json_build_object(
      'sub',v_workshop,'role','authenticated')::text,true);
    v_batch:=public.rpc_my_editable_progress_rights();
    if v_batch->>'ok' is distinct from 'true'
       or jsonb_array_length(v_batch->'rights')=0
       or exists (select 1 from jsonb_array_elements(v_batch->'rights') entry
         where entry->'editable_fields'<>'["actual_validation_date"]'::jsonb) then
      raise exception using errcode='check_violation',
        message='CHECK_ASSIGNED_PROGRESS_WORKSHOP_ONE_FIELD';
    end if;
    raise notice 'PASS CHECK_ASSIGNED_PROGRESS_WORKSHOP_ONE_FIELD assignments=%',
      jsonb_array_length(v_batch->'rights');
  end if;

  perform set_config('request.jwt.claims',coalesce(v_old_claims,''),true);
end
$checks$;

rollback;

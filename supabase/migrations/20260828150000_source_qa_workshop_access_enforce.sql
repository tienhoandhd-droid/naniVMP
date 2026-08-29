-- Source QA/workshop access enforcement. This migration repairs the additive
-- projection created by expand, then atomically installs writer-time rights.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '300s';

select pg_advisory_xact_lock(
  pg_catalog.hashtextextended('vmp.source_qa_workshop_access.release', 0)
);

-- Exact global deployment order inherited from expand. Assignment is taken at
-- its final mode before plan, so progress cannot form a lock-upgrade cycle.
lock table public.profiles in share row exclusive mode;
lock table public.vmp_performers in share row exclusive mode;

-- Reviewed catalog writes take this per-object advisory before locking Source.
-- Drain those locks in stable identity order before the Source table gate. A
-- canonical writer already holding Source can therefore finish its eventual
-- UPDATE before enforce queues the conflicting table lock. Direct DML already
-- obtains ROW EXCLUSIVE before its first tuple lock, which has the same effect.
do $drain_source_writers$
declare
  v_source record;
begin
  for v_source in
    select source_object.object_kind,source_object.object_code
    from public.vmp_source_objects source_object
    order by source_object.object_kind,source_object.object_code,
             source_object.id
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      coalesce(v_source.object_kind,'')||chr(31)||
      coalesce(v_source.object_code,''),20260826130000));
  end loop;
end
$drain_source_writers$;

lock table public.vmp_source_objects in share row exclusive mode;
lock table public.vmp_item_assignments in access exclusive mode;
lock table public.vmp_objects in share row exclusive mode;
lock table public.vmp_plan_items in share row exclusive mode;
lock table public.vmp_screen_permissions in share row exclusive mode;
lock table public.system_config in share row exclusive mode;
lock table public.audit_logs in share row exclusive mode;

do $precondition$
declare
  v_stub regprocedure :=
    to_regprocedure('public.rpc_refresh_source_item_assignments()');
  v_hash text;
  v_projection text;
  v_schema_contract text;
  v_index_contract text;
  v_trigger_contract text;
  v_helper_contract text;
  v_expected_projection text := nullif(current_setting(
    'vmp.source_access_expected_projection_state', true), '');
begin
  if current_setting('server_version_num')::integer not between 170000 and 179999
     or (select pg_encoding_to_char(encoding) from pg_database
         where datname=current_database()) is distinct from 'UTF8'
     or (select datcollate from pg_database
         where datname=current_database()) is distinct from 'en_US.UTF-8'
     or (select datctype from pg_database
         where datname=current_database()) is distinct from 'en_US.UTF-8'
     or (select pg_get_userbyid(datdba) from pg_database
         where datname=current_database()) is distinct from 'postgres'
     or current_user is distinct from 'postgres' then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_ENFORCE_PRECONDITION_DATABASE_CONTRACT';
  end if;

  if to_regclass('public.vmp_source_workshop_scope_grants') is null
     or to_regclass('public.vmp_authorization_revision') is null
     or to_regprocedure('public.vmp_source_scope_key(text)') is null
     or to_regprocedure('public.vmp_exact_active_source_for_item(text)') is null
     or to_regprocedure(
          'public.vmp_reconcile_source_qa_projection(uuid)') is null
     or to_regprocedure('public.vmp_touch_authorization_revision()') is null
     or to_regprocedure(
          'public.vmp_lock_catalog_object_v2(text,text)') is null
     or v_stub is null then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_ENFORCE_PRECONDITION_EXPAND_SCHEMA';
  end if;

  -- The failure-before-repair clone deliberately advances the singleton here.
  -- This proves enforce accepts any positive live revision after expand. The
  -- later injected exception rolls the probe back with this transaction.
  if current_setting('vmp.source_access_enforce_failpoint',true)=
       'before_repair'
     and exists (
       select 1 from public.system_config
       where key='five_role_test_fixture' and value='true'::jsonb
     ) then
    update public.vmp_authorization_revision
    set revision=revision+1 where singleton;
    if (select revision from public.vmp_authorization_revision
        where singleton)<=1 then
      raise exception using errcode='check_violation',
        message='SOURCE_ACCESS_ENFORCE_REVISION_GT_ONE_PROBE_FAILED';
    end if;
    raise notice 'SACCESS_ENFORCE_PRECONDITION_REVISION_GT_ONE_PROBE';
  end if;

  if encode(extensions.digest(convert_to(pg_get_functiondef(v_stub::oid),
       'UTF8'),'sha256'),'hex') <>
       'bce51a727187ff4544421391e4f1e03ee9e7336efa10e3ebfbcd71f7c71db3cd'
     or (select procedure.proacl::text from pg_proc procedure
         where procedure.oid=v_stub::oid) is distinct from
        '{postgres=X/postgres}'
     or has_function_privilege('service_role',v_stub,'EXECUTE')
     or has_function_privilege('authenticated',v_stub,'EXECUTE') then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_ENFORCE_PRECONDITION_REFRESH_FENCE';
  end if;

  if encode(extensions.digest(convert_to(pg_get_functiondef(
       'public.vmp_reconcile_source_qa_projection(uuid)'::regprocedure),
       'UTF8'),'sha256'),'hex') <>
       'ddbfc4df2615f6dffc6bc087b3a19bc2bca07b01a72bf2cca9dfa3a450c9434f'
     or encode(extensions.digest(convert_to(pg_get_functiondef(
       'public.vmp_exact_active_source_for_item(text)'::regprocedure),
       'UTF8'),'sha256'),'hex') <>
       'daca32ee71c0c0b04767296822cd2ac0f8010433c9c8d2286d08dee882966187'
     or encode(extensions.digest(convert_to(pg_get_functiondef(
       'public.vmp_source_scope_key(text)'::regprocedure),
       'UTF8'),'sha256'),'hex') <>
       '996e739b8d13b34a2c249192d22badaab03d72b85e35c23f5c97648a5ac7a80c'
     or encode(extensions.digest(convert_to(pg_get_functiondef(
       'public.vmp_touch_authorization_revision()'::regprocedure),
       'UTF8'),'sha256'),'hex') <>
       'edcc77dd4e37606e19e0340d3e5117faaed5c75cd068462d0069201e97dec8e4'
     or encode(extensions.digest(convert_to(pg_get_functiondef(
       'public.vmp_lock_catalog_object_v2(text,text)'::regprocedure),
       'UTF8'),'sha256'),'hex') <>
       '765a488a7134588bbc7da415027ebc39c5914cdaf742ae591bad7096ec83c784' then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_ENFORCE_PRECONDITION_EXPAND_FUNCTION_DRIFT';
  end if;

  -- Exact PG17 serializers copied from the sealed expand audit. These pin all
  -- columns/defaults/collations, constraints, indexes/build state, triggers,
  -- policies, owner/RLS/table ACL, and column ACL for both expand-owned tables.
  with required(name,relation_id) as (
    values
      ('vmp_authorization_revision',
       'public.vmp_authorization_revision'::regclass),
      ('vmp_source_workshop_scope_grants',
       'public.vmp_source_workshop_scope_grants'::regclass)
  ), serialized as (
    select required.name,
      (select count(*)||'/'||encode(extensions.digest(convert_to(coalesce(
         string_agg(concat_ws('|',attribute.attnum,attribute.attname,
           format_type(attribute.atttypid,attribute.atttypmod),
           attribute.attnotnull,coalesce(pg_get_expr(default_value.adbin,
             default_value.adrelid),''),attribute.attidentity,
           attribute.attgenerated,coalesce(collation_namespace.nspname,''),
           coalesce(column_collation.collname,''),
           coalesce(column_collation.collprovider::text,''),
           coalesce(column_collation.collisdeterministic::text,'')),E'\n'
           order by attribute.attnum),''),'UTF8'),'sha256'),'hex')
       from pg_attribute attribute
       left join pg_attrdef default_value
         on default_value.adrelid=attribute.attrelid
        and default_value.adnum=attribute.attnum
       left join pg_collation column_collation
         on column_collation.oid=attribute.attcollation
       left join pg_namespace collation_namespace
         on collation_namespace.oid=column_collation.collnamespace
       where attribute.attrelid=required.relation_id
         and attribute.attnum>0 and not attribute.attisdropped) columns,
      (select count(*)||'/'||encode(extensions.digest(convert_to(coalesce(
         string_agg(format('%s|%s|%s',constraint_row.conname,
           constraint_row.contype,pg_get_constraintdef(constraint_row.oid)),
           E'\n' order by constraint_row.conname),''),'UTF8'),'sha256'),'hex')
       from pg_constraint constraint_row
       where constraint_row.conrelid=required.relation_id) constraints,
      (select count(*)||'/'||encode(extensions.digest(convert_to(coalesce(
         string_agg(format('%s|%s|%s|%s|%s|%s',index_class.relname,
           index_row.indisunique,index_row.indisvalid,index_row.indisready,
           index_row.indimmediate,pg_get_indexdef(index_row.indexrelid)),E'\n'
           order by index_class.relname),''),'UTF8'),'sha256'),'hex')
       from pg_index index_row join pg_class index_class
         on index_class.oid=index_row.indexrelid
       where index_row.indrelid=required.relation_id) indexes,
      (select count(*)||'/'||encode(extensions.digest(convert_to(coalesce(
         string_agg(format('%s|%s|%s|%s',trigger_row.tgname,
           trigger_row.tgenabled,trigger_row.tgfoid::regprocedure,
           pg_get_triggerdef(trigger_row.oid)),E'\n'
           order by trigger_row.tgname),''),'UTF8'),'sha256'),'hex')
       from pg_trigger trigger_row where trigger_row.tgrelid=required.relation_id
         and not trigger_row.tgisinternal) triggers,
      (select count(*)||'/'||encode(extensions.digest(convert_to(coalesce(
         string_agg(format('%s|%s|%s|%s|%s|%s',policy_row.polname,
           policy_row.polcmd,policy_row.polpermissive,
           array_to_string(policy_row.polroles,','),
           coalesce(pg_get_expr(policy_row.polqual,policy_row.polrelid),''),
           coalesce(pg_get_expr(policy_row.polwithcheck,
                                policy_row.polrelid),'')),E'\n'
           order by policy_row.polname),''),'UTF8'),'sha256'),'hex')
       from pg_policy policy_row
       where policy_row.polrelid=required.relation_id) policies,
      (select encode(extensions.digest(convert_to(concat_ws('|',owner.rolname,
         relation.relrowsecurity,relation.relforcerowsecurity,
         coalesce(array_to_string(relation.relacl,','),'')),
         'UTF8'),'sha256'),'hex') from pg_class relation
       join pg_roles owner on owner.oid=relation.relowner
       where relation.oid=required.relation_id) owner_rls_acl
    from required
  )
  select string_agg(concat_ws('|',name,columns,constraints,indexes,triggers,
                    policies,owner_rls_acl),E'\n' order by name)
    into v_schema_contract from serialized;
  if v_schema_contract is distinct from
       E'vmp_authorization_revision|3/bdf28d336836e359f97bf20d0ec10b65dfd93dbfaf6444e20db521e99b6bf2d7|3/ff83b4677776f46417c371e084c72668dc36be6124adfc016e61c4de6cc8fa7b|1/5815bdf89fb0e4f3f8bd3da2ef7c75491b3c44ad43f5252ee7730fb57107f1a6|0/e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855|0/e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855|47e2799c86c0e0c9abe3c95c1cb72222ae03e55c859c453ede8790cd9ed12142\nvmp_source_workshop_scope_grants|17/3658bb682df4bc29f7da397939a3b7c5c2954b5e68762b7c9238961e7c69cacd|12/efbef7e97a071d23c2ae8996e80661db751fa82caa288436bf18bbd123fbfe14|7/5a4bf772919018658e3bc0b66feeefeb5e3cdc5f874dd311d33510e2a20f2572|2/15a7ba8e0a5cd58ca8fcb0b68ce58f4ae421f80d86dab5c74025c391f53fa476|0/e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855|47e2799c86c0e0c9abe3c95c1cb72222ae03e55c859c453ede8790cd9ed12142'
     or exists (
       select 1 from pg_attribute attribute where attribute.attrelid in (
         'public.vmp_authorization_revision'::regclass,
         'public.vmp_source_workshop_scope_grants'::regclass
       ) and attribute.attnum>0 and not attribute.attisdropped
         and attribute.attacl is not null
     )
     or (select count(*) from public.vmp_authorization_revision)<>1
     or not exists (select 1 from public.vmp_authorization_revision
                    where singleton and revision>0) then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_ENFORCE_PRECONDITION_EXPAND_TABLE_DRIFT';
  end if;

  with expected(name) as (select unnest(array[
    'uq_vmp_source_objects_active_object_code',
    'idx_vmp_plan_items_object_year_active','idx_vmp_source_objects_list',
    'idx_vmp_source_objects_active_owner',
    'idx_vmp_source_objects_active_support',
    'idx_vmp_source_objects_active_scope_area',
    'idx_vmp_source_objects_active_scope_line',
    'uq_vmp_source_workshop_grants_active_area',
    'uq_vmp_source_workshop_grants_active_line',
    'uq_vmp_source_workshop_grants_id_version',
    'idx_vmp_source_workshop_grants_person',
    'idx_vmp_source_workshop_grants_area',
    'idx_vmp_source_workshop_grants_line',
    'idx_vmp_item_assignments_active_performer_validation_kind',
    'idx_vmp_item_assignments_active_validation_performer_kind',
    'idx_vmp_performers_active_candidate',
    'idx_profiles_active_role_department']::text[])), actual as (
    select index_class.relname name,index_row.* from expected
    join pg_class index_class on index_class.relname=expected.name
    join pg_namespace namespace on namespace.oid=index_class.relnamespace
      and namespace.nspname='public'
    join pg_index index_row on index_row.indexrelid=index_class.oid
  )
  select count(*)||'/'||encode(extensions.digest(convert_to(coalesce(
    string_agg(format('%s|%s|%s|%s|%s|%s',name,indisunique,indisvalid,
      indisready,indimmediate,pg_get_indexdef(indexrelid)),E'\n' order by name),
    ''),'UTF8'),'sha256'),'hex') into v_index_contract from actual;
  if v_index_contract is distinct from
       '17/60366ce6434226ed23edf15156ceaf0ff0168a2273db3ade733f2e8a936df48c'
     or (select pg_get_constraintdef(oid) from pg_constraint
         where conrelid='public.vmp_item_assignments'::regclass
           and conname='vmp_item_assignments_source_check') is distinct from
       'CHECK ((source = ANY (ARRAY[''sheet_qa''::text, ''sheet_other_staff''::text, ''qa_manager''::text, ''equipment_manager''::text, ''source_owner''::text, ''source_support''::text])))' then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_ENFORCE_PRECONDITION_EXPAND_INDEX_CONSTRAINT_DRIFT';
  end if;

  select count(*)||'/'||encode(extensions.digest(convert_to(coalesce(
    string_agg(format('%s|%s|%s|%s|%s',relation.relname,trigger_row.tgname,
      trigger_row.tgenabled,trigger_row.tgfoid::regprocedure,
      pg_get_triggerdef(trigger_row.oid)),E'\n'
      order by relation.relname,trigger_row.tgname),''),'UTF8'),'sha256'),'hex')
    into v_trigger_contract
  from pg_trigger trigger_row join pg_class relation
    on relation.oid=trigger_row.tgrelid
  join pg_namespace namespace on namespace.oid=relation.relnamespace
  where namespace.nspname='public'
    and trigger_row.tgname like 'vmp_authorization_revision_%'
    and not trigger_row.tgisinternal;
  if v_trigger_contract is distinct from
       '16/0e54467e0e1c651cbbd8cfb2b9d0fc3275475c7d34d03d13c4bd39ed67341498' then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_ENFORCE_PRECONDITION_EXPAND_TRIGGER_DRIFT';
  end if;

  select string_agg(concat_ws('|',procedure.oid::regprocedure::text,
      owner.rolname,language.lanname,procedure.prosecdef,
      procedure.provolatile,procedure.proparallel,procedure.proisstrict,
      procedure.proleakproof,coalesce(procedure.proconfig::text,''),
      coalesce(procedure.proacl::text,'')),E'\n'
      order by procedure.oid::regprocedure::text)
    into v_helper_contract
  from pg_proc procedure join pg_roles owner on owner.oid=procedure.proowner
  join pg_language language on language.oid=procedure.prolang
  where procedure.oid in (
    'public.vmp_source_scope_key(text)'::regprocedure,
    'public.vmp_exact_active_source_for_item(text)'::regprocedure,
    'public.vmp_lock_catalog_object_v2(text,text)'::regprocedure,
    'public.vmp_reconcile_source_qa_projection(uuid)'::regprocedure,
    'public.vmp_touch_authorization_revision()'::regprocedure
  );
  if v_helper_contract is distinct from
       E'vmp_exact_active_source_for_item(text)|postgres|sql|t|s|u|f|f|{"search_path=public, pg_temp"}|{postgres=X/postgres}\nvmp_lock_catalog_object_v2(text,text)|postgres|sql|f|v|u|f|f|{"search_path=public, pg_temp"}|{postgres=X/postgres}\nvmp_reconcile_source_qa_projection(uuid)|postgres|plpgsql|t|v|u|f|f|{"search_path=public, pg_temp"}|{postgres=X/postgres}\nvmp_source_scope_key(text)|postgres|sql|f|i|s|t|f|{search_path=pg_catalog}|{postgres=X/postgres}\nvmp_touch_authorization_revision()|postgres|plpgsql|t|v|u|f|f|{"search_path=public, pg_temp"}|{postgres=X/postgres}' then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_ENFORCE_PRECONDITION_EXPAND_HELPER_METADATA_DRIFT';
  end if;

  if (select pg_get_indexdef(indexrelid) from pg_index
      where indexrelid=
        'public.vmp_item_assignments_one_active_qa_primary'::regclass)
       is distinct from
       'CREATE UNIQUE INDEX vmp_item_assignments_one_active_qa_primary ON public.vmp_item_assignments USING btree (validation_code) WHERE ((assignment_kind = ''qa''::text) AND (assignment_role = ''primary''::text) AND is_active)'
     or (select pg_get_indexdef(indexrelid) from pg_index
         where indexrelid=
           'public.vmp_item_assignments_one_active_qa_person'::regclass)
       is distinct from
       'CREATE UNIQUE INDEX vmp_item_assignments_one_active_qa_person ON public.vmp_item_assignments USING btree (validation_code, performer_id, assignment_kind) WHERE ((performer_id IS NOT NULL) AND (assignment_kind = ''qa''::text) AND is_active)'
     or (select pg_get_indexdef(indexrelid) from pg_index
         where indexrelid=
           'public.uq_vmp_source_objects_active_object_code'::regclass)
       is distinct from
       'CREATE UNIQUE INDEX uq_vmp_source_objects_active_object_code ON public.vmp_source_objects USING btree (object_code) WHERE (is_active IS TRUE)'
     or exists (
       select 1 from pg_index index_row where index_row.indexrelid in (
         'public.vmp_item_assignments_one_active_qa_primary'::regclass,
         'public.vmp_item_assignments_one_active_qa_person'::regclass,
         'public.uq_vmp_source_objects_active_object_code'::regclass
       ) and (not index_row.indisunique or not index_row.indisvalid
              or not index_row.indisready)
     ) then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_ENFORCE_PRECONDITION_UNIQUE_INDEX_DRIFT';
  end if;

  if exists (
    select 1 from pg_proc procedure
    join pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='public' and procedure.proname in (
      'vmp_can_manage_source_qa_assignment',
      'vmp_can_manage_source_workshop_scope',
      'vmp_source_workshop_scope_match',
      'vmp_can_view_source_object','vmp_can_view_plan_item',
      'vmp_lock_source_plan_relations',
      'vmp_enforce_active_plan_source_relation',
      'vmp_guard_active_source_rekey','vmp_guard_plan_master_rekey',
      'rpc_apply_sheet_sync__source_impl_20260828',
      'rpc_sync_vmp_sheet_snapshot__source_impl_20260828',
      'rpc_rollback_vmp_sheet_sync__source_impl_20260828',
      'rpc_list_source_objects','rpc_list_source_workshop_coverage',
      'rpc_source_workshop_scope_choices',
      'rpc_set_source_workshop_scope_grant'
    )
  ) then
    raise exception using errcode='duplicate_object',
      message='SOURCE_ACCESS_ENFORCE_PRECONDITION_PARTIAL_INSTALL';
  end if;

  if exists (
    select 1 from pg_trigger trigger_row
    join pg_class relation on relation.oid=trigger_row.tgrelid
    join pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public' and not trigger_row.tgisinternal
      and trigger_row.tgname in (
        'vmp_plan_items_active_source_guard',
        'vmp_source_objects_active_relation_guard',
        'vmp_source_objects_active_delete_guard',
        'vmp_objects_source_relation_update_guard',
        'vmp_objects_source_relation_delete_guard'
      )
  ) then
    raise exception using errcode='duplicate_object',
      message='SOURCE_ACCESS_ENFORCE_PRECONDITION_PARTIAL_TRIGGER_INSTALL';
  end if;

  with source_projection as (
    select count(*) row_count,
           encode(extensions.digest(convert_to(coalesce(string_agg(
             to_jsonb(source_object)::text,E'\n' order by source_object.id::text
           ),''),'UTF8'),'sha256'),'hex') row_digest
    from public.vmp_source_objects source_object
  ), plan_projection as (
    select count(*) row_count,
           encode(extensions.digest(convert_to(coalesce(string_agg(
             to_jsonb(item)::text,E'\n' order by item.id::text
           ),''),'UTF8'),'sha256'),'hex') row_digest
    from public.vmp_plan_items item
  ), assignment_projection as (
    select count(*) row_count,
           encode(extensions.digest(convert_to(coalesce(string_agg(
             to_jsonb(assignment)::text,E'\n' order by assignment.id::text
           ),''),'UTF8'),'sha256'),'hex') row_digest
    from public.vmp_item_assignments assignment
  )
  select concat_ws('|',source_projection.row_count,
         source_projection.row_digest,plan_projection.row_count,
         plan_projection.row_digest,assignment_projection.row_count,
         assignment_projection.row_digest)
    into v_projection
  from source_projection cross join plan_projection
       cross join assignment_projection;

  if v_expected_projection is not null
     and v_projection is distinct from v_expected_projection then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_ENFORCE_PRECONDITION_PROJECTION_DRIFT';
  end if;
  perform set_config('vmp.source_access_enforce_projection_before',
                     v_projection,true);
end
$precondition$;

-- Freeze the capability names used by private manager predicates. Preserve
-- every existing action and append only the two approved Source capabilities.
update public.vmp_screen_permissions
set actions=coalesce(actions,'{}'::text[])
  || case when 'manage_qa_assignment'=any(coalesce(actions,'{}'::text[]))
          then '{}'::text[] else array['manage_qa_assignment']::text[] end
  || case when 'manage_workshop_scope'=any(coalesce(actions,'{}'::text[]))
          then '{}'::text[] else array['manage_workshop_scope']::text[] end
where screen_id='source' and business_role in ('admin','qa_manager');

create or replace function public.vmp_catalog_timeline_fields()
returns text[]
language sql
immutable
security invoker
set search_path=pg_catalog
as $function$
  select array[
    'frequency_months','first_month','report_class','workdays',
    'validate_flag','is_active'
  ]::text[]
$function$;

revoke all on function public.vmp_catalog_timeline_fields()
  from public,anon,authenticated;
grant execute on function public.vmp_catalog_timeline_fields()
  to service_role;

-- Enforce the approved relation through the existing global object identity:
-- plan item -> vmp_objects -> one active Source. The expand definition is
-- pinned above before this reviewed replacement is installed.
create or replace function public.vmp_exact_active_source_for_item(
  p_validation_code text
)
returns setof public.vmp_source_objects
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  with matches as materialized (
    select source_object.*
    from public.vmp_plan_items item
    join public.vmp_objects master_object
      on master_object.code=item.object_code
    join public.vmp_source_objects source_object
      on source_object.object_code=master_object.code
     and source_object.is_active is true
    where item.validation_code=p_validation_code and item.is_active is true
  ), exact as (
    select count(*) match_count from matches
  )
  select matches.* from matches cross join exact
  where exact.match_count=1
$function$;

revoke all on function public.vmp_exact_active_source_for_item(text)
  from public,anon,authenticated,service_role;

create function public.vmp_can_manage_source_qa_assignment(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select public.vmp_is_active_session(p_uid)
    and public.vmp_business_role(p_uid) in ('admin','qa_manager')
    and exists (
      select 1 from public.vmp_screen_permissions permission
      where permission.business_role=public.vmp_business_role(p_uid)
        and permission.screen_id='source' and permission.can_view
        and 'manage_qa_assignment'=any(permission.actions)
    )
$function$;

create function public.vmp_can_manage_source_workshop_scope(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select public.vmp_is_active_session(p_uid)
    and public.vmp_business_role(p_uid) in ('admin','qa_manager')
    and exists (
      select 1 from public.vmp_screen_permissions permission
      where permission.business_role=public.vmp_business_role(p_uid)
        and permission.screen_id='source' and permission.can_view
        and 'manage_workshop_scope'=any(permission.actions)
    )
$function$;

create function public.vmp_source_workshop_scope_match(
  p_person_id uuid,p_source_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select exists (
    select 1
    from public.vmp_source_objects source_object
    join public.vmp_source_workshop_scope_grants grant_row
      on grant_row.performer_id=p_person_id
     and grant_row.is_active
     and grant_row.valid_from<=transaction_timestamp()
     and (grant_row.expires_at is null
          or grant_row.expires_at>transaction_timestamp())
     and source_object.department is not null
     and source_object.area_code is not null
     and public.vmp_source_scope_key(source_object.department)=
         grant_row.department_key
     and public.vmp_source_scope_key(source_object.area_code)=grant_row.area_key
     and (grant_row.line_key is null or (
       source_object.line is not null
       and public.vmp_source_scope_key(source_object.line)=grant_row.line_key
     ))
    where source_object.id=p_source_id and source_object.is_active
  )
$function$;

create function public.vmp_can_view_source_object(p_uid uuid,p_source_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  with actor as (
    select public.vmp_business_role(p_uid) role_name,
           public.vmp_is_active_session(p_uid) active_session,
           (coalesce(auth.role(),'')='service_role'
            or p_uid is not distinct from auth.uid()) caller_matches
  )
  select actor.caller_matches and actor.active_session and exists (
    select 1 from public.vmp_source_objects source_object
    where source_object.id=p_source_id and (
      actor.role_name in ('admin','qa_manager')
      or (source_object.is_active and actor.role_name='qa_staff' and exists (
        select 1 from public.vmp_performers performer
        where performer.user_id=p_uid and performer.is_active
          and performer.id in (
            source_object.owner_person_id,source_object.support_person_id
          )
      ))
      or (source_object.is_active
          and actor.role_name in ('workshop_manager','workshop_staff')
          and exists (
        select 1 from public.vmp_performers performer
        where performer.user_id=p_uid and performer.is_active
          and public.vmp_source_workshop_scope_match(
            performer.id,source_object.id)
      ))
    )
  ) from actor
$function$;

create function public.vmp_can_view_plan_item(p_uid uuid,p_validation_code text)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select coalesce((
    select public.vmp_can_view_source_object(p_uid,source_object.id)
    from public.vmp_exact_active_source_for_item(p_validation_code) source_object
  ),false)
$function$;

revoke all on function public.vmp_can_manage_source_qa_assignment(uuid),
  public.vmp_can_manage_source_workshop_scope(uuid),
  public.vmp_source_workshop_scope_match(uuid,uuid),
  public.vmp_can_view_source_object(uuid,uuid),
  public.vmp_can_view_plan_item(uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.vmp_can_manage_source_qa_assignment(uuid),
  public.vmp_can_manage_source_workshop_scope(uuid),
  public.vmp_source_workshop_scope_match(uuid,uuid),
  public.vmp_can_view_source_object(uuid,uuid),
  public.vmp_can_view_plan_item(uuid,text)
  to service_role;
-- These two predicates are referenced by authenticated RLS policies in the
-- next phase. They reject an alternate UID before resolving any rights.
grant execute on function public.vmp_can_view_source_object(uuid,uuid),
  public.vmp_can_view_plan_item(uuid,text)
  to authenticated;

create or replace function public.vmp_item_scope_matches(
  p_person_id uuid,p_validation_code text
)
returns table(
  scope_match boolean,factory_match boolean,
  area_match boolean,line_match boolean
)
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select matched,matched,matched,matched
  from (
    select coalesce((
      select public.vmp_source_workshop_scope_match(
        p_person_id,source_object.id)
      from public.vmp_exact_active_source_for_item(p_validation_code)
           source_object
    ),false) matched
  ) resolved
$function$;

create or replace function public.vmp_item_rights(
  p_uid uuid,p_validation_code text
)
returns table(
  can_view boolean,editable_fields text[],view_reason text,
  assignment_sources text[],scope_match boolean,area_match boolean
)
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
declare
  v_role text:=public.vmp_business_role(p_uid);
  v_person public.vmp_performers%rowtype;
  v_source public.vmp_source_objects%rowtype;
  v_has_assignment boolean:=false;
  v_sources text[]:='{}'::text[];
  v_qa_manager_fields constant text[]:=array[
    'actual_protocol_date','status_protocol',
    'actual_validation_date','status_validation',
    'actual_report_date','status_report',
    'actual_vmp_date','status_vmp'
  ]::text[];
  v_qa_staff_fields constant text[]:=array[
    'actual_protocol_date','status_protocol','status_validation',
    'actual_report_date','status_report','actual_vmp_date','status_vmp'
  ]::text[];
begin
  if not public.vmp_is_active_session(p_uid) or v_role is null then
    return query select false,'{}'::text[],
      'Tài khoản hoặc vai trò nghiệp vụ không hợp lệ','{}'::text[],false,false;
    return;
  end if;

  if v_role='admin' then
    return query select *
    from public.vmp_item_rights_before_assignment_only_qa(
      p_uid,p_validation_code);
    return;
  end if;

  if v_role='qa_manager' then
    if public.vmp_can_manage_source_qa_assignment(p_uid)
       and exists (
         select 1 from public.vmp_plan_items item
         where item.validation_code=p_validation_code and item.is_active
       ) then
      return query select true,v_qa_manager_fields,
        'Quản lý QA xem toàn bộ hạng mục hoạt động',
        '{}'::text[],true,true;
      return;
    end if;
    return query select false,'{}'::text[],
      'Principal Quản lý QA không hợp lệ','{}'::text[],false,false;
    return;
  end if;

  select performer.* into v_person
  from public.vmp_performers performer
  where performer.user_id=p_uid and performer.is_active;
  if not found then
    return query select false,'{}'::text[],
      'Tài khoản chưa nối hồ sơ hoạt động','{}'::text[],false,false;
    return;
  end if;

  select source_object.* into v_source
  from public.vmp_exact_active_source_for_item(p_validation_code) source_object;
  if not found then
    return query select false,'{}'::text[],
      'Không có đúng một Source hoạt động cho hạng mục',
      '{}'::text[],false,false;
    return;
  end if;

  if v_role='qa_staff' then
    if v_person.id in (v_source.owner_person_id,v_source.support_person_id) then
      select coalesce(array_agg(distinct assignment.source
                 order by assignment.source),'{}'::text[])
        into v_sources
      from public.vmp_item_assignments assignment
      where assignment.validation_code=p_validation_code
        and assignment.performer_id=v_person.id
        and assignment.assignment_kind='qa' and assignment.is_active
        and (assignment.expires_at is null
             or assignment.expires_at>transaction_timestamp());
      return query select true,v_qa_staff_fields,
        'Quan hệ QA trực tiếp trên Source',v_sources,true,true;
      return;
    end if;
    return query select false,'{}'::text[],
      'Không phải QA phụ trách hoặc hỗ trợ trên Source',
      '{}'::text[],false,false;
    return;
  end if;

  if v_role in ('workshop_manager','workshop_staff') then
    if not public.vmp_source_workshop_scope_match(v_person.id,v_source.id) then
      return query select false,'{}'::text[],
        'Không có phạm vi xưởng đang hoạt động',
        '{}'::text[],false,false;
      return;
    end if;

    select coalesce(bool_or(true),false),
           coalesce(array_agg(distinct assignment.source
                    order by assignment.source),'{}'::text[])
      into v_has_assignment,v_sources
    from public.vmp_item_assignments assignment
    where assignment.validation_code=p_validation_code
      and assignment.performer_id=v_person.id
      and assignment.assignment_kind='equipment_department'
      and assignment.is_active
      and (assignment.expires_at is null
           or assignment.expires_at>transaction_timestamp());
    return query select true,
      case when v_has_assignment then
        array['actual_validation_date']::text[] else '{}'::text[] end,
      case when v_has_assignment then
        'Có phạm vi Source và phân công xưởng đang hoạt động'
      else 'Có phạm vi Source; chưa có phân công sửa tiến độ' end,
      v_sources,true,true;
    return;
  end if;

  return query select false,'{}'::text[],
    'Vai trò không được xem hạng mục Source','{}'::text[],false,false;
end
$function$;

revoke all on function public.vmp_item_scope_matches(uuid,text),
  public.vmp_item_rights(uuid,text)
  from public,anon,authenticated;
grant execute on function public.vmp_item_scope_matches(uuid,text),
  public.vmp_item_rights(uuid,text)
  to service_role;

-- Reviewed plan writers call this before touching any plan tuple. Source is
-- always locked first, followed by the required intermediate master object,
-- both in stable code/id order. NULL means every currently active Source and
-- is reserved for the two reviewed batch writers.
create function public.vmp_lock_source_plan_relations(p_object_codes text[])
returns void
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
declare
  v_relation record;
begin
  for v_relation in
    select source_object.id source_id,source_object.object_code,
           master_object.code master_code
    from public.vmp_source_objects source_object
    join public.vmp_objects master_object
      on master_object.code=source_object.object_code
    where source_object.is_active is true
      and (p_object_codes is null
           or source_object.object_code=any(p_object_codes))
    order by source_object.object_code,source_object.id,master_object.code
    for key share of source_object,master_object
  loop
    null;
  end loop;
end
$function$;

-- This row guard is a fail-closed backstop for direct/unreviewed DML. Reviewed
-- writers already hold these exact locks, so NOWAIT is re-entrant. If a caller
-- reaches the plan tuple first while Source/master is being revoked, it fails
-- immediately instead of creating a plan -> Source deadlock edge.
create function public.vmp_enforce_active_plan_source_relation()
returns trigger
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
declare
  v_source_id uuid;
begin
  if new.is_active is true then
    begin
      select source_object.id into v_source_id
      from public.vmp_objects master_object
      join public.vmp_source_objects source_object
        on source_object.object_code=master_object.code
      where master_object.code=new.object_code
        and source_object.is_active is true
      for key share of source_object,master_object nowait;
    exception when lock_not_available then
      raise exception using errcode='lock_not_available',
        message='SOURCE_ACCESS_RELATION_LOCK_ORDER_REQUIRED';
    end;
    if v_source_id is null then
      raise exception using errcode='foreign_key_violation',
        message='SOURCE_ACCESS_ACTIVE_ITEM_REQUIRES_EXACT_SOURCE';
    end if;
  end if;
  return new;
end
$function$;

create trigger vmp_plan_items_active_source_guard
before insert or update of object_code,is_active on public.vmp_plan_items
for each row execute function public.vmp_enforce_active_plan_source_relation();

create function public.vmp_guard_active_source_rekey()
returns trigger
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
begin
  if tg_op='DELETE' then
    if old.is_active is true and exists (
      select 1 from public.vmp_plan_items item
      where item.object_code=old.object_code and item.is_active is true
    ) then
      raise exception using errcode='foreign_key_violation',
        message='SOURCE_ACCESS_ACTIVE_SOURCE_HAS_ACTIVE_ITEMS';
    end if;
    return old;
  end if;
  if old.is_active is true
     and (new.is_active is not true
          or new.object_code is distinct from old.object_code)
     and exists (
       select 1 from public.vmp_plan_items item
       where item.object_code=old.object_code and item.is_active is true
     ) then
    raise exception using errcode='foreign_key_violation',
      message='SOURCE_ACCESS_ACTIVE_SOURCE_HAS_ACTIVE_ITEMS';
  end if;
  return new;
end
$function$;

create trigger vmp_source_objects_active_relation_guard
before update of object_code,is_active on public.vmp_source_objects
for each row execute function public.vmp_guard_active_source_rekey();

create trigger vmp_source_objects_active_delete_guard
before delete on public.vmp_source_objects
for each row execute function public.vmp_guard_active_source_rekey();

create function public.vmp_guard_plan_master_rekey()
returns trigger
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
begin
  if (tg_op='DELETE' or new.code is distinct from old.code)
     and exists (
       select 1 from public.vmp_plan_items item
       where item.object_code=old.code and item.is_active is true
     ) then
    raise exception using errcode='foreign_key_violation',
      message='SOURCE_ACCESS_MASTER_OBJECT_HAS_ACTIVE_ITEMS';
  end if;
  if tg_op='DELETE' then
    return old;
  end if;
  return new;
end
$function$;

create trigger vmp_objects_source_relation_update_guard
before update of code on public.vmp_objects
for each row execute function public.vmp_guard_plan_master_rekey();

create trigger vmp_objects_source_relation_delete_guard
before delete on public.vmp_objects
for each row execute function public.vmp_guard_plan_master_rekey();

revoke all on function public.vmp_lock_source_plan_relations(text[]),
  public.vmp_enforce_active_plan_source_relation(),
  public.vmp_guard_active_source_rekey(),
  public.vmp_guard_plan_master_rekey()
  from public,anon,authenticated,service_role;

create function public.vmp_source_filters_valid(p_filters jsonb)
returns boolean
language sql
immutable
security invoker
set search_path=pg_catalog
as $function$
  select p_filters is null or (
    pg_catalog.jsonb_typeof(p_filters)='object'
    and not exists (
      select 1 from pg_catalog.jsonb_object_keys(p_filters) filter_key
      where filter_key<>all(array[
        'department','area_code','line','validation','first_month','owner',
        'frequency'
      ]::text[])
    )
    and (not (p_filters?'department') or (
      pg_catalog.jsonb_typeof(p_filters->'department')='string'
      and nullif(pg_catalog.btrim(p_filters->>'department'),'') is not null))
    and (not (p_filters?'area_code') or (
      pg_catalog.jsonb_typeof(p_filters->'area_code')='string'
      and nullif(pg_catalog.btrim(p_filters->>'area_code'),'') is not null))
    and (not (p_filters?'line') or (
      pg_catalog.jsonb_typeof(p_filters->'line')='string'
      and nullif(pg_catalog.btrim(p_filters->>'line'),'') is not null))
    and (not (p_filters?'validation') or (
      pg_catalog.jsonb_typeof(p_filters->'validation')='string'
      and p_filters->>'validation'=any(array[
        'all','validated','outside'
      ]::text[])))
    and (not (p_filters?'first_month') or (
      pg_catalog.jsonb_typeof(p_filters->'first_month')='string'
      and p_filters->>'first_month'=any(array[
        'all','missing','present'
      ]::text[])))
    and (not (p_filters?'owner') or (
      pg_catalog.jsonb_typeof(p_filters->'owner')='string'
      and ((p_filters->>'owner')=any(array[
             'all','assigned','unassigned'
           ]::text[])
        or (pg_catalog.left(p_filters->>'owner',6)='owner:'
          and nullif(pg_catalog.btrim(pg_catalog.substr(
            p_filters->>'owner',7)),'') is not null))))
    and (not (p_filters?'frequency') or (
      pg_catalog.jsonb_typeof(p_filters->'frequency')='string'
      and p_filters->>'frequency'=any(array[
        'all','lte12','gt12'
      ]::text[])))
  )
$function$;

create function public.vmp_source_object_matches_filters(
  p_source public.vmp_source_objects,p_search text,p_filters jsonb
)
returns boolean
language sql
stable
security invoker
as $function$
  select
    (coalesce(btrim(p_search),'')='' or
      p_source.object_code ilike '%'||btrim(p_search)||'%' or
      p_source.object_name ilike '%'||btrim(p_search)||'%' or
      p_source.department ilike '%'||btrim(p_search)||'%' or
      p_source.area_code ilike '%'||btrim(p_search)||'%' or
      p_source.line ilike '%'||btrim(p_search)||'%' or
      p_source.owner_name ilike '%'||btrim(p_search)||'%' or
      p_source.report_class ilike '%'||btrim(p_search)||'%' or
      p_source.work_group ilike '%'||btrim(p_search)||'%' or
      p_source.note ilike '%'||btrim(p_search)||'%')
    and (not (coalesce(p_filters,'{}'::jsonb)?'department')
      or public.vmp_source_scope_key(p_source.department)=
         public.vmp_source_scope_key(p_filters->>'department'))
    and (not (coalesce(p_filters,'{}'::jsonb)?'area_code')
      or public.vmp_source_scope_key(p_source.area_code)=
         public.vmp_source_scope_key(p_filters->>'area_code'))
    and (not (coalesce(p_filters,'{}'::jsonb)?'line')
      or public.vmp_source_scope_key(p_source.line)=
         public.vmp_source_scope_key(p_filters->>'line'))
    and (not (coalesce(p_filters,'{}'::jsonb)?'validation')
      or p_filters->>'validation'='all'
      or (p_filters->>'validation'='validated'
          and lower(btrim(coalesce(p_source.validate_flag,'')))='y')
      or (p_filters->>'validation'='outside'
          and lower(btrim(coalesce(p_source.validate_flag,'')))<>'y'))
    and (not (coalesce(p_filters,'{}'::jsonb)?'first_month')
      or p_filters->>'first_month'='all'
      or (p_filters->>'first_month'='missing'
          and p_source.first_month is null)
      or (p_filters->>'first_month'='present'
          and p_source.first_month is not null))
    and (not (coalesce(p_filters,'{}'::jsonb)?'owner')
      or p_filters->>'owner'='all'
      or (p_filters->>'owner'='assigned'
          and nullif(btrim(p_source.owner_name),'') is not null)
      or (p_filters->>'owner'='unassigned'
          and nullif(btrim(p_source.owner_name),'') is null)
      or (left(p_filters->>'owner',6)='owner:'
          and public.vmp_source_scope_key(p_source.owner_name)=
              public.vmp_source_scope_key(substring(
                p_filters->>'owner' from 7))))
    and (not (coalesce(p_filters,'{}'::jsonb)?'frequency')
      or p_filters->>'frequency'='all'
      or (p_filters->>'frequency'='lte12'
          and p_source.frequency_months is not null
          and p_source.frequency_months<=12)
      or (p_filters->>'frequency'='gt12'
          and p_source.frequency_months is not null
          and p_source.frequency_months>12))
$function$;

revoke all on function public.vmp_source_filters_valid(jsonb),
  public.vmp_source_object_matches_filters(
    public.vmp_source_objects,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.vmp_source_filters_valid(jsonb),
  public.vmp_source_object_matches_filters(
    public.vmp_source_objects,text,jsonb)
  to service_role;

-- Exact invoker query paths are the EXPLAIN boundary for the browser
-- delegates below. Authentication, cursor validation, limits, filtering, and
-- authorization all live in these single-statement paths.
create function public.vmp_source_objects_page_path(
  p_actor uuid,p_object_kind text,p_search text,p_filters jsonb,p_cursor jsonb,
  p_limit integer,p_include_inactive boolean,p_object_id uuid
)
returns table(payload jsonb)
language sql
stable
as $function$
with actor as (
  select p_actor actor_id,public.vmp_business_role(p_actor) role_name,
         exists (
           select 1 from public.profiles profile
           where profile.id=p_actor and coalesce(profile.is_active,true)
         ) active_account
), cursor_input as (
  select case when p_cursor is null then true
              when jsonb_typeof(p_cursor)='object'
               and jsonb_typeof(p_cursor->'object_code')='string'
               and jsonb_typeof(p_cursor->'id')='string'
               and (p_cursor->>'id') ~*
                   '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then true else false end valid,
         case when p_cursor is not null
                and jsonb_typeof(p_cursor)='object'
                and jsonb_typeof(p_cursor->'id')='string'
                and (p_cursor->>'id') ~*
                    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (p_cursor->>'id')::uuid end cursor_id,
         case when p_cursor is not null and jsonb_typeof(p_cursor)='object'
                and jsonb_typeof(p_cursor->'object_code')='string'
              then p_cursor->>'object_code' end cursor_code
), manager_authorized as (
  select source_object.*
  from actor
  join public.vmp_source_objects source_object
    on actor.role_name in ('admin','qa_manager')
), qa_authorized as (
  select source_object.*
  from actor
  join public.vmp_performers performer
    on actor.role_name='qa_staff'
   and performer.user_id=actor.actor_id and performer.is_active
  join public.vmp_source_objects source_object
    on source_object.is_active is true
   and source_object.owner_person_id=performer.id
  union
  select source_object.*
  from actor
  join public.vmp_performers performer
    on actor.role_name='qa_staff'
   and performer.user_id=actor.actor_id and performer.is_active
  join public.vmp_source_objects source_object
    on source_object.is_active is true
   and source_object.support_person_id=performer.id
), workshop_authorized as (
  select source_object.*
  from actor
  join public.vmp_performers performer
    on actor.role_name in ('workshop_manager','workshop_staff')
   and performer.user_id=actor.actor_id and performer.is_active
  join public.vmp_source_workshop_scope_grants grant_row
    on grant_row.performer_id=performer.id and grant_row.is_active
   and grant_row.line_key is null
   and grant_row.valid_from<=transaction_timestamp()
   and (grant_row.expires_at is null
        or grant_row.expires_at>transaction_timestamp())
  join lateral (
    select scoped_source.*
    from public.vmp_source_objects scoped_source
    where scoped_source.is_active is true
      and nullif(public.vmp_source_scope_key(scoped_source.department),'')
          is not null
      and nullif(public.vmp_source_scope_key(scoped_source.area_code),'')
          is not null
      and public.vmp_source_scope_key(scoped_source.department)=
          grant_row.department_key
      and public.vmp_source_scope_key(scoped_source.area_code)=
          grant_row.area_key
    offset 0
  ) source_object on true
  union
  select source_object.*
  from actor
  join public.vmp_performers performer
    on actor.role_name in ('workshop_manager','workshop_staff')
   and performer.user_id=actor.actor_id and performer.is_active
  join public.vmp_source_workshop_scope_grants grant_row
    on grant_row.performer_id=performer.id and grant_row.is_active
   and grant_row.line_key is not null
   and grant_row.valid_from<=transaction_timestamp()
   and (grant_row.expires_at is null
        or grant_row.expires_at>transaction_timestamp())
  join lateral (
    select scoped_source.*
    from public.vmp_source_objects scoped_source
    where scoped_source.is_active is true
      and nullif(public.vmp_source_scope_key(scoped_source.department),'')
          is not null
      and nullif(public.vmp_source_scope_key(scoped_source.area_code),'')
          is not null
      and nullif(public.vmp_source_scope_key(scoped_source.line),'') is not null
      and public.vmp_source_scope_key(scoped_source.department)=
          grant_row.department_key
      and public.vmp_source_scope_key(scoped_source.area_code)=
          grant_row.area_key
      and public.vmp_source_scope_key(scoped_source.line)=grant_row.line_key
    offset 0
  ) source_object on true
), authorized as (
  select * from manager_authorized
  union all
  select * from qa_authorized
  union all
  select * from workshop_authorized
), filtered as (
  select authorized.*
  from authorized cross join actor
  where (authorized.is_active
         or (actor.role_name in ('admin','qa_manager')
             and coalesce(p_include_inactive,false)))
    and (p_object_kind is null or authorized.object_kind=p_object_kind)
    and public.vmp_source_object_matches_filters(
          authorized,p_search,p_filters)
    and (p_object_id is null or authorized.id=p_object_id)
), cursor_status as (
  select cursor_input.*,
         p_cursor is null or exists (
           select 1 from filtered
           where filtered.object_code=cursor_input.cursor_code
             and filtered.id=cursor_input.cursor_id
         ) present
  from cursor_input
), paged as (
  select filtered.*
  from filtered cross join cursor_status
  where p_cursor is null
     or (filtered.object_code,filtered.id)>
        (cursor_status.cursor_code,cursor_status.cursor_id)
), limited as (
  select paged.* from paged order by object_code,id
  limit case when p_limit between 1 and 100 then p_limit+1 else 0 end
), returned as (
  select limited.* from limited order by object_code,id
  limit case when p_limit between 1 and 100 then p_limit else 0 end
)
select case
  when not actor.active_account then jsonb_build_object(
    'ok',false,'error_code','ACCOUNT_DISABLED','error','Tài khoản không hoạt động')
  when actor.role_name is null then jsonb_build_object(
    'ok',false,'error_code','ROLE_UNRESOLVED','error','Không xác định được vai trò nghiệp vụ')
  when p_limit is null or p_limit<1 or p_limit>100 then jsonb_build_object(
    'ok',false,'error_code','INVALID_LIMIT','error','Giới hạn phải từ 1 đến 100')
  when not public.vmp_source_filters_valid(p_filters) then
    jsonb_build_object(
      'ok',false,'error_code','INVALID_FILTERS','error','Bộ lọc phải là JSON object')
  when not cursor_status.valid then jsonb_build_object(
    'ok',false,'error_code','INVALID_CURSOR','error','Con trỏ không hợp lệ')
  when not cursor_status.present then jsonb_build_object(
    'ok',false,'error_code','CURSOR_EXPIRED','error','Con trỏ không còn hiệu lực')
  else jsonb_build_object(
    'ok',true,
    'rows',coalesce((select jsonb_agg(to_jsonb(returned) order by object_code,id)
                     from returned),'[]'::jsonb),
    'authorized_total',(select count(*) from filtered),
    'next_cursor',case when (select count(*) from limited)>p_limit then (
      select jsonb_build_object('object_code',object_code,'id',id)
      from returned order by object_code desc,id desc limit 1
    ) else null end
  )
end payload
from actor cross join cursor_status
$function$;

revoke all on function public.vmp_source_objects_page_path(
  uuid,text,text,jsonb,jsonb,integer,boolean,uuid)
  from public,anon,authenticated;
grant execute on function public.vmp_source_objects_page_path(
  uuid,text,text,jsonb,jsonb,integer,boolean,uuid)
  to service_role;

create or replace function public.rpc_list_source_objects(
  p_object_kind text,p_search text,p_filters jsonb,p_cursor jsonb,
  p_limit integer,p_include_inactive boolean,p_object_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select query_path.payload
  from public.vmp_source_objects_page_path(
    auth.uid(),p_object_kind,p_search,p_filters,p_cursor,p_limit,
    p_include_inactive,p_object_id
  ) query_path
$function$;

revoke all on function public.rpc_list_source_objects(
  text,text,jsonb,jsonb,integer,boolean,uuid)
  from public,anon;
grant execute on function public.rpc_list_source_objects(
  text,text,jsonb,jsonb,integer,boolean,uuid)
  to authenticated,service_role;

create function public.vmp_editable_progress_rights_path(p_actor uuid)
returns table(payload jsonb)
language sql
stable
as $function$
with actor as (
  select public.vmp_business_role(p_actor) role_name,
         exists (
           select 1 from public.profiles profile
           where profile.id=p_actor and coalesce(profile.is_active,true)
         ) active_account
), actor_person as (
  select performer.id person_id
  from actor
  join public.vmp_performers performer
    on performer.user_id=p_actor and performer.is_active
), admin_resolved as (
  select item.validation_code,rights.editable_fields,rights.view_reason
  from actor
  join public.vmp_plan_items item
    on actor.role_name='admin' and item.is_active is true
  cross join lateral public.vmp_item_rights(
    p_actor,item.validation_code
  ) rights
  where rights.can_view
    and cardinality(coalesce(rights.editable_fields,'{}'::text[]))>0
), qa_manager_resolved as (
  select item.validation_code,
         array[
           'actual_protocol_date','status_protocol',
           'actual_validation_date','status_validation',
           'actual_report_date','status_report',
           'actual_vmp_date','status_vmp'
         ]::text[] editable_fields,
         'Quản lý QA xem toàn bộ hạng mục hoạt động'::text view_reason
  from actor
  join public.vmp_plan_items item
    on actor.role_name='qa_manager'
   and public.vmp_can_manage_source_qa_assignment(p_actor)
   and item.is_active is true
), qa_sources as (
  select source_object.object_code
  from actor cross join actor_person
  join public.vmp_source_objects source_object
    on source_object.is_active is true
   and source_object.owner_person_id=actor_person.person_id
  where actor.role_name='qa_staff'
  union
  select source_object.object_code
  from actor cross join actor_person
  join public.vmp_source_objects source_object
    on source_object.is_active is true
   and source_object.support_person_id=actor_person.person_id
  where actor.role_name='qa_staff'
), qa_resolved as (
  select item.validation_code,
         array[
           'actual_protocol_date','status_protocol','status_validation',
           'actual_report_date','status_report','actual_vmp_date','status_vmp'
         ]::text[] editable_fields,
         'Quan hệ QA trực tiếp trên Source'::text view_reason
  from qa_sources
  join public.vmp_plan_items item
    on item.object_code=qa_sources.object_code and item.is_active is true
), workshop_sources as (
  select scoped_source.object_code,actor_person.person_id
  from actor cross join actor_person
  join public.vmp_source_workshop_scope_grants grant_row
    on grant_row.performer_id=actor_person.person_id
   and grant_row.is_active and grant_row.line_key is null
   and grant_row.valid_from<=transaction_timestamp()
   and (grant_row.expires_at is null
        or grant_row.expires_at>transaction_timestamp())
  join lateral (
    select source_object.object_code
    from public.vmp_source_objects source_object
    where source_object.is_active is true
      and nullif(public.vmp_source_scope_key(source_object.department),'')
          is not null
      and nullif(public.vmp_source_scope_key(source_object.area_code),'')
          is not null
      and public.vmp_source_scope_key(source_object.department)=
          grant_row.department_key
      and public.vmp_source_scope_key(source_object.area_code)=grant_row.area_key
    offset 0
  ) scoped_source on true
  where actor.role_name in ('workshop_manager','workshop_staff')
  union
  select scoped_source.object_code,actor_person.person_id
  from actor cross join actor_person
  join public.vmp_source_workshop_scope_grants grant_row
    on grant_row.performer_id=actor_person.person_id
   and grant_row.is_active and grant_row.line_key is not null
   and grant_row.valid_from<=transaction_timestamp()
   and (grant_row.expires_at is null
        or grant_row.expires_at>transaction_timestamp())
  join lateral (
    select source_object.object_code
    from public.vmp_source_objects source_object
    where source_object.is_active is true
      and nullif(public.vmp_source_scope_key(source_object.department),'')
          is not null
      and nullif(public.vmp_source_scope_key(source_object.area_code),'')
          is not null
      and nullif(public.vmp_source_scope_key(source_object.line),'') is not null
      and public.vmp_source_scope_key(source_object.department)=
          grant_row.department_key
      and public.vmp_source_scope_key(source_object.area_code)=grant_row.area_key
      and public.vmp_source_scope_key(source_object.line)=grant_row.line_key
    offset 0
  ) scoped_source on true
  where actor.role_name in ('workshop_manager','workshop_staff')
), workshop_resolved as (
  select distinct item.validation_code,
         array['actual_validation_date']::text[] editable_fields,
         'Có phạm vi Source và phân công xưởng đang hoạt động'::text view_reason
  from workshop_sources
  join public.vmp_plan_items item
    on item.object_code=workshop_sources.object_code and item.is_active is true
  join public.vmp_item_assignments assignment
    on assignment.validation_code=item.validation_code
   and assignment.performer_id=workshop_sources.person_id
   and assignment.assignment_kind='equipment_department'
   and assignment.is_active is true
   and (assignment.expires_at is null
        or assignment.expires_at>transaction_timestamp())
), resolved as (
  select * from admin_resolved
  union all
  select * from qa_manager_resolved
  union all
  select * from qa_resolved
  union all
  select * from workshop_resolved
)
select case
  when not actor.active_account then jsonb_build_object(
    'ok',false,'error_code','ACCOUNT_DISABLED','error','Tài khoản không hoạt động')
  when actor.role_name is null then jsonb_build_object(
    'ok',false,'error_code','ROLE_UNRESOLVED','error','Không xác định được vai trò nghiệp vụ')
  else jsonb_build_object(
    'ok',true,
    'rights',coalesce((select jsonb_agg(jsonb_build_object(
      'validation_code',resolved.validation_code,
      'editable_fields',to_jsonb(resolved.editable_fields),
      'view_reason',resolved.view_reason
    ) order by resolved.validation_code) from resolved),'[]'::jsonb)
  )
end payload
from actor
$function$;

revoke all on function public.vmp_editable_progress_rights_path(uuid)
  from public,anon,authenticated;
grant execute on function public.vmp_editable_progress_rights_path(uuid)
  to service_role;

create or replace function public.rpc_my_editable_progress_rights()
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select query_path.payload
  from public.vmp_editable_progress_rights_path(auth.uid()) query_path
$function$;

revoke all on function public.rpc_my_editable_progress_rights()
  from public,anon;
grant execute on function public.rpc_my_editable_progress_rights()
  to authenticated,service_role;

create function public.vmp_source_qa_candidates_page_path(
  p_actor uuid,p_search text,p_cursor jsonb,p_limit integer,p_include_ids uuid[]
)
returns table(payload jsonb)
language sql
stable
as $function$
with actor as (
  select public.vmp_business_role(p_actor) role_name,
         exists (
           select 1 from public.profiles profile
           where profile.id=p_actor and coalesce(profile.is_active,true)
         ) active_account
), cursor_input as (
  select case when p_cursor is null then true
              when jsonb_typeof(p_cursor)='object'
               and jsonb_typeof(p_cursor->'normalized_full_name')='string'
               and jsonb_typeof(p_cursor->'person_id')='string'
               and (p_cursor->>'person_id') ~*
                   '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then true else false end valid,
         case when p_cursor is not null
                and jsonb_typeof(p_cursor)='object'
                and jsonb_typeof(p_cursor->'person_id')='string'
                and (p_cursor->>'person_id') ~*
                    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (p_cursor->>'person_id')::uuid end cursor_id,
         case when p_cursor is not null and jsonb_typeof(p_cursor)='object'
                and jsonb_typeof(p_cursor->'normalized_full_name')='string'
              then p_cursor->>'normalized_full_name' end cursor_name
), candidate as (
  select performer.id person_id,performer.performer_name,
         performer.normalized_full_name,performer.email,performer.department,
         public.vmp_business_role(performer.user_id) role_name
  from public.vmp_performers performer
  join public.profiles profile on profile.id=performer.user_id
  where performer.is_active is true and performer.user_id is not null
    and performer.access_class in ('qa_manager','qa_progress_editor')
    and coalesce(profile.is_active,true)
    and public.vmp_business_role(profile.id) in ('qa_staff','qa_manager')
    and (coalesce(btrim(p_search),'')=''
         or performer.normalized_full_name like
              public.vmp_source_scope_key(p_search)||'%')
), cursor_status as (
  select cursor_input.*,
         p_cursor is null or exists (
           select 1 from candidate
           where candidate.normalized_full_name=cursor_input.cursor_name
             and candidate.person_id=cursor_input.cursor_id
         ) present
  from cursor_input
), paged as (
  select candidate.* from candidate cross join cursor_status
  where p_cursor is null
     or (candidate.normalized_full_name,candidate.person_id)>
        (cursor_status.cursor_name,cursor_status.cursor_id)
), limited as (
  select paged.* from paged
  order by normalized_full_name,person_id
  limit case when p_limit between 1 and 50 then p_limit+1 else 0 end
), returned as (
  select limited.* from limited order by normalized_full_name,person_id
  limit case when p_limit between 1 and 50 then p_limit else 0 end
), included as (
  select requested.person_id,performer.performer_name,
         performer.normalized_full_name,performer.email,performer.department,
         coalesce(
           public.vmp_business_role(performer.user_id) in ('qa_staff','qa_manager'),
           false
         ) eligible,
         case
           when performer.id is null then 'PERSON_NOT_FOUND'
           when not performer.is_active then 'PERFORMER_INACTIVE'
           when performer.user_id is null then 'ACCOUNT_UNLINKED'
           when not coalesce(profile.is_active,false) then 'ACCOUNT_DISABLED'
           when public.vmp_business_role(performer.user_id)
                not in ('qa_staff','qa_manager')
             or public.vmp_business_role(performer.user_id) is null
             then 'ROLE_INELIGIBLE'
           else null
         end ineligibility_reason
  from (
    select distinct unnest(coalesce(p_include_ids,'{}'::uuid[])) person_id
  ) requested
  left join public.vmp_performers performer on performer.id=requested.person_id
  left join public.profiles profile on profile.id=performer.user_id
)
select case
  when not actor.active_account then jsonb_build_object(
    'ok',false,'error_code','ACCOUNT_DISABLED','error','Tài khoản không hoạt động')
  when actor.role_name is null then jsonb_build_object(
    'ok',false,'error_code','ROLE_UNRESOLVED','error','Không xác định được vai trò nghiệp vụ')
  when actor.role_name not in ('admin','qa_manager') then jsonb_build_object(
    'ok',false,'error_code','FORBIDDEN','error','Không có quyền chọn QA phụ trách')
  when p_limit is null or p_limit<1 or p_limit>50 then jsonb_build_object(
    'ok',false,'error_code','INVALID_LIMIT','error','Giới hạn phải từ 1 đến 50')
  when not cursor_status.valid then jsonb_build_object(
    'ok',false,'error_code','INVALID_CURSOR','error','Con trỏ không hợp lệ')
  when not cursor_status.present then jsonb_build_object(
    'ok',false,'error_code','CURSOR_EXPIRED','error','Con trỏ không còn hiệu lực')
  else jsonb_build_object(
    'ok',true,
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'person_id',person_id,'performer_name',performer_name,
      'normalized_full_name',normalized_full_name,'email',email,
      'department',department,'role_name',role_name
    ) order by normalized_full_name,person_id) from returned),'[]'::jsonb),
    'included_current',coalesce((select jsonb_agg(to_jsonb(included)
      order by included.normalized_full_name nulls last,included.person_id)
      from included),'[]'::jsonb),
    'authorized_total',(select count(*) from candidate),
    'next_cursor',case when (select count(*) from limited)>p_limit then (
      select jsonb_build_object(
        'normalized_full_name',normalized_full_name,'person_id',person_id)
      from returned order by normalized_full_name desc,person_id desc limit 1
    ) else null end
  )
end payload
from actor cross join cursor_status
$function$;

revoke all on function public.vmp_source_qa_candidates_page_path(
  uuid,text,jsonb,integer,uuid[])
  from public,anon,authenticated;
grant execute on function public.vmp_source_qa_candidates_page_path(
  uuid,text,jsonb,integer,uuid[])
  to service_role;

create function public.rpc_source_qa_candidates(
  p_search text,p_cursor jsonb,p_limit integer,p_include_ids uuid[]
)
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select query_path.payload
  from public.vmp_source_qa_candidates_page_path(
    auth.uid(),p_search,p_cursor,p_limit,p_include_ids
  ) query_path
$function$;

revoke all on function public.rpc_source_qa_candidates(
  text,jsonb,integer,uuid[])
  from public,anon;
grant execute on function public.rpc_source_qa_candidates(
  text,jsonb,integer,uuid[])
  to authenticated,service_role;

create function public.rpc_source_object_facets(
  p_object_kind text,p_filters jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
declare
  v_actor uuid:=auth.uid();
  v_role text:=public.vmp_business_role(auth.uid());
  v_departments jsonb;
  v_areas jsonb;
  v_owners jsonb;
  v_validation jsonb;
  v_first_month jsonb;
  v_ownership jsonb;
  v_frequency jsonb;
begin
  if not public.vmp_is_active_session(v_actor) then
    return jsonb_build_object('ok',false,'error_code','ACCOUNT_DISABLED',
      'error','Tài khoản không hoạt động');
  end if;
  if v_role is null then
    return jsonb_build_object('ok',false,'error_code','ROLE_UNRESOLVED',
      'error','Không xác định được vai trò nghiệp vụ');
  end if;
  if not public.vmp_source_filters_valid(p_filters) then
    return jsonb_build_object('ok',false,'error_code','INVALID_FILTERS',
      'error','Bộ lọc phải là JSON object');
  end if;

  with visible as materialized (
    select source_object.*
    from public.vmp_source_objects source_object
    where source_object.is_active
      and public.vmp_can_view_source_object(v_actor,source_object.id)
      and (p_object_kind is null or source_object.object_kind=p_object_kind)
      and public.vmp_source_object_matches_filters(
            source_object,null,p_filters)
  ), department_rows as (
    select department value,count(*) row_count from visible
    where nullif(btrim(department),'') is not null group by department
  ), area_rows as (
    select area_code value,count(*) row_count from visible
    where nullif(btrim(area_code),'') is not null group by area_code
  ), owner_rows as (
    select owner_person_id person_id,max(owner_name) name,count(*) row_count
    from visible where owner_person_id is not null
      and nullif(btrim(owner_name),'') is not null group by owner_person_id
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object(
      'value',value,'count',row_count) order by value)
      from department_rows),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'value',value,'count',row_count) order by value)
      from area_rows),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'value','owner:'||public.vmp_source_scope_key(name),
      'person_id',person_id,'name',name,'count',row_count)
      order by name nulls last,person_id) from owner_rows),'[]'::jsonb)
    ,jsonb_build_array(
      jsonb_build_object('value','outside','count',(select count(*) from visible
        where lower(btrim(coalesce(validate_flag,'')))<>'y')),
      jsonb_build_object('value','validated','count',(select count(*) from visible
        where lower(btrim(coalesce(validate_flag,'')))='y')))
    ,jsonb_build_array(
      jsonb_build_object('value','missing','count',(select count(*) from visible
        where first_month is null)),
      jsonb_build_object('value','present','count',(select count(*) from visible
        where first_month is not null)))
    ,jsonb_build_array(
      jsonb_build_object('value','assigned','count',(select count(*) from visible
        where nullif(btrim(owner_name),'') is not null)),
      jsonb_build_object('value','unassigned','count',(select count(*) from visible
        where nullif(btrim(owner_name),'') is null)))
    ,jsonb_build_array(
      jsonb_build_object('value','gt12','count',(select count(*) from visible
        where frequency_months>12)),
      jsonb_build_object('value','lte12','count',(select count(*) from visible
        where frequency_months is not null and frequency_months<=12)))
  into v_departments,v_areas,v_owners,v_validation,v_first_month,
       v_ownership,v_frequency;

  return jsonb_build_object('ok',true,'departments',v_departments,
    'areas',v_areas,'owners',v_owners,'validation',v_validation,
    'first_month',v_first_month,'ownership',v_ownership,
    'frequency',v_frequency);
end
$function$;

create function public.rpc_export_source_objects(
  p_object_kind text,p_search text,p_filters jsonb,p_cursor jsonb,p_limit integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
declare
  v_actor uuid:=auth.uid();
  v_role text:=public.vmp_business_role(auth.uid());
  v_cursor_code text;
  v_cursor_id uuid;
  v_rows jsonb;
  v_total integer;
  v_has_more boolean;
  v_next jsonb;
begin
  if not public.vmp_is_active_session(v_actor) then
    return jsonb_build_object('ok',false,'error_code','ACCOUNT_DISABLED',
      'error','Tài khoản không hoạt động');
  end if;
  if v_role is null then
    return jsonb_build_object('ok',false,'error_code','ROLE_UNRESOLVED',
      'error','Không xác định được vai trò nghiệp vụ');
  end if;
  if p_limit is null or p_limit<1 or p_limit>500 then
    return jsonb_build_object('ok',false,'error_code','INVALID_LIMIT',
      'error','Giới hạn xuất phải từ 1 đến 500');
  end if;
  if not public.vmp_source_filters_valid(p_filters) then
    return jsonb_build_object('ok',false,'error_code','INVALID_FILTERS',
      'error','Bộ lọc phải là JSON object');
  end if;
  if p_cursor is not null then
    if jsonb_typeof(p_cursor)<>'object'
       or jsonb_typeof(p_cursor->'object_code')<>'string'
       or jsonb_typeof(p_cursor->'id')<>'string'
       or (p_cursor->>'id') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('ok',false,'error_code','INVALID_CURSOR',
        'error','Con trỏ không hợp lệ');
    end if;
    v_cursor_code:=p_cursor->>'object_code';
    v_cursor_id:=(p_cursor->>'id')::uuid;
  end if;

  if p_cursor is not null and not exists (
    select 1
    from public.vmp_source_objects source_object
    where source_object.id=v_cursor_id
      and source_object.object_code=v_cursor_code
      and source_object.is_active
      and public.vmp_can_view_source_object(v_actor,source_object.id)
      and (p_object_kind is null or source_object.object_kind=p_object_kind)
      and public.vmp_source_object_matches_filters(
            source_object,p_search,p_filters)
  ) then
    return jsonb_build_object('ok',false,'error_code','CURSOR_EXPIRED',
      'error','Con trỏ không còn hiệu lực');
  end if;

  with filtered as materialized (
    select source_object.*
    from public.vmp_source_objects source_object
    where source_object.is_active
      and public.vmp_can_view_source_object(v_actor,source_object.id)
      and (p_object_kind is null or source_object.object_kind=p_object_kind)
      and public.vmp_source_object_matches_filters(
            source_object,p_search,p_filters)
  ), page_plus_one as (
    select filtered.* from filtered
    where p_cursor is null
       or (filtered.object_code,filtered.id)>(v_cursor_code,v_cursor_id)
    order by object_code,id limit p_limit+1
  ), returned as (
    select page_plus_one.* from page_plus_one
    order by object_code,id limit p_limit
  )
  select
    coalesce((select jsonb_agg(to_jsonb(returned) order by object_code,id)
              from returned),'[]'::jsonb),
    (select count(*) from filtered),
    (select count(*) from page_plus_one)>p_limit,
    case when (select count(*) from page_plus_one)>p_limit then (
      select jsonb_build_object('object_code',object_code,'id',id)
      from returned order by object_code desc,id desc limit 1
    ) else null end
  into v_rows,v_total,v_has_more,v_next;

  insert into public.audit_logs(
    user_id,action,table_name,record_id,new_data,change_reason,source,
    effective_business_role
  ) values (
    v_actor,'EXPORT','vmp_source_objects',coalesce(p_object_kind,'*'),
    jsonb_build_object('returned',jsonb_array_length(v_rows),
      'authorized_total',v_total,'has_more',v_has_more),
    'Xuất danh mục Source theo phạm vi được phép','source_access_export',v_role
  );

  return jsonb_build_object('ok',true,'rows',v_rows,
    'authorized_total',v_total,'next_cursor',v_next);
end
$function$;

create function public.rpc_source_field_suggestions(
  p_object_kind text,p_field text,p_search text,p_cursor jsonb,p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
declare
  v_actor uuid:=auth.uid();
  v_field text:=lower(btrim(coalesce(p_field,'')));
  v_cursor text;
  v_rows jsonb;
  v_next jsonb;
  v_has_more boolean;
begin
  if not public.vmp_is_active_session(v_actor)
     or not public.vmp_can_manage_source_qa_assignment(v_actor) then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Chỉ Admin và Quản lý QA được xem gợi ý Source');
  end if;
  if v_field<>all(array[
       'department','area_code','line','object_code','object_name',
       'owner_name','support_name','report_class','status','work_group'
     ]::text[]) then
    return jsonb_build_object('ok',false,'error_code','INVALID_FIELD',
      'error','Trường gợi ý không được hỗ trợ');
  end if;
  if p_limit is null or p_limit<1 or p_limit>50 then
    return jsonb_build_object('ok',false,'error_code','INVALID_LIMIT',
      'error','Giới hạn phải từ 1 đến 50');
  end if;
  if p_cursor is not null then
    if jsonb_typeof(p_cursor)<>'object'
       or jsonb_typeof(p_cursor->'value')<>'string' then
      return jsonb_build_object('ok',false,'error_code','INVALID_CURSOR',
        'error','Con trỏ không hợp lệ');
    end if;
    v_cursor:=p_cursor->>'value';
  end if;

  execute format($query$
    with values_found as (
      select %1$I value,count(*) row_count
      from public.vmp_source_objects
      where is_active and ($1 is null or object_kind=$1)
        and nullif(btrim(%1$I),'') is not null
        and (coalesce(btrim($2),'')='' or %1$I ilike btrim($2)||'%%')
      group by %1$I
    ), page_plus_one as (
      select * from values_found where $3 is null or value>$3
      order by value limit $4+1
    ), returned as (
      select * from page_plus_one order by value limit $4
    )
    select coalesce((select jsonb_agg(jsonb_build_object(
             'value',value,'count',row_count) order by value)
             from returned),'[]'::jsonb),
           (select count(*) from page_plus_one)>$4,
           case when (select count(*) from page_plus_one)>$4 then (
             select jsonb_build_object('value',value)
             from returned order by value desc limit 1
           ) else null end
  $query$,v_field)
  into v_rows,v_has_more,v_next
  using p_object_kind,p_search,v_cursor,p_limit;

  return jsonb_build_object('ok',true,'rows',v_rows,'next_cursor',v_next);
end
$function$;

revoke all on function public.rpc_source_object_facets(text,jsonb),
  public.rpc_export_source_objects(text,text,jsonb,jsonb,integer),
  public.rpc_source_field_suggestions(text,text,text,jsonb,integer)
  from public,anon;
grant execute on function public.rpc_source_object_facets(text,jsonb),
  public.rpc_export_source_objects(text,text,jsonb,jsonb,integer),
  public.rpc_source_field_suggestions(text,text,text,jsonb,integer)
  to authenticated,service_role;

-- Dashboard, watermark, and warnings share the canonical Source visibility
-- predicate. Each builds one materialized visible-Source set and derives every
-- returned object/item/count from it, including cache invalidation revision.
create or replace function public.rpc_get_vmp_dashboard(
  p_year integer default extract(year from now())::integer,
  p_include_missing boolean default false,
  p_include_cancelled boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
declare
  v_result jsonb;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;

  with visible_source as materialized (
    select source_object.*,master_object.name master_name,
           master_object.classification master_classification,
           master_object.department master_department
    from public.vmp_source_objects source_object
    left join public.vmp_objects master_object
      on master_object.code=source_object.object_code
     and master_object.is_active
    where source_object.is_active
      and (auth.role()='service_role'
        or public.vmp_can_view_source_object(auth.uid(),source_object.id))
  ), visible_items as materialized (
    select item.*,source_object.master_name object_name,
           source_object.master_classification classification,
           source_object.master_department obj_dept,
           source_object.area_code area,source_object.line,
           source_object.frequency_months
    from public.vmp_plan_items item
    join visible_source source_object
      on source_object.object_code=item.object_code
    where item.year=p_year and item.is_active
      and (p_include_missing or not item.missing_from_sheet)
      and (p_include_cancelled
        or coalesce(item.item_state,'active')<>'cancelled')
  )
  select jsonb_build_object(
    'objects',coalesce((select jsonb_agg(jsonb_build_object(
      'code',source_object.object_code,
      'name',source_object.object_name,
      'cls',coalesce(source_object.master_classification,
                     public.vmp_ma_phan_loai(source_object.object_kind)),
      'cls_ten',source_object.object_kind,
      'dept',coalesce(source_object.master_department,
                      (public.vmp_parse_depts(source_object.department))[1],
                      'qa'),
      'dept_ten',source_object.department,
      'area',source_object.area_code,'line',source_object.line,
      'crit',case when source_object.criticality_score>=7 then 'Cao'
                  when source_object.criticality_score>=4 then 'TB'
                  when source_object.criticality_score is not null then 'Thấp'
                  else 'TB' end,
      'score',source_object.criticality_score,
      'owner',source_object.owner_name,
      'freq',source_object.frequency_months,
      'need',source_object.validate_flag='y'
    ) order by source_object.object_code) from visible_source source_object),
      '[]'::jsonb),
    'activities',coalesce((select jsonb_agg(jsonb_build_object(
      'id',item.validation_code,
      'validation_code',item.validation_code,
      'code',item.object_code,
      'name',item.object_name,
      'vtype',item.validation_type,
      'dept',item.obj_dept,
      'cls',coalesce(item.classification,public.vmp_ma_phan_loai(
        (select source.object_kind from visible_source source
         where source.object_code=item.object_code limit 1))),
      'depts',to_jsonb(coalesce(
        nullif(item.departments,array[]::text[]),
        nullif(public.vmp_parse_depts(item.department_text),array[]::text[]),
        array[coalesce(item.obj_dept,'qa')])),
      'exec_depts',to_jsonb(coalesce(
        item.execution_departments,
        public.vmp_parse_depts(nullif(trim(
          item.source_sheet_data->>'bo_phan_thuc_hien_goc'),'')),
        '{}'::text[])),
      'owner',coalesce(nullif(trim(item.owner_name),''),'—'),
      'support',nullif(trim(item.secondary_owner),''),
      'group',item.work_group,'effort',item.effort_days,
      'score',item.criticality_score,
      'crit',case when item.criticality_score>=7 then 'Cao'
                  when item.criticality_score>=4 then 'TB'
                  when item.criticality_score is not null then 'Thấp'
                  else 'TB' end,
      'target',item.deadline_vmp,'st',item.computed_status::text,
      'state',coalesce(item.item_state,'active'),'version',item.version,
      'dep',item.report_class,'docDone',item.is_doc_complete,
      'mismatch',item.has_mismatch,
      '_raw',jsonb_build_object(
        'version',item.version,'ma',item.object_code,
        'loai_td',item.validation_type,'qa',item.owner_name,
        'owner_person_id',item.owner_person_id,
        'email_qa',(select performer.email
          from public.vmp_performers performer
          where performer.id=item.owner_person_id and performer.is_active
            and performer.email is not null
            and performer.email not like '%.local'),
        'ho_tro',item.secondary_owner,'nhom_viec',item.work_group,
        'diem_trong_yeu',item.criticality_score,'bo_phan',item.obj_dept,
        'bo_phan_goc',item.department_text,
        'bo_phan_thuc_hien_goc',nullif(trim(
          item.source_sheet_data->>'bo_phan_thuc_hien_goc'),''),
        'phan_loai',item.classification,'khu_vuc',item.area,
        'line',item.line,'tan_suat',item.frequency_months,
        'dl_vmp',item.deadline_vmp,'dl_de_cuong',item.deadline_protocol,
        'dl_tham_dinh',item.deadline_validation,
        'dl_bao_cao',item.deadline_report,
        'tt_de_cuong',item.status_protocol::text,
        'tt_tham_dinh',item.status_validation::text,
        'tt_bao_cao',item.status_report::text,'tt_vmp',item.status_vmp::text,
        'tt_de_cuong_goc',item.status_protocol_text,
        'tt_tham_dinh_goc',item.status_validation_text,
        'tt_bao_cao_goc',item.status_report_text,
        'tt_vmp_goc',item.status_vmp_text,
        'ngay_de_cuong',item.actual_protocol_date,
        'ngay_tham_dinh',item.actual_validation_date,
        'ngay_bao_cao',item.actual_report_date,
        'ngay_vmp',item.actual_vmp_date,'lich_td',item.scheduled_date,
        'scheduled_at',item.scheduled_at,
        'state',coalesce(item.item_state,'active'))
    ) order by item.validation_code) from visible_items item),'[]'::jsonb),
    'source','supabase',
    'updated_at',greatest(
      coalesce((select max(updated_at) from visible_source),'epoch'::timestamptz),
      coalesce((select max(updated_at) from visible_items),'epoch'::timestamptz)),
    'authorization_revision',coalesce((select revision
      from public.vmp_authorization_revision where singleton),0),
    'year',p_year
  ) into v_result;
  return v_result;
end
$function$;

create or replace function public.rpc_get_vmp_watermark(
  p_year integer default extract(year from now())::integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
declare v_result jsonb;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  with visible_source as materialized (
    select source_object.*
    from public.vmp_source_objects source_object
    where source_object.is_active
      and (auth.role()='service_role'
        or public.vmp_can_view_source_object(auth.uid(),source_object.id))
  ), visible_items as materialized (
    select item.* from public.vmp_plan_items item
    join visible_source source_object
      on source_object.object_code=item.object_code
    where item.year=p_year and item.is_active
  )
  select jsonb_build_object(
    'year',p_year,'plan_items',(select count(*) from visible_items),
    'objects',(select count(*) from visible_source),
    'updated_at',greatest(
      coalesce((select max(updated_at) from visible_source),'epoch'::timestamptz),
      coalesce((select max(updated_at) from visible_items),'epoch'::timestamptz)),
    'authorization_revision',coalesce((select revision
      from public.vmp_authorization_revision where singleton),0)
  ) into v_result;
  return v_result;
end
$function$;

create or replace function public.rpc_source_warnings(p_year integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
declare
  v_year integer:=coalesce(p_year,extract(year from now())::integer);
  v_result jsonb;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  with visible_source as materialized (
    select source_object.*
    from public.vmp_source_objects source_object
    where source_object.is_active
      and (auth.role()='service_role'
        or public.vmp_can_view_source_object(auth.uid(),source_object.id))
  )
  select jsonb_build_object(
    'nam',v_year,
    'thieu_thang_dau',coalesce((select jsonb_agg(jsonb_build_object(
      'object_kind',object_kind,'object_code',object_code,
      'object_name',object_name) order by object_code)
      from visible_source where validate_flag='y' and first_month is null),
      '[]'::jsonb),
    'chua_tung_iq',coalesce((select jsonb_agg(jsonb_build_object(
      'object_kind',source_object.object_kind,
      'object_code',source_object.object_code,
      'object_name',source_object.object_name,'nam_nhap',source_object.year_ref)
      order by source_object.object_code)
      from visible_source source_object
      where source_object.validate_flag='y'
        and source_object.object_kind in ('Thiết bị','Hệ thống phụ trợ')
        and source_object.year_ref is not null
        and source_object.year_ref<>v_year
        and not exists (select 1 from public.vmp_plan_items item
          where item.object_code=source_object.object_code
            and item.validation_type='IQ' and item.is_active)),
      '[]'::jsonb),
    'show_tat',coalesce((select jsonb_agg(jsonb_build_object(
      'object_kind',object_kind,'object_code',object_code,
      'object_name',object_name,'show_flag',show_flag) order by object_code)
      from visible_source where validate_flag='y' and show_flag is not null
        and lower(show_flag)<>'y'),'[]'::jsonb),
    'chua_hoat_dong',coalesce((select jsonb_agg(jsonb_build_object(
      'object_kind',object_kind,'object_code',object_code,
      'object_name',object_name,'tinh_trang',status) order by object_code)
      from visible_source where validate_flag='y' and status is not null
        and lower(status) like '%chưa%'),'[]'::jsonb),
    'ma_tam',coalesce((select jsonb_agg(jsonb_build_object(
      'object_kind',object_kind,'object_code',object_code,
      'object_name',object_name,'note',note) order by object_code)
      from visible_source where object_code like 'TAM-%'),'[]'::jsonb)
  ) into v_result;
  return v_result;
end
$function$;

revoke all on function public.rpc_get_vmp_dashboard(integer,boolean,boolean),
  public.rpc_get_vmp_watermark(integer),public.rpc_source_warnings(integer)
  from public,anon;
grant execute on function public.rpc_get_vmp_dashboard(integer,boolean,boolean),
  public.rpc_get_vmp_watermark(integer),public.rpc_source_warnings(integer)
  to authenticated,service_role;

-- Non-object Source datasets and pending/global history are management
-- surfaces. Keep their public signatures, but make the manager decision at
-- the browser entrypoint before the legacy implementation can observe data.
create or replace function public.rpc_list_catalog_dataset(
  p_dataset text,p_search text default null,p_filters jsonb default '{}'::jsonb,
  p_limit integer default 100,p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
begin
  if coalesce(auth.role(),'')<>'service_role'
     and (not public.vmp_is_active_session(auth.uid())
          or not public.vmp_can_manage_source_qa_assignment(auth.uid())) then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Chỉ Admin và Quản lý QA được xem dữ liệu Source quản trị');
  end if;
  return public.rpc_list_catalog_dataset__five_role_impl_20260824(
    p_dataset,p_search,p_filters,p_limit,p_offset);
end
$function$;

create or replace function public.rpc_list_catalog_changes(
  p_object_kind text default null,p_status text default null,
  p_limit integer default 50,p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
begin
  if coalesce(auth.role(),'')<>'service_role'
     and (not public.vmp_is_active_session(auth.uid())
          or not public.vmp_can_manage_source_qa_assignment(auth.uid())) then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Chỉ Admin và Quản lý QA được xem thay đổi Source đang chờ');
  end if;
  return public.rpc_list_catalog_changes__five_role_impl_20260824(
    p_object_kind,p_status,p_limit,p_offset);
end
$function$;

alter function public.rpc_catalog_history(jsonb,integer,integer) stable;
alter function public.rpc_catalog_history_detail(uuid) stable;

revoke all on function public.rpc_list_catalog_dataset(
  text,text,jsonb,integer,integer),
  public.rpc_list_catalog_changes(text,text,integer,integer)
  from public,anon;
grant execute on function public.rpc_list_catalog_dataset(
  text,text,jsonb,integer,integer),
  public.rpc_list_catalog_changes(text,text,integer,integer)
  to authenticated,service_role;

create function public.vmp_reconcile_source_access_trigger()
returns trigger
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
declare
  v_validate_owner boolean := case when tg_op='INSERT' then true else
    old.owner_person_id is distinct from new.owner_person_id end;
  v_validate_support boolean := case when tg_op='INSERT' then true else
    old.support_person_id is distinct from new.support_person_id end;
begin
  -- Custom GUCs are caller-settable and cannot be trusted as an authorization
  -- fence. Validate only newly introduced/activated relations; an unchanged
  -- ineligible relation remains display-only for unrelated saves.
  if new.is_active is true and v_validate_owner
     and new.owner_person_id is not null
     and not exists (
       select 1
       from public.vmp_performers performer
       join public.profiles profile on profile.id=performer.user_id
       where performer.id=new.owner_person_id
         and performer.is_active is true
         and performer.user_id is not null
         and profile.is_active is true
         and public.vmp_business_role(performer.user_id) in ('qa_staff','qa_manager')
         and (select count(*) from public.vmp_performers active_performer
              where active_performer.user_id=performer.user_id
                and active_performer.is_active is true)=1
     ) then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_TRIGGER_OWNER_NOT_ELIGIBLE';
  end if;
  if new.is_active is true and v_validate_support
     and new.support_person_id is not null
     and not exists (
       select 1
       from public.vmp_performers performer
       join public.profiles profile on profile.id=performer.user_id
       where performer.id=new.support_person_id
         and performer.is_active is true
         and performer.user_id is not null
         and profile.is_active is true
         and public.vmp_business_role(performer.user_id) in ('qa_staff','qa_manager')
         and (select count(*) from public.vmp_performers active_performer
              where active_performer.user_id=performer.user_id
                and active_performer.is_active is true)=1
     ) then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_TRIGGER_SUPPORT_NOT_ELIGIBLE';
  end if;

  -- Every accepted active relation is reconciled before commit.
  perform public.vmp_reconcile_source_qa_projection(new.id);
  return new;
end
$function$;

create trigger vmp_source_objects_access_insert_projection
after insert on public.vmp_source_objects
for each row
when (new.is_active is true and
      (new.owner_person_id is not null or new.support_person_id is not null))
execute function public.vmp_reconcile_source_access_trigger();

create trigger vmp_source_objects_access_projection
after update of owner_person_id,support_person_id,is_active
on public.vmp_source_objects
for each row
when (new.is_active is true and
      ((old.owner_person_id,old.support_person_id)
       is distinct from (new.owner_person_id,new.support_person_id)
       or old.is_active is distinct from true))
execute function public.vmp_reconcile_source_access_trigger();

revoke all on function public.vmp_reconcile_source_access_trigger()
  from public,anon,authenticated,service_role;

create or replace function public.rpc_save_catalog_object__five_role_impl_20260824(
  p_object_kind text,p_object_code text,p_patch jsonb,
  p_reason text default null,p_expected_version integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
declare
  v_actor uuid:=auth.uid();
  v_role text:=public.vmp_business_role(auth.uid());
  v_patch jsonb:=coalesce(p_patch,'{}'::jsonb);
  v_bad text[];
  v_source public.vmp_source_objects%rowtype;
  v_after public.vmp_source_objects%rowtype;
  v_owner public.vmp_performers%rowtype;
  v_support public.vmp_performers%rowtype;
  v_owner_id uuid;
  v_support_id uuid;
  v_master_patch jsonb;
  v_timeline_patch jsonb:='{}'::jsonb;
  v_timeline_old jsonb:='{}'::jsonb;
  v_result jsonb;
  v_access_change boolean;
  v_owner_change boolean;
  v_support_change boolean;
  v_timeline_change boolean;
  v_change_id uuid;
  v_changed_fields text[];
begin
  if coalesce(auth.role(),'')<>'service_role' then
    if not public.vmp_is_active_session(v_actor)
       or not public.vmp_can_manage_source_qa_assignment(v_actor) then
      return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
        'error','Chỉ Admin và Quản lý QA được sửa danh mục Source');
    end if;
  end if;

  if jsonb_typeof(v_patch)<>'object' then
    return jsonb_build_object('ok',false,'error_code','PATCH_INVALID',
      'error','Patch phải là JSON object');
  end if;
  select array_agg(key order by key) into v_bad
  from jsonb_object_keys(v_patch) key
  where key<>all(array[
    'object_name','department','area_code','line','status','show_flag',
    'validate_flag','validate_reason','frequency_months','report_class',
    'workdays','first_month','year_ref','note','critical_point','work_group',
    'complexity_score','quality_impact_score','criticality_score',
    'owner_person_id','support_person_id','owner_name','support_name',
    'is_active'
  ]::text[]);
  if v_bad is not null then
    return jsonb_build_object('ok',false,
      'error_code','PATCH_FIELD_NOT_ALLOWED',
      'error','Trường không được phép sửa: '||array_to_string(v_bad,', '));
  end if;
  if (v_patch?'owner_name' and not (v_patch?'owner_person_id'))
     or (v_patch?'support_name' and not (v_patch?'support_person_id')) then
    return jsonb_build_object('ok',false,'error_code','PERSON_ID_REQUIRED',
      'error','QA phụ trách/hỗ trợ phải được chọn bằng person_id');
  end if;

  -- Acquire the final table mode before the first Source tuple. The public
  -- wrapper already holds the per-object advisory drained by deployments.
  lock table public.vmp_source_objects in row exclusive mode;

  select source_object.* into v_source
  from public.vmp_source_objects source_object
  where source_object.object_kind=p_object_kind
    and source_object.object_code=p_object_code
  for update;

  if found and p_expected_version is not null
     and v_source.version is distinct from p_expected_version then
    return jsonb_build_object('ok',false,'error_code','VERSION_CONFLICT',
      'error','Bản ghi đã được người khác sửa','current_version',v_source.version);
  end if;

  select coalesce(jsonb_object_agg(entry.key,entry.value),'{}'::jsonb)
    into v_timeline_patch
  from jsonb_each(v_patch) entry
  where entry.key=any(public.vmp_catalog_timeline_fields());
  v_timeline_change:=v_timeline_patch<>'{}'::jsonb;

  begin
    if v_patch?'owner_person_id'
       and nullif(v_patch->>'owner_person_id','') is not null then
      v_owner_id:=(v_patch->>'owner_person_id')::uuid;
    elsif v_patch?'owner_person_id' then
      v_owner_id:=null;
    else
      v_owner_id:=v_source.owner_person_id;
    end if;
    if v_patch?'support_person_id'
       and nullif(v_patch->>'support_person_id','') is not null then
      v_support_id:=(v_patch->>'support_person_id')::uuid;
    elsif v_patch?'support_person_id' then
      v_support_id:=null;
    else
      v_support_id:=v_source.support_person_id;
    end if;
  exception when invalid_text_representation then
    return jsonb_build_object('ok',false,'error_code','INVALID_PERSON_ID',
      'error','person_id không đúng định dạng UUID');
  end;

  v_owner_change:=(v_patch?'owner_person_id')
    and v_owner_id is distinct from v_source.owner_person_id;
  v_support_change:=(v_patch?'support_person_id')
    and v_support_id is distinct from v_source.support_person_id;
  v_access_change:=v_owner_change or v_support_change;

  if (v_access_change or v_timeline_change)
     and nullif(btrim(coalesce(p_reason,'')),'') is null then
    return jsonb_build_object('ok',false,'error_code','REASON_REQUIRED',
      'error','Sửa quyền hoặc timeline phải nhập lý do');
  end if;

  -- Retained now-ineligible selections do not block unrelated master saves.
  -- Any actual access change validates the complete resulting relationship.
  if v_access_change then
    perform 1 from public.profiles profile
    where profile.id in (
      select performer.user_id from public.vmp_performers performer
      where performer.id=any(array[v_owner_id,v_support_id]::uuid[])
    ) order by profile.id for share;
    perform 1 from public.vmp_performers performer
    where performer.id=any(array[v_owner_id,v_support_id]::uuid[])
    order by performer.id for share;

    if v_owner_id is not null then
      select performer.* into v_owner
      from public.vmp_performers performer
      join public.profiles profile on profile.id=performer.user_id
      where performer.id=v_owner_id and performer.is_active
        and performer.user_id is not null and profile.is_active
        and public.vmp_business_role(performer.user_id) in ('qa_staff','qa_manager');
      if not found or (select count(*) from public.vmp_performers performer
                       where performer.user_id=v_owner.user_id
                         and performer.is_active)<>1 then
        return jsonb_build_object('ok',false,
          'error_code','PERSON_NOT_ELIGIBLE',
          'error','QA phụ trách không phải principal QA hoạt động duy nhất');
      end if;
    end if;
    if v_support_id is not null then
      select performer.* into v_support
      from public.vmp_performers performer
      join public.profiles profile on profile.id=performer.user_id
      where performer.id=v_support_id and performer.is_active
        and performer.user_id is not null and profile.is_active
        and public.vmp_business_role(performer.user_id) in ('qa_staff','qa_manager');
      if not found or (select count(*) from public.vmp_performers performer
                       where performer.user_id=v_support.user_id
                         and performer.is_active)<>1 then
        return jsonb_build_object('ok',false,
          'error_code','PERSON_NOT_ELIGIBLE',
          'error','QA hỗ trợ không phải principal QA hoạt động duy nhất');
      end if;
    end if;
  end if;

  -- The legacy master upsert applies every key it receives immediately. Keep
  -- planned-timeline keys out of that call so mixed saves commit access/master
  -- now while the timeline subset remains pending until preview/apply.
  v_master_patch:=v_patch-array[
    'owner_person_id','support_person_id','owner_name','support_name',
    'frequency_months','first_month','report_class','workdays',
    'validate_flag','is_active'
  ]::text[];
  v_result:=public.vmp_upsert_source_object_before_person_id(
    p_object_kind,p_object_code,v_master_patch);
  if coalesce((v_result->>'ok')::boolean,false) is not true then
    return v_result;
  end if;

  select source_object.* into strict v_after
  from public.vmp_source_objects source_object
  where source_object.id=(v_result->>'id')::uuid
  for update;
  if v_source.id is null then
    v_source:=v_after;
  end if;

  select coalesce(jsonb_object_agg(field,to_jsonb(v_source)->field),
                  '{}'::jsonb)
    into v_timeline_old
  from unnest(public.vmp_catalog_timeline_fields()) field
  where v_timeline_patch?field;

  update public.vmp_source_objects source_object
  set owner_person_id=case when v_owner_change
        then v_owner_id else source_object.owner_person_id end,
      owner_name=case when v_owner_change
        then case when v_owner_id is null then null
                  else v_owner.performer_name end
        else source_object.owner_name end,
      support_person_id=case when v_support_change
        then v_support_id else source_object.support_person_id end,
      support_name=case when v_support_change
        then case when v_support_id is null then null
                  else v_support.performer_name end
        else source_object.support_name end,
      version=coalesce(source_object.version,1)+1,
      timeline_revision=coalesce(source_object.timeline_revision,0)+
        case when v_timeline_change then 1 else 0 end,
      updated_by=coalesce(v_actor,source_object.updated_by),updated_at=now()
  where source_object.id=v_after.id
  returning source_object.* into strict v_after;

  if v_access_change then
    perform public.vmp_reconcile_source_qa_projection(v_after.id);
  end if;

  -- Disposable-clone failpoint for the required runtime atomicity proof. It is
  -- inert unless the reviewed test fixture marker exists, and fires only after
  -- Source and every related item/assignment projection has been written in
  -- this function's subtransaction.
  if current_setting('vmp.source_access_save_failpoint',true)=
       'after_projection_before_audit'
     and exists (
       select 1 from public.system_config
       where key='five_role_test_fixture' and value='true'::jsonb
     ) then
    raise exception using errcode='check_violation',
      message='SACCESS_RUNTIME_SAVE_FAILURE_AFTER_PROJECTION';
  end if;

  select array_agg(key order by key) into v_changed_fields
  from jsonb_object_keys(v_patch) key;
  insert into public.audit_logs(
    user_id,action,table_name,record_id,changed_fields,change_reason,
    old_data,new_data,source,effective_business_role
  ) values (
    v_actor,'UPDATE'::public.audit_action,'vmp_source_objects',
    v_after.id::text,coalesce(v_changed_fields,'{}'::text[]),
    nullif(btrim(coalesce(p_reason,'')),''),to_jsonb(v_source),to_jsonb(v_after),
    'source_catalog_access_save',v_role
  );

  if v_timeline_change then
    update public.vmp_catalog_changes
    set status='superseded'
    where object_kind=p_object_kind and object_code=p_object_code
      and status in ('pending','previewed');
    insert into public.vmp_catalog_changes(
      object_kind,object_code,source_version,timeline_revision,
      old_data,new_data,created_by
    ) values (
      p_object_kind,p_object_code,v_after.version,v_after.timeline_revision,
      v_timeline_old,v_timeline_patch,v_actor
    ) returning id into v_change_id;
  end if;

  return jsonb_build_object(
    'ok',true,'object_code',p_object_code,'change_id',v_change_id,
    'version',v_after.version,'timeline_revision',v_after.timeline_revision,
    'timeline_applied_revision',v_after.timeline_applied_revision,
    'pending_timeline',coalesce(v_after.timeline_revision,0)>
                       coalesce(v_after.timeline_applied_revision,0),
    'reason',nullif(btrim(coalesce(p_reason,'')),'')
  );
exception when others then
  raise log 'SOURCE_ACCESS_SAVE_ERROR code=% sqlstate=% error=%',
    p_object_code,sqlstate,sqlerrm;
  return jsonb_build_object('ok',false,'error_code','SAVE_FAILED',
    'error',sqlerrm,'sqlstate',sqlstate);
end
$function$;

-- The service entrypoint now uses the same atomic implementation instead of
-- the legacy per-item partial-success cascade.
create or replace function public.rpc_upsert_source_object(
  p_object_kind text,p_object_code text,p_patch jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
begin
  perform public.vmp_lock_catalog_object_v2(p_object_kind,p_object_code);
  return public.rpc_save_catalog_object__five_role_impl_20260824(
    p_object_kind,p_object_code,p_patch,
    'Service Source upsert with canonical QA reconciliation',null);
end
$function$;

revoke all on function public.rpc_upsert_source_object(text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.rpc_upsert_source_object(text,text,jsonb)
  to service_role;

-- Legacy pending rows must never replay canonical Source access. Normal writes
-- are sanitized by the trigger below; these guards also fail closed for any
-- pre-existing or manually restored V1/V2 row containing access keys.
create or replace function public.rpc_preview_catalog_change(p_change_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  if exists (
    select 1 from public.vmp_catalog_changes change
    where change.id=p_change_id and (
      change.old_data?|array[
        'owner_person_id','support_person_id','owner_name','support_name'
      ] or change.new_data?|array[
        'owner_person_id','support_person_id','owner_name','support_name'
      ]
    )
  ) then
    return jsonb_build_object('ok',false,
      'error_code','ACCESS_FIELDS_NOT_APPLICABLE',
      'error','Thay đổi timeline không được chứa quan hệ QA Source');
  end if;
  return public.rpc_preview_catalog_change__five_role_impl_20260824(
    p_change_id);
end
$function$;

create or replace function public.rpc_apply_catalog_change(
  p_change_id uuid,p_reason text,
  p_expected_timeline_revision integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
declare
  v_kind text;
  v_code text;
  v_old jsonb;
  v_new jsonb;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  select object_kind,object_code into v_kind,v_code
  from public.vmp_catalog_changes where id=p_change_id;
  if v_kind is not null then
    perform public.vmp_lock_catalog_object_v2(v_kind,v_code);
    perform public.vmp_lock_source_plan_relations(array[v_code]);
  end if;
  select old_data,new_data into v_old,v_new
  from public.vmp_catalog_changes where id=p_change_id for update;
  if found and (
       v_old?|array[
         'owner_person_id','support_person_id','owner_name','support_name'
       ] or v_new?|array[
         'owner_person_id','support_person_id','owner_name','support_name'
       ]
     ) then
    return jsonb_build_object('ok',false,
      'error_code','ACCESS_FIELDS_NOT_APPLICABLE',
      'error','Thay đổi timeline không được chứa quan hệ QA Source');
  end if;
  return public.rpc_apply_catalog_change__five_role_impl_20260824(
    p_change_id,p_reason,p_expected_timeline_revision);
end
$function$;

create or replace function public.rpc_preview_catalog_change_v2(
  p_change_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  if coalesce(auth.role(),'')<>'service_role'
     and coalesce(public.vmp_business_role(auth.uid()),'')
         not in ('admin','qa_manager') then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Chỉ Admin và Quản lý QA được xem thay đổi timeline');
  end if;
  if exists (
    select 1 from public.vmp_catalog_changes change
    where change.id=p_change_id and (
      change.old_data?|array[
        'owner_person_id','support_person_id','owner_name','support_name'
      ] or change.new_data?|array[
        'owner_person_id','support_person_id','owner_name','support_name'
      ]
    )
  ) then
    return jsonb_build_object('ok',false,
      'error_code','ACCESS_FIELDS_NOT_APPLICABLE',
      'error','Thay đổi timeline không được chứa quan hệ QA Source');
  end if;
  return public.vmp_preview_catalog_change_v2_impl(p_change_id);
end
$function$;

create or replace function public.rpc_apply_catalog_change_v2(
  p_change_id uuid,p_reason text,p_expected_timeline_revision integer,
  p_deadline_overrides jsonb,p_override_confirmed boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
declare
  v_kind text;
  v_code text;
  v_old jsonb;
  v_new jsonb;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  if coalesce(auth.role(),'')<>'service_role'
     and coalesce(public.vmp_business_role(auth.uid()),'')
         not in ('admin','qa_manager') then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Chỉ Admin và Quản lý QA được cập nhật deadline của hạng mục đã có tiến độ');
  end if;
  select object_kind,object_code into v_kind,v_code
  from public.vmp_catalog_changes where id=p_change_id;
  if v_kind is not null then
    perform public.vmp_lock_catalog_object_v2(v_kind,v_code);
    perform public.vmp_lock_source_plan_relations(array[v_code]);
  end if;
  select old_data,new_data into v_old,v_new
  from public.vmp_catalog_changes where id=p_change_id for update;
  if found and (
       v_old?|array[
         'owner_person_id','support_person_id','owner_name','support_name'
       ] or v_new?|array[
         'owner_person_id','support_person_id','owner_name','support_name'
       ]
     ) then
    return jsonb_build_object('ok',false,
      'error_code','ACCESS_FIELDS_NOT_APPLICABLE',
      'error','Thay đổi timeline không được chứa quan hệ QA Source');
  end if;
  return public.vmp_apply_catalog_change_v2_impl(
    p_change_id,p_reason,p_expected_timeline_revision,
    p_deadline_overrides,p_override_confirmed);
end
$function$;

-- Every reviewed plan relation writer acquires Source/master evidence before
-- delegating to its existing implementation. Public signatures and browser
-- ACLs are unchanged.
create or replace function public.rpc_generate_timeline(
  p_year integer default null,p_commit boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  if coalesce(p_commit,false) then
    perform public.vmp_lock_source_plan_relations(null);
  end if;
  return public.rpc_generate_timeline__five_role_impl_20260824(
    p_year,p_commit);
end
$function$;

create or replace function public.rpc_create_plan_item(
  p_object_code text,p_validation_type text,p_year integer default null,
  p_occurrence integer default 1,p_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  perform public.vmp_lock_source_plan_relations(array[p_object_code]);
  return public.rpc_create_plan_item__five_role_impl_20260824(
    p_object_code,p_validation_type,p_year,p_occurrence,p_patch);
end
$function$;

create or replace function public.rpc_commit_catalog_import(
  p_batch_id uuid,p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  perform public.vmp_lock_source_plan_relations(null);
  return public.rpc_commit_catalog_import__five_role_impl_20260824(
    p_batch_id,p_reason);
end
$function$;

create or replace function public.rpc_delete_plan_item(
  p_validation_code text,p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
declare
  v_object_code text;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  select item.object_code into v_object_code
  from public.vmp_plan_items item
  where item.validation_code=p_validation_code;
  if v_object_code is not null then
    perform public.vmp_lock_source_plan_relations(array[v_object_code]);
  end if;
  return public.rpc_delete_plan_item__five_role_impl_20260824(
    p_validation_code,p_reason);
end
$function$;

create or replace function public.rpc_set_item_state(
  p_validation_code text,p_state text,p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
declare
  v_object_code text;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  select item.object_code into v_object_code
  from public.vmp_plan_items item
  where item.validation_code=p_validation_code;
  if v_object_code is not null then
    perform public.vmp_lock_source_plan_relations(array[v_object_code]);
  end if;
  return public.rpc_set_item_state__five_role_impl_20260824(
    p_validation_code,p_state,p_reason);
end
$function$;

create or replace function public.rpc_resolve_missing(
  p_validation_code text,p_decision text,p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
declare
  v_object_code text;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  select item.object_code into v_object_code
  from public.vmp_plan_items item
  where item.validation_code=p_validation_code;
  if v_object_code is not null then
    perform public.vmp_lock_source_plan_relations(array[v_object_code]);
  end if;
  return public.rpc_resolve_missing__five_role_impl_20260824(
    p_validation_code,p_decision,p_reason);
end
$function$;

-- The three service writers have legacy inline bodies. Rename those exact
-- bodies owner-only and install same-signature ordering wrappers.
alter function public.rpc_apply_sheet_sync(text,text,jsonb)
  rename to rpc_apply_sheet_sync__source_impl_20260828;
revoke all on function
  public.rpc_apply_sheet_sync__source_impl_20260828(text,text,jsonb)
  from public,anon,authenticated,service_role;

create function public.rpc_apply_sheet_sync(
  p_op text,p_validation_code text,p_patch jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
declare
  v_current_code text;
  v_target_code text;
begin
  if p_op in ('update','soft_delete') then
    select item.object_code into v_current_code
    from public.vmp_plan_items item
    where item.validation_code=p_validation_code;
  end if;
  if p_op='insert' or (p_op='update' and coalesce(p_patch,'{}'::jsonb)?'object_code') then
    v_target_code:=nullif(p_patch->>'object_code','');
  end if;
  if p_op in ('insert','update') then
    perform public.vmp_lock_source_plan_relations(
      array[v_current_code,v_target_code]);
  end if;
  return public.rpc_apply_sheet_sync__source_impl_20260828(
    p_op,p_validation_code,p_patch);
end
$function$;

revoke all on function public.rpc_apply_sheet_sync(text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.rpc_apply_sheet_sync(text,text,jsonb)
  to service_role;

alter function public.rpc_sync_vmp_sheet_snapshot(text,text,text,jsonb,jsonb)
  rename to rpc_sync_vmp_sheet_snapshot__source_impl_20260828;
revoke all on function
  public.rpc_sync_vmp_sheet_snapshot__source_impl_20260828(
    text,text,text,jsonb,jsonb)
  from public,anon,authenticated,service_role;

create function public.rpc_sync_vmp_sheet_snapshot(
  p_sheet_id text,p_sheet_gid text,p_tab_name text,p_headers jsonb,p_rows jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,extensions,pg_temp
as $function$
begin
  perform public.vmp_lock_source_plan_relations(null);
  return public.rpc_sync_vmp_sheet_snapshot__source_impl_20260828(
    p_sheet_id,p_sheet_gid,p_tab_name,p_headers,p_rows);
end
$function$;

revoke all on function public.rpc_sync_vmp_sheet_snapshot(
  text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.rpc_sync_vmp_sheet_snapshot(
  text,text,text,jsonb,jsonb) to service_role;

alter function public.rpc_rollback_vmp_sheet_sync(uuid)
  rename to rpc_rollback_vmp_sheet_sync__source_impl_20260828;
revoke all on function
  public.rpc_rollback_vmp_sheet_sync__source_impl_20260828(uuid)
  from public,anon,authenticated,service_role;

create function public.rpc_rollback_vmp_sheet_sync(p_sync_run_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
begin
  perform public.vmp_lock_source_plan_relations(null);
  return public.rpc_rollback_vmp_sheet_sync__source_impl_20260828(
    p_sync_run_id);
end
$function$;

revoke all on function public.rpc_rollback_vmp_sheet_sync(uuid)
  from public,anon,authenticated;
grant execute on function public.rpc_rollback_vmp_sheet_sync(uuid)
  to service_role;

-- Projection-aware final refresh. Its ACL remains owner-only until every
-- repair and migration postcondition below has passed.
create or replace function public.rpc_refresh_source_item_assignments()
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
declare
  v_source record;
  v_result jsonb;
  v_sources integer:=0;
  v_items integer:=0;
  v_plan_updated integer:=0;
  v_inserted integer:=0;
  v_reactivated integer:=0;
  v_revoked integer:=0;
  v_demoted integer:=0;
begin
  for v_source in
    select source_object.id
    from public.vmp_source_objects source_object
    where source_object.is_active is true
    order by source_object.object_code,source_object.id
  loop
    v_result:=public.vmp_reconcile_source_qa_projection(v_source.id);
    v_sources:=v_sources+1;
    v_items:=v_items+coalesce((v_result->>'items')::integer,0);
    v_plan_updated:=v_plan_updated+
      coalesce((v_result->>'plan_updated')::integer,0);
    v_inserted:=v_inserted+coalesce((v_result->>'inserted')::integer,0);
    v_reactivated:=v_reactivated+
      coalesce((v_result->>'reactivated')::integer,0);
    v_revoked:=v_revoked+coalesce((v_result->>'revoked')::integer,0);
    v_demoted:=v_demoted+coalesce((v_result->>'demoted')::integer,0);
  end loop;
  return jsonb_build_object(
    'ok',true,'sources',v_sources,'items',v_items,
    'plan_updated',v_plan_updated,'inserted',v_inserted,
    'reactivated',v_reactivated,'revoked',v_revoked,'demoted',v_demoted
  );
end
$function$;

revoke all on function public.rpc_refresh_source_item_assignments()
  from public,anon,authenticated,service_role;

create function public.rpc_list_source_workshop_coverage(
  p_search text,p_cursor jsonb,p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
declare
  v_rows jsonb;
  v_total bigint;
  v_next jsonb;
begin
  if not public.vmp_can_manage_source_workshop_scope(auth.uid()) then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Không có quyền quản lý phạm vi xưởng Source');
  end if;
  if p_limit is null or p_limit<1 or p_limit>50 then
    return jsonb_build_object('ok',false,'error_code','INVALID_LIMIT',
      'error','Giới hạn phải từ 1 đến 50');
  end if;
  if p_cursor is not null and (
       jsonb_typeof(p_cursor) is distinct from 'object'
       or nullif(p_cursor->>'normalized_full_name','') is null
       or coalesce(p_cursor->>'person_id','')!~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     ) then
    return jsonb_build_object('ok',false,'error_code','INVALID_CURSOR',
      'error','Con trỏ không hợp lệ');
  end if;

  with candidate as materialized (
    select performer.id person_id,performer.performer_name,
           performer.normalized_full_name,performer.email,
           performer.department,public.vmp_business_role(performer.user_id)
             role_name
    from public.vmp_performers performer
    join public.profiles profile on profile.id=performer.user_id
    where performer.is_active and performer.user_id is not null
      and profile.is_active
      and public.vmp_business_role(performer.user_id) in (
        'workshop_manager','workshop_staff'
      )
      and (coalesce(btrim(p_search),'')=''
           or performer.normalized_full_name like
                '%'||public.vmp_source_scope_key(p_search)||'%')
  ), paged as (
    select candidate.*,
           row_number() over (
             order by candidate.normalized_full_name,candidate.person_id
           ) page_ordinal
    from candidate
    where p_cursor is null or (
      candidate.normalized_full_name,candidate.person_id
    )>(p_cursor->>'normalized_full_name',(p_cursor->>'person_id')::uuid)
    order by candidate.normalized_full_name,candidate.person_id
    limit p_limit+1
  ), returned as (
    select paged.*,
      coalesce((select jsonb_agg(to_jsonb(grant_row)
                 order by grant_row.is_active desc,
                          grant_row.department_key,grant_row.area_key,
                          grant_row.line_key nulls first,grant_row.id)
                from public.vmp_source_workshop_scope_grants grant_row
                where grant_row.performer_id=paged.person_id),'[]'::jsonb)
        grants
    from paged
  )
  select coalesce(jsonb_agg(to_jsonb(returned)-'page_ordinal'
           order by normalized_full_name,person_id)
           filter(where page_ordinal<=p_limit),'[]'::jsonb),
         (select count(*) from candidate),
         case when count(*)>p_limit then (
           select jsonb_build_object(
             'normalized_full_name',cursor_row.normalized_full_name,
             'person_id',cursor_row.person_id)
           from returned cursor_row where cursor_row.page_ordinal=p_limit
         ) else null end
    into v_rows,v_total,v_next from returned;
  return jsonb_build_object('ok',true,'rows',v_rows,
    'authorized_total',v_total,'next_cursor',v_next);
end
$function$;

create function public.rpc_source_workshop_scope_choices(
  p_department text,p_area_code text,p_search text,
  p_cursor jsonb,p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
declare
  v_rows jsonb;
  v_next jsonb;
begin
  if not public.vmp_can_manage_source_workshop_scope(auth.uid()) then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Không có quyền quản lý phạm vi xưởng Source');
  end if;
  if p_limit is null or p_limit<1 or p_limit>50 then
    return jsonb_build_object('ok',false,'error_code','INVALID_LIMIT',
      'error','Giới hạn phải từ 1 đến 50');
  end if;
  if p_cursor is not null and (
       jsonb_typeof(p_cursor) is distinct from 'object'
       or jsonb_typeof(p_cursor->'department') is distinct from 'string'
       or nullif(btrim(p_cursor->>'department'),'') is null
       or jsonb_typeof(p_cursor->'area_code') is distinct from 'string'
       or nullif(btrim(p_cursor->>'area_code'),'') is null
       or not (p_cursor?'line')
       or jsonb_typeof(p_cursor->'line') not in ('null','string')
     ) then
    return jsonb_build_object('ok',false,'error_code','INVALID_CURSOR',
      'error','Con trỏ không hợp lệ');
  end if;

  with canonical as materialized (
    select btrim(source_object.department) department,
           btrim(source_object.area_code) area_code,
           nullif(btrim(source_object.line),'') line
    from public.vmp_source_objects source_object
    where source_object.is_active
      and nullif(btrim(source_object.department),'') is not null
      and nullif(btrim(source_object.area_code),'') is not null
      and (nullif(btrim(p_department),'') is null
           or public.vmp_source_scope_key(source_object.department)=
              public.vmp_source_scope_key(p_department))
      and (nullif(btrim(p_area_code),'') is null
           or public.vmp_source_scope_key(source_object.area_code)=
              public.vmp_source_scope_key(p_area_code))
      and (coalesce(btrim(p_search),'')=''
           or coalesce(nullif(btrim(source_object.line),''),'') ilike
              '%'||btrim(p_search)||'%')
  ), choice as materialized (
    select distinct canonical.department,canonical.area_code,canonical.line
    from canonical
  ), returned as (
    select choice.*,
           row_number() over (
             order by choice.department,choice.area_code,
                      choice.line nulls first
           ) page_ordinal
    from choice
    where p_cursor is null or (
      choice.department,choice.area_code,coalesce(choice.line,'')
    )>(btrim(p_cursor->>'department'),btrim(p_cursor->>'area_code'),
       coalesce(nullif(btrim(p_cursor->>'line'),''),''))
    order by choice.department,choice.area_code,choice.line nulls first
    limit p_limit+1
  )
  select coalesce(jsonb_agg(to_jsonb(returned)-'page_ordinal'
           order by department,area_code,line nulls first)
           filter(where page_ordinal<=p_limit),'[]'::jsonb),
         case when count(*)>p_limit then (
           select jsonb_build_object(
             'department',cursor_row.department,
             'area_code',cursor_row.area_code,'line',cursor_row.line)
           from returned cursor_row where cursor_row.page_ordinal=p_limit
         ) else null end
    into v_rows,v_next from returned;
  return jsonb_build_object('ok',true,'rows',v_rows,'next_cursor',v_next);
end
$function$;

create function public.rpc_set_source_workshop_scope_grant(
  p_grant_id uuid,p_performer_id uuid,p_department text,p_area_code text,
  p_line text,p_is_active boolean,p_reason text,p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
declare
  v_actor uuid:=auth.uid();
  v_role text:=public.vmp_business_role(auth.uid());
  v_existing public.vmp_source_workshop_scope_grants%rowtype;
  v_changed public.vmp_source_workshop_scope_grants%rowtype;
  v_performer public.vmp_performers%rowtype;
  v_department text:=nullif(btrim(p_department),'');
  v_area text:=nullif(btrim(p_area_code),'');
  v_line text:=nullif(btrim(p_line),'');
  v_old jsonb;
begin
  if not public.vmp_can_manage_source_workshop_scope(v_actor) then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Không có quyền quản lý phạm vi xưởng Source');
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    return jsonb_build_object('ok',false,'error_code','REASON_REQUIRED',
      'error','Thay đổi phạm vi xưởng phải nhập lý do');
  end if;
  if p_is_active is null then
    return jsonb_build_object('ok',false,'error_code','INVALID_ACTIVE_STATE',
      'error','Thiếu trạng thái phạm vi');
  end if;

  if p_grant_id is not null then
    select grant_row.* into v_existing
    from public.vmp_source_workshop_scope_grants grant_row
    where grant_row.id=p_grant_id;
    if not found then
      return jsonb_build_object('ok',false,'error_code','GRANT_NOT_FOUND',
        'error','Không tìm thấy phạm vi xưởng');
    end if;
    v_department:=coalesce(v_department,v_existing.department);
    v_area:=coalesce(v_area,v_existing.area_code);
    v_line:=case when p_line is null then null else v_line end;
  elsif not p_is_active then
    return jsonb_build_object('ok',false,'error_code','GRANT_NOT_FOUND',
      'error','Không thể thu hồi phạm vi chưa tồn tại');
  end if;

  if v_department is null or v_area is null then
    return jsonb_build_object('ok',false,'error_code','INVALID_SCOPE',
      'error','Phạm vi Source cần bộ phận và khu vực');
  end if;

  -- Lock every active Source row matching the requested tuple before the grant
  -- row. This preserves Source -> grant order for progress/revoke races.
  perform 1 from public.vmp_source_objects source_object
  where source_object.is_active
    and public.vmp_source_scope_key(source_object.department)=
        public.vmp_source_scope_key(v_department)
    and public.vmp_source_scope_key(source_object.area_code)=
        public.vmp_source_scope_key(v_area)
    and (v_line is null or public.vmp_source_scope_key(source_object.line)=
         public.vmp_source_scope_key(v_line))
  order by source_object.id for key share;
  if not found then
    return jsonb_build_object('ok',false,'error_code','SCOPE_NOT_FOUND',
      'error','Phạm vi không tồn tại trên Source hoạt động');
  end if;

  if p_grant_id is not null then
    select grant_row.* into strict v_existing
    from public.vmp_source_workshop_scope_grants grant_row
    where grant_row.id=p_grant_id for update;
    if p_expected_version is null
       or v_existing.version is distinct from p_expected_version then
      return jsonb_build_object('ok',false,'error_code','VERSION_CONFLICT',
        'error','Phạm vi đã được người khác sửa',
        'current_version',v_existing.version);
    end if;
  elsif p_expected_version is not null then
    return jsonb_build_object('ok',false,'error_code','VERSION_CONFLICT',
      'error','Tạo mới không nhận version cũ');
  end if;

  perform 1 from public.profiles profile
  where profile.id=(select performer.user_id
                    from public.vmp_performers performer
                    where performer.id=p_performer_id)
  for share;
  select performer.* into v_performer
  from public.vmp_performers performer
  join public.profiles profile on profile.id=performer.user_id
  where performer.id=p_performer_id and performer.is_active
    and performer.user_id is not null and profile.is_active
    and public.vmp_business_role(performer.user_id) in (
      'workshop_manager','workshop_staff'
    ) for share of performer;
  if not found or (select count(*) from public.vmp_performers performer
                   where performer.user_id=v_performer.user_id
                     and performer.is_active)<>1 then
    return jsonb_build_object('ok',false,
      'error_code','PERSON_NOT_ELIGIBLE',
      'error','Người xưởng không phải principal hoạt động duy nhất');
  end if;

  if p_grant_id is null then
    insert into public.vmp_source_workshop_scope_grants(
      performer_id,department,department_key,area_code,area_key,line,line_key,
      is_active,version,created_by,updated_by,change_reason
    ) values (
      p_performer_id,v_department,public.vmp_source_scope_key(v_department),
      v_area,public.vmp_source_scope_key(v_area),v_line,
      case when v_line is null then null
           else public.vmp_source_scope_key(v_line) end,
      true,1,v_actor,v_actor,btrim(p_reason)
    ) returning * into strict v_changed;
    insert into public.audit_logs(
      user_id,action,table_name,record_id,changed_fields,change_reason,
      old_data,new_data,source,effective_business_role
    ) values (
      v_actor,'INSERT'::public.audit_action,
      'vmp_source_workshop_scope_grants',v_changed.id::text,
      array['performer_id','department','area_code','line','is_active'],
      btrim(p_reason),null,to_jsonb(v_changed),'source_workshop_scope',v_role
    );
  else
    v_old:=to_jsonb(v_existing);
    update public.vmp_source_workshop_scope_grants grant_row
    set performer_id=p_performer_id,department=v_department,
        department_key=public.vmp_source_scope_key(v_department),
        area_code=v_area,area_key=public.vmp_source_scope_key(v_area),
        line=v_line,line_key=case when v_line is null then null
          else public.vmp_source_scope_key(v_line) end,
        is_active=p_is_active,version=grant_row.version+1,
        updated_at=transaction_timestamp(),updated_by=v_actor,
        change_reason=btrim(p_reason)
    where grant_row.id=p_grant_id
    returning * into strict v_changed;
    insert into public.audit_logs(
      user_id,action,table_name,record_id,changed_fields,change_reason,
      old_data,new_data,source,effective_business_role
    ) values (
      v_actor,'UPDATE'::public.audit_action,
      'vmp_source_workshop_scope_grants',v_changed.id::text,
      array['performer_id','department','area_code','line','is_active','version'],
      btrim(p_reason),v_old,to_jsonb(v_changed),'source_workshop_scope',v_role
    );
  end if;
  return jsonb_build_object('ok',true,'grant_id',v_changed.id,
    'version',v_changed.version,'is_active',v_changed.is_active);
exception
  when unique_violation then
    return jsonb_build_object('ok',false,'error_code','DUPLICATE_ACTIVE_SCOPE',
      'error','Phạm vi hoạt động đã tồn tại');
end
$function$;

revoke all on function public.rpc_list_source_workshop_coverage(
  text,jsonb,integer),
  public.rpc_source_workshop_scope_choices(
    text,text,text,jsonb,integer),
  public.rpc_set_source_workshop_scope_grant(
    uuid,uuid,text,text,text,boolean,text,integer)
  from public,anon;
grant execute on function public.rpc_list_source_workshop_coverage(
  text,jsonb,integer),
  public.rpc_source_workshop_scope_choices(
    text,text,text,jsonb,integer),
  public.rpc_set_source_workshop_scope_grant(
    uuid,uuid,text,text,text,boolean,text,integer)
  to authenticated,service_role;

-- Pending catalog changes are planned-timeline data only. Sanitize any legacy
-- pending payload and enforce the split for V1, V2, import, and service paths.
update public.vmp_catalog_changes
set old_data=coalesce(old_data,'{}'::jsonb)
      -'owner_person_id'-'support_person_id'-'owner_name'-'support_name',
    new_data=coalesce(new_data,'{}'::jsonb)
      -'owner_person_id'-'support_person_id'-'owner_name'-'support_name'
where old_data?|array[
        'owner_person_id','support_person_id','owner_name','support_name'
      ]
   or new_data?|array[
        'owner_person_id','support_person_id','owner_name','support_name'
      ];

create function public.vmp_strip_catalog_pending_access_fields()
returns trigger
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
begin
  new.old_data:=coalesce(new.old_data,'{}'::jsonb)
    -'owner_person_id'-'support_person_id'-'owner_name'-'support_name';
  new.new_data:=coalesce(new.new_data,'{}'::jsonb)
    -'owner_person_id'-'support_person_id'-'owner_name'-'support_name';
  return new;
end
$function$;

create trigger vmp_catalog_changes_timeline_only
before insert or update of old_data,new_data on public.vmp_catalog_changes
for each row execute function public.vmp_strip_catalog_pending_access_fields();

revoke all on function public.vmp_strip_catalog_pending_access_fields()
  from public,anon,authenticated,service_role;

-- The public writer owns the complete authorization lock sequence before it
-- delegates to the already reviewed field/version/audit implementation.
create or replace function public.rpc_update_progress(
  p_validation_code text,p_patch jsonb,p_reason text default null,
  p_sheet_patch jsonb default null,p_expected_version integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
declare
  v_actor uuid:=auth.uid();
  v_role text:=public.vmp_business_role(auth.uid());
  v_person_id uuid;
  v_source_id uuid;
  v_item_id text;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(v_actor) then
    return public.vmp_session_denial();
  end if;

  select source_object.id into v_source_id
  from public.vmp_plan_items item
  join public.vmp_objects master_object
    on master_object.code=item.object_code
  join public.vmp_source_objects source_object
    on source_object.object_code=master_object.code
   and source_object.is_active is true
  where item.validation_code=p_validation_code and item.is_active is true
  for key share of source_object;
  if not found then
    return jsonb_build_object('ok',false,'code','item_field_forbidden',
      'error','Hạng mục không có đúng một Source hoạt động',
      'forbidden_fields',coalesce((select jsonb_agg(key order by key)
        from jsonb_object_keys(coalesce(p_patch,'{}'::jsonb)) key),'[]'::jsonb),
      'allowed_fields','[]'::jsonb);
  end if;

  select performer.id into v_person_id
  from public.vmp_performers performer
  where performer.user_id=v_actor and performer.is_active;

  if v_role in ('workshop_manager','workshop_staff') then
    perform 1
    from public.vmp_source_workshop_scope_grants grant_row
    join public.vmp_source_objects source_object on source_object.id=v_source_id
    where grant_row.performer_id=v_person_id and grant_row.is_active
      and grant_row.valid_from<=transaction_timestamp()
      and (grant_row.expires_at is null
           or grant_row.expires_at>transaction_timestamp())
      and public.vmp_source_scope_key(source_object.department)=
          grant_row.department_key
      and public.vmp_source_scope_key(source_object.area_code)=grant_row.area_key
      and (grant_row.line_key is null or
           public.vmp_source_scope_key(source_object.line)=grant_row.line_key)
    order by grant_row.id for share of grant_row;
  end if;

  select item.id into v_item_id
  from public.vmp_plan_items item
  where item.validation_code=p_validation_code and item.is_active is true
  for update;
  if not found then
    return jsonb_build_object('ok',false,'code','item_field_forbidden',
      'error','Hạng mục không còn hoạt động',
      'forbidden_fields','[]'::jsonb,'allowed_fields','[]'::jsonb);
  end if;

  if v_role in ('workshop_manager','workshop_staff') then
    perform 1 from public.vmp_item_assignments assignment
    where assignment.validation_code=p_validation_code
      and assignment.performer_id=v_person_id
      and assignment.assignment_kind='equipment_department'
      and assignment.is_active
      and (assignment.expires_at is null
           or assignment.expires_at>transaction_timestamp())
    order by assignment.id for share;
  end if;

  return public.rpc_update_progress__assigned_impl_20260827(
    p_validation_code,p_patch,p_reason,p_sheet_patch,p_expected_version);
end
$function$;

revoke all on function public.rpc_update_progress(
  text,jsonb,text,jsonb,integer)
  from public,anon;
grant execute on function public.rpc_update_progress(
  text,jsonb,text,jsonb,integer)
  to authenticated,service_role;

-- Keep the executable Source-bearing definer audit closed over the complete
-- reviewed graph. A routine is allowed only for the documented boundary here;
-- new direct readers remain a migration/test failure.
create or replace function public.vmp_unfiltered_security_definer_item_readers()
returns table(signature text)
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  with allowed(signature,reason) as (
    values
      ('audit_plan_item_changes()','owner trigger audit; no browser result'),
      ('audit_plan_item_changes_v2()','owner trigger audit; no browser result'),
      ('ly_do_khong_sua_duoc(text,uuid)','legacy field-rights helper'),
      ('rpc_alert_context(text,integer)',
       'service alert reader through the rights-filtered visible-item helper'),
      ('vmp_item_rights(uuid,text)','target-item rights resolver'),
      ('rpc_my_editable_progress_rights()','rights-filtered browser result'),
      ('rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)',
       'owner-only implementation behind the current rights writer'),
      ('rpc_item_permission_preflight()','manager-only completeness check'),
      ('rpc_luat_xem()','manager-only policy metadata'),
      ('rpc_apply_assignments(boolean)','service assignment writer'),
      ('rpc_apply_sheet_sync(text,text,jsonb)','service sync writer'),
      ('rpc_create_plan_item(text,text,integer,integer,jsonb)',
       'manager writer with Source-first locks'),
      ('rpc_delete_plan_item(text,text)','manager soft-delete writer'),
      ('rpc_generate_timeline(integer,boolean)','manager timeline writer'),
      ('rpc_recalc_criticality(boolean)','manager criticality writer'),
      ('rpc_reconcile_orphan_objects(text[])','service repair writer'),
      ('rpc_refresh_computed_status()','service status writer'),
      ('rpc_refresh_source_item_assignments()','service projection repair'),
      ('rpc_register_alert(text,text,text,text,text,text,text)',
       'service alert writer'),
      ('rpc_resolve_missing(text,text,text)','manager missing-item writer'),
      ('rpc_rollback_vmp_sheet_sync(uuid)','service rollback writer'),
      ('rpc_set_item_assignment(uuid,text,text,text,text)',
       'legacy assignment writer'),
      ('rpc_set_item_performer(text,text)','legacy performer writer'),
      ('rpc_item_assignments(text,uuid)','manager assignment reader'),
      ('rpc_set_item_assignment(uuid,text,text,text,text,text,uuid)',
       'manager assignment writer'),
      ('rpc_set_item_performer_by_id(text,uuid,text)',
       'manager performer writer through its reviewed owner delegate'),
      ('rpc_upsert_source_object(text,text,jsonb)','service Source writer'),
      ('rpc_set_item_state(text,text,text)','manager state writer'),
      ('rpc_sync_vmp_sheet_snapshot(text,text,text,jsonb,jsonb)',
       'service snapshot writer'),
      ('rpc_sync_vmp_sheet_snapshot_with_extras(text,text,text,jsonb,jsonb)',
       'service extended snapshot writer'),
      ('rpc_update_progress(text,jsonb,text,jsonb,integer)',
       'rights-filtered browser writer'),
      ('rpc_active_rules()','manager-only catalog rules reader'),
      ('rpc_apply_catalog_change(uuid,text,integer)',
       'manager catalog writer with Source-first locks'),
      ('rpc_preview_catalog_change(uuid)','manager-only pending preview'),
      ('rpc_preview_item_rights(uuid,text)',
       'manager-only explicit item-rights preview'),
      ('rpc_apply_sheet_sync__source_impl_20260828(text,text,jsonb)',
       'owner-only renamed sync implementation'),
      ('rpc_rollback_vmp_sheet_sync__source_impl_20260828(uuid)',
       'owner-only renamed rollback implementation'),
      ('rpc_sync_vmp_sheet_snapshot__source_impl_20260828(text,text,text,jsonb,jsonb)',
       'owner-only renamed snapshot implementation'),
      ('vmp_exact_active_source_for_item(text)',
       'owner-only exact Source relation resolver'),
      ('vmp_guard_active_source_rekey()','owner trigger relation guard'),
      ('vmp_guard_plan_master_rekey()','owner trigger master relation guard'),
      ('vmp_reconcile_source_qa_projection(uuid)',
       'owner-only projection reconciler'),
      ('rpc_cleanup_orphan_source_assignment_resolutions(text)',
       'service assignment repair writer'),
      ('rpc_commit_catalog_import(uuid,text)',
       'manager import writer with Source-first locks'),
      ('rpc_delete_source_object(text,text,text)','service Source writer'),
      ('rpc_export_source_objects(text,text,jsonb,jsonb,integer)',
       'rights-filtered audited browser export'),
      ('rpc_link_item_permission_account(uuid,uuid,text,integer)',
       'manager account-link writer'),
      ('rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)',
       'rights-filtered browser Source reader'),
      ('rpc_resolve_source_item_assignment(uuid,uuid,text)',
       'service assignment resolution writer'),
      ('rpc_save_catalog_object(text,text,jsonb,text,integer)',
       'manager Source writer with atomic access projection'),
      ('rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)',
       'manager coverage writer with reason and version checks'),
      ('rpc_source_field_suggestions(text,text,text,jsonb,integer)',
       'manager-only bounded Source suggestions'),
      ('rpc_source_object_facets(text,jsonb)',
       'rights-filtered bounded Source facets'),
      ('rpc_source_workshop_scope_choices(text,text,text,jsonb,integer)',
       'manager-only coverage tuple reader'),
      ('rpc_stage_catalog_import(text,text,text,text,jsonb)',
       'manager-only import staging writer'),
      ('vmp_can_view_source_object(uuid,uuid)',
       'current-actor exact Source predicate with alternate-UID defense'),
      ('vmp_enforce_active_plan_source_relation()',
       'owner trigger enforcing exact active Source relation'),
      ('vmp_lock_source_plan_relations(text[])',
       'owner-only global Source-first lock helper'),
      ('vmp_set_item_assignment_unhardened(uuid,text,text,text,text)',
       'owner-only implementation behind reviewed assignment writers'),
      ('vmp_source_workshop_scope_match(uuid,uuid)',
       'private workshop Source predicate'),
      ('vmp_sync_item_assignments_from_performer()',
       'owner trigger synchronization writer'),
      ('vmp_upsert_source_object_before_person_id(text,text,jsonb)',
       'owner-only legacy Source writer implementation'),
      ('rpc_get_vmp_dashboard(integer,boolean,boolean)',
       'rights-filtered visible-Source dashboard'),
      ('rpc_get_vmp_watermark(integer)',
       'rights-filtered visible-Source cache watermark'),
      ('rpc_source_warnings(integer)',
       'rights-filtered visible-Source warnings'),
      ('vmp_visible_plan_items()',
       'rights-filtered current-actor item relation'),
      ('vmp_unfiltered_security_definer_item_readers()',
       'service-only executable inventory; self-reference is audited')
  ), candidates as (
    select case
      when procedure.proname like '%\_\_five\_role\_impl\_20260824' escape '\'
        then format('%s(%s)',left(procedure.proname,
          -length('__five_role_impl_20260824')),
          replace(pg_catalog.oidvectortypes(procedure.proargtypes),', ',','))
      else procedure.oid::regprocedure::text
    end signature
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='public' and procedure.prosecdef
      and (pg_get_functiondef(procedure.oid) ilike '%vmp_source_objects%'
        or pg_get_functiondef(procedure.oid) ilike '%vmp_plan_items%'
        or pg_get_functiondef(procedure.oid) ilike '%vmp_item_assignments%')
  )
  select candidate.signature
  from candidates candidate
  left join allowed on allowed.signature=candidate.signature
  where allowed.signature is null
  order by candidate.signature
$function$;
revoke all on function public.vmp_unfiltered_security_definer_item_readers()
  from public,anon,authenticated;
grant execute on function public.vmp_unfiltered_security_definer_item_readers()
  to service_role;

-- Freeze the legacy permission dependency before closing its client ACL. The
-- postgres-owned definers continue to resolve the same reviewed matrix through
-- owner bypass; no browser or maintenance role may read or mutate the map.
do $permission_dependency_precondition$
declare
  v_muc regprocedure:='public.muc_quyen(text,text)'::regprocedure;
  v_duoc regprocedure:='public.duoc_phep(text,text)'::regprocedure;
begin
  if encode(extensions.digest(convert_to(pg_get_functiondef(v_muc::oid),
       'UTF8'),'sha256'),'hex')<>
       'f85fe5073e6e6ba1cb4b7c4a03890c2b1338d10c544b0c9bb39c0a115c11ee70'
     or encode(extensions.digest(convert_to(pg_get_functiondef(v_duoc::oid),
       'UTF8'),'sha256'),'hex')<>
       '55ef8400cede7c7224dae7246791bc60244b9a4b92fd764aeb28e448b396eb91'
     or (select procedure.proacl::text from pg_proc procedure
         where procedure.oid=v_muc::oid)<>
        '{postgres=X/postgres,service_role=X/postgres}'
     or (select procedure.proacl::text from pg_proc procedure
         where procedure.oid=v_duoc::oid)<>
        '{postgres=X/postgres,service_role=X/postgres}'
     or public.muc_quyen('admin_users','admin')<>'co'
     or public.muc_quyen('admin_users','department_user')<>'khong'
     or not public.duoc_phep('admin_users','admin')
     or public.duoc_phep('admin_users','qa_manager') then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_PERMISSION_DEPENDENCY_PRECONDITION_DRIFT';
  end if;
end
$permission_dependency_precondition$;

alter table public.vmp_legacy_action_map enable row level security;
alter table public.vmp_legacy_action_map no force row level security;
do $drop_legacy_map_policies$
declare v_policy record;
begin
  for v_policy in select polname from pg_policy
    where polrelid='public.vmp_legacy_action_map'::regclass
  loop
    execute format('drop policy %I on public.vmp_legacy_action_map',
                   v_policy.polname);
  end loop;
end
$drop_legacy_map_policies$;
revoke all privileges on table public.vmp_legacy_action_map
  from public,anon,authenticated,service_role;
revoke select(hanh_dong_cu,screen_id,hanh_dong_moi,ghi_chu),
       insert(hanh_dong_cu,screen_id,hanh_dong_moi,ghi_chu),
       update(hanh_dong_cu,screen_id,hanh_dong_moi,ghi_chu),
       references(hanh_dong_cu,screen_id,hanh_dong_moi,ghi_chu)
  on public.vmp_legacy_action_map
  from public,anon,authenticated,service_role;
grant all privileges on table public.vmp_legacy_action_map to postgres;

-- Owner-security views must not bypass the exact base-table policies.
alter view public.vmp_ai_tu_dien set (security_invoker=true);
alter view public.vmp_status_current set (security_invoker=true);
alter view public.vmp_active_item_assignments set (security_invoker=true);
revoke all privileges on table public.vmp_ai_tu_dien,
  public.vmp_status_current,public.vmp_active_item_assignments
  from public,anon,authenticated,service_role;
do $revoke_protected_view_columns$
declare v_relation regclass;
declare v_columns text;
begin
  foreach v_relation in array array[
    'public.vmp_ai_tu_dien'::regclass,
    'public.vmp_status_current'::regclass,
    'public.vmp_active_item_assignments'::regclass
  ]
  loop
    select string_agg(quote_ident(attribute.attname),','
                      order by attribute.attnum)
      into v_columns
    from pg_attribute attribute
    where attribute.attrelid=v_relation and attribute.attnum>0
      and not attribute.attisdropped;
    execute format(
      'revoke all privileges (%s) on table %s from public,anon,authenticated,service_role',
      v_columns,v_relation);
  end loop;
end
$revoke_protected_view_columns$;
grant all privileges on table public.vmp_ai_tu_dien,
  public.vmp_status_current,public.vmp_active_item_assignments to postgres;

-- RLS evaluates as the browser role, so expose only parameterless current-
-- actor admission wrappers. The parameterized authorization predicates remain
-- private and cannot be probed with an alternate UID.
create function public.vmp_current_actor_can_manage_source_qa_assignment()
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select public.vmp_can_manage_source_qa_assignment(auth.uid())
$function$;
create function public.vmp_current_actor_can_manage_source_workshop_scope()
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select public.vmp_can_manage_source_workshop_scope(auth.uid())
$function$;
create function public.vmp_current_actor_is_active()
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select public.vmp_is_active_session(auth.uid())
$function$;
revoke all on function
  public.vmp_current_actor_can_manage_source_qa_assignment(),
  public.vmp_current_actor_can_manage_source_workshop_scope(),
  public.vmp_current_actor_is_active()
  from public,anon;
grant execute on function
  public.vmp_current_actor_can_manage_source_qa_assignment(),
  public.vmp_current_actor_can_manage_source_workshop_scope(),
  public.vmp_current_actor_is_active()
  to authenticated,service_role;

-- Replace, rather than layer onto, the historical session-wide policies.
do $drop_protected_policies$
declare v_relation regclass;
declare v_policy record;
begin
  foreach v_relation in array array[
    'public.vmp_source_objects'::regclass,
    'public.vmp_plan_items'::regclass,
    'public.vmp_source_workshop_scope_grants'::regclass,
    'public.vmp_item_assignments'::regclass,
    'public.vmp_products_gmp'::regclass,
    'public.vmp_alert_recipients'::regclass
  ]
  loop
    for v_policy in select polname from pg_policy where polrelid=v_relation
    loop
      execute format('drop policy %I on %s',v_policy.polname,v_relation);
    end loop;
  end loop;
end
$drop_protected_policies$;

alter table public.vmp_source_objects enable row level security;
alter table public.vmp_source_objects no force row level security;
create policy source_objects_authorized_select
on public.vmp_source_objects for select to authenticated
using (public.vmp_can_view_source_object(auth.uid(),id));

alter table public.vmp_plan_items enable row level security;
alter table public.vmp_plan_items no force row level security;
create policy plan_items_authorized_select
on public.vmp_plan_items for select to authenticated
using (public.vmp_can_view_plan_item(auth.uid(),validation_code));

alter table public.vmp_source_workshop_scope_grants enable row level security;
alter table public.vmp_source_workshop_scope_grants no force row level security;
create policy source_workshop_scope_grants_manager_or_self_select
on public.vmp_source_workshop_scope_grants for select to authenticated
using (
  public.vmp_current_actor_can_manage_source_workshop_scope()
  or (public.vmp_current_actor_is_active() and exists (
    select 1 from public.vmp_performers performer
    where performer.id=vmp_source_workshop_scope_grants.performer_id
      and performer.user_id=auth.uid() and performer.is_active
  ))
);

alter table public.vmp_item_assignments enable row level security;
alter table public.vmp_item_assignments no force row level security;
create policy item_assignments_manager_or_self_select
on public.vmp_item_assignments for select to authenticated
using (
  public.vmp_current_actor_can_manage_source_qa_assignment()
  or (public.vmp_current_actor_is_active() and exists (
    select 1 from public.vmp_performers performer
    where performer.id=vmp_item_assignments.performer_id
      and performer.user_id=auth.uid() and performer.is_active
  ))
);

alter table public.vmp_products_gmp enable row level security;
alter table public.vmp_products_gmp no force row level security;
create policy products_gmp_manager_select
on public.vmp_products_gmp for select to authenticated
using (public.vmp_current_actor_can_manage_source_qa_assignment());

alter table public.vmp_alert_recipients enable row level security;
alter table public.vmp_alert_recipients no force row level security;
create policy alert_recipients_manager_select
on public.vmp_alert_recipients for select to authenticated
using (public.vmp_current_actor_can_manage_source_qa_assignment());

grant select on public.vmp_source_objects,public.vmp_plan_items,
  public.vmp_source_workshop_scope_grants,public.vmp_item_assignments,
  public.vmp_products_gmp,public.vmp_alert_recipients
  to authenticated;

revoke insert,update,delete on public.vmp_source_objects,
  public.vmp_plan_items,public.vmp_item_assignments,
  public.vmp_source_workshop_scope_grants,public.vmp_products_gmp,
  public.vmp_alert_recipients,public.profiles,public.vmp_performers
  from authenticated;

-- Failure point one proves every definition above and the refresh replacement
-- roll back to the exact expand stub before any projection repair is reached.
do $failure_before_repair$
begin
  if current_setting('vmp.source_access_enforce_failpoint',true)=
       'before_repair' then
    raise exception using errcode='check_violation',
      message='SACCESS_ENFORCE_FAILURE_BEFORE_REPAIR_ROLLS_BACK';
  end if;
end
$failure_before_repair$;

do $repair$
declare
  v_result jsonb;
  v_second jsonb;
  v_pre text:=current_setting(
    'vmp.source_access_enforce_projection_before',true);
  v_post text;
  v_fixture_owner integer;
  v_fixture_support integer;
  v_fixture_manual_revoked integer;
  v_fixture_primary_demoted integer;
  v_is_fixture boolean;
begin
  v_result:=public.rpc_refresh_source_item_assignments();

  select exists (
    select 1 from public.system_config
    where key='five_role_test_fixture' and value='true'::jsonb
  ) into v_is_fixture;

  select count(*) into v_fixture_owner
  from public.vmp_item_assignments assignment
  join public.vmp_performers performer on performer.id=assignment.performer_id
  where assignment.validation_code='SACCESS-PRE-EXPAND/2026.01-PQ'
    and performer.user_id='9a040000-0000-4000-8000-000000000001'::uuid
    and assignment.assignment_kind='qa' and assignment.source='source_owner'
    and assignment.assignment_role='primary' and assignment.is_active;
  select count(*) into v_fixture_support
  from public.vmp_item_assignments assignment
  join public.vmp_performers performer on performer.id=assignment.performer_id
  where assignment.validation_code='SACCESS-PRE-EXPAND/2026.01-PQ'
    and performer.user_id='9a040000-0000-4000-8000-000000000002'::uuid
    and assignment.assignment_kind='qa' and assignment.source='source_support'
    and assignment.assignment_role='collaborator' and assignment.is_active;
  select count(*) into v_fixture_manual_revoked
  from public.vmp_item_assignments assignment
  join public.vmp_performers performer on performer.id=assignment.performer_id
  where assignment.validation_code='SACCESS-PRE-EXPAND/2026.01-PQ'
    and performer.user_id='9a040000-0000-4000-8000-000000000002'::uuid
    and assignment.source='qa_manager' and not assignment.is_active;
  select count(*) into v_fixture_primary_demoted
  from public.vmp_item_assignments assignment
  join public.vmp_performers performer on performer.id=assignment.performer_id
  where assignment.validation_code='SACCESS-PRE-EXPAND/2026.01-PQ'
    and performer.user_id='9a040000-0000-4000-8000-000000000003'::uuid
    and assignment.source='qa_manager'
    and assignment.assignment_role='collaborator' and assignment.is_active;

  if v_is_fixture and (
       v_fixture_owner<>1 or v_fixture_support<>1
       or v_fixture_manual_revoked<>1 or v_fixture_primary_demoted<>1
     ) then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_ENFORCE_REPAIR_FIXTURE_POSTCONDITION';
  end if;

  with source_projection as (
    select count(*) row_count,
           encode(extensions.digest(convert_to(coalesce(string_agg(
             to_jsonb(source_object)::text,E'\n' order by source_object.id::text
           ),''),'UTF8'),'sha256'),'hex') row_digest
    from public.vmp_source_objects source_object
  ), plan_projection as (
    select count(*) row_count,
           encode(extensions.digest(convert_to(coalesce(string_agg(
             to_jsonb(item)::text,E'\n' order by item.id::text
           ),''),'UTF8'),'sha256'),'hex') row_digest
    from public.vmp_plan_items item
  ), assignment_projection as (
    select count(*) row_count,
           encode(extensions.digest(convert_to(coalesce(string_agg(
             to_jsonb(assignment)::text,E'\n' order by assignment.id::text
           ),''),'UTF8'),'sha256'),'hex') row_digest
    from public.vmp_item_assignments assignment
  )
  select concat_ws('|',source_projection.row_count,
         source_projection.row_digest,plan_projection.row_count,
         plan_projection.row_digest,assignment_projection.row_count,
         assignment_projection.row_digest)
    into v_post
  from source_projection cross join plan_projection
       cross join assignment_projection;

  raise notice
    'SACCESS_ENFORCE_REPAIR_REACHED sources=% items=% inserted=% revoked=% demoted=%',
    v_result->>'sources',v_result->>'items',v_result->>'inserted',
    v_result->>'revoked',v_result->>'demoted';
  raise notice
    'SACCESS_ENFORCE_REPAIR_MUTATION_CONFIRMED pre=% post=% fixture=SACCESS-PRE-EXPAND/2026.01-PQ canonical_owner=% canonical_support=% manual_revoked=% primary_demoted=%',
    v_pre,v_post,v_fixture_owner,v_fixture_support,
    v_fixture_manual_revoked,v_fixture_primary_demoted;

  if v_is_fixture and v_post is not distinct from v_pre then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_ENFORCE_REPAIR_EXPECTED_NONZERO_MUTATION';
  end if;

  -- The second complete stable-order pass must perform no projection write.
  v_second:=public.rpc_refresh_source_item_assignments();
  if coalesce((v_second->>'plan_updated')::integer,-1)<>0
     or coalesce((v_second->>'inserted')::integer,-1)<>0
     or coalesce((v_second->>'reactivated')::integer,-1)<>0
     or coalesce((v_second->>'revoked')::integer,-1)<>0
     or coalesce((v_second->>'demoted')::integer,-1)<>0 then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_ENFORCE_REPAIR_NOT_IDEMPOTENT result='||
              v_second::text;
  end if;
end
$repair$;

-- Failure point two proves even a completed, non-vacuous repair rolls back to
-- the exact expand projections, stub definition, and owner-only stub ACL.
do $failure_after_repair$
begin
  if current_setting('vmp.source_access_enforce_failpoint',true)=
       'after_repair_before_commit' then
    raise exception using errcode='check_violation',
      message='SACCESS_ENFORCE_FAILURE_AFTER_REPAIR_ROLLS_BACK';
  end if;
end
$failure_after_repair$;

do $postcondition_before_refresh_acl$
begin
  if exists (
       select 1
       from public.vmp_plan_items item
       join public.vmp_objects master_object
         on master_object.code=item.object_code
       join public.vmp_source_objects source_object
         on source_object.object_code=master_object.code
        and source_object.is_active is true
       where item.is_active is true
         and (item.owner_person_id is distinct from source_object.owner_person_id
              or item.support_person_id is distinct from
                 source_object.support_person_id)
     )
     or exists (
       select 1
       from public.vmp_plan_items item
       where item.is_active is true
         and ((select count(*) from public.vmp_objects master_object
               where master_object.code=item.object_code)<>1
              or (select count(*)
                  from public.vmp_source_objects source_object
                  where source_object.object_code=item.object_code
                    and source_object.is_active is true)<>1)
     )
     or exists (
       select 1
       from public.vmp_plan_items item
       join public.vmp_objects master_object
         on master_object.code=item.object_code
       join public.vmp_source_objects source_object
         on source_object.object_code=master_object.code
        and source_object.is_active is true
       where item.is_active and source_object.owner_person_id is not null
         and exists (
           select 1
           from public.vmp_performers performer
           join public.profiles profile on profile.id=performer.user_id
           where performer.id=source_object.owner_person_id
             and performer.is_active is true
             and performer.user_id is not null
             and profile.is_active is true
             and public.vmp_business_role(performer.user_id) in
                 ('qa_staff','qa_manager')
             and (select count(*) from public.vmp_performers active_performer
                  where active_performer.user_id=performer.user_id
                    and active_performer.is_active is true)=1
         )
         and (select count(*) from public.vmp_item_assignments assignment
              where assignment.validation_code=item.validation_code
                and assignment.performer_id=source_object.owner_person_id
                and assignment.assignment_kind='qa'
                and assignment.assignment_role='primary'
                and assignment.source='source_owner'
                and assignment.is_active)<>1
     )
     or exists (
       select 1
       from public.vmp_plan_items item
       join public.vmp_objects master_object
         on master_object.code=item.object_code
       join public.vmp_source_objects source_object
         on source_object.object_code=master_object.code
        and source_object.is_active is true
       where item.is_active and source_object.support_person_id is not null
         and source_object.support_person_id is distinct from
             source_object.owner_person_id
         and exists (
           select 1
           from public.vmp_performers performer
           join public.profiles profile on profile.id=performer.user_id
           where performer.id=source_object.support_person_id
             and performer.is_active is true
             and performer.user_id is not null
             and profile.is_active is true
             and public.vmp_business_role(performer.user_id) in
                 ('qa_staff','qa_manager')
             and (select count(*) from public.vmp_performers active_performer
                  where active_performer.user_id=performer.user_id
                    and active_performer.is_active is true)=1
         )
         and (select count(*) from public.vmp_item_assignments assignment
              where assignment.validation_code=item.validation_code
                and assignment.performer_id=source_object.support_person_id
                and assignment.assignment_kind='qa'
                and assignment.assignment_role='collaborator'
                and assignment.source='source_support'
                and assignment.is_active)<>1
     )
     or exists (
       select 1
       from public.vmp_plan_items item
       join public.vmp_objects master_object
         on master_object.code=item.object_code
       join public.vmp_source_objects source_object
         on source_object.object_code=master_object.code
        and source_object.is_active is true
       where item.is_active
         and source_object.owner_person_id is not null
         and not exists (
           select 1
           from public.vmp_performers performer
           join public.profiles profile on profile.id=performer.user_id
           where performer.id=source_object.owner_person_id
             and performer.is_active is true
             and performer.user_id is not null
             and profile.is_active is true
             and public.vmp_business_role(performer.user_id) in
                 ('qa_staff','qa_manager')
             and (select count(*) from public.vmp_performers active_performer
                  where active_performer.user_id=performer.user_id
                    and active_performer.is_active is true)=1
         )
         and exists (
           select 1
           from public.vmp_item_assignments assignment
           where assignment.validation_code=item.validation_code
             and assignment.assignment_kind='qa'
             and assignment.source='source_owner'
             and assignment.is_active
         )
     )
     or exists (
       select 1
       from public.vmp_plan_items item
       join public.vmp_objects master_object
         on master_object.code=item.object_code
       join public.vmp_source_objects source_object
         on source_object.object_code=master_object.code
        and source_object.is_active is true
       where item.is_active
         and source_object.support_person_id is not null
         and not exists (
           select 1
           from public.vmp_performers performer
           join public.profiles profile on profile.id=performer.user_id
           where performer.id=source_object.support_person_id
             and performer.is_active is true
             and performer.user_id is not null
             and profile.is_active is true
             and public.vmp_business_role(performer.user_id) in
                 ('qa_staff','qa_manager')
             and (select count(*) from public.vmp_performers active_performer
                  where active_performer.user_id=performer.user_id
                    and active_performer.is_active is true)=1
         )
         and exists (
           select 1
           from public.vmp_item_assignments assignment
           where assignment.validation_code=item.validation_code
             and assignment.assignment_kind='qa'
             and assignment.source='source_support'
             and assignment.is_active
         )
     )
     or exists (
       select 1 from public.vmp_catalog_changes change
       where change.old_data?|array[
               'owner_person_id','support_person_id','owner_name','support_name'
             ]
          or change.new_data?|array[
               'owner_person_id','support_person_id','owner_name','support_name'
             ]
     ) then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_ENFORCE_POSTCONDITION_PROJECTION_OR_PENDING_DRIFT';
  end if;

  if (select pg_get_indexdef(indexrelid) from pg_index
      where indexrelid=
        'public.vmp_item_assignments_one_active_qa_primary'::regclass)
       is distinct from
       'CREATE UNIQUE INDEX vmp_item_assignments_one_active_qa_primary ON public.vmp_item_assignments USING btree (validation_code) WHERE ((assignment_kind = ''qa''::text) AND (assignment_role = ''primary''::text) AND is_active)'
     or (select pg_get_indexdef(indexrelid) from pg_index
         where indexrelid=
           'public.vmp_item_assignments_one_active_qa_person'::regclass)
       is distinct from
       'CREATE UNIQUE INDEX vmp_item_assignments_one_active_qa_person ON public.vmp_item_assignments USING btree (validation_code, performer_id, assignment_kind) WHERE ((performer_id IS NOT NULL) AND (assignment_kind = ''qa''::text) AND is_active)'
     or exists (
       select 1 from pg_index index_row where index_row.indexrelid in (
         'public.vmp_item_assignments_one_active_qa_primary'::regclass,
         'public.vmp_item_assignments_one_active_qa_person'::regclass
       ) and (not index_row.indisunique or not index_row.indisvalid
              or not index_row.indisready)
     ) then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_ENFORCE_POSTCONDITION_QA_UNIQUE_INDEXES';
  end if;

  if public.vmp_catalog_timeline_fields() is distinct from array[
       'frequency_months','first_month','report_class','workdays',
       'validate_flag','is_active'
     ]::text[]
     or not exists (
       select 1 from public.vmp_screen_permissions permission
       where permission.screen_id='source' and permission.business_role='admin'
         and permission.actions@>array[
           'manage_qa_assignment','manage_workshop_scope'
         ]::text[]
     )
     or not exists (
       select 1 from public.vmp_screen_permissions permission
       where permission.screen_id='source'
         and permission.business_role='qa_manager'
         and permission.actions@>array[
           'manage_qa_assignment','manage_workshop_scope'
         ]::text[]
     )
     or pg_get_functiondef(
          'public.vmp_exact_active_source_for_item(text)'::regprocedure)
          !~ '\mvmp_objects\M'
     or not has_function_privilege(
          'authenticated','public.vmp_can_view_source_object(uuid,uuid)',
          'EXECUTE')
     or not has_function_privilege(
          'authenticated','public.vmp_can_view_plan_item(uuid,text)',
          'EXECUTE')
     or has_function_privilege(
          'anon','public.vmp_can_view_source_object(uuid,uuid)','EXECUTE') then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_ENFORCE_POSTCONDITION_CAPABILITY_TIMELINE';
  end if;

  -- Service execute must still be absent at the last non-ACL checkpoint.
  if has_function_privilege(
       'service_role','public.rpc_refresh_source_item_assignments()','EXECUTE')
     or has_function_privilege(
       'authenticated','public.rpc_refresh_source_item_assignments()','EXECUTE') then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_ENFORCE_POSTCONDITION_REFRESH_EARLY_GRANT';
  end if;
end
$postcondition_before_refresh_acl$;

grant execute on function public.rpc_refresh_source_item_assignments()
  to service_role;

do $final_acl$
declare
  v_refresh regprocedure:=
    'public.rpc_refresh_source_item_assignments()'::regprocedure;
begin
  if not exists (
       select 1 from pg_proc procedure
       join pg_roles owner on owner.oid=procedure.proowner
       join pg_language language on language.oid=procedure.prolang
       where procedure.oid=v_refresh::oid and owner.rolname='postgres'
         and language.lanname='plpgsql' and procedure.prosecdef
         and procedure.provolatile='v' and procedure.proparallel='u'
         and not procedure.proisstrict and not procedure.proleakproof
         and procedure.proconfig=array['search_path=public, pg_temp']::text[]
         and procedure.proacl::text=
             '{postgres=X/postgres,service_role=X/postgres}'
     )
     or has_function_privilege('authenticated',v_refresh,'EXECUTE')
     or has_function_privilege('anon',v_refresh,'EXECUTE')
     or has_function_privilege('public',v_refresh,'EXECUTE') then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_ENFORCE_FINAL_REFRESH_ACL_METADATA';
  end if;
end
$final_acl$;

commit;

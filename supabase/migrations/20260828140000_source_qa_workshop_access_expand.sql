-- Source QA/workshop access: additive relation, grant, revision, projection,
-- and performance contracts. This migration deliberately does not reconcile
-- existing projections. The legacy refresh path is fenced until enforce.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '180s';

-- Expand and enforce use the same release lock. Separate linked-CLI sessions
-- must still be serialized by the operator; the refresh stub is the durable
-- protection between those sessions.
select pg_advisory_xact_lock(
  pg_catalog.hashtextextended('vmp.source_qa_workshop_access.release', 0)
);

-- Keep the read-only catalog and data preflight stable until all additive DDL
-- and the fail-closed fence have committed. Acquire one table per statement so
-- the order is observable: profile -> performer -> Source -> assignment at its
-- final DDL mode -> object -> item -> audit. Source writers reach Source before
-- plan/assignment; progress reaches assignment before updating plan; performer
-- synchronization reaches performer before assignment. Each is therefore
-- fenced before expand holds the later relation it needs, with no lock upgrade.
lock table public.profiles in share row exclusive mode;
lock table public.vmp_performers in share row exclusive mode;
lock table public.vmp_source_objects in share row exclusive mode;
lock table public.vmp_item_assignments in access exclusive mode;
lock table public.vmp_objects in share row exclusive mode;
lock table public.vmp_plan_items in share row exclusive mode;
lock table public.vmp_screen_permissions in share row exclusive mode;
lock table public.system_config in share row exclusive mode;
lock table public.audit_logs in share row exclusive mode;

do $precondition$
declare
  v_expected record;
  v_relation regclass;
  v_count bigint;
  v_hash text;
  v_projection text;
  v_unresolved_performers bigint;
  v_projection_missing bigint;
  v_projection_conflicts bigint;
  v_ineligible_current_relations bigint;
  v_missing_relations bigint;
  v_canonical_missing bigint;
  v_canonical_multiple bigint;
  v_master_mapping_issues bigint;
  v_duplicate_source_codes bigint;
  v_projection_mismatch bigint;
  v_is_fixture boolean;
begin
  if current_setting('server_version_num')::integer not between 170000 and 179999
     or (select pg_encoding_to_char(encoding) from pg_database
         where datname = current_database()) is distinct from 'UTF8'
     or (select datcollate from pg_database
         where datname = current_database()) is distinct from 'en_US.UTF-8'
     or (select datctype from pg_database
         where datname = current_database()) is distinct from 'en_US.UTF-8'
     or (select pg_get_userbyid(datdba) from pg_database
         where datname = current_database()) is distinct from 'postgres'
     or current_user is distinct from 'postgres' then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_DATABASE_CONTRACT';
  end if;

  select exists (
    select 1 from public.system_config
    where key = 'five_role_test_fixture' and value = 'true'::jsonb
  ) into v_is_fixture;

  -- Pin every dependency table as a complete catalog object before mutation.
  -- The hashes are over ordered, stable pg_catalog strings on PostgreSQL 17.
  for v_expected in
    select * from (values
      ('profiles', 12,
       'fb30416a68491178d95fc331c7bf82098d4918f17e4476e3759626decd4700f2',
       4, '0b1fc409280af194205037d7bf9fd401ae195739f35b86155925af1cc700ccb1',
       4, '4f41dcd5275fc0891bffe458ec37a82246d5f3d01259288e872611db3d731335',
       3, '0b2077c29f0956d7051af01ef0260ed01c2cb195967c0a7a69261a87351ed0a6',
       2, '0123a4d257e88d0538a31f673d0d972febf74650e33ef1a5803c6db1f6250b8c',
       'ebe40005564f63ea0c8ed2541d5fc9a27b432ff5e398e9c52c50e1214bc4f663'),
      ('vmp_performers', 21,
       '8d41fb2dc6841505d66028ede818f1571340c015a1e24648703824fa300b3af4',
       4, 'b2f0667d7f597e649aa082ec3287911a4dd0a0a5174348228268c0a0c213798a',
       5, 'd92624b5a0f512c906977fc92b917ca2da39f4dd15cc58d3a5f82e1fc530a5f6',
       2, '65e34038b1a3f800b0e6189039dc2d88b2d8b7da914e1989d5fbc55fa1cc6c9e',
       1, 'ca5cc9290bb9a25c047000ee96bc5665fca2c5a0fa1cc9877d1071417a256cc8',
       'ebe40005564f63ea0c8ed2541d5fc9a27b432ff5e398e9c52c50e1214bc4f663'),
      ('vmp_source_objects', 38,
       'a49c2b7ff86b23e484a26284433352cd51435af9de33ee08c1c8b9267b95409b',
       10, '300a690e8e1c0ad22c6cd3eac6d552325e34aa8806a9f42efde278a1e39ddbe7',
       9, 'fe9a9d4ec8f839c12d4cbd340d8117ebd424ce202ab5b464a3240baa4432ccf7',
       1, '4d09163256fdec4d8900d30c201d84ca1af686e1705f68a255379809f1e2f067',
       1, 'c6c440c34ca2bb15520f433e77b93674175cb2fc9e2aaa27bb0d769c9ed72f98',
       'ebe40005564f63ea0c8ed2541d5fc9a27b432ff5e398e9c52c50e1214bc4f663'),
      ('vmp_plan_items', 59,
       '25e8bc9d04ffb115e23504beb2a0a91d72e581214b4e61ef4a2d41a015d7c56e',
       11, '997145e4ffcbc907a33493df165f28f3176331f966d64077a657e3b905c90dfa',
       16, '99d8449e7e7ce5904472df3a6c4e3e4e9abf970c193fd32317a33fae5dd57445',
       7, '14e7b88e576245a88f56ccd948227dfd98f6218f15cbddd7c75d7b8e6584b297',
       1, '500f16313d59fe97c960d310144a11cbe12bcdf863a57d9df97d63a178c40b83',
       'ebe40005564f63ea0c8ed2541d5fc9a27b432ff5e398e9c52c50e1214bc4f663'),
      ('vmp_item_assignments', 19,
       '875435ac7d8587b02c38bc97133ae5568b9cc42bfa1dccad7625609f45762687',
       10, 'f4c89cfbd3e695b9eac72d73dc6fe4658a733d1c12cc1a0776a4b145b6464374',
       6, '11454e9eb86f98c5f48c0c62d7a052eec4102b228db4640c2c231baa9b46fc3c',
       1, '489ac5122ffd7d89ba873930f84cb8e0e6e52a1f2222bfacab50c89c0d5fb2e5',
       1, '7a503feb11f7f260af8ac2a0dcef3b388737ae65c86933c0af65003eed0b4cdd',
       'e4ba7bdd2d90d0608c9205c1863659d6d0965eca7f5d30590531c57613371c39'),
      ('vmp_screen_permissions', 7,
       'ace5852a7263894e7c0c1d7af3635e593b0a305b86fdff650d792e5b0557c9d4',
       6, '449860a8295b225343ebd65e8f777b9f99280f36f549f82106e4a5e5efbf9fd7',
       1, '0414e6f30365b8ed5a11c3cc2e35c79970c80614194beb89339e87cd1eefec19',
       0, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
       0, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
       '2e6f04cb2503453dcb2a7aef3d558bb28bd41e74051ae0404dc9e806f13dcbfd'),
      ('audit_logs', 18,
       'c2488c36c9041d75e8fb090a7bce4a76741b3c3af4c9a86a60e917c341d45158',
       3, '5fc816f1d17a1591c5386c59cae64333062a0559e95667c2b2de5288643679cf',
       7, '190b36b3fedbc7c48b1e186c70241929336bcf069dae517a660926e152260bfe',
       0, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
       2, 'ee71af2c4e98f5c96c36596a8fb72acdd60c35b2a467f51b92e60c527f8be8ab',
       '2e6f04cb2503453dcb2a7aef3d558bb28bd41e74051ae0404dc9e806f13dcbfd')
    ) expected(
      relation_name, column_count, column_hash,
      constraint_count, constraint_hash,
      index_count, index_hash,
      trigger_count, trigger_hash,
      policy_count, policy_hash,
      relation_hash
    )
  loop
    v_relation := to_regclass('public.' || v_expected.relation_name);
    if v_relation is null then
      raise exception using errcode = 'check_violation',
        message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_MISSING_TABLE ' ||
                  v_expected.relation_name;
    end if;

    select count(attribute.*),
           encode(extensions.digest(convert_to(coalesce(string_agg(concat_ws('|',
             attribute.attnum, attribute.attname,
             format_type(attribute.atttypid, attribute.atttypmod),
             attribute.attnotnull,
             coalesce(pg_get_expr(default_value.adbin, default_value.adrelid), ''),
             attribute.attidentity, attribute.attgenerated,
             coalesce(collation_namespace.nspname, ''),
             coalesce(column_collation.collname, ''),
             coalesce(column_collation.collprovider::text, ''),
             coalesce(column_collation.collisdeterministic::text, '')),
             E'\n' order by attribute.attnum), ''), 'UTF8'), 'sha256'), 'hex')
      into v_count, v_hash
    from pg_attribute attribute
    left join pg_attrdef default_value
      on default_value.adrelid = attribute.attrelid
     and default_value.adnum = attribute.attnum
    left join pg_collation column_collation
      on column_collation.oid = attribute.attcollation
    left join pg_namespace collation_namespace
      on collation_namespace.oid = column_collation.collnamespace
    where attribute.attrelid = v_relation
      and attribute.attnum > 0 and not attribute.attisdropped;
    if v_count <> v_expected.column_count or v_hash <> v_expected.column_hash then
      raise exception using errcode = 'check_violation',
        message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_COLUMN_DRIFT ' ||
                  v_expected.relation_name;
    end if;

    select count(constraint_row.*),
           encode(extensions.digest(convert_to(coalesce(string_agg(format(
             '%s|%s|%s', constraint_row.conname, constraint_row.contype,
             pg_get_constraintdef(constraint_row.oid)), E'\n'
             order by constraint_row.conname), ''), 'UTF8'), 'sha256'), 'hex')
      into v_count, v_hash
    from pg_constraint constraint_row
    where constraint_row.conrelid = v_relation;
    if v_expected.relation_name = 'audit_logs' and v_is_fixture then
      if v_count <> 3 or v_hash <>
           '962219063d18ca9459155e690dd9644fc6b26a1a75bb23368e43adcc74839525' then
        raise exception using errcode = 'check_violation',
          message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_CONSTRAINT_DRIFT ' ||
                    v_expected.relation_name || ' count=' || v_count ||
                    ' actual=' || v_hash || ' expected=fixture_pg17';
      end if;
    elsif v_count <> v_expected.constraint_count
          or v_hash <> v_expected.constraint_hash then
      raise exception using errcode = 'check_violation',
        message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_CONSTRAINT_DRIFT ' ||
                  v_expected.relation_name;
    end if;

    select count(index_row.*),
           encode(extensions.digest(convert_to(coalesce(string_agg(format(
             '%s|%s|%s|%s|%s|%s', index_class.relname,
             index_row.indisunique, index_row.indisvalid, index_row.indisready,
             index_row.indimmediate, pg_get_indexdef(index_row.indexrelid)), E'\n'
             order by index_class.relname), ''), 'UTF8'), 'sha256'), 'hex')
      into v_count, v_hash
    from pg_index index_row
    join pg_class index_class on index_class.oid = index_row.indexrelid
    where index_row.indrelid = v_relation;
    if v_count <> v_expected.index_count or v_hash <> v_expected.index_hash then
      raise exception using errcode = 'check_violation',
        message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_INDEX_DRIFT ' ||
                  v_expected.relation_name;
    end if;

    select count(trigger_row.*),
           encode(extensions.digest(convert_to(coalesce(string_agg(format(
             '%s|%s|%s|%s', trigger_row.tgname, trigger_row.tgenabled,
             trigger_row.tgfoid::regprocedure,
             pg_get_triggerdef(trigger_row.oid)), E'\n'
             order by trigger_row.tgname), ''), 'UTF8'), 'sha256'), 'hex')
      into v_count, v_hash
    from pg_trigger trigger_row
    where trigger_row.tgrelid = v_relation and not trigger_row.tgisinternal;
    -- The disposable five-role fixture is reconstructed by replaying the
    -- repository's deadline migrations and therefore has the reviewed
    -- whole-row revision trigger in addition to the sealed audit inventory.
    -- Keep that exception fixture-bound and exact; production accepts only
    -- the single frozen catalog contract above.
    if v_expected.relation_name = 'vmp_plan_items' and v_is_fixture then
      if v_count <> 9 or v_hash <>
           '0289cb83a680a78b4c5a9eabee77b0ef7b455d404d8268cab93018158db63209' then
        raise exception using errcode = 'check_violation',
          message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_TRIGGER_DRIFT ' ||
                    v_expected.relation_name || ' count=' || v_count ||
                    ' actual=' || v_hash ||
                    ' expected=fixture_pg17';
      end if;
    elsif v_expected.relation_name = 'vmp_item_assignments' and v_is_fixture then
      if v_count <> 2 or v_hash <>
           '904cf755231a0dbb158d5e0019c9383f3cf2ce5c53a976ab8fc4c190fffc99e1' then
        raise exception using errcode = 'check_violation',
          message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_TRIGGER_DRIFT ' ||
                    v_expected.relation_name || ' count=' || v_count ||
                    ' actual=' || v_hash ||
                    ' expected=fixture_pg17';
      end if;
    elsif v_count <> v_expected.trigger_count
          or v_hash <> v_expected.trigger_hash then
      raise exception using errcode = 'check_violation',
        message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_TRIGGER_DRIFT ' ||
                  v_expected.relation_name || ' actual=' || v_hash ||
                  ' expected=' || v_expected.trigger_hash;
    end if;

    select count(policy_row.*),
           encode(extensions.digest(convert_to(coalesce(string_agg(format(
             '%s|%s|%s|%s|%s|%s', policy_row.polname, policy_row.polcmd,
             policy_row.polpermissive, array_to_string(policy_row.polroles, ','),
             coalesce(pg_get_expr(policy_row.polqual, policy_row.polrelid), ''),
             coalesce(pg_get_expr(policy_row.polwithcheck, policy_row.polrelid),
                      '')), E'\n' order by policy_row.polname), ''),
             'UTF8'), 'sha256'), 'hex')
      into v_count, v_hash
    from pg_policy policy_row
    where policy_row.polrelid = v_relation;
    if v_count <> v_expected.policy_count
       or v_hash <> v_expected.policy_hash then
      raise exception using errcode = 'check_violation',
        message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_POLICY_DRIFT ' ||
                  v_expected.relation_name;
    end if;

    select encode(extensions.digest(convert_to(concat_ws('|', owner.rolname,
             relation.relrowsecurity, relation.relforcerowsecurity,
             coalesce(array_to_string(relation.relacl, ','), '')),
             'UTF8'), 'sha256'), 'hex')
      into v_hash
    from pg_class relation
    join pg_roles owner on owner.oid = relation.relowner
    where relation.oid = v_relation;
    if v_hash <> v_expected.relation_hash
       or exists (
         select 1 from pg_attribute attribute
         where attribute.attrelid = v_relation and attribute.attnum > 0
           and not attribute.attisdropped and attribute.attacl is not null
       ) then
      raise exception using errcode = 'check_violation',
        message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_ACL_RLS_DRIFT ' ||
                  v_expected.relation_name;
    end if;
  end loop;

  -- Pin the exact functions called, replaced, or invoked by plan triggers that
  -- the deferred reconciler intentionally fires.
  for v_expected in
    select * from (values
      ('vmp_business_role(uuid)',
       '45b2dfab1f9463b234a3754e8ee022450749f8418d6fc4a966b09fe8d52c3156'),
      ('vmp_business_role_unresolved_reason(uuid)',
       '14303db8f3412d90ef9202fe94f667edbfaab287f62be4cc73e3d4a3693d0b5f'),
      ('vmp_is_active_session(uuid)',
       'e52a0cece430ad8b8319819b633fd4fc8aa92bc2d2fac083a33b22f609e1f417'),
      ('vmp_manager_principal(uuid)',
       'dd06b754ecb397066aaa81047d82dcf4dc46a64c3da5b05f616f1a779090734c'),
      ('vmp_normalize_person_name(text)',
       '40cefe6ab8fbfc8cf8c8f7362f66675a1a93242743fc959655a30865d9895251'),
      ('rpc_refresh_source_item_assignments()',
       'a4bd208fc467a14b9d0383d6af486f59a66f52d8b68d4bc614b92627a73524e7'),
      ('vmp_sync_item_assignments_from_performer()',
       'e96fd45baffa1c09a5587047da1d02ad3e887ffe7841e0a298b8a785fe7067a2'),
      ('rpc_save_catalog_object(text,text,jsonb,text,integer)',
       'e7c6ac003f467a357d778b8b773bd58754c8ffb4c54483d1a8734426119daa95'),
      ('rpc_save_catalog_object__five_role_impl_20260824(text,text,jsonb,text,integer)',
       '601c067cf9789772b1eb272c10754b980f50fa13647f7967eba2e893634cffbc'),
      ('rpc_upsert_source_object(text,text,jsonb)',
       '80d318f744322cf4ce3ddd6a44e1c32536a60e7082f01f56069e255002816e36'),
      ('rpc_set_item_assignment(uuid,text,text,text,text,text,uuid)',
       '13aaa8c4dc71cf9bdfaf2da6bb690d8751b73457e3256d0b81f51285ef02828b'),
      ('rpc_set_item_assignment__five_role_impl_20260824(uuid,text,text,text,text,text,uuid)',
       '689e52011fba0eaf98642b2584e3ce634334f163c3e7ba97390a24f01153446d'),
      ('vmp_item_rights(uuid,text)',
       'f82b266343a54d695e16df2e9a67867d39ddc50bd11233639266eae7ca1553aa'),
      ('vmp_item_scope_matches(uuid,text)',
       'f22cb1a41ea7148401e32ffd9a1d7f8b4001be5ab738bf2380ab041f4e8e1296'),
      ('rpc_update_progress(text,jsonb,text,jsonb,integer)',
       'da25f8acbcc5aa3e029e581acb79f210cf1d6c61ab0e8458e4ff89146e75f4a0'),
      ('trigger_set_updated_at()',
       '39096e1eff369abf0af690df9fa1a3d1d59b5f279587bc4b908d844baf252e71'),
      ('audit_plan_item_changes_v2()',
       '07ac27f98feecfb5c9bd6941e17943fb910ea715e72ffdcb5c96132acdf26243'),
      ('enforce_plan_item_validation()',
       '3e9aaf189916f0a77c7d2c81545312fc5f020b2779c450e63587bedfee9ed6ec'),
      ('vmp_cache_nn_vo_hieu()',
       '8c675923c6200bfb7e05a21a561aca945cdf9ba9ffd4520dbb9856daeb1843d0'),
      ('vmp_init_status_text()',
       '893f1763b52a2035cc48bd72906f6c8f71298f86bde72345872f696e87f83abc'),
      ('vmp_sync_status_text()',
       'e5320e761eced3b538b11286a60ff4c20a37663d9521244b3fda1c8831820350'),
      ('compute_doc_flags()',
       '32f7ffe5f61e02c13e8cf9e2f0cb22da45ac036b49f3d0753b225acb8c5cca18')
    ) expected(signature, definition_hash)
  loop
    v_hash := case
      when to_regprocedure('public.' || v_expected.signature) is null then null
      else encode(extensions.digest(convert_to(pg_get_functiondef(
             to_regprocedure('public.' || v_expected.signature)::oid), 'UTF8'),
             'sha256'), 'hex')
    end;
    if to_regprocedure('public.' || v_expected.signature) is null
       or (select count(*) from pg_proc procedure
           join pg_namespace namespace on namespace.oid = procedure.pronamespace
           where namespace.nspname = 'public'
             and procedure.proname = split_part(v_expected.signature, '(', 1)) <> 1
       or v_hash <> (case
         when not v_is_fixture then v_expected.definition_hash
         when v_expected.signature = 'vmp_manager_principal(uuid)' then
           'f1d5c93ff47de4563100f1ce9a54ada9d7b6d0ee908a9914f14327f2fa7af849'
         when v_expected.signature =
              'rpc_save_catalog_object(text,text,jsonb,text,integer)' then
           '81fbd19e43d3859cd28cb958fc311f1f8b693f659aca9371155433a0b70a1d29'
         when v_expected.signature = 'vmp_item_rights(uuid,text)' then
           '9cfba864d7ea650370d6d76c33e2afcfbf941bb6918a90eeedec77f0513ab0db'
         when v_expected.signature =
              'rpc_update_progress(text,jsonb,text,jsonb,integer)' then
           '7e36d2360211c68d203e1fc47f8b9ab5794e6a2a88b21c2fea24cefcac6b5f8e'
         when v_expected.signature = 'audit_plan_item_changes_v2()' then
           '4f69863a23c5353fda09332a04f7643c58b8d9e0ceb126b52790e4b61162ba4c'
         else v_expected.definition_hash
       end) then
      raise exception using errcode = 'check_violation',
        message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_FUNCTION_DRIFT ' ||
                  v_expected.signature || ' actual=' || coalesce(v_hash, 'missing');
    end if;
  end loop;

  with required(signature) as (values
    ('vmp_business_role(uuid)'),
    ('vmp_business_role_unresolved_reason(uuid)'),
    ('vmp_is_active_session(uuid)'),
    ('vmp_manager_principal(uuid)'),
    ('vmp_normalize_person_name(text)'),
    ('rpc_refresh_source_item_assignments()'),
    ('vmp_sync_item_assignments_from_performer()'),
    ('rpc_save_catalog_object(text,text,jsonb,text,integer)'),
    ('rpc_save_catalog_object__five_role_impl_20260824(text,text,jsonb,text,integer)'),
    ('rpc_upsert_source_object(text,text,jsonb)'),
    ('rpc_set_item_assignment(uuid,text,text,text,text,text,uuid)'),
    ('rpc_set_item_assignment__five_role_impl_20260824(uuid,text,text,text,text,text,uuid)'),
    ('vmp_item_rights(uuid,text)'),
    ('vmp_item_scope_matches(uuid,text)'),
    ('rpc_update_progress(text,jsonb,text,jsonb,integer)'),
    ('trigger_set_updated_at()'),
    ('audit_plan_item_changes_v2()'),
    ('enforce_plan_item_validation()'),
    ('vmp_cache_nn_vo_hieu()'),
    ('vmp_init_status_text()'),
    ('vmp_sync_status_text()'),
    ('compute_doc_flags()')
  )
  select encode(extensions.digest(convert_to(string_agg(concat_ws('|',
           required.signature, owner.rolname, language.lanname,
           procedure.prosecdef, procedure.provolatile,
           procedure.proparallel, procedure.proisstrict,
           procedure.proleakproof,
           coalesce(array_to_string(procedure.proconfig, ','), ''),
           coalesce(array_to_string(procedure.proacl, ','), ''),
           pg_get_function_result(procedure.oid)), E'\n'
           order by required.signature), 'UTF8'), 'sha256'), 'hex')
    into v_hash
  from required
  join pg_proc procedure
    on procedure.oid = to_regprocedure('public.' || required.signature)
  join pg_roles owner on owner.oid = procedure.proowner
  join pg_language language on language.oid = procedure.prolang;
  if v_hash <>
       '70873ecf632964a25c5b63d12e463a5e51e88d6b62120a5f42700e6520247c77' then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_FUNCTION_METADATA_INVENTORY actual=' ||
                coalesce(v_hash, 'null');
  end if;

  if exists (
    select 1 from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    join pg_roles owner on owner.oid = procedure.proowner
    where namespace.nspname = 'public'
      and procedure.proname in (
        'vmp_business_role', 'vmp_business_role_unresolved_reason',
        'vmp_is_active_session', 'vmp_manager_principal',
        'vmp_normalize_person_name', 'rpc_refresh_source_item_assignments',
        'vmp_sync_item_assignments_from_performer', 'rpc_save_catalog_object',
        'rpc_save_catalog_object__five_role_impl_20260824',
        'rpc_upsert_source_object', 'rpc_set_item_assignment',
        'rpc_set_item_assignment__five_role_impl_20260824',
        'vmp_item_rights', 'vmp_item_scope_matches', 'rpc_update_progress',
        'trigger_set_updated_at', 'audit_plan_item_changes_v2',
        'enforce_plan_item_validation', 'vmp_cache_nn_vo_hieu',
        'vmp_init_status_text', 'vmp_sync_status_text', 'compute_doc_flags'
      )
      and owner.rolname <> 'postgres'
  )
     or (select procedure.proacl::text from pg_proc procedure
         where procedure.oid =
           'public.rpc_refresh_source_item_assignments()'::regprocedure)
        is distinct from '{postgres=X/postgres,service_role=X/postgres}'
     or not exists (
       select 1 from pg_proc procedure
       join pg_language language on language.oid = procedure.prolang
       where procedure.oid =
               'public.rpc_refresh_source_item_assignments()'::regprocedure
         and language.lanname = 'plpgsql' and procedure.prosecdef
         and procedure.provolatile = 'v' and procedure.proparallel = 'u'
         and not procedure.proisstrict and not procedure.proleakproof
         and procedure.proconfig = array['search_path=public, pg_temp']::text[]
         and pg_get_function_result(procedure.oid) = 'jsonb'
     ) then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_FUNCTION_METADATA_ACL';
  end if;

  select count(*),
         encode(extensions.digest(convert_to(string_agg(enum_value.enumlabel,
           E'\n' order by enum_value.enumsortorder), 'UTF8'), 'sha256'), 'hex')
    into v_count, v_hash
  from pg_type type_row
  join pg_namespace namespace on namespace.oid = type_row.typnamespace
  join pg_roles owner on owner.oid = type_row.typowner
  join pg_enum enum_value on enum_value.enumtypid = type_row.oid
  where namespace.nspname = 'public' and type_row.typname = 'audit_action'
    and type_row.typtype = 'e' and owner.rolname = 'postgres'
    and type_row.typacl is null;
  if v_count <> 11 or v_hash <>
       '886781b4fef915131397512cff316c7b8239b883ae674747fcb50584e97b0854' then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_AUDIT_ACTION_DRIFT count=' ||
                v_count || ' actual=' || coalesce(v_hash, 'null');
  end if;

  if to_regclass('public.vmp_source_workshop_scope_grants') is not null
     or to_regclass('public.vmp_authorization_revision') is not null
     or exists (
       select 1 from pg_proc procedure
       join pg_namespace namespace on namespace.oid = procedure.pronamespace
       where namespace.nspname = 'public' and procedure.proname in (
         'vmp_source_scope_key', 'vmp_exact_active_source_for_item',
         'vmp_reconcile_source_qa_projection',
         'vmp_touch_authorization_revision'
       )
     )
     or exists (
       select 1 from pg_class relation
       join pg_namespace namespace on namespace.oid = relation.relnamespace
       where namespace.nspname = 'public' and relation.relname in (
         'uq_vmp_source_objects_active_object_code',
         'idx_vmp_plan_items_object_year_active',
         'idx_vmp_source_objects_list',
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
         'idx_profiles_active_role_department'
       )
     ) then
    raise exception using errcode = 'duplicate_object',
      message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_PARTIAL_INSTALL';
  end if;

  select encode(extensions.digest(convert_to(string_agg(format(
           '%s|%s|%s|%s|%s', business_role, screen_id, can_view, data_scope,
           array_to_string(actions, ',')), E'\n' order by business_role, screen_id),
           'UTF8'), 'sha256'), 'hex')
    into v_hash
  from public.vmp_screen_permissions;

  if (select count(*) from public.vmp_screen_permissions) <> 85
     or (select count(distinct business_role)
         from public.vmp_screen_permissions) <> 5
     or exists (
       select 1 from public.vmp_screen_permissions
       where business_role not in (
         'admin', 'qa_manager', 'qa_staff',
         'workshop_manager', 'workshop_staff'
       )
     )
     or v_hash <> (case when v_is_fixture then
          '7d129948d001e7587adea78028a726f9dafa730b749b05d4912b9526aae4d686'
        else
          '6c8fb41b9ed3336bc91cdd3fa965474b39e0ad18a22f91d24eba071328938e85'
        end)
     or (select value from public.system_config
         where key = 'screen_access_mode') is distinct from '"enforced"'::jsonb
     or (select value from public.system_config
         where key = 'item_permissions_mode') is distinct from '"preview"'::jsonb
     or not exists (
       select 1 from public.profiles profile
       where profile.is_active is true
         and public.vmp_business_role(profile.id) = 'admin'
     )
     or exists (
       select 1 from public.profiles profile
       where profile.is_active is true
         and (profile.role::text = 'viewer'
              or public.vmp_business_role(profile.id) = 'viewer')
     ) then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_ROLE_MODE_ADMIN matrix=' ||
                coalesce(v_hash, 'null');
  end if;

  if (select pg_get_constraintdef(oid) from pg_constraint
      where conrelid = 'public.vmp_item_assignments'::regclass
        and conname = 'vmp_item_assignments_source_check') is distinct from
       'CHECK ((source = ANY (ARRAY[''sheet_qa''::text, ''sheet_other_staff''::text, ''qa_manager''::text, ''equipment_manager''::text])))'
     or exists (
       select 1 from public.vmp_item_assignments
       where source not in (
         'sheet_qa', 'sheet_other_staff', 'qa_manager', 'equipment_manager'
       )
     )
     or (select pg_get_indexdef(indexrelid) from pg_index
         where indexrelid =
           'public.vmp_item_assignments_linked_uniq'::regclass) is distinct from
       'CREATE UNIQUE INDEX vmp_item_assignments_linked_uniq ON public.vmp_item_assignments USING btree (validation_code, performer_id, assignment_kind, source) WHERE (performer_id IS NOT NULL)'
     or (select pg_get_indexdef(indexrelid) from pg_index
         where indexrelid =
           'public.vmp_item_assignments_one_active_qa_person'::regclass)
        is distinct from
       'CREATE UNIQUE INDEX vmp_item_assignments_one_active_qa_person ON public.vmp_item_assignments USING btree (validation_code, performer_id, assignment_kind) WHERE ((performer_id IS NOT NULL) AND (assignment_kind = ''qa''::text) AND is_active)'
     or (select pg_get_indexdef(indexrelid) from pg_index
         where indexrelid =
           'public.vmp_item_assignments_one_active_qa_primary'::regclass)
        is distinct from
       'CREATE UNIQUE INDEX vmp_item_assignments_one_active_qa_primary ON public.vmp_item_assignments USING btree (validation_code) WHERE ((assignment_kind = ''qa''::text) AND (assignment_role = ''primary''::text) AND is_active)'
     or exists (
       select 1 from pg_index index_row
       where index_row.indexrelid in (
         'public.vmp_item_assignments_linked_uniq'::regclass,
         'public.vmp_item_assignments_one_active_qa_person'::regclass,
         'public.vmp_item_assignments_one_active_qa_primary'::regclass
       ) and (not index_row.indisunique or not index_row.indisvalid
              or not index_row.indisready)
     ) then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_ASSIGNMENT_INVARIANTS';
  end if;

  select count(*) into v_canonical_missing
  from public.vmp_plan_items item
  where item.is_active is true and not exists (
    select 1 from public.vmp_source_objects source_object
    where source_object.object_code = item.object_code
      and source_object.is_active is true
  );

  select count(*) into v_canonical_multiple
  from public.vmp_plan_items item
  where item.is_active is true and (
    select count(*) from public.vmp_source_objects source_object
    where source_object.object_code = item.object_code
      and source_object.is_active is true
    ) > 1;

  select count(*) into v_master_mapping_issues
  from public.vmp_plan_items item
  where item.is_active is true
    and (select count(*) from public.vmp_objects master_object
         where master_object.code = item.object_code) <> 1;

  select count(*) into v_duplicate_source_codes
  from (
    select source_object.object_code
    from public.vmp_source_objects source_object
    where source_object.is_active is true
    group by source_object.object_code having count(*) > 1
  ) duplicate_group;

  select count(*) into v_projection_mismatch
  from public.vmp_plan_items item
  join public.vmp_source_objects source_object
    on source_object.object_code = item.object_code
   and source_object.is_active is true
  where item.is_active is true
    and (item.owner_person_id is distinct from source_object.owner_person_id
         or item.support_person_id is distinct from
            source_object.support_person_id);

  if v_canonical_missing > 0 then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_CANONICAL_MISSING count=' ||
                v_canonical_missing;
  elsif v_canonical_multiple > 0 then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_CANONICAL_MULTIPLE count=' ||
                v_canonical_multiple;
  elsif v_master_mapping_issues > 0 then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_MASTER_MAPPING count=' ||
                v_master_mapping_issues;
  elsif v_duplicate_source_codes > 0 then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_DUPLICATE_SOURCE_CODE count=' ||
                v_duplicate_source_codes;
  elsif v_projection_mismatch > 0 then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_PROJECTION_MISMATCH count=' ||
                v_projection_mismatch;
  end if;

  select count(*) into v_ineligible_current_relations
  from public.vmp_source_objects source_object
  cross join lateral unnest(array[
    source_object.owner_person_id, source_object.support_person_id
  ]) relation_person(person_id)
  where source_object.is_active is true
    and relation_person.person_id is not null
    and exists (
      select 1 from public.vmp_performers performer
      where performer.id = relation_person.person_id
    )
    and not exists (
      select 1
      from public.vmp_performers performer
      join public.profiles profile on profile.id = performer.user_id
      where performer.id = relation_person.person_id
        and performer.is_active is true and performer.user_id is not null
        and profile.is_active is true
        and public.vmp_business_role(performer.user_id) in (
          'qa_staff', 'qa_manager'
        )
    );

  select count(*) into v_missing_relations
  from public.vmp_source_objects source_object
  cross join lateral unnest(array[
    source_object.owner_person_id, source_object.support_person_id
  ]) relation_person(person_id)
  where source_object.is_active is true
    and relation_person.person_id is not null
    and not exists (
      select 1 from public.vmp_performers performer
      where performer.id = relation_person.person_id
    );

  if v_missing_relations > 0
     or exists (
       select performer.user_id
       from public.vmp_performers performer
       where performer.is_active is true and performer.user_id is not null
       group by performer.user_id having count(*) > 1
     ) then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_EXPAND_PRECONDITION_QA_PRINCIPAL';
  end if;

  -- Projection gaps are expected and are repair inventory, never authority.
  select count(*) into v_unresolved_performers
  from public.vmp_performers performer
  where performer.is_active is true and performer.user_id is null;

  select count(*) into v_projection_missing
  from public.vmp_plan_items item
  join public.vmp_source_objects source_object
    on source_object.object_code = item.object_code
   and source_object.is_active is true
   and source_object.owner_person_id is not distinct from item.owner_person_id
   and source_object.support_person_id is not distinct from item.support_person_id
  cross join lateral unnest(array[
    source_object.owner_person_id, source_object.support_person_id
  ]) relation_person(person_id)
  where item.is_active is true and relation_person.person_id is not null
    and exists (
      select 1
      from public.vmp_performers performer
      join public.profiles profile on profile.id = performer.user_id
      where performer.id = relation_person.person_id
        and performer.is_active is true and performer.user_id is not null
        and profile.is_active is true
        and public.vmp_business_role(performer.user_id) in ('qa_staff', 'qa_manager')
    )
    and not exists (
      select 1 from public.vmp_item_assignments assignment
      where assignment.validation_code = item.validation_code
        and assignment.performer_id = relation_person.person_id
        and assignment.assignment_kind = 'qa' and assignment.is_active
    );

  select count(*) into v_projection_conflicts
  from public.vmp_plan_items item
  join public.vmp_source_objects source_object
    on source_object.object_code = item.object_code
    and source_object.is_active is true
   and source_object.owner_person_id is not distinct from item.owner_person_id
   and source_object.support_person_id is not distinct from item.support_person_id
  join public.vmp_item_assignments assignment
    on assignment.validation_code = item.validation_code
   and assignment.assignment_kind = 'qa' and assignment.is_active
   and assignment.assignment_role = 'primary'
  where item.is_active is true and source_object.owner_person_id is not null
    and exists (
      select 1
      from public.vmp_performers performer
      join public.profiles profile on profile.id = performer.user_id
      where performer.id = source_object.owner_person_id
        and performer.is_active is true and performer.user_id is not null
        and profile.is_active is true
        and public.vmp_business_role(performer.user_id) in ('qa_staff', 'qa_manager')
    )
    and assignment.performer_id is distinct from source_object.owner_person_id;

  raise notice
    'SOURCE_ACCESS_EXPAND_INVENTORY unresolved_active_performers=% projection_missing=% primary_conflicts=% ineligible_current_relations=%',
    v_unresolved_performers, v_projection_missing, v_projection_conflicts,
    v_ineligible_current_relations;

  with source_projection as (
    select count(*) row_count,
           encode(extensions.digest(convert_to(coalesce(string_agg(
             to_jsonb(source_object)::text, E'\n' order by source_object.id::text
           ), ''), 'UTF8'), 'sha256'), 'hex') row_digest
    from public.vmp_source_objects source_object
  ), plan_projection as (
    select count(*) row_count,
           encode(extensions.digest(convert_to(coalesce(string_agg(
             to_jsonb(plan_item)::text, E'\n' order by plan_item.id::text
           ), ''), 'UTF8'), 'sha256'), 'hex') row_digest
    from public.vmp_plan_items plan_item
  ), assignment_projection as (
    select count(*) row_count,
           encode(extensions.digest(convert_to(coalesce(string_agg(
             to_jsonb(assignment)::text, E'\n' order by assignment.id::text
           ), ''), 'UTF8'), 'sha256'), 'hex') row_digest
    from public.vmp_item_assignments assignment
  )
  select concat_ws('|', source_projection.row_count,
         source_projection.row_digest, plan_projection.row_count,
         plan_projection.row_digest, assignment_projection.row_count,
         assignment_projection.row_digest)
    into v_projection
  from source_projection cross join plan_projection cross join assignment_projection;

  perform set_config(
    'vmp.source_access_expand_projection_before', v_projection, true
  );
end
$precondition$;

create function public.vmp_source_scope_key(p_value text)
returns text
language sql
immutable
strict
parallel safe
security invoker
set search_path = pg_catalog
as $function$
  select pg_catalog.lower(
    pg_catalog.btrim(
      pg_catalog.regexp_replace(p_value, '[[:space:]]+', ' ', 'g')
    )
  )
$function$;

revoke all on function public.vmp_source_scope_key(text)
  from public, anon, authenticated, service_role;

create unique index uq_vmp_source_objects_active_object_code
  on public.vmp_source_objects (object_code)
  where is_active is true;

create index idx_vmp_plan_items_object_year_active
  on public.vmp_plan_items (object_code, year, is_active, validation_code);

create index idx_vmp_source_objects_list
  on public.vmp_source_objects (object_kind, is_active, object_code, id);

create index idx_vmp_source_objects_active_owner
  on public.vmp_source_objects (owner_person_id, id)
  where is_active is true and owner_person_id is not null;

create index idx_vmp_source_objects_active_support
  on public.vmp_source_objects (support_person_id, id)
  where is_active is true and support_person_id is not null;

create index idx_vmp_source_objects_active_scope_area
  on public.vmp_source_objects (
    public.vmp_source_scope_key(department),
    public.vmp_source_scope_key(area_code), id
  )
  where is_active is true
    and nullif(public.vmp_source_scope_key(department), '') is not null
    and nullif(public.vmp_source_scope_key(area_code), '') is not null;

create index idx_vmp_source_objects_active_scope_line
  on public.vmp_source_objects (
    public.vmp_source_scope_key(department),
    public.vmp_source_scope_key(area_code),
    public.vmp_source_scope_key(line), id
  )
  where is_active is true
    and nullif(public.vmp_source_scope_key(department), '') is not null
    and nullif(public.vmp_source_scope_key(area_code), '') is not null
    and nullif(public.vmp_source_scope_key(line), '') is not null;

create function public.vmp_exact_active_source_for_item(p_validation_code text)
returns setof public.vmp_source_objects
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with matches as materialized (
    select source_object.*
    from public.vmp_plan_items item
    join public.vmp_source_objects source_object
      on source_object.object_code = item.object_code
     and source_object.is_active is true
    where item.validation_code = p_validation_code
      and item.is_active is true
  ), exact as (
    select count(*) match_count from matches
  )
  select matches.* from matches cross join exact
  where exact.match_count = 1
$function$;

revoke all on function public.vmp_exact_active_source_for_item(text)
  from public, anon, authenticated, service_role;

create table public.vmp_source_workshop_scope_grants (
  id uuid primary key default gen_random_uuid(),
  performer_id uuid not null
    references public.vmp_performers(id),
  department text not null,
  department_key text not null,
  area_code text not null,
  area_key text not null,
  line text,
  line_key text,
  valid_from timestamptz not null default transaction_timestamp(),
  expires_at timestamptz,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default transaction_timestamp(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default transaction_timestamp(),
  updated_by uuid references auth.users(id) on delete set null,
  change_reason text not null,
  constraint vmp_source_workshop_grants_department_nonblank
    check (nullif(btrim(department), '') is not null),
  constraint vmp_source_workshop_grants_department_key
    check (nullif(department_key, '') is not null
           and department_key = public.vmp_source_scope_key(department)),
  constraint vmp_source_workshop_grants_area_nonblank
    check (nullif(btrim(area_code), '') is not null),
  constraint vmp_source_workshop_grants_area_key
    check (nullif(area_key, '') is not null
           and area_key = public.vmp_source_scope_key(area_code)),
  constraint vmp_source_workshop_grants_line_pair
    check ((line is null and line_key is null) or
           (line is not null and line_key is not null
            and nullif(btrim(line), '') is not null
            and nullif(line_key, '') is not null
            and line_key = public.vmp_source_scope_key(line))),
  constraint vmp_source_workshop_grants_expiry
    check (expires_at is null or expires_at > valid_from),
  constraint vmp_source_workshop_grants_version
    check (version > 0),
  constraint vmp_source_workshop_grants_reason
    check (nullif(btrim(change_reason), '') is not null)
);

alter table public.vmp_source_workshop_scope_grants enable row level security;
revoke all on table public.vmp_source_workshop_scope_grants
  from public, anon, authenticated, service_role;

create unique index uq_vmp_source_workshop_grants_active_area
  on public.vmp_source_workshop_scope_grants (
    performer_id, department_key, area_key
  )
  where is_active and line_key is null;

create unique index uq_vmp_source_workshop_grants_active_line
  on public.vmp_source_workshop_scope_grants (
    performer_id, department_key, area_key, line_key
  )
  where is_active and line_key is not null;

create unique index uq_vmp_source_workshop_grants_id_version
  on public.vmp_source_workshop_scope_grants (id, version);

create index idx_vmp_source_workshop_grants_person
  on public.vmp_source_workshop_scope_grants (
    performer_id, is_active, expires_at, id
  );

create index idx_vmp_source_workshop_grants_area
  on public.vmp_source_workshop_scope_grants (
    department_key, area_key, performer_id
  )
  where is_active and line_key is null;

create index idx_vmp_source_workshop_grants_line
  on public.vmp_source_workshop_scope_grants (
    department_key, area_key, line_key, performer_id
  )
  where is_active and line_key is not null;

alter table public.vmp_item_assignments
  drop constraint vmp_item_assignments_source_check;
alter table public.vmp_item_assignments
  add constraint vmp_item_assignments_source_check
  check (source = any (array[
    'sheet_qa'::text, 'sheet_other_staff'::text, 'qa_manager'::text,
    'equipment_manager'::text, 'source_owner'::text, 'source_support'::text
  ]));

create index idx_vmp_item_assignments_active_performer_validation_kind
  on public.vmp_item_assignments (
    performer_id, validation_code, assignment_kind
  )
  where is_active;

create index idx_vmp_item_assignments_active_validation_performer_kind
  on public.vmp_item_assignments (
    validation_code, performer_id, assignment_kind
  )
  where is_active;

create index idx_vmp_performers_active_candidate
  on public.vmp_performers (access_class, normalized_full_name, id)
  where is_active and user_id is not null;

create index idx_profiles_active_role_department
  on public.profiles (role, department, id)
  where is_active is true;

create table public.vmp_authorization_revision (
  singleton boolean primary key default true,
  revision bigint not null default 1,
  updated_at timestamptz not null default transaction_timestamp(),
  constraint vmp_authorization_revision_singleton check (singleton),
  constraint vmp_authorization_revision_positive check (revision > 0)
);

insert into public.vmp_authorization_revision(singleton) values (true);
alter table public.vmp_authorization_revision enable row level security;
revoke all on table public.vmp_authorization_revision
  from public, anon, authenticated, service_role;

create function public.vmp_touch_authorization_revision()
returns trigger
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $function$
declare
  v_rows integer;
begin
  if current_setting('vmp.authorization_revision_touched', true) is distinct from '1' then
    perform set_config('vmp.authorization_revision_touched', '1', true);
    update public.vmp_authorization_revision
    set revision = revision + 1,
        updated_at = transaction_timestamp()
    where singleton;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception using errcode = 'check_violation',
        message = 'SOURCE_ACCESS_AUTHORIZATION_REVISION_SINGLETON';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

revoke all on function public.vmp_touch_authorization_revision()
  from public, anon, authenticated, service_role;

create trigger vmp_authorization_revision_source_insert_delete
after insert or delete on public.vmp_source_objects
for each row execute function public.vmp_touch_authorization_revision();

create trigger vmp_authorization_revision_source_update
after update of owner_person_id, support_person_id, object_code, is_active,
                department, area_code, line
on public.vmp_source_objects
for each row
when ((old.owner_person_id, old.support_person_id, old.object_code, old.is_active,
       public.vmp_source_scope_key(old.department),
       public.vmp_source_scope_key(old.area_code),
       public.vmp_source_scope_key(old.line))
      is distinct from
      (new.owner_person_id, new.support_person_id, new.object_code, new.is_active,
       public.vmp_source_scope_key(new.department),
       public.vmp_source_scope_key(new.area_code),
       public.vmp_source_scope_key(new.line)))
execute function public.vmp_touch_authorization_revision();

create trigger vmp_authorization_revision_plan_insert_delete
after insert or delete on public.vmp_plan_items
for each row execute function public.vmp_touch_authorization_revision();

create trigger vmp_authorization_revision_plan_update
after update of object_code, is_active on public.vmp_plan_items
for each row
when ((old.object_code, old.is_active)
      is distinct from (new.object_code, new.is_active))
execute function public.vmp_touch_authorization_revision();

create trigger vmp_authorization_revision_grant_insert_delete
after insert or delete on public.vmp_source_workshop_scope_grants
for each row execute function public.vmp_touch_authorization_revision();

create trigger vmp_authorization_revision_grant_update
after update of performer_id, department_key, area_key, line_key,
                valid_from, expires_at, is_active
on public.vmp_source_workshop_scope_grants
for each row
when ((old.performer_id, old.department_key, old.area_key, old.line_key,
       old.valid_from, old.expires_at, old.is_active)
      is distinct from
      (new.performer_id, new.department_key, new.area_key, new.line_key,
       new.valid_from, new.expires_at, new.is_active))
execute function public.vmp_touch_authorization_revision();

create trigger vmp_authorization_revision_assignment_insert
after insert on public.vmp_item_assignments
for each row when (new.assignment_kind = 'equipment_department')
execute function public.vmp_touch_authorization_revision();

create trigger vmp_authorization_revision_assignment_delete
after delete on public.vmp_item_assignments
for each row when (old.assignment_kind = 'equipment_department')
execute function public.vmp_touch_authorization_revision();

create trigger vmp_authorization_revision_assignment_update
after update of validation_code, performer_id, assignment_kind, expires_at,
                is_active
on public.vmp_item_assignments
for each row
when ((old.validation_code, old.performer_id, old.assignment_kind,
       old.expires_at, old.is_active)
      is distinct from
      (new.validation_code, new.performer_id, new.assignment_kind,
       new.expires_at, new.is_active)
      and (old.assignment_kind = 'equipment_department'
           or new.assignment_kind = 'equipment_department'))
execute function public.vmp_touch_authorization_revision();

create trigger vmp_authorization_revision_performer_insert_delete
after insert or delete on public.vmp_performers
for each row execute function public.vmp_touch_authorization_revision();

create trigger vmp_authorization_revision_performer_update
after update of user_id, is_active, access_class, department
on public.vmp_performers
for each row
when ((old.user_id, old.is_active, old.access_class, old.department)
      is distinct from
      (new.user_id, new.is_active, new.access_class, new.department))
execute function public.vmp_touch_authorization_revision();

create trigger vmp_authorization_revision_profile_insert_delete
after insert or delete on public.profiles
for each row execute function public.vmp_touch_authorization_revision();

create trigger vmp_authorization_revision_profile_update
after update of is_active, role, department on public.profiles
for each row
when ((old.is_active, old.role, old.department)
      is distinct from (new.is_active, new.role, new.department))
execute function public.vmp_touch_authorization_revision();

-- Source screen capability is authorization evidence too. Restrict insert and
-- delete touches to the Source row; an update that enters or leaves Source also
-- invalidates the revision.
create trigger vmp_authorization_revision_screen_insert
after insert on public.vmp_screen_permissions
for each row when (new.screen_id = 'source')
execute function public.vmp_touch_authorization_revision();

create trigger vmp_authorization_revision_screen_delete
after delete on public.vmp_screen_permissions
for each row when (old.screen_id = 'source')
execute function public.vmp_touch_authorization_revision();

create trigger vmp_authorization_revision_screen_update
after update of business_role, screen_id, can_view, data_scope, actions
on public.vmp_screen_permissions
for each row
when ((old.business_role, old.screen_id, old.can_view, old.data_scope,
       old.actions)
      is distinct from
      (new.business_role, new.screen_id, new.can_view, new.data_scope,
       new.actions)
      and (old.screen_id = 'source' or new.screen_id = 'source'))
execute function public.vmp_touch_authorization_revision();

create function public.vmp_reconcile_source_qa_projection(p_source_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $function$
declare
  v_source public.vmp_source_objects%rowtype;
  v_item public.vmp_plan_items%rowtype;
  v_owner public.vmp_performers%rowtype;
  v_support public.vmp_performers%rowtype;
  v_owner_user_snapshot uuid;
  v_support_user_snapshot uuid;
  v_assignment public.vmp_item_assignments%rowtype;
  v_changed public.vmp_item_assignments%rowtype;
  v_existing public.vmp_item_assignments%rowtype;
  v_old jsonb;
  v_reason text := 'Reconcile canonical Source QA projection';
  v_items integer := 0;
  v_plan_updated integer := 0;
  v_inserted integer := 0;
  v_reactivated integer := 0;
  v_revoked integer := 0;
  v_demoted integer := 0;
  v_rows integer;
  v_owner_eligible boolean := false;
  v_support_eligible boolean := false;
begin
  select source_object.* into strict v_source
  from public.vmp_source_objects source_object
  where source_object.id = p_source_id
  for update;

  -- Snapshot linkage only to identify profiles, then lock in the same global
  -- profile -> performer dependency order used by the migration and runtime.
  -- If linkage changes before the performer lock, the revalidation below
  -- fails and rolls back instead of proceeding with an unlocked profile.
  select performer.user_id into v_owner_user_snapshot
  from public.vmp_performers performer
  where performer.id = v_source.owner_person_id;
  select performer.user_id into v_support_user_snapshot
  from public.vmp_performers performer
  where performer.id = v_source.support_person_id;

  perform 1
  from public.profiles profile
  where profile.id = any (array[
    v_owner_user_snapshot, v_support_user_snapshot
  ]::uuid[])
  order by profile.id
  for update;

  perform 1
  from public.vmp_performers performer
  where performer.id = any (array[
    v_source.owner_person_id, v_source.support_person_id
  ]::uuid[])
  order by performer.id
  for update;

  -- Stable repair order: Source, principal evidence, related active items,
  -- then every assignment row that canonical conversion may change.
  perform 1
  from public.vmp_plan_items item
  where item.object_code = v_source.object_code and item.is_active is true
  order by item.validation_code, item.id
  for update;

  perform 1
  from public.vmp_item_assignments assignment
  where assignment.validation_code in (
      select item.validation_code
      from public.vmp_plan_items item
      where item.object_code = v_source.object_code and item.is_active is true
    )
    and assignment.assignment_kind = 'qa'
    and (
      assignment.source in ('source_owner', 'source_support')
      or (assignment.is_active and (
        assignment.performer_id in (
          v_source.owner_person_id, v_source.support_person_id
        )
        or assignment.assignment_role = 'primary'
      ))
    )
  order by assignment.validation_code, assignment.performer_id,
           assignment.assignment_role, assignment.source, assignment.id
  for update;

  -- Re-read after every required lock is held. Existing performer rows are
  -- retained for display even when they are not eligible for QA authority;
  -- only a missing performer row remains fail-closed because its display
  -- projection cannot be reconstructed safely.
  if v_source.owner_person_id is not null then
    select performer.* into strict v_owner
    from public.vmp_performers performer
    where performer.id = v_source.owner_person_id;

    select count(*) into v_rows
    from public.vmp_performers performer
    where performer.user_id = v_owner.user_id and performer.is_active is true;
    if v_owner.user_id is not null
       and v_owner.user_id is not distinct from v_owner_user_snapshot
       and v_owner.is_active is true
       and v_rows = 1
       and exists (
         select 1 from public.profiles profile
         where profile.id = v_owner.user_id and profile.is_active is true
           and public.vmp_business_role(v_owner.user_id) in ('qa_staff', 'qa_manager')
       ) then
      v_owner_eligible := true;
    end if;
  end if;

  if v_source.support_person_id is not null then
    select performer.* into strict v_support
    from public.vmp_performers performer
    where performer.id = v_source.support_person_id;

    select count(*) into v_rows
    from public.vmp_performers performer
    where performer.user_id = v_support.user_id and performer.is_active is true;
    if v_support.user_id is not null
       and v_support.user_id is not distinct from v_support_user_snapshot
       and v_support.is_active is true
       and v_rows = 1
       and exists (
         select 1 from public.profiles profile
         where profile.id = v_support.user_id and profile.is_active is true
           and public.vmp_business_role(v_support.user_id) in ('qa_staff', 'qa_manager')
       ) then
      v_support_eligible := true;
    end if;
  end if;

  for v_item in
    select item.*
    from public.vmp_plan_items item
    where item.object_code = v_source.object_code and item.is_active is true
    order by item.validation_code, item.id
  loop
    v_items := v_items + 1;

    update public.vmp_plan_items item
    set owner_person_id = v_source.owner_person_id,
        support_person_id = v_source.support_person_id,
        owner_name = case when v_source.owner_person_id is null
                          then null else v_owner.performer_name end,
        secondary_owner = case when v_source.support_person_id is null
                               then null else v_support.performer_name end
    where item.id = v_item.id
      and (item.owner_person_id, item.support_person_id,
           item.owner_name, item.secondary_owner)
          is distinct from
          (v_source.owner_person_id, v_source.support_person_id,
           case when v_source.owner_person_id is null
                then null else v_owner.performer_name end,
           case when v_source.support_person_id is null
                then null else v_support.performer_name end);
    get diagnostics v_rows = row_count;
    v_plan_updated := v_plan_updated + v_rows;

    -- Revoke stale canonical rows first, including source_support when owner
    -- and support intentionally resolve to the same performer.
    for v_assignment in
      select assignment.*
      from public.vmp_item_assignments assignment
      where assignment.validation_code = v_item.validation_code
        and assignment.assignment_kind = 'qa' and assignment.is_active
        and (
          (assignment.source = 'source_owner' and not (
            v_owner_eligible
            and assignment.performer_id is not distinct from
                v_source.owner_person_id
          ))
          or
          (assignment.source = 'source_support' and not (
            v_support_eligible
            and
            assignment.performer_id is not distinct from
              v_source.support_person_id
            and v_source.support_person_id is not null
            and v_source.support_person_id is distinct from
              v_source.owner_person_id
          ))
        )
      order by assignment.performer_id, assignment.assignment_role,
               assignment.source, assignment.id
    loop
      v_old := to_jsonb(v_assignment);
      update public.vmp_item_assignments assignment
      set is_active = false, change_reason = v_reason, updated_by = null
      where assignment.id = v_assignment.id
      returning assignment.* into strict v_changed;
      insert into public.audit_logs(
        user_id, action, table_name, record_id, validation_code,
        changed_fields, change_reason, old_data, new_data, source,
        effective_business_role
      ) values (
        null, 'UPDATE'::public.audit_action, 'vmp_item_assignments',
        v_assignment.id::text, v_item.validation_code, array['is_active'],
        v_reason, v_old, to_jsonb(v_changed),
        'source_qa_projection_reconcile', null
      );
      v_revoked := v_revoked + 1;
    end loop;

    if v_owner_eligible then
      -- Preserve history: revoke same-person noncanonical rows rather than
      -- rewriting their source label into the canonical tuple.
      for v_assignment in
        select assignment.*
        from public.vmp_item_assignments assignment
        where assignment.validation_code = v_item.validation_code
          and assignment.assignment_kind = 'qa' and assignment.is_active
          and assignment.performer_id = v_source.owner_person_id
          and assignment.source <> 'source_owner'
        order by assignment.assignment_role, assignment.source, assignment.id
      loop
        v_old := to_jsonb(v_assignment);
        update public.vmp_item_assignments assignment
        set is_active = false, change_reason = v_reason, updated_by = null
        where assignment.id = v_assignment.id
        returning assignment.* into strict v_changed;
        insert into public.audit_logs(
          user_id, action, table_name, record_id, validation_code,
          changed_fields, change_reason, old_data, new_data, source,
          effective_business_role
        ) values (
          null, 'UPDATE'::public.audit_action, 'vmp_item_assignments',
          v_assignment.id::text, v_item.validation_code, array['is_active'],
          v_reason, v_old, to_jsonb(v_changed),
          'source_qa_projection_reconcile', null
        );
        v_revoked := v_revoked + 1;
      end loop;

      -- Keep the existing one-primary invariant: a different active primary
      -- is audited and demoted before canonical owner activation.
      for v_assignment in
        select assignment.*
        from public.vmp_item_assignments assignment
        where assignment.validation_code = v_item.validation_code
          and assignment.assignment_kind = 'qa' and assignment.is_active
          and assignment.assignment_role = 'primary'
          and assignment.performer_id is distinct from v_source.owner_person_id
        order by assignment.performer_id, assignment.source, assignment.id
      loop
        v_old := to_jsonb(v_assignment);
        update public.vmp_item_assignments assignment
        set assignment_role = 'collaborator', change_reason = v_reason,
            updated_by = null
        where assignment.id = v_assignment.id
        returning assignment.* into strict v_changed;
        insert into public.audit_logs(
          user_id, action, table_name, record_id, validation_code,
          changed_fields, change_reason, old_data, new_data, source,
          effective_business_role
        ) values (
          null, 'UPDATE'::public.audit_action, 'vmp_item_assignments',
          v_assignment.id::text, v_item.validation_code,
          array['assignment_role'], v_reason, v_old, to_jsonb(v_changed),
          'source_qa_projection_reconcile', null
        );
        v_demoted := v_demoted + 1;
      end loop;

      select assignment.* into v_existing
      from public.vmp_item_assignments assignment
      where assignment.validation_code = v_item.validation_code
        and assignment.performer_id = v_source.owner_person_id
        and assignment.assignment_kind = 'qa'
        and assignment.source = 'source_owner';
      if not found then
        insert into public.vmp_item_assignments(
          validation_code, performer_id, user_id, staff_name, employee_code,
          assignment_kind, source, assignment_role, expires_at, is_active,
          change_reason, created_by, updated_by
        ) values (
          v_item.validation_code, v_owner.id, v_owner.user_id,
          v_owner.performer_name, v_owner.employee_code, 'qa', 'source_owner',
          'primary', null, true, v_reason, null, null
        );
        v_inserted := v_inserted + 1;
      else
        update public.vmp_item_assignments assignment
        set user_id = v_owner.user_id,
            staff_name = v_owner.performer_name,
            employee_code = v_owner.employee_code,
            assignment_role = 'primary', expires_at = null, is_active = true,
            change_reason = v_reason, updated_by = null
        where assignment.id = v_existing.id
          and (assignment.user_id, assignment.staff_name,
               assignment.employee_code, assignment.assignment_role,
               assignment.expires_at, assignment.is_active,
               assignment.change_reason, assignment.updated_by)
              is distinct from
              (v_owner.user_id, v_owner.performer_name,
               v_owner.employee_code, 'primary'::text, null::timestamptz,
               true, v_reason, null::uuid);
        get diagnostics v_rows = row_count;
        if v_rows = 1 and not v_existing.is_active then
          v_reactivated := v_reactivated + 1;
        end if;
      end if;
    end if;

    if v_support_eligible
       and v_source.support_person_id is distinct from v_source.owner_person_id then
      for v_assignment in
        select assignment.*
        from public.vmp_item_assignments assignment
        where assignment.validation_code = v_item.validation_code
          and assignment.assignment_kind = 'qa' and assignment.is_active
          and assignment.performer_id = v_source.support_person_id
          and assignment.source <> 'source_support'
        order by assignment.assignment_role, assignment.source, assignment.id
      loop
        v_old := to_jsonb(v_assignment);
        update public.vmp_item_assignments assignment
        set is_active = false, change_reason = v_reason, updated_by = null
        where assignment.id = v_assignment.id
        returning assignment.* into strict v_changed;
        insert into public.audit_logs(
          user_id, action, table_name, record_id, validation_code,
          changed_fields, change_reason, old_data, new_data, source,
          effective_business_role
        ) values (
          null, 'UPDATE'::public.audit_action, 'vmp_item_assignments',
          v_assignment.id::text, v_item.validation_code, array['is_active'],
          v_reason, v_old, to_jsonb(v_changed),
          'source_qa_projection_reconcile', null
        );
        v_revoked := v_revoked + 1;
      end loop;

      select assignment.* into v_existing
      from public.vmp_item_assignments assignment
      where assignment.validation_code = v_item.validation_code
        and assignment.performer_id = v_source.support_person_id
        and assignment.assignment_kind = 'qa'
        and assignment.source = 'source_support';
      if not found then
        insert into public.vmp_item_assignments(
          validation_code, performer_id, user_id, staff_name, employee_code,
          assignment_kind, source, assignment_role, expires_at, is_active,
          change_reason, created_by, updated_by
        ) values (
          v_item.validation_code, v_support.id, v_support.user_id,
          v_support.performer_name, v_support.employee_code, 'qa',
          'source_support', 'collaborator', null, true, v_reason, null, null
        );
        v_inserted := v_inserted + 1;
      else
        update public.vmp_item_assignments assignment
        set user_id = v_support.user_id,
            staff_name = v_support.performer_name,
            employee_code = v_support.employee_code,
            assignment_role = 'collaborator', expires_at = null,
            is_active = true, change_reason = v_reason, updated_by = null
        where assignment.id = v_existing.id
          and (assignment.user_id, assignment.staff_name,
               assignment.employee_code, assignment.assignment_role,
               assignment.expires_at, assignment.is_active,
               assignment.change_reason, assignment.updated_by)
              is distinct from
              (v_support.user_id, v_support.performer_name,
               v_support.employee_code, 'collaborator'::text,
               null::timestamptz, true, v_reason, null::uuid);
        get diagnostics v_rows = row_count;
        if v_rows = 1 and not v_existing.is_active then
          v_reactivated := v_reactivated + 1;
        end if;
      end if;
    end if;
  end loop;

  if exists (
       select 1
       from public.vmp_plan_items item
       where item.object_code = v_source.object_code and item.is_active is true
         and (item.owner_person_id is distinct from v_source.owner_person_id
              or item.support_person_id is distinct from
                 v_source.support_person_id)
     )
     or exists (
       select 1
       from public.vmp_plan_items item
       where item.object_code = v_source.object_code and item.is_active is true
         and v_source.owner_person_id is not null
         and v_owner_eligible
         and (select count(*)
              from public.vmp_item_assignments assignment
              where assignment.validation_code = item.validation_code
                and assignment.performer_id = v_source.owner_person_id
                and assignment.assignment_kind = 'qa'
                and assignment.source = 'source_owner'
                and assignment.assignment_role = 'primary'
                and assignment.is_active) <> 1
     )
     or exists (
       select 1
       from public.vmp_plan_items item
       where item.object_code = v_source.object_code and item.is_active is true
         and v_source.support_person_id is not null
         and v_support_eligible
         and v_source.support_person_id is distinct from v_source.owner_person_id
         and (select count(*)
              from public.vmp_item_assignments assignment
              where assignment.validation_code = item.validation_code
                and assignment.performer_id = v_source.support_person_id
                and assignment.assignment_kind = 'qa'
                and assignment.source = 'source_support'
                and assignment.assignment_role = 'collaborator'
                and assignment.is_active) <> 1
     )
     or exists (
       select 1
       from public.vmp_plan_items item
       where item.object_code = v_source.object_code and item.is_active is true
         and v_source.owner_person_id is not null
         and v_owner_eligible
         and v_source.owner_person_id is not distinct from
             v_source.support_person_id
         and (select count(*)
              from public.vmp_item_assignments assignment
              where assignment.validation_code = item.validation_code
                and assignment.performer_id = v_source.owner_person_id
                and assignment.assignment_kind = 'qa'
                and assignment.is_active) <> 1
     )
     or exists (
       select 1
       from public.vmp_plan_items item
       join public.vmp_item_assignments assignment
         on assignment.validation_code = item.validation_code
        and assignment.assignment_kind = 'qa' and assignment.is_active
        and assignment.source in ('source_owner', 'source_support')
       where item.object_code = v_source.object_code and item.is_active is true
         and (
           (assignment.source = 'source_owner' and not (
             v_owner_eligible
             and assignment.performer_id is not distinct from
                 v_source.owner_person_id
           ))
           or
           (assignment.source = 'source_support' and not (
             v_support_eligible
             and
             assignment.performer_id is not distinct from
               v_source.support_person_id
             and v_source.support_person_id is not null
             and v_source.support_person_id is distinct from
               v_source.owner_person_id
           ))
         )
     )
     -- Ineligible existing relations are display-only and must have zero
     -- active canonical Source assignments after reconciliation.
     or exists (
       select 1
       from public.vmp_plan_items item
       join public.vmp_item_assignments assignment
         on assignment.validation_code = item.validation_code
        and assignment.assignment_kind = 'qa'
        and assignment.source = 'source_owner'
        and assignment.is_active
       where item.object_code = v_source.object_code and item.is_active is true
         and v_source.owner_person_id is not null
         and not v_owner_eligible
         and assignment.performer_id is not distinct from v_source.owner_person_id
     )
     or exists (
       select 1
       from public.vmp_plan_items item
       join public.vmp_item_assignments assignment
         on assignment.validation_code = item.validation_code
        and assignment.assignment_kind = 'qa'
        and assignment.source = 'source_support'
        and assignment.is_active
       where item.object_code = v_source.object_code and item.is_active is true
         and v_source.support_person_id is not null
         and not v_support_eligible
         and assignment.performer_id is not distinct from v_source.support_person_id
     )
     or exists (
       select 1 from pg_index index_row
       where index_row.indexrelid in (
         'public.vmp_item_assignments_one_active_qa_person'::regclass,
         'public.vmp_item_assignments_one_active_qa_primary'::regclass
       ) and (not index_row.indisunique or not index_row.indisvalid
              or not index_row.indisready)
     ) then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_RECONCILE_POSTCONDITION';
  end if;

  return jsonb_build_object(
    'ok', true, 'source_id', p_source_id, 'items', v_items,
    'plan_updated', v_plan_updated, 'inserted', v_inserted,
    'reactivated', v_reactivated, 'revoked', v_revoked,
    'demoted', v_demoted
  );
exception
  when no_data_found then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_RECONCILE_INVALID_SOURCE_OR_PRINCIPAL';
end
$function$;

revoke all on function public.vmp_reconcile_source_qa_projection(uuid)
  from public, anon, authenticated, service_role;

-- Exact owner-safe fail-closed body required across the expand/enforce gap.
create or replace function public.rpc_refresh_source_item_assignments()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  return jsonb_build_object(
    'ok', false,
    'error_code', 'SOURCE_ACCESS_UPGRADE_IN_PROGRESS',
    'error', 'Nâng cấp quyền Source đang được áp dụng'
  );
end
$function$;

revoke all on function public.rpc_refresh_source_item_assignments()
  from public, anon, authenticated, service_role;

do $postcheck$
declare
  v_projection text;
  v_stub oid := 'public.rpc_refresh_source_item_assignments()'::regprocedure;
begin
  if public.vmp_source_scope_key(E'  NHÀ\t MÁY  A\n') is distinct from
       'nhà máy a'
     or public.vmp_source_scope_key(null) is not null
     or (select count(*) from pg_proc procedure
         join pg_namespace namespace on namespace.oid = procedure.pronamespace
         where namespace.nspname = 'public'
           and procedure.proname in (
             'vmp_source_scope_key', 'vmp_exact_active_source_for_item',
             'vmp_reconcile_source_qa_projection',
             'vmp_touch_authorization_revision'
           )) <> 4 then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_EXPAND_POSTCHECK_PRIVATE_HELPERS';
  end if;

  if (select count(*) from public.vmp_authorization_revision) <> 1
     or not exists (
       select 1 from public.vmp_authorization_revision
       where singleton and revision = 1
     )
     or not exists (
       select 1 from pg_class relation
       join pg_roles owner on owner.oid = relation.relowner
       where relation.oid =
               'public.vmp_source_workshop_scope_grants'::regclass
         and owner.rolname = 'postgres' and relation.relrowsecurity
         and not relation.relforcerowsecurity
         and relation.relacl::text = '{postgres=arwdDxtm/postgres}'
     )
     or not exists (
       select 1 from pg_class relation
       join pg_roles owner on owner.oid = relation.relowner
       where relation.oid = 'public.vmp_authorization_revision'::regclass
         and owner.rolname = 'postgres' and relation.relrowsecurity
         and not relation.relforcerowsecurity
         and relation.relacl::text = '{postgres=arwdDxtm/postgres}'
     )
     or (select count(*) from pg_policy where polrelid in (
          'public.vmp_source_workshop_scope_grants'::regclass,
          'public.vmp_authorization_revision'::regclass
        )) <> 0
     or has_table_privilege(
          'authenticated', 'public.vmp_source_workshop_scope_grants',
          'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege(
          'service_role', 'public.vmp_source_workshop_scope_grants',
          'SELECT,INSERT,UPDATE,DELETE') then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_EXPAND_POSTCHECK_PRIVATE_TABLE_ACL_RLS';
  end if;

  if (select pg_get_constraintdef(oid) from pg_constraint
      where conrelid = 'public.vmp_item_assignments'::regclass
        and conname = 'vmp_item_assignments_source_check') is distinct from
       'CHECK ((source = ANY (ARRAY[''sheet_qa''::text, ''sheet_other_staff''::text, ''qa_manager''::text, ''equipment_manager''::text, ''source_owner''::text, ''source_support''::text])))'
     or (select pg_get_indexdef(indexrelid) from pg_index
         where indexrelid =
           'public.vmp_item_assignments_one_active_qa_person'::regclass)
        is distinct from
       'CREATE UNIQUE INDEX vmp_item_assignments_one_active_qa_person ON public.vmp_item_assignments USING btree (validation_code, performer_id, assignment_kind) WHERE ((performer_id IS NOT NULL) AND (assignment_kind = ''qa''::text) AND is_active)'
     or (select pg_get_indexdef(indexrelid) from pg_index
         where indexrelid =
           'public.vmp_item_assignments_one_active_qa_primary'::regclass)
        is distinct from
       'CREATE UNIQUE INDEX vmp_item_assignments_one_active_qa_primary ON public.vmp_item_assignments USING btree (validation_code) WHERE ((assignment_kind = ''qa''::text) AND (assignment_role = ''primary''::text) AND is_active)'
     or exists (
       select 1 from pg_index index_row
       where index_row.indexrelid in (
         'public.vmp_item_assignments_one_active_qa_person'::regclass,
         'public.vmp_item_assignments_one_active_qa_primary'::regclass
       ) and (not index_row.indisunique or not index_row.indisvalid
              or not index_row.indisready)
     ) then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_EXPAND_POSTCHECK_ASSIGNMENT_INVARIANTS';
  end if;

  if encode(extensions.digest(convert_to(pg_get_functiondef(v_stub), 'UTF8'),
       'sha256'), 'hex') <>
       'bce51a727187ff4544421391e4f1e03ee9e7336efa10e3ebfbcd71f7c71db3cd'
     or not exists (
       select 1 from pg_proc procedure
       join pg_roles owner on owner.oid = procedure.proowner
       join pg_language language on language.oid = procedure.prolang
       where procedure.oid = v_stub and owner.rolname = 'postgres'
         and language.lanname = 'plpgsql' and procedure.provolatile = 'v'
         and procedure.prosecdef and procedure.proparallel = 'u'
         and not procedure.proisstrict and not procedure.proleakproof
         and procedure.proconfig = array['search_path=public, pg_temp']::text[]
         and procedure.proacl::text = '{postgres=X/postgres}'
     )
     or has_function_privilege('authenticated', v_stub, 'EXECUTE')
     or has_function_privilege('service_role', v_stub, 'EXECUTE')
     or has_function_privilege('anon', v_stub, 'EXECUTE')
     or has_function_privilege('public', v_stub, 'EXECUTE') then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_EXPAND_POSTCHECK_REFRESH_FENCE';
  end if;

  with source_projection as (
    select count(*) row_count,
           encode(extensions.digest(convert_to(coalesce(string_agg(
             to_jsonb(source_object)::text, E'\n' order by source_object.id::text
           ), ''), 'UTF8'), 'sha256'), 'hex') row_digest
    from public.vmp_source_objects source_object
  ), plan_projection as (
    select count(*) row_count,
           encode(extensions.digest(convert_to(coalesce(string_agg(
             to_jsonb(plan_item)::text, E'\n' order by plan_item.id::text
           ), ''), 'UTF8'), 'sha256'), 'hex') row_digest
    from public.vmp_plan_items plan_item
  ), assignment_projection as (
    select count(*) row_count,
           encode(extensions.digest(convert_to(coalesce(string_agg(
             to_jsonb(assignment)::text, E'\n' order by assignment.id::text
           ), ''), 'UTF8'), 'sha256'), 'hex') row_digest
    from public.vmp_item_assignments assignment
  )
  select concat_ws('|', source_projection.row_count,
         source_projection.row_digest, plan_projection.row_count,
         plan_projection.row_digest, assignment_projection.row_count,
         assignment_projection.row_digest)
    into v_projection
  from source_projection cross join plan_projection cross join assignment_projection;

  if v_projection is distinct from current_setting(
       'vmp.source_access_expand_projection_before', true) then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_EXPAND_POSTCHECK_PROJECTION_MUTATED';
  end if;

  if not exists (
       select 1 from pg_class relation
       join pg_namespace namespace on namespace.oid = relation.relnamespace
       where namespace.nspname = 'public' and relation.relname in (
         'uq_vmp_source_objects_active_object_code',
         'idx_vmp_plan_items_object_year_active',
         'idx_vmp_source_objects_list',
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
         'idx_profiles_active_role_department'
       )
       group by namespace.nspname having count(*) = 17
     ) then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_EXPAND_POSTCHECK_INDEX_SET';
  end if;
end
$postcheck$;

commit;

-- Forward recovery only: if enforce cannot commit, keep this additive schema
-- and owner-only refresh fence in place, block frontend rollout, and apply a
-- separately reviewed correction. Do not drop grant/history data or restore
-- the destructive legacy refresh during the gap.

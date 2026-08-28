\set ON_ERROR_STOP on

begin;
set local lock_timeout='3s';
set local statement_timeout='120s';

create function pg_temp.assert_true(p_condition boolean,p_rule_id text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition,false) then
    raise exception using errcode='check_violation',message=p_rule_id;
  end if;
end
$$;

create function pg_temp.assert_forbidden(p_actual jsonb,p_rule_id text)
returns void language plpgsql as $$
begin
  if p_actual->>'ok' is distinct from 'false'
     or upper(coalesce(p_actual->>'error_code',p_actual->>'code',''))<>'FORBIDDEN' then
    raise exception using errcode='check_violation',
      message=format('%s expected=FORBIDDEN actual=%s',p_rule_id,p_actual);
  end if;
end
$$;

create temp table expected_browser_function(
  signature text primary key,
  volatility "char" not null,
  classification text not null,
  language_name text not null default 'plpgsql'
) on commit drop;

insert into expected_browser_function(signature,volatility,classification)
values
  ('rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)','s','rights_reader'),
  ('rpc_source_object_facets(text,jsonb)','s','rights_reader'),
  ('rpc_export_source_objects(text,text,jsonb,jsonb,integer)','v','rights_reader'),
  ('rpc_source_field_suggestions(text,text,text,jsonb,integer)','s','manager_reader'),
  ('rpc_source_qa_candidates(text,jsonb,integer,uuid[])','s','manager_reader'),
  ('rpc_list_source_workshop_coverage(text,jsonb,integer)','s','manager_reader'),
  ('rpc_source_workshop_scope_choices(text,text,text,jsonb,integer)','s','manager_reader'),
  ('rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)','v','manager_writer'),
  ('rpc_get_vmp_dashboard(integer,boolean,boolean)','s','rights_reader'),
  ('rpc_get_vmp_watermark(integer)','s','rights_reader'),
  ('rpc_source_warnings(integer)','s','rights_reader'),
  ('rpc_my_editable_progress_rights()','s','rights_reader'),
  ('vmp_my_item_rights(text)','s','rights_reader'),
  ('rpc_update_progress(text,jsonb,text,jsonb,integer)','v','rights_writer'),
  ('rpc_save_catalog_object(text,text,jsonb,text,integer)','v','manager_writer'),
  ('rpc_list_catalog_dataset(text,text,jsonb,integer,integer)','s','manager_reader'),
  ('rpc_list_catalog_changes(text,text,integer,integer)','s','manager_reader'),
  ('rpc_catalog_history(jsonb,integer,integer)','s','manager_reader'),
  ('rpc_catalog_history_detail(uuid)','s','manager_reader'),
  ('rpc_stage_catalog_import(text,text,text,text,jsonb)','v','manager_writer'),
  ('rpc_commit_catalog_import(uuid,text)','v','manager_writer'),
  ('rpc_save_product_gmp(text,jsonb,text,integer)','v','manager_writer'),
  ('rpc_save_alert_recipient(uuid,jsonb,text,integer)','v','manager_writer'),
  ('rpc_delete_source_row(text,integer)','v','manager_writer'),
  ('rpc_upsert_source_row(text,integer,jsonb)','v','manager_writer'),
  ('rpc_upsert_object(text,text,text,text,text,text,integer,text)','v','manager_writer'),
  ('rpc_set_assignment(text,text,text,text,text)','v','rights_writer');

update expected_browser_function set language_name='sql'
where signature in (
  'rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)',
  'rpc_source_qa_candidates(text,jsonb,integer,uuid[])',
  'rpc_my_editable_progress_rights()'
);

select pg_temp.assert_true(
  to_regclass('public.vmp_source_workshop_scope_grants') is not null
  and not exists (
    select 1 from expected_browser_function expected
    where to_regprocedure('public.'||expected.signature) is null
  ),
  'SOURCE_ACCESS_SECURITY_SCHEMA_OR_BROWSER_FUNCTION_MISSING rpc_list_source_objects vmp_source_workshop_scope_grants');

with actual as (
	  select expected.signature,expected.volatility,expected.classification,
	         expected.language_name expected_language,
         procedure.oid,owner.rolname owner_name,language.lanname language_name,
         procedure.prosecdef,procedure.provolatile,procedure.proparallel,
         procedure.proisstrict,procedure.proleakproof,procedure.proconfig,
         procedure.proname
  from expected_browser_function expected
  join pg_proc procedure
    on procedure.oid=to_regprocedure('public.'||expected.signature)
  join pg_roles owner on owner.oid=procedure.proowner
  join pg_language language on language.oid=procedure.prolang
)
select pg_temp.assert_true(
  (select count(*) from actual)=(select count(*) from expected_browser_function)
  and not exists (
    select 1 from actual
	    where owner_name<>'postgres' or language_name<>expected_language
       or not prosecdef or provolatile<>volatility or proparallel<>'u'
       or proisstrict or proleakproof
       or proconfig is distinct from array['search_path=public, pg_temp']
       or not has_function_privilege('authenticated',oid,'EXECUTE')
       or not has_function_privilege('service_role',oid,'EXECUTE')
       or has_function_privilege('anon',oid,'EXECUTE')
       or has_function_privilege('public',oid,'EXECUTE')
       or (select count(*) from pg_proc overload
           join pg_namespace namespace on namespace.oid=overload.pronamespace
           where namespace.nspname='public' and overload.proname=actual.proname)<>1
  ),
  'SOURCE_ACCESS_BROWSER_OWNER_LANGUAGE_VOLATILITY_SEARCH_PATH_ACL_OVERLOAD');

select pg_temp.assert_true(
  (select owner.rolname='postgres' and language.lanname='sql'
          and procedure.provolatile='i' and not procedure.prosecdef
          and procedure.proparallel='s'
   from pg_proc procedure
   join pg_roles owner on owner.oid=procedure.proowner
   join pg_language language on language.oid=procedure.prolang
   where procedure.oid='public.vmp_source_scope_key(text)'::regprocedure)
  and (select count(*) from pg_proc procedure
       join pg_namespace namespace on namespace.oid=procedure.pronamespace
       where namespace.nspname='public' and procedure.proname='vmp_source_scope_key')=1,
  'SOURCE_ACCESS_SCOPE_KEY_EXACT_OWNER_LANGUAGE_IMMUTABLE_NO_OVERLOAD');

with resolver as (
  select procedure.oid,procedure.oid::regprocedure::text signature,
         owner.rolname owner_name,language.lanname language_name,
         procedure.provolatile,procedure.prosecdef,procedure.proconfig,
         encode(extensions.digest(convert_to(
           pg_get_functiondef(procedure.oid),'UTF8'),'sha256'),'hex') definition_hash
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid=procedure.pronamespace
  join pg_roles owner on owner.oid=procedure.proowner
  join pg_language language on language.oid=procedure.prolang
  where namespace.nspname='public'
    and procedure.oid in (
      'public.muc_quyen(text,text)'::regprocedure,
      'public.duoc_phep(text,text)'::regprocedure
    )
), actual_acl as (
  select resolver.signature,
         case when acl.grantee=0 then 'PUBLIC'
              else acl.grantee::regrole::text end grantee,
         acl.privilege_type,acl.is_grantable
  from resolver join pg_proc procedure on procedure.oid=resolver.oid
  cross join lateral aclexplode(procedure.proacl) acl
), expected_acl(signature,grantee,privilege_type,is_grantable) as (
  values
    ('muc_quyen(text,text)','postgres','EXECUTE',false),
    ('muc_quyen(text,text)','service_role','EXECUTE',false),
    ('duoc_phep(text,text)','postgres','EXECUTE',false),
    ('duoc_phep(text,text)','service_role','EXECUTE',false)
)
select pg_temp.assert_true(
  (select count(*) from resolver)=2
  and not exists (
    select 1 from resolver
    where owner_name<>'postgres' or language_name<>'sql'
       or provolatile<>'s' or not prosecdef
       or case signature
            when 'muc_quyen(text,text)' then
              proconfig is distinct from array['search_path=public, pg_temp']
              or definition_hash<>'f85fe5073e6e6ba1cb4b7c4a03890c2b1338d10c544b0c9bb39c0a115c11ee70'
            when 'duoc_phep(text,text)' then
              proconfig is distinct from array['search_path=public']
              or definition_hash<>'55ef8400cede7c7224dae7246791bc60244b9a4b92fd764aeb28e448b396eb91'
            else true end
  )
  and not exists (select * from actual_acl except select * from expected_acl)
  and not exists (select * from expected_acl except select * from actual_acl)
  and (select count(*) from pg_proc procedure
       join pg_namespace namespace on namespace.oid=procedure.pronamespace
       where namespace.nspname='public'
         and procedure.proname in ('muc_quyen','duoc_phep'))=2,
  'SOURCE_ACCESS_EXACT_PERMISSION_RESOLVER_DEFINITION_ACL');

select pg_temp.assert_true(
  (select owner.rolname='postgres'
          and relation.relrowsecurity and not relation.relforcerowsecurity
          and relation.relacl::text='{postgres=arwdDxtm/postgres}'
   from pg_class relation
   join pg_roles owner on owner.oid=relation.relowner
   where relation.oid='public.vmp_legacy_action_map'::regclass)
  and (select count(*) from pg_policy
       where polrelid='public.vmp_legacy_action_map'::regclass)=0
  and not exists (
    select 1 from pg_attribute attribute
    where attribute.attrelid='public.vmp_legacy_action_map'::regclass
      and attribute.attnum>0 and not attribute.attisdropped
      and attribute.attacl is not null
  )
  and not has_table_privilege('authenticated','public.vmp_legacy_action_map',
                               'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_table_privilege('anon','public.vmp_legacy_action_map',
                               'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_table_privilege('service_role','public.vmp_legacy_action_map',
                               'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_table_privilege('public','public.vmp_legacy_action_map',
                               'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  'SOURCE_ACCESS_LEGACY_ACTION_MAP_OWNER_ONLY_ACL_RLS');

create temp table legacy_action_map_snapshot(digest text not null) on commit drop;
insert into legacy_action_map_snapshot
select encode(extensions.digest(convert_to(coalesce(string_agg(
         to_jsonb(mapping)::text,E'\n' order by mapping.hanh_dong_cu
       ),''),'UTF8'),'sha256'),'hex')
from public.vmp_legacy_action_map mapping;

create function pg_temp.assert_legacy_map_direct_denied(p_statement text,p_rule_id text)
returns void language plpgsql security invoker as $$
begin
  begin
    execute p_statement;
  exception when insufficient_privilege then
    return;
  end;
  raise exception using errcode='check_violation',message=p_rule_id;
end
$$;

set local role authenticated;
select pg_temp.assert_legacy_map_direct_denied(
  'select count(*) from public.vmp_legacy_action_map',
  'SOURCE_ACCESS_LEGACY_MAP_DIRECT_SELECT_DENIED');
select pg_temp.assert_legacy_map_direct_denied(
  'insert into public.vmp_legacy_action_map(hanh_dong_cu,screen_id,hanh_dong_moi) select ''source_access_probe'',''source'',''view'' where false',
  'SOURCE_ACCESS_LEGACY_MAP_DIRECT_INSERT_DENIED');
select pg_temp.assert_legacy_map_direct_denied(
  'update public.vmp_legacy_action_map set ghi_chu=ghi_chu where false',
  'SOURCE_ACCESS_LEGACY_MAP_DIRECT_UPDATE_DENIED');
select pg_temp.assert_legacy_map_direct_denied(
  'delete from public.vmp_legacy_action_map where false',
  'SOURCE_ACCESS_LEGACY_MAP_DIRECT_DELETE_DENIED');
reset role;

select pg_temp.assert_true(
  (select digest from legacy_action_map_snapshot)=(
    select encode(extensions.digest(convert_to(coalesce(string_agg(
             to_jsonb(mapping)::text,E'\n' order by mapping.hanh_dong_cu
           ),''),'UTF8'),'sha256'),'hex')
    from public.vmp_legacy_action_map mapping
  )
  and public.muc_quyen('admin_users','admin')='co'
  and public.muc_quyen('admin_users','department_user')='khong'
  and public.muc_quyen('admin_users','qa_manager')='khong'
  and public.muc_quyen('admin_users','viewer')='khong'
  and public.duoc_phep('admin_users','admin')
  and not exists (
    select 1 from unnest(array[
      'qa_manager','qa_staff','workshop_manager','workshop_staff','viewer'
    ]) role_name where public.duoc_phep('admin_users',role_name)
  ),
  'SOURCE_ACCESS_PERMISSION_RESOLVER_MATRIX_PRESERVED');

create temp table protected_relation(name text primary key) on commit drop;
insert into protected_relation values
  ('vmp_source_objects'),('vmp_plan_items'),('vmp_item_assignments'),
  ('vmp_source_workshop_scope_grants'),('vmp_products_gmp'),
  ('vmp_alert_recipients');

create temp table protected_existing_relation on commit drop as
select relation.oid,relation.relname relation_name,relation.relkind
from protected_relation expected
join pg_namespace namespace on namespace.nspname='public'
join pg_class relation
  on relation.relnamespace=namespace.oid and relation.relname=expected.name;

select pg_temp.assert_true(
  (select count(*) from protected_existing_relation)=6
  and not exists (
    select name from protected_relation
    except select relation_name from protected_existing_relation
  ),
  'SOURCE_ACCESS_EXACT_PROTECTED_BASE_RELATION_SET');

create temp table protected_view_edge on commit drop as
select distinct dependency.refobjid referenced_oid,
       rewrite_rule.ev_class dependent_oid
from pg_depend dependency
join pg_rewrite rewrite_rule on rewrite_rule.oid=dependency.objid
where dependency.classid='pg_rewrite'::regclass
  and dependency.refclassid='pg_class'::regclass
  and dependency.deptype='n'
  and rewrite_rule.ev_class<>dependency.refobjid;

create temp table protected_view_closure on commit drop as
with recursive closure(root_oid,oid,path) as (
  select oid,oid,array[oid] from protected_existing_relation
  union all
  select closure.root_oid,edge.dependent_oid,closure.path||edge.dependent_oid
  from closure
  join protected_view_edge edge on edge.referenced_oid=closure.oid
  where not edge.dependent_oid=any(closure.path)
)
select distinct root.relname root_name,relation.oid,
       relation.relname relation_name,relation.relkind,
       pg_get_viewdef(relation.oid,true) definition
from closure
join pg_class root on root.oid=closure.root_oid
join pg_class relation on relation.oid=closure.oid
where relation.relkind in ('v','m');

create temp table expected_protected_view(
  root_name text not null,relation_name text not null,relkind "char" not null,
  definition_hash text not null,primary key(root_name,relation_name)
) on commit drop;
insert into expected_protected_view values
  ('vmp_item_assignments','vmp_active_item_assignments','v',
   'd0ee7fcd1d5aa09faa5d3767fad10b5d75981f9ff7c8e8e6534d06b4f99f846e'),
  ('vmp_plan_items','vmp_ai_tu_dien','v',
   '95fc2b0512e8df958fa9ddf9514623091eb6aa2cf0f8a8de54489ac54bc25b9a'),
  ('vmp_plan_items','vmp_status_current','v',
   'bad79bfb5150f83e27d9c9eb8f89b273f1983d70a5797523972c6fc4279f4e3c');

select pg_temp.assert_true(
  not exists (
    select root_name,relation_name,relkind from protected_view_closure
    except select root_name,relation_name,relkind from expected_protected_view
  ) and not exists (
    select root_name,relation_name,relkind from expected_protected_view
    except select root_name,relation_name,relkind from protected_view_closure
  )
  and not exists (
    select 1 from expected_protected_view expected
    join protected_view_closure inventory using(root_name,relation_name,relkind)
    join pg_class relation on relation.oid=inventory.oid
    join pg_roles owner on owner.oid=relation.relowner
    where owner.rolname<>'postgres' or relation.relkind<>'v'
       or relation.reloptions is distinct from array['security_invoker=true']
       or relation.relacl::text<>'{postgres=arwdDxtm/postgres}'
       or encode(extensions.digest(convert_to(
            pg_get_viewdef(relation.oid,true),'UTF8'),'sha256'),'hex')<>
          expected.definition_hash
       or exists (
         select 1 from pg_attribute attribute
         where attribute.attrelid=relation.oid and attribute.attnum>0
           and not attribute.attisdropped and attribute.attacl is not null
       )
  ),
  'SOURCE_ACCESS_EXACT_PROTECTED_VIEW_DEPENDENCY_ACL_INVENTORY');

create temp table expected_source_definer(
  signature text primary key,
  classification text not null check(classification in ('browser','service','owner')),
  expected_proconfig text[]
) on commit drop;

insert into expected_source_definer(signature,classification)
select signature,'service' from unnest(array[
  'audit_plan_item_changes_v2()','audit_plan_item_changes()',
  'ly_do_khong_sua_duoc(text,uuid)',
  'rpc_ai_cache_doc(text)','rpc_ai_cham_tra_cuu(text)',
  'rpc_ai_chay_bo_kiem(jsonb)','rpc_ai_context_goc(text,integer,integer)',
  'rpc_ai_context_gon(text,integer)','rpc_ai_context(text,integer,integer)',
  'rpc_ai_do_thuc_the(text,text)','rpc_ai_doc_trang_thai(text,text,integer)',
  'rpc_ai_dung_cau_tra_loi_goc(text,jsonb,integer)',
  'rpc_ai_dung_cau_tra_loi(text,jsonb,integer)','rpc_ai_goi_y_chip(text)',
  'rpc_ai_goi_y_tiep(jsonb,integer)','rpc_ai_hieu_cau_hoi(text)',
  'rpc_ai_hieu_tu_khoa(text,integer)','rpc_ai_ho_so_nguoi(text,integer)',
  'rpc_ai_kiem_mo_ho(text)','rpc_ai_mail_targets(date,boolean)',
  'rpc_ai_muc_luc()','rpc_ai_ngu_canh_nap_san(text,integer)',
  'rpc_ai_ngu_canh_phan_tich(text,text)',
  'rpc_ai_ngu_canh_tam_ly(text,text,integer)','rpc_ai_nho_lai(text,text,integer)',
  'rpc_ai_phan_tich_cau_hoi(text,text)','rpc_ai_tam_su(text,jsonb,integer)',
  'rpc_ai_thong_ke_loc(text,integer)','rpc_ai_tim_nguoi_mo(text,integer)',
  'rpc_ai_tra_loi_nhanh(text,integer,jsonb,text)',
  'rpc_ai_ve_nguoi_hoi(text,jsonb,integer)','rpc_alert_context(text,integer)',
  'rpc_apply_assignments(boolean)','rpc_apply_sheet_sync(text,text,jsonb)',
  'rpc_cleanup_orphan_source_assignment_resolutions(text)',
  'rpc_delete_alert_recipient(uuid)','rpc_delete_product_gmp(text)',
  'rpc_delete_source_object(text,text,text)','rpc_get_item_version(text)',
  'rpc_reconcile_orphan_objects(text[])','rpc_refresh_source_item_assignments()',
  'rpc_register_alert(text,text,text,text,text,text,text)',
  'rpc_resolve_source_item_assignment(uuid,uuid,text)',
  'rpc_rollback_vmp_sheet_sync(uuid)',
  'rpc_sync_vmp_sheet_snapshot_with_extras(text,text,text,jsonb,jsonb)',
  'rpc_sync_vmp_sheet_snapshot(text,text,text,jsonb,jsonb)',
  'rpc_upsert_alert_recipient(uuid,jsonb)','rpc_upsert_product_gmp(text,jsonb)',
  'rpc_upsert_source_object(text,text,jsonb)','vmp_ai_dau_van()',
  'vmp_ai_ghi_dem()','vmp_allowed_timeline_fields(uuid,text)',
  'vmp_can_view_item(uuid,text)','vmp_item_rights(uuid,text)',
  'vmp_item_scope_matches(uuid,text)',
  'vmp_source_workshop_scope_match(uuid,uuid)',
  'vmp_sync_item_assignments_from_performer()',
  'vmp_unfiltered_security_definer_item_readers()',
  'vmp_visible_plan_items()'
]::text[]) signature;

insert into expected_source_definer(signature,classification)
select signature,'owner' from unnest(array[
  'rpc_active_rules__five_role_impl_20260824()',
  'rpc_apply_catalog_change__five_role_impl_20260824(uuid,text,integer)',
  'rpc_check_data_quality__five_role_impl_20260824(integer)',
  'rpc_commit_catalog_import__five_role_impl_20260824(uuid,text)',
  'rpc_create_plan_item__five_role_impl_20260824(text,text,integer,integer,jsonb)',
  'rpc_delete_plan_item__five_role_impl_20260824(text,text)',
  'rpc_dashboard_kpi__five_role_impl_20260824(integer)',
  'rpc_due_alerts__five_role_impl_20260824(integer,integer)',
  'rpc_generate_timeline__five_role_impl_20260824(integer,boolean)',
  'rpc_get_missing_items__five_role_impl_20260824(integer)',
  'rpc_get_vmp_dashboard__five_role_impl_20260824(integer,boolean,boolean)',
  'rpc_get_vmp_watermark__five_role_impl_20260824(integer)',
  'rpc_item_assignments__five_role_impl_20260824(text,uuid)',
  'rpc_item_permission_preflight__five_role_impl_20260824()',
  'rpc_item_progress_history__five_role_impl_20260824(text,integer,integer)',
  'rpc_list_catalog_dataset__five_role_impl_20260824(text,text,jsonb,integer,integer)',
  'rpc_link_item_permission_account__five_role_impl_20260824(uuid,uuid,text,integer)',
  'rpc_luat_xem__five_role_impl_20260824()','rpc_nguoi_va_quyen__five_role_impl_20260824()',
  'rpc_preview_catalog_change__five_role_impl_20260824(uuid)',
  'rpc_preview_item_rights__five_role_impl_20260824(uuid,text)',
  'rpc_recalc_criticality__five_role_impl_20260824(boolean)',
  'rpc_refresh_computed_status__five_role_impl_20260824()',
  'rpc_resolve_missing__five_role_impl_20260824(text,text,text)',
  'rpc_save_alert_recipient__five_role_impl_20260824(uuid,jsonb,text,integer)',
  'rpc_save_catalog_object__five_role_impl_20260824(text,text,jsonb,text,integer)',
  'rpc_save_product_gmp__five_role_impl_20260824(text,jsonb,text,integer)',
  'rpc_set_item_assignment__five_role_impl_20260824(uuid,text,text,text,text,text,uuid)',
  'rpc_set_item_performer_by_id__five_role_impl_20260824(text,uuid,text)',
  'rpc_set_item_permissions_mode__five_role_impl_20260824(text,text)',
  'rpc_set_item_state__five_role_impl_20260824(text,text,text)',
  'rpc_source_warnings__five_role_impl_20260824(integer)',
  'rpc_stage_catalog_import__five_role_impl_20260824(text,text,text,text,jsonb)',
  'rpc_trang_thai_he_thong__five_role_impl_20260824()',
  'rpc_update_progress__five_role_impl_20260824(text,jsonb,text,jsonb,integer)',
  'rpc_apply_sheet_sync__source_impl_20260828(text,text,jsonb)',
  'rpc_rollback_vmp_sheet_sync__source_impl_20260828(uuid)',
  'rpc_nguoi_va_quyen__admin_visibility_delegate_20260828()',
  'rpc_preview_item_rights__admin_visibility_delegate_20260828(uuid,text)',
  'rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)',
  'rpc_sync_vmp_sheet_snapshot__source_impl_20260828(text,text,text,jsonb,jsonb)',
  'vmp_exact_active_source_for_item(text)',
  'vmp_enforce_active_plan_source_relation()',
  'vmp_guard_active_source_rekey()',
  'vmp_guard_plan_master_rekey()',
  'vmp_harden_dashboard_object_scope()',
  'vmp_lock_source_plan_relations(text[])',
  'vmp_my_item_rights__five_role_impl_20260824(text)',
  'vmp_reconcile_source_access_trigger()',
  'vmp_reconcile_source_qa_projection(uuid)',
  'vmp_set_item_assignment_unhardened(uuid,text,text,text,text)',
  'vmp_upsert_source_object_before_person_id(text,text,jsonb)'
]::text[]) signature;

insert into expected_source_definer(signature,classification)
select signature,'browser' from unnest(array[
  'rpc_active_rules()','rpc_apply_catalog_change(uuid,text,integer)',
  'rpc_apply_catalog_change_v2(uuid,text,integer,jsonb,boolean)',
  'rpc_catalog_history_detail(uuid)','rpc_catalog_history(jsonb,integer,integer)',
  'rpc_check_data_quality(integer)','rpc_commit_catalog_import(uuid,text)',
  'rpc_create_plan_item(text,text,integer,integer,jsonb)',
  'rpc_dashboard_kpi(integer)','rpc_delete_plan_item(text,text)',
  'rpc_due_alerts(integer,integer)','rpc_generate_timeline(integer,boolean)',
  'rpc_get_missing_items(integer)','rpc_get_vmp_dashboard(integer,boolean,boolean)',
  'rpc_get_vmp_watermark(integer)','rpc_item_assignments(text,uuid)',
  'rpc_item_permission_preflight()','rpc_item_progress_history(text,integer,integer)',
  'rpc_link_item_permission_account(uuid,uuid,text,integer)',
  'rpc_list_catalog_dataset(text,text,jsonb,integer,integer)','rpc_luat_xem()',
  'rpc_nguoi_va_quyen()','rpc_preview_catalog_change(uuid)',
  'rpc_preview_catalog_change_v2(uuid)',
  'rpc_preview_item_rights(uuid,text)','rpc_recalc_criticality(boolean)',
  'rpc_refresh_computed_status()','rpc_resolve_missing(text,text,text)',
  'rpc_save_alert_recipient(uuid,jsonb,text,integer)',
  'rpc_save_catalog_object(text,text,jsonb,text,integer)',
  'rpc_save_product_gmp(text,jsonb,text,integer)',
  'rpc_set_item_assignment(uuid,text,text,text,text,text,uuid)',
  'rpc_set_item_performer_by_id(text,uuid,text)',
  'rpc_set_item_permissions_mode(text,text)','rpc_set_item_state(text,text,text)',
  'rpc_source_warnings(integer)',
  'rpc_stage_catalog_import(text,text,text,text,jsonb)',
  'rpc_trang_thai_he_thong()',
  'rpc_update_progress(text,jsonb,text,jsonb,integer)',
  'rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)',
  'vmp_can_view_my_item(text)','vmp_my_item_rights(text)',
  'rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)',
  'rpc_source_object_facets(text,jsonb)',
  'rpc_export_source_objects(text,text,jsonb,jsonb,integer)',
  'rpc_source_field_suggestions(text,text,text,jsonb,integer)',
  'rpc_list_source_workshop_coverage(text,jsonb,integer)',
  'rpc_source_workshop_scope_choices(text,text,text,jsonb,integer)',
  'rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)',
  'rpc_my_editable_progress_rights()',
  'vmp_can_view_source_object(uuid,uuid)','vmp_can_view_plan_item(uuid,text)'
]::text[]) signature
on conflict(signature) do update set classification=excluded.classification;

update expected_source_definer
set expected_proconfig=array['search_path=public, pg_temp']::text[]
where signature in (
  'audit_plan_item_changes()','rpc_active_rules()',
  'rpc_alert_context(text,integer)','rpc_apply_catalog_change(uuid,text,integer)',
  'rpc_apply_catalog_change_v2(uuid,text,integer,jsonb,boolean)',
  'rpc_apply_catalog_change__five_role_impl_20260824(uuid,text,integer)',
  'vmp_apply_catalog_change_v2_impl(uuid,text,integer,jsonb,boolean)',
  'rpc_apply_sheet_sync(text,text,jsonb)',
  'rpc_catalog_history(jsonb,integer,integer)','rpc_catalog_history_detail(uuid)',
  'rpc_check_data_quality(integer)',
  'rpc_check_data_quality__five_role_impl_20260824(integer)',
  'rpc_cleanup_orphan_source_assignment_resolutions(text)',
  'rpc_commit_catalog_import(uuid,text)',
  'rpc_commit_catalog_import__five_role_impl_20260824(uuid,text)',
  'rpc_create_plan_item(text,text,integer,integer,jsonb)',
  'rpc_dashboard_kpi(integer)','rpc_dashboard_kpi__five_role_impl_20260824(integer)',
  'rpc_delete_plan_item(text,text)','rpc_due_alerts(integer,integer)',
  'rpc_due_alerts__five_role_impl_20260824(integer,integer)',
  'rpc_generate_timeline(integer,boolean)','rpc_get_item_version(text)',
  'rpc_get_missing_items(integer)',
  'rpc_get_missing_items__five_role_impl_20260824(integer)',
  'rpc_get_vmp_dashboard(integer,boolean,boolean)',
  'rpc_get_vmp_dashboard__five_role_impl_20260824(integer,boolean,boolean)',
  'rpc_get_vmp_watermark(integer)',
  'rpc_get_vmp_watermark__five_role_impl_20260824(integer)',
  'rpc_item_assignments(text,uuid)',
  'rpc_item_assignments__five_role_impl_20260824(text,uuid)',
  'rpc_item_permission_preflight()',
  'rpc_item_permission_preflight__five_role_impl_20260824()',
  'rpc_item_progress_history(text,integer,integer)',
  'rpc_item_progress_history__five_role_impl_20260824(text,integer,integer)',
  'rpc_link_item_permission_account(uuid,uuid,text,integer)',
  'rpc_link_item_permission_account__five_role_impl_20260824(uuid,uuid,text,integer)',
  'rpc_list_catalog_dataset(text,text,jsonb,integer,integer)',
  'rpc_list_catalog_dataset__five_role_impl_20260824(text,text,jsonb,integer,integer)',
  'rpc_luat_xem()','rpc_nguoi_va_quyen()',
  'rpc_nguoi_va_quyen__admin_visibility_delegate_20260828()',
  'rpc_preview_catalog_change(uuid)',
  'rpc_preview_catalog_change_v2(uuid)',
  'rpc_preview_catalog_change__five_role_impl_20260824(uuid)',
  'rpc_preview_item_rights(uuid,text)',
  'rpc_preview_item_rights__admin_visibility_delegate_20260828(uuid,text)',
  'rpc_preview_item_rights__five_role_impl_20260824(uuid,text)',
  'rpc_recalc_criticality(boolean)','rpc_reconcile_orphan_objects(text[])',
  'rpc_refresh_computed_status()',
  'rpc_refresh_computed_status__five_role_impl_20260824()',
  'rpc_refresh_source_item_assignments()',
  'rpc_register_alert(text,text,text,text,text,text,text)',
  'rpc_resolve_missing(text,text,text)',
  'rpc_resolve_missing__five_role_impl_20260824(text,text,text)',
  'rpc_resolve_source_item_assignment(uuid,uuid,text)',
  'rpc_rollback_vmp_sheet_sync(uuid)',
  'rpc_save_alert_recipient(uuid,jsonb,text,integer)',
  'rpc_save_alert_recipient__five_role_impl_20260824(uuid,jsonb,text,integer)',
  'rpc_save_catalog_object(text,text,jsonb,text,integer)',
  'rpc_save_catalog_object__five_role_impl_20260824(text,text,jsonb,text,integer)',
  'rpc_save_product_gmp(text,jsonb,text,integer)',
  'rpc_save_product_gmp__five_role_impl_20260824(text,jsonb,text,integer)',
  'rpc_set_item_assignment(uuid,text,text,text,text,text,uuid)',
  'rpc_set_item_assignment__five_role_impl_20260824(uuid,text,text,text,text,text,uuid)',
  'rpc_set_item_performer_by_id(text,uuid,text)',
  'rpc_set_item_performer_by_id__five_role_impl_20260824(text,uuid,text)',
  'rpc_set_item_permissions_mode(text,text)',
  'rpc_set_item_permissions_mode__five_role_impl_20260824(text,text)',
  'rpc_set_item_state(text,text,text)',
  'rpc_set_item_state__five_role_impl_20260824(text,text,text)',
  'rpc_source_warnings(integer)','rpc_stage_catalog_import(text,text,text,text,jsonb)',
  'rpc_stage_catalog_import__five_role_impl_20260824(text,text,text,text,jsonb)',
  'rpc_trang_thai_he_thong()',
  'rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)',
  'rpc_update_progress(text,jsonb,text,jsonb,integer)',
  'rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)',
  'rpc_upsert_source_object(text,text,jsonb)','vmp_allowed_timeline_fields(uuid,text)',
  'vmp_can_view_item(uuid,text)','vmp_can_view_my_item(text)',
  'vmp_enforce_active_plan_source_relation()',
  'vmp_exact_active_source_for_item(text)',
  'vmp_guard_active_source_rekey()',
  'vmp_guard_plan_master_rekey()',
  'vmp_harden_dashboard_object_scope()','vmp_item_rights(uuid,text)',
  'vmp_my_item_rights(text)','vmp_my_item_rights__five_role_impl_20260824(text)',
  'vmp_lock_source_plan_relations(text[])',
  'vmp_set_item_assignment_unhardened(uuid,text,text,text,text)',
  'vmp_sync_item_assignments_from_performer()',
  'vmp_unfiltered_security_definer_item_readers()',
  'vmp_upsert_source_object_before_person_id(text,text,jsonb)',
  'vmp_reconcile_source_access_trigger()',
  'vmp_visible_plan_items()',
  'vmp_item_scope_matches(uuid,text)',
  'vmp_source_workshop_scope_match(uuid,uuid)',
  'rpc_export_source_objects(text,text,jsonb,jsonb,integer)',
  'rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)',
  'rpc_list_source_workshop_coverage(text,jsonb,integer)',
  'rpc_my_editable_progress_rights()',
  'rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)',
  'rpc_source_field_suggestions(text,text,text,jsonb,integer)',
  'rpc_source_object_facets(text,jsonb)',
  'rpc_source_qa_candidates(text,jsonb,integer,uuid[])',
  'rpc_source_workshop_scope_choices(text,text,text,jsonb,integer)',
  'vmp_can_view_plan_item(uuid,text)','vmp_can_view_source_object(uuid,uuid)',
  'vmp_reconcile_source_qa_projection(uuid)'
);

update expected_source_definer
set expected_proconfig=array['search_path=public, pg_temp']::text[]
where signature in (
  'rpc_apply_sheet_sync__source_impl_20260828(text,text,jsonb)',
  'rpc_rollback_vmp_sheet_sync__source_impl_20260828(uuid)'
);

update expected_source_definer
set expected_proconfig=array['search_path=public']::text[]
where signature in (
  'audit_plan_item_changes_v2()','ly_do_khong_sua_duoc(text,uuid)',
  'rpc_active_rules__five_role_impl_20260824()',
  'rpc_ai_cache_doc(text)','rpc_ai_chay_bo_kiem(jsonb)',
  'rpc_ai_context(text,integer,integer)',
  'rpc_ai_context_goc(text,integer,integer)','rpc_ai_context_gon(text,integer)',
  'rpc_ai_do_thuc_the(text,text)','rpc_ai_doc_trang_thai(text,text,integer)',
  'rpc_ai_dung_cau_tra_loi(text,jsonb,integer)',
  'rpc_ai_dung_cau_tra_loi_goc(text,jsonb,integer)',
  'rpc_ai_goi_y_tiep(jsonb,integer)','rpc_ai_hieu_cau_hoi(text)',
  'rpc_ai_ho_so_nguoi(text,integer)','rpc_ai_kiem_mo_ho(text)',
  'rpc_ai_mail_targets(date,boolean)','rpc_ai_muc_luc()',
  'rpc_ai_ngu_canh_nap_san(text,integer)',
  'rpc_ai_ngu_canh_phan_tich(text,text)',
  'rpc_ai_ngu_canh_tam_ly(text,text,integer)','rpc_ai_nho_lai(text,text,integer)',
  'rpc_ai_tam_su(text,jsonb,integer)','rpc_ai_tim_nguoi_mo(text,integer)',
  'rpc_ai_tra_loi_nhanh(text,integer,jsonb,text)',
  'rpc_ai_ve_nguoi_hoi(text,jsonb,integer)','rpc_apply_assignments(boolean)',
  'rpc_create_plan_item__five_role_impl_20260824(text,text,integer,integer,jsonb)',
  'rpc_delete_alert_recipient(uuid)',
  'rpc_delete_plan_item__five_role_impl_20260824(text,text)',
  'rpc_delete_product_gmp(text)','rpc_delete_source_object(text,text,text)',
  'rpc_generate_timeline__five_role_impl_20260824(integer,boolean)',
  'rpc_luat_xem__five_role_impl_20260824()',
  'rpc_nguoi_va_quyen__five_role_impl_20260824()',
  'rpc_recalc_criticality__five_role_impl_20260824(boolean)',
  'rpc_source_warnings__five_role_impl_20260824(integer)',
  'rpc_trang_thai_he_thong__five_role_impl_20260824()',
  'rpc_update_progress__five_role_impl_20260824(text,jsonb,text,jsonb,integer)',
  'rpc_upsert_alert_recipient(uuid,jsonb)','rpc_upsert_product_gmp(text,jsonb)',
  'vmp_ai_dau_van()','vmp_ai_ghi_dem()'
);

update expected_source_definer
set expected_proconfig=array['search_path=public, extensions']::text[]
where signature in (
  'rpc_ai_cham_tra_cuu(text)','rpc_ai_goi_y_chip(text)',
  'rpc_ai_hieu_tu_khoa(text,integer)',
  'rpc_ai_phan_tich_cau_hoi(text,text)','rpc_ai_thong_ke_loc(text,integer)'
);

update expected_source_definer
set expected_proconfig=array['search_path=public, extensions, pg_temp']::text[]
where signature in (
  'rpc_sync_vmp_sheet_snapshot__source_impl_20260828(text,text,text,jsonb,jsonb)',
  'rpc_sync_vmp_sheet_snapshot(text,text,text,jsonb,jsonb)',
  'rpc_sync_vmp_sheet_snapshot_with_extras(text,text,text,jsonb,jsonb)'
);

alter table expected_source_definer
  alter column expected_proconfig set not null;

create temp table public_routine on commit drop as
select procedure.oid,procedure.oid::regprocedure::text signature,
       procedure.proname,procedure.prosecdef,procedure.prosrc,procedure.proacl,
       count(*) over (
         partition by procedure.pronamespace,procedure.proname
       ) overload_count
from pg_proc procedure
join pg_namespace namespace on namespace.oid=procedure.pronamespace
where namespace.nspname='public' and procedure.prokind='f';

create temp table protected_name on commit drop as
select name from protected_relation
union
select relation_name from protected_view_closure;

create temp table protected_routine_root on commit drop as
select distinct routine.*
from public_routine routine
join protected_name protected
  on routine.prosrc ~* ('\m'||protected.name||'\M');

create temp table protected_routine_closure on commit drop as
with recursive closure(oid,signature,proname,prosecdef,prosrc,proacl,
                       overload_count,path,is_direct) as (
  select root.oid,root.signature,root.proname,root.prosecdef,root.prosrc,
         root.proacl,root.overload_count,array[root.oid],true
  from protected_routine_root root
  union all
  select caller.oid,caller.signature,caller.proname,caller.prosecdef,
         caller.prosrc,caller.proacl,caller.overload_count,
         closure.path||caller.oid,false
  from closure
  join public_routine caller
    on closure.overload_count=1
   and caller.prosrc ~*
       ('\m'||closure.proname||'\M[[:space:]]*[(]')
  where not caller.oid=any(closure.path)
)
select oid,signature,prosecdef,proacl,overload_count,bool_or(is_direct) is_direct
from closure
group by oid,signature,prosecdef,proacl,overload_count;

select pg_temp.assert_true(
  not exists (
    select 1 from protected_routine_closure where overload_count<>1
  ),
  'SOURCE_ACCESS_PROTECTED_CALL_GRAPH_HAS_OVERLOAD');

create temp table source_definer_inventory on commit drop as
select oid,signature,proacl,is_direct
from protected_routine_closure
where prosecdef;

select pg_temp.assert_true(
  not exists (
    select signature from source_definer_inventory
    except select signature from expected_source_definer
  ) and not exists (
    select signature from expected_source_definer
    except select signature from source_definer_inventory
  ),
  'SOURCE_ACCESS_EXACT_TRANSITIVE_DEFINER_INVENTORY');

with actual_config as (
  select inventory.signature,procedure.proconfig expected_proconfig
  from source_definer_inventory inventory
  join pg_proc procedure on procedure.oid=inventory.oid
), expected_config as (
  select signature,expected_proconfig from expected_source_definer
)
select pg_temp.assert_true(
  not exists (select * from actual_config except select * from expected_config)
  and not exists (select * from expected_config except select * from actual_config),
  'SOURCE_ACCESS_EXACT_TRANSITIVE_DEFINER_SEARCH_PATH_INVENTORY');

with actual_acl as (
  select inventory.signature,
         case when acl.grantee=0 then 'PUBLIC'
              else acl.grantee::regrole::text end grantee,
         acl.privilege_type,acl.is_grantable
  from source_definer_inventory inventory
  join pg_proc procedure on procedure.oid=inventory.oid
  cross join lateral aclexplode(procedure.proacl) acl
), expected_acl as (
  select expected.signature,grantee,'EXECUTE'::text privilege_type,
         false is_grantable
  from expected_source_definer expected
  cross join lateral unnest(case expected.classification
    when 'browser' then array['postgres','service_role','authenticated']::text[]
    when 'service' then array['postgres','service_role']::text[]
    else array['postgres']::text[] end) grantee
)
select pg_temp.assert_true(
  not exists (select * from actual_acl except select * from expected_acl)
  and not exists (select * from expected_acl except select * from actual_acl)
  and not exists (
    select 1 from source_definer_inventory inventory
    join pg_proc procedure on procedure.oid=inventory.oid
    join pg_roles owner on owner.oid=procedure.proowner
    join expected_source_definer expected using(signature)
    where owner.rolname<>'postgres' or not procedure.prosecdef
  ),
  'SOURCE_ACCESS_EXACT_TRANSITIVE_OWNER_DEFINITION_ACL_CLASSIFICATION');

with expected(signature,language_name,volatility,search_path,definition_hash) as (
  values
    ('rpc_ai_do_thuc_the(text,text)','plpgsql','s',array['search_path=public'],
     'ad2bcd55fa5d1ac04d1acae985dacbdf016d719eccc93b491a3857a8a8ed8dae'),
    ('rpc_ai_hieu_cau_hoi(text)','plpgsql','s',array['search_path=public'],
     '1c5f41020518b3eb0fb48cd087b3709092272e1858c238d6770b34b3196f4cff'),
    ('rpc_ai_hieu_tu_khoa(text,integer)','plpgsql','s',array['search_path=public, extensions'],
     'a68fdaf9c70318d8f6667b1a47f120ee0f661477805c9438f4216a2515726ddd'),
    ('rpc_ai_kiem_mo_ho(text)','plpgsql','s',array['search_path=public'],
     'f002fe06936ccdc6a710fccde39fc2d924b1884f439f89f04394a3f1ec5a9212'),
    ('rpc_ai_ngu_canh_phan_tich(text,text)','sql','s',array['search_path=public'],
     '60c8fc141dda5c16065fc09919d151664613654b51cb21fcb29190daec001c85'),
    ('rpc_ai_thong_ke_loc(text,integer)','plpgsql','s',array['search_path=public, extensions'],
     '1f0f48dceaf8362388ec6247e91045aa8d2f65823b06225a775d4f7c2b3b6c11')
)
select pg_temp.assert_true(
  not exists (
    select 1 from expected
    join pg_proc procedure
      on procedure.oid=to_regprocedure('public.'||expected.signature)
    join pg_language language on language.oid=procedure.prolang
    join pg_roles owner on owner.oid=procedure.proowner
    where owner.rolname<>'postgres' or not procedure.prosecdef
       or language.lanname<>expected.language_name
       or procedure.provolatile<>expected.volatility
       or procedure.proconfig is distinct from expected.search_path
       or encode(extensions.digest(convert_to(
            pg_get_functiondef(procedure.oid),'UTF8'),'sha256'),'hex')<>
          expected.definition_hash
  ),
  'SOURCE_ACCESS_EXACT_VIEW_BACKED_DEFINER_DEFINITIONS');

with expected_private(signature,language_name,volatility,classification,
                      required_definition) as (
  values
    ('vmp_can_manage_source_qa_assignment(uuid)','sql','s','service',
     '\mmanage_qa_assignment\M'),
    ('vmp_can_manage_source_workshop_scope(uuid)','sql','s','service',
     '\mmanage_workshop_scope\M'),
    ('vmp_source_workshop_scope_match(uuid,uuid)','sql','s','service',
     '\mvmp_source_workshop_scope_grants\M'),
    ('vmp_item_scope_matches(uuid,text)','sql','s','service',
     '\mvmp_exact_active_source_for_item\M'),
    ('vmp_exact_active_source_for_item(text)','sql','s','owner',
     '\mvmp_objects\M'),
    ('vmp_enforce_active_plan_source_relation()','plpgsql','v','owner',
     '\mSOURCE_ACCESS_ACTIVE_ITEM_REQUIRES_EXACT_SOURCE\M'),
    ('vmp_guard_active_source_rekey()','plpgsql','v','owner',
     '\mSOURCE_ACCESS_ACTIVE_SOURCE_HAS_ACTIVE_ITEMS\M'),
    ('vmp_guard_plan_master_rekey()','plpgsql','v','owner',
     '\mSOURCE_ACCESS_MASTER_OBJECT_HAS_ACTIVE_ITEMS\M'),
    ('vmp_lock_source_plan_relations(text[])','plpgsql','v','owner',
     '\mfor key share of source_object,master_object\M'),
    ('vmp_reconcile_source_access_trigger()','plpgsql','v','owner',
     '\mvmp_reconcile_source_qa_projection\M'),
    ('vmp_strip_catalog_pending_access_fields()','plpgsql','v','owner',
     '\mowner_person_id\M'),
    ('vmp_touch_authorization_revision()','plpgsql','v','owner',
     '\mvmp_authorization_revision\M'),
    ('vmp_current_actor_can_manage_source_qa_assignment()','sql','s','browser',
     '\mvmp_can_manage_source_qa_assignment\M'),
    ('vmp_current_actor_can_manage_source_workshop_scope()','sql','s','browser',
     '\mvmp_can_manage_source_workshop_scope\M'),
    ('vmp_current_actor_is_active()','sql','s','browser',
     '\mvmp_is_active_session\M')
), actual_private as (
  select expected.*,procedure.oid,owner.rolname owner_name,
         language.lanname actual_language,procedure.provolatile actual_volatility,
         procedure.prosecdef,procedure.proconfig,
         pg_get_functiondef(procedure.oid) definition
  from expected_private expected
  join pg_proc procedure
    on procedure.oid=to_regprocedure('public.'||expected.signature)
  join pg_roles owner on owner.oid=procedure.proowner
  join pg_language language on language.oid=procedure.prolang
), actual_acl as (
  select private.signature,
         case when acl.grantee=0 then 'PUBLIC'
              else acl.grantee::regrole::text end grantee,
         acl.privilege_type,acl.is_grantable
  from actual_private private
  join pg_proc procedure on procedure.oid=private.oid
  cross join lateral aclexplode(procedure.proacl) acl
), expected_acl as (
  select expected.signature,grantee,'EXECUTE'::text privilege_type,false is_grantable
  from expected_private expected
  cross join lateral unnest(case expected.classification
    when 'browser' then array['postgres','service_role','authenticated']::text[]
    when 'service' then array['postgres','service_role']::text[]
    else array['postgres']::text[] end) grantee
)
select pg_temp.assert_true(
  (select count(*) from actual_private)=15
  and not exists (
    select 1 from actual_private
    where owner_name<>'postgres' or actual_language<>language_name
       or actual_volatility<>volatility or not prosecdef
       or proconfig is distinct from array['search_path=public, pg_temp']
       or definition !~ required_definition
  )
  and not exists (select * from actual_acl except select * from expected_acl)
  and not exists (select * from expected_acl except select * from actual_acl),
  'SOURCE_ACCESS_EXACT_PRIVATE_HELPER_DEFINITION_ACL_CLASSIFICATION');

with expected_writer(signature,required_definition) as (
  values
    ('rpc_apply_catalog_change(uuid,text,integer)',
     '\mvmp_lock_source_plan_relations\M'),
    ('rpc_apply_catalog_change_v2(uuid,text,integer,jsonb,boolean)',
     '\mvmp_lock_source_plan_relations\M'),
    ('rpc_generate_timeline(integer,boolean)',
     '\mvmp_lock_source_plan_relations\M'),
    ('rpc_create_plan_item(text,text,integer,integer,jsonb)',
     '\mvmp_lock_source_plan_relations\M'),
    ('rpc_commit_catalog_import(uuid,text)',
     '\mvmp_lock_source_plan_relations\M'),
    ('rpc_delete_plan_item(text,text)',
     '\mvmp_lock_source_plan_relations\M'),
    ('rpc_set_item_state(text,text,text)',
     '\mvmp_lock_source_plan_relations\M'),
    ('rpc_resolve_missing(text,text,text)',
     '\mvmp_lock_source_plan_relations\M'),
    ('rpc_apply_sheet_sync(text,text,jsonb)',
     '\mvmp_lock_source_plan_relations\M'),
    ('rpc_sync_vmp_sheet_snapshot(text,text,text,jsonb,jsonb)',
     '\mvmp_lock_source_plan_relations\M'),
    ('rpc_rollback_vmp_sheet_sync(uuid)',
     '\mvmp_lock_source_plan_relations\M'),
    ('rpc_save_catalog_object__five_role_impl_20260824(text,text,jsonb,text,integer)',
     '\mlock table public.vmp_source_objects in row exclusive mode\M'),
    ('rpc_sync_vmp_sheet_snapshot_with_extras(text,text,text,jsonb,jsonb)',
     '\mrpc_sync_vmp_sheet_snapshot\M')
), actual_writer as (
  select expected.*,procedure.oid,
         pg_get_functiondef(procedure.oid) definition
  from expected_writer expected
  join pg_proc procedure
    on procedure.oid=to_regprocedure('public.'||expected.signature)
)
select pg_temp.assert_true(
  (select count(*) from actual_writer)=13
  and not exists (
    select 1 from actual_writer
    where definition !~ required_definition
  ),
  'SOURCE_ACCESS_RELATION_WRITERS_PRELOCK_SOURCE_BEFORE_PLAN');

with expected_trigger(relation_name,trigger_name,function_signature) as (
  values
    ('vmp_plan_items','vmp_plan_items_active_source_guard',
     'vmp_enforce_active_plan_source_relation()'),
    ('vmp_source_objects','vmp_source_objects_active_relation_guard',
     'vmp_guard_active_source_rekey()'),
    ('vmp_source_objects','vmp_source_objects_active_delete_guard',
     'vmp_guard_active_source_rekey()'),
    ('vmp_source_objects','vmp_source_objects_access_insert_projection',
     'vmp_reconcile_source_access_trigger()'),
    ('vmp_source_objects','vmp_source_objects_access_projection',
     'vmp_reconcile_source_access_trigger()'),
    ('vmp_objects','vmp_objects_source_relation_update_guard',
     'vmp_guard_plan_master_rekey()'),
    ('vmp_objects','vmp_objects_source_relation_delete_guard',
     'vmp_guard_plan_master_rekey()')
), actual_trigger as (
  select expected.*,trigger_row.tgenabled,
         trigger_row.tgfoid::regprocedure::text actual_function,
         pg_get_triggerdef(trigger_row.oid) definition
  from expected_trigger expected
  join pg_class relation on relation.relname=expected.relation_name
  join pg_namespace namespace on namespace.oid=relation.relnamespace
    and namespace.nspname='public'
  join pg_trigger trigger_row on trigger_row.tgrelid=relation.oid
    and trigger_row.tgname=expected.trigger_name
    and not trigger_row.tgisinternal
)
select pg_temp.assert_true(
  (select count(*) from actual_trigger)=7
  and not exists (
    select 1 from actual_trigger
    where tgenabled<>'O' or actual_function<>function_signature
       or definition !~ ('EXECUTE FUNCTION '||
                          replace(replace(function_signature,'(','\('),
                                  ')','\)'))
  )
  and (select definition from actual_trigger
       where trigger_name='vmp_source_objects_access_insert_projection')
        ~ '\mnew.is_active IS TRUE\M'
  and (select definition from actual_trigger
       where trigger_name='vmp_source_objects_access_projection')
        ~ 'UPDATE OF owner_person_id, support_person_id, is_active'
  and (select definition from actual_trigger
       where trigger_name='vmp_source_objects_access_projection')
        ~ '\mold.is_active IS DISTINCT FROM true\M',
  'SOURCE_ACCESS_RELATION_TRIGGER_EXACT_RELATION_FUNCTION_ENABLED');

select pg_temp.assert_true(
  (select owner.rolname='postgres' and language.lanname='sql'
          and procedure.provolatile='i' and not procedure.prosecdef
          and procedure.proconfig is not distinct from
              array['search_path=pg_catalog']::text[]
          and procedure.proacl::text=
              '{postgres=X/postgres,service_role=X/postgres}'
   from pg_proc procedure
   join pg_roles owner on owner.oid=procedure.proowner
   join pg_language language on language.oid=procedure.prolang
   where procedure.oid=
     'public.vmp_catalog_timeline_fields()'::regprocedure)
  and public.vmp_catalog_timeline_fields()=array[
    'frequency_months','first_month','report_class','workdays',
    'validate_flag','is_active'
  ]::text[]
  and pg_get_functiondef(
    'public.vmp_can_view_source_object(uuid,uuid)'::regprocedure
  )~'p_uid is not distinct from auth.uid\(\)',
  'SOURCE_ACCESS_EXACT_TIMELINE_FIELDS_AND_ALTERNATE_UID_DEFENSE');

select pg_temp.assert_true(
  to_regprocedure('public.vmp_unfiltered_security_definer_item_readers()') is not null
  and pg_get_functiondef(
    'public.vmp_unfiltered_security_definer_item_readers()'::regprocedure
  ) ~* '\mvmp_source_objects\M'
  and pg_get_functiondef(
    'public.vmp_unfiltered_security_definer_item_readers()'::regprocedure
  ) ~* '\mvmp_plan_items\M'
  and pg_get_functiondef(
    'public.vmp_unfiltered_security_definer_item_readers()'::regprocedure
  ) ~* '\mvmp_item_assignments\M'
  and not exists (
    select 1 from public.vmp_unfiltered_security_definer_item_readers()
  ),
  'SOURCE_ACCESS_SECURITY_DEFINER_INVENTORY_HAS_UNREVIEWED_READER');

-- The generated inventory must not allow a new reader to self-classify merely
-- by calling an approved visibility helper. This transaction-local canary
-- proves the reader still appears in the unreviewed result until an explicit
-- signature/reason is added to the migration allowlist.
create function public.vmp_source_reader_inventory_canary()
returns integer
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select count(*)::integer
  from public.vmp_plan_items item
  where public.vmp_can_view_item(auth.uid(),item.validation_code)
$function$;

select pg_temp.assert_true(
  pg_get_functiondef(
    'public.vmp_unfiltered_security_definer_item_readers()'::regprocedure
  ) !~* 'not ilike ''%vmp_can_view_item%'''
  and pg_get_functiondef(
    'public.vmp_unfiltered_security_definer_item_readers()'::regprocedure
  ) !~* 'not ilike ''%vmp_visible_plan_items%'''
  and exists (
    select 1 from public.vmp_unfiltered_security_definer_item_readers()
    where signature='vmp_source_reader_inventory_canary()'
  ),
  'SOURCE_ACCESS_SECURITY_DEFINER_INVENTORY_HELPER_BYPASS');

drop function public.vmp_source_reader_inventory_canary();

create temp table expected_protected_policy(
  relation_name text primary key,policy_name text not null,command "char" not null,
  permissive boolean not null,roles text[] not null,
  using_expression text not null,check_expression text
) on commit drop;
insert into expected_protected_policy values
  ('vmp_source_objects','source_objects_authorized_select','r',true,
   array['authenticated'],
   'vmp_can_view_source_object(auth.uid(), id)',null),
  ('vmp_plan_items','plan_items_authorized_select','r',true,
   array['authenticated'],
   'vmp_can_view_plan_item(auth.uid(), validation_code)',null),
  ('vmp_source_workshop_scope_grants',
   'source_workshop_scope_grants_manager_or_self_select','r',true,
   array['authenticated'],
   $grant_policy$(vmp_current_actor_can_manage_source_workshop_scope() OR (vmp_current_actor_is_active() AND (EXISTS ( SELECT 1
   FROM vmp_performers performer
  WHERE ((performer.id = vmp_source_workshop_scope_grants.performer_id) AND (performer.user_id = auth.uid()) AND performer.is_active)))))$grant_policy$,
   null),
  ('vmp_item_assignments','item_assignments_manager_or_self_select','r',true,
   array['authenticated'],
   $assignment_policy$(vmp_current_actor_can_manage_source_qa_assignment() OR (vmp_current_actor_is_active() AND (EXISTS ( SELECT 1
   FROM vmp_performers performer
  WHERE ((performer.id = vmp_item_assignments.performer_id) AND (performer.user_id = auth.uid()) AND performer.is_active)))))$assignment_policy$,
   null);

with actual_policy as (
  select relation.relname relation_name,policy.polname policy_name,
         policy.polcmd command,policy.polpermissive permissive,
         (select array_agg(role.rolname order by role.rolname)
          from unnest(policy.polroles) role_oid
          join pg_roles role on role.oid=role_oid) roles,
         pg_get_expr(policy.polqual,policy.polrelid) using_expression,
         pg_get_expr(policy.polwithcheck,policy.polrelid) check_expression
  from pg_policy policy
  join pg_class relation on relation.oid=policy.polrelid
  join pg_namespace namespace on namespace.oid=relation.relnamespace
  where namespace.nspname='public'
    and relation.relname in (
      'vmp_source_objects','vmp_plan_items',
      'vmp_source_workshop_scope_grants','vmp_item_assignments'
    )
)
select pg_temp.assert_true(
  not exists (select * from actual_policy except select * from expected_protected_policy)
  and not exists (select * from expected_protected_policy except select * from actual_policy)
  and not exists (
    select 1 from pg_class relation
    join pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public'
      and relation.relname in (
        'vmp_source_objects','vmp_plan_items',
        'vmp_source_workshop_scope_grants','vmp_item_assignments'
      ) and (not relation.relrowsecurity or relation.relforcerowsecurity)
  ),
  'SOURCE_ACCESS_EXACT_SOURCE_ITEM_GRANT_ASSIGNMENT_RLS_INVENTORY');

with expected_policy(relation_name,policy_name) as (
  values
    ('vmp_products_gmp','products_gmp_manager_select'),
    ('vmp_alert_recipients','alert_recipients_manager_select')
), actual_policy as (
  select relation.relname relation_name,policy.polname policy_name,
         policy.polcmd,policy.polpermissive,policy.polroles,
         pg_get_expr(policy.polqual,policy.polrelid) using_expression,
         pg_get_expr(policy.polwithcheck,policy.polrelid) check_expression
  from pg_policy policy
  join pg_class relation on relation.oid=policy.polrelid
  join pg_namespace namespace on namespace.oid=relation.relnamespace
  where namespace.nspname='public'
    and relation.relname in ('vmp_products_gmp','vmp_alert_recipients')
)
select pg_temp.assert_true(
  not exists (select relation_name,policy_name from actual_policy
              except select * from expected_policy)
  and not exists (select * from expected_policy
                  except select relation_name,policy_name from actual_policy)
  and not exists (
    select 1 from actual_policy
    where polcmd<>'r' or not polpermissive
       or polroles<>array[(select oid from pg_roles where rolname='authenticated')]
       or using_expression<>'vmp_current_actor_can_manage_source_qa_assignment()'
       or check_expression is not null
  )
  and not exists (
    select 1 from pg_class relation
    join pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public'
      and relation.relname in ('vmp_products_gmp','vmp_alert_recipients')
      and (not relation.relrowsecurity or relation.relforcerowsecurity)
  ),
  'SOURCE_ACCESS_EXACT_PRODUCTS_ALERTS_MANAGER_RLS');

select pg_temp.assert_true(
  not has_table_privilege('authenticated','public.vmp_source_objects','INSERT,UPDATE,DELETE')
  and not has_any_column_privilege('authenticated','public.vmp_source_objects','UPDATE')
  and not has_table_privilege('authenticated','public.vmp_plan_items','INSERT,UPDATE,DELETE')
  and not has_any_column_privilege('authenticated','public.vmp_plan_items','UPDATE')
  and not has_table_privilege('authenticated','public.vmp_item_assignments','INSERT,UPDATE,DELETE')
  and not has_any_column_privilege('authenticated','public.vmp_item_assignments','UPDATE')
  and not has_table_privilege('authenticated','public.vmp_source_workshop_scope_grants','INSERT,UPDATE,DELETE')
  and not has_any_column_privilege('authenticated','public.vmp_source_workshop_scope_grants','UPDATE')
  and not has_table_privilege('authenticated','public.profiles','INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','public.vmp_performers','INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','public.vmp_products_gmp','INSERT,UPDATE,DELETE')
  and not has_any_column_privilege('authenticated','public.vmp_products_gmp','UPDATE')
  and not has_table_privilege('authenticated','public.vmp_alert_recipients','INSERT,UPDATE,DELETE')
  and not has_any_column_privilege('authenticated','public.vmp_alert_recipients','UPDATE'),
  'SOURCE_ACCESS_NO_DIRECT_AUTHENTICATED_MUTATION');

insert into auth.users(
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
values
  ('9a020000-0000-4000-8000-000000000001','authenticated','authenticated',
   'source-security-qa@example.test','x',now(),'{}','{}',now(),now()),
  ('9a020000-0000-4000-8000-000000000002','authenticated','authenticated',
   'source-security-workshop@example.test','x',now(),'{}','{}',now(),now()),
  ('9a020000-0000-4000-8000-000000000003','authenticated','authenticated',
   'source-security-unrelated@example.test','x',now(),'{}','{}',now(),now()),
  ('9a020000-0000-4000-8000-000000000004','authenticated','authenticated',
   'source-security-manager@example.test','x',now(),'{}','{}',now(),now()),
  ('9a020000-0000-4000-8000-000000000005','authenticated','authenticated',
   'source-security-inactive@example.test','x',now(),'{}','{}',now(),now());

insert into public.departments(id,name,short_name)
values ('QA','Source security QA fixture','QA'),
       ('SSEC_WS','Source security workshop fixture','SSW'),
       ('FILTER_CONTRACT','Source server filter fixture','SFC'),
       ('FILTER_SCOPE','Source scope choice fixture','SFS')
on conflict(id) do nothing;

insert into public.profiles(id,full_name,email,role,department,is_active)
values
  ('9a020000-0000-4000-8000-000000000001','Source Security QA',
   'source-security-qa@example.test','department_user','QA',true),
  ('9a020000-0000-4000-8000-000000000002','Source Security Workshop',
   'source-security-workshop@example.test','department_user','SSEC_WS',true),
  ('9a020000-0000-4000-8000-000000000003','Source Security Unrelated',
   'source-security-unrelated@example.test','department_user','SSEC_WS',true),
  ('9a020000-0000-4000-8000-000000000004','Source Security Manager',
   'source-security-manager@example.test','qa_manager','QA',true),
  ('9a020000-0000-4000-8000-000000000005','Source Security Inactive QA',
   'source-security-inactive@example.test','qa_manager','QA',true);

update public.vmp_performers
set department=case when user_id in (
                      '9a020000-0000-4000-8000-000000000001'::uuid,
                      '9a020000-0000-4000-8000-000000000004'::uuid
                    )
                    then 'QA' else 'SSEC_WS' end,
    access_class=case
      when user_id='9a020000-0000-4000-8000-000000000001'::uuid
        then 'qa_progress_editor'
      when user_id='9a020000-0000-4000-8000-000000000004'::uuid
        then 'qa_manager'
      else 'workshop_staff' end,
    is_active=true
where user_id in (
  '9a020000-0000-4000-8000-000000000001'::uuid,
  '9a020000-0000-4000-8000-000000000002'::uuid,
  '9a020000-0000-4000-8000-000000000003'::uuid,
  '9a020000-0000-4000-8000-000000000004'::uuid
);

update public.vmp_performers
set id='9a020000-0000-4000-8000-000000000139',
    is_active=false,department='QA',access_class='qa_manager'
where user_id='9a020000-0000-4000-8000-000000000005'::uuid;

-- Duplicate display names must never influence dashboard identity. The
-- canonical owner's unusable local address makes any returned email proof that
-- the reader selected the unrelated performer by name.
update public.vmp_performers
set email='source-security-qa.local'
where user_id='9a020000-0000-4000-8000-000000000001'::uuid;
update public.vmp_performers
set performer_name='Source Security QA'
where user_id='9a020000-0000-4000-8000-000000000003'::uuid;

insert into public.vmp_objects(
  code,name,classification,department,area,line,frequency_months
)
values (
  'SSEC-DENIED','Source security RLS denied row','tb','SSEC_WS',
  'SSEC_DENIED_AREA','SSEC_DENIED_LINE',12
),(
  'SSEC-QA-ALLOWED','Source security QA allowed row','tb','QA',
  'SSEC_QA_AREA','SSEC_QA_LINE',12
),(
  'SSEC-WS-ALLOWED','Source security workshop allowed row','tb','SSEC_WS',
  'SSEC_WS_AREA','SSEC_WS_LINE',12
),(
  'FILTER-CONTRACT-A','Server filter contract A','tb','FILTER_CONTRACT',
  'FILTER_AREA_A','FILTER_LINE_A',12
),(
  'FILTER-CONTRACT-B','Server filter contract B','tb','FILTER_CONTRACT',
  'FILTER_AREA_B','FILTER_LINE_B',24
),(
  'FILTER-SCOPE-BLANK','Server scope blank line','tb','FILTER_SCOPE',
  'FILTER_SCOPE_AREA',null,12
),(
  'FILTER-SCOPE-SPACE','Server scope whitespace line','tb','FILTER_SCOPE',
  'FILTER_SCOPE_AREA',null,12
),(
  'FILTER-SCOPE-LINE','Server scope named line','tb','FILTER_SCOPE',
  'FILTER_SCOPE_AREA','FILTER_SCOPE_LINE',12
);
insert into public.vmp_source_objects(
  id,object_kind,object_code,object_name,department,area_code,line,
  validate_flag,frequency_months,report_class,workdays,first_month,year_ref,
  source_tab,source_row,version,timeline_revision,timeline_applied_revision
)
values (
  '9a020000-0000-4000-8000-000000000110','Thiết bị','SSEC-DENIED',
  'Source security RLS denied row','SSEC_WS','SSEC_DENIED_AREA',
  'SSEC_DENIED_LINE','y',12,'Hóa lý',5,null,2026,
  'source-access-security',92110,1,0,0
);
insert into public.vmp_source_objects(
  id,object_kind,object_code,object_name,department,area_code,line,
  validate_flag,frequency_months,report_class,workdays,first_month,year_ref,
  source_tab,source_row,version,timeline_revision,timeline_applied_revision,
  owner_person_id,owner_name
)
select '9a020000-0000-4000-8000-000000000120','Thiết bị','SSEC-QA-ALLOWED',
       'Source security QA allowed row','QA','SSEC_QA_AREA','SSEC_QA_LINE',
       'y',12,'Hóa lý',5,null,2026,'source-access-security',92120,1,0,0,
       performer.id,performer.performer_name
from public.vmp_performers performer
where performer.user_id='9a020000-0000-4000-8000-000000000001'::uuid;
insert into public.vmp_source_objects(
  id,object_kind,object_code,object_name,department,area_code,line,
  validate_flag,frequency_months,report_class,workdays,first_month,year_ref,
  source_tab,source_row,version,timeline_revision,timeline_applied_revision
)
values (
  '9a020000-0000-4000-8000-000000000121','Thiết bị','SSEC-WS-ALLOWED',
  'Source security workshop allowed row','SSEC_WS','SSEC_WS_AREA',
  'SSEC_WS_LINE','y',12,'Hóa lý',5,null,2026,
  'source-access-security',92121,1,0,0
);
insert into public.vmp_source_objects(
  id,object_kind,object_code,object_name,department,area_code,line,
  validate_flag,frequency_months,report_class,workdays,first_month,year_ref,
  source_tab,source_row,version,timeline_revision,timeline_applied_revision,
  owner_person_id,owner_name,work_group,note
)
select '9a020000-0000-4000-8000-000000000130','Thiết bị','FILTER-CONTRACT-A',
       'Server filter contract A','FILTER_CONTRACT','FILTER_AREA_A',
       'FILTER_LINE_A','y',12,'Hóa lý',5,null,2026,
       'source-access-security',92130,1,0,0,performer.id,
       performer.performer_name,'FILTER_GROUP_ALPHA','FILTER_NOTE_NEEDLE'
from public.vmp_performers performer
where performer.user_id='9a020000-0000-4000-8000-000000000004'::uuid;
insert into public.vmp_source_objects(
  id,object_kind,object_code,object_name,department,area_code,line,
  validate_flag,frequency_months,report_class,workdays,first_month,year_ref,
  source_tab,source_row,version,timeline_revision,timeline_applied_revision,
  work_group,note
)
values (
  '9a020000-0000-4000-8000-000000000131','Thiết bị','FILTER-CONTRACT-B',
  'Server filter contract B','FILTER_CONTRACT','FILTER_AREA_B',
  'FILTER_LINE_B','n',24,'Hóa lý',5,3,2026,
  'source-access-security',92131,1,0,0,'FILTER_GROUP_BETA','FILTER_NOTE_OTHER'
);
insert into public.vmp_source_objects(
  id,object_kind,object_code,object_name,department,area_code,line,
  validate_flag,frequency_months,report_class,workdays,first_month,year_ref,
  source_tab,source_row,version,timeline_revision,timeline_applied_revision
)
values
  ('9a020000-0000-4000-8000-000000000132','Thiết bị',
   'FILTER-SCOPE-BLANK','Server scope blank line','FILTER_SCOPE',
   'FILTER_SCOPE_AREA','','n',12,'Hóa lý',5,null,2026,
   'source-access-security',92132,1,0,0),
  ('9a020000-0000-4000-8000-000000000133','Thiết bị',
   'FILTER-SCOPE-SPACE','Server scope whitespace line','FILTER_SCOPE',
   'FILTER_SCOPE_AREA','   ','n',12,'Hóa lý',5,null,2026,
   'source-access-security',92133,1,0,0),
  ('9a020000-0000-4000-8000-000000000134','Thiết bị',
   'FILTER-SCOPE-LINE','Server scope named line','FILTER_SCOPE',
   'FILTER_SCOPE_AREA','FILTER_SCOPE_LINE','n',12,'Hóa lý',5,null,2026,
   'source-access-security',92134,1,0,0);
insert into public.vmp_plan_items(
  id,validation_code,object_code,validation_type,year,report_class,effort_days,
  deadline_protocol,deadline_validation,deadline_report,deadline_vmp,
  status_protocol,status_validation,status_report,status_vmp,is_active,
  item_state,version,departments,execution_departments,source_sheet_data
)
values (
  'SSEC-DENIED/2026.01-PQ','SSEC-DENIED/2026.01-PQ','SSEC-DENIED','PQ',
  2026,'Hóa lý',5,current_date+30,current_date+60,current_date+90,
  current_date+120,'not_started','not_started','not_started','not_started',
  true,'active',1,array['SSEC_WS'],array['SSEC_WS'],
  '{"fixture":"source-access-security"}'::jsonb
);
insert into public.vmp_plan_items(
  id,validation_code,object_code,validation_type,year,report_class,effort_days,
  deadline_protocol,deadline_validation,deadline_report,deadline_vmp,
  status_protocol,status_validation,status_report,status_vmp,is_active,
  item_state,version,departments,execution_departments,source_sheet_data,
  owner_person_id,owner_name
)
select fixture.validation_code,fixture.validation_code,fixture.object_code,'PQ',
       2026,'Hóa lý',5,current_date+30,current_date+60,current_date+90,
       current_date+120,'not_started','not_started','not_started','not_started',
       true,'active',1,array[fixture.department],array[fixture.department],
       '{"fixture":"source-access-security-visible"}'::jsonb,
       source_object.owner_person_id,source_object.owner_name
from (values
  ('SSEC-QA-ALLOWED/2026.01-PQ','SSEC-QA-ALLOWED','QA'),
  ('SSEC-WS-ALLOWED/2026.01-PQ','SSEC-WS-ALLOWED','SSEC_WS')
) fixture(validation_code,object_code,department)
join public.vmp_source_objects source_object
  on source_object.object_code=fixture.object_code and source_object.is_active;
insert into public.vmp_source_workshop_scope_grants(
  id,performer_id,department,department_key,area_code,area_key,line,line_key,
  valid_from,expires_at,is_active,version,change_reason
)
select '9a020000-0000-4000-8000-000000000111',performer.id,
       'SSEC_WS',public.vmp_source_scope_key('SSEC_WS'),
       'SSEC_OTHER_AREA',public.vmp_source_scope_key('SSEC_OTHER_AREA'),null,null,
       transaction_timestamp(),null,true,1,'Unrelated RLS grant fixture'
from public.vmp_performers performer
where performer.user_id='9a020000-0000-4000-8000-000000000003'::uuid;
insert into public.vmp_source_workshop_scope_grants(
  id,performer_id,department,department_key,area_code,area_key,line,line_key,
  valid_from,expires_at,is_active,version,change_reason
)
select '9a020000-0000-4000-8000-000000000112',performer.id,
       'SSEC_WS',public.vmp_source_scope_key('SSEC_WS'),
       'SSEC_WS_AREA',public.vmp_source_scope_key('SSEC_WS_AREA'),null,null,
       transaction_timestamp(),null,true,1,'Workshop visible-set fixture'
from public.vmp_performers performer
where performer.user_id='9a020000-0000-4000-8000-000000000002'::uuid;
insert into public.vmp_item_assignments(
  validation_code,performer_id,user_id,staff_name,assignment_kind,source,
  assignment_role,is_active,change_reason
)
select 'SSEC-DENIED/2026.01-PQ',performer.id,performer.user_id,
       performer.performer_name,'equipment_department','equipment_manager',
       null,true,'Unrelated RLS assignment fixture'
from public.vmp_performers performer
where performer.user_id='9a020000-0000-4000-8000-000000000003'::uuid;

insert into public.vmp_products_gmp(id,bfo_code,product_name,source_row)
values ('9a020000-0000-4000-8000-000000000101',
        'SSEC-PRODUCT','Source security protected product',90201);
insert into public.vmp_alert_recipients(id,email,recipient_name)
values ('9a020000-0000-4000-8000-000000000102',
        'source-security-alert@example.test','Source security protected alert');

create function pg_temp.assert_protected_non_source_tables_hidden(p_persona text)
returns void language plpgsql security invoker as $$
begin
  if (select count(*) from public.vmp_products_gmp
      where id='9a020000-0000-4000-8000-000000000101')<>0
     or (select count(*) from public.vmp_alert_recipients
         where id='9a020000-0000-4000-8000-000000000102')<>0 then
    raise exception using errcode='check_violation',
      message=p_persona||'_DIRECT_PRODUCTS_ALERTS_RLS_DENIED';
  end if;
end
$$;

create function pg_temp.assert_protected_source_rows_hidden(p_persona text)
returns void language plpgsql security invoker as $$
begin
  if (select count(*) from public.vmp_source_objects
      where id='9a020000-0000-4000-8000-000000000110')<>0
     or (select count(*) from public.vmp_plan_items
         where validation_code='SSEC-DENIED/2026.01-PQ')<>0
     or (select count(*) from public.vmp_source_workshop_scope_grants
         where id='9a020000-0000-4000-8000-000000000111')<>0
     or (select count(*) from public.vmp_item_assignments
         where validation_code='SSEC-DENIED/2026.01-PQ')<>0 then
    raise exception using errcode='check_violation',
      message=p_persona||'_DIRECT_SOURCE_ITEM_GRANT_ASSIGNMENT_RLS_DENIED';
  end if;
end
$$;

create function pg_temp.assert_manager_surfaces_forbidden(p_persona text)
returns void language plpgsql security invoker as $$
begin
  perform pg_temp.assert_forbidden(
    public.rpc_list_catalog_dataset('products',null,'{}'::jsonb,1,0),
    p_persona||'_PRODUCTS_FORBIDDEN');
  perform pg_temp.assert_forbidden(
    public.rpc_list_catalog_dataset('alerts',null,'{}'::jsonb,1,0),
    p_persona||'_ALERTS_FORBIDDEN');
  perform pg_temp.assert_forbidden(
    public.rpc_stage_catalog_import(
      'objects','source-access-v1','source-access-fingerprint',null,'[]'::jsonb),
    p_persona||'_IMPORT_FORBIDDEN');
  perform pg_temp.assert_forbidden(
    public.rpc_list_catalog_changes('Thiết bị',null,1,0),
    p_persona||'_PENDING_FORBIDDEN');
  perform pg_temp.assert_forbidden(
    public.rpc_catalog_history('{}'::jsonb,1,0),
    p_persona||'_HISTORY_FORBIDDEN');
  perform pg_temp.assert_forbidden(
    public.rpc_source_field_suggestions(
      'Thiết bị','department','',null,10),
    p_persona||'_SOURCE_SUGGESTIONS_FORBIDDEN');
  perform pg_temp.assert_forbidden(
    public.rpc_source_qa_candidates('',null,10,'{}'::uuid[]),
    p_persona||'_SOURCE_QA_CANDIDATES_FORBIDDEN');
  perform pg_temp.assert_forbidden(
    public.rpc_list_source_workshop_coverage('',null,10),
    p_persona||'_SOURCE_COVERAGE_DIRECTORY_FORBIDDEN');
  perform pg_temp.assert_forbidden(
    public.rpc_source_workshop_scope_choices(null,null,null,null,10),
    p_persona||'_SOURCE_SCOPE_CHOICES_FORBIDDEN');
end
$$;

create function pg_temp.assert_visible_source_surfaces(
  p_user_id uuid,p_allowed_code text,p_allowed_scope_marker text,p_rule_id text
)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_list jsonb;
  v_facets jsonb;
  v_export jsonb;
  v_dashboard jsonb;
  v_watermark jsonb;
  v_warnings jsonb;
begin
  perform set_config('request.jwt.claims',json_build_object(
    'sub',p_user_id,'role','authenticated')::text,true);

  v_list:=public.rpc_list_source_objects(
    'Thiết bị','SSEC','{}'::jsonb,null,100,false,null);
  v_facets:=public.rpc_source_object_facets('Thiết bị','{}'::jsonb);
  v_export:=public.rpc_export_source_objects(
    'Thiết bị','SSEC','{}'::jsonb,null,100);
  v_dashboard:=public.rpc_get_vmp_dashboard(2026,false,false);
  v_watermark:=public.rpc_get_vmp_watermark(2026);
  v_warnings:=public.rpc_source_warnings(2026);

  if v_list->>'ok' is distinct from 'true'
     or jsonb_array_length(v_list->'rows')<>1
     or v_list#>>'{rows,0,object_code}' is distinct from p_allowed_code
     or v_list->>'authorized_total' is distinct from '1'
     or v_list::text like '%SSEC-DENIED%'
     or v_facets->>'ok' is distinct from 'true'
     or v_facets::text not like '%'||p_allowed_scope_marker||'%'
     or v_facets::text like '%SSEC_DENIED_AREA%'
     or v_export->>'ok' is distinct from 'true'
     or jsonb_array_length(v_export->'rows')<>1
     or v_export#>>'{rows,0,object_code}' is distinct from p_allowed_code
     or v_export::text like '%SSEC-DENIED%'
     or v_dashboard::text not like '%'||p_allowed_code||'%'
     or v_dashboard::text like '%SSEC-DENIED%'
     or jsonb_array_length(v_dashboard->'objects')<>1
     or jsonb_array_length(v_dashboard->'activities')<>1
     or (p_allowed_code='SSEC-QA-ALLOWED' and exists (
       select 1 from jsonb_array_elements(v_dashboard->'activities') activity
       where activity->>'code'=p_allowed_code
         and activity#>>'{_raw,email_qa}' is not null
     ))
     or (v_dashboard->>'authorization_revision')::bigint is distinct from
        (select revision from public.vmp_authorization_revision where singleton)
     or (v_dashboard->>'authorization_revision')::bigint<=0
     or v_watermark->>'objects' is distinct from '1'
     or v_watermark->>'plan_items' is distinct from '1'
     or (v_watermark->>'authorization_revision')::bigint is distinct from
        (select revision from public.vmp_authorization_revision where singleton)
     or (v_watermark->>'authorization_revision')::bigint<=0
     or v_warnings::text not like '%'||p_allowed_code||'%'
     or v_warnings::text like '%SSEC-DENIED%' then
    raise exception using errcode='check_violation',
      message=format('%s list=%s facets=%s export=%s dashboard=%s watermark=%s warnings=%s',
        p_rule_id,v_list,v_facets,v_export,v_dashboard,v_watermark,v_warnings);
  end if;

  if not exists (
    select 1 from public.audit_logs audit
    where audit.user_id=p_user_id and audit.action='EXPORT'
      and audit.table_name='vmp_source_objects'
  ) then
    raise exception using errcode='check_violation',
      message=p_rule_id||'_EXPORT_AUDIT_MISSING';
  end if;
end
$$;

create function pg_temp.assert_manager_source_api_contract(p_user_id uuid)
returns void language plpgsql security invoker as $$
declare
  v_suggestions jsonb;
  v_candidates jsonb;
  v_invalid jsonb;
begin
  perform set_config('request.jwt.claims',json_build_object(
    'sub',p_user_id,'role','authenticated')::text,true);
  v_suggestions:=public.rpc_source_field_suggestions(
    'Thiết bị','department','SSEC',null,10);
  v_candidates:=public.rpc_source_qa_candidates(
    'source security qa',null,10,
    array['9a020000-0000-4000-8000-000000000139'::uuid]);
  v_invalid:=public.rpc_source_field_suggestions(
    'Thiết bị','owner_person_id','',null,10);

  if v_suggestions->>'ok' is distinct from 'true'
     or jsonb_array_length(v_suggestions->'rows')<>1
     or v_suggestions#>>'{rows,0,value}' is distinct from 'SSEC_WS'
     or v_candidates->>'ok' is distinct from 'true'
     or jsonb_array_length(v_candidates->'rows')<>1
     or v_candidates#>>'{rows,0,performer_name}' is distinct from
        'Source Security QA'
     or jsonb_array_length(v_candidates->'included_current')<>1
     or v_candidates#>>'{included_current,0,eligible}' is distinct from 'false'
     or v_candidates#>>'{included_current,0,ineligibility_reason}' is distinct from
        'PERFORMER_INACTIVE'
     or v_invalid->>'ok' is distinct from 'false'
     or v_invalid->>'error_code' is distinct from 'INVALID_FIELD'
     or public.rpc_list_source_objects(
          'Thiết bị','SSEC','{}'::jsonb,null,101,false,null
        )->>'error_code' is distinct from 'INVALID_LIMIT'
     or public.rpc_export_source_objects(
          'Thiết bị','SSEC','{}'::jsonb,null,501
        )->>'error_code' is distinct from 'INVALID_LIMIT'
     or public.rpc_export_source_objects(
          'Thiết bị','SSEC','{}'::jsonb,
          '{"object_code":"SSEC-MISSING","id":"bad"}'::jsonb,100
        )->>'error_code' is distinct from 'INVALID_CURSOR'
     or public.rpc_export_source_objects(
          'Thiết bị','SSEC','{}'::jsonb,
          '{"object_code":"SSEC-MISSING","id":"00000000-0000-0000-0000-000000000000"}'::jsonb,
          100
        )->>'error_code' is distinct from 'CURSOR_EXPIRED'
     or public.rpc_source_qa_candidates('',null,51,'{}'::uuid[])
          ->>'error_code' is distinct from 'INVALID_LIMIT' then
    raise exception using errcode='check_violation',
      message=format('SOURCE_ACCESS_PAGED_MANAGER_API_CONTRACT suggestions=%s candidates=%s invalid=%s',
                     v_suggestions,v_candidates,v_invalid);
  end if;
end
$$;

create function pg_temp.assert_single_source_result(
  p_payload jsonb,p_expected_code text,p_rule_id text
)
returns void language plpgsql security invoker as $$
begin
  if p_payload->>'ok' is distinct from 'true'
     or coalesce(jsonb_array_length(p_payload->'rows'),-1)<>1
     or p_payload#>>'{rows,0,object_code}' is distinct from p_expected_code
     or p_payload->>'authorized_total' is distinct from '1' then
    raise exception using errcode='check_violation',
      message=format('%s payload=%s',p_rule_id,p_payload);
  end if;
end
$$;

create function pg_temp.assert_manager_server_filter_contract(p_user_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_facets jsonb;
  v_export jsonb;
  v_suggestions jsonb;
  v_scope_first jsonb;
  v_scope_second jsonb;
begin
  perform set_config('request.jwt.claims',json_build_object(
    'sub',p_user_id,'role','authenticated')::text,true);

  perform pg_temp.assert_single_source_result(public.rpc_list_source_objects(
    'Thiết bị','FILTER_NOTE_NEEDLE','{"department":"filter_contract"}'::jsonb,
    null,100,false,null),'FILTER-CONTRACT-A','SOURCE_ACCESS_SERVER_FILTER_SEARCH');
  perform pg_temp.assert_single_source_result(public.rpc_list_source_objects(
    'Thiết bị',null,
    '{"department":"filter_contract","validation":"validated"}'::jsonb,
    null,100,false,null),'FILTER-CONTRACT-A','SOURCE_ACCESS_SERVER_FILTER_VALIDATED');
  perform pg_temp.assert_single_source_result(public.rpc_list_source_objects(
    'Thiết bị',null,
    '{"department":"filter_contract","validation":"outside"}'::jsonb,
    null,100,false,null),'FILTER-CONTRACT-B','SOURCE_ACCESS_SERVER_FILTER_OUTSIDE');
  perform pg_temp.assert_single_source_result(public.rpc_list_source_objects(
    'Thiết bị',null,
    '{"department":"filter_contract","first_month":"missing"}'::jsonb,
    null,100,false,null),'FILTER-CONTRACT-A','SOURCE_ACCESS_SERVER_FILTER_FIRST_MISSING');
  perform pg_temp.assert_single_source_result(public.rpc_list_source_objects(
    'Thiết bị',null,
    '{"department":"filter_contract","first_month":"present"}'::jsonb,
    null,100,false,null),'FILTER-CONTRACT-B','SOURCE_ACCESS_SERVER_FILTER_FIRST_PRESENT');
  perform pg_temp.assert_single_source_result(public.rpc_list_source_objects(
    'Thiết bị',null,
    '{"department":"filter_contract","owner":"assigned"}'::jsonb,
    null,100,false,null),'FILTER-CONTRACT-A','SOURCE_ACCESS_SERVER_FILTER_ASSIGNED');
  perform pg_temp.assert_single_source_result(public.rpc_list_source_objects(
    'Thiết bị',null,
    '{"department":"filter_contract","owner":"unassigned"}'::jsonb,
    null,100,false,null),'FILTER-CONTRACT-B','SOURCE_ACCESS_SERVER_FILTER_UNASSIGNED');
  perform pg_temp.assert_single_source_result(public.rpc_list_source_objects(
    'Thiết bị',null,
    '{"department":"filter_contract","owner":"owner:source security manager"}'::jsonb,
    null,100,false,null),'FILTER-CONTRACT-A','SOURCE_ACCESS_SERVER_FILTER_OWNER_NAME');
  perform pg_temp.assert_single_source_result(public.rpc_list_source_objects(
    'Thiết bị',null,
    '{"department":"filter_contract","frequency":"lte12"}'::jsonb,
    null,100,false,null),'FILTER-CONTRACT-A','SOURCE_ACCESS_SERVER_FILTER_FREQUENCY_LOW');
  perform pg_temp.assert_single_source_result(public.rpc_list_source_objects(
    'Thiết bị',null,
    '{"department":"filter_contract","frequency":"gt12"}'::jsonb,
    null,100,false,null),'FILTER-CONTRACT-B','SOURCE_ACCESS_SERVER_FILTER_FREQUENCY_HIGH');

  v_facets:=public.rpc_source_object_facets(
    'Thiết bị','{"department":"filter_contract"}'::jsonb);
  if v_facets->>'ok' is distinct from 'true'
     or coalesce(jsonb_array_length(v_facets->'departments'),-1)<>1
     or not (v_facets->'departments' @>
        '[{"value":"FILTER_CONTRACT","count":2}]'::jsonb)
     or coalesce(jsonb_array_length(v_facets->'areas'),-1)<>2
     or not (v_facets->'owners' @>
        '[{"value":"owner:source security manager","name":"Source Security Manager","count":1}]'::jsonb)
     or v_facets->'validation' is distinct from
        '[{"value":"outside","count":1},{"value":"validated","count":1}]'::jsonb
     or v_facets->'first_month' is distinct from
        '[{"value":"missing","count":1},{"value":"present","count":1}]'::jsonb
     or v_facets->'ownership' is distinct from
        '[{"value":"assigned","count":1},{"value":"unassigned","count":1}]'::jsonb
     or v_facets->'frequency' is distinct from
        '[{"value":"gt12","count":1},{"value":"lte12","count":1}]'::jsonb then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_SERVER_FILTER_FACETS payload='||v_facets;
  end if;

  v_export:=public.rpc_export_source_objects('Thiết bị',null,
    '{"department":"filter_contract","frequency":"gt12"}'::jsonb,null,500);
  perform pg_temp.assert_single_source_result(
    v_export,'FILTER-CONTRACT-B','SOURCE_ACCESS_SERVER_FILTER_EXPORT');

  v_suggestions:=public.rpc_source_field_suggestions(
    'Thiết bị','work_group','FILTER_GROUP_',null,50);
  if v_suggestions->>'ok' is distinct from 'true'
     or coalesce(jsonb_array_length(v_suggestions->'rows'),-1)<>2 then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_WORK_GROUP_SUGGESTION payload='||v_suggestions;
  end if;

  v_scope_first:=public.rpc_source_workshop_scope_choices(
    ' FILTER_SCOPE ',' FILTER_SCOPE_AREA ',null,null,1);
  v_scope_second:=public.rpc_source_workshop_scope_choices(
    'FILTER_SCOPE','FILTER_SCOPE_AREA',null,v_scope_first->'next_cursor',1);
  if v_scope_first is distinct from jsonb_build_object(
       'ok',true,
       'rows',jsonb_build_array(jsonb_build_object(
         'department','FILTER_SCOPE','area_code','FILTER_SCOPE_AREA','line',null)),
       'next_cursor',jsonb_build_object(
         'department','FILTER_SCOPE','area_code','FILTER_SCOPE_AREA','line',null))
     or v_scope_second is distinct from jsonb_build_object(
       'ok',true,
       'rows',jsonb_build_array(jsonb_build_object(
         'department','FILTER_SCOPE','area_code','FILTER_SCOPE_AREA',
         'line','FILTER_SCOPE_LINE')),
       'next_cursor',null)
     or encode(extensions.digest(convert_to(
       v_scope_first::text||E'\n'||v_scope_second::text,'UTF8'),
       'sha256'),'hex')<>
       '25389d865e7738b80b61f0404cc031a08d9399748c3e8b575dd9274fea668f17'
  then
    raise exception using errcode='check_violation',
      message=format(
        'SOURCE_ACCESS_SCOPE_CHOICE_CANONICAL_BLANK_LINE first=%s second=%s',
        v_scope_first,v_scope_second);
  end if;

  if public.rpc_list_source_objects(
       'Thiết bị',null,'{"unknown":"x"}'::jsonb,null,100,false,null
     )->>'error_code' is distinct from 'INVALID_FILTERS'
     or public.rpc_list_source_objects(
       'Thiết bị',null,'{"department":1}'::jsonb,null,100,false,null
     )->>'error_code' is distinct from 'INVALID_FILTERS'
     or public.rpc_list_source_objects(
       'Thiết bị',null,'{"validation":"other"}'::jsonb,null,100,false,null
     )->>'error_code' is distinct from 'INVALID_FILTERS'
     or public.rpc_source_object_facets(
       'Thiết bị','{"unknown":"x"}'::jsonb
     )->>'error_code' is distinct from 'INVALID_FILTERS'
     or public.rpc_export_source_objects(
       'Thiết bị',null,'{"frequency":"other"}'::jsonb,null,500
     )->>'error_code' is distinct from 'INVALID_FILTERS' then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_SERVER_FILTER_INVALID_FILTERS';
  end if;
end
$$;

create function pg_temp.assert_filter_after_authorization(p_user_id uuid)
returns void language plpgsql security invoker as $$
declare
  v_owned jsonb;
  v_unassigned jsonb;
begin
  perform set_config('request.jwt.claims',json_build_object(
    'sub',p_user_id,'role','authenticated')::text,true);
  v_owned:=public.rpc_list_source_objects('Thiết bị',null,
    '{"department":"filter_contract","owner":"assigned"}'::jsonb,
    null,100,false,null);
  v_unassigned:=public.rpc_list_source_objects('Thiết bị',null,
    '{"department":"filter_contract","owner":"unassigned"}'::jsonb,
    null,100,false,null);
  if v_owned->>'ok' is distinct from 'true'
     or v_owned->>'authorized_total' is distinct from '0'
     or coalesce(jsonb_array_length(v_owned->'rows'),-1)<>0
     or v_unassigned->>'ok' is distinct from 'true'
     or v_unassigned->>'authorized_total' is distinct from '0'
     or coalesce(jsonb_array_length(v_unassigned->'rows'),-1)<>0 then
    raise exception using errcode='check_violation',
      message=format(
        'SOURCE_ACCESS_FILTER_APPLIES_AFTER_AUTHORIZATION owned=%s unassigned=%s',
        v_owned,v_unassigned);
  end if;
end
$$;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object(
  'sub','9a020000-0000-4000-8000-000000000001','role','authenticated')::text,true);
select pg_temp.assert_protected_source_rows_hidden('SOURCE_QA');
select pg_temp.assert_protected_non_source_tables_hidden('SOURCE_QA');
select pg_temp.assert_manager_surfaces_forbidden('SOURCE_QA');

select set_config('request.jwt.claims',json_build_object(
  'sub','9a020000-0000-4000-8000-000000000002','role','authenticated')::text,true);
select pg_temp.assert_protected_source_rows_hidden('SOURCE_WORKSHOP');
select pg_temp.assert_protected_non_source_tables_hidden('SOURCE_WORKSHOP');
select pg_temp.assert_manager_surfaces_forbidden('SOURCE_WORKSHOP');

select pg_temp.assert_visible_source_surfaces(
  '9a020000-0000-4000-8000-000000000001'::uuid,
  'SSEC-QA-ALLOWED','SSEC_QA_AREA',
  'SOURCE_ACCESS_QA_VISIBLE_SET_REUSED_BY_ALL_READERS');
select pg_temp.assert_filter_after_authorization(
  '9a020000-0000-4000-8000-000000000001'::uuid);
select pg_temp.assert_visible_source_surfaces(
  '9a020000-0000-4000-8000-000000000002'::uuid,
  'SSEC-WS-ALLOWED','SSEC_WS_AREA',
  'SOURCE_ACCESS_WORKSHOP_VISIBLE_SET_REUSED_BY_ALL_READERS');

select set_config('request.jwt.claims',json_build_object(
  'sub','9a020000-0000-4000-8000-000000000004',
  'role','authenticated')::text,true);
select pg_temp.assert_manager_source_api_contract(
  '9a020000-0000-4000-8000-000000000004'::uuid);
select pg_temp.assert_manager_server_filter_contract(
  '9a020000-0000-4000-8000-000000000004'::uuid);

\echo 'PASS SECURITY exact metadata ACL overload RLS inventory direct mutation and manager-only surfaces'
rollback;

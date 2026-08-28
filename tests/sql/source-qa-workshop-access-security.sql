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
   'd0ee7fcd1d5aa09faa5d3767fad10b5d7591f9ff7c8e8e6534d06b4f99f846e'),
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
  classification text not null check(classification in ('browser','service','owner'))
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
  'vmp_sync_item_assignments_from_performer()',
  'vmp_unfiltered_security_definer_item_readers()',
  'vmp_visible_plan_items()',
  'vmp_reconcile_source_qa_projection(uuid)'
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
  'vmp_harden_dashboard_object_scope()',
  'vmp_my_item_rights__five_role_impl_20260824(text)',
  'vmp_set_item_assignment_unhardened(uuid,text,text,text,text)',
  'vmp_upsert_source_object_before_person_id(text,text,jsonb)'
]::text[]) signature;

insert into expected_source_definer(signature,classification)
select signature,'browser' from unnest(array[
  'rpc_active_rules()','rpc_apply_catalog_change(uuid,text,integer)',
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
  'vmp_can_view_my_item(text)','vmp_my_item_rights(text)',
  'rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)',
  'rpc_source_object_facets(text,jsonb)',
  'rpc_export_source_objects(text,text,jsonb,jsonb,integer)',
  'rpc_source_field_suggestions(text,text,text,jsonb,integer)',
  'rpc_source_qa_candidates(text,jsonb,integer,uuid[])',
  'rpc_list_source_workshop_coverage(text,jsonb,integer)',
  'rpc_source_workshop_scope_choices(text,text,text,jsonb,integer)',
  'rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)',
  'rpc_my_editable_progress_rights()',
  'vmp_can_view_source_object(uuid,uuid)','vmp_can_view_plan_item(uuid,text)'
]::text[]) signature
on conflict(signature) do update set classification=excluded.classification;

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
    ('vmp_touch_authorization_revision()','plpgsql','v','owner',
     '\mvmp_authorization_revision\M')
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
    when 'service' then array['postgres','service_role']::text[]
    else array['postgres']::text[] end) grantee
)
select pg_temp.assert_true(
  (select count(*) from actual_private)=3
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
   $grant_policy$(vmp_can_manage_source_workshop_scope(auth.uid()) OR (EXISTS ( SELECT 1
   FROM vmp_performers performer
  WHERE ((performer.id = vmp_source_workshop_scope_grants.performer_id) AND (performer.user_id = auth.uid()) AND performer.is_active))))$grant_policy$,
   null),
  ('vmp_item_assignments','item_assignments_manager_or_self_select','r',true,
   array['authenticated'],
   $assignment_policy$(vmp_can_manage_source_qa_assignment(auth.uid()) OR (EXISTS ( SELECT 1
   FROM vmp_performers performer
  WHERE ((performer.id = vmp_item_assignments.performer_id) AND (performer.user_id = auth.uid()) AND performer.is_active))))$assignment_policy$,
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
       or using_expression<>'vmp_can_manage_source_qa_assignment(auth.uid())'
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
   'source-security-unrelated@example.test','x',now(),'{}','{}',now(),now());

insert into public.departments(id,name,short_name)
values ('QA','Source security QA fixture','QA'),
       ('SSEC_WS','Source security workshop fixture','SSW')
on conflict(id) do nothing;

insert into public.profiles(id,full_name,email,role,department,is_active)
values
  ('9a020000-0000-4000-8000-000000000001','Source Security QA',
   'source-security-qa@example.test','department_user','QA',true),
  ('9a020000-0000-4000-8000-000000000002','Source Security Workshop',
   'source-security-workshop@example.test','department_user','SSEC_WS',true),
  ('9a020000-0000-4000-8000-000000000003','Source Security Unrelated',
   'source-security-unrelated@example.test','department_user','SSEC_WS',true);

update public.vmp_performers
set department=case when user_id='9a020000-0000-4000-8000-000000000001'
                    then 'QA' else 'SSEC_WS' end,
    access_class=case when user_id='9a020000-0000-4000-8000-000000000001'
                      then 'qa_progress_editor' else 'workshop_staff' end,
    is_active=true
where user_id in (
  '9a020000-0000-4000-8000-000000000001'::uuid,
  '9a020000-0000-4000-8000-000000000002'::uuid,
  '9a020000-0000-4000-8000-000000000003'::uuid
);

insert into public.vmp_objects(
  code,name,classification,department,area,line,frequency_months
)
values (
  'SSEC-DENIED','Source security RLS denied row','tb','SSEC_WS',
  'SSEC_DENIED_AREA','SSEC_DENIED_LINE',12
);
insert into public.vmp_source_objects(
  id,object_kind,object_code,object_name,department,area_code,line,
  validate_flag,frequency_months,report_class,workdays,first_month,year_ref,
  source_tab,source_row,version,timeline_revision,timeline_applied_revision
)
values (
  '9a020000-0000-4000-8000-000000000110','Thiết bị','SSEC-DENIED',
  'Source security RLS denied row','SSEC_WS','SSEC_DENIED_AREA',
  'SSEC_DENIED_LINE','y',12,'Hóa lý',5,1,2026,
  'source-access-security',92110,1,0,0
);
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

\echo 'PASS SECURITY exact metadata ACL overload RLS inventory direct mutation and manager-only surfaces'
rollback;

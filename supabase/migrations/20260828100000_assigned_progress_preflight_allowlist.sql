-- Keep the five-role preflight baseline stable after adding the two reviewed
-- assigned-progress SECURITY DEFINER functions. No business data is changed.

begin;

do $precondition$
declare
  v_helper oid := to_regprocedure(
    'public.vmp_unfiltered_security_definer_item_readers()');
  v_batch oid := to_regprocedure('public.rpc_my_editable_progress_rights()');
  v_writer oid := to_regprocedure(
    'public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)');
begin
  if v_helper is null or v_batch is null or v_writer is null then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_ALLOWLIST_PRECONDITION_MISSING_FUNCTION';
  end if;

  if encode(extensions.digest(pg_get_functiondef(v_helper),'sha256'),'hex')
       not in (
         'acd365815ebaeabc18de2f79f23dbd0a466fef67e8c69a601cb261c72cef5e9d',
         '7ae2e60331ef00e45bc7193c7388a99754dc6a51159a9e34bcbf6af502c90522')
     or encode(extensions.digest(pg_get_functiondef(v_batch),'sha256'),'hex')
       is distinct from
       'a769f237d9f92c52ca9bfb5c5f6511a3b96078dd3015678bc6e78003f7243f6b'
     or encode(extensions.digest(pg_get_functiondef(v_writer),'sha256'),'hex')
       is distinct from
       'd0df69bd8e9f7a2d8cfa5f5f87bd15e4559599d05c125e0b35f038ca5b25865a'
     or (select owner.rolname from pg_proc procedure join pg_roles owner
         on owner.oid=procedure.proowner where procedure.oid=v_helper)<>'postgres'
     or (select prosecdef and provolatile='s' and proparallel='u'
             and proconfig=array['search_path=public, pg_temp']::text[]
             and proacl=array['postgres=X/postgres','service_role=X/postgres']::aclitem[]
             from pg_proc where oid=v_helper) is distinct from true
     or (select owner.rolname from pg_proc procedure join pg_roles owner
         on owner.oid=procedure.proowner where procedure.oid=v_batch)<>'postgres'
     or (select prosecdef and provolatile='s' and proparallel='u'
             and proconfig=array['search_path=public, pg_temp']::text[]
             and proacl=array['postgres=X/postgres','service_role=X/postgres',
               'authenticated=X/postgres']::aclitem[]
             from pg_proc where oid=v_batch) is distinct from true
     or (select owner.rolname from pg_proc procedure join pg_roles owner
         on owner.oid=procedure.proowner where procedure.oid=v_writer)<>'postgres'
     or (select prosecdef and provolatile='v' and proparallel='u'
             and proconfig=array['search_path=public, pg_temp']::text[]
             and proacl=array['postgres=X/postgres']::aclitem[]
             from pg_proc where oid=v_writer) is distinct from true then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_ALLOWLIST_PRECONDITION_DRIFT';
  end if;
end
$precondition$;

create or replace function public.vmp_unfiltered_security_definer_item_readers()
returns table(signature text)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with allowed(signature, reason) as (
    values
      ('audit_plan_item_changes()', 'trigger audit, không trả dữ liệu cho trình duyệt'),
      ('audit_plan_item_changes_v2()', 'trigger audit, không trả dữ liệu cho trình duyệt'),
      ('ly_do_khong_sua_duoc(text,uuid)', 'helper kiểm quyền ghi legacy'),
      ('vmp_item_rights(uuid,text)', 'lõi tính quyền phải đọc hạng mục đích'),
      ('rpc_my_editable_progress_rights()', 'RPC quyền tiến độ lọc từng hạng mục qua resolver đã duyệt'),
      ('rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)', 'writer riêng kiểm allowlist trước và sau khóa dòng'),
      ('rpc_item_permission_preflight()', 'admin-only, kiểm độ đầy đủ trước enforced'),
      ('rpc_luat_xem()', 'admin/QA-only, chỉ nhắc tên bảng trong metadata policy'),
      ('rpc_apply_assignments(boolean)', 'RPC ghi đồng bộ người phụ trách'),
      ('rpc_apply_sheet_sync(text,text,jsonb)', 'RPC ghi service sync'),
      ('rpc_create_plan_item(text,text,integer,integer,jsonb)', 'RPC ghi tạo hạng mục'),
      ('rpc_delete_plan_item(text,text)', 'RPC ghi xóa mềm hạng mục'),
      ('rpc_generate_timeline(integer,boolean)', 'RPC ghi sinh timeline'),
      ('rpc_recalc_criticality(boolean)', 'RPC ghi tính lại độ trọng yếu'),
      ('rpc_reconcile_orphan_objects(text[])', 'RPC ghi đối soát dữ liệu nguồn'),
      ('rpc_refresh_computed_status()', 'RPC ghi tính lại trạng thái'),
      ('rpc_refresh_source_item_assignments()', 'RPC ghi đồng bộ phân công nguồn'),
      ('rpc_register_alert(text,text,text,text,text,text,text)', 'RPC ghi cảnh báo'),
      ('rpc_resolve_missing(text,text,text)', 'RPC ghi xử lý hạng mục thiếu'),
      ('rpc_rollback_vmp_sheet_sync(uuid)', 'RPC service khôi phục snapshot'),
      ('rpc_set_item_assignment(uuid,text,text,text,text)', 'RPC ghi phân công'),
      ('rpc_set_item_performer(text,text)', 'RPC ghi người thực hiện'),
      ('rpc_item_assignments(text,uuid)', 'RPC quản lý đọc phân công canonical'),
      ('rpc_set_item_assignment(uuid,text,text,text,text,text,uuid)', 'RPC ghi phân công canonical'),
      ('rpc_upsert_source_object(text,text,jsonb)', 'RPC ghi source và mirror person_id'),
      ('rpc_set_item_state(text,text,text)', 'RPC ghi trạng thái nghiệp vụ'),
      ('rpc_sync_vmp_sheet_snapshot(text,text,text,jsonb,jsonb)', 'RPC service đồng bộ snapshot'),
      ('rpc_sync_vmp_sheet_snapshot_with_extras(text,text,text,jsonb,jsonb)', 'RPC service đồng bộ dữ liệu mở rộng'),
      ('rpc_update_progress(text,jsonb,text,jsonb,integer)', 'RPC ghi tiến độ đã kiểm quyền trường')
  ), candidates as (
    select case
      when procedure.proname like '%\_\_five\_role\_impl\_20260824' escape '\'
        then format('%s(%s)', left(procedure.proname,
          -length('__five_role_impl_20260824')),
          replace(pg_catalog.oidvectortypes(procedure.proargtypes), ', ', ','))
      else procedure.oid::regprocedure::text
    end as signature
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='public'
      and procedure.prosecdef
      and pg_get_functiondef(procedure.oid) ilike '%vmp_plan_items%'
      and pg_get_functiondef(procedure.oid) not ilike '%vmp_can_view_item%'
      and pg_get_functiondef(procedure.oid) not ilike '%vmp_visible_plan_items%'
  )
  select candidate.signature
  from candidates candidate
  left join allowed on allowed.signature=candidate.signature
  where allowed.signature is null
  order by candidate.signature
$function$;

alter function public.vmp_unfiltered_security_definer_item_readers()
  owner to postgres;
alter function public.vmp_unfiltered_security_definer_item_readers()
  stable;
alter function public.vmp_unfiltered_security_definer_item_readers()
  security definer;
alter function public.vmp_unfiltered_security_definer_item_readers()
  set search_path=public,pg_temp;
revoke all on function public.vmp_unfiltered_security_definer_item_readers()
  from public,anon,authenticated,service_role;
grant execute on function public.vmp_unfiltered_security_definer_item_readers()
  to service_role;

do $postcondition$
declare
  v_helper oid := 'public.vmp_unfiltered_security_definer_item_readers()'::regprocedure;
  v_definition text;
  v_preflight jsonb;
  v_old_claims text := current_setting('request.jwt.claims',true);
  v_count integer;
  v_digest text;
  v_warning_count integer;
  v_warning_digest text;
  v_local boolean;
begin
  select pg_get_functiondef(v_helper) into v_definition;
  if regexp_count(v_definition,'rpc_my_editable_progress_rights\(\)')<>1
     or regexp_count(v_definition,
       'rpc_update_progress__assigned_impl_20260827\(text,jsonb,text,jsonb,integer\)')<>1
     or exists (select 1 from public.vmp_unfiltered_security_definer_item_readers()
       where signature in ('rpc_my_editable_progress_rights()',
         'rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)'))
     or (select owner.rolname from pg_proc procedure join pg_roles owner
         on owner.oid=procedure.proowner where procedure.oid=v_helper)<>'postgres'
     or (select prosecdef and provolatile='s' and proparallel='u'
             and proconfig=array['search_path=public, pg_temp']::text[]
             and proacl=array['postgres=X/postgres','service_role=X/postgres']::aclitem[]
             from pg_proc where oid=v_helper) is distinct from true then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_ALLOWLIST_POSTCONDITION_CONTRACT';
  end if;

  v_local:=exists (select 1 from public.system_config
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
  perform set_config('request.jwt.claims',coalesce(v_old_claims,''),true);

  if (v_local and (v_count<>16
       or v_digest<>'51655dff70de3ba821367c8f3784d078'
       or v_warning_count<>8
       or v_warning_digest<>'1dfde6e08513295b7e91472e406e2c6b'))
     or (not v_local and (v_count<>514
       or v_digest<>'82020b2908015d95f228f6caacf90f3a'
       or v_warning_count<>14
       or v_warning_digest<>'7bc0aa25501a745ddc161e13ef5dab9a')) then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_ALLOWLIST_POSTCONDITION_BASELINE';
  end if;
end
$postcondition$;

commit;

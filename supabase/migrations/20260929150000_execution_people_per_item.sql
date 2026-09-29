-- Execution people are independent of Source QA/access authority.
-- No plan, Source, role or item assignment row is rewritten by this migration.
begin;
do $preflight$
declare hidden regprocedure:=to_regprocedure('public.rpc_set_item_performer_by_id__five_role_impl_20260824(text,uuid,text)');
  wrapper regprocedure:=to_regprocedure('public.rpc_set_item_performer_by_id(text,uuid,text)');
begin
  if hidden is null or wrapper is null then raise exception 'Missing execution writer contract'; end if;
  if exists(select 1 from pg_proc where oid in(hidden,wrapper)
    and (not prosecdef or pg_get_userbyid(proowner)<>'postgres' or proconfig is distinct from array['search_path=public, pg_temp']))
    or has_function_privilege('public',hidden,'EXECUTE')
    or has_function_privilege('anon',hidden,'EXECUTE')
    or has_function_privilege('authenticated',hidden,'EXECUTE')
    or has_function_privilege('service_role',hidden,'EXECUTE')
    or has_function_privilege('public',wrapper,'EXECUTE')
    or has_function_privilege('anon',wrapper,'EXECUTE')
    or not has_function_privilege('authenticated',wrapper,'EXECUTE')
    or not has_function_privilege('service_role',wrapper,'EXECUTE') then
    raise exception 'Unexpected execution writer ACL/owner/session boundary';
  end if;
end $preflight$;
create table public.vmp_execution_people (
  item_id text primary key references public.vmp_plan_items(id),
  primary_override boolean not null default false,
  primary_person_id uuid references public.vmp_performers(id),
  support_override boolean not null default false,
  support_person_id uuid references public.vmp_performers(id),
  version integer not null default 1 check(version>0),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users(id),
  change_reason text not null check(nullif(btrim(change_reason),'') is not null),
  constraint execution_primary_inherit check(primary_override or primary_person_id is null),
  constraint execution_support_inherit check(support_override or support_person_id is null)
);
alter table public.vmp_execution_people enable row level security;
revoke all on public.vmp_execution_people from public,anon,authenticated,service_role;
comment on table public.vmp_execution_people is 'Execution identity per plan item. Does not grant QA, Source, progress or qualification access. false override inherits canonical display; true+null explicitly clears.';

create function public.vmp_stamp_execution_people() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_code text;
begin
  if tg_op='UPDATE' then
    if new.item_id is distinct from old.item_id then raise exception 'Execution item identity is immutable'; end if;
    if (new.primary_override,new.primary_person_id,new.support_override,new.support_person_id)
      is not distinct from (old.primary_override,old.primary_person_id,old.support_override,old.support_person_id) then
      return null;
    end if;
    new.version:=old.version+1;
  else
    new.version:=1;
  end if;
  new.updated_at:=clock_timestamp();
  new.updated_by:=auth.uid();

  return new;
end $$;
revoke all on function public.vmp_stamp_execution_people() from public,anon,authenticated,service_role;
create trigger stamp_execution_people before insert or update on public.vmp_execution_people
for each row execute function public.vmp_stamp_execution_people();

create function public.vmp_audit_execution_people() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_code text;
begin
  select validation_code into strict v_code from public.vmp_plan_items where id=new.item_id;
  insert into public.audit_logs(user_id,action,table_name,record_id,old_data,new_data,
    change_reason,source,changed_fields,validation_code)
  values(auth.uid(),case when tg_op='INSERT' then 'INSERT'::public.audit_action else 'UPDATE'::public.audit_action end,
    'vmp_execution_people',new.item_id::text,
    case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),new.change_reason,
    coalesce(nullif(current_setting('app.audit_source',true),''),'dashboard_rpc'),
    array(select key from jsonb_each(to_jsonb(new)) where key in ('primary_override','primary_person_id','support_override','support_person_id') and (tg_op='INSERT' or value is distinct from to_jsonb(old)->key) order by key),v_code);
  return new;
end $$;
revoke all on function public.vmp_audit_execution_people() from public,anon,authenticated,service_role;
create trigger audit_execution_people after insert or update on public.vmp_execution_people
for each row execute function public.vmp_audit_execution_people();

create function public.vmp_forbid_execution_people_delete() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'Reverse execution assignment with an audited update; deletion is not supported'; end $$;
revoke all on function public.vmp_forbid_execution_people_delete() from public,anon,authenticated,service_role;
create trigger forbid_execution_people_delete before delete on public.vmp_execution_people
for each row execute function public.vmp_forbid_execution_people_delete();

-- Called only inside the already scope-filtered dashboard. No browser EXECUTE.
create function public.vmp_project_execution_people(p_dashboard jsonb) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select case when jsonb_typeof(p_dashboard->'activities') is distinct from 'array' then p_dashboard else
    p_dashboard || jsonb_build_object('activities',coalesce(jsonb_agg(
      case when e.item_id is null then a.value else a.value
        || case when e.primary_override then jsonb_build_object('owner',coalesce(nullif(btrim(pr.performer_name),''),'—')) else '{}'::jsonb end
        || case when e.support_override then jsonb_build_object('support',nullif(btrim(sp.performer_name),'')) else '{}'::jsonb end
        || jsonb_build_object('_raw',coalesce(a.value->'_raw','{}'::jsonb)
          || case when e.primary_override then jsonb_build_object('owner_person_id',e.primary_person_id,'qa',pr.performer_name,
            'email_qa',case when pr.is_active and pr.email not like '%.local' then pr.email end) else '{}'::jsonb end
          || case when e.support_override then jsonb_build_object('support_person_id',e.support_person_id,'ho_tro',sp.performer_name) else '{}'::jsonb end)
      end order by a.ordinality),'[]'::jsonb),
      'updated_at',greatest((p_dashboard->>'updated_at')::timestamptz,max(e.updated_at))) end
  from jsonb_array_elements(case when jsonb_typeof(p_dashboard->'activities')='array' then p_dashboard->'activities' else '[]'::jsonb end) with ordinality a(value,ordinality)
  left join public.vmp_plan_items i on i.validation_code=a.value->>'id'
  left join public.vmp_execution_people e on e.item_id=i.id
  left join public.vmp_performers pr on pr.id=e.primary_person_id
  left join public.vmp_performers sp on sp.id=e.support_person_id
$$;
revoke all on function public.vmp_project_execution_people(jsonb) from public,anon,authenticated,service_role;

-- Preserve live session and visibility checks, function OIDs and existing ACLs.
-- Fail closed on an unexpected contract rather than replace a different RPC.
do $migration$
declare body text; marker text := '  return v_result;'; stamp text;
begin
  if to_regprocedure('public.rpc_get_vmp_dashboard_v2(integer,boolean)') is not null then
    body:=pg_get_functiondef('public.rpc_get_vmp_dashboard_v2(integer,boolean)'::regprocedure);
    if (length(body)-length(replace(body,marker,'')))/length(marker)<>1
      or position('public.vmp_visible_plan_items()' in body)=0
      or position('visible_items as materialized' in body)=0 then raise exception 'Unexpected dashboard v2 contract'; end if;
    execute replace(body,marker,'  return public.vmp_project_execution_people(v_result);');
  end if;
  body:=pg_get_functiondef('public.rpc_get_vmp_dashboard(integer,boolean,boolean)'::regprocedure);
  if (length(body)-length(replace(body,marker,'')))/length(marker)<>1
    or position('visible_source as materialized' in body)=0
    or position('vmp_can_view_source_object' in body)=0 then raise exception 'Unexpected dashboard contract'; end if;
  execute replace(body,marker,'  return public.vmp_project_execution_people(v_result);');
  body:=pg_get_functiondef('public.rpc_get_vmp_watermark(integer)'::regprocedure);
  stamp:=$stamp$coalesce((select max(updated_at) from visible_items),'epoch'::timestamptz)$stamp$;
  if (length(body)-length(replace(body,stamp,'')))/length(stamp)<>1
    or position('vmp_can_view_source_object' in body)=0 then raise exception 'Unexpected watermark contract'; end if;
  execute replace(body,stamp,stamp||$stamp$,
      coalesce((select max(e.updated_at) from public.vmp_execution_people e
        join visible_items item on item.id=e.item_id),'epoch'::timestamptz)$stamp$);
end $migration$;

CREATE OR REPLACE FUNCTION public.rpc_set_item_performer_by_id__five_role_impl_20260824(p_validation_code text, p_person_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_principal_kind text;
  v_object_code text;
  v_person public.vmp_performers%rowtype;
  v_name text;
  v_items integer;
  v_item_id text;
begin
  p_validation_code:=btrim(p_validation_code);
  -- Serialize only execution writers; avoid reversing permission row-lock order.
  perform pg_advisory_xact_lock(hashtextextended('vmp-execution:'||coalesce(p_validation_code,''),0));
  -- Eligibility stays committed until this assignment commits. Permission DML
  -- waits on the revision, without us locking its plan/person rows in reverse.
  perform 1 from public.vmp_authorization_revision where singleton for share;
  if coalesce(auth.role(), '') <> 'service_role' then
    select principal.principal_kind into v_principal_kind
    from public.vmp_manager_principal(auth.uid()) principal;
    if v_principal_kind is null
        or v_principal_kind not in ('admin', 'qa_manager') then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'FORBIDDEN',
        'error', 'Chỉ Admin hoặc QA được phân công người thực hiện'
      );
    end if;
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'REASON_REQUIRED',
      'error', 'Bắt buộc nhập lý do phân công'
    );
  end if;
  select item.object_code,item.id into v_object_code,v_item_id
  from public.vmp_visible_plan_items() item
  where item.validation_code = p_validation_code and item.is_active;
  if not found then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'ITEM_NOT_FOUND',
      'error', 'Không tìm thấy mã thẩm định'
    );
  end if;
  if p_person_id is not null then
    select * into v_person
    from public.vmp_performers
    where id = p_person_id and is_active;
    if not found then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'PERSON_NOT_ACTIVE',
        'error', 'Người được chọn không tồn tại hoặc đã ngừng hoạt động'
      );
    end if;
    if v_principal_kind = 'qa_manager'
        and v_person.department is distinct from 'qa' then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'PERSON_OUT_OF_SCOPE',
        'error', 'QA chỉ được chọn người trong bộ phận QA'
      );
    end if;
    v_name := v_person.performer_name;
  end if;

  perform set_config('app.audit_source','dashboard_rpc',true);
  insert into public.vmp_execution_people(item_id,primary_override,primary_person_id,change_reason)
  values(v_item_id,true,p_person_id,btrim(p_reason))
  on conflict(item_id) do update set primary_override=true,primary_person_id=excluded.primary_person_id,
    change_reason=excluded.change_reason
  where (vmp_execution_people.primary_override,vmp_execution_people.primary_person_id)
    is distinct from (true,excluded.primary_person_id);
  get diagnostics v_items=row_count;

  return jsonb_build_object(
    'ok', true,
    'object_code', v_object_code,
    'person_id', p_person_id,
    'performer_name', v_name,
    'email', v_person.email,
    'items', v_items
  );
exception when others then
  return jsonb_build_object(
    'ok', false,
    'error_code', 'ASSIGNMENT_FAILED',
    'error', sqlerrm
  );
end
$function$;
commit;

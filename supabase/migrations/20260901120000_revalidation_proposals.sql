-- Revalidation proposals derived only from actual VMP completion and source frequency.

begin;

create table if not exists public.vmp_revalidation_proposals (
  id uuid primary key default gen_random_uuid(),
  plan_item_id text not null references public.vmp_plan_items(id) on delete restrict,
  validation_code text not null,
  object_code text not null,
  validation_type text not null,
  actual_completed_date date not null,
  frequency_months integer not null check (frequency_months between 1 and 120),
  due_date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'dismissed', 'obsolete')),
  version integer not null default 1 check (version > 0),
  created_plan_validation_code text,
  decision_reason text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_item_id, due_date)
);

create index if not exists idx_vmp_revalidation_proposals_due
  on public.vmp_revalidation_proposals(status, due_date, id);
create index if not exists idx_vmp_revalidation_proposals_item
  on public.vmp_revalidation_proposals(plan_item_id, created_at desc);

alter table public.vmp_revalidation_proposals enable row level security;

drop policy if exists revalidation_proposals_visible_item_select
  on public.vmp_revalidation_proposals;
create policy revalidation_proposals_visible_item_select
  on public.vmp_revalidation_proposals
  for select to authenticated
  using (
    auth.role() = 'service_role'
    or public.vmp_can_view_item(auth.uid(), validation_code)
  );

revoke all on table public.vmp_revalidation_proposals from public, anon, authenticated;
grant select on table public.vmp_revalidation_proposals to authenticated, service_role;

create or replace function public.vmp_can_manage_revalidation()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(auth.role(), '') in ('', 'service_role')
    or (
      public.vmp_is_active_session(auth.uid())
      and public.vmp_business_role(auth.uid()) in ('admin', 'qa_manager')
    )
$function$;

revoke all on function public.vmp_can_manage_revalidation() from public, anon, authenticated;

create or replace function public.rpc_refresh_revalidation_proposals(
  p_as_of date default (now() at time zone 'Asia/Bangkok')::date
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_created integer := 0;
  v_obsolete integer := 0;
  v_unchanged integer := 0;
begin
  if not public.vmp_can_manage_revalidation() then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if p_as_of is null then
    raise exception using errcode = '22004', message = 'AS_OF_REQUIRED';
  end if;

  with current_cycles as materialized (
    select
      item.id as plan_item_id,
      item.validation_code,
      item.object_code,
      item.validation_type,
      item.actual_vmp_date as actual_completed_date,
      source.frequency_months,
      (item.actual_vmp_date + make_interval(months => source.frequency_months))::date as due_date
    from public.vmp_plan_items item
    join public.vmp_source_objects source
      on source.object_code = item.object_code and source.is_active
    where item.is_active
      and coalesce(item.item_state, 'active') = 'active'
      and item.actual_vmp_date is not null
      and source.frequency_months between 1 and 120
  )
  update public.vmp_revalidation_proposals proposal
  set status = 'obsolete',
      version = proposal.version + 1,
      updated_at = now()
  where proposal.status = 'pending'
    and not exists (
      select 1 from current_cycles cycle
      where cycle.plan_item_id = proposal.plan_item_id
        and cycle.due_date = proposal.due_date
    );
  get diagnostics v_obsolete = row_count;

  with current_cycles as materialized (
    select
      item.id as plan_item_id,
      item.validation_code,
      item.object_code,
      item.validation_type,
      item.actual_vmp_date as actual_completed_date,
      source.frequency_months,
      (item.actual_vmp_date + make_interval(months => source.frequency_months))::date as due_date
    from public.vmp_plan_items item
    join public.vmp_source_objects source
      on source.object_code = item.object_code and source.is_active
    where item.is_active
      and coalesce(item.item_state, 'active') = 'active'
      and item.actual_vmp_date is not null
      and source.frequency_months between 1 and 120
  )
  insert into public.vmp_revalidation_proposals(
    plan_item_id, validation_code, object_code, validation_type,
    actual_completed_date, frequency_months, due_date
  )
  select
    cycle.plan_item_id, cycle.validation_code, cycle.object_code, cycle.validation_type,
    cycle.actual_completed_date, cycle.frequency_months, cycle.due_date
  from current_cycles cycle
  on conflict (plan_item_id, due_date) do nothing;
  get diagnostics v_created = row_count;

  select count(*) - v_created into v_unchanged
  from public.vmp_revalidation_proposals proposal
  join public.vmp_plan_items item on item.id = proposal.plan_item_id
  join public.vmp_source_objects source
    on source.object_code = item.object_code and source.is_active
  where item.is_active
    and coalesce(item.item_state, 'active') = 'active'
    and item.actual_vmp_date is not null
    and source.frequency_months between 1 and 120
    and proposal.due_date = (
      item.actual_vmp_date + make_interval(months => source.frequency_months)
    )::date;

  return jsonb_build_object(
    'ok', true,
    'as_of', p_as_of,
    'created', v_created,
    'unchanged', greatest(v_unchanged, 0),
    'obsolete', v_obsolete
  );
end
$function$;

create or replace function public.rpc_confirm_revalidation_proposal(
  p_proposal_id uuid,
  p_reason text,
  p_expected_version integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_proposal public.vmp_revalidation_proposals%rowtype;
  v_occurrence integer;
  v_create jsonb;
  v_code text;
begin
  if not public.vmp_can_manage_revalidation() then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if p_proposal_id is null or p_expected_version is null then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_INPUT');
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED');
  end if;

  select * into v_proposal
  from public.vmp_revalidation_proposals
  where id = p_proposal_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND');
  end if;
  if v_proposal.version <> p_expected_version then
    return jsonb_build_object(
      'ok', false, 'error_code', 'VERSION_CONFLICT',
      'current_version', v_proposal.version
    );
  end if;
  if v_proposal.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_PENDING');
  end if;

  select count(*) + 1 into v_occurrence
  from public.vmp_plan_items
  where object_code = v_proposal.object_code
    and validation_type = v_proposal.validation_type
    and year = extract(year from v_proposal.due_date)::integer;
  if v_occurrence > 99 then
    return jsonb_build_object('ok', false, 'error_code', 'OCCURRENCE_LIMIT');
  end if;

  v_create := public.rpc_create_plan_item(
    v_proposal.object_code,
    v_proposal.validation_type,
    extract(year from v_proposal.due_date)::integer,
    v_occurrence,
    '{}'::jsonb
  );
  if coalesce((v_create->>'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false, 'error_code', 'CREATE_FAILED',
      'error', coalesce(v_create->>'error', 'Không thể tạo hạng mục')
    );
  end if;
  v_code := v_create->>'validation_code';

  update public.vmp_revalidation_proposals
  set status = 'confirmed',
      version = version + 1,
      created_plan_validation_code = v_code,
      decision_reason = btrim(p_reason),
      decided_by = auth.uid(),
      decided_at = now(),
      updated_at = now()
  where id = v_proposal.id;

  insert into public.audit_logs(
    user_id, action, table_name, record_id, new_data,
    change_reason, source, validation_code, effective_business_role
  ) values (
    auth.uid(), 'APPROVAL', 'vmp_revalidation_proposals', v_proposal.id::text,
    jsonb_build_object(
      'proposal_id', v_proposal.id,
      'source_validation_code', v_proposal.validation_code,
      'created_validation_code', v_code,
      'due_date', v_proposal.due_date
    ),
    btrim(p_reason), 'dashboard', v_proposal.validation_code,
    coalesce(public.vmp_business_role(auth.uid()), 'service_role')
  );

  return jsonb_build_object(
    'ok', true,
    'proposal_id', v_proposal.id,
    'validation_code', v_code,
    'version', v_proposal.version + 1
  );
end
$function$;

create or replace function public.rpc_dismiss_revalidation_proposal(
  p_proposal_id uuid,
  p_reason text,
  p_expected_version integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_current public.vmp_revalidation_proposals%rowtype;
begin
  if not public.vmp_can_manage_revalidation() then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED');
  end if;
  select * into v_current from public.vmp_revalidation_proposals
  where id = p_proposal_id for update;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND'); end if;
  if v_current.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'error_code', 'VERSION_CONFLICT', 'current_version', v_current.version);
  end if;
  if v_current.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_PENDING');
  end if;
  update public.vmp_revalidation_proposals
  set status = 'dismissed', version = version + 1,
      decision_reason = btrim(p_reason), decided_by = auth.uid(),
      decided_at = now(), updated_at = now()
  where id = p_proposal_id;
  return jsonb_build_object('ok', true, 'proposal_id', p_proposal_id, 'version', v_current.version + 1);
end
$function$;

revoke all on function public.rpc_refresh_revalidation_proposals(date) from public, anon;
revoke all on function public.rpc_confirm_revalidation_proposal(uuid,text,integer) from public, anon;
revoke all on function public.rpc_dismiss_revalidation_proposal(uuid,text,integer) from public, anon;
grant execute on function public.rpc_refresh_revalidation_proposals(date) to authenticated, service_role;
grant execute on function public.rpc_confirm_revalidation_proposal(uuid,text,integer) to authenticated, service_role;
grant execute on function public.rpc_dismiss_revalidation_proposal(uuid,text,integer) to authenticated, service_role;

commit;

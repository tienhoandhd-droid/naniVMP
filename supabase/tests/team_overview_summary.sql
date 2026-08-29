\set ON_ERROR_STOP on
\set qa_staff_uid 'd3000000-0000-4000-8000-000000000001'
\set inactive_uid 'd3000000-0000-4000-8000-000000000002'

begin;

create function pg_temp.assert_true(p_condition boolean, p_marker text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception using errcode = 'check_violation', message = p_marker;
  end if;
end
$function$;

select pg_temp.assert_true(
  not exists (select 1 from public.vmp_plan_items where year = 2099),
  'TEAM_SUMMARY_ISOLATED_YEAR_REQUIRED'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (:'qa_staff_uid'::uuid, 'authenticated', 'authenticated',
   'team-summary-qa@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'inactive_uid'::uuid, 'authenticated', 'authenticated',
   'team-summary-inactive@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.departments (id, name, short_name)
values ('TEAM_SUMMARY_QA', 'Team summary QA fixture', 'TSQA')
on conflict (id) do update
set name = excluded.name, short_name = excluded.short_name;

insert into public.profiles (id, full_name, email, role, department, is_active)
values
  (:'qa_staff_uid'::uuid, 'Team summary QA', 'team-summary-qa@example.test',
   'department_user', 'TEAM_SUMMARY_QA', true),
  (:'inactive_uid'::uuid, 'Team summary inactive', 'team-summary-inactive@example.test',
   'qa_manager', 'TEAM_SUMMARY_QA', false)
on conflict (id) do update
set full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role,
    department = excluded.department,
    is_active = excluded.is_active;

insert into public.vmp_performers (
  performer_name, email, department, is_active, user_id, access_class
)
select 'Team summary QA', 'team-summary-qa@example.test', 'QA', true,
       :'qa_staff_uid'::uuid, 'qa_progress_editor'
where not exists (
  select 1 from public.vmp_performers where user_id = :'qa_staff_uid'::uuid
);
insert into public.vmp_performers (
  performer_name, email, department, is_active, user_id, access_class
)
select 'Team summary inactive', 'team-summary-inactive@example.test', 'QA', true,
       :'inactive_uid'::uuid, 'qa_manager'
where not exists (
  select 1 from public.vmp_performers where user_id = :'inactive_uid'::uuid
);
update public.vmp_performers
set department = 'QA', is_active = true,
    access_class = case
      when user_id = :'qa_staff_uid'::uuid then 'qa_progress_editor'
      else 'qa_manager'
    end
where user_id in (:'qa_staff_uid'::uuid, :'inactive_uid'::uuid);

insert into public.vmp_screen_permissions (
  business_role, screen_id, can_view, data_scope, actions
)
values ('qa_staff', 'overview', true, 'all', array['view'])
on conflict (business_role, screen_id) do update
set can_view = excluded.can_view,
    data_scope = excluded.data_scope,
    actions = excluded.actions;

set local session_replication_role = replica;
insert into public.vmp_objects (code, name)
values ('TEAM-SUMMARY-OBJECT', 'Team summary object fixture');
insert into public.vmp_plan_items (
  id, object_code, validation_code, criticality_score, year,
  is_active, missing_from_sheet, item_state, status_vmp, updated_at
)
values
  ('TEAM-SUMMARY-COMPLETE', 'TEAM-SUMMARY-OBJECT', 'TEAM-SUMMARY-COMPLETE', 5,
   2099, true, false, 'active', 'completed', '2099-01-01T00:00:00Z'),
  ('TEAM-SUMMARY-PENDING', 'TEAM-SUMMARY-OBJECT', 'TEAM-SUMMARY-PENDING', 5,
   2099, true, false, 'active', 'not_started', '2099-01-02T00:00:00Z'),
  ('TEAM-SUMMARY-INACTIVE', 'TEAM-SUMMARY-OBJECT', 'TEAM-SUMMARY-INACTIVE', 5,
   2099, false, false, 'active', 'completed', '2099-01-03T00:00:00Z'),
  ('TEAM-SUMMARY-MISSING', 'TEAM-SUMMARY-OBJECT', 'TEAM-SUMMARY-MISSING', 5,
   2099, true, true, 'active', 'completed', '2099-01-04T00:00:00Z'),
  ('TEAM-SUMMARY-CANCELLED', 'TEAM-SUMMARY-OBJECT', 'TEAM-SUMMARY-CANCELLED', 5,
   2099, true, false, 'cancelled', 'completed', '2099-01-05T00:00:00Z');
set local session_replication_role = origin;

select pg_temp.assert_true(
  public.vmp_business_role(:'qa_staff_uid'::uuid) = 'qa_staff',
  'TEAM_SUMMARY_QA_STAFF_FIXTURE_ROLE'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'qa_staff_uid', 'role', 'authenticated')::text,
  true
);
with payload as (
  select public.rpc_team_overview_summary(2099) as value
)
select pg_temp.assert_true(
  value->>'ok' = 'true'
    and value->>'year' = '2099'
    and value->>'total' = '2'
    and value->>'completed' = '1'
    and value->>'rate' = '50',
  'TEAM_SUMMARY_QA_STAFF_SUCCESS'
)
from payload;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'inactive_uid', 'role', 'authenticated')::text,
  true
);
select pg_temp.assert_true(
  public.rpc_team_overview_summary(2099)->>'error_code' = 'ACCOUNT_DISABLED',
  'TEAM_SUMMARY_INACTIVE_DENIAL'
);

reset role;
update public.vmp_screen_permissions
set can_view = false, data_scope = 'none', actions = '{}'::text[]
where business_role = 'qa_staff' and screen_id = 'overview';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'qa_staff_uid', 'role', 'authenticated')::text,
  true
);
select pg_temp.assert_true(
  public.rpc_team_overview_summary(2099)->>'error_code' = 'FORBIDDEN',
  'TEAM_SUMMARY_NO_OVERVIEW_DENIAL'
);

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.assert_true(
  coalesce((public.rpc_team_overview_summary(2099)->>'ok')::boolean, false),
  'TEAM_SUMMARY_SERVICE_ROLE_SUCCESS'
);

with payload as (
  select public.rpc_team_overview_summary(2099) as value
), keys as (
  select array_agg(key order by key) as names
  from payload cross join lateral jsonb_object_keys(payload.value) as key
)
select pg_temp.assert_true(
  names = array['completed', 'ok', 'rate', 'total', 'updated_at', 'year']::text[],
  'TEAM_SUMMARY_EXACT_KEYS'
)
from keys;

rollback;

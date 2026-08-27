\set ON_ERROR_STOP on

begin;

insert into public.departments (id, name, short_name)
values
  ('QA', 'QA account alignment fixture', 'QA'),
  ('qc', 'QC account alignment fixture', 'QC');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('99000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'qa-account-khoa@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('99000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'qa-account-dat@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('99000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'qa-account-viewer-one@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('99000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated',
   'qa-account-viewer-two@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('99000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated',
   'qa-account-staff@example.test', 'x', now(), '{}', '{}', now(), now());

insert into public.profiles (id, full_name, email, role, department, is_active)
values
  ('99000000-0000-4000-8000-000000000001', 'QA Integration Khoa',
   'qa-account-khoa@example.test', 'department_user', 'QA', true),
  ('99000000-0000-4000-8000-000000000002', 'QA Integration Dat',
   'qa-account-dat@example.test', 'viewer', 'qc', true),
  ('99000000-0000-4000-8000-000000000003', 'QA Integration Viewer One',
   'qa-account-viewer-one@example.test', 'viewer', null, true),
  ('99000000-0000-4000-8000-000000000004', 'QA Integration Viewer Two',
   'qa-account-viewer-two@example.test', 'viewer', null, true),
  ('99000000-0000-4000-8000-000000000005', 'QA Integration Staff',
   'qa-account-staff@example.test', 'department_user', 'QA', true);

insert into public.vmp_scope_factories (
  id, code, name, department_id, is_active
)
values (
  '99000000-0000-4000-8000-000000000101', 'QAACCOUNT_FACTORY',
  'QA account factory', 'qc', true
);

insert into public.vmp_scope_areas (id, code, name, factory_id, is_active)
values (
  '99000000-0000-4000-8000-000000000102', 'QAACCOUNT_AREA',
  'QA account area', '99000000-0000-4000-8000-000000000101', true
);

update public.vmp_performers
set department = case
      when user_id = '99000000-0000-4000-8000-000000000002'::uuid then 'qc'
      else 'QA'
    end,
    access_class = case
      when user_id in (
        '99000000-0000-4000-8000-000000000001'::uuid,
        '99000000-0000-4000-8000-000000000005'::uuid
      ) then 'qa_progress_editor'
      else null
    end,
    scope_departments = case
      when user_id = '99000000-0000-4000-8000-000000000002'::uuid
        then array['qc']::text[]
      else '{}'::text[]
    end,
    scope_factory_ids = case
      when user_id = '99000000-0000-4000-8000-000000000002'::uuid
        then array['99000000-0000-4000-8000-000000000101'::uuid]
      else '{}'::uuid[]
    end,
    scope_area_ids = case
      when user_id = '99000000-0000-4000-8000-000000000002'::uuid
        then array['99000000-0000-4000-8000-000000000102'::uuid]
      else '{}'::uuid[]
    end
where user_id between '99000000-0000-4000-8000-000000000001'::uuid
                  and '99000000-0000-4000-8000-000000000005'::uuid;

insert into public.vmp_objects (
  code, name, classification, department, area, line, frequency_months
)
values
  ('QAACCOUNT-ONE', 'QA account assigned item', 'tb', 'qc',
   'QAACCOUNT_AREA', null, 12),
  ('QAACCOUNT-TWO', 'QA account unassigned item', 'tb', 'qc',
   'QAACCOUNT_AREA', null, 12);

insert into public.vmp_plan_items (
  id, validation_code, object_code, validation_type, year, report_class,
  effort_days, deadline_protocol, deadline_validation, deadline_report,
  deadline_vmp, status_protocol, status_validation, status_report, status_vmp,
  is_active, item_state, version, departments, execution_departments,
  owner_person_id, support_person_id, source_sheet_data
)
select
  'QAACCOUNT-ONE/2026.01-PQ', 'QAACCOUNT-ONE/2026.01-PQ', 'QAACCOUNT-ONE',
  'PQ', 2026, 'Hóa lý', 5, current_date + 30, current_date + 60,
  current_date + 90, current_date + 120, 'not_started', 'not_started',
  'not_started', 'not_started', true, 'active', 1,
  array['qc'], array['qc'], performer.id, null,
  jsonb_set(
    jsonb_set(
      jsonb_build_object('values', to_jsonb(array_fill(''::text, array[20]))),
      '{values,17}', to_jsonb('QA Integration Staff'::text)
    ),
    '{values,19}', to_jsonb('QA Integration Dat'::text)
  )
from public.vmp_performers performer
where performer.user_id = '99000000-0000-4000-8000-000000000005'::uuid
  and performer.is_active;

insert into public.vmp_plan_items (
  id, validation_code, object_code, validation_type, year, report_class,
  effort_days, deadline_protocol, deadline_validation, deadline_report,
  deadline_vmp, status_protocol, status_validation, status_report, status_vmp,
  is_active, item_state, version, departments, execution_departments,
  owner_person_id, support_person_id, source_sheet_data
)
values (
  'QAACCOUNT-TWO/2026.01-PQ', 'QAACCOUNT-TWO/2026.01-PQ', 'QAACCOUNT-TWO',
  'PQ', 2026, 'Hóa lý', 5, current_date + 30, current_date + 60,
  current_date + 90, current_date + 120, 'not_started', 'not_started',
  'not_started', 'not_started', true, 'active', 1,
  array['qc'], array['qc'], null, null,
  jsonb_build_object('values', to_jsonb(array_fill(''::text, array[20])))
);

do $fixture_contract$
begin
  if public.vmp_business_role('99000000-0000-4000-8000-000000000001')
       is distinct from 'qa_staff'
     or public.vmp_business_role('99000000-0000-4000-8000-000000000002')
       is not null
     or public.vmp_business_role('99000000-0000-4000-8000-000000000005')
       is distinct from 'qa_staff'
     or (select count(*) from public.profiles
         where role::text = 'viewer' and coalesce(is_active, true)) <> 3 then
    raise exception using errcode = 'check_violation',
      message = 'QA_ACCOUNT_MANIFEST_FIXTURE_STATE';
  end if;
end
$fixture_contract$;

commit;

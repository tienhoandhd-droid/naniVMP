\set ON_ERROR_STOP on

-- Behavioural contract for the three catalog write RPCs.  This file is
-- deliberately self-contained and always rolls its synthetic fixture back.
begin;

-- Own this FK fixture so a fresh production clone needs no pre-seeding.
insert into public.departments(id,name,short_name)
values('QA','QA rollback fixture','QAU') on conflict(id) do nothing;

create temporary table crud_catalog_results(
  scenario_id text primary key, passed boolean not null
) on commit drop;

create function pg_temp.ok(p_condition boolean, p_id text) returns void
language plpgsql security definer set search_path=pg_temp,pg_catalog as $$
begin
  insert into crud_catalog_results values(p_id,p_condition is true)
  on conflict(scenario_id) do update set passed=excluded.passed;
  raise notice '% %',case when p_condition is true then 'PASS' else 'FAIL' end,p_id;
end $$;

create function pg_temp.code(p_value jsonb, p_code text, p_id text) returns void
language plpgsql as $$
begin
  perform pg_temp.ok(
    coalesce((p_value->>'ok')::boolean,false)=false
    and p_value->>'error_code'=p_code, p_id);
end $$;

create function pg_temp.actor(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',p_id,'role','authenticated')::text,true);
end $$;

create function pg_temp.audit_count() returns bigint language sql stable security definer
set search_path=pg_catalog,public as $$ select count(*) from public.audit_logs $$;
create function pg_temp.source_row(p_code text) returns jsonb language sql stable security definer
set search_path=pg_catalog,public as $$ select to_jsonb(s) from public.vmp_source_objects s where object_code=p_code $$;
create function pg_temp.pending_row(p_id uuid) returns jsonb language sql stable security definer
set search_path=pg_catalog,public as $$ select to_jsonb(c) from public.vmp_catalog_changes c where id=p_id $$;
create function pg_temp.product_row(p_code text) returns jsonb language sql stable security definer
set search_path=pg_catalog,public as $$ select to_jsonb(p) from public.vmp_products_gmp p where bfo_code=p_code $$;
create function pg_temp.alert_row(p_id uuid) returns jsonb language sql stable security definer
set search_path=pg_catalog,public as $$ select to_jsonb(a) from public.vmp_alert_recipients a where id=p_id $$;
create function pg_temp.alert_email_row(p_email text) returns jsonb language sql stable security definer
set search_path=pg_catalog,public as $$ select to_jsonb(a) from public.vmp_alert_recipients a where email=p_email $$;
create function pg_temp.audit_id(p_actor uuid,p_table text) returns uuid language sql stable security definer
set search_path=pg_catalog,public as $$ select id from public.audit_logs where user_id=p_actor
and table_name=p_table order by created_at,id limit 1 $$;
create function pg_temp.audit_has(p_actor uuid,p_table text,p_record text,p_action text,
 p_reason text,p_source text,p_role text,p_old jsonb,p_new jsonb,p_old_must_be_null boolean default false,
 p_changed text[] default null) returns boolean language sql stable security definer
set search_path=pg_catalog,public as $$ select exists(select 1 from public.audit_logs a
 where a.user_id=p_actor and a.table_name=p_table and a.record_id=p_record
 and a.action::text=p_action and a.change_reason is not distinct from p_reason
 and a.source=p_source and a.effective_business_role=p_role
 and (not p_old_must_be_null or a.old_data is null)
 and (p_old is null or a.old_data @> p_old) and (p_new is null or a.new_data @> p_new)
 and (p_changed is null or a.changed_fields=p_changed)) $$;
create function pg_temp.audit_digest() returns text language sql stable security definer
set search_path=pg_catalog,public as $$ select md5(string_agg(id::text||':'||coalesce(new_data::text,''),'|' order by id)) from public.audit_logs $$;

insert into public.departments(id,name,short_name)
values ('CRUD_SQL_WS','CRUD SQL workshop','CSW') on conflict(id) do nothing;

insert into public.vmp_email_cho_phep(email,ghi_chu)
select email,'CRUD catalog rollback fixture' from (values
 ('crud-sql-admin@example.test'),('crud-sql-qa-manager@example.test'),
 ('crud-sql-qa-staff@example.test'),('crud-sql-workshop-manager@example.test'),
 ('crud-sql-workshop-staff@example.test'),('crud-sql-inactive@example.test')
) f(email) on conflict(email) do update set is_active=true;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'authenticated','authenticated',email,'not-used',now(),'{}','{}',now(),now()
from (values
 ('a8100000-0000-4000-8000-000000000001'::uuid,'crud-sql-admin@example.test'),
 ('a8100000-0000-4000-8000-000000000002'::uuid,'crud-sql-qa-manager@example.test'),
 ('a8100000-0000-4000-8000-000000000003'::uuid,'crud-sql-qa-staff@example.test'),
 ('a8100000-0000-4000-8000-000000000004'::uuid,'crud-sql-workshop-manager@example.test'),
 ('a8100000-0000-4000-8000-000000000005'::uuid,'crud-sql-workshop-staff@example.test'),
 ('a8100000-0000-4000-8000-000000000006'::uuid,'crud-sql-inactive@example.test')
) f(id,email);

insert into public.profiles(id,full_name,email,role,department,is_active) values
 ('a8100000-0000-4000-8000-000000000001','CRUD SQL Admin','crud-sql-admin@example.test','admin',null,true),
 ('a8100000-0000-4000-8000-000000000002','CRUD SQL QA manager','crud-sql-qa-manager@example.test','qa_manager','QA',true),
 ('a8100000-0000-4000-8000-000000000003','CRUD SQL QA staff','crud-sql-qa-staff@example.test','department_user','QA',true),
 ('a8100000-0000-4000-8000-000000000004','CRUD SQL workshop manager','crud-sql-workshop-manager@example.test','department_user','CRUD_SQL_WS',true),
 ('a8100000-0000-4000-8000-000000000005','CRUD SQL workshop staff','crud-sql-workshop-staff@example.test','department_user','CRUD_SQL_WS',true),
 ('a8100000-0000-4000-8000-000000000006','CRUD SQL inactive','crud-sql-inactive@example.test','qa_manager','QA',false)
on conflict(id) do update set full_name=excluded.full_name,email=excluded.email,
 role=excluded.role,department=excluded.department,is_active=excluded.is_active;

update public.vmp_performers set department='QA',access_class='qa_manager',is_active=true
where user_id='a8100000-0000-4000-8000-000000000002';
update public.vmp_performers set department='QA',access_class='qa_progress_editor',is_active=true
where user_id='a8100000-0000-4000-8000-000000000003';
update public.vmp_performers set department='CRUD_SQL_WS',access_class='equipment_manager',is_active=true
where user_id='a8100000-0000-4000-8000-000000000004';
update public.vmp_performers set department='CRUD_SQL_WS',access_class='workshop_staff',is_active=true
where user_id='a8100000-0000-4000-8000-000000000005';
update public.vmp_performers set department='QA',access_class='qa_manager',is_active=false
where user_id='a8100000-0000-4000-8000-000000000006';

do $$
declare r record;
begin
  for r in select * from (values
    ('a8100000-0000-4000-8000-000000000001'::uuid,'admin'),
    ('a8100000-0000-4000-8000-000000000002'::uuid,'qa_manager'),
    ('a8100000-0000-4000-8000-000000000003'::uuid,'qa_staff'),
    ('a8100000-0000-4000-8000-000000000004'::uuid,'workshop_manager'),
    ('a8100000-0000-4000-8000-000000000005'::uuid,'workshop_staff')
  ) x(id,expected_role) loop
    perform pg_temp.ok(public.vmp_business_role(r.id)=r.expected_role,
      'CAT_ROLE_'||upper(r.expected_role));
  end loop;
end $$;

set local role authenticated;

-- Both writer roles exercise create, edit, explicit null, numeric zero,
-- duplicate/upsert semantics, optimistic versioning and soft deactivation.
do $$
declare r record; j jsonb; v integer; aid uuid; sid uuid; audit_id uuid;
  before_audit bigint; d text;
begin
 for r in select * from (values
   ('a8100000-0000-4000-8000-000000000001'::uuid,'ADMIN','A'),
   ('a8100000-0000-4000-8000-000000000002'::uuid,'QA_MANAGER','Q')
 ) x(uid,label,suffix) loop
  perform pg_temp.actor(r.uid);

  before_audit:=pg_temp.audit_count();
  j:=public.rpc_save_catalog_object('Thiết bị','CRUD-SQL-SRC-'||r.suffix,
    jsonb_build_object('object_name','Source create '||r.suffix,'note','seed'),null,null);
  perform pg_temp.ok((j->>'ok')::boolean,'CAT_SRC_'||r.label||'_CREATE');
  v:=(j->>'version')::integer;
  sid:=(pg_temp.source_row('CRUD-SQL-SRC-'||r.suffix)->>'id')::uuid;
  perform pg_temp.ok(v=2 and sid is not null,
    'CAT_SRC_'||r.label||'_CREATE_PERSISTED');
  perform pg_temp.ok(pg_temp.audit_has(r.uid,'vmp_source_objects',sid::text,'INSERT',null,
    'source_catalog_access_save',lower(r.label),null,
    jsonb_build_object('object_name','Source create '||r.suffix),true),
    'CAT_SRC_'||r.label||'_CREATE_AUDIT_EXACT');
  j:=public.rpc_save_catalog_object('Thiết bị','CRUD-SQL-SRC-'||r.suffix,
    '{"note":null,"workdays":0}'::jsonb,'zero and explicit null',v);
  perform pg_temp.ok((j->>'ok')::boolean,'CAT_SRC_'||r.label||'_DUPLICATE_IS_UPSERT');
  perform pg_temp.ok((j->>'pending_timeline')::boolean and
    pg_temp.pending_row((j->>'change_id')::uuid)->'new_data' @> '{"workdays":0}'::jsonb and
    pg_temp.pending_row((j->>'change_id')::uuid)->>'created_by'=r.uid::text,
    'CAT_SRC_'||r.label||'_ZERO_STAGED_EXACT');
  v:=(j->>'version')::integer;
  perform pg_temp.ok(pg_temp.source_row('CRUD-SQL-SRC-'||r.suffix)->'note'='null'::jsonb,
    'CAT_SRC_'||r.label||'_EXPLICIT_NULL_CLEARS');
  perform pg_temp.code(public.rpc_save_catalog_object('Thiết bị','CRUD-SQL-SRC-'||r.suffix,
    '{"note":"stale"}',null,v-1),'VERSION_CONFLICT','CAT_SRC_'||r.label||'_VERSION_CONFLICT');
  perform pg_temp.code(public.rpc_save_catalog_object('Thiết bị','CRUD-SQL-SRC-'||r.suffix,
    '[]'::jsonb,null,v),'PATCH_INVALID','CAT_SRC_'||r.label||'_INVALID_PAYLOAD');
  perform pg_temp.code(public.rpc_save_catalog_object('Thiết bị','CRUD-SQL-SRC-'||r.suffix,
    '{"unknown":1}'::jsonb,null,v),'PATCH_FIELD_NOT_ALLOWED','CAT_SRC_'||r.label||'_UNKNOWN_FIELD');
  perform pg_temp.code(public.rpc_save_catalog_object('Thiết bị','CRUD-SQL-SRC-'||r.suffix,
    '{"is_active":false}'::jsonb,null,v),'REASON_REQUIRED','CAT_SRC_'||r.label||'_DEACTIVATE_REASON');
  j:=public.rpc_save_catalog_object('Thiết bị','CRUD-SQL-SRC-'||r.suffix,
    '{"is_active":false}'::jsonb,'retire source',v);
  perform pg_temp.ok((j->>'ok')::boolean and (j->>'pending_timeline')::boolean,
    'CAT_SRC_'||r.label||'_DEACTIVATE_STAGED');
  perform pg_temp.ok(pg_temp.audit_has(r.uid,'vmp_source_objects',sid::text,'UPDATE','retire source',
    'source_catalog_access_save',lower(r.label),'{"is_active":true}','{"is_active":true}',false,
    array['is_active']::text[]),
    'CAT_SRC_'||r.label||'_DEACTIVATE_AUDIT_EXACT');

  j:=public.rpc_save_product_gmp('CRUD-SQL-PROD-'||r.suffix,
    jsonb_build_object('product_name','Product '||r.suffix,'final_batch_size','0','note','seed'),null,null);
  perform pg_temp.ok((j->>'ok')::boolean,'CAT_PROD_'||r.label||'_CREATE');
  v:=(j->>'version')::integer;
  perform pg_temp.ok(pg_temp.audit_has(r.uid,'vmp_products_gmp','CRUD-SQL-PROD-'||r.suffix,
    'INSERT',null,'rpc_save_product_gmp',lower(r.label),null,jsonb_build_object(
      'product_name','Product '||r.suffix,'final_batch_size','0','note','seed')),
    'CAT_PROD_'||r.label||'_CREATE_AUDIT_EXACT');
  j:=public.rpc_save_product_gmp('CRUD-SQL-PROD-'||r.suffix,
    '{"note":null,"batch_size":"0"}'::jsonb,'duplicate key is edit',v);
  perform pg_temp.ok((j->>'ok')::boolean and (j->>'version')::integer=v+1,
    'CAT_PROD_'||r.label||'_DUPLICATE_IS_UPSERT');
  perform pg_temp.ok(pg_temp.product_row('CRUD-SQL-PROD-'||r.suffix)->'note'='null'::jsonb,
    'CAT_PROD_'||r.label||'_EXPLICIT_NULL_CLEARS');
  v:=(j->>'version')::integer;
  perform pg_temp.code(public.rpc_save_product_gmp('CRUD-SQL-PROD-'||r.suffix,
    '{"note":"stale"}',null,v-1),'VERSION_CONFLICT','CAT_PROD_'||r.label||'_VERSION_CONFLICT');
  perform pg_temp.code(public.rpc_save_product_gmp('CRUD-SQL-PROD-'||r.suffix,
    '{"unknown":1}',null,v),'PATCH_FIELD_NOT_ALLOWED','CAT_PROD_'||r.label||'_INVALID_PAYLOAD');
  perform pg_temp.code(public.rpc_save_product_gmp('CRUD-SQL-PROD-'||r.suffix,
    '{"is_active":false}',null,v),'REASON_REQUIRED','CAT_PROD_'||r.label||'_DEACTIVATE_REASON');
  j:=public.rpc_save_product_gmp('CRUD-SQL-PROD-'||r.suffix,
    '{"is_active":false}','retire product',v);
  perform pg_temp.ok((j->>'ok')::boolean and (pg_temp.product_row('CRUD-SQL-PROD-'||r.suffix)->>'is_active')::boolean=false,
    'CAT_PROD_'||r.label||'_DEACTIVATE');
  perform pg_temp.ok(pg_temp.audit_has(r.uid,'vmp_products_gmp','CRUD-SQL-PROD-'||r.suffix,
    'UPDATE','retire product','rpc_save_product_gmp',lower(r.label),'{"is_active":true}',
    '{"is_active":false}'),
    'CAT_PROD_'||r.label||'_DEACTIVATE_AUDIT_EXACT');

  j:=public.rpc_save_alert_recipient(null,jsonb_build_object('email','crud-sql-alert-'||lower(r.suffix)||'@example.test',
    'recipient_name','Alert '||r.suffix,'threshold_days',0,'note','seed'),null,null);
  perform pg_temp.ok((j->>'ok')::boolean,'CAT_ALERT_'||r.label||'_CREATE_ZERO');
  aid:=(j->>'id')::uuid;
  v:=(j->>'version')::integer;
  perform pg_temp.ok(pg_temp.audit_has(r.uid,'vmp_alert_recipients',aid::text,'INSERT',null,
    'rpc_save_alert_recipient',lower(r.label),null,'{"threshold_days":0}'),
    'CAT_ALERT_'||r.label||'_CREATE_AUDIT_EXACT');
  j:=public.rpc_save_alert_recipient(aid,'{"note":null,"scope":""}', 'explicit null edit',v);
  perform pg_temp.ok((j->>'ok')::boolean and (j->>'version')::integer=v+1,
    'CAT_ALERT_'||r.label||'_DUPLICATE_ID_IS_EDIT');
  perform pg_temp.ok(pg_temp.alert_row(aid)->'note'='null'::jsonb,
    'CAT_ALERT_'||r.label||'_EXPLICIT_NULL_CLEARS');
  v:=(j->>'version')::integer;
  perform pg_temp.code(public.rpc_save_alert_recipient(aid,'{"note":"stale"}',null,v-1),
    'VERSION_CONFLICT','CAT_ALERT_'||r.label||'_VERSION_CONFLICT');
  perform pg_temp.code(public.rpc_save_alert_recipient(aid,'{"unknown":1}',null,v),
    'PATCH_FIELD_NOT_ALLOWED','CAT_ALERT_'||r.label||'_INVALID_PAYLOAD');
  perform pg_temp.code(public.rpc_save_alert_recipient(aid,'{"is_enabled":false}',null,v),
    'REASON_REQUIRED','CAT_ALERT_'||r.label||'_DEACTIVATE_REASON');
  j:=public.rpc_save_alert_recipient(aid,'{"is_enabled":false}','retire alert',v);
  perform pg_temp.ok((j->>'ok')::boolean and (pg_temp.alert_row(aid)->>'is_enabled')::boolean=false,
    'CAT_ALERT_'||r.label||'_DEACTIVATE');
  perform pg_temp.ok(pg_temp.audit_has(r.uid,'vmp_alert_recipients',aid::text,'UPDATE',
    'retire alert','rpc_save_alert_recipient',lower(r.label),'{"is_enabled":true}',
    '{"is_enabled":false}'),
    'CAT_ALERT_'||r.label||'_DEACTIVATE_AUDIT_EXACT');
  perform pg_temp.ok(pg_temp.audit_count()>before_audit,
    'CAT_'||r.label||'_AUDIT_WRITTEN');

  foreach d in array array['vmp_source_objects','vmp_products_gmp','vmp_alert_recipients'] loop
    audit_id:=pg_temp.audit_id(r.uid,d);
    j:=public.rpc_catalog_history(jsonb_build_object('table_name',d),200,0);
    perform pg_temp.ok((j->>'ok')::boolean and (j->>'total')::integer>0,
      'CAT_HISTORY_'||r.label||'_'||upper(d)||'_LISTED');
    j:=public.rpc_catalog_history_detail(audit_id);
    perform pg_temp.ok((j->>'ok')::boolean and j#>>'{history,id}'=audit_id::text,
      'CAT_HISTORY_'||r.label||'_'||upper(d)||'_DETAIL');
  end loop;
 end loop;
end $$;

-- Every non-writer role is tested separately for create, edit and deactivate
-- in each domain.  FORBIDDEN must be a structured decision and leave both
-- business rows and audit count unchanged.
do $$
declare r record; d text; op text; j jsonb; n bigint; snap jsonb;
begin
 for r in select * from (values
  ('a8100000-0000-4000-8000-000000000003'::uuid,'QA_STAFF','FORBIDDEN'),
  ('a8100000-0000-4000-8000-000000000004'::uuid,'WORKSHOP_MANAGER','FORBIDDEN'),
  ('a8100000-0000-4000-8000-000000000005'::uuid,'WORKSHOP_STAFF','FORBIDDEN'),
  ('a8100000-0000-4000-8000-000000000006'::uuid,'INACTIVE','ACCOUNT_DISABLED')
 ) x(uid,label,expected) loop
  perform pg_temp.actor(r.uid);
  foreach d in array array['SRC','PROD','ALERT'] loop
   foreach op in array array['CREATE','EDIT','DEACTIVATE'] loop
    n:=pg_temp.audit_count();
    if d='SRC' then
      snap:=jsonb_build_array(
        pg_temp.source_row('CRUD-SQL-DENY-'||r.label),
        pg_temp.source_row('CRUD-SQL-SRC-A'));
      j:=public.rpc_save_catalog_object('Thiết bị',case when op='CREATE' then 'CRUD-SQL-DENY-'||r.label else 'CRUD-SQL-SRC-A' end,
        case when op='DEACTIVATE' then '{"is_active":false}'::jsonb else '{"note":"denied"}'::jsonb end,'deny probe',null);
    elsif d='PROD' then
      snap:=jsonb_build_array(
        pg_temp.product_row('CRUD-SQL-DENY-'||r.label),
        pg_temp.product_row('CRUD-SQL-PROD-A'));
      j:=public.rpc_save_product_gmp(case when op='CREATE' then 'CRUD-SQL-DENY-'||r.label else 'CRUD-SQL-PROD-A' end,
        case when op='DEACTIVATE' then '{"is_active":false}'::jsonb else '{"note":"denied"}'::jsonb end,'deny probe',null);
    else
      snap:=jsonb_build_array(
        pg_temp.alert_email_row('deny-'||lower(r.label)||'@example.test'),
        pg_temp.alert_row('a8110000-0000-4000-8000-000000000001'::uuid));
      j:=public.rpc_save_alert_recipient(case when op='CREATE' then
          null::uuid
          else 'a8110000-0000-4000-8000-000000000001'::uuid end,
        case when op='CREATE' then jsonb_build_object('email','deny-'||lower(r.label)||'@example.test')
             when op='DEACTIVATE' then '{"is_enabled":false}'::jsonb else '{"note":"denied"}'::jsonb end,
        'deny probe',null);
    end if;
    perform pg_temp.code(j,r.expected,'CAT_'||d||'_'||r.label||'_'||op||'_DENIED');
    perform pg_temp.ok(snap is not distinct from case when d='SRC' then
        jsonb_build_array(pg_temp.source_row('CRUD-SQL-DENY-'||r.label),pg_temp.source_row('CRUD-SQL-SRC-A'))
      when d='PROD' then
        jsonb_build_array(pg_temp.product_row('CRUD-SQL-DENY-'||r.label),pg_temp.product_row('CRUD-SQL-PROD-A'))
      else jsonb_build_array(
        pg_temp.alert_email_row('deny-'||lower(r.label)||'@example.test'),
        pg_temp.alert_row('a8110000-0000-4000-8000-000000000001'::uuid)) end,
      'CAT_'||d||'_'||r.label||'_'||op||'_NO_BUSINESS_DELTA');
    perform pg_temp.ok(pg_temp.audit_count()=n,
      'CAT_'||d||'_'||r.label||'_'||op||'_NO_AUDIT');
   end loop;
  end loop;
 end loop;
end $$;

-- Anonymous callers have no EXECUTE grant.  Match the exact privilege error;
-- any other exception is deliberately allowed to abort the file.
reset role;
set local role anon;
do $$
declare d text;
begin
 foreach d in array array['SRC','PROD','ALERT'] loop
  begin
   if d='SRC' then perform public.rpc_save_catalog_object('Thiết bị','CRUD-SQL-ANON','{}',null,null);
   elsif d='PROD' then perform public.rpc_save_product_gmp('CRUD-SQL-ANON','{}',null,null);
   else perform public.rpc_save_alert_recipient(null,'{"email":"anon@example.test"}',null,null);
   end if;
   raise exception using errcode='check_violation',message='CAT_'||d||'_ANON_UNEXPECTED_ALLOW';
  exception when insufficient_privilege then
   if sqlstate<>'42501' then raise; end if;
   raise notice 'PASS CAT_%_ANON_EXECUTE_DENIED',d;
  end;
 end loop;
end $$;

-- There is no physical-delete product API.  Authenticated direct DML and all
-- audit mutation are privilege-denied, and the checked rows remain unchanged.
reset role;
do $$ declare before_digest text; begin
 before_digest:=pg_temp.audit_digest();
 perform pg_temp.actor('a8100000-0000-4000-8000-000000000001');
 execute 'set local role authenticated';
 begin delete from public.vmp_products_gmp where bfo_code='CRUD-SQL-PROD-A';
  raise exception using errcode='check_violation',message='CAT_PRODUCT_DIRECT_DELETE_UNEXPECTED_ALLOW';
 exception when insufficient_privilege then
  if sqlstate<>'42501' then raise; end if; raise notice 'PASS CAT_PRODUCT_DIRECT_DELETE_DENIED'; end;
 begin delete from public.vmp_source_objects where object_code='CRUD-SQL-SRC-A';
  raise exception using errcode='check_violation',message='CAT_SOURCE_DIRECT_DELETE_UNEXPECTED_ALLOW';
 exception when insufficient_privilege then
  if sqlstate<>'42501' then raise; end if; raise notice 'PASS CAT_SOURCE_DIRECT_DELETE_DENIED'; end;
 begin delete from public.vmp_alert_recipients where email='crud-sql-alert-a@example.test';
  raise exception using errcode='check_violation',message='CAT_ALERT_DIRECT_DELETE_UNEXPECTED_ALLOW';
 exception when insufficient_privilege then
  if sqlstate<>'42501' then raise; end if; raise notice 'PASS CAT_ALERT_DIRECT_DELETE_DENIED'; end;
 begin update public.audit_logs set change_reason='tampered' where table_name like 'vmp_%';
  raise exception using errcode='check_violation',message='CAT_AUDIT_UPDATE_UNEXPECTED_ALLOW';
 exception when insufficient_privilege then
  if sqlstate<>'42501' then raise; end if; raise notice 'PASS CAT_AUDIT_UPDATE_DENIED'; end;
 begin delete from public.audit_logs where table_name like 'vmp_%';
  raise exception using errcode='check_violation',message='CAT_AUDIT_DELETE_UNEXPECTED_ALLOW';
 exception when insufficient_privilege then
  if sqlstate<>'42501' then raise; end if; raise notice 'PASS CAT_AUDIT_DELETE_DENIED'; end;
 execute 'reset role';
 perform pg_temp.ok(pg_temp.product_row('CRUD-SQL-PROD-A') is not null,
   'CAT_PRODUCT_DIRECT_DELETE_NO_CHANGE');
 perform pg_temp.ok(pg_temp.source_row('CRUD-SQL-SRC-A') is not null,
   'CAT_SOURCE_DIRECT_DELETE_NO_CHANGE');
 perform pg_temp.ok(pg_temp.alert_email_row('crud-sql-alert-a@example.test') is not null,
   'CAT_ALERT_DIRECT_DELETE_NO_CHANGE');
 perform pg_temp.ok(before_digest is not distinct from pg_temp.audit_digest(),
   'CAT_AUDIT_IMMUTABLE_NO_CHANGE');
end $$;

reset role;
do $$
declare failures text;
begin
 select string_agg(scenario_id,', ' order by scenario_id) into failures
 from pg_temp.crud_catalog_results where not passed;
 if failures is not null then
   raise exception using errcode='check_violation',
     message='CRUD_CATALOG_FAILURES: '||failures;
 end if;
 raise notice 'PASS CRUD_CATALOG_ALL_SCENARIOS';
end $$;

rollback;

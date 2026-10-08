\set ON_ERROR_STOP on
begin;
set local statement_timeout='60s';
set local lock_timeout='5s';

create temporary table source_assignment_checks(id text primary key,passed boolean not null) on commit drop;
grant insert,select on source_assignment_checks to authenticated,anon;
create function pg_temp.check_result(ok boolean,id text)returns void language plpgsql as $$begin
 insert into source_assignment_checks values(id,coalesce(ok,false));
 raise notice '% %',case when coalesce(ok,false)then'PASS'else'FAIL'end,id;
end$$;
create function pg_temp.actor(n integer,active_role text default 'authenticated')returns void language plpgsql as $$begin
 perform set_config('request.jwt.claims',case when n is null then jsonb_build_object('role',active_role)::text
  else jsonb_build_object('sub','a8600000-0000-4000-8000-'||lpad(n::text,12,'0'),'role',active_role)::text end,true);
end$$;
create function pg_temp.must_state(statement text,expected_state text)returns boolean
language plpgsql security invoker as $$begin
 execute statement;
 return false;
exception when others then
 return sqlstate=expected_state;
end$$;
create function pg_temp.person(n integer)returns uuid language sql stable security definer set search_path=''as $$
 select id from public.vmp_performers where user_id=('a8600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.source_row()returns jsonb language sql stable security definer set search_path=''as $$
 select to_jsonb(s)from public.vmp_source_objects s where object_kind='Thiết bị'and object_code='CRUD-ASSIGN-SRC'$$;
create function pg_temp.grant_row(id uuid)returns jsonb language sql stable security definer set search_path=''as $$
 select to_jsonb(g)from public.vmp_source_workshop_scope_grants g where g.id=$1$$;
create function pg_temp.audit_rows(tab text)returns setof public.audit_logs language sql stable security definer set search_path=''as $$
 select * from public.audit_logs where table_name=tab and user_id::text like'a8600000-%'$$;
create function pg_temp.effects()returns text language sql stable security definer set search_path=''as $$
 select md5(jsonb_build_array(
  (select to_jsonb(s)from public.vmp_source_objects s where s.object_code='CRUD-ASSIGN-SRC'),
  (select jsonb_agg(to_jsonb(i)order by i.id)from public.vmp_plan_items i where i.object_code='CRUD-ASSIGN-SRC'),
  (select jsonb_agg(to_jsonb(a)order by a.id)from public.vmp_item_assignments a where a.validation_code like'CRUD-ASSIGN-SRC/%'),
  (select jsonb_agg(to_jsonb(g)order by g.id)from public.vmp_source_workshop_scope_grants g where g.department='CRUD_ASSIGN_WS'),
  (select jsonb_agg(to_jsonb(a)order by a.created_at,a.id)from public.audit_logs a where a.user_id::text like'a8600000-%'))::text)$$;

insert into public.departments(id,name,short_name)values
 ('QA','Source assignment test QA','QA'),('CRUD_ASSIGN_WS','Source assignment test workshop','CAS')on conflict do nothing;
insert into public.vmp_email_cho_phep(email,ghi_chu)
select 'crud-assign-'||r||'@example.test','rollback fixture'from unnest(array[
 'admin','qa-manager','qa-staff','workshop-manager','workshop-staff','inactive'])r;
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('a8600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated',
 'crud-assign-'||r||'@example.test','not-used',now(),'{}','{}',now(),now()
from unnest(array['admin','qa-manager','qa-staff','workshop-manager','workshop-staff','inactive'])with ordinality x(r,n);
insert into public.profiles(id,full_name,email,role,department,is_active)
select ('a8600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'CRUD Assign '||r,
 'crud-assign-'||r||'@example.test',case when n=1 then'admin'when n=2 or n=6 then'qa_manager'else'department_user'end::public.user_role,
 case when n in(4,5)then'CRUD_ASSIGN_WS'else'QA'end,n<>6
from unnest(array['admin','qa-manager','qa-staff','workshop-manager','workshop-staff','inactive'])with ordinality x(r,n)
on conflict(id)do update set full_name=excluded.full_name,email=excluded.email,role=excluded.role,
 department=excluded.department,is_active=excluded.is_active;
update public.vmp_performers set department=case when right(user_id::text,1)in('4','5')then'CRUD_ASSIGN_WS'else'QA'end,
 access_class=case right(user_id::text,1)when'2'then'qa_manager'when'3'then'qa_progress_editor'
  when'4'then'equipment_manager'when'5'then'workshop_staff'when'6'then'qa_manager'else'view_only'end,
 is_active=right(user_id::text,1)<>'6'where user_id::text like'a8600000-%';
do $$declare n int;actual text;expected text[]:=array['admin','qa_manager','qa_staff','workshop_manager','workshop_staff'];begin
 for n in 1..5 loop actual:=public.vmp_business_role(('a8600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid);
  assert actual is not distinct from expected[n],'SOURCE_ASSIGN fixture role mismatch';end loop;
end$$;

insert into public.vmp_objects(code,name,classification,department,area,line)
values('CRUD-ASSIGN-SRC','Source assignment synthetic','tb','CRUD_ASSIGN_WS','CRUD_ASSIGN_AREA','CRUD_ASSIGN_LINE');
insert into public.vmp_source_objects(object_kind,object_code,object_name,department,area_code,line,
 validate_flag,frequency_months,first_month,year_ref,source_tab,source_row)
values('Thiết bị','CRUD-ASSIGN-SRC','Source assignment synthetic','CRUD_ASSIGN_WS','CRUD_ASSIGN_AREA',
 'CRUD_ASSIGN_LINE','y',12,1,2026,'crud-assign',1);
insert into public.vmp_plan_items(id,validation_code,object_code,validation_type,year,is_active,item_state,version,
 departments,execution_departments)
values('CRUD-ASSIGN-SRC/2026.01-PQ','CRUD-ASSIGN-SRC/2026.01-PQ','CRUD-ASSIGN-SRC','PQ',2026,true,'active',1,
 array['CRUD_ASSIGN_WS'],array['CRUD_ASSIGN_WS']);

set local role authenticated;
select pg_temp.actor(1);
do $$declare j jsonb;v int;sid text;before_state text;begin
 -- Admin assigns both Source QA relationships in one versioned save.
 v:=(pg_temp.source_row()->>'version')::int;
 j:=public.rpc_save_catalog_object('Thiết bị','CRUD-ASSIGN-SRC',jsonb_build_object(
  'owner_person_id',pg_temp.person(2),'support_person_id',pg_temp.person(3)),
  'Admin assigns Source owner and support',v);
 perform pg_temp.check_result(j->>'ok'='true'and(j->>'version')::int=v+1
  and pg_temp.source_row()->>'owner_person_id'=pg_temp.person(2)::text
  and pg_temp.source_row()->>'support_person_id'=pg_temp.person(3)::text,'SASSIGN_ADMIN_ASSIGN_PERSIST_VERSION');
 sid:=pg_temp.source_row()->>'id';
 perform pg_temp.check_result(exists(select 1 from pg_temp.audit_rows('vmp_source_objects')a
  where a.user_id='a8600000-0000-4000-8000-000000000001'and a.record_id=sid
   and a.action::text='UPDATE'and a.change_reason='Admin assigns Source owner and support'
   and a.source='source_catalog_access_save'and a.effective_business_role='admin'
   and a.old_data->>'owner_person_id'is null and a.old_data->>'support_person_id'is null
   and a.new_data->>'owner_person_id'=pg_temp.person(2)::text
   and a.new_data->>'support_person_id'=pg_temp.person(3)::text),'SASSIGN_ADMIN_ASSIGN_AUDIT_EXACT');

 -- QA manager changes both relationships, then clears each explicitly.
 perform pg_temp.actor(2);v:=(pg_temp.source_row()->>'version')::int;
 j:=public.rpc_save_catalog_object('Thiết bị','CRUD-ASSIGN-SRC',jsonb_build_object(
  'owner_person_id',pg_temp.person(3),'support_person_id',pg_temp.person(2)),
  'QA manager changes Source assignments',v);
 perform pg_temp.check_result(j->>'ok'='true'and(j->>'version')::int=v+1
  and pg_temp.source_row()->>'owner_person_id'=pg_temp.person(3)::text
  and pg_temp.source_row()->>'support_person_id'=pg_temp.person(2)::text,'SASSIGN_QAM_CHANGE_PERSIST_VERSION');
 perform pg_temp.check_result(exists(select 1 from pg_temp.audit_rows('vmp_source_objects')a
  where a.user_id='a8600000-0000-4000-8000-000000000002'and a.record_id=sid
   and a.change_reason='QA manager changes Source assignments'and a.effective_business_role='qa_manager'
   and a.old_data->>'owner_person_id'=pg_temp.person(2)::text
   and a.old_data->>'support_person_id'=pg_temp.person(3)::text
   and a.new_data->>'owner_person_id'=pg_temp.person(3)::text
   and a.new_data->>'support_person_id'=pg_temp.person(2)::text),'SASSIGN_QAM_CHANGE_AUDIT_EXACT');
 v:=(pg_temp.source_row()->>'version')::int;
 j:=public.rpc_save_catalog_object('Thiết bị','CRUD-ASSIGN-SRC','{"owner_person_id":null,"support_person_id":null}',
  'QA manager clears Source assignments',v);
 perform pg_temp.check_result(j->>'ok'='true'and(j->>'version')::int=v+1
  and pg_temp.source_row()->>'owner_person_id'is null and pg_temp.source_row()->>'support_person_id'is null,
  'SASSIGN_QAM_CLEAR_PERSIST_VERSION');
 perform pg_temp.check_result(exists(select 1 from pg_temp.audit_rows('vmp_source_objects')a
  where a.user_id='a8600000-0000-4000-8000-000000000002'and a.record_id=sid
   and a.change_reason='QA manager clears Source assignments'
   and a.old_data->>'owner_person_id'=pg_temp.person(3)::text
   and a.old_data->>'support_person_id'=pg_temp.person(2)::text
   and a.new_data->'owner_person_id'='null'::jsonb and a.new_data->'support_person_id'='null'::jsonb),
  'SASSIGN_QAM_CLEAR_AUDIT_EXACT');
 -- Stale writes are rejected without Source, projection, or audit changes.
 before_state:=pg_temp.effects();
 j:=public.rpc_save_catalog_object('Thiết bị','CRUD-ASSIGN-SRC',jsonb_build_object('owner_person_id',pg_temp.person(2)),
  'Stale assignment',v);
 perform pg_temp.check_result(j->>'error_code'='VERSION_CONFLICT'and pg_temp.effects()=before_state,
  'SASSIGN_STALE_NO_EFFECT');
end$$;

-- Every remaining authenticated role receives the same valid mutation and is denied before any effect.
do $$declare n int;j jsonb;v int;before_state text;expected text;begin
 for n in 3..6 loop perform pg_temp.actor(n);v:=(pg_temp.source_row()->>'version')::int;before_state:=pg_temp.effects();
  j:=public.rpc_save_catalog_object('Thiết bị','CRUD-ASSIGN-SRC',jsonb_build_object('owner_person_id',pg_temp.person(2)),
   'Unauthorized Source assignment',v);
  expected:=case when n=6 then'ACCOUNT_DISABLED'else'FORBIDDEN'end;
  perform pg_temp.check_result(j->>'error_code'=expected and pg_temp.effects()=before_state,
   'SASSIGN_ROLE_'||n||'_DENY_NO_EFFECT');
 end loop;
end$$;

-- Both manager roles exercise complete workshop scope lifecycle with exact audits.
select pg_temp.actor(1);
do $$declare r record;j jsonb;gid uuid;v int;before_state text;begin
 for r in select * from(values(1,4,'ADMIN'),(2,5,'QA_MANAGER'))x(actor_n,target_n,label)loop
  perform pg_temp.actor(r.actor_n);
  j:=public.rpc_set_source_workshop_scope_grant(null,pg_temp.person(r.target_n),'CRUD_ASSIGN_WS',
   'CRUD_ASSIGN_AREA','CRUD_ASSIGN_LINE',true,r.label||' creates workshop scope',null);
  gid:=(j->>'grant_id')::uuid;v:=(j->>'version')::int;
  perform pg_temp.check_result(j->>'ok'='true'and v=1 and pg_temp.grant_row(gid)->>'is_active'='true',
   'SSCOPE_'||r.label||'_CREATE_PERSIST');
  perform pg_temp.check_result(exists(select 1 from pg_temp.audit_rows('vmp_source_workshop_scope_grants')a
   where a.user_id=('a8600000-0000-4000-8000-'||lpad(r.actor_n::text,12,'0'))::uuid
    and a.record_id=gid::text and a.action::text='INSERT'and a.old_data is null
    and a.new_data->>'performer_id'=pg_temp.person(r.target_n)::text
    and a.new_data->>'is_active'='true'and a.change_reason=r.label||' creates workshop scope'
    and a.source='source_workshop_scope'),'SSCOPE_'||r.label||'_CREATE_AUDIT_EXACT');
  j:=public.rpc_set_source_workshop_scope_grant(gid,pg_temp.person(r.target_n),'CRUD_ASSIGN_WS',
   'CRUD_ASSIGN_AREA',null,true,r.label||' broadens workshop scope',v);v:=(j->>'version')::int;
  perform pg_temp.check_result(j->>'ok'='true'and v=2 and pg_temp.grant_row(gid)->'line'='null'::jsonb,
   'SSCOPE_'||r.label||'_EDIT_PERSIST_VERSION');
  before_state:=pg_temp.effects();
  j:=public.rpc_set_source_workshop_scope_grant(gid,pg_temp.person(r.target_n),'CRUD_ASSIGN_WS',
   'CRUD_ASSIGN_AREA',null,false,'Stale revoke',v-1);
  perform pg_temp.check_result(j->>'error_code'='VERSION_CONFLICT'and pg_temp.effects()=before_state,
   'SSCOPE_'||r.label||'_STALE_NO_EFFECT');
  j:=public.rpc_set_source_workshop_scope_grant(gid,pg_temp.person(r.target_n),'CRUD_ASSIGN_WS',
   'CRUD_ASSIGN_AREA',null,false,r.label||' revokes workshop scope',v);
  perform pg_temp.check_result(j->>'ok'='true'and(j->>'version')::int=3
   and pg_temp.grant_row(gid)->>'is_active'='false','SSCOPE_'||r.label||'_REVOKE_PERSIST_VERSION');
  perform pg_temp.check_result(exists(select 1 from pg_temp.audit_rows('vmp_source_workshop_scope_grants')a
   where a.user_id=('a8600000-0000-4000-8000-'||lpad(r.actor_n::text,12,'0'))::uuid
    and a.record_id=gid::text and a.action::text='UPDATE'
    and a.old_data->>'is_active'='true'and a.new_data->>'is_active'='false'
    and a.new_data->>'version'='3'and a.change_reason=r.label||' revokes workshop scope'
    and a.source='source_workshop_scope'),'SSCOPE_'||r.label||'_REVOKE_AUDIT_EXACT');
 end loop;
end$$;

do $$declare n int;j jsonb;before_state text;expected text;begin
 for n in 3..6 loop perform pg_temp.actor(n);before_state:=pg_temp.effects();
  j:=public.rpc_set_source_workshop_scope_grant(null,pg_temp.person(4),'CRUD_ASSIGN_WS',
   'CRUD_ASSIGN_AREA','CRUD_ASSIGN_LINE',true,'Unauthorized workshop scope',null);
  expected:=case when n=6 then'FORBIDDEN'else'FORBIDDEN'end;
  perform pg_temp.check_result(j->>'error_code'=expected and pg_temp.effects()=before_state,
   'SSCOPE_ROLE_'||n||'_DENY_NO_EFFECT');
 end loop;
end$$;

set local role anon;
select pg_temp.actor(null,'anon');
do $$declare before_state text;begin
 before_state:=pg_temp.effects();
 perform pg_temp.check_result(pg_temp.must_state(
  $q$select public.rpc_save_catalog_object('Thiết bị','CRUD-ASSIGN-SRC',
   jsonb_build_object('owner_person_id',pg_temp.person(2)),
   'Anonymous Source assignment',(pg_temp.source_row()->>'version')::int)$q$,'42501')
  and pg_temp.effects()=before_state,
  'SASSIGN_ANON_ACL_DENY_NO_EFFECT');
 before_state:=pg_temp.effects();
 perform pg_temp.check_result(pg_temp.must_state(
  $q$select public.rpc_set_source_workshop_scope_grant(null,
   pg_temp.person(4),'CRUD_ASSIGN_WS','CRUD_ASSIGN_AREA',
   'CRUD_ASSIGN_LINE',true,'Anonymous workshop scope',null)$q$,'42501')
  and pg_temp.effects()=before_state,'SSCOPE_ANON_ACL_DENY_NO_EFFECT');
end$$;

reset role;
do $$declare failures text;begin
 select string_agg(id,', 'order by id)into failures from source_assignment_checks where not passed;
 if failures is not null then raise exception 'CRUD_SOURCE_ASSIGNMENT_FAILURES: %',failures;end if;
end$$;
rollback;

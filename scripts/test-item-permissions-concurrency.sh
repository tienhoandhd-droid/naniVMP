#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
task3_admin_url=${VMP_CONCURRENCY_TEST_ADMIN_URL:-}
if [[ -z "$task3_admin_url" ]]; then
  echo "SKIP an toàn: cần VMP_CONCURRENCY_TEST_ADMIN_URL của cluster test chuyên dụng" >&2
  exit 2
fi
task3_required_admin_db='vmp_concurrency_admin'
task3_required_marker='VMP_CONCURRENCY_TEST_ONLY_ALLOW_DATABASE_CREATE_DROP'
task3_timeout_seconds=${TASK3_CONCURRENCY_TIMEOUT_SECONDS:-30}
if [[ ! "$task3_timeout_seconds" =~ ^[0-9]+$
    || "$task3_timeout_seconds" -lt 5
    || "$task3_timeout_seconds" -gt 300 ]]; then
  echo "TASK3_CONCURRENCY_TIMEOUT_SECONDS phải trong khoảng 5..300" >&2
  exit 1
fi
task3_kill_after_seconds=5
task3_connect_timeout_seconds=5
task3_statement_timeout_ms=$((task3_timeout_seconds * 1000))
task3_idle_timeout_ms=$(((task3_timeout_seconds + task3_kill_after_seconds) * 1000))
task3_pg_options="-c statement_timeout=$task3_statement_timeout_ms -c lock_timeout=$task3_statement_timeout_ms -c idle_in_transaction_session_timeout=$task3_idle_timeout_ms"

run_pg_command() {
  local application_name=$1
  shift
  timeout --kill-after="${task3_kill_after_seconds}s" \
    "${task3_timeout_seconds}s" \
    env PGCONNECT_TIMEOUT="$task3_connect_timeout_seconds" \
      PGAPPNAME="$application_name" PGOPTIONS="$task3_pg_options" \
      "$@"
}

run_psql() {
  local application_name=$1
  shift
  run_pg_command "$application_name" psql "$@"
}

task3_admin_facts=$(run_psql vmp-task3-guard "$task3_admin_url" \
  -X -AtF '|' -v ON_ERROR_STOP=1 -c \
  "select current_database(),
          coalesce(shobj_description(oid, 'pg_database'), ''),
          (select rolcreatedb from pg_roles where rolname = current_user)
   from pg_database where datname = current_database()")
IFS='|' read -r task3_admin_db task3_cluster_marker task3_can_create_db \
  <<<"$task3_admin_facts"
if [[ "$task3_admin_db" != "$task3_required_admin_db"
    || "$task3_cluster_marker" != "$task3_required_marker"
    || "$task3_can_create_db" != t ]]; then
  echo "Từ chối create/drop DB: admin database thiếu tên/marker/CREATEDB chuyên dụng" >&2
  exit 2
fi

task3_temp_db="vmp_task3_concurrency_${RANDOM}_$$"
if [[ ! "$task3_temp_db" =~ ^vmp_task3_concurrency_[0-9]+_[0-9]+$ ]]; then
  echo "Tên database concurrency không hợp lệ" >&2
  exit 1
fi

task3_url_base=${task3_admin_url%%\?*}
task3_url_query=''
if [[ "$task3_admin_url" == *\?* ]]; then
  task3_url_query="?${task3_admin_url#*\?}"
fi
task3_temp_url="${task3_url_base%/*}/${task3_temp_db}${task3_url_query}"
task3_assignment_migration="$repo_dir/supabase/migrations/20260811100000_qa_theo_phan_cong_hang_muc.sql"
task3_conflict_migration="$repo_dir/supabase/migrations/20260811130000_fix_assignment_conflict_and_rights_basis.sql"
for task3_migration_file in "$task3_assignment_migration" "$task3_conflict_migration"; do
  if [[ ! -f "$task3_migration_file" ]]; then
    echo "Không tìm thấy migration concurrency: $task3_migration_file" >&2
    exit 1
  fi
done
task3_tmp_dir=$(mktemp -d)
task3_ready_marker="$task3_tmp_dir/link-ready"
task3_release_marker="$task3_tmp_dir/link-release"
task3_link_log="$task3_tmp_dir/link.log"
task3_role_log="$task3_tmp_dir/set-role.log"
task3_unlink_ready_marker="$task3_tmp_dir/unlink-ready"
task3_unlink_release_marker="$task3_tmp_dir/unlink-release"
task3_unlink_log="$task3_tmp_dir/unlink.log"
task3_assignment_log="$task3_tmp_dir/assignment.log"
task3_primary_ready_marker="$task3_tmp_dir/primary-ready"
task3_primary_release_marker="$task3_tmp_dir/primary-release"
task3_primary_holder_log="$task3_tmp_dir/primary-holder.log"
task3_primary_waiter_log="$task3_tmp_dir/primary-waiter.log"
task3_link_pid=''
task3_role_pid=''
task3_unlink_pid=''
task3_assignment_pid=''
task3_primary_holder_pid=''
task3_primary_waiter_pid=''
task3_db_created=false
task3_created_roles=()

cleanup_created_roles() {
  local role_name
  for role_name in "${task3_created_roles[@]}"; do
    case "$role_name" in
      anon|authenticated|service_role) ;;
      *) return 1 ;;
    esac
    run_psql vmp-task3-role-cleanup "$task3_admin_url" \
      -X -v ON_ERROR_STOP=1 -c "drop role if exists $role_name" >/dev/null \
      || return 1
  done
  task3_created_roles=()
}

process_group_is_running() {
  local process_group=$1
  local observed_group
  local process_state
  while read -r observed_group process_state; do
    observed_group=${observed_group//[[:space:]]/}
    process_state=${process_state//[[:space:]]/}
    if [[ "$observed_group" == "$process_group"
        && -n "$process_state" && "$process_state" != Z* ]]; then
      return 0
    fi
  done < <(ps -e -o pgid= -o stat= 2>/dev/null || true)
  return 1
}

stop_process_group() {
  local process_pid=$1
  local stop_deadline
  local wait_status=0
  if [[ -z "$process_pid" ]]; then
    return
  fi
  if process_group_is_running "$process_pid"; then
    kill -TERM -- "-$process_pid" >/dev/null 2>&1 || true
  fi
  stop_deadline=$((SECONDS + task3_kill_after_seconds))
  while process_group_is_running "$process_pid" \
      && [[ $SECONDS -lt $stop_deadline ]]; do
    sleep 0.1
  done
  if process_group_is_running "$process_pid"; then
    kill -KILL -- "-$process_pid" >/dev/null 2>&1 || true
  fi
  stop_deadline=$((SECONDS + task3_kill_after_seconds))
  while process_group_is_running "$process_pid" \
      && [[ $SECONDS -lt $stop_deadline ]]; do
    sleep 0.1
  done
  if process_group_is_running "$process_pid"; then
    return 1
  fi
  # Chỉ reap sau khi ps xác nhận process đã dừng/zombie; wait lúc này không chặn.
  wait "$process_pid" >/dev/null 2>&1 || wait_status=$?
  return "$wait_status"
}

wait_process_group() {
  local process_pid=$1
  local wait_deadline=$((SECONDS + task3_timeout_seconds + task3_kill_after_seconds))
  local wait_status=0
  while process_group_is_running "$process_pid" \
      && [[ $SECONDS -lt $wait_deadline ]]; do
    sleep 0.1
  done
  if process_group_is_running "$process_pid"; then
    stop_process_group "$process_pid" || true
    return 124
  fi
  # Process đã dừng/zombie nên reap là tức thời, không có wait mở vô hạn.
  wait "$process_pid" || wait_status=$?
  return "$wait_status"
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  stop_process_group "$task3_link_pid" || true
  stop_process_group "$task3_role_pid" || true
  stop_process_group "$task3_unlink_pid" || true
  stop_process_group "$task3_assignment_pid" || true
  stop_process_group "$task3_primary_holder_pid" || true
  stop_process_group "$task3_primary_waiter_pid" || true
  if [[ "$task3_db_created" == true ]]; then
    run_pg_command vmp-task3-cleanup dropdb \
      --maintenance-db="$task3_admin_url" --if-exists --force \
      "$task3_temp_db" >/dev/null 2>&1 || true
  fi
  cleanup_created_roles || true
  rm -f "$task3_ready_marker" "$task3_release_marker" \
    "$task3_link_log" "$task3_role_log" \
    "$task3_unlink_ready_marker" "$task3_unlink_release_marker" \
    "$task3_unlink_log" "$task3_assignment_log"
  rm -f "$task3_primary_ready_marker" "$task3_primary_release_marker" \
    "$task3_primary_holder_log" "$task3_primary_waiter_log"
  rmdir "$task3_tmp_dir" >/dev/null 2>&1 || true
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

for task3_required_role in anon authenticated service_role; do
  task3_role_exists=$(run_psql vmp-task3-role-guard "$task3_admin_url" \
    -X -At -v ON_ERROR_STOP=1 -c \
    "select exists(select 1 from pg_roles where rolname='$task3_required_role')")
  if [[ "$task3_role_exists" != t ]]; then
    task3_can_create_role=$(run_psql vmp-task3-role-guard "$task3_admin_url" \
      -X -At -v ON_ERROR_STOP=1 -c \
      "select rolsuper or rolcreaterole from pg_roles where rolname=current_user")
    if [[ "$task3_can_create_role" != t ]]; then
      echo "Cluster test thiếu role $task3_required_role và admin không có CREATEROLE" >&2
      exit 2
    fi
    task3_created_roles+=("$task3_required_role")
  fi
done

task3_db_created=true
run_pg_command vmp-task3-create createdb \
  --maintenance-db="$task3_admin_url" "$task3_temp_db"

# Database này hoàn toàn rỗng và bị drop ở trap. Chỉ dựng các prerequisite
# tối thiểu để áp nguyên migration Task 3 và chạy đúng hai RPC cần kiểm race.
run_psql vmp-task3-setup "$task3_temp_url" \
  -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create schema auth;

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$roles$;

create type public.user_role as enum (
  'admin', 'qa_manager', 'department_user', 'viewer'
);
create type public.audit_action as enum ('INSERT', 'UPDATE', 'DELETE');

create table public.profiles (
  id uuid primary key,
  email text,
  full_name text,
  role public.user_role not null default 'viewer',
  department text,
  pham_vi text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vmp_performers (
  id uuid primary key,
  performer_name text not null,
  employee_code text,
  email text,
  department text,
  user_id uuid references public.profiles(id),
  access_class text,
  scope_departments text[] not null default '{}'::text[],
  access_areas text[] not null default '{}'::text[],
  scope_factory_ids uuid[] not null default '{}'::uuid[],
  scope_area_ids uuid[] not null default '{}'::uuid[],
  scope_line_ids uuid[] not null default '{}'::uuid[],
  version integer not null default 1,
  email_sent_confirmed boolean not null default false,
  is_active boolean not null default true,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index task3_one_performer_per_user
  on public.vmp_performers(user_id) where user_id is not null;

create table public.vmp_item_assignments (
  id uuid primary key default gen_random_uuid(),
  validation_code text not null,
  performer_id uuid,
  user_id uuid,
  employee_code text,
  staff_name text,
  assignment_kind text not null,
  source text not null,
  source_text text,
  unresolved_reason text,
  is_active boolean not null default true,
  change_reason text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz
);
create table public.vmp_assignment_matrix (
  id uuid primary key,
  staff_name text,
  is_active boolean not null default true
);
create table public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid,
  action public.audit_action not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  change_reason text,
  source text,
  changed_fields text[],
  validation_code text,
  created_at timestamptz not null default now()
);
create table public.vmp_objects (
  code text primary key,
  department text,
  area text,
  line text
);
create table public.vmp_plan_items (
  validation_code text primary key,
  object_code text not null references public.vmp_objects(code),
  owner_name text,
  secondary_owner text,
  owner_person_id uuid references public.vmp_performers(id),
  support_person_id uuid references public.vmp_performers(id),
  source_sheet_data jsonb,
  is_active boolean not null default true
);
create table public.vmp_source_objects (
  id uuid primary key default gen_random_uuid(),
  validation_code text not null,
  source text not null,
  source_name text,
  normalized_source_name text,
  assignment_kind text,
  owner_name text,
  support_name text,
  owner_person_id uuid references public.vmp_performers(id),
  support_person_id uuid references public.vmp_performers(id),
  is_active boolean not null default true
);
create view public.vmp_active_item_assignments as
select assignment.*, assignment.is_active as grants_access
from public.vmp_item_assignments assignment;

create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb->>'sub', ''
  )::uuid
$$;
create function auth.role() returns text
language sql stable
as $$
  select current_setting('request.jwt.claims', true)::jsonb->>'role'
$$;
create function public.duoc_phep(p_permission text, p_role text)
returns boolean language sql stable
as $$ select p_role = 'admin' $$;
create function public.item_permissions_mode()
returns text language sql stable
as $$ select 'preview'::text $$;
create function public.vmp_manager_principal(p_user_id uuid)
returns table (
  principal_kind text,
  profile_role text,
  profile_department text,
  person_id uuid,
  access_class text,
  scope_departments text[],
  access_areas text[]
) language sql stable
as $$
  select 'admin'::text, 'admin'::text, null::text, null::uuid, null::text,
         '{}'::text[], '{}'::text[]
  where p_user_id = 'a0000000-0000-0000-0000-000000000001'::uuid
$$;

create function public.vmp_normalize_person_name(text)
returns text language sql immutable as $$ select lower(btrim($1)) $$;
alter table public.vmp_performers add column normalized_full_name text
  generated always as (public.vmp_normalize_person_name(performer_name)) stored;
create function public.vmp_jsonb_uuid_array(jsonb, text)
returns uuid[] language sql immutable as $$ select '{}'::uuid[] $$;
create function public.vmp_valid_permission_scope(text[],uuid[],uuid[],uuid[])
returns boolean language sql stable as $$ select true $$;
create function public.vmp_valid_access_areas(text[])
returns boolean language sql stable as $$ select true $$;
create function public.vmp_item_scope_path_count(text)
returns bigint language sql stable as $$ select 1::bigint $$;
create function public.vmp_item_scope_matches(uuid,text)
returns table(scope_match boolean,factory_match boolean,area_match boolean,line_match boolean)
language sql stable as $$ select true,true,true,true $$;
create function public.vmp_visible_plan_items()
returns setof public.vmp_plan_items language sql stable
as $$ select * from public.vmp_plan_items where is_active $$;
create function public.vmp_unfiltered_security_definer_item_readers()
returns table(signature text, reason text) language sql stable
as $$
  select allowlist.signature, allowlist.reason
  from (values
    ('rpc_set_item_assignment(uuid,text,text,text,text,text)',
     'RPC ghi phân công canonical')
  ) allowlist(signature, reason)
  where false
$$;
create function public.vmp_item_rights(uuid,text)
returns table(can_view boolean,editable_fields text[],view_reason text,
  assignment_sources text[],scope_match boolean,area_match boolean)
language sql stable security definer set search_path=public,pg_temp
as $$ select true,'{}'::text[],'legacy','{}'::text[],true,true $$;
create function public.rpc_set_item_assignment(uuid,text,text,text,text)
returns jsonb language sql security definer set search_path=public,pg_temp
as $$ select jsonb_build_object('ok',false) $$;

create function public.rpc_upsert_item_permission_staff(uuid, jsonb, text)
returns jsonb language sql as $$ select jsonb_build_object('ok', false) $$;
create function public.rpc_upsert_performer(uuid, jsonb)
returns jsonb language sql as $$ select jsonb_build_object('ok', false) $$;
create function public.rpc_delete_performer(uuid)
returns jsonb language sql as $$ select jsonb_build_object('ok', false) $$;
create function public.rpc_set_user_role(
  uuid, text, text, text default null, text default null
) returns jsonb language sql as $$ select jsonb_build_object('ok', false) $$;
create function public.rpc_lien_ket_tai_khoan(uuid, uuid)
returns jsonb language sql as $$ select jsonb_build_object('ok', false) $$;
create function public.rpc_set_item_performer(text, text)
returns jsonb language sql as $$ select jsonb_build_object('ok', false) $$;
create function public.vmp_set_item_assignment_unhardened(uuid,text,text,text,text)
returns jsonb language sql as $$ select jsonb_build_object('ok', false) $$;

create function public.chan_overload_rpc()
returns event_trigger language plpgsql as $$
declare r record; v_name text; v_count integer;
begin
  for r in select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE FUNCTION','ALTER FUNCTION') loop
    select procedure.proname into v_name
    from pg_proc procedure join pg_namespace namespace
      on namespace.oid=procedure.pronamespace
    where procedure.oid=r.objid and namespace.nspname='public'
      and procedure.proname like 'rpc\_%';
    continue when v_name is null;
    select count(*) into v_count from pg_proc procedure
    where procedure.pronamespace='public'::regnamespace
      and procedure.proname=v_name;
    if v_count > 1 then
      raise exception 'Concurrency bootstrap phát hiện RPC overload: %', v_name;
    end if;
  end loop;
end $$;
create event trigger chan_overload_rpc_tg
  on ddl_command_end execute function public.chan_overload_rpc();

insert into public.profiles(id, email, full_name, role, department)
values
  ('a0000000-0000-0000-0000-000000000001', 'task3-admin@example.test',
   'Task 3 Admin', 'admin', null),
  ('b0000000-0000-0000-0000-000000000001', 'task3-user@example.test',
   'Task 3 User', 'viewer', 'qa');
insert into public.vmp_performers(
  id, performer_name, department, access_class, version, is_active,
  scope_departments, scope_factory_ids, scope_area_ids, scope_line_ids,
  updated_by
) values (
  'c0000000-0000-0000-0000-000000000001', 'Task 3 QA Manager',
  'qa', 'qa_manager', 1, true, '{}'::text[], '{}'::uuid[], '{}'::uuid[],
  '{}'::uuid[], 'a0000000-0000-0000-0000-000000000001'
);
insert into public.vmp_objects(code, department, area, line)
values ('TASK3-OBJECT', 'xsx', 'TASK3-AREA', null);
insert into public.vmp_plan_items(validation_code, object_code)
values ('TASK3-ITEM', 'TASK3-OBJECT');
SQL

run_psql vmp-task3-migration "$task3_temp_url" -X -v ON_ERROR_STOP=1 \
  -c 'begin' \
  -f "$task3_assignment_migration" \
  -f "$task3_conflict_migration" \
  -c 'commit' >/dev/null

setsid timeout --kill-after="${task3_kill_after_seconds}s" \
  "${task3_timeout_seconds}s" env \
  PGCONNECT_TIMEOUT="$task3_connect_timeout_seconds" \
  PGAPPNAME=vmp-task3-link-holder PGOPTIONS="$task3_pg_options" \
  stdbuf -oL psql "$task3_temp_url" -X -v ON_ERROR_STOP=1 -qAt \
  >"$task3_link_log" 2>&1 <<SQL &
begin;
select pg_backend_pid();
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
do \$test\$
declare
  v_result jsonb;
begin
  v_result := public.rpc_link_item_permission_account(
    'c0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Concurrency link giữ barrier', 1
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'Link session thất bại: %', v_result;
  end if;
end
\$test\$;
\! : > '$task3_ready_marker'
\! timeout --kill-after='${task3_kill_after_seconds}s' '${task3_timeout_seconds}s' sh -c 'while [ ! -f "\$1" ]; do sleep 0.1; done' sh '$task3_release_marker'
\if :SHELL_ERROR
  \quit 4
\endif
commit;
SQL
task3_link_pid=$!

task3_deadline=$((SECONDS + task3_timeout_seconds))
while [[ ! -f "$task3_ready_marker" && $SECONDS -lt $task3_deadline ]]; do
  sleep 0.1
done
if [[ ! -f "$task3_ready_marker" ]]; then
  echo "Link session không tới barrier" >&2
  exit 1
fi
task3_link_backend=$(sed -n '1p' "$task3_link_log" 2>/dev/null || true)
if [[ ! "$task3_link_backend" =~ ^[0-9]+$ ]]; then
  echo "Không lấy được backend PID của link" >&2
  exit 1
fi

setsid timeout --kill-after="${task3_kill_after_seconds}s" \
  "${task3_timeout_seconds}s" env \
  PGCONNECT_TIMEOUT="$task3_connect_timeout_seconds" \
  PGAPPNAME=vmp-task3-set-role-waiter PGOPTIONS="$task3_pg_options" \
  stdbuf -oL psql "$task3_temp_url" -X -v ON_ERROR_STOP=1 -qAt \
  >"$task3_role_log" 2>&1 <<'SQL' &
begin;
select pg_backend_pid();
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
do $test$
declare
  v_result jsonb;
begin
  v_result := public.rpc_set_user_role(
    'b0000000-0000-0000-0000-000000000001',
    'department_user', 'xsx', 'Concurrency set-role phải chờ link', 'co'
  );
  if (v_result->>'ok')::boolean is distinct from false
      or v_result->>'error_code' is distinct from 'ACCOUNT_RELINK_REQUIRED' then
    raise exception 'Set-role không fail closed sau link concurrent: %', v_result;
  end if;
end
$test$;
commit;
SQL
task3_role_pid=$!

task3_role_backend=''
task3_deadline=$((SECONDS + task3_timeout_seconds))
while [[ $SECONDS -lt $task3_deadline ]]; do
  task3_role_backend=$(sed -n '1p' "$task3_role_log" 2>/dev/null || true)
  if [[ "$task3_role_backend" =~ ^[0-9]+$ ]]; then
    break
  fi
  sleep 0.1
done
if [[ ! "$task3_role_backend" =~ ^[0-9]+$ ]]; then
  echo "Không lấy được backend PID của set-role" >&2
  exit 1
fi

task3_wait_seen=false
task3_deadline=$((SECONDS + task3_timeout_seconds))
while [[ $SECONDS -lt $task3_deadline ]]; do
  task3_wait_event=$(run_psql vmp-task3-controller "$task3_temp_url" -X -Atc \
    "select coalesce(wait_event_type, '') || ':' || coalesce(wait_event, '')
     from pg_stat_activity where pid = $task3_role_backend")
  if [[ "$task3_wait_event" == "Lock:advisory" ]]; then
    task3_wait_seen=true
    break
  fi
  sleep 0.1
done
if [[ "$task3_wait_seen" != true ]]; then
  echo "Set-role không chờ advisory serialization: ${task3_wait_event:-missing}" >&2
  exit 1
fi

IFS='|' read -r task3_lock_classid task3_lock_objid <<EOF
$(run_psql vmp-task3-controller "$task3_temp_url" -X -AtF '|' -c \
  "with account_lock as (
     select pg_catalog.hashtextextended(
       'vmp:item-permission-account:b0000000-0000-0000-0000-000000000001', 0
     ) as key
   )
   select ((key >> 32) & 4294967295)::oid,
          (key & 4294967295)::oid
   from account_lock")
EOF
task3_lock_state=$(run_psql vmp-task3-controller "$task3_temp_url" -X -Atc \
  "select
     exists (
       select 1 from pg_locks
       where pid = $task3_link_backend and locktype = 'advisory'
         and classid = '$task3_lock_classid'::oid
         and objid = '$task3_lock_objid'::oid and objsubid = 1
         and mode = 'ExclusiveLock' and granted
     )
     and exists (
       select 1 from pg_locks
       where pid = $task3_role_backend and locktype = 'advisory'
         and classid = '$task3_lock_classid'::oid
         and objid = '$task3_lock_objid'::oid and objsubid = 1
         and mode = 'ExclusiveLock' and not granted
     )
     and coalesce((
       select backend_xid is null from pg_stat_activity
       where pid = $task3_role_backend
     ), false)
     and not exists (
       select 1 from pg_locks
       where pid = $task3_role_backend and granted
         and locktype in ('relation', 'tuple', 'transactionid')
         and mode in (
           'RowExclusiveLock', 'ShareRowExclusiveLock',
           'ExclusiveLock', 'AccessExclusiveLock'
         )
     )")
if [[ "$task3_lock_state" != t ]]; then
  echo "Holder/waiter advisory key hoặc pre-release write-lock state không đúng" >&2
  exit 1
fi

# Khi request 2 đang chờ, snapshot committed không được có mutation nào.
run_psql vmp-task3-controller "$task3_temp_url" \
  -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
do $test$
begin
  if not exists (
      select 1 from public.profiles
      where id = 'b0000000-0000-0000-0000-000000000001'
        and role::text = 'viewer' and department = 'qa'
    ) or exists (
      select 1 from public.vmp_performers
      where id = 'c0000000-0000-0000-0000-000000000001'
        and user_id is not null
    ) or exists (
      select 1 from public.audit_logs
    ) then
    raise exception 'Request 2 đã mutate trước khi account barrier được nhả';
  end if;
end
$test$;
SQL

: >"$task3_release_marker"
if ! wait_process_group "$task3_link_pid"; then
  echo "Link session lỗi hoặc vượt deadline" >&2
  exit 1
fi
task3_link_pid=''
if ! wait_process_group "$task3_role_pid"; then
  echo "Set-role session lỗi hoặc vượt deadline" >&2
  exit 1
fi
task3_role_pid=''

run_psql vmp-task3-final-check "$task3_temp_url" \
  -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
do $test$
begin
  if not exists (
      select 1 from public.profiles
      where id = 'b0000000-0000-0000-0000-000000000001'
        and role::text = 'qa_manager' and department = 'qa'
    ) or not exists (
      select 1 from public.vmp_performers
      where id = 'c0000000-0000-0000-0000-000000000001'
        and user_id = 'b0000000-0000-0000-0000-000000000001'
        and version = 2
    ) or (select count(*) from public.audit_logs
          where table_name = 'profiles') <> 0
      or (select count(*) from public.audit_logs
          where table_name = 'vmp_performers'
            and change_reason = 'Concurrency link giữ barrier') <> 1 then
    raise exception 'Trạng thái cuối concurrency sai hoặc set-role đã mutate/audit';
  end if;
end
$test$;
SQL

# Unlink giữ performer row sau khi đã đồng bộ các assignment hiện có. Mutation
# phân công concurrent phải chờ row này, rồi đọc snapshot account đã commit.
setsid timeout --kill-after="${task3_kill_after_seconds}s" \
  "${task3_timeout_seconds}s" env \
  PGCONNECT_TIMEOUT="$task3_connect_timeout_seconds" \
  PGAPPNAME=vmp-task3-unlink-holder PGOPTIONS="$task3_pg_options" \
  stdbuf -oL psql "$task3_temp_url" -X -v ON_ERROR_STOP=1 -qAt \
  >"$task3_unlink_log" 2>&1 <<SQL &
begin;
select pg_backend_pid();
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
do \$test\$
declare
  v_result jsonb;
begin
  v_result := public.rpc_link_item_permission_account(
    'c0000000-0000-0000-0000-000000000001', null,
    'Concurrency unlink giữ performer', 2
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'Unlink session thất bại: %', v_result;
  end if;
end
\$test\$;
\! : > '$task3_unlink_ready_marker'
\! timeout --kill-after='${task3_kill_after_seconds}s' '${task3_timeout_seconds}s' sh -c 'while [ ! -f "\$1" ]; do sleep 0.1; done' sh '$task3_unlink_release_marker'
\if :SHELL_ERROR
  \quit 4
\endif
commit;
SQL
task3_unlink_pid=$!

task3_deadline=$((SECONDS + task3_timeout_seconds))
while [[ ! -f "$task3_unlink_ready_marker" && $SECONDS -lt $task3_deadline ]]; do
  sleep 0.1
done
if [[ ! -f "$task3_unlink_ready_marker" ]]; then
  echo "Unlink session không tới barrier" >&2
  exit 1
fi
task3_unlink_backend=$(sed -n '1p' "$task3_unlink_log" 2>/dev/null || true)
if [[ ! "$task3_unlink_backend" =~ ^[0-9]+$ ]]; then
  echo "Không lấy được backend PID của unlink" >&2
  exit 1
fi

setsid timeout --kill-after="${task3_kill_after_seconds}s" \
  "${task3_timeout_seconds}s" env \
  PGCONNECT_TIMEOUT="$task3_connect_timeout_seconds" \
  PGAPPNAME=vmp-task3-assignment-waiter PGOPTIONS="$task3_pg_options" \
  stdbuf -oL psql "$task3_temp_url" -X -v ON_ERROR_STOP=1 -qAt \
  >"$task3_assignment_log" 2>&1 <<'SQL' &
begin;
select pg_backend_pid();
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
do $test$
declare
  v_result jsonb;
begin
  v_result := public.rpc_set_item_assignment(
    'c0000000-0000-0000-0000-000000000001', 'TASK3-ITEM',
    'equipment_department', null, 'assign',
    'Concurrency assignment phải refresh performer'
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'Assignment session thất bại: %', v_result;
  end if;
end
$test$;
commit;
SQL
task3_assignment_pid=$!

task3_assignment_backend=''
task3_deadline=$((SECONDS + task3_timeout_seconds))
while [[ $SECONDS -lt $task3_deadline ]]; do
  task3_assignment_backend=$(sed -n '1p' "$task3_assignment_log" 2>/dev/null || true)
  if [[ "$task3_assignment_backend" =~ ^[0-9]+$ ]]; then
    break
  fi
  sleep 0.1
done
if [[ ! "$task3_assignment_backend" =~ ^[0-9]+$ ]]; then
  echo "Không lấy được backend PID của assignment" >&2
  exit 1
fi

task3_assignment_wait_seen=false
task3_deadline=$((SECONDS + task3_timeout_seconds))
while [[ $SECONDS -lt $task3_deadline ]]; do
  task3_assignment_blockers=$(run_psql vmp-task3-controller "$task3_temp_url" \
    -X -Atc "select pg_catalog.pg_blocking_pids($task3_assignment_backend)
             @> array[$task3_unlink_backend]::integer[]")
  if [[ "$task3_assignment_blockers" == t ]]; then
    task3_assignment_wait_seen=true
    break
  fi
  if ! process_group_is_running "$task3_assignment_pid"; then
    break
  fi
  sleep 0.1
done
if [[ "$task3_assignment_wait_seen" != true ]]; then
  echo "Assignment không chờ performer row của unlink; có thể ghi snapshot user_id cũ" >&2
  exit 1
fi

task3_assignment_lock_order=$(run_psql vmp-task3-controller "$task3_temp_url" \
  -X -Atc "select
    exists (
      select 1 from pg_locks
      where pid = $task3_assignment_backend and granted
        and relation = 'public.vmp_performers'::regclass
        and mode = 'RowShareLock'
    ) and not exists (
      select 1 from pg_locks
      where pid = $task3_assignment_backend and granted
        and relation in (
          'public.vmp_plan_items'::regclass,
          'public.vmp_item_assignments'::regclass
        )
        and mode in ('RowShareLock', 'RowExclusiveLock')
    )")
if [[ "$task3_assignment_lock_order" != t ]]; then
  echo "Assignment không giữ thứ tự performer trước item/assignment" >&2
  exit 1
fi

: >"$task3_unlink_release_marker"
if ! wait_process_group "$task3_unlink_pid"; then
  echo "Unlink session lỗi hoặc vượt deadline" >&2
  exit 1
fi
task3_unlink_pid=''
if ! wait_process_group "$task3_assignment_pid"; then
  echo "Assignment session lỗi hoặc vượt deadline" >&2
  exit 1
fi
task3_assignment_pid=''

run_psql vmp-task3-assignment-final-check "$task3_temp_url" \
  -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
do $test$
begin
  if not exists (
      select 1 from public.vmp_performers
      where id = 'c0000000-0000-0000-0000-000000000001'
        and user_id is null and version = 3
    ) or not exists (
      select 1 from public.vmp_item_assignments
      where validation_code = 'TASK3-ITEM'
        and performer_id = 'c0000000-0000-0000-0000-000000000001'
        and user_id is null and unresolved_reason = 'account_unlinked'
        and is_active
    ) then
    raise exception 'Assignment còn snapshot user_id/unresolved_reason stale sau unlink';
  end if;
end
$test$;
SQL

# Hai phiên cùng snapshot QA chính A. Holder thay A→B nhưng giữ transaction;
# waiter đã mang immutable A phải chờ lock rồi fail PRIMARY_CONFLICT, không audit.
task3_primary_a='d0000000-0000-0000-0000-000000000001'
task3_primary_b='d0000000-0000-0000-0000-000000000002'
task3_primary_c='d0000000-0000-0000-0000-000000000003'
run_psql vmp-task3-primary-setup "$task3_temp_url" \
  -X -At -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into public.vmp_performers(
  id, performer_name, department, access_class, is_active, updated_by
) values
  ('$task3_primary_a', 'Task 3 QA A', 'qa', 'qa_progress_editor', true,
   'a0000000-0000-0000-0000-000000000001'),
  ('$task3_primary_b', 'Task 3 QA B', 'qa', 'qa_progress_editor', true,
   'a0000000-0000-0000-0000-000000000001'),
  ('$task3_primary_c', 'Task 3 QA C', 'qa', 'qa_progress_editor', true,
   'a0000000-0000-0000-0000-000000000001');
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);
do \$test\$
declare v_result jsonb;
begin
  v_result := public.rpc_set_item_assignment(
    '$task3_primary_a', 'TASK3-ITEM', 'qa', 'primary', 'assign',
    'Concurrency primary baseline', null
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'Không dựng được QA primary A: %', v_result;
  end if;
end
\$test\$;
SQL
task3_expected_primary=$(run_psql vmp-task3-primary-snapshot "$task3_temp_url" \
  -X -At -v ON_ERROR_STOP=1 -c \
  "select id from public.vmp_item_assignments
   where validation_code='TASK3-ITEM' and assignment_kind='qa'
     and assignment_role='primary' and is_active")
if [[ ! "$task3_expected_primary" =~ ^[0-9a-f-]{36}$ ]]; then
  echo "Không snapshot được assignment ID của QA A" >&2
  exit 1
fi

setsid timeout --kill-after="${task3_kill_after_seconds}s" \
  "${task3_timeout_seconds}s" env \
  PGCONNECT_TIMEOUT="$task3_connect_timeout_seconds" \
  PGAPPNAME=vmp-task3-primary-holder PGOPTIONS="$task3_pg_options" \
  stdbuf -oL psql "$task3_temp_url" -X -v ON_ERROR_STOP=1 -qAt \
  >"$task3_primary_holder_log" 2>&1 <<SQL &
begin;
select pg_backend_pid();
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
do \$test\$
declare v_result jsonb;
begin
  v_result := public.rpc_set_item_assignment(
    '$task3_primary_b', 'TASK3-ITEM', 'qa', 'primary', 'replace_primary',
    'Concurrency primary A sang B', '$task3_expected_primary'
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'Holder A→B thất bại: %', v_result;
  end if;
end
\$test\$;
\! : > '$task3_primary_ready_marker'
\! timeout --kill-after='${task3_kill_after_seconds}s' '${task3_timeout_seconds}s' sh -c 'while [ ! -f "\$1" ]; do sleep 0.1; done' sh '$task3_primary_release_marker'
\if :SHELL_ERROR
  \quit 4
\endif
commit;
SQL
task3_primary_holder_pid=$!

task3_deadline=$((SECONDS + task3_timeout_seconds))
while [[ ! -f "$task3_primary_ready_marker" && $SECONDS -lt $task3_deadline ]]; do
  sleep 0.1
done
if [[ ! -f "$task3_primary_ready_marker" ]]; then
  echo "Primary holder không tới barrier" >&2
  exit 1
fi
task3_primary_holder_backend=$(sed -n '1p' "$task3_primary_holder_log" 2>/dev/null || true)
if [[ ! "$task3_primary_holder_backend" =~ ^[0-9]+$ ]]; then
  echo "Không lấy được backend PID primary holder" >&2
  exit 1
fi

setsid timeout --kill-after="${task3_kill_after_seconds}s" \
  "${task3_timeout_seconds}s" env \
  PGCONNECT_TIMEOUT="$task3_connect_timeout_seconds" \
  PGAPPNAME=vmp-task3-primary-waiter PGOPTIONS="$task3_pg_options" \
  stdbuf -oL psql "$task3_temp_url" -X -v ON_ERROR_STOP=1 -qAt \
  >"$task3_primary_waiter_log" 2>&1 <<SQL &
begin;
select pg_backend_pid();
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
do \$test\$
declare v_result jsonb;
begin
  v_result := public.rpc_set_item_assignment(
    '$task3_primary_c', 'TASK3-ITEM', 'qa', 'primary', 'replace_primary',
    'Concurrency stale primary A sang C', '$task3_expected_primary'
  );
  if v_result->>'error_code' is distinct from 'PRIMARY_CONFLICT'
      or (v_result->>'expected_primary_assignment_id')::uuid
        is distinct from '$task3_expected_primary'::uuid then
    raise exception 'Waiter stale không PRIMARY_CONFLICT: %', v_result;
  end if;
end
\$test\$;
commit;
SQL
task3_primary_waiter_pid=$!

task3_primary_waiter_backend=''
task3_deadline=$((SECONDS + task3_timeout_seconds))
while [[ $SECONDS -lt $task3_deadline ]]; do
  task3_primary_waiter_backend=$(sed -n '1p' "$task3_primary_waiter_log" 2>/dev/null || true)
  if [[ "$task3_primary_waiter_backend" =~ ^[0-9]+$ ]]; then break; fi
  sleep 0.1
done
if [[ ! "$task3_primary_waiter_backend" =~ ^[0-9]+$ ]]; then
  echo "Không lấy được backend PID primary waiter" >&2
  exit 1
fi
task3_primary_wait_seen=false
task3_deadline=$((SECONDS + task3_timeout_seconds))
while [[ $SECONDS -lt $task3_deadline ]]; do
  task3_primary_blocked=$(run_psql vmp-task3-controller "$task3_temp_url" -X -Atc \
    "select pg_blocking_pids($task3_primary_waiter_backend)
       @> array[$task3_primary_holder_backend]::integer[]")
  if [[ "$task3_primary_blocked" == t ]]; then
    task3_primary_wait_seen=true
    break
  fi
  sleep 0.1
done
if [[ "$task3_primary_wait_seen" != true ]]; then
  echo "Primary waiter không chờ holder theo lock order" >&2
  exit 1
fi

: >"$task3_primary_release_marker"
if ! wait_process_group "$task3_primary_holder_pid"; then
  echo "Primary holder lỗi hoặc vượt deadline" >&2
  exit 1
fi
task3_primary_holder_pid=''
if ! wait_process_group "$task3_primary_waiter_pid"; then
  echo "Primary waiter lỗi hoặc vượt deadline" >&2
  exit 1
fi
task3_primary_waiter_pid=''

run_psql vmp-task3-primary-final "$task3_temp_url" \
  -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
do \$test\$
begin
  if (select count(*) from public.vmp_item_assignments
      where validation_code='TASK3-ITEM' and assignment_kind='qa'
        and assignment_role='primary' and is_active) <> 1
      or not exists (select 1 from public.vmp_item_assignments
        where validation_code='TASK3-ITEM' and performer_id='$task3_primary_b'
          and assignment_role='primary' and is_active)
      or exists (select 1 from public.vmp_item_assignments
        where validation_code='TASK3-ITEM' and performer_id='$task3_primary_c'
          and assignment_role='primary' and is_active)
      or (select count(*) from public.audit_logs
          where table_name='vmp_item_assignments'
            and validation_code='TASK3-ITEM'
            and change_reason in (
              'Concurrency primary baseline',
              'Concurrency primary A sang B',
              'Concurrency stale primary A sang C'
            )) <> 2 then
    raise exception 'Primary race sai final state hoặc waiter đã audit';
  end if;
end
\$test\$;
SQL

run_pg_command vmp-task3-drop dropdb \
  --maintenance-db="$task3_admin_url" --if-exists --force "$task3_temp_db"
task3_db_created=false
if ! cleanup_created_roles; then
  echo "Không dọn được role bootstrap concurrency" >&2
  exit 1
fi
task3_leftovers=$(run_psql vmp-task3-leftover-check "$task3_admin_url" -X -Atc \
  "select count(*) from pg_database where datname = '$task3_temp_db'")
if [[ "$task3_leftovers" != 0 ]]; then
  echo "Database concurrency tạm chưa được xóa" >&2
  exit 1
fi
echo "CONCURRENCY PASS: account/link races; stale primary A→C conflicted after A→B; isolated database dropped"

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
task3_admin_facts=$(psql "$task3_admin_url" -X -AtF '|' -v ON_ERROR_STOP=1 -c \
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

task3_timeout_seconds=${TASK3_CONCURRENCY_TIMEOUT_SECONDS:-30}
if [[ ! "$task3_timeout_seconds" =~ ^[0-9]+$
    || "$task3_timeout_seconds" -lt 5
    || "$task3_timeout_seconds" -gt 300 ]]; then
  echo "TASK3_CONCURRENCY_TIMEOUT_SECONDS phải trong khoảng 5..300" >&2
  exit 1
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
task3_default_migration="$repo_dir/supabase/migrations/20260811100000_qa_theo_phan_cong_hang_muc.sql"
task3_migration_file=${TASK3_MIGRATION_FILE:-"$task3_default_migration"}
if [[ ! -f "$task3_migration_file" ]]; then
  echo "Không tìm thấy migration Task 3: $task3_migration_file" >&2
  exit 1
fi
task3_tmp_dir=$(mktemp -d)
task3_ready_marker="$task3_tmp_dir/link-ready"
task3_release_marker="$task3_tmp_dir/link-release"
task3_link_log="$task3_tmp_dir/link.log"
task3_role_log="$task3_tmp_dir/set-role.log"
task3_link_pid=''
task3_role_pid=''
task3_db_created=false

stop_process_group() {
  local process_pid=$1
  local stop_deadline
  if [[ -z "$process_pid" ]]; then
    return
  fi
  if kill -0 "$process_pid" >/dev/null 2>&1; then
    kill -TERM -- "-$process_pid" >/dev/null 2>&1 || true
  fi
  stop_deadline=$((SECONDS + 5))
  while kill -0 "$process_pid" >/dev/null 2>&1 \
      && [[ $SECONDS -lt $stop_deadline ]]; do
    sleep 0.1
  done
  if kill -0 "$process_pid" >/dev/null 2>&1; then
    kill -KILL -- "-$process_pid" >/dev/null 2>&1 || true
  fi
  wait "$process_pid" >/dev/null 2>&1 || true
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  stop_process_group "$task3_link_pid"
  stop_process_group "$task3_role_pid"
  if [[ "$task3_db_created" == true ]]; then
    dropdb --maintenance-db="$task3_admin_url" --if-exists --force \
      "$task3_temp_db" >/dev/null 2>&1 || true
  fi
  rm -f "$task3_ready_marker" "$task3_release_marker" \
    "$task3_link_log" "$task3_role_log"
  rmdir "$task3_tmp_dir" >/dev/null 2>&1 || true
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

createdb --maintenance-db="$task3_admin_url" "$task3_temp_db"
task3_db_created=true

# Database này hoàn toàn rỗng và bị drop ở trap. Chỉ dựng các prerequisite
# tối thiểu để áp nguyên migration Task 3 và chạy đúng hai RPC cần kiểm race.
psql "$task3_temp_url" -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create schema auth;

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
  id uuid primary key,
  performer_id uuid,
  user_id uuid,
  employee_code text,
  staff_name text,
  unresolved_reason text,
  updated_by uuid
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
  created_at timestamptz not null default now()
);

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

create function public.task3_noop_event_trigger()
returns event_trigger language plpgsql
as $$ begin null; end $$;
create event trigger chan_overload_rpc_tg
  on ddl_command_end execute function public.task3_noop_event_trigger();

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
SQL

psql "$task3_temp_url" -X -v ON_ERROR_STOP=1 \
  -c 'begin' \
  -c 'set local check_function_bodies = off' \
  -f "$task3_migration_file" \
  -c 'commit' >/dev/null

setsid timeout "${task3_timeout_seconds}s" stdbuf -oL \
  psql "$task3_temp_url" -X -v ON_ERROR_STOP=1 -qAt \
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
\! timeout '${task3_timeout_seconds}s' sh -c 'while [ ! -f "\$1" ]; do sleep 0.1; done' sh '$task3_release_marker'
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

setsid timeout "${task3_timeout_seconds}s" stdbuf -oL \
  psql "$task3_temp_url" -X -v ON_ERROR_STOP=1 -qAt \
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
  if coalesce((v_result->>'ok')::boolean, false) is distinct from false
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
  task3_wait_event=$(psql "$task3_temp_url" -X -Atc \
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
$(psql "$task3_temp_url" -X -AtF '|' -c \
  "with account_lock as (
     select pg_catalog.hashtextextended(
       'vmp:item-permission-account:b0000000-0000-0000-0000-000000000001', 0
     ) as key
   )
   select ((key >> 32) & 4294967295)::oid,
          (key & 4294967295)::oid
   from account_lock")
EOF
task3_lock_state=$(psql "$task3_temp_url" -X -Atc \
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
psql "$task3_temp_url" -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
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
wait "$task3_link_pid"
task3_link_pid=''
wait "$task3_role_pid"
task3_role_pid=''

psql "$task3_temp_url" -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
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

dropdb --maintenance-db="$task3_admin_url" --if-exists --force "$task3_temp_db"
task3_db_created=false
task3_leftovers=$(psql "$task3_admin_url" -X -Atc \
  "select count(*) from pg_database where datname = '$task3_temp_db'")
if [[ "$task3_leftovers" != 0 ]]; then
  echo "Database concurrency tạm chưa được xóa" >&2
  exit 1
fi
echo "CONCURRENCY PASS: set-role waited on same-account advisory lock; isolated database dropped"

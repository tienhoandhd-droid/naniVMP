-- Allow WF-04 to call the canonical sync through PostgREST without exposing a
-- database password or service-role key. n8n keeps the existing x-vmp-secret;
-- Supabase stores only its SHA-256 digest.

create table if not exists public.vmp_sheet_sync_auth (
  singleton boolean primary key default true check (singleton),
  secret_hash text not null,
  enrolled_at timestamptz not null default now(),
  rotated_at timestamptz
);

alter table public.vmp_sheet_sync_auth enable row level security;
revoke all on table public.vmp_sheet_sync_auth from public, anon, authenticated;
grant all on table public.vmp_sheet_sync_auth to service_role;

create or replace function public.rpc_bootstrap_vmp_sheet_sync_secret()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_secret text;
  v_hash text;
  v_existing text;
begin
  v_secret := nullif(btrim(v_headers ->> 'x-vmp-secret'), '');
  if v_secret is null or length(v_secret) < 16 then
    raise exception 'VMP_SYNC_AUTH_INVALID: x-vmp-secret is missing or too short'
      using errcode = '28000';
  end if;

  v_hash := encode(extensions.digest(convert_to(v_secret, 'UTF8'), 'sha256'), 'hex');
  select secret_hash into v_existing
  from public.vmp_sheet_sync_auth
  where singleton = true;

  if v_existing is not null and v_existing <> v_hash then
    raise exception 'VMP_SYNC_AUTH_ALREADY_ENROLLED'
      using errcode = '28000';
  end if;

  insert into public.vmp_sheet_sync_auth (singleton, secret_hash)
  values (true, v_hash)
  on conflict (singleton) do nothing;

  return jsonb_build_object('ok', true, 'enrolled', true);
end;
$$;

create or replace function public.rpc_sync_vmp_sheet_snapshot_http(
  p_sheet_id text,
  p_sheet_gid text,
  p_tab_name text,
  p_headers jsonb,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_secret text;
  v_hash text;
  v_expected text;
begin
  v_secret := nullif(btrim(v_headers ->> 'x-vmp-secret'), '');
  if v_secret is null then
    raise exception 'VMP_SYNC_AUTH_REQUIRED'
      using errcode = '28000';
  end if;

  v_hash := encode(extensions.digest(convert_to(v_secret, 'UTF8'), 'sha256'), 'hex');
  select secret_hash into v_expected
  from public.vmp_sheet_sync_auth
  where singleton = true;

  if v_expected is null or v_hash <> v_expected then
    raise exception 'VMP_SYNC_AUTH_REJECTED'
      using errcode = '28000';
  end if;

  return public.rpc_sync_vmp_sheet_snapshot(
    p_sheet_id,
    p_sheet_gid,
    p_tab_name,
    p_headers,
    p_rows
  );
end;
$$;

revoke all on function public.rpc_bootstrap_vmp_sheet_sync_secret() from public;
revoke all on function public.rpc_sync_vmp_sheet_snapshot_http(text, text, text, jsonb, jsonb) from public;
grant execute on function public.rpc_bootstrap_vmp_sheet_sync_secret() to anon;
grant execute on function public.rpc_sync_vmp_sheet_snapshot_http(text, text, text, jsonb, jsonb) to anon;

comment on function public.rpc_sync_vmp_sheet_snapshot_http(text, text, text, jsonb, jsonb)
  is 'PostgREST wrapper for WF-04. Requires the enrolled x-vmp-secret header.';

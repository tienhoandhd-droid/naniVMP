-- Google Sheet is the only canonical editor for VMP business data.
-- Browser roles may read the projected tables, but only n8n/database service
-- roles may mutate them or invoke write RPCs.

drop policy if exists plan_insert on public.vmp_plan_items;
drop policy if exists plan_update_progress on public.vmp_plan_items;
drop policy if exists plan_delete on public.vmp_plan_items;

drop policy if exists obj_insert on public.vmp_objects;
drop policy if exists obj_update on public.vmp_objects;
drop policy if exists obj_delete on public.vmp_objects;

revoke insert, update, delete, truncate
  on public.vmp_plan_items, public.vmp_objects
  from public, anon, authenticated;

grant select
  on public.vmp_plan_items, public.vmp_objects
  to anon, authenticated;

grant select, insert, update, delete, truncate
  on public.vmp_plan_items, public.vmp_objects
  to service_role;

revoke all on function public.rpc_update_progress(text, jsonb, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.rpc_update_progress(text, jsonb, text, jsonb, integer)
  from public, anon, authenticated;
revoke all on function public.rpc_upsert_object(text, text, text, text, text, text, integer, text)
  from public, anon, authenticated;
revoke all on function public.rpc_deactivate_object(text, text)
  from public, anon, authenticated;
revoke all on function public.rpc_set_item_state(text, text, text)
  from public, anon, authenticated;
revoke all on function public.rpc_resolve_missing(text, text, text)
  from public, anon, authenticated;
revoke all on function public.rpc_apply_sheet_sync(text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.rpc_resolve_outbox(bigint, boolean, text)
  from public, anon, authenticated;

grant execute on function public.rpc_update_progress(text, jsonb, text, jsonb)
  to service_role;
grant execute on function public.rpc_update_progress(text, jsonb, text, jsonb, integer)
  to service_role;
grant execute on function public.rpc_upsert_object(text, text, text, text, text, text, integer, text)
  to service_role;
grant execute on function public.rpc_deactivate_object(text, text)
  to service_role;
grant execute on function public.rpc_set_item_state(text, text, text)
  to service_role;
grant execute on function public.rpc_resolve_missing(text, text, text)
  to service_role;
grant execute on function public.rpc_apply_sheet_sync(text, text, jsonb)
  to service_role;
grant execute on function public.rpc_resolve_outbox(bigint, boolean, text)
  to service_role;

-- The live n8n workflow uses the protected Postgres credential and the
-- service-only five-argument RPC. Retire obsolete public HTTP bootstrap paths.
drop function if exists public.rpc_sync_vmp_sheet_snapshot_http(text, text, text, jsonb, jsonb);
drop function if exists public.rpc_bootstrap_vmp_sheet_sync_secret();
drop function if exists public.rpc_probe_vmp_sync_header();
drop table if exists public.vmp_sheet_sync_auth;

comment on table public.vmp_plan_items
  is 'Read-only projection of canonical Google Sheet VMP rows for browser roles. Mutated only by the n8n snapshot service.';
comment on table public.vmp_objects
  is 'Read-only projection of canonical Google Sheet VMP objects for browser roles. Mutated only by the n8n snapshot service.';

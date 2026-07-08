-- n8n Postgres node query.
-- Configure queryReplacement to the n8n payload_b64 expression.
with payload as (
  select convert_from(decode($1, 'base64'), 'UTF8')::jsonb as body
),
fingerprint as (
  select
    body,
    encode(
      extensions.digest(
        convert_to((body -> 'headers')::text || (body -> 'rows')::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    ) as checksum
  from payload
),
latest as (
  select id, checksum, unique_validation_count, object_count, completed_at
  from public.vmp_sheet_sync_runs
  where status = 'completed'
  order by created_at desc
  limit 1
)
select case
  when l.checksum = f.checksum
   and (select count(*) from public.vmp_plan_items) = l.unique_validation_count
   and (select count(*) from public.vmp_objects) = l.object_count
   and not exists (
     select 1 from public.vmp_plan_items p
     where p.source_sync_run_id is distinct from l.id
        or p.updated_at > l.completed_at
   )
   and not exists (
     select 1 from public.vmp_objects o
     where o.source_sync_run_id is distinct from l.id
        or o.updated_at > l.completed_at
   )
  then jsonb_build_object(
    'ok', true,
    'skipped', true,
    'reason', 'unchanged_checksum',
    'checksum', f.checksum
  )
  else public.rpc_sync_vmp_sheet_snapshot_with_extras(
    '1MPG6YbR6m-YrENqb8u7uS3O8RUYk7GCYuzQRbShtqP8',
    '1252715724',
    '6.Timeline VMP',
    f.body -> 'headers',
    f.body -> 'rows'
  )
end as sync_result
from fingerprint f
left join latest l on true;

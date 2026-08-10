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
),
sync as (
  select
    f.body,
    case
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
  left join latest l on true
),
schedule_source as (
  select distinct on (public.vmp_sheet_value(row_data -> 'values', 16))
    public.vmp_sheet_value(row_data -> 'values', 16) as validation_code,
    public.vmp_parse_scheduled_at(
      public.vmp_sheet_value(row_data -> 'values', 26)
    ) as scheduled_at
  from sync
  cross join lateral jsonb_array_elements(sync.body -> 'rows') rows(row_data)
  where nullif(btrim(public.vmp_sheet_value(row_data -> 'values', 26)), '') is not null
  order by public.vmp_sheet_value(row_data -> 'values', 16),
           (row_data ->> 'row_number')::integer desc
),
schedule_updates as (
  update public.vmp_plan_items item
  set scheduled_at = source.scheduled_at,
      scheduled_date = (source.scheduled_at at time zone 'Asia/Bangkok')::date,
      updated_at = now()
  from schedule_source source
  where item.validation_code = source.validation_code
    and source.scheduled_at is not null
    -- Chỉ nâng cấp giá trị ngày cũ/midnight; không đè lịch đã sửa có đủ giờ trên web.
    and (
      item.scheduled_at is null
      or item.scheduled_at = item.scheduled_date::timestamp at time zone 'Asia/Bangkok'
    )
  returning item.validation_code
),
schedule_count as (
  select count(*)::integer as value from schedule_updates
)
select sync.sync_result || jsonb_build_object(
  'scheduled_at_updates', schedule_count.value
) as sync_result
from sync
cross join schedule_count;

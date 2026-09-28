-- Inclusive VMP deadline filters. Existing page/count/export and Source ACL stay authoritative.
-- No data mutation; existing function ACLs retained by CREATE OR REPLACE.
begin;
create or replace function public.vmp_source_filters_valid(p_filters jsonb)
returns boolean language plpgsql immutable security invoker set search_path=pg_catalog
as $function$
declare k text; parsed date;
begin
  if p_filters is null then return true; end if;
  if jsonb_typeof(p_filters)<>'object' then return false; end if;
  if not coalesce((p_filters is null or (
    pg_catalog.jsonb_typeof(p_filters)='object'
    and not exists (
      select 1 from pg_catalog.jsonb_object_keys(p_filters) filter_key
      where filter_key<>all(array[
        'department','area_code','line','validation','first_month','owner',
        'frequency','vmp_from','vmp_to'
      ]::text[])
    )
    and (not (p_filters?'department') or (
      pg_catalog.jsonb_typeof(p_filters->'department')='string'
      and nullif(pg_catalog.btrim(p_filters->>'department'),'') is not null))
    and (not (p_filters?'area_code') or (
      pg_catalog.jsonb_typeof(p_filters->'area_code')='string'
      and nullif(pg_catalog.btrim(p_filters->>'area_code'),'') is not null))
    and (not (p_filters?'line') or (
      pg_catalog.jsonb_typeof(p_filters->'line')='string'
      and nullif(pg_catalog.btrim(p_filters->>'line'),'') is not null))
    and (not (p_filters?'validation') or (
      pg_catalog.jsonb_typeof(p_filters->'validation')='string'
      and p_filters->>'validation'=any(array[
        'all','validated','outside'
      ]::text[])))
    and (not (p_filters?'first_month') or (
      pg_catalog.jsonb_typeof(p_filters->'first_month')='string'
      and p_filters->>'first_month'=any(array[
        'all','missing','present'
      ]::text[])))
    and (not (p_filters?'owner') or (
      pg_catalog.jsonb_typeof(p_filters->'owner')='string'
      and ((p_filters->>'owner')=any(array[
             'all','assigned','unassigned'
           ]::text[])
        or (pg_catalog.left(p_filters->>'owner',6)='owner:'
          and nullif(pg_catalog.btrim(pg_catalog.substr(
            p_filters->>'owner',7)),'') is not null))))
    and (not (p_filters?'frequency') or (
      pg_catalog.jsonb_typeof(p_filters->'frequency')='string'
      and p_filters->>'frequency'=any(array[
        'all','lte12','gt12'
      ]::text[])))
  )),false) then return false; end if;
  foreach k in array array['vmp_from','vmp_to'] loop
    if p_filters?k then
      if jsonb_typeof(p_filters->k)<>'string' or (p_filters->>k)!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
      begin parsed := (p_filters->>k)::date;
      exception when others then return false;
      end;
    end if;
  end loop;
  return not (p_filters?'vmp_from' and p_filters?'vmp_to') or p_filters->>'vmp_from'<=p_filters->>'vmp_to';
end
$function$;

create or replace function public.vmp_source_object_matches_filters(
  p_source public.vmp_source_objects,p_search text,p_filters jsonb
)
returns boolean
language sql
stable
security invoker
set search_path=pg_catalog,public
as $function$
  select
    (coalesce(btrim(p_search),'')='' or
      p_source.object_code ilike '%'||btrim(p_search)||'%' or
      p_source.object_name ilike '%'||btrim(p_search)||'%' or
      p_source.department ilike '%'||btrim(p_search)||'%' or
      p_source.area_code ilike '%'||btrim(p_search)||'%' or
      p_source.line ilike '%'||btrim(p_search)||'%' or
      p_source.owner_name ilike '%'||btrim(p_search)||'%' or
      p_source.report_class ilike '%'||btrim(p_search)||'%' or
      p_source.work_group ilike '%'||btrim(p_search)||'%' or
      p_source.note ilike '%'||btrim(p_search)||'%')
    and (not (coalesce(p_filters,'{}'::jsonb)?'department')
      or public.vmp_source_scope_key(p_source.department)=
         public.vmp_source_scope_key(p_filters->>'department'))
    and (not (coalesce(p_filters,'{}'::jsonb)?'area_code')
      or public.vmp_source_scope_key(p_source.area_code)=
         public.vmp_source_scope_key(p_filters->>'area_code'))
    and (not (coalesce(p_filters,'{}'::jsonb)?'line')
      or public.vmp_source_scope_key(p_source.line)=
         public.vmp_source_scope_key(p_filters->>'line'))
    and (not (coalesce(p_filters,'{}'::jsonb)?'validation')
      or p_filters->>'validation'='all'
      or (p_filters->>'validation'='validated'
          and lower(btrim(coalesce(p_source.validate_flag,'')))='y')
      or (p_filters->>'validation'='outside'
          and lower(btrim(coalesce(p_source.validate_flag,'')))<>'y'))
    and (not (coalesce(p_filters,'{}'::jsonb)?'first_month')
      or p_filters->>'first_month'='all'
      or (p_filters->>'first_month'='missing'
          and p_source.first_month is null)
      or (p_filters->>'first_month'='present'
          and p_source.first_month is not null))
    and (not (coalesce(p_filters,'{}'::jsonb)?'owner')
      or p_filters->>'owner'='all'
      or (p_filters->>'owner'='assigned'
          and nullif(btrim(p_source.owner_name),'') is not null)
      or (p_filters->>'owner'='unassigned'
          and nullif(btrim(p_source.owner_name),'') is null)
      or (left(p_filters->>'owner',6)='owner:'
          and public.vmp_source_scope_key(p_source.owner_name)=
              public.vmp_source_scope_key(substring(
                p_filters->>'owner' from 7))))
    and (not (coalesce(p_filters,'{}'::jsonb)?'frequency')
      or p_filters->>'frequency'='all'
      or (p_filters->>'frequency'='lte12'
          and p_source.frequency_months is not null
          and p_source.frequency_months<=12)
      or (p_filters->>'frequency'='gt12'
          and p_source.frequency_months is not null
          and p_source.frequency_months>12))
    and case
      when not (coalesce(p_filters,'{}'::jsonb)?|array['vmp_from','vmp_to']) then true
      when not public.vmp_source_filters_valid(p_filters) then false
      else exists (
        select 1 from public.vmp_plan_items item
        where item.object_code=p_source.object_code
          and item.is_active and not item.missing_from_sheet
          and coalesce(item.item_state,'active')<>'cancelled'
          and item.deadline_vmp is not null
          and (not (p_filters?'vmp_from') or item.deadline_vmp>=(p_filters->>'vmp_from')::date)
          and (not (p_filters?'vmp_to') or item.deadline_vmp<=(p_filters->>'vmp_to')::date)
      )
    end
$function$;


commit;

-- Additive, bounded field performance. No business records or DOM/URL data.
begin;
create table if not exists public.vmp_web_vitals (
  user_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid not null,
  screen text not null,
  device text not null check (device in ('desktop','mobile')),
  metrics jsonb not null default '{}'::jsonb,
  reports smallint not null default 1 check (reports between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id,page_id)
);
create index if not exists vmp_web_vitals_created_idx on public.vmp_web_vitals(created_at);
create index if not exists vmp_web_vitals_user_updated_idx on public.vmp_web_vitals(user_id,updated_at);
alter table public.vmp_web_vitals enable row level security;
revoke all on public.vmp_web_vitals from public,anon,authenticated;

create or replace function public.rpc_record_web_vitals(p_page_id uuid,p_screen text,p_device text,p_metrics jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_point jsonb; v_metrics jsonb := '{}'::jsonb;
  v_name text; v_value numeric; v_reports integer; v_daily_reports integer; v_existing public.vmp_web_vitals%rowtype;
begin
  if auth.role() is distinct from 'authenticated' or v_uid is null
     or public.vmp_current_session_is_active() is not true then
    return jsonb_build_object('ok',false,'error_code','SESSION_INACTIVE');
  end if;
  if p_page_id is null or p_device is null or p_device not in ('desktop','mobile')
     or p_screen is null or p_screen not in ('today','overview','timeline','alerts','risk','progress','inventory','source','workload','reports','rules','health','audit','accounts','admin','phanquyen','other')
     or p_metrics is null or jsonb_typeof(p_metrics) is distinct from 'array' then
    return jsonb_build_object('ok',false,'error_code','INVALID_METRICS');
  end if;
  if jsonb_array_length(p_metrics) not between 1 and 3 or pg_column_size(p_metrics)>1024 then
    return jsonb_build_object('ok',false,'error_code','INVALID_METRICS');
  end if;
  for v_point in select value from jsonb_array_elements(p_metrics) loop
    v_name := v_point->>'name';
    if jsonb_typeof(v_point) is distinct from 'object' or v_name is null
       or v_name not in ('LCP','INP','CLS') or jsonb_typeof(v_point->'value') is distinct from 'number'
       or v_point - 'name' - 'value' <> '{}'::jsonb or v_metrics ? v_name then
      return jsonb_build_object('ok',false,'error_code','INVALID_METRICS');
    end if;
    v_value := (v_point->>'value')::numeric;
    if v_value<0 or v_value>(case when v_name='CLS' then 10 else 600000 end) then
      return jsonb_build_object('ok',false,'error_code','INVALID_METRICS');
    end if;
    v_metrics := v_metrics || jsonb_build_object(v_name,round(v_value,case when v_name='CLS' then 4 else 2 end));
  end loop;
  -- Serialize each user's rate accounting so concurrent tabs cannot evade it.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text,7192026));
  select coalesce(sum(reports),0) into v_reports from public.vmp_web_vitals
    where user_id=v_uid and updated_at>now()-interval '1 hour';
  select coalesce(sum(reports),0) into v_daily_reports from public.vmp_web_vitals
    where user_id=v_uid and updated_at>now()-interval '1 day';
  if v_reports>=120 or v_daily_reports>=300 then return jsonb_build_object('ok',true,'dropped',true); end if;
  select * into v_existing from public.vmp_web_vitals where user_id=v_uid and page_id=p_page_id;
  if found then
    if v_existing.reports>=10 or v_existing.created_at<now()-interval '1 day'
       or v_existing.screen<>p_screen or v_existing.device<>p_device then
      return jsonb_build_object('ok',true,'dropped',true);
    end if;
    update public.vmp_web_vitals set metrics=metrics || v_metrics,reports=reports+1,updated_at=now()
      where user_id=v_uid and page_id=p_page_id;
  else
    insert into public.vmp_web_vitals(user_id,page_id,screen,device,metrics)
      values(v_uid,p_page_id,p_screen,p_device,v_metrics);
  end if;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.rpc_record_web_vitals(uuid,text,text,jsonb) from public,anon;
grant execute on function public.rpc_record_web_vitals(uuid,text,text,jsonb) to authenticated;

create or replace function public.rpc_web_vitals_summary()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null
     or public.vmp_current_session_is_active() is not true then
    return jsonb_build_object('ok',false,'error_code','SESSION_INACTIVE');
  end if;
  if coalesce(public.vmp_business_role(auth.uid()),'') not in ('admin','qa_manager') then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN');
  end if;
  return jsonb_build_object('ok',true,'days',7,'rows',(
    select coalesce(jsonb_agg(to_jsonb(summary) order by metric,device,screen),'[]'::jsonb) from (
      select m.key as metric,w.device,w.screen,count(*) as samples,
        percentile_cont(.75) within group(order by (m.value::text)::double precision) as p75
      from public.vmp_web_vitals w cross join lateral jsonb_each(w.metrics) m
      where w.created_at>=now()-interval '7 days'
      group by m.key,w.device,w.screen
    ) summary
  ));
end $$;
revoke all on function public.rpc_web_vitals_summary() from public,anon;
grant execute on function public.rpc_web_vitals_summary() to authenticated;

-- Production has pg_cron; local contract databases need not install it.
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('vmp-web-vitals-retention','23 20 * * *',
      $job$delete from public.vmp_web_vitals where created_at<now()-interval '30 days'$job$);
  end if;
end $$;
notify pgrst,'reload schema';
commit;

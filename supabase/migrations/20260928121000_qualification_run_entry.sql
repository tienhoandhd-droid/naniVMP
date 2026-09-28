begin;
set local lock_timeout='5s';
-- Return the same computed rows/criteria, with UI totals limited to declared scope.
create function cpc1_private.scoped_evaluation(ev jsonb,s text,scope jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare f text;pts jsonb;pid text;row jsonb;rows jsonb;locs jsonb;states text[];global_states text[]:='{}';st text;forms jsonb:='{}';np int;nf int;ni int;nb int;sm jsonb;cfg jsonb:=ev#>'{source_context,config}';
begin
 for f,pts in select * from jsonb_each(scope) loop
  rows:='{}';locs:='{}';states:='{}';np:=0;nf:=0;ni:=0;nb:=0;
  for pid in select * from jsonb_array_elements_text(pts) loop
   row:=ev#>array['forms',f,'rows',pid];rows:=rows||jsonb_build_object(pid,row);
   st:=case when s='steam' then ev#>>array['forms',f,'locations',pid] else row->>'status' end;st:=coalesce(st,'incomplete');
   locs:=locs||jsonb_build_object(pid,st);states:=array_append(states,st);
   case st when 'pass' then np:=np+1;when 'fail' then nf:=nf+1;when 'invalid' then nb:=nb+1;else ni:=ni+1;end case;
  end loop;
  if s<>'steam' and f='bm04' then states:=array_append(states,coalesce(ev#>>'{controls,status}','incomplete'));end if;
  st:=cpc1_private.combine(states);global_states:=array_append(global_states,st);
  sm:=jsonb_build_object('total',jsonb_array_length(pts),'sampled',np+nf,'pass',np,'fail',nf,'invalid',nb,'incomplete',ni);
  if f='bm04' and s<>'steam' then sm:=sm||jsonb_build_object('control_status',ev#>>'{controls,status}');end if;
  forms:=forms||jsonb_build_object(f,jsonb_build_object('rows',rows,'locations',locs,'summary',sm,'status',st));
 end loop;
 st:=cpc1_private.combine(global_states);
 if s<>'steam' then forms:=forms||jsonb_build_object(cfg->>'summary_form',jsonb_build_object('status',st,'rows','{}'::jsonb),cfg->>'trend_form',ev->'forms'->(cfg->>'trend_form'));end if;
 return ev||jsonb_build_object('forms',forms,'overall',st,'run_scope',scope);
end$$;
create function public.cpc1_run_config(p_run_id uuid,p_system text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb:=public.cpc1_run_get(p_run_id);item cpc1_private.run_items;c jsonb;forms jsonb;f jsonb;pts jsonb;
begin
 select * into item from cpc1_private.run_items where run_id=p_run_id and system=p_system;
 if not found then raise exception 'Hệ thống không thuộc đợt.' using errcode='42501';end if;
 c:=item.config_snapshot;
 if p_system='steam' then
  select jsonb_agg(x order by ord) into pts from jsonb_array_elements(c->'locations') with ordinality t(x,ord) where exists(select 1 from jsonb_each(item.scope) sp where sp.value?(x->>'id'));
  c:=c||jsonb_build_object('locations',pts);
 else
  forms:='[]';
  for f in select * from jsonb_array_elements(c->'forms') loop
   if f->>'kind'<>'measurement' then forms:=forms||jsonb_build_array(f);
   elsif item.scope?(f->>'id') then
    select jsonb_agg(x order by ord) into pts from jsonb_array_elements(f->'locations') with ordinality t(x,ord) where item.scope->(f->>'id')?(x->>'id');
    forms:=forms||jsonb_build_array(f||jsonb_build_object('locations',pts));
   end if;
  end loop;
  c:=c||jsonb_build_object('forms',forms);
 end if;
 return c||jsonb_build_object('_run',r,'_scope',item.scope);
end$$;
create function public.cpc1_run_load(p_run_id uuid,p_record_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb:=public.cpc1_run_get(p_run_id);item cpc1_private.run_items;rec jsonb;begin
 select * into item from cpc1_private.run_items where run_id=p_run_id and record_id=p_record_id;
 if not found then raise exception 'Hồ sơ không thuộc đợt.' using errcode='42501';end if;
 rec:=public.cpc1_load(p_record_id,item.closed_revision);
 return rec||jsonb_build_object('run',r,'evaluation',cpc1_private.scoped_evaluation(rec->'evaluation',item.system,item.scope));
end$$;
create function public.cpc1_run_evaluate(p_run_id uuid,p_data jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb:=public.cpc1_run_get(p_run_id);item cpc1_private.run_items;ev jsonb;s text:=coalesce(p_data->>'system','steam');begin
 select * into item from cpc1_private.run_items where run_id=p_run_id and system=s;
 if not found then raise exception 'Hệ thống không thuộc đợt.' using errcode='42501';end if;
 if item.config_snapshot is distinct from cpc1_private.system_config(s) then raise exception 'Cấu hình đã đổi; cần xem xét lại đợt.' using errcode='23514';end if;
 ev:=public.cpc1_evaluate(p_data);return cpc1_private.scoped_evaluation(ev,s,item.scope);
end$$;
create function public.cpc1_run_save(p_run_id uuid,p_data jsonb,p_record_id uuid,p_expected_version integer,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb:=public.cpc1_run_get(p_run_id);item cpc1_private.run_items;rec jsonb;title text;begin
 perform cpc1_private.member();
 select * into item from cpc1_private.run_items where run_id=p_run_id and record_id=p_record_id and system=coalesce(p_data->>'system','steam');
 if not found then raise exception 'Hồ sơ không thuộc hệ thống/đợt đang nhập.' using errcode='42501';end if;
 select x.title into title from public.cpc1_records x where x.id=item.record_id;
 -- cpc1_save provides request idempotency and record locks. Revision trigger serializes closure.
 rec:=public.cpc1_save(p_data,p_record_id,p_expected_version,p_request_id,title);
 return rec||jsonb_build_object('evaluation',cpc1_private.scoped_evaluation(rec->'evaluation',item.system,item.scope));
end$$;
revoke all on function cpc1_private.scoped_evaluation(jsonb,text,jsonb) from public,anon,authenticated;
revoke all on function public.cpc1_run_config(uuid,text),public.cpc1_run_load(uuid,uuid),public.cpc1_run_evaluate(uuid,jsonb),public.cpc1_run_save(uuid,jsonb,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.cpc1_run_config(uuid,text),public.cpc1_run_load(uuid,uuid),public.cpc1_run_evaluate(uuid,jsonb),public.cpc1_run_save(uuid,jsonb,uuid,integer,uuid) to authenticated;
commit;

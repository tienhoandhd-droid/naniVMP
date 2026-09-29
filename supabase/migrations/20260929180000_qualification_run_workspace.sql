-- Mandatory run entry, device metadata and server-derived correction history.
-- Additive metadata only: existing evaluators, source configuration and PDFs unchanged.
begin;
set local lock_timeout='5s';set local statement_timeout='60s';
alter table cpc1_private.runs add column calibration jsonb not null default '{}'::jsonb;
create table cpc1_private.entry_events(
 record_id uuid not null,version integer not null,run_id uuid not null references cpc1_private.runs(id),
 actor_id uuid not null references auth.users(id),request_id uuid not null,reason text,changes jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(record_id,version),
 foreign key(record_id,version) references public.cpc1_revisions(record_id,version),
 unique(actor_id,request_id),check(reason is null or length(btrim(reason)) between 1 and 1000)
);
alter table cpc1_private.entry_events enable row level security;
revoke all on cpc1_private.entry_events from public,anon,authenticated;
create function cpc1_private.entry_empty(v jsonb) returns boolean language sql immutable set search_path='' as $$
 select v is null or v in ('null'::jsonb,'""'::jsonb,'{}'::jsonb,'[]'::jsonb)
$$;
create function cpc1_private.entry_diff(a jsonb,b jsonb,path text[] default '{}') returns jsonb language plpgsql immutable set search_path='' as $$
declare outp jsonb:='[]';k text;i integer;begin
 if a is not distinct from b or (cpc1_private.entry_empty(a) and cpc1_private.entry_empty(b)) then return outp;end if;
 if (jsonb_typeof(a)='object' or cpc1_private.entry_empty(a)) and (jsonb_typeof(b)='object' or cpc1_private.entry_empty(b)) then
  for k in select key from jsonb_object_keys(case when jsonb_typeof(a)='object' then a else '{}' end)key union select key from jsonb_object_keys(case when jsonb_typeof(b)='object' then b else '{}' end)key order by 1 loop
   outp:=outp||cpc1_private.entry_diff(a->k,b->k,path||k);
  end loop;
 elsif (jsonb_typeof(a)='array' or cpc1_private.entry_empty(a)) and (jsonb_typeof(b)='array' or cpc1_private.entry_empty(b)) then
  for i in 0..greatest(case when jsonb_typeof(a)='array' then jsonb_array_length(a) else 0 end,case when jsonb_typeof(b)='array' then jsonb_array_length(b) else 0 end)-1 loop
   outp:=outp||cpc1_private.entry_diff(a->i,b->i,path||i::text);
  end loop;
 else outp:=jsonb_build_array(jsonb_build_object('path',path,'before',a,'after',b));end if;
 return outp;
end$$;
create function cpc1_private.entry_reason(changes jsonb,reason text) returns void language plpgsql immutable set search_path='' as $$
begin
 if (reason is not null and length(btrim(reason))>1000) or (exists(select 1 from jsonb_array_elements(changes)c where not cpc1_private.entry_empty(c->'before')) and length(btrim(coalesce(reason,''))) not between 1 and 1000) then
  raise exception 'Điểm hoặc thông tin đã có dữ liệu. Ghi lý do thay đổi (1–1000 ký tự).' using errcode='23514';end if;
end$$;
create function cpc1_private.device_requirements(s text,scope jsonb,cfg jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare outp jsonb:='[]';f text;field jsonb;form jsonb;key text;label text;name text;path text[];begin
 for f in select jsonb_object_keys(scope) order by 1 loop
  if s='steam' then
   if f='bm03' then
    foreach key in array array['balance_due','thermometer_due'] loop
     outp:=outp||jsonb_build_array(jsonb_build_object('key',s||':'||f||':'||key,'system',s,'form',f,'name',case key when 'balance_due' then 'Cân' else 'Nhiệt kế' end,'kind','calibration','label','Hạn hiệu chuẩn','payload_path',array['equipment',key]));
    end loop;
   else
    outp:=outp||jsonb_build_array(jsonb_build_object('key',s||':'||f||':device','system',s,'form',f,'name',case f when 'bm01' then 'Thiết bị đo khí không ngưng tụ' when 'bm02' then 'Thiết bị đo chất lượng nước ngưng' else 'Thiết bị đo quá nhiệt' end,'kind','calibration','label','Hạn hiệu chuẩn','payload_path','[]'::jsonb));
   end if;
  else
   select x into form from jsonb_array_elements(cfg->'forms')x where x->>'id'=f;
   for field in select x from jsonb_array_elements(form->'equipment_fields')x where x->>'type'='date' loop
    key:=field->>'key';if key is null then key:=field->>'id';end if;label:=field->>'label';
    outp:=outp||jsonb_build_array(jsonb_build_object('key',s||':'||f||':'||key,'system',s,'form',f,'name',form->>'title','kind',case when label ilike '%hạn dùng%' then 'expiry' else 'calibration' end,'label',label,'payload_path',array['equipment',f,key]));
   end loop;
  end if;
 end loop;return outp;
end$$;
create function cpc1_private.check_calibration(cal jsonb,reqs jsonb) returns void language plpgsql immutable set search_path='' as $$
declare req jsonb;v jsonb;d date;begin
 if jsonb_typeof(cal) is distinct from 'object' then raise exception 'Nhập thiết bị và hạn hiệu chuẩn/hạn dùng.' using errcode='23514';end if;
 if (select array_agg(k order by k)from jsonb_object_keys(cal)k) is distinct from (select array_agg(x->>'key' order by x->>'key')from jsonb_array_elements(reqs)x) then raise exception 'Danh sách thiết bị chưa khớp phạm vi đợt.' using errcode='23514';end if;
 for req in select * from jsonb_array_elements(reqs) loop
  v:=cal->(req->>'key');
  if jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v->'name') is distinct from 'string' or length(btrim(coalesce(v->>'name',''))) not between 1 and 160 or coalesce(v->>'due_on','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or exists(select 1 from jsonb_object_keys(v)k where k not in ('name','due_on')) then raise exception 'Tên thiết bị và hạn không hợp lệ.' using errcode='23514';end if;
  begin d:=(v->>'due_on')::date;exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ngày hạn thiết bị không hợp lệ.' using errcode='23514';end;
  if to_char(d,'YYYY-MM-DD')<>v->>'due_on' then raise exception 'Ngày hạn thiết bị không hợp lệ.' using errcode='23514';end if;
 end loop;
end$$;
create function public.cpc1_run_requirements(p_scope jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=cpc1_private.viewer();item jsonb;s text;outp jsonb:='[]';seen text[]:='{}';begin
 if jsonb_typeof(p_scope) is distinct from 'array' or jsonb_array_length(p_scope) not between 1 and 3 then raise exception 'Chọn phạm vi đợt.' using errcode='23514';end if;
 for item in select * from jsonb_array_elements(p_scope) loop
  s:=item->>'system';perform cpc1_private.require_system_pq(s,extract(year from timezone('Asia/Bangkok',now()))::integer,false);
  if s=any(seen) then raise exception 'Hệ thống bị lặp.' using errcode='23514';end if;seen:=array_append(seen,s);
  perform cpc1_private.check_scope(s,item->'forms','single');
  outp:=outp||cpc1_private.device_requirements(s,item->'forms',cpc1_private.system_config(s));
 end loop;return outp;
end$$;
create function cpc1_private.run_device_requirements(run uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(x order by x->>'key'),'[]') from cpc1_private.run_items i cross join lateral jsonb_array_elements(cpc1_private.device_requirements(i.system,i.scope,i.config_snapshot))x where i.run_id=run
$$;

CREATE OR REPLACE FUNCTION public.cpc1_run_get(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=cpc1_private.viewer();r cpc1_private.runs;items jsonb;reqs jsonb;cal jsonb;begin
 select * into r from cpc1_private.runs where id=p_run_id and exists(select 1 from cpc1_private.run_items i where i.run_id=p_run_id and cpc1_private.record_pq_right(i.record_id,false));
 if not found then raise exception 'Không có quyền truy cập đợt.' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('system',i.system,'record_id',i.record_id,'scope',i.scope,'pq_codes',(select jsonb_agg(plan_item_id order by plan_item_id)from cpc1_private.record_pq_links where record_id=i.record_id),'version',coalesce(i.closed_revision,rec.version)) order by i.system),'[]') into items from cpc1_private.run_items i join public.cpc1_records rec on rec.id=i.record_id where i.run_id=r.id and cpc1_private.record_pq_right(i.record_id,false);
 select coalesce(jsonb_agg(x order by x->>'key'),'[]') into reqs from cpc1_private.run_items i cross join lateral jsonb_array_elements(cpc1_private.device_requirements(i.system,i.scope,i.config_snapshot))x where i.run_id=r.id and cpc1_private.record_pq_right(i.record_id,false);
 select coalesce(jsonb_object_agg(key,value),'{}') into cal from jsonb_each(r.calibration) where exists(select 1 from jsonb_array_elements(reqs)x where x->>'key'=key);
 return to_jsonb(r)-'owner_id'-'calibration'||jsonb_build_object('calibration',cal,'calibration_requirements',reqs)||jsonb_build_object('items',items,'progress',cpc1_private.run_progress(r.id),'can_close',not exists(select 1 from cpc1_private.run_items i where i.run_id=r.id and not cpc1_private.record_pq_right(i.record_id,true)));
end$function$
;

CREATE OR REPLACE FUNCTION public.cpc1_run_create(p_definition jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=cpc1_private.member();r cpc1_private.runs;item jsonb;s text;scope jsonb;d jsonb;record jsonb;inp jsonb:=jsonb_build_object('action','create','definition',p_definition);cached cpc1_private.run_requests;outp jsonb;started date;reqs jsonb:='[]';req jsonb;path text[];codes text[];
begin
 if p_request_id is null then raise exception 'Thiếu mã yêu cầu.' using errcode='23514';end if;
 -- Completed request rows are immutable. Read before current config validation so
 -- an exact retry still returns its frozen result after source config changes.
 -- Cache misses follow authority -> advisory ordering; the locked recheck below
 -- handles another creator committing while this request was waiting.
 select * into cached from cpc1_private.run_requests where actor_id=u and request_id=p_request_id;
 if found then if cached.input is distinct from inp then raise exception 'Mã yêu cầu đã dùng cho dữ liệu khác.' using errcode='23505';end if;perform cpc1_private.require_run_write((cached.response->>'id')::uuid);return cached.response;end if;

 if jsonb_typeof(p_definition) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_definition) k where k not in ('title','mode','started_on','scope','calibration')) or coalesce(p_definition->>'mode','') not in ('campaign','single') or length(btrim(coalesce(p_definition->>'title',''))) not between 1 and 200 or coalesce(p_definition->>'started_on','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Thông tin đợt không hợp lệ.' using errcode='23514';end if;
 begin started:=(p_definition->>'started_on')::date;exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ngày đợt không hợp lệ.' using errcode='23514';end;
 if jsonb_typeof(p_definition->'scope') is distinct from 'array' or jsonb_array_length(p_definition->'scope') not between 1 and 3 or (p_definition->>'mode'='single' and jsonb_array_length(p_definition->'scope')<>1) then raise exception 'Chọn hệ thống của đợt.' using errcode='23514';end if;
 if (select count(distinct x->>'system')from jsonb_array_elements(p_definition->'scope')x)<>jsonb_array_length(p_definition->'scope') then raise exception 'Hệ thống bị lặp.' using errcode='23514';end if;
 select array_agg(distinct code order by code) into codes from jsonb_array_elements(p_definition->'scope')x cross join lateral unnest(cpc1_private.pq_codes(x->>'system',extract(year from started)::integer))code;
 perform cpc1_private.lock_pq_authority(codes);
 for item in select * from jsonb_array_elements(p_definition->'scope') loop
  s:=item->>'system';perform cpc1_private.require_system_pq(s,extract(year from started)::integer,true);
  perform cpc1_private.check_scope(s,item->'forms',p_definition->>'mode');
  reqs:=reqs||cpc1_private.device_requirements(s,item->'forms',cpc1_private.system_config(s));
 end loop;
 perform cpc1_private.check_calibration(p_definition->'calibration',reqs);
 perform pg_advisory_xact_lock(hashtextextended('cpc1run:'||u::text||p_request_id::text,0));
 select * into cached from cpc1_private.run_requests where actor_id=u and request_id=p_request_id;
 if found then if cached.input is distinct from inp then raise exception 'Mã yêu cầu đã dùng cho dữ liệu khác.' using errcode='23505';end if;perform cpc1_private.require_run_write((cached.response->>'id')::uuid);return cached.response;end if;
 insert into cpc1_private.runs(owner_id,title,mode,started_on,calibration) values(u,btrim(p_definition->>'title'),p_definition->>'mode',started,p_definition->'calibration') returning * into r;
 for item in select * from jsonb_array_elements(p_definition->'scope') loop
  if jsonb_typeof(item) is distinct from 'object' or exists(select 1 from jsonb_object_keys(item) k where k not in ('system','forms')) then raise exception 'Phạm vi hệ thống không hợp lệ.' using errcode='23514';end if;
  s:=item->>'system';scope:=item->'forms';perform cpc1_private.check_scope(s,scope,r.mode);
  d:=case when s='steam' then '{"meta":{},"equipment":{},"bm01":{},"bm02":{},"bm03":{},"bm04":{}}'::jsonb else jsonb_build_object('system',s,'meta','{}'::jsonb,'equipment','{}'::jsonb,'forms','{}'::jsonb,'controls','{}'::jsonb,'trend','{}'::jsonb) end;
  for req in select x from jsonb_array_elements(reqs)x where x->>'system'=s and jsonb_array_length(x->'payload_path')>0 loop
   path:=array(select jsonb_array_elements_text(req->'payload_path'));
   if s<>'steam' and d#>path[1:2] is null then d:=jsonb_set(d,path[1:2],'{}');end if;
   d:=jsonb_set(d,path,p_definition->'calibration'->(req->>'key')->'due_on');
  end loop;
  record:=cpc1_private.save_pq(d,null,0,gen_random_uuid(),left(r.title||' · '||s,200),extract(year from started)::integer);
  insert into cpc1_private.run_items values(r.id,s,(record->>'id')::uuid,scope,cpc1_private.system_config(s),null);
 end loop;
 insert into cpc1_private.run_events(run_id,actor_id,action,details) values(r.id,u,'created',p_definition);
 outp:=public.cpc1_run_get(r.id);insert into cpc1_private.run_requests values(u,p_request_id,inp,outp);return outp;
end$function$
;

create or replace function public.cpc1_save(p_data jsonb,p_record_id uuid default null,p_expected_version integer default 0,p_request_id uuid default null,p_title text default 'Đợt đánh giá hơi tinh khiết') returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform cpc1_private.member();
 raise exception 'Chọn đợt thẩm định trước khi nhập và lưu biểu mẫu.' using errcode='23514';
end$$;

create or replace function public.cpc1_evaluate(p_data jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform cpc1_private.member();raise exception 'Chọn đợt thẩm định trước khi tính biểu mẫu.' using errcode='23514';end$$;

create function public.cpc1_run_calibration_update(p_run_id uuid,p_expected_version integer,p_calibration jsonb,p_reason text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=cpc1_private.member();r cpc1_private.runs;cached cpc1_private.run_requests;inp jsonb:=jsonb_build_object('action','calibration','run',p_run_id,'version',p_expected_version,'calibration',p_calibration,'reason',p_reason);outp jsonb;changes jsonb;begin
 if p_request_id is null or p_expected_version is null then raise exception 'Thiếu mã yêu cầu hoặc phiên bản.' using errcode='23514';end if;
 perform cpc1_private.require_run_write(p_run_id);
 perform pg_advisory_xact_lock(hashtextextended('cpc1run:'||u::text||p_request_id::text,0));
 select * into cached from cpc1_private.run_requests where actor_id=u and request_id=p_request_id;
 if found then if cached.input is distinct from inp then raise exception 'Mã yêu cầu đã dùng cho dữ liệu khác.' using errcode='23505';end if;return cached.response;end if;
 -- Never acquire a record lock after this run lock. Save locks record then run.
 select * into r from cpc1_private.runs where id=p_run_id for update;
 if not found then raise exception 'Không có quyền sửa đợt.' using errcode='42501';end if;
 if r.status<>'open' or r.version<>p_expected_version then raise exception 'Đợt đã chốt hoặc phiên bản đã đổi. Tải lại trước khi sửa.' using errcode='PT409';end if;
 perform cpc1_private.check_calibration(p_calibration,cpc1_private.run_device_requirements(r.id));
 changes:=cpc1_private.entry_diff(r.calibration,p_calibration);
 perform cpc1_private.entry_reason(changes,p_reason);
 if changes<>'[]' then
  update cpc1_private.runs set calibration=p_calibration,version=version+1 where id=r.id;
  insert into cpc1_private.run_events(run_id,actor_id,action,details)values(r.id,u,'calibration',jsonb_build_object('previous_version',r.version,'reason',nullif(btrim(p_reason),''),'changes',changes,'request_id',p_request_id));
 end if;
 outp:=public.cpc1_run_get(r.id);insert into cpc1_private.run_requests values(u,p_request_id,inp,outp);return outp;
end$$;

create function public.cpc1_run_save(p_run_id uuid,p_data jsonb,p_record_id uuid,p_expected_version integer,p_request_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=cpc1_private.member();item cpc1_private.run_items;r cpc1_private.runs;rec public.cpc1_records;olddata jsonb;changes jsonb;outp jsonb;cached cpc1_private.run_requests;codes text[];req jsonb;path text[];reqs jsonb;
 inp jsonb:=jsonb_build_object('action','entry_save','run',p_run_id,'record',p_record_id,'expected',p_expected_version,'data',p_data,'reason',p_reason);
begin
 if p_request_id is null or p_expected_version is null then raise exception 'Thiếu mã yêu cầu hoặc phiên bản.' using errcode='23514';end if;
 select * into item from cpc1_private.run_items where run_id=p_run_id and record_id=p_record_id and system=coalesce(p_data->>'system','steam');
 if not found then raise exception 'Hồ sơ không thuộc hệ thống/đợt đang nhập.' using errcode='42501';end if;
 select array_agg(plan_item_id order by plan_item_id) into codes from cpc1_private.record_pq_links where record_id=p_record_id;
 perform cpc1_private.lock_pq_authority(codes);perform cpc1_private.require_record_pq(p_record_id,true);
 perform pg_advisory_xact_lock(hashtextextended('cpc1run:'||u::text||p_request_id::text,0));
 select * into cached from cpc1_private.run_requests where actor_id=u and request_id=p_request_id;
 if found then if cached.input is distinct from inp then raise exception 'Mã yêu cầu đã dùng cho dữ liệu hoặc lý do khác.' using errcode='23505';end if;return cached.response;end if;
 -- Same ordering as save_pq + revision guard: authority, requests, record, run.
 perform pg_advisory_xact_lock(hashtextextended('cpc1:'||u::text||p_request_id::text,0));
 select * into rec from public.cpc1_records where id=p_record_id for update;
 select * into r from cpc1_private.runs where id=p_run_id for update;
 if r.status<>'open' or rec.version<>p_expected_version then raise exception 'Đợt đã chốt hoặc hồ sơ đã có phiên bản mới. Tải lại trước khi lưu.' using errcode='PT409';end if;
 reqs:=cpc1_private.run_device_requirements(r.id);perform cpc1_private.check_calibration(r.calibration,reqs);
 for req in select x from jsonb_array_elements(reqs)x where x->>'system'=item.system and jsonb_array_length(x->'payload_path')>0 loop
  path:=array(select jsonb_array_elements_text(req->'payload_path'));
  if p_data#>path is distinct from r.calibration->(req->>'key')->'due_on' then raise exception 'Hạn thiết bị đã thay đổi hoặc chưa khớp đợt. Tải lại thông tin đợt.' using errcode='23514';end if;
 end loop;
 select payload into olddata from public.cpc1_revisions where record_id=rec.id and version=rec.version;
 changes:=cpc1_private.entry_diff(olddata,p_data);perform cpc1_private.entry_reason(changes,p_reason);
 if changes='[]' then outp:=public.cpc1_run_load(r.id,rec.id);
 else
  outp:=cpc1_private.save_pq(p_data,p_record_id,p_expected_version,p_request_id,rec.title,extract(year from r.started_on)::integer);
  insert into cpc1_private.entry_events(record_id,version,run_id,actor_id,request_id,reason,changes)values(rec.id,(outp->>'version')::integer,r.id,u,p_request_id,nullif(btrim(p_reason),''),changes);
  outp:=outp||jsonb_build_object('evaluation',cpc1_private.scoped_evaluation(outp->'evaluation',item.system,item.scope));
 end if;
 insert into cpc1_private.run_requests values(u,p_request_id,inp,outp);return outp;
end$$;
create or replace function public.cpc1_run_save(p_run_id uuid,p_data jsonb,p_record_id uuid,p_expected_version integer,p_request_id uuid) returns jsonb language sql security definer set search_path='' as $$
 select public.cpc1_run_save(p_run_id,p_data,p_record_id,p_expected_version,p_request_id,null)
$$;
CREATE OR REPLACE FUNCTION public.cpc1_run_evaluate(p_run_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb:=public.cpc1_run_get(p_run_id);item cpc1_private.run_items;ev jsonb;s text:=coalesce(p_data->>'system','steam');begin
 select * into item from cpc1_private.run_items where run_id=p_run_id and system=s;
 if not found then raise exception 'Hệ thống không thuộc đợt.' using errcode='42501';end if;
 if item.config_snapshot is distinct from cpc1_private.system_config(s) then raise exception 'Cấu hình đã đổi; cần xem xét lại đợt.' using errcode='23514';end if;
 perform cpc1_private.require_record_pq(item.record_id,true);
 if r->>'status'<>'open' then raise exception 'Đợt đã chốt; dùng kết quả của phiên bản đã lưu.' using errcode='PT409';end if;
 perform cpc1_private.check_calibration((select calibration from cpc1_private.runs where id=p_run_id),cpc1_private.run_device_requirements(p_run_id));
 ev:=cpc1_private.evaluate(p_data);return cpc1_private.scoped_evaluation(ev,s,item.scope);
end$function$
;

create function public.cpc1_point_history(p_record_id uuid,p_form text,p_point text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare item cpc1_private.run_items;prefix text[];outp jsonb;begin
 perform cpc1_private.viewer();perform cpc1_private.require_record_pq(p_record_id,false);
 select * into item from cpc1_private.run_items where record_id=p_record_id;
 if not found or not coalesce(item.scope->p_form,'[]')?p_point then raise exception 'Điểm không thuộc phạm vi hồ sơ.' using errcode='42501';end if;
 prefix:=case when item.system='steam' then array[p_form,p_point] else array['forms',p_form,p_point] end;
 select coalesce(jsonb_agg(jsonb_build_object('version',v.version,'created_at',v.created_at,'actor_name',coalesce(p.full_name,'Người thực hiện'),'reason',e.reason,'measurement_dates',(select coalesce(jsonb_agg(distinct dt),'[]')from (select x dt from jsonb_path_query(v.payload#>prefix,'$.**.date')x union select x dt from jsonb_path_query(v.payload#>prefix,'$.**.execution_date')x)dates where jsonb_typeof(dt)='string' and dt#>>'{}'<>''),'changes',changes.value) order by v.version desc),'[]') into outp
 from public.cpc1_revisions v left join public.cpc1_revisions prev on prev.record_id=v.record_id and prev.version=v.version-1
 left join cpc1_private.entry_events e on e.record_id=v.record_id and e.version=v.version left join public.profiles p on p.id=v.actor_id
 cross join lateral (select coalesce(jsonb_agg(c order by c->'path'),'[]')value from jsonb_array_elements(coalesce(e.changes,cpc1_private.entry_diff(prev.payload,v.payload)))c where (array(select jsonb_array_elements_text(c->'path')))[1:cardinality(prefix)]=prefix)changes
 where v.record_id=p_record_id and changes.value<>'[]';
 return outp;
end$$;
revoke all on function cpc1_private.entry_empty(jsonb),cpc1_private.entry_diff(jsonb,jsonb,text[]),cpc1_private.entry_reason(jsonb,text),cpc1_private.device_requirements(text,jsonb,jsonb),cpc1_private.check_calibration(jsonb,jsonb),cpc1_private.run_device_requirements(uuid) from public,anon,authenticated;
revoke all on function public.cpc1_run_requirements(jsonb),public.cpc1_run_calibration_update(uuid,integer,jsonb,text,uuid),public.cpc1_run_save(uuid,jsonb,uuid,integer,uuid,text),public.cpc1_point_history(uuid,text,text) from public,anon,authenticated;
grant execute on function public.cpc1_run_requirements(jsonb),public.cpc1_run_calibration_update(uuid,integer,jsonb,text,uuid),public.cpc1_run_save(uuid,jsonb,uuid,integer,uuid,text),public.cpc1_point_history(uuid,text,text) to authenticated;
revoke all on function public.cpc1_save(jsonb,uuid,integer,uuid,text),public.cpc1_evaluate(jsonb),public.cpc1_run_create(jsonb,uuid),public.cpc1_run_get(uuid),public.cpc1_run_save(uuid,jsonb,uuid,integer,uuid),public.cpc1_run_evaluate(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cpc1_save(jsonb,uuid,integer,uuid,text),public.cpc1_evaluate(jsonb),public.cpc1_run_create(jsonb,uuid),public.cpc1_run_get(uuid),public.cpc1_run_save(uuid,jsonb,uuid,integer,uuid),public.cpc1_run_evaluate(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

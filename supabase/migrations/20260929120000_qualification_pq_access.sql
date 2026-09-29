-- Qualification records inherit current VMP PQ rights. No role/assignment changes.
-- Owner-confirmed shared steam form: either HT-14 or HT-15 PQ grants access.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';

create table cpc1_private.pq_system_objects(
 system text not null check(system in('air','nitrogen','steam')),
 object_code text not null references public.vmp_objects(code),
 primary key(system,object_code)
);
insert into cpc1_private.pq_system_objects values('air','HT-12'),('nitrogen','HT-13'),('steam','HT-14'),('steam','HT-15');

create table cpc1_private.record_pq_links(
 record_id uuid not null references public.cpc1_records(id),
 plan_item_id text not null references public.vmp_plan_items(id),
 linked_at timestamptz not null default clock_timestamp(),
 linked_by uuid references auth.users(id),
 reason text not null check(length(btrim(reason)) between 1 and 1000),
 primary key(record_id,plan_item_id)
);
alter table cpc1_private.pq_system_objects enable row level security;
alter table cpc1_private.record_pq_links enable row level security;
revoke all on cpc1_private.pq_system_objects,cpc1_private.record_pq_links from public,anon,authenticated;

create function cpc1_private.pq_codes(s text,y integer) returns text[]
language plpgsql stable security definer set search_path='' as $$
declare code text; ids text[]; outp text[]:='{}';
begin
 for code in select object_code from cpc1_private.pq_system_objects where system=s order by object_code loop
  select array_agg(p.id order by p.id) into ids from public.vmp_plan_items p
  where p.object_code=code and upper(btrim(p.validation_type))='PQ' and p.year=y
    and (s='steam' or (p.is_active and not coalesce(p.missing_from_sheet,false)
    and not coalesce(p.deleted_from_sheet,false) and p.item_state='active'));
  if coalesce(cardinality(ids),0)<>1 then
   raise exception 'Chưa xác định được duy nhất PQ cho hệ thống/năm đã chọn.' using errcode='42501';
  end if;
  outp:=outp||ids;
 end loop;
 if cardinality(outp)=0 then raise exception 'Hệ thống chưa có liên kết PQ được xác nhận.' using errcode='42501';end if;
 return outp;
end$$;

create function cpc1_private.pq_right(codes text[],writing boolean default false) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare u uuid; code text; right_row record; objects text[]; steam_objects text[]; shared_steam boolean;
begin
 u:=cpc1_private.viewer();
 if codes is null or cardinality(codes)=0 or cardinality(codes)<>(select count(distinct c)from unnest(codes)c) then return false;end if;
 -- Identity is always complete and structural. Only the exact configured
 -- shared steam set uses OR; other record/system scopes retain their rules.
 select array_agg(p.object_code order by p.object_code) into objects
 from public.vmp_plan_items p where p.id=any(codes) and upper(btrim(p.validation_type))='PQ';
 if coalesce(cardinality(objects),0)<>cardinality(codes) then return false;end if;
 select array_agg(object_code order by object_code) into steam_objects
 from cpc1_private.pq_system_objects where system='steam';
 shared_steam:=coalesce(cardinality(steam_objects)>1 and objects=steam_objects,false);
 foreach code in array codes loop
  if not exists(select 1 from public.vmp_plan_items p where p.id=code
      and p.is_active and not coalesce(p.missing_from_sheet,false) and not coalesce(p.deleted_from_sheet,false) and p.item_state='active') then
   if shared_steam then continue;else return false;end if;
  end if;
  select * into right_row from public.vmp_item_rights(u,(select validation_code from public.vmp_plan_items where id=code));
  if found and right_row.can_view is true and (not writing or coalesce('status_validation'=any(right_row.editable_fields),false)) then
   if shared_steam then return true;end if;
  elsif not shared_steam then return false;
  end if;
 end loop;
 return not shared_steam;
exception when insufficient_privilege then return false;
end$$;

create function cpc1_private.record_pq_right(rid uuid,writing boolean default false) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare s text; codes text[]; objects text[]; expected text[];
begin
 select system into s from public.cpc1_records where id=rid;
 if not found then return false;end if;
 select array_agg(l.plan_item_id order by l.plan_item_id),array_agg(p.object_code order by p.object_code)
 into codes,objects from cpc1_private.record_pq_links l join public.vmp_plan_items p on p.id=l.plan_item_id where l.record_id=rid;
 select array_agg(object_code order by object_code)into expected from cpc1_private.pq_system_objects where system=s;
 if expected is null or objects is distinct from expected then return false;end if;
 return cpc1_private.pq_right(codes,writing);
end$$;

create function cpc1_private.require_system_pq(s text,y integer,writing boolean default false) returns text[]
language plpgsql stable security definer set search_path='' as $$
declare codes text[]:=cpc1_private.pq_codes(s,y);
begin
 if not cpc1_private.pq_right(codes,writing) then raise exception 'Bạn không có quyền với PQ của hệ thống này.' using errcode='42501';end if;
 return codes;
end$$;

create function cpc1_private.lock_pq_authority(codes text[]) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 -- Canonical role/Source changes touch this row before commit. Keep that
 -- revision stable while checking rights and saving. NOWAIT avoids reversing
 -- a concurrent Source -> plan -> revision writer's lock order.
 if (select count(*)from public.vmp_authorization_revision)<>1 then raise exception 'Không xác minh được phiên bản phân quyền.' using errcode='42501';end if;
 perform 1 from public.vmp_authorization_revision for share;
 perform 1 from public.vmp_plan_items where id=any(codes) order by id for share nowait;
end$$;

create function cpc1_private.guard_pq_link() returns trigger
language plpgsql security definer set search_path='' as $$
declare s text;
begin
 if tg_op<>'INSERT' then raise exception 'Liên kết PQ của hồ sơ không sửa đè.' using errcode='23514';end if;
 select system into s from public.cpc1_records where id=new.record_id;
 if not exists(select 1 from public.vmp_plan_items p join cpc1_private.pq_system_objects m on m.object_code=p.object_code and m.system=s
   where p.id=new.plan_item_id and upper(btrim(p.validation_type))='PQ'
   and (s='steam' or (p.is_active and not coalesce(p.missing_from_sheet,false)
   and not coalesce(p.deleted_from_sheet,false) and p.item_state='active'))) then
  raise exception 'PQ không thuộc hệ thống của hồ sơ.' using errcode='23514';
 end if;
 return new;
end$$;
create trigger cpc1_record_pq_immutable before insert or update or delete on cpc1_private.record_pq_links
for each row execute function cpc1_private.guard_pq_link();

-- Add metadata only. Exact legacy payload/evaluation/revisions are untouched.
insert into cpc1_private.record_pq_links(record_id,plan_item_id,reason)
select rec.id,code,'Technical migration: link existing qualification to VMP PQ; retain original record/source content'
from public.cpc1_records rec
join cpc1_private.run_items i on i.record_id=rec.id
join cpc1_private.runs r on r.id=i.run_id
cross join lateral unnest(cpc1_private.pq_codes(rec.system,extract(year from r.started_on)::integer)) code
where rec.system in('air','nitrogen','steam');



create or replace function cpc1_private.member() returns uuid language plpgsql stable security definer set search_path='' as $$
begin return cpc1_private.viewer();end$$;

create function cpc1_private.require_record_pq(rid uuid,writing boolean default false) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if not cpc1_private.record_pq_right(rid,writing) then raise exception 'Không có quyền với PQ của hồ sơ.' using errcode='42501';end if;
end$$;

create function cpc1_private.require_run_write(rid uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare item record;codes text[];
begin
 if not exists(select 1 from cpc1_private.run_items where run_id=rid) then raise exception 'Không có quyền với đợt.' using errcode='42501';end if;
 select array_agg(distinct l.plan_item_id order by l.plan_item_id)into codes
 from cpc1_private.run_items i join cpc1_private.record_pq_links l on l.record_id=i.record_id where i.run_id=rid;
 perform cpc1_private.lock_pq_authority(codes);
 for item in select record_id from cpc1_private.run_items where run_id=rid order by record_id loop
  perform cpc1_private.require_record_pq(item.record_id,true);
 end loop;
end$$;

create or replace function public.cpc1_context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=cpc1_private.viewer();s text;codes text[];canview boolean;canwrite boolean;archiveview boolean;archivewrite boolean;systems jsonb:='{}';av boolean:=false;aw boolean:=false;
begin
 foreach s in array array['air','nitrogen','steam'] loop
  codes:='{}';canview:=false;canwrite:=false;
  begin
   codes:=cpc1_private.pq_codes(s,extract(year from timezone('Asia/Bangkok',now()))::integer);
   canview:=cpc1_private.pq_right(codes,false);canwrite:=cpc1_private.pq_right(codes,true);
  exception when insufficient_privilege then null;end;
  select coalesce(bool_or(cpc1_private.record_pq_right(id,false)),false),coalesce(bool_or(cpc1_private.record_pq_right(id,true)),false)
  into archiveview,archivewrite from public.cpc1_records where system=s;
  systems:=systems||jsonb_build_object(s,jsonb_build_object('can_view',canview or archiveview,'can_enter',canwrite,
   'can_view_current',canview,'can_view_archive',archiveview,'can_edit_archive',archivewrite,
   'pq_codes',case when canview then to_jsonb(codes)else '[]'::jsonb end));
  av:=av or canview or archiveview;aw:=aw or canwrite;
 end loop;
 return jsonb_build_object('can_view',av,'can_enter',aw,'record_scope','pq','systems',systems);
end$$;
CREATE OR REPLACE FUNCTION public.cpc1_config()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$begin perform cpc1_private.require_system_pq('steam',extract(year from timezone('Asia/Bangkok',now()))::integer,false);return (select config from cpc1_private.settings where id);end$function$
;
CREATE OR REPLACE FUNCTION public.cpc1_gas_config(p_system text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cfg jsonb;begin
 perform cpc1_private.require_system_pq(p_system,extract(year from timezone('Asia/Bangkok',now()))::integer,false);select config into cfg from cpc1_private.gas_settings where system=p_system;
 if cfg is null then raise exception 'Hệ thống khí chưa có cấu hình nguồn.';end if;return cfg;
end$function$
;
CREATE OR REPLACE FUNCTION public.cpc1_evaluate(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$begin perform cpc1_private.require_system_pq(coalesce(p_data->>'system','steam'),extract(year from timezone('Asia/Bangkok',now()))::integer,true);return cpc1_private.evaluate(p_data);end$function$
;
CREATE OR REPLACE FUNCTION public.cpc1_load(p_record_id uuid, p_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=cpc1_private.viewer();r public.cpc1_records;rev public.cpc1_revisions;begin
 select * into r from public.cpc1_records where id=p_record_id and cpc1_private.record_pq_right(id,false);
 if not found then raise exception 'Không có quyền truy cập hồ sơ.' using errcode='42501';end if;
 select * into rev from public.cpc1_revisions where record_id=r.id and version=coalesce(p_version,r.version);
 if not found then raise exception 'Không có phiên bản này.';end if;
 return jsonb_build_object('id',r.id,'title',r.title,'version',rev.version,'data',rev.payload,'evaluation',rev.evaluation,'created_at',rev.created_at,'pq_codes',(select jsonb_agg(plan_item_id order by plan_item_id)from cpc1_private.record_pq_links where record_id=r.id));
end$function$
;
CREATE OR REPLACE FUNCTION public.cpc1_list()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=cpc1_private.viewer();begin
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select id,title,system,version,updated_at from public.cpc1_records where cpc1_private.record_pq_right(id,false) order by updated_at desc limit 100) x),'[]');end$function$
;
create function cpc1_private.save_pq(p_data jsonb,p_record_id uuid,p_expected_version integer,p_request_id uuid,p_title text,p_year integer) returns jsonb language plpgsql security definer set search_path='' AS $function$
declare u uuid:=cpc1_private.member();r public.cpc1_records;ev jsonb;inp jsonb;cached cpc1_private.requests;outp jsonb;oldv integer;ts timestamptz:=clock_timestamp();codes text[];begin
 if p_request_id is null or p_expected_version is null or p_expected_version<0 or p_title is null or length(trim(p_title)) not between 1 and 200 then raise exception 'Thiếu mã yêu cầu hoặc tên hồ sơ không hợp lệ.';end if;
 if p_record_id is null then
  codes:=cpc1_private.pq_codes(coalesce(p_data->>'system','steam'),p_year);
 else
  select array_agg(plan_item_id order by plan_item_id)into codes from cpc1_private.record_pq_links where record_id=p_record_id;
 end if;
 perform cpc1_private.lock_pq_authority(codes);
 if p_record_id is null then
  if not cpc1_private.pq_right(codes,true) then raise exception 'Không có quyền nhập PQ.' using errcode='42501';end if;
 else perform cpc1_private.require_record_pq(p_record_id,true);end if;
 inp:=jsonb_build_object('data',p_data,'record',p_record_id,'expected',p_expected_version,'title',p_title,'pq_codes',codes);
 perform pg_advisory_xact_lock(hashtextextended('cpc1:'||u::text||p_request_id::text,0));
 select * into cached from cpc1_private.requests where actor_id=u and request_id=p_request_id;
 if found then if cached.input<>inp then raise exception 'Mã yêu cầu đã dùng với dữ liệu khác.' using errcode='23505';end if;perform cpc1_private.require_record_pq((cached.response->>'id')::uuid,true);return cached.response;end if;
 ev:=cpc1_private.evaluate(p_data);
 if p_record_id is null then
  if p_expected_version<>0 then raise exception 'Phiên bản ban đầu phải bằng 0.' using errcode='PT409';end if;
  insert into public.cpc1_records(owner_id,title,system,created_at,updated_at) values(u,p_title,coalesce(p_data->>'system','steam'),ts,ts) returning * into r;oldv:=null;
  insert into cpc1_private.record_pq_links(record_id,plan_item_id,linked_by,reason)
  select r.id,code,u,'Create qualification record within authorized PQ' from unnest(codes)code;
 else
  select * into r from public.cpc1_records where id=p_record_id for update;
  if not found then raise exception 'Không có quyền sửa hồ sơ.' using errcode='42501';end if;
  if r.version<>p_expected_version then raise exception 'Hồ sơ đã có phiên bản mới. Mở lại trước khi lưu; bản đang nhập được giữ.' using errcode='PT409';end if;
  if r.system<>coalesce(p_data->>'system','steam') then raise exception 'Không được đổi hệ thống của hồ sơ.' using errcode='22023';end if;
  oldv:=r.version;
  update public.cpc1_records set version=version+1,title=p_title,updated_at=ts where id=r.id returning * into r;
 end if;
 insert into public.cpc1_revisions(record_id,version,payload,evaluation,actor_id,created_at) values(r.id,r.version,p_data,ev,u,ts);
 insert into cpc1_private.audit(actor_id,record_id,old_version,new_version,action,request_id,created_at) values(u,r.id,oldv,r.version,'save_draft',p_request_id,ts);
 outp:=jsonb_build_object('id',r.id,'title',r.title,'version',r.version,'data',p_data,'evaluation',ev,'created_at',ts);
 insert into cpc1_private.requests values(u,p_request_id,inp,outp);return outp;
end$function$
;
create or replace function public.cpc1_save(p_data jsonb,p_record_id uuid default null,p_expected_version integer default 0,p_request_id uuid default null,p_title text default 'Đợt đánh giá hơi tinh khiết') returns jsonb language plpgsql security definer set search_path='' as $$
begin return cpc1_private.save_pq(p_data,p_record_id,p_expected_version,p_request_id,p_title,extract(year from timezone('Asia/Bangkok',now()))::integer);end$$;
CREATE OR REPLACE FUNCTION cpc1_private.run_progress(run uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare item record;f text;pts jsonb;pid text;ev jsonb;st text;complete int:=0;total int:=0;failn int:=0;invalidn int:=0;controls_ok boolean:=true;
begin
 for item in select i.*,r.version from cpc1_private.run_items i join public.cpc1_records r on r.id=i.record_id where i.run_id=run and cpc1_private.record_pq_right(i.record_id,false) loop
  select evaluation into ev from public.cpc1_revisions where record_id=item.record_id and version=coalesce(item.closed_revision,item.version);
  for f,pts in select * from jsonb_each(item.scope) loop
   for pid in select * from jsonb_array_elements_text(pts) loop
    total:=total+1;
    st:=case when item.system='steam' then ev#>>array['forms',f,'locations',pid] else ev#>>array['forms',f,'rows',pid,'status'] end;
    if st in ('pass','fail') then complete:=complete+1;end if;
    if st='fail' then failn:=failn+1;end if;if st='invalid' then invalidn:=invalidn+1;end if;
   end loop;
   if item.system<>'steam' and f='bm04' and coalesce(ev#>>'{controls,status}','incomplete') not in ('pass','fail') then controls_ok:=false;end if;
  end loop;
 end loop;
 return jsonb_build_object('total',total,'complete',complete,'fail',failn,'invalid',invalidn,'controls_ready',controls_ok,'ready',total>0 and total=complete and controls_ok);
end$function$
;
CREATE OR REPLACE FUNCTION public.cpc1_run_get(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=cpc1_private.viewer();r cpc1_private.runs;items jsonb;begin
 select * into r from cpc1_private.runs where id=p_run_id and exists(select 1 from cpc1_private.run_items i where i.run_id=p_run_id and cpc1_private.record_pq_right(i.record_id,false));
 if not found then raise exception 'Không có quyền truy cập đợt.' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('system',i.system,'record_id',i.record_id,'scope',i.scope,'pq_codes',(select jsonb_agg(plan_item_id order by plan_item_id)from cpc1_private.record_pq_links where record_id=i.record_id),'version',coalesce(i.closed_revision,rec.version)) order by i.system),'[]') into items from cpc1_private.run_items i join public.cpc1_records rec on rec.id=i.record_id where i.run_id=r.id and cpc1_private.record_pq_right(i.record_id,false);
 return to_jsonb(r)-'owner_id'||jsonb_build_object('items',items,'progress',cpc1_private.run_progress(r.id),'can_close',not exists(select 1 from cpc1_private.run_items i where i.run_id=r.id and not cpc1_private.record_pq_right(i.record_id,true)));
end$function$
;
CREATE OR REPLACE FUNCTION public.cpc1_run_list()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=cpc1_private.viewer();begin
 return coalesce((select jsonb_agg(public.cpc1_run_get(id) order by started_on desc,created_at desc) from (select * from cpc1_private.runs where exists(select 1 from cpc1_private.run_items i where i.run_id=runs.id and cpc1_private.record_pq_right(i.record_id,false)) order by started_on desc,created_at desc limit 200) x),'[]');
end$function$
;
CREATE OR REPLACE FUNCTION public.cpc1_run_create(p_definition jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=cpc1_private.member();r cpc1_private.runs;item jsonb;s text;scope jsonb;d jsonb;record jsonb;inp jsonb:=jsonb_build_object('action','create','definition',p_definition);cached cpc1_private.run_requests;outp jsonb;started date;
begin
 if p_request_id is null then raise exception 'Thiếu mã yêu cầu.' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('cpc1run:'||u::text||p_request_id::text,0));
 select * into cached from cpc1_private.run_requests where actor_id=u and request_id=p_request_id;
 if found then if cached.input is distinct from inp then raise exception 'Mã yêu cầu đã dùng cho dữ liệu khác.' using errcode='23505';end if;perform cpc1_private.require_run_write((cached.response->>'id')::uuid);return cached.response;end if;
 if jsonb_typeof(p_definition) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_definition) k where k not in ('title','mode','started_on','scope')) or coalesce(p_definition->>'mode','') not in ('campaign','single') or length(btrim(coalesce(p_definition->>'title',''))) not between 1 and 200 or coalesce(p_definition->>'started_on','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Thông tin đợt không hợp lệ.' using errcode='23514';end if;
 started:=(p_definition->>'started_on')::date;
 if jsonb_typeof(p_definition->'scope') is distinct from 'array' or jsonb_array_length(p_definition->'scope') not between 1 and 3 or (p_definition->>'mode'='single' and jsonb_array_length(p_definition->'scope')<>1) then raise exception 'Chọn hệ thống của đợt.' using errcode='23514';end if;
 insert into cpc1_private.runs(owner_id,title,mode,started_on) values(u,btrim(p_definition->>'title'),p_definition->>'mode',started) returning * into r;
 for item in select * from jsonb_array_elements(p_definition->'scope') loop
  if jsonb_typeof(item) is distinct from 'object' or exists(select 1 from jsonb_object_keys(item) k where k not in ('system','forms')) then raise exception 'Phạm vi hệ thống không hợp lệ.' using errcode='23514';end if;
  s:=item->>'system';scope:=item->'forms';perform cpc1_private.check_scope(s,scope,r.mode);
  d:=case when s='steam' then '{"meta":{},"equipment":{},"bm01":{},"bm02":{},"bm03":{},"bm04":{}}'::jsonb else jsonb_build_object('system',s,'meta','{}'::jsonb,'equipment','{}'::jsonb,'forms','{}'::jsonb,'controls','{}'::jsonb,'trend','{}'::jsonb) end;
  record:=cpc1_private.save_pq(d,null,0,gen_random_uuid(),left(r.title||' · '||s,200),extract(year from started)::integer);
  insert into cpc1_private.run_items values(r.id,s,(record->>'id')::uuid,scope,cpc1_private.system_config(s),null);
 end loop;
 insert into cpc1_private.run_events(run_id,actor_id,action,details) values(r.id,u,'created',p_definition);
 outp:=public.cpc1_run_get(r.id);insert into cpc1_private.run_requests values(u,p_request_id,inp,outp);return outp;
end$function$
;
CREATE OR REPLACE FUNCTION public.cpc1_run_transition(p_run_id uuid, p_expected_version integer, p_status text, p_reason text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=cpc1_private.member();r cpc1_private.runs;inp jsonb:=jsonb_build_object('action','transition','run',p_run_id,'version',p_expected_version,'status',p_status,'reason',p_reason);cached cpc1_private.run_requests;outp jsonb;
begin
 if p_request_id is null or p_expected_version is null then raise exception 'Thiếu phiên bản hoặc mã yêu cầu.' using errcode='23514';end if;
 perform cpc1_private.require_run_write(p_run_id);
 perform pg_advisory_xact_lock(hashtextextended('cpc1run:'||u::text||p_request_id::text,0));
 select * into cached from cpc1_private.run_requests where actor_id=u and request_id=p_request_id;
 if found then if cached.input is distinct from inp then raise exception 'Mã yêu cầu đã dùng cho dữ liệu khác.' using errcode='23505';end if;return cached.response;end if;
 select * into r from cpc1_private.runs where id=p_run_id for update;
 if not found then raise exception 'Không có quyền sửa đợt.' using errcode='42501';end if;
 if r.version<>p_expected_version or r.status<>'open' then raise exception 'Trạng thái đợt đã thay đổi; tải lại trước khi thao tác.' using errcode='PT409';end if;
 if p_status is null or p_status not in ('completed','closed') then raise exception 'Trạng thái không hợp lệ.' using errcode='23514';end if;
 if p_status='completed' and not (cpc1_private.run_progress(r.id)->>'ready')::boolean then raise exception 'Còn phép thử chưa đủ số liệu trong phạm vi đã chọn.' using errcode='23514';end if;
 if p_status='closed' and length(btrim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'Ghi lý do kết thúc khi chưa hoàn thành toàn bộ.' using errcode='23514';end if;
 update cpc1_private.run_items i set closed_revision=rec.version from public.cpc1_records rec where i.record_id=rec.id and i.run_id=r.id;
 update cpc1_private.runs set status=p_status,version=version+1,closed_at=clock_timestamp(),close_reason=case when p_status='closed' then btrim(p_reason) else null end where id=r.id;
 insert into cpc1_private.run_events(run_id,actor_id,action,details) values(r.id,u,p_status,jsonb_build_object('previous_version',r.version,'reason',p_reason,'progress',cpc1_private.run_progress(r.id)));
 outp:=public.cpc1_run_get(r.id);insert into cpc1_private.run_requests values(u,p_request_id,inp,outp);return outp;
end$function$
;
CREATE OR REPLACE FUNCTION public.cpc1_run_config(p_run_id uuid, p_system text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb:=public.cpc1_run_get(p_run_id);item cpc1_private.run_items;c jsonb;forms jsonb;f jsonb;pts jsonb;
begin
 select * into item from cpc1_private.run_items where run_id=p_run_id and system=p_system;
 if not found then raise exception 'Hệ thống không thuộc đợt.' using errcode='42501';end if;
 perform cpc1_private.require_record_pq(item.record_id,false);
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
end$function$
;
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
 ev:=cpc1_private.evaluate(p_data);return cpc1_private.scoped_evaluation(ev,s,item.scope);
end$function$
;
CREATE OR REPLACE FUNCTION public.cpc1_history_list()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=cpc1_private.viewer();historical jsonb;fresh jsonb;begin
 historical:=coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'run_id',h.run_id,'record_id',h.record_id,'version',h.version,'system',h.system,'period',h.period,'comparison',h.comparison,'trend',h.trend,'issues',coalesce(h.provenance->'issues','[]'),'imported_at',h.imported_at,'sources',h.source_manifest) order by h.period,h.system)
 from cpc1_private.history_imports h join cpc1_private.runs r on r.id=h.run_id where cpc1_private.record_pq_right(h.record_id,false)),'[]');
 select coalesce(jsonb_agg(jsonb_build_object('id',i.record_id,'run_id',r.id,'record_id',i.record_id,'version',v.version,'system',i.system,'period',date_trunc('month',r.started_on)::date,'comparison','[]'::jsonb,'trend',cpc1_private.trend_rows(i.system,v.payload,v.evaluation,i.scope),'issues','[]'::jsonb,'sources','[]'::jsonb) order by r.started_on),'[]') into fresh
 from cpc1_private.run_items i join cpc1_private.runs r on r.id=i.run_id join public.cpc1_records rec on rec.id=i.record_id join public.cpc1_revisions v on v.record_id=rec.id and v.version=coalesce(i.closed_revision,rec.version)
 where cpc1_private.record_pq_right(i.record_id,false) and r.status<>'open' and v.version=i.closed_revision and v.version>1 and not exists(select 1 from cpc1_private.history_imports h where h.record_id=i.record_id);
 return historical||fresh;
end$function$
;
CREATE OR REPLACE FUNCTION cpc1_private.can_read_history(path text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid;begin
 u:=cpc1_private.viewer();
 return exists(select 1 from cpc1_private.history_imports h join cpc1_private.runs r on r.id=h.run_id cross join lateral jsonb_array_elements(h.source_manifest) s where s->>'object_path'=path and cpc1_private.record_pq_right(h.record_id,false));
 exception when insufficient_privilege then return false;
end$function$
;

create or replace function public.cpc1_template_access() returns boolean language plpgsql stable security definer set search_path='' as $$
begin return coalesce((public.cpc1_context()->>'can_view')::boolean,false);
exception when insufficient_privilege then return false;end$$;
create function cpc1_private.manifest_has_path(cfg jsonb,path text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(path ~ '^v[1-9][0-9]*/[A-Za-z0-9_-]+[.](pdf|ttf|json)$'
  and split_part(path,'/',1)=cfg->>'asset_path'
  and (case when split_part(path,'/',2) ~ '^bm[0-9]+[.]pdf$'
   then cfg->'template_sha256'->>replace(split_part(path,'/',2),'.pdf','')
   else cfg->'asset_sha256'->>split_part(path,'/',2) end) ~ '^[0-9a-f]{64}$',false)
$$;
create function cpc1_private.can_read_template(path text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare s text;cfg jsonb;ctx jsonb;
begin
 perform cpc1_private.viewer();
 -- Only configured asset versions of authorized systems, or frozen versions
 -- belonging to currently authorized saved records, can be downloaded.
 foreach s in array array['air','nitrogen','steam'] loop
  begin
   perform cpc1_private.require_system_pq(s,extract(year from timezone('Asia/Bangkok',now()))::integer,false);
   cfg:=cpc1_private.system_config(s);
   if cpc1_private.manifest_has_path(cfg,path) then return true;end if;
  exception when insufficient_privilege then null;end;
 end loop;
 return exists(select 1 from public.cpc1_revisions v where cpc1_private.record_pq_right(v.record_id,false)
   and cpc1_private.manifest_has_path(v.evaluation->'source_context',path));
exception when insufficient_privilege then return false;
end$$;
drop policy cpc1_templates_member_read on storage.objects;
create policy cpc1_templates_pq_read on storage.objects for select to authenticated
using(bucket_id='cpc1-templates' and cpc1_private.can_read_template(name));
revoke all on function cpc1_private.pq_codes(text,integer),cpc1_private.pq_right(text[],boolean),
 cpc1_private.record_pq_right(uuid,boolean),cpc1_private.require_system_pq(text,integer,boolean),
 cpc1_private.lock_pq_authority(text[]),cpc1_private.guard_pq_link(),
 cpc1_private.require_record_pq(uuid,boolean),cpc1_private.require_run_write(uuid),
 cpc1_private.save_pq(jsonb,uuid,integer,uuid,text,integer),cpc1_private.manifest_has_path(jsonb,text),cpc1_private.can_read_template(text)
 from public,anon,authenticated;
grant execute on function cpc1_private.can_read_template(text) to authenticated;
commit;

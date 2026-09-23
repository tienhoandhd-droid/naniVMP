-- Additive qualification demo; does not modify VMP roles, plans, profiles or passwords.
-- Config and private assets are installed separately from a verified source manifest.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$ begin
 if current_setting('server_version_num')::int not between 170000 and 179999 then raise exception 'Expected reviewed PostgreSQL17';end if;
 if to_regnamespace('cpc1_private') is not null or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'cpc1\_%' escape '\') or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'cpc1\_%' escape '\') or exists(select 1 from storage.buckets where id='cpc1-templates') then raise exception 'Qualification objects already exist; explicit upgrade required';end if;
 if to_regprocedure('public.vmp_is_active_session(uuid)') is null or md5(pg_get_functiondef('public.vmp_is_active_session(uuid)'::regprocedure))<>'688917439d4a88fa7bdd953c27498734' then raise exception 'Unreviewed VMP active-session boundary';end if;
 if has_function_privilege('authenticated','public.vmp_is_active_session(uuid)','EXECUTE') then raise exception 'Unexpected canonical function ACL';end if;
end $$;

 do $dependency$ declare r record; begin
  for r in select p.*,p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner_name from pg_proc p where p.oid in ('public.vmp_is_active_session(uuid)'::regprocedure,'public.vmp_business_role(uuid)'::regprocedure) loop
   if md5(pg_get_functiondef(r.oid))<>(case when r.proname='vmp_is_active_session' then '688917439d4a88fa7bdd953c27498734' else 'd0c5fd86b9972ea4a49a11af659f3921' end) or r.owner_name<>'postgres' or not r.prosecdef or not coalesce('search_path=public, pg_temp'=any(r.proconfig),false) or has_function_privilege('anon',r.oid,'EXECUTE') or has_function_privilege('authenticated',r.oid,'EXECUTE') or exists(select 1 from aclexplode(coalesce(r.proacl,acldefault('f',r.proowner))) where grantee not in (r.proowner,(select oid from pg_roles where rolname='service_role'))) then raise exception 'Unreviewed VMP canonical dependency: %',r.signature;end if;
  end loop;
 end $dependency$;

-- Source 202609230001_cpc1_drafts.sql
-- Draft records only. No official approval or electronic signature is implemented.
-- Template/config bootstrap stays private; see tools/prepare_private_assets.py.
create schema cpc1_private;
revoke all on schema cpc1_private from public,anon,authenticated;
create table cpc1_private.members(user_id uuid primary key references auth.users(id), created_at timestamptz not null default now(), enabled boolean not null default true, reason text not null check(length(btrim(reason)) between 1 and 500));
create table cpc1_private.settings(id boolean primary key default true check(id), config jsonb not null);
create table cpc1_private.steam_table(temperature numeric primary key, latent numeric not null check(latent>0));
create table public.cpc1_records(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),title text not null check(length(title) between 1 and 200),version integer not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.cpc1_revisions(record_id uuid not null references public.cpc1_records(id),version integer not null,payload jsonb not null,evaluation jsonb not null,actor_id uuid not null references auth.users(id),created_at timestamptz not null default now(),primary key(record_id,version));
create table cpc1_private.audit(id bigint generated always as identity primary key,actor_id uuid not null references auth.users(id),record_id uuid not null references public.cpc1_records(id),old_version integer,new_version integer not null,action text not null,request_id uuid not null,created_at timestamptz not null default now());
create table cpc1_private.requests(actor_id uuid not null,request_id uuid not null,input jsonb not null,response jsonb not null,primary key(actor_id,request_id));
create index cpc1_records_owner_updated on public.cpc1_records(owner_id,updated_at desc);
alter table public.cpc1_records enable row level security;
alter table public.cpc1_revisions enable row level security;
alter table cpc1_private.members enable row level security;
alter table cpc1_private.settings enable row level security;
alter table cpc1_private.steam_table enable row level security;
alter table cpc1_private.audit enable row level security;
alter table cpc1_private.requests enable row level security;
revoke all on public.cpc1_records,public.cpc1_revisions from public,anon,authenticated;

create function cpc1_private.viewer() returns uuid language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); begin
 if u is null or not public.vmp_is_active_session(u) or coalesce(public.vmp_business_role(u),'') not in ('admin','qa_manager','qa_staff') then raise exception 'Chỉ tài khoản QA và Admin đang hoạt động được truy cập Thẩm định thực tế.' using errcode='42501';end if;
 return u;
end$$;
create function cpc1_private.member() returns uuid language plpgsql stable security definer set search_path='' as $$
declare u uuid:=cpc1_private.viewer(); begin
 if not exists(select 1 from cpc1_private.members where user_id=u and enabled) then raise exception 'Tài khoản chưa được cấp quyền CPC1.' using errcode='42501'; end if; return u;
end$$;
create function cpc1_private.num(v text) returns numeric language plpgsql immutable set search_path='' as $$
begin
 if v is null or length(v)>32 or trim(v)!~'^[+-]?([0-9]+([.,][0-9]+)?|[.,][0-9]+)$' then raise exception 'Nhập số thập phân hợp lệ.'; end if;
 if abs(replace(trim(v),',','.')::numeric)>1e12 then raise exception 'Số vượt phạm vi xử lý.'; end if;
 return replace(trim(v),',','.')::numeric;
end$$;
create function cpc1_private.shown(v numeric) returns text language sql immutable set search_path='' as $$select trim_scale(round(v,6))::text$$;
create function cpc1_private.combine(states text[]) returns text language sql immutable set search_path='' as $$
 select case when 'invalid'=any(states) then 'invalid' when cardinality(states)=0 or 'incomplete'=any(states) then 'incomplete' when 'fail'=any(states) then 'fail' else 'pass' end
$$;
create function cpc1_private.check_record(r jsonb,allowed text[]) returns void language plpgsql immutable set search_path='' as $$
declare k text; v jsonb; s text; d date; begin
 if jsonb_typeof(r)<>'object' then raise exception 'Ô nhập không đúng cấu trúc.'; end if;
 for k,v in select * from jsonb_each(r) loop
  if not k=any(allowed) or jsonb_typeof(v)<>'string' then raise exception 'Trường nhập không hợp lệ: %',k; end if;
  s:=v#>>'{}';
  if length(s)>(case when k='remarks' then 1500 else 200 end) or s~'[\x01-\x08\x0B\x0C\x0E-\x1F]' then raise exception 'Ô nhập quá dài hoặc chứa ký tự điều khiển.'; end if;
  if s<>'' and (k like '%date' or k like '%due') then
   if s!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Ngày phải theo YYYY-MM-DD.'; end if;
   d:=s::date;
  end if;
 end loop;
end$$;
create function cpc1_private.row_result(form text,r jsonb,t3 text default '',endo boolean default false) returns jsonb language plpgsql stable set search_path='' as $$
declare keys text[]; k text; raw text; nums jsonb:='{}'; errors jsonb:='{}'; vals jsonb:='{}'; params jsonb:='{}'; st text:='incomplete'; states text[]:='{}'; missing boolean:=false; bad boolean:=false;
 vg numeric;vc numeric;me numeric;ms numeric;mf numeric;t1 numeric;t2 numeric;tsteam numeric;latent numeric;res numeric;delta numeric;v numeric;lim numeric;
begin
 keys:=case form when 'bm01' then array['vg','vc'] when 'bm02' then array['conductivity','toc','microbial'] when 'bm03' then array['me','ms','mf','t1','t2','t3'] when 'bm04' then array['te','to','ts','t3'] end;
 if form='bm04' then r:=r||jsonb_build_object('t3',coalesce(t3,'')); end if;
 if form='bm02' and endo then keys:=keys||'endotoxin'::text; end if;
 foreach k in array keys loop
  raw:=coalesce(r->>k,'');
  if raw='' then missing:=true;errors:=errors||jsonb_build_object(k,'Chưa nhập dữ liệu.');
  else begin nums:=nums||jsonb_build_object(k,cpc1_private.num(raw)); exception when others then bad:=true;errors:=errors||jsonb_build_object(k,'Nhập số thập phân hợp lệ, không dùng dấu phân cách hàng nghìn.'); end; end if;
 end loop;
 if form='bm02' then
  foreach k in array keys loop
   if errors?k then st:=case when coalesce(r->>k,'')='' then 'incomplete' else 'invalid' end;
   else
    v:=(nums->>k)::numeric;lim:=case k when 'conductivity' then 1.3 when 'toc' then 500 when 'microbial' then 10 else .25 end;
    st:=case when v<0 then 'invalid' when v<=lim then 'pass' else 'fail' end;
    if v<0 then errors:=errors||jsonb_build_object(k,'Kết quả không được âm.');end if;
    vals:=vals||jsonb_build_object(k,cpc1_private.shown(v));
   end if;
   states:=states||st;params:=params||jsonb_build_object(k,st);
  end loop;
  st:=coalesce(r->>'appearance','');
  if st not in ('pass','fail') then st:=case when st='' then 'incomplete' else 'invalid' end;errors:=errors||jsonb_build_object('appearance','Chọn kết quả cảm quan.');end if;
  states:=states||st;params:=params||jsonb_build_object('appearance',st);
  if not endo then params:=params||jsonb_build_object('endotoxin','not_applicable');end if;
  return jsonb_build_object('values',vals,'parameters',params,'status',cpc1_private.combine(states),'errors',errors);
 end if;
 if missing or bad then return jsonb_build_object('values',vals,'errors',errors,'status',case when bad then 'invalid' else 'incomplete' end);end if;
 if form='bm01' then
  vg:=(nums->>'vg')::numeric;vc:=(nums->>'vc')::numeric;
  if vg<0 then errors:=errors||'{"vg":"Thể tích khí không được âm."}';end if;
  if vc<=100 or vc<=vg then errors:=errors||'{"vc":"Vc phải lớn hơn 100 mL và lớn hơn Vg."}';end if;
  if errors='{}' then res:=100*vg/(vc-vg);st:=case when res<=3.5 then 'pass' else 'fail' end;end if;
 elsif form='bm03' then
  me:=(nums->>'me')::numeric;ms:=(nums->>'ms')::numeric;mf:=(nums->>'mf')::numeric;t1:=(nums->>'t1')::numeric;t2:=(nums->>'t2')::numeric;tsteam:=(nums->>'t3')::numeric;
  if me<=0 then errors:=errors||'{"me":"Khối lượng bình phải dương."}';end if;
  if ms<=me then errors:=errors||'{"ms":"Khối lượng sau thêm nước phải lớn hơn bình rỗng."}';end if;
  if mf<=ms then errors:=errors||'{"mf":"Khối lượng cuối phải lớn hơn khối lượng sau thêm nước."}';end if;
  if t1>=27 then errors:=errors||'{"t1":"Nước ban đầu phải dưới 27 °C."}';end if;
  if t2<78 or t2>82 or t2<=t1 then errors:=errors||'{"t2":"Nhiệt độ kết thúc phải trong 80 ± 2 °C và lớn hơn nhiệt độ đầu."}';end if;
  if tsteam<100 or tsteam>140 then errors:=errors||'{"t3":"Nhiệt độ hơi phải trong 100–140 °C."}';end if;
  if not errors ?| array['me','ms','mf','t3'] then
   select s.latent into latent from cpc1_private.steam_table s where s.temperature<=tsteam order by s.temperature desc limit 1;
   if latent is null then raise exception 'Chưa cấu hình bảng tra nhiệt ẩn.';end if;
   res:=(t2-t1)*(4.18*(ms-me)+.23)/(latent*(mf-ms))-4.18*(tsteam-t2)/latent;
   vals:=jsonb_build_object('latent',latent::text);st:=case when res>=.95 then 'pass' else 'fail' end;
  end if;
 else
  res:=(nums->>'te')::numeric-(nums->>'to')::numeric;delta:=abs((nums->>'ts')::numeric-(nums->>'t3')::numeric);
  st:=case when res<=25 and delta<=3 then 'pass' else 'fail' end;vals:=jsonb_build_object('delta',cpc1_private.shown(delta),'t3',nums->>'t3');
 end if;
 if res is not null then vals:=vals||jsonb_build_object('result',cpc1_private.shown(res),'print_result',round(res,case when form='bm04' then 1 else 2 end)::text,'raw_result',res::text);end if;
 if errors<>'{}' then st:='invalid';end if;
 return jsonb_build_object('values',vals,'errors',errors,'status',st);
end$$;

create function cpc1_private.evaluate(p_data jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare cfg jsonb;f text;k text;block jsonb;row jsonb;loc jsonb;lid text;allowed text[];known text[];i integer;one jsonb;rows jsonb;locs jsonb;states text[];global_states text[]:='{}';formstates text[];fs jsonb:='{}';arr jsonb;st text;np integer;nf integer;ni integer;
begin
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>250000 then raise exception 'Dữ liệu không đúng cấu trúc hoặc quá lớn.';end if;
 for k in select jsonb_object_keys(p_data) loop if k not in ('meta','equipment','bm01','bm02','bm03','bm04') then raise exception 'Trường không thuộc biểu mẫu.';end if;end loop;
 select config into cfg from cpc1_private.settings where id;
 if cfg is null then raise exception 'Chưa cấu hình biểu mẫu CPC1.';end if;
 select array_agg(v->>'id') into known from jsonb_array_elements(cfg->'locations') v;
 perform cpc1_private.check_record(coalesce(p_data->'meta','{}'),array['executed_by','execution_date','evaluated_by','reported_by','report_date','remarks','deviation','evaluation_date','next_evaluation']);
 perform cpc1_private.check_record(coalesce(p_data->'equipment','{}'),array['balance_due','balance_status','thermometer_due','thermometer_status']);
 foreach f in array array['bm01','bm02','bm03','bm04'] loop
  block:=coalesce(p_data->f,'{}');if jsonb_typeof(block)<>'object' then raise exception 'Dữ liệu biểu mẫu không hợp lệ.';end if;
  allowed:=case f when 'bm01' then array['vg','vc'] when 'bm02' then array['appearance','conductivity','toc','microbial','endotoxin','sample_chem','sample_micro','sample_endo'] when 'bm03' then array['me','ms','mf','t1','t2','t3'] else array['te','to','ts'] end || array['executor','date'];
  for k,row in select * from jsonb_each(block) loop
   if not k=any(known) then raise exception 'Điểm không thuộc bộ 17 điểm.';end if;
   if f='bm02' then perform cpc1_private.check_record(row,allowed);
   else
    if jsonb_typeof(row)<>'array' or jsonb_array_length(row)>3 then raise exception 'Mỗi điểm có 3 lần đo.';end if;
    for one in select * from jsonb_array_elements(row) loop perform cpc1_private.check_record(one,allowed);end loop;
   end if;
  end loop;
 end loop;
 foreach f in array array['bm01','bm02','bm03','bm04'] loop
  rows:='{}';locs:='{}';formstates:='{}';np:=0;nf:=0;ni:=0;
  for loc in select * from jsonb_array_elements(cfg->'locations') loop
   lid:=loc->>'id';states:='{}';
   if f='bm02' and not (loc->>'endotoxin')::boolean and (coalesce(p_data#>>array[f,lid,'endotoxin'],'')<>'' or coalesce(p_data#>>array[f,lid,'sample_endo'],'')<>'') then raise exception 'Điểm này không lấy mẫu nội độc tố theo phạm vi đã chọn.';end if;
   if f='bm02' then
    one:=cpc1_private.row_result(f,coalesce(p_data#>array[f,lid],'{}'),'',(loc->>'endotoxin')::boolean);
    rows:=rows||jsonb_build_object(lid,one);states:=states||(one->>'status');
   else
    arr:='[]';
    for i in 0..2 loop
     one:=cpc1_private.row_result(f,coalesce(p_data#>array[f,lid,i::text],'{}'),coalesce(p_data#>>array['bm03',lid,i::text,'t3'],''));
     arr:=arr||jsonb_build_array(one);states:=states||(one->>'status');
    end loop;
    rows:=rows||jsonb_build_object(lid,arr);
   end if;
   st:=cpc1_private.combine(states);locs:=locs||jsonb_build_object(lid,st);formstates:=formstates||st;
   if st='pass' then np:=np+1;elsif st='fail' then nf:=nf+1;else ni:=ni+1;end if;
  end loop;
  st:=cpc1_private.combine(formstates);global_states:=global_states||st;
  fs:=fs||jsonb_build_object(f,jsonb_build_object('rows',rows,'locations',locs,'summary',jsonb_build_object('pass',np,'fail',nf,'incomplete',ni,'total',cardinality(known)),'status',st));
 end loop;
 return jsonb_build_object('forms',fs,'overall',cpc1_private.combine(global_states),'formula_version','pure-steam-draft-2026-09-23-v1',
 'source_context',jsonb_build_object('config',cfg,'template_sha256',cfg->'template_sha256','source_sha256',cfg->'source_sha256','asset_sha256',cfg->'asset_sha256','asset_path',cfg->'asset_path','engine_sha256',cfg->'engine_sha256','formula_version','pure-steam-draft-2026-09-23-v1',
 'equations',jsonb_build_object('ncg','100*Vg/(Vc-Vg)','dryness','(T2-T1)*(4.18*(Ms-Me)+0.23)/(L*(Mf-Ms))-4.18*(T3-T2)/L','superheat','Te-To','delta','abs(Ts-T3)'),
 'criteria',jsonb_build_object('ncg_max',3.5,'dryness_min',.95,'superheat_max',25,'delta_max',3,'conductivity_max',1.3,'toc_max',500,'microbial_max',10,'endotoxin_max',.25,'A',.23,'Cpw',4.18,'rounding','compare unrounded; web display 6 decimals','print_formats',jsonb_build_object('bm01','0.00: SQ1 sheet2 H29','bm03','0.00: SQ1 sheet3 H36','bm04','0.0: SQ1 sheet4 G25'),'latent_lookup','floor, no extrapolation'),
 'steam_table',(select jsonb_agg(jsonb_build_array(temperature,latent) order by temperature) from cpc1_private.steam_table)));
end$$;

create function public.cpc1_config() returns jsonb language plpgsql stable security definer set search_path='' as $$begin perform cpc1_private.viewer();return (select config from cpc1_private.settings where id);end$$;
create function public.cpc1_evaluate(p_data jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$begin perform cpc1_private.member();return cpc1_private.evaluate(p_data);end$$;
create function public.cpc1_load(p_record_id uuid,p_version integer default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=cpc1_private.viewer();r public.cpc1_records;rev public.cpc1_revisions;begin
 select * into r from public.cpc1_records where id=p_record_id and owner_id=u;
 if not found then raise exception 'Không có quyền truy cập hồ sơ.' using errcode='42501';end if;
 select * into rev from public.cpc1_revisions where record_id=r.id and version=coalesce(p_version,r.version);
 if not found then raise exception 'Không có phiên bản này.';end if;
 return jsonb_build_object('id',r.id,'title',r.title,'version',rev.version,'data',rev.payload,'evaluation',rev.evaluation,'created_at',rev.created_at);
end$$;
create function public.cpc1_list() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=cpc1_private.viewer();begin
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select id,title,version,updated_at from public.cpc1_records where owner_id=u order by updated_at desc limit 100) x),'[]');end$$;
create function public.cpc1_save(p_data jsonb,p_record_id uuid default null,p_expected_version integer default 0,p_request_id uuid default null,p_title text default 'Đợt đánh giá hơi tinh khiết') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=cpc1_private.member();r public.cpc1_records;ev jsonb;inp jsonb;cached cpc1_private.requests;outp jsonb;oldv integer;ts timestamptz:=clock_timestamp();begin
 if p_request_id is null or p_expected_version is null or p_expected_version<0 or p_title is null or length(trim(p_title)) not between 1 and 200 then raise exception 'Thiếu mã yêu cầu hoặc tên hồ sơ không hợp lệ.';end if;
 inp:=jsonb_build_object('data',p_data,'record',p_record_id,'expected',p_expected_version,'title',p_title);
 perform pg_advisory_xact_lock(hashtextextended('cpc1:'||u::text||p_request_id::text,0));
 select * into cached from cpc1_private.requests where actor_id=u and request_id=p_request_id;
 if found then if cached.input<>inp then raise exception 'Mã yêu cầu đã dùng với dữ liệu khác.' using errcode='23505';end if;return cached.response;end if;
 ev:=cpc1_private.evaluate(p_data);
 if p_record_id is null then
  if p_expected_version<>0 then raise exception 'Phiên bản ban đầu phải bằng 0.' using errcode='40001';end if;
  insert into public.cpc1_records(owner_id,title,created_at,updated_at) values(u,p_title,ts,ts) returning * into r;oldv:=null;
 else
  select * into r from public.cpc1_records where id=p_record_id and owner_id=u for update;
  if not found then raise exception 'Không có quyền sửa hồ sơ.' using errcode='42501';end if;
  if r.version<>p_expected_version then raise exception 'Hồ sơ đã có phiên bản mới. Mở lại trước khi lưu; bản đang nhập được giữ.' using errcode='40001';end if;
  oldv:=r.version;
  update public.cpc1_records set version=version+1,title=p_title,updated_at=ts where id=r.id returning * into r;
 end if;
 insert into public.cpc1_revisions(record_id,version,payload,evaluation,actor_id,created_at) values(r.id,r.version,p_data,ev,u,ts);
 insert into cpc1_private.audit(actor_id,record_id,old_version,new_version,action,request_id,created_at) values(u,r.id,oldv,r.version,'save_draft',p_request_id,ts);
 outp:=jsonb_build_object('id',r.id,'title',r.title,'version',r.version,'data',p_data,'evaluation',ev,'created_at',ts);
 insert into cpc1_private.requests values(u,p_request_id,inp,outp);return outp;
end$$;
revoke all on all functions in schema cpc1_private from public,anon,authenticated;
grant usage on schema public to authenticated;
revoke all on function public.cpc1_config(),public.cpc1_evaluate(jsonb),public.cpc1_load(uuid,integer),public.cpc1_list(),public.cpc1_save(jsonb,uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.cpc1_config(),public.cpc1_evaluate(jsonb),public.cpc1_load(uuid,integer),public.cpc1_list(),public.cpc1_save(jsonb,uuid,integer,uuid,text) to authenticated;

-- Source 202609230002_private_templates.sql
-- Supabase Storage owns the storage schema. No public bucket, client writes, or signed URL mutation.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('cpc1-templates','cpc1-templates',false,10485760,array['application/pdf','application/json','font/ttf','application/octet-stream'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create or replace function public.cpc1_template_access() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.vmp_is_active_session(auth.uid()) and coalesce(public.vmp_business_role(auth.uid()),'') in ('admin','qa_manager','qa_staff') and exists(select 1 from cpc1_private.members where user_id=auth.uid() and enabled)
$$;
revoke all on function public.cpc1_template_access() from public,anon;
grant execute on function public.cpc1_template_access() to authenticated;
drop policy if exists cpc1_templates_member_read on storage.objects;
create policy cpc1_templates_member_read on storage.objects for select to authenticated using(bucket_id='cpc1-templates' and public.cpc1_template_access());

-- Source 202609230003_gas_modules.sql
create table cpc1_private.gas_settings(system text primary key check(system in ('air','nitrogen')),config jsonb not null);
alter table cpc1_private.gas_settings enable row level security;
revoke all on cpc1_private.gas_settings from public,anon,authenticated;
alter table public.cpc1_records add column system text not null default 'steam' check(system in ('steam','air','nitrogen'));

create function cpc1_private.gas_object(v jsonb,allowed text[]) returns void language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(v) is distinct from 'object' then raise exception 'Cấu trúc dữ liệu không hợp lệ.';end if;
 if exists(select 1 from jsonb_object_keys(v) k where not k=any(coalesce(allowed,array[]::text[]))) then raise exception 'Trường không thuộc biểu mẫu khí.';end if;
end$$;
create function cpc1_private.gas_fields(v jsonb,spec jsonb) returns void language plpgsql immutable set search_path='' as $$
declare f jsonb;k text;t text;s text;n integer;begin
 perform cpc1_private.gas_object(v,array(select x->>'key' from jsonb_array_elements(spec) x));
 for f in select * from jsonb_array_elements(spec) loop
  k:=f->>'key';t:=f->>'type';if not v?k then continue;end if;s:=v->>k;
  if jsonb_typeof(v->k)<>'string' or length(s)>(case when t='textarea' then 4000 else 200 end) then raise exception 'Trường nhập phải là chuỗi trong giới hạn độ dài.';end if;
  for n in 1..length(s) loop if ascii(substr(s,n,1))<32 and ascii(substr(s,n,1)) not in(9,10,13) then raise exception 'Ký tự điều khiển không hợp lệ.';end if;end loop;
  if t='date' and s<>'' then
   if s!~'^\d{4}-\d{2}-\d{2}$' or s::date::text<>s then raise exception 'Ngày phải hợp lệ theo dạng YYYY-MM-DD.';end if;
  end if;
 end loop;
end$$;
create function cpc1_private.gas_row(form text,r jsonb,limits jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare keys text[];k text;raw text;v numeric;vals jsonb:='{}';errs jsonb:='{}';states text[]:=array[]::text[];ok boolean;res numeric;outvals jsonb:='{}';begin
 keys:=case form when 'bm01' then array['p05','p5'] when 'bm02' then array['dewpoint'] when 'bm03' then array['flow','duration','reading'] when 'bm04' then array['microbial'] when 'bm05' then array['purity'] when 'control' then array['positive_count'] end;
 if keys is null then raise exception 'Mẫu tính khí không hợp lệ.';end if;
 foreach k in array keys loop
  raw:=coalesce(r->>k,'');
  if btrim(raw)='' then errs:=errs||jsonb_build_object(k,'Chưa nhập dữ liệu.');states:=array_append(states,'incomplete');continue;end if;
  begin
   if k='microbial' and upper(btrim(raw)) in ('KPH','KFH') then v:=0;else v:=cpc1_private.num(raw);end if;
   if k<>'dewpoint' and v<0 then raise exception 'Giá trị không được âm.';end if;
   if k in ('flow','duration') and v<=0 then raise exception 'Giá trị phải lớn hơn 0.';end if;
   if k='purity' and v>100 then raise exception 'Độ tinh khiết không vượt quá 100%%.';end if;
   if k='positive_count' and trunc(v)<>v then raise exception 'Số khuẩn lạc phải là số nguyên.';end if;
   vals:=vals||jsonb_build_object(k,v);
  exception when others then errs:=errs||jsonb_build_object(k,sqlerrm);states:=array_append(states,'invalid');end;
 end loop;
 if errs<>'{}'::jsonb then return jsonb_build_object('status',cpc1_private.combine(states),'values','{}'::jsonb,'errors',errs);end if;
 case form
 when 'bm01' then ok:=(vals->>'p05')::numeric<=(limits->>'p05')::numeric and (vals->>'p5')::numeric<=(limits->>'p5')::numeric;
 when 'bm02' then res:=(vals->>'dewpoint')::numeric;ok:=res<=(limits->>'dewpoint')::numeric;
 when 'bm03' then
  res:=(vals->>'reading')::numeric*20000/((vals->>'flow')::numeric*(vals->>'duration')::numeric);
  ok:=(vals->>'reading')::numeric*20000<=(limits->>'oil')::numeric*(vals->>'flow')::numeric*(vals->>'duration')::numeric;
 when 'bm04' then res:=(vals->>'microbial')::numeric;ok:=res<=(limits->>'microbial')::numeric;
 when 'bm05' then res:=(vals->>'purity')::numeric;ok:=res>=(limits->>'purity')::numeric;
 when 'control' then res:=(vals->>'positive_count')::numeric;ok:=res between 50 and 150;
 end case;
 foreach k in array keys loop outvals:=outvals||jsonb_build_object(k,cpc1_private.shown((vals->>k)::numeric));end loop;
 if res is not null then outvals:=outvals||jsonb_build_object('result',cpc1_private.shown(res),'print_result',cpc1_private.shown(res),'raw_result',res::text);end if;
 return jsonb_build_object('status',case when ok then 'pass' else 'fail' end,'values',outvals,'errors','{}'::jsonb);
end$$;
create function cpc1_private.evaluate_gas(d jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare cfg jsonb;f jsonb;loc jsonb;fid text;pid text;rows jsonb;ev jsonb;forms jsonb:='{}';control jsonb;sm jsonb;states text[];allstates text[]:=array[]::text[];fs text;overall text;passn int;failn int;incompleten int;invalidn int;codes text;begin
 perform cpc1_private.gas_object(d,array['system','meta','equipment','forms','controls','trend']);
 select config into cfg from cpc1_private.gas_settings where system=d->>'system';
 if cfg is null then raise exception 'Hệ thống khí chưa có cấu hình nguồn.';end if;
 perform cpc1_private.gas_object(coalesce(d->'forms','{}'),array(select x->>'id' from jsonb_array_elements(cfg->'forms') x where x->>'kind'='measurement'));
 perform cpc1_private.gas_object(coalesce(d->'equipment','{}'),array(select x->>'id' from jsonb_array_elements(cfg->'forms') x where x->>'kind'='measurement'));
 perform cpc1_private.gas_fields(coalesce(d->'meta','{}'),cfg->'meta_fields');
 perform cpc1_private.gas_fields(coalesce(d->'controls','{}'),cfg->'controls_fields');
 perform cpc1_private.gas_fields(coalesce(d->'trend','{}'),cfg->'trend_fields');
 control:=cpc1_private.gas_row('control',coalesce(d->'controls','{}'),'{}');
 for f in select * from jsonb_array_elements(cfg->'forms') where value->>'kind'='measurement' loop
  fid:=f->>'id';
  perform cpc1_private.gas_object(coalesce(d->'forms'->fid,'{}'),array(select x->>'id' from jsonb_array_elements(f->'locations') x));
  perform cpc1_private.gas_fields(coalesce(d->'equipment'->fid,'{}'),f->'equipment_fields');
  rows:='{}';states:=array[]::text[];passn:=0;failn:=0;incompleten:=0;invalidn:=0;codes:='';
  for loc in select * from jsonb_array_elements(f->'locations') loop
   pid:=loc->>'id';perform cpc1_private.gas_fields(coalesce(d->'forms'->fid->pid,'{}'),f->'fields');
   ev:=cpc1_private.gas_row(fid,coalesce(d->'forms'->fid->pid,'{}'),loc->'limits');
   rows:=rows||jsonb_build_object(pid,ev);states:=array_append(states,ev->>'status');
   case ev->>'status' when 'pass' then passn:=passn+1;when 'fail' then failn:=failn+1;codes:=codes||case when codes='' then '' else ', ' end||pid;when 'invalid' then invalidn:=invalidn+1;else incompleten:=incompleten+1;end case;
  end loop;
  if fid='bm04' then states:=array_append(states,control->>'status');end if;
  fs:=cpc1_private.combine(states);allstates:=array_append(allstates,fs);
  sm:=jsonb_build_object('total',jsonb_array_length(f->'locations'),'sampled',passn+failn,'pass',passn,'fail',failn,'invalid',invalidn,'incomplete',incompleten,'failed_codes',codes);
  if fid='bm04' then sm:=sm||jsonb_build_object('control_status',control->>'status');end if;
  forms:=forms||jsonb_build_object(fid,jsonb_build_object('status',fs,'rows',rows,'summary',sm));
 end loop;
 overall:=cpc1_private.combine(allstates);
 forms:=forms||jsonb_build_object(cfg->>'summary_form',jsonb_build_object('status',overall,'rows','{}'::jsonb),cfg->>'trend_form',jsonb_build_object('status','not_configured','rows','{}'::jsonb,'message','Chờ QMS-QT-013/HD02 để chốt phương pháp tính giới hạn; nội dung nhập là phân tích bên ngoài.'));
 return jsonb_build_object('system',d->>'system','formula_version',cfg->>'formula_version','overall',overall,'forms',forms,'controls',control,'source_context',jsonb_build_object('config',cfg,'formula_version',cfg->'formula_version','criteria',cfg->'criteria','template_sha256',cfg->'template_sha256','source_sha256',cfg->'source_sha256','asset_sha256',coalesce(cfg->'asset_sha256','{}'),'asset_path',cfg->'asset_path','engine_sha256',coalesce(cfg->'engine_sha256','{}')));
end$$;
alter function cpc1_private.evaluate(jsonb) rename to evaluate_steam;
create function cpc1_private.evaluate(p_data jsonb) returns jsonb language plpgsql stable set search_path='' as $$
begin
 if p_data?'system' then return cpc1_private.evaluate_gas(p_data);end if;
 return cpc1_private.evaluate_steam(p_data);
end$$;
create function public.cpc1_gas_config(p_system text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cfg jsonb;begin
 perform cpc1_private.viewer();select config into cfg from cpc1_private.gas_settings where system=p_system;
 if cfg is null then raise exception 'Hệ thống khí chưa có cấu hình nguồn.';end if;return cfg;
end$$;
create or replace function public.cpc1_list() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=cpc1_private.viewer();begin
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select id,title,system,version,updated_at from public.cpc1_records where owner_id=u order by updated_at desc limit 100) x),'[]');end$$;

-- Shared save transaction is replaced below: same ownership, locks, idempotency and audit;
-- system is frozen on initial creation and checked before every subsequent revision.

create or replace function public.cpc1_save(p_data jsonb,p_record_id uuid default null,p_expected_version integer default 0,p_request_id uuid default null,p_title text default 'Đợt đánh giá hơi tinh khiết') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=cpc1_private.member();r public.cpc1_records;ev jsonb;inp jsonb;cached cpc1_private.requests;outp jsonb;oldv integer;ts timestamptz:=clock_timestamp();begin
 if p_request_id is null or p_expected_version is null or p_expected_version<0 or p_title is null or length(trim(p_title)) not between 1 and 200 then raise exception 'Thiếu mã yêu cầu hoặc tên hồ sơ không hợp lệ.';end if;
 inp:=jsonb_build_object('data',p_data,'record',p_record_id,'expected',p_expected_version,'title',p_title);
 perform pg_advisory_xact_lock(hashtextextended('cpc1:'||u::text||p_request_id::text,0));
 select * into cached from cpc1_private.requests where actor_id=u and request_id=p_request_id;
 if found then if cached.input<>inp then raise exception 'Mã yêu cầu đã dùng với dữ liệu khác.' using errcode='23505';end if;return cached.response;end if;
 ev:=cpc1_private.evaluate(p_data);
 if p_record_id is null then
  if p_expected_version<>0 then raise exception 'Phiên bản ban đầu phải bằng 0.' using errcode='40001';end if;
  insert into public.cpc1_records(owner_id,title,system,created_at,updated_at) values(u,p_title,coalesce(p_data->>'system','steam'),ts,ts) returning * into r;oldv:=null;
 else
  select * into r from public.cpc1_records where id=p_record_id and owner_id=u for update;
  if not found then raise exception 'Không có quyền sửa hồ sơ.' using errcode='42501';end if;
  if r.version<>p_expected_version then raise exception 'Hồ sơ đã có phiên bản mới. Mở lại trước khi lưu; bản đang nhập được giữ.' using errcode='40001';end if;
  if r.system<>coalesce(p_data->>'system','steam') then raise exception 'Không được đổi hệ thống của hồ sơ.' using errcode='22023';end if;
  oldv:=r.version;
  update public.cpc1_records set version=version+1,title=p_title,updated_at=ts where id=r.id returning * into r;
 end if;
 insert into public.cpc1_revisions(record_id,version,payload,evaluation,actor_id,created_at) values(r.id,r.version,p_data,ev,u,ts);
 insert into cpc1_private.audit(actor_id,record_id,old_version,new_version,action,request_id,created_at) values(u,r.id,oldv,r.version,'save_draft',p_request_id,ts);
 outp:=jsonb_build_object('id',r.id,'title',r.title,'version',r.version,'data',p_data,'evaluation',ev,'created_at',ts);
 insert into cpc1_private.requests values(u,p_request_id,inp,outp);return outp;
end$$;

revoke all on all functions in schema cpc1_private from public,anon,authenticated;
revoke all on function public.cpc1_gas_config(text) from public,anon,authenticated;
grant execute on function public.cpc1_gas_config(text) to authenticated;

-- Source 202609230004_version_conflict_http.sql
-- Business version conflicts must not trigger PostgREST serialization retries.
-- SQLSTATE PT409 maps to HTTP 409; ownership, locks and atomic writes are unchanged.
create or replace function public.cpc1_save(p_data jsonb,p_record_id uuid default null,p_expected_version integer default 0,p_request_id uuid default null,p_title text default 'Đợt đánh giá hơi tinh khiết') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=cpc1_private.member();r public.cpc1_records;ev jsonb;inp jsonb;cached cpc1_private.requests;outp jsonb;oldv integer;ts timestamptz:=clock_timestamp();begin
 if p_request_id is null or p_expected_version is null or p_expected_version<0 or p_title is null or length(trim(p_title)) not between 1 and 200 then raise exception 'Thiếu mã yêu cầu hoặc tên hồ sơ không hợp lệ.';end if;
 inp:=jsonb_build_object('data',p_data,'record',p_record_id,'expected',p_expected_version,'title',p_title);
 perform pg_advisory_xact_lock(hashtextextended('cpc1:'||u::text||p_request_id::text,0));
 select * into cached from cpc1_private.requests where actor_id=u and request_id=p_request_id;
 if found then if cached.input<>inp then raise exception 'Mã yêu cầu đã dùng với dữ liệu khác.' using errcode='23505';end if;return cached.response;end if;
 ev:=cpc1_private.evaluate(p_data);
 if p_record_id is null then
  if p_expected_version<>0 then raise exception 'Phiên bản ban đầu phải bằng 0.' using errcode='PT409';end if;
  insert into public.cpc1_records(owner_id,title,system,created_at,updated_at) values(u,p_title,coalesce(p_data->>'system','steam'),ts,ts) returning * into r;oldv:=null;
 else
  select * into r from public.cpc1_records where id=p_record_id and owner_id=u for update;
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
end$$;
-- A browser session is not itself an entry grant. This RPC is checked on module entry.
create function public.cpc1_context() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=cpc1_private.viewer();begin return jsonb_build_object('can_enter',exists(select 1 from cpc1_private.members where user_id=u and enabled),'can_view',true,'record_scope','own');end$$;
revoke all on function public.cpc1_context() from public,anon,authenticated;
grant execute on function public.cpc1_context() to authenticated;
revoke all on all tables in schema cpc1_private from public,anon,authenticated;
revoke all on all sequences in schema cpc1_private from public,anon,authenticated;
revoke all on all functions in schema cpc1_private from public,anon,authenticated;
-- Postflight checks the new surface and the unchanged identity boundary.
do $$ declare r record; begin
 if md5(pg_get_functiondef('public.vmp_is_active_session(uuid)'::regprocedure))<>'688917439d4a88fa7bdd953c27498734' then raise exception 'VMP boundary changed';end if;
 for r in select p.oid,p.prosecdef,p.proconfig,p.proowner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'cpc1\_%' escape '\' loop
  if not r.prosecdef or r.proowner<> (select oid from pg_roles where rolname='postgres') or not coalesce('search_path=""'=any(r.proconfig),false) or has_function_privilege('anon',r.oid,'EXECUTE') or not has_function_privilege('authenticated',r.oid,'EXECUTE') then raise exception 'Unexpected CPC RPC security contract';end if;
 end loop;
 if has_table_privilege('authenticated','public.cpc1_records','SELECT') or has_table_privilege('authenticated','public.cpc1_revisions','INSERT') then raise exception 'Unexpected direct table grant';end if;
end $$;

 do $dependency$ declare r record; begin
  for r in select p.*,p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner_name from pg_proc p where p.oid in ('public.vmp_is_active_session(uuid)'::regprocedure,'public.vmp_business_role(uuid)'::regprocedure) loop
   if md5(pg_get_functiondef(r.oid))<>(case when r.proname='vmp_is_active_session' then '688917439d4a88fa7bdd953c27498734' else 'd0c5fd86b9972ea4a49a11af659f3921' end) or r.owner_name<>'postgres' or not r.prosecdef or not coalesce('search_path=public, pg_temp'=any(r.proconfig),false) or has_function_privilege('anon',r.oid,'EXECUTE') or has_function_privilege('authenticated',r.oid,'EXECUTE') or exists(select 1 from aclexplode(coalesce(r.proacl,acldefault('f',r.proowner))) where grantee not in (r.proowner,(select oid from pg_roles where rolname='service_role'))) then raise exception 'Unreviewed VMP canonical dependency: %',r.signature;end if;
  end loop;
 end $dependency$;

do $$ begin if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'cpc1\_%' escape '\')<>8 then raise exception 'Unexpected qualification RPC inventory';end if;end $$;
-- Explicitly neutralize managed default ACLs on every new application object.
do $surface$ declare r record; actor text; begin
 foreach actor in array array['anon','authenticated'] loop
  if has_schema_privilege(actor,'cpc1_private','USAGE') then raise exception 'Private schema exposed';end if;
  for r in select c.oid,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='cpc1_private' or (n.nspname='public' and c.relname in ('cpc1_records','cpc1_revisions')) loop
   if r.relkind in ('r','p','v') and has_table_privilege(actor,r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception 'Direct qualification table grant';end if;
   if r.relkind='S' and has_sequence_privilege(actor,r.oid,'USAGE,SELECT,UPDATE') then raise exception 'Private sequence grant';end if;
  end loop;
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='cpc1_private' loop
   if has_function_privilege(actor,r.oid,'EXECUTE') then raise exception 'Private function exposed';end if;
  end loop;
 end loop;
 if (select count(*) from pg_policies where schemaname='storage' and tablename='objects')<>1 or not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='cpc1_templates_member_read' and cmd='SELECT' and roles=array['authenticated']::name[]) then raise exception 'Unreviewed Storage policy surface';end if;
end $surface$;
notify pgrst,'reload schema';
commit;

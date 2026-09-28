-- Qualification execution scope; no approval/signature semantics and no role changes.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create table cpc1_private.runs(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 title text not null check(length(btrim(title)) between 1 and 200),
 mode text not null check(mode in ('campaign','single')), started_on date not null,
 status text not null default 'open' check(status in ('open','completed','closed')),
 version integer not null default 1 check(version>0), close_reason text,
 created_at timestamptz not null default clock_timestamp(), closed_at timestamptz,
 check((status='open' and closed_at is null) or (status<>'open' and closed_at is not null)),
 check(status<>'closed' or (close_reason is not null and length(btrim(close_reason)) between 1 and 1000))
);
create table cpc1_private.run_items(
 run_id uuid not null references cpc1_private.runs(id), system text not null check(system in ('steam','air','nitrogen')),
 record_id uuid not null unique references public.cpc1_records(id), scope jsonb not null,
 config_snapshot jsonb not null, closed_revision integer,
 primary key(run_id,system), foreign key(record_id,closed_revision) references public.cpc1_revisions(record_id,version)
);
create table cpc1_private.run_events(
 id bigint generated always as identity primary key, run_id uuid not null references cpc1_private.runs(id),
 actor_id uuid not null references auth.users(id), action text not null, details jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
create table cpc1_private.run_requests(
 actor_id uuid not null references auth.users(id), request_id uuid not null, input jsonb not null,response jsonb not null,
 primary key(actor_id,request_id)
);
alter table cpc1_private.runs enable row level security;
alter table cpc1_private.run_items enable row level security;
alter table cpc1_private.run_events enable row level security;
alter table cpc1_private.run_requests enable row level security;
revoke all on cpc1_private.runs,cpc1_private.run_items,cpc1_private.run_events,cpc1_private.run_requests from public,anon,authenticated;
create index cpc1_run_owner_date on cpc1_private.runs(owner_id,started_on desc);

create function cpc1_private.system_config(s text) returns jsonb language plpgsql stable set search_path='' as $$
declare c jsonb;begin
 if s='steam' then select config into c from cpc1_private.settings where id;
 else select config into c from cpc1_private.gas_settings where system=s;end if;
 if c is null then raise exception 'Hệ thống không hợp lệ.' using errcode='23514';end if;return c;
end$$;
create function cpc1_private.check_scope(s text,scope jsonb,mode text) returns void language plpgsql stable set search_path='' as $$
declare c jsonb:=cpc1_private.system_config(s);f text;pts jsonb;known jsonb;forms text[];pid text;
begin
 if jsonb_typeof(scope) is distinct from 'object' or scope='{}' then raise exception 'Chọn phép thử và điểm lấy mẫu.' using errcode='23514';end if;
 forms:=case when s='steam' then array['bm01','bm02','bm03','bm04'] else array(select x->>'id' from jsonb_array_elements(c->'forms') x where x->>'kind'='measurement') end;
 if mode='campaign' and (select array_agg(key order by key) from jsonb_object_keys(scope) key) is distinct from (select array_agg(x order by x) from unnest(forms) x) then raise exception 'Đợt đầy đủ cần toàn bộ phép thử đo của hệ thống.' using errcode='23514';end if;
 for f,pts in select * from jsonb_each(scope) loop
  if not f=any(forms) or jsonb_typeof(pts) is distinct from 'array' or jsonb_array_length(pts)=0 then raise exception 'Phạm vi phép thử không hợp lệ.' using errcode='23514';end if;
  known:=case when s='steam' then c->'locations' else (select x->'locations' from jsonb_array_elements(c->'forms') x where x->>'id'=f) end;
  if (select count(*) from jsonb_array_elements(pts))<>(select count(distinct value) from jsonb_array_elements(pts)) then raise exception 'Điểm bị lặp.' using errcode='23514';end if;
  if exists(select 1 from jsonb_array_elements(pts) x where jsonb_typeof(x)<>'string' or not exists(select 1 from jsonb_array_elements(known) k where k->>'id'=x#>>'{}')) then raise exception 'Điểm không thuộc cấu hình phép thử.' using errcode='23514';end if;
  if mode='campaign' and jsonb_array_length(pts)<>jsonb_array_length(known) then raise exception 'Đợt đầy đủ cần toàn bộ điểm lấy mẫu.' using errcode='23514';end if;
 end loop;
 if s='steam' and scope?'bm04' and exists(select 1 from jsonb_array_elements_text(scope->'bm04') x where not coalesce(scope->'bm03','[]')?x) then raise exception 'Phép thử quá nhiệt cần độ khô tại cùng điểm để lấy T3.' using errcode='23514';end if;
end$$;
create function cpc1_private.run_progress(run uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare item record;f text;pts jsonb;pid text;ev jsonb;st text;complete int:=0;total int:=0;failn int:=0;invalidn int:=0;controls_ok boolean:=true;
begin
 for item in select i.*,r.version from cpc1_private.run_items i join public.cpc1_records r on r.id=i.record_id where i.run_id=run loop
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
end$$;
create function public.cpc1_run_get(p_run_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=cpc1_private.viewer();r cpc1_private.runs;items jsonb;begin
 select * into r from cpc1_private.runs where id=p_run_id and owner_id=u;
 if not found then raise exception 'Không có quyền truy cập đợt.' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('system',i.system,'record_id',i.record_id,'scope',i.scope,'version',coalesce(i.closed_revision,rec.version)) order by i.system),'[]') into items from cpc1_private.run_items i join public.cpc1_records rec on rec.id=i.record_id where i.run_id=r.id;
 return to_jsonb(r)-'owner_id'||jsonb_build_object('items',items,'progress',cpc1_private.run_progress(r.id));
end$$;
create function public.cpc1_run_list() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=cpc1_private.viewer();begin
 return coalesce((select jsonb_agg(public.cpc1_run_get(id) order by started_on desc,created_at desc) from (select * from cpc1_private.runs where owner_id=u order by started_on desc,created_at desc limit 200) x),'[]');
end$$;
create function public.cpc1_run_create(p_definition jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=cpc1_private.member();r cpc1_private.runs;item jsonb;s text;scope jsonb;d jsonb;record jsonb;inp jsonb:=jsonb_build_object('action','create','definition',p_definition);cached cpc1_private.run_requests;outp jsonb;started date;
begin
 if p_request_id is null then raise exception 'Thiếu mã yêu cầu.' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('cpc1run:'||u::text||p_request_id::text,0));
 select * into cached from cpc1_private.run_requests where actor_id=u and request_id=p_request_id;
 if found then if cached.input is distinct from inp then raise exception 'Mã yêu cầu đã dùng cho dữ liệu khác.' using errcode='23505';end if;return cached.response;end if;
 if jsonb_typeof(p_definition) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_definition) k where k not in ('title','mode','started_on','scope')) or coalesce(p_definition->>'mode','') not in ('campaign','single') or length(btrim(coalesce(p_definition->>'title',''))) not between 1 and 200 or coalesce(p_definition->>'started_on','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Thông tin đợt không hợp lệ.' using errcode='23514';end if;
 started:=(p_definition->>'started_on')::date;
 if jsonb_typeof(p_definition->'scope') is distinct from 'array' or jsonb_array_length(p_definition->'scope') not between 1 and 3 or (p_definition->>'mode'='single' and jsonb_array_length(p_definition->'scope')<>1) then raise exception 'Chọn hệ thống của đợt.' using errcode='23514';end if;
 insert into cpc1_private.runs(owner_id,title,mode,started_on) values(u,btrim(p_definition->>'title'),p_definition->>'mode',started) returning * into r;
 for item in select * from jsonb_array_elements(p_definition->'scope') loop
  if jsonb_typeof(item) is distinct from 'object' or exists(select 1 from jsonb_object_keys(item) k where k not in ('system','forms')) then raise exception 'Phạm vi hệ thống không hợp lệ.' using errcode='23514';end if;
  s:=item->>'system';scope:=item->'forms';perform cpc1_private.check_scope(s,scope,r.mode);
  d:=case when s='steam' then '{"meta":{},"equipment":{},"bm01":{},"bm02":{},"bm03":{},"bm04":{}}'::jsonb else jsonb_build_object('system',s,'meta','{}'::jsonb,'equipment','{}'::jsonb,'forms','{}'::jsonb,'controls','{}'::jsonb,'trend','{}'::jsonb) end;
  record:=public.cpc1_save(d,null,0,gen_random_uuid(),left(r.title||' · '||s,200));
  insert into cpc1_private.run_items values(r.id,s,(record->>'id')::uuid,scope,cpc1_private.system_config(s),null);
 end loop;
 insert into cpc1_private.run_events(run_id,actor_id,action,details) values(r.id,u,'created',p_definition);
 outp:=public.cpc1_run_get(r.id);insert into cpc1_private.run_requests values(u,p_request_id,inp,outp);return outp;
end$$;
-- This trigger also protects linked records when an older client calls cpc1_save directly.
-- Closure locks the run row, reads committed record revisions, and never locks records.
create function cpc1_private.guard_run_revision() returns trigger language plpgsql security definer set search_path='' as $$
declare item cpc1_private.run_items;r cpc1_private.runs;f text;pts jsonb;pid text;row jsonb;block jsonb;
begin
 select * into item from cpc1_private.run_items where record_id=new.record_id;
 if not found then return new;end if;
 select * into r from cpc1_private.runs where id=item.run_id for update;
 if r.status<>'open' then raise exception 'Đợt đã kết thúc; không sửa đè hồ sơ đã chốt.' using errcode='PT409';end if;
 if item.config_snapshot is distinct from cpc1_private.system_config(item.system) then raise exception 'Cấu hình nguồn đã thay đổi. Cần xem xét trước khi tiếp tục đợt.' using errcode='23514';end if;
 -- Metadata and trend narrative are run-wide; equipment and controls follow measurement scope.
 if item.system='steam' then
  if not item.scope?'bm03' and exists(select 1 from jsonb_each_text(coalesce(new.payload->'equipment','{}')) x where x.value<>'') then raise exception 'Thiết bị ngoài phạm vi phép thử.' using errcode='23514';end if;
 else
  if not item.scope?'bm04' and exists(select 1 from jsonb_each_text(coalesce(new.payload->'controls','{}')) x where x.value<>'') then raise exception 'Chứng dương ngoài phạm vi phép thử.' using errcode='23514';end if;
  if exists(select 1 from jsonb_each(coalesce(new.payload->'equipment','{}')) e cross join lateral jsonb_each_text(e.value) x where not item.scope?e.key and x.value<>'') then raise exception 'Thiết bị ngoài phạm vi phép thử.' using errcode='23514';end if;
 end if;
 block:=case when item.system='steam' then new.payload-'meta'-'equipment' else coalesce(new.payload->'forms','{}') end;
 for f,row in select * from jsonb_each(block) loop
  for pid,pts in select * from jsonb_each(row) loop
   if not coalesce(item.scope->f,'[]')?pid and exists(select 1 from jsonb_path_query(pts,'$.**') x where jsonb_typeof(x)='string' and x#>>'{}'<>'') then raise exception 'Có số liệu ngoài phạm vi đợt đã chọn.' using errcode='23514';end if;
  end loop;
 end loop;
 return new;
end$$;
create trigger cpc1_run_revision_guard before insert on public.cpc1_revisions for each row execute function cpc1_private.guard_run_revision();
create function public.cpc1_run_transition(p_run_id uuid,p_expected_version integer,p_status text,p_reason text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=cpc1_private.member();r cpc1_private.runs;inp jsonb:=jsonb_build_object('action','transition','run',p_run_id,'version',p_expected_version,'status',p_status,'reason',p_reason);cached cpc1_private.run_requests;outp jsonb;
begin
 if p_request_id is null or p_expected_version is null then raise exception 'Thiếu phiên bản hoặc mã yêu cầu.' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('cpc1run:'||u::text||p_request_id::text,0));
 select * into cached from cpc1_private.run_requests where actor_id=u and request_id=p_request_id;
 if found then if cached.input is distinct from inp then raise exception 'Mã yêu cầu đã dùng cho dữ liệu khác.' using errcode='23505';end if;return cached.response;end if;
 select * into r from cpc1_private.runs where id=p_run_id and owner_id=u for update;
 if not found then raise exception 'Không có quyền sửa đợt.' using errcode='42501';end if;
 if r.version<>p_expected_version or r.status<>'open' then raise exception 'Trạng thái đợt đã thay đổi; tải lại trước khi thao tác.' using errcode='PT409';end if;
 if p_status is null or p_status not in ('completed','closed') then raise exception 'Trạng thái không hợp lệ.' using errcode='23514';end if;
 if p_status='completed' and not (cpc1_private.run_progress(r.id)->>'ready')::boolean then raise exception 'Còn phép thử chưa đủ số liệu trong phạm vi đã chọn.' using errcode='23514';end if;
 if p_status='closed' and length(btrim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'Ghi lý do kết thúc khi chưa hoàn thành toàn bộ.' using errcode='23514';end if;
 update cpc1_private.run_items i set closed_revision=rec.version from public.cpc1_records rec where i.record_id=rec.id and i.run_id=r.id;
 update cpc1_private.runs set status=p_status,version=version+1,closed_at=clock_timestamp(),close_reason=case when p_status='closed' then btrim(p_reason) else null end where id=r.id;
 insert into cpc1_private.run_events(run_id,actor_id,action,details) values(r.id,u,p_status,jsonb_build_object('previous_version',r.version,'reason',p_reason,'progress',cpc1_private.run_progress(r.id)));
 outp:=public.cpc1_run_get(r.id);insert into cpc1_private.run_requests values(u,p_request_id,inp,outp);return outp;
end$$;
revoke all on all functions in schema cpc1_private from public,anon,authenticated;
revoke all on function public.cpc1_run_get(uuid),public.cpc1_run_list(),public.cpc1_run_create(jsonb,uuid),public.cpc1_run_transition(uuid,integer,text,text,uuid) from public,anon,authenticated;
grant execute on function public.cpc1_run_get(uuid),public.cpc1_run_list(),public.cpc1_run_create(jsonb,uuid),public.cpc1_run_transition(uuid,integer,text,text,uuid) to authenticated;
revoke all on cpc1_private.run_events_id_seq from public,anon,authenticated;
commit;

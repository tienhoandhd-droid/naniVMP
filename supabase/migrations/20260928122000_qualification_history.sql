-- Append-only source import evidence. No browser write grants, no QA approval semantics.
begin;
set local lock_timeout='5s';
create table cpc1_private.history_imports(
 id uuid primary key default gen_random_uuid(), run_id uuid not null references cpc1_private.runs(id),
 record_id uuid not null, version integer not null, system text not null check(system in ('steam','air','nitrogen')),
 period date not null check(extract(day from period)=1), source_fingerprint text not null unique check(source_fingerprint ~ '^[0-9a-f]{64}$'),
 source_manifest jsonb not null check(jsonb_typeof(source_manifest)='array' and jsonb_array_length(source_manifest) between 1 and 10),
 provenance jsonb not null check(jsonb_typeof(provenance)='object'),
 comparison jsonb not null check(jsonb_typeof(comparison)='array'), trend jsonb not null check(jsonb_typeof(trend)='array'),
 imported_at timestamptz not null default clock_timestamp(), imported_by text not null default current_user,
 foreign key(record_id,version) references public.cpc1_revisions(record_id,version),
 foreign key(run_id,system) references cpc1_private.run_items(run_id,system), unique(record_id,version)
);
alter table cpc1_private.history_imports enable row level security;
revoke all on cpc1_private.history_imports from public,anon,authenticated;
create index cpc1_history_month on cpc1_private.history_imports(period,system);
create function cpc1_private.history_consistency() returns trigger language plpgsql set search_path='' as $$
declare x jsonb;begin
 if exists(select 1 from jsonb_array_elements(new.source_manifest) e group by e->>'source_id' having count(*)>1) then raise exception 'Nguồn bị lặp.' using errcode='23514';end if;
 for x in select * from jsonb_array_elements(new.source_manifest) loop
  if jsonb_typeof(x)<>'object' or coalesce(x->>'source_id','')='' or coalesce(x->>'sha256','')!~'^[0-9a-f]{64}$' or x->>'object_path' is distinct from (x->>'sha256')||'.pdf' or coalesce(x->>'title','')='' then raise exception 'Định danh PDF nguồn không hợp lệ.' using errcode='23514';end if;
 end loop;
 if not exists(select 1 from cpc1_private.run_items i join cpc1_private.runs r on r.id=i.run_id where i.run_id=new.run_id and i.system=new.system and i.record_id=new.record_id and i.closed_revision=new.version and r.status<>'open') then raise exception 'Nguồn lịch sử không khớp hồ sơ của đợt.' using errcode='23514';end if;
 return new;
end$$;
create trigger cpc1_history_consistency before insert on cpc1_private.history_imports for each row execute function cpc1_private.history_consistency();
create function cpc1_private.history_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Bằng chứng nhập lịch sử không sửa đè; lập bản hiệu chỉnh riêng.' using errcode='23514';end$$;
create trigger cpc1_history_immutable before update or delete on cpc1_private.history_imports for each row execute function cpc1_private.history_immutable();
create function cpc1_private.trend_rows(s text,d jsonb,ev jsonb,scope jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare f text;pts jsonb;pid text;row jsonb;raw jsonb;vals jsonb;entry jsonb;entries jsonb;metric jsonb;metrics jsonb;key text;label text;unit text;value text;measured text;i integer;outp jsonb:='[]';status text;
begin
 for f,pts in select * from jsonb_each(scope) loop
  for pid in select * from jsonb_array_elements_text(pts) loop
   entries:=case when s='steam' and f<>'bm02' then ev#>array['forms',f,'rows',pid] else jsonb_build_array(ev#>array['forms',f,'rows',pid]) end;
   i:=0;
   for row in select * from jsonb_array_elements(coalesce(entries,'[]')) loop
    i:=i+1;
    raw:=case when s='steam' then case when f='bm02' then d#>array[f,pid] else d#>array[f,pid,(i-1)::text] end else d#>array['forms',f,pid] end;
    measured:=case when s='steam' then raw->>'date' when f='bm04' then raw->>'sampling_date' else raw->>'execution_date' end;
    vals:=row->'values';
    metrics:=case when s='steam' then case f when 'bm01' then '[["result","Khí không ngưng tụ","%"]]'::jsonb when 'bm02' then '[["conductivity","Độ dẫn điện","µS/cm"],["toc","TOC","ppb"],["microbial","Vi sinh","CFU/100 mL"],["endotoxin","Nội độc tố","EU/mL"]]'::jsonb when 'bm03' then '[["result","Độ khô","D"]]'::jsonb when 'bm04' then '[["result","Quá nhiệt","°C"],["delta","Chênh lệch nhiệt độ","°C"]]'::jsonb end
    else case f when 'bm01' then '[["p05","Tiểu phân ≥0,5 µm","hạt/m³"],["p5","Tiểu phân ≥5 µm","hạt/m³"]]'::jsonb when 'bm02' then '[["result","Điểm sương","°C"]]'::jsonb when 'bm03' then '[["result","Hàm lượng dầu","mg/m³"]]'::jsonb when 'bm04' then '[["result","Vi sinh","CFU/m³"]]'::jsonb when 'bm05' then '[["result","Độ tinh khiết","%"]]'::jsonb end end;
    for metric in select * from jsonb_array_elements(coalesce(metrics,'[]')) loop
     key:=metric->>0;value:=vals->>key;status:=coalesce(row#>>array['parameters',key],row->>'status');
     if value is null then continue;end if;
     outp:=outp||jsonb_build_array(jsonb_build_object('form',f,'point_id',pid,'trial',case when s='steam' and f<>'bm02' then i else null end,'metric',key,'label',metric->>1,'unit',metric->>2,'value',value::numeric,'measured_on',nullif(measured,''),'computed_status',status,'uncertain',false));
    end loop;
   end loop;
  end loop;
 end loop;
 return outp;
end$$;
create function public.cpc1_history_list() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=cpc1_private.viewer();historical jsonb;fresh jsonb;begin
 historical:=coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'run_id',h.run_id,'record_id',h.record_id,'version',h.version,'system',h.system,'period',h.period,'comparison',h.comparison,'trend',h.trend,'issues',coalesce(h.provenance->'issues','[]'),'imported_at',h.imported_at,'sources',h.source_manifest) order by h.period,h.system)
 from cpc1_private.history_imports h join cpc1_private.runs r on r.id=h.run_id where r.owner_id=u),'[]');
 select coalesce(jsonb_agg(jsonb_build_object('id',i.record_id,'run_id',r.id,'record_id',i.record_id,'version',v.version,'system',i.system,'period',date_trunc('month',r.started_on)::date,'comparison','[]'::jsonb,'trend',cpc1_private.trend_rows(i.system,v.payload,v.evaluation,i.scope),'issues','[]'::jsonb,'sources','[]'::jsonb) order by r.started_on),'[]') into fresh
 from cpc1_private.run_items i join cpc1_private.runs r on r.id=i.run_id join public.cpc1_records rec on rec.id=i.record_id join public.cpc1_revisions v on v.record_id=rec.id and v.version=coalesce(i.closed_revision,rec.version)
 where r.owner_id=u and r.status<>'open' and v.version=i.closed_revision and v.version>1 and not exists(select 1 from cpc1_private.history_imports h where h.record_id=i.record_id);
 return historical||fresh;
end$$;
create function cpc1_private.can_read_history(path text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare u uuid;begin
 u:=cpc1_private.viewer();
 return exists(select 1 from cpc1_private.history_imports h join cpc1_private.runs r on r.id=h.run_id cross join lateral jsonb_array_elements(h.source_manifest) s where s->>'object_path'=path and r.owner_id=u);
 exception when insufficient_privilege then return false;
end$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('cpc1-history','cpc1-history',false,52428800,array['application/pdf']);
create policy cpc1_history_owner_read on storage.objects for select to authenticated using(bucket_id='cpc1-history' and cpc1_private.can_read_history(name));
revoke all on function cpc1_private.trend_rows(text,jsonb,jsonb,jsonb),cpc1_private.history_consistency(),cpc1_private.history_immutable(),cpc1_private.can_read_history(text),public.cpc1_history_list() from public,anon,authenticated;
grant execute on function cpc1_private.can_read_history(text),public.cpc1_history_list() to authenticated;
commit;

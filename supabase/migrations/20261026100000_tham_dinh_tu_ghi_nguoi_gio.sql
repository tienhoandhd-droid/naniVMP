-- =====================================================================
-- Thẩm định thực tế: tự ghi người thực hiện và thời gian lưu (26/10/2026)
--
-- Chủ dự án yêu cầu 26/10: ô "Người thực hiện" lấy tên tài khoản, ô thời gian
-- là giờ lưu (cả ngày giờ), không nhập tay. Áp dụng hơi, khí nén, nitơ.
-- Đã chốt: giữ người/giờ của LẦN LƯU ĐẦU có số đo; ngày lấy mẫu và người lấy
-- mẫu BM04 vẫn nhập tay; hồ sơ cũ giữ nguyên (giá trị đã có không bị thay).
--
-- Cách làm: cpc1_run_save (đường lưu duy nhất) gọi stamp_entry TRƯỚC khi so
-- khác biệt; giá trị trình duyệt gửi cho các ô tự ghi bị bỏ qua. Định dạng giờ:
-- YYYY-MM-DDTHH:MI:SS+07:00 (giờ Việt Nam) — 10 ký tự đầu vẫn là ngày nên lịch
-- sử điểm, xu hướng, so hạn hiệu chuẩn giữ cách cũ. Ba hàm kiểm ngày nhận thêm
-- dạng này CHỈ ở các ô tự ghi. Không đổi bảng, dữ liệu, cấu hình biểu mẫu
-- (tránh lệch config_snapshot của đợt đang mở), GRANT hay công thức đánh giá.
-- Các hàm thay thế chép nguyên văn bản production 24/10, chỉ sửa dòng có ghi chú 26/10.
-- =====================================================================

-- Một dòng số đo: ô tự ghi giữ giá trị cũ nếu đã có; chưa có mà lần lưu này dòng
-- MỚI có số đo hoặc số đo thay đổi thì ghi tên/giờ; dòng cũ có số đo nhưng chưa
-- có tên/giờ mà không đụng tới thì để trống (không gán nhầm người lưu sau).
-- Không bao giờ nhận giá trị trình duyệt gửi cho ô tự ghi.
create function cpc1_private.stamp_row(p_old jsonb, p_new jsonb, p_name_keys text[], p_time_keys text[], p_manual_keys text[], p_who text, p_at text, p_measured boolean default null)
returns jsonb language plpgsql immutable set search_path='' as $$
declare outp jsonb:=p_new;k text;measured boolean:=p_measured;now_vals jsonb;old_vals jsonb;
begin
 if jsonb_typeof(p_new) is distinct from 'object' then return p_new; end if;
 if measured is null then
  -- Số đo = ô chuỗi khác rỗng, trừ ô tự ghi và ô nhập tay riêng (thông tin lấy mẫu).
  select coalesce(jsonb_object_agg(e.key,btrim(e.value#>>'{}')),'{}') into now_vals from jsonb_each(p_new) e
   where not e.key=any(p_name_keys||p_time_keys||p_manual_keys) and jsonb_typeof(e.value)='string' and btrim(e.value#>>'{}')<>'';
  select coalesce(jsonb_object_agg(e.key,btrim(e.value#>>'{}')),'{}') into old_vals from jsonb_each(case when jsonb_typeof(p_old)='object' then p_old else '{}' end) e
   where not e.key=any(p_name_keys||p_time_keys||p_manual_keys) and jsonb_typeof(e.value)='string' and btrim(e.value#>>'{}')<>'';
  measured:=now_vals<>'{}' and now_vals is distinct from old_vals;
 end if;
 foreach k in array p_name_keys||p_time_keys loop
  if jsonb_typeof(p_old)='object' and jsonb_typeof(p_old->k)='string' and btrim(p_old->>k)<>'' then outp:=jsonb_set(outp,array[k],p_old->k);
  elsif measured then outp:=jsonb_set(outp,array[k],to_jsonb(case when k=any(p_name_keys) then p_who else p_at end));
  elsif outp?k then outp:=jsonb_set(outp,array[k],'""');
  end if;
 end loop;
 return outp;
end$$;

-- Cả hồ sơ: khí theo cấu hình đã chụp của đợt (chỉ ô có trong biểu mẫu); hơi theo khoá cố định.
create function cpc1_private.stamp_entry(p_old jsonb, p_new jsonb, p_cfg jsonb, p_who text, p_at text)
returns jsonb language plpgsql immutable set search_path='' as $$
declare outp jsonb:=p_new;f jsonb;fid text;pid text;row jsonb;one jsonb;keys text[];arr jsonb;i integer;any_measured boolean:=false;steam_values text[];
begin
 if jsonb_typeof(p_new) is distinct from 'object' then return p_new; end if;
 if p_new?'system' then
  for f in select x from jsonb_array_elements(coalesce(p_cfg->'forms','[]')) x where x->>'kind'='measurement' loop
   fid:=f->>'id';keys:=array(select x->>'key' from jsonb_array_elements(coalesce(f->'fields','[]')) x);
   if jsonb_typeof(p_new#>array['forms',fid]) is distinct from 'object' then continue; end if;
   for pid,row in select * from jsonb_each(p_new#>array['forms',fid]) loop
    outp:=jsonb_set(outp,array['forms',fid,pid],cpc1_private.stamp_row(p_old#>array['forms',fid,pid],row,
      array(select k from unnest(keys) k where k='executed_by'),array(select k from unnest(keys) k where k in ('execution_date','result_date')),array['sampled_by','sampling_date'],p_who,p_at));
   end loop;
  end loop;
  keys:=array(select x->>'key' from jsonb_array_elements(coalesce(p_cfg->'controls_fields','[]')) x);
  if jsonb_typeof(p_new->'controls')='object' then
   outp:=jsonb_set(outp,'{controls}',cpc1_private.stamp_row(p_old->'controls',p_new->'controls',
     array(select k from unnest(keys) k where k='executed_by'),array(select k from unnest(keys) k where k='result_date'),'{}',p_who,p_at));
  end if;
 else
  foreach fid in array array['bm01','bm02','bm03','bm04'] loop
   if jsonb_typeof(p_new->fid) is distinct from 'object' then continue; end if;
   for pid,row in select * from jsonb_each(p_new->fid) loop
    if jsonb_typeof(row)='array' then
     arr:='[]';i:=0;
     for one in select * from jsonb_array_elements(row) loop
      one:=cpc1_private.stamp_row(p_old#>array[fid,pid,i::text],one,array['executor'],array['date'],'{}',p_who,p_at);
      arr:=arr||jsonb_build_array(one);i:=i+1;
     end loop;
     outp:=jsonb_set(outp,array[fid,pid],arr);
    else
     outp:=jsonb_set(outp,array[fid,pid],cpc1_private.stamp_row(p_old#>array[fid,pid],row,array['executor'],array['date'],array['sample_chem','sample_micro','sample_endo'],p_who,p_at));
    end if;
   end loop;
  end loop;
  -- Phần tổng hợp BM01–BM04: ghi khi hồ sơ đã có số đo ở bất kỳ dòng nào.
  any_measured:=exists(select 1 from unnest(array['bm01','bm02','bm03','bm04']) fid2
    cross join lateral jsonb_path_query(coalesce(p_new->fid2,'{}'),'strict $.**') v
    where jsonb_typeof(v)='object' and exists(select 1 from jsonb_each(v) e where e.key not in ('executor','date','sample_chem','sample_micro','sample_endo') and jsonb_typeof(e.value)='string' and btrim(e.value#>>'{}')<>''));
  if any_measured or jsonb_typeof(p_new->'meta')='object' then
   outp:=jsonb_set(outp,'{meta}',cpc1_private.stamp_row(p_old->'meta',coalesce(p_new->'meta','{}'),array['executed_by'],array['execution_date'],'{}',p_who,p_at,any_measured));
  end if;
 end if;
 return outp;
end$$;

revoke all on function cpc1_private.stamp_row(jsonb,jsonb,text[],text[],text[],text,text,boolean),cpc1_private.stamp_entry(jsonb,jsonb,jsonb,text,text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cpc1_run_save(p_run_id uuid, p_data jsonb, p_record_id uuid, p_expected_version integer, p_request_id uuid, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid:=cpc1_private.member();item cpc1_private.run_items;r cpc1_private.runs;rec public.cpc1_records;olddata jsonb;changes jsonb;outp jsonb;cached cpc1_private.run_requests;codes text[];req jsonb;path text[];reqs jsonb;who text;
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
 -- 26/10: người thực hiện = tên tài khoản, thời gian = giờ lưu đầu; trình duyệt không tự gõ được.
 select left(coalesce(nullif(btrim(p.full_name),''),'Tài khoản không tên'),200) into who from public.profiles p where p.id=u;
 p_data:=cpc1_private.stamp_entry(olddata,p_data,item.config_snapshot,coalesce(who,'Tài khoản không tên'),to_char(clock_timestamp() at time zone 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS"+07:00"'));
 changes:=cpc1_private.entry_diff(olddata,p_data);perform cpc1_private.entry_reason(changes,p_reason);
 if changes='[]' then outp:=public.cpc1_run_load(r.id,rec.id);
 else
  outp:=cpc1_private.save_pq(p_data,p_record_id,p_expected_version,p_request_id,rec.title,extract(year from r.started_on)::integer);
  insert into cpc1_private.entry_events(record_id,version,run_id,actor_id,request_id,reason,changes)values(rec.id,(outp->>'version')::integer,r.id,u,p_request_id,nullif(btrim(p_reason),''),changes);
  outp:=outp||jsonb_build_object('evaluation',cpc1_private.scoped_evaluation(outp->'evaluation',item.system,item.scope));
 end if;
 insert into cpc1_private.run_requests values(u,p_request_id,inp,outp);return outp;
end$$;

CREATE OR REPLACE FUNCTION cpc1_private.check_record(r jsonb, allowed text[]) RETURNS void
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $_$
declare k text; v jsonb; s text; d date; begin
 if jsonb_typeof(r)<>'object' then raise exception 'Ô nhập không đúng cấu trúc.'; end if;
 for k,v in select * from jsonb_each(r) loop
  if not k=any(allowed) or jsonb_typeof(v)<>'string' then raise exception 'Trường nhập không hợp lệ: %',k; end if;
  s:=v#>>'{}';
  if length(s)>(case when k='remarks' then 1500 else 200 end) or s~'[\x01-\x08\x0B\x0C\x0E-\x1F]' then raise exception 'Ô nhập quá dài hoặc chứa ký tự điều khiển.'; end if;
  if s<>'' and (k like '%date' or k like '%due') then
   -- 26/10: ô thời gian tự ghi (date, execution_date) chứa cả giờ lưu.
   if k in ('date','execution_date') and s~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\+07:00$' then s:=left(s,10); end if;
   if s!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Ngày phải theo YYYY-MM-DD.'; end if;
   d:=s::date;
  end if;
 end loop;
end$_$;

CREATE OR REPLACE FUNCTION cpc1_private.gas_fields(v jsonb, spec jsonb) RETURNS void
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $_$
declare f jsonb;k text;t text;s text;n integer;begin
 perform cpc1_private.gas_object(v,array(select x->>'key' from jsonb_array_elements(spec) x));
 for f in select * from jsonb_array_elements(spec) loop
  k:=f->>'key';t:=f->>'type';if not v?k then continue;end if;s:=v->>k;
  if jsonb_typeof(v->k)<>'string' or length(s)>(case when t='textarea' then 4000 else 200 end) then raise exception 'Trường nhập phải là chuỗi trong giới hạn độ dài.';end if;
  for n in 1..length(s) loop if ascii(substr(s,n,1))<32 and ascii(substr(s,n,1)) not in(9,10,13) then raise exception 'Ký tự điều khiển không hợp lệ.';end if;end loop;
  if t='date' and s<>'' then
   -- 26/10: ô thời gian tự ghi (execution_date, result_date) chứa cả giờ lưu.
   if k in ('execution_date','result_date') and s~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$' then s:=left(s,10); end if;
   if s!~'^\d{4}-\d{2}-\d{2}$' or s::date::text<>s then raise exception 'Ngày phải hợp lệ theo dạng YYYY-MM-DD.';end if;
  end if;
 end loop;
end$_$;

CREATE OR REPLACE FUNCTION cpc1_private.input_cell_issue(p_path text[], p_value jsonb, p_kind text, p_unit text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $_$
declare s text; n numeric; d date; rule text; reason text;
 today date:=(now() at time zone 'Asia/Bangkok')::date;
begin
 if p_value is null or jsonb_typeof(p_value)<>'string' then return null; end if;
 s:=p_value#>>'{}';
 if btrim(s)='' then return null; end if;
 if p_kind in ('date','expiry') then
  -- 26/10: ô thời gian tự ghi chứa cả giờ lưu; kiểm phần ngày như cũ.
  if p_kind='date' and p_path[cardinality(p_path)] in ('date','execution_date','result_date') and s~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\+07:00$' then s:=left(s,10); end if;
  if s!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
   rule:='date_format';reason:='Ngày phải theo dạng YYYY-MM-DD.';
  else
   begin
    d:=s::date;
    if to_char(d,'YYYY-MM-DD')<>s then d:=null; end if;
   exception when invalid_datetime_format or datetime_field_overflow then
    d:=null;
   end;
   if d is null then rule:='date_unreal';reason:='Ngày không có thật (ví dụ 31/02) — kiểm tra lại ngày.';
   elsif d<date '2020-01-01' then rule:='date_too_old';reason:='Ngày trước 01/01/2020 — kiểm tra lại năm.';
   elsif p_kind='date' and d>today+1 then rule:='date_future';reason:='Ngày ở tương lai — kiểm tra lại ngày.';
   end if;
  end if;
 elsif p_kind='number' then
  if btrim(s)~'^[<>≤≥]' then
   rule:='comparison_symbol';reason:='Không nhập ký hiệu so sánh như "<1" — nhập số đo thật.';
  elsif btrim(s)~*'^[+-]?[0-9.,]+e[+-]?[0-9]+$' then
   rule:='exponent';reason:='Không dùng ký hiệu mũ (như 1e3) — gõ đầy đủ chữ số, ví dụ 1000.';
  else
   begin
    n:=cpc1_private.read_num(p_path[cardinality(p_path)],s,p_unit);
   exception
    when sqlstate '22P02' then rule:='thousand_ambiguous';reason:=sqlerrm;
    when raise_exception then rule:='not_number';reason:='Không đọc được thành số — chỉ gõ chữ số và một dấu thập phân (, hoặc .).';
   end;
   if rule is null then
    if n<0 and p_unit is distinct from '°C' then rule:='negative';reason:='Giá trị không được âm.';
    elsif coalesce(p_unit,'')~'(hạt|CFU)' and n<>trunc(n) then rule:='not_integer';reason:='Số đếm (hạt, CFU) phải là số nguyên.';
    elsif p_unit='%' and (n<0 or n>100) then rule:='percent_range';reason:='Phần trăm phải trong khoảng 0–100.';
    end if;
   end if;
  end if;
 end if;
 if rule is null then return null; end if;
 return jsonb_build_object('path',to_jsonb(p_path),'field',p_path[cardinality(p_path)],'value',s,'rule',rule,'reason',reason);
end$_$;

notify pgrst, 'reload schema';

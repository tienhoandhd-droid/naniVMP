-- =====================================================================
-- 20261110130000_tham_dinh_chung_duong_cong.sql
-- ---------------------------------------------------------------------
-- Quyết định chủ dự án 09/11/2026: chứng dương vi sinh khí nén/nitơ ghi "+"
-- (có mọc, như bản scan) là Đạt. Vẫn nhận số CFU như cũ (50–150 là Đạt).
--  · gas_row: nhánh "+" cho positive_count; hiển thị "+".
--  · input_object_issues: "+" ở positive_count không bị coi là số sai.
-- Thân hàm lấy NGUYÊN VĂN production (pg_get_functiondef gas_row; input_object_issues
-- của 20261110110000) rồi chèn nhánh mới. Không đổi giới hạn, công thức, biểu mẫu in.
-- =====================================================================
begin;

CREATE OR REPLACE FUNCTION cpc1_private.gas_row(form text, r jsonb, limits jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare keys text[];k text;raw text;v numeric;vals jsonb:='{}';errs jsonb:='{}';states text[]:=array[]::text[];ok boolean;res numeric;outvals jsonb:='{}';begin
 keys:=case form when 'bm01' then array['p05','p5'] when 'bm02' then array['dewpoint'] when 'bm03' then array['flow','duration','reading'] when 'bm04' then array['microbial'] when 'bm05' then array['purity'] when 'control' then array['positive_count'] end;
 if keys is null then raise exception 'Mẫu tính khí không hợp lệ.';end if;
 foreach k in array keys loop
  raw:=coalesce(r->>k,'');
  if btrim(raw)='' then errs:=errs||jsonb_build_object(k,'Chưa nhập dữ liệu.');states:=array_append(states,'incomplete');continue;end if;
  -- 09/11: chứng dương ghi "+" (có mọc) như bản scan = Đạt.
  if k='positive_count' and btrim(raw)='+' then vals:=vals||jsonb_build_object(k,'+');continue;end if;
  begin
   v:=cpc1_private.read_num(k,raw,null);
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
 when 'control' then
  if vals->>'positive_count'='+' then ok:=true;
  else res:=(vals->>'positive_count')::numeric;ok:=res between 50 and 150;end if;
 end case;
 foreach k in array keys loop outvals:=outvals||jsonb_build_object(k,case when vals->>k='+' then '+' else cpc1_private.shown((vals->>k)::numeric) end);end loop;
 if res is not null then outvals:=outvals||jsonb_build_object('result',cpc1_private.shown(res),'print_result',cpc1_private.shown(res),'raw_result',res::text);end if;
 return jsonb_build_object('status',case when ok then 'pass' else 'fail' end,'values',outvals,'errors','{}'::jsonb);
end$function$;

CREATE OR REPLACE FUNCTION cpc1_private.input_object_issues(p_path text[], p_obj jsonb, p_spec jsonb, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare k text;v jsonb;f jsonb;kind text;one jsonb;outp jsonb:='[]';
begin
 if p_obj is null or jsonb_typeof(p_obj)<>'object' or jsonb_typeof(p_spec) is distinct from 'array' then return outp; end if;
 for k,v in select * from jsonb_each(p_obj) loop
  select x into f from jsonb_array_elements(p_spec) x where x->>'key'=k limit 1;
  if f is null then continue; end if;
  -- A3: lưu không chặn ô nội độc tố (khi ký vẫn kiểm).
  if p_mode='save' and (k='endotoxin' or f->>'unit'='EU/mL') then continue; end if;
  -- 09/11: "Đạt"/"Không đạt" là cách ghi hợp lệ của nội độc tố gel-clot (cả lưu lẫn ký).
  if (k='endotoxin' or f->>'unit'='EU/mL') and jsonb_typeof(v)='string' and cpc1_private.endotoxin_word(v#>>'{}') is not null then continue; end if;
  -- 09/11: chứng dương ghi "+" như bản scan là hợp lệ (cả lưu lẫn ký).
  if k='positive_count' and jsonb_typeof(v)='string' and btrim(v#>>'{}')='+' then continue; end if;
  kind:=case when f->>'type'='date' then case when k~'(expiry|_due)$' then 'expiry' else 'date' end
             when f->>'type'='number' or coalesce(f->>'unit','')~'CFU' then 'number' end;
  if kind is null then continue; end if;
  one:=cpc1_private.input_cell_issue(p_path||k,v,kind,f->>'unit');
  if one is not null then outp:=outp||jsonb_build_array(one); end if;
 end loop;
 return outp;
end$function$;


commit;

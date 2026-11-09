-- =====================================================================
-- 20261110110000_tham_dinh_noi_doc_to_dinh_tinh.sql
-- ---------------------------------------------------------------------
-- Quyết định chủ dự án 09/11/2026 ("ghi như bản scan"):
--  · Nội độc tố BM02 hơi (phương pháp gel-clot, định tính) ghi "Đạt" → Đạt,
--    "Không đạt" → Không đạt. Vẫn nhận số EU/mL như cũ (≤ 0,25 là Đạt).
--    Chữ khác giữ hành vi A3 của 20261021100000: lưu được, chấm "invalid",
--    chặn ký.
--  · Vi sinh "KPH"/"KFH" = không phát hiện = Đạt: đã có từ 20261021100000
--    (read_num), không đổi ở đây.
-- Chỉ sửa hai hàm, thân hàm lấy NGUYÊN VĂN từ production (pg_get_functiondef)
-- rồi chèn đúng hai nhánh mới. Không đổi giới hạn, công thức, biểu mẫu in.
-- =====================================================================
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Nhận dạng chữ của nội độc tố. Danh sách viết tường minh (không dựa vào
-- lower() theo locale); chuẩn hoá NFC + gộp khoảng trắng.
create function cpc1_private.endotoxin_word(raw text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case regexp_replace(btrim(normalize(coalesce(raw, ''), NFC)), '\s+', ' ', 'g')
    when 'Đạt' then 'pass' when 'đạt' then 'pass' when 'ĐẠT' then 'pass'
    when 'Không đạt' then 'fail' when 'không đạt' then 'fail' when 'Không Đạt' then 'fail' when 'KHÔNG ĐẠT' then 'fail'
  end
$function$;
revoke all on function cpc1_private.endotoxin_word(text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION cpc1_private.row_result(form text, r jsonb, t3 text DEFAULT ''::text, endo boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare keys text[]; k text; raw text; nums jsonb:='{}'; errors jsonb:='{}'; vals jsonb:='{}'; params jsonb:='{}'; st text:='incomplete'; states text[]:='{}'; missing boolean:=false; bad boolean:=false;
 vg numeric;vc numeric;me numeric;ms numeric;mf numeric;t1 numeric;t2 numeric;tsteam numeric;latent numeric;res numeric;delta numeric;v numeric;lim numeric;
begin
 keys:=case form when 'bm01' then array['vg','vc'] when 'bm02' then array['conductivity','toc','microbial'] when 'bm03' then array['me','ms','mf','t1','t2','t3'] when 'bm04' then array['te','to','ts','t3'] end;
 if form='bm04' then r:=r||jsonb_build_object('t3',coalesce(t3,'')); end if;
 if form='bm02' and endo then keys:=keys||'endotoxin'::text; end if;
 foreach k in array keys loop
  raw:=coalesce(r->>k,'');
  if raw='' then missing:=true;errors:=errors||jsonb_build_object(k,'Chưa nhập dữ liệu.');
  -- 09/11: nội độc tố gel-clot ghi chữ như bản scan ("Đạt"/"Không đạt").
  elsif k='endotoxin' and cpc1_private.endotoxin_word(raw) is not null then nums:=nums||jsonb_build_object(k,cpc1_private.endotoxin_word(raw));
  else begin nums:=nums||jsonb_build_object(k,cpc1_private.read_num(k,raw,cpc1_private.steam_unit(form,k))); exception when others then bad:=true;errors:=errors||jsonb_build_object(k,'Nhập số thập phân hợp lệ, không dùng dấu phân cách hàng nghìn.'); end; end if;
 end loop;
 if form='bm02' then
  foreach k in array keys loop
   if errors?k then st:=case when coalesce(r->>k,'')='' then 'incomplete' else 'invalid' end;
   elsif k='endotoxin' and nums->>k in ('pass','fail') then
    st:=nums->>k;vals:=vals||jsonb_build_object(k,case st when 'pass' then 'Đạt' else 'Không đạt' end);
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
  kind:=case when f->>'type'='date' then case when k~'(expiry|_due)$' then 'expiry' else 'date' end
             when f->>'type'='number' or coalesce(f->>'unit','')~'CFU' then 'number' end;
  if kind is null then continue; end if;
  one:=cpc1_private.input_cell_issue(p_path||k,v,kind,f->>'unit');
  if one is not null then outp:=outp||jsonb_build_array(one); end if;
 end loop;
 return outp;
end$function$;

commit;

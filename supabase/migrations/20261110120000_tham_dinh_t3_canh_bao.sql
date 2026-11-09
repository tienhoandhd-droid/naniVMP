-- =====================================================================
-- 20261110120000_tham_dinh_t3_canh_bao.sql
-- ---------------------------------------------------------------------
-- Quyết định chủ dự án 09/11/2026 (BM03 B3.R13-P2 lần 2, T3 = 140,2 °C
-- đúng bản scan): T3 ngoài 100–140 °C KHÔNG chặn nữa.
--  · 140 < T3 ≤ 180 °C: vẫn tra nhiệt ẩn và tính độ khô; trả "warnings"
--    {t3: ...} để giao diện nhắc đối chiếu bản scan. Không vào errors →
--    không "invalid", không chặn ký.
--  · T3 < 100 hoặc > 180 °C: vẫn là lỗi chặn — bảng tra nhiệt ẩn chỉ có
--    100–180 °C, ngoài dải không tính được.
-- Thân hàm lấy NGUYÊN VĂN row_result của 20261110110000, chỉ đổi nhánh T3
-- và thêm khoá "warnings". Không đổi công thức, tiêu chí ≥ 0,95, biểu mẫu in.
-- =====================================================================
begin;

CREATE OR REPLACE FUNCTION cpc1_private.row_result(form text, r jsonb, t3 text DEFAULT ''::text, endo boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare warns jsonb:='{}'; keys text[]; k text; raw text; nums jsonb:='{}'; errors jsonb:='{}'; vals jsonb:='{}'; params jsonb:='{}'; st text:='incomplete'; states text[]:='{}'; missing boolean:=false; bad boolean:=false;
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
  -- 09/11: ngoài 100–140 °C chỉ cảnh báo; chặn khi ngoài bảng tra nhiệt ẩn (100–180 °C).
  if tsteam<100 or tsteam>180 then errors:=errors||'{"t3":"Nhiệt độ hơi phải trong 100–180 °C (bảng tra nhiệt ẩn)."}';
  elsif tsteam>140 then warns:=warns||'{"t3":"Ngoài 100–140 °C, đối chiếu bản scan."}';end if;
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
 if warns<>'{}' then return jsonb_build_object('values',vals,'errors',errors,'status',st,'warnings',warns);end if;
 return jsonb_build_object('values',vals,'errors',errors,'status',st);
end$function$;

commit;

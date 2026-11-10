-- =====================================================================
-- 20261110170000_tham_dinh_in_so.sql — Đợt C rà soát 10/11/2026
-- ---------------------------------------------------------------------
-- C4 (quyết định 1 của chủ dự án): PDF in thêm chữ số khi số làm tròn
--     chạm đúng ngưỡng (vd. Vg 6,4/Vc 189 → 3,505 chứ không in 3,50 cạnh
--     ô "Không đạt"; độ khô 0,9496 → 0,9496 chứ không in 0,95).
--     · Thêm cpc1_private.print_num(res, digits, lim).
--     · row_result: NGUYÊN VĂN bản 20261110120000_tham_dinh_t3_canh_bao.sql,
--       chỉ đổi biểu thức print_result. KHÔNG đổi st, công thức, tiêu chí,
--       biểu mẫu in. Ngưỡng truyền vào chính là ngưỡng hàm đang dùng để chấm
--       (BM01 ≤ 3,5; BM03 ≥ 0,95; BM04 Te−To ≤ 25).
--     · gas_row (khí nén/nitơ) in bằng shown() = 6 chữ số, không làm tròn
--       2 chữ số → không cần sửa.
-- C7: ký dùng kết quả TÍNH LẠI, PDF in kết quả ĐÃ LƯU. Hai kết quả khác nhau
--     (chấm bằng công thức cũ) thì chặn ký kiểm tra/duyệt, báo cần chấm lại.
--     · record_sign_evaluation: NGUYÊN VĂN bản 20261021100000_tham_dinh_chan_du_lieu_sai.sql,
--       chỉ chèn phép so sánh. KHÔNG tự chấm lại, KHÔNG ghi revision nào.
--       So bỏ source_context (định danh mẫu in/cấu hình) — chỉ so kết quả.
-- Giữ nguyên SECURITY DEFINER / search_path / quyền (CREATE OR REPLACE giữ ACL).
-- =====================================================================
begin;

-- In số: làm tròn `digits` chữ số; nếu số đã làm tròn bằng đúng ngưỡng mà số
-- gốc khác ngưỡng thì tăng dần chữ số (tối đa 6) cho đến khi số in khác ngưỡng.
create function cpc1_private.print_num(res numeric, digits integer, lim numeric)
 returns text
 language plpgsql
 immutable
 set search_path to ''
as $function$
declare d integer:=digits;
begin
 if res is null then return null; end if;
 while lim is not null and res<>lim and round(res,d)=lim and d<6 loop d:=d+1; end loop;
 return round(res,d)::text;
end$function$;
revoke all on function cpc1_private.print_num(numeric, integer, numeric) from public, anon, authenticated;

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
 -- C4 (10/11): số in làm tròn chạm ngưỡng thì in thêm chữ số; st và công thức giữ nguyên.
 if res is not null then vals:=vals||jsonb_build_object('result',cpc1_private.shown(res),'print_result',cpc1_private.print_num(res,case when form='bm04' then 1 else 2 end,case form when 'bm01' then 3.5 when 'bm03' then .95 else 25 end),'raw_result',res::text);end if;
 if errors<>'{}' then st:='invalid';end if;
 if warns<>'{}' then return jsonb_build_object('values',vals,'errors',errors,'status',st,'warnings',warns);end if;
 return jsonb_build_object('values',vals,'errors',errors,'status',st);
end$function$;


create or replace function cpc1_private.record_sign_evaluation(p_record_id uuid, p_version integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare ev jsonb;pl jsonb;item cpc1_private.run_items;has_item boolean;stored jsonb;
begin
 select evaluation,payload into ev,pl from public.cpc1_revisions where record_id=p_record_id and version=p_version;
 stored:=ev;
 select * into item from cpc1_private.run_items where record_id=p_record_id;
 has_item:=found;
 if has_item and item.config_snapshot is distinct from cpc1_private.system_config(item.system) then
  -- Cùng điều kiện cpc1_run_evaluate từ chối: KHÔNG đánh giá theo cấu hình mới.
  ev:=ev||jsonb_build_object('recompute_error','Tiêu chí đã thay đổi sau khi tạo đợt — không ký được, liên hệ Admin.');
 elsif pl is not null then
  begin
   ev:=cpc1_private.evaluate(pl);
  exception when others then
   ev:=ev||jsonb_build_object('recompute_error','Không tính lại được hồ sơ: '||sqlerrm);
  end;
  -- C7 (10/11): PDF in kết quả đã lưu; khác kết quả tính lại thì không cho ký (không tự chấm lại).
  if not ev?'recompute_error' and stored is not null and (ev-'source_context') is distinct from (stored-'source_context') then
   ev:=ev||jsonb_build_object('recompute_error','Hồ sơ được chấm bằng công thức cũ — cần chấm lại trước khi ký.');
  end if;
 end if;
 -- scoped_evaluation trả ev||{…} nên giữ nguyên khoá recompute_error.
 if has_item and ev is not null then ev:=cpc1_private.scoped_evaluation(ev,item.system,item.scope); end if;
 return ev;
end$function$;

commit;

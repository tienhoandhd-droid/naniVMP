-- =====================================================================
-- 20261021100000_tham_dinh_chan_du_lieu_sai.sql — CHẶN DỮ LIỆU SAI Ở MÁY CHỦ
-- ---------------------------------------------------------------------
-- Thẩm định thực tế (cpc1_*). Quyết định chủ dự án 21/10:
--  A. Số dễ nhầm hàng nghìn ("4.000", "1,500", "-2,000": phần nguyên ≠ 0,
--     đúng 3 chữ số sau MỘT dấu chấm/phẩy) bị TỪ CHỐI, không đoán.
--     Vẫn nhận "0,5", "0.125", "4,0", "4000". Nhiều dấu phân cách vẫn bị
--     từ chối như cũ. MIỄN luật này cho ô đơn vị kg và µS/cm (theo đơn vị
--     trong cấu hình biểu mẫu): "1,311" kg, "1,032" µS/cm là số thập phân.
--  A2. Vi sinh HƠI nhận "KPH"/"KFH" đúng như khí nén: cùng một hàm đọc
--     (cpc1_private.read_num) dùng chung cho gas_row và row_result.
--  A3. NỘI ĐỘC TỐ (đơn vị EU/mL hoặc khoá endotoxin) chưa chốt cách ghi
--     (gel-clot định tính vs số): KHÔNG chặn lưu, đọc số y như trước
--     migration (không áp luật A); nếu kết quả tính invalid thì vẫn chặn KÝ.
--  Khi KÝ: tính lại bằng hàm hiện tại trên dữ liệu đã lưu (chỉ đọc, không
--     ghi lại revision), lọc phạm vi đợt, lý do theo đúng luật đầu vào.
--  B. Lưu khi còn ô sai: chặn HOÀN TOÀN (không revision, không audit).
--     Ô trống vẫn lưu được. Dữ liệu hợp lệ nhưng KHÔNG ĐẠT vẫn lưu.
--  C. Ký Kiểm tra/Duyệt bị chặn khi hồ sơ còn ô sai hoặc ô "invalid",
--     bất kể mã deviation.
--  Bổ sung theo audit 21/10:
--  (4) Ký dùng kết quả LỌC THEO PHẠM VI ĐỢT (cùng hàm scoped_evaluation mà
--      cpc1_run_load dùng) thay vì kết quả toàn bộ điểm cấu hình.
--  (5) Không đổi hạn thiết bị của đợt khi đợt có hồ sơ đã ký (PT423); khoá
--      hàng hồ sơ của đợt TRƯỚC khoá đợt (cùng thứ tự với lưu) để không
--      lọt khi đang có người ký.
--  (7) Ngày không có thật ("2026-02-31") trả lỗi tiếng Việt chỉ ô.
--
-- KHÔNG đổi công thức, giới hạn, tiêu chí đạt/không đạt, ngưỡng cảnh báo hay
-- biểu mẫu in. Chỉ thêm lớp kiểm đầu vào + chặn ghi/ký. Dữ liệu cũ không bị
-- sửa. Các hàm cũ được thay bằng CREATE OR REPLACE, giữ nguyên chữ ký, owner,
-- ACL, SECURITY DEFINER, volatility và search_path ''. Chạy lại an toàn.
--
-- HỢP ĐỒNG LỖI CHO CLIENT (lưu / tính thử):
--   SQLSTATE PT422 (PostgREST trả HTTP 422), body PostgREST:
--   { "code": "PT422", "message": "Còn N ô nhập sai — ...",
--     "hint": "INVALID_INPUT",
--     "details": "<chuỗi JSON> {\"code\":\"INVALID_INPUT\",\"issues\":[
--        {\"path\":[...], \"field\":\"p05\", \"value\":\"4.000\",
--         \"rule\":\"thousand_ambiguous\", \"reason\":\"Số dễ nhầm ...\"}]}" }
--   path = đường dẫn đúng trong payload đã gửi, vd
--     khí  : ["forms","bm01","E1.R1-C1","p05"], ["meta","report_date"],
--            ["equipment","bm01","expiry"], ["controls","positive_count"]
--     hơi  : ["bm01","E1.R2-P1","0","vg"] (chỉ số lần đo 0..2),
--            ["bm02","E1.R2-P1","toc"], ["meta","execution_date"]
--   rule ∈ not_number | thousand_ambiguous | exponent | comparison_symbol |
--          negative | not_integer | percent_range | date_format |
--          date_unreal | date_too_old | date_future | evaluation_invalid
-- KÝ (cpc1_record_sign trả JSON, không raise):
--   {"ok":false,"error_code":"INVALID_DATA","error":"...","issues":[...]}
-- =====================================================================

begin;

-- Chữ ký cũ của hàm phụ trợ ở bản nháp trước của CHÍNH migration này (chỉ có
-- trên DB thử). Bỏ để không có hai bản trùng tên gây gọi mơ hồ.
drop function if exists cpc1_private.input_issues(jsonb);
drop function if exists cpc1_private.input_object_issues(text[], jsonb, jsonb);
drop function if exists cpc1_private.input_object_issues(text[], jsonb, jsonb, boolean);
drop function if exists cpc1_private.input_cell_issue(text[], jsonb, text, text, boolean);

-- ---------------------------------------------------------------------
-- A. Đọc số: thêm luật "dễ nhầm hàng nghìn" (errcode 22P02 để phân biệt),
--    miễn cho đơn vị kg, µS/cm và EU/mL (nội độc tố: giữ cách đọc cũ). Phần còn lại giữ nguyên văn 20260923100000.
--    num(text) (gọi bởi mã cũ) = num(text, null): luôn áp luật A.
-- ---------------------------------------------------------------------
create or replace function cpc1_private.num(v text, p_unit text)
 returns numeric
 language plpgsql
 immutable
 set search_path to ''
as $function$
begin
 if v is null or length(v)>32 or trim(v)!~'^[+-]?([0-9]+([.,][0-9]+)?|[.,][0-9]+)$' then raise exception 'Nhập số thập phân hợp lệ.'; end if;
 if coalesce(p_unit,'') not in ('kg','µS/cm','EU/mL') and trim(v)~'^[+-]?0*[1-9][0-9]*[.,][0-9]{3}$' then raise exception 'Số dễ nhầm hàng nghìn — gõ 4000 hoặc 4,0' using errcode='22P02'; end if;
 if abs(replace(trim(v),',','.')::numeric)>1e12 then raise exception 'Số vượt phạm vi xử lý.'; end if;
 return replace(trim(v),',','.')::numeric;
end$function$;

create or replace function cpc1_private.num(v text)
 returns numeric
 language sql
 immutable
 set search_path to ''
as $function$select cpc1_private.num(v, null::text)$function$;

-- Đọc một ô số. Luật KPH/KFH = 0 cho khoá 'microbial' chép NGUYÊN VĂN từ
-- gas_row (20260923100000) để khí và hơi dùng chung một chỗ.
create or replace function cpc1_private.read_num(k text, raw text, p_unit text)
 returns numeric
 language plpgsql
 immutable
 set search_path to ''
as $function$
begin
 if k='microbial' and upper(btrim(raw)) in ('KPH','KFH') then return 0; end if;
 return cpc1_private.num(raw, p_unit);
end$function$;

-- Đơn vị của một trường hơi theo cấu hình biểu mẫu (cpc1_private.settings).
create or replace function cpc1_private.steam_unit(form text, k text)
 returns text
 language sql
 stable
 set search_path to ''
as $function$
 select f->>'unit' from cpc1_private.settings s, jsonb_array_elements(s.config->'forms') fm, jsonb_array_elements(fm->'fields') f
 where s.id and fm->>'id'=form and f->>'key'=k limit 1
$function$;

-- ---------------------------------------------------------------------
-- Kiểm MỘT ô. Trả null nếu ô trống/hợp lệ, ngược lại một issue.
--   p_kind: number | date (ngày sự kiện) | expiry (hạn hiệu chuẩn/hạn dùng:
--   được ở tương lai). p_unit lấy từ cấu hình biểu mẫu:
--   'hạt'/'CFU' → số đếm nguyên; '%' → 0..100; '°C' → được âm.
-- ---------------------------------------------------------------------
create or replace function cpc1_private.input_cell_issue(p_path text[], p_value jsonb, p_kind text, p_unit text)
 returns jsonb
 language plpgsql
 stable
 set search_path to ''
as $function$
declare s text; n numeric; d date; rule text; reason text;
 today date:=(now() at time zone 'Asia/Bangkok')::date;
begin
 if p_value is null or jsonb_typeof(p_value)<>'string' then return null; end if;
 s:=p_value#>>'{}';
 if btrim(s)='' then return null; end if;
 if p_kind in ('date','expiry') then
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
end$function$;

-- Kiểm các ô của một object theo danh sách trường cấu hình [{key,type,unit}].
-- p_mode: 'save' (lưu, miễn nội độc tố) | 'sign' (ký, kiểm mọi ô).
create or replace function cpc1_private.input_object_issues(p_path text[], p_obj jsonb, p_spec jsonb, p_mode text)
 returns jsonb
 language plpgsql
 stable
 set search_path to ''
as $function$
declare k text;v jsonb;f jsonb;kind text;one jsonb;outp jsonb:='[]';
begin
 if p_obj is null or jsonb_typeof(p_obj)<>'object' or jsonb_typeof(p_spec) is distinct from 'array' then return outp; end if;
 for k,v in select * from jsonb_each(p_obj) loop
  select x into f from jsonb_array_elements(p_spec) x where x->>'key'=k limit 1;
  if f is null then continue; end if;
  -- A3: lưu không chặn ô nội độc tố (khi ký vẫn kiểm).
  if p_mode='save' and (k='endotoxin' or f->>'unit'='EU/mL') then continue; end if;
  kind:=case when f->>'type'='date' then case when k~'(expiry|_due)$' then 'expiry' else 'date' end
             when f->>'type'='number' or coalesce(f->>'unit','')~'CFU' then 'number' end;
  if kind is null then continue; end if;
  one:=cpc1_private.input_cell_issue(p_path||k,v,kind,f->>'unit');
  if one is not null then outp:=outp||jsonb_build_array(one); end if;
 end loop;
 return outp;
end$function$;

-- Toàn bộ ô sai của một payload (hơi hoặc khí). Cấu trúc sai thì bỏ qua để
-- evaluate báo lỗi cấu trúc như cũ.
create or replace function cpc1_private.input_issues(p_data jsonb, p_mode text)
 returns jsonb
 language plpgsql
 stable
 set search_path to ''
as $function$
declare cfg jsonb;f jsonb;fid text;pid text;row jsonb;one jsonb;i bigint;spec jsonb;outp jsonb:='[]';
begin
 if p_data is null or jsonb_typeof(p_data)<>'object' then return outp; end if;
 if p_data?'system' then
  select config into cfg from cpc1_private.gas_settings where system=p_data->>'system';
  if cfg is null then return outp; end if;
  outp:=outp||cpc1_private.input_object_issues(array['meta'],p_data->'meta',cfg->'meta_fields',p_mode)
            ||cpc1_private.input_object_issues(array['controls'],p_data->'controls',cfg->'controls_fields',p_mode)
            ||cpc1_private.input_object_issues(array['trend'],p_data->'trend',cfg->'trend_fields',p_mode);
  for f in select x from jsonb_array_elements(cfg->'forms') x where x->>'kind'='measurement' loop
   fid:=f->>'id';
   outp:=outp||cpc1_private.input_object_issues(array['equipment',fid],p_data#>array['equipment',fid],f->'equipment_fields',p_mode);
   if jsonb_typeof(p_data#>array['forms',fid])='object' then
    for pid,row in select * from jsonb_each(p_data#>array['forms',fid]) loop
     outp:=outp||cpc1_private.input_object_issues(array['forms',fid,pid],row,f->'fields',p_mode);
    end loop;
   end if;
  end loop;
 else
  select config into cfg from cpc1_private.settings where id;
  if cfg is null then return outp; end if;
  -- Trường ngày của hơi: theo check_record (khoá *date / *due).
  outp:=outp||cpc1_private.input_object_issues(array['meta'],p_data->'meta','[{"key":"execution_date","type":"date"},{"key":"report_date","type":"date"},{"key":"evaluation_date","type":"date"}]',p_mode)
            ||cpc1_private.input_object_issues(array['equipment'],p_data->'equipment','[{"key":"balance_due","type":"date"},{"key":"thermometer_due","type":"date"}]',p_mode);
  for f in select x from jsonb_array_elements(cfg->'forms') x loop
   fid:=f->>'id';spec:=coalesce(f->'fields','[]')||'[{"key":"date","type":"date"}]';
   if jsonb_typeof(p_data->fid)<>'object' then continue; end if;
   for pid,row in select * from jsonb_each(p_data->fid) loop
    if jsonb_typeof(row)='array' then
     for one,i in select * from jsonb_array_elements(row) with ordinality loop
      outp:=outp||cpc1_private.input_object_issues(array[fid,pid,(i-1)::text],one,spec,p_mode);
     end loop;
    else
     outp:=outp||cpc1_private.input_object_issues(array[fid,pid],row,spec,p_mode);
    end if;
   end loop;
  end loop;
 end if;
 return coalesce((select jsonb_agg(x order by x->'path') from jsonb_array_elements(outp) x),'[]'::jsonb);
end$function$;

-- Raise lỗi chỉ ô theo hợp đồng PT422 (xem đầu file). Không có ô sai → không làm gì.
create or replace function cpc1_private.raise_input_issues(p_issues jsonb, p_action text)
 returns void
 language plpgsql
 stable
 set search_path to ''
as $function$
declare n integer:=coalesce(jsonb_array_length(p_issues),0);first jsonb:=p_issues->0;
begin
 if n=0 then return; end if;
 raise exception using errcode='PT422',
  message=format('Còn %s ô nhập sai — sửa trước khi %s. Ô %s: %s',n,p_action,
   (select string_agg(x,' › ') from jsonb_array_elements_text(first->'path') x),first->>'reason'),
  detail=jsonb_build_object('code','INVALID_INPUT','issues',p_issues)::text,
  hint='INVALID_INPUT';
end$function$;

-- Ô "invalid" trong kết quả tính (đã lọc phạm vi) — dùng khi ký.
create or replace function cpc1_private.evaluation_invalid_cells(ev jsonb)
 returns jsonb
 language plpgsql
 immutable
 set search_path to ''
as $function$
declare f text;form jsonb;pid text;row jsonb;one jsonb;i bigint;k text;msg text;outp jsonb:='[]';gas boolean:=ev?'system';
begin
 if ev is null or jsonb_typeof(ev->'forms')<>'object' then return outp; end if;
 for f,form in select * from jsonb_each(ev->'forms') loop
  if jsonb_typeof(form->'rows')<>'object' then continue; end if;
  for pid,row in select * from jsonb_each(form->'rows') loop
   if jsonb_typeof(row)='array' then
    for one,i in select * from jsonb_array_elements(row) with ordinality loop
     if one->>'status'='invalid' then
      for k,msg in select * from jsonb_each_text(coalesce(one->'errors','{}')) loop
       if msg<>'Chưa nhập dữ liệu.' then outp:=outp||jsonb_build_array(jsonb_build_object('path',jsonb_build_array(f,pid,(i-1)::text,k),'field',k,'rule','evaluation_invalid','reason',msg)); end if;
      end loop;
     end if;
    end loop;
   elsif jsonb_typeof(row)='object' and row?'parameters' then
    for k,msg in select * from jsonb_each_text(row->'parameters') loop
     if msg='invalid' then outp:=outp||jsonb_build_array(jsonb_build_object('path',jsonb_build_array(f,pid,k),'field',k,'rule','evaluation_invalid','reason',coalesce(row->'errors'->>k,'Giá trị không hợp lệ.'))); end if;
    end loop;
   elsif jsonb_typeof(row)='object' and row->>'status'='invalid' then
    for k,msg in select * from jsonb_each_text(coalesce(row->'errors','{}')) loop
     if msg<>'Chưa nhập dữ liệu.' then outp:=outp||jsonb_build_array(jsonb_build_object('path',case when gas then jsonb_build_array('forms',f,pid,k) else jsonb_build_array(f,pid,k) end,'field',k,'rule','evaluation_invalid','reason',msg)); end if;
    end loop;
   end if;
  end loop;
 end loop;
 if gas and ev->'controls'->>'status'='invalid' then
  for k,msg in select * from jsonb_each_text(coalesce(ev->'controls'->'errors','{}')) loop
   if msg<>'Chưa nhập dữ liệu.' then outp:=outp||jsonb_build_array(jsonb_build_object('path',jsonb_build_array('controls',k),'field',k,'rule','evaluation_invalid','reason',msg)); end if;
  end loop;
 end if;
 return outp;
end$function$;

-- Kết quả dùng khi ký: TÍNH LẠI bằng hàm hiện tại (cpc1_private.evaluate) trên
-- payload đã lưu của phiên bản — chỉ đọc, không ghi lại revision — rồi LỌC
-- theo phạm vi đợt bằng đúng scoped_evaluation như cpc1_run_load.
-- Cấu hình hiện hành khác config_snapshot của đợt (cùng kiểm như
-- cpc1_run_evaluate) hoặc không tính lại được: KHÔNG đánh giá theo cấu hình
-- mới, trả kết quả đã lưu kèm khoá recompute_error; record_sign_issues biến
-- nó thành ô chặn ký (rule evaluation_error, không nuốt lỗi).
create or replace function cpc1_private.record_sign_evaluation(p_record_id uuid, p_version integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare ev jsonb;pl jsonb;item cpc1_private.run_items;has_item boolean;
begin
 select evaluation,payload into ev,pl from public.cpc1_revisions where record_id=p_record_id and version=p_version;
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
 end if;
 -- scoped_evaluation trả ev||{…} nên giữ nguyên khoá recompute_error.
 if has_item and ev is not null then ev:=cpc1_private.scoped_evaluation(ev,item.system,item.scope); end if;
 return ev;
end$function$;

-- Ô sai/invalid của một phiên bản: luật đầu vào (chế độ 'sign', kể cả nội độc
-- tố) trên payload + ô invalid trong kết quả TÍNH LẠI đã lọc phạm vi. Cùng
-- đường dẫn thì giữ lý do của luật đầu vào (đúng rule thật).
create or replace function cpc1_private.record_sign_issues(p_record_id uuid, p_version integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare a jsonb;b jsonb;ev jsonb;
begin
 a:=cpc1_private.input_issues((select payload from public.cpc1_revisions where record_id=p_record_id and version=p_version),'sign');
 ev:=cpc1_private.record_sign_evaluation(p_record_id,p_version);
 b:=cpc1_private.evaluation_invalid_cells(ev);
 if ev?'recompute_error' then
  b:=b||jsonb_build_array(jsonb_build_object('path','[]'::jsonb,'field',null,'rule','evaluation_error','reason',ev->>'recompute_error'));
 end if;
 return a||coalesce((select jsonb_agg(x) from jsonb_array_elements(b) x
                     where not exists(select 1 from jsonb_array_elements(a) y where y->'path'=x->'path')),'[]'::jsonb);
end$function$;

revoke all on function cpc1_private.input_cell_issue(text[], jsonb, text, text) from public, anon, authenticated;
revoke all on function cpc1_private.input_object_issues(text[], jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function cpc1_private.num(text, text) from public, anon, authenticated;
revoke all on function cpc1_private.read_num(text, text, text) from public, anon, authenticated;
revoke all on function cpc1_private.steam_unit(text, text) from public, anon, authenticated;
revoke all on function cpc1_private.input_issues(jsonb, text) from public, anon, authenticated;
revoke all on function cpc1_private.raise_input_issues(jsonb, text) from public, anon, authenticated;
revoke all on function cpc1_private.evaluation_invalid_cells(jsonb) from public, anon, authenticated;
revoke all on function cpc1_private.record_sign_evaluation(uuid, integer) from public, anon, authenticated;
revoke all on function cpc1_private.record_sign_issues(uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- B. save_pq: nguyên văn 20260929120000 + MỘT dòng kiểm ô trước evaluate.
--    Lỗi → cả giao dịch huỷ: không record/revision/audit/request/entry_event.
-- ---------------------------------------------------------------------
create or replace function cpc1_private.save_pq(p_data jsonb, p_record_id uuid, p_expected_version integer, p_request_id uuid, p_title text, p_year integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
 perform cpc1_private.raise_input_issues(cpc1_private.input_issues(p_data,'save'),'lưu');
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
end$function$;

-- ---------------------------------------------------------------------
-- (7) Tính thử: ngày sai dạng/không có thật trả PT422 chỉ ô thay vì lỗi
--     tiếng Anh của Postgres. Các ô sai khác vẫn hiện trạng thái invalid như cũ.
-- ---------------------------------------------------------------------
create or replace function public.cpc1_run_evaluate(p_run_id uuid, p_data jsonb)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare r jsonb:=public.cpc1_run_get(p_run_id);item cpc1_private.run_items;ev jsonb;s text:=coalesce(p_data->>'system','steam');begin
 select * into item from cpc1_private.run_items where run_id=p_run_id and system=s;
 if not found then raise exception 'Hệ thống không thuộc đợt.' using errcode='42501';end if;
 if item.config_snapshot is distinct from cpc1_private.system_config(s) then raise exception 'Cấu hình đã đổi; cần xem xét lại đợt.' using errcode='23514';end if;
 perform cpc1_private.require_record_pq(item.record_id,true);
 if r->>'status'<>'open' then raise exception 'Đợt đã chốt; dùng kết quả của phiên bản đã lưu.' using errcode='PT409';end if;
 perform cpc1_private.check_calibration((select calibration from cpc1_private.runs where id=p_run_id),cpc1_private.run_device_requirements(p_run_id));
 perform cpc1_private.raise_input_issues((select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(cpc1_private.input_issues(p_data,'save')) x where x->>'rule' in ('date_format','date_unreal')),'tính');
 ev:=cpc1_private.evaluate(p_data);return cpc1_private.scoped_evaluation(ev,s,item.scope);
end$function$;

-- ---------------------------------------------------------------------
-- C + (4). Luật ký: nguyên văn 20261016190000, thêm chặn ô sai cho
--          kiem_tra/duyet ở cuối (sau các luật trạng thái/người ký).
-- ---------------------------------------------------------------------
create or replace function cpc1_private.record_sign_check(p_record_id uuid, p_version integer, p_actor uuid, p_y_nghia text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  st jsonb := cpc1_private.record_sign_state(p_record_id, p_version);
  v_role text := public.vmp_business_role(p_actor);
  loi jsonb;
  v_issues jsonb;
begin
  if p_y_nghia = 'kiem_tra' then
    if st->>'trang_thai' <> 'chua_ky' then
      loi := jsonb_build_object('error_code', 'WRONG_STATE', 'error', 'Phiên bản này đã được kiểm tra.');
    elsif p_actor = any(cpc1_private.record_authors(p_record_id, p_version)) then
      loi := jsonb_build_object('error_code', 'SAME_PERSON', 'error', 'Người nhập không tự kiểm tra hồ sơ của mình.');
    elsif not exists (select 1 from public.vmp_qa_phu_trach q join public.vmp_performers p on p.id = q.performer_id
                      where p.user_id = p_actor and coalesce(p.is_active, true)) then
      loi := jsonb_build_object('error_code', 'NOT_REVIEWER', 'error', 'Chỉ QA trong danh sách QA phụ trách được ký kiểm tra.');
    end if;
  elsif p_y_nghia = 'duyet' then
    if v_role is distinct from 'admin' then
      loi := jsonb_build_object('error_code', 'FORBIDDEN', 'error', 'Chỉ Admin được ký duyệt.');
    elsif st->>'trang_thai' = 'da_duyet' then
      loi := jsonb_build_object('error_code', 'WRONG_STATE', 'error', 'Phiên bản này đã được duyệt.');
    elsif st->>'trang_thai' <> 'da_kiem_tra' then
      loi := jsonb_build_object('error_code', 'WRONG_STATE', 'error', 'Cần ký kiểm tra trước khi duyệt.');
    elsif p_actor = any(cpc1_private.record_authors(p_record_id, p_version)) then
      loi := jsonb_build_object('error_code', 'SAME_PERSON', 'error', 'Người nhập không tự duyệt hồ sơ của mình.');
    elsif p_actor = (st->>'nguoi_kiem_tra')::uuid then
      loi := jsonb_build_object('error_code', 'SAME_PERSON', 'error', 'Người kiểm tra không đồng thời duyệt.');
    end if;
  elsif p_y_nghia = 'mo_lai' then
    if v_role is distinct from 'admin' then
      loi := jsonb_build_object('error_code', 'FORBIDDEN', 'error', 'Chỉ Admin được mở lại hồ sơ đã duyệt.');
    elsif st->>'trang_thai' <> 'da_duyet' then
      loi := jsonb_build_object('error_code', 'WRONG_STATE', 'error', 'Chỉ mở lại hồ sơ đã duyệt.');
    end if;
  else
    loi := jsonb_build_object('error_code', 'INVALID_MEANING', 'error', 'Ý nghĩa ký không hợp lệ.');
  end if;
  if loi is null and p_y_nghia in ('kiem_tra', 'duyet') then
    v_issues := cpc1_private.record_sign_issues(p_record_id, p_version);
    if jsonb_array_length(v_issues) > 0 then
      loi := jsonb_build_object('error_code', 'INVALID_DATA',
        'error', format('Hồ sơ còn %s ô sai — sửa và lưu lại trước khi ký (mã deviation không thay được việc sửa ô sai).', jsonb_array_length(v_issues)),
        'issues', v_issues);
    end if;
  end if;
  return loi;
end
$function$;

create or replace function public.cpc1_record_signatures(p_record_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  u uuid := cpc1_private.viewer();
  v_version integer;
  v_overall text;
begin
  perform cpc1_private.require_record_pq(p_record_id, false);
  select version into v_version from public.cpc1_records where id = p_record_id;
  v_overall := cpc1_private.record_sign_evaluation(p_record_id, v_version)->>'overall';
  return jsonb_build_object('ok', true, 'version', v_version, 'ket_qua', v_overall,
    'bat_buoc_deviation', coalesce(v_overall, '') <> 'pass',
    'o_sai', cpc1_private.record_sign_issues(p_record_id, v_version))
    || cpc1_private.record_sign_state(p_record_id, v_version) - 'nguoi_kiem_tra'
    || jsonb_build_object(
      'co_the', jsonb_build_object(
        'kiem_tra', cpc1_private.record_sign_check(p_record_id, v_version, u, 'kiem_tra') is null,
        'duyet', cpc1_private.record_sign_check(p_record_id, v_version, u, 'duyet') is null,
        'mo_lai', cpc1_private.record_sign_check(p_record_id, v_version, u, 'mo_lai') is null),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
          'version', s.version, 'y_nghia', s.y_nghia, 'ho_ten', s.ho_ten, 'vai', s.vai,
          'ly_do', s.ly_do, 'ma_deviation', s.ma_deviation, 'luc', s.created_at) order by s.created_at)
        from cpc1_private.record_signatures s where s.record_id = p_record_id), '[]'::jsonb));
end
$function$;

create or replace function public.cpc1_record_sign(p_record_id uuid, p_version integer, p_y_nghia text, p_ly_do text default null, p_ma_deviation text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  u uuid := cpc1_private.viewer();
  v_role text := public.vmp_business_role(u);
  v_version integer;
  v_overall text;
  v_xac_thuc timestamptz;
  v_ten text;
  loi jsonb;
begin
  perform cpc1_private.require_record_pq(p_record_id, false);
  -- Nhập lại mật khẩu trong 5 phút gần nhất (claim amr do máy chủ xác thực cấp).
  select to_timestamp(max((a->>'timestamp')::double precision)) into v_xac_thuc
  from jsonb_array_elements(case when jsonb_typeof(auth.jwt()->'amr') = 'array' then auth.jwt()->'amr' else '[]'::jsonb end) a
  where a->>'method' = 'password' and a->>'timestamp' ~ '^[0-9]+(\.[0-9]+)?$';
  if v_xac_thuc is null or v_xac_thuc < now() - interval '5 minutes' or v_xac_thuc > now() + interval '1 minute' then
    return jsonb_build_object('ok', false, 'error_code', 'REAUTH_REQUIRED', 'error', 'Cần nhập lại mật khẩu để ký.');
  end if;
  select version into v_version from public.cpc1_records where id = p_record_id for update;
  if v_version is distinct from p_version then
    return jsonb_build_object('ok', false, 'error_code', 'STALE', 'error', 'Hồ sơ đã có phiên bản mới. Tải lại trước khi ký.');
  end if;
  loi := cpc1_private.record_sign_check(p_record_id, v_version, u, p_y_nghia);
  if loi is not null then
    return jsonb_build_object('ok', false) || loi;
  end if;
  -- (4) Kết quả lọc theo phạm vi đợt, cùng cách cpc1_run_load hiển thị.
  v_overall := cpc1_private.record_sign_evaluation(p_record_id, v_version)->>'overall';
  if p_y_nghia = 'kiem_tra' and coalesce(v_overall, '') <> 'pass' and nullif(btrim(coalesce(p_ma_deviation, '')), '') is null then
    return jsonb_build_object('ok', false, 'error_code', 'DEVIATION_REQUIRED',
      'error', 'Hồ sơ có kết quả không đạt hoặc chưa đủ: ghi mã deviation trước khi ký.');
  end if;
  if p_y_nghia = 'mo_lai' and nullif(btrim(coalesce(p_ly_do, '')), '') is null then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED', 'error', 'Ghi lý do mở lại hồ sơ.');
  end if;
  select full_name into v_ten from public.profiles where id = u;
  insert into cpc1_private.record_signatures(record_id, version, y_nghia, actor_id, ho_ten, vai, ly_do, ma_deviation, xac_thuc_luc)
  values (p_record_id, v_version, p_y_nghia, u, coalesce(nullif(btrim(v_ten), ''), 'Không rõ'), v_role,
          nullif(btrim(coalesce(p_ly_do, '')), ''),
          case when p_y_nghia = 'kiem_tra' then nullif(btrim(coalesce(p_ma_deviation, '')), '') end, v_xac_thuc);
  insert into public.audit_logs(user_id, action, table_name, record_id, changed_fields, change_reason, new_data, source, effective_business_role)
  values (u, 'APPROVAL'::public.audit_action, 'cpc1_record_signatures', p_record_id::text || '/v' || v_version,
          array['y_nghia'], nullif(btrim(coalesce(p_ly_do, '')), ''),
          jsonb_build_object('y_nghia', p_y_nghia, 'ma_deviation', nullif(btrim(coalesce(p_ma_deviation, '')), '')),
          'cpc1_record_sign', v_role);
  return jsonb_build_object('ok', true) || cpc1_private.record_sign_state(p_record_id, v_version) - 'nguoi_kiem_tra';
end
$function$;

-- ---------------------------------------------------------------------
-- (5) Hạn thiết bị của đợt: nguyên văn 20260929180000 + chặn PT423 khi đợt
--     có hồ sơ mà phiên bản hiện hành đã ký kiểm tra/duyệt (chưa mở lại).
--     Khoá hàng hồ sơ của đợt (FOR UPDATE, thứ tự id) TRƯỚC khoá đợt — cùng
--     thứ tự với lưu (hồ sơ rồi đợt) — để chờ người đang ký/lưu xong.
-- ---------------------------------------------------------------------
create or replace function public.cpc1_run_calibration_update(p_run_id uuid, p_expected_version integer, p_calibration jsonb, p_reason text, p_request_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare u uuid:=cpc1_private.member();r cpc1_private.runs;cached cpc1_private.run_requests;inp jsonb:=jsonb_build_object('action','calibration','run',p_run_id,'version',p_expected_version,'calibration',p_calibration,'reason',p_reason);outp jsonb;changes jsonb;begin
 if p_request_id is null or p_expected_version is null then raise exception 'Thiếu mã yêu cầu hoặc phiên bản.' using errcode='23514';end if;
 perform cpc1_private.require_run_write(p_run_id);
 perform pg_advisory_xact_lock(hashtextextended('cpc1run:'||u::text||p_request_id::text,0));
 select * into cached from cpc1_private.run_requests where actor_id=u and request_id=p_request_id;
 if found then if cached.input is distinct from inp then raise exception 'Mã yêu cầu đã dùng cho dữ liệu khác.' using errcode='23505';end if;return cached.response;end if;
 -- Never acquire a record lock after this run lock. Save locks record then run.
 -- (5) Khoá hàng hồ sơ của đợt TRƯỚC (thứ tự id) để chờ người đang ký/lưu xong
 --     rồi mới đọc trạng thái ký; cpc1_record_sign cũng khoá hàng hồ sơ.
 perform 1 from public.cpc1_records rc where rc.id in (select i.record_id from cpc1_private.run_items i where i.run_id=p_run_id) order by rc.id for update of rc;
 select * into r from cpc1_private.runs where id=p_run_id for update;
 if not found then raise exception 'Không có quyền sửa đợt.' using errcode='42501';end if;
 if r.status<>'open' or r.version<>p_expected_version then raise exception 'Đợt đã chốt hoặc phiên bản đã đổi. Tải lại trước khi sửa.' using errcode='PT409';end if;
 if exists(select 1 from cpc1_private.run_items i join public.cpc1_records rc on rc.id=i.record_id
           where i.run_id=r.id and cpc1_private.record_sign_state(i.record_id,rc.version)->>'trang_thai'<>'chua_ky') then
  raise exception 'Đợt có hồ sơ đã ký kiểm tra/duyệt — không đổi hạn thiết bị. Lưu phiên bản mới (hoặc Admin mở lại hồ sơ đã duyệt) trước.' using errcode='PT423';
 end if;
 perform cpc1_private.check_calibration(p_calibration,cpc1_private.run_device_requirements(r.id));
 changes:=cpc1_private.entry_diff(r.calibration,p_calibration);
 perform cpc1_private.entry_reason(changes,p_reason);
 if changes<>'[]' then
  update cpc1_private.runs set calibration=p_calibration,version=version+1 where id=r.id;
  insert into cpc1_private.run_events(run_id,actor_id,action,details)values(r.id,u,'calibration',jsonb_build_object('previous_version',r.version,'reason',nullif(btrim(p_reason),''),'changes',changes,'request_id',p_request_id));
 end if;
 outp:=public.cpc1_run_get(r.id);insert into cpc1_private.run_requests values(u,p_request_id,inp,outp);return outp;
end$function$;

-- ---------------------------------------------------------------------
-- A/A2. Hai hàm tính: nguyên văn pg_get_functiondef (bản đang chạy), CHỈ
--   thay dòng đọc số bằng cpc1_private.read_num. Công thức, giới hạn, tiêu
--   chí, thông báo giữ nguyên.
--   row_result (hơi): truyền đơn vị từ cấu hình → miễn luật A cho kg, µS/cm;
--     vi sinh "KPH"/"KFH" = 0 như khí nén.
--   gas_row (khí): đơn vị null (khí không có trường kg/µS/cm) → hành vi
--     giữ nguyên hoàn toàn, chỉ dời luật KPH sang hàm dùng chung.
-- ---------------------------------------------------------------------
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
  else begin nums:=nums||jsonb_build_object(k,cpc1_private.read_num(k,raw,cpc1_private.steam_unit(form,k))); exception when others then bad:=true;errors:=errors||jsonb_build_object(k,'Nhập số thập phân hợp lệ, không dùng dấu phân cách hàng nghìn.'); end; end if;
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
end$function$;

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
 when 'control' then res:=(vals->>'positive_count')::numeric;ok:=res between 50 and 150;
 end case;
 foreach k in array keys loop outvals:=outvals||jsonb_build_object(k,cpc1_private.shown((vals->>k)::numeric));end loop;
 if res is not null then outvals:=outvals||jsonb_build_object('result',cpc1_private.shown(res),'print_result',cpc1_private.shown(res),'raw_result',res::text);end if;
 return jsonb_build_object('status',case when ok then 'pass' else 'fail' end,'values',outvals,'errors','{}'::jsonb);
end$function$;


-- ---------------------------------------------------------------------
-- X11. Hạn thiết bị của đợt: nguyên văn 20260929180000 + từ chối ngày trước
--      01/01/2020 sớm (tạo đợt/đổi hạn/lưu/tính), cùng định dạng lỗi PT422.
-- ---------------------------------------------------------------------
create or replace function cpc1_private.check_calibration(cal jsonb, reqs jsonb)
 returns void
 language plpgsql
 immutable
 set search_path to ''
as $function$
declare req jsonb;v jsonb;d date;begin
 if jsonb_typeof(cal) is distinct from 'object' then raise exception 'Nhập thiết bị và hạn hiệu chuẩn/hạn dùng.' using errcode='23514';end if;
 if (select array_agg(k order by k)from jsonb_object_keys(cal)k) is distinct from (select array_agg(x->>'key' order by x->>'key')from jsonb_array_elements(reqs)x) then raise exception 'Danh sách thiết bị chưa khớp phạm vi đợt.' using errcode='23514';end if;
 for req in select * from jsonb_array_elements(reqs) loop
  v:=cal->(req->>'key');
  if jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v->'name') is distinct from 'string' or length(btrim(coalesce(v->>'name',''))) not between 1 and 160 or coalesce(v->>'due_on','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or exists(select 1 from jsonb_object_keys(v)k where k not in ('name','due_on')) then raise exception 'Tên thiết bị và hạn không hợp lệ.' using errcode='23514';end if;
  begin d:=(v->>'due_on')::date;exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ngày hạn thiết bị không hợp lệ.' using errcode='23514';end;
  if to_char(d,'YYYY-MM-DD')<>v->>'due_on' then raise exception 'Ngày hạn thiết bị không hợp lệ.' using errcode='23514';end if;
  if d<date '2020-01-01' then
   perform cpc1_private.raise_input_issues(jsonb_build_array(jsonb_build_object('path',jsonb_build_array('calibration',req->>'key','due_on'),'field','due_on','value',v->>'due_on','rule','date_too_old','reason','Ngày trước 01/01/2020 — kiểm tra lại năm.')),'lưu');
  end if;
 end loop;
end$function$;

commit;

-- Mở rộng hai lưới chống bịa (phần 2 + 3 của kế hoạch tăng độ chính xác):
--
-- 1. rpc_ai_thong_ke_loc hiểu thêm: "quý này/sau/N", "nửa đầu/cuối năm",
--    "năm nay/sau", "từ tháng X đến tháng Y" — cùng khung lọc hạn VMP đã
--    có từ vá "tháng 8".
--
-- 2. rpc_ai_kiem_chung soi cả tên KHÔNG in đậm: bắt cụm bắt đầu bằng đầu
--    tên thiết bị viết hoa (Hệ thống/Máy/Tủ/Nồi/Tank/Cân...), cắt ở hư từ,
--    rồi đối chiếu dữ liệu + từ điển như tên in đậm. Kèm danh sách thuật
--    ngữ chuẩn ngành (Annex, ALCOA, CFR...) để câu trích tài liệu GMP
--    không bị báo oan — tài liệu không nằm trong vmp_ai_tu_dien.

-- ═══════════ 1. THÊM KHOẢNG THỜI GIAN ═══════════

create or replace function public.rpc_ai_thong_ke_loc(p_cau_hoi text, p_k integer default 3)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_q       text := regexp_replace(public.vmp_khong_dau(coalesce(p_cau_hoi,'')), '[^a-z0-9]+', ' ', 'g');
  v_q_dau   text := lower(regexp_replace(coalesce(p_cau_hoi,''), '[^[:alnum:]]+', ' ', 'g'));
  v_p       text;
  v_ds      jsonb := '[]'::jsonb;
  v_tb_mo   numeric;
  r         record; v_r record;
  v_ho_tro  integer; v_ty numeric; v_muc text; v_nhan text; v_ten text; v_ai text;
  v_nguoi   jsonb; v_nguoi_mo text; v_han_som date; v_han_muon date;
  v_tu date; v_den date; v_nhan_tg text; v_m text[]; v_gom text; v_them integer; v_nam integer;
  v_bo_qua  text[] := array[
    'bao','nhieu','cua','cho','cac','nhung','mot','hai','ba','the','nao','gi','la','co','khong',
    'va','hay','thi','ma','o','tai','tu','den','ve','voi','trong','ngoai','tren','duoi','con',
    'da','dang','se','bi','duoc','cai','nay','do','kia','ay','anh','chi','em','toi','ban','minh',
    'xem','giup','biet','hoi','tra','loi','can','muon','phai','nen','lam','sao','vi',
    'hang','muc','tien','thiet','danh','sach','tinh','hinh','tat','ca','hien','suat',
    'ngay','thang','nam','tuan','hom','qua','han','xong','chua','roi','moi','tong','so',
    'phong','sach','thanh','pham','tinh','hop','cuoc','tiet','nhat','kem','nhiet',
    'toan','le','bo','phan','doi','lech','nha','may','viec','cong','tom','tat','hoan',
    'lieu','chuyen','luot','truoc','nho','lay','cap','lan','cuoi','line','duyet',
    'status','system','show','department','progress','items','overdue',
    'thong','tin','thong tin','cho','ve','cua','xin',
    'quan','lien','lien quan','tim','tim kiem','ra sao','nhu the nao',
    'noi','ha','muon','it','deu','deo','luong','muc do','trung binh',
    -- "quý 3" bỏ dấu thành "quy" — đừng để nó vơ nhóm "Quy trình";
    -- hỏi thật về quy trình vẫn khớp bằng cụm hai tiếng 'quy trinh'.
    'quy'];
begin
  -- ── Chiều THỜI GIAN: khoanh khoảng hạn VMP nếu câu hỏi có nhắc ──
  v_p := ' ' || btrim(v_q) || ' ';
  v_nam := extract(year from current_date)::int;
  if v_p like '% thang nay %' then
    v_tu := date_trunc('month', current_date)::date;
    v_den := (v_tu + interval '1 month' - interval '1 day')::date;
    v_nhan_tg := format('tháng %s/%s', extract(month from v_tu)::int, extract(year from v_tu)::int);
  elsif v_p like '% thang sau %' or v_p like '% thang toi %' then
    v_tu := date_trunc('month', current_date + interval '1 month')::date;
    v_den := (v_tu + interval '1 month' - interval '1 day')::date;
    v_nhan_tg := format('tháng %s/%s', extract(month from v_tu)::int, extract(year from v_tu)::int);
  elsif v_p like '% tuan nay %' then
    v_tu := date_trunc('week', current_date)::date; v_den := v_tu + 6;
    v_nhan_tg := format('tuần này (%s–%s)', to_char(v_tu,'DD/MM'), to_char(v_den,'DD/MM'));
  elsif v_p like '% tuan sau %' or v_p like '% tuan toi %' then
    v_tu := date_trunc('week', current_date)::date + 7; v_den := v_tu + 6;
    v_nhan_tg := format('tuần sau (%s–%s)', to_char(v_tu,'DD/MM'), to_char(v_den,'DD/MM'));
  elsif v_p like '% quy nay %' then
    v_tu := date_trunc('quarter', current_date)::date;
    v_den := (v_tu + interval '3 months' - interval '1 day')::date;
    v_nhan_tg := format('quý %s/%s', extract(quarter from v_tu)::int, extract(year from v_tu)::int);
  elsif v_p like '% quy sau %' or v_p like '% quy toi %' then
    v_tu := (date_trunc('quarter', current_date) + interval '3 months')::date;
    v_den := (v_tu + interval '3 months' - interval '1 day')::date;
    v_nhan_tg := format('quý %s/%s', extract(quarter from v_tu)::int, extract(year from v_tu)::int);
  elsif v_p like '% nua dau nam %' then
    v_tu := make_date(v_nam, 1, 1); v_den := make_date(v_nam, 6, 30);
    v_nhan_tg := format('nửa đầu năm %s', v_nam);
  elsif v_p like '% nua cuoi nam %' then
    v_tu := make_date(v_nam, 7, 1); v_den := make_date(v_nam, 12, 31);
    v_nhan_tg := format('nửa cuối năm %s', v_nam);
  elsif v_p like '% nam sau %' or v_p like '% nam toi %' then
    v_tu := make_date(v_nam + 1, 1, 1); v_den := make_date(v_nam + 1, 12, 31);
    v_nhan_tg := format('năm %s', v_nam + 1);
  elsif v_p like '% nam nay %' then
    v_tu := make_date(v_nam, 1, 1); v_den := make_date(v_nam, 12, 31);
    v_nhan_tg := format('năm %s', v_nam);
  else
    v_m := regexp_match(v_p, ' quy (\d) ');
    if v_m is not null and v_m[1]::int between 1 and 4 then
      v_nam := coalesce((regexp_match(v_p, ' (20\d{2}) '))[1]::int, v_nam);
      v_tu := make_date(v_nam, (v_m[1]::int - 1) * 3 + 1, 1);
      v_den := (v_tu + interval '3 months' - interval '1 day')::date;
      v_nhan_tg := format('quý %s/%s', v_m[1]::int, v_nam);
    else
      -- "từ tháng X đến tháng Y" phải bắt TRƯỚC "tháng N" đơn lẻ,
      -- kẻo tháng đầu tiên nuốt mất cả khoảng.
      v_m := regexp_match(v_p, ' tu thang (\d{1,2}) (?:den|toi) thang (\d{1,2}) ');
      if v_m is not null and v_m[1]::int between 1 and 12 and v_m[2]::int between 1 and 12 then
        v_nam := coalesce((regexp_match(v_p, ' (20\d{2}) '))[1]::int, v_nam);
        v_tu := make_date(v_nam, v_m[1]::int, 1);
        v_den := (make_date(v_nam + case when v_m[2]::int < v_m[1]::int then 1 else 0 end, v_m[2]::int, 1)
                  + interval '1 month' - interval '1 day')::date;
        v_nhan_tg := format('từ tháng %s đến tháng %s/%s', v_m[1]::int, v_m[2]::int, extract(year from v_den)::int);
      else
        v_m := regexp_match(v_p, ' (\d{1,3}) ngay toi ');
        if v_m is not null then
          v_tu := current_date; v_den := current_date + least(v_m[1]::int, 366);
          v_nhan_tg := format('%s ngày tới', v_m[1]);
        else
          v_m := regexp_match(v_p, ' thang (\d{1,2}) ');
          if v_m is not null and v_m[1]::int between 1 and 12 then
            v_nam := coalesce((regexp_match(v_p, ' (20\d{2}) '))[1]::int, v_nam);
            v_tu := make_date(v_nam, v_m[1]::int, 1);
            v_den := (v_tu + interval '1 month' - interval '1 day')::date;
            v_nhan_tg := format('tháng %s/%s', v_m[1]::int, v_nam);
          end if;
        end if;
      end if;
    end if;
  end if;

  select round(avg(mo), 1) into v_tb_mo
  from (select count(*) filter (where computed_status <> 'done') as mo
        from public.vmp_plan_items where is_active and owner_name is not null
        group by owner_name) t;

  for r in
    with tu_dien as (
      select d.loai, d.gia_tri,
             ' ' || regexp_replace(d.khoa, '[^a-z0-9]+', ' ', 'g') || ' ' as kh,
             d.khoa
      from public.vmp_ai_tu_dien d
    ),
    tieng as (
      select distinct t from unnest(string_to_array(btrim(v_q),' ')) t
      where length(t) >= 3 and not (t = any(v_bo_qua))),
    cum as (
      select distinct btrim(a.t||' '||b.t) as t
      from unnest(string_to_array(btrim(v_q),' ')) with ordinality a(t,i)
      join unnest(string_to_array(btrim(v_q),' ')) with ordinality b(t,i) on b.i = a.i+1
      where length(a.t) >= 2 and length(b.t) >= 2
        and not (a.t = any(v_bo_qua) and b.t = any(v_bo_qua))),
    khop as (
      select d.loai, d.gia_tri, c.t as tu
      from tieng c join tu_dien d on d.kh like '% '||c.t||' %'
      where (d.loai not in ('ten_doi_tuong','line')
         or length(c.t) >= 4
         or coalesce(p_cau_hoi,'') ~ ('\m' || upper(c.t) || '\M')
         or btrim(d.kh) = c.t)
        and not (c.t = 'chung' and (' '||v_q||' ') not like '% can chung %')
      union all
      select d.loai, d.gia_tri, c.t
      from cum c join tu_dien d on d.kh like '% '||c.t||' %'
      union all
      select d.loai, d.gia_tri, c.t
      from (select distinct t from unnest(string_to_array(btrim(v_q),' ')) t
            where length(t) >= 4 and t ~ '[a-z]') c
      join tu_dien d on d.loai = 'ma' and d.khoa like '%'||c.t||'%'
      union all
      select d.loai, d.gia_tri, c.t
      from (select distinct t from unnest(string_to_array(btrim(v_q_dau),' ')) t
            where length(t) >= 2
              and not exists (select 1 from unnest(array[
                    'hoàn thành','hoàn tất','hoàn chỉnh','hoàn thiện','my thuật','mỹ thuật',
                    'đức tính','hương vị','nhi đồng','hằng ngày','hằng năm',
                    'tiến độ','tiến hành','tiến trình','tiến triển'
                  ]) cum where lower(coalesce(p_cau_hoi,'')) like '%'||cum||'%'
                    and cum like '%'||t||'%')) c
      join public.vmp_ai_tu_dien d on d.loai = 'nguoi'
        and (' ' || lower(regexp_replace(d.gia_tri, '[^[:alnum:]]+', ' ', 'g')) || ' ') like '% '||c.t||' %'
      union all
      select d.loai, d.gia_tri, c.t
      from tieng c
      join tu_dien d on d.loai = 'nguoi' and d.kh like '% '||c.t||' %'
      union all
      select d.loai, d.gia_tri, c.t
      from (select distinct t from unnest(string_to_array(btrim(v_q),' ')) t where length(t) = 2) c
      join tu_dien d on d.loai in ('loai_td','bo_phan','khu_vuc') and btrim(d.kh) = c.t
      union all
      select b.loai, b.gia_tri, b.bi_danh from public.vmp_ai_bi_danh b
      where b.gia_tri is not null and (' '||v_q||' ') like '%'||b.bi_danh||'%'),
    xep as (select loai, gia_tri, max(length(tu)) as do_dai,
                   count(distinct tu) as so_cum
            from khop group by loai, gia_tri),
    dai_nhat as (select loai, max(so_cum) as mc, max(do_dai) as md from xep group by loai)
    select x.loai, array_agg(distinct x.gia_tri) as ds,
           count(distinct x.gia_tri) as sl, max(x.do_dai) as do_dai
    from xep x join dai_nhat d on d.loai = x.loai
    where x.so_cum = d.mc
       or x.loai = 'nguoi'
       or exists (
            select 1 from khop k
            where k.loai = x.loai and k.gia_tri = x.gia_tri
              and k.tu not in (
                select k2.tu from khop k2
                join xep x2 on x2.loai = k2.loai and x2.gia_tri = k2.gia_tri
                where x2.loai = x.loai and x2.so_cum = d.mc))
    group by x.loai
    having count(distinct x.gia_tri) <= 25
    order by count(distinct x.gia_tri), max(x.so_cum) desc, max(x.do_dai) desc
    limit greatest(1, least(p_k, 5))
  loop
    if r.loai in ('nguoi', 'ten_doi_tuong', 'ma', 'nhom_viec', 'khu_vuc', 'line') and r.sl > 1 then
      v_ds := v_ds || jsonb_build_array(jsonb_build_object(
        'loai', r.loai,
        'gia_tri', array_to_string(r.ds[1:4], ', '),
        'so_gia_tri_da_gop', r.sl,
        'danh_sach_gia_tri', to_jsonb(r.ds),
        'cau_tra_loi_goi_y', case when r.loai = 'nguoi' then format(
            'Câu hỏi chạm tới %s người khác nhau (%s) — CHƯA RÕ đang hỏi ai, nên KHÔNG có con số nào để đưa cả. Hỏi lại cho rõ đang nói về ai trong số đó, tuyệt đối đừng tự chọn một người rồi gán số.',
            r.sl, array_to_string(r.ds[1:4], ', '))
          else format(
            'Câu hỏi chạm tới %s đối tượng khác nhau (%s) — CHƯA RÕ đang hỏi cái nào, nên KHÔNG có con số nào để đưa cả. Kể tên các đối tượng đó ra rồi HỎI LẠI xem ngươi muốn soi cái nào; tuyệt đối đừng cộng gộp chúng thành một con số, cũng đừng tự chọn một cái rồi gán số.',
            r.sl, array_to_string(r.ds[1:4], ', ')) end));
      continue;
    end if;

    v_ten := case when r.sl = 1 then r.ds[1]
                  else array_to_string(r.ds[1:4], ', ')
                       || case when r.sl > 4 then format(' và %s cái nữa', r.sl-4) else '' end end;

    select count(*) as tong,
      count(*) filter (where i.computed_status='done') as hoan_thanh,
      count(*) filter (where i.computed_status='prog') as dang_lam,
      count(*) filter (where i.computed_status in ('plan','todo')) as chua_bat_dau,
      count(*) filter (where i.computed_status='over') as qua_han,
      count(*) filter (where i.computed_status<>'done' and i.deadline_vmp <= current_date+30) as den_han_30_ngay,
      count(*) filter (where i.computed_status<>'done' and i.criticality_score >= 7) as dang_mo_trong_yeu_cao,
      round(sum(coalesce(i.effort_days,0)) filter (where i.computed_status<>'done'),1) as cong_ngay_con_lai
    into v_r
    from public.vmp_plan_items i
    left join public.vmp_objects o on o.code = i.object_code
    where i.is_active
      and (v_tu is null or i.deadline_vmp between v_tu and v_den)
      and case r.loai
        when 'nguoi' then i.owner_name = any(r.ds)
        when 'nhom_viec' then i.work_group = any(r.ds)
        when 'loai_td' then i.validation_type = any(r.ds)
        when 'bo_phan' then o.department = any(r.ds)
        when 'khu_vuc' then o.area = any(r.ds)
        when 'line' then o.line = any(r.ds)
        when 'ten_doi_tuong' then o.name = any(r.ds)
        when 'ma' then i.object_code = any(r.ds)
        else false end;

    v_nguoi := null; v_nguoi_mo := null; v_han_som := null; v_han_muon := null;
    if r.loai <> 'nguoi' then
      select jsonb_agg(jsonb_build_object('ten', ten, 'so_hang_muc', sl) order by sl desc),
             string_agg(ten || ' (' || sl || ' hạng mục)', ', ' order by sl desc)
      into v_nguoi, v_nguoi_mo
      from (
        select coalesce(i.owner_name, '(chưa gán)') as ten, count(*) as sl
        from public.vmp_plan_items i
        left join public.vmp_objects o on o.code = i.object_code
        where i.is_active
          and (v_tu is null or i.deadline_vmp between v_tu and v_den)
          and case r.loai
            when 'nhom_viec' then i.work_group = any(r.ds)
            when 'loai_td' then i.validation_type = any(r.ds)
            when 'bo_phan' then o.department = any(r.ds)
            when 'khu_vuc' then o.area = any(r.ds)
            when 'line' then o.line = any(r.ds)
            when 'ten_doi_tuong' then o.name = any(r.ds)
            when 'ma' then i.object_code = any(r.ds)
            else false end
        group by 1 order by 2 desc limit 3
      ) t;
    end if;

    select min(i.deadline_vmp), max(i.deadline_vmp)
    into v_han_som, v_han_muon
    from public.vmp_plan_items i
    left join public.vmp_objects o on o.code = i.object_code
    where i.is_active
      and (v_tu is null or i.deadline_vmp between v_tu and v_den)
      and case r.loai
        when 'nguoi' then i.owner_name = any(r.ds)
        when 'nhom_viec' then i.work_group = any(r.ds)
        when 'loai_td' then i.validation_type = any(r.ds)
        when 'bo_phan' then o.department = any(r.ds)
        when 'khu_vuc' then o.area = any(r.ds)
        when 'line' then o.line = any(r.ds)
        when 'ten_doi_tuong' then o.name = any(r.ds)
        when 'ma' then i.object_code = any(r.ds)
        else false end;

    v_ho_tro := null;
    if r.loai = 'nguoi' then
      select count(*) into v_ho_tro from public.vmp_plan_items
      where is_active and secondary_owner = any(r.ds) and computed_status <> 'done'
        and (v_tu is null or deadline_vmp between v_tu and v_den);
    end if;

    if v_r.tong = 0 and coalesce(v_ho_tro,0) = 0 then
      if v_tu is not null then
        v_ds := v_ds || jsonb_build_array(jsonb_build_object(
          'loai', r.loai, 'gia_tri', v_ten, 'loc_thoi_gian', v_nhan_tg, 'tong', 0,
          'cau_tra_loi_goi_y', format('%s KHÔNG có hạng mục nào có hạn VMP trong %s — nói thẳng là không có, đừng suy đoán.', v_ten, v_nhan_tg)));
      end if;
      continue;
    end if;

    v_muc := null; v_nhan := null; v_ty := null;
    if r.loai = 'nguoi' and v_tu is not null then
      v_ai := r.ds[1];
      v_nhan := format('%s trong %s: chủ trì %s hạng mục — xong %s, đang làm %s, quá hạn %s, chưa bắt đầu %s.',
                       v_ai, v_nhan_tg, v_r.tong, v_r.hoan_thanh, v_r.dang_lam, v_r.qua_han, v_r.chua_bat_dau);
      if coalesce(v_ho_tro,0) > 0 then
        v_nhan := v_nhan || format(' Kèm vai hỗ trợ ở %s việc chưa xong trong cùng khoảng đó.', v_ho_tro);
      end if;
    elsif r.loai = 'nguoi' and coalesce(v_tb_mo,0) > 0 then
      v_ai := r.ds[1];
      v_ty := round(((v_r.tong - v_r.hoan_thanh)/v_tb_mo)::numeric, 2);
      v_muc := case when v_ty >= 1.5 then 'QUÁ TẢI RÕ RỆT'
                    when v_ty >= 1.2 then 'nặng hơn mặt bằng'
                    when v_ty >= 0.8 then 'ngang mặt bằng'
                    else 'NHẸ HƠN MẶT BẰNG — không quá tải' end;
      v_nhan := format('%s CHỦ TRÌ %s việc chưa xong, trong khi trung bình mỗi người chủ trì %s việc. Vậy về tải việc, %s là %s.',
                       v_ai, v_r.tong - v_r.hoan_thanh, v_tb_mo, v_ai, lower(v_muc));
      if coalesce(v_ho_tro,0) > 0 then
        v_nhan := v_nhan || format(' Ngoài ra %s còn đứng tên HỖ TRỢ ở %s việc chưa xong — vai hỗ trợ nhẹ hơn chủ trì nên không cộng vào tải chính.', v_ai, v_ho_tro);
      end if;
      v_nhan := v_nhan || case when v_r.qua_han > 0
        then format(' Còn chuyện trễ hạn thì tách biệt: %s đang có %s hạng mục quá hạn.', v_ai, v_r.qua_han)
        else format(' Và %s không có hạng mục nào quá hạn.', v_ai) end;
    else
      v_nhan := format('%s%s%s: tổng %s hạng mục, xong %s, đang làm %s, quá hạn %s, chưa bắt đầu %s.',
                       case when v_tu is not null then format('Trong %s, ', v_nhan_tg) else '' end,
                       case when r.sl > 1 then format('đã GỘP %s giá trị (', r.sl) else '' end,
                       v_ten || case when r.sl > 1 then ')' else '' end,
                       v_r.tong, v_r.hoan_thanh, v_r.dang_lam, v_r.qua_han, v_r.chua_bat_dau);
      if v_nguoi_mo is not null then
        v_nhan := v_nhan || format(' Người phụ trách: %s.', v_nguoi_mo);
      end if;
    end if;

    if v_han_som is not null then
      v_nhan := v_nhan || format(' Mốc thời gian theo kế hoạch: hạn sớm nhất %s, hạn muộn nhất %s.',
                                 to_char(v_han_som, 'DD/MM/YYYY'), to_char(v_han_muon, 'DD/MM/YYYY'));
    end if;

    if v_tu is not null and v_r.tong > 0 then
      select string_agg(x.nm || case when x.c > 1 then ' ×' || x.c else '' end, ', ' order by x.c desc, x.nm)
      into v_gom
      from (
        select coalesce(o.name, i.object_code) as nm, count(*) as c
        from public.vmp_plan_items i
        left join public.vmp_objects o on o.code = i.object_code
        where i.is_active
          and i.deadline_vmp between v_tu and v_den
          and case r.loai
            when 'nguoi' then i.owner_name = any(r.ds)
            when 'nhom_viec' then i.work_group = any(r.ds)
            when 'loai_td' then i.validation_type = any(r.ds)
            when 'bo_phan' then o.department = any(r.ds)
            when 'khu_vuc' then o.area = any(r.ds)
            when 'line' then o.line = any(r.ds)
            when 'ten_doi_tuong' then o.name = any(r.ds)
            when 'ma' then i.object_code = any(r.ds)
            else false end
        group by 1 order by 2 desc, 1 limit 8
      ) x;
      select count(distinct coalesce(o.name, i.object_code)) into v_them
      from public.vmp_plan_items i
      left join public.vmp_objects o on o.code = i.object_code
      where i.is_active and i.deadline_vmp between v_tu and v_den
        and case r.loai
          when 'nguoi' then i.owner_name = any(r.ds)
          when 'nhom_viec' then i.work_group = any(r.ds)
          when 'loai_td' then i.validation_type = any(r.ds)
          when 'bo_phan' then o.department = any(r.ds)
          when 'khu_vuc' then o.area = any(r.ds)
          when 'line' then o.line = any(r.ds)
          when 'ten_doi_tuong' then o.name = any(r.ds)
          when 'ma' then i.object_code = any(r.ds)
          else false end;
      if v_gom is not null then
        v_nhan := v_nhan || format(' Gồm: %s.', v_gom)
                || case when v_them > 8 then ' (danh sách đã cắt còn 8 tên nhiều việc nhất)' else '' end;
      end if;
    end if;

    v_ds := v_ds || jsonb_build_array(jsonb_build_object(
      'loai', r.loai, 'gia_tri', v_ten, 'so_gia_tri_da_gop', r.sl,
      'danh_sach_gia_tri', to_jsonb(r.ds),
      'loc_thoi_gian', v_nhan_tg,
      'vai', case when r.loai='nguoi' then 'chủ trì' end,
      'tong', v_r.tong, 'hoan_thanh', v_r.hoan_thanh, 'dang_lam', v_r.dang_lam,
      'chua_bat_dau', v_r.chua_bat_dau, 'qua_han', v_r.qua_han,
      'dang_mo', v_r.tong - v_r.hoan_thanh, 'den_han_30_ngay', v_r.den_han_30_ngay,
      'dang_mo_trong_yeu_cao', v_r.dang_mo_trong_yeu_cao,
      'cong_ngay_con_lai', v_r.cong_ngay_con_lai,
      'dang_ho_tro_chua_xong', v_ho_tro,
      'trung_binh_moi_nguoi_chu_tri_dang_mo', case when r.loai='nguoi' and v_tu is null then v_tb_mo end,
      'so_lan_so_voi_trung_binh', v_ty, 'muc_tai_viec', v_muc,
      'nguoi_phu_trach', v_nguoi,
      'han_som_nhat', v_han_som, 'han_muon_nhat', v_han_muon,
      'cau_tra_loi_goi_y', v_nhan));
  end loop;

  return jsonb_build_object('ok', true, 'so_nhom', jsonb_array_length(v_ds), 'thong_ke', v_ds,
    'luu_y', 'Số liệu ĐẾM THẬT trên toàn bảng — dùng thẳng, đừng cộng trừ lại. '
      || 'Phần tử KHÔNG có ô số (chỉ có cau_tra_loi_goi_y) nghĩa là chưa khoanh được — làm đúng theo câu đó, thường là hỏi lại. '
      || 'Phần tử có ô loc_thoi_gian nghĩa là đã đếm ĐÚNG trong khoảng thời gian đó. '
      || 'Với NGƯỜI: số chính là vai CHỦ TRÌ, vai hỗ trợ để riêng và KHÔNG cộng vào tải chính. '
      || 'Ô "muc_tai_viec" và "cau_tra_loi_goi_y" là KẾT LUẬN ĐÃ CHỐT bằng SQL — theo đó mà nói, không tự phán ngược. '
      || 'QUÁ HẠN là việc đã trôi qua hạn (quá khứ); QUÁ TẢI là ôm nhiều việc hơn sức (tương lai).');
end;
$function$;

-- ═══════════ 2. LƯỚI TÊN KHÔNG IN ĐẬM + THUẬT NGỮ CHUẨN NGÀNH ═══════════

create or replace function public.rpc_ai_kiem_chung(p_tra_loi text, p_du_lieu text)
 returns jsonb
 language plpgsql
 stable
as $function$
declare
  v_so      text;
  v_lac     text[] := '{}';
  v_tong    integer := 0;
  v_bam     integer := 0;
  v_tl_sach text;
  v_m       text[];
  v_ngay_la text[] := '{}';
  v_ten_la  text[] := '{}';
  v_da_xet  text[] := '{}';
  v_cum     text;
  v_t       text;
  v_du      text;
  v_canh    text[] := '{}';
  v_words   text[];
  v_keep    integer;
  v_dau     integer;
  v_biet    boolean;
  v_c       text;
  v_hien    text;
  -- Nhãn trình bày quen thuộc, không phải tên
  v_nhan_bg text[] := array[
    'tong so hang muc','tong so viec','da hoan thanh','dang lam','qua han','chua bat dau',
    'hoan thanh','dang mo','nguoi phu trach','han som nhat','han muon nhat','tong cong',
    'sap den han','den han','con lai','chu tri','ho tro','trong yeu','toan nha may'];
  -- Thuật ngữ chuẩn ngành trích từ tài liệu GMP — không nằm trong từ điển
  -- tên của DB nhưng cũng không phải bịa. Không có nó thì mọi câu giải
  -- thích luật (Annex 15, ALCOA...) đều bị báo oan.
  v_chuan   text[] := array[
    'annex','alcoa','ich','iso','ispe','cfr','part 11','gmp','gsp','glp','gdp','who',
    'eu','fda','capa','oos','oot','urs','ccs','fat','sat','dq','iq','oq','pq','pv',
    'haccp','vmp','sop','qrm','eudralex','pic s','pics'];
  -- Hư từ cắt đuôi cụm tên: "Nồi hơi thực hiện ngày..." chỉ giữ "Nồi hơi"
  v_hu      text[] := array[
    'cua','va','den','toi','la','nay','nao','da','dang','se','vua','o','trong','ngoai',
    'cho','voi','duoc','sap','can','phai','hien','chi','thi','ma','nhu','deu','cung',
    'rat','kha','hon','nhat','moi','tung','cac','nhung','mot','hai','ba','thuc',
    'khi','neu','co','khong','van','lai','roi','xong','qua','han','truoc','sau',
    'ngay','thang','nam','tuan','gio','hom','ay','do','kia','se','bi','ve',
    'lam','nua','xu','gap','xong','chua','phan','viec','nguoi','nho','nhe','nha',
    'hay','bao','nhieu','hang','muc','tong'];
begin
  if p_tra_loi is null or p_du_lieu is null then
    return jsonb_build_object('kiem_duoc', false);
  end if;

  v_du := ' ' || regexp_replace(public.vmp_khong_dau(p_du_lieu), '[^a-z0-9]+', ' ', 'g') || ' ';

  -- 1. NGÀY dd/mm — thứ mô hình bịa nhiều nhất khi tự chế lịch
  for v_m in
    select distinct m from regexp_matches(p_tra_loi, '(\d{1,2})/(\d{1,2})(?:/\d{2,4})?', 'g') m
  loop
    continue when v_m[2]::int not between 1 and 12 or v_m[1]::int not between 1 and 31;
    if p_du_lieu not like '%-' || lpad(v_m[2],2,'0') || '-' || lpad(v_m[1],2,'0') || '%'
       and p_du_lieu not like '%' || lpad(v_m[1],2,'0') || '/' || lpad(v_m[2],2,'0') || '%' then
      v_ngay_la := array_append(v_ngay_la, v_m[1] || '/' || v_m[2]);
    end if;
  end loop;

  -- 2. CON SỐ — che ngày trước, kẻo 05/08 vỡ thành "05"/"08" trùng bừa
  v_tl_sach := regexp_replace(p_tra_loi, '\d{1,2}/\d{1,2}(/\d{2,4})?', ' ', 'g');
  for v_so in
    select distinct m[1] from regexp_matches(v_tl_sach, '(\d[\d\.]*)', 'g') m
  loop
    v_so := replace(v_so, '.', '');
    continue when v_so = '' or length(v_so) > 9;
    continue when v_so::bigint between 1 and 3;
    continue when v_so::bigint between 2024 and 2030;
    v_tong := v_tong + 1;
    if replace(p_du_lieu, '.', '') like '%' || v_so || '%' then
      v_bam := v_bam + 1;
    else
      v_lac := array_append(v_lac, v_so);
    end if;
  end loop;

  -- 3a. TÊN IN ĐẬM
  for v_cum in
    select distinct m[1] from regexp_matches(p_tra_loi, '\*\*([^*\n]{3,60})\*\*', 'g') m
  loop
    v_t := btrim(regexp_replace(public.vmp_khong_dau(v_cum), '[^a-z0-9]+', ' ', 'g'));
    continue when v_t = '' or v_t !~ '[a-z]';
    continue when array_length(string_to_array(v_t, ' '), 1) < 2 and v_t !~ '[0-9]';
    -- Markdown lệch dấu ** làm đoạn VĂN XUÔI giữa hai chỗ in đậm bị bắt
    -- như tên. Tên thật không viết bằng hư từ: cụm dài mà quá nửa là hư từ
    -- thì là văn xuôi — bỏ qua, kẻo báo oan rồi cổng chặn nuốt cả câu đúng.
    continue when array_length(string_to_array(v_t, ' '), 1) >= 2
      and 2 * (select count(*) from unnest(string_to_array(v_t, ' ')) w where w = any(v_hu))
          >= array_length(string_to_array(v_t, ' '), 1);
    continue when v_t = any(v_da_xet);
    v_da_xet := array_append(v_da_xet, v_t);
    continue when v_t = any(v_nhan_bg);
    continue when exists (select 1 from unnest(v_chuan) w where (' '||v_t||' ') like '% '||w||' %');
    if position(' ' || v_t || ' ' in v_du) > 0 then continue; end if;
    if exists (select 1 from public.vmp_ai_tu_dien d
               where d.khoa like '%' || v_t || '%'
                  or (length(d.khoa) >= 4 and (' ' || v_t || ' ') like '% ' || d.khoa || ' %')) then
      continue;
    end if;
    v_ten_la := array_append(v_ten_la, v_cum);
  end loop;

  -- 3b. TÊN KHÔNG IN ĐẬM — cụm bắt đầu bằng đầu tên thiết bị viết hoa.
  -- Chỉ soi các đầu tên quen của nhà máy để không báo oan văn xuôi thường.
  for v_m in
    select m from regexp_matches(p_tra_loi,
      '(Hệ thống|Hệ|Máy|Tủ|Nồi|Tank|Cân|Kho|Buồng|Xe|LAF|Isolator|Thiết bị|Đường ống|HVAC)[[:space:]]+([^[:space:]*.,;:!?·()\n]+(?:[[:space:]]+[^[:space:]*.,;:!?·()\n]+){0,3})', 'g') m
  loop
    v_cum := v_m[1] || ' ' || v_m[2];
    v_t := btrim(regexp_replace(public.vmp_khong_dau(v_cum), '[^a-z0-9]+', ' ', 'g'));
    v_words := string_to_array(v_t, ' ');
    v_dau := case when v_m[1] in ('Hệ thống','Thiết bị','Đường ống') then 2 else 1 end;
    -- cắt đuôi ở hư từ đầu tiên sau đầu tên
    v_keep := v_dau;
    for i in v_dau + 1 .. coalesce(array_length(v_words, 1), 0) loop
      exit when v_words[i] = any(v_hu);
      v_keep := i;
    end loop;
    continue when v_keep <= v_dau;  -- chỉ còn trơ đầu tên ("Hệ thống này...")
    v_t := array_to_string(v_words[1:v_keep], ' ');
    continue when v_t = any(v_da_xet);
    v_da_xet := array_append(v_da_xet, v_t);
    continue when v_t = any(v_nhan_bg);
    continue when exists (select 1 from unnest(v_chuan) w where (' '||v_t||' ') like '% '||w||' %');
    -- quen nếu BẤT KỲ tiền tố nào (dài trước, ngắn sau) khớp dữ liệu/từ điển
    v_biet := false;
    for i in reverse v_keep .. greatest(v_dau + 1, v_keep - 1) loop
      v_c := array_to_string(v_words[1:i], ' ');
      if position(' ' || v_c || ' ' in v_du) > 0 then v_biet := true; exit; end if;
      if exists (select 1 from public.vmp_ai_tu_dien d
                 where d.khoa like '%' || v_c || '%'
                    or (length(d.khoa) >= 4 and (' ' || v_c || ' ') like '% ' || d.khoa || ' %')) then
        v_biet := true; exit;
      end if;
    end loop;
    if not v_biet then
      v_hien := v_m[1] || ' ' || array_to_string((regexp_split_to_array(v_m[2], '[[:space:]]+'))[1:v_keep - v_dau], ' ');
      v_ten_la := array_append(v_ten_la, v_hien);
    end if;
  end loop;

  if array_length(v_lac, 1) is not null then
    v_canh := array_append(v_canh, array_length(v_lac, 1) || ' con số không có trong dữ liệu: ' || array_to_string(v_lac, ', '));
  end if;
  if array_length(v_ngay_la, 1) is not null then
    v_canh := array_append(v_canh, array_length(v_ngay_la, 1) || ' ngày không có trong dữ liệu: ' || array_to_string(v_ngay_la, ', '));
  end if;
  if array_length(v_ten_la, 1) is not null then
    v_canh := array_append(v_canh, array_length(v_ten_la, 1) || ' tên không có trong hệ VMP: ' || array_to_string(v_ten_la, ', '));
  end if;

  return jsonb_build_object(
    'kiem_duoc', true,
    'so_da_kiem', v_tong,
    'so_bam_du_lieu', v_bam,
    'so_lac', to_jsonb(v_lac),
    'ngay_la', to_jsonb(v_ngay_la),
    'ten_la', to_jsonb(v_ten_la),
    'ty_le_bam', case when v_tong + coalesce(array_length(v_ngay_la,1),0) + coalesce(array_length(v_ten_la,1),0) = 0 then null
                      else round(100.0 * v_bam / (v_tong + coalesce(array_length(v_ngay_la,1),0) + coalesce(array_length(v_ten_la,1),0))) end,
    'dat', (array_length(v_canh, 1) is null),
    'canh_bao', case when array_length(v_canh, 1) is null then null
      else 'Câu trả lời có ' || array_to_string(v_canh, '; ')
           || '. Nhiều khả năng mô hình tự nghĩ ra — kiểm lại trước khi tin.' end);
end;
$function$;

-- Chi tiết từng hạng mục khi khoanh được MỘT thiết bị / mã.
--
-- Đây là mảnh cuối để bỏ hẳn công cụ "Tra so lieu timeline" (danh sách
-- mẫu) khỏi các agent — nguồn của mọi vụ đếm-trên-mẫu và gán số toàn
-- nhà máy cho một nhóm. Điều kiện bỏ (ghi trong docs mục 10): số toàn
-- nhà máy đã nằm trong khối chốt; nay thêm nốt: hỏi một thiết bị cụ thể
-- thì khối chốt kể luôn từng hạng mục (loại — hạn — trạng thái).

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
  v_liet_ke boolean := false;
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

  -- Câu LIỆT KÊ ("có những thiết bị nào", "gồm gì", "danh sách...") thì
  -- phải kể tên thật ra — không kể là mô hình tự chế danh sách.
  v_liet_ke := v_p ~ ' (liet ke|danh sach|bao gom|gom nhung|gom gi|co nhung|nhung gi|gom cai) '
            or (v_p like '% nao %' and (v_p like '% nhung %' or v_p like '% cac %'
                or v_p like '% thiet bi %' or v_p like '% may %' or v_p like '% muc %'));

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

    -- MỐI LIÊN QUAN giữa các nhóm phân loại: nhóm việc nói rõ nó nằm ở
    -- khu nào / thuộc bộ phận nào; khu vực / bộ phận / line kể các nhóm
    -- việc bên trong — người hỏi lần theo quan hệ mà duyệt, khỏi đoán.
    if r.sl = 1 and r.loai = 'nhom_viec' and v_r.tong > 0 then
      select ' Nằm ở khu: '
             || coalesce(string_agg(distinct nullif(btrim(o.area), ''), ', '), '—')
             || '; bộ phận: '
             || coalesce((select string_agg(distinct nullif(btrim(o2.department), ''), ', ')
                          from public.vmp_plan_items i2
                          join public.vmp_objects o2 on o2.code = i2.object_code
                          where i2.is_active and i2.work_group = r.ds[1]), '—') || '.'
      into v_gom
      from public.vmp_plan_items i
      join public.vmp_objects o on o.code = i.object_code
      where i.is_active and i.work_group = r.ds[1];
      v_nhan := v_nhan || coalesce(v_gom, '');
      v_gom := null;
    elsif r.sl = 1 and r.loai in ('khu_vuc', 'bo_phan', 'line') and v_r.tong > 0 then
      select ' Các nhóm việc ở đây: ' || string_agg(nm || ' (' || c || ')', ', ' order by c desc) || '.'
      into v_gom
      from (
        select coalesce(nullif(btrim(i.work_group), ''), '(chưa phân nhóm)') as nm, count(*) as c
        from public.vmp_plan_items i
        join public.vmp_objects o on o.code = i.object_code
        where i.is_active and case r.loai
            when 'khu_vuc' then o.area = r.ds[1]
            when 'bo_phan' then o.department = r.ds[1]
            when 'line' then o.line = r.ds[1]
            else false end
        group by 1 order by 2 desc limit 6) x;
      v_nhan := v_nhan || coalesce(v_gom, '');
      v_gom := null;
    end if;

    if (v_tu is not null or v_liet_ke) and v_r.tong > 0 then
      select string_agg(x.nm || case when x.c > 1 then ' ×' || x.c else '' end, ', ' order by x.c desc, x.nm)
      into v_gom
      from (
        select coalesce(o.name, i.object_code) as nm, count(*) as c
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
            else false end
        group by 1 order by 2 desc, 1 limit 8
      ) x;
      select count(distinct coalesce(o.name, i.object_code)) into v_them
      from public.vmp_plan_items i
      left join public.vmp_objects o on o.code = i.object_code
      where i.is_active and (v_tu is null or i.deadline_vmp between v_tu and v_den)
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

    -- Khoanh được MỘT thiết bị / mã cụ thể, ít dòng: kể CHI TIẾT từng hạng
    -- mục (loại — hạn — trạng thái) để "đã IQ chưa", "hạn OQ khi nào" trả
    -- lời được thẳng từ khối chốt. Đây là điều kiện để bỏ hẳn công cụ danh
    -- sách mẫu (nguồn của mọi vụ đếm-trên-mẫu-ra-số-sai).
    if r.sl = 1 and r.loai in ('ma', 'ten_doi_tuong') and v_r.tong between 1 and 12 then
      select string_agg(format('%s — hạn %s — %s', x.vt, x.hn, x.tt), '; ' order by x.vt, x.hn)
      into v_gom
      from (
        select i.validation_type as vt, to_char(i.deadline_vmp, 'DD/MM/YYYY') as hn,
               case i.computed_status when 'done' then 'đã xong' when 'over' then 'QUÁ HẠN'
                    when 'prog' then 'đang làm' else 'chưa bắt đầu' end as tt
        from public.vmp_plan_items i
        left join public.vmp_objects o on o.code = i.object_code
        where i.is_active
          and (v_tu is null or i.deadline_vmp between v_tu and v_den)
          and case r.loai when 'ma' then i.object_code = any(r.ds)
                          when 'ten_doi_tuong' then o.name = any(r.ds) else false end
      ) x;
      if v_gom is not null then
        v_nhan := v_nhan || format(' Chi tiết từng hạng mục: %s.', v_gom);
        v_gom := null;
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

  -- Câu DANH MỤC không khoanh về đối tượng nào ("có những nhóm nào",
  -- "dữ liệu chia thành phần nào") -> đưa mục lục thật, đừng để trống
  -- rồi mô hình tự kể tên nhóm theo trí nhớ.
  if v_p ~ ' (nhom nao|nhom viec nao|nhung nhom|cac nhom|co nhung nhom|khu vuc nao|bo phan nao|chia thanh|muc luc|danh muc|loai nao|phan nao) '
     and not exists (select 1 from jsonb_array_elements(v_ds) t where t ->> 'tong' is not null) then
    -- GHÉP THÊM chứ không thay: câu viết lại hay khớp lơ lửng vài thực thể
    -- (toàn ca hỏi-lại) — mục lục vẫn phải có mặt để kể đủ danh sách thật.
    v_ds := v_ds || jsonb_build_array(jsonb_build_object(
      'loai', 'muc_luc', 'gia_tri', 'toàn bộ kế hoạch',
      'cau_tra_loi_goi_y', public.rpc_ai_muc_luc() ->> 'mo_ta'));
  end if;

  return jsonb_build_object('ok', true, 'so_nhom', jsonb_array_length(v_ds), 'thong_ke', v_ds,
    'luu_y', 'Số liệu ĐẾM THẬT trên toàn bảng — dùng thẳng, đừng cộng trừ lại. '
      || 'Phần tử KHÔNG có ô số (chỉ có cau_tra_loi_goi_y) nghĩa là chưa khoanh được — làm đúng theo câu đó, thường là hỏi lại. '
      || 'Phần tử có ô loc_thoi_gian nghĩa là đã đếm ĐÚNG trong khoảng thời gian đó. '
      || 'Với NGƯỜI: số chính là vai CHỦ TRÌ, vai hỗ trợ để riêng và KHÔNG cộng vào tải chính. '
      || 'Ô "muc_tai_viec" và "cau_tra_loi_goi_y" là KẾT LUẬN ĐÃ CHỐT bằng SQL — theo đó mà nói, không tự phán ngược. '
      || 'QUÁ HẠN là việc đã trôi qua hạn (quá khứ); QUÁ TẢI là ôm nhiều việc hơn sức (tương lai).');
end;
$function$;

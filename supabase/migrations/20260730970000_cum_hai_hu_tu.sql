-- =====================================================================
-- Cụm ghép từ hai hư từ vẫn là vô nghĩa
--
-- Câu cuối cùng còn trượt trong bộ 161: "dữ liệu cập nhật lần cuối lúc
-- nào" khoanh vào thiết bị "Kho phụ liệu cấp 1".
--
-- Truy ra: cụm "lieu cap" (cắt từ "dữ LIỆU CẬP nhật") khớp "Kho phụ
-- LIỆU CẤP 1". Cả "lieu" lẫn "cap" đều đã nằm trong danh sách hư từ,
-- nhưng nhánh ghép cụm hai tiếng lại KHÔNG lọc hư từ — nên hai chữ vô
-- nghĩa ghép lại thành một cụm được coi là có nghĩa.
--
-- Luật bổ sung, đơn giản và tổng quát: cụm chỉ có nghĩa khi ít nhất một
-- tiếng trong đó mang nghĩa.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rpc_ai_thong_ke_loc(p_cau_hoi text, p_k integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_q       text := regexp_replace(public.vmp_khong_dau(coalesce(p_cau_hoi,'')), '[^a-z0-9]+', ' ', 'g');
  v_q_dau   text := lower(regexp_replace(coalesce(p_cau_hoi,''), '[^[:alnum:]]+', ' ', 'g'));
  v_ds      jsonb := '[]'::jsonb;
  v_tb_mo   numeric;
  r         record; v_r record;
  v_ho_tro  integer; v_ty numeric; v_muc text; v_nhan text; v_ten text; v_ai text;
  v_nguoi   jsonb; v_nguoi_mo text; v_han_som date; v_han_muon date;
  v_bo_qua  text[] := array[
    'bao','nhieu','cua','cho','cac','nhung','mot','hai','ba','the','nao','gi','la','co','khong',
    'va','hay','thi','ma','o','tai','tu','den','ve','voi','trong','ngoai','tren','duoi','con',
    'da','dang','se','bi','duoc','cai','nay','do','kia','ay','anh','chi','em','toi','ban','minh',
    'xem','giup','biet','hoi','tra','loi','can','muon','phai','nen','lam','sao','vi',
    'hang','muc','tien','thiet','danh','sach','tinh','hinh','tat','ca','hien','suat',
    'ngay','thang','nam','tuan','hom','qua','han','xong','chua','roi','moi','tong','so',
    -- Tiếng thường trùng tên riêng — đã bắt được khi chấm bộ câu hỏi vàng:
    -- "kém" dính Kem/Gel, "Hà Nội" dính Nồi hấp, "phân" dính Máy phân cực kế,
    -- "phòng sạch" dính Laf A phòng máy, "toàn nhà máy" dính Thành phẩm sinh phẩm.
    'phong','sach','thanh','pham','tinh','hop','cuoc','tiet','nhat','kem','nhiet',
    'toan','le','bo','phan','doi','lech','nha','may','viec','cong','tom','tat','hoan',
    -- Chữ trong câu hỏi VỀ HỆ THỐNG đang vơ nhầm tên riêng:
    -- "dữ LIỆU" dính Nguyên liệu sinh phẩm, "CHUYỆN lượt trước" dính
    -- Thẩm định phương tiện vận chuyển, "LINE xịt" dính Thiết bị khác line B2.
    'lieu','chuyen','luot','truoc','nho','lay','cap','lan','cuoi','line','duyet',
    'status','system','show','department','progress','items','overdue',
    'noi','ha','muon','it','deu','deo','luong','muc do','trung binh'];
begin
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
        -- Cụm chỉ có nghĩa khi ÍT NHẤT MỘT tiếng mang nghĩa. Hai hư từ
        -- ghép lại vẫn là vô nghĩa: "dữ LIỆU CẬP nhật" từng khớp trúng
        -- "Kho phụ LIỆU CẤP 1" dù cả hai tiếng đều nằm trong danh sách bỏ.
        and not (a.t = any(v_bo_qua) and b.t = any(v_bo_qua))),
    khop as (
      select d.loai, d.gia_tri, c.t as tu
      from tieng c join tu_dien d on d.kh like '% '||c.t||' %'
      -- Tên thiết bị và line phải khớp bằng tiếng dài (>=4) hoặc bằng cụm;
      -- tiếng ba chữ cái quá chung, dễ vơ nhầm cả cái máy không liên quan.
      where d.loai not in ('ten_doi_tuong','line')
         or length(c.t) >= 4
         -- Mã viết HOA trong câu gốc (BFS, HVAC, HPLC) là mã chứ không phải
         -- từ tiếng Việt, nên 3 ký tự vẫn đủ đặc hiệu
         or coalesce(p_cau_hoi,'') ~ ('\m' || upper(c.t) || '\M')
         -- Khớp TRỌN VẸN cả tên thì nhận, dù chỉ ba ký tự: "xịt" là nguyên
         -- tên một line, khác hẳn "kem" vốn chỉ là mẩu của "Kem/Gel (X1)"
         or btrim(d.kh) = c.t
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
              -- "hoàn thành" chứa "hoàn" nhưng không nói về Tào Tiến Hoàn
              and not exists (select 1 from unnest(array[
                    'hoàn thành','hoàn tất','hoàn chỉnh','hoàn thiện','my thuật','mỹ thuật',
                    'đức tính','hương vị','nhi đồng','hằng ngày','hằng năm'
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
    -- Khớp được NHIỀU cụm khác nhau thì đặc hiệu hơn là khớp một cụm dài.
    -- "Kho lạnh trong kho nguyên liệu" khớp cả "kho lanh" lẫn "nguyen lieu",
    -- trong khi các thiết bị khác chỉ khớp mỗi "nguyen lieu".
    dai_nhat as (select loai, max(so_cum) as mc, max(do_dai) as md from xep group by loai)
    select x.loai, array_agg(distinct x.gia_tri) as ds,
           count(distinct x.gia_tri) as sl, max(x.do_dai) as do_dai
    from xep x join dai_nhat d on d.loai = x.loai
    where x.so_cum = d.mc
       or x.loai = 'nguoi'
       -- Giữ giá trị nào khớp bằng một cụm mà nhóm đứng đầu không khớp:
       -- dấu hiệu câu hỏi đang nhắc tới HAI đối tượng khác nhau
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
    -- NHIỀU NGƯỜI cùng dính: số gộp là số vô nghĩa — không đếm, không
    -- đưa số, chỉ trả câu hỏi lại kèm tên ứng viên rồi sang nhóm kế.
    if r.loai = 'nguoi' and r.sl > 1 then
      v_ds := v_ds || jsonb_build_array(jsonb_build_object(
        'loai', 'nguoi',
        'gia_tri', array_to_string(r.ds[1:4], ', '),
        'so_gia_tri_da_gop', r.sl,
        'danh_sach_gia_tri', to_jsonb(r.ds),
        'cau_tra_loi_goi_y', format(
          'Câu hỏi chạm tới %s người khác nhau (%s) — CHƯA RÕ đang hỏi ai, nên KHÔNG có con số nào để đưa cả. Hỏi lại cho rõ đang nói về ai trong số đó, tuyệt đối đừng tự chọn một người rồi gán số.',
          r.sl, array_to_string(r.ds[1:4], ', '))));
      continue;
    end if;

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
    where i.is_active and case r.loai
        when 'nguoi' then i.owner_name = any(r.ds)
        when 'nhom_viec' then i.work_group = any(r.ds)
        when 'loai_td' then i.validation_type = any(r.ds)
        when 'bo_phan' then o.department = any(r.ds)
        when 'khu_vuc' then o.area = any(r.ds)
        when 'line' then o.line = any(r.ds)
        when 'ten_doi_tuong' then o.name = any(r.ds)
        when 'ma' then i.object_code = any(r.ds)
        else false end;

    -- AI PHỤ TRÁCH nhóm này, và MỐC THỜI GIAN — hai thứ người ta hỏi
    -- ngay sau khi hỏi tiến độ. Không trả về thì mô hình đi vớ tên ở
    -- bảng xếp hạng toàn nhà máy rồi gán bừa cho nhóm.
    v_nguoi := null; v_nguoi_mo := null; v_han_som := null; v_han_muon := null;
    if r.loai <> 'nguoi' then
      select jsonb_agg(jsonb_build_object('ten', ten, 'so_hang_muc', sl) order by sl desc),
             string_agg(ten || ' (' || sl || ' hạng mục)', ', ' order by sl desc)
      into v_nguoi, v_nguoi_mo
      from (
        select coalesce(i.owner_name, '(chưa gán)') as ten, count(*) as sl
        from public.vmp_plan_items i
        left join public.vmp_objects o on o.code = i.object_code
        where i.is_active and case r.loai
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

      select min(i.deadline_vmp), max(i.deadline_vmp)
      into v_han_som, v_han_muon
      from public.vmp_plan_items i
      left join public.vmp_objects o on o.code = i.object_code
      where i.is_active and case r.loai
          when 'nhom_viec' then i.work_group = any(r.ds)
          when 'loai_td' then i.validation_type = any(r.ds)
          when 'bo_phan' then o.department = any(r.ds)
          when 'khu_vuc' then o.area = any(r.ds)
          when 'line' then o.line = any(r.ds)
          when 'ten_doi_tuong' then o.name = any(r.ds)
          when 'ma' then i.object_code = any(r.ds)
          else false end;
    end if;

    v_ho_tro := null;
    if r.loai = 'nguoi' then
      select count(*) into v_ho_tro from public.vmp_plan_items
      where is_active and secondary_owner = any(r.ds) and computed_status <> 'done';
    end if;
    if v_r.tong = 0 and coalesce(v_ho_tro,0) = 0 then continue; end if;

    v_ten := case when r.sl = 1 then r.ds[1]
                  else array_to_string(r.ds[1:4], ', ')
                       || case when r.sl > 4 then format(' và %s cái nữa', r.sl-4) else '' end end;

    v_muc := null; v_nhan := null; v_ty := null;
    if r.loai = 'nguoi' and coalesce(v_tb_mo,0) > 0 then
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
      v_nhan := format('%s%s: tổng %s hạng mục, xong %s, đang làm %s, quá hạn %s, chưa bắt đầu %s.',
                       case when r.sl > 1 then format('Đã GỘP %s giá trị (', r.sl) else '' end,
                       v_ten || case when r.sl > 1 then ')' else '' end,
                       v_r.tong, v_r.hoan_thanh, v_r.dang_lam, v_r.qua_han, v_r.chua_bat_dau);
      if v_nguoi_mo is not null then
        v_nhan := v_nhan || format(' Người phụ trách: %s.', v_nguoi_mo);
      end if;
      if v_han_som is not null then
        v_nhan := v_nhan || format(' Mốc thời gian theo kế hoạch: hạn sớm nhất %s, hạn muộn nhất %s.',
                                   to_char(v_han_som, 'DD/MM/YYYY'), to_char(v_han_muon, 'DD/MM/YYYY'));
      end if;
    end if;

    v_ds := v_ds || jsonb_build_array(jsonb_build_object(
      'loai', r.loai, 'gia_tri', v_ten, 'so_gia_tri_da_gop', r.sl,
      'danh_sach_gia_tri', to_jsonb(r.ds),
      'vai', case when r.loai='nguoi' then 'chủ trì' end,
      'tong', v_r.tong, 'hoan_thanh', v_r.hoan_thanh, 'dang_lam', v_r.dang_lam,
      'chua_bat_dau', v_r.chua_bat_dau, 'qua_han', v_r.qua_han,
      'dang_mo', v_r.tong - v_r.hoan_thanh, 'den_han_30_ngay', v_r.den_han_30_ngay,
      'dang_mo_trong_yeu_cao', v_r.dang_mo_trong_yeu_cao,
      'cong_ngay_con_lai', v_r.cong_ngay_con_lai,
      'dang_ho_tro_chua_xong', v_ho_tro,
      'trung_binh_moi_nguoi_chu_tri_dang_mo', case when r.loai='nguoi' then v_tb_mo end,
      'so_lan_so_voi_trung_binh', v_ty, 'muc_tai_viec', v_muc,
      'nguoi_phu_trach', v_nguoi,
      'han_som_nhat', v_han_som, 'han_muon_nhat', v_han_muon,
      'cau_tra_loi_goi_y', v_nhan));
  end loop;

  return jsonb_build_object('ok', true, 'so_nhom', jsonb_array_length(v_ds), 'thong_ke', v_ds,
    'luu_y', 'Số liệu ĐẾM THẬT trên toàn bảng — dùng thẳng, đừng cộng trừ lại. '
      || 'Phần tử KHÔNG có ô số (chỉ có cau_tra_loi_goi_y) nghĩa là chưa khoanh được — làm đúng theo câu đó, thường là hỏi lại. '
      || 'Với NGƯỜI: số chính là vai CHỦ TRÌ, vai hỗ trợ để riêng và KHÔNG cộng vào tải chính. '
      || 'Ô "muc_tai_viec" và "cau_tra_loi_goi_y" là KẾT LUẬN ĐÃ CHỐT bằng SQL — theo đó mà nói, không tự phán ngược. '
      || 'QUÁ HẠN là việc đã trôi qua hạn (quá khứ); QUÁ TẢI là ôm nhiều việc hơn sức (tương lai).');
end;
$function$



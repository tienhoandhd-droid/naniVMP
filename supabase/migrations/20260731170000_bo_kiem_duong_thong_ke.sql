-- Bộ kiểm thêm đường "thong_ke": soi thẳng kết quả rpc_ai_thong_ke_loc.
--
-- Lý do: lỗi "tiến độ" khớp nhầm tên Tào Tiến Hoàn nằm ở tầng thống kê —
-- tầng cấp số cho khối chốt của mọi lớp AI — nhưng bộ kiểm cũ chỉ soi được
-- rpc_ai_tra_loi_nhanh nên 16/16 vẫn xanh trong khi người dùng nhận số sai.
-- Ca kiểm duong='thong_ke' chạy rpc_ai_thong_ke_loc(cau_hoi, 3) rồi soi
-- chuỗi phải-có / cấm-có ngay trên JSON kết quả.

create or replace function public.rpc_ai_chay_bo_kiem(p_nguoi jsonb default null::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r      record;
  v_kq   jsonb;
  v_tl   text;
  v_dat  boolean;
  v_ly   text[];
  v_ds   jsonb := '[]'::jsonb;
  s      text;
begin
  for r in select * from public.vmp_ai_bo_kiem order by ma loop
    v_ly := '{}';

    -- Đường "thong_ke": không đi qua tra_loi_nhanh, soi thẳng tầng đếm.
    if (r.mong_doi->>'duong') = 'thong_ke' then
      v_tl := public.rpc_ai_thong_ke_loc(r.cau_hoi, 3)::text;
      for s in select jsonb_array_elements_text(coalesce(r.mong_doi->'chua_chuoi','[]'::jsonb)) loop
        if v_tl not like '%' || s || '%' then
          v_ly := array_append(v_ly, 'thiếu chuỗi "' || s || '"');
        end if;
      end loop;
      for s in select jsonb_array_elements_text(coalesce(r.mong_doi->'khong_chua','[]'::jsonb)) loop
        if v_tl like '%' || s || '%' then
          v_ly := array_append(v_ly, 'chứa chuỗi cấm "' || s || '"');
        end if;
      end loop;
      v_ds := v_ds || jsonb_build_object(
        'ma', r.ma, 'cau_hoi', r.cau_hoi, 'dat', array_length(v_ly,1) is null,
        'duong', 'thong_ke', 'ly_do', to_jsonb(v_ly), 'ghi_chu', r.ghi_chu);
      continue;
    end if;

    v_kq := public.rpc_ai_tra_loi_nhanh(
              r.cau_hoi, null,
              coalesce(p_nguoi, '{"ten":"Tào Tiến Hoàn","quyen":"admin","bo_phan":"QA"}'::jsonb),
              'bo-kiem');
    v_tl := coalesce(v_kq->>'tra_loi', '');

    if (r.mong_doi->>'duong') = 'sql' and not (v_kq->>'khop')::boolean then
      v_ly := array_append(v_ly, 'đáng lẽ SQL trả lời được nhưng lại đẩy sang AI');
    end if;
    -- Câu đi đường AI mà lần này trúng ĐỆM thì vẫn đúng: đệm chỉ chứa câu
    -- trả lời do AI soạn trước đó, dữ liệu chưa đổi nên dùng lại là hợp lệ.
    -- Coi 'dem' là hỏng thì cứ chạy bộ kiểm lần thứ hai là báo động giả.
    if (r.mong_doi->>'duong') = 'ai' and (v_kq->>'khop')::boolean
       and coalesce(v_kq->>'nguon','') <> 'dem' then
      v_ly := array_append(v_ly, 'đáng lẽ phải nhờ AI nhưng SQL lại tự trả lời');
    end if;
    if (r.mong_doi->>'duong') = 'ai' and coalesce(v_kq->>'nguon','') = 'dem' then
      v_ds := v_ds || jsonb_build_object(
        'ma', r.ma, 'cau_hoi', r.cau_hoi, 'dat', true, 'duong', 'dem',
        'ly_do', '[]'::jsonb,
        'ghi_chu', 'Trúng đệm — câu trả lời do AI soạn trước đó, dữ liệu chưa đổi.');
      continue;
    end if;
    if r.mong_doi ? 'y_dinh' and coalesce(v_kq->>'y_dinh','') <> (r.mong_doi->>'y_dinh') then
      v_ly := array_append(v_ly, 'ý định ra "' || coalesce(v_kq->>'y_dinh','(rỗng)')
                                 || '" thay vì "' || (r.mong_doi->>'y_dinh') || '"');
    end if;
    -- Câu đi đường AI: bộ kiểm chạy trong SQL nên KHÔNG gọi được mô hình,
    -- không có nội dung để soi. Chỉ kiểm định tuyến; nội dung phải kiểm
    -- qua webhook thật. Nói rõ giới hạn còn hơn báo "đạt" giả.
    if (r.mong_doi->>'duong') = 'ai' and not (v_kq->>'khop')::boolean then
      v_ds := v_ds || jsonb_build_object(
        'ma', r.ma, 'cau_hoi', r.cau_hoi, 'dat', array_length(v_ly,1) is null,
        'duong', 'ai', 'ly_do', to_jsonb(v_ly),
        'ghi_chu', 'Định tuyến đúng. Nội dung phải kiểm qua webhook thật — '
                   || 'bộ kiểm SQL không gọi được mô hình.');
      continue;
    end if;

    for s in select jsonb_array_elements_text(coalesce(r.mong_doi->'chua_chuoi','[]'::jsonb)) loop
      if v_tl not like '%' || s || '%' then
        v_ly := array_append(v_ly, 'thiếu chuỗi "' || s || '"');
      end if;
    end loop;
    for s in select jsonb_array_elements_text(coalesce(r.mong_doi->'khong_chua','[]'::jsonb)) loop
      if v_tl like '%' || s || '%' then
        v_ly := array_append(v_ly, 'chứa chuỗi cấm "' || s || '"');
      end if;
    end loop;

    v_dat := array_length(v_ly, 1) is null;
    v_ds := v_ds || jsonb_build_object(
      'ma', r.ma, 'cau_hoi', r.cau_hoi, 'dat', v_dat,
      'duong', case when (v_kq->>'khop')::boolean then coalesce(v_kq->>'nguon','sql') else 'ai' end,
      'ly_do', to_jsonb(v_ly), 'ghi_chu', r.ghi_chu);
  end loop;

  delete from public.vmp_ai_hoi_thoai where phien = 'bo-kiem';

  return jsonb_build_object(
    'tong', jsonb_array_length(v_ds),
    'dat', (select count(*) from jsonb_array_elements(v_ds) e where (e->>'dat')::boolean),
    'chi_tiet', v_ds);
end;
$function$;

-- Hai ca hồi quy cho lỗi 30/07: "tiến độ" vơ nhầm Tào Tiến Hoàn, "chung"
-- vơ nhầm line Cân chung. Câu thứ nhất là đúng câu lớp phân tích đã viết
-- lại trong execution trả số sai cho người dùng thật.
insert into public.vmp_ai_bo_kiem (ma, cau_hoi, mong_doi, ghi_chu) values
  ('tien_do_khong_phai_ten_nguoi',
   'Tình hình tiến độ các hạng mục trong nhóm Hệ thống nước tinh khiết, nước cất và Hệ thống nước thải đang đến đâu',
   '{"duong":"thong_ke","chua_chuoi":["Hệ thống nước"],"khong_chua":["Tào Tiến Hoàn"]}'::jsonb,
   'Câu do lớp phân tích viết lại, chứa "tiến độ". Từng khớp nhầm chữ "tiến" vào Tào Tiến Hoàn rồi gán 65 việc của người này cho nhóm nước (execution 30/07). Tầng thống kê chỉ được trả các nhóm nước.'),
  ('tien_do_chung_khong_vo_bua',
   'tiến độ chung thế nào',
   '{"duong":"thong_ke","khong_chua":["Tào Tiến Hoàn","Cân chung"]}'::jsonb,
   'Câu toàn nhà máy thuần túy. Từng vơ nhầm cả Tào Tiến Hoàn (chữ "tiến") lẫn line Cân chung (chữ "chung"). Không được khoanh về bất kỳ người hay line nào.')
on conflict (ma) do update set cau_hoi = excluded.cau_hoi, mong_doi = excluded.mong_doi, ghi_chu = excluded.ghi_chu;

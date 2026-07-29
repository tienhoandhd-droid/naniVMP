-- =====================================================================
-- HAI LỖI BỘ KIỂM BẮT ĐƯỢC NGAY LẦN CHẠY ĐẦU
--
-- 1) Hỏi lại quá máy móc với câu GIẢI THÍCH
--    "Vì sao LAF cân được 9 điểm trọng yếu?" bị hỏi lại "anh/chị muốn
--    hỏi cái nào trong 4 cái?". Nhưng câu này hỏi về CÁCH CHẤM ĐIỂM, mà
--    cả 4 buồng cân đều được chấm theo cùng một lý lẽ — hỏi lại chẳng
--    thêm thông tin gì, chỉ bắt người ta bấm thêm một lần.
--
--    Luật đúng: chỉ hỏi lại khi câu trả lời SẼ KHÁC NHAU tuỳ thiết bị
--    (hạn, người phụ trách, trạng thái). Câu giải thích thì trả lời
--    chung, không hỏi.
--
-- 2) Tra một mã thì hiện mã, không hiện tên
--    "HT-01 tới hạn khi nào?" trả về "Dạ, HT-01 đây ạ" — người đọc phải
--    tự nhớ HT-01 là cái gì. Phải hiện "HVAC-C1 (HT-01)".
-- =====================================================================

create or replace function public.rpc_ai_tra_loi_nhanh(
  p_question text,
  p_year integer default null,
  p_nguoi jsonb default '{}'::jsonb,
  p_phien text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public
as $fn$
declare
  v_gh   jsonb;
  v_hoi  text;
  v_dan  text := '';
  v_r    jsonb;
  v_hieu jsonb;
  v_dem  jsonb;
  v_kq   jsonb;
  v_ke   boolean;
begin
  v_gh  := public.rpc_ai_ghep_ngu_canh(p_question, p_phien);
  v_hoi := v_gh->>'cau_hoi';
  if (v_gh->>'ghep')::boolean then v_dan := v_gh->>'loi_dan'; end if;

  v_r := public.rpc_ai_ve_nguoi_hoi(v_hoi, coalesce(p_nguoi, '{}'::jsonb), p_year);
  if (v_r->>'khop')::boolean then
    insert into public.vmp_ai_hoi_thoai (phien, cau_hoi, y_dinh)
      values (coalesce(p_phien, 'khach'), p_question, v_r->>'y_dinh');
    return v_r || jsonb_build_object('vi_sao', 'Câu về người dùng hoặc về trợ lý.');
  end if;

  -- Câu giải thích thì KHÔNG hỏi lại: lý lẽ chấm điểm giống nhau cho cả
  -- nhóm, hỏi lại chỉ tốn thêm một lượt bấm mà không đổi câu trả lời.
  v_ke := (public.rpc_ai_do_kho(v_hoi)->>'kieu') = 'giai_thich';

  v_r := case when (v_gh->>'ghep')::boolean or v_ke
              then jsonb_build_object('mo_ho', false)
              else public.rpc_ai_kiem_mo_ho(v_hoi) end;
  if (v_r->>'mo_ho')::boolean then
    insert into public.vmp_ai_hoi_thoai (phien, cau_hoi, y_dinh, cho_lam_ro)
      values (coalesce(p_phien, 'khach'), v_hoi, 'hoi_lai', true);
    return jsonb_build_object(
      'khop', true, 'y_dinh', 'hoi_lai', 'nguon', 'sql',
      'tra_loi', v_r->>'cau_hoi_lai',
      'goi_y', (select jsonb_agg(e->>'ma') from jsonb_array_elements(v_r->'lua_chon') e),
      'vi_sao', 'Cụm "' || (v_r->>'cum') || '" khớp ' || (v_r->>'so_khop')
                || ' thiết bị mà câu hỏi về số liệu riêng của từng cái — hỏi lại cho chắc.');
  end if;

  v_hieu := public.rpc_ai_hieu_cau_hoi(v_hoi);

  if not (v_hieu->>'can_ai')::boolean then
    v_kq := public.rpc_ai_dung_cau_tra_loi(v_hoi, v_hieu, p_year);
    insert into public.vmp_ai_hoi_thoai (phien, cau_hoi, y_dinh)
      values (coalesce(p_phien, 'khach'), v_hoi, v_kq->>'y_dinh');
    return v_kq
      || jsonb_build_object('tra_loi', v_dan || (v_kq->>'tra_loi'))
      || jsonb_build_object('vi_sao', v_hieu->>'vi_sao')
      || jsonb_build_object('goi_y', public.rpc_ai_goi_y_tiep(v_hieu, p_year));
  end if;

  v_dem := public.rpc_ai_cache_doc(v_hoi);
  if (v_dem->>'trung')::boolean then
    insert into public.vmp_ai_hoi_thoai (phien, cau_hoi, y_dinh)
      values (coalesce(p_phien, 'khach'), v_hoi, 'dem');
    return jsonb_build_object(
      'khop', true, 'y_dinh', 'dem', 'nguon', 'dem',
      'tra_loi', v_dan || (v_dem->>'tra_loi'),
      'goi_y', public.rpc_ai_goi_y_tiep(v_hieu, p_year),
      'vi_sao', 'Đã hỏi trước đó, dữ liệu chưa đổi — dùng lại.');
  end if;

  insert into public.vmp_ai_hoi_thoai (phien, cau_hoi, y_dinh)
    values (coalesce(p_phien, 'khach'), v_hoi, 'chuyen_ai');
  return jsonb_build_object('khop', false, 'y_dinh', null, 'tra_loi', null,
    'cau_hoi_day_du', v_hoi,
    'goi_y', public.rpc_ai_goi_y_tiep(v_hieu, p_year),
    'vi_sao', v_hieu->>'vi_sao');
end;
$fn$;

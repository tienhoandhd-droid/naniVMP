-- =====================================================================
-- BỘ NGÔN NGỮ TÂM SỰ
--
-- Người dùng hệ VMP phần lớn là QA đang ôm vài chục hạng mục quá hạn.
-- Sẽ có lúc họ gõ vào ô chat không phải để tra số, mà để than: "mệt
-- quá", "nhiều việc quá", "làm không xuể". Đáp lại bằng một bảng số liệu
-- lúc đó là vô duyên.
--
-- Nhưng an ủi suông cũng vô dụng. Cách đối đúng: NGHE trước, rồi đưa
-- đúng thứ giúp được — chính là số liệu của riêng người đó, kèm gợi ý
-- việc nào nên làm trước.
--
-- Nói cách khác: đồng cảm bằng lời, giúp bằng dữ liệu.
-- =====================================================================

insert into public.vmp_ai_giong (ngu_canh, cau) values
 ('tam_su','Bổn cung nghe đây, ngươi cứ nói'),
 ('tam_su','Ừm, bổn cung hiểu mà, đợt này căng thật'),
 ('tam_su','Nhìn số liệu bổn cung cũng thấy thương ngươi'),
 ('tam_su','Không phải mình ngươi đâu, cả đội đang đuối'),
 ('tam_su','Thở một cái đã, rồi bổn cung bày cho'),
 ('tam_su','Bổn cung không giục ngươi đâu, cứ từ từ'),

 ('dong_vien','Làm được tới đây là khá rồi đó, đừng tự trách'),
 ('dong_vien','Cứ nhặt từng cái một, rồi cũng hết thôi'),
 ('dong_vien','Bổn cung tin ngươi làm được, chỉ là cần thứ tự'),
 ('dong_vien','Chọn mấy cái trọng yếu cao làm trước, nhẹ đầu hẳn'),
 ('dong_vien','Xong được cái nào là bớt được cái đó, ngươi ạ')
on conflict (ngu_canh, cau) do nothing;

-- Nhận diện câu tâm sự và đáp: đồng cảm + số liệu của chính người đó ----
create or replace function public.rpc_ai_tam_su(
  p_question text, p_nguoi jsonb default '{}'::jsonb, p_year integer default null
) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_year integer := coalesce(p_year, extract(year from now())::integer);
  q      text    := public.vmp_khong_dau(coalesce(p_question, ''));
  ten    text    := nullif(trim(coalesce(p_nguoi->>'ten', '')), '');
  v_tong integer; v_tre integer; v_sap integer;
  v_uu   text;
  v_than text;
begin
  if q !~ ('(met qua|met roi|met lam|ap luc|qua tai|khong xue|lam khong kip'
        || '|nhieu viec qua|nhieu qua|choang|stress|nan qua|chan qua|buon qua'
        || '|khong biet bat dau|roi tung beng|bo tay|cuu toi|lam sao bay gio'
        || '|deo noi|khong kham noi|kiet suc)') then
    return jsonb_build_object('khop', false);
  end if;

  if ten is null then
    return jsonb_build_object('khop', true, 'y_dinh', 'tam_su', 'nguon', 'sql',
      'tra_loi', 'Bổn cung nghe đây, ngươi cứ nói 🌸' || E'\n\n'
        || 'Mà bổn cung chưa biết ngươi là ai nên chưa lôi được phần việc '
        || 'riêng của ngươi ra xem. Ngươi tải lại trang rồi hỏi bổn cung lần '
        || 'nữa, bổn cung sẽ bày cho nên làm cái gì trước.',
      'goi_y', jsonb_build_array('Còn bao nhiêu hạng mục quá hạn?',
                                 'Nhóm trọng yếu 7-9 đang tới đâu?'));
  end if;

  select count(*), count(*) filter (where computed_status = 'over'),
         count(*) filter (where computed_status <> 'done'
                            and deadline_vmp between current_date and current_date + 30)
    into v_tong, v_tre, v_sap
  from vmp_plan_items
  where year = v_year and is_active and owner_name = ten;

  -- Việc nên làm trước: trọng yếu cao nhất, trễ lâu nhất
  select string_agg('· ' || p.validation_code || ' — ' || o.name
                    || ' (điểm ' || coalesce(p.criticality_score::text, '—')
                    || ', trễ ' || (current_date - p.deadline_vmp) || ' ngày)', E'\n')
  into v_uu
  from (select * from vmp_plan_items
        where year = v_year and is_active and owner_name = ten
          and computed_status = 'over'
        order by criticality_score desc nulls last, deadline_vmp
        limit 3) p
  join vmp_objects o on o.code = p.object_code;

  v_than := case
    when v_tre = 0 then 'Mà bổn cung xem rồi, phần của ngươi **không có mục nào quá hạn** đâu — '
                        || 'ngươi lo hơi quá đó nha 🌸'
    when v_tre >= 20 then 'Bổn cung xem sổ rồi, ngươi đang ôm **' || v_tre
                        || ' mục quá hạn** trên tổng **' || v_tong || '**. Nhiều thật, '
                        || 'không phải ngươi kém đâu.'
    else 'Bổn cung xem sổ rồi, ngươi có **' || v_tre || ' mục quá hạn** trên tổng **'
         || v_tong || '**. Chưa tới mức không cứu được đâu.' end;

  return jsonb_build_object('khop', true, 'y_dinh', 'tam_su', 'nguon', 'sql',
    'tra_loi',
    'Ừm, bổn cung hiểu mà. Đợt này căng thật 🌸' || E'\n\n'
    || v_than || E'\n\n'
    || case when v_uu is not null then
         'Nếu chưa biết bắt đầu từ đâu thì ngươi cứ nhặt ba cái này trước, '
         || 'trọng yếu cao nhất và trễ lâu nhất:' || E'\n' || v_uu || E'\n\n'
       else '' end
    || case when v_sap > 0 then 'Còn **' || v_sap || ' mục** sắp tới hạn trong 30 ngày nữa, '
                                || 'ngươi ngó qua sớm cho đỡ dồn.' || E'\n\n' else '' end
    || 'Cứ nhặt từng cái một, rồi cũng hết thôi. Bổn cung ngồi đây, cần gì cứ gọi.',
    'goi_y', jsonb_build_array(
      'Liệt kê hạng mục quá hạn của ' || ten,
      ten || ' còn bao nhiêu việc sắp đến hạn?',
      'Còn bao nhiêu hạng mục chưa có QA phụ trách?'));
end;
$fn$;

revoke execute on function public.rpc_ai_tam_su(text, jsonb, integer) from anon, public;
grant  execute on function public.rpc_ai_tam_su(text, jsonb, integer) to authenticated, service_role;

insert into public.vmp_ai_bo_kiem (ma, cau_hoi, mong_doi, ghi_chu) values
 ('tam_su', 'mệt quá, nhiều việc quá làm không xuể',
  '{"duong":"sql","y_dinh":"tam_su","khong_chua":["không có trong dữ liệu"]}'::jsonb,
  'Câu than mà đáp bằng bảng số liệu là vô duyên; đáp bằng an ủi suông là vô dụng. '
  'Phải đồng cảm bằng lời rồi giúp bằng dữ liệu của chính người đó.')
on conflict (ma) do update set
  cau_hoi = excluded.cau_hoi, mong_doi = excluded.mong_doi, ghi_chu = excluded.ghi_chu;

update public.system_config set value = to_jsonb((value #>> '{}')::int + 1)
where key = 'ai_phien_ban_logic';

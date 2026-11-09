-- =====================================================================
-- 20261110140000_tham_dinh_nhat_ky_chu_ky.sql
-- ---------------------------------------------------------------------
-- Nhật ký thẩm định (cpc1_audit_trail) hiện cả ký kiểm tra / ký duyệt /
-- mở lại hồ sơ từ cpc1_private.record_signatures (loại 'ky', chi tiết =
-- y_nghia [· mã deviation], lý do = lý do mở lại). Thân hàm lấy NGUYÊN VĂN
-- 20261110110000, chỉ thêm một nhánh UNION; lọc quyền theo hồ sơ giữ nguyên.
-- Không đổi dữ liệu.
-- =====================================================================
begin;

CREATE OR REPLACE FUNCTION public.cpc1_audit_trail(p_system text DEFAULT NULL::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  u uuid := cpc1_private.viewer();
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 1000);
  v_tu timestamptz := case when p_from is null then '-infinity'::timestamptz else (p_from::timestamp at time zone 'Asia/Bangkok') end;
  v_den timestamptz := case when p_to is null then 'infinity'::timestamptz else ((p_to + 1)::timestamp at time zone 'Asia/Bangkok') end;
begin
  if p_system is not null and p_system not in ('steam', 'air', 'nitrogen') then
    raise exception 'Hệ thống không hợp lệ.' using errcode = '22023';
  end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
             'thoi_diem', e.thoi_diem, 'loai', e.loai, 'he_thong', e.he_thong,
             'dot', rn.title, 'ho_so', e.record_id, 'phien_ban', e.phien_ban,
             'nguoi', coalesce(p.full_name, 'Không rõ'), 'ly_do', e.ly_do,
             'thay_doi', e.thay_doi, 'chi_tiet', e.chi_tiet
           ) order by e.thoi_diem desc, e.loai)
    from (
      select hs.* from (
        -- Mỗi lần lưu phiên bản
        select a.created_at thoi_diem, 'luu'::text loai, r.system he_thong, a.record_id, a.new_version phien_ban,
               null::uuid run_id, a.actor_id, null::text ly_do, null::jsonb thay_doi, a.action chi_tiet
        from cpc1_private.audit a join public.cpc1_records r on r.id = a.record_id
        union all
        -- Sửa giá trị đã có: bắt buộc lý do, kèm giá trị cũ/mới
        select ev.created_at, 'sua', r.system, ev.record_id, ev.version, ev.run_id, ev.actor_id, ev.reason, ev.changes, null
        from cpc1_private.entry_events ev join public.cpc1_records r on r.id = ev.record_id
        union all
        -- Sự kiện đợt: tạo, đổi hạn thiết bị, hoàn thành, kết thúc…
        -- 09/11: sự kiện gắn một hồ sơ (chấm lại) lấy hệ thống, hồ sơ, phiên bản từ details.
        select re.created_at, 'dot',
               coalesce((select r.system from public.cpc1_records r where r.id::text = re.details ->> 'record_id'),
                        (select i.system from cpc1_private.run_items i where i.run_id = re.run_id order by i.system limit 1)),
               (select r.id from public.cpc1_records r where r.id::text = re.details ->> 'record_id'),
               case when re.details ->> 'to_version' ~ '^[0-9]+$' then (re.details ->> 'to_version')::integer end,
               re.run_id, re.actor_id, re.details ->> 'reason', null, re.action
        from cpc1_private.run_events re
        union all
        -- Mỗi lần in PDF
        select pe.created_at, 'in', r.system, pe.record_id, pe.version, null, pe.actor_id, null, null,
               upper(pe.form) || ' · SHA-256 ' || left(pe.pdf_sha256, 12)
        from cpc1_private.print_events pe join public.cpc1_records r on r.id = pe.record_id
        union all
        -- 09/11: ký kiểm tra, ký duyệt, mở lại hồ sơ (bảng chữ ký chỉ thêm, không sửa/xoá).
        select s.created_at, 'ky', r.system, s.record_id, s.version, null, s.actor_id, s.ly_do, null,
               s.y_nghia || coalesce(' · ' || s.ma_deviation, '')
        from cpc1_private.record_signatures s join public.cpc1_records r on r.id = s.record_id
      ) hs
      where hs.thoi_diem >= v_tu and hs.thoi_diem < v_den
        and (p_system is null or hs.he_thong = p_system)
        and case when hs.record_id is not null then cpc1_private.record_pq_right(hs.record_id, false)
                 else exists (select 1 from cpc1_private.run_items i
                              where i.run_id = hs.run_id and cpc1_private.record_pq_right(i.record_id, false)) end
      order by hs.thoi_diem desc
      limit v_limit
    ) e
    left join public.profiles p on p.id = e.actor_id
    left join cpc1_private.runs rn on rn.id = coalesce(e.run_id,
      (select i.run_id from cpc1_private.run_items i where i.record_id = e.record_id limit 1))
  ), '[]'::jsonb));
end
$function$;

commit;

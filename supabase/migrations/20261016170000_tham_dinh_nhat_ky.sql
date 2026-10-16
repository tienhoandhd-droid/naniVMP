-- =====================================================================
-- 20261016170000_tham_dinh_nhat_ky.sql — NHẬT KÝ THAY ĐỔI + GHI NHẬN IN PDF
-- ---------------------------------------------------------------------
-- Gói 2 nâng cấp Thẩm định thực tế (docs/superpowers/specs/2026-10-16-
-- tham-dinh-thuc-te-nang-cap.md). Annex 11 §9: audit trail phải xem được
-- dạng dễ đọc và review định kỳ. PIC/S PI 041 §9.3: hệ hybrid (in PDF rồi
-- ký tay) phải truy vết được bản nào đã được in, ai in, lúc nào.
--
-- - cpc1_private.print_events: mỗi lần in một dòng, kèm SHA-256 của file.
-- - public.cpc1_print_log: web gọi ngay sau khi dựng PDF; không ghi được
--   thì web không giao file.
-- - public.cpc1_audit_trail: gộp lưu phiên bản, sửa có lý do (cũ/mới), sự
--   kiện đợt, lần in. Cùng luật quyền với các RPC khác: viewer() + chỉ hồ
--   sơ/đợt người xem đọc được (record_pq_right).
-- =====================================================================

begin;

create table if not exists cpc1_private.print_events (
  id bigint generated always as identity primary key,
  record_id uuid not null references public.cpc1_records(id),
  version integer not null,
  form text not null,
  pdf_sha256 text not null check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  actor_id uuid not null,
  created_at timestamptz not null default now()
);
alter table cpc1_private.print_events enable row level security;
revoke all on table cpc1_private.print_events from public, anon, authenticated;

create or replace function public.cpc1_print_log(p_record_id uuid, p_version integer, p_form text, p_pdf_sha256 text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare u uuid := cpc1_private.viewer();
begin
  perform cpc1_private.require_record_pq(p_record_id, false);
  if not exists (select 1 from public.cpc1_revisions where record_id = p_record_id and version = p_version) then
    raise exception 'Phiên bản hồ sơ không tồn tại.' using errcode = '22023';
  end if;
  if p_form !~ '^bm0[1-7]$' then
    raise exception 'Biểu mẫu không hợp lệ.' using errcode = '22023';
  end if;
  if coalesce(p_pdf_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Mã băm PDF không hợp lệ.' using errcode = '22023';
  end if;
  insert into cpc1_private.print_events(record_id, version, form, pdf_sha256, actor_id)
  values (p_record_id, p_version, p_form, p_pdf_sha256, u);
  return jsonb_build_object('ok', true);
end
$function$;

create or replace function public.cpc1_audit_trail(p_system text default null, p_from date default null, p_to date default null, p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
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
        select re.created_at, 'dot', (select i.system from cpc1_private.run_items i where i.run_id = re.run_id order by i.system limit 1),
               null, null, re.run_id, re.actor_id, re.details ->> 'reason', null, re.action
        from cpc1_private.run_events re
        union all
        -- Mỗi lần in PDF
        select pe.created_at, 'in', r.system, pe.record_id, pe.version, null, pe.actor_id, null, null,
               upper(pe.form) || ' · SHA-256 ' || left(pe.pdf_sha256, 12)
        from cpc1_private.print_events pe join public.cpc1_records r on r.id = pe.record_id
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

revoke all on function public.cpc1_print_log(uuid, integer, text, text) from public, anon;
revoke all on function public.cpc1_audit_trail(text, date, date, integer) from public, anon;
grant execute on function public.cpc1_print_log(uuid, integer, text, text) to authenticated;
grant execute on function public.cpc1_audit_trail(text, date, date, integer) to authenticated;

commit;

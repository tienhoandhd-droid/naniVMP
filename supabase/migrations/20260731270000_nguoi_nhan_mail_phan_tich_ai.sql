-- =====================================================================
--  Người nhận mail phân tích AI (2026-07-30)
--  ---------------------------------------------------------------------
--  Bảng vmp_alert_recipients đang chỉ phục vụ email cảnh báo TỪNG HẠNG MỤC
--  (workflow Vani VMP 1). Nay dùng chung cho một loại mail thứ hai: BẢN
--  PHÂN TÍCH AI định kỳ (workflow Vani VMP 5) — mail tổng hợp cả phạm vi,
--  không phải nhắc từng mã.
--
--  Hai việc khác nhau nên phải bật/tắt riêng: có người chỉ muốn nhắc hạng
--  mục của mình, có người chỉ muốn bản phân tích tháng. Gộp vào một cờ
--  is_enabled thì không tách được, nên thêm hai cột riêng.
--
--    ai_report_enabled  — có nhận bản phân tích AI không
--    ai_report_schedule — 'không' | 'hằng tuần' | 'hằng tháng'
--
--  Quy ước lịch (workflow đọc, không lưu trong DB):
--    hằng tuần  → chạy sáng thứ Hai
--    hằng tháng → chạy sáng ngày 1
--  Đặt ai_report_schedule='không' thì chỉ gửi khi bấm tay trên web.
-- =====================================================================

alter table public.vmp_alert_recipients
  add column if not exists ai_report_enabled  boolean not null default false,
  add column if not exists ai_report_schedule text    not null default 'không';

-- Ràng buộc giá trị lịch: gõ sai chính tả thì workflow lặng lẽ không gửi,
-- và không ai biết vì sao. Chặn ngay ở DB để lỗi lộ ra lúc lưu.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vmp_alert_recipients_ai_schedule_check'
  ) then
    alter table public.vmp_alert_recipients
      add constraint vmp_alert_recipients_ai_schedule_check
      check (ai_report_schedule in ('không', 'hằng tuần', 'hằng tháng'));
  end if;
end $$;

comment on column public.vmp_alert_recipients.ai_report_enabled is
  'Nhận bản phân tích AI tổng hợp (Vani VMP 5). Khác với is_enabled — cờ đó dành cho mail cảnh báo từng hạng mục.';
comment on column public.vmp_alert_recipients.ai_report_schedule is
  'Tần suất gửi tự động bản phân tích AI: không | hằng tuần (thứ Hai) | hằng tháng (ngày 1).';

-- Chỉ mục cho truy vấn của workflow: "ai đến lượt nhận hôm nay".
create index if not exists idx_alert_recipients_ai_report
  on public.vmp_alert_recipients (ai_report_enabled, ai_report_schedule)
  where ai_report_enabled;

-- ---------------------------------------------------------------------
-- RPC lưu người nhận: nhận thêm hai khoá mới.
-- Giữ nguyên toàn bộ phần cũ, chỉ nối thêm 2 dòng update — bản cũ bỏ qua
-- khoá lạ nên nếu không sửa thì web ghi mãi không vào.
-- ---------------------------------------------------------------------
create or replace function public.rpc_upsert_alert_recipient(p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role  text;
  v_id    uuid := p_id;
  v_email text := nullif(btrim(p_patch ->> 'email'), '');
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if v_role not in ('admin','qa_manager') then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được sửa danh sách nhận cảnh báo');
  end if;
  if v_id is null and v_email is null then
    return jsonb_build_object('ok', false, 'error', 'Phải nhập email');
  end if;

  if v_id is null then
    insert into public.vmp_alert_recipients (email, updated_by) values (v_email, auth.uid())
    returning id into v_id;
  end if;

  update public.vmp_alert_recipients r set
    is_enabled     = coalesce((p_patch ->> 'is_enabled')::boolean, r.is_enabled),
    scope_type     = coalesce(nullif(btrim(p_patch ->> 'scope_type'), ''), r.scope_type),
    scope          = coalesce(p_patch ->> 'scope',          r.scope),
    email          = coalesce(v_email,                      r.email),
    recipient_name = coalesce(p_patch ->> 'recipient_name', r.recipient_name),
    alert_kind     = coalesce(nullif(btrim(p_patch ->> 'alert_kind'), ''), r.alert_kind),
    threshold_days = coalesce((p_patch ->> 'threshold_days')::integer, r.threshold_days),
    note           = coalesce(p_patch ->> 'note',           r.note),
    ai_report_enabled  = coalesce((p_patch ->> 'ai_report_enabled')::boolean, r.ai_report_enabled),
    ai_report_schedule = coalesce(nullif(btrim(p_patch ->> 'ai_report_schedule'), ''), r.ai_report_schedule),
    updated_by     = auth.uid()
  where r.id = v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'msg', 'Đã lưu người nhận');
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$function$;

-- ---------------------------------------------------------------------
-- Ai đến lượt nhận bản phân tích AI hôm nay?
-- Trả về MỘT DÒNG MỖI PHẠM VI, kèm danh sách người nhận của phạm vi đó —
-- vì workflow phải chạy AI một lần cho mỗi phạm vi, không phải mỗi người.
--
-- p_ngay: ngày cần chấm lịch (mặc định hôm nay). Truyền tay để test được
-- một ngày bất kỳ mà không phải đợi tới thứ Hai.
-- p_bo_qua_lich: true = lấy hết người đang bật, kệ lịch (dùng cho nút gửi
-- tay trên web).
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_mail_targets(
  p_ngay date default current_date,
  p_bo_qua_lich boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with den_luot as (
    select
      -- Phạm vi 'bộ phận' có mã thì chạy AI riêng cho bộ phận đó; mọi loại
      -- phạm vi khác gộp về 'all'. Phạm vi 'đối tượng' không có nghĩa với
      -- bản phân tích tổng hợp nên cũng về 'all'.
      case
        when scope_type = 'bộ phận' and coalesce(btrim(scope), '') <> ''
          then lower(btrim(scope))
        else 'all'
      end as pham_vi,
      email,
      coalesce(nullif(btrim(recipient_name), ''), email) as ten,
      ai_report_schedule as lich
    from public.vmp_alert_recipients
    where ai_report_enabled
      and (
        p_bo_qua_lich
        or (ai_report_schedule = 'hằng tuần'  and extract(isodow from p_ngay) = 1)
        or (ai_report_schedule = 'hằng tháng' and extract(day    from p_ngay) = 1)
      )
  )
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'pham_vi', pham_vi,
      'nguoi_nhan', nguoi_nhan
    ) order by pham_vi),
    '[]'::jsonb
  )
  from (
    select pham_vi,
           jsonb_agg(jsonb_build_object('email', email, 'ten', ten, 'lich', lich) order by email) as nguoi_nhan
    from den_luot
    group by pham_vi
  ) g;
$function$;

comment on function public.rpc_ai_mail_targets(date, boolean) is
  'Danh sách phạm vi cần chạy bản phân tích AI hôm nay, kèm người nhận từng phạm vi. Dùng bởi workflow Vani VMP 5.';

revoke all on function public.rpc_ai_mail_targets(date, boolean) from public;
grant execute on function public.rpc_ai_mail_targets(date, boolean) to authenticated, service_role;

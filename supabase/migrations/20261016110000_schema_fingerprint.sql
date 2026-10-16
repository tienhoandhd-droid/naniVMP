-- =====================================================================
-- 20261016110000_schema_fingerprint.sql — MÃ BĂM THÂN HÀM ĐỂ PHÁT HIỆN LỆCH
-- ---------------------------------------------------------------------
-- Vì sao: rà soát 16/10 phát hiện 6 migration nằm trong repo 6 tuần mà
-- production chưa áp. scripts/check-migration-drift.mjs bắt được việc này
-- nhưng cần SUPABASE_DB_URL — GitHub cố ý không giữ credential DB. Hàm này
-- cho workflow db-drift.yml kiểm HẰNG NGÀY chỉ bằng anon key.
--
-- An toàn: chỉ trả md5 của thân hàm schema public (đã chuẩn hoá khoảng
-- trắng giống script), không trả mã nguồn, không đọc dữ liệu bảng nào.
-- Repo GitHub đang PUBLIC nên thân hàm vốn đã công khai; mã băm không lộ
-- thêm gì. Chuẩn hoá phải khớp chuanHoa() trong check-migration-drift.mjs.
-- =====================================================================

begin;

create or replace function public.rpc_schema_fingerprint()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(jsonb_object_agg(t.proname, t.cac_ma), '{}'::jsonb)
  from (
    select p.proname,
           jsonb_agg(md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) order by p.oid) as cac_ma
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
    group by p.proname
  ) t
$function$;

comment on function public.rpc_schema_fingerprint() is
  'md5 thân hàm public (chuẩn hoá khoảng trắng) để phát hiện migration chưa áp. 20261016.';

revoke all on function public.rpc_schema_fingerprint() from public;
grant execute on function public.rpc_schema_fingerprint() to anon, authenticated, service_role;

commit;

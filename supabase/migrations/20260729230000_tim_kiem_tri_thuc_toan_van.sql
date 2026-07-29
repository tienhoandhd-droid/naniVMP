-- =====================================================================
-- TÌM KIẾM TRI THỨC BẰNG TOÀN VĂN (không cần API nhúng)
--
-- Bản đầu định dùng vector, nhưng node "Supabase Vector Store" của n8n
-- đòi credential kiểu supabaseApi mà tài khoản hiện chỉ có credential
-- Postgres. Quan trọng hơn: kho tri thức ở đây chỉ vài trăm đoạn tiếng
-- Việt có thuật ngữ rất riêng (IQ, OQ, PQ, Annex 15, LAF cân, điểm trọng
-- yếu). Với cỡ và loại nội dung này, tìm theo từ khoá + trigram cho kết
-- quả ngang hoặc hơn tìm theo vector, mà không cần gọi API nhúng, không
-- cần credential mới, không cần đường nạp riêng.
--
-- Cột embedding vẫn giữ nguyên trong bảng — khi nào kho lớn lên và tìm
-- theo từ khoá bắt đầu trượt thì bật vector lên, không phải đổi bảng.
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Bỏ dấu để "tham dinh" tìm được "thẩm định" ---------------------------
create or replace function public.vmp_khong_dau(t text)
returns text language sql immutable parallel safe
as $fn$ select lower(extensions.unaccent(coalesce(t, ''))) $fn$;

create index if not exists idx_kb_docs_trgm
  on public.vmp_kb_documents
  using gin (public.vmp_khong_dau(content) extensions.gin_trgm_ops);

-- Tra cứu: xếp hạng theo số từ khoá khớp, rồi tới độ giống trigram -----
create or replace function public.rpc_kb_search_text(
  p_query text,
  p_k integer default 6
) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_toks text[];
  v_q    text := public.vmp_khong_dau(p_query);
  v_res  jsonb;
begin
  select array_agg(t) into v_toks
  from (
    select distinct t from regexp_split_to_table(v_q, '[^a-z0-9]+') t
    where length(t) >= 3
      and t not in ('cho','cac','nhung','nao','bao','nhieu','the','nay','cua',
                    'mot','hai','voi','trong','ngoai','dang','chua','hay','toi',
                    'ban','lam','sao','gi','khi','duoc','phai','can','tai','va')
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
           'nguon', source, 'muc', heading, 'noi_dung', content,
           'diem', round(diem::numeric, 3)) order by diem desc), '[]'::jsonb)
  into v_res
  from (
    select d.metadata->>'source' as source,
           d.metadata->>'heading' as heading,
           d.content,
           -- Số từ khoá khớp là tín hiệu chính; độ giống trigram phá thế hoà
           (select count(*) from unnest(coalesce(v_toks, '{}')) tk
            where public.vmp_khong_dau(d.content) like '%'||tk||'%')
           + extensions.similarity(public.vmp_khong_dau(d.content), v_q) as diem
    from public.vmp_kb_documents d
    where v_toks is null
       or exists (select 1 from unnest(v_toks) tk
                  where public.vmp_khong_dau(d.content) like '%'||tk||'%')
    order by diem desc
    limit greatest(1, least(coalesce(p_k, 6), 20))
  ) t
  where diem > 0;

  return coalesce(v_res, '[]'::jsonb);
end;
$fn$;

revoke execute on function public.rpc_kb_search_text(text, integer) from anon, public;
grant  execute on function public.rpc_kb_search_text(text, integer)
  to authenticated, service_role;

comment on function public.rpc_kb_search_text(text, integer) is
  'Tra cứu tài liệu luật/GMP cho trợ lý hỏi đáp. Tìm theo từ khoá đã bỏ '
  'dấu + trigram — không cần API nhúng. Chỉ đọc.';

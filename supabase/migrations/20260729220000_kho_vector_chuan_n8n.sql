-- =====================================================================
-- KHO VECTOR THEO ĐÚNG HỢP ĐỒNG CỦA NODE "Supabase Vector Store" (n8n)
--
-- Node vector store của n8n quy ước sẵn: bảng có content / metadata /
-- embedding, và một hàm match_* nhận query_embedding + match_count +
-- filter. Làm đúng hợp đồng này thì cả nạp lẫn tra cứu dùng node có sẵn,
-- không phải tự viết chuỗi HTTP gọi API nhúng.
--
-- 768 chiều = Gemini text-embedding-004 (bản miễn phí).
--
-- Bảng vmp_kb_chunks ở migration trước bỏ không dùng — giữ lại vì có thể
-- cần nếu sau này tự nhúng ngoài n8n, nhưng đường chạy chính là bảng này.
-- =====================================================================

create table if not exists public.vmp_kb_documents (
  id        bigint generated always as identity primary key,
  content   text,
  metadata  jsonb default '{}'::jsonb,
  embedding extensions.vector(768)
);

create index if not exists idx_kb_docs_embedding
  on public.vmp_kb_documents
  using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 20);

create index if not exists idx_kb_docs_meta
  on public.vmp_kb_documents using gin (metadata);

alter table public.vmp_kb_documents enable row level security;

drop policy if exists kb_docs_read on public.vmp_kb_documents;
create policy kb_docs_read on public.vmp_kb_documents
  for select to authenticated using (true);

-- Hàm tra cứu đúng tên/tham số node n8n gọi mặc định -------------------
create or replace function public.match_vmp_kb(
  query_embedding extensions.vector(768),
  match_count integer default 6,
  filter jsonb default '{}'::jsonb
) returns table (
  id bigint, content text, metadata jsonb, similarity double precision
)
language sql stable
as $fn$
  select d.id, d.content, d.metadata,
         1 - (d.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.vmp_kb_documents d
  where d.embedding is not null
    and d.metadata @> coalesce(filter, '{}'::jsonb)
  order by d.embedding operator(extensions.<=>) query_embedding
  limit greatest(1, least(coalesce(match_count, 6), 30));
$fn$;

grant execute on function public.match_vmp_kb(extensions.vector, integer, jsonb)
  to authenticated, service_role;

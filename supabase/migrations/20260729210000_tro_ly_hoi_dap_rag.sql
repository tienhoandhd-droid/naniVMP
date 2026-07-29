-- =====================================================================
-- NỀN CHO TRỢ LÝ HỎI ĐÁP VMP
--
-- ---------------------------------------------------------------------
-- Vì sao KHÔNG dùng RAG vector cho mọi câu hỏi
--
-- Câu hỏi về timeline VMP chia làm hai loại khác hẳn nhau:
--
--   A. HỎI SỐ LIỆU — "còn bao nhiêu hạng mục quá hạn?", "ai phụ trách
--      HVAC-C1?", "thiết bị nào 9 điểm mà chưa làm?"
--
--   B. HỎI LUẬT   — "deadline đề cương tính thế nào?", "vì sao LAF cân
--      được 9 điểm?", "Annex 15 đòi gì?"
--
-- RAG vector chỉ đúng cho loại B. Với loại A nó SAI CÓ HỆ THỐNG: tìm
-- kiếm ngữ nghĩa lấy về k đoạn giống nhất (thường 5), nên hỏi "bao nhiêu
-- hạng mục quá hạn" trên 461 dòng thì mô hình chỉ nhìn thấy 5 dòng và
-- đếm ra 5. Câu trả lời nghe rất trôi chảy và sai hoàn toàn — kiểu sai
-- nguy hiểm nhất trong hệ GMP.
--
-- Nên tách hai đường:
--   · rpc_ai_context  — số liệu, tính bằng SQL trên TOÀN BỘ bảng
--   · rpc_kb_search   — luật, tìm bằng vector trên tài liệu
--
-- Mô hình nhận cả hai rồi soạn câu trả lời. Con số không do mô hình tự
-- đếm, mà do SQL đưa sang.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Kho tri thức cho phần hỏi LUẬT
-- ---------------------------------------------------------------------
create table if not exists public.vmp_kb_chunks (
  id          bigint generated always as identity primary key,
  source      text not null,               -- vd 'docs/rule-vmp01.md'
  heading     text,                         -- mục cha, để trích dẫn cho gọn
  ord         integer not null default 0,   -- thứ tự đoạn trong nguồn
  content     text not null,
  -- 768 chiều = Gemini text-embedding-004 (bản miễn phí)
  embedding   extensions.vector(768),
  updated_at  timestamptz not null default now(),
  unique (source, ord)
);

comment on table public.vmp_kb_chunks is
  'Đoạn tài liệu luật/GMP cho trợ lý hỏi đáp. CHỈ chứa tri thức tĩnh — '
  'số liệu timeline không nạp vào đây, xem chú thích đầu migration.';

-- Cosine distance. Danh sách nhỏ (vài trăm đoạn) nên ivfflat là đủ và
-- không cần tinh chỉnh lists nhiều.
create index if not exists idx_kb_chunks_embedding
  on public.vmp_kb_chunks using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 20);

create index if not exists idx_kb_chunks_source on public.vmp_kb_chunks (source);

alter table public.vmp_kb_chunks enable row level security;

drop policy if exists kb_chunks_read on public.vmp_kb_chunks;
create policy kb_chunks_read on public.vmp_kb_chunks
  for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- 2. Tìm đoạn luật gần nghĩa nhất
-- ---------------------------------------------------------------------
create or replace function public.rpc_kb_search(
  p_embedding extensions.vector(768),
  p_k integer default 6,
  p_min_score numeric default 0.30
) returns jsonb
language sql stable security definer set search_path = public
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'source', source, 'heading', heading, 'content', content,
           'score', round(score::numeric, 4)) order by score desc), '[]'::jsonb)
  from (
    select source, heading, content,
           1 - (embedding operator(extensions.<=>) p_embedding) as score
    from public.vmp_kb_chunks
    where embedding is not null
    order by embedding operator(extensions.<=>) p_embedding
    limit greatest(1, least(p_k, 20))
  ) t
  where score >= p_min_score;
$fn$;

-- ---------------------------------------------------------------------
-- 3. Số liệu thật cho phần hỏi SỐ LIỆU
--
-- Tính trên TOÀN BỘ bảng, không lấy mẫu. Mô hình chỉ việc diễn đạt lại,
-- không phải tự đếm.
--
-- p_question dùng để dò từ khoá: tách token dài ≥ 3 ký tự rồi so với mã,
-- tên, người phụ trách, khu vực, bộ phận. Dòng khớp nhiều token xếp trên.
-- Nhờ vậy hỏi "HVAC-C1 ai làm" thì đúng dòng đó nằm trong ngữ cảnh, chứ
-- không phụ thuộc may rủi của tìm kiếm ngữ nghĩa.
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_context(
  p_question text default null,
  p_year integer default null,
  p_row_limit integer default 25
) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_year  integer := coalesce(p_year, extract(year from now())::integer);
  v_toks  text[];
  v_limit integer := greatest(1, least(coalesce(p_row_limit, 25), 60));
  v_res   jsonb;
begin
  -- Tách từ khoá: bỏ dấu câu, giữ token ≥ 3 ký tự, bỏ hư từ hay gặp
  select array_agg(t) into v_toks
  from (
    select distinct lower(t) t
    from regexp_split_to_table(coalesce(p_question, ''), '[^[:alnum:]À-ỹ\-\.]+') t
    where length(t) >= 3
      and lower(t) not in ('cho','các','những','nào','bao','nhiêu','thế','này',
                           'của','một','hai','với','trong','ngoài','đang','đã',
                           'chưa','hãy','tôi','bạn','list','danh','sách','hạng',
                           'mục','thiết','bị','xem','biết','hỏi','giúp','được')
  ) s;

  select jsonb_build_object(
    'nam', v_year,
    'tinh_luc', now(),

    -- Tổng quan: đếm trên toàn bộ, không lấy mẫu
    'tong_quan', (
      select jsonb_build_object(
        'tong_hang_muc', count(*),
        'hoan_thanh',    count(*) filter (where computed_status = 'done'),
        'qua_han',       count(*) filter (where computed_status = 'over'),
        'dang_lam',      count(*) filter (where computed_status = 'prog'),
        'chua_bat_dau',  count(*) filter (where computed_status in ('todo','plan')),
        'ty_le_hoan_thanh_pct',
          round(100.0 * count(*) filter (where computed_status = 'done')
                / nullif(count(*), 0)),
        'thieu_ngay_hoan_thanh',
          count(*) filter (where status_vmp = 'completed' and actual_vmp_date is null),
        'thieu_deadline', count(*) filter (where deadline_vmp is null),
        'chua_co_qa',     count(*) filter (where owner_name is null))
      from vmp_plan_items where year = v_year and is_active),

    'theo_muc_trong_yeu', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'muc', muc, 'tong', tong,
               'hoan_thanh', xong, 'qua_han', tre) order by muc desc), '[]'::jsonb)
      from (
        select case when criticality_score >= 7 then '7-9 (cao)'
                    when criticality_score >= 4 then '4-6 (trung bình)'
                    else '1-3 (thấp)' end as muc,
               count(*) tong,
               count(*) filter (where computed_status = 'done') xong,
               count(*) filter (where computed_status = 'over') tre
        from vmp_plan_items
        where year = v_year and is_active and criticality_score is not null
        group by 1) t),

    'theo_nguoi_phu_trach', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'nguoi', nguoi, 'nhom', nhom, 'tong', tong,
               'hoan_thanh', xong, 'qua_han', tre) order by tong desc), '[]'::jsonb)
      from (
        select coalesce(owner_name, '(chưa phân công)') nguoi,
               min(work_group) nhom,
               count(*) tong,
               count(*) filter (where computed_status = 'done') xong,
               count(*) filter (where computed_status = 'over') tre
        from vmp_plan_items where year = v_year and is_active
        group by 1) t),

    'theo_loai_tham_dinh', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'loai', loai, 'tong', tong, 'hoan_thanh', xong)
             order by tong desc), '[]'::jsonb)
      from (
        select validation_type loai, count(*) tong,
               count(*) filter (where computed_status = 'done') xong
        from vmp_plan_items where year = v_year and is_active
        group by 1) t),

    -- Quá hạn lâu nhất — thứ tự ưu tiên xử lý
    'qua_han_nang_nhat', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object(
          'ma', p.validation_code, 'ten', o.name, 'loai', p.validation_type,
          'qa', p.owner_name, 'diem', p.criticality_score,
          'han', p.deadline_vmp,
          'tre_ngay', (current_date - p.deadline_vmp)) x
        from vmp_plan_items p join vmp_objects o on o.code = p.object_code
        where p.year = v_year and p.is_active and p.computed_status = 'over'
        order by p.criticality_score desc nulls last, p.deadline_vmp
        limit v_limit) t),

    'sap_den_han_30_ngay', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object(
          'ma', p.validation_code, 'ten', o.name, 'loai', p.validation_type,
          'qa', p.owner_name, 'diem', p.criticality_score, 'han', p.deadline_vmp,
          'con_ngay', (p.deadline_vmp - current_date)) x
        from vmp_plan_items p join vmp_objects o on o.code = p.object_code
        where p.year = v_year and p.is_active
          and p.computed_status <> 'done'
          and p.deadline_vmp between current_date and current_date + 30
        order by p.deadline_vmp
        limit v_limit) t),

    -- Dòng khớp từ khoá trong câu hỏi — phần quan trọng nhất khi người
    -- dùng hỏi về một thiết bị / một người cụ thể
    'dong_khop_cau_hoi', case when v_toks is null then '[]'::jsonb else (
      select coalesce(jsonb_agg(x order by (x->>'so_tu_khop')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'ma', p.validation_code, 'ma_doi_tuong', p.object_code, 'ten', o.name,
          'loai', p.validation_type, 'qa', p.owner_name, 'ho_tro', p.secondary_owner,
          'nhom', p.work_group, 'diem_trong_yeu', p.criticality_score,
          'bo_phan', o.department, 'khu_vuc', o.area, 'line', o.line,
          'tan_suat_thang', o.frequency_months,
          'han_de_cuong', p.deadline_protocol, 'han_bao_cao', p.deadline_report,
          'han_vmp', p.deadline_vmp,
          'trang_thai', p.status_vmp_text,
          'trang_thai_tinh', p.computed_status::text,
          'ngay_hoan_thanh', p.actual_vmp_date,
          'so_tu_khop', (
            select count(*) from unnest(v_toks) tk
            where lower(coalesce(o.name,'')) like '%'||tk||'%'
               or lower(coalesce(p.object_code,'')) like '%'||tk||'%'
               or lower(coalesce(p.validation_code,'')) like '%'||tk||'%'
               or lower(coalesce(p.owner_name,'')) like '%'||tk||'%'
               or lower(coalesce(p.work_group,'')) like '%'||tk||'%'
               or lower(coalesce(o.area,'')) like '%'||tk||'%'
               or lower(coalesce(o.department,'')) like '%'||tk||'%'
               or lower(coalesce(o.line,'')) like '%'||tk||'%')) x
        from vmp_plan_items p join vmp_objects o on o.code = p.object_code
        where p.year = v_year and p.is_active
          and exists (
            select 1 from unnest(v_toks) tk
            where lower(coalesce(o.name,'')) like '%'||tk||'%'
               or lower(coalesce(p.object_code,'')) like '%'||tk||'%'
               or lower(coalesce(p.validation_code,'')) like '%'||tk||'%'
               or lower(coalesce(p.owner_name,'')) like '%'||tk||'%'
               or lower(coalesce(p.work_group,'')) like '%'||tk||'%'
               or lower(coalesce(o.area,'')) like '%'||tk||'%'
               or lower(coalesce(o.department,'')) like '%'||tk||'%'
               or lower(coalesce(o.line,'')) like '%'||tk||'%')
        limit v_limit) t) end,

    'tu_khoa_da_dung', to_jsonb(coalesce(v_toks, '{}'::text[]))
  ) into v_res;

  return v_res;
end;
$fn$;

comment on function public.rpc_ai_context(text, integer, integer) is
  'Số liệu timeline cho trợ lý hỏi đáp. Tính trên TOÀN BỘ bảng nên con số '
  'luôn đúng — mô hình chỉ diễn đạt lại, không tự đếm. Chỉ đọc.';

-- Chỉ người đã đăng nhập mới hỏi được -----------------------------------
revoke execute on function public.rpc_ai_context(text, integer, integer) from anon, public;
revoke execute on function public.rpc_kb_search(extensions.vector, integer, numeric) from anon, public;
grant  execute on function public.rpc_ai_context(text, integer, integer) to authenticated, service_role;
grant  execute on function public.rpc_kb_search(extensions.vector, integer, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Nhật ký hỏi đáp — bắt buộc với hệ GMP
--
-- Trợ lý có thể trả lời sai. Không lưu lại câu hỏi và câu trả lời thì
-- không truy được nguồn gốc một quyết định sai, và cũng không cải thiện
-- được. Đây là yêu cầu ALCOA+ chứ không phải tính năng phụ.
-- ---------------------------------------------------------------------
create table if not exists public.vmp_ai_chat_log (
  id          bigint generated always as identity primary key,
  user_id     uuid,
  user_email  text,
  question    text not null,
  answer      text,
  sources     jsonb not null default '[]'::jsonb,
  model       text,
  latency_ms  integer,
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_ai_chat_log_time on public.vmp_ai_chat_log (created_at desc);

alter table public.vmp_ai_chat_log enable row level security;

drop policy if exists ai_chat_own on public.vmp_ai_chat_log;
create policy ai_chat_own on public.vmp_ai_chat_log
  for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from profiles pr
                    where pr.id = auth.uid() and pr.role in ('admin','qa_manager')));

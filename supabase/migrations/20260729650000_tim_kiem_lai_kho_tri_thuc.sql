-- =====================================================================
-- Tìm kiếm LAI cho kho tri thức của Vali
--
-- Kho tri thức (176 mảnh tài liệu trong vmp_kb_documents) đã có sẵn bảng,
-- cột vector và chỉ mục từ lâu — nhưng CHƯA MẢNH NÀO ĐƯỢC NHÚNG. Nghĩa
-- là Vali suốt thời gian qua trả lời hoàn toàn bằng SQL + mô hình, không
-- hề tra tài liệu. Nay đã nhúng đủ 176/176 (text-embedding-3-small, 768
-- chiều) nên cần một đường tra cứu.
--
-- Vì sao LAI chứ không chỉ vector: câu hỏi ở đây đầy mã và ký hiệu —
-- "CMTB308", "T-5-BC", "Annex 15", "rpc_update_progress". Tìm theo vector
-- rất giỏi bắt ý nhưng hay đánh rơi đúng những chuỗi ký tự đó; tìm theo
-- từ khoá thì ngược lại. Ghép hai đường bằng RRF (Reciprocal Rank Fusion)
-- lấy được cả hai mặt: mỗi đường xếp hạng riêng, điểm cuối là tổng
-- 1/(60 + thứ hạng). Không cần huấn luyện, không cần dịch vụ ngoài.
--
-- Trả kèm 'nguon' và 'muc' để Vali TRÍCH DẪN được. Trong môi trường GMP,
-- câu trả lời không truy được nguồn là câu trả lời không dùng được.
-- =====================================================================

create or replace function public.rpc_tim_tri_thuc(
  p_cau_hoi text,
  p_vector  text default null,   -- vector 768 chiều dạng '[0.1,...]'
  p_k       integer default 6
) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $fn$
declare
  v_kq jsonb;
  v_tu_khoa text := public.vmp_khong_dau(coalesce(p_cau_hoi, ''));
begin
  with
  -- Đường 1: ngữ nghĩa. Bỏ qua nếu không truyền vector (cho phép gọi thử
  -- chỉ bằng từ khoá).
  theo_vector as (
    select d.id, row_number() over (order by d.embedding <=> p_vector::vector) as hang
    from public.vmp_kb_documents d
    where p_vector is not null and d.embedding is not null
    order by d.embedding <=> p_vector::vector
    limit 30
  ),
  -- Đường 2: từ khoá, so trên bản đã bỏ dấu nên "tham dinh" khớp "thẩm định".
  -- Dùng word_similarity chứ không phải similarity: câu hỏi ngắn so với
  -- tài liệu dài thì similarity toàn văn luôn bé tí và rơi hết dưới ngưỡng.
  -- word_similarity đo "chữ trong câu hỏi có nằm gọn trong tài liệu không".
  theo_tu_khoa as (
    select d.id,
           row_number() over (order by word_similarity(v_tu_khoa, public.vmp_khong_dau(d.content)) desc) as hang
    from public.vmp_kb_documents d
    where v_tu_khoa <> ''
      and word_similarity(v_tu_khoa, public.vmp_khong_dau(d.content)) > 0.25
    order by word_similarity(v_tu_khoa, public.vmp_khong_dau(d.content)) desc
    limit 30
  ),
  gop as (
    select id, sum(diem) as diem from (
      select id, 1.0 / (60 + hang) as diem from theo_vector
      union all
      select id, 1.0 / (60 + hang) as diem from theo_tu_khoa
    ) t group by id
  )
  select coalesce(jsonb_agg(x order by x.diem desc), '[]'::jsonb) into v_kq
  from (
    select d.id,
           round(g.diem::numeric, 5) as diem,
           coalesce(d.metadata ->> 'source', 'không rõ nguồn') as nguon,
           coalesce(d.metadata ->> 'heading', '') as muc,
           left(d.content, 1200) as noi_dung
    from gop g join public.vmp_kb_documents d on d.id = g.id
    order by g.diem desc
    limit greatest(1, least(p_k, 12))
  ) x;

  return jsonb_build_object(
    'ok', true,
    'so_manh', jsonb_array_length(v_kq),
    -- Điểm RRF cao nhất: Vali dùng nó để quyết định có đủ căn cứ trả lời
    -- hay phải nói là chưa tra được.
    'diem_cao_nhat', coalesce((v_kq -> 0 ->> 'diem')::numeric, 0),
    'manh', v_kq
  );
end;
$fn$;

revoke execute on function public.rpc_tim_tri_thuc(text, text, integer) from public, anon;
grant execute on function public.rpc_tim_tri_thuc(text, text, integer) to authenticated, service_role;

comment on function public.rpc_tim_tri_thuc(text, text, integer) is
  'Tìm kiếm lai (vector + từ khoá, hợp nhất bằng RRF) trên kho tri thức VMP. Trả kèm nguồn và mục để trích dẫn.';

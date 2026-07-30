-- Chip trích dẫn = đúng mảnh tài liệu mà mô hình ĐÃ DÙNG.
--
-- Trước đây chip sinh từ một truy vấn SQL riêng chạy cho MỌI câu hỏi
-- (node "Lấy nguồn trích dẫn"): câu số liệu cũng hiện chip tài liệu,
-- và chip hay tạp (HANDOVER.md lọt vào câu hỏi luật) vì nó không biết
-- mô hình thật sự tra gì. Nay sub-workflow rerank LƯU TẠM các mảnh đạt
-- điểm vào bảng này theo phiên; node Nhật ký tiêu (delete-returning)
-- khi dựng câu trả lời. Không gọi tool tài liệu thì không có chip — im
-- lặng đúng lúc cũng là một loại chính xác.
create table if not exists public.vmp_ai_trich_dan_tam (
  id bigint generated always as identity primary key,
  phien text not null default '',
  trich jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_trich_dan_tam_phien on public.vmp_ai_trich_dan_tam (phien, created_at);
-- Chỉ đường nội bộ (role postgres của n8n) đụng vào; RLS bật, không policy.
alter table public.vmp_ai_trich_dan_tam enable row level security;

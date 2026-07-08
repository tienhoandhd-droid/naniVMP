-- =====================================================================
--  Index hiệu năng cho watermark poll + tra cứu "latest completed run"
--  ---------------------------------------------------------------------
--  Đo trên production (2026-07-09):
--   • rpc_get_vmp_watermark: max(updated_at) trên vmp_objects = Seq Scan ~22ms
--     (chạy mỗi 20s cho MỖI tab đang mở) → thêm index updated_at.
--   • rpc_get_vmp_dashboard + wrapper: latest_run = Seq Scan trên
--     vmp_sheet_sync_runs; bảng này TĂNG VÔ HẠN (mỗi sync +1 run, đã 201) →
--     thêm index (status, created_at desc) để luôn O(log n).
--
--  Bảng nhỏ (<500 dòng) nên CREATE INDEX khoá vài ms, không cần CONCURRENTLY.
-- =====================================================================

-- Watermark: max(updated_at) → index desc phục vụ trực tiếp, bỏ seq scan.
create index if not exists idx_vmp_objects_updated_at
  on public.vmp_objects (updated_at desc);

create index if not exists idx_vmp_plan_items_year_updated_at
  on public.vmp_plan_items (year, updated_at desc);

-- latest_run: where status='completed' order by created_at desc limit 1.
create index if not exists idx_vmp_sync_runs_status_created
  on public.vmp_sheet_sync_runs (status, created_at desc);

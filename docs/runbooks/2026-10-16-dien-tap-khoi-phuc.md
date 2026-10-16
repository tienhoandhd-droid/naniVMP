# Hồ sơ diễn tập khôi phục sao lưu — 16/10/2026

**Mục đích:** bằng chứng dữ liệu production khôi phục được từ bản sao lưu
(EU GMP Annex 11 §7.2 — sao lưu phải được kiểm khả năng khôi phục).

**Cách làm** (quy trình chi tiết: memory/công cụ kiểm thử cục bộ, mục "Bản sao production"):

1. `pg_dump` production (schema `public` + `cpc1_private`, có dữ liệu) bằng
   `postgres:17-alpine` — chỉ đọc.
2. Khôi phục vào container `pgvector/pgvector:pg17` sạch, sau khi tạo schema
   `auth`/`extensions`, các role Supabase và shim `auth.uid()`/`auth.role()`/`auth.jwt()`.
3. Đối chiếu số dòng bằng `count(*)` (không dùng `n_live_tup` — chỉ là ước lượng).

**Kết quả:** khôi phục thành công **2 lần** (bản sao `vmp-thu-1016` và
`vmp-thu-1016b`). Số dòng khớp production, ví dụ `vmp_plan_items` 461,
`vmp_ai_hoi_thoai` 392, `vmp_source_rows` 1037, `workflow_runs` 2148. Trên bản
khôi phục đã áp và kiểm 8 migration theo 4 vai (xem
`2026-10-16-ap-migration-ton-dong.md`). Container và file dump đã xoá sau khi kiểm.

**Giới hạn — chưa phải diễn tập đầy đủ:**
- Khôi phục `public` + `cpc1_private`; `auth.users` dựng tối giản (id, email),
  không khôi phục mật khẩu/phiên; Storage (file mẫu in, PDF) không nằm trong dump.
- Chưa diễn tập khôi phục PITR của chính Supabase — **[CHỦ DỰ ÁN]** kiểm gói
  Supabase có PITR không, thời gian lưu giữ bao lâu.

**Bản sao lưu ngoài Supabase hiện có:** `/home/admin1/VMP/.backups/truoc-ap-8-migration-20261016-112428.sql`
(93 MB, quyền 600, trên máy này — **không** phải nơi lưu trữ lâu dài; nên chuyển
sang kho được QA quản lý).

# Runbook — Đóng 6 bảng policy fallback-true + lọc phạm vi team summary (20260831180000)

**Phạm vi:** thay policy SELECT của 6 bảng (`vmp_staff_emails`, `vmp_email_cho_phep`, `vmp_source_rows`, `data_quality_issues`, `vmp_assignment_matrix`, `vmp_chat_loi_cho`), thêm helper `vmp_la_vai(text[])`, redefine `rpc_team_overview_summary`.
**Rủi ro:** trung bình — SIẾT quyền đọc. Ai đang thuộc vai bị siết sẽ thấy panel liên quan RỖNG (không lỗi — RLS lọc dòng chứ không ném). Đối chiếu bảng vai trong đầu file migration trước khi áp; muốn nới thì sửa mảng vai TRONG migration, đừng nới sau khi áp bằng tay.

## 0 · Điều kiện tiên quyết

- Hardening 20260824 + enforce 20260828 đã áp (migration tự kiểm).
- `vmp_visible_plan_items()` tồn tại và trả `setof vmp_plan_items` (migration tự kiểm — hàm này sống ở production, chưa có trong repo).

## 1 · Preflight (read-only)

```sql
begin read only;
select tablename, policyname, qual from pg_policies
where schemaname='public' and tablename in
 ('vmp_staff_emails','vmp_email_cho_phep','vmp_source_rows',
  'data_quality_issues','vmp_assignment_matrix','vmp_chat_loi_cho')
order by tablename;
rollback;
```

Ghi lại kết quả vào hồ sơ áp dụng (bằng chứng trạng thái TRƯỚC). Kỳ vọng: các policy hiện tại có `qual` chứa `vmp_current_session_is_active()` với phần điều kiện gốc rút gọn true.

## 2 · Apply

```bash
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 \
  -c "set lock_timeout='3s'" \
  -f supabase/migrations/20260831180000_close_true_policies.sql
```

## 3 · Postflight probe theo persona (QUYẾT ĐỊNH ĐẠT/KHÔNG)

Với một JWT `workshop_staff` còn sống (curl REST):

```
GET {SUPABASE_URL}/rest/v1/vmp_staff_emails?select=staff_email&limit=1
→ kỳ vọng: [] (RỖNG — trước bản vá trả cả danh bạ)
GET {SUPABASE_URL}/rest/v1/vmp_source_rows?select=id&limit=1
→ kỳ vọng: []
POST {SUPABASE_URL}/rest/v1/rpc/rpc_team_overview_summary {"p_year":2026}
→ kỳ vọng: total CHỈ bằng số hạng mục trong phạm vi của người đó
  (so với admin gọi cùng RPC phải ra total toàn nhà máy)
```

Với JWT `qa_manager`: `vmp_staff_emails` phải CÓ dữ liệu (AiMailModal còn chạy).
Với JWT `admin`: `vmp_email_cho_phep` phải CÓ dữ liệu (màn Vai trò & phạm vi).

## 4 · Reload PostgREST + kiểm màn

`notify pgrst, 'reload schema';` → mở màn Cảnh báo (nút soạn mail AI, vai QA quản lý) và màn Vai trò & phạm vi (admin) — hai chỗ ăn trực tiếp 2 bảng PII.

## 5 · Việc kéo theo (bắt buộc, sau khi ĐẠT)

1. Chu trình bằng chứng five-role: chạy lại bộ `tests/sql` trên clone local theo quy trình hiện có rồi niêm phong lại receipt — `rpc_team_overview_summary` giờ đọc `vmp_visible_plan_items()` nên phép kiểm "unfiltered secdef item readers" phải nhận nó là reader ĐÃ LỌC (đối chiếu allowlist trong `20260828150000:3540+`).
2. `npm run gen:types` để types biết helper mới (không bắt buộc cho frontend hiện tại).

## 6 · Forward recovery

Fail trước COMMIT → không đổi gì. Cần lùi TỪNG PHẦN sau COMMIT (một vai bị siết oan):
- Nới lại một bảng: `drop policy <tên> on <bảng>; create policy ... using (public.vmp_la_vai(array['admin','qa_manager','qa_staff','workshop_manager','workshop_staff']));` — ghi lý do vào hồ sơ sự cố.
- Trả summary về bản cũ: áp lại thân hàm trong `20260829150000_team_overview_summary.sql`.

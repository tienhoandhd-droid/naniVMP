# SECURITY.md — VMP Monitor

## Nguyên tắc bảo mật

### 1. Không lộ secret ở frontend
- **BẮT BUỘC**: Mọi biến `VITE_` đều nhúng vào JS công khai. KHÔNG đặt:
  - API key (OpenAI, Anthropic, Google...)
  - Supabase service role key
  - Mật khẩu, token ghi dữ liệu
  - Webhook secret
- Chỉ dùng `VITE_SUPABASE_ANON` (anon key — an toàn cho frontend)

### 2. Xác thực
- **Supabase Auth** là phương thức duy nhất. Đã loại bỏ hoàn toàn cơ chế mật khẩu admin tạm (`VITE_TEMP_ADMIN_PASS`)
- JWT token được gửi kèm mọi request ghi dữ liệu
- Session quản lý bởi Supabase SDK (auto refresh, persist)

### 3. Phân quyền (RBAC)

| Vai trò | Quyền |
|---------|-------|
| `admin` | Toàn quyền: cấu hình, sửa deadline, phân công, duyệt, xoá |
| `qa_manager` | Gần như admin: sửa deadline, duyệt báo cáo |
| `department_user` | Cập nhật tiến độ hạng mục thuộc bộ phận mình |
| `viewer` | Chỉ xem dashboard và báo cáo |

- Phân quyền thực thi bằng **Supabase RLS** (Row Level Security) ở backend
- Frontend ẩn nút nhưng **backend vẫn kiểm tra quyền thật**
- n8n webhook kiểm tra JWT token trước khi ghi

### 4. Webhook n8n

| Loại | Bảo mật |
|------|---------|
| Webhook đọc (GET) | Giới hạn `allowedOrigins` = GitHub Pages domain |
| Webhook ghi (POST) | Yêu cầu `Authorization: Bearer <jwt>` |
| Webhook AI report | Yêu cầu `Authorization: Bearer <jwt>` |

- Mọi webhook ghi validate payload đầu vào
- Chặn ghi nếu thiếu user, thiếu quyền, payload không hợp lệ
- Ghi audit log cho mọi thao tác thành công

### 5. AI Report
- OpenAI API key **chỉ ở n8n backend**, KHÔNG ở frontend
- Frontend gọi n8n webhook, n8n gọi OpenAI
- Kết quả AI gắn nhãn "BẢN NHÁP AI — Cần QA xác nhận"
- Lưu snapshot báo cáo AI vào Supabase (traceability)

### 6. Audit Trail
- Bảng `audit_logs` chỉ INSERT, không UPDATE/DELETE (immutable)
- **Ghi TẬP TRUNG qua DB trigger** — frontend KHÔNG tự ghi audit
  - Trigger `audit_vmp_plan_items_v2` cho bảng `vmp_plan_items`
  - Trigger `trg_audit_objects` cho bảng `vmp_objects`
- Mỗi bản ghi audit có: `validation_code`, `changed_fields`, `change_reason`, old/new data, người sửa, thời gian, nguồn
- Lý do (`change_reason`) **bắt buộc** khi đánh dấu hoàn thành hoặc sửa ngày hoàn thành (RPC kiểm tra)
- Nguồn (`source`): dashboard_rpc / n8n_webhook / google_sheet_sync / admin_resolve_missing

### 7. Xử lý sự cố

| Sự cố | Xử lý |
|-------|-------|
| Phát hiện secret bị lộ | Rotate key ngay. Rà soát Git history. |
| Webhook bị spam | Thêm rate limiting trong n8n hoặc reverse proxy |
| User bị compromise | Disable trong Supabase Auth. RLS tự chặn. |
| Dữ liệu bị sửa sai | Dùng audit log để xác minh và rollback |

### 8. Dependency
- `xlsx@0.18.5` có CVE-2024-22363 — **không dùng để đọc file từ người dùng**
  - Chỉ dùng để **xuất** dữ liệu (export)
  - Xem xét thay bằng ExcelJS hoặc CSV export nếu cần import
- Chạy `npm audit` định kỳ

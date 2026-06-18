# HƯỚNG DẪN CÀI ĐẶT TỪ ĐẦU — VMP Monitor (Trên Web)

> Hướng dẫn này dành cho người cài lần đầu, **làm hoàn toàn trên trình duyệt**, không cần dùng dòng lệnh.
> Thứ tự: Supabase → n8n → GitHub Pages. Làm đúng thứ tự này.

---

## TỔNG QUAN 3 phần cần cài

| Phần | Vai trò | Thời gian |
|------|---------|-----------|
| 1. Supabase | Cơ sở dữ liệu + đăng nhập + bảo mật | ~20 phút |
| 2. n8n | Đồng bộ Sheet, gửi cảnh báo, AI report | ~25 phút |
| 3. GitHub Pages | Giao diện web cho QA dùng | ~15 phút |

Bạn cần chuẩn bị sẵn: 1 tài khoản Google (cho Sheet), 1 tài khoản GitHub, 1 file Google Sheet chứa dữ liệu VMP.

---

# PHẦN 1 — SUPABASE (cơ sở dữ liệu)

## 1.1. Tạo project
1. Vào https://supabase.com → **Sign in** bằng GitHub.
2. Bấm **New project**.
3. Điền: tên project (ví dụ `vmp-monitor`), đặt **Database Password** (lưu lại password này — sẽ cần cho n8n).
4. Chọn Region gần nhất (Singapore cho VN).
5. Bấm **Create new project**, chờ ~2 phút.

## 1.2. Chạy 7 file SQL (tạo bảng + bảo mật)
1. Menu trái → **SQL Editor** → **New query**.
2. Mở file `sql/001_schema.sql` trong máy (bằng Notepad), copy toàn bộ, dán vào ô SQL Editor.
3. Bấm **Run** (góc dưới phải). Chờ báo "Success".
4. **Lặp lại** cho từng file theo ĐÚNG thứ tự:
   - `001_schema.sql`
   - `002_rls_policies.sql`
   - `003_production_hardening.sql`
   - `004_validation_code_audit_rpc.sql`
   - `005_gmp_hardening.sql`
   - `006_sheet_source_dashboard_rpc.sql`
   - `007_enable_realtime.sql`

> ⚠️ Phải chạy đủ 7 file, đúng thứ tự. Mỗi file Run xong mới sang file kế.
> Nếu file 007 báo lỗi "publication does not exist", bỏ qua — sẽ bật Realtime thủ công ở bước 1.4.

## 1.3. Tạo tài khoản admin đầu tiên
1. Menu trái → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Điền Email + Password cho admin (ví dụ `admin@cpc1hn.vn`). Tích **Auto Confirm User**.
3. Bấm **Create user**. Copy lại **User UID** (chuỗi dài dạng `a1b2c3...`).
4. Quay lại **SQL Editor** → New query → dán đoạn sau (thay UID và email của bạn):
   ```sql
   INSERT INTO profiles (id, full_name, email, role, department)
   VALUES ('DÁN_UID_VÀO_ĐÂY', 'Quản trị viên', 'admin@cpc1hn.vn', 'admin', 'qa');
   ```
5. Bấm **Run**.

## 1.4. Bật Realtime (để web tự cập nhật)
1. Menu trái → **Database** → **Replication**.
2. Tìm publication `supabase_realtime` → bấm vào số bảng.
3. Bật (toggle) cho bảng **vmp_plan_items** và **vmp_objects**.

## 1.5. Lấy 2 khóa cần thiết (ghi ra giấy)
Menu trái → **Project Settings** (bánh răng) → **API**:
- **Project URL** → đây là `SUPABASE_URL` (dạng `https://xxxx.supabase.co`)
- **anon public** key → đây là `SUPABASE_ANON_KEY` (chuỗi `eyJ...` rất dài)

Vào **Project Settings** → **Database** → mục **Connection string** → tab **URI**:
- Copy chuỗi `postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres` → đây là **Postgres connection** cho n8n (thay `[YOUR-PASSWORD]` bằng password ở bước 1.1).

✅ **Kết thúc Phần 1.** Bạn đã có: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, Postgres connection string, 1 tài khoản admin.

---

# PHẦN 2 — n8n (đồng bộ & tự động hóa)

> Bạn có thể dùng n8n Cloud (https://n8n.io) hoặc n8n tự host. Hướng dẫn áp dụng cho cả hai.

## 2.1. Tạo 3 Credentials
Menu trái n8n → **Credentials** → **Add credential**:

**a) Postgres (Supabase):**
- Chọn loại **Postgres**.
- Host: `db.xxx.supabase.co` (phần giữa của connection string)
- Database: `postgres` · User: `postgres` · Password: password bước 1.1 · Port: `5432`
- SSL: **bật** (Supabase yêu cầu SSL).
- Bấm **Save**. Ghi lại tên credential.

**b) Google Service Account (cho Sheet):**
- Trước tiên tạo Service Account: vào https://console.cloud.google.com → tạo project → **APIs & Services** → bật **Google Sheets API** → **Credentials** → **Create Credentials** → **Service Account** → tạo xong vào tab **Keys** → **Add Key** → **JSON** → tải file về.
- Mở Google Sheet của bạn → **Share** → dán email của Service Account (dạng `xxx@xxx.iam.gserviceaccount.com`) với quyền **Editor**.
- Trong n8n: Add credential → **Google Service Account** → dán nội dung file JSON. **Save**.

**c) OpenAI:**
- Add credential → **OpenAI** → dán API key (`sk-...`). **Save**.

## 2.2. Đặt biến môi trường n8n
n8n Cloud: **Settings** → **Variables** (hoặc Environments). Tự host: sửa file `.env` của n8n. Thêm:
```
ALLOWED_ORIGINS=https://TÊN-GITHUB.github.io
GOOGLE_SHEET_ID=<ID Google Sheet của bạn>
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
QA_ALERT_EMAIL=qa@cpc1hn.vn
```
> `GOOGLE_SHEET_ID` lấy từ URL Sheet: `docs.google.com/spreadsheets/d/`**`<phần này>`**`/edit`

## 2.3. Import 4 workflows
Menu trái → **Workflows** → **Add workflow** → góc phải **⋮** → **Import from File**. Lần lượt import:
- `n8n-workflows/WF-01-sync-sheet-to-supabase.json`
- `n8n-workflows/WF-02-deadline-alerts.json`
- `n8n-workflows/WF-03-ai-report.json`
- `n8n-workflows/WF-04-mirror-to-sheet.json`

## 2.4. Gắn Credential vào từng node
Mỗi workflow vừa import, các node Postgres/Google Sheets/OpenAI sẽ báo "credential not set". Mở từng node:
- Node màu Postgres → chọn credential Postgres đã tạo.
- Node Google Sheets → chọn Google Service Account.
- Node OpenAI → chọn OpenAI.
- Lưu workflow.

## 2.5. Bật (Activate) workflows
Gạt nút **Active** (góc phải mỗi workflow) cho cả 4. Riêng WF-03 và WF-04 là webhook — sau khi Active, bấm vào node Webhook để **copy Production URL**:
- WF-04 → URL dạng `.../webhook/vmp-write` → đây là **N8N_WRITE_URL**
- WF-03 → URL dạng `.../webhook/vmp-ai-report` → đây là **N8N_AI_REPORT_URL**

## 2.6. Chạy thử WF-01 lần đầu (nạp dữ liệu từ Sheet vào Supabase)
Mở WF-01 → bấm **Execute Workflow** (chạy tay 1 lần). Kiểm tra Supabase → Table Editor → `vmp_plan_items` đã có dữ liệu.

✅ **Kết thúc Phần 2.** Bạn đã có: `N8N_WRITE_URL`, `N8N_AI_REPORT_URL`, dữ liệu đã vào Supabase.

---

# PHẦN 3 — GITHUB PAGES (giao diện web)

## 3.1. Đưa mã nguồn lên GitHub
1. Vào https://github.com → **New repository** → đặt tên (ví dụ `vmp-monitor`) → **Public** → **Create**.
2. Trên trang repo trống → bấm **uploading an existing file**.
3. Giải nén thư mục dự án, kéo thả TẤT CẢ file/thư mục vào (trừ `node_modules`, `dist`).
4. Bấm **Commit changes**.

## 3.2. Đặt biến môi trường (GitHub Variables)
1. Trong repo → **Settings** → **Secrets and variables** → **Actions** → tab **Variables** → **New repository variable**.
2. Tạo lần lượt 5 biến (Name → Value):

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON` | `eyJ...` (anon key) |
| `VITE_VMP_READ_URL` | (để trống — web đọc thẳng Supabase) |
| `VITE_N8N_WRITE_URL` | URL WF-04 (`.../webhook/vmp-write`) |
| `VITE_N8N_AI_REPORT_URL` | URL WF-03 (`.../webhook/vmp-ai-report`) |

> ⚠️ TUYỆT ĐỐI KHÔNG tạo biến chứa OpenAI key, password, hay service role. Chúng chỉ nằm ở n8n.

## 3.3. Bật GitHub Pages
1. Repo → **Settings** → **Pages**.
2. Mục **Build and deployment** → Source → chọn **GitHub Actions**.
3. Repo đã có sẵn file `.github/workflows/deploy.yml` → vào tab **Actions** → nếu chưa chạy, bấm **Run workflow**.
4. Chờ workflow chạy xong (dấu ✓ xanh) ~2-3 phút.

## 3.4. Truy cập web
Địa chỉ web: `https://TÊN-GITHUB.github.io/vmp-monitor/`
- Đăng nhập bằng tài khoản admin tạo ở bước 1.3.
- Dashboard hiện dữ liệu đọc trực tiếp từ Supabase.

✅ **Kết thúc Phần 3.** Hệ thống đã chạy.

---

# KIỂM TRA SAU CÀI ĐẶT (10 phút)

| Kiểm tra | Cách làm | Kết quả đúng |
|----------|----------|--------------|
| Đăng nhập | Mở web, login admin | Vào được dashboard |
| Đọc dữ liệu | Xem trang Tổng quan | Hiện số hạng mục từ Sheet |
| Cập nhật tiến độ | Vào "Cập nhật tiến độ" → sửa 1 mã → Lưu | Toast "Đã lưu (Supabase + Google Sheet)" |
| Dual-write | Mở Google Sheet | Dòng vừa sửa đã đổi trên Sheet |
| Realtime | Sửa 1 dòng trực tiếp trên Sheet → chờ WF-01 chạy (hoặc Execute tay) | Web tự cập nhật không cần F5 |
| Audit | Vào trang "Audit log" | Thấy bản ghi thao tác vừa làm |
| AI report | Vào "Báo cáo & AI" → tạo báo cáo | Nhận nhận xét, có nhãn "BẢN NHÁP AI" |
| Bảo mật | Mở DevTools (F12) → Sources → tìm "sk-" | KHÔNG tìm thấy key nào |

---

# XỬ LÝ SỰ CỐ THƯỜNG GẶP

**Web trắng trang / lỗi đăng nhập:** Kiểm tra `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON` đã đúng chưa. Sửa Variable → chạy lại Actions.

**Đăng nhập báo "chưa cấu hình Supabase":** Hai biến Supabase chưa được set khi build. Vào Actions → Run workflow lại.

**Cập nhật web không về Sheet (toast vàng cảnh báo):** Kiểm tra WF-04 đã Active và `VITE_N8N_WRITE_URL` đúng. Kiểm tra Service Account đã được Share quyền Editor trên Sheet.

**Dashboard không tự cập nhật:** Realtime chưa bật (bước 1.4). Web vẫn đồng bộ sau tối đa 2 phút nhờ polling dự phòng.

**WF-01 không nạp dữ liệu:** Kiểm tra `GOOGLE_SHEET_ID` đúng, Service Account có quyền đọc Sheet, tên sheet trong file là `VMP` (sửa node "Read Sheet" nếu sheet của bạn tên khác).

**AI report lỗi 401:** Token hết hạn — đăng xuất/đăng nhập lại. Hoặc kiểm tra WF-03 có biến `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

# VMP Monitor v2.1 — Hệ thống Giám sát Kế hoạch Thẩm định Gốc

> **CPC1 Hà Nội · V/Q Team — QLCL**
> React + Vite + Supabase + n8n + OpenAI

## Mục tiêu

Theo dõi tiến độ thẩm định thiết bị/hệ thống theo VMP (Validation Master Plan) trong nhà máy dược phẩm, bao gồm:
- Tiến độ thẩm định thực tế & hoàn thiện hồ sơ
- Cảnh báo tới hạn, quá hạn, lệch pha
- Dashboard tổng quan tuần/tháng/quý
- Báo cáo AI (OpenAI qua n8n backend)
- Audit trail theo chuẩn ALCOA+
- Phân quyền 4 cấp (admin/qa_manager/department_user/viewer)

## Kiến trúc

```
┌─────────────┐     ┌──────────┐     ┌───────────────┐
│  Frontend   │────►│   n8n    │────►│  Supabase     │
│ React+Vite  │     │ Workflows│     │  PostgreSQL   │
│ GitHub Pages│◄────│ Webhooks │◄────│  Auth + RLS   │
└─────────────┘     └──────────┘     └───────────────┘
                         │
                    ┌────┴────┐
                    │ OpenAI  │  (API key chỉ ở n8n)
                    │ Google  │  (Service Account)
                    │ Sheets  │
                    └─────────┘
```

## Cài đặt nhanh

> 📘 **Cài lần đầu?** Đọc [SETUP_FROM_SCRATCH.md](SETUP_FROM_SCRATCH.md) — hướng dẫn từng bước trên web, không cần dòng lệnh.

### 1. Supabase
```bash
# Chạy migrations THEO THỨ TỰ (quan trọng!)
psql $DATABASE_URL -f sql/001_schema.sql
psql $DATABASE_URL -f sql/002_rls_policies.sql
psql $DATABASE_URL -f sql/003_production_hardening.sql
psql $DATABASE_URL -f sql/004_validation_code_audit_rpc.sql
psql $DATABASE_URL -f sql/005_gmp_hardening.sql
psql $DATABASE_URL -f sql/006_sheet_source_dashboard_rpc.sql
psql $DATABASE_URL -f sql/007_enable_realtime.sql

# Tạo user admin
# → Supabase Dashboard → Authentication → Add user
# → INSERT vào bảng profiles (role='admin')
```

⚠️ **BẮT BUỘC chạy đủ 6 migrations.** Nếu thiếu 004-006:
- Không có `validation_code` → sync lỗi
- Không có `rpc_update_progress` → cập nhật web lỗi
- Không có `rpc_get_vmp_dashboard` → dashboard không đọc được Supabase
- Audit trail không hoạt động

### 2. n8n
```bash
# Import 4 workflows
# → n8n UI → Import from file
#   n8n-workflows/WF-01-sync-sheet-to-supabase.json
#   n8n-workflows/WF-02-deadline-alerts.json
#   n8n-workflows/WF-03-ai-report.json
#   n8n-workflows/WF-04-write-webhook.json

# Cấu hình Credentials:
#   - Postgres: Supabase connection string
#   - Google Service Account: JSON key
#   - OpenAI: API key
```

### 3. Frontend
```bash
# Clone & cài đặt
git clone <repo-url>
cd vmp-monitor
npm ci

# Cấu hình
cp .env.example .env
# Sửa .env: điền VITE_SUPABASE_URL, VITE_SUPABASE_ANON, webhook URLs

# Build & preview
npm run build
npm run preview
```

### 4. Deploy GitHub Pages
```bash
# GitHub Actions sẽ tự build khi push
# Hoặc deploy thủ công:
npm run build
# Upload dist/ lên GitHub Pages
```

## Biến môi trường

| Biến | Vị trí | Mô tả |
|------|--------|-------|
| `VITE_SUPABASE_URL` | Frontend (.env) | Supabase project URL |
| `VITE_SUPABASE_ANON` | Frontend (.env) | Supabase anon key (an toàn) |
| `VITE_VMP_READ_URL` | Frontend (.env) | n8n webhook đọc dữ liệu |
| `VITE_N8N_WRITE_URL` | Frontend (.env) | n8n webhook ghi (có JWT) |
| `VITE_N8N_AI_REPORT_URL` | Frontend (.env) | n8n webhook AI report |
| `OPENAI_API_KEY` | **n8n ONLY** | OpenAI API key |
| `SUPABASE_DB_URL` | **n8n ONLY** | Postgres connection |
| `GOOGLE_SERVICE_ACCOUNT` | **n8n ONLY** | Google Sheets API |

⚠️ **Không bao giờ đặt API key, service role, hay mật khẩu vào biến VITE_**

## Bảo mật
Xem [SECURITY.md](SECURITY.md) để biết chi tiết.

## Triển khai
Xem [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) để có checklist đầy đủ.

## Thay đổi
Xem [CHANGELOG.md](CHANGELOG.md) để biết lịch sử thay đổi.

## Cấu trúc mã nguồn

```
src/
├── App.jsx                    # Shell chính + Login + Overview + Reports
├── constants/
│   ├── theme.js               # Design tokens
│   └── vmp.js                 # Domain constants
├── utils/helpers.js           # Pure functions
├── hooks/index.js             # useAuth, useVmpData, useDebounce
├── components/
│   ├── ui/Primitives.jsx      # 20+ UI components
│   └── layout/Layout.jsx      # Sidebar + Topbar
├── pages/
│   ├── TimelinePage.jsx       # Gantt chart
│   ├── AlertsPage.jsx         # Cảnh báo tới hạn/quá hạn
│   ├── QrmPage.jsx            # Ma trận rủi ro (ICH Q9)
│   ├── InventoryPage.jsx      # Danh mục đối tượng
│   ├── UpdatePage.jsx         # Cập nhật tiến độ
│   └── WorkloadPage.jsx       # Ma trận tải công việc
├── lib/
│   ├── config.js              # Cấu hình localStorage
│   ├── n8nAdapter.js          # Adapter n8n webhook
│   └── supabaseClient.js      # Supabase Auth + audit
sql/
├── 001_schema.sql             # 14 bảng PostgreSQL
├── 002_rls_policies.sql       # Row Level Security
└── 003_production_hardening.sql # Validate, RPCs, AI cache
n8n-workflows/
├── WF-01-sync-sheet-to-supabase.json
├── WF-02-deadline-alerts.json
├── WF-03-ai-report.json
└── WF-04-write-webhook.json
```

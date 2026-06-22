# UPLOAD THƯ MỤC WEB NÀY LÊN GITHUB → CHẠY NGAY

> Thư mục này là **GỐC repo** (web không nằm trong thư mục con). Đã có sẵn
> GitHub Actions (`.github/workflows/deploy.yml`) để tự build + deploy GitHub Pages.

## Các bước
1. **Tạo/dùng 1 repo GitHub.** Nếu repo đã có web cũ: xoá hết nội dung cũ rồi up cái này
   (hoặc tạo repo mới).
2. **Up TOÀN BỘ nội dung trong thư mục này lên GỐC repo** — gồm cả thư mục ẩn `.github/`,
   `src/`, `package.json`, `package-lock.json`, `vite.config.js`, `index.html`…
   - Dùng Git (khuyên dùng, giữ được thư mục ẩn):
     ```bash
     cd vmp-web
     git init && git add -A && git commit -m "VMP web"
     git branch -M main
     git remote add origin https://github.com/<bạn>/<repo>.git
     git push -u origin main
     ```
   - Nếu up bằng giao diện web GitHub: nhớ kéo cả thư mục `.github` (nếu bị ẩn,
     tạo thủ công file `.github/workflows/deploy.yml` rồi dán nội dung từ file này).
3. **Bật Pages:** repo → **Settings → Pages → Source = GitHub Actions** → Save.
4. **Khai báo biến (BẮT BUỘC):** repo → **Settings → Secrets and variables → Actions
   → tab _Variables_** (KHÔNG phải Secrets) → **New repository variable**:
   - `VITE_SUPABASE_URL` = Project URL (Supabase → Settings → API)
   - `VITE_SUPABASE_ANON` = anon public key  ← **đúng tên, KHÔNG `_KEY`**
   - (Tuỳ chọn) `VITE_N8N_WRITE_URL`, `VITE_VMP_READ_URL`, `VITE_N8N_AI_REPORT_URL`
     — có thể bỏ qua và nhập trong app (mục Cấu hình).
5. Vào tab **Actions** → đợi build (~2 phút). URL hiện ở **Settings → Pages**
   (`https://<bạn>.github.io/<repo>/`).

## ⚠ QUAN TRỌNG — thứ tự với Supabase
Web này dùng **khóa lạc quan** (gọi `rpc_update_progress` có tham số `p_expected_version`
và đọc `version` từ dashboard). Hai thứ này **chỉ có sau khi chạy migration `012`**.
➡️ **Chạy đủ 12 migration (gồm 012) trong Supabase TRƯỚC**, rồi mới để web này chạy.
(Nếu DB chưa có 012, web mới sẽ lỗi khi lưu tiến độ.)

## Đã vá sẵn trong web này
- Loại "Không áp dụng" khỏi đếm KPI.
- Khóa lạc quan chống 2 người ghi đè cùng lúc (báo "đã có người sửa" + tự tải lại).
- Tự làm mới khi quay lại tab và **reload khi sang ngày mới** (số "quá hạn" luôn đúng).
- Hiển thị + đặt trạng thái "Không áp dụng/Đã hủy".

## Ghi chú
- `_ban_goc_truoc_khi_sua/` = bản gốc 5 file đã sửa (chỉ để đối chiếu, không ảnh hưởng build).
- `README.md`, `SECURITY.md`, `SETUP_FROM_SCRATCH.md` là tài liệu tham khảo chung kèm theo.
- Build đã kiểm: PASS. `base: "./"` nên không cần biết tên repo.

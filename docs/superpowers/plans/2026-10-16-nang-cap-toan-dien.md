# Kế hoạch nâng cấp VMP Monitor — sau rà soát 16/10/2026

Chi tiết kỹ thuật nằm trong commit và runbook được dẫn ở từng dòng.
**[CHỦ DỰ ÁN]** = việc cần chủ dự án quyết hoặc tự làm.

## Đã xong (16/10)

| Việc | Ghi chú |
|---|---|
| Deploy đợt sửa lên `main` | CI xanh, đã kiểm trên web thật |
| Áp 10 migration production | `docs/runbooks/2026-10-16-ap-migration-ton-dong.md`; `drift:db` khớp 131/131 |
| Kiểm lệch DB mỗi sáng | `.github/workflows/db-drift.yml`, `npm run drift:db` |
| Sửa hook MFA chặn nhầm anon | migration `20261016120000` |
| Rà 16 policy `true` còn lại | Đều là bảng cấu hình chỉ đọc — giữ |
| Rà soát quyền định kỳ | `npm run ra-soat-quyen -- --out <ngoài repo>` |
| Diễn tập khôi phục sao lưu | `docs/runbooks/2026-10-16-dien-tap-khoi-phuc.md` |
| E2E không còn hỏng theo lịch | `VMP_E2E_NOW` (CI: 2026-10-08) |
| Axe chặn cả mức moderate | 0 vi phạm / 20 kịch bản |
| Đo chữ < 12px và chữ bị ép | luong-gia-lap 3q, 14 màn × 2 cỡ |
| Sinh lại `database.ts` | typecheck đạt |
| Xoá script kiểm cũ hỏng | `check-qualification-bundle.mjs` |
| Gọn chữ giải thích trên 13 màn | Bỏ chữ kỹ thuật, câu tự bào chữa, hướng dẫn đọc biểu đồ, câu lặp |
| Dọn máy làm việc | `main` khớp GitHub; `main` cũ lưu ở nhánh `luu-tru/main-may-cu-20261016` + bundle; gỡ 15 worktree sạch (giữ nhánh); đóng PR #6 |

## Còn lại

| Việc | Ai | Ghi chú |
|---|---|---|
| Bật `item_permissions_mode = enforced` | **[CHỦ DỰ ÁN]** + QA | 511 blocker, chủ yếu 461 hạng mục chưa gán xưởng/bộ phận; sau đó cập nhật allowlist preflight |
| Bật dashboard v2 (trạng thái/KPI tính ở máy chủ) | Claude | Chỉ sau khi bật enforced: áp `20261016130000`, bỏ dòng hoãn trong `check-migration-drift.mjs` |
| Bắt buộc MFA cho admin | **[CHỦ DỰ ÁN]** | 4/4 admin chưa bật — bật xong mới bật bắt buộc |
| Đổi mật khẩu Postgres, giới hạn IP, CAPTCHA Auth, rate limit webhook chat | **[CHỦ DỰ ÁN]** | Checklist 31/08 |
| PITR Supabase; chuyển bản sao lưu sang kho QA | **[CHỦ DỰ ÁN]** | Bản sao lưu hiện chỉ trên máy này |
| QA ký rà soát quyền hằng quý | **[CHỦ DỰ ÁN]** | Bản Q4/2026 đã xuất |
| Long Môn chữ 9–10px | **[CHỦ DỰ ÁN]** quyết | Nâng 12px cần chỉnh bố cục tranh |
| Ảnh `long-mon-vmp-racecourse-v15.webp` không còn dùng | **[CHỦ DỰ ÁN]** quyết | 221 KB |
| 3 worktree còn thay đổi chưa commit | **[CHỦ DỰ ÁN]** quyết | `desktop-ux-data-first`, `qa-rights-account-alignment`, `ui-functional-integrity` |
| Project Supabase staging | **[CHỦ DỰ ÁN]** | Mở khoá E2E đăng nhập thật |
| Hồ sơ CSV: URS rút gọn, đánh giá rủi ro, lưu bằng chứng CI làm OQ, audit trail các luồng ghi | Claude + QA | Khung có sẵn: `docs/testing/2026-10-08-data-write-inventory.md` |
| Kiểm phân hệ Thẩm định thực tế trên máy tính bảng xưởng | QA | Sau đợt tách gói PDF |
| Lỗi chập chờn `catalog-workspace` khi máy tải nặng | Claude | |
| Gỡ dần 64 `as never`; tách file > 1.000 dòng; chuyển `index.css` sang hệ thiết kế (133 vi phạm) | Claude | Làm theo từng tính năng |
| Bước cài Playwright vẫn dùng `--with-deps` | Claude | Đã có timeout; theo dõi |

# BÀN GIAO — từ phiên Claude Code (31/08–01/09/2026) sang agent kế tiếp

> Người kế nhiệm (Codex hoặc agent khác): đọc file này TRƯỚC khi làm bất cứ gì.
> Quy ước làm việc chung ở `AGENTS.md` (gốc repo) + `~/.claude/CLAUDE.md` của chủ
> dự án vẫn nguyên hiệu lực: tiếng Việt, không tự ý ghi remote, hỏi trước khi
> push/deploy/migration, secret không vào code.

## 1 · Trạng thái Git

- Nhánh làm việc: **`cai-tien/desktop-wave-1`** — xem số commit hiện tại bằng
  `git rev-list --count origin/main..HEAD`; ref local `origin/main` là `7ae2db1`.
  **CHƯA push** trong Wave 2/3; `main` local đang cũ hơn
  nhánh làm việc, không dùng làm căn cứ phát hành.
- Mọi commit đều qua gate: typecheck + unit + e2e mock + (khi đụng UI) a11y/drift/budget.
  Đọc `git log 6fdfe01..HEAD --oneline` — message tiếng Việt không dấu, mô tả đủ.

## 2 · Đã làm (3 đợt lớn, có tài liệu riêng từng đợt)

1. **Wave 1 nâng cấp desktop** — plan + đánh dấu commit thật:
   `docs/superpowers/plans/2026-08-31-trien-khai-nang-cap-desktop-wave-1.md`
   (Stage A–F: sửa nhanh, hiệu năng CSS/art, UX boundary/confirm/a11y,
   hợp nhất logic hạn, migration bảo mật + giám sát, tách App.tsx).
2. **Thẩm mỹ 10 mục + gỡ chế độ thanh tra** (01/09): commit `abaf9b3`..`7d83015`.
   Chỉ còn 2 giao diện sáng/tối. Token mới: `--lp-hero`, `--lp-gold-ink`, `--lmr-*`.
3. **Bàn quản trị** — viết lại 6 màn nhóm Phân tích & Quản trị:
   spec `docs/superpowers/specs/2026-09-01-ban-quan-tri-design.md`,
   commit `d8e130d`..`3be48f2`. Khung dùng chung: `src/components/ui/NhomTab.tsx`
   (NhomTab/NhomTabPanel/DongSo/useNhomTab — tab nhớ localStorage `vmp.tab.<man>`).
4. **Wave 2 — hành động tin cậy và desktop gọn** — plan
   `docs/superpowers/plans/2026-09-01-wave-2-hanh-dong-tin-cay-desktop.md`,
   commit `399b2df`..`dec1387`:
   - nút lưu tài khoản/phân công/phạm vi/deadline chỉ đúng trường cần sửa;
   - KPI theo người khớp nguồn canonical; tab quản trị deep-link qua URL;
   - timestamp hiển thị cố định Asia/Bangkok;
   - gỡ toàn bộ runtime/dependency Three.js không còn dùng (2.408 dòng mã chết);
   - ổn định a11y modal bằng reduced-motion khi quét tương phản.
5. **Wave 3 — Source import do server xác nhận + khóa quyền Dữ liệu nguồn** —
   spec/plan:
   `docs/superpowers/specs/2026-09-01-source-import-server-preview-design.md` và
   `docs/superpowers/plans/2026-09-01-source-import-server-preview.md`, commit
   `aa76d83`..`HEAD`:
   - chỉ `admin`/`qa_manager` được thêm, sửa, nhập và xuất Source; vai trò khác
     chỉ đọc đúng phạm vi, UI có ghi chú ngắn giải thích dữ liệu gốc;
   - RPC preview owner-scoped, exact contract, allowlist field và keyset page;
   - bảng create/update/unchanged/error, A3 trước→sau, tải thêm, lý do từng dòng;
   - nút Ghi không còn khóa im lặng: báo lỗi cạnh trường, focus đúng lý do,
     giữ draft khi RPC lỗi/conflict và giữ biên nhận sau commit.

Gate chốt Wave 3 local: targeted unit/SQL contract `29/29`; RPC inventory mục
tiêu `1/1`; Catalog E2E `151/151`; Source role E2E đạt; a11y `15/15`; typecheck,
build, drift và budget đều exit `0`. SQL security harness đã tạo nhưng chưa chạy
trên database vì chưa apply migration và chưa có lệnh cho phép dùng DB remote.

Gate chốt Wave 2: unit Windows `671 pass, 1 skip, 0 fail`; E2E cốt lõi
`148/148`; quyền quản trị `80/80`; deadline `39/39`; shell `29/29`;
Source/phạm vi và Today-person đều đạt; a11y `15/15`; drift và budget đạt;
build production exit `0`.

Đánh giá gốc toàn hệ (6 mảng, điểm số, top rủi ro): artifact
https://claude.ai/code/artifact/8251fc3d-9d85-40fc-8ab0-309f91e0ae89 và kế hoạch mẹ
`docs/superpowers/plans/2026-08-31-ke-hoach-cai-tien-toan-dien.md`.

## 3 · VIỆC CHỜ CHỦ DỰ ÁN (đừng tự làm — cần tài khoản/quyết định của anh Hoàn)

- Đổi mật khẩu Postgres production (đang yếu, plaintext ở `.env.local` — file
  KHÔNG được commit) + mật khẩu E2E; bật IP allowlist.
- **Apply 4 migration MỚI** (chỉ là file, CHƯA áp) theo runbook cùng tên:
  - `20260831160000_fix_bangkok_current_date.sql` → `docs/runbooks/2026-08-31-fix-bangkok-current-date.md`
  - `20260831170000_client_error_log.sql` → `docs/runbooks/2026-08-31-client-error-log.md`
    (frontend ĐÃ gắn `src/lib/baoLoi.ts`, tự im lặng khi RPC vắng)
  - `20260831180000_close_true_policies.sql` → `docs/runbooks/2026-08-31-close-true-policies.md`
    (siết 6 bảng policy-true + `rpc_team_overview_summary` lọc phạm vi; có probe persona)
  - `20260901090000_catalog_import_server_preview.sql` →
    `docs/runbooks/2026-09-01-catalog-import-server-preview.md`
    (khóa export cho Admin/Quản lý QA, thêm preview batch owner-scoped; phải chạy
    preflight/postflight/security harness đúng runbook).
- Bật PITR/backup Supabase, tạo project staging, kiểm n8n có verify JWT.
- Duyệt nhánh rồi ra lệnh push/PR.

## 4 · Bẫy môi trường LOCAL (máy Windows này) — đọc kỹ trước khi chạy test

- `npm run test:unit` nguyên bản **TREO** khi chạy đồng thời (các test spawn giành
  cổng 4173). Gate local đúng:
  `FILES=$(ls tests/unit/*.test.mjs | grep -v -E "preview-lifecycle|a11y-runtime-contract|fast-gate-evidence|five-role-db-harness|five-role-rpc-inventory|login-screen-sdk-boundary|qa-rights-release-contract|visual-runtime-contract") && node --import tsx --test --test-concurrency=4 $FILES`
  rồi chạy 8 file spawn TUẦN TỰ nếu cần. 3 file (`visual-runtime-contract`,
  `fast-gate-evidence`, `preview-lifecycle`) **fail sẵn** do đặc thù Linux/ACL —
  KHÔNG phải hồi quy; CI Linux là trọng tài.
- Riêng hai test shell trong `five-role-rpc-inventory.test.mjs` hỏng trên máy này
  vì WSL báo `execvpe(/bin/bash) failed: No such file or directory`; phần RPC
  inventory chạy tách bằng `--test-name-pattern "every source RPC call"` đạt.
- E2E mock cần build có cờ + preview IPv4:
  `VITE_MANUAL_PLANNED_DEADLINES_ENABLED=true npm run build`
  `npx vite preview --port 4173 --strictPort --host 127.0.0.1` (nền)
  rồi `node tests/e2e/<file>.mjs`. Bộ CI = 9 file trong `deploy.yml` + `shell`.
- `tests/e2e/quet-tat-ca-man.mjs` và `npm run e2e` **đăng nhập THẬT vào production**
  — đừng chạy trừ khi chủ dự án bảo.
- `tests/e2e/today-personal-scope.mjs` đã được cập nhật theo hero hiện hành ở
  `e0c587a` và đang đạt; không phục hồi assertion tile cũ đã bị thiết kế bỏ.
- Gate bắt buộc khác: `npm run drift` (0 vi phạm — ĐANG là gate CI),
  `npm run budget` (sau build), `npx playwright test -c playwright.a11y.config.ts`
  (15 kịch bản).

## 5 · Cảnh báo toàn vẹn

File plan wave-1 từng bị MỘT TIẾN TRÌNH NGOÀI ghi đè bằng ghi chú "đã hoàn thành"
kèm 18 mã commit KHÔNG TỒN TẠI (chi tiết ở đầu file plan + commit khôi phục).
Chủ dự án xác nhận chỉ mở một phiên — nguồn chưa rõ. Luật từ đó: **mọi [x] trong
plan phải kèm mã commit tra được bằng `git log`**; thấy ghi chú lạ thì đối chiếu
git trước khi tin.

## 6 · Việc kế tiếp hợp lý (đã ghi trong spec/plan, chưa làm)

- Ngoài-phạm-vi còn lại của Bàn quản trị: chuyển-phụ-trách một-bấm từ Workload,
  snapshot báo cáo bất biến. URL cho tab đã hoàn tất ở `cd8cd2a`.
- Kế hoạch mẹ đợt sau: dump schema gốc vào repo (cần DB URL), server thành nguồn
  sự thật KPI (màn Đối chiếu mới là bước đệm), chức năng GMP (đính kèm hồ sơ,
  phê duyệt điện tử, log EXPORT).
- Mobile: chủ dự án HOÃN — đừng làm khi chưa được yêu cầu lại.
- Wave 3 còn đúng bước phát hành: chủ dự án kiểm local ở
  `http://127.0.0.1:4175`, sau đó mới cho phép push/deploy/apply migration.

## 7 · Bản đồ file nhanh cho người mới

- Khung UI dùng chung: `src/components/ui/` (NhomTab, StateBoundary, ShellConfirmDialog,
  Primitives — có `Trong` cho ô trống); hook `src/hooks/useXacNhan.tsx`.
- Token: `src/styles/lotus-tokens.css` (sáng + dark cùng file); guardrail:
  `scripts/check-design-drift.mjs` (miễn trừ từng dòng bằng `/* drift-mien: lý do */`).
- Logic hạn: `src/lib/hanChot.ts` là nguồn sự thật phép so ngày (Bangkok).
- Model thuần có test: `bangDanhSachModel`, `doiChieuModel`, `auditDiffModel`,
  `baoLoi` (taoBoGomLoi).
- CSS theo route (B5): màn lazy tự import CSS của nó — xem ghi chú trong `src/main.tsx`.

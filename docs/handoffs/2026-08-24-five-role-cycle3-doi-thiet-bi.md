# VMP five-role hardening — bàn giao đổi thiết bị

**Ngày:** 2026-08-24
**Máy thực hiện:** máy mới (macOS 15.3 / Darwin 24.3, BSD userland)
**Tình trạng:** mọi gate không-production ĐÃ ĐẠT. Production chưa bị ghi gì.

Tài liệu này không chứa bí mật. Bảy UUID production, URL database, khoá và hồ sơ
bằng chứng đã ký **cố ý không nằm ở đây và không nằm trong Git**.

---

## 1. Chốt trạng thái Git

| Đối tượng | Giá trị |
|---|---|
| `origin/main` | `0a118d45119576c3e2ff0a776728c9fe6f1dd434` — **không đổi** |
| Nhánh sản phẩm | `security/five-role-hardening` @ `9aba1c6` |
| Bản đóng băng | `c153a192e95fe4e5066d53a5292719d39c6b2c3d` (= `RELEASE_FREEZE_SHA`) |
| Cha bản đóng băng | `5b08d954cdc93aee45bad7c9bb15e0f05395b190` (= `IMPLEMENTATION_SHA`) |
| Nhánh vá CI | `ci/on-dinh-workflow` @ `8c415e4` |
| PR #5 | five-role hardening → main, **nháp**, CI xanh, KHÔNG merge |
| PR #6 | vá CI → main, **nháp**, CI xanh, KHÔNG merge |

`origin/main` là **tổ tiên thực sự** của nhánh hardening (27 commit vượt, 0 ngược
lại), nên fast-forward vẫn hợp lệ. Bảo vệ nhánh: `required_linear_history=true`,
`allow_force_pushes=false`.

---

## 2. Việc đã làm trong phiên này

### 2.1 Một thay đổi mã duy nhất — `9aba1c6`

`scripts/prepare-five-role-test-db.sh` dòng 73:

```diff
-sed -i '/^ALTER DEFAULT PRIVILEGES /d' "$tmp_dir/schema.sql"
+sed '/^ALTER DEFAULT PRIVILEGES /d' "$tmp_dir/schema.sql" >"$tmp_dir/schema.trimmed.sql"
+mv "$tmp_dir/schema.trimmed.sql" "$tmp_dir/schema.sql"
```

Nguyên nhân gốc: GNU sed nhận `-i` không tham số; BSD sed (macOS) coi token kế
tiếp là hậu tố sao lưu, nên nuốt biểu thức xoá rồi coi đường dẫn tạm là lệnh sed
→ `sed: 1: "/var/folders/...": invalid command code f`. Lỗi này chỉ xuất hiện
trên macOS; trên runner Ubuntu dòng cũ vẫn xanh.

`grep -v` đã bị loại làm phương án vì nó **exit 1 khi mọi dòng đều khớp**, sẽ
giết script dưới `set -euo pipefail` (đã kiểm thực nghiệm).

Không đụng artifact niêm phong nào: bốn file SQL ghim SHA-256 trong runbook giữ
nguyên. File này cũng không nằm trong bundle Vite.

### 2.2 Bằng chứng đo được

**Gate A + E2E — CI run `32728099997` (Ubuntu, PR #5):**

| Gate | Kết quả | Đối chiếu bản đóng băng |
|---|---|---|
| typecheck | đạt | khớp |
| unit | 336 tổng · 335 đạt · 0 hỏng · 1 bỏ qua | khớp |
| drift | đạt (49 + 132 file) | khớp |
| `e2e:gialap` | 171 đạt · 0 hỏng | khớp 171/0 |
| `e2e:catalog` | 75 đạt · 0 hỏng | khớp 75/0 |
| `e2e:admin` | 60 đạt · 0 hỏng | khớp 60/0 |
| access transition race | pass | khớp |
| `shell` | 29 đạt · 0 hỏng | — |
| `thammy` + `atelier` | 177 đạt · 0 hỏng | — |
| a11y (axe) | 5 passed, 0 critical/serious | khớp |
| visual regression | 39 passed | baseline linux có sẵn, so thật |
| `production-build` / `deploy` | skipped | đúng — event pull_request |

**Bộ DB — chạy tại máy trên bản sao schema-only của production:**

| Bước | Kết quả |
|---|---|
| `prepare-five-role-test-db.sh` | exit 0 |
| gieo fixture tổng hợp | 102 dòng ma trận + tài khoản/bộ phận, COMMIT |
| `apply-five-role-hardening-local-test.sh apply` | exit 0 — 7 profile inactive, COMMIT |
| `apply-five-role-hardening-local-test.sh check` | **14/14 PASS · ROLLBACK** |
| `npm run test:db:five-role` | đạt · ROLLBACK, 0 lỗi |

Mười bốn phép: `PERMISSION_MODES`, `FIVE_ROLE_MATRIX`, `ACTIVE_SESSION_CONTRACT`,
`PROFILE_AND_AUDIT_PRIVILEGES`, `DIRECT_TABLE_RLS_GUARDS`,
`GUARDED_RPC_IMPLEMENTATIONS`, `BROWSER_FUNCTION_CONTRACT`,
`SERVICE_ROLE_FUNCTION_CONTRACT`, `OMITTED_AUTOMATION_RPC_ACL`,
`ITEM_PERMISSION_BLOCKER_CONTRACT`, `SERVICE_ONLY_RPC_ACL`,
`CATALOG_HISTORY_ACL`, `ACTIVE_ADMIN_REMAINS`, `EXACT_SEVEN_DISABLED_AUDITS`.

### 2.3 Tiền kiểm production chỉ-đọc — ĐẠT 16/16

Chạy nguyên văn khối SQL đầu tiên trong mục "Read-only production preflight" của
runbook, bọc `BEGIN READ ONLY` … `ROLLBACK`, đã soát trước không có lệnh đột biến.

| Đo trên production 24/08 | Giá trị |
|---|---|
| chế độ | `screen_mode=enforced` · `item_mode=preview` |
| ma trận | 102 dòng + 4 digest khớp |
| 5 hàm lõi | 5 md5 định nghĩa khớp |
| bề mặt hàm trình duyệt | **189** + digest khớp |
| blocker item-permission | **481** + digest khớp |
| cảnh báo | **13** (`EMPLOYEE_CODE_MISSING`) + digest khớp |
| admin đang hoạt động | 2 |

**16/16 giá trị khớp tiền điều kiện của migration, 0 lệch → production chưa trôi
khỏi trạng thái đã review; khối precondition sẽ không abort.**

Điều này cũng cho thấy sự cố ghi ngày 19/08 **không** làm lệch ma trận quyền, bề
mặt hàm hay phân bố cảnh báo. (Vẫn nên chốt riêng, nhưng không chặn đợt này.)

Sau apply, hợp đồng đã duyệt là **64** hàm trình duyệt — tức cắt khoảng hai phần
ba bề mặt gọi được qua PostgREST.

### 2.4 Vá CI — `8c415e4` (PR #6, đang giữ lại)

Chỉ đụng `.github/workflows/`. Bốn nguyên nhân gốc đo trên 100 run gần nhất
(53 xanh / 26 đỏ / 20 huỷ): visual chặn deploy; `--with-deps` gọi apt và treo
1h33m / 6 giờ; group `pages` dùng chung làm 20 run bị huỷ khi đang chờ; gọi
`with-preview.sh` nhiều lần nên build lặp.

Đo được: đường tới hạn chặn deploy **713s → 571s**; visual (122s) ra khỏi đường
đó và `continue-on-error`; tổng run 12 → 10 phút.

---

## 3. Chặn cứng — vì sao phải quay lại máy cũ

Bốn giá trị sau **không có trên máy mới** và không suy ra được:

```
VMP_ACCOUNT_IDS            # bảy UUID production đã duyệt
RELEASE_FREEZE_SHA
RELEASE_RUNBOOK_BLOB_OID
RELEASE_RUNBOOK_SHA256
```

Đã tìm kỹ trên máy mới: chúng chỉ xuất hiện trong runbook/plan **dưới dạng tên
biến**, không phải giá trị. `.env.local` không có. Kho nội bộ `VMP-noibo` không
có hồ sơ bằng chứng của đợt này.

`VMP_ACCOUNT_IDS` là chặn tuyệt đối: `apply-five-role-hardening.sql` chọn tài
khoản theo UUID chứ không theo email hay regex (cố ý, để không vô hiệu nhầm
người). Ba giá trị còn lại về kỹ thuật tính được từ checkout, nhưng runbook cấm
đúng việc đó — chúng tồn tại để một checkout bị sửa không thể tự chứng nhận.

Backup và apply có luật **một lần, không retry**. Không khởi động chuỗi khi còn
thiếu đầu vào.

---

## 4. Việc cần làm ở MÁY CŨ

Xem mục 5 để lấy lệnh chạy. Tóm tắt: tìm lại hồ sơ bằng chứng đã ký, kết xuất
bốn giá trị ra một file env **ngoài repo**, `chmod 600`, rồi chuyển sang máy mới
qua kênh riêng đã phê duyệt — hoặc chạy tiếp phần production ngay tại máy cũ.

Nếu hồ sơ bằng chứng **không còn**: không được đoán bảy tài khoản. Phải dựng lại
manifest từ đầu và cho người duyệt độc lập ký lại, rồi mới apply.

---

## 5. Thứ tự bắt buộc cho phần còn lại

1. Kiểm niêm phong 4 artifact SQL (`shasum -a 256 -c` trên macOS, xem mục 6).
2. Tiền kiểm manifest bảy tài khoản — khối SQL thứ hai của mục preflight, cần
   `VMP_ACCOUNT_IDS`. Digest kỳ vọng: `2c09501166eb45c3676451084230340e`.
3. Backup production — **đúng một lần**, output nhập nhằng là tiêu lượt.
4. Apply — **đúng một lần**, từ checkout ghim `c153a19` (detached HEAD).
5. Postflight trên kết nối MỚI, trước và sau khi nạp lại schema cache.
6. Kiểm lại `origin/main` vẫn là `0a118d4`, rồi fast-forward:
   `git push origin security/five-role-hardening:main`
7. Theo dõi CI/Pages đúng commit; probe năm persona + một tài khoản bị vô hiệu,
   chỉ đọc.
8. Rebase `ci/on-dinh-workflow` lên `main` mới rồi merge PR #6.

### Cảnh báo thứ tự

- **Push `main` = deploy web thật.** Runbook bắt buộc database đi trước frontend.
- **Đừng merge PR #6 trước PR #5.** `main` tiến lên là mất fast-forward, phải
  rebase 27 commit, viết lại SHA và mất truy vết về `RELEASE_FREEZE_SHA`.
- **Đừng merge PR #5 qua nút merge của GitHub.** Nó tạo commit gộp hoặc viết lại
  SHA. Phải push thẳng để giữ fast-forward.

---

## 6. Lệch nguyên văn runbook trên macOS

Runbook dùng:

```bash
sha256sum --check <<'SHA256'
...
SHA256
```

macOS 15.3 **có** `/sbin/sha256sum` (bản Darwin) nhưng **không** hỗ trợ cờ dài
`--check`, và `-c` **không đọc checklist từ stdin** — chỉ nhận tham số file.
Đã kiểm thực nghiệm cả bốn biến thể.

Thay bằng, cùng thuật toán và cùng kết quả:

```bash
shasum -a 256 -c <đường-dẫn-file-checklist>
```

**Không sửa file runbook** — blob OID của nó là một phần danh tính niêm phong.

---

## 7. Bẫy môi trường trên máy mới (ghi lại cho lần sau)

- Docker Desktop tự khôi phục stack Supabase `GMP-EQMS` (tạo 30/07, policy
  `unless-stopped`) và nó chiếm cổng **54322**. Các script chốt cứng cổng này
  (`parse-five-role-local-db.mjs` fail nếu khác), nên phải `docker stop` stack đó
  trước, xong `docker start` trả lại.
- `supabase start` **tự nạp** `supabase/migrations/`, mà migration five-role có
  khối precondition đòi đúng 17 policy — DB trắng không thoả nên start chết và
  `prepare-five-role-test-db.sh` exit 1 **lặng lẽ** (output vào `/dev/null`).
  Cách gỡ: tạm cất `supabase/migrations` ra ngoài → `supabase start` → trả về chỗ
  → chạy prepare.
- Bộ SQL `tests/sql/five-role-hardening.sql` có chế độ gieo fixture bật bằng
  `-v seed_five_role_fixture=1`; nó `commit;` rồi `\quit` ở dòng 211. Không đặt
  biến thì chạy bộ kiểm và kết thúc `rollback;`. Phải gieo TRƯỚC khi apply local,
  vì contract đòi `system_config.five_role_test_fixture = true`.
- Quét 4 file `scripts/*.sh` không tìm thấy bẫy BSD/GNU nào khác chắc chắn.

---

## 8. Việc còn treo, không thuộc đợt này

- Sự cố ghi production không duyệt **19/08** (trigger + 4 hồ sơ rỗng ghi khi chưa
  duyệt) — chưa chốt giữ hay hoàn tác. Tiền kiểm 24/08 cho thấy nó không làm lệch
  ma trận/bề mặt hàm/cảnh báo.
- Harness `bad-root` mà Cycle 2 dừng ở đó **không tồn tại** trên máy mới — đã
  grep toàn bộ cây làm việc và toàn bộ lịch sử Git, chuỗi `expect_stop` chỉ có
  trong bản mô tả ở tài liệu bàn giao trước. Nó là file ignored ở máy cũ. Muốn
  tiếp thì phải dựng lại từ đặc tả, và nó chỉ có nghĩa khi đã có script backup
  candidate đi kèm.

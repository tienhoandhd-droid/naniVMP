# Phát hành quyền Source QA và phạm vi xưởng

Runbook này chỉ áp dụng cho PostgreSQL của Supabase project
`ivembmikfhtyzhtqebgh`. Chưa được phép tự động chạy production, push, merge,
deploy Pages, hoặc sửa migration history. Mọi bước ghi cần một cửa sổ thay đổi
riêng và người vận hành/quan sát riêng.

## 1. Chốt exact SHA và artifact

Chỉ dùng commit đã được reviewer cấp exact SHA, có 0 Critical và 0 Important.
Không tự suy SHA từ tên nhánh. `PREVIOUS_PAGES_SHA` là deployment Pages thành
công gần nhất và phải được ghi lại trước cửa sổ thay đổi.

```bash
set -euo pipefail
test -n "${REVIEWED_RELEASE_SHA:?exact reviewed release SHA is required}"
test -n "${PREVIOUS_PAGES_SHA:?previous successful Pages SHA is required}"
RELEASE_SHA="$(git rev-parse HEAD)"
test "$RELEASE_SHA" = "$REVIEWED_RELEASE_SHA"
test -z "$(git status --porcelain=v1)"
test "$(git branch --show-current)" = 'feat/source-qa-workshop-scope'
test "$(supabase --version)" = '2.113.0'
test "$(tr -d '\r\n' < supabase/.temp/project-ref)" = 'ivembmikfhtyzhtqebgh'
```

Các hash dưới đây là contract đã review; lệch bất kỳ hash nào thì dừng và
review lại, không cập nhật biến tại production để bỏ qua lỗi.

```bash
EXPECTED_EXPAND_SHA256='18075012f5296a72e1c8b74df42e448b8f2dfc9d01285b85bf90c708b1b3d3c4'
EXPECTED_ENFORCE_SHA256='363a0ef9d40f882ddabfbba2be2185ae8860367b0b126a89df82e637ece3b84b'
EXPECTED_PREFLIGHT_SHA256='43f23639774f6db7d69c12ab12bb747ed534fcd37a5c8f0229aa6692c2f268d5'
EXPECTED_POSTFLIGHT_SHA256='3806fb7a7d8e3eb0f4c0ccce094120454f69c254d6272bae35d0af4b9267e4a8'
EXPECTED_RECOVERY_SHA256='53651d359c93e9045ae14c0d8d4a329092a037affe25fde0d056b12eaf63c655'
EXPECTED_WORKFLOW_SHA256='de1be9ee98372e53630d59848c7e7a4ffc2cd5c77c61ac2315fb0669768b350d'
test "$(sha256sum supabase/migrations/20260828140000_source_qa_workshop_access_expand.sql | awk '{print $1}')" = "$EXPECTED_EXPAND_SHA256"
test "$(sha256sum supabase/migrations/20260828150000_source_qa_workshop_access_enforce.sql | awk '{print $1}')" = "$EXPECTED_ENFORCE_SHA256"
test "$(sha256sum scripts/check-source-qa-workshop-access-preflight.sql | awk '{print $1}')" = "$EXPECTED_PREFLIGHT_SHA256"
test "$(sha256sum scripts/check-source-qa-workshop-access.sql | awk '{print $1}')" = "$EXPECTED_POSTFLIGHT_SHA256"
test "$(sha256sum scripts/forward-recover-source-qa-workshop-access.sql | awk '{print $1}')" = "$EXPECTED_RECOVERY_SHA256"
test "$(sha256sum .github/workflows/deploy.yml | awk '{print $1}')" = "$EXPECTED_WORKFLOW_SHA256"
git diff --check "$REVIEWED_RELEASE_SHA^" "$REVIEWED_RELEASE_SHA"
```

## 2. Kết nối và bằng chứng hạn chế

Dùng service file/CLI liên kết đã được phê duyệt; không đưa mật khẩu pooler,
token, UUID, email, tên người dùng hoặc raw row payload vào log. Persona file
ngoài Git phải có mode `0600`, evidence directory mode `0700`, gồm đúng các
biến `admin_id`, `qa_manager_id`, `owner_qa_id`, `support_qa_id`,
`unrelated_qa_id`, `workshop_id`.

```bash
set -euo pipefail
umask 077
export PERSONA_ID_FILE='/secure/vmp/source-access-personas.psql'
export POSTFLIGHT_INPUT_FILE='/secure/vmp/source-access-postflight.psql'
export EVIDENCE_DIR="/secure/vmp/backups/source-access-${REVIEWED_RELEASE_SHA}-$(date -u +%Y%m%dT%H%M%SZ)"
test -f "$PERSONA_ID_FILE" && test "$(stat -c '%a' "$PERSONA_ID_FILE")" = 600
install -d -m 700 "$EVIDENCE_DIR"
test "$(stat -c '%a' "$EVIDENCE_DIR")" = 700
# POSTFLIGHT_INPUT_FILE is a mode-0600 wrapper containing only reviewed psql
# \set values and \ir scripts/check-source-qa-workshop-access.sql.
test -f "$POSTFLIGHT_INPUT_FILE" && test "$(stat -c '%a' "$POSTFLIGHT_INPUT_FILE")" = 600
```

Trước khi apply, chụp vào thư mục hạn chế các definition/hash của function,
policy, ACL, role matrix, schema và projection counts/digests. Checker chỉ
ghi counts/digests/PASS. Không dùng `pg_dump` hoặc giả định pooler password để
thay thế đường dẫn linked CLI.

## 3. Backup truth và preflight chỉ đọc

Ghi nhận sự thật hiện tại của project bằng lệnh chính thức sau. Snapshot hiện
tại không có physical-backup entry; project báo `pitr=false` và `walg=true`.
Đây là giới hạn cần ghi vào evidence, không được giả vờ có restore point và
không tự động chặn release chỉ vì thiếu physical backup.

```bash
supabase backups list --project-ref ivembmikfhtyzhtqebgh --output json \
  > "$EVIDENCE_DIR/backups.json"
supabase db query --linked --file scripts/check-source-qa-workshop-access-preflight.sql \
  > "$EVIDENCE_DIR/preflight.log"
rg '^NOTICE:  PASS ' "$EVIDENCE_DIR/preflight.log"
```

Preflight tự mở `BEGIN READ ONLY` và luôn `ROLLBACK`; phải xác nhận PostgreSQL
17, mode `enforced/preview`, ít nhất một Admin hoạt động, quan hệ item → master
→ active Source đúng một dòng, Source owner/support khớp projection, candidate
eligibility, area-less count, index/function/ACL/RLS và inventory
SECURITY DEFINER. Không sửa dữ liệu nguồn để làm preflight đạt.

## 4. Apply tuần tự, có fail-closed gap

Hai migration phải chạy bằng hai lệnh linked CLI riêng, nhưng operator bắt buộc
serialize chúng và cấm chạy đồng thời manifest cũ, refresh/recovery script hoặc
legacy apply. Mỗi migration tự mở transaction và lấy cùng release advisory lock.
Migration expand cài refresh stub `SOURCE_ACCESS_UPGRADE_IN_PROGRESS` và revoke
service execute; stub này là bảo vệ thực tế giữa hai session.

```bash
supabase db query --linked --file supabase/migrations/20260828140000_source_qa_workshop_access_expand.sql \
  > "$EVIDENCE_DIR/expand.log"
supabase db query --linked --file supabase/migrations/20260828150000_source_qa_workshop_access_enforce.sql \
  > "$EVIDENCE_DIR/enforce.log"
```

Không chạy lệnh thứ hai khi lệnh thứ nhất thất bại hoặc commit không rõ. Lỗi,
timeout hay mất kết nối trước commit phải được xác minh bằng session mới; không
retry mù. Nếu enforce fail, transaction phải quay về đúng expand state (stub,
ACL, projection hash/count unchanged), sau đó dừng để review.

## 5. Postflight session mới và schema cache

Chạy postflight sau enforce trên một connection mới, nạp persona file bằng
`psql`/linked query tương đương. Mỗi checker tự rollback; không chạy writer
production để probe.

```bash
supabase db query --linked --file "$POSTFLIGHT_INPUT_FILE" \
  > "$EVIDENCE_DIR/postflight-before-reload.log"
rg '^NOTICE:  PASS ' "$EVIDENCE_DIR/postflight-before-reload.log"
```

Postflight kiểm tra lại exact mapping/owner-support, candidate/grant readiness,
area-less count, mọi index và ACL/function, RLS, complete SECURITY DEFINER
inventory, cùng claims rollback-only của Admin, QA Manager, owner/support QA,
QA không liên quan và workshop. Các surface products/alerts/import/pending/
history phải fail closed cho lower roles. Chỉ khi toàn bộ PASS mới được reload
schema cache và mở session postflight thứ hai:

```bash
supabase db query --linked --query "notify pgrst, 'reload schema';" \
  > "$EVIDENCE_DIR/schema-reload.log"
supabase db query --linked --file "$POSTFLIGHT_INPUT_FILE" \
  > "$EVIDENCE_DIR/postflight-after-reload.log"
cmp <(rg '^NOTICE:  PASS ' "$EVIDENCE_DIR/postflight-before-reload.log") \
    <(rg '^NOTICE:  PASS ' "$EVIDENCE_DIR/postflight-after-reload.log")
```

`NOTIFY` là mutation production và cần phê duyệt riêng. Không repair migration
history trước postflight đạt; nếu cần history repair, dùng đúng version và
separate approval sau khi đã chứng minh database và linked project trùng nhau.

## 6. Forward recovery

Recovery chỉ dùng khi release đã commit nhưng cần fail closed. Hash-check đúng
artifact và function contracts trước một lần chạy. Script chỉ thu hồi execute
trên Source browser surface/mutator mới và direct table reads; nó giữ nguyên
đường sửa chữa Admin/QA Manager (`rpc_save_catalog_object`), không restore
permissive session-wide readers. Nó không xóa grant/audit/relation data, không
đụng password/credentials và không restore toàn database.

```bash
test "$(sha256sum scripts/forward-recover-source-qa-workshop-access.sql | awk '{print $1}')" = "$EXPECTED_RECOVERY_SHA256"
supabase db query --linked --file scripts/forward-recover-source-qa-workshop-access.sql \
  > "$EVIDENCE_DIR/forward-recovery.log"
```

Recovery tự lấy advisory lock, yêu cầu đúng PostgreSQL 17, mode `enforced/preview`,
đúng hash các helper đã review, rồi giữ projection counts/digests bất biến.
Nếu pre/postcondition lỗi, transaction rollback và release dừng; không sửa
function trực tiếp hoặc chạy recovery lần hai mù.

## 7. CI, frontend và rollback Pages

Không triển khai frontend trước database postflight. CI phải pass
`npm run test:db:source-access`, typecheck/unit, Source mock E2E và build; job
database contract phải là dependency của production build. Nếu frontend lỗi
sau enforce, giữ server boundary an toàn và redeploy đúng
`PREVIOUS_PAGES_SHA`, không mở lại reader cũ. Sau đó ghi exact Pages metadata,
HTTP status và chạy postflight read-only mới.

Các đường gọi legacy vẫn bị cấm cho tới khi enforce postflight hoàn tất, bao
gồm `scripts/apply-qa-rights-account-manifest.sql`. Không in token, UUID list,
email/name hay raw payload vào evidence công khai.

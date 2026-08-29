# Phát hành quyền Source QA và phạm vi xưởng

Runbook này áp dụng cho PostgreSQL của Supabase project
`ivembmikfhtyzhtqebgh`. Việc triển khai hiện tại đã được ủy quyền trong cửa sổ
thay đổi tương ứng; mọi bước ghi vẫn phải được operator và observer xác nhận.
Chỉ dùng Supabase CLI 2.113.0 qua Management API linked project, không truyền
database credential hoặc identity values qua command line, local client hay wrapper.

## 1. Chốt exact SHA và artifact

Không tự suy SHA từ tên nhánh. `PREVIOUS_PAGES_SHA` và
`PREVIOUS_PAGES_RUN_ID` là deployment Pages thành công gần nhất, phải ghi lại
trước cửa sổ thay đổi.

```bash
set -euo pipefail
test -n "${REVIEWED_RELEASE_SHA:?exact reviewed release SHA is required}"
test -n "${PREVIOUS_PAGES_SHA:?previous successful Pages SHA is required}"
test -n "${PREVIOUS_PAGES_RUN_ID:?previous successful Pages run is required}"
RELEASE_SHA="$(git rev-parse HEAD)"
test "$RELEASE_SHA" = "$REVIEWED_RELEASE_SHA"
git diff --quiet
git diff --cached --quiet
test "$(git branch --show-current)" = 'feat/source-qa-workshop-scope'
test "$(supabase --version)" = '2.113.0'
test "$(tr -d '\r\n' < supabase/.temp/project-ref)" = 'ivembmikfhtyzhtqebgh'
export GITHUB_REPOSITORY='tienhoandhd-droid/naniVMP'
test "$GITHUB_REPOSITORY" = 'tienhoandhd-droid/naniVMP'
```

Các hash dưới đây là contract của đúng artifact tại `REVIEWED_RELEASE_SHA`. Lệch
bất kỳ hash nào thì dừng và review lại; không đổi expected value để bỏ qua drift.

```bash
EXPECTED_EXPAND_SHA256='b5b3bb4a01ef11f927e22d30c728c948c1b83f4bd4f09a1c5f240b8332004bac'
EXPECTED_ENFORCE_SHA256='2a55ff7a8220d0c08527d483f488881ba4feaf57115d047601107543abe4deab'
EXPECTED_PREFLIGHT_SHA256='374c120408990e4389d22842fb1f89cf8964734d17e8ff9d1d9e786d29392b2b'
EXPECTED_POSTFLIGHT_SHA256='7da35442b61fcf67f224e5d4b2d0ad7abc93aefa3a430b5190366cbdcf8161dc'
EXPECTED_RECOVERY_SHA256='bded4691229fca9b70715aad02ce82b393a2372245a80c32f0172b6451b2110d'
EXPECTED_WORKFLOW_SHA256='de1be9ee98372e53630d59848c7e7a4ffc2cd5c77c61ac2315fb0669768b350d'
test "$(sha256sum supabase/migrations/20260828140000_source_qa_workshop_access_expand.sql | awk '{print $1}')" = "$EXPECTED_EXPAND_SHA256"
test "$(sha256sum supabase/migrations/20260828150000_source_qa_workshop_access_enforce.sql | awk '{print $1}')" = "$EXPECTED_ENFORCE_SHA256"
test "$(sha256sum scripts/check-source-qa-workshop-access-preflight.sql | awk '{print $1}')" = "$EXPECTED_PREFLIGHT_SHA256"
test "$(sha256sum scripts/check-source-qa-workshop-access.sql | awk '{print $1}')" = "$EXPECTED_POSTFLIGHT_SHA256"
test "$(sha256sum scripts/forward-recover-source-qa-workshop-access.sql | awk '{print $1}')" = "$EXPECTED_RECOVERY_SHA256"
test "$(sha256sum .github/workflows/deploy.yml | awk '{print $1}')" = "$EXPECTED_WORKFLOW_SHA256"
git diff --check "$REVIEWED_RELEASE_SHA^" "$REVIEWED_RELEASE_SHA"
```

## 2. Linked connection và evidence hạn chế

`supabase db query --linked` dùng Supabase Management API và phiên CLI đã đăng
nhập; không truyền database password hoặc identity values trong command line.
Các file SQL release đều tự quản lý transaction, và hai checker tự resolve
vai trò từ canonical relations. Output chỉ được giữ trong evidence directory
mode `0700`, không in token, UUID, email, tên người dùng hoặc raw row payload.

```bash
set -euo pipefail
umask 077
export EVIDENCE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/source-access-${REVIEWED_RELEASE_SHA}.XXXXXX")"
chmod 700 "$EVIDENCE_DIR"
test "$(stat -c '%a' "$EVIDENCE_DIR")" = 700
```

Dùng output checker có counts/digests/PASS làm evidence; không dùng dump dữ liệu
hoặc pooler connection để thay thế linked Management API path.

## 3. Feature SHA quality gate trước production

Đẩy đúng feature SHA, rồi dispatch quality workflow bằng input exact commit trước
bất kỳ preflight hoặc production apply nào. Một dispatch run không deploy Pages:

```bash
export REVIEWED_BRANCH='feat/source-qa-workshop-scope'
test "$(git rev-parse HEAD)" = "$REVIEWED_RELEASE_SHA"
git push origin "$REVIEWED_RELEASE_SHA:refs/heads/feat/source-qa-workshop-scope"
gh workflow run deploy.yml \
  --ref feat/source-qa-workshop-scope \
  -f expected_commit="$REVIEWED_RELEASE_SHA"

DISPATCH_RUN_ID="$(gh run list --workflow deploy.yml \
  --branch "$REVIEWED_BRANCH" --event workflow_dispatch --limit 20 \
  --json databaseId,headSha,createdAt \
  --jq 'map(select(.headSha == env.REVIEWED_RELEASE_SHA)) | sort_by(.createdAt) | last | .databaseId')"
test -n "$DISPATCH_RUN_ID"
test "$(gh run view "$DISPATCH_RUN_ID" --json headSha --jq .headSha)" = "$REVIEWED_RELEASE_SHA"
gh run watch "$DISPATCH_RUN_ID" --exit-status
```

Require every expected dispatch job to finish successfully; production build and
Pages deploy are intentionally skipped for `workflow_dispatch`. Dừng trước khi
production preflight/apply nếu bất kỳ job nào fail.

## 4. Backup truth và preflight chỉ đọc

Ghi nhận backup truth trước khi apply. Snapshot hiện tại không có physical-backup
entry; project báo `pitr=false` và `walg=true`. Đây là giới hạn cần ghi vào
evidence, không giả vờ có restore point và không tự động tạo backup thay thế.

```bash
supabase backups list --project-ref ivembmikfhtyzhtqebgh --output json \
  > "$EVIDENCE_DIR/backups.json"
```

Checker final `SELECT` trả JSON qua stdout; phải kiểm riêng sau khi CLI trả thành
công, chỉ nhận đúng một status row có đúng key `status`, không nhận log stderr.

```bash
require_final_select() {
  local json_file="$1"
  local marker="$2"
  jq -e --arg marker "$marker" \
    '(.rows | (type == "array" and length == 1))
     and (.rows[0] | (type == "object" and .status == $marker
       and ((keys | sort) == ["status"])))' \
    "$json_file" >/dev/null
}

supabase db query --linked \
  --file scripts/check-source-qa-workshop-access-preflight.sql \
  > "$EVIDENCE_DIR/preflight.json" 2> "$EVIDENCE_DIR/preflight.stderr.log"
require_final_select "$EVIDENCE_DIR/preflight.json" 'PASS SOURCE_ACCESS_PREFLIGHT'
```

Preflight tự mở `BEGIN READ ONLY` và luôn `ROLLBACK`; phải xác nhận PostgreSQL
17, mode `enforced/preview`, Admin hoạt động, quan hệ item → master → active
Source đúng một dòng, owner/support projection, candidate eligibility,
area-less count, index/function/ACL/RLS và SECURITY DEFINER inventory.

Ineligible current Source relations có performer liên kết được giữ làm
sanitized inventory/display-only, không phải blocker và không được tự động gán
quyền QA. Missing performer, duplicate/ambiguous principal, missing master hoặc
duplicate active Source vẫn là blocker. Không sửa dữ liệu nguồn để làm preflight
đạt.

## 5. Apply tuần tự và fail-closed gap

Chạy hai migration bằng hai lệnh linked CLI riêng, serialize tuyệt đối. Không
chạy manifest cũ, refresh/recovery script hoặc legacy apply đồng thời. Expand
cài refresh stub `SOURCE_ACCESS_UPGRADE_IN_PROGRESS` và revoke service execute;
đây là protection giữa hai session.

```bash
supabase db query --linked \
  --file supabase/migrations/20260828140000_source_qa_workshop_access_expand.sql \
  > "$EVIDENCE_DIR/expand.json" 2> "$EVIDENCE_DIR/expand.stderr.log"
supabase db query --linked \
  --file supabase/migrations/20260828150000_source_qa_workshop_access_enforce.sql \
  > "$EVIDENCE_DIR/enforce.json" 2> "$EVIDENCE_DIR/enforce.stderr.log"
```

Không chạy lệnh thứ hai khi lệnh thứ nhất thất bại hoặc commit không rõ. Lỗi,
timeout hay mất kết nối trước commit phải được xác minh bằng linked session mới;
không retry mù. Nếu enforce fail, xác minh expand state (stub, ACL,
projection hash/count unchanged), rồi dừng để review.

## 6. Postflight mới, migration history và schema cache

Sau enforce, chạy postflight trực tiếp bằng file reviewed trên một linked request
mới. Không dùng wrapper hoặc tệp nhập vai trò.

```bash
supabase db query --linked \
  --file scripts/check-source-qa-workshop-access.sql \
  > "$EVIDENCE_DIR/postflight-before-reload.json" \
  2> "$EVIDENCE_DIR/postflight-before-reload.stderr.log"
require_final_select "$EVIDENCE_DIR/postflight-before-reload.json" \
  'PASS SOURCE_ACCESS_POSTFLIGHT'
```

Postflight kiểm tra exact mapping/owner-support, candidate/grant readiness,
area-less count, index/function/ACL, RLS, complete SECURITY DEFINER inventory,
Admin/QA Manager/QA/workshop fail-closed claims và các non-object surfaces.
Checker này tự rollback; không chạy writer production để probe.

Chỉ khi postflight đầu tiên đạt mới repair migration history nếu history repair
được phê duyệt riêng. Chỉ repair đúng hai version, không sửa file và không dùng
`--local`:

```bash
supabase migration repair --linked --status applied --yes \
  20260828140000 20260828150000
```

Sau khi history đã đúng và có phê duyệt schema-cache mutation, dùng positional
SQL cho schema reload:

```bash
supabase db query --linked "NOTIFY pgrst, 'reload schema';" \
  > "$EVIDENCE_DIR/schema-reload.json" 2> "$EVIDENCE_DIR/schema-reload.stderr.log"
supabase db query --linked \
  --file scripts/check-source-qa-workshop-access.sql \
  > "$EVIDENCE_DIR/postflight-after-reload.json" \
  2> "$EVIDENCE_DIR/postflight-after-reload.stderr.log"
require_final_select "$EVIDENCE_DIR/postflight-after-reload.json" \
  'PASS SOURCE_ACCESS_POSTFLIGHT'
```

`NOTIFY` là production mutation cần approval riêng. Nếu bất kỳ final marker,
history check hoặc postcondition nào fail thì release dừng; không repair/retry
mù.

## 7. Forward recovery

Recovery chỉ dùng sau khi release đã commit nhưng cần fail closed. Nó giữ đường
sửa chữa Admin/QA Manager, thu hồi Source browser/direct-table exposure cho
lower roles, không xóa relation/grant/audit data, không đổi credentials và không
restore toàn database.

```bash
test "$(sha256sum scripts/forward-recover-source-qa-workshop-access.sql | awk '{print $1}')" = "$EXPECTED_RECOVERY_SHA256"
supabase db query --linked \
  --file scripts/forward-recover-source-qa-workshop-access.sql \
  > "$EVIDENCE_DIR/forward-recovery.json" \
  2> "$EVIDENCE_DIR/forward-recovery.stderr.log"
require_final_select "$EVIDENCE_DIR/forward-recovery.json" \
  'PASS SOURCE_ACCESS_RECOVERY'
```

Recovery tự lấy advisory lock, yêu cầu PostgreSQL 17/mode `enforced/preview`,
pin function hashes, giữ projection counts/digests bất biến và bump authorization
revision đúng một lần. Nếu pre/postcondition lỗi, transaction rollback và release
dừng; không sửa function trực tiếp hoặc chạy recovery lần hai mù.

## 8. CI exact SHA, frontend và Pages

`source-access-db-contract` của CI chỉ kiểm sealed local PostgreSQL 17 receipt
và integrity hashes trong repository qua
`scripts/verify-source-access-db-evidence.mjs`; nó không kết nối production và
không thay thế live preflight ở Section 4. Production build/deploy chỉ được
chạy sau các dependency quality, sealed receipt và mock E2E của workflow.

Sau DB postflight, push `main` đúng reviewed SHA và xác minh Pages deployment.

Before pushing `main`, fetch again and stop if `origin/main` moved or is not an
ancestor of the reviewed SHA. Push is a non-force fast-forward refspec:

```bash
EXPECTED_MAIN_SHA="$(git rev-parse origin/main)"
git fetch origin main
test "$(git rev-parse origin/main)" = "$EXPECTED_MAIN_SHA"
git merge-base --is-ancestor origin/main "$REVIEWED_RELEASE_SHA"
git push origin "$REVIEWED_RELEASE_SHA:refs/heads/main"

MAIN_RUN_ID="$(gh run list --workflow deploy.yml --branch main --event push \
  --limit 20 --json databaseId,headSha,createdAt \
  --jq 'map(select(.headSha == env.REVIEWED_RELEASE_SHA)) | sort_by(.createdAt) | last | .databaseId')"
test -n "$MAIN_RUN_ID"
test "$(gh run view "$MAIN_RUN_ID" --json headSha --jq .headSha)" = "$REVIEWED_RELEASE_SHA"
gh run watch "$MAIN_RUN_ID" --exit-status
```

Sau khi `deploy` job thành công, chứng minh deployment `github-pages` trỏ đúng
SHA qua API và URL public trả HTTP 200:

```bash
DEPLOYED_SHA="$(gh api \
  "repos/$GITHUB_REPOSITORY/deployments?sha=$REVIEWED_RELEASE_SHA&environment=github-pages" \
  --jq 'map(select(.sha == env.REVIEWED_RELEASE_SHA)) | sort_by(.created_at) | last | .sha')"
test "$DEPLOYED_SHA" = "$REVIEWED_RELEASE_SHA"
PAGES_URL="$(gh api repos/$GITHUB_REPOSITORY/pages --jq .html_url)"
curl --fail --silent --show-error --location --max-time 30 "$PAGES_URL/" >/dev/null
```

Nếu frontend lỗi sau enforce, giữ server boundary an toàn. Rollback Pages bằng
known successful deploy run hoặc reviewed rollback flow, không force-push:

```bash
test "$(gh run view "$PREVIOUS_PAGES_RUN_ID" --json headSha --jq .headSha)" = "$PREVIOUS_PAGES_SHA"
gh run rerun "$PREVIOUS_PAGES_RUN_ID"
```

Sau rollback phải kiểm tra run terminal-success, deployment API SHA đúng
`PREVIOUS_PAGES_SHA`, HTTP 200 và chạy lại postflight read-only. Các đường gọi
legacy, gồm `scripts/apply-qa-rights-account-manifest.sql`, vẫn bị cấm cho tới
khi enforce postflight hoàn tất.

Evidence cuối chỉ gồm exact SHA, status/count/digest/PASS markers, review 0/0,
backup truth, history/schema-cache approval và Pages metadata/HTTP status. Không
đưa token, UUID list, email/name hoặc raw payload vào evidence công khai.

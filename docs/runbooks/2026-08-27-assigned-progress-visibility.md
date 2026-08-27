# Phát hành quyền Cập nhật tiến độ theo phân công

**Ngày soạn:** 2026-08-27
**Phạm vi:** migration `20260827130000`, checker chỉ đọc, reload schema cache và frontend exact-SHA.
**Trạng thái:** chưa chạy production. Runbook không cấp quyền production; mỗi thao tác backup, apply, migration-history repair, `NOTIFY`, push và deploy cần phê duyệt cửa sổ phát hành riêng.

Release này giữ nguyên `screen_access_mode=enforced` và `item_permissions_mode=preview`. Không đổi role tài khoản, không thêm/xóa phân công, không sửa bản ghi Dữ liệu nguồn và không hạ baseline blocker để làm postflight đạt.

## 1. Chốt SHA và artifact

Người review phải bàn giao `REVIEWED_RELEASE_SHA` là commit cuối đã đạt 0 Critical / 0 Important. Không tự suy SHA đã review từ branch name. `PREVIOUS_PAGES_SHA` là SHA deployment Pages thành công gần nhất lấy từ Pages/deployment API ngay trước cửa sổ; thiếu một trong hai thì dừng.

```bash
set -euo pipefail
test -n "${REVIEWED_RELEASE_SHA:?reviewed exact release SHA is required}"
test -n "${PREVIOUS_PAGES_SHA:?previous successful Pages SHA is required}"
RELEASE_SHA="$(git rev-parse HEAD)"
test "$RELEASE_SHA" = "$REVIEWED_RELEASE_SHA"
test -z "$(git status --porcelain=v1)"
test "$(git branch --show-current)" = 'feat/qa-rights-account-alignment'
git fetch --prune origin
git merge-base --is-ancestor origin/main "$RELEASE_SHA"
test "$(git rev-list --left-right --count origin/main..."$RELEASE_SHA" | awk '{print $1}')" = 0
test "$(git rev-parse origin/main)" = "$(git ls-remote origin refs/heads/main | awk '{print $1}')"
git diff --check origin/main..."$RELEASE_SHA"
```

Hash được duyệt dưới đây là literal, không phải placeholder. Bất kỳ lệch hash nào cũng yêu cầu review mới; không cập nhật biến tại production để bỏ qua lỗi.

```bash
EXPECTED_MIGRATION_SHA256='acf812cb90bbecef73a6c05aefbea106be84b3974acd49660a9342bdc14c284f'
EXPECTED_CHECKER_SHA256='9e60cf49eceb1582d24ff95606ddb161f09ca10cd2544a357998990a302a426d'
EXPECTED_RECOVERY_SHA256='a1bbdd7f8a76ac3e0f50d9252f84bf04331438586b90835761fba4e449f36389'
EXPECTED_WORKFLOW_SHA256='dfb2bec71efd33701606d6440685858ae6838ade3302cf4ff703b91ce996558c'

test "$(sha256sum supabase/migrations/20260827130000_assigned_progress_visibility.sql | awk '{print $1}')" = "$EXPECTED_MIGRATION_SHA256"
test "$(sha256sum scripts/check-assigned-progress-visibility.sql | awk '{print $1}')" = "$EXPECTED_CHECKER_SHA256"
test "$(sha256sum scripts/forward-recover-assigned-progress-visibility.sql | awk '{print $1}')" = "$EXPECTED_RECOVERY_SHA256"
test "$(sha256sum .github/workflows/deploy.yml | awk '{print $1}')" = "$EXPECTED_WORKFLOW_SHA256"
git diff --exit-code "$RELEASE_SHA" -- \
  supabase/migrations/20260827130000_assigned_progress_visibility.sql \
  scripts/check-assigned-progress-visibility.sql \
  scripts/forward-recover-assigned-progress-visibility.sql \
  .github/workflows/deploy.yml
```

Source Data phải giữ đúng hai definition hash và metadata contract đã pin trong checker:

- `rpc_save_catalog_object(text,text,jsonb,text,integer)`: `81fbd19e43d3859cd28cb958fc311f1f8b693f659aca9371155433a0b70a1d29`;
- `rpc_refresh_source_item_assignments()`: `a4bd208fc467a14b9d0383d6af486f59a66f52d8b68d4bc614b92627a73524e7`.

## 2. Kết nối, persona và thư mục bằng chứng

Dùng PostgreSQL service file, không đưa URI có password lên command line. Service file và persona file phải `0600`; thư mục bằng chứng phải `0700`. Persona file ngoài Git đặt đúng năm biến `psql`: `admin_id`, `qa_manager_id`, `assigned_qa_id`, `unassigned_qa_id`, `thien_my_id`. Mỗi giá trị là UUID đã đối chiếu; checker không in UUID/tên/email. `assigned_qa_id` phải có phân công QA hiệu lực, `unassigned_qa_id` không có phân công hiệu lực, và `thien_my_id` phải đúng tài khoản Tôn Nữ Thiện My.

```bash
set -euo pipefail
umask 077
export PGSERVICEFILE='/secure/vmp/assigned-progress-pg-service.conf'
export PGSERVICE='vmp_assigned_progress'
export PERSONA_ID_FILE='/secure/vmp/assigned-progress-personas.psql'
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
export EVIDENCE_DIR="/secure/vmp/backups/assigned-progress-${REVIEWED_RELEASE_SHA}-${STAMP}"

test -f "$PGSERVICEFILE"
test "$(stat -c '%a' "$PGSERVICEFILE")" = 600
test -f "$PERSONA_ID_FILE"
test "$(stat -c '%a' "$PERSONA_ID_FILE")" = 600
install -d -m 700 "$EVIDENCE_DIR"
test "$(stat -c '%a' "$EVIDENCE_DIR")" = 700
```

## 3. Backup PostgreSQL 17 và preflight chỉ đọc

Host `pg_dump` 16 không được dùng cho server PostgreSQL 17. Backup và kiểm restore-list bằng container PostgreSQL 17:

```bash
docker run --rm --network host \
  --mount type=bind,src="$PGSERVICEFILE",dst=/run/secrets/pg_service.conf,ro \
  --mount type=bind,src="$EVIDENCE_DIR",dst=/evidence \
  -e PGSERVICEFILE=/run/secrets/pg_service.conf -e PGSERVICE="$PGSERVICE" \
  postgres:17 pg_dump --dbname="service=$PGSERVICE" --format=custom \
  --no-owner --schema=public --schema=auth --file=/evidence/pre-release.dump

docker run --rm \
  --mount type=bind,src="$EVIDENCE_DIR",dst=/evidence,ro \
  postgres:17 pg_restore --list /evidence/pre-release.dump \
  > "$EVIDENCE_DIR/pre-release.list"
test -s "$EVIDENCE_DIR/pre-release.list"
sha256sum "$EVIDENCE_DIR/pre-release.dump" "$EVIDENCE_DIR/pre-release.list" \
  > "$EVIDENCE_DIR/backup.SHA256SUMS"
sha256sum --check "$EVIDENCE_DIR/backup.SHA256SUMS"
```

Mở kết nối mới và chụp function definitions trước apply. File này chứa code nội bộ, giữ `0600` và không đính kèm ticket công khai.

```bash
psql "service=$PGSERVICE" -X -v ON_ERROR_STOP=1 \
  -o "$EVIDENCE_DIR/function-definitions-before.txt" <<'SQL'
begin read only;
select p.oid::regprocedure,
       encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex') definition_hash,
       owner.rolname,p.prosecdef,p.provolatile,p.proconfig,p.proacl,
       pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
join pg_roles owner on owner.oid=p.proowner
where n.nspname='public' and p.proname in (
  'rpc_update_progress','rpc_update_progress__five_role_impl_20260824',
  'rpc_my_editable_progress_rights','rpc_refresh_source_item_assignments',
  'rpc_save_catalog_object','vmp_item_rights','vmp_allowed_timeline_fields')
order by p.oid::regprocedure::text;
rollback;
SQL
test -s "$EVIDENCE_DIR/function-definitions-before.txt"
```

Baseline production không được waive là 479 blocker (`99a46e1c1a96ea8ea612056d6f596af3`) và 14 warning (`7bc0aa25501a745ddc161e13ef5dab9a`). Checker chỉ ghi marker PASS nếu baseline này, mode `enforced/preview`, Source Data hashes, ACL/search path/wrapper target và persona contracts đều còn nguyên.

## 4. Apply database một lần

Chỉ sau backup và phê duyệt production riêng:

```bash
PGOPTIONS='-c lock_timeout=3s -c statement_timeout=120s' \
psql "service=$PGSERVICE" -X -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260827130000_assigned_progress_visibility.sql \
  > "$EVIDENCE_DIR/apply.log" 2>&1
```

Migration tự sở hữu một transaction. Lỗi trước `COMMIT`, timeout, mất kết nối hoặc xác nhận commit mơ hồ đều là hard stop. Không retry mù; mở connection mới, kiểm definition hash và xác định trạng thái đã commit hay chưa.

## 5. Postflight trên connection mới và migration history

Connection mới số 1, trước schema reload:

```bash
psql "service=$PGSERVICE" -X -v ON_ERROR_STOP=1 \
  -f "$PERSONA_ID_FILE" \
  -f scripts/check-assigned-progress-visibility.sql \
  > "$EVIDENCE_DIR/postflight-before-reload.log" 2>&1
rg '^NOTICE:  PASS ' "$EVIDENCE_DIR/postflight-before-reload.log"
```

Workshop có thể chưa có persona được phân công thật. Marker `PASS CHECK_ASSIGNED_PROGRESS_WORKSHOP_ONE_FIELD assignments=0` chỉ chấp nhận khi checker không tìm thấy fixture thật; không tạo assignment production để ép probe. Các marker còn lại bắt buộc: Admin 9, Quản lý QA 8, QA được phân công 7, QA không phân công rỗng, Tôn Nữ Thiện My không nhận `HT-02/2026.01-OQ`, writer/ACL/Source Data/mode/blocker baseline đúng hash.

Lệnh `psql -f` không tự cập nhật `supabase_migrations.schema_migrations`. Sau postflight đầu tiên đạt và chỉ khi migration-history mutation nằm trong cùng phê duyệt, đối chiếu linked project rồi ghi đúng version:

```bash
supabase migration list --linked > "$EVIDENCE_DIR/migration-list-before.txt"
supabase migration repair --status applied 20260827130000 --linked --yes \
  > "$EVIDENCE_DIR/migration-repair.log" 2>&1
supabase migration list --linked > "$EVIDENCE_DIR/migration-list-after.txt"
test "$(rg -c '20260827130000' "$EVIDENCE_DIR/migration-list-after.txt")" = 1
```

Nếu linked project không chứng minh đúng database/service đang phát hành, dừng và không repair. Release ledger chuẩn gồm exact SHA, ba artifact hash, backup hash, apply log, checker log và migration-list before/after.

## 6. Reload PostgREST rồi postflight lần hai

`NOTIFY` là mutation production và cần authorization. Chỉ chạy sau postflight đầu tiên đạt:

```bash
psql "service=$PGSERVICE" -X -v ON_ERROR_STOP=1 \
  -c "notify pgrst, 'reload schema';" \
  > "$EVIDENCE_DIR/schema-cache-reload.log" 2>&1

psql "service=$PGSERVICE" -X -v ON_ERROR_STOP=1 \
  -f "$PERSONA_ID_FILE" \
  -f scripts/check-assigned-progress-visibility.sql \
  > "$EVIDENCE_DIR/postflight-after-reload.log" 2>&1
cmp <(rg '^NOTICE:  PASS ' "$EVIDENCE_DIR/postflight-before-reload.log") \
    <(rg '^NOTICE:  PASS ' "$EVIDENCE_DIR/postflight-after-reload.log")
```

Sau reload, dùng token read-only đã duyệt gọi `/rest/v1/rpc/rpc_my_editable_progress_rights` cho từng persona. Chỉ lưu HTTP status, số hạng mục, số field 9/8/7/1 và PASS/FAIL; không lưu token, UUID, tên, email, validation-code list hay raw JSON. Không gọi writer production để thử payload cấm; checker hash và local DB security suite là evidence writer.

## 7. Frontend exact-SHA sau database

Local gate trên Node 24 phải mới cho exact SHA:

```bash
npm run typecheck
npm run test:unit
npm run build
bash scripts/run-qa-rights-account-alignment-db-tests.sh
bash scripts/with-preview.sh -- bash -c '
  npm run e2e:progress-rights &&
  node tests/e2e/catalog-workspace.mjs
'
```

Chỉ sau database postflight và independent review đạt mới dispatch quality exact SHA. Workflow hash ở mục 1 phải chứa `e2e:progress-rights`.

```bash
REPO='tienhoandhd-droid/naniVMP'
FEATURE_BRANCH='feat/qa-rights-account-alignment'
gh workflow run deploy.yml --repo "$REPO" --ref "$FEATURE_BRANCH" \
  -f expected_commit="$REVIEWED_RELEASE_SHA"
QUALITY_RUN_ID="$(gh run list --repo "$REPO" --workflow deploy.yml \
  --commit "$REVIEWED_RELEASE_SHA" --event workflow_dispatch --limit 1 \
  --json databaseId --jq '.[0].databaseId')"
test -n "$QUALITY_RUN_ID"
gh run watch "$QUALITY_RUN_ID" --repo "$REPO" --exit-status
test "$(gh run view "$QUALITY_RUN_ID" --repo "$REPO" --json headSha --jq .headSha)" = "$REVIEWED_RELEASE_SHA"
gh run view "$QUALITY_RUN_ID" --repo "$REPO" --json headSha,conclusion,jobs,url \
  > "$EVIDENCE_DIR/quality-run.json"
```

Fast-forward/push main và Pages deploy chỉ theo phê duyệt push/deploy hiện hữu. Xác minh push run, Pages deployment metadata, page HTTP 200 và JS asset HTTP 200 đều gắn đúng `REVIEWED_RELEASE_SHA`; giữ `PREVIOUS_PAGES_SHA` để forward recovery frontend.

## 8. Forward recovery đã review

Không paste `CREATE OR REPLACE FUNCTION` từ backup. Artifact `scripts/forward-recover-assigned-progress-visibility.sql` fail-closed trên exact post-state, transaction-safe và chỉ khôi phục public `rpc_update_progress` về target `rpc_update_progress__five_role_impl_20260824` cùng owner/volatility/security-definer/search path/ACL cũ. Batch RPC mới và private assigned implementation vẫn được giữ nguyên, nhưng private implementation vẫn owner-only. Frontend cũ không gọi batch RPC này.

Khi writer hoặc batch/cache có regression sau commit:

1. dừng frontend rollout và ghi nguyên nhân;
2. xác minh backup cùng `PREVIOUS_PAGES_SHA`;
3. hash-check recovery artifact;
4. apply recovery một lần, không retry mù;
5. redeploy exact `PREVIOUS_PAGES_SHA` và kiểm Pages metadata/HTTP;
6. reload schema cache rồi kiểm exact recovery postconditions. Checker release chính không chạy sau recovery vì nó chủ ý yêu cầu writer target mới.

```bash
test "$(sha256sum scripts/forward-recover-assigned-progress-visibility.sql | awk '{print $1}')" = "$EXPECTED_RECOVERY_SHA256"
PGOPTIONS='-c lock_timeout=3s -c statement_timeout=120s' \
psql "service=$PGSERVICE" -X -v ON_ERROR_STOP=1 \
  -f scripts/forward-recover-assigned-progress-visibility.sql \
  > "$EVIDENCE_DIR/forward-recovery.log" 2>&1
```

Recovery không đổi `item_permissions_mode`, account role, assignment, Source Data row hoặc global blocker baseline. Nếu recovery precondition/postcondition lỗi, transaction rollback và release dừng để review; không sửa function trực tiếp trong production.

## 9. Hard stops

Dừng ngay khi tree dirty, remote base moved, SHA/hash không đúng, review còn Critical/Important, backup/list lỗi, persona file thiếu/sai mode, migration dependency drift, apply mơ hồ, checker thiếu một PASS bắt buộc, Thiện My nhận HT-02, Source Data hash đổi, private EXECUTE bị mở, mode khác `enforced/preview`, blocker baseline đổi, schema reload chưa được duyệt, exact-SHA CI/Pages/HTTP không chứng minh được, hoặc production/push/deploy thiếu authorization.

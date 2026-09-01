# Nền tảng staging và phát hành Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tạo schema có thể tái dựng, staging có restore receipt, áp an toàn bốn migration chờ và hoàn thiện các kiểm soát vận hành production.

**Architecture:** Production chỉ cung cấp schema-only dump và backup truth; mọi restore/migration/persona test chạy trên staging trước. Các thao tác production dùng đúng runbook, exact SHA và kết nối mới cho postflight; credential rotation và network restriction là cutover có inventory/rollback.

**Tech Stack:** PostgreSQL 17 (`pg_dump`, `pg_restore`, `psql`), Supabase CLI 2.113+, PowerShell, SQL contract tests, GitHub Actions.

## Global Constraints

- Không tác động production trước khi staging và bài restore đạt.
- Không ghi secret, DB URL, JWT hoặc password vào repo, log hay command history.
- Không dùng dữ liệu production thật làm seed staging; chỉ dùng seed ẩn danh.
- Thứ tự migration bắt buộc: `1600` → `1700` → `1800` → `0900`.
- Một bản cuối chỉ push sau khi toàn bộ cổng local/staging đạt.

---

### Task 1: Đóng gói công cụ dump và kiểm secret

**Files:**
- Create: `scripts/dump-public-schema.ps1`
- Create: `scripts/check-schema-dump.ps1`
- Test: `tests/ops/schema-dump-contract.ps1`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `SUPABASE_DB_URL` từ environment của tiến trình.
- Produces: `supabase/schema.sql`, `artifacts/schema/schema.sha256`, exit code khác 0 khi dump chứa dữ liệu/secret pattern.

- [ ] **Step 1: Viết contract test thất bại khi chưa có script**

```powershell
$required = @('scripts/dump-public-schema.ps1','scripts/check-schema-dump.ps1')
foreach ($path in $required) { if (-not (Test-Path $path)) { throw "Missing $path" } }
& powershell -NoProfile -File scripts/check-schema-dump.ps1
if ($LASTEXITCODE -ne 0) { throw 'Schema dump contract failed' }
```

- [ ] **Step 2: Chạy test và xác nhận FAIL**

Run: `powershell -NoProfile -File tests/ops/schema-dump-contract.ps1`  
Expected: FAIL với `Missing scripts/dump-public-schema.ps1`.

- [ ] **Step 3: Viết dump script không in connection string**

```powershell
param([string]$Output = 'supabase/schema.sql')
$db = [Environment]::GetEnvironmentVariable('SUPABASE_DB_URL')
if ([string]::IsNullOrWhiteSpace($db)) { throw 'SUPABASE_DB_URL is required' }
& pg_dump $db --schema-only --schema=public --no-owner --no-privileges --quote-all-identifiers --file=$Output
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed' }
& powershell -NoProfile -File scripts/check-schema-dump.ps1 -Path $Output
if ($LASTEXITCODE -ne 0) { throw 'schema validation failed' }
New-Item -ItemType Directory -Force artifacts/schema | Out-Null
(Get-FileHash -Algorithm SHA256 $Output).Hash.ToLowerInvariant() | Set-Content artifacts/schema/schema.sha256
```

Validator từ chối `COPY ... FROM stdin`, `INSERT INTO`, URI có password, JWT,
service-role và các key literal; đồng thời bắt buộc có `vmp_visible_plan_items`,
`vmp_report_snapshots`, `vmp_notifications`, `audit_logs` và các RPC private impl.

- [ ] **Step 4: Chạy validator với fixture an toàn và fixture chứa secret giả**

Run: `powershell -NoProfile -File tests/ops/schema-dump-contract.ps1`  
Expected: PASS; fixture `postgresql://user:fake-secret@host/db` bị từ chối mà output không in chuỗi secret.

- [ ] **Step 5: Commit task**

```powershell
git add .gitignore scripts/dump-public-schema.ps1 scripts/check-schema-dump.ps1 tests/ops/schema-dump-contract.ps1
git commit -m "build: add safe schema dump contract"
```

### Task 2: Dump schema production và chứng minh restore cục bộ

**Files:**
- Create: `supabase/schema.sql`
- Create: `docs/receipts/2026-09-01-schema-restore.md`
- Create: `scripts/restore-schema-smoke.ps1`
- Modify: `artifacts/schema/schema.sha256`

**Interfaces:**
- Consumes: script Task 1 và một PostgreSQL disposable trống.
- Produces: schema snapshot đã rà, receipt chứa hash/count nhưng không chứa credential.

- [ ] **Step 1: Xác minh exact target chỉ đọc**

Run: `psql $env:SUPABASE_DB_URL -X -v ON_ERROR_STOP=1 -c "select current_database(), current_user, current_setting('server_version'), count(*) from pg_namespace where nspname='public';"`  
Expected: đúng project production đã ghi trong cửa sổ phát hành; nếu sai tên/project thì dừng.

- [ ] **Step 2: Dump và rà secret**

Run: `powershell -NoProfile -File scripts/dump-public-schema.ps1`  
Expected: exit 0; `supabase/schema.sql` không có dữ liệu hàng hoặc credential literal.

- [ ] **Step 3: Restore vào DB disposable**

`restore-schema-smoke.ps1` tạo database `vmp_schema_restore_<timestamp>` trên
PostgreSQL local, chạy `psql -f supabase/schema.sql`, kiểm table/function/policy
counts và luôn drop đúng database vừa tạo trong `finally` sau khi đã xác minh
tên khớp regex `^vmp_schema_restore_[0-9]{14}$`.

Run: `powershell -NoProfile -File scripts/restore-schema-smoke.ps1`  
Expected: `PASS SCHEMA RESTORE`.

- [ ] **Step 4: Ghi receipt không chứa secret**

Receipt ghi commit SHA, SHA-256 schema, PostgreSQL version, số table/function/
policy, marker restore và thời điểm Bangkok; không ghi URL/host/user/password.

- [ ] **Step 5: Commit task**

```powershell
git add supabase/schema.sql artifacts/schema/schema.sha256 scripts/restore-schema-smoke.ps1 docs/receipts/2026-09-01-schema-restore.md
git commit -m "chore: capture reproducible production schema"
```

### Task 3: Dựng staging và seed ẩn danh

**Files:**
- Create: `supabase/seed.staging.sql`
- Create: `scripts/check-staging-identity.sql`
- Create: `scripts/check-staging-seed.sql`
- Create: `docs/runbooks/staging-bootstrap.md`
- Test: `tests/sql/staging-seed-contract.sql`

**Interfaces:**
- Consumes: `STAGING_DB_URL`, `supabase/schema.sql`.
- Produces: staging riêng, persona giả `@vmp.invalid`, không chứa email/tên/mã hồ sơ production.

- [ ] **Step 1: Viết SQL identity gate**

```sql
\set ON_ERROR_STOP on
select case when current_database() ~* 'staging|stage|test'
  then 'PASS STAGING IDENTITY'
  else pg_catalog.set_config('vmp.block', 'not-staging', false)
end;
do $$ begin
  if current_database() !~* 'staging|stage|test' then
    raise exception 'REFUSE NON-STAGING DATABASE';
  end if;
end $$;
```

- [ ] **Step 2: Viết seed tối thiểu năm vai và dữ liệu biên**

Seed tạo UUID cố định cho năm persona, hai bộ phận, ba đối tượng và các hạng mục
done/overdue/due-soon/not-started; email chỉ dùng domain `vmp.invalid`. Tất cả
insert idempotent bằng `on conflict do nothing`.

- [ ] **Step 3: Restore schema và seed trên staging**

Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f scripts/check-staging-identity.sql`  
Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f supabase/schema.sql`  
Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f supabase/seed.staging.sql`  
Expected: cả ba exit 0.

- [ ] **Step 4: Chạy seed contract**

Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f tests/sql/staging-seed-contract.sql`  
Expected: `PASS STAGING SEED CONTRACT`, không có email ngoài `vmp.invalid`.

- [ ] **Step 5: Commit task**

```powershell
git add supabase/seed.staging.sql scripts/check-staging-identity.sql scripts/check-staging-seed.sql tests/sql/staging-seed-contract.sql docs/runbooks/staging-bootstrap.md
git commit -m "build: add anonymized staging bootstrap"
```

### Task 4: Diễn tập backup và restore

**Files:**
- Create: `scripts/backup-restore-rehearsal.ps1`
- Create: `scripts/verify-restored-database.sql`
- Create: `docs/runbooks/backup-restore-rehearsal.md`
- Create: `docs/receipts/2026-09-01-backup-restore.md`

**Interfaces:**
- Consumes: `STAGING_DB_URL`, `RESTORE_TARGET_DB_URL` trỏ database cách ly.
- Produces: custom-format backup, checksum và receipt so sánh count/hash/RLS/RPC.

- [ ] **Step 1: Viết verifier read-only**

Verifier mở `begin read only`, đếm table/function/policy, kiểm RLS trên các bảng
nhạy cảm và hash định nghĩa RPC quan trọng bằng `md5(pg_get_functiondef(...))`,
sau đó rollback.

- [ ] **Step 2: Chạy verifier trước restore**

Run: `psql $env:STAGING_DB_URL -X -v ON_ERROR_STOP=1 -f scripts/verify-restored-database.sql`  
Expected: một dòng `VMP_RESTORE_FACTS` có JSON count/hash.

- [ ] **Step 3: Backup và restore cách ly**

Script dùng `pg_dump --format=custom --no-owner`, tính SHA-256, kiểm target name
khớp `restore|rehearsal`, chạy `pg_restore --clean --if-exists --no-owner`, rồi
verifier. Không tự xoá backup; receipt ghi đường dẫn tương đối và hash.

- [ ] **Step 4: So sánh source/restore**

Run: `powershell -NoProfile -File scripts/backup-restore-rehearsal.ps1`  
Expected: `PASS BACKUP RESTORE REHEARSAL`; facts trước/sau giống nhau.

- [ ] **Step 5: Commit task**

```powershell
git add scripts/backup-restore-rehearsal.ps1 scripts/verify-restored-database.sql docs/runbooks/backup-restore-rehearsal.md docs/receipts/2026-09-01-backup-restore.md
git commit -m "ops: add backup restore rehearsal"
```

### Task 5: Apply bốn migration trên staging

**Files:**
- Modify: `docs/runbooks/2026-08-31-fix-bangkok-current-date.md`
- Modify: `docs/runbooks/2026-08-31-client-error-log.md`
- Modify: `docs/runbooks/2026-08-31-close-true-policies.md`
- Modify: `docs/runbooks/2026-09-01-catalog-import-server-preview.md`
- Create: `scripts/apply-pending-migrations-staging.ps1`
- Create: `docs/receipts/2026-09-01-staging-pending-migrations.md`

**Interfaces:**
- Consumes: staging identity gate và bốn migration hiện có.
- Produces: receipt preflight/hash/apply/postflight cho từng migration.

- [ ] **Step 1: Viết orchestrator fail-fast**

Orchestrator kiểm staging identity, ghi SHA-256 bốn file, chạy đúng preflight,
apply từng file bằng `psql -X -v ON_ERROR_STOP=1`, mở connection mới cho
postflight và dừng ngay ở migration đầu tiên không đạt.

- [ ] **Step 2: Chạy preflight-only**

Run: `powershell -NoProfile -File scripts/apply-pending-migrations-staging.ps1 -PreflightOnly`  
Expected: bốn marker preflight PASS; `1800` xác nhận exact contract của
`vmp_visible_plan_items()`.

- [ ] **Step 3: Apply trên staging**

Run: `powershell -NoProfile -File scripts/apply-pending-migrations-staging.ps1`  
Expected: `PASS STAGING PENDING MIGRATIONS`.

- [ ] **Step 4: Chạy persona probes và frontend smoke**

Run: `npm run test:db:five-role`  
Run: `npm run test:db:source-access`  
Run: `npm run e2e:source-access`  
Expected: tất cả PASS; `workshop_staff` không đọc PII hoặc export Source.

- [ ] **Step 5: Commit task**

```powershell
git add scripts/apply-pending-migrations-staging.ps1 docs/runbooks docs/receipts/2026-09-01-staging-pending-migrations.md
git commit -m "ops: rehearse pending migrations on staging"
```

### Task 6: Kiểm JWT n8n và lập cutover credential/network

**Files:**
- Create: `docs/runbooks/n8n-jwt-verification.md`
- Create: `docs/runbooks/credential-network-cutover.md`
- Create: `scripts/check-n8n-jwt.mjs`
- Test: `tests/ops/n8n-jwt-contract.test.mjs`

**Interfaces:**
- Consumes: URL staging n8n/Supabase từ environment và access token thử nghiệm.
- Produces: năm probe JWT, inventory consumer/IP không chứa giá trị secret.

- [ ] **Step 1: Viết test harness năm trường hợp**

```js
const cases = [
  ['valid', process.env.VMP_VALID_ACCESS_TOKEN, 200],
  ['missing', '', 401],
  ['bad-signature', 'eyJhbGciOiJIUzI1NiJ9.e30.invalid', 401],
  ['expired', process.env.VMP_EXPIRED_ACCESS_TOKEN, 401],
  ['inactive', process.env.VMP_INACTIVE_ACCESS_TOKEN, 403],
];
```

Harness chỉ log tên case/status, không log token hoặc response body có PII.

- [ ] **Step 2: Chạy contract local với HTTP mock**

Run: `node --test tests/ops/n8n-jwt-contract.test.mjs`  
Expected: 5 PASS.

- [ ] **Step 3: Kiểm workflow staging đúng prefix dự án**

Chỉ workflow có tên bắt đầu bằng prefix VMP được kiểm. Runbook yêu cầu verify
signature, `exp`, issuer/audience và session active trước node nghiệp vụ.

- [ ] **Step 4: Lập bảng cutover**

Runbook liệt kê consumer theo loại: frontend anon, migration operator, n8n,
CI/E2E và máy vận hành; với mỗi consumer ghi owner, nơi cập nhật secret, IP
egress, probe sau đổi và rollback. Không ghi giá trị credential/IP nhạy cảm vào
repo; IP allowlist thật nằm trong hồ sơ vận hành ngoài repo.

- [ ] **Step 5: Commit task**

```powershell
git add docs/runbooks/n8n-jwt-verification.md docs/runbooks/credential-network-cutover.md scripts/check-n8n-jwt.mjs tests/ops/n8n-jwt-contract.test.mjs
git commit -m "security: add jwt and credential cutover gates"
```

### Task 7: Cửa sổ production

**Files:**
- Create: `docs/receipts/2026-09-01-production-release.md`
- Modify: `docs/handoffs/2026-09-01-ban-giao-codex.md`

**Interfaces:**
- Consumes: receipts Task 2–6, exact release SHA, production dashboard access.
- Produces: production migration/security receipt và handoff đã cập nhật.

- [ ] **Step 1: Xác nhận cổng trước phát hành**

Không tiếp tục nếu thiếu một trong: schema restore PASS, backup restore PASS,
staging migration PASS, persona PASS, n8n JWT PASS, backup/PITR hiện hành và
inventory credential/IP đã ký nhận.

- [ ] **Step 2: Chụp backup truth và preflight production**

Chạy các preflight read-only đúng bốn runbook, lưu facts/hash vào receipt; không
ghi connection string hoặc JWT.

- [ ] **Step 3: Apply tuần tự và postflight bằng connection mới**

Chạy đúng bốn lệnh `psql` trong runbook. Sau mỗi file, mở connection mới, kiểm
postcondition; khi trạng thái commit mơ hồ thì dừng và đọc trạng thái thật,
không retry.

- [ ] **Step 4: Reload schema và persona smoke**

Chỉ sau khi bốn postflight đạt mới `notify pgrst, 'reload schema'`; sau đó smoke
Admin, Quản lý QA và vai thấp cho Source, tiến độ, báo cáo và cảnh báo.

- [ ] **Step 5: Rotation và network restriction theo cutover**

Đổi password, cập nhật từng consumer, probe, rồi mới bật allowlist. Nếu một
consumer không đạt, dùng rollback đã ghi trong runbook và không khoá đường phục
hồi của operator.

- [ ] **Step 6: Commit receipt và handoff**

```powershell
git add docs/receipts/2026-09-01-production-release.md docs/handoffs/2026-09-01-ban-giao-codex.md
git commit -m "docs: seal production release receipt"
```


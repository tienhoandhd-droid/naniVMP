$ErrorActionPreference = 'Stop'

$scriptPath = 'scripts/restore-schema-smoke.ps1'
if (-not (Test-Path -LiteralPath $scriptPath)) { throw "Missing $scriptPath" }

$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("vmp-schema-restore-contract-" + [guid]::NewGuid())
New-Item -ItemType Directory -Force $fixtureRoot | Out-Null

try {
  $schemaPath = Join-Path $fixtureRoot 'schema.sql'
  @'
CREATE TABLE "public"."fixture_table_1" (id integer PRIMARY KEY);
CREATE TABLE "public"."fixture_table_2" (id integer PRIMARY KEY);
CREATE TABLE "public"."fixture_table_3" (id integer PRIMARY KEY);
CREATE FUNCTION "public"."fixture_function_1"() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
CREATE FUNCTION "public"."fixture_function_2"() RETURNS integer LANGUAGE sql AS $$ SELECT 2 $$;
CREATE FUNCTION "public"."fixture_function_3"() RETURNS integer LANGUAGE sql AS $$ SELECT 3 $$;
CREATE FUNCTION "public"."fixture_function_4"() RETURNS integer LANGUAGE sql AS $$ SELECT 4 $$;
CREATE POLICY "fixture_policy_1" ON "public"."fixture_table_1" USING (true);
CREATE POLICY "fixture_policy_2" ON "public"."fixture_table_1" USING (true);
CREATE POLICY "fixture_policy_3" ON "public"."fixture_table_2" USING (true);
CREATE POLICY "fixture_policy_4" ON "public"."fixture_table_2" USING (true);
CREATE POLICY "fixture_policy_5" ON "public"."fixture_table_3" USING (true);
'@ | Set-Content -NoNewline -LiteralPath $schemaPath
  $hashPath = Join-Path $fixtureRoot 'schema.sha256'
  (Get-FileHash -Algorithm SHA256 -LiteralPath $schemaPath).Hash.ToLowerInvariant() |
    Set-Content -NoNewline -LiteralPath $hashPath

  $fakePsql = Join-Path $fixtureRoot 'fake-psql.ps1'
  @'
[CmdletBinding(PositionalBinding = $false)]
param(
  [Parameter(ValueFromPipeline = $true)][AllowEmptyString()][string]$SqlInput,
  [Parameter(ValueFromRemainingArguments = $true)][string[]]$PsqlArguments
)
begin {
  $stdinParts = [Collections.Generic.List[string]]::new()
}
process {
  if ($PSBoundParameters.ContainsKey('SqlInput')) { $stdinParts.Add($SqlInput) }
}
end {
  $line = $PsqlArguments -join "`t"
  Add-Content -LiteralPath $env:VMP_FAKE_PSQL_LOG -Value $line
  $stdinSql = $stdinParts -join [Environment]::NewLine
  if (-not [string]::IsNullOrWhiteSpace($stdinSql)) {
    Add-Content -LiteralPath $env:VMP_FAKE_PSQL_LOG -Value $stdinSql
  }
  $fileArgumentIndex = [Array]::IndexOf($PsqlArguments, '-f')
  $fileArgument = if ($fileArgumentIndex -ge 0 -and $fileArgumentIndex + 1 -lt $PsqlArguments.Count) {
    $PsqlArguments[$fileArgumentIndex + 1]
  } else { '' }
  if ($env:VMP_FAKE_PSQL_FAIL_RESTORE -eq '1' -and $fileArgument -eq $env:VMP_FAKE_SCHEMA_PATH) {
    throw 'simulated restore failure'
  }
  if ($line -match 'server_version_num') {
    if ($env:VMP_FAKE_PSQL_IDENTITY_MISMATCH -eq '1') { 'app_user|postgres|170000' }
    else { 'postgres|postgres|170000' }
  }
  if ($line -match 'auth\.role' -and $line -match 'rpc_active_rules') {
    't'
  }
  if ($line -match 'pg_class' -and $line -match 'pg_policy') {
    if ($env:VMP_FAKE_PSQL_COUNT_MISMATCH -eq '1') { '2|4|5' }
    else { '3|4|5' }
  }
}
'@ | Set-Content -NoNewline -LiteralPath $fakePsql

  $env:VMP_FAKE_PSQL_LOG = Join-Path $fixtureRoot 'success.log'
  $env:VMP_FAKE_SCHEMA_PATH = $schemaPath
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $successOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath `
    -SchemaPath $schemaPath `
    -HashPath $hashPath `
    -PsqlCommand $fakePsql `
    -DatabaseName 'vmp_schema_restore_20260901010101' 2>&1 | Out-String
  $successExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($successExitCode -ne 0) { throw "Successful restore contract failed: $successOutput" }
  if ($successOutput -notmatch 'PASS SCHEMA RESTORE tables=3 functions=4 policies=5') {
    throw "Restore marker/counts were not reported: $successOutput"
  }

  $successCalls = Get-Content -LiteralPath $env:VMP_FAKE_PSQL_LOG
  if (($successCalls | Where-Object { $_ -match 'server_version_num' }).Count -ne 1) {
    throw 'Local PostgreSQL identity was not checked exactly once before mutation'
  }
  if (($successCalls | Where-Object { $_ -match 'CREATE DATABASE "vmp_schema_restore_20260901010101"' }).Count -ne 1) {
    throw 'Disposable database was not created exactly once'
  }
  if (($successCalls | Where-Object { $_ -match 'DROP SCHEMA IF EXISTS public CASCADE' }).Count -ne 1) {
    throw 'Default public schema was not removed exactly once before restore'
  }
  $successLog = Get-Content -Raw -LiteralPath $env:VMP_FAKE_PSQL_LOG
  $prerequisites = @(
    'CREATE SCHEMA IF NOT EXISTS extensions',
    'CREATE SCHEMA IF NOT EXISTS auth',
    'CREATE TABLE auth.users',
    'CREATE FUNCTION auth.role()',
    'CREATE EXTENSION IF NOT EXISTS vector',
    'CREATE EXTENSION IF NOT EXISTS unaccent',
    'CREATE EXTENSION IF NOT EXISTS pg_trgm',
    'CREATE EXTENSION IF NOT EXISTS pgcrypto',
    'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"',
    'CREATE ROLE authenticated'
  )
  if ($prerequisites.Where({ [regex]::Matches($successLog, [regex]::Escape($_)).Count -ne 1 }).Count -gt 0) {
    throw 'Supabase schema prerequisites were not prepared exactly once'
  }
  if ([regex]::Matches($successLog, 'auth\.role').Count -lt 2 -or
      [regex]::Matches($successLog, 'rpc_active_rules').Count -ne 1) {
    throw 'Restored auth dependency and public routine were not probed'
  }
  if ($successLog -notmatch 'policy\.polrelid' -or
      $successLog -notmatch "namespace\.nspname = 'public'") {
    throw 'Policy inventory was not scoped to public tables'
  }
  if (($successCalls | Where-Object { $_ -match 'DROP DATABASE "vmp_schema_restore_20260901010101"' }).Count -ne 1) {
    throw 'Disposable database was not dropped exactly once after success'
  }

  $env:VMP_FAKE_PSQL_LOG = Join-Path $fixtureRoot 'failure.log'
  $env:VMP_FAKE_PSQL_FAIL_RESTORE = '1'
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $failureOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath `
    -SchemaPath $schemaPath `
    -HashPath $hashPath `
    -PsqlCommand $fakePsql `
    -DatabaseName 'vmp_schema_restore_20260901010102' 2>&1 | Out-String
  $failureExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  Remove-Item Env:VMP_FAKE_PSQL_FAIL_RESTORE
  if ($failureExitCode -eq 0) { throw 'Simulated restore failure was accepted' }

  $failureCalls = Get-Content -LiteralPath $env:VMP_FAKE_PSQL_LOG
  if (($failureCalls | Where-Object { $_ -match 'DROP DATABASE "vmp_schema_restore_20260901010102"' }).Count -ne 1) {
    throw 'Disposable database was not dropped exactly once after restore failure'
  }

  $env:VMP_FAKE_PSQL_LOG = Join-Path $fixtureRoot 'invalid-name.log'
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $invalidNameOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath `
    -SchemaPath $schemaPath `
    -HashPath $hashPath `
    -PsqlCommand $fakePsql `
    -DatabaseName 'production' 2>&1 | Out-String
  $invalidNameExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($invalidNameExitCode -eq 0) { throw 'Unsafe database name was accepted' }
  if (Test-Path -LiteralPath $env:VMP_FAKE_PSQL_LOG) { throw 'psql was called for an unsafe database name' }

  $env:VMP_FAKE_PSQL_LOG = Join-Path $fixtureRoot 'non-loopback.log'
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $nonLoopbackOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath `
    -SchemaPath $schemaPath `
    -HashPath $hashPath `
    -PsqlCommand $fakePsql `
    -DatabaseHost 'db.example.test' `
    -DatabaseName 'vmp_schema_restore_20260901010103' 2>&1 | Out-String
  $nonLoopbackExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($nonLoopbackExitCode -eq 0) { throw 'Non-loopback PostgreSQL host was accepted' }
  if (Test-Path -LiteralPath $env:VMP_FAKE_PSQL_LOG) { throw 'psql was called for a non-loopback PostgreSQL host' }

  $env:VMP_FAKE_PSQL_LOG = Join-Path $fixtureRoot 'identity-mismatch.log'
  $env:VMP_FAKE_PSQL_IDENTITY_MISMATCH = '1'
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $identityMismatchOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath `
    -SchemaPath $schemaPath `
    -HashPath $hashPath `
    -PsqlCommand $fakePsql `
    -DatabaseName 'vmp_schema_restore_20260901010104' 2>&1 | Out-String
  $identityMismatchExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  Remove-Item Env:VMP_FAKE_PSQL_IDENTITY_MISMATCH
  if ($identityMismatchExitCode -eq 0) { throw 'Unexpected local PostgreSQL identity was accepted' }
  $identityMismatchCalls = Get-Content -LiteralPath $env:VMP_FAKE_PSQL_LOG
  if ($identityMismatchCalls | Where-Object { $_ -match 'CREATE DATABASE' }) {
    throw 'Database mutation occurred after a PostgreSQL identity mismatch'
  }

  $truncatedSchemaPath = Join-Path $fixtureRoot 'truncated-schema.sql'
  'CREATE TABLE "public"."fixture_table_1" (id integer PRIMARY KEY);' |
    Set-Content -NoNewline -LiteralPath $truncatedSchemaPath
  $env:VMP_FAKE_PSQL_LOG = Join-Path $fixtureRoot 'truncated-schema.log'
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $truncatedOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath `
    -SchemaPath $truncatedSchemaPath `
    -HashPath $hashPath `
    -PsqlCommand $fakePsql `
    -DatabaseName 'vmp_schema_restore_20260901010105' 2>&1 | Out-String
  $truncatedExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($truncatedExitCode -eq 0) { throw 'Truncated schema with a stale hash was accepted' }
  if (Test-Path -LiteralPath $env:VMP_FAKE_PSQL_LOG) { throw 'psql was called before schema hash verification' }

  $env:VMP_FAKE_PSQL_LOG = Join-Path $fixtureRoot 'count-mismatch.log'
  $env:VMP_FAKE_PSQL_COUNT_MISMATCH = '1'
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $countMismatchOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath `
    -SchemaPath $schemaPath `
    -HashPath $hashPath `
    -PsqlCommand $fakePsql `
    -DatabaseName 'vmp_schema_restore_20260901010106' 2>&1 | Out-String
  $countMismatchExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  Remove-Item Env:VMP_FAKE_PSQL_COUNT_MISMATCH
  if ($countMismatchExitCode -eq 0) { throw 'Restored inventory count mismatch was accepted' }
  $countMismatchCalls = Get-Content -LiteralPath $env:VMP_FAKE_PSQL_LOG
  if (($countMismatchCalls | Where-Object { $_ -match 'DROP DATABASE "vmp_schema_restore_20260901010106"' }).Count -ne 1) {
    throw 'Disposable database was not dropped after inventory mismatch'
  }
}
finally {
  Remove-Item Env:VMP_FAKE_PSQL_LOG -ErrorAction SilentlyContinue
  Remove-Item Env:VMP_FAKE_PSQL_FAIL_RESTORE -ErrorAction SilentlyContinue
  Remove-Item Env:VMP_FAKE_PSQL_IDENTITY_MISMATCH -ErrorAction SilentlyContinue
  Remove-Item Env:VMP_FAKE_SCHEMA_PATH -ErrorAction SilentlyContinue
  Remove-Item Env:VMP_FAKE_PSQL_COUNT_MISMATCH -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}

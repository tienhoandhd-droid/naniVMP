$ErrorActionPreference = 'Stop'

$scriptPath = 'scripts/restore-schema-smoke.ps1'
if (-not (Test-Path -LiteralPath $scriptPath)) { throw "Missing $scriptPath" }

$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("vmp-schema-restore-contract-" + [guid]::NewGuid())
New-Item -ItemType Directory -Force $fixtureRoot | Out-Null

try {
  $schemaPath = Join-Path $fixtureRoot 'schema.sql'
  'CREATE TABLE public.fixture_table (id integer PRIMARY KEY);' | Set-Content -NoNewline -LiteralPath $schemaPath

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
  if ($env:VMP_FAKE_PSQL_FAIL_RESTORE -eq '1' -and $PsqlArguments -contains '-f') {
    throw 'simulated restore failure'
  }
  if ($line -match 'pg_class' -and $line -match 'pg_policy') {
    '3|4|5'
  }
}
'@ | Set-Content -NoNewline -LiteralPath $fakePsql

  $env:VMP_FAKE_PSQL_LOG = Join-Path $fixtureRoot 'success.log'
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $successOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath `
    -SchemaPath $schemaPath `
    -PsqlCommand $fakePsql `
    -DatabaseName 'vmp_schema_restore_20260901010101' 2>&1 | Out-String
  $successExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($successExitCode -ne 0) { throw "Successful restore contract failed: $successOutput" }
  if ($successOutput -notmatch 'PASS SCHEMA RESTORE tables=3 functions=4 policies=5') {
    throw "Restore marker/counts were not reported: $successOutput"
  }

  $successCalls = Get-Content -LiteralPath $env:VMP_FAKE_PSQL_LOG
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
  if (($successCalls | Where-Object { $_ -match 'DROP DATABASE "vmp_schema_restore_20260901010101"' }).Count -ne 1) {
    throw 'Disposable database was not dropped exactly once after success'
  }

  $env:VMP_FAKE_PSQL_LOG = Join-Path $fixtureRoot 'failure.log'
  $env:VMP_FAKE_PSQL_FAIL_RESTORE = '1'
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $failureOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath `
    -SchemaPath $schemaPath `
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
    -PsqlCommand $fakePsql `
    -DatabaseName 'production' 2>&1 | Out-String
  $invalidNameExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($invalidNameExitCode -eq 0) { throw 'Unsafe database name was accepted' }
  if (Test-Path -LiteralPath $env:VMP_FAKE_PSQL_LOG) { throw 'psql was called for an unsafe database name' }
}
finally {
  Remove-Item Env:VMP_FAKE_PSQL_LOG -ErrorAction SilentlyContinue
  Remove-Item Env:VMP_FAKE_PSQL_FAIL_RESTORE -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}

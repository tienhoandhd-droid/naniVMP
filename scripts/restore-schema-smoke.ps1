param(
  [string]$SchemaPath = 'supabase/schema.sql',
  [string]$HashPath = 'artifacts/schema/schema.sha256',
  [string]$PsqlCommand = 'psql',
  [string]$DatabaseHost = $(if ($env:VMP_LOCAL_PGHOST) { $env:VMP_LOCAL_PGHOST } else { '127.0.0.1' }),
  [int]$DatabasePort = $(if ($env:VMP_LOCAL_PGPORT) { [int]$env:VMP_LOCAL_PGPORT } else { 5432 }),
  [string]$DatabaseUser = $(if ($env:VMP_LOCAL_PGUSER) { $env:VMP_LOCAL_PGUSER } else { 'postgres' }),
  [string]$AdminDatabase = $(if ($env:VMP_LOCAL_PGDATABASE) { $env:VMP_LOCAL_PGDATABASE } else { 'postgres' }),
  [string]$DatabaseName = ('vmp_schema_restore_{0}' -f (Get-Date -Format 'yyyyMMddHHmmss'))
)

$ErrorActionPreference = 'Stop'

$normalizedDatabaseHost = $DatabaseHost.Trim().ToLowerInvariant()
if ($normalizedDatabaseHost -notin @('localhost', '127.0.0.1', '::1')) {
  throw 'Refusing to run schema restore against a non-loopback PostgreSQL host.'
}
if ($DatabaseName -notmatch '^vmp_schema_restore_[0-9]{14}$') {
  throw 'Refusing to use a database name outside the disposable restore namespace.'
}
if (-not (Test-Path -LiteralPath $SchemaPath -PathType Leaf)) {
  throw 'Schema file is required for restore smoke.'
}
if (-not (Test-Path -LiteralPath $HashPath -PathType Leaf)) {
  throw 'Schema hash artifact is required for restore smoke.'
}

$expectedHash = (Get-Content -Raw -LiteralPath $HashPath).Trim().ToLowerInvariant()
if ($expectedHash -notmatch '^[a-f0-9]{64}$') {
  throw 'Schema hash artifact is invalid.'
}
$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $SchemaPath).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) {
  throw 'Schema hash does not match its reviewed artifact.'
}

$schema = Get-Content -Raw -LiteralPath $SchemaPath
$expectedTables = [regex]::Matches(
  $schema,
  '(?im)^CREATE TABLE\s+(?:"?public"?\.)'
).Count
$expectedFunctions = [regex]::Matches(
  $schema,
  '(?im)^CREATE FUNCTION\s+(?:"?public"?\.)'
).Count
$expectedPolicies = [regex]::Matches(
  $schema,
  '(?im)^CREATE POLICY\b[^\r\n]*\sON\s+(?:"?public"?\.)'
).Count
if ($expectedTables -le 0 -or $expectedFunctions -le 0 -or $expectedPolicies -le 0) {
  throw 'Schema inventory is incomplete for restore smoke.'
}

function Invoke-LocalPsql {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [string]$InputSql
  )

  $connectionArguments = @(
    '-X',
    '-v', 'ON_ERROR_STOP=1',
    '-h', $DatabaseHost,
    '-p', $DatabasePort,
    '-U', $DatabaseUser,
    '-d', $Database
  )
  if ($PSBoundParameters.ContainsKey('InputSql')) {
    $output = $InputSql | & $PsqlCommand @connectionArguments @Arguments 2>&1
  }
  else {
    $output = & $PsqlCommand @connectionArguments @Arguments 2>&1
  }
  if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    throw 'Local psql command failed.'
  }
  return $output
}

$identitySql = "SELECT current_user, current_database(), current_setting('server_version_num')"
$identityOutput = (Invoke-LocalPsql -Database $AdminDatabase -Arguments @(
  '-At', '-F', '|', '-c', $identitySql
) | Out-String).Trim()
if ($identityOutput -notmatch '^postgres\|postgres\|17[0-9]{4}$') {
  throw 'Refusing an unreviewed local PostgreSQL identity.'
}

$created = $false
try {
  Invoke-LocalPsql -Database $AdminDatabase -Arguments @(
    '-c', ('CREATE DATABASE "{0}"' -f $DatabaseName)
  ) | Out-Null
  $created = $true

  Invoke-LocalPsql -Database $DatabaseName -Arguments @(
    '-c', 'DROP SCHEMA IF EXISTS public CASCADE'
  ) | Out-Null
  $prerequisiteSql = @'
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS 'SELECT NULL::text';
DO $do$
BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$do$;
'@
  Invoke-LocalPsql -Database $DatabaseName -Arguments @('-f', '-') -InputSql $prerequisiteSql | Out-Null
  Invoke-LocalPsql -Database $DatabaseName -Arguments @('-f', $SchemaPath) | Out-Null

  $dependencyProbeSql = @'
SELECT auth.uid() IS NULL
   AND auth.role() IS NULL
   AND jsonb_typeof(public.rpc_active_rules()) = 'object';
'@
  $dependencyProbeOutput = (Invoke-LocalPsql -Database $DatabaseName -Arguments @(
    '-At', '-c', $dependencyProbeSql
  ) | Out-String).Trim()
  if ($dependencyProbeOutput -ne 't') {
    throw 'Restored schema dependency probe failed.'
  }

  $countSql = @'
SELECT
  (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p')),
  (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace),
  (SELECT count(*)
     FROM pg_policy policy
     JOIN pg_class relation ON relation.oid = policy.polrelid
     JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public');
'@
  $countOutput = (Invoke-LocalPsql -Database $DatabaseName -Arguments @(
    '-At', '-F', '|', '-c', $countSql
  ) | Out-String).Trim()

  if ($countOutput -notmatch '^(?<tables>[0-9]+)\|(?<functions>[0-9]+)\|(?<policies>[0-9]+)$') {
    throw 'Restore count query returned an invalid result.'
  }

  $actualTables = [int]$Matches.tables
  $actualFunctions = [int]$Matches.functions
  $actualPolicies = [int]$Matches.policies
  if ($actualTables -ne $expectedTables -or
      $actualFunctions -ne $expectedFunctions -or
      $actualPolicies -ne $expectedPolicies) {
    throw 'Restored schema inventory does not match the reviewed snapshot.'
  }

  Write-Output ("PASS SCHEMA RESTORE tables={0} functions={1} policies={2}" -f `
    $actualTables, $actualFunctions, $actualPolicies)
}
finally {
  if ($created) {
    if ($DatabaseName -notmatch '^vmp_schema_restore_[0-9]{14}$') {
      throw 'Refusing to drop a database outside the disposable restore namespace.'
    }

    Invoke-LocalPsql -Database $AdminDatabase -Arguments @(
      '-c', ("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{0}' AND pid <> pg_backend_pid()" -f $DatabaseName)
    ) | Out-Null
    Invoke-LocalPsql -Database $AdminDatabase -Arguments @(
      '-c', ('DROP DATABASE "{0}"' -f $DatabaseName)
    ) | Out-Null
  }
}

param(
  [string]$SchemaPath = 'supabase/schema.sql',
  [string]$PsqlCommand = 'psql',
  [string]$DatabaseHost = $(if ($env:VMP_LOCAL_PGHOST) { $env:VMP_LOCAL_PGHOST } else { '127.0.0.1' }),
  [int]$DatabasePort = $(if ($env:VMP_LOCAL_PGPORT) { [int]$env:VMP_LOCAL_PGPORT } else { 5432 }),
  [string]$DatabaseUser = $(if ($env:VMP_LOCAL_PGUSER) { $env:VMP_LOCAL_PGUSER } else { 'postgres' }),
  [string]$AdminDatabase = $(if ($env:VMP_LOCAL_PGDATABASE) { $env:VMP_LOCAL_PGDATABASE } else { 'postgres' }),
  [string]$DatabaseName = ('vmp_schema_restore_{0}' -f (Get-Date -Format 'yyyyMMddHHmmss'))
)

$ErrorActionPreference = 'Stop'

if ($DatabaseName -notmatch '^vmp_schema_restore_[0-9]{14}$') {
  throw 'Refusing to use a database name outside the disposable restore namespace.'
}
if (-not (Test-Path -LiteralPath $SchemaPath -PathType Leaf)) {
  throw 'Schema file is required for restore smoke.'
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

  $countSql = @'
SELECT
  (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p')),
  (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace),
  (SELECT count(*) FROM pg_policy);
'@
  $countOutput = (Invoke-LocalPsql -Database $DatabaseName -Arguments @(
    '-At', '-F', '|', '-c', $countSql
  ) | Out-String).Trim()

  if ($countOutput -notmatch '^(?<tables>[0-9]+)\|(?<functions>[0-9]+)\|(?<policies>[0-9]+)$') {
    throw 'Restore count query returned an invalid result.'
  }

  Write-Output ("PASS SCHEMA RESTORE tables={0} functions={1} policies={2}" -f `
    $Matches.tables, $Matches.functions, $Matches.policies)
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

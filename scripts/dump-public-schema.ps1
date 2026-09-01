param([string]$Output = 'supabase/schema.sql')

$ErrorActionPreference = 'Stop'
$db = [Environment]::GetEnvironmentVariable('SUPABASE_DB_URL')
if ([string]::IsNullOrWhiteSpace($db)) { throw 'SUPABASE_DB_URL is required' }

$outputDirectory = Split-Path -Parent $Output
if (-not [string]::IsNullOrWhiteSpace($outputDirectory)) {
  New-Item -ItemType Directory -Force $outputDirectory | Out-Null
}

$pgDumpOutput = & pg_dump $db --schema-only --schema=public --no-owner --no-privileges --quote-all-identifiers "--file=$Output" 2>&1
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed' }

& powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-schema-dump.ps1 -Path $Output
if ($LASTEXITCODE -ne 0) { throw 'schema validation failed' }

New-Item -ItemType Directory -Force artifacts/schema | Out-Null
(Get-FileHash -Algorithm SHA256 $Output).Hash.ToLowerInvariant() | Set-Content artifacts/schema/schema.sha256

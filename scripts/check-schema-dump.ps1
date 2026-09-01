param([string]$Path = 'supabase/schema.sql')

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Path)) {
  exit 0
}

$schema = Get-Content -Raw -LiteralPath $Path
$schemaWithoutSqlLiterals = [regex]::Replace(
  $schema,
  '(?s)(?<tag>\$[a-z_][a-z0-9_]*\$|\$\$).*?\k<tag>',
  ''
)
$schemaWithoutSqlLiterals = [regex]::Replace(
  $schemaWithoutSqlLiterals,
  "(?s)'(?:''|[^'])*'",
  "''"
)

$topLevelDataPatterns = @(
  '(?im)^\s*COPY\s+.+\s+FROM\s+stdin\s*;',
  '(?im)^\s*INSERT\s+INTO\b'
)

foreach ($pattern in $topLevelDataPatterns) {
  if ($schemaWithoutSqlLiterals -match $pattern) {
    Write-Error 'Schema dump contains prohibited data or credential material.'
    exit 1
  }
}

$credentialPatterns = @(
  '(?i)postgres(?:ql)?://[^\s/:@]+:[^\s@]+@',
  '(?i)eyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+',
  '(?i)\bsb_(?:secret|publishable)_[a-z0-9_-]+',
  '(?i)\b(?:supabase[_-]?)?service[_-]?role[_-]?(?:key|secret|token)\b\s*[:=]\s*[\x27\x22]?[a-z0-9._-]{8,}',
  '(?i)(api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*[\x27\x22]?[a-z0-9_-]{8,}'
)

foreach ($pattern in $credentialPatterns) {
  if ($schema -match $pattern) {
    Write-Error 'Schema dump contains prohibited data or credential material.'
    exit 1
  }
}

$requiredPatterns = @(
  '(?i)\bvmp_visible_plan_items\b',
  '(?i)\bvmp_report_snapshots\b',
  '(?i)\bvmp_notifications\b',
  '(?i)\baudit_logs\b',
  '(?im)^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\.)?"?rpc_[a-z0-9_]*__[a-z0-9_]+_impl_[0-9]+"?\s*\('
)

foreach ($pattern in $requiredPatterns) {
  if ($schema -notmatch $pattern) {
    Write-Error 'Schema dump is missing a required public schema contract object.'
    exit 1
  }
}

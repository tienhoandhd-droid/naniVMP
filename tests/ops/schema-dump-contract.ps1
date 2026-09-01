$ErrorActionPreference = 'Stop'

$required = @('scripts/dump-public-schema.ps1','scripts/check-schema-dump.ps1')
foreach ($path in $required) { if (-not (Test-Path $path)) { throw "Missing $path" } }
& powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-schema-dump.ps1
if ($LASTEXITCODE -ne 0) { throw 'Schema dump contract failed' }

$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("vmp-schema-dump-contract-" + [guid]::NewGuid())
New-Item -ItemType Directory -Force $fixtureRoot | Out-Null

try {
  $safeFixture = Join-Path $fixtureRoot 'safe-schema.sql'
  @'
CREATE TABLE public.vmp_report_snapshots (id uuid PRIMARY KEY);
CREATE TABLE public.vmp_notifications (id uuid PRIMARY KEY);
CREATE TABLE public.audit_logs (id uuid PRIMARY KEY);
CREATE FUNCTION public.vmp_visible_plan_items() RETURNS SETOF public.vmp_report_snapshots LANGUAGE sql AS $$ SELECT * FROM public.vmp_report_snapshots; $$;
CREATE FUNCTION public.rpc_apply_plan_item_private() RETURNS void LANGUAGE sql AS $$ SELECT; $$;
'@ | Set-Content -NoNewline $safeFixture

  & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-schema-dump.ps1 -Path $safeFixture
  if ($LASTEXITCODE -ne 0) { throw 'Safe schema fixture was rejected' }

  $incompleteFixture = Join-Path $fixtureRoot 'incomplete-schema.sql'
  'CREATE TABLE public.audit_logs (id uuid PRIMARY KEY);' | Set-Content -NoNewline $incompleteFixture
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $incompleteOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-schema-dump.ps1 -Path $incompleteFixture 2>&1 | Out-String
  $incompleteExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($incompleteExitCode -eq 0) { throw 'Incomplete schema fixture was accepted' }

  $secretFixture = Join-Path $fixtureRoot 'secret-schema.sql'
  @'
CREATE TABLE public.vmp_report_snapshots (id uuid PRIMARY KEY);
CREATE TABLE public.vmp_notifications (id uuid PRIMARY KEY);
CREATE TABLE public.audit_logs (id uuid PRIMARY KEY);
CREATE FUNCTION public.vmp_visible_plan_items() RETURNS SETOF public.vmp_report_snapshots LANGUAGE sql AS $$ SELECT * FROM public.vmp_report_snapshots; $$;
CREATE FUNCTION public.rpc_apply_plan_item_private() RETURNS void LANGUAGE sql AS $$ SELECT; $$;
-- postgresql://user:fake-secret@host/db
'@ | Set-Content -NoNewline $secretFixture

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $secretOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-schema-dump.ps1 -Path $secretFixture 2>&1 | Out-String
  $secretExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($secretExitCode -eq 0) { throw 'Secret schema fixture was accepted' }
  if ($secretOutput -match 'fake-secret') { throw 'Validator output leaked secret fixture content' }
}
finally {
  if (Test-Path $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}

$ErrorActionPreference = 'Stop'

$required = @('scripts/dump-public-schema.ps1','scripts/check-schema-dump.ps1')
foreach ($path in $required) { if (-not (Test-Path $path)) { throw "Missing $path" } }
$missingSchemaPath = Join-Path ([System.IO.Path]::GetTempPath()) ("vmp-missing-schema-" + [guid]::NewGuid() + '.sql')
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$missingOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-schema-dump.ps1 -Path $missingSchemaPath 2>&1 | Out-String
$missingExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
if ($missingExitCode -eq 0) { throw 'Missing schema file was accepted' }

$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("vmp-schema-dump-contract-" + [guid]::NewGuid())
New-Item -ItemType Directory -Force $fixtureRoot | Out-Null

try {
  $safeFixture = Join-Path $fixtureRoot 'safe-schema.sql'
  @'
CREATE TABLE public.vmp_report_snapshots (id uuid PRIMARY KEY);
CREATE TABLE public.vmp_notifications (id uuid PRIMARY KEY);
CREATE TABLE public.audit_logs (id uuid PRIMARY KEY);
CREATE TABLE public.schema_role_fixture (role_name text DEFAULT 'service_role');
COMMENT ON TABLE public.schema_role_fixture IS 'reviewed by service_role';
CREATE FUNCTION public.vmp_visible_plan_items() RETURNS SETOF public.vmp_report_snapshots LANGUAGE sql AS $$ SELECT * FROM public.vmp_report_snapshots; $$;
CREATE FUNCTION public.rpc_apply_plan_item__five_role_impl_20260824() RETURNS void LANGUAGE sql AS $$ SELECT; $$;
CREATE FUNCTION public.fixture_insert_private() RETURNS void LANGUAGE plpgsql AS $function$
BEGIN
  INSERT INTO public.schema_role_fixture(role_name) VALUES ('service_role');
END;
$function$;
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

  $inventedPrivateFixture = Join-Path $fixtureRoot 'invented-private-schema.sql'
  (Get-Content -Raw $safeFixture).Replace(
    'rpc_apply_plan_item__five_role_impl_20260824',
    'rpc_apply_plan_item_private'
  ) | Set-Content -NoNewline $inventedPrivateFixture
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $inventedPrivateOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-schema-dump.ps1 -Path $inventedPrivateFixture 2>&1 | Out-String
  $inventedPrivateExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($inventedPrivateExitCode -eq 0) { throw 'Invented private RPC fixture was accepted' }

  $rowDataFixture = Join-Path $fixtureRoot 'row-data-schema.sql'
  $safeSchema = Get-Content -Raw $safeFixture
  ($safeSchema + [Environment]::NewLine + "INSERT INTO public.schema_role_fixture(role_name) VALUES ('qa_manager');") | Set-Content -NoNewline $rowDataFixture
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $rowDataOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-schema-dump.ps1 -Path $rowDataFixture 2>&1 | Out-String
  $rowDataExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($rowDataExitCode -eq 0) { throw 'Top-level row data fixture was accepted' }

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

  $literalSecretFixtures = @(
    @{ Name = 'prefix-key'; Content = '-- sb_secret_fixture_value_12345678'; Literal = 'sb_secret_fixture_value_12345678' },
    @{ Name = 'service-role'; Content = "-- SUPABASE_SERVICE_ROLE_KEY='credential-fixture-value'"; Literal = 'credential-fixture-value' },
    @{ Name = 'password-assignment'; Content = "-- PASSWORD='credential-fixture-value'"; Literal = 'credential-fixture-value' }
  )
  foreach ($fixture in $literalSecretFixtures) {
    $literalFixture = Join-Path $fixtureRoot ($fixture.Name + '-schema.sql')
    $safeSchema = Get-Content -Raw $safeFixture
    ($safeSchema + [Environment]::NewLine + $fixture.Content) | Set-Content -NoNewline $literalFixture

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $literalOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-schema-dump.ps1 -Path $literalFixture 2>&1 | Out-String
    $literalExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference
    if ($literalExitCode -eq 0) { throw "Literal secret fixture was accepted: $($fixture.Name)" }
    if ($literalOutput -match [regex]::Escape($fixture.Literal)) { throw "Validator output leaked literal fixture content: $($fixture.Name)" }
  }
}
finally {
  if (Test-Path $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}

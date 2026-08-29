import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = "tests/evidence/source-access-db-pg17.json";
const protectedFiles = Object.freeze([
  "scripts/parse-five-role-local-db.mjs",
  "scripts/run-source-qa-workshop-access-db-tests.sh",
  "supabase/migrations/20260826130000_catalog_progressed_deadline_override.sql",
  "supabase/migrations/20260826170000_manual_planned_deadline_edit.sql",
  "supabase/migrations/20260826180000_qa_manager_actual_date_principal_normalization.sql",
  "supabase/migrations/20260827100000_qa_rights_account_alignment.sql",
  "supabase/migrations/20260827130000_assigned_progress_visibility.sql",
  "supabase/migrations/20260828100000_assigned_progress_preflight_allowlist.sql",
  "supabase/migrations/20260828130000_admin_only_management_visibility.sql",
  "supabase/migrations/20260828140000_source_qa_workshop_access_expand.sql",
  "supabase/migrations/20260828150000_source_qa_workshop_access_enforce.sql",
  "tests/sql/source-qa-workshop-access.sql",
  "tests/sql/source-qa-workshop-access-security.sql",
  "tests/sql/source-qa-workshop-access-performance.sql",
]);
const requiredPhases = Object.freeze([
  "expand",
  "enforce-failure-before-repair",
  "enforce-failure-after-repair",
  "behavior",
  "security",
  "performance",
]);
const requiredEvidenceFields = Object.freeze([
  "schemaVersion",
  "engine",
  "postgresVersion",
  "command",
  "status",
  "completedAt",
  "phases",
  "topLevelAssertions",
  "cloneSurvivors",
  "outputSha256",
  "files",
]);
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoUtcTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

async function hashRegularFile(relativePath, root = repoDir) {
  const absolutePath = resolve(root, relativePath);
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
    throw new Error(`unsafe protected file: ${relativePath}`);
  }
  return createHash("sha256").update(await readFile(absolutePath)).digest("hex");
}

async function readEvidenceFile(root, relativePath) {
  const absolutePath = resolve(root, relativePath);
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
    throw new Error(`unsafe evidence file: ${relativePath}`);
  }
  return readFile(absolutePath, "utf8");
}

export async function verifySourceAccessDbEvidence(options = {}) {
  const verificationRepoDir = resolve(options.repoDir ?? repoDir);
  const verificationEvidencePath = options.evidencePath ?? evidencePath;
  const evidence = JSON.parse(
    await readEvidenceFile(verificationRepoDir, verificationEvidencePath),
  );
  if (evidence === null || typeof evidence !== "object" || Array.isArray(evidence)
    || JSON.stringify(Object.keys(evidence).sort())
      !== JSON.stringify([...requiredEvidenceFields].sort())) {
    throw new Error("invalid Source access DB evidence contract");
  }
  if (evidence.schemaVersion !== 1 || evidence.engine !== "PostgreSQL 17"
    || evidence.postgresVersion !== "17.6"
    || evidence.status !== "passed"
    || evidence.command !== "npm run test:db:source-access"
    || typeof evidence.completedAt !== "string"
    || !isoUtcTimestampPattern.test(evidence.completedAt)
    || Number.isNaN(Date.parse(evidence.completedAt))
    || evidence.topLevelAssertions !== 75
    || evidence.cloneSurvivors !== 0) {
    throw new Error("invalid Source access DB evidence contract");
  }
  if (typeof evidence.outputSha256 !== "string"
    || !sha256Pattern.test(evidence.outputSha256)) {
    throw new Error("invalid Source access DB output digest");
  }
  if (JSON.stringify(evidence.phases) !== JSON.stringify(requiredPhases)) {
    throw new Error("incomplete Source access DB phase evidence");
  }
  if (JSON.stringify(Object.keys(evidence.files ?? {}).sort())
    !== JSON.stringify([...protectedFiles].sort())) {
    throw new Error("incomplete Source access DB protected-file inventory");
  }

  for (const relativePath of protectedFiles) {
    const expected = evidence.files[relativePath];
    if (!sha256Pattern.test(expected ?? "")
      || await hashRegularFile(relativePath, verificationRepoDir) !== expected) {
      throw new Error(`stale Source access DB evidence: ${relativePath}`);
    }
  }

  return {
    engine: evidence.engine,
    status: evidence.status,
    protectedFileCount: protectedFiles.length,
    outputSha256: evidence.outputSha256,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifySourceAccessDbEvidence()
    .then((result) => process.stdout.write(
      `PASS sealed Source access DB evidence ${result.engine} files=${result.protectedFileCount} output=${result.outputSha256}\n`,
    ))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}

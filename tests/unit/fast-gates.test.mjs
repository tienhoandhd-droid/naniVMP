import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  collectChangedPaths,
  loadManifest,
  selectGates,
} from "../../scripts/fast-gates/select.mjs";

const execFile = promisify(execFileCallback);
const MANIFEST_PATH = new URL("../../scripts/fast-gates/surfaces.json", import.meta.url);
const FOCUSED_GATES = {
  "account-administration": ["diff-check", "typecheck", "unit-account", "preview-admin"],
  "catalog-workspace": ["diff-check", "typecheck", "unit-catalog", "preview-catalog"],
  progress: ["diff-check", "typecheck", "unit-progress", "preview-progress-rights"],
  timeline: ["diff-check", "typecheck", "unit-timeline", "preview-gialap"],
  today: ["diff-check", "typecheck", "unit-today", "preview-gialap"],
  "docs-only": ["diff-check"],
};

async function runGit(repoDir, ...args) {
  return execFile("git", args, {
    cwd: repoDir,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
}

async function writeRepositoryFile(repoDir, relativePath, contents = "fixture\n") {
  const path = join(repoDir, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

async function createRepository(initialFiles) {
  const repoDir = await mkdtemp(join(tmpdir(), "vmp-fast-gates-"));
  await runGit(repoDir, "init", "--quiet");
  await runGit(repoDir, "config", "user.email", "tests@example.invalid");
  await runGit(repoDir, "config", "user.name", "Fast gates tests");

  for (const [path, contents] of Object.entries(initialFiles)) {
    await writeRepositoryFile(repoDir, path, contents);
  }
  await runGit(repoDir, "add", ".");
  await runGit(repoDir, "commit", "--quiet", "-m", "initial");
  const { stdout } = await runGit(repoDir, "rev-parse", "HEAD");

  return { repoDir, baseSha: stdout.trim() };
}

function select(manifest, changedPaths, options = {}) {
  return selectGates({
    manifest,
    changedPaths,
    baseSha: Object.hasOwn(options, "baseSha") ? options.baseSha : "base-sha",
    headSha: "head-sha",
    finalMode: options.finalMode ?? false,
  });
}

test("known feature paths union focused gates in stable order", async () => {
  const manifest = await loadManifest(MANIFEST_PATH);

  const selection = select(manifest, [
    "src/features/today/TodayPage.tsx",
    "src/features/accountAdministration/AccountForm.tsx",
  ]);

  assert.equal(selection.mode, "focused");
  assert.deepEqual(selection.matchedRuleIds, ["account-administration", "today"]);
  assert.deepEqual(selection.gates, [
    ...FOCUSED_GATES["account-administration"],
    "unit-today",
    "preview-gialap",
  ]);
});

test("committed staged unstaged untracked deleted and both rename paths are collected", async (t) => {
  const { repoDir, baseSha } = await createRepository({
    "src/features/itemPermissions/deleted.ts": "delete me\n",
    "src/features/accountAdministration/old-name.ts": "rename me\n",
  });
  t.after(() => rm(repoDir, { recursive: true, force: true }));

  await writeRepositoryFile(repoDir, "src/features/progress/committed.ts");
  await runGit(repoDir, "add", ".");
  await runGit(repoDir, "commit", "--quiet", "-m", "committed change");

  await writeRepositoryFile(repoDir, "src/features/timeline/staged.ts");
  await runGit(repoDir, "add", "src/features/timeline/staged.ts");
  await writeRepositoryFile(repoDir, "src/features/today/unstaged.ts");
  await writeRepositoryFile(repoDir, "src/features/catalogWorkspace/untracked.ts");
  await unlink(join(repoDir, "src/features/itemPermissions/deleted.ts"));
  await rename(
    join(repoDir, "src/features/accountAdministration/old-name.ts"),
    join(repoDir, "src/features/accountAdministration/new-name.ts"),
  );
  await runGit(repoDir, "add", "-A", "src/features/accountAdministration");

  const changedPaths = await collectChangedPaths({ repoDir, baseSha });

  assert.deepEqual(changedPaths, [
    "src/features/accountAdministration/new-name.ts",
    "src/features/accountAdministration/old-name.ts",
    "src/features/catalogWorkspace/untracked.ts",
    "src/features/itemPermissions/deleted.ts",
    "src/features/progress/committed.ts",
    "src/features/timeline/staged.ts",
    "src/features/today/unstaged.ts",
  ]);
});

test("unknown path and malformed or empty manifest select full_fallback", async () => {
  const manifest = await loadManifest(MANIFEST_PATH);

  assert.equal(select(manifest, ["src/unmapped/change.ts"]).mode, "full_fallback");
  assert.equal(select(manifest, ["../outside-repository.ts"]).mode, "full_fallback");
  assert.equal(select({}, ["docs/guide.md"]).mode, "full_fallback");
  assert.equal(select(null, ["docs/guide.md"]).mode, "full_fallback");
});

test("missing base and selector package workflow config auth Supabase or SQL changes select full_fallback", async () => {
  const manifest = await loadManifest(MANIFEST_PATH);
  const fallbackPaths = [
    "scripts/fast-gates/select.mjs",
    "package.json",
    ".github/workflows/deploy.yml",
    "vite.config.ts",
    "src/lib/access.ts",
    "src/hooks/useAccess.ts",
    "src/lib/supabaseClient.ts",
    "src/types/database.ts",
    "supabase/migrations/20260828.sql",
    "scripts/run-db-check.mjs",
    "tests/sql/rights.sql",
  ];

  assert.equal(select(manifest, ["docs/guide.md"], { baseSha: null }).mode, "full_fallback");
  for (const path of fallbackPaths) {
    assert.equal(select(manifest, [path]).mode, "full_fallback", path);
  }
});

test("final mode always selects full_fallback", async () => {
  const manifest = await loadManifest(MANIFEST_PATH);

  const selection = select(manifest, ["src/features/progress/ProgressPage.tsx"], {
    finalMode: true,
  });

  assert.equal(selection.mode, "full_fallback");
  assert.deepEqual(selection.gates, []);
});

test("odd filenames are data and cannot add a gate or command", async (t) => {
  const { repoDir, baseSha } = await createRepository({ "README.md": "initial\n" });
  t.after(() => rm(repoDir, { recursive: true, force: true }));
  const oddPath = "src/features/today/$(touch injected)-;--not-a-gate.ts";
  await writeRepositoryFile(repoDir, oddPath);

  const manifest = await loadManifest(MANIFEST_PATH);
  const changedPaths = await collectChangedPaths({ repoDir, baseSha });
  const selection = select(manifest, changedPaths, { baseSha });

  assert.deepEqual(changedPaths, [oddPath]);
  assert.deepEqual(selection.gates, FOCUSED_GATES.today);
  assert.equal(selection.gates.includes("injected"), false);
  assert.equal(selection.gates.some((gate) => gate.includes(";")), false);
});

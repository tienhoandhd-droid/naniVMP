import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const NODE = process.execPath;
const ROOT = new URL("../..", import.meta.url);
const BROWSER_EXECUTABLE = path.join(
  process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(homedir(), ".cache", "ms-playwright"),
  "chromium-1234",
  "chrome-linux64",
  "chrome",
);

async function readRepositoryFile(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function runRuntime(...args) {
  return spawnSync(NODE, ["--import", "tsx", "scripts/check-visual-runtime.mjs", ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

const BASELINE_PATHS = [
  "chromium-linux",
  "chromium-1366-linux",
  "chromium-1920-linux",
].flatMap((project) => [
  "bao-cao-dark.png",
  "bao-cao-light.png",
  "dang-nhap-light.png",
  "danh-muc-dark.png",
  "danh-muc-light.png",
  "hom-nay-dark.png",
  "hom-nay-light.png",
  "tien-do-dark.png",
  "tien-do-light.png",
  "timeline-dark.png",
  "timeline-light.png",
  "tong-quan-dark.png",
  "tong-quan-light.png",
].map((name) => `${project}/${name}`));

const FIXTURE_TREE_SHA256 = "7e8af642f9115bf95aea72bf320aa4c8f0d760cbb4998ec795760ec719ae6109";
const SEAL_PREFIX = [
  "VISUAL_TIMEZONE=Asia/Bangkok",
  "VISUAL_CHANNEL=chromium",
  "PLAYWRIGHT_VERSION=1.62.1",
  "CHROMIUM_REVISION=1234",
  "CHROMIUM_VERSION=151.0.7922.34",
  "CHROMIUM_EXECUTABLE_SHA256=0b20b130e7edd9dd51873be867761295fe0cfad490c2b9a64f95bd3cfc08fa71",
  "PLATFORM=linux-x64-ubuntu-24.04",
  "BASELINE_PNG_COUNT=39",
];

function fixtureSeal(treeDigest = FIXTURE_TREE_SHA256) {
  return [...SEAL_PREFIX, `BASELINE_TREE_SHA256=${treeDigest}`, ""].join("\n");
}

function createBaselineFixture() {
  const fixture = path.join(tmpdir(), `visual-runtime-contract-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const scripts = path.join(fixture, "scripts");
  const baselines = path.join(fixture, "tests", "visual", "baselines");
  mkdirSync(scripts, { recursive: true });
  mkdirSync(baselines, { recursive: true });
  cpSync(new URL("../../scripts/check-visual-runtime.mjs", import.meta.url), path.join(scripts, "check-visual-runtime.mjs"));
  symlinkSync(path.join(ROOT.pathname, "node_modules"), path.join(fixture, "node_modules"), "dir");
  writeFileSync(path.join(fixture, "package.json"), JSON.stringify({ devDependencies: { "@playwright/test": "^1.62.1" } }));
  writeFileSync(path.join(fixture, "playwright.visual.config.ts"), [
    'import { defineConfig } from "@playwright/test";',
    'export default defineConfig({ use: { timezoneId: "Asia/Bangkok", channel: "chromium" } });',
    "",
  ].join("\n"));

  for (const relativePath of BASELINE_PATHS) {
    const target = path.join(baselines, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, `fixture:${relativePath}\n`);
  }

  return fixture;
}

function runFixture(fixture, ...args) {
  return spawnSync(NODE, ["--import", "tsx", "scripts/check-visual-runtime.mjs", ...args], {
    cwd: fixture,
    encoding: "utf8",
  });
}

function runFixtureWithBrowserRoot(fixture, browserRoot, ...args) {
  return spawnSync(NODE, ["--import", "tsx", "scripts/check-visual-runtime.mjs", ...args], {
    cwd: fixture,
    encoding: "utf8",
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browserRoot },
  });
}

test("effective visual config fixes Bangkok time and Playwright's bundled Chromium", () => {
  const loaded = spawnSync(NODE, ["--import", "tsx", "--input-type=module", "-e",
    "import config from './playwright.visual.config.ts'; console.log(JSON.stringify({ timezoneId: config.use.timezoneId, channel: config.use.channel }));"], {
    cwd: ROOT,
    encoding: "utf8",
  });

  assert.equal(loaded.status, 0, loaded.stderr);
  assert.deepEqual(JSON.parse(loaded.stdout), { timezoneId: "Asia/Bangkok", channel: "chromium" });
});

test("package exposes the exact visual runtime and baseline lifecycle commands", async () => {
  const packageJson = JSON.parse(await readRepositoryFile("package.json"));

  assert.deepEqual(
    {
      runtime: packageJson.scripts["visual:runtime"],
      seal: packageJson.scripts["visual:baseline:seal"],
      contract: packageJson.scripts["visual:contract"],
    },
    {
      runtime: "node --import tsx scripts/check-visual-runtime.mjs --runtime",
      seal: "node --import tsx scripts/check-visual-runtime.mjs --write-baseline-contract",
      contract: "node --import tsx scripts/check-visual-runtime.mjs --verify-baseline",
    },
  );
});

test("runtime verifier seals the Linux visual inputs and rejects invalid modes", () => {
  const metadata = statSync(BROWSER_EXECUTABLE);
  const digest = createHash("sha256").update(readFileSync(BROWSER_EXECUTABLE)).digest("hex");

  assert.equal(metadata.isFile(), true);
  assert.equal(metadata.nlink, 1);
  assert.notEqual(metadata.mode & 0o111, 0);
  assert.equal(digest, "0b20b130e7edd9dd51873be867761295fe0cfad490c2b9a64f95bd3cfc08fa71");

  const runtime = runRuntime("--runtime");
  assert.equal(runtime.status, 0, runtime.stderr || runtime.stdout);
  assert.match(runtime.stdout, /Visual runtime contract verified/u);

  for (const args of [[], ["--unknown"]]) {
    const rejected = runRuntime(...args);
    assert.notEqual(rejected.status, 0, args.join(" ") || "missing mode");
    assert.match(rejected.stderr, /mode|required|not implemented/u);
  }
});

test("runtime verifier rejects a symlinked bundled Chromium executable before hashing", (t) => {
  const fixture = createBaselineFixture();
  const browserRoot = path.join(fixture, "browser-root");
  const symlinkedExecutable = path.join(browserRoot, "chromium-1234", "chrome-linux64", "chrome");
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  mkdirSync(path.dirname(symlinkedExecutable), { recursive: true });
  symlinkSync(BROWSER_EXECUTABLE, symlinkedExecutable);

  const runtime = runFixtureWithBrowserRoot(fixture, browserRoot, "--runtime");
  assert.notEqual(runtime.status, 0);
  assert.match(runtime.stderr, /bundled Chromium executable path must not be a symlink/u);
});

test("baseline seal is an atomic writer-0600 single-link exact ordered tree contract that verification only reads", (t) => {
  const fixture = createBaselineFixture();
  t.after(() => rmSync(fixture, { recursive: true, force: true }));

  const seal = runFixture(fixture, "--write-baseline-contract");
  assert.equal(seal.status, 0, seal.stderr || seal.stdout);

  const contract = path.join(fixture, "tests", "visual", "baseline-contract.env");
  assert.equal(readFileSync(contract, "utf8"), fixtureSeal());
  const sealedMetadata = statSync(contract);
  assert.equal(sealedMetadata.mode & 0o777, 0o600);
  assert.equal(sealedMetadata.nlink, 1);

  const verified = runFixture(fixture, "--verify-baseline");
  assert.equal(verified.status, 0, verified.stderr || verified.stdout);
  const verifiedMetadata = statSync(contract);
  assert.equal(verifiedMetadata.ino, sealedMetadata.ino);
  assert.equal(verifiedMetadata.mtimeMs, sealedMetadata.mtimeMs);

  chmodSync(contract, 0o644);
  const checkoutMode = runFixture(fixture, "--verify-baseline");
  assert.equal(checkoutMode.status, 0, checkoutMode.stderr || checkoutMode.stdout);
  const checkoutMetadata = statSync(contract);
  assert.equal(checkoutMetadata.ino, sealedMetadata.ino);
  assert.equal(checkoutMetadata.mtimeMs, sealedMetadata.mtimeMs);
  assert.equal(checkoutMetadata.mode & 0o777, 0o644);

  chmodSync(contract, 0o755);
  const executableSeal = runFixture(fixture, "--verify-baseline");
  assert.notEqual(executableSeal.status, 0);
  assert.match(executableSeal.stderr, /baseline seal must not be executable/u);
  chmodSync(contract, 0o600);

  writeFileSync(contract, `${fixtureSeal()}EXTRA=1\n`);
  const extraKey = runFixture(fixture, "--verify-baseline");
  assert.notEqual(extraKey.status, 0);
  assert.match(extraKey.stderr, /baseline seal line/u);

  writeFileSync(contract, [
    ...SEAL_PREFIX,
    "BASELINE_PNG_COUNT=39",
    `BASELINE_TREE_SHA256=${FIXTURE_TREE_SHA256}`,
    "",
  ].join("\n"));
  const duplicateKey = runFixture(fixture, "--verify-baseline");
  assert.notEqual(duplicateKey.status, 0);
  assert.match(duplicateKey.stderr, /baseline seal line/u);

  const sealTarget = path.join(fixture, "seal-target.env");
  writeFileSync(sealTarget, fixtureSeal());
  chmodSync(sealTarget, 0o600);
  rmSync(contract);
  symlinkSync(sealTarget, contract);
  const symlinkedSeal = runFixture(fixture, "--verify-baseline");
  assert.notEqual(symlinkedSeal.status, 0);
  assert.match(symlinkedSeal.stderr, /baseline seal path must not be a symlink/u);

  rmSync(contract);
  writeFileSync(contract, fixtureSeal());
  chmodSync(contract, 0o600);
  const replacedBaseline = path.join(fixture, "tests", "visual", "baselines", BASELINE_PATHS[0]);
  const originalBaseline = statSync(replacedBaseline);
  renameSync(replacedBaseline, `${replacedBaseline}.old`);
  writeFileSync(replacedBaseline, "replacement\n");
  assert.notEqual(statSync(replacedBaseline).ino, originalBaseline.ino);
  const drift = runFixture(fixture, "--verify-baseline");
  assert.notEqual(drift.status, 0);
  assert.match(drift.stderr, /baseline PNG tree digest drifted/u);

  rmSync(replacedBaseline);
  symlinkSync(`${replacedBaseline}.old`, replacedBaseline);
  const symlinkedBaseline = runFixture(fixture, "--verify-baseline");
  assert.notEqual(symlinkedBaseline.status, 0);
  assert.match(symlinkedBaseline.stderr, /baseline path must not be a symlink/u);

  rmSync(contract);
  const missingSeal = runFixture(fixture, "--verify-baseline");
  assert.notEqual(missingSeal.status, 0);
  assert.match(missingSeal.stderr, /baseline seal is missing/u);
});

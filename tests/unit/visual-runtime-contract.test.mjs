import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const PINNED_NODE = "/home/admin1/.nvm/versions/node/v24.18.0/bin/node";
const ROOT = new URL("../..", import.meta.url);

async function readRepositoryFile(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function runRuntime(...args) {
  return spawnSync(PINNED_NODE, ["--import", "tsx", "scripts/check-visual-runtime.mjs", ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

test("effective visual config fixes Bangkok time and Playwright's bundled Chromium", () => {
  const loaded = spawnSync(PINNED_NODE, ["--import", "tsx", "--input-type=module", "-e",
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

test("runtime verifier seals the Linux visual inputs and rejects every deferred mode", () => {
  const executable = "/home/admin1/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
  const metadata = statSync(executable);
  const digest = createHash("sha256").update(readFileSync(executable)).digest("hex");

  assert.equal(metadata.isFile(), true);
  assert.equal(metadata.nlink, 1);
  assert.notEqual(metadata.mode & 0o111, 0);
  assert.equal(digest, "0b20b130e7edd9dd51873be867761295fe0cfad490c2b9a64f95bd3cfc08fa71");

  const runtime = runRuntime("--runtime");
  assert.equal(runtime.status, 0, runtime.stderr || runtime.stdout);
  assert.match(runtime.stdout, /Visual runtime contract verified/u);

  for (const args of [[], ["--unknown"], ["--write-baseline-contract"], ["--verify-baseline"]]) {
    const rejected = runRuntime(...args);
    assert.notEqual(rejected.status, 0, args.join(" ") || "missing mode");
    assert.match(rejected.stderr, /mode|required|not implemented/u);
  }
});

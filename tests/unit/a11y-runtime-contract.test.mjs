import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const NODE = process.execPath;
const ROOT = new URL("../..", import.meta.url);

function loadAccessibilityChannel(ci) {
  const env = { ...process.env };
  if (ci) {
    env.CI = "1";
  } else {
    delete env.CI;
  }

  const loaded = spawnSync(NODE, [
    "--import",
    "tsx",
    "--input-type=module",
    "-e",
    "import config from './playwright.a11y.config.ts'; console.log(JSON.stringify({ channel: config.use.channel }));",
  ], {
    cwd: ROOT,
    encoding: "utf8",
    env,
  });

  assert.equal(loaded.status, 0, loaded.stderr);
  return JSON.parse(loaded.stdout).channel;
}

test("accessibility config always selects Playwright's bundled Chromium", () => {
  assert.deepEqual(
    { ci: loadAccessibilityChannel(true), local: loadAccessibilityChannel(false) },
    { ci: "chromium", local: "chromium" },
  );
});

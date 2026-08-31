import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const yml = await readFile(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8");
const block = (a, b) => yml.slice(yml.indexOf(`  ${a}:`), b ? yml.indexOf(`  ${b}:`) : yml.length);

test("release build is gated by drift and axe", () => {
  assert.match(block("static-quality", "source-access-db-contract"), /npm run drift/u);
  assert.match(block("a11y", "production-build"), /needs:\s*static-quality[\s\S]*npm run a11y/u);
  const build = block("production-build", "deploy");
  for (const need of ["static-quality", "source-access-db-contract", "e2e-mock", "a11y"])
    assert.match(build, new RegExp(`- ${need}`));
});

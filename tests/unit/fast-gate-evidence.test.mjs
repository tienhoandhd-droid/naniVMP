import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertNodeVersion,
  executeGateRun,
  resolveGatePlan,
} from "../../scripts/fast-gates/run.mjs";
import { runPreviewSuites } from "../../scripts/fast-gates/run-preview-suites.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fixtureDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), "vmp-fast-gate-evidence-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function fakeSpawner(events, calls) {
  return async ({ command, args, onOutput }) => {
    calls.push({ command, args });
    const event = events.shift() ?? { code: 0, output: "ok\n" };
    onOutput(event.output ?? "", "stdout");
    return { code: event.code ?? 0, signal: event.signal ?? null };
  };
}

test("registry rejects unknown gates and Node versions other than v24.18.0", () => {
  assert.throws(() => assertNodeVersion("v22.0.0"), /v24\.18\.0/u);
  assert.throws(() => resolveGatePlan({ gates: ["not-a-gate"] }), /unknown gate/u);
});

test("duplicate gates are executed once in stable order", () => {
  const plan = resolveGatePlan({
    gates: ["typecheck", "diff-check", "typecheck", "unit-today", "diff-check"],
    exists: () => true,
  });

  assert.deepEqual(plan.map(({ id }) => id), ["typecheck", "diff-check", "unit-today"]);
});

test("catalog gate covers the catalog warning surface", () => {
  const [catalogGate] = resolveGatePlan({ gates: ["unit-catalog"], exists: () => true });

  assert.ok(catalogGate.args.includes("tests/unit/catalog-warnings-summary.test.mjs"));
});

test("preview suites share one with-preview invocation and remain allowlisted", async () => {
  const plan = resolveGatePlan({
    gates: ["preview-admin", "preview-gialap", "preview-admin", "preview-catalog"],
    exists: () => true,
  });

  assert.equal(plan.length, 1);
  assert.deepEqual(plan.at(-1), {
    id: "preview",
    command: "bash",
    args: [
      "scripts/with-preview.sh",
      "--",
      "node",
      "scripts/fast-gates/run-preview-suites.mjs",
      "admin",
      "gialap",
      "catalog",
    ],
  });
  const calls = [];
  const result = await runPreviewSuites({
    suiteIds: ["catalog", "admin"],
    spawnRunner: async (entry) => {
      calls.push(entry);
      return { code: 0, signal: null };
    },
  });
  assert.equal(result.code, 0);
  assert.deepEqual(calls.map(({ command, args }) => [command, args]), [
    ["npm", ["run", "e2e:catalog"]],
    ["npm", ["run", "e2e:admin"]],
  ]);
  await assert.rejects(runPreviewSuites({ suiteIds: ["catalog", "shell"] }), /unknown preview suite/u);
});

test("failed command or interrupt cannot produce a passing receipt", async (t) => {
  const directory = await fixtureDirectory(t);
  const calls = [];
  for (const event of [{ code: 1 }, { code: null, signal: "SIGINT" }]) {
    const receiptPath = join(directory, `${calls.length}.json`);
    const receipt = await executeGateRun({
      selection: { mode: "focused", gates: ["diff-check"] },
      receiptPath,
      stateHome: directory,
      nodeVersion: "v24.18.0",
      exists: () => true,
      spawnCommand: fakeSpawner([event], calls),
      output: () => {},
    });
    assert.notEqual(receipt.status, "passed");
    assert.equal(receipt.gates[0].status, event.signal ? "incomplete" : "failed");
  }
});

test("raw log hash and byte count match the closed file", async (t) => {
  const directory = await fixtureDirectory(t);
  const receipt = await executeGateRun({
    selection: { mode: "focused", gates: ["diff-check"] },
    receiptPath: join(directory, "receipt.json"),
    stateHome: directory,
    nodeVersion: "v24.18.0",
    exists: () => true,
    spawnCommand: fakeSpawner([{ output: "first\nsecond\n" }], []),
    output: () => {},
  });
  const rawLog = await readFile(join(directory, "vmp-fast-gates", receipt.rawLog.runId, receipt.rawLog.file));

  assert.equal(receipt.rawLog.sha256, sha256(rawLog));
  assert.equal(receipt.rawLog.bytes, rawLog.byteLength);
});

test("receipt redacts URL email UUID and secret sentinels by construction", async (t) => {
  const directory = await fixtureDirectory(t);
  const receiptPath = join(directory, "receipt.json");
  await executeGateRun({
    selection: { mode: "focused", gates: ["diff-check"], baseSha: "base" },
    receiptPath,
    stateHome: join(directory, "state-TOKEN=sentinel"),
    nodeVersion: "v24.18.0",
    exists: () => true,
    spawnCommand: fakeSpawner([{
      output: "https://secret.example test@example.invalid 123e4567-e89b-12d3-a456-426614174000 TOKEN=sentinel\n",
    }], []),
    output: () => {},
  });

  const receiptText = await readFile(receiptPath, "utf8");
  assert.doesNotMatch(receiptText, /https:\/\//u);
  assert.doesNotMatch(receiptText, /@example\.invalid/u);
  assert.doesNotMatch(receiptText, /123e4567/u);
  assert.doesNotMatch(receiptText, /sentinel/u);
});

test("receipt is atomically replaced and incomplete cleanup is failed", async (t) => {
  const directory = await fixtureDirectory(t);
  const receiptPath = join(directory, "receipt.json");
  await writeFile(receiptPath, "old receipt");
  const receipt = await executeGateRun({
    selection: { mode: "focused", gates: ["diff-check"] },
    receiptPath,
    stateHome: directory,
    nodeVersion: "v24.18.0",
    exists: () => true,
    spawnCommand: fakeSpawner([{ code: null, signal: "SIGTERM", output: "partial\n" }], []),
    output: () => {},
  });

  const saved = JSON.parse(await readFile(receiptPath, "utf8"));
  assert.equal(saved.status, "incomplete");
  assert.equal(receipt.status, "incomplete");
  assert.equal((await readFile(receiptPath, "utf8")).includes("old receipt"), false);
});

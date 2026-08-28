import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertNodeVersion,
  createOrderedWriter,
  executeGateRun,
  main,
  resolveGatePlan,
  runCli,
  terminateProcessGroup,
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

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu;
const SHA256 = "a".repeat(64);
const BASE_SHA = "b".repeat(40);
const HEAD_SHA = "c".repeat(40);

function focusedSelection() {
  return {
    schemaVersion: 1,
    mode: "focused",
    baseSha: BASE_SHA,
    headSha: HEAD_SHA,
    dirtyTreeSha256: SHA256,
    changedPathsSha256: SHA256,
    manifestSha256: SHA256,
    matchedRuleIds: ["docs-only"],
    reasons: ["focused-rules"],
    gates: ["diff-check"],
  };
}

test("registry rejects unknown gates and Node versions other than v24.18.0", () => {
  assert.throws(() => assertNodeVersion("v22.0.0"), /v24\.18\.0/u);
  assert.throws(() => resolveGatePlan({ gates: ["not-a-gate"] }), /unknown gate/u);
});

test("failed Node version is retained in the receipt evidence", async (t) => {
  const directory = await fixtureDirectory(t);
  const receipt = await executeGateRun({
    selection: focusedSelection(),
    receiptPath: join(directory, "wrong-node.json"),
    stateHome: directory,
    nodeVersion: "v22.0.0",
    output: () => {},
  });

  assert.equal(receipt.status, "failed");
  assert.equal(receipt.nodeVersion, "v22.0.0");
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

test("receipt records complete sanitized evidence with UTC monotonic timing and no UUID", async (t) => {
  const directory = await fixtureDirectory(t);
  const wallClock = [new Date("2026-08-28T01:02:03.000Z"), new Date("2026-08-28T01:02:04.000Z")];
  const monotonic = [100, 120, 140, 175];
  const receipt = await executeGateRun({
    selection: focusedSelection(),
    receiptPath: join(directory, "receipt.json"),
    stateHome: directory,
    nodeVersion: "v24.18.0",
    exists: () => true,
    spawnCommand: fakeSpawner([{ output: "ok\n" }], []),
    output: () => {},
    now: () => wallClock.shift(),
    monotonicNow: () => monotonic.shift(),
  });

  assert.deepEqual(receipt.selection, focusedSelection());
  assert.deepEqual(receipt.gates[0].argv, ["git", "diff", "--check"]);
  assert.equal(receipt.nodeVersion, "v24.18.0");
  assert.equal(receipt.startedAtUtc, "2026-08-28T01:02:03.000Z");
  assert.equal(receipt.finishedAtUtc, "2026-08-28T01:02:04.000Z");
  assert.equal(receipt.durationMs, 75);
  assert.deepEqual(receipt.exit, { code: 0, signal: null });
  assert.deepEqual(receipt.cleanup, {
    result: "not_required",
    termSent: false,
    killSent: false,
    closed: true,
  });
  assert.deepEqual(Object.keys(receipt).sort(), [
    "cleanup",
    "durationMs",
    "errorKind",
    "exit",
    "finishedAtUtc",
    "gates",
    "nodeVersion",
    "rawLog",
    "requiresFullGate",
    "schemaVersion",
    "selection",
    "startedAtUtc",
    "status",
  ]);
  assert.doesNotMatch(JSON.stringify(receipt), UUID);
});

test("raw writes are serialized in emitted stdout and stderr order", async () => {
  const values = [];
  const writer = createOrderedWriter(async (value) => {
    if (value === "stdout-first") await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
    values.push(value);
  });

  await Promise.all([
    writer.append("stdout-first"),
    writer.append("stderr-second"),
    writer.append("stdout-third"),
  ]);

  assert.deepEqual(values, ["stdout-first", "stderr-second", "stdout-third"]);
});

test("selection and argument failures still write a failed requested receipt", async (t) => {
  const directory = await fixtureDirectory(t);
  const receiptPath = join(directory, "selection-failure.json");
  const receipt = await runCli(["--selection", "missing.json", "--receipt", receiptPath], {
    repoDir: directory,
    readSelection: async () => { throw new Error("selection unavailable"); },
    stateHome: directory,
    nodeVersion: "v24.18.0",
    output: () => {},
  });

  assert.equal(receipt.status, "failed");
  assert.equal(JSON.parse(await readFile(receiptPath, "utf8")).status, "failed");
  const argumentReceiptPath = join(directory, "argument-failure.json");
  const argumentReceipt = await runCli(["--unknown", "--receipt", argumentReceiptPath], {
    repoDir: directory,
    stateHome: directory,
    nodeVersion: "v24.18.0",
    output: () => {},
  });
  assert.equal(argumentReceipt.status, "failed");
  assert.equal(JSON.parse(await readFile(argumentReceiptPath, "utf8")).status, "failed");
});

test("raw log close failure writes a failed receipt", async (t) => {
  const directory = await fixtureDirectory(t);
  const receipt = await executeGateRun({
    selection: focusedSelection(),
    receiptPath: join(directory, "close-failure.json"),
    stateHome: directory,
    nodeVersion: "v24.18.0",
    exists: () => true,
    rawLogFactory: async () => ({ handle: { write: async () => {} } }),
    spawnCommand: fakeSpawner([{ output: "partial\n" }], []),
    rawLogFinalizer: async () => { throw new Error("close failed"); },
    output: () => {},
  });

  assert.equal(receipt.status, "failed");
  assert.equal(receipt.rawLog.closed, false);
});

test("raw log setup failure still writes a failed requested receipt", async (t) => {
  const directory = await fixtureDirectory(t);
  const receiptPath = join(directory, "raw-log-setup-failure.json");
  const receipt = await executeGateRun({
    selection: focusedSelection(),
    receiptPath,
    stateHome: directory,
    nodeVersion: "v24.18.0",
    rawLogFactory: async () => { throw new Error("state unavailable"); },
    output: () => {},
  });

  assert.equal(receipt.status, "failed");
  assert.equal(receipt.rawLog.closed, false);
  assert.equal(JSON.parse(await readFile(receiptPath, "utf8")).status, "failed");
});

test("owned process group receives TERM then closes descendants", async (t) => {
  const child = spawn(process.execPath, ["-e", [
    "const { spawn } = require('node:child_process');",
    "const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
    "process.stdout.write(String(grandchild.pid));",
    "setInterval(() => {}, 1000);",
  ].join(" ")], { detached: true, stdio: ["ignore", "pipe", "ignore"] });
  t.after(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} });
  const grandchildPid = Number(await new Promise((resolvePid) => child.stdout.once("data", (data) => resolvePid(data.toString()))));

  const cleanup = await terminateProcessGroup({ child, timeoutMs: 500 });

  assert.deepEqual(cleanup, {
    result: "terminated",
    termSent: true,
    killSent: false,
    closed: true,
  });
  assert.throws(() => process.kill(grandchildPid, 0), /ESRCH/u);
});

test("owned process group escalates to KILL when a descendant ignores TERM", async (t) => {
  const child = spawn(process.execPath, ["-e", [
    "const { spawn } = require('node:child_process');",
    "const grandchild = spawn(process.execPath, ['-e', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)\"], { stdio: 'ignore' });",
    "process.stdout.write(String(grandchild.pid));",
    "setInterval(() => {}, 1000);",
  ].join(" ")], { detached: true, stdio: ["ignore", "pipe", "ignore"] });
  t.after(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} });
  const grandchildPid = Number(await new Promise((resolvePid) => child.stdout.once("data", (data) => resolvePid(data.toString()))));
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));

  const cleanup = await terminateProcessGroup({ child, timeoutMs: 75, pollIntervalMs: 10 });

  assert.equal(cleanup.result, "terminated");
  assert.equal(cleanup.termSent, true);
  assert.equal(cleanup.killSent, true);
  assert.equal(cleanup.closed, true);
  assert.throws(() => process.kill(-child.pid, 0), /ESRCH/u);
  assert.throws(() => process.kill(grandchildPid, 0), /ESRCH/u);
});

test("rejected raw writer flush still invokes the raw finalizer and fails the receipt", async (t) => {
  const directory = await fixtureDirectory(t);
  let finalized = false;
  const receipt = await executeGateRun({
    selection: focusedSelection(),
    receiptPath: join(directory, "flush-failure.json"),
    stateHome: directory,
    nodeVersion: "v24.18.0",
    exists: () => true,
    rawLogFactory: async () => ({ handle: { write: async () => { throw new Error("write failed"); } } }),
    rawLogFinalizer: async () => {
      finalized = true;
      return { closed: true, bytes: 0, sha256: SHA256 };
    },
    spawnCommand: fakeSpawner([{ output: "broken\n" }], []),
    output: () => {},
  });

  assert.equal(finalized, true);
  assert.equal(receipt.status, "failed");
});

test("receipt-write failure removes the atomic temporary and is not retried as selection failure", async (t) => {
  const directory = await fixtureDirectory(t);
  const receiptPath = join(directory, "receipt-target");
  await mkdir(receiptPath);
  await assert.rejects(executeGateRun({
    selection: focusedSelection(),
    receiptPath,
    stateHome: directory,
    nodeVersion: "v24.18.0",
    exists: () => true,
    spawnCommand: fakeSpawner([{ output: "ok\n" }], []),
    output: () => {},
  }));
  assert.equal((await readdir(directory)).some((entry) => entry.startsWith("receipt-target.tmp-")), false);

  let writes = 0;
  await assert.rejects(runCli(["--selection", "fixture.json", "--receipt", join(directory, "write-failure.json")], {
    repoDir: directory,
    readSelection: async () => ({ mode: "full_fallback" }),
    writeReceipt: async () => { writes += 1; throw new Error("receipt write failed"); },
    output: () => {},
  }));
  assert.equal(writes, 1);
});

test("signal received before the runner controller produces an incomplete receipt", async (t) => {
  const directory = await fixtureDirectory(t);
  t.after(() => { process.exitCode = undefined; });
  const listeners = new Map();
  const signalSource = {
    once(signal, listener) { listeners.set(signal, listener); },
    removeListener(signal) { listeners.delete(signal); },
  };
  const receipt = await main([], {
    signalSource,
    runner: async (_argv, options) => {
      listeners.get("SIGTERM")("SIGTERM");
      return executeGateRun({
        selection: focusedSelection(),
        receiptPath: join(directory, "pre-controller-signal.json"),
        stateHome: directory,
        nodeVersion: "v24.18.0",
        exists: () => true,
        spawnCommand: fakeSpawner([{ output: "should-not-run\n" }], []),
        onRunController: options.onRunController,
        output: () => {},
      });
    },
  });

  assert.equal(receipt.status, "incomplete");
  assert.equal(receipt.exit.signal, "SIGTERM");
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
  const [runDirectory] = await readdir(join(directory, "vmp-fast-gates"));
  const rawLog = await readFile(join(directory, "vmp-fast-gates", runDirectory, "raw.log"));

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

test("receipt rejects UUID-shaped selection identifiers", async (t) => {
  const directory = await fixtureDirectory(t);
  const selection = focusedSelection();
  selection.matchedRuleIds = ["123e4567-e89b-12d3-a456-426614174000"];
  selection.reasons = ["123e4567-e89b-12d3-a456-426614174000"];
  selection.gates = ["123e4567-e89b-12d3-a456-426614174000"];
  const receipt = await executeGateRun({
    selection,
    receiptPath: join(directory, "uuid-selection.json"),
    stateHome: directory,
    nodeVersion: "v24.18.0",
    output: () => {},
  });

  assert.doesNotMatch(JSON.stringify(receipt), UUID);
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

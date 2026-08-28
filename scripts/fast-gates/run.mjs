import { spawn, execFile as execFileCallback } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, open, readFile, rename, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const REQUIRED_NODE_VERSION = "v24.18.0";
const ID = /^[a-z0-9][a-z0-9-]*$/u;
const SHA = /^[a-f0-9]{40,64}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu;
const PREVIEW_GATE_SUITES = Object.freeze({
  "preview-gialap": "gialap", "preview-catalog": "catalog", "preview-progress-rights": "progress-rights", "preview-admin": "admin",
});

export const UNIT_FILES = Object.freeze({
  "unit-account": Object.freeze(["tests/unit/account-administration-integration.test.mjs", "tests/unit/account-administration-model.test.mjs", "tests/unit/account-administration-panel.test.mjs", "tests/unit/account-role-editor.test.mjs", "tests/unit/admin-only-management.test.mjs", "tests/unit/item-permission-contracts.test.mjs", "tests/unit/permission-scope.test.mjs"]),
  "unit-catalog": Object.freeze(["tests/unit/catalog-field-groups.test.mjs", "tests/unit/catalog-form.test.mjs", "tests/unit/catalog-impact-preview.test.mjs", "tests/unit/catalog-suggestions.test.mjs", "tests/unit/catalog-timeline-override-model.test.mjs", "tests/unit/catalog-warnings-summary.test.mjs", "tests/unit/catalog-workbook.test.mjs", "tests/unit/catalog-workspace-diff.test.mjs", "tests/unit/catalog-workspace-filter-model.test.mjs"]),
  "unit-progress": Object.freeze(["tests/unit/editable-progress-rights.test.mjs", "tests/unit/progress-deep-link.test.mjs", "tests/unit/progress-modal-access-revocation.test.mjs", "tests/unit/progress-modal-operation-target.test.mjs", "tests/unit/progress-workspace-model.test.mjs"]),
  "unit-timeline": Object.freeze(["tests/unit/planned-deadline-api.test.mjs", "tests/unit/planned-deadline-dialog.test.mjs", "tests/unit/planned-deadline-edit-model.test.mjs", "tests/unit/timeline-filter-model.test.mjs", "tests/unit/timeline-summary-model.test.mjs"]),
  "unit-today": Object.freeze(["tests/unit/today-command-center.test.mjs", "tests/unit/today-model.test.mjs", "tests/unit/today-scope.test.mjs"]),
});

function command(id, executable, args) { return Object.freeze({ id, command: executable, args: Object.freeze(args) }); }
const FIXED_GATES = Object.freeze({
  "diff-check": Object.freeze([command("diff-check", "git", ["diff", "--check"])]),
  typecheck: Object.freeze([command("typecheck", "npm", ["run", "typecheck"])]),
  "unit-account": Object.freeze([command("unit-account", "node", ["--import", "tsx", "--test", ...UNIT_FILES["unit-account"]])]),
  "unit-catalog": Object.freeze([command("unit-catalog", "node", ["--import", "tsx", "--test", ...UNIT_FILES["unit-catalog"]])]),
  "unit-progress": Object.freeze([command("unit-progress", "node", ["--import", "tsx", "--test", ...UNIT_FILES["unit-progress"]])]),
  "unit-timeline": Object.freeze([command("unit-timeline", "node", ["--import", "tsx", "--test", ...UNIT_FILES["unit-timeline"]])]),
  "unit-today": Object.freeze([command("unit-today", "node", ["--import", "tsx", "--test", ...UNIT_FILES["unit-today"]])]),
  "full-unit": Object.freeze([command("full-unit", "npm", ["run", "test:unit"])]),
  "full-static": Object.freeze([command("full-static", "npm", ["run", "typecheck"]), command("full-static", "npm", ["run", "test:unit"])]),
});

export function assertNodeVersion(version = process.version) { if (version !== REQUIRED_NODE_VERSION) throw new Error(`fast gates require Node ${REQUIRED_NODE_VERSION}`); }
function unique(values) { return [...new Set(values)]; }
function fileExists(path) { return existsSync(resolve(process.cwd(), path)); }
function assertKnownGate(gateId) { if (!Object.hasOwn(FIXED_GATES, gateId) && !Object.hasOwn(PREVIEW_GATE_SUITES, gateId)) throw new Error(`unknown gate: ${gateId}`); }
function previewCommand(suiteIds) { return command("preview", "bash", ["scripts/with-preview.sh", "--", "node", "scripts/fast-gates/run-preview-suites.mjs", ...suiteIds]); }

export function resolveGatePlan({ gates, finalMode = false, exists = fileExists }) {
  const requested = finalMode ? ["diff-check", "full-static", "full-preview"] : gates;
  if (!Array.isArray(requested)) throw new Error("invalid gate list");
  const plan = [];
  const previewSuites = [];
  for (const gateId of unique(requested)) {
    if (gateId === "full-preview") previewSuites.push("gialap", "catalog", "progress-rights", "admin");
    else {
      assertKnownGate(gateId);
      if (Object.hasOwn(PREVIEW_GATE_SUITES, gateId)) previewSuites.push(PREVIEW_GATE_SUITES[gateId]);
      else plan.push(...FIXED_GATES[gateId]);
    }
  }
  for (const file of unique(plan.flatMap(({ id }) => UNIT_FILES[id] ?? []))) if (!exists(file)) throw new Error(`missing unit test file: ${file}`);
  if (previewSuites.length > 0) plan.push(previewCommand(unique(previewSuites)));
  return plan;
}

function defaultStateHome() { return process.env.XDG_STATE_HOME || resolve(process.env.HOME || ".", ".local/state"); }
async function makeRawLog(stateHome, runId = randomUUID()) {
  const directory = resolve(stateHome, "vmp-fast-gates", runId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const path = resolve(directory, "raw.log");
  return { path, handle: await open(path, "wx", 0o600) };
}
async function finalizeRawLog(rawLog) {
  let failure = null;
  try { await rawLog.handle.sync(); } catch (error) { failure = error; }
  try { await rawLog.handle.close(); } catch (error) { failure ??= error; }
  if (failure) throw failure;
  const contents = await readFile(rawLog.path);
  return { closed: true, bytes: (await stat(rawLog.path)).size, sha256: createHash("sha256").update(contents).digest("hex") };
}
async function writeAtomicJson(path, value) {
  const destination = resolve(path);
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8"); await handle.sync(); } finally { await handle.close(); }
  await chmod(temporary, 0o600);
  await rename(temporary, destination);
}

export function createOrderedWriter(write) {
  let tail = Promise.resolve();
  return { append(value) { tail = tail.then(() => write(value)); return tail; }, flush() { return tail; } };
}

function defaultSpawnCommand({ command: executable, args, cwd, onOutput, onChild }) {
  return new Promise((resolveResult) => {
    const child = spawn(executable, args, { cwd, shell: false, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    onChild?.(child);
    child.stdout.on("data", (data) => onOutput(data, "stdout"));
    child.stderr.on("data", (data) => onOutput(data, "stderr"));
    child.once("error", () => resolveResult({ code: 1, signal: null }));
    child.once("close", (code, signal) => resolveResult({ code, signal }));
  });
}

function waitForClose(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolveClose) => child.once("close", resolveClose));
}
export async function terminateProcessGroup({ child, timeoutMs = 1000, kill = process.kill, wait = waitForClose }) {
  if (!child?.pid) return { result: "not_required", termSent: false, killSent: false, closed: true };
  const close = wait(child);
  let termSent = false;
  let killSent = false;
  try { kill(-child.pid, "SIGTERM"); termSent = true; } catch (error) { if (error?.code !== "ESRCH") throw error; }
  let timeout;
  const closedAfterTerm = await Promise.race([
    close.then(() => true),
    new Promise((resolveTimeout) => { timeout = setTimeout(() => resolveTimeout(false), timeoutMs); }),
  ]);
  clearTimeout(timeout);
  if (!closedAfterTerm) {
    try { kill(-child.pid, "SIGKILL"); killSent = true; } catch (error) { if (error?.code !== "ESRCH") throw error; }
    await close;
  }
  return { result: "terminated", termSent, killSent, closed: true };
}

function safeSha(value, expression) { return typeof value === "string" && expression.test(value) ? value : null; }
function safeIdList(values) { return Array.isArray(values) ? unique(values.filter((value) => typeof value === "string" && ID.test(value) && !UUID.test(value))) : []; }
function safeSelection(selection) {
  return {
    schemaVersion: selection?.schemaVersion === 1 ? 1 : null,
    mode: selection?.mode === "focused" ? "focused" : "full_fallback",
    baseSha: safeSha(selection?.baseSha, SHA), headSha: safeSha(selection?.headSha, SHA),
    dirtyTreeSha256: safeSha(selection?.dirtyTreeSha256, SHA256), changedPathsSha256: safeSha(selection?.changedPathsSha256, SHA256), manifestSha256: safeSha(selection?.manifestSha256, SHA256),
    matchedRuleIds: safeIdList(selection?.matchedRuleIds), reasons: safeIdList(selection?.reasons), gates: safeIdList(selection?.gates),
  };
}
function resultStatus(result, wasInterrupted) { return wasInterrupted || result.signal ? "incomplete" : (result.code === 0 ? "passed" : "failed"); }
function blankRawLog() { return { closed: false, bytes: null, sha256: null }; }
function staticCleanup() { return { result: "not_required", termSent: false, killSent: false, closed: true }; }

export async function executeGateRun({
  selection, receiptPath, repoDir = process.cwd(), stateHome = defaultStateHome(), nodeVersion = process.version, exists = null,
  spawnCommand = defaultSpawnCommand, rawLogFactory = makeRawLog, rawLogFinalizer = finalizeRawLog, writeReceipt = writeAtomicJson,
  output = (line) => process.stdout.write(`${line}\n`), finalMode = false, setupError = null, interrupted = () => false, onRunController,
  now = () => new Date(), monotonicNow = () => performance.now(),
}) {
  if (typeof receiptPath !== "string" || receiptPath.length === 0) throw new Error("missing receipt path");
  const startedAtUtc = now().toISOString();
  const monotonicStartedAt = monotonicNow();
  const safe = safeSelection(selection);
  let status = "failed";
  let errorKind = setupError;
  let gates = [];
  let rawLog = null;
  let rawLogEvidence = blankRawLog();
  let cleanup = staticCleanup();
  let observedSignal = null;
  let activeChild = null;
  let localInterrupted = false;
  let cleanupPromise = null;
  const isInterrupted = () => localInterrupted || interrupted();
  const requestInterrupt = (signal = null) => {
    localInterrupted = true;
    observedSignal ??= signal;
    if (activeChild && !cleanupPromise) cleanupPromise = terminateProcessGroup({ child: activeChild }).then((result) => { cleanup = result; return result; }).catch(() => {
      cleanup = { result: "failed", termSent: false, killSent: false, closed: false }; return cleanup;
    });
    return cleanupPromise ?? Promise.resolve(cleanup);
  };
  onRunController?.({ interrupt: requestInterrupt });
  let writer = null;
  try {
    rawLog = await rawLogFactory(stateHome);
    writer = createOrderedWriter((data) => rawLog.handle.write(data));
    if (setupError) throw new Error(setupError);
    assertNodeVersion(nodeVersion);
    if (isInterrupted()) status = "incomplete";
    else if (safe.mode !== "focused" && !finalMode) status = "requires_full_gate";
    else {
      const plan = resolveGatePlan({ gates: safe.gates, finalMode, exists: exists ?? ((path) => existsSync(resolve(repoDir, path))) });
      for (const entry of plan) {
        const gateStartedAt = monotonicNow();
        const result = await spawnCommand({
          command: entry.command, args: [...entry.args], cwd: repoDir, shell: false,
          onChild(child) { activeChild = child; },
          onOutput(data) { writer.append(data); },
        });
        await writer.flush();
        await cleanupPromise;
        const gateStatus = resultStatus(result, isInterrupted());
        observedSignal = result.signal ?? observedSignal;
        gates.push({ id: entry.id, argv: [entry.command, ...entry.args], durationMs: Math.max(0, Math.round(monotonicNow() - gateStartedAt)), status: gateStatus, exitCode: result.code ?? null, signal: result.signal ?? null });
        output(`fast-gate ${entry.id} ${gateStatus} ${gates.at(-1).durationMs}ms`);
        if (gateStatus !== "passed") break;
      }
      status = gates.length > 0 && gates.every((gate) => gate.status === "passed") ? "passed" : "failed";
      if (gates.some((gate) => gate.status === "incomplete") || isInterrupted()) status = "incomplete";
    }
  } catch {
    status = isInterrupted() ? "incomplete" : "failed";
    errorKind ??= "runner";
  } finally {
    if (cleanupPromise) await cleanupPromise;
    if (rawLog) {
      try { if (writer) await writer.flush(); rawLogEvidence = await rawLogFinalizer(rawLog); } catch {
        rawLogEvidence = blankRawLog(); status = isInterrupted() ? "incomplete" : "failed"; errorKind ??= "raw_log_finalize";
      }
    } else errorKind ??= "raw_log_setup";
  }
  const receipt = {
    schemaVersion: 1, status, requiresFullGate: status === "requires_full_gate", nodeVersion: /^v\d+\.\d+\.\d+$/u.test(nodeVersion) ? nodeVersion : null,
    startedAtUtc, finishedAtUtc: now().toISOString(), durationMs: Math.max(0, Math.round(monotonicNow() - monotonicStartedAt)),
    selection: safe, gates, exit: { code: status === "passed" ? 0 : 1, signal: observedSignal }, cleanup, rawLog: rawLogEvidence, errorKind,
  };
  await writeReceipt(receiptPath, receipt);
  output(`fast-gate receipt ${resolve(receiptPath)} ${status} ${receipt.rawLog.sha256 ?? "unavailable"}`);
  return receipt;
}

async function readSelectionFromCli({ baseSha, selectionPath, finalMode, repoDir }) {
  if (selectionPath) return JSON.parse(await readFile(resolve(repoDir, selectionPath), "utf8"));
  if (!baseSha) throw new Error("provide --base or --selection");
  const { stdout } = await execFile(process.execPath, ["scripts/fast-gates/select.mjs", "--base", baseSha, ...(finalMode ? ["--final"] : [])], { cwd: repoDir, encoding: "utf8" });
  return JSON.parse(stdout);
}
function parseArguments(argv) {
  const options = { finalMode: false, baseSha: null, selectionPath: null, receiptPath: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base") options.baseSha = argv[++index]; else if (argument === "--selection") options.selectionPath = argv[++index]; else if (argument === "--receipt") options.receiptPath = argv[++index]; else if (argument === "--final") options.finalMode = true; else throw new Error("unknown argument");
    if ((argument === "--base" || argument === "--selection" || argument === "--receipt") && !argv[index]) throw new Error(`missing ${argument} value`);
  }
  if (!options.receiptPath) throw new Error("missing --receipt");
  return options;
}
function extractReceiptPath(argv, repoDir) {
  const index = argv.indexOf("--receipt");
  const value = index >= 0 ? argv[index + 1] : null;
  return typeof value === "string" && value.length > 0 ? (isAbsolute(value) ? value : resolve(repoDir, value)) : null;
}

export async function runCli(argv = process.argv.slice(2), { repoDir = process.cwd(), readSelection = readSelectionFromCli, onRunController, ...executionOptions } = {}) {
  const recoverableReceiptPath = extractReceiptPath(argv, repoDir);
  let options;
  try {
    options = parseArguments(argv);
    const selection = await readSelection({ ...options, repoDir });
    return await executeGateRun({ selection, receiptPath: isAbsolute(options.receiptPath) ? options.receiptPath : resolve(repoDir, options.receiptPath), repoDir, finalMode: options.finalMode, onRunController, ...executionOptions });
  } catch {
    if (!recoverableReceiptPath) throw new Error("fast gate setup failed before a receipt path was available");
    return executeGateRun({ selection: { mode: "full_fallback", reasons: ["runner-error"] }, receiptPath: recoverableReceiptPath, repoDir, setupError: options ? "selection_read" : "argument_parse", onRunController, ...executionOptions });
  }
}

export async function main(argv = process.argv.slice(2)) {
  let controller = null;
  let interruptedBeforeController = false;
  let interruptedSignal = null;
  const stop = (signal) => { interruptedBeforeController = true; interruptedSignal = signal; void controller?.interrupt(signal); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    const receipt = await runCli(argv, {
      onRunController: (value) => {
        controller = value;
        if (interruptedBeforeController) void controller.interrupt(interruptedSignal);
      },
    });
    process.exitCode = receipt.status === "passed" ? 0 : 1;
    return receipt;
  }
  finally { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

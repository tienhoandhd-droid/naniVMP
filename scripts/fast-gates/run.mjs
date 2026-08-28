import { spawn, execFile as execFileCallback } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, open, readFile, rename, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const REQUIRED_NODE_VERSION = "v24.18.0";
const PREVIEW_GATE_SUITES = Object.freeze({
  "preview-gialap": "gialap",
  "preview-catalog": "catalog",
  "preview-progress-rights": "progress-rights",
  "preview-admin": "admin",
});

export const UNIT_FILES = Object.freeze({
  "unit-account": Object.freeze([
    "tests/unit/account-administration-integration.test.mjs",
    "tests/unit/account-administration-model.test.mjs",
    "tests/unit/account-administration-panel.test.mjs",
    "tests/unit/account-role-editor.test.mjs",
    "tests/unit/admin-only-management.test.mjs",
    "tests/unit/item-permission-contracts.test.mjs",
    "tests/unit/permission-scope.test.mjs",
  ]),
  "unit-catalog": Object.freeze([
    "tests/unit/catalog-field-groups.test.mjs",
    "tests/unit/catalog-form.test.mjs",
    "tests/unit/catalog-impact-preview.test.mjs",
    "tests/unit/catalog-suggestions.test.mjs",
    "tests/unit/catalog-timeline-override-model.test.mjs",
    "tests/unit/catalog-warnings-summary.test.mjs",
    "tests/unit/catalog-workbook.test.mjs",
    "tests/unit/catalog-workspace-diff.test.mjs",
    "tests/unit/catalog-workspace-filter-model.test.mjs",
  ]),
  "unit-progress": Object.freeze([
    "tests/unit/editable-progress-rights.test.mjs",
    "tests/unit/progress-deep-link.test.mjs",
    "tests/unit/progress-modal-access-revocation.test.mjs",
    "tests/unit/progress-modal-operation-target.test.mjs",
    "tests/unit/progress-workspace-model.test.mjs",
  ]),
  "unit-timeline": Object.freeze([
    "tests/unit/planned-deadline-api.test.mjs",
    "tests/unit/planned-deadline-dialog.test.mjs",
    "tests/unit/planned-deadline-edit-model.test.mjs",
    "tests/unit/timeline-filter-model.test.mjs",
    "tests/unit/timeline-summary-model.test.mjs",
  ]),
  "unit-today": Object.freeze([
    "tests/unit/today-command-center.test.mjs",
    "tests/unit/today-model.test.mjs",
    "tests/unit/today-scope.test.mjs",
  ]),
});

function command(id, executable, args) {
  return Object.freeze({ id, command: executable, args: Object.freeze(args) });
}

const FIXED_GATES = Object.freeze({
  "diff-check": Object.freeze([command("diff-check", "git", ["diff", "--check"])]),
  typecheck: Object.freeze([command("typecheck", "npm", ["run", "typecheck"])]),
  "unit-account": Object.freeze([command("unit-account", "node", ["--import", "tsx", "--test", ...UNIT_FILES["unit-account"]])]),
  "unit-catalog": Object.freeze([command("unit-catalog", "node", ["--import", "tsx", "--test", ...UNIT_FILES["unit-catalog"]])]),
  "unit-progress": Object.freeze([command("unit-progress", "node", ["--import", "tsx", "--test", ...UNIT_FILES["unit-progress"]])]),
  "unit-timeline": Object.freeze([command("unit-timeline", "node", ["--import", "tsx", "--test", ...UNIT_FILES["unit-timeline"]])]),
  "unit-today": Object.freeze([command("unit-today", "node", ["--import", "tsx", "--test", ...UNIT_FILES["unit-today"]])]),
  "full-unit": Object.freeze([command("full-unit", "npm", ["run", "test:unit"])]),
  "full-static": Object.freeze([
    command("full-static", "npm", ["run", "typecheck"]),
    command("full-static", "npm", ["run", "test:unit"]),
  ]),
});

export function assertNodeVersion(version = process.version) {
  if (version !== REQUIRED_NODE_VERSION) {
    throw new Error(`fast gates require Node ${REQUIRED_NODE_VERSION}`);
  }
}

function unique(values) {
  return [...new Set(values)];
}

function assertKnownGate(gateId) {
  if (!Object.hasOwn(FIXED_GATES, gateId) && !Object.hasOwn(PREVIEW_GATE_SUITES, gateId)) {
    throw new Error(`unknown gate: ${gateId}`);
  }
}

function previewCommand(suiteIds) {
  return command("preview", "bash", [
    "scripts/with-preview.sh",
    "--",
    "node",
    "scripts/fast-gates/run-preview-suites.mjs",
    ...suiteIds,
  ]);
}

function unitFilesFor(plan) {
  return unique(plan.flatMap(({ id }) => UNIT_FILES[id] ?? []));
}

function fileExists(path) {
  return existsSync(resolve(process.cwd(), path));
}

export function resolveGatePlan({ gates, finalMode = false, exists = fileExists }) {
  const requested = finalMode ? ["diff-check", "full-static", "full-preview"] : gates;
  if (!Array.isArray(requested)) throw new Error("invalid gate list");
  const gateIds = unique(requested);
  const previewSuites = [];
  const plan = [];
  for (const gateId of gateIds) {
    if (gateId === "full-preview") {
      previewSuites.push("gialap", "catalog", "progress-rights", "admin");
      continue;
    }
    assertKnownGate(gateId);
    if (Object.hasOwn(PREVIEW_GATE_SUITES, gateId)) {
      previewSuites.push(PREVIEW_GATE_SUITES[gateId]);
      continue;
    }
    plan.push(...FIXED_GATES[gateId]);
  }
  for (const file of unitFilesFor(plan)) {
    if (!exists(file)) throw new Error(`missing unit test file: ${file}`);
  }
  if (previewSuites.length > 0) plan.push(previewCommand(unique(previewSuites)));
  return plan;
}

function defaultStateHome() {
  return process.env.XDG_STATE_HOME || resolve(process.env.HOME || ".", ".local/state");
}

function rawLogDirectory(stateHome, runId) {
  return resolve(stateHome, "vmp-fast-gates", runId);
}

async function makeRawLog(stateHome, runId) {
  const directory = rawLogDirectory(stateHome, runId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const path = resolve(directory, "raw.log");
  const handle = await open(path, "wx", 0o600);
  return { directory, path, handle };
}

async function writeAtomicJson(path, value) {
  const destination = resolve(path);
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(temporary, 0o600);
  await rename(temporary, destination);
}

function defaultSpawnCommand({ command: executable, args, cwd, onOutput, onChild }) {
  return new Promise((resolveResult) => {
    const child = spawn(executable, args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    onChild?.(child);
    child.stdout.on("data", (data) => onOutput(data, "stdout"));
    child.stderr.on("data", (data) => onOutput(data, "stderr"));
    child.once("error", () => resolveResult({ code: 1, signal: null }));
    child.once("close", (code, signal) => resolveResult({ code, signal }));
  });
}

function safeSelection(selection) {
  return {
    mode: selection?.mode === "focused" ? "focused" : "full_fallback",
    reasons: Array.isArray(selection?.reasons)
      ? selection.reasons.filter((reason) => /^[a-z-]+$/u.test(reason))
      : [],
  };
}

function resultStatus(result) {
  if (result.signal) return "incomplete";
  return result.code === 0 ? "passed" : "failed";
}

export async function executeGateRun({
  selection,
  receiptPath,
  repoDir = process.cwd(),
  stateHome = defaultStateHome(),
  nodeVersion = process.version,
  exists = null,
  spawnCommand = defaultSpawnCommand,
  output = (line) => process.stdout.write(`${line}\n`),
  finalMode = false,
  interrupted = () => false,
  onChild,
}) {
  if (typeof receiptPath !== "string" || receiptPath.length === 0) throw new Error("missing receipt path");
  const rawLogRunId = randomUUID();
  const rawLog = await makeRawLog(stateHome, rawLogRunId);
  let status = "failed";
  let gates = [];
  const pendingWrites = [];
  let writeError = null;
  try {
    assertNodeVersion(nodeVersion);
    const safe = safeSelection(selection);
    if (interrupted()) {
      status = "incomplete";
    } else if (safe.mode !== "focused" && !finalMode) {
      status = "requires_full_gate";
    } else {
      const plan = resolveGatePlan({
        gates: selection?.gates ?? [],
        finalMode,
        exists: exists ?? ((path) => existsSync(resolve(repoDir, path))),
      });
      for (const entry of plan) {
        const startedAt = Date.now();
        const result = await spawnCommand({
          command: entry.command,
          args: [...entry.args],
          cwd: repoDir,
          shell: false,
          onChild,
          onOutput(data) {
            pendingWrites.push(rawLog.handle.write(data).catch((error) => { writeError = error; }));
          },
        });
        await Promise.all(pendingWrites.splice(0));
        if (writeError) throw writeError;
        const gateStatus = interrupted() || result.signal ? "incomplete" : resultStatus(result);
        gates.push({ id: entry.id, durationMs: Date.now() - startedAt, status: gateStatus });
        output(`fast-gate ${entry.id} ${gateStatus} ${gates.at(-1).durationMs}ms`);
        if (gateStatus !== "passed") break;
      }
      status = gates.length > 0 && gates.every((gate) => gate.status === "passed") ? "passed" : "failed";
      if (gates.some((gate) => gate.status === "incomplete")) status = "incomplete";
    }
  } catch (error) {
    status = interrupted() ? "incomplete" : "failed";
    gates.push({ id: "runner", durationMs: 0, status });
  } finally {
    await rawLog.handle.sync();
    await rawLog.handle.close();
  }
  const rawLogBytes = (await stat(rawLog.path)).size;
  const rawLogContents = await readFile(rawLog.path);
  const receipt = {
    schemaVersion: 1,
    status,
    requiresFullGate: status === "requires_full_gate",
    selection: safeSelection(selection),
    gates,
    rawLog: {
      runId: rawLogRunId,
      file: "raw.log",
      bytes: rawLogBytes,
      sha256: createHash("sha256").update(rawLogContents).digest("hex"),
    },
  };
  await writeAtomicJson(receiptPath, receipt);
  output(`fast-gate receipt ${resolve(receiptPath)} ${status} ${receipt.rawLog.sha256}`);
  return receipt;
}

async function readSelectionFromCli({ baseSha, selectionPath, finalMode, repoDir }) {
  if (selectionPath) {
    const text = await readFile(resolve(repoDir, selectionPath), "utf8");
    return JSON.parse(text);
  }
  if (!baseSha) throw new Error("provide --base or --selection");
  const { stdout } = await execFile(process.execPath, ["scripts/fast-gates/select.mjs", "--base", baseSha, ...(finalMode ? ["--final"] : [])], {
    cwd: repoDir,
    encoding: "utf8",
  });
  return JSON.parse(stdout);
}

function parseArguments(argv) {
  const options = { finalMode: false, baseSha: null, selectionPath: null, receiptPath: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base") options.baseSha = argv[++index];
    else if (argument === "--selection") options.selectionPath = argv[++index];
    else if (argument === "--receipt") options.receiptPath = argv[++index];
    else if (argument === "--final") options.finalMode = true;
    else throw new Error("unknown argument");
    if ((argument === "--base" || argument === "--selection" || argument === "--receipt") && !argv[index]) {
      throw new Error(`missing ${argument} value`);
    }
  }
  if (!options.receiptPath) throw new Error("missing --receipt");
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const repoDir = process.cwd();
  let activeChild = null;
  let interrupted = false;
  const stop = () => {
    interrupted = true;
    activeChild?.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const options = parseArguments(argv);
    const selection = await readSelectionFromCli({ ...options, repoDir });
    const receipt = await executeGateRun({
      selection,
      receiptPath: isAbsolute(options.receiptPath) ? options.receiptPath : resolve(repoDir, options.receiptPath),
      repoDir,
      finalMode: options.finalMode,
      interrupted: () => interrupted,
      onChild: (child) => { activeChild = child; },
    });
    process.exitCode = receipt.status === "passed" ? 0 : 1;
    return receipt;
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

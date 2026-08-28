import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, posix, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const ID = /^[a-z0-9][a-z0-9-]*$/u;
const ROOT_KEYS = new Set(["schemaVersion", "rules", "fullFallbackPaths"]);
const RULE_KEYS = new Set(["id", "paths", "gates"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalList(values) {
  return values.length === 0 ? "" : `${values.join("\n")}\n`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizedPath(path) {
  if (typeof path !== "string" || path.length === 0 || isAbsolute(path)) {
    throw new Error("invalid changed path");
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "..")) {
    throw new Error("invalid changed path");
  }
  const normalized = posix.normalize(path);
  if (normalized === "." || normalized.startsWith("../") || isAbsolute(normalized)) {
    throw new Error("invalid changed path");
  }
  return normalized;
}

function assertOnlyKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`invalid ${label}`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`unknown ${label} key`);
  }
}

function validatePatterns(patterns, label) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    throw new Error(`empty ${label}`);
  }
  for (const pattern of patterns) {
    normalizedPath(pattern);
  }
}

function validateManifest(manifest) {
  assertOnlyKeys(manifest, ROOT_KEYS, "manifest");
  if (manifest.schemaVersion !== 1) throw new Error("unsupported manifest schema");
  if (!Array.isArray(manifest.rules) || manifest.rules.length === 0) {
    throw new Error("empty rules");
  }
  validatePatterns(manifest.fullFallbackPaths, "full fallback paths");

  const ruleIds = new Set();
  for (const rule of manifest.rules) {
    assertOnlyKeys(rule, RULE_KEYS, "rule");
    if (typeof rule.id !== "string" || !ID.test(rule.id) || ruleIds.has(rule.id)) {
      throw new Error("invalid rule id");
    }
    ruleIds.add(rule.id);
    validatePatterns(rule.paths, "rule paths");
    if (!Array.isArray(rule.gates) || rule.gates.length === 0) {
      throw new Error("empty rule gates");
    }
    for (const gate of rule.gates) {
      if (typeof gate !== "string" || !ID.test(gate)) throw new Error("invalid gate id");
    }
  }
  return manifest;
}

function pathMatches(pattern, path) {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern[index] === "*") {
      if (pattern[index + 1] === "*") {
        expression += ".*";
        index += 1;
      } else {
        expression += "[^/]*";
      }
    } else {
      expression += pattern[index].replace(/[|\\{}()[\]^$+?.]/gu, "\\$&");
    }
  }
  return new RegExp(`${expression}$`, "u").test(path);
}

function fallbackSelection({ manifest, baseSha, headSha, changedPaths, reason }) {
  return {
    schemaVersion: 1,
    mode: "full_fallback",
    baseSha: baseSha ?? null,
    headSha: headSha ?? null,
    dirtyTreeSha256: sha256(canonicalList(changedPaths)),
    changedPathsSha256: sha256(canonicalList(changedPaths)),
    manifestSha256: manifest ? sha256(stableJson(manifest)) : null,
    matchedRuleIds: [],
    reasons: [reason],
    gates: [],
  };
}

export async function loadManifest(path) {
  const manifest = JSON.parse(await readFile(path, "utf8"));
  return validateManifest(manifest);
}

function parseNameStatus(output) {
  const records = output.split("\0");
  if (records.at(-1) === "") records.pop();
  const paths = [];
  for (let index = 0; index < records.length;) {
    const status = records[index++];
    if (!status || !/^[A-Z][0-9]*$/u.test(status)) throw new Error("invalid git diff status");
    const count = /^(?:R|C)/u.test(status) ? 2 : 1;
    if (index + count > records.length) throw new Error("truncated git diff status");
    for (let pathIndex = 0; pathIndex < count; pathIndex += 1) {
      paths.push(normalizedPath(records[index++]));
    }
  }
  return paths;
}

function parseNulPaths(output) {
  const records = output.split("\0");
  if (records.at(-1) === "") records.pop();
  return records.map(normalizedPath);
}

async function git(repoDir, args) {
  const { stdout } = await execFile("git", args, {
    cwd: repoDir,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

async function collectChangeSets({ repoDir, baseSha }) {
  if (typeof baseSha !== "string" || baseSha.length === 0) {
    throw new Error("missing base sha");
  }
  const commonArgs = ["diff", "--name-status", "-z", "--find-renames"];
  const [committed, staged, unstaged, untracked] = await Promise.all([
    git(repoDir, [...commonArgs, `${baseSha}...HEAD`]),
    git(repoDir, [...commonArgs, "--cached"]),
    git(repoDir, commonArgs),
    git(repoDir, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  const committedPaths = parseNameStatus(committed);
  const dirtyPaths = [
    ...parseNameStatus(staged),
    ...parseNameStatus(unstaged),
    ...parseNulPaths(untracked),
  ];
  return {
    changedPaths: [...new Set([...committedPaths, ...dirtyPaths])].sort(),
    dirtyPaths: [...new Set(dirtyPaths)].sort(),
  };
}

export async function collectChangedPaths({ repoDir, baseSha }) {
  return (await collectChangeSets({ repoDir, baseSha })).changedPaths;
}

export function selectGates({ manifest, changedPaths, baseSha, headSha, finalMode }) {
  let normalizedPaths;
  try {
    normalizedPaths = Array.isArray(changedPaths)
      ? [...new Set(changedPaths.map(normalizedPath))].sort()
      : [];
  } catch {
    return fallbackSelection({ manifest: null, baseSha, headSha, changedPaths: [], reason: "invalid-changed-path" });
  }
  let validManifest;
  try {
    validManifest = validateManifest(manifest);
  } catch {
    return fallbackSelection({ manifest: null, baseSha, headSha, changedPaths: normalizedPaths, reason: "invalid-manifest" });
  }
  if (finalMode) {
    return fallbackSelection({ manifest: validManifest, baseSha, headSha, changedPaths: normalizedPaths, reason: "final-mode" });
  }
  if (typeof baseSha !== "string" || baseSha.length === 0) {
    return fallbackSelection({ manifest: validManifest, baseSha, headSha, changedPaths: normalizedPaths, reason: "missing-base" });
  }
  if (normalizedPaths.length === 0) {
    return fallbackSelection({ manifest: validManifest, baseSha, headSha, changedPaths: normalizedPaths, reason: "empty-change-set" });
  }
  if (normalizedPaths.some((path) => validManifest.fullFallbackPaths.some((pattern) => pathMatches(pattern, path)))) {
    return fallbackSelection({ manifest: validManifest, baseSha, headSha, changedPaths: normalizedPaths, reason: "protected-surface" });
  }

  const matchedRules = validManifest.rules.filter((rule) => (
    normalizedPaths.some((path) => rule.paths.some((pattern) => pathMatches(pattern, path)))
  ));
  if (matchedRules.length === 0 || normalizedPaths.some((path) => !matchedRules.some((rule) => rule.paths.some((pattern) => pathMatches(pattern, path))))) {
    return fallbackSelection({ manifest: validManifest, baseSha, headSha, changedPaths: normalizedPaths, reason: "unknown-path" });
  }

  return {
    schemaVersion: 1,
    mode: "focused",
    baseSha,
    headSha: headSha ?? null,
    dirtyTreeSha256: sha256(canonicalList(normalizedPaths)),
    changedPathsSha256: sha256(canonicalList(normalizedPaths)),
    manifestSha256: sha256(stableJson(validManifest)),
    matchedRuleIds: matchedRules.map((rule) => rule.id),
    reasons: ["focused-rules"],
    gates: [...new Set(matchedRules.flatMap((rule) => rule.gates))],
  };
}

function parseArguments(argv) {
  let repoDir = process.cwd();
  let baseSha;
  let finalMode = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base") {
      baseSha = argv[++index];
      if (!baseSha) throw new Error("missing --base value");
    } else if (argument === "--repo") {
      repoDir = argv[++index];
      if (!repoDir) throw new Error("missing --repo value");
    } else if (argument === "--final") {
      finalMode = true;
    } else if (!argument.startsWith("-") && repoDir === process.cwd()) {
      repoDir = argument;
    } else {
      throw new Error("unknown argument");
    }
  }
  return { repoDir: resolve(repoDir), baseSha, finalMode };
}

async function resolveSha(repoDir, reference) {
  return (await git(repoDir, ["rev-parse", "--verify", `${reference}^{commit}`])).trim();
}

export async function main(argv = process.argv.slice(2)) {
  let manifest = null;
  let baseSha = null;
  let headSha = null;
  let changedPaths = [];
  let dirtyPaths = [];
  let finalMode = false;
  let reason = "selector-error";
  try {
    const options = parseArguments(argv);
    finalMode = options.finalMode;
    manifest = await loadManifest(resolve(options.repoDir, "scripts/fast-gates/surfaces.json"));
    headSha = await resolveSha(options.repoDir, "HEAD");
    baseSha = options.baseSha
      ? await resolveSha(options.repoDir, options.baseSha)
      : (await git(options.repoDir, ["merge-base", "HEAD", "origin/main"])).trim();
    const changeSets = await collectChangeSets({ repoDir: options.repoDir, baseSha });
    changedPaths = changeSets.changedPaths;
    dirtyPaths = changeSets.dirtyPaths;
    const selection = selectGates({ manifest, changedPaths, baseSha, headSha, finalMode });
    selection.dirtyTreeSha256 = sha256(canonicalList(dirtyPaths));
    process.stdout.write(`${JSON.stringify(selection)}\n`);
    return selection;
  } catch {
    const selection = fallbackSelection({ manifest, baseSha, headSha, changedPaths, reason });
    selection.dirtyTreeSha256 = sha256(canonicalList(dirtyPaths));
    process.stdout.write(`${JSON.stringify(selection)}\n`);
    return selection;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

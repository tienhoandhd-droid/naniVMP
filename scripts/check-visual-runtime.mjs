import { createHash, randomBytes } from "node:crypto";
import {
  constants,
  chmodSync,
  closeSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { VISUAL_BASELINE_COUNT } from "./visual-matrix-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselineDirectory = path.join(root, "tests", "visual", "baselines");
const baselineContractPath = path.join(root, "tests", "visual", "baseline-contract.env");
const expectedBaselineCount = VISUAL_BASELINE_COUNT;
const expected = {
  browserVersion: "151.0.7922.34",
  executableSha256: "0b20b130e7edd9dd51873be867761295fe0cfad490c2b9a64f95bd3cfc08fa71",
  playwrightVersion: "1.62.1",
  revision: "1234",
};
const baselineSealEntries = [
  ["VISUAL_TIMEZONE", "Asia/Bangkok"],
  ["VISUAL_CHANNEL", "chromium"],
  ["PLAYWRIGHT_VERSION", expected.playwrightVersion],
  ["CHROMIUM_REVISION", expected.revision],
  ["CHROMIUM_VERSION", expected.browserVersion],
  ["CHROMIUM_EXECUTABLE_SHA256", expected.executableSha256],
  ["PLATFORM", "linux-x64-ubuntu-24.04"],
  ["BASELINE_PNG_COUNT", String(expectedBaselineCount)],
];

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

function requireContract(condition, message) {
  if (!condition) throw new Error(`Visual runtime contract failed: ${message}`);
}

function readUbuntuVersion() {
  return Object.fromEntries(readFileSync("/etc/os-release", "utf8")
    .split("\n")
    .flatMap((line) => {
      const index = line.indexOf("=");
      return index === -1 ? [] : [[line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")]];
    }));
}

async function verifyRuntime() {
  requireContract(process.platform === "linux" && process.arch === "x64",
    `unsupported platform: ${process.platform}/${process.arch}`);
  const osRelease = readUbuntuVersion();
  requireContract(osRelease.ID === "ubuntu" && osRelease.VERSION_ID === "24.04",
    `unsupported operating system: ${osRelease.ID ?? "unknown"} ${osRelease.VERSION_ID ?? "unknown"}`);

  const packageJson = readJson("package.json");
  const installedPlaywright = readJson("node_modules/@playwright/test/package.json");
  const browsers = readJson("node_modules/playwright-core/browsers.json");
  const bundledChromium = browsers.browsers.find(({ name }) => name === "chromium");
  const config = (await import(pathToFileURL(path.join(root, "playwright.visual.config.ts")).href)).default;
  const browserRoot = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(homedir(), ".cache", "ms-playwright");
  const executable = path.join(browserRoot, `chromium-${expected.revision}`, "chrome-linux64", "chrome");
  const { contents: executableBytes, metadata: executableMetadata } = readStableRegularFile(executable, "bundled Chromium executable");
  const executableDigest = createHash("sha256").update(executableBytes).digest("hex");

  requireContract(packageJson.devDependencies?.["@playwright/test"] === `^${expected.playwrightVersion}`,
    `package.json must declare @playwright/test ^${expected.playwrightVersion}`);
  requireContract(installedPlaywright.version === expected.playwrightVersion,
    `installed @playwright/test must be ${expected.playwrightVersion}`);
  requireContract(config.use?.timezoneId === "Asia/Bangkok",
    "effective visual config must use Asia/Bangkok");
  requireContract(config.use?.channel === "chromium",
    "effective visual config must use Playwright's chromium channel");
  requireContract(bundledChromium?.revision === expected.revision,
    `Playwright Chromium revision must be ${expected.revision}`);
  requireContract(bundledChromium?.browserVersion === expected.browserVersion,
    `Playwright Chromium version must be ${expected.browserVersion}`);
  requireContract(executableMetadata.isFile(), "bundled Chromium executable must be a regular file");
  requireContract(executableMetadata.nlink === 1, "bundled Chromium executable must have one hard link");
  requireContract((executableMetadata.mode & 0o111) !== 0, "bundled Chromium executable must be executable");
  requireContract(executableDigest === expected.executableSha256, "bundled Chromium executable digest drifted");
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function readStableRegularFile(absolutePath, label) {
  let descriptor;
  try {
    const pathBefore = lstatSync(absolutePath);
    requireContract(!pathBefore.isSymbolicLink(), `${label} path must not be a symlink`);
    descriptor = openSync(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const descriptorBefore = fstatSync(descriptor);
    requireContract(descriptorBefore.isFile(), `${label} must be a regular file`);
    requireContract(descriptorBefore.nlink === 1, `${label} must have one hard link`);
    requireContract(sameIdentity(pathBefore, descriptorBefore), `${label} changed while opening`);
    const contents = readFileSync(descriptor);
    const descriptorAfter = fstatSync(descriptor);
    const pathAfter = lstatSync(absolutePath);
    requireContract(sameIdentity(descriptorBefore, descriptorAfter), `${label} changed while reading`);
    requireContract(sameIdentity(descriptorAfter, pathAfter), `${label} changed while reading`);
    return { contents, metadata: descriptorAfter };
  } catch (error) {
    requireContract(error?.code !== "ELOOP", `${label} path must not be a symlink`);
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function collectLinuxPngs(directory = baselineDirectory, relativeDirectory = "") {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    const metadata = lstatSync(absolutePath);
    requireContract(!metadata.isSymbolicLink(), "baseline path must not be a symlink");
    if (entry.isDirectory()) {
      requireContract(metadata.isDirectory(), "baseline directory changed while enumerating");
      files.push(...collectLinuxPngs(absolutePath, relativePath));
    } else {
      requireContract(metadata.isFile(), "baseline path must be a regular file or directory");
      if (relativePath.endsWith(".png")
      && relativePath.split("/").some((segment) => segment.endsWith("-linux"))) {
        files.push({ absolutePath, relativePath });
      }
    }
  }
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function baselineTreeDigest(files) {
  const tree = createHash("sha256");
  for (const { absolutePath, relativePath } of files) {
    const { contents } = readStableRegularFile(absolutePath, "baseline PNG");
    const contentDigest = createHash("sha256").update(contents).digest("hex");
    tree.update(relativePath);
    tree.update("\0");
    tree.update(contentDigest);
    tree.update("\n");
  }
  return tree.digest("hex");
}

function collectSealedBaseline() {
  const files = collectLinuxPngs();
  requireContract(files.length === expectedBaselineCount,
    `expected exactly ${expectedBaselineCount} Linux baseline PNGs, found ${files.length}`);
  return { treeDigest: baselineTreeDigest(files) };
}

function baselineSealContents(treeDigest) {
  return [...baselineSealEntries, ["BASELINE_TREE_SHA256", treeDigest]]
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n";
}

function verifyBaselineSealContents(contents, treeDigest) {
  const lines = contents.toString("utf8").split("\n");
  const expectedLines = baselineSealContents(treeDigest).split("\n");
  requireContract(lines.length === expectedLines.length,
    `baseline seal line count must be exactly ${baselineSealEntries.length + 1}`);
  for (let index = 0; index < baselineSealEntries.length; index += 1) {
    requireContract(lines[index] === expectedLines[index], `baseline seal line ${index + 1} is not exact`);
  }
  requireContract(lines[baselineSealEntries.length] === expectedLines[baselineSealEntries.length],
    "baseline PNG tree digest drifted");
  requireContract(lines.at(-1) === "", "baseline seal must end with one newline");
}

function writeBaselineSeal(treeDigest) {
  const contents = baselineSealContents(treeDigest);
  const directory = path.dirname(baselineContractPath);
  mkdirSync(directory, { recursive: true });
  const temporaryPath = path.join(directory, `.baseline-contract.${process.pid}.${randomBytes(12).toString("hex")}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, baselineContractPath);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try {
      unlinkSync(temporaryPath);
    } catch {
      // The rename succeeded or the exclusive temporary file was never created.
    }
    throw error;
  }
  const { contents: sealedContents, metadata } = readStableRegularFile(baselineContractPath, "baseline seal");
  requireContract(metadata.isFile(), "baseline seal must be a regular file");
  requireContract((metadata.mode & 0o777) === 0o600, "baseline seal must have mode 0600");
  requireContract(metadata.nlink === 1, "baseline seal must have one hard link");
  verifyBaselineSealContents(sealedContents, treeDigest);
}

async function writeBaselineContract() {
  await verifyRuntime();
  const { treeDigest } = collectSealedBaseline();
  writeBaselineSeal(treeDigest);
  console.log(`Visual baseline contract sealed: ${expectedBaselineCount} PNGs, tree SHA-256 ${treeDigest}.`);
}

async function verifyBaselineContract() {
  await verifyRuntime();
  let seal;
  try {
    seal = readStableRegularFile(baselineContractPath, "baseline seal");
  } catch (error) {
    requireContract(error?.code !== "ENOENT", "baseline seal is missing");
    throw error;
  }
  const { metadata } = seal;
  requireContract(metadata.isFile(), "baseline seal must be a regular file");
  requireContract((metadata.mode & 0o111) === 0,
    "baseline seal must not be executable");
  requireContract(metadata.nlink === 1, "baseline seal must have one hard link");
  const { treeDigest } = collectSealedBaseline();
  verifyBaselineSealContents(seal.contents, treeDigest);
  console.log(`Visual baseline contract verified: ${expectedBaselineCount} PNGs, tree SHA-256 ${treeDigest}.`);
}

const [mode] = process.argv.slice(2);
requireContract(process.argv.length === 3 && mode, "exactly one mode is required");
requireContract(["--runtime", "--write-baseline-contract", "--verify-baseline"].includes(mode),
  `unknown mode: ${mode}`);

if (mode === "--runtime") {
  await verifyRuntime();
  console.log(`Visual runtime contract verified: Playwright ${expected.playwrightVersion}, Chromium ${expected.browserVersion} (revision ${expected.revision}), Asia/Bangkok.`);
} else if (mode === "--write-baseline-contract") {
  await writeBaselineContract();
} else {
  await verifyBaselineContract();
}

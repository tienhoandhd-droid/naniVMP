import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expected = {
  browserVersion: "151.0.7922.34",
  executableSha256: "0b20b130e7edd9dd51873be867761295fe0cfad490c2b9a64f95bd3cfc08fa71",
  playwrightVersion: "1.62.1",
  revision: "1234",
};

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

const [mode] = process.argv.slice(2);
requireContract(process.argv.length === 3 && mode, "exactly one mode is required");
requireContract(["--runtime", "--write-baseline-contract", "--verify-baseline"].includes(mode),
  `unknown mode: ${mode}`);
if (mode !== "--runtime") {
  throw new Error(`Visual runtime contract failed: ${mode} is not implemented until Task 2`);
}

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
const executableMetadata = statSync(executable);
const executableDigest = createHash("sha256").update(readFileSync(executable)).digest("hex");

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

console.log(`Visual runtime contract verified: Playwright ${expected.playwrightVersion}, Chromium ${expected.browserVersion} (revision ${expected.revision}), Asia/Bangkok.`);

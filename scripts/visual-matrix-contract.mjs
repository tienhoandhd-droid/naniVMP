import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const VISUAL_SCREENS = [
  ["today", "hom-nay"],
  ["overview", "tong-quan"],
  ["source", "danh-muc"],
  ["progress", "tien-do"],
  ["timeline", "timeline"],
  ["alerts", "canh-bao"],
  ["reports", "bao-cao"],
];

export const VISUAL_THEMES = ["light", "dark"];

export const VISUAL_PROJECTS = [
  { name: "chromium", viewport: { width: 1440, height: 900 } },
  { name: "chromium-1366", viewport: { width: 1366, height: 768 } },
  { name: "chromium-1920", viewport: { width: 1920, height: 1080 } },
];

export const VISUAL_BASELINE_COUNT = VISUAL_SCREENS.length * VISUAL_THEMES.length * VISUAL_PROJECTS.length
  + VISUAL_PROJECTS.length;

function requireContract(condition, message) {
  if (!condition) throw new Error(`Visual matrix contract failed: ${message}`);
}

function verifyOutput(logPath) {
  const output = readFileSync(logPath, "utf8");
  const passCounts = [...output.matchAll(/^\s*(\d+) passed(?: \(|$)/gmu)].map((match) => Number(match[1]));
  requireContract(passCounts.length === 1 && passCounts[0] === VISUAL_BASELINE_COUNT,
    `expected Playwright to report exactly ${VISUAL_BASELINE_COUNT} passing tests`);
}

function main(args) {
  if (args.length === 1 && args[0] === "--count") {
    console.log(VISUAL_BASELINE_COUNT);
    return;
  }
  if (args.length === 2 && args[0] === "--verify-output") {
    verifyOutput(args[1]);
    return;
  }
  throw new Error("Visual matrix contract failed: use --count or --verify-output <log>");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}

import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export const PREVIEW_SUITES = Object.freeze({
  gialap: Object.freeze(["npm", Object.freeze(["run", "e2e:gialap"])]),
  catalog: Object.freeze(["npm", Object.freeze(["run", "e2e:catalog"])]),
  "progress-rights": Object.freeze(["npm", Object.freeze(["run", "e2e:progress-rights"])]),
  admin: Object.freeze(["npm", Object.freeze(["run", "e2e:admin"])]),
});

function assertSuiteIds(suiteIds) {
  if (!Array.isArray(suiteIds) || suiteIds.length === 0) throw new Error("missing preview suite");
  const seen = new Set();
  for (const suiteId of suiteIds) {
    if (!Object.hasOwn(PREVIEW_SUITES, suiteId)) throw new Error("unknown preview suite");
    if (seen.has(suiteId)) throw new Error("duplicate preview suite");
    seen.add(suiteId);
  }
  return suiteIds;
}

function spawnCommand({ command, args, cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
}

export async function runPreviewSuites({ suiteIds, cwd = process.cwd(), spawnRunner = spawnCommand }) {
  for (const suiteId of assertSuiteIds(suiteIds)) {
    const [command, args] = PREVIEW_SUITES[suiteId];
    const result = await spawnRunner({ command, args: [...args], cwd, shell: false });
    if (result.code !== 0 || result.signal) return { suiteId, ...result };
  }
  return { code: 0, signal: null };
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const result = await runPreviewSuites({ suiteIds: argv });
    process.exitCode = result.code === 0 && !result.signal ? 0 : 1;
    return result;
  } catch (error) {
    process.stderr.write(`fast preview suites: ${error.message}\n`);
    process.exitCode = 1;
    return { code: 1, signal: null };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

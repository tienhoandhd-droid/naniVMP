import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const legacyDirectoryCommand = "node tests/e2e/danh-muc-nguoi-thuc-hien.mjs";

async function readRepositoryFile(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function commandsIn(script) {
  return script.split(/\s*&&\s*/u).map((command) => command.trim());
}

test("cả test:permissions và e2e đều chạy bộ kiểm danh mục người thực hiện đúng một lần", async () => {
  const packageJson = JSON.parse(await readRepositoryFile("package.json"));

  for (const scriptName of ["test:permissions", "e2e"]) {
    const registrations = commandsIn(packageJson.scripts[scriptName] ?? "")
      .filter((command) => command === legacyDirectoryCommand);

    assert.equal(
      registrations.length,
      1,
      `${scriptName} phải chạy ${legacyDirectoryCommand} đúng một lần`,
    );
  }
});

test("README liệt kê lệnh chạy riêng bộ kiểm danh mục người thực hiện", async () => {
  const readme = await readRepositoryFile("tests/e2e/README.md");
  const documentedCommands = readme
    .split("\n")
    .map((line) => line.replace(/\s+#.*$/u, "").trim())
    .filter((line) => line === legacyDirectoryCommand);

  assert.equal(
    documentedCommands.length,
    1,
    `README phải liệt kê ${legacyDirectoryCommand} đúng một lần`,
  );
});

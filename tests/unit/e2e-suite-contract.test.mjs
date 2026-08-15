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

/* ---------------------------------------------------------------------
 * Cổng chất lượng của đợt Lotus Pearl.
 *
 * Ba bộ này chạy được KHÔNG cần tài khoản thật, nên chúng là cổng duy
 * nhất còn hiệu lực khi chưa có project Supabase cách ly. Đăng ký sai
 * hoặc đăng ký hai lần thì hoặc bỏ sót kiểm, hoặc chạy thừa gấp đôi —
 * cả hai đều lặng lẽ.
 * ------------------------------------------------------------------- */

const LENH_LOTUS = {
  "e2e:gialap": "node tests/e2e/luong-gia-lap.mjs",
  shell: "node tests/e2e/lotus-shell.mjs",
  thammy: "node tests/e2e/tham-my.mjs",
};

test("ba bộ kiểm Lotus Pearl đều được đăng ký đúng một lần", async () => {
  const packageJson = JSON.parse(await readRepositoryFile("package.json"));
  for (const [ten, lenh] of Object.entries(LENH_LOTUS)) {
    assert.equal(packageJson.scripts[ten], lenh,
      `script "${ten}" phải là đúng lệnh ${lenh}`);
  }
});

test("README ghi cách chạy cả ba bộ", async () => {
  const readme = await readRepositoryFile("tests/e2e/README.md");
  for (const ten of Object.keys(LENH_LOTUS)) {
    assert.ok(readme.includes(`npm run ${ten}`),
      `README phải hướng dẫn chạy npm run ${ten}`);
  }
});

test("mọi bộ kiểm trình duyệt mới đều đi qua lớp giả lập, không chạm production", async () => {
  for (const f of ["luong-gia-lap.mjs", "lotus-shell.mjs", "tham-my.mjs"]) {
    const nguon = await readRepositoryFile(`tests/e2e/${f}`);
    assert.ok(nguon.includes("gia-lap-supabase.mjs"),
      `${f} phải nạp lớp giả lập Supabase`);
  }
});

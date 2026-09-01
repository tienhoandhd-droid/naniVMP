import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dungKhoDuLieu } from "../e2e/gia-lap-supabase.mjs";

const legacyDirectoryCommand = "node tests/e2e/danh-muc-nguoi-thuc-hien.mjs";

async function readRepositoryFile(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function commandsIn(script) {
  return script.split(/\s*&&\s*/u).map((command) => command.trim());
}

test("fixture E2E mặc định cấp quyền tiến độ theo lô cho toàn bộ hạng mục của admin", () => {
  const kho = dungKhoDuLieu("day");
  const payload = typeof kho.rpc_my_editable_progress_rights === "function"
    ? kho.rpc_my_editable_progress_rights()
    : kho.rpc_my_editable_progress_rights;

  assert.equal(payload?.ok, true);
  assert.equal(payload?.rights?.length, 24);
  assert.deepEqual(payload.rights[0], {
    validation_code: "TB-100-IQ",
    editable_fields: [
      "actual_protocol_date",
      "status_protocol",
      "actual_validation_date",
      "status_validation",
      "actual_report_date",
      "status_report",
      "actual_vmp_date",
      "status_vmp",
      "scheduled_at",
    ],
    view_reason: "Quản trị toàn hệ thống",
  });

  const itemRights = typeof kho.vmp_my_item_rights === "function"
    ? kho.vmp_my_item_rights({ p_validation_code: "TB-100-IQ" })
    : kho.vmp_my_item_rights;
  assert.deepEqual(itemRights, [{
    can_view: true,
    editable_fields: payload.rights[0].editable_fields,
    view_reason: "Quản trị toàn hệ thống",
    assignment_sources: [],
    scope_match: true,
    area_match: true,
  }]);
});

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
 * Các bộ này chạy được KHÔNG cần tài khoản thật, nên chúng là cổng duy
 * nhất còn hiệu lực khi chưa có project Supabase cách ly. Đăng ký sai
 * hoặc đăng ký hai lần thì hoặc bỏ sót kiểm, hoặc chạy thừa gấp đôi —
 * cả hai đều lặng lẽ.
 * ------------------------------------------------------------------- */

const LENH_LOTUS = {
  "e2e:gialap": "node tests/e2e/luong-gia-lap.mjs && node tests/e2e/auth-recovery-flow.mjs && node tests/e2e/tai-khoan-an-sap-xep.mjs && node tests/e2e/timeline-deadline-edit.mjs",
  "e2e:catalog": "node tests/e2e/catalog-workspace.mjs",
  "e2e:progress-rights": "node tests/e2e/quyen-cot-timeline.mjs && node tests/e2e/phan-cong-cap-nhat-tien-do.mjs",
  shell: "node tests/e2e/lotus-shell.mjs",
  thammy: "node tests/e2e/tham-my.mjs",
  atelier: "node tests/e2e/atelier.mjs",
};

test("các bộ kiểm Lotus Pearl đều được đăng ký đúng một lần", async () => {
  const packageJson = JSON.parse(await readRepositoryFile("package.json"));
  for (const [ten, lenh] of Object.entries(LENH_LOTUS)) {
    assert.equal(packageJson.scripts[ten], lenh,
      `script "${ten}" phải là đúng lệnh ${lenh}`);
  }
});

test("README ghi cách chạy từng bộ", async () => {
  const readme = await readRepositoryFile("tests/e2e/README.md");
  for (const ten of Object.keys(LENH_LOTUS)) {
    assert.ok(readme.includes(`npm run ${ten}`),
      `README phải hướng dẫn chạy npm run ${ten}`);
  }
});

test("mọi bộ kiểm trình duyệt mới đều đi qua lớp giả lập, không chạm production", async () => {
  for (const f of ["luong-gia-lap.mjs", "auth-recovery-flow.mjs", "tai-khoan-an-sap-xep.mjs", "timeline-deadline-edit.mjs", "lotus-shell.mjs", "tham-my.mjs", "catalog-workspace.mjs"]) {
    const nguon = await readRepositoryFile(`tests/e2e/${f}`);
    assert.ok(nguon.includes("gia-lap-supabase.mjs"),
      `${f} phải nạp lớp giả lập Supabase`);
  }
});

function extractWorkflowJob(workflow, jobName, nextJobName) {
  const job = workflow.match(
    new RegExp(
      `^  ${jobName}:\\n([\\s\\S]*?)(?=^  ${nextJobName}:\\n)`,
      "mu",
    ),
  );
  assert.ok(job, `deploy.yml phải có job ${jobName} trước ${nextJobName}`);
  return job[1];
}

test("CI tách concurrency release main khỏi từng run không deploy", async () => {
  const ci = await readRepositoryFile(".github/workflows/deploy.yml");
  const concurrency = ci.match(/^concurrency:\n([\s\S]*?)(?=^\S)/mu);
  assert.ok(concurrency, "deploy.yml phải có top-level concurrency block");

  assert.match(
    concurrency[1],
    /group:\s*\$\{\{\s*github\.event_name\s*==\s*'push'\s*&&\s*github\.ref\s*==\s*'refs\/heads\/main'\s*&&\s*'pages-main'\s*\|\|\s*format\('pages-non-deploy-\{0\}',\s*github\.run_id\)\s*\}\}/u,
    "push main phải dùng group pages-main, còn PR/manual phải nhận group riêng theo run_id",
  );
  assert.match(concurrency[1], /cancel-in-progress:\s*false/u);
});

test("CI static-quality cài Chromium đóng gói trước khi chạy unit contracts", async () => {
  const ci = await readRepositoryFile(".github/workflows/deploy.yml");
  const staticQuality = extractWorkflowJob(ci, "static-quality", "e2e-mock");
  const chromiumInstall = "npx playwright install chromium --with-deps --no-shell";
  const chromiumInstallations = [...staticQuality.matchAll(
    new RegExp(chromiumInstall, "gu"),
  )];

  assert.equal(
    chromiumInstallations.length,
    1,
    "static-quality phải cài đúng một Chromium đóng gói cho unit contracts",
  );
  assert.ok(
    chromiumInstallations[0].index < staticQuality.indexOf("npm run test:unit"),
    "static-quality phải cài Chromium trước khi chạy npm run test:unit",
  );
});

test("CI e2e-mock chỉ chạy năm bộ giả lập cốt lõi được duyệt", async () => {
  const ci = await readRepositoryFile(".github/workflows/deploy.yml");
  const e2eMock = extractWorkflowJob(ci, "e2e-mock", "production-build");
  const e2eInvocations = [...e2eMock.matchAll(/npm run (e2e:[a-z0-9:-]+)/gu)]
    .map((match) => match[1]);

  assert.deepEqual(
    e2eInvocations,
    ["e2e:gialap", "e2e:catalog", "e2e:source-access", "e2e:progress-rights", "e2e:admin"],
    "e2e-mock phải chỉ gọi đúng năm bộ E2E lõi, đúng thứ tự và không lặp",
  );

  /* 31/08: "drift"/"a11y"/"shell" RỜI danh sách cấm — cả ba đã xanh ổn
     định và trở thành gate cứng (drift+budget ở static-quality, a11y thành
     job riêng, shell vào e2e-mock). Danh sách cấm chỉ còn nhóm visual
     (cần baseline Linux niêm phong riêng) và bộ thẩm mỹ chạy tay. */
  for (const ten of [
    "visual:runtime",
    "visual:contract",
    "visual",
    "thammy",
    "atelier",
  ]) {
    assert.equal(
      ci.includes(`npm run ${ten}`),
      false,
      `release workflow không được gọi "npm run ${ten}"`,
    );
  }
  /* 31/08: upload-artifact ĐƯỢC PHÉP nhưng CHỈ khi fail (bằng chứng chẩn
     đoán, giữ release lean) — mọi lần dùng phải đứng ngay sau `if: failure()`. */
  {
    const dong = ci.split("\n");
    dong.forEach((line, i) => {
      if (!line.includes("actions/upload-artifact")) return;
      const truoc = dong.slice(Math.max(0, i - 3), i).join("\n");
      assert.match(truoc, /if:\s*failure\(\)/,
        `upload-artifact ở dòng ${i + 1} phải nằm sau "if: failure()" — không tải artifact ở đường thành công`);
    });
  }
  assert.match(
    ci,
    /production-build:[\s\S]*?needs:\s*\n\s*- static-quality\s*\n\s*- source-access-db-contract\s*\n\s*- e2e-mock/u,
    "production-build phải chờ static-quality, Source DB contract và e2e-mock",
  );
  assert.match(
    e2eMock,
    /VITE_MANUAL_PLANNED_DEADLINES_ENABLED:\s*true/u,
    "mock E2E phải build deadline editor với feature gate bật tường minh",
  );
});

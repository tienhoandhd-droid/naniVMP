import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/* Hàng rào của `--suite` là thứ duy nhất ngăn một bộ test mutation chạy
   nhầm lên live. Nó nằm trong shell script nên không có gì bảo vệ ngoài
   bộ kiểm này: xoá một dòng `die` đi thì typecheck và build vẫn xanh. */

const script = fileURLToPath(new URL("../../scripts/test-item-permissions-sql.sh", import.meta.url));
const repoDir = fileURLToPath(new URL("../../", import.meta.url));

function chay(args, env = {}) {
  try {
    const stdout = execFileSync("bash", [script, ...args], {
      cwd: repoDir,
      env: { PATH: process.env.PATH, ...env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out: stdout };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

const URL_TEST = "postgresql://gia-lap/test";
const URL_LIVE = "postgresql://gia-lap/live";

test("--suite từ chối chạy khi thiếu VMP_TEST_DB_URL", () => {
  const r = chay(["--suite", "tests/sql/screen-access.sql"]);
  assert.equal(r.code, 64);
  assert.match(r.out, /--suite yêu cầu VMP_TEST_DB_URL/u);
});

test("--suite từ chối SUPABASE_DB_URL, kể cả khi đã có URL test", () => {
  const r = chay(["--suite", "tests/sql/screen-access.sql"], {
    SUPABASE_DB_URL: URL_LIVE,
    VMP_TEST_DB_URL: URL_TEST,
  });
  assert.equal(r.code, 64);
  assert.match(r.out, /--suite từ chối SUPABASE_DB_URL/u);
});

test("--suite từ chối URL của forward-test để input không mơ hồ", () => {
  const r = chay(["--suite", "tests/sql/screen-access.sql"], {
    ITEM_PERMISSION_SQL_DEDICATED_DB_URL: URL_TEST,
    VMP_TEST_DB_URL: URL_TEST,
  });
  assert.equal(r.code, 64);
  assert.match(r.out, /trạng thái input mơ hồ/u);
});

test("--suite chỉ nhận file trong tests/sql", () => {
  const r = chay(["--suite", "package.json"], { VMP_TEST_DB_URL: URL_TEST });
  assert.equal(r.code, 64);
  assert.match(r.out, /chỉ nhận file trong tests\/sql/u);
});

test("--suite đòi ít nhất một file test explicit", () => {
  const r = chay(["--suite"], { VMP_TEST_DB_URL: URL_TEST });
  assert.equal(r.code, 64);
  assert.match(r.out, /ít nhất một file SQL test explicit/u);
});

test("hai mode cũ vẫn giữ nguyên hàng rào riêng", () => {
  const cuoiCung = chay(["--final-state"]);
  assert.equal(cuoiCung.code, 64);
  assert.match(cuoiCung.out, /--final-state yêu cầu SUPABASE_DB_URL explicit/u);

  const tien = chay(["--forward-test"], { ITEM_PERMISSION_SQL_DEDICATED_DB_URL: URL_TEST });
  assert.equal(tien.code, 64);
  assert.match(tien.out, /--forward-test yêu cầu đúng một migration path explicit/u);
});

test("mode lạ bị từ chối, thông báo nêu đủ ba mode hợp lệ", () => {
  const r = chay(["--khong-co-mode-nay"]);
  assert.equal(r.code, 64);
  assert.match(r.out, /--final-state, --forward-test hoặc --suite/u);
});

/* =====================================================================
 *  preview-lifecycle.test.mjs — hợp đồng của scripts/with-preview.sh
 *  ---------------------------------------------------------------------
 *  Mọi lệnh trình duyệt của đợt Lotus Pearl đều chạy qua wrapper này.
 *  Test dựng một "repo giả" trong thư mục tạm: package.json của nó trỏ
 *  build/preview sang hai script node giả, nên ta ép được từng nhánh
 *  hỏng (build lỗi, cổng bận, chờ quá hạn) mà không cần Vite thật.
 * ===================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WRAPPER = path.join(GOC, "scripts/with-preview.sh");

/** Mã thoát có tài liệu — test và script phải khớp nhau. */
const MA = { USAGE: 2, ENV: 3, BUILD: 4, ARTIFACT: 5, PORT: 6, TIMEOUT: 7 };

/** Chuỗi mồi: nếu wrapper lỡ in giá trị bí mật ra thì test bắt được. */
const MOI_BI_MAT = "sentinel-khong-duoc-in-ra-9f3c";

const FAKE_BUILD = `
import fs from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
fs.appendFileSync(process.env.NHAT_KY_GOI, "build " + args.join(" ") + "\\n");
if (process.env.FAKE_BUILD_FAIL === "1") { console.error("build hong co y"); process.exit(1); }
const i = args.indexOf("--outDir");
if (i === -1) { console.error("thieu --outDir"); process.exit(1); }
const out = args[i + 1];
if (process.env.FAKE_BUILD_NO_OUTDIR === "1") process.exit(0);
fs.mkdirSync(out, { recursive: true });
if (process.env.FAKE_BUILD_EMPTY === "1") process.exit(0);
const nguon = fs.readFileSync(path.join(process.cwd(), "src/app.js"), "utf8");
fs.writeFileSync(path.join(out, "index.html"), "<!doctype html><title>gia</title>" + nguon);
`;

const FAKE_PREVIEW = `
import fs from "node:fs";
import http from "node:http";
const args = process.argv.slice(2);
fs.appendFileSync(process.env.NHAT_KY_GOI, "preview " + args.join(" ") + "\\n");
fs.appendFileSync(process.env.NHAT_KY_PID, process.pid + "\\n");
if (process.env.FAKE_PREVIEW_MODE === "fail") process.exit(1);
if (process.env.FAKE_PREVIEW_MODE === "treo") { setInterval(() => {}, 1000); }
else {
  const cong = Number(args[args.indexOf("--port") + 1]);
  http.createServer((_req, res) => { res.writeHead(200); res.end("ok"); }).listen(cong, "127.0.0.1");
}
process.on("SIGTERM", () => process.exit(0));
`;

const FAKE_INNER = `
import fs from "node:fs";
fs.appendFileSync(process.env.NHAT_KY_GOI, "inner\\n");
process.exit(Number(process.env.INNER_EXIT || "0"));
`;

function dungRepoGia() {
  const goc = mkdtempSync(path.join(tmpdir(), "with-preview-"));
  mkdirSync(path.join(goc, "src"), { recursive: true });
  mkdirSync(path.join(goc, "public"), { recursive: true });
  mkdirSync(path.join(goc, "tools"), { recursive: true });

  writeFileSync(path.join(goc, "src/app.js"), "console.log('v1');\n");
  writeFileSync(path.join(goc, "public/logo.txt"), "logo\n");
  writeFileSync(path.join(goc, "index.html"), "<!doctype html><div id=root></div>\n");
  writeFileSync(path.join(goc, "vite.config.ts"), "export default {};\n");
  writeFileSync(path.join(goc, "tsconfig.json"), "{}\n");
  writeFileSync(path.join(goc, "package-lock.json"), "{}\n");
  writeFileSync(path.join(goc, ".gitignore"), "node_modules/\ndist/\n.env.local\n*.log\n");

  writeFileSync(path.join(goc, "tools/fake-build.mjs"), FAKE_BUILD);
  writeFileSync(path.join(goc, "tools/fake-preview.mjs"), FAKE_PREVIEW);
  writeFileSync(path.join(goc, "tools/fake-inner.mjs"), FAKE_INNER);

  writeFileSync(path.join(goc, "package.json"), JSON.stringify({
    name: "repo-gia", version: "1.0.0", private: true,
    scripts: { build: "node tools/fake-build.mjs", preview: "node tools/fake-preview.mjs" },
  }, null, 2) + "\n");

  datEnvLocal(goc, {
    VITE_SUPABASE_URL: `https://du-an-cach-ly.supabase.co#${MOI_BI_MAT}`,
    VITE_SUPABASE_ANON: `anon-key-${MOI_BI_MAT}`,
    E2E_EMAIL: "kiem-thu@vi-du.test",
    E2E_PASSWORD: `mat-khau-${MOI_BI_MAT}`,
  });

  for (const lenh of [["init", "-q"], ["add", "-A"]]) {
    spawnSync("git", lenh, { cwd: goc, encoding: "utf8" });
  }
  return goc;
}

function datEnvLocal(goc, cap) {
  const noiDung = Object.entries(cap).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  writeFileSync(path.join(goc, ".env.local"), noiDung, { mode: 0o600 });
}

function chay(goc, doi = [], moiTruong = {}) {
  const nhatKyGoi = path.join(goc, "goi.log");
  const nhatKyPid = path.join(goc, "pid.log");
  const kq = spawnSync("bash", [WRAPPER, ...doi], {
    cwd: goc, encoding: "utf8", timeout: 60_000,
    env: {
      ...process.env,
      NHAT_KY_GOI: nhatKyGoi,
      NHAT_KY_PID: nhatKyPid,
      INNER_EXIT: "0",
      ...moiTruong,
    },
  });
  const doc = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
  return {
    ma: kq.status,
    ra: `${kq.stdout || ""}${kq.stderr || ""}`,
    goi: doc(nhatKyGoi),
    pids: doc(nhatKyPid).split("\n").filter(Boolean).map(Number),
  };
}

const LENH_TRONG = ["--", "node", "tools/fake-inner.mjs"];

/** Đếm số lần một khâu được gọi. So theo TỪ ĐẦU DÒNG chứ không tìm chuỗi
 *  con: đường dẫn thư mục tạm cũng chứa chữ "preview" nên tìm chuỗi con
 *  sẽ khớp nhầm ngay trên dòng của khâu build. */
function soLanGoi(kq, khau) {
  return kq.goi.split("\n").filter((d) => d === khau || d.startsWith(`${khau} `)).length;
}

function conSong(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/* ------------------------------------------------------------------ */

test("thiếu -- hoặc thiếu lệnh thì báo sai cú pháp, không build gì", () => {
  const goc = dungRepoGia();
  try {
    const khongDauGach = chay(goc, ["node", "tools/fake-inner.mjs"]);
    assert.equal(khongDauGach.ma, MA.USAGE);
    assert.equal(khongDauGach.goi, "");

    const rongSauGach = chay(goc, ["--"]);
    assert.equal(rongSauGach.ma, MA.USAGE);
    assert.equal(rongSauGach.goi, "");
  } finally { rmSync(goc, { recursive: true, force: true }); }
});

test("thiếu key hoặc key rỗng trong .env.local thì dừng trước khi build", () => {
  const goc = dungRepoGia();
  try {
    datEnvLocal(goc, {
      VITE_SUPABASE_URL: "https://du-an-cach-ly.supabase.co",
      E2E_EMAIL: "kiem-thu@vi-du.test",
      E2E_PASSWORD: "mat-khau",
    });
    const thieu = chay(goc, LENH_TRONG);
    assert.equal(thieu.ma, MA.ENV);
    assert.equal(thieu.goi, "");
    assert.match(thieu.ra, /VITE_SUPABASE_ANON/);

    datEnvLocal(goc, {
      VITE_SUPABASE_URL: "https://du-an-cach-ly.supabase.co",
      VITE_SUPABASE_ANON: "",
      E2E_EMAIL: "kiem-thu@vi-du.test",
      E2E_PASSWORD: "mat-khau",
    });
    const rong = chay(goc, LENH_TRONG);
    assert.equal(rong.ma, MA.ENV);
    assert.equal(rong.goi, "");
  } finally { rmSync(goc, { recursive: true, force: true }); }
});

test("không có .env.local thì dừng ngay", () => {
  const goc = dungRepoGia();
  try {
    rmSync(path.join(goc, ".env.local"));
    const kq = chay(goc, LENH_TRONG);
    assert.equal(kq.ma, MA.ENV);
    assert.equal(kq.goi, "");
  } finally { rmSync(goc, { recursive: true, force: true }); }
});

test("build hỏng thì không mở preview, không chạy lệnh trong", () => {
  const goc = dungRepoGia();
  try {
    const kq = chay(goc, LENH_TRONG, { FAKE_BUILD_FAIL: "1" });
    assert.equal(kq.ma, MA.BUILD);
    assert.equal(soLanGoi(kq, "build"), 1);
    assert.equal(soLanGoi(kq, "preview"), 0);
    assert.equal(soLanGoi(kq, "inner"), 0);
  } finally { rmSync(goc, { recursive: true, force: true }); }
});

test("build báo thành công nhưng không ra sản phẩm thì bị chặn ở khâu kiểm artifact", () => {
  const goc = dungRepoGia();
  try {
    const khongCoThuMuc = chay(goc, LENH_TRONG, { FAKE_BUILD_NO_OUTDIR: "1" });
    assert.equal(khongCoThuMuc.ma, MA.ARTIFACT);
    assert.equal(soLanGoi(khongCoThuMuc, "preview"), 0);

    const thuMucRong = chay(goc, LENH_TRONG, { FAKE_BUILD_EMPTY: "1" });
    assert.equal(thuMucRong.ma, MA.ARTIFACT);
    assert.equal(soLanGoi(thuMucRong, "preview"), 0);
  } finally { rmSync(goc, { recursive: true, force: true }); }
});

test("dist cũ không được coi là bằng chứng — vẫn phải build lại", () => {
  const goc = dungRepoGia();
  try {
    mkdirSync(path.join(goc, "dist"), { recursive: true });
    writeFileSync(path.join(goc, "dist/index.html"), "<!doctype html>cu\n");
    const kq = chay(goc, LENH_TRONG);
    assert.equal(kq.ma, 0);
    assert.equal(soLanGoi(kq, "build"), 1);
    assert.match(readFileSync(path.join(goc, "dist/index.html"), "utf8"), /gia/);
  } finally { rmSync(goc, { recursive: true, force: true }); }
});

test("chạy trọn vẹn: build → preview đúng tham số → lệnh trong → dọn tiến trình", () => {
  const goc = dungRepoGia();
  try {
    const kq = chay(goc, LENH_TRONG);
    assert.equal(kq.ma, 0);

    const thuTu = kq.goi.trim().split("\n").map((d) => d.split(" ")[0]);
    assert.deepEqual(thuTu, ["build", "preview", "inner"]);

    const dongPreview = kq.goi.split("\n").find((d) => d.startsWith("preview"));
    assert.match(dongPreview, /--host 127\.0\.0\.1/);
    assert.match(dongPreview, /--port 4173/);
    assert.match(dongPreview, /--strictPort/);

    assert.equal(kq.pids.length, 1);
    assert.equal(conSong(kq.pids[0]), false, "preview phải bị dừng và thu hồi sau khi xong");

    assert.doesNotMatch(kq.ra, new RegExp(MOI_BI_MAT), "không được in giá trị bí mật");
  } finally { rmSync(goc, { recursive: true, force: true }); }
});

test("dấu vân tay đầu vào đổi khi sửa mã nguồn, và build chạy lại", () => {
  const goc = dungRepoGia();
  try {
    assert.equal(chay(goc, LENH_TRONG).ma, 0);
    const van1 = readFileSync(path.join(goc, "dist/.lotus-build-input"), "utf8").trim();

    writeFileSync(path.join(goc, "src/app.js"), "console.log('v2');\n");
    assert.equal(chay(goc, LENH_TRONG).ma, 0);
    const van2 = readFileSync(path.join(goc, "dist/.lotus-build-input"), "utf8").trim();

    assert.notEqual(van1, van2);
    assert.match(readFileSync(path.join(goc, "dist/index.html"), "utf8"), /v2/);
  } finally { rmSync(goc, { recursive: true, force: true }); }
});

test("dấu vân tay theo tên key của .env.local, không theo giá trị", () => {
  const goc = dungRepoGia();
  try {
    assert.equal(chay(goc, LENH_TRONG).ma, 0);
    const van1 = readFileSync(path.join(goc, "dist/.lotus-build-input"), "utf8").trim();

    datEnvLocal(goc, {
      VITE_SUPABASE_URL: "https://du-an-khac.supabase.co",
      VITE_SUPABASE_ANON: "anon-khac",
      E2E_EMAIL: "khac@vi-du.test",
      E2E_PASSWORD: "mat-khau-khac",
    });
    assert.equal(chay(goc, LENH_TRONG).ma, 0);
    const van2 = readFileSync(path.join(goc, "dist/.lotus-build-input"), "utf8").trim();
    assert.equal(van1, van2, "đổi giá trị bí mật không được làm đổi dấu vân tay");

    datEnvLocal(goc, {
      VITE_SUPABASE_URL: "https://du-an-khac.supabase.co",
      VITE_SUPABASE_ANON: "anon-khac",
      E2E_EMAIL: "khac@vi-du.test",
      E2E_PASSWORD: "mat-khau-khac",
      VITE_TINH_NANG_MOI: "1",
    });
    assert.equal(chay(goc, LENH_TRONG).ma, 0);
    const van3 = readFileSync(path.join(goc, "dist/.lotus-build-input"), "utf8").trim();
    assert.notEqual(van2, van3, "thêm một key mới phải làm đổi dấu vân tay");
  } finally { rmSync(goc, { recursive: true, force: true }); }
});

test("cổng 4173 đang bị người khác giữ thì từ chối, không cướp cổng", async () => {
  const goc = dungRepoGia();
  const { createServer } = await import("node:http");
  const chan = createServer((_req, res) => { res.writeHead(200); res.end("nguoi-khac"); });
  await new Promise((ok) => chan.listen(4173, "127.0.0.1", ok));
  try {
    const kq = chay(goc, LENH_TRONG);
    assert.equal(kq.ma, MA.PORT);
    assert.equal(soLanGoi(kq, "preview"), 0);
    assert.equal(soLanGoi(kq, "inner"), 0);
  } finally {
    await new Promise((ok) => chan.close(ok));
    rmSync(goc, { recursive: true, force: true });
  }
});

test("preview chết ngay hoặc không bao giờ sẵn sàng thì báo đúng lỗi và không chạy lệnh trong", () => {
  const goc = dungRepoGia();
  try {
    const chet = chay(goc, LENH_TRONG, { FAKE_PREVIEW_MODE: "fail" });
    assert.ok(chet.ma === MA.PORT || chet.ma === MA.TIMEOUT);
    assert.equal(soLanGoi(chet, "inner"), 0);

    const treo = chay(goc, LENH_TRONG, { FAKE_PREVIEW_MODE: "treo", WITH_PREVIEW_TIMEOUT: "3" });
    assert.equal(treo.ma, MA.TIMEOUT);
    assert.equal(soLanGoi(treo, "inner"), 0);
    for (const pid of treo.pids) {
      assert.equal(conSong(pid), false, "preview treo vẫn phải bị dừng khi hết hạn chờ");
    }
  } finally { rmSync(goc, { recursive: true, force: true }); }
});

test("lệnh trong thất bại thì wrapper trả đúng mã thoát của nó và vẫn dọn preview", () => {
  const goc = dungRepoGia();
  try {
    const kq = chay(goc, LENH_TRONG, { INNER_EXIT: "23" });
    assert.equal(kq.ma, 23);
    assert.equal(soLanGoi(kq, "inner"), 1);
    assert.equal(conSong(kq.pids[0]), false);
  } finally { rmSync(goc, { recursive: true, force: true }); }
});

test("sau khi wrapper kết thúc thì không ai còn phục vụ ở cổng 4173", async () => {
  const goc = dungRepoGia();
  try {
    assert.equal(chay(goc, LENH_TRONG).ma, 0);
    await assert.rejects(fetch("http://127.0.0.1:4173/", { signal: AbortSignal.timeout(2000) }));
  } finally { rmSync(goc, { recursive: true, force: true }); }
});

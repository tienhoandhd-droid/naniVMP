import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* Quyền ghi GitHub Pages + OIDC chỉ được nằm ở job deploy. Đặt ở cấp
   workflow thì mọi job — kể cả job chạy code của pull request — đều nhận
   token có quyền ghi. Đọc theo thụt lề, không cần thư viện YAML. */

const yml = readFileSync(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8");
const lines = yml.split("\n");

/** Khối `permissions:` ngay dưới một dòng có thụt lề `indent`, trong đoạn [from, to). */
function permissionsBlock(from, to, indent) {
  const pad = " ".repeat(indent);
  const start = lines.findIndex((l, i) => i >= from && i < to && l === `${pad}permissions:`);
  if (start < 0) return null;
  const block = {};
  for (let i = start + 1; i < to; i += 1) {
    const m = lines[i].match(/^(\s*)([a-z-]+):\s*(\S+)\s*$/);
    if (!m || m[1].length <= indent) break;
    block[m[2]] = m[3];
  }
  return block;
}

function jobs() {
  const start = lines.indexOf("jobs:");
  const heads = [];
  lines.forEach((l, i) => { const m = l.match(/^ {2}([a-z0-9-]+):\s*$/); if (i > start && m) heads.push([m[1], i]); });
  return heads.map(([name, at], k) => ({ name, at, end: k + 1 < heads.length ? heads[k + 1][1] : lines.length }));
}

test("cấp workflow chỉ còn contents: read", () => {
  const top = permissionsBlock(0, lines.indexOf("jobs:"), 0);
  assert.deepEqual(top, { contents: "read" });
});

test("chỉ job deploy có pages: write và id-token: write", () => {
  const ds = jobs();
  assert.ok(ds.some((j) => j.name === "deploy"), "phải còn job deploy");
  for (const j of ds) {
    const p = permissionsBlock(j.at, j.end, 4) ?? {};
    if (j.name === "deploy") {
      assert.equal(p.pages, "write");
      assert.equal(p["id-token"], "write");
    } else {
      assert.ok(!Object.values(p).includes("write"), `${j.name} không được có quyền ghi: ${JSON.stringify(p)}`);
    }
  }
});

test("job chạy code PR không có quyền ghi (kể cả kế thừa)", () => {
  const prJobs = jobs().filter((j) => !lines.slice(j.at, j.end).some((l) => /^ {4}if: .*github\.event_name == 'push'/.test(l)));
  assert.ok(prJobs.length >= 3, "phải nhận ra các job chất lượng chạy cho PR");
  for (const j of prJobs) {
    const p = permissionsBlock(j.at, j.end, 4);
    const quyen = p ?? permissionsBlock(0, lines.indexOf("jobs:"), 0);
    assert.ok(!Object.values(quyen).includes("write"), `${j.name}: ${JSON.stringify(quyen)}`);
  }
});

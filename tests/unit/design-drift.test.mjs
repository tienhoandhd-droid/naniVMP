import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = new URL("../..", import.meta.url);
const run = (fixture) => spawnSync(process.execPath,
  ["scripts/check-design-drift.mjs", "--root", fixture],
  { cwd: ROOT, encoding: "utf8" });

test("drift reports a sub-12px business label and multiline white background as two violations", (t) => {
  const fixture = path.join(tmpdir(), `vmp-drift-${process.pid}-${Date.now()}`);
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  mkdirSync(path.join(fixture, "src", "features", "probe"), { recursive: true });
  writeFileSync(path.join(fixture, "src", "features", "probe", "probe.css"), `
.probe { font-size: 11px; }
.panel {
  background:
    #fff;
}
`);
  const result = run(fixture);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /2 vi phạm luật thiết kế/u);
  assert.match(result.stderr, /chữ 11px nhỏ hơn 12px/u);
  assert.match(result.stderr, /nền trắng literal/u);
});

test("drift accepts semantic backgrounds and 12px text", (t) => {
  const fixture = path.join(tmpdir(), `vmp-drift-clean-${process.pid}-${Date.now()}`);
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  mkdirSync(path.join(fixture, "src", "features", "probe"), { recursive: true });
  writeFileSync(path.join(fixture, "src", "features", "probe", "probe.css"),
    ".probe { font-size: 12px; background: var(--lp-surface); border-radius: 10px; }\n");
  const result = run(fixture);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Không có trôi thiết kế\. ĐẠT\./u);
});

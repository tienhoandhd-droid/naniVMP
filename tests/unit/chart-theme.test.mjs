import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../src/constants/chartTheme.ts", import.meta.url), "utf8");

test("chart palette gives each stage a dedicated semantic token", () => {
  for (const stage of ["protocol", "validation", "report", "vmp"]) {
    assert.match(source, new RegExp(`${stage}: \\{ color: "var\\(--chart-${stage === "vmp" ? "complete" : stage}\\)"`));
  }
});

test("chart status colors reserve terracotta for overdue work", () => {
  assert.match(source, /overdue: \{ color: "var\(--chart-overdue\)"/);
  assert.match(source, /complete: CHART_STAGE\.vmp/);
});

test("chart styles only refer to existing shell color tokens", () => {
  const styles=readFileSync(new URL('../../src/styles/chart-theme.css',import.meta.url),'utf8')+readFileSync(new URL('../../src/styles/chart-palette.css',import.meta.url),'utf8');
  const shell=readFileSync(new URL('../../src/index.css',import.meta.url),'utf8')+readFileSync(new URL('../../src/styles/lotus-tokens.css',import.meta.url),'utf8');
  for (const token of new Set(styles.match(/--c-[a-z-]+/g))) {
    assert.match(shell,new RegExp(`${token}:`),`undefined shell color ${token}`);
  }
});

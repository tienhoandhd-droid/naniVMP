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

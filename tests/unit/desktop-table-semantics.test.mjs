import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const activity = {
  id: "PQ-001/2026",
  code: "PQ-001/2026",
  obj: "OBJ-001",
  name: "Nồi hấp thử nghiệm",
  type: "PQ",
  vtype: "PQ",
  cls: "tb",
  dept: "QA",
  owner: "Nguyễn QA",
  st: "todo",
  target: "2026-10-20",
  _raw: {
    dl_de_cuong: "2026-08-20",
    dl_tham_dinh: "2026-09-20",
    dl_bao_cao: "2026-10-10",
    dl_vmp: "2026-10-20",
    tt_de_cuong: "planned",
    tt_tham_dinh: "planned",
    tt_bao_cao: "planned",
    tt_vmp: "planned",
  },
};

const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

let vite;
const moduleFor = async (path) => {
  if (!vite) vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  return vite.ssrLoadModule(path);
};

test.after(async () => { await vite?.close(); });

function assertNamedDataTable(html, label) {
  const table = html.match(/<table\b[\s\S]*?<\/table>/)?.[0] || "";
  assert.ok(table, `${label} must render a native table`);
  const caption = table.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/)?.[1]
    .replace(/<[^>]+>/g, "")
    .trim();
  assert.ok(caption, `${label} must expose a non-empty table caption`);
  assert.match(table, /<th\b[^>]*scope="col"/, `${label} must scope its column headers`);
  assert.match(table, /<th\b[^>]*scope="row"/, `${label} must scope its row labels`);
}

test("Catalog milestones table exposes its name and header relationships", async () => {
  const catalog = await moduleFor("/src/pages/CatalogPage.tsx");
  assert.equal(typeof catalog.CatalogMilestonesTable, "function", "Catalog milestones must be renderable for semantic coverage");

  assertNamedDataTable(render(catalog.CatalogMilestonesTable, {
    items: [activity], dupYears: new Set(), readOnly: false,
    onQuickDone: () => {}, onEdit: () => {},
  }), "Catalog milestones");
});

test("completion comparison table exposes its name and header relationships", async () => {
  const completion = await moduleFor("/src/components/dashboard/CompletionDashboard.tsx");
  assert.equal(typeof completion.DimensionTable, "function", "Completion comparison must be renderable for semantic coverage");

  assertNamedDataTable(render(completion.DimensionTable, {
    activities: [activity], dimension: "department",
  }), "Completion comparison");
});

test("annual numeric table exposes its name and header relationships", async () => {
  const annual = await moduleFor("/src/components/dashboard/VongNam.tsx");
  assert.equal(typeof annual.VongNamTable, "function", "Annual table state must be renderable for semantic coverage");

  assertNamedDataTable(render(annual.VongNamTable, {
    months: [{ thang: 0, tong: 2, xong: 1, daQua: false, dangChay: true }],
  }), "Annual numeric table");
});

test("analysis matrix table exposes its name and header relationships", async () => {
  const matrix = await moduleFor("/src/components/dashboard/MaTranTienDo.tsx");
  assertNamedDataTable(render(matrix.default, { acts: [activity] }), "Analysis matrix");
});

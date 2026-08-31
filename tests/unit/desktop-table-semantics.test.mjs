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
const duplicateYearActivity = { ...activity, id: "PQ-002/2026", code: "PQ-002/2026" };

const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

let vite;
const moduleFor = async (path) => {
  if (!vite) vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  return vite.ssrLoadModule(path);
};

test.after(async () => { await vite?.close(); });

function tableMarkup(html, label) {
  const table = html.match(/<table\b[\s\S]*?<\/table>/)?.[0] || "";
  assert.ok(table, `${label} must render a native table`);
  return table;
}

function scopedHeaders(table, scope) {
  return [...table.matchAll(new RegExp(`<th\\b(?=[^>]*\\bscope="${scope}")[^>]*>([\\s\\S]*?)<\\/th>`, "g"))]
    .map((match) => match[1].replace(/<[^>]+>/g, "").trim());
}

function sectionHeaders(table, section) {
  const markup = table.match(new RegExp(`<${section}\\b[^>]*>([\\s\\S]*?)<\\/${section}>`, "i"))?.[1] || "";
  return [...markup.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)]
    .map((match) => match[1].replace(/<[^>]+>/g, "").trim());
}

function assertNamedDataTable(html, label) {
  const table = tableMarkup(html, label);
  const caption = table.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/)?.[1]
    .replace(/<[^>]+>/g, "")
    .trim();
  assert.ok(caption, `${label} must expose a non-empty table caption`);
  const columnHeaders = scopedHeaders(table, "col");
  const rowHeaders = scopedHeaders(table, "row");
  const theadHeaders = sectionHeaders(table, "thead");
  const tbodyHeaders = sectionHeaders(table, "tbody");
  assert.ok(columnHeaders.length > 0, `${label} must scope its column headers`);
  assert.ok(rowHeaders.length > 0, `${label} must scope its row labels`);
  assert.deepEqual(columnHeaders, theadHeaders, `${label} must scope every <thead> header with scope="col"`);
  assert.deepEqual(rowHeaders, tbodyHeaders, `${label} must scope every <tbody> header with scope="row"`);
  assert.ok(columnHeaders.every(Boolean), `${label} must name every scoped column header`);
  assert.ok(rowHeaders.every(Boolean), `${label} must name every scoped row header`);
}

test("table semantics fails closed when any rendered header loses its scope", () => {
  const unscopedColumnHeader = `
    <table>
      <caption>Kiểm tra</caption>
      <thead><tr><th scope="col">Mã</th><th>Thao tác</th></tr></thead>
      <tbody><tr><th scope="row">PQ-001/2026</th><td>Mở</td></tr></tbody>
    </table>`;

  assert.throws(
    () => assertNamedDataTable(unscopedColumnHeader, "Scope guard"),
    /scope="col"/,
  );
});

test("Catalog milestones table names every column header, including its actions", async () => {
  const catalog = await moduleFor("/src/pages/CatalogPage.tsx");
  assert.equal(typeof catalog.CatalogMilestonesTable, "function", "Catalog milestones must be renderable for semantic coverage");

  const html = render(catalog.CatalogMilestonesTable, {
    items: [activity, duplicateYearActivity], dupYears: new Set(["2026"]), readOnly: false,
    onQuickDone: () => {}, onEdit: () => {},
  });
  assertNamedDataTable(html, "Catalog milestones");
  assert.ok(scopedHeaders(tableMarkup(html, "Catalog milestones"), "col").includes("Thao tác"),
    "Catalog milestones must name its actions column");
});

test("Catalog milestones use each validation ID as the unique row header", async () => {
  const catalog = await moduleFor("/src/pages/CatalogPage.tsx");
  const html = render(catalog.CatalogMilestonesTable, {
    items: [activity, duplicateYearActivity], dupYears: new Set(["2026"]), readOnly: false,
    onQuickDone: () => {}, onEdit: () => {},
  });
  const rowHeaders = scopedHeaders(tableMarkup(html, "Catalog milestones"), "row");

  assert.deepEqual(rowHeaders, [activity.id, duplicateYearActivity.id]);
  assert.equal(new Set(rowHeaders).size, 2, "duplicate-year rows must retain unique row headers");
});

test("Catalog milestones row headers retain the prior left-aligned transparent row treatment", async () => {
  const catalog = await moduleFor("/src/pages/CatalogPage.tsx");
  const html = render(catalog.CatalogMilestonesTable, {
    items: [activity], dupYears: new Set(), readOnly: false,
    onQuickDone: () => {}, onEdit: () => {},
  });
  const rowHeader = tableMarkup(html, "Catalog milestones").match(/<th\b(?=[^>]*scope="row")[^>]*>/)?.[0] || "";

  assert.match(rowHeader, /text-align:left/, "row headers must not inherit UA centering");
  assert.match(rowHeader, /background:transparent/, "row headers must preserve their parent row background");
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

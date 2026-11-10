/* Đợt B rà soát 10/11 — fix round 1: ô "Đích VMP" ở Danh mục dùng định nghĩa
 * chung (isVmpComplete: trạng thái Hoàn thành HOẶC có ngày VMP thực tế). */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let vite;
const moduleFor = async (path) => {
  if (!vite) vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  return vite.ssrLoadModule(path);
};
test.after(async () => { await vite?.close(); });

test("Danh mục: mục có ngày VMP thực tế mà trạng thái 'đang làm' hiện là xong, không phải trễ", async () => {
  const catalog = await moduleFor("/src/pages/CatalogPage.tsx");
  const item = {
    id: "PQ-NGAY-VMP/2026", code: "PQ-NGAY-VMP/2026", owner: "QA", st: "done", target: "2026-10-01",
    _raw: {
      dl_de_cuong: "2099-01-01", dl_tham_dinh: "2099-01-01", dl_bao_cao: "2099-01-01",
      dl_vmp: "2026-10-01", ngay_vmp: "2026-09-28", tt_vmp: "in_progress",
    },
  };
  const html = renderToStaticMarkup(React.createElement(catalog.CatalogMilestonesTable, {
    items: [item], dupYears: new Set(), readOnly: true, onQuickDone: () => {}, onEdit: () => {},
  }));
  assert.doesNotMatch(html, />trễ</, "ô Đích VMP báo trễ dù đã có ngày hoàn thành");
  assert.match(html, />xong 28\/09\/2026</);
});

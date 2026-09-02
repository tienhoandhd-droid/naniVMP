import test from "node:test";
import assert from "node:assert/strict";
import { presentGlobalFilterSummary } from "../../src/features/overview/globalFilterSummary.ts";

test("global filter summary names the unfiltered data state", () => {
  assert.deepEqual(presentGlobalFilterSummary({
    departmentLabels: [], areaLabels: [], dateLabel: null,
  }), {
    activeCount: 0,
    visibleLabel: "Tất cả dữ liệu",
    ariaLabel: "Bộ lọc dữ liệu: đang xem tất cả",
  });
});

test("global filter summary keeps two labels visible", () => {
  assert.deepEqual(presentGlobalFilterSummary({
    departmentLabels: ["XSX"], areaLabels: ["Khu vực Khu A"], dateLabel: null,
  }), {
    activeCount: 2,
    visibleLabel: "XSX · Khu vực Khu A",
    ariaLabel: "Bộ lọc dữ liệu: 2 điều kiện đang áp dụng",
  });
});

test("global filter summary collapses only labels beyond the first two", () => {
  assert.deepEqual(presentGlobalFilterSummary({
    departmentLabels: ["XSX", "QA"],
    areaLabels: ["Khu vực Khu A"],
    dateLabel: "01/08–31/08",
  }), {
    activeCount: 4,
    visibleLabel: "XSX · QA · +2",
    ariaLabel: "Bộ lọc dữ liệu: 4 điều kiện đang áp dụng",
  });
});

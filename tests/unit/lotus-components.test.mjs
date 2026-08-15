/* =====================================================================
 *  lotus-components.test.mjs — hợp đồng của bộ bề mặt dùng chung
 *  ---------------------------------------------------------------------
 *  Ba track redesign sau đều dựng màn bằng đúng bảy component này. Test
 *  dựng HTML tĩnh (renderToStaticMarkup) và soi cấu trúc thật, vì lỗi hay
 *  gặp ở lớp này không phải sai màu mà là sai NGỮ NGHĨA: hai thẻ h1 trên
 *  một trang, ô số liệu không bấm được lại mang vai trò nút, bảng không
 *  có caption, hay bản mobile và desktop cùng lọt vào cây trợ năng.
 * ===================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { normalizeMetricPriority, stateBoundaryAction } from "../../src/lib/visualContract.ts";
import PageHeader from "../../src/components/ui/PageHeader.tsx";
import MetricGrid from "../../src/components/ui/MetricGrid.tsx";
import CommandBar from "../../src/components/ui/CommandBar.tsx";
import PriorityStrip from "../../src/components/ui/PriorityStrip.tsx";
import SmartTable from "../../src/components/ui/SmartTable.tsx";
import MobileTaskList from "../../src/components/ui/MobileTaskList.tsx";
import StateBoundary from "../../src/components/ui/StateBoundary.tsx";

const GOC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const doc = (p) => readFileSync(path.join(GOC, p), "utf8");
const dung = (comp, props, con) => renderToStaticMarkup(React.createElement(comp, props, con));
const dem = (html, re) => (html.match(re) || []).length;

/* ---- Hàm thuần ------------------------------------------------------ */

test("mức ưu tiên của ô số liệu mặc định là phụ, không phải hero", () => {
  assert.equal(normalizeMetricPriority(undefined), "supporting");
  assert.equal(normalizeMetricPriority("hero"), "hero");
  assert.equal(normalizeMetricPriority("supporting"), "supporting");
});

test("mỗi loại trạng thái rỗng đề nghị đúng một hành động", () => {
  assert.equal(stateBoundaryAction("filtered-empty"), "clear-filters");
  assert.equal(stateBoundaryAction("network-error"), "retry");
  assert.equal(stateBoundaryAction("empty"), "none");
  assert.equal(stateBoundaryAction("forbidden"), "none");
  assert.equal(stateBoundaryAction("loading"), "none");
});

/* ---- PageHeader ----------------------------------------------------- */

test("PageHeader dựng đúng MỘT h1 — nhiều h1 là phá cấu trúc tài liệu", () => {
  const html = dung(PageHeader, {
    eyebrow: "Vận hành", title: "Cập nhật tiến độ",
    description: "Ghi nhận thẩm định thực tế", scopeLabel: "Xưởng sản xuất",
    updatedLabel: "Cập nhật 5 phút trước",
  });
  assert.equal(dem(html, /<h1[\s>]/g), 1);
  assert.match(html, /lp-page-header/);
  assert.match(html, /Cập nhật tiến độ/);
  assert.match(html, /Xưởng sản xuất/);
  assert.match(html, /Cập nhật 5 phút trước/);
});

test("PageHeader bỏ hẳn phần phụ khi không được truyền, không để lại hộp rỗng", () => {
  const html = dung(PageHeader, { title: "Tổng quan" });
  assert.equal(dem(html, /<h1[\s>]/g), 1);
  assert.doesNotMatch(html, /lp-page-header__eyebrow/);
  assert.doesNotMatch(html, /lp-page-header__scope/);
});

/* ---- MetricGrid ----------------------------------------------------- */

const SO_LIEU = [
  { id: "tong", label: "Tổng hạng mục", value: 461, priority: "hero" },
  { id: "qua-han", label: "Quá hạn", value: 12, tone: "danger" },
  { id: "xong", label: "Đã xong", value: 318, tone: "success" },
];

test("MetricGrid chỉ ô có onActivate mới là nút thật", () => {
  const html = dung(MetricGrid, {
    items: [
      { ...SO_LIEU[0] },
      { ...SO_LIEU[1], onActivate: () => {} },
    ],
  });
  // Đúng một nút: ô "Quá hạn". Ô "Tổng hạng mục" không bấm được nên không
  // được mang vai trò nút — người dùng bàn phím sẽ tab vào rồi bấm hụt.
  assert.equal(dem(html, /<button/g), 1);
  assert.match(html, /lp-metric-grid/);
});

test("MetricGrid đánh dấu ô hero khác ô phụ", () => {
  const html = dung(MetricGrid, { items: SO_LIEU });
  assert.match(html, /lp-metric--hero/);
  assert.equal(dem(html, /lp-metric--hero/g), 1);
  assert.equal(dem(html, /lp-metric--supporting/g), 2);
});

test("MetricGrid gắn sắc thái ngữ nghĩa vào lớp, không gán màu cứng", () => {
  const html = dung(MetricGrid, { items: SO_LIEU });
  assert.match(html, /lp-tone--danger/);
  assert.match(html, /lp-tone--success/);
  assert.doesNotMatch(html, /#[0-9A-Fa-f]{6}/);
});

/* ---- SmartTable ----------------------------------------------------- */

const DONG = [
  { id: "TB-001", ten: "Máy dập viên", trang_thai: "Đã xong" },
  { id: "TB-002", ten: "Máy đóng nang", trang_thai: "Quá hạn" },
];
const COT = [
  { id: "ma", header: "Mã", cell: (r) => r.id },
  { id: "ten", header: "Tên đối tượng", cell: (r) => r.ten },
  { id: "tt", header: "Trạng thái", cell: (r) => r.trang_thai, priority: "supporting" },
];

test("SmartTable là bảng ngữ nghĩa thật và luôn có caption", () => {
  const html = dung(SmartTable, {
    caption: "Danh sách đối tượng thẩm định",
    rows: DONG, rowKey: (r) => r.id, columns: COT,
  });
  assert.equal(dem(html, /<table/g), 1);
  assert.equal(dem(html, /<caption/g), 1);
  assert.match(html, /Danh sách đối tượng thẩm định/);
  assert.equal(dem(html, /<th /g) + dem(html, /<th>/g), 3);
  assert.equal(dem(html, /<tr>/g) + dem(html, /<tr /g), 3);   // 1 tiêu đề + 2 dòng
});

test("SmartTable rỗng thì hiện lời giải thích thay vì bảng trống trơn", () => {
  const html = dung(SmartTable, {
    caption: "Danh sách đối tượng", rows: [], rowKey: (r) => r.id, columns: COT,
    empty: "Chưa có đối tượng nào khớp bộ lọc",
  });
  assert.match(html, /Chưa có đối tượng nào khớp bộ lọc/);
});

test("SmartTable chỉ mở dòng đang được chỉ định, và mở bằng nút bấm được", () => {
  const html = dung(SmartTable, {
    caption: "Danh sách", rows: DONG, rowKey: (r) => r.id, columns: COT,
    renderExpandedRow: (r) => `Chi tiết ${r.id}`,
    expandedRowId: "TB-002",
    onExpandedRowChange: () => {},
  });
  assert.match(html, /Chi tiết TB-002/);
  assert.doesNotMatch(html, /Chi tiết TB-001/);
  assert.match(html, /aria-expanded="true"/);
});

/* ---- MobileTaskList ------------------------------------------------- */

test("MobileTaskList là danh sách có nhãn, không phải một mớ div", () => {
  const html = dung(MobileTaskList, {
    label: "Đối tượng thẩm định",
    rows: DONG, rowKey: (r) => r.id,
    renderItem: (r) => r.ten,
  });
  assert.equal(dem(html, /<ul/g), 1);
  assert.equal(dem(html, /<li/g), 2);
  assert.match(html, /aria-label="Đối tượng thẩm định"/);
  assert.match(html, /lp-mobile-task-list/);
});

test("bản mobile và bản desktop không cùng lúc lọt vào cây trợ năng", () => {
  const css = doc("src/styles/lotus-components.css");
  // Ẩn bằng display:none chứ không phải opacity/visibility: chỉ display:none
  // mới thật sự lấy phần tử ra khỏi cây trợ năng.
  assert.match(css, /\.lp-mobile-task-list\s*\{[^}]*display:\s*none/);
  assert.match(css, /@media[^{]*max-width[^{]*\{/);
});

/* ---- StateBoundary -------------------------------------------------- */

test("StateBoundary phân biệt đủ năm trạng thái", () => {
  for (const [trang_thai, dau_hieu] of [
    ["loading", /lp-state-boundary--loading/],
    ["empty", /lp-state-boundary--empty/],
    ["filtered-empty", /lp-state-boundary--filtered-empty/],
    ["error", /lp-state-boundary--error/],
    ["forbidden", /lp-state-boundary--forbidden/],
  ]) {
    const html = dung(StateBoundary, { state: trang_thai, title: "Thử" });
    assert.match(html, dau_hieu, `thiếu dấu hiệu cho trạng thái ${trang_thai}`);
  }
});

test("rỗng-vì-lọc mời xoá bộ lọc, còn rỗng-thật thì không", () => {
  const loc = dung(StateBoundary, {
    state: "filtered-empty", title: "Không khớp bộ lọc", onClearFilters: () => {},
  });
  assert.match(loc, /<button/);

  const rong = dung(StateBoundary, { state: "empty", title: "Chưa có dữ liệu" });
  assert.doesNotMatch(rong, /<button/);
});

test("khung chờ không có hoạt ảnh chạy vô tận", () => {
  const css = doc("src/styles/lotus-components.css");
  const khoi = css.slice(css.indexOf(".lp-state-boundary--loading"));
  assert.doesNotMatch(khoi.slice(0, 600), /infinite/);
});

/* ---- CommandBar và PriorityStrip ------------------------------------ */

test("CommandBar là vùng có nhãn cho nhóm hành động của màn", () => {
  const html = dung(CommandBar, { label: "Hành động danh mục" }, "nội dung");
  assert.match(html, /lp-command-bar/);
  assert.match(html, /aria-label="Hành động danh mục"/);
});

test("PriorityStrip nêu việc gấp kèm chữ, không chỉ dựa vào màu", () => {
  const html = dung(PriorityStrip, {
    items: [
      { id: "a", tone: "danger", label: "Quá hạn", value: 12, hint: "cần xử lý ngay" },
      { id: "b", tone: "warning", label: "Sắp tới hạn", value: 8 },
    ],
  });
  assert.match(html, /lp-priority-strip/);
  assert.match(html, /Quá hạn/);
  assert.match(html, /cần xử lý ngay/);
  // Luật §5.3: trạng thái luôn có chữ đi kèm màu.
  assert.match(html, /Sắp tới hạn/);
});

/* ---- Tài sản thương hiệu và lớp CSS --------------------------------- */

test("có đủ các lớp dùng chung trong lotus-components.css", () => {
  const css = doc("src/styles/lotus-components.css");
  for (const lop of [
    ".lp-page-header", ".lp-metric-grid", ".lp-command-bar",
    ".lp-priority-strip", ".lp-smart-table", ".lp-mobile-task-list",
    ".lp-state-boundary",
  ]) {
    assert.ok(css.includes(lop), `thiếu lớp ${lop}`);
  }
});

test("vương miện và hoa sen là hình học thuần, không nhúng ảnh hay chữ", () => {
  for (const p of ["src/assets/brand/crown-mark.svg", "src/assets/patterns/lotus-line.svg"]) {
    const svg = doc(p);
    assert.match(svg, /viewBox=/);
    assert.match(svg, /currentColor/, `${p} phải ăn màu theo ngữ cảnh`);
    assert.doesNotMatch(svg, /<image|<text|base64|<filter/, `${p} không được nhúng ảnh/chữ/filter`);
  }
});

test("chỉ vàng và ánh ngọc trai được dùng qua token, không gõ lại mã màu", () => {
  const css = doc("src/styles/lotus-components.css");
  assert.match(css, /var\(--lp-gold-hairline\)/);
  assert.match(css, /var\(--lp-sheen\)/);
  // Không mã hex nào lọt vào lớp dùng chung — mọi màu phải đi qua token,
  // nếu không chế độ tối sẽ trơ ra như màn đăng nhập cũ.
  const hex = css.match(/#[0-9A-Fa-f]{6}\b/g) || [];
  assert.deepEqual(hex, [], `còn mã màu cứng: ${hex.join(", ")}`);
});

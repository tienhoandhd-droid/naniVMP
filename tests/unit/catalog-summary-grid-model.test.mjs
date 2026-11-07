import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSummaryRows, filterSummaryRows, sortSummaryRows, summaryCounts, summaryExportAoa,
} from "../../src/features/catalogWorkspace/summaryGridModel.ts";

/* Hai hạng mục mẫu đúng hình dạng rpc_get_vmp_dashboard_v2 trả về. */
const acts = [
  {
    id: "PCTB201/2026.01-PQ", code: "PCTB201", obj: "PCTB201", name: "Máy dập viên",
    type: "PQ", vtype: "PQ", dept: "xsx", owner: "Lê Xuân Đức", support: null,
    freq: 12, st: "prog", target: "2026-09-30", daysLeft: -5, state: "active",
    _raw: {
      khu_vuc: "C1", line: "BFS", tan_suat: 12, bo_phan: "Xưởng sản xuất",
      tt_de_cuong: "completed", ngay_de_cuong: null,
      tt_tham_dinh: "completed", ngay_tham_dinh: "2026-09-03",
      tt_bao_cao: "in_progress", ngay_bao_cao: null,
      tt_vmp: "in_progress", dl_vmp: "2026-09-30",
    },
  },
  {
    id: "HT-12/2026.01-PQ", code: "HT-12", obj: "HT-12", name: "Khí nén",
    type: "PQ", vtype: "PQ", dept: "cd", owner: "—", support: "Tào Tiến Hoàn",
    freq: 6, st: "done", target: "2026-03-31", daysLeft: null, state: "active",
    _raw: {
      khu_vuc: "E2", line: null, tan_suat: 6, bo_phan: "Cơ điện",
      tt_de_cuong: "completed", tt_tham_dinh: "completed",
      tt_bao_cao: "completed", ngay_bao_cao: "2026-03-15",
      tt_vmp: "completed", dl_vmp: "2026-03-31",
    },
  },
];

test("buildSummaryRows đọc đủ cột cơ bản và nhãn trạng thái tiếng Việt", () => {
  const [a, b] = buildSummaryRows(acts);
  assert.equal(a.validationCode, "PCTB201/2026.01-PQ");
  assert.equal(a.objectCode, "PCTB201");
  assert.equal(a.objectName, "Máy dập viên");
  assert.equal(a.department, "Xưởng sản xuất");
  assert.equal(a.area, "C1");
  assert.equal(a.line, "BFS");
  assert.equal(a.frequency, 12);
  assert.equal(a.owner, "Lê Xuân Đức");
  assert.equal(a.protocol.label, "Hoàn thành");
  assert.equal(a.validation.date, "2026-09-03");
  assert.equal(a.report.label, "Đang làm");
  assert.equal(a.deadlineVmp, "2026-09-30");
  assert.equal(a.statusLabel, "Đang thực hiện");
  assert.equal(b.owner, "", "dấu — của server nghĩa là chưa có QA, không hiện như tên người");
  assert.equal(b.support, "Tào Tiến Hoàn");
  assert.equal(a.act, acts[0], "giữ nguyên hạng mục gốc để mở đúng form sửa");
});

test("filterSummaryRows tìm không phân biệt dấu trên mã, tên, QA, bộ phận", () => {
  const rows = buildSummaryRows(acts);
  assert.deepEqual(filterSummaryRows(rows, "").map((r) => r.validationCode), rows.map((r) => r.validationCode));
  assert.deepEqual(filterSummaryRows(rows, "khi nen").map((r) => r.objectCode), ["HT-12"]);
  assert.deepEqual(filterSummaryRows(rows, "duc").map((r) => r.objectCode), ["PCTB201"]);
  assert.deepEqual(filterSummaryRows(rows, "co dien").map((r) => r.objectCode), ["HT-12"]);
  assert.deepEqual(filterSummaryRows(rows, "pctb201/2026").map((r) => r.objectCode), ["PCTB201"]);
});

test("sortSummaryRows sắp theo cột, không đổi mảng gốc, ô trống luôn nằm cuối", () => {
  const rows = buildSummaryRows(acts);
  const truoc = rows.map((r) => r.validationCode);
  assert.deepEqual(sortSummaryRows(rows, "deadlineVmp", "asc").map((r) => r.objectCode), ["HT-12", "PCTB201"]);
  assert.deepEqual(sortSummaryRows(rows, "deadlineVmp", "desc").map((r) => r.objectCode), ["PCTB201", "HT-12"]);
  assert.deepEqual(sortSummaryRows(rows, "frequency", "asc").map((r) => r.frequency), [6, 12]);
  assert.deepEqual(rows.map((r) => r.validationCode), truoc, "không mutate mảng đầu vào");
  for (const dir of ["asc", "desc"]) {
    assert.deepEqual(sortSummaryRows(rows, "owner", dir).map((r) => r.owner).at(-1), "", `ô trống ở cuối khi ${dir}`);
  }
});

test("summaryCounts đếm theo trạng thái tổng để hiện dải chip", () => {
  assert.deepEqual(summaryCounts(buildSummaryRows(acts)), { total: 2, done: 1, over: 0, prog: 1, todo: 0, plan: 0, thieuNgayVmp: 1 },
    "HT-12 mẫu: Trạng thái VMP Hoàn thành mà chưa có ngày → 1 mục thiếu ngày");
});

test("summaryExportAoa xuất đúng thứ tự cột đang thấy, ngày dạng dd/mm/yyyy", () => {
  const aoa = summaryExportAoa(buildSummaryRows(acts).slice(0, 1));
  assert.equal(aoa[0][0], "Mã thẩm định");
  assert.equal(aoa.length, 2);
  assert.equal(aoa[1][0], "PCTB201/2026.01-PQ");
  assert.ok(aoa[1].includes("03/09/2026"));
  assert.ok(aoa[1].includes("30/09/2026"));
  assert.equal(aoa[0].length, aoa[1].length);
});

test("chuanHoaCotAn bỏ khoá lạ và không bao giờ ẩn Mã thẩm định", async () => {
  const { chuanHoaCotAn, SUMMARY_COLUMNS } = await import("../../src/features/catalogWorkspace/summaryGridModel.ts");
  assert.equal(SUMMARY_COLUMNS[0].key, "validationCode");
  assert.deepEqual([...chuanHoaCotAn(["owner", "validationCode", "khong-co", 7, "area"])].sort(), ["area", "owner"]);
  assert.deepEqual([...chuanHoaCotAn(null)], []);
  assert.deepEqual([...chuanHoaCotAn("owner")], [], "dữ liệu nhớ hỏng thì coi như hiện tất cả");
});

test("summaryExportAoa chỉ xuất cột đang hiện", () => {
  const hang = buildSummaryRows(acts).slice(0, 1);
  const an = new Set(["owner", "support", "protocol", "objectName"]);
  const aoa = summaryExportAoa(hang, an);
  for (const ten of ["QA phụ trách", "QA hỗ trợ", "Đề cương", "Ngày đề cương", "Tên đối tượng", "Mã đối tượng"]) {
    assert.ok(!aoa[0].includes(ten), `không xuất cột ẩn: ${ten}`);
  }
  assert.ok(aoa[0].includes("Mã thẩm định") && aoa[0].includes("Hạn VMP"));
  assert.equal(aoa[0].length, aoa[1].length);
  assert.equal(summaryExportAoa(hang).at(0).length, 18, "không ẩn gì thì đủ 18 cột như cũ");
});

test("thieuNgayVmp: Trạng thái VMP Hoàn thành mà chưa có ngày thực tế thì cảnh báo", () => {
  const [a, b, c] = buildSummaryRows([
    { ...acts[0], _raw: { ...acts[0]._raw, tt_vmp: "completed", ngay_vmp: null } },
    { ...acts[1], _raw: { ...acts[1]._raw, tt_vmp: "completed", ngay_vmp: "2026-03-31" } },
    { ...acts[0], id: "X/2026.01-OQ", _raw: { ...acts[0]._raw, tt_vmp: "in_progress", ngay_vmp: null } },
  ]);
  assert.equal(a.thieuNgayVmp, true);
  assert.equal(b.thieuNgayVmp, false, "có ngày thì không cảnh báo");
  assert.equal(c.thieuNgayVmp, false, "chưa Hoàn thành thì chưa cần ngày");
  assert.equal(summaryCounts([a, b, c]).thieuNgayVmp, 1);
});

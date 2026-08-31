import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ngayLichBangkok, soNgayConLai, tinhTrangHan, mocKeTiep,
} from "../../src/lib/hanChot.ts";
import { bangkokCalendarDate, classifyVmpDeadline } from "../../src/lib/vmpDeadlineModel.ts";

/* 2026-08-31T18:30:00Z = 01:30 sáng 01/09 giờ Bangkok — đúng khung giờ từng
 * gây lệch một ngày giữa client và múi UTC. */
const NUA_DEM_BANGKOK = new Date("2026-08-31T18:30:00Z");
const TRUA = new Date("2026-08-31T05:00:00Z"); // 12:00 trưa 31/08 Bangkok

test("ngayLichBangkok trùng bangkokCalendarDate — hai module không được lệch nhau", () => {
  for (const luc of [NUA_DEM_BANGKOK, TRUA, new Date("2026-01-01T00:00:00Z")]) {
    assert.equal(ngayLichBangkok(luc), bangkokCalendarDate(luc));
  }
});

test("khung 00:00-07:00 Bangkok: hôm nay là 01/09 chứ không phải 31/08", () => {
  assert.equal(ngayLichBangkok(NUA_DEM_BANGKOK), "2026-09-01");
  assert.equal(soNgayConLai("2026-09-01", NUA_DEM_BANGKOK), 0);
  assert.equal(soNgayConLai("2026-08-31", NUA_DEM_BANGKOK), -1);
});

test("tinhTrangHan phủ đủ 5 nhánh", () => {
  assert.equal(tinhTrangHan("2026-08-20", TRUA, 7).kind, "overdue");
  assert.equal(tinhTrangHan("2026-08-31", TRUA, 7).kind, "today");
  assert.equal(tinhTrangHan("2026-09-05", TRUA, 7).kind, "soon");
  assert.equal(tinhTrangHan("2026-12-01", TRUA, 7).kind, "future");
  assert.equal(tinhTrangHan(null, TRUA, 7).kind, "missing");
  assert.equal(tinhTrangHan("31/08/2026", TRUA, 7).kind, "missing"); // sai định dạng = thiếu
});

test("tinhTrangHan khớp classifyVmpDeadline trên cùng dữ liệu — một luật, hai lối vào", () => {
  const act = { id: "x", code: "PQ-1", obj: "O", type: "PQ", st: "todo", dlVmp: "2026-09-03" };
  const cu = classifyVmpDeadline(act, TRUA, 7);
  const moi = tinhTrangHan("2026-09-03", TRUA, 7);
  assert.equal(cu.kind, moi.kind);
  assert.equal(cu.daysRemaining, moi.daysRemaining);
});

test("mocKeTiep: mốc chưa xong sớm nhất thắng; mốc xong bị loại", () => {
  const kq = mocKeTiep([
    { id: "protocol", hanISO: "2026-08-01", xong: true },
    { id: "validation", hanISO: "2026-09-10", xong: false },
    { id: "report", hanISO: "2026-09-05", xong: false },
    { id: "vmp", hanISO: "2026-09-20", xong: false },
  ]);
  assert.equal(kq?.id, "report");
});

test("mocKeTiep: thiếu hạn không che được hạn thật; tất cả xong → null", () => {
  const thieuHan = mocKeTiep([
    { id: "validation", hanISO: null, xong: false },
    { id: "vmp", hanISO: "2026-09-20", xong: false },
  ]);
  assert.equal(thieuHan?.id, "vmp");
  const xongHet = mocKeTiep([
    { id: "vmp", hanISO: "2026-09-20", xong: true },
  ]);
  assert.equal(xongHet, null);
  const chuaXongKhongHan = mocKeTiep([{ id: "vmp", hanISO: null, xong: false }]);
  assert.equal(chuaXongKhongHan?.id, "vmp");
});

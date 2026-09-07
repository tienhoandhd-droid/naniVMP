import assert from "node:assert/strict";
import { test } from "node:test";
import { soSanhDoiChieu, ketLuanDoiChieu } from "../../src/features/health/doiChieuModel.ts";

test("khớp hết → 0 lệch, kết luận ok", () => {
  const kq = soSanhDoiChieu([
    { nhan: "Hạng mục hoàn thành", client: 5, server: 5 },
    { nhan: "Quá hạn", client: 14, server: 14 },
  ]);
  assert.equal(kq.soLech, 0);
  assert.equal(kq.thieuServer, false);
  assert.equal(ketLuanDoiChieu(kq).tone, "ok");
});

test("một dòng lệch → đánh dấu đúng dòng, chênh có dấu", () => {
  const kq = soSanhDoiChieu([
    { nhan: "Hoàn thành", client: 5, server: 5 },
    { nhan: "Quá hạn", client: 14, server: 15 },
  ]);
  assert.equal(kq.soLech, 1);
  assert.equal(kq.rows[0].lech, false);
  assert.equal(kq.rows[1].lech, true);
  assert.equal(kq.rows[1].chenh, 1);
  assert.equal(ketLuanDoiChieu(kq).tone, "over");
});

test("server null → không tính là lệch, kết luận warn thiếu-server", () => {
  const kq = soSanhDoiChieu([
    { nhan: "Hoàn thành", client: 5, server: null },
    { nhan: "Quá hạn", client: 14, server: 14 },
  ]);
  assert.equal(kq.soLech, 0);
  assert.equal(kq.thieuServer, true);
  assert.equal(kq.rows[0].chenh, null);
  assert.equal(ketLuanDoiChieu(kq).tone, "warn");
});

test('active KPI plus excluded business states reconcile without changing either original number',()=>{
  const q=soSanhDoiChieu([{nhan:'Tổng',client:448,ngoaiKpi:13,server:461},{nhan:'Xong VMP',client:95,ngoaiKpi:2,server:97}]);
  assert.equal(q.soLech,0); assert.equal(q.rows[0].client,448); assert.equal(q.rows[0].chenh,0);
  assert.doesNotMatch(ketLuanDoiChieu(q).chinh,/nói dối|MÁY CHỦ là số báo cáo/);
});
test('different or filtered populations do not assert a numeric integrity error',()=>{
  const q=soSanhDoiChieu([{nhan:'Tổng',client:20,ngoaiKpi:0,server:461}],false);
  assert.equal(q.soLech,0); assert.equal(q.rows[0].chenh,null); assert.equal(ketLuanDoiChieu(q).tone,'warn');
});
test('real residual difference remains visible after non-active rows are accounted for',()=>{
  const q=soSanhDoiChieu([{nhan:'Xong',client:95,ngoaiKpi:2,server:98}]);
  assert.equal(q.soLech,1);assert.equal(q.rows[0].chenh,1);
  assert.doesNotMatch(ketLuanDoiChieu(q).chinh,/MÁY CHỦ là số báo cáo/);
});

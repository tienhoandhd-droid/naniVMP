/* =====================================================================
 *  today-model.test.mjs — "hôm nay tôi phải làm gì"
 *  ---------------------------------------------------------------------
 *  Fixture dựng bằng tay, mốc thời gian cố định. Trọng tâm là ba chỗ dễ
 *  sai mà lại im lặng: nhận diện người bằng tên, coi "chưa lên lịch" là
 *  quá hạn, và so ngày lệch múi giờ.
 * ===================================================================== */
import test from "node:test";
import assert from "node:assert/strict";

import { buildTodayModel } from "../../src/features/today/todayModel.ts";

const HOM_NAY = new Date("2026-08-14T00:00:00+07:00");
const ID_A = "11111111-1111-1111-1111-111111111111";
const ID_B = "22222222-2222-2222-2222-222222222222";

const BA_DONG = [
  {
    id: "V-OVER", validationCode: "V-OVER", code: "O-1", objectCode: "O-1", type: "PQ",
    st: "prog", state: "active", dlValidation: "2026-08-10", actProtocol: "2026-07-01",
    owner: "Trùng tên", ownerPersonId: ID_A, supportPersonId: null,
  },
  {
    id: "V-SOON", validationCode: "V-SOON", code: "O-2", objectCode: "O-2", type: "IQ",
    st: "todo", state: "active", dlProtocol: "2026-08-18",
    owner: "Trùng tên", ownerPersonId: ID_B, supportPersonId: ID_A,
  },
  {
    id: "V-MISS", validationCode: "V-MISS", code: "O-3", objectCode: "O-3", type: "OQ",
    st: "done", state: "active", actVmp: null,
    owner: "Tên hiển thị không đủ", ownerPersonId: null, supportPersonId: null,
  },
];

test("chia đúng ba nhóm và chọn việc gấp nhất làm hành động kế tiếp", () => {
  const m = buildTodayModel(BA_DONG, HOM_NAY);
  assert.deepEqual(m.overdue.map((r) => r.validationCode), ["V-OVER"]);
  assert.deepEqual(m.dueSoon.map((r) => r.validationCode), ["V-SOON"]);
  assert.deepEqual(m.incomplete.map((r) => r.validationCode), ["V-MISS"]);
  assert.equal(m.nextAction?.validationCode, "V-OVER");
});

test("mốc đang chờ đi theo đúng thứ tự vòng đời", () => {
  const m = buildTodayModel(BA_DONG, HOM_NAY);
  // V-OVER đã xong đề cương nên mốc đang chờ là Thẩm định.
  assert.equal(m.overdue[0].milestoneLabel, "Thẩm định");
  // V-SOON chưa làm gì nên mốc đang chờ là Đề cương.
  assert.equal(m.dueSoon[0].milestoneLabel, "Đề cương");
});

test("số ngày còn lại đếm đúng, âm là đã trễ", () => {
  const m = buildTodayModel(BA_DONG, HOM_NAY);
  assert.equal(m.overdue[0].daysRemaining, -4);   // 10/08 so với 14/08
  assert.equal(m.dueSoon[0].daysRemaining, 4);    // 18/08 so với 14/08
});

/* ---- Ba cái bẫy ------------------------------------------------------ */

test("KHÔNG có mốc hạn thì không phải quá hạn — chỉ là chưa lên lịch", () => {
  const m = buildTodayModel([{
    id: "V-NOPLAN", validationCode: "V-NOPLAN", st: "todo", state: "active",
    ownerPersonId: ID_A,
  }], HOM_NAY);
  assert.deepEqual(m.overdue, []);
  assert.deepEqual(m.dueSoon, []);
  assert.deepEqual(m.incomplete, []);
  assert.equal(m.nextAction, null);
});

test("tên hiển thị KHÔNG thay được person_id — thiếu id là hồ sơ chưa đủ", () => {
  const m = buildTodayModel([{
    id: "V-TEN", validationCode: "V-TEN", st: "prog", state: "active",
    dlValidation: "2026-08-10",
    owner: "Nguyễn Văn A", owner_name: "Nguyễn Văn A", ownerPersonId: null,
  }], HOM_NAY);
  assert.deepEqual(m.overdue, [], "có tên mà không có id thì không tính là việc của ai cả");
  assert.equal(m.incomplete[0]?.milestoneLabel, "Chưa phân công QA");
});

test("người HỖ TRỢ không thay được người phụ trách chính", () => {
  const m = buildTodayModel([{
    id: "V-HOTRO", validationCode: "V-HOTRO", st: "prog", state: "active",
    dlValidation: "2026-08-10", ownerPersonId: null, supportPersonId: ID_A,
  }], HOM_NAY);
  assert.equal(m.incomplete[0]?.milestoneLabel, "Chưa phân công QA");
});

test("owner_person_id trong _raw vẫn được chấp nhận", () => {
  const m = buildTodayModel([{
    id: "V-RAW", validationCode: "V-RAW", st: "prog", state: "active",
    dlValidation: "2026-08-10", ownerPersonId: null,
    _raw: { owner_person_id: ID_A },
  }], HOM_NAY);
  assert.equal(m.overdue.length, 1);
});

test("hạng mục không còn hoạt động thì không xuất hiện", () => {
  for (const state of ["cancelled", "not_applicable"]) {
    const m = buildTodayModel([{
      id: "V-X", validationCode: "V-X", st: "prog", state,
      dlValidation: "2026-08-01", ownerPersonId: ID_A,
    }], HOM_NAY);
    assert.equal(m.nextAction, null, `state=${state} vẫn lọt vào danh sách`);
  }
});

test("hoàn thành mà thiếu ngày đích thực tế thì vào nhóm hồ sơ chưa đủ", () => {
  const m = buildTodayModel([{
    id: "V-D", validationCode: "V-D", st: "done", state: "active",
    actVmp: null, ownerPersonId: ID_A,
  }], HOM_NAY);
  assert.equal(m.incomplete[0]?.milestoneLabel, "Thiếu ngày hoàn thành");
});

test("hoàn thành đầy đủ thì biến khỏi danh sách hôm nay", () => {
  const m = buildTodayModel([{
    id: "V-OK", validationCode: "V-OK", st: "done", state: "active",
    actVmp: "2026-08-01", ownerPersonId: ID_A,
  }], HOM_NAY);
  assert.equal(m.nextAction, null);
});

test("đúng hạn hôm nay là 0 ngày, không phải quá hạn", () => {
  const m = buildTodayModel([{
    id: "V-TODAY", validationCode: "V-TODAY", st: "todo", state: "active",
    dlProtocol: "2026-08-14", ownerPersonId: ID_A,
  }], HOM_NAY);
  assert.deepEqual(m.overdue, []);
  assert.equal(m.dueSoon[0]?.daysRemaining, 0);
});

test("so ngày ở nửa đêm Bangkok, không lệch theo giờ chạy", () => {
  const hangMuc = [{
    id: "V-TZ", validationCode: "V-TZ", st: "todo", state: "active",
    dlProtocol: "2026-08-14", ownerPersonId: ID_A,
  }];
  // Cùng một ngày Bangkok, hai thời điểm cách nhau gần trọn ngày.
  const sang = buildTodayModel(hangMuc, new Date("2026-08-14T00:30:00+07:00"));
  const khuya = buildTodayModel(hangMuc, new Date("2026-08-14T23:30:00+07:00"));
  assert.equal(sang.dueSoon[0]?.daysRemaining, khuya.dueSoon[0]?.daysRemaining,
    "cùng một ngày mà ra hai kết quả khác nhau");
});

test("ngoài 7 ngày thì chưa cần hiện hôm nay", () => {
  const m = buildTodayModel([{
    id: "V-XA", validationCode: "V-XA", st: "todo", state: "active",
    dlProtocol: "2026-09-30", ownerPersonId: ID_A,
  }], HOM_NAY);
  assert.equal(m.nextAction, null);
});

test("trong cùng nhóm, việc trễ nhiều hơn đứng trước", () => {
  const m = buildTodayModel([
    { id: "A", validationCode: "A", st: "prog", state: "active", dlValidation: "2026-08-12", ownerPersonId: ID_A },
    { id: "B", validationCode: "B", st: "prog", state: "active", dlValidation: "2026-08-01", ownerPersonId: ID_A },
  ], HOM_NAY);
  assert.deepEqual(m.overdue.map((r) => r.validationCode), ["B", "A"]);
});

test("danh sách rỗng không làm vỡ", () => {
  const m = buildTodayModel([], HOM_NAY);
  assert.deepEqual(m, { overdue: [], dueSoon: [], incomplete: [], nextAction: null });
});

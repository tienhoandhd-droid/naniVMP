/* =====================================================================
 *  progress-workspace-model.test.mjs — model màn Tiến độ (Đợt B Task 12)
 *  ---------------------------------------------------------------------
 *  MỘT model cho cả KPI, dải ưu tiên, facet giai đoạn, bảng desktop và
 *  thẻ mobile. Fixture và các con số kỳ vọng lấy NGUYÊN VĂN từ kế hoạch
 *  Đợt B Task 12 — đổi luật là đổi hợp đồng, phải đổi cả test.
 *
 *  Bốn luật lõi:
 *   · needsAction đếm dòng active có ÍT NHẤT một vấn đề hồ sơ.
 *   · "Có người phụ trách" chỉ tính bằng ownerPersonId — tên hiển thị,
 *     tên trùng, hay supportPersonId KHÔNG bao giờ được tính thay.
 *   · overdue so mốc chưa xong gần nhất với HÔM NAY giờ Bangkok.
 *   · desktop và mobile là CÙNG một mảng dòng, cùng thứ tự.
 * ===================================================================== */
import test from "node:test";
import assert from "node:assert/strict";

import { buildProgressWorkspaceModel } from "../../src/features/progress/progressWorkspaceModel.ts";

const FIXTURE = [
  { id: "V-BLOCKING-DATA", validationCode: "V-BLOCKING-DATA", code: "O-1", objectCode: "O-1", type: "PQ",
    st: "prog", state: "active", owner: "Tên hiển thị vẫn có", ownerPersonId: null,
    supportPersonId: "99999999-9999-9999-9999-999999999999", target: "2026-08-10",
    dlValidation: "2026-08-10", _raw: {} },
  { id: "V-MISMATCH", validationCode: "V-MISMATCH", code: "O-2", objectCode: "O-2", type: "IQ",
    st: "prog", state: "active", owner: "Trùng tên",
    ownerPersonId: "11111111-1111-1111-1111-111111111111", supportPersonId: null, target: "2026-09-10",
    dlProtocol: "2026-09-10", mismatch: "val_done_doc_pending", _raw: {} },
  { id: "V-NO-DEADLINE", validationCode: "V-NO-DEADLINE", code: "O-3", objectCode: "O-3", type: "OQ",
    st: "todo", state: "active", owner: "",
    ownerPersonId: "22222222-2222-2222-2222-222222222222", supportPersonId: null, target: null, _raw: {} },
  { id: "V-CLEAR", validationCode: "V-CLEAR", code: "O-4", objectCode: "O-4", type: "PV",
    st: "todo", state: "active", owner: "Trùng tên",
    ownerPersonId: "33333333-3333-3333-3333-333333333333", supportPersonId: null, target: "2026-10-10",
    dlProtocol: "2026-10-10", _raw: {} },
];

const LOC_MAC_DINH = {
  now: new Date("2026-08-14T00:00:00+07:00"),
  query: "",
  status: "all",
  stage: "all",
  priority: "all",
};

test("bốn KPI đúng nguyên văn hợp đồng của kế hoạch", () => {
  const model = buildProgressWorkspaceModel(FIXTURE, LOC_MAC_DINH);
  assert.deepEqual(model.kpis, {
    inProgress: 2,
    needsAction: 3,
    overdue: 1,
    completenessPercent: 75,
  });
});

test("dòng chặn dữ liệu đứng đầu dải ưu tiên", () => {
  const model = buildProgressWorkspaceModel(FIXTURE, LOC_MAC_DINH);
  assert.equal(model.priorityRows[0].validationCode, "V-BLOCKING-DATA");
});

test("desktop và mobile là cùng một mảng dòng, cùng thứ tự", () => {
  const model = buildProgressWorkspaceModel(FIXTURE, LOC_MAC_DINH);
  assert.deepEqual(
    model.desktopRows.map((row) => row.validationCode),
    model.mobileRows.map((row) => row.validationCode),
  );
  assert.ok(model.desktopRows.length > 0);
});

test("facet đếm SAU các bộ lọc khác nhưng TRƯỚC bộ lọc giai đoạn", () => {
  const model = buildProgressWorkspaceModel(FIXTURE, LOC_MAC_DINH);
  assert.equal(model.facets.all, model.rowsBeforeStageFilter.length);
});

test("tên hiển thị và supportPersonId không bao giờ thay được ownerPersonId", () => {
  const model = buildProgressWorkspaceModel(FIXTURE, LOC_MAC_DINH);
  const dong = model.desktopRows.find((r) => r.validationCode === "V-BLOCKING-DATA");
  assert.ok(dong.issues.includes("missing_owner"),
    `phải thiếu người phụ trách, thấy: ${dong.issues.join(",")}`);
});

test("thiếu deadline và lệch pha hồ sơ là hai vấn đề riêng", () => {
  const model = buildProgressWorkspaceModel(FIXTURE, LOC_MAC_DINH);
  const thieuHan = model.desktopRows.find((r) => r.validationCode === "V-NO-DEADLINE");
  const lechPha = model.desktopRows.find((r) => r.validationCode === "V-MISMATCH");
  assert.ok(thieuHan.issues.includes("missing_deadline"));
  assert.ok(lechPha.issues.includes("stage_mismatch"));
});

test("dòng sạch không vấn đề và không vào dải ưu tiên", () => {
  const model = buildProgressWorkspaceModel(FIXTURE, LOC_MAC_DINH);
  const sach = model.desktopRows.find((r) => r.validationCode === "V-CLEAR");
  assert.equal(sach.issues.length, 0);
  assert.ok(!model.priorityRows.some((r) => r.validationCode === "V-CLEAR"));
});

test("đánh dấu hoàn thành mà thiếu ngày thực tế thì tính vào cả issue lẫn độ hoàn thiện", () => {
  const model = buildProgressWorkspaceModel([
    { id: "V-DONE-NO-DATE", validationCode: "V-DONE-NO-DATE", code: "O-9", objectCode: "O-9",
      type: "PQ", st: "done", state: "active", owner: "X",
      ownerPersonId: "44444444-4444-4444-4444-444444444444", target: "2026-07-01", _raw: {} },
  ], LOC_MAC_DINH);
  const dong = model.desktopRows[0];
  assert.ok(dong.issues.includes("done_without_actual_vmp"));
  // 3 phép kiểm (owner + deadline + ngày thực tế), đạt 2 → 67%.
  assert.equal(model.kpis.completenessPercent, 67);
});

test("bộ lọc trạng thái và tìm kiếm cắt trước, facet phản ánh phần còn lại", () => {
  const model = buildProgressWorkspaceModel(FIXTURE, { ...LOC_MAC_DINH, status: "todo" });
  assert.equal(model.rowsBeforeStageFilter.length, 2);
  assert.equal(model.facets.all, 2);

  const theoMa = buildProgressWorkspaceModel(FIXTURE, { ...LOC_MAC_DINH, query: "o-2" });
  assert.deepEqual(theoMa.desktopRows.map((r) => r.validationCode), ["V-MISMATCH"]);
});

test("bộ lọc ưu tiên chỉ giữ dòng cần xử lý", () => {
  const model = buildProgressWorkspaceModel(FIXTURE, { ...LOC_MAC_DINH, priority: "can_xu_ly" });
  assert.deepEqual(
    [...model.desktopRows.map((r) => r.validationCode)].sort(),
    ["V-BLOCKING-DATA", "V-MISMATCH", "V-NO-DEADLINE"],
  );
});

test("hạng mục đóng băng (state khác active) không vào KPI", () => {
  const model = buildProgressWorkspaceModel([
    ...FIXTURE,
    { id: "V-FROZEN", validationCode: "V-FROZEN", code: "O-5", objectCode: "O-5", type: "PQ",
      st: "prog", state: "khong_ap_dung", owner: "", ownerPersonId: null, target: null, _raw: {} },
  ], LOC_MAC_DINH);
  assert.equal(model.kpis.inProgress, 2);
  assert.equal(model.kpis.needsAction, 3);
});

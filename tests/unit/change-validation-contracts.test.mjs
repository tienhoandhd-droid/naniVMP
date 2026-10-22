import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeChangeList,
  decodeChangeWrite,
  filterChanges,
  isOverdue,
} from "../../src/features/changeValidation/contracts.ts";

const ban = (over = {}) => ({
  id: "6862935f-4d90-4eed-bc6f-f8b3bdb9e615",
  source_tab: "2026 (2)",
  change_code: "CC-XSX-2605-001",
  source_row: 3,
  opened_text: "15/05/2026",
  department: "XSX",
  change_class: "Vĩnh viễn",
  change_type: "Trang thiết bị - Nhà Xưởng",
  change_content: "Bổ sung tank 100L pha chế viên đặt",
  sheet_status: "Đang mở",
  owner_text: "Quế Anh",
  folder_link: null,
  needs_validation: true,
  validation_content: "Thẩm định tank 100 viên đặt",
  deadline_raw: "30/10/2026",
  deadline_sheet: "2026-10-30",
  deadline_override: null,
  deadline: "2026-10-30",
  removed_from_sheet_at: null,
  handling_status: "cho_xu_ly",
  note: null,
  version: 1,
  updated_at: "2026-10-22T01:43:11.881247+00:00",
  objects: [],
  plan_items: [],
  ...over,
});

const ketQua = (records) => ({
  ok: true,
  can_edit: true,
  records,
  sync: {
    last_ok_at: "2026-10-22T01:43:11+00:00", last_status: "xong", last_trigger: "lich",
    last_requested_at: null, last_finished_at: null, last_error: null, last_summary: null,
  },
});

test("đọc danh sách phiếu từ rpc_change_list", () => {
  const kq = decodeChangeList(ketQua([ban({
    objects: [{ code: "CCTB01", name: "Cân", department: "XSX" }],
    plan_items: [{
      id: "CCTB01/2026.01-OQ", validation_code: "CCTB01/2026.01-OQ", object_code: "CCTB01",
      validation_type: "OQ", year: 2026, computed_status: "on_track", deadline_validation: null, linked: true,
    }],
  })]));
  assert.equal(kq.canEdit, true);
  assert.equal(kq.canCreatePlan, false, "không gửi can_create_plan thì không cho tạo đợt");
  assert.equal(kq.records[0].changeCode, "CC-XSX-2605-001");
  assert.equal(kq.records[0].objects[0].code, "CCTB01");
  assert.equal(kq.records[0].planItems[0].linked, true);
  assert.equal(kq.sync.lastStatus, "xong");
});

test("máy chủ từ chối thì báo đúng lời máy chủ", () => {
  assert.throws(() => decodeChangeList({ ok: false, error_code: "ACCOUNT_DISABLED", error: "Tài khoản không hoạt động" }),
    /Tài khoản không hoạt động/);
});

test("dữ liệu lạ bị chặn: trạng thái sai, thiếu phiên bản, hạn không phải ngày", () => {
  assert.throws(() => decodeChangeList(ketQua([ban({ handling_status: "xong_roi" })])));
  assert.throws(() => decodeChangeList(ketQua([ban({ version: 0 })])));
  assert.throws(() => decodeChangeList(ketQua([ban({ deadline: "30/10/2026" })])));
  assert.throws(() => decodeChangeList(ketQua([ban({ objects: null })])));
});

test("kết quả lưu: thành công có phiên bản; lỗi giữ mã và danh sách mã sai", () => {
  assert.deepEqual(decodeChangeWrite({ ok: true, version: 2 }), { ok: true, version: 2, validationCode: undefined });
  assert.deepEqual(decodeChangeWrite({ ok: true, version: 3, validation_code: "CCTB01/2027.01-OQ" }),
    { ok: true, version: 3, validationCode: "CCTB01/2027.01-OQ" });
  assert.deepEqual(decodeChangeWrite({ ok: false, error_code: "OBJECT_NOT_FOUND", error: "Chưa có: X", codes: ["X"] }),
    { ok: false, errorCode: "OBJECT_NOT_FOUND", error: "Chưa có: X", codes: ["X"] });
  assert.throws(() => decodeChangeWrite({ ok: true }));
});

test("quá hạn: chỉ phiếu còn mở, có hạn trước hôm nay", () => {
  const today = "2026-10-31";
  assert.equal(isOverdue({ deadline: "2026-10-30", handlingStatus: "cho_xu_ly", removedFromSheetAt: null }, today), true);
  assert.equal(isOverdue({ deadline: "2026-10-31", handlingStatus: "cho_xu_ly", removedFromSheetAt: null }, today), false);
  assert.equal(isOverdue({ deadline: "2026-10-30", handlingStatus: "da_xong", removedFromSheetAt: null }, today), false);
  assert.equal(isOverdue({ deadline: "2026-10-30", handlingStatus: "cho_xu_ly", removedFromSheetAt: "2026-10-22T00:00:00Z" }, today), false);
  assert.equal(isOverdue({ deadline: null, handlingStatus: "cho_xu_ly", removedFromSheetAt: null }, today), false);
});

test("bộ lọc: cần xử lý / chưa gắn / quá hạn / tìm theo mã thiết bị", () => {
  const rows = decodeChangeList(ketQua([
    ban({ id: "11111111-1111-4111-8111-111111111111", change_code: "CC-A", deadline: "2026-10-01" }),
    ban({ id: "22222222-2222-4222-8222-222222222222", change_code: "CC-B", handling_status: "da_xong",
      objects: [{ code: "HT-12", name: null, department: null }] }),
    ban({ id: "33333333-3333-4333-8333-333333333333", change_code: "CC-C",
      removed_from_sheet_at: "2026-10-22T00:00:00Z" }),
  ])).records;
  const today = "2026-10-22";
  assert.deepEqual(filterChanges(rows, "open", "", today).map((r) => r.changeCode), ["CC-A"]);
  assert.deepEqual(filterChanges(rows, "unlinked", "", today).map((r) => r.changeCode), ["CC-A"]);
  assert.deepEqual(filterChanges(rows, "overdue", "", today).map((r) => r.changeCode), ["CC-A"]);
  assert.deepEqual(filterChanges(rows, "all", "ht-12", today).map((r) => r.changeCode), ["CC-B"]);
  assert.equal(filterChanges(rows, "all", "", today).length, 3);
});

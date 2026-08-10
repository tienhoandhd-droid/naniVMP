import test from "node:test";
import assert from "node:assert/strict";

async function loadContracts() {
  try {
    return await import("../../src/features/itemPermissions/types.ts");
  } catch (error) {
    assert.fail(`Chưa có hợp đồng phân quyền có thể nạp: ${error.message}`);
  }
}

test("phân loại tạo đúng quyền sửa ở từng nhóm timeline", async () => {
  const {
    ACCESS_CLASSES,
    QA_TIMELINE_FIELDS,
    EQUIPMENT_TIMELINE_FIELDS,
  } = await loadContracts();

  assert.deepEqual(ACCESS_CLASSES.map((item) => item.id), [
    "view_only",
    "qa_progress_editor",
    "qa_manager",
    "equipment_scheduler",
    "equipment_manager",
  ]);
  assert.equal(QA_TIMELINE_FIELDS.length, 8);
  assert.deepEqual(EQUIPMENT_TIMELINE_FIELDS, ["scheduled_at"]);
  assert.deepEqual(
    QA_TIMELINE_FIELDS.filter((field) => EQUIPMENT_TIMELINE_FIELDS.includes(field)),
    [],
  );
});

test("khớp tên giữ nguyên dấu và chỉ chuẩn hóa khoảng trắng, hoa thường", async () => {
  const { normalizePersonName } = await loadContracts();

  assert.equal(normalizePersonName("  Đặng   Thị Hồng Ngọc "), "đặng thị hồng ngọc");
  assert.notEqual(
    normalizePersonName("Đặng Thị Hồng Ngọc"),
    normalizePersonName("Dang Thi Hong Ngoc"),
  );
});

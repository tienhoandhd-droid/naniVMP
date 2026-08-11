import test from "node:test";
import assert from "node:assert/strict";

async function loadAccessState() {
  const module = await import("../../src/components/dashboard/progressModalAccess.ts");
  return module.progressModalContentState;
}

test("modal chỉ hiện nội dung hạng mục sau khi xác nhận được quyền xem", async () => {
  const contentState = await loadAccessState();

  assert.equal(contentState(null, ""), "checking");
  assert.equal(contentState({ mode: "enforced", canView: false, editableFields: [], reason: "Đã thu hồi" }, ""), "revoked");
  assert.equal(contentState({ mode: "enforced", canView: false, editableFields: [], reason: "" }, "Lỗi tải quyền"), "error");
  assert.equal(contentState({ mode: "enforced", canView: true, editableFields: [], reason: "Chỉ xem" }, ""), "content");
});

test("preview giữ nội dung modal dù wrapper quyền dự kiến trả canView=false", async () => {
  const contentState = await loadAccessState();

  assert.equal(contentState({ mode: "preview", canView: false, editableFields: [], reason: "Dự kiến" }, ""), "content");
});

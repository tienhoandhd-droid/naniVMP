import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

test("modal dedicated progress fail-closed khi quyền xem bị thu hồi", async () => {
  const contentState = await loadAccessState();

  assert.equal(contentState({ mode: "enforced", canView: false, editableFields: [], reason: "Đã thu hồi" }, ""), "revoked");
});

test("modal chỉ dựng field được cấp, không chỉ khoá disabled", async () => {
  const source = await readFile(new URL("../../src/components/dashboard/ProgressEditModal.tsx", import.meta.url), "utf8");

  assert.match(source, /visibleProgressStageFields\(/);
  assert.match(source, /\{canEditForm\(dCol\) && \(/);
  assert.match(source, /\{canEditForm\(tCol\) && \(/);
  assert.match(source, /n === 2 && canEdit\("scheduled_at"\) && \(/);
  assert.doesNotMatch(source, /<input type="date"[^\n]*disabled=\{!canEditForm\(dCol\)\}/);
  assert.doesNotMatch(source, /<input type="datetime-local"[^\n]*disabled=\{!canEdit\("scheduled_at"\)\}/);
});

test("quick-done chỉ điền hai field khi cả hai đều được cấp", async () => {
  const source = await readFile(new URL("../../src/components/dashboard/ProgressEditModal.tsx", import.meta.url), "utf8");

  assert.match(source, /const canMarkDone = canEditForm\(dCol\) && canEditForm\(tCol\);/);
  assert.match(source, /const canQuickDone = !!quickDoneCols && canEditForm\(quickDoneCols\[0\]\) && canEditForm\(quickDoneCols\[1\]\);/);
  assert.match(source, /if \(!quickDone \|\| !quickDoneCols \|\| !canQuickDone\) return;/);
});

test("validation ALCOA không đọc field bị ẩn", async () => {
  const source = await readFile(new URL("../../src/components/dashboard/ProgressEditModal.tsx", import.meta.url), "utf8");

  assert.match(source, /const canValidateDateOrder = canEditForm\(tr\.d\) && canEditForm\(sau\.d\);/);
  assert.match(source, /const canValidateStatusOrder = canEditForm\(tr\.t\) && canEditForm\(sau\.t\);/);
  assert.match(source, /const canValidateStage = canEditForm\(b\.d\) && canEditForm\(b\.t\);/);
  assert.match(source, /\.filter\(\(s\) => canEditForm\(s\.d\) && f\[s\.d\] && f\[s\.d\] > todayISO\(\)\)/);
});

test("resolver progress luôn enforced và không đọc global preview mode", async () => {
  const source = await readFile(new URL("../../src/lib/supabaseData.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function fetchTimelineFieldPermission");
  const body = source.slice(start, source.indexOf("// ============================================================", start));

  assert.ok(start >= 0, "missing dedicated progress permission resolver");
  assert.doesNotMatch(body, /item_permissions_mode/);
  assert.match(body, /mode:\s*"enforced"/);
});

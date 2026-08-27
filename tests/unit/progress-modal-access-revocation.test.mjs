import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const ACT = {
  id: "ITEM-1",
  code: "VMP-001",
  name: "Hạng mục thử nghiệm",
  vtype: "Thiết bị",
  owner: "QA",
  st: "todo",
  _raw: {},
};

let vite;
let ProgressEditModal;

async function loadProgressEditModal() {
  if (!vite) vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  if (!ProgressEditModal) {
    ({ default: ProgressEditModal } = await vite.ssrLoadModule("/src/components/dashboard/ProgressEditModal.tsx"));
  }
  return ProgressEditModal;
}

async function renderModal({ editableFields, permissionMode = "enforced", quickDone = false } = {}) {
  const Modal = await loadProgressEditModal();
  return renderToStaticMarkup(React.createElement(ProgressEditModal, {
    act: ACT,
    editableFields,
    permissionMode,
    quickDone,
    onClose: () => {},
    onSave: () => {},
  }));
}

test.after(async () => { await vite?.close(); });

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

test("QA status-only và Workshop date-only không dựng quick-done trong modal", async () => {
  const qaStatusOnly = await renderModal({ editableFields: ["status_protocol"], quickDone: true });
  const workshopDateOnly = await renderModal({ editableFields: ["actual_validation_date"], quickDone: true });

  assert.doesNotMatch(qaStatusOnly, /✓ Xong hôm nay/);
  assert.doesNotMatch(workshopDateOnly, /✓ Xong hôm nay/);
});

test("caller Catalog giữ preview đầy đủ còn Update truyền enforced allow-list", async () => {
  const preview = await renderModal({ permissionMode: "preview" });
  const catalogSource = await readFile(new URL("../../src/pages/CatalogPage.tsx", import.meta.url), "utf8");
  const updateSource = await readFile(new URL("../../src/pages/UpdatePage.tsx", import.meta.url), "utf8");

  assert.match(preview, /type="date"/);
  assert.match(preview, /type="datetime-local"/);
  assert.match(catalogSource, /<ProgressEditModal[\s\S]*permissionMode="preview"/);
  assert.match(updateSource, /<ProgressEditModal[\s\S]*editableFields=\{rightsState\.rights\.get\(edit\.id\)\?\.editableFields\}[\s\S]*permissionMode="enforced"/);
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

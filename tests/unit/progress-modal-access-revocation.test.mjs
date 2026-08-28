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
  assert.match(updateSource, /<ProgressEditModal[\s\S]*editableFields=\{rightsState\.rights\.get\(progressValidationCode\(edit\)\)\?\.editableFields\}[\s\S]*permissionMode="enforced"/);
});

test("Update gộp visible refresh và chỉ consume deep link sau kết quả quyền ready", async () => {
  const source = await readFile(new URL("../../src/pages/UpdatePage.tsx", import.meta.url), "utf8");

  assert.match(source, /createVisibleRefreshController\(\{[\s\S]*refresh:\s*reloadRights[\s\S]*coalesceMs:\s*1000[\s\S]*\}\)/);
  assert.match(source, /window\.addEventListener\("focus", controller\.request\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange", controller\.request\)/);
  assert.match(source, /rightsGate\.current\.invalidate\(\);[\s\S]*removeEventListener\("focus", controller\.request\)/);
  assert.match(source, /if \(!pendingProgressLink \|\| rightsState\.status !== "ready"\) return;[\s\S]*resolveProgressDeepLink\(rightsState\.rights, pendingProgressLink\)/);
  assert.match(source, /setFix\("all"\);[\s\S]*setStageF\("all"\);[\s\S]*setFst\("all"\);[\s\S]*setPeriod\("all"\);[\s\S]*setHienNgung\(false\);[\s\S]*setTrang\(0\);[\s\S]*onProgressLinkConsumed\?\.\(\)/);
  assert.match(source, /Quyền cập nhật \$\{resolution\.validationCode\} đã thay đổi; hạng mục không được mở\./);
  assert.match(source, /role="alert"[\s\S]*\{focusAlert\}/);
});

test("Update derives a period-excluded focus candidate without caching an Activity", async () => {
  const source = await readFile(new URL("../../src/pages/UpdatePage.tsx", import.meta.url), "utf8");

  assert.match(source, /const \[pinnedValidationCode, setPinnedValidationCode\] = useState<string \| null>\(null\)/);
  assert.match(source, /readableActs\.find\(\(activity\) => progressValidationCode\(activity\) === pinnedValidationCode\)/);
  assert.doesNotMatch(source, /const \[pinnedActivity[^\n]*useState/);
});

test("Update keys progress stage lookups by canonical validationCode", async () => {
  const source = await readFile(new URL("../../src/pages/UpdatePage.tsx", import.meta.url), "utf8");

  assert.match(source, /stageByItem[\s\S]*m\.set\(progressValidationCode\(a\), stageOf\(a\)\)/);
  assert.doesNotMatch(source, /stageByItem\.get\(a\.id\)/);
});

test("silent refresh gates watermark and fail-closed state by current request", async () => {
  const source = await readFile(new URL("../../src/hooks/index.ts", import.meta.url), "utf8");
  const readerStart = source.indexOf("const readWatermark");
  const readerEnd = source.indexOf("const sigOf", readerStart);
  const reader = source.slice(readerStart, readerEnd);
  const refreshStart = source.indexOf("const silentRefresh");
  const refreshEnd = source.indexOf("/* Chỉ nạp dữ liệu", refreshStart);
  const refresh = source.slice(refreshStart, refreshEnd);

  assert.ok(readerStart >= 0, "missing pure watermark reader");
  assert.doesNotMatch(reader, /setDataUpdatedAt/);
  assert.match(refresh, /const wmPromise = readWatermark\(\)/);
  assert.match(refresh, /wm = await wmPromise;[\s\S]*if \(requestId !== dataRequestRef\.current\) return;[\s\S]*setDataUpdatedAt\(wm\.updated_at\)/);
  assert.match(refresh, /catch \(cause\) \{[\s\S]*if \(requestId !== dataRequestRef\.current\) return;[\s\S]*permissionModeRef\.current = null;[\s\S]*clearProtectedData\(\);[\s\S]*setConn\([\s\S]*status: "err"[\s\S]*Thử lại/);
});

test("silent refresh success recovers a retryable connection error", async () => {
  if (!vite) vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  const { silentRefreshSuccessConn } = await vite.ssrLoadModule("/src/hooks/index.ts");
  const failed = {
    readUrl: "",
    writeUrl: "",
    status: "err",
    source: "supabase",
    msg: "Thử lại",
  };

  assert.deepEqual(silentRefreshSuccessConn(failed, { objects: 2, activities: 3 }), {
    readUrl: "",
    writeUrl: "",
    status: "ok",
    source: "supabase",
    msg: "Đã làm mới 2 đối tượng · 3 hạng mục từ máy chủ ✓",
  });
  const alreadyOk = { ...failed, status: "ok", msg: "Đã kết nối" };
  assert.equal(silentRefreshSuccessConn(alreadyOk), alreadyOk);

  const source = await readFile(new URL("../../src/hooks/index.ts", import.meta.url), "utf8");
  const refresh = source.slice(source.indexOf("const silentRefresh"), source.indexOf("/* Chỉ nạp dữ liệu", source.indexOf("const silentRefresh")));
  assert.match(refresh, /if \(ws === wmSigRef\.current\) \{[\s\S]*setConn\(\(current\) => silentRefreshSuccessConn\(current\)\);[\s\S]*return;/);
  assert.match(refresh, /if \(sig === dataSigRef\.current\) \{[\s\S]*setConn\(\(current\) => silentRefreshSuccessConn\(current\)\);[\s\S]*return;/);
  assert.match(refresh, /setLastSync\(Date\.now\(\)\);[\s\S]*setConn\(\(current\) => silentRefreshSuccessConn\(current, \{[\s\S]*objects: data\.objects\.length,[\s\S]*activities: data\.activities\.length/);
});

test("shell keeps Today period-independent, canonical, static and deep-link safe", async () => {
  const source = await readFile(new URL("../../src/App.tsx", import.meta.url), "utf8");

  assert.match(source, /import TodayCommandCenter from "\.\/features\/today\/TodayCommandCenter\.tsx"/);
  assert.doesNotMatch(source, /const TodayView = lazy/);
  assert.match(source, /filterTodayScope\(acts, \{[\s\S]*areas: areaSel,[\s\S]*departments: deptSel,[\s\S]*onlyMine,[\s\S]*currentPersonId/);
  assert.match(source, /if \(!onlyMine\) return true;[\s\S]*currentPersonId !== null && isTodayActivityMine\(a, currentPersonId\)/);
  assert.match(source, /useState<ProgressDeepLink \| null>\(null\)/);
  assert.match(source, /const moTienDo = useCallback\(\(link: ProgressDeepLink\)[\s\S]*setMoHangMuc\(link\);[\s\S]*setNhomTheo\("hangmuc"\);[\s\S]*setView\("progress"\)/);
  assert.match(source, /<TodayCommandCenter[\s\S]*acts=\{todayActs\}[\s\S]*scopeLabel=\{nhanPhamViToday\}[\s\S]*hasScopeFilters=\{deptSel\.length > 0 \|\| areaSel\.length > 0\}[\s\S]*onClearScope=\{clearTodayScope\}/);
  assert.match(source, /<UpdateView acts=\{filteredActs\} readableActs=\{todayActs\}[\s\S]*pendingProgressLink=\{moHangMuc\}[\s\S]*onProgressLinkConsumed=\{consumeProgressLink\}/);
});

test("shell normalizes unlinked onlyMine and Today bar does not claim remembered period", async () => {
  const source = await readFile(new URL("../../src/App.tsx", import.meta.url), "utf8");

  assert.match(source, /useState\(currentPersonId \? khoiTao\.onlyMine : false\)/);
  assert.match(source, /onlyMine: currentPersonId \? onlyMine : false/);
  assert.match(source, /setOnlyMine\(currentPersonId \? s\.onlyMine : false\)/);
  assert.match(source, /disabled=\{!personLinked\}[\s\S]*Việc của tôi/);
  assert.match(source, /Tài khoản chưa liên kết nhân sự/);
  assert.match(source, /disabled=\{todayMode\}[\s\S]*aria-label="Từ ngày"/);
  assert.match(source, /disabled=\{todayMode\}[\s\S]*aria-label="Đến ngày"/);
  assert.match(source, /Việc hôm nay tự dùng cửa sổ 7 ngày/);
  assert.match(source, /\{!todayMode && \(customFrom \|\| customTo\) && \(/);
});

test("shell coalesces focus and visibility through its own visible refresh controller", async () => {
  const source = await readFile(new URL("../../src/App.tsx", import.meta.url), "utf8");

  assert.match(source, /createVisibleRefreshController\(\{[\s\S]*refresh: silentRefresh,[\s\S]*coalesceMs: 1000[\s\S]*\}\)/);
  assert.match(source, /window\.addEventListener\("focus", controller\.request\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange", controller\.request\)/);
});

test("preview bỏ qua reload riêng, còn enforced revalidate và fail-closed", async () => {
  const access = await import("../../src/components/dashboard/progressModalAccess.ts");
  const source = await readFile(new URL("../../src/components/dashboard/ProgressEditModal.tsx", import.meta.url), "utf8");

  assert.equal(access.skipsProgressPermissionRevalidation("preview"), true);
  assert.equal(access.skipsProgressPermissionRevalidation("enforced"), false);
  assert.equal(access.skipsProgressPermissionRevalidation(undefined), false);
  assert.match(source, /if \(skipsProgressPermissionRevalidation\(permissionMode\)\) \{/);
  assert.match(source, /setFieldPermission\(null\);[\s\S]*fetchTimelineFieldPermission\(act\.id\)/);
  assert.match(source, /if \(!permission\.canView\) \{[\s\S]*setF\(\{ \.\.\.init \}\)[\s\S]*setReason\(""\)[\s\S]*setErr\(""\)/);
  assert.match(source, /window\.addEventListener\("focus", reloadWhenVisible\)/);
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

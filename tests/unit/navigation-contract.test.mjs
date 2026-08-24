/* =====================================================================
 *  navigation-contract.test.mjs — một nơi duy nhất quyết định mở màn nào
 *  ---------------------------------------------------------------------
 *  Trọng tâm không phải "chạy đúng đường thẳng" mà là ĐƯỜNG VÒNG: cấp
 *  quyền cho tên gọi khác (`risk`, `inventory`) mà chặn tên chuẩn thì
 *  người dùng vẫn phải bị chặn. Đây là chỗ một hệ phân quyền hay bị lách.
 * ===================================================================== */
import test from "node:test";
import assert from "node:assert/strict";

import {
  NAV_GROUP_ORDER, ORDERED_SCREEN_IDS,
  resolveViewIntent, resolveAuthorizedView,
} from "../../src/lib/navigationContract.ts";
import { parseAccessContext } from "../../src/lib/access.ts";

/** Dựng ngữ cảnh quyền chỉ cho phép đúng những màn được liệt kê. */
function chiCho(...man) {
  const screens = {};
  for (const m of man) screens[m] = { can_view: true, scope: "all", actions: ["view"] };
  return parseAccessContext({ ok: true, mode: "enforced", business_role: "qa_staff", screens });
}

/* ---- Thứ tự ---------------------------------------------------------- */

test("nhóm menu theo đúng thứ tự spec §7.1: làm việc trước, giám sát sau", () => {
  assert.deepEqual(NAV_GROUP_ORDER, ["work", "monitor", "analysis", "admin"]);
});

test("thứ tự rơi về bắt đầu bằng today, không phải một màn tổng hợp", () => {
  assert.equal(ORDERED_SCREEN_IDS[0], "today");
  assert.equal(new Set(ORDERED_SCREEN_IDS).size, ORDERED_SCREEN_IDS.length, "không được lặp");
});

/* ---- Chuẩn hoá tên, chưa xét quyền ----------------------------------- */

test("risk là tên gọi khác của alerts", () => {
  assert.deepEqual(resolveViewIntent("risk"), { screenId: "alerts" });
});

test("inventory giữ nguyên ý định gộp theo đối tượng", () => {
  assert.deepEqual(resolveViewIntent("inventory"), {
    screenId: "progress", presentation: "grouped-object",
  });
});

test("tên chuẩn trả về chính nó, tên lạ trả null", () => {
  assert.deepEqual(resolveViewIntent("progress"), { screenId: "progress" });
  assert.equal(resolveViewIntent("missing"), null);
  assert.equal(resolveViewIntent(""), null);
  assert.equal(resolveViewIntent(undefined), null);
  assert.equal(resolveViewIntent(42), null);
});

/* ---- Xét quyền -------------------------------------------------------- */

test("có quyền màn chuẩn thì vào được qua tên gọi khác", () => {
  assert.deepEqual(resolveAuthorizedView("risk", chiCho("alerts")), { screenId: "alerts" });
  assert.deepEqual(resolveAuthorizedView("inventory", chiCho("progress")), {
    screenId: "progress", presentation: "grouped-object",
  });
});

test("KHÔNG lách được quyền bằng tên gọi khác", () => {
  // Cấp đúng chuỗi alias nhưng chặn màn chuẩn → vẫn phải bị chặn.
  const capAlias = chiCho("risk", "today");
  assert.deepEqual(resolveAuthorizedView("risk", capAlias), { screenId: "today" },
    "cấp `risk` mà chặn `alerts` thì không được vào Cảnh báo");

  const capInventory = chiCho("inventory", "today");
  assert.deepEqual(resolveAuthorizedView("inventory", capInventory), { screenId: "today" },
    "cấp `inventory` mà chặn `progress` thì không được vào Tiến độ");
});

test("màn bị cấm thì rơi về màn đầu tiên được phép theo thứ tự", () => {
  assert.deepEqual(resolveAuthorizedView("admin", chiCho("today", "overview")),
    { screenId: "today" });
  assert.deepEqual(resolveAuthorizedView("admin", chiCho("overview")),
    { screenId: "overview" });
});

test("không còn màn nào được phép thì trả null, không nhảy vòng", () => {
  assert.equal(resolveAuthorizedView("overview", chiCho()), null);
  assert.equal(resolveAuthorizedView("missing", chiCho()), null);
});

test("tên lạ nhưng có quyền ở đâu đó thì vẫn đưa về một màn hợp lệ", () => {
  assert.deepEqual(resolveAuthorizedView("khong-ton-tai", chiCho("timeline")),
    { screenId: "timeline" });
});

/* ---- Một nguồn sự thật ------------------------------------------------ */

test("access.ts không còn giữ bản sao thứ hai của thứ tự dự phòng", async () => {
  const nguon = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("../../src/lib/access.ts", import.meta.url), "utf8"));
  assert.doesNotMatch(nguon, /THU_TU_DU_PHONG/,
    "thứ tự dự phòng phải nằm ở navigationContract.ts, không nhân bản");
  assert.doesNotMatch(nguon, /export function firstAllowedScreen/,
    "firstAllowedScreen đã được thay bằng resolveAuthorizedView");
});

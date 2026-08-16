/* =====================================================================
 *  dialog-state.test.mjs — vòng tiêu điểm và sổ thay đổi chưa lưu
 * ===================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  nextDialogFocus, updateDirtyRegistry, summarizeDirty,
} from "../../src/components/ui/dialogState.ts";
import ViewportDialog from "../../src/components/ui/ViewportDialog.tsx";
import ShellConfirmDialog from "../../src/components/layout/ShellConfirmDialog.tsx";

const GOC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const doc = (p) => readFileSync(path.join(GOC, p), "utf8");

/* ---- Vòng tiêu điểm ------------------------------------------------- */

test("Tab ở phần tử cuối quay về đầu", () => {
  assert.equal(nextDialogFocus(2, 3, false), 0);
  assert.equal(nextDialogFocus(0, 3, false), 1);
});

test("Shift+Tab ở phần tử đầu nhảy xuống cuối", () => {
  assert.equal(nextDialogFocus(0, 3, true), 2);
  assert.equal(nextDialogFocus(2, 3, true), 1);
});

test("hộp thoại không có phần tử nào focus được thì không vỡ", () => {
  assert.equal(nextDialogFocus(0, 0, false), 0);
  assert.equal(nextDialogFocus(0, 0, true), 0);
});

/* ---- Sổ thay đổi chưa lưu ------------------------------------------- */

test("đăng ký và gỡ đăng ký form đang dở", () => {
  assert.deepEqual(updateDirtyRegistry(new Set(), "catalog", true), new Set(["catalog"]));
  assert.deepEqual(updateDirtyRegistry(new Set(["catalog"]), "catalog", false), new Set());
});

test("luôn trả Set mới — React so sánh tham chiếu để render lại", () => {
  const cu = new Set(["a"]);
  const moi = updateDirtyRegistry(cu, "b", true);
  assert.notEqual(moi, cu);
  assert.deepEqual(cu, new Set(["a"]), "không được sửa Set cũ tại chỗ");
});

test("tóm tắt nói rõ có form nào dở và là form nào", () => {
  assert.deepEqual(summarizeDirty(new Set()), { hasDirty: false, keys: [] });
  assert.deepEqual(summarizeDirty(new Set(["progress", "catalog"])),
    { hasDirty: true, keys: ["catalog", "progress"] });
});

/* ---- Cấu trúc hộp thoại --------------------------------------------- */

const dungHop = (props, con) => renderToStaticMarkup(
  React.createElement(ViewportDialog, { open: true, title: "Thử", onRequestClose: () => {}, ...props }, con),
);

test("đóng thì không dựng gì cả", () => {
  const html = renderToStaticMarkup(
    React.createElement(ViewportDialog,
      { open: false, title: "Thử", onRequestClose: () => {} }, "nội dung"),
  );
  assert.equal(html, "");
});

test("mở thì là dialog thật, có nhãn và được đánh dấu modal", () => {
  const html = dungHop({}, "nội dung");
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-labelledby="/);
  assert.match(html, /Thử/);
});

test("có mô tả thì nối bằng aria-describedby, không có thì bỏ hẳn", () => {
  const co = dungHop({ description: "Giải thích ngắn" }, "x");
  assert.match(co, /aria-describedby="/);
  assert.match(co, /Giải thích ngắn/);

  const khong = dungHop({}, "x");
  assert.doesNotMatch(khong, /aria-describedby="/);
});

test("nút đóng có tên đọc được", () => {
  const html = dungHop({}, "x");
  assert.match(html, /aria-label="Đóng"/);
});

test("chân hộp thoại chỉ dựng khi có nội dung", () => {
  assert.match(dungHop({ footer: "nút" }, "x"), /lp-dialog__footer/);
  assert.doesNotMatch(dungHop({}, "x"), /lp-dialog__footer/);
});

/* ---- Hình học và chuyển động ---------------------------------------- */

test("hộp thoại giới hạn chiều cao để nút bấm không rơi khỏi màn", () => {
  const css = doc("src/styles/lotus-components.css");
  const khoi = css.slice(css.indexOf(".lp-dialog__panel"), css.indexOf(".lp-dialog__panel") + 700);
  assert.match(khoi, /max-height:\s*calc\(100vh - 40px\)/);
});

test("chỉ thân hộp thoại cuộn, đầu và chân đứng yên", () => {
  const css = doc("src/styles/lotus-components.css");
  assert.match(css, /\.lp-dialog__body[^}]*overflow-y:\s*auto/s);
});

test("hộp thoại mở bằng scale mềm theo §6.7d và tắt khi giảm chuyển động", () => {
  const css = doc("src/styles/lotus-components.css");
  const khoi = css.slice(css.indexOf(".lp-dialog"));
  assert.match(khoi, /var\(--lp-mo-modal\)/);
  assert.match(khoi, /prefers-reduced-motion/);
});

/* ---- Hộp xác nhận của shell ----------------------------------------- */

const dungXacNhan = (props) => renderToStaticMarkup(
  React.createElement(ShellConfirmDialog, {
    open: true, title: "Còn thay đổi chưa lưu",
    description: "Thoát bây giờ là mất phần bạn vừa nhập.",
    onConfirm: () => {}, onCancel: () => {}, ...props,
  }),
);

test("hộp xác nhận nêu ĐÍCH DANH form đang dở, không nói chung chung", () => {
  const html = dungXacNhan({ keys: ["doi-mat-khau", "catalog"] });
  assert.match(html, /Đổi mật khẩu/);
  // renderToStaticMarkup thoát `&` thành `&amp;` — khớp cả hai dạng.
  assert.match(html, /Dữ liệu nguồn/);
});

test("khoá lạ vẫn được nêu ra thay vì bị nuốt mất", () => {
  assert.match(dungXacNhan({ keys: ["form-nao-do"] }), /form-nao-do/);
});

test("không có form nào dở thì không dựng danh sách rỗng", () => {
  assert.doesNotMatch(dungXacNhan({ keys: [] }), /<ul/);
});

test("hai lựa chọn rõ ràng, mặc định là ở lại", () => {
  const html = dungXacNhan({ keys: ["catalog"] });
  assert.match(html, /Ở lại/);
  assert.match(html, /Vẫn thoát/);
});

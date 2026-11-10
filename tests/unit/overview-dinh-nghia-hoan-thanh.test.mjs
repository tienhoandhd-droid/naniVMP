/* Đợt B rà soát 10/11/2026 — B2/B3: Tổng quan và mô hình trạng thái dùng
 * CÙNG định nghĩa đã chốt 07/11:
 *   Hoàn thành VMP = status completed HOẶC có ngày VMP thực tế.
 *   Quá hạn        = chưa hoàn thành VMP VÀ hạn VMP < hôm nay giờ VN. */
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import Overview from "../../src/features/overview/Overview.tsx";
import { deriveActivityFields } from "../../src/lib/n8nAdapter.ts";
import { isVmpComplete } from "../../src/lib/vmpDeadlineModel.ts";
import { vmpToday } from "../../src/constants/vmp.ts";

const pad = (n) => String(n).padStart(2, "0");
const ngay = (offset) => {
  const d = vmpToday();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function hoatDong(id, raw) {
  return { id, validationCode: id, code: id, state: "active", _raw: raw, ...deriveActivityFields(raw) };
}

const access = { canView: () => true };
const metric = (html, id) => Number(html.match(
  new RegExp(`data-overview-metric="${id}"[\\s\\S]*?data-overview-value[^>]*>(\\d+)<`))?.[1]);

test("B3: hạng mục có ngày VMP thực tế mà trạng thái còn 'đang làm' là HOÀN THÀNH ở mọi nơi", () => {
  const raw = { ngay_vmp: "2026-09-28", tt_vmp: "in_progress", dl_vmp: "2026-10-01" };
  const st = deriveActivityFields(raw).st;
  assert.equal(isVmpComplete({ _raw: raw }), true);
  assert.equal(st, "done", `deriveSt ra "${st}", isVmpComplete ra true — hai định nghĩa lệch nhau`);
});

test("B3: quá hạn = chưa hoàn thành và hạn VMP trước hôm nay giờ VN; kế hoạch/chưa làm theo hạn VMP 30 ngày", () => {
  assert.equal(deriveActivityFields({ tt_vmp: "in_progress", dl_vmp: ngay(-1) }).st, "over");
  assert.equal(deriveActivityFields({ tt_vmp: "not_started", dl_vmp: ngay(0) }).st, "todo");
  // Như compute_item_status_v2: chưa bắt đầu, hạn VMP ≤ 30 ngày → chưa làm; xa hơn → kế hoạch.
  assert.equal(deriveActivityFields({ dl_vmp: ngay(30), dl_de_cuong: ngay(60) }).st, "todo");
  assert.equal(deriveActivityFields({ dl_vmp: ngay(31), dl_de_cuong: ngay(1) }).st, "plan");
  assert.equal(deriveActivityFields({ tt_de_cuong: "completed", dl_vmp: ngay(90) }).st, "prog");
});

test("B2: Hoàn thành + Chưa hoàn thành = tổng (mục quá hạn nằm trong Chưa hoàn thành)", () => {
  const acts = [
    hoatDong("XONG", { tt_vmp: "completed", ngay_vmp: ngay(-10), dl_vmp: ngay(-5) }),
    hoatDong("QUA-HAN-1", { tt_vmp: "in_progress", dl_vmp: ngay(-3) }),
    hoatDong("QUA-HAN-2", { tt_vmp: "not_started", dl_vmp: ngay(-1) }),
    hoatDong("DANG-LAM", { tt_de_cuong: "in_progress", dl_vmp: ngay(20) }),
    hoatDong("CHUA-LAM", { dl_vmp: ngay(60) }),
  ];
  const html = renderToStaticMarkup(React.createElement(Overview, { acts, access }));
  const xong = metric(html, "completed");
  const chua = metric(html, "incomplete");
  assert.equal(xong, 1);
  assert.equal(xong + chua, 5, `Hoàn thành ${xong} + Chưa hoàn thành ${chua} phải bằng 5`);
});

test("B3: dòng phụ ô Quá hạn đếm mục có ngày hoàn thành nhưng trạng thái chưa Hoàn thành; 0 thì ẩn", () => {
  const coNgayChuaTrangThai = hoatDong("NGAY-CHUA-TT", { tt_vmp: "in_progress", ngay_vmp: ngay(-2), dl_vmp: ngay(-1) });
  const quaHan = hoatDong("QUA-HAN", { tt_vmp: "in_progress", dl_vmp: ngay(-3) });
  const html = renderToStaticMarkup(React.createElement(Overview, { acts: [coNgayChuaTrangThai, quaHan], access }));
  assert.match(html, /1 mục có ngày xong, chưa đổi trạng thái/);
  const htmlKhong = renderToStaticMarkup(React.createElement(Overview, { acts: [quaHan], access }));
  assert.doesNotMatch(htmlKhong, /chưa cập nhật trạng thái|chưa đổi trạng thái/);
});

/* =====================================================================
 *  lotus-visual-contract.test.mjs — hợp đồng thị giác Lotus Pearl
 *  ---------------------------------------------------------------------
 *  Ba track redesign sau đều đọc token từ đây, nên giá trị phải bị khoá
 *  bằng test chứ không để mỗi màn tự đoán một kiểu.
 *
 *  Nguồn giá trị: spec §6.1 (light), §6.2 (dark), §6.3 (typography),
 *  §6.4 (geometry) và §6.7 (bốn điểm nâng chất, duyệt 15/08).
 * ===================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LOTUS_CHART_COLORS, LOTUS_RADII, LOTUS_VISUAL_ID } from "../../src/lib/visualContract.ts";
import { DISPLAY, TEXT, NUM, NUM_HERO, R } from "../../src/constants/theme.ts";

const GOC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const doc = (p) => readFileSync(path.join(GOC, p), "utf8");

const TOKENS = doc("src/styles/lotus-tokens.css");
const KHOI_SANG = TOKENS.slice(
  TOKENS.indexOf(':root[data-visual="lotus-pearl"]'),
  TOKENS.indexOf(':root[data-visual="lotus-pearl"][data-theme="dark"]'),
);
const KHOI_TOI = TOKENS.slice(TOKENS.indexOf(':root[data-visual="lotus-pearl"][data-theme="dark"]'));

/** Lấy giá trị một biến trong một khối CSS. */
function bien(khoi, ten) {
  const m = khoi.match(new RegExp(`--${ten}\\s*:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}

/* ---- Hằng số TypeScript ------------------------------------------- */

test("mã định danh và bán kính đúng spec §6.4", () => {
  assert.equal(LOTUS_VISUAL_ID, "lotus-pearl");
  assert.deepEqual(LOTUS_RADII, { control: 10, card: 18, panel: 24, pill: 999 });
});

test("bảng màu biểu đồ dùng chung chỉ có ba màu, đúng nghĩa", () => {
  assert.deepEqual(LOTUS_CHART_COLORS, {
    raspberry: "#B64A63", plum: "#5E365D", jade: "#467866",
  });
});

test("serif chỉ kể chuyện, sans lo vận hành — spec §5.2", () => {
  assert.match(DISPLAY, /Cormorant Garamond/);
  assert.match(TEXT, /Be Vietnam Pro/);
  assert.match(NUM, /Be Vietnam Pro/);
  /* Số KPI lớn dùng Cormorant — không phải để điệu mà vì đo được nó là
     phông duy nhất ở đây có chữ số ĐỀU bề rộng. Xem chú thích NUM_HERO
     trong theme.ts và luật C6 trong docs/design/luat-tham-my.md. */
  assert.match(NUM_HERO, /Cormorant Garamond/);
  // Phông cũ không được sót lại ở vai trò vận hành.
  assert.doesNotMatch(TEXT, /Quicksand|Baloo|Poppins/);
  assert.doesNotMatch(NUM, /Quicksand|Baloo|Poppins/);
});

test("thang bo góc cũ được ánh xạ sang thang Lotus", () => {
  assert.deepEqual(R, { sm: 10, md: 18, lg: 18, xl: 24, pill: 999 });
});

/* ---- Token màu ----------------------------------------------------- */

test("token nền và chữ chế độ sáng đúng palette Atelier v2", () => {
  /* Palette v2 theo nghiên cứu 15/08 (docs/design/lotus-pearl-atelier.md
     §3): canvas ngả hồng sâu hơn để card trắng nổi, plum sâu hơn một bậc.
     Mọi cặp chữ/nền đã tính lại tương phản ≥ 4.5:1 trước khi đổi. */
  assert.equal(bien(KHOI_SANG, "lp-canvas"), "#F7F0F3");
  assert.equal(bien(KHOI_SANG, "lp-surface"), "#FFFDFC");
  assert.equal(bien(KHOI_SANG, "lp-surface-2"), "#EEE3E8"); // v3 (nghiên cứu 4+5): figure-ground
  assert.equal(bien(KHOI_SANG, "lp-ink"), "#2F2430");
  assert.equal(bien(KHOI_SANG, "lp-ink-muted"), "#625560"); // v3: ~6.9:1 trên surface
  assert.equal(bien(KHOI_SANG, "lp-plum"), "#5A3158");
  assert.equal(bien(KHOI_SANG, "lp-plum-900"), "#3E213E");
  assert.equal(bien(KHOI_SANG, "lp-rose"), "#A74F72");
});

test("ba màu ngữ nghĩa và vàng trang trí, chế độ sáng", () => {
  assert.equal(bien(KHOI_SANG, "lp-success"), "#386958");
  assert.equal(bien(KHOI_SANG, "lp-danger"), "#A93F5A");
  assert.equal(bien(KHOI_SANG, "lp-warning"), "#8B5D24");
  assert.equal(bien(KHOI_SANG, "lp-gold"), "#C7A15B");
  assert.ok(bien(KHOI_SANG, "lp-focus"), "phải có vòng focus riêng");
});

test("chế độ tối có đủ warning, line, focus và trạng thái vô hiệu — spec §6.2", () => {
  assert.equal(bien(KHOI_TOI, "lp-canvas"), "#171218");
  assert.equal(bien(KHOI_TOI, "lp-surface"), "#241C26");
  assert.equal(bien(KHOI_TOI, "lp-ink"), "#F6EBEF");
  assert.equal(bien(KHOI_TOI, "lp-success"), "#84B6A0");
  assert.equal(bien(KHOI_TOI, "lp-danger"), "#F08BA2");
  assert.equal(bien(KHOI_TOI, "lp-warning"), "#F2C47A");
  assert.equal(bien(KHOI_TOI, "lp-warning-bg"), "#352718");
  assert.equal(bien(KHOI_TOI, "lp-warning-line"), "#745026");
  assert.equal(bien(KHOI_TOI, "lp-line"), "rgb(246 235 239 / 0.16)"); // v3
  assert.equal(bien(KHOI_TOI, "lp-line-strong"), "rgb(246 235 239 / 0.28)"); // v3
  assert.equal(bien(KHOI_TOI, "lp-focus"), "rgb(208 165 183 / 0.50)"); // v3
  assert.equal(bien(KHOI_TOI, "lp-disabled-ink"), "#9E919B");
  assert.equal(bien(KHOI_TOI, "lp-disabled-surface"), "#2A232B");
});

test("vàng không bao giờ mang nghĩa cảnh báo — spec §5.3", () => {
  for (const [ten, khoi] of [["sáng", KHOI_SANG], ["tối", KHOI_TOI]]) {
    const vang = bien(khoi, "lp-gold");
    const canh = bien(khoi, "lp-warning");
    assert.notEqual(vang, canh, `chế độ ${ten}: vàng trang trí trùng màu cảnh báo`);
  }
});

/* ---- Bốn điểm nâng chất, spec §6.7 --------------------------------- */

test("ánh ngọc trai có ở cả hai chế độ và là gradient, không phải màu phẳng", () => {
  for (const [ten, khoi] of [["sáng", KHOI_SANG], ["tối", KHOI_TOI]]) {
    const sheen = bien(khoi, "lp-sheen");
    assert.ok(sheen, `chế độ ${ten}: thiếu --lp-sheen`);
    assert.match(sheen, /linear-gradient/, `chế độ ${ten}: --lp-sheen phải là gradient`);
  }
});

test("chỉ vàng mảnh là biến riêng, tách khỏi vàng đặc", () => {
  for (const [ten, khoi] of [["sáng", KHOI_SANG], ["tối", KHOI_TOI]]) {
    const chi = bien(khoi, "lp-gold-hairline");
    assert.ok(chi, `chế độ ${ten}: thiếu --lp-gold-hairline`);
    assert.match(chi, /rgb\(/, `chế độ ${ten}: chỉ vàng phải có alpha để thật sự mảnh`);
    assert.notEqual(chi, bien(khoi, "lp-gold"));
  }
});

test("cỡ chữ hiển thị đã nâng theo §6.7c", () => {
  assert.equal(bien(KHOI_SANG, "lp-fs-h1"), "36px");
  assert.equal(bien(KHOI_SANG, "lp-lh-h1"), "44px");
  assert.equal(bien(KHOI_SANG, "lp-fs-kpi"), "42px");
  assert.equal(bien(KHOI_SANG, "lp-lh-kpi"), "48px");
  assert.equal(bien(KHOI_SANG, "lp-fs-brand"), "44px");
});

test("chuyển động mềm theo §6.7d và tự tắt khi người dùng yêu cầu", () => {
  assert.equal(bien(KHOI_SANG, "lp-mo-card"), "160ms");
  assert.equal(bien(KHOI_SANG, "lp-mo-modal"), "240ms");
  assert.equal(bien(KHOI_SANG, "lp-mo-chip"), "140ms");
  assert.match(TOKENS, /prefers-reduced-motion:\s*reduce/);
});

/* ---- Cầu tương thích ----------------------------------------------- */

test("mọi token --c-* cũ vẫn được cấp giá trị, không màn nào vỡ", () => {
  // Danh sách này chính là các biến `C.*` trong theme.ts đang trỏ tới.
  const bat_buoc = [
    "c-bg1", "c-bg2", "c-surface", "c-surface-sunk", "c-surface-raised",
    "c-ink", "c-ink-soft", "c-line", "c-line-strong", "c-glass", "c-glass-line",
    "c-pink", "c-pink-deep", "c-pink-text", "c-pink-soft", "c-pink-mist",
    "c-lav", "c-lav-text", "c-lav-soft", "c-mint", "c-mint-text", "c-mint-soft",
    "c-sky", "c-sky-text", "c-sky-soft", "c-rasp", "c-rasp-text", "c-rasp-soft",
    "c-marigold", "c-marigold-text", "c-marigold-soft",
    "c-gold", "c-silver", "c-bronze",
  ];
  const thieu = bat_buoc.filter((t) => !bien(KHOI_SANG, t));
  assert.deepEqual(thieu, [], `thiếu cầu tương thích cho: ${thieu.join(", ")}`);
});

test("màu quá hạn cũ được kéo về raspberry Lotus, không còn hai sắc đỏ", () => {
  assert.equal(bien(KHOI_SANG, "c-rasp"), "var(--lp-danger)");
  assert.equal(bien(KHOI_SANG, "c-mint"), "var(--lp-success)");
});

test("chế độ tối cũng phải bắc lại cầu, nếu không dark mode sẽ dùng màu sáng", () => {
  for (const t of ["c-surface", "c-ink", "c-line", "c-rasp", "c-mint"]) {
    assert.ok(bien(KHOI_TOI, t), `chế độ tối thiếu cầu --${t}`);
  }
});

/* ---- Điểm gắn vào ứng dụng ----------------------------------------- */

test("main.tsx đặt data-visual trước khi React mount", () => {
  const main = doc("src/main.tsx");
  assert.match(main, /dataset\.visual\s*=\s*LOTUS_VISUAL_ID/);
  const viTriDat = main.indexOf("dataset.visual");
  const viTriMount = main.indexOf("createRoot");
  assert.ok(viTriDat < viTriMount, "phải đặt thuộc tính trước createRoot, nếu không trang loé màu cũ");
});

test("main.tsx nạp token sau index.css để cầu tương thích đè được bản cũ", () => {
  const main = doc("src/main.tsx");
  const viTriCu = main.indexOf('"./index.css"');
  const viTriMoi = main.indexOf('"./styles/lotus-tokens.css"');
  assert.ok(viTriCu !== -1 && viTriMoi !== -1, "thiếu một trong hai lời gọi import");
  assert.ok(viTriCu < viTriMoi, "lotus-tokens.css phải nạp sau index.css");
});

test("index.html chỉ còn nạp hai họ phông đang dùng", () => {
  const html = doc("index.html");
  const link = html.match(/href="https:\/\/fonts\.googleapis\.com\/css2[^"]+"/)[0];
  assert.match(link, /Cormorant\+Garamond:wght@500;600;700/);
  assert.match(link, /Be\+Vietnam\+Pro:wght@400;500;600;700;800/);
  for (const bo of ["Baloo", "Poppins", "Quicksand"]) {
    assert.doesNotMatch(link, new RegExp(bo), `${bo} không còn vai trò nào, không được tải`);
  }
});

test("ErrorBoundary trong main.tsx không còn màu và phông cứng của bản cũ", () => {
  const main = doc("src/main.tsx");
  const than = main.slice(main.indexOf("class ErrorBoundary"), main.indexOf("ReactDOM.createRoot"));
  assert.doesNotMatch(than, /Quicksand/);
  assert.doesNotMatch(than, /#FFF1F6|#EE7BA9|#7A4A6E|#C0306B|#FBD6E6/);
});

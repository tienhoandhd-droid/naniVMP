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

test("token nền và chữ chế độ sáng đúng semantic v4 (nghiên cứu 7)", () => {
  /* v4 (nghiên cứu 7): tách PIGMENT khỏi VAI TRÒ. Nền có năm tầng
     canvas/sunken/surface/raised/overlay; chữ có ba bậc; token cũ trỏ
     var() về lớp v4 để ~990 style nội tuyến đổi theo mà không sửa dòng
     nào. Canvas đậm hơn một bậc (#F7F0F3 → #F3EAEE) để light có chiều
     sâu; mọi cặp chữ/nền vẫn ≥ 4.5:1. */
  assert.equal(bien(KHOI_SANG, "lp-bg-canvas"), "#F3EAEE");
  assert.equal(bien(KHOI_SANG, "lp-bg-sunken"), "#E9DDE3");
  assert.equal(bien(KHOI_SANG, "lp-bg-surface"), "#FFFDFB");
  assert.equal(bien(KHOI_SANG, "lp-bg-raised"), "#FFFFFF");
  assert.equal(bien(KHOI_SANG, "lp-bg-overlay"), "#FFFFFF");
  assert.equal(bien(KHOI_SANG, "lp-text-primary"), "#2F2430");
  assert.equal(bien(KHOI_SANG, "lp-text-secondary"), "#5B4D59");
  assert.equal(bien(KHOI_SANG, "lp-text-tertiary"), "#756975");
  // Cầu: token cũ phải TRỎ vào v4, không được giữ hex riêng lệch pha.
  assert.equal(bien(KHOI_SANG, "lp-canvas"), "var(--lp-bg-canvas)");
  assert.equal(bien(KHOI_SANG, "lp-surface"), "var(--lp-bg-surface)");
  assert.equal(bien(KHOI_SANG, "lp-surface-2"), "var(--lp-bg-sunken)");
  assert.equal(bien(KHOI_SANG, "lp-ink"), "var(--lp-text-primary)");
  assert.equal(bien(KHOI_SANG, "lp-ink-muted"), "var(--lp-text-secondary)");
  // Brand solid tách khỏi brand accent — không còn token đảo nghĩa theo theme.
  assert.equal(bien(KHOI_SANG, "lp-brand-solid"), "#3E213E");
  assert.equal(bien(KHOI_SANG, "lp-on-brand-solid"), "#FFFDFC");
  assert.equal(bien(KHOI_SANG, "lp-brand"), "#5A3158");
  assert.equal(bien(KHOI_SANG, "lp-plum"), "var(--lp-brand)");
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

test("chế độ tối: elevation năm tầng + warning, line, focus — v4", () => {
  /* Dark theo nguyên tắc elevation: bề mặt phía trước SÁNG HƠN base
     (canvas < sunken < surface < raised < overlay), không cứu chiều sâu
     bằng bóng đen. Nghiên cứu 7 §Bộ token đề xuất. */
  assert.equal(bien(KHOI_TOI, "lp-bg-canvas"), "#151116");
  assert.equal(bien(KHOI_TOI, "lp-bg-sunken"), "#1B161C");
  assert.equal(bien(KHOI_TOI, "lp-bg-surface"), "#211A22");
  assert.equal(bien(KHOI_TOI, "lp-bg-raised"), "#2B222C");
  assert.equal(bien(KHOI_TOI, "lp-bg-overlay"), "#342936");
  assert.equal(bien(KHOI_TOI, "lp-text-primary"), "#F5EEF1");
  assert.equal(bien(KHOI_TOI, "lp-text-secondary"), "#BFB1BA");
  assert.equal(bien(KHOI_TOI, "lp-text-tertiary"), "#9F919B");
  // Brand solid ở dark vẫn là SƠN MÀI TỐI, không đảo thành phấn sáng.
  assert.equal(bien(KHOI_TOI, "lp-brand-solid"), "#41263F");
  assert.equal(bien(KHOI_TOI, "lp-on-brand-solid"), "#FFF7FA");
  assert.equal(bien(KHOI_TOI, "lp-brand"), "#D8A8BC");
  assert.equal(bien(KHOI_TOI, "lp-rose"), "#E09BB7");
  assert.equal(bien(KHOI_TOI, "lp-success"), "#84B6A0");
  assert.equal(bien(KHOI_TOI, "lp-danger"), "#F08BA2");
  assert.equal(bien(KHOI_TOI, "lp-warning"), "#F2C47A");
  assert.equal(bien(KHOI_TOI, "lp-warning-bg"), "#352718");
  assert.equal(bien(KHOI_TOI, "lp-warning-line"), "#745026");
  assert.equal(bien(KHOI_TOI, "lp-line"), "rgb(245 238 241 / 0.16)"); // v4: theo text-primary mới
  assert.equal(bien(KHOI_TOI, "lp-line-strong"), "rgb(245 238 241 / 0.28)");
  assert.equal(bien(KHOI_TOI, "lp-focus"), "var(--lp-rose)"); // v5: focus ĐẶC ≥3:1 (nghiên cứu 6)
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

test("index.html tự host đúng hai họ phông, không còn origin Google", () => {
  // v5 hiệu năng (16/08): font tự host — không được còn bất kỳ tham chiếu
  // fonts.googleapis/gstatic nào trên đường găng.
  const html = doc("index.html");
  assert.doesNotMatch(html, /fonts\.googleapis\.com\/css2|fonts\.gstatic\.com/,
    "không được nạp font từ origin Google nữa");
  const hoPhong = [...html.matchAll(/font-family: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(hoPhong)].sort(),
    ["Be Vietnam Pro", "Cormorant Garamond"], "đúng hai họ phông tự host");
  for (const w of ["400", "500", "600", "700", "800"]) {
    assert.match(html, new RegExp(`BeVietnamPro-${w}-vietnamese\\.woff2`),
      `Be Vietnam Pro ${w} phải có subset vietnamese`);
  }
  // Ghi chú lịch sử trong comment được phép nhắc tên phông cũ — chỉ cấm
  // ngoài comment (link/style thật).
  const khongComment = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const bo of ["Baloo", "Poppins", "Quicksand"]) {
    assert.doesNotMatch(khongComment, new RegExp(bo), `${bo} không còn vai trò nào, không được tải`);
  }
});

test("ErrorBoundary trong main.tsx không còn màu và phông cứng của bản cũ", () => {
  const main = doc("src/main.tsx");
  const than = main.slice(main.indexOf("class ErrorBoundary"), main.indexOf("ReactDOM.createRoot"));
  assert.doesNotMatch(than, /Quicksand/);
  assert.doesNotMatch(than, /#FFF1F6|#EE7BA9|#7A4A6E|#C0306B|#FBD6E6/);
});

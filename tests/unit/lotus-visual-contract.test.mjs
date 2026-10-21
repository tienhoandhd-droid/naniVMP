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

test("token nền và chữ chế độ sáng đúng bảng trung tính ánh mận (21/10)", () => {
  /* v4 (nghiên cứu 7): tách PIGMENT khỏi VAI TRÒ. Nền có năm tầng
     canvas/sunken/surface/raised/overlay; chữ có ba bậc; token cũ trỏ
     var() về lớp v4 để ~990 style nội tuyến đổi theo mà không sửa dòng
     nào. 21/10 (bảng màu tinh giản, chủ dự án duyệt): một họ trung tính
     ánh mận hue 345, thẻ trắng sứ; ba tầng chữ cách nhau φ về tương phản
     và mọi cặp chữ/nền vẫn ≥ 4.5:1 (kiểm số ở test tương phản bên dưới). */
  assert.equal(bien(KHOI_SANG, "lp-bg-canvas"), "#F6F1F3");
  assert.equal(bien(KHOI_SANG, "lp-bg-sunken"), "#F1EBEE");
  assert.equal(bien(KHOI_SANG, "lp-bg-surface"), "#FFFEFE");
  assert.equal(bien(KHOI_SANG, "lp-bg-raised"), "#FFFFFF");
  assert.equal(bien(KHOI_SANG, "lp-bg-overlay"), "#FFFFFF");
  assert.equal(bien(KHOI_SANG, "lp-text-primary"), "#3A2832");
  assert.equal(bien(KHOI_SANG, "lp-text-secondary"), "#5A4752");
  assert.equal(bien(KHOI_SANG, "lp-text-tertiary"), "#75646D");
  // Cầu: token cũ phải TRỎ vào v4, không được giữ hex riêng lệch pha.
  assert.equal(bien(KHOI_SANG, "lp-canvas"), "var(--lp-bg-canvas)");
  assert.equal(bien(KHOI_SANG, "lp-surface"), "var(--lp-bg-surface)");
  assert.equal(bien(KHOI_SANG, "lp-surface-2"), "var(--lp-bg-sunken)");
  assert.equal(bien(KHOI_SANG, "lp-ink"), "var(--lp-text-primary)");
  assert.equal(bien(KHOI_SANG, "lp-ink-muted"), "var(--lp-text-secondary)");
  // Brand solid tách khỏi brand accent — không còn token đảo nghĩa theo theme.
  assert.equal(bien(KHOI_SANG, "lp-brand-solid"), "#4A2941");
  assert.equal(bien(KHOI_SANG, "lp-on-brand-solid"), "#FFFDFC");
  assert.equal(bien(KHOI_SANG, "lp-brand"), "#6B3B55");
  assert.equal(bien(KHOI_SANG, "lp-plum"), "var(--lp-brand)");
  assert.equal(bien(KHOI_SANG, "lp-plum-900"), "#4A2941");
  assert.equal(bien(KHOI_SANG, "lp-rose"), "#B35872");
});

test("ba màu ngữ nghĩa và vàng trang trí, chế độ sáng", () => {
  assert.equal(bien(KHOI_SANG, "lp-success"), "#367255");
  assert.equal(bien(KHOI_SANG, "lp-danger"), "#A84552");
  assert.equal(bien(KHOI_SANG, "lp-warning"), "#925910");
  assert.equal(bien(KHOI_SANG, "lp-gold"), "#C7A15B");
  assert.ok(bien(KHOI_SANG, "lp-focus"), "phải có vòng focus riêng");
});

test("chế độ tối: elevation năm tầng + warning, line, focus — v4", () => {
  /* Dark theo nguyên tắc elevation: bề mặt phía trước SÁNG HƠN base
     (canvas < sunken < surface < raised < overlay), không cứu chiều sâu
     bằng bóng đen. Nghiên cứu 7 §Bộ token đề xuất. */
  assert.equal(bien(KHOI_TOI, "lp-bg-canvas"), "#130E10");
  assert.equal(bien(KHOI_TOI, "lp-bg-sunken"), "#191316");
  assert.equal(bien(KHOI_TOI, "lp-bg-surface"), "#1E171B");
  assert.equal(bien(KHOI_TOI, "lp-bg-raised"), "#261F23");
  assert.equal(bien(KHOI_TOI, "lp-bg-overlay"), "#2E262A");
  assert.equal(bien(KHOI_TOI, "lp-text-primary"), "#E9E0E4");
  assert.equal(bien(KHOI_TOI, "lp-text-secondary"), "#BEB0B7");
  assert.equal(bien(KHOI_TOI, "lp-text-tertiary"), "#96888F");
  // Brand solid ở dark vẫn là SƠN MÀI TỐI, không đảo thành phấn sáng.
  assert.equal(bien(KHOI_TOI, "lp-brand-solid"), "#41263F");
  assert.equal(bien(KHOI_TOI, "lp-on-brand-solid"), "#FFF7FA");
  assert.equal(bien(KHOI_TOI, "lp-brand"), "#D8A8BC");
  assert.equal(bien(KHOI_TOI, "lp-rose"), "#E09BB7");
  assert.equal(bien(KHOI_TOI, "lp-success"), "#79AD91");
  assert.equal(bien(KHOI_TOI, "lp-danger"), "#DB8A90");
  assert.equal(bien(KHOI_TOI, "lp-warning"), "#C79957");
  assert.equal(bien(KHOI_TOI, "lp-warning-bg"), "#2E2210");
  assert.equal(bien(KHOI_TOI, "lp-warning-line"), "#6B4F26");
  assert.equal(bien(KHOI_TOI, "lp-line"), "rgb(233 224 228 / 0.14)"); // theo text-primary
  assert.equal(bien(KHOI_TOI, "lp-line-strong"), "rgb(233 224 228 / 0.26)");
  assert.equal(bien(KHOI_TOI, "lp-focus"), "var(--lp-rose)"); // v5: focus ĐẶC ≥3:1 (nghiên cứu 6)
  assert.equal(bien(KHOI_TOI, "lp-disabled-ink"), "#9E919B");
  assert.equal(bien(KHOI_TOI, "lp-disabled-surface"), "#261F23");
});

/* Ý kiểm của bảng 21/10, đo bằng SỐ chứ không chỉ so mã: mọi tầng chữ đọc
   được trên mọi nền đọc (≥ 4.5:1, kể cả nền lõm), ba tầng tách bậc rõ, và
   vàng quá nhạt để làm chữ — nên nó chỉ được trang trí. */
const doSang = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const tuongPhan = (a, b) => {
  const [x, y] = [doSang(a), doSang(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

test("mọi tầng chữ ≥ 4.5:1 trên mọi nền đọc, ba tầng tách bậc, vàng không đủ làm chữ", () => {
  for (const [ten, khoi] of [["sáng", KHOI_SANG], ["tối", KHOI_TOI]]) {
    const tang = ["primary", "secondary", "tertiary"].map((t) => bien(khoi, `lp-text-${t}`));
    for (const nen of ["canvas", "sunken", "surface", "raised"]) {
      for (const chu of tang) {
        const ty = tuongPhan(chu, bien(khoi, `lp-bg-${nen}`));
        assert.ok(ty >= 4.5, `chế độ ${ten}: chữ ${chu} trên ${nen} chỉ ${ty.toFixed(2)}:1`);
      }
    }
    const tp = tang.map((c) => tuongPhan(c, bien(khoi, "lp-bg-surface")));
    assert.ok(tp[0] / tp[1] >= 1.4 && tp[1] / tp[2] >= 1.4, `chế độ ${ten}: ba tầng chữ không tách bậc`);
    for (const ngNghia of ["success", "danger", "warning", "brand"]) {
      const ty = tuongPhan(bien(khoi, `lp-${ngNghia}`), bien(khoi, "lp-bg-surface"));
      assert.ok(ty >= 4.5, `chế độ ${ten}: --lp-${ngNghia} chỉ ${ty.toFixed(2)}:1 trên thẻ`);
    }
  }
  assert.ok(tuongPhan(bien(KHOI_SANG, "lp-gold"), bien(KHOI_SANG, "lp-bg-surface")) < 3,
    "vàng sáng đủ đậm để thành chữ — vậy là đã trượt khỏi vai trò trang trí");
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
  /* 31/08 — thang chữ bản cuối: h1 nâng 36→44px (lh 50) theo đợt chỉnh
     hiển thị của chủ dự án; KPI/brand giữ nguyên. */
  assert.equal(bien(KHOI_SANG, "lp-fs-h1"), "44px");
  assert.equal(bien(KHOI_SANG, "lp-lh-h1"), "50px");
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

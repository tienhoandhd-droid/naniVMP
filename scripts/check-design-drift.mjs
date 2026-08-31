/* =====================================================================
 *  check-design-drift.mjs — guardrail chống trôi thiết kế (Atelier §Guardrail)
 *  ---------------------------------------------------------------------
 *  Chạy: npm run drift
 *
 *  CHỈ soát các file ĐÃ MIGRATION sang hệ Lotus Pearl (danh sách dưới).
 *  Code cũ chưa chạm thì chưa bị chặn — luật của Atelier là "code mới đi
 *  qua token, code cũ migration khi chạm tới", không phải sửa 990 inline
 *  style một phát.
 *
 *  Bốn luật:
 *   1. Không mã màu hex mới ngoài file token (trừ danh sách miễn có lý do).
 *   2. Không border-radius ngoài 10/16/18/24/999px (18 là legacy được giữ).
 *   3. Không font-size dưới 12px.
 *   4. Không emoji trong UI nghiệp vụ (chat persona không thuộc phạm vi này).
 * ===================================================================== */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Trên Windows, URL.pathname trả "/C:/…" nên mọi statSync đều trượt và bộ
   kiểm âm thầm quét 0 file rồi báo ĐẠT. fileURLToPath cho đường dẫn đúng
   trên cả ba hệ điều hành. */
const args = process.argv.slice(2);
if (args.length !== 0 && !(args.length === 2 && args[0] === "--root" && path.isAbsolute(args[1]))) {
  console.error("Usage: node scripts/check-design-drift.mjs [--root <absolute-path>]");
  process.exit(2);
}
const GOC = args.length === 2 ? args[1] : fileURLToPath(new URL("..", import.meta.url));

/* Phạm vi đã migration — mở rộng dần khi từng màn chuyển hệ. */
const PHAM_VI = [
  "src/styles",
  "src/features",
  "src/components/brand",
  "src/components/layout/PageArtLayer.tsx",
  "src/components/ui/ViewportDialog.tsx",
  "src/components/ui/DirtyStateProvider.tsx",
  "src/components/catalog/CatalogObjectForm.tsx",
  "src/pages/SourceCatalogPage.tsx",
  /* 30/08 — hai màn đã chuyển sang hệ Lotus B+ và vỏ ứng dụng. */
  "src/pages/UpdatePage.tsx",
  "src/components/layout/Layout.tsx",
  "src/components/ui/MetricGrid.tsx",
  "src/components/ui/StateBoundary.tsx",
];

/* File được PHÉP chứa hex: nơi khai token và art thương hiệu (màu nhân
   vật/motif là giá trị token được "nướng" vào tranh, có chú thích trong file). */
const MIEN_HEX = new Set([
  "src/styles/lotus-tokens.css",
  // Hai file VẼ nhân vật (17/08): ValiIllustration.tsx nay chỉ là bộ chọn
  // theo theme, không còn hex — phần tranh nằm ở hai file này.
  "src/components/brand/CongChuaVali.tsx",
  "src/components/brand/DungSiVali.tsx",
]);

/* Emoji hay lọt vào UI trạng thái. Không quét chữ tiếng Việt nên chỉ cần
   dải emoji chính. */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2728}\u{2764}\u{1F900}-\u{1F9FF}]/u;

const RADIUS_HOP_LE = new Set(["0", "10", "16", "18", "24", "999", "50%", "100%"]);

/* Background literal is evaluated over the complete file, including values
   wrapped onto following lines. */
const THEME_LITERAL = /background(?:-color)?\s*:\s*(?:\r?\n\s*)?(?:#fff(?:fff)?\b|white\b|rgba?\(\s*255\s*[, ]\s*255\s*[, ]\s*255\b)/gi;

function duyet(duong) {
  const day = join(GOC, duong);
  const st = statSync(day, { throwIfNoEntry: false });
  if (!st) return [];
  if (st.isFile()) return [duong.split("\\").join("/")];
  return readdirSync(day).flatMap((con) => duyet(join(duong, con)));
}

const loi = [];
const files = PHAM_VI.flatMap(duyet)
  .filter((f) => /\.(tsx?|css)$/.test(f) && !f.endsWith(".d.ts"));

for (const f of files) {
  const noiDung = readFileSync(join(GOC, f), "utf8");
  const dong = noiDung.split("\n");
  const backgroundRanges = [...noiDung.matchAll(THEME_LITERAL)].map((match) => [match.index, match.index + match[0].length]);

  dong.forEach((line, i) => {
    const so = `${f}:${i + 1}`;
    // Bỏ dòng chú thích thuần tuý — luật nhắm vào code chạy thật.
    const sach = line.replace(/\/\*.*?\*\//g, "").replace(/^\s*\*.*/, "").replace(/^\s*\/\/.*/, "");

    if (!MIEN_HEX.has(f)) {
      const lineStart = dong.slice(0, i).reduce((offset, value) => offset + value.length + 1, 0);
      const hex = [...sach.matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
        .filter((match) => !backgroundRanges.some(([start, end]) => lineStart + match.index >= start && lineStart + match.index < end))
        .map((match) => match[0]);
      if (hex.length) loi.push(`${so} — mã màu ngoài token: ${hex.join(", ")}`);
    }

    for (const m of sach.matchAll(/border-?[rR]adius[":\s]+"?([0-9.]+)(px)?/g)) {
      if (!RADIUS_HOP_LE.has(m[1])) loi.push(`${so} — radius lạ ${m[1]}px (chỉ 10/16/18/24/999)`);
    }

    for (const m of sach.matchAll(/font-?[sS]ize[":\s]+"?([0-9.]+)px/g)) {
      if (Number(m[1]) < 12) loi.push(`${so} — chữ ${m[1]}px nhỏ hơn 12px`);
    }

    if (EMOJI.test(sach)) loi.push(`${so} — emoji trong UI nghiệp vụ`);
  });
}

/* Luật 5 (nghiên cứu 7): CẤM background trắng literal — quét TOÀN src,
   không chỉ phạm vi migration, vì một `background:#fff` là đủ tạo mảng
   trắng trong dark mode bất kể token đúng đến đâu. Chữ trắng trên nền
   đặc vẫn hợp lệ; luật chỉ nhắm background. */
const MIEN_NEN_TRANG = new Set([
  "src/styles/lotus-tokens.css", // nơi duy nhất được khai giá trị nền
]);
const tatCaSrc = duyet("src").filter((f) => /\.(tsx?|css)$/.test(f) && !f.endsWith(".d.ts"));
for (const f of tatCaSrc) {
  if (MIEN_NEN_TRANG.has(f)) continue;
  const noiDung = readFileSync(join(GOC, f), "utf8");
  // Mask comments without removing newlines, so match indexes retain source lines.
  const sach = noiDung
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (comment) => comment.replace(/[^\n]/g, " "));
  for (const match of sach.matchAll(THEME_LITERAL)) {
    const line = sach.slice(0, match.index).split("\n").length;
    loi.push(`${f}:${line} — nền trắng literal (dark mode sẽ thủng): ${match[0].trim().slice(0, 70)}`);
  }
}

console.log(`Đã soát ${files.length} file trong phạm vi migration + ${tatCaSrc.length} file luật nền trắng.`);
if (loi.length) {
  console.error(`\n${loi.length} vi phạm luật thiết kế:`);
  for (const l of loi) console.error(`  ✗ ${l}`);
  process.exit(1);
}
console.log("Không có trôi thiết kế. ĐẠT.");

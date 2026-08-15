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

const GOC = new URL("..", import.meta.url).pathname;

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
];

/* File được PHÉP chứa hex: nơi khai token và art thương hiệu (màu nhân
   vật/motif là giá trị token được "nướng" vào tranh, có chú thích trong file). */
const MIEN_HEX = new Set([
  "src/styles/lotus-tokens.css",
  "src/components/brand/ValiIllustration.tsx",
]);

/* Emoji hay lọt vào UI trạng thái. Không quét chữ tiếng Việt nên chỉ cần
   dải emoji chính. */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2728}\u{2764}\u{1F900}-\u{1F9FF}]/u;

const RADIUS_HOP_LE = new Set(["0", "10", "16", "18", "24", "999", "50%", "100%"]);

function duyet(duong) {
  const day = join(GOC, duong);
  const st = statSync(day, { throwIfNoEntry: false });
  if (!st) return [];
  if (st.isFile()) return [duong];
  return readdirSync(day).flatMap((con) => duyet(join(duong, con)));
}

const loi = [];
const files = PHAM_VI.flatMap(duyet)
  .filter((f) => /\.(tsx?|css)$/.test(f) && !f.endsWith(".d.ts"));

for (const f of files) {
  const noiDung = readFileSync(join(GOC, f), "utf8");
  const dong = noiDung.split("\n");

  dong.forEach((line, i) => {
    const so = `${f}:${i + 1}`;
    // Bỏ dòng chú thích thuần tuý — luật nhắm vào code chạy thật.
    const sach = line.replace(/\/\*.*?\*\//g, "").replace(/^\s*\*.*/, "").replace(/^\s*\/\/.*/, "");

    if (!MIEN_HEX.has(f)) {
      const hex = sach.match(/#[0-9a-fA-F]{3,8}\b/g);
      if (hex) loi.push(`${so} — mã màu ngoài token: ${hex.join(", ")}`);
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

console.log(`Đã soát ${files.length} file trong phạm vi migration.`);
if (loi.length) {
  console.error(`\n${loi.length} vi phạm luật thiết kế:`);
  for (const l of loi) console.error(`  ✗ ${l}`);
  process.exit(1);
}
console.log("Không có trôi thiết kế. ĐẠT.");

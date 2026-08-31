/* =====================================================================
 *  kiem-ngan-sach-bundle.mjs — chốt ngân sách kích thước bản build
 *  ---------------------------------------------------------------------
 *  Chạy: npm run budget   (SAU npm run build — đo dist/ thật)
 *
 *  Vì sao tồn tại: đợt 31/08 đã trả CSS đường găng từ 304KB về 180KB, đuổi
 *  5,2MB PNG chết khỏi deploy. Không có gate thì các con số này TRÔI LẠI
 *  từng commit một mà không ai thấy — script này làm CI đỏ ngay khi vượt.
 *
 *  Ngân sách (raw trừ khi ghi gzip; chỉnh CÓ CHỦ ĐÍCH kèm lý do trong PR):
 *   1. CSS entry (index-*.css)        ≤ 200KB   (hiện ~180KB)
 *   2. JS đường găng gzip             ≤ 220KB   (index + vendor-react +
 *      vendor-supabase; hiện ~193KB. exceljs/three lazy — không tính)
 *   3. Tổng dist/                     ≤ 6MB     (hiện ~4,4MB)
 *   4. PNG trong dist/                = 1       (chỉ logo-cpc1hn.png 35KB;
 *      tranh Ngư đồ phải là .webp, PNG nguồn ở designs/art-goc/)
 * ===================================================================== */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const GOC = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(GOC, "dist");
const KB = 1024;

function* duyet(dir) {
  for (const ten of readdirSync(dir)) {
    const p = join(dir, ten);
    if (statSync(p).isDirectory()) yield* duyet(p);
    else yield p;
  }
}

let tongDist = 0;
const png = [];
let cssEntry = null;
const jsGang = []; // [tên, gzip bytes]
const GANG_RE = /^(index|vendor-react|vendor-supabase)-[\w-]+\.js$/;

for (const f of duyet(DIST)) {
  const st = statSync(f);
  tongDist += st.size;
  const ten = f.split(/[\\/]/).pop();
  if (ten.endsWith(".png")) png.push(ten);
  if (/^index-[\w-]+\.css$/.test(ten)) cssEntry = { ten, size: st.size };
  if (GANG_RE.test(ten)) jsGang.push([ten, gzipSync(readFileSync(f)).length]);
}

const loi = [];
const bao = (ok, msg) => { console.log(`${ok ? "✓" : "✗"} ${msg}`); if (!ok) loi.push(msg); };

if (!cssEntry) loi.push("Không thấy index-*.css trong dist — đã chạy npm run build chưa?");
else bao(cssEntry.size <= 200 * KB,
  `CSS entry ${cssEntry.ten}: ${(cssEntry.size / KB).toFixed(1)}KB (ngân sách 200KB)`);

const gangGzip = jsGang.reduce((s, [, b]) => s + b, 0);
bao(jsGang.length >= 3 && gangGzip <= 220 * KB,
  `JS đường găng gzip (${jsGang.map(([t]) => t.split("-")[0]).join("+")}): ${(gangGzip / KB).toFixed(1)}KB (ngân sách 220KB)`);

bao(tongDist <= 6 * KB * KB, `Tổng dist: ${(tongDist / KB / KB).toFixed(2)}MB (ngân sách 6MB)`);

bao(png.length === 1 && png[0] === "logo-cpc1hn.png",
  `PNG trong dist: ${png.join(", ") || "(không có)"} (chỉ được logo-cpc1hn.png)`);

if (loi.length) {
  console.error(`\n${loi.length} mục vượt ngân sách. Nếu vượt CÓ CHỦ ĐÍCH, chỉnh ngân sách trong scripts/kiem-ngan-sach-bundle.mjs kèm lý do.`);
  process.exit(1);
}
console.log("\nNgân sách bundle: ĐẠT.");

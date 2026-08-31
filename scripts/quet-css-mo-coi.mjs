/* Quét lớp CSS mồ côi trong src/index.css — lớp được ĐỊNH NGHĨA trong CSS
 * nhưng KHÔNG còn file .tsx/.ts nào nhắc tới (className tĩnh, chuỗi ghép,
 * querySelector, test e2e…). Dùng để dọn di sản Gantt/visual đã xoá 31/08.
 *
 * Cách dùng:
 *   node scripts/quet-css-mo-coi.mjs                # báo cáo tổng + nhóm tiền tố
 *   node scripts/quet-css-mo-coi.mjs --liet-ke      # in từng lớp mồ côi
 *
 * Thận trọng có chủ đích: một lớp chỉ bị coi là mồ côi khi CHUỖI TÊN LỚP
 * không xuất hiện ở đâu trong src/ lẫn tests/ (kể cả trong chuỗi ghép động
 * kiểu `long-mon-race__fish--${x}` thì phần tĩnh vẫn khớp). Ghép class
 * hoàn toàn động không có phần tĩnh sẽ không bị phát hiện — trước khi xoá
 * hàng loạt vẫn phải xem cụm tiền tố bằng mắt.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSS_FILE = join(ROOT, "src", "index.css");

function* duyet(dir) {
  for (const ten of readdirSync(dir)) {
    const p = join(dir, ten);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (ten === "node_modules" || ten === "dist") continue;
      yield* duyet(p);
    } else if (/\.(tsx?|mjs|html)$/.test(ten) && !p.endsWith(".d.ts")) {
      yield p;
    }
  }
}

// Toàn bộ mã nguồn + test gộp thành một biển chuỗi để tra tên lớp.
let bien = readFileSync(join(ROOT, "index.html"), "utf8");
for (const dir of ["src", "tests", "scripts"]) {
  for (const f of duyet(join(ROOT, dir))) {
    if (f === CSS_FILE) continue;
    bien += "\n" + readFileSync(f, "utf8");
  }
}

const css = readFileSync(CSS_FILE, "utf8");
// Lấy tên lớp từ selector: bỏ nội dung block {...} để không nhặt nhầm giá trị.
const selectorText = css.replace(/\{[^{}]*\}/g, "{}");
const tenLop = new Set();
for (const m of selectorText.matchAll(/\.([a-zA-Z][\w-]*)/g)) tenLop.add(m[1]);

const moCoi = [...tenLop].filter((lop) => !bien.includes(lop)).sort();

// Đếm số dòng CSS thuộc các rule chỉ chứa selector mồ côi (ước lượng bảo thủ:
// một rule bị tính là chết khi MỌI lớp trong selector đều mồ côi).
const moCoiSet = new Set(moCoi);
let dongChet = 0;
const ruleRe = /([^{}]+)\{[^{}]*\}/g;
for (const m of css.matchAll(ruleRe)) {
  const cacLop = [...m[1].matchAll(/\.([a-zA-Z][\w-]*)/g)].map((x) => x[1]);
  if (cacLop.length > 0 && cacLop.every((l) => moCoiSet.has(l))) {
    dongChet += m[0].split("\n").length;
  }
}

const nhom = {};
for (const lop of moCoi) {
  const tienTo = lop.split("-").slice(0, 2).join("-");
  nhom[tienTo] = (nhom[tienTo] || 0) + 1;
}

console.log(`index.css: ${css.split("\n").length} dòng, ${tenLop.size} lớp định nghĩa`);
console.log(`Mồ côi: ${moCoi.length} lớp (${((moCoi.length / tenLop.size) * 100).toFixed(0)}%), ước ~${dongChet} dòng rule chết hoàn toàn`);
console.log("\nNhóm tiền tố mồ côi (>=3 lớp):");
for (const [k, v] of Object.entries(nhom).sort((a, b) => b[1] - a[1])) {
  if (v >= 3) console.log(`  ${k.padEnd(22)} ${v}`);
}
if (process.argv.includes("--liet-ke")) {
  console.log("\nDanh sách đầy đủ:");
  for (const lop of moCoi) console.log("  ." + lop);
}

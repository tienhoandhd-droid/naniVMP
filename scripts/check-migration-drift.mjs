// =====================================================================
//  check-migration-drift.mjs — production có đang chạy đúng code trong repo?
//  ---------------------------------------------------------------------
//  Cách dùng:  SUPABASE_DB_URL=... node scripts/check-migration-drift.mjs
//
//  Vì sao cần (rà soát 16/10/2026): 6 migration đợt 31/08–01/09 nằm trong
//  repo, web đã gọi tới chúng, nhưng production chưa từng được áp — không ai
//  biết suốt 6 tuần. Bảng supabase_migrations không giúp được vì runbook áp
//  bằng `psql -f`, cách này không ghi vào bảng đó.
//
//  Script lấy bản định nghĩa MỚI NHẤT của từng hàm public trong
//  supabase/migrations, so thân hàm (đã chuẩn hoá khoảng trắng) với
//  pg_proc.prosrc trên production. CHỈ ĐỌC: mọi truy vấn nằm trong
//  `begin read only` (PGOPTIONS bị pooler Supabase bỏ qua nên không dùng).
//
//  Mã thoát: 0 khớp hết · 1 có migration chưa áp/lệch · 2 thiếu cấu hình
// =====================================================================
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Thiếu biến SUPABASE_DB_URL.");
  process.exit(2);
}

const thuMuc = new URL("../supabase/migrations/", import.meta.url).pathname;
const mauHam = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z_0-9]+)"?\s*\(.*?\$([a-z_]*)\$(.*?)\$\2\$/gis;

// Tên hàm → { migration định nghĩa sau cùng, các thân hàm trong file đó }.
// Một tên có thể có nhiều overload (vd cpc1_run_save 5 và 6 tham số).
const banMoiNhat = new Map();
for (const tenFile of readdirSync(thuMuc).filter((f) => f.endsWith(".sql")).sort()) {
  const noiDung = readFileSync(join(thuMuc, tenFile), "utf8");
  const trongFile = new Map();
  for (const [, ten, , than] of noiDung.matchAll(mauHam)) {
    trongFile.set(ten, [...(trongFile.get(ten) ?? []), than]);
  }
  for (const [ten, cacThan] of trongFile) banMoiNhat.set(ten, { migration: tenFile, cacThan });
}

const truyVan = `begin read only;
select json_object_agg(proname, cac_than) from (
  select proname, json_agg(prosrc) cac_than from pg_proc
  where pronamespace = 'public'::regnamespace group by proname) t;
rollback;`;
const kq = spawnSync("psql", [dbUrl, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", truyVan], { encoding: "utf8" });
if (kq.status !== 0) {
  console.error("Không đọc được production:", kq.stderr.trim());
  process.exit(2);
}
const dongJson = kq.stdout.split("\n").find((dong) => dong.startsWith("{"));
if (!dongJson) {
  console.error("psql không trả JSON hàm. Output:", kq.stdout.slice(0, 300));
  process.exit(2);
}
const production = JSON.parse(dongJson);
const chuanHoa = (s) => s.replace(/\s+/g, " ").trim();

const theoMigration = new Map();
for (const [ten, { migration, cacThan }] of banMoiNhat) {
  const nhom = theoMigration.get(migration) ?? { khop: 0, lech: [] };
  const banProd = new Set((production[ten] ?? []).map(chuanHoa));
  if (!(ten in production)) nhom.lech.push(`${ten} (vắng)`);
  else if (!cacThan.every((than) => banProd.has(chuanHoa(than)))) nhom.lech.push(`${ten} (khác thân)`);
  else nhom.khop += 1;
  theoMigration.set(migration, nhom);
}

let soLech = 0;
for (const [migration, { khop, lech }] of [...theoMigration].sort()) {
  if (lech.length === 0) continue;
  soLech += 1;
  console.log(`✗ ${migration}: khớp ${khop}, lệch ${lech.length} — ${lech.slice(0, 4).join(", ")}`);
}
console.log(soLech === 0
  ? `✓ ${banMoiNhat.size} hàm trong repo khớp production.`
  : `\n${soLech} migration chưa áp hoặc production đã bị sửa tay. Xem docs/runbooks/2026-10-16-ap-migration-ton-dong.md`);
process.exit(soLech === 0 ? 0 : 1);

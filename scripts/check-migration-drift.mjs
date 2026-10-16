// =====================================================================
//  check-migration-drift.mjs — production có đang chạy đúng code trong repo?
//  ---------------------------------------------------------------------
//  Hai cách chạy (chọn tự động theo biến môi trường có mặt):
//    SUPABASE_DB_URL=...                       node scripts/check-migration-drift.mjs
//    VITE_SUPABASE_URL=... VITE_SUPABASE_ANON=... node scripts/check-migration-drift.mjs
//  Cách thứ hai chỉ cần anon key (công khai) — dùng cho workflow GitHub
//  db-drift.yml chạy mỗi sáng, vì GitHub cố ý không giữ credential DB.
//
//  Vì sao cần (rà soát 16/10/2026): 6 migration đợt 31/08–01/09 nằm trong
//  repo, web đã gọi tới chúng, nhưng production chưa từng được áp — không ai
//  biết suốt 6 tuần. Bảng supabase_migrations không giúp được vì runbook áp
//  bằng `psql -f`, cách này không ghi vào bảng đó.
//
//  Cách so: lấy bản định nghĩa MỚI NHẤT của từng hàm public trong
//  supabase/migrations, băm md5 thân hàm (chuẩn hoá khoảng trắng) và so với
//  mã băm production tính bằng CÙNG phép chuẩn hoá trong SQL (xem
//  20261016110000_schema_fingerprint.sql). CHỈ ĐỌC: psql bọc `begin read
//  only` (PGOPTIONS bị pooler Supabase bỏ qua); REST chỉ gọi một RPC đọc.
//
//  Mã thoát: 0 khớp hết · 1 có migration chưa áp/lệch · 2 thiếu cấu hình/lỗi kết nối
// =====================================================================
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

// Phải khớp btrim(regexp_replace(prosrc, '\s+', ' ', 'g')) phía SQL.
const chuanHoa = (s) => s.replace(/\s+/g, " ").trim();
const md5 = (s) => createHash("md5").update(chuanHoa(s), "utf8").digest("hex");
// Cùng biểu thức với rpc_schema_fingerprint() — psql dùng trực tiếp để không
// phụ thuộc việc hàm đó đã được áp hay chưa.
const SQL_MA_BAM = `select coalesce(jsonb_object_agg(t.proname, t.cac_ma), '{}'::jsonb) from (
  select p.proname, jsonb_agg(md5(btrim(regexp_replace(p.prosrc, '\\s+', ' ', 'g'))) order by p.oid) cac_ma
  from pg_proc p where p.pronamespace = 'public'::regnamespace group by p.proname) t`;

function thoatLoi(thongBao) {
  console.error(thongBao);
  process.exit(2);
}

/* ---- 1. Bản mới nhất của từng hàm trong repo ---------------------------- */
const thuMuc = new URL("../supabase/migrations/", import.meta.url).pathname;
const mauHam = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z_0-9]+)"?\s*\(.*?\$([a-z_]*)\$(.*?)\$\2\$/gis;

// Tên hàm → { migration định nghĩa sau cùng, mã băm các thân hàm trong file đó }.
// Một tên có thể có nhiều overload (vd cpc1_run_save 5 và 6 tham số).
const banMoiNhat = new Map();
for (const tenFile of readdirSync(thuMuc).filter((f) => f.endsWith(".sql")).sort()) {
  const noiDung = readFileSync(join(thuMuc, tenFile), "utf8");
  const trongFile = new Map();
  for (const [, ten, , than] of noiDung.matchAll(mauHam)) {
    trongFile.set(ten, [...(trongFile.get(ten) ?? []), md5(than)]);
  }
  for (const [ten, cacMa] of trongFile) banMoiNhat.set(ten, { migration: tenFile, cacMa });
}

/* ---- 2. Mã băm trên production ------------------------------------------ */
async function layProduction() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (dbUrl) {
    const kq = spawnSync("psql", [dbUrl, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
      "-c", `begin read only; ${SQL_MA_BAM}; rollback;`], { encoding: "utf8" });
    if (kq.status !== 0) thoatLoi(`Không đọc được production qua psql: ${kq.stderr.trim()}`);
    const dongJson = kq.stdout.split("\n").find((dong) => dong.startsWith("{"));
    if (!dongJson) thoatLoi(`psql không trả JSON. Output: ${kq.stdout.slice(0, 300)}`);
    return { nguon: "psql", duLieu: JSON.parse(dongJson) };
  }
  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON;
  if (!url || !anon) thoatLoi("Cần SUPABASE_DB_URL, hoặc cặp VITE_SUPABASE_URL + VITE_SUPABASE_ANON.");
  const traLoi = await fetch(new URL("/rest/v1/rpc/rpc_schema_fingerprint", url), {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!traLoi.ok) {
    thoatLoi(`Gọi rpc_schema_fingerprint lỗi HTTP ${traLoi.status}: ${(await traLoi.text()).slice(0, 300)}\n`
      + "Nếu là 404: migration 20261016110000_schema_fingerprint.sql chưa được áp.");
  }
  return { nguon: "anon REST", duLieu: await traLoi.json() };
}

/* ---- 3. So sánh ---------------------------------------------------------- */
const { nguon, duLieu: production } = await layProduction();

const theoMigration = new Map();
for (const [ten, { migration, cacMa }] of banMoiNhat) {
  const nhom = theoMigration.get(migration) ?? { khop: 0, lech: [] };
  const maProd = new Set(production[ten] ?? []);
  if (!(ten in production)) nhom.lech.push(`${ten} (vắng)`);
  else if (!cacMa.every((ma) => maProd.has(ma))) nhom.lech.push(`${ten} (khác thân)`);
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
  ? `✓ ${banMoiNhat.size} hàm trong repo khớp production (đọc qua ${nguon}).`
  : `\n${soLech} migration chưa áp hoặc production đã bị sửa tay (đọc qua ${nguon}). Xem docs/runbooks/2026-10-16-ap-migration-ton-dong.md`);
process.exit(soLech === 0 ? 0 : 1);

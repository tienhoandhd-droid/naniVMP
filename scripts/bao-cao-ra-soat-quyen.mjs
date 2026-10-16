// =====================================================================
//  bao-cao-ra-soat-quyen.mjs — báo cáo rà soát quyền truy cập định kỳ
//  ---------------------------------------------------------------------
//  Cách dùng:
//    SUPABASE_DB_URL=... node scripts/bao-cao-ra-soat-quyen.mjs --out <file.csv>
//
//  Vì sao: EU GMP Annex 11 §12 yêu cầu rà soát định kỳ ai có quyền gì trên
//  hệ thống máy tính. Script xuất mỗi tài khoản một dòng — vai nghiệp vụ,
//  trạng thái, lần đăng nhập cuối, đã bật MFA chưa — kèm cột "Cần chú ý" để
//  QA ký duyệt hằng quý. CHỈ ĐỌC (`begin read only`).
//
//  File có email nhân sự (dữ liệu cá nhân) nên script TỪ CHỐI ghi vào trong
//  repo — repo GitHub đang public. Lưu ở thư mục hồ sơ QA.
// =====================================================================
import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const viTriOut = process.argv.indexOf("--out");
const out = viTriOut > -1 ? process.argv[viTriOut + 1] : undefined;
if (!out) {
  console.error("Cách dùng: node scripts/bao-cao-ra-soat-quyen.mjs --out <đường-dẫn.csv>");
  process.exit(2);
}
const goc = fileURLToPath(new URL("..", import.meta.url));
const tuongDoi = relative(goc, resolve(out));
if (!tuongDoi.startsWith("..") && !isAbsolute(tuongDoi)) {
  console.error(`Từ chối ghi vào trong repo (${tuongDoi}): file có email nhân sự, repo đang public.`);
  process.exit(2);
}
const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Thiếu biến SUPABASE_DB_URL.");
  process.exit(2);
}

const truyVan = `begin read only;
select coalesce(jsonb_agg(to_jsonb(r) order by r.vai nulls first, r.email), '[]'::jsonb) from (
  select p.email, p.full_name, p.department, p.title,
         public.vmp_business_role(p.id) as vai,
         p.is_active,
         public.vmp_is_active_session(p.id) as phien_hoat_dong,
         (u.last_sign_in_at at time zone 'Asia/Bangkok')::date as dang_nhap_cuoi,
         (current_date - (u.last_sign_in_at at time zone 'Asia/Bangkok')::date) as so_ngay_chua_dang_nhap,
         exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified') as da_bat_mfa,
         (p.created_at at time zone 'Asia/Bangkok')::date as ngay_tao
  from public.profiles p
  left join auth.users u on u.id = p.id
) r;
rollback;`;
const kq = spawnSync("psql", [dbUrl, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", truyVan], { encoding: "utf8" });
if (kq.status !== 0) {
  console.error("Không đọc được production:", kq.stderr.trim());
  process.exit(2);
}
const dongJson = kq.stdout.split("\n").find((dong) => dong.startsWith("["));
if (!dongJson) {
  console.error("psql không trả JSON. Output:", kq.stdout.slice(0, 300));
  process.exit(2);
}
// Không để thông báo lỗi của JSON.parse in kèm đoạn dữ liệu (có email).
let taiKhoan;
try {
  taiKhoan = JSON.parse(dongJson);
} catch (loi) {
  console.error(`Không đọc được JSON từ psql (${dongJson.length} ký tự) — ${loi.name}. Không in dữ liệu vì có email nhân sự.`);
  process.exit(2);
}

function canChuY(t) {
  const ly_do = [];
  if (!t.vai) ly_do.push("không có vai nghiệp vụ");
  if (t.phien_hoat_dong && t.dang_nhap_cuoi === null) ly_do.push("đang hoạt động nhưng chưa từng đăng nhập");
  if (t.phien_hoat_dong && t.so_ngay_chua_dang_nhap > 90) ly_do.push(`đang hoạt động nhưng ${t.so_ngay_chua_dang_nhap} ngày chưa đăng nhập`);
  if (t.phien_hoat_dong && t.vai === "admin" && !t.da_bat_mfa) ly_do.push("admin chưa bật MFA");
  return ly_do.join("; ");
}

const cot = [
  ["Email", (t) => t.email], ["Họ tên", (t) => t.full_name], ["Bộ phận", (t) => t.department],
  ["Chức danh", (t) => t.title], ["Vai nghiệp vụ", (t) => t.vai ?? ""],
  ["Phiên được phép", (t) => (t.phien_hoat_dong ? "Có" : "Không")],
  ["Đăng nhập cuối", (t) => t.dang_nhap_cuoi ?? "Chưa từng"],
  ["Đã bật MFA", (t) => (t.da_bat_mfa ? "Có" : "Không")], ["Ngày tạo", (t) => t.ngay_tao],
  ["Cần chú ý", canChuY], ["QA rà soát (ký/ngày)", () => ""],
];
const oCsv = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
const dong = [cot.map(([ten]) => oCsv(ten)).join(","), ...taiKhoan.map((t) => cot.map(([, lay]) => oCsv(lay(t))).join(","))];
// BOM để Excel mở đúng tiếng Việt.
writeFileSync(out, "﻿" + dong.join("\r\n") + "\r\n", { mode: 0o600 });

const soChuY = taiKhoan.filter((t) => canChuY(t)).length;
console.log(`Đã ghi ${taiKhoan.length} tài khoản → ${resolve(out)} (${soChuY} dòng cần chú ý).`);

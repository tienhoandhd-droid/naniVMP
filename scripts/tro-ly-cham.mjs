#!/usr/bin/env node
// Chấm bước "hiểu câu hỏi" của trợ lý VMP.
// Đầu vào: một hay nhiều file JSON kết quả execution n8n (Vani VMP 9, chạy thủ công
// với body.cau_hoi_lo — bậc miễn phí chỉ ~5 câu/phút nên phải chia lượt) và bộ câu
// tests/tro-ly/bo-cau-hoi.json. In từng câu sai, câu thiếu kết quả (AI bận) và tỉ lệ đúng.
//
//   node scripts/tro-ly-cham.mjs <execution.json>... [--noi-tiep]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const goc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fileKetQua = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const coNoiTiep = process.argv.includes("--noi-tiep");
if (fileKetQua.length === 0) {
  console.error("Thiếu đường dẫn file kết quả execution n8n.");
  process.exit(2);
}

const bo = JSON.parse(readFileSync(path.join(goc, "tests/tro-ly/bo-cau-hoi.json"), "utf8"));
const ra = fileKetQua.flatMap((f) => {
  const runData = JSON.parse(readFileSync(f, "utf8"))?.data?.resultData?.runData ?? {};
  return (runData["Kiểm kết quả AI"] ?? []).flatMap((run) => run?.data?.main?.[0] ?? []).map((it) => it.json);
});

const chuan = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
const khop = (thuc, mong) => typeof mong === "number" ? Number(thuc) === mong : chuan(thuc).includes(chuan(mong));

function cham(mau, kq) {
  const loi = [];
  if (!kq || kq.ok !== true) return [`không có kết quả hợp lệ (${kq?.loi ?? "thiếu"})`];
  const congCuDung = mau.cong_cu.split("|");
  if (!congCuDung.includes(kq.cong_cu)) loi.push(`công cụ ${kq.cong_cu}, cần ${mau.cong_cu}`);
  for (const [k, v] of Object.entries(mau.tham_so ?? {})) {
    if (!khop(kq.tham_so?.[k], v)) loi.push(`${k}=${JSON.stringify(kq.tham_so?.[k])}, cần ${JSON.stringify(v)}`);
  }
  if (mau.tham_so_mot_trong && congCuDung.includes(kq.cong_cu) && kq.cong_cu !== "tien_do") {
    const coMot = Object.entries(mau.tham_so_mot_trong).some(([k, v]) => khop(kq.tham_so?.[k], v));
    if (!coMot) loi.push(`thiếu một trong ${JSON.stringify(mau.tham_so_mot_trong)}, có ${JSON.stringify(kq.tham_so)}`);
  }
  return loi;
}

const danhSach = coNoiTiep ? bo.noi_tiep : bo.cau;
const theoCau = new Map(ra.map((r) => [r.cau_hoi, r]));
let dung = 0;
let dungCu = 0;
let tongCu = 0;
const thieu = [];
for (const mau of danhSach) {
  const kq = theoCau.get(mau.q);
  if (!kq) {
    thieu.push(mau.q);
    continue;
  }
  const loi = cham(mau, kq);
  if (mau.cu) tongCu += 1;
  if (loi.length === 0) {
    dung += 1;
    if (mau.cu) dungCu += 1;
  } else {
    console.log(`SAI  ${mau.q}\n     → ${loi.join("; ")}  [${kq?.mo_hinh ?? "?"}]`);
  }
}
if (thieu.length) console.log(`\nTHIẾU kết quả (AI bận/hết hạn mức, chưa chấm): ${thieu.length}\n  ${thieu.join("\n  ")}`);
const daCham = danhSach.length - thieu.length;
const moHinh = ra.reduce((m, r) => ({ ...m, [r.mo_hinh ?? "loi"]: (m[r.mo_hinh ?? "loi"] ?? 0) + 1 }), {});
console.log(`\nĐúng ${dung}/${daCham} câu đã chấm (${Math.round((dung * 100) / Math.max(daCham, 1))}%)` +
  (tongCu ? ` · câu Vali cũ sai: đúng ${dungCu}/${tongCu}` : "") + ` · mô hình: ${JSON.stringify(moHinh)}`);
process.exit(thieu.length === 0 && dung * 100 >= danhSach.length * 95 ? 0 : 1);

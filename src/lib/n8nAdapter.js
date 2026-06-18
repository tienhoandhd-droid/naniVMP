/* =====================================================================
 *  n8nAdapter.js — Cầu nối dữ liệu giữa WEBHOOK n8n và APP VMP Monitor
 *  ---------------------------------------------------------------------
 *  VẤN ĐỀ: App ban đầu chờ JSON dạng { objects:[...], activities:[...] }
 *          nhưng webhook n8n của bạn trả về { ok, count, rows:[...] }
 *          với tên trường khác hẳn (ma, ten, phan_loai, dl_vmp, ...).
 *
 *  GIẢI PHÁP: Module này NHẬN dữ liệu n8n và DỊCH sang mô hình app,
 *             đồng thời DỊCH ngược khi ghi (cập nhật trạng thái) về n8n.
 *
 *  => Nếu sau này bạn đổi giá trị cột trong Google Sheet, chỉ cần sửa
 *     các BẢNG ÁNH XẠ bên dưới (CLS_MAP, DEPT_MAP, normStatus...).
 * ===================================================================== */

/* ---------- Tiện ích ---------- */
const s = (v) => (v == null ? "" : String(v)).trim();
const lc = (v) => s(v).toLowerCase();

// Chuẩn hoá ngày -> "yyyy-mm-dd" (app dùng định dạng này).
// Hỗ trợ: dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, và chuỗi ISO có giờ.
export function toISO(v) {
  const t = s(v);
  if (!t) return "";
  // yyyy-mm-dd hoặc yyyy/mm/dd (đã đúng thứ tự năm trước)
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  // dd/mm/yyyy hoặc dd-mm-yyyy (kiểu Việt Nam)
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  // Thử Date() cho các định dạng khác
  const d = new Date(t);
  if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return "";
}

function parseDate(v) {
  const iso = toISO(v);
  if (!iso) return null;
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, mo - 1, d);
}

/* ---------- BẢNG ÁNH XẠ (sửa ở đây nếu Sheet của bạn dùng giá trị khác) ---------- */

// Phân loại đối tượng -> nhóm app: tb | qt | kho | ht | vc
function mapClass(phanLoai) {
  const x = lc(phanLoai);
  if (/thiết bị|thiet bi|equipment|máy|may/.test(x)) return "tb";
  if (/quy trình|quy trinh|process|sop|công đoạn|cong doan/.test(x)) return "qt";
  if (/kho|warehouse|storage|bảo quản|bao quan/.test(x)) return "kho";
  if (/hệ thống|he thong|phụ trợ|phu tro|hvac|utility|khí|khi|nước|nuoc|điều hòa|dieu hoa/.test(x)) return "ht";
  if (/vận chuyển|van chuyen|transport|logistics|cold chain|chuỗi lạnh|chuoi lanh/.test(x)) return "vc";
  return "tb"; // mặc định
}

// Bộ phận quản lý -> phòng app: sx | cd | kho | rd | qa
// (Giá trị thật trong Sheet: XSX, Kho, RD, QA, Cơ điện, "XSX, Kho"…)
function mapDept(boPhan) {
  const x = lc(boPhan);
  if (/xsx|sản xuất|san xuat|xưởng|xuong|production|\bsx\b/.test(x)) return "sx";
  if (/cơ điện|co dien|mep|kỹ thuật|ky thuat|engineering|cđ|\bcd\b/.test(x)) return "cd";
  if (/\bkho\b|warehouse/.test(x)) return "kho";
  if (/\brd\b|r&d|r & d|nghiên cứu|nghien cuu|research|qc|kiểm nghiệm|kiem nghiem|lab/.test(x)) return "qc";
  if (/\bqa\b|qlcl|đảm bảo|dam bao|quality assurance|chất lượng|chat luong/.test(x)) return "qa";
  return "qa"; // mặc định
}

// Suy ra MỨC RỦI RO từ "Phân loại báo cáo" (dùng cho view QRM khi Sheet
// chưa có cột mức tới hạn riêng). Vô khuẩn/Nhiễm khuẩn = rủi ro cao nhất.
function critFromReportClass(v) {
  const x = lc(v);
  if (/vô khuẩn|vo khuan|sterile|aseptic/.test(x)) return "Cao";
  if (/nhiễm khuẩn|nhiem khuan|microbial|micro/.test(x)) return "Cao";
  if (/hóa lý|hoa ly|physico|chemical/.test(x)) return "TB";
  if (/không phụ thuộc|khong phu thuoc|độc lập|doc lap|independent/.test(x)) return "Thấp";
  return "TB";
}

// "Điểm trọng yếu" là điểm số 1–9 (càng cao càng tới hạn) -> Cao/TB/Thấp.
function critFromScore(v) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return null;
  if (n >= 7) return "Cao";
  if (n >= 4) return "TB";
  return "Thấp";
}

// Chuẩn hoá trạng thái 1 cột -> done | prog | todo | "" (rỗng = chưa có)
// Nhận diện cả chữ tiếng Việt (Sheet) lẫn enum Supabase (not_started/in_progress/
// completed/overdue).
function normStatus(v) {
  const x = lc(v);
  if (!x) return "";
  // XÉT PHỦ ĐỊNH TRƯỚC: "chưa hoàn thành", "không đạt", not_started… KHÔNG phải done.
  const neg = /\b(chưa|chua|không|khong)\b/.test(x) || /^\s*(chưa|chua|không|khong)/.test(x) || /not[_\s-]?started/.test(x);
  if (!neg && /hoàn thành|hoan thanh|done|đạt|dat|complete|completed|✓|✔|100|xong|ok\b/.test(x)) return "done";
  if (!neg && /đang|dang|progress|in[_\s-]?progress|thực hiện|thuc hien|wip/.test(x)) return "prog";
  if (neg || /todo|chờ|cho\b|pending|kế hoạch|ke hoach|plan/.test(x)) return "todo";
  return ""; // không nhận diện được -> coi như rỗng
}

/* ---------- Suy ra trạng thái tổng (st) của 1 hạng mục ----------
 *  Ưu tiên: trạng thái VMP > quá hạn theo ngày > đang thực hiện > kế hoạch/chưa.
 *  st ∈ done | prog | over | todo | plan  (khớp với STATUS trong App.jsx)
 */
function deriveSt(row, today) {
  const vmp = normStatus(row.tt_vmp);
  if (vmp === "done") return "done";

  const target = parseDate(row.dl_vmp);
  const stages = [normStatus(row.tt_de_cuong), normStatus(row.tt_tham_dinh), normStatus(row.tt_bao_cao)];
  const anyDone = stages.some((v) => v === "done");
  const anyProg = stages.some((v) => v === "prog") || vmp === "prog";

  // Quá hạn: đã tới/qua mốc Deadline VMP mà chưa hoàn thành.
  if (target && target < today) return "over";
  if (anyProg || anyDone) return "prog";

  // Chưa bắt đầu: nếu deadline đề cương còn xa (>30 ngày) coi là "kế hoạch".
  const proto = parseDate(row.dl_de_cuong);
  const SOON = 30 * 86400000;
  if (proto && proto - today > SOON) return "plan";
  return "todo";
}

/* =====================================================================
 *  ĐỌC: webhook n8n  ->  { objects, activities } cho app
 * ===================================================================== */
export function adaptFromN8n(payload) {
  // Webhook n8n có thể trả về MẢNG (tuỳ cấu hình node Respond) → tự bóc cho đúng.
  if (Array.isArray(payload)) {
    if (payload.length && payload[0] && Array.isArray(payload[0].rows)) payload = payload[0];   // [{ ok, count, rows }]
    else payload = { rows: payload };                                                            // [ {dòng}, {dòng}, ... ]
  }
  // Tương thích ngược: nếu đã đúng định dạng app thì trả về luôn.
  if (payload && (Array.isArray(payload.objects) || Array.isArray(payload.activities))) {
    return {
      objects: payload.objects || [],
      activities: payload.activities || [],
      source: "native",
    };
  }

  const rows = (payload && Array.isArray(payload.rows)) ? payload.rows : [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const objMap = new Map();   // ma -> object (gộp trùng)
  const activities = [];

  for (const r of rows) {
    const code = s(r.ma);
    if (!code) continue;
    // Bỏ qua dòng CHÚ THÍCH lẫn trong vùng dữ liệu: cột số (điểm trọng yếu /
    // số ngày công) của dữ liệu thật luôn là số; nếu chứa chữ (vd "Gốc",
    // "Dashboard") thì đó là nhãn phân vùng → loại để không tạo hạng mục rác.
    if (/[a-zà-ỹ]/i.test(s(r.diem_trong_yeu)) || /[a-zà-ỹ]/i.test(s(r.so_ngay_cong))) continue;

    // --- Object (gộp theo mã đối tượng) ---
    const need = normStatus(r.td) === "done" || /^(x|y|yes|có|co)$/.test(lc(r.td)) || lc(r.show) === "x" || !!s(r.dl_vmp);
    const score = parseInt(r.diem_trong_yeu, 10);
    const effort = parseFloat(r.so_ngay_cong);
    const crit = critFromScore(r.diem_trong_yeu) || critFromReportClass(r.phan_loai_bc);
    if (!objMap.has(code)) {
      objMap.set(code, {
        code,
        name: s(r.ten) || code,
        cls: mapClass(r.phan_loai),
        dept: mapDept(r.bo_phan),
        area: s(r.khu_vuc) || "—",
        line: s(r.line) || "—",
        grade: isNaN(score) ? "—" : String(score),  // điểm trọng yếu 1–9
        gxp: "GxP",
        crit,
        freq: parseInt(r.tan_suat, 10) || 12,
        need,
        reason: "",
      });
    } else {
      // Một số cột đối tượng chỉ điền ở dòng đầu nhóm (ô gộp) → lấp từ dòng sau.
      const o = objMap.get(code);
      if ((!o.name || o.name === code) && s(r.ten)) o.name = s(r.ten);
      if (o.cls === "tb" && s(r.phan_loai)) o.cls = mapClass(r.phan_loai);
      if (o.area === "—" && s(r.khu_vuc)) o.area = s(r.khu_vuc);
      if (critFromScore(r.diem_trong_yeu)) o.crit = critFromScore(r.diem_trong_yeu);
      else if (s(r.phan_loai_bc)) o.crit = critFromReportClass(r.phan_loai_bc);
    }

    // --- Activity (mỗi dòng Sheet = 1 hạng mục thẩm định) ---
    const id = s(r.id) || `${code}/${s(r.loai_td) || "TD"}`;
    activities.push({
      id,
      code,
      vtype: (s(r.loai_td) || "PQ").toUpperCase(),
      dep: s(r.phan_loai_bc) || "Không phụ thuộc", // dùng để tính mốc T-5-BC
      owner: s(r.qa) || s(r.ns_khac) || "—",
      effort: isNaN(effort) ? null : effort,        // số ngày công thực tế (1–5)
      score: isNaN(score) ? null : score,           // điểm trọng yếu (1–9)
      crit,
      target: toISO(r.dl_vmp) || toISO(r.dl_bao_cao) || "",
      st: deriveSt(r, today),
      docDone: normStatus(r.tt_bao_cao) === "done",
      // giữ lại dữ liệu gốc để ghi ngược chính xác:
      _raw: r,
    });
  }

  // Giữ TẤT CẢ hạng mục (kể cả chưa có deadline) — đánh dấu thiếu deadline.
  // Trước đây: activities.filter((a) => a.target) — bỏ mất hạng mục chưa điền deadline!
  const acts = activities;

  return {
    objects: Array.from(objMap.values()),
    activities: acts,
    source: "n8n",
    count: rows.length,
  };
}

/* Tính lại các trường suy diễn (st, docDone, target) cho 1 hạng mục sau khi
 * người dùng sửa dữ liệu gốc trên web — để giao diện cập nhật ngay tức thì. */
export function deriveActivityFields(raw) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    st: deriveSt(raw, today),
    docDone: normStatus(raw.tt_bao_cao) === "done",
    target: toISO(raw.dl_vmp) || toISO(raw.dl_bao_cao) || "",
  };
}

/* =====================================================================
 *  GHI: hành động trên app  ->  payload cho webhook n8n (vmp-write)
 *  n8n hiện hỗ trợ: action="ping" và action="updateRow" {id, patch:{...}}
 *  patch nhận: ngay_de_cuong, tt_de_cuong, lich_td, ngay_tham_dinh,
 *              tt_tham_dinh, ngay_bao_cao, tt_bao_cao, ngay_vmp, tt_vmp
 * ===================================================================== */
export function buildPing() {
  return { action: "ping", ts: Date.now() };
}

// Cập nhật trạng thái/ngày của 1 hạng mục theo ID (đúng chuẩn n8n updateRow).
export function buildUpdateRow(id, patch, user) {
  return {
    action: "updateRow",
    id,
    user: user || "",
    ts: new Date().toISOString(),
    patch: patch || {},
  };
}

/* ---------- Cache thông minh — giảm tải webhook khi 10 người dùng đồng thời ----------
 *  Lưu kết quả vào localStorage với TTL 2 phút. Khi bấm "Làm mới" → force=true bỏ cache.
 *  10 người mở cùng lúc: chỉ 1 request thật, 9 người còn lại lấy cache → nhanh + nhẹ.
 */
const CACHE_KEY = "vmp_cache";
const CACHE_TTL = 2 * 60 * 1000; // 2 phút

function getCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(CACHE_KEY); return null; }
    return data;
  } catch { return null; }
}
function setCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch { /* quota full */ }
}

export async function fetchVmpData(readUrl, force = false) {
  // Cache: trả dữ liệu cũ nếu còn hạn + không bấm "Làm mới"
  if (!force) { const cached = getCache(); if (cached) return cached; }

  // Gọi webhook thật (cache-bust để n8n/CDN trả bản mới nhất)
  const bust = (readUrl.includes("?") ? "&" : "?") + "_t=" + Date.now();
  const res = await fetch(readUrl + bust, { method: "GET", cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const json = await res.json();
  const result = adaptFromN8n(json);
  setCache(result); // Lưu cache cho lần sau
  return result;
}

// Xoá cache (khi logout hoặc đổi kết nối)
export function clearVmpCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

// Gửi dữ liệu tới n8n webhook (có JWT auth nếu có token)
export async function postToN8n(writeUrl, payload, authToken) {
  const headers = { "Content-Type": "application/json" };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  const res = await fetch(writeUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  return res;
}

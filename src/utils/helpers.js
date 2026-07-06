/* =====================================================================
 *  utils/helpers.js — Pure utility functions (no React dependency)
 * ===================================================================== */
import { DEP_DAYS, SOON_DAYS, vmpToday, PROG } from "../constants/vmp.js";

// ======================== DATE HELPERS ========================
export const parseD = (s) => {
  if (!s) return null;
  const [y, m, d] = String(s).split("-").map(Number);
  if (!y) return null;
  return new Date(y, (m || 1) - 1, d || 1);
};

export const addDays = (date, n) => {
  const x = new Date(date);
  x.setDate(x.getDate() + n);
  return x;
};

export const addMonths = (date, n) => {
  const x = new Date(date);
  x.setMonth(x.getMonth() + n);
  return x;
};

export const fmtVN = (date) => {
  if (!date || isNaN(date)) return "—";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
};

export const daysBetween = (a, b) => Math.round((a - b) / 86400000);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ======================== DISPLAY HELPER ========================
// Ô trống / null / "—"  →  "Không có thông tin" (CHỈ dùng cho HIỂN THỊ).
// KHÔNG dùng cho dữ liệu tính toán (ngày, trạng thái, tỷ lệ) — sẽ phá logic.
export const NO_INFO = "Không có thông tin";
export const txt = (v) => {
  const s = String(v == null ? "" : v).trim();
  return (s === "" || s === "—") ? NO_INFO : v;
};

// S1-C FIX: pctYear tính lại YS/YE mỗi lần gọi (không đông cứng theo năm load)
export const pctYear = (date) => {
  const today = vmpToday();
  const yr = today.getFullYear();
  const YS = new Date(yr, 0, 1);
  const YE = new Date(yr, 11, 31);
  return clamp(((date - YS) / (YE - YS)) * 100, 0, 100);
};

// ======================== MILESTONE CALCULATION ========================
export function milestones(act) {
  const T = parseD(act.target);
  if (!T) return { protocol: null, validation: null, report: null, target: null };
  const dep = DEP_DAYS[act.dep] != null ? DEP_DAYS[act.dep] : 2;
  return {
    protocol: addDays(T, -60),
    validation: addDays(T, -5 - dep),
    report: addDays(T, -5),
    target: T,
  };
}

export function phaseStates(act) {
  const m = milestones(act);
  const past = (d) => d && d < vmpToday();

  if (act.st === "done") return { p: "done", v: "done", r: "done", m };
  if (act.st === "over") return {
    p: "done", v: "over",
    r: past(m.report) ? "over" : "future", m,
  };
  if (act.st === "prog") return {
    p: "done", v: past(m.validation) ? "over" : "current",
    r: "future", m,
  };
  if (act.st === "todo") return {
    p: past(m.protocol) ? "over" : (past(addDays(m.protocol, -SOON_DAYS)) ? "current" : "future"),
    v: "future", r: "future", m,
  };
  return { p: "future", v: "future", r: "future", m };
}

export function nextAlert(act) {
  if (act.st === "done" || !act.target) return null;
  const m = milestones(act);
  let stage, date;
  if (act.st === "over" || act.st === "prog") {
    stage = "Thẩm định"; date = m.validation;
  } else {
    stage = "Đề cương"; date = m.protocol;
  }
  if (!date) return null;
  const dleft = daysBetween(date, vmpToday());
  let kind = null;
  if (dleft < 0) kind = "over";
  else if (dleft <= SOON_DAYS) kind = "soon";
  return { stage, date, dleft, kind };
}

// ======================== STATUS HELPERS ========================
// QUAN TRỌNG: nhận diện CẢ chữ tiếng Việt (Google Sheet) LẪN giá trị enum của
// Supabase. Bảng vmp_plan_items dùng kiểu phase_status =
//   not_started | in_progress | completed | overdue
// nên RPC trả về _raw.tt_* là các chuỗi tiếng Anh này. Nếu chỉ khớp tiếng Việt
// thì "completed" sẽ KHÔNG được coi là hoàn thành → sai tỷ lệ hồ sơ, sai giai đoạn.
const RE_NEG  = /\b(chưa|chua|không|khong)\b|^\s*(chưa|chua|không|khong)|not[_\s-]?started/;
const RE_DONE = /hoàn thành|hoan thanh|done|đạt|dat|complete|completed|✓|✔|100|xong/;
const RE_PROG = /đang|dang|progress|in[_\s-]?progress|thực hiện|thuc hien|wip/;

const _neg = (v) => RE_NEG.test(String(v == null ? "" : v).toLowerCase());

export const wlIsDone = (v) => {
  const s = String(v == null ? "" : v).toLowerCase();
  return !_neg(v) && RE_DONE.test(s);
};

// "Không tiến hành / Không thực hiện" = hạng mục BỎ, sẽ không làm → không tính
// ngày công & hồ sơ. Phân biệt với "Chưa …" (chưa làm nhưng SẼ làm → vẫn tính).
const RE_SKIP = /không\s*(tiến hành|thực hiện)|khong\s*(tien hanh|thuc hien)/;
export const isSkipped = (a) => {
  const r = (a && a._raw) || {};
  return RE_SKIP.test(String(r.tt_tham_dinh ?? "").toLowerCase())
    || RE_SKIP.test(String(r.tt_vmp ?? "").toLowerCase());
};

const _progTxt = (v) => {
  const s = String(v == null ? "" : v).toLowerCase();
  return !_neg(v) && RE_PROG.test(s);
};

export function stageOf(a) {
  const r = a._raw || {};
  if (a.st === "done" || wlIsDone(r.tt_vmp)) return "done";
  const dc = wlIsDone(r.tt_de_cuong);
  const td = wlIsDone(r.tt_tham_dinh);
  const bc = wlIsDone(r.tt_bao_cao);
  if (bc || _progTxt(r.tt_bao_cao)) return "bc";
  if (td) return "cho_bc";
  if (_progTxt(r.tt_tham_dinh)) return "dang_td";
  if (dc) return "cho_td";
  if (_progTxt(r.tt_de_cuong)) return "dang_dc";
  return "chua";
}

// ======================== ENRICHMENT ========================
export function enrich(objects, acts) {
  const map = Object.fromEntries(objects.map((o) => [o.code, o]));
  return acts.map((a) => {
    const o = map[a.code] || {};
    const raw = a._raw || {};
    const valDone = a.st === "done" || wlIsDone(raw.tt_tham_dinh);
    const docPending = !a.docDone && !wlIsDone(raw.tt_bao_cao);
    const mismatch = valDone && docPending
      ? "val_done_doc_pending"
      : (!valDone && a.docDone) ? "doc_done_val_pending" : null;

    return {
      ...a,
      name: o.name || a.code,
      cls: o.cls || "tb",
      dept: o.dept || "qa",
      area: o.area || "—",
      crit: o.crit || "TB",
      freq: o.freq || 12,
      m: milestones(a),
      alert: (a.state && a.state !== "active") ? null : nextAlert(a),
      prog: PROG[a.st],
      mismatch,
    };
  });
}

// ======================== TALLY FUNCTIONS ========================
export function tally(acts) {
  // Loại hạng mục Không áp dụng/Đã hủy khỏi ĐẾM KPI (chỉ tính item_state='active').
  const A = acts.filter((a) => (a.state || "active") === "active");
  const done = A.filter((a) => a.st === "done").length;
  const over = A.filter((a) => a.st === "over").length;
  return {
    done, over,
    todo: A.length - done - over,
    total: A.length,
    rate: A.length ? Math.round((done / A.length) * 100) : 0,
  };
}

export function docTally(acts) {
  // Loại Không áp dụng/Đã hủy khỏi đếm hồ sơ.
  const A = acts.filter((a) => (a.state || "active") === "active");
  // "Hồ sơ" trên dashboard tương ứng cột trạng thái báo cáo. Đề cương là
  // một KPI riêng, vì vậy không buộc cả đề cương + báo cáo cùng hoàn thành.
  const isDocDone = (a) => {
    const r = a._raw || {};
    return wlIsDone(r.tt_bao_cao);
  };
  const done = A.filter(isDocDone).length;
  const over = A.filter((a) => {
    if (isDocDone(a)) return false;
    const r = a._raw || {};
    const dlBc = parseD(r.dl_bao_cao || "") || parseD(r.dl_vmp || "");
    return dlBc && dlBc < vmpToday();
  }).length;
  const total = A.length;
  return {
    done, over,
    todo: total - done - over,
    total,
    rate: total ? Math.round((done / total) * 100) : 0,
  };
}

// ======================== PERIOD FILTER ========================
export function inPeriod(a, period) {
  if (period === "all") return true;
  if (!a.target) return false;
  const parts = String(a.target).split("-").map(Number);
  const y = parts[0], m = parts[1];
  const today = vmpToday();
  const ty = today.getFullYear(), tm = today.getMonth() + 1;
  if (period === "thang") return y === ty && m === tm;
  if (period === "quy") return y === ty && Math.floor((m - 1) / 3) === Math.floor((tm - 1) / 3);
  if (period === "sixm") { const diff = (y - ty) * 12 + (m - tm); return diff >= 0 && diff < 6; }
  if (period === "nam") return y === ty;
  return true;
}

// ======================== DATA QUALITY CHECKS ========================
export function runDataQualityChecks(acts) {
  const issues = [];
  const seenIds = new Set();

  for (const a of acts) {
    const r = a._raw || {};

    // 1. Thiếu mã đối tượng
    if (!a.code) {
      issues.push({ type: "missing_code", severity: "error", id: a.id, msg: `Hạng mục "${a.id}" thiếu mã đối tượng` });
    }

    // 2. Trùng ID
    if (seenIds.has(a.id)) {
      issues.push({ type: "duplicate_id", severity: "error", id: a.id, msg: `ID "${a.id}" bị trùng` });
    }
    seenIds.add(a.id);

    // 3. Deadline < ngày bắt đầu
    if (a.target && r.ngay_de_cuong) {
      const dl = parseD(a.target);
      const start = parseD(r.ngay_de_cuong);
      if (dl && start && dl < start) {
        issues.push({ type: "deadline_before_start", severity: "warning", id: a.id, msg: `Deadline VMP (${a.target}) trước ngày đề cương (${r.ngay_de_cuong})` });
      }
    }

    // 4. Trạng thái hoàn thành nhưng thiếu ngày
    if (a.st === "done" && !r.ngay_vmp) {
      issues.push({ type: "done_no_date", severity: "warning", id: a.id, msg: `Trạng thái "Hoàn thành" nhưng thiếu ngày hoàn thành VMP` });
    }

    // 5. Có ngày hoàn thành nhưng trạng thái chưa done
    if (r.ngay_vmp && wlIsDone(r.tt_vmp) === false && a.st !== "done") {
      issues.push({ type: "date_no_done", severity: "info", id: a.id, msg: `Có ngày VMP nhưng trạng thái chưa "Hoàn thành"` });
    }

    // 6. Thiếu email QA
    if (a.owner && a.owner !== "—" && !r.email_qa) {
      issues.push({ type: "owner_no_email", severity: "info", id: a.id, msg: `QA "${a.owner}" chưa có email — không nhận được cảnh báo` });
    }

    // 7. Thiếu loại thẩm định
    if (!a.vtype || a.vtype === "TD") {
      issues.push({ type: "no_validation_type", severity: "warning", id: a.id, msg: `Hạng mục chưa xác định loại thẩm định (IQ/OQ/PQ/CV)` });
    }

    // 8. Điểm trọng yếu cao nhưng chưa có kế hoạch
    if (a.score >= 7 && a.st === "plan") {
      issues.push({ type: "high_crit_no_plan", severity: "warning", id: a.id, msg: `Điểm trọng yếu ${a.score}/9 (Cao) nhưng vẫn ở trạng thái "Kế hoạch"` });
    }
  }

  return issues;
}

// ======================== REPORT HTML BUILDER ========================
export function buildReportHTML(period, scopeLabel, e, d, deptRows, overdueList, ai) {
  const now = new Date();
  const disclaimer = "BẢN NHÁP AI — Cần QA xác nhận trước khi phát hành";
  return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8">
<title>Báo cáo VMP — CPC1 HN</title>
<style>
  body{font-family:'Segoe UI',system-ui,sans-serif;max-width:900px;margin:auto;padding:40px 30px;color:#2d2d2d;line-height:1.7}
  h1{color:#B43A6E;border-bottom:3px solid #EE7BA9;padding-bottom:12px}
  h2{color:#6B4DB3;margin-top:32px;border-left:4px solid #8E6FD0;padding-left:12px}
  table{width:100%;border-collapse:collapse;margin:16px 0}
  th,td{border:1px solid #ddd;padding:10px 14px;text-align:center}
  th{background:#FCE3EF;color:#B43A6E;font-weight:700}
  .badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700}
  .done{background:#DBF3EA;color:#1A7058} .over{background:#FCE2E9;color:#BE3357}
  .footer{margin-top:40px;padding:16px;background:#FFF5FA;border-radius:12px;font-size:13px;color:#6E4869}
  .ai-box{background:#FDEEF6;border-left:4px solid #EE7BA9;padding:18px 22px;border-radius:0 12px 12px 0;margin:16px 0;white-space:pre-wrap}
  .stamp{background:#FCE2E9;color:#BE3357;padding:6px 14px;border-radius:8px;font-weight:800;font-size:13px;display:inline-block;margin-bottom:12px}
</style></head><body>
<h1>BÁO CÁO TIẾN ĐỘ THẨM ĐỊNH — CPC1 HÀ NỘI</h1>
<p><b>Kỳ:</b> ${period} · <b>Phạm vi:</b> ${scopeLabel} · <b>Ngày chốt:</b> ${fmtVN(now)} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}</p>
<p><b>Đơn vị:</b> V/Q Team — QLCL · <b>Nguồn:</b> Supabase (đồng bộ từ Google Sheet qua n8n)</p>

<h2>1. Tổng quan KPI</h2>
<table>
<tr><th>Nhóm</th><th>Hoàn thành</th><th>Quá hạn</th><th>Chưa HT</th><th>Tổng</th><th>Tỷ lệ</th></tr>
<tr><td><b>Thẩm định thực tế</b></td><td class="done">${e.done}</td><td class="over">${e.over}</td><td>${e.todo}</td><td>${e.total}</td><td><b>${e.rate}%</b></td></tr>
<tr><td><b>Hoàn thiện hồ sơ</b></td><td class="done">${d.done}</td><td class="over">${d.over}</td><td>${d.todo}</td><td>${d.total}</td><td><b>${d.rate}%</b></td></tr>
</table>

<h2>2. Chi tiết theo Bộ phận</h2>
<table>
<tr><th>Bộ phận</th><th>HT</th><th>QH</th><th>Chưa</th><th>Tổng</th><th>Tỷ lệ</th></tr>
${deptRows.map(r => `<tr><td>${r.name}</td><td>${r.done}</td><td>${r.over}</td><td>${r.todo}</td><td>${r.total}</td><td><b>${r.rate}%</b></td></tr>`).join("")}
</table>

<h2>3. Hạng mục Quá hạn (${overdueList.length})</h2>
${overdueList.length ? `<table><tr><th>ID</th><th>Tên</th><th>Mốc</th><th>Trễ</th></tr>
${overdueList.map(o => `<tr><td>${o.id}</td><td>${o.name}</td><td>${o.stage}</td><td class="over">${Math.abs(o.dleft)} ngày</td></tr>`).join("")}</table>` : "<p>Không có hạng mục quá hạn.</p>"}

<h2>4. Nhận xét & Đánh giá (AI)</h2>
<div class="stamp">${disclaimer}</div>
<div class="ai-box">${ai || "(Chưa tạo nhận xét AI)"}</div>

<h2>5. QA Review & Xác nhận</h2>
<table>
<tr><td style="width:50%"><b>Người lập:</b> ........................</td><td><b>Người xác nhận (QA):</b> ........................</td></tr>
<tr><td><b>Ngày:</b> ....../....../20......</td><td><b>Ngày:</b> ....../....../20......</td></tr>
<tr><td><b>Chữ ký:</b></td><td><b>Chữ ký:</b></td></tr>
</table>

<div class="footer">
<b>Audit:</b> Snapshot tạo lúc ${now.toISOString()} · Template v2.0 · Hệ thống VMP Monitor CPC1 HN<br/>
<b>Lưu ý:</b> Số liệu được chốt tại thời điểm tạo báo cáo. Mọi thay đổi sau thời điểm này không ảnh hưởng đến báo cáo đã phát hành.
</div>
</body></html>`;
}

// ======================== DOWNLOAD HELPER ========================
export function download(filename, content, mime = "text/html") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ======================== INVENTORY STATUS ========================
export function objStatus(code, acts) {
  const list = acts.filter((a) => a.code === code);
  if (!list.length) return "plan";
  if (list.some((a) => a.st === "over")) return "over";
  if (list.every((a) => a.st === "done")) return "done";
  if (list.some((a) => a.st === "prog")) return "prog";
  return "todo";
}

// ======================== QRM HELPERS ========================
export function valStatus(a) {
  return a.st === "over" ? "Quá hạn" : a.st === "done" ? "Đạt" : "Chưa/Đang";
}

// ======================== WORKLOAD HELPERS ========================
export const wlMonthOf = (a) => {
  if (!a.target) return -1;
  const m = Number(String(a.target).split("-")[1]);
  return (m >= 1 && m <= 12) ? m - 1 : -1;
};

export const wlScore = (a) => {
  const s = Number(a.score);
  if (!isNaN(s) && s > 0) return s;
  return a.crit === "Cao" ? 8 : a.crit === "TB" ? 5 : 2;
};

export function wlPending(a) {
  if (a.st === "done") return { p: false, v: false, r: false };
  const raw = a._raw || {};
  return { p: !wlIsDone(raw.tt_de_cuong), v: !wlIsDone(raw.tt_tham_dinh), r: !wlIsDone(raw.tt_bao_cao) };
}

export function congConLai(a) {
  if (a.st === "done" || isSkipped(a)) return 0; // xong hoặc không thực hiện → 0 ngày công
  const e = Number(a.effort);
  return (!isNaN(e) && e > 0) ? e : 0;
}

export const hoSoConLai = (a) => a.st !== "done" && !isSkipped(a) && !wlIsDone((a._raw || {}).tt_bao_cao);

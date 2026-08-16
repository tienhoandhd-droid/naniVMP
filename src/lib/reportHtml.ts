/* =====================================================================
 *  lib/reportHtml.ts — Bản in PDF/HTML cho Báo cáo quản lý (2026-07-30)
 *  ---------------------------------------------------------------------
 *  Thay cho buildReportHTML cũ trong utils/helpers.ts (chỉ có 1 KPI table
 *  + nhận xét AI). Bản mới in đủ 5 mục người dùng yêu cầu + biểu đồ SVG +
 *  chất lượng dữ liệu + dữ liệu thô rút gọn. Đặt ở lib/ riêng (không phải
 *  helpers.ts) để tránh vòng import: file này cần các KIỂU từ
 *  reportModel.ts, mà reportModel.ts lại import hàm thuần từ helpers.ts.
 * ===================================================================== */
import { fmtVN } from "../utils/helpers.ts";
import { LOAI_LOI, SEV, sevOf } from "../constants/vmp.ts";
import { svgMonthlyTargetChart, svgDeptBottleneckChart, svgDeptWorkloadChart, deptColorMap, EXPORT_PALETTE } from "./reportCharts.ts";
import type { YtdSummary, CurrentMonthSummary, DeptBottleneckRow, NextMonthWork } from "./reportModel.ts";

export interface QualityIssueLike { type: string; severity: string; id: string; msg: string }

export interface ManagementReportInput {
  scopeLabel: string;
  ytd: YtdSummary;
  monthly: CurrentMonthSummary;
  bottleneck: DeptBottleneckRow[];
  nextMonth: NextMonthWork;
  quality: QualityIssueLike[];
  ai?: string;
}

const esc = (s: unknown): string =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function pctBadge(rate: number): string {
  const cls = rate >= 80 ? "good" : rate >= 50 ? "mid" : "bad";
  return `<span class="badge ${cls}">${rate}%</span>`;
}

export function buildManagementReportHTML(d: ManagementReportInput): string {
  const now = new Date();
  const disclaimer = "BẢN NHÁP AI — Cần QA xác nhận trước khi phát hành";
  const dept = deptColorMap(EXPORT_PALETTE);

  const monthlyChart = svgMonthlyTargetChart(d.monthly.table, EXPORT_PALETTE, d.monthly.highlight);
  const bottleneckChart = d.bottleneck.length ? svgDeptBottleneckChart(d.bottleneck, EXPORT_PALETTE) : "";
  const workloadChart = d.nextMonth.byDept.length ? svgDeptWorkloadChart(d.nextMonth.byDept, dept, EXPORT_PALETTE) : "";

  const bySeverity = { error: 0, warning: 0, info: 0 } as Record<string, number>;
  for (const q of d.quality) bySeverity[q.severity] = (bySeverity[q.severity] || 0) + 1;
  const topIssues = d.quality.slice(0, 15);

  const stageRows = d.ytd.byStage.map((s) =>
    `<tr><td style="text-align:left">${esc(s.label)}</td><td>${s.count}</td></tr>`).join("");

  const KY_LABEL = { da_qua: "Đã qua", dang_dien_ra: "Đang diễn ra", chua_toi: "Chưa tới kỳ" };
  const monthTableRows = d.monthly.table.map((r) => {
    // Không chấm đạt/trượt cho kỳ chưa xảy ra — chỉ nêu khối lượng sắp tới.
    const soSanh = r.phase === "chua_toi" ? "—"
      : r.rate == null ? "Chưa có hạng mục"
        : r.phase === "dang_dien_ra" ? `${r.meets ? "Tạm đạt" : "Tạm dưới"} (giữa kỳ)`
          : (r.meets ? "Đạt" : "Chưa đạt");
    return `<tr>
    <td>T${r.month}</td>
    <td>${KY_LABEL[r.phase]}</td>
    <td>${r.due}</td>
    <td>${r.done}</td>
    <td>${r.phase === "chua_toi" || r.rate == null ? "—" : pctBadge(r.rate)}</td>
    <td>${soSanh}</td>
  </tr>`;
  }).join("");

  const bottleneckRows = d.bottleneck.map((r) => `<tr>
    <td style="text-align:left">${esc(r.label)}</td><td>${r.total}</td>
    <td class="${r.overProtocol ? "over" : ""}">${r.overProtocol}</td>
    <td class="${r.overValidation ? "over" : ""}">${r.overValidation}</td>
    <td class="${r.overReport ? "over" : ""}">${r.overReport}</td>
    <td>${r.onTimeRate}%</td>
  </tr>`).join("");

  const nextMonthRows = d.nextMonth.items.slice(0, 60).map((it) => `<tr>
    <td style="text-align:left">${esc(it.code)}</td><td style="text-align:left">${esc(it.name)}</td>
    <td>${esc(it.depts.join("+"))}</td><td>${esc(it.owner)}</td><td>${esc(it.target)}</td><td>${esc(it.crit)}</td>
  </tr>`).join("");
  const nextMonthTruncated = d.nextMonth.items.length > 60
    ? `<p style="font-size:12px;color:#6E4869">… và ${d.nextMonth.items.length - 60} hạng mục khác — xem đầy đủ ở bản xuất Excel.</p>` : "";

  const issueRows = topIssues.map((q) => {
    const meta = LOAI_LOI[q.type];
    const sv = sevOf(q.severity);
    return `<tr><td>${sv.emoji} ${esc(sv.nhan)}</td><td style="text-align:left">${esc(meta?.ten || q.type)}</td><td style="text-align:left">${esc(q.msg)}</td></tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8">
<title>Báo cáo quản lý VMP — CPC1 HN</title>
<style>
  body{font-family:'Segoe UI',system-ui,sans-serif;max-width:960px;margin:auto;padding:40px 30px;color:#2d2d2d;line-height:1.7}
  h1{color:#A83364;border-bottom:3px solid #E4749F;padding-bottom:12px}
  h2{color:#5F44AD;margin-top:34px;border-left:4px solid #8168CE;padding-left:12px}
  table{width:100%;border-collapse:collapse;margin:14px 0;font-size:13px}
  th,td{border:1px solid #ddd;padding:8px 12px;text-align:center}
  th{background:#FBE4EF;color:#A83364;font-weight:700}
  .badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:700}
  .badge.good{background:#DAF2E9;color:#146851} .badge.mid{background:#FAEDD3;color:#8D550A} .badge.bad{background:#FBE1E8;color:#B62E52}
  .over{background:#FBE1E8;color:#B62E52;font-weight:700}
  .footer{margin-top:40px;padding:16px;background:#FDF0F7;border-radius:12px;font-size:13px;color:#6E4869}
  .ai-box{background:#FDEEF6;border-left:4px solid #E4749F;padding:18px 22px;border-radius:0 12px 12px 0;margin:16px 0;white-space:pre-wrap}
  .stamp{background:#FBE1E8;color:#B62E52;padding:6px 14px;border-radius:8px;font-weight:800;font-size:13px;display:inline-block;margin-bottom:12px}
  .chart{margin:14px 0}
  .kpi{display:flex;gap:14px;flex-wrap:wrap;margin:14px 0}
  .kpi div{flex:1;min-width:140px;background:#FDF0F7;border-radius:12px;padding:14px 16px;text-align:center}
  .kpi .v{font-size:26px;font-weight:800;color:#A83364}
  .kpi .l{font-size:11.5;color:#6E4869;font-weight:700}
</style></head><body>
<h1>BÁO CÁO QUẢN LÝ TIẾN ĐỘ VMP — CPC1 HÀ NỘI</h1>
<p><b>Phạm vi:</b> ${esc(d.scopeLabel)} · <b>Ngày chốt:</b> ${fmtVN(now)} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}</p>
<p><b>Đơn vị:</b> V/Q Team — QLCL · <b>Nguồn:</b> Supabase (dữ liệu gốc, không qua Sheet) · <b>Mục tiêu:</b> ${d.monthly.cur.target}% hạng mục đến hạn mỗi tháng phải hoàn thành trong tháng đó</p>

<h2>1. Tổng quan số liệu kỳ ${esc(d.monthly.label)}</h2>
<div class="kpi">
  <div><div class="v">${d.ytd.total}</div><div class="l">Tổng hạng mục đang hoạt động</div></div>
  <div><div class="v">${d.ytd.protocol.rate}%</div><div class="l">Đề cương hoàn thành (${d.ytd.protocol.done}/${d.ytd.protocol.total})</div></div>
  <div><div class="v">${d.ytd.validation.rate}%</div><div class="l">Thẩm định thực tế (${d.ytd.validation.done}/${d.ytd.validation.total})</div></div>
  <div><div class="v">${d.ytd.documentation.rate}%</div><div class="l">Hồ sơ hoàn thiện (${d.ytd.documentation.done}/${d.ytd.documentation.total})</div></div>
  <div><div class="v">${d.ytd.vmp.rate}%</div><div class="l">Hoàn thành VMP (${d.ytd.vmp.done}/${d.ytd.vmp.total})</div></div>
  <div><div class="v">${d.ytd.vmp.over}</div><div class="l">Đang quá hạn VMP</div></div>
</div>
<table>
<tr><th>Giai đoạn</th><th>Hoàn thành</th><th>Quá hạn</th><th>Chưa tới</th><th>Tỷ lệ</th></tr>
<tr><td style="text-align:left">Đề cương</td><td>${d.ytd.protocol.done}</td><td class="${d.ytd.protocol.over ? "over" : ""}">${d.ytd.protocol.over}</td><td>${d.ytd.protocol.todo}</td><td>${pctBadge(d.ytd.protocol.rate)}</td></tr>
<tr><td style="text-align:left">Thẩm định thực tế</td><td>${d.ytd.validation.done}</td><td class="${d.ytd.validation.over ? "over" : ""}">${d.ytd.validation.over}</td><td>${d.ytd.validation.todo}</td><td>${pctBadge(d.ytd.validation.rate)}</td></tr>
<tr><td style="text-align:left">Hồ sơ / báo cáo</td><td>${d.ytd.documentation.done}</td><td class="${d.ytd.documentation.over ? "over" : ""}">${d.ytd.documentation.over}</td><td>${d.ytd.documentation.todo}</td><td>${pctBadge(d.ytd.documentation.rate)}</td></tr>
<tr><td style="text-align:left">Hoàn thành VMP</td><td>${d.ytd.vmp.done}</td><td class="${d.ytd.vmp.over ? "over" : ""}">${d.ytd.vmp.over}</td><td>${d.ytd.vmp.todo}</td><td>${pctBadge(d.ytd.vmp.rate)}</td></tr>
</table>
<table><tr><th>Trạng thái hiện tại</th><th>Số hạng mục</th></tr>${stageRows}</table>

<h2>2. Tổng quan kỳ ${esc(d.monthly.label)}</h2>
<div class="kpi">
  <div><div class="v">${d.monthly.cur.due}</div><div class="l">Cần hoàn thành trong kỳ</div></div>
  <div><div class="v">${d.monthly.cur.done}</div><div class="l">Đã hoàn thành</div></div>
  <div><div class="v">${d.monthly.cur.rate == null ? "—" : d.monthly.cur.rate + "%"}</div><div class="l">Tỷ lệ kỳ này</div></div>
  <div><div class="v">${d.monthly.prev?.rate == null ? "—" : d.monthly.prev.rate + "%"}</div><div class="l">Tỷ lệ kỳ trước</div></div>
</div>

<h2>3. Đánh giá so với mục tiêu ${d.monthly.cur.target}%/tháng</h2>
<div class="chart">${monthlyChart}</div>
<table><tr><th>Tháng</th><th>Kỳ</th><th>Cần hoàn thành</th><th>Đã hoàn thành</th><th>Tỷ lệ</th><th>So mục tiêu</th></tr>${monthTableRows}</table>
<p style="font-size:12px;color:#6E4869">Tháng chưa tới kỳ không được chấm đạt/chưa đạt — 0% hoàn thành ở kỳ chưa xảy ra là đương nhiên, không phải trượt mục tiêu. Tháng đang diễn ra là số giữa kỳ.</p>

<h2>4. Bất cập trong VMP — bộ phận nào chậm, chậm giai đoạn nào</h2>
${bottleneckChart ? `<div class="chart">${bottleneckChart}</div>` : "<p>Không có bộ phận nào đang chậm ở giai đoạn nào.</p>"}
${d.bottleneck.length ? `<table><tr><th>Bộ phận</th><th>Tổng</th><th>Chậm đề cương</th><th>Chậm thẩm định</th><th>Chậm báo cáo</th><th>Tỷ lệ đúng hạn</th></tr>${bottleneckRows}</table>` : ""}

<h2>5. Công việc dự kiến ${esc(d.nextMonth.monthLabel)}</h2>
<p><b>${d.nextMonth.total}</b> hạng mục đến hạn, chưa hoàn thành.</p>
${workloadChart ? `<div class="chart">${workloadChart}</div>` : ""}
${d.nextMonth.items.length ? `<table><tr><th>Mã</th><th>Tên</th><th>Bộ phận</th><th>Người thực hiện</th><th>Hạn</th><th>Trọng yếu</th></tr>${nextMonthRows}</table>${nextMonthTruncated}` : "<p>Không có hạng mục nào đến hạn ${esc(d.nextMonth.monthLabel)} trong phạm vi này.</p>"}

<h2>6. Chất lượng dữ liệu</h2>
<div class="kpi">
  <div><div class="v">${bySeverity.error || 0}</div><div class="l">${SEV.error.emoji} Lỗi</div></div>
  <div><div class="v">${bySeverity.warning || 0}</div><div class="l">${SEV.warning.emoji} Cảnh báo</div></div>
  <div><div class="v">${bySeverity.info || 0}</div><div class="l">${SEV.info.emoji} Thông tin</div></div>
</div>
${topIssues.length ? `<table><tr><th>Mức</th><th>Loại</th><th>Chi tiết</th></tr>${issueRows}</table>${d.quality.length > 15 ? `<p style="font-size:12px;color:#6E4869">… và ${d.quality.length - 15} vấn đề khác — xem đầy đủ ở màn Chất lượng dữ liệu.</p>` : ""}` : "<p>Không phát hiện vấn đề chất lượng dữ liệu trong phạm vi này.</p>"}

<h2>7. Nhận xét & Đánh giá (AI)</h2>
<div class="stamp">${disclaimer}</div>
<div class="ai-box">${esc(d.ai) || "(Chưa tạo nhận xét AI)"}</div>

<h2>8. QA Review & Xác nhận</h2>
<table>
<tr><td style="width:50%;text-align:left"><b>Người lập:</b> ........................</td><td style="text-align:left"><b>Người xác nhận (QA):</b> ........................</td></tr>
<tr><td style="text-align:left"><b>Ngày:</b> ....../....../20......</td><td style="text-align:left"><b>Ngày:</b> ....../....../20......</td></tr>
<tr><td style="text-align:left"><b>Chữ ký:</b></td><td style="text-align:left"><b>Chữ ký:</b></td></tr>
</table>

<div class="footer">
<b>Audit:</b> Snapshot tạo lúc ${now.toISOString()} · Template báo cáo quản lý v3.0 · Hệ thống VMP Monitor CPC1 HN<br/>
<b>Lưu ý:</b> Số liệu chốt tại thời điểm tạo báo cáo, đọc thẳng từ Supabase — không bịa số. Mọi thay đổi dữ liệu sau thời điểm này không ảnh hưởng đến báo cáo đã phát hành.
</div>
</body></html>`;
}

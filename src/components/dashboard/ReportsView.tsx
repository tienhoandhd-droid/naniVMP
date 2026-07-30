/* =====================================================================
 *  components/dashboard/ReportsView.tsx — Báo cáo quản lý VMP (2026-07-30)
 *  ---------------------------------------------------------------------
 *  Thay bản ReportsView cũ trong App.tsx (kỳ tuần/tháng/quý + 1 bảng KPI).
 *  Bản mới theo đúng yêu cầu quản lý:
 *    1. Tổng quan số liệu tới hiện tại (năm nay)
 *    2. Tổng quan tháng hiện tại
 *    3. Đánh giá so với mục tiêu 50%/tháng (chốt định nghĩa với người dùng
 *       2026-07-30: % hạng mục ĐẾN HẠN trong tháng mà đã HOÀN THÀNH)
 *    4. Bất cập trong VMP — bộ phận nào chậm, chậm đề cương hay thực tế
 *    5. Công việc dự kiến tháng tới
 *    + Chất lượng dữ liệu, dữ liệu thô có thể lọc/xuất bất cứ lúc nào,
 *      nhận xét tự động (không AI, luôn đúng số) + nhận xét AI (tuỳ chọn).
 *
 *  Toàn bộ số liệu tính từ `acts` (đã tải từ Supabase) qua lib/reportModel.ts
 *  — không có chỗ nào tự bịa số. Biểu đồ dùng lib/reportCharts.ts (SVG tay,
 *  không thư viện ngoài — recharts đã bị gỡ khỏi app).
 * ===================================================================== */
import { useMemo, useState } from "react";
import {
  FileBarChart, Printer, Download, RefreshCw, AlertCircle, Sparkles as SparkIcon,
  Boxes, ClipboardCheck, ShieldCheck, FileCheck2, CalendarClock, ListFilter, CheckCircle2,
} from "lucide-react";

import { C, TEXT, NUM, GRAD, btnPrimary, glass } from "../../constants/theme.ts";
import { DEPTS, CRIT, LOAI_LOI, sevOf } from "../../constants/vmp.ts";
import { Card, CardTitle, Tag, Sel, StatTile, MultiSelect, TableScroll } from "../ui/Primitives.tsx";
import { download, runDataQualityChecks, nhanXetTuDong } from "../../utils/helpers.ts";
import {
  ytdSummary, currentMonthSummary, stageBottleneck, nextMonthWork, buildRawRows,
} from "../../lib/reportModel.ts";
import {
  svgMonthlyTargetChart, svgDeptBottleneckChart, svgDeptWorkloadChart, deptColorMap, SCREEN_PALETTE,
} from "../../lib/reportCharts.ts";
import { buildManagementReportHTML } from "../../lib/reportHtml.ts";

import type { Activity } from "../../types/domain.ts";

const TARGET_PCT = 50;

const toolBtn = (bg: string, color: string) => ({
  display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", borderRadius: 12,
  border: "none", cursor: "pointer", background: bg, color, fontFamily: TEXT, fontWeight: 800, fontSize: 13,
});

const th: React.CSSProperties = { textAlign: "left", fontSize: 11, color: C.plumSoft, fontWeight: 800, padding: "0 13px 10px", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "10px 13px", fontSize: 13, color: C.plum, fontWeight: 600, borderTop: `1px solid ${C.line}` };

function uniqSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
}

export default function ReportsView({ acts }: { acts: Activity[] }) {
  const [deptScope, setDeptScope] = useState("all");
  const [areaSel, setAreaSel] = useState<string[]>([]);
  const [critSel, setCritSel] = useState<string[]>([]);
  const [ai, setAi] = useState("");
  const [loadingAi, setLoadingAi] = useState(false);
  const [errAi, setErrAi] = useState("");

  const areaOptions = useMemo(
    () => uniqSorted(acts.map((a) => String(a.area ?? ""))).map((v) => ({ v, l: v })),
    [acts],
  );
  const critOptions = useMemo(() => Object.keys(CRIT).map((v) => ({ v, l: v })), []);

  // ===== Bộ lọc dữ liệu báo cáo quản lý — lấy số liệu theo bất kỳ lát cắt nào =====
  const scoped = useMemo(() => {
    let list = acts;
    if (deptScope !== "all") {
      list = list.filter((a) => (Array.isArray(a.depts) && a.depts.length ? a.depts.includes(deptScope) : a.dept === deptScope));
    }
    if (areaSel.length) list = list.filter((a) => areaSel.includes(String(a.area ?? "")));
    if (critSel.length) list = list.filter((a) => critSel.includes(String(a.crit ?? "")));
    return list;
  }, [acts, deptScope, areaSel, critSel]);

  const scopeLabel = useMemo(() => {
    const parts = [deptScope === "all" ? "Toàn nhà máy" : (DEPTS.find((d) => d.id === deptScope)?.name || deptScope)];
    if (areaSel.length) parts.push(`Khu vực: ${areaSel.join(", ")}`);
    if (critSel.length) parts.push(`Trọng yếu: ${critSel.join(", ")}`);
    return parts.join(" · ");
  }, [deptScope, areaSel, critSel]);

  const ytd = useMemo(() => ytdSummary(scoped), [scoped]);
  const monthly = useMemo(() => currentMonthSummary(scoped, TARGET_PCT), [scoped]);
  const bottleneck = useMemo(() => stageBottleneck(scoped), [scoped]);
  const nextMonth = useMemo(() => nextMonthWork(scoped), [scoped]);
  const quality = useMemo(() => runDataQualityChecks(scoped), [scoped]);
  const rawRows = useMemo(() => buildRawRows(scoped), [scoped]);
  const autoComments = useMemo(() => nhanXetTuDong(scoped), [scoped]);

  const monthlyChartHtml = useMemo(() => svgMonthlyTargetChart(monthly.table, SCREEN_PALETTE), [monthly]);
  const bottleneckChartHtml = useMemo(
    () => (bottleneck.length ? svgDeptBottleneckChart(bottleneck, SCREEN_PALETTE) : ""),
    [bottleneck],
  );
  const workloadChartHtml = useMemo(
    () => (nextMonth.byDept.length ? svgDeptWorkloadChart(nextMonth.byDept, deptColorMap(SCREEN_PALETTE), SCREEN_PALETTE) : ""),
    [nextMonth],
  );

  // Chỉ chấm điểm tháng ĐÃ QUA. Tháng đang diễn ra nói rõ là số giữa kỳ,
  // tháng chưa tới chỉ nói khối lượng sắp phải làm — không kết luận đạt/trượt
  // cho một kỳ chưa xảy ra.
  const targetVerdict = useMemo(() => {
    const past = monthly.table.filter((r) => r.phase === "da_qua" && r.rate != null);
    const future = monthly.table.filter((r) => r.phase === "chua_toi");
    const futureDue = future.reduce((s, r) => s + r.due, 0);

    const parts: string[] = [];
    if (past.length) {
      const met = past.filter((r) => r.meets).length;
      const miss = past.filter((r) => !r.meets).map((r) => `T${r.month} ${r.rate}%`);
      parts.push(`Trong ${past.length} tháng đã qua, ${met} tháng đạt mục tiêu ${TARGET_PCT}%${miss.length ? `; chưa đạt: ${miss.join(", ")}` : ""}.`);
    } else {
      parts.push("Chưa có tháng nào kết thúc trong năm để chấm so mục tiêu.");
    }

    parts.push(monthly.cur.rate == null
      ? `Tháng ${monthly.month}/${monthly.year} chưa có hạng mục nào đến hạn.`
      : `Tháng ${monthly.month}/${monthly.year} đang ở ${monthly.cur.rate}% (${monthly.cur.done}/${monthly.cur.due}) — số giữa kỳ, chưa phải kết quả chốt.`);

    if (futureDue) parts.push(`Còn ${futureDue} hạng mục đến hạn ở các tháng chưa tới kỳ — chưa chấm được, chỉ là khối lượng phải bố trí.`);
    return parts.join(" ");
  }, [monthly]);

  const bottleneckVerdict = useMemo(() => {
    const worst = bottleneck[0];
    const worstTotal = worst ? worst.overProtocol + worst.overValidation + worst.overReport : 0;
    if (!worst || worstTotal === 0) return "Không có bộ phận nào đang chậm ở giai đoạn đề cương, thẩm định thực tế hay báo cáo trong phạm vi đang chọn.";
    const stages: string[] = [];
    if (worst.overProtocol) stages.push(`${worst.overProtocol} chậm đề cương`);
    if (worst.overValidation) stages.push(`${worst.overValidation} chậm thẩm định thực tế`);
    if (worst.overReport) stages.push(`${worst.overReport} chậm báo cáo`);
    return `${worst.label} đang nghẽn nặng nhất: ${stages.join(", ")}.`;
  }, [bottleneck]);

  // Phễu phải giảm dần: đề cương ≥ thẩm định ≥ hồ sơ ≥ VMP.
  const funnelWarning = useMemo(() => {
    const f = [
      { l: "đề cương", n: ytd.protocol.done },
      { l: "thẩm định thực tế", n: ytd.validation.done },
      { l: "hồ sơ", n: ytd.documentation.done },
      { l: "hoàn thành VMP", n: ytd.vmp.done },
    ];
    const nguoc: string[] = [];
    for (let i = 1; i < f.length; i++) {
      if (f[i].n > f[i - 1].n) nguoc.push(`${f[i].l} (${f[i].n}) nhiều hơn ${f[i - 1].l} (${f[i - 1].n})`);
    }
    return nguoc.length
      ? `Dữ liệu tự mâu thuẫn: ${nguoc.join("; ")}. Một giai đoạn sau không thể xong nhiều hơn giai đoạn trước — cần rà lại cột trạng thái ở Cập nhật tiến độ.`
      : "";
  }, [ytd]);

  const qualityBySeverity = useMemo(() => {
    const m: Record<string, number> = { error: 0, warning: 0, info: 0 };
    for (const q of quality) m[q.severity] = (m[q.severity] || 0) + 1;
    return m;
  }, [quality]);

  const generateAi = async () => {
    setLoadingAi(true); setErrAi(""); setAi("");
    const url = import.meta.env.VITE_N8N_AI_REPORT_URL || "";
    if (!url) { setErrAi("Chưa cấu hình đường gọi AI (VITE_N8N_AI_REPORT_URL)."); setLoadingAi(false); return; }
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const chatToken = import.meta.env.VITE_N8N_CHAT_TOKEN as string | undefined;
      if (chatToken) headers["x-vmp-chat"] = chatToken;
      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ pham_vi: deptScope }) });
      const json = await res.json();
      if (json.ok && json.ai_text) setAi(json.ai_text);
      else if (json.error) setErrAi(`Lỗi AI: ${json.error}`);
      else setErrAi("Không nhận được phản hồi AI từ n8n.");
    } catch (ex) { setErrAi("Lỗi kết nối n8n: " + ((ex as Error)?.message || "không xác định")); }
    finally { setLoadingAi(false); }
  };

  const printPDF = () => {
    const html = buildManagementReportHTML({ scopeLabel, ytd, monthly, bottleneck, nextMonth, quality, ai });
    const ifr = document.createElement("iframe");
    ifr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(ifr);
    const win = ifr.contentWindow;
    if (!win) return;
    const dd = win.document;
    dd.open(); dd.write(html); dd.close();
    setTimeout(() => { try { win.focus(); win.print(); } catch { /* trình duyệt chặn in */ } setTimeout(() => document.body.removeChild(ifr), 1500); }, 400);
  };

  const downloadHtml = () => {
    const html = buildManagementReportHTML({ scopeLabel, ytd, monthly, bottleneck, nextMonth, quality, ai });
    download(`BaoCaoQuanLy_VMP_${monthly.year}-${String(monthly.month).padStart(2, "0")}.html`, html);
  };

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    const tongQuan = [
      ["Chỉ số", "Giá trị"],
      ["Phạm vi", scopeLabel],
      ["Tổng hạng mục đang hoạt động", ytd.total],
      ["Đề cương hoàn thành (%)", ytd.protocol.rate], ["Đề cương — đã xong", ytd.protocol.done], ["Đề cương — quá hạn", ytd.protocol.over],
      ["Thẩm định thực tế (%)", ytd.validation.rate], ["Thẩm định — đã xong", ytd.validation.done], ["Thẩm định — quá hạn", ytd.validation.over],
      ["Hồ sơ hoàn thiện (%)", ytd.documentation.rate], ["Hồ sơ — đã xong", ytd.documentation.done], ["Hồ sơ — quá hạn", ytd.documentation.over],
      ["Hoàn thành VMP (%)", ytd.vmp.rate], ["VMP — đã xong", ytd.vmp.done], ["VMP — quá hạn", ytd.vmp.over],
      [], ["Tháng hiện tại", `${monthly.month}/${monthly.year}`],
      ["Cần hoàn thành tháng này", monthly.cur.due], ["Đã hoàn thành tháng này", monthly.cur.done],
      ["Tỷ lệ tháng này (%)", monthly.cur.rate ?? "—"], ["Tỷ lệ tháng trước (%)", monthly.prev?.rate ?? "—"],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tongQuan), "Tổng quan");

    const KY_LABEL = { da_qua: "Đã qua", dang_dien_ra: "Đang diễn ra", chua_toi: "Chưa tới kỳ" };
    const theoThang = [
      ["Tháng", "Kỳ", "Cần hoàn thành", "Đã hoàn thành", "Tỷ lệ (%)", "Mục tiêu (%)", "So mục tiêu"],
      ...monthly.table.map((r) => [
        `T${r.month}`, KY_LABEL[r.phase], r.due, r.done,
        r.phase === "chua_toi" ? "" : (r.rate ?? ""), r.target,
        r.phase === "chua_toi" ? "Chưa chấm — kỳ chưa tới"
          : r.rate == null ? "Chưa có hạng mục"
            : r.phase === "dang_dien_ra" ? `${r.meets ? "Tạm đạt" : "Tạm dưới"} (giữa kỳ)`
              : (r.meets ? "Đạt" : "Chưa đạt"),
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(theoThang), "Theo tháng - Mục tiêu");

    const batCap = [
      ["Bộ phận", "Tổng", "Chậm đề cương", "Chậm thẩm định thực tế", "Chậm báo cáo", "Đang quá hạn VMP", "Tỷ lệ đúng hạn (%)"],
      ...bottleneck.map((r) => [r.label, r.total, r.overProtocol, r.overValidation, r.overReport, r.overVmp, r.onTimeRate]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(batCap), "Bất cập theo bộ phận");

    const thangToi = [
      ["Mã", "Tên", "Bộ phận", "Người thực hiện", "Hạn", "Mức trọng yếu"],
      ...nextMonth.items.map((it) => [it.code, it.name, it.depts.join("+"), it.owner, it.target, it.crit]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(thangToi), `Tháng tới ${nextMonth.monthLabel}`);

    const duLieuTho = [
      ["Mã", "Tên", "Loại", "Bộ phận", "Khu vực", "Người thực hiện", "Trọng yếu",
        "TT đề cương", "TT thẩm định", "TT báo cáo", "TT VMP",
        "Hạn đề cương", "Hạn thẩm định", "Hạn báo cáo", "Hạn VMP",
        "Ngày đề cương", "Ngày thẩm định", "Ngày báo cáo", "Ngày VMP", "Trạng thái tính toán"],
      ...rawRows.map((r) => [r.ma, r.ten, r.loai, r.bo_phan, r.khu_vuc, r.nguoi_thuc_hien, r.trong_yeu,
        r.tt_de_cuong, r.tt_tham_dinh, r.tt_bao_cao, r.tt_vmp,
        r.dl_de_cuong, r.dl_tham_dinh, r.dl_bao_cao, r.dl_vmp,
        r.ngay_de_cuong, r.ngay_tham_dinh, r.ngay_bao_cao, r.ngay_vmp, r.trang_thai]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(duLieuTho), "Dữ liệu thô");

    XLSX.writeFile(wb, `BaoCaoQuanLy_VMP_${monthly.year}-${String(monthly.month).padStart(2, "0")}_CPC1HN.xlsx`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ===== Bộ lọc dữ liệu báo cáo — lấy số liệu theo bất kỳ lát cắt nào ===== */}
      <Card>
        <CardTitle icon={ListFilter} sub="Áp dụng cho toàn bộ báo cáo bên dưới — kể cả dữ liệu thô và bản xuất">
          Bộ lọc dữ liệu báo cáo quản lý
        </CardTitle>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 800, marginBottom: 9 }}>Phạm vi (bộ phận)</div>
            <Sel val={deptScope} set={setDeptScope} opts={[{ v: "all", l: "Toàn nhà máy" }, ...DEPTS.map((d) => ({ v: d.id, l: d.name }))]} />
          </div>
          <div>
            <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 800, marginBottom: 9 }}>Khu vực</div>
            <MultiSelect label="Khu vực" allLabel="Tất cả khu vực" options={areaOptions} selected={areaSel} onChange={setAreaSel} />
          </div>
          <div>
            <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 800, marginBottom: 9 }}>Mức trọng yếu</div>
            <MultiSelect label="Trọng yếu" allLabel="Tất cả mức" options={critOptions} selected={critSel} onChange={setCritSel} />
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={printPDF} style={toolBtn(GRAD, "#fff")}><Printer size={16} /> PDF</button>
            <button onClick={exportExcel} style={toolBtn(C.mintSoft, C.mintText)}><Download size={16} /> Excel (đủ 5 sheet)</button>
            <button onClick={downloadHtml} style={toolBtn(C.lavSoft, C.lavText)}><Download size={16} /> HTML</button>
          </div>
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>
          Đang xem: <b style={{ color: C.plum }}>{scopeLabel}</b> · {scoped.filter((a) => (a.state || "active") === "active").length} hạng mục đang hoạt động
        </div>
      </Card>

      {/* ===== 1. Tổng quan số liệu tới hiện tại ===== */}
      <Card variant="strong">
        <CardTitle icon={Boxes} sub={`Toàn bộ hạng mục VMP năm ${monthly.year}, tính tới hôm nay`}>
          1. Tổng quan số liệu năm {monthly.year}
        </CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
          <StatTile icon={Boxes} label="Tổng hạng mục" value={ytd.total} tone={{ c: C.plum, bg: C.pinkSoft }} />
          <StatTile icon={ClipboardCheck} label="Đề cương hoàn thành" value={`${ytd.protocol.rate}%`}
            sub={`${ytd.protocol.done}/${ytd.protocol.total} · quá hạn ${ytd.protocol.over}`} tone={{ c: C.lavText, bg: C.lavSoft }} />
          <StatTile icon={ShieldCheck} label="Thẩm định thực tế" value={`${ytd.validation.rate}%`}
            sub={`${ytd.validation.done}/${ytd.validation.total} · quá hạn ${ytd.validation.over}`} tone={{ c: C.skyText, bg: C.skySoft }} />
          <StatTile icon={FileCheck2} label="Hồ sơ hoàn thiện" value={`${ytd.documentation.rate}%`}
            sub={`${ytd.documentation.done}/${ytd.documentation.total} · quá hạn ${ytd.documentation.over}`} tone={{ c: C.pinkText, bg: C.pinkSoft }} />
          <StatTile icon={CheckCircle2} label="Hoàn thành VMP" value={`${ytd.vmp.rate}%`}
            sub={`${ytd.vmp.done}/${ytd.vmp.total} · quá hạn ${ytd.vmp.over}`} tone={{ c: C.mintText, bg: C.mintSoft }} />
        </div>
        {/* Phễu 4 giai đoạn phải giảm dần. Nếu không, dữ liệu tự mâu thuẫn
            (xong báo cáo mà chưa thẩm định) — nói thẳng thay vì để người đọc
            tự phát hiện rồi mất tin vào cả bản báo cáo. */}
        {funnelWarning && (
          <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: C.marigoldText,
            background: C.marigoldSoft, borderRadius: 12, padding: "11px 15px" }}>
            ⚠️ {funnelWarning}
          </div>
        )}
        <TableScroll maxHeight={280} hint={false}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: TEXT, marginTop: 16 }}>
            <thead><tr><th style={th}>Giai đoạn</th><th style={{ ...th, textAlign: "center" }}>Số hạng mục</th></tr></thead>
            <tbody>
              {ytd.byStage.map((s) => (
                <tr key={s.id}><td style={td}>{s.label}</td><td style={{ ...td, textAlign: "center", fontFamily: NUM }}>{s.count}</td></tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      {/* ===== 2. Tổng quan tháng hiện tại ===== */}
      <Card>
        <CardTitle icon={CalendarClock} sub="So với tháng trước, cùng phạm vi đang lọc">
          2. Tổng quan tháng {monthly.month}/{monthly.year}
        </CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
          <StatTile icon={CalendarClock} label="Cần hoàn thành tháng này" value={monthly.cur.due} tone={{ c: C.plum, bg: C.pinkSoft }} />
          <StatTile icon={FileCheck2} label="Đã hoàn thành" value={monthly.cur.done}
            sub={monthly.cur.rate == null ? "Chưa có hạng mục đến hạn" : `${monthly.cur.rate}% trong tháng`} tone={{ c: C.mintText, bg: C.mintSoft }} />
          <StatTile icon={ShieldCheck} label="Tỷ lệ tháng trước" value={monthly.prev?.rate == null ? "—" : `${monthly.prev.rate}%`}
            tone={{ c: C.skyText, bg: C.skySoft }} />
          {/* Tháng hiện tại chưa kết thúc → nói "tạm", khớp với biểu đồ và câu
              kết luận. Ghi thẳng "Chưa đạt" là chốt sổ một kỳ chưa xong. */}
          <StatTile icon={AlertCircle} label={`So mục tiêu ${TARGET_PCT}%`}
            value={monthly.cur.rate == null ? "—" : (monthly.cur.meets ? "Tạm đạt" : "Tạm dưới")}
            sub={monthly.cur.rate == null ? "Chưa có hạng mục đến hạn" : "Số giữa kỳ — tháng chưa kết thúc"}
            tone={monthly.cur.meets === false ? { c: C.marigoldText, bg: C.marigoldSoft } : { c: C.mintText, bg: C.mintSoft }} />
        </div>
      </Card>

      {/* ===== 3. Mục tiêu 50%/tháng ===== */}
      <Card variant="strong">
        <CardTitle icon={FileBarChart} sub="Mục tiêu: 50% hạng mục có mốc đích VMP rơi vào tháng đó phải hoàn thành trong tháng">
          3. Đánh giá so với mục tiêu {TARGET_PCT}%/tháng
        </CardTitle>
        <div dangerouslySetInnerHTML={{ __html: monthlyChartHtml }} />
        <div style={{ marginTop: 10, fontSize: 13.5, color: C.plum, fontWeight: 600, background: C.pinkMist,
          borderLeft: `4px solid ${C.pink}`, borderRadius: "0 12px 12px 0", padding: "12px 16px" }}>
          {targetVerdict}
        </div>
      </Card>

      {/* ===== 4. Bất cập trong VMP ===== */}
      <Card variant="strong">
        <CardTitle icon={AlertCircle} sub="Chậm đề cương, chậm thẩm định thực tế hay chậm báo cáo — theo từng bộ phận">
          4. Bất cập trong VMP — bộ phận nào chậm
        </CardTitle>
        {bottleneckChartHtml
          ? <div dangerouslySetInnerHTML={{ __html: bottleneckChartHtml }} />
          : <div style={{ fontSize: 13.5, color: C.plumSoft, fontWeight: 700, padding: 12 }}>Không có bộ phận nào đang chậm trong phạm vi đang chọn.</div>}
        <div style={{ marginTop: 10, marginBottom: 14, fontSize: 13.5, color: C.plum, fontWeight: 600, background: C.raspSoft,
          borderLeft: `4px solid ${C.rasp}`, borderRadius: "0 12px 12px 0", padding: "12px 16px" }}>
          {bottleneckVerdict}
        </div>
        <TableScroll maxHeight={320}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: TEXT, minWidth: 720 }}>
            <thead><tr>
              <th style={th}>Bộ phận</th><th style={{ ...th, textAlign: "center" }}>Tổng</th>
              <th style={{ ...th, textAlign: "center" }}>Chậm đề cương</th><th style={{ ...th, textAlign: "center" }}>Chậm thẩm định</th>
              <th style={{ ...th, textAlign: "center" }}>Chậm báo cáo</th><th style={{ ...th, textAlign: "center" }}>Quá hạn VMP</th>
              <th style={{ ...th, textAlign: "center" }}>Tỷ lệ đúng hạn</th>
            </tr></thead>
            <tbody>
              {bottleneck.map((r) => (
                <tr key={r.dept}>
                  <td style={td}>{r.label}</td>
                  <td style={{ ...td, textAlign: "center", fontFamily: NUM }}>{r.total}</td>
                  <td style={{ ...td, textAlign: "center" }}>{r.overProtocol > 0 ? <Tag color={C.lavText} bg={C.lavSoft}>{r.overProtocol}</Tag> : "—"}</td>
                  <td style={{ ...td, textAlign: "center" }}>{r.overValidation > 0 ? <Tag color={C.skyText} bg={C.skySoft}>{r.overValidation}</Tag> : "—"}</td>
                  <td style={{ ...td, textAlign: "center" }}>{r.overReport > 0 ? <Tag color={C.pinkText} bg={C.pinkSoft}>{r.overReport}</Tag> : "—"}</td>
                  <td style={{ ...td, textAlign: "center" }}>{r.overVmp > 0 ? <Tag color={C.raspText} bg={C.raspSoft}>{r.overVmp}</Tag> : "—"}</td>
                  <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>{r.onTimeRate}%</td>
                </tr>
              ))}
              {!bottleneck.length && <tr><td style={td} colSpan={7}>Không có dữ liệu trong phạm vi đang chọn.</td></tr>}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      {/* ===== 5. Công việc dự kiến tháng tới ===== */}
      <Card>
        <CardTitle icon={CalendarClock} sub={`${nextMonth.total} hạng mục có mốc đích VMP rơi vào tháng ${nextMonth.monthLabel}, chưa hoàn thành`}>
          5. Công việc dự kiến tháng {nextMonth.monthLabel}
        </CardTitle>
        {workloadChartHtml && <div dangerouslySetInnerHTML={{ __html: workloadChartHtml }} />}
        <TableScroll maxHeight={340}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: TEXT, minWidth: 720, marginTop: 12 }}>
            <thead><tr>
              <th style={th}>Mã</th><th style={th}>Tên</th><th style={th}>Bộ phận</th>
              <th style={th}>Người thực hiện</th><th style={th}>Hạn</th><th style={th}>Trọng yếu</th>
            </tr></thead>
            <tbody>
              {nextMonth.items.slice(0, 200).map((it) => (
                <tr key={it.id}>
                  <td style={{ ...td, fontFamily: NUM }}>{it.code}</td><td style={td}>{it.name}</td>
                  <td style={td}>{it.depts.join("+")}</td><td style={td}>{it.owner}</td>
                  <td style={{ ...td, fontFamily: NUM }}>{it.target}</td><td style={td}>{it.crit}</td>
                </tr>
              ))}
              {!nextMonth.items.length && <tr><td style={td} colSpan={6}>Không có hạng mục nào đến hạn tháng tới trong phạm vi đang chọn.</td></tr>}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      {/* ===== Chất lượng dữ liệu ===== */}
      <Card>
        <CardTitle icon={AlertCircle} sub="Tính trực tiếp trên phạm vi đang lọc — xem đầy đủ ở mục Sức khoẻ dữ liệu">
          Chất lượng dữ liệu
        </CardTitle>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: quality.length ? 14 : 0 }}>
          <Tag color={sevOf("error").mau} bg={sevOf("error").nen}>{sevOf("error").emoji} Lỗi: {qualityBySeverity.error || 0}</Tag>
          <Tag color={sevOf("warning").mau} bg={sevOf("warning").nen}>{sevOf("warning").emoji} Cảnh báo: {qualityBySeverity.warning || 0}</Tag>
          <Tag color={sevOf("info").mau} bg={sevOf("info").nen}>{sevOf("info").emoji} Thông tin: {qualityBySeverity.info || 0}</Tag>
        </div>
        {quality.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: C.plum, fontWeight: 600 }}>
            {quality.slice(0, 8).map((q, i) => (
              <li key={i}>{sevOf(q.severity).emoji} <b>{LOAI_LOI[q.type]?.ten || q.type}</b> — {q.msg}</li>
            ))}
            {quality.length > 8 && <li style={{ color: C.plumSoft }}>… và {quality.length - 8} vấn đề khác.</li>}
          </ul>
        )}
      </Card>

      {/* ===== Dữ liệu thô ===== */}
      <Card>
        <CardTitle icon={Boxes} sub={`${rawRows.length} dòng — đúng phạm vi đang lọc phía trên, xuất đầy đủ ở nút Excel`}>
          Dữ liệu thô
        </CardTitle>
        <TableScroll maxHeight={420}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: TEXT, minWidth: 1100 }}>
            <thead><tr>
              <th style={th}>Mã</th><th style={th}>Tên</th><th style={th}>Bộ phận</th><th style={th}>Người thực hiện</th>
              <th style={th}>TT đề cương</th><th style={th}>TT thẩm định</th><th style={th}>TT báo cáo</th><th style={th}>TT VMP</th>
              <th style={th}>Hạn VMP</th><th style={th}>Ngày VMP thực tế</th>
            </tr></thead>
            <tbody>
              {rawRows.slice(0, 500).map((r, i) => (
                <tr key={i}>
                  <td style={{ ...td, fontFamily: NUM }}>{r.ma}</td><td style={td}>{r.ten}</td><td style={td}>{r.bo_phan}</td><td style={td}>{r.nguoi_thuc_hien}</td>
                  <td style={td}>{r.tt_de_cuong}</td><td style={td}>{r.tt_tham_dinh}</td><td style={td}>{r.tt_bao_cao}</td><td style={td}>{r.tt_vmp}</td>
                  <td style={{ ...td, fontFamily: NUM }}>{r.dl_vmp}</td><td style={{ ...td, fontFamily: NUM }}>{r.ngay_vmp || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
        {rawRows.length > 500 && (
          <div style={{ marginTop: 10, fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>
            Đang hiện 500/{rawRows.length} dòng đầu — bấm nút Excel ở trên để lấy toàn bộ.
          </div>
        )}
      </Card>

      {/* ===== Nhận xét ===== */}
      <Card variant="strong">
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <SparkIcon size={18} color={C.pink} />
            <span style={{ fontFamily: TEXT, fontSize: 17, fontWeight: 800, color: C.plum }}>Nhận xét</span>
            <Tag color={C.mintText} bg={C.mintSoft}>Tính từ số liệu</Tag>
          </div>
          {!!import.meta.env.VITE_N8N_AI_REPORT_URL && (
            <button onClick={generateAi} disabled={loadingAi} style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 9, padding: "11px 20px", borderRadius: 12, fontSize: 13.5 }}>
              {loadingAi ? <RefreshCw size={16} className="spin" /> : <SparkIcon size={16} />} {loadingAi ? "AI đang phân tích…" : "Thêm nhận xét AI"}
            </button>
          )}
        </div>

        <div style={{ fontFamily: TEXT, fontSize: 14, color: C.plum, lineHeight: 1.85, fontWeight: 500,
          background: C.pinkMist, borderLeft: `4px solid ${C.pink}`, borderRadius: "0 14px 14px 0", padding: "16px 20px" }}>
          <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 7 }}>
            {autoComments.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>

        {errAi && <div style={{ marginTop: 12, color: C.raspText, fontSize: 13.5, fontWeight: 800, padding: "13px 15px", borderRadius: 12, background: C.raspSoft, display: "flex", gap: 8, alignItems: "center" }}><AlertCircle size={16} /> {errAi}</div>}
        {loadingAi && <div style={{ padding: 24, textAlign: "center", color: C.plumSoft, fontWeight: 700 }}><RefreshCw size={22} className="spin" color={C.pink} /><div style={{ marginTop: 10 }}>AI đang phân tích…</div></div>}
        {!loadingAi && !errAi && ai && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
              <SparkIcon size={16} color={C.lavText} />
              <span style={{ fontFamily: TEXT, fontSize: 15, fontWeight: 800, color: C.plum }}>Nhận xét AI</span>
              <Tag color={C.raspText} bg={C.raspSoft}>Cần QA xác nhận</Tag>
            </div>
            <div style={{ whiteSpace: "pre-wrap", fontFamily: TEXT, fontSize: 14, color: C.plum, lineHeight: 1.8, fontWeight: 500, background: C.lavSoft, borderLeft: `4px solid ${C.lav}`, borderRadius: "0 14px 14px 0", padding: "18px 22px" }}>{ai}</div>
          </div>
        )}
      </Card>

      <div style={{ ...glass, padding: "10px 16px", fontSize: 12, color: C.plumSoft, fontWeight: 700, textAlign: "center" }}>
        Toàn bộ số liệu trên đọc thẳng từ Supabase tại thời điểm mở trang — không có số nào do AI tạo ra ngoài mục &quot;Nhận xét AI&quot;, và mục đó luôn được đánh dấu cần QA xác nhận.
      </div>
    </div>
  );
}

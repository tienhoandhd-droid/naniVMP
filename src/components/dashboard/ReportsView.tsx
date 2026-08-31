/* =====================================================================
 *  components/dashboard/ReportsView.tsx — Báo cáo quản lý VMP (2026-07-30)
 *  ---------------------------------------------------------------------
 *  Thay bản ReportsView cũ trong App.tsx (kỳ tuần/tháng/quý + 1 bảng KPI).
 *  Bản mới theo đúng yêu cầu quản lý:
 *    1. Tổng quan CẢ NĂM — đã làm được bao nhiêu (không đổi khi chọn tháng)
 *    2. Tổng quan KỲ đang chọn, có bộ chọn tháng/quý ngay trong thẻ
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
  Boxes, ClipboardCheck, ShieldCheck, FileCheck2, CalendarClock, ListFilter, CheckCircle2, Mail, Layers,
} from "lucide-react";

import { C, TEXT, GRAD, btnPrimary, glass } from "../../constants/theme.ts";
import { DEPTS, CRIT } from "../../constants/vmp.ts";
import { Card, CardTitle, Tag, Sel, StatTile, MultiSelect, TableScroll, CauKetLuan } from "../ui/Primitives.tsx";
import { download, runDataQualityChecks, nhanXetTuDong, stageOf, wlIsDone } from "../../utils/helpers.ts";
import NhomTab, { NhomTabPanel, DongSo, useNhomTab } from "../ui/NhomTab.tsx";
import { xuatExcelAoa } from "../../lib/xuatExcel.ts";
import {
  ytdSummary, periodSummary, stageBottleneck, periodWork, buildRawRows,
  periodNow, periodLabel, periodPhase, nextPeriod, actInPeriod, countNoTarget, hanVmp,
} from "../../lib/reportModel.ts";
import type { Period, PeriodKind } from "../../lib/reportModel.ts";
import {
  svgMonthlyTargetChart, svgDeptBottleneckChart, svgDeptWorkloadChart, deptColorMap, SCREEN_PALETTE,
} from "../../lib/reportCharts.ts";
import { buildManagementReportHTML } from "../../lib/reportHtml.ts";
import { chayPhanTichAi, aiConfigured, AI_SETUP_HINT, AI_NHAN } from "../../lib/aiReport.ts";
import type { AiKind } from "../../lib/aiReport.ts";
import AiMailModal from "../ai/AiMailModal.tsx";
import ChiTietKyModal from "./ChiTietKyModal.tsx";
import type { GiaiDoan } from "./ChiTietKyModal.tsx";

import type { Activity } from "../../types/domain.ts";

const TARGET_PCT = 50;

const toolBtn = (bg: string, color: string) => ({
  display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", borderRadius: 14,
  border: "none", cursor: "pointer", background: bg, color, fontFamily: TEXT, fontWeight: 800, fontSize: 14,
});
/* Nút phụ của cụm xuất: viền mảnh, không nền — nhường sân cho primary. */
const ghostBtn = {
  display: "flex", alignItems: "center", gap: 8, padding: "10px 15px", borderRadius: 14,
  border: "1.5px solid var(--lp-line-strong)", cursor: "pointer",
  background: "transparent", color: "var(--lp-ink)", fontFamily: TEXT, fontWeight: 700, fontSize: 14,
} as const;

/* Kiểu ô bảng cục bộ (th/td) đã bỏ — mọi bảng của màn này nay đi qua
   `.reg-table` trong analysis.css: kẻ dòng, tiêu đề dính, caption. */

function uniqSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
}

/* Mã bộ phận hiển thị THỐNG NHẤT một kiểu. Bảng đang in thẳng id trong DB
   ("xsx", "qc", "cd") trong khi chỗ khác dùng "XSX", "QC – Kiểm nghiệm" —
   cùng một bộ phận mà ba cách viết thì người đọc phải tự ghép. */
const maBoPhan = (ds: string[]): string =>
  ds.map((d) => DEPTS.find((x) => x.id === d)?.short || d.toUpperCase()).join(" + ");

export default function ReportsView({ acts }: { acts: Activity[] }) {
  const [deptScope, setDeptScope] = useState("all");
  const [areaSel, setAreaSel] = useState<string[]>([]);
  const [critSel, setCritSel] = useState<string[]>([]);
  const [ky, setKy] = useState<Period>(() => periodNow());
  const [ai, setAi] = useState("");
  // Loại phân tích của bản đang hiện — quyết định nhãn hiển thị và loại mail
  // sẽ gửi, để không bao giờ gắn nhãn "phân tích sâu" lên một bản nhận xét
  // thường (hoặc ngược lại).
  const [loaiAi, setLoaiAi] = useState<AiKind>("bao_cao");
  const [loadingAi, setLoadingAi] = useState(false);
  const [errAi, setErrAi] = useState("");
  const [moGuiMail, setMoGuiMail] = useState(false);
  // Bấm vào bất kỳ con số nào ở mục 1 là ra danh sách hạng mục đứng sau nó.
  const [chiTiet, setChiTiet] = useState<
    { title: string; sub?: string; rows: Activity[]; giaiDoan?: GiaiDoan } | null
  >(null);

  const areaOptions = useMemo(
    () => uniqSorted(acts.map((a) => String(a.area ?? ""))).map((v) => ({ v, l: v })),
    [acts],
  );
  const critOptions = useMemo(() => Object.keys(CRIT).map((v) => ({ v, l: v })), []);

  // Năm nào có mặt trong dữ liệu thì cho chọn năm đó, cộng thêm năm hiện tại
  // và năm sau — để lập kế hoạch kỳ tới ngay cả khi chưa có hạng mục nào.
  // Đọc hanVmp() chứ KHÔNG đọc a.target: a.target lùi về hạn báo cáo khi thiếu
  // hạn VMP, nên có thể mời chọn một năm mà mục 1/2 lại rỗng.
  const namOptions = useMemo(() => {
    const nam = new Set<number>();
    for (const a of acts) {
      const y = Number(String(hanVmp(a) ?? "").slice(0, 4));
      if (y >= 2000 && y <= 2100) nam.add(y);
    }
    const nay = new Date().getFullYear();
    nam.add(nay); nam.add(nay + 1);
    /* Năm HIỆN TẠI đứng đầu, rồi mới tới các năm khác giảm dần. Sắp giảm dần
       thuần tuý đẩy "Năm 2027" — một năm chưa xảy ra — lên trên "Năm 2026",
       nên mục đầu danh sách lại là mục ít ai cần nhất. */
    const con = [...nam].filter((y) => y !== nay).sort((x, y) => y - x);
    return [nay, ...con].map((y) => ({ v: String(y), l: `Năm ${y}${y === nay ? " (năm nay)" : ""}` }));
  }, [acts]);

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

  // Lát cắt theo kỳ: giữ MỐC ĐÍCH VMP rơi vào kỳ đang chọn. Đây là lớp lọc
  // thứ hai, tách hẳn khỏi `scoped` vì có mục cần dữ liệu CẢ NĂM (biểu đồ xu
  // hướng) và có mục nói về KỲ SAU — hai mục đó phải đọc `scoped`, không phải
  // `scopedKy`, nếu không sẽ tự cắt mất chính dữ liệu chúng cần.
  const scopedKy = useMemo(() => scoped.filter((a) => actInPeriod(a, ky)), [scoped, ky]);
  const soChuaCoMoc = useMemo(() => countNoTarget(scoped), [scoped]);

  const kyLabel = useMemo(() => periodLabel(ky), [ky]);
  const kyPhase = useMemo(() => periodPhase(ky), [ky]);
  const laKyHienTai = useMemo(() => {
    const bg = periodNow();
    return ky.kind === bg.kind && ky.year === bg.year
      && (ky.kind === "nam" || (ky.kind === "quy" ? ky.quarter === bg.quarter : ky.month === bg.month));
  }, [ky]);

  const scopeLabel = useMemo(() => {
    const parts = [deptScope === "all" ? "Toàn nhà máy" : (DEPTS.find((d) => d.id === deptScope)?.name || deptScope)];
    if (areaSel.length) parts.push(`Khu vực: ${areaSel.join(", ")}`);
    if (critSel.length) parts.push(`Trọng yếu: ${critSel.join(", ")}`);
    parts.push(`Kỳ: ${kyLabel}`);
    return parts.join(" · ");
  }, [deptScope, areaSel, critSel, kyLabel]);

  // Mục 1 nói về CẢ NĂM, mục 2 trở đi nói về KỲ đang chọn. Trước đây cả hai
  // cùng đọc `scopedKy` nên trang có hai mục cùng tên "Tổng quan tháng 7" —
  // người đọc không biết cái nào là cái nào.
  const scopedNam = useMemo(
    () => scoped.filter((a) => Number(String(hanVmp(a) ?? "").slice(0, 4)) === ky.year),
    [scoped, ky.year],
  );

  // ytdSummary lọc bỏ hạng mục Không áp dụng/Đã hủy, nên danh sách chi tiết
  // phải lọc y hệt — bấm vào ô "60" mà ra 63 dòng là mất tin ngay.
  const chiActive = (xs: Activity[]) => xs.filter((a) => (a.state || "active") === "active");
  const scopedNamActive = useMemo(() => chiActive(scopedNam), [scopedNam]);
  const scopedKyActive = useMemo(() => chiActive(scopedKy), [scopedKy]);

  const ytdNam = useMemo(() => ytdSummary(scopedNam), [scopedNam]);
  const ytd = useMemo(() => ytdSummary(scopedKy), [scopedKy]);
  const monthly = useMemo(() => periodSummary(scoped, ky, TARGET_PCT), [scoped, ky]);
  const bottleneck = useMemo(() => stageBottleneck(scopedKy), [scopedKy]);
  const nextMonth = useMemo(() => periodWork(scoped, nextPeriod(ky)), [scoped, ky]);
  const quality = useMemo(() => runDataQualityChecks(scopedKy), [scopedKy]);
  const rawRows = useMemo(() => buildRawRows(scopedKy), [scopedKy]);
  // Truyền nhãn kỳ vào để mọi câu tự nói phạm vi — xem nhanXetTuDong().
  const autoComments = useMemo(() => nhanXetTuDong(scopedKy, kyLabel), [scopedKy, kyLabel]);
  /* BÀN QUẢN TRỊ (spec 01/09): 3 tab theo 3 việc thật của màn — ĐỌC báo
     cáo (mạch 1→5 là sequence thật nên giữ nguyên đánh số), TRA dữ liệu
     thô, và LẤY nhận xét đem đi (email/biên bản). */
  const [tab, setTab] = useNhomTab("reports", "bao-cao", ["bao-cao", "du-lieu", "nhan-xet"]);
  const [daChepNhanXet, setDaChepNhanXet] = useState(false);

  const monthlyChartHtml = useMemo(
    () => svgMonthlyTargetChart(monthly.table, SCREEN_PALETTE, monthly.highlight),
    [monthly],
  );
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

    // Câu về kỳ ĐANG XEM phải nói đúng kỳ đó ở đâu so với hôm nay: kỳ đã qua
    // mới được chốt đạt/trượt, kỳ đang diễn ra chỉ là số giữa kỳ, kỳ chưa tới
    // thì không có gì để chấm.
    const c = monthly.cur;
    parts.push(
      kyPhase === "chua_toi"
        ? `Kỳ ${kyLabel} chưa tới — ${c.due} hạng mục sẽ đến hạn, chưa chấm được.`
        : c.rate == null
          ? `Kỳ ${kyLabel} chưa có hạng mục nào đến hạn.`
          : kyPhase === "dang_dien_ra"
            ? `Kỳ ${kyLabel} đang ở ${c.rate}% (${c.done}/${c.due}) — số giữa kỳ, chưa phải kết quả chốt.`
            : `Kỳ ${kyLabel} chốt ở ${c.rate}% (${c.done}/${c.due}) — ${c.meets ? "đạt" : "chưa đạt"} mục tiêu ${TARGET_PCT}%.`,
    );

    if (futureDue) parts.push(`Còn ${futureDue} hạng mục đến hạn ở các tháng chưa tới kỳ — chưa chấm được, chỉ là khối lượng phải bố trí.`);
    return parts.join(" ");
  }, [monthly, kyPhase, kyLabel]);

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
      { l: "đề cương", n: ytdNam.protocol.done },
      { l: "thẩm định thực tế", n: ytdNam.validation.done },
      { l: "hồ sơ", n: ytdNam.documentation.done },
      { l: "hoàn thành VMP", n: ytdNam.vmp.done },
    ];
    const nguoc: string[] = [];
    for (let i = 1; i < f.length; i++) {
      if (f[i].n > f[i - 1].n) nguoc.push(`${f[i].l} (${f[i].n}) nhiều hơn ${f[i - 1].l} (${f[i - 1].n})`);
    }
    return nguoc.length
      ? `Dữ liệu tự mâu thuẫn: ${nguoc.join("; ")}. Một giai đoạn sau không thể xong nhiều hơn giai đoạn trước — cần rà lại cột trạng thái ở Cập nhật tiến độ.`
      : "";
  }, [ytdNam]);

  const qualityBySeverity = useMemo(() => {
    const m: Record<string, number> = { error: 0, warning: 0, info: 0 };
    for (const q of quality) m[q.severity] = (m[q.severity] || 0) + 1;
    return m;
  }, [quality]);

  // Chỉ chạy AI, không gửi mail. Nút gửi mail nằm riêng và mở hộp thoại chọn
  // người nhận — gộp hai việc vào một nút thì không ai dám bấm thử.
  const generateAi = async (loai: AiKind) => {
    setLoadingAi(true); setErrAi(""); setAi(""); setLoaiAi(loai);
    try {
      const r = await chayPhanTichAi({ loai, pham_vi: deptScope, ky: kyChoAi });
      if (r.ok && r.ai_text) setAi(r.ai_text);
      else setErrAi(r.error ? `Lỗi AI: ${r.error}` : "Không nhận được phản hồi AI từ n8n.");
    } catch (ex) { setErrAi((ex as Error)?.message || "Lỗi kết nối n8n."); }
    finally { setLoadingAi(false); }
  };

  /** Phần tên tệp theo kỳ: 2026-08 · 2026-Q3 · 2026. Chỉ chữ số và gạch,
   *  vì tên tệp tải về không được chứa dấu / của "tháng 8/2026". */
  const tenTepKy = () =>
    ky.kind === "nam" ? `${ky.year}`
      : ky.kind === "quy" ? `${ky.year}-Q${ky.quarter}`
        : `${ky.year}-${String(ky.month).padStart(2, "0")}`;

  // Kỳ gửi sang n8n: AI phải đọc ĐÚNG lát cắt đang hiện trên màn hình, nếu
  // không thì bản nhận xét nói một đằng bảng số nói một nẻo.
  const kyChoAi = useMemo(() => {
    const ms = ky.kind === "nam" ? [1, 12]
      : ky.kind === "quy" ? [(ky.quarter - 1) * 3 + 1, (ky.quarter - 1) * 3 + 3]
        : [ky.month, ky.month];
    // Nhãn kỳ mang luôn tên mốc: nhờ vậy prompt AI và tiêu đề mail tự nói đúng
    // mốc đang tính mà không cần sửa thêm node nào bên n8n.
    return { nam: ky.year, thang_tu: ms[0], thang_den: ms[1], nhan: kyLabel };
  }, [ky, kyLabel]);

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
    download(`BaoCaoQuanLy_VMP_${tenTepKy()}.html`, html);
  };

  const exportExcel = async () => {
    const tongQuan = [
      ["Chỉ số", "Giá trị"],
      ["Phạm vi", scopeLabel],
      ["Kỳ báo cáo", kyLabel],
      ["Chỉ số chính", "Hoàn thành VMP — chia tháng theo mốc đích VMP"],
      ["Tình trạng kỳ", kyPhase === "da_qua" ? "Đã qua" : kyPhase === "dang_dien_ra" ? "Đang diễn ra" : "Chưa tới"],
      ["Cách hiểu số liệu", "Lát cắt theo mốc đích VMP, tính tới hôm nay — không phải ảnh chụp tại thời điểm kỳ đó"],
      ["Tổng hạng mục đang hoạt động", ytd.total],
      ["Đề cương hoàn thành (%)", ytd.protocol.rate], ["Đề cương — đã xong", ytd.protocol.done], ["Đề cương — quá hạn", ytd.protocol.over],
      ["Thẩm định thực tế (%)", ytd.validation.rate], ["Thẩm định — đã xong", ytd.validation.done], ["Thẩm định — quá hạn", ytd.validation.over],
      ["Hồ sơ hoàn thiện (%)", ytd.documentation.rate], ["Hồ sơ — đã xong", ytd.documentation.done], ["Hồ sơ — quá hạn", ytd.documentation.over],
      ["Hoàn thành VMP (%)", ytd.vmp.rate], ["VMP — đã xong", ytd.vmp.done], ["VMP — quá hạn", ytd.vmp.over],
      [], ["Kỳ đang xem", kyLabel],
      ["Cần hoàn thành trong kỳ", monthly.cur.due], ["Đã hoàn thành trong kỳ", monthly.cur.done],
      ["Tỷ lệ kỳ này (%)", monthly.cur.rate ?? "—"], ["Tỷ lệ kỳ trước (%)", monthly.prev?.rate ?? "—"],
    ];

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

    const batCap = [
      ["Bộ phận", "Tổng", "Chậm đề cương", "Chậm thẩm định thực tế", "Chậm báo cáo", "Đang quá hạn VMP", "Tỷ lệ đúng hạn (%)"],
      ...bottleneck.map((r) => [r.label, r.total, r.overProtocol, r.overValidation, r.overReport, r.overVmp, r.onTimeRate]),
    ];

    const thangToi = [
      ["Mã", "Tên", "Loại thẩm định", "Bộ phận", "Người thực hiện", "Hạn đích VMP", "Mức trọng yếu"],
      ...nextMonth.items.map((it) => [it.code, it.name, it.vtype, maBoPhan(it.depts), it.owner, it.target, it.crit]),
    ];

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

    // Làm sạch tên sheet (cấm / \ ? * [ ] :, tối đa 31 ký tự) nằm trong
    // chính helper — "Ky sau tháng 8/2026" không làm hỏng file nữa.
    await xuatExcelAoa([
      { ten: "Tổng quan", dong: tongQuan },
      { ten: "Theo tháng - Mục tiêu", dong: theoThang },
      { ten: "Bất cập theo bộ phận", dong: batCap },
      { ten: `Ky sau ${nextMonth.monthLabel}`, dong: thangToi },
      { ten: "Dữ liệu thô", dong: duLieuTho },
    ], `BaoCaoQuanLy_VMP_${tenTepKy()}_CPC1HN.xlsx`);
  };

  const moChiTiet = (title: string, rows: Activity[], giaiDoan?: GiaiDoan) =>
    setChiTiet({ title, sub: `${scopeLabel} · ${rows.length} hạng mục`, rows, giaiDoan });

  // Phễu ngược: giai đoạn sau xong nhiều hơn giai đoạn trước. Liệt kê đúng
  // những hạng mục gây mâu thuẫn để sửa được ngay, thay vì chỉ báo có lỗi.
  const hangMucMauThuan = useMemo(() => {
    const r = (a: Activity) => (a._raw || {}) as Record<string, unknown>;
    return scopedNamActive.filter((a) => {
      const dc = wlIsDone(r(a).tt_de_cuong);
      const td = wlIsDone(r(a).tt_tham_dinh);
      const bc = wlIsDone(r(a).tt_bao_cao);
      const vmp = wlIsDone(r(a).tt_vmp);
      return (td && !dc) || (bc && !td) || (vmp && !bc);
    });
  }, [scopedNamActive]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ===== Bộ lọc dữ liệu báo cáo — lấy số liệu theo bất kỳ lát cắt nào ===== */}
      <Card>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <CardTitle icon={ListFilter} sub="Áp dụng cho toàn bộ báo cáo bên dưới — kể cả dữ liệu thô và bản xuất. Chọn tháng/quý ở mục 2.">
            Bộ lọc dữ liệu báo cáo quản lý
          </CardTitle>
        </div>
        <div className="vmp-report-command-bar">
          {/* Chỉ còn chọn NĂM ở đây — năm là thứ chi phối cả mục 1 (tổng quan
              năm) lẫn biểu đồ 12 tháng. Chọn tháng/quý nằm trong chính mục 2,
              cạnh con số mà nó đổi. */}
          <div>
            <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 800, marginBottom: 9 }}>Năm báo cáo</div>
            <Sel val={String(ky.year)} set={(v) => setKy((k) => ({ ...k, year: Number(v) }))} opts={namOptions} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 800, marginBottom: 9 }}>Phạm vi (bộ phận)</div>
            <Sel val={deptScope} set={setDeptScope} opts={[{ v: "all", l: "Toàn nhà máy" }, ...DEPTS.map((d) => ({ v: d.id, l: d.name }))]} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 800, marginBottom: 9 }}>Khu vực</div>
            <MultiSelect label="Khu vực" allLabel="Tất cả khu vực" options={areaOptions} selected={areaSel} onChange={setAreaSel} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 800, marginBottom: 9 }}>Mức trọng yếu</div>
            <MultiSelect label="Trọng yếu" allLabel="Tất cả mức" options={critOptions} selected={critSel} onChange={setCritSel} />
          </div>
          <div className="vmp-report-export-actions" role="group" aria-label="Xuất báo cáo">
            {/* #6 (01/09): MỘT primary — Excel là bản mọi người thật sự nộp
                (đủ 5 sheet); PDF/HTML là phụ, cùng một kiểu ghost để không
                tranh nhau bằng ba màu ba kiểu như trước. */}
            <button data-desktop-primary-actionable onClick={exportExcel} style={toolBtn(GRAD, "#fff")}><Download size={16} /> Xuất Excel (đủ 5 sheet)</button>
            <button onClick={printPDF} style={ghostBtn}><Printer size={16} /> PDF</button>
            <button onClick={downloadHtml} style={ghostBtn}><Download size={16} /> HTML</button>
          </div>
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: C.plumSoft, fontWeight: 700, lineHeight: 1.7 }}>
          Đang xem: <b style={{ color: C.plum }}>{scopeLabel}</b>.
          {" "}Mục 1 tính trên <b style={{ color: C.plum }}>{scopedNamActive.length}</b> hạng mục có mốc đích VMP trong năm {ky.year};
          mục 2 trở xuống tính trên <b style={{ color: C.plum }}>{scopedKyActive.length}</b> hạng mục của <b style={{ color: C.plum }}>{kyLabel}</b>.
          {" "}Chỉ số chính là <b style={{ color: C.plum }}>hoàn thành VMP</b>; mức hoàn thành đề cương và thẩm định
          thực tế là dữ liệu bổ sung.
          {soChuaCoMoc > 0 && (
            <> {" "}<span style={{ color: C.marigoldText }}>{soChuaCoMoc} hạng mục chưa có mốc đích VMP nên không thuộc kỳ nào — xem ở mục Chất lượng dữ liệu.</span></>
          )}
        </div>

        {/* Đây là nơi người dùng hay nhầm "báo cáo sai số" nhất: số ở màn Báo
            cáo chỉ tính hạng mục có mốc đích VMP RƠI VÀO năm đang chọn, còn
            màn Tổng quan tính TOÀN BỘ hạng mục đang hoạt động, không lọc theo
            năm. Hai cách đếm khác mục đích (báo cáo theo kỳ vs. bức tranh hiện
            tại), không phải một trong hai bị sai — nói thẳng ra đây để không
            ai phải đi dò lại dữ liệu. */}
        <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: C.plumSoft,
          background: C.pinkMist, borderRadius: 14, padding: "11px 15px", lineHeight: 1.7 }}>
          ℹ️ Số ở đây <b style={{ color: C.plum }}>khác với màn Tổng quan</b> — đây là chủ ý, không phải lỗi:
          màn Báo cáo chỉ đếm hạng mục có <b>mốc đích VMP rơi vào năm {ky.year}</b>, còn màn Tổng quan đếm
          <b> toàn bộ hạng mục đang hoạt động</b> ở mọi năm (kể cả hạng mục quá hạn từ năm trước). Muốn số khớp
          Tổng quan, đổi <b>Năm báo cáo</b> ở trên sang bao trọn các năm cần xem, hoặc đối chiếu ở màn Tổng quan.
        </div>

        {/* Kỳ là LÁT CẮT THEO MỐC ĐÍCH, không phải ảnh chụp quá khứ. Nói thẳng
            ngay cạnh bộ chọn, vì đây đúng là chỗ người đọc dễ hiểu nhầm nhất —
            và hiểu nhầm thì mọi con số bên dưới bị đọc sai theo. */}
        {!laKyHienTai && (
          <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: C.lavText, background: C.lavSoft,
            borderRadius: 14, padding: "11px 15px", lineHeight: 1.7 }}>
            ℹ️ Đang xem kỳ <b>{kyLabel}</b> ({kyPhase === "da_qua" ? "đã qua" : kyPhase === "dang_dien_ra" ? "đang diễn ra" : "chưa tới"}).
            Đây là <b>lát cắt theo mốc đích VMP</b>: những hạng mục có mốc đích rơi vào kỳ, và tính tới <b>hôm nay</b>
            đã hoàn thành VMP bao nhiêu — không phải ảnh chụp tại thời điểm đó. Một hạng mục hạn {kyLabel} mà nay mới
            xong vẫn tính là đã xong, vì dữ liệu chưa ghi ngày hoàn thành thực tế.
          </div>
        )}
      </Card>

      <DongSo cacO={[
        { nhan: "hạng mục năm " + String(ky.year), giaTri: ytd.total, onMo: () => setTab("bao-cao") },
        { nhan: "hoàn thành VMP", giaTri: `${ytd.vmp.rate}%`, phu: `${ytd.vmp.done}/${ytd.total}`, onMo: () => setTab("bao-cao") },
        { nhan: "quá hạn VMP", giaTri: ytd.vmp.over, canhBao: ytd.vmp.over > 0, onMo: () => setTab("du-lieu") },
        { nhan: "nhận xét sẵn dùng", giaTri: autoComments.length, phu: "bấm để lấy", onMo: () => setTab("nhan-xet") },
      ]} />
      <NhomTab man="reports" nhan="Các phần của báo cáo" tab={tab} onTab={setTab} tabs={[
        { id: "bao-cao", nhan: "Báo cáo quản lý" },
        { id: "du-lieu", nhan: "Dữ liệu thô", dem: rawRows.length },
        { id: "nhan-xet", nhan: "Nhận xét & AI", dem: autoComments.length },
      ]} />

      <NhomTabPanel man="reports" id="bao-cao" tab={tab}>
      {/* ===== 1. Tổng quan số liệu tới hiện tại ===== */}
      <Card variant="strong">
        <CardTitle icon={Boxes}
          sub={`Toàn bộ hạng mục có mốc đích VMP trong năm ${ky.year} — không đổi khi bạn chọn tháng bên dưới`}>
          1. Tổng quan năm {ky.year} — đã làm được bao nhiêu
        </CardTitle>
        {/* Hai hàng tách bạch: chỉ số CHÍNH của báo cáo đứng riêng, ba mức giai
            đoạn xuống dưới dán nhãn "bổ sung". Xếp năm ô ngang hàng như bản cũ
            khiến người đọc tưởng cả năm đều là thước đo mục tiêu — trong khi
            chỉ có Hoàn thành VMP mới là. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
          <StatTile icon={Boxes} label={`Tổng hạng mục năm ${ky.year}`} value={ytdNam.total} tone={{ c: C.plum, bg: C.pinkSoft }}
            sub="Bấm để xem danh sách"
            onClick={() => moChiTiet(`Toàn bộ hạng mục · năm ${ky.year}`, scopedNamActive)} />
          <StatTile icon={CheckCircle2} label="★ Hoàn thành VMP — chỉ số chính" value={`${ytdNam.vmp.rate}%`}
            sub={`${ytdNam.vmp.done}/${ytdNam.vmp.total} · quá hạn ${ytdNam.vmp.over} · bấm để xem`} tone={{ c: C.mintText, bg: C.mintSoft }}
            onClick={() => moChiTiet(`Hoàn thành VMP · năm ${ky.year}`, scopedNamActive, "vmp")} />
        </div>

        <div style={{ marginTop: 18, marginBottom: 10, fontSize: 12, color: C.plumSoft, fontWeight: 800, letterSpacing: ".04em" }}>
          DỮ LIỆU BỔ SUNG — ba giai đoạn trước đó, để xem tình hình chứ không phải thước đo mục tiêu
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
          <StatTile icon={ClipboardCheck} label="Đề cương hoàn thành" value={`${ytdNam.protocol.rate}%`}
            sub={`${ytdNam.protocol.done}/${ytdNam.protocol.total} · quá hạn ${ytdNam.protocol.over} · bấm để xem`} tone={{ c: C.lavText, bg: C.lavSoft }}
            onClick={() => moChiTiet(`Đề cương · năm ${ky.year}`, scopedNamActive, "de_cuong")} />
          <StatTile icon={ShieldCheck} label="Thẩm định thực tế" value={`${ytdNam.validation.rate}%`}
            sub={`${ytdNam.validation.done}/${ytdNam.validation.total} · quá hạn ${ytdNam.validation.over} · bấm để xem`} tone={{ c: C.skyText, bg: C.skySoft }}
            onClick={() => moChiTiet(`Thẩm định thực tế · năm ${ky.year}`, scopedNamActive, "tham_dinh")} />
          <StatTile icon={FileCheck2} label="Hồ sơ hoàn thiện" value={`${ytdNam.documentation.rate}%`}
            sub={`${ytdNam.documentation.done}/${ytdNam.documentation.total} · quá hạn ${ytdNam.documentation.over} · bấm để xem`} tone={{ c: C.pinkText, bg: C.pinkSoft }}
            onClick={() => moChiTiet(`Hồ sơ · năm ${ky.year}`, scopedNamActive, "ho_so")} />
        </div>
        {/* Phễu 4 giai đoạn phải giảm dần. Nếu không, dữ liệu tự mâu thuẫn
            (xong báo cáo mà chưa thẩm định) — nói thẳng thay vì để người đọc
            tự phát hiện rồi mất tin vào cả bản báo cáo. */}
        {funnelWarning && (
          <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: C.marigoldText,
            background: C.marigoldSoft, borderRadius: 14, padding: "11px 15px" }}>
            ⚠️ {funnelWarning}
            {hangMucMauThuan.length > 0 && (
              <button type="button"
                onClick={() => moChiTiet(`Hạng mục có trạng thái mâu thuẫn · năm ${ky.year}`, hangMucMauThuan)}
                style={{ marginLeft: 10, fontFamily: TEXT, fontSize: 12, fontWeight: 800, cursor: "pointer",
                  color: C.marigoldText, background: C.surface, border: `1.5px solid ${C.marigoldText}`,
                  borderRadius: 999, padding: "5px 13px" }}>
                Xem {hangMucMauThuan.length} hạng mục
              </button>
            )}
          </div>
        )}
        <TableScroll maxHeight={280} hint={false}>
          {/* Bề mặt sổ (analysis.css): kẻ dòng, tiêu đề dính, caption cho
              trình đọc màn hình. Cột số căn PHẢI — Be Vietnam Pro không có
              chữ số đều bề rộng nên thẳng cột là nhờ căn phải, không nhờ font. */}
          <table className="reg-table" style={{ marginTop: 16 }}>
            <caption>Phân bố {ytdNam.total} hạng mục năm {ky.year} theo giai đoạn trong quy trình thẩm định.</caption>
            <thead><tr><th scope="col">Giai đoạn</th><th scope="col" className="reg-num">Số hạng mục</th></tr></thead>
            <tbody>
              {ytdNam.byStage.map((s) => (
                <tr key={s.id} className={s.count ? "vmp-row" : undefined}
                  role={s.count ? "button" : undefined}
                  onClick={s.count ? () => moChiTiet(`${s.label} · năm ${ky.year}`, scopedNamActive.filter((a) => stageOf(a) === s.id)) : undefined}
                  style={{ cursor: s.count ? "pointer" : "default" }}>
                  <td>{s.label}{s.count > 0 && <span className="reg-muted"> · bấm để xem</span>}</td>
                  <td className="reg-num">{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      {/* ===== 2. Tổng quan kỳ đang chọn — CÓ bộ chọn ngay tại đây =====
          Bộ chọn đặt trong chính thẻ mà nó đổi tên, để không ai phải đoán
          "chọn ở trên thì cái nào bên dưới chạy theo". Mục 1 ở trên là cả năm
          và đứng yên; từ đây trở xuống chạy theo kỳ. */}
      <Card variant="strong">
        <CardTitle icon={CalendarClock} sub="So với kỳ liền trước, cùng phạm vi đang lọc — đổi kỳ thì mục 2, 4, 5 và dữ liệu thô chạy theo">
          2. Tổng quan {kyLabel}
        </CardTitle>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 16,
          background: C.pinkMist, borderRadius: 14, padding: "11px 14px" }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.plumSoft, marginRight: 2 }}>Xem kỳ</span>
          <Sel val={ky.kind} set={(v) => setKy((k) => ({ ...k, kind: v as PeriodKind }))}
            opts={[{ v: "thang", l: "Theo tháng" }, { v: "quy", l: "Theo quý" }, { v: "nam", l: "Cả năm" }]} />
          {ky.kind === "thang" && (
            <Sel val={String(ky.month)} set={(v) => setKy((k) => ({ ...k, month: Number(v), quarter: Math.ceil(Number(v) / 3) }))}
              opts={Array.from({ length: 12 }, (_, i) => ({ v: String(i + 1), l: `Tháng ${i + 1}` }))} />
          )}
          {ky.kind === "quy" && (
            <Sel val={String(ky.quarter)} set={(v) => setKy((k) => ({ ...k, quarter: Number(v), month: (Number(v) - 1) * 3 + 1 }))}
              opts={[1, 2, 3, 4].map((q) => ({ v: String(q), l: `Quý ${q}` }))} />
          )}
          {!laKyHienTai && (
            <button type="button" onClick={() => setKy(periodNow())} title="Quay lại kỳ hiện tại"
              style={{ fontFamily: TEXT, fontSize: 12, fontWeight: 800, color: C.lavText, background: C.lavSoft,
                border: "none", borderRadius: 999, padding: "8px 14px", cursor: "pointer", whiteSpace: "nowrap" }}>
              ↺ Về kỳ này
            </button>
          )}
          <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: C.plumSoft }}>
            Năm chọn ở bộ lọc phía trên
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
          <StatTile icon={CalendarClock} label={`Cần hoàn thành ${kyLabel}`} value={monthly.cur.due}
            sub="Bấm để xem danh sách" tone={{ c: C.plum, bg: C.pinkSoft }}
            onClick={() => moChiTiet(`Hạng mục đến hạn · ${kyLabel}`, scopedKyActive)} />
          <StatTile icon={FileCheck2} label="Đã hoàn thành VMP" value={monthly.cur.done}
            sub={monthly.cur.rate == null ? "Chưa có hạng mục đến hạn" : `${monthly.cur.rate}% trong kỳ · bấm để xem`}
            tone={{ c: C.mintText, bg: C.mintSoft }}
            onClick={() => moChiTiet(`Hoàn thành VMP · ${kyLabel}`, scopedKyActive, "vmp")} />
          <StatTile icon={ShieldCheck} label="Tỷ lệ kỳ trước" value={monthly.prev?.rate == null ? "—" : `${monthly.prev.rate}%`}
            sub={monthly.prev?.rate == null ? "Kỳ trước chưa có hạng mục đến hạn" : `${monthly.prev.done}/${monthly.prev.due} hạng mục`}
            tone={{ c: C.skyText, bg: C.skySoft }} />
          {/* Kỳ chưa kết thúc → nói "tạm", khớp với biểu đồ và câu kết luận.
              Ghi thẳng "Chưa đạt" là chốt sổ một kỳ chưa xong. */}
          <StatTile icon={AlertCircle} label={`So mục tiêu ${TARGET_PCT}%`}
            value={monthly.cur.rate == null ? "—" : kyPhase === "dang_dien_ra" ? (monthly.cur.meets ? "Tạm đạt" : "Tạm dưới") : (monthly.cur.meets ? "Đạt" : "Chưa đạt")}
            sub={monthly.cur.rate == null ? "Chưa có hạng mục đến hạn" : kyPhase === "dang_dien_ra" ? "Số giữa kỳ — kỳ chưa kết thúc" : kyPhase === "chua_toi" ? "Kỳ chưa tới — chưa chấm được" : "Kết quả đã chốt"}
            tone={monthly.cur.meets === false ? { c: C.marigoldText, bg: C.marigoldSoft } : { c: C.mintText, bg: C.mintSoft }} />
        </div>
      </Card>

      {/* ===== 3. Mục tiêu 50%/tháng ===== */}
      <Card variant="strong">
        <CardTitle icon={FileBarChart} sub="Mục tiêu: 50% hạng mục có mốc đích VMP rơi vào tháng đó phải hoàn thành VMP trong tháng">
          3. Đánh giá so với mục tiêu {TARGET_PCT}%/tháng
        </CardTitle>
        {/* Kết luận đặt trước biểu đồ để người đọc biết ngay điều cần chú ý. */}
        <CauKetLuan chinh={targetVerdict} tone={monthly.cur.meets === false ? "warn" : "ok"} />
        <div data-report-monthly-target-chart style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={{ __html: monthlyChartHtml }} />
      </Card>

      {/* ===== 4. Bất cập trong VMP ===== */}
      <Card variant="strong">
        <CardTitle icon={AlertCircle} sub="Chậm đề cương, chậm thẩm định thực tế hay chậm báo cáo — theo từng bộ phận">
          4. Bất cập trong VMP — bộ phận nào chậm
        </CardTitle>
        <CauKetLuan chinh={bottleneckVerdict} tone={bottleneck.length ? "over" : "ok"} />
        {bottleneckChartHtml
          ? <div dangerouslySetInnerHTML={{ __html: bottleneckChartHtml }} />
          : <div style={{ fontSize: 14, color: C.plumSoft, fontWeight: 700, padding: 12 }}>Không có bộ phận nào đang chậm trong phạm vi đang chọn.</div>}
        <div style={{ height: 14 }} />
        <TableScroll maxHeight={320}>
          <table className="reg-table" style={{ minWidth: 720 }}>
            <caption>Số hạng mục chậm theo từng giai đoạn, chia theo bộ phận, trong phạm vi đang lọc.</caption>
            <thead><tr>
              <th scope="col" data-reg-stick>Bộ phận</th><th scope="col" className="reg-num">Tổng</th>
              <th scope="col" className="reg-num">Chậm đề cương</th><th scope="col" className="reg-num">Chậm thẩm định</th>
              <th scope="col" className="reg-num">Chậm báo cáo</th><th scope="col" className="reg-num">Quá hạn VMP</th>
              <th scope="col" className="reg-num">Hoàn thành VMP</th>
            </tr></thead>
            <tbody>
              {bottleneck.map((r) => (
                <tr key={r.dept}>
                  <th scope="row" data-reg-stick>{r.label}</th>
                  <td className="reg-num">{r.total}</td>
                  <td className="reg-num">{r.overProtocol > 0 ? <Tag color={C.lavText} bg={C.lavSoft}>{r.overProtocol}</Tag> : "—"}</td>
                  <td className="reg-num">{r.overValidation > 0 ? <Tag color={C.skyText} bg={C.skySoft}>{r.overValidation}</Tag> : "—"}</td>
                  <td className="reg-num">{r.overReport > 0 ? <Tag color={C.pinkText} bg={C.pinkSoft}>{r.overReport}</Tag> : "—"}</td>
                  <td className="reg-num">{r.overVmp > 0 ? <Tag color={C.raspText} bg={C.raspSoft}>{r.overVmp}</Tag> : "—"}</td>
                  {/* Cột này đếm HOÀN THÀNH, không phải "đúng hạn" — tên cũ
                      làm bộ phận không chậm mốc nào vẫn hiện 0% và đọc ra
                      thành "không có gì đúng hạn". Đổi tên cho khớp phép
                      đếm, và khi chưa hạng mục nào xong thì ghi "—" chứ
                      không ghi 0%: chưa có gì để đo khác với đo ra số 0. */}
                  <td className="reg-num reg-total">
                    {r.total === 0 ? "—" : r.onTimeRate === 0 ? "0% (chưa mục nào xong)" : `${r.onTimeRate}%`}
                  </td>
                </tr>
              ))}
              {!bottleneck.length && <tr><td colSpan={7}>Không có dữ liệu trong phạm vi đang chọn.</td></tr>}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      {/* ===== 5. Công việc dự kiến tháng tới ===== */}
      <Card>
        <CardTitle icon={CalendarClock} sub={`${nextMonth.total} hạng mục có mốc đích VMP rơi vào ${nextMonth.monthLabel}, chưa hoàn thành VMP`}>
          5. Công việc dự kiến {nextMonth.monthLabel}
        </CardTitle>
        {workloadChartHtml && <div dangerouslySetInnerHTML={{ __html: workloadChartHtml }} />}
        <TableScroll maxHeight={340}>
          <table className="reg-table" style={{ minWidth: 720, marginTop: 12 }}>
            <caption>Hạng mục có mốc đích VMP rơi vào {nextMonth.monthLabel}, chưa hoàn thành VMP.</caption>
            <thead><tr>
              <th scope="col">Mã</th><th scope="col">Tên</th><th scope="col">Loại thẩm định</th><th scope="col">Bộ phận</th>
              <th scope="col">Người thực hiện</th><th scope="col">Hạn đích VMP</th><th scope="col">Trọng yếu</th>
            </tr></thead>
            <tbody>
              {nextMonth.items.slice(0, 200).map((it) => (
                <tr key={it.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{it.code}</td><td>{it.name}</td>
                  <td>{it.vtype}</td>
                  <td>{maBoPhan(it.depts)}</td><td>{it.owner}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{it.target}</td><td>{it.crit}</td>
                </tr>
              ))}
              {/* colSpan trước ghi 6 cho bảng 7 cột — dòng "không có dữ liệu"
                  hụt một ô, mép phải bảng thủng. */}
              {!nextMonth.items.length && <tr><td colSpan={7}>Không có hạng mục nào đến hạn {nextMonth.monthLabel} trong phạm vi đang chọn.</td></tr>}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      {/* ===== Chất lượng dữ liệu — RÚT thành một dòng (31/08).
          Thẻ đầy đủ (đếm ba mức + liệt kê 8 vấn đề đầu) là bản sao thu nhỏ
          của màn "Chất lượng dữ liệu" — chính phụ đề cũ cũng thú nhận vậy
          ("xem đầy đủ ở mục Chất lượng dữ liệu"). Hai nơi cùng liệt kê lỗi
          thì bản ở đây luôn là bản thiếu: nó chỉ soát dữ liệu đã tải về
          trình duyệt, còn màn kia rà thẳng trên máy chủ. Báo cáo chỉ cần
          BIẾT dữ liệu nền có sạch không — nên giữ đúng một dòng đếm, còn
          việc TRA lỗi thì sang màn chuyên trách. `quality` vẫn tính vì bản
          xuất HTML/Excel cần nó (buildManagementReportHTML). */}
      </NhomTabPanel>

      <NhomTabPanel man="reports" id="du-lieu" tab={tab}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <AlertCircle size={16} aria-hidden="true" color={quality.length ? C.marigoldText : C.mintText} />
          <span style={{ fontFamily: TEXT, fontSize: 14, fontWeight: 700, color: C.plum, flex: 1, minWidth: 220 }}>
            {quality.length === 0
              ? "Dữ liệu nền của kỳ này sạch — không phát hiện vấn đề nào trong phạm vi đang lọc."
              : `Dữ liệu nền có ${qualityBySeverity.error || 0} lỗi · ${qualityBySeverity.warning || 0} cảnh báo · ${qualityBySeverity.info || 0} thông tin — đã kèm vào bản xuất.`}
          </span>
          <a href="#v=health" style={{ fontSize: 12, fontWeight: 800, color: C.pinkText, textDecoration: "none", whiteSpace: "nowrap" }}>
            Tra từng lỗi → Chất lượng dữ liệu
          </a>
        </div>
      </Card>

      {/* ===== Dữ liệu thô ===== */}
      <Card>
        <CardTitle icon={Boxes} sub={`${rawRows.length} dòng — đúng phạm vi đang lọc phía trên, xuất đầy đủ ở nút Excel`}>
          Dữ liệu thô
        </CardTitle>
        <TableScroll maxHeight={420}>
          <table className="reg-table" style={{ minWidth: 1100 }}>
            <caption>Dữ liệu thô theo phạm vi đang lọc — mỗi dòng một hạng mục với trạng thái bốn giai đoạn.</caption>
            <thead><tr>
              <th scope="col" data-reg-stick>Mã</th><th scope="col">Tên</th><th scope="col">Bộ phận</th><th scope="col">Người thực hiện</th>
              <th scope="col">TT đề cương</th><th scope="col">TT thẩm định</th><th scope="col">TT báo cáo</th><th scope="col">TT VMP</th>
              <th scope="col">Hạn VMP</th><th scope="col">Ngày VMP thực tế</th>
            </tr></thead>
            <tbody>
              {rawRows.slice(0, 500).map((r, i) => (
                <tr key={i}>
                  <th scope="row" data-reg-stick>{r.ma}</th><td>{r.ten}</td><td>{r.bo_phan}</td><td>{r.nguoi_thuc_hien}</td>
                  <td>{r.tt_de_cuong}</td><td>{r.tt_tham_dinh}</td><td>{r.tt_bao_cao}</td><td>{r.tt_vmp}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{r.dl_vmp}</td><td style={{ whiteSpace: "nowrap" }}>{r.ngay_vmp || "—"}</td>
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

      </NhomTabPanel>

      <NhomTabPanel man="reports" id="nhan-xet" tab={tab}>
      {/* ===== Nhận xét ===== */}
      <Card variant="strong">
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <SparkIcon size={18} color={C.pink} />
            <span style={{ fontFamily: TEXT, fontSize: 16, fontWeight: 800, color: C.plum }}>Nhận xét</span>
            <Tag color={C.mintText} bg={C.mintSoft}>Tính từ số liệu</Tag>
          </div>
          {/* Nút KHÔNG bị ẩn khi thiếu cấu hình. Bản cũ giấu nút đi nên trên
              bản deploy thiếu biến môi trường, người dùng tưởng chức năng
              không tồn tại thay vì biết là chưa cấu hình. */}
          <div className="vmp-report-ai-actions" role="group" aria-label="Thao tác gợi ý nhận xét">
            <button onClick={() => generateAi("bao_cao")} disabled={loadingAi || !aiConfigured()}
              title={aiConfigured() ? "Nhận xét trên số đã tổng hợp — nhanh, rẻ" : AI_SETUP_HINT}
              style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 9, padding: "11px 20px",
                borderRadius: 14, fontSize: 14, opacity: loadingAi || !aiConfigured() ? 0.55 : 1,
                cursor: loadingAi || !aiConfigured() ? "not-allowed" : "pointer" }}>
              {loadingAi && loaiAi === "bao_cao" ? <RefreshCw size={16} className="spin" /> : <SparkIcon size={16} />}
              {loadingAi && loaiAi === "bao_cao" ? "Đang tạo gợi ý…" : "Tạo gợi ý nhận xét"}
            </button>
            {/* Nút thứ hai chạy nhánh khác hẳn: AI đọc TỪNG DÒNG dữ liệu thô để
                tìm quy luật chéo hạng mục, không phải diễn giải số đã gộp.
                Nặng token hơn nhiều nên tách nút riêng, và nói thẳng trong
                tooltip là dùng theo tuần/tháng chứ không phải mỗi lần mở trang. */}
            <button onClick={() => generateAi("phan_tich_sau")} disabled={loadingAi || !aiConfigured()}
              title={aiConfigured()
                ? "AI đọc từng dòng dữ liệu thô để tìm quy luật lặp (cùng khu vực, cùng loại thẩm định, chuỗi hạn dồn). Nặng hơn nhiều — nên chạy theo tuần hoặc tháng."
                : AI_SETUP_HINT}
              style={{ ...toolBtn(C.skySoft, C.skyText), opacity: loadingAi || !aiConfigured() ? 0.55 : 1,
                cursor: loadingAi || !aiConfigured() ? "not-allowed" : "pointer" }}>
              {loadingAi && loaiAi === "phan_tich_sau" ? <RefreshCw size={16} className="spin" /> : <Layers size={16} />}
              {loadingAi && loaiAi === "phan_tich_sau" ? "Đang đọc dữ liệu thô…" : "Phân tích sâu dữ liệu"}
            </button>
            <button onClick={() => setMoGuiMail(true)} disabled={!aiConfigured()}
              title={aiConfigured() ? `Chạy lại AI (${AI_NHAN[loaiAi].toLowerCase()}) rồi gửi qua email` : AI_SETUP_HINT}
              style={{ ...toolBtn(C.lavSoft, C.lavText), opacity: aiConfigured() ? 1 : 0.55,
                cursor: aiConfigured() ? "pointer" : "not-allowed" }}>
              <Mail size={16} /> Gửi mail phân tích
            </button>
          </div>
        </div>

        {!aiConfigured() && (
          <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 700, color: C.marigoldText,
            background: C.marigoldSoft, borderRadius: 14, padding: "11px 15px", lineHeight: 1.6 }}>
            ⚠️ {AI_SETUP_HINT}
          </div>
        )}

        {/* BỀ MẶT 1 — dữ liệu xác thực: câu suy trực tiếp từ số liệu thật
            bằng luật cố định, viền liền. Phân biệt với bề mặt AI bên dưới
            (viền đứt) — hai loại nội dung không được trông giống nhau. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <Tag color={C.mintText} bg={C.mintSoft}>Suy từ số liệu thật</Tag>
          {/* Vận hành (spec 01/09): nhận xét sinh ra để ĐEM ĐI — vào email
              giao ban, biên bản họp. Một nút chép cả cụm, hết gõ lại. */}
          <button type="button" onClick={async () => {
            try {
              await navigator.clipboard.writeText(autoComments.map((c) => `- ${c}`).join("\n"));
              setDaChepNhanXet(true); window.setTimeout(() => setDaChepNhanXet(false), 2000);
            } catch { /* clipboard bị chặn thì thôi, chữ vẫn bôi-chép được */ }
          }}
            style={{ padding: "6px 12px", borderRadius: 10, cursor: "pointer",
                     border: `1px solid ${C.pinkSoft}`, background: C.surface, color: C.plum,
                     fontFamily: TEXT, fontSize: 12, fontWeight: 700 }}>
            {daChepNhanXet ? "Đã chép ✓" : "Sao chép nhận xét"}
          </button>
          <span style={{ fontSize: 12, color: C.plumSoft, fontFamily: TEXT, fontWeight: 600 }}>
            luật cố định, không có AI — cùng con số với các bảng trên
          </span>
        </div>
        <div style={{ fontFamily: TEXT, fontSize: 14, color: C.plum, lineHeight: 1.85, fontWeight: 500,
          background: C.pinkMist, borderLeft: `4px solid ${C.pink}`, borderRadius: "0 14px 14px 0", padding: "16px 20px" }}>
          <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 7 }}>
            {autoComments.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>

        {errAi && <div style={{ marginTop: 12, color: C.raspText, fontSize: 14, fontWeight: 800, padding: "13px 15px", borderRadius: 14, background: C.raspSoft, display: "flex", gap: 8, alignItems: "center" }}><AlertCircle size={16} /> {errAi}</div>}
        {loadingAi && <div style={{ padding: 24, textAlign: "center", color: C.plumSoft, fontWeight: 700 }}><RefreshCw size={22} className="spin" color={C.pink} /><div style={{ marginTop: 10 }}>AI đang phân tích…</div></div>}
        {/* BỀ MẶT 2 — AI ĐỀ XUẤT: viền ĐỨT bao quanh cả khối, nhãn đầu và
            lời nhắc cuối. Người ký hồ sơ GMP phải phân biệt được ngay bằng
            mắt đâu là số đo, đâu là gợi ý của máy. */}
        {!loadingAi && !errAi && ai && (
          <div data-ai-surface style={{ marginTop: 14, padding: "14px 16px", borderRadius: 14,
                                        border: `1.5px dashed ${C.lav}`, background: C.surface }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10, flexWrap: "wrap" }}>
              <SparkIcon size={16} color={C.lavText} />
              <span style={{ fontFamily: TEXT, fontSize: 14, fontWeight: 800, color: C.plum }}>
                AI đề xuất · {AI_NHAN[loaiAi]}
              </span>
              <Tag color={C.raspText} bg={C.raspSoft}>Cần QA xác nhận</Tag>
              {loaiAi === "phan_tich_sau" && (
                <Tag color={C.skyText} bg={C.skySoft}>Đọc từng dòng dữ liệu thô · mọi nhận định phải dẫn mã</Tag>
              )}
            </div>
            <div style={{ whiteSpace: "pre-wrap", fontFamily: TEXT, fontSize: 14, color: C.plum, lineHeight: 1.8, fontWeight: 500, background: C.lavSoft, borderLeft: `4px solid ${C.lav}`, borderRadius: "0 14px 14px 0", padding: "18px 22px" }}>{ai}</div>
            <div style={{ marginTop: 10, fontSize: 12, color: C.plumSoft, fontFamily: TEXT, fontWeight: 600 }}>
              Nội dung do AI tạo — đối chiếu với số liệu xác thực ở trên trước khi đưa vào hồ sơ.
            </div>
          </div>
        )}
      </Card>
      </NhomTabPanel>

      <div style={{ ...glass, padding: "10px 16px", fontSize: 12, color: C.plumSoft, fontWeight: 700, textAlign: "center" }}>
        Toàn bộ số liệu trên đọc thẳng từ Supabase tại thời điểm mở trang — không có số nào do AI tạo ra ngoài mục &quot;Nhận xét AI&quot;, và mục đó luôn được đánh dấu cần QA xác nhận.
      </div>

      {chiTiet && (
        <ChiTietKyModal title={chiTiet.title} sub={chiTiet.sub} rows={chiTiet.rows}
          giaiDoan={chiTiet.giaiDoan} onClose={() => setChiTiet(null)} />
      )}

      {moGuiMail && (
        <AiMailModal
          loai={loaiAi} phamVi={deptScope} phamViLabel={scopeLabel} ky={kyChoAi}
          onClose={() => setMoGuiMail(false)}
          onDone={(r) => { if (r.ai_text) { setAi(r.ai_text); setErrAi(""); } }}
        />
      )}
    </div>
  );
}

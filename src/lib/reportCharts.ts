/* =====================================================================
 *  lib/reportCharts.ts — Biểu đồ SVG cho Báo cáo quản lý (2026-07-30)
 *  ---------------------------------------------------------------------
 *  Sinh SVG dạng CHUỖI thay vì JSX để MỘT hàm dùng được cả hai nơi:
 *    - Trên màn hình (ReportsView, qua dangerouslySetInnerHTML) — palette
 *      là biến CSS var(--c-*) nên tự đổi theo sáng/tối.
 *    - Bản in PDF/HTML (buildReportHTML trong helpers.ts) — tài liệu xuất
 *      ra ĐỘC LẬP, không có :root nạp var(--c-*), nên phải dùng palette
 *      hex tĩnh (EXPORT_PALETTE, lấy đúng giá trị light-mode ở index.css).
 *
 *  Không dùng thư viện chart ngoài (recharts đã bị gỡ khỏi app vì không
 *  dùng) — SVG tay, nét mảnh, có <title> làm tooltip, legend cố định thứ
 *  tự màu theo đúng quy ước app: giai đoạn (đề cương=lav, thẩm định=sky,
 *  báo cáo=pink, VMP=mint) và bộ phận (DEPT_COLOR trong constants/vmp.ts).
 * ===================================================================== */
import type { MonthTargetRow, DeptBottleneckRow, NextMonthByDept } from "./reportModel.ts";

export interface ChartPalette {
  ink: string; inkSoft: string; line: string; surface: string;
  mint: string; mintText: string; mintSoft: string;
  sky: string; skyText: string; skySoft: string;
  lav: string; lavText: string; lavSoft: string;
  pink: string; pinkText: string; pinkSoft: string;
  rasp: string; raspText: string; raspSoft: string;
  marigold: string; marigoldText: string; marigoldSoft: string;
}

/** Dùng trên màn hình web — biến CSS, tự đổi sáng/tối theo theme app. */
export const SCREEN_PALETTE: ChartPalette = {
  ink: "var(--c-ink)", inkSoft: "var(--c-ink-soft)", line: "var(--c-line)", surface: "var(--c-surface)",
  mint: "var(--c-mint)", mintText: "var(--c-mint-text)", mintSoft: "var(--c-mint-soft)",
  sky: "var(--c-sky)", skyText: "var(--c-sky-text)", skySoft: "var(--c-sky-soft)",
  lav: "var(--c-lav)", lavText: "var(--c-lav-text)", lavSoft: "var(--c-lav-soft)",
  pink: "var(--c-pink)", pinkText: "var(--c-pink-text)", pinkSoft: "var(--c-pink-soft)",
  rasp: "var(--c-rasp)", raspText: "var(--c-rasp-text)", raspSoft: "var(--c-rasp-soft)",
  marigold: "var(--c-marigold)", marigoldText: "var(--c-marigold-text)", marigoldSoft: "var(--c-marigold-soft)",
};

/** Dùng cho bản xuất PDF/HTML tĩnh — hex thật của theme sáng (index.css :root),
 *  vì tài liệu xuất ra không có biến CSS của app. */
export const EXPORT_PALETTE: ChartPalette = {
  ink: "#2d2d2d", inkSoft: "#6E4869", line: "#e7d9e3", surface: "#ffffff",
  mint: "#2A9E82", mintText: "#146851", mintSoft: "#DAF2E9",
  sky: "#4497D2", skyText: "#1F6796", skySoft: "#E1F0FA",
  lav: "#8168CE", lavText: "#5F44AD", lavSoft: "#EDE8FB",
  pink: "#E4749F", pinkText: "#A83364", pinkSoft: "#FBE4EF",
  rasp: "#D6486D", raspText: "#B62E52", raspSoft: "#FBE1E8",
  marigold: "#DE9128", marigoldText: "#8D550A", marigoldSoft: "#FAEDD3",
};

/** Màu theo BỘ PHẬN — cùng thứ tự cố định với DEPT_COLOR trong constants/vmp.ts
 *  (xsx=pink, cd=sky, kho=marigold, qc=mint, rd=rasp, qa=lav). Tách ra đây để
 *  dùng được cả hai palette (màn hình / bản xuất) mà không đổi thứ tự màu. */
export function deptColorMap(pal: ChartPalette): Record<string, string> {
  return { xsx: pal.pink, cd: pal.sky, kho: pal.marigold, qc: pal.mint, rd: pal.rasp, qa: pal.lav };
}

const MONTH_LABEL = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function svgWrap(width: number, height: number, body: string, title: string): string {
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${esc(title)}" style="display:block;max-width:100%">${body}</svg>`;
}

function legendRow(items: Array<{ color: string; label: string }>, x: number, y: number): string {
  let out = "";
  let cx = x;
  for (const it of items) {
    out += `<circle cx="${cx}" cy="${y}" r="4.5" fill="${it.color}" />`;
    out += `<text x="${cx + 10}" y="${y + 4}" font-size="11" font-weight="700">${esc(it.label)}</text>`;
    cx += 16 + it.label.length * 6.4 + 22;
  }
  return out;
}

/* ======================== 1. THÁNG × MỤC TIÊU (bar + đường mục tiêu) ======================== */

/** @param highlight Các tháng thuộc kỳ đang xem — tô nền để mắt bám được
 *  chỗ đang đọc trong dải 12 tháng. Rỗng = không tô (xem cả năm). */
export function svgMonthlyTargetChart(
  rows: MonthTargetRow[], pal: ChartPalette = SCREEN_PALETTE, highlight: number[] = [],
): string {
  const W = 720, H = 240;
  const padL = 34, padR = 12, padT = 14, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const target = rows[0]?.target ?? 50;
  const bw = plotW / rows.length;
  const yOf = (pct: number) => padT + plotH - (pct / 100) * plotH;

  // Vẽ nền TRƯỚC lưới và cột, nếu không nó phủ mất số.
  const hl = highlight.length && highlight.length < rows.length
    ? rows.map((r, i) => (highlight.includes(r.month)
      ? `<rect x="${padL + i * bw}" y="${padT}" width="${bw}" height="${plotH}" fill="${pal.line}" opacity=".38" />`
      : "")).join("")
    : "";

  let bars = "";
  rows.forEach((r, i) => {
    const cx = padL + i * bw + bw / 2;
    const barW = Math.min(30, bw * 0.55);

    // Hai trường hợp KHÔNG được vẽ cột tỷ lệ, vì vẽ ra là kết luận sai:
    //   · due = 0        → chưa có hạng mục nào đến hạn
    //   · chưa tới kỳ    → tháng chưa xảy ra, 0% là đương nhiên chứ không
    //                      phải "trượt mục tiêu"
    // Cả hai vẽ vạch trung tính ở đáy; tháng chưa tới kỳ ghi kèm khối lượng
    // sắp phải làm, vì đó mới là thông tin hữu ích của cột đó.
    if (r.due === 0 || r.phase === "chua_toi") {
      const note = r.due === 0
        ? "chưa có hạng mục đến hạn"
        : `chưa tới kỳ · ${r.due} hạng mục sẽ đến hạn`;
      bars += `<rect x="${cx - barW / 2}" y="${yOf(0) - 3}" width="${barW}" height="3" rx="1.5" fill="${pal.line}">` +
        `<title>${esc(MONTH_LABEL[i])}: ${note}</title></rect>`;
      if (r.phase === "chua_toi" && r.due > 0) {
        bars += `<text x="${cx}" y="${yOf(0) - 9}" font-size="9.5" font-weight="700" text-anchor="middle" fill="${pal.inkSoft}">${r.due}</text>`;
      }
      return;
    }

    const rate = r.rate ?? 0;
    // Tháng đang diễn ra dùng màu riêng: số là thật nhưng mới giữa kỳ, chưa
    // phải kết quả chốt — tô đỏ như tháng đã qua sẽ nặng hơn thực tế.
    const color = r.phase === "dang_dien_ra" ? pal.marigold : (r.meets ? pal.mint : pal.rasp);
    // Nhãn số KHÔNG dùng màu cột. Màu cột là sắc giữa (mint #2A9E82 trên nền
    // trắng chỉ đạt ~3.5:1) — đủ cho một khối tô lớn, không đủ cho chữ 10px.
    // Dùng tông chữ đậm cùng họ: vẫn phân biệt được trạng thái, mà đọc được.
    const inkColor = r.phase === "dang_dien_ra" ? pal.marigoldText : (r.meets ? pal.mintText : pal.raspText);
    const ket = r.phase === "dang_dien_ra"
      ? `đang diễn ra, tạm ${r.meets ? "đạt" : "dưới"} mục tiêu ${target}%`
      : `${r.meets ? "đạt" : "chưa đạt"} mục tiêu ${target}%`;
    const h = Math.max(2, (rate / 100) * plotH);
    bars += `<rect x="${cx - barW / 2}" y="${yOf(rate)}" width="${barW}" height="${h}" rx="4" fill="${color}">` +
      `<title>${esc(MONTH_LABEL[i])}: ${rate}% (${r.done}/${r.due} hạng mục) — ${ket}</title></rect>`;
    // Nhãn số — chỉ ở cột có dữ liệu, tránh rợp chữ.
    bars += `<text x="${cx}" y="${yOf(rate) - 6}" font-size="10.5" font-weight="800" text-anchor="middle" fill="${inkColor}">${rate}%</text>`;
  });

  const axisLabels = rows.map((_r, i) =>
    `<text x="${padL + i * bw + bw / 2}" y="${H - 8}" font-size="10.5" font-weight="700" text-anchor="middle" fill="${pal.inkSoft}">${MONTH_LABEL[i]}</text>`).join("");

  const targetY = yOf(target);
  const targetLine = `<line x1="${padL}" y1="${targetY}" x2="${W - padR}" y2="${targetY}" stroke="${pal.raspText}" stroke-width="1.5" stroke-dasharray="5 4" />` +
    `<text x="${W - padR}" y="${targetY - 5}" font-size="10.5" font-weight="800" text-anchor="end" fill="${pal.raspText}">Mục tiêu ${target}%</text>`;

  const axisY = [0, 25, 50, 75, 100].map((v) =>
    `<line x1="${padL}" y1="${yOf(v)}" x2="${W - padR}" y2="${yOf(v)}" stroke="${pal.line}" stroke-width="1" />` +
    `<text x="${padL - 6}" y="${yOf(v) + 3}" font-size="9.5" text-anchor="end" fill="${pal.inkSoft}">${v}</text>`).join("");

  // Chú giải nằm HẲN DƯỚI dải nhãn tháng (nhãn ở y = H - 8). Đặt trong padB
  // như trước làm nó đè lên T1..T7 — chữ chồng chữ, đọc không ra.
  const legendY = H + 14;
  const legend = legendRow([
    { color: pal.mint, label: "Đạt mục tiêu" },
    { color: pal.rasp, label: "Chưa đạt" },
    { color: pal.marigold, label: "Đang diễn ra" },
    { color: pal.line, label: "Chưa tới kỳ" },
  ], padL, legendY);

  return svgWrap(W, legendY + 12, `<g fill="${pal.ink}">${hl}${axisY}${targetLine}${bars}${axisLabels}</g><g fill="${pal.ink}">${legend}</g>`,
    "Tỷ lệ hoàn thành VMP theo tháng so với mục tiêu");
}

/* ======================== 2. BẤT CẬP THEO BỘ PHẬN (3 giai đoạn) ======================== */

export function svgDeptBottleneckChart(rows: DeptBottleneckRow[], pal: ChartPalette = SCREEN_PALETTE): string {
  const rowH = 30, gap = 8, padL = 96, padR = 46, padT = 10, padB = 34;
  // Bỏ bộ phận KHÔNG chậm ở cả ba giai đoạn. Vẽ ra thì chúng chiếm một
  // dòng trống hoàn toàn — người đọc phải xác nhận "à, dòng này rỗng" cho
  // từng dòng một. Bộ phận đó vẫn nằm đủ trong bảng ngay bên dưới.
  const chartRows = rows
    .filter((r) => r.overProtocol > 0 || r.overValidation > 0 || r.overReport > 0)
    .slice(0, 8); // đủ 6 bộ phận thật + chừa chỗ nếu tách nhóm
  if (!chartRows.length) return "";
  const W = 640;
  const H = padT + chartRows.length * (rowH + gap) + padB;
  const plotW = W - padL - padR;
  const maxVal = Math.max(1, ...chartRows.flatMap((r) => [r.overProtocol, r.overValidation, r.overReport]));
  const sub = rowH / 3.4;

  let body = "";
  chartRows.forEach((r, i) => {
    const y0 = padT + i * (rowH + gap);
    body += `<text x="${padL - 10}" y="${y0 + rowH / 2 + 4}" font-size="11.5" font-weight="800" text-anchor="end" fill="${pal.ink}">${esc(r.label)}</text>`;
    // Cặp (màu khối, màu chữ): khối tô dùng sắc giữa, chữ dùng tông đậm —
    // sky #4497D2 và pink #E4749F ở cỡ 10px là không đọc nổi trên nền trắng.
    const series: Array<[number, string, string, string]> = [
      [r.overProtocol, pal.lav, "chậm đề cương", pal.lavText],
      [r.overValidation, pal.sky, "chậm thẩm định thực tế", pal.skyText],
      [r.overReport, pal.pink, "chậm báo cáo", pal.pinkText],
    ];
    series.forEach(([val, color, name, inkColor], si) => {
      const w = (val / maxVal) * plotW;
      const y = y0 + si * sub;
      body += `<rect x="${padL}" y="${y}" width="${Math.max(w, val > 0 ? 3 : 0)}" height="${sub - 2}" rx="3" fill="${color}">` +
        `<title>${esc(r.label)} — ${name}: ${val} hạng mục</title></rect>`;
      if (val > 0) body += `<text x="${padL + Math.max(w, 3) + 6}" y="${y + sub / 2 + 3}" font-size="10" font-weight="700" fill="${inkColor}">${val}</text>`;
    });
  });

  const legend = legendRow([
    { color: pal.lav, label: "Chậm đề cương" },
    { color: pal.sky, label: "Chậm thẩm định thực tế" },
    { color: pal.pink, label: "Chậm báo cáo" },
  ], padL, H - 10);

  return svgWrap(W, H, `<g>${body}</g><g>${legend}</g>`, "Bất cập theo bộ phận — chậm ở giai đoạn nào");
}

/* ======================== 3. VIỆC THÁNG TỚI THEO BỘ PHẬN ======================== */

export function svgDeptWorkloadChart(
  rows: NextMonthByDept[], deptColor: Record<string, string>, pal: ChartPalette = SCREEN_PALETTE,
): string {
  const rowH = 24, gap = 8, padL = 96, padR = 40, padT = 8, padB = 8;
  const W = 560;
  const H = padT + rows.length * (rowH + gap) + padB;
  const plotW = W - padL - padR;
  const maxVal = Math.max(1, ...rows.map((r) => r.count));

  let body = "";
  rows.forEach((r, i) => {
    const y = padT + i * (rowH + gap);
    const color = deptColor[r.dept] || pal.sky;
    const w = Math.max(4, (r.count / maxVal) * plotW);
    body += `<text x="${padL - 10}" y="${y + rowH / 2 + 4}" font-size="11.5" font-weight="800" text-anchor="end" fill="${pal.ink}">${esc(r.label)}</text>`;
    body += `<rect x="${padL}" y="${y}" width="${w}" height="${rowH}" rx="6" fill="${color}"><title>${esc(r.label)}: ${r.count} hạng mục đến hạn tháng tới</title></rect>`;
    // Số ghi cạnh thanh dùng mực chính: sáu màu bộ phận có màu đủ nhạt để
    // chữ nhỏ mất tương phản, mà danh tính bộ phận đã có nhãn bên trái rồi.
    body += `<text x="${padL + w + 8}" y="${y + rowH / 2 + 4}" font-size="11" font-weight="800" fill="${pal.ink}">${r.count}</text>`;
  });

  return svgWrap(W, H, body, "Việc dự kiến tháng tới theo bộ phận");
}

/* WorkloadPage.jsx — Ma trận tải công việc Người × Tháng */
import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import { Activity, AlertTriangle, CheckCircle2, Gauge, ShieldAlert, Users, UserX } from "lucide-react";
import { C, TEXT, NUM, GRAD } from "../constants/theme.ts";
import { WL_MONTHS, WL_QUARTERS, CAP_MONTH, CAP_HOSO_MONTH, vmpToday } from "../constants/vmp.ts";
import { parseD, fmtVN, clamp, wlMonthOf, wlPending, congConLai, hoSoConLai } from "../utils/helpers.ts";
// lucide-react cũng xuất icon tên Activity (dùng ở dưới) nên đặt tên khác cho kiểu.
import type { Activity as PlanActivity } from "../types/domain.ts";
import { Card, CardTitle, Tag, Donut, Pill, CauKetLuan } from "../components/ui/Primitives.tsx";
import ViewportDialog from "../components/ui/ViewportDialog.tsx";
import NhomTab, { NhomTabPanel, DongSo, useNhomTab } from "../components/ui/NhomTab.tsx";
import type { ValiMood } from "../components/brand/ValiIllustration.tsx";

/* Nhãn tâm trạng của Vali — CÙNG lời với màn "Việc hôm nay" (đồng nhất
 * nhân vật 31/08): một tâm trạng, một tên gọi, trên mọi màn. */
const NHAN_MOOD: Record<string, string> = {
  concern: "đang lo", celebrate: "nhẹ nhõm", guide: "dẫn đường",
  urgent: "rất lo", focus: "tập trung",
};

const sum = (arr: number[]): number => arr.reduce((a, b) => a + b, 0);

/** Một ô trong ma trận Người × Tháng. */
interface WlCell { tasks: PlanActivity[]; cong: number; hoso: number }

/** Tải công việc của một người trong cả năm, chia theo 12 tháng. */
interface WlPerson {
  name: string;
  months: WlCell[];
  congTotal: number;
  hosoTotal: number;
  count: number;
  over: number;
  critCao: number;
}

export function WorkloadDetailModal({ detail, onClose }: {
  detail: { title: string; tasks: PlanActivity[]; [k: string]: unknown };
  onClose: () => void;
}) {
  const tasks = [...detail.tasks].sort(
    (a, b) => (parseD(a.target)?.getTime() ?? 0) - (parseD(b.target)?.getTime() ?? 0),
  );
  const [daChep, setDaChep] = useState(false);
  const PhaseChip = ({ label, done, cong }: { label: string; done: boolean; cong?: number | null }) => <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 800, padding: "3px 9px", borderRadius: 999, color: done ? C.mintText : C.marigoldText, background: done ? C.mintSoft : C.marigoldSoft }}>{done ? "✓" : "⏳"} {label}{!done && cong != null ? ` ${cong}nc` : ""}</span>;
  return (
    <ViewportDialog open onRequestClose={onClose} maxWidth={620} title={detail.title} icon={Activity}
      footer={(
        <button type="button" onClick={onClose} style={{ fontFamily: TEXT, fontSize: 14, fontWeight: 800, color: C.plumSoft,
          background: C.surface, border: `1.5px solid ${C.pinkSoft}`, borderRadius: 14, padding: "11px 18px", cursor: "pointer" }}>
          Đóng
        </button>
      )}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>{tasks.length} hạng mục · còn lại <b style={{ color: C.lavText }}>{sum(tasks.map(congConLai))} ngày công</b> · <b style={{ color: C.pinkText }}>{tasks.filter(hoSoConLai).length} hồ sơ</b></span>
        {/* Vận hành (spec 01/09): điều phối viên cần DANH SÁCH MÃ để dán vào
            email/biên bản họp — trước đây phải gõ tay lại từng mã. */}
        <button type="button" onClick={async () => {
          try {
            await navigator.clipboard.writeText(tasks.map((a) => String(a.code)).join(", "));
            setDaChep(true); window.setTimeout(() => setDaChep(false), 2000);
          } catch { /* clipboard bị chặn — nút không nổ, người dùng vẫn gõ tay được */ }
        }}
          style={{ marginLeft: "auto", padding: "7px 13px", borderRadius: 10, cursor: "pointer",
                   border: `1px solid ${C.pinkSoft}`, background: C.surface, color: C.plum,
                   fontFamily: TEXT, fontSize: 12, fontWeight: 700 }}>
          {daChep ? "Đã chép ✓" : `Chép ${tasks.length} mã`}
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {tasks.map((a) => {
          const ph = wlPending(a);
          return (
            <div key={a.id} style={{ background: C.surface, border: `1.5px solid ${C.pinkSoft}`, borderRadius: 14, padding: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 7 }}>
                <Tag color={C.lavText} bg={C.lavSoft}>{a.vtype}</Tag>
                <span style={{ fontFamily: TEXT, fontSize: 14, fontWeight: 800, color: C.plum }}>{a.name}</span>
                <Pill s={a.st} small />
              </div>
              <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginBottom: 9 }}>{a.code} · {a.owner} · đích {a.target ? fmtVN(parseD(a.target)) : "—"} · còn <b style={{ color: C.lavText }}>{congConLai(a)} nc</b></div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                <PhaseChip label="Đề cương" done={!ph.p} />
                <PhaseChip label="Thẩm định" done={!ph.v} cong={Number(a.effort) > 0 ? Number(a.effort) : null} />
                <PhaseChip label="Báo cáo" done={!ph.r} />
              </div>
            </div>
          );
        })}
      </div>
    </ViewportDialog>
  );
}

/* ---------------------------------------------------------------------
 * CHỈ MỤC BIÊN — điều hướng trong trang cho bề mặt sổ.
 *
 * Màn này cuộn qua sáu khối lớn và trước giờ không có neo nào, nên muốn
 * đối chiếu "sức tải từng người" với "ma trận" là phải cuộn đi cuộn lại
 * và tự nhớ mình đang ở đâu.
 *
 * Đánh số 01·02·03 KHÔNG phải để trang trí: sổ kiểm soát có thứ tự thật,
 * và chính app đã dùng lối trích dẫn ấy (phụ đề màn Báo cáo viết "đổi kỳ
 * thì mục 2, 4, 5 chạy theo" — trong khi không mục nào hiện số). Số hiển
 * thị làm cho lối nói đó tra được.
 *
 * Dùng IntersectionObserver chứ không nghe `scroll`: không tính lại vị
 * trí mỗi khung hình, và tự im khi tab bị ẩn.
 * ------------------------------------------------------------------- */
/* RegisterIndex + MUC_SO đã GỠ (spec Bàn quản trị 01/09): sổ-cuộn-dọc 5 mục
 * thay bằng TAB thật (NhomTab) — mỗi tab một câu hỏi vận hành, không phải
 * cuộn qua mọi thứ để tìm một mục. */

export default function WorkloadView({ acts }: { acts: PlanActivity[] }) {
  const [scope, setScope] = useState("month");
  const [metric, setMetric] = useState("cong");
  const [detail, setDetail] = useState<{ title: string; tasks: PlanActivity[] } | null>(null);
  const TAB_IDS = ["suc-tai", "ma-tran", "nhom-viec", "theo-nguoi", "trong-yeu"] as const;
  const [tab, setTab] = useNhomTab("workload", "suc-tai", TAB_IDS);

  const pend = useMemo(() => acts.filter((a) => a.st !== "done" && wlMonthOf(a) >= 0), [acts]);

  const people = useMemo(() => {
    const map: Record<string, WlPerson> = {};
    pend.forEach((a) => {
      const mi = wlMonthOf(a);
      // Hạng mục chưa ai phụ trách gom thành MỘT "người" tên rõ ràng — trước
      // đây hiện là "—", trông như một nhân sự tên gạch ngang gánh 180 việc.
      const owner = a.owner && a.owner !== "—" ? a.owner : "Chưa phân công";
      if (!map[owner]) map[owner] = { name: owner, months: Array.from({ length: 12 }, () => ({ tasks: [], cong: 0, hoso: 0 })), congTotal: 0, hosoTotal: 0, count: 0, over: 0, critCao: 0 };
      const o = map[owner], cell = o.months[mi];
      const c = congConLai(a), h = hoSoConLai(a) ? 1 : 0;
      cell.tasks.push(a); cell.cong += c; cell.hoso += h;
      o.congTotal += c; o.hosoTotal += h; o.count++;
      if (a.st === "over") o.over++;
      if (a.crit === "Cao") o.critCao++;
    });
    return Object.values(map).sort((x, y) => y.congTotal - x.congTotal);
  }, [pend]);

  const cols = scope === "month" ? WL_MONTHS : scope === "quarter" ? WL_QUARTERS : ["Cả năm"];
  const unitMonths = scope === "month" ? 1 : scope === "quarter" ? 3 : 12;
  const congCap = CAP_MONTH * unitMonths;
  const cap = metric === "cong" ? congCap : CAP_HOSO_MONTH * unitMonths;
  const monthsOfCol = (ci: number): number[] => scope === "month" ? [ci] : scope === "quarter" ? [ci * 3, ci * 3 + 1, ci * 3 + 2] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const valIn = (p: WlPerson, ci: number): number => sum(monthsOfCol(ci).map((mi) => metric === "cong" ? p.months[mi].cong : p.months[mi].hoso));
  const tasksIn = (p: WlPerson, ci: number): PlanActivity[] => monthsOfCol(ci).flatMap((mi) => p.months[mi].tasks);
  const peakMonth = (p: WlPerson) => {
    let mx = 0, mi = -1;
    p.months.forEach((m, i) => { if (m.cong > mx) { mx = m.cong; mi = i; } });
    return { eff: mx, mi };
  };

  /* Thang tải — HAI kênh, không chỉ màu.
   *
   * Bản trước trả về `{ bg: C.rasp + "66" }`. `C.rasp` là chuỗi
   * "var(--c-rasp)" chứ không phải hex, nên phép nối ra "var(--c-rasp)66"
   * — CSS không hợp lệ, trình duyệt bỏ nguyên khai báo. Cả bốn bậc màu,
   * viền ô và hai ô chú giải đều chết: ma trận chỉ còn số trần. Nay nền
   * do CSS lo bằng `color-mix()` trên `[data-band]`, TSX chỉ nói bậc.
   *
   * Khấc là kênh thứ hai, đọc được khi không phân biệt được màu — thang
   * cường độ mà chỉ mã hoá bằng màu là vi phạm luật "không dùng màu đơn
   * thuần để truyền tin". */
  const BAC_TAI = {
    idle: { notch: "▁", nhan: "nhẹ" },
    low: { notch: "▃", nhan: "vừa" },
    busy: { notch: "▅", nhan: "sắp đầy" },
    over: { notch: "▇", nhan: "quá tải" },
  } as const;
  type BacTai = keyof typeof BAC_TAI;

  const bacTai = (val: number, capv: number): BacTai => {
    const ratio = capv > 0 ? val / capv : 0;
    if (ratio > 1) return "over";
    if (ratio >= 0.85) return "busy";
    if (ratio >= 0.5) return "low";
    return "idle";
  };

  const totalCong = sum(pend.map(congConLai));
  const totalHoso = pend.filter(hoSoConLai).length;
  /* "Chưa phân công" là một ĐỐNG VIỆC vô chủ, không phải nhân sự. Bản trước
     gộp nó vào danh sách người: nó có avatar chữ "C", được xếp hạng trong
     bảng cá nhân, và được đếm vào câu "7 bạn đang quá tải" — trong khi câu
     kết luận ngay dưới đếm đúng 6. Hai con số cạnh nhau, lệch nhau, cùng
     một trang. Tách hẳn ra: người là người, việc vô chủ là việc vô chủ. */
  const LA_VO_CHU = "Chưa phân công";
  const nguoiThat = people.filter((p) => p.name !== LA_VO_CHU);
  const voChu = people.find((p) => p.name === LA_VO_CHU) || null;
  const overloaded = nguoiThat.filter((p) => peakMonth(p).eff > CAP_MONTH);
  const critCount: Record<string, number> = { Cao: 0, TB: 0, "Thấp": 0 };
  pend.forEach((a) => {
    const k = String(a.crit ?? "");
    critCount[k] = (critCount[k] || 0) + 1;
  });

  // Phân công theo NHÓM VIỆC — bảng phân công QA 2026 chia theo nhóm hệ
  // thống chứ không theo từng thiết bị, nên đây mới là đơn vị người dùng
  // thật sự quản lý. Đọc thẳng work_group đã đồng bộ vào vmp_plan_items.
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; acts: PlanActivity[]; owners: Set<string> }>();
    for (const a of acts) {
      const g = String(a.group || "(chưa phân nhóm)");
      if (!m.has(g)) m.set(g, { name: g, acts: [], owners: new Set() });
      const rec = m.get(g)!;
      rec.acts.push(a);
      if (a.owner && a.owner !== "—") rec.owners.add(a.owner);
      if (a.support) rec.owners.add(String(a.support));
    }
    return [...m.values()]
      .map((g) => {
        const done = g.acts.filter((a) => a.st === "done").length;
        const over = g.acts.filter((a) => a.st === "over").length;
        return { ...g, done, over, total: g.acts.length,
                 rate: g.acts.length ? Math.round((done / g.acts.length) * 100) : 0 };
      })
      .sort((a, b) => (a.name === "(chưa phân nhóm)" ? 1 : b.name === "(chưa phân nhóm)" ? -1
                       : b.total - a.total));
  }, [acts]);

  // Bảng vinh danh — trước nằm ở màn Tổng quan, tách khỏi ma trận tải nên
  // phải nhớ hai chỗ mới biết ai đang làm gì. Gộp về đây.
  const board = useMemo(() => {
    const m = new Map<string, { name: string; total: number; done: number; over: number }>();
    for (const a of acts) {
      // Hạng mục chưa có người thì KHÔNG vào bảng tiến độ theo người — nó
      // được nói riêng ở thẻ cảnh báo phía trên.
      if (!(a.owner && a.owner !== "—")) continue;
      const k = a.owner;
      if (!m.has(k)) m.set(k, { name: k, total: 0, done: 0, over: 0 });
      const r = m.get(k)!;
      r.total++;
      if (a.st === "done") r.done++;
      if (a.st === "over") r.over++;
    }
    return [...m.values()]
      .map((r) => ({ ...r, rate: r.total ? Math.round((r.done / r.total) * 100) : 0 }))
      .sort((a, b) => b.rate - a.rate || b.total - a.total);
  }, [acts]);

  const openDetail = (title: string, tasks: PlanActivity[]) => {
    if (tasks.length) setDetail({ title, tasks });
  };
  const Btn = ({ on, onClick, children, primary = false }: { on: boolean; onClick: () => void; children: ReactNode; primary?: boolean }) => <button data-desktop-primary-actionable={primary || undefined} onClick={onClick} style={{ padding: "8px 15px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: TEXT, fontSize: 12, fontWeight: 800, background: on ? GRAD : C.pinkSoft, color: on ? "#fff" : C.plumSoft }}>{children}</button>;
  /* ---------------- Câu kết luận của từng biểu đồ ----------------
   * Ba biểu đồ dưới đây trước giờ chỉ bày số. Người xem phải tự quét 20
   * thẻ người, 12 cột tháng rồi tự rút ra "ai quá tải, tháng nào" — đúng
   * công việc mà biểu đồ sinh ra để làm hộ. Mỗi câu dưới đây tính từ
   * chính dữ liệu đang vẽ, không ước lượng. */
  const klSucTai = useMemo(() => {
    // "Chưa phân công" là một ĐỐNG VIỆC, không phải một nhân sự. Xếp nó vào
    // bảng xếp hạng người bận nhất là nói sai: nó không quá tải, nó vô chủ.
    // Tách riêng và nói riêng, vì cách xử lý cũng khác hẳn — một bên là giãn
    // lịch, một bên là phải phân người.
    const thuc = people.filter((p) => p.name !== "Chưa phân công");
    const voChu = people.find((p) => p.name === "Chưa phân công");
    const voChuCau = voChu
      ? ` Ngoài ra còn ${voChu.congTotal} ngày công (${voChu.count} hạng mục) chưa có ai đứng tên — chưa nằm trong sức tải của bất kỳ ai.`
      : "";
    if (!thuc.length) {
      return voChu
        ? {
          chinh: `Toàn bộ ${voChu.count} hạng mục còn lại chưa phân cho ai (${voChu.congTotal} ngày công).`,
          phu: "Chưa phân người thì không tính được sức tải — đây là việc phải làm trước.",
          tone: "over" as const,
        }
        : null;
    }
    const xep = thuc.map((p) => ({ p, pk: peakMonth(p) })).sort((a, b) => b.pk.eff - a.pk.eff);
    const nang = xep[0];
    const quaTai = thuc.filter((p) => peakMonth(p).eff > CAP_MONTH);
    const tbCong = thuc.reduce((s, p) => s + p.congTotal, 0) / thuc.length;
    if (!quaTai.length) {
      return {
        chinh: `Không ai quá tải: người bận nhất là ${nang.p.name}, cao điểm ${nang.pk.eff} ngày công `
          + `ở ${WL_MONTHS[nang.pk.mi] || "—"} (ngưỡng ${CAP_MONTH}).`,
        phu: `Trung bình mỗi người còn ${Math.round(tbCong)} ngày công trong năm.${voChuCau}`,
        tone: (voChu ? "warn" : "ok") as "warn" | "ok",
      };
    }
    return {
      chinh: `${quaTai.length} người vượt ngưỡng ${CAP_MONTH} ngày công ở tháng cao điểm — `
        + `nặng nhất là ${nang.p.name}: ${nang.pk.eff} ngày công dồn vào ${WL_MONTHS[nang.pk.mi] || "—"}.`,
      phu: `Gấp ${(nang.pk.eff / CAP_MONTH).toFixed(1)} lần ngưỡng. Giãn bớt hạng mục của tháng đó sang tháng trống là cách rẻ nhất, `
        + `trước khi tính tới chuyện thêm người.${voChuCau}`,
      tone: (nang.pk.eff > CAP_MONTH * 1.5 ? "over" : "warn") as "over" | "warn",
    };
  }, [people]);

  const klMaTran = useMemo(() => {
    let nong: { ten: string; cot: string; v: number } | null = null;
    people.forEach((p) => cols.forEach((c, ci) => {
      const v = valIn(p, ci);
      if (!nong || v > nong.v) nong = { ten: p.name, cot: c, v };
    }));
    const o = nong as { ten: string; cot: string; v: number } | null;
    if (!o || o.v <= 0) return null;
    const donVi = metric === "cong" ? "ngày công" : "hồ sơ";
    const quaCap = o.v > cap;
    const voChu = o.ten === "Chưa phân công";
    return {
      chinh: `Ô nóng nhất: ${o.ten} · ${o.cot} — ${o.v} ${donVi}${quaCap ? `, vượt ngưỡng ${cap}` : ""}.`,
      phu: voChu
        ? "Đây là việc chưa có người đứng tên, không phải một người đang quá tải — phải phân người trước khi nói tới giãn lịch."
        : quaCap
          ? "Bấm vào ô để xem đúng những hạng mục đang dồn ở đó."
          : `Mọi ô đều nằm dưới ngưỡng ${cap} ${donVi}/${scope === "month" ? "tháng" : scope === "quarter" ? "quý" : "năm"}.`,
      tone: (quaCap ? "warn" : "ok") as "warn" | "ok",
    };
  }, [people, cols, metric, cap, scope, valIn]);

  const klTrongYeu = useMemo(() => {
    const tong = (critCount.Cao || 0) + (critCount.TB || 0) + (critCount["Thấp"] || 0);
    if (!tong) return null;
    const tyCao = Math.round(((critCount.Cao || 0) / tong) * 100);
    return {
      chinh: `${critCount.Cao || 0} trong ${tong} hạng mục còn lại thuộc mức trọng yếu Cao (${tyCao}%).`,
      phu: tyCao >= 40
        ? "Phần việc còn tồn nghiêng hẳn về nhóm rủi ro cao — đây là nhóm Annex 15 đòi làm trước."
        : "Phần lớn việc còn tồn thuộc nhóm rủi ro thấp và trung bình.",
      tone: (tyCao >= 40 ? "warn" : "ok") as "warn" | "ok",
    };
  }, [critCount]);

  /* Ba trạng thái ngữ nghĩa của Vali (Atelier §5). Bản cũ truyền
     "stressed" — giá trị mà Mascot không hề định nghĩa, nên biểu cảm
     cảnh báo chưa bao giờ thật sự hiện ra. */
  const mood: ValiMood = overloaded.length > 0
    ? "concern"
    : people.length > 0 ? "celebrate" : "guide";
  const bubble = overloaded.length > 0
    ? `Có ${overloaded.length} bạn đang quá tải ở tháng cao điểm (trên ngưỡng ${CAP_MONTH} ngày công/tháng). Bấm vào từng người xem chi tiết.`
    : `Cả đội đang cân đối. Cứ giữ nhịp này là về đích VMP đúng hẹn.`;
  /* Chú giải đọc thẳng từ BAC_TAI — một nguồn cho cả ô lẫn chú giải, nên
     không thể lệch nhau như bản trước (chú giải tự khai màu riêng, và hai
     ô đầu còn trong suốt vì cùng lỗi nối chuỗi). */
  const legend = (Object.keys(BAC_TAI) as BacTai[]).map((k) => ({ band: k, ...BAC_TAI[k] }));

  return (
    <div className="reg reg--tron">
      {detail && <WorkloadDetailModal detail={detail} onClose={() => setDetail(null)} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* #1 (01/09): hero về KHUNG VALI dùng chung (.vali-hero, lotus-
          components.css) — cùng nhịp chibi/eyebrow/mô tả với màn Hôm nay
          và Cập nhật; hết cảnh ba màn ba kiểu đóng khung. Chibi vẫn là bộ
          webp chung (.hn-vali, today.css). */}
      <section className="vali-hero" aria-label="Vali tóm tắt phân công">
        <div className="vali-hero__vali lp-art-layer lp-art-layer--pearl-orbit" data-lp-art="pearl-orbit">
          <div className={`hn-vali hn-vali--${mood} hn-vali--nho`} role="img"
            aria-label={`Công chúa Vali ${NHAN_MOOD[mood]}`} />
          <span className="hn-vali__nhan">Vali · {NHAN_MOOD[mood]}</span>
        </div>
        <div className="vali-hero__loi">
          <div className="vali-hero__eyebrow">Phân công &amp; khối lượng</div>
          <p className="hn-loi pop" key={mood}>{bubble}</p>
          <p className="vali-hero__mota">Còn lại: <b>{totalCong} ngày công</b> · <b>{totalHoso} hồ sơ</b> · <b>{people.length} người</b></p>
          <div className="vali-hero__controls">
            <div className="vali-hero__nhom"><span>Khung thời gian</span><div><Btn primary on={scope === "month"} onClick={() => setScope("month")}>Tháng</Btn><Btn on={scope === "quarter"} onClick={() => setScope("quarter")}>Quý</Btn><Btn on={scope === "year"} onClick={() => setScope("year")}>Năm</Btn></div></div>
            <div className="vali-hero__nhom"><span>Tô theo</span><div><Btn on={metric === "cong"} onClick={() => setMetric("cong")}>Ngày công</Btn><Btn on={metric === "hoso"} onClick={() => setMetric("hoso")}>Hồ sơ</Btn></div></div>
          </div>
        </div>
      </section>

      {/* BÀN QUẢN TRỊ (01/09): số mở màn bấm được + tab thay cuộn. */}
      <DongSo cacO={[
        { nhan: "người quá tải", giaTri: overloaded.length, canhBao: overloaded.length > 0,
          phu: `ngưỡng ${CAP_MONTH} nc/tháng`, onMo: () => setTab("suc-tai") },
        { nhan: "hạng mục vô chủ", giaTri: voChu?.count ?? 0, canhBao: (voChu?.count ?? 0) > 0,
          phu: voChu ? `${voChu.congTotal} ngày công` : "đã phân đủ", onMo: () => setTab("suc-tai") },
        { nhan: "ngày công còn lại", giaTri: totalCong, phu: `${totalHoso} hồ sơ`, onMo: () => setTab("ma-tran") },
        { nhan: "người đang gánh việc", giaTri: nguoiThat.length, onMo: () => setTab("theo-nguoi") },
      ]} />
      <NhomTab man="workload" nhan="Các góc nhìn phân công" tab={tab} onTab={setTab} tabs={[
        { id: "suc-tai", nhan: "Sức tải", dem: overloaded.length, canhBao: true },
        { id: "ma-tran", nhan: "Ma trận Người × Thời gian" },
        { id: "nhom-viec", nhan: "Nhóm việc", dem: groups.length },
        { id: "theo-nguoi", nhan: "Theo người", dem: board.length },
        { id: "trong-yeu", nhan: "Trọng yếu" },
      ]} />

      <NhomTabPanel man="workload" id="suc-tai" tab={tab}>
      {/* Việc vô chủ — thẻ RIÊNG, không trộn vào danh sách người. */}
      {voChu && voChu.count > 0 && (
        <Card variant="strong" style={{ borderColor: C.marigold }}>
          <CardTitle icon={UserX}
            sub="Chưa có ai đứng tên nên không nằm trong sức tải của bất kỳ ai — phải phân người trước khi nói tới giãn lịch">
            {voChu.count} hạng mục chưa phân công
          </CardTitle>
          <button type="button" className="vmp-lift"
            onClick={() => openDetail("Hạng mục chưa phân công", voChu.months.flatMap((m) => m.tasks))}
            style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", cursor: "pointer",
                     background: C.marigoldSoft, border: "none", borderRadius: 14, padding: "14px 18px",
                     fontFamily: TEXT, textAlign: "left", width: "100%" }}>
            <div>
              <div style={{ fontFamily: NUM, fontSize: 28, fontWeight: 800, color: C.marigoldText, lineHeight: 1 }}>
                {voChu.congTotal}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.plumSoft }}>ngày công</div>
            </div>
            <div>
              <div style={{ fontFamily: NUM, fontSize: 28, fontWeight: 800, color: C.marigoldText, lineHeight: 1 }}>
                {voChu.hosoTotal}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.plumSoft }}>hồ sơ</div>
            </div>
            {voChu.critCao > 0 && <Tag color={C.raspText} bg={C.raspSoft}>{voChu.critCao} trọng yếu cao</Tag>}
            {voChu.over > 0 && <Tag color={C.raspText} bg={C.raspSoft}>{voChu.over} quá hạn</Tag>}
            <span style={{ marginLeft: "auto", fontSize: 12, color: C.marigoldText, fontWeight: 800 }}>
              Xem danh sách →
            </span>
          </button>
        </Card>
      )}

      {/* Capacity cards */}
      <Card variant="strong" id="reg-suc-tai">
        <CardTitle icon={Activity} sub={`Thanh = tháng bận nhất so với ngưỡng ${CAP_MONTH} ngày công/tháng · bấm vào thẻ để xem chi tiết`}>Sức tải từng người</CardTitle>
        {klSucTai && <CauKetLuan chinh={klSucTai.chinh} phu={klSucTai.phu} tone={klSucTai.tone} />}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(262px,1fr))", gap: 14 }}>
          {nguoiThat.map((p) => {
            const pk = peakMonth(p); const ratio = CAP_MONTH > 0 ? pk.eff / CAP_MONTH : 0;
            /* Icon Lucide mang ngữ nghĩa, Vali mang cảm xúc — không dùng
               emoji trạng thái nghiệp vụ (Atelier §5). */
            const band = ratio > 1 ? { l: "Quá tải", c: C.rasp, t: C.raspText, bg: C.raspSoft, I: AlertTriangle } : ratio >= 0.6 ? { l: "Khá bận", c: C.marigold, t: C.marigoldText, bg: C.marigoldSoft, I: Gauge } : { l: "Thong thả", c: C.mint, t: C.mintText, bg: C.mintSoft, I: CheckCircle2 };
            return (
              <button key={p.name} className="vmp-lift" onClick={() => openDetail(`Việc còn lại của ${p.name}`, p.months.flatMap((m) => m.tasks))} style={{ textAlign: "left", cursor: "pointer", background: C.surface, border: `1.5px solid ${C.pinkSoft}`, borderRadius: 14, padding: 15, fontFamily: TEXT }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 999, background: GRAD, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontFamily: NUM, fontSize: 16, flexShrink: 0 }}>{p.name[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 14, color: C.plum }}>{p.name}</div><div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>{p.count} hạng mục</div></div>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 800, color: band.t, background: band.bg, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}><band.I size={12} aria-hidden="true" /> {band.l}</span>
                </div>
                <div style={{ display: "flex", gap: 9, marginBottom: 12 }}>
                  <div style={{ flex: 1, background: C.lavSoft, borderRadius: 14, padding: "9px 11px" }}><div style={{ fontFamily: NUM, fontWeight: 800, fontSize: 20, color: C.lavText, lineHeight: 1 }}>{p.congTotal}</div><div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700, marginTop: 2 }}>ngày công</div></div>
                  <div style={{ flex: 1, background: C.pinkSoft, borderRadius: 14, padding: "9px 11px" }}><div style={{ fontFamily: NUM, fontWeight: 800, fontSize: 20, color: C.pinkText, lineHeight: 1 }}>{p.hosoTotal}</div><div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700, marginTop: 2 }}>hồ sơ</div></div>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: C.pinkSoft, overflow: "hidden" }}><div style={{ height: "100%", width: clamp(ratio, 0, 1) * 100 + "%", background: band.c, borderRadius: 999, transition: "width .9s ease" }} /></div>
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {p.critCao > 0 && <Tag color={C.raspText} bg={C.raspSoft}>{p.critCao} trọng yếu cao</Tag>}
                  {p.over > 0 && <Tag color={C.marigoldText} bg={C.marigoldSoft}>{p.over} quá hạn</Tag>}
                  <span style={{ marginLeft: "auto", fontSize: 12, color: C.pinkText, fontWeight: 800 }}>Xem →</span>
                </div>
              </button>
            );
          })}
          {nguoiThat.length === 0 && <div style={{ gridColumn: "1/-1", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 28, color: C.mintText, fontWeight: 700 }}><CheckCircle2 size={16} aria-hidden="true" /> Không còn hạng mục nào chưa chốt VMP!</div>}
        </div>
      </Card>
      </NhomTabPanel>

      <NhomTabPanel man="workload" id="ma-tran" tab={tab}>
      {/* ================= Ma trận — bề mặt sổ =================
          Kẻ dòng thay vì đóng hộp từng ô. Hàng tiêu đề DÍNH (bản trước chỉ
          dính cột trái, nên cuộn qua 12 tháng là mất tên tháng). Có
          <caption> nói rõ bảng đếm gì, đơn vị nào. */}
      <section className="reg-section" id="reg-ma-tran" aria-labelledby="reg-ma-tran-tieu-de">
        <div className="reg-section__head">
          <span className="reg-section__num" aria-hidden="true">02</span>
          <h2 className="reg-section__title" id="reg-ma-tran-tieu-de">
            Ma trận · Người × {scope === "month" ? "Tháng" : scope === "quarter" ? "Quý" : "Năm"}
          </h2>
          <p className="reg-section__note">Bấm một ô để xem hạng mục trong ô đó</p>
        </div>
        {klMaTran && <CauKetLuan chinh={klMaTran.chinh} phu={klMaTran.phu} tone={klMaTran.tone} />}
        <ul className="reg-legend">
          {legend.map((b) => (
            <li className="reg-legend__item" key={b.band}>
              <span className="reg-legend__swatch" data-band={b.band} aria-hidden="true">{b.notch}</span>
              {b.nhan}
            </li>
          ))}
        </ul>
        <div className="reg-scroll vmp-scroll">
          <table className="reg-table">
            <caption>
              Sức tải còn lại theo {metric === "cong" ? "ngày công" : "hồ sơ"}, ngưỡng {cap} mỗi{" "}
              {scope === "month" ? "tháng" : scope === "quarter" ? "quý" : "năm"}. Mỗi ô ghi số và
              một khấc chỉ mức tải, nên đọc được cả khi không phân biệt được màu.
            </caption>
            <thead>
              <tr>
                <th scope="col" data-reg-stick>Người</th>
                {cols.map((c, ci) => {
                  const isNow = scope === "month" && ci === vmpToday().getMonth();
                  return (
                    <th scope="col" key={c} className="reg-num" aria-current={isNow ? "date" : undefined}>
                      {c}{isNow ? " ·" : ""}
                    </th>
                  );
                })}
                <th scope="col" className="reg-num">Tổng</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.name}>
                  <th scope="row" data-reg-stick>{p.name}</th>
                  {cols.map((c, ci) => {
                    const v = valIn(p, ci);
                    const tasks = tasksIn(p, ci);
                    if (v <= 0) {
                      return <td key={ci}><div className="reg-load--empty" /></td>;
                    }
                    const band = bacTai(v, cap);
                    const donVi = metric === "cong" ? "ngày công" : "hồ sơ";
                    return (
                      <td key={ci}>
                        <button type="button" className="reg-load" data-band={band}
                          onClick={() => openDetail(`${p.name} · ${c}`, tasks)}
                          aria-label={`${p.name}, ${c}: ${v} ${donVi}, mức ${BAC_TAI[band].nhan}. Xem ${tasks.length} hạng mục.`}>
                          <span aria-hidden="true">{v}</span>
                          <span className="reg-load__notch" aria-hidden="true">{BAC_TAI[band].notch}</span>
                        </button>
                      </td>
                    );
                  })}
                  <td className="reg-num reg-total">
                    {metric === "cong" ? p.congTotal : p.hosoTotal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </NhomTabPanel>

      <NhomTabPanel man="workload" id="nhom-viec" tab={tab}>
      {/* Phân công theo nhóm việc */}
      <Card variant="strong" id="reg-nhom-viec">
        <CardTitle icon={Users}
          sub="Theo bảng phân công QA 2026 — bấm vào nhóm để xem toàn bộ hạng mục">
          Phân công theo nhóm việc
        </CardTitle>
        <div style={{ display: "grid", gap: 12,
                      gridTemplateColumns: "repeat(auto-fill,minmax(268px,1fr))" }}>
          {groups.map((g) => {
            const chua = g.name === "(chưa phân nhóm)";
            return (
              <button key={g.name} className="vmp-lift"
                onClick={() => openDetail(`Nhóm: ${g.name}`, g.acts)}
                style={{ textAlign: "left", cursor: "pointer", background: C.surface,
                         border: `1.5px solid ${chua ? C.marigold : C.pinkSoft}`,
                         borderRadius: 14, padding: 14, fontFamily: TEXT }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: chua ? C.marigoldText : C.plum,
                              lineHeight: 1.4, minHeight: 36 }}>
                  {g.name}
                </div>
                <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700, margin: "4px 0 9px" }}>
                  {g.owners.size ? [...g.owners].join(" · ") : "chưa có ai phụ trách"}
                </div>
                <div style={{ height: 7, borderRadius: 999, background: C.pinkMist, overflow: "hidden" }}>
                  <div style={{ width: `${g.rate}%`, height: "100%",
                                background: g.rate >= 80 ? C.mint : g.rate >= 40 ? C.marigold : C.rasp }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between",
                              marginTop: 7, fontSize: 12, fontWeight: 700 }}>
                  <span style={{ color: C.plumSoft }}>{g.total} hạng mục</span>
                  <span style={{ color: C.mintText }}>{g.rate}% xong</span>
                  {g.over > 0 && <span style={{ color: C.raspText }}>{g.over} quá hạn</span>}
                </div>
              </button>
            );
          })}
        </div>
      </Card>
      </NhomTabPanel>

      <NhomTabPanel man="workload" id="theo-nguoi" tab={tab}>
      {/* Bảng vinh danh cá nhân */}
      <Card variant="soft" id="reg-theo-nguoi">
        {/* Đổi từ "Bảng vinh danh cá nhân" (có thứ hạng 1-2-3) sang bảng
            tiến độ trung tính, bỏ số thứ hạng. Lý do không phải thẩm mỹ:
            phần lớn chênh lệch ở đây đến từ PHÂN BỔ VIỆC chứ không phải năng
            lực — người ôm 56 hạng mục dồn hết vào T7–T8 và người chỉ có 12
            hạng mục toàn hạn cuối năm không so được với nhau bằng một con số
            phần trăm. Xếp hạng công khai kiểu đó gây mâu thuẫn nội bộ mà
            không đo đúng thứ nó tưởng đang đo. */}
        <CardTitle icon={Users} sub="Sắp theo tỷ lệ hoàn thành · bấm để xem việc còn lại. Tỷ lệ phụ thuộc nhiều vào phân bổ việc và mốc hạn, không phải thước đo năng lực.">
          Tiến độ theo người
        </CardTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {board.map((r) => (
            <button key={r.name} className="vmp-row vmp-lift"
              onClick={() => openDetail(`Hạng mục của ${r.name}`,
                acts.filter((a) => (a.owner && a.owner !== "—" ? a.owner : "Chưa phân công") === r.name))}
              style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px",
                       borderRadius: 14, background: C.surface, cursor: "pointer", textAlign: "left",
                       border: `1px solid ${r.name === "Chưa phân công" ? C.marigoldSoft : C.pinkSoft}` }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800,
                             color: r.name === "Chưa phân công" ? C.marigoldText : C.plum }}>
                {r.name}
              </span>
              <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700, whiteSpace: "nowrap" }}>
                {r.done}/{r.total}
              </span>
              <div style={{ width: 110, height: 7, borderRadius: 999, background: C.pinkMist,
                            overflow: "hidden", flexShrink: 0 }}>
                <div style={{ width: `${r.rate}%`, height: "100%",
                              background: r.rate >= 80 ? C.mint : r.rate >= 40 ? C.marigold : C.rasp }} />
              </div>
              <span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 14, width: 46,
                             textAlign: "right", flexShrink: 0,
                             color: r.rate >= 80 ? C.mintText : r.rate >= 40 ? C.marigoldText : C.raspText }}>
                {r.rate}%
              </span>
            </button>
          ))}
        </div>
      </Card>
      </NhomTabPanel>

      <NhomTabPanel man="workload" id="trong-yeu" tab={tab}>
      {/* Trọng yếu. Thẻ "Cần tập trung" từng đứng cạnh đây đã BỎ (31/08):
          nó là bản rút gọn của màn "Cảnh báo & ưu tiên" — cùng một phép xếp
          theo điểm rủi ro, ít cột hơn, và không có ma trận QRM đi kèm. Chính
          constants/vmp.ts đã chốt "ma trận rủi ro nằm cùng chỗ với danh sách
          cảnh báo mà nó dùng để xếp thứ tự ưu tiên" — hai nơi cùng xếp hạng
          ưu tiên thì sớm muộn lệch nhau, và người dùng phải đoán bản nào
          thật. Ở đây chỉ giữ phân bố trọng yếu (góc nhìn KHỐI LƯỢNG), kèm
          lối sang màn ưu tiên thật. */}
      <Card variant="soft" id="reg-trong-yeu">
        <CardTitle icon={ShieldAlert} sub="Theo mức trọng yếu"
          right={<a href="#v=alerts" style={{ fontSize: 12, fontWeight: 800, color: C.pinkText, textDecoration: "none", whiteSpace: "nowrap" }}>Thứ tự ưu tiên đầy đủ → Cảnh báo &amp; ưu tiên</a>}>
          Phân bố trọng yếu
        </CardTitle>
        {klTrongYeu && <CauKetLuan chinh={klTrongYeu.chinh} phu={klTrongYeu.phu} tone={klTrongYeu.tone} />}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Donut size={132} segments={[{ value: critCount.Cao, color: C.rasp }, { value: critCount.TB, color: C.marigold }, { value: critCount["Thấp"], color: C.mint }]} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
            {[["Cao", C.rasp, C.raspText], ["TB", C.marigold, C.marigoldText], ["Thấp", C.mint, C.mintText]].map(([k, c, t]) => <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: C.plum }}><span style={{ width: 11, height: 11, borderRadius: 999, background: c }} />TY {k}</span><span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 16, color: t }}>{critCount[k] || 0}</span></div>)}
          </div>
        </div>
      </Card>
      </NhomTabPanel>
      </div>
    </div>
  );
}

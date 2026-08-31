/* AlertsPage.tsx — Cảnh báo & Rủi ro (QRM)
 * ---------------------------------------------------------------------
 * Gộp hai trang cũ "Cảnh báo" và "QRM – Rủi ro" làm một, vì tách ra thì
 * người trực phải tự bắc cầu: bên này thấy danh sách quá hạn xếp theo
 * ngày, bên kia thấy ma trận rủi ro, không chỗ nào trả lời được câu duy
 * nhất cần trả lời mỗi sáng — "hôm nay làm cái nào trước".
 *
 * Nên danh sách cảnh báo xếp theo ĐIỂM RỦI RO (RPN, ICH Q9) trước, ngày
 * hạn sau: quá hạn 1 ngày của hệ thống vô khuẩn nặng hơn quá hạn 10 ngày
 * của một cái cân. Điểm rủi ro tính bằng hàm dùng chung trong helpers nên
 * ma trận và danh sách không thể chấm khác nhau.
 */
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, CalendarClock, Filter, ShieldAlert, Download, Search, ListFilter, ChevronRight,
  Sparkles as SparkIcon, Mail, RefreshCw,
} from "lucide-react";
import { C, TEXT, NUM, btnPrimary } from "../constants/theme.ts";
import { CLS, CRIT, DEPTS, DEP_DAYS, SOON_DAYS, vmpToday } from "../constants/vmp.ts";
import {
  parseD, fmtVN, daysBetween, addMonths, txt, nguoiPhuTrach, milestones,
  qrmRpn, qrmLevel, byRisk,
} from "../utils/helpers.ts";
import { Card, CardTitle, Tag, Pill, PhanTrang, CauKetLuan } from "../components/ui/Primitives.tsx";
import ViewportDialog from "../components/ui/ViewportDialog.tsx";
import { useDebounce, usePerformers } from "../hooks/index.ts";
import { chayPhanTichAi, aiConfigured } from "../lib/aiReport.ts";
import AiMailModal from "../components/ai/AiMailModal.tsx";
import QrmView from "./QrmPage.tsx";
import type { Activity } from "../types/domain.ts";
import {
  buildAlertsCommandModel,
  type AlertRow,
} from "../features/monitoring/alertsCommandModel.ts";

const WINDOWS = [
  ["all", "Mọi thời điểm"],
  ["7", "≤ 7 ngày"],
  ["30", "≤ 30 ngày"],
  ["90", "≤ 90 ngày"],
];

const LEVELS = [
  ["all", "Mọi mức rủi ro"],
  ["cao", "Rủi ro cao"],
  ["tb", "Rủi ro trung bình"],
  ["thap", "Rủi ro thấp"],
];

const SORTS = [
  ["risk", "Rủi ro cao trước (RPN)"],
  ["due", "Hạn gần nhất trước"],
  ["name", "Theo tên hạng mục"],
];

const AI_UNAVAILABLE = "Phân tích AI chưa được bật. Dữ liệu cảnh báo vẫn đầy đủ.";

const LEVEL_STYLE: Record<string, { text: string; soft: string; label: string }> = {
  cao:  { text: C.raspText,     soft: C.raspSoft,     label: "Rủi ro cao" },
  tb:   { text: C.marigoldText, soft: C.marigoldSoft, label: "Rủi ro TB" },
  thap: { text: C.mintText,     soft: C.mintSoft,     label: "Rủi ro thấp" },
};

const KIND_LABEL: Record<AlertRow["kind"], string> = {
  over: "Quá hạn", soon: "Tới hạn", requal: "Tái thẩm định", risk: "Rủi ro cao",
};

/* ================================================================
 * CHI TIẾT MỘT CẢNH BÁO — timeline bốn mốc, chỉ rõ hạn sắp tới
 * ----------------------------------------------------------------
 * Danh sách chỉ nói được MỘT mốc gần nhất. Mở chi tiết ra mới thấy cả
 * chuỗi Đề cương → Thẩm định → Báo cáo → Đích, mốc nào xong ngày nào,
 * mốc nào đang trễ, và cái tiếp theo còn mấy ngày.
 * ================================================================ */
interface Mile {
  label: string;
  /** Hạn ghi trong kế hoạch (cột deadline_* của DB). */
  plan: Date | null;
  /** Hạn suy theo luật VMP từ mốc đích. */
  rule: Date | null;
  ruleNote: string;
  actual: Date | null;
  status: string;
  done: boolean;
}

/** Nhãn trạng thái ưu tiên chữ gốc trong Sheet, không có thì dịch enum. */
function phaseLabel(enumVal: unknown, sheetVal: unknown): string {
  const s = String(sheetVal ?? "").trim();
  if (s) return s;
  const e = String(enumVal ?? "").trim();
  if (e === "completed") return "Hoàn thành";
  if (e === "in_progress") return "Đang thực hiện";
  if (e === "not_started") return "Chưa thực hiện";
  return e || "Chưa nhập";
}

/* Dòng cảnh báo tách khỏi AlertsView và bọc memo: trước đây hàm Row được
 tạo lại mỗi lần gõ một phím vào ô tìm, nên React coi là component MỚI và
 dựng lại toàn bộ 279 dòng — đó là chỗ trễ khi gõ. */
export const AlertRowItem = memo(function AlertRowItem({ r, email, onOpen }: {
r: AlertRow; email?: string | null; onOpen: (r: AlertRow) => void;
}) {
  const cls = (CLS as Record<string, typeof CLS.tb>)[String(r.a.cls ?? "tb")] ?? CLS.tb;
  const rpn = qrmRpn(r.a);
  const lv = LEVEL_STYLE[qrmLevel(rpn)];
  const late = r.dleft < 0;
  const edge = r.kind === "over" ? C.raspSoft : r.kind === "soon" ? C.marigoldSoft
    : r.kind === "risk" ? C.raspSoft : C.pinkSoft;
  return (
    <div className="vmp-row vmp-lift"
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 13px", borderRadius: 14, background: C.surface, border: `1px solid ${edge}` }}>
      <button type="button" onClick={() => onOpen(r)} aria-label={`Xem chi tiết cảnh báo ${r.a.id}`}
        title="Bấm để xem timeline các mốc hạn"
        style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, padding: 0,
          border: "none", background: "transparent", color: "inherit", textAlign: "left", cursor: "pointer", fontFamily: TEXT }}>
      {/* Ô ngày — trễ thì đỏ, còn hạn thì cam/xanh theo nhóm */}
      <div style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0, background: late ? C.raspSoft : r.kind === "soon" ? C.marigoldSoft : C.skySoft, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 16, color: late ? C.raspText : r.kind === "soon" ? C.marigoldText : C.skyText, lineHeight: 1 }}>{Math.abs(r.dleft)}</span>
        <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>ngày {late ? "trễ" : "nữa"}</span>
      </div>
      {/* Điểm rủi ro — lý do dòng này nằm ở vị trí này trong danh sách */}
      <div title={`RPN = trọng yếu × khả năng xảy ra (ICH Q9). Tối đa 27.`}
        style={{ width: 54, flexShrink: 0, textAlign: "center", padding: "6px 0", borderRadius: 14, background: lv.soft }}>
        <div style={{ fontFamily: NUM, fontWeight: 800, fontSize: 14, color: lv.text, lineHeight: 1 }}>{rpn}</div>
        <div style={{ fontSize: 12, fontWeight: 800, color: lv.text }}>RPN</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <Tag color={cls.text} bg={cls.soft}>{r.a.vtype}</Tag>
          <span style={{ fontFamily: TEXT, fontSize: 14, fontWeight: 800, color: C.plum }}>{r.a.name}</span>
        </div>
        <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 2 }}>
          {r.a.id} · Mốc <b style={{ color: late ? C.raspText : C.marigoldText }}>{r.stage}</b>
          {r.date ? ` · hạn ${fmtVN(r.date)}` : ""} · {nguoiPhuTrach(r.a.owner)}
          {r.a.dep ? ` · BC: ${r.a.dep}` : ""}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
        <Tag color={lv.text} bg={lv.soft}>{lv.label}</Tag>
        <Tag color={C.plumSoft} bg={C.pinkMist}>{KIND_LABEL[r.kind]}</Tag>
      </div>
      <ChevronRight size={18} color={C.plumSoft} style={{ flexShrink: 0 }} />
      </button>
      {email ? (
        <a href={`mailto:${email}?subject=${encodeURIComponent(`[VMP] ${KIND_LABEL[r.kind]}: ${r.a.id} — ${r.a.name}`)}`}
          aria-label={`Nhắc ${r.a.id} qua email: ${email}`}
          style={{ color: C.lavText, fontWeight: 700, flexShrink: 0 }}>{email}</a>
      ) : null}
    </div>
  );
});

export function AlertAiError({ message }: { message: string }) {
  return (
    <div role="alert" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, fontWeight: 800,
      color: C.raspText, background: C.raspSoft, borderRadius: 14, padding: "12px 15px" }}>
      <AlertCircle size={16} aria-hidden="true" /> {message}
    </div>
  );
}

/** Xuất ra ngoài để test render được bằng react-dom/server. */
export function AlertDetailModal({ r, email, onClose }: {
  r: AlertRow; email?: string | null; onClose: () => void;
}) {
  const a = r.a;
  const raw = (a._raw || {}) as Record<string, unknown>;
  const rule = milestones(a);
  const dep = (DEP_DAYS as Record<string, number>)[String(a.dep ?? "")] ?? 2;
  const isDone = (v: unknown) => String(v ?? "") === "completed";

  const miles: Mile[] = [
    { label: "1. Đề cương", plan: parseD(raw.dl_de_cuong), rule: rule.protocol, ruleNote: "T−60 ngày",
      actual: parseD(raw.ngay_de_cuong), status: phaseLabel(raw.tt_de_cuong, raw.tt_de_cuong_goc), done: isDone(raw.tt_de_cuong) },
    { label: "2. Thẩm định thực tế", plan: parseD(raw.dl_tham_dinh), rule: rule.validation, ruleNote: `T−${5 + dep} ngày`,
      actual: parseD(raw.ngay_tham_dinh), status: phaseLabel(raw.tt_tham_dinh, raw.tt_tham_dinh_goc), done: isDone(raw.tt_tham_dinh) },
    { label: "3. Báo cáo", plan: parseD(raw.dl_bao_cao), rule: rule.report, ruleNote: "T−5 ngày",
      actual: parseD(raw.ngay_bao_cao), status: phaseLabel(raw.tt_bao_cao, raw.tt_bao_cao_goc), done: isDone(raw.tt_bao_cao) },
    { label: "4. Đích VMP", plan: parseD(raw.dl_vmp) || parseD(a.target), rule: rule.target, ruleNote: "mốc đích T",
      actual: parseD(raw.ngay_vmp), status: phaseLabel(raw.tt_vmp, raw.tt_vmp_goc), done: isDone(raw.tt_vmp) },
  ];

  // Hạn sắp tới = mốc đầu tiên chưa xong. Đó là cái người trực cần biết,
  // không phải mốc gần nhất theo lịch (mốc đó có thể đã làm xong rồi).
  const nextIdx = miles.findIndex((m) => !m.done && !m.actual);
  const next = nextIdx >= 0 ? miles[nextIdx] : null;
  const nextDate = next ? (next.plan || next.rule) : null;
  const nextLeft = nextDate ? daysBetween(nextDate, vmpToday()) : null;

  const rpn = qrmRpn(a);
  const lv = LEVEL_STYLE[qrmLevel(rpn)];
  const lich = parseD(raw.lich_td);

  const Line = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div style={{ display: "flex", gap: 8, fontSize: 12, lineHeight: 1.6 }}>
      <span style={{ color: C.plumSoft, fontWeight: 700, minWidth: 96 }}>{label}</span>
      <span style={{ color: C.plum, fontWeight: 700 }}>{value}</span>
    </div>
  );

  return (
    <ViewportDialog open onRequestClose={() => onClose()} maxWidth={620} icon={CalendarClock} title={`Chi tiết · ${a.id}`}
      footer={(
        <button type="button" onClick={onClose} style={{ ...btnPrimary, background: C.surface, color: C.plum,
          border: `1.5px solid ${C.pinkSoft}` }}>
          Đóng
        </button>
      )}>
      {/* Đầu hộp: hạng mục là gì, ai làm, rủi ro bao nhiêu */}
      <div style={{ background: C.lavSoft, borderRadius: 14, padding: "12px 15px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Tag color={C.lavText} bg={C.surface}>{a.vtype}</Tag>
          <span style={{ fontFamily: TEXT, fontWeight: 800, fontSize: 14, color: C.plum }}>{a.name}</span>
          <Pill s={a.st} small />
        </div>
        <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 5, lineHeight: 1.6 }}>
          {a.code} · {txt(a.dept)} · người thực hiện <b style={{ color: C.plum }}>{nguoiPhuTrach(a.owner)}</b>
          {email ? <> · <a href={`mailto:${email}`} style={{ color: C.lavText, fontWeight: 700 }}>{email}</a></> : ""}
          {a.freq ? ` · chu kỳ ${a.freq} tháng` : ""}
        </div>
        <div style={{ display: "flex", gap: 7, marginTop: 8, flexWrap: "wrap" }}>
          <Tag color={lv.text} bg={lv.soft}>RPN {rpn} · {lv.label}</Tag>
          <Tag color={C.plumSoft} bg={C.surface}>{KIND_LABEL[r.kind]}</Tag>
          {a.score != null && <Tag color={C.plumSoft} bg={C.surface}>Trọng yếu {String(a.score)}/9</Tag>}
        </div>
      </div>

      {/* Hạn sắp tới — câu trả lời cho "phải làm gì tiếp" */}
      <div style={{ borderRadius: 14, padding: "13px 15px", marginBottom: 16,
                    background: nextLeft != null && nextLeft < 0 ? C.raspSoft : nextLeft != null && nextLeft <= SOON_DAYS ? C.marigoldSoft : C.mintSoft }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: C.plumSoft, marginBottom: 3 }}>HẠN SẮP TỚI</div>
        {next && nextDate ? (
          <div style={{ fontFamily: TEXT, fontSize: 14, fontWeight: 800, color: C.plum }}>
            {next.label.replace(/^\d+\.\s*/, "")} — {fmtVN(nextDate)}
            <span style={{ marginLeft: 8, fontFamily: NUM, color: (nextLeft ?? 0) < 0 ? C.raspText : (nextLeft ?? 0) <= SOON_DAYS ? C.marigoldText : C.mintText }}>
              {(nextLeft ?? 0) < 0 ? `trễ ${Math.abs(nextLeft ?? 0)} ngày` : `còn ${nextLeft} ngày`}
            </span>
          </div>
        ) : (
          <div style={{ fontFamily: TEXT, fontSize: 14, fontWeight: 800, color: C.mintText }}>
            Đã xong cả bốn mốc — không còn hạn nào chờ.
          </div>
        )}
        {lich && <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700, marginTop: 4 }}>Lịch thẩm định bộ phận xếp: {fmtVN(lich)}</div>}
        {/* Hạng mục đã xong thì mốc kế tiếp là LẦN SAU — dự báo theo tần suất */}
        {r.kind === "requal" && r.date && (
          <div style={{ fontSize: 12, color: C.plum, fontWeight: 700, marginTop: 4 }}>
            Tái thẩm định dự kiến: <b>{fmtVN(r.date)}</b> ({r.dleft < 0 ? `quá ${Math.abs(r.dleft)} ngày` : `còn ${r.dleft} ngày`}) — chu kỳ {r.a.freq} tháng tính từ mốc đích lần này.
          </div>
        )}
      </div>

      {/* Timeline bốn mốc */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {miles.map((m, i) => {
          const d = m.plan || m.rule;
          const left = d ? daysBetween(d, vmpToday()) : null;
          const late = !m.done && !m.actual && left != null && left < 0;
          const isNext = i === nextIdx;
          const dot = m.done || m.actual ? C.mint : late ? C.rasp : isNext ? C.marigold : C.pinkSoft;
          const dotText = m.done || m.actual ? C.mintText : late ? C.raspText : isNext ? C.marigoldText : C.plumSoft;
          return (
            <div key={m.label} style={{ display: "flex", gap: 12 }}>
              {/* Cột chấm + đường nối */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 22 }}>
                <div style={{ width: 15, height: 15, borderRadius: 999, background: dot, border: `2px solid ${C.surface}`, boxShadow: isNext ? `0 0 0 3px ${C.marigoldSoft}` : "none", marginTop: 4 }} />
                {i < miles.length - 1 && <div style={{ flex: 1, width: 2, background: C.pinkSoft, minHeight: 26 }} />}
              </div>
              <div style={{ flex: 1, paddingBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: TEXT, fontSize: 14, fontWeight: 800, color: dotText }}>{m.label}</span>
                  <Tag color={dotText} bg={C.surface}>{m.status}</Tag>
                  {isNext && <Tag color={C.marigoldText} bg={C.marigoldSoft}>Kế tiếp</Tag>}
                  {late && <Tag color={C.raspText} bg={C.raspSoft}>Trễ {Math.abs(left ?? 0)} ngày</Tag>}
                </div>
                <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 1 }}>
                  <Line label="Hạn kế hoạch" value={m.plan ? fmtVN(m.plan) : <span style={{ color: C.plumSoft, fontWeight: 600 }}>không có trong kế hoạch</span>} />
                  <Line label="Hạn theo luật" value={m.rule ? <>{fmtVN(m.rule)} <span style={{ color: C.plumSoft, fontWeight: 600 }}>({m.ruleNote})</span></> : "—"} />
                  <Line label="Ngày thực tế" value={m.actual ? fmtVN(m.actual) : <span style={{ color: C.plumSoft, fontWeight: 600 }}>chưa có</span>} />
                  {/* Mốc đã xong thì đếm ngược không còn nghĩa gì — trước đây
                      vẫn hiện "trễ 255 ngày" cho mốc đã hoàn thành. */}
                  {!m.done && !m.actual && d && <Line label="Còn lại" value={
                    <span style={{ color: (left ?? 0) < 0 ? C.raspText : (left ?? 0) <= SOON_DAYS ? C.marigoldText : C.mintText }}>
                      {(left ?? 0) < 0 ? `trễ ${Math.abs(left ?? 0)} ngày` : `${left} ngày`}
                    </span>} />}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, lineHeight: 1.6, borderTop: `1px solid ${C.pinkSoft}`, paddingTop: 10 }}>
        <b style={{ color: C.plum }}>Hạn theo luật</b> suy từ mốc đích VMP: đề cương T−60 · thẩm định T−(5+{dep}) ·
        báo cáo T−5, trong đó {dep} ngày là theo phân loại báo cáo “{txt(a.dep)}”. Lệch giữa hạn kế hoạch và hạn
        theo luật nghĩa là kế hoạch đang đặt khác quy tắc — kiểm lại trước khi lấy làm mốc.
      </div>
    </ViewportDialog>
  );
}

/** Một cụm cảnh báo — mở ra mới hiện từng hạng mục bên trong. */
function CumRow({ c, email, onOpen }: {
  c: { khoa: string; ten: string; rows: AlertRow[]; treNhat: number; nguoi: string[]; rpn: number };
  email: (ten?: string) => string | undefined | null;
  onOpen: (r: AlertRow) => void;
}) {
  const [mo, setMo] = useState(false);
  const tre = c.treNhat < 0;
  return (
    <div style={{ border: `1px solid ${tre ? C.raspSoft : C.pinkSoft}`, borderRadius: 14, overflow: "hidden" }}>
      <button type="button" onClick={() => setMo((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                 padding: "12px 14px", border: "none", cursor: "pointer",
                 background: tre ? C.raspSoft : C.surface, fontFamily: TEXT }}>
        <span style={{ fontFamily: NUM, fontSize: 14, fontWeight: 900,
                       color: tre ? C.raspText : C.plum, minWidth: 30 }}>{c.rows.length}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: C.plum,
                         overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.ten}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.plumSoft }}>
            {c.rows.length} hạng mục
            {tre ? ` · trễ nhất ${Math.abs(c.treNhat)} ngày` : ` · sớm nhất còn ${c.treNhat} ngày`}
            {c.nguoi.length ? ` · ${c.nguoi.join(", ")}` : " · chưa có người"}
          </span>
        </span>
        <Tag color={C.raspText} bg={C.raspSoft}>RPN {c.rpn}</Tag>
        <span style={{ color: C.plumSoft, fontWeight: 900 }}>{mo ? "▾" : "▸"}</span>
      </button>
      {mo && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, background: C.surfaceSunk }}>
          {c.rows.map((r) => <AlertRowItem key={`${r.kind}-${r.a.id}`} r={r} email={email(r.a.owner)} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
}

export default function AlertsView({ acts }: { acts: Activity[] }) {
  const [tab, setTab] = useState<"list" | "matrix">("list");
  const [bucket, setBucket] = useState<AlertRow["kind"]>("over");
  const [dept, setDept] = useState("all");
  const [win, setWin] = useState("all");
  const [level, setLevel] = useState("all");
  const [owner, setOwner] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("risk");
  const [detail, setDetail] = useState<AlertRow | null>(null);
  /* Phân trang thật thay nút "Hiện thêm" (268 dòng = bấm 6 lần). */
  const [trang, setTrang] = useState(0);
  const [coTrang, setCoTrang] = useState(50);
  /* Gom nhóm. Danh sách phẳng ở đây gần như vô dụng: hàng chục dòng liên
     tiếp cùng "RPN 27 · Rủi ro cao · Quá hạn" nên sắp theo RPN không tách
     được gì. Người vận hành xử theo CỤM (một hệ thống, một người, một đợt),
     không xử theo từng dòng. */
  const [gom, setGom] = useState(true);
  // Phân tích AI cho đúng bộ phận đang lọc. Không dùng bộ lọc còn lại (mức
  // rủi ro, người, từ khoá) vì n8n đọc lại số từ Supabase chứ không nhận
  // danh sách từ trình duyệt — nói "đã lọc" mà số không khớp thì tệ hơn là
  // nói thẳng phạm vi chỉ theo bộ phận.
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const [moGuiMail, setMoGuiMail] = useState(false);
  // Email người thực hiện lấy từ tab "Người thực hiện" — thấy cảnh báo là
  // nhắc được ngay, khỏi mở danh bạ ở trang khác.
  const { find } = usePerformers();

  // ----- Dựng bốn nhóm cảnh báo từ dữ liệu gốc -----
  const all: AlertRow[] = useMemo(() => {
    const rows: AlertRow[] = [];
    for (const a of acts) {
      const al = a.alert;
      if (al && (al.kind === "over" || al.kind === "soon")) {
        rows.push({ a, kind: al.kind, dleft: al.dleft, date: al.date ?? null, stage: al.stage });
      }
    }
    // Tái thẩm định: dự báo từ ngày đích + tần suất, giữ cả mốc vừa trôi qua 30 ngày.
    for (const a of acts) {
      if (a.st !== "done" || !(Number(a.freq) > 0)) continue;
      const base = parseD(a.target);
      const next = base ? addMonths(base, Number(a.freq)) : null;
      const dleft = next ? daysBetween(next, vmpToday()) : 0;
      if (dleft >= -30) rows.push({ a, kind: "requal", dleft, date: next, stage: `chu kỳ ${a.freq} tháng` });
    }
    // Rủi ro cao chưa xong — nhóm này KHÔNG cần đến hạn mới hiện. Đây là phần
    // trang QRM cũ gọi là "ưu tiên xử lý", nay nằm cùng chỗ với cảnh báo.
    for (const a of acts) {
      if (qrmLevel(qrmRpn(a)) !== "cao") continue;
      const d = parseD(a.target);
      rows.push({
        a, kind: "risk",
        dleft: d ? daysBetween(d, vmpToday()) : 0,
        date: d, stage: a.alert?.stage || "đích VMP",
      });
    }
    return rows;
  }, [acts]);

  // ----- Bộ lọc dùng chung cho mọi nhóm -----
  const owners = useMemo(() => {
    const s = new Set<string>();
    acts.forEach((a) => { const o = String(a.owner || "").trim(); if (o && o !== "—") s.add(o); });
    return [...s].sort((x, y) => x.localeCompare(y, "vi"));
  }, [acts]);

  // Gõ phím không lọc ngay: chờ 250ms cho người dùng gõ xong.
  const kw = useDebounce(q.trim().toLowerCase(), 250);
  const pass = (r: AlertRow): boolean => {
    if (dept !== "all" && r.a.dept !== dept) return false;
    if (win !== "all" && Math.abs(r.dleft) > Number(win)) return false;
    if (level !== "all" && qrmLevel(qrmRpn(r.a)) !== level) return false;
    if (owner !== "all" && String(r.a.owner || "").trim() !== owner) return false;
    if (kw && !`${r.a.id} ${r.a.name} ${r.a.vtype} ${r.a.owner}`.toLowerCase().includes(kw)) return false;
    return true;
  };

  const sortRows = (rows: AlertRow[]): AlertRow[] => {
    const out = [...rows];
    if (sort === "due") out.sort((x, y) => x.dleft - y.dleft);
    else if (sort === "name") out.sort((x, y) => String(x.a.name || "").localeCompare(String(y.a.name || ""), "vi"));
    else out.sort(byRisk);          // mặc định: rủi ro cao trước
    return out;
  };

  const byKind = useMemo(() => {
    const g: Record<AlertRow["kind"], AlertRow[]> = { over: [], soon: [], requal: [], risk: [] };
    all.filter(pass).forEach((r) => g[r.kind].push(r));
    (Object.keys(g) as AlertRow["kind"][]).forEach((k) => { g[k] = sortRows(g[k]); });
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, dept, win, level, owner, kw, sort]);

  const command = useMemo(() => buildAlertsCommandModel([
    ...byKind.over,
    ...byKind.risk,
    ...byKind.soon,
    ...byKind.requal,
  ], 5), [byKind]);
  const [topAlert, ...nextAlerts] = command.queue;

  /* Đếm hạng mục mà điểm trọng yếu chưa có dấu QA duyệt. Không có trường đó
     trong bản đang tải thì để 0 và câu chữ tự chuyển sang cách nói không
     khẳng định con số. */
  const soChuaDuyet = useMemo(
    () => acts.filter((a) => {
      const r = (a._raw || {}) as Record<string, unknown>;
      return "qa_approved_at" in r && !r.qa_approved_at;
    }).length,
    [acts],
  );

  const shown = byKind[bucket];
  const shownCut = useMemo(
    () => (coTrang > 0 ? shown.slice(trang * coTrang, (trang + 1) * coTrang) : shown),
    [shown, trang, coTrang],
  );

  /* Cụm = nhóm việc (work_group) nếu có, không thì lấy mã đối tượng. Cùng
     một hệ thống nước thì ba hạng mục của nó phải nằm chung một dòng. */
  const cum = useMemo(() => {
    const m = new Map<string, { ten: string; rows: AlertRow[] }>();
    for (const r of shown) {
      const k = String(r.a.group || r.a.obj || r.a.code || "—");
      if (!m.has(k)) m.set(k, { ten: String(r.a.group || r.a.objName || r.a.obj || k), rows: [] });
      m.get(k)!.rows.push(r);
    }
    return [...m.entries()]
      .map(([khoa, v]) => {
        const treNhat = Math.min(...v.rows.map((r) => r.dleft));
        const nguoi = [...new Set(v.rows.map((r) => String(r.a.owner || "")).filter((x) => x && x !== "—"))];
        const rpn = Math.max(...v.rows.map((r) => qrmRpn(r.a)));
        return { khoa, ten: v.ten, rows: v.rows, treNhat, nguoi, rpn };
      })
      .sort((x, y) => x.treNhat - y.treNhat || y.rows.length - x.rows.length);
  }, [shown]);
  const cumCat = useMemo(
    () => (coTrang > 0 ? cum.slice(trang * coTrang, (trang + 1) * coTrang) : cum),
    [cum, trang, coTrang],
  );
  useEffect(() => { setTrang(0); }, [bucket, dept, win, level, owner, kw, sort, gom]);
  const moKho = useCallback((r: AlertRow) => setDetail(r), []);
  const hasFilter = dept !== "all" || win !== "all" || level !== "all" || owner !== "all" || !!kw;

  // ----- Xuất danh sách đang xem ra CSV để dán vào biên bản họp -----
  const exportCsv = () => {
    const head = ["Nhóm", "Mã", "Tên hạng mục", "Loại", "Bộ phận", "Người thực hiện", "Email",
                  "Mốc", "Hạn", "Ngày còn (âm = trễ)", "RPN", "Mức rủi ro"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [head.map(esc).join(",")];
    for (const r of shown) {
      const rpn = qrmRpn(r.a);
      lines.push([
        KIND_LABEL[r.kind], r.a.id, r.a.name, r.a.vtype, r.a.dept, nguoiPhuTrach(r.a.owner),
        find(r.a.owner)?.email ?? "",
        r.stage, r.date ? fmtVN(r.date) : "", r.dleft, rpn, LEVEL_STYLE[qrmLevel(rpn)].label,
      ].map(esc).join(","));
    }
    // ﻿ để Excel nhận ra UTF-8, không thì tiếng Việt ra ký tự lạ.
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `canh-bao-${bucket}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deptLabel = dept === "all" ? "Toàn nhà máy" : (DEPTS.find((d) => d.id === dept)?.name || dept);

  const chayAi = async () => {
    setAiLoading(true); setAiErr(""); setAiText("");
    try {
      const r = await chayPhanTichAi({ loai: "canh_bao", pham_vi: dept });
      if (r.ok && r.ai_text) setAiText(r.ai_text);
      else setAiErr(r.error ? `Lỗi AI: ${r.error}` : "Không nhận được phản hồi AI từ n8n.");
    } catch (e) { setAiErr((e as Error)?.message || "Lỗi kết nối n8n."); }
    finally { setAiLoading(false); }
  };

  const priorityCards = [
    { id: "over", Icon: AlertCircle, label: "Cần xử lý ngay", sub: "Hạng mục đã quá hạn" },
    { id: "soon", Icon: CalendarClock, label: "Theo dõi 30 ngày", sub: `Tới hạn trong ${SOON_DAYS} ngày` },
    { id: "risk", Icon: ShieldAlert, label: "Rủi ro cao cần QA xem", sub: "RPN ≥ 15 · chưa đóng" },
    { id: "requal", Icon: RefreshCw, label: "Tái thẩm định", sub: "Chu kỳ kế tiếp cần chuẩn bị" },
  ] as const;

  const topEmail = topAlert ? find(topAlert.a.owner)?.email : null;
  const topRpn = topAlert ? qrmRpn(topAlert.a) : 0;
  const topLevel = LEVEL_STYLE[qrmLevel(topRpn)];
  const departmentLabel = (department: string) => department === "unassigned"
    ? "Chưa phân bộ phận"
    : (DEPTS.find((item) => item.id === department)?.name || department);

  const selStyle = { fontFamily: TEXT, fontSize: 12, fontWeight: 700, color: C.plum, border: `1.5px solid ${C.pinkSoft}`, background: C.surface, borderRadius: 999, padding: "8px 13px", cursor: "pointer" };
  const chip = (on: boolean) => ({ fontFamily: TEXT, fontSize: 12, fontWeight: 800, border: on ? "none" : `1.5px solid ${C.pinkSoft}`, // C.lav (#8168CE) với chữ trắng chỉ đạt 4.37:1 — dưới ngưỡng WCAG AA
    // 4.5:1 cho chữ nhỏ. C.lavText (#5F44AD) đạt ~7:1.
    background: on ? C.lavText : C.surface, color: on ? "var(--lp-on-plum)" : C.plumSoft, borderRadius: 999, padding: "8px 13px", cursor: "pointer" });
  const tabBtn = (on: boolean) => ({ display: "flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 999, cursor: "pointer", fontFamily: TEXT, fontSize: 14, fontWeight: on ? 800 : 600, border: `1.5px solid ${on ? C.pink : C.pinkSoft}`, background: on ? C.pinkSoft : C.surface, color: on ? C.plum : C.plumSoft });

  return (
    <div className="alerts-page-shell">
      {/* Hai mặt của cùng một việc: danh sách để làm, ma trận để nhìn tổng thể */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button data-desktop-primary-actionable type="button" onClick={() => setTab("list")} style={tabBtn(tab === "list")}>
          <AlertCircle size={15} /> Danh sách cảnh báo
        </button>
        <button type="button" onClick={() => setTab("matrix")} style={tabBtn(tab === "matrix")}>
          <ShieldAlert size={15} /> Ma trận rủi ro (QRM)
        </button>
      </div>

      {tab === "matrix" ? <QrmView acts={acts} /> : (
        <>
          <section className="alerts-command" aria-labelledby="alerts-command-title">
            <article className="alerts-command__hero">
              <div className="alerts-command__hero-head">
                <span className="alerts-command__eyebrow">Bàn điều phối · ưu tiên số 1</span>
                {topAlert && <Tag color={topLevel.text} bg={topLevel.soft}>RPN {topRpn}</Tag>}
              </div>
              <h2 id="alerts-command-title">Việc cần hành động trước</h2>
              {topAlert ? (
                <>
                  <div className="alerts-command__identity">
                    <strong>{topAlert.a.id}</strong>
                    <span>{topAlert.a.name}</span>
                  </div>
                  <div className="alerts-command__facts">
                    <span><b>{topAlert.dleft < 0 ? `Trễ ${Math.abs(topAlert.dleft)} ngày` : `Còn ${topAlert.dleft} ngày`}</b> · {topAlert.stage}</span>
                    <span>{nguoiPhuTrach(topAlert.a.owner)}{topAlert.a.dept ? ` · ${departmentLabel(String(topAlert.a.dept))}` : ""}</span>
                    {topAlert.date && <span>Hạn {fmtVN(topAlert.date)}</span>}
                  </div>
                  <div className="alerts-command__actions">
                    <button type="button" onClick={() => moKho(topAlert)}>Mở chi tiết</button>
                    {topEmail ? (
                      <a href={`mailto:${topEmail}?subject=${encodeURIComponent(`[VMP] Nhắc việc: ${topAlert.a.id} — ${topAlert.a.name}`)}`}>
                        <Mail size={15} aria-hidden="true" /> Nhắc qua email
                      </a>
                    ) : (
                      <span className="alerts-command__missing-email">Chưa có email người phụ trách</span>
                    )}
                  </div>
                </>
              ) : (
                <div className="alerts-command__empty">
                  <strong>Không có việc cần ưu tiên trong phạm vi này</strong>
                  <span>Thử mở rộng bộ lọc thời gian hoặc bộ phận để xem thêm.</span>
                </div>
              )}
            </article>

            <aside className="alerts-command__queue" aria-label="Bốn việc ưu tiên tiếp theo">
              <div className="alerts-command__queue-head">
                <strong>Tiếp theo</strong>
                <span>{nextAlerts.length} việc</span>
              </div>
              {nextAlerts.length ? nextAlerts.map((row, index) => {
                const rowEmail = find(row.a.owner)?.email;
                return (
                  <div key={`${row.kind}-${row.a.id}`} className="alerts-command__queue-item">
                    <button type="button" onClick={() => moKho(row)}>
                      <span className="alerts-command__rank">{index + 2}</span>
                      <span className="alerts-command__queue-copy">
                        <strong>{row.a.id} · {row.a.name}</strong>
                        <small>{row.stage} · {row.dleft < 0 ? `trễ ${Math.abs(row.dleft)} ngày` : `còn ${row.dleft} ngày`} · RPN {qrmRpn(row.a)}</small>
                      </span>
                      <ChevronRight size={17} aria-hidden="true" />
                    </button>
                    {rowEmail && (
                      <a aria-label={`Nhắc ${row.a.id} qua email`}
                        href={`mailto:${rowEmail}?subject=${encodeURIComponent(`[VMP] Nhắc việc: ${row.a.id} — ${row.a.name}`)}`}>
                        <Mail size={14} aria-hidden="true" />
                      </a>
                    )}
                  </div>
                );
              }) : <span className="alerts-command__queue-empty">Không còn việc nào trong hàng đợi.</span>}
            </aside>
          </section>

          <div className="alerts-priority-rail" role="group" aria-label="Bốn tín hiệu cảnh báo">
            {priorityCards.map((item) => (
              <button
                key={item.id}
                type="button"
                className="alerts-priority"
                data-priority={item.id}
                onClick={() => setBucket(item.id)}
                aria-pressed={bucket === item.id}
              >
                <span className="alerts-priority__icon"><item.Icon size={20} aria-hidden="true" /></span>
                <span className="alerts-priority__copy">
                  <strong>{item.label}</strong>
                  <span>{item.sub}</span>
                  {bucket === item.id && <span className="alerts-priority__current">Đang xem</span>}
                </span>
                <strong className="alerts-priority__count">{byKind[item.id].length}</strong>
              </button>
            ))}
          </div>

          {/* Thứ tự ưu tiên trên màn này do RPN quyết định, mà RPN tính từ
              điểm trọng yếu — vốn là ĐỀ XUẤT CỦA MÁY cho tới khi QA sửa tay.
              Trang "Quy tắc nghiệp vụ" có ghi điều đó, nhưng người dùng màn
              Cảnh báo không sang trang kia. Nói ngay tại chỗ đang dùng. */}
          <CauKetLuan
            tone="warn"
            chinh={`Thứ tự ưu tiên dưới đây dựa trên điểm rủi ro do máy chấm${soChuaDuyet ? ` — ${soChuaDuyet} hạng mục chưa được QA duyệt điểm` : ", chưa qua QA duyệt"}.`}
            phu="Điểm máy chấm là đề xuất, không thay đánh giá của QA. Xem cách chấm và duyệt lại ở màn Luật đang áp dụng."
          />

          {/* Bộ lọc chính giữ các quyết định phạm vi; tìm, xếp và xuất là công cụ phụ. */}
          <div className="alerts-filter-bar">
            <span className="alerts-filter-label"><Filter size={15} aria-hidden="true" /> Lọc</span>
            <select value={dept} onChange={(e) => setDept(e.target.value)} style={selStyle} aria-label="Lọc theo bộ phận">
              <option value="all">Tất cả bộ phận</option>
              {DEPTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={level} onChange={(e) => setLevel(e.target.value)} style={selStyle} aria-label="Lọc theo mức rủi ro">
              {LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select value={owner} onChange={(e) => setOwner(e.target.value)} style={selStyle} aria-label="Lọc theo người thực hiện">
              <option value="all">Mọi người thực hiện</option>
              {owners.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <div className="alerts-time-window" role="group" aria-label="Khoảng thời gian">
              {WINDOWS.map(([k, label]) => (
                <button key={k} type="button" onClick={() => setWin(k)} style={chip(win === k)}
                  aria-pressed={win === k}>{label}</button>
              ))}
            </div>
            <div className="alerts-view-mode" role="group" aria-label="Cách hiển thị cảnh báo">
              <button type="button" aria-pressed={gom} onClick={() => setGom(true)}>Gom theo đối tượng</button>
              <button type="button" aria-pressed={!gom} onClick={() => setGom(false)}>Theo từng hạng mục</button>
            </div>
            {hasFilter && (
              <button type="button" onClick={() => { setDept("all"); setWin("all"); setLevel("all"); setOwner("all"); setQ(""); }}
                className="alerts-filter-reset" style={{ ...selStyle, color: C.raspText, borderColor: C.raspSoft }}>Xoá lọc</button>
            )}
          </div>

          <details className="alerts-tools">
            <summary>Tìm kiếm &amp; công cụ</summary>
            <div className="alerts-tools__body">
              <label className="alerts-search">
                <Search size={14} aria-hidden="true" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm mã, tên, người…"
                  aria-label="Tìm cảnh báo"
                  style={{ border: "none", outline: "none", background: "transparent", fontFamily: TEXT, fontSize: 12, fontWeight: 600, color: C.plum }} />
              </label>
              <span className="alerts-sort-label"><ListFilter size={15} aria-hidden="true" /> Xếp</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)} style={selStyle} aria-label="Sắp xếp">
                {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button type="button" onClick={exportCsv} disabled={!shown.length}
                style={{ ...selStyle, display: "inline-flex", alignItems: "center", gap: 6, opacity: shown.length ? 1 : 0.5 }}>
                <Download size={14} aria-hidden="true" /> Xuất CSV
              </button>
            </div>
          </details>

          {bucket === "requal" ? (
            <Card variant="soft">
              <CardTitle icon={CalendarClock} sub="Dự báo từ ngày hoàn thành + tần suất — xếp theo điểm rủi ro">
                Lịch tái thẩm định ({shown.length})
              </CardTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {gom
                  ? cumCat.map((c) => <CumRow key={c.khoa} c={c} email={(t) => find(t)?.email ?? undefined} onOpen={moKho} />)
                  : shownCut.map((r) => <AlertRowItem key={`${r.kind}-${r.a.id}`} r={r} email={find(r.a.owner)?.email} onOpen={moKho} />)}
                {shown.length > 0 && (
                  <PhanTrang tong={gom ? cum.length : shown.length} trang={trang} setTrang={setTrang}
                    coTrang={coTrang} setCoTrang={setCoTrang} donVi={gom ? "cụm" : "hạng mục"} />
                )}
                {!shown.length && <div style={{ textAlign: "center", padding: 20, color: C.plumSoft, fontWeight: 600 }}>{hasFilter ? "Không có lịch tái thẩm định khớp bộ lọc." : "Chưa có lịch tái thẩm định."}</div>}
              </div>
            </Card>
          ) : (
            <Card variant="strong">
              <CardTitle
                icon={bucket === "risk" ? ShieldAlert : AlertCircle}
                sub={bucket === "risk"
                  ? "Trọng yếu cao mà chưa xong — xử lý trước cả khi tới hạn"
                  : "Quy tắc: Đề cương T‑60 · Báo cáo T‑5 · xếp theo điểm rủi ro ICH Q9"}>
                {KIND_LABEL[bucket]} ({shown.length})
              </CardTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {gom
                  ? cumCat.map((c) => <CumRow key={c.khoa} c={c} email={(t) => find(t)?.email} onOpen={moKho} />)
                  : shownCut.map((r) => <AlertRowItem key={`${r.kind}-${r.a.id}`} r={r} email={find(r.a.owner)?.email} onOpen={moKho} />)}
                {shown.length > 0 && (
                  <PhanTrang tong={gom ? cum.length : shown.length} trang={trang} setTrang={setTrang}
                    coTrang={coTrang} setCoTrang={setCoTrang} donVi={gom ? "cụm" : "hạng mục"} />
                )}
                {!shown.length && (
                  <div style={{ textAlign: "center", padding: 30, color: C.mintText, fontWeight: 700 }}>
                    {hasFilter ? `Không có hạng mục ${KIND_LABEL[bucket].toLowerCase()} khớp bộ lọc.` : `🎉 Không có hạng mục ${KIND_LABEL[bucket].toLowerCase()}!`}
                  </div>
                )}
              </div>
            </Card>
          )}

          <section className="alerts-management" aria-labelledby="alerts-management-title">
            <div className="alerts-management__head">
              <div>
                <span className="alerts-command__eyebrow">Góc nhìn quản lý</span>
                <h2 id="alerts-management-title">Điểm nghẽn trong phạm vi đang lọc</h2>
              </div>
              <span>{command.totalUnique} hạng mục duy nhất</span>
            </div>
            <div className="alerts-management__body">
              <div className="alerts-management__metrics">
                <article>
                  <strong>{command.overdueRate}%</strong>
                  <span>đang quá hạn</span>
                  <small>Cần tháo nút thắt trước</small>
                </article>
                <article>
                  <strong>{command.highRiskRate}%</strong>
                  <span>rủi ro cao</span>
                  <small>RPN từ 15 trở lên</small>
                </article>
                <article>
                  <strong>{command.unassignedCount}</strong>
                  <span>chưa có người</span>
                  <small>Cần xác nhận đầu mối</small>
                </article>
              </div>
              <div className="alerts-management__hotspots">
                <div className="alerts-management__hotspots-head">
                  <strong>Bộ phận nhiều cảnh báo</strong>
                  <span>Tối đa 5 điểm nóng</span>
                </div>
                {command.hotspots.length ? command.hotspots.slice(0, 5).map((item) => (
                  <div key={item.department} className="alerts-hotspot">
                    <span>{departmentLabel(item.department)}</span>
                    <i aria-hidden="true"><b style={{ width: `${item.share}%` }} /></i>
                    <strong>{item.count}</strong>
                    <small>{item.overdueCount} trễ · {item.highRiskCount} rủi ro cao</small>
                  </div>
                )) : (
                  <div className="alerts-management__empty">Chưa có cảnh báo để phân tích điểm nghẽn.</div>
                )}
              </div>
            </div>
          </section>

          {/* ===== Phân tích AI cho cảnh báo + gửi mail =====
              Danh sách trả lời "cái nào trước"; phần này trả lời "vì sao đang
              nghẽn và phải nhắc ai" — rồi gửi thẳng cho người cần biết mà
              không phải chép tay sang Outlook. */}
          <details className="alerts-ai-panel">
            <summary>
              <span><SparkIcon size={17} aria-hidden="true" /> Phân tích cảnh báo bằng AI</span>
              <small>Phạm vi: {deptLabel} · kết quả cần QA xác nhận</small>
            </summary>
            <div className="alerts-ai-panel__body">
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" onClick={chayAi} disabled={aiLoading || !aiConfigured()}
                  title={aiConfigured() ? undefined : AI_UNAVAILABLE}
                  style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 8, padding: "10px 18px",
                    borderRadius: 14, fontSize: 14, opacity: aiLoading || !aiConfigured() ? 0.55 : 1,
                    cursor: aiLoading || !aiConfigured() ? "not-allowed" : "pointer" }}>
                  {aiLoading ? <RefreshCw size={15} className="spin" /> : <SparkIcon size={15} />}
                  {aiLoading ? "AI đang phân tích…" : "Phân tích cảnh báo"}
                </button>
                <button type="button" onClick={() => setMoGuiMail(true)} disabled={!aiConfigured()}
                  title={aiConfigured() ? "Chạy AI rồi gửi bản phân tích qua email" : AI_UNAVAILABLE}
                  style={{ ...selStyle, display: "inline-flex", alignItems: "center", gap: 7,
                    background: C.lavSoft, color: C.lavText, borderColor: C.lavSoft, fontWeight: 800,
                    padding: "10px 16px", borderRadius: 14,
                    opacity: aiConfigured() ? 1 : 0.55, cursor: aiConfigured() ? "pointer" : "not-allowed" }}>
                  <Mail size={15} /> Gửi mail phân tích
                </button>
              </div>

              {!aiConfigured() && (
                <div className="alerts-ai-unavailable">
                  <AlertCircle size={16} aria-hidden="true" /> {AI_UNAVAILABLE}
                </div>
              )}
              {aiErr && <AlertAiError message={aiErr} />}
              {aiLoading && (
                <div style={{ padding: 24, textAlign: "center", color: C.plumSoft, fontWeight: 700 }}>
                  <RefreshCw size={22} className="spin" color={C.pink} />
                  <div style={{ marginTop: 10 }}>AI đang đọc lại số từ Supabase và phân tích…</div>
                </div>
              )}
              {!aiLoading && !aiErr && aiText && (
                <div style={{ whiteSpace: "pre-wrap", fontFamily: TEXT, fontSize: 14, color: C.plum, lineHeight: 1.8,
                  fontWeight: 500, background: C.lavSoft, borderLeft: `4px solid ${C.lav}`,
                  borderRadius: "0 14px 14px 0", padding: "18px 22px" }}>{aiText}</div>
              )}
              {!aiLoading && !aiErr && !aiText && aiConfigured() && (
                <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, lineHeight: 1.7 }}>
                  AI đọc lại số thẳng từ Supabase lúc bấm — không lấy từ bảng đang hiện, nên kết quả không
                  phụ thuộc bộ lọc rủi ro/người/từ khoá ở trên, chỉ theo bộ phận. AI chỉ nhận định, không
                  thay đánh giá của QA và không phải căn cứ phê duyệt GMP.
                </div>
              )}
            </div>
          </details>

          {/* Nhắc luật chấm điểm ngay dưới danh sách — để không ai phải đoán vì sao dòng này lên trên */}
          <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, lineHeight: 1.6, padding: "0 4px" }}>
            <b style={{ color: C.plum }}>Thứ tự ưu tiên</b> theo RPN = điểm trọng yếu (1–9) × khả năng xảy ra
            (quá hạn 3 · đang làm 2 · kế hoạch 1 · đã xong 0). Cùng điểm thì hạng mục trễ nhiều/gần hạn đứng trước.
            Mức: <b style={{ color: CRIT.Cao.text }}>cao ≥ 15</b> · <b style={{ color: CRIT.TB.text }}>trung bình 7–14</b> · <b style={{ color: CRIT["Thấp"].text }}>thấp ≤ 6</b>.
          </div>
        </>
      )}

      {detail && (
        <AlertDetailModal r={detail} email={find(detail.a.owner)?.email} onClose={() => setDetail(null)} />
      )}

      {moGuiMail && (
        <AiMailModal
          loai="canh_bao" phamVi={dept} phamViLabel={deptLabel}
          onClose={() => setMoGuiMail(false)}
          onDone={(r) => { if (r.ai_text) { setAiText(r.ai_text); setAiErr(""); } }}
        />
      )}
    </div>
  );
}

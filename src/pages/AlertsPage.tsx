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
import { useMemo, useState } from "react";
import { AlertCircle, CalendarClock, Filter, ShieldAlert, Download, Search, ListFilter } from "lucide-react";
import { C, TEXT, NUM } from "../constants/theme.ts";
import { CLS, CRIT, DEPTS, SOON_DAYS, vmpToday } from "../constants/vmp.ts";
import {
  parseD, fmtVN, daysBetween, addMonths, txt,
  qrmRpn, qrmLevel, byRisk,
} from "../utils/helpers.ts";
import { Card, CardTitle, Tag, KpiCard } from "../components/ui/Primitives.tsx";
import { usePerformers } from "../hooks/index.ts";
import QrmView from "./QrmPage.tsx";
import type { Activity } from "../types/domain.ts";

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

const LEVEL_STYLE: Record<string, { text: string; soft: string; label: string }> = {
  cao:  { text: C.raspText,     soft: C.raspSoft,     label: "Rủi ro cao" },
  tb:   { text: C.marigoldText, soft: C.marigoldSoft, label: "Rủi ro TB" },
  thap: { text: C.mintText,     soft: C.mintSoft,     label: "Rủi ro thấp" },
};

/** Một dòng cảnh báo đã chuẩn hoá — bốn nhóm dùng chung một hình dạng để
 *  lọc, xếp thứ tự và xuất file chỉ phải viết một lần. */
interface AlertRow {
  a: Activity;
  kind: "over" | "soon" | "requal" | "risk";
  /** Số ngày còn lại (âm = đã trễ). */
  dleft: number;
  date: Date | null;
  stage: string;
}

const KIND_LABEL: Record<AlertRow["kind"], string> = {
  over: "Quá hạn", soon: "Tới hạn", requal: "Tái thẩm định", risk: "Rủi ro cao",
};

export default function AlertsView({ acts }: { acts: Activity[] }) {
  const [tab, setTab] = useState<"list" | "matrix">("list");
  const [bucket, setBucket] = useState<AlertRow["kind"]>("over");
  const [dept, setDept] = useState("all");
  const [win, setWin] = useState("all");
  const [level, setLevel] = useState("all");
  const [owner, setOwner] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("risk");
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

  const kw = q.trim().toLowerCase();
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

  const shown = byKind[bucket];
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
        KIND_LABEL[r.kind], r.a.id, r.a.name, r.a.vtype, r.a.dept, txt(r.a.owner),
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

  const Row = ({ r }: { r: AlertRow }) => {
    const cls = (CLS as Record<string, typeof CLS.tb>)[String(r.a.cls ?? "tb")] ?? CLS.tb;
    const rpn = qrmRpn(r.a);
    const lv = LEVEL_STYLE[qrmLevel(rpn)];
    const late = r.dleft < 0;
    const email = find(r.a.owner)?.email;
    const edge = r.kind === "over" ? C.raspSoft : r.kind === "soon" ? C.marigoldSoft
      : r.kind === "risk" ? C.raspSoft : C.pinkSoft;
    return (
      <div className="vmp-row vmp-lift" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 13px", borderRadius: 16, background: C.surface, border: `1px solid ${edge}` }}>
        {/* Ô ngày — trễ thì đỏ, còn hạn thì cam/xanh theo nhóm */}
        <div style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0, background: late ? C.raspSoft : r.kind === "soon" ? C.marigoldSoft : C.skySoft, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 17, color: late ? C.raspText : r.kind === "soon" ? C.marigoldText : C.skyText, lineHeight: 1 }}>{Math.abs(r.dleft)}</span>
          <span style={{ fontSize: 9, color: C.plumSoft, fontWeight: 700 }}>ngày {late ? "trễ" : "nữa"}</span>
        </div>
        {/* Điểm rủi ro — lý do dòng này nằm ở vị trí này trong danh sách */}
        <div title={`RPN = trọng yếu × khả năng xảy ra (ICH Q9). Tối đa 27.`}
          style={{ width: 54, flexShrink: 0, textAlign: "center", padding: "6px 0", borderRadius: 12, background: lv.soft }}>
          <div style={{ fontFamily: NUM, fontWeight: 800, fontSize: 15, color: lv.text, lineHeight: 1 }}>{rpn}</div>
          <div style={{ fontSize: 9, fontWeight: 800, color: lv.text }}>RPN</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <Tag color={cls.text} bg={cls.soft}>{r.a.vtype}</Tag>
            <span style={{ fontFamily: TEXT, fontSize: 13.5, fontWeight: 800, color: C.plum }}>{r.a.name}</span>
          </div>
          <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 2 }}>
            {r.a.id} · Mốc <b style={{ color: late ? C.raspText : C.marigoldText }}>{r.stage}</b>
            {r.date ? ` · hạn ${fmtVN(r.date)}` : ""} · {txt(r.a.owner)}
            {email ? <> (<a href={`mailto:${email}?subject=${encodeURIComponent(`[VMP] ${KIND_LABEL[r.kind]}: ${r.a.id} — ${r.a.name}`)}`}
              style={{ color: C.lavText, fontWeight: 700 }}>{email}</a>)</> : null}
            {r.a.dep ? ` · BC: ${r.a.dep}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
          <Tag color={lv.text} bg={lv.soft}>{lv.label}</Tag>
          <Tag color={C.plumSoft} bg={C.pinkMist}>{KIND_LABEL[r.kind]}</Tag>
        </div>
      </div>
    );
  };

  const cards = [
    { id: "over",   emoji: "🚨", bg: C.raspSoft,     color: C.raspText,     ring: C.rasp,     label: "Hạng mục quá hạn",            sub: "Cần xử lý ngay" },
    { id: "soon",   emoji: "⏰", bg: C.marigoldSoft, color: C.marigoldText, ring: C.marigold, label: `Tới hạn (≤ ${SOON_DAYS} ngày)`, sub: "Theo dõi sát" },
    { id: "risk",   emoji: "🛡️", bg: C.raspSoft,     color: C.raspText,     ring: C.rasp,     label: "Rủi ro cao chưa xong",        sub: "RPN ≥ 15 · ICH Q9" },
    { id: "requal", emoji: "🔁", bg: C.lavSoft,      color: C.lavText,      ring: C.lav,      label: "Tái thẩm định sắp tới",       sub: "Theo tần suất" },
  ] as const;

  const selStyle = { fontFamily: TEXT, fontSize: 12.5, fontWeight: 700, color: C.plum, border: `1.5px solid ${C.pinkSoft}`, background: C.surface, borderRadius: 999, padding: "8px 13px", cursor: "pointer" };
  const chip = (on: boolean) => ({ fontFamily: TEXT, fontSize: 12.5, fontWeight: 800, border: on ? "none" : `1.5px solid ${C.pinkSoft}`, background: on ? C.lav : C.surface, color: on ? "#fff" : C.plumSoft, borderRadius: 999, padding: "8px 13px", cursor: "pointer" });
  const tabBtn = (on: boolean) => ({ display: "flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 999, cursor: "pointer", fontFamily: TEXT, fontSize: 13, fontWeight: on ? 800 : 600, border: `1.5px solid ${on ? C.pink : C.pinkSoft}`, background: on ? C.pinkSoft : C.surface, color: on ? C.plum : C.plumSoft });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Hai mặt của cùng một việc: danh sách để làm, ma trận để nhìn tổng thể */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setTab("list")} style={tabBtn(tab === "list")}>
          <AlertCircle size={15} /> Danh sách cảnh báo
        </button>
        <button type="button" onClick={() => setTab("matrix")} style={tabBtn(tab === "matrix")}>
          <ShieldAlert size={15} /> Ma trận rủi ro (QRM)
        </button>
      </div>

      {tab === "matrix" ? <QrmView acts={acts} /> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 24 }}>
            {cards.map((c) => (
              <div key={c.id} onClick={() => setBucket(c.id)} style={{ cursor: "pointer", borderRadius: 24, boxShadow: bucket === c.id ? `0 0 0 3px ${c.ring}` : "none", transition: "box-shadow .2s" }}>
                <KpiCard emoji={c.emoji} bg={c.bg} color={c.color} value={byKind[c.id].length}
                  label={c.label} sub={bucket === c.id ? "● Đang xem" : c.sub} subColor={c.color} />
              </div>
            ))}
          </div>

          {/* Bộ lọc: bộ phận · thời gian · mức rủi ro · người thực hiện · tìm kiếm */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "12px 15px", borderRadius: 18, background: "rgba(248,245,252,.6)", border: `1px solid ${C.pinkSoft}` }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 800, color: C.plumSoft }}><Filter size={15} /> Lọc</span>
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
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {WINDOWS.map(([k, label]) => (
                <button key={k} type="button" onClick={() => setWin(k)} style={chip(win === k)}>{label}</button>
              ))}
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1.5px solid ${C.pinkSoft}`, background: C.surface, borderRadius: 999, padding: "6px 12px" }}>
              <Search size={14} color={C.plumSoft} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm mã, tên, người…"
                style={{ border: "none", outline: "none", background: "transparent", fontFamily: TEXT, fontSize: 12.5, fontWeight: 600, color: C.plum, width: 150 }} />
            </label>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 800, color: C.plumSoft, marginLeft: 4 }}><ListFilter size={15} /> Xếp</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)} style={selStyle} aria-label="Sắp xếp">
              {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <button type="button" onClick={exportCsv} disabled={!shown.length}
              style={{ ...selStyle, display: "inline-flex", alignItems: "center", gap: 6, opacity: shown.length ? 1 : 0.5 }}>
              <Download size={14} /> Xuất CSV
            </button>
            {hasFilter && (
              <button type="button" onClick={() => { setDept("all"); setWin("all"); setLevel("all"); setOwner("all"); setQ(""); }}
                style={{ ...selStyle, color: C.raspText, borderColor: C.raspSoft, marginLeft: "auto" }}>Xoá lọc</button>
            )}
          </div>

          {bucket === "requal" ? (
            <Card variant="soft">
              <CardTitle icon={CalendarClock} sub="Dự báo từ ngày hoàn thành + tần suất — xếp theo điểm rủi ro">
                Lịch tái thẩm định ({shown.length})
              </CardTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {shown.map((r) => <Row key={`${r.kind}-${r.a.id}`} r={r} />)}
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
                {shown.map((r) => <Row key={`${r.kind}-${r.a.id}`} r={r} />)}
                {!shown.length && (
                  <div style={{ textAlign: "center", padding: 30, color: C.mintText, fontWeight: 700 }}>
                    {hasFilter ? `Không có hạng mục ${KIND_LABEL[bucket].toLowerCase()} khớp bộ lọc.` : `🎉 Không có hạng mục ${KIND_LABEL[bucket].toLowerCase()}!`}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Nhắc luật chấm điểm ngay dưới danh sách — để không ai phải đoán vì sao dòng này lên trên */}
          <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, lineHeight: 1.6, padding: "0 4px" }}>
            <b style={{ color: C.plum }}>Thứ tự ưu tiên</b> theo RPN = điểm trọng yếu (1–9) × khả năng xảy ra
            (quá hạn 3 · đang làm 2 · kế hoạch 1 · đã xong 0). Cùng điểm thì hạng mục trễ nhiều/gần hạn đứng trước.
            Mức: <b style={{ color: CRIT.Cao.text }}>cao ≥ 15</b> · <b style={{ color: CRIT.TB.text }}>trung bình 7–14</b> · <b style={{ color: CRIT["Thấp"].text }}>thấp ≤ 6</b>.
          </div>
        </>
      )}
    </div>
  );
}

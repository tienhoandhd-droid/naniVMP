/* WorkloadPage.jsx — Ma trận tải công việc Người × Tháng */
import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import { Activity, BarChart3, ShieldAlert, Flag, Users, UserX } from "lucide-react";
import { C, TEXT, NUM, GRAD } from "../constants/theme.ts";
import { WL_MONTHS, WL_QUARTERS, CAP_MONTH, CAP_HOSO_MONTH, vmpToday } from "../constants/vmp.ts";
import { parseD, fmtVN, clamp, wlMonthOf, wlScore, wlPending, congConLai, hoSoConLai } from "../utils/helpers.ts";
// lucide-react cũng xuất icon tên Activity (dùng ở dưới) nên đặt tên khác cho kiểu.
import type { Activity as PlanActivity } from "../types/domain.ts";
import { Card, CardTitle, Tag, Modal, Donut, Mascot, Pill, CauKetLuan } from "../components/ui/Primitives.tsx";

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

function WorkloadDetailModal({ detail, onClose }: {
  detail: { title: string; tasks: PlanActivity[]; [k: string]: unknown };
  onClose: () => void;
}) {
  const tasks = [...detail.tasks].sort(
    (a, b) => (parseD(a.target)?.getTime() ?? 0) - (parseD(b.target)?.getTime() ?? 0),
  );
  const PhaseChip = ({ label, done, cong }: { label: string; done: boolean; cong?: number | null }) => <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 999, color: done ? C.mintText : C.marigoldText, background: done ? C.mintSoft : C.marigoldSoft }}>{done ? "✓" : "⏳"} {label}{!done && cong != null ? ` ${cong}nc` : ""}</span>;
  return (
    <Modal onClose={onClose} title={detail.title} icon={Activity} wide>
      <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 700, marginBottom: 14 }}>{tasks.length} hạng mục · còn lại <b style={{ color: C.lavText }}>{sum(tasks.map(congConLai))} ngày công</b> · <b style={{ color: C.pinkText }}>{tasks.filter(hoSoConLai).length} hồ sơ</b></div>
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
              <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 600, marginBottom: 9 }}>{a.code} · {a.owner} · đích {a.target ? fmtVN(parseD(a.target)) : "—"} · còn <b style={{ color: C.lavText }}>{congConLai(a)} nc</b></div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                <PhaseChip label="Đề cương" done={!ph.p} />
                <PhaseChip label="Thẩm định" done={!ph.v} cong={Number(a.effort) > 0 ? Number(a.effort) : null} />
                <PhaseChip label="Báo cáo" done={!ph.r} />
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export default function WorkloadView({ acts }: { acts: PlanActivity[] }) {
  const [scope, setScope] = useState("month");
  const [metric, setMetric] = useState("cong");
  const [detail, setDetail] = useState<{ title: string; tasks: PlanActivity[] } | null>(null);

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

  // Thang tuần tự theo cường độ tải: xanh nhạt → xanh đậm → cam (sắp đầy) →
  // đỏ (quá tải). Bỏ màu xanh dương ở giữa (không hợp thang magnitude) và
  // đồng bộ với thẻ tải từng người (xanh=nhẹ · cam=bận · đỏ=quá tải).
  const heat = (val: number, capv: number) => {
    const ratio = capv > 0 ? val / capv : 0;
    if (ratio > 1) return { bg: C.rasp + "66", text: C.raspText };
    if (ratio >= 0.85) return { bg: C.marigold + "66", text: C.marigoldText };
    if (ratio >= 0.5) return { bg: C.mint + "80", text: C.mintText };
    return { bg: C.mint + "38", text: C.mintText };
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
  const focus = pend.filter((a) => a.crit === "Cao" || wlScore(a) >= 7).map((a) => ({ a, sc: wlScore(a) })).sort((x, y) => y.sc - x.sc
      || ((parseD(x.a.target)?.getTime() ?? 0) - (parseD(y.a.target)?.getTime() ?? 0))).slice(0, 8);

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
  const Btn = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) => <button onClick={onClick} style={{ padding: "8px 15px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: TEXT, fontSize: 12.5, fontWeight: 800, background: on ? GRAD : C.pinkSoft, color: on ? "#fff" : C.plumSoft }}>{children}</button>;
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

  const mood = overloaded.length > 0 ? "stressed" : "happy";
  const bubble = overloaded.length > 0
    ? `Có ${overloaded.length} bạn đang quá tải ở tháng cao điểm (trên ngưỡng ${CAP_MONTH} ngày công/tháng)! Bấm vào từng người xem chi tiết 💪`
    : `Cả đội đang cân đối! Cứ giữ nhịp này là về đích VMP êm ru ✨`;
  const legend = [["Nhẹ", C.mint + "38"], ["Vừa", C.mint + "80"], ["Sắp đầy", C.marigold], ["Quá tải", C.rasp]];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {detail && <WorkloadDetailModal detail={detail} onClose={() => setDetail(null)} />}
      <Card variant="strong" style={{ background: `linear-gradient(120deg,#fff,${C.pinkMist})` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <div style={{ flexShrink: 0 }}><Mascot mood={mood} size={96} /></div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="pop" key={mood} style={{ background: C.surface, border: `1.5px solid ${C.pinkSoft}`, borderRadius: 18, padding: "12px 16px", fontFamily: TEXT, fontSize: 14, color: C.plum, fontWeight: 700, lineHeight: 1.5 }}>{bubble}</div>
            <div style={{ fontSize: 12.5, color: C.plumSoft, marginTop: 8, fontWeight: 700 }}>Còn lại: <b style={{ color: C.lavText }}>{totalCong} ngày công</b> · <b style={{ color: C.pinkText }}>{totalHoso} hồ sơ</b> · <b style={{ color: C.mintText }}>{people.length} người</b></div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 16 }}>
          <div><div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 800, marginBottom: 7 }}>KHUNG THỜI GIAN</div><div style={{ display: "flex", gap: 7 }}><Btn on={scope === "month"} onClick={() => setScope("month")}>Tháng</Btn><Btn on={scope === "quarter"} onClick={() => setScope("quarter")}>Quý</Btn><Btn on={scope === "year"} onClick={() => setScope("year")}>Năm</Btn></div></div>
          <div><div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 800, marginBottom: 7 }}>TÔ THEO</div><div style={{ display: "flex", gap: 7 }}><Btn on={metric === "cong"} onClick={() => setMetric("cong")}>Ngày công</Btn><Btn on={metric === "hoso"} onClick={() => setMetric("hoso")}>Hồ sơ</Btn></div></div>
        </div>
      </Card>

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
                     background: C.marigoldSoft, border: "none", borderRadius: 16, padding: "14px 18px",
                     fontFamily: TEXT, textAlign: "left", width: "100%" }}>
            <div>
              <div style={{ fontFamily: NUM, fontSize: 26, fontWeight: 800, color: C.marigoldText, lineHeight: 1 }}>
                {voChu.congTotal}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: C.plumSoft }}>ngày công</div>
            </div>
            <div>
              <div style={{ fontFamily: NUM, fontSize: 26, fontWeight: 800, color: C.marigoldText, lineHeight: 1 }}>
                {voChu.hosoTotal}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: C.plumSoft }}>hồ sơ</div>
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
      <Card variant="strong">
        <CardTitle icon={Activity} sub={`Thanh = tháng bận nhất so với ngưỡng ${CAP_MONTH} ngày công/tháng · bấm vào thẻ để xem chi tiết`}>Sức tải từng người</CardTitle>
        {klSucTai && <CauKetLuan chinh={klSucTai.chinh} phu={klSucTai.phu} tone={klSucTai.tone} />}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(262px,1fr))", gap: 14 }}>
          {nguoiThat.map((p) => {
            const pk = peakMonth(p); const ratio = CAP_MONTH > 0 ? pk.eff / CAP_MONTH : 0;
            const band = ratio > 1 ? { l: "Quá tải", c: C.rasp, t: C.raspText, bg: C.raspSoft, e: "😵" } : ratio >= 0.6 ? { l: "Khá bận", c: C.marigold, t: C.marigoldText, bg: C.marigoldSoft, e: "🔥" } : { l: "Thong thả", c: C.mint, t: C.mintText, bg: C.mintSoft, e: "🌿" };
            return (
              <button key={p.name} className="vmp-lift" onClick={() => openDetail(`Việc còn lại của ${p.name}`, p.months.flatMap((m) => m.tasks))} style={{ textAlign: "left", cursor: "pointer", background: C.surface, border: `1.5px solid ${C.pinkSoft}`, borderRadius: 18, padding: 15, fontFamily: TEXT }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 999, background: GRAD, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontFamily: NUM, fontSize: 17, flexShrink: 0 }}>{p.name[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 15, color: C.plum }}>{p.name}</div><div style={{ fontSize: 11, color: C.plumSoft, fontWeight: 700 }}>{p.count} hạng mục</div></div>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: band.t, background: band.bg, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>{band.e} {band.l}</span>
                </div>
                <div style={{ display: "flex", gap: 9, marginBottom: 12 }}>
                  <div style={{ flex: 1, background: C.lavSoft, borderRadius: 12, padding: "9px 11px" }}><div style={{ fontFamily: NUM, fontWeight: 800, fontSize: 21, color: C.lavText, lineHeight: 1 }}>{p.congTotal}</div><div style={{ fontSize: 10.5, color: C.plumSoft, fontWeight: 700, marginTop: 2 }}>ngày công</div></div>
                  <div style={{ flex: 1, background: C.pinkSoft, borderRadius: 12, padding: "9px 11px" }}><div style={{ fontFamily: NUM, fontWeight: 800, fontSize: 21, color: C.pinkText, lineHeight: 1 }}>{p.hosoTotal}</div><div style={{ fontSize: 10.5, color: C.plumSoft, fontWeight: 700, marginTop: 2 }}>hồ sơ</div></div>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: C.pinkSoft, overflow: "hidden" }}><div style={{ height: "100%", width: clamp(ratio, 0, 1) * 100 + "%", background: band.c, borderRadius: 999, transition: "width .9s ease" }} /></div>
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {p.critCao > 0 && <Tag color={C.raspText} bg={C.raspSoft}>{p.critCao} trọng yếu cao</Tag>}
                  {p.over > 0 && <Tag color={C.marigoldText} bg={C.marigoldSoft}>{p.over} quá hạn</Tag>}
                  <span style={{ marginLeft: "auto", fontSize: 11, color: C.pinkText, fontWeight: 800 }}>Xem →</span>
                </div>
              </button>
            );
          })}
          {nguoiThat.length === 0 && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 28, color: C.mintText, fontWeight: 700 }}>🎉 Không còn hạng mục nào chưa chốt VMP!</div>}
        </div>
      </Card>

      {/* Matrix */}
      <Card variant="strong">
        <CardTitle icon={BarChart3} right={<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{legend.map(([l, c]) => <span key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.plum, fontWeight: 700 }}><span style={{ width: 12, height: 12, borderRadius: 4, background: c }} />{l}</span>)}</div>} sub={`Mỗi ô = ${metric === "cong" ? "ngày công" : "hồ sơ"} · bấm vào ô để xem`}>Ma trận · Người × {scope === "month" ? "Tháng" : scope === "quarter" ? "Quý" : "Năm"}</CardTitle>
        {klMaTran && <CauKetLuan chinh={klMaTran.chinh} phu={klMaTran.phu} tone={klMaTran.tone} />}
        <div style={{ overflowX: "auto" }} className="vmp-scroll">
          <table style={{ borderCollapse: "separate", borderSpacing: 5, minWidth: scope === "month" ? 880 : 440 }}>
            <thead><tr>
              <th style={{ textAlign: "left", fontSize: 11, color: C.plumSoft, fontWeight: 800, padding: "0 8px 8px", position: "sticky", left: 0, background: C.surface }}>NGƯỜI</th>
              {cols.map((c, ci) => { const isNow = scope === "month" && ci === vmpToday().getMonth(); return <th key={c} style={{ fontSize: 11, fontWeight: 800, color: isNow ? C.pinkText : C.plumSoft, padding: "0 4px 8px", minWidth: 54 }}>{c}{isNow ? " •" : ""}</th>; })}
              <th style={{ fontSize: 11, fontWeight: 800, color: C.plum, padding: "0 6px 8px" }}>TỔNG</th>
            </tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.name}>
                  <td style={{ padding: "4px 8px", position: "sticky", left: 0, background: C.surface, zIndex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 26, height: 26, borderRadius: 999, background: GRAD, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontFamily: NUM, fontSize: 12, flexShrink: 0 }}>{p.name[0]}</div><span style={{ fontFamily: TEXT, fontSize: 13, fontWeight: 800, color: C.plum, whiteSpace: "nowrap" }}>{p.name}</span></div>
                  </td>
                  {cols.map((c, ci) => {
                    const v = valIn(p, ci); const tasks = tasksIn(p, ci);
                    if (v <= 0) return <td key={ci} style={{ textAlign: "center" }}><div style={{ height: 42, borderRadius: 10, background: C.pinkMist }} /></td>;
                    const st = heat(v, cap);
                    return <td key={ci} style={{ textAlign: "center" }}>
                      <div onClick={() => openDetail(`${p.name} · ${c}`, tasks)} style={{ height: 42, borderRadius: 10, background: st.bg, border: `1px solid ${st.text}33`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                        <span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 15, color: st.text, lineHeight: 1 }}>{v}</span>
                        <span style={{ fontSize: 8.5, color: st.text, fontWeight: 700, opacity: .85 }}>{metric === "cong" ? "nc" : "hồ sơ"}</span>
                      </div>
                    </td>;
                  })}
                  <td style={{ textAlign: "center" }}>
                    <div style={{ height: 42, borderRadius: 10, background: peakMonth(p).eff > CAP_MONTH ? C.raspSoft : C.lavSoft, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 15, color: peakMonth(p).eff > CAP_MONTH ? C.raspText : C.lavText, lineHeight: 1 }}>{metric === "cong" ? p.congTotal : p.hosoTotal}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Phân công theo nhóm việc */}
      <Card variant="strong">
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
                         borderRadius: 16, padding: 14, fontFamily: TEXT }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: chua ? C.marigoldText : C.plum,
                              lineHeight: 1.4, minHeight: 36 }}>
                  {g.name}
                </div>
                <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 700, margin: "4px 0 9px" }}>
                  {g.owners.size ? [...g.owners].join(" · ") : "chưa có ai phụ trách"}
                </div>
                <div style={{ height: 7, borderRadius: 999, background: C.pinkMist, overflow: "hidden" }}>
                  <div style={{ width: `${g.rate}%`, height: "100%",
                                background: g.rate >= 80 ? C.mint : g.rate >= 40 ? C.marigold : C.rasp }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between",
                              marginTop: 7, fontSize: 11.5, fontWeight: 700 }}>
                  <span style={{ color: C.plumSoft }}>{g.total} hạng mục</span>
                  <span style={{ color: C.mintText }}>{g.rate}% xong</span>
                  {g.over > 0 && <span style={{ color: C.raspText }}>{g.over} quá hạn</span>}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Bảng vinh danh cá nhân */}
      <Card variant="soft">
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
                       borderRadius: 13, background: C.surface, cursor: "pointer", textAlign: "left",
                       border: `1px solid ${r.name === "Chưa phân công" ? C.marigoldSoft : C.pinkSoft}` }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800,
                             color: r.name === "Chưa phân công" ? C.marigoldText : C.plum }}>
                {r.name}
              </span>
              <span style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 700, whiteSpace: "nowrap" }}>
                {r.done}/{r.total}
              </span>
              <div style={{ width: 110, height: 7, borderRadius: 999, background: C.pinkMist,
                            overflow: "hidden", flexShrink: 0 }}>
                <div style={{ width: `${r.rate}%`, height: "100%",
                              background: r.rate >= 80 ? C.mint : r.rate >= 40 ? C.marigold : C.rasp }} />
              </div>
              <span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 15, width: 46,
                             textAlign: "right", flexShrink: 0,
                             color: r.rate >= 80 ? C.mintText : r.rate >= 40 ? C.marigoldText : C.raspText }}>
                {r.rate}%
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* Focus */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 24 }}>
        <Card variant="soft">
          <CardTitle icon={ShieldAlert} sub="Theo mức trọng yếu">Phân bố trọng yếu</CardTitle>
          {klTrongYeu && <CauKetLuan chinh={klTrongYeu.chinh} phu={klTrongYeu.phu} tone={klTrongYeu.tone} />}
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <Donut size={132} segments={[{ value: critCount.Cao, color: C.rasp }, { value: critCount.TB, color: C.marigold }, { value: critCount["Thấp"], color: C.mint }]} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
              {[["Cao", C.rasp, C.raspText], ["TB", C.marigold, C.marigoldText], ["Thấp", C.mint, C.mintText]].map(([k, c, t]) => <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: C.plum }}><span style={{ width: 11, height: 11, borderRadius: 999, background: c }} />TY {k}</span><span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 16, color: t }}>{critCount[k] || 0}</span></div>)}
            </div>
          </div>
        </Card>
        <Card variant="strong">
          <CardTitle icon={Flag} sub="Trọng yếu cao / ≥ 7 — ưu tiên">Cần tập trung</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {focus.map(({ a, sc }) => <div key={a.id} className="vmp-row vmp-lift" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 13, background: C.surface, border: `1px solid ${C.raspSoft}` }}>
              <span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 13, color: "#fff", background: sc >= 7 ? C.raspText : C.marigoldText, width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{sc}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}><Tag color={C.lavText} bg={C.lavSoft}>{a.vtype}</Tag><span style={{ fontFamily: TEXT, fontSize: 13, fontWeight: 800, color: C.plum }}>{a.name}</span></div>
                <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 600, marginTop: 1 }}>{a.owner} · đích {a.target ? fmtVN(parseD(a.target)) : "—"}</div>
              </div>
              <Pill s={a.st} small />
            </div>)}
            {focus.length === 0 && <div style={{ textAlign: "center", padding: 22, color: C.mintText, fontWeight: 700 }}>Không còn trọng yếu cao 🎉</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}

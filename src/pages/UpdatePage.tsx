/* UpdatePage.jsx — Cập nhật tiến độ thực tế */
import { useState, useMemo, useEffect } from "react";
import { Pencil, Search, Activity } from "lucide-react";
import { C, TEXT, NUM, GRAD, btnPrimary, INP } from "../constants/theme.ts";
import { STATUS, STAGES, PERIODS } from "../constants/vmp.ts";
import { stageOf, inPeriod, nguoiPhuTrach } from "../utils/helpers.ts";
import { supabase } from "../lib/supabaseClient.ts";
import { useDebounce } from "../hooks/index.ts";
import { Card, CardTitle, Tag, Pill, StateBadge } from "../components/ui/Primitives.tsx";
import ProgressEditModal from "../components/dashboard/ProgressEditModal.tsx";
// Đặt tên khác vì lucide-react cũng xuất một icon tên Activity dùng ở dưới.
import type { Activity as PlanActivity } from "../types/domain.ts";

export default function UpdateView({ acts, conn, isAdmin, onUpdate, onReload, readOnly = true }: {
  acts: PlanActivity[];
  /** Không dùng index signature để nhận được cả ConnState (status là union). */
  conn?: { status?: string; msg?: string };
  isAdmin?: boolean;
  onUpdate?: (
    id: string,
    patch: Record<string, unknown>,
    userName?: string,
    reason?: string,
    expectedVersion?: number,
  ) => void;
  onReload?: () => void;
  readOnly?: boolean;
}) {
  const [q, setQ] = useState("");
  const [fst, setFst] = useState("all");
  const [period, setPeriod] = useState("all");
  const [stageF, setStageF] = useState("all");
  /** Lọc nhanh theo lỗi dữ liệu — để không phải dò 461 dòng tìm chỗ thiếu. */
  const [fix, setFix] = useState("all");
  const [edit, setEdit] = useState<PlanActivity | null>(null);
  // Gõ phím không lọc ngay — 461 dòng dựng lại mỗi phím là chỗ giật nhất trang này.
  const kw = useDebounce(q.trim().toLowerCase(), 250);
  const [hien, setHien] = useState(60);        // số dòng dựng thật trong bảng
  const inWindow = useMemo(() => acts.filter((a) => inPeriod(a, period)), [acts, period]);
  // Tính giai đoạn 1 lần/hạng mục rồi tái dùng (trước đây stageOf chạy ~7 lần/hàng).
  const stageByItem = useMemo(() => {
    const m = new Map();
    inWindow.forEach((a) => m.set(a.id, stageOf(a)));
    return m;
  }, [inWindow]);
  // Bốn lỗi mà kiểm tra dữ liệu ở Supabase đang báo — cùng định nghĩa với
  // rpc_check_data_quality để hai chỗ không nói khác nhau.
  const FIXES = useMemo(() => ({
    done_no_date: {
      label: "Hoàn thành nhưng thiếu ngày",
      hint: "Vi phạm ALCOA+ — đã ghi hoàn thành thì phải có ngày thực tế",
      test: (a: PlanActivity) => a.st === "done" && !a._raw?.ngay_vmp,
    },
    no_deadline: {
      label: "Thiếu deadline VMP",
      hint: "Không có mốc đích thì mọi mốc khác không tính được",
      test: (a: PlanActivity) => !a.target,
    },
    no_owner: {
      label: "Chưa có QA phụ trách",
      hint: "Không phân công thì không ai theo",
      test: (a: PlanActivity) => !a.owner || a.owner === "—",
    },
    mismatch: {
      label: "Lệch pha hồ sơ",
      hint: "Trạng thái các giai đoạn mâu thuẫn nhau",
      test: (a: PlanActivity) => !!a.mismatch,
    },
  }), []);

  /* Bốn bộ lọc chạy song song. Tách từng điều kiện ra để ĐẾM và LỌC dùng
     chung một luật — trước đây số trên ô giai đoạn đếm trên toàn kỳ, còn
     bảng thì lọc thêm cả "cần bạn điền" / trạng thái / ô tìm, nên bấm ô
     ghi 85 mà bảng ra 0 dòng, nhìn như lọc hỏng. */
  const okFix    = (a: PlanActivity) => fix === "all" || !!FIXES[fix as keyof typeof FIXES]?.test(a);
  const okStage  = (a: PlanActivity) => stageF === "all" || stageByItem.get(a.id) === stageF;
  const okStatus = (a: PlanActivity) => fst === "all" || a.st === fst;
  const okSearch = (a: PlanActivity) => {
    const s = kw;
    if (!s) return true;
    return [a.code, a.name, a.owner, a.id, a.vtype].some((x) => String(x || "").toLowerCase().includes(s));
  };

  // Đếm kiểu "facet": mỗi ô đếm trên phần đã lọc bởi CÁC bộ lọc khác, trừ
  // chính nó — bấm vào ô nào cũng ra đúng bằng số ghi trên ô đó.
  const stageCount = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    STAGES.forEach((st) => { c[st.id] = 0; });
    inWindow.forEach((a) => {
      if (!okFix(a) || !okStatus(a) || !okSearch(a)) return;
      c.all++;
      const st = stageByItem.get(a.id);
      if (st != null && c[st] != null) c[st]++;
    });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inWindow, stageByItem, fix, fst, kw, FIXES]);

  const fixCount = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    for (const k of Object.keys(FIXES)) c[k] = 0;
    inWindow.forEach((a) => {
      if (!okStage(a) || !okStatus(a) || !okSearch(a)) return;
      c.all++;
      for (const [k, v] of Object.entries(FIXES)) if (v.test(a)) c[k]++;
    });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inWindow, stageByItem, stageF, fst, kw, FIXES]);

  const list = useMemo(
    () => inWindow.filter((a) => okFix(a) && okStage(a) && okStatus(a) && okSearch(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inWindow, stageByItem, stageF, fst, kw, fix, FIXES],
  );

  useEffect(() => { setHien(60); }, [stageF, fix, fst, kw, period]);

  const hasFilter = fix !== "all" || stageF !== "all" || fst !== "all" || !!q.trim() || period !== "all";
  const clearFilters = () => { setFix("all"); setStageF("all"); setFst("all"); setQ(""); setPeriod("all"); };
  const linked = conn?.status === "ok";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: C.mintSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><Pencil size={22} color={C.mintText} /></div>
            <div>
              <div style={{ fontFamily: TEXT, fontWeight: 800, fontSize: 17, color: C.plum }}>Theo dõi tiến độ thực tế</div>
              <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 600 }}>Nhập ngày và trạng thái thực tế ngay tại đây — Supabase là nơi lưu dữ liệu gốc</div>
            </div>
          </div>
          <Tag color={linked ? C.mintText : C.marigoldText} bg={linked ? C.mintSoft : C.marigoldSoft}>{linked ? "● Đã nối Supabase — ghi được" : "○ Chưa kết nối"}</Tag>
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <Search size={16} color={C.plumSoft} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo mã, tên, QA…" style={{ ...INP, paddingLeft: 36 }} />
          </div>
          <select value={fst} onChange={(e) => setFst(e.target.value)} style={{ ...INP, cursor: "pointer", maxWidth: 200 }}>
            <option value="all">Tất cả trạng thái</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {/* Cần bạn điền — đúng 4 lỗi mà kiểm tra dữ liệu ở Supabase đang báo.
            Không có thanh này thì phải dò tay 461 dòng mới tìm ra chỗ thiếu. */}
        <div style={{ marginTop: 14, paddingTop: 13, borderTop: `1px solid ${C.pinkMist}` }}>
          <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 800, marginBottom: 8 }}>
            CẦN BẠN ĐIỀN
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setFix("all")}
              style={{ padding: "8px 14px", borderRadius: 999, border: "none", cursor: "pointer",
                       fontFamily: TEXT, fontSize: 12.5, fontWeight: 800,
                       background: fix === "all" ? GRAD : C.pinkSoft,
                       color: fix === "all" ? "#fff" : C.plumSoft }}>
              Tất cả ({fixCount.all})
            </button>
            {Object.entries(FIXES).map(([k, v]) => {
              const n = fixCount[k] || 0;
              const on = fix === k;
              const nang = k === "done_no_date" || k === "no_deadline";
              return (
                <button key={k} onClick={() => setFix(on ? "all" : k)} title={v.hint}
                  disabled={n === 0}
                  style={{ padding: "8px 14px", borderRadius: 999, cursor: n ? "pointer" : "default",
                           fontFamily: TEXT, fontSize: 12.5, fontWeight: 800, border: "none",
                           opacity: n ? 1 : 0.45,
                           background: on ? (nang ? C.raspText : C.marigoldText)
                                          : (nang ? C.raspSoft : C.marigoldSoft),
                           color: on ? "#fff" : (nang ? C.raspText : C.marigoldText) }}>
                  {v.label} ({n})
                </button>
              );
            })}
          </div>
          {fix !== "all" && (
            <div style={{ marginTop: 9, fontSize: 12, color: C.plumSoft, lineHeight: 1.6 }}>
              {FIXES[fix as keyof typeof FIXES].hint}. Bấm <b>Cập nhật</b> ở từng dòng để điền.
            </div>
          )}
        </div>
      </Card>
      <Card variant="strong">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <CardTitle icon={Activity} sub="Bấm 1 ô để lọc danh sách — số trên ô đã tính cả các bộ lọc đang bật">Bản đồ giai đoạn ({stageCount.all})</CardTitle>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PERIODS.map(([id, lb]) => <button key={id} onClick={() => setPeriod(id)} style={{ padding: "7px 13px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: TEXT, fontSize: 12, fontWeight: 800, background: period === id ? GRAD : C.pinkSoft, color: period === id ? "#fff" : C.plumSoft }}>{lb}</button>)}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
          <button onClick={() => setStageF("all")} style={{ textAlign: "left", border: "none", cursor: "pointer", padding: "14px 16px", borderRadius: 16, background: C.surface, boxShadow: stageF === "all" ? `0 0 0 3px ${C.pink}` : `inset 0 0 0 1px ${C.pinkSoft}` }}>
            <div style={{ fontFamily: NUM, fontSize: 26, fontWeight: 800, color: C.plum }}>{stageCount.all}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.plumSoft, marginTop: 2 }}>Tất cả</div>
          </button>
          {STAGES.map((s) => { const n = stageCount[s.id] || 0; const on = stageF === s.id; return (
            <button key={s.id} onClick={() => setStageF(on ? "all" : s.id)} disabled={n === 0 && !on}
              title={n === 0 ? `Không có hạng mục nào đang ở "${s.label}" với bộ lọc hiện tại.` : `${n} hạng mục · bấm để lọc`}
              style={{ textAlign: "left", border: "none", cursor: n === 0 && !on ? "default" : "pointer", padding: "14px 16px", borderRadius: 16, background: s.bg, boxShadow: on ? `0 0 0 3px ${s.color}` : "none", opacity: n === 0 ? 0.55 : 1 }}>
              <div style={{ fontFamily: NUM, fontSize: 26, fontWeight: 800, color: s.color }}>{n}</div>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: s.color, marginTop: 2, lineHeight: 1.3 }}>{s.label}</div>
            </button>
          ); })}
        </div>
      </Card>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div className="vmp-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: TEXT, minWidth: 720 }}>
            <thead><tr style={{ background: C.pinkMist }}>
              {["Mã", "Tên", "Loại", "QA", "Deadline", "Giai đoạn", "Trạng thái", ""].map((h, i) => <th key={i} style={{ textAlign: i > 4 ? "center" : "left", padding: "13px 16px", fontSize: 12, fontWeight: 800, color: C.plumSoft, whiteSpace: "nowrap" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {list.slice(0, hien).map((a, i) => { const sg = STAGES.find((s) => s.id === stageByItem.get(a.id)); const itemState = a.state || (a._raw && a._raw.state) || "active"; const isFrozen = itemState !== "active"; return (
                <tr key={a.id} style={{ borderTop: `1px solid ${C.pinkSoft}`, background: i % 2 ? "rgba(255,255,255,.4)" : "transparent", opacity: isFrozen ? 0.6 : 1 }}>
                  <td style={{ padding: "12px 16px", fontWeight: 800, color: C.plum, fontSize: 13 }}>{a.code}</td>
                  <td style={{ padding: "12px 16px", color: C.plum, fontSize: 13 }}>
                    {a.name}
                    {/* S3-G: badge Không áp dụng / Đã hủy */}
                    {isFrozen && <div style={{ marginTop: 4 }}><StateBadge state={String(itemState)} small /></div>}
                  </td>
                  <td style={{ padding: "12px 16px" }}><Tag color={C.lavText} bg={C.lavSoft}>{a.vtype}</Tag></td>
                  <td style={{ padding: "12px 16px", color: C.plumSoft, fontSize: 13, fontWeight: 600 }}>{nguoiPhuTrach(a.owner)}</td>
                  <td style={{ padding: "12px 16px", color: C.plumSoft, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{a.target ? a.target.split("-").reverse().join("/") : "—"}</td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>{sg && <Tag color={sg.color} bg={sg.bg}>{sg.label}</Tag>}</td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}><Pill s={a.st} small /></td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <button onClick={() => { if (!readOnly) setEdit(a); }}
                      disabled={readOnly || (isFrozen && !isAdmin)}
                      title={readOnly ? "Đang ở chế độ chỉ đọc" : "Cập nhật tiến độ"}
                      style={{ ...btnPrimary, padding: "7px 14px", borderRadius: 10, fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6, opacity: readOnly ? 0.55 : 1, cursor: readOnly ? "not-allowed" : "pointer" }}><Pencil size={13} /> {readOnly ? "Chỉ đọc" : (isFrozen ? "Xem/khôi phục" : "Cập nhật")}</button>
                  </td>
                </tr>
              ); })}
              {list.length > hien && (
                <tr><td colSpan={8} style={{ padding: 14, textAlign: "center" }}>
                  <button onClick={() => setHien((n) => n + 100)}
                    style={{ ...btnPrimary, padding: "9px 18px", borderRadius: 11, fontSize: 13 }}>
                    Hiện thêm — đang xem {hien}/{list.length} hạng mục
                  </button>
                </td></tr>
              )}
              {/* Rỗng thì nói RÕ vì sao rỗng và bộ lọc nào đang bật — không thì
                  người dùng tưởng dữ liệu mất hoặc trang hỏng. */}
              {!list.length && (
                <tr><td colSpan={8} style={{ padding: 26, textAlign: "center", color: C.plumSoft, fontWeight: 600, lineHeight: 1.7 }}>
                  {hasFilter ? (
                    <>
                      Không có hạng mục nào khớp bộ lọc đang bật:
                      <div style={{ margin: "8px 0 12px", display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "center" }}>
                        {period !== "all" && <Tag color={C.lavText} bg={C.lavSoft}>Kỳ: {PERIODS.find(([id]) => id === period)?.[1]}</Tag>}
                        {stageF !== "all" && <Tag color={C.lavText} bg={C.lavSoft}>Giai đoạn: {STAGES.find((s) => s.id === stageF)?.label}</Tag>}
                        {fix !== "all" && <Tag color={C.marigoldText} bg={C.marigoldSoft}>Cần điền: {FIXES[fix as keyof typeof FIXES].label}</Tag>}
                        {fst !== "all" && <Tag color={C.lavText} bg={C.lavSoft}>Trạng thái: {(STATUS as Record<string, { label: string }>)[fst]?.label ?? fst}</Tag>}
                        {!!q.trim() && <Tag color={C.lavText} bg={C.lavSoft}>Tìm: “{q.trim()}”</Tag>}
                      </div>
                      <button onClick={clearFilters} style={{ ...btnPrimary, padding: "8px 16px", borderRadius: 10, fontSize: 12.5 }}>Xoá hết bộ lọc</button>
                    </>
                  ) : "Chưa có hạng mục nào trong kế hoạch."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, padding: "0 4px", lineHeight: 1.6 }}>
        <b style={{ color: C.mintText }}>Supabase là nơi lưu dữ liệu gốc</b> (từ 29/07/2026).
        Sửa ngày, trạng thái và danh mục ngay trên web — Google Sheet nay chỉ là bản tham chiếu
        chỉ đọc, sửa trên đó sẽ không vào hệ thống.
      </div>
      {edit && !readOnly && <ProgressEditModal
        act={edit}
        isAdmin={isAdmin}
        onClose={() => setEdit(null)}
        onReload={onReload}
        onSave={onUpdate ?? (() => { /* chưa nối hàm cập nhật */ })}
        onChangeState={async (id, newState) => {
          // S3-G: gọi RPC rpc_set_item_state (010) — bắt buộc nhập lý do
          if (!supabase) { alert("Supabase chưa cấu hình."); return; }
          const reason = window.prompt(
            newState === "active"
              ? `Lý do KHÔI PHỤC mã ${id} về Active:`
              : newState === "not_applicable"
              ? `Lý do đánh dấu ${id} "Không áp dụng" (vd: thiết bị ngừng dùng):`
              : `Lý do HỦY hạng mục ${id} (vd: theo phê duyệt CAPA #...):`
          );
          if (!reason || !reason.trim()) return;
          try {
            const { data, error } = await supabase.rpc("rpc_set_item_state", {
              p_validation_code: id,
              p_state: newState,
              p_reason: reason.trim(),
            });
            if (error) throw error;
            const r = data as unknown as { ok?: boolean; error?: string } | null;
            if (r && r.ok === false) throw new Error(r.error);
            alert(`✓ Đã đổi trạng thái ${id} → ${newState}`);
            setEdit(null);
            if (onReload) onReload();   // (MỚI) tải lại ngay để badge + đếm KPI cập nhật tức thì
          } catch (e) {
            alert("Lỗi đổi trạng thái: " + ((e as Error).message || "không rõ"));
          }
        }}
      />}
    </div>
  );
}

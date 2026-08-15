/* UpdatePage.jsx — Cập nhật tiến độ thực tế */
import { useState, useMemo, useEffect } from "react";
import { Pencil, Search, Activity } from "lucide-react";
import { C, TEXT, NUM, GRAD, btnPrimary, INP } from "../constants/theme.ts";
import { STATUS, STAGES, PERIODS } from "../constants/vmp.ts";
import { stageOf, inPeriod, nguoiPhuTrach } from "../utils/helpers.ts";
import { supabase } from "../lib/supabaseClient.ts";
import { useDebounce } from "../hooks/index.ts";
import { Card, CardTitle, Tag, Pill, StateBadge, PhanTrang } from "../components/ui/Primitives.tsx";
import MobileTaskList from "../components/ui/MobileTaskList.tsx";
import ProgressEditModal from "../components/dashboard/ProgressEditModal.tsx";
// Đặt tên khác vì lucide-react cũng xuất một icon tên Activity dùng ở dưới.
import type { Activity as PlanActivity } from "../types/domain.ts";

export default function UpdateView({ acts, conn, isAdmin, onUpdate, onReload, readOnly = true, focusId, onFocusDone }: {
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
  /** Mã hạng mục cần nhảy tới — màn "Hôm nay" truyền vào khi bấm Cập nhật. */
  focusId?: string;
  onFocusDone?: () => void;
}) {
  const [q, setQ] = useState("");
  const [fst, setFst] = useState("all");
  const [period, setPeriod] = useState("all");
  const [stageF, setStageF] = useState("all");
  /** Lọc nhanh theo lỗi dữ liệu — để không phải dò 461 dòng tìm chỗ thiếu. */
  const [fix, setFix] = useState("all");
  const [edit, setEdit] = useState<PlanActivity | null>(null);
  /** Mở hộp bằng đường tắt "✓ Xong bước" — hộp sẽ điền sẵn hôm nay + Hoàn thành. */
  const [quick, setQuick] = useState(false);
  // Gõ phím không lọc ngay — 461 dòng dựng lại mỗi phím là chỗ giật nhất trang này.
  const kw = useDebounce(q.trim().toLowerCase(), 250);
  // Phân trang thật thay nút "Hiện thêm" (phải bấm 7 lần mới hết 461 dòng).
  const [trang, setTrang] = useState(0);
  // 50 dòng/trang: 100 dòng đẩy chiều cao trang lên ~9600px, tức gần 10 màn
  // hình cuộn cho MỘT trang — phân trang mà vẫn phải cuộn dài thì chưa xong việc.
  const [coTrang, setCoTrang] = useState(50);
  /* D18 — hàng đã ngừng (Không áp dụng / Đã huỷ) ẨN mặc định.
     Trước đây chúng nằm xen giữa danh sách làm việc với nhãn "⊘ Xem/khôi
     phục", nên mỗi lần quét mắt xuống là một lần phải phân biệt "dòng này
     có phải việc của mình không". Chúng vẫn tra được, chỉ là không chen vào
     luồng làm việc hằng ngày nữa. */
  const [hienNgung, setHienNgung] = useState(false);
  const inWindow = useMemo(() => acts.filter((a) => {
    if (!inPeriod(a, period)) return false;
    if (hienNgung) return true;
    const st = String(a.state || (a._raw && (a._raw as Record<string, unknown>).state) || "active");
    return st === "active";
  }), [acts, period, hienNgung]);
  const soNgung = useMemo(() => acts.filter((a) => {
    const st = String(a.state || (a._raw && (a._raw as Record<string, unknown>).state) || "active");
    return st !== "active";
  }).length, [acts]);
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
      label: "Thiếu ngày hoàn thành",
      hint: "Vi phạm ALCOA+ — đã ghi hoàn thành thì phải có ngày thực tế",
      test: (a: PlanActivity) => a.st === "done" && !a._raw?.ngay_vmp,
    },
    no_deadline: {
      label: "Thiếu deadline VMP",
      hint: "Không có mốc đích thì mọi mốc khác không tính được",
      test: (a: PlanActivity) => !a.target,
    },
    no_owner: {
      label: "Chưa phân công QA",
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

  // Lát cắt đang dựng. coTrang = 0 nghĩa là "Tất cả".
  const lat = useMemo(
    () => (coTrang > 0 ? list.slice(trang * coTrang, (trang + 1) * coTrang) : list),
    [list, trang, coTrang],
  );
  // Đổi bộ lọc thì về trang đầu — không thì đang ở trang 5 mà danh sách mới
  // chỉ có 2 trang, màn hình rỗng và trông như mất dữ liệu.
  useEffect(() => { setTrang(0); }, [stageF, fix, fst, kw, period, hienNgung]);

  /* Nhảy tới đúng hạng mục mà màn "Hôm nay" vừa bấm: đổ mã vào ô tìm và bỏ
     mọi bộ lọc đang chắn, vì hạng mục đó có thể không nằm trong lát cắt hiện
     tại — bấm Cập nhật mà ra danh sách rỗng thì tệ hơn là không có nút. */
  useEffect(() => {
    if (!focusId) return;
    setQ(focusId);
    setFix("all"); setStageF("all"); setFst("all"); setPeriod("all");
    setTrang(0);
    onFocusDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

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
              <div style={{ fontFamily: TEXT, fontWeight: 800, fontSize: 16, color: C.plum }}>Tiến độ thẩm định</div>
              <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600 }}>Cập nhật mốc thực tế. Dữ liệu được lưu trực tiếp tại Supabase.</div>
            </div>
          </div>
          <Tag color={linked ? C.mintText : C.marigoldText} bg={linked ? C.mintSoft : C.marigoldSoft}>{linked ? "● Đã nối Supabase — ghi được" : "○ Chưa kết nối"}</Tag>
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <Search size={16} color={C.plumSoft} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo mã, tên, QA…" style={{ ...INP, paddingLeft: 36 }} />
          </div>
          {soNgung > 0 && (
            <label title="Hạng mục Không áp dụng / Đã huỷ — ẩn mặc định để không chen vào danh sách làm việc"
              style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer",
                       padding: "0 12px", borderRadius: 8, border: `1px solid ${hienNgung ? C.marigold : C.pinkSoft}`,
                       background: hienNgung ? C.marigoldSoft : C.surface,
                       fontFamily: TEXT, fontSize: 12, fontWeight: 800,
                       color: hienNgung ? C.marigoldText : C.plumSoft }}>
              <input type="checkbox" checked={hienNgung} onChange={(e) => setHienNgung(e.target.checked)} />
              Hiện cả mục đã ngừng ({soNgung})
            </label>
          )}
          <select value={fst} onChange={(e) => setFst(e.target.value)} aria-label="Lọc theo trạng thái" style={{ ...INP, cursor: "pointer", maxWidth: 200 }}>
            <option value="all">Tất cả trạng thái</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {/* Cần bạn điền — đúng 4 lỗi mà kiểm tra dữ liệu ở Supabase đang báo.
            Không có thanh này thì phải dò tay 461 dòng mới tìm ra chỗ thiếu. */}
        <div style={{ marginTop: 14, paddingTop: 13, borderTop: `1px solid ${C.pinkMist}` }}>
          <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 800, marginBottom: 8 }}>
            CẦN XỬ LÝ
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setFix("all")}
              style={{ padding: "8px 14px", borderRadius: 999, border: "none", cursor: "pointer",
                       fontFamily: TEXT, fontSize: 12, fontWeight: 800,
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
                           fontFamily: TEXT, fontSize: 12, fontWeight: 800, border: "none",
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
          <button onClick={() => setStageF("all")} style={{ textAlign: "left", border: "none", cursor: "pointer", padding: "14px 16px", borderRadius: 14, background: C.surface, boxShadow: stageF === "all" ? `0 0 0 3px ${C.pink}` : `inset 0 0 0 1px ${C.pinkSoft}` }}>
            <div style={{ fontFamily: NUM, fontSize: 28, fontWeight: 800, color: C.plum }}>{stageCount.all}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.plumSoft, marginTop: 2 }}>Tất cả</div>
          </button>
          {STAGES.map((s) => { const n = stageCount[s.id] || 0; const on = stageF === s.id; return (
            <button key={s.id} onClick={() => setStageF(on ? "all" : s.id)} disabled={n === 0 && !on}
              title={n === 0 ? `Không có hạng mục nào đang ở "${s.label}" với bộ lọc hiện tại.` : `${n} hạng mục · bấm để lọc`}
              style={{ textAlign: "left", border: "none", cursor: n === 0 && !on ? "default" : "pointer", padding: "14px 16px", borderRadius: 14, background: s.bg, boxShadow: on ? `0 0 0 3px ${s.color}` : "none", opacity: n === 0 ? 0.55 : 1 }}>
              <div style={{ fontFamily: NUM, fontSize: 28, fontWeight: 800, color: s.color }}>{n}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: s.color, marginTop: 2, lineHeight: 1.3 }}>{s.label}</div>
            </button>
          ); })}
        </div>
      </Card>
      <Card style={{ padding: 0, overflow: "hidden" }} cls="vmp-chi-desktop">
        <div className="vmp-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: TEXT, minWidth: 720 }}>
            <thead><tr style={{ background: C.pinkMist }}>
              {["Mã", "Tên", "Loại", "QA", "Deadline", "Giai đoạn", "Trạng thái", ""].map((h, i) => <th key={i} style={{ textAlign: i > 4 ? "center" : "left", padding: "13px 16px", fontSize: 12, fontWeight: 800, color: C.plumSoft, whiteSpace: "nowrap" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {lat.map((a, i) => { const sg = STAGES.find((s) => s.id === stageByItem.get(a.id)); const itemState = a.state || (a._raw && a._raw.state) || "active"; const isFrozen = itemState !== "active"; return (
                <tr key={a.id} style={{ borderTop: `1px solid ${C.pinkSoft}`, background: i % 2 ? C.surfaceSunk : "transparent", opacity: isFrozen ? 0.6 : 1 }}>
                  <td style={{ padding: "12px 16px", fontWeight: 800, color: C.plum, fontSize: 14 }}>{a.code}</td>
                  <td style={{ padding: "12px 16px", color: C.plum, fontSize: 14 }}>
                    {a.name}
                    {/* S3-G: badge Không áp dụng / Đã hủy */}
                    {isFrozen && <div style={{ marginTop: 4 }}><StateBadge state={String(itemState)} small /></div>}
                  </td>
                  <td style={{ padding: "12px 16px" }}><Tag color={C.lavText} bg={C.lavSoft}>{a.vtype}</Tag></td>
                  <td style={{ padding: "12px 16px", color: C.plumSoft, fontSize: 14, fontWeight: 600 }}>{nguoiPhuTrach(a.owner)}</td>
                  <td style={{ padding: "12px 16px", color: C.plumSoft, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>{a.target ? a.target.split("-").reverse().join("/") : "—"}</td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>{sg && <Tag color={sg.color} bg={sg.bg}>{sg.label}</Tag>}</td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}><Pill s={a.st} small /></td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      {/* Đường tắt: mở hộp đã điền sẵn "hôm nay + Hoàn thành" cho bước
                          hiện tại — vẫn phải chọn lý do và Lưu nên không đi tắt luật GMP. */}
                      {!readOnly && !isFrozen && stageByItem.get(a.id) !== "done" && (
                        <button onClick={() => { setEdit(a); setQuick(true); }}
                          title="Đánh dấu xong bước hiện tại hôm nay — hộp điền sẵn, chỉ cần chọn lý do rồi Lưu"
                          style={{ padding: "7px 11px", borderRadius: 8, border: `1px solid ${C.mint}`, background: C.mintSoft, color: C.mintText, fontFamily: TEXT, fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
                          ✓ Xong bước
                        </button>
                      )}
                      <button onClick={() => { if (!readOnly) { setEdit(a); setQuick(false); } }}
                        disabled={readOnly || (isFrozen && !isAdmin)}
                        title={readOnly ? "Đang ở chế độ chỉ đọc" : "Cập nhật tiến độ"}
                        style={{ ...btnPrimary, padding: "7px 14px", borderRadius: 8, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, opacity: readOnly ? 0.55 : 1, cursor: readOnly ? "not-allowed" : "pointer" }}><Pencil size={13} /> {readOnly ? "Chỉ đọc" : (isFrozen ? "Xem/khôi phục" : "Cập nhật")}</button>
                    </div>
                  </td>
                </tr>
              ); })}
              {list.length > 0 && (
                <tr><td colSpan={8} style={{ padding: "4px 8px" }}>
                  <PhanTrang tong={list.length} trang={trang} setTrang={setTrang}
                    coTrang={coTrang} setCoTrang={setCoTrang} donVi="hạng mục" />
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
                        {fix !== "all" && <Tag color={C.marigoldText} bg={C.marigoldSoft}>Cần xử lý: {FIXES[fix as keyof typeof FIXES].label}</Tag>}
                        {fst !== "all" && <Tag color={C.lavText} bg={C.lavSoft}>Trạng thái: {(STATUS as Record<string, { label: string }>)[fst]?.label ?? fst}</Tag>}
                        {!!q.trim() && <Tag color={C.lavText} bg={C.lavSoft}>Tìm: “{q.trim()}”</Tag>}
                      </div>
                      <button onClick={clearFilters} style={{ ...btnPrimary, padding: "8px 16px", borderRadius: 8, fontSize: 12 }}>Xoá hết bộ lọc</button>
                    </>
                  ) : "Chưa có hạng mục nào trong kế hoạch."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ---- Bản điện thoại ----------------------------------------------
          Cùng mảng `lat`, cùng bộ lọc, cùng hành động — chỉ đổi cách trình
          bày (spec §5.5). Trước đây điện thoại phải kéo ngang một bảng rộng
          720px chỉ để sửa một dòng; nay mỗi hạng mục là một thẻ đứng.
          CSS cho hai bản loại trừ nhau bằng display:none nên chỉ một bản
          nằm trong cây trợ năng ở mỗi khổ màn. */}
      <MobileTaskList
        label="Hạng mục thẩm định"
        rows={lat}
        rowKey={(a) => a.id}
        empty={hasFilter ? "Không có hạng mục nào khớp bộ lọc đang bật." : "Chưa có hạng mục nào trong kế hoạch."}
        renderItem={(a) => {
          const sg = STAGES.find((s) => s.id === stageByItem.get(a.id));
          const itemState = a.state || (a._raw && a._raw.state) || "active";
          const isFrozen = itemState !== "active";
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: isFrozen ? 0.65 : 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <b style={{ fontFamily: NUM, fontSize: 13, color: C.pinkText, letterSpacing: ".02em" }}>{a.code}</b>
                <Pill s={a.st} small />
              </div>

              {/* Không lặp lại mã khi hạng mục chưa có tên riêng — in cùng
                  một chuỗi hai lần liền nhau chỉ làm thẻ dài ra vô ích. */}
              {a.name && a.name !== a.code && (
                <div style={{ fontSize: 15, fontWeight: 700, color: C.plum, lineHeight: 1.4 }}>{a.name}</div>
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <Tag color={C.lavText} bg={C.lavSoft}>{a.vtype}</Tag>
                {sg && <Tag color={sg.color} bg={sg.bg}>{sg.label}</Tag>}
                {isFrozen && <StateBadge state={String(itemState)} small />}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 13, color: C.plumSoft, fontWeight: 600 }}>
                <span>Hạn: <b style={{ color: C.plum, fontFamily: NUM }}>{a.target ? a.target.split("-").reverse().join("/") : "—"}</b></span>
                <span>QA: <b style={{ color: C.plum }}>{nguoiPhuTrach(a.owner) || "—"}</b></span>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {!readOnly && !isFrozen && stageByItem.get(a.id) !== "done" && (
                  <button onClick={() => { setEdit(a); setQuick(true); }}
                    style={{ flex: "1 1 auto", minHeight: 44, borderRadius: 10, border: `1px solid ${C.mint}`,
                             background: C.mintSoft, color: C.mintText, fontFamily: TEXT, fontSize: 13,
                             fontWeight: 700, cursor: "pointer" }}>
                    ✓ Xong bước
                  </button>
                )}
                <button onClick={() => { if (!readOnly) { setEdit(a); setQuick(false); } }}
                  disabled={readOnly || (isFrozen && !isAdmin)}
                  style={{ ...btnPrimary, flex: "1 1 auto", minHeight: 44, fontSize: 13,
                           display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                           opacity: readOnly ? 0.55 : 1, cursor: readOnly ? "not-allowed" : "pointer" }}>
                  <Pencil size={14} /> {readOnly ? "Chỉ đọc" : (isFrozen ? "Xem/khôi phục" : "Cập nhật")}
                </button>
              </div>
            </div>
          );
        }}
      />

      {/* Phân trang dùng chung cho cả hai bản trình bày. */}
      {list.length > 0 && (
        <div className="vmp-chi-mobile">
          <PhanTrang tong={list.length} trang={trang} setTrang={setTrang}
            coTrang={coTrang} setCoTrang={setCoTrang} donVi="hạng mục" />
        </div>
      )}

      <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, padding: "0 4px", lineHeight: 1.6 }}>
        <b style={{ color: C.mintText }}>Supabase là nơi lưu dữ liệu gốc</b> (từ 29/07/2026).
        Sửa ngày, trạng thái và danh mục ngay trên web — Google Sheet nay chỉ là bản tham chiếu
        chỉ đọc, sửa trên đó sẽ không vào hệ thống.
      </div>
      {edit && !readOnly && <ProgressEditModal
        key={edit.id}
        act={edit}
        isAdmin={isAdmin}
        quickDone={quick}
        onClose={() => { setEdit(null); setQuick(false); }}
        onReload={onReload}
        // Hạng mục kế tiếp TRONG danh sách đang lọc — nhập hàng loạt không phải
        // đóng hộp rồi dò lại bảng. Bỏ qua hạng mục đóng băng nếu không phải admin.
        nextAct={(() => {
          const i = list.findIndex((a) => a.id === edit.id);
          if (i < 0) return null;
          return list.slice(i + 1).find((a) => isAdmin || (a.state || a._raw?.state || "active") === "active") || null;
        })()}
        onOpenNext={(a) => { setEdit(a); setQuick(false); }}
        onSave={onUpdate ?? (() => { /* chưa nối hàm cập nhật */ })}
        onChangeState={async (id, newState, reason) => {
          // S3-G: gọi RPC rpc_set_item_state (010) — lý do nhập ngay trong hộp
          // (trước đây dùng window.prompt, dễ bấm nhầm Cancel là mất).
          if (!supabase) { alert("Supabase chưa cấu hình."); return; }
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
            setEdit(null); setQuick(false);
            if (onReload) onReload();   // (MỚI) tải lại ngay để badge + đếm KPI cập nhật tức thì
          } catch (e) {
            alert("Lỗi đổi trạng thái: " + ((e as Error).message || "không rõ"));
          }
        }}
      />}
    </div>
  );
}

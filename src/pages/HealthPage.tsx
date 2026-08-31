/* =====================================================================
 *  HealthPage — màn "Chất lượng dữ liệu": tab kiểm client + tab server
 *  (F1 31/08: tách từ App.tsx, nạp lazy.)
 * ===================================================================== */
import { useState, useEffect, useMemo } from "react";
import { Radar, Search, ChevronRight, FileText } from "lucide-react";
import { C, TEXT, NUM } from "../constants/theme.ts";
import { LOAI_LOI, sevOf } from "../constants/vmp.ts";
import { runDataQualityChecks } from "../utils/helpers.ts";
import { useDebounce } from "../hooks/index.ts";
import { Card, CardTitle, Tag, KpiCard, CauKetLuan } from "../components/ui/Primitives.tsx";
import NhomTab, { NhomTabPanel, useNhomTab } from "../components/ui/NhomTab.tsx";
import { soSanhDoiChieu, ketLuanDoiChieu } from "../features/health/doiChieuModel.ts";
import { fetchDashboardKpi, checkDataQuality } from "../lib/supabaseData.ts";
import type { ServerKpi } from "../lib/supabaseData.ts";
import { tally, docTally } from "../utils/helpers.ts";
import { RefreshCw } from "lucide-react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient.ts";
import type { Activity } from "../types/domain.ts";
import type { AccessContext } from "../lib/access.ts";
import ServerChecksView from "./ServerChecksPage.tsx";
import { formatBangkokDate, formatBangkokDateTime } from "../lib/formatBangkok.ts";

export default function HealthView({ acts, access }: { acts: Activity[]; access?: AccessContext | null }) {
  /* Bàn quản trị (spec 01/09): tab ĐỐI CHIẾU là mặc định — trả lời thẳng
     "số trên máy tôi có nói dối không", thay vì bắt người vận hành mở hai
     tab rồi tự so bằng mắt. Hai tab chi tiết giữ nguyên ruột. */
  const [tab, setTab] = useNhomTab("health", "doi-chieu", ["doi-chieu", "client", "server"]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <NhomTab man="health" nhan="Chọn nguồn kiểm tra" tab={tab} onTab={setTab} tabs={[
        { id: "doi-chieu", nhan: "Đối chiếu client ↔ máy chủ" },
        { id: "client", nhan: "Lỗi trên bản đang xem" },
        { id: "server", nhan: "Kiểm tra trên máy chủ" },
      ]} />
      <NhomTabPanel man="health" id="doi-chieu" tab={tab}>
        <DoiChieuView acts={acts} />
      </NhomTabPanel>
      <NhomTabPanel man="health" id="client" tab={tab}>
        <DataQualityView acts={acts} />
      </NhomTabPanel>
      <NhomTabPanel man="health" id="server" tab={tab}>
        <ServerChecksView access={access} />
      </NhomTabPanel>
    </div>
  );
}

/* ---------------------------------------------------------------------
 * DoiChieuView — từng cặp số client/server cạnh nhau, CHỈ tô dòng lệch.
 * Client tính trên `acts` đang nhận (đã qua bộ lọc toàn cục); dòng chú
 * thích nói rõ điều đó — lệch do bộ lọc là lệch THẬT của bản đang xem.
 * ------------------------------------------------------------------- */
function DoiChieuView({ acts }: { acts: Activity[] }) {
  const [kpi, setKpi] = useState<ServerKpi | null>(null);
  const [soLoiServer, setSoLoiServer] = useState<number | null>(null);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState("");

  const tai = async () => {
    setDangTai(true); setLoi("");
    try {
      const [k, q] = await Promise.all([fetchDashboardKpi(), checkDataQuality()]);
      setKpi(k); setSoLoiServer(q.length);
    } catch (e) {
      setLoi((e as Error).message || "Không đọc được số máy chủ");
      setKpi(null); setSoLoiServer(null);
    }
    setDangTai(false);
  };
  useEffect(() => { void tai(); }, []);

  const kq = useMemo(() => {
    const e = tally(acts);
    const d = docTally(acts);
    const soLoiClient = runDataQualityChecks(acts).length;
    return soSanhDoiChieu([
      { nhan: "Hạng mục hoàn thành VMP", client: e.done, server: kpi?.validation.done ?? null },
      { nhan: "Tổng hạng mục", client: e.total, server: kpi?.validation.total ?? null },
      { nhan: "Hạng mục quá hạn", client: e.over, server: kpi?.validation.over ?? null },
      { nhan: "Hồ sơ hoàn thành", client: d.done, server: kpi?.documentation.done ?? null },
      { nhan: "Hồ sơ quá hạn", client: d.over, server: kpi?.documentation.over ?? null },
      { nhan: "Vấn đề dữ liệu (đếm)", client: soLoiClient, server: soLoiServer },
    ]);
  }, [acts, kpi, soLoiServer]);
  const kl = ketLuanDoiChieu(kq);

  return (
    <Card variant="strong">
      <CardTitle icon={Radar}
        sub="Client tính trên phạm vi ĐANG LỌC ở thanh trên; máy chủ tính cả năm — xoá bộ lọc trước khi kết luận lệch."
        right={<button type="button" onClick={() => void tai()} disabled={dangTai}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px",
                   borderRadius: 10, border: `1.5px solid ${C.pinkSoft}`, background: C.surface,
                   color: C.plum, fontFamily: TEXT, fontSize: 12, fontWeight: 700,
                   cursor: dangTai ? "wait" : "pointer" }}>
          <RefreshCw size={13} className={dangTai ? "spin" : ""} /> {dangTai ? "Đang tải…" : "Làm mới"}
        </button>}>
        Đối chiếu client ↔ máy chủ
      </CardTitle>
      {loi && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 12,
                      background: C.raspSoft, color: C.raspText, fontSize: 13, fontWeight: 700 }}>
          {loi} — cột máy chủ để trống, cột client vẫn đúng với bản đang xem.
        </div>
      )}
      <CauKetLuan chinh={kl.chinh} tone={kl.tone} />
      <table className="reg-table" style={{ width: "100%" }}>
        <caption>Từng cặp số client/máy chủ; chỉ dòng lệch được tô đỏ kèm mức chênh.</caption>
        <thead><tr>
          <th scope="col">Con số</th>
          <th scope="col" className="reg-num">Bản đang xem</th>
          <th scope="col" className="reg-num">Máy chủ</th>
          <th scope="col" className="reg-num">Chênh</th>
        </tr></thead>
        <tbody>
          {kq.rows.map((r) => (
            <tr key={r.nhan} style={r.lech ? { background: C.raspSoft } : undefined}>
              <th scope="row">{r.nhan}</th>
              <td className="reg-num">{r.client ?? "…"}</td>
              <td className="reg-num">{r.server ?? "…"}</td>
              <td className="reg-num" style={{ fontWeight: 800,
                color: r.lech ? C.raspText : C.mintText }}>
                {r.chenh === null ? "…" : r.chenh === 0 ? "khớp" : (r.chenh > 0 ? `+${r.chenh}` : String(r.chenh))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {kpi?.updated_at && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.plumSoft, fontWeight: 600 }}>
          Số máy chủ cập nhật lúc {formatBangkokDateTime(kpi.updated_at)} · muốn tính lại: tab Kiểm tra trên máy chủ → nút Tính lại trạng thái.
        </div>
      )}
    </Card>
  );
}

/* ----------------------------------------------------------------
 * Sức khoẻ dữ liệu — GOM NHÓM thay vì đổ một mạch.
 *
 * Bản cũ in thẳng từng vấn đề ra một danh sách phẳng: 43.000 ký tự,
 * hàng trăm dòng na ná nhau, cuộn mãi không hết và không ai biết bắt
 * đầu từ đâu. Cùng một lỗi lặp 281 lần vẫn chiếm 281 dòng.
 *
 * Nay mỗi LOẠI lỗi là một nhóm gập được: tiêu đề nói rõ lỗi gì, bao
 * nhiêu hạng mục, sửa ở đâu. Mở ra mới dựng danh sách bên trong, và
 * cũng chỉ dựng 20 dòng đầu — trang nhẹ hẳn.
 * -------------------------------------------------------------- */

// LOAI_LOI, SEV, sevOf: chuyển sang constants/vmp.ts (2026-07-30) để ReportsView
// dùng chung, không copy lại nhãn lỗi.

function DataQualityView({ acts }: { acts: Activity[] }) {
  const issues = useMemo(() => runDataQualityChecks(acts), [acts]);
  /** Một vấn đề chất lượng dữ liệu, từ bảng data_quality_issues hoặc kiểm tra tại client. */
  interface QualityIssue {
    issue_type: string;
    severity: string;
    field_name?: string | null;
    message: string;
    detected_at?: string | null;
    plan_item_id?: string | null;
    id?: string;
  }
  const [serverIssues, setServerIssues] = useState<QualityIssue[]>([]);
  const [serverErr, setServerErr] = useState("");
  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;
    supabase.from("data_quality_issues")
      .select("issue_type,severity,field_name,message,detected_at,plan_item_id")
      .eq("is_resolved", false)
      .order("detected_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => { if (error) setServerErr(error.message); else setServerIssues((data || []) as QualityIssue[]); },
            () => setServerErr("Không đọc được bảng lỗi của hệ thống"));
  }, []);

  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const kw = useDebounce(q.trim().toLowerCase(), 250);
  const [mo, setMo] = useState<Record<string, boolean>>({});
  const [hien, setHien] = useState<Record<string, number>>({});

  const sevCount: Record<string, number> = { error: 0, warning: 0, info: 0 };
  issues.forEach((i) => { sevCount[i.severity] = (sevCount[i.severity] || 0) + 1; });

  // Gom theo LOẠI lỗi, xếp lỗi nặng trước, cùng mức thì nhiều hạng mục trước.
  const nhom = useMemo(() => {
    const m = new Map<string, { type: string; severity: string; ds: typeof issues }>();
    for (const it of issues) {
      if (filter !== "all" && it.severity !== filter) continue;
      if (kw && !(`${it.id} ${it.msg}`.toLowerCase().includes(kw))) continue;
      const k = it.type;
      if (!m.has(k)) m.set(k, { type: k, severity: it.severity, ds: [] });
      m.get(k)!.ds.push(it);
    }
    return [...m.values()].sort((a, b) =>
      sevOf(a.severity).uu_tien - sevOf(b.severity).uu_tien || b.ds.length - a.ds.length);
  }, [issues, filter, kw]);

  const tongHienThi = nhom.reduce((n, g) => n + g.ds.length, 0);

  // Lỗi từ máy chủ cũng gom theo loại — cùng lý do.
  const nhomServer = useMemo(() => {
    const m = new Map<string, QualityIssue[]>();
    for (const it of serverIssues) {
      const k = it.issue_type || "khác";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [serverIssues]);

  const nutNho = { fontFamily: TEXT, fontSize: 12, fontWeight: 700, color: C.plum,
                   border: `1.5px solid ${C.pinkSoft}`, background: C.surface,
                   borderRadius: 999, padding: "7px 13px", cursor: "pointer" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }}>
        {[
          { id: "error", emoji: "🚫", bg: C.raspSoft, color: C.raspText, v: sevCount.error, l: "Lỗi nghiêm trọng" },
          { id: "warning", emoji: "⚠️", bg: C.marigoldSoft, color: C.marigoldText, v: sevCount.warning, l: "Cảnh báo" },
          { id: "info", emoji: "ℹ️", bg: C.skySoft, color: C.skyText, v: sevCount.info, l: "Thông tin" },
        ].map((c) => (
          <KpiCard key={c.id} emoji={c.emoji} bg={c.bg} color={c.color} value={c.v} label={c.l}
            onClick={() => setFilter(filter === c.id ? "all" : c.id)} pressed={filter === c.id}
            sub={filter === c.id ? "● Đang lọc" : "Bấm để lọc"} subColor={c.color} />
        ))}
      </div>

      <Card variant="strong">
        <CardTitle icon={Radar}
          sub={`${nhom.length} loại vấn đề · ${tongHienThi} hạng mục · gom theo loại để sửa một thể`}>
          Kiểm tra chất lượng dữ liệu
        </CardTitle>

        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1.5px solid ${C.pinkSoft}`, background: C.surface, borderRadius: 999, padding: "7px 13px" }}>
            <Search size={14} color={C.plumSoft} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm mã hạng mục hoặc nội dung lỗi…"
              style={{ border: "none", outline: "none", background: "transparent", fontFamily: TEXT, fontSize: 12, fontWeight: 600, color: C.plum, width: 230 }} />
          </label>
          {nhom.length > 0 && (
            <>
              <button type="button" style={nutNho}
                onClick={() => setMo(Object.fromEntries(nhom.map((g) => [g.type, true])))}>Mở hết</button>
              <button type="button" style={nutNho}
                onClick={() => setMo({})}>Gập hết</button>
            </>
          )}
          {(filter !== "all" || kw) && (
            <button type="button" style={{ ...nutNho, color: C.raspText, borderColor: C.raspSoft, marginLeft: "auto" }}
              onClick={() => { setFilter("all"); setQ(""); }}>Xoá lọc</button>
          )}
        </div>

        {nhom.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: C.mintText, fontWeight: 700 }}>
            {issues.length === 0 ? "Không phát hiện vấn đề dữ liệu nào." : "Không có vấn đề nào khớp bộ lọc."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {nhom.map((g) => {
              const sv = sevOf(g.severity);
              const meta = LOAI_LOI[g.type] || { ten: g.type, sua: "" };
              const dangMo = !!mo[g.type];
              const soHien = hien[g.type] || 20;
              return (
                <div key={g.type} style={{ border: `1px solid ${sv.nen}`, borderRadius: 14, overflow: "hidden", background: C.surface }}>
                  <button onClick={() => setMo((p) => ({ ...p, [g.type]: !p[g.type] }))}
                    style={{ width: "100%", textAlign: "left", border: "none", background: dangMo ? sv.nen : C.surface,
                             cursor: "pointer", padding: "13px 15px", display: "flex", alignItems: "center", gap: 12 }}>
                    <ChevronRight size={17} color={sv.mau} style={{ transform: dangMo ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
                    <span style={{ fontSize: 16 }}>{sv.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: TEXT, fontSize: 14, fontWeight: 800, color: C.plum }}>{meta.ten}</div>
                      {meta.sua && <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 2 }}>{meta.sua}</div>}
                    </div>
                    <Tag color={sv.mau} bg={sv.nen}>{g.ds.length} hạng mục</Tag>
                  </button>

                  {dangMo && (() => {
                    // Nếu cả nhóm cùng một câu mô tả thì đừng lặp lại 85 lần —
                    // tiêu đề nhóm đã nói rồi. Chỉ liệt kê mã cho dễ quét mắt.
                    const giongNhau = new Set(g.ds.map((x) => x.msg)).size === 1;
                    return (
                      <div style={{ padding: "8px 15px 14px" }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                          <button style={{ ...nutNho, fontSize: 12 }}
                            onClick={() => navigator.clipboard?.writeText(g.ds.map((x) => x.id).join("\n"))}>
                            Sao chép {g.ds.length} mã
                          </button>
                          <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600 }}>
                            dán vào ô tìm ở Cập nhật tiến độ để xử lý từng mã
                          </span>
                        </div>
                        {giongNhau ? (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {g.ds.slice(0, soHien).map((it, i) => (
                              <span key={i} style={{ fontFamily: NUM, fontSize: 12, fontWeight: 800, color: sv.mau,
                                                     background: sv.nen, borderRadius: 8, padding: "4px 9px" }}>{it.id}</span>
                            ))}
                          </div>
                        ) : (
                          /* Gộp các dòng CÙNG MỘT CÂU. Trước đây "Lương Minh
                             Hằng chưa có email" lặp y nguyên 8 lần trong một
                             danh sách 64 vấn đề — đọc 8 lần vẫn chỉ là một
                             việc phải làm: điền một địa chỉ email. */
                          (() => {
                            const theoCau = new Map<string, string[]>();
                            for (const it of g.ds) {
                              if (!theoCau.has(it.msg)) theoCau.set(it.msg, []);
                              theoCau.get(it.msg)!.push(String(it.id));
                            }
                            const dong = [...theoCau.entries()].sort((a, b) => b[1].length - a[1].length);
                            return (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {dong.slice(0, soHien).map(([cau, ids], i) => (
                                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 12, padding: "6px 0", borderTop: i ? `1px solid ${C.pinkMist}` : "none", flexWrap: "wrap" }}>
                                    <span style={{ fontFamily: NUM, fontWeight: 800, color: sv.mau, minWidth: 165 }}>
                                      {ids.length > 1 ? `${ids.length} hạng mục` : ids[0]}
                                    </span>
                                    <span style={{ color: C.plumSoft, fontWeight: 600, flex: 1, minWidth: 200 }}>{cau}</span>
                                    {ids.length > 1 && (
                                      <span title={ids.join("\n")}
                                        style={{ fontFamily: NUM, fontSize: 12, fontWeight: 700, color: C.plumSoft, opacity: .8 }}>
                                        {ids.slice(0, 3).join(", ")}{ids.length > 3 ? `… (+${ids.length - 3})` : ""}
                                      </span>
                                    )}
                                  </div>
                                ))}
                                {dong.length > soHien && (
                                  <button onClick={() => setHien((p) => ({ ...p, [g.type]: soHien + 50 }))}
                                    style={{ ...nutNho, marginTop: 6, alignSelf: "flex-start" }}>
                                    Hiện thêm — đang xem {soHien}/{dong.length} loại
                                  </button>
                                )}
                              </div>
                            );
                          })()
                        )}
                        {giongNhau && g.ds.length > soHien && (
                          <button onClick={() => setHien((p) => ({ ...p, [g.type]: soHien + 50 }))}
                            style={{ ...nutNho, marginTop: 10 }}>
                            Hiện thêm — đang xem {soHien}/{g.ds.length}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card variant="soft">
        <CardTitle icon={Radar}
          sub="Do trigger database và đồng bộ n8n ghi lại (chưa xử lý) — nguồn chính thức, web không tự tính lại">
          Lỗi / xung đột ghi nhận từ hệ thống (Supabase)
        </CardTitle>
        {serverErr ? (
          <div style={{ padding: 16, color: C.raspText, fontWeight: 700, fontSize: 14 }}>
            Không đọc được: {serverErr}
          </div>
        ) : nhomServer.length === 0 ? (
          <div style={{ textAlign: "center", padding: 26, color: C.mintText, fontWeight: 700 }}>
            Hệ thống chưa ghi nhận lỗi nào chưa xử lý.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {nhomServer.map(([loai, ds]) => {
              const nang = ds.some((x) => x.severity === "error");
              const key = "sv:" + loai;
              const dangMo = !!mo[key];
              return (
                <div key={loai} style={{ border: `1px solid ${nang ? C.raspSoft : C.marigoldSoft}`, borderRadius: 14, background: C.surface }}>
                  <button onClick={() => setMo((p) => ({ ...p, [key]: !p[key] }))}
                    style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", cursor: "pointer", padding: "11px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                    <ChevronRight size={16} color={C.plumSoft} style={{ transform: dangMo ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                    <span style={{ fontSize: 16 }}>{nang ? "🚫" : "⚠️"}</span>
                    <span style={{ flex: 1, fontFamily: TEXT, fontSize: 14, fontWeight: 800, color: C.plum }}>{loai}</span>
                    <Tag color={nang ? C.raspText : C.marigoldText} bg={nang ? C.raspSoft : C.marigoldSoft}>{ds.length}</Tag>
                  </button>
                  {dangMo && (
                    <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                      {ds.slice(0, 30).map((it, i) => (
                        <div key={i} style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, paddingTop: 6, borderTop: i ? `1px solid ${C.pinkMist}` : "none" }}>
                          <b style={{ color: C.plum }}>{it.plan_item_id || "—"}</b> · {it.message}
                          {it.detected_at ? ` · ${formatBangkokDate(it.detected_at)}` : ""}
                        </div>
                      ))}
                      {ds.length > 30 && <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700, paddingTop: 6 }}>… và {ds.length - 30} bản ghi nữa</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ===================== Mismatch Page (NEW) ===================== */
/** Giữ lại bản cũ để đối chiếu — hiện chưa gắn vào router. */
export function MismatchView({ acts }: { acts: Activity[] }) {
  const mismatched = acts.filter(a => a.mismatch);
  const valDoneDocPend = mismatched.filter(a => a.mismatch === "val_done_doc_pending");
  const docDoneValPend = mismatched.filter(a => a.mismatch === "doc_done_val_pending");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <KpiCard emoji="📋" bg={C.marigoldSoft} color={C.marigoldText}
          value={valDoneDocPend.length} label="Thẩm định xong · Hồ sơ chưa"
          sub="Cần hoàn thiện hồ sơ" />
        <KpiCard emoji="📝" bg={C.lavSoft} color={C.lavText}
          value={docDoneValPend.length} label="Hồ sơ xong · Thẩm định chưa"
          sub="Cần xác nhận thẩm định" />
      </div>

      {[
        { title: "Thẩm định xong nhưng hồ sơ chưa hoàn thiện", items: valDoneDocPend, type: "val_done_doc_pending" },
        { title: "Hồ sơ xong nhưng thẩm định chưa hoàn thành", items: docDoneValPend, type: "doc_done_val_pending" },
      ].map(group => group.items.length > 0 && (
        <Card key={group.type} variant="strong">
          <CardTitle icon={FileText} sub={`${group.items.length} hạng mục lệch pha`}>
            {group.title}
          </CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {group.items.map(a => (
              <div key={a.id} className="vmp-row vmp-lift" style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px", borderRadius: 14, background: C.surface,
                border: `1px solid ${C.marigoldSoft}`,
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                  background: C.marigoldSoft, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 20,
                }}>
                  📋
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: C.plum }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600 }}>
                    {a.id} · {a.vtype} · QA: {a.owner} · Deadline: {a.target || "—"}
                  </div>
                </div>
                <Tag color={C.marigoldText} bg={C.marigoldSoft}>Lệch pha</Tag>
              </div>
            ))}
          </div>
        </Card>
      ))}

      {mismatched.length === 0 && (
        <Card>
          <div style={{ textAlign: "center", padding: 40, color: C.mintText, fontWeight: 700 }}>
            Không có hạng mục lệch pha. Tiến độ thẩm định và hồ sơ đang đồng bộ tốt.
          </div>
        </Card>
      )}
    </div>
  );
}

/* ===================== Audit Log Page (NEW) ===================== */

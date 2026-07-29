/* =====================================================================
 *  ServerChecksPage.tsx — Số liệu và kiểm tra tính SẴN Ở SERVER
 *  ---------------------------------------------------------------------
 *  Trước màn này, web tự tính lại KPI và kiểm tra chất lượng dữ liệu ở
 *  client, còn các hàm tương ứng trong Supabase thì bỏ không dùng. Hệ quả:
 *  số trên dashboard có thể lệch số mà workflow n8n và báo cáo dùng.
 *
 *  Màn này gọi thẳng các RPC đó nên số liệu ở đây là NGUỒN ĐỐI CHIẾU:
 *    · rpc_dashboard_kpi          — KPI hạng mục / hồ sơ
 *    · rpc_check_data_quality     — lỗi dữ liệu server phát hiện
 *    · rpc_due_alerts             — ĐÚNG danh sách workflow cảnh báo sẽ gửi
 *    · rpc_refresh_computed_status— tính lại computed_status theo hôm nay
 * ===================================================================== */
import { useState, useEffect, useMemo } from "react";
import {
  Radar, RefreshCw, AlertTriangle, CheckCircle2, Bell, Gauge, PlayCircle,
} from "lucide-react";
import { C, TEXT, NUM, btnPrimary } from "../constants/theme.ts";
import { Card, CardTitle, Tag, KpiCard, TableScroll } from "../components/ui/Primitives.tsx";
import {
  fetchDashboardKpi, checkDataQuality, fetchDueAlerts, refreshComputedStatus,
} from "../lib/supabaseData.ts";
import type {
  ServerKpi, ServerQualityIssue, DueAlert,
} from "../lib/supabaseData.ts";
import type { AppUser } from "../types/domain.ts";

const SEV_TONE: Record<string, { c: string; bg: string }> = {
  error:   { c: C.raspText,     bg: C.raspSoft },
  warning: { c: C.marigoldText, bg: C.marigoldSoft },
  info:    { c: C.skyText,      bg: C.skySoft },
};

export default function ServerChecksView({ user }: { user?: AppUser | null }) {
  const canRun = user?.perm === "admin";
  const year = new Date().getFullYear();

  const [kpi, setKpi] = useState<ServerKpi | null>(null);
  const [issues, setIssues] = useState<ServerQualityIssue[]>([]);
  const [alerts, setAlerts] = useState<DueAlert[]>([]);
  const [soonDays, setSoonDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sevFilter, setSevFilter] = useState("all");

  const load = async () => {
    setLoading(true); setErr("");
    try {
      const [k, q, a] = await Promise.all([
        fetchDashboardKpi(year),
        checkDataQuality(year),
        fetchDueAlerts(year, soonDays),
      ]);
      setKpi(k); setIssues(q); setAlerts(a);
    } catch (e) {
      setErr((e as Error).message || "Lỗi tải dữ liệu từ server");
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [soonDays]);

  const sevCount = useMemo(() => {
    const m: Record<string, number> = { error: 0, warning: 0, info: 0 };
    issues.forEach((i) => { m[i.severity] = (m[i.severity] || 0) + 1; });
    return m;
  }, [issues]);

  const shownIssues = sevFilter === "all"
    ? issues
    : issues.filter((i) => i.severity === sevFilter);

  const overdue = alerts.filter((a) => a.alert_type === "overdue");
  const dueSoon = alerts.filter((a) => a.alert_type === "due_soon");

  const runRefresh = async () => {
    if (!window.confirm(
      "Tính lại computed_status cho toàn bộ hạng mục theo ngày hôm nay?\n"
      + "Thao tác này ghi vào DB và được ghi vết trong audit log.")) return;
    setBusy(true);
    try {
      const r = await refreshComputedStatus();
      alert(r.msg || "Đã tính lại trạng thái");
      await load();
    } catch (e) {
      alert("Lỗi: " + ((e as Error).message || "không rõ"));
    }
    setBusy(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ---------- KPI theo server ---------- */}
      <Card variant="strong">
        <CardTitle icon={Gauge}
          sub="Tính bằng rpc_dashboard_kpi — đây là số mà báo cáo và workflow dùng, dùng để đối chiếu với số trên dashboard">
          Số liệu theo server {kpi?.updated_at ? `· cập nhật ${new Date(kpi.updated_at).toLocaleString("vi-VN")}` : ""}
        </CardTitle>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <button onClick={load} disabled={loading}
            style={{ ...btnPrimary, background: C.surface, color: C.plum,
                     border: `1.5px solid ${C.pinkSoft}`, opacity: loading ? 0.6 : 1 }}>
            <RefreshCw size={15} /> {loading ? "Đang tải…" : "Tải lại"}
          </button>
          {canRun && (
            <button onClick={runRefresh} disabled={busy}
              style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>
              <PlayCircle size={15} /> {busy ? "Đang chạy…" : "Tính lại trạng thái"}
            </button>
          )}
        </div>

        {err && (
          <div style={{ padding: 10, borderRadius: 10, background: C.raspSoft,
                        color: C.raspText, fontSize: 13, marginBottom: 12 }}>{err}</div>
        )}

        {kpi && (
          <div style={{ display: "grid", gap: 12,
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <KpiCard emoji="📋" bg={C.mintSoft} color={C.mintText}
              value={`${kpi.validation.done}/${kpi.validation.total}`}
              label="Hạng mục hoàn thành"
              sub={`${Math.round((kpi.validation.done / Math.max(1, kpi.validation.total)) * 100)}%`}
              subColor={C.mintText} />
            <KpiCard emoji="⏰" bg={C.raspSoft} color={C.raspText}
              value={kpi.validation.over} label="Hạng mục quá hạn"
              sub={`${kpi.validation.todo} chưa làm`} subColor={C.plumSoft} />
            <KpiCard emoji="📄" bg={C.skySoft} color={C.skyText}
              value={`${kpi.documentation.done}/${kpi.documentation.total}`}
              label="Hồ sơ hoàn thành"
              sub={`${kpi.documentation.over} quá hạn`} subColor={C.raspText} />
            <KpiCard emoji="⚠️" bg={C.marigoldSoft} color={C.marigoldText}
              value={kpi.mismatch_count} label="Bản ghi lệch trạng thái"
              sub="cần rà lại" subColor={C.plumSoft} />
          </div>
        )}
      </Card>

      {/* ---------- Cảnh báo sẽ gửi ---------- */}
      <Card>
        <CardTitle icon={Bell}
          sub="rpc_due_alerts — ĐÚNG danh sách mà workflow 'Vani VMP 1' dùng để soạn email. Xem trước ở đây trước khi bật workflow.">
          Cảnh báo server sẽ gửi ({alerts.length})
        </CardTitle>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: C.plum, fontFamily: TEXT }}>
            Ngưỡng "sắp đến hạn"
          </span>
          {[3, 7, 14, 30].map((d) => (
            <button key={d} onClick={() => setSoonDays(d)}
              style={{ padding: "6px 13px", borderRadius: 999, cursor: "pointer",
                       fontFamily: TEXT, fontSize: 12.5, fontWeight: soonDays === d ? 800 : 600,
                       border: `1.5px solid ${soonDays === d ? C.pink : C.pinkSoft}`,
                       background: soonDays === d ? C.pinkSoft : C.surface,
                       color: soonDays === d ? C.plum : C.plumSoft }}>
              {d} ngày
            </button>
          ))}
          <Tag color={C.raspText} bg={C.raspSoft}>{overdue.length} quá hạn</Tag>
          <Tag color={C.marigoldText} bg={C.marigoldSoft}>{dueSoon.length} sắp đến hạn</Tag>
        </div>

        <TableScroll maxHeight="46vh">
          <table style={{ width: "100%", fontFamily: TEXT, fontSize: 12.5 }}>
            <thead>
              <tr>
                {["Loại", "Mã thẩm định", "Đối tượng", "Bộ phận", "Giai đoạn", "Hạn", "Còn/Trễ", "Phụ trách"]
                  .map((h, i) => (
                    <th key={h} className={i === 1 ? "vmp-col-pin" : undefined}
                        style={{ textAlign: "left", padding: "9px 8px", whiteSpace: "nowrap",
                                 color: C.plum, fontWeight: 800 }}>{h}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => {
                const over = a.alert_type === "overdue";
                return (
                  <tr key={`${a.validation_code}-${a.stage}`} style={{ borderBottom: `1px solid ${C.pinkMist}` }}>
                    <td style={{ padding: "8px" }}>
                      <Tag color={over ? C.raspText : C.marigoldText}
                           bg={over ? C.raspSoft : C.marigoldSoft}>
                        {over ? "quá hạn" : "sắp tới"}
                      </Tag>
                    </td>
                    <td className="vmp-col-pin"
                        style={{ padding: "8px", fontWeight: 700, color: C.plum, whiteSpace: "nowrap" }}>
                      {a.validation_code}
                    </td>
                    <td style={{ padding: "8px", color: C.plumSoft }}>{a.object_name || a.object_code}</td>
                    <td style={{ padding: "8px", color: C.plumSoft }}>{a.department || "—"}</td>
                    <td style={{ padding: "8px", color: C.plumSoft, whiteSpace: "nowrap" }}>{a.stage}</td>
                    <td style={{ padding: "8px", color: C.plumSoft, whiteSpace: "nowrap" }}>{a.due_date}</td>
                    <td style={{ padding: "8px", fontFamily: NUM, fontWeight: 800,
                                 color: over ? C.raspText : C.marigoldText, whiteSpace: "nowrap" }}>
                      {over ? `trễ ${Math.abs(a.days_left)}` : `còn ${a.days_left}`} ngày
                    </td>
                    <td style={{ padding: "8px", color: C.plumSoft }}>{a.owner_name || "—"}</td>
                  </tr>
                );
              })}
              {!loading && alerts.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 20, textAlign: "center", color: C.mintText }}>
                  <CheckCircle2 size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
                  Không có hạng mục nào đến hạn trong ngưỡng này.
                </td></tr>
              )}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      {/* ---------- Chất lượng dữ liệu ---------- */}
      <Card>
        <CardTitle icon={Radar}
          sub="rpc_check_data_quality — server rà trực tiếp trên DB, không phụ thuộc dữ liệu đã tải về trình duyệt">
          Chất lượng dữ liệu ({issues.length})
        </CardTitle>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {[["all", `Tất cả (${issues.length})`],
            ["error", `Lỗi (${sevCount.error})`],
            ["warning", `Cảnh báo (${sevCount.warning})`],
            ["info", `Thông tin (${sevCount.info})`]].map(([k, lb]) => (
            <button key={k} onClick={() => setSevFilter(k)}
              style={{ padding: "7px 13px", borderRadius: 999, cursor: "pointer",
                       fontFamily: TEXT, fontSize: 12.5, fontWeight: sevFilter === k ? 800 : 600,
                       border: `1.5px solid ${sevFilter === k ? C.pink : C.pinkSoft}`,
                       background: sevFilter === k ? C.pinkSoft : C.surface,
                       color: sevFilter === k ? C.plum : C.plumSoft }}>
              {lb}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8,
                      maxHeight: "45vh", overflowY: "auto" }} className="vmp-scroll">
          {shownIssues.map((i, idx) => {
            const tone = SEV_TONE[i.severity] || SEV_TONE.info;
            return (
              <div key={`${i.id}-${i.type}-${idx}`}
                style={{ display: "flex", gap: 10, alignItems: "flex-start",
                         padding: "10px 12px", borderRadius: 12,
                         background: tone.bg, color: tone.c, fontSize: 12.5, fontFamily: TEXT }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{i.msg}</div>
                  <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
                    {i.id} · {i.type}
                  </div>
                </div>
              </div>
            );
          })}
          {!loading && shownIssues.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: C.mintText, fontSize: 13 }}>
              <CheckCircle2 size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
              Không phát hiện vấn đề nào.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

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
import { useState, useEffect, useMemo, useRef } from "react";
import {
  Radar, RefreshCw, AlertTriangle, CheckCircle2, Bell, Gauge, PlayCircle,
  ClipboardCheck, Clock, FileCheck2,
} from "lucide-react";
import { C, TEXT, btnPrimary } from "../constants/theme.ts";
import { Card, CardTitle, Tag, KpiCard, TableScroll } from "../components/ui/Primitives.tsx";
import StateBoundary from "../components/ui/StateBoundary.tsx";
import {
  fetchDashboardKpi, checkDataQuality, fetchDueAlerts, refreshComputedStatus,
} from "../lib/supabaseData.ts";
import type {
  ServerKpi, ServerQualityIssue, DueAlert,
} from "../lib/supabaseData.ts";
import type { AccessContext } from "../lib/access.ts";

const SEV_TONE: Record<string, { c: string; bg: string }> = {
  error:   { c: C.raspText,     bg: C.raspSoft },
  warning: { c: C.marigoldText, bg: C.marigoldSoft },
  info:    { c: C.skyText,      bg: C.skySoft },
};

export default function ServerChecksView({ access }: { access?: AccessContext | null }) {
  /* Quyền chạy kiểm đọc từ vai NGHIỆP VỤ do server giải (rpc_my_ui_access),
     không còn đọc user.perm phía client. RPC bên dưới vẫn tự chặn — đây
     chỉ là không bày nút chắc chắn thất bại. */
  const canRun = access?.businessRole === "admin";
  const year = new Date().getFullYear();

  const [kpi, setKpi] = useState<ServerKpi | null>(null);
  const [issues, setIssues] = useState<ServerQualityIssue[]>([]);
  const [alerts, setAlerts] = useState<DueAlert[]>([]);
  const [soonDays, setSoonDays] = useState(7);
  const [loadedSoonDays, setLoadedSoonDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sevFilter, setSevFilter] = useState("all");
  const loadGeneration = useRef(0);

  const load = async () => {
    const generation = ++loadGeneration.current;
    setLoading(true); setErr("");
    try {
      const [k, q, a] = await Promise.all([
        fetchDashboardKpi(year),
        checkDataQuality(year),
        fetchDueAlerts(year, soonDays),
      ]);
      if (generation !== loadGeneration.current) return;
      setKpi(k); setIssues(q); setAlerts(a);
      setLoadedSoonDays(soonDays);
    } catch (e) {
      if (generation !== loadGeneration.current) return;
      setErr((e as Error).message || "Lỗi tải dữ liệu từ server");
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
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
  const snapshotSoonDays = loadedSoonDays ?? soonDays;

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

  /* Lần tải đầu chưa có snapshot thì cả route có đúng một readiness state.
     Không dựng các card số 0 bên dưới: số 0 ở đây chưa phải dữ liệu sạch. */
  if (!kpi && loading) {
    return <StateBoundary state="loading" title="Đang tải số liệu theo server…" skeletonRows={6} />;
  }
  if (!kpi && err) {
    return (
      <StateBoundary
        state="error"
        title="Không đọc được số liệu theo server"
        description={err}
        onRetry={() => { void load(); }}
      />
    );
  }

  return (
    <div aria-busy={loading} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {err && (
        <StateBoundary
          state="error"
          title="Không làm mới được số liệu theo server"
          description={err}
          onRetry={() => { void load(); }}
        />
      )}
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

        {kpi && (
          <div aria-busy={loading} style={{ display: "grid", gap: 12,
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <KpiCard emoji={<ClipboardCheck size={22} aria-hidden="true" />} bg={C.mintSoft} color={C.mintText}
              value={`${kpi.validation.done}/${kpi.validation.total}`}
              label="Hạng mục hoàn thành"
              sub={`${Math.round((kpi.validation.done / Math.max(1, kpi.validation.total)) * 100)}%`}
              subColor={C.mintText} />
            <KpiCard emoji={<Clock size={22} aria-hidden="true" />} bg={C.raspSoft} color={C.raspText}
              value={kpi.validation.over} label="Hạng mục quá hạn"
              sub={`${kpi.validation.todo} chưa làm`} subColor={C.plumSoft} />
            <KpiCard emoji={<FileCheck2 size={22} aria-hidden="true" />} bg={C.skySoft} color={C.skyText}
              value={`${kpi.documentation.done}/${kpi.documentation.total}`}
              label="Hồ sơ hoàn thành"
              sub={`${kpi.documentation.over} quá hạn`} subColor={C.raspText} />
            <KpiCard emoji={<AlertTriangle size={22} aria-hidden="true" />} bg={C.marigoldSoft} color={C.marigoldText}
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
          <span style={{ fontSize: 12, fontWeight: 700, color: C.plum, fontFamily: TEXT }}>
            Ngưỡng "sắp đến hạn"
          </span>
          {[3, 7, 14, 30].map((d) => (
            <button key={d} onClick={() => setSoonDays(d)}
              style={{ padding: "6px 13px", borderRadius: 999, cursor: "pointer",
                       fontFamily: TEXT, fontSize: 12, fontWeight: soonDays === d ? 800 : 600,
                       border: `1.5px solid ${soonDays === d ? C.pink : C.pinkSoft}`,
                       background: soonDays === d ? C.pinkSoft : C.surface,
                       color: soonDays === d ? C.plum : C.plumSoft }}>
              {d} ngày
            </button>
          ))}
          <Tag color={C.raspText} bg={C.raspSoft}>{overdue.length} quá hạn</Tag>
          <Tag color={C.marigoldText} bg={C.marigoldSoft}>{dueSoon.length} sắp đến hạn</Tag>
        </div>

        {loadedSoonDays != null && loadedSoonDays !== soonDays && (
          <p role="status" style={{ margin: "-2px 0 12px", fontSize: 12, fontWeight: 700,
            color: err ? C.marigoldText : C.plumSoft }}>
            Đang hiển thị bản chụp theo ngưỡng {loadedSoonDays} ngày.
            {err ? ` Ngưỡng ${soonDays} ngày chưa tải được.` : ` Đang tải ngưỡng ${soonDays} ngày…`}
          </p>
        )}

        <TableScroll maxHeight="46vh">
          {/* Bề mặt sổ (analysis.css): kẻ dòng, tiêu đề dính khi cuộn dọc,
              mã thẩm định là tiêu đề dòng và dính khi cuộn ngang. */}
          <table className="reg-table">
            <caption>
              Hạng mục quá hạn hoặc đến hạn trong {snapshotSoonDays} ngày tới, máy chủ rà trực tiếp trên DB.
            </caption>
            <thead>
              <tr>
                {["Loại", "Mã thẩm định", "Đối tượng", "Bộ phận", "Giai đoạn", "Hạn", "Còn/Trễ", "Phụ trách"]
                  .map((h, i) => (
                    <th key={h} scope="col" data-reg-stick={i === 1 ? true : undefined}>{h}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => {
                const over = a.alert_type === "overdue";
                return (
                  <tr key={`${a.validation_code}-${a.stage}`}>
                    <td>
                      <Tag color={over ? C.raspText : C.marigoldText}
                           bg={over ? C.raspSoft : C.marigoldSoft}>
                        {over ? "quá hạn" : "sắp tới"}
                      </Tag>
                    </td>
                    <th scope="row" data-reg-stick>{a.validation_code}</th>
                    <td className="reg-muted">{a.object_name || a.object_code}</td>
                    <td className="reg-muted">{a.department || "—"}</td>
                    <td className="reg-muted" style={{ whiteSpace: "nowrap" }}>{a.stage}</td>
                    <td className="reg-muted" style={{ whiteSpace: "nowrap" }}>{a.due_date}</td>
                    <td className="reg-num" style={{ textAlign: "start",
                                 color: over ? C.raspText : C.marigoldText, fontWeight: 800 }}>
                      {over ? `trễ ${Math.abs(a.days_left)}` : `còn ${a.days_left}`} ngày
                    </td>
                    <td className="reg-muted">{a.owner_name || "—"}</td>
                  </tr>
                );
              })}
              {!loading && !err && alerts.length === 0 && (
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
                       fontFamily: TEXT, fontSize: 12, fontWeight: sevFilter === k ? 800 : 600,
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
                         padding: "10px 12px", borderRadius: 14,
                         background: tone.bg, color: tone.c, fontSize: 12, fontFamily: TEXT }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{i.msg}</div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
                    {i.id} · {i.type}
                  </div>
                </div>
              </div>
            );
          })}
          {!loading && !err && shownIssues.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: C.mintText, fontSize: 14 }}>
              <CheckCircle2 size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
              Không phát hiện vấn đề nào.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

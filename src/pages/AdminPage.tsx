/* =====================================================================
 *  AdminPage — Cấu hình hệ thống (trạng thái nguồn, cron, kết nối)
 *  (F1 31/08: tách từ App.tsx, nạp lazy — màn admin.)
 * ===================================================================== */
import { useState, useEffect, useCallback } from "react";
import { BarChart3, Radar, Clock, FileWarning, Scale } from "lucide-react";
import { C, TEXT, NUM, btnPrimary } from "../constants/theme.ts";
import { Card, CardTitle, Tag } from "../components/ui/Primitives.tsx";

import { fetchSystemStatus, VAI_NGHIEP_VU } from "../lib/supabaseData.ts";
import { isSupabaseConfigured } from "../lib/supabaseClient.ts";
import type { SystemStatus } from "../lib/supabaseData.ts";
import type { ConnState } from "../hooks/index.ts";
import type { AppUser } from "../types/domain.ts";
import type { AccessContext } from "../lib/access.ts";
import { formatBangkokDateTime, formatBangkokTime } from "../lib/formatBangkok.ts";

function docLichCron(lich: string): string {
  const p = String(lich || "").trim().split(/\s+/);
  if (p.length < 5) return lich;
  const [phut, gio, ngay, , thu] = p;
  const gioVN = (Number(gio) + 7) % 24;
  const gioChu = `${String(gioVN).padStart(2, "0")}:${String(phut).padStart(2, "0")}`;
  const TEN_THU = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
  const quaNgay = Number(gio) + 7 >= 24 ? " (ngày kế tiếp)" : "";
  if (thu !== "*") return `${TEN_THU[Number(thu)] || "thứ " + thu} hằng tuần, ${gioChu} giờ VN${quaNgay}`;
  if (ngay !== "*") return `ngày ${ngay} hằng tháng, ${gioChu} giờ VN${quaNgay}`;
  return `hằng ngày, ${gioChu} giờ VN${quaNgay}`;
}

export default function AdminView({ conn, user, access }: {
  conn: ConnState; user?: AppUser | null;
  /** Chỉ cần businessRole — hiện nhãn vai của phiên đang đăng nhập, thay `user.perm` cũ. */
  access?: Pick<AccessContext, "businessRole"> | null;
}) {
  const [tt, setTt] = useState<SystemStatus | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [moCauHinh, setMoCauHinh] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetchSystemStatus();
      if (r?.ok === false) setErr(r.error || "Không đọc được trạng thái hệ thống");
      else setTt(r);
    } catch (e) { setErr((e as Error).message || "Không đọc được trạng thái hệ thống"); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const oSo = (nhan: string, giaTri: React.ReactNode, phu?: string) => (
    <div style={{ padding: "13px 15px", borderRadius: 14, background: C.surface, border: `1px solid ${C.pinkSoft}` }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: C.plumSoft, textTransform: "uppercase", letterSpacing: ".03em" }}>{nhan}</div>
      <div style={{ fontFamily: NUM, fontSize: 20, fontWeight: 800, color: C.plum, marginTop: 3 }}>{giaTri}</div>
      {phu && <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 1 }}>{phu}</div>}
    </div>
  );

  const d = tt?.du_lieu || {};

  /* Bàn quản trị (spec 01/09): nối trọn vòng giám sát E2 — đọc lỗi client
     24h qua rpc_doc_loi_client. Migration 20260831170000 CHƯA áp thì RPC
     vắng (PGRST202/42883) → hiện hộp hướng dẫn, không phải lỗi đỏ. */
  type LoiClient = { id: number; created_at: string; user_email: string | null;
    url: string | null; message: string; source: string };
  const [loiClient, setLoiClient] = useState<LoiClient[] | null>(null);
  const [loiClientTong, setLoiClientTong] = useState(0);
  const [loiClientTrangThai, setLoiClientTrangThai] =
    useState<"dang-tai" | "ok" | "chua-ap" | "loi">("dang-tai");
  useEffect(() => {
    (async () => {
      try {
        const { supabase } = await import("../lib/supabaseClient.ts");
        if (!supabase) { setLoiClientTrangThai("chua-ap"); return; }
        const rpc = supabase.rpc.bind(supabase) as unknown as (
          ten: string, thamSo: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
        const { data, error } = await rpc("rpc_doc_loi_client", {
          p_limit: 20, p_tu: new Date(Date.now() - 24 * 3_600_000).toISOString(),
        });
        if (error) {
          setLoiClientTrangThai(error.code === "PGRST202" || error.code === "42883" ? "chua-ap" : "loi");
          return;
        }
        const kq = data as { ok?: boolean; total?: number; errors?: LoiClient[] } | null;
        if (kq?.ok === false) { setLoiClientTrangThai("loi"); return; }
        setLoiClient(kq?.errors ?? []);
        setLoiClientTong(kq?.total ?? 0);
        setLoiClientTrangThai("ok");
      } catch { setLoiClientTrangThai("loi"); }
    })();
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <Card>
        <CardTitle icon={BarChart3} sub="Người dùng · cấu hình · việc tự động · khối lượng dữ liệu"
          right={<button onClick={load} disabled={loading}
            style={{ ...btnPrimary, padding: "8px 15px", borderRadius: 14, fontSize: 12, opacity: loading ? 0.6 : 1 }}>
            {loading ? "Đang tải…" : "Tải lại"}</button>}>
          Quản trị hệ thống
        </CardTitle>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
          <div style={{ padding: "13px 15px", borderRadius: 14, background: conn.status === "ok" ? C.mintSoft : C.marigoldSoft }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: conn.status === "ok" ? C.mintText : C.marigoldText, textTransform: "uppercase" }}>Kết nối dữ liệu</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.plum, marginTop: 3 }}>
              {conn.status === "ok" ? "Đang chạy · Supabase" : conn.status === "loading" ? "Đang tải…" : conn.status === "err" ? "Lỗi kết nối" : "Chưa kết nối"}
            </div>
          </div>
          <div style={{ padding: "13px 15px", borderRadius: 14, background: isSupabaseConfigured() ? C.mintSoft : C.raspSoft }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: isSupabaseConfigured() ? C.mintText : C.raspText, textTransform: "uppercase" }}>Xác thực</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.plum, marginTop: 3 }}>{isSupabaseConfigured() ? "Supabase Auth" : "Chế độ tạm (env)"}</div>
          </div>
          {oSo("Đang đăng nhập", user?.name || "—", `${user?.role || ""} · ${(access && VAI_NGHIEP_VU.find((v) => v.id === access.businessRole)?.nhan) || "—"}`)}
        </div>
      </Card>

      {err && (
        <Card>
          <div style={{ padding: "16px 18px", borderRadius: 14, background: C.raspSoft, border: `1px solid ${C.rasp}` }}>
            <div style={{ fontFamily: TEXT, fontWeight: 800, fontSize: 14, color: C.raspText }}>Không đọc được trạng thái hệ thống</div>
            <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 5 }}>{err}</div>
            <button onClick={load} style={{ ...btnPrimary, marginTop: 12, padding: "9px 18px", borderRadius: 14, fontSize: 14 }}>Thử lại</button>
          </div>
        </Card>
      )}

      {tt && (
        <>
          <Card variant="strong">
            <CardTitle icon={Radar} sub="Đọc thẳng từ database lúc mở trang">Khối lượng dữ liệu</CardTitle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: 12 }}>
              {oSo("Hạng mục đang theo dõi", String(d.hang_muc_dang_theo_doi ?? "—"), "tính vào KPI")}
              {oSo("Không áp dụng", String(d.hang_muc_khong_ap_dung ?? "—"), "ngoài KPI, vẫn tra được")}
              {oSo("Đối tượng", String(d.doi_tuong ?? "—"))}
              {oSo("Người thực hiện", String(d.nguoi_thuc_hien ?? "—"))}
              {oSo("Dòng nhật ký", String(d.dong_nhat_ky ?? "—"), "ALCOA+ audit trail")}
              {oSo("Dung lượng", String(d.dung_luong ?? "—"), "cả database")}
            </div>
          </Card>

          <Card>
            <CardTitle icon={Clock} sub="pg_cron chạy ngay trong database — không phụ thuộc máy nào bật">
              Việc tự động đang hẹn giờ
            </CardTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(tt.lich_tu_dong || []).map((j: NonNullable<SystemStatus["lich_tu_dong"]>[number]) => (
                <div key={j.ten} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 14, background: C.surface, border: `1px solid ${C.pinkSoft}` }}>
                  <Tag color={j.dang_bat ? C.mintText : C.plumSoft} bg={j.dang_bat ? C.mintSoft : C.pinkMist}>{j.dang_bat ? "Đang bật" : "Tắt"}</Tag>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.plum }}>{j.ten}</div>
                    <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 1 }}>
                      {docLichCron(j.lich)} · <span style={{ fontFamily: NUM }}>{j.lich}</span>
                    </div>
                  </div>
                </div>
              ))}
              {!(tt.lich_tu_dong || []).length && <div style={{ padding: 14, color: C.plumSoft, fontWeight: 600 }}>Chưa hẹn giờ việc nào.</div>}
            </div>
          </Card>

          <Card>
            <CardTitle icon={Radar}
              sub={loiClientTrangThai === "ok"
                ? `${loiClientTong} lỗi trong 24 giờ · web tự báo về (lib/baoLoi.ts) — trước đây lỗi chết trong trình duyệt người dùng`
                : "Web tự báo lỗi runtime về database — tai mắt production"}>
              Lỗi client 24 giờ qua
            </CardTitle>
            {loiClientTrangThai === "dang-tai" && (
              <div style={{ padding: 14, color: C.plumSoft, fontWeight: 600 }}>Đang tải…</div>
            )}
            {loiClientTrangThai === "chua-ap" && (
              <div style={{ padding: "13px 15px", borderRadius: 14, background: C.marigoldSoft,
                            fontSize: 13, color: C.marigoldText, fontWeight: 700, lineHeight: 1.7 }}>
                Kênh báo lỗi chưa bật: áp migration <span style={{ fontFamily: NUM }}>20260831170000_client_error_log.sql</span> theo
                runbook <span style={{ fontFamily: NUM }}>docs/runbooks/2026-08-31-client-error-log.md</span>.
                Frontend đã gắn sẵn — áp xong là cột này tự có số.
              </div>
            )}
            {loiClientTrangThai === "loi" && (
              <div style={{ padding: 14, color: C.raspText, fontWeight: 700 }}>
                Không đọc được nhật ký lỗi client (cần vai Admin/Quản lý QA).
              </div>
            )}
            {loiClientTrangThai === "ok" && (
              (loiClient ?? []).length === 0 ? (
                <div style={{ padding: 14, color: C.mintText, fontWeight: 700 }}>
                  24 giờ qua web không báo lỗi nào — production sạch.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(loiClient ?? []).map((l) => (
                    <div key={l.id} style={{ padding: "9px 13px", borderRadius: 12,
                                             background: C.surface, border: `1px solid ${C.raspSoft}`,
                                             fontSize: 12, lineHeight: 1.6 }}>
                      <b style={{ color: C.raspText }}>{formatBangkokTime(l.created_at)}</b>
                      {" · "}{l.user_email || "ẩn danh"} · <span style={{ fontFamily: NUM }}>{l.url || ""}</span>
                      <div style={{ color: C.plum, fontWeight: 700, marginTop: 2 }}>{l.message.slice(0, 160)}</div>
                    </div>
                  ))}
                </div>
              )
            )}
          </Card>

          {!!(tt.workflow_loi_7_ngay || []).length && (
            <Card variant="strong">
              <CardTitle icon={FileWarning} sub="Ghi từ bảng workflow_runs — n8n báo về khi một workflow chạy hỏng">
                Workflow lỗi 7 ngày qua ({tt.workflow_loi_7_ngay!.length})
              </CardTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {tt.workflow_loi_7_ngay!.map((wf: NonNullable<SystemStatus["workflow_loi_7_ngay"]>[number], i: number) => (
                  <div key={i} style={{ padding: "10px 13px", borderRadius: 14, background: C.surface, border: `1px solid ${C.raspSoft}` }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.plum }}>{wf.ten || "(không tên)"}</div>
                    <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 2 }}>
                      {wf.luc ? formatBangkokDateTime(wf.luc) : ""} · {wf.loi || "không có mô tả lỗi"}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card variant="soft">
            <CardTitle icon={Scale} sub={`${tt.cau_hinh?.length || 0} khoá · khoá đánh dấu nhạy cảm không hiện ở đây`}
              right={<button onClick={() => setMoCauHinh((v) => !v)}
                style={{ fontFamily: TEXT, fontSize: 12, fontWeight: 700, color: C.plum, border: `1.5px solid ${C.pinkSoft}`, background: C.surface, borderRadius: 999, padding: "7px 13px", cursor: "pointer" }}>
                {moCauHinh ? "Gập lại" : "Xem"}</button>}>
              Cấu hình hệ thống
            </CardTitle>
            {moCauHinh && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {(tt.cau_hinh || []).map((c: NonNullable<SystemStatus["cau_hinh"]>[number]) => (
                  <div key={c.khoa} style={{ display: "flex", gap: 12, fontSize: 12, padding: "6px 0", borderTop: `1px solid ${C.pinkMist}` }}>
                    <span style={{ fontFamily: NUM, fontWeight: 800, color: C.plum, minWidth: 210 }}>{c.khoa}</span>
                    <span style={{ color: C.plumSoft, fontWeight: 600, wordBreak: "break-word" }}>{JSON.stringify(c.gia_tri)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/* ===================== BACKWARD COMPAT: Import page components =====================
 * These are kept from the original App.jsx. Each will be extracted to pages/ in future.
 * For now they reference shared modules (C, TEXT, etc.) from imports above.
 */

/* --- Individual Leaderboard --- */

/* =====================================================================
 * TỔNG QUAN — lưới bento
 *
 * Ô to nhỏ khác nhau chính là thứ tự đọc: ô lớn nhất trả lời câu hỏi
 * quan trọng nhất ("dự án đang ở đâu"), các ô nhỏ là số cần liếc. Lưới
 * đều nhau bắt mắt phải tự quyết định nhìn đâu trước — đó là lý do bản
 * cũ (4 thẻ KPI y hệt nhau xếp hàng ngang) đọc mệt hơn cần thiết.
 * =================================================================== */

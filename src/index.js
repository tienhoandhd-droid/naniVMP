/* =====================================================================
 *  hooks/index.js — Custom React Hooks (v2.1 — Supabase RPC first)
 *  =====================================================================
 *  Thay đổi:
 *  - updateActivity: ghi qua Supabase RPC (audit do trigger DB lo)
 *  - saveObject/deleteObject: gửi kèm JWT token
 *  - Bỏ writeAuditLog() từ frontend — DB trigger ghi tập trung
 *  - Fallback qua n8n webhook nếu chưa có Supabase
 * ===================================================================== */
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { loadConn, saveConn, loadUser, saveUser } from "../lib/config.js";
import { fetchVmpData, postToN8n, deriveActivityFields, clearVmpCache } from "../lib/n8nAdapter.js";
import { isSupabaseConfigured, signIn, signOut, getSession, getAccessToken, supabase } from "../lib/supabaseClient.js";
import { fetchVmpDataFromSupabase, updateProgressSupabase, upsertObjectSupabase, pushToSheet, resolveOutbox } from "../lib/supabaseData.js";
import { enrich } from "../utils/helpers.js";

// ======================== useDebounce ========================
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ======================== useScrollTop ========================
export function useScrollTop(deps) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, deps); // eslint-disable-line
  return ref;
}

// ======================== useAuth ========================
export function useAuth() {
  const [user, setUser] = useState(() => loadUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isSupabaseConfigured() && !user) {
      getSession()
        .then((s) => { if (s) { setUser(s); saveUser(s); } })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => { saveUser(user); }, [user]);

  const login = useCallback(async (email, password) => {
    if (!isSupabaseConfigured()) {
      throw new Error("Hệ thống chưa cấu hình Supabase Auth. Liên hệ IT để thiết lập.");
    }
    const profile = await signIn(email, password);
    setUser(profile);
    return profile;
  }, []);

  const logout = useCallback(async () => {
    if (isSupabaseConfigured()) await signOut();
    setUser(null);
    saveUser(null);
    clearVmpCache();
  }, []);

  return { user, setUser, login, logout, loading, isAdmin: user?.perm === "admin" };
}

// ======================== Helper: Map frontend fields → Supabase ========================
function mapPatchToSupabase(patch) {
  const map = {
    tt_de_cuong: "status_protocol",
    tt_tham_dinh: "status_validation",
    tt_bao_cao: "status_report",
    tt_vmp: "status_vmp",
    ngay_de_cuong: "actual_protocol_date",
    ngay_tham_dinh: "actual_validation_date",
    ngay_bao_cao: "actual_report_date",
    ngay_vmp: "actual_vmp_date",
    lich_td: "scheduled_date",
  };
  const statusMap = (v) => {
    const s = (v || "").toLowerCase().trim();
    if (!s) return "not_started";
    // PHỦ ĐỊNH TRƯỚC: "Chưa hoàn thành"/"không đạt"/not_started → KHÔNG phải completed.
    const neg = /\b(chưa|chua|không|khong)\b/.test(s) || /^\s*(chưa|chua|không|khong)/.test(s) || /not[_\s-]?started/.test(s);
    if (neg) return "not_started";
    if (/hoàn thành|hoan thanh|done|đạt|dat|complete|completed|xong/.test(s)) return "completed";
    if (/đang|dang|progress|in[_\s-]?progress|thực hiện|thuc hien|wip/.test(s)) return "in_progress";
    return "not_started";
  };
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    const col = map[k];
    if (!col) continue;
    if (col.startsWith("status_")) out[col] = statusMap(v);
    else out[col] = v || null;
  }
  return out;
}

// ======================== useVmpData ========================
export function useVmpData() {
  const [objects, setObjects] = useState([]);
  const [acts, setActs] = useState([]);
  const [conn, setConn] = useState(() => {
    const c = loadConn();
    return c
      ? { readUrl: c.readUrl || "", writeUrl: c.writeUrl || "", status: "idle", msg: "Đã nạp URL — đang chờ đồng bộ…" }
      : { readUrl: "", writeUrl: "", status: "idle", msg: "" };
  });
  const [lastSync, setLastSync] = useState(null);
  const [saveStatus, setSaveStatus] = useState(""); // "saving" | "saved" | "error" | ""
  // Chữ ký dữ liệu gần nhất — để bỏ qua setState khi poll/Realtime trả về dữ liệu
  // y hệt (tránh re-render toàn bộ bảng/biểu đồ mỗi 2 phút khi không có thay đổi).
  const dataSigRef = useRef("");
  const sigOf = (objs, activities) => {
    try { return JSON.stringify(activities) + "|" + (objs ? objs.length : 0); }
    catch { return String(Date.now()); }
  };

  const enriched = useMemo(() => enrich(objects, acts), [objects, acts]);

  const connectSheet = useCallback(async (readUrl, writeUrl, force = false) => {
    setConn((c) => ({ ...c, readUrl, writeUrl, status: "loading", msg: "Đang tải dữ liệu…" }));

    // ƯU TIÊN 1: Đọc trực tiếp từ Supabase (nhanh, dữ liệu đã đồng bộ)
    if (supabase) {
      try {
        const data = await fetchVmpDataFromSupabase(new Date().getFullYear());
        dataSigRef.current = sigOf(data.objects, data.activities);
        if (Array.isArray(data.objects)) setObjects(data.objects);
        if (Array.isArray(data.activities)) setActs(data.activities);
        if (readUrl || writeUrl) saveConn(readUrl, writeUrl);
        setLastSync(new Date());
        setConn({
          readUrl, writeUrl, status: "ok", source: "supabase",
          msg: `Đã tải ${data.objects.length} đối tượng · ${data.activities.length} hạng mục từ Supabase ✓`,
        });
        return;
      } catch (e) {
        console.warn("Supabase read failed, trying n8n:", e.message);
        // Fallback sang n8n nếu Supabase lỗi
      }
    }

    // ƯU TIÊN 2: Đọc qua n8n webhook (fallback)
    if (!readUrl) {
      setConn((c) => ({ ...c, writeUrl, status: "err", msg: "Chưa cấu hình Supabase và chưa có URL đọc n8n." }));
      return;
    }
    try {
      const data = await fetchVmpData(readUrl, force);
      if (Array.isArray(data.objects) && data.objects.length) setObjects(data.objects);
      if (Array.isArray(data.activities) && data.activities.length) setActs(data.activities);
      saveConn(readUrl, writeUrl);
      setLastSync(new Date());
      setConn({
        readUrl, writeUrl, status: "ok", source: data.source,
        msg: `Đã tải ${data.objects?.length || 0} đối tượng · ${data.activities?.length || 0} hạng mục từ n8n ✓`,
      });
    } catch (e) {
      setConn({
        readUrl, writeUrl, status: "err",
        msg: "Lỗi tải: " + (e?.message || "không rõ") + " — kiểm tra URL / CORS / workflow",
      });
    }
  }, []);

  const reloadData = useCallback(() => {
    const c = loadConn() || {};
    connectSheet(c.readUrl || conn.readUrl, c.writeUrl || conn.writeUrl, true);
  }, [conn, connectSheet]);

  // Refresh "im lặng" — cập nhật dữ liệu không hiện trạng thái "đang tải"
  // Dùng cho Realtime + polling để tránh nhấp nháy UI
  const silentRefresh = useCallback(async () => {
    if (!supabase) return;
    try {
      const data = await fetchVmpDataFromSupabase(new Date().getFullYear());
      const sig = sigOf(data.objects, data.activities);
      // Không có thay đổi thật → bỏ qua, tránh re-render tốn kém khi dữ liệu lớn.
      if (sig === dataSigRef.current) return;
      dataSigRef.current = sig;
      if (Array.isArray(data.objects)) setObjects(data.objects);
      if (Array.isArray(data.activities)) setActs(data.activities);
      setLastSync(new Date());
    } catch (e) { /* im lặng — lần sau thử lại */ }
  }, []);

  useEffect(() => {
    const c = loadConn();
    if (c?.readUrl || supabase) connectSheet(c?.readUrl || "", c?.writeUrl || "");
  }, [connectSheet]);

  // ============================================================
  // REALTIME: tự cập nhật khi bảng vmp_plan_items đổi ở Supabase
  // (cần bật Realtime cho bảng — xem migration 007)
  // ============================================================
  const refreshRef = useRef(silentRefresh);
  useEffect(() => { refreshRef.current = silentRefresh; }, [silentRefresh]);

  useEffect(() => {
    if (!supabase) return;
    let timer = null;
    const debounced = () => {
      clearTimeout(timer);
      timer = setTimeout(() => refreshRef.current?.(), 800);
    };

    const channel = supabase
      .channel("vmp-plan-items-changes")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "vmp_plan_items" },
        debounced
      )
      .subscribe();

    // Backup polling mỗi 2 phút — đảm bảo đồng bộ kể cả khi Realtime chưa bật
    const poll = setInterval(() => refreshRef.current?.(), 120000);

    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, []);

  // ============================================================
  // updateActivity: DUAL-WRITE — Supabase RPC (chính) + ghi Sheet (gương)
  // Supabase: bản ghi chính thức + audit. Sheet: đồng bộ ngược để không bị
  // WF-01 ghi đè ở lần sync sau. Nếu ghi Sheet lỗi → CẢNH BÁO rõ ràng.
  // ============================================================
  const updateActivity = useCallback(async (id, patch, userName, reason) => {
    setSaveStatus("saving");

    // Optimistic update UI
    setActs((prev) => prev.map((a) => {
      if (a.id !== id) return a;
      const raw = { ...(a._raw || {}), ...patch };
      return { ...a, _raw: raw, ...deriveActivityFields(raw) };
    }));

    if (!supabase) {
      setSaveStatus("error");
      setConn((c) => ({ ...c, msg: "Chưa cấu hình Supabase — không thể lưu an toàn." }));
      setTimeout(() => setSaveStatus(""), 4000);
      return { ok: false };
    }

    // BƯỚC 1 — GHI CHÍNH: Supabase RPC (kiểm tra quyền + lý do + audit qua trigger)
    let outboxId = null;
    try {
      const supabasePatch = mapPatchToSupabase(patch);
      // Truyền `patch` (theo cột Sheet) làm p_sheet_patch → RPC ghi vào hàng đợi đồng bộ (outbox).
      const result = await updateProgressSupabase(id, supabasePatch, reason, patch);
      if (result && result.ok === false) {
        setSaveStatus("error");
        setConn((c) => ({ ...c, msg: result.error || "Ghi Supabase thất bại" }));
        setTimeout(() => setSaveStatus(""), 5000);
        return { ok: false, error: result.error };
      }
      outboxId = (result && result.outbox_id) || null;
    } catch (e) {
      setSaveStatus("error");
      setConn((c) => ({ ...c, msg: "Lỗi ghi Supabase: " + (e?.message || "không rõ") }));
      setTimeout(() => setSaveStatus(""), 5000);
      return { ok: false, error: e.message };
    }

    // BƯỚC 2 — GHI GƯƠNG: đẩy về Google Sheet (await để biết kết quả)
    if (conn.writeUrl) {
      const sheetRes = await pushToSheet(conn.writeUrl, id, patch);
      if (sheetRes.ok) {
        // Mirror tức thời OK → đánh dấu việc trong hàng đợi là 'done' (WF-06 khỏi ghi lại).
        resolveOutbox(outboxId, true);
        setSaveStatus("saved");
        setConn((c) => ({ ...c, msg: `Đã lưu '${id}' ✓ (Supabase + Google Sheet)` }));
      } else if (sheetRes.skipped) {
        resolveOutbox(outboxId, true);
        setSaveStatus("saved");
        setConn((c) => ({ ...c, msg: `Đã lưu '${id}' vào Supabase ✓` }));
      } else {
        // Supabase OK nhưng mirror Sheet lỗi → KHÔNG đáng lo: việc vẫn nằm trong hàng đợi
        // (status 'pending'). WF-06 sẽ TỰ ĐẨY sang Google Sheet trong ~1 phút, có retry.
        // → Dữ liệu KHÔNG lệch pha; người dùng không cần làm gì.
        setSaveStatus("saved");
        setConn((c) => ({
          ...c,
          msg: `Đã lưu '${id}' vào Supabase ✓ — đang tự đồng bộ Google Sheet ở chế độ nền (hoàn tất trong giây lát).`,
        }));
        setTimeout(() => setSaveStatus(""), 5000);
        return { ok: true, sheetPending: true };
      }
    } else {
      // Chưa cấu hình Sheet → chỉ Supabase (chấp nhận được nếu Supabase là nguồn)
      setSaveStatus("saved");
      setConn((c) => ({ ...c, msg: `Đã lưu '${id}' vào Supabase ✓ (chưa nối Sheet)` }));
    }

    setTimeout(() => setSaveStatus(""), 3000);
    return { ok: true };
  }, [conn.writeUrl]);

  // ============================================================
  // saveObject: Dùng RPC upsert có mapping cột (sửa lỗi cột cls/dept/crit)
  // ============================================================
  const saveObject = useCallback(async (obj, isNew) => {
    setSaveStatus("saving");
    setObjects((prev) => isNew ? [...prev, obj] : prev.map((o) => o.code === obj.code ? obj : o));

    // GHI CHÍNH: Supabase RPC (mapping field frontend → cột DB)
    if (supabase) {
      try {
        const result = await upsertObjectSupabase(obj);
        if (result && result.ok === false) {
          setSaveStatus("error");
          setConn((c) => ({ ...c, msg: result.error || "Lưu thất bại" }));
          setTimeout(() => setSaveStatus(""), 5000);
          return;
        }
        setSaveStatus("saved");
        setConn((c) => ({ ...c, msg: `Đã lưu '${obj.code}' vào Supabase ✓` }));
        setTimeout(() => setSaveStatus(""), 3000);
        return;
      } catch (e) {
        console.warn("Upsert RPC failed, trying n8n:", e.message);
      }
    }

    // FALLBACK: n8n webhook (có JWT token)
    if (conn.writeUrl) {
      try {
        const token = await getAccessToken();
        const r = await postToN8n(conn.writeUrl, { action: "upsertObject", row: obj }, token);
        const j = await r.json().catch(() => null);
        const ok = r.ok && (!j || j.ok !== false);
        setSaveStatus(ok ? "saved" : "error");
        setConn((c) => ({
          ...c, msg: ok ? `Đã lưu '${obj.code}' ✓` : (j?.error || `Lưu '${obj.code}' thất bại`),
        }));
      } catch (e) {
        setSaveStatus("error");
        setConn((c) => ({ ...c, msg: "Lỗi lưu: " + (e?.message || "không rõ") }));
      }
    }
    setTimeout(() => setSaveStatus(""), 4000);
  }, [conn.writeUrl]);

  // ============================================================
  // deleteObject: Soft delete + JWT token
  // ============================================================
  const deleteObject = useCallback(async (code) => {
    setSaveStatus("saving");
    setObjects((prev) => prev.filter((o) => o.code !== code));

    if (supabase) {
      try {
        const { error } = await supabase.from("vmp_objects")
          .update({ is_active: false }).eq("code", code);
        if (error) throw error;
        setSaveStatus("saved");
        setConn((c) => ({ ...c, msg: `Đã ẩn '${code}' ✓ (soft delete)` }));
        setTimeout(() => setSaveStatus(""), 3000);
        return;
      } catch (e) {
        console.warn("Direct delete failed:", e.message);
      }
    }

    if (conn.writeUrl) {
      try {
        const token = await getAccessToken();
        await postToN8n(conn.writeUrl, { action: "deleteObject", code }, token);
        setSaveStatus("saved");
      } catch (e) {
        setSaveStatus("error");
        setConn((c) => ({ ...c, msg: "Lỗi xoá: " + (e?.message || "không rõ") }));
      }
    }
    setTimeout(() => setSaveStatus(""), 4000);
  }, [conn.writeUrl]);

  return {
    objects, acts: enriched, conn, lastSync, saveStatus,
    connectSheet, reloadData, silentRefresh, updateActivity,
    saveObject, deleteObject, setConn,
  };
}

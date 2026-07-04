/* =====================================================================
 *  hooks/index.js — Custom React Hooks (Sheet-canonical read-only mode)
 *  =====================================================================
 *  Google Sheet là nơi chỉnh sửa duy nhất. Dashboard chỉ đọc Supabase;
 *  mọi lời gọi ghi từ UI đều bị chặn ở client trước khi chạm tới API.
 * ===================================================================== */
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { loadConn, saveConn, loadUser, saveUser } from "../lib/config.js";
import { fetchVmpData, clearVmpCache } from "../lib/n8nAdapter.js";
import { isSupabaseConfigured, signIn, signOut, getSession, supabase } from "../lib/supabaseClient.js";
import { fetchVmpDataFromSupabase } from "../lib/supabaseData.js";
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

    // S3-C FIX: subscribe CẢ vmp_plan_items VÀ vmp_objects (cả 2 enable Realtime
    // ở migration 007). Trước đây chỉ plan_items → admin sửa danh mục (rename, đổi
    // bộ phận, đổi tần suất) thì web không tự cập nhật.
    const channel = supabase
      .channel("vmp-changes")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "vmp_plan_items" },
        debounced
      )
      .on("postgres_changes",
        { event: "*", schema: "public", table: "vmp_objects" },
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

  const rejectWrite = useCallback((action) => {
    const msg = `${action} đã bị khóa: Google Sheet là nguồn dữ liệu chuẩn. Vui lòng chỉnh sửa trên Sheet.`;
    setSaveStatus("error");
    setConn((c) => ({ ...c, msg }));
    setTimeout(() => setSaveStatus(""), 5000);
    return Promise.resolve({ ok: false, code: "sheet_canonical_read_only", error: msg });
  }, []);

  const updateActivity = useCallback(
    () => rejectWrite("Cập nhật tiến độ trên web"),
    [rejectWrite],
  );
  const saveObject = useCallback(
    () => rejectWrite("Thêm hoặc sửa đối tượng trên web"),
    [rejectWrite],
  );
  const deleteObject = useCallback(
    () => rejectWrite("Xóa đối tượng trên web"),
    [rejectWrite],
  );

  return {
    objects, acts: enriched, conn, lastSync, saveStatus,
    connectSheet, reloadData, silentRefresh, updateActivity,
    saveObject, deleteObject, setConn,
  };
}

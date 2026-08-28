/* =====================================================================
 *  hooks/index.js — Custom React Hooks
 *  =====================================================================
 *  SUPABASE LÀ DỮ LIỆU GỐC (từ 2026-07-29, người dùng xác nhận 2026-08-03).
 *  Dữ liệu nghiệp vụ đã được đẩy hẳn lên Supabase; nhập liệu và sửa đổi
 *  diễn ra trên dashboard, đi qua RPC có kiểm quyền phía server.
 *
 *  Google Sheet nay chỉ là bản tham chiếu/lưu trữ cũ — KHÔNG ghi vào nó,
 *  và cũng không còn kéo dữ liệu từ nó về (nhánh sync 5 phút của WF-04 đã
 *  tắt có chủ đích). Đầu file này trước ghi ngược lại — "Sheet-canonical
 *  read-only mode" — và câu đó đã sống sót qua nhiều lần sửa sau khi hết
 *  đúng, đủ lâu để làm lạc hướng chẩn đoán. Sai lệch giữa comment và thực
 *  tế tốn kém hơn không có comment.
 * ===================================================================== */
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { DependencyList } from "react";
import type { Activity, PerformerRow, VmpObject } from "../types/domain.ts";

/** Trạng thái kết nối nguồn dữ liệu hiển thị trên banner. */
export interface ConnState {
  readUrl: string;
  writeUrl: string;
  status: "idle" | "loading" | "ok" | "err";
  msg: string;
  /** Nguồn dữ liệu đang dùng: "supabase" hoặc "n8n". */
  source?: string;
}

export function silentRefreshSuccessConn(
  current: ConnState,
  counts?: { objects: number; activities: number },
): ConnState {
  if (!counts && current.status === "ok") return current;
  return {
    ...current,
    status: "ok",
    source: "supabase",
    msg: counts
      ? `Đã làm mới ${counts.objects} đối tượng · ${counts.activities} hạng mục từ máy chủ ✓`
      : "Đã xác minh quyền — dữ liệu hiện tại không thay đổi ✓",
  };
}
import { loadConn, saveConn, loadUser, saveUser } from "../lib/config.ts";
import { fetchVmpData, clearVmpCache } from "../lib/n8nAdapter.ts";
import { isSupabaseConfigured, signIn, signOut, layPhien, supabase } from "../lib/supabaseClient.ts";
import {
  fetchVmpDataFromSupabase, fetchVmpWatermark,
  updateItemProgress, upsertObjectSupabase, fetchPerformers,
} from "../lib/supabaseData.ts";
import { enrich } from "../utils/helpers.ts";
import {
  loadSnapshot,
  saveSnapshot,
  clearSnapshot,
  permissionDataPolicy,
  type SnapshotPermissionMode,
} from "../lib/snapshotCache.ts";

async function readItemPermissionContext(): Promise<{
  userId: string;
  mode: SnapshotPermissionMode;
}> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error("Không đọc được phiên đăng nhập: " + sessionError.message);
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("Phiên đăng nhập đã hết hạn");

  const { data, error } = await supabase.rpc("item_permissions_mode" as never);
  if (error) throw new Error("Không đọc được chế độ phân quyền: " + error.message);
  if (data !== "preview" && data !== "enforced") {
    throw new Error("Chế độ phân quyền không hợp lệ");
  }
  return { userId, mode: data };
}

// ======================== useDebounce ========================
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ======================== useScrollTop ========================
export function useScrollTop(deps: DependencyList) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => ref.current?.scrollTo({ top: 0, left: 0 }));
    return () => cancelAnimationFrame(frame);
  }, deps); // eslint-disable-line
  return ref;
}

// ======================== usePerformers ========================
/** Danh sách người thực hiện (tab "Người thực hiện") để đổ gợi ý cho ô nhập tên.
 *  Chỉ lấy người đang làm; tra cứu không phân biệt hoa thường vì tên gõ tay
 *  trong Sheet có đủ kiểu ('My', 'my', 'My2'). */
export function usePerformers(): {
  performers: PerformerRow[];
  names: string[];
  find: (name?: string | null) => PerformerRow | undefined;
} {
  const [performers, setPerformers] = useState<PerformerRow[]>([]);
  useEffect(() => {
    let alive = true;
    fetchPerformers()
      .then((rows) => { if (alive) setPerformers(rows.filter((r) => r.is_active)); })
      .catch(() => { /* danh sách gợi ý hỏng thì ô nhập vẫn dùng được */ });
    return () => { alive = false; };
  }, []);
  const byName = useMemo(() => {
    const m = new Map<string, PerformerRow>();
    performers.forEach((p) => m.set(String(p.performer_name || "").trim().toLowerCase(), p));
    return m;
  }, [performers]);
  return {
    performers,
    names: useMemo(() => performers.map((p) => p.performer_name), [performers]),
    find: (name) => byName.get(String(name || "").trim().toLowerCase()),
  };
}

// ======================== useAuth ========================
export function useAuth() {
  const [user, setUser] = useState(() => loadUser());
  const [loading, setLoading] = useState(true);

  /* HỒ SƠ TRONG localStorage KHÔNG PHẢI BẰNG CHỨNG CÒN PHIÊN.
     Bản trước chỉ hỏi getSession() khi localStorage rỗng. Nên khi phiên
     Supabase chết mà hồ sơ còn (vé hết hạn, refresh token bị thu hồi, đổi
     mật khẩu ở máy khác), app vẫn dựng đủ dashboard như đã đăng nhập —
     trong khi useVmpData thấy không có phiên nên KHÔNG gọi gì cả. Kết quả:
     màn hình đầy đủ, "0/0 hạng mục", đứng ở "Đang chờ đồng bộ…" vĩnh viễn,
     không một dòng lỗi, và tải lại trang cũng không cứu được vì vòng lặp
     lặp lại y hệt. Người dùng chỉ thấy "web không tải được dữ liệu".
     Nay phiên thật là nguồn chân lý: không có phiên thì rơi về màn đăng nhập.

     Vẫn vẽ ngay bằng hồ sơ trong localStorage rồi mới đi hỏi, để không phải
     nhìn màn trắng mỗi lần mở app. Chỉ khi hỏi xong mà KHÔNG có phiên mới
     xoá — và không đụng tới hồ sơ đang có khi phiên còn sống, để bộ kiểm
     đổi vai trên màn vẫn dùng được (quyền thật do server giữ, không do đây). */
  useEffect(() => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }
    let con = true;

    layPhien()
      .then(({ tinhTrang, user: phien }) => {
        if (!con) return;
        /* CHỈ đăng xuất khi CHẮC CHẮN không có phiên. 'khong_ro' nghĩa là
           mạng chập lúc gia hạn vé, hoặc chưa đọc nổi bảng profiles — lúc đó
           đá người dùng ra màn đăng nhập là sai, và sai theo kiểu tệ nhất:
           thỉnh thoảng mới xảy ra, ngay lúc tải lại trang. Giữ nguyên hồ sơ
           đang có, để lần tải sau tự khỏi. */
        if (tinhTrang === "khong") {
          clearSnapshot();
          setUser(null);
          saveUser(null);
          return;
        }
        if (tinhTrang === "co" && phien) { setUser(phien); saveUser(phien); }
      })
      .catch(() => { /* không kết luận được — giữ nguyên, lần sau thử lại */ })
      .finally(() => { if (con) setLoading(false); });

    /* Phiên chết GIỮA CHỪNG lúc tab đang mở: autoRefreshToken thử gia hạn,
       thất bại thì supabase-js phát SIGNED_OUT. Không nghe thì app lại rơi
       đúng vào trạng thái trên, chỉ khác là không cần tải lại trang. */
    const { data: sub } = supabase!.auth.onAuthStateChange((sk, phien) => {
      if (con && sk === "SIGNED_OUT" && !phien) {
        clearSnapshot();
        setUser(null);
        saveUser(null);
      }
    });

    return () => { con = false; sub?.subscription?.unsubscribe(); };
  }, []); // eslint-disable-line

  /* Chỉ ghi khi user THẬT SỰ đổi, KHÔNG ghi ở lần chạy đầu.
     Bản trước ghi cả lần đầu, nên mỗi lần app mount trong trạng thái chưa
     đăng nhập là một lần saveUser(null) — tức là XOÁ hồ sơ đang có trong
     localStorage. Bình thường vô hại vì đằng nào cũng chưa đăng nhập, nhưng
     nó tạo ra một khoảng đua: ai ghi hồ sơ vào localStorage đúng lúc app
     đang mount thì bị xoá mất ngay sau đó.
     Đó chính là thứ làm bộ kiểm e2e thỉnh thoảng đỏ ở bước đầu tiên — và
     nếu người dùng mở hai tab thì tab đang mount cũng xoá phiên của tab kia. */
  const daChay = useRef(false);
  useEffect(() => {
    if (!daChay.current) { daChay.current = true; return; }
    saveUser(user);
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
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
    clearSnapshot();   // máy dùng chung: không để dữ liệu người trước nằm lại
  }, []);

  /* KHÔNG trả cờ quyền nào nữa (19/08, dọn xong cả `isAdmin` và
     `laAdminThat`). Trước đây hook này sinh `isAdmin` từ `user.perm` —
     cờ của hệ 4 vai CŨ, thực chất nghĩa là "admin HOẶC quản lý QA", và là
     nguồn của loại lỗi hiện nút mà máy chủ từ chối; `laAdminThat` thì suy
     từ `user.role === "admin"`, cùng bệnh chỉ khác mức độ. Quyền nay hỏi
     server qua `access.can(...)` ngay tại nơi cần, không còn đường tắt
     nào tính sẵn ở đây để lỡ dùng nhầm. */
  return { user, setUser, login, logout, loading };
}

// ======================== useVmpData ========================
export function useVmpData() {
  const [objects, setObjects] = useState<VmpObject[]>([]);
  const [acts, setActs] = useState<Activity[]>([]);
  const [conn, setConn] = useState<ConnState>(() => {
    const c = loadConn();
    return c
      ? { readUrl: c.readUrl || "", writeUrl: c.writeUrl || "", status: "idle", msg: "Đã nạp URL — đang chờ đồng bộ…" }
      : { readUrl: "", writeUrl: "", status: "idle", msg: "" };
  });
  const [lastSync, setLastSync] = useState<number | null>(null);
  // TUỔI DỮ LIỆU, khác hẳn lastSync. lastSync là lúc TRÌNH DUYỆT kéo về — bấm
  // Làm mới là nó mới tinh, kể cả khi đường Sheet→Supabase đã chết ba ngày.
  // Cái người dùng cần biết là dữ liệu trong DB cũ tới đâu, và chỉ watermark
  // trả lời được: rpc_get_vmp_dashboard trả 'updated_at', now() nên vô dụng cho
  // việc này, còn rpc_get_vmp_watermark trả max(updated_at) thật.
  const [dataUpdatedAt, setDataUpdatedAt] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState(""); // "saving" | "saved" | "error" | ""
  // Chữ ký dữ liệu gần nhất — để bỏ qua setState khi poll/Realtime trả về dữ liệu
  // y hệt (tránh re-render toàn bộ bảng/biểu đồ mỗi 2 phút khi không có thay đổi).
  const dataSigRef = useRef("");
  // Watermark gần nhất (count + max updated_at). Poll so cái này TRƯỚC — chỉ khi
  // đổi mới kéo cả payload nặng về. Tránh JSON.stringify cả mảng mỗi 20s.
  const wmSigRef = useRef("");
  const permissionModeRef = useRef<SnapshotPermissionMode | null>(null);
  const permissionUserRef = useRef("");
  const dataRequestRef = useRef(0);
  const wmSig = (wm: { plan_items?: number; objects?: number; updated_at?: string } | null): string =>
    wm ? `${wm.plan_items}|${wm.objects}|${wm.updated_at}` : "";
  type Watermark = { plan_items?: number; objects?: number; updated_at?: string };
  /** Chỉ đọc watermark. Caller phải kiểm generation trước khi áp vào state;
   *  hỏng thì trả null vì độ tươi không được làm hỏng đường nạp chính. */
  const readWatermark = useCallback(async (): Promise<Watermark | null> => {
    try {
      return (await fetchVmpWatermark(new Date().getFullYear())) as Watermark | null;
    } catch { return null; }
  }, []);
  const sigOf = (objs: VmpObject[] | null, activities: Activity[]): string => {
    try { return JSON.stringify(activities) + "|" + (objs ? objs.length : 0); }
    catch { return String(Date.now()); }
  };

  const enriched = useMemo(() => enrich(objects, acts), [objects, acts]);

  const clearProtectedData = useCallback((invalidateRequests = false) => {
    if (invalidateRequests) dataRequestRef.current += 1;
    dataSigRef.current = "";
    wmSigRef.current = "";
    setObjects([]);
    setActs([]);
    clearSnapshot();
  }, []);

  const connectSheet = useCallback(async (readUrl: string, writeUrl: string, force = false) => {
    setConn((c) => ({ ...c, readUrl, writeUrl, status: "loading", msg: "Đang tải dữ liệu…" }));
    let legacyRequestId: number | null = null;
    let legacyFallbackAllowed = !supabase;

    // ƯU TIÊN 1: Đọc trực tiếp từ Supabase (nhanh, dữ liệu đã đồng bộ)
    if (supabase) {
      const requestId = ++dataRequestRef.current;
      legacyRequestId = requestId;
      const nam = new Date().getFullYear();

      let permissionContext: Awaited<ReturnType<typeof readItemPermissionContext>>;
      try {
        permissionContext = await readItemPermissionContext();
      } catch (error) {
        if (requestId !== dataRequestRef.current) return;
        permissionModeRef.current = null;
        permissionUserRef.current = "";
        clearProtectedData();
        setConn((c) => ({
          ...c,
          readUrl,
          writeUrl,
          status: "err",
          source: "supabase",
          msg: `Không xác minh được quyền — đã thu hồi dữ liệu trên màn hình: ${(error as Error).message}`,
        }));
        return;
      }
      if (requestId !== dataRequestRef.current) return;

      const previousMode = permissionModeRef.current;
      const identityChanged = permissionUserRef.current !== ""
        && permissionUserRef.current !== permissionContext.userId;
      const modeChanged = previousMode !== null && previousMode !== permissionContext.mode;
      const policy = permissionDataPolicy(permissionContext.mode, previousMode);
      legacyFallbackAllowed = policy.allowLegacyFallback;
      permissionModeRef.current = permissionContext.mode;
      permissionUserRef.current = permissionContext.userId;
      if (identityChanged || modeChanged || policy.revokeBeforeFetch) {
        clearProtectedData();
      }

      /* Snapshot và RPC dashboard đều là dữ liệu bảo vệ. Chỉ đọc chúng SAU
         khi item_permissions_mode của đúng phiên đã xác minh thành công. */
      if (!force && policy.allowSnapshot) {
        const cu = loadSnapshot(nam, permissionContext.userId, permissionContext.mode);
        if (cu) {
          setObjects(cu.objects);
          setActs(cu.activities);
          setConn((c) => ({ ...c, readUrl, writeUrl, status: "loading", source: "supabase",
            msg: `Đang hiện bản lưu lúc ${new Date(cu.at).toLocaleTimeString("vi-VN")} — đang cập nhật…` }));
        }
      }

      try {
        const data = await fetchVmpDataFromSupabase(nam);
        if (requestId !== dataRequestRef.current) return;
        dataSigRef.current = sigOf(data.objects, data.activities);
        if (Array.isArray(data.objects)) setObjects(data.objects);
        if (Array.isArray(data.activities)) setActs(data.activities);
        if (policy.allowSnapshot) {
          saveSnapshot(
            nam,
            permissionContext.userId,
            permissionContext.mode,
            data.objects || [],
            data.activities || [],
          );
        } else {
          clearSnapshot();
        }
        if (readUrl || writeUrl) saveConn(readUrl, writeUrl);
        setLastSync(Date.now());
        // Không chặn first paint, nhưng watermark cũ không được ghi vào state
        // sau khi một request dữ liệu mới hơn đã bắt đầu.
        void readWatermark().then((wm) => {
          if (requestId !== dataRequestRef.current) return;
          if (wm?.updated_at) setDataUpdatedAt(wm.updated_at);
        });
        setConn({
          readUrl, writeUrl, status: "ok", source: "supabase",
          msg: `Đã tải ${data.objects.length} đối tượng · ${data.activities.length} hạng mục từ máy chủ ✓`,
        });
        return;
      } catch (e) {
        if (requestId !== dataRequestRef.current) return;
        const loi = (e as Error)?.message || "";
        /* Hết phiên thì n8n cũng không cứu được, mà thông báo của nhánh
           fallback ("chưa cấu hình URL đọc n8n") lại chỉ sai hướng hoàn toàn —
           người dùng đi sửa cấu hình trong khi việc cần làm là đăng nhập lại.
           42501 = permission denied for function: chính là vai anon gọi rpc_*
           sau migration 20260801090000. */
        if (/42501|permission denied|JWT|401/i.test(loi)) {
          clearProtectedData();
          setConn((c) => ({
            ...c, readUrl, writeUrl, status: "err",
            msg: "Phiên đăng nhập đã hết hạn — đăng nhập lại để tải dữ liệu.",
          }));
          return;
        }
        if (!policy.allowLegacyFallback) {
          clearProtectedData();
          setConn((c) => ({
            ...c,
            readUrl,
            writeUrl,
            status: "err",
            source: "supabase",
            msg: "Không tải được dữ liệu đã lọc quyền — hệ thống đã thu hồi dữ liệu cũ và không dùng nguồn dự phòng chưa lọc.",
          }));
          return;
        }
        console.warn("Supabase read failed, trying n8n:", loi);
        // Fallback sang n8n nếu Supabase lỗi
      }
    }

    // ƯU TIÊN 2: Đọc qua n8n webhook (fallback)
    if (supabase && (
      !legacyFallbackAllowed
      || legacyRequestId !== dataRequestRef.current
      || permissionModeRef.current !== "preview"
    )) return;
    if (!readUrl) {
      setConn((c) => ({ ...c, writeUrl, status: "err", msg: "Chưa cấu hình Supabase và chưa có URL đọc n8n." }));
      return;
    }
    try {
      const data = (await fetchVmpData(readUrl, force)) as {
        objects?: VmpObject[]; activities?: Activity[]; source?: string;
      };
      // Request được mở lúc preview có thể về sau khi Admin vừa bật enforced.
      // Kiểm lại cả generation lẫn mode ngay trước khi đụng state.
      if (supabase && (
        legacyRequestId !== dataRequestRef.current
        || permissionModeRef.current !== "preview"
      )) return;
      if (Array.isArray(data.objects) && data.objects.length) setObjects(data.objects);
      if (Array.isArray(data.activities) && data.activities.length) setActs(data.activities);
      saveConn(readUrl, writeUrl);
      setLastSync(Date.now());
      setConn({
        readUrl, writeUrl, status: "ok", source: data.source,
        msg: `Đã tải ${data.objects?.length || 0} đối tượng · ${data.activities?.length || 0} hạng mục từ nguồn dự phòng ✓`,
      });
    } catch (e) {
      setConn({
        readUrl, writeUrl, status: "err",
        msg: "Lỗi tải: " + ((e as Error)?.message || "không rõ") + " — kiểm tra URL / CORS / workflow",
      });
    }
  }, [clearProtectedData, readWatermark]);

  const reloadData = useCallback(() => {
    const c = loadConn() || {};
    connectSheet(c.readUrl || conn.readUrl, c.writeUrl || conn.writeUrl, true);
  }, [conn, connectSheet]);

  // Refresh "im lặng" — cập nhật dữ liệu không hiện trạng thái "đang tải"
  // Dùng cho Realtime + polling để tránh nhấp nháy UI
  const silentRefresh = useCallback(async () => {
    if (!supabase) return;
    const requestId = ++dataRequestRef.current;
    let permissionContext: Awaited<ReturnType<typeof readItemPermissionContext>>;
    try {
      /* Bắn watermark SONG SONG với kiểm mode — hai RPC độc lập, chờ nối
         tiếp là trả thêm một vòng mạng mỗi 20 giây không để làm gì. Kết
         quả watermark chỉ được DÙNG sau khi mode đã kiểm xong ở dưới.
         readWatermark không bao giờ ném (hỏng thì trả null). */
      const wmPromise = readWatermark();
      // Mode là một phần của quyền đọc, nên phải kiểm ở MỌI lượt poll. Chỉ
      // nhìn watermark hạng mục sẽ bỏ sót lúc Admin đổi preview → enforced.
      permissionContext = await readItemPermissionContext();
      if (requestId !== dataRequestRef.current) return;
      const previousMode = permissionModeRef.current;
      const identityChanged = permissionUserRef.current !== ""
        && permissionUserRef.current !== permissionContext.userId;
      const modeChanged = previousMode !== null && previousMode !== permissionContext.mode;
      const policy = permissionDataPolicy(permissionContext.mode, previousMode);
      permissionModeRef.current = permissionContext.mode;
      permissionUserRef.current = permissionContext.userId;

      if (identityChanged || modeChanged || policy.revokeBeforeFetch) {
        clearProtectedData();
      }

      let wm: Watermark | null;
      let prefetchedData: Awaited<ReturnType<typeof fetchVmpDataFromSupabase>> | null = null;
      if (policy.bypassWatermark) {
        // Enforced vẫn tải payload ngay; Promise.all chỉ gom điểm commit để
        // watermark và payload cùng chịu một generation check.
        [wm, prefetchedData] = await Promise.all([
          wmPromise,
          fetchVmpDataFromSupabase(new Date().getFullYear()),
        ]);
      } else {
        wm = await wmPromise;
      }
      if (requestId !== dataRequestRef.current) return;
      if (wm?.updated_at) setDataUpdatedAt(wm.updated_at);

      if (!policy.bypassWatermark && !identityChanged && !modeChanged) {
        // Preview giữ tối ưu cũ: dữ liệu không đổi thì không kéo payload nặng.
        if (wm) {
          const ws = wmSig(wm);
          if (ws === wmSigRef.current) {
            setConn((current) => silentRefreshSuccessConn(current));
            return;
          }
          wmSigRef.current = ws;
        }
      }

      // Enforced luôn đi qua RPC đã lọc quyền: thu hồi phân công phải phản ánh
      // dù updated_at/count của dữ liệu nghiệp vụ không đổi.
      const data = prefetchedData ?? await fetchVmpDataFromSupabase(new Date().getFullYear());
      if (requestId !== dataRequestRef.current) return;
      const sig = sigOf(data.objects, data.activities);
      // Chốt chặn 2: nếu payload y hệt thì bỏ qua setState (tránh re-render).
      if (sig === dataSigRef.current) {
        setConn((current) => silentRefreshSuccessConn(current));
        return;
      }
      dataSigRef.current = sig;
      if (Array.isArray(data.objects)) setObjects(data.objects);
      if (Array.isArray(data.activities)) setActs(data.activities);
      if (policy.allowSnapshot) {
        saveSnapshot(
          new Date().getFullYear(),
          permissionContext.userId,
          permissionContext.mode,
          data.objects || [],
          data.activities || [],
        );
      } else {
        clearSnapshot();
      }
      setLastSync(Date.now());
      setConn((current) => silentRefreshSuccessConn(current, {
        objects: data.objects.length,
        activities: data.activities.length,
      }));
    } catch (cause) {
      if (requestId !== dataRequestRef.current) return;
      // Không đọc được mode cũng không được phép đoán là preview. Thu hồi dữ
      // liệu cũ để lỗi mạng/quyền không biến thành đường fail-open.
      permissionModeRef.current = null;
      permissionUserRef.current = "";
      clearProtectedData();
      const message = cause instanceof Error ? cause.message : "lỗi không xác định";
      setConn((current) => ({
        ...current,
        status: "err",
        source: "supabase",
        msg: `Không thể làm mới dữ liệu an toàn — dữ liệu cũ đã được thu hồi. ${message}. Thử lại để nạp lại quyền và dữ liệu.`,
      }));
    }
  }, [clearProtectedData, readWatermark]);

  /* Chỉ nạp dữ liệu khi ĐÃ CÓ PHIÊN. Từ migration 20260801090000, vai
     `anon` không gọi được hàm rpc_* nào, nên gọi lúc chưa đăng nhập chỉ
     tạo ra một lỗi 401 trong console — vô hại nhưng gây nhiễu, mà console
     nhiễu thì lỗi thật sau này chìm trong đó. Chờ có phiên rồi mới gọi. */
  useEffect(() => {
    let con = true;
    const thu = async () => {
      const c = loadConn();
      if (c?.readUrl && !supabase) { connectSheet(c.readUrl, c?.writeUrl || ""); return; }
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      if (!con) return;
      if (data.session) { connectSheet(c?.readUrl || "", c?.writeUrl || ""); return; }
      /* Không có phiên → không gọi RPC (đúng), nhưng PHẢI nói ra. Bản trước
         lặng lẽ không làm gì, để banner đứng ở "Đang chờ đồng bộ…" — một câu
         hàm ý "chờ tí nữa là có", trong khi sự thật là sẽ không bao giờ có.
         useAuth ở trên sẽ đưa về màn đăng nhập; dòng này lo trường hợp còn
         kịp nhìn thấy banner, để lý do hiện ra thay vì phải đoán. */
      setConn((cu) => ({
        ...cu, status: "err",
        msg: "Phiên đăng nhập đã hết hạn — đăng nhập lại để tải dữ liệu.",
      }));
    };
    thu();
    /* Đăng nhập xong thì nạp ngay, không bắt người dùng bấm "Làm mới". */
    const { data: sub } = supabase
      ? supabase.auth.onAuthStateChange((sk) => {
        if (con && sk === "SIGNED_IN") {
          const c = loadConn();
          connectSheet(c?.readUrl || "", c?.writeUrl || "");
        } else if (con && sk === "SIGNED_OUT") {
          permissionModeRef.current = null;
          permissionUserRef.current = "";
          clearProtectedData(true);
        }
      })
      : { data: { subscription: null } };
    return () => { con = false; sub?.subscription?.unsubscribe(); };
  }, [clearProtectedData, connectSheet]);

  // ============================================================
  // REALTIME: tự cập nhật khi bảng vmp_plan_items đổi ở Supabase
  // (cần bật Realtime cho bảng — xem migration 007)
  // ============================================================
  const refreshRef = useRef(silentRefresh);
  useEffect(() => { refreshRef.current = silentRefresh; }, [silentRefresh]);

  useEffect(() => {
    if (!supabase) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const debounced = () => {
      clearTimeout(timer);
      timer = setTimeout(() => refreshRef.current?.(), 800);
    };

    /* MỘT BẢNG HỎNG KHÔNG ĐƯỢC KÉO SẬP CẢ KÊNH (sửa 17/08).
     *
     * Bản trước gộp ba bảng vào một kênh "vmp-changes". `system_config`
     * KHÔNG nằm trong publication `supabase_realtime` (chỉ có
     * vmp_plan_items và vmp_objects), nên máy chủ trả:
     *
     *   "Unable to subscribe to changes with given parameters …
     *    table: system_config"  → status: error
     *
     * Realtime đánh lỗi cho CẢ KÊNH, không riêng tham số hỏng. Hệ quả:
     * hai bảng nghiệp vụ tuy đã bật Realtime vẫn không gửi được sự kiện
     * nào, và web rơi hết về polling 20 giây — đúng triệu chứng "cập nhật
     * chậm" mà chủ dự án báo 17/08.
     *
     * Vì vậy: hai bảng nghiệp vụ đi một kênh riêng, system_config đi kênh
     * riêng của nó. Nếu system_config vẫn chưa bật Realtime thì chỉ kênh
     * ấy lỗi, luồng dữ liệu chính không hề gì. */
    const kenhDuLieu = supabase
      .channel("vmp-du-lieu")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "vmp_plan_items" },
        debounced
      )
      .on("postgres_changes",
        { event: "*", schema: "public", table: "vmp_objects" },
        debounced
      )
      .subscribe();

    /* Kênh phụ: đổi chế độ phân quyền. Được phép hỏng mà không ảnh hưởng
     * dữ liệu — polling 20s vẫn bắt kịp việc đổi mode. */
    const kenhCauHinh = supabase
      .channel("vmp-cau-hinh")
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "system_config", filter: "key=eq.item_permissions_mode" },
        debounced
      )
      .subscribe();

    // Backup polling mỗi 20s — đảm bảo web cập nhật nhanh kể cả khi Realtime lỡ.
    // silentRefresh giờ so WATERMARK trước (query vài byte) nên poll gần như miễn
    // phí; chỉ kéo cả payload khi count/updated_at thật sự đổi.
    const poll = setInterval(() => refreshRef.current?.(), 20000);

    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      supabase?.removeChannel(kenhDuLieu);
      supabase?.removeChannel(kenhCauHinh);
    };
  }, []);

  /* ---- GHI ----------------------------------------------------------
   * Trước 2026-07-29 mọi thao tác ghi đều bị chặn vì Google Sheet là nguồn
   * chuẩn. Nay Supabase là nơi lưu dữ liệu chính và web là nơi nhập liệu,
   * nên các hàm này gọi thẳng RPC. Quyền do server kiểm (SECURITY DEFINER
   * đọc role/bộ phận từ profiles) — client không tự quyết định được.
   * ------------------------------------------------------------------- */
  const runWrite = useCallback(async <T,>(
    label: string,
    fn: () => Promise<T>,
  ): Promise<T | { ok: false; error: string }> => {
    setSaveStatus("saving");
    try {
      const res = await fn();
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 2500);
      refreshRef.current?.();          // kéo lại dữ liệu để giao diện khớp DB
      return res;
    } catch (e) {
      const msg = `${label} thất bại: ${(e as Error).message || "không rõ"}`;
      setSaveStatus("error");
      setConn((c) => ({ ...c, msg }));
      setTimeout(() => setSaveStatus(""), 5000);
      return { ok: false, error: msg };
    }
  }, []);

  /** Chữ ký khớp UpdatePage: (mã, form, tênNgườiDùng, lýDo, versionKỳVọng).
   *  Tham số userName không dùng — server tự lấy người ghi theo JWT. */
  const updateActivity = useCallback(
    (
      validationCode: string,
      form: Record<string, unknown>,
      _userName?: string,
      reason?: string,
      expectedVersion?: number,
    ) => runWrite("Cập nhật tiến độ", () =>
      updateItemProgress(validationCode, form, reason, expectedVersion)),
    [runWrite],
  );
  const saveObject = useCallback(
    (obj: Parameters<typeof upsertObjectSupabase>[0]) =>
      runWrite("Lưu đối tượng", () => upsertObjectSupabase(obj)),
    [runWrite],
  );
  /* deleteObject đã GỠ cùng deleteSourceObject (Đợt B Task 6): ngừng dùng
     một đối tượng nay là tắt is_active qua rpc_save_catalog_object. */

  return {
    objects, acts: enriched, conn, lastSync, dataUpdatedAt, saveStatus,
    connectSheet, reloadData, silentRefresh, updateActivity,
    saveObject, setConn,
  };
}

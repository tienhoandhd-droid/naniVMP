/* =====================================================================
 *  ToastProvider — một chỗ duy nhất báo thành công / thất bại
 *  ---------------------------------------------------------------------
 *  Trước đó toast là một khối JSX nằm thẳng trong App.tsx, điều khiển bằng
 *  đúng một state `saveStatus` của luồng lưu tiến độ. Hệ quả: mọi thao tác
 *  ghi ở màn Dữ liệu nguồn đóng hộp thoại rồi im lặng — người dùng không
 *  biết đã lưu chưa, và cách duy nhất để chắc là bấm Làm mới rồi tự dò lại
 *  bảng. Với hồ sơ GMP thì "không biết đã ghi chưa" là trạng thái tệ nhất.
 *
 *  Luật hàng đợi nằm ở `src/lib/toastQueue.ts` — kiểm được bằng node --test
 *  mà không cần dựng trình duyệt. Ở đây chỉ vẽ và hẹn giờ.
 *
 *  Trợ năng: từng toast tự mang ngữ nghĩa thông báo — `role="status"` cho
 *  trạng thái thường và `role="alert"` cho lỗi cần đọc ngay — tránh vùng
 *  chứa live-region lồng nhau. Toast lỗi bấm tắt được — đọc xong rồi mà nó
 *  còn nằm đó che nội dung là phiền.
 * ===================================================================== */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, Check, Loader, X } from "lucide-react";

import { boToast, chotToast, themToast, thoiLuongToast } from "../../lib/toastQueue.ts";
import type { LoaiToast, Toast } from "../../lib/toastQueue.ts";

export interface HanhDongToast {
  nhan: string;
  thucHien(): void;
}

export interface ToastHandle {
  dismiss(): void;
}

/** Registry tách khỏi React để thao tác recovery có semantics consume-once. */
export function createToastActionRegistry() {
  const callbacks = new Map<string, () => void>();
  return {
    register(id: string, callback: () => void) { callbacks.set(id, callback); },
    consume(id: string) {
      const callback = callbacks.get(id);
      callbacks.delete(id);
      return callback;
    },
    dismiss(id: string) { callbacks.delete(id); },
    clear() { callbacks.clear(); },
  };
}

export interface BoToast {
  thanhCong(noiDung: string): ToastHandle;
  loi(noiDung: string, hanhDong?: HanhDongToast): ToastHandle;
  canhBao(noiDung: string): ToastHandle;
  /** Thao tác dài: mở toast "đang chạy", chốt bằng `xong` hoặc `hong`. */
  dangChay(noiDung: string): {
    dismiss(): void;
    xong(noiDung: string): void;
    hong(noiDung: string, hanhDong?: HanhDongToast): void;
  };
}

const Ctx = createContext<BoToast | null>(null);
const HANDLE_IM_LANG: ToastHandle = { dismiss: () => {} };

/* Gọi ngoài provider thì không nổ, chỉ im lặng. Một component tách ra kiểm
   riêng không nên chết chỉ vì thiếu vỏ thông báo bọc ngoài. */
const IM_LANG: BoToast = {
  thanhCong: () => HANDLE_IM_LANG,
  loi: () => HANDLE_IM_LANG,
  canhBao: () => HANDLE_IM_LANG,
  dangChay: () => ({ ...HANDLE_IM_LANG, xong: () => {}, hong: () => {} }),
};

export function useToast(): BoToast {
  return useContext(Ctx) ?? IM_LANG;
}

/** Dành cho producer có vòng đời ngắn: tháo component sẽ thu hồi toast và
 * callback của chính nó, trong khi provider toàn app vẫn tiếp tục sống. */
export function useScopedToast(): BoToast {
  const toast = useToast();
  const handles = useRef<Set<ToastHandle>>(new Set());
  useEffect(() => () => {
    handles.current.forEach((handle) => handle.dismiss());
    handles.current.clear();
  }, []);
  return useMemo(() => {
    const own = <T extends ToastHandle>(handle: T): T => {
      handles.current.add(handle);
      return handle;
    };
    return {
      thanhCong: (noiDung) => own(toast.thanhCong(noiDung)),
      loi: (noiDung, action) => own(toast.loi(noiDung, action)),
      canhBao: (noiDung) => own(toast.canhBao(noiDung)),
      dangChay: (noiDung) => own(toast.dangChay(noiDung)),
    };
  }, [toast]);
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [ds, setDs] = useState<Toast[]>([]);
  const dem = useRef(0);
  const hen = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const hanhDong = useRef(createToastActionRegistry());
  const hanhDongTheoToast = useRef<Map<string, string>>(new Map());
  const toastDangSong = useRef<Set<string>>(new Set());

  const huyHen = useCallback((id: string) => {
    const h = hen.current.get(id);
    if (h) {
      clearTimeout(h);
      hen.current.delete(id);
    }
  }, []);

  const huyHanhDong = useCallback((toastId: string) => {
    const actionId = hanhDongTheoToast.current.get(toastId);
    if (actionId) hanhDong.current.dismiss(actionId);
    hanhDongTheoToast.current.delete(toastId);
  }, []);

  const bo = useCallback((toastId: string) => {
    toastDangSong.current.delete(toastId);
    huyHen(toastId);
    huyHanhDong(toastId);
    setDs((cu) => boToast(cu, toastId));
  }, [huyHanhDong, huyHen]);

  const datHen = useCallback((toast: Toast) => {
    const { id } = toast;
    huyHen(id);
    const ms = thoiLuongToast(toast);
    if (!ms) return;                       // 0 = chờ chốt, không tự tắt
    hen.current.set(id, setTimeout(() => {
      setDs((cu) => {
        return boToast(cu, id);
      });
      toastDangSong.current.delete(id);
      huyHanhDong(id);
      hen.current.delete(id);
    }, ms));
  }, [huyHanhDong, huyHen]);

  /* Dọn hẹn giờ khi provider tháo: timer còn sống sẽ setState lên cây đã gỡ
     và React kêu rò rỉ — mà đó cũng là rò rỉ thật. */
  useEffect(() => {
    const dsHen = hen.current;
    return () => {
      dsHen.forEach(clearTimeout);
      dsHen.clear();
      hanhDong.current.clear();
      hanhDongTheoToast.current.clear();
      toastDangSong.current.clear();
    };
  }, []);

  const api = useMemo<BoToast>(() => {
    const taoHanhDong = (toastId: string, toastAction?: HanhDongToast) => {
      huyHanhDong(toastId);
      if (!toastAction) return undefined;
      const id = `a${++dem.current}`;
      hanhDong.current.register(id, toastAction.thucHien);
      hanhDongTheoToast.current.set(toastId, id);
      return { id, nhan: toastAction.nhan };
    };
    const boToastDaBiCap = (cu: readonly Toast[], moi: readonly Toast[]) => {
      for (const toast of cu) {
        if (moi.some((t) => t.id === toast.id)) continue;
        toastDangSong.current.delete(toast.id);
        huyHen(toast.id);
        huyHanhDong(toast.id);
      }
    };
    const mo = (loai: LoaiToast, noiDung: string, toastAction?: HanhDongToast) => {
      const id = `t${++dem.current}`;
      toastDangSong.current.add(id);
      const action = taoHanhDong(id, toastAction);
      const toast = { id, loai, noiDung, hanhDong: action };
      setDs((cu) => {
        const moi = themToast(cu, toast);
        boToastDaBiCap(cu, moi);
        return moi;
      });
      datHen(toast);
      return { id, handle: { dismiss: () => bo(id) } };
    };
    return {
      thanhCong: (n) => mo("thanhCong", n).handle,
      loi: (n, a) => mo("loi", n, a).handle,
      canhBao: (n) => mo("canhBao", n).handle,
      dangChay: (n) => {
        const { id, handle } = mo("dang", n);
        const chot = (loai: LoaiToast, noiDung: string, toastAction?: HanhDongToast) => {
          if (!toastDangSong.current.has(id)) return;
          const action = taoHanhDong(id, toastAction);
          const toast = { id, loai, noiDung, hanhDong: action };
          setDs((cu) => {
            const moi = chotToast(cu, id, loai, noiDung, action);
            boToastDaBiCap(cu, moi);
            return moi;
          });
          datHen(toast);
        };
        return {
          dismiss: handle.dismiss,
          xong: (noiDung: string) => chot("thanhCong", noiDung),
          hong: (noiDung: string, a?: HanhDongToast) => chot("loi", noiDung, a),
        };
      },
    };
  }, [bo, datHen, huyHanhDong, huyHen]);

  const chayHanhDong = useCallback((toast: Toast) => {
    if (!toast.hanhDong) return;
    const thucHien = hanhDong.current.consume(toast.hanhDong.id);
    bo(toast.id);
    thucHien?.();
  }, [bo]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="vmp-toast-vung">
        {ds.map((t) => (
          <div
            key={t.id}
            className={`vmp-toast vmp-toast--${t.loai}`}
            data-vmp-toast={t.loai}
            role={t.loai === "loi" ? "alert" : "status"}
          >
            <span className="vmp-toast__icon" aria-hidden="true">
              {t.loai === "dang" ? <Loader size={16} />
                : t.loai === "thanhCong" ? <Check size={16} />
                  : <AlertTriangle size={16} />}
            </span>
            <span className="vmp-toast__chu">{t.noiDung}</span>
            {t.hanhDong && (
              <button type="button" className="vmp-toast__hanh-dong" onClick={() => chayHanhDong(t)}>
                {t.hanhDong.nhan}
              </button>
            )}
            {t.loai !== "dang" && (
              <button
                type="button"
                className="vmp-toast__tat"
                aria-label="Đóng thông báo"
                onClick={() => bo(t.id)}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

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

export interface BoToast {
  thanhCong(noiDung: string): void;
  loi(noiDung: string, hanhDong?: HanhDongToast): void;
  canhBao(noiDung: string): void;
  /** Thao tác dài: mở toast "đang chạy", chốt bằng `xong` hoặc `hong`. */
  dangChay(noiDung: string): {
    xong(noiDung: string): void;
    hong(noiDung: string, hanhDong?: HanhDongToast): void;
  };
}

const Ctx = createContext<BoToast | null>(null);

/* Gọi ngoài provider thì không nổ, chỉ im lặng. Một component tách ra kiểm
   riêng không nên chết chỉ vì thiếu vỏ thông báo bọc ngoài. */
const IM_LANG: BoToast = {
  thanhCong: () => {},
  loi: () => {},
  canhBao: () => {},
  dangChay: () => ({ xong: () => {}, hong: () => {} }),
};

export function useToast(): BoToast {
  return useContext(Ctx) ?? IM_LANG;
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [ds, setDs] = useState<Toast[]>([]);
  const dem = useRef(0);
  const hen = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const hanhDong = useRef<Map<string, () => void>>(new Map());

  const huyHen = useCallback((id: string) => {
    const h = hen.current.get(id);
    if (h) {
      clearTimeout(h);
      hen.current.delete(id);
    }
  }, []);

  const bo = useCallback((toast: Toast) => {
    huyHen(toast.id);
    if (toast.hanhDong) hanhDong.current.delete(toast.hanhDong.id);
    setDs((cu) => boToast(cu, toast.id));
  }, [huyHen]);

  const datHen = useCallback((toast: Toast) => {
    const { id } = toast;
    huyHen(id);
    const ms = thoiLuongToast(toast);
    if (!ms) return;                       // 0 = chờ chốt, không tự tắt
    hen.current.set(id, setTimeout(() => {
      setDs((cu) => {
        const cuToast = cu.find((t) => t.id === id);
        if (cuToast?.hanhDong) hanhDong.current.delete(cuToast.hanhDong.id);
        return boToast(cu, id);
      });
      hen.current.delete(id);
    }, ms));
  }, [huyHen]);

  /* Dọn hẹn giờ khi provider tháo: timer còn sống sẽ setState lên cây đã gỡ
     và React kêu rò rỉ — mà đó cũng là rò rỉ thật. */
  useEffect(() => {
    const dsHen = hen.current;
    return () => {
      dsHen.forEach(clearTimeout);
      dsHen.clear();
      hanhDong.current.clear();
    };
  }, []);

  const api = useMemo<BoToast>(() => {
    const taoHanhDong = (toastAction?: HanhDongToast) => {
      if (!toastAction) return undefined;
      const id = `a${++dem.current}`;
      hanhDong.current.set(id, toastAction.thucHien);
      return { id, nhan: toastAction.nhan };
    };
    const boToastDaBiCap = (cu: readonly Toast[], moi: readonly Toast[]) => {
      for (const toast of cu) {
        if (moi.some((t) => t.id === toast.id)) continue;
        huyHen(toast.id);
        if (toast.hanhDong) hanhDong.current.delete(toast.hanhDong.id);
      }
    };
    const mo = (loai: LoaiToast, noiDung: string, toastAction?: HanhDongToast) => {
      const id = `t${++dem.current}`;
      const action = taoHanhDong(toastAction);
      const toast = { id, loai, noiDung, hanhDong: action };
      setDs((cu) => {
        const moi = themToast(cu, toast);
        boToastDaBiCap(cu, moi);
        return moi;
      });
      datHen(toast);
      return id;
    };
    return {
      thanhCong: (n) => { mo("thanhCong", n); },
      loi: (n, a) => { mo("loi", n, a); },
      canhBao: (n) => { mo("canhBao", n); },
      dangChay: (n) => {
        const id = mo("dang", n);
        const chot = (loai: LoaiToast, noiDung: string, toastAction?: HanhDongToast) => {
          const action = taoHanhDong(toastAction);
          const toast = { id, loai, noiDung, hanhDong: action };
          setDs((cu) => {
            const toastCu = cu.find((t) => t.id === id);
            if (toastCu?.hanhDong && toastCu.hanhDong.id !== action?.id) {
              hanhDong.current.delete(toastCu.hanhDong.id);
            }
            const moi = chotToast(cu, id, loai, noiDung, action);
            boToastDaBiCap(cu, moi);
            return moi;
          });
          datHen(toast);
        };
        return {
          xong: (noiDung: string) => chot("thanhCong", noiDung),
          hong: (noiDung: string, a?: HanhDongToast) => chot("loi", noiDung, a),
        };
      },
    };
  }, [datHen, huyHen]);

  const chayHanhDong = useCallback((toast: Toast) => {
    if (!toast.hanhDong) return;
    const thucHien = hanhDong.current.get(toast.hanhDong.id);
    bo(toast);
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
                onClick={() => bo(t)}
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

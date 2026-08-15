/* =====================================================================
 *  DirtyStateProvider — sổ "form nào đang có thay đổi chưa lưu"
 *  ---------------------------------------------------------------------
 *  Một chỗ duy nhất biết còn form nào đang dở. Nhờ đó nút Thoát ở shell
 *  hỏi lại trước khi rời đi, thay vì im lặng vứt mất phần người dùng vừa
 *  gõ — chuyện đặc biệt khó chịu với form nhập liệu GMP dài.
 *
 *  Sổ này CHỈ giữ trạng thái. Nó không tự hiện chữ, không gọi
 *  `window.confirm`. Ai muốn hỏi thì tự dựng hộp thoại của mình: gộp cả
 *  hai vào đây thì mỗi nơi cần một câu hỏi khác lại phải sửa chính sổ.
 * ===================================================================== */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { summarizeDirty, updateDirtyRegistry } from "./dialogState.ts";

interface DirtyContextValue {
  dat: (khoa: string, ban: boolean) => void;
  reg: ReadonlySet<string>;
}

const DirtyContext = createContext<DirtyContextValue | null>(null);

export function DirtyStateProvider({ children }: { children?: ReactNode }) {
  const [reg, setReg] = useState<ReadonlySet<string>>(() => new Set<string>());

  const dat = useCallback((khoa: string, ban: boolean) => {
    setReg((cu) => {
      const dangCo = cu.has(khoa);
      if (dangCo === ban) return cu;          // không đổi thì không render lại
      return updateDirtyRegistry(cu, khoa, ban);
    });
  }, []);

  const gt = useMemo(() => ({ dat, reg }), [dat, reg]);
  return <DirtyContext.Provider value={gt}>{children}</DirtyContext.Provider>;
}

/**
 * Đăng ký một form vào sổ.
 *
 * Tự gỡ đăng ký khi component biến mất — nếu không, đóng form rồi mà sổ
 * vẫn nhớ nó đang dở, và nút Thoát hỏi mãi một câu vô nghĩa.
 */
export function useRegisterDirtyState(khoa: string, dirty: boolean): void {
  const ctx = useContext(DirtyContext);
  useEffect(() => {
    if (!ctx) return undefined;
    ctx.dat(khoa, dirty);
    return () => ctx.dat(khoa, false);
  }, [ctx, khoa, dirty]);
}

/** Đọc trạng thái sổ. Ngoài Provider thì trả "không có gì dở". */
export function useDirtyStateSnapshot(): { hasDirty: boolean; keys: string[] } {
  const ctx = useContext(DirtyContext);
  return useMemo(
    () => summarizeDirty(ctx?.reg ?? new Set<string>()),
    [ctx?.reg],
  );
}

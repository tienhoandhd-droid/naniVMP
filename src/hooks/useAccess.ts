/* Quyền màn hình là fail-closed: chưa có payload hợp lệ từ server thì không
 * màn nào được mở. Không dựng quyền từ profile, role đăng nhập, hay cache. */
import { useCallback, useEffect, useRef, useState } from "react";
import { parseAccessContext } from "../lib/access.ts";
import type { AccessContext } from "../lib/access.ts";
import { fetchUiAccess } from "../lib/supabaseData.ts";
import type { AppUser } from "../types/domain.ts";

export interface AccessState {
  access: AccessContext;
  dangTai: boolean;
  loi: string | null;
  taiLai: () => void;
}

const KHONG_QUYEN = parseAccessContext(null);

/** Generation gate for access RPCs. It makes an identity change observable
 * before effects run and rejects both late success and late error handlers
 * from the previous identity. */
export class AccessRequestGate {
  #identity = "";
  #generation = 0;

  ensureIdentity(identity: string): boolean {
    if (this.#identity === identity) return false;
    this.#identity = identity;
    this.#generation += 1;
    return true;
  }

  begin(identity: string): number {
    this.ensureIdentity(identity);
    this.#generation += 1;
    return this.#generation;
  }

  isCurrent(generation: number): boolean {
    return generation === this.#generation;
  }

  invalidate(generation: number): void {
    if (this.isCurrent(generation)) this.#generation += 1;
  }

  zeroAccess(): AccessContext { return KHONG_QUYEN; }
}

function dauVanTay(user: AppUser | null): string {
  return [user?.uid ?? "", user?.role ?? "", user?.accessClass ?? ""].join("|");
}

export function useAccess(user: AppUser | null): AccessState {
  const identity = dauVanTay(user);
  const [access, setAccess] = useState<AccessContext>(KHONG_QUYEN);
  const [dangTai, setDangTai] = useState(Boolean(user?.uid));
  const [loi, setLoi] = useState<string | null>(null);
  const [lanTai, setLanTai] = useState(0);
  const gateRef = useRef(new AccessRequestGate());

  /* Render đầu tiên sau khi đổi danh tính trả zero access ngay lập tức;
   * effect bên dưới chỉ được phép cấp lại sau RPC của danh tính MỚI. */
  const doiDanhTinh = gateRef.current.ensureIdentity(identity);

  useEffect(() => {
    const generation = gateRef.current.begin(identity);
    if (!user?.uid) {
      setAccess(KHONG_QUYEN);
      setDangTai(false);
      setLoi(null);
      return undefined;
    }

    setAccess(KHONG_QUYEN);
    setDangTai(true);
    setLoi(null);

    void fetchUiAccess()
      .then((ketQua) => {
        if (!gateRef.current.isCurrent(generation)) return;
        if (ketQua.trangThai !== "co") {
          setAccess(KHONG_QUYEN);
          setLoi(ketQua.trangThai === "chua_co_rpc"
            ? "Máy chủ chưa trả được quyền màn hình."
            : ketQua.thongDiep);
          return;
        }

        const tuServer = parseAccessContext(ketQua.payload);
        if (!tuServer.businessRole) {
          setAccess(KHONG_QUYEN);
          setLoi("Máy chủ trả quyền không hợp lệ hoặc tài khoản chưa được phân loại.");
          return;
        }
        setAccess(tuServer);
      })
      .catch((error: unknown) => {
        if (!gateRef.current.isCurrent(generation)) return;
        setAccess(KHONG_QUYEN);
        setLoi(error instanceof Error ? error.message : "Không đọc được quyền màn hình.");
      })
      .finally(() => {
        if (gateRef.current.isCurrent(generation)) setDangTai(false);
      });

    return () => { gateRef.current.invalidate(generation); };
  }, [identity, lanTai, user?.uid]);

  const taiLai = useCallback(() => setLanTai((truoc) => truoc + 1), []);
  if (doiDanhTinh) return { access: KHONG_QUYEN, dangTai: Boolean(user?.uid), loi: null, taiLai };
  return { access, dangTai, loi, taiLai };
}

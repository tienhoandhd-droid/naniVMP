/* Quyền màn hình là fail-closed: chưa có payload hợp lệ từ server thì không
 * màn nào được mở. Không dựng quyền từ profile, role đăng nhập, hay cache. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { parseAccessContext } from "../lib/access.ts";
import type { AccessContext } from "../lib/access.ts";
import { clearVmpCache } from "../lib/n8nAdapter.ts";
import { clearSnapshot } from "../lib/snapshotCache.ts";
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

/** Dọn dữ liệu bền ngay tại ranh giới vỏ quyền, trước khi shell đã xác minh
 * có thể mount lại `useVmpData`. Không để snapshot/cache của tuple cũ sống
 * qua đổi role/accessClass cùng một UID hoặc qua lỗi đọc quyền. */
export function useAccessCacheTransition(user: AppUser | null, state: AccessState): void {
  const identity = dauVanTay(user);
  const daXacMinh = useRef<string | null>(null);

  useLayoutEffect(() => {
    const doiDanhTinh = daXacMinh.current !== null && daXacMinh.current !== identity;
    if (!user?.uid) {
      clearSnapshot();
      clearVmpCache();
      daXacMinh.current = null;
      return;
    }
    if (doiDanhTinh) {
      clearSnapshot();
      clearVmpCache();
      /* Ghi tuple MỚI ngay trong commit loading. Lần commit verified kế tiếp
       * sẽ không xem chính B là dữ liệu cũ rồi xóa snapshot của B lần nữa. */
      daXacMinh.current = identity;
      return;
    }
    if (state.loi) {
      clearSnapshot();
      clearVmpCache();
      return;
    }
    if (!state.dangTai && state.access.businessRole) daXacMinh.current = identity;
  }, [identity, user?.uid, state.access.businessRole, state.dangTai, state.loi]);
}

export function useAccess(
  user: AppUser | null,
  readUiAccess: typeof fetchUiAccess = fetchUiAccess,
): AccessState {
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

    void readUiAccess()
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
  }, [identity, lanTai, user?.uid, readUiAccess]);

  const taiLai = useCallback(() => setLanTai((truoc) => truoc + 1), []);
  if (doiDanhTinh) return { access: KHONG_QUYEN, dangTai: Boolean(user?.uid), loi: null, taiLai };
  return { access, dangTai, loi, taiLai };
}

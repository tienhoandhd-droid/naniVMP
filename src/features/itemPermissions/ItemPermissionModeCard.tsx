/* =====================================================================
 *  ItemPermissionModeCard — công tắc DỰ THẢO ⇄ ÁP DỤNG THẬT
 *  ---------------------------------------------------------------------
 *  Quyền theo hạng mục sinh ra ở chế độ `preview`: luật đã tính đủ, ai
 *  được xem gì đã hiện ra bảng, nhưng RLS chưa chặn ai cả. Bật sang
 *  `enforced` là từ giây đó dữ liệu thật sự bị khoá theo phân công.
 *
 *  Vì sao có màn hình này: RPC `rpc_set_item_permissions_mode` đã nằm ở
 *  server từ lâu mà KHÔNG một chỗ nào trên web gọi tới. Kết quả là băng
 *  "DỰ THẢO — CHƯA ÁP DỤNG QUYỀN THẬT" nằm đó mãi, và cách duy nhất để
 *  bật là chạy SQL tay — thứ không ai muốn làm trên hệ đã ban hành.
 *
 *  Ba chốt trước khi bật, theo đúng thứ tự người ký hồ sơ cần:
 *    1. tiền kiểm phải 0 lỗi bắt buộc — còn lỗi thì nút không bật được;
 *    2. nhập lý do, câu này đi thẳng vào nhật ký kiểm toán;
 *    3. một hộp xác nhận nói rõ hậu quả, không phải "Bạn có chắc không?".
 *
 *  Biên chặn thật vẫn ở RPC: giấu nút chỉ để đỡ nhầm tay. Nút hiện ra
 *  không có nghĩa người bấm đủ quyền — server mới là nơi trả lời.
 * ===================================================================== */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Eye, Loader, ShieldCheck } from "lucide-react";

import { useToast } from "../../components/ui/ToastProvider.tsx";
import { Card } from "../../components/ui/Primitives.tsx";
import SmartTable from "../../components/ui/SmartTable.tsx";
import type { SmartTableColumn } from "../../components/ui/SmartTable.tsx";
import {
  fetchEffectiveRights,
  fetchPermissionPreflight,
  searchPermissionDirectory,
  setItemPermissionsMode,
} from "./api.ts";
import { visibleSortedDirectoryPeople } from "./accountListModel.ts";
import { ACCESS_CLASSES } from "./types.ts";
import type { DirectoryPerson, PermissionIssue, PermissionPreflight } from "./types.ts";

/** Người dùng phải gõ đúng chữ này mới bật được — chống bấm nhầm trên một
 *  công tắc đổi quyền của cả hệ thống. Chữ ngắn, gõ được bằng bàn phím
 *  tiếng Việt không dấu, và nói đúng việc đang làm. */
const CHU_XAC_NHAN = "AP DUNG";

/** Nhãn phân loại quyền hiển thị dùng chung với danh bạ; giữ nguyên chuỗi
 *  thô cho các access_class cũ (legacy) không còn trong bảng. */
function nhanVaiTro(nguoi: DirectoryPerson): string {
  if (!nguoi.access_class) return "Chưa phân loại";
  return ACCESS_CLASSES.find((item) => item.id === nguoi.access_class)?.label ?? nguoi.access_class;
}

/** Đo song song tối đa ngần này người một lúc. Nã hàng chục RPC cùng lúc
 *  lên Supabase là tự gây nghẽn; chờ tuần tự từng người thì với vài chục
 *  người trong danh bạ, người xem tưởng màn hình bị treo. */
const GIOI_HAN_SONG_SONG_DO_ANH_HUONG = 4;

/** Danh sách đo ảnh hưởng chỉ giữ performer còn làm việc và không còn gắn
 * với tài khoản đã bị vô hiệu hóa. Giữ chung quy tắc hiển thị của danh bạ
 * để bảng xem trước không vô tình đưa một tài khoản đã ẩn trở lại. */
export function prepareImpactDirectoryPeople(
  people: readonly DirectoryPerson[],
): DirectoryPerson[] {
  return visibleSortedDirectoryPeople(people).filter((person) => person.is_active);
}

interface DongAnhHuong {
  nguoi: DirectoryPerson;
  soXem: number;
  soSua: number;
  /** null = đo được bình thường; có chữ = RPC lỗi cho riêng người này. */
  loi: string | null;
}

/** Chạy `worker` trên từng phần tử của `items`, tối đa `gioiHan` lời gọi
 *  cùng lúc; gọi `baoXong` ngay sau mỗi phần tử xong để cập nhật tiến độ.
 *  Không có await nào chen giữa lúc đọc và tăng `conLai` nên vẫn an toàn
 *  dù chạy trong nhiều "luồng" async song song (JS đơn luồng thật sự). */
async function chayTheoLo<T, R>(
  items: readonly T[],
  gioiHan: number,
  worker: (item: T) => Promise<R>,
  baoXong: () => void,
): Promise<R[]> {
  const ketQua: R[] = new Array(items.length);
  let conLai = 0;
  const chayMotLuong = async () => {
    while (conLai < items.length) {
      const i = conLai++;
      ketQua[i] = await worker(items[i]);
      baoXong();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(gioiHan, items.length) }, () => chayMotLuong()),
  );
  return ketQua;
}

function DanhSachVanDe({ ten, ds }: { ten: string; ds: PermissionIssue[] }) {
  if (ds.length === 0) return null;
  return (
    <details className="ip-van-de">
      <summary>{ten} ({ds.length})</summary>
      <ul>
        {ds.slice(0, 20).map((v, i) => (
          <li key={`${v.code}-${v.record_id}-${i}`}>
            <b>{v.code}</b> · {v.message}
            {v.record_id ? <span> ({v.record_id})</span> : null}
          </li>
        ))}
      </ul>
      {ds.length > 20 && <p className="ip-help">…và {ds.length - 20} mục nữa.</p>}
    </details>
  );
}

const cotAnhHuong: SmartTableColumn<DongAnhHuong>[] = [
  {
    id: "nguoi",
    header: "Họ tên",
    cell: (h) => (
      <>
        <b>{h.nguoi.full_name}</b>
        {h.nguoi.department ? <div className="ip-muted">{h.nguoi.department}</div> : null}
      </>
    ),
  },
  {
    id: "vai",
    header: "Vai trò / phân loại quyền",
    priority: "supporting",
    cell: (h) => nhanVaiTro(h.nguoi),
  },
  {
    id: "taikhoan",
    header: "Tài khoản",
    align: "center",
    cell: (h) => (h.nguoi.user_id
      ? <span className="ip-badge is-linked">Đã nối</span>
      : <span className="ip-badge is-warning" title="Chưa nối tài khoản đăng nhập nên chưa vào được web">
          Chưa nối
        </span>),
  },
  {
    id: "xem",
    header: "Hạng mục xem được",
    align: "center",
    cell: (h) => (
      h.loi
        ? <span className="ip-badge is-warning" title={h.loi}>Không đo được</span>
        : <span className={`ip-badge ${
          h.soXem > 0 ? "is-linked" : h.nguoi.user_id ? "is-inactive" : "is-warning"
        }`} title={h.soXem === 0 && !h.nguoi.user_id
          ? "Chưa có tài khoản nên vốn đã không xem được — bật hay không cũng vậy"
          : undefined}>{h.soXem}</span>
    ),
  },
  {
    id: "sua",
    header: "Hạng mục sửa được",
    align: "center",
    priority: "supporting",
    cell: (h) => (h.loi ? <span className="ip-muted">—</span> : <span>{h.soSua}</span>),
  },
];

export default function ItemPermissionModeCard() {
  const toast = useToast();
  const [tienKiem, setTienKiem] = useState<PermissionPreflight | null>(null);
  const [dangTai, setDangTai] = useState(true);
  const [lyDo, setLyDo] = useState("");
  const [chuGo, setChuGo] = useState("");
  const [dangDoi, setDangDoi] = useState(false);

  // Xem trước ảnh hưởng khi bật — CHỈ đo lúc người dùng bấm, không tự chạy
  // lúc mở màn (mở màn mà nã hàng chục RPC là tự gây nghẽn cho chính họ).
  const [dangDoAnhHuong, setDangDoAnhHuong] = useState(false);
  const [tienDoDo, setTienDoDo] = useState<{ xong: number; tong: number } | null>(null);
  const [ketQuaAnhHuong, setKetQuaAnhHuong] = useState<DongAnhHuong[] | null>(null);
  const [loiXemTruoc, setLoiXemTruoc] = useState<string | null>(null);

  const xemTruocAnhHuong = useCallback(async () => {
    setDangDoAnhHuong(true);
    setLoiXemTruoc(null);
    setKetQuaAnhHuong(null);
    try {
      const tatCa = await searchPermissionDirectory("");
      // Người đã nghỉ không có hạng mục nào để đo — RPC tự loại theo
      // is_active, đo họ chỉ ra toàn số 0 giả, làm loãng nhóm cảnh báo thật.
      // Cùng lúc, không được đưa trở lại bảng một tài khoản đã vô hiệu hóa.
      const dangHoatDong = prepareImpactDirectoryPeople(tatCa);
      setTienDoDo({ xong: 0, tong: dangHoatDong.length });
      let xong = 0;
      const hang = await chayTheoLo(
        dangHoatDong,
        GIOI_HAN_SONG_SONG_DO_ANH_HUONG,
        async (nguoi): Promise<DongAnhHuong> => {
          try {
            const { rights } = await fetchEffectiveRights({ personId: nguoi.person_id });
            return {
              nguoi,
              soXem: rights.filter((r) => r.can_view).length,
              soSua: rights.filter((r) => r.editable_fields.length > 0).length,
              loi: null,
            };
          } catch (e) {
            // Một người lỗi không được làm hỏng cả bảng — ghi rõ "không đo
            // được" kèm lý do ngắn, những người còn lại vẫn đo bình thường.
            return { nguoi, soXem: 0, soSua: 0, loi: (e as Error).message || "RPC lỗi không rõ lý do" };
          }
        },
        () => { xong += 1; setTienDoDo({ xong, tong: dangHoatDong.length }); },
      );
      hang.sort((a, b) => {
        // Người 0 hạng mục xem được lên đầu — đó là người sẽ mất quyền
        // xem hoàn toàn khi bật. Người "không đo được" xếp ngay sau, vì
        // cũng cần chú ý dù chưa chắc mất quyền. Còn lại theo tên.
        /* Thứ tự nhóm: (0) CÓ tài khoản mà không xem được gì — đây mới là
           người thật sự mất quyền khi bật; (1) đo lỗi; (2) chưa nối tài
           khoản — họ vốn chưa đăng nhập được, bật hay không cũng vậy, nên
           đừng để họ chen lên trên và làm loãng cảnh báo thật; (3) còn lại. */
        const nhom = (h: DongAnhHuong) => {
          if (h.loi) return 1;
          if (h.soXem > 0) return 3;
          return h.nguoi.user_id ? 0 : 2;
        };
        const d = nhom(a) - nhom(b);
        return d !== 0 ? d : a.nguoi.full_name.localeCompare(b.nguoi.full_name, "vi");
      });
      setKetQuaAnhHuong(hang);
    } catch (e) {
      setLoiXemTruoc((e as Error).message || "Không lấy được danh bạ để đo ảnh hưởng");
    } finally {
      setDangDoAnhHuong(false);
      setTienDoDo(null);
    }
  }, []);

  const tai = useCallback(async () => {
    setDangTai(true);
    try {
      setTienKiem(await fetchPermissionPreflight());
    } catch {
      // Tiền kiểm chỉ Admin chạy được; người khác thì thẻ tự ẩn (xem dưới).
      setTienKiem(null);
    } finally {
      setDangTai(false);
    }
  }, []);

  useEffect(() => { void tai(); }, [tai]);

  if (dangTai) {
    return (
      <Card variant="strong">
        <p className="ip-help" role="status">
          <Loader size={14} aria-hidden="true" /> Đang chạy tiền kiểm phân quyền…
        </p>
      </Card>
    );
  }
  if (!tienKiem) {
    /* Tiền kiểm hỏng hoặc không đủ quyền chạy: ẩn hẳn thẻ. Hiện một khối
       lỗi đỏ ở đây chỉ làm người xem lo, trong khi họ không làm gì được —
       và bản thân việc bật quyền vốn không phải việc của họ. */
    return null;
  }

  const dangApDung = tienKiem.mode === "enforced";
  const soLoi = tienKiem.blocking_errors.length;
  const soCanhBao = tienKiem.warnings.length;
  const dungChu = chuGo.trim().toUpperCase() === CHU_XAC_NHAN;
  const coLyDo = lyDo.trim().length >= 10;
  const batDuoc = !dangApDung && soLoi === 0 && coLyDo && dungChu && !dangDoi;

  const doiCheDo = async (moi: "preview" | "enforced") => {
    setDangDoi(true);
    const dang = toast.dangChay(moi === "enforced"
      ? "Đang bật áp dụng quyền thật…"
      : "Đang chuyển về dự thảo…");
    try {
      await setItemPermissionsMode(moi, lyDo.trim());
      dang.xong(moi === "enforced"
        ? "Đã bật — quyền theo hạng mục đang áp dụng thật"
        : "Đã chuyển về dự thảo — quyền tạm ngừng áp dụng");
      setLyDo("");
      setChuGo("");
      await tai();
    } catch (e) {
      dang.hong((e as Error).message || "Không đổi được chế độ");
    } finally {
      setDangDoi(false);
    }
  };

  /* #9 (01/09): Card bọc chuyển vào TRONG component — khi tiền kiểm không
     chạy được (return null ở trên) sẽ không còn cái card TRẮNG RỖNG nằm
     chơ vơ dưới bộ lọc như trước. */
  return (
    <Card variant="strong">
    <section className="ip-panel" aria-labelledby="ipm-tieu-de">
      <h2 id="ipm-tieu-de">Chế độ áp dụng quyền theo hạng mục</h2>
      <div className={`ip-mode ${dangApDung ? "is-enforced" : "is-preview"}`} role="status">
        {dangApDung ? <ShieldCheck size={18} aria-hidden="true" />
          : <AlertTriangle size={18} aria-hidden="true" />}
        <div>
          <b>{dangApDung ? "ĐANG ÁP DỤNG QUYỀN THEO HẠNG MỤC" : "DỰ THẢO — CHƯA ÁP DỤNG QUYỀN THẬT"}</b>
          <span>
            {soLoi} lỗi bắt buộc · {soCanhBao} cảnh báo
            {dangApDung
              ? " — dữ liệu đang bị chặn theo phân công."
              : " — luật đã tính nhưng chưa chặn ai."}
          </span>
        </div>
      </div>

      <button type="button" className="pq-nut" onClick={() => void tai()} disabled={dangDoi}>
        Chạy lại tiền kiểm
      </button>

      <DanhSachVanDe ten="Lỗi bắt buộc phải sửa trước khi bật" ds={tienKiem.blocking_errors} />
      <DanhSachVanDe ten="Cảnh báo (không chặn bật)" ds={tienKiem.warnings} />

      {!dangApDung && (
        <div className="ip-form is-compact">
          <h3>Xem trước ảnh hưởng</h3>
          <p className="ip-help">
            Đo bằng đúng luật quyền sẽ áp dụng — bấm mới đo, không tự chạy khi mở màn
            này. Xong việc sẽ biết ai còn xem/sửa được gì và ai mất sạch quyền xem.
          </p>
          <button type="button" className="pq-nut" disabled={dangDoAnhHuong}
            onClick={() => void xemTruocAnhHuong()}>
            {dangDoAnhHuong
              ? <><Loader size={15} aria-hidden="true" /> Đang đo…</>
              : <><Eye size={15} aria-hidden="true" /> Xem trước ảnh hưởng khi bật</>}
          </button>

          {dangDoAnhHuong && tienDoDo && (
            <p className="ip-help" role="status">
              Đang đo {tienDoDo.xong}/{tienDoDo.tong} người…
            </p>
          )}

          {loiXemTruoc && (
            <p className="pq-canhbao la-do" role="alert">
              <AlertTriangle size={15} aria-hidden="true" /> {loiXemTruoc}
            </p>
          )}

          {ketQuaAnhHuong && (
            <>
              {(() => {
                /* Tách bạch hai chuyện rất khác nhau. Gộp chung thành một
                   con số làm người đọc tưởng hàng chục người sắp mất quyền,
                   trong khi phần lớn vốn chưa từng đăng nhập được. */
                const soMatQuyen = ketQuaAnhHuong
                  .filter((h) => !h.loi && h.soXem === 0 && h.nguoi.user_id).length;
                const soChuaNoiTaiKhoan = ketQuaAnhHuong
                  .filter((h) => !h.loi && !h.nguoi.user_id).length;
                const soKhongDoDuoc = ketQuaAnhHuong.filter((h) => h.loi).length;
                return (
                  <>
                    {soMatQuyen > 0 && (
                      <p className="pq-canhbao la-do" role="alert">
                        <AlertTriangle size={15} aria-hidden="true" />
                        {soMatQuyen} người sẽ không xem được hạng mục nào khi bật.
                      </p>
                    )}
                    {soMatQuyen === 0 && (
                      <p className="pq-canhbao" role="status">
                        <Check size={15} aria-hidden="true" />
                        Không ai đang dùng web bị mất quyền xem khi bật.
                      </p>
                    )}
                    {soChuaNoiTaiKhoan > 0 && (
                      <p className="ip-help" role="status">
                        {soChuaNoiTaiKhoan} người chưa nối tài khoản đăng nhập — họ vốn chưa
                        vào được web, nên bật hay không cũng không đổi gì với họ. Muốn họ dùng
                        được thì nối tài khoản ở thẻ “Tài khoản &amp; quyền” bên dưới.
                      </p>
                    )}
                    {soKhongDoDuoc > 0 && (
                      <p className="pq-canhbao la-vang" role="status">
                        <AlertTriangle size={15} aria-hidden="true" />
                        {soKhongDoDuoc} người không đo được — di chuột vào ô "Không đo được" để xem lý do.
                      </p>
                    )}
                  </>
                );
              })()}
              <SmartTable
                caption="Ảnh hưởng dự kiến khi bật áp dụng quyền theo hạng mục"
                rows={ketQuaAnhHuong}
                rowKey={(h) => h.nguoi.person_id}
                columns={cotAnhHuong}
                empty="Không có ai đang hoạt động trong danh bạ để đo."
              />
            </>
          )}
        </div>
      )}

      {dangApDung ? (
        <div className="ip-form is-compact">
          <label>
            <span>Lý do chuyển về dự thảo</span>
            <input className="pq-o" value={lyDo} onChange={(e) => setLyDo(e.target.value)}
              placeholder="Vì sao tạm ngừng áp dụng? Câu này đi vào nhật ký." />
          </label>
          {/* Tắt ngược không cần gõ chữ xác nhận: nó chỉ NỚI quyền ra, không
              khoá ai lại — hướng an toàn hơn nên đừng dựng thêm rào. */}
          <button type="button" className="pq-nut" disabled={!coLyDo || dangDoi}
            onClick={() => void doiCheDo("preview")}>
            Chuyển về dự thảo
          </button>
        </div>
      ) : (
        <div className="ip-form is-compact">
          {soLoi > 0 && (
            <p className="ip-help" role="status">
              Còn {soLoi} lỗi bắt buộc. Sửa hết rồi mới bật được — bật khi dữ liệu
              phân công còn thủng nghĩa là có người mất quyền xem chính việc của họ.
            </p>
          )}
          <label>
            <span>Lý do bật áp dụng<span className="cw-bat-buoc-chu">Bắt buộc</span></span>
            <input className="pq-o" value={lyDo} onChange={(e) => setLyDo(e.target.value)}
              disabled={soLoi > 0}
              placeholder="Ít nhất 10 ký tự. Câu này vào nhật ký kiểm toán." />
          </label>
          <label>
            <span>Gõ {CHU_XAC_NHAN} để xác nhận</span>
            <input className="pq-o" value={chuGo} onChange={(e) => setChuGo(e.target.value)}
              disabled={soLoi > 0} placeholder={CHU_XAC_NHAN} />
          </label>
          <p className="ip-help">
            Bật xong, người chưa được phân công sẽ <b>không còn xem được</b> hạng mục
            ngoài phạm vi của họ. Đổi lại được: nút “Chuyển về dự thảo” nằm ngay đây.
          </p>
          <button type="button" className="pq-nut la-chinh" disabled={!batDuoc}
            onClick={() => void doiCheDo("enforced")}>
            {dangDoi ? "Đang bật…" : <><Check size={15} aria-hidden="true" /> Bật áp dụng quyền thật</>}
          </button>
        </div>
      )}
    </section>
    </Card>
  );
}

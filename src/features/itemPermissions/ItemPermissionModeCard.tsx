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
import { AlertTriangle, Check, Loader, ShieldCheck } from "lucide-react";

import { useToast } from "../../components/ui/ToastProvider.tsx";
import { fetchPermissionPreflight, setItemPermissionsMode } from "./api.ts";
import type { PermissionIssue, PermissionPreflight } from "./types.ts";

/** Người dùng phải gõ đúng chữ này mới bật được — chống bấm nhầm trên một
 *  công tắc đổi quyền của cả hệ thống. Chữ ngắn, gõ được bằng bàn phím
 *  tiếng Việt không dấu, và nói đúng việc đang làm. */
const CHU_XAC_NHAN = "AP DUNG";

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

export default function ItemPermissionModeCard() {
  const toast = useToast();
  const [tienKiem, setTienKiem] = useState<PermissionPreflight | null>(null);
  const [dangTai, setDangTai] = useState(true);
  const [lyDo, setLyDo] = useState("");
  const [chuGo, setChuGo] = useState("");
  const [dangDoi, setDangDoi] = useState(false);

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
      <p className="ip-help" role="status">
        <Loader size={14} aria-hidden="true" /> Đang chạy tiền kiểm phân quyền…
      </p>
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

  return (
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
  );
}

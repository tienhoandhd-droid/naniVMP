/* Thẻ quản lý danh sách QA phụ trách — tab "QA phụ trách" ở màn Vai trò &
 * phạm vi. Mỗi thay đổi cần lý do (ghi vào nhật ký thay đổi phía server). */
import { useCallback, useEffect, useState } from "react";
import { UserCheck } from "lucide-react";

import { Card, CardTitle } from "../../components/ui/Primitives.tsx";
import { useToast } from "../../components/ui/ToastProvider.tsx";
import { C } from "../../constants/theme.ts";
import { datQaPhuTrach, layDanhSachQaPhuTrach } from "./api.ts";
import type { QaPhuTrachRow } from "./api.ts";

type TrangThai =
  | { tt: "dang" }
  | { tt: "loi"; loi: string }
  | { tt: "xong"; rows: QaPhuTrachRow[] };

const NHAN_VAI: Record<string, string> = {
  admin: "Admin",
  qa_manager: "Quản lý QA",
  qa_staff: "QA",
};

export default function QaPhuTrachPanel() {
  const toast = useToast();
  const [trangThai, setTrangThai] = useState<TrangThai>({ tt: "dang" });
  const [lyDo, setLyDo] = useState("");
  const [dangLuu, setDangLuu] = useState<string | null>(null);

  const tai = useCallback(async () => {
    setTrangThai({ tt: "dang" });
    const kq = await layDanhSachQaPhuTrach();
    setTrangThai(kq.ok ? { tt: "xong", rows: kq.data } : { tt: "loi", loi: kq.error });
  }, []);

  useEffect(() => { void tai(); }, [tai]);

  const doi = async (nguoi: QaPhuTrachRow) => {
    if (!lyDo.trim()) {
      toast.canhBao("Nhập lý do thay đổi trước.");
      return;
    }
    setDangLuu(nguoi.performerId);
    const kq = await datQaPhuTrach(nguoi.performerId, !nguoi.trongDanhSach, lyDo.trim());
    setDangLuu(null);
    if (!kq.ok) {
      toast.loi(kq.error);
      return;
    }
    toast.thanhCong(`${nguoi.trongDanhSach ? "Đã bỏ" : "Đã thêm"} ${nguoi.performerName}`);
    setLyDo("");
    await tai();
  };

  return (
    <Card variant="strong">
      <CardTitle icon={UserCheck} sub="Người được chọn làm QA phụ trách ở Dữ liệu nguồn">
        Danh sách QA phụ trách
      </CardTitle>

      {trangThai.tt === "dang" && <p role="status">Đang tải…</p>}

      {trangThai.tt === "loi" && (
        <div role="alert" style={{ display: "flex", gap: 12, alignItems: "center", color: C.raspText }}>
          <span>{trangThai.loi}</span>
          <button type="button" className="cw-nut" onClick={() => void tai()}>Thử lại</button>
        </div>
      )}

      {trangThai.tt === "xong" && trangThai.rows.length === 0 && (
        <p>Chưa có người thực hiện nào thuộc phòng QA.</p>
      )}

      {trangThai.tt === "xong" && trangThai.rows.length > 0 && (
        <>
          <label htmlFor="qa-phu-trach-ly-do" style={{ display: "block", fontWeight: 700, margin: "4px 0 6px" }}>
            Lý do thay đổi
          </label>
          <input id="qa-phu-trach-ly-do" className="cw-o" value={lyDo} maxLength={300}
            onChange={(e) => setLyDo(e.target.value)} placeholder="Ví dụ: phân công theo quyết định ngày…"
            style={{ width: "100%", maxWidth: 520, marginBottom: 12 }} />
          <div className="vmp-scroll" style={{ overflowX: "auto" }}>
            <table className="reg-table" data-qa-phu-trach style={{ width: "100%" }}>
              <thead>
                <tr><th>Họ tên</th><th>Vai</th><th>Trong danh sách</th><th /></tr>
              </thead>
              <tbody>
                {trangThai.rows.map((nguoi) => (
                  <tr key={nguoi.performerId}>
                    <td>{nguoi.performerName}</td>
                    <td>{nguoi.vai ? (NHAN_VAI[nguoi.vai] ?? nguoi.vai) : "—"}</td>
                    <td>{nguoi.trongDanhSach ? "Có" : (nguoi.lyDoChuaThemDuoc ?? "Không")}</td>
                    <td>
                      {(nguoi.trongDanhSach || !nguoi.lyDoChuaThemDuoc) && (
                        <button type="button" className="cw-nut" disabled={dangLuu !== null}
                          aria-label={`${nguoi.trongDanhSach ? "Bỏ" : "Thêm"} ${nguoi.performerName}`}
                          onClick={() => void doi(nguoi)}>
                          {dangLuu === nguoi.performerId ? "Đang lưu…" : nguoi.trongDanhSach ? "Bỏ" : "Thêm"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

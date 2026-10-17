/* Thẻ "QA hỗ trợ thêm" trong form hạng mục ở Dữ liệu nguồn (20261017100000).
 * Khác các ô còn lại của form: mỗi lần Thêm/Bỏ lưu ngay lên server (có lý
 * do, ghi nhật ký), không chờ nút Lưu của form. */
import { useCallback, useEffect, useState } from "react";

import QaPersonSelect from "./QaPersonSelect.tsx";
import { useSourceQaCandidates } from "./useSourceQaCandidates.ts";
import { datQaHoTroThem, layQaHoTroThem } from "./qaHoTroThem.ts";
import type { QaHoTroThemDanhSach } from "./qaHoTroThem.ts";

type TrangThai =
  | { tt: "dang" }
  | { tt: "loi"; loi: string }
  | { tt: "xong"; ds: QaHoTroThemDanhSach };

const NO_IDS: string[] = [];

/* Tách riêng để danh bạ QA chỉ tải khi người dùng thật sự mở phần thêm. */
function ChonNguoiThem({ dangLuu, onThem }: { dangLuu: boolean; onThem: (personId: string, ten: string) => void }) {
  const ungVien = useSourceQaCandidates(NO_IDS);
  const [chon, setChon] = useState<string | null>(null);
  return (
    <div className="cw-truong">
      <QaPersonSelect
        id="qa-ho-tro-them-chon"
        value={chon}
        ariaLabel="QA hỗ trợ thêm"
        onChange={setChon}
        state={ungVien.state}
        query={ungVien.query}
        onRetry={ungVien.retry}
        onLoadMore={ungVien.loadMore}
        onSearch={ungVien.search}
        disabled={dangLuu}
      />
      <button type="button" className="cw-nut cw-nut--phu" disabled={!chon || dangLuu}
        onClick={() => {
          if (!chon) return;
          const ten = ungVien.state.rows.find((nguoi) => nguoi.personId === chon)?.fullName ?? "người được chọn";
          onThem(chon, ten);
        }}>
        {dangLuu ? "Đang lưu…" : "Thêm người này"}
      </button>
    </div>
  );
}

export default function QaHoTroThemPanel({ objectCode }: { objectCode: string }) {
  const [trangThai, setTrangThai] = useState<TrangThai>({ tt: "dang" });
  const [lyDo, setLyDo] = useState("");
  const [moThem, setMoThem] = useState(false);
  const [dangLuu, setDangLuu] = useState(false);
  const [loiLuu, setLoiLuu] = useState<string | null>(null);
  const [thongBao, setThongBao] = useState<string | null>(null);

  const tai = useCallback(async () => {
    setTrangThai({ tt: "dang" });
    const kq = await layQaHoTroThem(objectCode);
    setTrangThai(kq.ok ? { tt: "xong", ds: kq.data } : { tt: "loi", loi: kq.error });
  }, [objectCode]);

  useEffect(() => { void tai(); }, [tai]);

  const doi = async (performerId: string, ten: string, them: boolean) => {
    setThongBao(null);
    if (!lyDo.trim()) {
      setLoiLuu("Nhập lý do trước khi thêm hoặc bỏ người.");
      document.getElementById("qa-ho-tro-them-ly-do")?.focus();
      return;
    }
    setDangLuu(true);
    setLoiLuu(null);
    const kq = await datQaHoTroThem(objectCode, performerId, them, lyDo.trim());
    setDangLuu(false);
    if (!kq.ok) {
      setLoiLuu(kq.error);
      return;
    }
    setThongBao(!kq.data.thayDoi ? `${ten} đã có trong danh sách.` : them ? `Đã thêm ${ten}.` : `Đã bỏ ${ten}.`);
    setLyDo("");
    setMoThem(false);
    await tai();
  };

  return (
    <section className="cw-nhom-truong" aria-labelledby="qa-ho-tro-them-tieu-de" data-qa-ho-tro-them>
      <h4 id="qa-ho-tro-them-tieu-de" className="cw-cot__ten">QA hỗ trợ thêm</h4>
      <p className="cw-goi-y">Cùng làm và báo kết quả. Lưu ngay khi bấm.</p>

      {trangThai.tt === "dang" && <p role="status">Đang tải…</p>}

      {trangThai.tt === "loi" && (
        <p role="alert" className="cw-loi">
          {trangThai.loi}{" "}
          <button type="button" className="cw-nut cw-nut--phu" onClick={() => void tai()}>Tải lại</button>
        </p>
      )}

      {trangThai.tt === "xong" && (
        <>
          {trangThai.ds.rows.length === 0
            ? <p>Chưa có ai.</p>
            : (
              <ul className="cw-qa-ho-tro-them">
                {trangThai.ds.rows.map((nguoi) => (
                  <li key={nguoi.performerId}>
                    <span>{nguoi.performerName}</span>
                    {trangThai.ds.coTheSua && (
                      <button type="button" className="cw-nut cw-nut--phu" disabled={dangLuu}
                        aria-label={`Bỏ ${nguoi.performerName}`}
                        onClick={() => void doi(nguoi.performerId, nguoi.performerName, false)}>
                        Bỏ
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

          {trangThai.ds.coTheSua && (
            <>
              <div className="cw-truong">
                <label htmlFor="qa-ho-tro-them-ly-do" className="cw-nhan">Lý do thêm/bỏ</label>
                <input id="qa-ho-tro-them-ly-do" className="cw-o" value={lyDo} maxLength={300}
                  onChange={(e) => setLyDo(e.target.value)} placeholder="Ví dụ: phân công theo kế hoạch tháng 10" />
              </div>
              {moThem
                ? <ChonNguoiThem dangLuu={dangLuu}
                    onThem={(id, ten) => void doi(id, ten, true)} />
                : (
                  <button type="button" className="cw-nut cw-nut--phu" onClick={() => setMoThem(true)}>
                    Thêm người
                  </button>
                )}
            </>
          )}

          {loiLuu && <p role="alert" className="cw-loi">{loiLuu}</p>}
          {thongBao && <p role="status" aria-live="polite">{thongBao}</p>}
        </>
      )}
    </section>
  );
}

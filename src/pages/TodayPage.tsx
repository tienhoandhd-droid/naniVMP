/* =====================================================================
 *  TodayPage.tsx — "Hôm nay": việc của tôi, xử ngay tại chỗ
 *  ---------------------------------------------------------------------
 *  Vì sao màn này phải tồn tại, và vì sao nó đứng ĐẦU danh sách:
 *
 *  App có chín màn thì bảy màn là phân tích/báo cáo — tức là để ĐỌC. Chỉ
 *  hai màn thật sự để LÀM. Nhưng việc hằng ngày của một QA không phải đọc
 *  báo cáo: mở máy → xem hôm nay phải làm gì → cập nhật → đóng máy.
 *
 *  Trước màn này, đường đi của việc đó là: vào Cập nhật tiến độ → bấm nút
 *  lọc "Việc của tôi" → cuộn qua 461 dòng để tìm cái tới hạn. Ba bước và
 *  một lần cuộn dài, lặp lại mỗi sáng.
 *
 *  Ở đây trả lời đúng ba câu, theo đúng thứ tự phải xử:
 *    1. Cái gì của tôi đã TRỄ
 *    2. Cái gì của tôi tới hạn trong 7 ngày
 *    3. Cái gì đã làm nhưng CHƯA ĐIỀN xong (thiếu ngày, thiếu người)
 *
 *  Mỗi dòng có nút mở thẳng hộp cập nhật — không phải nhớ mã rồi sang màn
 *  khác dán vào ô tìm.
 *
 *  "Của tôi" đối chiếu theo tên đăng nhập với QA phụ trách và người hỗ trợ.
 *  Không nhận diện được tên thì màn này nói thẳng thay vì im lặng hiện 0
 *  dòng — im lặng ở đây đọc ra thành "hôm nay không có việc gì".
 * ===================================================================== */
import { useMemo, useState } from "react";
import {
  CalendarClock, CheckCircle2, ClipboardList, Pencil, UserX, AlertCircle,
} from "lucide-react";
import { C, TEXT } from "../constants/theme.ts";
import { DEPTS, vmpToday } from "../constants/vmp.ts";
import { milestones, wlIsDone } from "../utils/helpers.ts";
import { Card, CardTitle, Pill, CauKetLuan, GiaiThich } from "../components/ui/Primitives.tsx";
import type { Activity } from "../types/domain.ts";

const NGAY = 86400000;

/** Mốc kế tiếp chưa xong của một hạng mục. */
function mocKeTiep(a: Activity): { ten: string; han: Date | null } | null {
  const r = (a._raw || {}) as Record<string, unknown>;
  const m = a.m || milestones(a);
  const buoc: Array<[string, unknown, Date | null]> = [
    ["Đề cương", r.tt_de_cuong, m.protocol],
    ["Thẩm định thực tế", r.tt_tham_dinh, m.validation],
    ["Báo cáo", r.tt_bao_cao, m.report],
    ["Hoàn thành VMP", r.tt_vmp, m.target],
  ];
  for (const [ten, tt, han] of buoc) if (!wlIsDone(tt)) return { ten, han };
  return null;
}

const conLai = (d: Date | null): number | null =>
  d ? Math.round((new Date(d).setHours(0, 0, 0, 0) - vmpToday().getTime()) / NGAY) : null;

/** Có phải việc của người này không — khớp QA phụ trách hoặc người hỗ trợ. */
function cuaToi(a: Activity, ten: string): boolean {
  if (!ten) return false;
  const t = ten.trim().toLowerCase();
  const r = (a._raw || {}) as Record<string, unknown>;
  return [a.owner, a.support, r.qa, r.ns_khac, a.secondary_owner]
    .some((x) => String(x || "").trim().toLowerCase() === t);
}

function Dong({ a, con, moc, onMo }: {
  a: Activity; con: number | null; moc: string; onMo?: (a: Activity) => void;
}) {
  const dept = DEPTS.find((d) => d.id === a.dept);
  const tre = con != null && con < 0;
  return (
    <div className="hn-dong">
      <span className={`hn-ngay ${tre ? "is-tre" : "is-toi"}`}>
        {con == null ? "—" : tre ? `trễ ${Math.abs(con)}` : con === 0 ? "hôm nay" : `còn ${con}`}
        {con != null && con !== 0 && <small>ngày</small>}
      </span>
      <span className="hn-ten">
        <b>{a.code}</b>
        <span>{a.name}</span>
      </span>
      <span className="hn-meta">
        {moc} · {dept?.short || a.dept || "—"}
      </span>
      <Pill s={a.st} small />
      {onMo && (
        <button type="button" className="hn-nut" onClick={() => onMo(a)}>
          <Pencil size={13} /> Cập nhật
        </button>
      )}
    </div>
  );
}

function Khoi({ icon, tieuDe, phu, ds, tone, onMo, rong = "Không có mục nào." }: {
  icon: typeof CalendarClock;
  tieuDe: string;
  phu: string;
  ds: Array<{ a: Activity; con: number | null; moc: string }>;
  tone: "over" | "warn" | "ok";
  onMo?: (a: Activity) => void;
  /** Câu hiện khi danh sách rỗng. */
  rong?: string;
}) {
  const [tatCa, setTatCa] = useState(false);
  const HIEN = 8;
  const hien = tatCa ? ds : ds.slice(0, HIEN);
  return (
    <Card variant={tone === "over" ? "strong" : "default"}>
      <CardTitle icon={icon} sub={phu}>
        {tieuDe} ({ds.length})
      </CardTitle>
      {ds.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "14px 4px",
                      color: C.mintText, fontWeight: 700, fontFamily: TEXT, fontSize: 13.5 }}>
          <CheckCircle2 size={17} /> {rong}
        </div>
      ) : (
        <>
          <div className="hn-ds">
            {hien.map((x) => <Dong key={`${x.a.id}-${x.moc}`} {...x} onMo={onMo} />)}
          </div>
          {ds.length > HIEN && (
            <button type="button" className="hn-them" onClick={() => setTatCa((v) => !v)}>
              {tatCa ? "Thu gọn" : `Xem hết ${ds.length} mục`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

export default function TodayView({ acts, myName, onMo, setView }: {
  acts: Activity[];
  /** Tên người đang đăng nhập. */
  myName: string;
  /** Mở hộp cập nhật cho một hạng mục. */
  onMo?: (a: Activity) => void;
  setView?: (v: string) => void;
}) {
  const [moiNguoi, setMoiNguoi] = useState(false);

  const { tre, toi, thieu, cuaAi } = useMemo(() => {
    const song = acts.filter((a) => (a.state || "active") === "active");
    const loc = moiNguoi || !myName ? song : song.filter((a) => cuaToi(a, myName));

    const tre: Array<{ a: Activity; con: number | null; moc: string }> = [];
    const toi: Array<{ a: Activity; con: number | null; moc: string }> = [];
    const thieu: Array<{ a: Activity; con: number | null; moc: string }> = [];

    for (const a of loc) {
      const r = (a._raw || {}) as Record<string, unknown>;

      /* Nhóm 3 — "cần điền nốt". Đây là việc TỒN chứ không phải việc sắp
         tới: đã làm rồi nhưng hồ sơ chưa khép. Với ALCOA+ thì một hạng mục
         ghi "Hoàn thành" mà thiếu ngày thực tế là không kiểm chứng được. */
      if (a.st === "done" && !String(r.ngay_vmp || "").trim()) {
        thieu.push({ a, con: null, moc: "Hoàn thành nhưng thiếu ngày" });
        continue;
      }
      if (!String(a.owner || "").trim() || a.owner === "—") {
        thieu.push({ a, con: null, moc: "Chưa có người phụ trách" });
        continue;
      }
      if (a.st === "done") continue;

      const m = mocKeTiep(a);
      if (!m) continue;
      const con = conLai(m.han);
      if (con == null) continue;
      if (con < 0) tre.push({ a, con, moc: m.ten });
      else if (con <= 7) toi.push({ a, con, moc: m.ten });
    }

    const sx = (x: { con: number | null }, y: { con: number | null }) => (x.con ?? 0) - (y.con ?? 0);
    tre.sort(sx); toi.sort(sx);
    return { tre, toi, thieu, cuaAi: loc.length };
  }, [acts, myName, moiNguoi]);

  const ketLuan = useMemo(() => {
    if (!myName && !moiNguoi) {
      return {
        chinh: "Chưa nhận ra tên bạn trong danh sách QA phụ trách.",
        phu: "Màn này lọc theo tên đăng nhập đối chiếu với cột QA và người hỗ trợ. Bật \"Xem của mọi người\" để thấy toàn bộ, hoặc nhờ quản trị gán đúng tên.",
        tone: "warn" as const,
      };
    }
    if (!tre.length && !toi.length && !thieu.length) {
      return {
        chinh: "Hôm nay không có việc nào tới hạn hay quá hạn.",
        phu: `${cuaAi} hạng mục trong phạm vi đang xem đều còn hạn xa hoặc đã xong.`,
        tone: "ok" as const,
      };
    }
    const nang = tre[0];
    return {
      chinh: tre.length
        ? `${tre.length} việc đã trễ — nặng nhất là ${nang.a.code}, trễ ${Math.abs(nang.con ?? 0)} ngày ở mốc ${nang.moc.toLowerCase()}.`
        : `Chưa việc nào trễ, ${toi.length} việc tới hạn trong 7 ngày.`,
      phu: [
        toi.length && tre.length ? `Thêm ${toi.length} việc tới hạn trong 7 ngày.` : "",
        thieu.length ? `${thieu.length} hạng mục cần điền nốt hồ sơ.` : "",
        "Bấm Cập nhật ngay trên dòng để sửa, không phải sang màn khác.",
      ].filter(Boolean).join(" "),
      tone: (tre.length ? "over" : "warn") as "over" | "warn",
    };
  }, [tre, toi, thieu, myName, moiNguoi, cuaAi]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card variant="strong">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                      gap: 14, flexWrap: "wrap" }}>
          <CardTitle icon={ClipboardList}
            sub={`${vmpToday().toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}`}>
            {moiNguoi ? "Việc hôm nay — cả đội" : `Việc hôm nay của ${myName || "bạn"}`}
          </CardTitle>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer",
                          fontFamily: TEXT, fontSize: 12.5, fontWeight: 800, color: C.plumSoft }}>
            <input type="checkbox" checked={moiNguoi} onChange={(e) => setMoiNguoi(e.target.checked)} />
            Xem của mọi người
            <GiaiThich tieuDe="Phạm vi màn này">
              <span>Mặc định chỉ hiện hạng mục mà bạn là QA phụ trách hoặc người hỗ trợ.</span>
              <span>Bật ô này để xem toàn bộ hạng mục trong bộ lọc chung đang áp dụng.</span>
            </GiaiThich>
          </label>
        </div>
        <CauKetLuan chinh={ketLuan.chinh} phu={ketLuan.phu} tone={ketLuan.tone} />
      </Card>

      <Khoi icon={AlertCircle} tone="over"
        tieuDe="Đã trễ" phu="Mốc gần nhất đã trôi qua — xử trước tiên"
        ds={tre} onMo={onMo} rong="Không có việc nào trễ." />

      <Khoi icon={CalendarClock} tone="warn"
        tieuDe="Tới hạn trong 7 ngày" phu="Còn kịp nếu bắt đầu từ hôm nay"
        ds={toi} onMo={onMo} rong="Tuần này chưa có mốc nào tới hạn." />

      <Khoi icon={UserX} tone="ok"
        tieuDe="Cần điền nốt" phu="Đã làm nhưng hồ sơ chưa khép: thiếu ngày thực tế hoặc chưa có người phụ trách"
        ds={thieu} onMo={onMo} rong="Hồ sơ đã đầy đủ." />

      {setView && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="hn-them" onClick={() => setView("progress")}>
            Mở màn Cập nhật tiến độ đầy đủ →
          </button>
          <button type="button" className="hn-them" onClick={() => setView("alerts")}>
            Xem toàn bộ cảnh báo →
          </button>
        </div>
      )}
    </div>
  );
}

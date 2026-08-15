/* =====================================================================
 *  todayModel.ts — chọn ra "hôm nay tôi phải làm gì"
 *  ---------------------------------------------------------------------
 *  Logic thuần, không React, không DOM: `node --test` chạy được thẳng.
 *
 *  Ba nguyên tắc, mỗi cái vá một lỗi thật của bản trước:
 *
 *  1. KHÔNG nhận diện người dùng bằng TÊN HIỂN THỊ. Nhà máy có người
 *     trùng tên, và một người đổi tên hiển thị là "việc của tôi" đổi theo.
 *     Việc lọc theo người đã do lớp phạm vi toàn cục lo bằng person_id.
 *
 *  2. Thiếu mốc hạn thì KHÔNG coi là quá hạn. Một hạng mục chưa có ngày
 *     đích chỉ nghĩa là chưa lên lịch; báo đỏ nó là báo động giả, mà báo
 *     động giả lặp lại thì người ta ngừng nhìn màu đỏ.
 *
 *  3. So sánh ngày ở nửa đêm theo giờ Bangkok. So bằng giờ máy thì cùng
 *     một hạng mục lúc 23h hôm nay và 1h sáng mai cho hai kết quả khác
 *     nhau — hồ sơ GMP không chấp nhận kiểu đó.
 * ===================================================================== */
import type { Activity } from "../../types/domain.ts";

export type TodayRowKind = "overdue" | "due_7d" | "incomplete_record";

export interface TodayRow {
  validationCode: string;
  title: string;
  /** Mốc đang chờ: Đề cương / Thẩm định / Báo cáo / Đích VMP. */
  milestoneLabel: string;
  /** Số ngày còn lại; âm là đã trễ. `null` khi chưa có mốc. */
  daysRemaining: number | null;
  kind: TodayRowKind;
}

export interface TodayModel {
  overdue: TodayRow[];
  dueSoon: TodayRow[];
  incomplete: TodayRow[];
  /** Việc nên làm trước nhất — hoặc `null` khi không còn gì gấp. */
  nextAction: TodayRow | null;
}

/** Bốn mốc, theo đúng thứ tự vòng đời thẩm định. */
const MOC: Array<{ han: keyof Activity; thuc: keyof Activity; nhan: string }> = [
  { han: "dlProtocol", thuc: "actProtocol", nhan: "Đề cương" },
  { han: "dlValidation", thuc: "actValidation", nhan: "Thẩm định" },
  { han: "dlReport", thuc: "actReport", nhan: "Báo cáo" },
  { han: "dlVmp", thuc: "actVmp", nhan: "Đích VMP" },
];

const NGAY_MS = 86_400_000;

/** Nửa đêm theo giờ Bangkok (UTC+7), trả về mốc epoch.
 *
 *  Không dùng `new Date(chuoi)` trần: chuỗi `YYYY-MM-DD` được hiểu là UTC,
 *  nên ở Việt Nam nó lệch đi 7 tiếng và một hạng mục đến hạn "hôm nay" có
 *  thể bị tính thành "hôm qua". */
function nuaDemBangkok(gt: string | Date): number | null {
  const d = typeof gt === "string" ? new Date(`${gt.slice(0, 10)}T00:00:00+07:00`) : gt;
  const ms = d.getTime();
  if (Number.isNaN(ms)) return null;
  // Quy về nửa đêm Bangkok của chính ngày đó.
  return Math.floor((ms + 7 * 3_600_000) / NGAY_MS) * NGAY_MS - 7 * 3_600_000;
}

const laChuoiNgay = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);

/** Mốc chưa hoàn thành gần nhất CÓ HẠN.
 *
 *  Không dừng ở mốc chưa xong đầu tiên: rất thường gặp cảnh đề cương chưa
 *  có ngày hẹn trong khi ngày thẩm định thì đã chốt và đã trôi qua. Dừng
 *  sớm ở đó là im lặng bỏ sót một hạng mục quá hạn — đúng loại lỗi mà màn
 *  "Hôm nay" sinh ra để ngăn.
 *
 *  Trả về mốc chưa xong đầu tiên (để hiển thị đúng giai đoạn) kèm hạn của
 *  mốc CÓ HẠN gần nhất tính từ đó trở đi. */
function mocDangCho(a: Activity): { nhan: string; han: string | null } | null {
  let dau: { nhan: string; han: string | null } | null = null;
  for (const m of MOC) {
    if (laChuoiNgay(a[m.thuc])) continue;             // mốc này đã xong
    const han = laChuoiNgay(a[m.han]) ? String(a[m.han]) : null;
    if (dau === null) dau = { nhan: m.nhan, han };
    if (han !== null) return { nhan: m.nhan, han };   // mốc chưa xong đầu tiên CÓ hạn
  }
  return dau;
}

/** Chủ sở hữu chính tắc. CHỈ chấp nhận person_id thật.
 *
 *  Tên hiển thị, `owner`, hay người hỗ trợ đều KHÔNG thay thế được: hai
 *  người trùng tên là chuyện có thật ở nhà máy, và gán việc nhầm người
 *  trong hồ sơ GMP là lỗi nghiêm trọng hơn nhiều so với việc để trống. */
function coChuSoHuu(a: Activity): boolean {
  const id = a.ownerPersonId ?? (a._raw as Record<string, unknown> | undefined)?.owner_person_id;
  return typeof id === "string" && id.trim().length > 0;
}

function tenHienThi(a: Activity): string {
  const ten = a.objName || a.name;
  return typeof ten === "string" && ten.trim() ? ten.trim() : String(a.validationCode ?? a.code ?? a.id);
}

function maHangMuc(a: Activity): string {
  return String(a.validationCode ?? a.code ?? a.id ?? "");
}

function toTodayRow(a: Activity, nay: number): TodayRow | null {
  const xong = a.st === "done";
  const moc = mocDangCho(a);

  /* Hồ sơ chưa đủ: đã đánh dấu hoàn thành mà thiếu ngày đích thực tế,
     hoặc đang hoạt động mà chưa có người phụ trách chính tắc. */
  const thieuNgayXong = xong && !laChuoiNgay(a.actVmp);
  const thieuNguoi = !coChuSoHuu(a);
  if (thieuNgayXong || thieuNguoi) {
    return {
      validationCode: maHangMuc(a),
      title: tenHienThi(a),
      milestoneLabel: thieuNgayXong ? "Thiếu ngày hoàn thành" : "Chưa phân công QA",
      daysRemaining: null,
      kind: "incomplete_record",
    };
  }

  if (xong || !moc) return null;

  const han = moc.han ? nuaDemBangkok(moc.han) : null;
  if (han == null) return null;               // chưa lên lịch, không phải quá hạn

  const con = Math.round((han - nay) / NGAY_MS);
  if (con < 0) {
    return { validationCode: maHangMuc(a), title: tenHienThi(a), milestoneLabel: moc.nhan, daysRemaining: con, kind: "overdue" };
  }
  if (con <= 7) {
    return { validationCode: maHangMuc(a), title: tenHienThi(a), milestoneLabel: moc.nhan, daysRemaining: con, kind: "due_7d" };
  }
  return null;
}

/** Gấp trước, và cùng mức gấp thì xếp theo mã cho ổn định. */
const soSanhGap = (a: TodayRow, b: TodayRow) =>
  (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0)
  || a.validationCode.localeCompare(b.validationCode, "vi");

const soSanhMa = (a: TodayRow, b: TodayRow) =>
  a.validationCode.localeCompare(b.validationCode, "vi");

export function buildTodayModel(activities: Activity[], now: Date): TodayModel {
  const nay = nuaDemBangkok(now) ?? now.getTime();
  const rows = (activities || [])
    .filter((a) => (a.state ?? "active") === "active")
    .map((a) => toTodayRow(a, nay))
    .filter((r): r is TodayRow => r !== null);

  const overdue = rows.filter((r) => r.kind === "overdue").sort(soSanhGap);
  const dueSoon = rows.filter((r) => r.kind === "due_7d").sort(soSanhGap);
  const incomplete = rows.filter((r) => r.kind === "incomplete_record").sort(soSanhMa);

  return {
    overdue,
    dueSoon,
    incomplete,
    nextAction: overdue[0] ?? dueSoon[0] ?? incomplete[0] ?? null,
  };
}

/** Yêu cầu mở màn Tiến độ và tập trung vào đúng một hạng mục. */
export interface ProgressDeepLink {
  validationCode: string;
  quickFilter: TodayRowKind;
  source: "today";
}

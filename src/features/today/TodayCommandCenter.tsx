/* =====================================================================
 *  TodayCommandCenter — màn "Hôm nay" theo ngôn ngữ Lotus Pearl
 *  ---------------------------------------------------------------------
 *  Khác bản trước ở thứ bậc, không ở dữ liệu.
 *
 *  Bản trước bày ba khối cùng trọng lượng: quá hạn, sắp tới hạn, hồ sơ
 *  thiếu — ba thẻ giống nhau, người dùng phải đọc hết rồi tự quyết định
 *  làm gì trước. Ở đây có ĐÚNG MỘT việc được nêu lên đầu, rồi mới tới ba
 *  danh sách xếp theo mức gấp.
 *
 *  Toàn bộ dựng bằng bề mặt dùng chung của Foundation, không tự chế thẻ
 *  riêng: một màn tự chế là một màn sẽ lệch khỏi phần còn lại sau vài
 *  tháng.
 * ===================================================================== */
import MetricGrid from "../../components/ui/MetricGrid.tsx";
import PriorityStrip from "../../components/ui/PriorityStrip.tsx";
import StateBoundary from "../../components/ui/StateBoundary.tsx";
import { buildTodayModel } from "./todayModel.ts";
import type { ProgressDeepLink, TodayRow } from "./todayModel.ts";
import type { Activity } from "../../types/domain.ts";

export interface TodayCommandCenterProps {
  acts: Activity[];
  /** Nhãn phạm vi dữ liệu đang xem, do shell cấp. */
  scopeLabel?: string;
  updatedLabel?: string;
  /** Đang tải hay lỗi — màn phải nói rõ, không để trắng. */
  state?: "loading" | "error" | "ready";
  onRetry?: () => void;
  onOpenProgress: (link: ProgressDeepLink) => void;
  /** Cho phép truyền mốc thời gian trong kiểm thử. */
  now?: Date;
}

const NHAN_NHOM: Record<TodayRow["kind"], string> = {
  overdue: "Quá hạn",
  due_7d: "Tới hạn trong 7 ngày",
  incomplete_record: "Hồ sơ chưa đủ",
};

const SAC_NHOM: Record<TodayRow["kind"], "danger" | "warning" | "info"> = {
  overdue: "danger",
  due_7d: "warning",
  incomplete_record: "info",
};

function moTaHan(row: TodayRow): string {
  if (row.daysRemaining == null) return row.milestoneLabel;
  if (row.daysRemaining < 0) return `${row.milestoneLabel} · trễ ${Math.abs(row.daysRemaining)} ngày`;
  if (row.daysRemaining === 0) return `${row.milestoneLabel} · hạn hôm nay`;
  return `${row.milestoneLabel} · còn ${row.daysRemaining} ngày`;
}

function Nhom({ kind, rows, onOpenProgress }: {
  kind: TodayRow["kind"];
  rows: TodayRow[];
  onOpenProgress: TodayCommandCenterProps["onOpenProgress"];
}) {
  if (rows.length === 0) return null;
  return (
    <section className={`hn-nhom hn-nhom--${kind} lp-tone--${SAC_NHOM[kind]}`}>
      <h2 className="hn-nhom__ten">
        {NHAN_NHOM[kind]} <span className="hn-nhom__dem">{rows.length}</span>
      </h2>
      <ul className="hn-ds">
        {rows.map((row) => (
          <li key={row.validationCode} className="hn-muc">
            <div className="hn-muc__chinh">
              <b className="hn-muc__ma">{row.validationCode}</b>
              <span className="hn-muc__ten">{row.title}</span>
            </div>
            <span className="hn-muc__han">{moTaHan(row)}</span>
            <button type="button" className="hn-muc__nut"
              onClick={() => onOpenProgress({
                validationCode: row.validationCode,
                quickFilter: row.kind,
                source: "today",
              })}>
              Cập nhật
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function TodayCommandCenter({
  acts, scopeLabel, updatedLabel, state = "ready", onRetry, onOpenProgress, now,
}: TodayCommandCenterProps) {
  const model = buildTodayModel(acts, now ?? new Date());
  const tong = model.overdue.length + model.dueSoon.length + model.incomplete.length;

  return (
    <div className="hn-lotus">
      {/* KHÔNG dùng PageHeader ở đây.
          Topbar của shell đã dựng <h1> mang tên màn cho MỌI màn, nên thêm
          một PageHeader nữa là trang có hai h1 (bộ kiểm thẩm mỹ bắt được
          ngay ở luật A5) và chữ "Hôm nay" hiện hai lần cạnh nhau.
          PageHeader dành cho màn đứng ngoài shell — ví dụ trang in. */}
      <p className="hn-mota">
        Việc trong phạm vi bạn đang xem, xếp theo mức gấp.
        {scopeLabel && <span className="hn-mota__pham-vi">Phạm vi: {scopeLabel}</span>}
        {updatedLabel && <span className="hn-mota__moc">{updatedLabel}</span>}
      </p>

      {state === "loading" && (
        <StateBoundary state="loading" title="Đang tải việc hôm nay" skeletonRows={4} />
      )}

      {state === "error" && (
        <StateBoundary state="error" title="Chưa tải được dữ liệu"
          description="Không đọc được danh sách hạng mục. Thử lại, hoặc kiểm tra kết nối."
          onRetry={onRetry} />
      )}

      {state === "ready" && (
        <>
          <MetricGrid
            label="Việc hôm nay"
            items={[
              { id: "over", label: "Quá hạn", value: model.overdue.length, tone: "danger",
                hint: "cần xử lý trước tiên" },
              { id: "soon", label: "Tới hạn 7 ngày", value: model.dueSoon.length, tone: "warning",
                hint: "theo dõi để không rơi sang quá hạn" },
              { id: "miss", label: "Hồ sơ chưa đủ", value: model.incomplete.length, tone: "info",
                hint: "thiếu ngày hoặc chưa phân công" },
            ]}
          />

          {/* ĐÚNG MỘT việc được nêu lên đầu. Nếu mọi thứ đều quan trọng
              thì chẳng thứ gì quan trọng cả. */}
          {model.nextAction && (
            <PriorityStrip
              label="Làm trước tiên"
              items={[{
                id: model.nextAction.validationCode,
                tone: SAC_NHOM[model.nextAction.kind],
                value: model.nextAction.validationCode,
                label: model.nextAction.title,
                hint: moTaHan(model.nextAction),
                onActivate: () => onOpenProgress({
                  validationCode: model.nextAction!.validationCode,
                  quickFilter: model.nextAction!.kind,
                  source: "today",
                }),
              }]}
            />
          )}

          {tong === 0 ? (
            <StateBoundary state="empty" title="Không còn việc gấp nào"
              description="Trong phạm vi đang xem, không có hạng mục nào quá hạn, sắp tới hạn hay thiếu hồ sơ." />
          ) : (
            <>
              <Nhom kind="overdue" rows={model.overdue} onOpenProgress={onOpenProgress} />
              <Nhom kind="due_7d" rows={model.dueSoon} onOpenProgress={onOpenProgress} />
              <Nhom kind="incomplete_record" rows={model.incomplete} onOpenProgress={onOpenProgress} />
            </>
          )}
        </>
      )}
    </div>
  );
}

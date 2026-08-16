/* =====================================================================
 *  AccountAccessPage.tsx — Tài khoản & quyền truy cập
 *  ---------------------------------------------------------------------
 *  Nửa còn lại của màn "Phân quyền & trách nhiệm" cũ: VÒNG ĐỜI TÀI KHOẢN.
 *  Chỉ Admin. Xem OperationalPeoplePage cho phần dữ liệu nhân sự.
 *
 *  Màn này còn là chỗ duy nhất đọc được ma trận quyền màn hình đang chạy.
 *  Trước đây ma trận chỉ xem được bằng SQL, nên không ai trả lời nổi câu
 *  "vai Nhân viên xưởng thấy những màn nào" nếu không mở database — trong
 *  khi đó chính là thứ quyết định người ta nhìn thấy gì khi đăng nhập.
 *
 *  Bảng ma trận lấy từ `rpc_my_ui_access` của CHÍNH người đang xem, nên nó
 *  hiển thị đúng thứ server trả về chứ không phải một bản chép tay có thể
 *  lệch. Muốn xem vai khác thì đăng nhập bằng tài khoản vai đó — cố ý như
 *  vậy: không có đường nào để trình duyệt tự khai mình là vai khác.
 * ===================================================================== */
import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Card, CardTitle, Tag } from "../components/ui/Primitives.tsx";
import StaffDirectoryPanel from "../features/itemPermissions/StaffDirectoryPanel.tsx";
import AccountLinkPanel from "../features/itemPermissions/AccountLinkPanel.tsx";
import type { DirectoryPerson } from "../features/itemPermissions/types.ts";
import { SCREEN_IDS } from "../lib/access.ts";
import type { AccessContext } from "../lib/access.ts";
import { C } from "../constants/theme.ts";

/** Tên hiển thị của từng màn, để bảng ma trận đọc được bằng tiếng Việt. */
const TEN_MAN: Record<string, string> = {
  today: "Hôm nay",
  overview: "Tổng quan",
  timeline: "Dòng thời gian VMP",
  alerts: "Cảnh báo & Rủi ro",
  risk: "Rủi ro (đường dẫn cũ)",
  progress: "Cập nhật tiến độ",
  inventory: "Tiến độ theo đối tượng",
  source: "Danh mục & Nhập liệu",
  workload: "Phân công & Tải việc",
  reports: "Báo cáo & phân tích",
  rules: "Luật đang áp dụng",
  people: "Nhân sự & phân công",
  health: "Sức khoẻ dữ liệu",
  audit: "Audit log",
  accounts: "Tài khoản & quyền truy cập",
  admin: "Quản trị",
  phanquyen: "Phân quyền (cửa vào cũ)",
};

const TEN_PHAM_VI: Record<string, string> = {
  all: "Toàn hệ thống",
  workshop: "Phạm vi xưởng",
  assigned: "Việc được giao",
  own: "Của riêng mình",
  none: "—",
};

function MaTranQuyenManHinh({ access }: { access: AccessContext }) {
  return (
    <Card variant="strong">
      <CardTitle icon={ShieldCheck}
        sub={access.mode === "enforced"
          ? "Quyền đang có hiệu lực. Đây là kết quả server trả về cho chính tài khoản bạn đang dùng."
          : "Đang ở chế độ đối chiếu: bảng này cho thấy quyền dự kiến, nhưng hệ vẫn chạy theo luật cũ."}>
        Màn hình bạn được xem
      </CardTitle>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Tag>{access.mode === "enforced" ? "Đang áp dụng" : "Dự kiến, chưa áp dụng"}</Tag>
        <Tag>Vai nghiệp vụ: {access.businessRole ?? "chưa giải được"}</Tag>
        {access.unresolvedReason && <Tag>Lý do: {access.unresolvedReason}</Tag>}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: C.plumSoft }}>
              <th style={{ padding: "6px 10px" }}>Màn hình</th>
              <th style={{ padding: "6px 10px" }}>Được xem</th>
              <th style={{ padding: "6px 10px" }}>Phạm vi dữ liệu</th>
              <th style={{ padding: "6px 10px" }}>Hành động được phép</th>
            </tr>
          </thead>
          <tbody>
            {SCREEN_IDS.map((id) => {
              const xem = access.canView(id);
              const hanhDong = [...(access.screens[id]?.actions ?? [])]
                .filter((a) => a !== "view").sort();
              return (
                <tr key={id} style={{ borderTop: `1px solid ${C.line}`, opacity: xem ? 1 : 0.55 }}>
                  <td style={{ padding: "6px 10px", fontWeight: xem ? 700 : 500 }}>
                    {TEN_MAN[id] ?? id}
                  </td>
                  <td style={{ padding: "6px 10px" }}>{xem ? "Có" : "Không"}</td>
                  <td style={{ padding: "6px 10px" }}>{TEN_PHAM_VI[access.scope(id)] ?? access.scope(id)}</td>
                  <td style={{ padding: "6px 10px", color: C.plumSoft }}>
                    {hanhDong.length ? hanhDong.join(", ") : (xem ? "chỉ xem" : "—")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function AccountAccessView({ access }: { access: AccessContext }) {
  const [person, setPerson] = useState<DirectoryPerson | null>(null);
  const [directoryRevision, setDirectoryRevision] = useState(0);
  const [refreshPersonId, setRefreshPersonId] = useState<string | null>(null);

  const duocQuanLy = access.can("accounts", "manage_accounts");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card variant="strong">
        <CardTitle icon={KeyRound}
          sub="Nối hoặc gỡ tài khoản đăng nhập khỏi hồ sơ nhân sự. Sửa dữ liệu nhân sự nằm ở màn Nhân sự & phân công.">
          Tài khoản &amp; quyền truy cập
        </CardTitle>
        <div className="ip-workspace">
          {/* Danh bạ ở đây CHỈ ĐỌC: màn này lo tài khoản, không lo hồ sơ. */}
          <StaffDirectoryPanel canEdit={false} validAreas={[]} onSelect={setPerson}
            revision={directoryRevision} refreshPersonId={refreshPersonId} />
          <AccountLinkPanel person={person} canManageAccounts={duocQuanLy}
            onLinked={(personId) => {
              setRefreshPersonId(personId);
              setDirectoryRevision((value) => value + 1);
            }} />
        </div>
      </Card>

      <MaTranQuyenManHinh access={access} />
    </div>
  );
}

/* =====================================================================
 *  OperationalPeoplePage.tsx — Nhân sự & phân công
 *  ---------------------------------------------------------------------
 *  Một nửa của màn "Phân quyền & trách nhiệm" cũ, tách ra theo thiết kế
 *  §3.2: DỮ LIỆU NHÂN SỰ và VÒNG ĐỜI TÀI KHOẢN là hai việc khác nhau, do
 *  hai nhóm người khác nhau nắm.
 *
 *    · Ở đây  — họ tên, mã nhân viên, bộ phận, phân loại quyền, phạm vi,
 *               trạng thái làm việc, phân công QA theo hạng mục.
 *               Admin và Quản lý QA sửa; Nhân viên QA chỉ xem.
 *    · Bên kia — mời/khoá tài khoản, nối hoặc gỡ tài khoản khỏi hồ sơ,
 *               đổi vai đăng nhập. Chỉ Admin. Xem AccountAccessPage.
 *
 *  Vì sao phải tách: gộp chung thì ai sửa được danh bạ cũng đứng cạnh nút
 *  đổi quyền đăng nhập, và không có cách nào cấp quyền cho Quản lý QA sửa
 *  hồ sơ nhân sự mà không đồng thời hé cửa vào vòng đời tài khoản.
 *
 *  Quyền lấy từ server (`access.can`), không suy từ `user.role` — xem
 *  src/lib/access.ts. RPC phía sau vẫn là biên bảo mật thật; phần này chỉ
 *  quyết định vẽ nút nào.
 * ===================================================================== */
import { useMemo, useState } from "react";
import OperationalPeopleWorkspace from "../features/operationalPeople/OperationalPeopleWorkspace.tsx";
import StaffDirectoryPanel from "../features/itemPermissions/StaffDirectoryPanel.tsx";
import AssignmentPanel from "../features/itemPermissions/AssignmentPanel.tsx";
import EffectiveRightsPanel from "../features/itemPermissions/EffectiveRightsPanel.tsx";
import type { DirectoryPerson } from "../features/itemPermissions/types.ts";
import type { AccessContext } from "../lib/access.ts";
import type { Activity } from "../types/domain.ts";

export default function OperationalPeopleView({ acts, access, scopeLabel, updatedLabel }: {
  acts: Activity[];
  access: AccessContext;
  /** Nhãn phạm vi và mốc dữ liệu do shell cấp — màn không tự tính. */
  scopeLabel?: string;
  updatedLabel?: string;
}) {
  const [person, setPerson] = useState<DirectoryPerson | null>(null);
  const [rightsRevision, setRightsRevision] = useState(0);

  const duocSua = access.can("people", "edit_operational_people");

  /* Khu vực và line rút từ chính dữ liệu đang hiển thị, để ô chọn phạm vi
     không gợi ý những giá trị không tồn tại trong hệ. */
  const validAreas = useMemo(() => [...new Set(acts.flatMap((activity) => {
    const raw = (activity._raw || {}) as Record<string, unknown>;
    return [activity.area, raw.area, raw.line]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
  }))].sort((a, b) => a.localeCompare(b, "vi")), [acts]);

  return (
    <OperationalPeopleWorkspace
      boundaryNote={duocSua
        ? "Hồ sơ nhân sự, phạm vi làm việc và phân công QA theo hạng mục. Việc nối tài khoản đăng nhập nằm ở màn Tài khoản & quyền truy cập."
        : "Xem hồ sơ nhân sự và phân công QA. Chỉ Admin và Quản lý QA sửa được."}
      scopeLabel={scopeLabel}
      updatedLabel={updatedLabel}
      hasSelection={person !== null}
      directory={<StaffDirectoryPanel canEdit={duocSua} validAreas={validAreas} onSelect={setPerson} />}
      assignment={(
        <AssignmentPanel person={person} canEdit={duocSua}
          onAssignmentsChanged={() => setRightsRevision((value) => value + 1)} />
      )}
      rights={<EffectiveRightsPanel person={person} revision={rightsRevision} />}
    />
  );
}

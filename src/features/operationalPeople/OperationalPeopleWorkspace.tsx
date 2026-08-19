/* =====================================================================
 *  OperationalPeopleWorkspace — bố cục màn "Nhân sự & phân công"
 *  ---------------------------------------------------------------------
 *  CHỈ đổi cách trình bày. Không thêm, không thay, không nới rộng một RPC
 *  ghi nào: ba panel bên trong vẫn gọi đúng
 *  `rpc_upsert_item_permission_staff`, `rpc_import_item_permission_staff`
 *  và `rpc_set_item_assignment` như trước. Biên bảo mật thật nằm ở RLS và
 *  RPC phía Supabase; phần này chỉ quyết định vẽ gì ở đâu.
 *
 *  Ba thay đổi về thứ bậc, so với một thẻ lớn chứa tất cả:
 *
 *  1. Ba việc khác nhau được tách thành ba vùng có tên: TÌM NGƯỜI →
 *     PHÂN CÔNG → QUYỀN THỰC TẾ. Bản cũ để chúng cạnh nhau cùng trọng
 *     lượng, nên người mới không biết bắt đầu từ đâu.
 *  2. Dưới 1093px chuyển sang lối chọn-rồi-xem: chọn người ở danh bạ thì
 *     mới hiện hai vùng còn lại. Nhồi ba cột vào màn hẹp thì cột nào cũng
 *     chật và không cột nào dùng được.
 *  3. Vùng nào chưa chọn người thì nói rõ đang chờ gì, thay vì để trống.
 * ===================================================================== */
import { useState } from "react";
import type { ReactNode } from "react";

import StateBoundary from "../../components/ui/StateBoundary.tsx";

export interface OperationalPeopleWorkspaceProps {
  /** Câu ngắn nói rõ ranh giới với màn Tài khoản. */
  boundaryNote: string;
  scopeLabel?: string;
  updatedLabel?: string;
  /** Đã chọn một người chưa — quyết định bố cục ở màn hẹp. */
  hasSelection: boolean;
  directory: ReactNode;
  assignment: ReactNode;
  rights: ReactNode;
}

type Vung = "directory" | "detail";

export default function OperationalPeopleWorkspace({
  boundaryNote, scopeLabel, updatedLabel, hasSelection,
  directory, assignment, rights,
}: OperationalPeopleWorkspaceProps) {
  /* Ở màn hẹp chỉ hiện một vùng mỗi lúc. Mặc định là danh bạ, vì không
     chọn người thì hai vùng kia không có gì để nói. */
  const [vung, setVung] = useState<Vung>("directory");
  const dangXem: Vung = hasSelection ? vung : "directory";

  return (
    <div className="op-workspace">
      <p className="op-workspace__mota">
        {boundaryNote}
        {scopeLabel && <span className="op-workspace__pham-vi">Phạm vi: {scopeLabel}</span>}
        {updatedLabel && <span className="op-workspace__moc">{updatedLabel}</span>}
      </p>

      {/* Chuyển vùng — chỉ hiện ở màn hẹp, và chỉ khi đã chọn người. */}
      {hasSelection && (
        <div className="op-workspace__doi-vung" role="group" aria-label="Chuyển vùng làm việc">
          <button type="button" aria-pressed={dangXem === "directory"}
            onClick={() => setVung("directory")}>Danh bạ</button>
          <button type="button" aria-pressed={dangXem === "detail"}
            onClick={() => setVung("detail")}>Phân công &amp; quyền</button>
        </div>
      )}

      <div className={`op-workspace__luoi op-workspace__luoi--${dangXem}`}>
        <section className="op-vung op-vung--danh-ba" aria-label="Danh bạ nhân sự">
          {directory}
        </section>

        <section className="op-vung op-vung--phan-cong" aria-label="Phân công theo hạng mục">
          {hasSelection ? assignment : (
            <StateBoundary state="empty" title="Chưa chọn người"
              description="Chọn một người ở danh bạ để xem và sửa phân công theo hạng mục." />
          )}
        </section>

        <section className="op-vung op-vung--quyen" aria-label="Quyền thực tế">
          {hasSelection ? rights : (
            <StateBoundary state="empty" title="Chưa chọn người"
              description="Quyền thực tế được tính từ phân công và phạm vi của từng người." />
          )}
        </section>
      </div>
    </div>
  );
}

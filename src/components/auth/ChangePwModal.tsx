/* =====================================================================
 *  ChangePwModal — đổi mật khẩu / đặt lại từ mail khôi phục
 *  (F1 31/08: tách từ App.tsx — named import vì cần NGAY khi bắt sự kiện
 *  PASSWORD_RECOVERY, không đáng một chunk riêng.)
 * ===================================================================== */
import { useState } from "react";
import { KeyRound, CheckCircle2, XCircle } from "lucide-react";
import { C, TEXT, R, btnPrimary } from "../../constants/theme.ts";
import ViewportDialog from "../ui/ViewportDialog.tsx";
import { useRegisterDirtyState } from "../ui/DirtyStateProvider.tsx";
import { isSupabaseConfigured, changePassword, datLaiMatKhauKhoiPhuc } from "../../lib/supabaseClient.ts";
import {
  validateChangePassword,
  changePasswordErrorMessage,
  type ChangePasswordErrors,
} from "../../lib/passwordForm.ts";

export default function ChangePwModal({ onClose, recovery = false }: { onClose: () => void; recovery?: boolean }) {
  const [cu, setCu] = useState("");
  const [moi, setMoi] = useState("");
  const [nhacLai, setNhacLai] = useState("");
  const [loiO, setLoiO] = useState<ChangePasswordErrors>({});
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const loi = validateChangePassword({ cu, moi, nhacLai }, { recovery });
    setLoiO(loi);
    setMsg({ type: "", text: "" });
    if (Object.keys(loi).length > 0) return;
    if (!isSupabaseConfigured()) {
      return setMsg({ type: "err", text: "Cần Supabase để đổi mật khẩu." });
    }
    setLoading(true);
    try {
      if (recovery) await datLaiMatKhauKhoiPhuc(moi);
      else await changePassword(cu, moi);
      setMsg({ type: "ok", text: "Đổi mật khẩu thành công!" });
      setCu(""); setMoi(""); setNhacLai("");
    } catch (e) {
      setMsg({ type: "err", text: changePasswordErrorMessage(e) });
    }
    setLoading(false);
  };

  /* Có chữ trong ô mà chưa lưu thì báo cho sổ chung, để nút Thoát ở shell
     biết mà hỏi lại thay vì vứt mất phần vừa gõ. */
  useRegisterDirtyState("doi-mat-khau",
    (cu.length > 0 || moi.length > 0 || nhacLai.length > 0) && msg.type !== "ok");

  const cacO: Array<{ ten: keyof ChangePasswordErrors; nhan: string; giaTri: string;
    dat: (v: string) => void; autoComplete: string }> = [
    ...(recovery ? [] : [{
      ten: "cu" as const, nhan: "Mật khẩu hiện tại", giaTri: cu, dat: setCu,
      autoComplete: "current-password",
    }]),
    { ten: "moi", nhan: "Mật khẩu mới", giaTri: moi, dat: setMoi, autoComplete: "new-password" },
    { ten: "nhacLai", nhan: "Nhắc lại mật khẩu mới", giaTri: nhacLai, dat: setNhacLai,
      autoComplete: "new-password" },
  ];

  return (
    <ViewportDialog
      open
      title={recovery ? "Đặt mật khẩu mới" : "Đổi mật khẩu"}
      description={recovery
        ? "Bạn vào bằng link email nên không cần mật khẩu cũ. Mật khẩu mới tối thiểu 6 ký tự."
        : "Cần mật khẩu hiện tại để xác minh. Mật khẩu mới tối thiểu 6 ký tự."}
      icon={KeyRound}
      maxWidth={460}
      onRequestClose={onClose}
      footer={
        <button onClick={submit} disabled={loading}
          style={{ ...btnPrimary, minWidth: 140, opacity: loading ? 0.6 : 1 }}>
          {loading ? "Đang lưu…" : "Xác nhận"}
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {cacO.map((o, i) => (
          <label key={o.ten} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.plum }}>{o.nhan}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 42, padding: "0 14px", borderRadius: R.sm, background: C.surface, border: `1px solid ${loiO[o.ten] ? C.raspText : "var(--lp-line-strong)"}` }}>
              <KeyRound size={16} color={C.pink} />
              {/* `data-dialog-focus` chứ không phải `autoFocus`: vỏ hộp thoại
                  đặt tiêu điểm một nhịp sau khi mount và sẽ ghi đè autoFocus,
                  đẩy con trỏ về nút đóng. */}
              <input type="password" value={o.giaTri}
                data-dialog-focus={i === 0 ? "" : undefined}
                autoComplete={o.autoComplete}
                aria-invalid={Boolean(loiO[o.ten])}
                onChange={(e) => { o.dat(e.target.value); setLoiO((l) => ({ ...l, [o.ten]: undefined })); setMsg({ type: "", text: "" }); }}
                style={{ border: "none", outline: "none", background: "transparent", fontFamily: TEXT, fontSize: 14, color: C.plum, width: "100%", fontWeight: 600, minHeight: 40 }} />
            </div>
            {loiO[o.ten] && (
              <span role="alert" style={{ fontSize: 12.5, fontWeight: 700, color: C.raspText, display: "flex", alignItems: "center", gap: 5 }}>
                <XCircle size={13} /> {loiO[o.ten]}
              </span>
            )}
          </label>
        ))}
        {msg.text && (
          <div role={msg.type === "ok" ? "status" : "alert"}
            style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, color: msg.type === "ok" ? C.mintText : C.raspText }}>
            {msg.type === "ok" ? <CheckCircle2 size={15} /> : <XCircle size={15} />} {msg.text}
          </div>
        )}
      </div>
    </ViewportDialog>
  );
}

/* ===================== Data Quality Page (NEW) ===================== */
/* ----------------------------------------------------------------
 * Sức khoẻ dữ liệu — gộp hai màn trước đây tách rời:
 *   · "Data quality" kiểm tra TRÊN BẢN ĐANG XEM ở trình duyệt
 *   · "Kiểm tra máy chủ" chạy kiểm tra THẲNG Ở SUPABASE
 * Hai màn cùng trả lời một câu hỏi ("dữ liệu có sạch không") nên tách ra
 * chỉ khiến người dùng phải tự nhớ cái nào đang xem cái gì. Gộp lại,
 * ghi rõ cái nào chạy ở đâu — chênh nhau giữa hai tab chính là tín hiệu
 * bản trên máy đã cũ.
 * -------------------------------------------------------------- */
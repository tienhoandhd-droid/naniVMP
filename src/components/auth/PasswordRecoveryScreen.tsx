import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, Link2Off, XCircle } from "lucide-react";
import {
  PASSWORD_MIN_LENGTH,
  recoverySessionErrorMessage,
  validateChangePassword,
  type ChangePasswordErrors,
} from "../../lib/passwordForm.ts";
import type { PasswordRecoverySignal } from "../../lib/supabaseClient.ts";
import LuxuryBrandPanel from "./LuxuryBrandPanel.tsx";

type Props = {
  signal: PasswordRecoverySignal;
  onCompleted: () => Promise<void>;
  onRequestNewLink: () => Promise<void>;
};

export default function PasswordRecoveryScreen({ signal, onCompleted, onRequestNewLink }: Props) {
  const [moi, setMoi] = useState("");
  const [nhacLai, setNhacLai] = useState("");
  const [showMoi, setShowMoi] = useState(false);
  const [showNhacLai, setShowNhacLai] = useState(false);
  const [errors, setErrors] = useState<ChangePasswordErrors>({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateChangePassword({ cu: "", moi, nhacLai }, { recovery: true });
    setErrors(nextErrors);
    setServerError("");
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      const { datLaiMatKhauKhoiPhuc, kiemTraPhienKhoiPhuc } = await import("../../lib/supabaseClient.ts");
      await kiemTraPhienKhoiPhuc();
      await datLaiMatKhauKhoiPhuc(moi);
      await onCompleted();
    } catch (error) {
      setServerError(recoverySessionErrorMessage(error));
      setLoading(false);
    }
  };

  const requestNewLink = async () => {
    setLoading(true);
    await onRequestNewLink();
  };

  return (
    <main className="vq-login-page">
      <div className="vq-login-grid">
        <LuxuryBrandPanel />
        <section className="vq-login-panel" aria-labelledby="vmp-recovery-title">
          <img className="vq-login-logo" src="./logo-cpc1hn.png"
            alt="CPC1 HN — Công ty Cổ phần Dược phẩm Trung ương CPC1 Hà Nội" />

          {signal === "invalid" ? (
            <div className="vq-recovery-invalid">
              <Link2Off size={28} aria-hidden="true" />
              <div className="vq-login-intro">
                <p className="vq-login-kicker">BẢO MẬT TÀI KHOẢN</p>
                <h1 id="vmp-recovery-title">Liên kết không còn hiệu lực</h1>
                <p>Liên kết đặt lại mật khẩu đã hết hạn hoặc không hợp lệ. Hãy yêu cầu một liên kết mới.</p>
              </div>
              <button className="vq-luxury-btn" type="button" onClick={requestNewLink}
                disabled={loading} aria-busy={loading}>
                {loading ? "Đang chuyển…" : "Yêu cầu liên kết mới"}
              </button>
            </div>
          ) : (
            <>
              <div className="vq-login-intro">
                <p className="vq-login-kicker">BẢO MẬT TÀI KHOẢN</p>
                <h1 id="vmp-recovery-title">Đặt mật khẩu mới</h1>
                <p>Chọn mật khẩu mới cho tài khoản VMP Monitor của bạn.</p>
              </div>

              <form className="vq-login-form" onSubmit={submit} noValidate>
                <p id="vmp-recovery-rule" className="vq-recovery-rule">
                  <KeyRound size={15} aria-hidden="true" /> Tối thiểu {PASSWORD_MIN_LENGTH} ký tự
                </p>
                <RecoveryPasswordField
                  id="vmp-recovery-password"
                  label="Mật khẩu mới"
                  value={moi}
                  show={showMoi}
                  autoFocus
                  error={errors.moi}
                  describedBy="vmp-recovery-rule"
                  onToggle={() => setShowMoi((current) => !current)}
                  onChange={(value) => {
                    setMoi(value);
                    setErrors((current) => ({ ...current, moi: undefined }));
                    setServerError("");
                  }}
                />
                <RecoveryPasswordField
                  id="vmp-recovery-confirm"
                  label="Nhập lại mật khẩu"
                  value={nhacLai}
                  show={showNhacLai}
                  error={errors.nhacLai}
                  onToggle={() => setShowNhacLai((current) => !current)}
                  onChange={(value) => {
                    setNhacLai(value);
                    setErrors((current) => ({ ...current, nhacLai: undefined }));
                    setServerError("");
                  }}
                />

                {serverError && (
                  <p className="vq-login-error vq-login-error--server" role="alert">
                    <XCircle size={15} aria-hidden="true" />{serverError}
                  </p>
                )}

                <button className="vq-luxury-btn" type="submit" disabled={loading} aria-busy={loading}>
                  {loading ? "Đang lưu…" : "Lưu mật khẩu mới"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function RecoveryPasswordField({ id, label, value, show, error, describedBy, autoFocus = false,
  onToggle, onChange }: {
  id: string;
  label: string;
  value: string;
  show: boolean;
  error?: string;
  describedBy?: string;
  autoFocus?: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
}) {
  const errorId = `${id}-error`;
  const ariaDescribedBy = [describedBy, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="vq-login-field">
      <label htmlFor={id}>{label}</label>
      <div className="vq-input-shell">
        <KeyRound size={18} aria-hidden="true" />
        <input id={id} name={id} type={show ? "text" : "password"}
          autoComplete="new-password" autoFocus={autoFocus} value={value}
          aria-invalid={Boolean(error)} aria-describedby={ariaDescribedBy}
          onChange={(event) => onChange(event.target.value)} />
        <button className="vq-password-toggle" type="button" aria-pressed={show}
          aria-label={show ? `Ẩn ${label.toLowerCase()}` : `Hiện ${label.toLowerCase()}`}
          onClick={onToggle}>
          {show ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
        </button>
      </div>
      {error && (
        <p id={errorId} className="vq-login-error" role="alert">
          <XCircle size={15} aria-hidden="true" />{error}
        </p>
      )}
    </div>
  );
}

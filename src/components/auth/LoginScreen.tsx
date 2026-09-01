import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowBigUp, ArrowLeft, Boxes, CheckCircle2, Eye, EyeOff,
  Lock, MailCheck, RotateCcw, XCircle,
} from "lucide-react";
import type { AppUser } from "../../types/domain.ts";
import { emailError, loginErrorMessage, validateLogin, type LoginErrors } from "../../lib/loginForm.ts";
import { resetMailErrorMessage } from "../../lib/passwordForm.ts";
import { isSupabaseConfigured } from "../../lib/supabaseConfig.ts";
import LuxuryBrandPanel from "./LuxuryBrandPanel.tsx";

const DAILY_WISHES = [
  "Một ngày mới — một cơ hội mới để làm điều tử tế.",
  "Bạn đang góp phần bảo vệ chất lượng cuộc sống của rất nhiều người.",
  "Mỗi nỗ lực hôm nay là nền móng cho một ngày mai vững chắc hơn.",
  "Hãy tin vào những gì bạn đang làm — nó quan trọng hơn bạn nghĩ.",
  "Hôm nay là một ngày tuyệt vời để học thêm một điều mới.",
  "Chúc bạn một ngày làm việc trọn vẹn niềm vui và bình an.",
  "Sự tử tế và chỉn chu của bạn hôm nay sẽ tạo nên sự khác biệt.",
  "Việc bạn làm hôm nay quan trọng — vì sau mỗi quy trình là một con người.",
  "Hãy bắt đầu nhẹ nhàng, kết thúc trọn vẹn. Chúc bạn một ngày tốt lành.",
  "Cảm ơn bạn đã có mặt hôm nay — V/Q Team luôn cần bạn.",
];

function getTimeOfDayGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "Chào buổi sáng! Chúc bạn một ngày mới tràn đầy năng lượng.";
  if (hour >= 11 && hour < 13) return "Chúc bạn một buổi trưa thật nhẹ nhàng và ngon miệng.";
  if (hour >= 13 && hour < 17) return "Chào buổi chiều! Chúc bạn tiếp tục một buổi chiều hiệu quả.";
  if (hour >= 17 && hour < 22) return "Chào buổi tối! Cảm ơn vì sự nỗ lực của bạn hôm nay.";
  return "Khuya rồi — nhớ chăm sóc sức khoẻ bạn nhé.";
}

function getDailyWish() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.now() - start.getTime()) / 86400000);
  return DAILY_WISHES[dayOfYear % DAILY_WISHES.length];
}

export type LoginScreenMode = "login" | "forgot";
type AuthStep = LoginScreenMode | "forgot-sent";

type Props = {
  onLogin: (profile: AppUser) => void;
  initialMode?: LoginScreenMode;
  notice?: string;
};

export default function LoginScreen({ onLogin, initialMode = "login", notice = "" }: Props) {
  const useSupa = isSupabaseConfigured();
  const [step, setStep] = useState<AuthStep>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<LoginErrors>({});
  const [serverError, setServerError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [clock, setClock] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);

  useEffect(() => setStep(initialMode), [initialMode]);

  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return; }
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (step !== "forgot-sent" || resendAt <= Date.now()) return;
    setClock(Date.now());
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [resendAt, step]);

  const secondsLeft = Math.max(0, Math.ceil((resendAt - clock) / 1000));

  const clearFieldError = (field: keyof LoginErrors) => {
    setErrors((current) => ({ ...current, [field]: undefined }));
    setServerError("");
  };

  const soatCapsLock = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof event.getModifierState === "function") {
      setCapsLock(event.getModifierState("CapsLock"));
    }
  };

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateLogin({ email, password });
    setErrors(nextErrors);
    setServerError("");
    if (Object.keys(nextErrors).length > 0) return;
    if (!useSupa) {
      setServerError("Hệ thống chưa cấu hình Supabase Auth. Liên hệ IT để thiết lập VITE_SUPABASE_URL và VITE_SUPABASE_ANON.");
      return;
    }

    setLoading(true);
    try {
      const { signIn } = await import("../../lib/supabaseClient.ts");
      const profile = await signIn(email.trim(), password);
      onLogin(profile);
    } catch (error) {
      setServerError(loginErrorMessage(error));
      setLoading(false);
    }
  };

  const sendRecoveryMail = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const emailIssue = emailError(email);
    setErrors(emailIssue ? { email: emailIssue } : {});
    setServerError("");
    if (emailIssue) return;
    if (!useSupa) {
      setServerError("Hệ thống chưa cấu hình Supabase Auth. Liên hệ IT.");
      return;
    }

    setLoading(true);
    try {
      const { guiMailQuenMatKhau } = await import("../../lib/supabaseClient.ts");
      await guiMailQuenMatKhau(email.trim());
      const now = Date.now();
      setClock(now);
      setResendAt(now + 60_000);
      setStep("forgot-sent");
    } catch (error) {
      setServerError(resetMailErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const goToForgot = () => {
    setPassword("");
    setShowPassword(false);
    setCapsLock(false);
    setErrors({});
    setServerError("");
    setStep("forgot");
  };

  const goToLogin = () => {
    setPassword("");
    setErrors({});
    setServerError("");
    setStep("login");
  };

  const title = step === "login" ? "Đăng nhập VMP Monitor"
    : step === "forgot" ? "Khôi phục mật khẩu" : "Kiểm tra email của bạn";
  const description = step === "login" ? getTimeOfDayGreeting()
    : step === "forgot"
      ? "Nhập email công việc để nhận liên kết đặt lại mật khẩu."
      : "Liên kết bảo mật đã được gửi nếu email này thuộc hệ thống.";

  return (
    <main className="vq-login-page">
      <div className="vq-login-grid">
        <LuxuryBrandPanel />
        <section className="vq-login-panel" aria-labelledby="vmp-login-title" data-auth-step={step}>
          <img className="vq-login-logo" src="./logo-cpc1hn.png"
            alt="CPC1 HN — Công ty Cổ phần Dược phẩm Trung ương CPC1 Hà Nội" />

          <div className="vq-login-intro">
            <p className="vq-login-kicker">V/Q TEAM · CPC1 HN</p>
            <h1 id="vmp-login-title" ref={headingRef} tabIndex={-1}>{title}</h1>
            <p>{description}</p>
          </div>

          {step === "login" && (
            <form className="vq-login-form" onSubmit={submitLogin} noValidate>
              {notice && (
                <p className="vq-login-success" role="status" aria-live="polite">
                  <CheckCircle2 size={16} aria-hidden="true" />{notice}
                </p>
              )}
              <EmailField email={email} error={errors.email} autoFocus
                onChange={(value) => { setEmail(value); clearFieldError("email"); }} />

              <div className="vq-login-field">
                <div className="vq-login-password-label-row">
                  <label htmlFor="vmp-login-password">Mật khẩu</label>
                  <button type="button" className="vq-login-quen" onClick={goToForgot}>
                    Quên mật khẩu?
                  </button>
                </div>
                <div className="vq-input-shell">
                  <Lock size={18} aria-hidden="true" />
                  <input id="vmp-login-password" name="password"
                    type={showPassword ? "text" : "password"} autoComplete="current-password"
                    value={password}
                    onChange={(event) => { setPassword(event.target.value); clearFieldError("password"); }}
                    onKeyUp={soatCapsLock} onKeyDown={soatCapsLock}
                    onBlur={() => setCapsLock(false)} aria-invalid={Boolean(errors.password)}
                    aria-describedby={[
                      errors.password ? "vmp-login-password-error" : null,
                      capsLock ? "vmp-login-caps" : null,
                    ].filter(Boolean).join(" ") || undefined} />
                  <button className="vq-password-toggle" type="button" aria-pressed={showPassword}
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>
                    {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                  </button>
                </div>
                {errors.password && (
                  <p id="vmp-login-password-error" className="vq-login-error" role="alert">
                    <XCircle size={15} aria-hidden="true" />{errors.password}
                  </p>
                )}
                {capsLock && (
                  <p id="vmp-login-caps" className="vq-login-caps" role="status">
                    <ArrowBigUp size={15} aria-hidden="true" />Caps Lock đang bật
                  </p>
                )}
              </div>

              {serverError && <ServerError text={serverError} />}
              <button className="vq-luxury-btn" type="submit" disabled={loading} aria-busy={loading}>
                {loading ? "Đang đăng nhập…" : "Đăng nhập"}
              </button>
            </form>
          )}

          {step === "forgot" && (
            <form className="vq-login-form" onSubmit={sendRecoveryMail} noValidate>
              <EmailField email={email} error={errors.email} autoFocus
                onChange={(value) => { setEmail(value); clearFieldError("email"); }} />
              {serverError && <ServerError text={serverError} />}
              <button className="vq-luxury-btn" type="submit" disabled={loading} aria-busy={loading}>
                {loading ? "Đang gửi…" : "Gửi liên kết đặt lại"}
              </button>
              <button className="vq-auth-back" type="button" onClick={goToLogin}>
                <ArrowLeft size={16} aria-hidden="true" />Quay lại đăng nhập
              </button>
            </form>
          )}

          {step === "forgot-sent" && (
            <div className="vq-recovery-sent">
              <span className="vq-recovery-sent__icon"><MailCheck size={24} aria-hidden="true" /></span>
              <p role="status" aria-live="polite">
                Nếu email này thuộc hệ thống, liên kết đặt lại đã được gửi tới:
              </p>
              <strong>{email.trim()}</strong>
              <small>Kiểm tra Hộp thư đến và cả mục Spam. Liên kết chỉ dùng được trong thời gian giới hạn.</small>
              <button className="vq-luxury-btn" type="button" onClick={goToLogin}>Quay lại đăng nhập</button>
              <button className="vq-auth-resend" type="button" onClick={() => sendRecoveryMail()}
                disabled={loading || secondsLeft > 0} aria-busy={loading}>
                <RotateCcw size={15} aria-hidden="true" />
                {loading ? "Đang gửi lại…" : secondsLeft > 0 ? `Gửi lại sau ${secondsLeft}s` : "Gửi lại liên kết"}
              </button>
            </div>
          )}

          {useSupa && step === "login" ? (
            <aside className="vq-daily-wish" aria-label="Lời chúc hôm nay">
              <span>✦ &nbsp; LỜI CHÚC HÔM NAY &nbsp; ✦</span>
              <p>“{getDailyWish()}”</p>
            </aside>
          ) : !useSupa ? (
            <aside className="vq-login-notice" role="status">
              <strong>Chế độ tạm (chưa có Supabase)</strong>
              <span>Liên hệ IT để thiết lập xác thực trước khi đăng nhập.</span>
            </aside>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function EmailField({ email, error, autoFocus = false, onChange }: {
  email: string;
  error?: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="vq-login-field">
      <label htmlFor="vmp-login-email">Email công việc</label>
      <div className="vq-input-shell">
        <Boxes size={18} aria-hidden="true" />
        <input id="vmp-login-email" name="email" type="email" autoComplete="email"
          inputMode="email" autoFocus={autoFocus} value={email}
          onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)}
          aria-describedby={error ? "vmp-login-email-error" : undefined} />
      </div>
      {error && (
        <p id="vmp-login-email-error" className="vq-login-error" role="alert">
          <XCircle size={15} aria-hidden="true" />{error}
        </p>
      )}
    </div>
  );
}

function ServerError({ text }: { text: string }) {
  return (
    <p className="vq-login-error vq-login-error--server" role="alert">
      <XCircle size={15} aria-hidden="true" />{text}
    </p>
  );
}

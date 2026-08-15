import { useState, type FormEvent } from "react";
import { ArrowBigUp, Boxes, Eye, EyeOff, Lock, XCircle } from "lucide-react";
import type { AppUser } from "../../types/domain.ts";
import { loginErrorMessage, validateLogin, type LoginErrors } from "../../lib/loginForm.ts";
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

export default function LoginScreen({ onLogin }: { onLogin: (profile: AppUser) => void }) {
  const useSupa = isSupabaseConfigured();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<LoginErrors>({});
  const [serverError, setServerError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  /* Caps Lock bật mà không ai báo là một trong những lý do "sai mật khẩu"
     phổ biến nhất — người dùng gõ đúng, hệ thống từ chối, và không ai
     hiểu vì sao. Ô mật khẩu che ký tự nên mắt không tự phát hiện được.
     GitHub, Google và hầu hết trang đăng nhập được làm kỹ đều cảnh báo. */
  const [capsLock, setCapsLock] = useState(false);
  const soatCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === "function") setCapsLock(e.getModifierState("CapsLock"));
  };
  const [loading, setLoading] = useState(false);

  const clearFieldError = (field: keyof LoginErrors) => {
    setErrors((current) => ({ ...current, [field]: undefined }));
    setServerError("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
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
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="vq-login-page">
      <div className="vq-login-grid">
        <LuxuryBrandPanel />
        <section className="vq-login-panel" aria-labelledby="vmp-login-title">
          {/* Logo đặt trên nền sứ, không khung: đây là nền duy nhất trong
              màn này đủ sáng để hai sắc đỏ và navy của nó hiện đúng. */}
          <img className="vq-login-logo" src="./logo-cpc1hn.png"
            alt="CPC1 HN — Công ty Cổ phần Dược phẩm Trung ương CPC1 Hà Nội" />

          <div className="vq-login-intro">
            <p className="vq-login-kicker">V/Q TEAM · CPC1 HN</p>
            <h1 id="vmp-login-title">Đăng nhập VMP Monitor</h1>
            <p>{getTimeOfDayGreeting()}</p>
          </div>

          <form className="vq-login-form" onSubmit={submit} noValidate>
            <div className="vq-login-field">
              <label htmlFor="vmp-login-email">Email công việc</label>
              <div className="vq-input-shell">
                <Boxes size={18} aria-hidden="true" />
                <input
                  id="vmp-login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  /* Màn này chỉ có một việc để làm, và ô này là bước đầu
                     tiên của việc đó — đưa tiêu điểm vào sẵn giúp bỏ được
                     một cú bấm/Tab cho MỌI lần đăng nhập. */
                  autoFocus
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); clearFieldError("email"); }}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "vmp-login-email-error" : undefined}
                />
              </div>
              {errors.email && <p id="vmp-login-email-error" className="vq-login-error" role="alert"><XCircle size={15} aria-hidden="true" />{errors.email}</p>}
            </div>

            <div className="vq-login-field">
              <label htmlFor="vmp-login-password">Mật khẩu</label>
              <div className="vq-input-shell">
                <Lock size={18} aria-hidden="true" />
                <input
                  id="vmp-login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); clearFieldError("password"); }}
                  onKeyUp={soatCapsLock}
                  onKeyDown={soatCapsLock}
                  onBlur={() => setCapsLock(false)}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={[
                    errors.password ? "vmp-login-password-error" : null,
                    capsLock ? "vmp-login-caps" : null,
                  ].filter(Boolean).join(" ") || undefined}
                />
                <button className="vq-password-toggle" type="button"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>
                  {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
              {errors.password && <p id="vmp-login-password-error" className="vq-login-error" role="alert"><XCircle size={15} aria-hidden="true" />{errors.password}</p>}
              {capsLock && (
                <p id="vmp-login-caps" className="vq-login-caps" role="status">
                  <ArrowBigUp size={15} aria-hidden="true" />Caps Lock đang bật
                </p>
              )}
            </div>

            {serverError && <p className="vq-login-error vq-login-error--server" role="alert"><XCircle size={15} aria-hidden="true" />{serverError}</p>}

            <button className="vq-luxury-btn" type="submit" disabled={loading} aria-busy={loading}>
              {loading ? "Đang đăng nhập…" : "Đăng nhập"}
            </button>
          </form>

          {useSupa ? (
            <aside className="vq-daily-wish" aria-label="Lời chúc hôm nay">
              <span>✦ &nbsp; LỜI CHÚC HÔM NAY &nbsp; ✦</span>
              <p>“{getDailyWish()}”</p>
            </aside>
          ) : (
            <aside className="vq-login-notice" role="status">
              <strong>Chế độ tạm (chưa có Supabase)</strong>
              <span>Liên hệ IT để thiết lập xác thực trước khi đăng nhập.</span>
            </aside>
          )}
        </section>
      </div>
    </main>
  );
}

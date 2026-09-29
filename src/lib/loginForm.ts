export interface LoginValues {
  email: string;
  password: string;
}

export type LoginErrors = Partial<Record<keyof LoginValues, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/** Lỗi của riêng ô email — dùng chung cho đăng nhập và quên mật khẩu. */
export function emailError(email: string): string | undefined {
  const normalized = email.trim();
  if (!normalized) return "Vui lòng nhập email";
  if (!EMAIL.test(normalized)) return "Email không hợp lệ";
  return undefined;
}

export function validateLogin({ email, password }: LoginValues): LoginErrors {
  const errors: LoginErrors = {};
  const loiEmail = emailError(email);
  if (loiEmail) errors.email = loiEmail;
  if (!password) errors.password = "Vui lòng nhập mật khẩu";
  return errors;
}

export function loginErrorMessage(error: unknown): string {
  const detail = error && typeof error === "object" ? error as { message?: unknown; status?: unknown; code?: unknown } : {};
  const message = typeof detail.message === "string" ? detail.message : String(error ?? "");
  if (detail.status === 429 || /rate_limit/.test(String(detail.code ?? "")) || /rate limit|too many requests/i.test(message)) {
    return "Có quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau ít phút.";
  }
  if (typeof detail.status === "number" && detail.status >= 500) return "Máy chủ tạm thời không sẵn sàng. Vui lòng thử lại.";
  if (detail.code === "invalid_credentials" || /invalid login credentials/i.test(message)) return "Email hoặc mật khẩu chưa đúng";
  if (/network|fetch/i.test(message)) return "Không kết nối được máy chủ. Vui lòng thử lại";
  return "Vui lòng kiểm tra email và mật khẩu";
}

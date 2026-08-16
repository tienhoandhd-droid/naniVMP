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
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/invalid login credentials/i.test(message)) return "Email hoặc mật khẩu chưa đúng";
  if (/network|fetch/i.test(message)) return "Không kết nối được máy chủ. Vui lòng thử lại";
  return "Vui lòng kiểm tra email và mật khẩu";
}

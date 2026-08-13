export interface LoginValues {
  email: string;
  password: string;
}

export type LoginErrors = Partial<Record<keyof LoginValues, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function validateLogin({ email, password }: LoginValues): LoginErrors {
  const errors: LoginErrors = {};
  const normalized = email.trim();
  if (!normalized) errors.email = "Vui lòng nhập email";
  else if (!EMAIL.test(normalized)) errors.email = "Email không hợp lệ";
  if (!password) errors.password = "Vui lòng nhập mật khẩu";
  return errors;
}

export function loginErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/invalid login credentials/i.test(message)) return "Email hoặc mật khẩu chưa đúng";
  if (/network|fetch/i.test(message)) return "Không kết nối được máy chủ. Vui lòng thử lại";
  return "Vui lòng kiểm tra email và mật khẩu";
}

const MESSAGE_LIMIT = 2_000;
const STACK_LIMIT = 8_000;
const URL_LIMIT = 500;

const URL_USERINFO = /\b((?:https?|file):\/\/)[^/@\s]+@/gi;
const EMBEDDED_URL_DETAILS = /((?:https?:\/\/|file:\/\/|\/)[^\s"'<>?#]*)(?:[?#][^\s"'<>]*)/gi;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const BASIC_CREDENTIALS = /\bBasic\s+[A-Za-z0-9+/]+={0,2}/gi;
const JWT = /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const JSON_CREDENTIAL_ASSIGNMENT = /("(?:password|passwd|pwd|access[_-]?token|refresh[_-]?token|token|api[_-]?key|apikey|key|secret|authorization)"\s*:\s*)"(?:\\.|[^"\\])*"/gi;
const CREDENTIAL_ASSIGNMENT = /\b(password|passwd|pwd|access[_-]?token|refresh[_-]?token|token|api[_-]?key|apikey|key|secret|authorization)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function sanitizeText(value: string): string {
  return value
    .replace(URL_USERINFO, "$1[REDACTED]@")
    .replace(EMBEDDED_URL_DETAILS, "$1")
    .replace(BEARER_TOKEN, "Bearer [REDACTED]")
    .replace(BASIC_CREDENTIALS, "[REDACTED]")
    .replace(JWT, "[REDACTED]")
    .replace(JSON_CREDENTIAL_ASSIGNMENT, '$1"[REDACTED]"')
    .replace(CREDENTIAL_ASSIGNMENT, "$1$2[REDACTED]")
    .replace(EMAIL, "[REDACTED_EMAIL]");
}

function safePath(value: string): string {
  const withoutDetails = value.split(/[?#]/, 1)[0] ?? "";
  try {
    return new URL(withoutDetails, "https://diagnostic.invalid").pathname || "/";
  } catch {
    return withoutDetails.startsWith("/") && !withoutDetails.startsWith("//")
      ? withoutDetails
      : "/";
  }
}

export function sanitizeClientError(
  message: string,
  stack: string | null,
  url: string,
): { message: string; stack: string | null; url: string } {
  return {
    message: sanitizeText(typeof message === "string" ? message : "").slice(0, MESSAGE_LIMIT),
    stack: stack === null
      ? null
      : sanitizeText(typeof stack === "string" ? stack : "").slice(0, STACK_LIMIT),
    url: sanitizeText(safePath(typeof url === "string" ? url : "")).slice(0, URL_LIMIT),
  };
}

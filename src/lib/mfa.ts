import { supabase } from "./supabaseClient.ts";

export type MfaFactor = {
  id: string;
  factor_type?: string;
  status?: string;
  friendly_name?: string;
};

export type MfaAssessment =
  | { kind: "no-session" }
  | { kind: "challenge-required"; userId: string; verifiedFactors: MfaFactor[] }
  | { kind: "allowed"; userId: string; assurance: "aal1" | "aal2"; verifiedFactors: MfaFactor[] };

export class MfaSecurityError extends Error {
  code: string;
  cause?: unknown;

  constructor(code: string, cause?: unknown) {
    super(code);
    this.name = "MfaSecurityError";
    this.code = code;
    this.cause = cause;
  }
}

type Result<T> = Promise<{ data: T; error: unknown | null }>;

export type MfaClient = {
  auth: {
    getSession(): Result<{ session: { user: { id: string } } | null }>;
    mfa: {
      listFactors(): Result<{ all?: MfaFactor[]; totp?: MfaFactor[] }>;
      getAuthenticatorAssuranceLevel(): Result<{
        currentLevel: "aal1" | "aal2" | null;
        nextLevel: "aal1" | "aal2" | null;
        currentAuthenticationMethods?: unknown[];
      }>;
      challengeAndVerify(args: { factorId: string; code: string }): Result<unknown>;
      enroll(args: { factorType: "totp"; friendlyName?: string }): Result<{
        id: string;
        type?: string;
        totp?: { qr_code?: string; secret?: string; uri?: string };
      }>;
      unenroll(args: { factorId: string }): Result<unknown>;
    };
  };
};

function configuredClient(candidate?: MfaClient): MfaClient {
  const value = candidate ?? (supabase as unknown as MfaClient | null);
  if (!value) throw new MfaSecurityError("MFA_NOT_CONFIGURED");
  return value;
}

function checked<T>(result: { data: T; error: unknown | null }, code: string): T {
  if (result.error || !result.data) throw new MfaSecurityError(code, result.error);
  return result.data;
}

async function sessionUserId(client: MfaClient): Promise<string | null> {
  const data = checked(await client.auth.getSession(), "MFA_SESSION_CHECK_FAILED");
  const uid = data.session?.user?.id;
  if (data.session && (typeof uid !== "string" || !uid)) {
    throw new MfaSecurityError("MFA_SESSION_INVALID");
  }
  return uid ?? null;
}

function verifiedTotpFactors(data: { all?: MfaFactor[]; totp?: MfaFactor[] }): MfaFactor[] {
  const factors = Array.isArray(data.totp) ? data.totp : data.all;
  if (!Array.isArray(factors)) throw new MfaSecurityError("MFA_FACTORS_INVALID");
  return factors.filter((factor) => factor?.factor_type === "totp" && factor.status === "verified")
    .map((factor) => ({ ...factor }));
}

export async function assessMfa(candidate?: MfaClient): Promise<MfaAssessment> {
  const client = configuredClient(candidate);
  const userId = await sessionUserId(client);
  if (!userId) return { kind: "no-session" };

  const factorData = checked(await client.auth.mfa.listFactors(), "MFA_FACTORS_CHECK_FAILED");
  const verifiedFactors = verifiedTotpFactors(factorData);
  const levels = checked(
    await client.auth.mfa.getAuthenticatorAssuranceLevel(),
    "MFA_ASSURANCE_CHECK_FAILED",
  );
  const currentLevel = levels.currentLevel;
  const nextLevel = levels.nextLevel;
  if ((currentLevel !== "aal1" && currentLevel !== "aal2")
      || (nextLevel !== "aal1" && nextLevel !== "aal2")) {
    throw new MfaSecurityError("MFA_ASSURANCE_INVALID");
  }

  if (verifiedFactors.length > 0 && currentLevel !== "aal2") {
    if (nextLevel !== "aal2") throw new MfaSecurityError("MFA_ASSURANCE_INCONSISTENT");
    return { kind: "challenge-required", userId, verifiedFactors };
  }
  return { kind: "allowed", userId, assurance: currentLevel, verifiedFactors };
}

export async function requireMfaChallenge(candidate?: MfaClient): Promise<boolean> {
  return (await assessMfa(candidate)).kind === "challenge-required";
}

export function validateTotpCode(code: string): boolean {
  return /^[0-9]{6}$/.test(code);
}

export async function challengeAndVerifyTotp(
  candidate: MfaClient | undefined,
  args: { factorId: string; code: string; expectedUserId: string },
): Promise<void> {
  const client = configuredClient(candidate);
  if (!validateTotpCode(args.code)) throw new MfaSecurityError("MFA_CODE_INVALID");
  const before = await sessionUserId(client);
  if (!before || before !== args.expectedUserId) throw new MfaSecurityError("SESSION_CHANGED");

  const factors = verifiedTotpFactors(checked(
    await client.auth.mfa.listFactors(),
    "MFA_FACTORS_CHECK_FAILED",
  ));
  if (!factors.some((factor) => factor.id === args.factorId)) {
    throw new MfaSecurityError("MFA_FACTOR_INVALID");
  }
  checked(
    await client.auth.mfa.challengeAndVerify({ factorId: args.factorId, code: args.code }),
    "MFA_VERIFY_FAILED",
  );
  const after = await sessionUserId(client);
  if (after !== args.expectedUserId) throw new MfaSecurityError("SESSION_CHANGED");
  const decision = await assessMfa(client);
  if (decision.kind !== "allowed" || decision.userId !== args.expectedUserId
      || decision.assurance !== "aal2") {
    throw new MfaSecurityError("MFA_VERIFY_NOT_ASSURED");
  }
}

export type TotpEnrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
};

export async function startTotpEnrollment(
  candidate?: MfaClient,
  friendlyName = "VMP",
  expectedUserId?: string,
): Promise<TotpEnrollment> {
  const client = configuredClient(candidate);
  const userId = await sessionUserId(client);
  if (!userId) throw new MfaSecurityError("MFA_SESSION_REQUIRED");
  if (expectedUserId && userId !== expectedUserId) throw new MfaSecurityError("SESSION_CHANGED");
  const existing = verifiedTotpFactors(checked(
    await client.auth.mfa.listFactors(),
    "MFA_FACTORS_CHECK_FAILED",
  ));
  if (existing.length > 0) throw new MfaSecurityError("MFA_ALREADY_ENROLLED");
  const data = checked(
    await client.auth.mfa.enroll({ factorType: "totp", friendlyName }),
    "MFA_ENROLL_FAILED",
  );
  if (!data.id || !data.totp?.qr_code || !data.totp.secret) {
    throw new MfaSecurityError("MFA_ENROLL_RESPONSE_INVALID");
  }
  if (await sessionUserId(client) !== userId) {
    // Best effort only: the SDK may already have moved to the new account,
    // but never expose QR/secret from an enrollment whose owner is uncertain.
    await client.auth.mfa.unenroll({ factorId: data.id }).catch(() => undefined);
    throw new MfaSecurityError("SESSION_CHANGED");
  }
  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri ?? "",
  };
}

export async function verifyTotpEnrollment(
  candidate: MfaClient | undefined,
  args: {
    factorId: string;
    code: string;
    expectedUserId: string;
    beforeVerify?: () => void;
  },
): Promise<void> {
  const client = configuredClient(candidate);
  if (!validateTotpCode(args.code)) throw new MfaSecurityError("MFA_CODE_INVALID");
  if (await sessionUserId(client) !== args.expectedUserId) throw new MfaSecurityError("SESSION_CHANGED");
  const data = checked(await client.auth.mfa.listFactors(), "MFA_FACTORS_CHECK_FAILED");
  const factors = Array.isArray(data.all) ? data.all : data.totp;
  if (!Array.isArray(factors)
      || !factors.some((factor) => factor?.id === args.factorId
        && factor.factor_type === "totp" && factor.status === "unverified")) {
    throw new MfaSecurityError("MFA_FACTOR_INVALID");
  }
  // Verification emits an auth event synchronously in some SDK paths. The
  // owner must stop treating this factor as cleanup-eligible before that event.
  args.beforeVerify?.();
  checked(
    await client.auth.mfa.challengeAndVerify({ factorId: args.factorId, code: args.code }),
    "MFA_VERIFY_FAILED",
  );
  if (await sessionUserId(client) !== args.expectedUserId) throw new MfaSecurityError("SESSION_CHANGED");
  const decision = await assessMfa(client);
  if (decision.kind !== "allowed" || decision.userId !== args.expectedUserId
      || decision.assurance !== "aal2") {
    throw new MfaSecurityError("MFA_VERIFY_NOT_ASSURED");
  }
}

export async function unenrollVerifiedTotp(
  candidate: MfaClient | undefined,
  args: { factorId: string; code: string; expectedUserId: string },
): Promise<void> {
  const client = configuredClient(candidate);
  if (!validateTotpCode(args.code)) throw new MfaSecurityError("MFA_CODE_INVALID");
  if (await sessionUserId(client) !== args.expectedUserId) throw new MfaSecurityError("SESSION_CHANGED");
  const factors = verifiedTotpFactors(checked(
    await client.auth.mfa.listFactors(),
    "MFA_FACTORS_CHECK_FAILED",
  ));
  if (!factors.some((factor) => factor.id === args.factorId)) {
    throw new MfaSecurityError("MFA_FACTOR_INVALID");
  }
  checked(
    await client.auth.mfa.challengeAndVerify({ factorId: args.factorId, code: args.code }),
    "MFA_VERIFY_FAILED",
  );
  if (await sessionUserId(client) !== args.expectedUserId) throw new MfaSecurityError("SESSION_CHANGED");
  const decision = await assessMfa(client);
  if (decision.kind !== "allowed" || decision.userId !== args.expectedUserId
      || decision.assurance !== "aal2") {
    throw new MfaSecurityError("MFA_VERIFY_NOT_ASSURED");
  }
  checked(await client.auth.mfa.unenroll({ factorId: args.factorId }), "MFA_UNENROLL_FAILED");
}

export async function cleanupUnverifiedFactor(
  candidate: MfaClient | undefined,
  factorId: string,
  expectedUserId: string,
): Promise<boolean> {
  const client = configuredClient(candidate);
  if (await sessionUserId(client) !== expectedUserId) return false;
  const factorData = checked(await client.auth.mfa.listFactors(), "MFA_FACTORS_CHECK_FAILED");
  const factors = Array.isArray(factorData.all) ? factorData.all : factorData.totp;
  if (!Array.isArray(factors)) throw new MfaSecurityError("MFA_FACTORS_INVALID");
  const factor = factors.find((item) => item?.id === factorId);
  if (!factor || factor.status !== "unverified" || factor.factor_type !== "totp") return false;
  checked(await client.auth.mfa.unenroll({ factorId }), "MFA_CLEANUP_FAILED");
  return true;
}

export function mfaErrorMessage(error: unknown): string {
  const outer = error as { code?: string; status?: number; message?: string; cause?: unknown } | null;
  const cause = outer?.cause as { code?: string; status?: number; message?: string } | null;
  const candidate = {
    code: cause?.code ?? outer?.code,
    status: cause?.status ?? outer?.status,
    message: cause?.message ?? outer?.message,
  };
  if (candidate?.status === 429 || /rate|too many/i.test(candidate?.code ?? "")) {
    return "Bạn đã thử quá nhiều lần. Vui lòng chờ rồi thử lại.";
  }
  if (/network|fetch|offline/i.test(candidate?.message ?? "")) {
    return "Không kết nối được máy chủ. Vui lòng thử lại.";
  }
  if (candidate?.code === "MFA_CODE_INVALID") return "Mã xác thực phải gồm đúng 6 chữ số.";
  if (candidate?.code === "SESSION_CHANGED") return "Tài khoản đã thay đổi. Vui lòng đăng nhập lại.";
  return "Mã xác thực chưa đúng hoặc đã hết hạn. Vui lòng thử lại.";
}

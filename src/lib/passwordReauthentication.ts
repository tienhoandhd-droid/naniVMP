import { createClient } from "@supabase/supabase-js";

import type { Database } from "../types/database.ts";
import { supabaseAnonKey, supabaseUrl } from "./supabaseConfig.ts";

type Result<T> = Promise<{ data: T | null; error: unknown | null }>;

type MainAuthClient = {
  auth: {
    getSession(): Result<{ session: { user: { id: string; email?: string }; access_token?: string } | null }>;
    getUser(jwt?: string): Result<{ user: { id: string; factors?: Array<{ status?: string }> } | null }>;
  };
};

type IsolatedAuthClient = {
  auth: {
    signInWithPassword(credentials: { email: string; password: string }): Result<{
      user: { id: string } | null;
      session: { user: { id: string } } | null;
    }>;
    signOut(options: { scope: "local" }): Promise<{ error: unknown | null }>;
  };
};

export class PasswordReauthenticationError extends Error {
  code: string;
  cause?: unknown;

  constructor(code: string, cause?: unknown) {
    super(code);
    this.name = "PasswordReauthenticationError";
    this.code = code;
    this.cause = cause;
  }
}

export type BoundPasswordUpdate = (args: {
  accessToken: string;
  password: string;
}) => Promise<void>;

export async function updatePasswordWithBoundToken(args: {
  accessToken: string;
  password: string;
}): Promise<void> {
  if (!supabaseUrl || !supabaseAnonKey) throw new PasswordReauthenticationError("AUTH_NOT_CONFIGURED");
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: supabaseAnonKey,
        authorization: `Bearer ${args.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ password: args.password }),
    });
  } catch (error) {
    throw new PasswordReauthenticationError("PASSWORD_UPDATE_FAILED", error);
  }
  if (!response.ok) {
    let cause: unknown = { status: response.status };
    try { cause = { status: response.status, ...await response.json() as object }; } catch { /* status is sufficient */ }
    throw new PasswordReauthenticationError("PASSWORD_UPDATE_FAILED", cause);
  }
}

export function createIsolatedPasswordClient(): IsolatedAuthClient {
  if (!supabaseUrl || !supabaseAnonKey) throw new PasswordReauthenticationError("AUTH_NOT_CONFIGURED");
  const nonce = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      // Avoid sharing the main client's GoTrue lock/broadcast namespace even
      // though this short-lived client never persists its session.
      storageKey: `vmp-password-reauth-${nonce}`,
    },
  }) as unknown as IsolatedAuthClient;
}

async function readMainIdentity(main: MainAuthClient): Promise<{
  userId: string;
  accessToken: string;
  currentLevel: "aal1" | "aal2";
  nextLevel: "aal1" | "aal2";
}> {
  const sessionResult = await main.auth.getSession();
  const userId = sessionResult.data?.session?.user?.id;
  const accessToken = sessionResult.data?.session?.access_token;
  if (sessionResult.error || !userId || !accessToken) {
    throw new PasswordReauthenticationError("MAIN_SESSION_REQUIRED", sessionResult.error);
  }
  let claims: { sub?: unknown; aal?: unknown };
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) throw new Error("missing payload");
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = typeof atob === "function"
      ? atob(normalized)
      : Buffer.from(normalized, "base64").toString("utf8");
    claims = JSON.parse(decoded) as { sub?: unknown; aal?: unknown };
  } catch (error) {
    throw new PasswordReauthenticationError("MAIN_TOKEN_INVALID", error);
  }
  if (claims.sub !== userId || (claims.aal !== "aal1" && claims.aal !== "aal2")) {
    throw new PasswordReauthenticationError("MAIN_TOKEN_IDENTITY_MISMATCH");
  }
  const userResult = await main.auth.getUser(accessToken);
  const boundUser = userResult.data?.user;
  if (userResult.error || !boundUser || boundUser.id !== userId) {
    throw new PasswordReauthenticationError("MAIN_TOKEN_IDENTITY_MISMATCH", userResult.error);
  }
  const currentLevel = claims.aal;
  const nextLevel = boundUser.factors?.some((factor) => factor.status === "verified") ? "aal2" : currentLevel;
  if (nextLevel === "aal2" && currentLevel !== "aal2") {
    throw new PasswordReauthenticationError("MAIN_AAL2_REQUIRED");
  }
  return { userId, accessToken, currentLevel, nextLevel };
}

export async function reauthenticateAndUpdatePassword(args: {
  mainClient: MainAuthClient;
  createIsolatedClient?: () => IsolatedAuthClient;
  email: string;
  currentPassword: string;
  newPassword: string;
  expectedUserId: string;
  updateBoundSession?: BoundPasswordUpdate;
}): Promise<void> {
  const before = await readMainIdentity(args.mainClient);
  if (before.userId !== args.expectedUserId) {
    throw new PasswordReauthenticationError("MAIN_SESSION_CHANGED");
  }

  const isolated = (args.createIsolatedClient ?? createIsolatedPasswordClient)();
  let temporarySessionCreated = false;
  try {
    const verified = await isolated.auth.signInWithPassword({
      email: args.email,
      password: args.currentPassword,
    });
    if (verified.error || !verified.data?.session || !verified.data.user) {
      throw new PasswordReauthenticationError("CURRENT_PASSWORD_INVALID", verified.error);
    }
    temporarySessionCreated = true;
    if (verified.data.user.id !== args.expectedUserId
        || verified.data.session.user.id !== args.expectedUserId) {
      throw new PasswordReauthenticationError("ACCOUNT_MISMATCH");
    }

    const after = await readMainIdentity(args.mainClient);
    if (after.userId !== args.expectedUserId || after.accessToken !== before.accessToken
        || after.currentLevel !== before.currentLevel
        || after.nextLevel !== before.nextLevel) {
      throw new PasswordReauthenticationError("MAIN_SESSION_CHANGED");
    }
    await (args.updateBoundSession ?? updatePasswordWithBoundToken)({
      accessToken: before.accessToken,
      password: args.newPassword,
    });
  } finally {
    if (temporarySessionCreated) {
      await isolated.auth.signOut({ scope: "local" }).catch(() => undefined);
    }
  }
}

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LockKeyhole, LogOut, RefreshCw } from "lucide-react";

import { C, TEXT, btnPrimary } from "../../constants/theme.ts";
import {
  assessMfa,
  challengeAndVerifyTotp,
  mfaErrorMessage,
  type MfaAssessment,
  type MfaFactor,
} from "../../lib/mfa.ts";
import {
  signOut,
  subscribePasswordRecovery,
  supabase,
} from "../../lib/supabaseClient.ts";

export type MfaBoundaryState =
  | { kind: "checking"; epoch: number; key?: number }
  | { kind: "public"; epoch: number; key: number }
  | { kind: "challenge"; epoch: number; userId: string; factors: MfaFactor[]; key: number }
  | { kind: "allowed"; epoch: number; userId: string; assurance: "aal1" | "aal2"; key: number }
  | { kind: "error"; epoch: number; key: number };

export type MfaBoundaryAction =
  | { type: "invalidate"; epoch: number }
  | { type: "routine-refresh"; epoch: number; userId: string; assurance: "aal1" | "aal2" }
  | { type: "failed"; epoch: number }
  | { type: "resolved"; epoch: number; decision: MfaAssessment };

export function transitionMfaBoundary(
  state: MfaBoundaryState,
  action: MfaBoundaryAction,
): MfaBoundaryState {
  if (action.type === "routine-refresh") {
    if (state.kind === "allowed" && state.userId === action.userId
        && state.assurance === action.assurance) return state;
    return { kind: "checking", epoch: action.epoch, key: "key" in state ? state.key : 0 };
  }
  if (action.type === "invalidate") {
    return { kind: "checking", epoch: action.epoch, key: "key" in state ? state.key : 0 };
  }
  if (action.epoch !== state.epoch) return state;
  const oldKey = "key" in state ? (state.key ?? 0) : 0;
  if (action.type === "failed") return { kind: "error", epoch: state.epoch, key: oldKey };
  const { decision } = action;
  if (decision.kind === "no-session") return { kind: "public", epoch: state.epoch, key: oldKey + 1 };
  if (decision.kind === "challenge-required") {
    return {
      kind: "challenge", epoch: state.epoch, userId: decision.userId,
      factors: decision.verifiedFactors, key: oldKey + 1,
    };
  }
  const sameAllowed = state.kind === "allowed" && state.userId === decision.userId
    && state.assurance === decision.assurance;
  return {
    kind: "allowed", epoch: state.epoch, userId: decision.userId,
    assurance: decision.assurance, key: sameAllowed ? oldKey : oldKey + 1,
  };
}

function decodeAal(token: string | undefined): "aal1" | "aal2" | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(normalized)) as { aal?: unknown };
    return payload.aal === "aal1" || payload.aal === "aal2" ? payload.aal : null;
  } catch { return null; }
}

function BoundaryCard({ children }: { children: ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24,
      background: `linear-gradient(160deg, ${C.bg1}, ${C.bg2})`, fontFamily: TEXT, color: C.plum }}>
      <section aria-live="polite" style={{ width: "min(100%, 460px)", padding: 28,
        borderRadius: 18, background: C.surface, border: `1.5px solid ${C.pinkSoft}`, lineHeight: 1.55 }}>
        {children}
      </section>
    </main>
  );
}

export default function MfaBoundary({ children }: { children: ReactNode }) {
  const epoch = useRef(0);
  const mounted = useRef(true);
  const verifyBusy = useRef(false);
  const [revision, setRevision] = useState(0);
  const [recovery, setRecovery] = useState(false);
  const [state, setState] = useState<MfaBoundaryState>({ kind: "checking", epoch: 0, key: 0 });
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const invalidate = useCallback(() => {
    const next = ++epoch.current;
    setState((current) => transitionMfaBoundary(current, { type: "invalidate", epoch: next }));
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const stopRecovery = subscribePasswordRecovery(() => setRecovery(true));
    const { data } = supabase?.auth.onAuthStateChange((event, session) => {
      // Keep this callback synchronous: async Auth calls here can contend with
      // the SDK's session lock. Routine same-user aal2 refreshes need no remount.
      const aal = decodeAal(session?.access_token);
      if (event === "SIGNED_OUT") setRecovery(false);
      setState((current) => {
        if ((event === "TOKEN_REFRESHED" || event === "SIGNED_IN" || event === "USER_UPDATED"
            || event === "MFA_CHALLENGE_VERIFIED")
            && session?.user?.id && aal) {
          if (current.kind === "allowed" && current.userId === session.user.id
              && current.assurance === aal) {
            // Recheck factors in the background. A same-user routine refresh
            // keeps the mounted form; the resolved decision changes the key
            // only if assurance/account status actually changed.
            queueMicrotask(() => { if (mounted.current) setRevision((value) => value + 1); });
            return current;
          }
          const next = ++epoch.current;
          queueMicrotask(() => { if (mounted.current) setRevision((value) => value + 1); });
          return transitionMfaBoundary(current, {
            type: "routine-refresh", epoch: next, userId: session.user.id, assurance: aal,
          });
        }
        const next = ++epoch.current;
        queueMicrotask(() => { if (mounted.current) setRevision((value) => value + 1); });
        return transitionMfaBoundary(current, { type: "invalidate", epoch: next });
      });
    }) ?? { data: { subscription: null } };
    return () => {
      mounted.current = false;
      stopRecovery();
      data.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (recovery) return undefined;
    const checkingEpoch = epoch.current;
    let active = true;
    assessMfa()
      .then((decision) => {
        if (active && mounted.current) {
          setState((current) => transitionMfaBoundary(current, {
            type: "resolved", epoch: checkingEpoch, decision,
          }));
        }
      })
      .catch(() => {
        if (active && mounted.current) {
          setState((current) => transitionMfaBoundary(current, { type: "failed", epoch: checkingEpoch }));
        }
      });
    return () => { active = false; };
  }, [revision, recovery]);

  useEffect(() => {
    if (state.kind === "challenge" && !state.factors.some((factor) => factor.id === factorId)) {
      setFactorId(state.factors[0]?.id ?? "");
    }
  }, [state, factorId]);

  const verify = async () => {
    if (state.kind !== "challenge" || verifyBusy.current) return;
    verifyBusy.current = true;
    setBusy(true);
    setMessage("");
    try {
      await challengeAndVerifyTotp(undefined, {
        factorId, code, expectedUserId: state.userId,
      });
      setCode("");
      invalidate();
    } catch (error) {
      setMessage(mfaErrorMessage(error));
    } finally {
      verifyBusy.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  if (!supabase) return <>{children}</>;

  if (recovery || state.kind === "public" || state.kind === "allowed") {
    return <Fragment key={state.kind === "allowed" ? `mfa:${state.userId}:${state.key}` : `public:${state.key}`}>{children}</Fragment>;
  }

  if (state.kind === "checking") return (
    <BoundaryCard>
      <LockKeyhole size={28} color={C.pink} aria-hidden="true" />
      <h1 style={{ fontSize: 20, margin: "12px 0 6px" }}>Đang xác minh phiên đăng nhập</h1>
      <p role="status" aria-busy="true" style={{ margin: 0, color: C.plumSoft }}>
        Dữ liệu được giữ kín cho đến khi xác minh hoàn tất.
      </p>
    </BoundaryCard>
  );

  if (state.kind === "error") return (
    <BoundaryCard>
      <LockKeyhole size={28} color={C.raspText} aria-hidden="true" />
      <h1 style={{ fontSize: 20, margin: "12px 0 6px" }}>Chưa xác minh được phiên đăng nhập</h1>
      <p role="alert" style={{ color: C.raspText }}>Không mở dữ liệu khi trạng thái bảo mật chưa rõ.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={invalidate} style={btnPrimary}><RefreshCw size={16} /> Thử lại</button>
        <button type="button" onClick={() => { void signOut(); }} style={btnPrimary}><LogOut size={16} /> Đăng xuất</button>
      </div>
    </BoundaryCard>
  );

  return (
    <BoundaryCard>
      <LockKeyhole size={28} color={C.pink} aria-hidden="true" />
      <h1 style={{ fontSize: 20, margin: "12px 0 6px" }}>Xác thực hai lớp</h1>
      <p style={{ color: C.plumSoft }}>Nhập mã 6 chữ số từ ứng dụng xác thực để tiếp tục.</p>
      {state.factors.length > 1 && (
        <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <span style={{ fontWeight: 700 }}>Thiết bị xác thực</span>
          <select value={factorId} disabled={busy} onChange={(event) => setFactorId(event.target.value)}>
            {state.factors.map((factor, index) => (
              <option key={factor.id} value={factor.id}>{factor.friendly_name || `Thiết bị ${index + 1}`}</option>
            ))}
          </select>
        </label>
      )}
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontWeight: 700 }}>Mã xác thực</span>
        <input value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
          aria-invalid={Boolean(message)} disabled={busy} data-dialog-focus=""
          onChange={(event) => { setCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 6)); setMessage(""); }}
          onKeyDown={(event) => { if (event.key === "Enter") void verify(); }} />
      </label>
      {message && <p role="alert" style={{ color: C.raspText }}>{message}</p>}
      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        <button type="button" onClick={() => { void verify(); }} disabled={busy || code.length !== 6}
          aria-busy={busy} style={btnPrimary}>{busy ? "Đang xác minh…" : "Xác minh"}</button>
        <button type="button" onClick={() => { void signOut(); }} disabled={busy}
          style={{ ...btnPrimary, background: C.surface, color: C.plum }}>Đăng xuất</button>
      </div>
    </BoundaryCard>
  );
}

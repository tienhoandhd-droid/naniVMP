import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, QrCode, ShieldCheck, Trash2, XCircle } from "lucide-react";

import { C, R, TEXT, btnPrimary } from "../../constants/theme.ts";
import {
  assessMfa,
  cleanupUnverifiedFactor,
  mfaErrorMessage,
  startTotpEnrollment,
  unenrollVerifiedTotp,
  validateTotpCode,
  verifyTotpEnrollment,
  type MfaFactor,
  type TotpEnrollment,
} from "../../lib/mfa.ts";

type Status =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; userId: string; factors: MfaFactor[] };

export default function MfaSettings() {
  const mounted = useRef(true);
  const actionBusy = useRef(false);
  const pending = useRef<{ factorId: string; userId: string } | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [removeCode, setRemoveCode] = useState("");
  const [removingId, setRemovingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setStatus({ kind: "loading" });
    setMessage(null);
    try {
      const decision = await assessMfa();
      if (decision.kind === "no-session") throw new Error("SESSION_CHANGED");
      if (mounted.current) setStatus({
        kind: "ready", userId: decision.userId, factors: decision.verifiedFactors,
      });
    } catch (error) {
      if (mounted.current) setStatus({ kind: "error", message: mfaErrorMessage(error) });
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      const orphan = pending.current;
      pending.current = null;
      if (orphan) void cleanupUnverifiedFactor(undefined, orphan.factorId, orphan.userId).catch(() => {});
    };
  }, [load]);

  const beginEnrollment = async () => {
    if (status.kind !== "ready" || actionBusy.current || status.factors.length > 0) return;
    actionBusy.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const created = await startTotpEnrollment(undefined, "VMP", status.userId);
      if (!mounted.current) {
        await cleanupUnverifiedFactor(undefined, created.factorId, status.userId).catch(() => false);
        return;
      }
      pending.current = { factorId: created.factorId, userId: status.userId };
      setEnrollment(created);
    } catch (error) {
      if (mounted.current) setMessage({ kind: "error", text: mfaErrorMessage(error) });
    } finally {
      actionBusy.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const cancelEnrollment = async () => {
    const orphan = pending.current;
    if (!orphan || actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await cleanupUnverifiedFactor(undefined, orphan.factorId, orphan.userId);
      pending.current = null;
      setEnrollment(null);
      setCode("");
    } catch (error) {
      setMessage({ kind: "error", text: mfaErrorMessage(error) });
    } finally {
      actionBusy.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const enable = async () => {
    const orphan = pending.current;
    if (!orphan || actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setMessage(null);
    let clearedForAuthEvent = false;
    try {
      await verifyTotpEnrollment(undefined, {
        factorId: orphan.factorId,
        code,
        expectedUserId: orphan.userId,
        beforeVerify: () => { pending.current = null; clearedForAuthEvent = true; },
      });
      setEnrollment(null);
      setCode("");
      await load();
      if (mounted.current) setMessage({ kind: "ok", text: "Đã bật xác thực hai lớp." });
    } catch (error) {
      // Wrong/expired codes do not verify the factor; retain exact ownership
      // so Cancel/unmount can remove only this still-unverified factor.
      if (clearedForAuthEvent) pending.current = orphan;
      setMessage({ kind: "error", text: mfaErrorMessage(error) });
    } finally {
      actionBusy.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const requestUnenroll = (factorId: string) => {
    if (!window.confirm("Tắt xác thực hai lớp trên đúng thiết bị này?")) return;
    setRemovingId(factorId);
    setRemoveCode("");
    setMessage(null);
  };

  const confirmUnenroll = async () => {
    if (status.kind !== "ready" || !removingId || actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await unenrollVerifiedTotp(undefined, {
        factorId: removingId, code: removeCode, expectedUserId: status.userId,
      });
      setRemovingId("");
      setRemoveCode("");
      await load();
      if (mounted.current) setMessage({ kind: "ok", text: "Đã tắt xác thực hai lớp cho thiết bị đã chọn." });
    } catch (error) {
      setMessage({ kind: "error", text: mfaErrorMessage(error) });
    } finally {
      actionBusy.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <section aria-label="Xác thực hai lớp">
      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        {status.kind === "loading" && <p role="status" aria-busy="true">Đang kiểm tra thiết bị xác thực…</p>}
        {status.kind === "error" && (
          <div>
            <p role="alert" style={{ color: C.raspText }}>{status.message}</p>
            <button type="button" onClick={() => { void load(); }} style={btnPrimary}>Thử lại</button>
          </div>
        )}
        {status.kind === "ready" && !enrollment && (
          <>
            {status.factors.length === 0 ? (
              <div>
                <p style={{ color: C.plumSoft }}>Dùng ứng dụng tạo mã để bảo vệ tài khoản sau khi đăng nhập bằng mật khẩu.</p>
                <button type="button" onClick={() => { void beginEnrollment(); }} disabled={busy}
                  aria-busy={busy} style={btnPrimary}><ShieldCheck size={16} /> Bật xác thực hai lớp</button>
              </div>
            ) : status.factors.map((factor, index) => (
              <div key={factor.id} style={{ display: "grid", gap: 8, padding: 12, borderRadius: R.sm,
                border: "1px solid var(--lp-line-strong)", background: C.surface }}>
                <strong>{factor.friendly_name || `Thiết bị xác thực ${index + 1}`}</strong>
                {removingId === factor.id ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <label style={{ display: "grid", gap: 5 }}>
                      <span>Nhập mã hiện tại để xác minh trước khi tắt</span>
                      <input value={removeCode} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                        disabled={busy} onChange={(event) => setRemoveCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))} />
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={() => { void confirmUnenroll(); }}
                        disabled={busy || !validateTotpCode(removeCode)} style={btnPrimary}>Xác minh và tắt</button>
                      <button type="button" disabled={busy} onClick={() => setRemovingId("")}>Giữ lại</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" disabled={busy} onClick={() => requestUnenroll(factor.id)}
                    style={{ justifySelf: "start" }}><Trash2 size={15} /> Tắt trên thiết bị này</button>
                )}
              </div>
            ))}
          </>
        )}
        {enrollment && status.kind === "ready" && (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0 }}>Quét mã bằng ứng dụng xác thực, rồi nhập mã 6 chữ số để hoàn tất.</p>
            <img src={enrollment.qrCode} alt="Mã QR để thêm tài khoản VMP vào ứng dụng xác thực"
              style={{ width: 190, maxWidth: "100%", background: "white", padding: 8 }} />
            <label style={{ display: "grid", gap: 5 }}>
              <span>Khoá nhập thủ công</span>
              <input readOnly value={enrollment.secret} aria-label="Khoá nhập thủ công cho ứng dụng xác thực"
                style={{ fontFamily: "ui-monospace, monospace" }} />
            </label>
            <label style={{ display: "grid", gap: 5 }}>
              <span>Mã xác thực</span>
              <input value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                disabled={busy} onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                style={{ fontFamily: TEXT }} />
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => { void enable(); }} disabled={busy || !validateTotpCode(code)}
                aria-busy={busy} style={btnPrimary}><QrCode size={16} /> {busy ? "Đang xác minh…" : "Xác minh và bật"}</button>
              <button type="button" onClick={() => { void cancelEnrollment(); }} disabled={busy}>Huỷ thiết lập</button>
            </div>
          </div>
        )}
        {message && (
          <p role={message.kind === "ok" ? "status" : "alert"}
            style={{ color: message.kind === "ok" ? C.mintText : C.raspText, fontWeight: 700 }}>
            {message.kind === "ok" ? <CheckCircle2 size={15} /> : <XCircle size={15} />} {message.text}
          </p>
        )}
      </div>
    </section>
  );
}

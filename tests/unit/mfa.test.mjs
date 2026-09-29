import test from "node:test";
import assert from "node:assert/strict";

import {
  MfaSecurityError,
  assessMfa,
  challengeAndVerifyTotp,
  cleanupUnverifiedFactor,
  requireMfaChallenge,
  startTotpEnrollment,
  unenrollVerifiedTotp,
  validateTotpCode,
  verifyTotpEnrollment,
  mfaErrorMessage,
} from "../../src/lib/mfa.ts";
import { transitionMfaBoundary } from "../../src/components/auth/MfaBoundary.tsx";

function client({ userId = "user-a", factors = [], currentLevel = "aal1", nextLevel = "aal1" } = {}) {
  const calls = [];
  return {
    calls,
    auth: {
      getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null }, error: null }),
      mfa: {
        listFactors: async () => ({ data: {
          totp: factors,
          all: factors,
        }, error: null }),
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel, nextLevel, currentAuthenticationMethods: [] }, error: null,
        }),
        challengeAndVerify: async (args) => {
          calls.push(["challengeAndVerify", args]);
          currentLevel = "aal2";
          nextLevel = "aal2";
          return { data: { access_token: "fresh" }, error: null };
        },
        unenroll: async (args) => {
          calls.push(["unenroll", args]);
          return { data: {}, error: null };
        },
      },
    },
  };
}

test("no session is an explicit public-shell decision", async () => {
  assert.deepEqual(await assessMfa(client({ userId: null })), { kind: "no-session" });
});

test("an account without a verified factor may continue at aal1", async () => {
  const c = client({ factors: [{ id: "draft", factor_type: "totp", status: "unverified" }] });
  const result = await assessMfa(c);
  assert.equal(result.kind, "allowed");
  assert.equal(result.userId, "user-a");
  assert.deepEqual(result.verifiedFactors, []);
  assert.equal(await requireMfaChallenge(c), false);
});

test("a verified factor at aal1 requires a challenge", async () => {
  const factor = { id: "factor-a", factor_type: "totp", status: "verified", friendly_name: "Điện thoại" };
  const c = client({ factors: [factor], currentLevel: "aal1", nextLevel: "aal2" });
  assert.deepEqual(await assessMfa(c), {
    kind: "challenge-required", userId: "user-a", verifiedFactors: [factor],
  });
  assert.equal(await requireMfaChallenge(c), true);
});

test("a verified factor at aal2 may continue", async () => {
  const factor = { id: "factor-a", factor_type: "totp", status: "verified" };
  const result = await assessMfa(client({ factors: [factor], currentLevel: "aal2", nextLevel: "aal2" }));
  assert.equal(result.kind, "allowed");
  assert.equal(result.assurance, "aal2");
});

test("SDK uncertainty throws and never returns an allowed decision", async () => {
  const c = client();
  c.auth.mfa.listFactors = async () => ({ data: null, error: { message: "offline" } });
  await assert.rejects(assessMfa(c), MfaSecurityError);
  await assert.rejects(requireMfaChallenge(c), MfaSecurityError);
});

test("TOTP accepts exactly six ASCII digits", () => {
  assert.equal(validateTotpCode("123456"), true);
  for (const value of ["12345", "1234567", "１２３４５６", "123 456", "abcdef"]) {
    assert.equal(validateTotpCode(value), false, value);
  }
});

test("challenge verifies the exact factor and same user before allowing aal2", async () => {
  const c = client({
    factors: [{ id: "factor-a", factor_type: "totp", status: "verified" }],
    currentLevel: "aal1", nextLevel: "aal2",
  });
  await challengeAndVerifyTotp(c, { factorId: "factor-a", code: "123456", expectedUserId: "user-a" });
  assert.deepEqual(c.calls[0], ["challengeAndVerify", { factorId: "factor-a", code: "123456" }]);
});

test("challenge refuses an account swap even if verification succeeds", async () => {
  const c = client({
    factors: [{ id: "factor-a", factor_type: "totp", status: "verified" }],
    currentLevel: "aal1", nextLevel: "aal2",
  });
  let sessionCalls = 0;
  c.auth.getSession = async () => ({
    data: { session: { user: { id: sessionCalls++ === 0 ? "user-a" : "user-b" } } }, error: null,
  });
  await assert.rejects(
    challengeAndVerifyTotp(c, { factorId: "factor-a", code: "123456", expectedUserId: "user-a" }),
    /SESSION_CHANGED/,
  );
});

test("cleanup removes only the matching factor while it remains unverified", async () => {
  const c = client({ factors: [
    { id: "draft", factor_type: "totp", status: "unverified" },
    { id: "live", factor_type: "totp", status: "verified" },
  ] });
  assert.equal(await cleanupUnverifiedFactor(c, "draft", "user-a"), true);
  assert.equal(await cleanupUnverifiedFactor(c, "live", "user-a"), false);
  assert.deepEqual(c.calls, [["unenroll", { factorId: "draft" }]]);
});

test("enrollment returns transient QR material but refuses a second verified TOTP", async () => {
  const c = client();
  c.auth.mfa.enroll = async (args) => {
    c.calls.push(["enroll", args]);
    return { data: { id: "draft", totp: { qr_code: "data:image/svg+xml,qr", secret: "ABC123", uri: "otpauth://totp/vmp" } }, error: null };
  };
  assert.deepEqual(await startTotpEnrollment(c, "Máy chính", "user-a"), {
    factorId: "draft", qrCode: "data:image/svg+xml,qr", secret: "ABC123", uri: "otpauth://totp/vmp",
  });
  const enrolled = client({ factors: [{ id: "live", factor_type: "totp", status: "verified" }] });
  await assert.rejects(startTotpEnrollment(enrolled), /MFA_ALREADY_ENROLLED/);
});

test("enrollment refuses an account swap and attempts exact orphan cleanup", async () => {
  const c = client();
  let sessionCalls = 0;
  c.auth.getSession = async () => ({ data: { session: { user: { id: sessionCalls++ === 0 ? "user-a" : "user-b" } } }, error: null });
  c.auth.mfa.enroll = async () => ({ data: { id: "draft", totp: { qr_code: "qr", secret: "secret" } }, error: null });
  await assert.rejects(startTotpEnrollment(c, "VMP", "user-a"), /SESSION_CHANGED/);
  assert.deepEqual(c.calls, [["unenroll", { factorId: "draft" }]]);
});

test("enrollment verification clears pending ownership before native auth events", async () => {
  const c = client({ factors: [{ id: "draft", factor_type: "totp", status: "unverified" }] });
  const cleared = [];
  await verifyTotpEnrollment(c, {
    factorId: "draft", code: "123456", expectedUserId: "user-a", beforeVerify: () => cleared.push("cleared"),
  });
  assert.deepEqual(cleared, ["cleared"]);
  assert.deepEqual(c.calls[0], ["challengeAndVerify", { factorId: "draft", code: "123456" }]);
});

test("unenroll requires a fresh verification for the exact verified factor", async () => {
  const c = client({ factors: [{ id: "live", factor_type: "totp", status: "verified" }], nextLevel: "aal2" });
  await unenrollVerifiedTotp(c, {
    factorId: "live", code: "123456", expectedUserId: "user-a",
  });
  assert.deepEqual(c.calls, [
    ["challengeAndVerify", { factorId: "live", code: "123456" }],
    ["unenroll", { factorId: "live" }],
  ]);
});

test("unenroll fails closed if fresh verification does not yield authoritative aal2", async () => {
  const c = client({ factors: [{ id: "live", factor_type: "totp", status: "verified" }], nextLevel: "aal2" });
  c.auth.mfa.challengeAndVerify = async () => ({ data: {}, error: null });
  await assert.rejects(unenrollVerifiedTotp(c, {
    factorId: "live", code: "123456", expectedUserId: "user-a",
  }), /MFA_VERIFY_NOT_ASSURED/);
  assert.equal(c.calls.some(([name]) => name === "unenroll"), false);
});

test("localized MFA errors safely unwrap rate-limit and network causes", () => {
  assert.match(mfaErrorMessage(new MfaSecurityError("MFA_VERIFY_FAILED", { status: 429 })), /quá nhiều/i);
  assert.match(mfaErrorMessage(new MfaSecurityError("MFA_VERIFY_FAILED", { message: "Failed to fetch" })), /Không kết nối/i);
});

test("boundary ignores stale async results and preserves same-user allowed refresh", () => {
  const checking = { kind: "checking", epoch: 4 };
  assert.deepEqual(
    transitionMfaBoundary(checking, { type: "resolved", epoch: 3, decision: { kind: "no-session" } }),
    checking,
  );
  const allowed = { kind: "allowed", epoch: 4, userId: "user-a", assurance: "aal2", key: 2 };
  assert.deepEqual(
    transitionMfaBoundary(allowed, { type: "routine-refresh", epoch: 4, userId: "user-a", assurance: "aal2" }),
    allowed,
  );
  assert.deepEqual(
    transitionMfaBoundary(allowed, { type: "routine-refresh", epoch: 5, userId: "user-b", assurance: "aal1" }),
    { kind: "checking", epoch: 5, key: 2 },
  );
  assert.deepEqual(
    transitionMfaBoundary(allowed, { type: "invalidate", epoch: 5 }),
    { kind: "checking", epoch: 5, key: 2 },
  );
});

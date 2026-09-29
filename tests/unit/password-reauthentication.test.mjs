import test from "node:test";
import assert from "node:assert/strict";

import {
  PasswordReauthenticationError,
  reauthenticateAndUpdatePassword,
} from "../../src/lib/passwordReauthentication.ts";

function fixture({ mainUser = "user-a", tempUser = "user-a", mainAal = "aal2", nextAal = mainAal } = {}) {
  const calls = [];
  let currentMainUser = mainUser;
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const mainToken = `${encode({ alg: "none" })}.${encode({ sub: mainUser, aal: mainAal })}.${encode("test")}`;
  const main = {
    auth: {
      getSession: async () => ({ data: { session: currentMainUser ? {
        user: { id: currentMainUser, email: "qa@example.test" }, access_token: mainToken,
      } : null }, error: null }),
      getUser: async (jwt) => { calls.push(["bound-user", jwt]); return { data: { user: {
        id: mainUser, factors: nextAal === "aal2" ? [{ status: "verified" }] : [],
      } }, error: null }; },
    },
  };
  const isolated = {
    auth: {
      signInWithPassword: async (credentials) => {
        calls.push(["isolated-sign-in", credentials]);
        return { data: { user: { id: tempUser }, session: { user: { id: tempUser } } }, error: null };
      },
      signOut: async (options) => { calls.push(["isolated-sign-out", options]); return { error: null }; },
    },
  };
  const updateBoundSession = async (values) => { calls.push(["bound-update", values]); };
  return { main, isolated, calls, updateBoundSession, swapMain: (uid) => { currentMainUser = uid; } };
}

test("old password is verified in an isolated session while main aal2 performs update", async () => {
  const f = fixture();
  await reauthenticateAndUpdatePassword({
    mainClient: f.main,
    createIsolatedClient: () => f.isolated,
    email: "qa@example.test", currentPassword: "old-secret", newPassword: "new-secret",
    expectedUserId: "user-a",
    updateBoundSession: f.updateBoundSession,
  });
  assert.deepEqual(f.calls, [
    ["bound-user", f.calls[0][1]],
    ["isolated-sign-in", { email: "qa@example.test", password: "old-secret" }],
    ["bound-user", f.calls[0][1]],
    ["bound-update", { accessToken: f.calls[0][1], password: "new-secret" }],
    ["isolated-sign-out", { scope: "local" }],
  ]);
});

test("wrong password is reported and main password is never updated", async () => {
  const f = fixture();
  f.isolated.auth.signInWithPassword = async () => ({ data: { user: null, session: null }, error: { code: "invalid_credentials" } });
  await assert.rejects(reauthenticateAndUpdatePassword({
    mainClient: f.main, createIsolatedClient: () => f.isolated,
    email: "qa@example.test", currentPassword: "wrong", newPassword: "new-secret", expectedUserId: "user-a",
    updateBoundSession: f.updateBoundSession,
  }), (error) => error instanceof PasswordReauthenticationError && error.code === "CURRENT_PASSWORD_INVALID");
  assert.equal(f.calls.some(([name]) => name === "bound-update"), false);
});

test("temporary session for another account is rejected before main update", async () => {
  const f = fixture({ tempUser: "user-b" });
  await assert.rejects(reauthenticateAndUpdatePassword({
    mainClient: f.main, createIsolatedClient: () => f.isolated,
    email: "qa@example.test", currentPassword: "old", newPassword: "new", expectedUserId: "user-a",
    updateBoundSession: f.updateBoundSession,
  }), /ACCOUNT_MISMATCH/);
  assert.equal(f.calls.some(([name]) => name === "bound-update"), false);
  assert.deepEqual(f.calls.at(-1), ["isolated-sign-out", { scope: "local" }]);
});

test("main account or aal change after verification fails closed", async () => {
  const f = fixture();
  f.isolated.auth.signInWithPassword = async (credentials) => {
    f.calls.push(["isolated-sign-in", credentials]); f.swapMain("user-b");
    return { data: { user: { id: "user-a" }, session: { user: { id: "user-a" } } }, error: null };
  };
  await assert.rejects(reauthenticateAndUpdatePassword({
    mainClient: f.main, createIsolatedClient: () => f.isolated,
    email: "qa@example.test", currentPassword: "old", newPassword: "new", expectedUserId: "user-a",
    updateBoundSession: f.updateBoundSession,
  }), /MAIN_(SESSION_CHANGED|TOKEN_IDENTITY_MISMATCH)/);
  assert.equal(f.calls.some(([name]) => name === "bound-update"), false);

  const demoted = fixture({ mainAal: "aal1", nextAal: "aal2" });
  await assert.rejects(reauthenticateAndUpdatePassword({
    mainClient: demoted.main, createIsolatedClient: () => demoted.isolated,
    email: "qa@example.test", currentPassword: "old", newPassword: "new", expectedUserId: "user-a",
    updateBoundSession: demoted.updateBoundSession,
  }), /MAIN_AAL2_REQUIRED/);
});

test("isolated session cleanup runs even when main update fails", async () => {
  const f = fixture();
  f.updateBoundSession = async () => { throw new PasswordReauthenticationError("PASSWORD_UPDATE_FAILED", { message: "update failed" }); };
  await assert.rejects(reauthenticateAndUpdatePassword({
    mainClient: f.main, createIsolatedClient: () => f.isolated,
    email: "qa@example.test", currentPassword: "old", newPassword: "new", expectedUserId: "user-a",
    updateBoundSession: f.updateBoundSession,
  }), /PASSWORD_UPDATE_FAILED/);
  assert.deepEqual(f.calls.at(-1), ["isolated-sign-out", { scope: "local" }]);
});

test("account swap immediately before mutation cannot change the bound bearer", async () => {
  const f = fixture();
  const seen = [];
  await reauthenticateAndUpdatePassword({
    mainClient: f.main, createIsolatedClient: () => f.isolated,
    email: "qa@example.test", currentPassword: "old", newPassword: "new", expectedUserId: "user-a",
    updateBoundSession: async (request) => { f.swapMain("user-b"); seen.push(request); },
  });
  assert.equal(seen.length, 1);
  assert.match(seen[0].accessToken, /\./);
  assert.equal(seen[0].password, "new");
});

test("session swap between capture and factor lookup cannot lend account B factors to token A", async () => {
  const f = fixture({ mainAal: "aal1", nextAal: "aal2" });
  f.main.auth.getUser = async (jwt) => {
    f.swapMain("user-b");
    f.calls.push(["bound-user", jwt]);
    return { data: { user: { id: "user-b", factors: [{ status: "verified" }] } }, error: null };
  };
  await assert.rejects(reauthenticateAndUpdatePassword({
    mainClient: f.main, createIsolatedClient: () => f.isolated,
    email: "qa@example.test", currentPassword: "old", newPassword: "new", expectedUserId: "user-a",
    updateBoundSession: f.updateBoundSession,
  }), /MAIN_TOKEN_IDENTITY_MISMATCH/);
  assert.equal(f.calls.some(([name]) => name === "bound-update"), false);
});

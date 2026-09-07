import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeClientError } from "../../src/lib/clientErrorPrivacy.ts";

test("redacts credentials and email addresses while preserving the error category", () => {
  const result = sanitizeClientError(
    "TypeError: request failed for ops@example.com Authorization: Bearer fabricated-token password=hunter2 api_key='demo-key' key=plain-key token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.fabricated",
    "TypeError: ops@example.com\n    at submit (/src/auth/recovery.ts:42:17)\nrefresh_token=refresh-secret",
    "/auth/recovery?code=fabricated-code#access_token=fabricated-access-token",
  );

  const serialized = JSON.stringify(result);
  for (const secret of [
    "ops@example.com",
    "fabricated-token",
    "hunter2",
    "demo-key",
    "plain-key",
    "eyJhbGciOiJIUzI1NiJ9",
    "refresh-secret",
    "fabricated-code",
    "fabricated-access-token",
  ]) {
    assert.equal(serialized.includes(secret), false, `payload leaked ${secret}`);
  }
  assert.match(result.message, /^TypeError:/);
  assert.match(result.stack ?? "", /\/src\/auth\/recovery\.ts:42:17/);
  assert.equal(result.url, "/auth/recovery");
});

test("redacts quoted JSON credential fields and keeps the diagnostic valid JSON", () => {
  const result = sanitizeClientError(
    '{"kind":"AuthError","access_token":"opaque-secret","password":"s3cret","Authorization":"Basic dGVzdDpzZWNyZXQ="}',
    null,
    "/auth",
  );

  const payload = JSON.parse(result.message);
  assert.deepEqual(payload, {
    kind: "AuthError",
    access_token: "[REDACTED]",
    password: "[REDACTED]",
    Authorization: "[REDACTED]",
  });
  assert.equal(result.message.includes("opaque-secret"), false);
  assert.equal(result.message.includes("s3cret"), false);
  assert.equal(result.message.includes("dGVzdDpzZWNyZXQ="), false);
});

test("redacts Basic credentials and userinfo embedded in URLs", () => {
  const result = sanitizeClientError(
    "NetworkError Basic dXNlcjpwYXNz at https://alice:fabricated-password@vmp.example/private?ticket=secret-ticket",
    null,
    "/timeline",
  );

  for (const secret of ["dXNlcjpwYXNz", "alice", "fabricated-password", "secret-ticket"]) {
    assert.equal(result.message.includes(secret), false, `message leaked ${secret}`);
  }
  assert.match(result.message, /^NetworkError \[REDACTED\] at https:\/\/\[REDACTED\]@vmp\.example\/private$/);
});

test("removes query and hash values from URLs embedded in diagnostics", () => {
  const result = sanitizeClientError(
    "Fetch failed: https://vmp.example/reset?ticket=query-secret#step=hash-secret",
    "at load (https://vmp.example/assets/app.ts?cache=private-value:19:4)",
    "https://vmp.example/timeline?owner=private-owner#selected-private-row",
  );

  const serialized = JSON.stringify(result);
  for (const value of ["query-secret", "hash-secret", "private-value", "private-owner", "selected-private-row"]) {
    assert.equal(serialized.includes(value), false, `payload leaked ${value}`);
  }
  assert.match(result.message, /https:\/\/vmp\.example\/reset/);
  assert.equal(result.url, "/timeline");
});

test("bounds fields and preserves a null stack", () => {
  const result = sanitizeClientError("m".repeat(2_100), null, `/${"u".repeat(600)}?secret=value`);

  assert.equal(result.message.length, 2_000);
  assert.equal(result.stack, null);
  assert.equal(result.url.length, 500);
  assert.equal(result.url.includes("value"), false);
});

test("bounds a non-null stack", () => {
  const result = sanitizeClientError("RangeError: ordinary failure", "s".repeat(8_100), "/timeline");

  assert.equal(result.message, "RangeError: ordinary failure");
  assert.equal(result.stack?.length, 8_000);
  assert.equal(result.url, "/timeline");
});

test("handles malformed URLs without throwing or forwarding their values", () => {
  assert.doesNotThrow(() => sanitizeClientError("SyntaxError", null, "http://[?token=malformed-secret#hash-secret"));

  const result = sanitizeClientError("SyntaxError", null, "http://[?token=malformed-secret#hash-secret");
  assert.equal(result.url.includes("malformed-secret"), false);
  assert.equal(result.url.includes("hash-secret"), false);
  assert.ok(result.url.length <= 500);
});

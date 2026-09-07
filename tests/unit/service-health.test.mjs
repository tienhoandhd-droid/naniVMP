import test from "node:test";
import assert from "node:assert/strict";

import { checkServiceHealth, EXPECTED_SUPABASE_HOST } from "../../scripts/check-service-health.mjs";

const WEBSITE_URL = "https://example.test/naniVMP/";
const SUPABASE_URL = `https://${EXPECTED_SUPABASE_HOST}`;

function response(status, body = "") {
  return new Response(body, { status });
}

test("checks the deployed page, its real module asset, and Supabase Auth health", async () => {
  const calls = [];
  const result = await checkServiceHealth({
    websiteUrl: WEBSITE_URL,
    supabaseUrl: SUPABASE_URL,
    anonKey: "test-anon-key",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url) === WEBSITE_URL) return response(200, '<script type="module" src="assets/app-abc.js"></script>');
      if (String(url) === "https://example.test/naniVMP/assets/app-abc.js") return response(200);
      if (String(url) === `${SUPABASE_URL}/auth/v1/health`) return response(200);
      throw new Error(`unexpected URL ${url}`);
    },
  });

  assert.deepEqual(result.checks, [
    { name: "site", status: 200 },
    { name: "module", status: 200 },
    { name: "supabase-auth", status: 200 },
  ]);
  assert.equal(calls[2].options.headers.apikey, "test-anon-key");
  assert.equal(calls.every(({ options }) => options.method === "GET"), true);
});

test("fails when the deployed module asset is unavailable", async () => {
  await assert.rejects(
    checkServiceHealth({
      websiteUrl: WEBSITE_URL,
      supabaseUrl: SUPABASE_URL,
      anonKey: "test-anon-key",
      fetchImpl: async (url) => {
        if (String(url) === WEBSITE_URL) return response(200, '<script type="module" src="assets/app-abc.js"></script>');
        if (String(url) === "https://example.test/naniVMP/assets/app-abc.js") return response(503);
        return response(200);
      },
    }),
    /module.*503/i,
  );
});

test("fails promptly when a request exceeds its timeout", async () => {
  await assert.rejects(
    checkServiceHealth({
      websiteUrl: WEBSITE_URL,
      supabaseUrl: SUPABASE_URL,
      anonKey: "test-anon-key",
      timeoutMs: 20,
      fetchImpl: async (_url, { signal }) => new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    }),
    /site.*timed out/i,
  );
});

test("keeps the timeout active while the site response body stalls", async () => {
  await assert.rejects(
    checkServiceHealth({
      websiteUrl: WEBSITE_URL,
      supabaseUrl: SUPABASE_URL,
      anonKey: "test-anon-key",
      timeoutMs: 20,
      fetchImpl: async () => response(200, new ReadableStream()),
    }),
    /site.*timed out/i,
  );
});

test("rejects a deployed page whose HTML exceeds the bounded limit", async () => {
  await assert.rejects(
    checkServiceHealth({
      websiteUrl: WEBSITE_URL,
      supabaseUrl: SUPABASE_URL,
      anonKey: "test-anon-key",
      fetchImpl: async (url) => {
        if (String(url) === WEBSITE_URL) {
          return response(200, `${"x".repeat(512 * 1024)}<script type="module" src="assets/app.js"></script>`);
        }
        return response(200);
      },
    }),
    /site.*exceeds/i,
  );
});

test("rejects unsafe endpoint URLs before making a request", async () => {
  let calls = 0;
  await assert.rejects(
    checkServiceHealth({
      websiteUrl: "http://127.0.0.1:3000/",
      supabaseUrl: SUPABASE_URL,
      anonKey: "test-anon-key",
      fetchImpl: async () => {
        calls += 1;
        return response(200);
      },
    }),
    /HTTPS URL/i,
  );
  assert.equal(calls, 0);
});

test("rejects Supabase URLs outside one root project hostname before making a request", async () => {
  for (const supabaseUrl of [
    "https://not-supabase.example/",
    "https://project.supabase.co/untrusted-path",
    "https://project.supabase.co/?redirect=https://attacker.example",
  ]) {
    let calls = 0;
    await assert.rejects(
      checkServiceHealth({
        websiteUrl: WEBSITE_URL,
        supabaseUrl,
        anonKey: "test-anon-key",
        fetchImpl: async () => {
          calls += 1;
          return response(200);
        },
      }),
      /Supabase project URL/i,
    );
    assert.equal(calls, 0, supabaseUrl);
  }
});

test("rejects a different valid Supabase project before sending the deployment key", async () => {
  let calls = 0;
  await assert.rejects(checkServiceHealth({ supabaseUrl: "https://different-project.supabase.co", anonKey: "public-key", fetchImpl: async () => { calls++; return response(200); } }), /deployment/i);
  assert.equal(calls, 0);
});

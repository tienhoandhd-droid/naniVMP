import assert from "node:assert/strict";
import test from "node:test";
import { caiGiaLap, nhetPhien } from "../e2e/gia-lap-supabase.mjs";

class FakePage {
  async setRequestInterception(enabled) {
    assert.equal(enabled, true);
  }

  on(event, handler) {
    assert.equal(event, "request");
    this.handleRequest = handler;
  }
}

function fakeRequest(url) {
  const state = { action: null };
  return {
    state,
    url: () => url,
    method: () => "GET",
    continue: () => { state.action = "continue"; },
    abort: () => { state.action = "abort"; },
  };
}

test("strict mock network chỉ cho đúng preview origin, không cho localhost sai port", async () => {
  const page = new FakePage();
  const { chanNgoai } = await caiGiaLap(page, {
    supabaseUrl: "https://mock-project.supabase.co",
    mangNghiemNgat: true,
    previewOrigin: "http://127.0.0.1:4173",
  });

  const preview = fakeRequest("http://127.0.0.1:4173/assets/index.js");
  page.handleRequest(preview);
  assert.equal(preview.state.action, "continue");

  const wrongPort = fakeRequest("http://127.0.0.1:9999/private-service");
  page.handleRequest(wrongPort);
  assert.equal(wrongPort.state.action, "abort");
  assert.deepEqual(chanNgoai, ["http://127.0.0.1:9999/private-service"]);
});

test("mock network legacy vẫn cho loopback khác port khi strict tắt", async () => {
  const page = new FakePage();
  const { chanNgoai } = await caiGiaLap(page, {
    supabaseUrl: "https://mock-project.supabase.co",
  });
  const loopback = fakeRequest("http://localhost:9999/legacy-preview");

  page.handleRequest(loopback);

  assert.equal(loopback.state.action, "continue");
  assert.deepEqual(chanNgoai, []);
});


test("fixed browser clock also governs seeded and refreshed mock sessions", async () => {
  const nowMs = Date.parse("2035-12-31T17:00:00Z");
  const expectedExpiry = Math.floor(nowMs / 1000) + 28_800;
  const assertSession = (session) => {
    const claims = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url"));
    assert.equal(session.expires_at, expectedExpiry);
    assert.equal(claims.exp, expectedExpiry);
    assert.equal(claims.amr[0].timestamp, Math.floor(nowMs / 1000));
  };
  const page = new FakePage();
  page.evaluateOnNewDocument = async (_fn, _key, session) => assertSession(session);
  await nhetPhien(page, { supabaseUrl: "https://mock-project.supabase.co", nowMs });
  await caiGiaLap(page, { supabaseUrl: "https://mock-project.supabase.co", nowMs });
  let response;
  page.handleRequest({
    url: () => "https://mock-project.supabase.co/auth/v1/token?grant_type=refresh_token",
    method: () => "POST",
    postData: () => JSON.stringify({ refresh_token: "gia-lap-refresh" }),
    respond: async (value) => { response = value; },
  });
  assert.equal(response.status, 200);
  assertSession(JSON.parse(response.body));
});

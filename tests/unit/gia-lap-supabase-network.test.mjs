import assert from "node:assert/strict";
import test from "node:test";
import { caiGiaLap } from "../e2e/gia-lap-supabase.mjs";

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

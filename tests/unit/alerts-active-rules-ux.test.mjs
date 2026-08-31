import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let vite;
let modules;

async function loadModules() {
  if (!vite) vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  if (!modules) {
    const alerts = await vite.ssrLoadModule("/src/pages/AlertsPage.tsx");
    const rules = await vite.ssrLoadModule("/src/pages/ActiveRulesPage.tsx");
    modules = { alerts, rules };
  }
  return modules;
}

test.after(async () => { await vite?.close(); });

const alert = {
  a: {
    id: "PQ-001",
    code: "PQ-001",
    name: "Nồi hấp thử nghiệm",
    vtype: "PQ",
    cls: "tb",
    owner: "Nguyễn QA",
    st: "todo",
  },
  kind: "soon",
  stage: "Thẩm định",
  date: new Date("2026-09-20T00:00:00"),
  dleft: 20,
};

test("alert row keeps detail and email as separate native controls", async () => {
  const { alerts } = await loadModules();
  assert.ok(alerts.AlertRowItem, "the alert row is available for real render testing");

  const html = renderToStaticMarkup(React.createElement(alerts.AlertRowItem, {
    r: alert,
    email: "qa@example.test",
    onOpen: () => {},
  }));

  assert.equal((html.match(/<button\b/g) || []).length, 1, "only the detail action is a button");
  assert.match(html, /<button[^>]*type="button"[^>]*aria-label="Xem chi tiết cảnh báo PQ-001"/);
  assert.match(html, /<a[^>]*href="mailto:qa@example\.test\?subject=/);
  assert.doesNotMatch(html, /role="button"[^>]*>[\s\S]*?href="mailto:/);
});

test("asynchronous AI errors are announced", async () => {
  const { alerts } = await loadModules();
  assert.equal(typeof alerts.AlertAiError, "function");

  const html = renderToStaticMarkup(React.createElement(alerts.AlertAiError, {
    message: "Lỗi kết nối n8n.",
  }));

  assert.match(html, /role="alert"/);
  assert.match(html, /Lỗi kết nối n8n\./);
});

test("bulk recalculation confirmation opens only on request and closes after cancel or confirm", async () => {
  const { rules } = await loadModules();
  assert.equal(typeof rules.transitionRecalcConfirmation, "function");

  assert.equal(rules.transitionRecalcConfirmation("closed", "open"), "open");
  assert.equal(rules.transitionRecalcConfirmation("open", "cancel"), "closed");
  assert.equal(rules.transitionRecalcConfirmation("open", "confirm"), "closed");
});

test("bulk recalculation failures stay in the page with a retry path", async () => {
  const { rules } = await loadModules();
  assert.equal(typeof rules.RecalcFeedback, "function");

  const html = renderToStaticMarkup(React.createElement(rules.RecalcFeedback, {
    error: "Máy chủ không phản hồi",
    onRetry: () => {},
  }));

  assert.match(html, /role="alert"/);
  assert.match(html, /Máy chủ không phản hồi/);
  assert.match(html, /<button[^>]*>Thử lại<\/button>/);
});

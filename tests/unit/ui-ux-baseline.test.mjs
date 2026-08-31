import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CardTitle } from "../../src/components/ui/Primitives.tsx";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = (relativePath) => readFileSync(path.join(ROOT, relativePath), "utf8");

test("CardTitle renders the requested semantic heading level", () => {
  const html = renderToStaticMarkup(React.createElement(CardTitle, { level: 3 }, "Phạm vi"));

  assert.match(html, /<h3[^>]*>Phạm vi<\/h3>/);
});

test("app shell exposes keyboard landmarks and names its primary navigation", () => {
  const app = source("src/App.tsx");
  const layout = source("src/components/layout/Layout.tsx");

  assert.match(app, /href="#vmp-main-content"/);
  assert.match(app, /event\.preventDefault\(\); mainRef\.current\?\.focus\(\)/);
  assert.match(app, /<main[^>]*id="vmp-main-content"[^>]*tabIndex=\{-1\}/s);
  assert.match(layout, /<nav[^>]*aria-label="Điều hướng chính"/s);
  assert.match(layout, /Vai trò:\s*\{/);
  assert.match(layout, /PanelLeftClose|PanelLeftOpen/);
});

test("topbar wordmark uses an accessible Art Nouveau masthead structure", () => {
  const layout = source("src/components/layout/Layout.tsx");
  const shell = source("src/styles/lotus-shell.css");

  assert.match(layout, /className="vmp-masthead__ten" aria-hidden="true"/);
  assert.match(layout, /className="vmp-masthead__v"/);
  assert.match(layout, /className="vmp-masthead__mp"/);
  assert.match(layout, /className="vmp-masthead__monitor"/);
  assert.match(layout, /className="vmp-masthead__lotus"/);
  assert.match(shell, /\.vmp-masthead__ten\s*\{[\s\S]*?display:\s*inline-flex/);
  assert.match(shell, /\.vmp-masthead__v\s*\{[\s\S]*?font-size:\s*clamp\(/);
  assert.match(shell, /\.vmp-masthead__monitor\s*\{[\s\S]*?font-style:\s*italic/);
});

test("shared modal has dialog semantics, Escape handling and focus restoration", () => {
  const primitives = source("src/components/ui/Primitives.tsx");
  const modal = primitives.slice(primitives.indexOf("export function Modal"), primitives.indexOf("// ======================== DONUT"));

  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /aria-labelledby=\{titleId\}/);
  assert.match(modal, /ev\.key === "Escape"/);
  assert.match(modal, /previouslyFocused/);
  assert.match(modal, /aria-label="Đóng hộp thoại"/);
});

test("chat controls and panel expose accessible names and dialog behavior", () => {
  const chat = source("src/components/ai/ChatBox.tsx");

  assert.match(chat, /aria-label="Trò chuyện cùng công chúa Vali"/);
  assert.match(chat, /role="dialog"/);
  assert.match(chat, /aria-modal="false"/);
  assert.match(chat, /aria-labelledby="vmp-chat-title"/);
  assert.match(chat, /aria-label="Đóng trò chuyện"/);
  assert.match(chat, /aria-label="Nội dung câu hỏi"/);
  assert.match(chat, /aria-label="Gửi câu hỏi"/);
  assert.match(chat, /event\.key === "Escape"/);
});

test("clickable dashboard targets are native buttons", () => {
  const app = source("src/App.tsx");
  const alerts = source("src/pages/AlertsPage.tsx");
  const workload = source("src/pages/WorkloadPage.tsx");

  assert.doesNotMatch(app, /<div key=\{c\.id\} onClick=/);
  assert.doesNotMatch(alerts, /<div key=\{c\.id\} onClick=/);
  assert.doesNotMatch(workload, /<div onClick=\{\(\) => openDetail\(`\$\{p\.name\}/);
  /* 31/08 — ô ma trận sang bề mặt sổ: aria-label đọc đủ câu
     "<người>, <cột>: <giá trị> <đơn vị>, mức <bậc>. Xem N hạng mục." */
  assert.match(workload, /aria-label=\{`\$\{p\.name\}, \$\{c\}: \$\{v\}/);
});

test("filters are grouped, named and stay in normal document flow", () => {
  const app = source("src/App.tsx");
  const shell = source("src/styles/lotus-shell.css");

  assert.match(app, /role="group" aria-label="Phạm vi toàn hệ thống"/);
  assert.match(app, /aria-label="Lọc nhật ký theo hành động"/);
  assert.match(app, /aria-label="Lọc nhật ký theo email"/);
  assert.match(app, /aria-label="Lọc nhật ký theo mã hạng mục"/);
  assert.doesNotMatch(shell, /\.vmp-thanh-loc--treo\s*\{\s*margin-top:\s*-\d+px/);
});

test("overview background and progress summary preserve dashboard legibility", () => {
  const app = source("src/App.tsx");
  const shell = source("src/styles/lotus-shell.css");

  assert.match(app, /className="vmp-overview-progress"/);
  assert.match(app, /className="vmp-overview-progress__row"/);
  assert.match(shell, /\.vmp-main-nen::before[\s\S]*?opacity:\s*0\.32;/);
  assert.match(shell, /\.vmp-overview-progress__row/);
});

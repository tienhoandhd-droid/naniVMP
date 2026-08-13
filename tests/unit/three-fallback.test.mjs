import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThreeFallbackBoundary, ThreeFallbackMessage } from "../../src/components/three/ThreeFallbackBoundary.tsx";

test("WebGL lỗi có thông báo và hành động xem 2D", () => {
  const html = renderToStaticMarkup(React.createElement(ThreeFallbackMessage, { onUse2D: () => {} }));
  assert.match(html, /Không dựng được bản đồ 3D/);
  assert.match(html, /Xem bảng nhiệt 2D/);
  assert.match(html, /<button/);
});

test("boundary chuyển sang fallback sau lỗi child, nhưng không gọi 2D tự động", () => {
  let use2D = 0;
  const boundary = new ThreeFallbackBoundary({ children: React.createElement("span", null, "child"), onUse2D: () => { use2D++; } });
  boundary.state = ThreeFallbackBoundary.getDerivedStateFromError(new Error("WebGL"));
  const fallback = boundary.render();
  assert.equal(use2D, 0);
  const html = renderToStaticMarkup(fallback);
  assert.match(html, /Không dựng được bản đồ 3D/);
  fallback.props.onUse2D();
  assert.equal(use2D, 1);
});

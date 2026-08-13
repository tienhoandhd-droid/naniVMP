import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThreeFallbackMessage } from "../../src/components/three/ThreeFallbackBoundary.tsx";

test("WebGL lỗi có thông báo và hành động xem 2D", () => {
  const html = renderToStaticMarkup(React.createElement(ThreeFallbackMessage, { onUse2D: () => {} }));
  assert.match(html, /Không dựng được bản đồ 3D/);
  assert.match(html, /Xem bảng nhiệt 2D/);
  assert.match(html, /<button/);
});

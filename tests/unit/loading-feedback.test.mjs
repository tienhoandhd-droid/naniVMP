import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SkeletonDashboard } from '../../src/components/ui/Primitives.tsx';
test('route loading exposes a named status alongside its visual skeleton', () => {
  const html = renderToStaticMarkup(React.createElement(SkeletonDashboard));
  assert.match(html, /role="status"/);
  assert.match(html, /Đang tải nội dung/);
});

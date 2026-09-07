import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLongMonView, buildOrganicPlacements } from '../../src/features/monitoring/longMonPresentation.ts';

const fish = (count) => Array.from({length: count}, (_, i) => ({activity: {id: `fish-${i}`}, deadline: '2026-09-07', stage: 'carp'}));

test('view preferences only accept the two supported modes', () => {
  assert.equal(parseLongMonView('organic'), 'organic');
  for (const input of ['date', null, undefined, '', 'other', {}, '__proto__']) assert.equal(parseLongMonView(input), 'date');
});
for (const count of [0, 1, 20, 150, 500]) test(`organic layout retains all ${count} fish, stable identity and bounded geometry`, () => {
  const input = fish(count);
  const before = structuredClone(input);
  const result = buildOrganicPlacements(input);
  assert.equal(result.size, count);
  assert.deepEqual(input, before);
  assert.deepEqual(result, buildOrganicPlacements([...input].reverse()));
  for (const item of input) {
    const p = result.get(item.activity.id);
    assert.ok(p.xPct >= 8 && p.xPct <= 89);
    assert.ok(p.yPct >= 24 && p.yPct <= 85);
    assert.ok(Number.isFinite(p.rotateDeg) && Math.abs(p.rotateDeg) <= 28);
    assert.ok(p.scale >= .65 && p.scale <= 1.15);
  }
  if (count > 1) {
    assert.equal(new Set([...result.values()].map(p => `${p.xPct},${p.yPct}`)).size, count);
    assert.ok(new Set([...result.values()].map(p => p.rotateDeg)).size > 1);
  }
});

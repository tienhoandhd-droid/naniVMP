import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const artifact = new URL('../../public/tham-dinh-thuc-te/box-stats.js', import.meta.url);
const context = { window: {} };

if (existsSync(artifact)) {
  vm.runInNewContext(readFileSync(artifact, 'utf8'), context, { filename: 'box-stats.js' });
}

const api = context.window.CPC1BoxStats || {};
const method = 'linear-type7-iqr1.5-v1';
const plain = (value) => JSON.parse(JSON.stringify(value));
const summarize = (values) => {
  assert.equal(typeof api.summarize, 'function', 'window.CPC1BoxStats.summarize must exist');
  return api.summarize(values);
};

test('uses type-7 quartiles and strict 1.5 IQR fences for an upper outlier', () => {
  assert.deepEqual(plain(summarize([1, 2, 3, 4, 5, 6, 7, 100])), {
    n: 8,
    q1: 2.75,
    median: 4.5,
    q3: 6.25,
    iqr: 3.5,
    lowerFence: -2.5,
    upperFence: 11.5,
    lowerWhisker: 1,
    upperWhisker: 7,
    outliers: [{ index: 7, value: 100 }],
    smallSample: false,
    method,
  });
});

test('uses the same quartile method for negative values and a lower outlier', () => {
  assert.deepEqual(plain(summarize([-1, -2, -3, -4, -5, -6, -7, -100])), {
    n: 8,
    q1: -6.25,
    median: -4.5,
    q3: -2.75,
    iqr: 3.5,
    lowerFence: -11.5,
    upperFence: 2.5,
    lowerWhisker: -7,
    upperWhisker: -1,
    outliers: [{ index: 7, value: -100 }],
    smallSample: false,
    method,
  });
});

test('preserves duplicate observations and does not mutate the input', () => {
  const values = Object.freeze([2, 1, 2, 1]);

  assert.deepEqual(plain(summarize(values)), {
    n: 4,
    q1: 1,
    median: 1.5,
    q3: 2,
    iqr: 1,
    lowerFence: -0.5,
    upperFence: 3.5,
    lowerWhisker: 1,
    upperWhisker: 2,
    outliers: [],
    smallSample: false,
    method,
  });
  assert.deepEqual(values, [2, 1, 2, 1]);
});

test('handles zero IQR and retains original indices for different values', () => {
  assert.deepEqual(plain(summarize([5, 5, 5, 5, 50])), {
    n: 5,
    q1: 5,
    median: 5,
    q3: 5,
    iqr: 0,
    lowerFence: 5,
    upperFence: 5,
    lowerWhisker: 5,
    upperWhisker: 5,
    outliers: [{ index: 4, value: 50 }],
    smallSample: false,
    method,
  });
});

test('keeps values exactly on both fences inside the whiskers', () => {
  assert.deepEqual(plain(summarize([-2, 4, 6, 8, 14])), {
    n: 5,
    q1: 4,
    median: 6,
    q3: 8,
    iqr: 4,
    lowerFence: -2,
    upperFence: 14,
    lowerWhisker: -2,
    upperWhisker: 14,
    outliers: [],
    smallSample: false,
    method,
  });
});

test('ignores invalid values without numeric coercion', () => {
  assert.deepEqual(plain(summarize([null, '3', Number.NaN, Infinity, -Infinity, 2, undefined, 4])), {
    n: 2,
    q1: 2.5,
    median: 3,
    q3: 3.5,
    iqr: 1,
    lowerFence: 1,
    upperFence: 5,
    lowerWhisker: 2,
    upperWhisker: 4,
    outliers: [],
    smallSample: true,
    method,
  });
});

test('returns explicit empty and one-observation summaries', () => {
  assert.deepEqual(plain(summarize([null, '4', Number.NaN, Infinity, -Infinity, true, undefined])), {
    n: 0,
    q1: null,
    median: null,
    q3: null,
    iqr: null,
    lowerFence: null,
    upperFence: null,
    lowerWhisker: null,
    upperWhisker: null,
    outliers: [],
    smallSample: true,
    method,
  });
  assert.deepEqual(plain(summarize([9])), {
    n: 1,
    q1: 9,
    median: 9,
    q3: 9,
    iqr: 0,
    lowerFence: 9,
    upperFence: 9,
    lowerWhisker: 9,
    upperWhisker: 9,
    outliers: [],
    smallSample: true,
    method,
  });
});

test('computes deterministic summaries for two and three observations', () => {
  assert.deepEqual(plain(summarize([1, 3])), {
    n: 2,
    q1: 1.5,
    median: 2,
    q3: 2.5,
    iqr: 1,
    lowerFence: 0,
    upperFence: 4,
    lowerWhisker: 1,
    upperWhisker: 3,
    outliers: [],
    smallSample: true,
    method,
  });
  assert.deepEqual(plain(summarize([-3, 0, 9])), {
    n: 3,
    q1: -1.5,
    median: 0,
    q3: 4.5,
    iqr: 6,
    lowerFence: -10.5,
    upperFence: 13.5,
    lowerWhisker: -3,
    upperWhisker: 9,
    outliers: [],
    smallSample: true,
    method,
  });
});

test('interpolates finite extremes without overflowing intermediate differences', () => {
  const result = summarize([-1e308, 1e308]);

  assert.equal(result.q1, -5e307);
  assert.equal(result.median, 0);
  assert.equal(result.q3, 5e307);
  assert.equal(result.iqr, 1e308);
  assert.equal(result.lowerFence, -Infinity);
  assert.equal(result.upperFence, Infinity);
  assert.equal(result.lowerWhisker, -1e308);
  assert.equal(result.upperWhisker, 1e308);
  assert.deepEqual(plain(result.outliers), []);
});

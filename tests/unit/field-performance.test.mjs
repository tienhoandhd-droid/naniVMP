import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanMetric, initialScreen, createMetricQueue, metricRating } from '../../src/lib/fieldPerformanceModel.ts';

test('only allowlisted metric numbers and initial screen survive private input', () => {
  assert.deepEqual(cleanMetric({name:'INP', value:123.456, entries:[{name:'secret@example.com'}], id:'private'}), {name:'INP',value:123.46});
  for (const value of [-1,NaN,Infinity,600001,'20',null]) assert.equal(cleanMetric({name:'INP',value}), null);
  assert.equal(cleanMetric({name:'CLS',value:11}),null);
  assert.equal(cleanMetric({name:'EMAIL',value:10}),null);
  assert.equal(initialScreen('#v=today&q=secret@example.com'), 'today');
  assert.equal(initialScreen('#access_token=secret'), 'other');
  assert.equal(initialScreen('#v=private-company'), 'other');
});

test('queue replaces repeated metrics, ignores duplicates, and caps transmission', () => {
  const queue=createMetricQueue(2);
  queue.add({name:'INP',value:100}); queue.add({name:'INP',value:120}); queue.add({name:'CLS',value:0});
  assert.deepEqual(queue.take(),[{name:'INP',value:120},{name:'CLS',value:0}]);
  queue.add({name:'INP',value:120}); assert.deepEqual(queue.take(),[]);
  queue.add({name:'INP',value:180}); assert.deepEqual(queue.take(),[{name:'INP',value:180}]);
  queue.add({name:'LCP',value:2000}); assert.deepEqual(queue.take(),[]);
});

test('ratings use official thresholds and distinguish pending from real zero', () => {
  assert.equal(metricRating('INP',200),'good'); assert.equal(metricRating('INP',501),'poor');
  assert.equal(metricRating('LCP',2501),'needs-improvement'); assert.equal(metricRating('CLS',0),'good');
  assert.equal(metricRating('CLS',null),'pending');
});

test('latest metric returning to sent value clears a stale pending update', () => {
  const queue=createMetricQueue();
  queue.add({name:'INP',value:100}); queue.take();
  queue.add({name:'INP',value:200}); queue.add({name:'INP',value:100});
  assert.deepEqual(queue.take(),[]);
});

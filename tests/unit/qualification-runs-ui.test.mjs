import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../public/tham-dinh-thuc-te/', import.meta.url);
const source = readFileSync(new URL('runs.js', root), 'utf8');
const context = { window: {}, console, crypto: { randomUUID: () => 'request-id' } };
vm.runInNewContext(source, context, { filename: 'runs.js' });
const ui = context.window.CPC1RunsUI;
const plain = value => JSON.parse(JSON.stringify(value));

test('campaign scope includes every measurement form and configured point for each selected system', () => {
  const config = { locations: [{ id: 'S1' }, { id: 'S2' }] };
  const gas = { forms: [{ id: 'bm01', kind: 'measurement', locations: [{ id: 'A1' }] }, { id: 'bm05', kind: 'summary', locations: [] }] };
  assert.deepEqual(plain(ui.campaignScope(['steam', 'air'], config, { air: gas })), [
    { system: 'steam', forms: { bm01: ['S1', 'S2'], bm02: ['S1', 'S2'], bm03: ['S1', 'S2'], bm04: ['S1', 'S2'] } },
    { system: 'air', forms: { bm01: ['A1'] } }
  ]);
});

test('single steam scope requires BM03 with the same points when BM04 is selected', () => {
  assert.deepEqual(plain(ui.validateSingleScope('steam', { bm04: ['S1'] })), { valid: false, message: 'BM04 cần chọn BM03 với cùng điểm lấy mẫu.' });
  assert.deepEqual(plain(ui.validateSingleScope('steam', { bm03: ['S1'], bm04: ['S1'] })), { valid: true, message: '' });
});

test('trend series keeps monthly gaps and excludes uncertain or null values without averaging points', () => {
  const history = [
    { system: 'steam', period: '2026-08-01', trend: [{ form: 'bm03', point_id: 'S1', metric: 'dryness', label: 'Độ khô', unit: '%', value: 95, uncertain: false }] },
    { system: 'air', period: '2026-09-01', trend: [{ form: 'bm01', point_id: 'A1', metric: 'particles', label: 'Tiểu phân', unit: 'hạt', value: 1, uncertain: false }] },
    { system: 'steam', period: '2026-10-01', trend: [
      { form: 'bm03', point_id: 'S1', metric: 'dryness', label: 'Độ khô', unit: '%', value: 97, uncertain: false },
      { form: 'bm03', point_id: 'S2', metric: 'dryness', label: 'Độ khô', unit: '%', value: 10, uncertain: false },
      { form: 'bm03', point_id: 'S1', metric: 'dryness', label: 'Độ khô', unit: '%', value: null, uncertain: false },
      { form: 'bm03', point_id: 'S1', metric: 'dryness', label: 'Độ khô', unit: '%', value: 98, uncertain: true }
    ] }
  ];
  const out = ui.trendSeries(history, 'steam', 'bm03', 'S1', 'dryness');
  assert.deepEqual(plain(out.months), ['2026-08-01', '2026-09-01', '2026-10-01']);
  assert.deepEqual(plain(out.values), [95, null, 97]);
  assert.equal(out.excluded, 2);
  assert.equal(out.unit, '%');
});

test('UI uses safe text rendering for imported issues and exposes all chart values in a table', () => {
  const html = readFileSync(new URL('runs.html', root), 'utf8');
  assert.match(html, /<table[^>]*id="trend-data"/);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
});

test('two saved runs in one month retain both numerical observations',()=>{
 const history=[1,2].map((n)=>({id:String(n),system:'air',period:'2026-03-01',trend:[{form:'bm02',point_id:'A1',metric:'dewpoint',value:-10-n,uncertain:false}]}));
 const out=ui.trendSeries(history,'air','bm02','A1','dewpoint');
 assert.deepEqual(plain(out.series.flatMap(s=>s.values)).filter(v=>v!==null).sort(),[-11,-12].sort());
});

test('all points share a chart but keep distinct series, trials and monthly gaps', () => {
  const row=(point,trial,value,extra={})=>({form:'bm03',point_id:point,trial,metric:'dryness',unit:'ratio',value,...extra});
  const history=[
    {system:'steam',period:'2026-03-01',trend:[row('S1',1,0.9),row('S2',1,0.8),row('S1',2,0.95)]},
    {system:'steam',period:'2026-05-01',trend:[row('S1',1,0.91),row('S2',1,null),row('S1',2,0.99,{uncertain:true}),row('S3',1,0)]},
    {system:'air',period:'2026-05-01',trend:[row('OTHER',1,500)]}
  ];
  const out=ui.trendSeries(history,'steam','bm03',null,'dryness','ratio');
  assert.deepEqual(plain(out.series.map(s=>[s.point_id,s.trial,s.values])),[
    ['S1',1,[0.9,null,0.91]],['S1',2,[0.95,null,null]],['S2',1,[0.8,null,null]],['S3',1,[null,null,0]]
  ]);
  assert.equal(out.rows.length,7);assert.equal(out.excluded,2);
});

test('shared chart isolates units and metrics and retains duplicate observations per point',()=>{
 const row=(point,value,extra={})=>({form:'bm01',point_id:point,metric:'particles',unit:'hạt/m³',value,...extra});
 const history=[{system:'air',period:'2026-03-01',trend:[row('A',10),row('B',20),row('A',11),row('A',999,{unit:'hạt/L'}),row('A',888,{metric:'other'}),row('A',777,{form:'bm02'})]}];
 const out=ui.trendSeries(history,'air','bm01',null,'particles','hạt/m³');
 assert.equal(out.rows.length,3);
 assert.deepEqual(plain(out.series.map(s=>[s.point_id,s.values])),[['A',[10]],['A',[11]],['B',[20]]]);
 const one=ui.trendSeries(history,'air','bm01','B','particles','hạt/m³');assert.deepEqual(plain(one.series.map(s=>s.point_id)),['B']);
});

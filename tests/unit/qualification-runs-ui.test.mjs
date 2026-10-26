import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../public/tham-dinh-thuc-te/', import.meta.url);
const source = readFileSync(new URL('runs.js', root), 'utf8');
const context = { window: {}, console, URLSearchParams, crypto: { randomUUID: () => 'request-id' } };
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

test('run calibration validation requires the exact server requirements and keeps scope-derived keys',()=>{
 assert.equal(typeof ui.validateCalibration,'function');
 const requirements=[
  {key:'air:bm01:expiry',name:'Máy đếm',kind:'calibration'},
  {key:'air:bm03:expiry',name:'Ống phát hiện dầu',kind:'expiry'}
 ];
 assert.deepEqual(plain(ui.validateCalibration(requirements,{
  'air:bm01:expiry':{name:'Máy đếm 01',due_on:'2026-12-31'},
  'air:bm03:expiry':{name:'',due_on:'2026-11-30'}
 })),{valid:false,message:'Nhập tên thiết bị và hạn cho tất cả thiết bị trong phạm vi.'});
 assert.deepEqual(plain(ui.validateCalibration(requirements,{
  'air:bm01:expiry':{name:'Máy đếm 01',due_on:'2026-12-31'},
  'air:bm03:expiry':{name:'Ống dầu 02',due_on:'2026-11-30'}
 })),{valid:true,message:''});
});

test('dedicated trend route pins one system and closed multi-run series never crosses systems',()=>{
 assert.equal(typeof ui.trendRoute,'function');
 assert.equal(typeof ui.closedTrendHistory,'function');
 assert.deepEqual(plain(ui.trendRoute('?view=trend&system=air')),{dedicated:true,system:'air'});
 assert.deepEqual(plain(ui.trendRoute('?view=trend&system=oxygen')),{dedicated:false,system:null});
 const runs=[{id:'r1',status:'completed'},{id:'r2',status:'open'},{id:'r3',status:'closed'}];
 const history=[
  {run_id:'r1',system:'air',period:'2026-03-01'},
  {run_id:'r2',system:'air',period:'2026-04-01'},
  {run_id:'r3',system:'nitrogen',period:'2026-05-01'}
 ];
 assert.deepEqual(plain(ui.closedTrendHistory(history,runs,'air')),[{run_id:'r1',system:'air',period:'2026-03-01'}]);
});

test('air and nitrogen share one device entry per form field; steam and nitrogen-only fields stay separate', () => {
  const req = (system, form, field, name, kind = 'calibration') => ({ key: `${system}:${form}:${field}`, system, form, name, kind });
  const requirements = [req('steam', 'bm01', 'device', 'Thiết bị đo khí không ngưng tụ'), req('air', 'bm01', 'expiry', 'Tiểu phân'), req('air', 'bm03', 'expiry', 'Vết dầu', 'expiry'),
    req('nitrogen', 'bm01', 'expiry', 'Tiểu phân'), req('nitrogen', 'bm03', 'expiry', 'Vết dầu', 'expiry'), req('nitrogen', 'bm05', 'expiry', 'Độ tinh khiết')];
  assert.deepEqual(plain(ui.calibrationGroups(requirements).map(g => g.keys)), [
    ['steam:bm01:device'], ['air:bm01:expiry', 'nitrogen:bm01:expiry'], ['air:bm03:expiry', 'nitrogen:bm03:expiry'], ['nitrogen:bm05:expiry']
  ]);
  const differing = { 'air:bm01:expiry': { name: 'A', due_on: '2026-12-01' }, 'nitrogen:bm01:expiry': { name: 'B', due_on: '2026-12-01' } };
  assert.equal(ui.calibrationGroups(requirements.slice(1, 4), differing).length, 3, 'saved runs with different devices keep separate rows');
});

test('single-use expiry carries over from the latest run of the same year while still valid', () => {
  const item = system => ({ key: `${system}:bm03:expiry`, system, form: 'bm03', name: 'Vết dầu', kind: 'expiry' });
  const calibrationItem = { key: 'air:bm01:expiry', system: 'air', form: 'bm01', name: 'Tiểu phân', kind: 'calibration' };
  const run = (title, started_on, due_on) => ({ title, started_on, calibration_requirements: [item('nitrogen')], calibration: { 'nitrogen:bm03:expiry': { name: 'Ống Dräger', due_on } } });
  const runs = [run('Tháng 3', '2026-03-02', '2026-12-31'), run('Tháng 1', '2026-01-05', '2026-06-30'), run('Năm trước', '2025-11-01', '2027-01-31')];
  assert.deepEqual(plain(ui.carriedExpiry([item('air'), calibrationItem], runs, '2026-10-26')), { 'air:bm03:expiry': { name: 'Ống Dräger', due_on: '2026-12-31', from: 'Tháng 3' } });
  assert.deepEqual(plain(ui.carriedExpiry([item('air')], runs, '2027-01-10')), {}, 'a new year asks again');
  assert.deepEqual(plain(ui.carriedExpiry([item('air')], [runs[1]], '2026-10-26')), {}, 'expired values are not reused');
});

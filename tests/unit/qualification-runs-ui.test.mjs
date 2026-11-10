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

test('overview summary counts open runs once, approved records and failed points across systems', () => {
  const line = (run_id, status, sign_state, fail) => ({ run_id, status, sign_state, progress: { total: 10, complete: 5, fail } });
  const sum = ui.overviewSummary({ year: 2026, systems: [
    { system: 'air', objects: ['HT-12'], pq_items: [{ id: 'HT-12/2026.01-PQ' }], runs: [line('r2', 'open', 'chua_ky', 1), line('r1', 'closed', 'da_duyet', 0)] },
    { system: 'nitrogen', objects: ['HT-13'], pq_items: [], runs: [line('r2', 'open', 'da_kiem_tra', 2)] },
    { system: 'steam', objects: ['HT-14', 'HT-15'], pq_items: [], runs: [] }
  ] });
  assert.equal(sum.openRuns, 1, 'một đợt chung nhiều hệ thống chỉ đếm một lần');
  assert.equal(sum.records, 3);
  assert.equal(sum.approved, 1);
  assert.equal(sum.fail, 3);
  assert.deepEqual(sum.systems.map(s => [s.system, s.latest?.run_id ?? null, s.others.length]), [['air', 'r2', 1], ['nitrogen', 'r2', 0], ['steam', null, 0]]);
});

test('overview summary tolerates missing data', () => {
  assert.deepEqual(plain(ui.overviewSummary(null)), { openRuns: 0, records: 0, approved: 0, fail: 0, systems: [] });
});

const airSnapshot = {
  data: { forms: { bm01: { A1: { p05: '330', p5: '2', executed_by: 'Hoàn', execution_date: '2026-03-05' } }, bm02: { A1: { oil: 'KPH' } } } },
  evaluation: {
    forms: { bm01: { rows: { A1: { status: 'pass', errors: {} }, A2: { status: 'fail', errors: {} } } }, bm02: { rows: { A1: { status: 'invalid', errors: { oil: 'Nhập số thập phân hợp lệ.' } }, A2: { status: 'incomplete' } } } },
    source_context: { config: { forms: [
      { id: 'bm01', title: 'Tiểu phân', fields: [{ key: 'p05', label: 'Tiểu phân ≥ 0,5 µm', unit: 'hạt/m³' }, { key: 'p5', label: 'Tiểu phân ≥ 5,0 µm', unit: 'hạt/m³' }, { key: 'executed_by', label: 'Người thực hiện', unit: '' }, { key: 'execution_date', label: 'Ngày thực hiện', type: 'date', unit: '' }], locations: [{ id: 'A1', name: 'Tank' }, { id: 'A2', name: 'Phòng B' }] },
      { id: 'bm02', title: 'Dầu', fields: [{ key: 'oil', label: 'Hàm lượng dầu', unit: 'mg/m³' }], locations: [{ id: 'A1', name: 'Tank' }] }
    ] } }
  }
};

test('point grid: rows are scoped points, statuses come from the saved evaluation, missing scope cells stay empty', () => {
  const grid = plain(ui.pointGrid('air', { bm01: ['A1', 'A2'], bm02: ['A1'] }, airSnapshot));
  assert.deepEqual(grid.forms, [{ id: 'bm01', title: 'Tiểu phân' }, { id: 'bm02', title: 'Dầu' }]);
  assert.deepEqual(grid.points.map(p => [p.id, p.point.name, p.cells]), [['A1', 'Tank', { bm01: 'pass', bm02: 'invalid' }], ['A2', 'Phòng B', { bm01: 'fail', bm02: null }]]);
  assert.deepEqual(grid.counts, { pass: 1, fail: 1, invalid: 1, pending: 0, total: 3 });
});

test('point grid: steam reads locations status; unknown status counts as pending', () => {
  const snap = { evaluation: { forms: { bm01: { locations: { S1: 'pass', S2: 'incomplete' } } }, source_context: { config: { locations: [{ id: 'S1', name: 'Máy phát' }] } } } };
  const grid = plain(ui.pointGrid('steam', { bm01: ['S1', 'S2', 'S3'] }, snap));
  assert.deepEqual(grid.points.map(p => p.cells.bm01), ['pass', 'pending', 'pending']);
  assert.deepEqual(grid.counts, { pass: 1, fail: 0, invalid: 0, pending: 2, total: 3 });
});

test('point detail: gas shows original entered values with labels/units, dates dd/mm/yyyy, and reasons for invalid', () => {
  const d = plain(ui.pointDetail('air', airSnapshot, 'bm01', 'A1'));
  assert.equal(d.form, 'Tiểu phân');
  assert.equal(d.status, 'pass');
  assert.deepEqual(d.groups[0].rows, [
    { label: 'Tiểu phân ≥ 0,5 µm', value: '330', unit: 'hạt/m³' }, { label: 'Tiểu phân ≥ 5,0 µm', value: '2', unit: 'hạt/m³' },
    { label: 'Người thực hiện', value: 'Hoàn', unit: '' }, { label: 'Ngày thực hiện', value: '05/03/2026', unit: '' }]);
  const bad = plain(ui.pointDetail('air', airSnapshot, 'bm02', 'A1'));
  assert.equal(bad.status, 'invalid');
  assert.deepEqual(bad.groups[0].issues, ['Hàm lượng dầu: Nhập số thập phân hợp lệ.']);
  assert.deepEqual(plain(ui.pointDetail('air', airSnapshot, 'bm02', 'A2')).groups, [], 'chưa nhập thì không có nhóm số liệu');
});

test('point detail: steam lists each trial with the computed print result; a single-trial form is one group', () => {
  const snap = {
    data: { bm01: { S1: [{ vg: '2,1', vc: '145', date: '2026-03-10', executor: 'Phương' }, { vg: '2', vc: '150' }] }, bm02: { S1: { toc: '200' } } },
    evaluation: { forms: { bm01: { locations: { S1: 'pass' }, rows: { S1: [{ errors: {}, values: { print_result: '1.47' } }, { errors: {}, values: { print_result: '1.35' } }] } }, bm02: { locations: { S1: 'pass' }, rows: { S1: { errors: {}, values: {} } } } },
      source_context: { config: { forms: [{ id: 'bm01', title: 'Khí không ngưng tụ', fields: [{ key: 'vg', label: 'Vg', unit: 'mL' }, { key: 'vc', label: 'Vc', unit: 'mL' }] }, { id: 'bm02', title: 'Nước ngưng', fields: [{ key: 'toc', label: 'TOC', unit: 'ppb' }] }], locations: [{ id: 'S1', name: 'Máy phát' }] } } }
  };
  const d = plain(ui.pointDetail('steam', snap, 'bm01', 'S1'));
  assert.deepEqual(d.groups.map(g => g.title), ['Lần 1', 'Lần 2']);
  assert.deepEqual(d.groups[0].rows, [{ label: 'Vg', value: '2,1', unit: 'mL' }, { label: 'Vc', value: '145', unit: 'mL' }, { label: 'Ngày thực hiện', value: '10/03/2026', unit: '' }, { label: 'Người thực hiện', value: 'Phương', unit: '' }, { label: 'Kết quả tính', value: '1,47', unit: '' }]);
  assert.deepEqual(plain(ui.pointDetail('steam', snap, 'bm02', 'S1')).groups, [{ title: '', rows: [{ label: 'TOC', value: '200', unit: 'ppb' }], issues: [] }]);
  const withSelect = JSON.parse(JSON.stringify(snap));
  withSelect.data.bm02.S1.appearance = 'pass';
  withSelect.evaluation.source_context.config.forms[1].fields.unshift({ key: 'appearance', type: 'select', label: 'Cảm quan', options: [{ label: 'Trong, không màu, không mùi', value: 'pass' }] });
  assert.deepEqual(plain(ui.pointDetail('steam', withSelect, 'bm02', 'S1')).groups[0].rows[0], { label: 'Cảm quan', value: 'Trong, không màu, không mùi', unit: '' }, 'trường chọn hiện nhãn, không hiện mã');
});

test('C3 (10/11): mỗi số liệu xu hướng mang ngày đo; thiếu ngày đo thì dùng ngày bắt đầu đợt', () => {
  const row = (point, value, extra = {}) => ({ form: 'bm01', point_id: point, metric: 'p05', unit: 'hạt/m³', value, ...extra });
  const runs = [{ id: 'r1', status: 'closed', started_on: '2026-10-05' }, { id: 'r2', status: 'open', started_on: '2026-10-25' }];
  const history = [
    { system: 'air', run_id: 'r1', period: '2026-10-01', trend: [row('A', 10, { measured_on: '2026-10-21T08:30:00+07:00' }), row('B', 20)] },
    { system: 'air', run_id: 'r2', period: '2026-10-01', trend: [row('A', 30, { measured_on: '2026-10-26' })] },
  ];
  const closed = ui.closedTrendHistory(history, runs, 'air');
  assert.equal(closed.length, 1);
  const out = ui.trendSeries(closed, 'air', 'bm01', null, 'p05', 'hạt/m³');
  assert.deepEqual(plain(out.series.map(s => [s.point_id, s.values, s.dates])), [['A', [10], ['2026-10-21']], ['B', [20], ['2026-10-05']]]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../../public/tham-dinh-thuc-te/entry-history.js',import.meta.url),'utf8');
const context={window:{},structuredClone,console};
vm.runInNewContext(source,context,{filename:'entry-history.js'});
const history=context.window.CPC1EntryHistory;
const plain=value=>JSON.parse(JSON.stringify(value));

test('entry history helper exposes the shared browser contract',()=>{
 for(const name of ['pointHasData','canEdit','corrections','createSession','calibrationWarnings','historyRows','syncCalibration'])assert.equal(typeof history[name],'function',name);
});

test('continuation permits only fields that were blank in the accepted point snapshot',()=>{
 const baseline={forms:{bm01:{A1:{p05:'12',p5:'',execution_date:'2026-09-27'}}}};
 assert.equal(history.pointHasData(baseline,'air','bm01','A1'),true);
 assert.equal(history.canEdit({mode:'continue',baseline,path:['forms','bm01','A1','p05']}),false);
 assert.equal(history.canEdit({mode:'continue',baseline,path:['forms','bm01','A1','p5']}),true);
 assert.equal(history.canEdit({mode:'change',baseline,path:['forms','bm01','A1','p05']}),true);
});

test('correction detection includes clearing readings and equipment metadata but ignores blank additions',()=>{
 const before={equipment:{bm01:{expiry:'2026-12-31',serial:''}},forms:{bm01:{A1:{p05:'12',p5:''}}}};
 const after={equipment:{bm01:{expiry:'',serial:'M-01'}},forms:{bm01:{A1:{p05:'13',p5:'1'}}}};
 assert.deepEqual(plain(history.corrections(before,after)),[
  {path:['equipment','bm01','expiry'],before:'2026-12-31',after:''},
  {path:['forms','bm01','A1','p05'],before:'12',after:'13'}
 ]);
});

test('pending correction reason fingerprint changes when a different stored value is edited',()=>{
 const before={forms:{bm01:{A1:{p05:'12',p5:'1',executed_by:'QA'}}}};
 const first={forms:{bm01:{A1:{p05:'13',p5:'1',executed_by:'QA'}}}};
 const second={forms:{bm01:{A1:{p05:'13',p5:'2',executed_by:'QA'}}}};
 assert.notEqual(history.correctionFingerprint(before,first),history.correctionFingerprint(before,second));
 assert.equal(history.correctionFingerprint(before,first),history.correctionFingerprint(before,structuredClone(first)));
});

test('accepted baseline changes only for the current generation, session and record response',()=>{
 const session=history.createSession();
 session.accept({forms:{}},{generation:4,session:'actor-a',record:'record-a'});
 assert.equal(session.acceptIfCurrent({forms:{bm01:{A1:{p05:'8'}}}},{generation:4,session:'actor-a',record:'record-a'},{generation:5,session:'actor-a',record:'record-a'}),false);
 assert.deepEqual(plain(session.baseline()),{forms:{}});
 assert.equal(session.acceptIfCurrent({forms:{bm01:{A1:{p05:'8'}}}},{generation:5,session:'actor-a',record:'record-a'},{generation:5,session:'actor-a',record:'record-a'}),true);
 assert.equal(session.baseline().forms.bm01.A1.p05,'8');
});

test('calibration warning compares due date with applicable point dates and never current day or run start',()=>{
 const config={_run:{started_on:'2030-01-01',calibration:{'air:bm01:expiry':{name:'Máy đếm',due_on:'2026-09-28'}},calibration_requirements:[{key:'air:bm01:expiry',system:'air',form:'bm01',label:'Hạn hiệu chuẩn',payload_path:['equipment','bm01','expiry']}]}};
 const data={forms:{bm01:{A1:{execution_date:'2026-09-27'},A2:{execution_date:'2026-09-29'}}}};
 assert.deepEqual(plain(history.calibrationWarnings(config,data,'air','bm01','A1')),[]);
 assert.deepEqual(plain(history.calibrationWarnings(config,data,'air','bm01','A2')),[{key:'air:bm01:expiry',name:'Máy đếm',due_on:'2026-09-28',measured_on:'2026-09-29'}]);
 assert.deepEqual(plain(history.calibrationWarnings(config,{forms:{bm01:{A3:{p05:'2'}}}},'air','bm01','A3')),[]);
});

test('open runs sync mapped calibration dates into the draft while closed runs remain untouched',()=>{
 const requirement={key:'air:bm01:expiry',payload_path:['equipment','bm01','expiry']};
 const data={equipment:{bm01:{expiry:'2026-09-26'}}};
 const open={_run:{status:'open',calibration:{'air:bm01:expiry':{due_on:'2026-12-30'}},calibration_requirements:[requirement]}};
 assert.deepEqual(plain(history.syncCalibration(data,open)),[{path:['equipment','bm01','expiry'],before:'2026-09-26',after:'2026-12-30'}]);
 assert.equal(data.equipment.bm01.expiry,'2026-12-30');
 const closedData={equipment:{bm01:{expiry:'2026-09-26'}}};
 assert.deepEqual(plain(history.syncCalibration(closedData,{_run:{...open._run,status:'closed'}})),[]);
 assert.equal(closedData.equipment.bm01.expiry,'2026-09-26');
});

test('history rows normalize legacy reason and preserve before/after as text values',()=>{
 const rows=history.historyRows([{version:3,created_at:'2026-09-29T02:03:04Z',actor_name:'QA <script>',reason:null,measurement_dates:['2026-09-27','2026-09-28'],changes:[{path:['forms','bm01','A1','p05'],before:'1',after:'2'}]}]);
 assert.deepEqual(plain(rows),[{version:3,saved_at:'2026-09-29T02:03:04Z',actor:'QA <script>',reason:'Không ghi nhận',measured_on:'2026-09-27, 2026-09-28',path:'forms.bm01.A1.p05',before:'1',after:'2'}]);
});

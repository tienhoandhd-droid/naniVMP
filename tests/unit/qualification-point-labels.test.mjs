import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const window={};
runInNewContext(readFileSync(new URL('../../public/tham-dinh-thuc-te/point-labels.js',import.meta.url),'utf8'),{window});
const {name,label}=window.CPC1PointLabels;
test('repairs lost room and bilingual boundaries without removing source words',()=>{
 assert.equal(name({name:' · Q2.R10Phòng pha MDISMS Room (MDI)'}),'Q2.R10 — Phòng pha MDI / SMS Room (MDI)');
 assert.equal(name({name:'Máy BFS ModelBFS Weiler Machine · Q2.R8Phòng chiết rótSVP Filling Room'}),'Máy BFS Model / BFS Weiler Machine · Q2.R8 — Phòng chiết rót / SVP Filling Room');
 assert.equal(name({name:' · Q2.R12\u00a0 Phòng cân Dispensary Room · '}),'Q2.R12 — Phòng cân / Dispensary Room');
 assert.equal(name({name:'Tank  2 (SMS Room) · Phòng pha'}),'Tank 2 (SMS Room) · Phòng pha');
});
test('keeps unknown names, codes and source wording; never guesses missing equipment',()=>{
 assert.equal(name({name:'iPhone McDonald TestRoom'}),'iPhone McDonald TestRoom');
 assert.equal(label({id:'Q2.R7-P2',name:'Điểm thứ hai'}),'Q2.R7-P2 — Điểm thứ hai');
 assert.equal(name({id:'Q2.R7-C1',name:'Q2.R7-C1'}),'Chưa có tên điểm trong cấu hình');
 assert.equal(label(null),'Biểu mẫu không có điểm lấy mẫu');
 assert.equal(name({name:'<script>alert(1)</script>'}),'<script>alert(1)</script>');
});

test('separates the remaining observed bilingual suffixes, including spaced paragraph joins',()=>{
 for(const [raw,expected] of [
  ['Phòng tạo nangCapsule Filling Room','Phòng tạo nang / Capsule Filling Room'],
  ['Phòng chiết rót (Lọ uống)Filling Room','Phòng chiết rót (Lọ uống) / Filling Room'],
  ['Rửa sấy dụng cụ Wash Room','Rửa sấy dụng cụ / Wash Room'],
  ['Sau tank chứa khí nitơ After nitrogen gas store tank','Sau tank chứa khí nitơ / After nitrogen gas store tank'],
  ['Phòng đóng dịch BOV Filling Room (BOV)','Phòng đóng dịch BOV / Filling Room (BOV)'],
  ['Máy chiết rótSVP Filling Machine','Máy chiết rót / SVP Filling Machine'],
  ['SVP Filling Machine','SVP Filling Machine'],
  ['Tank 1 phòng pha chếTank 1(SMS Room)','Tank 1 phòng pha chế / Tank 1 (SMS Room)'],
  ['Tank pha 700L 700L mixing Tank','Tank pha 700L / 700L mixing Tank']
 ])assert.equal(name({name:raw}),expected);
});

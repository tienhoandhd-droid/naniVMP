import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { EXPORT_PALETTE,SCREEN_PALETTE } from '../../src/lib/reportCharts.ts';
const css=readFileSync(new URL('../../src/styles/chart-palette.css',import.meta.url),'utf8');
test('export charts preserve screen chart semantics with standalone printable colors',()=>{
  for(const [key,token] of Object.entries({mint:'complete',sky:'validation',lav:'protocol',pink:'report',rasp:'overdue',marigold:'missing'})) {
    for (const [suffix,end] of [['',''],['Text','-text'],['Soft','-soft']]) {
      const color=css.match(new RegExp(`--chart-${token}${end}:\\s*(#[a-f0-9]+)`))[1];
      assert.equal(EXPORT_PALETTE[key+suffix].toLowerCase(),color);
      assert.match(SCREEN_PALETTE[key+suffix],new RegExp(`--chart-${token}${end}\\)`));
    }
  }
});

// 21/10: bản xuất PDF phải cùng màu với màn hình sáng. Đọc khối màn hình,
// giải var(--lp-*) theo lotus-tokens.css, rồi so với khối :root (bản xuất).
test('bảng màu bản xuất khớp bảng màu màn hình sáng sau khi giải token',()=>{
  const tokens=readFileSync(new URL('../../src/styles/lotus-tokens.css',import.meta.url),'utf8').split('[data-theme="dark"]')[0];
  const lp=Object.fromEntries([...tokens.matchAll(/(--lp-[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)].map(m=>[m[1],m[2].toLowerCase()]));
  const block=(sel)=>css.split(sel)[1].split('}')[0];
  const goc=block(':root {'), manHinh=block(':root[data-visual="lotus-pearl"] {');
  const doc=(text,name)=>{const v=text.match(new RegExp(`${name}:\\s*([^;]+);`));return v&&v[1].trim();};
  for(const token of ['complete','validation','protocol','report','overdue','missing','pending'])
    for(const end of ['','-text','-soft']){
      const name=`--chart-${token}${end}`;
      let v=doc(manHinh,name); const ref=v&&v.match(/^var\((--lp-[a-z0-9-]+)\)$/); if(ref) v=lp[ref[1]];
      assert.equal(doc(goc,name).toLowerCase(),String(v).toLowerCase(),name);
    }
});

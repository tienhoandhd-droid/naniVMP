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

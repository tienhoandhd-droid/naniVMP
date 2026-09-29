import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../../public/tham-dinh-thuc-te/'+name,import.meta.url),'utf8');
for(const name of ['steam.html','gas.html'])test(`${name}: consistent accessible workspace with secondary file actions`,()=>{
 const html=read(name);
 assert.match(html,/<details[^>]*class="workspace-navigation"/);
 assert.match(html,/<details[^>]*class="file-actions"/);
 assert.match(html,/workspace\.js/);
 for(const id of ['entry-form','form-body','evaluate','record-save','print','draft-open','draft-download','record-load','draft-file'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,id);
 assert.doesNotMatch(html,/role="listbox"/);
 assert.doesNotMatch(html,/href="\.\/(?:gas|styles|theme|responsive|dialog)\.css"/);
 assert.doesNotMatch(html,/>\s*Thư viện\s*</);
 assert.doesNotMatch(html,/href="\.\/index\.html"/);
});
test('shared theme preserves privacy gate and reduced motion',()=>{
 const css=read('vmp-theme.css');
 assert.match(css,/--background:\s*var\(--lp-bg-canvas\)/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(css,/body\[data-qualification-gate="pending"\] > \*/);
});
test('retired library entry redirects to the run workspace with an accessible fallback',()=>{
 const html=read('index.html'),script=read('home.js'),runs=read('runs.html');
 assert.match(html,/href="\.\/runs\.html"/);
 assert.doesNotMatch(html,/Thư viện|form-results/);
 assert.match(script,/new URL\('\.\/runs\.html'/);
 assert.doesNotMatch(runs,/>\s*Thư viện\s*<|href="\.\/index\.html"/);
});

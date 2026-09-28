import test from 'node:test';
import assert from 'node:assert/strict';
import { qualificationTarget, qualificationHref } from '../../src/features/qualification/shellRoute.ts';
const base='https://example.test/vmp/';
test('qualification targets stay within the shared deployment and accept known entry context',()=>{
 for(const path of ['index.html','steam.html','gas.html?system=air','gas.html?system=nitrogen','runs.html','steam.html?view=records','gas.html?system=air&view=records']) {
  assert.equal(qualificationTarget(path,base),path);
  assert.equal(new URL(qualificationHref(path,base)).pathname,'/vmp/');
 }
 assert.equal(qualificationTarget(base+'tham-dinh-thuc-te/steam.html?form=BM03',base),'steam.html?form=BM03');
 assert.equal(qualificationTarget('./',base),'index.html');
});
test('reject external, traversal, unknown files, duplicate or unsupported parameters',()=>{
 for(const path of ['https://evil.test/steam.html','//evil.test/steam.html','../index.html','%2e%2e/index.html','cloud.js','steam.html?redirect=evil','gas.html?system=steam','gas.html?system=air&system=nitrogen','steam.html?run=bad','index.html?view=records','gas.html?view=edit','javascript:alert(1)']) assert.equal(qualificationTarget(path,base),null,path);
});

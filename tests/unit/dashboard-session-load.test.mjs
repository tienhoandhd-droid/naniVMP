import test from 'node:test';
import assert from 'node:assert/strict';
import {DashboardSessionLoad} from '../../src/lib/dashboardSessionLoad.ts';
const session=(actor='a',token='token-a')=>({user:{id:actor},access_token:token});
test('first confirmed session loads once despite peer confirmations',()=>{
 const gate=new DashboardSessionLoad();
 assert.equal(gate.accept(session()),'initial');
 assert.equal(gate.accept(session()),'duplicate');
 assert.equal(gate.accept(session()),'duplicate');
});
test('new token and new actor each require immediate invalidation and reload',()=>{
 const gate=new DashboardSessionLoad();gate.accept(session());
 assert.equal(gate.accept(session('a','token-b')),'changed');
 assert.equal(gate.accept(session('b','token-c')),'changed');
 assert.equal(gate.accept(session('b','token-c')),'duplicate');
});
test('signout forgets the last session and invalidates pending initial reads',()=>{
 const gate=new DashboardSessionLoad();const generation=gate.generation;
 gate.authEvent();gate.accept(session());gate.authEvent();gate.clear();
 assert.notEqual(gate.generation,generation);
 assert.equal(gate.accept(session()),'initial');
});

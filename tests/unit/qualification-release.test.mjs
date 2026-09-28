import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptKnownFailure, approvedFingerprint} from '../../scripts/check-long-mon-release.mjs';
const evidence={status:1,signal:null,output:"node:internal/modules/run_main:107\n    triggerUncaughtException(\n    ^\n\nAssertionError [ERR_ASSERTION]: the pond has distinct travel directions\n    at file:///checkout/tests/e2e/long-mon-living-swim.mjs:48:10 {\n  generatedMessage: false,\n  code: 'ERR_ASSERTION',\n  actual: false,\n  expected: true,\n  operator: '==',\n  diff: 'simple'\n}\n\nNode.js v24.21.0\n",fingerprint:approvedFingerprint,clean:true,now:Date.parse('2026-09-28T12:00:00Z')};
test('only the recorded Long Môn failure on the approved release is accepted',()=>{
 assert.equal(acceptKnownFailure(evidence),true);
 for(const change of [{status:0},{status:2},{signal:'SIGTERM'},{output:'another error'},{output:evidence.output+'\nTypeError: another failure'},{output:evidence.output.replace(':48:',':47:')},{fingerprint:'changed application'},{clean:false},{now:Date.parse('2026-09-29T00:00:00Z')},{now:NaN}]){
  assert.equal(acceptKnownFailure({...evidence,...change}),false,JSON.stringify(change));
 }
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runDataQualityChecks} from '../../src/utils/helpers.ts';
const activity={id:'fixture',code:'FIXTURE',owner:'QA',vtype:'IQ',st:'todo'};
test('omitted QA email is unavailable data, not a confirmed missing email',()=>{
  assert.equal(runDataQualityChecks([{...activity,_raw:{}}]).filter(x=>x.type==='owner_no_email').length,0);
});
test('explicitly blank QA email retains the existing warning',()=>{
  for(const value of [null,'']) assert.equal(runDataQualityChecks([{...activity,_raw:{email_qa:value}}]).filter(x=>x.type==='owner_no_email').length,1);
});

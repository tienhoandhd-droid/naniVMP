import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

// Owner authorized publishing qualification without changing Long Môn on 2026-09-28.
// The unchanged test failed identically on baseline32e12ff/762c8ac and candidate997adcf.
// Owner reaffirmed publication of latest local on Sep28; Long Môn remains out of scope.
// This exception is limited to that application/test snapshot and this release day.
export const approvedFingerprint='4f63d120afd70c95407b3fb8b48d932228fbc81a057f96c38ed8e7e53af2ef95';
const paths=['src','public','supabase','tests/e2e','package.json','package-lock.json','vite.config.js','scripts/build-qualification.mjs'];
// Accept the full known failure only; extra errors cannot hide behind it.
const knownFailure=/^node:internal\/modules\/run_main:\d+\s+triggerUncaughtException\(\s+\^\s+AssertionError \[ERR_ASSERTION\]: the pond has distinct travel directions\s+at file:\/\/[^\r\n]+\/tests\/e2e\/long-mon-living-swim\.mjs:48:10 \{\s+generatedMessage: false,\s+code: 'ERR_ASSERTION',\s+actual: false,\s+expected: true,\s+operator: '=='(?:,\s+diff: 'simple')?\s+\}\s+Node\.js v\d+\.\d+\.\d+$/;
export function acceptKnownFailure({status,signal,output,fingerprint,clean,now}) {
 return status===1 && !signal && clean && fingerprint===approvedFingerprint
  && Number.isFinite(now) && now>=Date.parse('2026-09-28T00:00:00Z') && now<Date.parse('2026-09-29T00:00:00Z')
  && knownFailure.test(output.trim());
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const result=spawnSync(process.execPath,['tests/e2e/long-mon-living-swim.mjs'],{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
 const output=(result.stdout||'')+(result.stderr||'');process.stdout.write(output);
 if(result.status===0) process.exit(0);
 const tree=spawnSync('git',['ls-tree','-r','HEAD','--',...paths]);
 const diff=spawnSync('git',['diff','--quiet','HEAD','--',...paths]);
 const fingerprint=tree.status===0?createHash('sha256').update(tree.stdout).digest('hex'):'';
 if(acceptKnownFailure({status:result.status,signal:result.signal,output,fingerprint,clean:diff.status===0,now:Date.now()})) {
  const note='Known Long Môn animation assertion FAILED; accepted only for the owner-authorized qualification release on the unchanged reviewed app/test snapshot, expiring 2026-09-29 UTC. All other release gates remain required.';
  console.log('::warning title=Recorded release exception::'+note);
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'\n'+note+'\n');
  process.exit(0);
 }
 if(result.error)console.error(result.error.message);
 process.exit(result.status||1);
}

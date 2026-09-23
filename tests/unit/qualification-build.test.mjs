import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildQualification } from '../../scripts/build-qualification.mjs';
test('qualification build uses the VMP public project and rejects administrative credentials',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vmp-qualification-'));
 try {
  await mkdir(join(root,'src/features/qualification'),{recursive:true});
  await writeFile(join(root,'src/features/qualification/bootstrap.js'),'window.fixture=true;');
  const env={VITE_SUPABASE_URL:'https://vmp-test.supabase.co',VITE_SUPABASE_ANON:'sb_publishable_fixture'};
  await buildQualification(root,env);
  const config=await readFile(join(root,'public/tham-dinh-thuc-te/runtime-config.js'),'utf8');
  assert.match(config,/https:\/\/vmp-test.supabase.co/);assert.match(config,/sb_publishable_fixture/);
  await assert.rejects(buildQualification(root,{...env,VITE_SUPABASE_ANON:'sb_secret_FORBIDDEN'}),/publishable/);
  const service='eyJ.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.fake';
  await assert.rejects(buildQualification(root,{...env,VITE_SUPABASE_ANON:service}),/anon/);
 } finally {await rm(root,{recursive:true,force:true});}
});

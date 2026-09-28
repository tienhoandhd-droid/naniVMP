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
  await mkdir(join(root,'src/styles'),{recursive:true});
  const tokens=':root[data-visual="lotus-pearl"]{--lp-brand:#6B3B55}';
  await writeFile(join(root,'src/styles/lotus-tokens.css'),tokens);
  const env={VITE_SUPABASE_URL:'https://vmp-test.supabase.co',VITE_SUPABASE_ANON:'sb_publishable_fixture'};
  await buildQualification(root,env);
  assert.equal(await readFile(join(root,'public/tham-dinh-thuc-te/vmp-tokens.css'),'utf8'),tokens);
  const config=await readFile(join(root,'public/tham-dinh-thuc-te/runtime-config.js'),'utf8');
  assert.match(config,/https:\/\/vmp-test.supabase.co/);assert.match(config,/sb_publishable_fixture/);
  await assert.rejects(buildQualification(root,{...env,VITE_SUPABASE_ANON:'sb_secret_FORBIDDEN'}),/publishable/);
  const service='eyJ.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.fake';
  await assert.rejects(buildQualification(root,{...env,VITE_SUPABASE_ANON:service}),/anon/);
 } finally {await rm(root,{recursive:true,force:true});}
});
test('Vite middleware tests need no live configuration; CI production builds still require it',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vmp-qualification-ci-'));
 const previous=process.env.CI;process.env.CI='true';
 try {
  const {default:config}=await import('../../vite.config.js');
  const plugin=config.plugins.find(p=>p.name==='qualification-browser-assets');
  await plugin.configResolved({root,mode:'test',command:'serve',server:{middlewareMode:true}});
  await assert.rejects(readFile(join(root,'public/tham-dinh-thuc-te/runtime-config.js')),/ENOENT/);
  await assert.rejects(buildQualification(root,{CI:'true'}),/configuration required/);
 } finally {if(previous===undefined)delete process.env.CI;else process.env.CI=previous;await rm(root,{recursive:true,force:true});}
});

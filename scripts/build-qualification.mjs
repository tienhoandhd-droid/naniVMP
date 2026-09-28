import { build } from 'esbuild';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Browser configuration only. The module always uses the SAME project as VMP.
export async function buildQualification(root, env) {
  const url = env.VITE_SUPABASE_URL || '';
  const publishableKey = env.VITE_SUPABASE_ANON || '';
  if (env.CI && (!url || !publishableKey)) throw new Error('VMP Supabase browser configuration required');
  if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) throw new Error('Invalid Supabase URL');
  if (publishableKey.startsWith('eyJ')) {
    const claims = JSON.parse(Buffer.from(publishableKey.split('.')[1], 'base64url').toString());
    if (claims.role !== 'anon') throw new Error('Only an anon/public key may be bundled');
  } else if (publishableKey && !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey) && publishableKey !== 'gialap-anon-key') {
    throw new Error('Only a publishable key may be bundled');
  }
  const out = resolve(root, 'public/tham-dinh-thuc-te');
  await mkdir(out, {recursive:true});
  // One design source shared with VMP; do not maintain a second colour palette.
  await copyFile(resolve(root,'src/styles/lotus-tokens.css'),resolve(out,'vmp-tokens.css'));
  await writeFile(resolve(out, 'runtime-config.js'), `window.CPC1_SETTINGS=${JSON.stringify({url,publishableKey})};\n`);
  await build({entryPoints:[resolve(root,'src/features/qualification/bootstrap.js')],bundle:true,minify:true,format:'iife',target:['es2022'],outfile:resolve(out,'cloud.js'),legalComments:'eof'});
}

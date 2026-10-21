import { build } from 'esbuild';
import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
  // vmp-tokens.css @import "./chart-palette.css": chép kèm để trang thẩm định không bị 404.
  await copyFile(resolve(root,'src/styles/chart-palette.css'),resolve(out,'chart-palette.css'));
  await writeFile(resolve(out, 'runtime-config.js'), `window.CPC1_SETTINGS=${JSON.stringify({url,publishableKey})};\n`);
  // Gói in PDF build riêng (pdf-lib + fontkit ~1,3 MB): cloud.js chỉ tải nó khi
  // người dùng bấm in. Băm nội dung gói rồi nhúng vào cloud.js làm ?v= để trình
  // duyệt không dùng bản cũ trong cache sau mỗi lần deploy.
  const pdfEntry = resolve(root, 'src/features/qualification/pdf-entry.js');
  let pdfVersion = 'none';
  if (existsSync(pdfEntry)) {
    await build({entryPoints:[pdfEntry],bundle:true,minify:true,format:'iife',target:['es2022'],outfile:resolve(out,'cloud-pdf.js'),legalComments:'eof'});
    pdfVersion = createHash('sha256').update(await readFile(resolve(out,'cloud-pdf.js'))).digest('hex').slice(0, 12);
  }
  await build({entryPoints:[resolve(root,'src/features/qualification/bootstrap.js')],bundle:true,minify:true,format:'iife',target:['es2022'],outfile:resolve(out,'cloud.js'),legalComments:'eof',define:{__CPC1_PDF_VERSION__:JSON.stringify(pdfVersion)}});
}

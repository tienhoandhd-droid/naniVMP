#!/usr/bin/env node
// Vá @react-grab/cli 0.2.0 trên Windows.
//
// Vấn đề: `react-grab watch` đọc clipboard bằng cách spawn pwsh chạy
// read-clipboard.ps1 ở mỗi vòng poll. Các lời gọi spawnSync đó thiếu
// `windowsHide: true`, nên Windows cấp cho mỗi tiến trình một conhost.exe —
// cửa sổ console đen nháy lên rồi tắt, lặp lại vài giây một lần.
//
// Bản thân package đã dùng windowsHide: true ở chỗ spawn khác, đây là chỗ sót.
// Không có bản vá thượng nguồn (0.2.0 là bản mới nhất tính đến 2026-08-30).
//
// Script idempotent: chạy bao nhiêu lần cũng ra cùng kết quả. Chạy lại sau mỗi
// `npm install` (đã gắn vào postinstall).

import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(
  import.meta.dirname,
  '..',
  'node_modules/@react-grab/cli/dist',
);

// [mô tả, chuỗi cần tìm, chuỗi thay thế]
const RULES = [
  [
    'spawnSync đọc clipboard (runText/runBuffer/runJson + lần khởi động)',
    /(?<!windowsHide: true,\n\t\t)maxBuffer: MAX_CLIPBOARD_BYTES/g,
    'windowsHide: true,\n\t\tmaxBuffer: MAX_CLIPBOARD_BYTES',
  ],
  [
    'hasCommand dò pwsh/powershell bằng `where`',
    /\[name\], \{ stdio: "ignore" \}\)\.status === 0/g,
    '[name], { stdio: "ignore", windowsHide: true }).status === 0',
  ],
];

let changedAny = false;

for (const file of ['cli.js', 'cli.cjs']) {
  const target = path.join(DIST, file);
  if (!fs.existsSync(target)) {
    console.log(`  bỏ qua ${file} (không có — package chưa cài?)`);
    continue;
  }

  const before = fs.readFileSync(target, 'utf8');
  let after = before;
  for (const [, find, replace] of RULES) after = after.replace(find, replace);

  if (after === before) {
    console.log(`  ${file}: đã vá từ trước, không đổi`);
    continue;
  }

  const backup = `${target}.orig`;
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, before);
  fs.writeFileSync(target, after);
  changedAny = true;

  const n = (after.match(/windowsHide: true/g) ?? []).length;
  console.log(`  ${file}: đã vá (${n} chỗ có windowsHide, sao lưu ${file}.orig)`);
}

console.log(
  changedAny
    ? 'Xong: react-grab watch sẽ không còn làm nháy cửa sổ console.'
    : 'Xong: không có gì phải sửa.',
);

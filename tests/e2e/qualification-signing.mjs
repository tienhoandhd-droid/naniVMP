// Kiểm tra – duyệt – ký điện tử – khoá (gói 3, 16/10) — headless, mọi request phục vụ tại chỗ.
// Trang thử tối giản gồm khung nhập + run-entry.js + ky-duyet.js; luật ký thật nằm ở máy chủ
// (đã thử 16 tình huống trên PostgreSQL), ở đây kiểm giao diện: hiện đúng nút, hộp ký,
// bắt mã deviation/lý do/mật khẩu, khoá ô nhập khi đã duyệt, không giữ mật khẩu.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const root = new URL('../..', import.meta.url).pathname;
const R = '00000000-0000-4000-8000-0000000000aa';
const trang = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Thử ký</title>
<link rel="stylesheet" href="./vmp-tokens.css"><link rel="stylesheet" href="./vmp-theme.css"><link rel="stylesheet" href="./ky-duyet.css"></head>
<body><main><form id="entry-form"><div id="form-body"><label>Giá trị<input id="o-nhap" value="0,95"></label></div>
<button id="evaluate" type="button">Tính</button><button id="record-save" type="button">Lưu</button></form></main>
<script src="./cloud.js"></script><script src="./ky-duyet.js"></script><script src="./run-entry.js"></script>
<script>window.CPC1RunEntry.show({system:'steam',_run:{id:'run-1',status:'open',items:[{system:'steam',record_id:'${R}'}]}},{system:'steam',recordId:'${R}',version:3});</script></body></html>`;
// Máy chủ giả: kịch bản quyết định người xem được ký gì; signRecord ghi lại tham số.
const fixture = `
const kichBan=sessionStorage.getItem('kich-ban');
window.__ky=[];window.addEventListener('cpc1:input-issues',e=>{window.__oSai=e.detail;});
let st={ok:true,version:3,ket_qua:'fail',bat_buoc_deviation:true,trang_thai:'chua_ky',rows:[],
 co_the:{kiem_tra:kichBan==='qa'||kichBan==='o-sai',duyet:kichBan==='admin-duyet',mo_lai:kichBan==='admin-mo'}};
if(kichBan==='admin-duyet'||kichBan==='admin-mo')st.rows.push({version:3,y_nghia:'kiem_tra',ho_ten:'QA Hai',vai:'qa_staff',ly_do:null,ma_deviation:'DV-2026-014',luc:'2026-10-16T02:30:00Z'});
if(kichBan==='admin-duyet')st.trang_thai='da_kiem_tra';
if(kichBan==='o-sai')st.o_sai=[{path:['bm01','P1','0','vg'],field:'vg',value:'4.000',rule:'thousand_ambiguous',reason:'Số dễ nhầm hàng nghìn — gõ 4000 hoặc 4,0'}];
if(kichBan==='admin-mo'){st.trang_thai='da_duyet';st.rows.push({version:3,y_nghia:'duyet',ho_ten:'Admin Ba',vai:'admin',ly_do:null,ma_deviation:null,luc:'2026-10-16T03:00:00Z'});}
window.CPC1Backend={canSaveActive:()=>true,canEvaluateActive:()=>true,listRuns:async()=>[],
 recordSignatures:async id=>{if(kichBan==='loi')throw new Error('mất mạng');return structuredClone(st);},
 signRecord:async args=>{window.__ky.push(args);if(args.password!=='dung')throw new Error('Mật khẩu không đúng.');
  if(kichBan==='o-sai')throw Object.assign(new Error('Hồ sơ còn ô nhập sai.'),{code:'INVALID_DATA',issues:structuredClone(st.o_sai)});
  if(args.meaning==='kiem_tra'){st.trang_thai='da_kiem_tra';st.co_the.kiem_tra=false;st.rows.push({version:3,y_nghia:'kiem_tra',ho_ten:'QA Hai',vai:'qa_staff',ly_do:null,ma_deviation:args.deviation,luc:'2026-10-16T04:00:00Z'});}
  if(args.meaning==='duyet'){st.trang_thai='da_duyet';st.co_the.duyet=false;st.rows.push({version:3,y_nghia:'duyet',ho_ten:'Admin Ba',vai:'admin',ly_do:null,ma_deviation:null,luc:'2026-10-16T04:30:00Z'});}
  if(args.meaning==='mo_lai'){st.trang_thai='chua_ky';st.co_the.mo_lai=false;st.rows.push({version:3,y_nghia:'mo_lai',ho_ten:'Admin Ba',vai:'admin',ly_do:args.reason,ma_deviation:null,luc:'2026-10-16T05:00:00Z'});}
  return {ok:true,trang_thai:st.trang_thai};}};`;

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || chromium.executablePath() });
const context = await browser.newContext({ locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' });
const errors = [];
async function mo(kichBan) {
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://qualification.test') return route.abort();
    if (url.pathname.endsWith('/thu-ky.html')) return route.fulfill({ contentType: 'text/html', body: trang });
    if (url.pathname.endsWith('/cloud.js')) return route.fulfill({ contentType: 'text/javascript', body: fixture });
    try {
      const file = root + '/public' + url.pathname, ext = file.split('.').at(-1);
      return route.fulfill({ body: await readFile(file), contentType: ({ js: 'text/javascript', css: 'text/css' })[ext] || 'application/octet-stream' });
    } catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await page.addInitScript(k => sessionStorage.setItem('kich-ban', k), kichBan);
  await page.goto('http://qualification.test/tham-dinh-thuc-te/thu-ky.html');
  return page;
}
const nut = page => page.locator('#ky-duyet-nut button').allTextContents();

// QA phụ trách: ký kiểm tra; kết quả không đạt bắt mã deviation; sai mật khẩu báo lỗi và xoá ô mật khẩu.
const qa = await mo('qa');
await qa.locator('#ky-duyet-trang-thai').getByText('Chưa kiểm tra · phiên bản v3').waitFor();
assert.deepEqual(await nut(qa), ['Ký kiểm tra']);
await qa.click('#ky-duyet-nut button');
assert.equal(await qa.locator('#ky-hop-title').textContent(), 'Ký kiểm tra · phiên bản v3');
assert.equal(await qa.locator('.ky-y-nghia').textContent(), 'Tôi đã kiểm tra số liệu và kết quả của phiên bản này.');
assert.equal(await qa.evaluate(() => document.activeElement.id), 'ky-deviation', 'con trỏ vào ô deviation trước');
await qa.fill('#ky-mat-khau', 'dung');
await qa.click('#ky-duyet-hop button[type=submit]');
assert.equal(await qa.locator('#ky-loi').textContent(), 'Ghi mã deviation.');
await qa.fill('#ky-deviation', 'DV-2026-014');
await qa.fill('#ky-mat-khau', 'sai');
await qa.click('#ky-duyet-hop button[type=submit]');
await qa.locator('#ky-loi').getByText('Mật khẩu không đúng.').waitFor();
assert.equal(await qa.inputValue('#ky-mat-khau'), '', 'không giữ mật khẩu sau lần ký');
await qa.fill('#ky-mat-khau', 'dung');
await qa.click('#ky-duyet-hop button[type=submit]');
await qa.locator('#ky-duyet-trang-thai').getByText('Đã kiểm tra · chờ duyệt · phiên bản v3').waitFor();
await qa.locator('#ky-duyet-hop').waitFor({ state: 'detached' }); // sự kiện close của dialog chạy ở tác vụ kế tiếp
assert.deepEqual(await qa.evaluate(() => window.__ky.at(-1)), { recordId: R, version: 3, meaning: 'kiem_tra', password: 'dung', reason: null, deviation: 'DV-2026-014' });
assert.deepEqual(await qa.locator('#ky-duyet-lich-su li').allTextContents(), ['Kiểm tra · QA Hai · 16/10/2026 11:00 · v3 · Deviation DV-2026-014']);
assert.deepEqual(await nut(qa), []);
assert.equal(await qa.locator('#record-save').isDisabled(), false, 'chưa duyệt thì chưa khoá');

// Admin: ký duyệt → hồ sơ khoá (ô nhập chỉ đọc, nút Lưu/Tính tắt).
const ad = await mo('admin-duyet');
await ad.locator('#ky-duyet-nut button').getByText('Ký duyệt').click();
assert.equal(await ad.locator('.ky-y-nghia').textContent(), 'Tôi phê duyệt phiên bản này. Sau khi duyệt, hồ sơ được khoá.');
assert.equal(await ad.locator('#ky-deviation').count(), 0, 'chỉ hỏi deviation ở bước kiểm tra');
await ad.fill('#ky-mat-khau', 'dung');
await ad.click('#ky-duyet-hop button[type=submit]');
await ad.locator('#ky-duyet-trang-thai').getByText('Đã duyệt · hồ sơ khoá · phiên bản v3').waitFor();
await ad.waitForFunction(() => document.getElementById('record-save').disabled);
assert.equal(await ad.locator('#evaluate').isDisabled(), true);
assert.equal(await ad.locator('#o-nhap').evaluate(n => n.readOnly), true);

// Admin mở lại: bắt lý do; Huỷ không gửi gì.
const am = await mo('admin-mo');
await am.locator('#ky-duyet-trang-thai').getByText('Đã duyệt · hồ sơ khoá · phiên bản v3').waitFor();
await am.waitForFunction(() => document.getElementById('record-save').disabled);
await am.locator('#ky-duyet-nut button').getByText('Mở lại hồ sơ').click();
await am.locator('#ky-duyet-hop button', { hasText: 'Huỷ' }).click();
await am.locator('#ky-duyet-hop').waitFor({ state: 'detached' });
assert.deepEqual(await am.evaluate(() => window.__ky), []);
await am.locator('#ky-duyet-nut button').getByText('Mở lại hồ sơ').click();
await am.fill('#ky-mat-khau', 'dung');
await am.click('#ky-duyet-hop button[type=submit]');
assert.equal(await am.locator('#ky-loi').textContent(), 'Ghi lý do mở lại.');
await am.fill('#ky-ly-do', 'Phát hiện nhập sai đơn vị');
await am.fill('#ky-mat-khau', 'dung');
await am.click('#ky-duyet-hop button[type=submit]');
await am.locator('#ky-duyet-trang-thai').getByText('Chưa kiểm tra · phiên bản v3').waitFor();
assert.match((await am.locator('#ky-duyet-lich-su li').allTextContents()).at(-1), /^Mở lại · Admin Ba · .* · Lý do: Phát hiện nhập sai đơn vị$/);
assert.equal(await am.locator('#record-save').isDisabled(), false, 'mở lại thì hết khoá');

// Hồ sơ còn ô nhập sai (máy chủ trả issues / o_sai): báo số ô và chuyển danh sách cho trang nhập đánh dấu từng ô.
const os = await mo('o-sai');
await os.locator('#ky-duyet-trang-thai').getByText(/Còn 1 ô nhập sai/).waitFor();
await os.click('#ky-duyet-nut button');
await os.fill('#ky-deviation', 'DV-1');await os.fill('#ky-mat-khau', 'dung');
await os.click('#ky-duyet-hop button[type=submit]');
await os.locator('#ky-loi').getByText(/Hồ sơ còn ô nhập sai\. Còn 1 ô nhập sai/).waitFor();
assert.deepEqual(await os.evaluate(() => window.__oSai.map(x => x.path)), [['bm01', 'P1', '0', 'vg']]);

// Lỗi tải: báo rõ, không hiện nút ký.
const loi = await mo('loi');
await loi.locator('#ky-duyet-trang-thai').getByText('Không tải được trạng thái ký: mất mạng').waitFor();
assert.deepEqual(await nut(loi), []);

assert.deepEqual(errors, []);
await browser.close();
console.log('PASS signing: QA review with deviation + wrong password, admin approve locks entry, reopen requires reason, cancel sends nothing, load error');

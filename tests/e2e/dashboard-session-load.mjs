// Same-session peer confirmations must not reload the dashboard. Mock-only.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
import {CHROME} from './chrome-path.mjs';
import {caiGiaLap,nhetPhien} from './gia-lap-supabase.mjs';
const origin=process.env.VMP_E2E_URL||'http://127.0.0.1:4173/';
const env=readFileSync(new URL('../../.env.local',import.meta.url),'utf8');
const supabaseUrl=env.match(/^VITE_SUPABASE_URL=(.+)$/m)[1].trim();
const key=`sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
try {
 const page=await browser.newPage();let dashboards=0,contexts=0;
 await caiGiaLap(page,{supabaseUrl,mangNghiemNgat:true,previewOrigin:origin,doTre:{rpc_get_vmp_dashboard:400,rpc_get_vmp_dashboard_v2:400}});
 await nhetPhien(page,{supabaseUrl});
 page.on('request',r=>{if(r.method()!=='POST')return;if(/\/rpc_get_vmp_dashboard(?:_v2)?$/.test(r.url()))dashboards++;if(r.url().endsWith('/cpc1_context'))contexts++;});
 const broadcast=async(change)=>page.evaluate(({key,change})=>{
  const session=JSON.parse(localStorage.getItem(key));
  if(change){session.access_token+='-new';if(change==='actor')session.user.id='99999999-9999-4999-8999-999999999999';localStorage.setItem(key,JSON.stringify(session));}
  const channel=new BroadcastChannel(key);channel.postMessage({event:'SIGNED_IN',session});channel.close();
 },{key,change});
 // Confirm the same session while the initial dashboard is still in flight.
 const firstDashboard=page.waitForRequest(r=>r.method()==='POST'&&/\/rpc_get_vmp_dashboard(?:_v2)?$/.test(r.url()));
 await page.goto(origin+'#v=reports',{waitUntil:'domcontentloaded'});
 await firstDashboard;
 await broadcast(false);await page.waitForNetworkIdle({idleTime:500});
 await page.waitForFunction(()=>document.body.textContent.includes('1. Tổng quan năm'));
 const initial=dashboards;assert.equal(initial,1,'startup peer confirmation shares the initial load');
 const initialContexts=contexts;
 await broadcast(false);await broadcast(false);await broadcast(false);
 await page.waitForNetworkIdle({idleTime:500});
 assert.ok(contexts>initialContexts,'peer auth events reached mounted subscribers');
 assert.equal(dashboards,initial,'same session must not reload the full dashboard');
 await broadcast(true);await page.waitForNetworkIdle({idleTime:500});
 assert.ok(dashboards>initial,'new credentials must revalidate protected data');
 const beforeActor=dashboards;
 await broadcast('actor');await page.waitForNetworkIdle({idleTime:500});
 assert.ok(dashboards>beforeActor,'different actor must read fresh protected data');
 await page.evaluate(key=>{localStorage.removeItem(key);const c=new BroadcastChannel(key);c.postMessage({event:'SIGNED_OUT',session:null});c.close();},key);
 await page.waitForFunction(()=>document.body.textContent.includes('Đăng nhập VMP Monitor'));
 assert.equal(await page.$('.vmp-sidebar'),null,'sign-out removes the protected shell');
 const beforeReturn=dashboards;
 // nhetPhien restores fixture credentials on reload, creating a fresh session load gate.
 await page.reload({waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.body.textContent.includes('1. Tổng quan năm'));
 assert.ok(dashboards>beforeReturn,'returning after sign-out loads again');
 console.log('PASS dashboard startup/peer deduplication, changed token/actor and sign-out/reentry');
}finally{await browser.close();}

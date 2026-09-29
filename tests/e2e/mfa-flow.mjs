import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { CHROME } from "./chrome-path.mjs";
import { dungKhoDuLieu, NGUOI_DUNG, traLoi } from "./gia-lap-supabase.mjs";

const APP = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const SB = readFileSync(new URL("../../.env.local", import.meta.url), "utf8").match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
assert.ok(SB);
const LIVE = { id: "factor-a", factor_type: "totp", status: "verified", friendly_name: "Máy kiểm thử" };
const QR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='white'/%3E%3C/svg%3E";
const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
const token = (uid, aal) => `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: uid, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now()/1000)+28800, aal, amr: aal === "aal2" ? [{method:"password"},{method:"totp"}] : [{method:"password"}] })}.${encode("fixture-signature")}`;
const session = (user, aal, factors) => ({ access_token:token(user.id,aal), token_type:"bearer", expires_in:28800, expires_at:Math.floor(Date.now()/1000)+28800, refresh_token:`refresh-${user.id}`, user:{...user,factors:factors.map(f=>({...f}))} });
const headers = { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Methods":"GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD", "Access-Control-Allow-Headers":"authorization,apikey,content-type,content-profile,accept,accept-profile,prefer,range,x-client-info,x-supabase-api-version", "Access-Control-Expose-Headers":"content-range,content-profile" };

async function setup(browser, { factors=[], aal="aal1", userDelay=0, deleteFailure=false, expired=false }={}) {
  const page=await browser.newPage(), store=dungKhoDuLieu("day"), requests=[];
  const state={ factors:factors.map(f=>({...f})), aal, user:NGUOI_DUNG, verified:0, enrolled:[], deleted:[], passwordSignins:0, passwordUpdates:0, updateBearer:"" };
  let current=session(state.user,aal,state.factors);
  if(expired){current.expires_at=Math.floor(Date.now()/1000)-60;const parts=current.access_token.split(".");const claims=JSON.parse(Buffer.from(parts[1],"base64url").toString());claims.exp=current.expires_at;parts[1]=encode(claims);current.access_token=parts.join(".");}
  await page.setRequestInterception(true);
  page.on("request", async req => { try {
    const u=new URL(req.url());
    if(u.origin!==new URL(SB).origin){ if(["data:","blob:"].includes(u.protocol)||u.origin===new URL(APP).origin) await req.continue(); else await req.abort(); return; }
    requests.push({method:req.method(),path:u.pathname,grantType:u.searchParams.get("grant_type")||undefined});
    if(req.method()==="OPTIONS"){await req.respond({status:204,headers,body:""});return;}
    if(expired&&u.pathname==="/auth/v1/token"&&u.searchParams.get("grant_type")==="refresh_token"){await req.respond({status:400,headers,body:JSON.stringify({error_code:"refresh_token_not_found",msg:"Invalid Refresh Token"})});return;}
    if(u.pathname==="/auth/v1/token"&&req.method()==="POST") { state.passwordSignins++;const temporary=session(state.user,"aal1",state.factors);await req.respond({status:200,headers,body:JSON.stringify(temporary)});return; }
    if(u.pathname==="/auth/v1/user"&&req.method()==="PUT") {
      state.passwordUpdates++; state.updateBearer=req.headers().authorization||"";
      let claims={};
      try { claims=JSON.parse(Buffer.from(state.updateBearer.split(" ")[1].split(".")[1],"base64url").toString()); } catch { /* rejected below */ }
      if(claims.sub!==state.user.id||claims.aal!=="aal2"){await req.respond({status:403,headers,body:JSON.stringify({msg:"aal2 required"})});return;}
      await req.respond({status:200,headers,body:JSON.stringify({user:{...state.user,factors:state.factors}})});return;
    }
    if(u.pathname==="/auth/v1/user"&&req.method()==="GET") { const go=()=>req.respond({status:200,headers,body:JSON.stringify({...state.user,factors:state.factors})}).catch(()=>{}); if(userDelay)setTimeout(go,userDelay);else await go();return; }
    if(u.pathname==="/auth/v1/logout"){await req.respond({status:204,headers,body:""});return;}
    if(u.pathname==="/auth/v1/factors"&&req.method()==="POST") { const f={id:"draft-owned",factor_type:"totp",status:"unverified",friendly_name:"VMP"};state.factors.push(f);state.enrolled.push(f.id);await req.respond({status:200,headers,body:JSON.stringify({...f,type:"totp",totp:{qr_code:QR,secret:"OWNEDSECRET123",uri:"otpauth://totp/VMP"}})});return; }
    const m=u.pathname.match(/^\/auth\/v1\/factors\/([^/]+)(?:\/(challenge|verify))?$/);
    if(m&&req.method()==="DELETE"&&deleteFailure){await req.respond({status:429,headers,body:JSON.stringify({code:429,error_code:"over_request_rate_limit",msg:"Too many requests"})});return;}
    if(m&&req.method()==="DELETE"){state.deleted.push(m[1]);state.factors=state.factors.filter(f=>f.id!==m[1]);await req.respond({status:200,headers,body:"{}"});return;}
    if(m?.[2]==="challenge"){await req.respond({status:200,headers,body:JSON.stringify({id:`challenge-${m[1]}`,expires_at:Math.floor(Date.now()/1000)+60})});return;}
    if(m?.[2]==="verify") { const body=JSON.parse(req.postData()||"{}");state.verified++;if(body.code!=="123456"){await req.respond({status:422,headers,body:JSON.stringify({code:422,error_code:"mfa_verification_failed",msg:"Invalid TOTP code"})});return;}const f=state.factors.find(x=>x.id===m[1]);if(f)f.status="verified";state.aal="aal2";current=session(state.user,"aal2",state.factors);await req.respond({status:200,headers,body:JSON.stringify(current)});return; }
    await req.respond(traLoi(store,u,req,{nguoiDung:state.user}));
  } catch { await req.abort().catch(()=>{}); } });
  const key=`sb-${new URL(SB).hostname.split(".")[0]}-auth-token`;
  await page.evaluateOnNewDocument((k,s)=>{localStorage.setItem(k,JSON.stringify(s));localStorage.setItem("vmp_monitor_user_v1",JSON.stringify({uid:s.user.id,email:s.user.email,name:"Cache cũ",role:"admin",department:"qa"}));},key,current);
  return {page,state,requests};
}
async function click(page,re){const ok=await page.evaluate(src=>{const r=new RegExp(src,"i"),e=[...document.querySelectorAll("button,summary")].find(x=>r.test(x.textContent||""));e?.click();return!!e;},re.source);assert.ok(ok,`missing ${re}`);}
async function otp(page,value){const s="input[autocomplete='one-time-code']";await page.focus(s);await page.keyboard.down("Control");await page.keyboard.press("A");await page.keyboard.up("Control");await page.type(s,value);}
async function dashboard(page){await page.waitForFunction(()=>[...document.querySelectorAll("button")].some(x=>/Mật khẩu/i.test(x.textContent||"")),{timeout:30000});}
async function waitUntil(check, label, timeout=5000){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(check())return;await new Promise(r=>setTimeout(r,25));}
  throw new Error(`timeout waiting for ${label}`);
}

const browser=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
try {
  console.log("Expired session clears cached identity:"); {
    const {page,requests}=await setup(browser,{expired:true});await page.goto(APP,{waitUntil:"domcontentloaded"});
    await page.waitForSelector("#vmp-login-email",{timeout:15000}).catch(async e=>{throw new Error(`expired: ${e.message}\n${await page.evaluate(()=>document.body.innerText.slice(0,900))}\nRequests:${JSON.stringify(requests)}`)});
    assert.equal(requests.some(x=>x.path.includes("rpc_my_ui_access")),false);
    assert.equal(await page.evaluate(()=>!!document.querySelector(".vmp-report-export-actions")),false);await page.close();
  }
  console.log("Challenge/reload:"); {
    const {page,state,requests}=await setup(browser,{factors:[LIVE]});await page.goto(APP,{waitUntil:"domcontentloaded"});await page.waitForFunction(()=>document.body.textContent?.includes("Xác thực hai lớp"));assert.equal(requests.some(x=>x.path.includes("rpc_my_ui_access")),false);
    await page.reload({waitUntil:"domcontentloaded"});await page.waitForFunction(()=>document.body.textContent?.includes("Xác thực hai lớp"));assert.equal(requests.some(x=>x.path.includes("rpc_my_ui_access")),false);
    await otp(page,"000000");await click(page,/^Xác minh$/);await page.waitForFunction(()=>/chưa đúng|hết hạn/i.test(document.body.textContent||""));await otp(page,"123456");await click(page,/^Xác minh$/);await dashboard(page).catch(async e=>{throw new Error(`challenge: ${e.message}\n${await page.evaluate(()=>document.body.innerText.slice(0,800))}`)});assert.equal(state.verified,2);assert.equal(requests.some(x=>x.path.includes("rpc_my_ui_access")),true);await page.close();
  }
  console.log("Enrollment cancel/cleanup:"); {
    const {page,state}=await setup(browser);await page.goto(APP,{waitUntil:"domcontentloaded"});await dashboard(page);await click(page,/Mật khẩu/);await page.waitForSelector("[role='dialog']");await click(page,/Xác thực hai lớp/);await page.waitForFunction(()=>/Bật xác thực hai lớp/i.test(document.querySelector("[role='dialog']")?.textContent||""));await click(page,/Bật xác thực hai lớp/);await page.waitForSelector("img[alt*='Mã QR']");assert.equal(await page.$eval("input[aria-label*='Khoá nhập thủ công']",e=>e.value),"OWNEDSECRET123");await click(page,/Huỷ thiết lập/);await page.waitForFunction(()=>/Bật xác thực hai lớp/i.test(document.querySelector("[role='dialog']")?.textContent||""));assert.deepEqual(state.deleted,["draft-owned"]);assert.deepEqual(state.factors,[]);await page.close();
  }
  console.log("Enrollment success/unenroll:"); {
    const {page,state}=await setup(browser); page.on("dialog",d=>d.accept());
    await page.goto(APP,{waitUntil:"domcontentloaded"}); await dashboard(page);
    await click(page,/Mật khẩu/); await click(page,/Xác thực hai lớp/);
    await page.waitForFunction(()=>/Bật xác thực hai lớp/i.test(document.querySelector("[role='dialog']")?.textContent||""));
    await click(page,/Bật xác thực hai lớp/); await page.waitForSelector("img[alt*='Mã QR']");
    await otp(page,"123456"); await click(page,/Xác minh và bật/);
    await page.waitForFunction(()=>!document.querySelector("[role='dialog']"),{timeout:30000})
      .catch(async e=>{throw new Error(`enable dialog: ${e.message}\n${await page.evaluate(()=>document.body.innerText.slice(0,800))}`)});
    await dashboard(page).catch(async e=>{throw new Error(`enable: ${e.message}\n${await page.evaluate(()=>document.body.innerText.slice(0,800))}`)});
    await click(page,/Mật khẩu/); await click(page,/Xác thực hai lớp/);
    await page.waitForFunction(()=>document.querySelector("[role='dialog']")?.textContent?.includes("VMP"))
      .catch(async e=>{throw new Error(`enabled view: ${e.message}\n${await page.evaluate(()=>document.body.innerText.slice(0,1000))}\n${JSON.stringify(state)}`)});
    assert.equal(await page.evaluate(()=>/Bật xác thực hai lớp/.test(document.querySelector("[role='dialog']")?.textContent||"")),false);
    await click(page,/Tắt trên thiết bị này/); await page.waitForFunction(()=>/Nhập mã hiện tại/i.test(document.body.textContent||""));
    await otp(page,"123456"); await click(page,/Xác minh và tắt/);
    await page.waitForFunction(()=>/Đã tắt xác thực hai lớp/i.test(document.body.textContent||"")||!document.querySelector("[role='dialog']"));
    await waitUntil(()=>state.deleted.includes("draft-owned"),"authoritative exact-factor DELETE");
    assert.deepEqual(state.enrolled,["draft-owned"]); assert.deepEqual(state.deleted,["draft-owned"]); await page.close();
  }
  console.log("Unenroll error stays visible:"); {
    const {page,state}=await setup(browser,{factors:[LIVE],aal:"aal2",deleteFailure:true});
    page.on("dialog",d=>d.accept());
    await page.goto(APP,{waitUntil:"domcontentloaded"}); await dashboard(page);
    await click(page,/Mật khẩu/); await click(page,/Xác thực hai lớp/);
    await page.waitForFunction(()=>document.querySelector("[role='dialog']")?.textContent?.includes("Máy kiểm thử"));
    await click(page,/Tắt trên thiết bị này/); await otp(page,"123456"); await click(page,/Xác minh và tắt/);
    await page.waitForFunction(()=>document.querySelector("[role='dialog'] [role='alert']")?.textContent?.includes("quá nhiều"),{timeout:5000});
    assert.deepEqual(state.deleted,[]); assert.equal(state.factors.length,1); await page.close();
  }
  console.log("Pending logout:"); {
    const {page,requests}=await setup(browser,{factors:[LIVE],userDelay:900});await page.goto(APP,{waitUntil:"domcontentloaded"});await page.waitForFunction(()=>/Đang xác minh phiên đăng nhập/i.test(document.body.textContent||""));await page.evaluate(()=>window.__vmpSb.auth.signOut({scope:"local"}));await page.waitForSelector("#vmp-login-email",{timeout:10000});await new Promise(r=>setTimeout(r,1200));assert.ok(await page.$("#vmp-login-email"));assert.equal(requests.some(x=>x.path.includes("rpc_my_ui_access")),false);await page.close();
  }
  console.log("Password change preserves main aal2:"); {
    const {page,state,requests}=await setup(browser,{factors:[LIVE],aal:"aal2"});await page.goto(APP,{waitUntil:"domcontentloaded"});await dashboard(page);await page.evaluate(()=>{window.__mfaEvents=[];window.__vmpSb.auth.onAuthStateChange((event)=>window.__mfaEvents.push(event));});await page.waitForFunction(()=>window.__mfaEvents.includes("INITIAL_SESSION"));await new Promise(r=>setTimeout(r,100));await click(page,/Mật khẩu/);await page.waitForSelector("[role='dialog']");
    await page.type("input[autocomplete='current-password']","old-secret");const news=await page.$$("input[autocomplete='new-password']");await news[0].type("New-secret-123!");await news[1].type("New-secret-123!");await click(page,/Xác nhận/);
    await page.waitForFunction(()=>/Đổi mật khẩu thành công/i.test(document.querySelector("[role='dialog']")?.textContent||""),{timeout:10000})
      .catch(async e=>{const safeState={passwordSignins:state.passwordSignins,passwordUpdates:state.passwordUpdates,updateBearerPresent:state.updateBearer.startsWith("Bearer ")};throw new Error(`password: ${e.message}\n${await page.evaluate(()=>document.body.innerText.slice(0,900))}\n${JSON.stringify(safeState)}\nEvents:${JSON.stringify(await page.evaluate(()=>window.__mfaEvents))}\nRequests:${JSON.stringify(requests)}`)});assert.equal(state.passwordSignins,1);assert.equal(state.passwordUpdates,1);assert.match(state.updateBearer,/Bearer /);
    const updatedClaims=JSON.parse(Buffer.from(state.updateBearer.split(" ")[1].split(".")[1],"base64url").toString());
    assert.equal(updatedClaims.sub,NGUOI_DUNG.id);assert.equal(updatedClaims.aal,"aal2");await page.close();
  }
  console.log("✓ MFA browser acceptance complete");
} finally {await browser.close();}

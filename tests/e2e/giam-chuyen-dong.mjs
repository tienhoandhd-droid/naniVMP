import puppeteer from "puppeteer-core";
import { choServer } from "./cho-server.mjs";
import { dangNhap as vaoHeThong, doiVaiTrenMan } from "./dang-nhap.mjs";
import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
await choServer("http://localhost:4173");

const b = await puppeteer.launch({ executablePath:CHROME, headless:"new", args:["--no-sandbox", ...CHROME_GL_ARGS] });
const p = await b.newPage();
await p.setViewport({width:1400,height:1000});
await p.emulateMediaFeatures([{name:"prefers-reduced-motion",value:"reduce"}]);
const loi=[]; p.on("pageerror",e=>loi.push(e.message));
await vaoHeThong(p, "http://localhost:4173");
await doiVaiTrenMan(p, "admin");
await p.goto("http://localhost:4173#v=overview",{waitUntil:"networkidle2"});
await p.reload({waitUntil:"networkidle2"});
await new Promise(r=>setTimeout(r,5000));
// Chụp hai khung cách nhau 2 giây; giảm chuyển động thì ảnh phải GIỐNG nhau.
const a1 = await p.screenshot({encoding:"base64", clip:{x:380,y:300,width:340,height:260}});
await new Promise(r=>setTimeout(r,2200));
const a2 = await p.screenshot({encoding:"base64", clip:{x:380,y:300,width:340,height:260}});
console.log("Vương miện đứng yên khi bật giảm chuyển động:", a1===a2 ? "✅ ĐÚNG" : "❌ VẪN XOAY");
const tilt = await p.evaluate(()=>{
  const c=document.querySelector(".card.vmp-lift-3d");
  return c ? getComputedStyle(c).transition : "(không thấy thẻ)";
});
console.log("transition của thẻ khi giảm chuyển động:", tilt);
console.log("pageerror:", loi.slice(0,3));
await b.close();

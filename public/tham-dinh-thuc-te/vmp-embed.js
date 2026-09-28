/* Same-origin presentation bridge. It never carries credentials or record data. */
(() => {
 'use strict';
 if(window.parent===window)return;
 try {if(window.parent.location.origin!==location.origin||window.frameElement?.id!=='vmp-qualification-frame')return;}catch{return;}
 document.documentElement.classList.add('vmp-embedded');
 let runDirty=false,approvedUntil=0;
 const send=(type,extra={})=>parent.postMessage({channel:'vmp-qualification',type,...extra},location.origin);
 const isDirty=()=>Boolean(window.CPC1EntryTools?.isDirty()||runDirty);
 const allowNavigation=()=>{approvedUntil=Date.now()+1500;};
 const navigationApproved=()=>Date.now()<approvedUntil;
 const navigate=target=>send('navigate',{target:new URL(target,location.href).href});
 const goHome=()=>send('home');
 const endSession=()=>window.CPC1Recovery?.end();
 window.CPC1Embedded=Object.freeze({isDirty,allowNavigation,navigationApproved,navigate,goHome,endSession});
 document.addEventListener('click',event=>{
  const a=event.target.closest?.('a[href]');
  if(!a||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||a.download||a.target==='_blank'||a.getAttribute('href').startsWith('#'))return;
  const u=new URL(a.href),root=new URL('../',location.href);
  if(u.origin!==location.origin)return;
  if(u.pathname===root.pathname){event.preventDefault();goHome();return;}
  if(u.pathname.startsWith(new URL('./',location.href).pathname)&&/\/(?:index|steam|gas|runs)\.html$/.test(u.pathname)) {event.preventDefault();navigate(u.href);}
 });
 document.addEventListener('input',event=>{if(event.target.closest('#create-run'))runDirty=true;});
 document.addEventListener('change',event=>{if(event.target.closest('#create-run'))runDirty=true;});
 document.addEventListener('reset',event=>{if(event.target.id==='create-run')runDirty=false;});
 window.addEventListener('beforeunload',event=>{if(runDirty&&!navigationApproved()){event.preventDefault();event.returnValue='';}});
 document.addEventListener('DOMContentLoaded',()=>{
  if(!document.querySelector('.form-navigation'))document.documentElement.classList.add('vmp-embedded-full');
  send('ready');
 });
})();

import {useCallback,useEffect,useRef,useState} from 'react';
import {permittedQualificationTarget,QUALIFICATION_LINKS,shellHistoryIndex,writeShellHistory} from './shellRoute.ts';

type Bridge = {isDirty:()=>boolean;allowNavigation:()=>void;endSession:()=>Promise<void>|undefined};
type FrameWindow = Window & {CPC1Embedded?:Bridge};
export function useQualificationWorkspace(systems:readonly string[],hasDirty:boolean) {
  const allowed=systems.length>0;
  const accessKey=systems.join(',');
  const base=()=>new URL('./',window.location.href).href;
  const permitted=(input:string)=>permittedQualificationTarget(input,base(),systems);
  const read=()=>permitted(new URLSearchParams(window.location.search).get('qualification')||'');
  const [target,setTarget]=useState<string|null>(()=>allowed?read():null);
  const current=useRef(target);current.current=target;
  const frame=useRef<HTMLIFrameElement>(null);
  const [ready,setReady]=useState(false);
  const readyRef=useRef(false);
  const [failed,setFailed]=useState(false);
  const [retry,setRetry]=useState(0);
  const acceptedIndex=useRef(shellHistoryIndex());
  const restoring=useRef(false);
  useEffect(()=>{writeShellHistory(window.location.href,true);},[]);
  useEffect(()=>{
    setTarget(allowed?read():null);
  },[accessKey]);
  const canLeave=useCallback(()=>{
    let bridge:Bridge|undefined;
    try {bridge=(frame.current?.contentWindow as FrameWindow|null)?.CPC1Embedded;}
    catch { /* A browser network-error document has an opaque origin and no form. */ }
    if((bridge?.isDirty() || (!current.current&&hasDirty)) && !window.confirm('Có dữ liệu chưa lưu. Bạn có muốn chuyển mục?'))return false;
    bridge?.allowNavigation();return true;
  },[hasDirty]);
  const writeUrl=(next:string|null,replace=false)=>{
    const u=new URL(window.location.href);
    if(next)u.searchParams.set('qualification',next);else u.searchParams.delete('qualification');
    writeShellHistory(u,replace);
    acceptedIndex.current=shellHistoryIndex();
  };
  const change=useCallback((next:string|null)=>{
    if(next===current.current)return true;
    if(next&&!permitted(next))return false;
    if(!canLeave())return false;
    writeUrl(next);setTarget(next);return true;
  },[accessKey,canLeave]);
  const open=useCallback((input:string)=>{
    const next=permitted(input);return next?change(next):false;
  },[change]);
  useEffect(()=>{
    if(!allowed){setTarget(null);return;}
    const pop=(event:PopStateEvent)=>{
      if(restoring.current){restoring.current=false;event.stopImmediatePropagation();return;}
      const next=read();
      if(next!==current.current&&!canLeave()){
        event.stopImmediatePropagation();
        const delta=acceptedIndex.current-shellHistoryIndex();
        if(delta){restoring.current=true;window.history.go(delta);}
        return;
      }
      acceptedIndex.current=shellHistoryIndex();setTarget(next);
    };
    window.addEventListener('popstate',pop,true);return()=>window.removeEventListener('popstate',pop,true);
  },[accessKey,canLeave]);
  useEffect(()=>{
    readyRef.current=false;setReady(false);setFailed(false);
    if(!target)return;
    const timeout=window.setTimeout(()=>{if(!readyRef.current)setFailed(true);},20000);
    return()=>clearTimeout(timeout);
  },[target,retry]);
  useEffect(()=>{
    const message=(event:MessageEvent)=>{
      if(event.origin!==location.origin||event.source!==frame.current?.contentWindow)return;
      const data=event.data;
      if(!data||data.channel!=='vmp-qualification')return;
      if(data.type==='navigate'&&typeof data.target==='string')open(data.target);
      if(data.type==='home')change(null);
      if(data.type==='ready'){readyRef.current=true;setReady(true);setFailed(false);}
    };
    window.addEventListener('message',message);
    return()=>window.removeEventListener('message',message);
  },[target,retry,open,change]);
  const active=target?permitted(target):null;
  const title=QUALIFICATION_LINKS.find(l=>l.target.split('?')[0]===active?.split('?')[0] && (!l.target.includes('system=')||active?.includes(l.target.split('?')[1])))?.label||'Thẩm định thực tế';
  const endSession=async()=>{
    let bridge:Bridge|undefined;
    try {bridge=(frame.current?.contentWindow as FrameWindow|null)?.CPC1Embedded;}catch {return;}
    try {await bridge?.endSession();}catch { /* Local cleanup must never prevent Auth sign-out. */ }
  };
  return {active,title,open,close:()=>change(null),canLeave,endSession,
    content:active?<section aria-label="Nội dung thẩm định thực tế" style={{minWidth:0,height:"100%",display:"flex",flexDirection:"column"}}>
      {!ready&&!failed&&<p role="status">Đang mở {title.toLocaleLowerCase('vi')}…</p>}
      {failed&&<div role="alert"><p>Chưa mở được biểu mẫu. Bạn có thể thử tải lại.</p><button type="button" onClick={()=>{if(canLeave())setRetry(v=>v+1);}}>Thử lại biểu mẫu</button></div>}
      <iframe key={active+":"+retry} ref={frame} id="vmp-qualification-frame" title={title}
        src={new URL('tham-dinh-thuc-te/'+active,base()).href}
        style={{display:'block',width:'100%',flex:1,minHeight:0,border:0,visibility:ready?'visible':'hidden'}} />
    </section>:null};
}

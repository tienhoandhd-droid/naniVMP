(() => {
  'use strict';
  const store = window.CPC1DraftStore;
  let adapter, active, timer, subscription, notice = false, queue = Promise.resolve();
  const $ = id => document.getElementById(id);
  const allowed = () => {
    const system=adapter?.get().system;
    return document.body.dataset.runClosed !== 'true' && !window.CPC1_SESSION_ENDED && window.CPC1Backend?.canSaveActive?.() === true;
  };
  const storageSystem = s => s.runId ? s.system+':'+s.runId : s.system;
  const time = value => new Date(value).toLocaleString('vi-VN');
  // 12/11 (chủ dự án): lưu tạm LUÔN bật, không còn ô bật/tắt. Khối bản tạm ẩn khi mọi thứ bình thường;
  // chỉ hiện khi có bản tạm cũ cần khôi phục/xoá, khi lưu tạm lỗi, hoặc ngay sau một thao tác cần báo (show=true).
  const quiet = () => { const box = $('local-draft-panel'); if (!box) return; const an = !(active?.candidate || active?.failed || notice); box.dataset.quiet = String(an); box.style.display = an ? 'none' : ''; };
  const status = (text, show = false) => { if ($('local-draft-status')) $('local-draft-status').textContent = text; notice = show; quiet(); };
  const warnLeave=event=>{if(window.CPC1Embedded?.navigationApproved())return;event.preventDefault();event.returnValue='';};
  function sync() {
    if(adapter?.get().dirty&&!window.CPC1_SESSION_ENDED)window.addEventListener('beforeunload',warnLeave);else window.removeEventListener('beforeunload',warnLeave);
    window.dispatchEvent(new Event('cpc1:entry-change'));
    if (!active || !allowed()) return;
    $('local-draft-restore').hidden = !active.candidate;
    $('local-draft-clear').hidden = !active.candidate;
    quiet();
  }
  function panel() {
    if ($('local-draft-panel')) return;
    const section = document.createElement('section');section.id='local-draft-panel';section.className='local-draft-panel';section.setAttribute('aria-label','Bản tạm trên máy');
    section.innerHTML='<span id="local-draft-status" role="status"></span><div class="draft-recovery-actions"><button id="local-draft-restore" type="button" hidden>Khôi phục bản đang nhập</button><button id="local-draft-clear" type="button" hidden>Xóa bản tạm trên máy</button></div>';
    document.querySelector('.action-bar, .actionbar').after(section);quiet();
    $('local-draft-clear').addEventListener('click',()=>discard());
    $('local-draft-restore').addEventListener('click', async () => {
      const a=active;if(!a?.candidate || !allowed())return;
      if(adapter.get().dirty && !confirm('Thay dữ liệu đang trên trang bằng bản tạm đã lưu trên máy?'))return;
      try {
        const snapshot=structuredClone(a.candidate);store.validate(snapshot);
        const system=snapshot.data?.system || adapter.get().system;
        if(snapshot.recordId) await window.CPC1Backend.checkDraftAccess(snapshot.recordId,system);
        else await window.CPC1Backend.refreshAccess(system,window.CPC1Backend.runBinding?'archive-edit':'enter');
        await adapter.restore(snapshot);
        if(a!==active || a.ended)return;
        a.candidate=null;sync();status('Đã khôi phục. Tính lại và lưu khi có mạng.',true);
        changed();
      } catch(e){status('Không khôi phục được: '+e.message+' Bản tạm vẫn được giữ.');}
    });
  }
  async function start(options) {
    adapter=options;
    if (!allowed() || !options.get().userId) return;
    const state=options.get(), scope=JSON.stringify([window.CPC1_SETTINGS?.url || location.origin,state.userId]);
    if(active?.scope===scope && active.system===storageSystem(state) && !active.ended){sync();return;}
    clearTimeout(timer);
    const a={scope,system:storageSystem(state),actor:state.userId,revision:0,candidate:null,ended:false,failed:false};active=a;notice=false;panel();
    try {
      const row=await store.read(scope,storageSystem(state));
      if(active!==a || a.ended || !allowed())return;
      a.revision=row?.revision || 0; // luôn tự lưu, kể cả máy trước đây đã tắt (cờ enabled cũ trong bộ nhớ máy không còn dùng)
      a.candidate=row?.payload || null;
      status(a.candidate?'Có bản đang nhập từ '+time(row.updatedAt)+'. Chọn khôi phục hoặc xóa bản tạm.':'Chưa có thay đổi mới.');sync();
    } catch(e){a.failed=true;status('Không mở được bộ nhớ máy. Dùng Hồ sơ & tệp → Tải bản nháp.');sync();}
    if(!subscription && window.CPC1Backend.onSessionChange) subscription=window.CPC1Backend.onSessionChange((event,session)=>{
      if(active && (event==='SIGNED_OUT' || (event==='SIGNED_IN' && session?.user?.id!==active.actor))) void end();
    });
  }
  function changed() {
    sync();clearTimeout(timer);
    if(!active || active.ended || active.failed || !allowed())return;
    if(active.candidate){status('Có bản tạm cũ. Khôi phục hoặc xóa trước khi tự lưu dữ liệu mới.');return;}
    status('Đang chờ lưu tạm…');timer=setTimeout(()=>void flush(),250);
  }
  function flush(force=false) {
    clearTimeout(timer);
    const a=active;
    if(!a || a.ended || a.failed || a.candidate || !allowed())return queue;
    const current=adapter.get();
    if(storageSystem(current)!==a.system || current.userId!==a.actor)return queue;
    if(!current.dirty && !force)return queue;
    const payload=current.dirty?structuredClone(current.snapshot):null;
    queue=queue.catch(()=>{}).then(async()=>{
      if(a.ended || a.failed || !allowed())return;
      try {
        const row=await store.write(a.scope,a.system,a.revision,payload,true);a.revision=row.revision;
        if(a===active&&!a.ended)status(adapter.get().generation!==current.generation?'Đang chờ lưu tạm…':payload?'Đã lưu tạm trên máy · '+time(row.updatedAt)+' · chưa lưu lên hệ thống':'Chưa có thay đổi mới.');
      } catch(e){a.failed=true;if(a===active)status(e.code==='DRAFT_CONFLICT'?e.message:'Không lưu được trên máy. Dữ liệu còn trên trang; hãy tải bản nháp JSON.');}
    });
    return queue;
  }
  async function discard() {
    const a=active;if(!a)return;
    if(!confirm('Xóa bản tạm của hệ thống này trên máy? Dữ liệu trên trang và hồ sơ đã lưu vẫn giữ nguyên.')){sync();return;}
    clearTimeout(timer);await queue.catch(()=>{});
    if(a!==active || a.ended)return;
    try {
      // Re-read only for an explicit discard, never for an automatic conflicting write.
      const row=await store.read(a.scope,a.system);
      const cleared=await store.write(a.scope,a.system,row?.revision || 0,null,true);
      a.revision=cleared.revision;a.candidate=null;a.failed=false;sync();status('Đã xóa bản tạm trên máy.',true);
    } catch(e){status('Không xóa được bản tạm: '+e.message,true);sync();}
  }
  function accepted() {
    const a=active;clearTimeout(timer);sync();
    if(!a || a.ended || a.failed || a.candidate)return queue;
    queue=queue.catch(()=>{}).then(async()=>{
      if(a.ended || !allowed())return;
      try{const row=await store.write(a.scope,a.system,a.revision,null,true);a.revision=row.revision;if(a===active)status('Đã lưu. Bản tạm đã được dọn.');}
      catch(e){a.failed=true;if(a===active)status('Hồ sơ đã lưu; chưa dọn được bản tạm trên máy.');}
    });return queue;
  }
  async function transition(){const a=active;const pending=flush();clearTimeout(timer);active=null;await pending;if(a)a.ended=true;}
  // C1 (10/11): hết phiên / mất quyền → lưu nốt bản tạm rồi đóng, KHÔNG xoá. Bản tạm gắn
  // scope=[url,userId] nên tài khoản khác không đọc được; nút "Xóa bản tạm" vẫn xoá tay.
  // Không qua allowed(): lúc này phiên đã kết thúc hoặc quyền đã mất, chỉ ghi vào máy này.
  function finalWrite(a) {
    if(a.failed || a.candidate)return queue;
    const current=adapter.get();
    if(storageSystem(current)!==a.system || current.userId!==a.actor || !current.dirty)return queue;
    const payload=structuredClone(current.snapshot);
    queue=queue.catch(()=>{}).then(async()=>{
      try{const row=await store.write(a.scope,a.system,a.revision,payload,true);a.revision=row.revision;}
      catch(e){console.error('[CPC1] Không lưu nốt được bản tạm khi kết thúc phiên:',e);}
    });
    return queue;
  }
  async function end() {
    const a=active;if(!a)return;
    clearTimeout(timer);const pending=finalWrite(a);
    a.ended=true;active=null;window.removeEventListener('beforeunload',warnLeave);window.CPC1EntryTools?.end();
    await pending;
    $('local-draft-panel')?.remove();
  }
  window.addEventListener('cpc1:permissions',()=>{if(active&&!allowed())void end();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void flush();});
  window.addEventListener('pagehide',()=>void flush());
  window.CPC1Recovery=Object.freeze({start,changed,flush,accepted,end,sync,transition});
})();

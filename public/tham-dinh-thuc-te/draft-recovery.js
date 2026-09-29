(() => {
  'use strict';
  const store = window.CPC1DraftStore;
  let adapter, active, timer, subscription, queue = Promise.resolve();
  const $ = id => document.getElementById(id);
  const allowed = () => {
    const system=adapter?.get().system;
    return document.body.dataset.runClosed !== 'true' && !window.CPC1_SESSION_ENDED && window.CPC1Backend?.canSaveActive?.() === true;
  };
  const storageSystem = s => s.runId ? s.system+':'+s.runId : s.system;
  const time = value => new Date(value).toLocaleString('vi-VN');
  const status = text => { if ($('local-draft-status')) $('local-draft-status').textContent = text; };
  const warnLeave=event=>{if(window.CPC1Embedded?.navigationApproved())return;event.preventDefault();event.returnValue='';};
  function sync() {
    if(adapter?.get().dirty&&!window.CPC1_SESSION_ENDED)window.addEventListener('beforeunload',warnLeave);else window.removeEventListener('beforeunload',warnLeave);
    window.dispatchEvent(new Event('cpc1:entry-change'));
    if (!active || !allowed()) return;
    $('local-draft-enable').checked = active.enabled;
    $('local-draft-restore').hidden = !active.candidate;
    $('local-draft-clear').hidden = !active.enabled && !active.candidate;
  }
  function panel() {
    if ($('local-draft-panel')) return;
    const section = document.createElement('section');section.id='local-draft-panel';section.className='local-draft-panel';section.setAttribute('aria-label','Bản tạm trên máy');
    section.innerHTML='<div class="draft-switch"><label><input id="local-draft-enable" type="checkbox" aria-describedby="local-draft-help"> Lưu tạm trên máy này</label><span id="local-draft-status" role="status">Chưa bật lưu tạm</span></div><p id="local-draft-help">Chỉ bật trên máy cá nhân. Bản tạm nằm trong trình duyệt, chưa lưu Supabase. Đăng xuất từ trang này sẽ xóa bản tạm của tài khoản. Ứng dụng không mã hóa bản tạm; người dùng chung hồ sơ trình duyệt có thể truy cập. Xóa dữ liệu trình duyệt có thể làm mất bản tạm.</p><div class="draft-recovery-actions"><button id="local-draft-restore" type="button" hidden>Khôi phục bản đang nhập</button><button id="local-draft-clear" type="button" hidden>Xóa bản tạm trên máy</button></div>';
    document.querySelector('.action-bar, .actionbar').after(section);
    $('local-draft-enable').addEventListener('change', async () => {
      if (!active || !allowed()) return;
      if (!$('local-draft-enable').checked) { await discard(); return; }
      active.enabled=true;sync();await flush(true);
    });
    $('local-draft-clear').addEventListener('click',discard);
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
        a.candidate=null;sync();status('Đã khôi phục. Tính lại và lưu Supabase khi có mạng.');
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
    const a={scope,system:storageSystem(state),actor:state.userId,revision:0,enabled:false,candidate:null,ended:false,failed:false};active=a;panel();
    try {
      const row=await store.read(scope,storageSystem(state));
      if(active!==a || a.ended || !allowed())return;
      a.revision=row?.revision || 0;a.enabled=Boolean(row?.enabled);a.candidate=row?.payload || null;
      status(a.candidate?'Có bản đang nhập từ '+time(row.updatedAt)+'. Chọn khôi phục hoặc xóa bản tạm.':a.enabled?'Đã bật lưu tạm. Chưa có thay đổi mới.':'Chưa bật lưu tạm');sync();
    } catch(e){a.failed=true;status('Không mở được bộ nhớ máy. Dùng Hồ sơ & tệp → Tải bản nháp.');sync();}
    if(!subscription && window.CPC1Backend.onSessionChange) subscription=window.CPC1Backend.onSessionChange((event,session)=>{
      if(active && (event==='SIGNED_OUT' || (event==='SIGNED_IN' && session?.user?.id!==active.actor))) void end();
    });
  }
  function changed() {
    sync();clearTimeout(timer);
    if(!active?.enabled || active.ended || active.failed || !allowed())return;
    if(active.candidate){status('Có bản tạm cũ. Khôi phục hoặc xóa trước khi tự lưu dữ liệu mới.');return;}
    status('Đang chờ lưu tạm…');timer=setTimeout(()=>void flush(),250);
  }
  function flush(force=false) {
    clearTimeout(timer);
    const a=active;
    if(!a || a.ended || a.failed || !a.enabled || a.candidate || !allowed())return queue;
    const current=adapter.get();
    if(storageSystem(current)!==a.system || current.userId!==a.actor)return queue;
    if(!current.dirty && !force)return queue;
    const payload=current.dirty?structuredClone(current.snapshot):null;
    queue=queue.catch(()=>{}).then(async()=>{
      if(a.ended || a.failed || !allowed())return;
      try {
        const row=await store.write(a.scope,a.system,a.revision,payload,true);a.revision=row.revision;
        if(a===active&&!a.ended)status(adapter.get().generation!==current.generation?'Đang chờ lưu tạm…':payload?'Đã lưu tạm trên máy · '+time(row.updatedAt)+' · Chưa lưu Supabase':'Đã bật lưu tạm. Chưa có thay đổi mới.');
      } catch(e){a.failed=true;if(a===active)status(e.code==='DRAFT_CONFLICT'?e.message:'Không lưu được trên máy. Dữ liệu còn trên trang; hãy tải bản nháp JSON.');}
    });
    return queue;
  }
  async function discard() {
    const a=active;if(!a)return;
    if(!confirm('Xóa bản tạm của hệ thống này trên máy? Dữ liệu đang trên trang và hồ sơ Supabase vẫn giữ nguyên.')){sync();return;}
    clearTimeout(timer);await queue.catch(()=>{});
    if(a!==active || a.ended)return;
    try {
      // Re-read only for an explicit discard, never for an automatic conflicting write.
      const row=await store.read(a.scope,a.system);
      const cleared=await store.write(a.scope,a.system,row?.revision || 0,null,false);
      a.revision=cleared.revision;a.enabled=false;a.candidate=null;a.failed=false;sync();status('Đã xóa bản tạm trên máy. Tự lưu đã tắt.');
    } catch(e){status('Không xóa được bản tạm: '+e.message);sync();}
  }
  function accepted() {
    const a=active;clearTimeout(timer);sync();
    if(!a?.enabled || a.ended || a.failed || a.candidate)return queue;
    queue=queue.catch(()=>{}).then(async()=>{
      if(a.ended || !allowed())return;
      try{const row=await store.write(a.scope,a.system,a.revision,null,true);a.revision=row.revision;if(a===active)status('Đã lưu Supabase. Bản tạm đã được dọn.');}
      catch(e){a.failed=true;if(a===active)status('Hồ sơ đã lưu; chưa dọn được bản tạm trên máy.');}
    });return queue;
  }
  async function transition(){const a=active;const pending=flush();clearTimeout(timer);active=null;await pending;if(a)a.ended=true;}
  async function end() {
    const a=active;if(!a)return;
    a.ended=true;clearTimeout(timer);active=null;window.removeEventListener('beforeunload',warnLeave);window.CPC1EntryTools?.end();
    await queue.catch(()=>{});
    try{await store.clearActor(a.scope);}catch{status('Chưa xóa được bản tạm. Xóa dữ liệu trang trong trình duyệt trên máy dùng chung.');}
    $('local-draft-panel')?.remove();
  }
  window.addEventListener('cpc1:permissions',()=>{if(active&&!allowed())void end();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void flush();});
  window.addEventListener('pagehide',()=>void flush());
  window.CPC1Recovery=Object.freeze({start,changed,flush,accepted,end,sync,transition});
})();

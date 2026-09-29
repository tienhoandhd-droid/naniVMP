import { makeBackend } from './backend.js';
const login = () => window.CPC1Embedded ? window.CPC1Embedded.goHome() : window.location.assign('../');
const unavailable = async () => { throw new Error('Chưa cấu hình kết nối VMP.'); };
let activeSystem = null;
let runBound = false;
const currentSystem = () => window.CPC1Backend?.activeSystem || activeSystem;
try {
  window.CPC1Backend = makeBackend(window.CPC1_SETTINGS);
  window.CPC1Backend.openLogin = login;
  const entryQuery=new URLSearchParams(location.search);
  activeSystem=location.pathname.endsWith('/steam.html')?'steam':location.pathname.endsWith('/gas.html')?(['air','nitrogen'].includes(entryQuery.get('system'))?entryQuery.get('system'):'air'):null;
  if(activeSystem)window.CPC1Backend.bindSystem(activeSystem);
  if(entryQuery.has('run')){window.CPC1Backend.bindRun(entryQuery.get('run'),entryQuery.get('record'));runBound=true;}
  let actor = null;
  window.CPC1Backend.onSessionChange((event, session) => {
    const next = session?.user?.id || null;
    if (actor && (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && next !== actor))) {
      // Clear already displayed confidential content on cross-tab sign-out/identity change.
      // Do not call async Auth methods inside the SDK callback (refresh lock).
      window.CPC1_SESSION_ENDED = true;
      queueMicrotask(() => {
        const main = document.createElement('main'); main.className = 'entry-welcome';
        const title = document.createElement('h1');title.textContent = 'Phiên VMP đã kết thúc';
        const message = document.createElement('p');message.textContent = 'Đăng nhập lại tại VMP để tiếp tục.';
        const link = document.createElement('a');link.href = '../';link.textContent = 'Về VMP';
        main.append(title,message,link);document.body.replaceChildren(main);
      });
    }
    actor = next;
  });
} catch {
  window.CPC1Backend = {getConfig:unavailable,getGasConfig:unavailable,evaluate:unavailable,save:unavailable,list:unavailable,load:unavailable,report:unavailable,signIn:unavailable,signOut:async()=>{},getSession:async()=>null,permissionsFor:()=>({can_view:false,can_enter:false,pq_codes:[]}),openLogin:login};
}

// View-only QA is allowed to browse source forms and records in its server-defined scope.
// DOM restrictions are UX only; evaluate/save/assets enforce entry capability in PostgreSQL.
function reflectPermissions() {
  const permissions = window.CPC1Backend?.permissions;
  const access = currentSystem() ? window.CPC1Backend?.permissionsFor?.(currentSystem()) : permissions;
  if (!access) return;
  const canSave=window.CPC1Backend?.canSaveActive?.()===true,canEvaluate=window.CPC1Backend?.canEvaluateActive?.()===true;
  if(!canSave){
    for (const control of document.querySelectorAll('#entry-form input, #entry-form textarea')) control.readOnly = true;
    for (const control of document.querySelectorAll('#entry-form select, #draft-open, #draft-download, #draft-file')) control.disabled = true;
  }
  const save=document.getElementById('record-save'),evaluate=document.getElementById('evaluate');if(save&&!canSave)save.disabled=true;if(evaluate&&!canEvaluate)evaluate.disabled=true;
  if (!canSave && !document.getElementById('qualification-access-note')) {
    const note = document.createElement('p');note.id='qualification-access-note';note.className='message';note.setAttribute('role','status');
    const codes=access.pq_codes?.length?` · PQ: ${access.pq_codes.join(', ')}`:'';
    note.textContent=runBound?`Quyền chỉ xem${codes} · Có thể in phiên bản hồ sơ đã lưu; nhập, tính và lưu cần quyền nhập.`:'Chọn đợt thẩm định ở phía trên trước khi nhập biểu mẫu.';
    document.querySelector('#entry-form')?.before(note);
  }
  renderCurrentPq(access);
}
function renderCurrentPq(access) {
  if(runBound||!access.can_view_current||!access.pq_codes?.length||document.getElementById('qualification-pq-context'))return;
  const note=document.createElement('p');note.id='qualification-pq-context';note.className='message';note.textContent=currentSystem()==='steam'?`Biểu mẫu hơi dùng chung · Có quyền một trong các PQ: ${access.pq_codes.join(' hoặc ')}.`:`Liên kết PQ hiện thời: ${access.pq_codes.join(', ')}.`;
  document.querySelector('#entry-form')?.before(note);
}
window.addEventListener('cpc1:permissions', reflectPermissions);
new MutationObserver(reflectPermissions).observe(document.body,{childList:true,subtree:true});

function clearDeniedContent() {
  window.CPC1_SESSION_ENDED = true;
  void window.CPC1Recovery?.end?.();
  const main = document.createElement('main'); main.className = 'qualification-gate';
  const title = document.createElement('h1');title.textContent = 'Quyền PQ đã thay đổi';
  const message = document.createElement('p');message.textContent = 'Dữ liệu đang hiển thị đã được đóng. Mở lại từ VMP sau khi quyền được cấp lại.';
  const link = document.createElement('a');link.href = '../';link.textContent = 'Về VMP';
  main.append(title,message,link);document.body.replaceChildren(main);
}
window.addEventListener('cpc1:permission-denied', clearDeniedContent);

// Guard the catalogue and direct URLs, not merely the VMP menu.
window.CPC1Backend.getSession().then(session => {
  if (!session) throw new Error('Đăng nhập VMP bằng tài khoản QA hoặc Admin để mở mục này.');
  if (currentSystem() && !window.CPC1Backend.permissionsFor(currentSystem()).can_view) throw new Error('Không có quyền PQ hiện thời cho hệ thống này.');
  document.body.dataset.qualificationGate = 'ready';
}).catch(error => {
  if (error?.code === 'CONTEXT_STALE') return;
  document.body.dataset.qualificationGate = 'denied';
  const gate = document.createElement('main');gate.className='qualification-gate';
  const heading = document.createElement('h1');heading.textContent='Thẩm định thực tế (demo)';
  const detail = document.createElement('p');detail.textContent=error.message || 'Không xác minh được quyền truy cập. Vui lòng thử lại.';
  const link = document.createElement('a');link.href='../';link.textContent='Về VMP';
  gate.append(heading,detail,link);document.body.append(gate);
});

async function revalidatePermission() {
  if (window.CPC1_SESSION_ENDED) return;
  try {
    const session=await window.CPC1Backend.refreshContext();
    if (!session || (currentSystem()&&!window.CPC1Backend.permissionsFor(currentSystem()).can_view)) clearDeniedContent();
    else window.dispatchEvent(new CustomEvent('cpc1:permissions-refreshed'));
  } catch (error) {
    if (error?.code === '42501') clearDeniedContent();
  }
}
window.addEventListener('focus',()=>void revalidatePermission());
window.addEventListener('online',()=>void revalidatePermission());

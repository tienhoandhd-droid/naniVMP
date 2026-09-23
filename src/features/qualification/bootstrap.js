import { makeBackend } from './backend.js';
const login = () => window.location.assign('../');
const unavailable = async () => { throw new Error('Chưa cấu hình kết nối VMP.'); };
try {
  window.CPC1Backend = makeBackend(window.CPC1_SETTINGS);
  window.CPC1Backend.openLogin = login;
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
  window.CPC1Backend = {getConfig:unavailable,getGasConfig:unavailable,evaluate:unavailable,save:unavailable,list:unavailable,load:unavailable,report:unavailable,signIn:unavailable,signOut:async()=>{},getSession:async()=>null,openLogin:login};
}

// View-only QA is allowed to browse source forms and records in its server-defined scope.
// DOM restrictions are UX only; evaluate/save/assets enforce entry capability in PostgreSQL.
function reflectPermissions() {
  const permissions = window.CPC1Backend?.permissions;
  if (!permissions || permissions.can_enter) return;
  for (const control of document.querySelectorAll('#entry-form input, #entry-form textarea')) control.readOnly = true;
  for (const control of document.querySelectorAll('#entry-form select, #record-save, #evaluate, #print, #draft-open, #draft-download, #draft-file')) control.disabled = true;
  if (!document.getElementById('qualification-access-note')) {
    const note = document.createElement('p');note.id='qualification-access-note';note.className='message';note.setAttribute('role','status');
    note.textContent='Quyền chỉ xem · Chỉ hiển thị hồ sơ trong phạm vi được cấp. Nhập, sửa và in cần quyền riêng.';
    document.querySelector('#entry-form')?.before(note);
  }
}
window.addEventListener('cpc1:permissions', reflectPermissions);
new MutationObserver(reflectPermissions).observe(document.body,{childList:true,subtree:true});

// Guard the catalogue and direct URLs, not merely the VMP menu.
window.CPC1Backend.getSession().then(session => {
  if (!session) throw new Error('Đăng nhập VMP bằng tài khoản QA hoặc Admin để mở mục này.');
  document.body.dataset.qualificationGate = 'ready';
}).catch(error => {
  document.body.dataset.qualificationGate = 'denied';
  const gate = document.createElement('main');gate.className='qualification-gate';
  const heading = document.createElement('h1');heading.textContent='Thẩm định thực tế (demo)';
  const detail = document.createElement('p');detail.textContent=error.message || 'Không xác minh được quyền truy cập. Vui lòng thử lại.';
  const link = document.createElement('a');link.href='../';link.textContent='Về VMP';
  gate.append(heading,detail,link);document.body.append(gate);
});

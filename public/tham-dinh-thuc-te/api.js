/* Adapter boundary: primary injects window.CPC1Backend (Supabase/Auth bundle) before this file. */
(() => {
  'use strict';
  const json = async (response) => { if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail.error || `Máy chủ trả về lỗi ${response.status}.`); } return response.json(); };
  const preview = {
    mode: 'preview', capabilities: { persistence: false, auth: false },
    getConfig: () => fetch('/api/config').then(json),
    evaluate: (data) => fetch('/api/evaluate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(json),
    report: (form, data) => fetch(`/api/report/${encodeURIComponent(form)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(async r => { if (!r.ok) { const detail = await r.json().catch(() => ({})); throw new Error(detail.error || `Máy chủ trả về lỗi ${r.status}.`); } return r.blob(); }),
    save: async () => { throw new Error('Lưu Supabase chưa được cấu hình cho môi trường này.'); },
    load: async () => { throw new Error('Mở hồ sơ chưa được cấu hình cho môi trường này.'); }, list: async () => [], getSession: async () => null, signIn: async () => { throw new Error('Đăng nhập chưa được cấu hình.'); }, signOut: async () => {}
  };
  const backend = window.CPC1Backend;
  const required = ['getConfig', 'evaluate', 'save', 'load', 'list', 'report', 'signIn', 'signOut', 'getSession'];
  window.CPC1_API = backend && required.every(name => typeof backend[name] === 'function') ? { ...backend, mode: 'cloud', capabilities: { persistence: true, auth: true } } : preview;
})();

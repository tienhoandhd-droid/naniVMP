/* Boundary: a hosted bundle may install window.CPC1Backend before this page. */
(() => {
  'use strict';
  const json = async response => { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || `Máy chủ trả về lỗi ${response.status}.`); return body; };
  const preview = {
    mode: 'preview', capabilities: { persistence: false, auth: false },
    getGasConfig: system => fetch(`../api/gas/config?system=${encodeURIComponent(system)}`).then(json),
    evaluate: data => fetch('../api/gas/evaluate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(json),
    report: (form, data) => fetch(`../api/gas/report/${encodeURIComponent(form)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(async response => { if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || `Máy chủ trả về lỗi ${response.status}.`); } return response.blob(); }),
    getSession: async () => null, signIn: async () => { throw new Error('Đăng nhập chưa được cấu hình cho môi trường này.'); }, signOut: async () => {},
    save: async () => { throw new Error('Supabase chưa được kết nối.'); }, load: async () => { throw new Error('Supabase chưa được kết nối.'); }, list: async () => []
  };
  const backend = window.CPC1Backend;
  const required = ['getGasConfig', 'evaluate', 'report', 'save', 'load', 'list', 'getSession', 'signIn', 'signOut'];
  window.GasAPI = backend && required.every(name => typeof backend[name] === 'function') ? { ...backend, mode: 'cloud', capabilities: { persistence: true, auth: true } } : preview;
})();

/* Temporary device drafts only. No credentials, evaluations or issued reports. */
(() => {
  'use strict';
  let database;
  const systems = new Set(['steam', 'air', 'nitrogen']);
  function validate(payload) {
    if (payload === null) return;
    if (!payload || typeof payload !== 'object' || !payload.data || !/^bm0[1-7]$/.test(payload.form)) throw Error('Bản tạm không đúng cấu trúc.');
    if (Object.keys(payload).some(k => !['data','recordId','version','form','point'].includes(k))) throw Error('Bản tạm có trường không được hỗ trợ.');
    if (payload.recordId !== null && (typeof payload.recordId !== 'string' || payload.recordId.length > 120)) throw Error('Mã hồ sơ không hợp lệ.');
    if (payload.version !== null && (!Number.isSafeInteger(payload.version) || payload.version < 1)) throw Error('Phiên bản không hợp lệ.');
    if (payload.point !== null && (typeof payload.point !== 'string' || payload.point.length > 240)) throw Error('Điểm lấy mẫu không hợp lệ.');
    const walk = (v, depth = 0) => {
      if (depth > 20) throw Error('Bản tạm quá phức tạp.');
      if (v && typeof v === 'object') {
        if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype) throw Error('Cấu trúc không hợp lệ.');
        for (const [k, child] of Object.entries(v)) {
          if (['__proto__','constructor','prototype'].includes(k)) throw Error('Khóa dữ liệu không hợp lệ.');
          walk(child, depth + 1);
        }
      } else if (v !== null && !['string','number','boolean'].includes(typeof v)) throw Error('Giá trị không hợp lệ.');
    };
    walk(payload);
    if (new Blob([JSON.stringify(payload)]).size > 1048576) throw Error('Bản tạm vượt 1 MB. Hãy tải bản nháp JSON.');
  }
  function open() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('cpc1-device-drafts', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts', {keyPath:'key'});
      request.onerror = () => { database = null; reject(request.error); };
      request.onblocked = () => { database = null; reject(Error('Đóng tab cũ để mở bộ nhớ bản tạm.')); };
      request.onsuccess = () => { const db = request.result; db.onversionchange = () => {db.close();database = null;}; resolve(db); };
    });
    return database;
  }
  function key(scope, system) {
    if (typeof scope !== 'string' || !scope || scope.length > 500 || !(systems.has(system) || /^(steam|air|nitrogen):[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(system))) throw Error('Phạm vi bản tạm không hợp lệ.');
    return JSON.stringify([scope,system]);
  }
  async function read(scope, system) {
    const db = await open(), k = key(scope,system);
    return new Promise((resolve,reject) => {
      const tx = db.transaction('drafts','readonly'), request = tx.objectStore('drafts').get(k);
      tx.oncomplete = () => { try {const row=request.result || null;if(row?.payload) validate(row.payload);resolve(row);} catch(e){reject(e);} };
      tx.onabort = () => reject(tx.error || Error('Không đọc được bản tạm.'));
    });
  }
  async function write(scope, system, expected, payload, enabled) {
    validate(payload);
    const db = await open(), k = key(scope,system);
    return new Promise((resolve,reject) => {
      const tx = db.transaction('drafts','readwrite'), store = tx.objectStore('drafts');
      let saved, failure;
      const request = store.get(k);
      request.onsuccess = () => {
        if ((request.result?.revision || 0) !== expected) {
          failure = Error('Bản tạm đã được thay đổi ở tab khác. Tải JSON để giữ riêng dữ liệu của tab này.');
          failure.code = 'DRAFT_CONFLICT'; tx.abort(); return;
        }
        saved = {key:k,scope,system,revision:expected+1,enabled:Boolean(enabled),payload,updatedAt:new Date().toISOString()};
        store.put(saved);
      };
      tx.oncomplete = () => resolve(saved);
      tx.onabort = () => reject(failure || tx.error || Error('Không lưu được bản tạm.'));
    });
  }
  async function clearActor(scope) {
    const db = await open();
    return new Promise((resolve,reject) => {
      const tx=db.transaction('drafts','readwrite'), request=tx.objectStore('drafts').openCursor();
      request.onsuccess=()=>{const cursor=request.result;if(cursor){if(cursor.value.scope===scope)cursor.delete();cursor.continue();}};
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error || Error('Không xóa được bản tạm.'));
    });
  }
  window.CPC1DraftStore = Object.freeze({read,write,clearActor,validate});
})();

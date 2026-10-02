(() => {
  'use strict';
  const forbidden = value => ['__proto__', 'prototype', 'constructor'].includes(String(value));
  const empty = value => value == null || String(value).trim() === '';
  const headers = columns => ['Điểm', 'Lần đo', ...columns.map(column => column.label)];
  function parse(text, {columns = [], targets = [], decimal = ','} = {}) {
    const errors = [], rows = [], changes = [];
    const fail = (line, column, message) => { errors.push({line, column, message}); };
    if (!columns.length || columns.some(c => forbidden(c.key) || !c.key || !c.label) || new Set(columns.map(c => c.key)).size !== columns.length) {
      fail(1, '', 'Biểu mẫu chưa có cột nhập phù hợp.'); return {rows, changes, errors};
    }
    if (![',', '.'].includes(decimal)) { fail(1, '', 'Chọn dấu thập phân trước khi kiểm tra.'); return {rows, changes, errors}; }
    if (typeof text !== 'string' || text.length > 1048576) { fail(1, '', 'Bảng quá lớn. Mỗi lần dán tối đa 1 MB.'); return {rows, changes, errors}; }
    const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    while (lines.length && !lines.at(-1).trim()) lines.pop();
    if (lines.length > 1001) { fail(1, '', 'Mỗi lần dán tối đa 1.000 dòng số liệu.'); return {rows, changes, errors}; }
    const expected = headers(columns);
    if (JSON.stringify((lines[0] || '').split('\t').map(s => s.trim())) !== JSON.stringify(expected)) {
      fail(1, '', 'Hàng tiêu đề chưa đúng. Bấm “Dùng bảng mẫu”, giữ nguyên tên và thứ tự cột.'); return {rows, changes, errors};
    }
    const permitted = new Map(targets.map(target => [JSON.stringify([target.point, Number(target.trial)]), target]));
    const seen = new Set();
    lines.slice(1).forEach((line, index) => {
      const lineNo = index + 2, values = line.split('\t').map(s => s.trim());
      if (values.every(empty)) return;
      if (values.length !== expected.length) { fail(lineNo, '', `Cần ${expected.length} cột, hiện có ${values.length}. Giữ cả ô trống khi sao chép từ Excel.`); return; }
      const [point, trialText] = values, trial = Number(trialText), key = JSON.stringify([point, trial]);
      const target = permitted.get(key), row = {line: lineNo, point, trial: trialText, cells: []}; rows.push(row);
      if (forbidden(point) || !/^[1-9]\d*$/.test(trialText) || !target) { fail(lineNo, 'Điểm / Lần đo', 'Điểm hoặc lần đo không thuộc phạm vi biểu mẫu này.'); return; }
      if (seen.has(key)) { fail(lineNo, 'Điểm / Lần đo', 'Điểm và lần đo bị lặp. Giữ một dòng cho mỗi lần đo.'); return; }
      seen.add(key);
      columns.forEach((column, i) => {
        const value = values[i + 2], cell = {label: column.label, value, message: ''}; row.cells.push(cell);
        if (empty(value)) return;
        const error = message => { cell.message = message; fail(lineNo, column.label, message); };
        if (value.length > (column.type === 'number' ? 40 : 160)) return error('Nội dung quá dài.');
        if (/["\n\r\t]/.test(value)) return error('Ô chứa dấu nháy hoặc xuống dòng. Hãy nhập ô này trực tiếp trên biểu mẫu.');
        if (column.type === 'number') {
          const pattern = decimal === ',' ? /^[+-]?(?:\d+(?:,\d+)?|,\d+)$/ : /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
          if (!pattern.test(value) || !Number.isFinite(Number(value.replace(',', '.')))) return error(`Nhập số dùng dấu ${decimal === ',' ? 'phẩy' : 'chấm'} thập phân; không dùng dấu phân cách hàng nghìn.`);
        }
        if (column.type === 'date') {
          const time = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00Z') : null;
          if (!time || !Number.isFinite(time.getTime()) || time.toISOString().slice(0, 10) !== value) return error('Ngày cần đúng dạng năm-tháng-ngày, ví dụ 2026-10-02.');
        }
        const before = target.values?.[column.key];
        if (!empty(before)) {
          if (String(before) !== value) error('Ô đã có số liệu. Muốn sửa, dùng “Thay đổi” tại điểm đo trên biểu mẫu.');
          return;
        }
        if (target.editable?.[column.key] === false) return error(target.reasons?.[column.key] || 'Ô đang khóa. Mở điểm và chọn “Tiếp tục” để bổ sung ô trống.');
        changes.push({point, trial, key: column.key, value});
      });
    });
    return {rows, changes: errors.length ? [] : changes, errors};
  }
  const template = ({columns, targets}) => [headers(columns).join('\t'), ...targets.map(t => [t.point, t.trial, ...columns.map(() => '')].join('\t'))].join('\n');
  // Both adapters use this all-or-nothing patch, after recomputing their live context.
  function patch(data, context, changes, identity) {
    if (!context.allowed || context.identity !== identity) throw Error('Đợt, hồ sơ hoặc quyền nhập đã thay đổi. Mở lại bảng để kiểm tra.');
    const next = structuredClone(data), seen = new Set();
    for (const change of changes) {
      const target = context.targets.find(t => t.point === change.point && t.trial === change.trial);
      const column = context.columns.find(c => c.key === change.key), path = target?.paths?.[change.key];
      if (!column || !path?.length || path.some(forbidden) || target.editable?.[change.key] === false) throw Error('Ô nhập không còn được phép bổ sung.');
      const key = JSON.stringify(path); if (seen.has(key)) throw Error('Ô nhập bị lặp.'); seen.add(key);
      const before = path.reduce((value, part) => value?.[part], data);
      if (!empty(before)) throw Error('Ô đã có số liệu. Kiểm tra lại trước khi bổ sung.');
      let value = next;
      path.slice(0, -1).forEach((part, index) => {
        if (Array.isArray(value) && typeof part === 'number') while (value.length <= part) value.push({});
        value = value[part] ??= typeof path[index + 1] === 'number' ? [] : {};
      });
      value[path.at(-1)] = change.value;
    }
    return next;
  }
  let adapter, dialog, opener, preview, busy = false, openingIdentity = '';
  const $ = id => document.getElementById(id);
  const node = (tag, props = {}, children = []) => {
    const n = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => { if (key === 'text') n.textContent = value; else n.setAttribute(key, value); });
    n.append(...children); return n;
  };
  function refresh() { if (opener) opener.disabled = !adapter?.get().allowed; }
  function invalidate() { preview = null; $('entry-paste-apply').disabled = true; $('entry-paste-result').replaceChildren(); $('entry-paste-errors').replaceChildren(); $('entry-paste-status').textContent = 'Bấm “Kiểm tra bảng” sau khi nhập hoặc sửa số liệu.'; }
  function inspect() {
    const context = adapter.get();
    if (!context.allowed || context.identity !== openingIdentity) { invalidate(); $('entry-paste-status').textContent = 'Đợt, biểu mẫu hoặc số liệu đã đổi. Đóng và mở lại bảng để nhập đúng hồ sơ.'; return; }
    const text = $('entry-paste-text').value, decimal = $('entry-paste-decimal').value;
    const result = parse(text, {...context, decimal});
    preview = {identity: context.identity, text, decimal, result};
    $('entry-paste-errors').replaceChildren(...result.errors.map(e => node('li', {text: `Dòng ${e.line}${e.column ? ' · ' + e.column : ''}: ${e.message}`})));
    const table = node('table', {}, [node('caption', {text: 'Kiểm tra từng ô trước khi đưa vào biểu mẫu'}), node('thead', {}, [node('tr', {}, ['Dòng', 'Điểm', 'Lần đo', ...context.columns.map(c => c.label)].map(text => node('th', {scope: 'col', text})))]),
      node('tbody', {}, result.rows.map(row => node('tr', {}, [node('td', {text: String(row.line)}), node('th', {scope: 'row', text: row.point}), node('td', {text: row.trial}), ...row.cells.map(cell => node('td', {'class': cell.message ? 'paste-cell-error' : '', text: (cell.value || '—') + (cell.message ? ' — ' + cell.message : '')}))])))]);
    $('entry-paste-result').replaceChildren(table);
    $('entry-paste-apply').disabled = Boolean(result.errors.length || !result.changes.length);
    $('entry-paste-status').textContent = result.errors.length ? `${result.errors.length} lỗi. Sửa các ô được nêu dưới đây rồi kiểm tra lại.` : result.changes.length ? `${result.changes.length} ô trống sẽ được bổ sung. Chưa lưu lên hệ thống.` : 'Không có ô mới để bổ sung. Ô trống được bỏ qua; số liệu đã có được giữ nguyên.';
    if (result.errors.length) $('entry-paste-errors').focus();
  }
  async function apply() {
    if (busy || !preview || preview.result.errors.length || !preview.result.changes.length) return;
    const checked = preview; busy = true; $('entry-paste-apply').disabled = true;
    try {
      const before = adapter.get();
      if (!dialog.isConnected || !dialog.open || before.identity !== checked.identity) throw Error('Số liệu hoặc hồ sơ đã đổi. Đóng và mở lại bảng để kiểm tra.');
      if (typeof window.CPC1Backend?.refreshAccess !== 'function') throw Error('Chưa kiểm tra được quyền nhập. Mở lại hồ sơ rồi thử lại.');
      $('entry-paste-status').textContent = 'Đang kiểm tra quyền nhập…';
      await window.CPC1Backend.refreshAccess(before.system, 'archive-edit');
      const session = await window.CPC1Backend.getSession();
      if (!session?.user?.id || window.CPC1_SESSION_ENDED) throw Error('Phiên đăng nhập đã hết. Đăng nhập lại trước khi bổ sung số liệu.');
      const context = adapter.get();
      if (session.user.id !== context.userId) throw Error('Tài khoản đã đổi. Mở lại hồ sơ bằng tài khoản đang đăng nhập.');
      if (!dialog.isConnected || !dialog.open || preview !== checked || context.identity !== checked.identity) throw Error('Số liệu hoặc hồ sơ đã đổi. Đóng và mở lại bảng để kiểm tra.');
      if (!context.allowed) throw Error('Không còn quyền nhập hoặc hồ sơ đã khóa. Số liệu chưa được đưa vào biểu mẫu.');
      const result = parse(checked.text, {...context, decimal: checked.decimal});
      if (result.errors.length || JSON.stringify(result.changes) !== JSON.stringify(checked.result.changes)) throw Error('Ô nhập đã thay đổi. Bấm “Kiểm tra bảng” để xem lại.');
      adapter.apply(result.changes, checked.identity);
      dialog.close(); $('entry-paste-text').value = ''; preview = null;
      $('entry-paste-summary').textContent = `Đã bổ sung ${result.changes.length} ô vào biểu mẫu. Kiểm tra số liệu rồi bấm Lưu hồ sơ.`;
    } catch (error) { const status = $('entry-paste-status'); if (dialog.isConnected && dialog.open && status) status.textContent = error.message; }
    finally { busy = false; refresh(); }
  }
  function attach(next) {
    adapter = next;
    if (dialog) { refresh(); return; }
    opener = node('button', {id: 'entry-paste-open', type: 'button', text: 'Dán bảng từ Excel'});
    const host = node('div', {class: 'entry-paste-launch'}, [opener, node('p', {id: 'entry-paste-summary', role: 'status', 'aria-live': 'polite'})]);
    document.querySelector('.action-bar,.actionbar').after(host);
    dialog = node('dialog', {id: 'entry-paste-dialog', class: 'entry-paste-dialog', 'aria-labelledby': 'entry-paste-title'});
    dialog.append(node('div', {class: 'paste-heading'}, [node('h2', {id: 'entry-paste-title', text: 'Dán số liệu từ Excel'}), node('button', {id: 'entry-paste-close', type: 'button', text: 'Đóng'})]),
      node('p', {id: 'entry-paste-scope'}), node('p', {id: 'entry-paste-help', text: 'Dùng bảng mẫu để lấy đúng tên cột. Sao chép cả tiêu đề và các dòng trong Excel rồi dán vào đây. Chỉ bổ sung ô trống; ô đã có số liệu được giữ nguyên.'}),
      node('div', {class: 'paste-options'}, [node('button', {id: 'entry-paste-template', type: 'button', text: 'Dùng bảng mẫu'}), node('label', {for: 'entry-paste-decimal', text: 'Dấu thập phân'}), node('select', {id: 'entry-paste-decimal'}, [node('option', {value: ',', text: 'Dấu phẩy — 12,5'}), node('option', {value: '.', text: 'Dấu chấm — 12.5'})])]),
      node('label', {for: 'entry-paste-text', text: 'Bảng số liệu'}), node('textarea', {id: 'entry-paste-text', rows: '7', maxlength: '1048576', spellcheck: 'false', 'aria-describedby': 'entry-paste-help'}),
      node('p', {class: 'paste-help', text: 'Không dùng dấu phân cách hàng nghìn. Ngày nhập theo năm-tháng-ngày (2026-10-02). Ô trống không phải số 0.'}),
      node('button', {id: 'entry-paste-preview', type: 'button', text: 'Kiểm tra bảng'}), node('p', {id: 'entry-paste-status', role: 'status', 'aria-live': 'polite'}),
      node('ul', {id: 'entry-paste-errors', tabindex: '-1', 'aria-label': 'Các ô cần sửa'}), node('div', {id: 'entry-paste-result', class: 'paste-table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Bảng xem trước, cuộn ngang để xem đủ cột'}),
      node('div', {class: 'paste-actions'}, [node('button', {id: 'entry-paste-apply', type: 'button', class: 'primary', disabled: '', text: 'Đưa vào biểu mẫu'})]));
    document.body.append(dialog);
    opener.onclick = () => { const context = adapter.get(); if (!context.allowed) { refresh(); return; } openingIdentity = context.identity; $('entry-paste-scope').textContent = context.title; $('entry-paste-text').value = ''; invalidate(); dialog.showModal(); $('entry-paste-text').focus(); };
    $('entry-paste-close').onclick = () => dialog.close();
    dialog.addEventListener('close', () => { preview = null; $('entry-paste-text').value = ''; $('entry-paste-result').replaceChildren(); $('entry-paste-errors').replaceChildren(); opener.focus(); });
    $('entry-paste-template').onclick = () => { if ($('entry-paste-text').value && !window.confirm('Thay bảng đang nhập bằng bảng mẫu trống?')) return; $('entry-paste-text').value = template(adapter.get()); invalidate(); $('entry-paste-text').focus(); $('entry-paste-text').select(); };
    $('entry-paste-text').addEventListener('input', invalidate); $('entry-paste-decimal').addEventListener('change', invalidate);
    $('entry-paste-preview').onclick = inspect; $('entry-paste-apply').onclick = apply;
    window.addEventListener('cpc1:entry-change', refresh);
    window.CPC1Backend?.onSessionChange?.((event, session) => { if (event === 'SIGNED_OUT' || (session?.user?.id && session.user.id !== adapter.get().userId)) { dialog.close(); opener.disabled = true; } else refresh(); });
    refresh();
  }
  window.CPC1EntryPaste = Object.freeze({parse, template, patch, attach, refresh});
})();

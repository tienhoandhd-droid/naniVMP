/* Kiểm hợp lệ ĐẦU VÀO trước khi lưu (khí nén, nitơ, hơi). Không đánh giá tiêu chí đạt/không đạt:
   giới hạn, công thức và kết luận vẫn do máy chủ quyết định. Kiểu trường lấy từ đơn vị trong cấu hình. */
(() => {
  'use strict';
  const THOUSAND = 'Số dễ nhầm hàng nghìn — gõ 4000 hoặc 4,0';
  // Thông báo tại ô giữ ngắn (một dòng ở bề rộng ô máy tính bảng) để hiện lỗi không đẩy bố cục.
  const SOFT_ENDOTOXIN = 'Chưa chấm được — cần QA quyết cách ghi; chưa ký.';
  const MIN_DATE = '2020-01-01', MAX_DEADLINE = '2099-12-31';
  const blank = value => value == null || String(value).trim() === '';
  const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const today = () => iso(new Date());
  const addDay = day => { const date = new Date(day + 'T12:00:00'); date.setDate(date.getDate() + 1); return iso(date); };
  const vn = day => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
  // "4.000", "1,500", "-2,000": phần nguyên khác 0 và đúng 3 chữ số sau dấu — người đọc không biết là 4 hay 4000.
  function thousandAmbiguous(text) {
    const match = /^[+-]?(\d+)[.,](\d{3})$/.exec(String(text ?? '').trim());
    return Boolean(match) && Number(match[1]) !== 0;
  }
  // Chủ dự án miễn luật hàng nghìn cho khối lượng (kg, ví dụ 1,311) và độ dẫn điện (µS/cm).
  const thousandExempt = spec => /^(kg|[µμ]S\/cm)$/i.test(String(spec.unit || '').trim());
  function kind(spec = {}) {
    const unit = String(spec.unit || '');
    return { count: /hạt|CFU/i.test(unit), percent: unit.trim() === '%', signed: unit.includes('°C') };
  }
  // Ngày hạn (hạn hiệu chuẩn, hạn dùng, đánh giá kế tiếp) được phép ở tương lai; ngày đo thì không.
  const deadline = spec => /expiry|_due$|^next_/.test(String(spec.key || '')) || /^Hạn|kế tiếp|tiếp theo/i.test(String(spec.label || ''));
  function dateBounds(spec = {}, options = {}) {
    return { min: MIN_DATE, max: deadline(spec) ? MAX_DEADLINE : addDay(options.today || today()) };
  }
  function checkNumber(text, spec) {
    if (/^[<>≤≥]/.test(text)) return 'Nhập số đo được, không nhập dấu so sánh như <1.';
    if (/^[+-]?(\d+([.,]\d+)?|[.,]\d+)[eE][+-]?\d+$/.test(text)) return 'Không dùng số mũ như 1e3 — gõ số đầy đủ.';
    if (!/^[+-]?(\d+([.,]\d+)?|[.,]\d+)$/.test(text)) return 'Nhập một số, ví dụ 12 hoặc 12,5.';
    if (thousandAmbiguous(text) && !thousandExempt(spec)) return THOUSAND;
    const number = Number(text.replace(',', '.')), type = kind(spec);
    if (!Number.isFinite(number)) return 'Nhập một số, ví dụ 12 hoặc 12,5.';
    if (number < 0 && !type.signed) return 'Trường này không nhận số âm.';
    if (type.count && !Number.isInteger(number)) return 'Số đếm phải là số nguyên.';
    if (type.percent && (number < 0 || number > 100)) return 'Phần trăm phải từ 0 đến 100.';
    return '';
  }
  function checkDate(text, spec, options) {
    const time = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(text + 'T00:00:00Z') : null;
    if (!time || !Number.isFinite(time.getTime()) || time.toISOString().slice(0, 10) !== text) return 'Ngày không hợp lệ — chọn lại trên lịch.';
    const bounds = dateBounds(spec, options);
    if (text < bounds.min) return `Ngày phải từ ${vn(bounds.min)} trở đi.`;
    if (text > bounds.max) return `Ngày đo không được sau ngày ${vn(bounds.max)}.`;
    return '';
  }
  function check(value, spec = {}, options = {}) {
    if (blank(value)) return '';
    const text = String(value).trim();
    // Vi sinh ghi "không phát hiện" bằng chữ (KPH/KFH) như khí nén đang nhận.
    if (spec.notDetected && /^(KPH|KFH)$/i.test(text)) return '';
    if (spec.type === 'number') return checkNumber(text, spec);
    // Ô chữ có đơn vị đếm (vi sinh khí nén/nitơ CFU/m³): KPH/KFH hoặc số nguyên không âm — khớp máy chủ.
    if (spec.type === 'text' && kind(spec).count) return /^(KPH|KFH)$/i.test(text) ? '' : checkNumber(text, spec);
    if (spec.type === 'date') return checkDate(text, spec, options);
    return '';
  }
  // Nội độc tố (EU/mL): chủ dự án chưa quyết cách ghi gel-clot nên chỉ cảnh báo mềm, không chặn Lưu.
  const soft = (spec = {}) => /EU\/mL/i.test(String(spec.unit || '')) || spec.key === 'endotoxin';
  // Người thực hiện + thời gian do máy chủ tự ghi lúc lưu (tên tài khoản, giờ lưu đầu) — không nhập tay.
  // Trả 'name' | 'time' | '' theo đường dẫn dữ liệu (hơi: bm01–bm04 từng lần đo và phần tổng hợp; khí: từng điểm và chứng dương).
  function autoField(path) {
    const parts = (path || []).map(String), key = parts.at(-1);
    const steamRow = /^bm0[1-4]$/.test(parts[0]) && (parts.length === 3 || parts.length === 4) && ['executor', 'date'].includes(key);
    const gasRow = parts[0] === 'forms' && parts.length === 4 && ['executed_by', 'execution_date', 'result_date'].includes(key);
    const controls = parts[0] === 'controls' && parts.length === 2 && ['executed_by', 'result_date'].includes(key);
    const steamMeta = parts[0] === 'meta' && parts.length === 2 && ['executed_by', 'execution_date'].includes(key);
    if (!steamRow && !gasRow && !controls && !steamMeta) return '';
    return ['executor', 'executed_by'].includes(key) ? 'name' : 'time';
  }
  // Giờ lưu "2026-10-26T09:42:05+07:00" → "26/10/2026 09:42"; ngày cũ nhập tay "2026-09-27" → "27/09/2026".
  function stampText(value) {
    const text = String(value ?? '');
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(text);
    if (!match) return text;
    return `${match[3]}/${match[2]}/${match[1]}${match[4] ? ` ${match[4]}:${match[5]}` : ''}`;
  }
  function checkAll(entries, options = {}) {
    return entries.filter(entry => !autoField(entry.path)).flatMap(entry => { const message = check(entry.value, entry.spec, options); return message ? [{ path: entry.path, message, spec: entry.spec, soft: soft(entry.spec) }] : []; });
  }
  const blocking = problems => problems.filter(problem => !problem.soft);
  // Trước khi gửi lưu: cắt khoảng trắng đầu/cuối mọi ô; ô chỉ có khoảng trắng thành ô trống. Trả bản sao.
  function trimAll(value) {
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return value.map(trimAll);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, trimAll(item)]));
    return value;
  }
  function sentence(text) {
    const value = String(text ?? '').trim();
    return !value ? '' : /[.!?…]$/.test(value) ? value : value + '.';
  }
  // Lỗi chặn của máy chủ (PT422: details = JSON {code, issues:[{path, reason}]}); cũng nhận {paths|cells|fields|errors} (mảng đường dẫn hoặc {path, reason|message}).
  function serverProblems(error) {
    const cells = [], fallback = String(error?.message || 'Máy chủ từ chối lưu.');
    const add = (path, message) => { if ((Array.isArray(path) && path.length) || (typeof path === 'string' && path)) cells.push({ path, message: String(message || fallback) }); };
    const visit = value => {
      if (typeof value === 'string') {
        if (!/^\s*[[{]/.test(value)) return;
        try { value = JSON.parse(value); } catch (parseError) { console.warn('Không đọc được danh sách ô từ máy chủ:', parseError.message); return; }
      }
      if (Array.isArray(value)) { value.forEach(item => Array.isArray(item) || typeof item === 'string' ? add(item) : item && typeof item === 'object' && add(item.path, item.reason || item.message)); return; }
      if (value && typeof value === 'object') for (const key of ['paths', 'cells', 'issues', 'fields', 'errors']) if (key in value) visit(value[key]);
    };
    for (const key of ['paths', 'cells', 'issues', 'fields', 'errors', 'details']) if (error && key in error) visit(error[key]);
    // Câu máy chủ dạng "… Ô forms › bm04 › E1.R1-C1 › microbial: lý do": tách đường dẫn ra, không bao giờ hiện chuỗi kỹ thuật.
    const tail = /\s*Ô ([^:]+ › [^:]+): (.+)$/.exec(fallback);
    if (!tail) return { message: fallback, cells };
    if (!cells.length) cells.push({ path: tail[1].split(' › '), message: tail[2].trim() });
    return { message: fallback.slice(0, tail.index).trim(), cells };
  }

  // ---- Hiển thị tại ô. Trang cung cấp locate(path)->input|null, label(path)->chữ, go(path) để mở đúng điểm. ----
  const $ = id => document.getElementById(id);
  const node = (tag, props = {}, children = []) => { const n = document.createElement(tag); Object.entries(props).forEach(([key, value]) => { if (key === 'text') n.textContent = value; else if (key.startsWith('on')) n.addEventListener(key.slice(2), value); else n.setAttribute(key, value); }); n.append(...children); return n; };
  function countText(box) {
    const left = box.querySelectorAll('li').length;
    let count = box.querySelector('.error-count');
    if (!count) { count = node('p', { class: 'error-count' }); box.querySelector('h2')?.after(count); }
    count.textContent = `Còn ${left} ô cần sửa.`;
    if (!left) { box.hidden = true; box.replaceChildren(); }
  }
  function markInput(input, message) {
    input.setAttribute('aria-invalid', 'true');
    const error = $(input.id + '-error'); if (error) { error.textContent = message; error.title = message; }
  }
  function show(problems, { locate, label, go }) {
    const box = $('error-summary'); if (!box || !problems.length) return null;
    const list = node('ul');
    let first = null;
    for (const problem of problems) {
      const input = locate(problem.path);
      if (input) { markInput(input, problem.message); first ||= input; }
      const text = `${label(problem.path)}: ${problem.message}`;
      const link = input ? node('a', { href: '#' + input.id, text, onclick: event => { event.preventDefault(); input.focus(); } }) : node('a', { href: '#form-body', text, onclick: event => { event.preventDefault(); go(problem.path); } });
      list.append(node('li', { 'data-path': JSON.stringify(problem.path) }, [link]));
    }
    box.replaceChildren(node('h2', { text: 'Cần kiểm tra lại dữ liệu' }), list); box.hidden = false; countText(box);
    if (first) { first.focus({ preventScroll: true }); first.scrollIntoView({ block: 'center' }); } else box.focus();
    return first;
  }
  // Gõ vào một ô chỉ xoá lỗi của ô đó; hộp tóm tắt giữ các lỗi còn lại.
  function clearField(input) {
    if (!input?.id) return;
    input.removeAttribute('aria-invalid');
    const error = $(input.id + '-error'); if (error) error.textContent = '';
    const box = $('error-summary');
    if (!box || box.hidden) return;
    const link = box.querySelector(`a[href="#${CSS.escape(input.id)}"]`);
    if (!link) return;
    link.closest('li').remove(); countText(box);
  }
  // Kiểm ngay khi rời ô (sự kiện change) để thông báo nằm cạnh ô, trước cả khi bấm Lưu.
  function watch(input, spec) {
    if (spec.type === 'date') { const bounds = dateBounds(spec); input.min = bounds.min; input.max = bounds.max; }
    input.addEventListener('input', () => clearField(input));
    input.addEventListener('change', () => {
      const message = check(input.value, spec); if (!message) return;
      if (!soft(spec)) { markInput(input, message); return; }
      const warning = $(input.id + '-error'); if (warning) { warning.textContent = SOFT_ENDOTOXIN; warning.title = `${message} ${SOFT_ENDOTOXIN}`; }
    });
  }
  const clock = () => new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  // Trạng thái lưu 3 bước trên thanh công cụ: Đang lưu… → Đã lưu lúc HH:MM → lỗi kèm “Thử lại”.
  function saveStatus(stage, { version, retry } = {}) {
    const state = $('record-state'); if (!state) return;
    state.setAttribute('role', 'status'); state.dataset.saveState = stage;
    state.textContent = stage === 'saving' ? 'Đang lưu…' : stage === 'saved' ? `Đã lưu lúc ${clock()} · phiên bản ${version}` : stage === 'blocked' ? 'Chưa lưu — còn ô nhập sai' : 'Chưa lưu — lỗi khi lưu';
    let button = $('record-save-retry');
    if (!button && stage === 'error') { button = node('button', { id: 'record-save-retry', type: 'button', class: 'button secondary save-retry', text: 'Thử lại' }); state.after(button); }
    if (button) { button.hidden = stage !== 'error'; if (retry) button.onclick = retry; }
  }
  window.CPC1EntryChecks = Object.freeze({ autoField, stampText, THOUSAND, SOFT_ENDOTOXIN, soft, blocking, trimAll, thousandAmbiguous, thousandExempt, kind, dateBounds, check, checkAll, sentence, serverProblems, today, show, clearField, watch, saveStatus });
})();

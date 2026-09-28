/* Presentation of legacy flattened DOCX labels only. Never change point IDs/config/payloads. */
(() => {
  'use strict';
  // Exact English phrase starts observed in the issued appendices. Find the first
  // phrase only so an English-only label such as SVP Filling Room is not split.
  const english = /Compressed air tank\b|Compressed Air Room\b|Disinfectant Cleaning Solution Mixing Room\b|BFS Weiler Machine\b|BFS Rommelag(?: 1)?\b|BFS Romelag\b|\d+L (?:mixing|store) Tank\b|Connector board\b|(?:SMS|EMS) Room\b|(?:SVP|LVP|Capsule) Filling (?:Room|Machine)\b|Filling Room\b|Wash Room\b|WASH THE BOTTLE\b|Dispensary(?: Room)?\b|Tank\s+[123]\s*\(SMS Room\)|Fermenting\b|Concentrate room\b|B\d+ Factory\b|After nitrogen gas store tank\b|Clean Store\b|Inspection & Packaging Area\b/;
  function separateLanguages(part) {
    const match = english.exec(part);
    if (!match || !match.index) return part;
    const prefix = part.slice(0, match.index).trimEnd();
    return /[—/]$/.test(prefix) ? part : `${prefix} / ${part.slice(match.index)}`;
  }
  function name(point) {
    const raw = typeof point?.name === 'string' ? point.name.trim() : '';
    if (!raw || raw === point?.id) return 'Chưa có tên điểm trong cấu hình';
    return raw.split('·').map(part => part
      .replace(/\s+/gu, ' ').trim()
      // Appendix room codes were followed by a paragraph or a Word line break.
      .replace(/\b([A-Z]\d+\.[A-Z]\d+)\s*(?=\p{L})/gu, '$1 — ')
      .replace(/(\d)\(SMS\b/g, '$1 (SMS')
    ).filter(Boolean).map(separateLanguages).join(' · ');
  }
  function label(point) {
    return point ? `${point.id} — ${name(point)}` : 'Biểu mẫu không có điểm lấy mẫu';
  }
  function select(point, fallback) {
    const target = document.querySelector('.selected-point');
    if (target) target.textContent = point ? label(point) : (fallback || label(null));
  }
  window.CPC1PointLabels = Object.freeze({name,label,select});
})();

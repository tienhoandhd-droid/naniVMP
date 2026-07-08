/**
 * VMP — Apps Script đồng bộ tức thì Google Sheet -> n8n -> Supabase.
 * Gắn với Sheet "6.Timeline VMP". Gọi webhook WF-04 sau khi NGỪNG sửa ~5 giây
 * (debounce ĐUÔI thật sự — bản cũ dùng throttle "leading" nên bỏ sót các ô sửa cuối).
 *
 * CÁCH DÙNG (làm 1 lần):
 *   1. Dán file này vào Extensions -> Apps Script.
 *   2. Chọn hàm setupTrigger -> Run  (cấp quyền khi được hỏi).  <-- BẮT BUỘC
 *   3. Chọn hàm testPing -> Run, xem Log phải hiện "HTTP 200".
 *   Từ đó mỗi lần sửa ô, sau ~5s ngừng gõ sẽ tự sync.
 *
 * LƯU Ý: onEditVmp phải chạy bằng trigger CÀI ĐẶT (installable) do setupTrigger tạo —
 * trigger onEdit "đơn giản" KHÔNG gọi được UrlFetchApp (ra ngoài Internet).
 */

const N8N_WEBHOOK_URL  = 'https://n8n.cpc1hn.com/webhook/vmp-sheet-changed';
const AUTH_HEADER_NAME = 'x-vmp-sync-token';
const VMP_SYNC_TOKEN   = 'tienhoan2025';
const DEBOUNCE_SECONDS = 5;      // fire SAU khi ngừng sửa ngần này giây
const MIN_GAP_SECONDS  = 3;      // chặn spam: 2 lần sync thật cách nhau tối thiểu

function ping_(reason) {
  const res = UrlFetchApp.fetch(N8N_WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { [AUTH_HEADER_NAME]: VMP_SYNC_TOKEN },
    payload: JSON.stringify({ source: 'apps-script', reason: reason, ts: new Date().toISOString() }),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  console.log('n8n webhook -> HTTP ' + code + ' ' + res.getContentText());
  return code;
}

/**
 * Debounce ĐUÔI: mỗi lần sửa ghi mốc "sửa gần nhất" rồi ngủ DEBOUNCE_SECONDS.
 * Nếu trong lúc ngủ có lần sửa MỚI hơn (mốc đổi) -> lần này nhường cho lần mới.
 * => Chỉ lần sửa CUỐI (không có sửa nào sau 5s) mới thật sự gọi sync
 *    -> luôn chụp đúng trạng thái cuối cùng của Sheet.
 */
function onEditVmp(e) {
  const props = PropertiesService.getScriptProperties();
  const myMark = String(Date.now()) + '-' + Math.floor(Math.random() * 1e6);
  props.setProperty('last_edit_mark', myMark);

  Utilities.sleep(DEBOUNCE_SECONDS * 1000);

  // Có lần sửa mới hơn chen vào trong lúc chờ -> để lần đó xử lý, mình rút lui.
  if (props.getProperty('last_edit_mark') !== myMark) return;

  // Chặn spam: nếu vừa sync xong trong MIN_GAP_SECONDS thì thôi.
  const now = Date.now();
  const lastSync = Number(props.getProperty('last_sync_ms') || 0);
  if (now - lastSync < MIN_GAP_SECONDS * 1000) return;

  props.setProperty('last_sync_ms', String(now));
  ping_('edit-settled');
}

/** TEST TAY: chọn hàm này -> Run. Log phải hiện "HTTP 200". */
function testPing() { ping_('manual-test'); }

/** Chạy 1 lần để cài trigger onEdit CÀI ĐẶT sạch (xoá trigger cũ trước). */
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onEditVmp') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onEditVmp')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
  console.log('Đã cài trigger onEdit -> onEditVmp (installable).');
}

/** Kiểm tra nhanh: liệt kê trigger đang có. */
function listTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    console.log(t.getHandlerFunction() + ' | ' + t.getEventType() + ' | ' + t.getTriggerSource());
  });
}

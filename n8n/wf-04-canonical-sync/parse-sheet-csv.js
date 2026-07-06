const input = $input.first().json || {};
const csvText = String(input.data ?? input.body ?? input.csv ?? '').replace(/^\uFEFF/, '');

if (!csvText) {
  throw new Error('VMP_SYNC_EMPTY_CSV: Google Sheet CSV response is empty');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }

  if (quoted) throw new Error('VMP_SYNC_INVALID_CSV: unclosed quoted cell');
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const parsed = parseCsv(csvText);
while (parsed.length && parsed[parsed.length - 1].every((value) => value === '')) parsed.pop();

if (parsed.length < 2) throw new Error('VMP_SYNC_INVALID_CSV: no data rows');

// Supabase canonical dùng ĐÚNG 37 cột đầu. Sheet có thể có cột phụ ở cuối (vd
// cột 38 "Không có thẩm định thực tế và hoàn thiện hồ sơ") — bỏ khi đồng bộ để
// không phải đổi schema Supabase; các cột 0..36 (gồm 4 cột trạng thái) giữ nguyên.
const CANON = 37;
const rawHeaders = parsed[0];
if (rawHeaders.length !== 37 && rawHeaders.length !== 38) {
  throw new Error(`VMP_SYNC_INVALID_HEADERS: expected 37 or 38 columns, received ${rawHeaders.length}`);
}
const headers = rawHeaders.slice(0, CANON);

const norm = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const requiredHeaders = new Map([
  [3, 'mã đối tượng'],
  [16, 'id thẩm định'],
  [21, 'thời hạn hoàn thành đề cương'],
  [25, 'thời hạn kết thúc thẩm định thực tế (t-5-bc)'],
  [30, 'thời hạn báo cáo (t-5 ngày)'],
  [33, 'thời hạn hoàn thành (t) [deadline vmp]'],
  [35, 'trạng thái vmp'],
]);

for (const [index, expected] of requiredHeaders) {
  if (norm(headers[index]) !== expected) {
    throw new Error(
      `VMP_SYNC_HEADER_DRIFT: column ${index + 1} expected "${expected}", received "${headers[index]}"`,
    );
  }
}

const rows = parsed.slice(1).map((values, index) => {
  if (values.length > 38) {
    throw new Error(`VMP_SYNC_ROW_WIDTH: Sheet row ${index + 2} has ${values.length} columns`);
  }
  const trimmed = values.slice(0, CANON);
  const padded = [...trimmed, ...Array(CANON - trimmed.length).fill('')];
  return { row_number: index + 2, values: padded };
});

const ids = rows.map((row) => String(row.values[16] ?? '').trim());
const codes = rows.map((row) => String(row.values[3] ?? '').trim());
if (ids.some((id) => !id) || codes.some((code) => !code)) {
  throw new Error('VMP_SYNC_REQUIRED_KEY: every Sheet row must have object code and validation ID');
}

const uniqueIds = new Set(ids);
const uniqueObjects = new Set(codes);
if (rows.length < 450 || uniqueIds.size < 450 || uniqueObjects.size < 200) {
  throw new Error(
    `VMP_SYNC_CARDINALITY_GUARD: rows=${rows.length}, uniqueIds=${uniqueIds.size}, objects=${uniqueObjects.size}`,
  );
}

const payload = JSON.stringify({ headers, rows });
return [{
  json: {
    payload_b64: Buffer.from(payload, 'utf8').toString('base64'),
    source_rows: rows.length,
    unique_validation_ids: uniqueIds.size,
    objects_in_sheet: uniqueObjects.size,
    duplicate_validation_ids: rows.length - uniqueIds.size,
  },
}];

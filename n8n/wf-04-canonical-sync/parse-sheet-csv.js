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

// Supabase canonical dùng ĐÚNG 37 cột theo schema ban đầu. Sheet vận hành có
// thể thêm cột phụ ở cuối hoặc chen giữa (vd "Bộ phận thực hiện thẩm định").
// Vì vậy không slice theo vị trí tuyệt đối của Sheet nữa; map theo tiêu đề để
// giữ đúng 37 giá trị canonical trước khi gọi RPC.
const CANON = 37;
const rawHeaders = parsed[0];
const norm = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

const CANON_HEADER_NORMS = [
  'stt',
  'phân loại đối tượng',
  'loại thẩm định',
  'mã đối tượng',
  'tên đối tượng',
  'bộ phận quản lý',
  'mã khu vực',
  'line',
  'tình trạng',
  'show',
  'thẩm định',
  'tần suất thẩm định (tháng)',
  'năm nhập',
  'phân loại báo cáo',
  'số ngày công thẩm định thực tế',
  'điểm trọng yếu',
  'id thẩm định',
  'qa phụ trách (qa nhập)',
  'email (qa nhập)',
  'nhân sự bộ phận khác (bộ phận khác nhập)',
  'email (bộ phận khác nhập)',
  'thời hạn hoàn thành đề cương',
  'thời gian thực tế hoàn thành đề cương',
  'trạng thái đề cương',
  'thời hạn bắt đầu thẩm định thực tế',
  'thời hạn kết thúc thẩm định thực tế (t-5-bc)',
  'bộ phận quản lý xếp lịch thẩm định (dd/mm/yyyy hh:mm:ss)',
  'thời gian thực tế hoàn thành thẩm định thực tế',
  'trạng thái thẩm định thực tế',
  'phân loại báo cáo',
  'thời hạn báo cáo (t-5 ngày)',
  'thời gian thực tế hoàn thành báo cáo',
  'trạng thái báo cáo',
  'thời hạn hoàn thành (t) [deadline vmp]',
  'thời gian thực tế deadline vmp',
  'trạng thái vmp',
  'không có (x)/ không rõ',
];

const normalizedHeaders = rawHeaders.map(norm);
const extraIndexes = {
  execution_department: normalizedHeaders.findIndex((header) => header === 'bộ phận thực hiện thẩm định'),
};
const usedHeaderIndexes = new Set();
const canonicalIndexes = CANON_HEADER_NORMS.map((expected, canonIndex) => {
  const sheetIndex = normalizedHeaders.findIndex((header, index) => header === expected && !usedHeaderIndexes.has(index));
  if (sheetIndex < 0) {
    throw new Error(`VMP_SYNC_HEADER_DRIFT: missing canonical column ${canonIndex + 1} "${expected}"`);
  }
  usedHeaderIndexes.add(sheetIndex);
  return sheetIndex;
});

const headers = canonicalIndexes.map((sheetIndex) => rawHeaders[sheetIndex]);

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
    throw new Error(`VMP_SYNC_HEADER_DRIFT: canonical column ${index + 1} expected "${expected}", received "${headers[index]}"`);
  }
}

const rows = parsed.slice(1).map((values, index) => {
  if (values.length > rawHeaders.length) {
    throw new Error(`VMP_SYNC_ROW_WIDTH: Sheet row ${index + 2} has ${values.length} columns, headers have ${rawHeaders.length}`);
  }
  return {
    row_number: index + 2,
    values: canonicalIndexes.map((sheetIndex) => values[sheetIndex] ?? ''),
    extra: {
      execution_department: extraIndexes.execution_department >= 0 ? (values[extraIndexes.execution_department] ?? '') : '',
    },
  };
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

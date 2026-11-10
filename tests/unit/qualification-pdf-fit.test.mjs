import test from 'node:test';
import assert from 'node:assert/strict';
import { fitTextSize, resultMinScale } from '../../src/features/qualification/pdf.js';

// C4 vòng 2 (10/11): ô số kết quả (print_result) co chữ từng bước tới tối thiểu 75% cỡ gốc khi
// chuỗi dài hơn ô (vd. độ khô "0.9495" ở ô BM03 rộng 35 pt); ô khác giữ cỡ gốc; quá 75% vẫn báo lỗi.
// Font giả: mỗi ký tự rộng 0,55 × cỡ chữ (gần Times 13: "0.9495" ≈ 35,8 pt như đo trên mẫu thật).
const font = { widthOfTextAtSize: (t, s) => t.length * 0.55 * s };
const op = { size: 13, rect: [0, 0, 39, 20] }, inner = { width: 35, height: 16 };

test('ô kết quả số: "0.97" giữ cỡ gốc 13', () => {
  assert.equal(fitTextSize('0.97', font, op, inner, 0.75).size, 13);
});
test('ô kết quả số: "0.9495"/"0.9496" co xuống cỡ vừa ô, không cắt chuỗi', () => {
  for (const s of ['0.9495', '0.9496']) {
    const fit = fitTextSize(s, font, op, inner, 0.75);
    assert.ok(fit && fit.size < 13 && fit.size >= 13 * 0.75, s + ' → ' + fit?.size);
    assert.deepEqual(fit.lines, [s]);
    assert.ok(font.widthOfTextAtSize(s, fit.size) <= inner.width);
  }
});
test('chuỗi quá dài so với 75% cỡ gốc vẫn không vừa (giữ báo lỗi cũ)', () => {
  assert.equal(fitTextSize('0.95000000001', font, op, inner, 0.75), null);
});
test('ô không phải kết quả số không được co chữ', () => {
  assert.equal(fitTextSize('0.9495', font, op, inner, 1), null);
  assert.equal(resultMinScale({ type: 'computed', key: 'result' }), 0.75);
  assert.equal(resultMinScale({ type: 'computed', key: 'latent' }), 1);
  assert.equal(resultMinScale({ type: 'row', key: 'result' }), 1);
  assert.equal(resultMinScale(undefined), 1);
});

test('mẫu in khí: ô kết quả số dùng cùng cơ chế co chữ (khoảng dòng gốc 100)', () => {
  const fit = fitTextSize('12.345679', { widthOfTextAtSize: (t, s) => t.length * 0.5 * s }, { size: 13 }, { width: 52, height: 20 }, 0.75, 100);
  assert.ok(fit && fit.size < 13 && fit.lh === fit.size, String(fit?.size));
});

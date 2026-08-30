/* =====================================================================
 *  tao-lacquer-grain.mjs — sinh tile hạt "sơn mài" cho lớp Ground
 *  ---------------------------------------------------------------------
 *  Chạy: node scripts/tao-lacquer-grain.mjs
 *  Ghi:  src/assets/art/lacquer-grain.png (RGBA 96×96, lặp không thấy mối)
 *
 *  Hiến pháp Atelier §1: Ground = canvas men sứ, texture CỰC MỜ. Tile này
 *  phần lớn trong suốt; ~7% điểm ảnh là hạt đen/trắng với alpha 6–12/255
 *  — đủ cho bề mặt có "thớ" khi nhìn màn lớn, không bao giờ tranh chữ.
 *  Alpha nướng thẳng vào file nên sáng/tối dùng chung một tile.
 *
 *  Không cần thư viện: PNG = chữ ký + IHDR + IDAT (zlib) + IEND, và Node
 *  có sẵn zlib. Seed cố định để mỗi lần sinh ra đúng một file — diff git
 *  không đổi khi không ai đổi tham số.
 * ===================================================================== */
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const KICH_THUOC = 96;

/* PRNG có seed (mulberry32) — Math.random thì mỗi lần chạy một file khác. */
function taoNgauNhien(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = taoNgauNhien(20260815);

/* Dữ liệu ảnh: mỗi hàng bắt đầu bằng byte filter 0, sau đó RGBA. */
const dong = [];
for (let y = 0; y < KICH_THUOC; y += 1) {
  const hang = Buffer.alloc(1 + KICH_THUOC * 4);
  for (let x = 0; x < KICH_THUOC; x += 1) {
    const o = 1 + x * 4;
    const r = rnd();
    if (r < 0.035) {          // hạt tối
      hang[o] = 20; hang[o + 1] = 12; hang[o + 2] = 22;
      hang[o + 3] = 6 + Math.floor(rnd() * 7);
    } else if (r < 0.07) {    // hạt sáng (ánh xà cừ)
      hang[o] = 255; hang[o + 1] = 250; hang[o + 2] = 244;
      hang[o + 3] = 6 + Math.floor(rnd() * 7);
    }                          // còn lại: trong suốt hoàn toàn
  }
  dong.push(hang);
}

const crcBang = (() => {
  const b = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    b[n] = c;
  }
  return b;
})();
const crc32 = (buf) => {
  let c = -1;
  for (const byte of buf) c = crcBang[(c ^ byte) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

function chunk(loai, thanDuLieu) {
  const ten = Buffer.from(loai, "ascii");
  const dai = Buffer.alloc(4);
  dai.writeUInt32BE(thanDuLieu.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([ten, thanDuLieu])));
  return Buffer.concat([dai, ten, thanDuLieu, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(KICH_THUOC, 0);
ihdr.writeUInt32BE(KICH_THUOC, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 6;   // màu: RGBA
// ihdr[10..12] = 0: nén/filter/interlace mặc định

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(Buffer.concat(dong), { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const dich = fileURLToPath(new URL("../src/assets/art/lacquer-grain.png", import.meta.url));
writeFileSync(dich, png);
console.log(`da ghi ${dich} (${png.length} byte)`);
